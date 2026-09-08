/*
  LA REGLA DEL BULTO ENTERO VIVE EN EL AYUDANTE, NO EN CADA PUERTA.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026, por MCP, y probada en transacción
  deshecha por las tres puertas.
  ————————————————————————————————————————————————————————————————————————

  LO QUE LEVANTÓ EL CARRIL DE BASE DE DATOS

  «Los bultos se cuentan enteros en una puerta y de cualquier forma en las otras
  dos.» La regla se puso esta mañana en `registrar_ajuste` y se quedó ahí.
  Reproducido por ellos sobre BOTAS DE SEGURIDAD, 20 por bulto:

      2,5 bultos por AJUSTE   -> PARADO
      2,5 bultos por ENTRADAS -> PASA, y guarda cantidad_capturada = 2.5
      -1 bulto y 300 por ENTRADAS -> PASA, y guarda cantidad_capturada = -1

  Y su diagnóstico es el que importa: **la cantidad final sale bien en los dos
  casos** —las tres puertas rechazan un total que no sea positivo—, así que el
  libro no se descuadra y esto no era urgente. Lo que se estropea es la otra
  mitad: `cantidad_capturada` existe para poder cotejar el asiento contra un
  estante, y «−1 bultos» no se coteja con nada.

  ES LA CUARTA VEZ QUE SALE LA MISMA FORMA — la reja en una puerta y no en la de
  al lado. El vale con destino a mano, el traslado entre almacenes, la recepción,
  y ahora esto.

  POR QUÉ AQUÍ Y NO REPETIDA TRES VECES

  El arreglo obvio era copiar la comprobación en `registrar_entradas` y
  `registrar_salidas`. Se descarta, y por lo que enseña el propio patrón: una
  regla repetida tres veces es una regla que se queda fuera de la cuarta puerta
  el día que aparezca.

  Las tres llaman a `private.en_unidad_base`. La regla que vive en el ayudante no
  se puede quedar fuera de ninguna, y la que aparezca mañana la hereda sin que
  nadie se acuerde.

  Y de propina el barrido que el carril de BD formuló mejor que yo: **por cada
  regla nueva, mirar las tres puertas que llaman al mismo ayudante.**

  LO QUE NO CAMBIA

  `1 tambor y 300 L` de un artículo de 208 sigue dando 508 y no se convierte en
  «2 tambores y 92 L». Contar así es raro pero no es falso, y reescribirle a
  alguien lo que contó es como se pierde la confianza en un inventario. Lo que
  se rechaza es medio bulto, que no es una forma rara de contar: es una cifra
  que no se puede mirar en un estante.

  Y UN DETALLE QUE CAZÓ MI PROPIA PRUEBA, la tercera vez con el mismo tropiezo:
  el mensaje decía «2,50s no es un número de bultos». En `raise` el hueco es `%`
  a secas; `%s` es de `format()`. Se me olvida cada vez que escribo un mensaje
  nuevo mirando el de al lado.
*/

do $guarda$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='numero_es') then
    raise exception 'Falta private.numero_es, que usa el mensaje.';
  end if;
end $guarda$;

