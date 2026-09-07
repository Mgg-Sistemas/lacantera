/*
  CORREGIR EL COSTO SIN EDITAR NADA.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 7 de septiembre de 2026, por MCP, y probada en transacción
  deshecha con el caso real: el aceite de motor de 1.209.012,48 a 3,60.
  ————————————————————————————————————————————————————————————————————————

  LA PREGUNTA QUE LA ORIGINA

  Christopher: «¿cómo o dónde permitir al usuario ajustar el precio de un item?
  (así, como hoy, dando un caso de error humano, por mala carga)».

  La respuesta corta es que **no hay un precio que editar**. Un artículo no
  tiene precio: tiene un costo promedio que emerge de sus movimientos. Un campo
  editable en la ficha haría una de dos cosas, las dos malas: o no serviría de
  nada porque el promedio se recalcula desde el libro, o reescribiría el pasado
  en silencio.

  Y el libro es inmutable a propósito: `trg_movimientos_inmutables` rechaza
  UPDATE y DELETE. Una corrección se escribe como un hecho nuevo, con su fecha,
  su motivo y su autor. Eso es lo que permite reconstruir qué pasó.

  POR QUÉ UN PAR DE MOVIMIENTOS Y NO UNO SOLO

  La idea evidente —un movimiento de cantidad cero que solo cambie el valor— NO
  SE PUEDE, y esto salió mirando el catálogo antes de escribir una línea:

      valor_usd  es GENERATED ALWAYS AS (round(cantidad * costo_usd, 6))

  Con cantidad cero el valor es cero, siempre. Así que se hace como lo hace un
  libro contable de verdad: sale TODO lo que hay al costo equivocado y vuelve a
  entrar TODO al correcto.

      416 L salen a 1.209.012,48  ->  -502.949.191,68
      416 L entran a 3,60         ->       +1.497,60
      ------------------------------------------------
      existencia 416 L, sin cambio · promedio 3,60

  Los dos renglones quedan a la vista en el historial, y eso es deseable: una
  corrección de esta magnitud tiene que verse.

  EL PARTE ANTES DE ACTUAR, QUE ES LO QUE PIDIÓ

  «los sistemas deben ser similar a un runbook, o pasos secuenciales... el
  sistema haga más». Por eso `impacto_de_corregir_costo` no devuelve un número
  suelto sino el parte entero, incluida **la parte incómoda**: cuánto salió ya
  del almacén cargado al costo falso y no se recupera, porque eso ya se le
  cargó a una máquina o a un centro de costo. Esconderlo sería peor que no
  tener la herramienta.

  Para los cinco aceites de hoy ese número es cero: no se ha consumido nada de
  ellos. Se comprobó.

  QUIÉN PUEDE

  `INVENTARIO.AJUSTAR_COSTO`, con `nivel_equivalente = TOTAL`. El rol ALMACEN
  NO lo tiene, y es deliberado: «almacén no tiene interés sobre el precio o
  valor de las cosas, pero sí en que sus ítems estén rigurosamente contados»
  —Christopher, 7/09/2026—. Esto no cambia ni una unidad contada; cambia dinero.

  Y avisa a ADMIN y a GERENTE_GENERAL, porque el valor del inventario sale en
  informes de gerencia y no puede cambiar sin que nadie se entere.

  LO QUE NO ARREGLA

  Corregir hoy el costo no reprecia lo que ya salió ayer. Esas salidas quedan
  cargadas al costo falso, y el centro de costos de esa máquina también. No es
  un defecto: es cómo funciona un libro. Por eso las tres defensas de la entrada
  —la cuenta a la vista, el aviso de las diez veces y la confirmación de la
  primera vez— valen más que esta herramienta: lo que no entra mal no hay que
  corregirlo.
*/

