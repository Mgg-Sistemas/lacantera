-- ═══════════════════════════════════════════════════════════════════════════
-- LOS VISITANTES EN EL CONTROL DE ASISTENCIA
--
-- Christopher, 24/09/2026: «necesito que en asistencias, una opción de
-- visitantes, ya que hay que gestionar a los que no forman parte de nómina,
-- pero vienen de visita».
--
-- Un visitante no tiene carnet ni ficha ni jornada: es alguien de afuera que
-- entra a la cantera un rato —un chofer de otra empresa, un inspector, un
-- cliente que viene a ver el material, un técnico— y de quien hay que saber
-- que está adentro, desde cuándo, con quién, y a qué hora se fue.
--
-- LA MISMA IDEA QUE LA JORNADA: una fila por visita, con la entrada y la
-- salida juntas. Salida en blanco = todavía está adentro. La hora la pone la
-- base cuando se registra en vivo; la carga de una visita pasada trae sus
-- horas y queda con quién la cargó. Se anula, no se borra.
--
-- Se registra a mano, porque no hay carnet que escanear. Si el visitante ya
-- está en el directorio de contactos, se toma de ahí: la base rellena lo que
-- venga en blanco. Y las tablas del personal no se tocan: un visitante no
-- entra a la nómina ni al calendario del personal.
--
-- Usa el permiso ASISTENCIA que ya existe: quien marca al personal registra
-- visitantes; quien anula jornadas anula visitas.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Las visitas
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.asistencia_visitas (
  id               bigint generated always as identity primary key,
  -- El día de la ENTRADA, en hora de Caracas.
  fecha            date not null,
  entrada          timestamptz not null,
  salida           timestamptz,
  nombre           text not null,
  -- Cédula, pasaporte o lo que traiga: texto, porque no siempre es venezolano.
  documento        text,
  empresa          text,
  telefono         text,
  -- Si vino del directorio. Si el contacto se borra, la visita se queda.
  contacto_id      bigint references public.contactos(id) on delete set null,
  -- A quién del personal viene a ver.
  visita_a         bigint references public.empleados(id),
  motivo           text,
  placa            text,
  nota             text,
  registrado_por   uuid references auth.users(id),
  registrado_en    timestamptz not null default now(),
  corregido_por    uuid references auth.users(id),
  corregido_en     timestamptz,
  anulada_en       timestamptz,
  anulada_por      uuid references auth.users(id),
  motivo_anulacion text,
  constraint visita_con_nombre           check (length(btrim(nombre)) >= 3),
  constraint visita_sale_despues_de_entrar check (salida is null or salida > entrada),
  constraint visita_cabe_en_un_dia       check (salida is null or salida - entrada <= interval '24 hours')
);

comment on table public.asistencia_visitas is
  'Gente de afuera que entró a la cantera: una fila por visita, con la entrada y la salida juntas. Salida en blanco = sigue adentro. Se anula, no se borra.';

create index if not exists asistencia_visitas_por_fecha on public.asistencia_visitas (fecha, entrada);
create index if not exists asistencia_visitas_abiertas on public.asistencia_visitas (entrada desc) where salida is null and anulada_en is null;

alter table public.asistencia_visitas enable row level security;
drop policy if exists asistencia_visitas_lectura on public.asistencia_visitas;
create policy asistencia_visitas_lectura on public.asistencia_visitas
  for select to authenticated using (private.tiene_permiso('ASISTENCIA', 'LECTURA'));
revoke all on public.asistencia_visitas from anon, authenticated;
grant select on public.asistencia_visitas to authenticated;

drop trigger if exists trg_auditar on public.asistencia_visitas;
create trigger trg_auditar after insert or update or delete on public.asistencia_visitas
  for each row execute function private.auditar('id');
drop trigger if exists trg_normalizar on public.asistencia_visitas;
create trigger trg_normalizar before insert or update on public.asistencia_visitas
  for each row execute function private.normalizar_texto('nombre', 'documento', 'empresa', 'motivo', 'placa', 'nota', 'motivo_anulacion');

