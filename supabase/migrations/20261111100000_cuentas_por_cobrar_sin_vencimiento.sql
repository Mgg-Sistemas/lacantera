-- ============================================================================
-- LAS CUENTAS POR COBRAR NO VENCEN (11/11/2026)
--
-- Pedido: «que las cuentas por cobrar no tengan fecha de vencimiento, solo que
-- queden en status pendiente por cobrar; quitar el estado vencido y los días
-- de mora» — en notas de entrega y en facturas, en todo el sistema.
--
-- Qué cambia en la base (nada se borra):
--   · «vencida» queda siempre en falso y los días de atraso en 0, en las vistas
--     y funciones que lo calculaban. Las columnas se conservan con su tipo,
--     para no romper a quien las lea.
--   · La fecha de pago deja de pedirse al marcar una nota por cobrar, al pedir
--     un despacho a crédito y al editar la solicitud. Las tablas exigen una
--     fecha en toda cuenta por cobrar (notas_entrega_cobro_coherente y
--     solicitudes_despacho_cobro_coherente; las restricciones no se tocan), así
--     que el sistema guarda por dentro el día en que quedó por cobrar, solo como
--     registro: no se muestra ni sirve para vencer. Las fechas ya guardadas se
--     quedan como están.
--   · El aviso diario «nota con cobro vencido» se pausa: el trabajo programado
--     y su función se conservan, por si se quiere volver atrás.
--   · El motivo de no despacho «deuda vencida» pasa a decir «deuda pendiente».
--
-- Las funciones grandes (ventas_tablero, solicitar_despacho,
-- editar_solicitud_despacho) se reescriben tomando su definición vigente y
-- cambiando solo las líneas citadas; si alguna no aparece, la migración se
-- detiene en vez de dejar algo a medias.
-- ============================================================================

do $migracion$
declare
  v_def text;
  v_nuevo text;
