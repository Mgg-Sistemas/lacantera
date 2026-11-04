-- ============================================================================
-- EL ADMIN EDITA EL DESPACHO ANTES DE APROBAR (04/11/2026)
--
-- A veces quien pide un despacho olvida poner la observación general o el
-- motivo de un renglón (por ejemplo, cuando un precio acordado pisa el de
-- lista o sale sin cargo), y al momento de aprobarlo la base lo frena.
-- Antes de este cambio la única salida era rechazar o cancelar el pedido y
-- volverlo a cargar entero desde cero.
--
-- Esta función permite corregir el despacho mientras sigue en estado PEDIDA.
-- Exige el rol ADMIN (`private.exigir_rol('ADMIN')`), igual que
-- `editar_nota_entrega`, y el disparador `trg_auditar` de
-- `solicitudes_despacho` deja el antes y el después en la bitácora.
-- ============================================================================

create or replace function public.editar_solicitud_despacho(
  p_id                   bigint,
  p_cliente_id           bigint,
  p_almacen_id           bigint,
  p_renglones            jsonb,
  p_vehiculo             text,
  p_chofer               text,
  p_cedula_chofer        text,
  p_vehiculo_descripcion text default null,
  p_moneda               character default null,
  p_peso_bruto           numeric default null,
  p_peso_tara            numeric default null,
  p_ticket               text default null,
  p_flete                numeric default 0,
  p_observacion          text default null,
  p_pago_combinado       boolean default false,
  p_monto_usd_combinado  numeric default null,
  p_monto_bs_combinado   numeric default null,
  p_pendiente_por_cobrar boolean default false,
  p_fecha_pago           date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.solicitudes_despacho;
begin
  perform private.exigir_rol('ADMIN');

  select * into s from public.solicitudes_despacho where id = p_id for update;
  if not found then
    raise exception 'Ese despacho no existe.' using errcode = 'P0002';
  end if;
  if s.estado <> 'PEDIDA' then
    raise exception 'El despacho % ya no está esperando aprobación: solo se edita antes de aprobar.', s.numero
      using errcode = '55000';
  end if;

  if not exists (select 1 from public.clientes where id = p_cliente_id) then
    raise exception 'Ese cliente no existe.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.almacenes where id = p_almacen_id and activo) then
    raise exception 'Ese patio no existe o está cerrado.' using errcode = 'P0002';
  end if;
  if p_renglones is null or jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El despacho no lleva material.' using errcode = '22023';
  end if;

  if length(private.placa_limpia(p_vehiculo)) < 4 then
    raise exception 'Falta la placa del vehículo.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_chofer, ''))) < 3 then
    raise exception 'Falta el nombre del chofer.' using errcode = '22023';
  end if;
  if length(private.cedula_comparable(p_cedula_chofer)) < 5 then
    raise exception 'Falta la cédula del chofer.' using errcode = '22023';
  end if;

  if coalesce(p_pago_combinado, false) then
    if p_monto_usd_combinado is null or p_monto_bs_combinado is null then
      raise exception 'Un pago combinado necesita los dos montos, el de dólares y el de bolívares.'
        using errcode = '22023';
    end if;
    if p_monto_usd_combinado < 0 or p_monto_bs_combinado < 0 then
      raise exception 'El monto combinado no puede ser negativo.' using errcode = '22023';
    end if;
  end if;

  if coalesce(p_pendiente_por_cobrar, false) then
    if p_fecha_pago is null then
      raise exception 'Una nota pendiente por cobrar necesita su fecha de pago.' using errcode = '22023';
    end if;
    if p_fecha_pago < current_date and p_fecha_pago is distinct from s.fecha_pago then
      raise exception 'La fecha de pago no puede ser anterior a hoy.' using errcode = '22023';
    end if;
  end if;

  update public.solicitudes_despacho
     set cliente_id           = p_cliente_id,
         almacen_id           = p_almacen_id,
         renglones            = p_renglones,
         moneda               = coalesce(nullif(upper(btrim(coalesce(p_moneda, ''))), ''), s.moneda),
         vehiculo             = private.placa_limpia(p_vehiculo),
         vehiculo_despacho_id = private.vehiculo_del_despacho(p_vehiculo, p_vehiculo_descripcion),
         chofer               = btrim(p_chofer),
         cedula_chofer        = btrim(p_cedula_chofer),
         chofer_id            = private.chofer_del_despacho(p_chofer, p_cedula_chofer),
         peso_bruto           = p_peso_bruto,
         peso_tara            = p_peso_tara,
         ticket               = nullif(btrim(coalesce(p_ticket, '')), ''),
         flete                = coalesce(p_flete, 0),
         observacion          = nullif(btrim(coalesce(p_observacion, '')), ''),
         pago_combinado       = coalesce(p_pago_combinado, false),
         monto_usd_combinado  = case when coalesce(p_pago_combinado, false) then p_monto_usd_combinado else null end,
         monto_bs_combinado   = case when coalesce(p_pago_combinado, false) then p_monto_bs_combinado else null end,
         pendiente_por_cobrar = coalesce(p_pendiente_por_cobrar, false),
         fecha_pago           = case when coalesce(p_pendiente_por_cobrar, false) then p_fecha_pago else null end
   where id = p_id;
end;
$$;

revoke all on function public.editar_solicitud_despacho(
  bigint, bigint, bigint, jsonb, text, text, text, text, character,
  numeric, numeric, text, numeric, text, boolean, numeric, numeric, boolean, date
) from public, anon;

grant execute on function public.editar_solicitud_despacho(
  bigint, bigint, bigint, jsonb, text, text, text, text, character,
  numeric, numeric, text, numeric, text, boolean, numeric, numeric, boolean, date
) to authenticated, service_role;

-- ─────────────────────────────────── comprobación ───────────────────────────
do $comprueba$
declare
  v_oid regprocedure := 'public.editar_solicitud_despacho(
    bigint, bigint, bigint, jsonb, text, text, text, text, character,
    numeric, numeric, text, numeric, text, boolean, numeric, numeric, boolean, date)'::regprocedure;
begin
  if not exists (
    select 1 from pg_proc where oid = v_oid
      and prosecdef
      and (select array_to_string(proconfig, ',') from pg_proc where oid = v_oid) like '%search_path=%'
  ) then
    raise exception 'editar_solicitud_despacho no quedó como security definer con search_path fijo.';
  end if;
  if position('exigir_rol' in pg_get_functiondef(v_oid)) = 0 then
    raise exception 'editar_solicitud_despacho no exige el rol ADMIN.';
  end if;
  if has_function_privilege('anon', v_oid, 'execute') then
    raise exception 'editar_solicitud_despacho no puede ser ejecutable por anon.';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception 'editar_solicitud_despacho tiene que ser ejecutable por authenticated.';
  end if;
end
$comprueba$;
