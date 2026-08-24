import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Boxes, Tags, Wrench } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_SITIOS } from '@/components/pestanasDeModulos'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Modal } from '@/components/ui/Modal'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { SemaforoMantenimiento } from '@/components/SemaforoMantenimiento'
import { useAlmacenes, useExistencias } from '@/lib/api/inventario'
import {
  useEspecialidades,
  useGuardarEspecialidadesTaller,
  useMantenimientosDeTaller,
  useMaquinaria,
  useOrdenesTaller,
  useTalleres,
} from '@/lib/api/maquinaria'
import { useMisPermisos } from '@/lib/api/usuarios'
import { Interruptor } from '@/components/ui/Interruptor'
import { cn } from '@/lib/cn'
import { dolares, enteros, fecha } from '@/lib/formato'

/**
 * Los talleres, por lo que tienen y por lo que hacen.
 *
 * UN TALLER ES UN ALMACÉN QUE ADEMÁS TRABAJA
 *
 * En la base no hay dos entidades: un taller es una fila de `almacenes` con
 * tipo TALLER, y por eso recibe, guarda y entrega material como cualquier
 * otro. Lo que lo distingue no es cómo guarda, es que de él salen reparaciones
 * y producción.
 *
 * Esa diferencia no se veía en ninguna pantalla: en Existencias un taller era
 * una opción más del desplegable, indistinguible del patio. Aquí se ve
 * completo — lo que tiene asignado, qué máquinas viven en él y qué ha
 * reparado— que es como lo piensa quien lo lleva.
 *
 * NO DUPLICA EXISTENCIAS
 *
 * El detalle artículo por artículo sigue estando en Existencias, y el enlace
 * lleva allí con el taller ya elegido. Esta pantalla responde otra pregunta:
 * qué está pasando en cada taller.
 */
