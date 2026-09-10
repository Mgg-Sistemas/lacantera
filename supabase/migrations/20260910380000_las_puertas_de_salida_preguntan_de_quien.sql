/*
  LAS PUERTAS DE SALIDA PREGUNTAN DE QUIÉN.

  Cinco sitios sacan material de un almacén y ninguno tenía dónde decir de quién
  era: entregar a un trabajador, registrar salidas, dar de baja, anotar un conteo
  y despachar combustible. En un almacén con mezcla fallaban en voz alta —que es
  lo correcto— pero sin salida posible.

  La de la baja se me pasó al repasar, y apareció buscando en `pg_proc` cuáles
  funciones escriben un SALIDA_BAJA en vez de fiarme de la memoria. Es de las que
  más importa: dar de baja material de la gobernación cargándolo a la cuenta de
  la cantera sería regalarle una pérdida al que no la tuvo.

  EL DUEÑO VA POR RENGLÓN donde hay renglones: un parámetro suelto para toda la
  entrega obligaría a partir en dos una entrega de cinco cosas cuando solo una
  viene de material ajeno. En las de un solo artículo va como parámetro.

  Y NO BASTA CON DECIRLO: hay que comprobar contra SU saldo y sacarlo a SU
  promedio. Con lo físico se dejaría sacar más de lo que ese dueño tiene, y con
  el promedio mezclado se le regalaría valor a un lado.
*/

