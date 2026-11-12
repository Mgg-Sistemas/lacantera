import { logoComoImagen } from '@/lib/ficha/logo'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { documento } from '@/lib/formato'
import { fechaLarga, MARCA, ROTULO, TINTA, GRIS, FILA_ALTERNA, HAIRLINE, type EmpresaPapel } from '@/lib/ficha/papel'

/*
  LA PLANILLA DE ENTRADA PARA LLENAR A MANO (12/11/2026).

  Pedido: «una nueva plantilla en PDF para ser llenada a mano (bolígrafo) que
  tenga los datos básicos para entrada de artículos en inventario, compatible
  con el sistema de inventario actual».

  Es el formulario «Entrada de material» puesto en papel, con los MISMOS
  campos en el MISMO orden —almacén, artículo, cantidad, costo, moneda,
  «donación o no se sabe cuánto costó», referencia, procedencia— para que
  quien la pase al sistema copie casilla por casilla sin interpretar. Lo que
  se elige de una lista en pantalla aquí se marca (almacenes, moneda) o se
  copia de una lista impresa (unidades, categorías, y si se pide, el
  catálogo): así nadie inventa un almacén ni una unidad que el sistema no
  conoce. Las listas se leen de la base al imprimir: un almacén nuevo sale
  solo.

  Al pie, «Pasado al sistema» con el número de movimiento: enlaza el papel
  archivado con el asiento del libro.
*/

type Doc = InstanceType<typeof import('jspdf').jsPDF>

export interface DatosPlanillaDeEntrada {
  /** Los almacenes donde se recibe, ya en orden; el subalmacén dice de quién cuelga. */
  almacenes: Array<{ nombre: string; padre: string | null }>
  unidades: string[]
  categorias: string[]
  /** Para la hoja del catálogo; vacío si no se pidió. */
  catalogo: Array<{ codigo: string; nombre: string; categoria: string; unidad: string }>
  conCatalogo: boolean
  conLogo: boolean
  empresa: EmpresaPapel
  emitidoPor: string
  momento: Date
  nombreArchivo: string
}

// A4 horizontal, en milímetros.
const ANCHO_HOJA = 297
const ALTO_HOJA = 210
const IZQ = 12
const DER = ANCHO_HOJA - 12
const ANCHO = DER - IZQ
const RENGLONES = 12

function casilla(doc: Doc, x: number, y: number, lado = 3.2) {
  doc.setDrawColor(TINTA).setLineWidth(0.3).rect(x, y - lado + 0.4, lado, lado)
}

/** Una raya para escribir encima, con su rótulo delante. */
function raya(doc: Doc, rotulo: string, x: number, y: number, ancho: number) {
  doc.setFont('helvetica', 'bold').setFontSize(7.6).setTextColor(ROTULO)
  doc.text(rotulo, x, y)
  const xr = x + doc.getTextWidth(rotulo) + 2
  doc.setDrawColor('#9a948f').setLineWidth(0.25).line(xr, y + 0.6, x + ancho, y + 0.6)
}

function cabecera(doc: Doc, logo: string, d: DatosPlanillaDeEntrada, titulo: string, conCasillas: boolean): number {
  const y = 11
  const LADO = 17
  if (logo) doc.addImage(logo, 'PNG', IZQ, y, LADO, LADO)
  const x = logo ? IZQ + LADO + 4 : IZQ
  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(MARCA)
  doc.text(d.empresa.razonSocial, x, y + 6)
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(ROTULO)
  doc.text(`RIF: ${documento(d.empresa.rif)}`, x, y + 11)
  if (d.empresa.actividad) {
    doc.setFont('helvetica', 'normal').setTextColor(GRIS)
    doc.text(d.empresa.actividad, x, y + 15)
  }

  const W = 100
  const xr = DER - W
  doc.setFillColor(MARCA).rect(xr, y, W, 8, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor('#ffffff')
  doc.text(titulo, xr + W / 2, y + 5.6, { align: 'center' })
  doc.setDrawColor(HAIRLINE).setLineWidth(0.3).setFillColor(FILA_ALTERNA).rect(xr, y + 8, W, 10, 'FD')
  if (conCasillas) {
    raya(doc, 'N°', xr + 4, y + 14.6, 40)
    raya(doc, 'FECHA', xr + 48, y + 14.6, W - 52)
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor('#9a948f')
    doc.text('/          /', xr + 75, y + 14.2)
  } else {
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(GRIS)
    const dia = d.momento.toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })
    doc.text(`Al ${dia}`, xr + W / 2, y + 14.4, { align: 'center' })
  }

  const yl = y + LADO + 3
  doc.setDrawColor(MARCA).setLineWidth(0.6).line(IZQ, yl, DER, yl)
  return yl + 5
}

