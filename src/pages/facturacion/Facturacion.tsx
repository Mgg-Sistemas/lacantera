import { useState } from 'react'
import { Banknote, Printer, Receipt } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { Visor } from '@/components/Visor'
import { dinero, dolares, fecha, fechaHora } from '@/lib/formato'
import { empresaDelPapel, useAlicuotaIva, useEmpresa } from '@/lib/api/empresa'
import { useClientes } from '@/lib/api/ventas'
import { CasillaIva } from '@/pages/ventas/CasillaIva'
import { CasillaIgtf } from '@/pages/ventas/CasillaIgtf'
import { IGTF_POR_DEFECTO, tributoElegido, useIvaPorDefecto } from '@/pages/ventas/ivaPorDefecto'
import { ModalFacturaDirecta } from './FacturaDirecta'
import { useMiPerfil, useMisAcciones } from '@/lib/api/usuarios'
import { FacturasPorAutorizar } from './PorAutorizar'
import { useCuentas } from '@/lib/api/tesoreria'
import { armarDocumento } from '@/lib/ficha/ventaPdf'
import type { PdfArmado } from '@/lib/ficha/reciboPdf'
import {
  CONDICIONES_PAGO,
  useNotasEntrega,
  useRenglones,
  type RenglonGuardado,
} from '@/lib/api/ventas'
import {
  useAnularCobro,
  useAnularFactura,
  useCobros,
  useEnviarNotasAAutorizar,
  useFacturarNotas,
  useFacturasPorAutorizar,
  useFacturas,
  useRegistrarCobro,
  type FacturaVenta,
} from '@/lib/api/facturacion'
import { TablaRenglones, Totales } from '@/pages/ventas/Cotizaciones'
import {
  conversionDeRenglon,
  detalleDeRenglon,
  notaDeConversionDeVenta,
} from '@/pages/ventas/filas'
import { densidadesDeArticulos } from '@/lib/api/catalogo'
import { useMetodosPago, nombreDe, opcionesDe, metodosParaMoneda } from '@/lib/api/metodosPago'

const TONO: Record<string, 'royal' | 'success' | 'neutral'> = {
  EMITIDA: 'royal',
  COBRADA: 'success',
  ANULADA: 'neutral',
}

const ETIQUETA: Record<string, string> = {
  EMITIDA: 'Por cobrar',
  COBRADA: 'Cobrada',
  ANULADA: 'Anulada',
}

/**
 * Lo que se enseña del estado de una factura.
 *
 * COBRADA quiere decir «ya no se le debe nada», y desde el 15/09/2026 también
 * llega ahí una factura que una nota de crédito dejó en cero. Llamarla «Cobrada»
 * cuando no entró dinero sería decirle otra cosa a quien la mira.
 */
function etiquetaDe(f: Pick<FacturaVenta, 'estado' | 'cobrado_usd' | 'acreditado_usd'>): string {
  if (
    f.estado === 'COBRADA' &&
    Number(f.cobrado_usd ?? 0) <= 0.005 &&
    Number(f.acreditado_usd ?? 0) > 0
  ) {
    return 'Saldada con nota de crédito'
  }
  return ETIQUETA[f.estado] ?? f.estado
}

