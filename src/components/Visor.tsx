import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, FileWarning, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'

/**
 * Ver el papel antes de quedárselo.
 *
 * Los documentos del sistema se descargaban de golpe: se pulsaba y aparecía un
 * archivo en la carpeta de descargas. Para un recibo, una factura o un carnet
 * que hay que revisar antes de imprimir eso obliga a un rodeo —bajarlo,
 * buscarlo, abrirlo, y borrarlo si estaba mal—, y la carpeta se llena de
 * intentos.
 *
 * Aquí se ve primero y se decide después, y da igual que sea un PDF o una
 * imagen: la puerta es la misma y siempre tiene los dos botones, cerrar y
 * descargar.
 *
 * El PDF lo pinta el visor del navegador, que ya sabe pasar páginas, acercar e
 * imprimir. La imagen no necesita nada de eso: se enseña entera, encajada en el
 * hueco, que es como se revisa un carnet antes de mandarlo a la imprenta.
 */
interface VisorProps {
  abierto: boolean
  onCerrar: () => void
  /**
   * El archivo ya armado en memoria. Para lo que genera el propio sistema —un
   * recibo, un carnet— que nace aquí y no hay que ir a buscar.
   */
  blob?: Blob | null
  /**
   * Una dirección firmada. Para lo que está guardado: el navegador lo pide por
   * trozos y pinta la primera página sin esperar al archivo entero, que con un
   * acta escaneada de 17 MB es la diferencia entre abrir y esperar.
   */
  href?: string | null
  /** Con el que se guarda. Con su extensión, que es de donde se deduce el tipo. */
  nombreArchivo: string
  titulo: string
  /** Una línea sobre qué se está mirando. */
  descripcion?: string
  /**
   * El tipo declarado, cuando se sabe. Manda sobre la extensión del nombre
   * porque un archivo puede haberse subido llamándose "acta" a secas.
   */
  mime?: string | null
}

const EXTENSIONES_IMAGEN = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp']

/**
 * Si lo que viene es una imagen.
 *
 * Se mira primero el tipo real del blob, luego el declarado y por último la
 * extensión del nombre. En ese orden porque el blob no miente: lo acaba de
 * fabricar el sistema.
 */
function esImagen(blob: Blob | null | undefined, mime: string | null | undefined, nombre: string) {
  const declarado = blob?.type || mime || ''
  if (declarado) return declarado.startsWith('image/')
  return EXTENSIONES_IMAGEN.includes(nombre.split('.').pop()?.toLowerCase() ?? '')
}

export function Visor({
  abierto,
  onCerrar,
  blob,
  href,
  nombreArchivo,
  titulo,
  descripcion,
  mime,
}: VisorProps) {
  const [deMemoria, setDeMemoria] = useState<string | null>(null)
  const [bajando, setBajando] = useState(false)

  /*
    La dirección temporal vive lo que vive el visor.

    `createObjectURL` reserva memoria hasta que se revoca a mano. Sin este
    efecto, abrir diez recibos seguidos deja diez archivos cargados en el
    navegador.
  */
  useEffect(() => {
    if (!abierto || !blob) return

    const temporal = URL.createObjectURL(blob)
    setDeMemoria(temporal)

    return () => {
      URL.revokeObjectURL(temporal)
      setDeMemoria(null)
    }
  }, [abierto, blob])

  const url = deMemoria ?? href ?? null

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

  const imagen = esImagen(blob, mime, nombreArchivo)

  /*
    Guardarlo con el nombre que le toca.

    Con el archivo en memoria basta apuntar el enlace. Con una dirección firmada
    no: `download` se ignora cuando el archivo viene de otro dominio, y el
    navegador lo guardaría con el identificador aleatorio del almacén en vez de
    con el nombre del documento. Por eso se trae primero. Cuesta una segunda
    petición, pero solo la paga quien decide quedárselo, y el archivo suele venir
    ya de la caché de haberlo mirado.
  */
  const descargar = async () => {
    if (!url) return

    if (deMemoria) {
      const enlace = document.createElement('a')
      enlace.href = deMemoria
      enlace.download = nombreArchivo
      enlace.click()
      return
    }

    setBajando(true)
    try {
      const respuesta = await fetch(url)
      const temporal = URL.createObjectURL(await respuesta.blob())
      const enlace = document.createElement('a')
      enlace.href = temporal
      enlace.download = nombreArchivo
      enlace.click()
      URL.revokeObjectURL(temporal)
    } finally {
      setBajando(false)
    }
  }

  // Al `body`, por lo mismo que el modal: un ancestro con `transform` —y lo
  // hay, la animación de entrada de cada pantalla— convierte a `fixed` en
  // relativo a él y el visor deja de cubrir la ventana.
  return createPortal(
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
          {!url ? (
            /* Sin archivo no hay nada que enseñar. Pasa si la generación falló:
               mejor decirlo que dejar un rectángulo gris sin explicación. */
            <div className="text-ink/50 flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm">
              <FileWarning className="size-8 opacity-60" />
              No se pudo preparar el documento.
            </div>
          ) : imagen ? (
            /*
              La imagen encajada y sobre un fondo neutro.

              `object-contain` y no `cover`: un carnet recortado por los bordes
              en la vista previa es exactamente lo que esta pantalla existe para
              evitar. El fondo a cuadros deja ver dónde acaba el papel cuando la
              imagen tiene zonas blancas o transparentes.
            */
            <div className="flex h-full items-center justify-center p-4 sm:p-6">
              <img
                src={url}
                alt={titulo}
                className="max-h-full max-w-full object-contain shadow-lg"
                style={{
                  backgroundColor: '#fff',
                  backgroundImage:
                    'linear-gradient(45deg, rgba(0,0,0,.06) 25%, transparent 25%, transparent 75%, rgba(0,0,0,.06) 75%), linear-gradient(45deg, rgba(0,0,0,.06) 25%, transparent 25%, transparent 75%, rgba(0,0,0,.06) 75%)',
                  backgroundSize: '16px 16px',
                  backgroundPosition: '0 0, 8px 8px',
                }}
              />
            </div>
          ) : (
            <iframe src={`${url}#view=FitH`} title={titulo} className="size-full border-0" />
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
            <Button
              onClick={() => void descargar()}
              disabled={!url || bajando}
              icon={<Download className="size-[18px]" />}
            >
              {bajando ? 'Guardando…' : 'Descargar'}
            </Button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
