-- ═══════════════════════════════════════════════════════════════════════════
-- CONTROL DE DESPACHO: LA PLANILLA QUE MIRA Y NO TOCA
--
-- Christopher, 21/09/2026: «un módulo que reciba información pero no envíe
-- nada». Es la planilla de Excel que lleva a mano —fecha, cliente, RIF,
-- material, m³, precio, monto, status, observaciones— con la mitad izquierda
-- llenándose sola desde las notas de entrega y las notas de salida.
--
-- LO QUE HACE QUE «NO ENVÍE NADA»: este módulo tiene sus propias tablas y sus
-- propias funciones, y NINGUNA escribe en notas_entrega, en el inventario, en
-- clientes ni en nada de otro módulo. Lee por una vista y escribe solo lo suyo.
--
-- Y UNA COSA QUE LA PLANILLA DE EXCEL HACE A MANO Y AQUÍ SALE SOLA: enseñar
-- TODOS los números de la serie, sin saltos. Donde el Excel escribe «SISTEMA»
-- —la NE-2026-0004 y la NE-2026-0007, que fueron pruebas y se borraron— esto
-- dice «sin documento». Un número que falta sin explicación es un despacho que
-- pudo salir sin registrarse: ese es el control de verdad de esta planilla.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. El módulo, con su permiso propio
--
-- Aparte de DESPACHOS, que es romana y guías: quien lleva esta planilla no
-- tiene por qué ver el pesaje, ni al revés.
-- ───────────────────────────────────────────────────────────────────────────
insert into public.modulos (codigo, nombre, descripcion, orden) values
  ('CONTROL_DESPACHO', 'Control de despacho',
   'La planilla de lo despachado: lo que sale de las notas, y el precio, el estado y las observaciones que se llevan a mano.',
   45)
on conflict (codigo) do update
  set nombre = excluded.nombre, descripcion = excluded.descripcion, orden = excluded.orden;

-- Nadie lo ve hasta que se reparta. ADMIN pasa siempre por private.tiene_permiso.
insert into public.rol_permisos (rol, modulo, nivel)
select r.codigo, 'CONTROL_DESPACHO', case when r.codigo = 'ADMIN' then 'TOTAL' else 'NINGUNO' end
from public.roles r
on conflict (rol, modulo) do nothing;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Los estados, que los lleva Christopher
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.control_despacho_estados (
  codigo    text primary key,
  nombre    text not null,
  orden     smallint not null default 100,
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);

comment on table public.control_despacho_estados is
  'Lo que puede decir la columna STATUS. Lista editable: empieza con la que ya usa el Excel.';

insert into public.control_despacho_estados (codigo, nombre, orden) values
  ('CONTADO',    'CONTADO',    10),
  ('CRUCE',      'CRUCE',      20),
  ('AUTORIZADO', 'AUTORIZADO', 30)
on conflict (codigo) do nothing;

alter table public.control_despacho_estados enable row level security;
drop policy if exists control_despacho_estados_lectura on public.control_despacho_estados;
create policy control_despacho_estados_lectura on public.control_despacho_estados
  for select to authenticated
  using (private.tiene_permiso('CONTROL_DESPACHO', 'LECTURA'));
revoke all on public.control_despacho_estados from anon, authenticated;
grant select on public.control_despacho_estados to authenticated;

drop trigger if exists trg_auditar on public.control_despacho_estados;
create trigger trg_auditar after insert or update or delete on public.control_despacho_estados
  for each row execute function private.auditar('codigo');
drop trigger if exists trg_normalizar on public.control_despacho_estados;
create trigger trg_normalizar before insert or update on public.control_despacho_estados
  for each row execute function private.normalizar_texto('nombre');

-- ───────────────────────────────────────────────────────────────────────────
-- 3. A quién se refiere el nombre escrito en una salida
--
-- El destino de una salida es texto libre, y así viene escrito: «SR. MANUEL
-- GONZALEZ», «SRTA. MAITE BLANCO», «FERRETERIA OSMAIRA.». Ninguno coincide
-- con el nombre del cliente, de modo que el RIF —que Christopher quiere
-- obligatorio— habría que teclearlo siempre.
--
-- Se resuelve una vez por nombre: se dice a qué cliente corresponde y desde
-- ahí el RIF sale solo. NO toca la tabla de clientes: solo apunta a ella.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.control_despacho_clientes (
  destino    text primary key,
  cliente_id bigint not null references public.clientes(id),
  creado_por uuid references auth.users(id),
  creado_en  timestamptz not null default now()
);

