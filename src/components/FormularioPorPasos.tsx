import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

/*
  UN FORMULARIO LARGO, PARTIDO EN PASOS.

  Nació de la evaluación del frontend del 24/09/2026. El encargo citaba Uber,
  Quick Base, Sprout Social, Cirius y University of Phoenix, y los cinco tienen
  algo en común que conviene decir porque decide dónde se usa esto y dónde no:
  **son formularios de alta**. Alguien que llega por primera vez, no sabe cuánto
  falta, y puede irse. Partirlo en pasos sube la tasa de terminación porque
  reduce el miedo —se ve el final—, no porque sea más rápido.

  POR ESO NO VA EN TODAS PARTES. Un formulario que alguien llena treinta veces
  al día es justo lo contrario: quien lo llena ya sabe lo que viene, y partirlo
  le añade clics y le quita la vista de conjunto. Compra directa, notas de
  entrega y facturas de proveedor se quedaron sin pasos a propósito.

  El criterio no es la longitud: es cada cuánto se llena y quién lo llena.

  LOS PASOS NO SE INVENTAN, SE LEEN. Las tres pantallas donde entra esto ya
  estaban agrupadas en tarjetas con título —quién es, su contrato, cómo se le
  paga— porque quien las escribió ya sabía por dónde se parten. Los pasos son
  esos grupos; no hubo que redistribuir un solo campo.

  SE PUEDE VOLVER, Y SALTAR A LO YA VISTO. Ir hacia atrás no pide permiso: un
  paso a paso que encierra es peor que una página larga. Hacia adelante solo se
  llega a lo ya visitado, porque saltarse un paso obligatorio para descubrir al
  final que faltaba es la forma más segura de que alguien pierda lo escrito.

  LO QUE FALTA SE DICE EN EL PASO, NO AL GUARDAR. El botón de seguir dice qué
  falta cuando no se puede seguir. Un error que solo aparece al final obliga a
  recorrer los tres pasos buscando cuál era.

  LA ANIMACIÓN ES LA DE LA PORTADA. Se pidió expresamente, y es lo que evita
  que esto parezca traído de otro sistema: mismo fotograma y misma curva que
  `anim-surgir`, con la duración bajada a 0,35 s —ver `anim-paso` en
  `index.css`—. Se descartó inventar una transición nueva: al lado de las tres
  que ya tiene la casa se habría notado como pegada.
*/

export interface PasoDelFormulario {
  id: string
  titulo: string
  subtitulo?: string
  /**
   * Qué le falta a este paso para poder pasar al siguiente.
   *
   * Es texto y no un booleano a propósito: lo que se enseña es la frase, así
   * que quien escribe el paso escribe también cómo se pide lo que falta.
   */
  falta?: string | null
  contenido: ReactNode
}

export function FormularioPorPasos({
  pasos,
  cancelarA,
  etiquetaFinal,
  guardando,
  onTerminar,
  error,
}: {
  pasos: PasoDelFormulario[]
  /** A dónde se vuelve si se abandona. */
  cancelarA: string
  /** Lo que dice el botón del último paso: «Crear ficha», «Guardar cambios». */
  etiquetaFinal: string
  guardando?: boolean
  onTerminar: () => void
  error?: ReactNode
}) {
  const [actual, setActual] = useState(0)
  // Hasta dónde se ha llegado. Sin esto, volver atrás a corregir una cédula
  // obligaría a pasar de nuevo por todos los pasos de vuelta.
  const [masLejos, setMasLejos] = useState(0)

  const paso = pasos[actual]
  const ultimo = actual === pasos.length - 1
  const falta = paso.falta ?? null

  const ir = (i: number) => {
    setActual(i)
    setMasLejos((m) => Math.max(m, i))
  }

  return (
    <>
      <Rail pasos={pasos} actual={actual} masLejos={masLejos} onIr={ir} />

      {/*
        La clave es el paso, no el índice: cambiarla es lo que hace que React
        monte el panel de nuevo y la animación vuelva a correr. Con una clave
        fija se animaría una sola vez, la primera.
      */}
      <Card key={paso.id} className="anim-paso">
        <div className="mb-4">
          <h2 className="text-ink/90 text-base font-semibold">{paso.titulo}</h2>
          {paso.subtitulo ? <p className="text-ink/55 mt-1 text-sm">{paso.subtitulo}</p> : null}
        </div>
        {paso.contenido}
      </Card>

      {error ? <div className="mt-4">{error}</div> : null}

      {/*
        Los botones se quedan abajo mientras se baja por el paso. Con veintiséis
        campos repartidos, ponerlos al final de cada uno obliga a bajar hasta el
        fondo y buscar. Es lo mismo que ya hacía el formulario de una pieza.
      */}
      <div className="border-hairline bg-surface sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-end gap-2 border-t px-1 py-3">
        {falta ? <p className="text-ink/45 mr-auto text-xs">{falta}</p> : null}

        {actual === 0 ? (
          <Link to={cancelarA}>
            <Button variant="ghost">Cancelar</Button>
          </Link>
        ) : (
          <Button variant="ghost" icon={<ArrowLeft />} onClick={() => setActual(actual - 1)}>
            Atrás
          </Button>
        )}

        {ultimo ? (
          <Button disabled={!!falta || guardando} onClick={onTerminar}>
            {guardando ? 'Guardando…' : etiquetaFinal}
          </Button>
        ) : (
          <Button disabled={!!falta} icon={<ArrowRight />} onClick={() => ir(actual + 1)}>
            Seguir
          </Button>
        )}
      </div>
    </>
  )
}

/** Los números de arriba: dónde se está y cuánto queda. */
function Rail({
  pasos,
  actual,
  masLejos,
  onIr,
}: {
  pasos: PasoDelFormulario[]
  actual: number
  masLejos: number
  onIr: (i: number) => void
}) {
  return (
    <ol className="mb-4 flex items-center gap-1">
      {pasos.map((p, i) => {
        const hecho = i < actual
        const aqui = i === actual
        // Se puede ir a lo ya visto y a nada más: hacia adelante, el botón de
        // seguir es el único camino, y es el que comprueba lo que falta.
        const alcanzable = i <= masLejos

        return (
          <li key={p.id} className="flex flex-1 items-center gap-1 last:flex-none">
            <button
              type="button"
              disabled={!alcanzable}
              onClick={() => onIr(i)}
              aria-current={aqui ? 'step' : undefined}
              aria-label={`Paso ${i + 1} de ${pasos.length}: ${p.titulo}`}
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors',
                'focus-visible:ring-2 focus-visible:-outline-offset-2 focus-visible:outline-none',
                aqui && 'bg-tierra-600 text-white',
                hecho &&
                  'bg-tierra-600/12 text-tierra-700 dark:text-tierra-300 hover:bg-tierra-600/20',
                !aqui && !hecho && 'bg-ink/6 text-ink/45',
                alcanzable && !aqui ? 'cursor-pointer' : '',
              )}
            >
              {hecho ? <Check className="size-4" /> : i + 1}
            </button>

            {/* El hilo entre dos números. El último no lleva. */}
            {i < pasos.length - 1 ? (
              <span
                aria-hidden
                className={cn(
                  'h-px flex-1 rounded-full',
                  i < actual ? 'bg-tierra-600/40' : 'bg-hairline',
                )}
              />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
