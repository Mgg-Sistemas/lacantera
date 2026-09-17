/*
  COMPRAS VE LA SALIDA DE SU PAGO CON MATERIAL

  Un pago con material queda hecho en Compras, pero el material sale por
  Salidas: almacén aprueba y entrega la orden de salida. Quien pagó tiene que
  poder ver en qué paso va —pedida, aprobada, entregada con tal nota, o
  rechazada y por qué— sin tener permiso de Salidas.

  Las políticas de SELECT se suman con OR (regla 6): esta abre, a quien ve
  Compras, solo las órdenes de salida que pagan una compra. Las demás siguen
  siendo de quien tiene Salidas.
*/

create policy solicitudes_salida_de_un_pago on public.solicitudes_salida
  for select to authenticated
  using (instruccion_pago_id is not null and private.tiene_permiso('COMPRAS', 'LECTURA'));
