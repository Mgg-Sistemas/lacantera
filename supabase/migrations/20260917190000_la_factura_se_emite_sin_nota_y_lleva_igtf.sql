/*
  LA FACTURA SE EMITE SIN NOTA, LA NOTA SE ENLAZA DESPUÉS, Y LA FACTURA LLEVA IGTF

  Christopher, 17/09/2026: «independizar más notas de entrega y facturas entre
  sí: que se pueda crear una factura sin necesidad de nota de entrega y
  viceversa». Y sus respuestas:

    - una factura sin nota DESCUENTA el material del patio al emitir, con patio
      por renglón como el despacho;
    - una nota hecha aparte se puede ENLAZAR después a una factura que ya
      existe: la nota pasa a facturada con ese número y la factura no cambia;
    - el IGTF va en la factura como el IVA: casilla desmarcada, 3 % editable;
    - la cotización lleva IVA e IGTF solo si quien la hace los marca;
    - «las facturas sí o sí tendrán IVA o IGTF»: al menos uno de los dos. Un
      cliente exento de IVA es la excepción, para no dejarlo sin factura.

  Las dos primeras chocan si se toman al pie de la letra: una factura que ya
  sacó el material y una nota enlazada que también lo sacó lo descuentan dos
  veces. Así que la factura directa dice si el material sale con ella
  (`saca_material`, por defecto sí). Si no sale, el material saldrá después con
  notas de entrega, que son las únicas que se le pueden enlazar.

  PIEZAS

    facturas_venta ........... alicuota_igtf, igtf, origen (NOTAS | DIRECTA),
                               saca_material, almacen_id (el patio por defecto).
    factura_venta_renglones .. almacen_id y movimiento_id, como en la nota.
    cotizaciones_venta ....... alicuota_igtf, igtf.
    recalcular_venta ......... suma el IGTF donde hay columna: sobre el total con
                               IVA, y al total.
    cargar_renglones_venta ... también carga renglones de factura; lo que sale
                               del patio solo si el renglón lo dice.
    facturar_notas ........... + p_alicuota_igtf.
    facturar_directo ......... nueva: la factura con sus propios renglones.
    enlazar_nota_a_factura ... nueva. Y desenlazar, para deshacer un error.
    anular_factura ........... devuelve al patio lo que la factura directa sacó.
    crear_cotizacion_venta ... + p_alicuota_igtf, y sin IVA si no se pide.
    registrar_cobro .......... no vuelve a cobrar IGTF a una factura que ya lo
                               lleva.
    v_facturas_venta, v_cotizaciones_venta: las columnas nuevas, al final.
*/

-- ============================================================== columnas

alter table public.facturas_venta
  add column alicuota_igtf numeric(5,2) not null default 0,
  add column igtf numeric(20,6) not null default 0,
  add column origen text not null default 'NOTAS',
  add column saca_material boolean not null default false,
  add column almacen_id bigint references public.almacenes(id),
  add constraint facturas_venta_alicuota_igtf_rango check (alicuota_igtf >= 0 and alicuota_igtf <= 100),
  add constraint facturas_venta_origen_check check (origen in ('NOTAS', 'DIRECTA')),
  add constraint facturas_venta_material_solo_directa check (not saca_material or origen = 'DIRECTA');

comment on column public.facturas_venta.origen is
  'NOTAS: se emitió a partir de notas de entrega. DIRECTA: con sus propios renglones.';
comment on column public.facturas_venta.saca_material is
  'Solo en una directa: el material salió del patio al emitirla. Si no, sale después con notas enlazadas.';

alter table public.factura_venta_renglones
  add column almacen_id bigint references public.almacenes(id),
  add column movimiento_id bigint references public.inventario_movimientos(id);

alter table public.cotizaciones_venta
  add column alicuota_igtf numeric(5,2) not null default 0,
  add column igtf numeric(20,6) not null default 0,
  add constraint cotizaciones_venta_alicuota_igtf_rango check (alicuota_igtf >= 0 and alicuota_igtf <= 100);

-- ============================================================== la suma

