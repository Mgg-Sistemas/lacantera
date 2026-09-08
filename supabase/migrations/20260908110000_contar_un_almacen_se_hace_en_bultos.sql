/*
  CONTAR UN ALMACÉN SE HACE EN BULTOS.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026, por MCP, y probada en transacción
  deshecha con el recorrido entero: entrada, salida y conteo.
  ————————————————————————————————————————————————————————————————————————

  LO QUE FALTABA

  El 7 de septiembre `registrar_entradas` y `registrar_salidas` aprendieron a
  recibir «7 tambores y 10 L», y su propia migración dejó escrito el resto:

      «PENDIENTE: `registrar_entrada`, `registrar_salida`, `registrar_ajuste`,
       `transferir_existencia` y `despachar_combustible`. Son posicionales y
       añadirles un parámetro crea una firma nueva que hay que soltar a mano.
       **El ajuste de conteo es el más urgente de los cinco: contar un almacén
       es justo lo que se hace en bultos.**»

  Y además, hasta hoy nada de eso tenía pantalla. La base sabía sumar tambores
  desde el día 7 y no había dónde teclearlos: el modelo entero vivía en el
  catálogo de funciones sin que ningún formulario lo usara.

  ═══════════════════════════════════════════════════════════════════════════
  El ajuste
  ═══════════════════════════════════════════════════════════════════════════

  `p_contado` sigue siendo las sueltas y `p_presentaciones` los bultos enteros,
  al final y con defecto, así que las llamadas viejas cuentan exactamente igual
  que antes. Hubo que soltar la firma de cinco argumentos: `create or replace`
  con otra firma AÑADE una función. Van cuatro veces en dos días.

  LA NOTA DICE LO QUE LA PERSONA CONTÓ, no solo su equivalente. Quien contó
  siete tambores y diez litros no reconoce «1.466 L» al releerlo dentro de un
  mes, y entonces no puede cuadrar el movimiento contra su hoja de conteo:

      Conteo físico: 4,00 PAR y 2,0000 PAR = 82,0000 PAR contra 85,0000 PAR
      en sistema. Conteo del 8 de septiembre.

  Y DE PASO, UN DEFECTO QUE LLEVABA AHÍ DESDE SIEMPRE: el mensaje anterior metía
  los números crudos en `format('%s')`, y el servidor tiene `lc_numeric` en
  `en_US`, así que un conteo de mil litros se leía «1000.0000» donde aquí se
  escribe «1.000,0000». Ahora pasa por `private.numero_es`, que existe desde el
  día 7 precisamente para esto.

  ═══════════════════════════════════════════════════════════════════════════
  Y LA PANTALLA, que es lo que faltaba de verdad
  ═══════════════════════════════════════════════════════════════════════════

  `CantidadDeArticulo` ofrecía la cantidad en bultos O en la unidad de
  operación, y el modelo que pidió Christopher es enteros MÁS suelto:

      «el usuario ingresa 7 tambores y 10 L (en sí son 8 tambores, pero se
       entiende que el 8vo apenas le quedan litros), lo mismo 8 rollos de malla
       y 4 M»

  Al contar en bultos aparece ahora un segundo campo para lo suelto. Contando en
  la unidad de operación no aparece: ahí no hay nada que acompañar, y un campo
  vacío de más es una pregunta que nadie tiene que contestar.

  LO QUE VIAJA SON LAS DOS CIFRAS, NO LA SUMA, y ése es el punto entero. El
  navegador la calcula para ENSEÑARLA —«7 TAMBOR y 10 L = 1.466 L», que es la
  línea que hay que leer antes de guardar— pero manda `presentaciones` y
  `cantidad` por separado. La suma la vuelve a hacer la base con
  `private.en_unidad_base`, y guarda al lado del asiento las tres cifras que la
  persona dijo. Mandando el total ya multiplicado, esas tres se perderían y la
  base volvería a no tener ni idea de que existen los tambores — que es
  exactamente el estado del que se salió el día 7.

  Puesto en las tres puertas: la entrada de varios renglones, la salida de
  varios renglones y el conteo. La salida de una fila y la baja siguen con el
  campo simple, y es deliberado: ahí se saca una cantidad concreta, no se
  recuenta un estante.
*/

do $guarda$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='en_unidad_base') then
    raise exception 'Falta private.en_unidad_base, que es quien suma los bultos.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='numero_es') then
    raise exception 'Falta private.numero_es.';
  end if;
end $guarda$;

/*
  `create or replace` con otra firma ANADE una funcion en vez de reemplazarla.
  Hay que soltar la vieja a mano: va la cuarta vez en dos dias.
*/
drop function if exists public.registrar_ajuste(bigint, bigint, numeric, text, date);

create or replace function public.registrar_ajuste(
  p_almacen_id     bigint,
  p_articulo_id    bigint,
  p_contado        numeric,
  p_motivo         text,
  p_fecha          date default null,
  p_presentaciones numeric default null
) returns bigint language plpgsql security definer set search_path to ''
as $function$
declare
  v_existencia numeric;
  v_diferencia numeric;
  v_costo      numeric;
  v_total      numeric;
  v_art        record;
  v_conto      text;
