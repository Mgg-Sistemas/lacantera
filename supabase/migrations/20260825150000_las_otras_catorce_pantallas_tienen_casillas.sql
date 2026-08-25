-- ---------------------------------------------------------------------------
-- Las otras catorce pantallas tienen casillas
--
-- Configuración y Respaldo ya estaban. Faltaban catorce módulos, y mientras
-- faltaran, «detallado» solo servía para una pantalla: un rol nuevo se regía
-- por casillas en Configuración y por escalón en todo lo demás. Esto cierra el
-- catálogo.
--
-- =========================================================================
-- LA PREMISA CON LA QUE EMPECÉ ERA FALSA, Y HABRÍA COSTADO CARO
-- =========================================================================
--
-- Di por hecho que una función rejada con `exigir_rol('RRHH')` la podían llamar
-- el rol RRHH y nadie más, y que por tanto bastaba con sembrarle la casilla a
-- RRHH. No es así, y lo dice el cuerpo de `private.exigir_rol`: primero prueba
-- el rol literal y después recorre `private.equivalencia_rol`, que traduce seis
-- roles a un nivel de módulo:
--
--   RRHH        -> NOMINA:ESCRITURA        COMPRAS     -> COMPRAS:TOTAL
--   TESORERIA   -> TESORERIA:ESCRITURA     SOLICITANTE -> COMPRAS:ESCRITURA
--   ALMACEN     -> INVENTARIO:ESCRITURA    OPERACIONES -> EXPLOTACION:ESCRITURA
--
-- Cruzado con `rol_permisos`, hoy pasan por `exigir_rol('RRHH')` no uno sino
-- cuatro roles: ADMIN, GERENTE_GENERAL, TESORERIA y RRHH. Sembrando solo RRHH,
-- el gerente general y tesorería habrían perdido de golpe abrir el período,
-- cargar novedades, calcular y anular la nómina —lo que el gerente hace
-- justamente cuando RRHH no está—. Y lo mismo en almacén, en compras y en
-- tesorería: unas cuarenta casillas.
--
-- Es el error simétrico del que ya se cazó en `guardar_empresa`. Allí un
-- escalón de más le regalaba el RIF de la empresa a tres personas; aquí un
-- escalón de menos le quitaba el dinero al gerente general. La misma causa:
-- leer la reja en vez de medirla.
--
-- Así que ningún nivel de este archivo se escribió a ojo. Cada uno sale de esta
-- cuenta:
--
--   reja `exigir_permiso(M,N)` y el módulo de la casilla es M
--       -> nivel_equivalente = N. Nada que sembrar.
--
--   reja `exigir_rol(R...)` y la equivalencia de R cae en el módulo de la
--   casilla
--       -> nivel_equivalente = el nivel de la equivalencia, y además se siembra
--          el rol literal R, por si alguien lo tiene sin llegar a ese nivel.
--
--   reja `exigir_rol(R...)` sin equivalencia (ADMIN, GERENTE_GENERAL), o con la
--   equivalencia en OTRO módulo (pagar la nómina, que es reja de tesorería)
--       -> nivel_equivalente NULO y se siembran todos los roles que hoy pasan.
--          `puede_accion` compara el nivel contra `rp.modulo = a.modulo`, así
--          que un módulo no puede declarar el escalón de otro.
--
--   reja con `tiene_rol` suelto, sin `exigir_rol` (los papeles de compra)
--       -> ahí NO hay equivalencia. Se siembran los roles literales y ya.
--
-- COMPROBADO ejecutando la comparación al pie de este archivo: para cada
-- casilla, quién pasa hoy por la reja de sus funciones contra quién pasará por
-- `puede_accion`. Cero diferencias.
--
-- =========================================================================
-- LO QUE NO ENTRA AQUÍ, Y HAY QUE DECIDIR APARTE
-- =========================================================================
--
-- Catalogar es ponerle nombre a las puertas que ya existen. Al medirlas
-- aparecieron ocho mal puestas, y ninguna se arregla en este archivo porque
-- arreglarla cambia quién puede qué —y eso lo decide la líder, no una migración
-- de catálogo—. Están escritas en docs/salud-de-la-base.md.
--
-- Las dos que más urgen, para que no se pierdan de vista:
--
--   `cargar_articulos_por_lote` escribe `precios_venta` pidiendo VENTAS:
--   ESCRITURA, mientras `guardar_precio_venta` pide VENTAS:TOTAL. Hoy RRHH le
--   cambia el precio a todo el catálogo con un Excel sin tener TOTAL.
--
--   `guardar_cliente` escribe siempre `condicion_pago = coalesce(p,'CONTADO')`
--   y `limite_credito = coalesce(p, 0)`, pero solo pide TOTAL cuando ENTRA
--   crédito. Corregirle el teléfono a un cliente de crédito con el formulario
--   por defecto le quita la línea de crédito, y nadie lo decidió.
--
-- =========================================================================
-- SOBRE LOS TEXTOS
-- =========================================================================
--
-- El `dice` es lo único que lee quien arma un rol. Un `dice` que promete lo que
-- la función no hace es peor que no tenerlo: hace marcar mal. Los de aquí se
-- comprobaron uno a uno contra `pg_get_functiondef`, y varios cambiaron de
-- sentido al hacerlo. Tres ejemplos de lo que decía el primer borrador:
--
--   «los repuestos salen del almacén en ese momento»  <- no salen: van PREVISTO
--   «los gastos quedan sin clasificar y nadie avisa»  <- la función lo prohíbe
--   «desactivado deja de poder entrar»                <- entra; lo que pierde
--                                                        es todo permiso
--
-- Las casillas nombran la cosa, no solo el verbo: CONFIGURACION.VER_EMPRESA, no
-- CONFIGURACION.VER. PANEL.VER se queda como está porque el módulo es una sola
-- pantalla y no hay cosa que distinguir, igual que RESPALDO.DESCARGAR.
-- ---------------------------------------------------------------------------

insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente) values

-- =============================== PANEL ===============================
('PANEL.VER', 'PANEL', 'Ver el panel de inicio',
 'Es la primera pantalla al entrar y a la que vuelven todos los enlaces de «volver al panel». Lo que muestra ya viene recortado por los demás permisos: quien no tiene tesorería no ve lo que se debe, quien no tiene inventario no ve su valor. Sin esta casilla la persona entra al sistema y lo primero que lee es que el panel no está a su alcance.',
 10, 'LECTURA'),

-- ============================ EXPLOTACION ============================
('EXPLOTACION.VER_PRODUCCION', 'EXPLOTACION', 'Ver los frentes y la producción',
 'Qué frentes están abiertos, qué voladuras se hicieron y cuánto sacó cada turno. Es lo que se mira para saber si el patio se llenó o no ese día.',
 10, 'LECTURA'),

('EXPLOTACION.EDITAR_FRENTE', 'EXPLOTACION', 'Abrir y corregir un frente',
 'El frente dice de dónde sale el material y si se arranca con voladura o con martillo. Marcarlo de martillo impide registrarle voladuras. Suspenderlo o agotarlo corta los partes de turno de ese frente; agotado además cierra las voladuras.',
 20, 'ESCRITURA'),

('EXPLOTACION.REGISTRAR_VOLADURA', 'EXPLOTACION', 'Anotar la voladura del frente',
 'Queda el papel de la pega: barrenos, kilos de explosivo, detonadores y el permiso con que se hizo. No descuenta explosivo de ningún almacén. Una vez anotada no se corrige, se anula. Y de ella se cuelgan después los partes de turno que trabajaron ese material.',
 30, 'ESCRITURA'),

('EXPLOTACION.ANULAR_VOLADURA', 'EXPLOTACION', 'Anular una voladura',
 'La voladura queda marcada como anulada y sale de los papeles que se enseñan. Nada vuelve al almacén de explosivos: lo que se cargó ese día ya se gastó. Solo se deja si ningún parte de turno se colgó de ella; si los hay, primero se anulan esos. No se puede deshacer.',
 40, 'TOTAL'),

('EXPLOTACION.REGISTRAR_PARTE', 'EXPLOTACION', 'Anotar lo que produjo el turno',
 'El material del parte entra al patio como existencia: desde ese momento se puede vender, despachar y contar como inventario. Es la puerta por la que la cantera se llena, y no pide permiso de almacén para hacerlo.',
 50, 'ESCRITURA'),

('EXPLOTACION.ANULAR_PARTE', 'EXPLOTACION', 'Anular un parte de turno',
 'Le quita al patio el material que ese parte metió. Si ya se despachó, el sistema no lo deja: habría que corregirlo con un ajuste de inventario, que deja constancia de la diferencia.',
 60, 'TOTAL'),

