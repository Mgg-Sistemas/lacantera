-- ============================================================================
-- La nota de entrega se puede pedir pendiente por cobrar
--
-- Christopher, 12/10/2026, después de revertir el intento anterior (una
-- cuenta con su propio libro de cobros): «a la hora de crear la nota de
-- entrega tenga una opción de cuenta por cobrar... que no se enlace a otro
-- módulo, que simplemente quede como pendiente por cobrar y se pueda buscar
-- en una categoría en notas de entrega, que se pueda poner una fecha de pago
-- y el sistema avise cuando se pase esa fecha».
--
-- Así que esto NO es un libro de movimientos ni toca tesorería, cuentas por
-- cobrar ni facturación: son dos columnas en la propia nota —si queda
-- pendiente, y para cuándo— más una tercera para marcarla resuelta, un
-- filtro en la pantalla y un aviso en la campana cuando se pasa la fecha, por
-- el mismo cron que ya usa Asignaciones para sus herramientas vencidas.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Las columnas: en la solicitud (lo que se pide) y en la nota (lo que
--    queda). `fecha_pago` es obligatoria si se marca pendiente por cobrar, y
--    no puede haber fecha sin la marca.
-- ---------------------------------------------------------------------------
alter table public.solicitudes_despacho
  add column if not exists pendiente_por_cobrar boolean not null default false,
  add column if not exists fecha_pago date;

alter table public.solicitudes_despacho
  add constraint solicitudes_despacho_cobro_coherente check (
    (pendiente_por_cobrar and fecha_pago is not null)
    or (not pendiente_por_cobrar and fecha_pago is null)
  );

alter table public.notas_entrega
  add column if not exists pendiente_por_cobrar boolean not null default false,
  add column if not exists fecha_pago date,
  -- Cuándo se marcó resuelta. Null todavía: sigue pendiente (o nunca lo estuvo).
  add column if not exists cobrada_en timestamptz,
  -- Para que el cron de abajo no avise dos veces lo mismo.
  add column if not exists aviso_vencida_en timestamptz;

alter table public.notas_entrega
  add constraint notas_entrega_cobro_coherente check (
    (pendiente_por_cobrar and fecha_pago is not null)
    or (not pendiente_por_cobrar and fecha_pago is null and cobrada_en is null)
  );

comment on column public.notas_entrega.pendiente_por_cobrar is
  'Recordatorio aparte de facturación: esta nota se vendió a crédito y queda pendiente por cobrar. No se enlaza a cuentas por cobrar, notas de crédito ni ninguna factura.';

-- ---------------------------------------------------------------------------
-- 2. private.despachar aprende los dos parámetros y los guarda en la nota.
-- ---------------------------------------------------------------------------
do $mig$
declare
  v_def    text := pg_get_functiondef('private.despachar(bigint, bigint, jsonb, character, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text, bigint, bigint, boolean, numeric, numeric)'::regprocedure);
  v_anclas text[] := array[
    $a$p_monto_bs_combinado numeric DEFAULT NULL::numeric)
 RETURNS bigint$a$,
    $a$guia_id, pago_combinado, monto_usd_combinado, monto_bs_combinado)
  values$a$,
    $a$p_ticket_id, p_guia_id, coalesce(p_pago_combinado, false), p_monto_usd_combinado, p_monto_bs_combinado)
  returning id into v_id;$a$
  ];
  v_nuevas text[] := array[
    $n$p_monto_bs_combinado numeric DEFAULT NULL::numeric,
 p_pendiente_por_cobrar boolean DEFAULT false, p_fecha_pago date DEFAULT NULL::date)
 RETURNS bigint$n$,
    $n$guia_id, pago_combinado, monto_usd_combinado, monto_bs_combinado, pendiente_por_cobrar, fecha_pago)
  values$n$,
    $n$p_ticket_id, p_guia_id, coalesce(p_pago_combinado, false), p_monto_usd_combinado, p_monto_bs_combinado,
     coalesce(p_pendiente_por_cobrar, false), p_fecha_pago)
  returning id into v_id;$n$
  ];
