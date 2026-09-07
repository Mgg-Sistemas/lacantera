/*
  EL CATÁLOGO RECONOCE LO QUE YA TIENE, Y EL CÓDIGO LO PONE LA BASE.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 7 de septiembre de 2026, por MCP, y probada en transacción
  deshecha con los ejemplos exactos que puso Christopher.
  ————————————————————————————————————————————————————————————————————————

  LO QUE SE PIDIÓ

  «Debemos asegurar que el sistema impide (o mínimo advierte/sugiere) duplicados
  en el sistema, ejemplo "Insumos" o "Insumo", o "Repuesto disco de corte 7'" o
  "Disco de corte 7'". Todos los items sin importar en qué almacén estén, deben
  manejar un código, debemos disminuir el porcentaje de error al respecto.»

  LO QUE SE ENCONTRÓ AL MEDIR, QUE ES PEOR DE LO QUE PARECE

  `articulos.codigo` es NOT NULL y tiene índice único desde siempre. Pero once
  de los quince artículos llevan **el nombre metido en el campo del código**:

      ACEITE AGROFLUIDOS   ->  codigo = 'ACEITE AGROFLUIDOS'
      CABILLAS 3/8         ->  codigo = 'CABILLAS 3/8'
      ELECTRODO 6013/332   ->  codigo = 'ELECTRODO 6013/332'

  Solo cuatro tienen código de verdad —CT-GASOIL, EPP-0001, EPP-0002, HE-0213—
  y ni esos siguen una sola forma.

  Un código que es el nombre no distingue nada: el índice único deja pasar
  «VALVULINA 140» y «Valvulina  140» como dos artículos, porque son dos textos
  distintos.

  LA CAUSA ESTÁ EN EL CÓDIGO, NO EN LA GENTE

  `private.codigo_de_articulo(categoria)` existe desde hace tiempo y genera
  LUB-0001, INS-0002 por categoría. `crear_articulo` la usa cuando el campo va
  vacío.

  Pero `cargar_articulos_por_lote` —la planilla, que es por donde entraron los
  once— **exigía** el código: `if v_codigo = '' then 'Falta el código.'`. Quien
  llenó la planilla no tenía ninguno que escribir, así que copió el nombre. La
  regla que iba a evitar errores es la que los produjo.

  ADVERTIR Y SUGERIR, NO IMPEDIR

  Un almacén de verdad tiene DISCO DE CORTE 7 y DISCO DE CORTE 9, y son dos
  cosas. Quien sabe cuál es cuál es la persona; lo que le faltaba era verlos.

  Así que hay dos niveles y no uno:

    el mismo núcleo ....  `crear_articulo` PARA y pide confirmar. Es el caso sin
                          duda: los dos nombres se reducen a lo mismo.
    parecido .......... .  La pantalla los enseña mientras se escribe el nombre,
                          con su código, por si uno de ellos era el que se
                          buscaba. No bloquea nada.

  QUÉ ES EL NÚCLEO, Y POR QUÉ NO SE GUARDA

  El nombre en singular, sin tildes, sin puntuación y sin las palabras que no
  distinguen. Medido con los ejemplos de Christopher:

      Insumos / Insumo ................................ INSUMO
      Repuesto disco de corte 7' / Disco de corte 7" .. DISCO CORTE 7
      Disco de corte 9 ................................ DISCO CORTE 9   (otro)
      Válvulina 140 / VALVULINA 140 / Valvulina  140 .. VALVULINA 140
      DISCOS DE TRAZADORAS DE 8P / Disco trazadora 8P . DISCO TRAZADORA 8P

  El último es un artículo real del catálogo, y es la clase de cosa que se
  volvía a crear sin que nadie lo notara.

  No se guarda en una columna: se calcula al comparar. Un núcleo guardado se
  queda viejo en cuanto alguien edita el nombre, y entonces el catálogo miente
  justo donde tenía que avisar.

  DOS DETALLES QUE COSTARON UNA VUELTA CADA UNO

  1. La primera versión quitaba las palabras genéricas y dejaba «Insumos» e
     «Insumo» los dos en blanco — el ejemplo del propio Christopher se caía por
     el suelo. Si al quitarlas no queda nada, se conserva el nombre: un artículo
     que se llama literalmente «Insumos» es justo el que hay que cazar.

  2. El aviso usaba `errcode = '23505'`, que es `unique_violation`, y el
     `exception when unique_violation` del final de `crear_articulo` lo atrapaba
     y lo reescribía como «Ya existe un artículo con el código <NULL>». Salió
     ejecutando, no leyendo. Ahora es 22023: no hay ninguna restricción violada,
     hay un dato que necesita confirmarse.
*/

do $guarda$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='codigo_de_articulo') then
    raise exception 'Falta private.codigo_de_articulo, que es quien pone el codigo.';
  end if;
end $guarda$;

create extension if not exists pg_trgm  with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- El nombre reducido a lo que de verdad lo distingue
-- ---------------------------------------------------------------------------
create or replace function private.nombre_comparable(p_texto text)
returns text language sql immutable security definer set search_path to ''
as $function$
  /*
    Sin tildes —VALVULINA y VÁLVULINA son el mismo aceite—, sin puntuacion
    —DISCO 7" y DISCO 7' y DISCO 7 son el mismo disco— y sin espacios de mas.
  */
  select btrim(regexp_replace(
    regexp_replace(
      extensions.unaccent(upper(coalesce(p_texto, ''))),
      '[^A-Z0-9 ]', ' ', 'g'),
    '\s+', ' ', 'g'))
