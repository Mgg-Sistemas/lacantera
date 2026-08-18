import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'

type Tone = 'royal' | 'success' | 'warning' | 'danger' | 'info' | 'safety'

/**
 * La línea de cota.
 *
 * El color del indicador va en un filete sobre el borde superior, no en un
 * azulejo detrás del icono. Es el mismo gesto que cierra la portada y el
 * acceso: una línea fina que marca el nivel del banco.
 *
 * PERO SOLO SE ENCIENDE CUANDO HAY ALGO QUE DECIR
 *
 * Con un color por tarjeta, cuatro indicadores en fila daban un arcoíris:
 * azul, naranja, verde y celeste seguidos. Eso no informa de nada —el color
 * decía "esta es la del inventario", que ya lo dice el rótulo— y de paso
 * gasta el rojo y el naranja, que son justo los que tienen que destacar
 * cuando algo va mal.
 *
 * Ahora la regla es una sola: la pantalla está en calma salvo que algo
 * reclame atención. Aviso y peligro se ven; el resto lleva un filete neutro.
 * Cuando aparece un naranja en la fila, se ve desde la puerta.
 */
const cotas: Record<Tone, string> = {
  royal: 'bg-ink/12',
  success: 'bg-ink/12',
  info: 'bg-ink/12',
  safety: 'bg-ink/12',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

/** El icono sigue la misma regla que el filete: apagado salvo que avise. */
const iconos: Record<Tone, string> = {
  royal: 'text-ink/25',
  success: 'text-ink/25',
  info: 'text-ink/25',
  safety: 'text-ink/25',
  warning: 'text-warning',
  danger: 'text-danger',
}

interface StatCardProps {
  label: string
  value: string
  icon: ReactNode
  tone?: Tone
  /** Variación respecto al periodo anterior, en puntos porcentuales. */
  delta?: number
  /** Contra qué se compara. Sin esto, un porcentaje no dice nada. */
  deltaLabel?: string
  /** Cuando subir es malo — mermas, cuentas por pagar — invierte el color. */
  invertDelta?: boolean
}

/**
 * Una cifra de la operación.
 *
 * QUÉ CAMBIÓ Y POR QUÉ
 *
 * Tenía un azulejo de color con el icono dentro, grande y a la derecha. Es el
 * elemento más reconocible de cualquier plantilla de tablero, y hacía que la
 * pantalla se leyera como un producto genérico con los datos de esta cantera
 * encima. Además competía con la cifra: el ojo iba primero al cuadro de color
 * y después al número, que es al revés de lo que hace falta.
 *
 * Ahora el color va en un filete sobre el borde —la línea de cota de la
 * portada— y el icono se queda pequeño y del mismo color, junto al rótulo. El
 * cuadro deja de gritar y el sitio más llamativo de la tarjeta pasa a ser la
 * cifra, que es de lo que va la tarjeta.
 *
 * El rótulo va en versalitas espaciadas y en mono, como los de las páginas de
 * entrada y como los encabezados de los papeles que salen de aquí. Y la cifra
 * baja de peso: a este tamaño la seminegrita se lee como un anuncio, y esto no
 * anuncia nada — informa.
 */
export function StatCard({
  label,
  value,
  icon,
  tone = 'royal',
  delta,
  deltaLabel,
  invertDelta = false,
}: StatCardProps) {
  const subio = (delta ?? 0) >= 0
  const esBueno = invertDelta ? !subio : subio

  return (
    <Card className="relative overflow-hidden">
      {/* El filete de cota. `absolute` para que no empuje el contenido y la
          tarjeta conserve su altura junto a las demás de la fila. */}
      <span
        className={cn('absolute inset-x-0 top-0 h-[3px]', cotas[tone])}
        aria-hidden="true"
      />

      <div className="flex items-start justify-between gap-3">
        <p className="text-ink/45 text-2xs min-w-0 font-mono tracking-[0.16em] uppercase">
          {label}
        </p>
        <span className={cn('shrink-0 [&>svg]:size-[18px]', iconos[tone])} aria-hidden="true">
          {icon}
        </span>
      </div>

      <p className="text-ink/90 tabular mt-3 text-3xl font-light tracking-tight">{value}</p>

      {delta !== undefined ? (
        <p className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-semibold',
              esBueno ? 'text-success' : 'text-danger',
            )}
          >
            {subio ? (
              <ArrowUpRight className="size-3.5" />
            ) : (
              <ArrowDownRight className="size-3.5" />
            )}
            {Math.abs(delta).toLocaleString('es-VE', { maximumFractionDigits: 1 })}%
          </span>
          {deltaLabel ? <span className="text-ink/45">{deltaLabel}</span> : null}
        </p>
      ) : deltaLabel ? (
        // Sin comparación previa, la línea de abajo sigue haciendo falta: es
        // donde va el dato que da sentido a la cifra —cuántas órdenes son,
        // cuánto hay en la otra moneda—. Antes solo aparecía junto a un
        // porcentaje, y los indicadores reales casi nunca tienen uno.
        <p className="text-ink/45 mt-2.5 text-xs">{deltaLabel}</p>
      ) : null}
    </Card>
  )
}
