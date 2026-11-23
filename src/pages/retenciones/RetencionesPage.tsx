import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Cargando } from '@/components/ui/Estado'
import {
  type FacturaPendienteRetencion,
  type RetencionItem,
  useColaRetenciones,
  useReintegrosPendientes,
  useRetenciones,
} from '@/lib/api/retenciones'
import { useEmpresa } from '@/lib/api/empresa'
import { ModalRegistrarRetencion } from './ModalRegistrarRetencion'
import { ModalRegistrarReintegro } from './ModalRegistrarReintegro'
import { ModalAnularRetencion } from './ModalAnularRetencion'
import { generarComprobanteRetencionPdf } from './comprobantePdf'
import { armarTxtIva } from './txtSeniatIva'
import {
  AlertCircle,
  ArrowDownLeft,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Plus,
  Receipt,
  Search,
  Trash2,
} from 'lucide-react'

type TabTipo = 'por_realizar' | 'reintegros' | 'libro' | 'reportes'

export function RetencionesPage() {
  const [params] = useSearchParams()
  const tabParam = params.get('tab') as TabTipo | null
  const busquedaParam = params.get('busqueda') ?? ''

  const [tab, setTab] = useState<TabTipo>(tabParam || (busquedaParam ? 'libro' : 'por_realizar'))

  // Sincronizar si cambia el tab o búsqueda por URL (ej. enlaces del menú lateral o ficha de compras)
  useEffect(() => {
    const t = params.get('tab') as TabTipo | null
    if (t) setTab(t)
    const b = params.get('busqueda')
    if (b !== null) setBusqueda(b)
  }, [params])

  // Filtros de búsqueda para Libro Fiscal
  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS')
  const [filtroEstado, setFiltroEstado] = useState<string>('TODOS')
  const [busqueda, setBusqueda] = useState(busquedaParam)

  // Consultas de datos
  const { data: retenciones = [], isLoading: cargandoRetenciones } = useRetenciones({
    tipo: filtroTipo,
    estado: filtroEstado,
    busqueda,
  })
  const { data: cola = [], isLoading: cargandoCola } = useColaRetenciones()
  const { data: reintegros = [], isLoading: cargandoReintegros } = useReintegrosPendientes()
  const { data: empresa } = useEmpresa()

  // Estados de Modales
  const [modalNueva, setModalNueva] = useState(false)
  const [facturaSeleccionada, setFacturaSeleccionada] = useState<FacturaPendienteRetencion | null>(null)

  const [modalReintegro, setModalReintegro] = useState(false)
  const [retencionReintegro, setRetencionReintegro] = useState<RetencionItem | null>(null)

  const [modalAnular, setModalAnular] = useState(false)
  const [retencionAnular, setRetencionAnular] = useState<RetencionItem | null>(null)

  // Estado para exportación TXT
  const [periodoTxt, setPeriodoTxt] = useState(new Date().toISOString().slice(0, 7).replace('-', ''))
  const [generandoPdf, setGenerandoPdf] = useState(false)

  // Descarga del PDF oficial
  const descargarPdf = async (item: RetencionItem) => {
    try {
      setGenerandoPdf(true)
      await generarComprobanteRetencionPdf(item, {
        razonSocial: empresa?.razon_social || 'MINERÍA INTERNACIONAL TS, C.A.',
        rif: empresa?.rif || 'J-50155054-0',
        domicilio: empresa?.domicilio_fiscal,
        telefono: empresa?.telefono,
        correo: empresa?.correo,
      })
    } finally {
      setGenerandoPdf(false)
    }
  }

  // Descarga del TXT SENIAT
  const descargarTxtSeniat = () => {
    const res = armarTxtIva({
      rifAgente: empresa?.rif || 'J501550540',
      razonSocial: empresa?.razon_social || 'MINERIA INTERNACIONAL TS CA',
      periodo: periodoTxt,
      campo2: 'operaciones',
      filas: retenciones,
    })

    if (res.faltan.length > 0) {
      alert(`No se puede generar el TXT por las siguientes validaciones:\n\n- ${res.faltan.join('\n- ')}`)
      return
    }

    const blob = new Blob([res.contenido], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = res.nombre
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-hairline pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-ink/90">Retenciones Fiscales</h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-tierra-500/10 text-tierra-600 dark:text-tierra-300">
              G.O. 43.484
            </span>
          </div>
          <p className="text-xs md:text-sm text-ink/60 mt-1">
            Comprobantes de 14 dígitos (R14), control de reintegros post-pago, libro fiscal y exportador oficial al
            SENIAT.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setFacturaSeleccionada(null)
              setModalNueva(true)
            }}
            icon={<Plus className="w-4 h-4" />}
          >
            Nueva retención manual
          </Button>
        </div>
      </div>

      {/* Selector de Pestañas */}
      <div className="flex border-b border-hairline gap-6">
        <button
          onClick={() => setTab('por_realizar')}
          className={`pb-3 text-sm font-medium transition-all relative flex items-center gap-2 ${
            tab === 'por_realizar'
              ? 'text-tierra-600 dark:text-tierra-300 border-b-2 border-tierra-600 dark:border-tierra-400 font-semibold'
              : 'text-ink/50 hover:text-ink/80'
          }`}
        >
          <Clock className="w-4 h-4" />
          Por realizar
          {cola.length > 0 ? (
            <span className="px-2 py-0.5 text-xs rounded-full bg-ink/8 text-ink/80 font-bold">
              {cola.length}
            </span>
          ) : null}
        </button>

        <button
          onClick={() => setTab('reintegros')}
          className={`pb-3 text-sm font-medium transition-all relative flex items-center gap-2 ${
            tab === 'reintegros'
              ? 'text-warning border-b-2 border-warning font-semibold'
              : 'text-ink/50 hover:text-ink/80'
          }`}
        >
          <ArrowDownLeft className="w-4 h-4" />
          Reintegros pendientes
          {reintegros.length > 0 ? (
            <span className="px-2 py-0.5 text-xs rounded-full bg-warning-soft text-warning font-bold">
              {reintegros.length}
            </span>
          ) : null}
        </button>

        <button
          onClick={() => setTab('libro')}
          className={`pb-3 text-sm font-medium transition-all relative flex items-center gap-2 ${
            tab === 'libro'
              ? 'text-tierra-600 dark:text-tierra-300 border-b-2 border-tierra-600 dark:border-tierra-400 font-semibold'
              : 'text-ink/50 hover:text-ink/80'
          }`}
        >
          <Receipt className="w-4 h-4" />
          Libro fiscal
          {retenciones.length > 0 ? (
            <span className="px-2 py-0.5 text-xs rounded-full bg-ink/8 text-ink/80">{retenciones.length}</span>
          ) : null}
        </button>

        <button
          onClick={() => setTab('reportes')}
          className={`pb-3 text-sm font-medium transition-all relative flex items-center gap-2 ${
            tab === 'reportes'
              ? 'text-tierra-600 dark:text-tierra-300 border-b-2 border-tierra-600 dark:border-tierra-400 font-semibold'
              : 'text-ink/50 hover:text-ink/80'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          Reportes y SENIAT (TXT)
        </button>
      </div>

      {/* CONTENIDO 1: POR REALIZAR */}
      {tab === 'por_realizar' && (
        <div className="space-y-4">
          <div className="rounded-[6px] border border-hairline bg-surface/50 p-3 text-xs text-ink/70 flex justify-between items-center">
            <span>
              Mostrando órdenes de compra con <strong>factura declarada</strong> que aún no cuentan con comprobante de
              retención registrado en el libro.
            </span>
            <span className="text-ink/45">Total pendientes: {cola.length}</span>
          </div>

          {cargandoCola ? (
            <Cargando texto="Consultando facturas pendientes..." />
          ) : cola.length === 0 ? (
            <div className="rounded-[6px] border border-dashed border-hairline p-12 text-center bg-surface">
              <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-3" />
              <p className="text-sm font-semibold text-ink/85">Al día: no hay compras con retenciones pendientes</p>
              <p className="text-xs text-ink/50 mt-1 max-w-sm mx-auto">
                Todas las compras con soporte Factura ya tienen su comprobante de retención formal emitido.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[6px] border border-hairline bg-surface">
              <table className="w-full text-xs text-left">
                <thead className="bg-ink/3 text-ink/70 font-semibold border-b border-hairline">
                  <tr>
                    <th className="p-3">OC / Compra</th>
                    <th className="p-3">Proveedor</th>
                    <th className="p-3">Factura</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-right">IVA Causado</th>
                    <th className="p-3">Estado de Pago</th>
                    <th className="p-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {cola.map((item) => (
                    <tr key={item.orden_id} className="hover:bg-ink/3 transition-colors">
                      <td className="p-3 font-medium text-ink/90">{item.orden_numero}</td>
                      <td className="p-3">
                        <div className="font-medium text-ink/85">{item.proveedor_nombre}</div>
                        <div className="text-[11px] text-ink/50">{item.proveedor_rif}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-mono text-ink/85">{item.factura_numero}</div>
                        <div className="text-[11px] text-ink/50">{item.factura_fecha}</div>
                      </td>
                      <td className="p-3 text-right font-medium text-ink/85 tabular">
                        ${item.total.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right font-semibold text-tierra-600 dark:text-tierra-300 tabular">
                        ${item.iva.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3">
                        {item.ya_pagada ? (
                          <span className="px-2 py-0.5 rounded-[4px] text-[11px] font-semibold bg-success-soft text-success">
                            Pagada (Post-pago)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-[4px] text-[11px] font-semibold bg-ink/6 text-ink/75">
                            Por pagar
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          size="sm"
                          onClick={() => {
                            setFacturaSeleccionada(item)
                            setModalNueva(true)
                          }}
                        >
                          Retener
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* CONTENIDO 2: REINTEGROS PENDIENTES */}
      {tab === 'reintegros' && (
        <div className="space-y-4">
          <div className="rounded-[6px] border border-warning/30 bg-warning-soft p-3 text-xs text-warning flex gap-2.5 items-start">
            <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-ink/90">Devoluciones pendientes de proveedores</p>
              <p className="mt-0.5 text-ink/75 leading-relaxed">
                Retenciones emitidas después de haber cancelado la orden de compra al 100%. El proveedor debe devolver el
                monto retenido en banco o caja. Al recibir los fondos, pulse <strong>«Registrar reintegro»</strong> para
                ingresarlo a Tesorería y cuadrar el saldo.
              </p>
            </div>
          </div>

          {cargandoReintegros ? (
            <Cargando texto="Consultando reintegros pendientes..." />
          ) : reintegros.length === 0 ? (
            <div className="rounded-[6px] border border-dashed border-hairline p-12 text-center bg-surface">
              <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-3" />
              <p className="text-sm font-semibold text-ink/85">No hay reintegros pendientes</p>
              <p className="text-xs text-ink/50 mt-1 max-w-sm mx-auto">
                Todos los proveedores con retenciones post-pago han devuelto los importes correspondientes.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[6px] border border-hairline bg-surface">
              <table className="w-full text-xs text-left">
                <thead className="bg-ink/3 text-ink/70 font-semibold border-b border-hairline">
                  <tr>
                    <th className="p-3">Comprobante (R14)</th>
                    <th className="p-3">Proveedor / Contacto</th>
                    <th className="p-3">Factura</th>
                    <th className="p-3">Emisión</th>
                    <th className="p-3 text-right">Por Reintegrar</th>
                    <th className="p-3 text-center">Tiempo en Espera</th>
                    <th className="p-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {reintegros.map((item) => (
                    <tr key={item.id} className="hover:bg-ink/3 transition-colors">
                      <td className="p-3 font-mono font-medium text-ink/90">{item.numero_comprobante}</td>
                      <td className="p-3">
                        <div className="font-medium text-ink/90">{item.proveedor_nombre}</div>
                        <div className="text-[11px] text-ink/50">
                          {item.proveedor_rif} {item.proveedor_telefono ? `· ${item.proveedor_telefono}` : ''}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-ink/85">{item.factura_numero}</td>
                      <td className="p-3 text-ink/70">{item.fecha_emision}</td>
                      <td className="p-3 text-right tabular">
                        <div className="font-bold text-tierra-600 dark:text-tierra-300">
                          {item.reintegro_monto?.toLocaleString('es-VE', { minimumFractionDigits: 2 })} {item.moneda}
                        </div>
                        {item.moneda !== 'BS' ? (
                          <div className="text-[10px] text-ink/50">
                            Bs. {item.monto_retenido_bs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                          </div>
                        ) : null}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-warning-soft text-warning inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-warning" />
                          {item.dias_espera_reintegro} {item.dias_espera_reintegro === 1 ? 'día' : 'días'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRetencionReintegro(item)
                            setModalReintegro(true)
                          }}
                        >
                          Registrar reintegro
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* CONTENIDO 3: LIBRO FISCAL */}
      {tab === 'libro' && (
        <div className="space-y-4">
          {/* Barra de Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-surface p-3 rounded-[6px] border border-hairline">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-ink/40" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por N°, RIF o Proveedor..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-hairline bg-surface text-ink/90 rounded-[6px] placeholder:text-ink/40 focus:outline-none focus:ring-1 focus:ring-royal-600"
              />
            </div>

            <Select
              label="Impuesto"
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              opciones={[
                { valor: 'TODOS', etiqueta: 'Todos los impuestos' },
                { valor: 'IVA', etiqueta: 'Solo IVA' },
                { valor: 'ISLR', etiqueta: 'Solo ISLR' },
                { valor: 'ISAE', etiqueta: 'Solo ISAE' },
              ]}
            />

            <Select
              label="Estado"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              opciones={[
                { valor: 'TODOS', etiqueta: 'Todos los estados' },
                { valor: 'REGISTRADA', etiqueta: 'Registradas' },
                { valor: 'DECLARADA', etiqueta: 'Declaradas' },
                { valor: 'ANULADA', etiqueta: 'Anuladas' },
              ]}
            />

            <div className="flex items-center justify-end text-xs text-ink/50 font-medium">
              Comprobantes: {retenciones.length}
            </div>
          </div>

          {cargandoRetenciones ? (
            <Cargando texto="Consultando libro fiscal..." />
          ) : retenciones.length === 0 ? (
            <div className="rounded-[6px] border border-dashed border-hairline p-12 text-center bg-surface">
              <Receipt className="w-10 h-10 text-ink/40 mx-auto mb-3" />
              <p className="text-sm font-semibold text-ink/85">No se encontraron comprobantes en el libro</p>
              <p className="text-xs text-ink/50 mt-1">
                Puede registrar una nueva retención manual o esperar a retener desde la pestaña «Por realizar».
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[6px] border border-hairline bg-surface">
              <table className="w-full text-xs text-left">
                <thead className="bg-ink/3 text-ink/70 font-semibold border-b border-hairline">
                  <tr>
                    <th className="p-3">Comprobante (R14)</th>
                    <th className="p-3">Impuesto</th>
                    <th className="p-3">Proveedor</th>
                    <th className="p-3">Factura / Control</th>
                    <th className="p-3">Emisión / Entrega</th>
                    <th className="p-3 text-right">Base Imponible</th>
                    <th className="p-3 text-right">Retenido</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {retenciones.map((item) => (
                    <tr
                      key={item.id}
                      className={`hover:bg-ink/3 transition-colors ${
                        item.estado === 'ANULADA' ? 'opacity-60 bg-ink/2' : ''
                      }`}
                    >
                      <td className="p-3 font-mono font-semibold text-ink/90">{item.numero_comprobante}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-[4px] text-[11px] font-bold bg-ink/6 text-ink/80">
                          {item.tipo_impuesto}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-ink/90">{item.proveedor_nombre}</div>
                        <div className="text-[11px] text-ink/50">{item.proveedor_rif}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-mono text-ink/85">{item.factura_numero}</div>
                        <div className="text-[11px] text-ink/50 font-mono">
                          Ctrl: {item.factura_control || '—'}
                        </div>
                      </td>
                      <td className="p-3 text-ink/70">
                        <div>{item.fecha_emision}</div>
                        <div className="text-[10px] text-ink/40">
                          {item.fecha_entrega ? `Entr: ${item.fecha_entrega}` : 'Sin entrega'}
                        </div>
                      </td>
                      <td className="p-3 text-right text-ink/85 font-medium tabular">
                        {item.base_imponible.toLocaleString('es-VE', { minimumFractionDigits: 2 })} {item.moneda}
                      </td>
                      <td className="p-3 text-right font-bold text-tierra-600 dark:text-tierra-300 tabular">
                        {item.monto_retenido.toLocaleString('es-VE', { minimumFractionDigits: 2 })} {item.moneda}
                      </td>
                      <td className="p-3">
                        {item.estado === 'ANULADA' ? (
                          <span className="px-2 py-0.5 rounded-[4px] text-[11px] font-semibold bg-danger-soft text-danger">
                            Anulada
                          </span>
                        ) : item.estado === 'DECLARADA' ? (
                          <span className="px-2 py-0.5 rounded-[4px] text-[11px] font-semibold bg-info-soft text-info">
                            Declarada 🔒
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-[4px] text-[11px] font-semibold bg-success-soft text-success">
                            Registrada
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => descargarPdf(item)}
                            disabled={generandoPdf}
                            title="Descargar Comprobante PDF oficial"
                          >
                            <FileText className="w-3.5 h-3.5 text-tierra-600 dark:text-tierra-300" />
                          </Button>
                          {item.estado === 'REGISTRADA' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setRetencionAnular(item)
                                setModalAnular(true)
                              }}
                              title="Anular comprobante"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-danger" />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* CONTENIDO 4: REPORTES Y TXT SENIAT */}
      {tab === 'reportes' && (
        <div className="space-y-6">
          <Card className="p-5 border-hairline">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-ink/90 flex items-center gap-2">
                  <Download className="w-5 h-5 text-tierra-600 dark:text-tierra-300" />
                  Exportación de Retenciones de IVA (TXT para el SENIAT)
                </h3>
                <p className="text-xs text-ink/60 mt-1 max-w-2xl leading-relaxed">
                  Genera el archivo plano estructurado de 16 columnas reglamentarias exigido por el portal fiscal del
                  SENIAT para la declaración quincenal de retenciones practicadas de IVA.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-ink/60 mb-1">Período (AAAAMM)</label>
                  <input
                    type="text"
                    value={periodoTxt}
                    onChange={(e) => setPeriodoTxt(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="202611"
                    maxLength={6}
                    className="w-28 px-3 py-1.5 text-sm font-mono border border-hairline bg-surface text-ink/90 rounded-[6px] focus:outline-none focus:ring-1 focus:ring-royal-600"
                  />
                </div>
                <div className="pt-4">
                  <Button onClick={descargarTxtSeniat} icon={<FileSpreadsheet className="w-4 h-4" />}>
                    Descargar TXT SENIAT
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* Resumen del Período */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4 border-hairline bg-surface">
              <p className="text-xs text-ink/50 font-medium">Total Retenciones de IVA (Período {periodoTxt})</p>
              <p className="text-2xl font-bold text-ink/90 mt-1">
                {retenciones.filter((r) => r.tipo_impuesto === 'IVA' && r.periodo === periodoTxt && r.estado !== 'ANULADA').length}
              </p>
            </Card>

            <Card className="p-4 border-hairline bg-surface">
              <p className="text-xs text-ink/50 font-medium">Monto Total Retenido (Bs)</p>
              <p className="text-2xl font-bold text-tierra-600 dark:text-tierra-300 mt-1">
                Bs.{' '}
                {retenciones
                  .filter((r) => r.tipo_impuesto === 'IVA' && r.periodo === periodoTxt && r.estado !== 'ANULADA')
                  .reduce((s, r) => s + r.monto_retenido_bs, 0)
                  .toLocaleString('es-VE', { minimumFractionDigits: 2 })}
              </p>
            </Card>

            <Card className="p-4 border-hairline bg-surface">
              <p className="text-xs text-ink/50 font-medium">Equivalente Divisa (USD)</p>
              <p className="text-2xl font-bold text-ink/80 mt-1">
                ${' '}
                {retenciones
                  .filter((r) => r.tipo_impuesto === 'IVA' && r.periodo === periodoTxt && r.estado !== 'ANULADA')
                  .reduce((s, r) => s + r.monto_retenido_usd, 0)
                  .toLocaleString('es-VE', { minimumFractionDigits: 2 })}
              </p>
            </Card>
          </div>
        </div>
      )}

      {/* Modales */}
      <ModalRegistrarRetencion
        abierta={modalNueva}
        onCerrar={() => setModalNueva(false)}
        facturaPrevia={facturaSeleccionada}
      />

      <ModalRegistrarReintegro
        abierta={modalReintegro}
        onCerrar={() => setModalReintegro(false)}
        retencion={retencionReintegro}
      />

      <ModalAnularRetencion
        abierta={modalAnular}
        onCerrar={() => setModalAnular(false)}
        retencion={retencionAnular}
      />
    </div>
  )
}
