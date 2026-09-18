/*
  EL DESPACHO SE APRUEBA, Y SALE CON CHOFER, CÉDULA Y PLACA

  Angélica, 18/09/2026: «quiero que las notas de entrega lleven igual un nivel
  de autorización. Y además deben ir obligatorio nombre del chofer y vehículo
  con su placa. Esos datos de choferes y vehículos se van a ir convirtiendo en
  un catálogo en el que vas a permitir editar, deshabilitar y agregar datos. Si
  los datos no existen se agregan».

  Y el mismo día: «en el módulo de salidas, despachos, permite añadir 4
  imágenes en formato de imagen o pdf, para adjuntar las fotos de los vehículos
  que se llevarán lo despachado o la salida. Esto no va en el pdf que se
  imprime, pero sí se podrá ver en el histórico, con su trazabilidad».

  CÓMO QUEDA EL DESPACHO

  Igual que la salida de almacén: primero se pide y después se aprueba. Pedir
  no mueve nada. Al aprobar corre el despacho de siempre —el mismo cuerpo, con
  todas sus revisiones de existencia, ticket, guía y patio por renglón— y nace
  la nota de entrega con su número NE.

  Para no reescribir ese cuerpo, que lleva cinco parches encima, se muda entero
  a `private.despachar`: el navegador ya no puede llamarlo, y el único camino a
  una nota es `public.aprobar_despacho`, que exige la casilla
  FACTURACION.APROBAR_DESPACHO. La casilla nace marcada para la gerencia
  general; se presta y se restringe desde Configuración › Usuarios como las
  demás.

  EL CATÁLOGO se llena solo: al pedir un despacho, un chofer que no esté (por su
  cédula) o un vehículo que no esté (por su placa) se añade. Se siembra con lo
  que ya dicen las notas, los tickets, las guías y la flota.

  LOS ADJUNTOS van a un bucket privado aparte, `cargas`. Nunca se borran: quitar
  uno lo marca como quitado, con quién, cuándo y por qué, y sigue a la vista.
*/

-- ===========================================================================
-- 1. Catálogo: choferes
-- ===========================================================================

create table if not exists public.choferes (
  id             bigint generated always as identity primary key,
  nombre         text not null,
  cedula         text not null,
  activo         boolean not null default true,
  creado_por     uuid references auth.users(id) default auth.uid(),
  creado_en      timestamptz not null default now(),
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz,
  constraint chofer_con_nombre check (length(btrim(nombre)) >= 3),
  constraint chofer_con_cedula check (length(btrim(cedula)) >= 5)
);

comment on table public.choferes is
  'Choferes que se llevan material. Se añaden solos al pedir un despacho con '
  'una cedula que no esta. Deshabilitar no borra: deja de ofrecerse.';