create or replace function private.recalcular_venta(p_tabla text, p_columna text, p_id bigint)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_subtotal      numeric(20,6);
  v_gravado       numeric(20,6);
  v_descuento     numeric(20,6);
  v_flete         numeric(20,6);
  v_alicuota      numeric(5,2);
  v_proporcion    numeric(20,10);
  v_base          numeric(20,6);
  v_iva           numeric(20,6);
  v_alicuota_igtf numeric(5,2) := 0;
  v_igtf          numeric(20,6) := 0;
  -- Solo la cotización y la factura llevan IGTF: la nota de entrega no menciona
  -- impuestos y la nota de crédito corrige lo que ya se facturó.
  v_con_igtf      boolean := p_tabla in ('cotizaciones_venta', 'facturas_venta');
  v_renglones     text := case p_tabla
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

  if v_con_igtf then
    execute format('select alicuota_igtf from public.%I where id = $1', p_tabla)
      into v_alicuota_igtf using p_id;
  end if;

  -- Sin alícuota no hay base imponible: lo que se vendió sin IVA es exento, y
  -- así tiene que llegar al libro de ventas. Antes entraba como base al 0 %.
  if coalesce(v_alicuota, 0) = 0 then
    v_base := 0;
  elsif v_subtotal > 0 then
    v_proporcion := v_gravado / v_subtotal;

    v_base := round(
      greatest(v_gravado - v_descuento * v_proporcion, 0)
      + v_flete * v_proporcion, 6);
  else
    v_base := v_flete;
  end if;

  v_iva := round(v_base * v_alicuota / 100, 2);

  -- El IGTF grava el pago en divisas, que es el total con IVA.
  v_igtf := round((v_subtotal - v_descuento + v_flete + v_iva) * coalesce(v_alicuota_igtf, 0) / 100, 2);

  if v_con_igtf then
    execute format(
      'update public.%I
          set subtotal = $1, base_imponible = $2, iva = $3, igtf = $4, total = $5
        where id = $6', p_tabla)
      using v_subtotal, v_base, v_iva, v_igtf,
            round(v_subtotal - v_descuento + v_flete + v_iva + v_igtf, 2), p_id;
  else
    execute format(
      'update public.%I
          set subtotal = $1, base_imponible = $2, iva = $3, total = $4
        where id = $5', p_tabla)
      using v_subtotal, v_base, v_iva,
            round(v_subtotal - v_descuento + v_flete + v_iva, 2), p_id;
  end if;
end;
$func$;

-- ============================================================== renglones de factura

do $parche$
declare
  v_def text := pg_get_functiondef('private.cargar_renglones_venta(text, text, bigint, jsonb, character, date)'::regprocedure);
  v_n   integer;
  r     record;
begin
  for r in
    select * from (values
      (1,
       $a$  v_nota       boolean := p_tabla = 'nota_entrega_renglones';
$a$,
       $b$  v_nota       boolean := p_tabla = 'nota_entrega_renglones';
  v_factura    boolean := p_tabla = 'factura_venta_renglones';
  v_sale       boolean;
$b$),
      (2,
       $a$  if p_tabla not in ('cotizacion_venta_renglones', 'nota_entrega_renglones') then$a$,
       $b$  if p_tabla not in ('cotizacion_venta_renglones', 'nota_entrega_renglones', 'factura_venta_renglones') then$b$),
      (3,
       $a$    if v_nota and v_articulo.inventariable then
$a$,
       $b$    -- En la nota sale siempre; en una factura directa, solo si su material
    -- sale con ella (lo dice `sale_del_patio`, que pone facturar_directo).
    v_sale := v_articulo.inventariable
              and (v_nota or (v_factura and coalesce((v_item ->> 'sale_del_patio')::boolean, false)));

    if v_sale then
$b$),
      (4,
       $a$    else
      insert into public.cotizacion_venta_renglones$a$,
       $b$    elsif v_factura then
      insert into public.factura_venta_renglones
        (factura_id, linea, articulo_id, descripcion, cantidad, unidad, precio_unitario, exento_iva,
         condicion, precio_lista, descuento_pct, descuento_unitario, motivo_condicion,
         cantidad_inventario, medida, densidad_usada, almacen_id)
      values
        (p_id, v_linea, v_articulo.id,
         coalesce(nullif(trim(coalesce(v_item ->> 'descripcion', '')), ''), v_articulo.nombre),
         v_cantidad, v_unidad, v_precio,
         coalesce((v_item ->> 'exento_iva')::boolean, false),
         v_condicion, v_lista, v_pct, v_rebaja, v_motivo,
         v_inventario, v_medida, v_densidad,
         case when v_sale then nullif(v_item ->> 'almacen_id', '')::bigint end);
    else
      insert into public.cotizacion_venta_renglones$b$)
    ) as t(n, antes, despues)
    order by n
  loop
    v_n := (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes);
    if v_n <> 1 then
      raise exception 'En cargar_renglones_venta el texto % aparece % veces.', r.n, v_n;
    end if;
    v_def := replace(v_def, r.antes, r.despues);
  end loop;
  execute v_def;
end
$parche$;

-- ============================================================== facturar notas, con IGTF

do $parche$
declare
  v_def text := pg_get_functiondef('public.facturar_notas(bigint[], text, date, text, numeric)'::regprocedure);
  v_n   integer;
  r     record;
begin
  for r in
    select * from (values
      (1,
       $a$p_alicuota_iva numeric DEFAULT NULL::numeric)
 RETURNS bigint$a$,
       $b$p_alicuota_iva numeric DEFAULT NULL::numeric, p_alicuota_igtf numeric DEFAULT 0)
 RETURNS bigint$b$),
      (2,
       $a$    raise exception 'La alícuota del IVA tiene que estar entre 0 y 100. Llegó %.', p_alicuota_iva
      using errcode = '22023';
  end if;$a$,
       $b$    raise exception 'La alícuota del IVA tiene que estar entre 0 y 100. Llegó %.', p_alicuota_iva
      using errcode = '22023';
  end if;

  if coalesce(p_alicuota_igtf, 0) < 0 or coalesce(p_alicuota_igtf, 0) > 100 then
    raise exception 'La alícuota del IGTF tiene que estar entre 0 y 100. Llegó %.', p_alicuota_igtf
      using errcode = '22023';
  end if;$b$),
      (3,
       $a$alicuota_iva, descuento, flete, observacion, emitida_por)$a$,
       $b$alicuota_iva, descuento, flete, observacion, emitida_por, alicuota_igtf)$b$),
      (4,
       $a$(select auth.uid())
  from private.tasas_del_dia(v_notas.moneda, v_fecha) t$a$,
       $b$(select auth.uid()), coalesce(p_alicuota_igtf, 0)
  from private.tasas_del_dia(v_notas.moneda, v_fecha) t$b$),
      (5,
       $a$                     from public.empresa e limit 1), 16)
  end;
