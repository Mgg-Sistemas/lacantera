import { logoComoImagen } from '@/lib/ficha/logo'
import { ARRIBA, ABAJO, IZQ, ANCHO_UTIL } from '@/lib/ficha/hoja'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import {
  membrete,
  tituloDocumento,
  lineaEmpresa,
  seccion,
  etiquetaValor,
  tabla,
  firmas,
  pieDePagina,
  fechaLarga,
  fechaCorta,
  TINTA,
  type Columna,
} from '@/lib/ficha/papel'

/*
  EL INFORME DE PERSONAL

  Lo pidió Jesmary, y son dos papeles que en realidad son uno:

    «Un PDF o informe del personal activo en nómina, con su cargo, estatus e
     información personal resumida, sin monto, o sea solo un reporte de
     personal, que en ese reporte incluya un apartado de los desincorporados.»

    «Al final de cuadrar nómina necesita también un informe de personal como el
     primero pero que este sí refleje lo que cobraron.»

  «Como el primero pero con lo que cobraron» es literalmente la especificación
  de una variante, no de otro documento. Por eso es una función con un
  interruptor y no dos archivos: el segundo día uno de los dos tendría el
  membrete viejo, y ya pasó en esta casa con las constancias.

  POR QUÉ EL DE PERSONAL NO LLEVA MONTOS Y NO ES UN OLVIDO

  Un listado de quién trabaja aquí se enseña, se pega en una pared, se le manda
  a un inspector. Los sueldos no. Que existan dos versiones del mismo papel
  —una con cifras y otra sin ellas— es lo que permite dar la que corresponde sin
  tener que tachar nada.

  LOS DESINCORPORADOS VAN EN SU PROPIO APARTADO, NO MEZCLADOS

  Se pidió así y además es lo correcto: en una lista sola, distinguir quién
  sigue y quién no dependería de leer una columna de estatus renglón por
  renglón. Separados, la pregunta «cuántos somos hoy» se contesta mirando.

  El apartado solo aparece si hay alguien. Un título con una tabla vacía debajo
  se lee como que falta algo.

  INDIVIDUAL Y EN LOTE CON LA MISMA FUNCIÓN

  Recibe una lista. Con una persona sale la hoja de esa persona; con todas, el
  informe entero. No hay dos funciones porque no hay dos documentos: hay un
  documento con más o menos filas, igual que `armarRecibo` y `armarRecibos`.
*/

export interface PersonaDelInforme {
  ficha: string
  nombre: string
  cedula: string
  cargo: string
  departamento: string | null
  fechaIngreso: string
  /** Nula si sigue trabajando. Su presencia es lo que lo pone en el otro apartado. */
  fechaEgreso: string | null
  motivoEgreso: string | null
  telefono: string | null

  /*
    Lo que cobró en el período, solo en el informe de cierre.

    Van juntos y no sueltos porque o están los cuatro o no está ninguno: una
    persona sin recibo en ese período —entró después de que cerrara, por
    ejemplo— sale con la fila en blanco y eso se lee, mientras que media fila
    rellena se lee como un error de cálculo.
  */
  pago?: {
    dias: string | number
    asignaciones: string | number
    deducciones: string | number
    neto: string | number
  } | null
}

export interface DatosInformePersonal {
  /**
   * Con montos es el informe de cierre; sin ellos, el reporte de personal.
   *
   * No es una preferencia de formato: decide si el papel se puede enseñar
   * fuera de administración.
   */
  conMontos: boolean
  /** El período, solo cuando el informe es de un cierre. */
  periodo?: { numero: string; desde: string; hasta: string } | null
  personas: PersonaDelInforme[]
  /** Lo que el filtro de la pantalla dejó fuera, dicho en palabras. */
  filtro?: string | null
  empresa: { razonSocial: string; rif: string }
  emitidoPor: string
  /** Cuándo se generó. Se pasa desde fuera para no depender del reloj aquí. */
  momento: Date
}

const decimal2 = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const numero = (v: string | number | null | undefined): string =>
  decimal2.format(Number(v ?? 0))

