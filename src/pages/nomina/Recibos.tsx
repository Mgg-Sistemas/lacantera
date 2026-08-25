import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AlertTriangle, FileText, Printer } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_PERIODO } from '@/components/pestanasDeModulos'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { ESTADOS_PERIODO, useFirmaRrhh, usePeriodos, useRecibos } from '@/lib/api/nomina'
import type { Periodo, Recibo } from '@/lib/api/nomina'
import { useFirmas } from '@/lib/api/firmas'
import { useSesion } from '@/lib/sesion'
import { armarRecibo, armarRecibos } from '@/lib/ficha/reciboPdf'
import type { DatosRecibo, FirmaEmpresa, PdfArmado } from '@/lib/ficha/reciboPdf'
import { Visor } from '@/components/Visor'
import { bolivares, dolares, fecha } from '@/lib/formato'

/**
 * De lo que hay en pantalla a lo que va al papel.
 *
 * El PDF no recibe el registro tal cual: recibe lo que se imprime. Así el
 * documento no depende de cómo esté hecha la consulta hoy, y el día que cambie
 * un nombre de columna se corrige aquí y no dentro del dibujo del recibo.
 */
function paraImprimir(
  r: Recibo,
  periodo: Periodo,
  firma: FirmaEmpresa,
  emitidoPor: string,
  // Las firmas guardadas, por empleado. Las apagadas no llegan hasta aquí: se
  // filtran al leerlas, para que ningún papel tenga que acordarse de mirarlo.
  firmasGuardadas: Record<number, string> = {},
): DatosRecibo {
  return {
    periodo: periodo.numero,
    desde: periodo.desde,
    hasta: periodo.hasta,
    diasPagados: r.dias_pagados,
    diasFacturados: r.dias_facturados,
    diasLaborados: r.dias_laborados,

    ficha: r.empleado?.ficha ?? '—',
    cedula: r.empleado?.cedula ?? '—',
    nombreCompleto: `${r.empleado?.nombres ?? ''} ${r.empleado?.apellidos ?? ''}`.trim(),
    cargo: r.empleado?.cargo ?? '—',

    salarioBasicoDiario: r.salario_basico_diario,
    salarioNormalDiario: r.salario_normal_diario,
    salarioIntegralDiario: r.salario_integral_diario,

    lineas: r.lineas.map((l) => ({
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      monto: l.monto,
      tipo: l.tipo,
      orden: l.orden,
    })),
    totalAsignaciones: r.total_asignaciones,
    totalDeducciones: r.total_deducciones,
    neto: r.neto,
    netoUsd: r.neto_usd,

    formaPago: r.empleado?.forma_pago ?? 'EFECTIVO',
    banco: r.empleado?.banco ?? null,
    numeroCuenta: r.empleado?.numero_cuenta ?? null,

    firma,
    emitidoPor,
    firmaTrabajador: firmasGuardadas[r.empleado_id] ?? null,
  }
}

