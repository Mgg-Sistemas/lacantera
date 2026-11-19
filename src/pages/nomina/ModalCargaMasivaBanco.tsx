import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  Download,
  FileSpreadsheet,
  FileText,
  MapPin,
  Users,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Chip } from '@/components/ui/Chip'
import {
  useCargasDeEmpleados,
  useEmpleados,
  useFirmaRrhh,
  type Empleado,
} from '@/lib/api/nomina'
import {
  combinarEmpleadoConExtras,
  useConfigBancoTesoro,
} from '@/lib/api/bancoTesoro'
import { empresaDelPapel, useEmpresa } from '@/lib/api/empresa'
import { useTasaVigente } from '@/lib/api/tasas'
import { useSesion } from '@/lib/sesion'
import { bolivares, documento } from '@/lib/formato'
import {
  AGENCIAS_BT,
  TIPOS_CUENTA_NOMINA_BT,
  TIPOS_SOLICITUD_BT,
} from '@/lib/bancoTesoro/catalogos'
import {
  construirFilasCargaMasiva44,
  descargarBlob,
  generarCargaMasivaCsv,
  generarCargaMasivaTxt,
  generarCargaMasivaXlsx,
} from '@/lib/bancoTesoro/formatos'
import { armarCargaMasivaBancoPdf } from '@/lib/ficha/cargaMasivaBancoPdf'
import type { PdfArmado } from '@/lib/ficha/reciboPdf'

interface Props {
  abierto: boolean
  onCerrar: () => void
  filtradosActuales: Empleado[]
  onVerPdf: (pdf: PdfArmado & { titulo: string; descripcion: string }) => void
}

type AlcanceCarga =
  | 'SIN_CUENTA_0163'
  | 'ACTIVOS_FILTRADOS'
  | 'TODOS_ACTIVOS'
  | 'DESINCORPORADOS'

