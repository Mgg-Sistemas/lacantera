-- ============================================================================
-- La empresa y sus papeles
--
-- Hasta ahora la identidad de la empresa vivía en una constante del código
-- (src/lib/empresa.ts). Sirve para la portada, que se ve sin entrar y no puede
-- consultar nada. Pero el RIF vence, el domicilio fiscal cambia con una
-- mudanza y la condición ante el SENIAT se reforma: eso no puede necesitar un
-- despliegue para corregirse.
--
-- Y los papeles que lo demuestran —la alianza con la Gobernación, el
-- comprobante del RIF, el registro mercantil— tienen que estar donde se
-- consultan, no en el correo de alguien. Van a un almacén PRIVADO: son
-- documentos de la persona jurídica, y el sistema es de acceso controlado
-- justamente para eso.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Identidad fiscal
--
-- Una sola fila, y el check lo garantiza. Dos filas significarían dos empresas,
-- y entonces la pregunta "¿cuál es el RIF?" dejaría de tener una respuesta.
-- ---------------------------------------------------------------------------
create table if not exists public.empresa (
  id                smallint primary key default 1 check (id = 1),

  rif               text not null,
  razon_social      text not null,

  domicilio_fiscal  text,
  ciudad            text,
  estado            text,
  zona_postal       text,

  -- Del comprobante del SENIAT. El vencimiento es el que importa: un RIF
  -- vencido detiene una factura, y se entera uno el día que la detiene.
  inscrito_el       date,
  rif_actualizado_el date,
  rif_vence_el      date,
  gerencia_seniat   text,
  comprobante_rif   text,

  condicion_iva     text,
  retencion_iva_pct numeric(5,2) check (retencion_iva_pct is null
                                        or (retencion_iva_pct >= 0 and retencion_iva_pct <= 100)),

  telefono          text,
  correo            text,

  actualizado_por   uuid references auth.users(id),
  actualizado_en    timestamptz not null default now()
);

-- Los datos salen del comprobante 202508T0000069193226, no de la memoria de
-- nadie. Si mañana el registro dice otra cosa, se corrige desde la pantalla.
insert into public.empresa
  (id, rif, razon_social, domicilio_fiscal, ciudad, estado, zona_postal,
   inscrito_el, rif_actualizado_el, rif_vence_el, gerencia_seniat, comprobante_rif,
   condicion_iva, retencion_iva_pct)
values
  (1, 'J-50209170-0', 'MINERIA INTERNACIONAL TS, C.A.',
   'CALLE 8 CASA NRO 04, URB SANTA FE, PARROQUIA VISTA HERMOSA, MUNICIPIO ANGOSTURA DEL ORINOCO',
   'CIUDAD BOLIVAR', 'BOLIVAR', '8001',
   date '2022-03-31', date '2025-07-04', date '2028-07-04',
   'GERENCIA REGIONAL DE TRIBUTOS INTERNOS REGIÓN GUAYANA',
   '202508T0000069193226',
   'Contribuyente Ordinario del IVA', 75.00)
on conflict (id) do nothing;

alter table public.empresa enable row level security;

drop policy if exists empresa_lectura on public.empresa;
-- La lee cualquiera que haya entrado: el RIF y la razón social salen impresos
-- en todo lo que emite el sistema, y esconderlos no protege nada.
create policy empresa_lectura on public.empresa
  for select to authenticated using (true);

revoke insert, update, delete on public.empresa from authenticated;

-- ---------------------------------------------------------------------------
-- Tipos de documento
--
-- En tabla y no en un check para que se pueda añadir uno nuevo sin tocar el
-- código: aparecerá un papel que hoy no existe y no vale la pena un despliegue
-- para darle nombre.
-- ---------------------------------------------------------------------------
create table if not exists public.tipos_documento_legal (
  codigo   text primary key,
  nombre   text not null,
  -- Si caduca, la pantalla pide fecha de vencimiento y avisa cuando se acerca.
  caduca   boolean not null default false,
  orden    smallint not null default 100,
  activo   boolean not null default true
);

insert into public.tipos_documento_legal (codigo, nombre, caduca, orden) values
  ('ALIANZA_GOBERNACION', 'Alianza de la cantera – Gobernación', true,  10),
  ('RIF',                 'Registro Único de Información Fiscal (RIF)', true, 20),
  ('ACTA_CONSTITUTIVA',   'Acta constitutiva',                  false, 30),
  ('ACTA_ASAMBLEA',       'Acta de asamblea',                   false, 40),
  ('REGISTRO_MERCANTIL',  'Registro mercantil',                 false, 50),
  ('CONCESION_MINERA',    'Concesión minera',                   true,  60),
  ('PERMISO_AMBIENTAL',   'Permiso ambiental',                  true,  70),
  ('CONTRATO',            'Contrato',                           true,  80),
  ('SOLVENCIA',           'Solvencia',                          true,  90),
  ('PODER',               'Poder o autorización',               true, 100),
  ('OTRO',                'Otro documento',                     false, 900)
