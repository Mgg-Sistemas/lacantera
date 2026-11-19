-- BANCO DEL TESORO (0163): PAGO MASIVO DE NÓMINA Y CARGA MASIVA DE CUENTAS (44 COLUMNAS)
--
-- 1. Campos opcionales en `public.empleados` para la plantilla oficial de apertura,
--    actualización y desincorporación de cuentas nómina del Banco del Tesoro:
--    correo, teléfono local, domicilio desglosado, vivienda y códigos de tablas
--    del banco (región, estado, ciudad, municipio/sector, parroquia, zona postal,
--    profesión, tipo de cargo, agencia bancaria y tipo de cuenta nómina).
--    Ninguno bloquea la creación rápida de una ficha.
--
-- 2. `public.guardar_datos_bancarios_empleado`: puerta dedicada para guardar estos
--    datos complementarios sin tocar la firma existente de `guardar_empleado`.
--
-- 3. `public.reservar_correlativos_banco_tesoro`: reserva atómica de correlativos
--    bancarios (`0163` + 6 dígitos secuenciales arrancando desde 1) respaldada en
--    `public.nomina_parametros` (`BT_CORRELATIVO_SIGUIENTE`).

alter table public.empleados
  add column if not exists correo text,
  add column if not exists telefono_local text,
  add column if not exists calle_avenida text,
  add column if not exists casa_edificio text,
  add column if not exists piso_nivel text,
  add column if not exists apto_local text,
  add column if not exists referencia_domicilio text,
  add column if not exists condicion_inmueble text,
  add column if not exists tipo_vivienda text,
  add column if not exists tiempo_residencia integer,
  add column if not exists bt_region text,
  add column if not exists bt_estado text,
  add column if not exists bt_ciudad text,
  add column if not exists bt_municipio text,
  add column if not exists bt_parroquia text,
  add column if not exists zona_postal text,
  add column if not exists bt_profesion text,
  add column if not exists bt_tipo_cargo text,
  add column if not exists bt_agencia text,
  add column if not exists bt_tipo_cuenta text;

comment on column public.empleados.correo is
  'Correo electrónico del trabajador (requerido en col. 30 de Carga Masiva Banco del Tesoro).';
comment on column public.empleados.telefono_local is
  'Teléfono fijo/local del trabajador (col. 26 de Carga Masiva Banco del Tesoro).';
comment on column public.empleados.bt_agencia is
  'Código de 4 dígitos de la agencia Banco del Tesoro asignada (vacío = automática más cercana a la dirección).';
comment on column public.empleados.bt_tipo_cuenta is
  'Tipo de cuenta en Carga Masiva Banco del Tesoro: VI01 (Cuenta Nómina) o CCVI (Cuenta Corriente Virtual).';

-- Sembrar el contador inicial del correlativo bancario en 1 sin pisar avances previos
insert into public.nomina_parametros
  (clave, valor, valor_texto, unidad, vigencia_desde, descripcion, fuente)
values
  ('BT_CORRELATIVO_SIGUIENTE', 1, null, 'FACTOR', date '2026-01-01',
   'Siguiente correlativo secuencial para lotes de Pago Masivo Banco del Tesoro (0163XXXXXX)',
   'Tesoro en Línea')
on conflict (clave, vigencia_desde) do nothing;

