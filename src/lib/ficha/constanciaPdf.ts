/**
 * La constancia de trabajo.
 *
 * Es una carta, no un formulario. La pide el trabajador y la lee alguien de
 * fuera —un banco, un consulado, un arrendador, una clínica— que no conoce la
 * empresa y solo quiere saber tres cosas: si esta persona trabaja aquí, desde
 * cuándo y en qué. Todo lo demás sobra.
 *
 * De ahí las decisiones:
 *
 * - Va en párrafo corrido y con la fecha en letras, que es como se redacta una
 *   constancia en Venezuela y como quien la recibe espera verla. Una tabla de
 *   datos se lee como una ficha interna, no como una declaración de la empresa.
 *
 * - EL TIEMPO DEL VERBO CAMBIA SEGÚN EL CASO. A quien sigue trabajando se le
 *   escribe «presta sus servicios»; a quien ya salió, «prestó sus servicios
 *   desde el … hasta el …». Firmar que alguien trabaja aquí cuando ya no es
 *   falso, y una constancia se firma.
 *
 * - EL SUELDO ES OPCIONAL. El banco lo exige y el arrendador no tiene por qué
 *   verlo. Quien la emite decide; el sistema no decide por ella en ninguna de
 *   las dos direcciones.
 *
 * - La firma es la de Recursos Humanos, y sale en blanco si nadie la cargó en
 *   los parámetros. Un renglón vacío se llena a mano; un nombre inventado por
 *   el sistema en un papel firmado, no se detecta.
 *
 * NO SE EMITE SIN FECHA DE INGRESO CONFIRMADA. Esa comprobación vive en la
 * pantalla y no aquí, pero es la razón por la que este archivo puede dar por
 * cierta la fecha que recibe.
 */

import { logoComoImagen } from './logo'
import { ajustar, ANCHO_UTIL, CENTRO, IZQ } from './hoja'
import {
  type EmpresaPapel,
  GRIS,
  GRIS_SUAVE,
  membrete,
  pieDePagina,
  TINTA,
  tituloDocumento,
} from './papel'
import type { PdfArmado } from './reciboPdf'

/*
  DOS PAPELES, UNA FUNCIÓN.

  «Constancia de trabajo» dice que alguien trabaja —o trabajó— aquí, y se pide
  para un banco, un colegio, un empleo nuevo. «Constancia de cese» dice que la
  relación laboral terminó, y es la que pidió la líder: «un pdf donde se deje
  constancia de su cese de actividades laborales».

  No son el mismo papel con otro título, pero comparten la forma entera: carta
  a quien pueda interesar, párrafo declarativo, recuadro con nombre y cédula,
  cierre y firma. Separarlos en dos archivos habría duplicado esa forma para
  cambiar tres frases, y a la tercera semana uno de los dos tendría el membrete
  viejo. Se separan por lo que DICEN, dentro de la misma función.

  El repositorio ya distingue por forma y no por nombre: `armarConstanciaDeEntrega`
  se llama constancia y vive aparte porque es un formulario con tabla, no una
  carta.
*/
export type TipoDeConstancia = 'TRABAJO' | 'CESE'

export interface DatosConstancia {
  /** Por omisión, la de trabajo: es la que se pide casi siempre. */
  tipo?: TipoDeConstancia
  /**
   * El motivo de la salida, y solo si quien la emite decide ponerlo.
   *
   * NO SE IMPRIME POR OMISIÓN, a propósito. La constancia de cese se le entrega
   * a la persona, y «despido justificado» escrito en un papel que va a enseñar
   * en su próxima entrevista le hace un daño que la empresa no necesita
   * hacerle. La fecha de salida basta para acreditar el cese, que es lo que se
   * pidió.
   *
   * Queda disponible para cuando de verdad haga falta —un trámite que lo exija—
   * y entonces es una decisión de quien firma, tomada a sabiendas.
   */
  motivoEgreso?: string | null
  nombreCompleto: string
  cedula: string
  ficha: string
  cargo: string
  departamento: string | null
  fechaIngreso: string
  fechaEgreso: string | null
  activo: boolean
  /** 'MASCULINO' | 'FEMENINO' | null. Decide el género de la redacción. */
  genero: string | null