-- ============================= MAQUINARIA ============================
('MAQUINARIA.VER_MAQUINAS', 'MAQUINARIA', 'Ver los equipos y su hoja de vida',
 'La flota completa con su estado y las horas del reloj, y todo lo que le ha pasado a cada máquina: combustible que se le echó, repuestos que se le pusieron y lo que costó cada reparación en dólares.',
 10, 'LECTURA'),

('MAQUINARIA.EDITAR_MAQUINA', 'MAQUINARIA', 'Dar de alta y corregir una máquina',
 'Crea la ficha del equipo, fija en cuántas horas avisa, alarma y se pasa del tope —de ahí sale el semáforo de mantenimiento— y dice qué combustible quema y cuánto le cabe. Subir el tope hace que pida taller más tarde; cambiarle el combustible cambia con qué se le puede surtir.',
 20, 'ESCRITURA'),

('MAQUINARIA.CAMBIAR_ESTADO', 'MAQUINARIA', 'Parar, reactivar o desincorporar una máquina',
 'Sacarla de servicio la quita de los equipos disponibles y le avisa a operaciones y a almacén. Con esta misma casilla se la puede desincorporar, que es darla de baja de la flota: ya no entra ni al taller. No sirve para meterla al taller ni para sacarla de él: eso se hace abriendo y cerrando su mantenimiento.',
 30, 'ESCRITURA'),

('MAQUINARIA.ANOTAR_HOROMETRO', 'MAQUINARIA', 'Anotar las horas de la jornada',
 'El reloj de cada máquina es lo que dispara el aviso de mantenimiento y lo que dice cuánto combustible y cuántos dólares se le van por hora de trabajo. Anotar una jornada ya anotada pisa la anterior, y una lectura mal puesta desordena las dos cosas.',
 40, 'ESCRITURA'),

('MAQUINARIA.EDITAR_FOTO', 'MAQUINARIA', 'Poner y quitar la foto de una máquina',
 'Es como se reconoce el equipo en la lista. No toca ningún dato ni ningún número; la foto vieja se borra al poner la nueva.',
 50, 'ESCRITURA'),

('MAQUINARIA.ABRIR_TALLER', 'MAQUINARIA', 'Meter una máquina o un material al taller',
 'La máquina queda parada desde ya y deja de estar disponible para producir. Los repuestos que se anoten son solo una previsión: no sale nada del almacén hasta que la orden se cierre. Con esta misma casilla se manda al taller un material a reparar, y eso sí saca existencia de un almacén de verdad — pero esa mitad pide además permiso de almacén, así que a quien no lo tenga le va a fallar.',
 60, 'ESCRITURA'),

('MAQUINARIA.CERRAR_TALLER', 'MAQUINARIA', 'Sacar la máquina del taller',
 'Descuenta del taller los repuestos que de verdad se usaron, con su costo, y se lo carga a la máquina — es el costo que después se ve en su hoja de vida. Aquí se decide con qué estado sale la máquina: es la única forma de sacarla del taller. Si fue un mantenimiento, su contador de horas vuelve a cero y el próximo servicio se corre. Si lo que estaba en el taller era material, lo que no vuelva al almacén queda anotado como merma.',
 70, 'ESCRITURA'),

('MAQUINARIA.ANULAR_TALLER', 'MAQUINARIA', 'Anular una orden de taller',
 'Solo mientras siga abierta. La máquina vuelve al estado que tenía antes de entrar. Si lo que se mandó al taller fue material, anular la orden NO lo devuelve: sigue cargado al taller y hay que moverlo a mano.',
 80, 'ESCRITURA'),

('MAQUINARIA.CONFIGURAR_TALLER', 'MAQUINARIA', 'Decir qué aguanta cada taller',
 'La lista de especialidades impide abrir en ese taller un trabajo que no sabe hacer. Ojo: un taller sin ninguna especialidad marcada acepta todo. El número de trabajos a la vez no bloquea nada, solo avisa en la lista de talleres cuándo el taller ya no tiene sitio.',
 90, 'ESCRITURA'),

-- ============================ COMBUSTIBLE ============================
('COMBUSTIBLE.VER_DESPACHOS', 'COMBUSTIBLE', 'Ver los vales de combustible',
 'Cuánto se surtió, de qué tanque salió y a qué máquina se le echó. El rendimiento por hora de cada equipo solo se ve si el rol también puede ver las máquinas; sin eso el reporte sale vacío y los vales salen sin decir a qué máquina fueron.',
 10, 'LECTURA'),

('COMBUSTIBLE.VER_PERSONAS_VALE', 'COMBUSTIBLE', 'Ver la lista de personal para llenar un vale',
 'Nombre, cédula y cargo de todo el personal activo, aunque el rol no pueda entrar a nómina. Es lo que se escoge en el renglón de quién recibió, y sin esto ese desplegable sale vacío.',
 20, 'LECTURA'),

('COMBUSTIBLE.DESPACHAR', 'COMBUSTIBLE', 'Surtir combustible y emitir el vale',
 'Descuenta los litros del tanque y los carga a la máquina o a la persona que recibe. Un vale mal hecho no se puede anular desde aquí: queda, y para devolver los litros hace falta el almacén. De estos vales sale el rendimiento del equipo, y el horómetro es lo que lo hace posible. Para llenar el vale hace falta además ver el inventario, ver las máquinas y ver la lista de personal.',
 30, 'ESCRITURA'),

('COMBUSTIBLE.GUARDAR_MOTIVO', 'COMBUSTIBLE', 'Cambiar la lista de para qué se surte',
 'Son las opciones que ve quien surte, y cuáles obligan a explicarse en pocas palabras. Apagar una la saca de la pantalla para todos, aunque los vales viejos sigan diciendo lo que decían.',
 40, 'ESCRITURA'),

('COMBUSTIBLE.BORRAR_MOTIVO', 'COMBUSTIBLE', 'Borrar un motivo de despacho',
 'Quita de la lista un motivo que ningún vale llegó a usar. Si ya hay vales con él, el sistema no deja borrarlo: hay que apagarlo, y apagarlo es la casilla de cambiar la lista.',
 50, 'TOTAL'),

-- ============================= INVENTARIO ============================
--
-- Nueve de estas casillas rejan hoy con `exigir_rol('ALMACEN')`, que por
-- equivalencia es INVENTARIO:ESCRITURA. Por eso llevan el escalón declarado Y
-- la semilla del rol literal: el escalón reproduce a los cinco que entran por
-- nivel, la semilla cubre a quien tenga el rol ALMACEN sin llegar al nivel.
('INVENTARIO.VER_EXISTENCIAS', 'INVENTARIO', 'Ver lo que hay en el almacén',
 'Existencias por almacén, la historia de cada artículo y las notas de salida numeradas. Se ve el costo en dólares de todo lo que hay guardado, no solo la cantidad.',
 10, 'LECTURA'),

('INVENTARIO.RECIBIR_COMPRA', 'INVENTARIO', 'Recibir el material de una compra',
 'Lo que llegó del proveedor entra al almacén y la orden queda como recibida. El sistema exige antes la factura o la nota de entrega —el comprobante de pago no sirve—, y el costo que se guarda es el de esa orden.',
 20, 'ESCRITURA'),

('INVENTARIO.REGISTRAR_ENTRADA', 'INVENTARIO', 'Meter material al almacén',
 'Suma existencia sin orden de compra de por medio: una devolución, un sobrante, algo que apareció. El costo que se escriba mueve el costo promedio del artículo, y con él, el valor de todo lo que hay de ese artículo.',
 30, 'ESCRITURA'),

('INVENTARIO.REGISTRAR_SALIDA', 'INVENTARIO', 'Sacar material del almacén',
 'Descuenta existencia y carga el costo a donde vaya. Si se saca por renglones queda una nota numerada que se puede imprimir; una salida suelta no deja nota. Según el tipo de salida que se escoja, el material puede darse por perdido en vez de por consumido, con su ficha de baja.',
 40, 'ESCRITURA'),

('INVENTARIO.TRANSFERIR', 'INVENTARIO', 'Mover material de un almacén a otro',
 'Sale de un sitio y entra en el otro con el mismo costo. No cambia cuánto hay en total; cambia quién responde por ello.',
 50, 'ESCRITURA'),

('INVENTARIO.REGISTRAR_PRODUCCION', 'INVENTARIO', 'Cargar la piedra que se produjo',
 'Mete al patio lo que fabricó la cantera, sin compra ni costo de proveedor detrás. Es lo mismo que luego se vende, así que apuntar de más hace parecer que hay material para despachar.',
 60, 'ESCRITURA'),

