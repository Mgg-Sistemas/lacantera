import { logoComoImagen } from '@/lib/ficha/logo'
import { ARRIBA, ABAJO, IZQ, ANCHO_UTIL, ajustar } from '@/lib/ficha/hoja'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import {
  membrete,
  tituloDocumento,
  lineaEmpresa,
  seccion,
  etiquetaValor,
  pieDePagina,
  fechaLarga,
  fechaCorta,
  TINTA,
  GRIS,
  GRIS_SUAVE,
  HAIRLINE,
  FILA_ALTERNA,
} from '@/lib/ficha/papel'

/*
  EL DIRECTORIO DE PERSONAL, CON FOTO

  Se pidió aparte del «Informe de personal» de siempre —ese es texto, sin
  montos, y lo puede sacar cualquiera que entra a la pantalla (ver
  `informePersonalPdf.ts`)—. Este lleva la cara de cada quien al lado de lo
  básico, y por eso es solo para el administrador: una lista con fotos de
  todo el personal es un dato más sensible que una tabla de nombres, y así
  se pidió.

  NO ES UNA TABLA DE `papel.ts`, ES UNA FILA DIBUJADA A MANO

  `tabla()` reparte texto en columnas; no sabe de imágenes. Cada renglón se
  pinta aquí con su propio `doc.addImage`, con la misma altura fija, y la
  paginación se vigila fila por fila porque no hay cabecera de columnas que
  repetir al cambiar de hoja — solo personas, una debajo de otra.

  LA FOTO YA LLEGA RECORTADA

  Quien llama a esto ya bajó la foto del almacén y la recortó con el
  encuadre de cada persona —`fotoRecortada`, la misma cuenta que usan los
  carnets—, de una en una y no todas a la vez: veinte descargas del almacén
  al mismo tiempo se rechazan a medias, y una foto a medio descargar no
  puede colgar el documento entero. Aquí solo se coloca lo que ya resolvió.
  Sin foto —no tiene, o no cargó—, el recuadro queda vacío y dice «Sin
  foto»: no se inventa una cara.
*/

export interface PersonaDelDirectorio {
  ficha: string
  nombre: string
  cedula: string
  cargo: string
  departamento: string | null
  fechaIngreso: string
  /** Ya recortada con el encuadre de la persona, lista para `addImage`. Nula sin foto. */
  fotoDataUrl: string | null
}

export interface DatosDirectorioPersonal {
  personas: PersonaDelDirectorio[]
  /** Lo que el filtro de la pantalla dejó fuera, dicho en palabras. */
  filtro?: string | null
  empresa: { razonSocial: string; rif: string }
  emitidoPor: string
  momento: Date
}

const ALTO_FILA = 20
const ANCHO_FOTO = 16
const ALTO_FOTO = 18

export async function armarDirectorioPersonal(
  d: DatosDirectorioPersonal,
): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [['Generado', fechaLarga(d.momento)]],
  })

  y = tituloDocumento(doc, y, 'Directorio de personal')

  y = lineaEmpresa(
    doc,
    y,
    `${d.empresa.razonSocial} · RIF ${d.empresa.rif} · Sistema administrativo`,
  )

  y = seccion(doc, y, 'Alcance')
  y = etiquetaValor(doc, y, [
    ['Personas', String(d.personas.length)],
    ['Filtro aplicado', d.filtro || 'Ninguno: se lista todo el personal'],
    ['Emitido por', d.emitidoPor],
  ])

  y = seccion(doc, y, 'Directorio')

  const xTexto = IZQ + ANCHO_FOTO + 5
  const anchoTexto = ANCHO_UTIL - ANCHO_FOTO - 5

  d.personas.forEach((p, i) => {
    if (y + ALTO_FILA > ABAJO) {
      doc.addPage()
      y = ARRIBA
    }

    if (i % 2 === 1) {
      doc.setFillColor(FILA_ALTERNA)
      doc.rect(IZQ, y, ANCHO_UTIL, ALTO_FILA, 'F')
    }

    if (p.fotoDataUrl) {
      try {
        doc.addImage(p.fotoDataUrl, 'JPEG', IZQ + 1, y + 1, ANCHO_FOTO, ALTO_FOTO)
      } catch {
        // Una foto que jsPDF no sepa leer no puede tumbar el directorio entero:
        // esa fila sale sin ella, igual que un carnet sin foto decodificable.
      }
    } else {
      doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
      doc.rect(IZQ + 1, y + 1, ANCHO_FOTO, ALTO_FOTO)
      doc.setFont('helvetica', 'normal').setFontSize(6).setTextColor(GRIS_SUAVE)
      doc.text('Sin foto', IZQ + 1 + ANCHO_FOTO / 2, y + 1 + ALTO_FOTO / 2, {
        align: 'center',
      })
    }

    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(TINTA)
    doc.text(ajustar(doc, p.nombre, anchoTexto), xTexto, y + 5.5)

    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
    doc.text(
      ajustar(doc, [p.cargo, p.departamento].filter(Boolean).join(' · '), anchoTexto),
      xTexto,
      y + 10.5,
    )

    doc.setFontSize(7).setTextColor(GRIS_SUAVE)
    doc.text(
      `Ficha ${p.ficha} · ${p.cedula} · desde ${fechaCorta(p.fechaIngreso)}`,
      xTexto,
      y + 15.5,
    )

    y += ALTO_FILA
  })

  pieDePagina(
    doc,
    `Documento generado por el sistema · Directorio de personal · ${fechaLarga(d.momento)}`,
  )

  doc.setProperties({ title: 'Directorio de personal' })

  return { blob: doc.output('blob'), nombre: 'directorio-de-personal.pdf' }
}
