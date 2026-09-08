/*
  LO QUE ENCONTRÓ LA REVISIÓN DE LOS BULTOS.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026, por MCP, y probada en transacción
  deshecha. Corrige dos cosas de las migraciones de hoy mismo.
  ————————————————————————————————————————————————————————————————————————

  Salió de someter el contar-en-bultos y la renumeración a una revisión
  adversarial antes de desplegarlos: cinco lentes buscando, dos escépticos por
  hallazgo. Devolvió veinticinco, **ocho de ellos bloqueantes**, y valió la pena
  cada minuto: los ocho estaban en el código que iba a salir esa tarde.

  Los bloqueantes eran de la pantalla y se arreglan en el mismo commit. Aquí van
  los dos que tocan la base.

  ═══════════════════════════════════════════════════════════════════════════
  1. Volver a subir la planilla de agosto duplicaría los once renumerados
  ═══════════════════════════════════════════════════════════════════════════

  **El efecto de segundo orden de la renumeración, y no se me había ocurrido.**

  Esta misma mañana once artículos pasaron de tener su nombre en el campo del
  código —«ACEITE AGROFLUIDOS»— a tener LUB-0001 y compañía. Pero la planilla
  con la que se cargaron en agosto sigue existiendo, y trae los códigos viejos.

  Al subirla otra vez, `select id from articulos where codigo = v_codigo` no
  encuentra nada —ese código ya no existe— y la fila entra como NUEVA: once
  artículos duplicados, cada uno con el nombre otra vez metido en el campo del
  código, y la existencia repartida entre los dos. Exactamente el problema que
  la renumeración venía a cerrar, reabierto por la propia renumeración.

  El arreglo es una línea: buscar también por `codigo_anterior`. Y la lección es
  más ancha: **renumerar sin enseñarle el cambio a quien busca por código deja
  la puerta abierta con el mapa viejo pegado al lado.**

  ═══════════════════════════════════════════════════════════════════════════
  2. Dos bultos y medio no se cuentan, y menos bultos tampoco
  ═══════════════════════════════════════════════════════════════════════════

  `p_presentaciones` entraba tal cual en `en_unidad_base`, así que «2,5
  tambores» daba 520 litros y «-3 tambores» restaba. Ninguna de las dos se puede
  contar recorriendo un almacén: los bultos enteros son enteros —eso es lo que
  los hace bultos— y lo que sobra del último se cuenta en lo suelto, que es
  justamente el campo de al lado.

  No muerde hoy porque la pantalla manda lo que teclea el selector. Pero la
  función es pública y la reja va en la base, no en el navegador.
*/

do $guarda$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='articulos'
                    and column_name='codigo_anterior') then
    raise exception 'Falta articulos.codigo_anterior.';
  end if;
end $guarda$;

