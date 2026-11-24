-- ============================================================================
-- PROVIDENCIA ADMINISTRATIVA SNAT/2026/00093
-- Gaceta Oficial N° 43.484 del 21/10/2026 · vigente desde el 19/04/2027.
--
-- Decisiones de la empresa (23/11/2026):
--   1. Medio de emisión: PORTAL / APLICATIVO DEL SENIAT (Art. 4, num. 1.1).
--      El sistema arma la factura; se emite en el portal y aquí se registra el
--      número de factura y de control que asignó el SENIAT, con su PDF.
--   2. Agente de retención: por confirmar. El comprobante de retención (Art.
--      18) queda detrás de una casilla de la ficha de la empresa, apagada.
--   3. Las notas de entrega pasan a llamarse NOTAS DE DESPACHO (Arts. 14-16).
--      Solo cambia el nombre que se ve: tablas y rutas se quedan como están.
--
-- Lo que agrega esta migración:
--   a. Ficha de la empresa: agente de retención, fecha de la providencia de la
--      imprenta y desde cuándo rige la Providencia.
--   b. `emisiones_seniat`: la emisión en el portal (o en contingencia) de cada
--      factura, nota de crédito y nota de débito, con bucket para el PDF.
--   c. `notas_debito` (Arts. 12-13), con su correlativo y control.
--   d. `comprobantes_retencion` con numeración AAAAMMSSSSSSSS (Art. 18.1).
--   e. El libro de ventas usa el número del SENIAT cuando existe e incluye las
--      notas de débito.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- a. Ficha de la empresa
-- ---------------------------------------------------------------------------
alter table public.empresa
  add column if not exists agente_retencion           boolean not null default false,
  add column if not exists imprenta_providencia_fecha date,
  add column if not exists providencia_vigente_desde  date not null default date '2027-04-19';

comment on column public.empresa.agente_retencion is
  'Si la empresa es agente de retención (contribuyente especial). Enciende el comprobante de retención del Art. 18 de la Providencia SNAT/2026/00093.';
comment on column public.empresa.imprenta_providencia_fecha is
  'Fecha de la providencia de autorización de la imprenta (Arts. 9.3 y 11.4).';
comment on column public.empresa.providencia_vigente_desde is
  'Desde cuándo rige la Providencia SNAT/2026/00093. Por ley, el 19/04/2027.';

