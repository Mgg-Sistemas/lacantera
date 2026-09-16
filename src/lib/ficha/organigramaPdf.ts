import { logoComoImagen } from '@/lib/ficha/logo'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import {
  membrete,
  tituloDocumento,
  pieDePagina,
  fechaLarga,
  MARCA,
  ROTULO,
  TINTA,
  GRIS,
  GRIS_SUAVE,
  FILA_ALTERNA,
  type Bordes,
  type EmpresaPapel,
} from '@/lib/ficha/papel'

/*
  EL ORGANIGRAMA, EN PAPEL

  Christopher, 16/09/2026: «solo personas autorizadas pueden editar el
  organigrama, aunque todos deberían poder descargarlo en pdf o imagen».

  Las dos mitades de esa frase son la decisión entera: editar sigue pidiendo
  nómina —si cualquiera pudiera crear ramas aparecerían «Limpieza», «Contrata» y
  tres más el mismo día—, pero mirarlo y llevárselo no le hace daño a nadie y le
  ahorra a media empresa preguntar a quién le toca qué.

  POR QUÉ UN ÁRBOL TUMBADO

  De arriba abajo, un organigrama de siete niveles pide una hoja cada vez más
  ancha y acaba con las cajas del último nivel del tamaño de un sello. Tumbado
  —la raíz a la izquierda y las ramas creciendo a la derecha— el ancho lo marcan
  los NIVELES, que son pocos y no crecen, y el alto lo marcan las hojas, que es
  lo que de verdad crece cuando entra gente.

  LO QUE FALLÓ LA PRIMERA VEZ, Y POR QUÉ

  Christopher, al abrir la primera versión: «las líneas conectoras no se ven, el
  membrete está cortado, los núcleos no tienen el nombre de algún responsable
  (si lo hay), los títulos de los núcleos están cortados o incompletos». Las
  cuatro cosas eran ciertas y tenían una causa cada una:

    - Las líneas iban en el gris de las rayas finas de tabla, que en blanco es
      casi blanco. Van ahora en el gris de las notas, y más gruesas.

    - El membrete y el pie leían los bordes de la hoja vertical: en una
      apaisada la regla se quedaba a dos tercios y el pie caía fuera del papel.
      Ahora se les pasan los bordes de ESTA hoja.

    - Cada fila medía lo mismo, repartiendo el alto de la hoja entre las hojas
      del árbol; con diecisiete filas la caja no llegaba a los nueve milímetros
      y el titular no cabía, así que no se pintaba. Y el nombre se cortaba en
      su primer renglón: «AYUDANTES DE», «COORDINADOR DE».

  Así que se invierte el orden: primero se mide cada caja con TODO lo que tiene
  que decir —el nombre entero, partido en los renglones que haga falta, y quién
  la ocupa—, y después la hoja crece hasta que quepa. Un organigrama que no cabe
  en A4 sale en una hoja más alta: se imprime ajustado a la página y se lee
  entero. Encoger la letra hasta que quepa era la otra opción, y con veinte
  cajas más dejaría un papel que no lee nadie.

  CADA CAJA DICE QUIÉN, O DICE QUE NO HAY NADIE

  Una unidad sin responsable escrito dice «Sin responsable asignado». Dejar el
  hueco en blanco obliga a adivinar si falta el dato o si falló el papel, y la
  norma es no dejar suponer. Lo apagado no sale: un organigrama es lo que la
  empresa es hoy.
*/

export interface NodoParaPapel {
  id: number
  padre_id: number | null
  nombre: string
  titular: string | null
  tipo: 'UNIDAD' | 'CARGO'
  cuantos: number
  activo: boolean
  orden: number
}

export interface DatosOrganigrama {
  nodos: NodoParaPapel[]
  empresa: EmpresaPapel
  momento: Date
}

/** Milímetros. */
const MARGEN = 12
const SEPARACION = 8
const HUECO_ENTRE_CAJAS = 3
const HUECO_ENTRE_RAICES = 8
const ANCHO_MINIMO_CAJA = 32
const ANCHO_MAXIMO_CAJA = 56
const ANCHO_A4 = 297
const ALTO_A4 = 210
/** Lo que ocupa el pie, desde el final del árbol hasta el borde. */
const ESPACIO_DEL_PIE = 20

