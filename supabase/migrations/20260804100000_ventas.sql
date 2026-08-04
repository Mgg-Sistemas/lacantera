-- ============================================================================
-- Ventas
--
-- El camino del material hacia afuera, que es el espejo del de compras:
--
--   CLIENTE  →  COTIZACIÓN  →  NOTA DE ENTREGA  →  FACTURA  →  COBRO
--                (opcional)      (sale el camión)   (el papel)  (entra la plata)
--
-- Cuatro decisiones mandan sobre todo lo demás:
--
-- 1. LA NOTA DE ENTREGA ES LA QUE MUEVE EL PATIO, NO LA FACTURA. El camión sale
--    hoy y el papel fiscal se hace después, a veces juntando la semana entera
--    de un cliente. Si el inventario esperara a la factura, el patio diría que
--    hay material que ya se llevaron. Despachar rebaja la existencia en el acto
--    y guarda en cada renglón el número del movimiento que lo rebajó: anular la
--    nota reversa exactamente esos y no otros.
--
-- 2. LA FACTURA NO SE BORRA. Se anula con motivo y se queda a la vista con su
--    número. Un correlativo fiscal con huecos es lo primero que pregunta una
--    fiscalización, y "se borró por error" no es una respuesta. Al anularla,
--    sus notas de entrega vuelven a estar por facturar: el material salió
--    igual, y esa deuda no desaparece porque el papel estuviera mal.
--
-- 3. EL SALDO DE UNA FACTURA SE MIDE EN DÓLARES. Se factura en la moneda que
--    lleve cada cliente y se cobra en la que se pueda pagar ese día: una
--    factura en dólares se abona con una transferencia en bolívares más de lo
--    que se cree. Restar bolívares de dólares no se puede, así que cada
--    documento congela la tasa de su día y el saldo se lleva en una unidad
--    común. La factura sigue diciendo lo que dice; lo que se calcula en dólares
--    es cuánto falta.
--
-- 4. EL CRÉDITO TIENE TECHO Y EL TECHO SE APLICA. De nada sirve un campo
--    "límite de crédito" que solo se mira. Emitir a crédito por encima del
--    límite del cliente no se avisa: se rechaza, con la deuda actual y el
--    límite en el mensaje. Quien decida saltárselo tiene que tener el nivel
--    TOTAL en Ventas — que es una decisión de la gerencia, no del despacho.
--
-- LO QUE ESTA MIGRACIÓN NO TRAE: la nota de crédito. Anular sirve mientras la
-- factura no haya salido de la empresa; una ya entregada al cliente se corrige
-- con nota de crédito, y eso es otro documento con su propio correlativo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Quién vende
--
-- No existía un rol para esto: hasta hoy nadie vendía desde el sistema. Se
-- añade como rol del sistema porque hay funciones que lo nombran por código.
-- ---------------------------------------------------------------------------
insert into public.roles (codigo, nombre, descripcion, orden) values
  ('VENTAS', 'Ventas', 'Cotiza, despacha material, factura y registra cobros.', 55)
on conflict (codigo) do update
  set nombre = excluded.nombre,
      descripcion = excluded.descripcion,
      orden = excluded.orden;

update public.roles set sistema = true where codigo = 'VENTAS';

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------
create table if not exists public.clientes (
  id                     bigint generated always as identity primary key,
  rif                    text not null unique,
  nombre                 text not null,
  nombre_comercial       text,
  contacto               text,
  telefono               text,
  correo                 text,

  -- El domicilio fiscal se imprime en la factura. No es un dato de agenda: una
  -- factura sin la dirección del comprador está mal emitida.
  direccion              text,

  condicion_pago         text not null default 'CONTADO'
                         check (condicion_pago in ('CONTADO', 'CREDITO_15', 'CREDITO_30', 'CREDITO_60')),

  -- En dólares, y no en la moneda del cliente, porque es lo único con lo que se
  -- puede comparar la deuda de alguien a quien se le factura en las dos.
  limite_credito         numeric(20,2) not null default 0 check (limite_credito >= 0),

  moneda_preferida       char(3) not null default 'USD' references public.monedas(codigo),

  -- Un contribuyente especial retiene parte del IVA al pagar: la factura dice
  -- un total y entra menos dinero. La diferencia no es una deuda del cliente,
  -- es un impuesto que él le entrega al SENIAT en nuestro nombre.
  contribuyente_especial boolean not null default false,
  retencion_iva          numeric(5,2) not null default 75
                         check (retencion_iva >= 0 and retencion_iva <= 100),

  exento_iva             boolean not null default false,

  activo                 boolean not null default true,
  notas                  text,
  creado_por             uuid references auth.users(id),
  creado_en              timestamptz not null default now()
);

-- Mismo RIF venezolano que en proveedores: letra de tipo, ocho dígitos y
-- dígito verificador.
alter table public.clientes drop constraint if exists clientes_rif_formato;
alter table public.clientes add constraint clientes_rif_formato
  check (rif ~ '^[VEJPGC]-[0-9]{8}-[0-9]$');

create index if not exists clientes_nombre_idx on public.clientes (nombre) where activo;

-- ---------------------------------------------------------------------------
-- Lista de precios
--
-- Un precio por artículo, con un mínimo debajo del cual no se vende. El mínimo
-- es el control que hace falta cuando el que despacha no es el que pone los
-- precios: sin él, un descuento de pasillo se convierte en el precio de la
-- casa y nadie se entera hasta que cuadran el mes.
-- ---------------------------------------------------------------------------
create table if not exists public.precios_venta (
  articulo_id     bigint primary key references public.articulos(id) on delete cascade,
  moneda          char(3) not null default 'USD' references public.monedas(codigo),
  precio          numeric(20,6) not null check (precio > 0),
  precio_minimo   numeric(20,6) not null default 0 check (precio_minimo >= 0),
  nota            text,
  actualizado_por uuid references auth.users(id),
  actualizado_en  timestamptz not null default now()
);

alter table public.precios_venta drop constraint if exists precios_minimo_bajo_precio;
alter table public.precios_venta add constraint precios_minimo_bajo_precio
  check (precio_minimo <= precio);

