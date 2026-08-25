-- La orden dice bajo autorización de quién.
--
-- Es el caso que pidió la líder, y el primero que usa la maquinaria nueva.
--
-- Dos cambios en `aprobar_compra`:
--
--   1. La reja pasa de `exigir_rol('GERENTE_GENERAL')` a
--      `exigir_accion('COMPRAS.APROBAR_COMPRA')`. Hoy no mueve a nadie: esa
--      casilla va con escalón nulo y sembrada en GERENTE_GENERAL, así que el
--      conjunto que pasa es el mismo de siempre —administración y la gerencia—.
--      Lo que añade es que ahora una autorización también la abre.
--
--   2. Se estampa de quién es la autoridad. Si quien aprueba va por derecho
--      propio, esa columna queda nula y el papel no dice nada de más. Si va por
--      prestado, queda escrito quién se lo prestó.
--
-- Sobre la columna `aprobada_gg_por`: sigue guardando a quien pulsó el botón,
-- que es lo correcto —quien firma es quien firma—. Lo que faltaba era el
-- segundo dato, porque sin él esa columna, que se llama «aprobada por el
-- gerente general», acabaría diciendo el nombre de quien no es el gerente.
--
-- COMPROBADO de punta a punta, en transacción revertida: un pedido puesto en
-- POR_CONFIRMAR_GERENTE, Jesmary intentando aprobarlo sin autorización
-- —rechazada—, el gerente extendiéndosela, y Jesmary aprobando. La orden salió
-- firmada por JESMARY BARCO y bajo autoridad de JESUS LOZADA, y el historial
-- del pedido lo dice también.

alter table public.ordenes_compra
  add column if not exists aprobada_por_autorizacion_de uuid references public.perfiles(id);

alter table public.solicitudes_pedido
  add column if not exists aprobada_por_autorizacion_de uuid references public.perfiles(id);

comment on column public.ordenes_compra.aprobada_por_autorizacion_de is
  'Si quien aprobo no podia por derecho propio y lo hizo con un permiso extendido, aqui queda de quien era la autoridad. Nulo cuando aprueba quien le compete. Es lo que sale impreso como «bajo autorizacion de».';

create or replace function public.aprobar_compra(p_solicitud_id bigint, p_nota text default null::text)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_estado   text;
  v_cot      public.cotizaciones;
  v_orden_id bigint;
  v_autoriza uuid;
begin
  perform private.exigir_accion('COMPRAS.APROBAR_COMPRA');

  -- De quién es la autoridad. Nulo si quien aprueba podía por su cuenta: en ese
  -- caso el papel no debe decir «bajo autorización de» nadie.
  v_autoriza := private.autoriza_delegacion('COMPRAS.APROBAR_COMPRA');

  select estado into v_estado from public.solicitudes_pedido where id = p_solicitud_id;

  if v_estado is null then
    raise exception 'No existe el pedido %.', p_solicitud_id using errcode = 'P0002';
  end if;

  if v_estado <> 'POR_CONFIRMAR_GERENTE' then
    raise exception 'Este pedido está en "%" y todavía no llega a la gerencia.', v_estado
      using errcode = '55000';
  end if;

  select c.* into v_cot
  from public.cotizaciones c
  join public.solicitudes_pedido s on s.cotizacion_elegida_id = c.id
  where s.id = p_solicitud_id;

  if v_cot.id is null then
    raise exception 'El pedido no tiene una cotización propuesta.' using errcode = '55000';
  end if;

  insert into public.ordenes_compra
    (numero, solicitud_id, cotizacion_id, proveedor_id, moneda, tasa, tasa_usd,
     subtotal, descuento, flete, iva, total, dias_entrega, entrega_estimada,
     creada_por, aprobada_gg_por, aprobada_gg_en, aprobada_por_autorizacion_de)
  values
    (private.siguiente_numero('OC'), p_solicitud_id, v_cot.id, v_cot.proveedor_id,
     v_cot.moneda, v_cot.tasa, v_cot.tasa_usd,
     v_cot.subtotal, v_cot.descuento, v_cot.flete, v_cot.iva, v_cot.total,
     v_cot.dias_entrega,
     case when v_cot.dias_entrega is not null then current_date + v_cot.dias_entrega end,
     (select auth.uid()), (select auth.uid()), now(), v_autoriza)
  returning id into v_orden_id;

  insert into public.orden_renglones
    (orden_id, linea, articulo_id, descripcion, cantidad, unidad, precio_unitario, exento_iva)
  select v_orden_id, sr.linea, sr.articulo_id, sr.descripcion,
         cr.cantidad, sr.unidad, cr.precio_unitario, cr.exento_iva
  from public.cotizacion_renglones cr
  join public.solicitud_renglones sr on sr.id = cr.solicitud_renglon_id
  where cr.cotizacion_id = v_cot.id;

  update public.solicitudes_pedido
     set estado = 'APROBADA', aprobada_gg_por = (select auth.uid()), aprobada_gg_en = now(),
         aprobada_por_autorizacion_de = v_autoriza
   where id = p_solicitud_id;

  -- La nota del historial deja dicho lo mismo, para quien lea el recorrido del
  -- pedido sin abrir la orden.
  perform private.anotar('SOLICITUD', p_solicitud_id, v_estado, 'APROBADA',
    case when v_autoriza is null then p_nota
         else concat_ws(' · ', p_nota,
                'Bajo autorización de ' ||
                (select nombre from public.perfiles where id = v_autoriza))
    end);
  perform private.anotar('ORDEN', v_orden_id, null, 'POR_INDICAR_PAGO', p_nota);

  return v_orden_id;
end;
$function$;

revoke all on function public.aprobar_compra(bigint, text) from public, anon;
grant execute on function public.aprobar_compra(bigint, text) to authenticated;

comment on function public.aprobar_compra(bigint, text) is
  'Aprueba el pedido y nace la orden de compra. Se reja por la casilla COMPRAS.APROBAR_COMPRA, asi que la abre tanto quien le compete como quien tenga un permiso extendido; en el segundo caso queda escrito de quien era la autoridad, en la orden y en el historial.';