on conflict (codigo) do update set nombre = excluded.nombre,
                                   caduca = excluded.caduca,
                                   orden  = excluded.orden;

alter table public.tipos_documento_legal enable row level security;
drop policy if exists tipos_doc_lectura on public.tipos_documento_legal;
create policy tipos_doc_lectura on public.tipos_documento_legal
  for select to authenticated using (true);
revoke insert, update, delete on public.tipos_documento_legal from authenticated;

-- ---------------------------------------------------------------------------
-- Los documentos
-- ---------------------------------------------------------------------------
create table if not exists public.empresa_documentos (
  id           bigint generated always as identity primary key,
  tipo         text not null references public.tipos_documento_legal(codigo),
  nombre       text not null,

  -- Dónde quedó dentro del bucket privado. El archivo lo sube el navegador
  -- directo al almacén; aquí solo se anota, igual que con la foto del personal.
  archivo_path text not null unique,
  mime         text,
  bytes        bigint check (bytes is null or bytes > 0),

  emitido_el   date,
  vence_el     date,
  nota         text,

  subido_por   uuid references auth.users(id),
  subido_en    timestamptz not null default now(),

  constraint documento_vence_despues check (
    vence_el is null or emitido_el is null or vence_el >= emitido_el)
);

create index if not exists documentos_por_tipo_idx
  on public.empresa_documentos (tipo, subido_en desc);

alter table public.empresa_documentos enable row level security;

drop policy if exists documentos_lectura on public.empresa_documentos;
-- Quien puede ver la lista es quien puede abrir los archivos. Si no fueran los
-- mismos, la pantalla mostraría renglones que al pulsarlos no abren nada, y eso
-- se lee como una falla del sistema en vez de como una falta de permiso.
create policy documentos_lectura on public.empresa_documentos
  for select to authenticated
  using ((select public.mis_roles())
         && array['ADMIN', 'GERENTE_GENERAL', 'TESORERIA', 'RRHH']::text[]);

revoke insert, update, delete on public.empresa_documentos from authenticated;

-- ---------------------------------------------------------------------------
-- El almacén privado
--
-- 50 MB porque un acta escaneada con firmas y sellos pesa: la alianza con la
-- Gobernación son 17 MB. El tope está para que nadie suba un vídeo, no para
-- pelear con un escáner.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos-legales', 'documentos-legales', false, 52428800,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 52428800,
      allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

drop policy if exists documentos_legales_lectura on storage.objects;
drop policy if exists documentos_legales_escritura on storage.objects;
drop policy if exists documentos_legales_reemplazo on storage.objects;
drop policy if exists documentos_legales_borrado on storage.objects;

create policy documentos_legales_lectura on storage.objects
  for select to authenticated
  using (bucket_id = 'documentos-legales'
         and (select public.mis_roles())
             && array['ADMIN', 'GERENTE_GENERAL', 'TESORERIA', 'RRHH']::text[]);

-- Cargar y quitar papeles de la empresa es de la gerencia. Tesorería y recursos
-- humanos los consultan para hacer su trabajo; no deciden cuáles valen.
create policy documentos_legales_escritura on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos-legales'
              and (select public.mis_roles()) && array['ADMIN', 'GERENTE_GENERAL']::text[]);

create policy documentos_legales_reemplazo on storage.objects
  for update to authenticated
  using (bucket_id = 'documentos-legales'
         and (select public.mis_roles()) && array['ADMIN', 'GERENTE_GENERAL']::text[]);

create policy documentos_legales_borrado on storage.objects
  for delete to authenticated
  using (bucket_id = 'documentos-legales'
         and (select public.mis_roles()) && array['ADMIN', 'GERENTE_GENERAL']::text[]);

