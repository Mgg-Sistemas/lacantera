-- ═══════════════════════════════════════════════════════════════════════════
-- ELIMINAR UN DUPLICADO REVERSA, EN VEZ DE GENERAR SALIDA
--
-- Se pidió poder borrar artículos repetidos o mal cargados desde Existencias,
-- sin que la corrección se vea como una salida real de material.
--
-- EL LIBRO DE INVENTARIO NO SE PUEDE BORRAR, PARA NADIE. Lo dice su propio
-- disparador (`private.movimientos_inmutables`, sin excepción ni para ADMIN):
-- «El libro de inventario no se modifica ni se borra. Registre un reverso o
-- un ajuste.» Por eso `eliminar_articulo` (DELETE de verdad) solo funciona hoy
-- con un artículo que JAMÁS tuvo un movimiento — en cuanto tiene uno, el FK de
-- `inventario_movimientos` lo va a bloquear para siempre, y no hay vuelta
-- atrás posible a ese comportamiento sin romper la inmutabilidad del libro,
-- que es justo la garantía que protege el inventario de todo el mundo.
--
-- ASÍ QUE ESTA FUNCIÓN HACE LO MÁS CERCANO A «BORRARLO» QUE EL SISTEMA PERMITE:
--   - Si el artículo nunca tuvo ni un movimiento: se borra entero, de una vez
--     (reusa exactamente lo que ya hacía `eliminar_articulo`).
--   - Si tiene movimientos: se reversa cada uno que siga en pie —un REVERSO,
--     no una resta nueva; es una corrección, no una salida— reusando
--     `reversar_movimiento` tal cual existe, y se desactiva con
--     `cambiar_estado_articulo`, con el mismo motivo. El artículo desaparece
--     del catálogo y de los formularios, la existencia queda en cero, y toda
--     la historia se conserva.
--   - Si el artículo ya está en una factura, una nota, una orden o cualquier
--     otro documento de verdad: no es un duplicado aislado, así que se niega
--     y se dice en qué está, igual que ya hace `eliminar_articulo` hoy.
--
-- Solo ADMIN, con motivo obligatorio — lo pidió el usuario del sistema para
-- su propia cuenta; el sistema no tiene forma de prestar esto a una persona
-- puntual sin dárselo también a quien ya es ADMIN (ADMIN pasa siempre
-- cualquier candado, por diseño), así que el candado real es el rol.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.eliminar_articulo_duplicado(p_articulo_id bigint, p_motivo text)
returns text
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_articulo record;
  v_otros    text;
  v_mov      record;
  v_tiene_movimientos boolean;
begin
  perform private.exigir_rol('ADMIN');

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué es un duplicado: queda en la auditoría.' using errcode = '22023';
  end if;

  select id, nombre, activo into v_articulo from public.articulos where id = p_articulo_id for update;
  if v_articulo.id is null then
    raise exception 'No existe ese artículo.' using errcode = 'P0002';
  end if;

  -- Si tiene cualquier otra huella -documentos, asignaciones, mantenimiento,
  -- combustible, producción...- no es un duplicado aislado: se niega, igual
  -- que `eliminar_articulo`, y se sugiere desactivar.
  select string_agg(distinct t.tabla, ', ') into v_otros
  from (
    select 'una cotización' as tabla from public.cotizacion_venta_renglones where articulo_id = p_articulo_id
    union all select 'una factura' from public.factura_venta_renglones where articulo_id = p_articulo_id
    union all select 'una nota de entrega' from public.nota_entrega_renglones where articulo_id = p_articulo_id
    union all select 'una nota de crédito' from public.nota_credito_renglones where articulo_id = p_articulo_id
    union all select 'una orden de compra' from public.orden_renglones where articulo_id = p_articulo_id
    union all select 'una solicitud de pedido' from public.solicitud_renglones where articulo_id = p_articulo_id
    union all select 'una solicitud de salida' from public.solicitud_salida_renglones where articulo_id = p_articulo_id
    union all select 'un cobro con material' from public.cobros_con_material where articulo_id = p_articulo_id
    union all select 'un pago con material' from public.pagos_con_material where articulo_id = p_articulo_id
    union all select 'una asignación de herramienta' from public.asignaciones_herramienta where articulo_id = p_articulo_id
    union all select 'una dotación por cargo' from public.dotacion_por_cargo where articulo_id = p_articulo_id
    union all select 'un despacho de combustible' from public.despachos_combustible where articulo_id = p_articulo_id
    union all select 'una máquina que lo usa de combustible' from public.maquinaria where combustible_id = p_articulo_id
    union all select 'un agregado de máquina' from public.maquina_agregados where articulo_id = p_articulo_id
    union all select 'un mantenimiento' from public.mantenimientos where articulo_id = p_articulo_id
    union all select 'un repuesto de mantenimiento' from public.mantenimiento_repuestos where articulo_id = p_articulo_id
    union all select 'un ticket de romana' from public.romana_tickets where articulo_id = p_articulo_id
    union all select 'una guía de movilización' from public.guias_movilizacion where articulo_id = p_articulo_id
    union all select 'un renglón de producción' from public.produccion_renglones where articulo_id = p_articulo_id
    union all select 'un reenvase' from public.reenvases where articulo_id = p_articulo_id
    union all select 'una salida de planta' from public.salidas_planta where producto_id = p_articulo_id
    union all select 'un traslado' from public.traslados where articulo_id = p_articulo_id
    union all select 'un movimiento de costo' from public.costo_movimientos where producto_id = p_articulo_id
    union all select 'comida' from public.comida_renglones where articulo_id = p_articulo_id
    union all select 'un conteo' from public.conteos where articulo_id = p_articulo_id
  ) t;

  if v_otros is not null then
    raise exception 'El artículo "%" ya está en %: tiene historia real, no es un duplicado aislado. Desactívalo en su lugar.', v_articulo.nombre, v_otros
      using errcode = '55000';
  end if;

  select exists(select 1 from public.inventario_movimientos where articulo_id = p_articulo_id) into v_tiene_movimientos;

  if not v_tiene_movimientos then
    delete from public.articulo_presentaciones where articulo_id = p_articulo_id;
    delete from public.precios_venta where articulo_id = p_articulo_id;
    delete from public.codigos_retirados where articulo_id = p_articulo_id;
    delete from public.articulos where id = p_articulo_id;
    return 'BORRADO';
  end if;

  for v_mov in
    select m.id
      from public.inventario_movimientos m
     where m.articulo_id = p_articulo_id
       and m.tipo not in ('REVERSO', 'AJUSTE_COSTO')
       and not exists (select 1 from public.inventario_movimientos r where r.movimiento_origen = m.id)
     order by m.id
  loop
    perform public.reversar_movimiento(v_mov.id, p_motivo);
  end loop;

  perform public.cambiar_estado_articulo(p_articulo_id, false, p_motivo);
  return 'REVERSADO_Y_DESACTIVADO';
end;
$func$;

revoke all on function public.eliminar_articulo_duplicado(bigint, text) from public, anon;
grant execute on function public.eliminar_articulo_duplicado(bigint, text) to authenticated;

do $comprueba$
declare
  v_oid regprocedure := 'public.eliminar_articulo_duplicado(bigint, text)'::regprocedure;
begin
  if has_function_privilege('anon', v_oid, 'execute') then
    raise exception 'eliminar_articulo_duplicado no puede ser ejecutable por anon.';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception 'eliminar_articulo_duplicado tiene que ser ejecutable por authenticated (la propia función exige ADMIN por dentro).';
  end if;
end
$comprueba$;
