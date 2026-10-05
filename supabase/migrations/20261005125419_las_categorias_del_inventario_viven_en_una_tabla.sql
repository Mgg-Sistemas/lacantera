/*
  LAS CATEGORÍAS DEL INVENTARIO VIVEN EN UNA TABLA.

  Christopher, 05/10/2026: «necesito poder crear nuevas categorías sin
  necesidad de que sea por código, por si quiero crear otra categoría en el
  inventario».

  Hasta hoy la lista vivía en cuatro sitios a la vez: el CHECK de
  `articulos.categoria`, el CASE de `private.prefijo_de_categoria`, el CASE
  de `public.categorias_de_articulo()` y la constante de la pantalla. Añadir
  una categoría era una migración. Desde hoy la lista vive en UNA tabla,
  `public.categorias_articulo`, y los otros tres la leen:

  - El CHECK cede su puesto a una clave foránea: la misma regla —solo
    categorías conocidas— pero contra una tabla que crece sin migración.
  - `private.prefijo_de_categoria` busca el prefijo en la tabla y conserva
    su red de siempre (las tres primeras letras) para lo imprevisto.
  - `public.categorias_de_articulo()` —la que alimenta la planilla de carga
    y sus desplegables— deja de descifrar el CHECK con expresiones regulares
    y lee la tabla. De paso gana la etiqueta de VIVERES, que el CASE viejo
    no conocía y devolvía nula.

  Las once categorías existentes entran como filas `de_sistema`: el programa
  se ramifica comparando contra esas palabras (COMBUSTIBLE despacha de
  tanques, PRODUCTO se vende, VIVERES se cocina…), así que no se eliminan.
  Las que se creen desde la pantalla solo clasifican, que es exactamente lo
  que se pidió, y se crean con `crear_categoria_de_articulo` —control total
  de Inventario—. Una creada por error y sin artículos se puede eliminar;
  una con artículos, no: la clave foránea y la función lo impiden.
*/

-- ─────────────────────────────────────────────── 1 · la tabla y su gente ──

create table public.categorias_articulo (
  codigo     text primary key
    constraint categorias_articulo_codigo_formato
    check (codigo ~ '^[A-Z][A-Z_]{1,29}$'),
  etiqueta   text not null,
  /* Las letras con las que empiezan los códigos de sus artículos (VIV-0001).
     Único: dos categorías con el mismo prefijo compartirían numeración. */
  prefijo    text not null
    constraint categorias_articulo_prefijo_unico unique
    constraint categorias_articulo_prefijo_formato check (prefijo ~ '^[A-Z]{2,4}$'),
  activa     boolean not null default true,
  /* Las que el programa conoce por nombre. No se eliminan desde la pantalla. */
  de_sistema boolean not null default false,
  creada_en  timestamptz not null default now(),
  creada_por uuid references auth.users (id)
);

comment on table public.categorias_articulo is
  'Las categorías de artículos del inventario. Las de sistema las usa el programa por nombre; las demás solo clasifican y se crean desde la pantalla.';

insert into public.categorias_articulo (codigo, etiqueta, prefijo, de_sistema) values
  ('PRODUCTO',    'Producto de cantera',          'PRD', true),
  ('REPUESTO',    'Repuesto',                     'REP', true),
  ('INSUMO',      'Insumo',                       'INS', true),
  ('COMBUSTIBLE', 'Combustible',                  'CMB', true),
  ('LUBRICANTE',  'Lubricante',                   'LUB', true),
  ('EPP',         'Equipo de protección',         'EPP', true),
  ('HERRAMIENTA', 'Herramienta',                  'HER', true),
  ('EXPLOSIVO',   'Explosivo',                    'EXP', true),
  ('SERVICIO',    'Servicio',                     'SRV', true),
  ('EQUIPO',      'Equipo de oficina y cómputo',  'EQU', true),
  ('VIVERES',     'Víveres',                      'VIV', true);

alter table public.categorias_articulo enable row level security;

create policy categorias_articulo_lectura on public.categorias_articulo
  for select to authenticated
  using (private.tiene_permiso('PANEL', 'LECTURA'));

revoke all on table public.categorias_articulo from anon, authenticated;
grant select on table public.categorias_articulo to authenticated;

-- ──────────────────────────── 2 · el CHECK cede a la clave foránea ────────

alter table public.articulos drop constraint articulos_categoria_check;

alter table public.articulos
  add constraint articulos_categoria_fkey
  foreign key (categoria) references public.categorias_articulo (codigo);

-- ─────────────────────── 3 · el prefijo sale de la tabla, no de un CASE ──

create or replace function private.prefijo_de_categoria(p_categoria text)
returns text
language sql
stable
set search_path to ''
as $$
  select coalesce(
    (select c.prefijo
       from public.categorias_articulo c
      where c.codigo = upper(coalesce(p_categoria, ''))),
    -- La red para lo imprevisto, la misma de antes: las tres primeras letras.
    left(regexp_replace(upper(coalesce(p_categoria, 'ART')), '[^A-Z]', '', 'g') || 'ART', 3));