$a$,
       $b$                     from public.empresa e limit 1), 16)
  end;

  -- «Las facturas sí o sí tendrán IVA o IGTF» (17/09/2026): al menos uno.
  if not v_cliente.exento_iva and v_alicuota = 0 and coalesce(p_alicuota_igtf, 0) = 0 then
    raise exception 'Una factura lleva IVA, IGTF o los dos: marca al menos uno.' using errcode = '22023';
  end if;
$b$)
    ) as t(n, antes, despues)
    order by n
  loop
    v_n := (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes);
    if v_n <> 1 then
      raise exception 'En facturar_notas el texto % aparece % veces.', r.n, v_n;
    end if;
    v_def := replace(v_def, r.antes, r.despues);
  end loop;
  drop function public.facturar_notas(bigint[], text, date, text, numeric);
  execute v_def;
end
$parche$;

revoke all on function public.facturar_notas(bigint[], text, date, text, numeric, numeric) from public, anon;
grant execute on function public.facturar_notas(bigint[], text, date, text, numeric, numeric) to authenticated, service_role;

-- ============================================================== factura directa

create or replace function public.facturar_directo(
  p_cliente_id     bigint,
  p_renglones      jsonb,
  p_moneda         text    default null,
  p_condicion_pago text    default null,
  p_fecha          date    default null,
  p_observacion    text    default null,
  p_alicuota_iva   numeric default null,
  p_alicuota_igtf  numeric default 0,
  p_saca_material  boolean default true,
  p_almacen_id     bigint  default null
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_cliente   record;
  v_fecha     date := coalesce(p_fecha, current_date);
  v_moneda    text;
  v_tasas     record;
  v_condicion text;
  v_dias      smallint;
  v_alicuota  numeric;
  v_sale      boolean := coalesce(p_saca_material, true);
  v_id        bigint;
  v_numero    text;
  v_renglones jsonb;
  v_reng      record;
  v_existe    numeric;
  v_costo     numeric;
  v_mov       bigint;
  v_iva       numeric;
  v_deuda     numeric;
begin
  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');

  select * into v_cliente from public.clientes where id = p_cliente_id;
  if v_cliente.id is null then
    raise exception 'No existe el cliente %.', p_cliente_id using errcode = 'P0002';
  end if;
  if not v_cliente.activo then
    raise exception 'El cliente "%" está inactivo.', v_cliente.nombre using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'No se factura con fecha futura.' using errcode = '22023';
  end if;

  if p_renglones is null or jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'Una factura sin renglones no dice nada. Agrega al menos uno.' using errcode = '22023';
  end if;

  if p_alicuota_iva is not null and (p_alicuota_iva < 0 or p_alicuota_iva > 100) then
    raise exception 'La alícuota del IVA tiene que estar entre 0 y 100. Llegó %.', p_alicuota_iva
      using errcode = '22023';
  end if;

  if coalesce(p_alicuota_igtf, 0) < 0 or coalesce(p_alicuota_igtf, 0) > 100 then
    raise exception 'La alícuota del IGTF tiene que estar entre 0 y 100. Llegó %.', p_alicuota_igtf
      using errcode = '22023';
  end if;

  if v_sale and p_almacen_id is not null
     and not exists (select 1 from public.almacenes where id = p_almacen_id) then
    raise exception 'No existe el almacén %.', p_almacen_id using errcode = 'P0002';
  end if;

  v_moneda := coalesce(p_moneda, v_cliente.moneda_preferida);
  select * into v_tasas from private.tasas_del_dia(v_moneda, v_fecha);

  v_condicion := coalesce(p_condicion_pago, v_cliente.condicion_pago);
  v_dias := case v_condicion
              when 'CREDITO_15' then 15
              when 'CREDITO_30' then 30
              when 'CREDITO_60' then 60
              else 0
            end;

  v_alicuota := case
    when v_cliente.exento_iva then 0
    when p_alicuota_iva is not null then p_alicuota_iva
    else coalesce((select case when e.aplica_iva then coalesce(e.alicuota_iva_pct, 16) else 0 end
                     from public.empresa e limit 1), 16)
  end;

  -- «Las facturas sí o sí tendrán IVA o IGTF» (17/09/2026): al menos uno. Un
  -- cliente exento de IVA puede ir sin ninguno.
  if not v_cliente.exento_iva and v_alicuota = 0 and coalesce(p_alicuota_igtf, 0) = 0 then
    raise exception 'Una factura lleva IVA, IGTF o los dos: marca al menos uno.' using errcode = '22023';
  end if;

  -- La cabecera va antes que los renglones: el disparador que suma lee de ella
  -- la alícuota del IVA y la del IGTF.
  insert into public.facturas_venta
    (numero, numero_control, cliente_id, fecha, condicion_pago, dias_credito, vence_el,
     moneda, tasa, tasa_usd, alicuota_iva, alicuota_igtf, descuento, flete,
     observacion, emitida_por, origen, saca_material, almacen_id)
  values
    (private.siguiente_numero('FAC'), private.siguiente_control(), v_cliente.id, v_fecha,
     v_condicion, v_dias, v_fecha + v_dias,
     v_moneda, v_tasas.tasa, v_tasas.tasa_usd, v_alicuota, coalesce(p_alicuota_igtf, 0), 0, 0,
     nullif(trim(coalesce(p_observacion, '')), ''), (select auth.uid()),
     'DIRECTA', v_sale, case when v_sale then p_almacen_id end)
  returning id, numero into v_id, v_numero;

  select jsonb_agg(e || jsonb_build_object('sale_del_patio', v_sale))
    into v_renglones
    from jsonb_array_elements(p_renglones) e;

  perform private.cargar_renglones_venta(
    'factura_venta_renglones', 'factura_id', v_id, v_renglones, v_moneda, v_fecha);

  /*
    EL MATERIAL SALE CON LA FACTURA. Lo mismo que hace `despachar`: cerrojos por
    casilla de patio en orden, existencia antes de restar, costo del patio, y la
    salida escrita en el patio de cada renglón.
  */
  if v_sale then
    if exists (
      select 1
        from public.factura_venta_renglones r
        join public.articulos a on a.id = r.articulo_id
       where r.factura_id = v_id and a.inventariable
         and coalesce(r.almacen_id, p_almacen_id) is null
    ) then
      raise exception 'Hay material sin patio: elige de qué patio sale la factura, o el de cada renglón.'
        using errcode = '22023';
    end if;

    for v_reng in
      select distinct coalesce(r.almacen_id, p_almacen_id) as almacen_id, r.articulo_id
        from public.factura_venta_renglones r
        join public.articulos a on a.id = r.articulo_id
       where r.factura_id = v_id and a.inventariable
       order by 1, 2
    loop
      perform pg_advisory_xact_lock(
        hashtextextended(format('patio:%s:%s', v_reng.almacen_id, v_reng.articulo_id), 0));
    end loop;

    for v_reng in
      select r.id, r.articulo_id, coalesce(r.cantidad_inventario, r.cantidad) as cantidad,
             r.cantidad as vendida, r.unidad, a.unidad as unidad_patio, a.nombre,
             al.id as almacen_id, al.nombre as almacen, al.activo as almacen_activo
        from public.factura_venta_renglones r
        join public.articulos a on a.id = r.articulo_id
        join public.almacenes al on al.id = coalesce(r.almacen_id, p_almacen_id)
       where r.factura_id = v_id and a.inventariable
       order by r.linea
    loop
      if not v_reng.almacen_activo then
        raise exception 'El almacén "%" está cerrado: «%» no puede salir de ahí.', v_reng.almacen, v_reng.nombre
          using errcode = '22023';
      end if;

      v_existe := private.existencia_para_escribir(v_reng.almacen_id, v_reng.articulo_id);

      if v_reng.cantidad > v_existe then
        raise exception 'En "%" hay % de "%" y se están facturando %.',
          v_reng.almacen, private.cantidad_es(v_existe), v_reng.nombre, private.cantidad_es(v_reng.cantidad)
          using errcode = '22023';
      end if;

      v_costo := private.costo_promedio(v_reng.almacen_id, v_reng.articulo_id);

      v_mov := private.registrar_movimiento(
        'SALIDA_DESPACHO', (-1)::smallint, v_reng.almacen_id, v_reng.articulo_id,
        v_reng.cantidad, v_costo,
        format('FACTURA %s A %s', v_numero, v_cliente.nombre), null, null, null, v_fecha,
        p_cantidad_capturada => case when v_reng.unidad <> v_reng.unidad_patio then v_reng.vendida end,
        p_unidad_capturada   => case when v_reng.unidad <> v_reng.unidad_patio then v_reng.unidad end);

      update public.factura_venta_renglones set movimiento_id = v_mov where id = v_reng.id;
    end loop;
  end if;

  -- La retención y el techo del crédito, igual que al facturar notas.
  if v_cliente.contribuyente_especial then
    select iva into v_iva from public.facturas_venta where id = v_id;
    update public.facturas_venta
       set retencion_iva = round(v_iva * v_cliente.retencion_iva / 100, 2)
     where id = v_id;
  end if;

  if v_dias > 0 then
    if v_cliente.limite_credito <= 0 then
      raise exception 'A "%" no se le tiene autorizado crédito. Fija su límite o factúrale de contado.',
        v_cliente.nombre using errcode = '55000';
    end if;

    v_deuda := private.deuda_cliente(v_cliente.id);

    if v_deuda > v_cliente.limite_credito and not private.tiene_permiso('FACTURACION', 'TOTAL') then
      raise exception 'Con esta factura "%" quedaría debiendo % $ y su límite es % $.',
        v_cliente.nombre, private.numero_es(v_deuda, 2), private.numero_es(v_cliente.limite_credito, 2)
        using errcode = '55000';
    end if;
  end if;

  return v_id;
end;
$func$;

revoke all on function public.facturar_directo(bigint, jsonb, text, text, date, text, numeric, numeric, boolean, bigint) from public, anon;
grant execute on function public.facturar_directo(bigint, jsonb, text, text, date, text, numeric, numeric, boolean, bigint) to authenticated, service_role;

-- ============================================================== enlazar

create or replace function public.enlazar_nota_a_factura(p_nota_id bigint, p_factura_id bigint)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_nota record;
  v_fac  record;
begin
  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');

  select * into v_nota from public.notas_entrega where id = p_nota_id for update;
  if v_nota.id is null then
    raise exception 'No existe la nota de entrega %.', p_nota_id using errcode = 'P0002';
  end if;
  if v_nota.estado <> 'DESPACHADA' then
    raise exception 'La nota % está %: solo se enlaza una nota despachada que no tenga factura.',
      v_nota.numero, lower(v_nota.estado) using errcode = '55000';
  end if;

  select * into v_fac from public.facturas_venta where id = p_factura_id for update;
  if v_fac.id is null then
    raise exception 'No existe la factura %.', p_factura_id using errcode = 'P0002';
  end if;
  if v_fac.estado = 'ANULADA' then
    raise exception 'La factura % está anulada.', v_fac.numero using errcode = '55000';
  end if;
  if v_fac.origen <> 'DIRECTA' then
    raise exception 'La factura % se emitió a partir de sus notas de entrega. Una nota se enlaza a una factura emitida sin nota.',
      v_fac.numero using errcode = '55000';
  end if;
  if v_fac.saca_material then
    raise exception 'La factura % ya sacó el material del patio al emitirse: enlazarle esta nota lo contaría dos veces.',
      v_fac.numero using errcode = '55000';
  end if;
  if v_fac.cliente_id <> v_nota.cliente_id then
    raise exception 'La nota % y la factura % son de clientes distintos.', v_nota.numero, v_fac.numero
      using errcode = '22023';
  end if;

  update public.notas_entrega
     set estado = 'FACTURADA', factura_id = v_fac.id
   where id = v_nota.id;
end;
$func$;

revoke all on function public.enlazar_nota_a_factura(bigint, bigint) from public, anon;
grant execute on function public.enlazar_nota_a_factura(bigint, bigint) to authenticated, service_role;

create or replace function public.desenlazar_nota_de_factura(p_nota_id bigint)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_nota record;
  v_fac  record;
begin
  perform private.exigir_permiso('FACTURACION', 'TOTAL');

  select * into v_nota from public.notas_entrega where id = p_nota_id for update;
  if v_nota.id is null then
    raise exception 'No existe la nota de entrega %.', p_nota_id using errcode = 'P0002';
  end if;

  select * into v_fac from public.facturas_venta where id = v_nota.factura_id;
  if v_nota.estado <> 'FACTURADA' or v_fac.id is null then
    raise exception 'La nota % no está enlazada a ninguna factura.', v_nota.numero using errcode = '55000';
  end if;

  -- Una nota de la que salió la factura está dentro de sus renglones: soltarla
  -- dejaría la factura cobrando algo sin papel. Esa se deshace anulando la factura.
  if v_fac.origen <> 'DIRECTA' then
    raise exception 'La factura % se emitió a partir de la nota %: para soltarla hay que anular la factura.',
      v_fac.numero, v_nota.numero using errcode = '55000';
  end if;

  update public.notas_entrega
     set estado = 'DESPACHADA', factura_id = null
   where id = v_nota.id;
end;
$func$;

revoke all on function public.desenlazar_nota_de_factura(bigint) from public, anon;
grant execute on function public.desenlazar_nota_de_factura(bigint) to authenticated, service_role;

-- ============================================================== anular devuelve el material

do $parche$
declare
  v_def text := pg_get_functiondef('public.anular_factura(bigint, text)'::regprocedure);
  v_n   integer;
  r     record;
begin
  for r in
    select * from (values
      (1,
       $a$  v_notas  integer;
$a$,
       $b$  v_notas  integer;
  v_reng   record;
$b$),
      (2,
       $a$  update public.notas_entrega
     set estado = 'DESPACHADA', factura_id = null$a$,
       $b$  -- Lo que una factura directa sacó del patio vuelve, por su número de
  -- movimiento, igual que al anular una nota de entrega.
  for v_reng in
    select r.movimiento_id, m.almacen_id, m.articulo_id, m.cantidad, m.costo_usd
      from public.factura_venta_renglones r
      join public.inventario_movimientos m on m.id = r.movimiento_id
     where r.factura_id = p_id and r.movimiento_id is not null
  loop
    perform private.registrar_movimiento(
      'REVERSO', (1)::smallint, v_reng.almacen_id, v_reng.articulo_id,
      v_reng.cantidad, v_reng.costo_usd,
      format('ANULACIÓN DE LA FACTURA %s: %s', v_fac.numero, trim(p_motivo)),
      null, null, v_reng.movimiento_id, current_date);
  end loop;

  update public.notas_entrega
     set estado = 'DESPACHADA', factura_id = null$b$)
    ) as t(n, antes, despues)
    order by n
  loop
    v_n := (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes);
    if v_n <> 1 then
      raise exception 'En anular_factura el texto % aparece % veces.', r.n, v_n;
    end if;
    v_def := replace(v_def, r.antes, r.despues);
  end loop;
  execute v_def;
end
$parche$;

-- ============================================================== cotización

do $parche$
declare
  v_def text := pg_get_functiondef('public.crear_cotizacion_venta(bigint, jsonb, character, integer, numeric, numeric, numeric, date, text)'::regprocedure);
  v_n   integer;
  r     record;
begin
  for r in
    select * from (values
      (1,
       $a$p_observacion text DEFAULT NULL::text)
 RETURNS bigint$a$,
       $b$p_observacion text DEFAULT NULL::text, p_alicuota_igtf numeric DEFAULT 0)
 RETURNS bigint$b$),
      (2,
       $a$    raise exception 'No se cotiza con fecha futura.' using errcode = '22023';
  end if;$a$,
       $b$    raise exception 'No se cotiza con fecha futura.' using errcode = '22023';
  end if;

  if coalesce(p_alicuota_igtf, 0) < 0 or coalesce(p_alicuota_igtf, 0) > 100 then
    raise exception 'La alícuota del IGTF tiene que estar entre 0 y 100. Llegó %.', p_alicuota_igtf
      using errcode = '22023';
  end if;$b$),
      (3,
       $a$alicuota_iva, descuento, flete, observacion, creada_por)$a$,
       $b$alicuota_iva, descuento, flete, observacion, creada_por, alicuota_igtf)$b$),
      (4,
       $a$     case when v_cliente.exento_iva then 0 else coalesce(p_alicuota_iva, 16) end,$a$,
       $b$     -- Sin IVA si quien cotiza no lo marca (17/09/2026).
     case when v_cliente.exento_iva then 0 else coalesce(p_alicuota_iva, 0) end,$b$),
      (5,
       $a$(select auth.uid()))
  returning id into v_id;$a$,
       $b$(select auth.uid()), coalesce(p_alicuota_igtf, 0))
  returning id into v_id;$b$)
    ) as t(n, antes, despues)
    order by n
  loop
    v_n := (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes);
    if v_n <> 1 then
      raise exception 'En crear_cotizacion_venta el texto % aparece % veces.', r.n, v_n;
    end if;
    v_def := replace(v_def, r.antes, r.despues);
  end loop;
  drop function public.crear_cotizacion_venta(bigint, jsonb, character, integer, numeric, numeric, numeric, date, text);
  execute v_def;
