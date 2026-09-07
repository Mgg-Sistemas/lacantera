/*
  LA BASE SABE CONTAR EN BULTOS, NO SOLO EL NAVEGADOR.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 7 de septiembre de 2026, por MCP. Los cuerpos que se reemplazan
  salieron de `pg_get_functiondef` — regla 7.
  ————————————————————————————————————————————————————————————————————————

  DE DÓNDE VIENE

  `CantidadDeArticulo` dejaba teclear «3 tambores» y mandaba 624 litros. Cómodo,
  y la base no tenía ni idea de que existieran los tambores: quien llamara la
  función por fuera, o el día que un formulario se olvidara de convertir, metía
  3 litros donde quería meter 624 y nada lo notaba.

  Christopher, el 7 de septiembre: «vamos a respaldarla con la base, así el
  sistema tiene noción en todo momento sobre lo que hay o no hay en sus
  presentaciones o en el formato de operación».

  SIETE TAMBORES Y DIEZ LITROS

  Y media hora después, la corrección que cambia el modelo entero:

    «el usuario ingresa 7 tambores y 10 L (en sí son 8 tambores, pero se entiende
     que el 8vo apenas le quedan litros), lo mismo 8 rollos de malla y 4 M»

  Es como se cuenta un almacén de verdad. Nadie dice «1.466 litros»: dice siete
  tambores llenos y uno empezado. El primer diseño aceptaba tambores O litros y
  se quedaba corto; el bueno es **enteros MÁS suelto**:

      7 tambores y 10 L   ->  7 × 208 + 10  =  1.466
      3 tambores          ->  3 × 208 +  0  =    624
      50 L                ->  0       + 50  =     50

  El tercer caso —el de siempre— sigue funcionando sin que nadie cambie nada, y
  por eso esto no rompe el front actual: manda `cantidad` y ningún
  `presentaciones`, así que la cuenta da lo mismo que antes.

  QUÉ SE GUARDA, Y POR QUÉ EL TRÍO ENTERO

  `cantidad` sigue siendo siempre la unidad de operación: de ahí salen la
  existencia, el costo promedio y todos los cálculos. Al lado quedan las tres
  cosas que la persona dijo —7, TAMBOR, 10— y no se deriva ninguna de las otras
  dos, porque `unidades_por_presentacion` se puede editar en el catálogo y
  entonces un movimiento viejo contaría una mentira nueva. Un asiento tiene que
  poder leerse dentro de diez años sin depender de una tabla que cambia.

  LO QUE NO SE NORMALIZA, A PROPÓSITO

  «1 tambor y 300 L» de un artículo de 208 se guarda como 508 L y no se
  convierte en «2 tambores y 92 L». Contar así es raro pero no es falso, y
  reescribirle a alguien lo que contó es como se pierde la confianza en un
  inventario. La reja de existencia hace su trabajo igual: 508 son 508.

  EL COSTO LLEVA SU PROPIA UNIDAD

  Alguien cuenta en tambores y conoce el precio por litro, o al revés. La
  pantalla ofrece los dos selectores por separado, así que la base acepta las
  dos respuestas: `costo_por_presentacion` en el renglón. Se DIVIDE, al revés
  que la cantidad.

  DONDE ESTÁ PUESTO Y DONDE NO

  Puesto: `registrar_entradas` y `registrar_salidas`, que son las dos puertas
  con renglones en JSON y por tanto las que no necesitan cambiar de firma.

  **Pendiente**: `registrar_entrada`, `registrar_salida`, `registrar_ajuste`,
  `transferir_existencia` y `despachar_combustible`. Son posicionales y añadirles
  un parámetro crea una firma nueva que hay que soltar a mano —ya mordió dos
  veces hoy—. El ajuste de conteo es el más urgente de los cinco: contar un
  almacén es justo lo que se hace en bultos.
*/

do $guarda$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='articulos'
                    and column_name='unidades_por_presentacion') then
    raise exception 'Falta articulos.unidades_por_presentacion.';
  end if;
end $guarda$;

-- ---------------------------------------------------------------------------
-- Lo que la persona contó, al lado de lo que el sistema opera
-- ---------------------------------------------------------------------------
alter table public.inventario_movimientos
  add column if not exists cantidad_capturada numeric,
  add column if not exists unidad_capturada   text,
  add column if not exists suelto_capturado   numeric;

