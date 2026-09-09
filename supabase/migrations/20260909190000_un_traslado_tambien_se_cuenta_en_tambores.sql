/*
  UN TRASLADO TAMBIÉN SE CUENTA EN TAMBORES.

  Christopher: «¿es posible hacer una transferencia o traslado para otro almacén
  de un item y que solo sean pailas o tambores o ambos? ... o registrar una
  entrada o salida de esa manera».

  Al ir a comprobarlo, la respuesta era media:

      entrada .... SÍ. `registrar_entradas` recibe los renglones en jsonb y cada
                   uno lleva su presentación y sus sueltos.
      salida ..... SÍ, por la misma vía.
      conteo ..... SÍ. `registrar_ajuste` recibe presentación y cantidad.
      TRASLADO ... NO. `transferir_existencia` recibía una cifra pelada.

  O sea que se podía recibir el aceite en tambores, contarlo en tambores y
  gastarlo en tambores, y al moverlo de un almacén a otro había que traducirlo a
  litros de cabeza. Justo en la operación donde nadie está mirando una factura y
  lo único que hay delante son los envases que se están cargando en la camioneta.

  ═══════════════════════════════════════════════════════════════════════════
  LO QUE SE GUARDA, Y LO QUE SE CALCULA
  ═══════════════════════════════════════════════════════════════════════════

  Lo mismo que ya hacen las otras puertas, y por lo mismo: la pantalla manda LO
  QUE SE TECLEÓ —«2 tambores y 10 L»— y la base hace la cuenta con
  `private.en_unidad_base`. La existencia se mueve en litros, que es la única
  vara del libro, y al lado del asiento quedan las tres cifras de lo tecleado.

  ESO ES LO QUE PERMITIÓ RECONSTRUIR EL ERROR DEL 5/09 en los cinco aceites, y es
  la razón de que se repita aquí: un asiento que solo guarda el resultado no se
  puede desmentir un año después. Uno que guarda además lo que se tecleó, sí.

  LAS DOS PATAS SE MARCAN IGUAL. Un traslado escribe dos asientos, la salida del
  origen y la entrada del destino, y los dos se cuentan en tambores porque son
  los mismos tambores subiendo y bajando de la misma camioneta. Marcar solo uno
  dejaría la mitad de la operación sin explicar.

  ═══════════════════════════════════════════════════════════════════════════
  «O AMBOS»: DOS ENVASES A LA VEZ NO CABEN EN UN TRASLADO, Y ESTÁ BIEN
  ═══════════════════════════════════════════════════════════════════════════

  Christopher pregunta también por mover «pailas o tambores o ambos». Un traslado
  admite UN envase más sus sueltos: «2 tambores y 10 L». Para mover un tambor y
  tres pailas se hacen dos traslados.

  No es una limitación que haya que quitar: son dos hechos distintos y conviene
  que queden como dos asientos. Cada uno dice qué envase se movió, y esa es
  justamente la información que un solo asiento mezclado perdería —quedaría «455
  L» y nadie sabría si eran tambores, pailas o las dos cosas—.
*/

/*
  EL `drop` VA EN LA MISMA MIGRACIÓN Y NO ES FORMALISMO.

  `create or replace` con una firma distinta NO reemplaza: AÑADE una segunda
  función, y toda llamada con argumentos con nombre pasa a ser ambigua con
  «42725: is not unique». Eso ocurrió el 8/09 con
  `private.registrar_movimiento` y dejó TODAS las escrituras de inventario
  caídas, porque la llaman las catorce puertas. La firma vieja se va antes.
*/
drop function if exists public.transferir_existencia(bigint, bigint, bigint, numeric, text, date);