('INVENTARIO.AJUSTAR_EXISTENCIA', 'INVENTARIO', 'Cuadrar el conteo con lo que dice el sistema',
 'Después de contar, deja la existencia en lo contado. La diferencia entra o sale sin papel de nadie que la respalde: es la puerta por donde se puede tapar un faltante.',
 70, 'ESCRITURA'),

('INVENTARIO.DAR_DE_BAJA', 'INVENTARIO', 'Dar de baja material dañado o perdido',
 'Saca del almacén lo que se dañó, venció, se extravió o se robaron. El valor no se recupera: se pierde contra el resultado del mes. Ojo: la salida por renglones también puede dar de baja escogiendo una clase de baja, así que esta casilla no es la única puerta.',
 80, 'ESCRITURA'),

('INVENTARIO.REVERSAR_MOVIMIENTO', 'INVENTARIO', 'Deshacer un movimiento de almacén',
 'Escribe el movimiento contrario del que se hizo mal. El original no desaparece: quedan los dos a la vista y se nota que hubo un error.',
 90, 'ESCRITURA'),

('INVENTARIO.EDITAR_CATALOGO', 'INVENTARIO', 'Crear y corregir artículos del catálogo',
 'Nombre, unidad, categoría, mínimo y si se inventaría o no. Cambiar la unidad de un artículo que ya se movió deja toda su historia hablando en otra medida. Apagarlo lo saca de los formularios sin tocar lo ya emitido.',
 100, 'ESCRITURA'),

('INVENTARIO.CARGAR_ARTICULOS_LOTE', 'INVENTARIO', 'Cargar artículos por planilla',
 'Da de alta y corrige cientos de artículos de un golpe desde un Excel. Un error en la planilla se multiplica por cada fila. Si la planilla trae columna de precio, además fija el precio de venta y el mínimo de cada artículo.',
 110, 'ESCRITURA'),

('INVENTARIO.ELIMINAR_ARTICULO', 'INVENTARIO', 'Borrar un artículo del catálogo',
 'Solo sale si nunca se usó; en cuanto tiene movimientos o documentos el sistema no deja y obliga a apagarlo. Lo que se borra no se puede recuperar.',
 120, 'ESCRITURA'),

('INVENTARIO.GUARDAR_ALMACEN', 'INVENTARIO', 'Crear y corregir los sitios: patios, almacenes, talleres y tanques',
 'Define dónde se guarda cada cosa —el patio de la piedra, los almacenes, los talleres y los tanques de combustible— y cuál recibe las compras. Aquí se fija cuánto le cabe a un tanque y cuántos trabajos aguanta un taller a la vez. Apagar un sitio lo esconde de las pantallas con todo lo que todavía tenga dentro.',
 130, 'ESCRITURA'),

('INVENTARIO.GUARDAR_CLASE_SALIDA', 'INVENTARIO', 'Definir y apagar los tipos de salida',
 'Son las opciones que ve quien saca material y lo que cada una obliga a explicar. Desde aquí también se apaga y se vuelve a encender una clase. Una clase puede mandar la salida a baja: lo que salga por ella deja de valer en libros y queda como pérdida con su causa, y eso se decide al crearla y no se puede cambiar después.',
 140, 'ESCRITURA'),

('INVENTARIO.BORRAR_CLASE_SALIDA', 'INVENTARIO', 'Borrar un tipo de salida',
 'Solo la retira de la lista. Ojo: apagar una clase no necesita esta casilla, se hace desde la de definirlas.',
 150, 'TOTAL'),

-- ============================ ASIGNACIONES ===========================
('ASIGNACIONES.VER_ENTREGAS', 'ASIGNACIONES', 'Ver qué tiene cada trabajador',
 'Qué herramienta y qué dotación carga encima cada trabajador, desde cuándo, y qué quedó sin devolver. También las pérdidas y los daños reportados.',
 10, 'LECTURA'),

('ASIGNACIONES.ENTREGAR', 'ASIGNACIONES', 'Entregar herramientas y dotación a un trabajador',
 'Sale del almacén y queda a nombre de esa persona. La herramienta prestada hay que devolverla; la dotación se le da y ya — lo decide el propio artículo, no quien entrega. Si después se pierde, responde quien la tiene firmada.',
 20, 'ESCRITURA'),

('ASIGNACIONES.DEVOLVER', 'ASIGNACIONES', 'Recibir de vuelta una herramienta',
 'Cierra el préstamo: la herramienta vuelve a estar disponible y el trabajador deja de responder por ella.',
 30, 'ESCRITURA'),

('ASIGNACIONES.REPORTAR_INCIDENCIA', 'ASIGNACIONES', 'Reportar una herramienta perdida o dañada',
 'Deja la herramienta con una cuenta abierta a nombre del trabajador, esperando que alguien decida quién responde. Si se da de baja —siempre en una pérdida, opcional en un daño— sale del inventario por su costo promedio.',
 40, 'ESCRITURA'),

('ASIGNACIONES.SALDAR_PERDIDA', 'ASIGNACIONES', 'Decidir quién paga la herramienta perdida',
 'Cierra el caso dejando escrito qué se resolvió: descuento, reposición o exoneración. Es la decisión, no el cobro — el descuento hay que cargarlo aparte en las novedades del período.',
 50, 'ESCRITURA'),

-- ============================== DESPACHOS ============================
('DESPACHOS.VER_VEHICULOS', 'DESPACHOS', 'Ver los vehículos y lo que ha cargado cada uno',
 'La ficha de cada camión, su capacidad, todo lo que ha cargado y quién lo ha manejado en cada fecha. Los pesajes de romana y las guías se leen hoy sin esta casilla: no promete esconderlos.',
 10, 'LECTURA'),

('DESPACHOS.PESAR', 'DESPACHOS', 'Anotar un pesaje de romana',
 'El peso neto del ticket es la cantidad que después se factura al cliente o se le reconoce al proveedor. Sale de la báscula, no de lo que diga el chofer.',
 20, 'ESCRITURA'),

('DESPACHOS.ANULAR_PESAJE', 'DESPACHOS', 'Anular un pesaje',
 'El ticket deja de contar y su peso ya no respalda nada. Si ya está metido en una nota de entrega el sistema no lo deja: primero hay que anular la nota.',
 30, 'TOTAL'),

('DESPACHOS.REGISTRAR_GUIA', 'DESPACHOS', 'Registrar una guía de movilización',
 'Es el papel del ministerio que ampara el viaje hasta un destino y por una cantidad; aquí se anota el número y hasta cuándo vale. El sistema no emite guías: las emite el ministerio. Su número no se puede repetir.',
 40, 'ESCRITURA'),

('DESPACHOS.ANULAR_GUIA', 'DESPACHOS', 'Anular una guía',
 'La guía deja de amparar el viaje y su número queda quemado. Si ya cubrió un despacho no se deja anular hasta que se anule la nota de entrega.',
 50, 'TOTAL'),

('DESPACHOS.DESPACHAR_SIN_GUIA', 'DESPACHOS', 'Dejar salir mineral sin guía',
 'Es la excepción a la regla: la nota de entrega se emite igual aunque no haya guía del ministerio que ampare el viaje. Quien la marca responde si paran el camión en la vía.',
 60, 'TOTAL'),

('DESPACHOS.EDITAR_VEHICULO', 'DESPACHOS', 'Dar de alta y corregir un vehículo',
 'Placa, tipo y cuántos metros cúbicos carga — esa capacidad es la que se usa para saber cuánto cabe en cada viaje. Marcar un camión como de un transportista obliga a decir de quién es y lo desengancha de su ficha de mantenimiento: deja de acumular horas, combustible y reparaciones. Desde aquí también se saca un vehículo de circulación.',
 70, 'ESCRITURA'),

('DESPACHOS.ASIGNAR_CHOFER', 'DESPACHOS', 'Decir quién maneja cada vehículo',
 'Poner un chofer nuevo cierra el período del anterior; también se puede cerrar sin poner sustituto, y desde esa fecha nadie figura respondiendo por el camión. El chofer puede ser un empleado o alguien de fuera anotado a mano, que es como entra el de un transportista.',
 80, 'ESCRITURA'),

-- =============================== COMPRAS =============================
('COMPRAS.VER_COMPRAS', 'COMPRAS', 'Ver los pedidos, las órdenes y los proveedores',
 'Todo el recorrido de una compra: quién pidió, qué cotizó cada proveedor, qué aprobó la gerencia y en qué va la orden. Incluye los precios y las condiciones de pago de los proveedores. Las instrucciones de pago se ven también desde tesorería.',
 10, 'LECTURA'),

('COMPRAS.CREAR_PEDIDO', 'COMPRAS', 'Pedir algo que hace falta',
 'Levanta la solicitud: qué se necesita, cuánto y para cuándo. Quien la levanta la corrige y la envía sin más permiso mientras siga en borrador; lo que hace falta permiso para tocar es el borrador de OTRO, y eso son las dos casillas de abajo.',
 20, 'ESCRITURA'),

