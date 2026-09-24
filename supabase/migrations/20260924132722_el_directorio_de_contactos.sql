-- EL DIRECTORIO DE CONTACTOS (24/09/2026)
--
-- Christopher: «vamos a crear un módulo de contactos donde se almacenen los
-- contactos generales del sistema… lo básico y lo que consideres que cubra
-- los escenarios de información de contactos en general». Mandó un esquema
-- genérico de CRM; esto es ese esquema puesto en la casa:
--
-- - Documento venezolano (cédula o RIF), opcional, con la misma regla que
--   clientes y proveedores.
-- - WhatsApp como canal propio, que es por donde se habla aquí.
-- - Sin Google Maps ni Skype ni Slack: dirección escrita, y un enlace al mapa
--   que se arma con ella en la pantalla.
-- - Un contacto puede ser la persona detrás de un cliente, un proveedor o un
--   trabajador que ya existe: se enlaza, no se duplica.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- EL CONTROL DE DUPLICADOS ES DE LA BASE, NO DE LA PANTALLA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Un correo se compara en minúsculas; un teléfono, solo por sus dígitos y sin
-- el 58 ni el 0 de adelante, para que 0414-1234567, +58 414 1234567 y
-- 4141234567 sean el mismo. Si otro contacto ya tiene ese correo o ese
-- teléfono, guardar se niega y dice cuál es. Quien está seguro de que es
-- otra persona lo confirma y pasa: la regla evita la base sucia sin
-- prohibir el caso real de dos personas con el mismo teléfono de oficina.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- SE BUSCA SIN ACENTOS Y POR CUALQUIER TROZO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `busqueda` junta nombre, empresa, cargo, correos, teléfonos, ciudad y
-- etiquetas en minúsculas y sin acentos. La pantalla filtra sobre eso: «perez
-- 0414» encuentra a Pérez por su celular.

-- ───────────────────────────────────────── el módulo y sus permisos

insert into public.modulos (codigo, nombre, descripcion, orden)
values ('CONTACTOS', 'Contactos',
        'El directorio general: personas y empresas con sus teléfonos, correos, dirección, etiquetas y quién los atiende.',
        95)
on conflict (codigo) do nothing;

insert into public.rol_permisos (rol, modulo, nivel)
select r.codigo, 'CONTACTOS', case when r.codigo = 'ADMIN' then 'TOTAL' else 'NINGUNO' end
  from public.roles r
on conflict (rol, modulo) do nothing;

-- ───────────────────────────────────────── las etiquetas

create table if not exists public.contacto_etiquetas (
  codigo  text primary key,
  nombre  text not null,
  orden   smallint not null default 50,
  activa  boolean not null default true
);

insert into public.contacto_etiquetas (codigo, nombre, orden) values
  ('CLIENTE',      'Cliente',           10),
  ('PROVEEDOR',    'Proveedor',         20),
  ('PROSPECTO',    'Prospecto',         30),
  ('SOCIO',        'Socio',             40),
  ('CONTRATISTA',  'Contratista',       50),
  ('ENTE_PUBLICO', 'Ente público',      60),
  ('COMPETIDOR',   'Competidor',        70),
  ('OTRO',         'Otro',              90)
on conflict (codigo) do nothing;

alter table public.contacto_etiquetas enable row level security;
create policy contacto_etiquetas_lectura on public.contacto_etiquetas
  for select to authenticated using (private.tiene_permiso('CONTACTOS', 'LECTURA'));

-- ───────────────────────────────────────── el teléfono, solo sus dígitos

-- Inmutable a propósito: así puede vivir en una columna generada y en un índice.
create or replace function private.telefono_llano(p text)
returns text
language sql
immutable
set search_path to ''
as $$
  select nullif(
    regexp_replace(
      regexp_replace(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '^58', ''),
      '^0', ''),
    '');
$$;

-- ───────────────────────────────────────── la tabla

