export type AreaOperativa =
  | 'TODAS'
  | 'COMPRAS_RETENCIONES'
  | 'FACTURACION_VENTAS'
  | 'ROMANA_DESPACHOS'
  | 'INVENTARIO_ALMACEN'
  | 'EXPLOTACION_MINA'
  | 'COMBUSTIBLE_MAQUINAS'
  | 'NOMINA_PERSONAL'
  | 'TESORERIA_TASAS'

export interface AreaInfo {
  id: AreaOperativa
  label: string
  descripcion: string
}

export const AREAS_OPERATIVAS: AreaInfo[] = [
  { id: 'TODAS', label: 'Todo el sistema', descripcion: 'Todas las áreas' },
  { id: 'COMPRAS_RETENCIONES', label: '🛒 Compras y Retenciones', descripcion: 'Compras, facturas, retenciones y reintegros' },
  { id: 'FACTURACION_VENTAS', label: '🧾 Facturación y Ventas', descripcion: 'Cotizaciones, notas de despacho y cobros' },
  { id: 'ROMANA_DESPACHOS', label: '⚖️ Romana y Despachos', descripcion: 'Pesaje, formatos de salida y viajes' },
  { id: 'INVENTARIO_ALMACEN', label: '📦 Almacén e Inventario', descripcion: 'Recepciones, existencias y traslados' },
  { id: 'EXPLOTACION_MINA', label: '⛏️ Mina y Producción', descripcion: 'Plantas, extracción y producción' },
  { id: 'COMBUSTIBLE_MAQUINAS', label: '⛽ Combustible y Flota', descripcion: 'Surtidor, horómetros y máquinas' },
  { id: 'NOMINA_PERSONAL', label: '👥 Personal y Nómina', descripcion: 'Trabajadores, asistencias y pagos' },
  { id: 'TESORERIA_TASAS', label: '💵 Bancos y Tasas', descripcion: 'Cuentas, feriados bancarios y BCV' },
]

export interface PasoGuia {
  numero: number
  titulo: string
  detalle: string
  boton?: string
  ruta?: string
}

export interface GuiaPasoAPaso {
  id: string
  titulo: string
  area: AreaOperativa
  rolRequerido: string
  rutaMenu: string
  rutaDirecta?: string
  resumen: string
  pasos: PasoGuia[]
  resultado: string
  revertir: string
  palabrasClave: string[]
}

export interface PreguntaFrecuente {
  id: string
  pregunta: string
  area: AreaOperativa
  respuestaCorta: string
  causaRaiz: string
  accionSolucion: string
  rutaRecomendada?: string
  textoRuta?: string
  alertaMensaje?: string
  palabrasClave: string[]
}
