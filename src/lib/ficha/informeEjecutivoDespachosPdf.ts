import { logoComoImagen } from '@/lib/ficha/logo'
import { ANCHO_HOJA, ALTO_HOJA, IZQ, DER, ARRIBA, ABAJO, ANCHO_UTIL, ajustar } from '@/lib/ficha/hoja'
import { TINTA, GRIS, GRIS_SUAVE, HAIRLINE, FILA_ALTERNA, fechaLarga, type EmpresaPapel } from '@/lib/ficha/papel'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import type { DetalleDespachos } from '@/lib/api/ventas'

/*
  LA PRESENTACIÓN, CON DATOS DE VERDAD

  El usuario trajo un informe armado fuera del sistema —portada oscura,
  tarjetas de colores, fotos— y pidió subirlo, generado desde la
  información real y al lado del botón que ya arma el papel de la casa.
  Es un segundo documento a propósito: el primero es el papel formal, rojo
  y marrón, igual que una factura o una orden de compra; este es la
  presentación, para enseñar o proyectar, y por eso se permite un lenguaje
  visual distinto —oscuro, con color— que el resto de los papeles no usa.

  LO QUE NO SE TRAE DEL ORIGINAL
  No hay categoría de cliente —«Público/Institucional», «Ferretero»— ni un
  reparto de «equipo humano» con roles inventados: ninguna de las dos
  cosas es un dato del sistema, y el acuerdo con el usuario fue no
  inventar ninguna. En su lugar, el reparto de clientes y destinos sale
  tal cual lo devuelve `resumen_despachos_detalle()` — nombres, cantidades
  y montos reales.
*/

export interface DatosInformeEjecutivo {
  resumen: {
    movimientos: number
    traslados: number
    notasVigentes: number
    totalUsd: string | number
    totalBs: string | number
  }
  detalle: DetalleDespachos
  empresa: EmpresaPapel
  emitidoPor: string
  momento: Date
}

const OSCURO = '#0b1726'
const PANEL_OSCURO = '#16283e'
const NARANJA = '#e1503c'
const AZUL = '#2f6fed'
const VERDE = '#1f9d55'
const MORADO = '#7c5cff'

const decimal2 = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const entero = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 0 })

const dinero = (v: string | number): string => decimal2.format(Number(v ?? 0))
const cantidadLegible = (v: string | number): string => {
  const n = Number(v ?? 0)
  return Number.isInteger(n) ? entero.format(n) : decimal2.format(n)
}

type Doc = import('jspdf').jsPDF

/**
 * Una tarjeta blanca con una barra de color a la izquierda: el mismo gesto
 * de cota que usa `StatCard` en pantalla, llevado al papel.
 *
 * EL VALOR SE ENCOGE ANTES DE RECORTARSE. Es la única cifra que importa de
 * la tarjeta —«$ 10.969,32» no puede quedar en «$ 10.9…»—, así que primero
 * se busca el tamaño al que cabe entero y solo si ni al mínimo entra se
 * recorta. Las posiciones son fracciones de `h` y no milímetros fijos para
 * que la misma función sirva en la tarjeta angosta de dos columnas y en la
 * ancha de una sola fila.
 */
function tarjetaKpi(
  doc: Doc,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  etiqueta: string,
  valor: string,
  nota?: string,
) {
  doc.setFillColor('#ffffff').setDrawColor(HAIRLINE).setLineWidth(0.2)
  doc.roundedRect(x, y, w, h, 2, 2, 'FD')
  doc.setFillColor(color)
  doc.roundedRect(x, y, 3, h, 1, 1, 'F')

  const util = w - 10

  doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(GRIS)
  doc.text(ajustar(doc, etiqueta.toUpperCase(), util), x + 7, y + h * 0.26)

  let talla = 15
  doc.setFont('helvetica', 'bold')
  while (talla > 9) {
    doc.setFontSize(talla)
    if (doc.getTextWidth(valor) <= util) break
    talla -= 1
  }
  doc.setFontSize(talla).setTextColor(TINTA)
  doc.text(ajustar(doc, valor, util), x + 7, y + h * 0.58)

  if (nota) {
    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(GRIS_SUAVE)
    const lineas = (doc.splitTextToSize(nota, util) as string[]).slice(0, 2)
    doc.text(lineas, x + 7, y + h * 0.78, { lineHeightFactor: 1.25 })
  }
}

/** Un rótulo de sección, en el idioma de esta presentación y no en el de
 *  `papel.ts`: versalitas en el acento de color, no en el marrón de la casa. */
