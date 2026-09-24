-- ═══════════════════════════════════════════════════════════════════════════
-- EL VISITANTE SE REGISTRA UNA VEZ Y MARCA CADA VISITA
--
-- Christopher, 24/09/2026, a la hora de estrenar los visitantes: «¿y si ya un
-- visitante está registrado? No lo quiero registrar, sino marcar su entrada.
-- ¿Hay validación de que no haya contactos o visitantes repetidos?».
--
-- La primera versión (esta misma tarde) copiaba nombre, cédula, empresa y
-- teléfono en cada visita: el que viene todas las semanas se tecleaba todas
-- las semanas, y no había con qué saber que era el mismo. AHORA EL VISITANTE
-- ES UNA PERSONA CONOCIDA: se registra una vez en `asistencia_visitantes`, y
-- cada visita apunta a ella. Marcar la entrada de alguien que ya vino es
-- buscarlo y pulsar.
--
-- LOS REPETIDOS LOS DECIDE LA BASE, como en Contactos: al guardar un
-- visitante, si otro ya tiene esa cédula o ese teléfono (por sus dígitos, sin
-- el 58 ni el 0), se niega y dice quién. Si de verdad es otra persona, se
-- confirma y pasa. Y si la cédula o el teléfono coinciden con un contacto del
-- directorio, el visitante queda enlazado a él solo: son la misma persona,
-- vista desde dos módulos.
--
-- La tabla de visitas estaba vacía (todo lo probado se deshizo), así que las
-- columnas copiadas se quitan sin migrar nada; igual se deja el paso por si
-- alguien alcanzó a registrar una.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Los visitantes: la persona
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.asistencia_visitantes (
  id              bigint generated always as identity primary key,
  nombre          text not null,
  -- Cédula, pasaporte o lo que traiga: texto, porque no siempre es venezolano.
  documento       text,
  empresa         text,
  telefono        text,
  telefono_llano  text generated always as (private.telefono_llano(telefono)) stored,
  -- La misma persona en el directorio, si está. Si el contacto se borra, el visitante se queda.
  contacto_id     bigint references public.contactos(id) on delete set null,
  activo          boolean not null default true,
  nota            text,
  creado_por      uuid references auth.users(id),
  creado_en       timestamptz not null default now(),
  actualizado_por uuid references auth.users(id),
  actualizado_en  timestamptz,
  constraint visitante_con_nombre check (length(btrim(nombre)) >= 3)
);

comment on table public.asistencia_visitantes is
  'La gente de afuera que ha venido: se registra una vez y cada visita apunta aquí. Repetidos por cédula o teléfono los niega la base.';

create index if not exists asistencia_visitantes_por_documento on public.asistencia_visitantes (documento) where documento is not null;
create index if not exists asistencia_visitantes_por_telefono on public.asistencia_visitantes (telefono_llano) where telefono_llano is not null;

alter table public.asistencia_visitantes enable row level security;
drop policy if exists asistencia_visitantes_lectura on public.asistencia_visitantes;
create policy asistencia_visitantes_lectura on public.asistencia_visitantes
  for select to authenticated using (private.tiene_permiso('ASISTENCIA', 'LECTURA'));
revoke all on public.asistencia_visitantes from anon, authenticated;
grant select on public.asistencia_visitantes to authenticated;

drop trigger if exists trg_auditar on public.asistencia_visitantes;
create trigger trg_auditar after insert or update or delete on public.asistencia_visitantes
  for each row execute function private.auditar('id');
drop trigger if exists trg_normalizar on public.asistencia_visitantes;
create trigger trg_normalizar before insert or update on public.asistencia_visitantes
  for each row execute function private.normalizar_texto('nombre', 'documento', 'empresa', 'nota');

do $mapa$
begin
  if to_regclass('public.auditoria_modulos') is null then
    return;
  end if;
  insert into public.auditoria_modulos (tabla, modulo) values ('asistencia_visitantes', 'ASISTENCIA')
  on conflict (tabla) do update set modulo = excluded.modulo;
end
$mapa$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. La visita apunta a la persona; las columnas copiadas se van
-- ───────────────────────────────────────────────────────────────────────────
drop view if exists public.v_asistencia_visitas;

alter table public.asistencia_visitas add column if not exists visitante_id bigint references public.asistencia_visitantes(id);