create or replace function private.en_unidad_base(
  p_articulo_id bigint, p_presentaciones numeric default null, p_sueltas numeric default 0
) returns numeric language plpgsql stable security definer set search_path to ''
as $function$
declare v_art record;
begin
  /*
    SIETE TAMBORES Y DIEZ LITROS SON 1.466 LITROS.

    Lo levanto Christopher el 7/09/2026: «el usuario ingresa 7 tambores y 10 L
    (en si son 8 tambores, pero se entiende que el 8vo apenas le quedan litros),
    lo mismo 8 rollos de malla y 4 M».

    Es como se cuenta un almacen de verdad. Nadie dice «1.466 litros»: dice
    siete tambores llenos y uno empezado.

    LOS DOS SUMANDOS SON INDEPENDIENTES Y LOS DOS PUEDEN FALTAR:

        7 tambores y 10 L   ->  7 * 208 + 10  =  1.466
        3 tambores          ->  3 * 208 +  0  =    624
        50 L                ->  0        + 50 =     50

    NO SE NORMALIZA EL SUELTO A PROPOSITO. «1 tambor y 300 L» de un articulo de
    208 son 508 y no se convierte en «2 tambores y 92 L». Contar asi es raro
    pero no es falso, y reescribirle a alguien lo que conto es como se pierde la
    confianza en un inventario.
  */
  select nombre, unidad, presentacion, unidades_por_presentacion
    into v_art from public.articulos where id = p_articulo_id;

  if v_art.unidad is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
  end if;

  /*
    UN BULTO ES ENTERO, Y AQUI ES DONDE TIENE QUE DECIRLO.

    La regla vivia solo en `registrar_ajuste`, asi que por las entradas y las
    salidas pasaban «2,5 tambores» y «-1 tambor». La cantidad final salia bien
    —las tres puertas rechazan un total que no sea positivo—, asi que el libro
    no se descuadraba; lo que se estropeaba era la otra mitad:
    `cantidad_capturada` existe para poder cotejar el asiento contra un estante,
    y «-1 bultos» no se coteja con nada.

    ES LA CUARTA VEZ QUE APARECE LA MISMA FORMA —la reja en una puerta y no en
    la de al lado— y por eso esta vez va aqui y no repetida tres veces. Las tres
    puertas llaman a este ayudante: la regla que vive en el ayudante no se puede
    quedar fuera de ninguna, y la puerta que aparezca manana la hereda sin que
    nadie se acuerde.

    Lo que sobra del ultimo bulto no se pierde: va en `p_sueltas`, que es el
    campo de al lado y admite decimales.
  */
  if p_presentaciones is not null then
    if p_presentaciones < 0 then
      raise exception 'No se pueden contar bultos en negativo.' using errcode = '22023';
    end if;
    if p_presentaciones <> trunc(p_presentaciones) then
      -- El hueco es `%` a secas: `%s` deja la ese pegada al numero. Van tres.
      raise exception 'Los bultos se cuentan enteros: % no es un número de bultos. Lo que sobra del último va en lo suelto.',
        private.numero_es(p_presentaciones, 2)
        using errcode = '22023',
              hint = 'Un tambor y medio se cuenta como 1 tambor y lo que quede, en la unidad del artículo.';
    end if;
  end if;

  if coalesce(p_presentaciones, 0) = 0 then
    return coalesce(p_sueltas, 0);
  end if;

  if v_art.presentacion is null or coalesce(v_art.unidades_por_presentacion, 0) <= 0 then
    raise exception '"%" no dice en qué presentación viene, así que no se puede contar por bultos.',
      v_art.nombre
      using errcode = '22023',
            hint = 'La presentación y cuántas unidades trae se declaran en el catálogo del artículo.';
  end if;

  return p_presentaciones * v_art.unidades_por_presentacion + coalesce(p_sueltas, 0);
end;
$function$;

comment on function private.en_unidad_base(bigint, numeric, numeric) is
  'Pasa «N presentaciones y M sueltas» a la unidad de operacion: 7 tambores y 10 L de un articulo de 208 son 1.466 L. Sin presentaciones devuelve las sueltas tal cual. Exige que los bultos sean enteros y no negativos, y lo exige AQUI y no en cada puerta: las tres que cuentan por bultos llaman a este ayudante, y una regla repetida tres veces es una regla que se queda fuera de la cuarta.';

/*
  COMPROBADO en transaccion deshecha, por las tres puertas:

    2,5 bultos por ENTRADAS ... rebota: «Los bultos se cuentan enteros: 2,50 no
                                es un número de bultos. Lo que sobra del último
                                va en lo suelto.»
    -1 bulto por ENTRADAS ..... rebota: «No se pueden contar bultos en negativo.»
    1,75 bultos por SALIDAS ... rebota, con el mismo mensaje y su cifra
    2,5 bultos por AJUSTE ..... rebota (ya lo hacia)
    7 bultos y 10 ............. pasa: opera 150, capturado 7 bultos + 10

  Al terminar: 19 movimientos, MOV-2026-0019, valor 868.927.307,04. Nada de
  produccion tocado.
*/
