create table public.retenciones_fiscales (
  id bigint generated always as identity (start with 4294967296) primary key,
  numero_comprobante text not null unique check (numero_comprobante ~ '^[0-9]{14}$'),
  periodo text not null,
  fecha_emision date not null,
  fecha_entrega date,
  tipo_impuesto text not null check (tipo_impuesto in ('IVA', 'ISLR', 'ISAE', 'ESTADAL')),
  estado text not null default 'REGISTRADA' check (estado in ('REGISTRADA', 'DECLARADA', 'ANULADA')),
  proveedor_id bigint not null references public.proveedores(id),
  proveedor_nombre text not null,
  proveedor_rif text not null,
  proveedor_email text,
  proveedor_direccion text,
  proveedor_telefono text,
  orden_id bigint references public.compras_ordenes(id),
  orden_legado_id bigint references public.ordenes_compra(id),
  orden_numero text,
  factura_numero text not null check (btrim(factura_numero) <> ''),
  factura_control text,
  factura_fecha date not null,
  moneda text not null check (moneda in ('USD', 'VES')),
  tasa numeric(20,10) not null check (tasa > 0),
  total_factura numeric(20,2) not null check (total_factura > 0),
  monto_sin_derecho_credito_iva numeric(20,2) not null check (monto_sin_derecho_credito_iva >= 0),
  monto_exento numeric(20,2) not null check (monto_exento >= 0),
  base_imponible numeric(20,2) not null check (base_imponible >= 0),
  alicuota_pct numeric(10,6) not null check (alicuota_pct between 0 and 100),
  impuesto_causado numeric(20,2) not null check (impuesto_causado >= 0),
  monto_retenido numeric(20,2) not null check (monto_retenido > 0 and monto_retenido <= total_factura),
  monto_retenido_bs numeric generated always as
    (case when moneda = 'VES' then monto_retenido else round(monto_retenido * tasa, 2) end) stored,
  monto_retenido_usd numeric generated always as
    (case when moneda = 'USD' then monto_retenido else round(monto_retenido / tasa, 2) end) stored,
  origen_retencion text not null check (origen_retencion in ('PAGO', 'POST_PAGO')),
  estado_reintegro text not null check (estado_reintegro in ('NO_APLICA', 'PENDIENTE', 'REINTEGRADO', 'ANULADO')),
  reintegro_monto numeric(14,2),
  reintegro_fecha date,
  reintegro_cuenta_id bigint references public.cuentas_tesoreria(id),
  reintegro_cuenta_nombre text,
  reintegro_referencia text,
  reintegro_movimiento_id bigint unique references public.tesoreria_movimientos(id),
  observacion text,
  motivo_anulacion text,
  anulado_por uuid references auth.users(id),
  anulado_por_nombre text,
  anulado_en timestamptz,
  creado_en timestamptz not null default now(),
  creado_por uuid not null references auth.users(id),
  creado_por_nombre text
);

create unique index retenciones_factura_impuesto_vigente
  on public.retenciones_fiscales (proveedor_id, upper(factura_numero), tipo_impuesto)
  where estado <> 'ANULADA';
create index retenciones_fiscales_orden_idx on public.retenciones_fiscales (orden_id, tipo_impuesto)
  where estado <> 'ANULADA' and orden_id is not null;
create index retenciones_periodo_idx on public.retenciones_fiscales (periodo, tipo_impuesto, id desc);

create table private.retenciones_correlativos (
  periodo text primary key,
  ultimo integer not null check (ultimo between 1 and 99999999)
);

alter table public.retenciones_fiscales enable row level security;
create policy retenciones_lectura on public.retenciones_fiscales for select to authenticated
  using ((select private.tiene_permiso('COMPRAS', 'LECTURA')));

create trigger trg_auditar after insert or update or delete on public.retenciones_fiscales
  for each row execute function private.auditar('id');

