/**
 * EL INFORME TÉCNICO Y DE COSTOS DE UN EQUIPO.
 *
 * Christopher, 14/10/2026: «tráelo de SOS». Allá reemplaza un Word que la
 * oficina armaba a mano por máquina —ficha del equipo, historial cronológico
 * de intervenciones con su mano de obra y sus repuestos, totales consolidados,
 * conclusiones y firmas— y acá hacía falta lo mismo.
 *
 * NO ES EL INFORME DE MANTENIMIENTO, Y POR ESO ES OTRO PAPEL
 *
 * El de mantenimiento (`maquinariaPdf.ts`) responde «qué órdenes hubo»: saca
 * cada orden en su propia hoja, para firmarla y archivarla. Éste responde
 * «cuánto lleva costado ESTE equipo y en qué estado está»: una sola máquina,
 * un período, el historial en una tabla y el dinero sumado al final. Son dos
 * preguntas distintas y dos lectores distintos —el taller y la gerencia—, y
 * juntarlos daría un papel que no sirve bien para ninguna de las dos.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EL DINERO SALE DE LO QUE YA ESTÁ REGISTRADO. NO SE TECLEA AQUÍ.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * En SOS los costos viven en una tabla aparte del módulo de servicio, con sus
 * precios escritos a mano al emitir el informe, porque allá el taller nació
 * sin dinero. Acá no hace falta y no se copió: la mano de obra está en la
 * orden y los repuestos salieron del almacén con su costo promedio y su
 * movimiento de inventario.
 *
 * La consecuencia es deliberada: este papel NO puede decir un número distinto
 * del que dice el inventario. Si una cifra está mal, se corrige la orden —y se
 * corrige para todo el sistema—, no el informe.
 *
 * LO QUE SÍ SE ESCRIBE A MANO son los antecedentes, las conclusiones y las
 * recomendaciones: es lo único que no se deduce de los datos, y es justo lo
 * que hace que el papel valga más que una consulta en pantalla.
 */

import { logoComoImagen } from './logo'
import type { ArchivoArmado } from './armado'
import { ANCHO_UTIL, IZQ } from './hoja'
import {
  bloqueEtiquetado,
  type Columna,
  type EmpresaPapel,
  etiquetaValor,
  fechaCorta,
  fechaLarga,
  firmas,
  GRIS,
  membrete,
  notaAlPie,
  pieDePagina,
  seccion,
  tabla,
  tituloDocumento,
} from './papel'
import { bloqueParrafo, conHueco, SIN_DATO } from './maquinariaPdf'

type Doc = import('jspdf').jsPDF

