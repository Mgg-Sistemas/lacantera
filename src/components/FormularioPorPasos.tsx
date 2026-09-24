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
  entrega y facturas de proveedor se quedaron de una pieza a propósito.

  El criterio no es la longitud: es cada cuánto se llena y quién lo llena.

  LOS PASOS NO SE INVENTAN, SE LEEN. Las pantallas donde entra esto ya estaban
  agrupadas —quién es, su contrato, cómo se le paga— porque quien las escribió
  ya sabía por dónde se parten. No hubo que redistribuir un solo campo.

  SE PUEDE VOLVER, Y SALTAR A LO YA VISTO. Ir hacia atrás no pide permiso: un
  paso a paso que encierra es peor que una página larga. Hacia adelante solo se
  llega a lo ya visitado, porque saltarse un paso obligatorio para descubrir al
  final que faltaba es la forma más segura de que alguien pierda lo escrito.

  LO QUE FALTA SE DICE EN EL PASO, NO AL GUARDAR. El botón de seguir dice qué
  falta cuando no se puede seguir. Un error que solo aparece al final obliga a
  recorrer los pasos buscando cuál era.

  LA ANIMACIÓN ES LA DE LA PORTADA. Se pidió expresamente, y es lo que evita
  que esto parezca traído de otro sistema: mismo fotograma y misma curva que
  `anim-surgir`, con la duración bajada a 0,35 s —ver `anim-paso` en
  `index.css`—. Se descartó inventar una transición nueva: al lado de las tres
  que ya tiene la casa se habría notado como pegada.

  ─────────────────────────────────────────────────────────────────────────

  VIENE EN DOS FORMAS PORQUE HAY DOS SITIOS DONDE SE LLENA UN FORMULARIO.

  La ficha del trabajador es una PÁGINA: se cancela volviendo a otra ruta y los
  botones se pegan abajo mientras se baja. El sitio de una planta y una cuenta
  de tesorería viven en un MODAL, que ya tiene su pie de acciones y su forma de
  cerrarse, y meterle otro pie dentro daría dos filas de botones.

  Así que lo común se reparte —`usePasos` lleva la cuenta, `RielDePasos` los
  números, `PanelDelPaso` el cuerpo— y `FormularioPorPasos` es solo la forma de
  página, armada con esas tres. El modal usa las piezas y pone sus botones
  donde ya los tenía, con `BotonesDelPaso`. Se descartó un interruptor
  `dentroDeModal` en el mismo componente: habría sido un componente que se
  comporta de dos maneras según un booleano, que es como se escriben los que
  nadie entiende medio año después.
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

/** La cuenta de por dónde va. Lo comparten la forma de página y la de modal. */
export function usePasos(pasos: PasoDelFormulario[]) {
  const [actual, setActual] = useState(0)
  // Hasta dónde se ha llegado. Sin esto, volver atrás a corregir una cédula
  // obligaría a pasar de nuevo por todos los pasos de vuelta.
  const [masLejos, setMasLejos] = useState(0)

  const ir = (i: number) => {
    setActual(i)
    setMasLejos((m) => Math.max(m, i))
  }

  const paso = pasos[actual]

  return {
    actual,
    masLejos,
    paso,
    esPrimero: actual === 0,
    esUltimo: actual === pasos.length - 1,
    falta: paso.falta ?? null,
    ir,
    atras: () => setActual((a) => Math.max(0, a - 1)),
    seguir: () => ir(actual + 1),
  }
}

