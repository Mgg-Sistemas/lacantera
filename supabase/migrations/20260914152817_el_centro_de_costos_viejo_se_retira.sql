/*
  EL CENTRO DE COSTOS VIEJO SE RETIRA.

  Leía `tesoreria_movimientos`, que tiene cero filas desde que el rol de
  tesorería se retiró el 25/08, y dividía entre un volumen tecleado a mano.
  Con el módulo COSTOS ya hay una sola respuesta a «cuánto cuesta el metro
  cúbico», y dos respuestas es exactamente lo que la migración de agosto
  quiso evitar. Se retira entero: las cuatro funciones y la vista. Dejar la
  pestaña sin sus funciones habría sido una pantalla en blanco; dejar las
  funciones sin pestaña, dos respuestas esperando a que alguien las compare.

  ═══════════════════════════════════════════════════════════════════════════
  LO QUE SE QUEDA, Y POR QUÉ
  ═══════════════════════════════════════════════════════════════════════════

  `presupuestos` sigue siendo el fondo asignado: lo que se autorizó gastar en
  un período, contra lo que se compara el gasto. No es el fondo real —ese
  vive en `costo_cajas`— sino el tope. `categorias_gasto` clasifica lo manual
  del centro de costo y lo que Tesorería deduce. Y `clasificar_gasto` sigue
  siendo de tesorería y no se toca.

  Las tres cambian de dueño: las gobernaba COMPRAS, y ahora COMPRAS o COSTOS,
  con un solo `exigir` por función. Si no, el gerente con COSTOS:TOTAL vería
  el fondo asignado en blanco sin ningún error.

  Sexta pieza de siete.
*/

drop function if exists public.resumen_centro_costos(date, date);
drop function if exists public.gasto_por_categoria(date, date, text);
drop function if exists public.gasto_por_categoria(date, date);
drop function if exists public.gastos_del_periodo(date, date, text, integer);
drop view if exists public.v_gastos;

comment on table public.presupuestos is
  'El fondo asignado: lo que se autorizo gastar en un periodo. No es una cuenta '
  'ni el fondo real (ese vive en costo_cajas): es el tope contra el que se '
  'compara el gasto. La pantalla de Compras que lo creo se retiro el '
  '14/09/2026; lo ensena el centro de costo.';

-- ---------------------------------------------------------------------------
-- COMPRAS o COSTOS, en un solo sitio
-- ---------------------------------------------------------------------------
create or replace function private.exigir_compras_o_costos(p_nivel text)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if private.tiene_permiso('COMPRAS', p_nivel) or private.tiene_permiso('COSTOS', p_nivel) then
    return;
  end if;
  raise exception 'Tu rol no tiene permiso para esto: hace falta % en Compras o en el centro de costo.', p_nivel
    using errcode = '42501';
end;
$$;

drop policy if exists presupuestos_lectura on public.presupuestos;
create policy presupuestos_lectura on public.presupuestos
  for select to authenticated
  using (private.tiene_permiso('COMPRAS', 'LECTURA') or private.tiene_permiso('COSTOS', 'LECTURA'));