-- Corregir y enviar el borrador ajeno son dos casillas y no una porque la base
-- las reja distinto: `actualizar_pedido` solo mira `tiene_rol('COMPRAS')`, sin
-- equivalencia, mientras `enviar_pedido` acepta además COMPRAS:TOTAL. Hoy eso
-- significa que el gerente general puede enviar el borrador de otro pero no
-- corregirlo. Parece un descuido de la base más que una decisión, pero esta
-- migración no lo arregla: lo copia y lo deja anotado en salud-de-la-base.
('COMPRAS.CORREGIR_PEDIDO_AJENO', 'COMPRAS', 'Corregir el borrador de otro',
 'Cambiar lo que pidió otra persona antes de que su pedido salga a la cola. Quien lo levantó no necesita esta casilla para corregir el suyo.',
 30, null),

('COMPRAS.ENVIAR_PEDIDO_AJENO', 'COMPRAS', 'Enviar el borrador de otro a la cola',
 'El pedido entra en la cola de compras y ya no se toca: hay que cancelarlo y hacer otro. Quien levantó el suyo lo envía sin esta casilla.',
 40, 'TOTAL'),

('COMPRAS.CONFIRMAR_PEDIDO', 'COMPRAS', 'Aceptar un pedido y ponerlo a cotizar',
 'Compras se da por enterada y el pedido pasa a buscar precios. Hasta que alguien lo confirme, el que pidió lo ve parado sin que nadie lo atienda.',
 50, 'TOTAL'),

('COMPRAS.CANCELAR_PEDIDO', 'COMPRAS', 'Cerrar el pedido de otro',
 'Se da por muerto con un motivo escrito. Quien lo levantó puede retirar el suyo sin esta casilla; esto es para cerrar el de cualquiera. No se recupera: hay que volver a pedirlo.',
 60, 'TOTAL'),

('COMPRAS.REGISTRAR_COTIZACION', 'COMPRAS', 'Cargar y quitar las cotizaciones de los proveedores',
 'Se apunta lo que ofreció cada proveedor para poder compararlos. Una cotización que ya está propuesta al gerente, o que ya generó una orden, no se puede quitar.',
 70, 'TOTAL'),

('COMPRAS.PROPONER_COTIZACION', 'COMPRAS', 'Proponerle al gerente con quién se compra',
 'Manda el pedido a la gerencia señalando una cotización. Compras puede cambiar cuál propone mientras el gerente no responda, y cada cambio queda anotado. Quien aprueba es el gerente; aquí solo se le pone delante.',
 80, 'TOTAL'),

('COMPRAS.APROBAR_COMPRA', 'COMPRAS', 'Aprobar la compra',
 'Nace la orden de compra al proveedor elegido con su precio y su plazo, y la plata queda comprometida. Aprobar no se deshace: después solo se cancela la orden.',
 90, null),

('COMPRAS.DEVOLVER_A_COTIZACION', 'COMPRAS', 'Devolverle el pedido a compras',
 'El pedido regresa a compras con un motivo escrito para que busquen otro precio. No se aprueba nada y no se pierde el pedido.',
 100, null),

('COMPRAS.DECLARAR_COMPROBANTE', 'COMPRAS', 'Decir con qué papel entrega el proveedor',
 'Nota de entrega o factura. Solo la factura da derecho al crédito fiscal y entra en el libro de compras, y sin esto declarado la orden no se puede mandar a pagar.',
 110, 'TOTAL'),

('COMPRAS.INDICAR_PAGO', 'COMPRAS', 'Mandar la orden a tesorería para que la paguen',
 'Arma la instrucción con el método, la moneda y el monto, y la orden cae en la bandeja de tesorería. El dinero no sale aquí: lo saca quien paga.',
 120, 'TOTAL'),

('COMPRAS.CANCELAR_ORDEN', 'COMPRAS', 'Cancelar una orden de compra',
 'La compra se da por no ocurrida: el material que haya entrado por ella sale del almacén y los pagos que aún no habían salido se anulan. Lo que el proveedor ya cobró NO vuelve solo: eso hay que reclamarlo aparte. Si ya se le pagó todo y no entregó, va por «marcar que el proveedor no entregó», no por aquí.',
 130, 'TOTAL'),

('COMPRAS.MARCAR_DESISTIMIENTO', 'COMPRAS', 'Marcar que el proveedor no entregó',
 'Para una orden que ya salió al proveedor —pagada, a medio recibir, o en la bandeja de tesorería— y que el proveedor no cumplió. Queda una plata pendiente de resolver, y si se le devolvió el material, ese material sale del almacén.',
 140, 'TOTAL'),

('COMPRAS.RESOLVER_DESISTIMIENTO', 'COMPRAS', 'Cerrar el dinero de un proveedor que no entregó',
 'Decide qué pasó con la plata: la devolvieron, queda a favor para otra compra, o se da por perdida. Es lo que cierra el caso y lo que van a decir las cuentas para siempre.',
 150, null),

('COMPRAS.ADJUNTAR_PAPEL_COMPRA', 'COMPRAS', 'Subir y quitar los papeles de una compra',
 'El comprobante de pago, la nota de entrega o la factura escaneada. Solo la nota de entrega o la factura destrancan la recepción en el almacén: el comprobante de pago dice que se pagó, no qué llegó. Quitar el último de esos dos vuelve a trancar la recepción, y cualquiera de los cuatro roles puede quitar el papel que subió otro.',
 160, null),

('COMPRAS.GUARDAR_PROVEEDOR', 'COMPRAS', 'Crear y corregir proveedores',
 'RIF, condición de pago y si es contribuyente especial. De ahí sale la retención que se le aplica y la moneda en que se le cotiza, así que un dato mal puesto se arrastra a todas sus facturas.',
 170, 'TOTAL'),

('COMPRAS.CARGAR_PROVEEDORES_LOTE', 'COMPRAS', 'Cargar proveedores desde una planilla',
 'Sube muchos de golpe desde el Excel. Primero enseña qué entraría y qué está mal; si una sola fila viene mala, no se carga ninguna. A los que ya existan por RIF les cambia lo que traiga la planilla: la celda vacía deja el dato viejo como estaba, salvo la razón social, que se pisa siempre.',
 180, 'TOTAL'),

('COMPRAS.REGISTRAR_FACTURA', 'COMPRAS', 'Registrar la factura del proveedor',
 'Entra al libro de compras con su IVA y sus retenciones, que es lo que se le declara al SENIAT. El número y la fecha tienen que ser los del papel.',
 190, 'ESCRITURA'),

('COMPRAS.ANULAR_FACTURA', 'COMPRAS', 'Anular una factura de proveedor',
 'La factura deja de contar en el libro de compras y su saldo desaparece. No se deja si todavía tiene pagos vivos, y no se puede deshacer.',
 200, 'TOTAL'),

('COMPRAS.ADJUNTAR_ARCHIVO_FACTURA', 'COMPRAS', 'Adjuntar y quitar el archivo de la factura',
 'El escaneado o el PDF que respalda una factura ya registrada. Quitarlo no anula nada: solo deja la factura sin con qué probarla.',
 210, 'TOTAL'),

('COMPRAS.REGISTRAR_PAGO_FACTURA', 'COMPRAS', 'Pagar una factura de proveedor',
 'Saca el dinero de una cuenta de tesorería, abona el saldo de la factura y cobra el IGTF si toca. El movimiento del banco queda hecho en el momento.',
 220, 'ESCRITURA'),

('COMPRAS.ANULAR_PAGO_FACTURA', 'COMPRAS', 'Anular el pago de una factura',
 'El dinero vuelve a la cuenta y la factura queda debiendo otra vez. No se puede deshacer.',
 230, 'TOTAL'),

('COMPRAS.VER_GASTOS', 'COMPRAS', 'Ver el gasto y el presupuesto',
 'Cuánto se lleva gastado de lo asignado, en qué se fue, cuánto sale cada metro cúbico producido y cuánto se gastó y se consumió en cada frente o almacén. Son números de toda la empresa, sueldos incluidos.',
 240, 'LECTURA'),

('COMPRAS.CLASIFICAR_GASTO', 'COMPRAS', 'Ponerle categoría a un gasto',
 'Dice en qué renglón cae una salida de dinero. La clase no se cambia después: si queda mal, hay que reversar el movimiento entero.',
 250, 'ESCRITURA'),

('COMPRAS.GUARDAR_CATEGORIA_GASTO', 'COMPRAS', 'Crear y corregir las categorías de gasto',
 'Son los renglones en que se reparte todo el gasto de la empresa. Tocarlos cambia cómo se ven los informes de todo el mundo, no solo los de compras.',
 260, 'TOTAL'),

