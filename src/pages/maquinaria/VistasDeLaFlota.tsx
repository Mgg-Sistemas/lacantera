import { Fragment } from 'react'
import { Gauge, ToggleLeft, Wrench } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { SemaforoMantenimiento } from '@/components/SemaforoMantenimiento'
import { DeQuienEs } from '@/components/DeQuienEs'
import { ETIQUETA_ESTADO, ETIQUETA_CLASE, type Maquina } from '@/lib/api/maquinaria'
import { comparar } from '@/lib/maquina'
import { enteros, fecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

/*
  TRES MANERAS DE MIRAR LA MISMA FLOTA.

  Christopher: «las tarjetas de las máquinas deben tener por lo menos 3 tipos de
  vistas».

  No son tres tamaños de lo mismo. Cada una contesta una pregunta distinta, y por
  eso enseña unas cosas y calla otras:

    · FICHA ..... «¿cómo está ESTA máquina?» — cuánto lleva, cuánto le falta,
                  quién la lleva, qué botones tiene. Es la vista de trabajo, y es
                  la que había. Con cuarenta equipos obliga a mucho desplazar.

    · LISTA ..... «¿cómo está la flota entera?» — una línea por máquina, todas a
                  la vista de golpe, con lo justo para decidir a cuál entrar. Es
                  la que hacía falta y no existía.

    · PATIO ..... «¿qué tengo y dónde?» — losetas mínimas con el código y el
                  semáforo. Cabe la flota completa en una pantalla; sirve para
                  pasar revista y para proyectar en una reunión.

  Las tres comparten el mismo orden y los mismos filtros. Cambiar de vista no
  cambia lo que hay, solo cuánto se ve de cada cosa: eso es lo que permite
  cambiar sin perder el sitio.
*/

interface Acciones {
  puedeEscribir: boolean
  onHorometro: (m: Maquina) => void
  onTaller: (m: Maquina) => void
  onEstado: (m: Maquina) => void
  onAbrir: (m: Maquina) => void
}

/* El tono del chip de estado, que es el mismo en las tres vistas. */
const tonoDeEstado = (m: Maquina) =>
  m.estado === 'ACTIVA'
    ? 'success'
    : m.estado === 'EN_MANTENIMIENTO'
      ? 'warning'
      : m.estado === 'FUERA_DE_SERVICIO' || m.estado === 'DESINCORPORADA'
        ? 'danger'
        : 'neutral'

/*
  DOS COLORES QUE PARECEN UNO Y NO LO SON.

  `colorDeBarra` es para una BARRA DE AVANCE: dice cuánto se ha consumido del
  intervalo, y en su estado normal va en tierra —el color de la casa— porque
  avanzar no es una alarma.

  `colorDeSemaforo` es para un INDICADOR: dice si hay que hacer algo. En su
  estado normal va en verde, porque «al día» es una buena noticia.

  Se separaron después de verlo en pantalla: el patio usaba el de la barra y una
  máquina al día salía con una raya naranja encima, que es exactamente lo que se
  lee como «atiéndeme».
*/
const colorDeSemaforo = (m: Maquina) =>
  m.semaforo === 'BLOQUEANTE'
    ? 'bg-danger'
    : m.semaforo === 'ALARMA'
      ? 'bg-safety'
      : m.semaforo === 'AVISO'
        ? 'bg-warning'
        : 'bg-success'

/* El color de la barra de avance, compartido por la ficha y la lista. */
const colorDeBarra = (m: Maquina) =>
  m.semaforo === 'BLOQUEANTE'
    ? 'bg-danger'
    : m.semaforo === 'ALARMA'
      ? 'bg-safety'
      : m.semaforo === 'AVISO'
        ? 'bg-warning'
        : 'bg-royal-600'

const avanceDe = (m: Maquina) =>
  Math.min((Number(m.horas_desde_mant) / Number(m.tope_horas)) * 100, 100)

/*
  EL SEMÁFORO EN VERSIÓN LISTA.

  `SemaforoMantenimiento` es una pastilla con texto pensada para la esquina de
  una ficha: en una tabla mide más que la fila y la obliga a crecer, que es lo
  contrario de para qué existe la lista.

  Aquí basta un punto del mismo color, con el rótulo en el `title` para quien
  necesite leerlo y para quien navegue con lector de pantalla. El color repite lo
  que ya dice la barra de la derecha, así que nadie depende de él.
*/
const ROTULO_SEMAFORO: Record<string, string> = {
  BLOQUEANTE: 'Pasada del tope',
  ALARMA: 'En alarma',
  AVISO: 'Se acerca al tope',
  OK: 'Al día',
}

function PuntoDeSemaforo({ estado }: { estado: string }) {
  return (
    <span
      title={ROTULO_SEMAFORO[estado] ?? estado}
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-full',
        estado === 'BLOQUEANTE'
          ? 'bg-danger'
          : estado === 'ALARMA'
            ? 'bg-safety'
            : estado === 'AVISO'
              ? 'bg-warning'
              : 'bg-success',
      )}
    >
      <span className="sr-only">{ROTULO_SEMAFORO[estado] ?? estado}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// 1. FICHA
// ---------------------------------------------------------------------------
export function FichaDeMaquina({ m, acc }: { m: Maquina; acc: Acciones }) {
  const horas = Number(m.horas_desde_mant)
  const tope = Number(m.tope_horas)
  const bloquea = m.semaforo === 'BLOQUEANTE'
  const enTaller = m.mantenimiento_abierto_id !== null

  return (
    <Card
      className={cn('flex h-full flex-col border', bloquea ? 'border-danger' : 'border-hairline')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ink/45 text-2xs font-mono tracking-[0.14em]">{m.codigo}</p>
          <h2 className="text-ink/90 mt-1 truncate text-lg font-medium">{m.nombre}</h2>
          <p className="text-ink/50 mt-0.5 truncate text-xs">
            {[m.marca, m.modelo].filter(Boolean).join(' ') || 'Sin marca ni modelo'}
            {m.almacen ? ` · ${m.almacen}` : ''}
          </p>

          {/*
            QUIÉN LA LLEVA. Con muchas máquinas de viaje, el sitio contesta poco
            y la persona contesta todo: es a quien se llama. Cuando no hay nadie
            se dice, y no se calla: una máquina sin conductor asignado es justo
            la que hay que mirar.
          */}
          <p className="text-ink/50 mt-0.5 truncate text-xs">
            {m.operador ? (
              <>Lleva la máquina: {m.operador}</>
            ) : (
              <span className="text-ink/35">Sin conductor asignado</span>
            )}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Chip tone={tonoDeEstado(m)}>{ETIQUETA_ESTADO[m.estado]}</Chip>
            <DeQuienEs propietario={m.propietario} />
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

      {/* La barra dice de un vistazo cuánto queda, que es más rápido de leer que
          restar dos números. */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-ink/55 text-xs">Desde el último mantenimiento</span>
          <span className={cn('tabular text-sm font-semibold', bloquea ? 'text-danger' : 'text-ink/85')}>
            {enteros(horas)} / {enteros(tope)} h
          </span>
        </div>
        <div className="bg-ink/8 mt-2 h-1.5 overflow-hidden rounded-full">
          <div
            className={cn('h-1.5 rounded-full transition-[width] duration-500', colorDeBarra(m))}
            style={{ width: `${avanceDe(m)}%` }}
          />
        </div>
        <p className="text-ink/45 mt-2 text-xs">
          {m.ultima_lectura ? `Última lectura: ${fecha(m.ultima_lectura)}` : 'Sin lecturas de horómetro'}
          {m.ultimo_mantenimiento
            ? ` · Mantenimiento: ${fecha(m.ultimo_mantenimiento)}`
            : ' · Sin mantenimientos'}
        </p>

        {/* La reparación va aparte del mantenimiento porque responde otra
            pregunta: no si va al día, sino cada cuánto se está rompiendo. */}
        {m.reparaciones > 0 ? (
          <p className="text-ink/45 mt-1 text-xs">
            {m.reparaciones} reparación{m.reparaciones === 1 ? '' : 'es'}
            {m.ultima_reparacion ? ` · la última el ${fecha(m.ultima_reparacion)}` : ''}
          </p>
        ) : null}
      </div>

      <div className="grow" />

      {acc.puedeEscribir ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="soft"
            icon={<Gauge />}
            disabled={enTaller}
            onClick={() => acc.onHorometro(m)}
          >
            Horómetro
          </Button>
          <Button
            size="sm"
            variant={bloquea || enTaller ? 'primary' : 'outline'}
            icon={<Wrench />}
            onClick={() => acc.onTaller(m)}
          >
            {enTaller ? 'Sacar del taller' : 'Meter al taller'}
          </Button>
          <Button size="sm" variant="ghost" icon={<ToggleLeft />} onClick={() => acc.onEstado(m)}>
            Cambiar estado
          </Button>
          <Button size="sm" variant="ghost" onClick={() => acc.onAbrir(m)}>
            Editar
          </Button>
        </div>
      ) : null}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 2. LISTA
// ---------------------------------------------------------------------------
/*
  Una línea por máquina. Lo que se conserva de la ficha es lo que sirve para
  DECIDIR a cuál entrar: el semáforo, el estado, quién la lleva y cuánto le queda
  de intervalo. Lo que se cae es lo que solo sirve una vez dentro — las fechas de
  la última lectura, el conteo de reparaciones, los botones.

  La fila entera es pulsable y lleva a la ficha. Poner cuatro botones por línea
  habría devuelto la lista al tamaño de la que quería reemplazar.
*/
export function ListaDeFlota({ maquinas, acc }: { maquinas: Maquina[]; acc: Acciones }) {
  return (
    <Card flush>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[840px] text-sm">
          <thead>
            <tr className="text-ink/45 border-hairline border-b text-left text-xs whitespace-nowrap">
              <th className="px-5 py-2.5 font-medium">Equipo</th>
              <th className="px-3 py-2.5 font-medium">Estado</th>
              <th className="px-3 py-2.5 font-medium">Quién la lleva</th>
              <th className="px-3 py-2.5 font-medium">Dónde</th>
              <th className="px-3 py-2.5 font-medium">Desde el mantenimiento</th>
              <th className="px-5 py-2.5 text-right font-medium" />
            </tr>
          </thead>
          <tbody>
            {maquinas.map((m) => (
              <tr
                key={m.id}
                onClick={() => acc.onAbrir(m)}
                className={cn(
                  'border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors last:border-0',
                  m.semaforo === 'BLOQUEANTE' && 'bg-danger/4',
                )}
              >
                <td className="px-5 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <PuntoDeSemaforo estado={m.semaforo} />
                    <div className="min-w-0">
                      <p className="text-ink/85 truncate font-medium">{m.nombre}</p>
                      <p className="text-ink/40 text-2xs truncate font-mono tracking-[0.12em]">
                        {m.codigo}
                        {m.marca || m.modelo
                          ? ` · ${[m.marca, m.modelo].filter(Boolean).join(' ')}`
                          : ''}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <Chip tone={tonoDeEstado(m)}>{ETIQUETA_ESTADO[m.estado]}</Chip>
                    <DeQuienEs propietario={m.propietario} />
                  </div>
                </td>
                <td className="text-ink/70 truncate px-3 py-2.5">
                  {m.operador ?? <span className="text-ink/30">Sin asignar</span>}
                </td>
                <td className="text-ink/60 max-w-[180px] truncate px-3 py-2.5">
                  {m.almacen ?? <span className="text-ink/30">Sin sitio fijo</span>}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <div className="bg-ink/8 h-1.5 w-20 overflow-hidden rounded-full">
                      <div
                        className={cn('h-1.5 rounded-full', colorDeBarra(m))}
                        style={{ width: `${avanceDe(m)}%` }}
                      />
                    </div>
                    <span
                      className={cn(
                        'tabular text-xs',
                        m.semaforo === 'BLOQUEANTE' ? 'text-danger font-semibold' : 'text-ink/60',
                      )}
                    >
                      {enteros(Number(m.horas_desde_mant))}/{enteros(Number(m.tope_horas))} h
                    </span>
                  </div>
                </td>
                <td className="px-5 py-2.5 text-right">
                  {acc.puedeEscribir ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Gauge />}
                      disabled={m.mantenimiento_abierto_id !== null}
                      onClick={(e) => {
                        e.stopPropagation()
                        acc.onHorometro(m)
                      }}
                    >
                      <span className="sr-only">Anotar el horómetro de {m.nombre}</span>
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 3. PATIO
// ---------------------------------------------------------------------------
/*
  La flota entera de un vistazo, agrupada por dueño.

  Es la vista para pasar revista y para proyectar: losetas del tamaño de una
  matrícula, con el código —que es lo que está pintado en el costado de la
  máquina y lo que se dice por radio— y una raya de color con su semáforo.

  El nombre va debajo y pequeño porque aquí no identifica: ya se sabe que se
  repite. Lo que identifica es el código, y por eso es lo grande.

  AGRUPADA POR DUEÑO y no por estado: el estado ya lo dice el color de cada
  loseta, y agrupar por lo mismo que se pinta sería decirlo dos veces. Por dueño
  contesta la pregunta que no contesta ninguna otra vista de un vistazo —«¿qué es
  de la gobernación?»— que es justo lo que se viene pidiendo toda la semana.
*/
export function PatioDeFlota({
  maquinas,
  acc,
  nombreDeDueno,
}: {
  maquinas: Maquina[]
  acc: Acciones
  nombreDeDueno: (codigo: string) => string
}) {
  const porDueno = new Map<string, Maquina[]>()
  for (const m of maquinas) {
    const d = m.propietario ?? 'LACANTERA'
    const ya = porDueno.get(d)
    if (ya) ya.push(m)
    else porDueno.set(d, [m])
  }

  const grupos = [...porDueno.entries()].sort(([a], [b]) => comparar(nombreDeDueno(a), nombreDeDueno(b)))

  return (
    <div className="space-y-5">
      {grupos.map(([codigo, lista]) => (
        <Fragment key={codigo}>
          {/* La cabecera solo se dibuja con más de un dueño: con uno solo sería
              rotular la única cosa que hay. */}
          {grupos.length > 1 ? (
            <div className="mb-2 flex items-baseline gap-2">
              <h2 className="text-ink/40 text-2xs font-mono tracking-[0.16em] uppercase">
                {nombreDeDueno(codigo)}
              </h2>
              <span className="text-ink/30 text-2xs">
                {lista.length} equipo{lista.length === 1 ? '' : 's'}
              </span>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {lista.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => acc.onAbrir(m)}
                title={`${m.nombre} · ${ETIQUETA_ESTADO[m.estado]}`}
                className={cn(
                  'border-hairline hover:bg-ink/3 relative overflow-hidden rounded-lg border',
                  'px-3 pt-3 pb-2.5 text-left transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none',
                  m.semaforo === 'BLOQUEANTE' && 'border-danger',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn('absolute inset-x-0 top-0 h-1', colorDeSemaforo(m))}
                />
                <p className="text-ink/90 mt-1 truncate font-mono text-sm tracking-[0.08em]">
                  {m.codigo}
                </p>
                <p className="text-ink/45 mt-1 truncate text-xs">{m.nombre}</p>
                <p className="text-ink/35 text-2xs mt-1.5 truncate">
                  {ETIQUETA_ESTADO[m.estado]}
                  {m.clase && m.clase !== 'MAQUINA' ? ` · ${ETIQUETA_CLASE[m.clase]}` : ''}
                </p>
              </button>
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  )
}