do $mapa$
begin
  if to_regclass('public.auditoria_modulos') is null then
    return;
  end if;
  insert into public.auditoria_modulos (tabla, modulo) values ('asistencia_visitas', 'ASISTENCIA')
  on conflict (tabla) do update set modulo = excluded.modulo;
end
$mapa$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. La vista: cada visita con a quién vino a ver y su estado
--
-- El contacto se enlaza por la izquierda: quien no lee Contactos lo ve en
-- blanco, y la visita se ve igual, porque el nombre está en la propia fila.
-- ───────────────────────────────────────────────────────────────────────────
create or replace view public.v_asistencia_visitas
with (security_invoker = on) as
select v.id, v.fecha, v.entrada, v.salida,
       v.nombre, v.documento, v.empresa, v.telefono, v.contacto_id,
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
  left join public.empleados e on e.id = v.visita_a;

revoke all on public.v_asistencia_visitas from public, anon;
grant select on public.v_asistencia_visitas to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Lo que valida cada visita, para no repetirlo en registrar y corregir
-- ───────────────────────────────────────────────────────────────────────────
create or replace function private.visita_de_datos(p_datos jsonb, p_id bigint default null)
returns public.asistencia_visitas
language plpgsql security definer set search_path to ''
as $$
declare
  v public.asistencia_visitas;
  v_contacto record;
  v_cfg record;
  v_abierta record;
begin
  select * into v_cfg from public.asistencia_config where unica;

  v.contacto_id := nullif(p_datos->>'contacto_id', '')::bigint;
  v.visita_a    := nullif(p_datos->>'visita_a', '')::bigint;
  v.nombre      := nullif(btrim(coalesce(p_datos->>'nombre', '')), '');
  v.documento   := nullif(btrim(coalesce(p_datos->>'documento', '')), '');
  v.empresa     := nullif(btrim(coalesce(p_datos->>'empresa', '')), '');
  v.telefono    := nullif(btrim(coalesce(p_datos->>'telefono', '')), '');
  v.motivo      := nullif(btrim(coalesce(p_datos->>'motivo', '')), '');
  v.placa       := nullif(btrim(coalesce(p_datos->>'placa', '')), '');
  v.nota        := nullif(btrim(coalesce(p_datos->>'nota', '')), '');
  v.entrada     := coalesce(nullif(p_datos->>'entrada', '')::timestamptz, now());
  v.salida      := nullif(p_datos->>'salida', '')::timestamptz;

  -- Del directorio: lo que venga en blanco se toma del contacto.
  if v.contacto_id is not null then
    select nombre, documento,
           coalesce(nullif(empresa_nombre, ''), (select razon_social from public.contactos where id = c.empresa_id)) as empresa,
           coalesce(celular, whatsapp, telefono_oficina) as telefono
      into v_contacto
      from public.contactos c where id = v.contacto_id;
    if not found then
      raise exception 'Ese contacto no está en el directorio.' using errcode = 'P0002';
    end if;
    v.nombre    := coalesce(v.nombre, v_contacto.nombre);
    v.documento := coalesce(v.documento, v_contacto.documento);
    v.empresa   := coalesce(v.empresa, v_contacto.empresa);
    v.telefono  := coalesce(v.telefono, v_contacto.telefono);
  end if;

  if v.nombre is null or length(v.nombre) < 3 then
    raise exception 'Falta el nombre del visitante.' using errcode = '22023';
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

  -- El mismo visitante (por documento) no puede estar adentro dos veces.
  if v.salida is null and v.documento is not null then
    select id, entrada into v_abierta
      from public.asistencia_visitas
     where documento = upper(v.documento) and salida is null and anulada_en is null
       and (p_id is null or id <> p_id)
       and now() - entrada <= make_interval(hours => v_cfg.horas_maximas_jornada)
     order by entrada desc limit 1;
    if v_abierta.id is not null then
      raise exception '% ya está adentro desde las %: regístrale la salida antes de otra entrada.',
        v.nombre, to_char(v_abierta.entrada at time zone 'America/Caracas', 'HH24:MI')
        using errcode = '55000';
    end if;
  end if;

  v.fecha := (v.entrada at time zone 'America/Caracas')::date;
  return v;
