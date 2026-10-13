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
import { ABAJO, ANCHO_UTIL, ARRIBA, DER, IZQ } from './hoja'
import {
  bloqueEtiquetado,
  type Columna,
  type EmpresaPapel,
  etiquetaValor,
  fechaCorta,
  fechaLarga,
  firmas,
  GRIS,
  GRIS_SUAVE,
  HAIRLINE,
  MARCA,
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

// ---------------------------------------------------------------------------
// EL INFORME DE MANTENIMIENTO
//
// A diferencia del informe de flota —un inventario de activos—, este es un
// histórico de órdenes de taller: qué entró, qué se le hizo, quién lo hizo y
// cuánto costó. Se pide por una máquina (todo su historial) o por un rango de
// fechas (todas las máquinas de ese período); los dos casos arman el mismo
// papel, solo cambia qué tan explícito hay que ser con cuál es cuál en
// `alcance`.
// ---------------------------------------------------------------------------

/**
 * Las siete clases de trabajo que se pueden marcar en una orden, varias a la
 * vez. Vive aquí —no en `lib/api/maquinaria`— porque el papel es quien
 * necesita la lista COMPLETA para dibujar la casilla de cada una, marcada o
 * no: `OrdenDelInforme.intervenciones` solo trae las que SÍ se marcaron.
 */
const TIPOS_INTERVENCION_PDF = [
  { valor: 'MECANICA', etiqueta: 'Mecánica' },
  { valor: 'ELECTRICIDAD', etiqueta: 'Electricidad' },
  { valor: 'HIDRAULICA', etiqueta: 'Mangueras / hidráulica' },
  { valor: 'SERVICIO', etiqueta: 'Servicio' },
  { valor: 'SOLDADURA', etiqueta: 'Soldadura' },
  { valor: 'REPUESTO', etiqueta: 'Repuesto' },
  { valor: 'OTRA', etiqueta: 'Otra' },
]

export interface RepuestoDelInforme {
  cantidad: number
  articulo: string
  unidad: string
  costo: number
}

export interface OrdenDelInforme {
  numero: string | null
  maquinaCodigo: string
  maquina: string
  marca: string | null
  modelo: string | null
  serial: string | null
  /** Ya traducido: «Mantenimiento», «Servicio», «Reparación». */
  tipo: string
  /** Ya traducido: «Abierta», «Terminada», «Anulada». */
  estado: string
  fecha: string
  fechaSalida: string | null
  dias: number | null
  taller: string | null
  tecnico: string | null
  /** Si el técnico es de la casa o un taller/proveedor de afuera. */
  origenTecnico: string | null
  motivo: string | null
  detalle: string | null
  costoManoObra: number | null
  costoRepuestos: number
  costoTotal: number
  repuestosDetalle: RepuestoDelInforme[]
  /** El horómetro al entrar al taller, y a cuántas horas toca el próximo —si se fijó uno para este ciclo—. */
  horometro: number | null
  intervaloHoras: number | null
  /** Las claves de `TIPOS_INTERVENCION_PDF` que se marcaron, sin traducir. */
  intervenciones: string[]
  /** La avería que esta orden atendió, si alguna. */
  averiaNumero: string | null
}

export interface DatosInformeMantenimiento {
  ordenes: OrdenDelInforme[]
  /** Por qué máquina o qué rango de fechas se pidió. Nunca viene vacío: este
   *  papel siempre dice su alcance, a diferencia del de flota. */
  alcance: string
  emitidoPor: string
  momento: Date
  empresa: EmpresaPapel
}

const COLUMNAS_MANTENIMIENTO: Columna[] = [
  { titulo: 'Orden', ancho: 16 },
  { titulo: 'Máquina', ancho: 24 },
  { titulo: 'Tipo · Estado', ancho: 20 },
  { titulo: 'Entrada · Salida', ancho: 24 },
  { titulo: 'Taller · Técnico', ancho: 26 },
  { titulo: 'Qué se hizo', ancho: 26 },
  { titulo: 'Costo', ancho: 14, alDerecha: true },
]

const celdasMantenimiento = (o: OrdenDelInforme): string[] => [
  texto(o.numero),
  `${texto(o.maquinaCodigo)} · ${texto(o.maquina)}`,
  `${texto(o.tipo)} · ${texto(o.estado)}`,
  [
    fechaCorta(o.fecha),
    o.fechaSalida ? fechaCorta(o.fechaSalida) : null,
    o.dias !== null ? `${o.dias} día${o.dias === 1 ? '' : 's'}` : null,
  ]
    .filter((x) => x !== null)
    .join(' · ') || SIN_DATO,
  [
    o.taller,
    o.tecnico,
    o.origenTecnico === 'EXTERNO' ? 'externo' : o.origenTecnico === 'INTERNO' ? 'interno' : null,
  ]
    .filter((x) => x)
    .join(' · ') || SIN_DATO,
  [
    o.detalle || o.motivo,
    o.repuestosDetalle.length > 0
      ? `${o.repuestosDetalle.length} repuesto${o.repuestosDetalle.length === 1 ? '' : 's'}`
      : null,
    o.intervaloHoras !== null ? `próximo a las ${o.intervaloHoras} h` : null,
    o.averiaNumero ? `atiende ${o.averiaNumero}` : null,
  ]
    .filter((x) => x)
    .join(' · ') || SIN_DATO,
  o.costoTotal > 0 ? `$${o.costoTotal.toFixed(2)}` : SIN_DATO,
]

const COLUMNAS_REPUESTOS: Columna[] = [
  { titulo: 'Cant.', ancho: 20 },
  { titulo: 'Repuesto o insumo', ancho: 98 },
  { titulo: 'Costo', ancho: 32, alDerecha: true },
]

const celdasRepuesto = (r: RepuestoDelInforme): string[] => [
  `${r.cantidad} ${r.unidad}`.trim(),
  texto(r.articulo),
  r.costo > 0 ? `$${r.costo.toFixed(2)}` : SIN_DATO,
]

/**
 * La casilla de cada tipo de intervención, marcada o no —igual que en el
 * papel que se llena a mano—: se dibujan TODAS, para que quien lo lea vea de
 * un vistazo qué se descartó y no solo qué se marcó.
 */
function checkboxesIntervencion(doc: Doc, y: number, marcados: string[]): number {
  const COLUMNAS_FILA = 3
  const ANCHO_COL = ANCHO_UTIL / COLUMNAS_FILA
  const ALTO_FILA = 6
  let fila = y

  TIPOS_INTERVENCION_PDF.forEach((t, i) => {
    const col = i % COLUMNAS_FILA
    if (col === 0 && i > 0) fila += ALTO_FILA
    const x = IZQ + col * ANCHO_COL
    const marcado = marcados.includes(t.valor)

    doc.setDrawColor(TINTA).setLineWidth(0.3)
    doc.rect(x, fila - 2.6, 3.2, 3.2)
    if (marcado) {
      doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(TINTA)
      doc.text('X', x + 0.5, fila + 0.1)
    }

    doc.setFont('helvetica', marcado ? 'bold' : 'normal').setFontSize(8)
    doc.setTextColor(marcado ? TINTA : GRIS_SUAVE)
    doc.text(t.etiqueta, x + 4.6, fila)
  })

  return fila + ALTO_FILA + 3
}

/** Un bloque con barra de título y un párrafo debajo, para texto libre —no una tabla de etiqueta/valor—. */
function bloqueParrafo(doc: Doc, y: number, titulo: string, cuerpo: string): number {
  const ALTO_TITULO = 6
  let fila = y

  doc.setFillColor(MARCA)
  doc.rect(IZQ, fila, ANCHO_UTIL, ALTO_TITULO, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor('#FFFFFF')
  doc.text(titulo, IZQ + 3, fila + 4.3)
  fila += ALTO_TITULO

  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(TINTA)
  const lineas = doc.splitTextToSize(cuerpo || SIN_DATO, ANCHO_UTIL - 6) as string[]
  const altoCuerpo = lineas.length * 4.1 + 4.5

  doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
  doc.rect(IZQ, fila, ANCHO_UTIL, altoCuerpo)
  doc.text(lineas, IZQ + 3, fila + 4.6, { lineHeightFactor: 1.35 })

  return fila + altoCuerpo + 4
}

/**
 * Una orden, en su propia hoja —el modelo que se pidió clonar, con los datos
 * de La Cantera—: fecha, técnico, equipo, de qué se trató, qué se encontró,
 * qué se hizo, el horómetro, los repuestos con su costo real (los nuestros
 * descuentan inventario de verdad; el papel de origen solo los describía) y
 * las dos rayas para firmar a mano.
 */
function pintarOrden(doc: Doc, o: OrdenDelInforme): void {
  let y = ARRIBA

  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS_SUAVE)
  doc.text('INFORME DE MANTENIMIENTO', IZQ, y)
  doc.text(texto(o.numero), DER, y, { align: 'right' })
  y += 6

  const ALTO_BARRA = 11
  doc.setFillColor(MARCA)
  doc.rect(IZQ, y, ANCHO_UTIL, ALTO_BARRA, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor('#FFFFFF')
  doc.text('ORDEN DE TALLER', IZQ + 3, y + 7.3)
  doc.setFont('helvetica', 'normal').setFontSize(8.5)
  doc.text(`${o.tipo} · ${o.estado}`, DER - 3, y + 7.3, { align: 'right' })
  y += ALTO_BARRA + 5

  const generales: Array<[string, string | null | undefined]> = [
    [
      'Fecha',
      [fechaCorta(o.fecha), o.fechaSalida ? `salió el ${fechaCorta(o.fechaSalida)}` : null]
        .filter(Boolean)
        .join(' · '),
    ],
    ['Equipo', [o.maquinaCodigo, o.maquina].filter(Boolean).join(' · ')],
  ]
  if (o.marca || o.modelo) generales.push(['Marca y modelo', [o.marca, o.modelo].filter(Boolean).join(' ')])
  if (o.serial) generales.push(['Código de serial', o.serial])
  generales.push([
    'Técnico',
    o.tecnico
      ? `${o.tecnico}${o.origenTecnico === 'EXTERNO' ? ' · externo' : o.origenTecnico === 'INTERNO' ? ' · de la casa' : ''}`
      : null,
  ])
  if (o.taller) generales.push(['Taller', o.taller])
  if (o.averiaNumero) generales.push(['Avería que atiende', o.averiaNumero])

  y = bloqueEtiquetado(doc, y, 'DATOS GENERALES', generales)

  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(TINTA)
  doc.text('TIPO DE INTERVENCIÓN', IZQ, y)
  y += 6
  y = checkboxesIntervencion(doc, y, o.intervenciones)

  y = bloqueParrafo(doc, y, 'DESCRIPCIÓN DEL PROBLEMA', o.motivo ?? '')
  y = bloqueParrafo(
    doc,
    y,
    'ACCIONES REALIZADAS',
    o.detalle ?? (o.estado === 'Abierta' ? 'Sigue en el taller: aún sin cerrar.' : ''),
  )

  if (o.horometro !== null || o.intervaloHoras !== null) {
    y =
      etiquetaValor(
        doc,
        y,
        [
          ['Llevaba desde el mantenimiento anterior', o.horometro !== null ? `${o.horometro} h` : null],
          ['Próximo mantenimiento', o.intervaloHoras !== null ? `en ${o.intervaloHoras} h` : null],
        ].filter(([, v]) => v) as Array<[string, string]>,
      ) + 3
  }

  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(TINTA)
  doc.text('REPUESTOS UTILIZADOS', IZQ, y)
  y += 5
  if (o.repuestosDetalle.length > 0) {
    y = tabla(doc, y, COLUMNAS_REPUESTOS, o.repuestosDetalle.map(celdasRepuesto)) + 3
  } else {
    doc.setFont('helvetica', 'italic').setFontSize(8).setTextColor(GRIS_SUAVE)
    doc.text('Sin repuestos registrados.', IZQ, y + 3)
    y += 9
  }

  if (o.costoManoObra !== null || o.costoTotal > 0) {
    y =
      etiquetaValor(doc, y, [
        ['Mano de obra', o.costoManoObra !== null ? `$${o.costoManoObra.toFixed(2)}` : SIN_DATO],
        ['Repuestos', `$${o.costoRepuestos.toFixed(2)}`],
        ['Total', `$${o.costoTotal.toFixed(2)}`],
      ]) + 4
  }

  if (y + 24 > ABAJO) {
    doc.addPage()
    y = ABAJO - 24
  }
  firmas(doc, y + 20, 'Firma de quien hizo el trabajo', 'Firma de quien autoriza')
}

export async function armarInformeMantenimiento(
  d: DatosInformeMantenimiento,
): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  const costoTotal = d.ordenes.reduce((s, o) => s + o.costoTotal, 0)

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['ÓRDENES', String(d.ordenes.length)],
      ['GENERADO', fechaLarga(d.momento)],
    ],
  })

  y = tituloDocumento(doc, y, 'Informe de mantenimiento')
  y = notaAlPie(doc, y, d.alcance) + 2

  y = seccion(doc, y, 'Resumen')
  y =
    etiquetaValor(doc, y, [
      ['Órdenes', String(d.ordenes.length)],
      ['Mano de obra + repuestos', `$${costoTotal.toFixed(2)}`],
    ]) + 4

  y = seccion(doc, y, 'Índice de órdenes')
  tabla(doc, y, COLUMNAS_MANTENIMIENTO, d.ordenes.map(celdasMantenimiento))

  /*
    CADA ORDEN, EN SU PROPIA HOJA. Es el modelo que se pidió clonar —un
    reporte, una hoja, firmable a mano—, adaptado con los datos reales de la
    cantera: el horómetro, el costo de mano de obra y repuestos, y la avería
    que atendió, que el papel de origen no llevaba.
  */
  for (const orden of d.ordenes) {
    doc.addPage()
    pintarOrden(doc, orden)
  }

  pieDePagina(doc, `Generado el ${fechaLarga(d.momento)} por ${d.emitidoPor} · Documento interno`)

  doc.setProperties({
    title: 'Informe de mantenimiento',
    subject: 'Órdenes de taller de la maquinaria',
    author: d.empresa.razonSocial,
  })

  return { blob: doc.output('blob'), nombre: 'informe-de-mantenimiento.pdf' }
}