const RELLENO = 2.2
const TALLA_NOMBRE = 7.5
const RENGLON_NOMBRE = 3.1
const SUBE_NOMBRE = 2.0
const TALLA_DETALLE = 6.6
const RENGLON_DETALLE = 2.8
const SUBE_DETALLE = 1.8
const ENTRE_NOMBRE_Y_DETALLE = 0.7
const ALTO_MINIMO_CAJA = 9

type Doc = import('jspdf').jsPDF

interface Detalle {
  texto: string
  /** Lo que dice que falta va apagado, para que no se lea como un nombre. */
  apagado: boolean
}

interface Caja {
  nodo: NodoParaPapel
  nivel: number
  hijos: Caja[]
  nombre: string[]
  detalles: string[][]
  apagados: boolean[]
  alto: number
  /** Alto de la caja con todo lo que cuelga de ella. */
  rama: number
  arriba: number
  centro: number
}

/** Qué se escribe debajo del nombre. */
function detallesDe(n: NodoParaPapel): Detalle[] {
  const titular = n.titular?.trim() || null

  if (n.tipo === 'UNIDAD') {
    return [
      titular
        ? { texto: `Responsable: ${titular}`, apagado: false }
        : { texto: 'Sin responsable asignado', apagado: true },
    ]
  }

  const detalles: Detalle[] = []
  if (titular) detalles.push({ texto: `Titular: ${titular}`, apagado: false })
  if (n.cuantos > 0) {
    const puestos = `${n.cuantos} puesto${n.cuantos === 1 ? '' : 's'}`
    detalles.push(
      titular || n.cuantos > 1
        ? { texto: puestos, apagado: false }
        : { texto: `${puestos} · sin titular asignado`, apagado: true },
    )
  }
  return detalles
}

/** Arma el árbol con lo vivo. Las raíces: sin padre, o con el padre apagado. */
function armarArbol(nodos: NodoParaPapel[]): Caja[] {
  const vivos = nodos.filter((n) => n.activo)
  const hijosDe = new Map<number | null, NodoParaPapel[]>()
  for (const n of vivos) {
    const lista = hijosDe.get(n.padre_id) ?? []
    lista.push(n)
    hijosDe.set(n.padre_id, lista)
  }
  for (const lista of hijosDe.values()) {
    lista.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
  }

  const crear = (n: NodoParaPapel, nivel: number): Caja => ({
    nodo: n,
    nivel,
    hijos: (hijosDe.get(n.id) ?? []).map((h) => crear(h, nivel + 1)),
    nombre: [],
    detalles: [],
    apagados: [],
    alto: 0,
    rama: 0,
    arriba: 0,
    centro: 0,
  })

  const vivosPorId = new Set(vivos.map((n) => n.id))
  return vivos
    .filter((n) => n.padre_id === null || !vivosPorId.has(n.padre_id))
    .sort((a, b) => a.orden - b.orden)
    .map((n) => crear(n, 0))
}

const todas = (cajas: Caja[]): Caja[] => cajas.flatMap((c) => [c, ...todas(c.hijos)])

/** Mide cada caja con su texto entero, partido al ancho que le toca. */
function medir(doc: Doc, cajas: Caja[], anchoCaja: number) {
  const dentro = anchoCaja - RELLENO * 2
  for (const c of todas(cajas)) {
    doc.setFont('helvetica', 'bold').setFontSize(TALLA_NOMBRE)
    c.nombre = doc.splitTextToSize(c.nodo.nombre, dentro) as string[]

    doc.setFont('helvetica', 'normal').setFontSize(TALLA_DETALLE)
    const detalles = detallesDe(c.nodo)
    c.detalles = detalles.map((d) => doc.splitTextToSize(d.texto, dentro) as string[])
    c.apagados = detalles.map((d) => d.apagado)

    const renglonesDeDetalle = c.detalles.reduce((t, r) => t + r.length, 0)
    c.alto = Math.max(
      ALTO_MINIMO_CAJA,
      RELLENO * 2 +
        c.nombre.length * RENGLON_NOMBRE +
        (renglonesDeDetalle > 0 ? ENTRE_NOMBRE_Y_DETALLE + renglonesDeDetalle * RENGLON_DETALLE : 0) -
        0.9,
    )
  }
}