/** Los números de arriba: dónde se está y cuánto queda. */
export function RielDePasos({
  pasos,
  actual,
  masLejos,
  onIr,
  className,
}: {
  pasos: PasoDelFormulario[]
  actual: number
  masLejos: number
  onIr: (i: number) => void
  className?: string
}) {
  return (
    <ol className={cn('mb-4 flex items-center gap-1', className)}>
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
                  'bg-tierra-600/12 text-tierra-700 hover:bg-tierra-600/20 dark:text-tierra-300',
                !aqui && !hecho && 'bg-ink/6 text-ink/45',
                alcanzable && !aqui && 'cursor-pointer',
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

/**
 * El cuerpo del paso: su título y sus campos.
 *
 * La clave del elemento es el paso y no su número: cambiarla es lo que hace
 * que React monte el panel de nuevo y la animación vuelva a correr. Con una
 * clave fija se animaría una sola vez, la primera.
 */
export function PanelDelPaso({ paso }: { paso: PasoDelFormulario }) {
  return (
    <div key={paso.id} className="anim-paso">
      <div className="mb-4">
        <h2 className="text-ink/90 text-base font-semibold">{paso.titulo}</h2>
        {paso.subtitulo ? <p className="text-ink/55 mt-1 text-sm">{paso.subtitulo}</p> : null}
      </div>
      {paso.contenido}
    </div>
  )
}

/** La forma de página: la usa la ficha del trabajador. */
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
  const p = usePasos(pasos)

  return (
    <>
      <RielDePasos pasos={pasos} actual={p.actual} masLejos={p.masLejos} onIr={p.ir} />

      <Card>
        <PanelDelPaso paso={p.paso} />
      </Card>

      {error ? <div className="mt-4">{error}</div> : null}

      {/*
        Los botones se quedan abajo mientras se baja por el paso. Con veintiocho
        campos repartidos, ponerlos al final de cada uno obliga a bajar hasta el
        fondo y buscar. Es lo mismo que ya hacía el formulario de una pieza.
      */}
      <div className="border-hairline bg-surface sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-end gap-2 border-t px-1 py-3">
        {p.falta ? <p className="text-ink/45 mr-auto text-xs">{p.falta}</p> : null}

        {p.esPrimero ? (
          <Link to={cancelarA}>
            <Button variant="ghost">Cancelar</Button>
          </Link>
        ) : (
          <Button variant="ghost" icon={<ArrowLeft />} onClick={p.atras}>
            Atrás
          </Button>
        )}

        {p.esUltimo ? (
          <Button disabled={!!p.falta || guardando} onClick={onTerminar}>
            {guardando ? 'Guardando…' : etiquetaFinal}
          </Button>
        ) : (
          <Button disabled={!!p.falta} icon={<ArrowRight />} onClick={p.seguir}>
            Seguir
          </Button>
        )}
      </div>
    </>
  )
}

/**
 * Los botones de un paso a paso que vive dentro de un modal.
 *
 * Van en el `acciones` del `Modal`, no debajo del contenido: el modal ya tiene
 * su pie, y meterle otro dentro daría dos filas de botones a cuatro
 * centímetros una de otra.
 */
export function BotonesDelPaso({
  pasos,
  cancelar,
  etiquetaFinal,
  guardando,
  onTerminar,
  puedeGuardar = true,
}: {
  pasos: ReturnType<typeof usePasos>
  cancelar: () => void
  etiquetaFinal: string
  guardando?: boolean
  onTerminar: () => void
  /** Para las pantallas donde guardar pide un permiso que mirar no pide. */
  puedeGuardar?: boolean
}) {
  return (
    <>
      {pasos.falta ? <p className="text-ink/45 mr-auto text-left text-xs">{pasos.falta}</p> : null}

      {pasos.esPrimero ? (
        <Button variant="ghost" onClick={cancelar}>
          Cancelar
        </Button>
      ) : (
        <Button variant="ghost" icon={<ArrowLeft />} onClick={pasos.atras}>
          Atrás
        </Button>
      )}

      {pasos.esUltimo ? (
        puedeGuardar ? (
          <Button disabled={!!pasos.falta || guardando} onClick={onTerminar}>
            {guardando ? 'Guardando…' : etiquetaFinal}
          </Button>
        ) : null
      ) : (
        <Button disabled={!!pasos.falta} icon={<ArrowRight />} onClick={pasos.seguir}>
          Seguir
        </Button>
      )}
    </>
  )
}