/*
  La fecha en cifras, que es lo que cabe en una columna de listado.

  `fechaCorta` de papel.ts da «13 jul. 2026» y es lo correcto para un dato
  suelto en una cabecera. En una columna de dieciséis milímetros se parte en
  dos, y una tabla de veinte personas se vuelve de cuarenta renglones.

  El mediodía es el mismo truco de siempre: sin él, una fecha ISO se interpreta
  en UTC y en Caracas retrocede un día.
*/
const soloFecha = (iso: string): string => {
  const f = new Date(`${iso}T12:00:00`)
  return `${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}/${f.getFullYear()}`
}

/** Entera si es entera. Quince días no se leen «15,00». */
const dias = (v: string | number | null | undefined): string => {
  const n = Number(v ?? 0)
  return Number.isInteger(n) ? String(n) : decimal2.format(n)
}

/*
  Dos juegos de columnas, los dos sumando los 150 mm útiles.

  El nombre se lleva la parte más grande en los dos, porque es lo único que no
  se puede abreviar sin dejar de reconocer a la persona. Al entrar las cuatro
  cifras del pago se caen el departamento y el cargo: en un papel de cierre lo
  que se comprueba es cuánto cobró cada quien, no de qué área es ni de qué se
  ocupa. Eso lo contesta el otro. Ver `CON_MONTOS` para la cuenta de los
  milímetros, que es de donde sale la decisión.
*/
const SIN_MONTOS: Columna[] = [
  { titulo: 'Ficha', ancho: 13 },
  { titulo: 'Nombre', ancho: 44 },
  { titulo: 'Cédula', ancho: 23 },
  { titulo: 'Cargo', ancho: 29 },
  { titulo: 'Departamento', ancho: 25 },
  /*
    «Desde» y no «Ingreso», y en 16 mm.

    Con 12 mm el rótulo se partía en «INGRE / SO» y la fecha larga —«13 jul.
    2026»— caía en dos renglones, lo que doblaba el alto de TODAS las filas. Se
    vio generando el papel.

    El rótulo corto y la fecha numérica caben en una línea, y la tabla vuelve a
    tener una fila por persona, que es como se lee un listado de personal.
  */
  { titulo: 'Desde', ancho: 16 },
]

/*
  EL PAPEL DE CIERRE NO LLEVA CARGO, Y ES POR LOS BOLIVARES.

  Primero se probó con ocho columnas y catorce milímetros para cada cifra. Con
  los importes del laboratorio —«17.273,79»— entraba. Con los de la nómina de
  verdad —«199.500,01»— no: `encajar` encoge la letra hasta seis puntos y, como
  un número no tiene espacios por donde partirlo, `splitTextToSize` lo rompe
  igual y la celda sale «199.500,0» con un «1» debajo. Una cifra partida en dos
  renglones en un papel que se usa para cuadrar no es un defecto de estética.

  Un importe en bolívares de seis dígitos con céntimos mide 14,1 mm a ocho
  puntos, y `tabla` reserva 4 mm de aire por celda: hacen falta 18 de columna,
  y se le dan 20 y 22 para el neto, que es el que más crece.

  Los 150 mm útiles no dan para eso y para las ocho columnas, así que sale una.
  Sale el CARGO, y no la cédula: este papel contesta «cuánto cobró cada quien»,
  y quien lo revise lo va a cotejar contra los recibos, donde la persona se
  identifica por ficha, nombre y cédula. De qué se ocupa esa persona lo contesta
  el otro informe, el de personal, que sí lleva cargo y departamento — y que es
  justamente para lo que existen dos versiones del papel.

  Los rótulos van abreviados por lo mismo que antes: «Asignac.» dejaba el punto
  solo en un segundo renglón. «Asign.» y «Deduc.» es como se dice en cualquier
  nómina de aquí.

  Bajar a bolívares enteros habría resuelto el ancho sin quitar columnas, y se
  descartó: un informe de cierre que no cuadra al céntimo con los recibos que
  resume no sirve para cuadrar.
*/
const CON_MONTOS: Columna[] = [
  { titulo: 'Ficha', ancho: 11 },
  { titulo: 'Nombre', ancho: 45 },
  { titulo: 'Cédula', ancho: 20 },
  { titulo: 'Días', ancho: 12, alDerecha: true },
  { titulo: 'Asign.', ancho: 20, alDerecha: true },
  { titulo: 'Deduc.', ancho: 20, alDerecha: true },
  { titulo: 'Neto', ancho: 22, alDerecha: true },
]

