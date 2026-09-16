/*
  LA SALIDA DICE PARA QUIÉN SALE

  Christopher, 16/09/2026, sobre lo que hoy no se puede contestar:

    «¿Cuántas mascarillas se le han dado al personal de cribado?, ¿cuántos
    lentes de sol se le han dado a los conductores?, ¿en agosto el almacenista X
    dio algún insumo a los operadores?».

  El libro decía qué salió, de dónde, cuándo, por qué y quién lo registró. Para
  QUIÉN, no: como mucho aparecía en el relato, escrito a mano y distinto cada
  vez, que es lo mismo que no estar.

  EL GRUPO ES UN NODO DEL ORGANIGRAMA

  La empresa ya mantiene esa lista, con sus unidades —PLANTA, COCINA, ALMACEN—
  y sus cargos —CHOFERES, MOTORIZADOS, OPERADORES—. Los tres ejemplos de arriba
  son uno de cada: un área, un cargo y otro cargo. Hacer una lista nueva al lado
  habría sido tener dos organigramas que se contradicen al mes.

  Se guarda el nodo, no su nombre, porque el nombre se corrige y la pregunta es
  «cuánto fue a ese grupo», no «cuánto se escribió con esas letras». Un nodo del
  que ya colgó una salida no se puede borrar: se apaga, y el libro sigue
  pudiendo decir a dónde fue lo que salió.

  OBLIGATORIO, Y POR ESO HAY UNA PUERTA NUEVA PARA LEER LA LISTA

  El organigrama lo cierra su RLS a quien tiene nómina, y quien saca material no
  la tiene. En vez de abrir la tabla —una segunda política de SELECT no
  restringe: abre—, se añade una función que devuelve solo id, nombre y camino
  de cada nodo y exige permiso de inventario.

  LO QUE NO SE TOCA

  Ninguna fila del libro. La columna queda vacía en todo lo anterior: no se
  puede saber a posteriori para quién salió cada cosa, y no se va a inventar.
  Tampoco cambian las otras puertas que sacan material —la entrega a un
  trabajador, el combustible, el taller—: esas ya dicen a quién o a qué van.
*/
alter table public.inventario_movimientos
  add column if not exists grupo_id bigint references public.organigrama_nodos(id);

comment on column public.inventario_movimientos.grupo_id is
  'Para qué grupo de gente salió: el nodo del organigrama —unidad o cargo— que lo recibe. '
  'Obligatorio en las salidas por Sacar desde el 16/09/2026; nulo en lo anterior y en lo que no es una salida.';

create index if not exists inventario_movimientos_grupo_idx
  on public.inventario_movimientos (grupo_id) where grupo_id is not null;

-- 1. registrar_movimiento aprende a escribirlo. Cambia la firma, así que la
--    vieja se quita: con las dos, una llamada sin el parámetro nuevo no sabría
--    cuál elegir.
do $mig$
declare
  v_firma  text := 'private.registrar_movimiento(text,integer,bigint,bigint,numeric,numeric,text,bigint,bigint,bigint,date,bigint,text,text,numeric,numeric,text,numeric,numeric,text,text,text,text)';
  v_def    text := pg_get_functiondef(v_firma::regprocedure);
  v_anclas text[] := array[
    $a$p_razon_salida text DEFAULT NULL::text)$a$,
    $a$moneda_capturada, razon_salida)$a$,
    $a$nullif(btrim(coalesce(p_razon_salida, '')), ''))$a$];
  v_nuevas text[] := array[
    $n$p_razon_salida text DEFAULT NULL::text, p_grupo bigint DEFAULT NULL::bigint)$n$,
    $n$moneda_capturada, razon_salida, grupo_id)$n$,
    $n$nullif(btrim(coalesce(p_razon_salida, '')), ''),
     -- Para qué grupo de gente salió: ver la columna.
     p_grupo)$n$];
begin
  for i in 1 .. array_length(v_anclas, 1) loop
    if (length(v_def) - length(replace(v_def, v_anclas[i], ''))) / length(v_anclas[i]) <> 1 then
      raise exception 'registrar_movimiento: el ancla % no aparece exactamente una vez', i;
    end if;
    v_def := replace(v_def, v_anclas[i], v_nuevas[i]);
  end loop;

  execute 'drop function ' || v_firma;
  execute v_def;
end
$mig$;