export function ModalCargaMasivaBanco({
  abierto,
  onCerrar,
  filtradosActuales,
  onVerPdf,
}: Props) {
  const { nombre: usuarioNombre } = useSesion()
  const { data: empresa } = useEmpresa()
  const { firma } = useFirmaRrhh()
  const { data: todosEmpleados } = useEmpleados(false)
  const { data: cargas } = useCargasDeEmpleados()
  const { data: tasaVigente } = useTasaVigente('USD', 'BCV')
  const configBt = useConfigBancoTesoro()

  const [tipoSolicitud, setTipoSolicitud] = useState<'I' | 'M' | 'D'>('I')
  const [alcance, setAlcance] = useState<AlcanceCarga>('SIN_CUENTA_0163')
  const [correlativoInicial, setCorrelativoInicial] = useState('1')
  const [tipoCuentaDefecto, setTipoCuentaDefecto] = useState<'VI01' | 'CCVI'>('VI01')
  const [agenciaModo, setAgenciaModo] = useState('') // '' = automática más cercana a la dirección
  const [excluidos, setExcluidos] = useState<Set<number>>(new Set())
  const [procesando, setProcesando] = useState(false)

  useEffect(() => {
    if (!abierto) return
    setExcluidos(new Set())
    const activos = (todosEmpleados ?? []).filter((e) => e.activo)
    const sinTesoro = activos.filter(
      (e) => !(e.numero_cuenta ?? '').replace(/\D/g, '').startsWith('0163'),
    )
    setAlcance(sinTesoro.length > 0 ? 'SIN_CUENTA_0163' : 'ACTIVOS_FILTRADOS')
    setCorrelativoInicial('1')
  }, [abierto, todosEmpleados])

  const dependientesPorEmpleado = useMemo(() => {
    const m = new Map<number, number>()
    for (const c of cargas ?? []) m.set(c.empleado_id, c.dependientes ?? 0)
    return m
  }, [cargas])

  const empleadosCandidatos = useMemo(() => {
    const todos = todosEmpleados ?? []
    let base: Empleado[] = []
    if (alcance === 'SIN_CUENTA_0163') {
      base = todos.filter(
        (e) => e.activo && !(e.numero_cuenta ?? '').replace(/\D/g, '').startsWith('0163'),
      )
    } else if (alcance === 'ACTIVOS_FILTRADOS') {
      base = filtradosActuales
    } else if (alcance === 'TODOS_ACTIVOS') {
      base = todos.filter((e) => e.activo)
    } else {
      base = todos.filter((e) => !e.activo)
    }
    return base.map((e) => combinarEmpleadoConExtras(e, configBt.extrasPorEmpleado))
  }, [alcance, todosEmpleados, filtradosActuales, configBt.extrasPorEmpleado])

  const tasaUsd = Number(tasaVigente?.tasa ?? 0) || 1
  const corrInicioNum = Math.max(1, Math.floor(Number(correlativoInicial) || 1))

  const domicilioEmpresaCompuesto = useMemo(
    () =>
      [empresa?.domicilio_fiscal, empresa?.ciudad, empresa?.estado]
        .filter(Boolean)
        .join(' ') || 'NAIGUATA LA GUAIRA',
    [empresa],
  )

  const filasBase = useMemo(
    () =>
      construirFilasCargaMasiva44({
        empleados: empleadosCandidatos,
        dependientesPorEmpleado,
        tasaUsdActual: tasaUsd,
        correlativoInicial: corrInicioNum,
        tipoSolicitud,
        tipoCuentaPorDefecto: tipoCuentaDefecto,
        agenciaForzada: agenciaModo || undefined,
        domicilioEmpresa: domicilioEmpresaCompuesto,
        correoRespaldoEmpresa: empresa?.correo ?? null,
        telefonoRespaldoEmpresa: empresa?.telefono ?? null,
      }),
    [
      empleadosCandidatos,
      dependientesPorEmpleado,
      tasaUsd,
      corrInicioNum,
      tipoSolicitud,
      tipoCuentaDefecto,
      agenciaModo,
      domicilioEmpresaCompuesto,
      empresa?.correo,
      empresa?.telefono,
    ],
  )

  // Renumerar correlativo cliente (col 2: 1, 2, 3...) solo para los seleccionados
  const filasNumeradas = useMemo(() => {
    let seq = corrInicioNum
    return filasBase.map((f) => {
      if (excluidos.has(f.empleadoId)) return f
      const actual = seq++
      const cols = [...f.columnas44]
      cols[1] = String(actual)
      return {
        ...f,
        correlativoCliente: actual,
        columnas44: cols,
      }
    })
  }, [filasBase, excluidos, corrInicioNum])

  const seleccionadas = useMemo(
    () => filasNumeradas.filter((f) => !excluidos.has(f.empleadoId)),
    [filasNumeradas, excluidos],
  )

  const alternarEmpleado = (id: number) => {
    setExcluidos((prev) => {
      const sig = new Set(prev)
      if (sig.has(id)) sig.delete(id)
      else sig.add(id)
      return sig
    })
  }

  const nombreArchivoBase = `1-formato-carga-masiva-bt-${tipoSolicitud.toLowerCase()}`

  const exportarXlsx = () => {
    if (seleccionadas.length === 0) return
    const papel = empresaDelPapel(empresa)
    const blob = generarCargaMasivaXlsx(seleccionadas, {
      empresaNombre: papel.razonSocial,
      empresaRif: papel.rif,
      tipoSolicitud,
      tasaUsd,
    })
    descargarBlob(blob, `${nombreArchivoBase}.xlsx`)
  }

  const exportarCsv = () => {
    if (seleccionadas.length === 0) return
    const blob = generarCargaMasivaCsv(seleccionadas)
    descargarBlob(blob, `${nombreArchivoBase}.csv`)
  }

  const exportarTxt = () => {
    if (seleccionadas.length === 0) return
    const blob = generarCargaMasivaTxt(seleccionadas)
    descargarBlob(blob, `${nombreArchivoBase}.txt`)
  }

  const exportarPdf = async () => {
    if (seleccionadas.length === 0) return
    setProcesando(true)
    try {
      const pdf = await armarCargaMasivaBancoPdf({
        filas: seleccionadas,
        tipoSolicitud,
        tasaUsd,
        empresa: empresaDelPapel(empresa),
        emitidoPor: usuarioNombre,
        firmaRrhh: firma.nombre || null,
        momento: new Date(),
      })
      onCerrar()
      onVerPdf({
        ...pdf,
        titulo: 'Carga masiva — Banco del Tesoro (44 columnas)',
        descripcion: `${seleccionadas.length} trabajadores · movimiento ${tipoSolicitud} · correlativos ${seleccionadas[0].correlativoCliente} al ${seleccionadas.at(-1)!.correlativoCliente}`,
      })
    } finally {
      setProcesando(false)
    }
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="xl"
      titulo="Carga masiva Banco del Tesoro · Moneda Nacional (44 columnas)"
      descripcion="Genera la plantilla maestra de apertura, actualización o desincorporación de cuentas nómina con los códigos oficiales del banco y la agencia más cercana al domicilio."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar} disabled={procesando}>
            Cerrar
          </Button>
          <Button
            variant="outline"
            icon={<FileSpreadsheet />}
            disabled={procesando || seleccionadas.length === 0}
            onClick={exportarXlsx}
          >
            Excel 44 col. (.xlsx)
          </Button>
          <Button
            variant="outline"
            icon={<Download />}
            disabled={procesando || seleccionadas.length === 0}
            onClick={exportarCsv}
          >
            CSV (.csv)
          </Button>
          <Button
            variant="outline"
            icon={<Download />}
            disabled={procesando || seleccionadas.length === 0}
            onClick={exportarTxt}
          >
            TXT (.txt)
          </Button>
          <Button
            icon={<FileText />}
            disabled={procesando || seleccionadas.length === 0}
            onClick={() => void exportarPdf()}
          >
            {procesando ? 'Preparando…' : 'PDF (.pdf)'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Select
            label="Tipo de solicitud (Col. 44)"
            value={tipoSolicitud}
            onChange={(e) => {
              const v = e.target.value as 'I' | 'M' | 'D'
              setTipoSolicitud(v)
              if (v === 'D') setAlcance('DESINCORPORADOS')
              setExcluidos(new Set())
            }}
            opciones={TIPOS_SOLICITUD_BT.map((x) => ({
              valor: x.codigo,
              etiqueta: `${x.codigo} — ${x.nombre}`,
            }))}
          />

          <Select
            label="Personal a incluir"
            value={alcance}
            onChange={(e) => {
              setAlcance(e.target.value as AlcanceCarga)
              setExcluidos(new Set())
            }}
            opciones={[
              { valor: 'SIN_CUENTA_0163', etiqueta: 'Activos sin cuenta 0163' },
              { valor: 'ACTIVOS_FILTRADOS', etiqueta: 'Lista filtrada en pantalla' },
              { valor: 'TODOS_ACTIVOS', etiqueta: 'Todo el personal activo' },
              { valor: 'DESINCORPORADOS', etiqueta: 'Personal desincorporado' },
            ]}
          />

          <Input
            label="Correlativo cliente desde"
            type="number"
            limite={{ maxEnteros: 6, maxDecimales: 0, sinNegativos: true }}
            value={correlativoInicial}
            onChange={(e) => setCorrelativoInicial(e.target.value)}
            hint="Columna 2: 1, 2, 3…"
          />

          <Select
            label="Tipo de cuenta (Col. 38)"
            value={tipoCuentaDefecto}
            onChange={(e) => setTipoCuentaDefecto(e.target.value as 'VI01' | 'CCVI')}
            opciones={TIPOS_CUENTA_NOMINA_BT.map((x) => ({
              valor: x.codigo,
              etiqueta: x.nombre,
            }))}
          />

          <Select
            label="Agencia bancaria (Cols. 42-43)"
            vacio="Automática (más cercana a dirección)"
            value={agenciaModo}
            onChange={(e) => setAgenciaModo(e.target.value)}
            opciones={AGENCIAS_BT.map((a) => ({
              valor: a.codigo,
              etiqueta: `${a.codigo} · ${a.nombre}`,
            }))}
          />
        </div>

        {/* Resumen rápido */}
        <div className="border-hairline bg-canvas flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <span>
              Seleccionados: <strong className="text-ink/90">{seleccionadas.length}</strong> de{' '}
              {filasBase.length}
            </span>
            <span>
              Correlativos cliente:{' '}
              <strong className="text-ink/90 font-mono">
                {seleccionadas.length > 0
                  ? `${seleccionadas[0].correlativoCliente} al ${seleccionadas.at(-1)!.correlativoCliente}`
                  : '—'}
              </strong>
            </span>
            <span>
              Tasa BCV conversión sueldo:{' '}
              <strong className="text-ink/90 tabular">Bs {tasaUsd.toFixed(4)} / $</strong>
            </span>
          </div>
          <span className="text-ink/55 flex items-center gap-1">
            <MapPin className="size-3.5" />
            {agenciaModo
              ? `Agencia fija: ${agenciaModo}`
              : 'Agencia calculada según dirección de cada ficha'}
          </span>
        </div>

        {/* Tabla de vista previa de las 44 columnas resumidas */}
        <div className="border-hairline max-h-80 overflow-auto rounded-lg border">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="bg-canvas sticky top-0 z-10">
              <tr className="text-ink/50 border-hairline border-b text-left">
                <th className="w-9 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={filasBase.length > 0 && seleccionadas.length === filasBase.length}
                    onChange={(e) =>
                      setExcluidos(
                        e.target.checked
                          ? new Set()
                          : new Set(filasBase.map((x) => x.empleadoId)),
                      )
                    }
                    className="accent-brand size-3.5 rounded"
                  />
                </th>
                <th className="px-2 py-2 font-medium">#</th>
                <th className="px-2 py-2 font-medium">Trabajador y cédula</th>
                <th className="px-2 py-2 font-medium">Códigos cargo / prof.</th>
                <th className="px-2 py-2 font-medium">Agencia cercana y ubicación</th>
                <th className="px-2 py-2 text-right font-medium">Sueldo básico Bs</th>
                <th className="px-3 py-2 font-medium">Estado ficha</th>
              </tr>
            </thead>
            <tbody>
              {filasNumeradas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-ink/50 px-4 py-8 text-center">
                    <Users className="text-ink/30 mx-auto mb-1.5 size-5" />
                    No hay trabajadores en este filtro. Prueba cambiar «Personal a incluir» arriba.
                  </td>
                </tr>
              ) : (
                filasNumeradas.map((f) => {
                  const activo = !excluidos.has(f.empleadoId)
                  return (
                    <tr
                      key={f.empleadoId}
                      className={`border-hairline border-b last:border-0 ${
                        activo ? 'hover:bg-ink/3' : 'opacity-45'
                      }`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={activo}
                          onChange={() => alternarEmpleado(f.empleadoId)}
                          className="accent-brand size-3.5 rounded"
                        />
                      </td>
                      <td className="px-2 py-2 font-mono">{activo ? f.correlativoCliente : '—'}</td>
                      <td className="px-2 py-2">
                        <p className="text-ink/85 font-medium">{f.nombreCompleto}</p>
                        <p className="text-ink/45">
                          {documento(f.cedulaMostrar)} · Ficha {f.ficha}
                        </p>
                      </td>
                      <td className="px-2 py-2">
                        <p className="text-ink/80">{f.cargoMostrar}</p>
                        <p className="text-ink/45 font-mono text-[10px]">
                          Cargo {f.columnas44[40]} · Prof {f.columnas44[32]} · {f.tipoCuentaNomina}
                        </p>
                      </td>
                      <td className="px-2 py-2">
                        <p className="text-ink/85 font-medium">
                          {f.ubicacionResuelta.agencia} · {f.ubicacionResuelta.agenciaNombre}
                        </p>
                        <p className="text-ink/45 font-mono text-[10px]">
                          Edo {f.ubicacionResuelta.estado} · Parr {f.ubicacionResuelta.parroquia} · ZP{' '}
                          {f.ubicacionResuelta.zonaPostal}
                        </p>
                      </td>
                      <td className="tabular px-2 py-2 text-right font-medium">
                        {bolivares(f.sueldoMensualBs)}
                      </td>
                      <td className="px-3 py-2">
                        {f.errores.length > 0 ? (
                          <div className="space-y-0.5">
                            <Chip tone="danger">{f.errores[0]}</Chip>
                            <div>
                              <Link
                                to={`/app/nomina/personal/${f.empleadoId}/editar`}
                                onClick={onCerrar}
                                className="text-brand text-[11px] underline"
                              >
                                Editar ficha
                              </Link>
                            </div>
                          </div>
                        ) : f.advertencias.length > 0 ? (
                          <div className="space-y-0.5">
                            <Chip tone="warning">{f.advertencias[0]}</Chip>
                            <div>
                              <Link
                                to={`/app/nomina/personal/${f.empleadoId}/editar`}
                                onClick={onCerrar}
                                className="text-ink/55 hover:text-ink text-[11px] underline"
                              >
                                Completar opcionales
                              </Link>
                            </div>
                          </div>
                        ) : (
                          <Chip tone="success">Completa</Chip>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}
