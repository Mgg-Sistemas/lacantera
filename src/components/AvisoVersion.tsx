import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { actualizarAhora, useVersion } from '@/lib/version'

/**
 * El aviso de que hay una versión nueva, y la decisión de cuándo actualizar.
 *
 * NO SE RECARGA SOLO. Se avisa, y la persona actualiza cuando haya terminado y
 * guardado lo que estaba haciendo; el porqué está en `lib/version.ts`.
 *
 * «Más tarde» lo pliega a una etiqueta en la misma esquina, no lo quita:
 * trabajar sobre una versión vieja creyendo que es la última es como se pierde
 * una tarde buscando un error que ya se arregló. Y si sale OTRA versión mientras
 * está plegado, se vuelve a abrir.
 *
 * CUANDO ACTUALIZAR NO BASTA. Si tras pulsar «Actualizar» el navegador sigue
 * trayendo la vieja, el HTML viene de más atrás —un proxy de la oficina, la
 * caché de la operadora— y otro botón igual solo haría parpadear la pantalla.
 * Entonces se dice qué hacer, y ese aviso no se pliega.
 */
export function AvisoVersion() {
  const { estado, publicada } = useVersion()
  const [plegadoPara, setPlegadoPara] = useState<string | null>(null)

  if (estado === 'al-dia') return null

  if (estado === 'vieja-y-atascada') {
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

  if (plegadoPara !== null && plegadoPara === publicada) {
    return (
      <button
        type="button"
        onClick={() => setPlegadoPara(null)}
        aria-label="Hay una versión nueva del sistema. Abrir el aviso"
        className="border-warning/40 bg-warning-soft text-warning hover:bg-warning/12 fixed right-4 bottom-3 z-[60] flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-lg"
      >
        <RefreshCw className="size-3.5" />
        Versión nueva
      </button>
    )
  }

  return (
    <div
      role="status"
      className="border-warning/40 bg-warning-soft text-warning fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-lg items-start gap-3 rounded-[6px] border p-3 shadow-lg sm:inset-x-auto sm:right-4 sm:left-auto"
    >
      <RefreshCw className="mt-0.5 size-[18px] shrink-0" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">Hay una versión nueva del sistema</p>
        <p className="mt-0.5 text-xs leading-relaxed opacity-90">
          Termina y guarda lo que estés haciendo. Cuando quieras, pulsa Actualizar: nada se recarga
          solo.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button size="sm" icon={<RefreshCw />} onClick={() => actualizarAhora(publicada)}>
            Actualizar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPlegadoPara(publicada)}>
            Más tarde
          </Button>
        </div>
      </div>
    </div>
  )
}
