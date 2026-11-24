/*
  PROVIDENCIA ADMINISTRATIVA SNAT/2026/00093 (Gaceta Oficial N° 43.484,
  21/10/2026): normas generales y medios para emitir facturas y otros
  documentos fiscales.

  Entra en vigencia a los 180 días continuos de publicada: el 19/04/2027.
  Desde ese día la factura solo sale por el Portal / aplicativo del SENIAT,
  una imprenta digital autorizada o una máquina fiscal (Art. 4). La empresa
  escogió el PORTAL SENIAT (23/11/2026): el sistema arma la factura, se emite
  en el portal y aquí se registra el número y el control que dio el SENIAT.

  Lo que se resolvió en un solo sitio:
  - la leyenda del Art. 19, que llevan todos los documentos fiscales;
  - la fecha y la hora en el formato del Art. 8.5 (DDMMAAAA y HH.MM.SS a.m./p.m.);
  - el número del comprobante de retención del Art. 18 (AAAAMMSSSSSSSS);
  - desde cuándo rige, con su respaldo si la ficha de la empresa no lo dice.
*/

export const PROVIDENCIA = 'SNAT/2026/00093'
export const GACETA_PROVIDENCIA = 'Gaceta Oficial N° 43.484 del 21/10/2026'

/** Disposición Final Octava: 180 días continuos desde el 21/10/2026. */
export const VIGENCIA_PROVIDENCIA = '2027-04-19'

/** Art. 19: los documentos fiscales dicen que se emiten conforme a la Providencia. */
export const LEYENDA_PROVIDENCIA = `Emitido conforme a la Providencia Administrativa ${PROVIDENCIA} (G.O. N° 43.484 del 21/10/2026).`

/** Art. 15: la denominación que la norma reconoce para la nota de despacho. */
export const DENOMINACION_GUIA = 'Orden de entrega / Guía de despacho'

/** Pie de la nota de despacho: denominación, motivo del traslado y la Providencia. */
export const LEYENDA_GUIA = `${DENOMINACION_GUIA} (Arts. 14-16) · Motivo del traslado: venta de material · Providencia ${PROVIDENCIA}.`

export type MedioEmision = 'PORTAL_SENIAT' | 'CONTINGENCIA'

export const MEDIOS_EMISION: { valor: MedioEmision; etiqueta: string }[] = [
  { valor: 'PORTAL_SENIAT', etiqueta: 'Portal / aplicativo del SENIAT' },
  { valor: 'CONTINGENCIA', etiqueta: 'Contingencia (talonario de imprenta)' },
]

/** Hoy en Caracas, `AAAA-MM-DD`. */
function hoyIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date())
}

/**
 * Si la Providencia ya rige en una fecha. `desde` es lo que diga la ficha de
 * la empresa; vacío, la fecha legal.
 */
export function providenciaVigente(desde?: string | null, fecha: string = hoyIso()): boolean {
  const inicio = (desde || VIGENCIA_PROVIDENCIA).slice(0, 10)
  return fecha.slice(0, 10) >= inicio
}

/** Art. 8.5 · fecha de ocho dígitos, separada: `19/04/2027`. */
export function fechaFiscal(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso)
  return new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

/** Art. 8.5 · hora `HH.MM.SS a.m.` / `p.m.`, en hora de Caracas. */
export function horaFiscal(iso: string): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Caracas',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).formatToParts(new Date(iso))
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? '00'
  const periodo = v('dayPeriod').toLowerCase().startsWith('p') ? 'p.m.' : 'a.m.'
  return `${v('hour')}.${v('minute')}.${v('second')} ${periodo}`
}

/** Art. 8.7 · los renglones exentos, exonerados o no gravados llevan « (E)». */
export function conMarcaExento(descripcion: string, exento?: boolean | null): string {
  if (!exento || /\(E\)\s*$/.test(descripcion)) return descripcion
  return `${descripcion} (E)`
}

/**
 * Art. 18.1 · número del comprobante de retención: catorce caracteres,
 * `AAAAMMSSSSSSSS` (año, mes y secuencial de ocho dígitos).
 */
export function numeroComprobanteRetencion(anio: number, mes: number, secuencial: number): string {
  return `${String(anio).padStart(4, '0')}${String(mes).padStart(2, '0')}${String(secuencial).padStart(8, '0')}`
}

/** Valida la forma del número de control del Art. 9.1: `00-00000001`. */
export function esNumeroDeControl(v: string): boolean {
  return /^\d{2}-?\d{1,8}$/.test(v.trim())
}

/**
 * Notas de despacho que la Providencia obliga a facturar en el mismo período
 * de imposición (Art. 14). Devuelve las del mes anterior que siguen sin factura
 * y las del mes en curso, y si ya se está en los últimos días del mes.
 */
export function notasPorFacturarEnPeriodo<T extends { fecha: string }>(
  notas: T[],
  hoy: string = hoyIso(),
): { vencidas: T[]; delMes: T[]; cierreCerca: boolean; diasParaCierre: number } {
  const mes = hoy.slice(0, 7)
  const [a, m, d] = hoy.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  const diasParaCierre = ultimo - d
  return {
    vencidas: notas.filter((n) => n.fecha.slice(0, 7) < mes),
    delMes: notas.filter((n) => n.fecha.slice(0, 7) === mes),
    cierreCerca: diasParaCierre <= 5,
    diasParaCierre,
  }
}
