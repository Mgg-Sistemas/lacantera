-- ---------------------------------------------------------------------------
-- El tanque dice cuánto le cabe, y la máquina tiene foto
--
-- Dos preguntas de Christopher, una detrás de otra:
--
--   «¿Dónde puedo crear más tanques e indicar sus especificaciones?»
--   «Necesitamos permitir que puedan subir una imagen referencial de la máquina»
--
-- =========================================================================
-- 1. UN TANQUE ES UN ALMACÉN, PERO LE FALTABA LO SUYO
-- =========================================================================
--
-- Los tanques ya se creaban: son filas de `almacenes` con `tipo = 'COMBUSTIBLE'`,
-- desde Inventario → Almacenes. Lo que no había era dónde poner la especificación
-- que de verdad importa en un tanque: cuánto le cabe.
--
-- Un almacén guardaba código, nombre, tipo, ubicación y si recibe compras. Para
-- un patio basta —un patio no tiene tope— pero un tanque sin capacidad deja el
-- saldo huérfano: «720 L» no dice si está lleno o pidiendo pedido.
--
-- Con la capacidad al lado se lee «720 de 5.000», que es la cifra con la que se
-- decide si se manda a comprar. Y el porcentaje se calcula en la base, no en el
-- navegador, para que salga igual en la pantalla, en un informe y en un aviso.
--
-- Nula mientras no se sepa: obligar a ponerla convertiría cargar un almacén
-- cualquiera en una pregunta que solo tiene sentido para los tanques.
--
-- =========================================================================
-- 2. LA FOTO DE LA MÁQUINA
-- =========================================================================
--
-- Se copia entera la tubería que ya usa la ficha del personal, con sus cuatro
-- columnas: la ruta y el encuadre. El encuadre hace falta por lo mismo que allí
-- —una excavadora fotografiada de lado no se encuadra en el centro— y así se
-- puede reutilizar `EncuadreFoto` sin tocarlo.
--
-- LA BASE NO GUARDA EL ARCHIVO
--
-- El archivo viaja del navegador al bucket y la base solo guarda la ruta. Es la
-- excepción conocida a la regla 1: el navegador no escribe en las TABLAS, pero
-- sí sube ficheros al almacenamiento, porque pasarlos por una función sería
-- meter megabytes por una tubería pensada para filas.
--
-- POR QUÉ LA FOTO SE LEE SIN PEDIR ROL
--
-- Los otros tres buckets cierran la lectura por rol, y con razón: una ficha de
-- personal lleva el sueldo y un documento legal es de la empresa. La foto de una
-- excavadora no es ninguna de las dos cosas — sirve para que quien va a
-- despachar combustible reconozca cuál es. Cerrarla obligaría a abrirla en cinco
-- sitios en cuanto haga falta en otra pantalla.
--
-- Escribir sí va por rol, y por los que llevan los equipos.
-- ---------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- La capacidad del tanque
-- --------------------------------------------------------------------------
alter table public.almacenes
  add column if not exists capacidad numeric(14,2) check (capacidad is null or capacidad > 0);

comment on column public.almacenes.capacidad is
  'Cuánto le cabe, en la unidad de lo que guarda. Solo tiene sentido en un tanque: un patio no tiene tope. Nula mientras no se sepa.';

create or replace view public.v_tanques as
select
  a.id            as almacen_id,
  a.codigo        as almacen_codigo,
  a.nombre        as tanque,
  a.ubicacion,
  a.capacidad,
  a.activo,
  ar.id           as articulo_id,
  ar.codigo       as articulo_codigo,
  ar.nombre       as combustible,
  ar.unidad,
  ar.stock_minimo,
  coalesce(e.existencia, 0) as existencia,
  case
    when a.capacidad is null or a.capacidad <= 0 then null
    else round(coalesce(e.existencia, 0) * 100 / a.capacidad, 1)
  end as lleno_pct,
  case
    when a.capacidad is null then null
    else greatest(a.capacidad - coalesce(e.existencia, 0), 0)
  end as cabe_todavia
from public.almacenes a
join public.articulos ar
  on ar.categoria = 'COMBUSTIBLE' and ar.activo
left join lateral (
  select private.existencia(a.id, ar.id) as existencia
) e on true
where a.tipo = 'COMBUSTIBLE' and a.activo;

alter view public.v_tanques set (security_invoker = on);

comment on view public.v_tanques is
  'Cada tanque con cada combustible: lo que hay, lo que le cabe y qué tan lleno está. Sale de almacenes de tipo COMBUSTIBLE, no de la categoría del artículo — un patio con gasoil cargado por error no es un tanque.';

-- --------------------------------------------------------------------------
-- La foto de la máquina
-- --------------------------------------------------------------------------
alter table public.maquinaria
  add column if not exists foto_path text,
  add column if not exists foto_zoom numeric(5,3) not null default 1,
  add column if not exists foto_x    numeric(5,4) not null default 0.5,
  add column if not exists foto_y    numeric(5,4) not null default 0.5;

