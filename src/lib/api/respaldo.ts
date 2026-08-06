import { useMutation, useQuery } from '@tanstack/react-query'
import { rpc } from './rpc'

/**
 * El respaldo de la base.
 *
 * La descarga no pasa por el visor de documentos como los PDF y las imágenes,
 * y no es un olvido: un archivo SQL de varios megas no se revisa mirándolo. Lo
 * que hay que revisar de un respaldo —que esté completo— lo comprueba la propia
 * función antes de entregarlo, y lo que hay que saber antes de pulsar está en
 * la pantalla.
 */
export interface ResumenRespaldo {
  tablas: number
  filas: number
  ultimo: string | null
  ultimo_por: string | null
  /** Si este usuario tiene el rol. La base lo vuelve a comprobar al descargar. */
  autorizado: boolean
}

export function useResumenRespaldo() {
  return useQuery({
    queryKey: ['respaldo', 'resumen'],
    // Devuelve una fila; PostgREST envuelve las funciones que devuelven tabla
    // en un arreglo aunque traiga una sola.
    queryFn: async () => (await rpc<ResumenRespaldo[]>('respaldo_resumen'))?.[0] ?? null,
    staleTime: 60_000,
  })
}

/** Cómo se llamará el archivo. Con la fecha delante, que es como se ordenan
 *  solos en la carpeta cuando ya hay varios. */
function nombreDeArchivo(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `respaldo-lacantera-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.sql`
}

export function useDescargarRespaldo() {
  return useMutation({
    mutationFn: async () => {
      const sql = await rpc<string>('respaldo_datos')

      if (!sql || sql.length < 100) {
        throw new Error('La base devolvió un respaldo vacío. No se descargó nada.')
      }

      /*
        `text/plain` y no `application/sql`: el segundo no lo reconocen todos
        los navegadores y alguno lo abre en una pestaña en vez de guardarlo.
      */
      const blob = new Blob([sql], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.download = nombreDeArchivo()

      // El enlace tiene que estar en el documento para que el clic cuente como
      // navegación, y la dirección no se puede soltar en la misma vuelta: el
      // navegador todavía no ha empezado a leer el archivo y la descarga se
      // cae sin decir nada.
      document.body.append(enlace)
      enlace.click()
      enlace.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)

      return { bytes: blob.size, nombre: enlace.download }
    },
  })
}
