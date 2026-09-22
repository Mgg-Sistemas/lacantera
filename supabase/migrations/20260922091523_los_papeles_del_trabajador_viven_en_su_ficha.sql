-- LOS PAPELES DEL TRABAJADOR VIVEN EN SU FICHA
--
-- Christopher, 22/09/2026, sobre lo que le falta a Nómina: «Documentación del
-- Trabajador (Cédula, Rif, Currículum)». Hasta hoy lo único que se adjuntaba
-- de una persona era su foto; la cédula y el currículum vivían en una carpeta
-- del computador de alguien, o en papel.
--
-- DÓNDE SE GUARDAN. En el mismo depósito privado que las fotos, `personal`,
-- bajo `<ficha>/documentos/`. No se crea uno nuevo a propósito: ese depósito ya
-- tiene puestas sus reglas —escriben ADMIN y RRHH; leen además GERENTE_GENERAL
-- y TESORERIA— y son exactamente las que le tocan a la cédula de alguien. Un
-- depósito nuevo habría que protegerlo otra vez, y a la tercera copia de una
-- regla siempre hay una que se queda vieja.
--
-- NUNCA HAY UNA DIRECCIÓN PÚBLICA. El archivo se abre con un enlace que firma
-- el servidor contra la sesión de quien lo pide y que caduca. La cédula de un
-- trabajador no puede quedar colgada de una dirección que se reenvía.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Qué papeles se guardan
--
-- Lista cerrada y no texto libre: con texto libre, en un mes hay «CEDULA»,
-- «Cédula», «ci» y «copia de cedula», y entonces la pregunta «¿a quién le
-- falta la cédula?» deja de tener respuesta.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.tipos_documento_personal (
  codigo text primary key,
  nombre text not null,
  orden  smallint not null default 100,
  activo boolean not null default true
);

comment on table public.tipos_documento_personal is
  'Qué clase de papel es cada documento de un trabajador.';

insert into public.tipos_documento_personal (codigo, nombre, orden) values
  ('CEDULA',            'Cédula de identidad',       10),
  ('RIF',               'RIF',                       20),
  ('CURRICULUM',        'Currículum',                30),
  ('PARTIDA_NACIMIENTO','Partida de nacimiento',     40),
  ('TITULO',            'Título o certificado de estudios', 50),
  ('LICENCIA',          'Licencia de conducir',      60),
  ('CERTIFICADO_MEDICO','Certificado médico',        70),
  ('ANTECEDENTES',      'Antecedentes penales',      80),
  ('CONTRATO',          'Contrato de trabajo',       90),
  ('CARTA_BANCARIA',    'Carta o cuenta bancaria',  100),
  ('OTRO',              'Otro documento',           200)
on conflict (codigo) do update set nombre = excluded.nombre, orden = excluded.orden;

alter table public.tipos_documento_personal enable row level security;
drop policy if exists tipos_doc_personal_lectura on public.tipos_documento_personal;
create policy tipos_doc_personal_lectura on public.tipos_documento_personal
  for select to authenticated using (true);
revoke all on public.tipos_documento_personal from anon, authenticated;
grant select on public.tipos_documento_personal to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Los papeles
--
-- `vence_el` está porque la cédula, la licencia y el certificado médico
-- caducan, y saber cuál venció es la mitad del motivo para guardarlos.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.empleado_documentos (
  id           bigint generated always as identity primary key,
  empleado_id  bigint not null references public.empleados(id) on delete cascade,
  tipo         text not null references public.tipos_documento_personal(codigo),
  nombre       text not null,
  archivo_path text not null,
  mime         text,
  bytes        bigint,
  emitido_el   date,
  vence_el     date,
  nota         text,
  subido_por   uuid references auth.users(id),
  subido_en    timestamptz not null default now(),
  constraint empleado_documentos_vence_despues
    check (vence_el is null or emitido_el is null or vence_el >= emitido_el)
);

comment on table public.empleado_documentos is
  'Los papeles de cada trabajador: cédula, RIF, currículum. La fila dice qué es y dónde está; el archivo vive en el depósito privado «personal».';

create index if not exists empleado_documentos_por_empleado
  on public.empleado_documentos (empleado_id, tipo);