('COMPRAS.BORRAR_CATEGORIA_GASTO', 'COMPRAS', 'Borrar una categoría de gasto',
 'Solo se borra una categoría que nadie haya usado nunca y que no tenga otras dentro. Si ya hay gastos ahí, o es de las que el sistema clasifica solo, el sistema no deja: hay que desactivarla, y los gastos viejos siguen contando.',
 270, 'TOTAL'),

('COMPRAS.GUARDAR_PRESUPUESTO', 'COMPRAS', 'Fijar el presupuesto del período',
 'Cuánta plata hay asignada entre dos fechas y cuánta producción se espera con ella. Es el contra que se mide todo el gasto, así que moverlo mueve el porcentaje ejecutado de todos los informes.',
 280, 'TOTAL'),

-- ================================ VENTAS =============================
('VENTAS.VER_VENTAS', 'VENTAS', 'Ver las ventas y lo que deben los clientes',
 'Cotizaciones, despachos, facturas, cobros, notas de crédito y la cuenta de cada cliente, incluidos los precios a los que se vende. Aviso: hoy solo las notas de crédito se cierran de verdad con esta casilla; el resto se lee igual sin ella.',
 10, 'LECTURA'),

('VENTAS.GUARDAR_CLIENTE', 'VENTAS', 'Registrar y corregir clientes',
 'El RIF, la dirección y la retención con que van a salir sus facturas: si el RIF está mal, el papel sale mal. Dar crédito pide la otra casilla — pero ojo, desde aquí sí se le puede QUITAR el crédito a quien lo tenía, y con eso deja de poder facturarse a crédito.',
 20, 'ESCRITURA'),

('VENTAS.DAR_CREDITO_CLIENTE', 'VENTAS', 'Fiarle a un cliente y pasarle el límite',
 'Decidir a quién se le vende a crédito, hasta cuánto y a cuántos días, y dejar pasar una factura que lo deja debiendo más de lo autorizado. Es comprometer dinero de la empresa, no editar una ficha.',
 30, 'TOTAL'),

('VENTAS.COTIZAR', 'VENTAS', 'Hacer y cerrar cotizaciones',
 'Un precio por escrito con fecha de vencimiento, y después marcar si el cliente aceptó, rechazó o se cayó. No mueve material ni cobra nada: es lo que se le manda al cliente.',
 40, 'ESCRITURA'),

('VENTAS.VENDER_BAJO_MINIMO', 'VENTAS', 'Vender por debajo del precio mínimo',
 'El precio mínimo deja de frenar: la cotización y la nota de entrega salen igual con el precio que se escriba. Es regalar margen de la empresa renglón por renglón.',
 50, 'TOTAL'),

('VENTAS.DESPACHAR', 'VENTAS', 'Despachar material a un cliente',
 'Emite la nota de entrega y el material sale del patio en ese momento, con el peso que dio la romana. Si lleva mineral hace falta guía de movilización, salvo que alguien lo autorice sin ella. El ticket y la guía quedan gastados en ese viaje, y si el despacho sale de una cotización, esa cotización queda aceptada.',
 60, 'ESCRITURA'),

('VENTAS.ANULAR_NOTA_ENTREGA', 'VENTAS', 'Anular un despacho',
 'El material vuelve al patio y el ticket de romana y la guía quedan libres para usarse otra vez. Si la entrega ya está en una factura no se puede: primero se anula la factura.',
 70, 'TOTAL'),

('VENTAS.FACTURAR', 'VENTAS', 'Facturar las entregas ya despachadas',
 'Junta en un solo papel varias entregas del mismo cliente y gasta un número de control fiscal, que no se recupera aunque después se anule. Desde ahí el cliente debe.',
 80, 'ESCRITURA'),

('VENTAS.ANULAR_FACTURA', 'VENTAS', 'Anular una factura',
 'La factura deja de contar y las entregas vuelven a quedar sin facturar, listas para otro papel. No se puede si tiene cobros o notas de crédito encima: esos van primero.',
 90, 'TOTAL'),

('VENTAS.REGISTRAR_COBRO', 'VENTAS', 'Registrar lo que paga un cliente',
 'El dinero entra en la cuenta de la empresa que se elija y la factura baja su saldo hasta darse por cobrada. En divisas se le suma el IGTF, que se recauda aparte porque no es de la casa.',
 100, 'ESCRITURA'),

('VENTAS.ANULAR_COBRO', 'VENTAS', 'Anular un cobro',
 'Saca del banco el dinero que había entrado y la factura vuelve a deber. Es para el pago que rebotó o que se le cargó a la factura equivocada.',
 110, 'TOTAL'),

('VENTAS.EMITIR_NOTA_CREDITO', 'VENTAS', 'Emitir una nota de crédito',
 'Le resta a una factura ya emitida por una devolución, un descuento o un error, y si el renglón dice a qué almacén vuelve, el material entra al patio. Gasta un número de control fiscal que no se recupera aunque después se anule.',
 120, 'TOTAL'),

('VENTAS.ANULAR_NOTA_CREDITO', 'VENTAS', 'Anular una nota de crédito',
 'Devuelve la factura a su monto entero y saca del patio el material que había vuelto. No se puede si lo devuelto ya se vendió otra vez.',
 130, 'TOTAL'),

('VENTAS.GUARDAR_PRECIO', 'VENTAS', 'Poner el precio de venta de cada producto',
 'Es a cuánto vende la empresa y por debajo de cuánto no se vende — un piso que se puede saltar con la casilla de vender bajo el mínimo. Manda sobre la próxima cotización y el próximo despacho de todos; lo ya emitido se queda con el precio que tenía. Aviso: la carga de artículos por planilla también escribe estos precios, y hoy pide menos que esta casilla.',
 140, 'TOTAL'),

-- =============================== NOMINA ==============================
--
-- Doce de estas rejan hoy con `exigir_rol('RRHH')`, que por equivalencia es
-- NOMINA:ESCRITURA. Escalón declarado más semilla del rol literal, como en
-- inventario. `NOMINA.PAGAR_NOMINA` es el caso distinto: su reja es
-- `exigir_rol('TESORERIA')`, cuya equivalencia cae en el módulo TESORERIA, y
-- una casilla de NOMINA no puede declarar el escalón de otro módulo. Va con
-- nivel nulo y las dos semillas.
('NOMINA.VER_PERSONAL', 'NOMINA', 'Ver las fichas del personal',
 'Nombre, cédula, teléfono, dirección, cuánto gana cada quien y en qué cuenta cobra. Es el dato personal de toda la gente de la empresa, con sus actas y los demás implicados en cada una.',
 10, 'LECTURA'),

('NOMINA.EDITAR_EMPLEADO', 'NOMINA', 'Crear y corregir la ficha de un trabajador',
 'El sueldo, cada cuánto cobra y la cuenta donde se le deposita salen de aquí: lo que se cambie hoy es lo que se le pagará en la próxima nómina.',
 20, 'ESCRITURA'),

('NOMINA.DESINCORPORAR_EMPLEADO', 'NOMINA', 'Desincorporar a un trabajador',
 'Deja de salir en las nóminas siguientes y la ficha queda con fecha y motivo de salida. Del motivo dependen las prestaciones que le tocan. Las fichas no se borran nunca: se desincorporan.',
 30, 'ESCRITURA'),

('NOMINA.CARGAR_PERSONAL_LOTE', 'NOMINA', 'Cargar personal desde una planilla',
 'Da de alta o pisa muchas fichas de una sola vez, sueldos incluidos. Un error en la planilla entra multiplicado.',
 40, 'ESCRITURA'),

('NOMINA.PONER_FOTO_EMPLEADO', 'NOMINA', 'Poner y quitar la foto de un trabajador',
 'Solo la foto del carnet y su encuadre. No toca el sueldo ni ningún otro dato de la ficha.',
 50, 'ESCRITURA'),

('NOMINA.GUARDAR_FIRMA_EMPLEADO', 'NOMINA', 'Guardar la firma de un trabajador y decidir si se estampa',
 'Esa firma sale impresa sola en los papeles que el sistema emite a su nombre —el recibo de nómina, el vale de combustible—. Quien la guarda decide en nombre de quién firma el sistema.',
 60, 'ESCRITURA'),

('NOMINA.VER_TABULADOR', 'NOMINA', 'Ver el tabulador de sueldos',
 'La tabla de cuánto se paga por cargo en toda la empresa. Quien la ve sabe lo que gana cada quien, tenga o no su ficha delante.',
 70, 'LECTURA'),

('NOMINA.EDITAR_TABULADOR', 'NOMINA', 'Armar el tabulador de cargos',
 'Cambiar el sueldo de un cargo todavía no le cambia el sueldo a nadie: eso ocurre al igualar las fichas, que es otra casilla.',
 80, 'ESCRITURA'),