comment on table public.control_despacho_clientes is
  'El nombre escrito a mano en una salida y a qué cliente registrado corresponde. Se dice una vez; después el RIF sale solo.';

alter table public.control_despacho_clientes enable row level security;
drop policy if exists control_despacho_clientes_lectura on public.control_despacho_clientes;
create policy control_despacho_clientes_lectura on public.control_despacho_clientes
  for select to authenticated
  using (private.tiene_permiso('CONTROL_DESPACHO', 'LECTURA'));
revoke all on public.control_despacho_clientes from anon, authenticated;
grant select on public.control_despacho_clientes to authenticated;

drop trigger if exists trg_auditar on public.control_despacho_clientes;
create trigger trg_auditar after insert or update or delete on public.control_despacho_clientes
  for each row execute function private.auditar('destino');

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Lo que se escribe a mano, y nada más
--
-- Una fila por renglón de nota de entrega o por asiento de nota de salida. Lo
-- demás —fecha, cliente, material, cantidad— NO se copia aquí: se lee de su
-- nota cada vez, así que si la nota se corrige, la planilla se corrige sola.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.control_despacho (
  id             bigint generated always as identity primary key,
  origen         text not null check (origen in ('NOTA_ENTREGA', 'NOTA_SALIDA')),
  renglon_id     bigint unique references public.nota_entrega_renglones(id) on delete cascade,
  movimiento_id  bigint unique references public.inventario_movimientos(id) on delete cascade,
  rif            text,
  precio_usd     numeric(20,6) check (precio_usd is null or precio_usd >= 0),
  estado_control text references public.control_despacho_estados(codigo),
  observacion    text,
  extra          text,
  registrado_por uuid references auth.users(id),
  registrado_en  timestamptz not null default now(),
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz,
  constraint control_despacho_cuelga_de_su_origen check (
    (origen = 'NOTA_ENTREGA' and renglon_id is not null and movimiento_id is null) or
    (origen = 'NOTA_SALIDA'  and movimiento_id is not null and renglon_id is null))
);

comment on table public.control_despacho is
  'Solo lo que se llena a mano en la planilla de control: RIF, precio, estado, observación y la columna libre. Nada más se guarda aquí.';

alter table public.control_despacho enable row level security;
drop policy if exists control_despacho_lectura on public.control_despacho;
create policy control_despacho_lectura on public.control_despacho
  for select to authenticated
  using (private.tiene_permiso('CONTROL_DESPACHO', 'LECTURA'));
revoke all on public.control_despacho from anon, authenticated;
grant select on public.control_despacho to authenticated;

drop trigger if exists trg_auditar on public.control_despacho;
create trigger trg_auditar after insert or update or delete on public.control_despacho
  for each row execute function private.auditar('id');
drop trigger if exists trg_normalizar on public.control_despacho;
create trigger trg_normalizar before insert or update on public.control_despacho
  for each row execute function private.normalizar_texto('rif', 'observacion', 'extra');

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Cómo se llama la columna libre
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.control_despacho_config (
  unica         boolean primary key default true check (unica),
  columna_libre text not null default 'Otra'
);
insert into public.control_despacho_config (unica) values (true) on conflict do nothing;

alter table public.control_despacho_config enable row level security;
drop policy if exists control_despacho_config_lectura on public.control_despacho_config;
create policy control_despacho_config_lectura on public.control_despacho_config
  for select to authenticated
  using (private.tiene_permiso('CONTROL_DESPACHO', 'LECTURA'));
revoke all on public.control_despacho_config from anon, authenticated;
grant select on public.control_despacho_config to authenticated;

do $mapa$
begin
  if to_regclass('public.auditoria_modulos') is null then
    return;
  end if;
  insert into public.auditoria_modulos (tabla, modulo) values
    ('control_despacho', 'CONTROL_DESPACHO'),
    ('control_despacho_estados', 'CONTROL_DESPACHO'),
    ('control_despacho_clientes', 'CONTROL_DESPACHO'),
    ('control_despacho_config', 'CONTROL_DESPACHO')
  on conflict (tabla) do update set modulo = excluded.modulo;
end
$mapa$;