function celdas(p: PersonaDelInforme, conMontos: boolean): string[] {
  if (!conMontos) {
    return [
      p.ficha,
      p.nombre,
      p.cedula,
      p.cargo,
      p.departamento ?? '—',
      soloFecha(p.fechaIngreso),
    ]
  }

  /*
    Sin recibo van las cuatro rayas, ni cero ni en blanco.

    Cero dice «se calculó y dio cero», que es otra cosa y en un cierre de
    nómina no es lo mismo. En blanco no dice nada: quien lo lea no sabe si a
    esa persona no le tocaba cobrar o si el dato se perdió por el camino. La
    raya es la marca de siempre en una tabla de cifras para «aquí no hay nada
    que poner», y se ve de un vistazo al recorrer la columna.
  */
  const RAYA = '—'
  return [
    p.ficha,
    p.nombre,
    p.cedula,
    p.pago ? dias(p.pago.dias) : RAYA,
    p.pago ? numero(p.pago.asignaciones) : RAYA,
    p.pago ? numero(p.pago.deducciones) : RAYA,
    p.pago ? numero(p.pago.neto) : RAYA,
  ]
}

/** Lo que se dice de alguien que ya no está, en una línea. */
function comoSalio(p: PersonaDelInforme): string {
  const cuando = p.fechaEgreso ? fechaCorta(p.fechaEgreso) : '—'
  return p.motivoEgreso ? `${cuando} · ${p.motivoEgreso}` : cuando
}

