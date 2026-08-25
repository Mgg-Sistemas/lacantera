-- ---------------------------------------------------------------------------
-- El sistema queda limpio para el uso real
--
-- Instrucción de la líder: el sistema pasa a uso REAL, y los primeros en
-- entrar son los de Compras. Christopher: «los de compras cargarán la data real
-- que tienen, no les sirve dejarle data ficticia».
--
-- Así que sale TODO el tráfico de ensayo. Lo que se queda es lo que hace falta
-- para poder trabajar el primer día, y nada más.
--
-- =========================================================================
-- QUÉ SE QUEDA, Y POR QUÉ
-- =========================================================================
--
--   nómina         22 trabajadores reales, 20 recibos y los dos períodos.
--                  NOM-2026-0002 se calculó con novedades cargadas a mano.
--   almacenes      Los once, con sus dos talleres. Es estructura: un sistema
--                  sin sitios donde poner las cosas no se puede usar.
--   cuentas        Las siete cuentas de banco. Estructura igual.
--   usuarios       Las doce cuentas con sus roles.
--   catálogos      Clases de salida, motivos del vale, categorías de gasto,
--                  unidades, monedas y tasas. Son las listas que el sistema
--                  necesita para preguntar bien.
--   empresa        RIF, razón social, tributos, documentos legales.
--
-- =========================================================================
-- QUÉ SE VA
-- =========================================================================
--
--   Compras        9 solicitudes, 9 cotizaciones, 9 órdenes, sus renglones,
--                  las instrucciones de pago y los 2 proveedores de ensayo.
--   Inventario     36 movimientos, los 13 artículos sembrados y sus 3 precios.
--                  El catálogo real entra por planilla — que es justo lo que se
--                  revisó y corrigió esta semana.
--   Maquinaria     La excavadora de prueba, sus 2 vales de combustible y su
--                  orden de taller. Decisión de Christopher: todo fuera, la
--                  cargan ellos como el resto.
--   Tesorería      Los 15 movimientos. Las cuentas se quedan.
--   Avisos         79 notificaciones y sus marcas de leído.
--   Correlativos   A cero, para que el primer documento real sea el 0001 y no
--                  el 0010.
--   Auditoría      654 filas, todas de este ensayo.
--
-- =========================================================================
-- LA NÓMINA NO SE TOCA, Y AUN ASÍ HAY QUE DECIR UNA COSA
-- =========================================================================
--
-- Entre los 15 movimientos de tesorería está el pago de NOM-2026-0002 —USD
-- 3.691,91 por 19 trabajadores—. Borrarlo deja ese período diciendo PAGADA sin
-- un movimiento detrás.
--
-- Se borra igual, por dos razones. La primera: NOM-2026-0001 ya está así —es de
-- julio y la tesorería no empieza hasta el 21 de agosto—, o sea que la
-- incoherencia no se crea, se iguala. La segunda: el libro de tesorería entero
-- es de mentira. Se abrió con 500 dólares y pagó una orden de 232.000; no es un
-- saldo que se pueda conservar.
--
-- El recibo de cada trabajador, su cálculo y sus novedades siguen intactos, que
-- es lo que se pidió proteger.
--
-- =========================================================================
-- EL ORDEN IMPORTA, Y EL ENSAYO LO CORRIGIÓ
-- =========================================================================
--
-- El primer intento reventó con 23503: `tesoreria_movimientos.instruccion_id`
-- apunta a `instrucciones_pago`, y yo había puesto las instrucciones antes. El
-- mapa de dependencias que había mirado solo enseñaba lo que colgaba HACIA
-- FUERA de las tablas a vaciar, no entre ellas.
--
-- Y hay un ciclo: `solicitudes_pedido.cotizacion_elegida_id` apunta a
-- `cotizaciones`, y `cotizaciones.solicitud_id` apunta de vuelta. No hay orden
-- que valga; se suelta el lazo con un update a nulo antes de borrar.
--
-- =========================================================================
-- POR QUÉ HAY QUE DESACTIVAR TRES DISPARADORES
-- =========================================================================
--
-- `inventario_movimientos`, `tesoreria_movimientos` y `auditoria` son
-- inmutables a propósito: sus disparadores levantan excepción ante cualquier
-- DELETE. Es lo que se quiere en operación y lo que estorba aquí.
--
-- Se desactivan y se vuelven a activar dentro de la MISMA transacción: si esto
-- reventara a mitad, el rollback los devuelve a su sitio. Un `disable trigger`
-- que se quede colgado deja el libro editable y nadie se entera.
--
-- ENSAYADO ENTERO con rollback antes de aplicarlo, y comprobado después:
--
--   22 empleados, 20 recibos, 2 períodos ....... en pie
--   11 almacenes, 2 de ellos talleres .......... en pie
--   7 cuentas de banco, 12 usuarios ............ en pie
--   8 clases de salida, 6 motivos del vale ..... en pie
--   artículos, proveedores, órdenes, solicitudes,
--   movimientos, maquinaria, notificaciones,
--   correlativos y auditoría ................... en cero
--   los tres disparadores ...................... encendidos otra vez
-- ---------------------------------------------------------------------------

alter table public.inventario_movimientos disable trigger trg_movimientos_inmutables;
alter table public.tesoreria_movimientos  disable trigger tesoreria_movimientos_inmutable;
alter table public.auditoria              disable trigger auditoria_inmutable;

-- Compras y tesorería, de dentro hacia fuera
delete from public.pagos_compra;
delete from public.tesoreria_movimientos;
delete from public.instrucciones_pago;
delete from public.facturas_compra;
delete from public.compras_papeles;

-- Lo que cuelga del libro de inventario
delete from public.mantenimiento_repuestos;
delete from public.inventario_bajas;
delete from public.asignaciones_herramienta;
delete from public.despachos_combustible;
delete from public.inventario_movimientos;

-- El resto de compras
delete from public.orden_renglones;
delete from public.ordenes_compra;
delete from public.cotizacion_renglones;
-- El lazo: la solicitud apunta a la cotización elegida y la cotización a la
-- solicitud. Se suelta antes de borrar.
update public.solicitudes_pedido set cotizacion_elegida_id = null;
delete from public.cotizaciones;
delete from public.solicitud_renglones;
delete from public.solicitudes_pedido;
delete from public.compras_bitacora;
delete from public.proveedores;

-- Maquinaria y flota
delete from public.mantenimientos;
delete from public.horometro_lecturas;
delete from public.vehiculo_choferes;
delete from public.vehiculos;
delete from public.maquinaria;

-- El catálogo sembrado. El real entra por planilla.
delete from public.precios_venta;
delete from public.articulos;

-- Avisos y numeración
delete from public.notificaciones_leidas;
delete from public.notificaciones;
delete from public.correlativos;

-- La auditoría al final: hasta aquí ha estado registrando este mismo borrado.
delete from public.auditoria;

alter table public.inventario_movimientos enable trigger trg_movimientos_inmutables;
alter table public.tesoreria_movimientos  enable trigger tesoreria_movimientos_inmutable;
alter table public.auditoria              enable trigger auditoria_inmutable;
