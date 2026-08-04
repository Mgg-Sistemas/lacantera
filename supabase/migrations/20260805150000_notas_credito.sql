-- ============================================================================
-- Notas de crédito
--
-- Hasta aquí, corregir una factura de venta era anularla. Eso funciona mientras
-- el papel no ha salido de la empresa: se rompe y se hace otro. En cuanto la
-- factura está en manos del cliente, anularla deja de ser una opción — él tiene
-- un documento fiscal con un número de control que existe, y el SENIAT también.
--
-- El papel que corrige una factura entregada es la nota de crédito. Corrige por
-- diferencia: la factura se queda como está y la nota le resta.
--
-- Cuatro cosas que la gobiernan:
--
--   · Congela la tasa DE LA FACTURA, no la de hoy. Una nota que devuelve
--     $100 de una factura de hace tres semanas tiene que restar los mismos
--     bolívares que sumó aquel día. Con la tasa de hoy restaría otra cosa, y la
--     factura nunca cerraría en cero.
--
--   · No puede pasarse. La suma de las notas de una factura no llega a más de
--     lo que la factura dice. Una nota mayor que la venta es dinero que se
--     devuelve dos veces.
--
--   · El material puede volver o no volver. Si al cliente se le mandó piedra 2
--     cuando pidió piedra 1 y la devuelve, ese renglón trae almacén y vuelve al
--     patio. Si lo que se corrige es el precio, no vuelve nada. Es el mismo
--     papel para las dos cosas porque para el SENIAT lo es.
--
--   · El dinero no se mueve solo. Si la factura ya estaba cobrada y la nota la
--     deja en negativo, eso es plata que hay que devolverle al cliente y sale
--     de tesorería con su propio asiento. La nota baja lo que se debe; no
--     firma cheques.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Cabecera
-- ---------------------------------------------------------------------------
create table if not exists public.notas_credito (
  id             bigint generated always as identity primary key,

  numero         text not null unique,
  -- El de control sale de la MISMA serie que las facturas. No es un detalle de
  -- implementación: el número de control es la numeración autorizada de la
  -- imprenta y corre continua sobre todos los documentos fiscales, no una por
  -- tipo de papel.
  numero_control text not null unique,

  factura_id     bigint not null references public.facturas_venta(id),
  cliente_id     bigint not null references public.clientes(id),
  fecha          date not null default current_date,

  tipo           text not null check (tipo in (
                   'DEVOLUCION',   -- volvió material
                   'DESCUENTO',    -- rebaja posterior acordada
                   'CORRECCION',   -- se facturó de más: precio o cantidad
                   'ANULACION')),  -- la factura entera se deja sin efecto
  motivo         text not null,

  -- Copiadas de la factura, no del día de hoy.
  moneda         char(3) not null references public.monedas(codigo),
  tasa           numeric(20,10) not null check (tasa > 0),
  tasa_usd       numeric(20,10) not null check (tasa_usd > 0),
  alicuota_iva   numeric(5,2) not null default 16 check (alicuota_iva >= 0 and alicuota_iva <= 100),

  -- Existen para poder reusar tal cual la suma de renglones que ya usan las
  -- cotizaciones, las notas de entrega y las facturas. En una nota de crédito
  -- siempre valen cero: lo que se corrige se escribe como renglón.
  descuento      numeric(20,6) not null default 0,
  flete          numeric(20,6) not null default 0,

  subtotal       numeric(20,6) not null default 0,
  base_imponible numeric(20,6) not null default 0,
  iva            numeric(20,6) not null default 0,
  total          numeric(20,6) not null default 0,

  total_bs       numeric(20,6) generated always as (round(total * tasa, 2)) stored,
  total_usd      numeric(20,6) generated always as (round(total * tasa / tasa_usd, 2)) stored,

  estado         text not null default 'EMITIDA'
                 check (estado in ('EMITIDA', 'ANULADA')),

  motivo_anulacion text,
  anulada_por    uuid references auth.users(id),
  anulada_en     timestamptz,

  emitida_por    uuid references auth.users(id),
  emitida_en     timestamptz not null default now()
);

create index if not exists notas_credito_factura_idx on public.notas_credito (factura_id);
create index if not exists notas_credito_fecha_idx   on public.notas_credito (fecha desc);