create table if not exists public.contactos (
  id                 bigint generated always as identity primary key,
  tipo               text not null check (tipo in ('PERSONA', 'EMPRESA')),
  tratamiento        text,
  nombres            text,
  apellidos          text,
  razon_social       text,
  /** El nombre con el que se lista: la razón social, o nombres y apellidos. */
  nombre             text generated always as (
                       case when tipo = 'EMPRESA' then razon_social
                            else btrim(coalesce(nombres, '') || ' ' || coalesce(apellidos, '')) end) stored,
  documento          text check (documento is null or documento ~ '^[VEJPGC]-[0-9]{6,9}(-[0-9])?$'),
  empresa_id         bigint references public.contactos(id),
  empresa_nombre     text,
  cargo              text,
  correo             text check (correo is null or correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  correo_secundario  text check (correo_secundario is null or correo_secundario ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  telefono_oficina   text,
  extension          text,
  celular            text,
  whatsapp           text,
  direccion          text,
  ciudad             text,
  estado_region      text,
  codigo_postal      text,
  pais               text not null default 'VENEZUELA',
  sitio_web          text,
  linkedin           text,
  instagram          text,
  facebook           text,
  otra_red           text,
  etiquetas          text[] not null default '{}',
  origen             text,
  asignado_a         uuid references public.perfiles(id),
  estado             text not null default 'ACTIVO' check (estado in ('ACTIVO', 'INACTIVO', 'BLOQUEADO')),
  estado_motivo      text,
  estado_cambiado_en timestamptz,
  estado_cambiado_por uuid,
  cliente_id         bigint references public.clientes(id),
  proveedor_id       bigint references public.proveedores(id),
  empleado_id        bigint references public.empleados(id),
  nota               text,
  /** Para comparar y buscar. Los mantiene la base, no la pantalla. */
  correo_llano       text generated always as (lower(btrim(correo))) stored,
  correo2_llano      text generated always as (lower(btrim(correo_secundario))) stored,
  celular_llano      text generated always as (private.telefono_llano(celular)) stored,
  whatsapp_llano     text generated always as (private.telefono_llano(whatsapp)) stored,
  oficina_llano      text generated always as (private.telefono_llano(telefono_oficina)) stored,
  busqueda           text,
  creado_por         uuid not null,
  creado_en          timestamptz not null default now(),
  actualizado_por    uuid,
  actualizado_en     timestamptz,
  constraint contacto_tiene_nombre check (
    (tipo = 'PERSONA' and nullif(btrim(coalesce(nombres, '')), '') is not null)
    or (tipo = 'EMPRESA' and nullif(btrim(coalesce(razon_social, '')), '') is not null)),
  constraint contacto_no_es_su_propia_empresa check (empresa_id is null or empresa_id <> id)
);

create index if not exists contactos_busqueda on public.contactos using gin (busqueda gin_trgm_ops);
create index if not exists contactos_estado on public.contactos (estado);
create index if not exists contactos_etiquetas on public.contactos using gin (etiquetas);
create index if not exists contactos_correo on public.contactos (correo_llano) where correo_llano is not null;
create index if not exists contactos_celular on public.contactos (celular_llano) where celular_llano is not null;
create index if not exists contactos_whatsapp on public.contactos (whatsapp_llano) where whatsapp_llano is not null;
create index if not exists contactos_oficina on public.contactos (oficina_llano) where oficina_llano is not null;
create index if not exists contactos_empresa on public.contactos (empresa_id) where empresa_id is not null;

alter table public.contactos enable row level security;
create policy contactos_lectura on public.contactos
  for select to authenticated using (private.tiene_permiso('CONTACTOS', 'LECTURA'));

create trigger trg_auditar
  after insert or update or delete on public.contactos
  for each row execute function private.auditar('id');

-- Los correos y las redes no se tocan: un correo en mayúsculas es otro correo
-- para mucha gente, y una dirección web con mayúsculas puede dejar de abrir.
create trigger trg_normalizar
  before insert or update on public.contactos
  for each row execute function private.normalizar_texto(
    'tratamiento', 'nombres', 'apellidos', 'razon_social', 'documento', 'empresa_nombre',
    'cargo', 'direccion', 'ciudad', 'estado_region', 'codigo_postal', 'pais', 'origen');

-- El texto de búsqueda. Va después de normalizar, para tomar lo que quedó.
create or replace function private.contacto_busqueda()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  new.busqueda := lower(extensions.unaccent(concat_ws(' ',
    new.nombre, new.tratamiento, new.razon_social, new.documento, new.empresa_nombre,
    (select c.nombre from public.contactos c where c.id = new.empresa_id),
    new.cargo, new.correo, new.correo_secundario,
    new.telefono_oficina, new.celular, new.whatsapp,
    new.celular_llano, new.whatsapp_llano, new.oficina_llano,
    new.ciudad, new.estado_region, new.pais, new.origen,
    array_to_string(new.etiquetas, ' '), new.nota)));
  return new;
end;
$$;

create trigger trg_busqueda
  before insert or update on public.contactos
  for each row execute function private.contacto_busqueda();

-- ───────────────────────────────────────── lo que se enseña

create or replace view public.v_contactos
  with (security_invoker = on) as
select c.*,
       e.nombre  as empresa,
       p.nombre  as asignado,
       cl.nombre as cliente,
       pr.nombre as proveedor,
       btrim(coalesce(em.nombres, '') || ' ' || coalesce(em.apellidos, '')) as empleado,
       (select count(*) from public.contactos h where h.empresa_id = c.id) as personas
  from public.contactos c
  left join public.contactos  e  on e.id  = c.empresa_id
  left join public.perfiles   p  on p.id  = c.asignado_a
  left join public.clientes   cl on cl.id = c.cliente_id
  left join public.proveedores pr on pr.id = c.proveedor_id
  left join public.empleados  em on em.id = c.empleado_id;

-- ───────────────────────────────────────── el que parece repetido

-- Devuelve el primer contacto distinto de `p_id` que comparte correo o
-- teléfono con los datos dados, o nada.
create or replace function private.contacto_repetido(
  p_id bigint, p_correo text, p_correo2 text, p_celular text, p_whatsapp text, p_oficina text)
returns table (id bigint, nombre text, por text)
language sql
stable
set search_path to ''
as $$
  with mio as (
    select lower(btrim(nullif(p_correo, '')))  as c1,
           lower(btrim(nullif(p_correo2, ''))) as c2,
           private.telefono_llano(p_celular)  as t1,
           private.telefono_llano(p_whatsapp) as t2,
           private.telefono_llano(p_oficina)  as t3
  )
  select c.id, c.nombre,
         case
           when m.c1 is not null and m.c1 in (c.correo_llano, c.correo2_llano) then 'el correo ' || m.c1
           when m.c2 is not null and m.c2 in (c.correo_llano, c.correo2_llano) then 'el correo ' || m.c2
           when m.t1 is not null and m.t1 in (c.celular_llano, c.whatsapp_llano, c.oficina_llano) then 'el teléfono ' || coalesce(p_celular, m.t1)
           when m.t2 is not null and m.t2 in (c.celular_llano, c.whatsapp_llano, c.oficina_llano) then 'el WhatsApp ' || coalesce(p_whatsapp, m.t2)
           else 'el teléfono de oficina ' || coalesce(p_oficina, m.t3)
         end
    from public.contactos c, mio m
   where (p_id is null or c.id <> p_id)
     and (
       (m.c1 is not null and m.c1 in (c.correo_llano, c.correo2_llano))
       or (m.c2 is not null and m.c2 in (c.correo_llano, c.correo2_llano))
       or (m.t1 is not null and m.t1 in (c.celular_llano, c.whatsapp_llano, c.oficina_llano))
       or (m.t2 is not null and m.t2 in (c.celular_llano, c.whatsapp_llano, c.oficina_llano))
       or (m.t3 is not null and m.t3 in (c.celular_llano, c.whatsapp_llano, c.oficina_llano))
     )
   order by c.id
   limit 1;
$$;

-- ───────────────────────────────────────── guardar

create or replace function public.guardar_contacto(
  p_id bigint, p_datos jsonb, p_aunque_parezca_repetido boolean default false)
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_tipo      text := upper(nullif(btrim(coalesce(p_datos->>'tipo', '')), ''));
  v_estado    text := upper(coalesce(nullif(btrim(coalesce(p_datos->>'estado', '')), ''), 'ACTIVO'));
  v_etiq      text[] := coalesce(
                 (select array_agg(upper(x)) from jsonb_array_elements_text(coalesce(p_datos->'etiquetas', '[]'::jsonb)) x),
                 '{}'::text[]);
  v_mala      text;
  v_empresa   bigint := nullif(p_datos->>'empresa_id', '')::bigint;
  v_asignado  uuid := nullif(p_datos->>'asignado_a', '')::uuid;
  v_rep       record;
  v_actual    public.contactos;
  v_id        bigint;
  t           text;
begin
  perform private.exigir_permiso('CONTACTOS', 'ESCRITURA');

  if v_tipo not in ('PERSONA', 'EMPRESA') then
    raise exception 'Di si el contacto es una persona o una empresa.' using errcode = '22023';
  end if;
  if v_estado not in ('ACTIVO', 'INACTIVO', 'BLOQUEADO') then
    raise exception 'El estado tiene que ser activo, inactivo o bloqueado.' using errcode = '22023';
  end if;

  if p_id is not null then
    select * into v_actual from public.contactos where id = p_id for update;
    if v_actual.id is null then
      raise exception 'No existe ese contacto.' using errcode = 'P0002';
    end if;
    -- Bloquear, o sacar del bloqueo, es decisión de control total.
    if v_estado <> v_actual.estado and (v_estado = 'BLOQUEADO' or v_actual.estado = 'BLOQUEADO') then
      perform private.exigir_permiso('CONTACTOS', 'TOTAL');
    end if;
  elsif v_estado = 'BLOQUEADO' then
    perform private.exigir_permiso('CONTACTOS', 'TOTAL');
  end if;

  select e into v_mala from unnest(v_etiq) e
   where not exists (select 1 from public.contacto_etiquetas ce where ce.codigo = e and ce.activa)
   limit 1;
  if v_mala is not null then
    raise exception 'La etiqueta «%» no existe o está apagada.', v_mala using errcode = '22023';
  end if;

  if v_empresa is not null then
    if p_id is not null and v_empresa = p_id then
      raise exception 'Un contacto no puede ser su propia empresa.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.contactos where id = v_empresa and tipo = 'EMPRESA') then
      raise exception 'La empresa a la que se enlaza no existe en el directorio o no es una empresa.' using errcode = '22023';
    end if;
  end if;

  if v_asignado is not null and not exists (select 1 from public.perfiles where id = v_asignado and activo) then
    raise exception 'La persona a la que se asigna no es un usuario activo del sistema.' using errcode = '22023';
  end if;

  -- Los enlaces a lo que ya existe: si vienen, tienen que existir.
  if nullif(p_datos->>'cliente_id', '') is not null
     and not exists (select 1 from public.clientes where id = (p_datos->>'cliente_id')::bigint) then
    raise exception 'Ese cliente no existe.' using errcode = '22023';
  end if;
  if nullif(p_datos->>'proveedor_id', '') is not null
     and not exists (select 1 from public.proveedores where id = (p_datos->>'proveedor_id')::bigint) then
    raise exception 'Ese proveedor no existe.' using errcode = '22023';
  end if;
  if nullif(p_datos->>'empleado_id', '') is not null
     and not exists (select 1 from public.empleados where id = (p_datos->>'empleado_id')::bigint) then
    raise exception 'Ese trabajador no existe.' using errcode = '22023';
  end if;

  -- El repetido, salvo que quien guarda diga que es otra persona.
  if not coalesce(p_aunque_parezca_repetido, false) then
    select * into v_rep from private.contacto_repetido(
      p_id, p_datos->>'correo', p_datos->>'correo_secundario',
      p_datos->>'celular', p_datos->>'whatsapp', p_datos->>'telefono_oficina');
    if v_rep.id is not null then
      raise exception 'Ya existe «%» con %.', v_rep.nombre, v_rep.por
        using errcode = '55000',
              hint = 'Si es otra persona, guarda igual marcando que no es un repetido.';
    end if;
  end if;

  if p_id is null then
    insert into public.contactos
      (tipo, tratamiento, nombres, apellidos, razon_social, documento, empresa_id, empresa_nombre, cargo,
       correo, correo_secundario, telefono_oficina, extension, celular, whatsapp,
       direccion, ciudad, estado_region, codigo_postal, pais,
       sitio_web, linkedin, instagram, facebook, otra_red,
       etiquetas, origen, asignado_a, estado, estado_motivo, estado_cambiado_en, estado_cambiado_por,
       cliente_id, proveedor_id, empleado_id, nota, creado_por)
    values
      (v_tipo, nullif(p_datos->>'tratamiento', ''), nullif(p_datos->>'nombres', ''), nullif(p_datos->>'apellidos', ''),
       nullif(p_datos->>'razon_social', ''), nullif(p_datos->>'documento', ''), v_empresa, nullif(p_datos->>'empresa_nombre', ''),
       nullif(p_datos->>'cargo', ''),
       nullif(p_datos->>'correo', ''), nullif(p_datos->>'correo_secundario', ''), nullif(p_datos->>'telefono_oficina', ''),
       nullif(p_datos->>'extension', ''), nullif(p_datos->>'celular', ''), nullif(p_datos->>'whatsapp', ''),
       nullif(p_datos->>'direccion', ''), nullif(p_datos->>'ciudad', ''), nullif(p_datos->>'estado_region', ''),
       nullif(p_datos->>'codigo_postal', ''), coalesce(nullif(p_datos->>'pais', ''), 'VENEZUELA'),
       nullif(p_datos->>'sitio_web', ''), nullif(p_datos->>'linkedin', ''), nullif(p_datos->>'instagram', ''),
       nullif(p_datos->>'facebook', ''), nullif(p_datos->>'otra_red', ''),
       v_etiq, nullif(p_datos->>'origen', ''), v_asignado, v_estado,
       case when v_estado <> 'ACTIVO' then nullif(p_datos->>'estado_motivo', '') end,
       case when v_estado <> 'ACTIVO' then now() end,
       case when v_estado <> 'ACTIVO' then (select auth.uid()) end,
       nullif(p_datos->>'cliente_id', '')::bigint, nullif(p_datos->>'proveedor_id', '')::bigint,
       nullif(p_datos->>'empleado_id', '')::bigint, nullif(p_datos->>'nota', ''), (select auth.uid()))
    returning id into v_id;
    return v_id;
  end if;

  update public.contactos set
    tipo = v_tipo,
    tratamiento = nullif(p_datos->>'tratamiento', ''),
    nombres = nullif(p_datos->>'nombres', ''),
    apellidos = nullif(p_datos->>'apellidos', ''),
    razon_social = nullif(p_datos->>'razon_social', ''),
    documento = nullif(p_datos->>'documento', ''),
    empresa_id = v_empresa,
    empresa_nombre = nullif(p_datos->>'empresa_nombre', ''),
    cargo = nullif(p_datos->>'cargo', ''),
    correo = nullif(p_datos->>'correo', ''),
    correo_secundario = nullif(p_datos->>'correo_secundario', ''),
    telefono_oficina = nullif(p_datos->>'telefono_oficina', ''),
    extension = nullif(p_datos->>'extension', ''),
    celular = nullif(p_datos->>'celular', ''),
    whatsapp = nullif(p_datos->>'whatsapp', ''),
    direccion = nullif(p_datos->>'direccion', ''),
    ciudad = nullif(p_datos->>'ciudad', ''),
    estado_region = nullif(p_datos->>'estado_region', ''),
    codigo_postal = nullif(p_datos->>'codigo_postal', ''),
    pais = coalesce(nullif(p_datos->>'pais', ''), 'VENEZUELA'),
    sitio_web = nullif(p_datos->>'sitio_web', ''),
    linkedin = nullif(p_datos->>'linkedin', ''),
    instagram = nullif(p_datos->>'instagram', ''),
    facebook = nullif(p_datos->>'facebook', ''),
    otra_red = nullif(p_datos->>'otra_red', ''),
    etiquetas = v_etiq,
    origen = nullif(p_datos->>'origen', ''),
    asignado_a = v_asignado,
    estado = v_estado,
    estado_motivo = case when v_estado = v_actual.estado then estado_motivo else nullif(p_datos->>'estado_motivo', '') end,
    estado_cambiado_en = case when v_estado = v_actual.estado then estado_cambiado_en else now() end,
    estado_cambiado_por = case when v_estado = v_actual.estado then estado_cambiado_por else (select auth.uid()) end,
    cliente_id = nullif(p_datos->>'cliente_id', '')::bigint,
    proveedor_id = nullif(p_datos->>'proveedor_id', '')::bigint,
    empleado_id = nullif(p_datos->>'empleado_id', '')::bigint,
    nota = nullif(p_datos->>'nota', ''),
    actualizado_por = (select auth.uid()),
    actualizado_en = now()
  where id = p_id;

  return p_id;
end;
$$;

-- ───────────────────────────────────────── eliminar (solo control total)

-- Un contacto no es un documento: no mueve dinero ni inventario. Borrarlo no
-- deja nada apuntando a nada, así que se permite, con control total y con la
-- auditoría de por medio. Lo único que lo frena es que otros contactos lo
-- tengan como empresa.
create or replace function public.eliminar_contacto(p_id bigint)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_n integer;
begin
  perform private.exigir_permiso('CONTACTOS', 'TOTAL');
  if not exists (select 1 from public.contactos where id = p_id) then
    raise exception 'No existe ese contacto.' using errcode = 'P0002';
  end if;
  select count(*) into v_n from public.contactos where empresa_id = p_id;
  if v_n > 0 then
    raise exception 'Esta empresa tiene % persona% enlazada%. Desenlázalas o bórralas primero.',
      v_n, case when v_n = 1 then '' else 's' end, case when v_n = 1 then '' else 's' end
      using errcode = '55000';
  end if;
  delete from public.contactos where id = p_id;
end;
$$;

-- ───────────────────────────────────────── la carga por Excel

-- Todo o nada, y cada fila pasa por la misma puerta que el formulario: las
-- mismas reglas, el mismo control de repetidos. Un repetido dentro del propio
-- archivo también se detecta, porque la segunda fila ya ve a la primera.
create or replace function public.cargar_contactos(p_filas jsonb)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_f   jsonb;
  v_n   integer := 0;
  v_err text;
begin
  perform private.exigir_permiso('CONTACTOS', 'ESCRITURA');

  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'No hay ninguna fila que cargar.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_filas) > 2000 then
    raise exception 'Son más de 2.000 filas: pártelo en varios archivos.' using errcode = '22023';
  end if;

  for v_f in select x from jsonb_array_elements(p_filas) x loop
    v_n := v_n + 1;
    begin
      perform public.guardar_contacto(null, v_f, coalesce((v_f->>'aunque_parezca_repetido')::boolean, false));
    exception when others then
      get stacked diagnostics v_err = message_text;
      raise exception 'Fila %: %', v_n, v_err using errcode = '22023';
    end;
  end loop;

  return v_n;
end;
$$;

-- ───────────────────────────────────────── los repetidos que ya están

create or replace function public.contactos_duplicados()
returns table (id_a bigint, nombre_a text, id_b bigint, nombre_b text, por text)
language sql
stable
security definer
set search_path to ''
as $$
  select a.id, a.nombre, b.id, b.nombre,
         case
           when a.correo_llano is not null and a.correo_llano in (b.correo_llano, b.correo2_llano) then 'correo ' || a.correo_llano
           when a.correo2_llano is not null and a.correo2_llano in (b.correo_llano, b.correo2_llano) then 'correo ' || a.correo2_llano
           when a.celular_llano is not null and a.celular_llano in (b.celular_llano, b.whatsapp_llano, b.oficina_llano) then 'teléfono ' || coalesce(a.celular, a.celular_llano)
           when a.whatsapp_llano is not null and a.whatsapp_llano in (b.celular_llano, b.whatsapp_llano, b.oficina_llano) then 'WhatsApp ' || coalesce(a.whatsapp, a.whatsapp_llano)
           else 'teléfono de oficina ' || coalesce(a.telefono_oficina, a.oficina_llano)
         end
    from public.contactos a
    join public.contactos b on b.id > a.id
     and (
       (a.correo_llano is not null and a.correo_llano in (b.correo_llano, b.correo2_llano))
       or (a.correo2_llano is not null and a.correo2_llano in (b.correo_llano, b.correo2_llano))
       or (a.celular_llano is not null and a.celular_llano in (b.celular_llano, b.whatsapp_llano, b.oficina_llano))
       or (a.whatsapp_llano is not null and a.whatsapp_llano in (b.celular_llano, b.whatsapp_llano, b.oficina_llano))
       or (a.oficina_llano is not null and a.oficina_llano in (b.celular_llano, b.whatsapp_llano, b.oficina_llano))
     )
   where private.tiene_permiso('CONTACTOS', 'LECTURA')
   order by a.nombre, b.nombre;
$$;

-- ───────────────────────────────────────── el catálogo de etiquetas

create or replace function public.guardar_etiqueta_de_contacto(p_codigo text, p_nombre text, p_activa boolean default true)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_codigo text := upper(regexp_replace(btrim(coalesce(p_codigo, '')), '[^A-Za-z0-9]+', '_', 'g'));
begin
  perform private.exigir_permiso('CONTACTOS', 'TOTAL');
  if v_codigo = '' or length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'La etiqueta necesita un código y un nombre.' using errcode = '22023';
  end if;
  insert into public.contacto_etiquetas (codigo, nombre, activa)
  values (v_codigo, btrim(p_nombre), coalesce(p_activa, true))
  on conflict (codigo) do update set nombre = excluded.nombre, activa = excluded.activa;
end;
$$;

-- ───────────────────────────────────────── permisos de ejecución

revoke all on function public.guardar_contacto(bigint, jsonb, boolean) from public, anon;
revoke all on function public.eliminar_contacto(bigint) from public, anon;
revoke all on function public.cargar_contactos(jsonb) from public, anon;
revoke all on function public.contactos_duplicados() from public, anon;
revoke all on function public.guardar_etiqueta_de_contacto(text, text, boolean) from public, anon;
grant execute on function public.guardar_contacto(bigint, jsonb, boolean) to authenticated;
grant execute on function public.eliminar_contacto(bigint) to authenticated;
grant execute on function public.cargar_contactos(jsonb) to authenticated;
grant execute on function public.contactos_duplicados() to authenticated;
grant execute on function public.guardar_etiqueta_de_contacto(text, text, boolean) to authenticated;
