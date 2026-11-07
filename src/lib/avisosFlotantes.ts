import { useSyncExternalStore } from 'react'

/*
  LOS AVISOS FLOTANTES («TOASTS») DE PEDIDOS / COMPRAS

  MGG dice casi todo con un aviso que aparece abajo y se va solo: «"X" agregado
  a la solicitud», «Orden aprobada: SP-…», «No puede ser más de lo pedido».
  La Cantera no tenía esa pieza —cada pantalla escribe su error en la propia
  tarjeta—, y copiar el módulo de MGG «con sus textos» sin ella dejaría la
  mitad de los textos sin sitio donde salir. Va aparte y pequeña: una lista en
  memoria y quien la pinta (`components/AvisosFlotantes.tsx`).
*/

export type TipoAviso = 'success' | 'error' | 'warning' | 'info'

export interface AvisoFlotante {
  id: number
  texto: string
  tipo: TipoAviso
}

let lista: AvisoFlotante[] = []
let siguiente = 1
const oyentes = new Set<() => void>()

const avisar = () => oyentes.forEach((f) => f())

export function toast(texto: string, tipo: TipoAviso = 'success'): void {
  const id = siguiente++
  // Cuatro a la vista como mucho: el quinto empuja al más viejo.
  lista = [...lista, { id, texto, tipo }].slice(-4)
  avisar()
  // Los errores se quedan un poco más: hay que leerlos.
  setTimeout(() => quitarAviso(id), tipo === 'error' ? 7000 : 4500)
}

export function quitarAviso(id: number): void {
  lista = lista.filter((a) => a.id !== id)
  avisar()
}

export function useAvisosFlotantes(): AvisoFlotante[] {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f)
      return () => oyentes.delete(f)
    },
    () => lista,
    () => lista,
  )
}

/** El mensaje de un error, en castellano si viene de nuestras funciones. */
export const mensajeDe = (e: unknown, respaldo: string): string =>
  e instanceof Error && e.message ? e.message : respaldo