begin
  for i in 1 .. array_length(v_anclas, 1) loop
    if (length(v_def) - length(replace(v_def, v_anclas[i], ''))) / length(v_anclas[i]) <> 1 then
      raise exception 'despachar: el ancla % no aparece exactamente una vez', i;
    end if;
    v_def := replace(v_def, v_anclas[i], v_nuevas[i]);
  end loop;

  execute 'drop function private.despachar(bigint, bigint, jsonb, character, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text, bigint, bigint, boolean, numeric, numeric)';
  execute v_def;
end
$mig$;

-- ---------------------------------------------------------------------------
-- 3. aprobar_despacho pasa los dos campos de la solicitud a despachar().
-- ---------------------------------------------------------------------------
do $mig$
declare
  v_def   text := pg_get_functiondef('public.aprobar_despacho(bigint)'::regprocedure);
  v_ancla text := $a$s.pago_combinado, s.monto_usd_combinado, s.monto_bs_combinado);$a$;
  v_nueva text := $n$s.pago_combinado, s.monto_usd_combinado, s.monto_bs_combinado,
    s.pendiente_por_cobrar, s.fecha_pago);$n$;
begin
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'aprobar_despacho: el ancla no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, v_nueva);
  execute v_def;
end
$mig$;

-- ---------------------------------------------------------------------------
-- 4. solicitar_despacho acepta la casilla, exige la fecha —que no sea
--    pasada, porque poner un vencimiento ya vencido no tiene sentido— y la
--    guarda en la solicitud.
-- ---------------------------------------------------------------------------
do $mig$
declare
  v_def    text := pg_get_functiondef('public.solicitar_despacho(bigint, bigint, jsonb, text, text, text, text, character, bigint, numeric, numeric, text, numeric, numeric, text, bigint, bigint, boolean, numeric, numeric)'::regprocedure);
  v_anclas text[] := array[
    $a$p_monto_bs_combinado numeric DEFAULT NULL::numeric)
 RETURNS text$a$,
    $a$v_numero := private.siguiente_numero('SD');$a$,
    $a$pago_combinado, monto_usd_combinado, monto_bs_combinado
  ) values ($a$,
    $a$coalesce(p_pago_combinado, false), p_monto_usd_combinado, p_monto_bs_combinado
  );$a$
  ];
  v_nuevas text[] := array[
    $n$p_monto_bs_combinado numeric DEFAULT NULL::numeric,
 p_pendiente_por_cobrar boolean DEFAULT false, p_fecha_pago date DEFAULT NULL::date)
 RETURNS text$n$,
    $n$if coalesce(p_pendiente_por_cobrar, false) then
    if p_fecha_pago is null then
      raise exception 'Una nota pendiente por cobrar necesita su fecha de pago.' using errcode = '22023';
    end if;
    if p_fecha_pago < current_date then
      raise exception 'La fecha de pago no puede ser anterior a hoy.' using errcode = '22023';
    end if;
  end if;

  v_numero := private.siguiente_numero('SD');$n$,
    $n$pago_combinado, monto_usd_combinado, monto_bs_combinado,
    pendiente_por_cobrar, fecha_pago
  ) values ($n$,
    $n$coalesce(p_pago_combinado, false), p_monto_usd_combinado, p_monto_bs_combinado,
    coalesce(p_pendiente_por_cobrar, false), p_fecha_pago
  );$n$
  ];
begin
  for i in 1 .. array_length(v_anclas, 1) loop
    if (length(v_def) - length(replace(v_def, v_anclas[i], ''))) / length(v_anclas[i]) <> 1 then
      raise exception 'solicitar_despacho: el ancla % no aparece exactamente una vez', i;
    end if;
    v_def := replace(v_def, v_anclas[i], v_nuevas[i]);
  end loop;

  execute 'drop function public.solicitar_despacho(bigint, bigint, jsonb, text, text, text, text, character, bigint, numeric, numeric, text, numeric, numeric, text, bigint, bigint, boolean, numeric, numeric)';
  execute v_def;