function tituloSeccion(doc: Doc, y: number, ojo: string, titulo: string, color: string): number {
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(color)
  doc.text(ojo.toUpperCase(), IZQ, y)
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(TINTA)
  doc.text(titulo, IZQ, y + 7)
  return y + 16
}

function piePresentacion(doc: Doc, texto: string) {
  const paginas = doc.getNumberOfPages()
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p)
    if (p === 1) continue
    doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
    doc.line(IZQ, ABAJO + 3, DER, ABAJO + 3)
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(GRIS_SUAVE)
    doc.text(texto, IZQ, ABAJO + 7)
    doc.text(`${p - 1} / ${paginas - 1}`, DER, ABAJO + 7, { align: 'right' })
  }
}

export async function armarInformeEjecutivoDespachos(
  d: DatosInformeEjecutivo,
): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  const porM3 = d.detalle.por_articulo.filter((a) => a.unidad === 'M3')
  const totalM3 = porM3.reduce((s, a) => s + Number(a.cantidad), 0)
  const mayorProducto = porM3[0]?.articulo ?? null

  // ───────────────────────────────────────────────────────────────────────
  // PORTADA
  // ───────────────────────────────────────────────────────────────────────
  doc.setFillColor(OSCURO).rect(0, 0, ANCHO_HOJA, ALTO_HOJA, 'F')

  if (logo) doc.addImage(logo, 'PNG', IZQ, 22, 22, 22)

  doc.setFillColor(PANEL_OSCURO)
  doc.roundedRect(IZQ, 58, 95, 9, 4.5, 4.5, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(NARANJA)
  doc.text(`SISTEMA ADMINISTRATIVO · RIF ${d.empresa.rif}`, IZQ + 5, 63.5)

  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(NARANJA)
  doc.text('REPORTE CONSOLIDADO DE MOVIMIENTOS', IZQ, 82)

  doc.setFont('helvetica', 'bold').setFontSize(25).setTextColor('#ffffff')
  const tituloLineas = doc.splitTextToSize(
    'Informe General de Despachos, Traslados y Notas de Entrega',
    ANCHO_UTIL,
  ) as string[]
  doc.text(tituloLineas, IZQ, 95, { lineHeightFactor: 1.25 })

  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor('#aab4c4')
  const subtitulo = doc.splitTextToSize(
    'Análisis operativo de volumen despachado, destinos y balance financiero comercial, calculado con lo registrado en el sistema.',
    ANCHO_UTIL - 20,
  ) as string[]
  doc.text(subtitulo, IZQ, 95 + tituloLineas.length * 9 + 6, { lineHeightFactor: 1.4 })

  doc.setDrawColor('#2a3b52').setLineWidth(0.3)
  doc.line(IZQ, ABAJO - 2, DER, ABAJO - 2)
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor('#7e8ba0')
  doc.text('CIERRE DE REPORTE', IZQ, ABAJO + 5)
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor('#ffffff')
  doc.text(fechaLarga(d.momento), IZQ, ABAJO + 10)

  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor('#7e8ba0')
  doc.text('EMITIDO POR', IZQ + 70, ABAJO + 5)
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor('#ffffff')
  doc.text(d.emitidoPor, IZQ + 70, ABAJO + 10)

  // ───────────────────────────────────────────────────────────────────────
  // BALANCE CONSOLIDADO
  // ───────────────────────────────────────────────────────────────────────
  doc.addPage()
  let y = tituloSeccion(
    doc,
    ARRIBA + 4,
    'Desempate global de operaciones',
    'Balance consolidado',
    NARANJA,
  )

  /*
    DOS COLUMNAS, NO CUATRO.

    Con cuatro tarjetas en la misma fila el hueco útil bajaba a 24 mm: «$
    10.969,32» no cabía ni encogiendo la letra al mínimo y salía recortado
    en «$ 10.9…», que es precisamente lo que el encogido de `tarjetaKpi`
    existe para evitar. Dos columnas dejan 62 mm de hueco, que es lo que
    piden las cifras más largas que de verdad salen aquí.
  */
  const anchoKpi = (ANCHO_UTIL - 5) / 2
  const altoKpi = 24
  const kpis = [
    { color: NARANJA, etiqueta: 'Notas emitidas', valor: cantidadLegible(d.resumen.notasVigentes) },
    { color: VERDE, etiqueta: 'Monto total ($)', valor: `$ ${dinero(d.resumen.totalUsd)}` },
    {
      color: AZUL,
      etiqueta: 'm³ despachado',
      valor: `${cantidadLegible(totalM3)} m³`,
      nota: mayorProducto ? `Mayor producto: ${mayorProducto}` : undefined,
    },
    { color: MORADO, etiqueta: 'Movimientos de salida', valor: cantidadLegible(d.resumen.movimientos) },
  ]
  kpis.forEach((k, i) => {
    const fila = Math.floor(i / 2)
    const columna = i % 2
    tarjetaKpi(
      doc,
      IZQ + columna * (anchoKpi + 5),
      y + fila * (altoKpi + 5),
      anchoKpi,
      altoKpi,
      k.color,
      k.etiqueta,
      k.valor,
      k.nota,
    )
  })
  y += 2 * altoKpi + 5 + 10

  tarjetaKpi(
    doc,
    IZQ,
    y,
    ANCHO_UTIL,
    20,
    VERDE,
    'Bolívares totales registrados',
    `Bs ${dinero(d.resumen.totalBs)}`,
    `${cantidadLegible(d.resumen.traslados)} traslado${d.resumen.traslados === 1 ? '' : 's'} entre almacenes en el mismo período.`,
  )
  y += 30

  if (porM3.length > 0) {
    y = tituloSeccion(doc, y, 'Volumen por producto', 'Distribución volumétrica', AZUL)
    const anchoProducto = (ANCHO_UTIL - 2 * 5) / Math.min(porM3.length, 3)
    porM3.slice(0, 3).forEach((p, i) => {
      const pct = totalM3 > 0 ? (Number(p.cantidad) / totalM3) * 100 : 0
      const x = IZQ + i * (anchoProducto + 5)
      doc.setFillColor(FILA_ALTERNA).setDrawColor(HAIRLINE).roundedRect(x, y, anchoProducto, 30, 2, 2, 'FD')
      doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(TINTA)
      doc.text(ajustar(doc, p.articulo, anchoProducto - 8), x + 4, y + 7)
      doc.setFont('helvetica', 'bold').setFontSize(13)
      doc.text(`${cantidadLegible(p.cantidad)} m³`, x + 4, y + 15)
      // La barra de porcentaje.
      doc.setFillColor(HAIRLINE).rect(x + 4, y + 19, anchoProducto - 8, 2, 'F')
      doc.setFillColor(AZUL).rect(x + 4, y + 19, ((anchoProducto - 8) * pct) / 100, 2, 'F')
      doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(GRIS)
      doc.text(`${decimal2.format(pct)} % del volumen`, x + 4, y + 26)
    })
    y += 38
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRINCIPALES DESTINOS Y CLIENTES
  // ───────────────────────────────────────────────────────────────────────
  if (y > ABAJO - 60) {
    doc.addPage()
    y = ARRIBA + 4
  }

  if (d.detalle.por_destino.length > 0) {
    y = tituloSeccion(doc, y, 'A dónde fue el material', 'Principales destinos', MORADO)
    d.detalle.por_destino.slice(0, 6).forEach((r) => {
      doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(TINTA)
      doc.text(ajustar(doc, r.destino, ANCHO_UTIL - 30), IZQ, y)
      doc.setFont('helvetica', 'bold').setTextColor(MORADO)
      doc.text(
        `${r.movimientos} movimiento${r.movimientos === 1 ? '' : 's'}`,
        DER,
        y,
        { align: 'right' },
      )
      doc.setDrawColor(HAIRLINE).setLineWidth(0.15)
      doc.line(IZQ, y + 2.5, DER, y + 2.5)
      y += 8
    })
    y += 6
  }

  if (d.detalle.por_cliente.length > 0) {
    if (y > ABAJO - 50) {
      doc.addPage()
      y = ARRIBA + 4
    }
    y = tituloSeccion(doc, y, 'Quién compró más', 'Principales clientes', VERDE)
    d.detalle.por_cliente.slice(0, 6).forEach((r) => {
      doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(TINTA)
      doc.text(ajustar(doc, r.cliente, ANCHO_UTIL - 35), IZQ, y)
      doc.setFont('helvetica', 'bold').setTextColor(VERDE)
      doc.text(`$ ${dinero(r.monto_usd)}`, DER, y, { align: 'right' })
      doc.setDrawColor(HAIRLINE).setLineWidth(0.15)
      doc.line(IZQ, y + 2.5, DER, y + 2.5)
      y += 8
    })
  }

  piePresentacion(
    doc,
    `${d.empresa.razonSocial} · Generado por el sistema · ${fechaLarga(d.momento)}`,
  )

  doc.setProperties({ title: 'Informe General de Despachos, Traslados y Notas de Entrega' })

  return {
    blob: doc.output('blob'),
    nombre: 'informe-general-de-despachos-traslados-y-notas-de-entrega.pdf',
  }
}
