import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

/**
 * Una nota que se corta en dos líneas, y ofrece el resto solo si de verdad se
 * cortó.
 *
 * LO PIDIÓ CHRISTOPHER viendo una corrección de costo del libro de movimientos:
 * setecientos caracteres de nota —el costo viejo, el nuevo y quién lo
 * autorizó— estiraban la fila hasta ocupar media pantalla. «Debemos colocar la
 * opción de ver más, o de ver detalle y desplegar un modal o algo, para evitar
 * la saturación de información en la misma pantalla».
 *
 * SE MIDE, NO SE CUENTAN LETRAS. Cortar a partir de tantos caracteres parece lo
 * sencillo y no sirve: la misma nota de cincuenta y cinco letras cabe en una
 * línea en una pantalla ancha y ocupa cinco en una columna estrecha. Lo único
 * que sabe si el texto se cortó es el navegador, así que se le pregunta —si lo
 * que mide el párrafo entero es más de lo que se ve, se cortó— y se le vuelve a
 * preguntar cada vez que la columna cambia de ancho.
 *
 * El botón solo aparece cuando hace falta. Un «ver detalle» en cada una de las
 * doscientas filas sería justo la saturación que esto viene a quitar.
 */
interface NotaRecortadaProps {
  /** El texto entero. Va entre comillas angulares, como toda nota que escribió alguien. */
  texto: string
  /** Qué pasa al pedir el resto: normalmente, abrir el detalle de la fila. */
  onVerMas: () => void
  etiqueta?: string
  /** Tamaño, color y ancho del párrafo. El corte lo pone el componente. */
  className?: string
}

export function NotaRecortada({
  texto,
  onVerMas,
  etiqueta = 'Ver detalle',
  className,
}: NotaRecortadaProps) {
  const parrafo = useRef<HTMLParagraphElement>(null)
  const [cortada, setCortada] = useState(false)

  // Antes de pintar y no después: medido tarde, el botón aparecería un instante
  // más tarde que la fila y la tabla daría un salto.
  useLayoutEffect(() => {
    const el = parrafo.current
    if (!el) return

    // Un píxel de holgura: la cursiva y las tildes de las mayúsculas asoman a
    // veces por debajo de la caja sin que falte ninguna palabra.
    const medir = () => setCortada(el.scrollHeight > el.clientHeight + 1)
    medir()

    const observador = new ResizeObserver(medir)
    observador.observe(el)
    return () => observador.disconnect()
  }, [texto])

  return (
    <>
      <p ref={parrafo} className={cn('line-clamp-2 break-words', className)}>
        «{texto}»
      </p>
      {cortada ? (
        <button
          type="button"
          onClick={onVerMas}
          className="text-ink/55 hover:text-ink/85 mt-0.5 text-xs underline underline-offset-2"
        >
          {etiqueta}
        </button>
      ) : null}
    </>
  )
}