create or replace function public.guardar_presupuesto(
  p_id                  bigint  default null,
  p_desde               date    default null,
  p_hasta               date    default null,
  p_monto               numeric default null,
  p_moneda              character varying default 'USD',
  p_produccion_asignada numeric default null,
  p_unidad_produccion   text    default 'M3',
  p_nota                text    default null,
  p_activo              boolean default true
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_id bigint;
begin
  perform private.exigir_compras_o_costos('TOTAL');

  if p_desde is null or p_hasta is null then
    raise exception 'Hay que decir desde cuándo y hasta cuándo.' using errcode = '22023';
  end if;
  if p_hasta < p_desde then
    raise exception 'El período termina antes de empezar.' using errcode = '22023';
  end if;
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto asignado tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.presupuestos
      (numero, desde, hasta, monto, moneda, produccion_asignada, unidad_produccion, nota, activo, creado_por)
    values
      (private.siguiente_numero('PRE'), p_desde, p_hasta, p_monto, p_moneda,
       p_produccion_asignada, coalesce(p_unidad_produccion, 'M3'), p_nota, coalesce(p_activo, true),
       (select auth.uid()))
    returning id into v_id;
  else
    update public.presupuestos
       set desde = p_desde,
           hasta = p_hasta,
           monto = p_monto,
           moneda = p_moneda,
           produccion_asignada = p_produccion_asignada,
           unidad_produccion = coalesce(p_unidad_produccion, 'M3'),
           nota = p_nota,
           activo = coalesce(p_activo, true)
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'No existe el presupuesto %.', p_id using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end;
$func$;

create or replace function public.guardar_categoria_gasto(
  p_codigo text default null,
  p_nombre text default null,
  p_padre  text default null,
  p_orden  smallint default null,
  p_activa boolean default true
)
returns text
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_codigo text;
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_padre  text := nullif(btrim(coalesce(p_padre, '')), '');
  v_tiene_hijos boolean;
begin
  perform private.exigir_compras_o_costos('TOTAL');

  if length(v_nombre) < 3 then
    raise exception 'La categoría necesita un nombre.' using errcode = '22023';
  end if;

  -- Dos niveles y no más.
  if v_padre is not null then
    if not exists (select 1 from public.categorias_gasto c where c.codigo = v_padre) then
      raise exception 'No existe la categoría "%".', v_padre using errcode = 'P0002';
    end if;
    if exists (select 1 from public.categorias_gasto c
                where c.codigo = v_padre and c.padre is not null) then
      raise exception 'No se puede colgar de "%": esa ya está dentro de otra.', v_padre
        using errcode = '22023',
              hint = 'Las categorías van en dos niveles: un grupo y su detalle.';
    end if;
  end if;

  if p_codigo is null then
    v_codigo := private.codigo_desde_nombre(v_nombre);

    if exists (select 1 from public.categorias_gasto c where c.codigo = v_codigo) then
      raise exception 'Ya hay una categoría que se llama así.' using errcode = '23505';
    end if;

    insert into public.categorias_gasto (codigo, nombre, padre, orden, activa)
    values (v_codigo, v_nombre, v_padre, coalesce(p_orden, 100::smallint), coalesce(p_activa, true));

    return v_codigo;
  end if;

  v_codigo := p_codigo;

  if not exists (select 1 from public.categorias_gasto c where c.codigo = v_codigo) then
    raise exception 'No existe la categoría "%".', v_codigo using errcode = 'P0002';
  end if;

  select exists (select 1 from public.categorias_gasto h where h.padre = v_codigo)
    into v_tiene_hijos;

  if v_tiene_hijos and v_padre is not null then
    raise exception '"%" tiene categorías dentro, así que no puede meterse dentro de otra.', v_codigo
      using errcode = '22023',
            hint = 'Saca primero lo que tiene dentro, o déjala como grupo principal.';
  end if;

  if v_tiene_hijos and coalesce(p_activa, true) = false
     and exists (select 1 from public.categorias_gasto h where h.padre = v_codigo and h.activa) then
    raise exception 'No se puede desactivar "%" mientras tenga categorías activas dentro.', v_codigo
      using errcode = '22023';
  end if;

  update public.categorias_gasto
     set nombre = v_nombre,
         padre  = v_padre,
         orden  = coalesce(p_orden, orden),
         activa = coalesce(p_activa, true)
   where codigo = v_codigo;

  return v_codigo;
end;
$func$;

-- Borrar solo lo que nunca se usó. Antes contaba sobre `v_gastos`; ahora se
-- mira donde puede estar una categoría: la clase puesta a mano en tesorería,
-- el libro del centro de costo y los gastos fijos.
create or replace function public.borrar_categoria_gasto(p_codigo text)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_usos integer;
  v_de_la_maquina text[] := array[
    'SUELDOS', 'GASOIL', 'LUBRICANTES', 'REPUESTOS', 'HERRAMIENTAS', 'EPP', 'INSUMOS_VARIOS'
  ];
begin
  perform private.exigir_compras_o_costos('TOTAL');

  if p_codigo = any (v_de_la_maquina) then
    raise exception 'No se puede borrar "%": el sistema clasifica gastos ahí solo.', p_codigo
      using errcode = '23503',
            hint = 'Desactívala si no quieres verla, o cámbiale el nombre.';
  end if;

  if exists (select 1 from public.categorias_gasto h where h.padre = p_codigo) then
    raise exception 'No se puede borrar: tiene categorías dentro.' using errcode = '23503';
  end if;

  select (select count(*) from public.tesoreria_movimientos t where t.categoria = p_codigo)
       + (select count(*) from public.costo_movimientos m where m.categoria = p_codigo)
       + (select count(*) from public.costo_gastos_fijos f where f.categoria = p_codigo)
    into v_usos;

  if v_usos > 0 then
    raise exception 'No se puede borrar: hay % registro(s) en esa categoría.', v_usos
      using errcode = '23503',
            hint = 'Desactívala. Deja de ofrecerse al registrar, y lo viejo sigue contando.';
  end if;

  delete from public.categorias_gasto where codigo = p_codigo;
end;
$func$;
