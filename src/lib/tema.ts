import { useCallback, useEffect, useState } from 'react'

export type Tema = 'claro' | 'oscuro' | 'sistema'

const CLAVE = 'lacantera:tema'

function leerPreferencia(): Tema {
  const guardado = localStorage.getItem(CLAVE)
  return guardado === 'claro' || guardado === 'oscuro' ? guardado : 'sistema'
}

function sistemaEsOscuro(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function aplicar(tema: Tema): void {
  const oscuro = tema === 'oscuro' || (tema === 'sistema' && sistemaEsOscuro())
  document.documentElement.classList.toggle('dark', oscuro)
}

/**
 * Aplica el tema antes del primer pintado.
 *
 * Se llama desde main.tsx, no desde un componente: si esperara a que React
 * monte, la pantalla parpadearía en blanco antes de oscurecerse. Es el mismo
 * motivo por el que los sitios con tema oscuro ejecutan este código en un
 * script bloqueante del <head>.
 */
export function aplicarTemaInicial(): void {
  aplicar(leerPreferencia())
}

export function useTema() {
  const [tema, setTemaEstado] = useState<Tema>(leerPreferencia)

  const setTema = useCallback((nuevo: Tema) => {
    setTemaEstado(nuevo)
    localStorage.setItem(CLAVE, nuevo)
    aplicar(nuevo)
  }, [])

  // Con "sistema" hay que seguir escuchando: el sistema operativo puede
  // cambiar solo al anochecer, con la aplicación abierta.
  useEffect(() => {
    if (tema !== 'sistema') return
    const lista = window.matchMedia('(prefers-color-scheme: dark)')
    const alCambiar = () => aplicar('sistema')
    lista.addEventListener('change', alCambiar)
    return () => lista.removeEventListener('change', alCambiar)
  }, [tema])

  return { tema, setTema }
}
