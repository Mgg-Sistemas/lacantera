/**
 * Los dos papeles de la maquinaria: la ficha técnica de un equipo y el
 * informe de la flota entera.
 *
 * Hasta hoy maquinaria era el único módulo grande que no imprimía nada. Se
 * podía ver todo en pantalla y no sacar nada de ahí: ni la ficha para
 * acompañar un equipo que se presta o se lleva al taller, ni el listado para
 * un inventario de activos o para enseñarle a la Gobernación qué es suyo y en
 * qué estado está.
 *
 * LOS DOS SALEN DE AQUÍ Y NO DE DOS ARCHIVOS
 *
 * Comparten la mitad: el membrete, cómo se nombra un estado, cómo se escribe
 * «no hay dato». Separados, esa mitad se escribiría dos veces y en la segunda
 * corrección dirían cosas distintas en cada papel.
 *
 * Como en todos los papeles del sistema, jsPDF se carga solo cuando alguien
 * pulsa el botón: es la biblioteca más pesada del proyecto y no tiene por qué
 * estar en la primera pantalla.
 */

import { logoComoImagen } from './logo'
import type { ArchivoArmado } from './armado'
import { ABAJO, ARRIBA, DER, IZQ } from './hoja'
import {
  type Columna,
  type EmpresaPapel,
  etiquetaValor,
  fechaLarga,
  GRIS,
  membrete,
  notaAlPie,
  pieDePagina,
  seccion,
  tabla,
  TINTA,
  tituloDocumento,
} from './papel'

type Doc = import('jspdf').jsPDF

/**
 * El guion cuando no hay dato.
 *
 * Una celda vacía en un papel se lee como un descuido —«se les olvidó
 * ponerlo»—; un guion dice que el sistema lo miró y no había nada. En una
 * ficha de equipo la diferencia importa: hoy muchos de estos campos están
 * vacíos porque nadie los ha cargado todavía, y el papel no debe disimularlo.
 */
const SIN_DATO = '—'

const texto = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined) return SIN_DATO
  const s = String(v).trim()
  return s === '' ? SIN_DATO : s
}

// ---------------------------------------------------------------------------
// LA FICHA TÉCNICA DE UN EQUIPO
// ---------------------------------------------------------------------------

/** Un apartado de la ficha. Las filas son [qué se pregunta, qué responde]. */
export interface SeccionDeFicha {
  titulo: string
  filas: Array<[string, string | null | undefined]>
}

export interface DatosFichaMaquina {
  codigo: string
  nombre: string
  /** «Maquinaria · Excavadora». Lo que es, en una línea. */
  queEs: string
  /** «Activa», «Fuera de servicio». Ya traducido: aquí no se traduce nada. */
  estado: string
  secciones: SeccionDeFicha[]
  /** Lo que no cabe en un campo. Se imprime entero, no recortado. */
  nota: string | null
  emitidaPor: string
  momento: Date
  empresa: EmpresaPapel
}

/**
 * La cabecera de la ficha: qué equipo es, de un golpe.
 *
 * El código va grande y arriba porque es con lo que se le nombra en el patio
 * y en todos los papeles; el nombre debajo. Al revés —nombre grande, código
 * pequeño— obliga a buscar el código, que es justo el dato con el que alguien
 * llega a este papel.
 */
function encabezado(doc: Doc, d: DatosFichaMaquina, y: number): number {
  doc.setTextColor(TINTA).setFont('helvetica', 'bold').setFontSize(17)
  doc.text(d.codigo, IZQ, y + 6)

  doc.setTextColor(TINTA).setFont('helvetica', 'bold').setFontSize(11)
  doc.text(d.nombre, IZQ, y + 13)

  doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(9)
  doc.text(d.queEs, IZQ, y + 19)

  // El estado va a la derecha, a la altura del código: las dos cosas que se
  // miran primero quedan en el mismo renglón y en extremos opuestos.
  doc.setTextColor(TINTA).setFont('helvetica', 'bold').setFontSize(9)
  doc.text(d.estado.toUpperCase(), DER, y + 6, { align: 'right' })

  return y + 27
}

export async function armarFichaDeMaquina(d: DatosFichaMaquina): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['EQUIPO', d.codigo],
      ['EMITIDA', fechaLarga(d.momento)],
    ],
  })

  y = tituloDocumento(doc, y, 'Ficha técnica del equipo')
  y = encabezado(doc, d, y)

  for (const s of d.secciones) {
    // Un apartado no se queda huérfano al pie: si no caben su rótulo y un par
    // de filas, empieza en la hoja siguiente.
    if (y + 18 > ABAJO - 20) {
      doc.addPage()
      y = ARRIBA
    }
    y = seccion(doc, y, s.titulo)
    y =
      etiquetaValor(
        doc,
        y,
        s.filas.map(([clave, valor]) => [clave, texto(valor)] as [string, string]),
      ) + 4
  }

  if (d.nota !== null && d.nota.trim() !== '') {
    if (y + 18 > ABAJO - 20) {
      doc.addPage()
      y = ARRIBA
    }
    y = seccion(doc, y, 'Observaciones')
    etiquetaValor(doc, y, [['Nota', d.nota]], { columnas: 1 })
  }

  pieDePagina(doc, `Emitida el ${fechaLarga(d.momento)} por ${d.emitidaPor} · Documento interno`)

  doc.setProperties({
    title: `Ficha técnica ${d.codigo} — ${d.nombre}`,
    subject: 'Ficha técnica del equipo',
    author: d.empresa.razonSocial,
  })

  return {
    blob: doc.output('blob'),
    nombre: `ficha-tecnica-${d.codigo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`,
  }
}

