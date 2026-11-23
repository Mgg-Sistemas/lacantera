import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  FileUp,
  Landmark,
  XCircle,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Chip } from '@/components/ui/Chip'
import { Textarea } from '@/components/ui/Textarea'
import { useEmpleados, useFirmaRrhh, usePeriodos, useRecibos } from '@/lib/api/nomina'
import {
  useConfigBancoTesoro,
  useGuardarCuentaOrdenanteBt,
  useReservarCorrelativosBt,
} from '@/lib/api/bancoTesoro'
import { empresaDelPapel, useEmpresa } from '@/lib/api/empresa'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { useSesion } from '@/lib/sesion'
import { bolivares, dolares, documento, fecha } from '@/lib/formato'
import {
  analizarRespuestaBancoTxtCsv,
  construirFilasPagoMasivo,
  descargarBlob,
  formatearCorrelativoBanco,
  generarConciliacionXlsx,
  generarPagoMasivoCsv,
  generarPagoMasivoTxt,
  generarPagoMasivoXlsx,
} from '@/lib/bancoTesoro/formatos'
import { armarPagoBancario } from '@/lib/ficha/nominaBancariaPdf'
import { armarConciliacionBancoPdf } from '@/lib/ficha/cargaMasivaBancoPdf'
import type { PdfArmado } from '@/lib/ficha/reciboPdf'

interface Props {
  abierto: boolean
  onCerrar: () => void
  periodoInicialId?: number | null
  onVerPdf: (pdf: PdfArmado & { titulo: string; descripcion: string }) => void
}

type AlcancePago = 'TESORO_0163' | 'TRANSFERENCIAS' | 'TODOS'

