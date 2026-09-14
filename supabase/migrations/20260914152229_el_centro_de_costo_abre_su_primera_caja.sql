/*
  EL CENTRO DE COSTO ABRE SU PRIMERA CAJA.

  Christopher, 14/09/2026: «se necesita algo así para la cantera […] que el
  centro de costo exista y se enlace con lo que hace falta […] para que dé el
  monto con el que sería facturación, para saber la tasa referencial a la que
  se va a vender».

  Es el libro de caja de la cantera, con el modelo del centro de costo de
  Golden Touch: una caja abierta a la vez, lo que viene de otros módulos se
  copia al aceptarlo, y el cierre congela una foto. El diseño entero está en
  docs/superpowers/specs/2026-09-14-centro-de-costo-design.md.

  ═══════════════════════════════════════════════════════════════════════════
  POR QUÉ HAY LIBRO PROPIO, SI EN AGOSTO SE DIJO QUE NO
  ═══════════════════════════════════════════════════════════════════════════

  `20260824160000` decidió que `tesoreria_movimientos` era el acumulador único
  de gastos y que un libro paralelo sería «dos respuestas a la misma pregunta».
  La premisa no se cumplió: el rol de tesorería se retiró el 25/08 y el libro
  tiene cero filas. Por eso este módulo tiene el suyo, y el centro de costos
  viejo de Compras se retira entero en una pieza posterior. Queda una sola
  respuesta.

  Esta pieza es la primera de siete: el módulo, sus permisos y las cajas.

  ═══════════════════════════════════════════════════════════════════════════
  EL SALDO INICIAL ES UN ATRIBUTO, NO UNA FILA
  ═══════════════════════════════════════════════════════════════════════════

  GT arrastra el saldo metiendo en la caja nueva una fila «Saldo anterior» como
  si alguien hubiera entregado ese dinero, y su trigger de deuda la suma. Aquí
  la caja nace con `saldo_inicial_usd` y ninguna suma de entregas lo ve.
*/

-- ---------------------------------------------------------------------------
-- 1. El módulo y sus tres niveles
-- ---------------------------------------------------------------------------
insert into public.modulos (codigo, nombre, descripcion, orden) values
  ('COSTOS', 'Centro de costo',
   'Lo que entra para operar, lo que cuesta producir y a cuánto sale el metro cúbico.', 25)
on conflict (codigo) do update
  set nombre = excluded.nombre,
      descripcion = excluded.descripcion,
      orden = excluded.orden;

insert into public.rol_permisos (rol, modulo, nivel)
select r.codigo, 'COSTOS', 'NINGUNO' from public.roles r
on conflict (rol, modulo) do nothing;

update public.rol_permisos set nivel = 'TOTAL'
 where modulo = 'COSTOS' and rol in ('ADMIN', 'GERENTE_GENERAL');

-- El gerente acepta viajes y ve el costo por m³, y las dos cosas llevan el
-- precio del viaje dentro. Sin esta casilla vería el módulo con el dinero en
-- blanco.
insert into public.rol_acciones (rol, accion)
values ('GERENTE_GENERAL', 'EXPLOTACION.VER_PAGO_VIAJES')
on conflict (rol, accion) do nothing;

insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente)
values
  ('COSTOS.ACEPTAR', 'COSTOS',
   'Aceptar lo que entra al libro',
   'Copia al libro un viaje, una salida de planta o un gasto fijo que esta por '
   'aceptar. Para aceptar el precio de un viaje hace falta ademas la casilla '
   'de ver el pago de viajes.',
   10, 'ESCRITURA'),
  ('COSTOS.RECHAZAR', 'COSTOS',
   'Rechazar lo que no es costo',
   'Deja fuera del libro algo que estaba por aceptar, con motivo. Se puede '
   'deshacer mientras la caja siga abierta, y deshacerlo pide Total.',
   20, 'ESCRITURA'),
  ('COSTOS.GASTO_MANUAL', 'COSTOS',
   'Anotar un gasto suelto',
   'Comida, viaticos, permisos: lo que ningun modulo registra. La categoria es '
   'opcional; sin ella sale como sin clasificar.',
   30, 'ESCRITURA'),
  ('COSTOS.FONDO', 'COSTOS',
   'Registrar dinero entregado o devuelto',
   'Una entrega de la casa matriz o de un socio, o un abono que la devuelve. '
   'Mueve el fondo, no el costo.',
   40, 'TOTAL'),
  ('COSTOS.CERRAR_CAJA', 'COSTOS',
   'Cerrar la caja y abrir la siguiente',
   'Congela la foto de la caja —costo, m3, costo por m3— y abre la siguiente '
   'con el saldo arrastrado. No se puede reabrir.',
   50, 'TOTAL'),
  ('COSTOS.DESHACER_RECHAZO', 'COSTOS',
   'Deshacer un rechazo',
   'Vuelve a poner por aceptar algo que se rechazo, mientras la caja siga '
   'abierta. Queda quien lo deshizo y cuando.',
   60, 'TOTAL'),
  ('COSTOS.CATALOGOS', 'COSTOS',
   'Editar los catalogos del centro de costo',
   'Los origenes del fondo, los gastos fijos que se repiten cada caja y el '
   'corte mensual.',
   70, 'TOTAL')
