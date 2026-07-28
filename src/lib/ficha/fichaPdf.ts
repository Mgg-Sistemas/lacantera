/**
 * La ficha completa en A4.
 *
 * El texto va como texto y no como imagen de una pantalla capturada: así se
 * puede buscar dentro del PDF, se imprime nítido a cualquier tamaño y el
 * archivo pesa decenas de kilobytes en vez de varios megas. La foto es lo único
 * que va como imagen, que es lo que es.
 *
 * La tipografía es Helvetica, no la Inter del sistema, porque es una de las
 * catorce fuentes que todo lector de PDF ya tiene. Incrustar Inter añadiría
 * unos 300 KB a cada ficha para ganar un parecido que en papel no se nota.
 *
 * jsPDF se carga solo cuando alguien pulsa el botón. Es la biblioteca más
 * pesada del proyecto y no tiene por qué estar en la primera pantalla.
 */

import { marcaComoImagen, MARCA_SOBRE_OSCURO } from './marca'
import { fotoRecortada, type Encuadre } from './encuadre'
import { EMPRESA } from '@/lib/empresa'

const AZUL = '#1D358F'
const AZUL_CLARO = '#B9C6F5'
const AZUL_CARGO = '#2B4FD9'
const TINTA = '#262C3D'
const GRIS = '#7B839A'
const HAIRLINE = '#EEF0F6'
const VERDE = '#2EA05A'
const VERDE_SUAVE = '#E6F4EC'

const IZQ = 14
const DER = 196
const ANCHO_COL = (DER - IZQ - 18) / 2
const COL2 = IZQ + ANCHO_COL + 18

export interface Campo {
  clave: string
  valor: string
  /** Ocupa las dos columnas. Para direcciones y notas. */
  ancho?: boolean
}

export interface Seccion {
  titulo: string
  campos: Campo[]
}

export interface DatosFicha {
  ficha: string
  nombreCompleto: string
  cargo: string
  departamento: string | null
  estado: string
  activo: boolean
  secciones: Seccion[]
  foto: HTMLImageElement | null
  encuadre: Encuadre
  emitidaPor: string
}

type Doc = import('jspdf').jsPDF

/** Recorta con puntos suspensivos lo que no cabe, en vez de dejarlo salirse. */
function ajustar(doc: Doc, texto: string, ancho: number): string {
  if (doc.getTextWidth(texto) <= ancho) return texto

  let corto = texto
  while (corto.length > 1 && doc.getTextWidth(`${corto}…`) > ancho) {
    corto = corto.slice(0, -1)
  }
  return `${corto.trimEnd()}…`
}

function encabezado(doc: Doc, d: DatosFicha) {
  doc.setFillColor(AZUL)
  doc.rect(0, 0, 210, 38, 'F')

  doc.addImage(marcaComoImagen(MARCA_SOBRE_OSCURO), 'PNG', IZQ, 9, 14, 14)

  doc.setTextColor('#FFFFFF')
  doc.setFont('helvetica', 'bold').setFontSize(15)
  doc.text(EMPRESA.razonSocial, IZQ + 17, 19)

  doc.setTextColor(AZUL_CLARO)
  doc.setFont('helvetica', 'normal').setFontSize(8)
  doc.text(
    `RIF ${EMPRESA.rif} · ${EMPRESA.actividad.toUpperCase()} · ${EMPRESA.estado.toUpperCase()}`,
    IZQ,
    30,
  )

  doc.setFontSize(9)
  doc.text('FICHA DEL TRABAJADOR', DER, 17, { align: 'right' })

  doc.setTextColor('#FFFFFF')
  doc.setFont('helvetica', 'bold').setFontSize(20)
  doc.text(`N° ${d.ficha}`, DER, 28, { align: 'right' })
}