export function ModalPagoBancario({
  abierto,
  onCerrar,
  periodoInicialId,
  onVerPdf,
}: Props) {
  const { nombre: usuarioNombre } = useSesion()
  const { data: empresa } = useEmpresa()
  const { firma } = useFirmaRrhh()
  const { data: periodos } = usePeriodos()
  const { data: todosEmpleados } = useEmpleados(false)
  const configBt = useConfigBancoTesoro()
  const reservarCorrelativos = useReservarCorrelativosBt()
  const guardarCuentaOrdenante = useGuardarCuentaOrdenanteBt()

  const [pestana, setPestana] = useState<'emitir' | 'conciliar'>('emitir')

  const periodosConRecibos = useMemo(
    () => (periodos ?? []).filter((p) => Number(p.recibos ?? 0) > 0),
    [periodos],
  )

  const [periodoId, setPeriodoId] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (!abierto) return
    if (periodoInicialId) {
      setPeriodoId(periodoInicialId)
      return
    }
    const sugerido =
      periodosConRecibos.find((p) => p.estado === 'CALCULADA' || p.estado === 'APROBADA') ??
      periodosConRecibos[0]
    if (sugerido) setPeriodoId(sugerido.id)
  }, [abierto, periodoInicialId, periodosConRecibos])

  const periodo = periodosConRecibos.find((p) => p.id === periodoId) ?? null
  const { data: recibos, isPending: cargandoRecibos } = useRecibos(periodo?.id)

  const [alcance, setAlcance] = useState<AlcancePago>('TESORO_0163')
  const [alcanceInicializado, setAlcanceInicializado] = useState(false)

  useEffect(() => {
    if (!abierto) {
      setAlcanceInicializado(false)
      return
    }
    if (alcanceInicializado || !recibos || recibos.length === 0) return
    const hayTesoro = recibos.some((r) =>
      (r.empleado?.numero_cuenta ?? '').replace(/\D/g, '').startsWith('0163'),
    )
    setAlcance(hayTesoro ? 'TESORO_0163' : 'TRANSFERENCIAS')
    setAlcanceInicializado(true)
  }, [abierto, recibos, alcanceInicializado])

  const [correlativoInicio, setCorrelativoInicio] = useState('1')
  const [cuentaOrdenante, setCuentaOrdenante] = useState('')
  const [fechaValor, setFechaValor] = useState(() => hoyEnCaracas())
  const [modoCsv, setModoCsv] = useState<'portal' | 'correlativos'>('portal')
  const [avanzarAlExportar, setAvanzarAlExportar] = useState(true)
  const [excluidos, setExcluidos] = useState<Set<number>>(new Set())
  const [procesando, setProcesando] = useState(false)

  useEffect(() => {
    if (!abierto) return
    setCorrelativoInicio(String(configBt.correlativoSiguiente || 1))
    setCuentaOrdenante(configBt.cuentaOrdenante || '')
    setExcluidos(new Set())
  }, [abierto, configBt.correlativoSiguiente, configBt.cuentaOrdenante])

  const recibosSegunAlcance = useMemo(() => {
    const lista = (recibos ?? []).filter((r) => r.empleado)
    if (alcance === 'TESORO_0163') {
      return lista.filter((r) => {
        const cta = (r.empleado?.numero_cuenta ?? '').replace(/\D/g, '')
        const bco = r.empleado?.banco ?? ''
        return cta.startsWith('0163') || bco.startsWith('0163')
      })
    }
    if (alcance === 'TRANSFERENCIAS') {
      return lista.filter((r) => r.empleado?.forma_pago === 'TRANSFERENCIA')
    }
    return lista
  }, [recibos, alcance])

  const corrNum = Math.max(1, Math.floor(Number(correlativoInicio) || 1))

  // Primero calculamos validación base y luego numeramos correlativos consecutivos solo a los incluidos
  const filasBase = useMemo(
    () =>
      construirFilasPagoMasivo(
        recibosSegunAlcance,
        corrNum,
        alcance === 'TESORO_0163',
      ),
    [recibosSegunAlcance, corrNum, alcance],
  )

  const filasConCorrelativo = useMemo(() => {
    let seq = corrNum
    return filasBase.map((f) => {
      if (excluidos.has(f.reciboId)) return f
      const actual = seq++
      return {
        ...f,
        correlativoNumero: actual,
        correlativoTexto: formatearCorrelativoBanco(actual),
      }
    })
  }, [filasBase, excluidos, corrNum])

  const seleccionadas = useMemo(
    () => filasConCorrelativo.filter((f) => !excluidos.has(f.reciboId)),
    [filasConCorrelativo, excluidos],
  )

  const conErroresEnSeleccion = seleccionadas.filter((f) => f.errores.length > 0)
  const totalBs = seleccionadas.reduce((s, f) => s + f.montoBs, 0)
  const totalUsd = seleccionadas.reduce((s, f) => s + f.montoUsd, 0)

  const alternarFila = (reciboId: number) => {
    setExcluidos((prev) => {
      const sig = new Set(prev)
      if (sig.has(reciboId)) sig.delete(reciboId)
      else sig.add(reciboId)
      return sig
    })
  }

  const dejarSoloValidas = () => {
    const nuevosExcluidos = new Set<number>()
    for (const f of filasBase) {
      if (f.errores.length > 0) nuevosExcluidos.add(f.reciboId)
    }
    setExcluidos(nuevosExcluidos)
  }

  const registrarUsoDeLote = async (cantidad: number) => {
    if (cuentaOrdenante.trim() && cuentaOrdenante.trim() !== configBt.cuentaOrdenante) {
      await guardarCuentaOrdenante.mutateAsync(cuentaOrdenante.trim())
    }
    if (avanzarAlExportar && cantidad > 0) {
      await reservarCorrelativos.mutateAsync({ cantidad, desde: corrNum })
      setCorrelativoInicio(String(corrNum + cantidad))
    }
  }

  const etiquetaAlcance =
    alcance === 'TESORO_0163'
      ? 'Banco del Tesoro (0163)'
      : alcance === 'TRANSFERENCIAS'
        ? 'Transferencias bancarias'
        : 'Todos los recibos del período'

  const nombreBaseArchivo = periodo
    ? `nomina-bt-${periodo.numero.replace(/\s+/g, '-').toLowerCase()}`
    : 'nomina-bt'

  const exportarTxt = async () => {
    if (seleccionadas.length === 0) return
    setProcesando(true)
    try {
      const blob = generarPagoMasivoTxt(seleccionadas)
      descargarBlob(blob, `${nombreBaseArchivo}.txt`)
      await registrarUsoDeLote(seleccionadas.length)
    } finally {
      setProcesando(false)
    }
  }

  const exportarCsv = async () => {
    if (seleccionadas.length === 0) return
    setProcesando(true)
    try {
      const blob = generarPagoMasivoCsv(seleccionadas, modoCsv)
      const sufijo = modoCsv === 'portal' ? 'tesoro-en-linea' : 'correlativos'
      descargarBlob(blob, `${nombreBaseArchivo}-${sufijo}.csv`)
      await registrarUsoDeLote(seleccionadas.length)
    } finally {
      setProcesando(false)
    }
  }

  const exportarExcel = async () => {
    if (!periodo || seleccionadas.length === 0) return
    setProcesando(true)
    try {
      const papel = empresaDelPapel(empresa)
      const blob = generarPagoMasivoXlsx(seleccionadas, {
        periodoNumero: periodo.numero,
        desde: periodo.desde,
        hasta: periodo.hasta,
        tasaUsd: periodo.tasa_usd,
        cuentaOrdenante: cuentaOrdenante.trim() || undefined,
        fechaValor: fechaValor || undefined,
        empresaNombre: papel.razonSocial,
        empresaRif: papel.rif,
      })
      descargarBlob(blob, `${nombreBaseArchivo}.xlsx`)
      if (cuentaOrdenante.trim() && cuentaOrdenante.trim() !== configBt.cuentaOrdenante) {
        await guardarCuentaOrdenante.mutateAsync(cuentaOrdenante.trim())
      }
    } finally {
      setProcesando(false)
    }
  }

  const exportarPdf = async () => {
    if (!periodo || seleccionadas.length === 0) return
    setProcesando(true)
    try {
      const reciboMap = new Map((recibos ?? []).map((r) => [r.id, r]))
      const pdf = await armarPagoBancario({
        periodo: {
          numero: periodo.numero,
          desde: periodo.desde,
          hasta: periodo.hasta,
          tasaUsd: periodo.tasa_usd,
        },
        trabajadores: seleccionadas.map((f) => {
          const orig = reciboMap.get(f.reciboId)
          return {
            correlativo: f.correlativoTexto,
            ficha: f.ficha,
            nombre: f.nombreMostrar,
            cedula: f.cedulaOriginal,
            formaPago: f.formaPago,
            banco: f.banco,
            tipoCuenta: f.tipoCuenta,
            numeroCuenta: f.cuenta || orig?.empleado?.numero_cuenta || null,
            telefonoPago: orig?.empleado?.telefono_pago ?? null,
            neto: f.montoBs,
            netoUsd: f.montoUsd,
          }
        }),
        empresa: empresaDelPapel(empresa),
        emitidoPor: usuarioNombre,
        momento: new Date(),
        alcance: etiquetaAlcance,
        cuentaOrdenante: cuentaOrdenante.trim() || null,
        fechaValor: fechaValor || null,
        firmaRrhh: firma.nombre || null,
      })
      onCerrar()
      onVerPdf({
        ...pdf,
        titulo: 'Relación de pago masivo de nómina',
        descripcion: `${periodo.numero} · ${seleccionadas.length} abonos · correlativos ${seleccionadas[0].correlativoTexto} al ${seleccionadas.at(-1)!.correlativoTexto}`,
      })
    } finally {
      setProcesando(false)
    }
  }

  // ── Estado para Pestaña 2: Conciliador de respuesta TXT/CSV del banco ──────
  const inputArchivoRef = useRef<HTMLInputElement>(null)
  const [nombreArchivoResp, setNombreArchivoResp] = useState('')
  const [textoRespuesta, setTextoRespuesta] = useState('')
  const [filtroConciliacion, setFiltroConciliacion] = useState<'TODOS' | 'RECHAZADO' | 'PROCESADO'>(
    'TODOS',
  )

  const resumenConciliacion = useMemo(() => {
    if (!textoRespuesta.trim()) return null
    return analizarRespuestaBancoTxtCsv(
      textoRespuesta,
      todosEmpleados ?? [],
      recibos ?? undefined,
    )
  }, [textoRespuesta, todosEmpleados, recibos])

  const lineasConciliadasVisibles = useMemo(() => {
    if (!resumenConciliacion) return []
    if (filtroConciliacion === 'TODOS') return resumenConciliacion.lineas
    return resumenConciliacion.lineas.filter((l) => l.estado === filtroConciliacion)
  }, [resumenConciliacion, filtroConciliacion])

  const leerArchivoSubido = async (archivo: File | undefined) => {
    if (!archivo) return
    setNombreArchivoResp(archivo.name)
    const contenido = await archivo.text()
    setTextoRespuesta(contenido)
  }

  const exportarConciliacionPdf = async () => {
    if (!resumenConciliacion || resumenConciliacion.totalLineas === 0) return
    setProcesando(true)
    try {
      const pdf = await armarConciliacionBancoPdf({
        resumen: resumenConciliacion,
        nombreArchivo: nombreArchivoResp || 'respuesta-banco.txt',
        empresa: empresaDelPapel(empresa),
        emitidoPor: usuarioNombre,
        momento: new Date(),
      })
      onCerrar()
      onVerPdf({
        ...pdf,
        titulo: 'Conciliación de respuesta bancaria',
        descripcion: `${resumenConciliacion.procesados} procesados · ${resumenConciliacion.rechazados} rechazados`,
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
      titulo="Pago bancario de nómina · Tesoro en Línea (0163)"
      descripcion="Genera los archivos de abono masivo en Excel, CSV, TXT (con correlativos 0163XXXXXX) y PDF desde RRHH, o concilia el archivo de respuesta del banco."
      acciones={
        pestana === 'emitir' ? (
          <>
            <Button variant="ghost" onClick={onCerrar} disabled={procesando}>
              Cerrar
            </Button>
            <Button
              variant="outline"
              icon={<FileSpreadsheet />}
              disabled={procesando || seleccionadas.length === 0}
              onClick={() => void exportarExcel()}
            >
              Excel (.xlsx)
            </Button>
            <Button
              variant="outline"
              icon={<Download />}
              disabled={
                procesando ||
                seleccionadas.length === 0 ||
                (modoCsv === 'portal' && conErroresEnSeleccion.length > 0)
              }
              onClick={() => void exportarCsv()}
            >
              CSV (.csv)
            </Button>
            <Button
              variant="outline"
              icon={<Download />}
              disabled={
                procesando || seleccionadas.length === 0 || conErroresEnSeleccion.length > 0
              }
              onClick={() => void exportarTxt()}
            >
              TXT (.txt)
            </Button>
            <Button
              icon={<FileText />}
              disabled={procesando || seleccionadas.length === 0}
              onClick={() => void exportarPdf()}
            >
              {procesando ? 'Generando…' : 'PDF (.pdf)'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onCerrar} disabled={procesando}>
              Cerrar
            </Button>
            {resumenConciliacion && resumenConciliacion.totalLineas > 0 ? (
              <>
                <Button
                  variant="outline"
                  icon={<FileSpreadsheet />}
                  onClick={() => {
                    const blob = generarConciliacionXlsx(
                      resumenConciliacion,
                      nombreArchivoResp || 'respuesta-banco.txt',
                    )
                    descargarBlob(blob, 'conciliacion-banco-tesoro.xlsx')
                  }}
                >
                  Excel (.xlsx)
                </Button>
                <Button
                  icon={<FileText />}
                  disabled={procesando}
                  onClick={() => void exportarConciliacionPdf()}
                >
                  PDF (.pdf)
                </Button>
              </>
            ) : null}
          </>
        )
      }
    >
      {/* Selector superior de modo */}
      <div className="border-hairline mb-4 flex flex-wrap gap-2 border-b pb-3">
        <button
          type="button"
          onClick={() => setPestana('emitir')}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            pestana === 'emitir'
              ? 'bg-brand text-white'
              : 'bg-ink/5 text-ink/70 hover:bg-ink/10'
          }`}
        >
          1. Emitir archivos de pago (Excel · CSV · TXT · PDF)
        </button>
        <button
          type="button"
          onClick={() => setPestana('conciliar')}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            pestana === 'conciliar'
              ? 'bg-brand text-white'
              : 'bg-ink/5 text-ink/70 hover:bg-ink/10'
          }`}
        >
          2. Conciliar respuesta del banco (.txt / .csv)
        </button>
      </div>

      {pestana === 'emitir' ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label="Período de nómina"
              vacio="Seleccione período"
              value={periodoId ? String(periodoId) : ''}
              onChange={(e) => {
                setPeriodoId(e.target.value ? Number(e.target.value) : undefined)
                setExcluidos(new Set())
              }}
              opciones={periodosConRecibos.map((p) => ({
                valor: String(p.id),
                etiqueta: `${p.numero} · ${fecha(p.desde)} al ${fecha(p.hasta)} (${p.estado})`,
              }))}
            />
            <Select
              label="Alcance de cuentas"
              value={alcance}
              onChange={(e) => {
                setAlcance(e.target.value as AlcancePago)
                setExcluidos(new Set())
              }}
              opciones={[
                { valor: 'TESORO_0163', etiqueta: 'Solo Banco del Tesoro (0163)' },
                { valor: 'TRANSFERENCIAS', etiqueta: 'Todas las transferencias' },
                { valor: 'TODOS', etiqueta: 'Todos los recibos del período' },
              ]}
            />
            <Input
              label="Correlativo inicial"
              type="number"
              limite={{ maxEnteros: 6, maxDecimales: 0, sinNegativos: true }}
              value={correlativoInicio}
              onChange={(e) => setCorrelativoInicio(e.target.value)}
              hint={`Genera ${formatearCorrelativoBanco(corrNum)}`}
            />
            <Select
              label="Formato del botón CSV"
              value={modoCsv}
              onChange={(e) => setModoCsv(e.target.value as 'portal' | 'correlativos')}
              opciones={[
                { valor: 'portal', etiqueta: 'Portal Tesoro en Línea (5 col.)' },
                { valor: 'correlativos', etiqueta: 'CSV con correlativos (0163...)' },
              ]}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label="Cuenta ordenante empresa (opcional)"
              solo="numeros"
              maxLength={20}
              placeholder="0163..."
              value={cuentaOrdenante}
              onChange={(e) => setCuentaOrdenante(e.target.value)}
              hint="Se guarda para próximos lotes."
            />
            <Input
              label="Fecha valor"
              type="date"
              value={fechaValor}
              onChange={(e) => setFechaValor(e.target.value)}
            />
            <div className="flex items-end pb-1.5">
              <label className="text-ink/75 flex cursor-pointer items-center gap-2 text-xs select-none">
                <input
                  type="checkbox"
                  checked={avanzarAlExportar}
                  onChange={(e) => setAvanzarAlExportar(e.target.checked)}
                  className="accent-brand size-4 rounded"
                />
                <span>Guardar y avanzar correlativo al exportar TXT / CSV</span>
              </label>
            </div>
          </div>

          {/* Tarjeta de resumen del lote */}
          <div className="border-hairline bg-canvas grid gap-3 rounded-lg border p-3 text-xs sm:grid-cols-4">
            <div>
              <p className="text-ink/45">Abonos seleccionados</p>
              <p className="text-ink/90 mt-0.5 text-sm font-semibold">
                {seleccionadas.length} de {filasBase.length}
              </p>
            </div>
            <div>
              <p className="text-ink/45">Rango de correlativos</p>
              <p className="text-ink/90 mt-0.5 font-mono text-xs font-semibold">
                {seleccionadas.length > 0
                  ? `${seleccionadas[0].correlativoTexto} → ${seleccionadas.at(-1)!.correlativoTexto}`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-ink/45">Total a debitar (Bs)</p>
              <p className="text-ink/90 tabular mt-0.5 text-sm font-semibold">
                {bolivares(totalBs)}
              </p>
            </div>
            <div>
              <p className="text-ink/45">Equivalencia recibos ($)</p>
              <p className="text-ink/90 tabular mt-0.5 text-sm font-semibold">
                {dolares(totalUsd)}
              </p>
            </div>
          </div>

          {conErroresEnSeleccion.length > 0 ? (
            <div className="border-warning/40 bg-warning-soft flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-xs">
              <div className="flex items-center gap-2">
                <AlertTriangle className="text-warning size-4 shrink-0" />
                <span className="text-ink/85">
                  <strong>{conErroresEnSeleccion.length}</strong>{' '}
                  {conErroresEnSeleccion.length === 1
                    ? 'trabajador seleccionado tiene datos bancarios incompletos'
                    : 'trabajadores seleccionados tienen datos bancarios incompletos'}{' '}
                  (impide descargar TXT/CSV del portal para evitar rechazo del lote completo).
                </span>
              </div>
              <Button size="sm" variant="outline" onClick={dejarSoloValidas}>
                Desmarcar incompletos
              </Button>
            </div>
          ) : null}

          {/* Tabla de revisión línea por línea */}
          <div className="border-hairline max-h-80 overflow-auto rounded-lg border">
            <table className="w-full min-w-[740px] text-xs">
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
                            : new Set(filasBase.map((x) => x.reciboId)),
                        )
                      }
                      className="accent-brand size-3.5 rounded"
                    />
                  </th>
                  <th className="px-2 py-2 font-medium">Correlativo</th>
                  <th className="px-2 py-2 font-medium">Trabajador</th>
                  <th className="px-2 py-2 font-medium">Cuenta (20 dígitos)</th>
                  <th className="px-2 py-2 text-right font-medium">Neto Bs</th>
                  <th className="px-3 py-2 font-medium">Validación banco</th>
                </tr>
              </thead>
              <tbody>
                {cargandoRecibos ? (
                  <tr>
                    <td colSpan={6} className="text-ink/50 px-4 py-8 text-center">
                      Cargando recibos del período…
                    </td>
                  </tr>
                ) : filasConCorrelativo.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-ink/50 px-4 py-8 text-center">
                      <Landmark className="text-ink/30 mx-auto mb-1.5 size-5" />
                      No hay recibos para este filtro. Cambia «Alcance de cuentas» arriba si aún no
                      tienen cuentas 0163 registradas.
                    </td>
                  </tr>
                ) : (
                  filasConCorrelativo.map((f) => {
                    const activo = !excluidos.has(f.reciboId)
                    return (
                      <tr
                        key={f.reciboId}
                        className={`border-hairline border-b last:border-0 ${
                          activo ? 'hover:bg-ink/3' : 'opacity-45'
                        }`}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={activo}
                            onChange={() => alternarFila(f.reciboId)}
                            className="accent-brand size-3.5 rounded"
                          />
                        </td>
                        <td className="px-2 py-2 font-mono text-[11px]">
                          {activo ? f.correlativoTexto : '—'}
                        </td>
                        <td className="px-2 py-2">
                          <p className="text-ink/85 font-medium">{f.nombreMostrar}</p>
                          <p className="text-ink/45">
                            {documento(f.cedulaOriginal)} · Ficha {f.ficha}
                          </p>
                        </td>
                        <td className="px-2 py-2 font-mono text-[11px]">
                          {f.cuenta || <span className="text-danger font-sans">Sin cuenta</span>}
                          <p className="text-ink/45 font-sans text-[10px]">{f.banco ?? f.formaPago}</p>
                        </td>
                        <td className="tabular px-2 py-2 text-right font-medium">
                          {bolivares(f.montoBs)}
                          <p className="text-ink/45 text-[10px] font-normal">
                            {dolares(f.montoUsd)}
                          </p>
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
                                  Completar en ficha
                                </Link>
                              </div>
                            </div>
                          ) : f.advertencias.length > 0 ? (
                            <Chip tone="warning">{f.advertencias[0]}</Chip>
                          ) : (
                            <Chip tone="success">Listo para banco</Chip>
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
      ) : (
        /* Pestaña 2: Lector / Conciliador de respuesta TXT/CSV del banco */
        <div className="space-y-4">
          <div className="border-hairline bg-canvas flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3.5">
            <div className="text-xs">
              <p className="text-ink/85 font-medium">
                Sube el archivo TXT o CSV devuelto por Tesoro en Línea tras procesar el lote
              </p>
              <p className="text-ink/55 mt-0.5">
                Identifica automáticamente cada correlativo (0163XXXXXX), cruza cédula y cuenta con
                la nómina, y separa los pagos acreditados (P) de los rechazados (R · Saldo
                Insuficiente, cuenta inválida, etc.).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={inputArchivoRef}
                type="file"
                accept=".txt,.csv,text/plain,text/csv"
                className="hidden"
                onChange={(e) => void leerArchivoSubido(e.target.files?.[0])}
              />
              <Button
                variant="outline"
                size="sm"
                icon={<FileUp />}
                onClick={() => inputArchivoRef.current?.click()}
              >
                {nombreArchivoResp ? `Cambiar archivo (${nombreArchivoResp})` : 'Seleccionar .txt / .csv'}
              </Button>
              {textoRespuesta ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTextoRespuesta('')
                    setNombreArchivoResp('')
                  }}
                >
                  Limpiar
                </Button>
              ) : null}
            </div>
          </div>

          {!resumenConciliacion ? (
            <Textarea
              label="O pega aquí el contenido del archivo de respuesta del banco"
              rows={5}
              placeholder="Ej: 0163000001,V013224889,01630601116013001976,000000001812500,P,,Procesado,,00000000000000000000"
              value={textoRespuesta}
              onChange={(e) => setTextoRespuesta(e.target.value)}
            />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="border-hairline bg-canvas rounded-lg border p-3 text-xs">
                  <p className="text-ink/50">Total operaciones en archivo</p>
                  <p className="text-ink/90 mt-1 text-base font-semibold">
                    {resumenConciliacion.totalLineas}
                  </p>
                </div>
                <div className="border-success/30 bg-success/5 rounded-lg border p-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="text-success size-4" />
                    <span className="text-ink/75 font-medium">Procesados (P)</span>
                  </div>
                  <p className="text-ink/90 tabular mt-1 text-base font-semibold">
                    {resumenConciliacion.procesados} · {bolivares(resumenConciliacion.montoProcesadoBs)}
                  </p>
                </div>
                <div className="border-danger/30 bg-danger/5 rounded-lg border p-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <XCircle className="text-danger size-4" />
                    <span className="text-ink/75 font-medium">Rechazados (R)</span>
                  </div>
                  <p className="text-ink/90 tabular mt-1 text-base font-semibold">
                    {resumenConciliacion.rechazados} · {bolivares(resumenConciliacion.montoRechazadoBs)}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex gap-1.5">
                  {(
                    [
                      ['TODOS', `Todos (${resumenConciliacion.totalLineas})`],
                      ['RECHAZADO', `Rechazados (${resumenConciliacion.rechazados})`],
                      ['PROCESADO', `Procesados (${resumenConciliacion.procesados})`],
                    ] as const
                  ).map(([cod, etq]) => (
                    <button
                      key={cod}
                      type="button"
                      onClick={() => setFiltroConciliacion(cod)}
                      className={`rounded px-2.5 py-1 text-xs font-medium ${
                        filtroConciliacion === cod
                          ? 'bg-ink text-canvas'
                          : 'bg-ink/5 text-ink/70 hover:bg-ink/10'
                      }`}
                    >
                      {etq}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-hairline max-h-72 overflow-auto rounded-lg border">
                <table className="w-full min-w-[700px] text-xs">
                  <thead className="bg-canvas sticky top-0 z-10">
                    <tr className="text-ink/50 border-hairline border-b text-left">
                      <th className="px-3 py-2 font-medium">Correlativo</th>
                      <th className="px-2 py-2 font-medium">Trabajador identificado</th>
                      <th className="px-2 py-2 font-medium">Cuenta</th>
                      <th className="px-2 py-2 text-right font-medium">Monto Bs</th>
                      <th className="px-3 py-2 font-medium">Resultado y motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineasConciliadasVisibles.map((l) => (
                      <tr key={`${l.filaArchivo}-${l.correlativo}`} className="border-hairline border-b last:border-0">
                        <td className="px-3 py-2 font-mono text-[11px]">{l.correlativo}</td>
                        <td className="px-2 py-2">
                          <p className="text-ink/85 font-medium">
                            {l.trabajadorNombre ?? 'No encontrado en fichas actuales'}
                          </p>
                          <p className="text-ink/45">
                            {l.cedulaNormalizada}
                            {l.ficha ? ` · Ficha ${l.ficha}` : ''}
                          </p>
                        </td>
                        <td className="px-2 py-2 font-mono text-[11px]">{l.cuenta || '—'}</td>
                        <td className="tabular px-2 py-2 text-right font-medium">
                          {bolivares(l.montoBs)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Chip
                              tone={
                                l.estado === 'PROCESADO'
                                  ? 'success'
                                  : l.estado === 'RECHAZADO'
                                    ? 'danger'
                                    : 'neutral'
                              }
                            >
                              {l.estado}
                            </Chip>
                            <span className="text-ink/70">{l.motivoBanco}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
