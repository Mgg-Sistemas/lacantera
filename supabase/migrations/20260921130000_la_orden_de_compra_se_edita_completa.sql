/*
  LA ORDEN DE COMPRA SE EDITA COMPLETA, Y SI ENCARECE VUELVE A LA GERENCIA

  Angélica, 21/09/2026: «permite desde compras poder editar la orden por
  completo: precio, ítems, nombre, todo. Y que se sincronice con inventario.
  Además, si ya fue aprobada por el Gerente General, sí puede modificar. Si el
  precio al modificarse sobrepasa los 100 $, es allí donde la compra pasará a
  pendiente por aprobar Gerente General».

  QUÉ SE PODÍA HACER HASTA HOY
  - `actualizar_pedido`: solo el pedido, y solo antes de que haya cotizaciones.
  - `editar_compra_directa`: la orden entera, pero solo si la compra era directa.
  - `corregir_precio_de_orden`: un precio suelto de un renglón.
  Una orden normal ya aprobada no se podía tocar: había que anularla y rehacerla.

  QUÉ HACE ESTA
  `editar_orden_de_compra` reescribe la cadena entera —pedido, cotización y
  orden— igual que la compra directa, para cualquier orden. Cambia proveedor,
  título, renglones, cantidades, unidades, precios, IVA, descuento y flete.

  EL INVENTARIO NO SE TOCA AQUÍ, Y ESO ES LA SINCRONÍA
  Una compra entra al almacén al recibirla, no al aprobarla: la recepción lee
  los renglones de la orden, así que editarlos antes de que llegue el material
  es exactamente lo que hace que el almacén reciba lo corregido. Por eso se
  prohíbe editar lo que ya entró: ese material ya movió existencia y costo
  promedio en un libro que no se modifica. Esa orden se anula, no se edita.

  LOS 100 $
  Se mide contra lo que la gerencia aprobó, en dólares, y solo cuenta si
  encarece: subir 100 $ o menos —o abaratar— se queda aprobado, con su nota en
  la bitácora. Si sube más de 100 $, la orden se cancela y el pedido vuelve a
  POR_CONFIRMAR_GERENTE con su cotización propuesta otra vez; al aprobarla de
  nuevo, `aprobar_compra` emite una orden nueva con lo editado. La notificación
  a la gerencia sale sola: `private.anotar` la manda con ese estado.

  Una compra directa nunca pasó por la gerencia, así que no vuelve a ella: se
  edita y ya.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. La casilla
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente, activa)
values ('COMPRAS.EDITAR_ORDEN', 'COMPRAS', 'Editar una orden de compra',
        'Cambiar proveedor, renglones, cantidades y precios de una orden que todavía no '
        'recibió material ni tiene pagos indicados, aunque la gerencia ya la haya aprobado. '
        'Si la edición la encarece en más de 100 $, la orden se cancela y el pedido vuelve a '
        'la gerencia para que la apruebe otra vez.',
        87, 'ESCRITURA', true)
on conflict (codigo) do update
  set nombre = excluded.nombre, dice = excluded.dice,
      orden = excluded.orden, nivel_equivalente = excluded.nivel_equivalente,
      activa = excluded.activa;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Editar la orden
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.editar_orden_de_compra(
  p_orden_id       bigint,
  p_proveedor_id   bigint,
  p_moneda         text,
  p_renglones      jsonb,
  p_motivo         text,
  p_titulo         text default null,
  p_justificacion  text default null,
  p_numero_factura text default null,
  p_fecha          date default null,
  p_condicion_pago text default null,
  p_alicuota_iva   numeric default null,
  p_descuento      numeric default null,
  p_flete          numeric default null,
  p_observacion    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solicitud   bigint;
  v_cotizacion  bigint;
  v_directa     boolean;
  v_estado      text;
  v_titulo      text;
  v_numero      text;
  v_antes_usd   numeric;
  v_despues_usd numeric;
  v_fecha       date := coalesce(p_fecha, current_date);
  v_tasa        numeric;
  v_tasa_usd    numeric;
  v_item        jsonb;
  v_linea       smallint := 0;
  v_vuelve      boolean := false;
begin
  perform private.exigir_accion('COMPRAS.EDITAR_ORDEN');

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se edita la orden: queda en la bitácora.' using errcode = '22023';
  end if;

  select o.solicitud_id, o.cotizacion_id, o.estado, o.numero, o.total_usd, s.directa, s.titulo
    into v_solicitud, v_cotizacion, v_estado, v_numero, v_antes_usd, v_directa, v_titulo
  from public.ordenes_compra o
  join public.solicitudes_pedido s on s.id = o.solicitud_id
  where o.id = p_orden_id;

  if v_solicitud is null then
    raise exception 'No existe esa orden.' using errcode = 'P0002';
  end if;
  if v_estado in ('CANCELADA', 'PROVEEDOR_DESISTIO') then
    raise exception 'La orden % está %: no se edita.', v_numero, lower(v_estado)
      using errcode = '55000';
  end if;

  -- Lo que ya entró al almacén movió existencia y costo en un libro inmutable.
  if exists (select 1 from public.orden_renglones
              where orden_id = p_orden_id and cantidad_recibida > 0) then
    raise exception 'La orden % ya recibió material: sus renglones movieron existencias y costo. Anúlala si está mal.', v_numero
      using errcode = '55000',
            hint = 'Si solo hay que corregir un costo, se hace en Inventario › Existencias.';
  end if;

  if exists (select 1 from public.instrucciones_pago
              where orden_id = p_orden_id and estado in ('POR_PAGAR', 'PAGADA')) then
    raise exception 'La orden % ya tiene pagos indicados. Devuélvelos antes de editarla.', v_numero
      using errcode = '55000';
  end if;

  if exists (select 1 from public.facturas_compra
              where orden_id = p_orden_id and estado <> 'ANULADA') then
    raise exception 'La orden % ya tiene la factura del proveedor cargada: corrige la factura, no la orden.', v_numero
      using errcode = '55000';
  end if;

  if p_renglones is null or jsonb_typeof(p_renglones) <> 'array'
     or jsonb_array_length(p_renglones) = 0 then
    raise exception 'Una orden necesita al menos un renglón.' using errcode = '22023';
  end if;

  select t.tasa, t.tasa_usd into v_tasa, v_tasa_usd
    from private.tasas_del_dia(p_moneda::bpchar, v_fecha) t;

  -- ── El pedido ────────────────────────────────────────────────────────────
  update public.solicitudes_pedido
     set titulo = coalesce(nullif(btrim(coalesce(p_titulo, '')), ''), titulo),
         justificacion = coalesce(nullif(btrim(coalesce(p_justificacion, '')), ''), justificacion)
   where id = v_solicitud;

  delete from public.solicitud_renglones where solicitud_id = v_solicitud;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_linea := v_linea + 1;
    insert into public.solicitud_renglones
      (solicitud_id, linea, articulo_id, descripcion, cantidad, unidad, observacion)
    values
      (v_solicitud, v_linea,
       nullif(v_item ->> 'articulo_id', '')::bigint,
       btrim(v_item ->> 'descripcion'),
       (v_item ->> 'cantidad')::numeric,
       coalesce(nullif(v_item ->> 'unidad', ''), 'UND'),
       nullif(btrim(coalesce(v_item ->> 'observacion', '')), ''));
  end loop;

  -- ── La cotización ────────────────────────────────────────────────────────
  update public.cotizaciones set
    proveedor_id     = p_proveedor_id,
    numero_proveedor = coalesce(nullif(btrim(coalesce(p_numero_factura, '')), ''), numero_proveedor),
    fecha            = v_fecha,
    condicion_pago   = coalesce(p_condicion_pago, condicion_pago),
    moneda           = p_moneda,
    tasa             = v_tasa,
    tasa_usd         = v_tasa_usd,
    alicuota_iva     = coalesce(p_alicuota_iva, alicuota_iva),
    descuento        = coalesce(p_descuento, descuento),
    flete            = coalesce(p_flete, flete),
    observacion      = coalesce(nullif(btrim(coalesce(p_observacion, '')), ''), observacion)
  where id = v_cotizacion;

  delete from public.cotizacion_renglones where cotizacion_id = v_cotizacion;

  insert into public.cotizacion_renglones
    (cotizacion_id, solicitud_renglon_id, cantidad, precio_unitario, exento_iva,
     marca, presentacion, observacion)
  select v_cotizacion, sr.id,
         (x ->> 'cantidad')::numeric,
         (x ->> 'precio_unitario')::numeric,
         coalesce((x ->> 'exento_iva')::boolean, false),
         nullif(btrim(coalesce(x ->> 'marca', '')), ''),
         nullif(btrim(coalesce(x ->> 'presentacion', '')), ''),
         nullif(btrim(coalesce(x ->> 'observacion', '')), '')
    from jsonb_array_elements(p_renglones) with ordinality as e(x, n)
    join public.solicitud_renglones sr
      on sr.solicitud_id = v_solicitud and sr.linea = n::smallint;

  -- ── La orden ─────────────────────────────────────────────────────────────
  update public.ordenes_compra o set
    proveedor_id = c.proveedor_id,
    moneda = c.moneda, tasa = c.tasa, tasa_usd = c.tasa_usd,
    subtotal = c.subtotal, descuento = c.descuento, flete = c.flete,
    iva = c.iva, total = c.total, condicion_pago = c.condicion_pago
  from public.cotizaciones c
  where o.id = p_orden_id and c.id = v_cotizacion;

  delete from public.orden_renglones where orden_id = p_orden_id;

  -- El motivo viaja en el renglón para que la auditoría lo guarde con el cambio.
  insert into public.orden_renglones
    (orden_id, linea, articulo_id, descripcion, cantidad, unidad, precio_unitario,
     exento_iva, marca, presentacion, motivo)
  select p_orden_id, sr.linea, sr.articulo_id, sr.descripcion,
         cr.cantidad, sr.unidad, cr.precio_unitario, cr.exento_iva,
         cr.marca, cr.presentacion, btrim(p_motivo)
    from public.cotizacion_renglones cr
    join public.solicitud_renglones sr on sr.id = cr.solicitud_renglon_id
   where cr.cotizacion_id = v_cotizacion;

  select total_usd into v_despues_usd from public.ordenes_compra where id = p_orden_id;

  -- ── ¿Vuelve a la gerencia? ───────────────────────────────────────────────
  v_vuelve := not coalesce(v_directa, false)
              and coalesce(v_despues_usd, 0) - coalesce(v_antes_usd, 0) > 100;

  if v_vuelve then
    update public.ordenes_compra
       set estado = 'CANCELADA',
           motivo_cancelacion = 'La edición la encareció más de 100 $: vuelve a la gerencia. ' || btrim(p_motivo),
           cancelada_en = now()
     where id = p_orden_id;

    update public.cotizaciones set propuesta = true where id = v_cotizacion;

    update public.solicitudes_pedido
       set estado = 'POR_CONFIRMAR_GERENTE',
           cotizacion_elegida_id = null,
           aprobada_gg_por = null,
           aprobada_gg_en = null,
           propuesta_en = now()
     where id = v_solicitud;

    perform private.anotar('ORDEN', p_orden_id, v_estado, 'CANCELADA',
      'Editada: subió de ' || round(coalesce(v_antes_usd, 0), 2) || ' a ' ||
      round(coalesce(v_despues_usd, 0), 2) || ' $. Vuelve a la gerencia.');

    -- Este estado avisa solo al gerente general (private.anotar).
    perform private.anotar('SOLICITUD', v_solicitud, 'APROBADA', 'POR_CONFIRMAR_GERENTE',
      btrim(p_motivo));
  else
    perform private.anotar('ORDEN', p_orden_id, v_estado, v_estado,
      'Orden editada: ' || btrim(p_motivo));
  end if;

  return jsonb_build_object(
    'orden_id', p_orden_id,
    'solicitud_id', v_solicitud,
    'vuelve_a_gerencia', v_vuelve,
    'total_usd_antes', round(coalesce(v_antes_usd, 0), 2),
    'total_usd_despues', round(coalesce(v_despues_usd, 0), 2));
end;
$$;

revoke all on function public.editar_orden_de_compra(bigint, bigint, text, jsonb, text, text, text, text, date, text, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.editar_orden_de_compra(bigint, bigint, text, jsonb, text, text, text, text, date, text, numeric, numeric, numeric, text) to authenticated, service_role;

comment on function public.editar_orden_de_compra(bigint, bigint, text, jsonb, text, text, text, text, date, text, numeric, numeric, numeric, text) is
  'Reescribe pedido, cotizacion y orden de una compra que todavia no recibio ni pago. '
  'Si encarece mas de 100 $ y no es directa, cancela la orden y devuelve el pedido a la gerencia.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Comprobación
-- ═══════════════════════════════════════════════════════════════════════════

do $ver$
begin
  if to_regprocedure('public.editar_orden_de_compra(bigint, bigint, text, jsonb, text, text, text, text, date, text, numeric, numeric, numeric, text)') is null then
    raise exception 'editar_orden_de_compra no quedó creada.';
  end if;
  if not exists (select 1 from public.acciones where codigo = 'COMPRAS.EDITAR_ORDEN' and activa) then
    raise exception 'Falta la casilla COMPRAS.EDITAR_ORDEN.';
  end if;
end
$ver$;