end
$parche$;

revoke all on function public.crear_cotizacion_venta(bigint, jsonb, character, integer, numeric, numeric, numeric, date, text, numeric) from public, anon;
grant execute on function public.crear_cotizacion_venta(bigint, jsonb, character, integer, numeric, numeric, numeric, date, text, numeric) to authenticated, service_role;

-- ============================================================== vistas

do $vistas$
declare
  v_def text;
begin
  v_def := pg_get_viewdef('public.v_facturas_venta'::regclass, true);
  if (length(v_def) - length(replace(v_def, $a$AS renglones
   FROM facturas_venta f$a$, ''))) / length($a$AS renglones
   FROM facturas_venta f$a$) <> 1 then
    raise exception 'v_facturas_venta no termina como se esperaba: no se toca.';
  end if;
  v_def := replace(v_def, $a$AS renglones
   FROM facturas_venta f$a$, $b$AS renglones,
    f.alicuota_igtf,
        CASE
            WHEN ( SELECT private.puede_accion('FACTURACION.VER_FACTURACION'::text) AS puede_accion) THEN f.igtf
            ELSE NULL::numeric
        END::numeric(20,6) AS igtf,
    f.origen,
    f.saca_material,
    f.almacen_id
   FROM facturas_venta f$b$);
  execute 'create or replace view public.v_facturas_venta with (security_invoker = on) as ' || v_def;

  v_def := pg_get_viewdef('public.v_cotizaciones_venta'::regclass, true);
  if (length(v_def) - length(replace(v_def, $a$AS despachos
   FROM cotizaciones_venta q$a$, ''))) / length($a$AS despachos
   FROM cotizaciones_venta q$a$) <> 1 then
    raise exception 'v_cotizaciones_venta no termina como se esperaba: no se toca.';
  end if;
  v_def := replace(v_def, $a$AS despachos
   FROM cotizaciones_venta q$a$, $b$AS despachos,
    q.alicuota_igtf,
        CASE
            WHEN ( SELECT private.puede_accion('VENTAS.VER_VENTAS'::text) AS puede_accion) THEN q.igtf
            ELSE NULL::numeric
        END::numeric(20,6) AS igtf
   FROM cotizaciones_venta q$b$);
  execute 'create or replace view public.v_cotizaciones_venta with (security_invoker = on) as ' || v_def;