-- En bases con el libro previo, conservar sus filas y las columnas públicas.
-- Los nuevos IDs empiezan después del rango del hash de 32 bits del libro previo.
do $$
declare
  v_anterior text := pg_get_viewdef(to_regclass('public.v_retenciones'), true);
  v_nueva text := $vista$
    select id, numero_comprobante, periodo, fecha_emision, fecha_entrega, tipo_impuesto, estado,
           proveedor_id, proveedor_nombre, proveedor_rif, proveedor_email, proveedor_direccion, proveedor_telefono,
           orden_id, orden_numero, factura_numero, factura_control, factura_fecha, moneda, tasa, total_factura,
           monto_sin_derecho_credito_iva, monto_exento, base_imponible, alicuota_pct, impuesto_causado, monto_retenido,
           monto_retenido_bs, monto_retenido_usd, null::text as concepto_islr_codigo, null::text as concepto_islr_nombre,
           origen_retencion, estado_reintegro, reintegro_monto, reintegro_fecha, reintegro_cuenta_id,
           reintegro_cuenta_nombre, reintegro_referencia, observacion, motivo_anulacion, anulado_por_nombre,
           anulado_en, creado_en, creado_por_nombre, orden_legado_id
      from public.retenciones_fiscales
  $vista$;
begin
  if v_anterior is not null then
    v_nueva := v_nueva || ' union all select anterior.*, null::bigint from ('
      || rtrim(v_anterior, E';\n\r ') || ') anterior where (select private.tiene_permiso(''COMPRAS'', ''LECTURA''))';
  end if;
  execute 'create or replace view public.v_retenciones with (security_invoker = true) as ' || v_nueva;
end;
$$;

revoke all on public.retenciones_fiscales, public.v_retenciones, private.retenciones_correlativos
  from public, anon, authenticated;
grant select on public.retenciones_fiscales, public.v_retenciones to authenticated;

