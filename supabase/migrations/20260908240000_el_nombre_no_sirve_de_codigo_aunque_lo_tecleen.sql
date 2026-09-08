/*
  EL NOMBRE NO SIRVE DE CÓDIGO, AUNQUE LO TECLEEN.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026, por MCP, y probada en transacción
  deshecha. Cierra en la base lo que esta mañana se cerró solo en los datos.
  ————————————————————————————————————————————————————————————————————————

  CÓMO APARECIÓ

  Contando artículos para otra cosa: el catálogo tenía quince esta mañana y
  ahora tiene dieciséis. El nuevo se creó hoy a las 12:31 desde la pantalla y se
  llama BORNES PARA MAQUINARIA — con código BORNES PARA MAQUINARIA.

  Es exactamente el defecto que la renumeración de esta mañana vino a cerrar.
  Once artículos pasaron de tener el nombre metido en el campo del código a
  tener LUB-0001 y compañía; tres horas después entró el duodécimo por la misma
  puerta, porque la renumeración arregló las FILAS y no la PUERTA.

  POR QUÉ EL AVISO DE LA PANTALLA NO BASTABA

  La casilla ya dice «Opcional. Vacío, se pone solo, con el prefijo de su
  categoría», y el marcador de posición dice «Se pone solo». Aun así se rellenó
  con el nombre: es lo que hace cualquiera ante una casilla que no sabe qué
  poner y tiene el nombre recién escrito al lado. El formulario ya avisaba, así
  que la reja va donde no se puede rodear.

  SE PARA EN VEZ DE ARREGLARLO SOLO

  Generar el código en silencio sería reescribir lo que alguien tecleó, y esta
  casa no hace eso —es la misma razón por la que «1 tambor y 300 L» no se
  convierte en «2 tambores y 92 L»—. El mensaje enseña la salida, que es dejarlo
  vacío.

  LA COMPARACIÓN ES POR NÚCLEO, no por igualdad literal, y así también caza
  «bornes de maquinaria» tecleado en minúscula o con un espacio de más. Reusa
  `private.nombre_nucleo`, que ya existe para detectar duplicados y que ya sabe
  quitar acentos, plurales y palabras de relleno.

  LO QUE NO HACE, y va nombrado para que no se pierda:

    - `cargar_articulos_por_lote` sigue aceptando el nombre como código. Ahí
      parar la fila pararía la planilla entera, y lo que hace falta es que la
      fila entre con un código puesto y un aviso al lado — otra tanda.
    - La fila de hoy, BORNES PARA MAQUINARIA, se queda como está: renumerarla es
      tocar datos reales y eso se pregunta antes. `codigo_anterior` existe
      justamente para que se pueda hacer sin romper la planilla de agosto.
*/

do $guarda$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='nombre_nucleo') then
    raise exception 'Falta private.nombre_nucleo, que usa la comparacion.';
  end if;
end $guarda$;

do $patch$
declare v_def text; v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='crear_articulo';

  if position('no sirve de codigo' in v_def) > 0 then
    raise notice 'crear_articulo ya lo comprueba; no se toca.';
    return;
  end if;

  v_antes := v_def;

  v_def := replace(v_def,
'  v_codigo := nullif(upper(trim(coalesce(p_codigo, ''''))), '''');
  if v_codigo is null then',
'  v_codigo := nullif(upper(trim(coalesce(p_codigo, ''''))), '''');

  -- El nombre no sirve de codigo. Ver el comentario de arriba.
  if v_codigo is not null
     and private.nombre_nucleo(v_codigo) = private.nombre_nucleo(p_nombre) then
    raise exception ''El código no puede ser el nombre del artículo.''
      using errcode = ''22023'',
            hint = ''Déjalo vacío y se pone solo, con el prefijo de su categoría.'';
  end if;

  if v_codigo is null then');

  if v_def = v_antes then
    raise exception 'No se encontro donde se resuelve el codigo.';
  end if;

  execute v_def;
  raise notice 'crear_articulo rechaza el nombre como codigo.';
end $patch$;

/*
  COMPROBADO en transaccion deshecha, el 8 de septiembre:

    codigo = nombre ............. rebota: «El código no puede ser el nombre del
                                  artículo.»
    mismo nucleo, otra caja ..... rebota igual («bornes de prueba dos» contra
                                  «BORNES DE PRUEBA DOS»)
    un codigo de verdad ......... pasa: INS-9999
    sin codigo .................. pasa: INS-0006, puesto por la base

  Al terminar: 19 movimientos, 868.927.307,04. Nada de produccion tocado.
*/
