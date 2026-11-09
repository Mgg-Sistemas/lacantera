-- La evaluación del proveedor con estrellas (la dueña, 09/11/2026):
-- «para calificar que sea tipo estrellas… que al momento de calificar al
-- proveedor sea todo tipo estrellas».
--
-- 1. La calidad ya iba de 1 a 5; ahora se marca con estrellas en pantalla.
-- 2. La puntualidad también se califica de 1 a 5 estrellas
--    (5 a tiempo o antes, 4 un día tarde, 3 de 2 a 3 días, 2 de 4 a 7 días,
--    1 más de 7 días). Se guarda en `compras_evaluaciones.puntualidad` junto
--    a los días (`puntualidad_dias`), que siguen saliendo de las fechas si
--    las hay; si no, de las estrellas (5→0, 4→-1, 3→-3, 2→-7, 1→-15).
-- 3. El score cuenta como puntual 4 o 5 estrellas; las evaluaciones viejas,
--    sin estrellas, siguen contando por los días (≥ 0).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. La columna
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.compras_evaluaciones
  add column if not exists puntualidad smallint check (puntualidad between 1 and 5);

comment on column public.compras_evaluaciones.puntualidad is
  'Puntualidad en estrellas (1-5) al finalizar (09/11/2026): 5 a tiempo o antes, 4 un día tarde, 3 de 2 a 3 días, 2 de 4 a 7 días, 1 más de 7 días. Null en las evaluaciones anteriores (solo días).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. ✓ Finalizar orden con la evaluación del proveedor
-- ═══════════════════════════════════════════════════════════════════════════