end
$vistas$;

-- ============================================================== cobro

do $parche$
declare
  v_def   text := pg_get_functiondef('public.registrar_cobro(bigint, bigint, numeric, text, date, text, boolean, text)'::regprocedure);
  v_antes text := $a$  v_igtf := coalesce(p_igtf, v_cuenta.moneda <> 'VES');$a$;
  v_despues text := $b$  -- Una factura que ya lleva su IGTF no se lo vuelve a cobrar al cobrarla.
  v_igtf := coalesce(p_igtf, v_cuenta.moneda <> 'VES' and coalesce(v_fac.igtf, 0) = 0);$b$;
begin
  if (length(v_def) - length(replace(v_def, v_antes, ''))) / length(v_antes) <> 1 then
    raise exception 'registrar_cobro no decide el IGTF una sola vez: no se toca.';
  end if;
  execute replace(v_def, v_antes, v_despues);
end
$parche$;

-- ============================================================== comprobación

do $ver$
begin
  if position('v_igtf' in pg_get_functiondef('private.recalcular_venta(text, text, bigint)'::regprocedure)) = 0
     or position('factura_venta_renglones' in pg_get_functiondef('private.cargar_renglones_venta(text, text, bigint, jsonb, character, date)'::regprocedure)) = 0
     or position('p_alicuota_igtf' in pg_get_functiondef('public.facturar_notas(bigint[], text, date, text, numeric, numeric)'::regprocedure)) = 0
     or position('ANULACIÓN DE LA FACTURA' in pg_get_functiondef('public.anular_factura(bigint, text)'::regprocedure)) = 0
     or position('coalesce(p_alicuota_iva, 0)' in pg_get_functiondef('public.crear_cotizacion_venta(bigint, jsonb, character, integer, numeric, numeric, numeric, date, text, numeric)'::regprocedure)) = 0
     or position('v_fac.igtf' in pg_get_functiondef('public.registrar_cobro(bigint, bigint, numeric, text, date, text, boolean, text)'::regprocedure)) = 0
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'v_facturas_venta' and column_name = 'saca_material')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'v_cotizaciones_venta' and column_name = 'igtf') then
    raise exception 'la factura independiente no quedó entera';
  end if;
end
$ver$;
