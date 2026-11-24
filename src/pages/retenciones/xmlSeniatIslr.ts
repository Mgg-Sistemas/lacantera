import type { RetencionItem } from '@/lib/api/retenciones'

export interface EntradaXmlIslr {
  rifAgente: string
  razonSocial: string
  /** Mes de las operaciones en formato AAAAMM (ej. 202611). */
  periodo: string
  filas: RetencionItem[]
}

export interface ResultadoXmlIslr {
  nombre: string
  contenido: string
  /** Cantidad de retenciones incluidas. */
  lineas: number
  /** Validaciones que impiden generar el archivo válido ante el SENIAT. */
  faltan: string[]
}

const rifLimpio = (v: string | null | undefined) =>
  String(v ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

const ascii = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()

const montoStr = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2)

const escapeXml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

/** Convierte una cadena a bytes ISO-8859-1 (Latin-1) para que el archivo coincida con el prólogo XML del SENIAT. */
export function bytesIso88591(s: string): Uint8Array {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    out[i] = code <= 0xff ? code : 0x3f // '?' para caracteres fuera de ISO-8859-1
  }
  return out
}

/** Formatea una fecha YYYY-MM-DD a DD/MM/AAAA requerida por el SENIAT. */
export function fechaSeniat(f: string | null | undefined): string {
  if (!f) return ''
  const d = f.slice(0, 10).split('-')
  if (d.length === 3) return `${d[2]}/${d[1]}/${d[0]}`
  return f
}

/** Extrae el código de 3 dígitos del concepto SENIAT (ej. "001" de "001" o "001:fletes"). */
export function codigoConceptoSeniat(conceptoCod: string | null | undefined): string {
  if (!conceptoCod) return '001'
  const limpio = conceptoCod.split(':')[0].replace(/\D/g, '')
  return limpio ? limpio.padStart(3, '0').slice(-3) : '001'
}

/** Filtra las retenciones que aplican para el XML de ISLR del período: tipo ISLR, no anuladas, con retención practicada. */
export function filasXmlIslr(filas: RetencionItem[], periodo: string): RetencionItem[] {
  const p = periodo.replace(/\D/g, '').slice(0, 6)
  return filas
    .filter(
      (r) =>
        r.tipo_impuesto === 'ISLR' &&
        r.estado !== 'ANULADA' &&
        r.monto_retenido > 0 &&
        (r.periodo ?? '').replace(/\D/g, '').slice(0, 6) === p,
    )
    .sort((a, b) => (a.numero_comprobante ?? '').localeCompare(b.numero_comprobante ?? ''))
}

/** Calcula la base imponible en Bolívares. */
function calcularBaseBs(r: RetencionItem): number {
  if (r.moneda.toUpperCase() === 'BS') {
    return r.base_imponible
  }
  return r.base_imponible * (r.tasa > 0 ? r.tasa : 1)
}

/**
 * Genera el archivo XML oficial exigido por el portal del SENIAT para la declaración
 * mensual informativa de retenciones de ISLR (Decreto 1.808).
 */
export function armarXmlIslr(e: EntradaXmlIslr): ResultadoXmlIslr {
  const faltan: string[] = []
  const rifAg = rifLimpio(e.rifAgente)

  if (!/^[JGVEP]\d{9}$/.test(rifAg)) {
    faltan.push('El RIF de la empresa agente no es válido (debe tener letra J/G/V/E/P y 9 dígitos).')
  }
  if (!/^\d{4}(0[1-9]|1[0-2])$/.test(e.periodo)) {
    faltan.push('El período fiscal debe tener formato AAAAMM (ej. 202611).')
  }

  const razonLimpia = ascii(e.razonSocial).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'MINERIA'
  const nombre = `${razonLimpia}DECLARACIONINFORMATIVAISLR${e.periodo}.XML`

  const filas = filasXmlIslr(e.filas, e.periodo)

  if (!filas.length) {
    const xmlVacio = `<?xml version="1.0" encoding="ISO-8859-1"?>\r\n<RelacionRetencionesISLR RifAgente="${rifAg}" Periodo="${e.periodo}" />\r\n`
    return { nombre, contenido: xmlVacio, lineas: 0, faltan }
  }

  const detalles: string[] = []
  filas.forEach((r) => {
    const quien = `${r.proveedor_nombre} · factura ${r.factura_numero || '—'}`
    const rifProv = rifLimpio(r.proveedor_rif)
    const baseBs = calcularBaseBs(r)

    if (!rifProv) {
      faltan.push(`${quien}: falta el RIF del proveedor retenido.`)
    } else if (!/^[JGVEP]\d{9}$/.test(rifProv)) {
      faltan.push(`${quien}: el RIF del proveedor no es válido (${r.proveedor_rif}). Debe iniciar con letra y 9 dígitos.`)
    }

    if (!r.factura_numero?.trim()) {
      faltan.push(`${quien}: falta el número de factura.`)
    }
    if (!r.factura_control?.trim()) {
      faltan.push(`${quien}: falta el número de control de la factura.`)
    }
    if (!/^\d{4}-\d{2}-\d{2}/.test(r.factura_fecha ?? '')) {
      faltan.push(`${quien}: fecha de factura no válida (${r.factura_fecha}).`)
    }

    const conceptoCod = codigoConceptoSeniat(r.concepto_islr_codigo)
    const fechaOp = fechaSeniat(r.factura_fecha)
    const numFactura = escapeXml(ascii(r.factura_numero || '0').slice(0, 20))
    const numControl = escapeXml(ascii(r.factura_control || '0').slice(0, 20))
    const porcentaje = r.alicuota_pct > 0 ? r.alicuota_pct : 2

    detalles.push(
      `  <DetalleRetencion>\r\n` +
      `    <RifRetenido>${rifProv}</RifRetenido>\r\n` +
      `    <NumeroFactura>${numFactura}</NumeroFactura>\r\n` +
      `    <NumeroControl>${numControl}</NumeroControl>\r\n` +
      `    <FechaOperacion>${fechaOp}</FechaOperacion>\r\n` +
      `    <CodigoConcepto>${conceptoCod}</CodigoConcepto>\r\n` +
      `    <MontoOperacion>${montoStr(Math.max(0, baseBs))}</MontoOperacion>\r\n` +
      `    <PorcentajeRetencion>${montoStr(porcentaje)}</PorcentajeRetencion>\r\n` +
      `  </DetalleRetencion>`,
    )
  })

  const xmlCompleto =
    `<?xml version="1.0" encoding="ISO-8859-1"?>\r\n` +
    `<RelacionRetencionesISLR RifAgente="${rifAg}" Periodo="${e.periodo}">\r\n` +
    `${detalles.join('\r\n')}\r\n` +
    `</RelacionRetencionesISLR>\r\n`

  return { nombre, contenido: xmlCompleto, lineas: filas.length, faltan }
}
