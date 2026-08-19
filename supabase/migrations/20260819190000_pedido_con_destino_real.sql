-- ---------------------------------------------------------------------------
-- El destino de un pedido deja de ser texto suelto
--
-- LO QUE NO SE PODÍA RESPONDER
--
-- `solicitudes_pedido.destino` era texto libre, con «Taller, planta, frente 3»
-- de ejemplo. Cada quien lo escribía a su manera —«taller», «Taller Primaria»,
-- «tall. prim.»— y el sistema no podía asociar la compra con ningún sitio. Dos
-- preguntas que la dirección va a hacer y que no tenían respuesta:
--
--   ¿Cuánto se compró este mes para el Taller de Planta Fija?
--   Al recibir el material, ¿a qué almacén entra?
--
-- La segunda es la que más cuesta: hoy quien recibe tiene que adivinar el
-- almacén, y si se equivoca la existencia queda en el sitio que no es.
--
-- POR QUÉ SE AÑADE LA CLAVE Y NO SE REEMPLAZA EL TEXTO
--
-- El mismo patrón que la placa de los vehículos. La clave sirve para contar y
-- para proponer el almacén al recibir; el texto sigue haciendo falta porque no
-- todo destino es un almacén: un frente, la planta, una máquina concreta. Para
-- esos casos la pantalla ofrece «Otro» y ahí sí se escribe.
--
-- Las dos funciones se copian de su definición viva y solo se les añade el
-- parámetro nuevo al final. Nada más cambia.
-- ---------------------------------------------------------------------------
alter table public.solicitudes_pedido
  add column if not exists destino_almacen_id bigint references public.almacenes(id);

comment on column public.solicitudes_pedido.destino_almacen_id is
  'A qué almacén, taller o patio va lo que se pide. Nulo cuando el destino no '
  'es un sitio del inventario —un frente, la planta— y entonces vale el texto '
  'de `destino`.';

comment on column public.solicitudes_pedido.destino is
  'El destino tal como quedó. Cuando hay `destino_almacen_id` guarda su '
  'nombre; cuando no, lo que la persona haya escrito.';

create index if not exists solicitudes_destino_idx
  on public.solicitudes_pedido (destino_almacen_id)
  where destino_almacen_id is not null;

-- ---------------------------------------------------------------------------
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
  p_solicitante_cargo  text default null,
  p_destino_almacen_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id      bigint;
  v_sol     record;
  v_destino text := nullif(trim(coalesce(p_destino, '')), '');
  v_nombre  text;
begin
  perform private.exigir_rol('SOLICITANTE', 'COMPRAS', 'OPERACIONES', 'ALMACEN', 'RRHH');

  if length(trim(coalesce(p_titulo, ''))) < 4 then
    raise exception 'Ponle un título al pedido: es lo que se lee en el tablero.' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_justificacion, ''))) < 10 then
    raise exception 'Explica para qué es. Quien aprueba no está en el frente y necesita el porqué.'
      using errcode = '22023';
  end if;

  -- Si el destino es un sitio del inventario, el texto se toma de su nombre:
  -- así no conviven «TAL-PRI» y «taller primaria» apuntando a lo mismo.
  if p_destino_almacen_id is not null then
    select nombre into v_nombre from public.almacenes where id = p_destino_almacen_id;
    if v_nombre is null then
      raise exception 'No existe el almacén %.', p_destino_almacen_id using errcode = '23503';
    end if;
    v_destino := v_nombre;
  end if;

  -- Sin indicación, pide quien carga. Es lo más común y ahorra un clic.
  select * into v_sol from private.normalizar_solicitante(
    coalesce(p_solicitante_id,
             case when nullif(trim(coalesce(p_solicitante_nombre, '')), '') is null
                  then (select auth.uid()) end),
    p_solicitante_nombre, p_solicitante_cargo);

  insert into public.solicitudes_pedido
    (numero, titulo, justificacion, prioridad, requerida_para, destino,
     destino_almacen_id, estado,
     registrada_por, solicitante_id, solicitante_nombre, solicitante_cargo, enviada_en)
  values
    (private.siguiente_numero('SOL'), trim(p_titulo), trim(p_justificacion),
     coalesce(p_prioridad, 'NORMAL'), p_requerida_para, v_destino,
     p_destino_almacen_id,
     case when p_enviar then 'PEDIDO' else 'BORRADOR' end,
     (select auth.uid()), v_sol.o_id, v_sol.o_nombre, v_sol.o_cargo,
     case when p_enviar then now() end)
  returning id into v_id;

  perform private.escribir_renglones(v_id, p_renglones);
  perform private.anotar('SOLICITUD', v_id, null,
    case when p_enviar then 'PEDIDO' else 'BORRADOR' end);

  return v_id;
end;
$function$;

-- ---------------------------------------------------------------------------
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
  p_solicitante_cargo  text default null,
  p_destino_almacen_id bigint default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_estado  text;
  v_dueno   uuid;
  v_sol     record;
  v_destino text := nullif(trim(coalesce(p_destino, '')), '');
  v_nombre  text;
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

  if p_destino_almacen_id is not null then
    select nombre into v_nombre from public.almacenes where id = p_destino_almacen_id;
    if v_nombre is null then
      raise exception 'No existe el almacén %.', p_destino_almacen_id using errcode = '23503';
    end if;
    v_destino := v_nombre;
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
    destino = v_destino,
    destino_almacen_id = p_destino_almacen_id,
    solicitante_id = v_sol.o_id,
    solicitante_nombre = v_sol.o_nombre,
    solicitante_cargo = v_sol.o_cargo
  where id = p_id;

  perform private.escribir_renglones(p_id, p_renglones);
end;
$function$;

-- ---------------------------------------------------------------------------
-- Permisos de ejecución de las firmas nuevas
-- ---------------------------------------------------------------------------
revoke execute on function public.crear_pedido(
  text, text, jsonb, text, date, text, boolean, uuid, text, text, bigint) from public, anon;
grant execute on function public.crear_pedido(
  text, text, jsonb, text, date, text, boolean, uuid, text, text, bigint) to authenticated;

revoke execute on function public.actualizar_pedido(
  bigint, text, text, jsonb, text, date, text, uuid, text, text, bigint) from public, anon;
grant execute on function public.actualizar_pedido(
  bigint, text, text, jsonb, text, date, text, uuid, text, text, bigint) to authenticated;

-- Las firmas viejas quedarían como sobrecargas y PostgREST no sabría cuál
-- llamar cuando el front no manda el parámetro nuevo.
drop function if exists public.crear_pedido(
  text, text, jsonb, text, date, text, boolean, uuid, text, text);
drop function if exists public.actualizar_pedido(
  bigint, text, text, jsonb, text, date, text, uuid, text, text);