end
$mig$;

revoke all on function public.solicitar_despacho(
  bigint, bigint, jsonb, text, text, text, text, character, bigint, numeric, numeric,
  text, numeric, numeric, text, bigint, bigint, boolean, numeric, numeric, boolean, date
) from public, anon;
grant execute on function public.solicitar_despacho(
  bigint, bigint, jsonb, text, text, text, text, character, bigint, numeric, numeric,
  text, numeric, numeric, text, bigint, bigint, boolean, numeric, numeric, boolean, date
) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Marcar una nota como cobrada: lo único que se puede hacer después de
--    pedirla. No reversa nada de inventario ni de tesorería —no hay nada que
--    reversar—, solo apaga el recordatorio.
-- ---------------------------------------------------------------------------
create or replace function public.marcar_nota_de_entrega_cobrada(p_id bigint)
returns void
language plpgsql
volatile
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

  if not v_nota.pendiente_por_cobrar then
    raise exception 'La nota % no quedó pendiente por cobrar.', v_nota.numero using errcode = '55000';
  end if;

  if v_nota.cobrada_en is not null then
    raise exception 'La nota % ya se había marcado como cobrada.', v_nota.numero using errcode = '55000';
  end if;

  update public.notas_entrega set cobrada_en = now() where id = p_id;
end;
$$;