on conflict (codigo) do update
  set modulo = excluded.modulo,
      nombre = excluded.nombre,
      dice = excluded.dice,
      orden = excluded.orden,
      nivel_equivalente = excluded.nivel_equivalente;

-- ---------------------------------------------------------------------------
-- 2. Las cajas
-- ---------------------------------------------------------------------------
create extension if not exists btree_gist with schema extensions;

create table if not exists public.costo_cajas (
  id                bigint generated always as identity primary key,
  numero            integer not null unique check (numero > 0),
  nombre            text,
  fecha_inicio      date not null,
  fecha_fin         date,
  estado            text not null default 'ABIERTA' check (estado in ('ABIERTA', 'CERRADA')),
  saldo_inicial_usd numeric(16,2) not null default 0,
  resumen_json      jsonb,
  abierta_por       uuid references auth.users(id),
  abierta_en        timestamptz not null default now(),
  cerrada_por       uuid references auth.users(id),
  cerrada_en        timestamptz,

  constraint costo_caja_cerrada_con_fin check ((estado = 'CERRADA') = (fecha_fin is not null)),
  constraint costo_caja_fin_tras_inicio check (fecha_fin is null or fecha_fin >= fecha_inicio),

  -- Las cajas no se pisan. Que tampoco dejen huecos lo garantiza el cierre,
  -- que abre la siguiente en fecha_fin + 1.
  constraint costo_cajas_sin_solape exclude using gist (
    daterange(fecha_inicio, coalesce(fecha_fin, date '9999-12-31'), '[]') with &&
  )
);

-- Una sola abierta, y que lo diga la base y no solo el RPC.
create unique index if not exists costo_cajas_una_abierta
  on public.costo_cajas ((1)) where estado = 'ABIERTA';

comment on table public.costo_cajas is
  'Un periodo del centro de costo. Una abierta a la vez; al cerrar se congela '
  'la foto en resumen_json y se abre la siguiente con el saldo arrastrado. No '
  'se reabre: lo que llegue despues entra en la abierta como llegado tarde.';

comment on column public.costo_cajas.saldo_inicial_usd is
  'Lo que quedo de la caja anterior. Es un atributo y no una fila del libro: '
  'ninguna suma de entregas lo ve.';

comment on column public.costo_cajas.resumen_json is
  'La foto del cierre, tal como la devolvio costo_resumen_caja en ese momento. '
  'El PDF y el historico leen de aqui, nunca recalculan.';

alter table public.costo_cajas enable row level security;

drop policy if exists costo_cajas_lectura on public.costo_cajas;
create policy costo_cajas_lectura on public.costo_cajas
  for select to authenticated
  using (private.tiene_permiso('COSTOS', 'LECTURA'));

revoke all on public.costo_cajas from anon, authenticated;
grant select on public.costo_cajas to authenticated;

-- Regla de la casa: toda tabla nueva lleva sus dos disparadores.
drop trigger if exists trg_auditar on public.costo_cajas;
create trigger trg_auditar after insert or update or delete on public.costo_cajas
  for each row execute function private.auditar('id');

drop trigger if exists trg_normalizar on public.costo_cajas;
create trigger trg_normalizar before insert or update on public.costo_cajas
  for each row execute function private.normalizar_texto('nombre');

-- ---------------------------------------------------------------------------
-- 3. La configuración del módulo, en su propia tabla
--
-- No va en `empresa` porque esa tabla es fiscal (RIF, IVA, imprenta) y esto es
-- una preferencia de cómo se corta el costo.
-- ---------------------------------------------------------------------------
create table if not exists public.costo_configuracion (
  id            boolean primary key default true check (id),
  corte_mensual boolean not null default false,
  cambiado_por  uuid references auth.users(id),
  cambiado_en   timestamptz not null default now()
);

insert into public.costo_configuracion (id) values (true) on conflict (id) do nothing;

comment on table public.costo_configuracion is
  'Una sola fila. corte_mensual: al cerrar, la pantalla propone el ultimo dia '
  'del mes y avisa si se elige otra fecha. Un solo calendario, no dos.';

alter table public.costo_configuracion enable row level security;

drop policy if exists costo_configuracion_lectura on public.costo_configuracion;
create policy costo_configuracion_lectura on public.costo_configuracion
  for select to authenticated
  using (private.tiene_permiso('COSTOS', 'LECTURA'));

