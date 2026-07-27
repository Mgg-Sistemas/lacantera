-- ============================================================================
-- Quién pide no siempre es quién teclea
--
-- Hasta ahora el pedido guardaba una sola persona: la que había iniciado
-- sesión. En la cantera eso casi nunca es cierto. El mecánico que necesita la
-- muela no tiene usuario, ni computadora en el frente; llama por radio y
-- alguien en la oficina carga el pedido por él. El sistema anotaba a quien
-- tecleó y perdía a quien pidió, que es justo la persona a la que hay que
-- preguntarle si llega otra cosa o si el precio no cuadra.
--
-- Se separan las dos:
--
--   registrada_por      quien lo cargó en el sistema. Es responsabilidad de
--                       operación: quién puede editar el borrador, quién puede
--                       cancelarlo sin ser de compras.
--   solicitante_id      quien lo pidió, cuando tiene usuario.
--   solicitante_nombre  quien lo pidió, cuando no lo tiene. Un nombre escrito
--                       a mano vale más que un campo vacío.
--
-- La columna vieja se renombra en lugar de dejarla como está: llamarla
-- `solicitante_id` cuando guarda al que teclea sería mentir en el nombre, y
-- alguien la leería mal dentro de seis meses.
-- ============================================================================

alter table public.solicitudes_pedido
  rename column solicitante_id to registrada_por;

alter table public.solicitudes_pedido
  add column if not exists solicitante_id     uuid references public.perfiles(id),
  add column if not exists solicitante_nombre text,
  add column if not exists solicitante_cargo  text;

-- Los pedidos que ya existen se cargaron cuando el sistema no distinguía: quien
-- tecleó era, por definición, quien pedía. Se deja escrito así en vez de dejar
-- el campo vacío, que sugeriría que no se sabe.
update public.solicitudes_pedido
   set solicitante_id = registrada_por
 where solicitante_id is null and solicitante_nombre is null;

alter table public.solicitudes_pedido
  drop constraint if exists solicitudes_solicitante_uno;
alter table public.solicitudes_pedido
  add constraint solicitudes_solicitante_uno
  check (num_nonnulls(solicitante_id, nullif(trim(coalesce(solicitante_nombre, '')), '')) = 1);

-- El cargo describe a la persona escrita a mano ("mecánico", "frente 3"). Para
-- alguien con usuario, el cargo ya está en su perfil y repetirlo aquí solo
-- crearía dos versiones que se contradicen.
alter table public.solicitudes_pedido
  drop constraint if exists solicitudes_solicitante_cargo;
alter table public.solicitudes_pedido
  add constraint solicitudes_solicitante_cargo
  check (solicitante_cargo is null or solicitante_nombre is not null);

create index if not exists solicitudes_pedidas_por_idx
  on public.solicitudes_pedido (solicitante_id, creada_en desc);

-- ---------------------------------------------------------------------------
-- Validación compartida
--
-- Crear y editar exigen lo mismo, y si la regla viviera dos veces, un día
-- serían dos reglas distintas.
-- ---------------------------------------------------------------------------
create or replace function private.normalizar_solicitante(
  p_id     uuid,
  p_nombre text,
  p_cargo  text,
  out o_id     uuid,
  out o_nombre text,
  out o_cargo  text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  o_nombre := nullif(trim(coalesce(p_nombre, '')), '');
  o_cargo  := nullif(trim(coalesce(p_cargo, '')), '');
  o_id     := p_id;

  -- Un usuario elegido gana sobre un nombre escrito: si están los dos, es que
  -- la pantalla dejó el texto de antes al cambiar de opción.
  if o_id is not null then
    o_nombre := null;
    o_cargo  := null;

    if not exists (select 1 from public.perfiles where id = o_id and activo) then
      raise exception 'Quien solicita no existe o está inactivo.' using errcode = '22023';
    end if;
    return;
  end if;

  if o_nombre is null then
    raise exception 'Indica quién solicita: elige a alguien del sistema o escribe su nombre.'
      using errcode = '22023';
  end if;

  if length(o_nombre) < 3 then
    raise exception 'El nombre de quien solicita es demasiado corto para identificar a nadie.'
      using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Crear y editar el pedido
-- ---------------------------------------------------------------------------
drop function if exists public.crear_pedido(text, text, jsonb, text, date, text, boolean);

create or replace function public.crear_pedido(
  p_titulo             text,
  p_justificacion      text,
  p_renglones          jsonb,
  p_prioridad          text default 'NORMAL',
  p_requerida_para     date default null,
  p_destino            text default null,
  p_enviar             boolean default true,
  p_solicitante_id     uuid default null,
  p_solicitante_nombre text default null,
  p_solicitante_cargo  text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id  bigint;
  v_sol record;
begin
  perform private.exigir_rol('SOLICITANTE', 'COMPRAS', 'OPERACIONES', 'ALMACEN', 'RRHH');

  if length(trim(coalesce(p_titulo, ''))) < 4 then
    raise exception 'Ponle un título al pedido: es lo que se lee en el tablero.' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_justificacion, ''))) < 10 then
    raise exception 'Explica para qué es. Quien aprueba no está en el frente y necesita el porqué.'
      using errcode = '22023';
  end if;

  -- Sin indicación, pide quien carga. Es lo más común y ahorra un clic.
  select * into v_sol from private.normalizar_solicitante(
    coalesce(p_solicitante_id,
             case when nullif(trim(coalesce(p_solicitante_nombre, '')), '') is null
                  then (select auth.uid()) end),
    p_solicitante_nombre, p_solicitante_cargo);

  insert into public.solicitudes_pedido
    (numero, titulo, justificacion, prioridad, requerida_para, destino, estado,
     registrada_por, solicitante_id, solicitante_nombre, solicitante_cargo, enviada_en)
  values
    (private.siguiente_numero('SOL'), trim(p_titulo), trim(p_justificacion),
     coalesce(p_prioridad, 'NORMAL'), p_requerida_para,
     nullif(trim(coalesce(p_destino, '')), ''),
     case when p_enviar then 'PEDIDO' else 'BORRADOR' end,
     (select auth.uid()), v_sol.o_id, v_sol.o_nombre, v_sol.o_cargo,
     case when p_enviar then now() end)
  returning id into v_id;

  perform private.escribir_renglones(v_id, p_renglones);
  perform private.anotar('SOLICITUD', v_id, null,
    case when p_enviar then 'PEDIDO' else 'BORRADOR' end);

  return v_id;
