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
        label: 'Inventario',
        icon: Boxes,
        children: [
          { label: 'Existencias', to: '/app/inventario/existencias' },
          { label: 'Movimientos', to: '/app/inventario/movimientos' },
          { label: 'Conteos físicos', to: '/app/inventario/conteos' },
          { label: 'Transferencias', to: '/app/inventario/transferencias' },
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
        label: 'Ventas',
        icon: ClipboardList,
        children: [
          { label: 'Clientes', to: '/app/ventas/clientes' },
          { label: 'Cotizaciones', to: '/app/ventas/cotizaciones' },
          { label: 'Facturación', to: '/app/ventas/facturacion' },
        ],
      },
      {
        label: 'Nómina',
        icon: Users,
        children: [
          { label: 'Personal', to: '/app/nomina/personal' },
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
          { label: 'Catálogo de artículos', to: '/app/config/articulos' },
          { label: 'Almacenes y patios', to: '/app/config/almacenes' },
          { label: 'Parámetros fiscales', to: '/app/config/fiscal' },
        ],
      },
    ],
  },
]
