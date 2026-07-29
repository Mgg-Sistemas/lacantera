import { useMemo, useState } from 'react'
import { AlertTriangle, Plus, Scale } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { useGuardarParametro, useParametros } from '@/lib/api/nomina'
import type { Parametro } from '@/lib/api/nomina'
import { useMisRoles } from '@/lib/api/catalogo'
import { fecha } from '@/lib/formato'

const UNIDADES = [
  { valor: 'BS', etiqueta: 'Bolívares' },
  { valor: 'USD', etiqueta: 'Dólares' },
  { valor: 'PORCENTAJE', etiqueta: 'Porcentaje' },
  { valor: 'DIAS', etiqueta: 'Días' },
  { valor: 'HORAS', etiqueta: 'Horas' },
  { valor: 'VECES_SM', etiqueta: 'Veces el salario mínimo' },
  { valor: 'FACTOR', etiqueta: 'Factor' },
]

function valorLegible(p: Parametro): string {
  const n = Number(p.valor)
  const f = n.toLocaleString('es-VE', { maximumFractionDigits: 4 })
  if (p.unidad === 'PORCENTAJE') return `${f} %`
  if (p.unidad === 'BS') return `Bs ${f}`
  if (p.unidad === 'USD') return `$ ${f}`
  if (p.unidad === 'DIAS') return `${f} días`
  if (p.unidad === 'HORAS') return `${f} h`
  if (p.unidad === 'VECES_SM') return `${f} × salario mínimo`
  return f
}

export function Parametros() {
  const { data, isPending, error } = useParametros()
  const { puede } = useMisRoles()
  const guardar = useGuardarParametro()

  const [nuevo, setNuevo] = useState<null | {
    clave: string
    valor: string
    unidad: string
    desde: string
    descripcion: string
    fuente: string
  }>(null)

  const puedeRRHH = puede('RRHH')

  // Solo la vigencia viva de cada parámetro; las cerradas quedan detrás, que es
  // donde tienen que estar: sirven para recalcular el pasado, no para leerlas
  // todos los días.
  const vigentes = useMemo(() => {
    const vistas = new Set<string>()
    return (data ?? []).filter((p) => {
      if (vistas.has(p.clave)) return false
      vistas.add(p.clave)
      return true
    })
  }, [data])

  const historicos = (data ?? []).length - vigentes.length

  return (
    <>
      <PageHeader
        title="Parámetros de nómina"
        description="Ninguna cifra legal está escrita en el código. Todas viven aquí con su fecha de vigencia, porque en Venezuela cambian por decreto."
        actions={
          puedeRRHH ? (
            <Button
              icon={<Plus />}
              onClick={() =>
                setNuevo({
                  clave: '',
                  valor: '',
                  unidad: 'BS',
                  desde: '',
                  descripcion: '',
                  fuente: '',
                })
              }
            >
              Nueva vigencia
            </Button>
          ) : null
        }
      />

      <div className="border-warning/30 bg-warning-soft mb-4 flex items-start gap-2.5 rounded-[6px] border p-3.5">
        <AlertTriangle className="text-warning mt-px size-[18px] shrink-0" />
        <p className="text-ink/80 text-sm">
          El cestaticket y la base de la contribución de pensiones se anuncian sin publicarse en
          gaceta y <strong className="font-semibold">cambian con frecuencia</strong>. Conviene
          revisarlos cada mes: una nómina calculada con el monto viejo se paga corta.
        </p>
      </div>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {vigentes.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Parámetro</th>
                  <th className="px-3 py-3 text-right font-medium">Valor</th>
                  <th className="px-3 py-3 font-medium">Rige desde</th>
                  <th className="px-5 py-3 font-medium">Fuente</th>
                </tr>
              </thead>
              <tbody>
                {vigentes.map((p) => (
                  <tr key={p.id} className="border-hairline border-b align-top last:border-0">
                    <td className="px-5 py-3">
                      <p className="text-ink/85 font-medium">{p.descripcion}</p>
                      <p className="text-ink/40 font-mono text-xs">{p.clave}</p>
                    </td>
                    <td className="text-ink/85 tabular px-3 py-3 text-right font-medium whitespace-nowrap">
                      {valorLegible(p)}
                    </td>
                    <td className="text-ink/70 px-3 py-3 whitespace-nowrap">
                      {fecha(p.vigencia_desde)}
                      {p.vigencia_hasta ? (
                        <Chip tone="neutral" className="ml-2">
                          cerrada
                        </Chip>
                      ) : null}
                    </td>
                    <td className="text-ink/50 px-5 py-3 text-xs">{p.fuente ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {historicos > 0 ? (
            <p className="text-ink/40 border-hairline border-t px-5 py-3 text-xs">
              Hay {historicos} vigencia{historicos === 1 ? '' : 's'} anterior
              {historicos === 1 ? '' : 'es'} guardada{historicos === 1 ? '' : 's'}. No se borran:
              son las que permiten recalcular una nómina vieja con las cifras que regían entonces.
            </p>
          ) : null}
        </Card>
      ) : null}

      {nuevo ? (
        <Modal
          abierto
          onCerrar={() => setNuevo(null)}
          titulo="Nueva vigencia"
          descripcion="No sustituye el valor anterior: lo cierra el día antes y empieza uno nuevo."
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setNuevo(null)}>
                Cancelar
              </Button>
              <Button
                disabled={
                  guardar.isPending || !nuevo.clave || !nuevo.desde || !nuevo.descripcion
                }
                onClick={async () => {
                  await guardar.mutateAsync({ ...nuevo, valor: Number(nuevo.valor) })
                  setNuevo(null)
                }}
              >
                {guardar.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Select
              label="Parámetro"
              vacio="Elige cuál cambia"
              value={nuevo.clave}
              onChange={(e) => {
                const previo = (data ?? []).find((p) => p.clave === e.target.value)
                setNuevo((n) =>
                  n
                    ? {
                        ...n,
                        clave: e.target.value,
                        unidad: previo?.unidad ?? n.unidad,
                        descripcion: previo?.descripcion ?? '',
                      }
                    : n,
                )
              }}
              opciones={vigentes.map((p) => ({ valor: p.clave, etiqueta: p.descripcion }))}
            />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input
                label="Valor nuevo"
                type="number"
                step="0.0001"
                inputMode="decimal"
                value={nuevo.valor}
                onChange={(e) => setNuevo((n) => (n ? { ...n, valor: e.target.value } : n))}
              />
              <Select
                label="Unidad"
                value={nuevo.unidad}
                onChange={(e) => setNuevo((n) => (n ? { ...n, unidad: e.target.value } : n))}
                opciones={UNIDADES}
              />
            </div>
            <Input
              label="Rige desde"
              type="date"
              hint="La fecha del decreto, no la de hoy: los períodos anteriores conservan el valor viejo."
              value={nuevo.desde}
              onChange={(e) => setNuevo((n) => (n ? { ...n, desde: e.target.value } : n))}
            />
            <Input
              label="Descripción"
              value={nuevo.descripcion}
              onChange={(e) => setNuevo((n) => (n ? { ...n, descripcion: e.target.value } : n))}
            />
            <Input
              label="Fuente"
              placeholder="Decreto 4.805, G.O. 42.880"
              icon={<Scale />}
              value={nuevo.fuente}
              onChange={(e) => setNuevo((n) => (n ? { ...n, fuente: e.target.value } : n))}
            />
            {guardar.error ? <ErrorDeCarga error={guardar.error} /> : null}
          </div>
        </Modal>
      ) : null}
    </>
  )
}
