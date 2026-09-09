/*
  EL LIBRO RECUERDA QUÉ PRECIO SE TECLEÓ, EN QUÉ MONEDA Y POR QUÉ UNIDAD.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026, por MCP, en tres trozos —dos de ellos
  arreglando lo que rompió el primero— y probada por las seis puertas que
  escriben en el libro.
  ————————————————————————————————————————————————————————————————————————

  DE DÓNDE SALE, y es un caso real de producción. El 5 de septiembre a las
  12:05:37, en una sola llamada con la referencia «DISTRIBUIDORA NASELF C.A ·
  REF.: 000617», entraron cinco aceites y el inventario pasó a valer
  868.927.307,04 USD.

  Christopher, el 8/09: Jesmary dice que los precios que cargó son correctos y
  están en dólares — «el error aparentemente fue en la unidad… ella colocó el
  precio de la presentación pero el sistema está multiplicando por la unidad de
  operación».

  AL IR A COMPROBARLO NO SE PUEDE, Y ESE ES EL HALLAZGO:

      inventario_movimientos guarda  cantidad_capturada, unidad_capturada,
                                     suelto_capturado
      y del costo guardaba ......... NADA

  Ni la moneda, ni la tasa, ni el número que se tecleó, ni si era por litro o
  por tambor. La auditoría tampoco sirve: capturó la fila ya convertida. **La
  mitad del asiento que cuenta sabe explicarse un año después; la mitad que vale
  dinero, no.** Y fue justo la que se equivocó.

  La verdad de aquellos cinco está en la factura NASELF 000617, no en la base, y
  **por eso no se corrigen aquí**: Christopher fue explícito —«no podemos cambiar
  los precios, pues desconocemos, pero podemos preparar el sistema»—. No se
  inventan números que no se pueden comprobar.

  ═══════════════════════════════════════════════════════════════════════════
  LA SIMETRÍA QUE FALTABA
  ═══════════════════════════════════════════════════════════════════════════

  La cantidad ya se resolvió: la pantalla manda LO QUE SE TECLEÓ —«3 TAMBOR y
  10 L»—, la base hace la cuenta y guarda las dos cifras al lado del asiento. El
  costo se quedó a medias: la pantalla divide en el navegador y manda el precio
  por unidad ya calculado, así que la base nunca se entera de que se tecleó el
  precio del tambor.

  Ahora se guarda al lado: `costo_capturado`, `costo_unidad_capturada` y
  `moneda_capturada`. Con eso «1.318.073,76» deja de ser un número suelto y pasa
  a ser «1.318.073,76 USD por TAMBOR», que se puede desmentir mirándolo.

  ═══════════════════════════════════════════════════════════════════════════
  DOS ERRORES MÍOS EN DIEZ MINUTOS, Y LOS DOS DE SUSTITUIR TEXTO A CIEGAS
  ═══════════════════════════════════════════════════════════════════════════

  Van escritos porque la lección vale más que el arreglo:

  1. **`create or replace` con una firma distinta AÑADE una función.** Al darle
     tres argumentos a `private.registrar_movimiento` quedaron dos —18 y 21— y
     toda llamada con argumentos con nombre pasó a ser ambigua:
     «42725: function private.registrar_movimiento(...) is not unique». Con eso,
     TODAS las escrituras de inventario dejaron de funcionar: la llaman las
     catorce puertas. El `drop function` de la firma vieja va en la MISMA
     migración, no en la siguiente.

  2. **El patrón de la lista de valores no encajaba.** Buscaba
     «p_cantidad_capturada, p_unidad_capturada, p_suelto_capturado)» en una línea
     y en el cuerpo van en tres, cada uno con su `nullif`. La lista de columnas
     creció y la de valores no: «INSERT has more target columns than
     expressions».

  Los dos los cazó la prueba de humo inmediata —las seis puertas, en transacción
  deshecha, antes de dar nada por hecho—, así que ninguno llegó a manos de
  nadie. Es exactamente para lo que está.
*/

-- ---------------------------------------------------------------------------
-- 1. Las tres columnas, al lado de las tres que ya hay
-- ---------------------------------------------------------------------------
alter table public.inventario_movimientos
  add column if not exists costo_capturado numeric,
  add column if not exists costo_unidad_capturada text,
  add column if not exists moneda_capturada text;

