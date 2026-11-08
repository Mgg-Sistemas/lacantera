import { useEffect, useState } from 'react'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { num } from '@/lib/ficha/inventarioWhatsapp'

/*
  LO COMÚN DE LAS PANTALLAS DEL TELÉFONO DEL ALMACENISTA (fase 1b, 08/11/2026).

  Tipos, reglas y fechas que comparten la página única (`Almacen.tsx`) y sus
  pasos de salida, traslado, por retornar, reporte e históricos. Aquí no hay
  componentes: esos van en `piezas.tsx`.
*/

/** Un producto tal como se ve en la lista: con el stock DE ESTE almacén, no el de la empresa. */
export interface ProductoEnAlmacen {
  id: number
  codigo: string
  nombre: string
  categoria: string
  unidad: string
  stock: number
  /** Lo que se puede sacar o trasladar: la existencia menos lo prestado. */
  disponible: number
  /** Nulo para quien no puede ver la valoración: la vista lo esconde. */
  costoPromedio: number | null
  /** Los dueños con saldo aquí. Con dos o más, cada salida dice de cuál. */
  duenos: string[]
}

/** Un material de una salida o un traslado, mientras se escribe. */
export interface LineaDeMaterial {
  producto: ProductoEnAlmacen
  cantidad: string
  propietario: string
}

export const lineaDe = (p: ProductoEnAlmacen): LineaDeMaterial => ({ producto: p, cantidad: '', propietario: '' })

export const sinAcentos = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Lo que falta en los materiales, como lo dice MGG (`errorLineas`). Null si están bien. */
export function errorLineas(lineas: LineaDeMaterial[]): string | null {
  if (lineas.length === 0) return 'Agrega al menos un material.'
  for (const l of lineas) {
    const c = Number(l.cantidad) || 0
    const p = l.producto
    if (!(c > 0)) return `Escribe cuánto de ${p.nombre}.`
    if (c > p.disponible) return `No alcanza ${p.nombre}: hay ${num(p.disponible)} ${p.unidad}.`
    if (p.duenos.length > 1 && !l.propietario) {
      return `Elige de quién es ${p.nombre}: ahí hay material de varios dueños.`
    }
  }
  return null
}

const SEGUNDOS_PARA_AVISAR_DE_LA_SEÑAL = 12

/** El aviso de mala señal de las demás vistas de teléfono, a los doce segundos. */
export function useTardaPorLaSeñal(guardando: boolean) {
  const [tarda, setTarda] = useState(false)
  useEffect(() => {
    if (!guardando) {
      setTarda(false)
      return
    }
    const t = setTimeout(() => setTarda(true), SEGUNDOS_PARA_AVISAR_DE_LA_SEÑAL * 1000)
    return () => clearTimeout(t)
  }, [guardando])
  return tarda
}

/* ──────────────────────────────────────── fechas (reporte e históricos) */

export type Atajo = 'hoy' | 'mes' | 'mesPasado' | 'd60' | 'd90'

export const ETIQUETA_ATAJO: Record<Atajo, string> = {
  hoy: 'Hoy',
  mes: 'Este mes',
  mesPasado: 'Mes pasado',
  d60: '60 días',
  d90: '90 días',
}

/** AAAA-MM-DD de un día contado en UTC, para no depender del huso del teléfono. */
const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Desde y hasta de un atajo, contados desde hoy en Caracas. */
export function rangoDe(atajo: Atajo): { desde: string; hasta: string } {
  const hoy = hoyEnCaracas()
  const [a, m] = hoy.split('-').map(Number)
  switch (atajo) {
    case 'hoy':
      return { desde: hoy, hasta: hoy }
    case 'mes':
      return { desde: iso(new Date(Date.UTC(a, m - 1, 1))), hasta: hoy }
    case 'mesPasado':
      return {
        desde: iso(new Date(Date.UTC(a, m - 2, 1))),
        hasta: iso(new Date(Date.UTC(a, m - 1, 0))),
      }
    case 'd60':
    case 'd90': {
      const dias = atajo === 'd60' ? 60 : 90
      const h = new Date(`${hoy}T00:00:00Z`)
      h.setUTCDate(h.getUTCDate() - dias)
      return { desde: iso(h), hasta: hoy }
    }
  }
}

/** Fechas mal puestas: «desde» después de «hasta», vacías, o pasadas de hoy. */
export const fechasMal = (desde: string, hasta: string) =>
  !desde || !hasta || desde > hasta || hasta > hoyEnCaracas()

/** Cuántas filas se pintan por tanda en los históricos. */
export const POR_TANDA = 40