-- ---------------------------------------------------------------------------
-- 1. La planilla reconoce tambien el codigo viejo
-- ---------------------------------------------------------------------------
do $patch$
declare v_def text; v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='cargar_articulos_por_lote';

  if position('codigo_anterior' in v_def) > 0 then
    raise notice 'cargar_articulos_por_lote ya mira el codigo anterior; no se toca.';
    return;
  end if;

  v_antes := v_def;
  v_def := replace(v_def,
    '      select id into v_id from public.articulos where codigo = v_codigo;',
'      /*
        Tambien por el codigo viejo: una planilla anterior a la renumeracion
        trae «ACEITE AGROFLUIDOS» donde hoy pone LUB-0001, y sin esto la fila
        entraria como un articulo nuevo con el nombre otra vez en el codigo.
      */
      select id into v_id from public.articulos
       where codigo = v_codigo or codigo_anterior = v_codigo;');
  if v_def = v_antes then raise exception 'No se encontro la busqueda por codigo.'; end if;

  execute v_def;
  raise notice 'cargar_articulos_por_lote reconoce el codigo anterior.';
end $patch$;

comment on function public.cargar_articulos_por_lote(jsonb, boolean) is
  'Carga o corrige articulos desde una planilla. El codigo dejo de ser obligatorio —exigirlo es lo que hizo que once articulos acabaran con el nombre metido en el campo del codigo—: sin el, la fila se resuelve por el nombre y, si es nueva, el codigo se lo pone la base al guardar. Reconoce tambien el `codigo_anterior`, para que una planilla anterior a la renumeracion actualice en vez de duplicar. Avisa en el informe cuando una fila nueva se parece a un articulo que ya esta, sin parar la carga.';

-- ---------------------------------------------------------------------------
-- 2. Los bultos se cuentan enteros y hacia arriba
-- ---------------------------------------------------------------------------
do $patch$
declare v_def text; v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='registrar_ajuste';

  if position('bultos enteros' in v_def) > 0 then
    raise notice 'registrar_ajuste ya lo comprueba; no se toca.';
    return;
  end if;

  v_antes := v_def;
  v_def := replace(v_def,
'  v_total := private.en_unidad_base(p_articulo_id, p_presentaciones, coalesce(p_contado, 0));',
'  -- Los bultos enteros son enteros: eso es lo que los hace bultos. Lo que sobra
  -- del ultimo va en lo suelto, que es el campo de al lado.
  if p_presentaciones is not null then
    if p_presentaciones < 0 then
      raise exception ''No se pueden contar bultos en negativo.'' using errcode = ''22023'';
    end if;
    if p_presentaciones <> trunc(p_presentaciones) then
      raise exception ''Los bultos se cuentan enteros: % no es un numero de bultos. Lo que sobra del ultimo va en lo suelto.'',
        private.numero_es(p_presentaciones, 2) using errcode = ''22023'';
    end if;
  end if;

  if p_contado is not null and p_contado < 0 then
    raise exception ''Lo contado no puede ser negativo.'' using errcode = ''22023'';
  end if;

  v_total := private.en_unidad_base(p_articulo_id, p_presentaciones, coalesce(p_contado, 0));');
  if v_def = v_antes then raise exception 'No se encontro la llamada a en_unidad_base.'; end if;

  execute v_def;
  raise notice 'registrar_ajuste comprueba los bultos.';
end $patch$;

/*
  COMPROBADO en transaccion deshecha, el 8 de septiembre:

    la planilla de agosto, con los codigos viejos:
      «ACEITE AGROFLUIDOS» ... ACTUALIZA   (antes habria sido NUEVO)
      «CABILLAS 3/8» ......... ACTUALIZA   (antes habria sido NUEVO)
      «LUB-0006» ............. ACTUALIZA   (el codigo nuevo sigue valiendo)
      «NUEVO-1» .............. NUEVO       (lo que de verdad es nuevo, lo es)

    el ajuste:
      2,5 bultos ....... rebota: «Los bultos se cuentan enteros: 2,50 no es un
                         numero de bultos. Lo que sobra del ultimo va en lo suelto.»
      -3 bultos ........ rebota: «No se pueden contar bultos en negativo.»
      sueltas -5 ....... rebota: «Lo contado no puede ser negativo.»
      4 bultos y 10 .... pasa, como debe

  Al terminar: 15 articulos, 19 movimientos, valor 868.927.307,04, 0 cedulas sin
  letra. Nada de produccion tocado.

  LO QUE LA REVISION DEJO ABIERTO, y es de otra tanda:

    - BOTAS DE SEGURIDAD tiene `unidad` PAR y `presentacion` PAR, asi que los
      mensajes dicen «4 PAR y 2 PAR». El dato esta mal —una caja de veinte pares
      no es un par— y es uno de los quince articulos por revisar.
    - La nota de salida en papel sigue imprimiendo el equivalente y no lo que se
      conto: `notaDelMovimiento` no lee las tres columnas capturadas.
*/