-- La cédula se compara sin espacios, puntos ni guiones: «V-15.517.657» y
-- «15517657» son la misma persona.
create or replace function private.cedula_comparable(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(upper(coalesce(p, '')), '^[VEJPG]|[^0-9]', '', 'g')
$$;

create unique index if not exists choferes_cedula_unica
  on public.choferes (private.cedula_comparable(cedula));

-- ===========================================================================
-- 2. Catálogo: vehículos de despacho
-- ===========================================================================

/*
  No es la flota. La flota (`public.vehiculos`) son los camiones de la casa, con
  capacidad, mantenimiento y hoja de vida. Aquí entra cualquier camión que se
  lleve material, casi siempre del cliente: basta la placa y qué vehículo es.
*/
create table if not exists public.vehiculos_de_despacho (
  id             bigint generated always as identity primary key,
  placa          text not null,
  descripcion    text,
  activo         boolean not null default true,
  creado_por     uuid references auth.users(id) default auth.uid(),
  creado_en      timestamptz not null default now(),
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz,
  constraint vehiculo_despacho_placa check (length(placa) >= 4)
);

comment on table public.vehiculos_de_despacho is
  'Vehiculos que se llevan material: placa y marca/modelo. Se anaden solos al '
  'pedir un despacho con una placa que no esta. No es la flota.';

create or replace function private.placa_limpia(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(btrim(coalesce(p, '')), '[\s-]+', '', 'g'))
$$;

create or replace function private.normalizar_vehiculo_de_despacho()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.placa := private.placa_limpia(new.placa);
  return new;
end;
$$;

drop trigger if exists vehiculos_de_despacho_placa on public.vehiculos_de_despacho;
create trigger vehiculos_de_despacho_placa before insert or update on public.vehiculos_de_despacho
  for each row execute function private.normalizar_vehiculo_de_despacho();

create unique index if not exists vehiculos_de_despacho_placa_unica
  on public.vehiculos_de_despacho (placa);

-- ===========================================================================
-- 3. Lectura, auditoría y normalización de los dos catálogos
-- ===========================================================================

alter table public.choferes enable row level security;
alter table public.vehiculos_de_despacho enable row level security;

drop policy if exists choferes_lectura on public.choferes;
create policy choferes_lectura on public.choferes
  for select to authenticated
  using (private.tiene_permiso('FACTURACION', 'LECTURA')
         or private.tiene_permiso('DESPACHOS', 'LECTURA')
         or private.tiene_permiso('SALIDAS', 'LECTURA'));

drop policy if exists vehiculos_de_despacho_lectura on public.vehiculos_de_despacho;
create policy vehiculos_de_despacho_lectura on public.vehiculos_de_despacho
  for select to authenticated
  using (private.tiene_permiso('FACTURACION', 'LECTURA')
         or private.tiene_permiso('DESPACHOS', 'LECTURA')
         or private.tiene_permiso('SALIDAS', 'LECTURA'));

revoke all on public.choferes, public.vehiculos_de_despacho from anon, authenticated;
grant select on public.choferes, public.vehiculos_de_despacho to authenticated;

drop trigger if exists trg_auditar on public.choferes;
create trigger trg_auditar after insert or update or delete on public.choferes
  for each row execute function private.auditar('id');
drop trigger if exists trg_normalizar on public.choferes;
create trigger trg_normalizar before insert or update on public.choferes
  for each row execute function private.normalizar_texto('nombre', 'cedula');

drop trigger if exists trg_auditar on public.vehiculos_de_despacho;
create trigger trg_auditar after insert or update or delete on public.vehiculos_de_despacho
  for each row execute function private.auditar('id');
drop trigger if exists trg_normalizar on public.vehiculos_de_despacho;
create trigger trg_normalizar before insert or update on public.vehiculos_de_despacho
  for each row execute function private.normalizar_texto('descripcion');

-- ===========================================================================
-- 4. Se siembra el catálogo con lo que ya existe
-- ===========================================================================

insert into public.vehiculos_de_despacho (placa, descripcion, creado_por)
select distinct on (private.placa_limpia(x.placa)) x.placa, x.descripcion, null::uuid
  from (
    select v.placa, nullif(btrim(coalesce(v.descripcion, v.tipo)), '') as descripcion, 1 as orden
      from public.vehiculos v
    union all
    select n.vehiculo, null, 2 from public.notas_entrega n where n.vehiculo is not null
    union all
    select t.vehiculo, null, 3 from public.romana_tickets t where t.vehiculo is not null
    union all
    select g.vehiculo, null, 4 from public.guias_movilizacion g where g.vehiculo is not null
  ) x
 where length(private.placa_limpia(x.placa)) >= 4
 order by private.placa_limpia(x.placa), x.orden
on conflict do nothing;

insert into public.choferes (nombre, cedula, creado_por)
select distinct on (private.cedula_comparable(x.cedula)) x.nombre, x.cedula, null::uuid
  from (
    select n.chofer as nombre, n.cedula_chofer as cedula, n.despachada_en as cuando
      from public.notas_entrega n
    union all
    select t.chofer, t.cedula_chofer, now() from public.romana_tickets t
    union all
    select g.chofer, g.cedula_chofer, now() from public.guias_movilizacion g
  ) x
 where length(btrim(coalesce(x.nombre, ''))) >= 3
   and length(private.cedula_comparable(x.cedula)) >= 5
 order by private.cedula_comparable(x.cedula), x.cuando desc
on conflict do nothing;

-- ===========================================================================
-- 5. Guardar en el catálogo (añadir, editar, deshabilitar)
-- ===========================================================================

create or replace function public.guardar_chofer(
  p_id     bigint,
  p_nombre text,
  p_cedula text,
  p_activo boolean default true
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   bigint;
  v_otro public.choferes;
begin
  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');

  if length(btrim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'El nombre del chofer lleva al menos tres letras.' using errcode = '22023';
  end if;
  if length(private.cedula_comparable(p_cedula)) < 5 then
    raise exception 'La cédula del chofer no está completa.' using errcode = '22023';
  end if;

  select * into v_otro from public.choferes
   where private.cedula_comparable(cedula) = private.cedula_comparable(p_cedula)
     and id is distinct from p_id;
  if found then
    raise exception 'Esa cédula ya es de % en el catálogo.', v_otro.nombre using errcode = '23505';
  end if;

  if p_id is null then
    insert into public.choferes (nombre, cedula, activo)
    values (btrim(p_nombre), btrim(p_cedula), coalesce(p_activo, true))
    returning id into v_id;
  else
    update public.choferes
       set nombre = btrim(p_nombre), cedula = btrim(p_cedula), activo = coalesce(p_activo, true),
           actualizado_por = (select auth.uid()), actualizado_en = now()
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Ese chofer no existe.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end;
$$;

create or replace function public.guardar_vehiculo_de_despacho(
  p_id          bigint,
  p_placa       text,
  p_descripcion text,
  p_activo      boolean default true
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

  if length(private.placa_limpia(p_placa)) < 4 then
    raise exception 'La placa lleva al menos cuatro caracteres.' using errcode = '22023';
  end if;

  if exists (select 1 from public.vehiculos_de_despacho
              where placa = private.placa_limpia(p_placa) and id is distinct from p_id) then
    raise exception 'La placa % ya está en el catálogo.', private.placa_limpia(p_placa)
      using errcode = '23505';
  end if;

  if p_id is null then
    insert into public.vehiculos_de_despacho (placa, descripcion, activo)
    values (p_placa, nullif(btrim(coalesce(p_descripcion, '')), ''), coalesce(p_activo, true))
    returning id into v_id;
  else
    update public.vehiculos_de_despacho
       set placa = p_placa, descripcion = nullif(btrim(coalesce(p_descripcion, '')), ''),
           activo = coalesce(p_activo, true),
           actualizado_por = (select auth.uid()), actualizado_en = now()
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Ese vehículo no existe.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.guardar_chofer(bigint, text, text, boolean) from public, anon;
grant execute on function public.guardar_chofer(bigint, text, text, boolean) to authenticated, service_role;
revoke all on function public.guardar_vehiculo_de_despacho(bigint, text, text, boolean) from public, anon;
grant execute on function public.guardar_vehiculo_de_despacho(bigint, text, text, boolean) to authenticated, service_role;

-- ===========================================================================
-- 6. La casilla de aprobar
-- ===========================================================================

insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente, activa)
values ('FACTURACION.APROBAR_DESPACHO', 'FACTURACION', 'Aprobar los despachos',
        'Un despacho pedido no saca material ni tiene nota de entrega hasta que '
        'alguien con esta casilla lo aprueba.', 5, null, true)
on conflict (codigo) do update
  set modulo = excluded.modulo, nombre = excluded.nombre, dice = excluded.dice,
      orden = excluded.orden, nivel_equivalente = excluded.nivel_equivalente,
      activa = excluded.activa;

insert into public.rol_acciones (rol, accion)
values ('GERENTE_GENERAL', 'FACTURACION.APROBAR_DESPACHO')
on conflict do nothing;

-- ===========================================================================
-- 7. El despacho de siempre pasa a ser privado
-- ===========================================================================

/*
  Mismo cuerpo, mismo nombre, otro esquema. PostgREST solo publica `public`,
  así que desde el navegador ya no se puede sacar material sin aprobación.
  Quien aprueba lo llama desde dentro de la base.
*/
do $mudanza$
begin
  if to_regprocedure('public.despachar(bigint, bigint, jsonb, character, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text, bigint, bigint)') is not null then
    alter function public.despachar(bigint, bigint, jsonb, character, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text, bigint, bigint)
      set schema private;
  end if;
end
$mudanza$;

-- ===========================================================================
-- 8. La solicitud de despacho
-- ===========================================================================

create table if not exists public.solicitudes_despacho (
  id              bigint generated always as identity primary key,
  numero          text not null unique,
  cliente_id      bigint not null references public.clientes(id),
  almacen_id      bigint not null references public.almacenes(id),
  renglones       jsonb not null,
  moneda          char(3),
  cotizacion_id   bigint,
  vehiculo        text not null,
  vehiculo_despacho_id bigint references public.vehiculos_de_despacho(id),
  chofer          text not null,
  cedula_chofer   text not null,
  chofer_id       bigint references public.choferes(id),
  peso_bruto      numeric(20, 4),
  peso_tara       numeric(20, 4),
  ticket          text,
  ticket_id       bigint references public.romana_tickets(id),
  guia_id         bigint references public.guias_movilizacion(id),
  descuento       numeric(20, 4) not null default 0,
  flete           numeric(20, 4) not null default 0,
  observacion     text,
  estado          text not null default 'PEDIDA'
                    check (estado in ('PEDIDA', 'APROBADA', 'RECHAZADA', 'CANCELADA')),
  pedida_por      uuid references auth.users(id) default auth.uid(),
  pedida_en       timestamptz not null default now(),
  resuelta_por    uuid references auth.users(id),
  resuelta_en     timestamptz,
  motivo_cierre   text,
  nota_id         bigint unique references public.notas_entrega(id),
  constraint despacho_aprobado_con_nota check ((estado = 'APROBADA') = (nota_id is not null)),
  constraint despacho_con_renglones check (jsonb_typeof(renglones) = 'array' and jsonb_array_length(renglones) > 0)
);

comment on table public.solicitudes_despacho is
  'Un despacho pedido. No mueve material: al aprobarlo corre private.despachar y '
  'nace la nota de entrega (nota_id).';

create index if not exists solicitudes_despacho_estado on public.solicitudes_despacho (estado, pedida_en desc);

alter table public.solicitudes_despacho enable row level security;
drop policy if exists solicitudes_despacho_lectura on public.solicitudes_despacho;
create policy solicitudes_despacho_lectura on public.solicitudes_despacho
  for select to authenticated using (private.tiene_permiso('FACTURACION', 'LECTURA'));
revoke all on public.solicitudes_despacho from anon, authenticated;
grant select on public.solicitudes_despacho to authenticated;

drop trigger if exists trg_auditar on public.solicitudes_despacho;
create trigger trg_auditar after insert or update or delete on public.solicitudes_despacho
  for each row execute function private.auditar('id');
drop trigger if exists trg_normalizar on public.solicitudes_despacho;
create trigger trg_normalizar before insert or update on public.solicitudes_despacho
  for each row execute function private.normalizar_texto('vehiculo', 'chofer', 'cedula_chofer', 'ticket', 'observacion', 'motivo_cierre');

-- Un chofer o un vehículo que no esté, se añade. Uno deshabilitado no se usa.
create or replace function private.chofer_del_despacho(p_nombre text, p_cedula text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.choferes;
begin
  select * into v from public.choferes
   where private.cedula_comparable(cedula) = private.cedula_comparable(p_cedula);
  if found then
    if not v.activo then
      raise exception 'El chofer % (%) está deshabilitado en el catálogo.', v.nombre, v.cedula
        using errcode = '55000';
    end if;
    return v.id;
  end if;
  insert into public.choferes (nombre, cedula) values (btrim(p_nombre), btrim(p_cedula))
  returning id into v.id;
  return v.id;
end;
$$;

create or replace function private.vehiculo_del_despacho(p_placa text, p_descripcion text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vehiculos_de_despacho;
begin
  select * into v from public.vehiculos_de_despacho where placa = private.placa_limpia(p_placa);
  if found then
    if not v.activo then
      raise exception 'El vehículo % está deshabilitado en el catálogo.', v.placa
        using errcode = '55000';
    end if;
    if v.descripcion is null and nullif(btrim(coalesce(p_descripcion, '')), '') is not null then
      update public.vehiculos_de_despacho set descripcion = btrim(p_descripcion) where id = v.id;
    end if;
    return v.id;
  end if;
  insert into public.vehiculos_de_despacho (placa, descripcion)
  values (p_placa, nullif(btrim(coalesce(p_descripcion, '')), ''))
  returning id into v.id;
  return v.id;
end;
$$;

revoke all on function private.chofer_del_despacho(text, text) from public, anon, authenticated;
revoke all on function private.vehiculo_del_despacho(text, text) from public, anon, authenticated;

create or replace function public.solicitar_despacho(
  p_cliente_id    bigint,
  p_almacen_id    bigint,
  p_renglones     jsonb,
  p_vehiculo      text,
  p_chofer        text,
  p_cedula_chofer text,
  p_vehiculo_descripcion text default null,
  p_moneda        character default null,
  p_cotizacion_id bigint default null,
  p_peso_bruto    numeric default null,
  p_peso_tara     numeric default null,
  p_ticket        text default null,
  p_descuento     numeric default 0,
  p_flete         numeric default 0,
  p_observacion   text default null,
  p_ticket_id     bigint default null,
  p_guia_id       bigint default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero  text;
  v_cliente text;
begin
  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');

  select nombre into v_cliente from public.clientes where id = p_cliente_id;
  if not found then
    raise exception 'Ese cliente no existe.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.almacenes where id = p_almacen_id and activo) then
    raise exception 'Ese patio no existe o está cerrado.' using errcode = 'P0002';
  end if;
  if p_renglones is null or jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El despacho no lleva material.' using errcode = '22023';
  end if;

  -- Los tres datos del camión, obligatorios.
  if length(private.placa_limpia(p_vehiculo)) < 4 then
    raise exception 'Falta la placa del vehículo.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_chofer, ''))) < 3 then
    raise exception 'Falta el nombre del chofer.' using errcode = '22023';
  end if;
  if length(private.cedula_comparable(p_cedula_chofer)) < 5 then
    raise exception 'Falta la cédula del chofer.' using errcode = '22023';
  end if;

  v_numero := private.siguiente_numero('SD');

  insert into public.solicitudes_despacho (
    numero, cliente_id, almacen_id, renglones, moneda, cotizacion_id,
    vehiculo, vehiculo_despacho_id, chofer, cedula_chofer, chofer_id,
    peso_bruto, peso_tara, ticket, ticket_id, guia_id, descuento, flete, observacion
  ) values (
    v_numero, p_cliente_id, p_almacen_id, p_renglones, p_moneda, p_cotizacion_id,
    private.placa_limpia(p_vehiculo), private.vehiculo_del_despacho(p_vehiculo, p_vehiculo_descripcion),
    btrim(p_chofer), btrim(p_cedula_chofer), private.chofer_del_despacho(p_chofer, p_cedula_chofer),
    p_peso_bruto, p_peso_tara, nullif(btrim(coalesce(p_ticket, '')), ''), p_ticket_id, p_guia_id,
    coalesce(p_descuento, 0), coalesce(p_flete, 0), nullif(btrim(coalesce(p_observacion, '')), '')
  );

  perform private.notificar(
    'FACTURACION', 'DESPACHO_PEDIDO',
    'Despacho por aprobar ' || v_numero,
    v_cliente || ' · ' || private.placa_limpia(p_vehiculo) || ' · ' || btrim(p_chofer),
    '/app/facturacion/notas-entrega', array['GERENTE_GENERAL'], 'INFO');

  return v_numero;
end;
$$;

create or replace function public.aprobar_despacho(p_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  s      public.solicitudes_despacho;
  v_nota bigint;
begin
  perform private.exigir_accion('FACTURACION.APROBAR_DESPACHO');

  select * into s from public.solicitudes_despacho where id = p_id for update;
  if not found then
    raise exception 'Ese despacho no existe.' using errcode = 'P0002';
  end if;
  if s.estado <> 'PEDIDA' then
    raise exception 'El despacho % ya no está esperando aprobación.', s.numero using errcode = '55000';
  end if;

  -- El despacho de siempre: revisa existencias, ticket y guía, y rebaja el patio.
  v_nota := private.despachar(
    s.cliente_id, s.almacen_id, s.renglones, s.moneda, s.cotizacion_id,
    s.vehiculo, s.chofer, s.cedula_chofer, s.peso_bruto, s.peso_tara, s.ticket,
    0, s.descuento, s.flete, null, s.observacion, s.ticket_id, s.guia_id);

  update public.solicitudes_despacho
     set estado = 'APROBADA', nota_id = v_nota,
         resuelta_por = (select auth.uid()), resuelta_en = now()
   where id = p_id;

  return v_nota;
end;
$$;

create or replace function public.rechazar_despacho(p_id bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.solicitudes_despacho;
begin
  perform private.exigir_accion('FACTURACION.APROBAR_DESPACHO');
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué no se aprueba.' using errcode = '22023';
  end if;

  select * into s from public.solicitudes_despacho where id = p_id for update;
  if not found then
    raise exception 'Ese despacho no existe.' using errcode = 'P0002';
  end if;
  if s.estado <> 'PEDIDA' then
    raise exception 'El despacho % ya no está esperando aprobación.', s.numero using errcode = '55000';
  end if;

  update public.solicitudes_despacho
     set estado = 'RECHAZADA', motivo_cierre = btrim(p_motivo),
         resuelta_por = (select auth.uid()), resuelta_en = now()
   where id = p_id;
end;
$$;

create or replace function public.cancelar_despacho(p_id bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.solicitudes_despacho;
begin
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se cancela.' using errcode = '22023';
  end if;

  select * into s from public.solicitudes_despacho where id = p_id for update;
  if not found then
    raise exception 'Ese despacho no existe.' using errcode = 'P0002';
  end if;
  if s.estado <> 'PEDIDA' then
    raise exception 'El despacho % ya no está esperando aprobación.', s.numero using errcode = '55000';
  end if;
  if s.pedida_por is distinct from (select auth.uid())
     and not private.tiene_permiso('FACTURACION', 'TOTAL') then
    raise exception 'Solo quien lo pidió puede cancelarlo.' using errcode = '42501';
  end if;

  update public.solicitudes_despacho
     set estado = 'CANCELADA', motivo_cierre = btrim(p_motivo),
         resuelta_por = (select auth.uid()), resuelta_en = now()
   where id = p_id;
end;
$$;

create or replace function public.puedo_aprobar_despachos()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.puede_accion('FACTURACION.APROBAR_DESPACHO')
$$;

revoke all on function public.solicitar_despacho(bigint, bigint, jsonb, text, text, text, text, character, bigint, numeric, numeric, text, numeric, numeric, text, bigint, bigint) from public, anon;
grant execute on function public.solicitar_despacho(bigint, bigint, jsonb, text, text, text, text, character, bigint, numeric, numeric, text, numeric, numeric, text, bigint, bigint) to authenticated, service_role;
revoke all on function public.aprobar_despacho(bigint) from public, anon;
grant execute on function public.aprobar_despacho(bigint) to authenticated, service_role;
revoke all on function public.rechazar_despacho(bigint, text) from public, anon;
grant execute on function public.rechazar_despacho(bigint, text) to authenticated, service_role;
revoke all on function public.cancelar_despacho(bigint, text) from public, anon;
grant execute on function public.cancelar_despacho(bigint, text) to authenticated, service_role;
revoke all on function public.puedo_aprobar_despachos() from public, anon;
grant execute on function public.puedo_aprobar_despachos() to authenticated, service_role;

/*
  La vista: cada renglón con el nombre del material. El precio solo lo ve quien
  ve los montos de ventas o de facturación, igual que en v_notas_entrega.
*/
create or replace view public.v_solicitudes_despacho with (security_invoker = on) as
select
  s.id, s.numero, s.estado, s.cliente_id, c.nombre as cliente, c.rif as cliente_rif,
  s.almacen_id, a.nombre as almacen, s.moneda,
  s.vehiculo, vd.descripcion as vehiculo_descripcion, s.chofer, s.cedula_chofer,
  s.ticket, s.peso_bruto, s.peso_tara, s.flete, s.observacion,
  s.pedida_por, s.pedida_en, s.resuelta_por, s.resuelta_en, s.motivo_cierre,
  s.nota_id, n.numero as nota_numero,
  (select coalesce(jsonb_agg(
            (case when private.puede_accion('VENTAS.VER_VENTAS')
                    or private.puede_accion('FACTURACION.VER_FACTURACION')
                  then r.valor else r.valor - 'precio_unitario' end)
            || jsonb_build_object('articulo', ar.nombre)
            order by r.orden), '[]'::jsonb)
     from jsonb_array_elements(s.renglones) with ordinality as r(valor, orden)
     left join public.articulos ar on ar.id = (r.valor ->> 'articulo_id')::bigint
  ) as renglones
from public.solicitudes_despacho s
join public.clientes c on c.id = s.cliente_id
join public.almacenes a on a.id = s.almacen_id
left join public.vehiculos_de_despacho vd on vd.id = s.vehiculo_despacho_id
left join public.notas_entrega n on n.id = s.nota_id;

grant select on public.v_solicitudes_despacho to authenticated;

-- ===========================================================================
-- 9. Fotos y papeles de la carga (hasta cuatro por salida o despacho)
-- ===========================================================================

create table if not exists public.fotos_de_carga (
  id             bigint generated always as identity primary key,
  origen         text not null check (origen in ('SALIDA', 'DESPACHO')),
  referencia     text not null,
  path           text not null,
  nombre         text,
  tipo           text not null check (tipo in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  tamano         integer,
  subida_por     uuid references auth.users(id) default auth.uid(),
  subida_en      timestamptz not null default now(),
  quitada_por    uuid references auth.users(id),
  quitada_en     timestamptz,
  motivo_quitada text,
  constraint foto_quitada_con_motivo check ((quitada_en is null) = (motivo_quitada is null))
);

comment on table public.fotos_de_carga is
  'Fotos o PDF del vehiculo que se lleva una salida (SS-...) o un despacho (SD-...). '
  'No van en el papel impreso. No se borran: quitar deja rastro.';

create index if not exists fotos_de_carga_referencia on public.fotos_de_carga (origen, referencia);

alter table public.fotos_de_carga enable row level security;
drop policy if exists fotos_de_carga_lectura on public.fotos_de_carga;
create policy fotos_de_carga_lectura on public.fotos_de_carga
  for select to authenticated
  using ((origen = 'SALIDA' and private.tiene_permiso('SALIDAS', 'LECTURA'))
      or (origen = 'DESPACHO' and private.tiene_permiso('FACTURACION', 'LECTURA')));
revoke all on public.fotos_de_carga from anon, authenticated;
grant select on public.fotos_de_carga to authenticated;

drop trigger if exists trg_auditar on public.fotos_de_carga;
create trigger trg_auditar after insert or update or delete on public.fotos_de_carga
  for each row execute function private.auditar('id');

create or replace function private.exigir_escribir_carga(p_origen text, p_referencia text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_origen = 'SALIDA' then
    perform private.exigir_permiso('SALIDAS', 'ESCRITURA');
    if not exists (select 1 from public.solicitudes_salida where numero = p_referencia) then
      raise exception 'La salida % no existe.', p_referencia using errcode = 'P0002';
    end if;
  elsif p_origen = 'DESPACHO' then
    perform private.exigir_permiso('FACTURACION', 'ESCRITURA');
    if not exists (select 1 from public.solicitudes_despacho where numero = p_referencia) then
      raise exception 'El despacho % no existe.', p_referencia using errcode = 'P0002';
    end if;
  else
    raise exception 'Origen desconocido: %', p_origen using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.exigir_escribir_carga(text, text) from public, anon, authenticated;

create or replace function public.adjuntar_foto_de_carga(
  p_origen     text,
  p_referencia text,
  p_path       text,
  p_nombre     text,
  p_tipo       text,
  p_tamano     integer default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform private.exigir_escribir_carga(p_origen, p_referencia);

  if p_path is null or p_path not like lower(p_origen) || '/%' then
    raise exception 'La ruta del archivo no es de este sitio.' using errcode = '22023';
  end if;

  -- Una a la vez por salida o despacho: dos personas subiendo a la vez no pasan de cuatro.
  perform pg_advisory_xact_lock(hashtext('fotos_de_carga:' || p_origen || ':' || p_referencia));

  if (select count(*) from public.fotos_de_carga
       where origen = p_origen and referencia = p_referencia and quitada_en is null) >= 4 then
    raise exception 'Ya tiene cuatro archivos. Quita uno para añadir otro.' using errcode = '23514';
  end if;

  insert into public.fotos_de_carga (origen, referencia, path, nombre, tipo, tamano)
  values (p_origen, p_referencia, p_path, nullif(btrim(coalesce(p_nombre, '')), ''), p_tipo, p_tamano)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.quitar_foto_de_carga(p_id bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.fotos_de_carga;
begin
  select * into f from public.fotos_de_carga where id = p_id for update;
  if not found then
    raise exception 'Ese archivo no existe.' using errcode = 'P0002';
  end if;
  perform private.exigir_escribir_carga(f.origen, f.referencia);
  if f.quitada_en is not null then
    raise exception 'Ese archivo ya se quitó.' using errcode = '55000';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se quita.' using errcode = '22023';
  end if;

  update public.fotos_de_carga
     set quitada_por = (select auth.uid()), quitada_en = now(), motivo_quitada = btrim(p_motivo)
   where id = p_id;
end;
$$;

revoke all on function public.adjuntar_foto_de_carga(text, text, text, text, text, integer) from public, anon;
grant execute on function public.adjuntar_foto_de_carga(text, text, text, text, text, integer) to authenticated, service_role;
revoke all on function public.quitar_foto_de_carga(bigint, text) from public, anon;
grant execute on function public.quitar_foto_de_carga(bigint, text) to authenticated, service_role;

-- El bucket: privado, 10 MB por archivo, imágenes y PDF. Sin borrar ni reemplazar.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cargas', 'cargas', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists cargas_lectura on storage.objects;
drop policy if exists cargas_escritura on storage.objects;

create policy cargas_lectura on storage.objects
  for select to authenticated
  using (bucket_id = 'cargas'
         and (private.tiene_permiso('SALIDAS', 'LECTURA') or private.tiene_permiso('FACTURACION', 'LECTURA')));

create policy cargas_escritura on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cargas'
              and ((name like 'salida/%' and private.tiene_permiso('SALIDAS', 'ESCRITURA'))
                or (name like 'despacho/%' and private.tiene_permiso('FACTURACION', 'ESCRITURA'))));

-- ===========================================================================
-- 10. Mapa de auditoría y tiempo real
-- ===========================================================================

do $mapa$
begin
  if to_regclass('public.auditoria_modulos') is null then
    return;
  end if;
  insert into public.auditoria_modulos (tabla, modulo) values
    ('choferes', 'FACTURACION'),
    ('vehiculos_de_despacho', 'FACTURACION'),
    ('solicitudes_despacho', 'FACTURACION'),
    ('fotos_de_carga', 'FACTURACION')
  on conflict (tabla) do update set modulo = excluded.modulo;
end
$mapa$;

do $vivo$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['solicitudes_despacho', 'fotos_de_carga', 'choferes', 'vehiculos_de_despacho'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$vivo$;

-- ===========================================================================
-- 11. Comprobación
-- ===========================================================================

do $ver$
begin
  if to_regprocedure('public.despachar(bigint, bigint, jsonb, character, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text, bigint, bigint)') is not null then
    raise exception 'public.despachar sigue publicado: el despacho se saltaría la aprobación.';
  end if;
  if to_regprocedure('private.despachar(bigint, bigint, jsonb, character, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text, bigint, bigint)') is null then
    raise exception 'private.despachar no existe: aprobar no tendría con qué despachar.';
  end if;
  if not exists (select 1 from public.acciones where codigo = 'FACTURACION.APROBAR_DESPACHO') then
    raise exception 'Falta la casilla FACTURACION.APROBAR_DESPACHO.';
  end if;
end
$ver$;
