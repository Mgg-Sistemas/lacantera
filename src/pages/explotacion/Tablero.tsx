import { Link } from 'react-router'
import { Mountain, Pickaxe, Scale, Zap } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { GrupoAcciones, PrimeraVez, type Accion } from '@/components/tablero/GrupoAcciones'
import { useFrentes, useProduccion, useVoladuras } from '@/lib/api/explotacion'
import { useMisPermisos } from '@/lib/api/usuarios'
import { enteros } from '@/lib/formato'

/**
 * Por dónde se empieza en explotación.
 *
 * ESTE SÍ ES UNA CADENA, Y ES LA MISMA QUE CUENTA LA PORTADA
 *
 * Se abre el banco, se vuela, y del turno sale material. Ocurre en ese orden y
 * no en otro: no se vuela un frente que no existe, y no hay producción sin
 * haber arrancado roca.
 *
 * Es literalmente el recorrido que la portada le cuenta a la calle —la piedra
 * se vuela, se extrae, se tritura, se despacha—, así que el tablero lo numera
 * igual. Quien trabaja aquí y quien mira la web están viendo lo mismo.
 *
 * EL PARTE DE TURNO ES LA PUERTA
 *
 * Es la única forma de que entre material producido al patio, y por eso va
 * destacado: quien no lo carga deja el inventario sin lo que la planta sacó ese
 * día, y eso no se nota hasta que alguien va a despachar y no hay existencia.
 */
export function TableroExplotacion() {
  const { data: frentes, isPending, error } = useFrentes()
  const { data: voladuras } = useVoladuras()
  const { data: produccion } = useProduccion()
  const { puede } = useMisPermisos()

  const puedeEscribir = puede('EXPLOTACION', 'ESCRITURA')

  const hoy = new Date().toLocaleDateString('en-CA')
  const partesHoy = (produccion ?? []).filter((p) => p.fecha === hoy).length
  // Un frente puede estar activo, suspendido o agotado. Solo el primero
  // cuenta como «donde se esta cortando ahora».
  const frentesActivos = (frentes ?? []).filter((f) => f.estado === 'ACTIVO').length

  const pasos: Accion[] = [
    {
      titulo: 'I · Se abre el banco',
      detalle: 'Los frentes y sus bancos: dónde se está cortando y a qué cota.',
      icono: Mountain,
      ruta: '/app/explotacion/frentes',
      exigeEscritura: true,
    },
    {
      titulo: 'II · Se vuela',
      detalle: 'Barrenación y carga explosiva. Queda registrado qué frente y con qué.',
      icono: Zap,
      ruta: '/app/explotacion/voladuras',
      exigeEscritura: true,
    },
    {
      titulo: 'III · Sale el turno',
      detalle:
        'El parte de turno. Es la única puerta por la que entra al patio lo que produjo la planta.',
      icono: Scale,
      ruta: '/app/explotacion/produccion',
      cuenta: partesHoy,
      exigeEscritura: true,
    },
  ]

  return (
    <>
      <PageHeader
        title="Explotación"
        description="Del frente al patio: dónde se corta, qué se voló y qué sacó cada turno."
        actions={
          <Link to="/app/explotacion/produccion">
            <Button icon={<Pickaxe />}>Cargar parte de turno</Button>
          </Link>
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {!isPending && !error ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">
                Frentes activos
              </p>
              <p className="text-ink/90 tabular mt-3 text-3xl font-light">
                {enteros(frentesActivos)}
              </p>
              <p className="text-ink/45 mt-2 text-xs">Donde se está cortando ahora</p>
            </Card>

            <Card>
              <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">
                Voladuras registradas
              </p>
              <p className="text-ink/90 tabular mt-3 text-3xl font-light">
                {enteros((voladuras ?? []).length)}
              </p>
              <p className="text-ink/45 mt-2 text-xs">Histórico completo</p>
            </Card>

            <Card>
              <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">
                Partes de hoy
              </p>
              <p className="text-ink/90 tabular mt-3 text-3xl font-light">{enteros(partesHoy)}</p>
              <p className="text-ink/45 mt-2 text-xs">
                {partesHoy === 0 ? 'Sin cargar todavía' : 'Turnos cargados'}
              </p>
            </Card>
          </div>

          <div className="mt-8 space-y-8">
            <GrupoAcciones
              titulo="El recorrido de la piedra"
              acciones={pasos}
              puedeEscribir={puedeEscribir}
              columnas={3}
            />

            <PrimeraVez>
              <p>
                Las tres pantallas van en orden: primero existe el frente, después se vuela, y del
                turno sale el material. <strong>El parte de turno es el que mueve el inventario</strong> —
                sin él, la planta produce y el patio no se entera.
              </p>
              <p className="text-ink/50">
                De un mismo turno salen varios materiales a la vez, así que el parte lleva renglones:
                piedra 1, piedra 2, granzón y polvillo se cuentan por separado en el mismo papel.
              </p>
            </PrimeraVez>
          </div>
        </>
      ) : null}
    </>
  )
}
