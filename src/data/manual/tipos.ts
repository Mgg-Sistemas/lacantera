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
  { id: 'TODAS', label: 'Todo el sistema', descripcion: 'Todas las áreas y módulos operativos' },
  { id: 'COMPRAS_RETENCIONES', label: 'Compras y Retenciones', descripcion: 'Órdenes de compra, facturas fiscales, retenciones R14 y reintegros' },
  { id: 'FACTURACION_VENTAS', label: 'Facturación y Ventas', descripcion: 'Cotizaciones, notas de entrega, clientes y cuentas por cobrar' },
  { id: 'ROMANA_DESPACHOS', label: 'Romana y Despachos', descripcion: 'Pesaje, formatos de salida autorizada, acarreos y viajes' },
  { id: 'INVENTARIO_ALMACEN', label: 'Inventario y Almacenes', descripcion: 'Recepciones, existencias de materiales, almacenes y traslados' },
  { id: 'EXPLOTACION_MINA', label: 'Explotación y Mina', descripcion: 'Plantas, extracción, tolvas y producción diaria' },
  { id: 'COMBUSTIBLE_MAQUINAS', label: 'Combustible y Maquinaria', descripcion: 'Surtidor de diésel, horómetros y estado de flota' },
  { id: 'NOMINA_PERSONAL', label: 'Nómina y Asistencia', descripcion: 'Trabajadores, carga masiva Banco del Tesoro y control diario' },
  { id: 'TESORERIA_TASAS', label: 'Tesorería y Tasas', descripcion: 'Cuentas bancarias, pagos, feriados bancarios y tasa BCV' },
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
