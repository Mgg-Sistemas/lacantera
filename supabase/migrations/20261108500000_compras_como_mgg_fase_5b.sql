/*
  COMPRAS COMO MGG · FASE 5b
  REPORTES, HISTÓRICO Y RETIRO DEL FLUJO ANTERIOR

  Angélica, 07/11/2026: el módulo de compras se reemplaza por una copia exacta
  del de MGG, por fases. Las fases 0 a 5a dejaron «Pedidos / Compras» entero.
  Esta fase pone lo que MGG tiene en la barra de arriba y retira el flujo
  anterior del menú:

  1. «📊 REPORTE POR RENGLÓN» (MGG `ReporteComprasModal` +
     `comprasReporte.repository.ts`): las compras pendientes agrupadas en
     cuatro renglones —pendiente por aprobar, cuentas a crédito, por indicar
     método de pago y por pagar— con su código, tipo, motivo y monto.
     `public.compras_reporte_por_renglon()` arma las filas (lectura, sin
     escribir nada). Lo que cambia respecto a MGG:
       - El monto es el MONTO A PAGAR de La Cantera (total − descuento en el
         pago − retenciones, fase 3), no el total menos el descuento.
       - «Cuentas a crédito» también lleva el crédito que ya se mandó a
         recepción o se recibió y todavía debe saldo (aquí el crédito sale de
         «cuenta_abierta» antes de saldarse; en MGG no).
       - Los servicios directos: «Factura cargada» (por_pagar) va a «Por
         indicar método de pago» y «Confirmada pagar» a «Por pagar» (en MGG,
         todos los directos por pagar van a «Por pagar»). No hay compra
         directa de MGG: la de La Cantera es otra cosa y no entra.

  2. «📆 CIERRE DIARIO» (MGG `CierreDiarioModal` + `cierreDiario*.ts`):
     `public.compras_cierre_diario(desde, hasta)` cuenta, en horario de
     Venezuela, los pedidos creados, las OC que entraron a «pendiente por
     aprobar» y siguen ahí, las que entraron a pago y siguen sin pagarse (con
     su detalle) y las pagadas; la actividad por analista (cotizaciones
     cargadas y órdenes finalizadas). SIN TESORERÍA, el cierre suma además
     los PAGOS del período, que salen de Compras: las OC pagadas (contado,
     anticipado y contra entrega), los abonos de los créditos y los servicios
     directos pagados, con el total, las retenciones y el monto pagado.

  3. «COMPRAS ANTERIORES» del Histórico: `public.v_compras_anteriores`, la
     vista de siempre del flujo anterior (`v_compras_todas`, una fila por
     solicitud con su orden) más si fue una compra directa y cuándo se
     finalizó. Solo lectura y con la seguridad de quien la lee
     (`security_invoker`), igual que las vistas viejas.

  4. «PEDIR EL MERCADO» DE ALIMENTACIÓN, AL FLUJO NUEVO. `solicitar_mercado`
     era la última puerta viva que creaba pedidos en el flujo anterior
     (`solicitudes_pedido`). Conserva su firma, su permiso (Alimentación en
     escritura: la cocina no lleva Compras) y lo que devuelve (`id`,
     `numero`), pero ahora crea la Solicitud de Mercado de la fase 5a en
     `compras_ordenes`: SP-…, URGENTE, finalidad «PEDIDO PARA RESTABLECER EL
     MERCADO», unidad COCINA, en «Pendiente» (sin revisión del almacén) y
     recibida en el almacén general. `ultima_lista_de_mercado` sugiere las
     cantidades de la última, sea nueva o del flujo anterior.

  LO QUE NO SE TOCA: las tablas y los datos del flujo anterior (siguen ahí,
  de solo lectura en el Histórico), la Compra Directa y la Conciliación de
  Pagos de La Cantera, combustible. `crear_pedido` y `aprobar_compra` siguen
  vivas pero ya ninguna pantalla las llama (se retiró «Nuevo pedido» y el
  tablero anterior); `comprar_directo` es la Compra Directa.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. 📊 Reporte de compras por renglón (MGG `listReporteCompras`)
-- ═══════════════════════════════════════════════════════════════════════════

/*
  Una fila por compra pendiente, ya con su renglón. El agrupado y los totales
  los hace la pantalla (igual que MGG `agruparReporte`), para que pantalla,
  PDF, Excel y WhatsApp digan lo mismo.
*/
create or replace function public.compras_reporte_por_renglon()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform private.exigir_usuario_activo();
  if not private.tiene_permiso('COMPRAS', 'LECTURA') then
    raise exception 'Sin permiso para ver Compras.' using errcode = '42501';
  end if;

  with ordenes as (
    select o.id,
           case
             when o.estado = 'oc_creada' then 'pendiente_aprobar'
             when o.estado = 'cuenta_abierta' then 'cuenta_abierta'
             when o.condiciones_pago = 'credito' and o.estado in ('por_recibir', 'recibida')
                  and private.compras_saldo_credito(o) > 0.01 then 'cuenta_abierta'
             when o.estado = 'confirmada_metodo' then 'indicar_metodo'
             when o.estado = 'oc_aprobada' then 'por_pagar'
           end as grupo,
           case when o.clase = 'servicio' then 'Servicio' else 'OC' end as tipo,
           coalesce(o.oc_codigo, o.codigo) as codigo,
           coalesce(
             nullif(regexp_replace(btrim(coalesce(o.motivo, '')), '\s+', ' ', 'g'), ''),
             nullif(regexp_replace(btrim(coalesce(o.finalidad, '')), '\s+', ' ', 'g'), ''),
             nullif(regexp_replace(btrim(coalesce(o.notas, '')), '\s+', ' ', 'g'), ''),
             nullif((select string_agg(btrim(i ->> 'nombre'), ', ')
                       from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) i
                      where coalesce((i ->> 'comprar')::boolean, true)
                        and btrim(coalesce(i ->> 'nombre', '')) <> ''), ''),
             '—') as motivo,
           coalesce(p.nombre, '—') as proveedor,
           private.compras_monto_a_pagar(o) as monto,
           case when coalesce(o.moneda, '') ~* '(bs|ves)' then 'Bs' else 'USD' end as moneda,
           round(coalesce(o.abonado_total, 0), 2) as abonado,
           private.compras_saldo_credito(o) as saldo_credito,
           coalesce(o.oc_aprobada_en, o.oc_creada_en, o.creado_en) as fecha
      from public.compras_ordenes o
      left join public.proveedores p on p.id = o.proveedor_id
     where o.estado in ('oc_creada', 'cuenta_abierta', 'confirmada_metodo', 'oc_aprobada', 'por_recibir', 'recibida')
  ),
  filas as (
    select o.grupo, o.tipo, 'orden' as origen, o.id, o.codigo, o.motivo, o.proveedor, o.monto, o.moneda,
           case when o.grupo = 'cuenta_abierta' then o.abonado else 0 end as abonado,
           case when o.grupo = 'cuenta_abierta' then o.saldo_credito else o.monto end as saldo,
           o.fecha
      from ordenes o
     where o.grupo is not null
    union all
    select case when s.estado = 'por_pagar' then 'indicar_metodo' else 'por_pagar' end,
           'Servicio directo', 'servicio_directo', s.id, s.codigo,
           coalesce(nullif(regexp_replace(btrim(coalesce(s.nota, '')), '\s+', ' ', 'g'), ''),
                    nullif(btrim(coalesce(s.descripcion, '')), ''), '—'),
           coalesce(nullif(btrim(coalesce(s.proveedor_nombre, '')), ''), nullif(btrim(coalesce(s.equipo_nombre, '')), ''), '—'),
           private.compras_sd_monto_a_pagar(s),
           case when coalesce(s.moneda, '') ~* '(bs|ves)' then 'Bs' else 'USD' end,
           0, private.compras_sd_monto_a_pagar(s),
           coalesce(s.metodo_pago_en, s.montado_en, s.creado_en)
      from public.compras_servicios_directos s
     where s.estado in ('por_pagar', 'confirmada_pagar')
       and s.pagada_en is null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'grupo', f.grupo,
           'tipo', f.tipo,
           'origen', f.origen,
           'id', f.id,
           'codigo', f.codigo,
           'motivo', f.motivo,
           'proveedor', f.proveedor,
           'monto', f.monto,
           'moneda', f.moneda,
           'abonado', f.abonado,
           'saldo', f.saldo,
           'fecha', f.fecha)
         order by array_position(array['pendiente_aprobar', 'cuenta_abierta', 'indicar_metodo', 'por_pagar'], f.grupo),
                  f.fecha, f.codigo), '[]'::jsonb)
    into v
    from filas f;

  return v;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. 📆 Cierre diario (MGG `cargarCierreDiario`), sin Tesorería
