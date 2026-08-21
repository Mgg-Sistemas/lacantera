-- ---------------------------------------------------------------------------
-- Se vacía lo que se probó, se queda lo que se entrega
--
-- Christopher pide el sistema limpio para entregarlo. Lo que sale es el tráfico
-- que se generó ensayando —compras a FAMILIA PRUEBA S.A, una venta, un despacho,
-- once movimientos de inventario, nueve de tesorería— y lo que se queda es lo
-- que el cliente necesita encontrar el primer día.
--
-- POR QUÉ SE BORRA POR TABLA Y NO POR FECHA
--
-- La orden original decía «todo lo de admin_ y SISTEMA desde el lunes 17». No
-- sirve: **todas** las tablas operativas se estrenaron después del 17, así que
-- un filtro por `creado_en` se llevaría también el catálogo y el organigrama.
-- Y `admin_` es la cuenta compartida bajo la que trabaja todo el mundo, así que
-- firma tanto lo inventado como lo real. La fecha y el autor no distinguen
-- nada aquí; la tabla sí.
--
-- LO QUE NO SE TOCA, Y POR QUÉ
--
--   nómina        Datos reales de 22 trabajadores. NOM-2026-0002 se calculó con
--                 novedades cargadas a mano; rehacerla no es un clic.
--   organigrama   Las 21 filas son el dibujo que mandó la líder de sistemas.
--                 Nacieron hoy, así que cualquier filtro por fecha las atrapa.
--   almacenes,    Estructura. Un sistema sin almacenes ni cuentas no se puede
--   cuentas,      usar el primer día.
--   monedas,tasas
--
-- LA EXCEPCIÓN DENTRO DE NÓMINA
--
-- La ficha 0023, «TRABAJADOR PRUEBA TEST» del departamento «SISTEMAS TEST», se
-- creó ensayando. Tiene recibo en NOM-2026-0002 con nueve líneas. Se va con su
-- recibo: dejarla sería entregar un trabajador inventado dentro de una nómina
-- real.
--
-- POR QUÉ HAY QUE DESACTIVAR DISPARADORES
--
-- Tres tablas de las que se vacían son inmutables a propósito:
-- `inventario_movimientos`, `tesoreria_movimientos` y `auditoria`. Sus
-- disparadores levantan excepción ante cualquier DELETE — que es exactamente lo
-- que se quiere en operación y exactamente lo que estorba aquí.
--
-- Se desactivan los tres y se vuelven a activar al final, todo dentro de la
-- misma transacción: si esto reventara a mitad, el `rollback` los devuelve a su
-- sitio. Un `disable trigger` que se quede colgado deja el libro editable y
-- nadie se entera. (`tasas_cambio` también es inmutable, pero no se toca.)
--
-- POR QUÉ BORRAR Y NO REVERSAR
--
-- Reversar es lo correcto cuando hay historia contable que preservar. Aquí
-- duplicaría las filas —once movimientos se convertirían en veintidós que se
-- anulan entre sí— y el cliente abriría Inventario para encontrar un libro
-- lleno de nada. Después de esto, el saldo inicial se carga con
-- `registrar_entrada`, que existe justo para eso.
-- ---------------------------------------------------------------------------

alter table public.inventario_movimientos disable trigger trg_movimientos_inmutables;
alter table public.tesoreria_movimientos  disable trigger tesoreria_movimientos_inmutable;
alter table public.auditoria              disable trigger auditoria_inmutable;

-- 1. Ventas, despachos y el cliente de ensayo
delete from public.cobros_venta;
delete from public.factura_venta_renglones;
delete from public.facturas_venta;
delete from public.nota_credito_renglones;
delete from public.notas_credito;
delete from public.nota_entrega_renglones;
delete from public.notas_entrega;
delete from public.cotizacion_venta_renglones;
delete from public.cotizaciones_venta;
delete from public.guias_movilizacion;
delete from public.romana_tickets;
delete from public.precios_venta;
delete from public.clientes;

-- 2. Explotación
delete from public.produccion_renglones;
delete from public.produccion_turnos;
delete from public.voladuras;
delete from public.frentes_explotacion;

-- 3. Compras, de dentro hacia fuera
delete from public.pagos_compra;
delete from public.facturas_compra;
delete from public.instrucciones_pago;
delete from public.orden_renglones;
delete from public.ordenes_compra;
delete from public.cotizacion_renglones;
delete from public.cotizaciones;
delete from public.solicitud_renglones;
delete from public.solicitudes_pedido;
delete from public.compras_bitacora;
delete from public.proveedores;

-- 4. El trabajador de prueba y su recibo. Primero las líneas, que cuelgan.
delete from public.nomina_recibo_lineas
 where recibo_id in (select r.id from public.nomina_recibos r
                     join public.empleados e on e.id = r.empleado_id
                     where e.ficha = '0023');
delete from public.nomina_recibos
 where empleado_id in (select id from public.empleados where ficha = '0023');
delete from public.nomina_novedades
 where empleado_id in (select id from public.empleados where ficha = '0023');
delete from public.nomina_novedades_montos
 where empleado_id in (select id from public.empleados where ficha = '0023');
delete from public.empleados where ficha = '0023';

-- 5. Maquinaria, flota y asignaciones. Los vehículos son TMP-001 y TMP-002:
--    el prefijo ya decía que eran provisionales.
delete from public.mantenimiento_repuestos;
delete from public.mantenimientos;
delete from public.horometro_lecturas;
delete from public.despachos_combustible;
delete from public.asignaciones_herramienta;
delete from public.incidencia_participantes;
delete from public.incidencias_personal;
delete from public.vehiculo_choferes;
delete from public.vehiculos;
delete from public.maquinaria;

-- 6. Los libros inmutables
delete from public.inventario_movimientos;
delete from public.tesoreria_movimientos;

-- 7. El catálogo sembrado. Sale por decisión de Christopher: el real entra
--    después por planilla, con `cargar_articulos_por_lote`.
delete from public.articulos;

-- 8. Avisos y numeración. Los correlativos vuelven a cero para que el primer
--    documento del cliente sea el 0001 y no el 0010.
delete from public.notificaciones_leidas;
delete from public.notificaciones;
delete from public.correlativos;

-- 9. La auditoría, al final: hasta aquí ha estado registrando este mismo
--    borrado, y esas filas también sobran.
delete from public.auditoria;

alter table public.inventario_movimientos enable trigger trg_movimientos_inmutables;
alter table public.tesoreria_movimientos  enable trigger tesoreria_movimientos_inmutable;
alter table public.auditoria              enable trigger auditoria_inmutable;
