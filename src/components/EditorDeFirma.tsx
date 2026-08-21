import { useEffect, useRef, useState } from 'react'
import { Eraser, PenLine, Type, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/cn'
import {
  LETRAS_DE_FIRMA,
  escribirFirma,
  papelATransparencia,
  recortarYExportar,
} from '@/lib/firma/dibujo'
import type { OrigenDeFirma } from '@/lib/api/firmas'

/*
  LAS TRES FORMAS DE FIRMAR

  Christopher las pidió las tres: «a mano estilo drawing en un canvas, o
  tecleado y estilizado con algún tipo de letra o cargando una imagen de su
  firma». Son tres porque hay tres situaciones distintas:

    Trazarla   — quien está en una tableta o en un portátil con pantalla
                 táctil. Sale igual a la de verdad.
    Escribirla — quien está con ratón y teclado, donde trazar sale torcido.
    Cargarla   — quien ya firmó en papel y le hizo una foto. Es la que más se
                 parece a la real, y la que peor llega: con la hoja detrás.

  Las tres acaban en lo mismo, un PNG recortado y con el fondo transparente,
  para que al resto del sistema le dé igual de dónde salió.
*/

const LIENZO_ANCHO = 900
const LIENZO_ALTO = 300

type Modo = 'DIBUJAR' | 'ESCRIBIR' | 'CARGAR'

const MODOS: Array<{ valor: Modo; etiqueta: string; icono: typeof PenLine }> = [
  { valor: 'DIBUJAR', etiqueta: 'Trazarla', icono: PenLine },
  { valor: 'ESCRIBIR', etiqueta: 'Escribirla', icono: Type },
  { valor: 'CARGAR', etiqueta: 'Cargar una imagen', icono: Upload },
]

const ORIGEN: Record<Modo, OrigenDeFirma> = {
  DIBUJAR: 'DIBUJADA',
  ESCRIBIR: 'TECLEADA',
  CARGAR: 'IMAGEN',
}

export function EditorDeFirma({
  nombre,
  onListo,
}: {
  /** Se propone como texto al escribirla: casi siempre uno firma con su nombre. */
  nombre: string
  /** Devuelve el PNG y de qué modo salió, o null cuando el lienzo se vacía. */
  onListo: (firma: { imagen: string; origen: OrigenDeFirma } | null) => void
}) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const trazando = useRef(false)
  const [modo, setModo] = useState<Modo>('DIBUJAR')
  const [texto, setTexto] = useState(nombre)
  const [letra, setLetra] = useState(LETRAS_DE_FIRMA[0].valor)
  const [hayAlgo, setHayAlgo] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const contexto = () => lienzo.current?.getContext('2d') ?? null

  const limpiar = () => {
    const ctx = contexto()
    if (!ctx || !lienzo.current) return
    ctx.clearRect(0, 0, lienzo.current.width, lienzo.current.height)
    setHayAlgo(false)
    setAviso(null)
    onListo(null)
  }

  /*
    Se avisa al de fuera con lo que hay ahora mismo en el lienzo.

    Se llama al soltar el trazo, no en cada movimiento: recortar y exportar
    recorre el lienzo píxel a píxel, y hacerlo sesenta veces por segundo
    mientras alguien firma se nota en la mano.
  */
  const avisar = () => {
    if (!lienzo.current) return
    const imagen = recortarYExportar(lienzo.current)
    setHayAlgo(imagen !== null)
    onListo(imagen ? { imagen, origen: ORIGEN[modo] } : null)
  }

  // Cambiar de modo vacía el lienzo: mezclar un trazo a mano con un nombre
  // escrito encima no produce una firma, produce un tachón.
  useEffect(() => {
    limpiar()
    // El resto de dependencias son estables; lo que dispara esto es el modo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo])

  // Escribir se repinta con cada tecla, que es lo que deja elegir la letra
  // viéndola.
  useEffect(() => {
    if (modo !== 'ESCRIBIR' || !lienzo.current) return
    escribirFirma(lienzo.current, texto, letra)
    avisar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, texto, letra])

  /** El punto del lienzo bajo el dedo o el ratón. */
  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const caja = e.currentTarget.getBoundingClientRect()
    // El lienzo se dibuja a más resolución de la que ocupa en pantalla, para
    // que el trazo no salga pixelado en el papel. De ahí la regla de tres.
    return {
      x: ((e.clientX - caja.left) / caja.width) * LIENZO_ANCHO,
      y: ((e.clientY - caja.top) / caja.height) * LIENZO_ALTO,
    }
  }

  const empezarTrazo = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (modo !== 'DIBUJAR') return
    const ctx = contexto()
    if (!ctx) return

    // El puntero se captura para que el trazo siga aunque el dedo salga del
    // recuadro: sin esto, firmar rápido corta la rúbrica en el borde.
    e.currentTarget.setPointerCapture(e.pointerId)
    trazando.current = true

    const { x, y } = punto(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3.2
    ctx.strokeStyle = '#161616'
  }

  const seguirTrazo = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!trazando.current || modo !== 'DIBUJAR') return
    const ctx = contexto()
    if (!ctx) return
    const { x, y } = punto(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const soltarTrazo = () => {
    if (!trazando.current) return
    trazando.current = false
    avisar()
  }

  const cargarImagen = (archivo: File) => {
    setAviso(null)
    const ctx = contexto()
    if (!ctx || !lienzo.current) return

    const url = URL.createObjectURL(archivo)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(url)
      ctx.clearRect(0, 0, LIENZO_ANCHO, LIENZO_ALTO)

      // Cabe entera y centrada, sin deformarla.
      const escala = Math.min(LIENZO_ANCHO / img.width, LIENZO_ALTO / img.height)
      const w = img.width * escala
      const h = img.height * escala
      ctx.drawImage(img, (LIENZO_ANCHO - w) / 2, (LIENZO_ALTO - h) / 2, w, h)

      // Una foto de una firma llega con la hoja detrás. Sin esto, el papel
      // saldría con un recuadro blanco pegado encima.
      try {
        papelATransparencia(ctx, LIENZO_ANCHO, LIENZO_ALTO)
      } catch {
        // Pasa con una imagen de otro dominio, que aquí no ocurre porque el
        // archivo viene del disco. Si ocurriera, la firma se guarda con su
        // fondo antes que no guardarse.
      }

      avisar()
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      setAviso('No se pudo leer esa imagen. Prueba con un PNG o un JPG.')
    }

    img.src = url
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {MODOS.map((m) => (
          <button
            key={m.valor}
            type="button"
            onClick={() => setModo(m.valor)}
            className={cn(
              'flex items-center gap-2 rounded-[6px] border px-3 py-1.5 text-sm transition-colors',
              modo === m.valor
                ? 'border-marca/40 bg-marca/8 text-marca'
                : 'border-ink/15 text-ink/65 hover:border-ink/30',
            )}
          >
            <m.icono className="size-4" />
            {m.etiqueta}
          </button>
        ))}
      </div>

      {modo === 'ESCRIBIR' ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input
            label="Cómo firmas"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            hint="Puede ser el nombre completo o solo las iniciales."
          />
          <Select
            label="Letra"
            value={letra}
            onChange={(e) => setLetra(e.target.value)}
            opciones={LETRAS_DE_FIRMA.map((l) => ({ valor: l.valor, etiqueta: l.etiqueta }))}
          />
        </div>
      ) : null}

      {modo === 'CARGAR' ? (
        <div className="mt-3">
          <label className="border-ink/20 hover:border-ink/32 text-ink/75 inline-flex cursor-pointer items-center gap-2 rounded-[6px] border px-3 py-2 text-sm transition-colors">
            <Upload className="size-4" />
            Elegir la imagen
            <input
              type="file"
              className="hidden"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const archivo = e.target.files?.[0]
                e.target.value = ''
                if (archivo) cargarImagen(archivo)
              }}
            />
          </label>
          <p className="text-ink/45 mt-2 text-xs">
            Una foto de tu firma en papel blanco sirve. El fondo se quita solo; lo que importa es
            que el trazo se vea oscuro y la hoja clara.
          </p>
        </div>
      ) : null}

      {/*
        EL RECUADRO

        Con la raya y el «Firma aquí» de un papel de verdad, para que se
        entienda sin leer nada que ahí dentro se firma. La raya es de fondo, no
        del lienzo: si se dibujara en el lienzo saldría impresa en el PDF.
      */}
      <div className="border-hairline bg-ink/2 relative mt-3 overflow-hidden rounded-[8px] border">
        <div className="pointer-events-none absolute inset-x-8 bottom-9 border-b border-dashed border-current opacity-15" />
        {!hayAlgo ? (
          <p className="text-ink/30 pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs">
            {modo === 'DIBUJAR' ? 'Firma aquí con el ratón o con el dedo' : 'Aquí se verá tu firma'}
          </p>
        ) : null}

        <canvas
          ref={lienzo}
          width={LIENZO_ANCHO}
          height={LIENZO_ALTO}
          onPointerDown={empezarTrazo}
          onPointerMove={seguirTrazo}
          onPointerUp={soltarTrazo}
          onPointerCancel={soltarTrazo}
          className={cn(
            'block h-[180px] w-full touch-none',
            modo === 'DIBUJAR' ? 'cursor-crosshair' : 'cursor-default',
          )}
        />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" variant="ghost" icon={<Eraser />} onClick={limpiar}>
          Borrar y empezar de nuevo
        </Button>
        {aviso ? <span className="text-danger text-xs">{aviso}</span> : null}
      </div>
    </div>
  )
}
