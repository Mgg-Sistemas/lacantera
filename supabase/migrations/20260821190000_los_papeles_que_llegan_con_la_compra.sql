-- ---------------------------------------------------------------------------
-- Los papeles que llegan con la compra
--
-- Christopher: «al registrar una compra, se pueda cargar el comprobante de
-- pago, nota de entrega o factura que haya recibido la empresa o persona, ya
-- sea una imagen o un pdf». Y después, precisando: «es el que recibe, que con
-- el tiempo se daña, por eso una imagen en la base tiene importancia».
--
-- Son papeles de FUERA. Los de dentro —la orden, el comprobante de pago que
-- emite la empresa— los imprime el sistema cuando hagan falta y no hay nada
-- que archivar.
--
-- POR QUÉ CUELGAN DE LA ORDEN
--
-- Llegan en momentos distintos y de manos distintas: tesorería paga y recibe
-- el comprobante, almacén descarga y recibe la nota de entrega, compras
-- archiva la factura. La orden es el único documento presente en los tres
-- momentos —la solicitud se queda atrás en cuanto hay orden, y la factura
-- llega tarde— así que es el único sitio donde los tres caben juntos.
--
-- POR QUÉ EL BUCKET ES EL QUE YA ESTABA
--
-- `facturas-proveedor` ya es privado y ya admite PDF e imágenes, incluido
-- HEIC, que es lo que sale de un iPhone. Un segundo bucket para el mismo tipo
-- de papel sería un segundo sitio donde buscarlo.
--
-- Lo que sí cambia es quién puede subir: tesorería tiene que poder subir el
-- comprobante del pago que acaba de hacer, y almacén la nota de entrega del
-- camión que acaba de descargar. Pedirle a compras que suba papeles que no
-- tiene en la mano es como se acaban sin subir.
-- ---------------------------------------------------------------------------

create table if not exists public.compras_papeles (
  id             bigint generated always as identity primary key,
  orden_id       bigint not null references public.ordenes_compra(id) on delete cascade,

  tipo           text not null check (tipo = any (array[
                   'COMPROBANTE_PAGO', 'NOTA_ENTREGA', 'FACTURA', 'OTRO'])),

  archivo_path   text not null,
  archivo_nombre text not null,
  nota           text,

  subido_por     uuid references public.perfiles(id),
  subido_en      timestamptz not null default now()
);

create index if not exists compras_papeles_orden_idx on public.compras_papeles (orden_id);

comment on table public.compras_papeles is
  'Los papeles que la empresa RECIBE por una compra: comprobante de pago, nota '
  'de entrega, factura. El papel fisico se despinta y se traspapela; esta copia '
  'es la que queda.';

alter table public.compras_papeles enable row level security;

drop policy if exists compras_papeles_lectura on public.compras_papeles;
create policy compras_papeles_lectura on public.compras_papeles
  for select to authenticated
  using (private.tiene_permiso('COMPRAS', 'LECTURA'));

revoke insert, update, delete on public.compras_papeles from authenticated;

drop trigger if exists trg_auditar on public.compras_papeles;
create trigger trg_auditar
  after insert or update or delete on public.compras_papeles
  for each row execute function private.auditar('id');

-- ---------------------------------------------------------------------------
-- Adjuntar
-- ---------------------------------------------------------------------------
create or replace function public.adjuntar_papel_de_compra(
  p_orden_id bigint,
  p_tipo text,
  p_archivo_path text,
  p_archivo_nombre text,
  p_nota text default null
) returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_id bigint;
begin
  -- Los tres roles que tienen el papel en la mano. Exigir COMPRAS para todo
  -- obligaría a que compras suba comprobantes que no ha visto.
  if not private.tiene_rol('ADMIN', 'COMPRAS', 'TESORERIA', 'ALMACEN') then
    raise exception 'No tienes permiso para adjuntar papeles a una compra.'
      using errcode = '42501';
  end if;

  if p_tipo not in ('COMPROBANTE_PAGO', 'NOTA_ENTREGA', 'FACTURA', 'OTRO') then
    raise exception 'Ese no es un papel de compra: comprobante de pago, nota de entrega, factura u otro.'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.ordenes_compra where id = p_orden_id) then
    raise exception 'No existe la orden %.', p_orden_id using errcode = 'P0002';
  end if;

  if length(btrim(coalesce(p_archivo_path, ''))) = 0
     or length(btrim(coalesce(p_archivo_nombre, ''))) = 0 then
    raise exception 'Falta el archivo.' using errcode = '23514';
  end if;

  insert into public.compras_papeles
    (orden_id, tipo, archivo_path, archivo_nombre, nota, subido_por)
  values
    (p_orden_id, p_tipo, btrim(p_archivo_path), btrim(p_archivo_nombre),
     nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$func$;

revoke execute on function public.adjuntar_papel_de_compra(bigint, text, text, text, text) from public, anon;
grant  execute on function public.adjuntar_papel_de_compra(bigint, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Quitar
-- ---------------------------------------------------------------------------
create or replace function public.quitar_papel_de_compra(p_id bigint)
returns text
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_ruta text;
begin
  if not private.tiene_rol('ADMIN', 'COMPRAS', 'TESORERIA', 'ALMACEN') then
    raise exception 'No tienes permiso para quitar papeles de una compra.'
      using errcode = '42501';
  end if;

  -- Se devuelve la ruta para que quien llamó borre también el archivo. Si solo
  -- se borrara la fila, el archivo quedaría en el bucket sin nada que lo
  -- nombre: basura que nadie sabe de quién era.
  delete from public.compras_papeles where id = p_id returning archivo_path into v_ruta;

  if v_ruta is null then
    raise exception 'Ese papel ya no está.' using errcode = 'P0002';
  end if;

  return v_ruta;
end;
$func$;

revoke execute on function public.quitar_papel_de_compra(bigint) from public, anon;
grant  execute on function public.quitar_papel_de_compra(bigint) to authenticated;
