/*
  LA LISTA DE «CÓMO LLEGA» SE PUEDE AMPLIAR, PERO CON PORTERO.

  Christopher: «hay aceites que vienen en tambores (lo cubre tambor) y en pailas
  (no parece cubrirlo alguna opción cercana) ... debemos de permitir personalizar
  estos aspectos, pero de forma celosa o no tan flexible con el tipeado o
  duplicado».

  Hasta hoy `presentaciones` no tenía puerta: las 18 filas entraron por migración
  y ampliarlas exigía un programador. Quien recibe el aceite en pailas a las seis
  de la tarde no tiene un programador.

  ═══════════════════════════════════════════════════════════════════════════
  QUÉ SE ABRE Y QUÉ NO, Y POR QUÉ NO SON LO MISMO
  ═══════════════════════════════════════════════════════════════════════════

  De los tres catálogos que Christopher nombró, **solo se abre éste**, y la razón
  es distinta en cada uno:

  - **`presentaciones` sí.** Es la palabra de un envase. Añadir PAILA no cambia
    ninguna cuenta: los litros que trae no viven aquí, viven por artículo en
    `articulo_presentaciones.unidades`, porque la paila de un aceite puede no
    traer lo mismo que la de otro. Es la misma decisión que ya está tomada para
    el tambor, que en un artículo son 208 L y en otro 200.

  - **`unidades` no**, y no por prudencia sino por aritmética. Nueve columnas de
    nueve tablas apuntan ahí, y una es `inventario_movimientos.unidad`, que es la
    vara con la que está medido el libro. Una unidad nueva nace sin conversión
    contra ninguna otra: es una isla. Y el catálogo no está corto —14 filas, 5
    usadas, 9 sin un solo uso—. Lo que Christopher necesita, la paila, es una
    presentación y no una unidad.

  - **`articulos.categoria` tampoco**, y ésta es la que más sorprende. Es un
    CHECK y no una tabla porque siete de sus nueve valores NO SON DATOS, son
    ramas del programa: COMBUSTIBLE es lo que deja despachar en la pantalla de
    Combustible, PRODUCTO es lo que se puede vender, LUBRICANTE es lo que el
    Centro de Costos cuenta como lubricante. Una categoría inventada desde la
    pantalla no daría error: cambiaría el costo por m³ y nadie se enteraría. Ese
    es exactamente el modo de fallo del 5/09.

  ═══════════════════════════════════════════════════════════════════════════
  EL PORTERO, Y POR QUÉ NO SE ESCRIBIÓ UNO NUEVO
  ═══════════════════════════════════════════════════════════════════════════

  Ya existe, y es mejor que lo que se iba a escribir. `private.nombre_nucleo`
  reduce un nombre a su raíz —sin tildes, sin puntuación, en singular— y
  `public.articulos_parecidos` lo lleva usando semanas con el patrón entero:
  avisa, sugiere, y solo frena el homónimo. Aquí se copia ese patrón en vez de
  inventar reglas de plural a mano.

  COMPROBADO contra las 18 filas reales, que es lo que decide si el portero
  sirve:

      Pailas · Páila · Cajas · Tambores · Bidones · Barriles · Pares
      Cuñete / Cunete .......... el núcleo los junta a todos
      colisiones falsas entre las 18 reales .................. cero

  Lo que el núcleo NO caza es la falta de ortografía —«Payla», «Pailita»— y para
  eso está el parecido difuso. **El umbral es 0,30 y está medido, no elegido:**

      lo que DEBE avisar     Payla 0,333 · Pailita 0,400 · Bidn 0,375
                             Tanbor 0,400 · Garafa 0,667 · Botela 0,667
      lo que NO debe avisar  Par 0,250 · Paleta 0,182 · Paquete 0,182
                             (y entre las 18 reales, el peor cruce da 0,222)

  Hay hueco limpio entre 0,250 y 0,333. Un umbral que marcara envases distintos
  como el mismo sería peor que no tener ninguno: enseña a pulsar «sí, es otro»
  sin leer.

  ═══════════════════════════════════════════════════════════════════════════
  AQUÍ EL HOMÓNIMO SE RECHAZA SIN CASILLA, AL REVÉS QUE EN ARTÍCULOS
  ═══════════════════════════════════════════════════════════════════════════

  En artículos, dos nombres con el mismo núcleo pueden ser dos cosas: un almacén
  de verdad tiene DISCO DE CORTE 7 y DISCO DE CORTE 9. Por eso allí hay una
  casilla «es otra cosa distinta».

  **Aquí no la hay, y es a propósito.** PAILA y PAILAS no son dos envases
  distintos, ni lo serán nunca. Esta lista tiene 18 filas y se ve entera de un
  vistazo; quien escribe ya la está mirando. Donde no cabe la duda, la casilla
  solo sirve para saltarse el aviso.

  Y el rechazo NOMBRA la fila con la que choca, que es lo que lo hace obedecible:
  «Eso es lo mismo que TAMBOR, que ya está en la lista». Un «ya existe» a secas
  obliga a salir a buscar cuál.

  El parecido difuso sí es solo aviso, y vive en la pantalla: 0,30 acierta con
  las faltas de ortografía pero no puede distinguir un envase parecido de uno mal
  escrito, y esa decisión es de la persona.
*/

