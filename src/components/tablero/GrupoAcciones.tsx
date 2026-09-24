import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { TarjetaDeAccion } from '@/components/tablero/TarjetaDeAccion'
import { esRutaFueraDelMvp } from '@/config/navigation'
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
 * Y LA PRUEBA DE QUE ESO ERA CIERTO LLEGÓ EL 24/09/2026. Esto compartía el
 * grupo pero no la tarjeta, y `QueHacer` dibujaba la suya —casi idéntica, con
 * su propio comentario diciendo lo mismo que este— sin que ninguno de los dos
 * supiera del otro. Ventas tenía una tercera a mano. La tarjeta se sacó a
 * `TarjetaDeAccion` y ahora las tres son la misma.
 *
 * Lo que queda aquí es lo que de verdad distingue a este componente de
 * `QueHacer`: esto es el CUERPO del tablero y se ve siempre, mientras que
 * aquello es la mitad de abajo y se esconde con el «(?)» de ayuda. Se
 * descartó juntarlos en uno con un interruptor: son dos papeles distintos, no
 * dos configuraciones del mismo.
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
  /*
    Lo que hoy no se ofrece no se ofrece tampoco desde un tablero.

    Un tablero es la otra puerta al menú: una tarjeta que lleva a una pantalla
    escondida del riel no está escondida, solo cuesta más de encontrar — y quien
    la pulsa se topa con el cartel de obra sin entender por qué se lo ofrecían.

    Hizo falta al entrar Tesorería, que ofrece «cuentas por cobrar» y ventas
    sigue fuera del MVP.
  */
  const visibles = acciones.filter(
    (a) => (!a.exigeEscritura || puedeEscribir) && !esRutaFueraDelMvp(a.ruta),
  )
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
        {visibles.map((a) => (
          <TarjetaDeAccion
            key={a.titulo}
            accion={{
              titulo: a.titulo,
              detalle: a.detalle,
              icono: a.icono,
              a: a.ruta,
              cuenta: a.cuenta,
            }}
          />
        ))}
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
