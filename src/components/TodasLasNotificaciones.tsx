import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Bell, CheckCheck, ChevronDown } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Cargando, Vacio } from '@/components/ui/Estado'
import {
  agruparPorAsunto,
  useMarcarLeidas,
  useMarcarTodasLeidas,
  useNotificaciones,
} from '@/lib/api/notificaciones'
import type { GrupoDeAvisos, Importancia, Modulo } from '@/lib/api/notificaciones'
import { iconoDe, nombreDe, TONO_DE_IMPORTANCIA } from '@/components/avisos'
import { hace } from '@/lib/formato'
import { cn } from '@/lib/cn'

/*
  TODAS LAS NOTIFICACIONES.

  La campana es un vistazo: los ocho asuntos que más apuran y poco más. Esto es
  el archivo, y contesta las preguntas que allí no caben — «¿qué quedó
  pendiente de compras?», «¿qué pasó con aquella orden?», «¿de dónde salieron
  veintinueve sin leer?».

  POR QUÉ AGRUPADO Y NO EN FILA

  Lo mismo que en la campana, y por lo mismo: `private.anotar` deja un aviso por
  cada cambio de estado y una compra tiene tres documentos que se mueven a la
  vez. En fila se lee como si el sistema repitiera avisos. Agrupado se lee lo
  que de verdad hay: una compra, en el estado en el que está, con los pasos que
  dio debajo si se quieren ver.

  El despliegue es lo que separa este papel de la campana: aquí los pasos SÍ
  interesan, porque quien abre esto viene a reconstruir una historia.

  LOS DOS FILTROS Y POR QUÉ SOLO DOS

  «Sin leer» contesta «¿qué me falta?». El módulo contesta «¿qué hay de
  compras?». Un tercer filtro por importancia se descartó: la
  importancia ya ordena la lista y ya colorea el icono, y filtrar por ella
  esconde justo lo que uno no sabía que tenía que mirar.

  Las pastillas de módulo se sacan de los avisos que hay, no de la lista de
  módulos posibles. Un filtro que no filtra nada —«Combustible (0)»— es una
  promesa de que ahí hay algo.
*/

const RESUMEN: Record<Importancia, string> = {
  URGENTE: 'Urgente',
  ATENCION: 'Requiere atención',
  INFO: 'Informativo',
}

