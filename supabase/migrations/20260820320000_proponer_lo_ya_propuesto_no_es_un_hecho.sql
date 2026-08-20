-- ---------------------------------------------------------------------------
-- Proponer lo que ya está propuesto no es un hecho
--
-- LO QUE PASABA
--
-- El botón de la cotización se pinta «Proponer al gerente» o «Ya propuesta»
-- según cómo esté el pedido, pero llamaba a lo mismo en los dos casos. Y esta
-- función acepta `POR_CONFIRMAR_GERENTE` como estado de partida —a propósito,
-- para poder cambiar de cotización sin devolver el pedido a cotizar—, así que
-- pulsarlo otra vez no fallaba: volvía a escribir el mismo cambio.
--
-- En el pedido 20 quedaron diez líneas «POR_CONFIRMAR_GERENTE →
-- POR_CONFIRMAR_GERENTE» en 2,3 segundos.
--
-- Y la bitácora no es solo la bitácora: `private.anotar` llama a
-- `private.notificar`. Esas diez líneas fueron diez avisos «Compra esperando
-- aprobación de gerencia», marcados ATENCION, a todo el que tenga
-- GERENTE_GENERAL. Once en total contando el bueno. El ruido no se quedaba en
-- la pantalla de quien hizo clic: llegaba a la bandeja del gerente.
--
-- QUÉ CAMBIA
--
-- Si el pedido ya está propuesto **con esta misma cotización**, no ha pasado
-- nada: se sale sin tocar nada y sin avisar a nadie. La operación queda
-- idempotente, que es lo que un botón que se puede pulsar dos veces necesita.
--
-- Si ya estaba propuesto pero **con otra cotización**, eso sí es un hecho y se
-- anota. Pero la línea diría «POR_CONFIRMAR_GERENTE → POR_CONFIRMAR_GERENTE»,
-- que no explica nada; la nota cuenta lo que de verdad cambió, con los dos
-- números de cotización.
--
-- `indicar_pago` ya se cuidaba de esto —solo anota la orden `if v_estado <>
-- 'EN_TESORERIA'`—. Es la única otra función que admite su propio estado de
-- destino, y estaba bien. Esta era la que faltaba.
--
-- El pedido que no existe pasa a decirlo. Antes `v_estado is null` hacía que
-- la comprobación de estado diera NULL, no entrara, y el error acabara
-- saliendo por la puerta de la cotización: «Esa cotización no pertenece a este
-- pedido», que es verdad pero no es el problema.
-- ---------------------------------------------------------------------------
create or replace function public.proponer_cotizacion(
  p_solicitud_id bigint,
  p_cotizacion_id bigint,
  p_nota text default null
) returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_estado  text;
  v_elegida bigint;
  v_antes   text;
  v_ahora   text;
begin
  perform private.exigir_rol('COMPRAS');

  select estado, cotizacion_elegida_id
    into v_estado, v_elegida
  from public.solicitudes_pedido
  where id = p_solicitud_id;

  if v_estado is null then
    raise exception 'No existe el pedido %.', p_solicitud_id using errcode = 'P0002';
  end if;

  if v_estado not in ('CONFIRMADA', 'POR_CONFIRMAR_GERENTE') then
    raise exception 'Este pedido está en "%" y no se puede proponer al gerente.', v_estado
      using errcode = '55000';
  end if;

  if not exists (
    select 1 from public.cotizaciones
    where id = p_cotizacion_id and solicitud_id = p_solicitud_id
  ) then
    raise exception 'Esa cotización no pertenece a este pedido.' using errcode = '22023';
  end if;

  -- Nada que hacer: ya está propuesta esta misma. Se sale en silencio en vez
  -- de dar error porque no hay nada que corregir — el usuario quería que
  -- estuviera propuesta y lo está.
  if v_estado = 'POR_CONFIRMAR_GERENTE' and v_elegida = p_cotizacion_id then
    return;
  end if;

  update public.solicitudes_pedido
     set estado = 'POR_CONFIRMAR_GERENTE',
         cotizacion_elegida_id = p_cotizacion_id,
         propuesta_en = now()
   where id = p_solicitud_id;

  if v_estado = 'POR_CONFIRMAR_GERENTE' then
    select numero into v_antes from public.cotizaciones where id = v_elegida;
    select numero into v_ahora from public.cotizaciones where id = p_cotizacion_id;

    perform private.anotar(
      'SOLICITUD', p_solicitud_id, v_estado, 'POR_CONFIRMAR_GERENTE',
      trim(coalesce(nullif(trim(p_nota), '') || ' — ', '')
           || format('Cambió la cotización propuesta: %s → %s',
                     coalesce(v_antes, 'ninguna'), v_ahora)));
  else
    perform private.anotar(
      'SOLICITUD', p_solicitud_id, v_estado, 'POR_CONFIRMAR_GERENTE', p_nota);
  end if;
end;
$func$;

revoke execute on function public.proponer_cotizacion(bigint, bigint, text) from public, anon;
grant  execute on function public.proponer_cotizacion(bigint, bigint, text) to authenticated;