-- ═══════════════════════════════════════════════════════════════════════════

/*
  Del día `p_desde` al día `p_hasta`, los dos incluidos, en horario de
  Venezuela (una orden de las 9 p. m. del 20 no es del 21). Un rango al revés
  se endereza; sin fechas, hoy.

  Las cuatro cantidades de MGG:
    pedidos             solicitudes creadas (las sub-OC no cuentan aparte);
    pendientes_aprobar  OC en «Ordenes pendiente por aprobar» que entraron
                        ahí en el período (oc_creada_en) y siguen ahí;
    por_pagar           OC confirmadas sin pagar (por indicar método o ya
                        «Confirmada pagar») que entraron a pago en el período:
                        con método, la última vez que se indicó; sin método,
                        cuando se aprobó la OC (MGG `fechaEntradaPago`);
    pagadas             OC pagadas en el período (una anulada no cuenta).

  Y lo que La Cantera suma porque no hay Tesorería: `pagos`, cada pago del
  período —OC pagada que no es a crédito, abono de un crédito, servicio
  directo pagado— con el total, las retenciones y el monto pagado en $.
*/
create or replace function public.compras_cierre_diario(p_desde date default null, p_hasta date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy   date := (now() at time zone 'America/Caracas')::date;
  v_desde date := coalesce(p_desde, p_hasta, v_hoy);
  v_hasta date := coalesce(p_hasta, p_desde, v_hoy);
  v_tmp   date;
  v_ini   timestamptz;
  v_fin   timestamptz;
  v_res   jsonb;
begin
  perform private.exigir_usuario_activo();
  if not private.tiene_permiso('COMPRAS', 'LECTURA') then
    raise exception 'Sin permiso para ver Compras.' using errcode = '42501';
  end if;

  if v_desde > v_hasta then
    v_tmp := v_desde;
    v_desde := v_hasta;
    v_hasta := v_tmp;
  end if;
  if v_hasta - v_desde > 1100 then
    raise exception 'El cierre abarca hasta tres años: acorte el rango.' using errcode = '22023';
  end if;

  v_ini := v_desde::timestamp at time zone 'America/Caracas';
  v_fin := (v_hasta + 1)::timestamp at time zone 'America/Caracas';

  with por_pagar as (
    select o.id,
           coalesce(o.oc_codigo, o.codigo) as codigo,
           coalesce(p.nombre, '—') as proveedor,
           private.compras_monto_a_pagar(o) as monto,
           case when coalesce(o.moneda, '') ~* '(bs|ves)' then 'Bs' else 'USD' end as moneda,
           o.estado,
           case when o.estado = 'oc_aprobada'
                then coalesce((select max((e ->> 'at')::timestamptz)
                                 from jsonb_array_elements(coalesce(o.historial, '[]'::jsonb)) e
                                where e ->> 'evento' = 'metodo_pago'),
                              o.metodo_pago_en, o.oc_aprobada_en, o.creado_en)
                else coalesce(o.oc_aprobada_en, o.creado_en)
           end as entrada
      from public.compras_ordenes o
      left join public.proveedores p on p.id = o.proveedor_id
     where o.estado in ('confirmada_metodo', 'oc_aprobada')
       and o.pagada_en is null
  ),
  por_pagar_rango as (
    select * from por_pagar where entrada >= v_ini and entrada < v_fin
  ),
  cotizaciones as (
    select f.registrada_por as uid, max(f.registrada_por_nombre) as nombre, count(*) as n
      from public.compras_ofertas f
     where f.registrada_en >= v_ini and f.registrada_en < v_fin
     group by f.registrada_por
  ),
  finalizadas as (
    select o.finalizada_por as uid, max(o.finalizada_por_nombre) as nombre, count(*) as n
      from public.compras_ordenes o
     where o.estado = 'finalizada' and o.finalizada_en >= v_ini and o.finalizada_en < v_fin
       and o.finalizada_por is not null
     group by o.finalizada_por
  ),
  analistas as (
    select coalesce(c.uid, f.uid) as uid,
           coalesce(pf.nombre, c.nombre, f.nombre, '—') as nombre,
           coalesce(c.n, 0) as cotizaciones,
           coalesce(f.n, 0) as finalizadas
      from cotizaciones c
      full join finalizadas f on f.uid = c.uid
      left join public.perfiles pf on pf.id = coalesce(c.uid, f.uid)
  ),
  pagos as (
    -- La OC o el servicio pagado de una vez (el crédito se paga por abonos).
    select 'orden' as origen, o.id,
           case when o.clase = 'servicio' then 'Servicio' else 'OC' end as tipo,
           coalesce(o.oc_codigo, o.codigo) as codigo,
           coalesce(p.nombre, '—') as proveedor,
           o.pagada_en as fecha,
           o.pagada_por_nombre as pagado_por,
           (private.compras_bases_pago(o)).o_total as total,
           coalesce(o.retenciones, '[]'::jsonb) as retenciones,
           private.compras_suma_retenciones(o.retenciones) as total_retenciones,
           round(greatest(coalesce(o.descuento_pago, 0), 0), 2) as descuento,
           round(coalesce(o.pago_monto_usd, private.compras_monto_a_pagar(o)), 2) as monto_pagado,
           coalesce((select jsonb_agg(m ->> 'metodo') from jsonb_array_elements(
                       case when jsonb_typeof(o.metodo_pago) = 'array' then o.metodo_pago else '[]'::jsonb end) m),
                    '[]'::jsonb) as metodos,
           o.pago_referencia as referencia,
           o.pago_moneda as moneda_pago,
           o.pago_monto as monto_moneda
      from public.compras_ordenes o
      left join public.proveedores p on p.id = o.proveedor_id
     where o.pagada_en >= v_ini and o.pagada_en < v_fin
       and o.estado <> 'anulada'
       and o.condiciones_pago is distinct from 'credito'
    union all
    -- Cada abono de un crédito, el día que se registró.
    select 'abono', a.id, 'Abono',
           coalesce(o.oc_codigo, o.codigo),
           coalesce(p.nombre, '—'),
           a.registrado_en,
           a.registrado_por_nombre,
           null::numeric,
           '[]'::jsonb,
           0::numeric,
           0::numeric,
           round(coalesce(a.monto, 0), 2),
           jsonb_build_array(a.metodo),
           a.referencia,
           a.moneda,
           a.monto_moneda
      from public.compras_abonos a
      join public.compras_ordenes o on o.id = a.orden_id
      left join public.proveedores p on p.id = o.proveedor_id
     where a.registrado_en >= v_ini and a.registrado_en < v_fin
    union all
    -- El servicio directo pagado.
    select 'servicio_directo', s.id, 'Servicio directo',
           s.codigo,
           coalesce(nullif(btrim(coalesce(s.proveedor_nombre, '')), ''), '—'),
           s.pagada_en,
           s.pagada_por_nombre,
           round(coalesce(s.gasto, 0), 2),
           coalesce(s.retenciones, '[]'::jsonb),
           private.compras_suma_retenciones(s.retenciones),
           round(greatest(coalesce(s.descuento_pago, 0), 0), 2),
           round(coalesce(s.pago_monto_usd, private.compras_sd_monto_a_pagar(s)), 2),
           coalesce((select jsonb_agg(m ->> 'metodo') from jsonb_array_elements(
                       case when jsonb_typeof(s.metodo_pago) = 'array' then s.metodo_pago else '[]'::jsonb end) m),
                    '[]'::jsonb),
           s.pago_referencia,
           s.pago_moneda,
           s.pago_monto
      from public.compras_servicios_directos s
     where s.pagada_en >= v_ini and s.pagada_en < v_fin
  )
  select jsonb_build_object(
    'desde', v_desde,
    'hasta', v_hasta,
    'pedidos', (select count(*) from public.compras_ordenes o
                 where o.parent_orden_id is null and o.creado_en >= v_ini and o.creado_en < v_fin),
    'pendientes_aprobar', (select count(*) from public.compras_ordenes o
                            where o.estado = 'oc_creada'
                              and coalesce(o.oc_creada_en, o.creado_en) >= v_ini
                              and coalesce(o.oc_creada_en, o.creado_en) < v_fin),
    'por_pagar', (select count(*) from por_pagar_rango),
    'pagadas', (select count(*) from public.compras_ordenes o
                 where o.pagada_en >= v_ini and o.pagada_en < v_fin and o.estado <> 'anulada'),
    'por_pagar_detalle', coalesce((select jsonb_agg(jsonb_build_object(
                             'id', r.id, 'codigo', r.codigo, 'proveedor', r.proveedor, 'monto', r.monto,
                             'moneda', r.moneda, 'estado', r.estado, 'entrada', r.entrada)
                           order by r.proveedor, r.codigo) from por_pagar_rango r), '[]'::jsonb),
    'analistas', coalesce((select jsonb_agg(jsonb_build_object(
                     'id', a.uid, 'nombre', a.nombre, 'cotizaciones', a.cotizaciones, 'finalizadas', a.finalizadas)
                   order by a.nombre) from analistas a), '[]'::jsonb),
    'total_cotizaciones', (select coalesce(sum(n), 0) from cotizaciones),
    'total_finalizadas', (select count(*) from public.compras_ordenes o
                           where o.estado = 'finalizada' and o.finalizada_en >= v_ini and o.finalizada_en < v_fin),
    'pagos', coalesce((select jsonb_agg(jsonb_build_object(
                 'origen', g.origen, 'id', g.id, 'tipo', g.tipo, 'codigo', g.codigo, 'proveedor', g.proveedor,
                 'fecha', g.fecha, 'pagado_por', g.pagado_por, 'total', g.total, 'retenciones', g.retenciones,
                 'total_retenciones', g.total_retenciones, 'descuento', g.descuento, 'monto_pagado', g.monto_pagado,
                 'metodos', g.metodos, 'referencia', g.referencia, 'moneda_pago', g.moneda_pago,
                 'monto_moneda', g.monto_moneda)
               order by g.fecha, g.codigo) from pagos g), '[]'::jsonb),
    'total_pagado', (select coalesce(round(sum(g.monto_pagado), 2), 0) from pagos g),
    'total_retenciones', (select coalesce(round(sum(g.total_retenciones), 2), 0) from pagos g))
  into v_res;

  return v_res;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. «Compras anteriores» del Histórico (solo lectura)
-- ═══════════════════════════════════════════════════════════════════════════

/*
  La vista de siempre del flujo anterior, con dos datos más para la pestaña:
  si fue una compra directa (la Compra Directa sigue viva y vive en las
  mismas tablas) y cuándo se finalizó. `security_invoker`: cada quien ve lo
  que las políticas de `solicitudes_pedido` le dejan ver, como en el tablero
  anterior.
*/
create or replace view public.v_compras_anteriores
with (security_invoker = true)
as
select t.solicitud_id,
       t.numero,
       t.titulo,
       t.prioridad,
       t.destino,
       t.estado_solicitud,
       t.creada_en,
       t.solicitante,
       t.registrada_por_nombre,
       t.orden_id,
       t.orden_numero,
       t.estado_orden,
       t.condicion_pago,
       t.proveedor,
       t.moneda,
       t.total,
       t.total_usd,
       t.total_bs,
       t.renglones,
       t.columna,
       t.historico_en,
       t.historico_columna,
       t.historico_nota,
       s.directa,
       s.finalidad,
       s.finalizada_en
  from public.v_compras_todas t
  join public.solicitudes_pedido s on s.id = t.solicitud_id;

revoke all on public.v_compras_anteriores from public, anon;
grant select on public.v_compras_anteriores to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. «Pedir el mercado» de Alimentación → Solicitud de Mercado del flujo nuevo
-- ═══════════════════════════════════════════════════════════════════════════

/*
  La misma puerta de siempre (`solicitar_mercado(p_renglones, p_almacen_id,
  p_nota)`, permiso de Alimentación en escritura, las mismas validaciones y
  los mismos mensajes), pero lo que crea es la Solicitud de Mercado de MGG en
  `compras_ordenes` (fase 5a, `compras_crear_solicitud_mercado`): SP-…,
  URGENTE, «PEDIDO PARA RESTABLECER EL MERCADO», clasificación «Mercado»,
  unidad COCINA, en «Pendiente» y con aviso a Compras. Quien pide queda como
  solicitante (la cocinera o la analista que firmó).

  Lo que cambia, a la fuerza:
    - Se recibe en el ALMACÉN GENERAL, como toda compra del flujo nuevo. Si
      la cocina eligió otro almacén, queda escrito en la nota para que
      Compras lo sepa (el traslado se hace después, por Salidas).
    - La observación de cada renglón va en la nota (los renglones de MGG no
      llevan observación).
    - Devuelve además `codigo` y `estado`; `numero` es el código SP-….
*/
create or replace function public.solicitar_mercado(p_renglones jsonb, p_almacen_id bigint default null, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item     jsonb;
  v_articulo record;
  v_nombre   text;
  v_vistos   bigint[] := '{}';
  v_items    jsonb    := '[]'::jsonb;
  v_obs      text[]   := '{}';
  v_destino  text;
  v_general  bigint   := private.almacen_que_revisa_pedidos();
  v_unidad   text;
  v_notas    text;
  v_o        public.compras_ordenes;
begin
  perform private.exigir_permiso('ALIMENTACION', 'ESCRITURA');

  if p_renglones is null
     or jsonb_typeof(p_renglones) <> 'array'
     or jsonb_array_length(p_renglones) = 0 then
    raise exception 'La lista del mercado está vacía: marque al menos un víver.'
      using errcode = '22023';
  end if;

  if p_almacen_id is not null then
    select nombre into v_destino
    from public.almacenes
    where id = p_almacen_id and activo;

    if v_destino is null then
      raise exception 'Ese almacén no existe o está inactivo.' using errcode = '23503';
    end if;
  end if;

  /*
    Cada renglón trae un artículo del catálogo (articulo_id) o un texto libre
    (descripcion), igual que antes. Con artículo, el nombre y la unidad salen
    del catálogo; sin él, va como renglón general (Compras le pone el nombre
    de inventario al cotizar).
  */
  for v_item in select * from jsonb_array_elements(p_renglones) loop
    if coalesce((v_item->>'cantidad')::numeric, 0) <= 0 then
      raise exception 'Hay un renglón sin cantidad: póngala o quítelo de la lista.'
        using errcode = '22023';
    end if;

    if nullif(v_item->>'articulo_id', '') is not null then
      select id, nombre, unidad into v_articulo
      from public.articulos
      where id = (v_item->>'articulo_id')::bigint and activo;

      if v_articulo.id is null then
        raise exception 'Un renglón trae un artículo que no existe o está inactivo.'
          using errcode = '23503';
      end if;

      if v_articulo.id = any(v_vistos) then
        raise exception '«%» está repetido en la lista: junta sus cantidades.',
          v_articulo.nombre using errcode = '23505';
      end if;
      v_vistos := v_vistos || v_articulo.id;
      v_nombre := v_articulo.nombre;

      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'articulo_id', v_articulo.id,
        'nombre',      v_articulo.nombre,
        'cantidad',    (v_item->>'cantidad')::numeric,
        'unidad',      v_articulo.unidad));
    else
      if nullif(btrim(coalesce(v_item->>'descripcion', '')), '') is null then
        raise exception 'Hay un renglón sin descripción: escríbala o quítelo de la lista.'
          using errcode = '22023';
      end if;
      v_nombre := btrim(v_item->>'descripcion');
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'nombre',   v_nombre,
        'cantidad', (v_item->>'cantidad')::numeric,
        'unidad',   'UND'));
    end if;

    if nullif(btrim(coalesce(v_item->>'observacion', '')), '') is not null then
      v_obs := v_obs || format('%s: %s', v_nombre, btrim(v_item->>'observacion'));
    end if;
  end loop;

  v_items := private.compras_normalizar_items(v_items, '[]'::jsonb, true);
  v_unidad := private.compras_asegurar_unidad('COCINA');

  v_notas := concat_ws(' ',
    'Reposición de víveres y artículos para la cocina, armada desde Alimentación.',
    case when nullif(btrim(coalesce(p_nota, '')), '') is not null
         then 'Nota de quien pide: ' || btrim(p_nota) || '.' end,
    case when cardinality(v_obs) > 0 then 'Observaciones: ' || array_to_string(v_obs, '; ') || '.' end,
    case when p_almacen_id is not null and p_almacen_id is distinct from v_general
         then format('La cocina lo pidió para %s: se recibe en el almacén general y se traslada.', v_destino) end);

  insert into public.compras_ordenes
    (codigo, clase, estado, creado_por, creado_por_nombre, solicitante_id, solicitante_nombre,
     unidad_solicitante, items, total, notas, finalidad, clasificacion, urgente, almacen_destino_id, historial)
  values
    (private.siguiente_numero('SP'), 'producto', 'pendiente',
     (select auth.uid()), private.compras_mi_nombre(), (select auth.uid()), private.compras_mi_nombre(),
     v_unidad, v_items, private.compras_total_items(v_items),
     v_notas, 'PEDIDO PARA RESTABLECER EL MERCADO', array['Mercado'], true,
     v_general,
     private.compras_evento('creada', jsonb_build_object('detalle', 'SOLICITUD DE MERCADO · ORDEN URGENTE · DESDE ALIMENTACIÓN')))
  returning * into v_o;

  -- MGG: «Solicitud de MERCADO {código} · URGENTE enviada para aprobación».
  perform private.compras_avisar(v_o, 'MERCADO_PENDIENTE',
    format('Solicitud de MERCADO %s · URGENTE enviada para aprobación', v_o.codigo),
    array['COMPRAS'], '/app/pedidos', 'ATENCION');

  return jsonb_build_object('id', v_o.id, 'numero', v_o.codigo, 'codigo', v_o.codigo, 'estado', v_o.estado);
