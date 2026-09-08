/*
  CORREGIR EL COSTO TIENE POR FIN UNA PUERTA, Y NO SE DESHACE A MEDIAS.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 7 de septiembre de 2026, por MCP, y probada en transacción
  deshecha con el caso real y el precio real de la factura.
  ————————————————————————————————————————————————————————————————————————

  DE DÓNDE VIENE

  `corregir_costo` e `impacto_de_corregir_costo` se aplicaron esta mañana, y su
  migración lo dijo entera:

      «PENDIENTE: la pantalla. Hoy esto solo existe en la base. Sin eso la
       herramienta no la usa nadie.»

  Era la única salida real de los cinco aceites cargados a un millón largo y de
  los 5.734 L de gasoil del tanque sin costo, y no la podía usar nadie. Un día
  entero arreglando funciones sin puerta y esta seguía siendo una.

  LA PANTALLA VA EN `Existencias.tsx`, Y EL BOTÓN VA APARTE

  Los cuatro botones de la fila —Sacar, Contar, Al taller, Dar de baja— viven
  dentro de `puede('ALMACEN')`. Metido ahí, «Corregir el costo» lo verían justo
  quienes NO pueden usarlo —la base le niega `INVENTARIO.AJUSTAR_COSTO` a
  ALMACEN a propósito— y no lo vería GERENTE_GENERAL, que no tiene rol ALMACEN.
  Así que lleva su propia reja, con `useMisAcciones`.

  Y solo con almacén elegido: el costo promedio se lleva por pareja (almacén,
  artículo), así que desde el total no significa nada.

  ═══════════════════════════════════════════════════════════════════════════
  Y UN BOTÓN QUE HABRÍA EMPEORADO LAS COSAS EN SILENCIO
  ═══════════════════════════════════════════════════════════════════════════

  Salió al revisar qué pasaría en cuanto existiera el primer `AJUSTE_COSTO`, y
  es el tipo de defecto que solo aparece después de usar la herramienta nueva.

  `corregir_costo` escribe un PAR de movimientos —sale todo al costo malo, entra
  todo al bueno— enlazados por `movimiento_origen`. Pero `reversar_movimiento`
  solo sabe emparejar `TRANSFERENCIA_SALIDA` con `TRANSFERENCIA_ENTRADA`.

  Es decir: la pantalla de Movimientos ofrecía «Deshacer» en cada pata por
  separado. Reversar solo la entrada deja la existencia intacta y **el promedio
  peor que antes de corregir**.

  SE PODRÍA HABER EMPAREJADO, Y NO SE HACE

  Emparejar como el traslado era la solución evidente y es peor: dejaría cuatro
  renglones —dos de corrección y dos de reverso, todos con la misma cantidad y
  distinto costo— para acabar exactamente donde ya se estaba.

  Volver a corregir hace lo mismo con la mitad de ruido y se lee solo: «de A a B,
  y luego de B a C». Que es como se leen los libros.

  Y LA «NOTA» TAMPOCO

  La pata negativa de una corrección de costo no es una salida: no se llevó nadie
  nada, el material sigue en el estante. El botón «Nota» le armaba el papel de
  entrega de un despacho que no ocurrió. Es el mismo criterio que ya estaba
  escrito ahí para el REVERSO —«ofrecerla ahí sería un botón que miente»—, solo
  que el tipo nuevo no estaba en la lista.
*/

do $guarda$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='reversar_movimiento') <> 1 then
    raise exception 'reversar_movimiento no es unica.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='corregir_costo') then
    raise exception 'Falta public.corregir_costo.';
  end if;
end $guarda$;

/*
  El cuerpo de `public.reversar_movimiento(bigint, text)` con la reja puesta es
  el que devuelve `pg_get_functiondef` tras esta migracion. Se parcheo el cuerpo
  vivo —regla 7— y el bloque es idempotente: si ya menciona AJUSTE_COSTO, no
  hace nada.

      select pg_get_functiondef('public.reversar_movimiento(bigint,text)'::regprocedure);

  Lo que se le anadio, justo despues de la reja del REVERSO:

      if v_mov.tipo = 'AJUSTE_COSTO' then
        raise exception 'Una corrección de costo no se deshace: se vuelve a corregir.'
          using errcode = '22023',
                hint = 'Entra en Existencias, busca la fila y usa «Corregir el
                        costo» con el valor bueno. Quedan los dos pasos
                        escritos, que es lo que hace falta para entender qué
                        pasó.';
      end if;
*/

/*
  COMPROBADO en transaccion deshecha, con el caso real y el precio real de la
  orden OC-2026-0003, que es donde esta la factura NASELF 000617:

    el parte ............ existencia 416 L · costo actual 1.209.012,48 ·
                          valor actual 502.949.191,68 · corregido 6,211274 ·
                          valor corregido 2.583,89 ·
                          ajuste -502.946.607,79 · no_se_recupera 0
    corregido ........... existencia 416 L SIN CAMBIO · promedio 6,211274
    deshacer una pata ... rebota: «Una corrección de costo no se deshace: se
                          vuelve a corregir.»

  Al terminar: 19 movimientos, MOV-2026-0019, cero ajustes de costo, valor
  868.927.307,04, 15 articulos. Nada de produccion tocado.

  LO QUE ESTO NO HACE, y conviene tenerlo escrito:

  Los cinco aceites siguen cargados al costo malo. La herramienta ya existe y ya
  tiene puerta, pero apretarla es mover medio millon de dolares de valoracion en
  produccion, y eso se decide, no se hace de paso.
*/