  /**
   * Sin sueldo cuando quien la emite prefiere no ponerlo.
   *
   * `base` es CÓMO ESTÁ ESTIPULADO el salario —mensual, diario, por hora—, no
   * cada cuánto se cobra. No es lo mismo y confundirlos escribe una mentira en
   * un papel firmado: en la cantera se estipula mensual y se paga quincenal, así
   * que tomar la frecuencia daría «un salario quincenal de 310 $» cuando la
   * quincena son 155. Quien lea esa carta en un banco le calcula al trabajador
   * el doble de ingresos.
   */
  sueldo: { monto: string; moneda: string; base: string } | null

  /**
   * Dónde se expide. Sale de los datos de la empresa.
   *
   * Es aparte del domicilio del membrete a propósito: el membrete dice dónde
   * está inscrita la empresa y este renglón dónde se firmó el papel, que en
   * una constancia es una fórmula de la redacción, no un dato fiscal.
   */
  ciudad: string

  empresa: EmpresaPapel

  firma: { nombre: string; cargo: string; cedula: string }
  emitidaPor: string
}

// --- La fecha en letras ----------------------------------------------------
// Una constancia se fecha «a los treinta (30) días del mes de julio de dos mil
// veintiséis». No es floritura: es la forma en la que se redacta un documento
// de este tipo aquí, y en letras no se puede alterar un número con un bolígrafo.

const UNIDADES = [
  'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho',
  'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis',
  'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós',
  'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete',
  'veintiocho', 'veintinueve', 'treinta', 'treinta y uno',
]

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** Solo hace falta desde 2000 en adelante; no se escribe un conversor general. */
function anioEnLetras(anio: number): string {
  const DECENAS: Record<number, string> = {
    2: 'veinte', 3: 'treinta', 4: 'cuarenta', 5: 'cincuenta',
    6: 'sesenta', 7: 'setenta', 8: 'ochenta', 9: 'noventa',
  }

  const resto = anio - 2000
  if (resto === 0) return 'dos mil'
  if (resto < 0 || resto > 99) return String(anio)
  if (resto < 30) return `dos mil ${UNIDADES[resto]}`

  const d = Math.floor(resto / 10)
  const u = resto % 10
  return u === 0 ? `dos mil ${DECENAS[d]}` : `dos mil ${DECENAS[d]} y ${UNIDADES[u]}`
}

function fechaLarga(iso: string): string {
  const f = new Date(`${iso}T12:00:00`)
  return `${f.getDate()} de ${MESES[f.getMonth()]} de ${f.getFullYear()}`
}

function fechaExpedicion(f: Date): string {
  const d = f.getDate()

  const mesAnio = `del mes de ${MESES[f.getMonth()]} de ${anioEnLetras(f.getFullYear())}`

  /*
    LOS TRES DÍAS QUE NO SE DICEN COMO LOS DEMÁS.

    Delante de un sustantivo masculino, «uno» se apocopa: son «veintiún días» y
    «treinta y un días», no «veintiuno días». Decía lo segundo, y salía así en
    todas las constancias emitidas el 21 y el 31 — también en las de trabajo,
    que llevan meses firmándose con esa falta.

    Y el día 1 no admite el plural: «a los un días» no es castellano. La forma
    de los documentos es «al primer día».

    Se corrige aquí y no en la tabla `UNIDADES`, porque esa misma tabla sirve
    para el año en `anioEnLetras`, y ahí «dos mil veintiuno» sí es correcto: el
    año no va seguido de ningún sustantivo.

    Se comprobó recorriendo los treinta y un días del mes, no solo el de hoy.
  */
  if (d === 1) return `al primer (1) día ${mesAnio}`

  const enLetras = d === 21 ? 'veintiún' : UNIDADES[d].replace(/ uno$/, ' un')

  return `a los ${enLetras} (${d}) días ${mesAnio}`
}

/** Cómo se dice cada base de estipulación dentro de la frase. */
const BASE: Record<string, string> = {
  MENSUAL: 'un salario mensual de',
  DIARIO: 'un salario diario de',
  HORA: 'un salario por hora de',
}

const cifra = (v: string | number) =>
  new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number(v),
  )

const simbolo = (m: string) => (m === 'VES' ? 'Bs' : m === 'USD' ? '$' : m)

