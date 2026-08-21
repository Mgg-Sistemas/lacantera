import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { esRutaFueraDelMvp, moduloDeRuta } from '@/config/navigation'
import { useMisPermisos } from '@/lib/api/usuarios'

/*
  LA MITAD DE ABAJO DE UN TABLERO

  Christopher lo pidió así: que un tablero sea un reporte y, debajo, un «¿qué
  deseas hacer?» que lleve por tarjetas a una acción concreta, y que esas
  tarjetas tengan sentido relacional o de pasos.

  La diferencia con lo que había no es cosmética. Antes las tarjetas se
  agrupaban por naturaleza —lo que entra, lo que sale, lo que se mueve—, que es
  como lo entiende quien construyó el sistema. Quien abre el tablero no viene
  con una naturaleza en la cabeza: viene con una tarea. «Tengo que cargar los
  productos», «llegó material», «hay que pagar la quincena».

  POR QUÉ LOS PASOS VAN NUMERADOS

  Donde el trabajo tiene un orden, el número lo dice y ahorra tener que
  recordarlo. Una nómina se hace anotando novedades, calculando y sacando los
  recibos, en ese orden y no en otro; una compra empieza por el pedido y acaba
  en la recepción. Numerarlas es la diferencia entre una lista de enlaces y una
  instrucción.

  Donde no hay orden, no se numera. Poner «1, 2, 3» a tres cosas
  independientes enseña una secuencia falsa, y alguien la seguirá.
*/

export interface Accion {
  /** El número del paso, cuando la tarea tiene orden. */
  paso?: number
  titulo: string
  detalle: string
  icono: LucideIcon
  a: string
  /** Nivel mínimo en el módulo de la ruta. Por omisión basta con leerlo. */
  exige?: 'LECTURA' | 'ESCRITURA'
  /** Se pinta apagada y sin enlace: el paso todavía no toca. */
  bloqueada?: string
}

export interface GrupoDeAcciones {
  titulo: string
  /** Una frase que explique de qué va el grupo, si no se explica solo. */
  detalle?: string
  acciones: Accion[]
}

export function QueHacer({
  grupos,
  titulo = '¿Qué quieres hacer?',
}: {
  grupos: GrupoDeAcciones[]
  titulo?: string
}) {
  const { puede } = useMisPermisos()

  /*
    Se esconde lo que no se puede abrir y lo que hoy no se ofrece.

    Enseñar una tarjeta que lleva al cartel de obra, o a un «tu rol no llega
    aquí», es mandar a alguien a que el sistema le diga que no. Un tablero que
    hace eso deja de leerse como una guía.
  */
  const visibles = grupos
    .map((g) => {
      const quedan = g.acciones.filter(
        (a) => !esRutaFueraDelMvp(a.a) && puede(moduloDeRuta(a.a), a.exige ?? 'LECTURA'),
      )

      /*
        Los pasos se vuelven a numerar sobre lo que queda.

        En la cadena de una compra, «pagar» lleva a Tesoreria, que hoy esta
        fuera del MVP: la tarjeta desaparece y la secuencia salia 1, 2, 4. Un
        hueco en una lista numerada se lee como que falta algo por hacer, y
        manda a buscar un paso que no existe — peor que no numerar nada.
      */
      let n = 0
      return {
        ...g,
        acciones: quedan.map((a) =>
          a.paso === undefined ? a : { ...a, paso: ++n },
        ),
      }
    })
    .filter((g) => g.acciones.length > 0)

  if (visibles.length === 0) return null

  return (
    <section className="mt-8">
      <h2 className="text-ink/90 text-lg font-semibold">{titulo}</h2>

      <div className="mt-4 space-y-6">
        {visibles.map((g) => (
          <div key={g.titulo}>
            <h3 className="text-ink/40 text-2xs font-mono tracking-[0.18em] uppercase">
              {g.titulo}
            </h3>
            {g.detalle ? <p className="text-ink/50 mt-1 text-sm">{g.detalle}</p> : null}

            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {g.acciones.map((a) => (
                <Tarjeta key={a.titulo} accion={a} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function Tarjeta({ accion: a }: { accion: Accion }) {
  const Icono = a.icono

  const cuerpo = (
    <Card
      className={cn(
        'border-hairline h-full border transition-colors',
        a.bloqueada ? 'opacity-55' : 'hover:border-royal-300 hover:bg-royal-600/[0.03]',
      )}
    >
      <div className="flex items-start gap-3">
        {/* El número donde hay orden; el icono donde no. Los dos ocupan el
            mismo hueco para que las tarjetas se alineen entre grupos. */}
        {a.paso !== undefined ? (
          <span className="bg-royal-600/12 text-royal-700 dark:text-royal-300 tabular mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
            {a.paso}
          </span>
        ) : (
          <Icono className="text-ink/30 mt-0.5 size-[18px] shrink-0" aria-hidden="true" />
        )}

        <div className="min-w-0 flex-1">
          <p className="text-ink/90 flex items-center gap-1.5 text-base font-medium">
            {a.titulo}
            {!a.bloqueada ? (
              <ArrowRight className="text-ink/25 size-4 shrink-0" aria-hidden="true" />
            ) : null}
          </p>
          <p className="text-ink/55 mt-1 text-sm leading-relaxed">{a.detalle}</p>
          {a.bloqueada ? (
            <p className="text-ink/40 mt-1.5 text-xs italic">{a.bloqueada}</p>
          ) : null}
        </div>
      </div>
    </Card>
  )

  // Bloqueada no es un enlace apagado: es que no hay a dónde ir todavía. Un
  // enlace que no lleva a ningún sitio se pulsa igual, y desconcierta.
  return a.bloqueada ? (
    <div>{cuerpo}</div>
  ) : (
    <Link to={a.a} className="block">
      {cuerpo}
    </Link>
  )
}
