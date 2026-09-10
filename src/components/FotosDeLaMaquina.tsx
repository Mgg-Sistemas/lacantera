import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SoltarArchivo } from '@/components/SoltarArchivo'

/*
  LAS FOTOS CON LAS QUE SE REGISTRA UNA MÁQUINA.

  Christopher: «al registrar una máquina, debe incluir como mínimo y obligatorio
  2 fotos o imágenes de ese vehículo».

  DOS Y NO UNA, y la razón no es burocrática: una sola foto no enseña una
  máquina, siempre hay un lado que no se ve. Y el día que se devuelva a su dueño
  o se discuta un golpe, lo que vale es lo que se fotografió al recibirla.

  NACE CON DOS HUECOS ABIERTOS en vez de con un botón «añadir foto». El mínimo
  tiene que verse antes de empezar, no descubrirse al intentar guardar: dos
  recuadros vacíos dicen «hacen falta dos» sin una sola palabra de aviso.

  No es la foto de perfil de la ficha —ésa es la cara recortada que se ve en las
  tarjetas— sino el registro de cómo está. Son dos cosas distintas sobre el mismo
  objeto, como el retrato del carnet y el álbum.
*/

/** Lo mínimo que la base acepta. Está escrito aquí para poder explicarlo. */
export const FOTOS_MINIMAS = 2

const TOPE = 8 * 1024 * 1024

export function FotosDeLaMaquina({
  fotos,
  onCambiar,
  deshabilitado,
}: {
  fotos: (File | null)[]
  onCambiar: (fotos: (File | null)[]) => void
  deshabilitado?: boolean
}) {
  const puestas = fotos.filter(Boolean).length
  const faltan = Math.max(0, FOTOS_MINIMAS - puestas)

  const cambiar = (i: number, archivo: File | null) =>
    onCambiar(fotos.map((f, k) => (k === i ? archivo : f)))

  return (
    <div className="sm:col-span-2">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-ink/75 text-sm font-medium">Fotos de la máquina</span>
        <span className={faltan > 0 ? 'text-warning text-xs' : 'text-success text-xs'}>
          {faltan > 0
            ? `Falta${faltan === 1 ? '' : 'n'} ${faltan} para poder registrarla`
            : `${puestas} foto${puestas === 1 ? '' : 's'}`}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {fotos.map((f, i) => (
          <div key={i} className="relative">
            <SoltarArchivo
              valor={f}
              onCambio={(a) => cambiar(i, a)}
              acepta="image/*"
              tope={TOPE}
              deshabilitado={deshabilitado}
              pista={
                i < FOTOS_MINIMAS
                  ? 'Obligatoria. Arrastra una imagen o toca para elegirla.'
                  : 'Otra vista, si hace falta.'
              }
            />
            {/* Los dos primeros huecos no se quitan: son el mínimo, y dejar
                quitarlos convertiría la regla en una sugerencia. */}
            {i >= FOTOS_MINIMAS ? (
              <Button
                size="sm"
                variant="ghost"
                className="absolute top-0 right-0"
                icon={<Trash2 />}
                disabled={deshabilitado}
                onClick={() => onCambiar(fotos.filter((_, k) => k !== i))}
              >
                <span className="sr-only">Quitar esta foto</span>
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      <Button
        className="mt-2"
        size="sm"
        variant="ghost"
        icon={<Plus />}
        disabled={deshabilitado}
        onClick={() => onCambiar([...fotos, null])}
      >
        Añadir otra vista
      </Button>

      <p className="text-ink/45 mt-2 text-xs leading-relaxed">
        Una sola foto no enseña una máquina: siempre hay un lado que no se ve. El día que se
        devuelva a su dueño o se discuta un golpe, lo que vale es lo que se fotografió al
        recibirla.
      </p>
    </div>
  )
}