-- ───────────────────────────────────────────────────────────────────────────
-- Guardar datos complementarios de apertura bancaria de un trabajador
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.guardar_datos_bancarios_empleado(
  p_empleado_id bigint,
  p_correo text default null,
  p_telefono_local text default null,
  p_calle_avenida text default null,
  p_casa_edificio text default null,
  p_piso_nivel text default null,
  p_apto_local text default null,
  p_referencia_domicilio text default null,
  p_condicion_inmueble text default null,
  p_tipo_vivienda text default null,
  p_tiempo_residencia integer default null,
  p_bt_region text default null,
  p_bt_estado text default null,
  p_bt_ciudad text default null,
  p_bt_municipio text default null,
  p_bt_parroquia text default null,
  p_zona_postal text default null,
  p_bt_profesion text default null,
  p_bt_tipo_cargo text default null,
  p_bt_agencia text default null,
  p_bt_tipo_cuenta text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform private.exigir_rol('RRHH');

  if p_empleado_id is null then
    raise exception 'Falta indicar la ficha del trabajador.' using errcode = '22023';
  end if;

  update public.empleados set
    correo               = case when p_correo is null then correo else nullif(upper(btrim(p_correo)), '') end,
    telefono_local       = case when p_telefono_local is null then telefono_local else nullif(regexp_replace(p_telefono_local, '[^0-9]', '', 'g'), '') end,
    calle_avenida        = case when p_calle_avenida is null then calle_avenida else nullif(upper(btrim(p_calle_avenida)), '') end,
    casa_edificio        = case when p_casa_edificio is null then casa_edificio else nullif(upper(btrim(p_casa_edificio)), '') end,
    piso_nivel           = case when p_piso_nivel is null then piso_nivel else nullif(upper(btrim(p_piso_nivel)), '') end,
    apto_local           = case when p_apto_local is null then apto_local else nullif(upper(btrim(p_apto_local)), '') end,
    referencia_domicilio = case when p_referencia_domicilio is null then referencia_domicilio else nullif(upper(btrim(p_referencia_domicilio)), '') end,
    condicion_inmueble   = case when p_condicion_inmueble is null then condicion_inmueble else nullif(upper(btrim(p_condicion_inmueble)), '') end,
    tipo_vivienda        = case when p_tipo_vivienda is null then tipo_vivienda else nullif(upper(btrim(p_tipo_vivienda)), '') end,
    tiempo_residencia    = p_tiempo_residencia,
    bt_region            = case when p_bt_region is null then bt_region else nullif(upper(btrim(p_bt_region)), '') end,
    bt_estado            = case when p_bt_estado is null then bt_estado else nullif(upper(btrim(p_bt_estado)), '') end,
    bt_ciudad            = case when p_bt_ciudad is null then bt_ciudad else nullif(upper(btrim(p_bt_ciudad)), '') end,
    bt_municipio         = case when p_bt_municipio is null then bt_municipio else nullif(upper(btrim(p_bt_municipio)), '') end,
    bt_parroquia         = case when p_bt_parroquia is null then bt_parroquia else nullif(upper(btrim(p_bt_parroquia)), '') end,
    zona_postal          = case when p_zona_postal is null then zona_postal else nullif(regexp_replace(p_zona_postal, '[^0-9]', '', 'g'), '') end,
    bt_profesion         = case when p_bt_profesion is null then bt_profesion else nullif(upper(btrim(p_bt_profesion)), '') end,
    bt_tipo_cargo        = case when p_bt_tipo_cargo is null then bt_tipo_cargo else nullif(upper(btrim(p_bt_tipo_cargo)), '') end,
    bt_agencia           = case when p_bt_agencia is null then bt_agencia else nullif(upper(btrim(p_bt_agencia)), '') end,
    bt_tipo_cuenta       = case when p_bt_tipo_cuenta is null then bt_tipo_cuenta else nullif(upper(btrim(p_bt_tipo_cuenta)), '') end
  where id = p_empleado_id;
end;
$function$;

revoke execute on function public.guardar_datos_bancarios_empleado(
  bigint, text, text, text, text, text, text, text, text, text, integer,
  text, text, text, text, text, text, text, text, text, text
) from public, anon;

grant execute on function public.guardar_datos_bancarios_empleado(
  bigint, text, text, text, text, text, text, text, text, text, integer,
  text, text, text, text, text, text, text, text, text, text
) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- Reservar un bloque atómico de correlativos bancarios (0163XXXXXX)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.reservar_correlativos_banco_tesoro(
  p_cantidad integer,
  p_desde integer default null
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_inicio integer;
  v_nuevo  integer;
begin
  perform private.exigir_rol('RRHH');

  if coalesce(p_cantidad, 0) < 1 then
    raise exception 'La cantidad de correlativos a reservar debe ser mayor a cero.' using errcode = '22023';
  end if;

  insert into public.nomina_parametros
    (clave, valor, valor_texto, unidad, vigencia_desde, descripcion, fuente, registrado_por)
  values
    ('BT_CORRELATIVO_SIGUIENTE', greatest(coalesce(p_desde, 1), 1), null, 'FACTOR',
     date '2026-01-01',
     'Siguiente correlativo secuencial para lotes de Pago Masivo Banco del Tesoro (0163XXXXXX)',
     'Tesoro en Línea',
     (select auth.uid()))
  on conflict (clave, vigencia_desde) do nothing;

  select greatest(coalesce(p_desde, valor::integer, 1), 1)
    into v_inicio
    from public.nomina_parametros
   where clave = 'BT_CORRELATIVO_SIGUIENTE'
     and vigencia_desde = date '2026-01-01'
   for update;

  v_nuevo := v_inicio + p_cantidad;

  update public.nomina_parametros
     set valor = v_nuevo,
         registrado_por = (select auth.uid()),
         registrado_en = now()
   where clave = 'BT_CORRELATIVO_SIGUIENTE'
     and vigencia_desde = date '2026-01-01';

  return v_inicio;
end;
$function$;

revoke execute on function public.reservar_correlativos_banco_tesoro(integer, integer) from public, anon;
grant execute on function public.reservar_correlativos_banco_tesoro(integer, integer) to authenticated, service_role;