-- Se ve con el mismo permiso con el que se ve la ficha. El ARCHIVO, en cambio,
-- solo lo abre quien pueda entrar al depósito: aquí se enseña qué papeles hay,
-- no su contenido.
alter table public.empleado_documentos enable row level security;
drop policy if exists empleado_documentos_lectura on public.empleado_documentos;
create policy empleado_documentos_lectura on public.empleado_documentos
  for select to authenticated
  using (private.tiene_permiso('NOMINA', 'LECTURA'));
revoke all on public.empleado_documentos from anon, authenticated;
grant select on public.empleado_documentos to authenticated;

drop trigger if exists trg_auditar on public.empleado_documentos;
create trigger trg_auditar after insert or update or delete on public.empleado_documentos
  for each row execute function private.auditar('id');

do $mapa$
begin
  if to_regclass('public.auditoria_modulos') is null then
    return;
  end if;
  insert into public.auditoria_modulos (tabla, modulo) values
    ('empleado_documentos', 'NOMINA'),
    ('tipos_documento_personal', 'NOMINA')
  on conflict (tabla) do update set modulo = excluded.modulo;
end
$mapa$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Anotar un papel recién subido
--
-- El archivo se sube primero y se anota después, igual que los documentos
-- legales de la empresa: si la subida falla no queda una fila señalando un
-- archivo que no existe —un renglón que al pulsarlo no abre nada—. Al revés el
-- fallo es más benigno, un archivo que nadie ve, y la pantalla lo retira.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.registrar_documento_de_empleado(
  p_empleado_id bigint,
  p_tipo text,
  p_nombre text,
  p_archivo text,
  p_mime text default null,
  p_bytes bigint default null,
  p_emitido_el date default null,
  p_vence_el date default null,
  p_nota text default null)
returns bigint
language plpgsql security definer set search_path to ''
as $$
declare
  v_id bigint;
begin
  perform private.exigir_rol('RRHH');

  if not exists (select 1 from public.empleados where id = p_empleado_id) then
    raise exception 'Ese trabajador no existe.' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.tipos_documento_personal
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

  if p_vence_el is not null and p_emitido_el is not null and p_vence_el < p_emitido_el then
    raise exception 'El documento no puede vencer antes de haberse emitido.' using errcode = '22023';
  end if;

  insert into public.empleado_documentos
    (empleado_id, tipo, nombre, archivo_path, mime, bytes, emitido_el, vence_el, nota, subido_por)
  values
    (p_empleado_id, p_tipo, trim(p_nombre), p_archivo, p_mime, p_bytes,
     p_emitido_el, p_vence_el, nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

-- Devuelve la ruta justamente para que la pantalla pueda llevarse el archivo:
-- la base no habla con el depósito, y sin esto quedaría huérfano.
create or replace function public.eliminar_documento_de_empleado(p_id bigint)
returns text
language plpgsql security definer set search_path to ''
as $$
declare
  v_path text;
begin
  perform private.exigir_rol('RRHH');

  select archivo_path into v_path from public.empleado_documentos where id = p_id;
  if v_path is null then
    raise exception 'No existe ese documento.' using errcode = 'P0002';
  end if;

  delete from public.empleado_documentos where id = p_id;
  return v_path;
end;
$$;

-- Todos los papeles de un trabajador, para poder llevárselos del depósito
-- cuando se borra la ficha entera.
create or replace function public.papeles_de_empleado(p_empleado_id bigint)
returns setof text
language sql stable security definer set search_path to ''
as $$
  select d.archivo_path
    from public.empleado_documentos d
   where d.empleado_id = p_empleado_id
     and private.tiene_permiso('NOMINA', 'LECTURA');
$$;

revoke execute on function public.registrar_documento_de_empleado(bigint, text, text, text, text, bigint, date, date, text) from public, anon;
revoke execute on function public.eliminar_documento_de_empleado(bigint) from public, anon;
revoke execute on function public.papeles_de_empleado(bigint) from public, anon;
grant execute on function public.registrar_documento_de_empleado(bigint, text, text, text, text, bigint, date, date, text) to authenticated;
grant execute on function public.eliminar_documento_de_empleado(bigint) to authenticated;
grant execute on function public.papeles_de_empleado(bigint) to authenticated;