do $guarda$
begin
  if (select generation_expression from information_schema.columns
       where table_schema='public' and table_name='inventario_movimientos'
         and column_name='valor_usd') is null then
    raise exception 'valor_usd ya no es generada: repasar por que esta migracion usa un par de movimientos en vez de uno solo.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='exigir_accion') then
    raise exception 'Falta private.exigir_accion.';
  end if;
end $guarda$;

-- ---------------------------------------------------------------------------
-- El tipo nuevo
-- ---------------------------------------------------------------------------
alter table public.inventario_movimientos drop constraint if exists inventario_movimientos_tipo_check;
alter table public.inventario_movimientos add constraint inventario_movimientos_tipo_check
  check (tipo = any (array['ENTRADA_COMPRA','ENTRADA_PRODUCCION','ENTRADA_DEVOLUCION','ENTRADA_DIRECTA',
                           'SALIDA_CONSUMO','SALIDA_DESPACHO','SALIDA_MERMA','SALIDA_BAJA',
                           'AJUSTE_POSITIVO','AJUSTE_NEGATIVO','AJUSTE_COSTO',
                           'TRANSFERENCIA_SALIDA','TRANSFERENCIA_ENTRADA','REVERSO']));

-- ---------------------------------------------------------------------------
-- La acción, con nivel TOTAL: almacén no la tiene, y es deliberado
-- ---------------------------------------------------------------------------
insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente, activa)
values ('INVENTARIO.AJUSTAR_COSTO', 'INVENTARIO', 'Corregir el costo de lo que hay',
        'Reexpresa el costo promedio de un artículo en un almacén cuando se cargó mal. No cambia las cantidades.',
        85, 'TOTAL', true)
on conflict (codigo) do update set nombre = excluded.nombre, dice = excluded.dice,
                                   nivel_equivalente = excluded.nivel_equivalente;

/*
  Los cuerpos completos de `public.impacto_de_corregir_costo(bigint, bigint,
  numeric)` y `public.corregir_costo(bigint, bigint, numeric, text, date)` son
  los que devuelve `pg_get_functiondef` tras esta migración. Se aplicaron por
  MCP con el texto que quedó vivo y llevan sus comentarios dentro; no se repiten
  aquí para no tener dos copias que puedan discrepar.

      select pg_get_functiondef(p.oid)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('impacto_de_corregir_costo', 'corregir_costo');

  Lo que hace cada una:

    impacto_de_corregir_costo   Solo lee. Devuelve existencia, costo y valor
                                actuales, cómo quedarían, el ajuste en libros,
                                y cuánto ya salió cargado al costo falso.
                                Exige INVENTARIO:LECTURA.

    corregir_costo              Escribe el par. Exige
                                INVENTARIO.AJUSTAR_COSTO, un motivo de diez
                                caracteres, que quede existencia, y que el costo
                                pedido sea distinto del que hay. Avisa a ADMIN y
                                GERENTE_GENERAL.
*/

/*
  COMPROBADO en transaccion deshecha, con el caso real:

    el parte ................. existencia 416 L · actual 1.209.012,48 ·
                               valor 502.949.191,68 · corregido 1.497,60 ·
                               ajuste -502.947.694,08 · no_se_recupera 0
    motivo corto ............. rebota
    corregido ................ existencia 416 L SIN CAMBIO · promedio 3,60
    los dos renglones ........ MOV-0020 salida 416 a 1.209.012,48
                               MOV-0021 entrada 416 a 3,60
    repetir lo mismo ......... rebota: «ya viene costando 3,6000»
    con el rol ALMACEN ....... rebota: «No tienes permiso para corregir el
                               costo de lo que hay en Inventario»

  Al terminar: 19 movimientos, MOV-2026-0019, valor 868.927.307,04, cero
  ajustes de costo. Nada de produccion tocado.

  PENDIENTE: la pantalla. Hoy esto solo existe en la base. El recorrido que
  falta es el de un runbook: desde la fila de Existencias, «corregir el costo»
  ensena el parte, pide el motivo, y confirma. Sin eso la herramienta no la usa
  nadie.
*/
