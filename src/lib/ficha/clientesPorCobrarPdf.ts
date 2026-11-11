import { logoComoImagen } from '@/lib/ficha/logo'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { ajustar } from '@/lib/ficha/hoja'
import { dinero, documento } from '@/lib/formato'
import { FILA_ALTERNA, GRIS, HAIRLINE, MARCA, ROTULO, TINTA, fechaLarga, fechaCorta, type EmpresaPapel } from '@/lib/ficha/papel'
import type { NotaPorCobrarDeCliente } from '@/lib/api/ventas'
import {
  ROTULO_DE_TRAMO,
  antiguedadDeLaDeuda,
  diasVencida,
  porcentaje,
  vencimientoMasViejo,
  type TramoDeAtraso,
} from '@/lib/antiguedadDeDeuda'

/*
  EL REPORTE DE LOS CLIENTES QUE DEBEN POR NOTAS DE ENTREGA (07/11/2026).

  Pedido: «un reporte de los clientes que deben con su monto correspondiente».
  Las notas son las pendientes por cobrar, sin cobrar y no anuladas. Cada una
  trae su total en Bs y en $ con la tasa del día en que se hizo —igual que el
  reporte Bs/$ de Notas de entrega—, y esos dos equivalentes son lo único que
  se suma.

  09/11/2026: pasa al modelo ejecutivo de la casa, el mismo del reporte de
  notas de entrega —membrete con logo y tarjeta de control, recuadro del total,
  tres tarjetas de resumen (clientes, cartera vencida/al día y antigüedad del
  vencido), tabla por cliente con su parte de la deuda y, si se pide, el
  detalle de cada nota con su atraso en una pastilla de color—. Se elige entre
  «Resumen + detalle» y «Solo resumen».

  Lo que se apaga en las opciones no deja rastro: sin detalle no hay sección
  vacía, y «solo vencidas» se dice en el alcance porque cambia qué se cuenta.
*/

type Doc = InstanceType<typeof import('jspdf').jsPDF>

export { diasVencida }

export interface ClienteQueDebe {
  clave: string
  cliente: string
  rif: string | null
  notas: NotaPorCobrarDeCliente[]
  vencidas: number
  bs: number
  usd: number
  usdVencido: number
}

/** Agrupa las notas por cliente, de quien más debe a quien menos. */
export function agruparPorCliente(notas: NotaPorCobrarDeCliente[]): ClienteQueDebe[] {
  const grupos = new Map<string, ClienteQueDebe>()
  for (const n of notas) {
    const clave = n.cliente_id != null ? String(n.cliente_id) : 'sin-cliente'
    const g =
      grupos.get(clave) ??
      ({ clave, cliente: n.cliente ?? 'Sin cliente', rif: n.rif, notas: [], vencidas: 0, bs: 0, usd: 0, usdVencido: 0 } as ClienteQueDebe)
    g.notas.push(n)
    g.bs += Number(n.total_bs ?? 0)
    g.usd += Number(n.total_usd ?? 0)
    if (n.vencida) {
      g.vencidas += 1
      g.usdVencido += Number(n.total_usd ?? 0)
    }
    grupos.set(clave, g)
  }
  return Array.from(grupos.values()).sort((a, b) => b.usd - a.usd)
}

export interface DatosReporteClientesPorCobrar {
  clientes: ClienteQueDebe[]
  conDetalle: boolean
  conLogo: boolean
  nombreArchivo: string
  empresa: EmpresaPapel
  emitidoPor: string
  momento: Date
}

// ── Geometría A4 ejecutiva (16 mm de margen, 178 mm útiles), como el reporte de notas de entrega.
const IZQ = 16
const DER = 194
const ANCHO = DER - IZQ
const ARRIBA = 16
const LIMITE = 266
const PIE = 281

const ROJO_VENCIDO = '#b91c1c'
const VERDE = '#15803d'
const AMBAR = '#b45309'

interface Pastilla {
  fondo: string
  texto: string
  borde: string
}
const P_VENCIDA: Pastilla = { fondo: '#fee2e2', texto: '#991b1b', borde: '#f87171' }
const P_ATENCION: Pastilla = { fondo: '#fef3c7', texto: '#92400e', borde: '#f59e0b' }
const P_AL_DIA: Pastilla = { fondo: '#dcfce7', texto: '#166534', borde: '#4ade80' }
const P_NEUTRA: Pastilla = { fondo: '#e7e5e4', texto: '#44403c', borde: '#a8a29e' }