export function Facturacion() {
  const { data: metodos } = useMetodosPago()
  const { data, isPending, error } = useFacturas()
  const porFacturar = useNotasEntrega('DESPACHADA')
  const { data: empresa } = useEmpresa()
  const { data: yo } = useMiPerfil()
  const { data: cuentas } = useCuentas()

  const facturar = useFacturarNotas()
  /*
    A quien le restringieron «Autorizar y emitir facturas» la factura no se
    emite: se envía a autorizar (Christopher, 18/09/2026). El formulario es el
    mismo; cambia el botón y lo que pasa al pulsarlo.
  */
  // Mientras no se sabe, el botón espera: no se envía a autorizar por no haber cargado.
  const { resuelto: accionesListas } = useMisAcciones()
  /*
    TODA FACTURA SE AUTORIZA. Angélica, 18/09/2026: «las ventas, las facturas,
    las notas de entrega y las notas de salida llevan autorización: los usuarios
    hacen su solicitud y luego otro usuario con permisos aprueba». Ya no hay
    emisión directa, tampoco para quien tiene la casilla: la emite otro.
  */
  const emite = false
  const enviar = useEnviarNotasAAutorizar()
  const porAutorizar = useFacturasPorAutorizar()
  // Una nota que ya está en una factura por autorizar no entra en otra.
  const enEspera = new Map<string, string>()
  for (const s of porAutorizar.data ?? []) {
    if (s.estado !== 'POR_AUTORIZAR' || s.origen !== 'NOTAS') continue
    for (const numero of (s.notas ?? '').split(', ')) if (numero) enEspera.set(numero, s.numero)
  }
  const anular = useAnularFactura()
  const cobrar = useRegistrarCobro()
  const anularCobro = useAnularCobro()

  const [emitiendo, setEmitiendo] = useState(false)
  const [directa, setDirecta] = useState(false)
  const [detalleId, setDetalleId] = useState<number | null>(null)
  const [cobrando, setCobrando] = useState<FacturaVenta | null>(null)
  const [anulando, setAnulando] = useState<FacturaVenta | null>(null)
  const [motivo, setMotivo] = useState('')
  const [pdf, setPdf] = useState<PdfArmado | null>(null)

  const [elegidas, setElegidas] = useState<number[]>([])
  const [condicion, setCondicion] = useState('')
  // El IVA de la factura. Nulo: lo que diga la ficha de la empresa.
  const [conIva, setConIva] = useState<boolean | null>(null)
  const [alicuotaEscrita, setAlicuotaEscrita] = useState<string | null>(null)
  const [conIgtf, setConIgtf] = useState(false)
  const [igtfEscrito, setIgtfEscrito] = useState<string | null>(null)
  const ivaPorDefecto = useIvaPorDefecto()
  const alicuotaVigente = useAlicuotaIva()
  const { data: clientes } = useClientes()
  const [observacion, setObservacion] = useState('')

  const [cuentaId, setCuentaId] = useState('')
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('TRANSFERENCIA')
  const [referencia, setReferencia] = useState('')
  /*
    `null` significa «no lo he tocado»: la base lo deduce de la moneda.

    Lo que decide cómo llega marcada la casilla es la ficha de la empresa. Si
    la empresa no aplica IGTF, no se marca ni siquiera cobrando en divisas — y
    entonces se manda `false` explícito en vez de `null`, porque si no la base
    volvería a deducirlo de la moneda y lo aplicaría igual.
  */
  const aplicaIgtf = empresa?.aplica_igtf ?? true
  const [igtf, setIgtf] = useState<boolean | null>(null)

  // La factura abierta se busca en la lista en cada pintada, no se copia al
  // abrirla. Copiada, anular un cobro desde dentro del propio detalle dejaba a
  // la vista los totales de antes y escondía los botones de cobrar y anular,
  // porque el estado que los gobierna era el de la copia vieja: había que
  // cerrar y volver a abrir para recuperarlos.
  const detalle = detalleId !== null ? ((data ?? []).find((f) => f.id === detalleId) ?? null) : null

  const renglonesDetalle = useRenglones('factura_venta_renglones', 'factura_id', detalleId)
  const cobros = useCobros(detalleId)

  // La que se dejó como solo respaldo de una nota de salida no se cobra: no se ofrece.
  const notas = (porFacturar.data ?? []).filter((n) => n.facturable !== false)

  // Cerrar el checklist lo deja vacío, sin importar por cuál de los dos botones
  // se abrió. Limpiar solo en el que abre deja la selección puesta cuando se
  // vuelve a entrar por el otro.
  const cerrarEmision = () => {
    setEmitiendo(false)
    setElegidas([])
    setCondicion('')
    setObservacion('')
    setConIva(null)
    setAlicuotaEscrita(null)
    setConIgtf(false)
    setIgtfEscrito(null)
    facturar.reset()
    enviar.reset()
  }

  // Solo se pueden juntar notas del mismo cliente y la misma moneda: una
  // factura es de un cliente y tiene un total en una moneda. Elegida la
  // primera, el resto se deshabilita solo.
  const primera = notas.find((n) => elegidas.includes(n.id))
  const compatible = (n: (typeof notas)[number]) =>
    !primera || (n.cliente_id === primera.cliente_id && n.moneda === primera.moneda)

  /*
    EL IVA LO DECIDE LA FACTURA. Christopher, 17/09/2026: «solo la factura
    tendrá mención de IVA o IGTF». Las notas de entrega ya no lo llevan, así que
    se elige aquí, con la alícuota de la empresa por delante y editable. La
    cifra exacta la calcula la base al emitir; esto es para ver antes cuánto va.
  */
  const clienteElegido = clientes?.find((c) => c.id === primera?.cliente_id)
  const aplicaIva = conIva ?? ivaPorDefecto
  const alicuotaElegida =
    alicuotaEscrita === null ? alicuotaVigente : Number(alicuotaEscrita.replace(',', '.'))
  const alicuotaMala =
    aplicaIva && !clienteElegido?.exento_iva && !(alicuotaElegida >= 0 && alicuotaElegida <= 100)
  const alicuotaFactura =
    clienteElegido?.exento_iva || !aplicaIva || alicuotaMala ? 0 : alicuotaElegida
  // Lo de las notas sin impuesto: una nota vieja que lo llevara no lo suma dos veces.
  const baseElegida = notas
    .filter((n) => elegidas.includes(n.id))
    .reduce((s, n) => s + Number(n.total) - Number(n.iva), 0)
  const ivaElegido = Math.round(baseElegida * alicuotaFactura) / 100
  const igtfFactura = tributoElegido({ aplica: conIgtf, escrito: igtfEscrito, porDefecto: IGTF_POR_DEFECTO })
  const igtfElegido = Math.round((baseElegida + ivaElegido) * igtfFactura.vale) / 100
  // «Las facturas sí o sí tendrán IVA o IGTF» (Christopher, 17/09/2026).
  const sinTributo =
    !!primera && !clienteElegido?.exento_iva && alicuotaFactura === 0 && igtfFactura.vale === 0

  const cuenta = cuentas?.find((c) => String(c.id) === cuentaId)
  const metodosDeLaCuenta = metodosParaMoneda(metodos, cuenta?.moneda)
  const metodoNoVale = !!cuenta && !metodosDeLaCuenta.some((m) => m.codigo === metodo)

  const imprimir = async (f: FacturaVenta) => {
    const renglones = renglonesDetalle.data ?? []
    const densidades = await densidadesDeArticulos({ ids: renglones.map((r) => r.articulo_id) })
    const densidadDe = (r: RenglonGuardado) =>
      densidades.find((a) => a.id === r.articulo_id)?.densidad_ton_m3
    setPdf(
      await armarDocumento({
        tipo: 'FACTURA',
        numero: f.numero,
        fecha: f.fecha,
        numeroControl: f.numero_control,
        vigencia: { rotulo: 'Vence el', fecha: f.vence_el },
        condicionPago: CONDICIONES_PAGO.find((c) => c.valor === f.condicion_pago)?.etiqueta ?? null,
        contraparte: { nombre: f.cliente, rif: f.cliente_rif, direccion: f.cliente_direccion },
        moneda: f.moneda,
        tasa: f.tasa,
        tasaUsd: f.tasa_usd,
        renglones: renglones.map((r) => ({
          descripcion: r.descripcion,
          detalle: detalleDeRenglon(r, f.moneda),
          cantidad: r.cantidad,
          unidad: r.unidad,
          conversion: conversionDeRenglon(r, densidadDe(r)),
          precio_unitario: r.precio_unitario,
          subtotal: r.subtotal,
          exento_iva: r.exento_iva,
        })),
        notaConversion: notaDeConversionDeVenta(renglones, densidadDe),
        subtotal: f.subtotal,
        descuento: f.descuento,
        flete: f.flete,
        baseImponible: f.base_imponible,
        iva: f.iva,
        alicuotaIva: f.alicuota_iva,
        alicuotaIgtf: f.alicuota_igtf,
        igtf: f.igtf,
        total: f.total,
        retencionIva: f.retencion_iva,
        observacion: f.observacion,
        sello: f.estado === 'ANULADA' ? 'ANULADA' : null,
        empresa: empresaDelPapel(empresa),
        emitidoPor: yo?.nombre ?? '',
      }),
    )
  }

  return (
    <>
      <PageHeader
        title="Facturación"
        description="Contra notas de entrega —una, o todas las de la semana de un cliente— o sin nota, con sus propios renglones."
        actions={
          <>
            <Button variant="outline" icon={<Receipt />} onClick={() => setDirecta(true)}>
              Factura sin nota
            </Button>
            <Button icon={<Receipt />} disabled={notas.length === 0} onClick={() => setEmitiendo(true)}>
              Facturar notas{notas.length > 0 ? ` (${notas.length} sin factura)` : ''}
            </Button>
          </>
        }
      />

      {/* Lo que espera autorización va antes que lo emitido: es lo único aquí
          que está esperando a alguien. */}
      <FacturasPorAutorizar onEmitida={setDetalleId} />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<Receipt />}
            titulo="Todavía no se ha facturado nada"
            descripcion={
              notas.length > 0
                ? `Hay ${notas.length} nota(s) de entrega esperando factura.`
                : 'Se factura a partir de notas de entrega, o sin nota con sus propios renglones.'
            }
            accion={
              notas.length > 0 ? (
                <Button icon={<Receipt />} onClick={() => setEmitiendo(true)}>
                  Facturar notas
                </Button>
              ) : (
                <Button icon={<Receipt />} onClick={() => setDirecta(true)}>
                  Factura sin nota
                </Button>
              )
            }
          />
        </Card>
      ) : null}

      {data && data.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Factura</th>
                  <th className="px-3 py-3 font-medium">Cliente</th>
                  <th className="px-3 py-3 font-medium">Fecha</th>
                  <th className="px-3 py-3 text-right font-medium">Total</th>
                  <th className="px-3 py-3 text-right font-medium">Saldo</th>
                  <th className="px-5 py-3 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.map((f) => (
                  <tr
                    key={f.id}
                    onClick={() => setDetalleId(f.id)}
                    className="border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors last:border-0"
                  >
                    <td className="tabular px-5 py-3">
                      <span className="text-ink/85 font-medium">{f.numero}</span>
                      <span className="text-ink/45 block text-xs">{f.numero_control}</span>
                    </td>
                    <td className="text-ink/70 px-3 py-3">{f.cliente}</td>
                    <td className="text-ink/60 px-3 py-3 text-xs">
                      {fecha(f.fecha)}
                      {f.dias_vencida > 0 ? (
                        <span className="text-danger block">vencida hace {f.dias_vencida} d</span>
                      ) : f.dias_credito > 0 ? (
                        <span className="block">vence {fecha(f.vence_el)}</span>
                      ) : null}
                    </td>
                    <td className="tabular text-ink/85 px-3 py-3 text-right font-medium">
                      {dinero(f.moneda, f.total)}
                    </td>
                    <td className="tabular px-3 py-3 text-right">
                      {f.estado === 'EMITIDA' ? (
                        <span className="text-ink/85 font-medium">{dolares(f.saldo_usd)}</span>
                      ) : (
                        <span className="text-ink/30">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Chip tone={TONO[f.estado] ?? 'neutral'}>{etiquetaDe(f)}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* ----------------------------------------------------- facturar */}
      {emitiendo ? (
        <Modal
          abierto
          ancho="lg"
          onCerrar={cerrarEmision}
          titulo={emite ? 'Emitir factura' : 'Preparar factura'}
          descripcion="Marca las notas de entrega que van en esta factura. Tienen que ser del mismo cliente y la misma moneda."
          acciones={
            <>
              <Button variant="ghost" onClick={cerrarEmision}>
                Cancelar
              </Button>
              <Button
                disabled={
                  facturar.isPending ||
                  enviar.isPending ||
                  !accionesListas ||
                  elegidas.length === 0 ||
                  alicuotaMala ||
                  igtfFactura.malo ||
                  sinTributo
                }
                onClick={async () => {
                  const factura = {
                    notas: elegidas,
                    condicion_pago: condicion || null,
                    observacion: observacion || null,
                    alicuota_iva: alicuotaFactura,
                    alicuota_igtf: igtfFactura.vale,
                  }
                  if (emite) await facturar.mutateAsync(factura)
                  else
                    await enviar.mutateAsync({
                      ...factura,
                      total_estimado: baseElegida + ivaElegido + igtfElegido,
                    })
                  cerrarEmision()
                }}
              >
                {emite
                  ? facturar.isPending
                    ? 'Emitiendo…'
                    : 'Emitir la factura'
                  : enviar.isPending
                    ? 'Enviando…'
                    : 'Enviar a autorizar'}
              </Button>
            </>
          }
        >
          {notas.length === 0 ? (
            <Vacio
              icono={<Receipt />}
              titulo="No hay notas sin factura"
              descripcion="Todas las notas despachadas ya están en una factura. Una nota no tiene por qué facturarse: solo aparecen aquí las que todavía no lo están."
            />
          ) : (
            <div className="space-y-2">
              {notas.map((n) => {
                const marcada = elegidas.includes(n.id)
                const esperando = enEspera.get(n.numero)
                const puede = compatible(n) && !esperando

                return (
                  <label
                    key={n.id}
                    className={`border-hairline rounded-card flex items-center gap-3 border p-3 ${
                      puede ? 'hover:bg-ink/3 cursor-pointer' : 'cursor-not-allowed opacity-40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-royal-600 size-4 shrink-0"
                      checked={marcada}
                      disabled={!puede}
                      onChange={(e) =>
                        setElegidas((v) =>
                          e.target.checked ? [...v, n.id] : v.filter((x) => x !== n.id),
                        )
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-ink/85 text-sm font-medium">
                        {n.numero} · {n.cliente}
                      </p>
                      <p className="text-ink/50 text-xs">
                        {fecha(n.fecha)}
                        {n.vehiculo ? ` · ${n.vehiculo}` : ''} · {n.renglones} renglón(es)
                        {esperando ? ` · por autorizar en ${esperando}` : ''}
                      </p>
                    </div>
                    <span className="tabular text-ink/80 shrink-0 text-sm font-medium">
                      {dinero(n.moneda, n.total)}
                    </span>
                  </label>
                )
              })}
            </div>
          )}

          {elegidas.length > 0 ? (
            <>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Select
                  label="Condición de pago"
                  vacio="La que tenga el cliente"
                  value={condicion}
                  onChange={(e) => setCondicion(e.target.value)}
                  opciones={CONDICIONES_PAGO}
                  hint="A crédito, el sistema comprueba el límite del cliente antes de emitir."
                />
                <Textarea
                  label="Observación"
                  rows={2}
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                />
              </div>

              {clienteElegido?.exento_iva ? (
                <p className="text-ink/55 mt-4 text-sm">
                  {clienteElegido.nombre} es exento de IVA: la factura sale sin IVA.
                </p>
              ) : (
                <CasillaIva
                  aplica={aplicaIva}
                  onCambiar={setConIva}
                  alicuota={alicuotaEscrita ?? String(alicuotaVigente)}
                  onAlicuota={setAlicuotaEscrita}
                  className="mt-4"
                />
              )}

              <CasillaIgtf
                aplica={conIgtf}
                onCambiar={setConIgtf}
                alicuota={igtfEscrito ?? undefined}
                onAlicuota={setIgtfEscrito}
                className="mt-3"
              />

              {sinTributo ? (
                <p className="text-warning mt-2 text-sm">
                  Una factura lleva IVA, IGTF o los dos: marca al menos uno.
                </p>
              ) : null}

              <div className="bg-ink/4 rounded-card mt-4 space-y-1.5 p-4">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-ink/60 text-sm">
                    {elegidas.length} nota(s) de {primera?.cliente}
                  </span>
                  <span className="tabular text-ink/75 text-sm">
                    {dinero(primera?.moneda ?? 'USD', baseElegida)}
                  </span>
                </div>
                {alicuotaFactura > 0 ? (
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-ink/55 text-sm">IVA {alicuotaFactura}%</span>
                    <span className="tabular text-ink/75 text-sm">
                      {dinero(primera?.moneda ?? 'USD', ivaElegido)}
                    </span>
                  </div>
                ) : null}
                {igtfFactura.vale > 0 ? (
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-ink/55 text-sm">IGTF {igtfFactura.vale}%</span>
                    <span className="tabular text-ink/75 text-sm">
                      {dinero(primera?.moneda ?? 'USD', igtfElegido)}
                    </span>
                  </div>
                ) : null}
                <div className="border-hairline flex items-baseline justify-between gap-4 border-t pt-1.5">
                  <span className="text-ink/85 text-sm font-semibold">Total de la factura</span>
                  <span className="tabular text-ink/90 text-lg font-semibold">
                    {dinero(primera?.moneda ?? 'USD', baseElegida + ivaElegido + igtfElegido)}
                  </span>
                </div>
              </div>
            </>
          ) : null}

          {facturar.error ? <ErrorDeCarga error={facturar.error} className="mt-4" /> : null}
          {enviar.error ? <ErrorDeCarga error={enviar.error} className="mt-4" /> : null}
          {!emite ? (
            <p className="text-ink/55 mt-4 text-xs leading-relaxed">
              Toda factura queda por autorizar, sin número de
              control y sin tocar el patio, hasta que otro usuario con la casilla «Autorizar y emitir
              facturas» la emita o la rechace.
            </p>
          ) : null}
        </Modal>
      ) : null}

      {directa ? (
        <ModalFacturaDirecta onCerrar={() => setDirecta(false)} onEmitida={(id) => setDetalleId(id)} />
      ) : null}

      {/* ------------------------------------------------------ detalle */}
      {detalle ? (
        <Modal
          abierto
          ancho="lg"
          onCerrar={() => setDetalleId(null)}
          titulo={`${detalle.numero} · control ${detalle.numero_control}`}
          descripcion={`${detalle.cliente} · ${fecha(detalle.fecha)}`}
          acciones={
            <>
              <Button variant="ghost" onClick={() => setDetalleId(null)}>
                Cerrar
              </Button>
              <Button
                variant="outline"
                icon={<Printer />}
                disabled={renglonesDetalle.isPending}
                onClick={() => void imprimir(detalle)}
              >
                Imprimir
              </Button>
              {detalle.estado === 'EMITIDA' ? (
                <>
                  <Button
                    variant="outline"
                    className="text-danger"
                    onClick={() => {
                      setAnulando(detalle)
                      setMotivo('')
                    }}
                  >
                    Anular
                  </Button>
                  <Button
                    icon={<Banknote />}
                    onClick={() => {
                      setCobrando(detalle)
                      setCuentaId('')
                      setMonto('')
                      setReferencia('')
                      setIgtf(null)
                    }}
                  >
                    Registrar cobro
                  </Button>
                </>
              ) : null}
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={TONO[detalle.estado] ?? 'neutral'}>{etiquetaDe(detalle)}</Chip>
            <Chip tone="neutral">
              {CONDICIONES_PAGO.find((c) => c.valor === detalle.condicion_pago)?.etiqueta}
            </Chip>
            {detalle.dias_vencida > 0 ? (
              <Chip tone="danger">Vencida hace {detalle.dias_vencida} días</Chip>
            ) : null}
            {Number(detalle.retencion_iva) > 0 ? (
              <Chip tone="warning">Retiene IVA</Chip>
            ) : null}
            {detalle.origen === 'DIRECTA' ? (
              <Chip tone="neutral">
                {detalle.saca_material
                  ? 'Sin nota · sacó el material del patio'
                  : 'Sin nota · el material sale con notas enlazadas'}
              </Chip>
            ) : null}
          </div>

          {detalle.motivo_anulacion ? (
            <p className="text-danger mt-3 text-sm">Anulada: {detalle.motivo_anulacion}</p>
          ) : null}

          <TablaRenglones
            moneda={detalle.moneda}
            renglones={renglonesDetalle.data ?? []}
            cargando={renglonesDetalle.isPending}
          />

          <div className="bg-ink/4 rounded-card mt-4 p-4">
            <Totales
              moneda={detalle.moneda}
              subtotal={Number(detalle.subtotal)}
              descuento={Number(detalle.descuento)}
              flete={Number(detalle.flete)}
              alicuota={Number(detalle.alicuota_iva)}
              iva={Number(detalle.iva)}
              alicuotaIgtf={Number(detalle.alicuota_igtf)}
              igtf={Number(detalle.igtf)}
              total={Number(detalle.total)}
              retencion={Number(detalle.retencion_iva)}
            />
            {detalle.estado === 'EMITIDA' ? (
              <p className="text-ink/55 border-hairline mt-3 border-t pt-3 text-sm">
                Abonado {dolares(detalle.cobrado_usd)} · falta{' '}
                <span className="text-ink/85 font-semibold">{dolares(detalle.saldo_usd)}</span>
                <span className="text-ink/40 block text-xs">
                  El saldo se lleva en dólares porque se cobra en las dos monedas.
                </span>
              </p>
            ) : null}
          </div>

          {(cobros.data ?? []).length > 0 ? (
            <Card flush className="mt-4">
              <CardHeader title="Cobros" className="p-4 pb-0" />
              <div className="space-y-2 p-4 pt-3">
                {(cobros.data ?? []).map((c) => (
                  <div
                    key={c.id}
                    className={`border-hairline flex items-center justify-between gap-3 border-b pb-2 text-sm last:border-0 ${
                      c.estado === 'ANULADO' ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-ink/80">
                        {c.numero} ·{' '}
                        {nombreDe(metodos, c.metodo)}
                        {c.estado === 'ANULADO' ? ' · anulado' : ''}
                      </p>
                      <p className="text-ink/45 text-xs">
                        {fechaHora(c.registrado_en)}
                        {c.cuenta ? ` · ${c.cuenta.nombre}` : ''}
                        {c.referencia ? ` · ref. ${c.referencia}` : ''}
                        {Number(c.igtf_monto) > 0
                          ? ` · IGTF ${dinero(c.moneda, c.igtf_monto)}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="tabular text-ink/85 font-medium">
                        {dinero(c.moneda, c.monto)}
                      </span>
                      {c.estado === 'REGISTRADO' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger"
                          disabled={anularCobro.isPending}
                          onClick={() =>
                            void anularCobro.mutateAsync({
                              id: c.id,
                              motivo: 'ANULADO DESDE LA FACTURA',
                            })
                          }
                        >
                          Anular
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {anularCobro.error ? <ErrorDeCarga error={anularCobro.error} className="mt-4" /> : null}
        </Modal>
      ) : null}

      {/* -------------------------------------------------------- cobro */}
      {cobrando ? (
        <Modal
          abierto
          onCerrar={() => setCobrando(null)}
          titulo={`Cobrar la factura ${cobrando.numero}`}
          descripcion={`${cobrando.cliente} · faltan ${dolares(cobrando.saldo_usd)}`}
          acciones={
            <>
              <Button variant="ghost" onClick={() => setCobrando(null)}>
                Cancelar
              </Button>
              <Button
                disabled={cobrar.isPending || !cuentaId || !Number(monto) || metodoNoVale}
                onClick={async () => {
                  await cobrar.mutateAsync({
                    factura_id: cobrando.id,
                    cuenta_id: Number(cuentaId),
                    monto: Number(monto),
                    metodo,
                    referencia: referencia || null,
                    igtf: igtf ?? (aplicaIgtf ? null : false),
                  })
                  setCobrando(null)
                  setDetalleId(null)
                }}
              >
                {cobrar.isPending ? 'Registrando…' : 'Registrar el cobro'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectBuscable
              label="A qué cuenta entró"
              vacio="Elige la cuenta"
              valor={cuentaId}
              onCambio={(v) => {
                setCuentaId(v)
                setIgtf(null)
                // Un pago móvil elegido antes que una cuenta en dólares no se
                // queda puesto: vuelve a la transferencia, que vale en todas.
                const moneda = cuentas?.find((c) => String(c.id) === v)?.moneda
                if (!metodosParaMoneda(metodos, moneda).some((m) => m.codigo === metodo)) {
                  setMetodo('TRANSFERENCIA')
                }
              }}
              opciones={(cuentas ?? [])
                .filter((c) => c.activa)
                .map((c) => ({
                  valor: String(c.id),
                  etiqueta: `${c.nombre} · ${c.moneda}`,
                }))}
              hint="El cobro se registra en la moneda de la cuenta."
            />
            <Input
              label={`Monto${cuenta ? ` en ${cuenta.moneda}` : ''}`}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              required
            />
            <Select
              label="Cómo pagó"
              value={metodo}
              onChange={(e) => setMetodo(e.target.value)}
              opciones={opcionesDe(metodosDeLaCuenta)}
              hint={
                cuenta
                  ? 'Queda guardado en el cobro y en los movimientos de dinero.'
                  : 'Elige primero la cuenta: el pago móvil solo va en bolívares.'
              }
              error={metodoNoVale ? `${nombreDe(metodos, metodo)} no se usa en ${cuenta?.moneda}.` : undefined}
            />
            <Input
              label="Referencia"
              placeholder={
                metodo === 'EFECTIVO' ? 'Se genera sola' : 'Número de la transferencia'
              }
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              hint={
                metodo === 'EFECTIVO'
                  ? 'En efectivo no hay número que copiar: si lo dejas vacío, el sistema le pone uno (EFEUSD-2026-0001).'
                  : 'El número que devolvió el banco o la plataforma.'
              }
            />
          </div>

          {cuenta ? (
            <label className="text-ink/75 mt-4 flex cursor-pointer items-start gap-2 text-sm select-none">
              <input
                type="checkbox"
                className="accent-royal-600 mt-0.5 size-4"
                // Una factura que ya lleva su IGTF no se lo vuelve a cobrar.
                checked={igtf ?? (aplicaIgtf && cuenta.moneda !== 'VES' && !(Number(cobrando.igtf) > 0))}
                onChange={(e) => setIgtf(e.target.checked)}
              />
              <span>
                Cobrarle el IGTF del 3%
                <span className="text-ink/45 block text-xs leading-relaxed">
                  Grava los pagos en divisas. No abona la factura: es un impuesto que se recauda y
                  se entera al SENIAT, y va en su propio asiento del libro.
                </span>
              </span>
            </label>
          ) : null}

          {cobrar.error ? <ErrorDeCarga error={cobrar.error} className="mt-4" /> : null}
        </Modal>
      ) : null}

      {/* ------------------------------------------------------- anular */}
      {anulando ? (
        <Modal
          abierto
          onCerrar={() => setAnulando(null)}
          titulo={`Anular la factura ${anulando.numero}`}
          descripcion="La factura no se borra: se queda con su número, marcada como anulada. Sus notas de entrega vuelven a quedar despachadas, sin factura."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setAnulando(null)}>
                No anular
              </Button>
              <Button
                disabled={anular.isPending || motivo.trim().length < 4}
                onClick={async () => {
                  await anular.mutateAsync({ id: anulando.id, motivo })
                  setAnulando(null)
                  setDetalleId(null)
                }}
              >
                {anular.isPending ? 'Anulando…' : 'Anular la factura'}
              </Button>
            </>
          }
        >
          <p className="text-ink/60 mb-4 text-sm leading-relaxed">
            Anular sirve mientras la factura no haya salido de la empresa. Una que ya está en manos
            del cliente se corrige con nota de crédito, no anulándola.
          </p>
          <Textarea
            label="Por qué se anula"
            hint="Queda en el registro de auditoría con tu nombre y la hora."
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            required
          />
          {anular.error ? <ErrorDeCarga error={anular.error} className="mt-4" /> : null}
        </Modal>
      ) : null}

      <Visor
        abierto={pdf !== null}
        onCerrar={() => setPdf(null)}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ""}
        titulo="Factura"
      />
    </>
  )
}