export function Talleres() {
  const { data: almacenes, isPending: cargandoAlmacenes, error } = useAlmacenes(false)
  const { data: existencias, isPending: cargandoExistencias } = useExistencias()
  const { data: maquinas } = useMaquinaria(true)
  const navegar = useNavigate()

  const [verReparaciones, setVerReparaciones] = useState<{ id: number; nombre: string } | null>(
    null,
  )
  const [editandoOficios, setEditandoOficios] = useState<number | null>(null)

  /*
    LO QUE CADA TALLER SABE HACER Y TIENE ENCIMA

    Christopher pregunto a que taller mandar, si esta libre y que tiene en cola.
    Las tres salen de aqui: `v_talleres` trae los oficios declarados y el conteo
    de lo abierto, y la cola son las ordenes abiertas ordenadas por urgencia.

    Se piden aparte de los almacenes porque son preguntas distintas —una es
    «que guarda», la otra «que esta haciendo»— y mezclarlas obligaria a la vista
    de almacenes a saber de ordenes de taller.
  */
  const detalle = useTalleres()
  const especialidades = useEspecialidades()
  const cola = useOrdenesTaller('ABIERTO')
  const { puede } = useMisPermisos()
  const puedeMandar = puede('MAQUINARIA', 'ESCRITURA')

  const talleres = useMemo(
    () => (almacenes ?? []).filter((a) => a.tipo === 'TALLER'),
    [almacenes],
  )

  // Se agrupa aquí y no con una consulta por taller: son pocos talleres y
  // muchas menos idas al servidor que pedir las existencias de cada uno.
  const porTaller = useMemo(() => {
    const mapa = new Map<number, { articulos: number; valor: number; bajos: number }>()
    for (const e of existencias ?? []) {
      const acc = mapa.get(e.almacen_id) ?? { articulos: 0, valor: 0, bajos: 0 }
      if (Number(e.existencia) !== 0) acc.articulos += 1
      acc.valor += Number(e.valor_usd)
      if (Number(e.stock_minimo) > 0 && Number(e.existencia) <= Number(e.stock_minimo)) {
        acc.bajos += 1
      }
      mapa.set(e.almacen_id, acc)
    }
    return mapa
  }, [existencias])

  const cargando = cargandoAlmacenes || cargandoExistencias

  return (
    <>
      <PageHeader
        title="Talleres"
        description="Qué tiene asignado cada taller y en qué lo está gastando. El detalle artículo por artículo vive en Existencias."
      />

      <Pestanas pestanas={PESTANAS_SITIOS} />

      {cargando ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {!cargando && talleres.length === 0 ? (
        <Card>
          <Vacio
            icono={<Wrench />}
            titulo="No hay talleres registrados"
            descripcion="Un taller se crea como almacén, eligiendo el tipo Taller. A partir de ahí recibe material, guarda lo suyo y las reparaciones se le pueden atribuir."
            accion={
              <Button variant="outline" onClick={() => navegar('/app/inventario/almacenes')}>
                Ir a almacenes
              </Button>
            }
          />
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {talleres.map((t) => {
          const resumen = porTaller.get(t.id)
          const suyas = (maquinas ?? []).filter((m) => m.almacen_id === t.id)
          const urgentes = suyas.filter(
            (m) => m.semaforo === 'ALARMA' || m.semaforo === 'BLOQUEANTE',
          )

          return (
            <Card key={t.id} className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-ink/90 text-lg font-medium">{t.nombre}</h2>
                  <p className="text-ink/45 text-2xs font-mono tracking-[0.14em]">{t.codigo}</p>
                </div>
                {!t.activo ? <Chip tone="neutral">Cerrado</Chip> : null}
              </div>

              {/* ------------------------- Qué sabe hacer ------------------------- */}
              {(() => {
                const d = (detalle.data ?? []).find((x) => x.id === t.id)
                const suyas = (cola.data ?? []).filter((o) => o.taller_id === t.id)

                return (
                  <>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {d?.sabe_hacer ? (
                        d.especialidades.map((codigo) => {
                          const nombre =
                            (especialidades.data ?? []).find((x) => x.codigo === codigo)?.nombre ??
                            codigo
                          return (
                            <Chip key={codigo} tone="info">
                              {nombre}
                            </Chip>
                          )
                        })
                      ) : (
                        /* Sin oficios declarados el taller acepta cualquier
                           trabajo. Se dice, porque un hueco aquí se lee como
                           «no sabe hacer nada». */
                        <span className="text-ink/45 text-xs">Acepta cualquier trabajo</span>
                      )}

                      {puedeMandar ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Tags />}
                          onClick={() => setEditandoOficios(t.id)}
                        >
                          Oficios
                        </Button>
                      ) : null}
                    </div>

                    {/* ---------------------- Qué tiene encima ---------------------- */}
                    <div className="border-hairline mt-3 rounded-[6px] border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-ink/55 text-xs">En el taller ahora</p>
                        {d?.tiene_sitio === false ? (
                          <Chip tone="warning">Sin sitio</Chip>
                        ) : d?.tiene_sitio === true ? (
                          <Chip tone="success">Le queda sitio</Chip>
                        ) : null}
                      </div>

                      {suyas.length === 0 ? (
                        <p className="text-ink/45 mt-1 text-sm">Nada abierto.</p>
                      ) : (
                        <ul className="mt-2 space-y-1.5">
                          {suyas.slice(0, 5).map((o) => (
                            <li key={o.id} className="flex items-center gap-2 text-sm">
                              <Chip
                                tone={
                                  o.urgencia === 'URGENTE'
                                    ? 'danger'
                                    : o.urgencia === 'ALTA'
                                      ? 'warning'
                                      : 'neutral'
                                }
                              >
                                {o.urgencia === 'URGENTE'
                                  ? 'Urgente'
                                  : o.urgencia === 'ALTA'
                                    ? 'Alta'
                                    : 'Normal'}
                              </Chip>
                              <span className="text-ink/75 min-w-0 grow truncate">{o.sobre}</span>
                              <span
                                className={cn(
                                  'shrink-0 text-xs',
                                  o.se_paso ? 'text-danger' : 'text-ink/45',
                                )}
                              >
                                {o.dias_dentro ?? 0} d
                                {o.dias_estimados ? ` / ${o.dias_estimados}` : ''}
                              </span>
                            </li>
                          ))}
                          {suyas.length > 5 ? (
                            <li className="text-ink/45 text-xs">
                              y {suyas.length - 5} más
                            </li>
                          ) : null}
                        </ul>
                      )}
                    </div>
                  </>
                )
              })()}

              {/* Lo que tiene. Sin existencias todavía no se inventa un cero
                  con aire de dato: se dice que no ha recibido nada. */}
              <div className="border-hairline mt-4 rounded-[6px] border p-3">
                <p className="text-ink/55 text-xs">Material asignado</p>
                {resumen ? (
                  <p className="text-ink/85 mt-1 text-sm">
                    <span className="tabular font-semibold">{resumen.articulos}</span> artículo
                    {resumen.articulos === 1 ? '' : 's'} ·{' '}
                    <span className="tabular font-semibold">{dolares(resumen.valor)}</span>
                    {resumen.bajos > 0 ? (
                      <Chip tone="warning" className="ml-2">
                        {resumen.bajos} bajo mínimo
                      </Chip>
                    ) : null}
                  </p>
                ) : (
                  <p className="text-ink/50 mt-1 text-sm">
                    Todavía no ha recibido material. Llega por transferencia desde otro almacén o
                    por una compra recibida aquí.
                  </p>
                )}
              </div>

              {/* Las máquinas que viven en él. Es lo que convierte al taller en
                  algo distinto de un depósito. */}
              <div className="mt-4">
                <p className="text-ink/55 mb-2 text-xs">
                  Máquinas asignadas
                  {urgentes.length > 0 ? (
                    <span className="text-danger ml-1 font-medium">
                      · {urgentes.length} necesita{urgentes.length === 1 ? '' : 'n'} atención
                    </span>
                  ) : null}
                </p>

                {suyas.length === 0 ? (
                  <p className="text-ink/45 text-sm">Ninguna máquina tiene este taller como sede.</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {suyas.map((m) => (
                      <li
                        key={m.id}
                        className="border-hairline flex items-center gap-2 rounded-full border py-1 pr-1 pl-3"
                      >
                        <span className="text-ink/80 text-xs">{m.codigo}</span>
                        <SemaforoMantenimiento estado={m.semaforo} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="grow" />

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="soft"
                  icon={<Boxes />}
                  onClick={() => navegar(`/app/inventario/existencias?almacen=${t.id}`)}
                >
                  Ver su inventario
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Wrench />}
                  onClick={() => setVerReparaciones({ id: t.id, nombre: t.nombre })}
                >
                  Qué ha reparado
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      <ModalOficios
        tallerId={editandoOficios}
        onCerrar={() => setEditandoOficios(null)}
      />

      <ModalReparaciones taller={verReparaciones} onCerrar={() => setVerReparaciones(null)} />
    </>
  )
}

/**
 * Lo que ha pasado por un taller.
 *
 * Se listan mantenimientos y servicios juntos, marcados: la diferencia importa
 * para el contador de horas de la máquina, pero para saber qué hace el taller
 * ambos cuentan por igual.
 */
function ModalReparaciones({
  taller,
  onCerrar,
}: {
  taller: { id: number; nombre: string } | null
  onCerrar: () => void
}) {
  const { data, isPending, error } = useMantenimientosDeTaller(taller?.id ?? null)
  const { data: maquinas } = useMaquinaria(true)

  const nombreDe = (id: number) => (maquinas ?? []).find((m) => m.id === id)?.codigo ?? `#${id}`
  const gasto = (data ?? []).reduce((s, m) => s + Number(m.costo_usd ?? 0), 0)

  return (
    <Modal
      abierto={taller !== null}
      onCerrar={onCerrar}
      titulo={taller ? `Reparaciones en ${taller.nombre}` : ''}
      descripcion="Lo último que ha pasado por este taller, de más reciente a más antiguo."
      ancho="lg"
      acciones={
        <Button variant="ghost" onClick={onCerrar}>
          Cerrar
        </Button>
      }
    >
      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Vacio
          icono={<Wrench />}
          titulo="Sin trabajos registrados"
          descripcion="Cuando se registre un mantenimiento o un servicio indicando este taller, aparecerá aquí."
        />
      ) : null}

      {data && data.length > 0 ? (
        <>
          {gasto > 0 ? (
            <p className="text-ink/60 mb-3 text-sm">
              Costo acumulado de lo listado:{' '}
              <span className="tabular text-ink/85 font-semibold">{dolares(gasto)}</span>
            </p>
          ) : null}

          <ul className="divide-hairline divide-y">
            {data.map((m) => (
              <li key={m.id} className="py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-ink/85 font-mono text-sm">{nombreDe(m.maquina_id)}</span>
                  <Chip
                    tone={
                      m.tipo === 'MANTENIMIENTO'
                        ? 'warning'
                        : m.tipo === 'REPARACION'
                          ? 'danger'
                          : 'neutral'
                    }
                  >
                    {m.tipo === 'MANTENIMIENTO'
                      ? 'Mantenimiento'
                      : m.tipo === 'REPARACION'
                        ? 'Reparación'
                        : 'Servicio'}
                  </Chip>
                  <span className="text-ink/45 text-xs">{fecha(m.fecha)}</span>
                  {m.horometro ? (
                    <span className="text-ink/45 text-xs">
                      · {enteros(Number(m.horometro))} h
                    </span>
                  ) : null}
                  {m.costo_usd ? (
                    <span className="tabular text-ink/65 ml-auto text-sm">
                      {dolares(m.costo_usd)}
                    </span>
                  ) : null}
                </div>
                <p className="text-ink/70 mt-1 text-sm leading-relaxed">{m.detalle}</p>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Modal>
  )
}

/*
  QUE SABE HACER ESTE TALLER

  Se marca lo que hace y se guarda la lista entera, no los cambios uno a uno:
  la pantalla manda lo que quedo marcado y asi no hay forma de que las dos se
  descuadren.

  Sin nada marcado, el taller acepta cualquier trabajo. Es lo razonable en una
  cantera con un solo taller — y se dice en el pie, porque dejarlo vacio sin
  explicar se lee como que no sabe hacer nada.
*/
function ModalOficios({
  tallerId,
  onCerrar,
}: {
  tallerId: number | null
  onCerrar: () => void
}) {
  const especialidades = useEspecialidades()
  const talleres = useTalleres()
  const guardar = useGuardarEspecialidadesTaller()
  const [marcadas, setMarcadas] = useState<string[] | null>(null)

  const taller = (talleres.data ?? []).find((t) => t.id === tallerId)
  const actuales = marcadas ?? taller?.especialidades ?? []

  return (
    <Modal
      abierto={tallerId !== null}
      onCerrar={() => {
        setMarcadas(null)
        onCerrar()
      }}
      titulo={taller ? `Qué se hace en ${taller.nombre}` : 'Oficios del taller'}
      descripcion="Al abrir una orden se comprueba contra esta lista. Sin nada marcado, el taller acepta cualquier trabajo."
      acciones={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              setMarcadas(null)
              onCerrar()
            }}
          >
            Cancelar
          </Button>
          <Button
            disabled={guardar.isPending || tallerId === null}
            onClick={async () => {
              if (tallerId === null) return
              await guardar.mutateAsync({ taller_id: tallerId, especialidades: actuales })
              setMarcadas(null)
              onCerrar()
            }}
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="space-y-1">
        {(especialidades.data ?? []).map((e) => (
          <Interruptor
            key={e.codigo}
            encendido={actuales.includes(e.codigo)}
            etiqueta={e.nombre}
            onCambio={(v) =>
              setMarcadas(
                v ? [...actuales, e.codigo] : actuales.filter((c) => c !== e.codigo),
              )
            }
          />
        ))}
      </div>

      {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-3" /> : null}
    </Modal>
  )
}