const decimal1 = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Una sola línea: encoge la letra antes de recortar. */
function enUnaLinea(
  doc: Doc,
  texto: string,
  x: number,
  y: number,
  ancho: number,
  talla: number,
  estilo: 'bold' | 'normal',
  align: 'left' | 'right' | 'center' = 'left',
  minima = 5.8,
) {
  doc.setFont('helvetica', estilo)
  let t = talla
  while (t > minima) {
    doc.setFontSize(t)
    if (doc.getTextWidth(texto) <= ancho) break
    t -= 0.25
  }
  doc.setFontSize(t)
  doc.text(doc.getTextWidth(texto) <= ancho ? texto : ajustar(doc, texto, ancho), x, y, { align })
}

function pastilla(doc: Doc, texto: string, xDer: number, yBase: number, anchoMax: number, p: Pastilla, talla = 6.2) {
  doc.setFont('helvetica', 'bold')
  let t = talla
  while (t > 4.8) {
    doc.setFontSize(t)
    if (doc.getTextWidth(texto) + 3 <= anchoMax) break
    t -= 0.2
  }
  doc.setFontSize(t)
  const w = Math.min(anchoMax, doc.getTextWidth(texto) + 3)
  doc.setFillColor(p.fondo).setDrawColor(p.borde).setLineWidth(0.2)
  doc.roundedRect(xDer - w, yBase - 3.05, w, 4.2, 0.9, 0.9, 'FD')
  doc.setTextColor(p.texto)
  doc.text(ajustar(doc, texto, anchoMax - 2), xDer - w / 2, yBase, { align: 'center' })
}

function pastillaDeAtraso(n: NotaPorCobrarDeCliente, hoy: Date): { texto: string; estilo: Pastilla } {
  if (!n.fecha_pago) return { texto: 'Sin fecha', estilo: P_NEUTRA }
  if (!n.vencida) return { texto: 'Al día', estilo: P_AL_DIA }
  const dias = diasVencida(n.fecha_pago, hoy)
  const texto = dias === 0 ? 'Vence hoy' : plural(dias, 'día', 'días')
  return { texto, estilo: dias <= 15 ? P_ATENCION : P_VENCIDA }
}

