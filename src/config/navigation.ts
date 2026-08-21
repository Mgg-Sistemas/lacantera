import {
  Banknote,
  Fuel,
  HandHelping,
  Wrench,
  BookOpen,
  Boxes,
  ClipboardList,
  Gauge,
  Landmark,
  Network,
  Pickaxe,
  Settings,
  ShoppingCart,
  Truck,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavChild {
  label: string
  to: string
  /**
   * Solo para el rol ADMIN, por encima de los permisos por módulo.
   *
   * Los módulos se reparten: a alguien de tesorería se le puede dar Nómina en
   * lectura. La auditoría no se reparte — es el registro de lo que ha hecho
   * todo el mundo, incluida la propia administración, y quien lo lee ve de una
   * sentada los sueldos, las cédulas y las cuentas bancarias que pasaron por el
   * sistema. Eso no es un permiso más, es una llave aparte.
   */
  soloAdmin?: boolean
}

/** Rutas cerradas a quien no sea ADMIN, pase lo que pase con los módulos. */
export const RUTAS_SOLO_ADMIN = ['/app/config/auditoria']

export function esRutaSoloAdmin(ruta: string): boolean {
  return RUTAS_SOLO_ADMIN.some((prefijo) => ruta.startsWith(prefijo))
}

export interface NavItem {
  label: string
  icon: LucideIcon
  /** Destino directo. Excluyente con `children`. */
  to?: string
  children?: NavChild[]
  /** Contador de pendientes. Se resolverá contra datos reales. */
  badge?: number
  /**
   * Fuera del MVP: la rama entera no sale en el menú, ni en la lupa.
   *
   * Esconder, no cerrar: la ruta sigue abierta y quien escriba la dirección
   * entra. Es deliberado y lo pidió Christopher así — el equipo sigue
   * desarrollando estos módulos y cerrarlos lo dejaría sin poder verlos. La
   * diferencia con `RUTAS_SOLO_ADMIN`, que sí cierra, es justo esa.
   *
   * Y se esconde para todo el mundo, ADMIN incluido: el MVP se enseña desde
   * una cuenta con todos los permisos, y si al administrador le siguiera
   * saliendo el menú entero, esconderlo no habría servido de nada. La
   * dirección escrita a mano es la puerta de servicio del equipo.
   */
  fueraDelMvp?: boolean
  /**
   * Se ve siempre, sin comprobar permisos.
   *
   * Para lo que no es un módulo del negocio sino ayuda del propio sistema. El
   * manual es el caso: quien más lo necesita es quien acaba de entrar y todavía
   * no tiene ningún permiso asignado, y esconderle justo las instrucciones es
   * dejarlo sin la única pantalla que le explica a quién pedírselos.
   */
  siempre?: boolean
}

/**
 * Qué módulo gobierna cada rama del menú.
 *
 * Se resuelve por prefijo y de arriba abajo, así que lo más específico va
 * primero: "Usuarios y roles" cuelga de Configuración en el menú, pero es su
 * propio módulo — quien mantiene el catálogo de artículos no tiene por qué
 * poder crear cuentas.
 *
 * Espeja el catálogo public.modulos. Si aquí aparece una rama nueva, allá hace
 * falta la fila; si no, no habría forma de darle o quitarle permiso y quedaría
 * abierta a todo el mundo.
 */
const MODULO_POR_PREFIJO: [string, string][] = [
  // Antes que `/app/config`, que atraparía esta ruta: gana el primero que
  // coincide. El respaldo cuelga de Configuración en el menú pero es su propio
  // módulo, como Usuarios: quien mantiene el catálogo de artículos no tiene por
  // qué poder llevarse la base entera.
  ['/app/config/respaldo', 'RESPALDO'],
  ['/app/config/usuarios', 'USUARIOS'],
  ['/app/explotacion', 'EXPLOTACION'],
  ['/app/maquinaria', 'MAQUINARIA'],
  ['/app/combustible', 'COMBUSTIBLE'],
  ['/app/asignaciones', 'ASIGNACIONES'],
  ['/app/inventario', 'INVENTARIO'],
  ['/app/despachos', 'DESPACHOS'],
  ['/app/compras', 'COMPRAS'],
  ['/app/ventas', 'VENTAS'],
  ['/app/organigrama', 'NOMINA'],
  ['/app/nomina', 'NOMINA'],
  ['/app/tesoreria', 'TESORERIA'],
  ['/app/tasas', 'TASAS'],
  ['/app/config', 'CONFIGURACION'],
]

/*
  PALABRAS CON LAS QUE LA GENTE BUSCA, QUE NO SON LAS DEL MENÚ

  El menú dice «Tasas de cambio» y quien necesita la calculadora escribe
  «convertir». Christopher lo hizo y no encontró nada, habiendo una calculadora
  en esa misma pantalla y en el panel de la barra.

  Aquí van los sinónimos, el trabajo que se hace en cada sitio y el nombre del
  documento que sale de ella. No hace falta repetir el título: la lupa ya
  compara contra él, contra su grupo y contra su sección.
*/
/*
  LAS PANTALLAS QUE NO ESTÁN EN EL MENÚ

  Al agrupar los módulos, varias pantallas dejaron de tener entrada propia: se
  llega a ellas por un botón o por una pestaña. Christopher buscó «cargar
  articulo» y «cargar proveedor» en la lupa y no salió nada, con razón — la
  lupa recorría `navigation` y ahí ya no estaban.

  Es el mismo error que se cobró las rutas hace unas horas: confundir lo que el
  menú OFRECE con lo que EXISTE. Aquí van las que existen sin figurar, con la
  sección a la que pertenecen para que la lupa las sepa colocar.
*/
export const PANTALLAS_SIN_ENTRADA: Array<{
  label: string
  to: string
  grupo: string
  seccion: string
}> = [
  {
    label: 'Cargar artículos por planilla',
    to: '/app/inventario/articulos/carga',
    grupo: 'Inventario',
    seccion: 'Operación',
  },
  {
    label: 'Cargar personal por planilla',
    to: '/app/nomina/personal/carga',
    grupo: 'Nómina',
    seccion: 'Administración',
  },
  {
    label: 'Cargar proveedores por planilla',
    to: '/app/compras/proveedores/carga',
    grupo: 'Compras',
    seccion: 'Administración',
  },
  {
    label: 'Catálogo de artículos',
    to: '/app/inventario/articulos',
    grupo: 'Inventario',
    seccion: 'Operación',
  },
  {
    label: 'Movimientos de inventario',
    to: '/app/inventario/movimientos',
    grupo: 'Inventario',
    seccion: 'Operación',
  },
  {
    label: 'Talleres',
    to: '/app/inventario/talleres',
    grupo: 'Inventario',
    seccion: 'Operación',
  },
  {
    label: 'Facturas de proveedor',
    to: '/app/compras/facturas',
    grupo: 'Compras',
    seccion: 'Administración',
  },
  {
    label: 'Tabulador de cargos',
    to: '/app/nomina/tabulador',
    grupo: 'Nómina',
    seccion: 'Administración',
  },
  {
    label: 'Procesar nómina',
    to: '/app/nomina/procesos',
    grupo: 'Nómina',
    seccion: 'Administración',
  },
  {
    label: 'Recibos de pago',
    to: '/app/nomina/recibos',
    grupo: 'Nómina',
    seccion: 'Administración',
  },
  {
    label: 'Parámetros de nómina',
    to: '/app/nomina/parametros',
    grupo: 'Nómina',
    seccion: 'Administración',
  },
]

export const CLAVES_DE_BUSQUEDA: Record<string, string> = {
  '/app/inventario/articulos/carga':
    'cargar articulo articulos producto productos catalogo excel csv planilla plantilla lote masivo importar subir',
  '/app/nomina/personal/carga':
    'cargar personal trabajador trabajadores empleado empleados gente nomina excel csv planilla plantilla lote masivo importar subir',
  '/app/compras/proveedores/carga':
    'cargar proveedor proveedores suplidor excel csv planilla plantilla lote masivo importar subir',
  '/app/tasas': 'convertir calculadora conversor cambio divisa dolar euro usdt bcv paralelo binance',
  '/app/tesoreria/cuentas': 'banco caja billetera saldo dinero efectivo zelle binance traslado',
  '/app/tesoreria': 'movimientos ingresos egresos flujo',
  '/app/compras': 'orden pedido oc requisicion comprar',
  '/app/compras/proveedores': 'rif suplidor',
  '/app/compras/recepciones': 'recibir entrada mercancia llegada',
  '/app/compras/libro': 'iva impuesto seniat fiscal credito',
  '/app/ventas/facturacion': 'factura fac cobrar emitir',
  '/app/ventas/despachos': 'nota de entrega ne remision',
  '/app/ventas/clientes': 'rif comprador',
  '/app/ventas/libro': 'iva impuesto seniat fiscal debito',
  '/app/ventas/precios': 'tarifa lista precio',
  '/app/inventario/existencias': 'stock cuanto hay disponible',
  '/app/inventario/articulos': 'catalogo repuesto insumo herramienta epp material',
  '/app/organigrama': 'organizacion estructura jerarquia cargos quien depende de quien departamentos arbol',
  '/app/inventario/transferencias': 'mover traspaso entre almacenes',
  '/app/despachos/guias': 'permiso movilizacion ministerio guia',
  '/app/despachos/tickets': 'romana pesaje peso bruto tara',
  '/app/despachos/vehiculos': 'camion volteo chuto gandola placa chofer',
  '/app/maquinaria': 'excavadora cargador equipo horometro',
  '/app/maquinaria/mantenimientos': 'reparacion taller averia servicio',
  '/app/nomina/personal': 'trabajador empleado ficha cedula contratar incidencia enfermedad lesion ausencia accidente reposo conflicto dotacion asignacion',
  '/app/nomina/procesos': 'pagar quincena periodo calcular sueldo',
  '/app/nomina/recibos': 'recibo pago sueldo',
  '/app/nomina/prestaciones': 'antiguedad liquidacion intereses garantia',
  '/app/nomina/tabulador': 'cargo sueldo escala aumento',
  '/app/combustible': 'gasoil gasolina diesel surtir tanque',
  '/app/asignaciones': 'herramienta prestada quien tiene responsable',
  '/app/config/usuarios': 'permiso acceso clave rol alta',
  '/app/config/auditoria': 'quien hizo rastro historial cambios',
  '/app/explotacion/voladuras': 'explosivo barreno detonante',
  '/app/explotacion/produccion': 'turno tonelada extraccion',
}

/** El módulo al que pertenece una ruta. El panel es la raíz. */
export function moduloDeRuta(ruta: string): string {
  return MODULO_POR_PREFIJO.find(([prefijo]) => ruta.startsWith(prefijo))?.[1] ?? 'PANEL'
}

/**
 * Rutas que no pertenecen a ningún módulo y no se le cierran a nadie.
 *
 * Su cuenta y su clave las alcanza siempre, aunque le hayan cerrado todo lo
 * demás: un usuario al que se le quitaron los permisos mientras se resuelve
 * algo tiene que poder seguir cambiándose la clave.
 *
 * El manual va aquí por lo mismo visto al revés: no contiene ningún dato de la
 * empresa, solo explica cómo se usa el sistema. Cerrarlo por permisos no
 * protegería nada y dejaría sin instrucciones a quien acaba de llegar.
 */
const RUTAS_PROPIAS = ['/app/cuenta', '/app/manual']

export function esRutaPropia(ruta: string): boolean {
  return RUTAS_PROPIAS.some((prefijo) => ruta.startsWith(prefijo))
}

export interface NavSection {
  /** Ausente en el primer bloque: no se rotula lo que abre la lista. */
  label?: string
  items: NavItem[]
}

/**
 * El orden refleja el flujo del material, no el organigrama:
 * se extrae, se almacena, se compra lo que hace falta, se vende, se paga
 * a quien lo hizo y se concilia la plata.
 */
export const navigation: NavSection[] = [
  {
    items: [{ label: 'Panel', icon: Gauge, to: '/app' }],
  },
  {
    label: 'Operación',
    items: [
      {
        label: 'Explotación',
        icon: Pickaxe,
        fueraDelMvp: true,
        children: [
          { label: 'Tablero', to: '/app/explotacion' },
          { label: 'Frentes y bancos', to: '/app/explotacion/frentes' },
          { label: 'Voladuras', to: '/app/explotacion/voladuras' },
          { label: 'Producción por turno', to: '/app/explotacion/produccion' },
        ],
      },
      {
        // Va entre Explotación e Inventario porque ese es su sitio en la
        // jornada: la máquina trabaja en el frente y lo que consume sale del
        // patio. No tiene submenú — hay una sola pantalla y la pregunta que
        // trae a la gente es siempre la misma: cuál toca atender.
        label: 'Maquinaria',
        icon: Wrench,
        fueraDelMvp: true,
        children: [
          { label: 'Equipos', to: '/app/maquinaria' },
          // El historial es la vista al revés: no cada máquina y su última
          // reparación, sino qué ha pasado por el taller y qué costó.
          { label: 'Historial de taller', to: '/app/maquinaria/mantenimientos' },
        ],
      },
      {
        // El catálogo y los almacenes vivían en Configuración, y ahí no los
        // encontraba quien los usa: los mantiene el almacenista, no quien
        // administra el sistema. Lo que se guarda y dónde se guarda es
        // inventario, aunque no se mueva todos los días.
        label: 'Inventario',
        icon: Boxes,
        /*
          CUATRO ENTRADAS DONDE HABÍA OCHO

          Christopher lo pidió así: «simplificar, disminuir, unificar la
          cantidad de elementos o pasos para una acción». Ocho entradas para un
          módulo obligan a decidir ocho veces antes de hacer una sola cosa.

          Lo que se fue no desapareció: se agrupó donde se usa.

            Existencias  ← existencias, catálogo y movimientos, en pestañas.
                           Son tres miradas al mismo material: cuánto hay, qué
                           puede haber, y qué le pasó.
            Almacenes    ← almacenes y talleres. Un taller es un almacén con
                           máquinas dentro; separarlos obligaba a saber de
                           antemano en cuál de los dos estaba lo que se busca.

          «Cargar por planilla» deja de ser pestaña y pasa a ser un botón
          dentro del catálogo, que es donde se está cuando hace falta. Su
          dirección sigue viva.
        */
        children: [
          { label: 'Tablero', to: '/app/inventario' },
          { label: 'Existencias', to: '/app/inventario/existencias' },
          { label: 'Transferencias', to: '/app/inventario/transferencias' },
          { label: 'Almacenes y talleres', to: '/app/inventario/almacenes' },
        ],
      },
      {
        /*
          Módulo propio por lo mismo que Asignaciones: quien está en la bomba
          no tiene por qué poder tocar el almacén general, y quien lleva el
          almacén no necesariamente despacha combustible.

          Va pegado a Maquinaria porque el número que justifica el módulo —los
          litros por hora— sale de cruzar lo despachado con el horómetro.
        */
        label: 'Combustible',
        icon: Fuel,
        fueraDelMvp: true,
        to: '/app/combustible',
      },
      {
        /*
          Módulo propio y no una pantalla de inventario.

          Lo asignado sale de un almacén, sí, pero la otra mitad del asunto es
          una persona: quién lo tiene y de quién es la responsabilidad si no
          vuelve. Colgado de Inventario el permiso quedaba mal en las dos
          puntas — quien lleva personal necesitaba acceso al almacén, y
          cualquiera con acceso al almacén podía entregar cosas a nombre de un
          trabajador.
        */
        label: 'Asignaciones',
        icon: HandHelping,
        fueraDelMvp: true,
        children: [
          { label: 'Quién tiene qué', to: '/app/asignaciones' },
          { label: 'Incidencias', to: '/app/asignaciones/incidencias' },
        ],
      },
      {
        label: 'Despachos',
        icon: Truck,
        fueraDelMvp: true,
        children: [
          { label: 'Tablero', to: '/app/despachos' },
          { label: 'Tickets de romana', to: '/app/despachos/tickets' },
          // "De movilización" y no "de despacho": es el permiso del ministerio
          // para que el camión circule con el mineral, no el papel que se le
          // entrega al cliente. Ese es la nota de entrega y vive en Ventas.
          { label: 'Guías de movilización', to: '/app/despachos/guias' },
          // Los da de alta quien ve llegar el camión, no quien administra el
          // sistema; en Configuración nadie los cargaría y la placa seguiría
          // escribiéndose a mano.
          { label: 'Vehículos', to: '/app/despachos/vehiculos' },
        ],
      },
    ],
  },
  {
    label: 'Administración',
    items: [
      {
        label: 'Compras',
        icon: ShoppingCart,
        children: [
          // El tablero es la pantalla del módulo: una tarjeta por compra,
          // desde que alguien la pide hasta que llega el material. No hay
          // "requisiciones" por un lado y "órdenes" por otro, porque quien
          // compra no piensa en dos documentos sino en una sola compra.
          { label: 'Tablero', to: '/app/compras' },
          // Las facturas del proveedor pasan a ser pestaña de Proveedores: una
          // factura pertenece a alguien, y es ahí donde se busca. Como entrada
          // suelta invitaba a registrarla sin decir contra qué orden.
          { label: 'Proveedores', to: '/app/compras/proveedores' },
          { label: 'Recepciones', to: '/app/compras/recepciones' },
          // El libro cuelga de Compras y no de un módulo fiscal propio porque
          // quien lo saca es quien cargó las facturas, y porque así el permiso
          // que ya gobierna las facturas gobierna también su libro.
          { label: 'Libro de compras', to: '/app/compras/libro' },
        ],
      },
      {
        // El orden es el del camino del material hacia afuera: se registra al
        // cliente, se le pone precio a lo que se vende, se cotiza, sale el
        // camión con su nota y al final se factura. Puesto al revés —empezando
        // por facturación, que es lo que más se usa— la primera semana nadie
        // encuentra dónde se carga un cliente.
        label: 'Ventas',
        icon: ClipboardList,
        fueraDelMvp: true,
        children: [
          // El tablero va primero y se llama igual que el de compras: los dos
          // modulos son hermanos y quien aprende uno no deberia reaprender el
          // otro. Antes la primera entrada era Clientes, y quien
          // entra a Ventas quiere vender, no abrir una lista de clientes. El
          // menu nombraba siete documentos y ninguno decia por donde se
          // empieza.
          { label: 'Tablero', to: '/app/ventas' },
          { label: 'Clientes', to: '/app/ventas/clientes' },
          { label: 'Lista de precios', to: '/app/ventas/precios' },
          { label: 'Cotizaciones', to: '/app/ventas/cotizaciones' },
          { label: 'Notas de entrega', to: '/app/ventas/despachos' },
          { label: 'Facturación', to: '/app/ventas/facturacion' },
          { label: 'Notas de crédito', to: '/app/ventas/notas-credito' },
          { label: 'Libro de ventas', to: '/app/ventas/libro' },
        ],
      },
      {
        label: 'Nómina',
        icon: Users,
        children: [
          { label: 'Tablero', to: '/app/nomina' },
          // La gente y lo que cobra su cargo: quién trabaja aquí y cuánto le
          // toca por serlo. Se consultan juntas porque la respuesta de una es
          // la pregunta de la otra.
          { label: 'Personal', to: '/app/nomina/personal' },
          // El período, en el orden en que se hace: se anotan las novedades,
          // se calcula, y salen los recibos. Tres pasos de una misma tarea,
          // que como entradas sueltas obligaban a recordar cuál iba primero.
          { label: 'Nómina del período', to: '/app/nomina/asistencia' },
          // Lo que no cambia cada quincena: las reglas del cálculo y la deuda
          // de prestaciones, que se tocan de mes en mes.
          { label: 'Prestaciones y parámetros', to: '/app/nomina/prestaciones' },
        ],
      },
      {
        /*
          Sección propia y no una pantalla dentro de Nómina, que es como lo
          pidió la líder de sistemas. El permiso sí es el de Nómina: quien
          lleva el personal es quien sabe de quién depende quién.
        */
        label: 'Organigrama',
        icon: Network,
        fueraDelMvp: true,
        to: '/app/organigrama',
      },
      {
        label: 'Tesorería',
        icon: Landmark,
        fueraDelMvp: true,
        children: [
          { label: 'Tablero', to: '/app/tesoreria' },
          { label: 'Bancos y cajas', to: '/app/tesoreria/cuentas' },
          { label: 'Pagos por hacer', to: '/app/tesoreria/pagos' },
          { label: 'Cuentas por pagar', to: '/app/tesoreria/por-pagar' },
          { label: 'Libro de tesorería', to: '/app/tesoreria/movimientos' },
          { label: 'Cuentas por cobrar', to: '/app/tesoreria/por-cobrar' },
        ],
      },
    ],
  },
  {
    label: 'Sistema',
    items: [
      {
        label: 'Tasas de cambio',
        icon: Banknote,
        to: '/app/tasas',
      },
      {
        label: 'Configuración',
        icon: Settings,
        children: [
          // Igual que en los demás módulos: la primera entrada es el tablero.
          // Configuración era el único que abría directamente en una lista, y
          // una lista no dice si lo que hay debajo está bien puesto.
          { label: 'Tablero', to: '/app/config' },
          { label: 'Usuarios y roles', to: '/app/config/usuarios' },
          { label: 'Datos de la empresa', to: '/app/config/empresa' },
          { label: 'Documentos legales', to: '/app/config/documentos' },
          { label: 'Auditoría', to: '/app/config/auditoria', soloAdmin: true },
          { label: 'Respaldo de la base', to: '/app/config/respaldo' },
        ],
      },
      {
        // Al final de todo el menú, que es donde se busca la ayuda en cualquier
        // programa. No se abre a diario, pero el día que hace falta se necesita
        // encontrar sin preguntarle a nadie: para eso está.
        label: 'Manual de usuario',
        fueraDelMvp: true,
        icon: BookOpen,
        to: '/app/manual',
        siempre: true,
      },
    ],
  },
]

/*
  LAS DIRECCIONES DE LO QUE QUEDÓ FUERA DEL MVP

  Se calculan del propio menú y no se escriben a mano: si mañana un módulo
  vuelve al riel, basta con quitarle el marbete y esta lista se entera sola.
  Una lista paralela sería justo la que alguien olvida actualizar, y entonces
  un módulo volvería al menú pero seguiría dando la pantalla de obra.
*/
const FUERA_DEL_MVP: string[] = navigation
  .flatMap((seccion) => seccion.items)
  .filter((item) => item.fueraDelMvp)
  .flatMap((item) => [item.to, ...(item.children ?? []).map((hijo) => hijo.to)])
  .filter((ruta): ruta is string => Boolean(ruta))

/**
 * ¿Esta dirección es de algo que hoy no se ofrece?
 *
 * Se compara por prefijo con la barra detrás, no con `startsWith` a secas:
 * `/app/ventas` no debe atrapar una hipotética `/app/ventasexpress`, y sí
 * tiene que atrapar `/app/ventas/clientes`.
 */
export function esRutaFueraDelMvp(ruta: string): boolean {
  return FUERA_DEL_MVP.some((base) => ruta === base || ruta.startsWith(base + '/'))
}
