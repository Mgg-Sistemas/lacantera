/*
  LO QUE PASA CUANDO SE DESPLIEGA CON LA PESTAÑA ABIERTA

  Las pantallas se cargan por trozos, y cada trozo lleva el nombre con un hash
  del contenido. Al desplegar, los trozos viejos dejan de existir: quien tenía
  la pestaña abierta desde antes sigue pidiendo los de la versión anterior y le
  responden 404.

  Con `lazy`, ese 404 no se ve como un error — se ve como una pantalla en
  blanco. La promesa nunca resuelve, el Suspense se queda esperando para
  siempre, y en la consola solo queda un 404 de un archivo .js que no dice
  nada. Le pasó a Christopher con la líder mirando, y hoy se despliega muchas
  veces.

  El arreglo es recargar: el índice nuevo trae los nombres nuevos. Una sola
  vez, porque si el trozo falta por otra razón —la red, un bloqueador— recargar
  en bucle es peor que fallar.
*/

const MARCA = 'lacantera:recargado-por-version'

export function conReintento<T>(importar: () => Promise<T>): () => Promise<T> {
  return async () => {
    try {
      const modulo = await importar()
      // Salió bien: se olvida el intento anterior, para que el próximo
      // despliegue tenga derecho a su propia recarga.
      try {
        sessionStorage.removeItem(MARCA)
      } catch {
        // Navegador con el almacenamiento cerrado. Sin recarga automática,
        // pero la pantalla que sí carga no tiene por qué caerse por esto.
      }
      return modulo
    } catch (fallo) {
      let yaSeIntento = true
      try {
        yaSeIntento = sessionStorage.getItem(MARCA) !== null
        if (!yaSeIntento) sessionStorage.setItem(MARCA, '1')
      } catch {
        yaSeIntento = true
      }

      if (yaSeIntento) throw fallo

      window.location.reload()
      // No resuelve nunca a propósito: la página se está yendo. Resolver aquí
      // pintaría medio segundo de pantalla rota antes de la recarga.
      return new Promise<T>(() => {})
    }
  }
}