create or replace function public.transferir_existencia(
  p_origen_id       bigint,
  p_destino_id      bigint,
  p_articulo_id     bigint,
  p_cantidad        numeric,
  p_motivo          text,
  p_fecha           date default null,
  p_presentaciones  numeric default null,
  p_presentacion    text default null,
  p_suelto          numeric default null
)
returns bigint language plpgsql security definer set search_path to ''
as $function$
declare
  v_origen public.almacenes; v_destino public.almacenes;
  v_existencia numeric; v_costo numeric; v_articulo text; v_salida bigint;
  v_cantidad numeric; v_nombre_pres text;
begin
  perform private.exigir_rol('ALMACEN');

  if p_origen_id = p_destino_id then
    raise exception 'El origen y el destino son el mismo almacén.' using errcode = '22023';
  end if;

  select * into v_origen  from public.almacenes where id = p_origen_id;
  select * into v_destino from public.almacenes where id = p_destino_id;

  if v_origen.id is null then
    raise exception 'No existe el almacén de origen %.', p_origen_id using errcode = 'P0002';
  end if;
  if v_destino.id is null then
    raise exception 'No existe el almacén de destino %.', p_destino_id using errcode = 'P0002';
  end if;

  if not v_destino.activo then
    raise exception 'El almacén "%" está inactivo y no puede recibir material.', v_destino.nombre
      using errcode = '22023';
  end if;

  /*
    LA CUENTA LA HACE LA BASE, no el navegador.

    `en_unidad_base` es el mismo ayudante que usan la entrada y la salida, así
    que «2 tambores y 10 L» significa lo mismo en las tres puertas. Si se manda
    presentación, manda ella; si no, se toma la cifra pelada de siempre, que es
    lo que sigue enviando quien mueve algo que no tiene envases declarados.
  */
  if nullif(btrim(coalesce(p_presentacion, '')), '') is not null
     and coalesce(p_presentaciones, 0) > 0 then
    /*
      QUIEN VALIDA ES `en_unidad_base`, Y ESTO LO ENSEÑÓ LA PRUEBA DE HUMO.

      La primera versión de esta puerta preguntaba antes por
      `private.presentacion_usada`, y estaba mal: ese ayudante NO valida, RESUELVE
      — si la presentación pedida no está declarada, se cae a la del artículo—.
      Con eso, pedir «1 garrafa» de un aceite que se cuenta en pailas movía una
      paila y no decía nada. Una sustitución silenciosa en una puerta de
      inventario es peor que un error: el asiento queda bien formado y mintiendo.

      `en_unidad_base` sí rechaza —«no se cuenta en GARRAFA, esa presentación no
      está declarada o está apagada»— y además es el mismo ayudante que usan la
      entrada y la salida, así que las tres puertas aceptan y rechazan lo mismo.
      El nombre canónico se toma después, cuando la conversión ya dijo que sí.
    */
    v_cantidad := private.en_unidad_base(
                    p_articulo_id, p_presentaciones, coalesce(p_suelto, 0), p_presentacion);
    v_nombre_pres := upper(btrim(p_presentacion));
  else
    v_cantidad := p_cantidad;
  end if;

  if coalesce(v_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se mueve. Un traslado sin motivo no se puede auditar.'
      using errcode = '22023';
  end if;

  /*
    LA REJA DEL TANQUE SIN COSTO, QUE AQUI FALTABA.

    El material sale al `costo_promedio` de su origen. En un almacen marcado
    `admite_sin_costo` ese promedio es cero por diseno, asi que un traslado
    desde ahi mete ceros en el destino y le hunde el promedio — justo lo que
    `registrar_entrada` impide por la otra puerta. Lo encontro el carril de
    base de datos el 7/09/2026; yo di esta reja por cerrada el 31/08 y lo
    estaba solo en la puerta que mire.
  */
  if coalesce(v_origen.admite_sin_costo, false)
     and not coalesce(v_destino.admite_sin_costo, false) then
    raise exception 'De "%" no se puede trasladar a "%": lo que hay ahí entró sin costo y hundiría el costo promedio del destino.',
      v_origen.nombre, v_destino.nombre
      using errcode = '22023',
            hint = 'Antes hay que decidir a qué precio se valora lo que trasladó la otra empresa. Mientras no se decida, el traslado escribiría un cero que después no se puede distinguir de un precio real.';
  end if;

  if not coalesce(v_origen.admite_sin_costo, false)
     and coalesce(v_destino.admite_sin_costo, false) then
    raise exception 'A "%" solo entra lo que no costó nada, y lo que sale de "%" tiene precio.',
      v_destino.nombre, v_origen.nombre
      using errcode = '22023',
            hint = 'Ese almacén lleva aparte lo que no le costó nada a esta empresa. Metiendo ahí material con precio se pierde su valor y el nombre del tanque deja de ser verdad.';
  end if;

  v_existencia := private.existencia_para_escribir(p_origen_id, p_articulo_id);

  if v_cantidad > v_existencia then
    select nombre into v_articulo from public.articulos where id = p_articulo_id;
    raise exception 'En "%" solo hay % de "%" y se intentan mover %.',
      v_origen.nombre, private.numero_es(v_existencia, 4),
      coalesce(v_articulo, p_articulo_id::text), private.numero_es(v_cantidad, 4)
      using errcode = '22023';
  end if;

  v_costo := private.costo_promedio(p_origen_id, p_articulo_id);

  /*
    LAS DOS PATAS LLEVAN LA MISMA MARCA: son los mismos tambores subiendo y
    bajando de la misma camioneta. Con una sola marcada, la mitad de la
    operación quedaría sin explicar.
  */
  v_salida := private.registrar_movimiento(
    p_tipo => 'TRANSFERENCIA_SALIDA', p_signo => (-1)::smallint,
    p_almacen => p_origen_id, p_articulo => p_articulo_id,
    p_cantidad => v_cantidad, p_costo_usd => v_costo,
    p_nota => format('Traslado a %s. %s', v_destino.nombre, p_motivo),
    p_fecha => p_fecha,
    p_cantidad_capturada => case when v_nombre_pres is not null then p_presentaciones end,
    p_unidad_capturada   => v_nombre_pres,
    p_suelto_capturado   => case when v_nombre_pres is not null then nullif(p_suelto, 0) end);

  perform private.registrar_movimiento(
    p_tipo => 'TRANSFERENCIA_ENTRADA', p_signo => (1)::smallint,
    p_almacen => p_destino_id, p_articulo => p_articulo_id,
    p_cantidad => v_cantidad, p_costo_usd => v_costo,
    p_nota => format('Traslado desde %s. %s', v_origen.nombre, p_motivo),
    p_origen => v_salida, p_fecha => p_fecha,
    p_cantidad_capturada => case when v_nombre_pres is not null then p_presentaciones end,
    p_unidad_capturada   => v_nombre_pres,
    p_suelto_capturado   => case when v_nombre_pres is not null then nullif(p_suelto, 0) end);

  return v_salida;
end;
$function$;

comment on function public.transferir_existencia(bigint, bigint, bigint, numeric, text, date, numeric, text, numeric) is
  'Mueve material de un almacen a otro, y desde el 9/09/2026 se puede contar en envases: «2 tambores y 10 L». La cuenta la hace la base con `private.en_unidad_base`, el mismo ayudante que usan la entrada y la salida, para que la misma frase signifique lo mismo en las tres puertas. La existencia se mueve en la unidad de operacion —la unica vara del libro— y al lado de CADA UNA de las dos patas quedan las tres cifras de lo tecleado: son los mismos tambores subiendo y bajando de la misma camioneta. Un traslado admite UN envase mas sus sueltos; para mover un tambor y tres pailas se hacen dos traslados, y eso es deseable: son dos hechos y un solo asiento mezclado perderia cual envase se movio.';

grant execute on function public.transferir_existencia(bigint, bigint, bigint, numeric, text, date, numeric, text, numeric) to authenticated;
