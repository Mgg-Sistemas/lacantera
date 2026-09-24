import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'

/*
  LA TARJETA DE «AQUÍ SE HACE ESTO». UNA SOLA.

  Estaba escrita tres veces, y se vio contando los tableros el 24/09/2026 con
  la remodelación del punto 3:

    · `QueHacer` tenía la suya, con número de paso y estado bloqueado.
    · `GrupoAcciones` tenía la suya, con la cuenta de lo que espera.
    · `ventas/Tablero.tsx` tenía la suya a mano, sin ninguna de las dos cosas.

  Las tres dibujan lo mismo —icono, título, una línea de explicación, y lleva a
  una pantalla— y ninguna sabía de las otras. Las dos primeras hasta llevan su
  propio comentario explicando por qué conviene compartir la pieza en vez de
  copiarla, escritos sin saber que el otro existía. Es la mejor prueba de que
  hacía falta esto: la disciplina sola no alcanzó.

  El resultado que se buscaba es el del encargo: que quien aprende un módulo no
  tenga que reaprender el siguiente. Ocho tableros con tres tarjetas distintas
  se leen como tres productos.

  LO QUE LA TARJETA SABE DECIR, Y CUÁNDO

    · **Un número de paso**, donde el trabajo tiene orden. Una nómina se hace
      anotando novedades, calculando y sacando recibos, en ese orden.
    · **Una cuenta**, donde hay cola. Y solo se enciende si hay algo esperando:
      si todo llamara la atención, no la llamaría nada.
    · **Bloqueada**, cuando el paso todavía no toca. No es un enlace apagado:
      es que no hay a dónde ir, y un enlace que no lleva a ningún sitio se pulsa
      igual y desconcierta.

  El paso y el icono ocupan el mismo hueco para que las tarjetas se alineen
  entre grupos aunque unas lleven número y otras no.

  QUIÉN FILTRA LOS PERMISOS. Esta tarjeta no: la pintan quienes la usan, y son
  ellos los que deciden qué se ofrece. Meter el permiso aquí obligaría a que
  cada sitio pasara el suyo y a que la tarjeta supiera de módulos, que es
  saber demasiado para algo que solo dibuja.
*/

export interface AccionDeTablero {
  titulo: string
  /** Qué pasa al hacerlo, en una línea. No repite el título. */
  detalle: string
  icono: LucideIcon
  /** A dónde lleva. */
  a: string
  /** El número del paso, cuando la tarea tiene orden. */
  paso?: number
  /** Cuántos hay esperando aquí. Sin esto no se enseña ninguna cifra. */
  cuenta?: number
  /** Por qué todavía no se puede. Se pinta apagada y sin enlace. */
  bloqueada?: string
}

export function TarjetaDeAccion({ accion: a }: { accion: AccionDeTablero }) {
  const Icono = a.icono
  const espera = (a.cuenta ?? 0) > 0

  const cuerpo = (
    <Card
      className={cn(
        'h-full border transition-colors',
        espera ? 'border-warning/40' : 'border-hairline',
        a.bloqueada ? 'opacity-55' : 'hover:border-tierra-300 hover:bg-tierra-600/[0.03]',
      )}
    >
      <div className="flex items-start gap-3">
        {a.paso !== undefined ? (
          <span className="bg-tierra-600/12 text-tierra-700 tabular mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold dark:text-tierra-300">
            {a.paso}
          </span>
        ) : (
          <Icono
            className={cn('mt-0.5 size-[18px] shrink-0', espera ? 'text-warning' : 'text-ink/30')}
            aria-hidden="true"
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-ink/90 flex items-center gap-1.5 text-base font-medium">
              {a.titulo}
              {!a.bloqueada ? (
                <ArrowRight className="text-ink/25 size-4 shrink-0" aria-hidden="true" />
              ) : null}
            </p>
            {a.cuenta !== undefined ? (
              <span
                className={cn(
                  'tabular shrink-0 text-lg font-light',
                  espera ? 'text-warning' : 'text-ink/25',
                )}
              >
                {a.cuenta}
              </span>
            ) : null}
          </div>

          <p className="text-ink/55 mt-1 text-sm leading-relaxed">{a.detalle}</p>
          {a.bloqueada ? <p className="text-ink/40 mt-1.5 text-xs italic">{a.bloqueada}</p> : null}
        </div>
      </div>
    </Card>
  )

  return a.bloqueada ? (
    <div>{cuerpo}</div>
  ) : (
    <Link to={a.a} className="block">
      {cuerpo}
    </Link>
  )
}
