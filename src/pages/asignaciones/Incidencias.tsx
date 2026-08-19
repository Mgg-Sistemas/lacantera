import { useState } from 'react'
import { HandCoins, Wrench } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import {
  MOTIVOS_SALDO,
  useAsignaciones,
  useIncidenciasAbiertas,
  useResolverIncidencia,
  type Asignacion,
} from '@/lib/api/asignaciones'
import { useMisRoles } from '@/lib/api/catalogo'
import { dolares, fecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

/**
 * Lo que se perdió o se dañó y sigue sin resolverse.
 *
 * POR QUÉ NO VIVE EN NÓMINA
 *
 * Estuvo ahí un rato y era un error de encuadre. Se puso pensando en el caso
 * de la herramienta que se le descuenta a alguien, y con ese caso en la cabeza
 * parecía un asunto de quien paga. Pero si lo roto es una silla de oficina, la
 * decisión no es de nómina — y el módulo tampoco puede depender de que a
 * alguien se le vaya a descontar algo.
 *
 * Descontar es una de las tres salidas, no la naturaleza del asunto. Por eso
 * vive con las asignaciones, que es de donde viene.
 *
 * Mientras no se resuelva, aparece. Al resolverse, desaparece sola. Nadie
 * tiene que acordarse de tacharla de una lista.
 */
export function Incidencias() {
  const { data, isPending, error } = useIncidenciasAbiertas()
  const perdidas = useAsignaciones({ estado: 'PERDIDA' })
  const { puede } = useMisRoles()
  const [saldando, setSaldando] = useState<Asignacion | null>(null)

  // Lo resuelve quien administra o quien lleva personal: una silla rota por
  // accidente no la decide nómina, y con el permiso de nómina puesto el
  // almacenista no podía cerrar ni los casos que le tocan.
  const puedeSaldar = puede('ADMIN') || puede('RRHH') || puede('ALMACEN')
  const total = (data ?? []).reduce((s, p) => s + Number(p.costo_usd), 0)

  return (
    <>
      <PageHeader
        title="Incidencias"
        description="Bienes perdidos o dañados que siguen sin resolverse. Falta decidir qué pasa con quien los tenía."
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {!isPending && (data ?? []).length === 0 ? (
        <Card>
          <Vacio
            icono={<Wrench />}
            titulo="No hay nada pendiente"
            descripcion="Cuando una herramienta se reporte como perdida, aparecerá aquí a nombre de quien la tenía."
          />
        </Card>
      ) : null}

      {(data ?? []).length > 0 ? (
        <>
          <Card className="mb-4">
            <p className="text-ink/70 text-sm">
              <strong className="text-ink/90 font-semibold">{(data ?? []).length}</strong>{' '}
              trabajador{(data ?? []).length === 1 ? '' : 'es'} con bienes sin resolver, por{' '}
              <span className="tabular text-ink/90 font-semibold">{dolares(total)}</span> en total.
            </p>
          </Card>

          <div className="grid gap-3">
            {(data ?? []).map((p) => {
              const suyas = (perdidas.data ?? []).filter((a) => a.empleado_id === p.empleado_id)

              return (
                <Card key={p.empleado_id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="text-ink/90 text-sm font-semibold">{p.empleado}</p>
                      <p className="text-ink/45 text-xs">
                        Ficha {p.ficha} · {p.cedula}
                        {p.cargo ? ` · ${p.cargo}` : ''}
                      </p>
                    </div>
                    <p className="tabular text-ink/85 text-sm font-semibold">
                      {dolares(p.costo_usd)}
                    </p>
                  </div>

                  <ul className="divide-hairline mt-3 divide-y">
                    {suyas.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5">
                        <div className="min-w-0 grow">
                          <p className="text-ink/85 text-sm">
                            <span className="tabular font-medium">{Number(a.cantidad)}</span>{' '}
                            {a.articulo}
                            {a.costo_usd ? (
                              <span className="text-ink/50"> · {dolares(a.costo_usd)}</span>
                            ) : null}
                          </p>
                          <p className="text-ink/45 text-xs">
                            {a.fecha_perdida ? `Se reportó el ${fecha(a.fecha_perdida)}` : ''}
                            {a.almacen ? ` · salió de ${a.almacen}` : ''}
                          </p>
                          {/* El motivo va entero: es lo que separa un descuido
                              de un accidente de trabajo, y de eso depende si se
                              cobra. */}
                          {a.motivo ? (
                            <p className="text-ink/65 mt-1 text-sm leading-relaxed">{a.motivo}</p>
                          ) : null}
                        </div>

                        {puedeSaldar ? (
                          <Button
                            size="sm"
                            variant="outline"
                            icon={<HandCoins />}
                            onClick={() => setSaldando(a)}
                          >
                            Resolver
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </Card>
              )
            })}
          </div>
        </>
      ) : null}

      <ModalSaldar asignacion={saldando} onCerrar={() => setSaldando(null)} />
    </>
  )
}

/**
 * Cómo se cierra una pérdida.
 *
 * REPONER NO SUMA AL INVENTARIO DESDE AQUÍ
 *
 * Si la persona trae una llave nueva, esa llave entra por donde entra todo lo
 * que llega —una recepción o un ajuste por conteo—. Sumarla desde esta
 * pantalla sería una segunda puerta al mismo almacén, y dos puertas es como se
 * cuenta dos veces la misma herramienta.
 */
function ModalSaldar({
  asignacion,
  onCerrar,
}: {
  asignacion: Asignacion | null
  onCerrar: () => void
}) {
  const saldar = useResolverIncidencia()
  const [como, setComo] = useState<'DESCUENTO' | 'REPOSICION' | 'EXONERADO'>('DESCUENTO')
  const [nota, setNota] = useState('')

  if (!asignacion) return null

  const enviar = async () => {
    await saldar.mutateAsync({ id: asignacion.id, como, nota: nota.trim() || null })
    setNota('')
    onCerrar()
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`${asignacion.articulo} · ${asignacion.empleado}`}
      descripcion={
        asignacion.costo_usd
          ? `Costaba ${dolares(asignacion.costo_usd)} el día que se perdió.`
          : undefined
      }
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={saldar.isPending}>
            {saldar.isPending ? 'Guardando…' : 'Cerrar el caso'}
          </Button>
        </>
      }
    >
      <div className="grid gap-2">
        {MOTIVOS_SALDO.map((m) => (
          <button
            key={m.valor}
            type="button"
            onClick={() => setComo(m.valor as typeof como)}
            className={cn(
              'rounded-card border p-3 text-left transition-colors',
              como === m.valor
                ? 'border-royal-600 bg-royal-600/5'
                : 'border-hairline hover:border-royal-300',
            )}
          >
            <p className="text-ink/90 text-sm font-medium">{m.etiqueta}</p>
            <p className="text-ink/50 mt-0.5 text-xs leading-relaxed">{m.detalle}</p>
          </button>
        ))}
      </div>

      <div className="mt-4">
        <Textarea
          label="Nota"
          rows={2}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          hint="Queda en el registro de la asignación."
        />
      </div>

      {como === 'DESCUENTO' ? (
        <p className="border-hairline text-ink/60 mt-4 rounded-[6px] border border-dashed p-3 text-sm leading-relaxed">
          Esto marca el caso como resuelto, no aplica la deducción: el descuento se carga en las
          novedades del período, que es donde la nómina lo calcula.
        </p>
      ) : null}

      {saldar.error ? <ErrorDeCarga error={saldar.error} className="mt-3" /> : null}
    </Modal>
  )
}