$$;

-- ──────────────── 4 · la lista de la planilla también lee la tabla ────────

create or replace function public.categorias_de_articulo()
returns table (codigo text, etiqueta text)
language sql
stable
security definer
set search_path to ''
as $$
  select c.codigo, c.etiqueta
    from public.categorias_articulo c
   where c.activa
   order by c.etiqueta;
$$;

-- ─────────────────────────── 5 · crear una categoría desde la pantalla ────

create or replace function public.crear_categoria_de_articulo(
  p_etiqueta text,
  p_prefijo  text default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_etiqueta text := trim(coalesce(p_etiqueta, ''));
  v_codigo   text;
  v_prefijo  text;
  v_choque   record;
begin
  perform private.exigir_permiso('INVENTARIO', 'TOTAL');

  if length(v_etiqueta) < 3 then
    raise exception 'Póngale un nombre a la categoría: al menos tres letras.'
      using errcode = '22023';
  end if;

  /*
    El código nace del nombre: mayúsculas, sin acentos, y lo que no sea letra
    se vuelve guion bajo. «Material médico» → MATERIAL_MEDICO. Es el mismo
    espíritu del código de artículo: se pone solo, no se pide.
  */
  v_codigo := trim(both '_' from regexp_replace(
    translate(upper(v_etiqueta), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '[^A-Z]+', '_', 'g'));

  if v_codigo !~ '^[A-Z][A-Z_]{1,29}$' then
    raise exception 'Ese nombre no alcanza para formar la categoría: use palabras, hasta treinta letras.'
      using errcode = '22023';
  end if;

  select c.codigo, c.etiqueta into v_choque
    from public.categorias_articulo c
   where c.codigo = v_codigo
      or lower(c.etiqueta) = lower(v_etiqueta);

  if v_choque.codigo is not null then
    raise exception 'La categoría «%» ya existe.', v_choque.etiqueta
      using errcode = '23505';
  end if;

  /*
    El prefijo manda sobre los códigos de los artículos (VIV-0001), así que se
    puede elegir; sin elegirlo, salen las tres primeras letras del código.
  */
  v_prefijo := coalesce(
    nullif(upper(trim(coalesce(p_prefijo, ''))), ''),
    left(regexp_replace(v_codigo, '[^A-Z]', '', 'g') || 'ART', 3));

  if v_prefijo !~ '^[A-Z]{2,4}$' then
    raise exception 'El prefijo son de dos a cuatro letras, sin números: con él empiezan los códigos de sus artículos.'
      using errcode = '22023';
  end if;

  select c.etiqueta into v_choque
    from public.categorias_articulo c
   where c.prefijo = v_prefijo;

  if v_choque.etiqueta is not null then
    raise exception 'El prefijo % ya es de «%»: elija otro, que dos categorías no pueden numerar igual.',
      v_prefijo, v_choque.etiqueta using errcode = '23505';
  end if;

  insert into public.categorias_articulo (codigo, etiqueta, prefijo, creada_por)
  values (v_codigo, v_etiqueta, v_prefijo, (select auth.uid()));

  return jsonb_build_object('codigo', v_codigo, 'etiqueta', v_etiqueta, 'prefijo', v_prefijo);
end;
$$;

revoke all on function public.crear_categoria_de_articulo(text, text) from public, anon;
grant execute on function public.crear_categoria_de_articulo(text, text) to authenticated;

-- ──────────────── 6 · eliminar la que nació por error y no se usó ─────────

create or replace function public.eliminar_categoria_de_articulo(p_codigo text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_cat record;
  v_usos bigint;
begin
  perform private.exigir_permiso('INVENTARIO', 'TOTAL');

  select * into v_cat from public.categorias_articulo where codigo = upper(trim(coalesce(p_codigo, '')));

  if v_cat.codigo is null then
    raise exception 'Esa categoría no existe.' using errcode = '22023';
  end if;

  if v_cat.de_sistema then
    raise exception 'La categoría «%» es del sistema: el programa la usa por nombre y no se puede eliminar.',
      v_cat.etiqueta using errcode = '42501';
  end if;

  select count(*) into v_usos from public.articulos a where a.categoria = v_cat.codigo;

  if v_usos > 0 then
    raise exception 'La categoría «%» tiene % artículo(s): no se elimina una palabra que el catálogo ya usa.',
      v_cat.etiqueta, v_usos using errcode = '23503';
  end if;

  delete from public.categorias_articulo where codigo = v_cat.codigo;
end;
$$;

revoke all on function public.eliminar_categoria_de_articulo(text) from public, anon;
grant execute on function public.eliminar_categoria_de_articulo(text) to authenticated;
