import { cn } from '@/lib/cn'

/*
  UN MANDO DE DOS O TRES OPCIONES, TODAS A LA VISTA.

  Nació de la pantalla de Maquinaria, donde el mismo grupo de botones pegados
  aparecía tres veces —dueño, clase y vista— escrito tres veces con las mismas
  clases. Sacarlo aquí no es ahorro de código: es que las tres se comporten
  igual, porque quien aprendió a usar uno no tiene que mirar los otros.

  ES PARA POCAS OPCIONES. Con más de cuatro deja de caber y lo correcto es un
  desplegable: un segmento de siete opciones es una fila de botones diminutos que
  se lee peor que una lista.

  LA ELEGIDA SE RELLENA, no se subraya ni se marca con un borde. A un metro de la
  pantalla un borde de acento no se distingue del borde normal, y estos mandos se
  miran de lejos: son lo primero de la pantalla.
*/
export function Segmento({
  opciones,
  valor,
  onCambio,
  className,
}: {
  opciones: { valor: string; etiqueta: string; pista?: string }[]
  valor: string
  onCambio: (v: string) => void
  className?: string
}) {
  return (
    <div
      role="group"
      className={cn('border-hairline flex overflow-hidden rounded-lg border', className)}
    >
      {opciones.map((o) => {
        const activa = valor === o.valor
        return (
          <button
            key={o.valor || '__todas'}
            type="button"
            onClick={() => onCambio(o.valor)}
            aria-pressed={activa}
            title={o.pista}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-colors',
              'focus-visible:ring-2 focus-visible:-outline-offset-2 focus-visible:outline-none',
              activa
                ? 'bg-royal-600/12 text-royal-700 dark:text-royal-300'
                : 'text-ink/55 hover:bg-ink/3',
            )}
          >
            {o.etiqueta}
          </button>
        )
      })}
    </div>
  )
}