-- 2. registrar_salidas lo exige y lo pasa.
do $mig$
declare
  v_firma  text := 'public.registrar_salidas(bigint,jsonb,text,text,date)';
  v_def    text := pg_get_functiondef(v_firma::regprocedure);
  v_anclas text[] := array[
    $a$p_fecha date DEFAULT NULL::date)$a$,
    $a$    raise exception 'No hay nada que sacar: la salida no trae renglones.' using errcode = '22023';
  end if;$a$,
    $a$p_razon_salida => v_clase.nombre);$a$];
  v_nuevas text[] := array[
    $n$p_fecha date DEFAULT NULL::date, p_grupo_id bigint DEFAULT NULL::bigint)$n$,
    $n$    raise exception 'No hay nada que sacar: la salida no trae renglones.' using errcode = '22023';
  end if;

  /*
    PARA QUIÉN SALE, y no vale dejarlo en blanco.

    El grupo es un nodo del organigrama —una unidad o un cargo—, que es la lista
    que la empresa ya mantiene. Si falta uno, se añade allí y no aquí.
  */
  if p_grupo_id is null then
    raise exception 'Falta decir para quién sale. Elige el grupo en la lista.'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.organigrama_nodos o
                  where o.id = p_grupo_id and o.activo) then
    raise exception 'Ese grupo no está en el organigrama, o está apagado.'
      using errcode = '23503';
  end if;$n$,
    $n$p_razon_salida => v_clase.nombre,
      p_grupo => p_grupo_id);$n$];
begin
  for i in 1 .. array_length(v_anclas, 1) loop
    if (length(v_def) - length(replace(v_def, v_anclas[i], ''))) / length(v_anclas[i]) <> 1 then
      raise exception 'registrar_salidas: el ancla % no aparece exactamente una vez', i;
    end if;
    v_def := replace(v_def, v_anclas[i], v_nuevas[i]);
  end loop;

  execute 'drop function ' || v_firma;
  execute v_def;
end
$mig$;

-- 3. La lista de grupos, para quien saca material y no tiene nómina.
create or replace function public.grupos_de_salida()
returns table (id bigint, nombre text, camino text, tipo text, activo boolean)
language plpgsql
stable
security definer
set search_path to ''
as $func$
begin
  perform private.exigir_permiso('INVENTARIO', 'LECTURA');

  /*
    Devuelve TODOS los nodos, encendidos y apagados, con el camino armado. Los
    apagados no se ofrecen al sacar, pero hacen falta para poder decir a dónde
    fue una salida vieja cuando ese grupo ya no existe en la empresa.
  */
  return query
  with recursive arbol(id, camino, nombre, tipo, activo, orden) as (
    select n.id, n.nombre::text, n.nombre, n.tipo, n.activo, lpad(n.orden::text, 4, '0')
      from public.organigrama_nodos n
     where n.padre_id is null
    union all
    select h.id, a.camino || ' › ' || h.nombre, h.nombre, h.tipo, h.activo,
           a.orden || '.' || lpad(h.orden::text, 4, '0')
      from public.organigrama_nodos h
      join arbol a on a.id = h.padre_id
  )
  select a.id, a.nombre, a.camino, a.tipo, a.activo
    from arbol a
   order by a.orden, a.camino;
end;
$func$;

revoke all on function public.grupos_de_salida() from public, anon;
grant execute on function public.grupos_de_salida() to authenticated;

comment on function public.grupos_de_salida() is
  'La lista de grupos del organigrama para el campo «para quién sale». '
  'Existe porque el organigrama lo cierra su RLS a quien tiene nómina, y quien saca material no la tiene.';

-- 4. Un grupo del que ya colgó una salida no se borra.
do $mig$
declare
  v_def   text := pg_get_functiondef('public.eliminar_nodo_organigrama(bigint)'::regprocedure);
  v_ancla text := $a$  delete from public.organigrama_nodos where id = p_id;$a$;
begin
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'eliminar_nodo_organigrama: el borrado no aparece exactamente una vez';
  end if;
  execute replace(v_def, v_ancla, $n$  -- Ni si de él cuelgan salidas ya registradas: el libro tiene que poder
  -- decir para quién salió cada cosa dentro de diez años.
  if exists (select 1 from public.inventario_movimientos m where m.grupo_id = p_id) then
    raise exception 'De ese grupo cuelgan salidas ya registradas: no se puede borrar.'
      using errcode = '23503',
            hint = 'Si ya no existe en la empresa, apágalo en vez de borrarlo.';
  end if;

  delete from public.organigrama_nodos where id = p_id;$n$);
end
$mig$;

do $ver$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'inventario_movimientos'
                    and column_name = 'grupo_id') then
    raise exception 'el libro no tiene dónde guardar para quién salió';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'private' and p.proname = 'registrar_movimiento') <> 1
     or position('p_grupo' in pg_get_functiondef('private.registrar_movimiento'::regproc)) = 0 then
    raise exception 'registrar_movimiento no quedó con una sola firma que guarde el grupo';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'registrar_salidas') <> 1
     or position('p_grupo => p_grupo_id' in pg_get_functiondef('public.registrar_salidas'::regproc)) = 0
     or position('Falta decir para quién sale' in pg_get_functiondef('public.registrar_salidas'::regproc)) = 0 then
    raise exception 'registrar_salidas no exige el grupo o no lo pasa';
  end if;
  if not has_function_privilege('authenticated', 'public.grupos_de_salida()', 'execute') then
    raise exception 'la lista de grupos no la puede leer quien tiene sesión';
  end if;
  if position('grupo_id' in pg_get_functiondef('public.eliminar_nodo_organigrama'::regproc)) = 0 then
    raise exception 'todavía se puede borrar un grupo con salidas detrás';
  end if;
end
$ver$;