('NOMINA.APLICAR_TABULADOR', 'NOMINA', 'Igualar los sueldos al tabulador',
 'Sube —o baja— de golpe el sueldo de cada ficha enganchada a un cargo. Lo que se pague en la próxima nómina cambia con esto.',
 90, 'ESCRITURA'),

('NOMINA.EDITAR_ORGANIGRAMA', 'NOMINA', 'Armar el organigrama',
 'Quién depende de quién y cuántos puestos tiene cada unidad. Es el dibujo de la empresa: no paga ni cobra nada.',
 100, 'ESCRITURA'),

('NOMINA.REGISTRAR_INCIDENCIA', 'NOMINA', 'Levantar un acta por una falta o un accidente',
 'Queda numerada en el expediente de esa persona, con los días de reposo y los demás implicados. Es papel que puede terminar en una inspectoría.',
 110, 'ESCRITURA'),

('NOMINA.EDITAR_PARAMETROS', 'NOMINA', 'Fijar las cifras con que se calcula la nómina',
 'Salario mínimo, recargo de hora extra, bono nocturno, días del mes. Tocarlas cambia lo que cobra todo el mundo desde la fecha que se les ponga.',
 120, 'ESCRITURA'),

('NOMINA.VER_RECIBOS', 'NOMINA', 'Ver las nóminas y los recibos',
 'Cada período y lo que cobró cada trabajador, línea por línea, con sus asignaciones y sus descuentos.',
 130, 'LECTURA'),

('NOMINA.ABRIR_PERIODO', 'NOMINA', 'Abrir un período de nómina',
 'Arranca la quincena o el mes que se va a pagar y le fija la tasa del día con la que se convertirán los sueldos en divisa. Dos períodos del mismo tipo no pueden pisar los mismos días.',
 140, 'ESCRITURA'),

('NOMINA.CARGAR_NOVEDADES', 'NOMINA', 'Cargar las novedades del período',
 'Horas extra, faltas, feriados trabajados, bonos y descuentos sueltos. Es lo que hace que el recibo de alguien suba o baje respecto a su sueldo.',
 150, 'ESCRITURA'),

('NOMINA.CALCULAR_NOMINA', 'NOMINA', 'Calcular la nómina del período',
 'Rehace todos los recibos del período con las cifras y las novedades que haya en ese momento. Los recibos que ya tenía el período se borran y se vuelven a armar.',
 160, 'ESCRITURA'),

('NOMINA.APROBAR_NOMINA', 'NOMINA', 'Aprobar la nómina',
 'Da por buenos los montos y le avisa a tesorería que ya puede pagarla. Aprobada, deja de admitir novedades.',
 170, null),

('NOMINA.PAGAR_NOMINA', 'NOMINA', 'Pagar la nómina',
 'Saca el neto de una cuenta de verdad y cierra el período. Una nómina pagada ya no se puede anular ni reversar: lo que salga mal se corrige en el período siguiente.',
 180, null),

('NOMINA.ANULAR_PERIODO', 'NOMINA', 'Anular un período de nómina',
 'El período y todos sus recibos dejan de contar. Solo se puede antes de pagar, y hay que escribir por qué: es un documento con consecuencias legales.',
 190, 'ESCRITURA'),

('NOMINA.VER_PRESTACIONES', 'NOMINA', 'Ver las prestaciones de cada trabajador',
 'Lo que la empresa le debe a cada quien: la garantía acumulada, los intereses y los anticipos que ya cobró.',
 200, 'LECTURA'),

('NOMINA.CARGAR_TASA_PRESTACIONES', 'NOMINA', 'Cargar la tasa de intereses del mes',
 'Es la tasa del BCV con la que se abonan los intereses de prestaciones. Una tasa mal copiada se le paga de menos —o de más— a todo el mundo.',
 210, 'ESCRITURA'),

('NOMINA.CALCULAR_PRESTACIONES', 'NOMINA', 'Correr el cálculo del trimestre y de los intereses',
 'Le abona a cada trabajador los días de garantía del trimestre y los intereses del mes. Es lo que va formando la deuda que se le paga el día que salga.',
 220, 'ESCRITURA'),

('NOMINA.ANULAR_DEPOSITO_PRESTACIONES', 'NOMINA', 'Anular un depósito de prestaciones',
 'Ese trimestre deja de contarle al trabajador y baja lo que se le debe. Se usa cuando el cálculo salió con un sueldo equivocado.',
 230, 'TOTAL'),

('NOMINA.CARGAR_CORTE_PRESTACIONES', 'NOMINA', 'Cargar el corte de arranque de prestaciones',
 'Es lo que la persona traía acumulado antes de que existiera el sistema, escrito a mano. Todo lo que se le deba después se cuenta desde ahí: cambiarlo cambia la deuda entera.',
 240, 'TOTAL'),

('NOMINA.ADELANTAR_PRESTACIONES', 'NOMINA', 'Adelantarle prestaciones a un trabajador',
 'Sale dinero de una cuenta y se le descuenta de lo acumulado. La ley solo deja adelantar hasta el 75% de lo que lleve.',
 250, 'TOTAL'),

('NOMINA.ANULAR_ANTICIPO_PRESTACIONES', 'NOMINA', 'Anular un anticipo de prestaciones',
 'Le devuelve el dinero a la cuenta y le repone al trabajador lo que se le había descontado. Quedan las dos operaciones a la vista, no se borra nada.',
 260, 'TOTAL'),

('NOMINA.CALCULAR_LIQUIDACION', 'NOMINA', 'Calcular la liquidación de quien sale',
 'Arma la cuenta final: prestaciones, vacaciones, utilidades e indemnización si el motivo de salida la manda. Es la cifra que se le va a entregar a la persona.',
 270, 'TOTAL'),

('NOMINA.PAGAR_LIQUIDACION', 'NOMINA', 'Pagar una liquidación',
 'Saca el monto de una cuenta y desincorpora la ficha en el acto: esa persona no vuelve a salir en ninguna nómina.',
 280, 'TOTAL'),

('NOMINA.ANULAR_LIQUIDACION', 'NOMINA', 'Anular una liquidación',
 'La liquidación deja de valer y, si ya se había pagado, el egreso se reversa en la cuenta. Es el único camino para volver a calcularla.',
 290, 'TOTAL'),

-- ============================= TESORERIA =============================
('TESORERIA.VER_CUENTAS', 'TESORERIA', 'Ver el dinero de la empresa',
 'Cuánto hay en cada banco, caja y billetera, y el libro donde queda escrito cada movimiento. Es mirar sin poder mover nada.',
 10, 'LECTURA'),

('TESORERIA.GUARDAR_CUENTA', 'TESORERIA', 'Abrir y editar cuentas de banco, cajas y billeteras',
 'Es la lista de dónde puede salir y entrar el dinero: quien la maneja decide qué cuentas existen y en qué moneda. Una cuenta que ya tiene movimientos no puede cambiar de moneda.',
 20, 'ESCRITURA'),

('TESORERIA.ABRIR_SALDO', 'TESORERIA', 'Poner el saldo con que arranca una cuenta',
 'Lo que había en la cuenta el día que entró al sistema. Es el punto de partida del que cuelga todo el saldo que se vea después, y solo se hace una vez por cuenta.',
 30, 'ESCRITURA'),

('TESORERIA.AJUSTAR_CUENTA', 'TESORERIA', 'Cuadrar una cuenta que no coincide con el banco',
 'Suma o resta dinero sin que haya habido cobro ni pago, para que el sistema diga lo mismo que el estado de cuenta. Cambia el saldo y queda a la vista con el motivo escrito.',
 40, 'ESCRITURA'),

('TESORERIA.REGISTRAR_MOVIMIENTO', 'TESORERIA', 'Anotar entradas y salidas de dinero sueltas',
 'Plata que entra o sale sin una factura ni una orden de compra detrás: un préstamo, la comisión del banco, un gasto de caja chica. El saldo de la cuenta cambia en el acto.',
 50, 'ESCRITURA'),

('TESORERIA.TRANSFERIR_ENTRE_CUENTAS', 'TESORERIA', 'Pasar dinero de una cuenta a otra',
 'Deja dos asientos amarrados, uno en cada cuenta, y ninguno de los dos se puede deshacer por separado. Entre monedas distintas hay que escribir cuánto llegó, porque el cambio lo pone la casa de cambio y no el sistema.',
 60, 'ESCRITURA'),