do $migra$
declare r record; v_id bigint;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'asistencia_visitas' and column_name = 'nombre') then
    return;
  end if;
  for r in
    select nombre, documento, empresa, telefono, contacto_id, min(id) as primera
      from public.asistencia_visitas where visitante_id is null
     group by nombre, documento, empresa, telefono, contacto_id
  loop
    insert into public.asistencia_visitantes (nombre, documento, empresa, telefono, contacto_id)
    values (r.nombre, r.documento, r.empresa, r.telefono, r.contacto_id)
    returning id into v_id;
    update public.asistencia_visitas set visitante_id = v_id
     where visitante_id is null and nombre = r.nombre
       and documento is not distinct from r.documento and empresa is not distinct from r.empresa
       and telefono is not distinct from r.telefono and contacto_id is not distinct from r.contacto_id;
  end loop;
end
$migra$;

alter table public.asistencia_visitas alter column visitante_id set not null;
alter table public.asistencia_visitas
  drop column if exists nombre,
  drop column if exists documento,
  drop column if exists empresa,
  drop column if exists telefono,
  drop column if exists contacto_id;

create index if not exists asistencia_visitas_por_visitante on public.asistencia_visitas (visitante_id, entrada desc);

drop trigger if exists trg_normalizar on public.asistencia_visitas;
create trigger trg_normalizar before insert or update on public.asistencia_visitas
  for each row execute function private.normalizar_texto('motivo', 'placa', 'nota', 'motivo_anulacion');

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Las vistas
-- ───────────────────────────────────────────────────────────────────────────
create or replace view public.v_asistencia_visitas
with (security_invoker = on) as
select v.id, v.fecha, v.entrada, v.salida,
       v.visitante_id, p.nombre, p.documento, p.empresa, p.telefono, p.contacto_id,
       v.visita_a, e.nombres || ' ' || e.apellidos as visitado, e.cargo as visitado_cargo,
       v.motivo, v.placa, v.nota,
       case when v.anulada_en is not null then 'ANULADA'
            when v.salida is null then 'ADENTRO'
            else 'SALIO' end as estado,
       case when v.salida is null or v.anulada_en is not null then null
            else round(extract(epoch from (v.salida - v.entrada)) / 60)::integer end as minutos,
       v.registrado_por, v.registrado_en, v.corregido_por, v.corregido_en,
       v.anulada_en, v.anulada_por, v.motivo_anulacion
  from public.asistencia_visitas v
  join public.asistencia_visitantes p on p.id = v.visitante_id
  left join public.empleados e on e.id = v.visita_a;

revoke all on public.v_asistencia_visitas from public, anon;
grant select on public.v_asistencia_visitas to authenticated;

-- Cada visitante con cuántas veces ha venido, la última, y si está adentro.
create or replace view public.v_asistencia_visitantes
with (security_invoker = on) as
select p.id, p.nombre, p.documento, p.empresa, p.telefono, p.contacto_id, p.activo, p.nota,
       (select count(*) from public.asistencia_visitas v where v.visitante_id = p.id and v.anulada_en is null)::integer as visitas,
       (select max(v.entrada) from public.asistencia_visitas v where v.visitante_id = p.id and v.anulada_en is null) as ultima_visita,
       exists (select 1 from public.asistencia_visitas v
                where v.visitante_id = p.id and v.salida is null and v.anulada_en is null) as adentro,
       p.creado_en, p.actualizado_en
  from public.asistencia_visitantes p;

revoke all on public.v_asistencia_visitantes from public, anon;
grant select on public.v_asistencia_visitantes to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Guardar un visitante: los repetidos los decide la base
-- ───────────────────────────────────────────────────────────────────────────
create or replace function private.visitante_repetido(p_id bigint, p_documento text, p_telefono text)
returns table (id bigint, nombre text, por text)
language sql stable set search_path to ''
as $$
  with mio as (
    select upper(btrim(nullif(p_documento, ''))) as doc, private.telefono_llano(p_telefono) as tel
  )
  select p.id, p.nombre,
         case when m.doc is not null and p.documento = m.doc then 'la cédula ' || m.doc
              else 'el teléfono ' || coalesce(p_telefono, m.tel) end
    from public.asistencia_visitantes p, mio m
   where (p_id is null or p.id <> p_id)
     and ((m.doc is not null and p.documento = m.doc)
       or (m.tel is not null and p.telefono_llano = m.tel))
   order by p.id
   limit 1;
$$;

revoke all on function private.visitante_repetido(bigint, text, text) from public, anon, authenticated;