/** Un asunto con su historia plegada. */
function Asunto({
  grupo,
  onIr,
  onMarcar,
}: {
  grupo: GrupoDeAvisos
  onIr: (g: GrupoDeAvisos) => void
  onMarcar: (g: GrupoDeAvisos) => void
}) {
  const [desplegado, setDesplegado] = useState(false)
  const n = grupo.ultimo
  const Icono = iconoDe(n.modulo)
  const hayHistoria = grupo.avisos.length > 1

  return (
    <div
      className={cn(
        'border-hairline rounded-card border p-3 transition-colors',
        grupo.sinLeer > 0 ? 'bg-royal-600/6' : 'bg-surface',
      )}
    >
      <div className="flex gap-3">
        <span
          className={cn(
            'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
            TONO_DE_IMPORTANCIA[n.importancia],
          )}
          title={RESUMEN[n.importancia]}
        >
          <Icono className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p
              className={cn(
                'text-ink/90 min-w-0 flex-1 text-sm leading-snug',
                grupo.sinLeer > 0 && 'font-semibold',
              )}
            >
              {n.titulo}
            </p>
            {grupo.sinLeer > 0 ? (
              <span className="bg-royal-600 mt-1.5 size-2 shrink-0 rounded-full" />
            ) : null}
          </div>

          {n.detalle ? (
            <p className="text-ink/55 mt-0.5 text-xs leading-relaxed">{n.detalle}</p>
          ) : null}

          <p className="text-ink/40 mt-1 text-2xs">
            {nombreDe(n.modulo)} · {hace(n.creada_en)}
            {n.actor ? ` · ${n.actor}` : ''}
          </p>

          {/*
            La historia se despliega aquí y no abre nada: quien quiere el
            documento pulsa «Abrir». Son dos preguntas distintas —«¿qué pasó
            con esto?» y «llévame allí»— y mezclarlas obliga a salir de la
            lista para volver a entrar.
          */}
          {desplegado && hayHistoria ? (
            <ol className="border-hairline mt-3 space-y-2 border-l pl-3">
              {grupo.avisos.slice(1).map((a) => (
                <li key={a.id} className="text-2xs">
                  <span className={cn('text-ink/70', !a.leida && 'font-medium')}>{a.titulo}</span>
                  <span className="text-ink/35 block">
                    {hace(a.creada_en)}
                    {a.actor ? ` · ${a.actor}` : ''}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-1">
            {n.ruta ? (
              <Button size="sm" variant="ghost" onClick={() => onIr(grupo)}>
                Abrir
              </Button>
            ) : null}

            {hayHistoria ? (
              <button
                type="button"
                onClick={() => setDesplegado((v) => !v)}
                aria-expanded={desplegado}
                className="text-ink/45 hover:bg-ink/6 hover:text-ink/80 flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors"
              >
                <ChevronDown
                  className={cn('size-3.5 transition-transform', desplegado && 'rotate-180')}
                />
                {desplegado
                  ? 'Ocultar los pasos'
                  : `${grupo.avisos.length - 1} paso${grupo.avisos.length === 2 ? '' : 's'} antes`}
              </button>
            ) : null}

            {grupo.sinLeer > 0 ? (
              <button
                type="button"
                onClick={() => onMarcar(grupo)}
                className="text-ink/45 hover:bg-ink/6 hover:text-ink/80 rounded-md px-2 py-1 text-xs transition-colors"
              >
                Marcar leída
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export function TodasLasNotificaciones({
  abierto,
  onCerrar,
}: {
  abierto: boolean
  onCerrar: () => void
}) {
  const navigate = useNavigate()
  /*
    Doscientos, y no todos.

    Es el archivo, pero un archivo que se abre en un modal y se recorre con la
    rueda del ratón. Doscientos asuntos son meses de movimiento en una cantera
    de veintidós personas; más allá de eso lo que se busca no se busca aquí, se
    busca en la bitácora de la compra.
  */
  const { data, isPending } = useNotificaciones(200)
  const marcarLeidas = useMarcarLeidas()
  const marcarTodas = useMarcarTodasLeidas()

  const [soloSinLeer, setSoloSinLeer] = useState(false)
  const [modulo, setModulo] = useState<Modulo | null>(null)

  const grupos = useMemo(() => agruparPorAsunto(data ?? []), [data])

  // Las pastillas salen de lo que hay, con su cuenta. Ver la cabecera.
  const modulos = useMemo(() => {
    const cuenta = new Map<Modulo, number>()
    for (const g of grupos) cuenta.set(g.ultimo.modulo, (cuenta.get(g.ultimo.modulo) ?? 0) + 1)
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1])
  }, [grupos])

  const visibles = useMemo(
    () =>
      grupos.filter(
        (g) =>
          (!soloSinLeer || g.sinLeer > 0) && (modulo === null || g.ultimo.modulo === modulo),
      ),
    [grupos, soloSinLeer, modulo],
  )

  const sinLeer = grupos.filter((g) => g.sinLeer > 0).length

  const ir = (g: GrupoDeAvisos) => {
    const pendientes = g.avisos.filter((a) => !a.leida).map((a) => a.id)
    if (pendientes.length > 0) marcarLeidas.mutate({ ids: pendientes })
    onCerrar()
    if (g.ultimo.ruta) void navigate(g.ultimo.ruta)
  }

  const marcar = (g: GrupoDeAvisos) => {
    const pendientes = g.avisos.filter((a) => !a.leida).map((a) => a.id)
    if (pendientes.length > 0) marcarLeidas.mutate({ ids: pendientes })
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Movimientos"
      descripcion={
        sinLeer > 0
          ? `${sinLeer} ${sinLeer === 1 ? 'asunto' : 'asuntos'} sin leer. Lo que no se ha atendido va primero.`
          : 'Todo leído. Quedan aquí para consultarlos.'
      }
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cerrar
          </Button>
          {sinLeer > 0 ? (
            <Button
              variant="outline"
              icon={<CheckCheck />}
              disabled={marcarTodas.isPending}
              onClick={() => marcarTodas.mutate()}
            >
              Marcar todas como leídas
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        {/*
          Los dos filtros llevan el vestido que ya usa el selector de tema del
          Topbar: pista en `bg-ink/6` y la opción elegida en `bg-surface` con
          `shadow-control`. Se probó antes con pastillas de color propio y
          quedaba un control que no se parecía a ningún otro de la aplicación,
          que es como se empieza a tener dos diseños.

          Van en dos grupos separados porque son dos preguntas: «sin ver» es un
          interruptor —o filtras o no—, y el módulo es una elección entre
          varias. Meterlos en la misma pista los haría parecer excluyentes, y no
          lo son: se puede querer lo de compras sin ver.
        */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-ink/6 flex gap-0.5 rounded-md p-0.5">
            {/*
              «Sin leer» y no «pendientes» ni «sin ver»: es la palabra que ya
              usa la campana —«29 sin leer»— y la del botón de marcar. Tres
              palabras para el mismo estado hacen dudar de si son el mismo
              estado.
            */}
            <button
              type="button"
              onClick={() => setSoloSinLeer(false)}
              aria-pressed={!soloSinLeer}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                !soloSinLeer
                  ? 'bg-surface text-ink/90 shadow-control'
                  : 'text-ink/55 hover:text-ink/80',
              )}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setSoloSinLeer(true)}
              aria-pressed={soloSinLeer}
              disabled={sinLeer === 0}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40',
                soloSinLeer
                  ? 'bg-surface text-ink/90 shadow-control'
                  : 'text-ink/55 hover:text-ink/80',
              )}
            >
              Sin leer{sinLeer > 0 ? ` (${sinLeer})` : ''}
            </button>
          </div>

          {/*
            La pista de módulos solo aparece si hay más de uno. Con un único
            módulo, elegir entre «Todo» y ese módulo es elegir dos veces lo
            mismo.
          */}
          {modulos.length > 1 ? (
            <div className="bg-ink/6 flex flex-wrap gap-0.5 rounded-md p-0.5">
              <button
                type="button"
                onClick={() => setModulo(null)}
                aria-pressed={modulo === null}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  modulo === null
                    ? 'bg-surface text-ink/90 shadow-control'
                    : 'text-ink/55 hover:text-ink/80',
                )}
              >
                Todo
              </button>
              {modulos.map(([m, cuantos]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModulo(modulo === m ? null : m)}
                  aria-pressed={modulo === m}
                  className={cn(
                    'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                    modulo === m
                      ? 'bg-surface text-ink/90 shadow-control'
                      : 'text-ink/55 hover:text-ink/80',
                  )}
                >
                  {nombreDe(m)} ({cuantos})
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {isPending ? <Cargando /> : null}

        {!isPending && visibles.length === 0 ? (
          <Vacio
            icono={<Bell />}
            titulo={
              grupos.length === 0 ? 'Sin movimientos todavía' : 'Nada que enseñar con ese filtro'
            }
            descripcion={
              grupos.length === 0
                ? 'Aquí entran los pedidos, las entradas de inventario y los pagos.'
                : 'Quita el filtro para ver el resto.'
            }
            resuelto={grupos.length > 0 && soloSinLeer && sinLeer === 0}
          />
        ) : null}

        <div className="space-y-2">
          {visibles.map((g) => (
            <Asunto key={g.clave} grupo={g} onIr={ir} onMarcar={marcar} />
          ))}
        </div>
      </div>
    </Modal>
  )
}