revoke all on function public.marcar_nota_de_entrega_cobrada(bigint) from public, anon;
grant execute on function public.marcar_nota_de_entrega_cobrada(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. El aviso: mismo patrón que `private.avisar_asignaciones_vencidas` —un
--    cron diario que recorre lo vencido, avisa una vez y lo marca para no
--    repetir—.
-- ---------------------------------------------------------------------------
create or replace function private.avisar_notas_pendientes_vencidas()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_fila    record;
  v_cuantas integer := 0;
begin
  for v_fila in
    select n.id, n.numero, n.fecha_pago, cl.nombre as cliente
      from public.notas_entrega n
      left join public.clientes cl on cl.id = n.cliente_id
     where n.pendiente_por_cobrar
       and n.estado <> 'ANULADA'
       and n.cobrada_en is null
       and n.fecha_pago < current_date
       and n.aviso_vencida_en is null
  loop
    perform private.notificar(
      'FACTURACION', 'NOTA_ENTREGA_COBRO_VENCIDO',
      'Pasó la fecha de pago de ' || v_fila.numero,
      coalesce(v_fila.cliente, 'Cliente por concretar') || ' · vencía el ' ||
        to_char(v_fila.fecha_pago, 'DD/MM/YYYY'),
      '/app/facturacion/notas-entrega?nota=' || v_fila.numero,
      array['ADMIN'], 'ATENCION');

    update public.notas_entrega set aviso_vencida_en = now() where id = v_fila.id;
    v_cuantas := v_cuantas + 1;
  end loop;

  return v_cuantas;
end;
$function$;

select cron.unschedule('notas-entrega-cobro-vencido')
 where exists (select 1 from cron.job where jobname = 'notas-entrega-cobro-vencido');

select cron.schedule(
  'notas-entrega-cobro-vencido', '20 11 * * *',
  'select private.avisar_notas_pendientes_vencidas()'
);

-- ---------------------------------------------------------------------------
-- 7. Las dos vistas enseñan las columnas nuevas, al final.
-- ---------------------------------------------------------------------------
do $mig$
declare
  v_def   text := pg_get_viewdef('public.v_notas_entrega'::regclass, true);
  v_ancla text := $a$n.pago_combinado,
    n.monto_usd_combinado,
    n.monto_bs_combinado
   FROM notas_entrega n$a$;
  v_nueva text := $n$n.pago_combinado,
    n.monto_usd_combinado,
    n.monto_bs_combinado,
    n.pendiente_por_cobrar,
    n.fecha_pago,
    n.cobrada_en,
    (n.pendiente_por_cobrar AND n.cobrada_en IS NULL AND n.fecha_pago < CURRENT_DATE) AS vencida_por_cobrar
   FROM notas_entrega n$n$;
begin
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'v_notas_entrega: el ancla no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, v_nueva);
  execute 'create or replace view public.v_notas_entrega with (security_invoker = on) as ' || v_def;
end
$mig$;

do $mig$
declare
  v_def   text := pg_get_viewdef('public.v_solicitudes_despacho'::regclass, true);
  v_ancla text := $a$s.pago_combinado,
    s.monto_usd_combinado,
    s.monto_bs_combinado
   FROM solicitudes_despacho s$a$;
  v_nueva text := $n$s.pago_combinado,
    s.monto_usd_combinado,
    s.monto_bs_combinado,
    s.pendiente_por_cobrar,
    s.fecha_pago
   FROM solicitudes_despacho s$n$;
begin
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'v_solicitudes_despacho: el ancla no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, v_nueva);
  execute 'create or replace view public.v_solicitudes_despacho with (security_invoker = on) as ' || v_def;
end
$mig$;

-- ---------------------------------------------------------------------------
-- 8. Comprobación
-- ---------------------------------------------------------------------------
do $comprueba$
declare
  v_oid_solicitar regprocedure;
  v_oid_despachar  regprocedure;
begin
  select oid::regprocedure into v_oid_solicitar
    from pg_proc where proname = 'solicitar_despacho' and pronamespace = 'public'::regnamespace;
  select oid::regprocedure into v_oid_despachar
    from pg_proc where proname = 'despachar' and pronamespace = 'private'::regnamespace;

  if position('p_fecha_pago' in pg_get_functiondef(v_oid_solicitar)) = 0 then
    raise exception 'solicitar_despacho no quedó con pendiente por cobrar.';
  end if;
  if position('fecha_pago' in pg_get_functiondef(v_oid_despachar)) = 0 then
    raise exception 'despachar no quedó guardando la fecha de pago en la nota.';
  end if;
  if position('s.fecha_pago' in pg_get_functiondef('public.aprobar_despacho(bigint)'::regprocedure)) = 0 then
    raise exception 'aprobar_despacho no quedó pasando la fecha de pago.';
  end if;
  if position('AS vencida_por_cobrar' in pg_get_viewdef('public.v_notas_entrega'::regclass, true)) = 0 then
    raise exception 'v_notas_entrega no calcula vencida_por_cobrar.';
  end if;
  if position('s.fecha_pago' in pg_get_viewdef('public.v_solicitudes_despacho'::regclass, true)) = 0 then
    raise exception 'v_solicitudes_despacho no enseña la fecha de pago.';
  end if;
  if (select array_to_string(reloptions, ',') from pg_class where oid = 'public.v_notas_entrega'::regclass)
     is distinct from 'security_invoker=on' then
    raise exception 'v_notas_entrega perdió security_invoker.';
  end if;
  if (select array_to_string(reloptions, ',') from pg_class where oid = 'public.v_solicitudes_despacho'::regclass)
     is distinct from 'security_invoker=on' then
    raise exception 'v_solicitudes_despacho perdió security_invoker.';
  end if;
  if not exists (select 1 from pg_proc where proname = 'marcar_nota_de_entrega_cobrada' and pronamespace = 'public'::regnamespace) then
    raise exception 'marcar_nota_de_entrega_cobrada no quedó creada.';
  end if;
  if not exists (select 1 from pg_proc where proname = 'avisar_notas_pendientes_vencidas' and pronamespace = 'private'::regnamespace) then
    raise exception 'avisar_notas_pendientes_vencidas no quedó creada.';
  end if;
  if not exists (select 1 from cron.job where jobname = 'notas-entrega-cobro-vencido') then
    raise exception 'el cron de notas pendientes no quedó agendado.';
  end if;
end
$comprueba$;
