-- ═══════════════════════════════════════════════════════════════════════════
-- EL DESPACHO SE PUEDE PEDIR CON PAGO COMBINADO
--
-- Se pidió una casilla en «Pedir despacho»: si el cliente va a pagar una
-- parte en dólares y otra en bolívares, marcarla y anotar cuánto de cada
-- una. No es un cobro real todavía —al pedir el despacho no ha entrado
-- dinero a ninguna cuenta, eso se reconcilia después con `cobros_venta`
-- (ver ModalCobro, 24/09/2026)—, así que esto es solo lo que se espera
-- cobrar, para que quien aprueba lo vea y quien factura lo recuerde.
--
-- POR QUÉ NO VIVE EN `moneda`/`tasa`/`total`
--
-- Esas tres columnas son el modelo de precio de toda una venta —una sola
-- moneda, con su tasa congelada, de la que salen `total_bs`/`total_usd`
-- como columnas generadas—, y lo comparte con cotizaciones y facturas.
-- Partirlo en dos monedas rompería esas columnas generadas y el resto del
-- módulo de ventas, que asume una sola. El pago combinado es un dato
-- aparte, informativo, que viaja junto al despacho sin tocar ese modelo.
--
-- DEL PEDIDO A LA NOTA, SIN VALIDARLO CONTRA EL TOTAL
--
-- `solicitar_despacho` no tiene un total que comprobar: los renglones
-- llegan en un jsonb y el total se arma en pantalla, no en una columna de
-- `solicitudes_despacho`. Recalcularlo aquí para comprobar la suma
-- duplicaría el descuento, el flete y el redondeo que ya resuelve
-- `cargar_renglones_venta`, con el riesgo de que las dos cuentas se
-- desincronicen. Por eso la base solo comprueba que el pago combinado sea
-- coherente en sí mismo —las dos cifras presentes y no negativas—; que
-- cuadre con el total lo valida la pantalla, que sí lo tiene a mano.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Las columnas, en las dos tablas: la solicitud y la nota que nace de ella.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.solicitudes_despacho
  add column if not exists pago_combinado boolean not null default false,
  add column if not exists monto_usd_combinado numeric(20, 6),
  add column if not exists monto_bs_combinado numeric(20, 6);

alter table public.solicitudes_despacho
  add constraint solicitudes_despacho_combinado_coherente check (
    (not pago_combinado and monto_usd_combinado is null and monto_bs_combinado is null)
    or (pago_combinado and monto_usd_combinado is not null and monto_bs_combinado is not null
        and monto_usd_combinado >= 0 and monto_bs_combinado >= 0)
  );

alter table public.notas_entrega
  add column if not exists pago_combinado boolean not null default false,
  add column if not exists monto_usd_combinado numeric(20, 6),
  add column if not exists monto_bs_combinado numeric(20, 6);

alter table public.notas_entrega
  add constraint notas_entrega_combinado_coherente check (
    (not pago_combinado and monto_usd_combinado is null and monto_bs_combinado is null)
    or (pago_combinado and monto_usd_combinado is not null and monto_bs_combinado is not null
        and monto_usd_combinado >= 0 and monto_bs_combinado >= 0)
  );

comment on column public.notas_entrega.pago_combinado is
  'Si el cliente paga parte en $ y parte en Bs. Informativo: no es un cobro real, '
  'solo lo que se esperaba al pedir el despacho. El cobro de verdad se registra en cobros_venta.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. private.despachar aprende los tres parámetros y los guarda en la nota.