/** El alto de cada rama: su caja, o lo que suman sus hijos, lo que sea mayor. */
function medirRamas(c: Caja): number {
  const hijos = c.hijos.map(medirRamas)
  const deLosHijos = hijos.reduce((t, h) => t + h, 0) + HUECO_ENTRE_CAJAS * Math.max(0, hijos.length - 1)
  c.rama = Math.max(c.alto, deLosHijos)
  return c.rama
}

/**
 * Coloca la rama empezando en `arriba`.
 *
 * Los hijos se apilan centrados en el alto de la rama, y el padre se centra
 * entre el primero y el último: es el reparto de toda la vida y, con veinte
 * cajas, no necesita más.
 */
function colocar(c: Caja, arriba: number) {
  if (c.hijos.length === 0) {
    c.arriba = arriba + (c.rama - c.alto) / 2
  } else {
    const deLosHijos =
      c.hijos.reduce((t, h) => t + h.rama, 0) + HUECO_ENTRE_CAJAS * (c.hijos.length - 1)
    let cursor = arriba + (c.rama - deLosHijos) / 2
    for (const h of c.hijos) {
      colocar(h, cursor)
      cursor += h.rama + HUECO_ENTRE_CAJAS
    }
    const entreHijos = (c.hijos[0].centro + c.hijos[c.hijos.length - 1].centro) / 2
    c.arriba = Math.min(Math.max(entreHijos - c.alto / 2, arriba), arriba + c.rama - c.alto)
  }
  c.centro = c.arriba + c.alto / 2
}

/** Membrete y título: lo que va encima del árbol. Devuelve dónde acaba. */
function cabecera(doc: Doc, logo: string, d: DatosOrganigrama, bordes: Bordes): number {
  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [['Emitido', fechaLarga(d.momento)]],
    desde: MARGEN + 2,
    bordes,
  })
  y = tituloDocumento(doc, y, 'Organigrama', undefined, bordes)

  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
  doc.text(
    'Recuadro rojo con fondo: unidad o dependencia.  Recuadro gris: cargo.  Debajo del nombre, quién responde o lo ocupa, y cuántos puestos tiene.',
    bordes.izq,
    y - 2,
  )
  return y + 4
}

