import { RefreshCw } from 'lucide-react'
import { useVersion } from '@/lib/version'

/**
 * Cuando la recarga automática no basta.
 *
 * La aplicación se recarga sola al detectar que hay una versión nueva. Si tras
 * hacerlo sigue trayendo la vieja, el HTML no viene del navegador sino de más
 * atrás —un proxy de la oficina, la caché de la operadora—, y seguir
 * recargando solo haría parpadear la pantalla.
 *
 * Entonces se dice. Lo peor que puede pasar es que alguien siga trabajando
 * sobre una versión de la semana pasada creyendo que está al día: los errores
 * que aparecen así se buscan donde no están.
 */
export function AvisoVersion() {
  const estado = useVersion()

  if (estado !== 'vieja-y-atascada') return null

  return (
    <div
      role="alert"
      className="border-warning/40 bg-warning-soft text-warning fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-lg items-start gap-3 rounded-[6px] border p-3 shadow-lg sm:inset-x-auto sm:right-4 sm:left-auto"
    >
      <RefreshCw className="mt-0.5 size-[18px] shrink-0" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">Estás viendo una versión antigua del sistema</p>
        <p className="mt-0.5 text-xs leading-relaxed opacity-90">
          Hay una más reciente publicada y tu navegador sigue trayendo la anterior. Recarga con
          Ctrl+Shift+R, o abre el sistema en una ventana de incógnito.
        </p>
      </div>
      <button
        type="button"
        onClick={() => location.reload()}
        className="border-warning/40 hover:bg-warning/12 shrink-0 rounded-[6px] border px-2.5 py-1 text-xs font-medium"
      >
        Recargar
      </button>
    </div>
  )
}