function persona(doc: Doc, d: DatosFicha): number {
  const y = 48

  if (d.foto) {
    doc.addImage(fotoRecortada(d.foto, 32, 40, d.encuadre), 'JPEG', IZQ, y, 32, 40)
  } else {
    doc.setFillColor('#EEF0F6')
    doc.rect(IZQ, y, 32, 40, 'F')
    doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(8)
    doc.text('Sin foto', IZQ + 16, y + 21, { align: 'center' })
  }

  doc.setDrawColor('#E6E9F2').setLineWidth(0.3)
  doc.rect(IZQ, y, 32, 40)

  const x = IZQ + 40

  doc.setTextColor(TINTA).setFont('helvetica', 'bold').setFontSize(19)
  doc.text(ajustar(doc, d.nombreCompleto, DER - x), x, y + 11)

  doc.setTextColor(AZUL_CARGO).setFont('helvetica', 'normal').setFontSize(10)
  doc.text([d.cargo, d.departamento].filter(Boolean).join(' · '), x, y + 18)

  // La píldora de estado se dibuja a la medida del texto: una caja fija se ve
  // suelta con "Activo" y aprieta con "Egresado el 12/03/2027".
  doc.setFont('helvetica', 'bold').setFontSize(8)
  const ancho = doc.getTextWidth(d.estado) + 6

  doc.setFillColor(d.activo ? VERDE_SUAVE : '#FCEAEA')
  doc.roundedRect(x, y + 23, ancho, 6, 3, 3, 'F')
  doc.setTextColor(d.activo ? VERDE : '#DE3B40')
  doc.text(d.estado, x + 3, y + 27.2)

  return y + 48
}

function seccion(doc: Doc, s: Seccion, y: number): number {
  doc.setTextColor(AZUL_CARGO).setFont('helvetica', 'bold').setFontSize(8)
  doc.text(s.titulo.toUpperCase(), IZQ, y)

  doc.setDrawColor(AZUL_CARGO).setLineWidth(0.4)
  doc.line(IZQ, y + 1.8, DER, y + 1.8)

  let fila = y + 7.5
  let columna = 0

  for (const campo of s.campos) {
    const anchoDoble = campo.ancho === true

    // Un campo ancho empieza renglón: si viniera detrás de uno de media
    // columna se dibujaría encima de él, porque los dos arrancan en el margen.
    if (anchoDoble && columna === 1) {
      fila += 5.5
      columna = 0
    }

    const x = anchoDoble || columna === 0 ? IZQ : COL2
    const w = anchoDoble ? DER - IZQ : ANCHO_COL

    doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(8)
    doc.text(campo.clave, x, fila)

    doc.setTextColor(TINTA).setFont('helvetica', 'bold').setFontSize(8)
    // El valor se limita a lo que queda tras la etiqueta para que nunca la pise.
    const disponible = w - doc.getTextWidth(campo.clave) - 6
    doc.text(ajustar(doc, campo.valor, disponible), x + w, fila, { align: 'right' })

    doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
    doc.line(x, fila + 1.6, x + w, fila + 1.6)

    if (anchoDoble) {
      fila += 5.5
      columna = 0
    } else if (columna === 0) {
      columna = 1
    } else {
      columna = 0
      fila += 5.5
    }
  }

  return (columna === 1 ? fila + 5.5 : fila) + 4
}

function firmas(doc: Doc, y: number) {
  const ancho = (DER - IZQ - 20) / 2

  for (const [i, texto] of ['Firma del trabajador', 'Recursos humanos'].entries()) {
    const x = IZQ + i * (ancho + 20)
    doc.setDrawColor(TINTA).setLineWidth(0.4)
    doc.line(x, y, x + ancho, y)

    doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(8)
    doc.text(texto, x + ancho / 2, y + 4.5, { align: 'center' })
  }
}

function pie(doc: Doc, d: DatosFicha) {
  const y = 285

  doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
  doc.line(IZQ, y - 5, DER, y - 5)

  const hoy = new Date().toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(7.5)
  doc.text(`Emitida el ${hoy} por ${d.emitidaPor}`, IZQ, y)
  doc.text(`Documento interno · ${EMPRESA.razonSocial}`, DER, y, { align: 'right' })
}

export async function descargarFicha(d: DatosFicha): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  encabezado(doc, d)

  let y = persona(doc, d)
  for (const s of d.secciones) y = seccion(doc, s, y)

  firmas(doc, Math.max(y + 8, 240))
  pie(doc, d)

  doc.setProperties({
    title: `Ficha ${d.ficha} — ${d.nombreCompleto}`,
    subject: 'Ficha del trabajador',
    author: EMPRESA.razonSocial,
  })

  doc.save(`ficha-${d.ficha}-${d.nombreCompleto.split(' ').pop()?.toLowerCase() ?? ''}.pdf`)
}
