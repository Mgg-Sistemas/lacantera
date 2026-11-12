-- ============================================================================
-- «DESPACHAR ESTA COTIZACIÓN» DEJA EL DESPACHO POR COMPLETAR (12/11/2026)
--
-- Pedido: al tocar Despachar en una cotización, que quede pedido al instante
-- con sus datos, y que quien entra a Facturación ponga lo que falta. Antes el
-- botón abría «Pedir despacho» y no dejaba enviarlo sin patio, placa, chofer y
-- cédula —datos que quien vende casi nunca tiene—.
--
-- LA MARCA VIVE EN LA COTIZACIÓN, NO EN UN DESPACHO A MEDIAS. Se pensó crear el
-- pedido de despacho (SD) vacío, pero `solicitudes_despacho` exige patio,
-- placa, chofer y cédula, y relajarlo habría tocado la aprobación, su vista y
-- el contador «despachos por aprobar» del panel (contaría despachos que nadie
-- puede aprobar todavía). Así, quien completa usa el «Pedir despacho» de
-- siempre, precargado, con todas sus validaciones; el SD nace al completar y
-- sigue a la aprobación de siempre. Al aprobarse nace la nota de entrega y la
-- cotización queda aceptada (eso ya lo hacía `private.despachar`).
--
-- «POR COMPLETAR» SE DEDUCE: cotización ENVIADA, con el despacho pedido y no
-- cancelado, y sin un SD esperando aprobación. Si el SD se rechaza, vuelve a
-- quedar por completar: no se pierde.
--
-- Decisiones del usuario: una cotización VENCIDA se despacha igual (la pantalla
-- avisa); el descuento y el flete de la cotización viajan al despacho.
--
-- Y SE CIERRA UN HUECO: hasta hoy se podían pedir dos despachos a la vez de la
-- misma cotización. `solicitar_despacho` ahora lo impide (solo los que esperan
-- aprobación: despachar por partes sigue siendo posible).
-- ============================================================================

-- ─────────────────────────────── la marca en la cotización ─────────────────

alter table public.cotizaciones_venta
  add column if not exists despacho_pedido_en          timestamptz,
  add column if not exists despacho_pedido_por         uuid,
  add column if not exists despacho_cancelado_en       timestamptz,
  add column if not exists despacho_cancelado_por      uuid,
  add column if not exists despacho_motivo_cancelacion text;

-- ─────────────────────────────── pedir el despacho ──────────────────────────

create or replace function public.pedir_despacho_de_cotizacion(p_id bigint)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cot     public.cotizaciones_venta;
  v_cliente text;
  v_sd      text;
  v_roles   text[];
begin
  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');

  select * into v_cot from public.cotizaciones_venta where id = p_id for update;
  if v_cot.id is null then
    raise exception 'No existe esa cotización.' using errcode = 'P0002';
  end if;
  if v_cot.estado <> 'ENVIADA' then
    raise exception 'La cotización % está %: solo se despacha una enviada.', v_cot.numero, lower(v_cot.estado)
      using errcode = '55000';
  end if;
  if not exists (select 1 from public.cotizacion_venta_renglones where cotizacion_id = p_id) then
    raise exception 'La cotización % no tiene renglones que despachar.', v_cot.numero using errcode = '22023';
  end if;

  select numero into v_sd
    from public.solicitudes_despacho
   where cotizacion_id = p_id and estado = 'PEDIDA'
   limit 1;
  if v_sd is not null then
    raise exception 'La cotización % ya tiene el despacho % esperando aprobación.', v_cot.numero, v_sd
      using errcode = '55000';
  end if;
  if v_cot.despacho_pedido_en is not null and v_cot.despacho_cancelado_en is null then
    raise exception 'El despacho de la cotización % ya está pedido: Facturación lo está completando.', v_cot.numero
      using errcode = '55000',
            hint = 'Lo encuentra en Facturación › Notas de entrega, en «Por completar».';
  end if;

  update public.cotizaciones_venta
     set despacho_pedido_en = now(),
         despacho_pedido_por = (select auth.uid()),
         despacho_cancelado_en = null,
         despacho_cancelado_por = null,
         despacho_motivo_cancelacion = null
   where id = p_id;

  -- El aviso va a quien completa: los roles que escriben en Facturación.
  select coalesce(array_agg(rol), array['ADMIN'])
    into v_roles
    from public.rol_permisos
   where modulo = 'FACTURACION' and nivel in ('ESCRITURA', 'TOTAL');

  select nombre into v_cliente from public.clientes where id = v_cot.cliente_id;

  insert into public.notificaciones
    (modulo, tipo, titulo, detalle, ruta, roles, importancia, actor_id)
  values
    ('FACTURACION', 'DESPACHO_POR_COMPLETAR',
     'Despacho por completar · ' || v_cot.numero,
     coalesce(v_cliente, '—') || ' · falta patio, vehículo y chofer'
       || case when v_cot.fecha + v_cot.validez_dias < private.hoy_aqui() then ' · cotización vencida' else '' end,
     '/app/facturacion/notas-entrega?cotizacion=' || p_id,
     v_roles, 'ATENCION', (select auth.uid()));

  return v_cot.numero;
end;
$$;

-- ─────────────────────────────── cancelar el pedido ─────────────────────────
--
-- Si al final no se despacha. No se borra: queda quién y por qué, y la
-- cotización sigue enviada (se puede volver a pedir, o cerrarla en Ventas).