('TESORERIA.REVERSAR_MOVIMIENTO', 'TESORERIA', 'Deshacer un movimiento del libro',
 'No borra: escribe el asiento contrario y los dos quedan a la vista con el motivo. El pago de una compra se deshace devolviendo la instrucción desde la compra; la mitad de un traslado, con otro traslado al revés; y el pago de una nómina no se deshace de ninguna manera.',
 70, 'ESCRITURA'),

('TESORERIA.PAGAR_INSTRUCCION', 'TESORERIA', 'Sacar el dinero para pagar una compra',
 'El dinero sale de la cuenta que se elija, y si la instrucción lleva IGTF sale también ese impuesto. La orden solo pasa a pagada cuando no le queda nada por deber. Se pueden marcar varias a la vez si salen todas de la misma cuenta y están en su misma moneda.',
 80, 'ESCRITURA'),

('TESORERIA.DEVOLVER_INSTRUCCION', 'TESORERIA', 'Devolver a compras un pago mal armado',
 'El pago no se hace y la orden vuelve a manos de compras para que corrija a quién o por cuánto. Hay que escribir qué estaba mal, porque es lo único que va a leer quien lo corrija.',
 90, 'ESCRITURA'),

-- ================================ TASAS ==============================
('TASAS.VER_TASAS', 'TASAS', 'Ver la tasa del día y su historial',
 'El cambio con que se convierte todo lo que se factura, se paga y se cobra ese día. Hoy la ve cualquiera que entre al sistema, tenga o no esta casilla: hace falta para entender un monto y por eso está abierta.',
 10, null),

('TASAS.TOMAR_TASA_BCV', 'TASAS', 'Pedirle al sistema la tasa del BCV',
 'Le pide al BCV la tasa de hoy. Si ya hay una, no hace nada; si baja mal, todavía se puede enmendar. Solo sabe de dólar y euro contra bolívar.',
 20, 'ESCRITURA'),

('TASAS.ESCRIBIR_TASA', 'TASAS', 'Escribir la tasa a mano',
 'La tasa que se teclea aquí rige ese día y los que sigan hasta que entre otra, y no se corrige nunca: si el número salió mal, se arregla cargando la del día siguiente. Vale para cualquier fecha ya pasada y para las monedas que el BCV no publica.',
 30, 'ESCRITURA'),

('TASAS.CORREGIR_TASA', 'TASAS', 'Corregir la tasa que trajo el sistema',
 'Enmienda, una sola vez y solo la de hoy, la tasa que bajó sola del BCV; queda firmada por quien la cambió. Lo ya emitido conserva el número viejo y lo de ayer no se toca, pero si la enmienda también sale mal ya no hay vuelta atrás.',
 40, 'ESCRITURA'),

-- =============================== USUARIOS ============================
('USUARIOS.VER_USUARIOS', 'USUARIOS', 'Ver quién entra al sistema',
 'La lista de quién tiene entrada al sistema, con su cargo y sus roles, y qué permite cada rol. Es por donde se averigua quién puede firmar qué.',
 10, 'LECTURA'),

('USUARIOS.CREAR_USUARIO', 'USUARIOS', 'Crear un usuario',
 'Le da entrada al sistema a una persona nueva con una clave provisional que ella misma tiene que cambiar. Decide también con qué roles nace, incluido el de administrador: es tan fuerte como la casilla de repartir roles.',
 20, null),

('USUARIOS.EDITAR_PERFIL', 'USUARIOS', 'Corregir los datos de un usuario',
 'Nombre, cargo, cédula y teléfono. El nombre es el que se lee en la barra de arriba y el que queda pegado a todo lo que esa persona registre.',
 30, null),

('USUARIOS.ASIGNAR_ROLES', 'USUARIOS', 'Decidir qué roles tiene una persona',
 'Quien la tiene puede nombrar administrador a cualquiera, incluido él mismo, y con eso queda todo el sistema abierto. No abre pantallas: abre lo que se puede firmar, pagar y anular. Lo único que no deja es quitarle el rol al último administrador que quede.',
 40, null),

('USUARIOS.ACTIVAR_USUARIO', 'USUARIOS', 'Dar de baja o volver a habilitar a alguien',
 'Se queda sin permiso para nada, y se conserva todo lo que hizo y su firma en los papeles viejos. Aviso: su clave sigue sirviendo para entrar y ver la pantalla vacía. Si la persona se fue de malas, repónle además la clave, que es lo que le cierra la sesión.',
 50, null),

('USUARIOS.REPONER_CLAVE', 'USUARIOS', 'Reponerle la clave a alguien',
 'Se le cierran las sesiones abiertas y entra con la clave nueva, que tiene que cambiar él mismo. Quien la repuso queda anotado, porque durante ese rato se puede entrar como esa persona.',
 60, null),

('USUARIOS.CREAR_ROL', 'USUARIOS', 'Crear un rol',
 'Un título nuevo que nace sin acceso a nada. Al crearlo se elige de qué se regirá: por los niveles de siempre, módulo a módulo, o marcando casilla por casilla lo que podrá hacer.',
 70, null),

('USUARIOS.EDITAR_ROL', 'USUARIOS', 'Cambiar el nombre de un rol y de qué se rige',
 'Además del nombre, decide si el rol se rige por los niveles de siempre o por casillas marcadas una a una. Cambiar eso de clase le enciende o le apaga todo lo que hacía, de un guardado.',
 80, null),

('USUARIOS.ELIMINAR_ROL', 'USUARIOS', 'Borrar un rol',
 'Solo si ya no lo tiene nadie. Los roles que el sistema nombra por dentro no se dejan borrar: sin TESORERIA, por ejemplo, nadie podría volver a pagar.',
 90, null),

('USUARIOS.DAR_PERMISOS', 'USUARIOS', 'Repartir los permisos de un rol',
 'Es la casilla que reparte todas las demás: quien la tiene puede darse a sí mismo cualquier cosa del sistema. Al administrador no se le puede recortar, porque es el que vuelve a abrir lo que se cierre.',
 100, null)

on conflict (codigo) do update
  set modulo = excluded.modulo,
      nombre = excluded.nombre,
      dice   = excluded.dice,
      orden  = excluded.orden,
      nivel_equivalente = excluded.nivel_equivalente;