export function Recibos() {
  const [params, setParams] = useSearchParams()
  const { data: periodos } = usePeriodos()
  const { firma } = useFirmaRrhh()
  const { data: firmas } = useFirmas()
  const { nombre } = useSesion()

  const periodoId = params.get('periodo') ? Number(params.get('periodo')) : undefined
  const periodo = (periodos ?? []).find((p) => p.id === periodoId)

  const { data, isPending, error } = useRecibos(periodoId)
  const [abierto, setAbierto] = useState<Recibo | null>(null)
  const [imprimiendo, setImprimiendo] = useState(false)
  // Se enseña antes de descargarlo: un recibo con la firma sin llenar o el
  // periodo equivocado se ve en dos segundos y no llega al papel.
  const [vista, setVista] = useState<(PdfArmado & { cuantos: number }) | null>(null)

  const ordenados = [...(data ?? [])].sort((a, b) =>
    `${a.empleado?.apellidos}`.localeCompare(`${b.empleado?.apellidos}`),
  )

  const sacar = async (recibos: Recibo[]) => {
    if (!periodo) return
    setImprimiendo(true)
    try {
      const hojas = recibos.map((r) =>
        paraImprimir(r, periodo, firma, nombre, firmas?.porEmpleado ?? {}),
      )
      const pdf =
        hojas.length === 1 ? await armarRecibo(hojas[0]) : await armarRecibos(hojas, periodo.numero)
      setVista({ ...pdf, cuantos: hojas.length })
    } finally {
      setImprimiendo(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Recibos de pago"
        description="El recibo es un documento con consecuencias legales: sin él, en un juicio se presume cierto lo que alegue el trabajador."
      />

      <Pestanas pestanas={PESTANAS_PERIODO} />

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

      {/*
        Se avisa antes de imprimir, no después: un lote de cuarenta recibos con
        el renglón de la firma vacío se reparte igual, y el error se descubre
        cuando ya están repartidos.

        Antes este aviso decía «Nómina → Parámetros → RRHH_FIRMA_NOMBRE». Dos
        cosas iban mal. La ruta ya no existe —Parámetros es hoy una pestaña
        dentro de Prestaciones—, así que mandaba a un sitio que no está; y
        `RRHH_FIRMA_NOMBRE` es el nombre que el dato tiene por dentro, no algo
        que nadie vaya a buscar. Enseñar la llave interna a quien solo quiere
        arreglarlo es pedirle que traduzca.

        Ahora lleva. Un aviso que dice qué hacer y no cómo llegar es medio
        aviso.
      */}
      {ordenados.length > 0 && !firma.nombre ? (
        <Card className="border-warning/40 bg-warning-soft mb-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <AlertTriangle className="text-warning size-[18px] shrink-0" />
            <p className="text-ink/75 min-w-0 flex-1 text-sm">
              Falta decir <strong className="font-medium">quién firma por la empresa</strong>.
              Los recibos saldrían con ese renglón en blanco.
            </p>
            <Link to="/app/nomina/parametros">
              <Button size="sm" variant="outline">
                Ponerlo ahora
              </Button>
            </Link>
          </div>
        </Card>
      ) : null}

      {ordenados.length > 0 ? (
        <Card flush>
          <div className="border-hairline flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
            {/* Se dice qué sale, no cuántas hojas: si el recibo trae muchos
                conceptos la copia se va a una hoja aparte, y prometer "dos por
                hoja" sería mentira la mitad de las veces. */}
            <p className="text-ink/55 text-sm">
              {ordenados.length} {ordenados.length === 1 ? 'recibo' : 'recibos'} · cada uno con su
              copia, para firmar a mano
            </p>
            <Button
              variant="outline"
              icon={<Printer />}
              disabled={imprimiendo}
              onClick={() => void sacar(ordenados)}
            >
              {imprimiendo ? 'Preparando…' : 'Imprimir todos'}
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Trabajador</th>
                  <th className="px-3 py-3 text-right font-medium">Días</th>
                  <th className="px-3 py-3 text-right font-medium">Asignaciones</th>
                  <th className="px-3 py-3 text-right font-medium">Deducciones</th>
                  <th className="px-3 py-3 text-right font-medium">Neto</th>
                  <th className="px-5 py-3 font-medium">
                    <span className="sr-only">Recibo</span>
                  </th>
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
                    <td className="px-3 py-3 text-right">
                      <span className="text-ink/90 tabular font-semibold whitespace-nowrap">
                        {bolivares(r.neto)}
                      </span>
                      <span className="text-ink/40 tabular block text-xs">
                        {dolares(r.neto_usd)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        title={`Recibo de ${r.empleado?.nombres} ${r.empleado?.apellidos}`}
                        aria-label={`Imprimir el recibo de ${r.empleado?.nombres} ${r.empleado?.apellidos}`}
                        disabled={imprimiendo}
                        // El clic de la fila abre el detalle; este saca el papel
                        // directamente. Sin detenerlo aquí, haría las dos cosas.
                        onClick={(e) => {
                          e.stopPropagation()
                          void sacar([r])
                        }}
                        className="text-ink/45 hover:bg-ink/8 hover:text-royal-600 rounded-[6px] p-1.5 transition-colors disabled:opacity-40"
                      >
                        <Printer className="size-[17px]" />
                      </button>
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
              <Button
                icon={<Printer />}
                disabled={imprimiendo}
                onClick={() => void sacar([abierto])}
              >
                {imprimiendo ? 'Preparando…' : 'Imprimir recibo'}
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
      <Visor
        abierto={vista !== null}
        onCerrar={() => setVista(null)}
        blob={vista?.blob ?? null}
        nombreArchivo={vista?.nombre ?? 'recibo.pdf'}
        titulo={vista && vista.cuantos > 1 ? `Recibos del periodo ${periodo?.numero ?? ''}` : 'Recibo de pago'}
        descripcion={
          vista
            ? `${vista.cuantos} recibo${vista.cuantos === 1 ? '' : 's'} · original y copia, para firmar a mano`
            : undefined
        }
      />

    </>
  )
}