comment on column public.inventario_movimientos.cantidad_capturada is
  'Cuantas presentaciones enteras se contaron (7 tambores). Nulo cuando se conto solo en la unidad de operacion.';
comment on column public.inventario_movimientos.unidad_capturada is
  'La presentacion en la que se conto: TAMBOR, ROLLO, BULTO. Nulo cuando se conto en la unidad de operacion.';
comment on column public.inventario_movimientos.suelto_capturado is
  'Lo que acompana a los bultos enteros, en la unidad de operacion (los 10 L del octavo tambor). Nulo cuando no hubo suelto.';

-- ---------------------------------------------------------------------------
-- La cuenta
-- ---------------------------------------------------------------------------
create or replace function private.en_unidad_base(
  p_articulo_id bigint, p_presentaciones numeric default null, p_sueltas numeric default 0
) returns numeric language plpgsql stable security definer set search_path to ''
as $function$
declare v_art record;
begin
  /*
    Siete tambores y diez litros son 1.466 litros. Los dos sumandos son
    independientes y los dos pueden faltar; sin presentaciones devuelve las
    sueltas tal cual, que es como se ha llamado siempre a estas funciones.
  */
  select nombre, unidad, presentacion, unidades_por_presentacion
    into v_art from public.articulos where id = p_articulo_id;

  if v_art.unidad is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
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
  'Pasa «N presentaciones y M sueltas» a la unidad de operacion: 7 tambores y 10 L de un articulo de 208 son 1.466 L. Sin presentaciones devuelve las sueltas tal cual.';

/*
  El punto unico de insercion recuerda el trio capturado. Se anaden tres
  parametros AL FINAL y con defecto, asi que los otros veinte llamadores no
  cambian ni una linea — pero hay que soltar la firma vieja, porque
  `create or replace` con otra firma ANADE una funcion en vez de reemplazarla.
  Eso ya mordio dos veces hoy.

  El cuerpo completo de `private.registrar_movimiento`, de
  `public.registrar_entradas` y de `public.registrar_salidas` es el que devuelve
  `pg_get_functiondef` tras esta migracion. Se aplicaron por MCP con el texto
  que quedo vivo; se documentan aqui y no se repiten para no tener dos copias
  que puedan discrepar. Para verlos:

      select pg_get_functiondef(p.oid)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.proname in ('registrar_movimiento','registrar_entradas','registrar_salidas');

  Lo que cambia en cada uno:

    registrar_movimiento  + p_cantidad_capturada, p_unidad_capturada,
                            p_suelto_capturado  (los tres al final, con defecto)
                          y los escribe en el insert, porque el libro es
                          inmutable y un update seria rechazado.

    registrar_entradas    lee `presentaciones` del renglon y llama a
                          `en_unidad_base`; acepta `costo_por_presentacion`
                          para dividir el precio del bulto; pasa el trio.

    registrar_salidas     lo mismo, y ADEMAS en la suma acumulada de los
                          renglones anteriores — que es lo delicado de esa
                          funcion: convertir solo en un sitio dejaria la reja de
                          existencia comparando tambores contra litros.
*/

/*
  COMPROBADO en transaccion deshecha, el 7 de septiembre:

  ENTRADAS
    7 cajas + 10 sueltas ....... guarda 150 PAR · capturado «7 PAR + 10»
    solo sueltas ............... guarda 50 L · captura NULA, como debe
    bultos sin presentacion .... rebota: «no dice en que presentacion viene»
    costo por caja de 410 ...... 20 unidades a 20,50 cada una

  SALIDAS (con 200 PAR de municion)
    saco 7 cajas + 10 sueltas .. 150 PAR, quedan 50 · capturado «7 PAR + 10»
    saco 5 cajas teniendo 50 ... rebota: «solo quedan 50 y se intentan sacar 100»
    dos renglones que suman 80 . rebota: la suma acumulada tambien convierte

  Al terminar: 19 movimientos, MOV-2026-0019, valor 868.927.307,04, cero
  capturas. Nada de produccion tocado.
*/
