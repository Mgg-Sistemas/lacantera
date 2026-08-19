import { useState } from 'react'
import { ClipboardList, Gauge, Plus, ToggleLeft, Wrench } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { AvisoBloqueantes, SemaforoMantenimiento } from '@/components/SemaforoMantenimiento'
import { ModalHorometro } from './ModalHorometro'
import { ModalTaller } from './ModalTaller'
import { ModalEstado } from './ModalEstado'
import { ModalMaquina } from './ModalMaquina'
import { ETIQUETA_ESTADO, useMaquinaria, type Maquina } from '@/lib/api/maquinaria'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useNavigate } from 'react-router'
import { Chip } from '@/components/ui/Chip'
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
 * EL TALLER ES UN SITIO, NO UNA ANOTACIÓN
 *
 * El botón dice «meter al taller» o «sacar del taller» según dónde esté la
 * máquina, porque eso es lo que ocurre de verdad: entra, está dentro unos días
 * sin trabajar, y sale. Antes se anotaba el mantenimiento de un golpe cuando
 * ya estaba hecho, y en el medio no había forma de saber qué máquinas estaban
 * paradas.
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
  const [taller, setTaller] = useState<Maquina | null>(null)
  const [estado, setEstado] = useState<Maquina | null>(null)
  const navegar = useNavigate()

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
          <>
            <Button
              variant="outline"
              icon={<ClipboardList />}
              onClick={() => navegar('/app/maquinaria/mantenimientos')}
            >
              Historial de taller
            </Button>
            {puedeEscribir ? (
              <Button icon={<Plus />} onClick={() => setEditando(null)}>
                Nueva máquina
              </Button>
            ) : null}
          </>
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
                const enTaller = m.mantenimiento_abierto_id !== null

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

                        {/* Dónde está la máquina ahora. Va debajo del nombre y
                            no junto al semáforo porque son dos cosas
                            distintas: una dice si le toca mantenimiento y la
                            otra si está trabajando. */}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Chip
                            tone={
                              m.estado === 'ACTIVA'
                                ? 'success'
                                : m.estado === 'EN_MANTENIMIENTO'
                                  ? 'warning'
                                  : m.estado === 'FUERA_DE_SERVICIO' ||
                                      m.estado === 'DESINCORPORADA'
                                    ? 'danger'
                                    : 'neutral'
                            }
                          >
                            {ETIQUETA_ESTADO[m.estado]}
                          </Chip>
                          {m.dias_en_taller !== null ? (
                            <span
                              className={cn(
                                'text-2xs',
                                m.se_paso_en_el_taller ? 'text-warning font-medium' : 'text-ink/45',
                              )}
                            >
                              {m.dias_en_taller === 0
                                ? 'entró hoy'
                                : `${m.dias_en_taller} día${m.dias_en_taller === 1 ? '' : 's'} dentro`}
                              {m.se_paso_en_el_taller ? ' · más de lo previsto' : ''}
                            </span>
                          ) : null}
                        </div>
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

                      {/* La reparación va aparte del mantenimiento porque
                          responde otra pregunta: no si va al día, sino cada
                          cuánto se está rompiendo. */}
                      {m.reparaciones > 0 ? (
                        <p className="text-ink/45 mt-1 text-xs">
                          {m.reparaciones} reparación{m.reparaciones === 1 ? '' : 'es'}
                          {m.ultima_reparacion
                            ? ` · la última el ${fecha(m.ultima_reparacion)}`
                            : ''}
                        </p>
                      ) : null}
                    </div>

                    <div className="grow" />

                    {puedeEscribir ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="soft"
                          icon={<Gauge />}
                          disabled={enTaller}
                          onClick={() => setHorometro(m)}
                        >
                          Horómetro
                        </Button>
                        <Button
                          size="sm"
                          variant={bloquea || enTaller ? 'primary' : 'outline'}
                          icon={<Wrench />}
                          onClick={() => setTaller(m)}
                        >
                          {enTaller ? 'Sacar del taller' : 'Meter al taller'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<ToggleLeft />}
                          onClick={() => setEstado(m)}
                        >
                          Estado
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
      <ModalTaller
        abierto={taller !== null}
        maquina={taller}
        onCerrar={() => setTaller(null)}
      />
      <ModalEstado
        abierto={estado !== null}
        maquina={estado}
        onCerrar={() => setEstado(null)}
      />
    </>
  )
}