create or replace function public.guardar_visitante(p_id bigint, p_datos jsonb, p_aunque_parezca_repetido boolean default false)
returns bigint
language plpgsql security definer set search_path to ''
as $$
declare
  v_nombre    text := nullif(btrim(coalesce(p_datos->>'nombre', '')), '');
  v_documento text := nullif(btrim(coalesce(p_datos->>'documento', '')), '');
  v_empresa   text := nullif(btrim(coalesce(p_datos->>'empresa', '')), '');
  v_telefono  text := nullif(btrim(coalesce(p_datos->>'telefono', '')), '');
  v_nota      text := nullif(btrim(coalesce(p_datos->>'nota', '')), '');
  v_contacto  bigint := nullif(p_datos->>'contacto_id', '')::bigint;
  v_activo    boolean := coalesce((p_datos->>'activo')::boolean, true);
  v_c         record;
  v_rep       record;
  v_id        bigint;
begin
  perform private.exigir_permiso('ASISTENCIA', 'ESCRITURA');

  -- Del directorio: lo que venga en blanco se toma del contacto.
  if v_contacto is not null then
    select nombre, documento,
           coalesce(nullif(empresa_nombre, ''), (select razon_social from public.contactos where id = c.empresa_id)) as empresa,
           coalesce(celular, whatsapp, telefono_oficina) as telefono
      into v_c from public.contactos c where id = v_contacto;
    if not found then
      raise exception 'Ese contacto no está en el directorio.' using errcode = 'P0002';
    end if;
    v_nombre    := coalesce(v_nombre, v_c.nombre);
    v_documento := coalesce(v_documento, v_c.documento);
    v_empresa   := coalesce(v_empresa, v_c.empresa);
    v_telefono  := coalesce(v_telefono, v_c.telefono);
  end if;

  if v_nombre is null or length(v_nombre) < 3 then
    raise exception 'Falta el nombre del visitante.' using errcode = '22023';
  end if;

  if not p_aunque_parezca_repetido then
    select * into v_rep from private.visitante_repetido(p_id, v_documento, v_telefono);
    if v_rep.id is not null then
      raise exception 'Ya existe «%» con %.', v_rep.nombre, v_rep.por
        using errcode = '55000',
              hint = 'Si ya vino antes, búscalo y márcale la entrada. Si es otra persona, regístralo igual marcando que no es un repetido.';
    end if;
  end if;

  -- Si es la misma persona que un contacto del directorio, quedan enlazados.
  if v_contacto is null then
    select c.id into v_contacto
      from public.contactos c
     where (v_documento is not null and c.documento = upper(v_documento))
        or (private.telefono_llano(v_telefono) is not null
            and private.telefono_llano(v_telefono) in (c.celular_llano, c.whatsapp_llano, c.oficina_llano))
     order by (c.documento = upper(v_documento)) desc nulls last, c.id
     limit 1;
  end if;

  if p_id is null then
    insert into public.asistencia_visitantes (nombre, documento, empresa, telefono, contacto_id, activo, nota, creado_por)
    values (v_nombre, v_documento, v_empresa, v_telefono, v_contacto, v_activo, v_nota, (select auth.uid()))
    returning id into v_id;
    return v_id;
  end if;

  update public.asistencia_visitantes
     set nombre = v_nombre, documento = v_documento, empresa = v_empresa, telefono = v_telefono,
         contacto_id = v_contacto, activo = v_activo, nota = v_nota,
         actualizado_por = (select auth.uid()), actualizado_en = now()
   where id = p_id;
  if not found then
    raise exception 'No existe ese visitante.' using errcode = 'P0002';
  end if;
  return p_id;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. La visita: apunta al visitante; el candado de «adentro dos veces» ya no
--    necesita cédula, porque la persona es una sola.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function private.visita_de_datos(p_datos jsonb, p_id bigint default null)
returns public.asistencia_visitas
language plpgsql security definer set search_path to ''
as $$
declare
  v public.asistencia_visitas;
  v_p record;
  v_cfg record;
  v_abierta record;
