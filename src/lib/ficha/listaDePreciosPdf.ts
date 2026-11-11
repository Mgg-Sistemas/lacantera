import { logoComoImagen } from '@/lib/ficha/logo'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { dinero, documento } from '@/lib/formato'
import { fechaLarga, MARCA, ROTULO, TINTA, GRIS, FILA_ALTERNA, HAIRLINE, type EmpresaPapel } from '@/lib/ficha/papel'
import type { CuentaParaPagos, PrecioVenta } from '@/lib/api/ventas'

/*
  LA LISTA DE PRECIOS EN PDF, HORIZONTAL (11/11/2026).

  Pedido: «un PDF horizontal en esa ventana donde se vean los precios y los
  datos bancarios». Es un papel para el cliente: el producto, la unidad y el
  precio —sin el código interno ni el precio mínimo, que son de la casa— y al
  lado el recuadro con las cuentas donde pagar, leídas de Tesorería.

  Lo que no tiene precio no sale (un renglón vacío en la lista de un cliente
  confunde), y si se apagan los datos bancarios o el logo no queda hueco.
*/

type Doc = InstanceType<typeof import('jspdf').jsPDF>

export interface DatosListaDePrecios {
  precios: PrecioVenta[]
  cuentas: CuentaParaPagos[]
  conCuentas: boolean
  conLogo: boolean
  empresa: EmpresaPapel
  emitidoPor: string
  momento: Date
  nombreArchivo: string
}

// A4 horizontal, en milímetros.
const ANCHO_HOJA = 297
const ALTO_HOJA = 210
const IZQ = 14
const DER = ANCHO_HOJA - 14
const ABAJO = ALTO_HOJA - 16

/** «01630405174053030180» → «0163-0405-1740-5303-0180», como se dicta en el banco. */
function cuentaLegible(n: string): string {
  const solo = n.replace(/\D/g, '')
  return solo.length === 20 ? solo.match(/.{4}/g)!.join('-') : n
}

/** «0163 · BANCO DEL TESORO» → «Banco del Tesoro (0163)», como lo escribe la empresa. */
function bancoLegible(b: string): string {
  const m = b.match(/^(\d{4})\s*·\s*(.+)$/)
  if (!m) return b
  const nombre = m[2]
    .toLowerCase()
    .replace(/(^|\s)(\S)/g, (_, e: string, l: string) => e + l.toUpperCase())
    .replace(/\b(Del|De|La|Los|Las|Y)\b/g, (p) => p.toLowerCase())
  return `${nombre} (${m[1]})`
}

function recortar(doc: Doc, t: string, ancho: number): string {
  if (doc.getTextWidth(t) <= ancho) return t
  let s = t
  while (s.length > 1 && doc.getTextWidth(s + '…') > ancho) s = s.slice(0, -1)
  return s + '…'
}

function cabecera(doc: Doc, logo: string, d: DatosListaDePrecios): number {
  const y = 14
  const LADO = 20
  if (logo) doc.addImage(logo, 'PNG', IZQ, y, LADO, LADO)
  const x = logo ? IZQ + LADO + 5 : IZQ

  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(MARCA)
  doc.text(recortar(doc, d.empresa.razonSocial, 140), x, y + 6)
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(ROTULO)
  let yy = y + 11
  if (d.empresa.actividad) {
    doc.text(recortar(doc, d.empresa.actividad, 140), x, yy)
    yy += 4.2
  }
  doc.setFont('helvetica', 'bold').text(`RIF: ${documento(d.empresa.rif)}`, x, yy)
  yy += 4.2
  if (d.empresa.domicilio) {
    doc.setFont('helvetica', 'normal').setTextColor(GRIS)
    doc.text(recortar(doc, d.empresa.domicilio, 140), x, yy)
  }

  // El rótulo a la derecha.
  const W = 92
  const xr = DER - W
  doc.setFillColor(MARCA).rect(xr, y, W, 9, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor('#ffffff')
  doc.text('LISTA DE PRECIOS', xr + W / 2, y + 6.2, { align: 'center' })
  doc.setDrawColor(HAIRLINE).setLineWidth(0.3).setFillColor(FILA_ALTERNA).rect(xr, y + 9, W, 12, 'FD')
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(GRIS)
  doc.text('VIGENTE DESDE', xr + 4, y + 16.4)
  doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(TINTA)
  const soloFecha = d.momento.toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })
  doc.text(soloFecha, xr + W - 4, y + 16.4, { align: 'right' })

  const yl = y + LADO + 6
  doc.setDrawColor(MARCA).setLineWidth(0.6).line(IZQ, yl, DER, yl)
  return yl + 7
}

function pie(doc: Doc, d: DatosListaDePrecios, pagina: number, total: number) {
  doc.setDrawColor(HAIRLINE).setLineWidth(0.3).line(IZQ, ALTO_HOJA - 11, DER, ALTO_HOJA - 11)
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
  doc.text(`Emitido por ${d.emitidoPor || '—'} · ${fechaLarga(d.momento)}`, IZQ, ALTO_HOJA - 7)
  doc.text(`Página ${pagina} de ${total}`, DER, ALTO_HOJA - 7, { align: 'right' })
}