end;
$$;

revoke all on function private.visita_de_datos(jsonb, bigint) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Registrar, cerrar, corregir y anular
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.registrar_visita(p_datos jsonb)
returns bigint
language plpgsql security definer set search_path to ''
as $$
declare v public.asistencia_visitas; v_id bigint;
begin
  perform private.exigir_permiso('ASISTENCIA', 'ESCRITURA');
  v := private.visita_de_datos(p_datos);
  insert into public.asistencia_visitas
    (fecha, entrada, salida, nombre, documento, empresa, telefono, contacto_id, visita_a, motivo, placa, nota, registrado_por)
  values
    (v.fecha, v.entrada, v.salida, v.nombre, v.documento, v.empresa, v.telefono, v.contacto_id, v.visita_a, v.motivo, v.placa, v.nota,
     (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

-- La salida: la hora de ahora, salvo que se diga otra (para quien se fue y
-- nadie lo anotó en el momento).
create or replace function public.cerrar_visita(p_id bigint, p_salida timestamptz default null)
returns void
language plpgsql security definer set search_path to ''
as $$
declare v_v record; v_salida timestamptz := coalesce(p_salida, now());
begin
  perform private.exigir_permiso('ASISTENCIA', 'ESCRITURA');
  select * into v_v from public.asistencia_visitas where id = p_id for update;
  if v_v.id is null then
    raise exception 'No existe esa visita.' using errcode = 'P0002';
  end if;
  if v_v.anulada_en is not null then
    raise exception 'Esa visita está anulada.' using errcode = '55000';
  end if;
  if v_v.salida is not null then
    raise exception '% ya tiene su salida a las %.', v_v.nombre, to_char(v_v.salida at time zone 'America/Caracas', 'HH24:MI')
      using errcode = '55000';
  end if;
  if v_salida <= v_v.entrada then
    raise exception 'La salida tiene que ser después de la entrada.' using errcode = '22023';
  end if;
  if v_salida - v_v.entrada > interval '24 hours' then
    raise exception 'Esa visita lleva más de 24 horas abierta: corrígela con las horas reales.' using errcode = '22023';
  end if;
  if v_salida > now() + interval '5 minutes' then
    raise exception 'La salida está en el futuro.' using errcode = '22023';
  end if;
  update public.asistencia_visitas set salida = v_salida where id = p_id;
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
         nombre = v.nombre, documento = v.documento, empresa = v.empresa, telefono = v.telefono,
         contacto_id = v.contacto_id, visita_a = v.visita_a, motivo = v.motivo, placa = v.placa, nota = v.nota,
         corregido_por = (select auth.uid()), corregido_en = now()
   where id = p_id;
end;
$$;

create or replace function public.anular_visita(p_id bigint, p_motivo text)
returns void
language plpgsql security definer set search_path to ''
as $$
begin
  perform private.exigir_permiso('ASISTENCIA', 'TOTAL');
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Di por qué se anula.' using errcode = '22023';
  end if;
  update public.asistencia_visitas
     set anulada_en = now(), anulada_por = (select auth.uid()), motivo_anulacion = btrim(p_motivo)
   where id = p_id and anulada_en is null;
  if not found then
    raise exception 'No existe esa visita, o ya estaba anulada.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.registrar_visita(jsonb) from public, anon;
revoke execute on function public.cerrar_visita(bigint, timestamptz) from public, anon;
revoke execute on function public.corregir_visita(bigint, jsonb) from public, anon;
revoke execute on function public.anular_visita(bigint, text) from public, anon;
grant execute on function public.registrar_visita(jsonb) to authenticated;
grant execute on function public.cerrar_visita(bigint, timestamptz) to authenticated;
grant execute on function public.corregir_visita(bigint, jsonb) to authenticated;
grant execute on function public.anular_visita(bigint, text) to authenticated;