-- ---------------------------------------------------------------------------
-- Operaciones
-- ---------------------------------------------------------------------------
create or replace function public.guardar_empresa(
  p_rif                text,
  p_razon_social       text,
  p_domicilio_fiscal   text default null,
  p_ciudad             text default null,
  p_estado             text default null,
  p_zona_postal        text default null,
  p_inscrito_el        date default null,
  p_rif_actualizado_el date default null,
  p_rif_vence_el       date default null,
  p_gerencia_seniat    text default null,
  p_comprobante_rif    text default null,
  p_condicion_iva      text default null,
  p_retencion_iva_pct  numeric default null,
  p_telefono           text default null,
  p_correo             text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.exigir_rol('ADMIN', 'GERENTE_GENERAL');

  if length(trim(coalesce(p_razon_social, ''))) < 3 then
    raise exception 'La razón social no puede quedar vacía.' using errcode = '22023';
  end if;

  -- El RIF venezolano: una letra de tipo, ocho dígitos y el verificador.
  if trim(coalesce(p_rif, '')) !~ '^[JGVEP]-?[0-9]{8}-?[0-9]$' then
    raise exception 'El RIF "%" no tiene forma de RIF. Debe ser como J-50209170-0.', p_rif
      using errcode = '22023';
  end if;

  update public.empresa set
    rif                = upper(trim(p_rif)),
    razon_social       = trim(p_razon_social),
    domicilio_fiscal   = nullif(trim(coalesce(p_domicilio_fiscal, '')), ''),
    ciudad             = nullif(trim(coalesce(p_ciudad, '')), ''),
    estado             = nullif(trim(coalesce(p_estado, '')), ''),
    zona_postal        = nullif(trim(coalesce(p_zona_postal, '')), ''),
    inscrito_el        = p_inscrito_el,
    rif_actualizado_el = p_rif_actualizado_el,
    rif_vence_el       = p_rif_vence_el,
    gerencia_seniat    = nullif(trim(coalesce(p_gerencia_seniat, '')), ''),
    comprobante_rif    = nullif(trim(coalesce(p_comprobante_rif, '')), ''),
    condicion_iva      = nullif(trim(coalesce(p_condicion_iva, '')), ''),
    retencion_iva_pct  = p_retencion_iva_pct,
    telefono           = nullif(trim(coalesce(p_telefono, '')), ''),
    correo             = nullif(trim(coalesce(p_correo, '')), ''),
    actualizado_por    = (select auth.uid()),
    actualizado_en     = now()
  where id = 1;
end;
$$;

create or replace function public.registrar_documento_legal(
  p_tipo       text,
  p_nombre     text,
  p_archivo    text,
  p_mime       text default null,
  p_bytes      bigint default null,
  p_emitido_el date default null,
  p_vence_el   date default null,
  p_nota       text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform private.exigir_rol('ADMIN', 'GERENTE_GENERAL');

  if not exists (select 1 from public.tipos_documento_legal
                  where codigo = p_tipo and activo) then
    raise exception 'No existe el tipo de documento "%".', p_tipo using errcode = '22023';
  end if;

  if length(trim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'Ponle nombre al documento. Una lista de archivos sin nombre no se consulta.'
      using errcode = '22023';
  end if;

  if length(trim(coalesce(p_archivo, ''))) = 0 then
    raise exception 'Falta el archivo.' using errcode = '22023';
  end if;

  insert into public.empresa_documentos
    (tipo, nombre, archivo_path, mime, bytes, emitido_el, vence_el, nota, subido_por)
  values
    (p_tipo, trim(p_nombre), p_archivo, p_mime, p_bytes, p_emitido_el, p_vence_el,
     nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

-- Devuelve la ruta para que la pantalla borre también el archivo: la fila y el
-- objeto son dos cosas, y dejar el archivo huérfano ocupa espacio que nadie
-- vuelve a mirar.
create or replace function public.eliminar_documento_legal(p_id bigint)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  perform private.exigir_rol('ADMIN', 'GERENTE_GENERAL');

  select archivo_path into v_path from public.empresa_documentos where id = p_id;

  if v_path is null then
    raise exception 'No existe el documento %.', p_id using errcode = 'P0002';
  end if;

  delete from public.empresa_documentos where id = p_id;

  return v_path;
end;
$$;

revoke all on function public.guardar_empresa(text, text, text, text, text, text, date, date, date,
                                              text, text, text, numeric, text, text)
  from public, anon;
grant execute on function public.guardar_empresa(text, text, text, text, text, text, date, date, date,
                                                 text, text, text, numeric, text, text)
  to authenticated;

revoke all on function public.registrar_documento_legal(text, text, text, text, bigint, date, date, text)
  from public, anon;
grant execute on function public.registrar_documento_legal(text, text, text, text, bigint, date, date, text)
  to authenticated;

revoke all on function public.eliminar_documento_legal(bigint) from public, anon;
grant execute on function public.eliminar_documento_legal(bigint) to authenticated;
