import { logoComoImagen } from '@/lib/ficha/logo'
import {
  GRIS,
  TINTA,
  bloqueEtiquetado,
  fechaLarga,
  firmas,
  lineaEmpresa,
  membrete,
  pieDePagina,
  seccion,
} from '@/lib/ficha/papel'
import { ABAJO, ANCHO_UTIL, CENTRO, IZQ } from '@/lib/ficha/hoja'

/*
  LA NOTA DE SALIDA

  «Cada salida de material que se haga, hacer una nota de salida (PDF)».

  QUÉ PRUEBA ESTE PAPEL

  Que esa cantidad de ese material salió de ese almacén, ese día, por ese motivo
  — y que alguien lo recibió. El almacén es lo segundo que más se pierde en una
  cantera después del combustible, y por el mismo camino: no desaparece un
  tambor entero, se van cinco de cada veinte sin que nadie firme nada.

  ES EL HERMANO DEL VALE DE COMBUSTIBLE

  Y se parece a propósito: el mismo membrete, el mismo recuadro con la cifra en
  grande, las mismas dos firmas. Quien maneja los dos papeles no debería tener
  que aprender dos formas de leer lo mismo.

  SIRVE PARA LAS TRES SALIDAS

  Sacar material, darlo de baja y mandarlo al taller son tres cosas distintas
  para el sistema, pero el papel que las respalda es el mismo: algo salió y
  alguien lo recibió. Lo que cambia es el rótulo del motivo, que se pasa hecho.

  LA RAYA DE QUIEN RECIBE VA EN BLANCO

  Porque hoy el sistema no captura quién retira el material — al revés que el
  vale de combustible, que sí lo exige. Se firma a mano, que es como funcionaba
  antes de que existiera el sistema, y el día que se capture el nombre se
  estampará aquí sin tocar nada más.
*/

export interface DatosNotaDeSalida {
  numero: string
  fecha: string

  almacen: string
  articuloCodigo: string
  articulo: string
  cantidad: string | number
  unidad: string

  /** «Salida a consumo», «Baja por daño», «Al taller»… ya en palabras. */
  clase: string
  motivo?: string | null

  costoUnitarioUsd?: string | number | null
  valorUsd?: string | number | null

  /** A dónde va, cuando se sabe: un taller, una unidad, un destino escrito. */
  destino?: string | null

  entrego?: string | null
  entregoFirma?: string | null

  empresa: { razonSocial: string; rif: string }
  momento: Date
}

export interface NotaArmada {
  blob: Blob
  nombre: string
}

function conUnidad(valor: string | number, unidad: string): string {
  return `${Number(valor).toLocaleString('es-VE', { maximumFractionDigits: 4 })} ${unidad}`
}

export async function armarNotaDeSalida(d: DatosNotaDeSalida): Promise<NotaArmada> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const logo = await logoComoImagen()

  let y = membrete(doc, logo, {
    titulo: 'NOTA DE SALIDA',
    subtitulo: `${d.numero}  ·  ${d.fecha}`,
    derecha: `Generado: ${fechaLarga(d.momento)}`,
  })

  y = lineaEmpresa(doc, y, `${d.empresa.razonSocial} · RIF ${d.empresa.rif}`)

  /*
    LO QUE SE COMPRUEBA ANTES DE FIRMAR

    La cantidad y qué es, en grande y centrado. Es lo único que mira quien está
    recibiendo, y si tiene que buscarlo entre ocho renglones iguales deja de
    mirarlo a la tercera vez.
  */
  const ALTO_CAJA = 30
  doc.setDrawColor(TINTA).setLineWidth(0.4)
  doc.rect(IZQ, y, ANCHO_UTIL, ALTO_CAJA)

  doc.setFont('helvetica', 'bold').setFontSize(22).setTextColor(TINTA)
  doc.text(conUnidad(d.cantidad, d.unidad), CENTRO, y + 12, { align: 'center' })

  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(TINTA)
  doc.text(d.articulo.toUpperCase(), CENTRO, y + 20, {
    align: 'center',
    maxWidth: ANCHO_UTIL - 8,
  })

  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(GRIS)
  doc.text(d.articuloCodigo, CENTRO, y + 25.5, { align: 'center' })

  y += ALTO_CAJA + 10

  y = bloqueEtiquetado(doc, y, 'La salida', [
    ['De qué almacén', d.almacen],
    ['Clase', d.clase],
    ['A dónde va', d.destino],
    ['Fecha', d.fecha],
    // El valor va en el papel porque una salida de almacén es un costo, y quien
    // firma tiene derecho a saber por cuánto está firmando.
    [
      'Valor',
      d.valorUsd != null
        ? `$ ${Number(d.valorUsd).toFixed(2)}${
            d.costoUnitarioUsd != null
              ? ` · $ ${Number(d.costoUnitarioUsd).toFixed(4)} por ${d.unidad.toLowerCase()}`
              : ''
          }`
        : null,
    ],
  ])

  if (d.motivo) {
    y = seccion(doc, y, 'Por qué sale')
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(TINTA)
    const lineas = doc.splitTextToSize(d.motivo, ANCHO_UTIL) as string[]
    doc.text(lineas, IZQ, y, { lineHeightFactor: 1.45 })
    y += lineas.length * 4.6 + 6
  }

  // Las firmas van a altura fija —abajo del todo— y por eso hay que comprobar
  // que lo de arriba no llegue hasta ahí. Un motivo largo se les echaría encima.
  if (y > ABAJO - 46) {
    doc.addPage()
    y = membrete(doc, logo, {
      titulo: 'NOTA DE SALIDA',
      subtitulo: `${d.numero}  ·  (continuación)`,
      derecha: null,
    })
  }

  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
  const aviso = doc.splitTextToSize(
    'Al firmar, quien recibe declara que se le entregó la cantidad indicada arriba. Esta nota respalda una salida de inventario y queda registrada en el libro de movimientos.',
    ANCHO_UTIL,
  ) as string[]
  doc.text(aviso, IZQ, Math.max(y + 4, ABAJO - 40), { lineHeightFactor: 1.4 })

  firmas(
    doc,
    ABAJO - 24,
    { texto: 'Entregó', nombre: d.entrego ?? null, imagen: d.entregoFirma ?? null },
    // Sin nombre: el sistema todavía no captura quién retira. Se firma a mano.
    { texto: 'Recibió conforme', nombre: null },
  )

  pieDePagina(doc, `Documento generado por el sistema · ${d.numero} · ${fechaLarga(d.momento)}`)

  doc.setProperties({ title: `Nota de salida ${d.numero} — ${d.articulo}` })

  return {
    blob: doc.output('blob'),
    nombre: `nota-salida-${d.numero.toLowerCase()}.pdf`,
  }
}