comment on column public.inventario_movimientos.costo_capturado is
  'El precio tal como se tecleo, sin convertir. Con `costo_unidad_capturada` y `moneda_capturada` al lado hace por el costo lo que `cantidad_capturada` hace por la cantidad: permite desmentir el asiento un ano despues sin la factura delante.';
comment on column public.inventario_movimientos.costo_unidad_capturada is
  'A que se referia ese precio: nulo = a la unidad de operacion; si no, el NOMBRE de la presentacion. Es lo que faltaba el 5/09/2026 para saber si «1.318.073,76» era por litro o por tambor.';
comment on column public.inventario_movimientos.moneda_capturada is
  'La moneda en que se escribio el precio, antes de pasarlo a dolares.';

-- ---------------------------------------------------------------------------
-- 2. El ayudante que escribe el asiento las acepta
-- ---------------------------------------------------------------------------
do $ayudante$
declare v_def text; v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='private' and p.proname='registrar_movimiento'
   order by p.pronargs desc limit 1;
  v_antes := v_def;

  if position('p_costo_capturado' in v_def) = 0 then
    v_def := replace(v_def,
      'p_suelto_capturado numeric DEFAULT NULL::numeric)',
      'p_suelto_capturado numeric DEFAULT NULL::numeric, p_costo_capturado numeric DEFAULT NULL::numeric, p_costo_unidad_capturada text DEFAULT NULL::text, p_moneda_capturada text DEFAULT NULL::text)');

    v_def := replace(v_def,
      'cantidad_capturada, unidad_capturada, suelto_capturado)',
      'cantidad_capturada, unidad_capturada, suelto_capturado, costo_capturado, costo_unidad_capturada, moneda_capturada)');
  end if;

  -- La lista de VALORES va en tres lineas, cada una con su nullif: hay que
  -- anclarse al cierre real y no al que uno se imagina.
  if position('p_costo_capturado,' in v_def) = 0 then
    v_def := replace(v_def,
'     nullif(p_suelto_capturado, 0))
  returning id into v_id;',
'     nullif(p_suelto_capturado, 0),
     p_costo_capturado,
     nullif(btrim(coalesce(p_costo_unidad_capturada, '''')), ''''),
     nullif(btrim(coalesce(p_moneda_capturada, '''')), ''''))
  returning id into v_id;');
  end if;

  if v_def = v_antes then
    raise notice 'private.registrar_movimiento ya guarda el costo capturado.';
  else
    -- La firma vieja se va ANTES de crear la nueva, en la misma migracion.
    drop function if exists private.registrar_movimiento(
      text, integer, bigint, bigint, numeric, numeric, text, bigint, bigint, bigint,
      date, bigint, text, text, numeric, numeric, text, numeric);
    execute v_def;
    raise notice 'private.registrar_movimiento guarda el costo tal como se tecleo.';
  end if;
end $ayudante$;

/*
  COMPROBADO el 8 de septiembre por las puertas reales, en transaccion deshecha:

    entrada ........ ok        traslado ....... ok
    salida ......... ok        baja ........... ok
    ajuste ......... ok        combustible .... llega a su propia reja
                                                («hace falta el horometro»), o sea
                                                que ejecuta

    firmas de private.registrar_movimiento .... 1
    columnas capturadas ....................... cantidad_capturada,
                                                unidad_capturada,
                                                suelto_capturado,
                                                costo_capturado,
                                                costo_unidad_capturada,
                                                moneda_capturada

  Al terminar: 19 movimientos, 868.927.307,04. Nada de produccion tocado.

  LO QUE FALTA, y va nombrado para que no se pierda: las columnas existen y el
  ayudante las acepta, pero **todavia no las llena nadie**. Falta que
  `registrar_entradas` lea del renglon el precio tal como se tecleo y a que
  presentacion se refiere —hoy solo tiene un booleano `costo_por_presentacion`
  que significa «la misma que la cantidad», y el caso de Jesmary es justo el
  contrario— y que la pantalla lo mande. Sin eso, esto es una caja preparada y
  vacia.
*/
