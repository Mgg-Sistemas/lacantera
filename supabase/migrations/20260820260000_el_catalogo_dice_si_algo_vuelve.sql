-- ---------------------------------------------------------------------------
-- El catálogo dice si un artículo vuelve, se consume, o no se entrega
--
-- LO QUE PASABA
--
-- La pantalla de asignaciones ofrecía **entregar gasolina a un trabajador**,
-- con el texto «Queda a su nombre hasta que la devuelva» debajo. Lo vio
-- Christopher: entregar un destornillador y entregar gasolina no son la misma
-- operación, y el sistema las trataba igual.
--
-- La causa es que `v_herramientas` no filtraba nada: listaba **cualquier
-- artículo con existencia**. Materia prima, combustible, repuestos y
-- herramienta, todo junto, todo «prestable».
--
-- TRES COMPORTAMIENTOS, NO DOS
--
-- La pregunta «¿vuelve o no vuelve?» tiene tres respuestas, no dos:
--
--   NO          No se le entrega a una persona. La piedra picada se vende, el
--               servicio se contrata. Nadie se lleva eso a su casa.
--
--   RETORNABLE  Se entrega y vuelve. Un torquímetro, un arnés, una radio.
--               Queda a nombre de alguien y se le pide de vuelta. Es lo único
--               que el módulo de asignaciones sabe manejar: su tabla tiene
--               `fecha_devolucion`, `PERDIDA` y `DANADA`.
--
--   CONSUMIBLE  Se entrega y no vuelve. Gasolina, electrodos, guantes de un
--               solo uso. Interesa saber quién lo recibió, pero no hay nada que
--               devolver, así que abrirle una asignación sería abrir algo que
--               no puede cerrarse nunca.
--
-- POR QUÉ LOS CONSUMIBLES SALEN DE ASIGNACIONES Y NO SE LES INVENTA UN FLUJO
--
-- Cada uno ya tiene el suyo: el combustible tiene su módulo con su tanque y sus
-- despachos, la dotación de EPP sale por `entregar_dotacion` desde la ficha del
-- trabajador, y lo demás sale del almacén como movimiento. Meterlos en
-- asignaciones no les daba trazabilidad: les daba una asignación abierta para
-- siempre contra alguien que no tiene nada que devolver.
--
-- El día que haga falta registrar «quién se llevó estos electrodos» sin abrir
-- un préstamo, eso es una salida de almacén con destinatario, y se construye
-- como tal.
--
-- LOS VALORES POR DEFECTO SALEN DE LA CATEGORÍA
--
-- Son 170 artículos y ponerlos a mano uno a uno sería garantizar que la mitad
-- queden mal. La categoría ya dice casi siempre cuál es: una HERRAMIENTA
-- vuelve, un REPUESTO se instala y no vuelve, un PRODUCTO se vende. Se rellena
-- por ahí y se corrige lo que no cuadre, que es al revés de como se equivoca
-- menos gente.
--
-- El EPP entra como RETORNABLE porque la dotación se lleva por persona y se
-- pide de vuelta al salir; lo desechable de esa categoría —las mascarillas— se
-- cambia a mano, que son dos.
-- ---------------------------------------------------------------------------
alter table public.articulos
  add column if not exists modo_entrega text;

update public.articulos
   set modo_entrega = case categoria
     when 'HERRAMIENTA' then 'RETORNABLE'
     when 'EPP'         then 'RETORNABLE'
     when 'PRODUCTO'    then 'NO'
     when 'SERVICIO'    then 'NO'
     else 'CONSUMIBLE'
   end
 where modo_entrega is null;

alter table public.articulos
  alter column modo_entrega set default 'CONSUMIBLE',
  alter column modo_entrega set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'articulos_modo_entrega_check') then
    alter table public.articulos
      add constraint articulos_modo_entrega_check
      check (modo_entrega in ('NO', 'RETORNABLE', 'CONSUMIBLE'));
  end if;
end $$;

comment on column public.articulos.modo_entrega is
  'Qué pasa cuando este artículo se le entrega a una persona. NO: no se le '
  'entrega a nadie. RETORNABLE: queda a su nombre y se le pide de vuelta — es '
  'lo único que admite el módulo de asignaciones. CONSUMIBLE: se lo lleva y no '
  'vuelve, así que sale por su propio camino y no por un préstamo.';

-- ---------------------------------------------------------------------------
-- La lista de asignables deja de ofrecer lo que no se puede devolver
--
-- OJO: `create or replace view` **descarta las opciones si no se vuelven a
-- declarar**, y esta vista lleva `security_invoker`. Perderlo dejaría el
-- inventario legible por cualquier sesión, salte o no la RLS de debajo. Se
-- vuelve a poner abajo a propósito, no por costumbre.
-- ---------------------------------------------------------------------------
create or replace view public.v_herramientas as
 SELECT e.almacen_id,
    e.almacen,
    e.almacen_codigo,
    e.articulo_id,
    e.articulo_codigo,
    e.articulo,
    e.categoria,
    e.unidad,
    e.existencia,
    e.costo_promedio_usd,
    COALESCE(a.asignadas, 0::numeric) AS asignadas,
    e.existencia - COALESCE(a.asignadas, 0::numeric) AS disponibles,
    COALESCE(a.personas, 0::bigint) AS personas
   FROM v_existencias e
     JOIN articulos art ON art.id = e.articulo_id AND art.modo_entrega = 'RETORNABLE'
     LEFT JOIN ( SELECT asignaciones_herramienta.articulo_id,
            asignaciones_herramienta.almacen_id,
            sum(asignaciones_herramienta.cantidad) AS asignadas,
            count(DISTINCT asignaciones_herramienta.empleado_id) AS personas
           FROM asignaciones_herramienta
          WHERE asignaciones_herramienta.estado = 'ASIGNADA'::text
          GROUP BY asignaciones_herramienta.articulo_id, asignaciones_herramienta.almacen_id) a
       ON a.articulo_id = e.articulo_id AND a.almacen_id = e.almacen_id;

