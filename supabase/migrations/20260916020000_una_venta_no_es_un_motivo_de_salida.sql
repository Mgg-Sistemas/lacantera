/*
  UNA VENTA NO ES UN MOTIVO DE SALIDA

  Christopher, 16/09/2026, con la lista de razones delante:

    «No podemos dar salida por motivo de venta. La salida o descuento del
    inventario por VENTA debe ser resultado de que se haya usado el módulo de
    ventas como tal; así como en la opción de dar entrada no aparece el motivo
    "Compra" por lógica: se da ingreso a través de una orden de compra, que
    antes era una solicitud de pedido».

  Es la misma puerta equivocada que dejó cuatro ventas anotadas como baja. Una
  venta sabe a quién, por cuánto, con qué correlativo y contra qué centro de
  costo, y sabe además que no todo el material se vende. Nada de eso cabe en una
  salida de almacén: el libro solo diría que salió material al costo promedio, y
  la venta no existiría en ninguna parte.

  Por eso `registrar_salidas` nunca ofreció el despacho a mano —lo escribe la
  venta cuando sale el camión, con su nota de entrega detrás— y por eso esta
  razón sobra.

  La creó alguien desde la propia pantalla el 15/09/2026 a las 17:29 y no llegó
  a usarse: ninguna salida la nombra. Se apaga, que es como esta base retira una
  razón; no se borra, por si mañana hay que explicar de dónde salió.
*/
update public.clases_de_salida set activa = false where codigo = 'VENTA' and activa;

do $ver$
begin
  if exists (select 1 from public.clases_de_salida c where c.codigo = 'VENTA' and c.activa) then
    raise exception 'la venta sigue ofreciéndose como motivo de salida';
  end if;
end
$ver$;