-- ---------------------------------------------------------------------------
-- El número de control fiscal
--
-- Va aparte del número de documento y no se reinicia en enero: el correlativo
-- de control es una serie única y continua, y el año se guarda como 0 para
-- decir precisamente eso. Si el SENIAT autoriza un rango que no empieza en 1,
-- se ajusta la fila de `correlativos` y sigue desde ahí.
-- ---------------------------------------------------------------------------
create or replace function private.siguiente_control()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ultimo integer;
begin
  insert into public.correlativos (prefijo, anio, ultimo)
  values ('CTRL', 0, 1)
  on conflict (prefijo, anio) do update
    set ultimo = public.correlativos.ultimo + 1
  returning ultimo into v_ultimo;

  return format('00-%s', lpad(v_ultimo::text, 8, '0'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Pasar un monto a dólares con la tasa de un día
--
-- Se usa para comparar cosas que están en monedas distintas —el precio mínimo
-- contra el precio ofrecido, la deuda del cliente contra su límite—, nunca
-- para reescribir un importe. Los importes se quedan como se pactaron.
-- ---------------------------------------------------------------------------
create or replace function private.en_dolares(
  p_monto  numeric,
  p_moneda char(3),
  p_fecha  date default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tasas record;
begin
  if coalesce(p_monto, 0) = 0 then return 0; end if;

  select * into v_tasas
  from private.tasas_del_dia(p_moneda, coalesce(p_fecha, current_date));

  return round(p_monto * v_tasas.tasa / v_tasas.tasa_usd, 6);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cotizaciones al cliente
--
-- No tiene estado "vencida": el vencimiento se calcula de la fecha y los días
-- de validez. Un estado que solo cambia con el paso del tiempo obliga a tener
-- a alguien —o algo— pasándolo, y el día que no se pase queda mintiendo.
-- ---------------------------------------------------------------------------
create table if not exists public.cotizaciones_venta (
  id             bigint generated always as identity primary key,
  numero         text not null unique,
  cliente_id     bigint not null references public.clientes(id),
  fecha          date not null default current_date,
  validez_dias   smallint not null default 15 check (validez_dias > 0),

  moneda         char(3) not null references public.monedas(codigo),
  tasa           numeric(20,10) not null check (tasa > 0),
  tasa_usd       numeric(20,10) not null check (tasa_usd > 0),
  alicuota_iva   numeric(5,2) not null default 16 check (alicuota_iva >= 0 and alicuota_iva <= 100),

  descuento      numeric(20,6) not null default 0 check (descuento >= 0),
  flete          numeric(20,6) not null default 0 check (flete >= 0),

  -- Los calcula el disparador desde los renglones. No se escriben a mano.
  subtotal       numeric(20,6) not null default 0,
  base_imponible numeric(20,6) not null default 0,
  iva            numeric(20,6) not null default 0,
  total          numeric(20,6) not null default 0,

  total_bs       numeric(20,6) generated always as (round(total * tasa, 2)) stored,
  total_usd      numeric(20,6) generated always as (round(total * tasa / tasa_usd, 2)) stored,

  estado         text not null default 'ENVIADA'
                 check (estado in ('ENVIADA', 'ACEPTADA', 'RECHAZADA', 'ANULADA')),

  observacion    text,
  motivo_cierre  text,
  creada_por     uuid references auth.users(id),
  creada_en      timestamptz not null default now(),
  cerrada_por    uuid references auth.users(id),
  cerrada_en     timestamptz
);

create index if not exists cotizaciones_venta_cliente_idx
  on public.cotizaciones_venta (cliente_id, fecha desc);
create index if not exists cotizaciones_venta_estado_idx
  on public.cotizaciones_venta (estado, fecha desc);

create table if not exists public.cotizacion_venta_renglones (
  id              bigint generated always as identity primary key,
  cotizacion_id   bigint not null references public.cotizaciones_venta(id) on delete cascade,
  linea           smallint not null,

  articulo_id     bigint not null references public.articulos(id),
  descripcion     text not null,
  cantidad        numeric(20,4) not null check (cantidad > 0),
  unidad          text not null references public.unidades(codigo),
  precio_unitario numeric(20,6) not null check (precio_unitario >= 0),
  exento_iva      boolean not null default false,

  subtotal        numeric(20,6) generated always as (round(cantidad * precio_unitario, 6)) stored,

  unique (cotizacion_id, linea)
);

create index if not exists cotizacion_venta_renglones_idx
  on public.cotizacion_venta_renglones (cotizacion_id);

-- ---------------------------------------------------------------------------
-- Notas de entrega
--
-- El documento con el que sale el camión. Lleva los datos de la romana porque
-- es lo único que se puede contrastar después: el cliente reclama por el peso,
-- no por el renglón.
-- ---------------------------------------------------------------------------
create table if not exists public.notas_entrega (
  id             bigint generated always as identity primary key,
  numero         text not null unique,
  cliente_id     bigint not null references public.clientes(id),
  cotizacion_id  bigint references public.cotizaciones_venta(id),

  -- De qué patio sale. Sin esto no hay de dónde restar.
  almacen_id     bigint not null references public.almacenes(id),

  fecha          date not null default current_date,

  vehiculo       text,
  chofer         text,
  cedula_chofer  text,

  -- De la romana. Informativos: lo que factura es la cantidad de cada renglón.
  -- Se guardan igual porque son la prueba del peso el día que alguien discuta.
  peso_bruto     numeric(20,4) check (peso_bruto is null or peso_bruto > 0),
  peso_tara      numeric(20,4) check (peso_tara  is null or peso_tara  >= 0),
  ticket_romana  text,

  moneda         char(3) not null references public.monedas(codigo),
  tasa           numeric(20,10) not null check (tasa > 0),
  tasa_usd       numeric(20,10) not null check (tasa_usd > 0),
  alicuota_iva   numeric(5,2) not null default 16 check (alicuota_iva >= 0 and alicuota_iva <= 100),

  descuento      numeric(20,6) not null default 0 check (descuento >= 0),
  flete          numeric(20,6) not null default 0 check (flete >= 0),

  subtotal       numeric(20,6) not null default 0,
  base_imponible numeric(20,6) not null default 0,
  iva            numeric(20,6) not null default 0,
  total          numeric(20,6) not null default 0,

  total_bs       numeric(20,6) generated always as (round(total * tasa, 2)) stored,
  total_usd      numeric(20,6) generated always as (round(total * tasa / tasa_usd, 2)) stored,

  estado         text not null default 'DESPACHADA'
                 check (estado in ('DESPACHADA', 'FACTURADA', 'ANULADA')),

  factura_id     bigint,

  observacion    text,
  despachada_por uuid references auth.users(id),
  despachada_en  timestamptz not null default now(),

  motivo_anulacion text,
  anulada_por    uuid references auth.users(id),
  anulada_en     timestamptz
);

alter table public.notas_entrega drop constraint if exists notas_peso_coherente;
alter table public.notas_entrega add constraint notas_peso_coherente
  check (peso_bruto is null or peso_tara is null or peso_bruto > peso_tara);

create index if not exists notas_entrega_cliente_idx on public.notas_entrega (cliente_id, fecha desc);
create index if not exists notas_entrega_estado_idx  on public.notas_entrega (estado, fecha desc);
create index if not exists notas_entrega_factura_idx on public.notas_entrega (factura_id)
  where factura_id is not null;

create table if not exists public.nota_entrega_renglones (
  id              bigint generated always as identity primary key,
  nota_id         bigint not null references public.notas_entrega(id) on delete cascade,
  linea           smallint not null,

  articulo_id     bigint not null references public.articulos(id),
  descripcion     text not null,
  cantidad        numeric(20,4) not null check (cantidad > 0),
  unidad          text not null references public.unidades(codigo),
  precio_unitario numeric(20,6) not null check (precio_unitario >= 0),
  exento_iva      boolean not null default false,

  subtotal        numeric(20,6) generated always as (round(cantidad * precio_unitario, 6)) stored,

  -- El movimiento de inventario que rebajó el patio por este renglón. Nulo
  -- cuando el renglón es un servicio —un flete— que no sale de ningún almacén.
  -- Guardarlo aquí es lo que permite anular la nota reversando exactamente lo
  -- que se descontó, y no lo que hoy parezca razonable descontar.
  movimiento_id   bigint references public.inventario_movimientos(id),

  unique (nota_id, linea)
);

create index if not exists nota_entrega_renglones_idx on public.nota_entrega_renglones (nota_id);

-- ---------------------------------------------------------------------------
-- Facturas
-- ---------------------------------------------------------------------------
create table if not exists public.facturas_venta (
  id             bigint generated always as identity primary key,

  -- El interno, con el que se habla: "la factura 12".
  numero         text not null unique,
  -- El fiscal, que es serie única y continua.
  numero_control text not null unique,

  cliente_id     bigint not null references public.clientes(id),
  fecha          date not null default current_date,

  condicion_pago text not null default 'CONTADO'
                 check (condicion_pago in ('CONTADO', 'CREDITO_15', 'CREDITO_30', 'CREDITO_60')),
  dias_credito   smallint not null default 0 check (dias_credito >= 0),
  vence_el       date not null,

  moneda         char(3) not null references public.monedas(codigo),
  tasa           numeric(20,10) not null check (tasa > 0),
  tasa_usd       numeric(20,10) not null check (tasa_usd > 0),
  alicuota_iva   numeric(5,2) not null default 16 check (alicuota_iva >= 0 and alicuota_iva <= 100),

  descuento      numeric(20,6) not null default 0 check (descuento >= 0),
  flete          numeric(20,6) not null default 0 check (flete >= 0),

  subtotal       numeric(20,6) not null default 0,
  base_imponible numeric(20,6) not null default 0,
  iva            numeric(20,6) not null default 0,
  total          numeric(20,6) not null default 0,

  -- Lo que el cliente retiene del IVA y le entrega al SENIAT por su cuenta.
  -- Baja lo que se cobra, no lo que se factura.
  retencion_iva  numeric(20,6) not null default 0 check (retencion_iva >= 0),

  total_bs       numeric(20,6) generated always as (round(total * tasa, 2)) stored,
  total_usd      numeric(20,6) generated always as (round(total * tasa / tasa_usd, 2)) stored,
  retencion_usd  numeric(20,6) generated always as (round(retencion_iva * tasa / tasa_usd, 2)) stored,

  estado         text not null default 'EMITIDA'
                 check (estado in ('EMITIDA', 'COBRADA', 'ANULADA')),

  observacion    text,
  emitida_por    uuid references auth.users(id),
  emitida_en     timestamptz not null default now(),

  motivo_anulacion text,
  anulada_por    uuid references auth.users(id),
  anulada_en     timestamptz
);

create index if not exists facturas_venta_cliente_idx on public.facturas_venta (cliente_id, fecha desc);
create index if not exists facturas_venta_estado_idx  on public.facturas_venta (estado, vence_el);

-- Ahora que existe la factura, la nota puede apuntarla.
alter table public.notas_entrega drop constraint if exists notas_entrega_factura_fk;
alter table public.notas_entrega add constraint notas_entrega_factura_fk
  foreign key (factura_id) references public.facturas_venta(id) on delete set null;

create table if not exists public.factura_venta_renglones (
  id              bigint generated always as identity primary key,
  factura_id      bigint not null references public.facturas_venta(id) on delete cascade,
  linea           smallint not null,

  articulo_id     bigint not null references public.articulos(id),
  descripcion     text not null,
  cantidad        numeric(20,4) not null check (cantidad > 0),
  unidad          text not null references public.unidades(codigo),
  precio_unitario numeric(20,6) not null check (precio_unitario >= 0),
  exento_iva      boolean not null default false,

  -- De qué despacho salió este renglón. Es lo que permite decirle al cliente
  -- qué camión de qué día está pagando.
  nota_id         bigint references public.notas_entrega(id),

  subtotal        numeric(20,6) generated always as (round(cantidad * precio_unitario, 6)) stored,

  unique (factura_id, linea)
);

create index if not exists factura_venta_renglones_idx on public.factura_venta_renglones (factura_id);

-- ---------------------------------------------------------------------------
-- Cobros
--
-- El IGTF va aparte del monto y NO abona la factura: es un impuesto que se le
-- cobra al cliente por pagar en divisas y que la empresa le entrega al SENIAT.
-- Sumarlo al abono dejaría la factura pagada con dinero que no es nuestro.
-- ---------------------------------------------------------------------------
create table if not exists public.cobros_venta (
  id             bigint generated always as identity primary key,
  numero         text not null unique,
  factura_id     bigint not null references public.facturas_venta(id),
  cuenta_id      bigint not null references public.cuentas_tesoreria(id),
  fecha          date not null default current_date,

  metodo         text not null check (metodo in (
                   'TRANSFERENCIA', 'PAGO_MOVIL', 'EFECTIVO', 'ZELLE',
                   'BINANCE', 'CHEQUE', 'OTRO')),

  moneda         char(3) not null references public.monedas(codigo),
  tasa           numeric(20,10) not null check (tasa > 0),
  tasa_usd       numeric(20,10) not null check (tasa_usd > 0),
  monto          numeric(20,6) not null check (monto > 0),

  monto_bs       numeric(20,6) generated always as (round(monto * tasa, 2)) stored,
  monto_usd      numeric(20,6) generated always as (round(monto * tasa / tasa_usd, 2)) stored,

  igtf_aplica    boolean not null default false,
  igtf_alicuota  numeric(5,2) not null default 3 check (igtf_alicuota >= 0),
  igtf_monto     numeric(20,6) generated always as (
                   case when igtf_aplica then round(monto * igtf_alicuota / 100, 2) else 0 end
                 ) stored,

  referencia     text,
  nota           text,

  -- La pata en el libro de tesorería. El enlace vive aquí y no allá porque el
  -- libro no se edita después de escrito.
  movimiento_id  bigint references public.tesoreria_movimientos(id),
  movimiento_igtf_id bigint references public.tesoreria_movimientos(id),

  estado         text not null default 'REGISTRADO'
                 check (estado in ('REGISTRADO', 'ANULADO')),
  motivo_anulacion text,
  anulado_por    uuid references auth.users(id),
  anulado_en     timestamptz,

  registrado_por uuid references auth.users(id),
  registrado_en  timestamptz not null default now()
);

create index if not exists cobros_venta_factura_idx on public.cobros_venta (factura_id);
create index if not exists cobros_venta_fecha_idx   on public.cobros_venta (fecha desc);

-- ---------------------------------------------------------------------------
-- Los totales, en un solo sitio
--
-- Las tres cabeceras —cotización, nota y factura— se suman igual, así que la
-- cuenta se escribe una vez y el disparador recibe por argumento sobre qué
-- tabla trabaja. Tres copias de la misma aritmética es tres sitios donde
-- corregir el día que cambie la alícuota.
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

  -- El descuento se reparte en proporción sobre lo gravado. Restarlo entero de
  -- la base haría que un descuento sobre renglones exentos rebajara el IVA que
  -- sí se debe declarar.
  if v_subtotal > 0 then
    v_base := round(greatest(v_gravado - v_descuento * (v_gravado / v_subtotal), 0), 6);
  else
    v_base := 0;
  end if;

  -- El flete forma parte de la base imponible cuando lo cobra quien vende.
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

create or replace function private.trg_recalcular_venta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fila jsonb := to_jsonb(coalesce(NEW, OLD));
begin
  perform private.recalcular_venta(TG_ARGV[0], TG_ARGV[1], (v_fila ->> TG_ARGV[1])::bigint);
  return null;
end;
$$;

drop trigger if exists trg_total on public.cotizacion_venta_renglones;
create trigger trg_total after insert or update or delete on public.cotizacion_venta_renglones
  for each row execute function private.trg_recalcular_venta('cotizaciones_venta', 'cotizacion_id');

drop trigger if exists trg_total on public.nota_entrega_renglones;
create trigger trg_total after insert or update or delete on public.nota_entrega_renglones
  for each row execute function private.trg_recalcular_venta('notas_entrega', 'nota_id');

drop trigger if exists trg_total on public.factura_venta_renglones;
create trigger trg_total after insert or update or delete on public.factura_venta_renglones
  for each row execute function private.trg_recalcular_venta('facturas_venta', 'factura_id');

-- ---------------------------------------------------------------------------
-- Cuánto debe un cliente
--
-- Solo cuenta lo emitido y no cobrado. Una factura anulada no es deuda, y un
-- cobro anulado no es pago.
-- ---------------------------------------------------------------------------
create or replace function private.deuda_cliente(p_cliente bigint)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
           greatest(f.total_usd - f.retencion_usd - coalesce(c.cobrado, 0), 0)
         ), 0)
  from public.facturas_venta f
  left join lateral (
    select sum(co.monto_usd) as cobrado
    from public.cobros_venta co
    where co.factura_id = f.id and co.estado = 'REGISTRADO'
  ) c on true
  where f.cliente_id = p_cliente
    and f.estado = 'EMITIDA';
$$;

-- ---------------------------------------------------------------------------
-- Vistas
-- ---------------------------------------------------------------------------
create or replace view public.v_clientes
with (security_invoker = on) as
select
  c.*,
  private.deuda_cliente(c.id) as deuda_usd,
  greatest(c.limite_credito - private.deuda_cliente(c.id), 0) as disponible_usd,
  (select count(*) from public.facturas_venta f
    where f.cliente_id = c.id and f.estado <> 'ANULADA')::int as facturas,
  (select max(f.fecha) from public.facturas_venta f
    where f.cliente_id = c.id and f.estado <> 'ANULADA') as ultima_venta
from public.clientes c;

grant select on public.v_clientes to authenticated;

create or replace view public.v_precios_venta
with (security_invoker = on) as
select
  a.id            as articulo_id,
  a.codigo,
  a.nombre,
  a.categoria,
  a.unidad,
  p.moneda,
  p.precio,
  p.precio_minimo,
  p.nota,
  p.actualizado_en,
  a.activo
from public.articulos a
left join public.precios_venta p on p.articulo_id = a.id
where a.categoria in ('PRODUCTO', 'SERVICIO');

grant select on public.v_precios_venta to authenticated;

create or replace view public.v_cotizaciones_venta
with (security_invoker = on) as
select
  q.*,
  cl.nombre  as cliente,
  cl.rif     as cliente_rif,
  q.fecha + q.validez_dias as vence_el,
  (q.estado = 'ENVIADA' and q.fecha + q.validez_dias < current_date) as vencida,
  (select count(*) from public.cotizacion_venta_renglones r where r.cotizacion_id = q.id)::int as renglones,
  (select count(*) from public.notas_entrega n
    where n.cotizacion_id = q.id and n.estado <> 'ANULADA')::int as despachos
from public.cotizaciones_venta q
join public.clientes cl on cl.id = q.cliente_id;

grant select on public.v_cotizaciones_venta to authenticated;

create or replace view public.v_notas_entrega
with (security_invoker = on) as
select
  n.*,
  cl.nombre as cliente,
  cl.rif    as cliente_rif,
  al.nombre as almacen,
  f.numero  as factura_numero,
  case when n.peso_bruto is not null and n.peso_tara is not null
       then n.peso_bruto - n.peso_tara end as peso_neto,
  (select count(*) from public.nota_entrega_renglones r where r.nota_id = n.id)::int as renglones
from public.notas_entrega n
join public.clientes  cl on cl.id = n.cliente_id
join public.almacenes al on al.id = n.almacen_id
left join public.facturas_venta f on f.id = n.factura_id;

grant select on public.v_notas_entrega to authenticated;

create or replace view public.v_facturas_venta
with (security_invoker = on) as
select
  f.*,
  cl.nombre  as cliente,
  cl.rif     as cliente_rif,
  cl.direccion as cliente_direccion,
  coalesce(c.cobrado, 0)      as cobrado_usd,
  greatest(f.total_usd - f.retencion_usd - coalesce(c.cobrado, 0), 0) as saldo_usd,
  case when f.estado = 'EMITIDA' and f.vence_el < current_date
       then current_date - f.vence_el else 0 end as dias_vencida,
  (select count(*) from public.factura_venta_renglones r where r.factura_id = f.id)::int as renglones
from public.facturas_venta f
join public.clientes cl on cl.id = f.cliente_id
left join lateral (
  select sum(co.monto_usd) as cobrado
  from public.cobros_venta co
  where co.factura_id = f.id and co.estado = 'REGISTRADO'
) c on true;

grant select on public.v_facturas_venta to authenticated;

-- Lo que deben los clientes. Es a la vez la cola de cobranza y la deuda del
-- día, igual que v_cuentas_por_pagar lo es del otro lado.
create or replace view public.v_cuentas_por_cobrar
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
  f.saldo_usd,
  round(f.saldo_usd * f.tasa_usd, 2) as saldo_bs,
  f.dias_vencida,
  current_date - f.fecha as dias_desde_emision
from public.v_facturas_venta f
where f.estado = 'EMITIDA'
  and f.saldo_usd > 0.01;

grant select on public.v_cuentas_por_cobrar to authenticated;

-- ---------------------------------------------------------------------------
-- Clientes: alta y edición
-- ---------------------------------------------------------------------------
create or replace function public.guardar_cliente(
  p_id             bigint  default null,
  p_rif            text    default null,
  p_nombre         text    default null,
  p_nombre_comercial text  default null,
  p_contacto       text    default null,
  p_telefono       text    default null,
  p_correo         text    default null,
  p_direccion      text    default null,
  p_condicion_pago text    default 'CONTADO',
  p_limite_credito numeric default 0,
  p_moneda         char(3) default 'USD',
  p_especial       boolean default false,
  p_retencion_iva  numeric default 75,
  p_exento_iva     boolean default false,
  p_activo         boolean default true,
  p_notas          text    default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id  bigint;
  v_rif text := upper(trim(coalesce(p_rif, '')));
begin
  perform private.exigir_permiso('VENTAS', 'ESCRITURA');

  if length(trim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'La razón social del cliente es obligatoria.' using errcode = '22023';
  end if;

  if v_rif !~ '^[VEJPGC]-[0-9]{8}-[0-9]$' then
    raise exception 'El RIF "%" no tiene la forma J-12345678-9.', v_rif using errcode = '22023';
  end if;

  -- Dar crédito no es editar una ficha: es comprometer dinero de la empresa.
  if coalesce(p_limite_credito, 0) > 0 or p_condicion_pago <> 'CONTADO' then
    perform private.exigir_permiso('VENTAS', 'TOTAL');
  end if;

  if p_id is null then
    insert into public.clientes
      (rif, nombre, nombre_comercial, contacto, telefono, correo, direccion,
       condicion_pago, limite_credito, moneda_preferida, contribuyente_especial,
       retencion_iva, exento_iva, activo, notas, creado_por)
    values
      (v_rif, trim(p_nombre), nullif(trim(coalesce(p_nombre_comercial, '')), ''),
       nullif(trim(coalesce(p_contacto, '')), ''), nullif(trim(coalesce(p_telefono, '')), ''),
       lower(nullif(trim(coalesce(p_correo, '')), '')), nullif(trim(coalesce(p_direccion, '')), ''),
       coalesce(p_condicion_pago, 'CONTADO'), coalesce(p_limite_credito, 0),
       coalesce(p_moneda, 'USD'), coalesce(p_especial, false),
       coalesce(p_retencion_iva, 75), coalesce(p_exento_iva, false),
       coalesce(p_activo, true), nullif(trim(coalesce(p_notas, '')), ''),
       (select auth.uid()))
    returning id into v_id;
  else
    update public.clientes
       set rif = v_rif,
           nombre = trim(p_nombre),
           nombre_comercial = nullif(trim(coalesce(p_nombre_comercial, '')), ''),
           contacto = nullif(trim(coalesce(p_contacto, '')), ''),
           telefono = nullif(trim(coalesce(p_telefono, '')), ''),
           correo = lower(nullif(trim(coalesce(p_correo, '')), '')),
           direccion = nullif(trim(coalesce(p_direccion, '')), ''),
           condicion_pago = coalesce(p_condicion_pago, 'CONTADO'),
           limite_credito = coalesce(p_limite_credito, 0),
           moneda_preferida = coalesce(p_moneda, 'USD'),
           contribuyente_especial = coalesce(p_especial, false),
           retencion_iva = coalesce(p_retencion_iva, 75),
           exento_iva = coalesce(p_exento_iva, false),
           activo = coalesce(p_activo, true),
           notas = nullif(trim(coalesce(p_notas, '')), '')
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'No existe el cliente %.', p_id using errcode = 'P0002';
    end if;
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya hay un cliente registrado con el RIF %.', v_rif using errcode = '23505';
end;
$$;

-- ---------------------------------------------------------------------------
-- Precios
-- ---------------------------------------------------------------------------
create or replace function public.guardar_precio_venta(
  p_articulo_id bigint,
  p_precio      numeric,
  p_minimo      numeric default 0,
  p_moneda      char(3) default 'USD',
  p_nota        text    default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_categoria text;
begin
  -- Poner precios es decidir a cuánto vende la empresa. No lo hace quien
  -- despacha; hace falta el nivel más alto del módulo.
  perform private.exigir_permiso('VENTAS', 'TOTAL');

  select categoria into v_categoria from public.articulos where id = p_articulo_id;

  if v_categoria is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
  end if;

  if v_categoria not in ('PRODUCTO', 'SERVICIO') then
    raise exception 'Solo se le pone precio de venta a lo que se vende. "%" es %.',
      p_articulo_id, v_categoria using errcode = '22023';
  end if;

  if coalesce(p_precio, 0) <= 0 then
    raise exception 'El precio tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if coalesce(p_minimo, 0) > p_precio then
    raise exception 'El precio mínimo (%) no puede ser mayor que el precio (%).',
      p_minimo, p_precio using errcode = '22023';
  end if;

  insert into public.precios_venta
    (articulo_id, moneda, precio, precio_minimo, nota, actualizado_por, actualizado_en)
  values
    (p_articulo_id, coalesce(p_moneda, 'USD'), p_precio, coalesce(p_minimo, 0),
     nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()), now())
  on conflict (articulo_id) do update
    set moneda = excluded.moneda,
        precio = excluded.precio,
        precio_minimo = excluded.precio_minimo,
        nota = excluded.nota,
        actualizado_por = excluded.actualizado_por,
        actualizado_en = excluded.actualizado_en;

  return p_articulo_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cargar los renglones de un documento de venta
--
-- Los tres documentos reciben los renglones igual, así que la validación —que
-- el artículo exista, que la cantidad sea positiva, que el precio no baje del
-- mínimo— se escribe una vez.
-- ---------------------------------------------------------------------------
create or replace function private.cargar_renglones_venta(
  p_tabla     text,
  p_columna   text,
  p_id        bigint,
  p_renglones jsonb,
  p_moneda    char(3),
  p_fecha     date
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item      jsonb;
  v_linea     smallint := 0;
  v_articulo  record;
  v_precio    numeric;
  v_precio_usd numeric;
  v_minimo    record;
begin
  if p_renglones is null or jsonb_array_length(p_renglones) = 0 then
    raise exception 'Un documento sin renglones no dice nada. Agrega al menos uno.'
      using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_linea := v_linea + 1;

    select a.id, a.nombre, a.unidad, a.activo, a.inventariable
      into v_articulo
    from public.articulos a
    where a.id = (v_item ->> 'articulo_id')::bigint;

    if v_articulo.id is null then
      raise exception 'El renglón % apunta a un artículo que no existe.', v_linea
        using errcode = 'P0002';
    end if;

    if not v_articulo.activo then
      raise exception 'El artículo "%" está dado de baja y no se puede vender.',
        v_articulo.nombre using errcode = '22023';
    end if;

    if coalesce((v_item ->> 'cantidad')::numeric, 0) <= 0 then
      raise exception 'La cantidad de "%" tiene que ser mayor que cero.', v_articulo.nombre
        using errcode = '22023';
    end if;

    v_precio := coalesce((v_item ->> 'precio_unitario')::numeric, 0);

    -- El mínimo puede estar en otra moneda que el documento. Se comparan los
    -- dos en dólares: es lo único que hace comparable un precio en bolívares
    -- de hoy con un mínimo puesto en dólares hace tres meses.
    select p.precio_minimo, p.moneda into v_minimo
    from public.precios_venta p where p.articulo_id = v_articulo.id;

    if v_minimo.precio_minimo is not null and v_minimo.precio_minimo > 0 then
      v_precio_usd := private.en_dolares(v_precio, p_moneda, p_fecha);

      if v_precio_usd < private.en_dolares(v_minimo.precio_minimo, v_minimo.moneda, p_fecha) - 0.000001
         and not private.tiene_permiso('VENTAS', 'TOTAL') then
        raise exception 'De "%" no se vende por debajo de % %. Se está ofreciendo % %.',
          v_articulo.nombre, v_minimo.precio_minimo, v_minimo.moneda, v_precio, p_moneda
          using errcode = '22023';
      end if;
    end if;

    execute format(
      'insert into public.%I (%I, linea, articulo_id, descripcion, cantidad, unidad,
                              precio_unitario, exento_iva)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id',
      p_tabla, p_columna)
    using p_id, v_linea, v_articulo.id,
          coalesce(nullif(trim(coalesce(v_item ->> 'descripcion', '')), ''), v_articulo.nombre),
          (v_item ->> 'cantidad')::numeric,
          coalesce(nullif(v_item ->> 'unidad', ''), v_articulo.unidad),
          v_precio,
          coalesce((v_item ->> 'exento_iva')::boolean, false);
  end loop;

  return v_linea;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cotizar
-- ---------------------------------------------------------------------------
create or replace function public.crear_cotizacion_venta(
  p_cliente_id   bigint,
  p_renglones    jsonb,
  p_moneda       char(3) default null,
  p_validez_dias integer default 15,
  p_alicuota_iva numeric default null,
  p_descuento    numeric default 0,
  p_flete        numeric default 0,
  p_fecha        date    default null,
  p_observacion  text    default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cliente record;
  v_fecha   date := coalesce(p_fecha, current_date);
  v_moneda  char(3);
  v_tasas   record;
  v_id      bigint;
begin
  perform private.exigir_permiso('VENTAS', 'ESCRITURA');

  select * into v_cliente from public.clientes where id = p_cliente_id;

  if v_cliente.id is null then
    raise exception 'No existe el cliente %.', p_cliente_id using errcode = 'P0002';
  end if;

  if not v_cliente.activo then
    raise exception 'El cliente "%" está inactivo.', v_cliente.nombre using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'No se cotiza con fecha futura.' using errcode = '22023';
  end if;

  v_moneda := coalesce(p_moneda, v_cliente.moneda_preferida);
  select * into v_tasas from private.tasas_del_dia(v_moneda, v_fecha);

  insert into public.cotizaciones_venta
    (numero, cliente_id, fecha, validez_dias, moneda, tasa, tasa_usd,
     alicuota_iva, descuento, flete, observacion, creada_por)
  values
    (private.siguiente_numero('COTV'), p_cliente_id, v_fecha,
     coalesce(p_validez_dias, 15), v_moneda, v_tasas.tasa, v_tasas.tasa_usd,
     case when v_cliente.exento_iva then 0 else coalesce(p_alicuota_iva, 16) end,
     coalesce(p_descuento, 0), coalesce(p_flete, 0),
     nullif(trim(coalesce(p_observacion, '')), ''), (select auth.uid()))
  returning id into v_id;

  perform private.cargar_renglones_venta(
    'cotizacion_venta_renglones', 'cotizacion_id', v_id, p_renglones, v_moneda, v_fecha);

  return v_id;
end;
$$;

create or replace function public.cerrar_cotizacion_venta(
  p_id     bigint,
  p_estado text,
  p_motivo text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cot record;
begin
  perform private.exigir_permiso('VENTAS', 'ESCRITURA');

  if p_estado not in ('ACEPTADA', 'RECHAZADA', 'ANULADA') then
    raise exception 'Una cotización solo se cierra como aceptada, rechazada o anulada.'
      using errcode = '22023';
  end if;

  select * into v_cot from public.cotizaciones_venta where id = p_id;

  if v_cot.id is null then
    raise exception 'No existe la cotización %.', p_id using errcode = 'P0002';
  end if;

  if v_cot.estado <> 'ENVIADA' then
    raise exception 'La cotización % ya está %.', v_cot.numero, lower(v_cot.estado)
      using errcode = '55000';
  end if;

  update public.cotizaciones_venta
     set estado = p_estado,
         motivo_cierre = nullif(trim(coalesce(p_motivo, '')), ''),
         cerrada_por = (select auth.uid()),
         cerrada_en = now()
   where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Despachar
--
-- Todo en una transacción: o sale el material del patio y queda la nota, o no
-- pasa ninguna de las dos cosas. Un despacho a medias es material que se fue
-- del patio sin papel, y eso no se descubre hasta el inventario físico.
-- ---------------------------------------------------------------------------
create or replace function public.despachar(
  p_cliente_id   bigint,
  p_almacen_id   bigint,
  p_renglones    jsonb,
  p_moneda       char(3) default null,
  p_cotizacion_id bigint default null,
  p_vehiculo     text    default null,
  p_chofer       text    default null,
  p_cedula_chofer text   default null,
  p_peso_bruto   numeric default null,
  p_peso_tara    numeric default null,
  p_ticket       text    default null,
  p_alicuota_iva numeric default null,
  p_descuento    numeric default 0,
  p_flete        numeric default 0,
  p_fecha        date    default null,
  p_observacion  text    default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cliente  record;
  v_almacen  record;
  v_fecha    date := coalesce(p_fecha, current_date);
  v_moneda   char(3);
  v_tasas    record;
  v_id       bigint;
  v_reng     record;
  v_existe   numeric;
  v_costo    numeric;
  v_mov      bigint;
begin
  perform private.exigir_permiso('VENTAS', 'ESCRITURA');

  select * into v_cliente from public.clientes where id = p_cliente_id;
  if v_cliente.id is null then
    raise exception 'No existe el cliente %.', p_cliente_id using errcode = 'P0002';
  end if;
  if not v_cliente.activo then
    raise exception 'El cliente "%" está inactivo.', v_cliente.nombre using errcode = '22023';
  end if;

  select * into v_almacen from public.almacenes where id = p_almacen_id;
  if v_almacen.id is null then
    raise exception 'No existe el almacén %.', p_almacen_id using errcode = 'P0002';
  end if;
  if not v_almacen.activo then
    raise exception 'El almacén "%" está cerrado.', v_almacen.nombre using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'No se despacha con fecha futura.' using errcode = '22023';
  end if;

  v_moneda := coalesce(p_moneda, v_cliente.moneda_preferida);
  select * into v_tasas from private.tasas_del_dia(v_moneda, v_fecha);

  insert into public.notas_entrega
    (numero, cliente_id, cotizacion_id, almacen_id, fecha, vehiculo, chofer,
     cedula_chofer, peso_bruto, peso_tara, ticket_romana, moneda, tasa, tasa_usd,
     alicuota_iva, descuento, flete, observacion, despachada_por)
  values
    (private.siguiente_numero('NE'), p_cliente_id, p_cotizacion_id, p_almacen_id,
     v_fecha, nullif(trim(coalesce(p_vehiculo, '')), ''),
     nullif(trim(coalesce(p_chofer, '')), ''), nullif(trim(coalesce(p_cedula_chofer, '')), ''),
     p_peso_bruto, p_peso_tara, nullif(trim(coalesce(p_ticket, '')), ''),
     v_moneda, v_tasas.tasa, v_tasas.tasa_usd,
     case when v_cliente.exento_iva then 0 else coalesce(p_alicuota_iva, 16) end,
     coalesce(p_descuento, 0), coalesce(p_flete, 0),
     nullif(trim(coalesce(p_observacion, '')), ''), (select auth.uid()))
  returning id into v_id;

  perform private.cargar_renglones_venta(
    'nota_entrega_renglones', 'nota_id', v_id, p_renglones, v_moneda, v_fecha);

  -- Ahora el patio. Renglón por renglón, comprobando existencia antes de
  -- restar: sacar más de lo que hay deja el almacén en negativo, y una
  -- existencia negativa no es un dato sino un error que alguien tendrá que
  -- deshacer a mano.
  for v_reng in
    select r.id, r.articulo_id, r.cantidad, a.nombre, a.inventariable
    from public.nota_entrega_renglones r
    join public.articulos a on a.id = r.articulo_id
    where r.nota_id = v_id
    order by r.linea
  loop
    -- Un servicio —un flete— se cobra pero no sale de ningún almacén.
    continue when not v_reng.inventariable;

    v_existe := private.existencia(p_almacen_id, v_reng.articulo_id);

    if v_reng.cantidad > v_existe then
      raise exception 'En "%" hay % de "%" y se están despachando %.',
        v_almacen.nombre, v_existe, v_reng.nombre, v_reng.cantidad
        using errcode = '22023';
    end if;

    v_costo := private.costo_promedio(p_almacen_id, v_reng.articulo_id);

    v_mov := private.registrar_movimiento(
      'SALIDA_DESPACHO', (-1)::smallint, p_almacen_id, v_reng.articulo_id,
      v_reng.cantidad, v_costo,
      format('DESPACHO A %s', v_cliente.nombre), null, null, null, v_fecha);

    update public.nota_entrega_renglones set movimiento_id = v_mov where id = v_reng.id;
  end loop;

  -- Si venía de una cotización, esa cotización quedó aceptada de hecho.
  if p_cotizacion_id is not null then
    update public.cotizaciones_venta
       set estado = 'ACEPTADA', cerrada_por = (select auth.uid()), cerrada_en = now()
     where id = p_cotizacion_id and estado = 'ENVIADA';
  end if;

  return v_id;
end;
$$;

create or replace function public.anular_nota_entrega(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nota record;
  v_reng record;
begin
  -- Anular un despacho devuelve material al patio con un asiento que nadie
  -- contó. Es una corrección, no una operación del día.
  perform private.exigir_permiso('VENTAS', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se anula. Un despacho anulado sin motivo no se puede auditar.'
      using errcode = '22023';
  end if;

  select * into v_nota from public.notas_entrega where id = p_id;

  if v_nota.id is null then
    raise exception 'No existe la nota de entrega %.', p_id using errcode = 'P0002';
  end if;

  if v_nota.estado = 'ANULADA' then
    raise exception 'La nota % ya estaba anulada.', v_nota.numero using errcode = '55000';
  end if;

  if v_nota.estado = 'FACTURADA' then
    raise exception 'La nota % ya está en la factura. Anula primero la factura.', v_nota.numero
      using errcode = '55000';
  end if;

  -- Se reversa exactamente lo que esta nota descontó, por su número de
  -- movimiento. Buscar "una salida parecida" devolvería la del camión de al
  -- lado el día que dos despachos coincidan en artículo y cantidad.
  for v_reng in
    select r.movimiento_id, m.almacen_id, m.articulo_id, m.cantidad, m.costo_usd
    from public.nota_entrega_renglones r
    join public.inventario_movimientos m on m.id = r.movimiento_id
    where r.nota_id = p_id and r.movimiento_id is not null
  loop
    perform private.registrar_movimiento(
      'REVERSO', (1)::smallint, v_reng.almacen_id, v_reng.articulo_id,
      v_reng.cantidad, v_reng.costo_usd,
      format('ANULACIÓN DE LA NOTA %s: %s', v_nota.numero, trim(p_motivo)),
      null, null, v_reng.movimiento_id, current_date);
  end loop;

  update public.notas_entrega
     set estado = 'ANULADA',
         motivo_anulacion = trim(p_motivo),
         anulada_por = (select auth.uid()),
         anulada_en = now()
   where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Facturar
--
-- Se factura contra notas de entrega, una o varias: es normal juntarle a un
-- cliente los seis viajes de la semana en un solo papel. Todas tienen que ser
-- del mismo cliente y de la misma moneda — si no, no hay un total que escribir.
-- ---------------------------------------------------------------------------
create or replace function public.facturar_notas(
  p_notas          bigint[],
  p_condicion_pago text default null,
  p_fecha          date default null,
  p_observacion    text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cliente   record;
  v_fecha     date := coalesce(p_fecha, current_date);
  v_notas     record;
  v_condicion text;
  v_dias      smallint;
  v_id        bigint;
  v_linea     smallint := 0;
  v_reng      record;
  v_deuda     numeric;
  v_total_usd numeric;
  v_iva       numeric;
begin
  perform private.exigir_permiso('VENTAS', 'ESCRITURA');

  if p_notas is null or array_length(p_notas, 1) is null then
    raise exception 'No hay notas de entrega que facturar.' using errcode = '22023';
  end if;

  select count(*)                       as cuantas,
         count(distinct n.cliente_id)   as clientes,
         count(distinct n.moneda)       as monedas,
         count(distinct n.alicuota_iva) as alicuotas,
         min(n.cliente_id)              as cliente_id,
         min(n.moneda)                  as moneda,
         min(n.alicuota_iva)            as alicuota,
         sum(n.descuento)               as descuento,
         sum(n.flete)                   as flete,
         count(*) filter (where n.estado <> 'DESPACHADA') as no_despachadas
    into v_notas
  from public.notas_entrega n
  where n.id = any(p_notas);

  if v_notas.cuantas <> array_length(p_notas, 1) then
    raise exception 'Alguna de las notas indicadas no existe.' using errcode = 'P0002';
  end if;

  if v_notas.no_despachadas > 0 then
    raise exception 'Solo se facturan notas despachadas: % de las indicadas ya están facturadas o anuladas.',
      v_notas.no_despachadas using errcode = '55000';
  end if;

  if v_notas.clientes > 1 then
    raise exception 'Las notas son de % clientes distintos. Una factura es de un solo cliente.',
      v_notas.clientes using errcode = '22023';
  end if;

  if v_notas.monedas > 1 then
    raise exception 'Las notas están en monedas distintas y no se pueden sumar en una factura.'
      using errcode = '22023';
  end if;

  if v_notas.alicuotas > 1 then
    raise exception 'Las notas llevan alícuotas de IVA distintas. Factúralas por separado.'
      using errcode = '22023';
  end if;

  select * into v_cliente from public.clientes where id = v_notas.cliente_id;

  v_condicion := coalesce(p_condicion_pago, v_cliente.condicion_pago);
  v_dias := case v_condicion
              when 'CREDITO_15' then 15
              when 'CREDITO_30' then 30
              when 'CREDITO_60' then 60
              else 0
            end;

  insert into public.facturas_venta
    (numero, numero_control, cliente_id, fecha, condicion_pago, dias_credito, vence_el,
     moneda, tasa, tasa_usd, alicuota_iva, descuento, flete, observacion, emitida_por)
  select
    private.siguiente_numero('FAC'), private.siguiente_control(), v_cliente.id, v_fecha,
    v_condicion, v_dias, v_fecha + v_dias,
    v_notas.moneda, t.tasa, t.tasa_usd, v_notas.alicuota,
    coalesce(v_notas.descuento, 0), coalesce(v_notas.flete, 0),
    nullif(trim(coalesce(p_observacion, '')), ''), (select auth.uid())
  from private.tasas_del_dia(v_notas.moneda, v_fecha) t
  returning id into v_id;

  -- Los renglones se copian, no se referencian: la factura tiene que seguir
  -- diciendo lo mismo aunque después alguien anule la nota de la que salió.
  for v_reng in
    select r.*, n.id as origen
    from public.nota_entrega_renglones r
    join public.notas_entrega n on n.id = r.nota_id
    where r.nota_id = any(p_notas)
    order by n.fecha, n.numero, r.linea
  loop
    v_linea := v_linea + 1;
    insert into public.factura_venta_renglones
      (factura_id, linea, articulo_id, descripcion, cantidad, unidad,
       precio_unitario, exento_iva, nota_id)
    values
      (v_id, v_linea, v_reng.articulo_id, v_reng.descripcion, v_reng.cantidad,
       v_reng.unidad, v_reng.precio_unitario, v_reng.exento_iva, v_reng.origen);
  end loop;

  -- La retención se calcula sobre el IVA ya cuadrado por el disparador.
  if v_cliente.contribuyente_especial then
    select iva into v_iva from public.facturas_venta where id = v_id;
    update public.facturas_venta
       set retencion_iva = round(v_iva * v_cliente.retencion_iva / 100, 2)
     where id = v_id;
  end if;

  -- El techo del crédito, después de conocer el total y antes de dar el
  -- documento por bueno. Un aviso que se salta con un clic, se salta.
  if v_dias > 0 then
    select total_usd into v_total_usd from public.facturas_venta where id = v_id;

    if v_cliente.limite_credito <= 0 then
      raise exception 'A "%" no se le tiene autorizado crédito. Fija su límite o factúrale de contado.',
        v_cliente.nombre using errcode = '55000';
    end if;

    -- La deuda ya incluye esta factura: acaba de emitirse como EMITIDA.
    v_deuda := private.deuda_cliente(v_cliente.id);

    if v_deuda > v_cliente.limite_credito and not private.tiene_permiso('VENTAS', 'TOTAL') then
      raise exception 'Con esta factura "%" quedaría debiendo % $ y su límite es % $.',
        v_cliente.nombre, round(v_deuda, 2), round(v_cliente.limite_credito, 2)
        using errcode = '55000';
    end if;
  end if;

  update public.notas_entrega
     set estado = 'FACTURADA', factura_id = v_id
   where id = any(p_notas);

  return v_id;
end;
$$;

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
begin
  perform private.exigir_permiso('VENTAS', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se anula. Una factura anulada sin motivo no se puede explicar.'
      using errcode = '22023';
  end if;

  select * into v_fac from public.facturas_venta where id = p_id;

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

  update public.facturas_venta
     set estado = 'ANULADA',
         motivo_anulacion = trim(p_motivo),
         anulada_por = (select auth.uid()),
         anulada_en = now()
   where id = p_id;

  -- El material salió igual. Las notas vuelven a estar por facturar para que
  -- esa entrega no se pierda con el papel que se anuló.
  update public.notas_entrega
     set estado = 'DESPACHADA', factura_id = null
   where factura_id = p_id and estado = 'FACTURADA';
end;
$$;

-- ---------------------------------------------------------------------------
-- Cobrar
-- ---------------------------------------------------------------------------
create or replace function public.registrar_cobro(
  p_factura_id bigint,
  p_cuenta_id  bigint,
  p_monto      numeric,
  p_metodo     text default 'TRANSFERENCIA',
  p_fecha      date default null,
  p_referencia text default null,
  p_igtf       boolean default null,
  p_nota       text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fac     record;
  v_cuenta  record;
  v_cliente record;
  v_fecha   date := coalesce(p_fecha, current_date);
  v_tasas   record;
  v_saldo   numeric;
  v_monto_usd numeric;
  v_igtf    boolean;
  v_id      bigint;
  v_mov     bigint;
  v_mov_igtf bigint;
  v_igtf_monto numeric;
begin
  perform private.exigir_permiso('VENTAS', 'ESCRITURA');

  select * into v_fac from public.v_facturas_venta where id = p_factura_id;

  if v_fac.id is null then
    raise exception 'No existe la factura %.', p_factura_id using errcode = 'P0002';
  end if;

  if v_fac.estado <> 'EMITIDA' then
    raise exception 'La factura % está % y no admite cobros.', v_fac.numero, lower(v_fac.estado)
      using errcode = '55000';
  end if;

  select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta_id;

  if v_cuenta.id is null then
    raise exception 'No existe la cuenta %.', p_cuenta_id using errcode = 'P0002';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto del cobro tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'No se registra un cobro con fecha futura.' using errcode = '22023';
  end if;

  -- El cobro entra en la moneda de la cuenta donde cae el dinero: si el pago
  -- llegó a la cuenta en bolívares, el cobro es en bolívares aunque la factura
  -- esté en dólares. Por eso el saldo se compara en dólares y no en la moneda
  -- de la factura.
  select * into v_tasas from private.tasas_del_dia(v_cuenta.moneda, v_fecha);
  v_monto_usd := round(p_monto * v_tasas.tasa / v_tasas.tasa_usd, 2);
  v_saldo := v_fac.saldo_usd;

  if v_monto_usd > v_saldo + 0.01 then
    raise exception 'A la factura % le faltan % $ y se están abonando % $. Si el cliente pagó de más, regístralo como dos cobros o revisa la tasa del día.',
      v_fac.numero, round(v_saldo, 2), round(v_monto_usd, 2) using errcode = '22023';
  end if;

  -- El IGTF grava los pagos en divisas. Se propone según la moneda de la
  -- cuenta y se puede desactivar: hay cobros exentos y quien registra lo sabe.
  v_igtf := coalesce(p_igtf, v_cuenta.moneda <> 'VES');

  select * into v_cliente from public.clientes where id = v_fac.cliente_id;

  insert into public.cobros_venta
    (numero, factura_id, cuenta_id, fecha, metodo, moneda, tasa, tasa_usd,
     monto, igtf_aplica, referencia, nota, registrado_por)
  values
    (private.siguiente_numero('COB'), p_factura_id, p_cuenta_id, v_fecha,
     coalesce(p_metodo, 'TRANSFERENCIA'), v_cuenta.moneda, v_tasas.tasa, v_tasas.tasa_usd,
     p_monto, v_igtf, nullif(trim(coalesce(p_referencia, '')), ''),
     nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  select igtf_monto into v_igtf_monto from public.cobros_venta where id = v_id;

  v_mov := private.registrar_movimiento_tesoreria(
    p_cuenta_id, 'INGRESO', 1, p_monto,
    format('COBRO DE LA FACTURA %s', v_fac.numero),
    v_fecha, p_referencia, v_cliente.nombre, null, null, null, p_nota);

  -- El IGTF entra como asiento aparte porque no es de la empresa: es un
  -- impuesto que se recauda y se entrega. Mezclado con el cobro haría creer
  -- que el cliente pagó más de lo que abonó.
  if v_igtf and v_igtf_monto > 0 then
    v_mov_igtf := private.registrar_movimiento_tesoreria(
      p_cuenta_id, 'IGTF', 1, v_igtf_monto,
      format('IGTF COBRADO EN LA FACTURA %s', v_fac.numero),
      v_fecha, p_referencia, v_cliente.nombre, null, null, v_mov, null);
  end if;

  update public.cobros_venta
     set movimiento_id = v_mov, movimiento_igtf_id = v_mov_igtf
   where id = v_id;

  -- Cerrada cuando no queda saldo. El centavo de tolerancia es del redondeo de
  -- las tasas, no de la cuenta.
  if (select saldo_usd from public.v_facturas_venta where id = p_factura_id) <= 0.01 then
    update public.facturas_venta set estado = 'COBRADA' where id = p_factura_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.anular_cobro(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cobro  record;
  v_fac    record;
begin
  perform private.exigir_permiso('VENTAS', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se anula el cobro.' using errcode = '22023';
  end if;

  select * into v_cobro from public.cobros_venta where id = p_id;

  if v_cobro.id is null then
    raise exception 'No existe el cobro %.', p_id using errcode = 'P0002';
  end if;

  if v_cobro.estado = 'ANULADO' then
    raise exception 'El cobro % ya estaba anulado.', v_cobro.numero using errcode = '55000';
  end if;

  select * into v_fac from public.facturas_venta where id = v_cobro.factura_id;

  -- El dinero que entró tiene que salir del libro con su propio asiento. El
  -- libro de tesorería no se edita: se le escribe el contrario.
  perform private.registrar_movimiento_tesoreria(
    v_cobro.cuenta_id, 'REVERSO', -1, v_cobro.monto,
    format('ANULACIÓN DEL COBRO %s DE LA FACTURA %s: %s',
           v_cobro.numero, v_fac.numero, trim(p_motivo)),
    current_date, v_cobro.referencia, null, null, null, v_cobro.movimiento_id, null);

  if v_cobro.igtf_monto > 0 then
    perform private.registrar_movimiento_tesoreria(
      v_cobro.cuenta_id, 'REVERSO', -1, v_cobro.igtf_monto,
      format('ANULACIÓN DEL IGTF DEL COBRO %s', v_cobro.numero),
      current_date, v_cobro.referencia, null, null, null, v_cobro.movimiento_igtf_id, null);
  end if;

  update public.cobros_venta
     set estado = 'ANULADO',
         motivo_anulacion = trim(p_motivo),
         anulado_por = (select auth.uid()),
         anulado_en = now()
   where id = p_id;

  -- Vuelve a deber. Una factura marcada como cobrada con un cobro que se anuló
  -- desaparecería de la cobranza debiendo dinero.
  update public.facturas_venta set estado = 'EMITIDA'
   where id = v_cobro.factura_id and estado = 'COBRADA';
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
--
-- Igual que en compras: todo se lee desde la aplicación y nada se escribe. Cada
-- cambio pasa por una función que comprueba el permiso y la transición.
-- ---------------------------------------------------------------------------
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'clientes', 'precios_venta',
    'cotizaciones_venta', 'cotizacion_venta_renglones',
    'notas_entrega', 'nota_entrega_renglones',
    'facturas_venta', 'factura_venta_renglones',
    'cobros_venta'
  ] loop
    execute format('alter table public.%I enable row level security', v_tabla);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', v_tabla);
    execute format('grant select on public.%I to authenticated', v_tabla);
    execute format('drop policy if exists %I on public.%I', v_tabla || '_lectura', v_tabla);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      v_tabla || '_lectura', v_tabla);
  end loop;
end
$$;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.guardar_cliente(bigint, text, text, text, text, text, text, text, text, numeric, char, boolean, numeric, boolean, boolean, text)',
    'public.guardar_precio_venta(bigint, numeric, numeric, char, text)',
    'public.crear_cotizacion_venta(bigint, jsonb, char, integer, numeric, numeric, numeric, date, text)',
    'public.cerrar_cotizacion_venta(bigint, text, text)',
    'public.despachar(bigint, bigint, jsonb, char, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text)',
    'public.anular_nota_entrega(bigint, text)',
    'public.facturar_notas(bigint[], text, date, text)',
    'public.anular_factura(bigint, text)',
    'public.registrar_cobro(bigint, bigint, numeric, text, date, text, boolean, text)',
    'public.anular_cobro(bigint, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant   execute on function %s to authenticated', v_fn);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- La matriz de permisos para el rol nuevo
--
-- Solo si está vacía para VENTAS: reaplicar la migración no debe deshacer lo
-- que la administración haya ajustado después.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.rol_permisos where rol = 'VENTAS') then
    raise notice 'El rol VENTAS ya tiene permisos asignados: no se tocan.';
  else
    insert into public.rol_permisos (rol, modulo, nivel) values
      ('VENTAS', 'PANEL',      'LECTURA'),
      ('VENTAS', 'VENTAS',     'ESCRITURA'),
      ('VENTAS', 'INVENTARIO', 'LECTURA'),
      ('VENTAS', 'DESPACHOS',  'ESCRITURA'),
      ('VENTAS', 'TESORERIA',  'LECTURA'),
      ('VENTAS', 'TASAS',      'LECTURA');
  end if;

  -- ADMIN entra por private.tiene_permiso, pero la pantalla lo dibuja desde la
  -- matriz: sin esta fila aparecería en blanco en un módulo que sí alcanza.
  insert into public.rol_permisos (rol, modulo, nivel)
  values ('ADMIN', 'VENTAS', 'TOTAL')
  on conflict (rol, modulo) do nothing;

  -- La gerencia ya tenía VENTAS en lectura; se le sube a TOTAL porque es quien
  -- autoriza el crédito y quien anula una factura.
  update public.rol_permisos set nivel = 'TOTAL'
   where rol = 'GERENTE_GENERAL' and modulo = 'VENTAS' and nivel = 'LECTURA';
end
$$;

-- ---------------------------------------------------------------------------
-- Los datos, en mayúscula y sin tildes
-- ---------------------------------------------------------------------------
do $$
declare
  v_tabla text;
  v_cols  text;
  v_col   text;
  v_mapa  text[][] := array[
    ['clientes',                   'rif, nombre, nombre_comercial, contacto, direccion, notas'],
    ['precios_venta',              'nota'],
    ['cotizaciones_venta',         'observacion, motivo_cierre'],
    ['cotizacion_venta_renglones', 'descripcion'],
    ['notas_entrega',              'vehiculo, chofer, cedula_chofer, ticket_romana, observacion, motivo_anulacion'],
    ['nota_entrega_renglones',     'descripcion'],
    ['facturas_venta',             'observacion, motivo_anulacion'],
    ['factura_venta_renglones',    'descripcion'],
    ['cobros_venta',               'referencia, nota, motivo_anulacion']
  ];
begin
  for i in 1 .. array_length(v_mapa, 1) loop
    v_tabla := v_mapa[i][1];
    v_cols  := (select string_agg(format('%L', trim(c)), ', ')
                  from unnest(string_to_array(v_mapa[i][2], ',')) c);

    execute format('drop trigger if exists trg_normalizar on public.%I', v_tabla);
    execute format(
      'create trigger trg_normalizar before insert or update on public.%I
         for each row execute function private.normalizar_texto(%s)',
      v_tabla, v_cols);

    foreach v_col in array string_to_array(replace(v_mapa[i][2], ' ', ''), ',') loop
      execute format(
        'update public.%I set %I = private.en_mayuscula(%I)
          where %I is not null and %I is distinct from private.en_mayuscula(%I)',
        v_tabla, v_col, v_col, v_col, v_col, v_col);
    end loop;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Auditoría
--
-- Es el mismo bloque de la migración de auditoría, que saca las tablas del
-- catálogo. Se vuelve a correr para que las nueve tablas nuevas queden
-- vigiladas: si no, todo el módulo de ventas quedaría fuera del registro y esa
-- es justo la parte donde se mueve la plata que entra.
-- ---------------------------------------------------------------------------
do $$
declare
  v_t record;
begin
  for v_t in
    select c.relname as tabla,
           coalesce(
             (select string_agg(format('%L', a.attname), ', ' order by k.ord)
                from pg_index i
                cross join lateral unnest(i.indkey) with ordinality as k(att, ord)
                join pg_attribute a on a.attrelid = c.oid and a.attnum = k.att
               where i.indrelid = c.oid and i.indisprimary),
             '') as clave
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relname not in (
         'auditoria', 'correlativos', 'notificaciones', 'notificaciones_leidas',
         'nomina_recibo_lineas'
       )
     order by c.relname
  loop
    execute format('drop trigger if exists trg_auditar on public.%I', v_t.tabla);
    execute format(
      'create trigger trg_auditar after insert or update or delete on public.%I
         for each row execute function private.auditar(%s)',
      v_t.tabla, v_t.clave);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Tiempo real
--
-- Dos personas facturando a la vez tienen que ver la misma cola de notas por
-- facturar, o la segunda emite un papel por material que ya se facturó.
-- ---------------------------------------------------------------------------
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'clientes', 'precios_venta',
    'cotizaciones_venta', 'cotizacion_venta_renglones',
    'notas_entrega', 'nota_entrega_renglones',
    'facturas_venta', 'factura_venta_renglones',
    'cobros_venta'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_tabla
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_tabla);
    end if;
  end loop;
end
$$;