/** Membrete con logo y tarjeta de control. Devuelve dónde sigue la hoja. */
function cabecera(doc: Doc, logo: string, d: DatosReporteClientesPorCobrar, notas: number): number {
  const y = ARRIBA
  const ANCHO_CAJA = 68
  const xCaja = DER - ANCHO_CAJA
  const LADO = 23
  if (logo) doc.addImage(logo, 'PNG', IZQ, y - 0.5, LADO, LADO)
  const X = logo ? IZQ + LADO + 4.5 : IZQ
  const ANCHO_NOMBRE = xCaja - X - 4

  const nombre = (d.empresa.razonSocial || '').toUpperCase()
  doc.setTextColor(MARCA)
  enUnaLinea(doc, nombre, X, y + 5, ANCHO_NOMBRE, 15, 'bold', 'left', 9.5)

  let bajo = y + 5
  if (d.empresa.actividad) {
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(ROTULO)
    doc.text(ajustar(doc, d.empresa.actividad.toUpperCase(), ANCHO_NOMBRE), X, y + 10)
    bajo = y + 10
  }
  const rif = `RIF: ${d.empresa.rif}`
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(TINTA)
  doc.text(rif, X, bajo + 4.8)
  if (d.empresa.contacto) {
    const xc = X + doc.getTextWidth(rif)
    doc.setFont('helvetica', 'normal').setTextColor(GRIS)
    doc.text(ajustar(doc, `  ·  ${d.empresa.contacto}`, Math.max(12, ANCHO_NOMBRE - (xc - X))), xc, bajo + 4.8)
  }
  bajo += 4.8
  if (d.empresa.domicilio) {
    doc.setFont('helvetica', 'normal').setFontSize(7.1).setTextColor(GRIS)
    const lineas = (doc.splitTextToSize(d.empresa.domicilio.toUpperCase(), ANCHO_NOMBRE) as string[]).slice(0, 2)
    doc.text(lineas, X, bajo + 4.2, { lineHeightFactor: 1.3 })
    bajo += 4.2 + (lineas.length - 1) * 3
  }
  bajo = Math.max(bajo, y + LADO - 1)

  const filas: Array<[string, string, boolean]> = [
    ['CORTE AL', fechaLarga(d.momento), false],
    ['EMITIDO POR', d.emitidoPor || 'Sistema', false],
    ['REGISTROS', `${plural(d.clientes.length, 'cliente', 'clientes')} · ${plural(notas, 'nota', 'notas')}`, true],
  ]
  const CAB = 6.8
  const FILA = 5.4
  const alto = CAB + filas.length * FILA + 2.4
  const yc = y - 0.5
  doc.setFillColor('#faf8f6').setDrawColor('#d6d3d1').setLineWidth(0.3)
  doc.roundedRect(xCaja, yc, ANCHO_CAJA, alto, 1.4, 1.4, 'FD')
  doc.setFillColor(MARCA).rect(xCaja, yc, ANCHO_CAJA, CAB, 'F')
  doc.setTextColor('#FFFFFF')
  enUnaLinea(doc, 'CLIENTES CON CUENTAS POR COBRAR', xCaja + ANCHO_CAJA / 2, yc + 4.7, ANCHO_CAJA - 4, 8, 'bold', 'center')
  let yf = yc + CAB + 4.2
  filas.forEach(([et, val, destacado], i) => {
    if (i > 0) {
      doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
      doc.line(xCaja + 3, yf - 3.7, DER - 3, yf - 3.7)
    }
    doc.setFont('helvetica', 'bold').setFontSize(6.8).setTextColor(GRIS)
    doc.text(`${et}:`, xCaja + 3, yf)
    doc.setTextColor(destacado ? MARCA : TINTA)
    enUnaLinea(doc, val, DER - 3, yf, ANCHO_CAJA - 27, destacado ? 7.8 : 7.4, 'bold', 'right')
    yf += FILA
  })

  const regla = Math.max(bajo + 3.5, yc + alto + 3)
  doc.setDrawColor(MARCA).setLineWidth(0.7).line(IZQ, regla, DER, regla)
  return regla + 4.5
}

/** Cabecera corta de las hojas 2 en adelante. */
function cabeceraCorta(doc: Doc, logo: string, d: DatosReporteClientesPorCobrar): number {
  const LADO = 11
  if (logo) doc.addImage(logo, 'PNG', IZQ, ARRIBA - 1, LADO, LADO)
  const x = logo ? IZQ + LADO + 3.5 : IZQ
  doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(MARCA)
  doc.text('CLIENTES CON CUENTAS POR COBRAR', x, ARRIBA + 3.8)
  doc.setFont('helvetica', 'bold').setFontSize(7.4).setTextColor(ROTULO)
  doc.text(ajustar(doc, (d.empresa.razonSocial || '').toUpperCase(), 100), x, ARRIBA + 8)
  doc.setFont('helvetica', 'normal').setFontSize(7.4).setTextColor(GRIS)
  doc.text(`Corte al ${fechaLarga(d.momento)}`, DER, ARRIBA + 6, { align: 'right' })
  const regla = ARRIBA + 11.5
  doc.setDrawColor(MARCA).setLineWidth(0.6).line(IZQ, regla, DER, regla)
  return regla + 5
}

