/*
  LA SALIDA CONVIERTE EN TRES SITIOS Y SOLO DOS DECÍAN EN CUÁL.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026, por MCP, y probada en transacción
  deshecha en los dos sentidos. Corrige la migración de multi-presentación de
  hace una hora.
  ————————————————————————————————————————————————————————————————————————

  APARECIÓ ESCRIBIENDO EL ARCHIVO DE LA ANTERIOR, que es donde suelen aparecer:
  al leer la función entera para copiarla, y no al escribirla.

  `registrar_salidas` lo avisa en su propio comentario, escrito hace semanas:

      «LA CONVERSION ENTRA EN LOS TRES SITIOS, y esto es lo delicado de esta
      funcion: aqui, en la suma de los renglones anteriores, y en la pasada de
      escritura. Convertir solo en uno dejaria la reja de existencia comparando
      tambores contra litros, que es peor que no convertir.»

  Al añadir el nombre de la presentación entró en dos —la comprobación del
  renglón y la escritura— y se quedó fuera del tercero: la resta de lo que ya
  pidieron los renglones de arriba. Ese trozo usa el alias `r` en vez de `v_r`,
  y por eso la sustitución no lo tocó.

  LO QUE ROMPÍA

  Dos renglones del mismo aceite en la misma nota, contados en bidones de 20,
  con la presentación por defecto en tambores de 208:

      renglón 1: 2 BIDON  ->  40 L, bien
      renglón 2: comprueba «hay 100 − en_unidad_base(art, 2, 0)» = 100 − 416

  y rebota con «solo quedan −316» teniendo el almacén lleno. Al revés —defecto
  en bidones, contado en tambores— resta de menos y deja pasar una nota que no
  alcanza. La reja de la escritura la habría parado después, así que el libro no
  se descuadraba; lo que se rompía era la nota entera, por un renglón que sí
  cabía.

  ES LA QUINTA VEZ ESTA SEMANA con la misma forma: la regla puesta en un sitio y
  no en el de al lado. Las cuatro anteriores se cerraron llevando la regla al
  ayudante común. Aquí no se puede: el ayudante ya la tiene, y lo que falta es
  que el llamador le diga en qué presentación. La versión de esa lección para
  este caso: **por cada dato nuevo que un ayudante acepta, contar cuántas veces
  lo llama cada puerta.** `registrar_salidas` lo llama tres.
*/

do $patch$
declare v_def text; v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='registrar_salidas';

  v_antes := v_def;

  v_def := replace(v_def,
'      select sum(private.en_unidad_base(
                   v_articulo,
                   coalesce(nullif(btrim(coalesce(r->>''presentaciones'', '''')), '''')::numeric, 0),
                   coalesce(nullif(btrim(coalesce(r->>''cantidad'', '''')), '''')::numeric, 0)))',
'      select sum(private.en_unidad_base(
                   v_articulo,
                   coalesce(nullif(btrim(coalesce(r->>''presentaciones'', '''')), '''')::numeric, 0),
                   coalesce(nullif(btrim(coalesce(r->>''cantidad'', '''')), '''')::numeric, 0),
                   nullif(btrim(coalesce(r->>''presentacion'', '''')), '''')))');

  if v_def = v_antes then
    -- Ya estaba puesto, o la funcion cambio de forma. Lo segundo hay que verlo.
    if position('r->>''presentacion''' in v_antes) > 0 then
      raise notice 'registrar_salidas ya convierte los tres sitios; no se toca.';
      return;
    end if;
    raise exception 'No se encontro la suma de los renglones anteriores.';
  end if;

  execute v_def;
  raise notice 'registrar_salidas convierte los tres sitios con la misma presentacion.';
end $patch$;

/*
  COMPROBADO en transaccion deshecha, con un aceite en TAMBOR (208, por defecto)
  y en BIDON (20):

    entran 5 BIDON ................................. hay 100,00 L
    dos renglones de 2 BIDON en la misma nota ...... pasan, quedan 20,00 L
                                                     (antes: rebotaba el segundo)
    dos renglones de 1 BIDON con 20 L ............... rebota: «El renglon 2
                                                     (...): solo quedan 0,0000 y
                                                     se intentan sacar 20,0000.»

  La reja sigue puesta en los dos sentidos. Al terminar: 19 movimientos,
  868.927.307,04. Nada de produccion tocado.
*/
