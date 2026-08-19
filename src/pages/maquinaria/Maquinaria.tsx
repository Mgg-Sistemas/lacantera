import { useState } from 'react'
import { Gauge, Plus, Wrench } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { AvisoBloqueantes, SemaforoMantenimiento } from '@/components/SemaforoMantenimiento'
import { ModalHorometro } from './ModalHorometro'
import { ModalMantenimiento } from './ModalMantenimiento'
import { ModalMaquina } from './ModalMaquina'
import { useMaquinaria, type Maquina } from '@/lib/api/maquinaria'
import { useMisPermisos } from '@/lib/api/usuarios'
import { enteros, fecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

/**
 * Las máquinas y cómo van de mantenimiento.
 *
 * ES A LA VEZ EL TABLERO Y EL LISTADO, Y ESO ES DELIBERADO
 *
 * En los otros módulos el tablero es una pantalla aparte porque hay muchas
 * pantallas debajo. Aquí hay una sola cosa que mirar —las máquinas— y una sola
 * pregunta que se hace todo el mundo al entrar: cuál toca atender. Partirlo en
 * dos obligaría a un clic para llegar a lo único que hay.
 *
 * LO QUE ESTÁ PEOR VA PRIMERO
 *
 * No se ordena por código ni por nombre: por gravedad. Con veinte máquinas en
 * pantalla, la que pasó su tope no puede estar la decimoséptima porque su
 * código empiece por T.
 */
export function Maquinaria() {
  const { data, isPending, error } = useMaquinaria(true)
  const { puede } = useMisPermisos()

  const [editando, setEditando] = useState<Maquina | null | undefined>(undefined)
  const [horometro, setHorometro] = useState<Maquina | null>(null)
  const [mantenimiento, setMantenimiento] = useState<Maquina | null>(null)

  const puedeEscribir = puede('MAQUINARIA', 'ESCRITURA')

  const orden = { BLOQUEANTE: 0, ALARMA: 1, AVISO: 2, OK: 3 } as const
  const maquinas = [...(data ?? [])].sort(
    (a, b) =>
      orden[a.semaforo] - orden[b.semaforo] ||
      Number(b.horas_desde_mant) - Number(a.horas_desde_mant),
  )

  const bloqueantes = maquinas.filter((m) => m.semaforo === 'BLOQUEANTE').length

  return (
    <>
      <PageHeader
        title="Maquinaria"
        description="Cada equipo, lo que lleva trabajado y cuánto le falta para su mantenimiento."
        actions={
          puedeEscribir ? (
            <Button icon={<Plus />} onClick={() => setEditando(null)}>
              Nueva máquina
            </Button>
          ) : undefined
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {!isPending && !error ? (
        <>
          {/* Lo primero de la pantalla cuando hay algo pasado de tope. No
              comparte fila con nada: es lo único aquí que puede costar un
              motor. */}
          <AvisoBloqueantes cuantas={bloqueantes} />

          {maquinas.length === 0 ? (
            <Card>
              <Vacio
                titulo="No hay máquinas cargadas"
                descripcion="Sin ellas no se puede llevar el horómetro ni programar mantenimientos. Se cargan una vez, con su código y su tope de horas."
                accion={
                  puedeEscribir ? (
                    <Button icon={<Plus />} onClick={() => setEditando(null)}>
                      Cargar la primera
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {maquinas.map((m) => {
                const horas = Number(m.horas_desde_mant)
                const tope = Number(m.tope_horas)
                const bloquea = m.semaforo === 'BLOQUEANTE'

                // Cuánto del intervalo lleva consumido. Se corta en 100 para
                // que la barra no se salga cuando ya se pasó del tope.
                const avance = Math.min((horas / tope) * 100, 100)

                return (
                  <Card
                    key={m.id}
                    className={cn(
                      'flex h-full flex-col border',
                      bloquea ? 'border-danger' : 'border-hairline',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-ink/45 text-2xs font-mono tracking-[0.14em]">
                          {m.codigo}
                        </p>
                        <h2 className="text-ink/90 mt-1 truncate text-lg font-medium">
                          {m.nombre}
                        </h2>
                        <p className="text-ink/50 mt-0.5 truncate text-xs">
                          {[m.marca, m.modelo].filter(Boolean).join(' ') || 'Sin marca ni modelo'}
                          {m.almacen ? ` · ${m.almacen}` : ''}
                        </p>
                      </div>
                      <SemaforoMantenimiento estado={m.semaforo} />
                    </div>

                    {/* La barra dice de un vistazo cuánto queda, que es más
                        rápido de leer que restar dos números. */}
                    <div className="mt-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-ink/55 text-xs">Desde el último mantenimiento</span>
                        <span
                          className={cn(
                            'tabular text-sm font-semibold',
                            bloquea ? 'text-danger' : 'text-ink/85',
                          )}
                        >
                          {enteros(horas)} / {enteros(tope)} h
                        </span>
                      </div>
                      <div className="bg-ink/8 mt-2 h-1.5 overflow-hidden rounded-full">
                        <div
                          className={cn(
                            'h-1.5 rounded-full transition-[width] duration-500',
                            m.semaforo === 'BLOQUEANTE'
                              ? 'bg-danger'
                              : m.semaforo === 'ALARMA'
                                ? 'bg-safety'
                                : m.semaforo === 'AVISO'
                                  ? 'bg-warning'
                                  : 'bg-royal-600',
                          )}
                          style={{ width: `${avance}%` }}
                        />
                      </div>
                      <p className="text-ink/45 mt-2 text-xs">
                        {m.ultima_lectura
                          ? `Última lectura: ${fecha(m.ultima_lectura)}`
                          : 'Sin lecturas de horómetro'}
                        {m.ultimo_mantenimiento
                          ? ` · Mantenimiento: ${fecha(m.ultimo_mantenimiento)}`
                          : ' · Sin mantenimientos'}
                      </p>
                    </div>

                    <div className="grow" />

                    {puedeEscribir ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="soft"
                          icon={<Gauge />}
                          onClick={() => setHorometro(m)}
                        >
                          Horómetro
                        </Button>
                        <Button
                          size="sm"
                          variant={bloquea ? 'primary' : 'outline'}
                          icon={<Wrench />}
                          onClick={() => setMantenimiento(m)}
                        >
                          Mantenimiento
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditando(m)}>
                          Editar
                        </Button>
                      </div>
                    ) : null}
                  </Card>
                )
              })}
            </div>
          )}
        </>
      ) : null}

      <ModalMaquina
        abierto={editando !== undefined}
        maquina={editando ?? null}
        onCerrar={() => setEditando(undefined)}
      />
      <ModalHorometro
        abierto={horometro !== null}
        maquina={horometro}
        onCerrar={() => setHorometro(null)}
      />
      <ModalMantenimiento
        abierto={mantenimiento !== null}
        maquina={mantenimiento}
        onCerrar={() => setMantenimiento(null)}
      />
    </>
  )
}
