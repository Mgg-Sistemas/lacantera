import { useEffect, useRef, useState } from 'react'
import { Camera, Trash2, ZoomIn } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { recorteCss, type Encuadre } from '@/lib/ficha/encuadre'
import { cn } from '@/lib/cn'

/** Lo que mide el previo en pantalla. Guarda la proporción del carnet, 24 × 27 mm. */
const PREVIO_ANCHO = 168
const PREVIO_ALTO = 189

const MAX_MB = 5

interface EncuadreFotoProps {
  /** URL local de la foto ya descargada. Null mientras no haya. */
  url: string | null
  encuadre: Encuadre
  onEncuadre: (e: Encuadre) => void
  onArchivo: (archivo: File) => void
  onQuitar: () => void
  editable: boolean
  guardando?: boolean
}

/**
 * Cargar la foto del trabajador y decidir qué parte se ve.
 *
 * Se arrastra para mover la cara y se acerca con la barra. No se recorta la
 * imagen: se guarda dónde mirar. Así la misma foto sirve para el carnet
 * vertical y para el recuadro de la hoja, que no tienen la misma proporción, y
 * se puede recentrar mañana sin pedirle otra foto a nadie.
 */
export function EncuadreFoto({
  url,
  encuadre,
  onEncuadre,
  onArchivo,
  onQuitar,
  editable,
  guardando = false,
}: EncuadreFotoProps) {
  const entrada = useRef<HTMLInputElement>(null)
  const [medida, setMedida] = useState<{ w: number; h: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)

  // Hace falta el tamaño real de la foto para saber cuánto sobra y, con eso,
  // cuánto se mueve el punto de interés por cada píxel arrastrado.
  useEffect(() => {
    if (!url) {
      setMedida(null)
      return
    }

    const img = new Image()
    img.onload = () => setMedida({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = url
  }, [url])

  const estilo =
    url && medida
      ? {
          backgroundImage: `url(${JSON.stringify(url)})`,
          ...recorteCss(medida.w, medida.h, PREVIO_ANCHO, PREVIO_ALTO, encuadre),
        }
      : undefined

  function elegir(archivo: File | undefined) {
    setError(null)
    if (!archivo) return

    if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) {
      setError('La foto tiene que ser JPG, PNG o WEBP.')
      return
    }

    if (archivo.size > MAX_MB * 1024 * 1024) {
      setError(
        `La foto pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el máximo son ${MAX_MB}. Sácala con menos resolución o mándala por WhatsApp y guarda la que llega.`,
      )
      return
    }

    onArchivo(archivo)
  }

  /**
   * Arrastrar mueve el punto de interés, no la imagen.
   *
   * Un píxel de ratón vale más o menos según cuánto sobre de foto: si sobra
   * poco, un pequeño movimiento la recorre entera. Por eso el delta se divide
   * entre el sobrante en vez de sumarse tal cual.
   */
  function iniciarArrastre(ev: React.PointerEvent<HTMLDivElement>) {
    if (!editable || !url || !medida) return

    const caja = recorteCss(medida.w, medida.h, PREVIO_ANCHO, PREVIO_ALTO, encuadre)
    const [ancho, alto] = caja.backgroundSize.split(' ').map((v) => parseFloat(v))
    const sobraX = ancho - PREVIO_ANCHO
    const sobraY = alto - PREVIO_ALTO

    const raton = { x: ev.clientX, y: ev.clientY }
    const desde = { ...encuadre }
    const acotar = (v: number) => Math.min(1, Math.max(0, v))

    // Los oyentes van en `window` y no en el recuadro: así el arrastre sigue
    // aunque el puntero se salga del marco, que es lo que pasa siempre al
    // empujar la foto hasta el borde.
    setArrastrando(true)

    const mover = (e: PointerEvent) => {
      const dx = sobraX > 0 ? (e.clientX - raton.x) / sobraX : 0
      const dy = sobraY > 0 ? (e.clientY - raton.y) / sobraY : 0

      // Restar y no sumar: arrastrar hacia la derecha trae la parte izquierda
      // de la foto, que es lo que hace el dedo sobre un mapa.
      onEncuadre({ zoom: desde.zoom, x: acotar(desde.x - dx), y: acotar(desde.y - dy) })
    }

    const soltar = () => {
      setArrastrando(false)
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }

    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        onPointerDown={iniciarArrastre}
        style={{ width: PREVIO_ANCHO, height: PREVIO_ALTO, ...estilo }}
        className={cn(
          'rounded-card border-hairline relative overflow-hidden border bg-[#cfd6e6] bg-no-repeat',
          editable && url && 'cursor-grab touch-none',
          arrastrando && 'cursor-grabbing',
        )}
      >
        {!url ? (
          <div className="text-ink/40 absolute inset-0 grid place-items-center gap-1 text-center">
            <Camera className="mx-auto size-7 opacity-50" />
            <span className="text-xs">Sin foto</span>
          </div>
        ) : null}

        {/* La guía de la cara: en un carnet los ojos van más o menos a un tercio
            de arriba. Sin una referencia, cada ficha queda encuadrada distinto. */}
        {editable && url ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0"
            style={{ top: '33%', borderTop: '1px dashed rgba(255,255,255,.65)' }}
          />
        ) : null}
      </div>

      {editable ? (
        <>
          <div className="flex w-[168px] items-center gap-2">
            <ZoomIn className="text-ink/40 size-4 shrink-0" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.02}
              disabled={!url}
              value={encuadre.zoom}
              onChange={(e) => onEncuadre({ ...encuadre, zoom: Number(e.target.value) })}
              className="accent-royal-600 h-1 w-full cursor-pointer disabled:opacity-40"
              aria-label="Acercar la foto"
            />
          </div>

          <input
            ref={entrada}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              elegir(e.target.files?.[0])
              e.target.value = ''
            }}
          />

          <div className="flex flex-wrap justify-center gap-2">
            <Button
              size="sm"
              variant="outline"
              icon={<Camera />}
              disabled={guardando}
              onClick={() => entrada.current?.click()}
            >
              {url ? 'Cambiar foto' : 'Cargar foto'}
            </Button>
            {url ? (
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 />}
                disabled={guardando}
                onClick={onQuitar}
              >
                Quitar
              </Button>
            ) : null}
          </div>

          {url ? (
            <p className="text-ink/40 max-w-[220px] text-center text-xs">
              Arrastra para centrar la cara sobre la línea.
            </p>
          ) : null}

          {error ? <ErrorDeCarga error={new Error(error)} className="max-w-[240px]" /> : null}
        </>
      ) : null}
    </div>
  )
}