function tituloSeccion(doc: Doc, y: number, titulo: string, sub: string | null, color = ROTULO): number {
  doc.setFillColor(color).rect(IZQ, y, 2.2, 5.2, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(ROTULO)
  const t = titulo.toUpperCase()
  doc.text(t, IZQ + 4.5, y + 4.1)
  if (sub) {
    const xs = IZQ + 4.5 + doc.getTextWidth(t) + 3
    doc.setFont('helvetica', 'normal').setFontSize(7.4).setTextColor(GRIS)
    doc.text(ajustar(doc, sub, DER - xs), xs, y + 4.1)
  }
  return y + 7.4
}

// ── Tabla por cliente (suma 178 mm)
const COL = {
  cliente: { x: IZQ, w: 54 },
  notas: { x: IZQ + 54, w: 16 },
  vence: { x: IZQ + 70, w: 26 },
  bs: { x: IZQ + 96, w: 28 },
  usd: { x: IZQ + 124, w: 22 },
  pct: { x: IZQ + 146, w: 18 },
  estado: { x: IZQ + 164, w: 14 },
}
const DIV_CLIENTES = [COL.notas.x, COL.vence.x, COL.bs.x, COL.usd.x, COL.pct.x, COL.estado.x]

function cabeceraTablaClientes(doc: Doc, y: number): number {
  const H = 7.6
  doc.setFillColor(MARCA).rect(IZQ, y, ANCHO, H, 'F')
  doc.setDrawColor('#b05646').setLineWidth(0.22)
  for (const x of DIV_CLIENTES) doc.line(x, y + 1.3, x, y + H - 1.3)
  const yt = y + 5
  doc.setFont('helvetica', 'bold').setFontSize(6.9).setTextColor('#FFFFFF')
  doc.text('CLIENTE / RIF', COL.cliente.x + 2, yt)
  doc.text('NOTAS', COL.notas.x + COL.notas.w / 2, yt, { align: 'center' })
  doc.text('VENC. MÁS ANTIGUO', COL.vence.x + COL.vence.w / 2, yt, { align: 'center' })
  doc.text('TOTAL BS', COL.bs.x + COL.bs.w - 2, yt, { align: 'right' })
  doc.text('TOTAL $', COL.usd.x + COL.usd.w - 2, yt, { align: 'right' })
  doc.text('% SALDO', COL.pct.x + 2, yt)
  doc.text('ESTADO', COL.estado.x + COL.estado.w - 1.5, yt, { align: 'right' })
  return y + H
}

// ── Tabla de detalle (suma 178 mm)
const DET = {
  nota: { x: IZQ, w: 28 },
  fecha: { x: IZQ + 28, w: 22 },
  vence: { x: IZQ + 50, w: 22 },
  atraso: { x: IZQ + 72, w: 22 },
  moneda: { x: IZQ + 94, w: 30 },
  bs: { x: IZQ + 124, w: 30 },
  usd: { x: IZQ + 154, w: 24 },
}

function cabeceraTablaDetalle(doc: Doc, y: number): number {
  const H = 6.4
  doc.setFillColor('#f1efed').rect(IZQ, y, ANCHO, H, 'F')
  doc.setDrawColor('#d6d3d1').setLineWidth(0.2).line(IZQ, y + H, DER, y + H)
  const yt = y + 4.3
  doc.setFont('helvetica', 'bold').setFontSize(6.6).setTextColor(TINTA)
  doc.text('NOTA', DET.nota.x + 2, yt)
  doc.text('EMISIÓN', DET.fecha.x + DET.fecha.w / 2, yt, { align: 'center' })
  doc.text('VENCIMIENTO', DET.vence.x + DET.vence.w / 2, yt, { align: 'center' })
  doc.text('ESTATUS', DET.atraso.x + DET.atraso.w / 2, yt, { align: 'center' })
  doc.text('MONTO ORIGINAL', DET.moneda.x + DET.moneda.w - 2, yt, { align: 'right' })
  doc.text('TOTAL BS', DET.bs.x + DET.bs.w - 2, yt, { align: 'right' })
  doc.text('TOTAL $', DET.usd.x + DET.usd.w - 2, yt, { align: 'right' })
  return y + H
}

export async function armarReporteClientesPorCobrar(d: DatosReporteClientesPorCobrar): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = d.conLogo ? await logoComoImagen(600, false) : ''
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const titulo = 'Clientes con cuentas por cobrar'

  const todas = d.clientes.flatMap((c) => c.notas)
  const usd = d.clientes.reduce((s, c) => s + c.usd, 0)
  const bs = d.clientes.reduce((s, c) => s + c.bs, 0)
  const usdVencido = d.clientes.reduce((s, c) => s + c.usdVencido, 0)
  const vencidas = d.clientes.reduce((s, c) => s + c.vencidas, 0)
  const alDia = todas.length - vencidas
  const tramos = antiguedadDeLaDeuda(todas, d.momento)

  const nuevaHoja = () => {
    doc.addPage()
    return cabeceraCorta(doc, logo, d)
  }

  let y = cabecera(doc, logo, d, todas.length)

  // ── Recuadro del total
  {
    const ALTO = 22
    doc.setFillColor('#faf8f6').setDrawColor(MARCA).setLineWidth(0.6)
    doc.roundedRect(IZQ, y, ANCHO, ALTO, 1.2, 1.2, 'FD')
    const xSep = DER - 58
    doc.setDrawColor('#d6d3d1').setLineWidth(0.3).line(xSep, y + 3, xSep, y + ALTO - 3)

    doc.setFont('helvetica', 'bold').setFontSize(7.6).setTextColor(ROTULO)
    doc.text('TOTAL POR COBRAR EN NOTAS DE ENTREGA', IZQ + 4, y + 5.5)
    doc.setTextColor('#111111')
    enUnaLinea(doc, dinero('USD', usd), IZQ + 4, y + 13.5, xSep - IZQ - 8, 18, 'bold')
    doc.setFont('helvetica', 'normal').setFontSize(7.6).setTextColor(GRIS)
    doc.text(`Equivalente en bolívares: ${dinero('VES', bs)}`, IZQ + 4, y + 18.5)

    doc.setFont('helvetica', 'bold').setFontSize(7.4).setTextColor(usdVencido > 0 ? ROJO_VENCIDO : VERDE)
    doc.text(usdVencido > 0 ? 'MONTO VENCIDO' : 'SIN SALDO VENCIDO', DER - 4, y + 5.5, { align: 'right' })
    enUnaLinea(doc, dinero('USD', usdVencido), DER - 4, y + 13, 50, 14, 'bold', 'right')
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(GRIS)
    doc.text(
      `${decimal1.format(porcentaje(usdVencido, usd))} % del total · ${plural(vencidas, 'nota', 'notas')}`,
      DER - 4,
      y + 18.5,
      { align: 'right' },
    )
    y += ALTO + 4
  }

  // ── Tres tarjetas
  {
    const GAP = 4
    const w = (ANCHO - GAP * 2) / 3
    const H = 25
    const mayor = d.clientes[0]
    const tarjeta = (i: number, acento: string, tituloT: string) => {
      const x = IZQ + i * (w + GAP)
      doc.setFillColor('#ffffff').setDrawColor('#d6d3d1').setLineWidth(0.28)
      doc.roundedRect(x, y, w, H, 1.3, 1.3, 'FD')
      doc.setFillColor(acento).rect(x, y, 2, H, 'F')
      doc.setFont('helvetica', 'bold').setFontSize(6.8).setTextColor(acento)
      doc.text(tituloT, x + 4.5, y + 4.8)
      return x + 4.5
    }

    // 1. Clientes
    let x = tarjeta(0, ROTULO, 'CLIENTES CON SALDO PENDIENTE')
    doc.setTextColor('#1c1917')
    enUnaLinea(doc, plural(d.clientes.length, 'cliente', 'clientes'), x, y + 11.5, w - 7, 11, 'bold', 'left', 8)
    doc.setFont('helvetica', 'bold').setFontSize(6.9).setTextColor(TINTA)
    doc.text(`${plural(todas.length, 'nota pendiente', 'notas pendientes')}`, x, y + 16.5)
    if (mayor) {
      doc.setFont('helvetica', 'normal').setFontSize(6.6).setTextColor(GRIS)
      doc.text(
        ajustar(doc, `Mayor saldo: ${decimal1.format(porcentaje(mayor.usd, usd))} % del total`, w - 7),
        x,
        y + 21,
      )
    }

    // 2. Cartera
    const acentoCartera = vencidas > 0 ? '#dc2626' : VERDE
    x = tarjeta(1, acentoCartera, 'ESTADO DE LA CARTERA')
    doc.setTextColor('#1c1917')
    enUnaLinea(doc, `${vencidas} vencida${vencidas === 1 ? '' : 's'} · ${alDia} al día`, x, y + 11.5, w - 7, 11, 'bold', 'left', 8)
    const anchoBarra = w - 8
    doc.setFillColor('#e7e5e4').rect(x, y + 14.2, anchoBarra, 2, 'F')
    const fr = todas.length > 0 ? vencidas / todas.length : 0
    if (fr > 0) doc.setFillColor('#dc2626').rect(x, y + 14.2, anchoBarra * fr, 2, 'F')
    if (fr < 1 && todas.length > 0) doc.setFillColor(VERDE).rect(x + anchoBarra * fr, y + 14.2, anchoBarra * (1 - fr), 2, 'F')
    doc.setFont('helvetica', 'normal').setFontSize(6.6).setTextColor(GRIS)
    doc.text(
      ajustar(doc, `${dinero('USD', usdVencido)} vencido · ${dinero('USD', usd - usdVencido)} por vencer`, w - 7),
      x,
      y + 21,
    )

    // 3. Antigüedad
    x = tarjeta(2, AMBAR, 'ANTIGÜEDAD DE SALDOS VENCIDOS')
    const filas: TramoDeAtraso[] = ['D1_15', 'D16_30', 'D31_60', 'MAS_60']
    filas.forEach((t, i) => {
      const yy = y + 9.4 + i * 3.8
      const rojo = t === 'MAS_60' && tramos[t].usd > 0
      doc.setFont('helvetica', rojo ? 'bold' : 'normal').setFontSize(6.7).setTextColor(rojo ? ROJO_VENCIDO : TINTA)
      doc.text(ROTULO_DE_TRAMO[t], x, yy)
      doc.setFont('helvetica', 'bold')
      doc.text(dinero('USD', tramos[t].usd), x + w - 8, yy, { align: 'right' })
    })
    y += H + 6
  }

  // ── Deuda por cliente
  y = tituloSeccion(doc, y, 'Saldo por cliente', 'Ordenado de mayor a menor saldo')
  let yInicio = y
  y = cabeceraTablaClientes(doc, y)
  const cerrarTabla = (yFin: number, color = MARCA) => {
    doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
    doc.line(IZQ, yInicio, IZQ, yFin)
    doc.line(DER, yInicio, DER, yFin)
    doc.setDrawColor(color).setLineWidth(0.5).line(IZQ, yFin, DER, yFin)
  }

  d.clientes.forEach((c, i) => {
    const H = 9
    if (y + H > LIMITE) {
      cerrarTabla(y)
      y = nuevaHoja()
      yInicio = y
      y = cabeceraTablaClientes(doc, y)
    }
    doc.setFillColor(c.vencidas > 0 && i % 2 === 0 ? '#fff8f8' : i % 2 === 1 ? FILA_ALTERNA : '#ffffff')
    doc.rect(IZQ, y, ANCHO, H, 'F')
    doc.setDrawColor(HAIRLINE).setLineWidth(0.22)
    for (const x of DIV_CLIENTES) doc.line(x, y, x, y + H)
    doc.line(IZQ, y + H, DER, y + H)

    const yb = y + 4
    doc.setTextColor('#1c1917')
    enUnaLinea(doc, c.cliente, COL.cliente.x + 2, yb, COL.cliente.w - 4, 7.5, 'bold')
    if (c.rif) {
      doc.setFont('helvetica', 'normal').setFontSize(6.3).setTextColor(GRIS)
      doc.text(documento(c.rif), COL.cliente.x + 2, yb + 3.3)
    }

    doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(TINTA)
    doc.text(String(c.notas.length), COL.notas.x + COL.notas.w / 2, yb, { align: 'center' })
    if (c.vencidas > 0) {
      doc.setFont('helvetica', 'normal').setFontSize(6.2).setTextColor(ROJO_VENCIDO)
      doc.text(`${c.vencidas} venc.`, COL.notas.x + COL.notas.w / 2, yb + 3.3, { align: 'center' })
    }

    const masVieja = vencimientoMasViejo(c.notas)
    if (masVieja) {
      doc.setFont('helvetica', 'normal').setFontSize(7.1).setTextColor(TINTA)
      doc.text(fechaCorta(masVieja), COL.vence.x + COL.vence.w / 2, yb, { align: 'center' })
      const dias = diasVencida(masVieja, d.momento)
      doc.setFontSize(6.2).setTextColor(ROJO_VENCIDO)
      doc.text(dias === 0 ? 'vence hoy' : `${plural(dias, 'día', 'días')} de atraso`, COL.vence.x + COL.vence.w / 2, yb + 3.3, {
        align: 'center',
      })
    } else {
      doc.setFont('helvetica', 'normal').setFontSize(7.1).setTextColor(GRIS)
      doc.text('—', COL.vence.x + COL.vence.w / 2, yb, { align: 'center' })
    }

    doc.setTextColor(TINTA)
    enUnaLinea(doc, dinero('VES', c.bs), COL.bs.x + COL.bs.w - 2, yb, COL.bs.w - 3.5, 7.2, 'normal', 'right')
    doc.setTextColor('#1c1917')
    enUnaLinea(doc, dinero('USD', c.usd), COL.usd.x + COL.usd.w - 2, yb, COL.usd.w - 3.5, 7.6, 'bold', 'right')

    const pct = porcentaje(c.usd, usd)
    const anchoB = COL.pct.w - 4
    doc.setFillColor('#e7e5e4').rect(COL.pct.x + 2, yb - 2.2, anchoB, 1.8, 'F')
    if (pct > 0) doc.setFillColor(MARCA).rect(COL.pct.x + 2, yb - 2.2, Math.max(0.6, (anchoB * pct) / 100), 1.8, 'F')
    doc.setFont('helvetica', 'normal').setFontSize(6.3).setTextColor(GRIS)
    doc.text(`${decimal1.format(pct)} %`, COL.pct.x + 2, yb + 3.3)

    pastilla(doc, c.vencidas > 0 ? 'Vencida' : 'Al día', COL.estado.x + COL.estado.w - 1.2, yb + 0.6, COL.estado.w - 2, c.vencidas > 0 ? P_VENCIDA : P_AL_DIA, 5.9)
    y += H
  })
  cerrarTabla(y)

  // Banda de totales
  {
    const filas: Array<[string, string, string]> = [
      [`TOTAL POR COBRAR (${plural(d.clientes.length, 'CLIENTE', 'CLIENTES')} · ${plural(todas.length, 'NOTA', 'NOTAS')})`, `${dinero('VES', bs)}   ·   ${dinero('USD', usd)}`, MARCA],
    ]
    if (vencidas > 0) filas.push([`MONTO VENCIDO (${plural(vencidas, 'NOTA', 'NOTAS')})`, dinero('USD', usdVencido), ROJO_VENCIDO])
    const H = 2.6 + filas.length * 5.6
    if (y + H > LIMITE) y = nuevaHoja()
    doc.setFillColor('#faf8f6').setDrawColor(MARCA).setLineWidth(0.4).rect(IZQ, y, ANCHO, H, 'FD')
    filas.forEach(([izq, der, color], i) => {
      const yf = y + 5.1 + i * 5.6
      if (i > 0) doc.setDrawColor(HAIRLINE).setLineWidth(0.22).line(IZQ + 3, yf - 3.8, DER - 3, yf - 3.8)
      doc.setFont('helvetica', 'bold').setFontSize(7.8).setTextColor(color)
      doc.text(ajustar(doc, izq, 100), IZQ + 3.5, yf)
      doc.setTextColor(i === 0 ? '#111111' : color)
      doc.text(der, DER - 3.5, yf, { align: 'right' })
    })
    y += H + 3.5
    doc.setFont('helvetica', 'italic').setFontSize(6.8).setTextColor(GRIS)
    doc.text(
      'Montos en Bs y $ calculados con la tasa BCV vigente a la fecha de emisión de cada nota. Una nota se considera vencida cuando su fecha de pago ha transcurrido.',
      IZQ,
      y + 1,
    )
    y += 6
  }

  // ── Detalle por cliente
  if (d.conDetalle && d.clientes.length > 0) {
    if (y + 40 > LIMITE) y = nuevaHoja()
    else y += 2
    y = tituloSeccion(doc, y, 'Detalle de notas por cliente', 'Indicador de mora: ámbar hasta 15 días, rojo a partir de 16 días', '#dc2626')

    for (const c of d.clientes) {
      // Que la franja del cliente no quede sola al pie de la hoja.
      if (y + 7 + 6.4 + 7 * 2 > LIMITE) y = nuevaHoja()
      const franja = (yy: number, sigue: boolean) => {
        doc.setFillColor(ROTULO).roundedRect(IZQ, yy, ANCHO, 7, 0.8, 0.8, 'F')
        doc.setTextColor('#FFFFFF')
        const izq = `${c.cliente}${c.rif ? ` · ${documento(c.rif)}` : ''}${sigue ? ' (continúa)' : ''}`
        const der = `${plural(c.notas.length, 'nota', 'notas')} · ${dinero('VES', c.bs)} · ${dinero('USD', c.usd)}`
        doc.setFont('helvetica', 'bold').setFontSize(7.4)
        const anchoDer = doc.getTextWidth(der)
        enUnaLinea(doc, izq, IZQ + 3, yy + 4.8, ANCHO - anchoDer - 10, 7.6, 'bold')
        doc.setFont('helvetica', 'bold').setFontSize(7.4).setTextColor('#FFFFFF')
        doc.text(der, DER - 3, yy + 4.8, { align: 'right' })
        return cabeceraTablaDetalle(doc, yy + 7)
      }
      y = franja(y, false)

      c.notas.forEach((n, i) => {
        const H = 7
        if (y + H > LIMITE) {
          y = nuevaHoja()
          y = franja(y, true)
        }
        doc.setFillColor(i % 2 === 1 ? FILA_ALTERNA : '#ffffff').rect(IZQ, y, ANCHO, H, 'F')
        doc.setDrawColor(HAIRLINE).setLineWidth(0.2).line(IZQ, y + H, DER, y + H)
        const yb = y + 4.6
        doc.setTextColor('#1c1917')
        enUnaLinea(doc, n.numero, DET.nota.x + 2, yb, DET.nota.w - 3, 7.4, 'bold')
        doc.setFont('helvetica', 'normal').setFontSize(7.1).setTextColor(TINTA)
        doc.text(fechaCorta(n.fecha), DET.fecha.x + DET.fecha.w / 2, yb, { align: 'center' })
        doc.text(n.fecha_pago ? fechaCorta(n.fecha_pago) : '—', DET.vence.x + DET.vence.w / 2, yb, { align: 'center' })
        const p = pastillaDeAtraso(n, d.momento)
        doc.setFont('helvetica', 'bold').setFontSize(6.1)
        const wp = Math.min(DET.atraso.w - 3, doc.getTextWidth(p.texto) + 3)
        pastilla(doc, p.texto, DET.atraso.x + DET.atraso.w / 2 + wp / 2, yb, DET.atraso.w - 3, p.estilo, 6.1)
        doc.setTextColor(TINTA)
        enUnaLinea(doc, dinero(n.moneda, n.total), DET.moneda.x + DET.moneda.w - 2, yb, DET.moneda.w - 3.5, 7.1, 'normal', 'right')
        enUnaLinea(doc, dinero('VES', n.total_bs ?? 0), DET.bs.x + DET.bs.w - 2, yb, DET.bs.w - 3.5, 7.1, 'normal', 'right')
        doc.setTextColor('#1c1917')
        enUnaLinea(doc, dinero('USD', n.total_usd ?? 0), DET.usd.x + DET.usd.w - 2, yb, DET.usd.w - 3.5, 7.4, 'bold', 'right')
        y += H
      })
      doc.setDrawColor(ROTULO).setLineWidth(0.45).line(IZQ, y, DER, y)
      y += 5
    }
  }

  // ── Pie en todas las hojas
  const paginas = doc.getNumberOfPages()
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p)
    doc.setDrawColor('#d6d3d1').setLineWidth(0.3).line(IZQ, PIE - 5.5, DER, PIE - 5.5)
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(GRIS)
    doc.text(
      ajustar(doc, `Documento generado por el sistema · ${titulo} · Emitido por ${d.emitidoPor || 'Sistema'}`, ANCHO - 30),
      IZQ,
      PIE - 1,
    )
    doc.setFont('helvetica', 'bold').setFontSize(7.4).setTextColor(ROTULO)
    doc.text(`Página ${p} de ${paginas}`, DER, PIE - 1, { align: 'right' })
  }

  doc.setProperties({ title: titulo })
  return { blob: doc.output('blob'), nombre: d.nombreArchivo }
}
