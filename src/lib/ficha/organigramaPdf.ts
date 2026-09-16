import { logoComoImagen } from '@/lib/ficha/logo'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import {
  membrete,
  tituloDocumento,
  lineaEmpresa,
  pieDePagina,
  fechaLarga,
  MARCA,
  ROTULO,
  TINTA,
  GRIS,
  HAIRLINE,
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

  De arriba abajo, un organigrama de cinco niveles pide una hoja cada vez más
  ancha y acaba con las cajas del último nivel del tamaño de un sello. Tumbado
  —la raíz a la izquierda y las ramas creciendo a la derecha— el ancho lo marcan
  los NIVELES, que son pocos y no crecen, y el alto lo marcan las hojas, que es
  lo que de verdad crece cuando entra gente. Con eso cabe en apaisado y se lee.

  Cada caja dice el nombre y, debajo, quién lo ocupa o cuántos puestos tiene. Lo
  apagado no sale: un organigrama es lo que la empresa es hoy.
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

/** Milímetros. El alto de fila se ajusta a lo que haya; el resto es fijo. */
const IZQ = 12
const SEPARACION = 6
const ALTO_MINIMO = 7
const ALTO_MAXIMO = 14

interface Colocado extends NodoParaPapel {
  nivel: number
  /** Cuántas hojas cuelgan de él: es su altura en filas. */
  filas: number
  /** Fila donde se centra, en filas desde arriba. */
  centro: number
}

/**
 * Coloca el árbol: cada hoja ocupa una fila y cada padre se centra en las suyas.
 *
 * Es el reparto de toda la vida y no necesita más: con veinte nodos, calcular
 * posiciones «bonitas» cuesta más de lo que mejora.
 */
function colocar(nodos: NodoParaPapel[]): Colocado[] {
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

  const colocados: Colocado[] = []
  let filaLibre = 0

  const recorrer = (n: NodoParaPapel, nivel: number): Colocado => {
    const hijos = hijosDe.get(n.id) ?? []
    if (hijos.length === 0) {
      const puesto: Colocado = { ...n, nivel, filas: 1, centro: filaLibre + 0.5 }
      filaLibre += 1
      colocados.push(puesto)
      return puesto
    }
    const puestos = hijos.map((h) => recorrer(h, nivel + 1))
    const primero = puestos[0]
    const ultimo = puestos[puestos.length - 1]
    const puesto: Colocado = {
      ...n,
      nivel,
      filas: puestos.reduce((t, p) => t + p.filas, 0),
      centro: (primero.centro + ultimo.centro) / 2,
    }
    colocados.push(puesto)
    return puesto
  }

  // Las raíces son las que no tienen padre, o cuyo padre está apagado.
  const vivosPorId = new Set(vivos.map((n) => n.id))
  for (const n of vivos) {
    if (n.padre_id === null || !vivosPorId.has(n.padre_id)) recorrer(n, 0)
  }

  return colocados
}

export async function armarOrganigrama(d: DatosOrganigrama): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true })

  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [['Emitido', fechaLarga(d.momento)]],
  })
  y = tituloDocumento(doc, y, 'Organigrama')
  y = lineaEmpresa(doc, y, `${d.empresa.razonSocial} · RIF ${d.empresa.rif}`)

  const colocados = colocar(d.nodos)

  if (colocados.length === 0) {
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(GRIS)
    doc.text('El organigrama está vacío.', IZQ, y + 6)
  } else {
    const niveles = Math.max(...colocados.map((n) => n.nivel)) + 1
    const filas = Math.max(...colocados.map((n) => n.centro + 0.5))

    const anchoUtil = ancho - IZQ * 2
    const anchoCaja = (anchoUtil - SEPARACION * (niveles - 1)) / niveles
    const altoDisponible = alto - y - 14
    const altoFila = Math.min(ALTO_MAXIMO, Math.max(ALTO_MINIMO, altoDisponible / filas))
    const altoCaja = altoFila - 2.5

    const xDe = (nivel: number) => IZQ + nivel * (anchoCaja + SEPARACION)
    const yDe = (centro: number) => y + 4 + centro * altoFila - altoCaja / 2

    // Primero las líneas, para que las cajas queden encima y tapen los cruces.
    doc.setDrawColor(HAIRLINE)
    doc.setLineWidth(0.3)
    for (const n of colocados) {
      if (n.padre_id === null) continue
      const padre = colocados.find((p) => p.id === n.padre_id)
      if (!padre) continue

      const xPadre = xDe(padre.nivel) + anchoCaja
      const xHijo = xDe(n.nivel)
      const yPadre = yDe(padre.centro) + altoCaja / 2
      const yHijo = yDe(n.centro) + altoCaja / 2
      const codo = xPadre + SEPARACION / 2

      doc.line(xPadre, yPadre, codo, yPadre)
      doc.line(codo, yPadre, codo, yHijo)
      doc.line(codo, yHijo, xHijo, yHijo)
    }

    for (const n of colocados) {
      const x = xDe(n.nivel)
      const caja = yDe(n.centro)

      /*
        La unidad lleva el borde de la casa y el cargo lo lleva suave: en un
        vistazo se distingue una dependencia de un puesto sin leer una palabra.
      */
      doc.setDrawColor(n.tipo === 'UNIDAD' ? MARCA : HAIRLINE)
      doc.setLineWidth(n.tipo === 'UNIDAD' ? 0.5 : 0.3)
      doc.roundedRect(x, caja, anchoCaja, altoCaja, 1.2, 1.2)

      const dentro = anchoCaja - 4
      doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(ROTULO)
      const nombre = (doc.splitTextToSize(n.nombre, dentro) as string[])[0]
      doc.text(nombre, x + 2, caja + (altoCaja > 9 ? 4 : altoCaja / 2 + 1))

      const debajo = n.titular ?? (n.cuantos > 0 ? `${n.cuantos} puesto${n.cuantos === 1 ? '' : 's'}` : null)
      if (debajo && altoCaja > 9) {
        doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(TINTA)
        const linea = (doc.splitTextToSize(debajo, dentro) as string[])[0]
        doc.text(linea, x + 2, caja + 7.5)
      }
    }
  }

  pieDePagina(doc, 'Organigrama · lo edita quien lleva la nómina; esta copia la puede sacar cualquiera.')

  const blob = doc.output('blob')
  return { blob, nombre: `organigrama-${d.momento.toISOString().slice(0, 10)}.pdf` }
}
