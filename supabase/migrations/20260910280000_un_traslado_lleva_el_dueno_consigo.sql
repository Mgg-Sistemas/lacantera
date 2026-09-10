/*
  UN TRASLADO LLEVA EL DUEÑO CONSIGO.

  Christopher: «¿cómo hago un traslado solo de items de la gobernación a un
  almacén o taller?».

  Hasta ahora: no se podía. Esta puerta rechazaba mover entre sitios de dueños
  distintos con el argumento de que «eso no es un traslado, es cambiar de dueño».
  El argumento era correcto DENTRO del modelo viejo, donde el dueño lo ponía el
  sitio: llegar a un almacén nuestro era volverse nuestro.

  Ahora el dueño viaja con el movimiento, así que mover la bomba de la
  gobernación a nuestro taller no la vuelve nuestra. Sigue siendo suya, está en
  nuestro taller, y las dos cosas son ciertas a la vez. La prohibición pierde su
  motivo y se retira.

  Y de paso contesta la otra mitad de su pregunta: sí, un taller puede ser de
  otro dueño —el dueño es una propiedad de cualquier sitio— pero ya no hace falta
  que lo sea para poder meter material ajeno.

  ═══════════════════════════════════════════════════════════════════════════
  DE QUIÉN SE MUEVE, CUANDO EL ORIGEN TIENE MEZCLA
  ═══════════════════════════════════════════════════════════════════════════

  Se admite decirlo. Cuando no se dice, se mira qué hay en el origen: con un solo
  dueño no hay nada que preguntar; con varios se para. Es el mismo criterio que
  aplica `registrar_movimiento` una capa más abajo, a propósito, para que las dos
  digan lo mismo y no haya una que acepte lo que la otra rechaza.

  EL COSTO ES EL DEL DUEÑO Y NO EL DEL SITIO. Tres bombas nuestras a 10 y ocho
  suyas a 40 no promedian a nada que sirva para valorar ninguna de las dos: sacar
  una suya al promedio mezclado le regalaría valor a un lado y se lo quitaría al
  otro, y el destino heredaría el error.

  ═══════════════════════════════════════════════════════════════════════════
  LO QUE NO CAMBIA
  ═══════════════════════════════════════════════════════════════════════════

  La reja del tanque sin costo se queda entera: eso no es una cuestión de dueño
  sino de régimen de valoración, y sigue siendo verdad que un promedio de cero
  hunde el del destino.
*/
do $traslado$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'transferir_existencia';

  if position('v_dueno' in v_def) > 0 then
    raise notice 'el traslado ya llevaba el dueño.';
    return;
  end if;

  -- 1. Un parámetro más, al final.
  v_def := replace(v_def,
    'p_suelto numeric DEFAULT NULL::numeric)',
    'p_suelto numeric DEFAULT NULL::numeric, p_propietario text DEFAULT NULL::text)');

  -- 2. La variable.
  v_def := replace(v_def,
    'v_cantidad numeric; v_nombre_pres text;',
    'v_cantidad numeric; v_nombre_pres text; v_dueno text; v_duenos text[];');

  -- 3. Fuera la prohibición, dentro la resolución.
  v_def := replace(v_def,
'  /*
    LO DE UN DUENO NO SE MEZCLA CON LO DE OTRO. Mover una silla de la
    gobernacion a un almacen nuestro no es un traslado: es cambiar de dueno, y
    eso no lo decide quien esta moviendo una silla.
  */
  if v_origen.propietario is distinct from v_destino.propietario then
    raise exception ''De "%" no se puede trasladar a "%": lo de un dueno no se mezcla con lo de otro.'',
      v_origen.nombre, v_destino.nombre
      using errcode = ''22023'',
            hint = ''Si de verdad cambio de dueno, eso se anota como una salida y una entrada, no como un traslado: hace falta decir por que dejo de ser de uno y paso a ser del otro.'';
  end if;

  v_existencia := private.existencia_para_escribir(p_origen_id, p_articulo_id);

  if v_cantidad > v_existencia then
    select nombre into v_articulo from public.articulos where id = p_articulo_id;
    raise exception ''En "%" solo hay % de "%" y se intentan mover %.'',
      v_origen.nombre, private.numero_es(v_existencia, 4),
      coalesce(v_articulo, p_articulo_id::text), private.numero_es(v_cantidad, 4)
      using errcode = ''22023'';
  end if;

  v_costo := private.costo_promedio(p_origen_id, p_articulo_id);',
'  /*
    DE QUIEN ES LO QUE SE MUEVE.

    Un traslado NO cambia de dueño: lo lleva. Antes esto era una prohibicion
    —«lo de un dueño no se mezcla con lo de otro»— y tenia sentido cuando el
    dueño lo ponia el sitio, porque entonces llegar a un almacen nuestro era
    volverse nuestro. Ahora el dueño viaja, asi que la bomba de la gobernacion
    puede estar en nuestro taller sin dejar de ser suya.

    Si no se dice de quien, se mira que hay en el origen: con un solo dueño no
    hay nada que preguntar, con varios se para. Es el mismo criterio que aplica
    `registrar_movimiento`, para que las dos capas digan lo mismo.
  */
  v_dueno := nullif(btrim(coalesce(p_propietario, '''')), '''');

  if v_dueno is null then
    select array_agg(distinct t.propietario) into v_duenos
      from (select m.propietario, sum(m.cantidad * m.signo) as saldo
              from public.inventario_movimientos m
             where m.almacen_id = p_origen_id and m.articulo_id = p_articulo_id
             group by m.propietario
            having sum(m.cantidad * m.signo) > 0) t;

    if coalesce(array_length(v_duenos, 1), 0) > 1 then
      raise exception ''En "%" hay material de varios dueños (%): hay que decir de cual se traslada.'',
        v_origen.nombre, array_to_string(v_duenos, '', '')
        using errcode = ''22023'';
    end if;
    v_dueno := coalesce(v_duenos[1], v_origen.propietario, ''LACANTERA'');
  end if;

  /* El cerrojo se toma igual; lo que cambia es que el saldo es el de ese dueño. */
  v_existencia := private.existencia_para_escribir(p_origen_id, p_articulo_id, v_dueno);

  if v_cantidad > v_existencia then
    select nombre into v_articulo from public.articulos where id = p_articulo_id;
    raise exception ''En "%" solo hay % de "%" de ese dueño y se intentan mover %.'',
      v_origen.nombre, private.numero_es(v_existencia, 4),
      coalesce(v_articulo, p_articulo_id::text), private.numero_es(v_cantidad, 4)
      using errcode = ''22023'';
  end if;

  /*
    EL COSTO ES EL DEL DUEÑO Y NO EL DEL SITIO. Tres bombas nuestras a 10 y ocho
    suyas a 40 no promedian a nada que sirva para valorar ninguna: sacar una suya
    al promedio mezclado le regala valor a un lado y se lo quita al otro, y el
    destino hereda el error.
  */
  v_costo := private.costo_promedio(p_origen_id, p_articulo_id, v_dueno);');

  -- 4. Las dos patas llevan el dueño.
  v_def := replace(v_def,
    'p_suelto_capturado   => case when v_nombre_pres is not null then nullif(p_suelto, 0) end);

  perform private.registrar_movimiento(',
    'p_suelto_capturado   => case when v_nombre_pres is not null then nullif(p_suelto, 0) end,
    p_propietario        => v_dueno);

  perform private.registrar_movimiento(');

  v_def := replace(v_def,
    'p_suelto_capturado   => case when v_nombre_pres is not null then nullif(p_suelto, 0) end);

  return v_salida;',
    'p_suelto_capturado   => case when v_nombre_pres is not null then nullif(p_suelto, 0) end,
    p_propietario        => v_dueno);

  return v_salida;');

  if position('v_dueno text; v_duenos text[];' in v_def) = 0
     or position('p_propietario text DEFAULT' in v_def) = 0
     or position('hay que decir de cual se traslada' in v_def) = 0
     or position('lo de un dueno no se mezcla' in v_def) > 0 then
    raise exception 'Algun anclaje no encajo: no se toca nada.';
  end if;

  drop function if exists public.transferir_existencia(
    bigint, bigint, bigint, numeric, text, date, numeric, text, numeric);
  execute v_def;
  raise notice 'un traslado lleva el dueño consigo.';
end $traslado$;

/*
  COMPROBADO EN CALIENTE, con la transacción rodada hacia atrás:

    1 origen mezclado sin decir de quién : «En "ALMACEN GENERAL" hay material de
                                           varios dueños (GOBERNACION,
                                           LACANTERA): hay que decir de cual se
                                           traslada.»
    2 al taller NUESTRO, diciendo que es
      de la gobernación .................: quedan 2 de la gobernación en el
                                           taller, y el taller sigue siendo de
                                           LACANTERA
    3 el costo con el que entró .........: 40,00 — el suyo, no el mezclado
    4 lo nuestro en el origen ...........: intacto (416 nuestras, 8 suyas)
*/