revoke all on public.costo_configuracion from anon, authenticated;
grant select on public.costo_configuracion to authenticated;

drop trigger if exists trg_auditar on public.costo_configuracion;
create trigger trg_auditar after insert or update or delete on public.costo_configuracion
  for each row execute function private.auditar('id');

do $mapa$
begin
  if to_regclass('public.auditoria_modulos') is null then
    raise notice 'auditoria_modulos todavia no existe en esta base: el mapa de modulo se salta.';
    return;
  end if;

  insert into public.auditoria_modulos (tabla, modulo)
  values ('costo_cajas', 'COSTOS'), ('costo_configuracion', 'COSTOS')
  on conflict (tabla) do update set modulo = excluded.modulo;
end
$mapa$;

-- ---------------------------------------------------------------------------
-- 4. La caja abierta, con o sin cerrojo
--
-- Todo lo que escribe en el libro pasa por aquí con `p_bloquear = true`: el
-- `for update` serializa aceptar, reversar y cerrar sobre la misma fila, así
-- que quien llega segundo ve la caja ya cerrada y actúa en consecuencia.
-- ---------------------------------------------------------------------------
create or replace function private.costo_caja_abierta(p_bloquear boolean default false)
returns public.costo_cajas
language plpgsql
security definer
set search_path to ''
as $$
declare v_caja public.costo_cajas;
begin
  if p_bloquear then
    select * into v_caja from public.costo_cajas where estado = 'ABIERTA' for update;
  else
    select * into v_caja from public.costo_cajas where estado = 'ABIERTA';
  end if;

  if v_caja.id is null then
    raise exception 'No hay ninguna caja abierta.'
      using errcode = '55000',
            hint = 'Abre la primera caja desde el centro de costo.';
  end if;

  return v_caja;
end;
$$;

comment on function private.costo_caja_abierta(boolean) is
  'La caja abierta. Con p_bloquear toma el cerrojo de fila: aceptar, reversar '
  'y cerrar se serializan sobre ella.';

-- ---------------------------------------------------------------------------
-- 5. Abrir la primera
--
-- Solo cuando no hay ninguna abierta. Las siguientes las abre el cierre.
-- ---------------------------------------------------------------------------
create or replace function public.costo_abrir_primera_caja(
  p_fecha_inicio  date,
  p_nombre        text default null,
  p_saldo_inicial numeric default 0
) returns bigint
language plpgsql security definer set search_path to ''
as $$
declare v_id bigint;
begin
  perform private.exigir_accion('COSTOS.CERRAR_CAJA');

  if exists (select 1 from public.costo_cajas where estado = 'ABIERTA') then
    raise exception 'Ya hay una caja abierta.' using errcode = '55000';
  end if;

  if p_fecha_inicio is null or p_fecha_inicio > private.hoy_aqui() then
    raise exception 'La fecha de inicio no puede ir en blanco ni ser del futuro.'
      using errcode = '22023';
  end if;

  insert into public.costo_cajas (numero, nombre, fecha_inicio, saldo_inicial_usd, abierta_por)
  values (
    (select coalesce(max(numero), 0) + 1 from public.costo_cajas),
    nullif(btrim(coalesce(p_nombre, '')), ''),
    p_fecha_inicio,
    coalesce(p_saldo_inicial, 0),
    (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.costo_abrir_primera_caja(date, text, numeric) is
  'Abre una caja cuando no hay ninguna abierta. Las demas las abre el cierre '
  'de la anterior.';

create or replace function public.costo_configurar(p_corte_mensual boolean)
returns void
language plpgsql security definer set search_path to ''
as $$
begin
  perform private.exigir_accion('COSTOS.CATALOGOS');

  update public.costo_configuracion
     set corte_mensual = coalesce(p_corte_mensual, false),
         cambiado_por  = (select auth.uid()),
         cambiado_en   = now()
   where id;
end;
$$;

revoke execute on function public.costo_abrir_primera_caja(date, text, numeric) from public, anon;
grant  execute on function public.costo_abrir_primera_caja(date, text, numeric) to authenticated;

revoke execute on function public.costo_configurar(boolean) from public, anon;
grant  execute on function public.costo_configurar(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. La lente
-- ---------------------------------------------------------------------------
create or replace view public.v_costo_cajas
with (security_invoker = on) as
select
  c.id, c.numero, c.nombre, c.fecha_inicio, c.fecha_fin, c.estado,
  c.saldo_inicial_usd, c.resumen_json,
  c.abierta_en, c.cerrada_en,
  pa.nombre as abierta_por_nombre,
  pc.nombre as cerrada_por_nombre
from public.costo_cajas c
left join public.perfiles pa on pa.id = c.abierta_por
left join public.perfiles pc on pc.id = c.cerrada_por;

grant select on public.v_costo_cajas to authenticated;
