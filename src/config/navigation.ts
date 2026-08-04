import {
  Banknote,
  Boxes,
  ClipboardList,
  Gauge,
  Landmark,
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
  ['/app/config/usuarios', 'USUARIOS'],
  ['/app/explotacion', 'EXPLOTACION'],
  ['/app/inventario', 'INVENTARIO'],
  ['/app/despachos', 'DESPACHOS'],
  ['/app/compras', 'COMPRAS'],
  ['/app/ventas', 'VENTAS'],
  ['/app/nomina', 'NOMINA'],
  ['/app/tesoreria', 'TESORERIA'],
  ['/app/tasas', 'TASAS'],
  ['/app/config', 'CONFIGURACION'],
]

/** El módulo al que pertenece una ruta. El panel es la raíz. */
export function moduloDeRuta(ruta: string): string {
  return MODULO_POR_PREFIJO.find(([prefijo]) => ruta.startsWith(prefijo))?.[1] ?? 'PANEL'
}

/**
 * Rutas que no son de ningún módulo porque son de la persona.
 *
 * Su cuenta y su clave las alcanza siempre, aunque le hayan cerrado todo lo
 * demás: un usuario al que se le quitaron los permisos mientras se resuelve
 * algo tiene que poder seguir cambiándose la clave.
 */
const RUTAS_PROPIAS = ['/app/cuenta']

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
        children: [
          { label: 'Frentes y bancos', to: '/app/explotacion/frentes' },
          { label: 'Voladuras', to: '/app/explotacion/voladuras' },
          { label: 'Producción por turno', to: '/app/explotacion/produccion' },
        ],
      },
      {
        // El catálogo y los almacenes vivían en Configuración, y ahí no los
        // encontraba quien los usa: los mantiene el almacenista, no quien
        // administra el sistema. Lo que se guarda y dónde se guarda es
        // inventario, aunque no se mueva todos los días.
        label: 'Inventario',
        icon: Boxes,
        children: [
          { label: 'Existencias', to: '/app/inventario/existencias' },
          { label: 'Movimientos', to: '/app/inventario/movimientos' },
          { label: 'Transferencias', to: '/app/inventario/transferencias' },
          { label: 'Catálogo de artículos', to: '/app/inventario/articulos' },
          { label: 'Almacenes y patios', to: '/app/inventario/almacenes' },
        ],
      },
      {
        label: 'Despachos',
        icon: Truck,
        children: [
          { label: 'Tickets de romana', to: '/app/despachos/tickets' },
          { label: 'Guías de despacho', to: '/app/despachos/guias' },
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
          { label: 'Proveedores', to: '/app/compras/proveedores' },
          { label: 'Recepciones', to: '/app/compras/recepciones' },
          { label: 'Facturas de proveedor', to: '/app/compras/facturas' },
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
        children: [
          { label: 'Clientes', to: '/app/ventas/clientes' },
          { label: 'Lista de precios', to: '/app/ventas/precios' },
          { label: 'Cotizaciones', to: '/app/ventas/cotizaciones' },
          { label: 'Notas de entrega', to: '/app/ventas/despachos' },
          { label: 'Facturación', to: '/app/ventas/facturacion' },
        ],
      },
      {
        label: 'Nómina',
        icon: Users,
        children: [
          { label: 'Personal', to: '/app/nomina/personal' },
          { label: 'Tabulador de cargos', to: '/app/nomina/tabulador' },
          { label: 'Novedades del período', to: '/app/nomina/asistencia' },
          { label: 'Procesar nómina', to: '/app/nomina/procesos' },
          { label: 'Recibos de pago', to: '/app/nomina/recibos' },
          { label: 'Parámetros de nómina', to: '/app/nomina/parametros' },
          { label: 'Prestaciones sociales', to: '/app/nomina/prestaciones' },
        ],
      },
      {
        label: 'Tesorería',
        icon: Landmark,
        children: [
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
          { label: 'Usuarios y roles', to: '/app/config/usuarios' },
          { label: 'Datos de la empresa', to: '/app/config/empresa' },
          { label: 'Documentos legales', to: '/app/config/documentos' },
          { label: 'Auditoría', to: '/app/config/auditoria', soloAdmin: true },
        ],
      },
    ],
  },
]