-- ---------------------------------------------------------------------------
-- 1. Una presentación se retira, no se borra
-- ---------------------------------------------------------------------------
/*
  La columna que faltaba. Sin ella, quitar de la lista una presentación que ya se
  usó exige borrarla, y las cuatro claves foráneas lo impiden —con razón: un
  movimiento viejo que dijo «Barril» tiene que seguir diciéndolo—. Con `activa`
  se deja de ofrecer sin romper la historia, que es lo que ya hacen
  `clases_de_salida` y `articulo_presentaciones`.
*/
alter table public.presentaciones
  add column if not exists activa boolean not null default true;

comment on column public.presentaciones.activa is
  'Si se sigue ofreciendo en las listas. Retirar no es borrar: las cuatro claves foraneas que apuntan a `codigo` impiden borrar una presentacion usada, y con razon —un movimiento que dijo «Barril» tiene que seguir diciendolo—. Esta columna deja de ofrecerla sin tocar la historia.';

-- ---------------------------------------------------------------------------
-- 2. Las que ya están y se parecen a ésta
-- ---------------------------------------------------------------------------
create or replace function public.presentaciones_parecidas(p_nombre text)
returns table(codigo text, nombre text, activa boolean, parecido numeric, es_la_misma boolean)
language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_nucleo text := private.nombre_nucleo(p_nombre);
  v_comp   text := private.nombre_comparable(p_nombre);
begin
  /*
    El hermano de `articulos_parecidos`, con dos diferencias que importan.

    EL UMBRAL ES 0,30 Y NO 0,45. En artículos, lo que separa dos cosas de verdad
    distintas suele ser una cifra —DISCO DE CORTE 7 contra el 9— y por eso allí
    hay que ser exigente. Aquí los nombres son palabras cortas de una sola pieza,
    y a esa escala 0,45 deja pasar «Payla» (0,333) delante de «Paila». Medido
    contra las 18 filas reales: el peor falso positivo da 0,222.

    `%` Y NO `similarity() >= x` EN EL WHERE, por lo mismo que en el hermano:
    `gin_trgm_ops` indexa operadores, no llamadas a función. Con 18 filas el plan
    da igual, pero la forma se copia igual —la que se aparta del hermano es la
    que un día diverge sin que nadie lo note.

    Solo LECTURA de inventario: esto se consulta para avisar, y quien no puede
    ver el catálogo tampoco necesita el aviso.
  */
  perform private.exigir_permiso('INVENTARIO', 'LECTURA');

  if length(v_nucleo) < 2 then
    return;
  end if;

  return query
  select p.codigo, p.nombre, p.activa,
         round(extensions.similarity(private.nombre_comparable(p.nombre), v_comp)::numeric, 3),
         private.nombre_nucleo(p.nombre) = v_nucleo
    from public.presentaciones p
   where private.nombre_nucleo(p.nombre) = v_nucleo
      or (private.nombre_comparable(p.nombre) operator(extensions.%) v_comp
          and extensions.similarity(private.nombre_comparable(p.nombre), v_comp) >= 0.30)
   order by (private.nombre_nucleo(p.nombre) = v_nucleo) desc,
            extensions.similarity(private.nombre_comparable(p.nombre), v_comp) desc
   limit 6;