export async function armarOrganigrama(d: DatosOrganigrama): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()

  const raices = armarArbol(d.nodos)
  const niveles = Math.max(0, ...todas(raices).map((c) => c.nivel)) + 1

  const ancho = Math.max(
    ANCHO_A4,
    MARGEN * 2 + niveles * ANCHO_MINIMO_CAJA + (niveles - 1) * SEPARACION,
  )
  const anchoCaja = Math.min(
    ANCHO_MAXIMO_CAJA,
    (ancho - MARGEN * 2 - (niveles - 1) * SEPARACION) / niveles,
  )

  /*
    PRIMERO SE MIDE, EN UNA HOJA DE BORRADOR.

    jsPDF convierte cada coordenada con el alto de la hoja en el momento de
    escribir, así que la hoja no se puede estirar después. Se mide en una hoja
    de prueba —la cabecera y las cajas— y el papel de verdad nace ya del tamaño
    que hace falta.
  */
  const borrador = new jsPDF({ unit: 'mm', format: [ancho, ALTO_A4], orientation: 'landscape' })
  const bordesBorrador: Bordes = { izq: MARGEN, der: ancho - MARGEN, pie: ALTO_A4 - 10 }
  const inicioDelArbol = cabecera(borrador, logo, d, bordesBorrador)

  medir(borrador, raices, anchoCaja)
  const altoDelArbol =
    raices.reduce((t, r) => t + medirRamas(r), 0) + HUECO_ENTRE_RAICES * Math.max(0, raices.length - 1)

  const alto = Math.max(ALTO_A4, inicioDelArbol + altoDelArbol + ESPACIO_DEL_PIE)
  const bordes: Bordes = { izq: MARGEN, der: ancho - MARGEN, pie: alto - 10 }

  const doc = new jsPDF({
    unit: 'mm',
    format: [ancho, alto],
    orientation: ancho >= alto ? 'landscape' : 'portrait',
    compress: true,
  })
  cabecera(doc, logo, d, bordes)

  if (raices.length === 0) {
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(GRIS)
    doc.text('El organigrama está vacío.', bordes.izq, inicioDelArbol + 6)
  } else {
    let cursor = inicioDelArbol
    for (const r of raices) {
      colocar(r, cursor)
      cursor += r.rama + HUECO_ENTRE_RAICES
    }

    // Si sobran niveles de ancho, el árbol se centra en vez de quedarse pegado.
    const usado = niveles * anchoCaja + (niveles - 1) * SEPARACION
    const desde = bordes.izq + Math.max(0, (bordes.der - bordes.izq - usado) / 2)
    const xDe = (nivel: number) => desde + nivel * (anchoCaja + SEPARACION)

    const cajas = todas(raices)

    // Primero las líneas, para que las cajas queden encima y tapen las puntas.
    doc.setDrawColor(GRIS_SUAVE).setLineWidth(0.4)
    for (const c of cajas) {
      if (c.hijos.length === 0) continue
      const salida = xDe(c.nivel) + anchoCaja
      const codo = salida + SEPARACION / 2
      const alturas = [c.centro, ...c.hijos.map((h) => h.centro)]

      doc.line(salida, c.centro, codo, c.centro)
      doc.line(codo, Math.min(...alturas), codo, Math.max(...alturas))
      for (const h of c.hijos) doc.line(codo, h.centro, xDe(h.nivel), h.centro)
    }

    for (const c of cajas) {
      const x = xDe(c.nivel)

      /*
        La unidad lleva el borde de la casa y un fondo; el cargo, borde gris y
        nada más. En un vistazo se distingue una dependencia de un puesto sin
        leer una palabra, y la leyenda de arriba lo dice por si acaso.
      */
      if (c.nodo.tipo === 'UNIDAD') {
        doc.setDrawColor(MARCA).setFillColor(FILA_ALTERNA).setLineWidth(0.5)
        doc.roundedRect(x, c.arriba, anchoCaja, c.alto, 1.2, 1.2, 'FD')
      } else {
        doc.setDrawColor(GRIS_SUAVE).setFillColor('#FFFFFF').setLineWidth(0.35)
        doc.roundedRect(x, c.arriba, anchoCaja, c.alto, 1.2, 1.2, 'FD')
      }

      let linea = c.arriba + RELLENO + SUBE_NOMBRE
      doc.setFont('helvetica', 'bold').setFontSize(TALLA_NOMBRE).setTextColor(ROTULO)
      for (const renglon of c.nombre) {
        doc.text(renglon, x + RELLENO, linea)
        linea += RENGLON_NOMBRE
      }

      // `linea` quedó un renglón de nombre por debajo del último: de ahí al
      // primer renglón de detalle se cambia la subida de una letra por la otra.
      linea += ENTRE_NOMBRE_Y_DETALLE + SUBE_DETALLE - SUBE_NOMBRE
      c.detalles.forEach((renglones, i) => {
        doc
          .setFont('helvetica', c.apagados[i] ? 'italic' : 'normal')
          .setFontSize(TALLA_DETALLE)
          .setTextColor(c.apagados[i] ? GRIS : TINTA)
        for (const renglon of renglones) {
          doc.text(renglon, x + RELLENO, linea)
          linea += RENGLON_DETALLE
        }
      })
    }
  }

  pieDePagina(
    doc,
    'Organigrama · generado por el sistema. Lo edita quien lleva la nómina; esta copia la puede sacar cualquiera.',
    bordes,
  )

  const blob = doc.output('blob')
  return { blob, nombre: `organigrama-${d.momento.toISOString().slice(0, 10)}.pdf` }
}
