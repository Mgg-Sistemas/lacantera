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

import { logoComoImagen } from './logo'
import { fotoRecortada, type Encuadre } from './encuadre'
import type { ArchivoArmado } from './armado'
import { ABAJO, ajustar, DER, IZQ } from './hoja'
import {
  type EmpresaPapel,
  firmas as firmasCompartidas,
  GRIS,
  HAIRLINE,
  membrete,
  pieDePagina,
  ROTULO,
  TINTA,
  tituloDocumento,
} from './papel'

// La ficha se tiñe con la paleta compartida: los rótulos de sección en azul
// pizarra, como en todos los demás papeles. El verde se queda —es el único
// sitio donde el color dice un dato, activo o egresado— y ya no hay dos tintas
// distintas rondando el mismo documento.
const MARCA_SUAVE = ROTULO
const VERDE = '#2EA05A'
const VERDE_SUAVE = '#E6F4EC'

// La separación entre las dos columnas de datos baja de 18 a 10 mm: con 150 mm
// de ancho útil, 18 dejaba cada columna en 66 y los valores largos —una
// dirección, un contacto de emergencia— salían recortados a la mitad.
const SEPARA_COL = 10
const ANCHO_COL = (DER - IZQ - SEPARA_COL) / 2
const COL2 = IZQ + ANCHO_COL + SEPARA_COL

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
  empresa: EmpresaPapel
}

type Doc = import('jspdf').jsPDF

function persona(doc: Doc, d: DatosFicha, y: number): number {

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

  const x = IZQ + 38

  // 15 y no 19: con 112 mm de ancho, un nombre de cuatro palabras a cuerpo 19
  // se recortaba en todas las fichas menos las más cortas.
  doc.setTextColor(TINTA).setFont('helvetica', 'bold').setFontSize(15)
  doc.text(ajustar(doc, d.nombreCompleto, DER - x), x, y + 11)

  doc.setTextColor(MARCA_SUAVE).setFont('helvetica', 'normal').setFontSize(9)
  doc.text(
    ajustar(doc, [d.cargo, d.departamento].filter(Boolean).join(' · '), DER - x),
    x,
    y + 18,
  )

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
  doc.setTextColor(MARCA_SUAVE).setFont('helvetica', 'bold').setFontSize(8)
  doc.text(s.titulo.toUpperCase(), IZQ, y)

  doc.setDrawColor(MARCA_SUAVE).setLineWidth(0.4)
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

export async function armarFicha(d: DatosFicha): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen(400, true)
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = tituloDocumento(
    doc,
    membrete(doc, logo, { empresa: d.empresa, datos: [['FICHA N°', d.ficha]] }),
    'Ficha del trabajador',
  )

  y = persona(doc, d, y)
  for (const s of d.secciones) y = seccion(doc, s, y)

  // Las firmas bajan hasta donde llegue el contenido, pero nunca por debajo de
  // donde empieza el pie: antes el tope era 240 contando desde el borde, y con
  // el margen nuevo eso las metía dentro del pie.
  firmasCompartidas(
    doc,
    Math.min(Math.max(y + 8, ABAJO - 24), ABAJO - 16),
    'Firma del trabajador',
    'Recursos humanos',
  )

  const hoy = new Date().toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  // «Documento interno» sigue en el pie: la ficha lleva el salario y la
  // dirección de casa del trabajador, y quien la imprime tiene que ver de un
  // vistazo que ese papel no se le entrega a un tercero.
  pieDePagina(doc, `Emitida el ${hoy} por ${d.emitidaPor} · Documento interno`)

  doc.setProperties({
    title: `Ficha ${d.ficha} — ${d.nombreCompleto}`,
    subject: 'Ficha del trabajador',
    author: d.empresa.razonSocial,
  })

  return {
    blob: doc.output('blob'),
    nombre: `ficha-${d.ficha}-${d.nombreCompleto.split(' ').pop()?.toLowerCase() ?? ''}.pdf`,
  }
}