/**
 * La cédula con sus puntos: V-3.303.063 y no V-3303063.
 *
 * En la base se guarda sin puntos, que es lo correcto para comparar y para no
 * tener dos formas del mismo número. En un documento que alguien coteja contra
 * una cédula de identidad de cartón, se lee como está impresa ahí.
 */
function cedulaLegible(c: string): string {
  const m = /^([VE])-?(\d+)$/.exec(c.trim().toUpperCase())
  if (!m) return c
  return `${m[1]}-${Number(m[2]).toLocaleString('es-VE')}`
}

// --- El cuerpo -------------------------------------------------------------

/**
 * El párrafo, armado con el género y el tiempo verbal que toquen.
 *
 * Sin género cargado se escribe «el(la) ciudadano(a)», que es feo pero cierto.
 * Adivinarlo por el nombre sería tratar a una persona por lo que parece su
 * nombre en un papel que ella va a entregar en un banco.
 */
function parrafo(d: DatosConstancia): string {
  const f = d.genero === 'FEMENINO'
  const m = d.genero === 'MASCULINO'
  const elLa = f ? 'la ciudadana' : m ? 'el ciudadano' : 'el(la) ciudadano(a)'
  const adscrito = f ? 'adscrita' : m ? 'adscrito' : 'adscrito(a)'

  // El nombre y la cédula van DENTRO de la frase. Es lo que declara la empresa
  // y sin ellos la oración no dice de quién habla: «se hace constar que la
  // ciudadana presta sus servicios» no constata nada. El recuadro de abajo los
  // repite para quien tenga que compararlos contra un documento de identidad;
  // esta es la declaración, aquello es una ayuda de lectura.
  const servicio = d.activo
    ? `presta sus servicios en esta empresa desde el ${fechaLarga(d.fechaIngreso)}`
    : `prestó sus servicios en esta empresa desde el ${fechaLarga(d.fechaIngreso)} hasta el ${fechaLarga(d.fechaEgreso ?? d.fechaIngreso)}`

  const cargo = d.departamento
    ? `, desempeñando el cargo de ${d.cargo}, ${adscrito} al departamento de ${d.departamento}`
    : `, desempeñando el cargo de ${d.cargo}`

  const sueldo = d.sueldo
    ? `, y ${d.activo ? 'devenga' : 'devengaba'} ${BASE[d.sueldo.base] ?? BASE.MENSUAL} ${simbolo(d.sueldo.moneda)} ${cifra(d.sueldo.monto)}`
    : ''

  /*
    LA FRASE DEL CESE.

    Va en oración aparte y no encadenada a la anterior: es la declaración que da
    sentido al papel, y dentro de una frase de cuatro comas se lee como un dato
    más. El motivo entra solo si se pidió — ver `motivoEgreso`.
  */
  const cese =
    d.tipo === 'CESE' && d.fechaEgreso
      ? ` La relación laboral culminó en la fecha antes señalada${
          d.motivoEgreso ? `, por ${d.motivoEgreso.toLowerCase()}` : ''
        }.`
      : ''

  return (
    `Por medio de la presente se hace constar que ${elLa} ${d.nombreCompleto}, ` +
    `titular de la cédula de identidad N.° ${cedulaLegible(d.cedula)}, ` +
    `${servicio}${cargo}${sueldo}.${cese}`
  )
}

