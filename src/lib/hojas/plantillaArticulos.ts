/*
  LA PLANTILLA QUE SE REPARTE

  Se entrega en CSV y no en `.xlsx` a propósito: Excel lo abre de un doble clic
  y escribirlo no obliga a arrastrar una librería de medio megabyte al paquete.
  Quien luego lo guarde como `.xlsx` tampoco tiene problema — `leerHoja` sabe
  leer los dos.

  Va con punto y coma y con BOM. Sin el BOM, Excel en Windows abre el archivo
  en la codificación del sistema y las tildes salen rotas; con punto y coma,
  Excel en español reparte las columnas solo en vez de meterlo todo en la A.

  La plantilla trae dos filas de ejemplo. No es adorno: enseña de un vistazo
  cómo se escribe un número —sin separador de miles—, qué se pone en una
  columna que se deja vacía, y que un servicio no es inventariable. Se borran y
  se escriben los propios encima.
*/

export const COLUMNAS_ARTICULOS = [
  'codigo',
  'nombre',
  'descripcion',
  'categoria',
  'unidad',
  'inventariable',
  'modo_entrega',
  'stock_minimo',
  'densidad_ton_m3',
  'precio',
  'precio_minimo',
  'moneda',
] as const

/** Lo que dice cada columna, para la leyenda de la pantalla. */
export const AYUDA_COLUMNAS: Array<{
  columna: string
  obligatoria: boolean
  dice: string
}> = [
  { columna: 'codigo', obligatoria: true, dice: 'El código con el que se pide. Si ya existe, la fila lo actualiza en vez de crearlo.' },
  { columna: 'nombre', obligatoria: true, dice: 'Cómo se llama.' },
  { columna: 'descripcion', obligatoria: false, dice: 'Detalle. Si se deja vacía en un artículo que ya existe, se respeta la que tenía.' },
  { columna: 'categoria', obligatoria: true, dice: 'PRODUCTO, REPUESTO, INSUMO, COMBUSTIBLE, LUBRICANTE, EPP, HERRAMIENTA, EXPLOSIVO o SERVICIO.' },
  { columna: 'unidad', obligatoria: true, dice: 'UND, M3, TON, KG, L, GAL, M, PAR, JGO, CAJA, SACO, ROLLO, HORA o SERV.' },
  { columna: 'inventariable', obligatoria: false, dice: 'SI o NO. Vacío es SI. Un SERVICIO tiene que ser NO.' },
  { columna: 'modo_entrega', obligatoria: false, dice: 'Qué pasa al entregarlo: RETORNABLE vuelve, CONSUMIBLE se gasta, NO es que no se entrega a nadie. Vacío es CONSUMIBLE.' },
  { columna: 'stock_minimo', obligatoria: false, dice: 'A partir de cuánto avisa. Vacío es cero, que es no avisar.' },
  { columna: 'densidad_ton_m3', obligatoria: false, dice: 'Toneladas por metro cúbico. Solo para lo que se pesa y se mide de las dos formas.' },
  { columna: 'precio', obligatoria: false, dice: 'Precio de venta. Poner precio exige permiso de escritura en Ventas.' },
  { columna: 'precio_minimo', obligatoria: false, dice: 'Lo más bajo que se puede vender. Vacío es cero: sin suelo.' },
  { columna: 'moneda', obligatoria: false, dice: 'La moneda del precio. Vacío es USD.' },
]

const EJEMPLOS = [
  {
    codigo: 'PRD-ARENA-L',
    nombre: 'Arena lavada',
    descripcion: 'Granulometria fina, patio 1',
    categoria: 'PRODUCTO',
    unidad: 'M3',
    inventariable: 'SI',
    modo_entrega: 'CONSUMIBLE',
    stock_minimo: '50',
    densidad_ton_m3: '1.6',
    precio: '18.50',
    precio_minimo: '16',
    moneda: 'USD',
  },
  {
    codigo: 'SRV-FLETE',
    nombre: 'Flete por viaje',
    descripcion: '',
    categoria: 'SERVICIO',
    unidad: 'SERV',
    inventariable: 'NO',
    modo_entrega: 'NO',
    stock_minimo: '',
    densidad_ton_m3: '',
    precio: '40',
    precio_minimo: '',
    moneda: 'USD',
  },
]

/** Un campo con separador, comillas o salto dentro va entrecomillado. */
function escapar(valor: string): string {
  return /[;"\n\r]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor
}

export function plantillaArticulosCsv(): string {
  const lineas = [
    COLUMNAS_ARTICULOS.join(';'),
    ...EJEMPLOS.map((e) =>
      COLUMNAS_ARTICULOS.map((c) => escapar(e[c as keyof typeof e] ?? '')).join(';'),
    ),
  ]
  // El BOM va delante, o Excel en Windows rompe las tildes.
  return '﻿' + lineas.join('\r\n') + '\r\n'
}

export function descargarPlantillaArticulos(): void {
  const blob = new Blob([plantillaArticulosCsv()], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'plantilla-articulos.csv'
  a.click()
  URL.revokeObjectURL(url)
}