-- ---------------------------------------------------------------------------
-- 1. Entregar a un trabajador
-- ---------------------------------------------------------------------------
do $entregar$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'entregar_a_trabajador';

  if position('dueno_del_saldo' in v_def) > 0 then
    raise notice 'entregar_a_trabajador ya preguntaba de quien.';
    return;
  end if;

  v_def := replace(v_def,
    '  v_libres    numeric;',
    '  v_libres    numeric;
  v_dueno     text;');

  /* Se resuelve una vez por renglon, en cuanto se sabe que articulo es, para que
     las dos ramas —lo retornable y lo consumible— usen el mismo dueño. */
  v_def := replace(v_def,
    '    select * into v_art from public.articulos where id = (v_item->>''articulo_id'')::bigint;',
    '    select * into v_art from public.articulos where id = (v_item->>''articulo_id'')::bigint;
    v_dueno := case when v_art.id is null then null
                    else private.dueno_del_saldo(p_almacen_id, v_art.id, v_item->>''propietario'') end;');

  v_def := replace(v_def,
    '      select private.existencia_para_escribir(p_almacen_id, v_art.id)
        into v_libres;',
    '      select private.existencia_para_escribir(p_almacen_id, v_art.id, v_dueno)
        into v_libres;');

  v_def := replace(v_def,
    '      v_hay := private.existencia_para_escribir(p_almacen_id, v_art.id);',
    '      v_hay := private.existencia_para_escribir(p_almacen_id, v_art.id, v_dueno);');

  v_def := replace(v_def,
    '      v_costo := private.costo_promedio(p_almacen_id, v_art.id);',
    '      v_costo := private.costo_promedio(p_almacen_id, v_art.id, v_dueno);');

  v_def := replace(v_def,
    '        null, null, null, v_fecha, p_empleado_id, v_clase);',
    '        null, null, null, v_fecha, p_empleado_id, v_clase,
        p_propietario => v_dueno);');

  if position('dueno_del_saldo' in v_def) = 0
     or position('p_propietario => v_dueno' in v_def) = 0
     or position('v_art.id, v_dueno)' in v_def) = 0 then
    raise exception 'El anclaje de entregar_a_trabajador no encajo: no se toca nada.';
  end if;

  execute v_def;
  raise notice 'entregar_a_trabajador pregunta de quien.';
end $entregar$;

-- ---------------------------------------------------------------------------
-- 2. Registrar salidas
-- ---------------------------------------------------------------------------
do $salidas$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'registrar_salidas';

  if position('dueno_del_saldo' in v_def) > 0 then
    raise notice 'registrar_salidas ya preguntaba de quien.';
    return;
  end if;

  v_def := replace(v_def,
    '  v_nombre_pres text;',
    '  v_nombre_pres text; v_dueno text;');

  v_def := replace(v_def,
    'v_hay := private.existencia_para_escribir(v_almacen, v_articulo)',
    'v_hay := private.existencia_para_escribir(v_almacen, v_articulo,
                 private.dueno_del_saldo(v_almacen, v_articulo, v_r->>''propietario''))');

  v_def := replace(v_def,
    '    v_costo := private.costo_promedio(v_almacen, v_articulo);',
    '    v_dueno := private.dueno_del_saldo(v_almacen, v_articulo, v_r->>''propietario'');
    v_costo := private.costo_promedio(v_almacen, v_articulo, v_dueno);');

  v_def := replace(v_def,
    '      p_unidad_capturada => case when v_pres > 0 then private.presentacion_usada(v_articulo, nullif(btrim(coalesce(v_r->>''presentacion'', '''')), '''')) end,',
    '      p_propietario => v_dueno,
      p_unidad_capturada => case when v_pres > 0 then private.presentacion_usada(v_articulo, nullif(btrim(coalesce(v_r->>''presentacion'', '''')), '''')) end,');

  if position('dueno_del_saldo' in v_def) = 0
     or position('p_propietario => v_dueno' in v_def) = 0 then
    raise exception 'El anclaje de registrar_salidas no encajo: no se toca nada.';
  end if;

  execute v_def;
  raise notice 'registrar_salidas pregunta de quien.';
end $salidas$;

-- ---------------------------------------------------------------------------
-- 3. El conteo
-- ---------------------------------------------------------------------------
/*
  UN CONTEO DE UN SITIO MEZCLADO CUENTA LO DE ALGUIEN, NO TODO.

  Contar físicamente veinte sillas cuando ocho son de la gobernación no dice
  cuántas faltan de cada uno: el ajuste no sabría a quién cargarle la diferencia.

  Por eso el conteo pasa a ser DE UN DUEÑO. Es lo que además pide la operación —
  «los quieren lo más separado posible»— y lo que hace que el número tenga
  sentido: se cuenta lo suyo, que es lo que se puede distinguir en el estante.
*/
do $conteo$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'registrar_ajuste';

  if position('dueno_del_saldo' in v_def) > 0 then
    raise notice 'el conteo ya preguntaba de quien.';
    return;
  end if;

  v_def := replace(v_def,
    'p_envases jsonb DEFAULT NULL::jsonb)',
    'p_envases jsonb DEFAULT NULL::jsonb, p_propietario text DEFAULT NULL::text)');

  v_def := replace(v_def,
    '  v_cant       numeric;',
    '  v_cant       numeric;
  v_dueno      text;');

  v_def := replace(v_def,
    '  v_existencia := private.existencia_para_escribir(p_almacen_id, p_articulo_id);',
    '  -- Se cuenta lo de UN dueño: en un sitio mezclado, «veinte» no dice cuantas
  -- faltan de cada uno y el ajuste no sabria a quien cargarle la diferencia.
  v_dueno := private.dueno_del_saldo(p_almacen_id, p_articulo_id, p_propietario);
  v_existencia := private.existencia_para_escribir(p_almacen_id, p_articulo_id, v_dueno);');

  v_def := replace(v_def,
    '    v_costo := private.costo_promedio(p_almacen_id, p_articulo_id);',
    '    v_costo := private.costo_promedio(p_almacen_id, p_articulo_id, v_dueno);');

  v_def := replace(v_def,
    '      null, null, null, p_fecha,
      p_cantidad_capturada => nullif(coalesce(p_presentaciones, 0), 0),',
    '      null, null, null, p_fecha,
      p_propietario => v_dueno,
      p_cantidad_capturada => nullif(coalesce(p_presentaciones, 0), 0),');

  if position('dueno_del_saldo' in v_def) = 0
     or position('p_propietario => v_dueno' in v_def) = 0
     or position('p_propietario text DEFAULT' in v_def) = 0 then
    raise exception 'El anclaje del conteo no encajo: no se toca nada.';
  end if;

  drop function if exists public.registrar_ajuste(
    bigint, bigint, numeric, text, date, numeric, text, jsonb);
  execute v_def;
  raise notice 'el conteo pregunta de quien.';
end $conteo$;

-- ---------------------------------------------------------------------------
-- 4. El vale de combustible
-- ---------------------------------------------------------------------------
do $combustible$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'despachar_combustible';

  if position('dueno_del_saldo' in v_def) > 0 then
    raise notice 'el vale ya preguntaba de quien.';
    return;
  end if;

  v_def := replace(v_def,
    'p_nota text DEFAULT NULL::text)',
    'p_nota text DEFAULT NULL::text, p_propietario text DEFAULT NULL::text)');

  v_def := replace(v_def,
    '  v_mov bigint; v_id bigint; v_donde text;',
    '  v_mov bigint; v_id bigint; v_donde text; v_dueno text;');

  v_def := replace(v_def,
    '  v_hay := private.existencia_para_escribir(p_almacen_id, p_articulo_id);',
    '  v_dueno := private.dueno_del_saldo(p_almacen_id, p_articulo_id, p_propietario);
  v_hay := private.existencia_para_escribir(p_almacen_id, p_articulo_id, v_dueno);');

  v_def := replace(v_def,
    '  v_unitario := private.costo_promedio(p_almacen_id, p_articulo_id);',
    '  v_unitario := private.costo_promedio(p_almacen_id, p_articulo_id, v_dueno);');

  v_def := replace(v_def,
    '    null, null, null, v_fecha);',
    '    null, null, null, v_fecha, p_propietario => v_dueno);');

  if position('dueno_del_saldo' in v_def) = 0
     or position('p_propietario => v_dueno' in v_def) = 0
     or position('p_propietario text DEFAULT' in v_def) = 0 then
    raise exception 'El anclaje del vale no encajo: no se toca nada.';
  end if;

  drop function if exists public.despachar_combustible(
    bigint, bigint, numeric, text, text, bigint, text, numeric, bigint, text, text, date, text);
  execute v_def;
  raise notice 'el vale pregunta de quien.';
end $combustible$;

-- ---------------------------------------------------------------------------
-- 5. La baja
-- ---------------------------------------------------------------------------
do $baja$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'registrar_baja';

  if position('dueno_del_saldo' in v_def) > 0 then
    raise notice 'la baja ya preguntaba de quien.';
    return;
  end if;

  v_def := replace(v_def,
    'p_fecha date DEFAULT NULL::date)',
    'p_fecha date DEFAULT NULL::date, p_propietario text DEFAULT NULL::text)');

  v_def := replace(v_def,
    '  v_costo      numeric;',
    '  v_costo      numeric;
  v_dueno      text;');

  v_def := replace(v_def,
    '  v_existencia := private.existencia_para_escribir(p_almacen_id, p_articulo_id);',
    '  v_dueno := private.dueno_del_saldo(p_almacen_id, p_articulo_id, p_propietario);
  v_existencia := private.existencia_para_escribir(p_almacen_id, p_articulo_id, v_dueno);');

  v_def := replace(v_def,
    '  v_costo := private.costo_promedio(p_almacen_id, p_articulo_id);',
    '  v_costo := private.costo_promedio(p_almacen_id, p_articulo_id, v_dueno);');

  v_def := replace(v_def,
    '    btrim(p_motivo), null, null, null, p_fecha, null, null);',
    '    btrim(p_motivo), null, null, null, p_fecha, null, null,
    p_propietario => v_dueno);');

  if position('dueno_del_saldo' in v_def) = 0
     or position('p_propietario => v_dueno' in v_def) = 0
     or position('p_propietario text DEFAULT' in v_def) = 0 then
    raise exception 'El anclaje de la baja no encajo: no se toca nada.';
  end if;

  drop function if exists public.registrar_baja(
    bigint, bigint, numeric, text, text, text, date);
  execute v_def;
  raise notice 'la baja pregunta de quien.';
end $baja$;

/*
  COMPROBADO EN CALIENTE, con la transacción rodada hacia atrás y sobre un
  almacén mezclado a propósito:

    salida sin decir de quién : «Aqui hay material de varios dueños
                                 (GOBERNACION, LACANTERA): hay que decir de cual
                                 sale.»
    salida diciéndolo ........: sale a nombre de GOBERNACION y a SU costo (40,00),
                                no al mezclado
    conteo sin decir .........: el mismo rechazo
    conteo diciéndolo ........: ajusta solo lo suyo, le quedan 3
    entrega sin decir ........: el mismo rechazo
    entrega diciéndolo .......: descuenta de lo suyo, le quedan 5

  Un intento anterior de esta misma migración falló en el centinela de
  `entregar_a_trabajador` —dos líneas que yo daba por contiguas no lo eran— y la
  migración entera se deshizo sin tocar ninguna de las cinco. Es el
  comportamiento correcto, y por eso los centinelas están puestos.
*/