-- ---------------------------------------------------------------------------
-- Renglones
-- ---------------------------------------------------------------------------
create table if not exists public.nota_credito_renglones (
  id              bigint generated always as identity primary key,
  nota_id         bigint not null references public.notas_credito(id) on delete cascade,
  linea           smallint not null,

  articulo_id     bigint not null references public.articulos(id),
  descripcion     text not null,
  cantidad        numeric(20,4) not null check (cantidad > 0),
  unidad          text not null references public.unidades(codigo),
  precio_unitario numeric(20,6) not null check (precio_unitario >= 0),
  exento_iva      boolean not null default false,

  -- Con almacén, el material vuelve al patio y este renglón escribe su entrada
  -- en el libro de inventario. Sin almacén, solo se corrige plata.
  almacen_id      bigint references public.almacenes(id),
  movimiento_id   bigint references public.inventario_movimientos(id),

  subtotal        numeric(20,6) generated always as (round(cantidad * precio_unitario, 6)) stored,

  unique (nota_id, linea)
);

create index if not exists nota_credito_renglones_idx on public.nota_credito_renglones (nota_id);

-- ---------------------------------------------------------------------------
-- La suma de renglones aprende una tabla más
-- ---------------------------------------------------------------------------
create or replace function private.recalcular_venta(p_tabla text, p_columna text, p_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_subtotal  numeric(20,6);
  v_gravado   numeric(20,6);
  v_descuento numeric(20,6);
  v_flete     numeric(20,6);
  v_alicuota  numeric(5,2);
  v_base      numeric(20,6);
  v_iva       numeric(20,6);
  v_renglones text := case p_tabla
                        when 'cotizaciones_venta' then 'cotizacion_venta_renglones'
                        when 'notas_entrega'      then 'nota_entrega_renglones'
                        when 'facturas_venta'     then 'factura_venta_renglones'
                        when 'notas_credito'      then 'nota_credito_renglones'
                      end;
begin
  if v_renglones is null then
    raise exception 'No sé sumar los renglones de %.', p_tabla using errcode = '22023';
  end if;

  execute format(
    'select coalesce(sum(subtotal), 0),
            coalesce(sum(subtotal) filter (where not exento_iva), 0)
       from public.%I where %I = $1', v_renglones, p_columna)
    into v_subtotal, v_gravado using p_id;

  execute format(
    'select descuento, flete, alicuota_iva from public.%I where id = $1', p_tabla)
    into v_descuento, v_flete, v_alicuota using p_id;

  if v_subtotal > 0 then
    v_base := round(greatest(v_gravado - v_descuento * (v_gravado / v_subtotal), 0), 6);
  else
    v_base := 0;
  end if;

  v_base := v_base + v_flete;
  v_iva  := round(v_base * v_alicuota / 100, 2);

  execute format(
    'update public.%I
        set subtotal = $1, base_imponible = $2, iva = $3, total = $4
      where id = $5', p_tabla)
    using v_subtotal, v_base, v_iva,
          round(v_subtotal - v_descuento + v_flete + v_iva, 2), p_id;
end;
$$;

drop trigger if exists trg_total on public.nota_credito_renglones;
create trigger trg_total after insert or update or delete on public.nota_credito_renglones
  for each row execute function private.trg_recalcular_venta('notas_credito', 'nota_id');

-- ---------------------------------------------------------------------------
-- No se pasa de la factura
--
-- Relee la fila en vez de fiarse de la imagen que le llega. La cabecera nace en
-- cero —los renglones entran después— y es la suma de renglones la que le pone
-- el total con un UPDATE; ese UPDATE es el que dispara esta comprobación con la
-- cifra ya hecha.
--
-- Inmediato y no diferido a propósito. Diferido, la queja saldría al cerrar la
-- transacción, lejos de la llamada que la causó: quien la lea en el registro no
-- sabría qué la disparó. Y como cada renglón sube el total —nunca lo baja— las
-- comprobaciones intermedias son siempre menores que la final, así que
-- comprobar de más no rechaza nada que fuera a estar bien.
-- ---------------------------------------------------------------------------
create or replace function private.trg_nota_credito_no_excede()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nota    record;
  v_factura record;
  v_acumulado numeric;
begin
  select * into v_nota from public.notas_credito where id = NEW.id;

  -- Se borró dentro de la misma transacción: no hay nada que comprobar.
  if v_nota.id is null then return null; end if;
  if v_nota.estado = 'ANULADA' then return null; end if;

  select * into v_factura from public.facturas_venta where id = v_nota.factura_id;

  select coalesce(sum(nc.total), 0) into v_acumulado
  from public.notas_credito nc
  where nc.factura_id = v_nota.factura_id and nc.estado = 'EMITIDA';

  if v_acumulado > round(v_factura.total, 2) + 0.01 then
    raise exception
      'Las notas de crédito de la factura % suman % y la factura es de %. Una nota no puede devolver más de lo que se cobró.',
      v_factura.numero, round(v_acumulado, 2), round(v_factura.total, 2)
      using errcode = '22023';
  end if;

  return null;
end;
$$;

drop trigger if exists trg_no_excede on public.notas_credito;
create trigger trg_no_excede
  after insert or update on public.notas_credito
  for each row execute function private.trg_nota_credito_no_excede();

-- ---------------------------------------------------------------------------
-- Emitir
-- ---------------------------------------------------------------------------
create or replace function public.emitir_nota_credito(
  p_factura_id bigint,
  p_tipo       text,
  p_motivo     text,
  p_renglones  jsonb,
  p_fecha      date default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fac    record;
  v_id     bigint;
  v_fecha  date := coalesce(p_fecha, (now() at time zone 'America/Caracas')::date);
  v_item   jsonb;
  v_linea  smallint := 0;
  v_art    record;
  v_alm    bigint;
  v_mov    bigint;
  v_reng   bigint;
begin
  perform private.exigir_permiso('VENTAS', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 6 then
    raise exception 'Escribe por qué se emite. Una nota de crédito sin motivo no se le puede explicar a nadie: ni al cliente, ni al SENIAT, ni al que la lea en un año.'
      using errcode = '22023';
  end if;

  if p_tipo not in ('DEVOLUCION', 'DESCUENTO', 'CORRECCION', 'ANULACION') then
    raise exception 'Tipo de nota de crédito no válido: %.', p_tipo using errcode = '22023';
  end if;

  if coalesce(jsonb_array_length(p_renglones), 0) = 0 then
    raise exception 'La nota necesita al menos un renglón: qué se corrige y por cuánto.'
      using errcode = '22023';
  end if;

  -- La fila de la factura es el portero, igual que para cobrar y para anular.
  select * into v_fac from public.facturas_venta where id = p_factura_id for update;

  if v_fac.id is null then
    raise exception 'No existe la factura %.', p_factura_id using errcode = 'P0002';
  end if;

  if v_fac.estado = 'ANULADA' then
    raise exception 'La factura % está anulada. Una factura sin efecto no se corrige: no hay nada que restarle.',
      v_fac.numero using errcode = '55000';
  end if;

  if v_fecha < v_fac.fecha then
    raise exception 'La nota es del % y la factura que corrige es del %. Una corrección no puede ser anterior a lo que corrige.',
      to_char(v_fecha, 'DD/MM/YYYY'), to_char(v_fac.fecha, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  insert into public.notas_credito
    (numero, numero_control, factura_id, cliente_id, fecha, tipo, motivo,
     moneda, tasa, tasa_usd, alicuota_iva, emitida_por)
  values
    (private.siguiente_numero('NCR'), private.siguiente_control(), v_fac.id,
     v_fac.cliente_id, v_fecha, p_tipo, trim(p_motivo),
     -- La tasa de la factura. Si fuera la de hoy, restaría otros bolívares de
     -- los que sumó y la factura nunca cerraría.
     v_fac.moneda, v_fac.tasa, v_fac.tasa_usd, v_fac.alicuota_iva,
     (select auth.uid()))
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_linea := v_linea + 1;

    select * into v_art from public.articulos
     where id = (v_item->>'articulo_id')::bigint;

    if v_art.id is null then
      raise exception 'El renglón % apunta a un artículo que no existe.', v_linea
        using errcode = 'P0002';
    end if;

    if coalesce((v_item->>'cantidad')::numeric, 0) <= 0 then
      raise exception 'La cantidad del renglón % debe ser mayor que cero.', v_linea
        using errcode = '22023';
    end if;

    v_alm := nullif(v_item->>'almacen_id', '')::bigint;

    insert into public.nota_credito_renglones
      (nota_id, linea, articulo_id, descripcion, cantidad, unidad,
       precio_unitario, exento_iva, almacen_id)
    values
      (v_id, v_linea, v_art.id,
       coalesce(nullif(trim(coalesce(v_item->>'descripcion', '')), ''), v_art.nombre),
       (v_item->>'cantidad')::numeric,
       coalesce(nullif(v_item->>'unidad', ''), v_art.unidad),
       coalesce((v_item->>'precio_unitario')::numeric, 0),
       coalesce((v_item->>'exento_iva')::boolean, false),
       v_alm)
    returning id into v_reng;

    -- Solo si el renglón dice a qué patio vuelve. Una corrección de precio no
    -- mueve una piedra.
    if v_alm is not null then
      -- El penúltimo argumento es `p_origen`, que NO es "de dónde viene esto"
      -- sino el movimiento al que este reversa, y apunta al libro de inventario.
      -- Aquí va en nulo: esta entrada no deshace nada, es material que llegó. El
      -- enlace con la nota vive en el renglón, que es donde se puede leer.
      v_mov := private.registrar_movimiento(
        'ENTRADA_DEVOLUCION', 1, v_alm, v_art.id,
        (v_item->>'cantidad')::numeric,
        coalesce((v_item->>'precio_unitario')::numeric, 0) * v_fac.tasa / v_fac.tasa_usd,
        format('Devolución del cliente por nota de crédito sobre la factura %s', v_fac.numero),
        null, null, null, v_fecha);

      update public.nota_credito_renglones set movimiento_id = v_mov where id = v_reng;
    end if;
  end loop;

  return v_id;
end;
$$;

revoke execute on function public.emitir_nota_credito(bigint, text, text, jsonb, date) from public, anon;
grant   execute on function public.emitir_nota_credito(bigint, text, text, jsonb, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Anular
--
-- El número de control se gastó y no vuelve: queda una nota anulada, con su
-- motivo, que es lo que el SENIAT espera encontrar. Lo que sí se devuelve es el
-- material, si había entrado.
-- ---------------------------------------------------------------------------
create or replace function public.anular_nota_credito(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nota  record;
  v_reng  record;
  v_hay   numeric;
begin
  perform private.exigir_permiso('VENTAS', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se anula.' using errcode = '22023';
  end if;

  select * into v_nota from public.notas_credito where id = p_id for update;

  if v_nota.id is null then
    raise exception 'No existe la nota de crédito %.', p_id using errcode = 'P0002';
  end if;

  if v_nota.estado = 'ANULADA' then
    raise exception 'La nota % ya estaba anulada.', v_nota.numero using errcode = '55000';
  end if;

  -- El material que volvió tiene que poder volver a salir. Si ya se vendió otra
  -- vez, el patio no alcanza y anular aquí dejaría existencia negativa.
  for v_reng in
    select * from public.nota_credito_renglones
     where nota_id = p_id and almacen_id is not null
     order by articulo_id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(format('patio:%s:%s', v_reng.almacen_id, v_reng.articulo_id), 0));

    v_hay := private.existencia(v_reng.almacen_id, v_reng.articulo_id);

    if v_hay < v_reng.cantidad then
      raise exception
        'La nota % devolvió % al patio y ahora solo hay %. Ese material ya salió otra vez: no se puede deshacer la devolución.',
        v_nota.numero, v_reng.cantidad, v_hay using errcode = '55000';
    end if;

    -- Aquí `p_origen` sí lleva algo, y lleva lo que corresponde: la entrada que
    -- este asiento deshace. Así el libro de inventario dice de qué movimiento
    -- es el reverso sin que haya que reconstruirlo.
    perform private.registrar_movimiento(
      'REVERSO', -1, v_reng.almacen_id, v_reng.articulo_id, v_reng.cantidad, 0,
      format('Anulación de la nota de crédito %s', v_nota.numero),
      null, null, v_reng.movimiento_id, (now() at time zone 'America/Caracas')::date);
  end loop;

  update public.notas_credito
     set estado = 'ANULADA',
         motivo_anulacion = trim(p_motivo),
         anulada_por = (select auth.uid()),
         anulada_en = now()
   where id = p_id;
end;
$$;

revoke execute on function public.anular_nota_credito(bigint, text) from public, anon;
grant   execute on function public.anular_nota_credito(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Anular la factura deja de ser posible si ya se corrigió
--
-- Son dos caminos que no se cruzan: o el papel no salió y se anula, o salió y
-- se corrige con notas. Permitir las dos cosas dejaría notas de crédito
-- colgando de una factura que ya no existe.
-- ---------------------------------------------------------------------------
create or replace function public.anular_factura(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fac    record;
  v_cobros integer;
  v_notas  integer;
begin
  perform private.exigir_permiso('VENTAS', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se anula. Una factura anulada sin motivo no se puede explicar.'
      using errcode = '22023';
  end if;

  select * into v_fac from public.facturas_venta where id = p_id for update;

  if v_fac.id is null then
    raise exception 'No existe la factura %.', p_id using errcode = 'P0002';
  end if;

  if v_fac.estado = 'ANULADA' then
    raise exception 'La factura % ya estaba anulada.', v_fac.numero using errcode = '55000';
  end if;

  select count(*) into v_cobros
  from public.cobros_venta where factura_id = p_id and estado = 'REGISTRADO';

  if v_cobros > 0 then
    raise exception 'La factura % tiene % cobro(s) registrados. Anúlalos primero: el dinero entró y tiene que salir del libro con su propio asiento.',
      v_fac.numero, v_cobros using errcode = '55000';
  end if;

  select count(*) into v_notas
  from public.notas_credito where factura_id = p_id and estado = 'EMITIDA';

  if v_notas > 0 then
    raise exception 'La factura % ya tiene % nota(s) de crédito. Se corrige con notas o se anula, no las dos: anúlalas primero si de verdad hay que dejar la factura sin efecto.',
      v_fac.numero, v_notas using errcode = '55000';
  end if;

  update public.facturas_venta
     set estado = 'ANULADA',
         motivo_anulacion = trim(p_motivo),
         anulada_por = (select auth.uid()),
         anulada_en = now()
   where id = p_id;

  update public.notas_entrega
     set estado = 'DESPACHADA', factura_id = null
   where factura_id = p_id and estado = 'FACTURADA';
end;
$$;

-- ---------------------------------------------------------------------------
-- Lo que se debe deja de contar lo acreditado
--
-- Se tiran y se rehacen las dos. `create or replace view` no admite una columna
-- nueva en medio —solo al final— y `acreditado_usd` tiene que ir junto a
-- `cobrado_usd`, que es con lo que se lee. La de cuentas por cobrar cuelga de
-- esta, así que cae con ella y se vuelve a levantar igual.
-- ---------------------------------------------------------------------------
drop view if exists public.v_cuentas_por_cobrar;
drop view if exists public.v_facturas_venta;

create view public.v_facturas_venta
with (security_invoker = on) as
select
  f.*,
  cl.nombre  as cliente,
  cl.rif     as cliente_rif,
  cl.direccion as cliente_direccion,
  coalesce(c.cobrado, 0)      as cobrado_usd,
  coalesce(n.acreditado, 0)   as acreditado_usd,
  greatest(f.total_usd - f.retencion_usd - coalesce(c.cobrado, 0) - coalesce(n.acreditado, 0), 0) as saldo_usd,
  case when f.estado = 'EMITIDA' and f.vence_el < current_date
       then current_date - f.vence_el else 0 end as dias_vencida,
  (select count(*) from public.factura_venta_renglones r where r.factura_id = f.id)::int as renglones
from public.facturas_venta f
join public.clientes cl on cl.id = f.cliente_id
left join lateral (
  select sum(co.monto_usd) as cobrado
  from public.cobros_venta co
  where co.factura_id = f.id and co.estado = 'REGISTRADO'
) c on true
left join lateral (
  select sum(nc.total_usd) as acreditado
  from public.notas_credito nc
  where nc.factura_id = f.id and nc.estado = 'EMITIDA'
) n on true;

grant select on public.v_facturas_venta to authenticated;

create view public.v_cuentas_por_cobrar
with (security_invoker = on) as
select
  f.id            as factura_id,
  f.numero,
  f.numero_control,
  f.fecha,
  f.vence_el,
  f.cliente_id,
  f.cliente,
  f.cliente_rif,
  f.condicion_pago,
  f.moneda,
  f.total,
  f.total_bs,
  f.total_usd,
  f.retencion_iva,
  f.retencion_usd,
  f.cobrado_usd,
  f.acreditado_usd,
  f.saldo_usd,
  round(f.saldo_usd * f.tasa_usd, 2) as saldo_bs,
  f.dias_vencida,
  current_date - f.fecha as dias_desde_emision
from public.v_facturas_venta f
where f.estado = 'EMITIDA'
  and f.saldo_usd > 0.01;

grant select on public.v_cuentas_por_cobrar to authenticated;

-- ---------------------------------------------------------------------------
-- Lo que debe el cliente tampoco cuenta lo acreditado
--
-- Esta es la función que gobierna el techo de crédito: la consulta la pantalla
-- de clientes para enseñar el disponible, y la consulta `facturar_notas` antes
-- de dejar emitir. Sin tocarla, una nota de crédito bajaba el saldo de la
-- factura pero NO lo que el cliente tiene consumido de su cupo.
--
-- El efecto era al revés de lo que se espera: se le devuelven $600 a un cliente
-- con $1.000 de límite y su disponible se queda en cero. La próxima venta le
-- rebota diciendo que se pasa del límite, por una deuda que ya no tiene, y no
-- hay forma de arreglarlo desde la pantalla salvo subiéndole el límite a mano.
-- ---------------------------------------------------------------------------
create or replace function private.deuda_cliente(p_cliente bigint)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
           greatest(f.total_usd - f.retencion_usd
                    - coalesce(c.cobrado, 0) - coalesce(n.acreditado, 0), 0)
         ), 0)
  from public.facturas_venta f
  left join lateral (
    select sum(co.monto_usd) as cobrado
    from public.cobros_venta co
    where co.factura_id = f.id and co.estado = 'REGISTRADO'
  ) c on true
  left join lateral (
    select sum(nc.total_usd) as acreditado
    from public.notas_credito nc
    where nc.factura_id = f.id and nc.estado = 'EMITIDA'
  ) n on true
  where f.cliente_id = p_cliente
    and f.estado = 'EMITIDA';
$$;

-- ---------------------------------------------------------------------------
-- La nota, para leerla
-- ---------------------------------------------------------------------------
create or replace view public.v_notas_credito
with (security_invoker = on) as
select
  nc.*,
  cl.nombre    as cliente,
  cl.rif       as cliente_rif,
  f.numero         as factura_numero,
  f.numero_control as factura_control,
  f.fecha          as factura_fecha,
  f.total          as factura_total,
  (select count(*) from public.nota_credito_renglones r where r.nota_id = nc.id)::int as renglones,
  exists (select 1 from public.nota_credito_renglones r
           where r.nota_id = nc.id and r.almacen_id is not null) as devolvio_material
from public.notas_credito nc
join public.clientes cl on cl.id = nc.cliente_id
join public.facturas_venta f on f.id = nc.factura_id;

grant select on public.v_notas_credito to authenticated;

-- ---------------------------------------------------------------------------
-- Lectura y escritura
-- ---------------------------------------------------------------------------
alter table public.notas_credito          enable row level security;
alter table public.nota_credito_renglones enable row level security;

revoke insert, update, delete on public.notas_credito          from anon, authenticated;
revoke insert, update, delete on public.nota_credito_renglones from anon, authenticated;

grant select on public.notas_credito          to authenticated;
grant select on public.nota_credito_renglones to authenticated;

drop policy if exists notas_credito_lectura on public.notas_credito;
create policy notas_credito_lectura on public.notas_credito
  for select to authenticated using (private.tiene_permiso('VENTAS', 'LECTURA'));

drop policy if exists nota_credito_renglones_lectura on public.nota_credito_renglones;
create policy nota_credito_renglones_lectura on public.nota_credito_renglones
  for select to authenticated using (private.tiene_permiso('VENTAS', 'LECTURA'));

-- ---------------------------------------------------------------------------
-- Tiempo real
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'No existe la publicación supabase_realtime: se omite.';
    return;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notas_credito'
  ) then
    alter publication supabase_realtime add table public.notas_credito;
  end if;
end
$$;
