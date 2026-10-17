-- ============================================================================
-- LA COCINA CONSUME LO QUE SUS CATEGORÍAS DIGAN
--
-- Christopher, 17/10/2026: «si a cosas del mercado o alimentación le quiero
-- colocar otra categoría además de víveres… que me lo reconozca».
--
-- Hasta hoy la palabra VIVERES estaba clavada en tres sitios: la pantalla de
-- servir, la lista del mercado y la validación de `servir_comida`. Crear una
-- categoría nueva —desechables, limpieza— no servía de nada: la cocina no la
-- veía y la base la rechazaba.
--
-- Es el mismo problema que los motivos del combustible, y la misma cura: la
-- decisión se muda del código a una casilla de la tabla que Christopher ya
-- administra. `de_cocina` marcada = sus artículos entran a las tres puertas.
-- VÍVERES nace marcada; lo demás, él decide desde Artículos → Categorías.
-- ============================================================================


-- ─────────────────────────────── 1 · la casilla ────────────────────────────

alter table public.categorias_articulo
  add column if not exists de_cocina boolean not null default false;

comment on column public.categorias_articulo.de_cocina is
  'Marcada, sus artículos se ofrecen al servir comidas, entran a la lista del mercado y pasan la validación de servir_comida. VIVERES nace marcada; las demás las decide quien administra las categorías.';

update public.categorias_articulo set de_cocina = true where codigo = 'VIVERES';


-- ──────────── 2 · el catálogo de categorías dice también esta casilla ──────
--
-- Cambia el tipo de retorno, y Postgres no deja cambiarlo con un simple
-- `create or replace`: se suelta y se vuelve a crear, con los mismos permisos.

drop function if exists public.categorias_de_articulo();

create function public.categorias_de_articulo()
returns table (codigo text, etiqueta text, de_cocina boolean)
language sql
stable
security definer
set search_path to ''
as $$
  select c.codigo, c.etiqueta, c.de_cocina
    from public.categorias_articulo c
   where c.activa
   order by c.etiqueta;
$$;

revoke all on function public.categorias_de_articulo() from public, anon;
grant execute on function public.categorias_de_articulo() to authenticated;


-- ─────────────────────────── 3 · el interruptor ────────────────────────────
--
-- La misma reja que crear una categoría: control total de inventario. Vale
-- para cualquier categoría, de sistema o creada a mano — la casilla no borra
-- nada, solo dice si la cocina la puede consumir.

create or replace function public.marcar_categoria_de_cocina(
  p_codigo    text,
  p_de_cocina boolean
) returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform private.exigir_permiso('INVENTARIO', 'TOTAL');

  update public.categorias_articulo
     set de_cocina = coalesce(p_de_cocina, false)
   where codigo = p_codigo;

  if not found then
    raise exception 'No existe esa categoría.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.marcar_categoria_de_cocina(text, boolean) from public, anon;
grant execute on function public.marcar_categoria_de_cocina(text, boolean) to authenticated;


-- ──────── 4 · servir_comida le pregunta a la tabla, no a una palabra ───────
--
-- Parche anclado sobre la función VIVA (la lección del 05/10: puede ser más
-- nueva que el repositorio). Si el ancla no aparece tal cual, el parche se
-- niega en vez de adivinar.

do $mig$
declare
  v_def   text := pg_get_functiondef(
    'public.servir_comida(text,integer,bigint,jsonb,date,text,text)'::regprocedure);
  v_ancla text := $a$    if v_art.categoria <> 'VIVERES' then
      raise exception '«%» no es un víver: la cocina solo descuenta víveres.', v_art.nombre using errcode = '22023';
    end if;$a$;
  v_nueva text := $n$    -- Lo que la cocina puede consumir lo dicen las categorías, no una
    -- palabra escrita aquí: la casilla «Se consume en cocina» de
    -- Artículos → Categorías. Para sacar otra cosa del inventario están
    -- las salidas de siempre, con su solicitud y su firma.
    if not exists (
      select 1 from public.categorias_articulo c
       where c.codigo = v_art.categoria and c.de_cocina
    ) then
      raise exception '«%» no se consume en cocina: marque su categoría con «Se consume en cocina», en Artículos → Categorías.', v_art.nombre using errcode = '22023';
    end if;$n$;
begin
  if position(v_ancla in v_def) = 0 then
    raise exception 'El ancla de servir_comida no aparece: la función viva cambió y este parche no debe adivinar.';
  end if;

  execute replace(v_def, v_ancla, v_nueva);
end;
$mig$;


-- ─────────────────────────────── comprobación ──────────────────────────────
-- Debe devolver: VIVERES con la casilla marcada, y la función ya sin la
-- palabra clavada (clavada = 0).

select
  (select de_cocina from public.categorias_articulo where codigo = 'VIVERES')  as viveres_marcada,
  (select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'servir_comida'
     and position('<> ''VIVERES''' in pg_get_functiondef(p.oid)) > 0)          as clavada;