/*
  Igual que en la fase 4, más la puntualidad en estrellas.
  p_datos = {calidad 1-5, puntualidad 1-5?, puntualidad_dias?, fecha_prometida?,
             fecha_recibido?, comentario?, factura: {path, filename, tipo?} | null}
  Los días: los que vengan; si no, de las fechas; si tampoco, de las estrellas.
*/
create or replace function public.compras_finalizar_orden(p_id bigint, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o        public.compras_ordenes;
  v_cal      integer;
  v_punt     integer;
  v_dias     integer;
  v_fprom    date;
  v_frec     date;
  v_com      text;
  v_fac      jsonb;
  v_fac_tipo text;
  v_ev       bigint;
  v_oc       text;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_gestiona() then
    raise exception 'La orden la finaliza quien lleva Compras (Compras en total) o un administrador.' using errcode = '42501';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Faltan los datos de la evaluación.' using errcode = '22023';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;
  if v_o.recibida_en is null or v_o.estado not in ('recibida', 'pagada', 'cuenta_abierta') then
    raise exception 'Solo se finaliza una orden ya recibida' using errcode = '55000';
  end if;
  if v_o.pagada_en is null then
    raise exception 'La orden % todavía no está pagada: se finaliza recibida y pagada.',
      coalesce(v_o.oc_codigo, v_o.codigo) using errcode = '55000';
  end if;

  begin
    v_cal := nullif(btrim(coalesce(p_datos ->> 'calidad', '')), '')::integer;
    v_punt := nullif(btrim(coalesce(p_datos ->> 'puntualidad', '')), '')::integer;
    v_dias := nullif(btrim(coalesce(p_datos ->> 'puntualidad_dias', '')), '')::integer;
    v_fprom := nullif(btrim(coalesce(p_datos ->> 'fecha_prometida', '')), '')::date;
    v_frec := nullif(btrim(coalesce(p_datos ->> 'fecha_recibido', '')), '')::date;
  exception when others then
    raise exception 'La calidad, la puntualidad o una fecha no se entienden.' using errcode = '22023';
  end;

  if v_cal is null or v_cal not between 1 and 5 then
    raise exception 'Indicá la calidad a evaluar (1 a 5).' using errcode = '22023';
  end if;
  if v_punt is not null and v_punt not between 1 and 5 then
    raise exception 'La puntualidad va de 1 a 5 estrellas.' using errcode = '22023';
  end if;
  if v_dias is null then
    if v_fprom is not null and v_frec is not null then
      v_dias := v_fprom - v_frec;
    elsif v_punt is not null then
      v_dias := case v_punt when 5 then 0 when 4 then -1 when 3 then -3 when 2 then -7 else -15 end;
    else
      raise exception 'Indicá la puntualidad, o la fecha prometida y la de recibido.' using errcode = '22023';
    end if;
  end if;
  if v_dias not between -365 and 365 then
    raise exception 'La puntualidad va en días, entre un año de adelanto y uno de atraso.' using errcode = '22023';
  end if;

  v_com := nullif(btrim(coalesce(p_datos ->> 'comentario', '')), '');
  if length(coalesce(v_com, '')) > 500 then
    raise exception 'El comentario va en 500 letras como mucho.' using errcode = '22023';
  end if;

  v_fac := private.compras_archivo_recepcion(p_datos -> 'factura', p_id, 'factura');
  if v_fac is not null then
    v_fac_tipo := coalesce(nullif(btrim(coalesce(p_datos -> 'factura' ->> 'tipo', '')), ''), 'factura');
    if v_fac_tipo not in ('factura', 'nota_entrega') then
      raise exception 'El documento es Factura o Nota de entrega.' using errcode = '22023';
    end if;
  end if;

  if v_o.proveedor_id is not null then
    insert into public.compras_evaluaciones
      (orden_id, proveedor_id, calidad, puntualidad, puntualidad_dias, fecha_prometida, fecha_recibido, comentario,
       evaluado_por, evaluado_por_nombre, evaluado_por_rol)
    values
      (p_id, v_o.proveedor_id, v_cal, v_punt, v_dias, v_fprom, v_frec, v_com,
       (select auth.uid()), private.compras_mi_nombre(), 'jefe')
    on conflict (orden_id) do update
      set calidad = excluded.calidad,
          puntualidad = excluded.puntualidad,
          puntualidad_dias = excluded.puntualidad_dias,
          fecha_prometida = excluded.fecha_prometida,
          fecha_recibido = excluded.fecha_recibido,
          comentario = excluded.comentario,
          evaluado_por = excluded.evaluado_por,
          evaluado_por_nombre = excluded.evaluado_por_nombre,
          evaluado_en = now()
    returning id into v_ev;
  end if;

  v_oc := coalesce(v_o.oc_codigo, v_o.codigo);

  update public.compras_ordenes
     set estado = 'finalizada',
         finalizada_por = (select auth.uid()),
         finalizada_por_nombre = private.compras_mi_nombre(),
         finalizada_en = now(),
         factura_path = coalesce(v_fac ->> 'path', factura_path),
         factura_nombre = coalesce(v_fac ->> 'filename', factura_nombre),
         factura_tipo = coalesce(v_fac_tipo, factura_tipo),
         historial = historial
                     || case when v_ev is not null then private.compras_evento('evaluacion', jsonb_strip_nulls(jsonb_build_object(
                          'evaluacion_id', v_ev,
                          'calidad', v_cal,
                          'puntualidad', v_punt,
                          'puntualidad_dias', v_dias,
                          'fecha_prometida', v_fprom,
                          'fecha_recibido', v_frec,
                          'comentario', v_com,
                          'proveedor', private.compras_texto_proveedor(v_o.proveedor_id)))) else '[]'::jsonb end
                     || private.compras_evento('finalizada', jsonb_strip_nulls(jsonb_build_object(
                          'desde', v_o.estado,
                          'recibido_total', v_o.recibido_total,
                          'factura', v_fac ->> 'filename')))
   where id = p_id
  returning * into v_o;

  if v_o.parent_orden_id is not null then
    perform private.compras_reestado_madre(v_o.parent_orden_id);
  end if;

  -- MGG: «Pedido finalizado · {código}».
  perform private.compras_avisar_solicitante(v_o, 'OC_FINALIZADA', format('Pedido finalizado · %s', v_o.codigo));

  return jsonb_build_object('id', v_o.id, 'estado', v_o.estado, 'evaluacion_id', v_ev);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. El score con las evaluaciones (MGG `getStatsForProveedores`)
-- ═══════════════════════════════════════════════════════════════════════════

/*
  Puntualidad = evaluaciones puntuales / total: 4 o 5 estrellas, o (las
  anteriores, sin estrellas) puntualidad_dias ≥ 0. Calidad = el promedio. Sin
  evaluaciones, las neutras de MGG (50 % y 3/5). El cumplimiento sigue
  saliendo de las veces que el proveedor desistió (fase 2).
*/
create or replace function public.compras_estadisticas_proveedores()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();

  if not private.tiene_permiso('COMPRAS', 'LECTURA') then
    raise exception 'Sin permiso para ver Compras.' using errcode = '42501';
  end if;

  return (
    with ofertas as (
      select f.proveedor_id,
             count(*) filter (where f.estado = 'aceptada' or f.motivo_descarte like 'PROVEEDOR DESISTIO%') as total,
             count(*) filter (where f.motivo_descarte like 'PROVEEDOR DESISTIO%') as desistidas
        from public.compras_ofertas f
       group by f.proveedor_id
    ), evals as (
      select e.proveedor_id,
             count(*) as n,
             avg(e.calidad)::numeric as calidad,
             (count(*) filter (where coalesce(e.puntualidad >= 4, e.puntualidad_dias >= 0)))::numeric / count(*) as puntual
        from public.compras_evaluaciones e
       group by e.proveedor_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'proveedor_id', coalesce(t.proveedor_id, v.proveedor_id),
             'puntualidad_pct', coalesce(round(v.puntual, 4), 0.5),
             'calidad_avg', coalesce(round(v.calidad, 2), 3),
             'cumplimiento_pct', case when coalesce(t.total, 0) > 0 then greatest(0, 1 - t.desistidas::numeric / t.total) else 1 end,
             'total_evaluaciones', coalesce(v.n, 0),
             'total_ordenes', coalesce(t.total, 0))), '[]'::jsonb)
      from ofertas t
      full join evals v on v.proveedor_id = t.proveedor_id);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Permisos
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on function public.compras_finalizar_orden(bigint, jsonb) from public, anon;
grant execute on function public.compras_finalizar_orden(bigint, jsonb) to authenticated;
revoke all on function public.compras_estadisticas_proveedores() from public, anon;
grant execute on function public.compras_estadisticas_proveedores() to authenticated;