comment on column public.maquinaria.foto_path is
  'Ruta dentro del bucket maquinaria. La base guarda la ruta, no el archivo: el archivo viaja del navegador al bucket.';
comment on column public.maquinaria.foto_zoom is
  'El encuadre, igual que en la ficha del personal: cuanto se acerca la foto.';
comment on column public.maquinaria.foto_x is
  'Punto de interes horizontal, de 0 a 1. Una excavadora fotografiada de lado no se encuadra en el centro.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('maquinaria', 'maquinaria', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fotos_maquinaria_lectura on storage.objects;
drop policy if exists fotos_maquinaria_escritura on storage.objects;
drop policy if exists fotos_maquinaria_reemplazo on storage.objects;
drop policy if exists fotos_maquinaria_borrado on storage.objects;

create policy fotos_maquinaria_lectura on storage.objects
  for select using (bucket_id = 'maquinaria' and auth.uid() is not null);

create policy fotos_maquinaria_escritura on storage.objects
  for insert with check (
    bucket_id = 'maquinaria'
    and (select mis_roles()) && array['ADMIN', 'ALMACEN', 'OPERACIONES']
  );

create policy fotos_maquinaria_reemplazo on storage.objects
  for update using (
    bucket_id = 'maquinaria'
    and (select mis_roles()) && array['ADMIN', 'ALMACEN', 'OPERACIONES']
  );

create policy fotos_maquinaria_borrado on storage.objects
  for delete using (
    bucket_id = 'maquinaria'
    and (select mis_roles()) && array['ADMIN', 'ALMACEN', 'OPERACIONES']
  );

-- --------------------------------------------------------------------------
-- Anotar y quitar la foto
--
-- Copiadas de `guardar_foto_empleado` y `quitar_foto_empleado`, incluida la
-- decisión que las hace fiables: devuelven la ruta ANTERIOR en vez de borrar el
-- archivo ellas mismas. Si borraran, esta función tendría que hablar con el
-- almacenamiento, y el día que esa parte fallara se caería con ella el guardado
-- del encuadre — que no tiene nada que ver.
--
-- La reja es el permiso de módulo y no el rol, al revés que en el personal. Ahí
-- es `exigir_rol('RRHH')` por historia; aquí MAQUINARIA:ESCRITURA es lo que ya
-- gobierna el alta de una máquina, y la foto es parte del alta.
-- --------------------------------------------------------------------------
create or replace function public.guardar_foto_maquina(
  p_id   bigint,
  p_path text default null,
  p_zoom numeric default 1,
  p_x    numeric default 0.5,
  p_y    numeric default 0.5
)
returns text
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_anterior text;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  select foto_path into v_anterior from public.maquinaria where id = p_id;

  if not found then
    raise exception 'No existe la máquina %.', p_id using errcode = 'P0002';
  end if;

  update public.maquinaria
     set foto_path = coalesce(nullif(trim(coalesce(p_path, '')), ''), foto_path),
         foto_zoom = coalesce(p_zoom, 1),
         foto_x    = coalesce(p_x, 0.5),
         foto_y    = coalesce(p_y, 0.5)
   where id = p_id;

  if p_path is not null and v_anterior is distinct from p_path then
    return v_anterior;
  end if;

  return null;
exception
  when check_violation then
    raise exception 'El encuadre quedó fuera de la foto. Vuelve a centrarla.'
      using errcode = '23514';
end;
$func$;

comment on function public.guardar_foto_maquina(bigint, text, numeric, numeric, numeric) is
  'Anota dónde quedó la foto de la máquina y su encuadre. Devuelve la ruta anterior para que la pantalla borre el archivo viejo.';

revoke all on function public.guardar_foto_maquina(bigint, text, numeric, numeric, numeric) from public;
revoke all on function public.guardar_foto_maquina(bigint, text, numeric, numeric, numeric) from anon;
grant execute on function public.guardar_foto_maquina(bigint, text, numeric, numeric, numeric) to authenticated;

create or replace function public.quitar_foto_maquina(p_id bigint)
returns text
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_anterior text;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  select foto_path into v_anterior from public.maquinaria where id = p_id;

  update public.maquinaria
     set foto_path = null, foto_zoom = 1, foto_x = 0.5, foto_y = 0.5
   where id = p_id;

  return v_anterior;
end;
$func$;

comment on function public.quitar_foto_maquina(bigint) is
  'Quita la foto de la máquina y devuelve la ruta que tenía, para borrar el archivo del bucket.';

revoke all on function public.quitar_foto_maquina(bigint) from public;
revoke all on function public.quitar_foto_maquina(bigint) from anon;
grant execute on function public.quitar_foto_maquina(bigint) to authenticated;