create or replace function public.cancelar_pedido_de_despacho(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_cot public.cotizaciones_venta;
begin
  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Diga por qué no se despacha.' using errcode = '22023';
  end if;

  select * into v_cot from public.cotizaciones_venta where id = p_id for update;
  if v_cot.id is null then
    raise exception 'No existe esa cotización.' using errcode = 'P0002';
  end if;
  if v_cot.despacho_pedido_en is null or v_cot.despacho_cancelado_en is not null then
    raise exception 'La cotización % no tiene un despacho pedido.', v_cot.numero using errcode = '55000';
  end if;

  update public.cotizaciones_venta
     set despacho_cancelado_en = now(),
         despacho_cancelado_por = (select auth.uid()),
         despacho_motivo_cancelacion = btrim(p_motivo)
   where id = p_id;
end;
$$;

revoke all on function public.pedir_despacho_de_cotizacion(bigint) from public, anon;
revoke all on function public.cancelar_pedido_de_despacho(bigint, text) from public, anon;
grant execute on function public.pedir_despacho_de_cotizacion(bigint) to authenticated;
grant execute on function public.cancelar_pedido_de_despacho(bigint, text) to authenticated;

-- ─────────────────────────────── un solo despacho a la vez por cotización ──
--
-- `solicitar_despacho` se rehace con la misma firma (no hace falta renombrar):
-- solo se le suma, antes de numerar, el bloqueo de un segundo despacho que
-- espera aprobación para la misma cotización. Se cambia por reemplazo exacto
-- y se comprueba que el texto esperado estaba: si alguien la cambió, para.

do $mig$
declare
  v_def text;
  c_ancla constant text := $a$  v_numero := private.siguiente_numero('SD');$a$;
  c_nuevo constant text := $a$  -- Un solo despacho esperando aprobación por cotización (12/11/2026).
  if p_cotizacion_id is not null then
    perform 1 from public.cotizaciones_venta where id = p_cotizacion_id for update;
    if exists (select 1 from public.solicitudes_despacho
                where cotizacion_id = p_cotizacion_id and estado = 'PEDIDA') then
      raise exception 'Esa cotización ya tiene un despacho esperando aprobación.'
        using errcode = '55000',
              hint = 'Apruébelo, rechácelo o cancélelo antes de pedir otro.';
    end if;
  end if;

  v_numero := private.siguiente_numero('SD');$a$;
begin
  v_def := pg_get_functiondef('public.solicitar_despacho(bigint,bigint,jsonb,text,text,text,text,character,bigint,numeric,numeric,text,numeric,numeric,text,bigint,bigint,boolean,numeric,numeric,boolean,date)'::regprocedure);
  if position(c_ancla in v_def) = 0 then
    raise exception 'solicitar_despacho no tiene el texto esperado: alguien la cambió. Revisar a mano.';
  end if;
  if position('Un solo despacho esperando aprobación por cotización' in v_def) > 0 then
    return; -- ya aplicada
  end if;
  execute replace(v_def, c_ancla, c_nuevo);
end
$mig$;

-- ─────────────────────────────── la vista de cotizaciones ───────────────────
--
-- Columnas nuevas AL FINAL (así `create or replace view` no choca con las que
-- ya existen) y conservando `security_invoker`. Se arma desde la definición
-- viva para no reescribir a mano sus montos enmascarados.

do $mig$
declare
  v_def   text;
  c_ancla constant text := E'\n   FROM (cotizaciones_venta q';
  c_extra constant text := $x$,
    q.despacho_pedido_en,
    q.despacho_cancelado_en,
    q.despacho_motivo_cancelacion,
    ( SELECT pp.nombre FROM perfiles pp WHERE pp.id = q.despacho_pedido_por) AS despacho_pedido_por_nombre,
    ((q.estado = 'ENVIADA'::text) AND (q.despacho_pedido_en IS NOT NULL) AND (q.despacho_cancelado_en IS NULL)
      AND (NOT (EXISTS ( SELECT 1 FROM solicitudes_despacho sd
                          WHERE sd.cotizacion_id = q.id AND sd.estado = 'PEDIDA'::text)))) AS despacho_por_completar,
    ( SELECT sd.numero FROM solicitudes_despacho sd
       WHERE sd.cotizacion_id = q.id AND sd.estado = 'PEDIDA'::text
       ORDER BY sd.id DESC LIMIT 1) AS despacho_por_aprobar$x$;
begin
  v_def := pg_get_viewdef('public.v_cotizaciones_venta'::regclass);
  if position('despacho_por_completar' in v_def) > 0 then
    return; -- ya aplicada
  end if;
  if position(c_ancla in v_def) = 0 then
    raise exception 'v_cotizaciones_venta no tiene la forma esperada. Revisar a mano.';
  end if;
  v_def := replace(v_def, c_ancla, c_extra || c_ancla);
  execute 'create or replace view public.v_cotizaciones_venta with (security_invoker = on) as ' || v_def;
end
$mig$;

-- ─────────────────────────────────── comprobación ───────────────────────────
-- Debe devolver: columnas = 5, funciones = 2, bloqueo = true, vista = true, invoker = true.

select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'cotizaciones_venta'
      and column_name like 'despacho\_%')                                                as columnas,
  (select count(*) from pg_proc where proname in ('pedir_despacho_de_cotizacion', 'cancelar_pedido_de_despacho')) as funciones,
  (select position('Un solo despacho esperando aprobación' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p where p.proname = 'solicitar_despacho' limit 1)                     as bloqueo,
  (select position('despacho_por_completar' in pg_get_viewdef('public.v_cotizaciones_venta'::regclass)) > 0) as vista,
  (select 'security_invoker=on' = any(reloptions) from pg_class where oid = 'public.v_cotizaciones_venta'::regclass) as invoker;