--
-- Mismo patrón que el resto de estas migraciones: se parte la definición
-- viva con `pg_get_functiondef`, se comprueba que cada ancla aparezca
-- exactamente una vez —contando con la aritmética de longitudes, no con
-- una expresión regular, porque el texto trae paréntesis y puntos que una
-- regex tendría que escapar— y se reemplaza.
-- ───────────────────────────────────────────────────────────────────────────
do $mig$
declare
  v_def    text := pg_get_functiondef('private.despachar(bigint, bigint, jsonb, character, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text, bigint, bigint)'::regprocedure);
  v_anclas text[] := array[
    $a$p_guia_id bigint DEFAULT NULL::bigint)
 RETURNS bigint$a$,
    $a$despachada_por, ticket_id, guia_id)
  values$a$,
    $a$p_ticket_id, p_guia_id)
  returning id into v_id;$a$
  ];
  v_nuevas text[] := array[
    $n$p_guia_id bigint DEFAULT NULL::bigint,
 p_pago_combinado boolean DEFAULT false, p_monto_usd_combinado numeric DEFAULT NULL::numeric, p_monto_bs_combinado numeric DEFAULT NULL::numeric)
 RETURNS bigint$n$,
    $n$despachada_por, ticket_id, guia_id, pago_combinado, monto_usd_combinado, monto_bs_combinado)
  values$n$,
    $n$p_ticket_id, p_guia_id, coalesce(p_pago_combinado, false), p_monto_usd_combinado, p_monto_bs_combinado)
  returning id into v_id;$n$
  ];
begin
  for i in 1 .. array_length(v_anclas, 1) loop
    if (length(v_def) - length(replace(v_def, v_anclas[i], ''))) / length(v_anclas[i]) <> 1 then
      raise exception 'despachar: el ancla % no aparece exactamente una vez', i;
    end if;
    v_def := replace(v_def, v_anclas[i], v_nuevas[i]);
  end loop;

  execute 'drop function private.despachar(bigint, bigint, jsonb, character, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text, bigint, bigint)';
  execute v_def;
end
$mig$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. aprobar_despacho pasa los tres campos de la solicitud a despachar().
-- ───────────────────────────────────────────────────────────────────────────
do $mig$
declare
  v_def   text := pg_get_functiondef('public.aprobar_despacho(bigint)'::regprocedure);
  v_ancla text := $a$0, s.descuento, s.flete, null, s.observacion, s.ticket_id, s.guia_id);$a$;
  v_nueva text := $n$0, s.descuento, s.flete, null, s.observacion, s.ticket_id, s.guia_id,
    s.pago_combinado, s.monto_usd_combinado, s.monto_bs_combinado);$n$;
begin
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'aprobar_despacho: el ancla no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, v_nueva);
  execute v_def;
end
$mig$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. solicitar_despacho acepta la casilla, valida que sea coherente consigo
--    misma y la guarda en la solicitud.
-- ───────────────────────────────────────────────────────────────────────────
do $mig$
declare
  v_def    text := pg_get_functiondef('public.solicitar_despacho(bigint, bigint, jsonb, text, text, text, text, character, bigint, numeric, numeric, text, numeric, numeric, text, bigint, bigint)'::regprocedure);
  v_anclas text[] := array[
    $a$p_guia_id bigint DEFAULT NULL::bigint)
 RETURNS text$a$,
    $a$v_numero := private.siguiente_numero('SD');$a$,
    $a$peso_bruto, peso_tara, ticket, ticket_id, guia_id, descuento, flete, observacion
  ) values ($a$,
    $a$coalesce(p_descuento, 0), coalesce(p_flete, 0), nullif(btrim(coalesce(p_observacion, '')), '')
  );$a$
  ];
  v_nuevas text[] := array[
    $n$p_guia_id bigint DEFAULT NULL::bigint,
 p_pago_combinado boolean DEFAULT false, p_monto_usd_combinado numeric DEFAULT NULL::numeric, p_monto_bs_combinado numeric DEFAULT NULL::numeric)
 RETURNS text$n$,
    $n$if coalesce(p_pago_combinado, false) then
    if p_monto_usd_combinado is null or p_monto_bs_combinado is null then
      raise exception 'Un pago combinado necesita los dos montos, el de dólares y el de bolívares.'
        using errcode = '22023';
    end if;
    if p_monto_usd_combinado < 0 or p_monto_bs_combinado < 0 then
      raise exception 'El monto combinado no puede ser negativo.' using errcode = '22023';
    end if;
  end if;

  v_numero := private.siguiente_numero('SD');$n$,
    $n$peso_bruto, peso_tara, ticket, ticket_id, guia_id, descuento, flete, observacion,
    pago_combinado, monto_usd_combinado, monto_bs_combinado
  ) values ($n$,
    $n$coalesce(p_descuento, 0), coalesce(p_flete, 0), nullif(btrim(coalesce(p_observacion, '')), ''),
    coalesce(p_pago_combinado, false), p_monto_usd_combinado, p_monto_bs_combinado
  );$n$
  ];