export async function armarConstancia(d: DatosConstancia): Promise<PdfArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen(400, false)
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = tituloDocumento(
    doc,
    membrete(doc, logo, { empresa: d.empresa }),
    d.tipo === 'CESE' ? 'Constancia de cese de actividades laborales' : 'Constancia de trabajo',
  )
  y += 6

  doc.setFont('helvetica', 'bold').setFontSize(10)
  doc.text('A QUIEN PUEDA INTERESAR', IZQ, y)
  y += 12

  // --- El cuerpo ---
  // Interlínea de 6 mm: en una carta de tres párrafos sobre 150 mm de ancho,
  // apretarla más la vuelve un bloque y menos la deja suelta.
  doc.setTextColor(TINTA).setFont('helvetica', 'normal').setFontSize(10.5)

  const texto = parrafo(d)
  const lineas = doc.splitTextToSize(texto, ANCHO_UTIL) as string[]
  for (const linea of lineas) {
    doc.text(linea, IZQ, y, { align: 'justify', maxWidth: ANCHO_UTIL })
    y += 6
  }

  // El mismo nombre y la misma cédula, destacados. Quien recibe la carta los
  // compara contra el documento que le presentan, y buscarlos dentro de un
  // párrafo justificado es justo lo que hace que un dígito cambiado pase.
  y += 5
  doc.setFillColor('#F4F6FC')
  doc.rect(IZQ, y - 5, ANCHO_UTIL, 15, 'F')
  doc.setTextColor(TINTA).setFont('helvetica', 'bold').setFontSize(11)
  doc.text(ajustar(doc, d.nombreCompleto, ANCHO_UTIL - 8), IZQ + 4, y + 1)
  doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(8.5)
  doc.text(`Cédula ${cedulaLegible(d.cedula)} · Ficha ${d.ficha}`, IZQ + 4, y + 6.5)
  y += 21

  doc.setTextColor(TINTA).setFont('helvetica', 'normal').setFontSize(10.5)
  /*
    El cierre de la de cese nombra para qué sirve.

    Una constancia de trabajo se expide «a petición de la parte interesada» y
    con eso basta. La de cese la piden para trámites concretos —el paro
    forzoso, una liquidación, un empleo nuevo— y decirlo evita que quien la
    recibe tenga que preguntar si sirve para eso.
  */
  const cierre =
    d.tipo === 'CESE'
      ? `Constancia que se expide a petición de la parte interesada, para los fines legales que estime convenientes, en ${d.ciudad}, ${fechaExpedicion(new Date())}.`
      : `Constancia que se expide a petición de la parte interesada, en ${d.ciudad}, ${fechaExpedicion(new Date())}.`
  for (const linea of doc.splitTextToSize(cierre, ANCHO_UTIL) as string[]) {
    doc.text(linea, IZQ, y)
    y += 6
  }

  // --- La firma ---
  // Centrada y bien separada del cuerpo: es lo que da valor al papel y tiene
  // que haber sitio real para una firma de bolígrafo, no una raya apretada.
  y += 30

  const anchoFirma = 78
  const x0 = CENTRO - anchoFirma / 2

  doc.setDrawColor(TINTA).setLineWidth(0.4)
  doc.line(x0, y, x0 + anchoFirma, y)

  // Se imprime lo que hay cargado y nada más. Sin nombre, el renglón lleva el
  // cargo —que sí está definido— para llenarlo a mano; antes se descartaba el
  // cargo también y la carta salía firmada por «Recursos humanos» a secas
  // aunque la empresa hubiera dicho que quien firma es la jefa del área.
  const rotulos = d.firma.nombre
    ? [
        d.firma.nombre,
        d.firma.cargo || 'Recursos humanos',
        d.firma.cedula ? `C.I. ${cedulaLegible(d.firma.cedula)}` : '',
      ]
    : [d.firma.cargo || 'Recursos humanos', d.empresa.razonSocial, '']

  let fila = y + 5
  for (const [i, texto] of rotulos.filter(Boolean).entries()) {
    doc.setFont('helvetica', i === 0 ? 'bold' : 'normal').setFontSize(i === 0 ? 9.5 : 8)
    doc.setTextColor(i === 0 ? TINTA : i === 1 ? GRIS : GRIS_SUAVE)
    doc.text(ajustar(doc, texto, anchoFirma + 20), CENTRO, fila, { align: 'center' })
    fila += i === 0 ? 5 : 4
  }

  // --- El pie ---
  // Fecha corta, no la de la formula. `fechaExpedicion` devuelve «a los
  // veintiseis (26) dias del mes de agosto», que en el cuerpo es la redaccion
  // que toca y en el pie daba «Emitida el a los veintiseis (26) dias...».
  const hoy = new Date().toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  pieDePagina(doc, `Emitida el ${hoy} por ${d.emitidaPor}`)

  doc.setProperties({
    title: `Constancia de trabajo — ${d.nombreCompleto}`,
    subject: 'Constancia de trabajo',
    author: d.empresa.razonSocial,
  })

  const apellido = d.nombreCompleto.split(' ').pop()?.toLowerCase() ?? ''
  return {
    blob: doc.output('blob'),
    nombre: `constancia-${d.ficha}-${apellido}.pdf`,
  }
}