begin
  -- ── Vistas ─────────────────────────────────────────────────────────────────

  v_def := pg_get_viewdef('public.v_notas_entrega'::regclass, true);
  v_nuevo := replace(v_def,
    'n.pendiente_por_cobrar AND n.cobrada_en IS NULL AND n.fecha_pago < CURRENT_DATE AS vencida_por_cobrar',
    'false AS vencida_por_cobrar');
  if v_nuevo = v_def then raise exception 'v_notas_entrega: no se encontró el cálculo de vencida.'; end if;
  execute 'create or replace view public.v_notas_entrega with (security_invoker = on) as ' || v_nuevo;

  v_def := pg_get_viewdef('public.v_facturas_venta'::regclass, true);
  v_nuevo := regexp_replace(v_def,
    'CASE\s+WHEN f\.estado = ''EMITIDA''::text AND f\.vence_el < CURRENT_DATE THEN CURRENT_DATE - f\.vence_el\s+ELSE 0\s+END AS dias_vencida',
    '0 AS dias_vencida');
  if v_nuevo = v_def then raise exception 'v_facturas_venta: no se encontró el cálculo de días vencida.'; end if;
  execute 'create or replace view public.v_facturas_venta with (security_invoker = on) as ' || v_nuevo;

  v_def := pg_get_viewdef('public.v_tablero_cartera'::regclass, true);
  v_nuevo := regexp_replace(v_def,
    '\(\s*SELECT count\(\*\) AS count\s+FROM facturas_venta f\s+WHERE f\.cliente_id = c\.id AND f\.estado = ''EMITIDA''::text AND f\.vence_el < CURRENT_DATE\) AS facturas_vencidas',
    '0::bigint AS facturas_vencidas');
  if v_nuevo = v_def then raise exception 'v_tablero_cartera: no se encontró el conteo de facturas vencidas.'; end if;
  execute 'create or replace view public.v_tablero_cartera with (security_invoker = on) as ' || v_nuevo;

  -- ── Funciones de lectura ───────────────────────────────────────────────────

  v_def := pg_get_functiondef('public.notas_por_cobrar_de_clientes()'::regprocedure);
  v_nuevo := replace(v_def, 'coalesce(n.fecha_pago < current_date, false)', 'false');
  if v_nuevo = v_def then raise exception 'notas_por_cobrar_de_clientes: no se encontró el cálculo de vencida.'; end if;
  execute v_nuevo;

  v_def := pg_get_functiondef('public.ventas_tablero'::regproc);
  v_nuevo := replace(v_def,
    '''vencida'', n.pendiente_por_cobrar and n.fecha_pago < current_date and coalesce(ap.aplicado, 0) < coalesce(n.total_usd, 0) - 0.05,',
    '''vencida'', false,');
  v_nuevo := replace(v_nuevo,
    '''vencida'', f.estado = ''EMITIDA'' and f.vence_el < current_date,',
    '''vencida'', false,');
  if (length(v_def) - length(v_nuevo)) < 100 then
    raise exception 'ventas_tablero: no se encontraron los dos cálculos de vencida.';
  end if;
  execute v_nuevo;

  v_def := pg_get_functiondef('public.ventas_no_se_despacha'::regproc);
  v_nuevo := replace(v_def, 'when ''deuda_vencida'' then ''Cliente con deuda vencida''',
                            'when ''deuda_vencida'' then ''Cliente con deuda pendiente''');
  if v_nuevo = v_def then raise exception 'ventas_no_se_despacha: no se encontró el rótulo de deuda vencida.'; end if;
  execute v_nuevo;

  -- ── La fecha de pago deja de exigirse ──────────────────────────────────────

  v_def := pg_get_functiondef('public.solicitar_despacho'::regproc);
  v_nuevo := replace(v_def,
    'raise exception ''Una nota pendiente por cobrar necesita su fecha de pago.'' using errcode = ''22023'';',
    'p_fecha_pago := current_date; -- 11/11/2026: no vence; se guarda el día en que quedó por cobrar');
  v_nuevo := replace(v_nuevo,
    'raise exception ''La fecha de pago no puede ser anterior a hoy.'' using errcode = ''22023'';',
    'null;');
  if (length(v_nuevo) = length(v_def)) or position('necesita su fecha de pago' in v_nuevo) > 0 then
    raise exception 'solicitar_despacho: no se encontraron las exigencias de fecha de pago.';
  end if;
  execute v_nuevo;

  v_def := pg_get_functiondef('public.editar_solicitud_despacho'::regproc);
  v_nuevo := replace(v_def,
    'raise exception ''Una nota pendiente por cobrar necesita su fecha de pago.'' using errcode = ''22023'';',
    'p_fecha_pago := coalesce(s.fecha_pago, current_date); -- 11/11/2026: no vence; se conserva la que tenía o el día de hoy');
  v_nuevo := replace(v_nuevo,
    'raise exception ''La fecha de pago no puede ser anterior a hoy.'' using errcode = ''22023'';',
    'null;');
  if (length(v_nuevo) = length(v_def)) or position('necesita su fecha de pago' in v_nuevo) > 0 then
    raise exception 'editar_solicitud_despacho: no se encontraron las exigencias de fecha de pago.';
  end if;
  execute v_nuevo;
end
$migracion$;

-- Marcar una nota por cobrar: ya no se pide fecha de pago. El parámetro se
-- conserva (con valor por defecto) para que una pantalla vieja que lo mande no
-- falle; lo que llegue se ignora.
create or replace function public.marcar_nota_de_entrega_pendiente_por_cobrar(p_id bigint, p_fecha_pago date default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nota record;
begin
  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');

  select * into v_nota from public.notas_entrega where id = p_id;

  if v_nota.id is null then
    raise exception 'No existe la nota de entrega %.', p_id using errcode = 'P0002';
  end if;

  if v_nota.estado = 'ANULADA' then
    raise exception 'La nota % está anulada: no tiene cuenta que cobrar.', v_nota.numero
      using errcode = '55000';
  end if;

  if v_nota.pendiente_por_cobrar and v_nota.cobrada_en is null then
    raise exception 'La nota % ya está pendiente por cobrar.', v_nota.numero using errcode = '55000';
  end if;

  update public.notas_entrega
     set pendiente_por_cobrar = true,
         -- La tabla exige una fecha en toda nota por cobrar
         -- (notas_entrega_cobro_coherente). Se guarda el día en que quedó por
         -- cobrar, solo como registro: no se muestra ni vence.
         fecha_pago = current_date,
         cobrada_en = null,
         aviso_vencida_en = null
   where id = p_id;
end;
$$;

comment on function public.marcar_nota_de_entrega_pendiente_por_cobrar(bigint, date) is
  'Deja la nota pendiente por cobrar. Las cuentas por cobrar no vencen (11/11/2026): fecha_pago guarda el día en que quedó por cobrar, solo como registro. p_fecha_pago se ignora.';

-- El aviso diario de cobro vencido: se PAUSA (el trabajo y su horario quedan).
do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'notas-entrega-cobro-vencido';
  if v_job is not null then
    perform cron.alter_job(v_job, active := false);
  end if;
end $$;

comment on function private.avisar_notas_pendientes_vencidas() is
  'PAUSADA el 11/11/2026: las cuentas por cobrar ya no vencen. El cron «notas-entrega-cobro-vencido» (20 11 * * *) sigue guardado con active = false; para volver, cron.alter_job(jobid, active := true).';
