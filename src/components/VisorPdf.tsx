import { useEffect, useState } from 'react'
import { Download, FileWarning, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'

/**
 * Ver el papel antes de quedárselo.
 *
 * Hasta ahora los PDF del sistema se descargaban de golpe: se pulsaba y
 * aparecía un archivo en la carpeta de descargas. Para un recibo que hay que
 * revisar antes de imprimir eso obliga a un rodeo —bajarlo, buscarlo, abrirlo,
 * y borrarlo si estaba mal—, y la carpeta se llena de intentos.
 *
 * Aquí se ve primero y se decide después. El visor es el del propio navegador:
 * ya sabe pasar páginas, acercar e imprimir, y trae su propio botón de
 * descarga. El de abajo se añade porque el del navegador no siempre está a la
 * vista —en un teléfono suele esconderse— y porque nombra el archivo como debe
 * llamarse, no con un identificador.
 */
interface VisorPdfProps {
  abierto: boolean
  onCerrar: () => void
  /** El PDF ya armado. Se libera solo al cerrar. */
  blob: Blob | null
  /** Con el que se guarda. Debe terminar en .pdf */
  nombreArchivo: string
  titulo: string
  /** Una línea sobre qué se está mirando. */
  descripcion?: string
}

export function VisorPdf({
  abierto,
  onCerrar,
  blob,
  nombreArchivo,
  titulo,
  descripcion,
}: VisorPdfProps) {
  const [url, setUrl] = useState<string | null>(null)

  /*
    La dirección temporal vive lo que vive el visor.

    `createObjectURL` reserva memoria hasta que se revoca a mano. Sin este
    efecto, abrir diez recibos seguidos deja diez PDF cargados en el navegador
    —y uno de ellos, el de la alianza, pesa 17 MB.
  */
  useEffect(() => {
    if (!abierto || !blob) return

    const temporal = URL.createObjectURL(blob)
    setUrl(temporal)

    return () => {
      URL.revokeObjectURL(temporal)
      setUrl(null)
    }
  }, [abierto, blob])

  useEffect(() => {
    if (!abierto) return
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', alPulsar)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', alPulsar)
      document.body.style.overflow = ''
    }
  }, [abierto, onCerrar])

  if (!abierto) return null

  const descargar = () => {
    if (!url) return
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = nombreArchivo
    enlace.click()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      className="fixed inset-0 z-50 flex flex-col bg-black/70 p-2 backdrop-blur-sm sm:p-4"
    >
      <div className="bg-surface mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-[10px] shadow-2xl">
        <header className="border-ink/10 flex items-start gap-3 border-b px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-ink/90 truncate text-base font-semibold">{titulo}</h2>
            {descripcion ? (
              <p className="text-ink/55 mt-0.5 truncate text-xs">{descripcion}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar la vista previa"
            className="text-ink/50 hover:bg-ink/8 hover:text-ink/90 -mt-0.5 shrink-0 rounded-[6px] p-1.5 transition-colors"
          >
            <X className="size-[18px]" />
          </button>
        </header>

        <div className="bg-ink/6 min-h-0 flex-1">
          {url ? (
            <iframe
              src={`${url}#view=FitH`}
              title={titulo}
              className="size-full border-0"
            />
          ) : (
            /* Sin blob no hay nada que enseñar. Pasa si la generación falló:
               mejor decirlo que dejar un rectángulo gris sin explicación. */
            <div className="text-ink/50 flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm">
              <FileWarning className="size-8 opacity-60" />
              No se pudo preparar el documento.
            </div>
          )}
        </div>

        <footer className="border-ink/10 flex items-center justify-between gap-3 border-t px-4 py-3 sm:px-5">
          <span className="text-ink/45 hidden truncate font-mono text-xs sm:block">
            {nombreArchivo}
          </span>
          <div className="flex flex-1 justify-end gap-2 sm:flex-none">
            <Button variant="ghost" onClick={onCerrar}>
              Cerrar
            </Button>
            <Button onClick={descargar} disabled={!url} icon={<Download className="size-[18px]" />}>
              Descargar
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}