end;
$function$;

comment on function public.presentaciones_parecidas(text) is
  'Las presentaciones que ya estan y se parecen a ese nombre. `es_la_misma` marca el homonimo —los dos nombres dan el mismo nucleo— y es el unico que `guardar_presentacion` rechaza en firme, sin casilla que valga: PAILA y PAILAS no son dos envases distintos. El resto es aviso, para que decida la persona. Umbral 0,30 y no el 0,45 de articulos: aqui los nombres son palabras cortas y a esa escala 0,45 deja pasar «Payla» (0,333); medido contra las 18 filas reales, el peor falso positivo da 0,222.';

grant execute on function public.presentaciones_parecidas(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. La puerta
-- ---------------------------------------------------------------------------
create or replace function public.guardar_presentacion(
  p_codigo text default null,
  p_nombre text default null,
  p_orden  smallint default null,
  p_activa boolean default true
)
returns text language plpgsql security definer set search_path to ''
as $function$
declare
  v_codigo text;
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_choca  text;
begin
  /*
    LA MISMA LLAVE QUE DECLARAR LA PRESENTACIÓN DE UN ARTÍCULO, y se decidió
    mirando la incoherencia que produce lo contrario: separarlas deja a una
    persona pudiendo declarar que el aceite viene en pailas, pero sin poder crear
    la palabra «paila». Es la misma tarea partida en dos.

    `INVENTARIO.EDITAR_CATALOGO` es la acción que ya exigen
    `guardar_presentacion_de_articulo` y `cambiar_estado_presentacion`.
  */
  perform private.exigir_accion('INVENTARIO.EDITAR_CATALOGO');

  if length(v_nombre) < 3 then
    raise exception 'La presentación necesita un nombre de al menos tres letras.'
      using errcode = '22023';
  end if;

  -- ------------------------------------------------------------------- alta
  if p_codigo is null then
    v_codigo := private.codigo_desde_nombre(v_nombre);

    /*
      SE MIRA EL NÚCLEO Y NO EL CÓDIGO, y ahí está todo el asunto:
      `codigo_desde_nombre('Tambores')` da TAMBORES, que no choca con TAMBOR por
      ninguna comparación de cadena. El núcleo de los dos es TAMBOR.

      Ése es el agujero por el que se cuela el plural español —en -ES, no en -S—
      y es la razón de no escribir reglas de plural a mano: ya se intentó una vez
      en este repositorio y se equivocaba. El código se mira también, pero como
      segunda red, no como primera.
    */
    select p.codigo into v_choca
      from public.presentaciones p
     where private.nombre_nucleo(p.nombre) = private.nombre_nucleo(v_nombre)
        or p.codigo = v_codigo
     limit 1;

    if v_choca is not null then
      raise exception 'Eso es lo mismo que %, que ya está en la lista.', v_choca
        using errcode = '23505',
              hint = 'Si de verdad es otro envase, ponle un nombre que se distinga.';
    end if;

    insert into public.presentaciones (codigo, nombre, orden, activa)
    values (v_codigo, v_nombre, coalesce(p_orden, 500::smallint), coalesce(p_activa, true));

    return v_codigo;
  end if;

  -- -------------------------------------------------------------- corrección
  if not exists (select 1 from public.presentaciones p where p.codigo = p_codigo) then
    raise exception 'No existe la presentación "%".', p_codigo using errcode = 'P0002';
  end if;

  /*
    EL CÓDIGO NO VIAJA AL CORREGIR, y es la regla que sostiene lo demás: es lo
    que guardan cuatro columnas de cuatro tablas —artículos, sus formas de
    contar, renglones de cotización y renglones de pedido— y ninguna tiene ON
    UPDATE CASCADE. Cambiarlo dejaría huérfano lo ya escrito.

    El nombre sí se corrige: es el rótulo, y un rótulo mal tecleado se quedaba
    mal para siempre.
  */
  if exists (
    select 1 from public.presentaciones p
     where p.codigo <> p_codigo
       and private.nombre_nucleo(p.nombre) = private.nombre_nucleo(v_nombre)
  ) then
    raise exception 'Con ese nombre se confundiría con otra que ya está en la lista.'
      using errcode = '23505';
  end if;

  update public.presentaciones
     set nombre = v_nombre,
         orden  = coalesce(p_orden, orden),
         activa = coalesce(p_activa, activa)
   where codigo = p_codigo;

  return p_codigo;
end;
$function$;

comment on function public.guardar_presentacion(text, text, smallint, boolean) is
  'Da de alta o corrige una forma de llegada del catalogo compartido. Sin p_codigo es alta y el codigo sale del nombre; con p_codigo es correccion y el codigo NO viaja —lo guardan cuatro columnas de cuatro tablas sin ON UPDATE CASCADE—. Rechaza en firme el homonimo por NUCLEO y no por cadena: «Tambores» no choca con «TAMBOR» por ninguna comparacion de texto, pero los dos nucleos son TAMBOR. Y rechaza NOMBRANDO la fila con la que choca, que es lo que lo hace corregible sin salir de la pantalla. Misma llave que declarar la presentacion de un articulo: separarlas dejaria a alguien pudiendo decir que el aceite viene en pailas sin poder crear la palabra «paila».';

grant execute on function public.guardar_presentacion(text, text, smallint, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Borrar solo lo que no dejó rastro
-- ---------------------------------------------------------------------------
create or replace function public.borrar_presentacion(p_codigo text)
returns void language plpgsql security definer set search_path to ''
as $function$
declare
  v_usos integer;
begin
  perform private.exigir_accion('INVENTARIO.EDITAR_CATALOGO');

  /*
    SE CUENTAN LAS CUATRO A MANO en vez de dejar que salte la clave foránea, y
    es por el mensaje. El de la base dice «viola la restricción
    presentaciones_fkey», que no le sirve a nadie. Contando se puede decir
    CUÁNTOS la usan y ofrecer la salida buena, que es retirarla.
  */
  select (select count(*) from public.articulos a where a.presentacion = p_codigo)
       + (select count(*) from public.articulo_presentaciones ap where ap.presentacion = p_codigo)
       + (select count(*) from public.cotizacion_renglones cr where cr.presentacion = p_codigo)
       + (select count(*) from public.orden_renglones orr where orr.presentacion = p_codigo)
    into v_usos;

  if v_usos > 0 then
    raise exception 'No se puede borrar: hay % cosa% que la usa%. Retírala en su lugar: deja de ofrecerse y lo ya escrito no se toca.',
      v_usos,
      case when v_usos = 1 then '' else 's' end,
      case when v_usos = 1 then '' else 'n' end
      using errcode = '23503';
  end if;

  delete from public.presentaciones where codigo = p_codigo;
end;
$function$;

comment on function public.borrar_presentacion(text) is
  'Borra una forma de llegada, y solo si no la usa nadie en las cuatro tablas que apuntan a ella. Las cuenta a mano en vez de dejar saltar la clave foranea por el mensaje: el de la base («viola la restriccion...») no le sirve a nadie, y contando se puede decir CUANTOS la usan y ofrecer la salida buena, que es retirarla con `activa`.';

grant execute on function public.borrar_presentacion(text) to authenticated;