begin
  select * into v_cfg from public.asistencia_config where unica;

  v.visitante_id := nullif(p_datos->>'visitante_id', '')::bigint;
  v.visita_a     := nullif(p_datos->>'visita_a', '')::bigint;
  v.motivo       := nullif(btrim(coalesce(p_datos->>'motivo', '')), '');
  v.placa        := nullif(btrim(coalesce(p_datos->>'placa', '')), '');
  v.nota         := nullif(btrim(coalesce(p_datos->>'nota', '')), '');
  v.entrada      := coalesce(nullif(p_datos->>'entrada', '')::timestamptz, now());
  v.salida       := nullif(p_datos->>'salida', '')::timestamptz;

  if v.visitante_id is null then
    raise exception 'Falta el visitante.' using errcode = '22023';
  end if;
  select id, nombre, activo into v_p from public.asistencia_visitantes where id = v.visitante_id;
  if v_p.id is null then
    raise exception 'Ese visitante no está registrado.' using errcode = 'P0002';
  end if;
  if not v_p.activo then
    raise exception '% está marcado como inactivo: actívalo antes de registrarle una visita.', v_p.nombre using errcode = '55000';
  end if;
  if v.visita_a is not null and not exists (select 1 from public.empleados where id = v.visita_a) then
    raise exception 'Esa persona no está en el personal.' using errcode = 'P0002';
  end if;
  if v.entrada > now() + interval '5 minutes' then
    raise exception 'La entrada está en el futuro.' using errcode = '22023';
  end if;
  if v.salida is not null and v.salida <= v.entrada then
    raise exception 'La salida tiene que ser después de la entrada.' using errcode = '22023';
  end if;
  if v.salida is not null and v.salida - v.entrada > interval '24 hours' then
    raise exception 'Una visita no puede durar más de 24 horas. Si fueron dos días, cárgalas como dos.' using errcode = '22023';
  end if;

  if v.salida is null then
    select id, entrada into v_abierta
      from public.asistencia_visitas
     where visitante_id = v.visitante_id and salida is null and anulada_en is null
       and (p_id is null or id <> p_id)
       and now() - entrada <= make_interval(hours => v_cfg.horas_maximas_jornada)
     order by entrada desc limit 1;
    if v_abierta.id is not null then
      raise exception '% ya está adentro desde las %: regístrale la salida antes de otra entrada.',
        v_p.nombre, to_char(v_abierta.entrada at time zone 'America/Caracas', 'HH24:MI')
        using errcode = '55000';
    end if;
  end if;

  v.fecha := (v.entrada at time zone 'America/Caracas')::date;
  return v;
end;
$$;

-- Registrar: con `visitante_id` para el que ya vino, o con `visitante` (los
-- datos de la persona) para el nuevo, que se guarda primero con las mismas
-- reglas de repetidos. `aunque_parezca_repetido` es la confirmación.
create or replace function public.registrar_visita(p_datos jsonb)
returns bigint
language plpgsql security definer set search_path to ''
as $$
declare v public.asistencia_visitas; v_id bigint; v_datos jsonb := p_datos;
begin
  perform private.exigir_permiso('ASISTENCIA', 'ESCRITURA');
  if nullif(p_datos->>'visitante_id', '') is null and p_datos ? 'visitante' then
    v_datos := p_datos || jsonb_build_object('visitante_id',
      public.guardar_visitante(null, p_datos->'visitante', coalesce((p_datos->>'aunque_parezca_repetido')::boolean, false)));
  end if;
  v := private.visita_de_datos(v_datos);
  insert into public.asistencia_visitas
    (fecha, entrada, salida, visitante_id, visita_a, motivo, placa, nota, registrado_por)
  values
    (v.fecha, v.entrada, v.salida, v.visitante_id, v.visita_a, v.motivo, v.placa, v.nota, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.corregir_visita(p_id bigint, p_datos jsonb)
returns void
language plpgsql security definer set search_path to ''
as $$
declare v public.asistencia_visitas; v_vieja record;
begin
  perform private.exigir_permiso('ASISTENCIA', 'ESCRITURA');
  select * into v_vieja from public.asistencia_visitas where id = p_id for update;
  if v_vieja.id is null then
    raise exception 'No existe esa visita.' using errcode = 'P0002';
  end if;
  if v_vieja.anulada_en is not null then
    raise exception 'Esa visita está anulada: no se corrige.' using errcode = '55000';
  end if;
  v := private.visita_de_datos(p_datos, p_id);
  update public.asistencia_visitas
     set fecha = v.fecha, entrada = v.entrada, salida = v.salida,
         visitante_id = v.visitante_id, visita_a = v.visita_a, motivo = v.motivo, placa = v.placa, nota = v.nota,
         corregido_por = (select auth.uid()), corregido_en = now()
   where id = p_id;
end;
$$;

revoke execute on function public.guardar_visitante(bigint, jsonb, boolean) from public, anon;
grant execute on function public.guardar_visitante(bigint, jsonb, boolean) to authenticated;