function recuadroDePago(doc: Doc, cuentas: CuentaParaPagos[], x: number, y: number, w: number) {
  const filas = (c: CuentaParaPagos): Array<[string, string]> => [
    ['Banco', bancoLegible(c.banco ?? '—')],
    ['Titular', c.titular ?? '—'],
    ['RIF', c.documento ? documento(c.documento) : '—'],
    ['Cuenta', cuentaLegible(c.numero_cuenta ?? '—')],
    ['Moneda', c.moneda === 'VES' ? 'Bolívares (Bs)' : c.moneda === 'USD' ? 'Dólares ($)' : c.moneda],
  ]
  const ALTO_CUENTA = 5 * 7 + 4
  const alto = 11 + cuentas.length * ALTO_CUENTA - 2

  doc.setDrawColor(MARCA).setLineWidth(0.5).setFillColor(FILA_ALTERNA).roundedRect(x, y, w, alto, 1.5, 1.5, 'FD')
  doc.setFillColor(MARCA).rect(x, y, w, 8.5, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor('#ffffff')
  doc.text('DATOS PARA EL PAGO', x + w / 2, y + 5.9, { align: 'center' })

  let yy = y + 11
  cuentas.forEach((c, i) => {
    if (i > 0) doc.setDrawColor(HAIRLINE).setLineWidth(0.3).line(x + 4, yy - 2, x + w - 4, yy - 2)
    for (const [rotulo, valor] of filas(c)) {
      doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
      doc.text(rotulo.toUpperCase(), x + 5, yy + 3)
      const esCuenta = rotulo === 'Cuenta'
      doc.setFont('helvetica', 'bold').setFontSize(esCuenta ? 11 : 9.5).setTextColor(esCuenta ? MARCA : TINTA)
      doc.text(recortar(doc, valor, w - 30), x + 25, yy + 3)
      yy += 7
    }
    yy += 4
  })
}

export async function armarListaDePrecios(d: DatosListaDePrecios): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = d.conLogo ? await logoComoImagen(600, false) : ''
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true })

  const filas = d.precios.filter((p) => p.activo && p.precio && Number(p.precio) > 0)
  const conCuentas = d.conCuentas && d.cuentas.length > 0

  // La tabla a la izquierda; el recuadro de pago a la derecha, si va.
  const W_PAGO = 96
  const W_TABLA = conCuentas ? DER - IZQ - W_PAGO - 8 : DER - IZQ
  const cProd = { x: IZQ, w: W_TABLA - 30 - 44 }
  const cUni = { x: cProd.x + cProd.w, w: 30 }
  const cPre = { x: cUni.x + cUni.w, w: 44 }
  const ALTO_FILA = 9.5

  let y = cabecera(doc, logo, d)
  const yInicio = y
  if (conCuentas) recuadroDePago(doc, d.cuentas, DER - W_PAGO, yInicio, W_PAGO)

  const encabezado = () => {
    doc.setFillColor(MARCA).rect(IZQ, y, W_TABLA, 9, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor('#ffffff')
    doc.text('PRODUCTO', cProd.x + 4, y + 6)
    doc.text('UNIDAD', cUni.x + cUni.w / 2, y + 6, { align: 'center' })
    doc.text('PRECIO', cPre.x + cPre.w - 4, y + 6, { align: 'right' })
    y += 9
  }
  encabezado()

  filas.forEach((p, i) => {
    if (y + ALTO_FILA > ABAJO) {
      doc.addPage()
      y = cabecera(doc, logo, d)
      encabezado()
    }
    if (i % 2 === 1) doc.setFillColor(FILA_ALTERNA).rect(IZQ, y, W_TABLA, ALTO_FILA, 'F')
    doc.setDrawColor(HAIRLINE).setLineWidth(0.25).line(IZQ, y + ALTO_FILA, IZQ + W_TABLA, y + ALTO_FILA)
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(TINTA)
    doc.text(recortar(doc, p.nombre, cProd.w - 8), cProd.x + 4, y + 6.3)
    doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(ROTULO)
    doc.text(p.unidad, cUni.x + cUni.w / 2, y + 6.3, { align: 'center' })
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(MARCA)
    doc.text(dinero(p.moneda ?? 'USD', Number(p.precio)), cPre.x + cPre.w - 4, y + 6.4, { align: 'right' })
    y += ALTO_FILA
  })
  doc.setDrawColor(MARCA).setLineWidth(0.5).line(IZQ, y, IZQ + W_TABLA, y)

  doc.setFont('helvetica', 'italic').setFontSize(7.8).setTextColor(GRIS)
  doc.text('Precios por la unidad indicada, vigentes a la fecha de emisión de esta lista.', IZQ, y + 5)

  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    pie(doc, d, i, total)
  }
  doc.setProperties({ title: 'Lista de precios' })
  return { blob: doc.output('blob'), nombre: d.nombreArchivo }
}
