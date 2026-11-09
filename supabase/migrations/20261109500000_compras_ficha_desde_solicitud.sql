-- EL PRODUCTO NUEVO DE UNA SOLICITUD, CON SU CÓDIGO DE CATEGORÍA.
--
-- La dueña (09/11/2026): «producto nuevo en inventario, no muestra código en
-- PDF, pero muestra código GEN en modal. ADEMÁS, si el producto es nuevo, y
-- tiene categoría, debe mostrarte tipo categoría repuestos: RES-001 y así
-- sucesivamente».
--
-- En «+ No está en inventario» de la Solicitud de Pedido y de la Solicitud de
-- Mercado ahora se puede elegir la categoría. Con categoría, se crea la ficha
-- en el catálogo con el código siguiente de esa categoría (REP-0001,
-- REP-0002…, el mismo formato y el mismo contador que usa Inventario) y el
-- renglón entra como un producto normal: con su `articulo_id` y su código.
-- Sin categoría sigue como hasta hoy: nombre general, SKU GEN-….
--
-- POR QUÉ NO SE LLAMA A `crear_articulo`. Esa función exige el rol de Compras o
-- de Almacén (`private.exigir_rol('COMPRAS', 'ALMACEN')`), y lo mira con el
-- usuario de la sesión aunque se la llame desde otra función SECURITY DEFINER:
-- quien solo pide material no lo tiene. Aquí se repite lo mínimo —el código
-- con `private.codigo_de_articulo`, el modo de entrega y «reparable» por
-- categoría, la restricción «editar el catálogo» y el nombre repetido— y se
-- deja fuera lo que una solicitud no trae (presentación, marca, densidad).
--
-- Y POR QUÉ SE TOCA `compras_normalizar_items`. Quien no es de Compras pide
-- con nombres generales: la base le rechaza cualquier renglón con artículo del
-- inventario que no estuviera ya en la SP. La ficha que él mismo acaba de
-- sacar con su categoría queda anotada a su nombre en
-- `private.compras_fichas_de_solicitud`, y esa sí se le admite.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Las fichas que cada quien sacó desde una solicitud
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists private.compras_fichas_de_solicitud (
  articulo_id bigint      not null references public.articulos (id) on delete cascade,
  usuario     uuid        not null references auth.users (id) on delete cascade,
  creada      boolean     not null,
  creado_en   timestamptz not null default now(),
  primary key (articulo_id, usuario)
);

comment on table private.compras_fichas_de_solicitud is
  'Fichas del catálogo que un usuario creó (o encontró ya hechas) con «+ No está en inventario» y categoría. compras_normalizar_items le admite esos artículos aunque pida con nombres generales.';

revoke all on table private.compras_fichas_de_solicitud from public, anon, authenticated;

create or replace function private.compras_ficha_del_solicitante(p_articulo_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from private.compras_fichas_de_solicitud f
     where f.articulo_id = p_articulo_id
       and f.usuario = (select auth.uid()));
$$;

revoke execute on function private.compras_ficha_del_solicitante(bigint) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. La ficha desde la solicitud
-- ═══════════════════════════════════════════════════════════════════════════