-- ---------------------------------------------------------------------------
-- Las semillas
--
-- Solo para las casillas cuyo escalón declarado no alcanza a reproducir quién
-- pasa hoy. Son de tres clases:
--
--   1. Reja `exigir_rol(R)` con equivalencia en este mismo módulo: el escalón
--      ya cubre a los que entran por nivel; la semilla cubre al que tenga el
--      rol literal sin llegar al nivel. Hoy no hay nadie así, pero mañana sí
--      puede haberlo y la casilla debe seguir diciendo la verdad.
--
--   2. Reja de rol sin equivalencia posible (GERENTE_GENERAL) o con la
--      equivalencia en otro módulo. Nivel nulo: la semilla es lo único.
--
--   3. Reja con `tiene_rol` suelto, que no consulta equivalencias.
--
-- ADMIN nunca se siembra: pasa siempre por `puede_accion`.
-- ---------------------------------------------------------------------------
insert into public.rol_acciones (rol, accion)
values
  -- 1. Almacén, sobre las nueve puertas del libro de inventario.
  ('ALMACEN', 'INVENTARIO.RECIBIR_COMPRA'),
  ('ALMACEN', 'INVENTARIO.REGISTRAR_ENTRADA'),
  ('ALMACEN', 'INVENTARIO.REGISTRAR_SALIDA'),
  ('ALMACEN', 'INVENTARIO.TRANSFERIR'),
  ('ALMACEN', 'INVENTARIO.AJUSTAR_EXISTENCIA'),
  ('ALMACEN', 'INVENTARIO.DAR_DE_BAJA'),
  ('ALMACEN', 'INVENTARIO.REVERSAR_MOVIMIENTO'),
  ('ALMACEN', 'INVENTARIO.EDITAR_CATALOGO'),
  ('ALMACEN', 'INVENTARIO.ELIMINAR_ARTICULO'),
  ('COMPRAS', 'INVENTARIO.EDITAR_CATALOGO'),
  ('COMPRAS', 'INVENTARIO.ELIMINAR_ARTICULO'),

  -- 1. Almacén y recursos humanos entregan al trabajador. `entregar_a_trabajador`
  --    usa `tiene_rol`, sin equivalencia, así que aquí la semilla no es un por
  --    si acaso: es la mitad de la puerta.
  ('ALMACEN', 'ASIGNACIONES.ENTREGAR'),
  ('RRHH',    'ASIGNACIONES.ENTREGAR'),

  -- 1. Recursos humanos, sobre las trece de nómina que rejan por rol.
  ('RRHH', 'NOMINA.EDITAR_EMPLEADO'),
  ('RRHH', 'NOMINA.DESINCORPORAR_EMPLEADO'),
  ('RRHH', 'NOMINA.CARGAR_PERSONAL_LOTE'),
  ('RRHH', 'NOMINA.PONER_FOTO_EMPLEADO'),
  ('RRHH', 'NOMINA.GUARDAR_FIRMA_EMPLEADO'),
  ('RRHH', 'NOMINA.EDITAR_TABULADOR'),
  ('RRHH', 'NOMINA.APLICAR_TABULADOR'),
  ('RRHH', 'NOMINA.EDITAR_PARAMETROS'),
  ('RRHH', 'NOMINA.ABRIR_PERIODO'),
  ('RRHH', 'NOMINA.CARGAR_NOVEDADES'),
  ('RRHH', 'NOMINA.CALCULAR_NOMINA'),
  ('RRHH', 'NOMINA.ANULAR_PERIODO'),

  -- 1. Tesorería, sobre las ocho suyas.
  ('TESORERIA', 'TESORERIA.GUARDAR_CUENTA'),
  ('TESORERIA', 'TESORERIA.ABRIR_SALDO'),
  ('TESORERIA', 'TESORERIA.AJUSTAR_CUENTA'),
  ('TESORERIA', 'TESORERIA.REGISTRAR_MOVIMIENTO'),
  ('TESORERIA', 'TESORERIA.TRANSFERIR_ENTRE_CUENTAS'),
  ('TESORERIA', 'TESORERIA.REVERSAR_MOVIMIENTO'),
  ('TESORERIA', 'TESORERIA.PAGAR_INSTRUCCION'),
  ('TESORERIA', 'TESORERIA.DEVOLVER_INSTRUCCION'),
  -- Y compras paga sus propias órdenes: `registrar_pago` reja
  -- `exigir_rol('TESORERIA','COMPRAS')`, y COMPRAS equivale a COMPRAS:TOTAL,
  -- que es otro módulo. Sin esta fila, compras pierde el pago.
  ('COMPRAS',         'TESORERIA.PAGAR_INSTRUCCION'),
  ('GERENTE_GENERAL', 'TESORERIA.PAGAR_INSTRUCCION'),

  -- 1. Compras, sobre las suyas de rol.
  ('COMPRAS', 'COMPRAS.CREAR_PEDIDO'),
  ('COMPRAS', 'COMPRAS.CORREGIR_PEDIDO_AJENO'),
  ('COMPRAS', 'COMPRAS.ENVIAR_PEDIDO_AJENO'),
  ('COMPRAS', 'COMPRAS.CONFIRMAR_PEDIDO'),
  ('COMPRAS', 'COMPRAS.CANCELAR_PEDIDO'),
  ('COMPRAS', 'COMPRAS.REGISTRAR_COTIZACION'),
  ('COMPRAS', 'COMPRAS.PROPONER_COTIZACION'),
  ('COMPRAS', 'COMPRAS.DECLARAR_COMPROBANTE'),
  ('COMPRAS', 'COMPRAS.INDICAR_PAGO'),
  ('COMPRAS', 'COMPRAS.CANCELAR_ORDEN'),
  ('COMPRAS', 'COMPRAS.MARCAR_DESISTIMIENTO'),
  ('COMPRAS', 'COMPRAS.GUARDAR_PROVEEDOR'),
  ('COMPRAS', 'COMPRAS.CARGAR_PROVEEDORES_LOTE'),
  ('COMPRAS', 'COMPRAS.ADJUNTAR_ARCHIVO_FACTURA'),
  -- Pedir lo hacen cinco. `crear_pedido` los nombra a los cinco, y el escalón
  -- COMPRAS:ESCRITURA que declara la casilla no alcanza a ALMACEN, que solo
  -- tiene COMPRAS:LECTURA y entra por la equivalencia de su propio rol.
  ('SOLICITANTE', 'COMPRAS.CREAR_PEDIDO'),
  ('OPERACIONES', 'COMPRAS.CREAR_PEDIDO'),
  ('ALMACEN',     'COMPRAS.CREAR_PEDIDO'),
  ('RRHH',        'COMPRAS.CREAR_PEDIDO'),

  -- 2. Rejas de GERENTE_GENERAL, que no tiene equivalencia ninguna. Nivel nulo
  --    y una sola semilla: solo él y ADMIN.
  ('GERENTE_GENERAL', 'COMPRAS.APROBAR_COMPRA'),
  ('GERENTE_GENERAL', 'COMPRAS.DEVOLVER_A_COTIZACION'),
  ('GERENTE_GENERAL', 'NOMINA.APROBAR_NOMINA'),
  -- Cancelar la orden y marcar el desistimiento rejan
  -- `exigir_rol('COMPRAS','GERENTE_GENERAL')`: el escalón TOTAL cubre la
  -- primera mitad, esta fila la segunda.
  ('GERENTE_GENERAL', 'COMPRAS.CANCELAR_ORDEN'),
  ('GERENTE_GENERAL', 'COMPRAS.MARCAR_DESISTIMIENTO'),
  -- Resolver el desistimiento reja `exigir_rol('GERENTE_GENERAL','TESORERIA')`
  -- y la casilla es de COMPRAS, así que ningún escalón de COMPRAS la expresa.
  ('GERENTE_GENERAL', 'COMPRAS.RESOLVER_DESISTIMIENTO'),
  ('TESORERIA',       'COMPRAS.RESOLVER_DESISTIMIENTO'),
  -- Pagar la nómina reja `exigir_rol('TESORERIA')`, equivalencia en el módulo
  -- TESORERIA, y la casilla vive en NOMINA. Mismo caso.
  ('TESORERIA',       'NOMINA.PAGAR_NOMINA'),
  ('GERENTE_GENERAL', 'NOMINA.PAGAR_NOMINA'),

  -- 3. Los papeles de una compra rejan con `tiene_rol` suelto, que NO consulta
  --    equivalencias. Los cuatro roles literales, y nadie más.
  ('COMPRAS',   'COMPRAS.ADJUNTAR_PAPEL_COMPRA'),
  ('TESORERIA', 'COMPRAS.ADJUNTAR_PAPEL_COMPRA'),
  ('ALMACEN',   'COMPRAS.ADJUNTAR_PAPEL_COMPRA'),

  -- El tabulador se lee hoy por rol literal, no por nivel.
  ('RRHH',            'NOMINA.VER_TABULADOR'),
  ('GERENTE_GENERAL', 'NOMINA.VER_TABULADOR'),
  ('TESORERIA',       'NOMINA.VER_TABULADOR'),

  -- La tasa la ve hoy todo el mundo: `tasas_cambio` tiene su política de
  -- lectura en `using (true)` y `obtener_tasa` no pide permiso. Un escalón
  -- LECTURA se la quitaría a almacén, operaciones, solicitante y respaldo, que
  -- no tienen fila de TASAS y la ven igual dentro de pantallas que sí les
  -- tocan. Nivel nulo y los diez roles sembrados es lo único que lo reproduce.
  ('GERENTE_GENERAL', 'TASAS.VER_TASAS'),
  ('COMPRAS',         'TASAS.VER_TASAS'),
  ('TESORERIA',       'TASAS.VER_TASAS'),
  ('ALMACEN',         'TASAS.VER_TASAS'),
  ('RRHH',            'TASAS.VER_TASAS'),
  ('OPERACIONES',     'TASAS.VER_TASAS'),
  ('VENTAS',          'TASAS.VER_TASAS'),
  ('SOLICITANTE',     'TASAS.VER_TASAS'),
  ('CONSULTA',        'TASAS.VER_TASAS'),
  ('RESPALDO',        'TASAS.VER_TASAS')
on conflict (rol, accion) do nothing;

-- ---------------------------------------------------------------------------
-- Las nueve casillas de usuarios van sin semilla, y es a propósito
--
-- GERENTE_GENERAL y TESORERIA tienen hoy USUARIOS=TOTAL en la matriz, pero las
-- nueve funciones exigen el ROL ADMIN: ven la pantalla y cada botón les
-- revienta. Declararles un escalón equivalente les entregaría de golpe crear
-- usuarios, reponer claves y repartir permisos, que es justo lo que hoy NO
-- pueden. Van con nivel nulo y sin sembrar a nadie: solo ADMIN, que pasa
-- siempre.
--
-- `USUARIOS.VER_USUARIOS` sí lleva LECTURA porque ver la pantalla es lo único
-- que hoy alcanzan, y eso no cambia.
-- ---------------------------------------------------------------------------

comment on table public.acciones is
  'Cada cosa concreta que se puede hacer en un módulo, con nombre propio. Un rol detallado es el conjunto de estas que tenga marcadas. El nivel_equivalente NO se escribe a ojo: sale de medir la reja de las funciones que la casilla cubre, contando la equivalencia de private.equivalencia_rol.';
