/*
  LAS RESTRICCIONES FRENAN POR TODOS LOS CAMINOS

  El carril de base de datos auditó `20260916190000` y encontró casillas que la
  base pregunta por su nombre, pero no solo por su nombre:

  - `asignar_chofer`, `terminar_chofer` y `guardar_vehiculo` dejan pasar a quien
    tenga Maquinaria o Despachos en escritura O la casilla. Con el nivel, la
    casilla ni se mira, y restringirla no le quitaba nada.
  - `crear_articulo` y `editar_articulo` piden el rol de Compras o Almacén y no
    miran `INVENTARIO.EDITAR_CATALOGO`, que sí miran las presentaciones.
  - `DESPACHOS.VER_VEHICULOS` e `INVENTARIO.VER_VALORACION` son de leer, y lo que
    leen lo abre también la política de la tabla por nivel de módulo: la lista de
    vehículos, y los movimientos de inventario con su costo. Restringirlas
    escondería el dato en unas pantallas y no en la tabla.

  Una restricción que no frena es peor que ninguna, porque quien la puso cree que
  está puesta. Las cinco funciones miran la restricción antes que el nivel, y las
  dos de leer dejan de ofrecerse para restringir, diciendo por qué.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Las que se pueden cerrar del todo: la restricción antes que el nivel
-- ═══════════════════════════════════════════════════════════════════════════

do $parche$
declare
  v_def text;
  v_n   integer;
  r     record;
begin
  for r in
    select * from (values
      (1, 'public.asignar_chofer(bigint, bigint, text, text, date, text, text)',
       $a$  if not (private.tiene_permiso('MAQUINARIA', 'ESCRITURA')
          or private.tiene_permiso('DESPACHOS', 'ESCRITURA')
          or private.puede_accion('DESPACHOS.ASIGNAR_CHOFER')) then$a$,
       $b$  -- La restricción antes que el nivel: con Maquinaria o Despachos en
  -- escritura la casilla ni se miraba, y restringirla no quitaba nada.
  if private.accion_restringida('DESPACHOS.ASIGNAR_CHOFER') then
    raise exception 'No puedes asignar ni terminar choferes: se te restringió.' using errcode = '42501';
  end if;

  if not (private.tiene_permiso('MAQUINARIA', 'ESCRITURA')
          or private.tiene_permiso('DESPACHOS', 'ESCRITURA')
          or private.puede_accion('DESPACHOS.ASIGNAR_CHOFER')) then$b$),

      (2, 'public.terminar_chofer(bigint, date, text)',
       $a$  if not (private.tiene_permiso('MAQUINARIA', 'ESCRITURA')
          or private.tiene_permiso('DESPACHOS', 'ESCRITURA')
          or private.puede_accion('DESPACHOS.ASIGNAR_CHOFER')) then$a$,
       $b$  -- La restricción antes que el nivel, como en `asignar_chofer`.
  if private.accion_restringida('DESPACHOS.ASIGNAR_CHOFER') then
    raise exception 'No puedes asignar ni terminar choferes: se te restringió.' using errcode = '42501';
  end if;

  if not (private.tiene_permiso('MAQUINARIA', 'ESCRITURA')
          or private.tiene_permiso('DESPACHOS', 'ESCRITURA')
          or private.puede_accion('DESPACHOS.ASIGNAR_CHOFER')) then$b$),

      (3, 'public.guardar_vehiculo(bigint, text, text, numeric, text, numeric, boolean, text, bigint, boolean, text)',
       $a$  if not (private.tiene_permiso('MAQUINARIA', 'ESCRITURA')
          or private.tiene_permiso('DESPACHOS', 'ESCRITURA')
          or private.puede_accion('DESPACHOS.EDITAR_VEHICULO')) then$a$,
       $b$  -- La restricción antes que el nivel: con Maquinaria o Despachos en
  -- escritura la casilla ni se miraba, y restringirla no quitaba nada.
  if private.accion_restringida('DESPACHOS.EDITAR_VEHICULO') then
    raise exception 'No puedes guardar vehículos: se te restringió.' using errcode = '42501';
  end if;

  if not (private.tiene_permiso('MAQUINARIA', 'ESCRITURA')
          or private.tiene_permiso('DESPACHOS', 'ESCRITURA')
          or private.puede_accion('DESPACHOS.EDITAR_VEHICULO')) then$b$),

      (4, 'public.crear_articulo(text, text, text, text, text, boolean, numeric, text, boolean, text, numeric, text, text, boolean, numeric)',
       $a$  perform private.exigir_rol('COMPRAS', 'ALMACEN');$a$,
       $b$  perform private.exigir_rol('COMPRAS', 'ALMACEN');

  -- El rol no mira la casilla, y las presentaciones sí: sin esto, a quien se le
  -- restringía editar el catálogo solo se le cerraban las presentaciones.
  if private.accion_restringida('INVENTARIO.EDITAR_CATALOGO') then
    raise exception 'No puedes crear artículos: editar el catálogo se te restringió.' using errcode = '42501';
  end if;$b$),

      (5, 'public.editar_articulo(bigint, text, text, text, text, boolean, numeric, text, boolean, text, numeric, text, text, boolean, numeric, text)',
       $a$  perform private.exigir_rol('COMPRAS', 'ALMACEN');$a$,
       $b$  perform private.exigir_rol('COMPRAS', 'ALMACEN');

  -- El rol no mira la casilla; ver `crear_articulo`.
  if private.accion_restringida('INVENTARIO.EDITAR_CATALOGO') then
    raise exception 'No puedes corregir artículos: editar el catálogo se te restringió.' using errcode = '42501';
  end if;$b$)
    ) as t(n, funcion, antes, despues)
    order by n
  loop
    v_def := pg_get_functiondef(r.funcion::regprocedure);
    v_n := (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes);
    if v_n <> 1 then
      raise exception 'En % el texto aparece % veces.', r.funcion, v_n;
    end if;
    execute replace(v_def, r.antes, r.despues);
  end loop;
end
$parche$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Las de leer que no se pueden cerrar del todo: no se ofrecen
-- ═══════════════════════════════════════════════════════════════════════════

create function private.restriccion_que_no_cierra(p_accion text)
returns text
language sql
immutable
set search_path to ''
as $func$
  /*
    POR QUÉ UNA CASILLA QUE LA BASE PREGUNTA NO SE PUEDE RESTRINGIR, o nula.

    Es una lista escrita a mano, a propósito y corta: la de las casillas que la
    base pregunta por su nombre en unas pantallas mientras la política de la
    tabla abre el mismo dato por nivel de módulo. Se detectan leyendo, no con una
    cuenta, así que el día que alguien cierre la tabla por la casilla se quita de
    aquí.
  */
  select case p_accion
    when 'DESPACHOS.VER_VEHICULOS' then
      'La lista de vehículos la abre el nivel de Despachos, Ventas, Maquinaria o Explotación: restringir la casilla solo escondería el historial de uno. Para quitársela, cámbiale el rol.'
    when 'INVENTARIO.VER_VALORACION' then
      'Los movimientos de inventario, con su costo, los abre el nivel de Inventario: restringir la casilla escondería el valor en las pantallas, pero no en la tabla. Para quitársela, cámbiale el rol.'
  end