// ---------------------------------------------------------------------------
// EL INFORME DE LA FLOTA
// ---------------------------------------------------------------------------

export interface MaquinaDelInforme {
  codigo: string
  nombre: string
  /** «Maquinaria», «Vehículo liviano», «Equipo». */
  clase: string
  tipo: string
  marcaModelo: string
  propietario: string
  /** Ya traducido a lo que se lee: «Activa», «Fuera de servicio». */
  estado: string
}

export interface DatosInformeFlota {
  maquinas: MaquinaDelInforme[]
  /**
   * El filtro que estaba puesto cuando se pidió, si había alguno.
   *
   * Un listado que no dice su alcance miente por omisión: quien lo recibe
   * supone que están todas. Si se exportó filtrando por un dueño o un estado,
   * el papel lo dice antes que ninguna otra cosa.
   */
  alcance: string | null
  emitidoPor: string
  momento: Date
  empresa: EmpresaPapel
}

/*
  Los anchos suman los 150 mm útiles, como en los demás listados del sistema.

  El nombre se lleva la porción más grande porque es lo único que no se puede
  adivinar: un código se reconoce, un estado es una de cuatro palabras, pero
  «CAMIÓN ARTICULADO» recortado a «CAMIÓN ARTIC…» deja de distinguirse del
  otro camión articulado de la lista.
*/
const COLUMNAS: Columna[] = [
  { titulo: 'Código', ancho: 24 },
  { titulo: 'Nombre', ancho: 34 },
  { titulo: 'Clase · Tipo', ancho: 26 },
  { titulo: 'Marca · Modelo', ancho: 30 },
  { titulo: 'Propietario', ancho: 20 },
  { titulo: 'Estado', ancho: 16 },
]

const celdas = (m: MaquinaDelInforme): string[] => [
  texto(m.codigo),
  texto(m.nombre),
  [m.clase, m.tipo].filter((x) => x !== '').join(' · ') || SIN_DATO,
  texto(m.marcaModelo),
  texto(m.propietario),
  texto(m.estado),
]

/** Cuántas hay de cada cosa, de la más numerosa a la que menos. */
function contar(lista: MaquinaDelInforme[], de: (m: MaquinaDelInforme) => string) {
  const cuenta = new Map<string, number>()
  for (const m of lista) {
    const clave = de(m) === '' ? SIN_DATO : de(m)
    cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1)
  }
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1])
}

export async function armarInformeDeFlota(d: DatosInformeFlota): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['UNIDADES', String(d.maquinas.length)],
      ['GENERADO', fechaLarga(d.momento)],
    ],
  })

  y = tituloDocumento(doc, y, 'Informe de la flota')

  if (d.alcance !== null) {
    y = notaAlPie(doc, y, d.alcance) + 2
  }

  /*
    EL RESUMEN ANTES DEL DETALLE.

    Quien pide este papel casi siempre quiere el conteo, no la lista: cuántas
    hay, cuántas trabajan y de quién son. Si eso estuviera al final habría que
    pasar tres hojas para responder la pregunta con la que se abrió el papel.
  */
  y = seccion(doc, y, 'Resumen')
  y =
    etiquetaValor(doc, y, [
      ['Unidades en total', String(d.maquinas.length)],
      ...contar(d.maquinas, (m) => m.estado).map(
        ([estado, cuantas]) => [estado, String(cuantas)] as [string, string],
      ),
      ...contar(d.maquinas, (m) => m.propietario).map(
        ([dueno, cuantas]) => [`Propiedad de ${dueno}`, String(cuantas)] as [string, string],
      ),
    ]) + 4

  /*
    El detalle va agrupado por estado y no por código.

    Ordenado por código, saber cuántas están paradas obliga a recorrer la
    columna de estado de arriba abajo. Agrupado, cada bloque lleva su cuenta
    en el rótulo y la pregunta se responde sin leer una sola fila.
  */
  for (const [estado, cuantas] of contar(d.maquinas, (m) => m.estado)) {
    const grupo = d.maquinas
      .filter((m) => (m.estado === '' ? SIN_DATO : m.estado) === estado)
      .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es'))

    /*
      Que quepan el rótulo, la cabecera y dos filas; si no, a la hoja
      siguiente. Un bloque que deja su última fila al otro lado se lee como si
      faltaran equipos, que es lo contrario de lo que este papel certifica.
    */
    if (y + 26 > ABAJO - 20) {
      doc.addPage()
      y = ARRIBA
    }

    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(TINTA)
    doc.text(`${estado.toUpperCase()} · ${cuantas}`, IZQ, y)
    y += 4.5

    y = tabla(doc, y, COLUMNAS, grupo.map(celdas)) - 1
  }

  pieDePagina(doc, `Generado el ${fechaLarga(d.momento)} por ${d.emitidoPor} · Documento interno`)

  doc.setProperties({
    title: 'Informe de la flota',
    subject: 'Maquinaria, vehículos y equipos',
    author: d.empresa.razonSocial,
  })

  return { blob: doc.output('blob'), nombre: 'informe-de-la-flota.pdf' }
}