create or replace function public.guardar_config_fiscal(
  p_agente_retencion           boolean,
  p_imprenta_providencia_fecha date default null,
  p_providencia_vigente_desde  date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_rol('ADMIN', 'GERENTE_GENERAL');

  update public.empresa
     set agente_retencion           = coalesce(p_agente_retencion, false),
         imprenta_providencia_fecha = p_imprenta_providencia_fecha,
         providencia_vigente_desde  = coalesce(p_providencia_vigente_desde, date '2027-04-19')
   where id = 1;
end;
$$;

revoke execute on function public.guardar_config_fiscal(boolean, date, date) from public, anon;
grant  execute on function public.guardar_config_fiscal(boolean, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- c. Notas de débito (va antes que las emisiones porque estas la nombran)
-- ---------------------------------------------------------------------------
create table if not exists public.notas_debito (
  id               bigint generated always as identity primary key,
  numero           text not null unique,
  -- Misma serie de control que facturas y notas de crédito.
  numero_control   text not null unique,
  factura_id       bigint not null references public.facturas_venta(id),
  cliente_id       bigint not null references public.clientes(id),
  fecha            date not null default current_date,
  motivo           text not null,
  -- Copiadas de la factura que se ajusta.
  moneda           char(3) not null references public.monedas(codigo),
  tasa             numeric(20,10) not null check (tasa > 0),
  tasa_usd         numeric(20,10) not null check (tasa_usd > 0),
  alicuota_iva     numeric(5,2) not null default 16 check (alicuota_iva >= 0 and alicuota_iva <= 100),
  -- [{ "descripcion": "...", "monto": 10.5, "exento_iva": false }]
  renglones        jsonb not null default '[]'::jsonb,
  exento           numeric(20,2) not null default 0,
  base_imponible   numeric(20,2) not null default 0,
  iva              numeric(20,2) not null default 0,
  total            numeric(20,2) not null default 0,
  total_bs         numeric(20,2) generated always as (round(total * tasa, 2)) stored,
  total_usd        numeric(20,2) generated always as (round(total * tasa / tasa_usd, 2)) stored,
  estado           text not null default 'EMITIDA' check (estado in ('EMITIDA', 'ANULADA')),
  motivo_anulacion text,
  anulada_por      uuid references auth.users(id),
  anulada_en       timestamptz,
  emitida_por      uuid references auth.users(id),
  emitida_en       timestamptz not null default now(),
  constraint notas_debito_total_cuadra check (total = round(exento + base_imponible + iva, 2))
);

create index if not exists notas_debito_factura_idx on public.notas_debito (factura_id);
create index if not exists notas_debito_fecha_idx   on public.notas_debito (fecha desc);

alter table public.notas_debito enable row level security;
revoke insert, update, delete on public.notas_debito from anon, authenticated;
grant select on public.notas_debito to authenticated;

drop policy if exists notas_debito_lectura on public.notas_debito;
create policy notas_debito_lectura on public.notas_debito
  for select to authenticated
  using (private.tiene_permiso('FACTURACION', 'LECTURA') or private.tiene_permiso('VENTAS', 'LECTURA'));

create or replace function public.emitir_nota_debito(
  p_factura_id bigint,
  p_motivo     text,
  p_renglones  jsonb,
  p_fecha      date default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fac    record;
  v_fecha  date := coalesce(p_fecha, (now() at time zone 'America/Caracas')::date);
  v_item   jsonb;
  v_monto  numeric;
  v_exento numeric := 0;
  v_base   numeric := 0;
  v_iva    numeric;
  v_limpio jsonb := '[]'::jsonb;
  v_id     bigint;
begin
  perform private.exigir_permiso('FACTURACION', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 6 then
    raise exception 'Escribe por qué se emite la nota de débito (recargo, diferencia de precio o de cambio…).'
      using errcode = '22023';
  end if;

  if coalesce(jsonb_array_length(p_renglones), 0) = 0 then
    raise exception 'La nota de débito necesita al menos un concepto con su monto.' using errcode = '22023';
  end if;

  select * into v_fac from public.facturas_venta where id = p_factura_id for update;
  if v_fac.id is null then
    raise exception 'No existe la factura %.', p_factura_id using errcode = 'P0002';
  end if;
  if v_fac.estado = 'ANULADA' then
    raise exception 'La factura % está anulada: no se le puede emitir nota de débito.', v_fac.numero
      using errcode = '55000';
  end if;
  if v_fecha < v_fac.fecha then
    raise exception 'La nota de débito no puede ser anterior a la factura que ajusta (%).',
      to_char(v_fac.fecha, 'DD/MM/YYYY') using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_monto := round(coalesce((v_item->>'monto')::numeric, 0), 2);
    if v_monto <= 0 then
      raise exception 'Cada concepto de la nota de débito necesita un monto mayor que cero.' using errcode = '22023';
    end if;
    if length(trim(coalesce(v_item->>'descripcion', ''))) < 3 then
      raise exception 'Cada concepto de la nota de débito necesita su descripción.' using errcode = '22023';
    end if;
    if coalesce((v_item->>'exento_iva')::boolean, false) then
      v_exento := v_exento + v_monto;
    else
      v_base := v_base + v_monto;
    end if;
    v_limpio := v_limpio || jsonb_build_array(jsonb_build_object(
      'descripcion', trim(v_item->>'descripcion'),
      'monto', v_monto,
      'exento_iva', coalesce((v_item->>'exento_iva')::boolean, false)));
  end loop;

  v_iva := round(v_base * v_fac.alicuota_iva / 100, 2);

  insert into public.notas_debito
    (numero, numero_control, factura_id, cliente_id, fecha, motivo, moneda, tasa, tasa_usd,
     alicuota_iva, renglones, exento, base_imponible, iva, total, emitida_por)
  values
    (private.siguiente_numero('NDB'), private.siguiente_control(), v_fac.id, v_fac.cliente_id,
     v_fecha, trim(p_motivo), v_fac.moneda, v_fac.tasa, v_fac.tasa_usd, v_fac.alicuota_iva,
     v_limpio, round(v_exento, 2), round(v_base, 2), v_iva, round(v_exento + v_base + v_iva, 2),
     (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.emitir_nota_debito(bigint, text, jsonb, date) from public, anon;
grant  execute on function public.emitir_nota_debito(bigint, text, jsonb, date) to authenticated;

create or replace function public.anular_nota_debito(p_id bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_permiso('FACTURACION', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se anula la nota de débito.' using errcode = '22023';
  end if;

  update public.notas_debito
     set estado = 'ANULADA',
         motivo_anulacion = trim(p_motivo),
         anulada_por = (select auth.uid()),
         anulada_en = now()
   where id = p_id and estado = 'EMITIDA';

  if not found then
    raise exception 'La nota de débito no existe o ya está anulada.' using errcode = '55000';
  end if;
end;
$$;

revoke execute on function public.anular_nota_debito(bigint, text) from public, anon;
grant  execute on function public.anular_nota_debito(bigint, text) to authenticated;

create or replace view public.v_notas_debito
with (security_invoker = on) as
select nd.*,
       cl.nombre         as cliente,
       cl.rif            as cliente_rif,
       cl.direccion      as cliente_direccion,
       f.numero          as factura_numero,
       f.numero_control  as factura_control,
       f.fecha           as factura_fecha,
       f.total           as factura_total
  from public.notas_debito nd
  join public.clientes cl on cl.id = nd.cliente_id
  join public.facturas_venta f on f.id = nd.factura_id;

grant select on public.v_notas_debito to authenticated;

-- ---------------------------------------------------------------------------
-- b. Emisión en el Portal SENIAT (o en contingencia)
-- ---------------------------------------------------------------------------
create table if not exists public.emisiones_seniat (
  id                       bigint generated always as identity primary key,
  documento                text not null check (documento in ('FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO')),
  documento_id             bigint not null,
  medio                    text not null default 'PORTAL_SENIAT'
                           check (medio in ('PORTAL_SENIAT', 'CONTINGENCIA')),
  numero                   text not null,
  numero_control           text not null,
  emitida_en               timestamptz not null,
  archivo_path             text,
  archivo_nombre           text,
  -- Art. 7: lo emitido en contingencia se remite en PDF al día siguiente.
  contingencia_enviada_en  timestamptz,
  registrado_por           uuid references auth.users(id),
  registrado_en            timestamptz not null default now(),
  constraint emisiones_seniat_unica unique (documento, documento_id)
);

create index if not exists emisiones_seniat_pendientes_idx
  on public.emisiones_seniat (medio, contingencia_enviada_en);

alter table public.emisiones_seniat enable row level security;
revoke insert, update, delete on public.emisiones_seniat from anon, authenticated;
grant select on public.emisiones_seniat to authenticated;

drop policy if exists emisiones_seniat_lectura on public.emisiones_seniat;
create policy emisiones_seniat_lectura on public.emisiones_seniat
  for select to authenticated
  using (private.tiene_permiso('FACTURACION', 'LECTURA') or private.tiene_permiso('VENTAS', 'LECTURA'));

create or replace function public.registrar_emision_seniat(
  p_documento      text,
  p_documento_id   bigint,
  p_medio          text,
  p_numero         text,
  p_numero_control text,
  p_emitida_en     timestamptz,
  p_archivo_path   text default null,
  p_archivo_nombre text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');

  if p_documento not in ('FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO') then
    raise exception 'Documento no válido: %.', p_documento using errcode = '22023';
  end if;
  if p_medio not in ('PORTAL_SENIAT', 'CONTINGENCIA') then
    raise exception 'Medio de emisión no válido: %.', p_medio using errcode = '22023';
  end if;
  if length(trim(coalesce(p_numero, ''))) = 0 then
    raise exception 'Falta el número del documento que asignó el SENIAT.' using errcode = '22023';
  end if;
  if trim(coalesce(p_numero_control, '')) !~ '^[0-9]{2}-?[0-9]{1,8}$' then
    raise exception 'El número de control «%» no tiene la forma del Art. 9: dos dígitos y hasta ocho (00-00000001).',
      p_numero_control using errcode = '22023';
  end if;
  if p_emitida_en is null then
    raise exception 'Falta la fecha y hora de emisión.' using errcode = '22023';
  end if;

  if p_documento = 'FACTURA' and not exists (select 1 from public.facturas_venta where id = p_documento_id) then
    raise exception 'No existe la factura %.', p_documento_id using errcode = 'P0002';
  elsif p_documento = 'NOTA_CREDITO' and not exists (select 1 from public.notas_credito where id = p_documento_id) then
    raise exception 'No existe la nota de crédito %.', p_documento_id using errcode = 'P0002';
  elsif p_documento = 'NOTA_DEBITO' and not exists (select 1 from public.notas_debito where id = p_documento_id) then
    raise exception 'No existe la nota de débito %.', p_documento_id using errcode = 'P0002';
  end if;

  insert into public.emisiones_seniat
    (documento, documento_id, medio, numero, numero_control, emitida_en,
     archivo_path, archivo_nombre, registrado_por)
  values
    (p_documento, p_documento_id, p_medio, trim(p_numero), trim(p_numero_control), p_emitida_en,
     nullif(trim(coalesce(p_archivo_path, '')), ''), nullif(trim(coalesce(p_archivo_nombre, '')), ''),
     (select auth.uid()))
  on conflict (documento, documento_id) do update
    set medio          = excluded.medio,
        numero         = excluded.numero,
        numero_control = excluded.numero_control,
        emitida_en     = excluded.emitida_en,
        archivo_path   = coalesce(excluded.archivo_path, public.emisiones_seniat.archivo_path),
        archivo_nombre = coalesce(excluded.archivo_nombre, public.emisiones_seniat.archivo_nombre),
        registrado_por = excluded.registrado_por,
        registrado_en  = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.registrar_emision_seniat(text, bigint, text, text, text, timestamptz, text, text) from public, anon;
grant  execute on function public.registrar_emision_seniat(text, bigint, text, text, text, timestamptz, text, text) to authenticated;

create or replace function public.marcar_contingencia_enviada(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');

  update public.emisiones_seniat
     set contingencia_enviada_en = now()
   where id = p_id and medio = 'CONTINGENCIA';

  if not found then
    raise exception 'No hay una emisión de contingencia con ese número.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.marcar_contingencia_enviada(bigint) from public, anon;
grant  execute on function public.marcar_contingencia_enviada(bigint) to authenticated;

-- El PDF que entrega el portal (o el escaneo del talonario de contingencia).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos-seniat', 'documentos-seniat', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'documentos_seniat_lectura') then
    create policy documentos_seniat_lectura on storage.objects
      for select to authenticated
      using (bucket_id = 'documentos-seniat'
             and (private.tiene_permiso('FACTURACION', 'LECTURA') or private.tiene_permiso('VENTAS', 'LECTURA')));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'documentos_seniat_escritura') then
    create policy documentos_seniat_escritura on storage.objects
      for insert to authenticated
      with check (bucket_id = 'documentos-seniat' and private.tiene_permiso('FACTURACION', 'ESCRITURA'));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'documentos_seniat_reemplazo') then
    create policy documentos_seniat_reemplazo on storage.objects
      for update to authenticated
      using (bucket_id = 'documentos-seniat' and private.tiene_permiso('FACTURACION', 'ESCRITURA'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- d. Comprobantes de retención (Art. 18)
-- ---------------------------------------------------------------------------
create table if not exists public.comprobantes_retencion (
  id                 bigint generated always as identity primary key,
  -- AAAAMMSSSSSSSS: año y mes de emisión + secuencial continuo de 8 dígitos.
  numero             char(14) not null unique,
  tipo               text not null check (tipo in ('IVA', 'ISLR')),
  factura_compra_id  bigint not null references public.facturas_compra(id),
  periodo            char(6) not null,
  fecha_emision      date not null,
  monto_retenido     numeric(20,2) not null check (monto_retenido > 0),
  emitido_por        uuid references auth.users(id),
  emitido_en         timestamptz not null default now(),
  constraint comprobantes_retencion_unico unique (factura_compra_id, tipo)
);

alter table public.comprobantes_retencion enable row level security;
revoke insert, update, delete on public.comprobantes_retencion from anon, authenticated;
grant select on public.comprobantes_retencion to authenticated;

drop policy if exists comprobantes_retencion_lectura on public.comprobantes_retencion;
create policy comprobantes_retencion_lectura on public.comprobantes_retencion
  for select to authenticated using (private.tiene_permiso('COMPRAS', 'LECTURA'));

create or replace function public.emitir_comprobante_retencion(
  p_factura_compra_id bigint,
  p_tipo              text,
  p_fecha             date default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fac     record;
  v_fecha   date := coalesce(p_fecha, (now() at time zone 'America/Caracas')::date);
  v_monto   numeric;
  v_ultimo  integer;
  v_numero  text;
begin
  perform private.exigir_permiso('COMPRAS', 'ESCRITURA');

  if not coalesce((select agente_retencion from public.empresa where id = 1), false) then
    raise exception 'La empresa no está marcada como agente de retención (Configuración › Empresa).'
      using errcode = '55000';
  end if;

  if p_tipo not in ('IVA', 'ISLR') then
    raise exception 'Tipo de retención no válido: %.', p_tipo using errcode = '22023';
  end if;

  -- Si ya existe, se devuelve el mismo: un comprobante no se numera dos veces.
  select numero into v_numero from public.comprobantes_retencion
   where factura_compra_id = p_factura_compra_id and tipo = p_tipo;
  if v_numero is not null then
    return v_numero;
  end if;

  select * into v_fac from public.facturas_compra where id = p_factura_compra_id for update;
  if v_fac.id is null then
    raise exception 'No existe la factura del proveedor %.', p_factura_compra_id using errcode = 'P0002';
  end if;
  if v_fac.estado = 'ANULADA' then
    raise exception 'La factura del proveedor está anulada.' using errcode = '55000';
  end if;

  v_monto := case when p_tipo = 'IVA' then v_fac.retencion_iva else v_fac.retencion_islr end;
  if coalesce(v_monto, 0) <= 0 then
    raise exception 'La factura no tiene retención de % registrada.', p_tipo using errcode = '22023';
  end if;

  insert into public.correlativos (prefijo, anio, ultimo)
  values ('CRET-' || p_tipo, 0, 1)
  on conflict (prefijo, anio) do update set ultimo = public.correlativos.ultimo + 1
  returning ultimo into v_ultimo;

  -- Art. 18.1: el secuencial se reinicia si supera los ocho dígitos.
  v_numero := to_char(v_fecha, 'YYYYMM') || lpad(((v_ultimo - 1) % 100000000 + 1)::text, 8, '0');

  insert into public.comprobantes_retencion
    (numero, tipo, factura_compra_id, periodo, fecha_emision, monto_retenido, emitido_por)
  values
    (v_numero, p_tipo, v_fac.id, to_char(v_fecha, 'YYYYMM'), v_fecha, v_monto, (select auth.uid()));

  return v_numero;
end;
$$;

revoke execute on function public.emitir_comprobante_retencion(bigint, text, date) from public, anon;
grant  execute on function public.emitir_comprobante_retencion(bigint, text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- e. Libro de ventas: número SENIAT cuando existe, y notas de débito
--
-- Las columnas existentes conservan nombre, tipo y orden (así lo exige
-- `create or replace view`); las nuevas van al final.
-- ---------------------------------------------------------------------------
create or replace view public.v_libro_ventas
with (security_invoker = on) as
select
  'FACTURA-' || f.id::text     as clave,
  f.id,
  'FACTURA'                    as documento,
  f.fecha,
  cl.rif                       as rif_cliente,
  cl.nombre                    as cliente,
  coalesce(es.numero, f.numero)                 as numero,
  coalesce(es.numero_control, f.numero_control) as numero_control,
  null::text                   as afecta_a,
  f.estado = 'ANULADA'         as anulada,
  f.moneda,
  f.tasa,
  f.alicuota_iva,
  case when f.estado = 'ANULADA' then 0
       else round(f.total - f.iva - f.base_imponible, 2) end as ventas_exentas,
  case when f.estado = 'ANULADA' then 0 else f.base_imponible end as base_imponible,
  case when f.estado = 'ANULADA' then 0 else f.iva            end as debito_fiscal,
  case when f.estado = 'ANULADA' then 0 else f.total          end as total_ventas,
  case when f.estado = 'ANULADA' then 0 else f.retencion_iva  end as iva_retenido,
  case when f.estado = 'ANULADA' then 0
       else round((f.total - f.iva - f.base_imponible) * f.tasa, 2) end as ventas_exentas_bs,
  case when f.estado = 'ANULADA' then 0 else round(f.base_imponible * f.tasa, 2) end as base_imponible_bs,
  case when f.estado = 'ANULADA' then 0 else round(f.iva           * f.tasa, 2) end as debito_fiscal_bs,
  case when f.estado = 'ANULADA' then 0 else round(f.total         * f.tasa, 2) end as total_ventas_bs,
  case when f.estado = 'ANULADA' then 0 else round(f.retencion_iva * f.tasa, 2) end as iva_retenido_bs,
  f.numero                     as numero_sistema,
  f.numero_control             as control_sistema,
  coalesce(es.medio, 'SISTEMA') as medio_emision
from public.facturas_venta f
join public.clientes cl on cl.id = f.cliente_id
left join public.emisiones_seniat es on es.documento = 'FACTURA' and es.documento_id = f.id
union all
select
  'NOTA-' || nc.id::text       as clave,
  nc.id,
  'NOTA_CREDITO'               as documento,
  nc.fecha,
  cl.rif                       as rif_cliente,
  cl.nombre                    as cliente,
  coalesce(es.numero, nc.numero)                 as numero,
  coalesce(es.numero_control, nc.numero_control) as numero_control,
  coalesce(esf.numero_control, f.numero_control) as afecta_a,
  nc.estado = 'ANULADA'        as anulada,
  nc.moneda,
  nc.tasa,
  nc.alicuota_iva,
  case when nc.estado = 'ANULADA' then 0
       else -round(nc.total - nc.iva - nc.base_imponible, 2) end as ventas_exentas,
  case when nc.estado = 'ANULADA' then 0 else -nc.base_imponible end as base_imponible,
  case when nc.estado = 'ANULADA' then 0 else -nc.iva            end as debito_fiscal,
  case when nc.estado = 'ANULADA' then 0 else -nc.total          end as total_ventas,
  0::numeric                   as iva_retenido,
  case when nc.estado = 'ANULADA' then 0
       else -round((nc.total - nc.iva - nc.base_imponible) * nc.tasa, 2) end as ventas_exentas_bs,
  case when nc.estado = 'ANULADA' then 0 else -round(nc.base_imponible * nc.tasa, 2) end as base_imponible_bs,
  case when nc.estado = 'ANULADA' then 0 else -round(nc.iva            * nc.tasa, 2) end as debito_fiscal_bs,
  case when nc.estado = 'ANULADA' then 0 else -round(nc.total          * nc.tasa, 2) end as total_ventas_bs,
  0::numeric                   as iva_retenido_bs,
  nc.numero                    as numero_sistema,
  nc.numero_control            as control_sistema,
  coalesce(es.medio, 'SISTEMA') as medio_emision
from public.notas_credito nc
join public.clientes cl on cl.id = nc.cliente_id
join public.facturas_venta f on f.id = nc.factura_id
left join public.emisiones_seniat es  on es.documento = 'NOTA_CREDITO' and es.documento_id = nc.id
left join public.emisiones_seniat esf on esf.documento = 'FACTURA' and esf.documento_id = f.id
union all
select
  'NDEB-' || nd.id::text       as clave,
  nd.id,
  'NOTA_DEBITO'                as documento,
  nd.fecha,
  cl.rif                       as rif_cliente,
  cl.nombre                    as cliente,
  coalesce(es.numero, nd.numero)                 as numero,
  coalesce(es.numero_control, nd.numero_control) as numero_control,
  coalesce(esf.numero_control, f.numero_control) as afecta_a,
  nd.estado = 'ANULADA'        as anulada,
  nd.moneda,
  nd.tasa,
  nd.alicuota_iva,
  case when nd.estado = 'ANULADA' then 0 else nd.exento          end as ventas_exentas,
  case when nd.estado = 'ANULADA' then 0 else nd.base_imponible  end as base_imponible,
  case when nd.estado = 'ANULADA' then 0 else nd.iva             end as debito_fiscal,
  case when nd.estado = 'ANULADA' then 0 else nd.total           end as total_ventas,
  0::numeric                   as iva_retenido,
  case when nd.estado = 'ANULADA' then 0 else round(nd.exento         * nd.tasa, 2) end as ventas_exentas_bs,
  case when nd.estado = 'ANULADA' then 0 else round(nd.base_imponible * nd.tasa, 2) end as base_imponible_bs,
  case when nd.estado = 'ANULADA' then 0 else round(nd.iva            * nd.tasa, 2) end as debito_fiscal_bs,
  case when nd.estado = 'ANULADA' then 0 else round(nd.total          * nd.tasa, 2) end as total_ventas_bs,
  0::numeric                   as iva_retenido_bs,
  nd.numero                    as numero_sistema,
  nd.numero_control            as control_sistema,
  coalesce(es.medio, 'SISTEMA') as medio_emision
from public.notas_debito nd
join public.clientes cl on cl.id = nd.cliente_id
join public.facturas_venta f on f.id = nd.factura_id
left join public.emisiones_seniat es  on es.documento = 'NOTA_DEBITO' and es.documento_id = nd.id
left join public.emisiones_seniat esf on esf.documento = 'FACTURA' and esf.documento_id = f.id;

grant select on public.v_libro_ventas to authenticated;

notify pgrst, 'reload schema';
