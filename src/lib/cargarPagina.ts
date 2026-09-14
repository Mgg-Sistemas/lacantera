import { createElement, type ComponentType } from 'react'
import { PantallaQueNoLlego } from '@/components/PantallaQueNoLlego'
import { revisarVersionAhora, versionPublicada } from '@/lib/version'

/*
  LO QUE PASA CUANDO SE DESPLIEGA CON LA PESTAÑA ABIERTA

  Las pantallas se cargan por trozos, y cada trozo lleva el nombre con un hash
  del contenido. Al desplegar, los trozos cambian de nombre: quien tenía la
  pestaña abierta desde antes sigue pidiendo los de la versión anterior, y si ya
  no están le responden 404.

  Con `lazy`, ese 404 no se ve como un error — se ve como una pantalla en
  blanco. La promesa nunca resuelve, el Suspense se queda esperando para
  siempre, y en la consola solo queda un 404 de un archivo .js que no dice
  nada. Le pasó a Christopher con la líder mirando, y hoy se despliega muchas
  veces.

  Hasta el 14-sep el arreglo era recargar sola. Recargar se llevaba lo que no se
  hubiera guardado, y desde ese día actualizar lo decide la persona
  (`lib/version.ts`). Así que en lugar de la pantalla que no llegó se pinta una
  que dice por qué, con el botón, y el aviso de versión nueva se entera en ese
  momento en vez de esperar a su reloj de cinco minutos.

  En el droplet casi no debería verse: los trozos de la versión anterior se
  quedan publicados unos días (`~/desplegar.sh`). En Vercel sí, porque allí no se
  quedan.

  No se reintenta la importación: una que falló no se vuelve a pedir de forma
  fiable sin recargar, y reintentar contra un archivo que ya no existe solo
  retrasaría el mensaje.
*/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function conAvisoSiNoLlega<T extends { default: ComponentType<any> }>(
  importar: () => Promise<T>,
): () => Promise<T> {
  return async () => {
    try {
      return await importar()
    } catch {
      const publicada = await versionPublicada()
      const hayOtra = publicada !== null && publicada !== __VERSION__
      if (hayOtra) revisarVersionAhora()

      const Pantalla = () =>
        createElement(PantallaQueNoLlego, { publicada: hayOtra ? publicada : null })

      // `lazy` solo mira `default`: la pantalla que explica ocupa el sitio de la
      // que no llegó.
      return { default: Pantalla } as unknown as T
    }
  }
}