create function public.retenciones_facturas_pendientes()
returns table (
  orden_id bigint, orden_numero text, proveedor_id bigint, proveedor_nombre text,
  proveedor_rif text, proveedor_email text, proveedor_telefono text,
  moneda text, tasa numeric, total numeric, base_imponible numeric, iva numeric,
  estado_orden text, ya_pagada boolean, impuestos_pendientes text[], impuestos_descontados text[]
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();
  if not private.tiene_permiso('COMPRAS', 'LECTURA') then
    raise exception 'No tienes permiso para consultar las retenciones.' using errcode = '42501';
  end if;

  return query
    select o.id, o.oc_codigo, p.id, p.nombre, p.rif, p.correo, p.telefono,
           o.moneda, o.retenciones_tasa, b.o_total, b.o_base, b.o_iva,
           o.estado, o.pagada_en is not null, pendientes.tipos,
           array(select r ->> 'tipo' from jsonb_array_elements(o.retenciones) r
                 where coalesce((r ->> 'monto')::numeric, 0) > 0)
      from public.compras_ordenes o
      join public.proveedores p on p.id = o.proveedor_id
      cross join lateral private.compras_bases_pago(o) b
      cross join lateral (
        select array_agg(t.tipo order by t.posicion) as tipos
          from unnest(array['IVA', 'ISLR', 'ISAE']) with ordinality t(tipo, posicion)
         where (t.tipo <> 'IVA' or b.o_iva > 0)
           and not exists (
             select 1 from public.retenciones_fiscales r
              where r.orden_id = o.id and r.tipo_impuesto = t.tipo and r.estado <> 'ANULADA'
           )
      ) pendientes
     where coalesce(o.factura_tipo, o.comprobante_tipo) = 'factura'
       and o.oc_codigo is not null
       and o.estado not in ('cancelada', 'anulada', 'desistida_proveedor')
       and pendientes.tipos is not null
     order by o.id desc;
end;
$$;

create or replace function public.retenciones_registrar_practicada(p_datos jsonb)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_d public.retenciones_fiscales := jsonb_populate_record(null::public.retenciones_fiscales, p_datos);
  v_o public.compras_ordenes;
  v_l public.ordenes_compra;
  v_p public.proveedores;
  v_pagada boolean := coalesce((p_datos ->> 'ya_pagada')::boolean, false);
  v_ultimo integer;
begin
  perform private.exigir_usuario_activo();
  if not private.compras_gestiona() then
    raise exception 'Se requiere control total de Compras para emitir retenciones.' using errcode = '42501';
  end if;

  if v_d.orden_id is not null and v_d.orden_legado_id is not null then
    raise exception 'Indica una sola orden de compra.' using errcode = '22023';
  elsif v_d.orden_id is not null then
    select * into v_o from public.compras_ordenes where id = v_d.orden_id for update;
    if v_o.oc_codigo is null or v_o.proveedor_id is null
       or coalesce(v_o.factura_tipo, v_o.comprobante_tipo) is distinct from 'factura'
       or v_o.estado in ('cancelada', 'anulada', 'desistida_proveedor') then
      raise exception 'La orden vigente debe tener proveedor y factura.' using errcode = '22023';
    end if;
    v_d.proveedor_id := v_o.proveedor_id;
    v_d.orden_numero := v_o.oc_codigo;
    -- Un pago que ya descontó el impuesto no genera una cuenta por cobrar.
    v_pagada := v_o.pagada_en is not null and not exists (
      select 1 from jsonb_array_elements(v_o.retenciones) r
       where r ->> 'tipo' = v_d.tipo_impuesto and coalesce((r ->> 'monto')::numeric, 0) > 0
    );
  elsif v_d.orden_legado_id is not null then
    select * into v_l from public.ordenes_compra where id = v_d.orden_legado_id for update;
    if v_l.comprobante_tipo is distinct from 'FACTURA' or v_l.proveedor_id is null
       or v_l.estado in ('CANCELADA', 'ANULADA') then
      raise exception 'La orden histórica vigente debe tener proveedor y factura.' using errcode = '22023';
    end if;
    v_d.proveedor_id := v_l.proveedor_id;
    v_d.orden_numero := v_l.numero;
    v_pagada := v_l.pagada_en is not null;
  end if;

  select * into v_p from public.proveedores where id = v_d.proveedor_id;
  if not found or v_d.fecha_emision is null or v_d.factura_fecha is null then
    raise exception 'Selecciona un proveedor e indica las fechas de factura y emisión.' using errcode = '22023';
  end if;

  v_d.periodo := to_char(v_d.fecha_emision, 'YYYYMM');
  insert into private.retenciones_correlativos as c (periodo, ultimo)
    values (v_d.periodo, 1)
    on conflict (periodo) do update set ultimo = c.ultimo + 1
    returning ultimo into v_ultimo;

  insert into public.retenciones_fiscales (
    numero_comprobante, periodo, fecha_emision, fecha_entrega, tipo_impuesto,
    proveedor_id, proveedor_nombre, proveedor_rif, proveedor_email, proveedor_direccion, proveedor_telefono,
    orden_id, orden_legado_id, orden_numero, factura_numero, factura_control, factura_fecha,
    moneda, tasa, total_factura, monto_sin_derecho_credito_iva, monto_exento, base_imponible,
    alicuota_pct, impuesto_causado, monto_retenido, origen_retencion, estado_reintegro,
    reintegro_monto, observacion, creado_por, creado_por_nombre
  ) values (
    v_d.periodo || lpad(v_ultimo::text, 8, '0'), v_d.periodo, v_d.fecha_emision, v_d.fecha_entrega, v_d.tipo_impuesto,
    v_p.id, v_p.nombre, v_p.rif, coalesce(nullif(btrim(v_d.proveedor_email), ''), v_p.correo),
    coalesce(nullif(btrim(v_d.proveedor_direccion), ''), v_p.direccion),
    coalesce(nullif(btrim(v_d.proveedor_telefono), ''), v_p.telefono),
    v_d.orden_id, v_d.orden_legado_id, v_d.orden_numero, btrim(v_d.factura_numero),
    nullif(btrim(v_d.factura_control), ''), v_d.factura_fecha,
    case when upper(v_d.moneda) = 'BS' then 'VES' else upper(v_d.moneda) end,
    v_d.tasa, v_d.total_factura, coalesce(v_d.monto_sin_derecho_credito_iva, 0),
    coalesce(v_d.monto_exento, 0), v_d.base_imponible, v_d.alicuota_pct, v_d.impuesto_causado, v_d.monto_retenido,
    case when v_pagada then 'POST_PAGO' else 'PAGO' end,
    case when v_pagada then 'PENDIENTE' else 'NO_APLICA' end,
    case when v_pagada then v_d.monto_retenido end, nullif(btrim(v_d.observacion), ''),
    auth.uid(), private.compras_mi_nombre()
  ) returning id into v_d.id;
  return v_d.id;
exception when unique_violation then
  raise exception 'Ya existe una retención vigente de ese impuesto para esta factura.' using errcode = '23505';
end;
$$;

create or replace function public.retenciones_registrar_reintegro(
  p_retencion_id bigint, p_cuenta_id bigint, p_monto numeric, p_fecha date,
  p_referencia text, p_nota text default null
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_r public.retenciones_fiscales;
  v_c public.cuentas_tesoreria;
  v_movimiento bigint;
begin
  perform private.exigir_usuario_activo();
  if not private.compras_gestiona() then
    raise exception 'Se requiere control total de Compras para registrar reintegros.' using errcode = '42501';
  end if;

  select * into v_r from public.retenciones_fiscales where id = p_retencion_id for update;
  if not found or v_r.estado = 'ANULADA' or v_r.estado_reintegro <> 'PENDIENTE' then
    raise exception 'La retención no tiene un reintegro pendiente.' using errcode = '55000';
  end if;
  if p_monto is distinct from v_r.reintegro_monto or p_fecha is null
     or nullif(btrim(p_referencia), '') is null then
    raise exception 'Indica el monto completo pendiente, la fecha y la referencia del reintegro.' using errcode = '22023';
  end if;
  select * into v_c from public.cuentas_tesoreria where id = p_cuenta_id and activa for share;
  if not found or v_c.moneda <> v_r.moneda then
    raise exception 'Selecciona una cuenta activa en la moneda de la retención.' using errcode = '22023';
  end if;

  v_movimiento := private.registrar_movimiento_tesoreria(
    v_c.id, 'INGRESO', 1, p_monto, 'Reintegro de retención ' || v_r.numero_comprobante,
    p_fecha, p_referencia, v_r.proveedor_nombre, null, v_r.orden_legado_id, null, p_nota
  );
  update public.retenciones_fiscales
     set estado_reintegro = 'REINTEGRADO', reintegro_fecha = p_fecha,
         reintegro_cuenta_id = v_c.id, reintegro_cuenta_nombre = v_c.nombre,
         reintegro_referencia = btrim(p_referencia), reintegro_movimiento_id = v_movimiento
   where id = v_r.id;
  return true;
end;
$$;

create or replace function public.retenciones_anular(p_id bigint, p_motivo text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();
  if not private.compras_gestiona() then
    raise exception 'Se requiere control total de Compras para anular retenciones.' using errcode = '42501';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Indica el motivo de la anulación.' using errcode = '22023';
  end if;

  update public.retenciones_fiscales
     set estado = 'ANULADA', motivo_anulacion = btrim(p_motivo), anulado_en = now(),
         anulado_por = auth.uid(), anulado_por_nombre = private.compras_mi_nombre(),
         estado_reintegro = case when estado_reintegro = 'PENDIENTE' then 'ANULADO' else estado_reintegro end
   where id = p_id and estado = 'REGISTRADA' and estado_reintegro <> 'REINTEGRADO';
  if not found then
    raise exception 'Solo se pueden anular retenciones registradas sin un reintegro asentado.' using errcode = '55000';
  end if;
  return true;
end;
$$;

revoke all on function public.retenciones_facturas_pendientes(), public.retenciones_registrar_practicada(jsonb),
  public.retenciones_registrar_reintegro(bigint, bigint, numeric, date, text, text),
  public.retenciones_anular(bigint, text) from public, anon, authenticated;
grant execute on function public.retenciones_facturas_pendientes(), public.retenciones_registrar_practicada(jsonb),
  public.retenciones_registrar_reintegro(bigint, bigint, numeric, date, text, text),
  public.retenciones_anular(bigint, text) to authenticated;