end;
$$;

/*
  La última solicitud de mercado, para sugerir cantidades: la más nueva entre
  las del flujo nuevo (`compras_ordenes`, finalidad de mercado) y las del
  anterior (`solicitudes_pedido`, finalidad MERCADO). Misma forma que antes.
*/
create or replace function public.ultima_lista_de_mercado()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform private.exigir_permiso('ALIMENTACION', 'LECTURA');

  select x.lista into v
    from (
      select o.creado_en as en,
             jsonb_build_object(
               'numero', o.codigo,
               'fecha',  (o.creado_en at time zone 'America/Caracas')::date,
               'estado', o.estado,
               'renglones', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'articulo_id', (i ->> 'articulo_id')::bigint,
                          'cantidad',    coalesce((i ->> 'cantidad_solicitada')::numeric, (i ->> 'cantidad')::numeric)))
                   from jsonb_array_elements(o.items) i
                  where (i ->> 'articulo_id') is not null
               ), '[]'::jsonb)) as lista
        from public.compras_ordenes o
       where o.finalidad = 'PEDIDO PARA RESTABLECER EL MERCADO'
         and o.parent_orden_id is null
         and o.estado not in ('cancelada', 'anulada')
      union all
      select coalesce(s.enviada_en, s.creada_en),
             jsonb_build_object(
               'numero', s.numero,
               'fecha',  ((coalesce(s.enviada_en, s.creada_en)) at time zone 'America/Caracas')::date,
               'estado', s.estado,
               'renglones', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'articulo_id', r.articulo_id,
                          'cantidad',    r.cantidad))
                 from public.solicitud_renglones r
                 where r.solicitud_id = s.id and r.articulo_id is not null
               ), '[]'::jsonb))
        from public.solicitudes_pedido s
       where s.finalidad = 'MERCADO' and s.estado <> 'CANCELADA'
    ) x
   order by x.en desc
   limit 1;

  -- Nulo cuando nunca se ha pedido: la pantalla arranca con cantidades en 1.
  return v;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Permisos de las funciones
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.compras_reporte_por_renglon()',
    'public.compras_cierre_diario(date, date)',
    'public.solicitar_mercado(jsonb, bigint, text)',
    'public.ultima_lista_de_mercado()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Comprobación (no escribe nada)