function pie(doc: Doc, d: DatosPlanillaDeEntrada, pagina: number, total: number) {
  doc.setFont('helvetica', 'normal').setFontSize(6.8).setTextColor(GRIS)
  doc.text(
    `Planilla para llenar a mano. Se pasa al sistema en Inventario › Registrar entrada. Generada el ${fechaLarga(d.momento)}${d.emitidoPor ? ` por ${d.emitidoPor}` : ''}.`,
    IZQ,
    ALTO_HOJA - 6,
  )
  doc.text(`Página ${pagina} de ${total}`, DER, ALTO_HOJA - 6, { align: 'right' })
}

/** Texto corrido que parte en líneas; devuelve dónde terminó. */
function corrido(doc: Doc, texto: string, x: number, y: number, ancho: number, lineas = 2): number {
  const partes = (doc.splitTextToSize(texto, ancho) as string[]).slice(0, lineas)
  doc.text(partes, x, y, { lineHeightFactor: 1.25 })
  return y + partes.length * 3
}

export async function armarPlanillaDeEntrada(d: DatosPlanillaDeEntrada): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = d.conLogo ? await logoComoImagen(600, false) : ''
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true })

  let y = cabecera(doc, logo, d, 'PLANILLA DE ENTRADA DE MATERIAL', true)

  // ── Almacén de destino: casillas, como el desplegable de la pantalla.
  doc.setFont('helvetica', 'bold').setFontSize(7.6).setTextColor(ROTULO)
  doc.text('ALMACÉN DE DESTINO (marque uno):', IZQ, y + 1)
  let x = IZQ + 50
  let yy = y + 1
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(TINTA)
  for (const a of d.almacenes) {
    const rotulo = a.padre ? `${a.nombre} (en ${a.padre})` : a.nombre
    const w = doc.getTextWidth(rotulo) + 9
    if (x + w > DER) {
      x = IZQ + 50
      yy += 5
    }
    casilla(doc, x, yy)
    doc.text(rotulo, x + 4.6, yy)
    x += w
  }
  y = yy + 6.5

  raya(doc, 'REFERENCIA (quién lo trajo, o N° de factura de fuera):', IZQ, y, ANCHO * 0.5 - 4)
  raya(doc, 'PROCEDENCIA (de dónde vino):', IZQ + ANCHO * 0.5 + 2, y, ANCHO * 0.5 - 2)
  y += 4.5

  // ── La tabla de artículos.
  const cols: Array<{ t: string; s?: string; w: number }> = [
    { t: 'N°', w: 8 },
    { t: 'CÓDIGO', s: '(si lo sabe)', w: 24 },
    { t: 'ARTÍCULO', s: 'nombre como está en el catálogo', w: 72 },
    { t: 'UNIDAD', w: 17 },
    { t: 'CANTIDAD', w: 22 },
    { t: 'COSTO UNITARIO', w: 27 },
    { t: 'MONEDA', s: 'marque una', w: 21 },
    { t: 'DONACIÓN /', s: 'no se sabe el costo', w: 23 },
    { t: 'OTRO ALMACÉN', s: 'solo si no es el de arriba', w: 43 },
    { t: 'NUEVO', s: 'no catalogado', w: 16 },
  ]
  const ALTO_CAB = 8.5
  const ALTO_FILA = 7.4
  doc.setFillColor(MARCA).rect(IZQ, y, ANCHO, ALTO_CAB, 'F')
  x = IZQ
  for (const c of cols) {
    doc.setFont('helvetica', 'bold').setFontSize(6.9).setTextColor('#ffffff')
    doc.text(c.t, x + c.w / 2, y + (c.s ? 3.7 : 5.4), { align: 'center' })
    if (c.s) {
      doc.setFont('helvetica', 'normal').setFontSize(5.4)
      doc.text(c.s, x + c.w / 2, y + 6.9, { align: 'center', maxWidth: c.w - 1 })
    }
    x += c.w
  }
  y += ALTO_CAB
  const yTabla = y
  for (let i = 0; i < RENGLONES; i++) {
    if (i % 2 === 1) doc.setFillColor(FILA_ALTERNA).rect(IZQ, y, ANCHO, ALTO_FILA, 'F')
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
    doc.text(String(i + 1), IZQ + 4, y + 4.9, { align: 'center' })
    // Moneda: dos casillas; donación y nuevo: una, centrada.
    let xc = IZQ
    for (const c of cols) {
      if (c.t === 'MONEDA') {
        casilla(doc, xc + 2.5, y + 5)
        doc.setFontSize(7.5).setTextColor(TINTA).text('Bs', xc + 6.4, y + 4.9)
        casilla(doc, xc + 11.5, y + 5)
        doc.text('$', xc + 15.4, y + 4.9)
      } else if (c.t === 'DONACIÓN /' || c.t === 'NUEVO') {
        casilla(doc, xc + c.w / 2 - 1.6, y + 5)
      }
      xc += c.w
    }
    y += ALTO_FILA
    doc.setDrawColor(HAIRLINE).setLineWidth(0.25).line(IZQ, y, DER, y)
  }
  // Las divisiones verticales y el marco.
  x = IZQ
  doc.setDrawColor('#c9c3bd').setLineWidth(0.25)
  for (const c of cols.slice(0, -1)) {
    x += c.w
    doc.line(x, yTabla, x, y)
  }
  doc.setDrawColor(MARCA).setLineWidth(0.4).rect(IZQ, yTabla - ALTO_CAB, ANCHO, y - yTabla + ALTO_CAB)
  y += 3.6

  doc.setFont('helvetica', 'bold').setFontSize(6.8).setTextColor(ROTULO)
  doc.text('UNIDADES VÁLIDAS:', IZQ, y)
  doc.setFont('helvetica', 'normal').setTextColor(TINTA)
  y = corrido(doc, d.unidades.join('  ·  '), IZQ + 25, y, ANCHO - 25, 1) + 1.2

  // ── Abajo: los artículos nuevos a la izquierda, las firmas a la derecha.
  const yAbajo = y
  const W_NUEVOS = 150
  const colsN = [
    { t: 'RENGLÓN N°', w: 18 },
    { t: 'NOMBRE DEL ARTÍCULO NUEVO', w: 72 },
    { t: 'CATEGORÍA', w: 36 },
    { t: 'UNIDAD', w: 24 },
  ]
  doc.setFillColor(ROTULO).rect(IZQ, y, W_NUEVOS, 5.5, 'F')
  x = IZQ
  doc.setFont('helvetica', 'bold').setFontSize(6.6).setTextColor('#ffffff')
  for (const c of colsN) {
    doc.text(c.t, x + c.w / 2, y + 3.8, { align: 'center' })
    x += c.w
  }
  y += 5.5
  const yN = y
  for (let i = 0; i < 3; i++) {
    y += 6.6
    doc.setDrawColor(HAIRLINE).setLineWidth(0.25).line(IZQ, y, IZQ + W_NUEVOS, y)
  }
  x = IZQ
  doc.setDrawColor('#c9c3bd')
  for (const c of colsN.slice(0, -1)) {
    x += c.w
    doc.line(x, yN, x, y)
  }
  doc.setDrawColor(ROTULO).setLineWidth(0.35).rect(IZQ, yN - 5.5, W_NUEVOS, y - yN + 5.5)
  y += 3
  doc.setFont('helvetica', 'bold').setFontSize(6.4).setTextColor(ROTULO)
  doc.text('CATEGORÍAS:', IZQ, y)
  doc.setFont('helvetica', 'normal').setTextColor(TINTA)
  corrido(doc, d.categorias.join('  ·  '), IZQ + 17, y, W_NUEVOS - 17, 2)

  const xF = IZQ + W_NUEVOS + 4
  const wF = (DER - xF - 4) / 3
  const altoF = 34
  const firmas: Array<{ t: string; lineas: string[] }> = [
    { t: 'ENTREGADO POR', lineas: ['Nombre', 'C.I.', 'Firma'] },
    { t: 'RECIBIDO POR (ALMACÉN)', lineas: ['Nombre', 'C.I.', 'Firma'] },
    { t: 'PASADO AL SISTEMA', lineas: ['Por', 'Fecha', 'N° MOV-'] },
  ]
  firmas.forEach((f, i) => {
    const xf = xF + i * (wF + 2)
    doc.setDrawColor(i === 2 ? MARCA : '#c9c3bd').setLineWidth(i === 2 ? 0.45 : 0.3).rect(xf, yAbajo, wF, altoF)
    doc.setFillColor(i === 2 ? MARCA : FILA_ALTERNA).rect(xf, yAbajo, wF, 5.5, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(6.6).setTextColor(i === 2 ? '#ffffff' : ROTULO)
    doc.text(f.t, xf + wF / 2, yAbajo + 3.8, { align: 'center' })
    f.lineas.forEach((l, j) => raya(doc, l, xf + 2.5, yAbajo + 13 + j * 8.5, wF - 5))
  })

  // ── La hoja del catálogo, si se pidió.
  if (d.conCatalogo && d.catalogo.length > 0) {
    doc.addPage()
    let yc = cabecera(doc, logo, d, 'ARTÍCULOS DEL CATÁLOGO', false)
    doc.setFont('helvetica', 'normal').setFontSize(7.8).setTextColor(GRIS)
    doc.text(
      'Para escribir en la planilla el código y el nombre tal como están en el sistema. Lo que no esté aquí se marca «Nuevo».',
      IZQ,
      yc,
    )
    yc += 4
    const colsC = [
      { t: 'CÓDIGO', w: 34 },
      { t: 'ARTÍCULO', w: 150 },
      { t: 'CATEGORÍA', w: 62 },
      { t: 'UNIDAD', w: 27 },
    ]
    const encabezado = () => {
      doc.setFillColor(MARCA).rect(IZQ, yc, ANCHO, 7, 'F')
      let xx = IZQ
      doc.setFont('helvetica', 'bold').setFontSize(7.6).setTextColor('#ffffff')
      for (const c of colsC) {
        doc.text(c.t, xx + 3, yc + 4.8)
        xx += c.w
      }
      yc += 7
    }
    encabezado()
    d.catalogo.forEach((a, i) => {
      if (yc + 6 > ALTO_HOJA - 12) {
        doc.addPage()
        yc = cabecera(doc, logo, d, 'ARTÍCULOS DEL CATÁLOGO', false)
        encabezado()
      }
      if (i % 2 === 1) doc.setFillColor(FILA_ALTERNA).rect(IZQ, yc, ANCHO, 6, 'F')
      let xx = IZQ
      const valores = [a.codigo, a.nombre, a.categoria, a.unidad]
      colsC.forEach((c, j) => {
        doc.setFont('helvetica', j === 1 ? 'bold' : 'normal').setFontSize(8).setTextColor(j === 0 ? GRIS : TINTA)
        doc.text(valores[j], xx + 3, yc + 4.2, { maxWidth: c.w - 5 })
        xx += c.w
      })
      yc += 6
    })
    doc.setDrawColor(MARCA).setLineWidth(0.4).line(IZQ, yc, DER, yc)
  }

  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    pie(doc, d, i, total)
  }
  doc.setProperties({ title: 'Planilla de entrada de material' })
  return { blob: doc.output('blob'), nombre: d.nombreArchivo }
}