$func$;

revoke all on function private.restriccion_que_no_cierra(text) from public, anon;

do $parche$
declare
  v_def text;
  v_n   integer;
  r     record;
begin
  for r in
    select * from (values
      (1, 'public.restringir_accion(uuid, text, text, date, date)',
       $a$  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe por qué se le restringe.$a$,
       $b$  if private.restriccion_que_no_cierra(p_accion) is not null then
    raise exception '%', private.restriccion_que_no_cierra(p_accion) using errcode = '55000';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe por qué se le restringe.$b$),

      (2, 'public.acciones_restringibles()',
       $a$     and a.codigo in (select private.acciones_que_la_base_pregunta())$a$,
       $b$     and a.codigo in (select private.acciones_que_la_base_pregunta())
     and private.restriccion_que_no_cierra(a.codigo) is null$b$)
    ) as t(n, funcion, antes, despues)
    order by n
  loop
    v_def := pg_get_functiondef(r.funcion::regprocedure);
    v_n := (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes);
    if v_n <> 1 then
      raise exception 'En % el texto aparece % veces.', r.funcion, v_n;
    end if;
    execute replace(v_def, r.antes, r.despues);
  end loop;
end
$parche$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Comprobación
-- ═══════════════════════════════════════════════════════════════════════════

do $ver$
begin
  if exists (select 1 from public.acciones_restringibles() c
              where c in ('DESPACHOS.VER_VEHICULOS', 'INVENTARIO.VER_VALORACION')) then
    raise exception 'se siguen ofreciendo las dos de leer';
  end if;
  if position('accion_restringida' in pg_get_functiondef(
       'public.guardar_vehiculo(bigint, text, text, numeric, text, numeric, boolean, text, bigint, boolean, text)'::regprocedure)) = 0 then
    raise exception 'guardar_vehiculo no mira la restricción';
  end if;
  if position('EDITAR_CATALOGO' in pg_get_functiondef(
       'public.crear_articulo(text, text, text, text, text, boolean, numeric, text, boolean, text, numeric, text, text, boolean, numeric)'::regprocedure)) = 0 then
    raise exception 'crear_articulo no mira la restricción';
  end if;
end
$ver$;