end;
$$;

drop function if exists public.actualizar_pedido(bigint, text, text, jsonb, text, date, text);

create or replace function public.actualizar_pedido(
  p_id                 bigint,
  p_titulo             text,
  p_justificacion      text,
  p_renglones          jsonb,
  p_prioridad          text default 'NORMAL',
  p_requerida_para     date default null,
  p_destino            text default null,
  p_solicitante_id     uuid default null,
  p_solicitante_nombre text default null,
  p_solicitante_cargo  text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_estado text;
  v_dueno  uuid;
  v_sol    record;
begin
  select estado, registrada_por into v_estado, v_dueno
  from public.solicitudes_pedido where id = p_id;

  if v_estado is null then
    raise exception 'No existe el pedido %.', p_id using errcode = 'P0002';
  end if;

  if v_estado <> 'BORRADOR' then
    raise exception 'El pedido ya fue enviado y no se puede editar. Cancélalo y crea otro.'
      using errcode = '55000';
  end if;

  if v_dueno <> (select auth.uid()) and not private.tiene_rol('COMPRAS') then
    raise exception 'Solo quien creó el borrador puede editarlo.' using errcode = '42501';
  end if;

  select * into v_sol from private.normalizar_solicitante(
    coalesce(p_solicitante_id,
             case when nullif(trim(coalesce(p_solicitante_nombre, '')), '') is null
                  then v_dueno end),
    p_solicitante_nombre, p_solicitante_cargo);

  update public.solicitudes_pedido set
    titulo = trim(p_titulo),
    justificacion = trim(p_justificacion),
    prioridad = coalesce(p_prioridad, 'NORMAL'),
    requerida_para = p_requerida_para,
    destino = nullif(trim(coalesce(p_destino, '')), ''),
    solicitante_id = v_sol.o_id,
    solicitante_nombre = v_sol.o_nombre,
    solicitante_cargo = v_sol.o_cargo
  where id = p_id;

  perform private.escribir_renglones(p_id, p_renglones);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancelar
--
-- El cuerpo de plpgsql se resuelve al ejecutarse, no al crearse: si esta
-- función siguiera diciendo `solicitante_id`, tras el renombrado leería la
-- columna nueva —quien pidió— creyendo leer la vieja, y le daría permiso de
-- cancelar a la persona equivocada sin fallar en ningún momento.
-- ---------------------------------------------------------------------------
create or replace function public.cancelar_pedido(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_estado text;
  v_dueno  uuid;
  v_pidio  uuid;
begin
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe por qué se cancela. Sin motivo, dentro de un mes nadie sabrá qué pasó.'
      using errcode = '22023';
  end if;

  select estado, registrada_por, solicitante_id into v_estado, v_dueno, v_pidio
  from public.solicitudes_pedido where id = p_id;

  if v_estado is null then
    raise exception 'No existe el pedido %.', p_id using errcode = 'P0002';
  end if;

  if v_estado in ('APROBADA', 'CANCELADA') then
    raise exception 'Un pedido en "%" ya no se cancela desde aquí. Si ya hay orden de compra, cancélala en la orden.', v_estado
      using errcode = '55000';
  end if;

  -- Quien pidió y quien cargó pueden arrepentirse; compras puede cerrar lo que
  -- no procede.
  if (select auth.uid()) not in (v_dueno, coalesce(v_pidio, v_dueno)) then
    perform private.exigir_rol('COMPRAS');
  end if;

  update public.solicitudes_pedido
     set estado = 'CANCELADA',
         motivo_cancelacion = trim(p_motivo),
         cancelada_por = (select auth.uid()),
         cancelada_en = now()
   where id = p_id;

  perform private.anotar('SOLICITUD', p_id, v_estado, 'CANCELADA', p_motivo);
end;
$$;

-- ---------------------------------------------------------------------------
-- Vista del tablero
--
-- Se recrea entera en vez de reemplazarse: una vista guarda la referencia a la
-- columna por número interno, así que tras el renombrado seguiría sirviendo la
-- columna vieja bajo el nombre viejo, sin avisar de nada.
--
-- `solicitante` es lo que se lee en la tarjeta y ahora resuelve el nombre
-- venga de donde venga: del perfil de quien pidió, del texto escrito a mano,
-- o —para lo cargado antes de esta separación— de quien lo registró.
-- ---------------------------------------------------------------------------
drop view if exists public.v_compras_tablero;

create view public.v_compras_tablero
with (security_invoker = on) as
select
  s.id                       as solicitud_id,
  s.numero,
  s.titulo,
  s.prioridad,
  s.requerida_para,
  s.destino,
  s.estado                   as estado_solicitud,
  s.creada_en,
  s.solicitante_id,
  coalesce(pide.nombre, s.solicitante_nombre, per.nombre) as solicitante,
  coalesce(pide.cargo, s.solicitante_cargo)               as solicitante_cargo,
  s.registrada_por,
  per.nombre                 as registrada_por_nombre,
  o.id                       as orden_id,
  o.numero                   as orden_numero,
  o.estado                   as estado_orden,
  o.fecha_pago,
  o.entrega_estimada,
  o.desistio_resolucion,

  coalesce(prov_o.nombre, prov_c.nombre) as proveedor,
  coalesce(o.moneda, cot.moneda)         as moneda,
  coalesce(o.total, cot.total)           as total,
  coalesce(o.total_usd, cot.total_usd)   as total_usd,
  coalesce(o.total_bs, cot.total_bs)     as total_bs,

  (select count(*) from public.cotizaciones c where c.solicitud_id = s.id) as cotizaciones,
  (select count(*) from public.solicitud_renglones r where r.solicitud_id = s.id) as renglones,

  case when o.fecha_pago is not null and o.estado in
            ('PAGADA_POR_RECIBIR', 'RECIBIDA_PARCIAL', 'PROVEEDOR_DESISTIO')
       then current_date - o.fecha_pago end as dias_sin_recibir,

  case
    when s.estado in ('BORRADOR', 'PEDIDO')     then 'PEDIDO'
    when s.estado = 'CONFIRMADA'                then 'CONFIRMADA'
    when s.estado = 'POR_CONFIRMAR_GERENTE'     then 'GERENTE'
    when s.estado = 'CANCELADA'                 then 'CANCELADA'
    when o.estado = 'CANCELADA'                 then 'CANCELADA'
    when o.estado = 'PROVEEDOR_DESISTIO'        then 'DESISTIO'
    when o.estado in ('POR_INDICAR_PAGO', 'EN_TESORERIA')       then 'APROBADA'
    when o.estado in ('PAGADA_POR_RECIBIR', 'RECIBIDA_PARCIAL') then 'PAGADA'
    when o.estado = 'RECIBIDA'                  then 'RECIBIDA'
  end as columna
from public.solicitudes_pedido s
left join public.perfiles per  on per.id  = s.registrada_por
left join public.perfiles pide on pide.id = s.solicitante_id

left join lateral (
  select oc.*
  from public.ordenes_compra oc
  where oc.solicitud_id = s.id
  order by (oc.estado = 'CANCELADA'), oc.id desc
  limit 1
) o on true

left join public.cotizaciones cot on cot.id = s.cotizacion_elegida_id
left join public.proveedores prov_o on prov_o.id = o.proveedor_id
left join public.proveedores prov_c on prov_c.id = cot.proveedor_id;

grant select on public.v_compras_tablero to authenticated;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
do $$
declare
  v_firma text;
begin
  foreach v_firma in array array[
    'public.crear_pedido(text, text, jsonb, text, date, text, boolean, uuid, text, text)',
    'public.actualizar_pedido(bigint, text, text, jsonb, text, date, text, uuid, text, text)',
    'public.cancelar_pedido(bigint, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_firma);
    execute format('grant execute on function %s to authenticated', v_firma);
  end loop;
end
$$;
