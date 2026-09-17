import { useSyncExternalStore } from 'react'

/*
  LOS TEXTOS DE AYUDA SE PUEDEN APAGAR

  Quien entra por primera vez necesita la frase que explica la pantalla; quien
  entra cien veces al día ya se la sabe y le estorba. Un solo interruptor, el
  «(?)» de la cabecera, los apaga todos a la vez y el navegador lo recuerda.

  Va en un almacén aparte y no en estado de React para que todas las ayudas de
  la pantalla —la de la cabecera y las notas sueltas— cambien en el mismo
  instante al pulsar el botón.
*/

const CLAVE = 'lacantera:ayuda-oculta'
const oyentes = new Set<() => void>()

function leer(): boolean {
  try {
    return localStorage.getItem(CLAVE) === 'true'
  } catch {
    return false
  }
}

let oculta = leer()

function suscribir(oyente: () => void) {
  oyentes.add(oyente)
  return () => {
    oyentes.delete(oyente)
  }
}

export function alternarAyuda() {
  oculta = !oculta
  try {
    localStorage.setItem(CLAVE, String(oculta))
  } catch {
    // Sin almacenamiento, el cambio vale mientras dure la visita.
  }
  oyentes.forEach((o) => o())
}

export function useAyudaVisible(): boolean {
  return !useSyncExternalStore(suscribir, () => oculta)
}
