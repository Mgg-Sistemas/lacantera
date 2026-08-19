import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, UserRound } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { SemaforoMantenimiento } from '@/components/SemaforoMantenimiento'
import { ModalChofer } from './ModalChofer'
import {
  TIPOS_VEHICULO,
  useActividadDeVehiculo,
  useChoferesDeVehiculo,
  useVehiculos,
} from '@/lib/api/vehiculos'
import { useMisPermisos } from '@/lib/api/usuarios'
import { dolares, enteros, fecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

/**
 * La hoja de vida de un vehículo.
 *
 * TRES PREGUNTAS QUE ESTABAN EN TRES SITIOS
 *
 * Qué le han hecho, qué ha hecho él y quién lo maneja. Lo primero vivía en
 * Maquinaria, lo segundo repartido entre pesajes, despachos y guías, y lo
 * tercero en la cabeza de quien despacha. Un camión es una cosa sola y su
 * historia también.
 *
 * EL CHOFER ES UN PERÍODO, NO UN CAMPO
 *
 * Guardarlo como «el chofer de este camión» perdería el traspaso: el día que
 * cambia, el anterior desaparece y con él la respuesta a quién manejaba el
 * martes pasado — que es justo la pregunta que se hace cuando algo salió mal.
 * Por eso cada chofer es una fila con su desde y su hasta, y asignar uno nuevo
 * cierra el anterior solo.
 */
export function FichaVehiculo() {
  const { id } = useParams()
  const vehiculoId = Number(id)

  const { data: vehiculos, isPending, error } = useVehiculos(false)
  const choferes = useChoferesDeVehiculo(vehiculoId || null)
  const actividad = useActividadDeVehiculo(vehiculoId || null)
  const { puede } = useMisPermisos()
  const [asignando, setAsignando] = useState(false)

  const v = (vehiculos ?? []).find((x) => x.id === vehiculoId)
  const puedeEscribir = puede('DESPACHOS', 'ESCRITURA')

  if (isPending) return <Cargando />
  if (error) return <ErrorDeCarga error={error} />
  if (!v) {
    return (
      <Card>
        <Vacio titulo="Ese vehículo no existe" descripcion="Puede que se haya eliminado." />
      </Card>
    )
  }

  const historial = choferes.data ?? []
  const anteriores = historial.filter((c) => !c.vigente)

  return (
    <>
      <PageHeader
        title={v.placa}
        description={[
          TIPOS_VEHICULO.find((t) => t.valor === v.tipo)?.etiqueta ?? v.tipo,
          v.descripcion,
          v.propio ? 'De la empresa' : v.transportista,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <Link to="/app/despachos/vehiculos">
            <Button variant="outline" icon={<ArrowLeft />}>
              Volver a la flota
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Quién lo maneja"
              subtitle={
                v.chofer_actual
                  ? `Desde el ${fecha(v.chofer_desde!)}`
                  : 'Nadie lo tiene asignado ahora mismo.'
              }
              action={
                puedeEscribir ? (
                  <Button size="sm" variant="soft" icon={<UserRound />} onClick={() => setAsignando(true)}>
                    {v.chofer_actual ? 'Traspasar' : 'Asignar chofer'}
                  </Button>
                ) : undefined
              }
            />

            {choferes.isPending ? <Cargando /> : null}

            {v.chofer_actual ? (
              <div className="border-royal-600/30 bg-royal-600/5 rounded-card mt-4 border p-3.5">
                <p className="text-ink/90 text-base font-medium">{v.chofer_actual}</p>
                <p className="text-ink/55 text-xs">
                  {v.cedula_chofer_actual ?? 'Sin cédula registrada'}
                  {historial[0]?.cargo ? ` · ${historial[0].cargo}` : ''}
                  {historial[0]?.es_de_la_casa ? ' · de la casa' : ''}
                </p>
              </div>
            ) : null}

            {/* El historial de traspasos. Es lo que responde quién manejaba el
                martes pasado, que es cuando se pregunta. */}
            {anteriores.length > 0 ? (
              <>
                <h3 className="text-ink/60 mt-5 mb-2 text-xs font-medium">Antes lo manejaron</h3>
                <ul className="divide-hairline divide-y">
                  {anteriores.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                      <span className="text-ink/80 text-sm">{c.chofer}</span>
                      <span className="text-ink/45 text-xs">{c.cedula}</span>
                      <span className="text-ink/45 ml-auto text-xs">
                        {fecha(c.desde)} — {fecha(c.hasta!)} · {c.dias} día
                        {c.dias === 1 ? '' : 's'}
                      </span>
                      {c.motivo ? (
                        <span className="text-ink/50 w-full text-xs italic">{c.motivo}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </Card>

          <Card flush>
            <div className="px-5 pt-5">
              <CardHeader
                title="Qué ha hecho"
                subtitle="Pesajes, despachos, guías y pasos por el taller, de lo más reciente a lo más antiguo."
              />
            </div>

            {actividad.isPending ? <Cargando /> : null}

            {actividad.data && actividad.data.length === 0 ? (
              <div className="px-5 pb-5">
                <Vacio
                  titulo="Todavía no ha hecho nada"
                  descripcion="Cuando pase por la romana, salga con un despacho o entre al taller, aparecerá aquí."
                />
              </div>
            ) : null}

            {actividad.data && actividad.data.length > 0 ? (
              <ul className="divide-hairline mt-4 divide-y">
                {actividad.data.map((a) => (
                  <li key={`${a.tipo}-${a.numero}`} className="flex flex-wrap items-baseline gap-2 px-5 py-3">
                    <Chip
                      tone={
                        a.tipo === 'TALLER'
                          ? 'warning'
                          : a.tipo === 'DESPACHO'
                            ? 'success'
                            : 'neutral'
                      }
                    >
                      {a.tipo === 'PESAJE'
                        ? 'Pesaje'
                        : a.tipo === 'DESPACHO'
                          ? 'Despacho'
                          : a.tipo === 'GUIA'
                            ? 'Guía'
                            : 'Taller'}
                    </Chip>
                    <span className="text-ink/45 text-2xs font-mono">{a.numero}</span>
                    <span className="text-ink/75 text-sm">{a.detalle}</span>
                    {a.cantidad ? (
                      <span className="tabular text-ink/70 ml-auto text-sm">
                        {a.unidad === 'USD'
                          ? dolares(a.cantidad)
                          : `${enteros(Number(a.cantidad))} ${a.unidad === 'KG' ? 'kg' : a.unidad === 'M3' ? 'm³' : a.unidad}`}
                      </span>
                    ) : null}
                    <span className="text-ink/45 w-full text-xs">{fecha(a.fecha)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="La ficha" />
            <dl className="mt-4 space-y-3 text-sm">
              <Dato termino="Carga" valor={`${Number(v.capacidad_m3)} m³`} />
              {v.capacidad_ton ? (
                <Dato termino="En toneladas" valor={`${Number(v.capacidad_ton)} t`} />
              ) : null}
              <Dato
                termino="De quién es"
                valor={v.propio ? 'De la empresa' : (v.transportista ?? 'De un transportista')}
              />
              {!v.activo ? <Dato termino="Estado" valor="Fuera de servicio" /> : null}
              {v.nota ? <Dato termino="Nota" valor={v.nota} /> : null}
            </dl>
          </Card>

          {/* El mantenimiento solo existe para los propios: los de un
              transportista no los mantenemos nosotros. */}
          {v.maquina_id ? (
            <Card>
              <CardHeader
                title="Mantenimiento"
                subtitle={`Ficha ${v.maquina_codigo} en Maquinaria`}
                action={
                  v.semaforo_mantenimiento ? (
                    <SemaforoMantenimiento estado={v.semaforo_mantenimiento} />
                  ) : undefined
                }
              />
              <p className="text-ink/70 mt-4 text-sm">
                Lleva{' '}
                <span className="tabular font-semibold">
                  {enteros(Number(v.horas_desde_mant ?? 0))}
                </span>{' '}
                horas desde el último, sobre un tope de{' '}
                <span className="tabular">{enteros(Number(v.tope_horas ?? 0))}</span>.
              </p>
              <Link to="/app/maquinaria" className="mt-3 inline-block">
                <Button size="sm" variant="outline">
                  Ver en Maquinaria
                </Button>
              </Link>
            </Card>
          ) : v.propio ? (
            <Card>
              <CardHeader title="Mantenimiento" />
              <p className="text-ink/60 mt-3 text-sm leading-relaxed">
                Este camión es de la empresa pero no tiene ficha en Maquinaria, así que nadie le
                lleva el horómetro. Se enlaza desde Editar.
              </p>
            </Card>
          ) : null}
        </div>
      </div>

      <ModalChofer
        abierto={asignando}
        vehiculo={v}
        onCerrar={() => setAsignando(false)}
      />
    </>
  )
}

function Dato({ termino, valor }: { termino: string; valor: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3')}>
      <dt className="text-ink/45 shrink-0 text-xs">{termino}</dt>
      <dd className="text-ink/80 text-right">{valor}</dd>
    </div>
  )
}
