import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { FileText, Printer } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { ESTADOS_PERIODO, usePeriodos, useRecibos } from '@/lib/api/nomina'
import type { Recibo } from '@/lib/api/nomina'
import { bolivares, dolares, fecha } from '@/lib/formato'

export function Recibos() {
  const [params, setParams] = useSearchParams()
  const { data: periodos } = usePeriodos()

  const periodoId = params.get('periodo') ? Number(params.get('periodo')) : undefined
  const periodo = (periodos ?? []).find((p) => p.id === periodoId)

  const { data, isPending, error } = useRecibos(periodoId)
  const [abierto, setAbierto] = useState<Recibo | null>(null)

  const ordenados = [...(data ?? [])].sort((a, b) =>
    `${a.empleado?.apellidos}`.localeCompare(`${b.empleado?.apellidos}`),
  )

  return (
    <>
      <PageHeader
        title="Recibos de pago"
        description="El recibo es un documento con consecuencias legales: sin él, en un juicio se presume cierto lo que alegue el trabajador."
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1 sm:max-w-md">
            <Select
              label="Período"
              vacio="Elige el período"
              value={periodoId ? String(periodoId) : ''}
              onChange={(e) => setParams(e.target.value ? { periodo: e.target.value } : {})}
              opciones={(periodos ?? [])
                .filter((p) => Number(p.recibos ?? 0) > 0)
                .map((p) => ({
                  valor: String(p.id),
                  etiqueta: `${p.numero} · ${fecha(p.desde)} al ${fecha(p.hasta)}`,
                }))}
            />
          </div>
          {periodo ? (
            <Chip tone={ESTADOS_PERIODO[periodo.estado].tono}>
              {ESTADOS_PERIODO[periodo.estado].texto}
            </Chip>
          ) : null}
        </div>
      </Card>

      {!periodo ? (
        <Card>
          <Vacio
            icono={<FileText />}
            titulo="Elige un período"
            descripcion="Los recibos aparecen cuando la nómina está calculada."
          />
        </Card>
      ) : null}

      {isPending && periodoId ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {ordenados.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Trabajador</th>
                  <th className="px-3 py-3 text-right font-medium">Días</th>
                  <th className="px-3 py-3 text-right font-medium">Asignaciones</th>
                  <th className="px-3 py-3 text-right font-medium">Deducciones</th>
                  <th className="px-5 py-3 text-right font-medium">Neto</th>
                </tr>
              </thead>
              <tbody>
                {ordenados.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setAbierto(r)}
                    className="border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors last:border-0"
                  >
                    <td className="px-5 py-3">
                      <p className="text-ink/85 font-medium">
                        {r.empleado?.apellidos}, {r.empleado?.nombres}
                      </p>
                      <p className="text-ink/45 text-xs">
                        {r.empleado?.cedula} · {r.empleado?.cargo}
                      </p>
                    </td>
                    <td className="text-ink/70 tabular px-3 py-3 text-right">{r.dias_pagados}</td>
                    <td className="text-ink/70 tabular px-3 py-3 text-right">
                      {bolivares(r.total_asignaciones)}
                    </td>
                    <td className="text-ink/70 tabular px-3 py-3 text-right">
                      {bolivares(r.total_deducciones)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-ink/90 tabular font-semibold whitespace-nowrap">
                        {bolivares(r.neto)}
                      </span>
                      <span className="text-ink/40 tabular block text-xs">
                        {dolares(r.neto_usd)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* ---------------------------- Recibo ---------------------------- */}
      {abierto ? (
        <Modal
          abierto
          onCerrar={() => setAbierto(null)}
          titulo={`${abierto.empleado?.nombres} ${abierto.empleado?.apellidos}`}
          descripcion={`${periodo?.numero} · ${fecha(periodo?.desde ?? null)} al ${fecha(periodo?.hasta ?? null)} · ${abierto.dias_pagados} días`}
          ancho="md"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setAbierto(null)}>
                Cerrar
              </Button>
              <Button icon={<Printer />} onClick={() => window.print()}>
                Imprimir
              </Button>
            </>
          }
        >
          <div className="space-y-5">
            <dl className="border-hairline bg-canvas rounded-card grid gap-3 border p-3 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-ink/45">Salario básico diario</dt>
                <dd className="text-ink/80 tabular">{bolivares(abierto.salario_basico_diario)}</dd>
              </div>
              <div>
                <dt className="text-ink/45">Salario normal diario</dt>
                <dd className="text-ink/80 tabular">{bolivares(abierto.salario_normal_diario)}</dd>
              </div>
              <div>
                <dt className="text-ink/45">Salario integral diario</dt>
                <dd className="text-ink/80 tabular">
                  {bolivares(abierto.salario_integral_diario)}
                </dd>
              </div>
            </dl>

            {(['ASIGNACION', 'DEDUCCION', 'APORTE', 'PROVISION'] as const).map((tipo) => {
              const lineas = abierto.lineas
                .filter((l) => l.tipo === tipo)
                .sort((a, b) => a.orden - b.orden)
              if (lineas.length === 0) return null

              const titulos = {
                ASIGNACION: 'Lo que se gana',
                DEDUCCION: 'Lo que se descuenta',
                APORTE: 'Aportes del patrono',
                PROVISION: 'Se aparta para prestaciones',
              }

              const notas = {
                ASIGNACION: null,
                DEDUCCION: null,
                APORTE: 'No se le descuentan al trabajador: son costo de la empresa.',
                PROVISION: 'Se acumula a su favor. No sale de su pago.',
              }

              return (
                <div key={tipo}>
                  <h3 className="text-ink/75 text-sm font-semibold">{titulos[tipo]}</h3>
                  {notas[tipo] ? (
                    <p className="text-ink/45 mb-1 text-xs">{notas[tipo]}</p>
                  ) : null}
                  <ul className="mt-1.5 divide-y divide-[color:var(--color-hairline,rgba(0,0,0,.08))]">
                    {lineas.map((l) => (
                      <li key={l.id} className="flex items-baseline justify-between gap-3 py-1.5">
                        <span className="text-ink/70 min-w-0 text-sm">
                          {l.descripcion}
                          {l.cantidad ? (
                            <span className="text-ink/40 text-xs"> · {Number(l.cantidad)}</span>
                          ) : null}
                        </span>
                        <span className="text-ink/85 tabular shrink-0 text-sm">
                          {bolivares(l.monto)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}

            <div className="border-hairline flex items-baseline justify-between border-t pt-3">
              <span className="text-ink/80 font-medium">Neto a cobrar</span>
              <div className="text-right">
                <p className="text-safety tabular text-xl font-semibold">
                  {bolivares(abierto.neto)}
                </p>
                <p className="text-ink/40 tabular text-xs">{dolares(abierto.neto_usd)}</p>
              </div>
            </div>

            <p className="text-ink/40 text-xs">
              {abierto.empleado?.forma_pago === 'TRANSFERENCIA' && abierto.empleado?.banco
                ? `Se le paga por transferencia a ${abierto.empleado.banco} · ${abierto.empleado.numero_cuenta ?? ''}`
                : `Forma de pago: ${abierto.empleado?.forma_pago?.toLowerCase()}`}
            </p>
          </div>
        </Modal>
      ) : null}
    </>
  )
}