/*
  Devuelve {id, codigo, nombre, unidad, categoria, creada}.

  Si en esa categoría ya hay una ficha con el mismo nombre (comparado como lo
  compara el catálogo: `nombre_nucleo`, sin tildes, en singular y sin las
  palabras que no distinguen), devuelve esa y no crea otra: dos fichas del
  mismo repuesto acaban con la existencia repartida y ninguna cuadrando.
  Si está en OTRA categoría, para y dice cuál: `crear_articulo` también para
  ahí, y quien pide no puede «confirmar que es otra cosa» desde aquí.
*/
create or replace function public.compras_ficha_desde_solicitud(
  p_nombre text,
  p_categoria text,
  p_unidad text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text := private.en_mayuscula(btrim(coalesce(p_nombre, '')));
  v_cat    text := upper(btrim(coalesce(p_categoria, '')));
  v_uni    text := upper(btrim(coalesce(p_unidad, '')));
  v_nucleo text;
  v_art    public.articulos;
  v_otra   record;
  v_creada boolean := false;
begin
  perform private.exigir_usuario_activo();

  if private.accion_restringida('INVENTARIO.EDITAR_CATALOGO') then
    raise exception 'No puede crear productos en el inventario: editar el catálogo se le restringió. Pídalo sin categoría (nombre general).'
      using errcode = '42501';
  end if;

  if length(v_nombre) < 2 then
    raise exception 'Escribí el nombre de lo que se pide.' using errcode = '22023';
  end if;
  if length(v_nombre) > 150 then
    raise exception 'El nombre lleva hasta 150 caracteres.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.categorias_articulo c where c.codigo = v_cat and c.activa) then
    raise exception 'Esa categoría no existe o está inactiva.' using errcode = '22023';
  end if;
  if v_cat = 'SERVICIO' then
    raise exception 'Un servicio no se pide en la Solicitud de Pedido: va por «Nuevo servicio».' using errcode = '22023';
  end if;

  if not exists (select 1 from public.unidades u where u.codigo = v_uni) then
    raise exception 'Esa unidad no está en la lista.' using errcode = '22023';
  end if;
  if v_uni in ('M3', 'TON') then
    raise exception 'Lo que se mide en % necesita su densidad: se crea en Inventario. Aquí pedilo sin categoría (nombre general).',
      case v_uni when 'M3' then 'metros cúbicos' else 'toneladas' end
      using errcode = '22023';
  end if;

  v_nucleo := private.nombre_nucleo(v_nombre);

  -- Dos personas pidiendo a la vez el mismo repuesto nuevo no sacan dos fichas.
  perform pg_advisory_xact_lock(hashtextextended('compras_ficha_desde_solicitud:' || v_nucleo, 0));

  select a.* into v_art
    from public.articulos a
   where a.categoria = v_cat
     and private.nombre_nucleo(a.nombre) = v_nucleo
   order by a.activo desc, a.id
   limit 1;

  if v_art.id is not null and not v_art.activo then
    raise exception 'Ya existe «%» con el código %, pero está inactivo. Pedí en Inventario que lo reactiven, o pedilo sin categoría.',
      v_art.nombre, v_art.codigo
      using errcode = '22023';
  end if;

  if v_art.id is null then
    select a.codigo, a.nombre, a.activo, coalesce(c.etiqueta, a.categoria) as categoria into v_otra
      from public.articulos a
      left join public.categorias_articulo c on c.codigo = a.categoria
     where private.nombre_nucleo(a.nombre) = v_nucleo
     order by a.activo desc, a.id
     limit 1;

    if v_otra.codigo is not null then
      raise exception 'Ya existe «%» con el código % en la categoría %.% Elegí esa categoría, o pedilo sin categoría.',
        v_otra.nombre, v_otra.codigo, v_otra.categoria,
        case when v_otra.activo then '' else ' Está inactivo.' end
        using errcode = '22023';
    end if;

    -- Lo mismo que pone `crear_articulo` cuando no se le dice nada.
    insert into public.articulos
      (codigo, nombre, categoria, unidad, inventariable, stock_minimo,
       modo_entrega, reparable, creado_por)
    values
      (private.codigo_de_articulo(v_cat), v_nombre, v_cat, v_uni, true, 0,
       case v_cat
         when 'HERRAMIENTA' then 'RETORNABLE'
         when 'EPP'         then 'RETORNABLE'
         when 'PRODUCTO'    then 'NO'
         else 'CONSUMIBLE'
       end,
       v_cat in ('HERRAMIENTA', 'REPUESTO'),
       (select auth.uid()))
    returning * into v_art;

    v_creada := true;
  end if;

  insert into private.compras_fichas_de_solicitud (articulo_id, usuario, creada)
  values (v_art.id, (select auth.uid()), v_creada)
  on conflict (articulo_id, usuario) do nothing;

  return jsonb_build_object(
    'id', v_art.id,
    'codigo', v_art.codigo,
    'nombre', v_art.nombre,
    'unidad', v_art.unidad,
    'categoria', v_art.categoria,
    'creada', v_creada);
exception
  when unique_violation then
    raise exception 'El código que le tocaba ya lo tomó otro producto. Probá de nuevo.'
      using errcode = '23505';
end;
$$;

revoke execute on function public.compras_ficha_desde_solicitud(text, text, text) from public, anon;
grant execute on function public.compras_ficha_desde_solicitud(text, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. `compras_normalizar_items` admite la ficha propia
-- ═══════════════════════════════════════════════════════════════════════════

-- Un solo cambio en la regla de MGG del 30-10-2026: además de los artículos
-- que ya estaban en la SP, se admiten los que el propio usuario sacó con
-- `compras_ficha_desde_solicitud`. Se parchea la definición viva (como
-- 20261108800000) para no pisar ningún otro cambio de la función.
do $parche$
declare
  v_def   text := pg_get_functiondef('private.compras_normalizar_items(jsonb, jsonb, boolean)'::regprocedure);
  v_nuevo text;
begin
  if v_def like '%compras_ficha_del_solicitante%' then
    return;
  end if;

  v_nuevo := replace(v_def,
    $a$where (p ->> 'articulo_id')::bigint = v_art_id) then$a$,
    $b$where (p ->> 'articulo_id')::bigint = v_art_id)
         and not private.compras_ficha_del_solicitante(v_art_id) then$b$);

  if v_nuevo = v_def then
    raise exception 'No se encontró en compras_normalizar_items la regla de los nombres generales.';
  end if;

  execute v_nuevo;
end
$parche$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Comprobaciones
-- ═══════════════════════════════════════════════════════════════════════════

do $comprobar$
begin
  if to_regprocedure('private.codigo_de_articulo(text)') is null then
    raise exception 'Falta private.codigo_de_articulo: la ficha desde la solicitud saca el código con ella.';
  end if;
  if pg_get_functiondef('private.compras_normalizar_items(jsonb, jsonb, boolean)'::regprocedure)
       not like '%compras_ficha_del_solicitante%' then
    raise exception 'compras_normalizar_items no quedó parcheada.';
  end if;
end
$comprobar$;

notify pgrst, 'reload schema';