alter view public.v_herramientas set (security_invoker = on);

comment on view public.v_herramientas is
  'Lo que se puede entregar a una persona y pedirle de vuelta. Solo entra lo '
  'marcado como RETORNABLE: prestar algo que se consume abriría una asignación '
  'que no puede cerrarse nunca.';

-- ---------------------------------------------------------------------------
-- Crear, editar y borrar un artículo
--
-- Hasta ahora solo se podía crear y activar o desactivar. Un código mal
-- tecleado se quedaba mal para siempre, y un artículo creado por error solo
-- podía esconderse.
--
-- El código sigue sin poder cambiarse: es la clave con la que se pide en el
-- almacén y aparece impreso en órdenes y guías ya emitidas. Lo demás sí.
-- ---------------------------------------------------------------------------
drop function if exists public.crear_articulo(text, text, text, text, text, boolean, numeric);

create or replace function public.crear_articulo(
  p_codigo        text,
  p_nombre        text,
  p_categoria     text,
  p_unidad        text,
  p_descripcion   text default null,
  p_inventariable boolean default true,
  p_stock_minimo  numeric default 0,
  p_modo_entrega  text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  v_id   bigint;
  v_modo text;
begin
  perform private.exigir_rol('COMPRAS', 'ALMACEN');

  -- Sin indicar, lo decide la categoría: es lo que acierta más veces y siempre
  -- se puede corregir después.
  v_modo := coalesce(nullif(trim(coalesce(p_modo_entrega, '')), ''),
    case p_categoria
      when 'HERRAMIENTA' then 'RETORNABLE'
      when 'EPP'         then 'RETORNABLE'
      when 'PRODUCTO'    then 'NO'
      when 'SERVICIO'    then 'NO'
      else 'CONSUMIBLE'
    end);

  insert into public.articulos
    (codigo, nombre, descripcion, categoria, unidad, inventariable, stock_minimo,
     modo_entrega, creado_por)
  values
    (upper(trim(p_codigo)), trim(p_nombre), nullif(trim(coalesce(p_descripcion, '')), ''),
     p_categoria, p_unidad,
     case when p_categoria = 'SERVICIO' then false else p_inventariable end,
     coalesce(p_stock_minimo, 0), v_modo, (select auth.uid()))
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe un artículo con el código %.', upper(trim(p_codigo))
      using errcode = '23505';
end;
$function$;

revoke execute on function public.crear_articulo(text, text, text, text, text, boolean, numeric, text) from public, anon;
grant  execute on function public.crear_articulo(text, text, text, text, text, boolean, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
create or replace function public.editar_articulo(
  p_id            bigint,
  p_nombre        text,
  p_categoria     text,
  p_unidad        text,
  p_descripcion   text default null,
  p_inventariable boolean default true,
  p_stock_minimo  numeric default 0,
  p_modo_entrega  text default null
)
returns void
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  v_existe boolean;
begin
  perform private.exigir_rol('COMPRAS', 'ALMACEN');

  select true into v_existe from public.articulos where id = p_id;

  if v_existe is null then
    raise exception 'No existe ese artículo.' using errcode = 'P0002';
  end if;

  if length(trim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El artículo necesita un nombre.' using errcode = '22023';
  end if;

  update public.articulos set
    nombre         = trim(p_nombre),
    descripcion    = nullif(trim(coalesce(p_descripcion, '')), ''),
    categoria      = p_categoria,
    unidad         = p_unidad,
    inventariable  = case when p_categoria = 'SERVICIO' then false else p_inventariable end,
    stock_minimo   = coalesce(p_stock_minimo, 0),
    modo_entrega   = coalesce(nullif(trim(coalesce(p_modo_entrega, '')), ''), modo_entrega)
  where id = p_id;
end;
$function$;

comment on function public.editar_articulo is
  'Corrige un artículo. El código no se toca: es con lo que se pide en el '
  'almacén y ya está impreso en órdenes y guías emitidas.';

revoke execute on function public.editar_articulo(bigint, text, text, text, text, boolean, numeric, text) from public, anon;
grant  execute on function public.editar_articulo(bigint, text, text, text, text, boolean, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
create or replace function public.eliminar_articulo(p_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path to ''
as $function$
begin
  perform private.exigir_rol('COMPRAS', 'ALMACEN');

  delete from public.articulos where id = p_id;

  if not found then
    raise exception 'No existe ese artículo.' using errcode = 'P0002';
  end if;
exception
  -- Catorce tablas apuntan a `articulos`. Enumerarlas aquí sería una lista que
  -- envejece mal: se intenta borrar y se traduce lo que diga la base.
  when foreign_key_violation then
    raise exception 'Este artículo ya se usó en documentos o movimientos, así que borrarlo dejaría esa historia sin sentido. Desactívalo: deja de ofrecerse en los formularios y lo ya emitido sigue cuadrando.'
      using errcode = '23503';
end;
$function$;

revoke execute on function public.eliminar_articulo(bigint) from public, anon;
grant  execute on function public.eliminar_articulo(bigint) to authenticated;
