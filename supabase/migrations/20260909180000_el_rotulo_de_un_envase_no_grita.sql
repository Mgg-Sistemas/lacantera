/*
  EL RÓTULO DE UN ENVASE NO GRITA.

  Christopher creó «Paila» por la puerta nueva y quedó guardada como «PAILA».
  Al lado de las otras dieciocho —Tambor, Bidón, Cuñete, Barril— es la única en
  mayúsculas, y en una lista desplegable eso se ve como un error.

  No fue culpa suya: escribió lo que le pareció y la puerta lo guardó tal cual.
  El descuido es de la puerta.

  ═══════════════════════════════════════════════════════════════════════════
  POR QUÉ NO LO ARREGLA `trg_normalizar`, QUE ES LO QUE HARÍA TODA LA CASA
  ═══════════════════════════════════════════════════════════════════════════

  La regla del proyecto es que el texto se guarda en MAYÚSCULA y lo hace un
  disparador. Aquí no, y es deliberado: `presentaciones.nombre` no es un dato
  que se busque ni con el que se compare, es un RÓTULO que se lee en un
  desplegable. Pasarlo a mayúsculas dejaría la lista entera gritando —«TAMBOR»,
  «BIDON»— y de paso se llevaría las tildes por delante, que es lo que ya se
  discutió con el otro carril a propósito de `categorias_gasto`.

  Lo que identifica la fila es `codigo`, y ése sí está en mayúsculas y sin
  tildes, como manda la casa. El nombre es la cara.

  ASÍ QUE LA FORMA SE DA EN LA PUERTA: primera letra arriba, el resto abajo.
  «PAILA», «paila» y «PaIlA» acaban las tres en «Paila», y la lista se mantiene
  pareja escriba quien escriba. Es la misma idea que el portero de duplicados:
  no se le pide cuidado a la persona, se le quita el problema.

  Con nombres de dos palabras sale «Paila de aceite», que es como se escribe en
  castellano y no «Paila De Aceite». Por eso se baja TODO el resto y no se toca
  cada palabra por separado.
*/

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
  v_nombre text;
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

  v_nombre := btrim(coalesce(p_nombre, ''));

  if length(v_nombre) < 3 then
    raise exception 'La presentación necesita un nombre de al menos tres letras.'
      using errcode = '22023';
  end if;

  /*
    LA FORMA DEL RÓTULO SE DA AQUÍ Y NO SE LE PIDE A NADIE.

    Sin esto, la lista acaba con «Tambor», «PAILA» y «bidon» conviviendo, y cada
    una delata quién la escribió. Se baja todo el resto y no palabra por palabra:
    «Paila de aceite» es castellano, «Paila De Aceite» no.
  */
  v_nombre := upper(left(v_nombre, 1)) || lower(substr(v_nombre, 2));

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
  'Da de alta o corrige una forma de llegada del catalogo compartido. Sin p_codigo es alta y el codigo sale del nombre; con p_codigo es correccion y el codigo NO viaja —lo guardan cuatro columnas de cuatro tablas sin ON UPDATE CASCADE—. Rechaza en firme el homonimo por NUCLEO y no por cadena: «Tambores» no choca con «TAMBOR» por ninguna comparacion de texto, pero los dos nucleos son TAMBOR. Y da forma al rotulo —primera letra arriba, el resto abajo— para que la lista no acabe con «Tambor», «PAILA» y «bidon» conviviendo: el nombre es la cara que se lee en un desplegable, no un dato que se busque; el que va en mayusculas y sin tildes es el `codigo`. Misma llave que declarar la presentacion de un articulo.';

grant execute on function public.guardar_presentacion(text, text, smallint, boolean) to authenticated;
