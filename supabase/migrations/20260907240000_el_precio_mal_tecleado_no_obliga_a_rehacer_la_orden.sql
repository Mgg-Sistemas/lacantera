/*
  UN PRECIO MAL TECLEADO NO OBLIGA A REHACER LA ORDEN.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 7 de septiembre de 2026, por MCP, y probada en transacción
  deshecha sobre la orden real OC-2026-0003.
  ————————————————————————————————————————————————————————————————————————

  LA PREGUNTA

  Christopher, el 7 de septiembre: «¿si el usuario se equivoca desde la orden de
  compra y el precio es errado, entonces se debe reversar todo desde cero y se
  debe volver a iniciar la orden desde cero?».

  LA RESPUESTA, HASTA HOY: SÍ

  Se comprobó contra el catálogo. Para una orden que salió de un pedido con
  cotizaciones no había ninguna puerta:

    editar_compra_directa .. solo compras directas, y ella misma remite —«esta
                             orden salió de un pedido con cotizaciones, se
                             corrige por su camino, no por aquí»— a un camino
                             que **no existía**.
    cancelar_orden ......... rehacer el pedido, la cotización y la aprobación
                             enteros por un dígito.

  Y el aviso que este mismo carril puso esta mañana en la recepción decía
  «corrígelo en la orden antes de recibir», mandando a esa puerta cerrada.

  POR QUÉ TAMBIÉN SE TOCA LA COTIZACIÓN

  El precio de una orden no se teclea en la orden: `aprobar_compra` lo copia de
  la cotización. El error de tecleo está ahí. Corregir solo la orden dejaría a
  las dos diciendo cosas distintas del mismo trato, y la cotización es el papel
  que mandó el proveedor.

  Se corrigen las dos y se recalcula con `private.recalcular_cotizacion`, que ya
  existía —regla 2 de la casa: mirar en `private` antes de escribir un ayudante—
  y lleva la fórmula buena, esa donde el descuento y el flete siguen a la parte
  gravada en vez de cargarse enteros contra la base.

  HASTA DÓNDE, Y POR QUÉ AHÍ

  Las tres puertas son las mismas que ya cierra `editar_compra_directa`, porque
  lo que las cierra es lo mismo:

    lo recibido ..... el precio ya entró al libro de inventario, que es
                      inmutable. Eso se arregla con `corregir_costo`.
    el pago ......... ya se comprometió dinero contra ese número.
    la factura ...... el papel del proveedor dice lo que dice.

  Pasada cualquiera de las tres, la respuesta a la pregunta vuelve a ser que sí:
  hay que anular. Antes de las tres, no hace falta.

  EL PORQUÉ, Y DÓNDE VIVE

  Christopher, esta misma mañana: «si se va a hacer un ajuste de valoración, se
  debe indicar el porqué; el sistema siempre debe de reflejar en lo posible la
  razón, para que todo sea transparente».

  El primer intento llamaba a `private.auditar_evento`, que **no existe** — me lo
  inventé, que es justo lo que la regla de la casa prohíbe. Y escribir en
  `auditoria` a mano tampoco cabía: `auditoria.operacion` solo acepta INSERT,
  UPDATE, DELETE, ACCESO y CLAVE, así que un evento propio no entra, y forzarlo
  sería pelearse con una reja bien puesta.

  Así que el motivo se guarda donde de verdad pertenece: en el renglón que se
  corrigió. `private.auditar` ya busca «motivo» entre los nombres de columna de
  la fila y lo sube a `auditoria.motivo`. Cero cambios en el disparador, y el
  porqué queda a la vista de quien mire la orden.
*/

do $guarda$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='recalcular_cotizacion') then
    raise exception 'Falta private.recalcular_cotizacion, que es quien rehace los totales.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='numero_es') then
    raise exception 'Falta private.numero_es, que usan los mensajes.';
  end if;
end $guarda$;

alter table public.orden_renglones add column if not exists motivo text;

comment on column public.orden_renglones.motivo is
  'Por que este renglon esta como esta. Hoy lo escribe `corregir_precio_de_orden` cuando se arregla un precio mal tecleado; el disparador de auditoria lo recoge de aqui y lo sube a `auditoria.motivo`.';

insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente, activa)
values ('COMPRAS.CORREGIR_PRECIO_ORDEN', 'COMPRAS', 'Corregir un precio mal tecleado',
        'Corrige el precio de un renglón de una orden que todavía no recibió nada ni tiene pagos ni factura. Deja el porqué escrito.',
        86, 'TOTAL', true)
on conflict (codigo) do update set nombre = excluded.nombre, dice = excluded.dice,
                                   nivel_equivalente = excluded.nivel_equivalente;

/*
  El cuerpo de `public.corregir_precio_de_orden(bigint, bigint, numeric, text)`
  es el que devuelve `pg_get_functiondef` tras esta migracion. Se aplico por MCP
  y lleva sus comentarios dentro.

      select pg_get_functiondef('public.corregir_precio_de_orden(bigint,bigint,numeric,text)'::regprocedure);

  Devuelve el antes y el despues —precio y total— para que la pantalla pueda
  decir lo que cambio en vez de solo recargar.
*/

/*
  COMPROBADO en transaccion deshecha, sobre OC-2026-0003 y su cotizacion:

    motivo de cinco letras ... rebota
    6,211274 -> 6,50 ......... orden  10.603,17 -> 10.742,49
                               cotiz. 10.603,17 -> 10.742,49   (las dos iguales)
    la auditoria ............. orden_renglones · UPDATE · «Se transcribio mal el
                               precio de la cotizacion NASELF 000617»
    el mismo precio otra vez . rebota: «ya está a 6,5000»
    un renglon ya recibido ... rebota: «ya entraron 10,00 al almacén a 5,5843
                               cada uno, y el libro de inventario no se edita»,
                               con hint a «Corregir el costo»

  Al terminar: OC-2026-0003 en 10.603,17, el SAE 50 en 6,211274, cero renglones
  con motivo, 19 movimientos, valor 868.927.307,04. Nada de produccion tocado.
*/