begin
  /*
    CONTAR UN ALMACEN ES JUSTO LO QUE SE HACE EN BULTOS.

    Nadie recorre un almacen anotando «1.466 litros». Anota siete tambores
    llenos y uno empezado.

    `p_contado` sigue siendo las sueltas, asi que las llamadas viejas —que no
    mandan presentaciones— cuentan exactamente igual que antes.
  */
  perform private.exigir_rol('ALMACEN');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Un ajuste sin explicación es un descuadre disfrazado. Escribe qué pasó.'
      using errcode = '22023';
  end if;

  select nombre, unidad, presentacion, unidades_por_presentacion
    into v_art from public.articulos where id = p_articulo_id;
  if v_art.unidad is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
  end if;

  v_total := private.en_unidad_base(p_articulo_id, p_presentaciones, coalesce(p_contado, 0));

  if v_total < 0 then
    raise exception 'Lo contado no puede ser negativo.' using errcode = '22023';
  end if;

  v_existencia := private.existencia_para_escribir(p_almacen_id, p_articulo_id);
  v_diferencia := v_total - v_existencia;

  if abs(v_diferencia) < 0.0001 then
    raise exception 'Lo contado coincide con lo que dice el sistema (% %). No hay nada que ajustar.',
      private.numero_es(v_existencia, 4), v_art.unidad using errcode = '22023';
  end if;

  v_costo := private.costo_promedio(p_almacen_id, p_articulo_id);

  /*
    LA NOTA DICE LO QUE LA PERSONA CONTO, NO SOLO SU EQUIVALENTE.

    Y con `private.numero_es`: el servidor tiene `lc_numeric` en en_US, asi que
    `%s` sobre un numeric daba «1466.0000» donde aqui se lee «1.466,0000». El
    mensaje anterior de esta funcion lo tenia y nadie lo habia visto.
  */
  if coalesce(p_presentaciones, 0) <> 0 then
    v_conto := format('%s %s%s = %s %s',
      private.numero_es(p_presentaciones, 2), v_art.presentacion,
      case when coalesce(p_contado, 0) <> 0
           then format(' y %s %s', private.numero_es(p_contado, 4), v_art.unidad)
           else '' end,
      private.numero_es(v_total, 4), v_art.unidad);
  else
    v_conto := format('%s %s', private.numero_es(v_total, 4), v_art.unidad);
  end if;

  /*
    El insertador lleva DIECIOCHO parametros y el trio capturado va al final,
    detras de otros cuatro que aqui no se usan. Se llama por nombre: contarlos
    a ojo fallo al primer intento, y la prueba lo cazo.
  */
  return private.registrar_movimiento(
    case when v_diferencia > 0 then 'AJUSTE_POSITIVO' else 'AJUSTE_NEGATIVO' end,
    case when v_diferencia > 0 then 1 else -1 end::smallint,
    p_almacen_id, p_articulo_id, abs(v_diferencia), v_costo,
    format('Conteo físico: %s contra %s %s en sistema. %s',
           v_conto, private.numero_es(v_existencia, 4), v_art.unidad, p_motivo),
    null, null, null, p_fecha,
    p_cantidad_capturada => nullif(coalesce(p_presentaciones, 0), 0),
    p_unidad_capturada   => case when coalesce(p_presentaciones, 0) <> 0
                                 then v_art.presentacion end,
    p_suelto_capturado   => case when coalesce(p_presentaciones, 0) <> 0
                                  and coalesce(p_contado, 0) <> 0
                                 then p_contado end);
end;
$function$;

comment on function public.registrar_ajuste(bigint, bigint, numeric, text, date, numeric) is
  'Cuadra la existencia con lo que se conto. Acepta «7 tambores y 10 L»: `p_contado` son las sueltas y `p_presentaciones` los bultos enteros, que es como se recorre un almacen de verdad. Sin presentaciones cuenta igual que siempre. La nota guarda lo que la persona conto y su equivalente, para que se pueda cuadrar contra la hoja de conteo.';

revoke execute on function public.registrar_ajuste(bigint, bigint, numeric, text, date, numeric) from public, anon;
grant execute on function public.registrar_ajuste(bigint, bigint, numeric, text, date, numeric) to authenticated;

/*
  COMPROBADO en transaccion deshecha, con BOTAS DE SEGURIDAD (20 por PAR), y
  mandando exactamente lo que manda la pantalla:

    entrada  7 PAR + 10 ...... opera 150 · capturado «7 PAR + 10»
    salida   3 PAR + 5 ....... opera  65 · capturado «3 PAR + 5»
    conteo   4 PAR + 2 = 82
             contra 85 ....... AJUSTE_NEGATIVO de 3 · capturado «4 PAR + 2»
             y la nota: «Conteo físico: 4,00 PAR y 2,0000 PAR = 82,0000 PAR
             contra 85,0000 PAR en sistema.»

    contar lo mismo que hay ... rebota, y ya en formato de aqui
    bultos de un articulo que
    no dice presentacion ...... rebota: «no dice en qué presentación viene»

  Al terminar: 19 movimientos, MOV-2026-0019, valor 868.927.307,04, cero
  capturas. Nada de produccion tocado.

  SE VE DE PASO UN DEFECTO DEL CATALOGO, y no es de esta migracion: BOTAS DE
  SEGURIDAD tiene `unidad` PAR y `presentacion` PAR, asi que el mensaje dice
  «4 PAR y 2 PAR». El dato esta mal —una caja de veinte pares no es un par— y
  esta en la lista de los quince articulos por revisar.

  PENDIENTE

    - `registrar_entrada`, `registrar_salida`, `transferir_existencia` y
      `despachar_combustible` siguen sin contar en bultos. Eran cinco, quedan
      cuatro, y el urgente era este.
    - La nota de salida en papel imprime el equivalente y no lo que se conto:
      `notaDelMovimiento` no lee las tres columnas. El papel que alguien firma
      deberia decir lo que se le entrego.
*/
