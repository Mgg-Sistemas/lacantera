import { CloudOff, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Vacio } from '@/components/ui/Estado'
import { actualizarAhora } from '@/lib/version'

/**
 * Lo que se pinta en lugar de una pantalla que no se pudo traer.
 *
 * Antes no se pintaba nada: se recargaba la página, y con ella se iba lo que
 * hubiera abierto. Desde el 14-sep actualizar lo decide la persona
 * (`lib/version.ts`), así que cuando falta el archivo de una pantalla se dice por
 * qué y se deja el botón.
 *
 * Dos causas, dos textos. Si hay publicada una versión distinta de la que corre,
 * es el despliegue: el archivo de la pantalla cambió de nombre y la versión
 * abierta ya no lo encuentra. Si no, es la red, y lo honesto es decir eso. En los
 * dos casos el remedio es recargar: una importación que falló no se vuelve a
 * pedir de forma fiable sin volver a cargar la página.
 */
export function PantallaQueNoLlego({
  publicada,
}: {
  /** La versión publicada cuando es distinta de la que corre; nulo si no lo es o no se supo. */
  publicada: string | null
}) {
  const porVersion = publicada !== null

  return (
    <Vacio
      icono={porVersion ? <RefreshCw /> : <CloudOff />}
      titulo={
        porVersion
          ? 'Esta pantalla es de la versión nueva del sistema'
          : 'No se pudo abrir esta pantalla'
      }
      descripcion={
        porVersion
          ? 'Se publicó una versión nueva mientras tenías el sistema abierto, y esta pantalla ya no llega a la anterior. Pulsa Actualizar cuando quieras traerla.'
          : 'No llegó desde el servidor. Revisa la conexión y pulsa Recargar.'
      }
      accion={
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="sm" variant="outline" onClick={() => history.back()}>
            Volver
          </Button>
          <Button size="sm" icon={<RefreshCw />} onClick={() => actualizarAhora(publicada)}>
            {porVersion ? 'Actualizar' : 'Recargar'}
          </Button>
        </div>
      }
    />
  )
}
