/*
  FUERA LA COMPRA DE PRUEBA, EL PROVEEDOR Y TODO LO QUE ARRASTRA

  SOL-2026-0001 → OC-2026-0001 → una instrucción de pago en la cola de
  tesorería, y el proveedor GOLDEN TOUCH 1127 que se creó para probarla. Nada de
  eso es real. Se comprobó antes de borrar que no hay movimiento de tesorería,
  ni movimiento de inventario, ni factura, ni ticket de romana colgando: la
  cadena sale entera sin dejar un asiento sin su documento.

  Y SE VAN TAMBIÉN LOS AVISOS Y LA BITÁCORA

  Los seis avisos apuntan a `/app/compras/45`. Dejarlos es repetir el fallo de
  esta misma semana: un aviso que lleva a un pedido borrado abre una pantalla que
  pide una fila que ya no está y devuelve un 406 sin explicación.

  La bitácora arrastra además huérfanos del barrido anterior —ORDEN 26,
  SOLICITUD 44, COTIZACION 31 y tres PAGO— que se quedaron cuando se borró lo
  que contaban. Se limpia por lo que ya no existe, no por una lista escrita a
  mano: una lista a mano fue justo lo que dejó fuera dos contadores la otra vez.

  Y LOS CONTADORES VUELVEN A CERO

  Si OC y SOL se quedan en 1 con las filas borradas, la próxima compra real nace
  como OC-2026-0002 y el sistema parece haber perdido la primera. Ya pasó con
  NOM.
*/

delete from public.notificaciones where ruta like '/app/compras/45%';

-- La orden primero: apunta a la cotización y a la solicitud con NO ACTION, así
-- que borrarlas antes la dejaría bloqueando. Al irse arrastra sus renglones, su
-- instrucción de pago y sus papeles, que sí están en cascada.
delete from public.ordenes_compra where id = 27;

-- Y la solicitud arrastra sus renglones y sus cotizaciones.
delete from public.solicitudes_pedido where id = 45;

delete from public.proveedores where id = 19;

delete from public.compras_bitacora b
 where (b.documento_tipo = 'SOLICITUD'
        and not exists (select 1 from public.solicitudes_pedido s where s.id = b.documento_id))
    or (b.documento_tipo = 'ORDEN'
        and not exists (select 1 from public.ordenes_compra o where o.id = b.documento_id))
    or (b.documento_tipo = 'COTIZACION'
        and not exists (select 1 from public.cotizaciones c where c.id = b.documento_id))
    or (b.documento_tipo = 'PAGO'
        and not exists (select 1 from public.instrucciones_pago i where i.id = b.documento_id));

update public.correlativos set ultimo = 0 where prefijo in ('OC', 'SOL', 'COT');
