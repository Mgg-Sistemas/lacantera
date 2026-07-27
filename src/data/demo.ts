/**
 * Datos de demostración.
 *
 * Existen solo para que las pantallas tengan forma antes de conectar la base
 * de datos. Las cifras son verosímiles para una cantera mediana: producción
 * de ~1.500 t/día, ~40 trabajadores, despachos de batea (18-24 m³) y volteo
 * (6-12 m³). Cuando entre Supabase, este archivo desaparece.
 */

export interface Producto {
  codigo: string
  nombre: string
  existenciaTon: number
  capacidadTon: number
  produccionDiaTon: number
}

export const productos: Producto[] = [
  {
    codigo: 'PP1',
    nombre: 'Piedra picada #1',
    existenciaTon: 3410,
    capacidadTon: 4500,
    produccionDiaTon: 412,
  },
  {
    codigo: 'PP2',
    nombre: 'Piedra picada #2',
    existenciaTon: 2760,
    capacidadTon: 4000,
    produccionDiaTon: 338,
  },
  {
    codigo: 'ARL',
    nombre: 'Arena lavada',
    existenciaTon: 2180,
    capacidadTon: 3500,
    produccionDiaTon: 296,
  },
  {
    codigo: 'ARR',
    nombre: 'Arrocillo',
    existenciaTon: 1240,
    capacidadTon: 2500,
    produccionDiaTon: 184,
  },
  {
    codigo: 'POL',
    nombre: 'Polvillo',
    existenciaTon: 860,
    capacidadTon: 2000,
    produccionDiaTon: 152,
  },
  {
    codigo: 'GRZ',
    nombre: 'Granzón',
    existenciaTon: 940,
    capacidadTon: 3000,
    produccionDiaTon: 98,
  },
]

export interface Despacho {
  guia: string
  cliente: string
  producto: string
  toneladas: number
  vehiculo: string
  hora: string
  estado: 'Pesado' | 'En ruta' | 'Entregado'
}

export const despachosRecientes: Despacho[] = [
  {
    guia: 'GD-04812',
    cliente: 'Constructora Caroní',
    producto: 'Piedra picada #1',
    toneladas: 31.4,
    vehiculo: 'A72J4T',
    hora: '10:42',
    estado: 'En ruta',
  },
  {
    guia: 'GD-04811',
    cliente: 'Premezclados Orinoco',
    producto: 'Arena lavada',
    toneladas: 28.9,
    vehiculo: 'A18K9P',
    hora: '10:15',
    estado: 'En ruta',
  },
  {
    guia: 'GD-04810',
    cliente: 'Vialidad Bolívar C.A.',
    producto: 'Granzón',
    toneladas: 22.1,
    vehiculo: 'A55M2R',
    hora: '09:48',
    estado: 'Entregado',
  },
  {
    guia: 'GD-04809',
    cliente: 'Constructora Caroní',
    producto: 'Piedra picada #2',
    toneladas: 30.7,
    vehiculo: 'A72J4T',
    hora: '09:12',
    estado: 'Entregado',
  },
  {
    guia: 'GD-04808',
    cliente: 'Bloquera San Félix',
    producto: 'Polvillo',
    toneladas: 12.3,
    vehiculo: 'A09B7L',
    hora: '08:35',
    estado: 'Entregado',
  },
]

export interface PendienteAprobacion {
  documento: string
  descripcion: string
  solicitante: string
  montoUsd: number
  nivel: string
  urgente: boolean
}

export const pendientesAprobacion: PendienteAprobacion[] = [
  {
    documento: 'OC-01942',
    descripcion: 'Muelas de trituradora primaria',
    solicitante: 'Mantenimiento',
    montoUsd: 18400,
    nivel: 'Requiere 3 niveles',
    urgente: true,
  },
  {
    documento: 'REQ-00871',
    descripcion: 'Gasoil — 12.000 L',
    solicitante: 'Operaciones',
    montoUsd: 9600,
    nivel: 'Requiere 3 niveles',
    urgente: true,
  },
  {
    documento: 'OC-01941',
    descripcion: 'Neumáticos 29.5R25 (4 und.)',
    solicitante: 'Mantenimiento',
    montoUsd: 21200,
    nivel: 'Requiere 3 niveles',
    urgente: false,
  },
  {
    documento: 'REQ-00869',
    descripcion: 'Dotación de EPP — trimestre',
    solicitante: 'Seguridad industrial',
    montoUsd: 2850,
    nivel: 'Requiere 2 niveles',
    urgente: false,
  },
]

export interface Alerta {
  tono: 'danger' | 'warning' | 'info'
  titulo: string
  detalle: string
}

export const alertas: Alerta[] = [
  {
    tono: 'danger',
    titulo: 'Permiso DAEX vence en 12 días',
    detalle: 'Sin permiso vigente no se puede emitir orden de compra de explosivos.',
  },
  {
    tono: 'warning',
    titulo: 'Polvillo por debajo del mínimo',
    detalle: '860 t contra un mínimo de 1.000 t. Hay 3 pedidos comprometidos.',
  },
  {
    tono: 'warning',
    titulo: 'Conteo de combustible sin cuadrar',
    detalle: 'Diferencia de 380 L entre aforo y existencia teórica del tanque 2.',
  },
  {
    tono: 'info',
    titulo: 'Nómina semanal cierra mañana',
    detalle: '38 obreros. Faltan 4 marcajes de asistencia por validar.',
  },
]

/** Producción de los últimos 7 días, en toneladas. */
export const produccionSemana = [
  { dia: 'Lun', toneladas: 1482 },
  { dia: 'Mar', toneladas: 1610 },
  { dia: 'Mié', toneladas: 1394 },
  { dia: 'Jue', toneladas: 1728 },
  { dia: 'Vie', toneladas: 1655 },
  { dia: 'Sáb', toneladas: 980 },
  { dia: 'Hoy', toneladas: 1480 },
]
