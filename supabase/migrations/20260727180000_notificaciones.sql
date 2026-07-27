-- ============================================================================
-- Notificaciones
--
-- Una notificación no se dirige a una persona sino a un ROL: "hay un pedido
-- por confirmar" le toca a compras, sea quien sea el que esté de turno. Si se
-- dirigiera a personas, cada vez que alguien cambia de puesto habría que
-- reasignar avisos a mano, y el día que esa persona falta el aviso no llega a
-- nadie.
--
-- De ahí que la lectura sea una tabla aparte: el mismo aviso lo pueden leer
-- tres personas, y que una lo lea no lo apaga para las otras.
--
-- Todas las notificaciones salen de `private.anotar`, la función por la que ya
-- pasa cada cambio de estado. Así ningún camino puede mover un documento sin
-- avisar: no hay que acordarse de notificar, ocurre solo.
-- ============================================================================

create table if not exists public.notificaciones (
  id          bigint generated always as identity primary key,

  modulo      text not null check (modulo in
                ('COMPRAS', 'INVENTARIO', 'NOMINA', 'TESORERIA', 'VENTAS', 'SISTEMA')),
  tipo        text not null,

  titulo      text not null,
  detalle     text,

  -- A dónde lleva el clic. Una notificación que no se puede abrir obliga a
  -- buscar el documento a mano, que es justo lo que venía a evitar.
  ruta        text,

  -- Roles a los que va dirigida. Vacío significa "a todo el mundo".
  roles       text[] not null default '{}',

  importancia text not null default 'INFO'
              check (importancia in ('INFO', 'ATENCION', 'URGENTE')),

  actor_id    uuid references auth.users(id),
  creada_en   timestamptz not null default now()
);

create index if not exists notificaciones_recientes_idx on public.notificaciones (creada_en desc);
create index if not exists notificaciones_roles_idx on public.notificaciones using gin (roles);

create table if not exists public.notificaciones_leidas (
  notificacion_id bigint not null references public.notificaciones(id) on delete cascade,
  usuario_id      uuid   not null references auth.users(id) on delete cascade,
  leida_en        timestamptz not null default now(),
  primary key (notificacion_id, usuario_id)
);

-- ---------------------------------------------------------------------------
-- Emisión
-- ---------------------------------------------------------------------------
create or replace function private.notificar(
  p_modulo      text,
  p_tipo        text,
  p_titulo      text,
  p_detalle     text default null,
  p_ruta        text default null,
  p_roles       text[] default '{}',
  p_importancia text default 'INFO'
)
returns bigint
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.notificaciones
    (modulo, tipo, titulo, detalle, ruta, roles, importancia, actor_id)
  values
    (p_modulo, p_tipo, p_titulo, nullif(trim(coalesce(p_detalle, '')), ''),
     p_ruta, coalesce(p_roles, '{}'), p_importancia, (select auth.uid()))
  returning id;
$$;

-- ---------------------------------------------------------------------------
-- Cada cambio de estado deja bitácora y avisa a quien le toca actuar
--
-- Sustituye a la versión anterior, que solo escribía la bitácora. Los estados
-- que no le piden nada a nadie —un borrador, una cotización cargada— no
-- generan aviso: una bandeja con ruido se deja de mirar.
-- ---------------------------------------------------------------------------
create or replace function private.anotar(
  p_tipo   text,
  p_id     bigint,
  p_ant    text,
  p_nuevo  text,
  p_nota   text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_solicitud   bigint;
  v_numero      text;
  v_titulo      text;
  v_proveedor   text;
  v_total_usd   numeric;
  v_aviso       text;
  v_detalle     text;
  v_roles       text[];
  v_importancia text := 'INFO';
begin
  insert into public.compras_bitacora
    (documento_tipo, documento_id, estado_anterior, estado_nuevo, nota, actor_id)
  values
    (p_tipo, p_id, p_ant, p_nuevo, nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()));

  -- ¿A qué compra pertenece el documento que se movió?
  if p_tipo = 'SOLICITUD' then
    v_solicitud := p_id;
  elsif p_tipo = 'ORDEN' then
    select o.solicitud_id into v_solicitud from public.ordenes_compra o where o.id = p_id;
  elsif p_tipo = 'PAGO' then
    select o.solicitud_id into v_solicitud
    from public.instrucciones_pago i
    join public.ordenes_compra o on o.id = i.orden_id
    where i.id = p_id;
  else
    return;
  end if;

  if v_solicitud is null then
    return;
  end if;

  select s.numero, s.titulo, p.nombre, o.total_usd
    into v_numero, v_titulo, v_proveedor, v_total_usd
  from public.solicitudes_pedido s
  left join public.ordenes_compra o on o.solicitud_id = s.id and o.estado <> 'CANCELADA'
  left join public.proveedores p on p.id = o.proveedor_id
  where s.id = v_solicitud;

  case p_nuevo
    when 'PEDIDO' then
      v_aviso := 'Nuevo pedido de compra';
      v_roles := array['COMPRAS'];

    when 'CONFIRMADA' then
      v_aviso := 'Pedido confirmado: hay que cotizar';
      v_roles := array['COMPRAS'];

    when 'POR_CONFIRMAR_GERENTE' then
      v_aviso := 'Compra esperando aprobación de gerencia';
      v_roles := array['GERENTE_GENERAL'];
      v_importancia := 'ATENCION';

    when 'APROBADA' then
      v_aviso := 'Compra aprobada por gerencia';
      v_roles := array['COMPRAS'];

    when 'POR_INDICAR_PAGO' then
      v_aviso := 'Orden de compra sin método de pago';
      v_roles := array['COMPRAS'];

    when 'EN_TESORERIA' then
      v_aviso := 'Pago por ejecutar';
      v_roles := array['TESORERIA'];
      v_importancia := 'ATENCION';

    when 'PAGADA_POR_RECIBIR' then
      v_aviso := 'Compra pagada: pendiente por recepcionar';
      v_roles := array['ALMACEN', 'COMPRAS'];

    when 'RECIBIDA' then
      v_aviso := 'Material recibido';
      v_roles := array['COMPRAS'];

    when 'RECIBIDA_PARCIAL' then
      v_aviso := 'Material recibido en parte';
      v_roles := array['COMPRAS'];

    when 'CANCELADA' then
      v_aviso := 'Compra cancelada';
      v_roles := array['COMPRAS', 'GERENTE_GENERAL'];

    when 'PROVEEDOR_DESISTIO' then
      v_aviso := 'El proveedor desistió: hay dinero pagado sin material';
      v_roles := array['GERENTE_GENERAL', 'TESORERIA'];
      v_importancia := 'URGENTE';

    when 'DEVUELTA' then
      v_aviso := 'Tesorería devolvió el pago a compras';
      v_roles := array['COMPRAS'];
      v_importancia := 'ATENCION';

    else
      -- Borradores, cotizaciones cargadas y resoluciones de desistimiento no
      -- le piden nada a nadie: quedan en la bitácora y ahí se consultan.
      return;
  end case;

  v_detalle := format('%s · %s', v_numero, v_titulo);

  if v_proveedor is not null then
    v_detalle := v_detalle || format(' · %s', v_proveedor);
  end if;

  if v_total_usd is not null then
    v_detalle := v_detalle || format(' · $ %s', trim(to_char(v_total_usd, 'FM999G999G990D00')));
  end if;

  if nullif(trim(coalesce(p_nota, '')), '') is not null then
    v_detalle := v_detalle || format(' — «%s»', trim(p_nota));
  end if;

  perform private.notificar(
    'COMPRAS', 'COMPRA_' || p_nuevo, v_aviso, v_detalle,
    '/app/compras/' || v_solicitud, v_roles, v_importancia);
