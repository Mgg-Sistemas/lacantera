import { comoNumero } from '@/lib/formato'
import type { FilaDePago } from '@/lib/api/pagosBancarios'

/*
  LEER LOS PAGOS QUE SE PEGAN DE EXCEL O LLEGAN EN UN ARCHIVO.

  La fuente es la planilla de la caja («Caja principal multimonedas»): fecha,
  año-mes, movimiento, moneda, monto, tasa, conversión a $, descripción y de
  dónde proviene. Al copiar celdas de Excel o de Google Sheets llega texto
  separado por tabuladores; un .csv llega separado por punto y coma (Excel en
  español) o por comas. Una descripción de varias líneas viene entre comillas
  y no parte la fila.

  Con encabezado, las columnas se buscan por su nombre; sin encabezado, se
  asume el orden de la planilla de la caja. Lo que no es una venta —nómina,
  préstamos entre empresas, intereses, saldo inicial, traspasos— llega
  desmarcado: se ve en la vista previa y quien importa decide.
*/

export interface FilaLeida {
  fila: FilaDePago
  incluir: boolean
  problema: string | null
  texto: string
}

const NO_ES_VENTA = /n[oó]mina|pr[eé]stamo|inter[eé]s|interest|saldo inicial|traspaso/i

/** Parte el texto en filas y celdas respetando comillas, que pueden traer saltos de línea. */
export function partirEnCeldas(texto: string): string[][] {
  const primera = texto.split(/\r?\n/).find((l) => l.trim() !== '') ?? ''
  const sep = primera.includes('\t') ? '\t' : primera.includes(';') ? ';' : ','

  const filas: string[][] = []
  let fila: string[] = []
  let celda = ''
  let entreComillas = false

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') {
        celda += '"'
        i++
      } else if (c === '"') {
        entreComillas = false
      } else {
        celda += c
      }
      continue
    }
    if (c === '"' && celda.trim() === '') {
      entreComillas = true
    } else if (c === sep) {
      fila.push(celda)
      celda = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      fila.push(celda)
      filas.push(fila)
      fila = []
      celda = ''
    } else {
      celda += c
    }
  }
  fila.push(celda)
  filas.push(fila)

  return filas
    .map((f) => f.map((x) => x.replace(/\s+/g, ' ').trim()))
    .filter((f) => f.some((x) => x !== ''))
}

/** dd-mm-aa, dd/mm/aaaa o aaaa-mm-dd → aaaa-mm-dd. */
export function leerFecha(bruto: string): string | null {
  const s = bruto.trim()
  let d: number, m: number, a: number
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  const local = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/)
  if (iso) {
    a = Number(iso[1])
    m = Number(iso[2])
    d = Number(iso[3])
  } else if (local) {
    d = Number(local[1])
    m = Number(local[2])
    a = Number(local[3])
    if (a < 100) a += 2000
  } else {
    return null
  }
  const fecha = new Date(Date.UTC(a, m - 1, d))
  if (fecha.getUTCFullYear() !== a || fecha.getUTCMonth() !== m - 1 || fecha.getUTCDate() !== d) {
    return null
  }
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Monto con punto o coma; «1.050» sin decimales se lee como mil cincuenta. */
export function leerMonto(bruto: string): number {
  const limpio = bruto.replace(/[^0-9.,-]/g, '')
  if (/^\d{1,3}(\.\d{3})+$/.test(limpio)) return Number(limpio.replace(/\./g, ''))
  const n = Number(comoNumero(limpio))
  return Number.isFinite(n) ? n : 0
}

export function leerMoneda(bruto: string): string {
  const s = bruto.toUpperCase()
  if (s.includes('USDT')) return 'USDT'
  if (s.includes('EUR') || s.includes('€')) return 'EUR'
  if (s.includes('USD') || s.includes('$')) return 'USD'
  return 'VES'
}

function leerReferencia(descripcion: string): string | null {
  const m = descripcion.match(/REF\s*[:=]?\s*([0-9A-Z-]{3,})/i)
  return m ? m[1] : null
}

interface Columnas {
  fecha: number
  moneda: number
  monto: number
  tasa: number
  descripcion: number
  referencia: number
  movimiento: number
  desde: number
}

/** La planilla de la caja, sin encabezado. */
const ORDEN_DE_LA_CAJA: Columnas = {
  fecha: 0, movimiento: 2, moneda: 3, monto: 4, tasa: 5, descripcion: 7, desde: 8, referencia: -1,
}

/** Tres o cuatro columnas sueltas: fecha, monto, referencia, descripción. */
const ORDEN_CORTO: Columnas = {
  fecha: 0, monto: 1, referencia: 2, descripcion: 3, moneda: -1, tasa: -1, movimiento: -1, desde: -1,
}

function columnasDelEncabezado(fila: string[]): Columnas | null {
  const buscar = (re: RegExp) => fila.findIndex((c) => re.test(c))
  const fecha = buscar(/^(bb|fecha)\b|fecha/i)
  const monto = buscar(/^monto/i)
  if (fecha === -1 || monto === -1) return null
  return {
    fecha,
    monto,
    moneda: buscar(/moneda/i),
    tasa: buscar(/^tasa/i),
    descripcion: buscar(/descrip|nombre|concepto/i),
    referencia: buscar(/^ref/i),
    movimiento: buscar(/movimiento|tipo/i),
    desde: buscar(/desde|proviene/i),
  }
}

export function leerPagosDelBanco(texto: string, hoy: string): FilaLeida[] {
  const filas = partirEnCeldas(texto)
  if (filas.length === 0) return []

  const encabezado = columnasDelEncabezado(filas[0])
  const cols = encabezado ?? (filas[0].length >= 5 ? ORDEN_DE_LA_CAJA : ORDEN_CORTO)
  const cuerpo = encabezado ? filas.slice(1) : filas

  const celda = (f: string[], i: number) => (i >= 0 ? (f[i] ?? '') : '')

  return cuerpo
    .filter((f) => !columnasDelEncabezado(f))
    .map((f) => {
      const fecha = leerFecha(celda(f, cols.fecha))
      const monto = leerMonto(celda(f, cols.monto))
      const moneda = cols.moneda >= 0 ? leerMoneda(celda(f, cols.moneda)) : 'VES'
      const tasaLeida = leerMonto(celda(f, cols.tasa))
      const descripcion = celda(f, cols.descripcion)
      const referencia = celda(f, cols.referencia) || leerReferencia(descripcion)
      const movimiento = celda(f, cols.movimiento)
      const desde = celda(f, cols.desde)

      let problema: string | null = null
      if (!fecha) problema = 'La fecha no se entiende.'
      else if (fecha > hoy) problema = 'La fecha es futura.'
      else if (!(monto > 0)) problema = 'No trae monto.'

      const noEsVenta = NO_ES_VENTA.test(`${descripcion} ${desde}`) || /salida/i.test(movimiento)

      return {
        fila: {
          fecha: fecha ?? '',
          moneda,
          monto: Math.round(monto * 100) / 100,
          tasa: moneda === 'USD' || !(tasaLeida > 0) ? null : tasaLeida,
          referencia: referencia || null,
          descripcion: descripcion.slice(0, 300) || null,
        },
        incluir: problema === null && !noEsVenta,
        problema,
        texto: f.join(' · '),
      }
    })
}
