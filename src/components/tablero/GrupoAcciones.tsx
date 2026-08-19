import { Link } from 'react-router'
import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'

/**
 * Un grupo de cosas que se pueden hacer.
 *
 * POR QUÉ ESTO ES UN COMPONENTE Y NO SE COPIA EN CADA TABLERO
 *
 * Los tableros de módulo tienen formas distintas a propósito —compras es una
 * cadena numerada, inventario es un estado con movimientos, tesorería son
 * colas— pero por dentro todos hacen lo mismo: enseñar qué se puede hacer aquí
 * y llevar a la pantalla que lo hace.
 *
 * Escrito seis veces, la sexta se parecería a la primera solo de casualidad, y
 * el objetivo del encargo era justo el contrario: que quien aprende un módulo
 * no tenga que reaprender el siguiente. La consistencia entre módulos no se
 * consigue con disciplina, se consigue compartiendo la pieza.
 *
 * LO QUE NO SE PUEDE HACER, NO SE OFRECE
 *
 * Cada acción puede exigir escritura. Enseñar un botón que va a rebotar contra
 * un permiso manda a alguien a intentarlo para que el sistema le diga que no;
 * si el grupo entero queda vacío, desaparece con su título en vez de dejar un
 * encabezado suelto.
 */

export interface Accion {
  titulo: string
  /** Qué pasa al hacerlo, en una línea. No repite el título. */
  detalle: string
  icono: LucideIcon
  ruta: string
  /** Cuántos hay esperando aquí. Sin esto no se muestra ninguna cifra. */
  cuenta?: number
  exigeEscritura?: boolean
}

export function GrupoAcciones({
  titulo,
  acciones,
  puedeEscribir,
  columnas = 2,
  className,
}: {
  titulo?: string
  acciones: Accion[]
  puedeEscribir: boolean
  columnas?: 2 | 3
  className?: string
}) {
  const visibles = acciones.filter((a) => !a.exigeEscritura || puedeEscribir)
  if (visibles.length === 0) return null

  return (
    <div className={className}>
      {titulo ? (
        <h2 className="text-ink/40 text-2xs font-mono tracking-[0.18em] uppercase">{titulo}</h2>
      ) : null}

      <div
        className={cn(
          'mt-3 grid gap-3',
          columnas === 3 ? 'sm:grid-cols-2 xl:grid-cols-3' : 'sm:grid-cols-2',
        )}
      >
        {visibles.map((a) => {
          const Icono = a.icono
          const espera = (a.cuenta ?? 0) > 0

          return (
            <Link key={a.titulo} to={a.ruta} className="block">
              <Card
                className={cn(
                  'hover:border-royal-300 h-full border transition-colors',
                  // Solo se enciende lo que tiene algo esperando. Si todo
                  // llamara la atención, no la llamaría nada.
                  espera ? 'border-warning/40' : 'border-hairline',
                )}
              >
                <div className="flex items-start gap-3">
                  <Icono
                    className={cn(
                      'mt-0.5 size-[18px] shrink-0',
                      espera ? 'text-warning' : 'text-ink/30',
                    )}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-ink/90 text-base font-medium">{a.titulo}</p>
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
                  </div>
                </div>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

/**
 * La explicación para quien entra por primera vez.
 *
 * Va al final de cada tablero y no arriba: quien ya sabe no tiene que
 * saltársela cada mañana, y quien no sabe la encuentra al terminar de mirar.
 */
export function PrimeraVez({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <p className="text-ink/40 text-2xs font-mono tracking-[0.18em] uppercase">
        Si es la primera vez
      </p>
      <div className="text-ink/75 mt-3 space-y-2 text-sm leading-relaxed">{children}</div>
    </Card>
  )
}