const dolares = (n: number): string =>
  `$${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const cantidad = (n: number): string =>
  n.toLocaleString('es-VE', { maximumFractionDigits: 2 })

const texto = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined) return SIN_DATO
  const s = String(v).trim()
  return s === '' ? SIN_DATO : s
}

export interface RepuestoDelInformeTecnico {
  cantidad: number
  articulo: string
  unidad: string
  /** Lo que costó el renglón entero, no el unitario: es como lo guarda la orden. */
  costo: number
}

export interface IntervencionDelInforme {
  numero: string | null
  fecha: string
  fechaSalida: string | null
  /** Ya traducido: «Mantenimiento», «Servicio», «Reparación». */
  tipo: string
  /** Ya traducido. Una orden abierta sale en el historial diciendo que lo está. */
  estado: string
  taller: string | null
  tecnico: string | null
  origenTecnico: string | null
  motivo: string | null
  detalle: string | null
  horometro: number | null
  costoManoObra: number | null
  costoRepuestos: number
  repuestos: RepuestoDelInformeTecnico[]
  /** Las fotos del trabajo, ya reducidas. Vacio si no se subio ninguna. */
  fotos?: ImagenDelInforme[]
  /** Los adjuntos que NO son imagen -la orden firmada en PDF-, por su nombre. */
  adjuntos?: string[]
}

/** Una imagen ya reducida, tal como la deja `imagenesParaPapel`. */
export interface ImagenDelInforme {
  dataUrl: string
  ancho: number
  alto: number
  nombre: string
}

export interface EquipoDelInforme {
  codigo: string
  nombre: string
  clase: string | null
  tipo: string | null
  marca: string | null
  modelo: string | null
  serial: string | null
  anio: number | null
  propietario: string | null
  /** Ya traducido: «Operativa», «En mantenimiento»… */
  estado: string
  operador: string | null
  ubicacion: string | null
  horometro: number | null
  horasDesdeMantenimiento: number | null
  topeHoras: number | null
  ultimoMantenimiento: string | null
}

export interface FirmanteDelInforme {
  nombre: string
  cargo: string
}

export interface DatosInformeTecnico {
  equipo: EquipoDelInforme
  intervenciones: IntervencionDelInforme[]
  /** Qué período abarca, dicho en palabras. Nunca viene vacío. */
  periodo: string
  /** Redactado por el sistema y corregido a mano antes de emitir. */
  antecedentes: string
  conclusiones: string
  /** Una por renglón. Vacío es válido: no se inventa una recomendación. */
  recomendaciones: string[]
  valida: FirmanteDelInforme
  recibe: FirmanteDelInforme
  emitidoPor: string
  momento: Date
  empresa: EmpresaPapel
}

/*
  LAS COLUMNAS SUMAN 150, QUE ES EL ANCHO ÚTIL DE LA HOJA.

  No es una formalidad: `tabla` reparte lo que se le diga, así que una suma de
  más empuja la última columna fuera del papel y una de menos deja una franja
  en blanco a la derecha que parece un error de impresión.

  El trabajo realizado se lleva más de un tercio a propósito —es lo que se lee
  de verdad— y los dos costos van a la derecha, que es donde se buscan.
*/
const COLUMNAS: Columna[] = [
  { titulo: 'Fecha', ancho: 20 },
  { titulo: 'Orden', ancho: 16 },
  { titulo: 'Tipo · técnico', ancho: 26 },
  { titulo: 'Trabajo realizado e insumos', ancho: 54 },
  { titulo: 'Mano de obra', ancho: 17, alDerecha: true },
  { titulo: 'Repuestos', ancho: 17, alDerecha: true },
]

/**
 * Los insumos en una línea: «1 Pasador ($45,00) · 10 kg Grasa ($80,00)».
 *
 * Un repuesto sin costo IGUAL se nombra. El informe documenta lo que se le
 * puso al equipo, no solo lo que se pagó: una pieza que salió del almacén a
 * costo cero sigue siendo una pieza que ahora lleva encima.
 */
function insumos(lista: RepuestoDelInformeTecnico[]): string {
  return lista
    .map((r) => {
      const unidad = r.unidad.trim() === '' ? '' : ` ${r.unidad}`
      const precio = r.costo > 0 ? ` (${dolares(r.costo)})` : ''
      return `${cantidad(r.cantidad)}${unidad} ${r.articulo}${precio}`
    })
    .join(' · ')
}

function quien(i: IntervencionDelInforme): string {
  const nombre = (i.tecnico ?? '').trim() || (i.taller ?? '').trim()
  if (nombre === '') return SIN_DATO
  if (i.origenTecnico === 'EXTERNO') return `${nombre} · externo`
  if (i.origenTecnico === 'INTERNO') return `${nombre} · de la casa`
  return nombre
}

const celdas = (i: IntervencionDelInforme): string[] => {
  const trabajo = (i.detalle ?? '').trim() || (i.motivo ?? '').trim() || SIN_DATO
  const lista = insumos(i.repuestos)
  return [
    i.fechaSalida ? `${fechaCorta(i.fecha)}\na ${fechaCorta(i.fechaSalida)}` : fechaCorta(i.fecha),
    texto(i.numero),
    `${i.tipo}\n${quien(i)}`,
    lista === '' ? trabajo : `${trabajo}\nInsumos: ${lista}`,
    i.costoManoObra !== null && i.costoManoObra > 0 ? dolares(i.costoManoObra) : SIN_DATO,
    i.costoRepuestos > 0 ? dolares(i.costoRepuestos) : SIN_DATO,
  ]
}

export interface TotalesDelInforme {
  intervenciones: number
  manoObra: number
  repuestos: number
  total: number
  /** Cero cuando no hay ninguna: nunca una división por cero disfrazada. */
  promedio: number
}

/**
 * Las cuentas del informe, aparte del dibujo.
 *
 * Están fuera de la función que pinta para poder comprobarlas sin generar un
 * PDF —un informe que suma mal es peor que no tenerlo— y para que la pantalla
 * pueda enseñar el total ANTES de emitir, que es cuando todavía se puede
 * corregir una orden mal cargada.
 */
export function totalesDelInforme(lista: IntervencionDelInforme[]): TotalesDelInforme {
  const manoObra = lista.reduce((s, i) => s + (i.costoManoObra ?? 0), 0)
  const repuestos = lista.reduce((s, i) => s + i.costoRepuestos, 0)
  const total = manoObra + repuestos
  return {
    intervenciones: lista.length,
    manoObra,
    repuestos,
    total,
    promedio: lista.length === 0 ? 0 : total / lista.length,
  }
}

/**
 * Los antecedentes que propone el sistema, para no escribirlos desde cero.
 *
 * Se PROPONEN: la pantalla los deja editar antes de emitir. Un párrafo armado
 * con los datos dice lo que pasó, pero quien conoce el equipo sabe por qué, y
 * eso es lo que se espera leer en esta sección.
 */
export function antecedentesPropuestos(
  equipo: EquipoDelInforme,
  lista: IntervencionDelInforme[],
  periodo: string,
): string {
  if (lista.length === 0) {
    return (
      `El equipo ${equipo.codigo} · ${equipo.nombre} no registra intervenciones de taller ` +
      `en el período considerado (${periodo.toLowerCase()}). Se encuentra ${equipo.estado.toLowerCase()}.`
    )
  }

  const t = totalesDelInforme(lista)
  const primera = lista.reduce((a, b) => (a.fecha <= b.fecha ? a : b))
  const ultima = lista.reduce((a, b) => (a.fecha >= b.fecha ? a : b))
  const abiertas = lista.filter((i) => i.fechaSalida === null).length

  const horas =
    equipo.horometro !== null
      ? ` Al cierre de este informe el horómetro marca ${cantidad(equipo.horometro)} horas.`
      : ''
  const pendiente =
    abiertas > 0
      ? ` ${abiertas === 1 ? 'Una orden permanece abierta' : `${abiertas} órdenes permanecen abiertas`} a la fecha de emisión.`
      : ''

  return (
    `Durante ${periodo.toLowerCase()} el equipo ${equipo.codigo} · ${equipo.nombre} ` +
    `registró ${t.intervenciones} ${t.intervenciones === 1 ? 'intervención' : 'intervenciones'} de taller, ` +
    `desde el ${fechaCorta(primera.fecha)} hasta el ${fechaCorta(ultima.fecha)}, ` +
    `con una inversión total de ${dolares(t.total)} entre mano de obra y repuestos. ` +
    `Su estado operativo actual es ${equipo.estado.toLowerCase()}.${horas}${pendiente}`
  )
}

/** Los renglones numerados de la sección de recomendaciones. */
function listaNumerada(doc: Doc, y: number, puntos: string[]): number {
  let fila = y
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(GRIS)

  puntos.forEach((punto, i) => {
    const lineas = doc.splitTextToSize(punto, 142) as string[]
    fila = conHueco(doc, fila, lineas.length * 4.1 + 2)
    doc.text(`${i + 1}.`, IZQ, fila)
    doc.text(lineas, IZQ + 6, fila, { lineHeightFactor: 1.35 })
    fila += lineas.length * 4.1 + 2
  })

  return fila + 2
}

export async function armarInformeTecnico(d: DatosInformeTecnico): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  const t = totalesDelInforme(d.intervenciones)

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['EQUIPO', d.equipo.codigo],
      ['EMITIDO', fechaLarga(d.momento)],
    ],
  })

  y = tituloDocumento(doc, y, 'Informe técnico y de costos')
  y = notaAlPie(doc, y, `${d.equipo.nombre} · ${d.periodo}`) + 2

  // ── 1 ─────────────────────────────────────────────────────────────────────
  y = seccion(doc, y, '1. Datos de identificación del equipo')
  y = bloqueEtiquetado(doc, y, 'FICHA DEL EQUIPO', [
    ['Código', d.equipo.codigo],
    ['Denominación', d.equipo.nombre],
    ['Clase y tipo', [d.equipo.clase, d.equipo.tipo].filter(Boolean).join(' · ') || SIN_DATO],
    ['Marca y modelo', [d.equipo.marca, d.equipo.modelo].filter(Boolean).join(' ') || SIN_DATO],
    ['Serial', texto(d.equipo.serial)],
    ['Año', texto(d.equipo.anio)],
    ['Propietario', texto(d.equipo.propietario)],
    ['Estado operativo', d.equipo.estado],
    ['Operador responsable', texto(d.equipo.operador)],
    ['Ubicación', texto(d.equipo.ubicacion)],
    [
      'Horómetro actual',
      d.equipo.horometro !== null ? `${cantidad(d.equipo.horometro)} h` : SIN_DATO,
    ],
    [
      'Desde el último mantenimiento',
      d.equipo.horasDesdeMantenimiento !== null
        ? `${cantidad(d.equipo.horasDesdeMantenimiento)} h${
            d.equipo.topeHoras !== null ? ` de ${cantidad(d.equipo.topeHoras)} h` : ''
          }`
        : SIN_DATO,
    ],
    [
      'Último mantenimiento',
      d.equipo.ultimoMantenimiento ? fechaCorta(d.equipo.ultimoMantenimiento) : SIN_DATO,
    ],
  ])

  // ── 2 ─────────────────────────────────────────────────────────────────────
  y = conHueco(doc, y, 20)
  y = seccion(doc, y, '2. Antecedentes y estado operativo general')
  y = bloqueParrafo(doc, y, 'ANTECEDENTES', d.antecedentes) + 2

  // ── 3 ─────────────────────────────────────────────────────────────────────
  y = conHueco(doc, y, 24)
  y = seccion(doc, y, '3. Historial de intervenciones técnicas y costos')
  y =
    d.intervenciones.length === 0
      ? bloqueParrafo(
          doc,
          y,
          'SIN INTERVENCIONES',
          'El equipo no registra órdenes de taller en el período considerado.',
        )
      : tabla(
          doc,
          y,
          COLUMNAS,
          /* Cronológico ascendente: un historial se lee hacia adelante, al revés
             que la pantalla, que enseña lo último primero. */
          [...d.intervenciones]
            .sort((a, b) => a.fecha.localeCompare(b.fecha))
            .map(celdas),
          `Total del período: ${dolares(t.total)}`,
        ) + 4

  // ── 4 ─────────────────────────────────────────────────────────────────────
  y = conHueco(doc, y, 40)
  y = seccion(doc, y, '4. Resumen financiero de mantenimiento')
  y =
    etiquetaValor(
      doc,
      y,
      [
        ['Intervenciones', String(t.intervenciones)],
        ['Mano de obra', dolares(t.manoObra)],
        ['Repuestos y materiales', dolares(t.repuestos)],
        ['Total del período', dolares(t.total)],
        ['Promedio por intervención', dolares(t.promedio)],
      ],
      { columnas: 1 },
    ) + 4

  // ── 5 ─────────────────────────────────────────────────────────────────────
  y = conHueco(doc, y, 24)
  /*
    EL REGISTRO FOTOGRAFICO.

    Solo sale si hay algo que ensenar, y entonces corre la numeracion de las
    dos ultimas secciones -igual que en el papel de SOS del que viene-. Una
    seccion que diga «sin fotografias» ocupa media hoja para decir que no hay
    nada que ver.

    Las imagenes llegan ya reducidas de `imagenesParaPapel`. Aqui solo se
    colocan: dos por fila, cada una metida en su hueco SIN deformarse -una
    foto estirada de un cilindro no sirve para discutir un trabajo-.
  */
  const conFotos = d.intervenciones.filter((i) => (i.fotos ?? []).length > 0)
  const conAdjuntos = d.intervenciones.filter((i) => (i.adjuntos ?? []).length > 0)
  const hayRegistro = conFotos.length > 0 || conAdjuntos.length > 0

  if (hayRegistro) {
    y = conHueco(doc, y, 24)
    y = seccion(doc, y, '5. Registro fotografico')

    const HUECO = (ANCHO_UTIL - 6) / 2
    const ALTO_HUECO = 42

    for (const i of conFotos) {
      y = conHueco(doc, y, 14)
      doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(GRIS)
      doc.text(`${texto(i.numero)} \u00b7 ${fechaCorta(i.fecha)}`, IZQ, y)
      y += 4.5

      let columna = 0
      for (const foto of i.fotos ?? []) {
        if (columna === 0) y = conHueco(doc, y, ALTO_HUECO + 4)

        const escala = Math.min(HUECO / foto.ancho, ALTO_HUECO / foto.alto)
        const ancho = foto.ancho * escala
        const alto = foto.alto * escala
        const x = IZQ + columna * (HUECO + 6) + (HUECO - ancho) / 2

        try {
          doc.addImage(foto.dataUrl, 'JPEG', x, y, ancho, alto)
        } catch {
          /* una imagen que jsPDF no sabe leer no tumba el informe entero */
        }

        columna += 1
        if (columna === 2) {
          columna = 0
          y += ALTO_HUECO + 4
        }
      }
      if (columna === 1) y += ALTO_HUECO + 4
      y += 2
    }

    if (conAdjuntos.length > 0) {
      /*
        LOS PDF NO SE DIBUJAN, SE NOMBRAN. La orden firmada sube como PDF y no
        cabe como imagen. Callarla seria peor que nombrarla: quien lea el
        informe sabra que existe y donde buscarla, en su orden del sistema.
      */
      y = conHueco(doc, y, 14)
      doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(GRIS)
      doc.text('ADJUNTOS EN EL SISTEMA', IZQ, y)
      y += 4.5

      doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(GRIS)
      for (const i of conAdjuntos) {
        const lineas = doc.splitTextToSize(
          `${texto(i.numero)}: ${(i.adjuntos ?? []).join(', ')}`,
          ANCHO_UTIL,
        ) as string[]
        y = conHueco(doc, y, lineas.length * 4.1 + 1)
        doc.text(lineas, IZQ, y, { lineHeightFactor: 1.35 })
        y += lineas.length * 4.1 + 1
      }
      y += 2
    }

    y = conHueco(doc, y, 24)
  }

  y = seccion(doc, y, `${hayRegistro ? '6' : '5'}. Conclusiones tecnicas y recomendaciones`)
  y = bloqueParrafo(doc, y, 'CONCLUSIONES', d.conclusiones) + 2
  if (d.recomendaciones.length > 0) {
    y = conHueco(doc, y, 16)
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(GRIS)
    doc.text('RECOMENDACIONES', IZQ, y)
    y = listaNumerada(doc, y + 5, d.recomendaciones)
  }

  // ── 6 ─────────────────────────────────────────────────────────────────────
  /*
    LAS FIRMAS NO SE PEGAN AL FONDO DE LA HOJA.

    `firmas` dibuja la raya en la `y` que recibe y el rótulo 4,5 mm MÁS ABAJO,
    así que una raya puesta al borde manda su propio rótulo encima del pie. Es
    el mismo tope de la casa que usa la ficha: nunca más abajo del alto que
    ocupa el bloque entero.
  */
  const ALTO_FIRMA = 18
  y = conHueco(doc, y + 6, ALTO_FIRMA + 6)
  y = seccion(doc, y, `${hayRegistro ? '7' : '6'}. Firmas de conformidad y validacion`)
  firmas(
    doc,
    y + 12,
    { texto: 'Valida', nombre: d.valida.nombre, nota: d.valida.cargo },
    { texto: 'Recibe conforme', nombre: d.recibe.nombre, nota: d.recibe.cargo },
  )

  pieDePagina(
    doc,
    `Informe técnico de ${d.equipo.codigo} · generado el ${fechaLarga(d.momento)} por ${d.emitidoPor}`,
  )

  doc.setProperties({
    title: `Informe técnico ${d.equipo.codigo}`,
    subject: 'Informe técnico y de costos de mantenimiento y reparación',
    author: d.empresa.razonSocial,
  })

  return {
    blob: doc.output('blob'),
    nombre: `informe-tecnico-${d.equipo.codigo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`,
  }
}