end;
$$;

-- ---------------------------------------------------------------------------
-- Lectura
-- ---------------------------------------------------------------------------
create or replace function public.marcar_notificacion_leida(p_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Sesión no válida.' using errcode = '28000';
  end if;

  insert into public.notificaciones_leidas (notificacion_id, usuario_id)
  values (p_id, v_uid)
  on conflict do nothing;
end;
$$;

create or replace function public.marcar_notificaciones_leidas()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_roles text[];
  v_n integer;
begin
  if v_uid is null then
    raise exception 'Sesión no válida.' using errcode = '28000';
  end if;

  v_roles := private.roles_actuales();

  insert into public.notificaciones_leidas (notificacion_id, usuario_id)
  select n.id, v_uid
  from public.notificaciones n
  where (cardinality(n.roles) = 0
         or n.roles && v_roles
         or 'ADMIN' = any(v_roles))
  on conflict do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lo que ve cada quien
-- ---------------------------------------------------------------------------
create or replace view public.v_mis_notificaciones
with (security_invoker = on) as
select
  n.id,
  n.modulo,
  n.tipo,
  n.titulo,
  n.detalle,
  n.ruta,
  n.importancia,
  n.creada_en,
  n.actor_id,
  per.nombre as actor,
  (l.notificacion_id is not null) as leida
from public.notificaciones n
left join public.perfiles per on per.id = n.actor_id
left join public.notificaciones_leidas l
       on l.notificacion_id = n.id and l.usuario_id = (select auth.uid());

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
alter table public.notificaciones        enable row level security;
alter table public.notificaciones_leidas enable row level security;

revoke insert, update, delete on public.notificaciones        from anon, authenticated;
revoke insert, update, delete on public.notificaciones_leidas from anon, authenticated;

grant select on public.notificaciones        to authenticated;
grant select on public.notificaciones_leidas to authenticated;
grant select on public.v_mis_notificaciones  to authenticated;

-- `public.mis_roles()` en vez de la función del esquema privado: la política
-- se evalúa con los permisos de quien consulta, y `private` no está a su
-- alcance. Envuelta en `select` para que Postgres la resuelva una vez por
-- consulta y no una vez por fila.
drop policy if exists notificaciones_lectura on public.notificaciones;
create policy notificaciones_lectura on public.notificaciones
  for select to authenticated
  -- `@> array['ADMIN']` y no `'ADMIN' = any(...)`: con un subconsulta, `any`
  -- se interpreta como la forma que compara contra filas, no contra los
  -- elementos de un arreglo, y la consulta ni siquiera compila.
  using (
    cardinality(roles) = 0
    or roles && (select public.mis_roles())
    or (select public.mis_roles()) @> array['ADMIN']::text[]
  );

drop policy if exists notificaciones_leidas_lectura on public.notificaciones_leidas;
create policy notificaciones_leidas_lectura on public.notificaciones_leidas
  for select to authenticated
  using (usuario_id = (select auth.uid()));

revoke execute on function public.marcar_notificacion_leida(bigint) from public, anon;
grant   execute on function public.marcar_notificacion_leida(bigint) to authenticated;
revoke execute on function public.marcar_notificaciones_leidas() from public, anon;
grant   execute on function public.marcar_notificaciones_leidas() to authenticated;