export async function armarInformeDePersonal(
  d: DatosInformePersonal,
): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  const activos = d.personas.filter((p) => !p.fechaEgreso)
  const salidos = d.personas.filter((p) => p.fechaEgreso)

  const titulo = d.conMontos ? 'Informe de nómina del período' : 'Informe de personal'
  const columnas = d.conMontos ? CON_MONTOS : SIN_MONTOS

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: d.periodo
      ? [
          ['Período', d.periodo.numero],
          ['Del', fechaCorta(d.periodo.desde)],
          ['Al', fechaCorta(d.periodo.hasta)],
        ]
      : [['Generado', fechaLarga(d.momento)]],
  })

  y = tituloDocumento(doc, y, titulo)

  y = lineaEmpresa(
    doc,
    y,
    `${d.empresa.razonSocial} · RIF ${d.empresa.rif} · Sistema administrativo`,
  )

  const neto = d.personas.reduce((s, p) => s + Number(p.pago?.neto ?? 0), 0)

  y = seccion(doc, y, 'Alcance')
  y = etiquetaValor(doc, y, [
    ...(d.periodo
      ? ([['Período', `${d.periodo.numero} · del ${fechaCorta(d.periodo.desde)} al ${fechaCorta(d.periodo.hasta)}`]] as Array<[string, string]>)
      : []),
    ['En nómina', String(activos.length)],
    ['Desincorporados', String(salidos.length)],
    ...(d.conMontos
      ? ([['Neto del período', `Bs ${numero(neto)}`]] as Array<[string, string]>)
      : []),
    ['Filtro aplicado', d.filtro || 'Ninguno: se lista todo el personal'],
    ['Emitido por', d.emitidoPor],
  ])

  /*
    Un bloque por apartado, con el mismo dibujo que la nota de salida cuando
    lleva material de varios almacenes: el título del bloque se pinta a mano y
    no con `seccion`, porque a once puntos y seis milímetros de aire dos
    bloques empujan las firmas a una segunda hoja con cuatro renglones.
  */
  const bloque = (
    rotulo: string,
    gente: PersonaDelInforme[],
    pie?: string,
    /** Lo que va pegado debajo del bloque y no debe quedarse al otro lado. */
    cola = 0,
  ) => {
    if (gente.length === 0) return

    /*
      UN APARTADO CORTO NO SE PARTE. UNO LARGO SÍ, Y DEBE.

      `tabla` mira el hueco antes de cada FILA, pero no antes de su cabecera ni
      del rótulo. Por sí sola dejaba «DESINCORPORADOS · 2» con una sola fila al
      pie de la hoja y la otra —con el total— al otro lado. Un apartado de dos
      personas partido en dos hojas se lee como si faltara gente, que es
      justamente lo que este papel viene a certificar que no pasa.

      La primera versión de esta regla decía «si cabe entero en una hoja, va
      entero», y estaba mal. Las veintidós personas de la nómina miden unos
      204 mm y en una hoja caben 207: cabían enteras, así que la regla exigía
      los 204 de golpe, no los encontraba debajo del alcance y se llevaba la
      tabla a la hoja siguiente. La primera hoja salía con el membrete, cuatro
      renglones de alcance y el resto en blanco. Se vio generándolo con las
      veintiséis personas de verdad.

      Lo que distingue los dos casos no es si cabe: es si es CORTO. Un bloque
      de dos filas se lee como una unidad y partirlo confunde. Una tabla de
      veintidós es una tabla, y nadie se extraña de que siga al otro lado —de
      hecho lo espera—.

      Un tercio de hoja es la frontera. Por encima, basta con lo de siempre
      contra huérfanos: que quepan el rótulo, la cabecera y tres filas.

      Las medidas son estimaciones a propósito. 6,5 mm es el alto de fila de
      `tabla`, que no lo exporta; el 1,35 es el margen por las celdas que se
      parten en dos renglones.
    */
    const ALTO_DE_FILA = 6.5
    const HUECO_UTIL = ABAJO - 30 - ARRIBA
    const alto =
      4.5 + ALTO_DE_FILA + gente.length * ALTO_DE_FILA * 1.35 + (pie ? ALTO_DE_FILA + 1 : 0) + cola
    const esCorto = alto <= HUECO_UTIL / 3
    const hueco = esCorto ? alto : 4.5 + ALTO_DE_FILA * (1 + 3 * 1.35)

    if (y + hueco > ABAJO - 30) {
      doc.addPage()
      y = ARRIBA
    }

    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(TINTA)
    doc.text(rotulo.toUpperCase(), IZQ, y)
    y += 4.5

    y = tabla(doc, y, columnas, gente.map((p) => celdas(p, d.conMontos)), pie) - 4
  }

  bloque(
    `En nómina · ${activos.length}`,
    activos,
    d.conMontos
      ? `NETO EN NÓMINA   Bs ${numero(activos.reduce((s, p) => s + Number(p.pago?.neto ?? 0), 0))}`
      : undefined,
  )

  /*
    Los desincorporados van con su fecha de salida y su motivo debajo del
    bloque, no en una columna: son pocos, y meter una columna más en las dos
    versiones del papel le quitaría ancho al nombre en todas las filas para
    servir a unas pocas.
  */
  if (salidos.length > 0) {
    y += 4
    bloque(
      `Desincorporados · ${salidos.length}`,
      salidos,
      d.conMontos
        ? `NETO DE DESINCORPORADOS   Bs ${numero(salidos.reduce((s, p) => s + Number(p.pago?.neto ?? 0), 0))}`
        : undefined,
      // La lista de fechas y motivos cuenta como parte del apartado: separarla
      // de su tabla deja las salidas sin la gente a la que pertenecen.
      salidos.length * 4 + 4,
    )

    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(TINTA)
    for (const p of salidos) {
      doc.text(`${p.ficha} · ${p.nombre} — salió el ${comoSalio(p)}`, IZQ, y, {
        maxWidth: ANCHO_UTIL,
      })
      y += 4
    }
    y += 4
  }

  // Si las firmas no caben, se van a su propia hoja enteras. Una raya de firma
  // partida entre dos páginas no la firma nadie.
  if (y > ABAJO - 24) {
    doc.addPage()
    y = ARRIBA
  }
  firmas(
    doc,
    y + 12,
    d.conMontos ? 'Elaboró · nómina' : 'Elaboró · recursos humanos',
    'Conforme · administración',
  )

  pieDePagina(
    doc,
    `Documento generado por el sistema · ${d.periodo?.numero ?? 'Personal'} · ${fechaLarga(d.momento)}`,
  )

  doc.setProperties({ title: `${titulo}${d.periodo ? ` — ${d.periodo.numero}` : ''}` })

  const sufijo = d.periodo
    ? d.periodo.numero.toLowerCase()
    : d.personas.length === 1
      ? d.personas[0].ficha
      : 'completo'

  return {
    blob: doc.output('blob'),
    nombre: `${d.conMontos ? 'informe-nomina' : 'informe-personal'}-${sufijo}.pdf`,
  }
}