-- ═══════════════════════════════════════════════════════════════════════════

do $ver$
begin
  -- Los ayudantes de las fases 1 a 5a que se llaman aquí.
  if to_regprocedure('private.compras_monto_a_pagar(public.compras_ordenes)') is null
     or to_regprocedure('private.compras_saldo_credito(public.compras_ordenes)') is null
     or to_regprocedure('private.compras_bases_pago(public.compras_ordenes)') is null
     or to_regprocedure('private.compras_sd_monto_a_pagar(public.compras_servicios_directos)') is null
     or to_regprocedure('private.compras_suma_retenciones(jsonb)') is null
     or to_regprocedure('private.compras_normalizar_items(jsonb, jsonb, boolean)') is null
     or to_regprocedure('private.compras_asegurar_unidad(text)') is null
     or to_regprocedure('private.compras_avisar(public.compras_ordenes, text, text, text[], text, text)') is null
     or to_regprocedure('private.compras_evento(text, jsonb)') is null
     or to_regprocedure('private.almacen_que_revisa_pedidos()') is null then
    raise exception 'Cambió la firma de un ayudante de las fases 1 a 5a: revise esta migración.';
  end if;

  -- La firma pública de «Pedir el mercado» no cambia (la llama Alimentación).
  if to_regprocedure('public.solicitar_mercado(jsonb, bigint, text)') is null
     or (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'solicitar_mercado') <> 1 then
    raise exception 'solicitar_mercado debe quedar con una sola firma (jsonb, bigint, text).';
  end if;
  if position('compras_ordenes' in pg_get_functiondef('public.solicitar_mercado(jsonb, bigint, text)'::regprocedure)) = 0
     or position('solicitudes_pedido' in pg_get_functiondef('public.solicitar_mercado(jsonb, bigint, text)'::regprocedure)) > 0 then
    raise exception 'solicitar_mercado tiene que crear en compras_ordenes, no en el flujo anterior.';
  end if;

  -- Nada de lo nuevo se ejecuta sin sesión.
  if has_function_privilege('anon', 'public.compras_reporte_por_renglon()', 'EXECUTE')
     or has_function_privilege('anon', 'public.compras_cierre_diario(date, date)', 'EXECUTE')
     or has_table_privilege('anon', 'public.v_compras_anteriores', 'SELECT') then
    raise exception 'Los reportes y el histórico no se le abren a anon.';
  end if;
  if has_table_privilege('authenticated', 'public.v_compras_anteriores', 'INSERT')
     or has_table_privilege('authenticated', 'public.v_compras_anteriores', 'UPDATE')
     or has_table_privilege('authenticated', 'public.v_compras_anteriores', 'DELETE') then
    raise exception 'v_compras_anteriores es de solo lectura.';
  end if;

  -- La vista nueva conserva la seguridad de quien la lee.
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'v_compras_anteriores'
                    and exists (select 1 from unnest(coalesce(c.reloptions, '{}')) o
                                 where o in ('security_invoker=true', 'security_invoker=on'))) then
    raise exception 'v_compras_anteriores tiene que ser security_invoker.';
  end if;
end
$ver$;
