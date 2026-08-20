-- ---------------------------------------------------------------------------
-- Una compra deshecha no deja material dentro del inventario
--
-- LO QUE PASABA
--
-- Se cancelaba una orden que ya había recibido material y el material se
-- quedaba en existencias para siempre. Dos consecuencias, las dos caras:
-- existencia inflada —el almacén dice que tiene algo que no compró— y costo
-- promedio contaminado con el precio de una compra anulada.
--
-- Lo vio Christopher: «las compras rechazadas o desistidas aún aparecen en el
-- inventario». En la base había dos: OC-2026-0003, cancelada por DESACUERDO,
-- con 2 unidades dentro; y OC-2026-0004, desistida, con 42 unidades a 20 USD.
--
-- POR DÓNDE ENTRABA
--
-- `cancelar_orden` solo admitía POR_INDICAR_PAGO y EN_TESORERIA, que son
-- estados donde no se ha recibido nada. Parecía cerrado. Pero una orden contra
-- entrega que recibe material queda en POR_INDICAR_PAGO —ese es otro fallo, el
-- de que nunca llega a RECIBIDA— y desde ahí se podía cancelar con el material
-- ya dentro. Los dos fallos estaban encadenados.
--
-- CANCELAR Y DESISTIR NO SON LO MISMO
--
-- Cancelar es decir que la compra no ocurrió, así que lo que entró por ella
-- sale: se reversa siempre.
--
-- Desistir es que el proveedor no entregó. Pero `marcar_desistimiento` admite
-- RECIBIDA_PARCIAL: entregó una parte y se echó atrás con el resto. Esa parte
-- llegó de verdad y es de la empresa —contra entrega paga lo que llegue— así
-- que no se toca. Si el proveedor se llevó el material de vuelta, ahora se
-- puede decir con `p_material_devuelto`; antes no había manera salvo un ajuste
-- a mano que perdía el rastro de por qué.
--
-- SE REVERSA, NO SE BORRA
--
-- El libro de inventario es inmutable: un disparador impide modificarlo o
-- borrarlo. La salida es un movimiento de tipo REVERSO que apunta al original,
-- así que queda la entrada, queda la salida, y queda por qué. Y si el material
-- ya se consumió, `exigir_existencia_para_reverso` para la operación con un
-- mensaje en vez de dejar el almacén en negativo.
-- ---------------------------------------------------------------------------
create or replace function private.reversar_entradas_de_orden(
  p_orden_id bigint,
  p_motivo   text
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $func$
declare
  v_mov public.inventario_movimientos;
  v_n   integer := 0;
begin
  for v_mov in
    select * from public.inventario_movimientos
     where orden_id = p_orden_id and tipo = 'ENTRADA_COMPRA'
     order by id
  loop
    -- Si ya se reversó, no se reversa dos veces.
    if exists (select 1 from public.inventario_movimientos r
                where r.movimiento_origen = v_mov.id and r.tipo = 'REVERSO') then
      continue;
    end if;

    -- Y si el material ya se consumió, no se puede sacar lo que no está: se
    -- para con un mensaje que dice qué hacer, en vez de dejar el almacén en
    -- negativo.
    perform private.exigir_existencia_para_reverso(v_mov, v_mov.id);

    perform private.registrar_movimiento(
      'REVERSO', (-v_mov.signo)::integer, v_mov.almacen_id, v_mov.articulo_id,
      v_mov.cantidad, v_mov.costo_usd,
      format('Reverso de %s. %s', v_mov.numero, p_motivo),
      v_mov.orden_id, v_mov.orden_renglon_id, v_mov.id, null);

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$func$;

comment on function private.reversar_entradas_de_orden is
  'Saca del inventario lo que entró por una orden. Se usa cuando la compra se '
  'deshace: el material que llegó por una compra que no ocurrió no puede '
  'quedarse contando como existencia.';

-- ---------------------------------------------------------------------------
create or replace function public.cancelar_orden(p_orden_id bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_estado text;
  v_revs   integer;
begin
  perform private.exigir_rol('COMPRAS', 'GERENTE_GENERAL');

  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo de la cancelación.' using errcode = '22023';
  end if;

  select estado into v_estado from public.ordenes_compra where id = p_orden_id;

  if v_estado is null then
    raise exception 'No existe la orden %.', p_orden_id using errcode = 'P0002';
  end if;

  -- POR_RECIBIR entra en la lista: es donde nace una orden contra entrega, y
  -- una compra que todavía no ha llegado se puede cancelar como cualquier otra.
  if v_estado not in ('POR_RECIBIR', 'POR_INDICAR_PAGO', 'EN_TESORERIA') then
    raise exception 'Una orden en "%" ya no se cancela. Si ya se pagó y el proveedor no entregó, márcala como desistida.', v_estado
      using errcode = '55000';
  end if;

  -- Lo que haya entrado por esta orden sale.
  v_revs := private.reversar_entradas_de_orden(
    p_orden_id, format('Compra cancelada: %s', trim(p_motivo)));

  update public.instrucciones_pago
     set estado = 'ANULADA'
   where orden_id = p_orden_id and estado = 'POR_PAGAR';

  update public.ordenes_compra
     set estado = 'CANCELADA', motivo_cancelacion = trim(p_motivo), cancelada_en = now()
   where id = p_orden_id;

  perform private.anotar('ORDEN', p_orden_id, v_estado, 'CANCELADA',
    case when v_revs > 0
         then format('%s. Se devolvieron %s entrada(s) de inventario.', trim(p_motivo), v_revs)
         else trim(p_motivo) end);
end;
$function$;

-- ---------------------------------------------------------------------------
create or replace function public.marcar_desistimiento(
  p_orden_id          bigint,
  p_motivo            text,
  p_material_devuelto boolean default false
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_estado text;
  v_revs   integer := 0;
begin
  perform private.exigir_rol('COMPRAS', 'GERENTE_GENERAL');

  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Describe qué pasó con el proveedor.' using errcode = '22023';
  end if;

  select estado into v_estado from public.ordenes_compra where id = p_orden_id;

  if v_estado not in ('PAGADA_POR_RECIBIR', 'RECIBIDA_PARCIAL', 'EN_TESORERIA') then
    raise exception 'Una orden en "%" no se puede marcar como desistida.', v_estado
      using errcode = '55000';
  end if;

  -- Por defecto lo recibido se queda: llegó de verdad y es de la empresa.
  if p_material_devuelto then
    v_revs := private.reversar_entradas_de_orden(
      p_orden_id, format('Material devuelto al proveedor: %s', trim(p_motivo)));
  end if;

  update public.ordenes_compra
     set estado = 'PROVEEDOR_DESISTIO',
         desistio_motivo = trim(p_motivo),
         desistio_en = now(),
         desistio_resolucion = 'PENDIENTE'
   where id = p_orden_id;

  perform private.anotar('ORDEN', p_orden_id, v_estado, 'PROVEEDOR_DESISTIO',
    case when v_revs > 0
         then format('%s. Se devolvieron %s entrada(s) de inventario.', trim(p_motivo), v_revs)
         else trim(p_motivo) end);
end;
$function$;

revoke execute on function public.marcar_desistimiento(bigint, text, boolean) from public, anon;
grant  execute on function public.marcar_desistimiento(bigint, text, boolean) to authenticated;

-- La firma vieja quedaría como sobrecarga y PostgREST no sabría cuál llamar.
drop function if exists public.marcar_desistimiento(bigint, text);
