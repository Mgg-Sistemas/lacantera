import type { RetencionItem } from '@/lib/api/retenciones'

export type PeriodoCampo2 = 'operaciones' | 'siguiente'

export interface EntradaTxtIva {
  rifAgente: string
  razonSocial: string
  periodo: string // AAAAMM
  campo2: PeriodoCampo2
  filas: RetencionItem[]
}

export interface ResultadoTxtIva {
  nombre: string
  contenido: string
  lineas: number
  faltan: string[]
}

const ascii = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()

const rifLimpio = (v: string | null | undefined) =>
  String(v ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

const montoStr = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2)

export function mesSiguiente(p: string): string {
  const y = Number(p.slice(0, 4))
  const m = Number(p.slice(4, 6))
  return m === 12 ? `${y + 1}01` : `${y}${String(m + 1).padStart(2, '0')}`
}

export function armarTxtIva(e: EntradaTxtIva): ResultadoTxtIva {
  const faltan: string[] = []
  const rifAg = rifLimpio(e.rifAgente)
  if (!/^[JGVEP]\d{9}$/.test(rifAg)) {
    faltan.push('El RIF de la empresa agente no es válido (letra J/G/V/E/P y 9 dígitos).')
  }
  if (!/^\d{4}(0[1-9]|1[0-2])$/.test(e.periodo)) {
    faltan.push('El período fiscal debe tener formato AAAAMM (ej. 202611).')
  }

  const campo2 = e.campo2 === 'siguiente' ? mesSiguiente(e.periodo) : e.periodo
  const nombre = `${ascii(e.razonSocial).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'LACANTERA'}DECLARACIONINFORMATIVACOMPRAS${e.periodo}.TXT`

  const validas = e.filas.filter(
    (r) =>
      r.tipo_impuesto === 'IVA' &&
      r.estado !== 'ANULADA' &&
      r.monto_retenido > 0 &&
      (r.periodo ?? '').replace(/\D/g, '').slice(0, 6) === e.periodo,
  )

  if (!validas.length) {
    const sola = [rifAg, campo2, ...Array<string>(14).fill('0')].join('\t')
    return { nombre, contenido: `${sola}\t\r\n`, lineas: 0, faltan }
  }

  const lineas = validas.map((r) => {
    const quien = `${r.proveedor_nombre} · factura ${r.factura_numero}`
    const rifProv = rifLimpio(r.proveedor_rif)
    if (!rifProv || !/^[JGVEP]\d{9}$/.test(rifProv)) {
      faltan.push(`${quien}: RIF del proveedor no válido (${r.proveedor_rif}).`)
    }
    if (!r.factura_numero?.trim()) {
      faltan.push(`${quien}: falta el número de factura.`)
    }
    if (!r.numero_comprobante || r.numero_comprobante.length !== 14) {
      faltan.push(`${quien}: el número de comprobante debe tener exactamente 14 caracteres (AAAAMMSSSSSSSS).`)
    }

    const totalBs = r.moneda === 'BS' ? r.total_factura : r.total_factura * r.tasa
    const baseBs = r.moneda === 'BS' ? r.base_imponible : r.base_imponible * r.tasa
    const ivaRetBs = r.monto_retenido_bs || (r.moneda === 'BS' ? r.monto_retenido : r.monto_retenido * r.tasa)
    const exentoBs = r.moneda === 'BS' ? r.monto_exento : r.monto_exento * r.tasa
    const alicuota = r.alicuota_pct || 16

    return [
      rifAg,
      campo2,
      (r.factura_fecha ?? '').slice(0, 10),
      'C',
      '01', // Factura
      rifProv,
      ascii(r.factura_numero),
      ascii(r.factura_control || '0'),
      montoStr(totalBs),
      montoStr(baseBs),
      montoStr(ivaRetBs),
      '0', // Factura afectada
      r.numero_comprobante,
      montoStr(exentoBs),
      montoStr(alicuota),
      '0', // Expediente
    ].join('\t')
  })

  return {
    nombre,
    contenido: `${lineas.join('\r\n')}\r\n`,
    lineas: lineas.length,
    faltan,
  }
}
