-- 1. Permite que únicamente la función administrativa `public.eliminar_salida_entregada`
--    (y esta limpieza puntual de SS-2026-0154 / NS-2026-0156) retire del libro una
--    salida entregada por error, devolviendo el material a su almacén y propietario,
--    sin abrir `public.inventario_movimientos` a ediciones ni borrados sueltos.
-- 2. Crea `public.eliminar_salida_entregada(p_nota_salida, p_motivo)` para ADMIN.
-- 3. Elimina de inmediato la salida errónea `SS-2026-0154` / `NS-2026-0156`
--    (45 M3 de PIEDRA en PATIO DE PLANTA DE LAVADO) para que el material regrese
--    al patio y puedan registrar la salida correcta de 32 M3.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Candado de inmutabilidad con compuerta local exclusiva de administración
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function private.movimientos_inmutables()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('lacantera.eliminando_salida_admin', true), '') = 'si' then
    return case when TG_OP = 'DELETE' then OLD else NEW end;
  end if;

  raise exception 'El libro de inventario no se modifica ni se borra (operación: %). Registre un reverso o un ajuste.', TG_OP
    using errcode = 'restrict_violation';
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Lógica interna reutilizable para eliminar una salida entregada y devolver stock
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function private.ejecutar_eliminacion_salida_entregada(
  p_nota_salida text,
  p_motivo      text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nota          text := upper(btrim(coalesce(p_nota_salida, '')));
  v_motivo        text := btrim(coalesce(p_motivo, ''));
  v_solicitud_id  bigint;
  v_solicitud_num text;
  v_ne_activa     text;
  v_mov_ids       bigint[];
  v_rev_ids       bigint[];
  v_movs_borrados integer := 0;
begin
  if v_nota = '' then
    raise exception 'Indique el número de la nota de salida (p. ej. NS-2026-0156).' using errcode = '22023';
  end if;

  if length(v_motivo) < 4 then
    raise exception 'Escriba por qué se elimina la salida (mínimo 4 caracteres).' using errcode = '22023';
  end if;

  -- Bloquear movimientos de la nota de salida
  select array_agg(m.id order by m.id)
    into v_mov_ids
    from public.inventario_movimientos m
   where m.nota_salida = v_nota;

  -- Buscar solicitud de salida asociada (si nació de orden SS-...)
  select s.id, s.numero
    into v_solicitud_id, v_solicitud_num
    from public.solicitudes_salida s
   where s.nota_salida = v_nota
   limit 1;

  if coalesce(cardinality(v_mov_ids), 0) = 0 and v_solicitud_id is null then
    raise exception 'No existe ninguna salida entregada con la nota %.', v_nota using errcode = 'P0002';
  end if;

  -- Verificar que no sea un pago con material a proveedor
  if v_solicitud_id is not null then
    if exists (
      select 1
        from public.solicitudes_salida s
       where s.id = v_solicitud_id
         and s.instruccion_pago_id is not null
    ) or exists (
      select 1
        from public.pagos_con_material p
       where p.solicitud_id = v_solicitud_id
    ) then
      raise exception 'La salida % corresponde a un pago con material y no puede eliminarse por aquí.', v_nota
        using errcode = '55000';
    end if;
  end if;

  if exists (
    select 1
      from public.inventario_movimientos m
     where m.id = any(coalesce(v_mov_ids, '{}'::bigint[]))
       and m.tipo = 'SALIDA_INTERCAMBIO'
  ) then
    raise exception 'La salida % pagó una compra con material y no puede eliminarse suelta.', v_nota
      using errcode = '55000';
  end if;

  -- Verificar que no tenga una nota de entrega activa (no anulada) en Facturación/Despachos
  select ne.numero
    into v_ne_activa
    from public.notas_entrega ne
   where ne.estado <> 'ANULADA'
     and (
       ne.nota_salida = v_nota
       or (v_solicitud_id is not null and ne.solicitud_salida_id = v_solicitud_id)
       or ne.movimiento_salida_id = any(coalesce(v_mov_ids, '{}'::bigint[]))
       or exists (
         select 1
           from public.nota_entrega_renglones ner
          where ner.nota_id = ne.id
            and ner.movimiento_id = any(coalesce(v_mov_ids, '{}'::bigint[]))
       )
     )
   limit 1;

  if v_ne_activa is not null then
    raise exception 'La salida % ya tiene la nota de despacho % activa. Anule primero % antes de eliminar la salida.',
      v_nota, v_ne_activa, v_ne_activa
      using errcode = '55000';
  end if;

  -- Verificar que los movimientos no pertenezcan a combustible, traslados, dotación, taller o conteos
  if coalesce(cardinality(v_mov_ids), 0) > 0 then
    if exists (select 1 from public.despachos_combustible where movimiento_id = any(v_mov_ids) or merma_de_mov_id = any(v_mov_ids))
       or exists (select 1 from public.traslados where mov_salida = any(v_mov_ids) or mov_en_camino = any(v_mov_ids) or mov_llegada = any(v_mov_ids) or mov_vuelta = any(v_mov_ids))
       or exists (select 1 from public.asignaciones_herramienta where movimiento_id = any(v_mov_ids))
       or exists (select 1 from public.mantenimiento_repuestos where movimiento_id = any(v_mov_ids))
       or exists (select 1 from public.maquina_agregados where movimiento_id = any(v_mov_ids) or movimiento_retiro_id = any(v_mov_ids))
       or exists (select 1 from public.comida_renglones where movimiento_id = any(v_mov_ids))
       or exists (select 1 from public.conteos where movimiento_id = any(v_mov_ids) or corte_movimiento = any(v_mov_ids))
    then
      raise exception 'La salida % está enlazada a otro módulo operativo (combustible, traslado, taller, dotación o conteo) y no puede eliminarse directo.',
        v_nota
        using errcode = '55000';
    end if;
  end if;

  -- Abrir compuerta local de esta transacción
  perform set_config('lacantera.eliminando_salida_admin', 'si', true);

  -- Si existía alguna nota de entrega ANULADA apuntando a esta salida, soltar su referencia histórica
  update public.nota_entrega_renglones
     set movimiento_id = null
   where movimiento_id = any(coalesce(v_mov_ids, '{}'::bigint[]));

  update public.notas_entrega
     set nota_salida = null,
         solicitud_salida_id = null,
         movimiento_salida_id = null
   where estado = 'ANULADA'
     and (
       nota_salida = v_nota
       or (v_solicitud_id is not null and solicitud_salida_id = v_solicitud_id)
       or movimiento_salida_id = any(coalesce(v_mov_ids, '{}'::bigint[]))
     );

  -- Si alguien había generado un REVERSO previo sobre alguno de estos movimientos,
  -- borrar primero el reverso y luego el movimiento original para no duplicar stock ni chocar con FK.
  if coalesce(cardinality(v_mov_ids), 0) > 0 then
    select array_agg(r.id)
      into v_rev_ids
      from public.inventario_movimientos r
     where r.movimiento_origen = any(v_mov_ids);

    if coalesce(cardinality(v_rev_ids), 0) > 0 then
      delete from public.inventario_movimientos
       where id = any(v_rev_ids);
    end if;

    delete from public.inventario_movimientos
     where id = any(v_mov_ids);
    get diagnostics v_movs_borrados = row_count;
  end if;

  -- Eliminar la solicitud de salida (sus renglones caen en cascada y queda rastro en auditoría)
  if v_solicitud_id is not null then
    delete from public.solicitudes_salida
     where id = v_solicitud_id;
  end if;

  perform set_config('lacantera.eliminando_salida_admin', '', true);

  return jsonb_build_object(
    'nota_salida', v_nota,
    'solicitud_eliminada', v_solicitud_num,
    'movimientos_eliminados', v_movs_borrados,
    'motivo', v_motivo
  );
end;
$$;

revoke all on function private.ejecutar_eliminacion_salida_entregada(text, text) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC pública para Administradores desde la interfaz
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.eliminar_salida_entregada(
  p_nota_salida text,
  p_motivo      text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_rol('ADMIN');
  return private.ejecutar_eliminacion_salida_entregada(p_nota_salida, p_motivo);
end;
$$;

revoke all on function public.eliminar_salida_entregada(text, text) from public, anon;
grant execute on function public.eliminar_salida_entregada(text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Eliminar de inmediato la salida errónea SS-2026-0154 / NS-2026-0156
--    (45 M3 de PIEDRA en PATIO DE PLANTA DE LAVADO -> vuelve el material al patio)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_nota text;
  v_res  jsonb;
begin
  select coalesce(
           (select s.nota_salida from public.solicitudes_salida s where s.numero = 'SS-2026-0154' and s.nota_salida is not null limit 1),
           (select m.nota_salida from public.inventario_movimientos m where m.nota_salida = 'NS-2026-0156' limit 1)
         )
    into v_nota;

  if v_nota is not null then
    v_res := private.ejecutar_eliminacion_salida_entregada(
      v_nota,
      'Eliminada por error en cantidad entregada (se registraron 45 M3 de piedra en vez de 32 M3; se carga de nuevo).'
    );
    raise notice 'Salida eliminada y material devuelto al patio: %', v_res;
  elsif exists (select 1 from public.solicitudes_salida where numero = 'SS-2026-0154') then
    -- Por si SS-2026-0154 estuviera sin nota_salida asociada
    delete from public.solicitudes_salida where numero = 'SS-2026-0154';
    raise notice 'Solicitud SS-2026-0154 eliminada.';
  else
    raise notice 'SS-2026-0154 / NS-2026-0156 ya no existe (ya había sido eliminada).';
  end if;
end;
$$;

commit;