$function$;

create or replace function private.nombre_nucleo(p_texto text)
returns text language plpgsql immutable security definer set search_path to ''
as $function$
declare
  v_base     text := private.nombre_comparable(p_texto);
  v_singular text;
  v_nucleo   text;
begin
  /*
    EL PLURAL PRIMERO. «Insumos» e «Insumo» es el ejemplo que puso Christopher,
    y tambien «Discos» y «Disco». Se le quita la S final a las palabras de mas
    de cuatro letras: por debajo de eso la S suele ser parte de la palabra
    —GAS, MAS— y quitarla inventa parecidos.
  */
  v_singular := btrim(regexp_replace(v_base, '([A-Z]{4,})S\M', '\1', 'g'));

  /*
    Y DESPUES LAS PALABRAS QUE NO DISTINGUEN. La primera suele decir la
    categoria, que ya vive en su columna: «Repuesto disco de corte 7"» y «Disco
    de corte 7» son el mismo disco.
  */
  v_nucleo := btrim(regexp_replace(
    regexp_replace(
      ' ' || v_singular || ' ',
      ' (REPUESTO|INSUMO|MATERIAL|ARTICULO|PRODUCTO|HERRAMIENTA|DE|DEL|LA|EL|LO|UN|UNA|PARA|CON|POR|Y) ',
      ' ', 'g'),
    '\s+', ' ', 'g'));

  -- Si no queda nada, se queda lo que habia: un articulo llamado «Insumos» es
  -- todo palabra generica, y vaciarlo lo dejaria sin con que compararse.
  return case when length(v_nucleo) >= 2 then v_nucleo else v_singular end;
end;
$function$;

comment on function private.nombre_nucleo(text) is
  'Lo que queda de un nombre al pasarlo a singular y quitarle tildes, puntuacion y las palabras que no distinguen. Se calcula al comparar y no se guarda: un nucleo guardado se queda viejo en cuanto alguien edita el nombre.';

create index if not exists articulos_nombre_trgm_idx
  on public.articulos using gin (private.nombre_comparable(nombre) extensions.gin_trgm_ops);

/*
  Los cuerpos de `public.articulos_parecidos(text, bigint, text)`, de
  `public.crear_articulo(...)` —con el parametro `p_confirmado` al final— y el
  de `public.cargar_articulos_por_lote(jsonb, boolean)` son los que devuelve
  `pg_get_functiondef` tras esta migracion. Se aplicaron por MCP y llevan sus
  comentarios dentro.

      select pg_get_functiondef(p.oid)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('articulos_parecidos', 'crear_articulo',
                           'cargar_articulos_por_lote');

  Lo que hace cada uno:

    articulos_parecidos       Solo lee. Los seis que mas se parecen a un nombre,
                              con `es_el_mismo` marcando el nucleo identico. Los
                              inactivos tambien salen: se desactiva lo que deja
                              de usarse, no lo que deja de existir, y volver a
                              crearlo parte su historia en dos.

    crear_articulo            Gano `p_confirmado` AL FINAL. Hubo que soltar la
                              firma de trece a mano: `create or replace` con
                              otra firma ANADE una funcion y deja ambigua la
                              llamada vieja. Van tres veces hoy.

    cargar_articulos_por_lote El codigo dejo de exigirse. Vacio, la fila se
                              resuelve por el nombre; si es nueva, el codigo se
                              pone AL GUARDAR y no al revisar, porque revisar
                              la planilla tres veces gastaria tres correlativos
                              por fila y dejaria huecos en la serie. Y avisa en
                              el informe cuando una fila nueva se parece a algo
                              que ya esta, sin parar la carga: una planilla trae
                              DISCO DE CORTE 7 y DISCO DE CORTE 9 el mismo dia.
*/

/*
  COMPROBADO en transaccion deshecha, el 7 de septiembre:

    crear «Valvulina  140» ....... para: «Ya existe "VALVULINA 140" con el
                                   código VALVULINA 140»
    crear «Discos de trazadora
    de 8P» ....................... para contra DISCOS DE TRAZADORAS DE 8P
    crear «Insumos» y «Insumo» ... el segundo para; el primero recibio INS-0001
    confirmando .................. pasa
    crear sin codigo ............. la base pone INS-0001

    planilla sin columna de codigo:
      «Aceite hidraulico 68» ..... ACTUALIZA sobre el que ya esta
      «Lentes de seguridad» ...... ACTUALIZA sobre EPP-0002

  Los dos ultimos son el arreglo que mas importa: antes, sin codigo, la fila era
  un error; con el nombre en el codigo, eran dos articulos nuevos.

  Al terminar: 15 articulos, 19 movimientos, valor 868.927.307,04, y la serie
  de correlativos sin gastar. Nada de produccion tocado.

  PENDIENTE, y hace falta decision:

    Los once articulos que llevan el nombre en el codigo siguen asi. Cambiarles
    el codigo es tocar datos de produccion que se leen en pantallas y en papeles
    ya emitidos, asi que no se hace sin decirlo. El sistema ya no crea mas de
    esos; los que hay son una limpieza aparte.
*/