begin
  for i in 1 .. array_length(v_anclas, 1) loop
    if (length(v_def) - length(replace(v_def, v_anclas[i], ''))) / length(v_anclas[i]) <> 1 then
      raise exception 'solicitar_despacho: el ancla % no aparece exactamente una vez', i;
    end if;
    v_def := replace(v_def, v_anclas[i], v_nuevas[i]);
  end loop;

  execute 'drop function public.solicitar_despacho(bigint, bigint, jsonb, text, text, text, text, character, bigint, numeric, numeric, text, numeric, numeric, text, bigint, bigint)';
  execute v_def;
end
$mig$;

revoke all on function public.solicitar_despacho(
  bigint, bigint, jsonb, text, text, text, text, character, bigint, numeric, numeric,
  text, numeric, numeric, text, bigint, bigint, boolean, numeric, numeric
) from public, anon;
grant execute on function public.solicitar_despacho(
  bigint, bigint, jsonb, text, text, text, text, character, bigint, numeric, numeric,
  text, numeric, numeric, text, bigint, bigint, boolean, numeric, numeric
) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Las dos vistas enseñan las tres columnas, al final: v_notas_entrega y
--    v_solicitudes_despacho. `create or replace view` vale porque solo se
--    añade al final (las-migraciones-no-se-replican-desde-cero).
-- ───────────────────────────────────────────────────────────────────────────
do $mig$
declare
  v_def   text := pg_get_viewdef('public.v_notas_entrega'::regclass, true);
  v_ancla text := $a$) AS camiones
   FROM notas_entrega n$a$;
  v_nueva text := $n$) AS camiones,
    n.pago_combinado,
    n.monto_usd_combinado,
    n.monto_bs_combinado
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
  v_ancla text := $a$) AS renglones
   FROM solicitudes_despacho s$a$;
  v_nueva text := $n$) AS renglones,
    s.pago_combinado,
    s.monto_usd_combinado,
    s.monto_bs_combinado
   FROM solicitudes_despacho s$n$;
begin
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'v_solicitudes_despacho: el ancla no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, v_nueva);
  execute 'create or replace view public.v_solicitudes_despacho with (security_invoker = on) as ' || v_def;
end
$mig$;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Comprobación
-- ───────────────────────────────────────────────────────────────────────────
do $comprueba$
declare
  v_oid_solicitar regprocedure;
  v_oid_despachar  regprocedure;
begin
  select oid::regprocedure into v_oid_solicitar
    from pg_proc where proname = 'solicitar_despacho' and pronamespace = 'public'::regnamespace;
  select oid::regprocedure into v_oid_despachar
    from pg_proc where proname = 'despachar' and pronamespace = 'private'::regnamespace;

  if position('p_monto_bs_combinado' in pg_get_functiondef(v_oid_solicitar)) = 0 then
    raise exception 'solicitar_despacho no quedó con el pago combinado.';
  end if;
  if position('monto_bs_combinado' in pg_get_functiondef(v_oid_despachar)) = 0 then
    raise exception 'despachar no quedó guardando el pago combinado en la nota.';
  end if;
  if position('n.monto_bs_combinado' in pg_get_viewdef('public.v_notas_entrega'::regclass, true)) = 0 then
    raise exception 'v_notas_entrega no enseña el pago combinado.';
  end if;
  if position('s.monto_bs_combinado' in pg_get_viewdef('public.v_solicitudes_despacho'::regclass, true)) = 0 then
    raise exception 'v_solicitudes_despacho no enseña el pago combinado.';
  end if;
  if (select array_to_string(reloptions, ',') from pg_class where oid = 'public.v_notas_entrega'::regclass)
     is distinct from 'security_invoker=on' then
    raise exception 'v_notas_entrega perdió security_invoker.';
  end if;
  if (select array_to_string(reloptions, ',') from pg_class where oid = 'public.v_solicitudes_despacho'::regclass)
     is distinct from 'security_invoker=on' then
    raise exception 'v_solicitudes_despacho perdió security_invoker.';
  end if;
end
$comprueba$;
