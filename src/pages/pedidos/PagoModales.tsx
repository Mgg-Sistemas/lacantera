import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { cn } from '@/lib/cn'
import { useTasaVigente } from '@/lib/api/tasas'
import {
  borrarArchivoPago,
  borrarArchivosDirecto,
  subirArchivoDirecto,
  subirArchivoPago,
  useAbonos,
  useMarcarPagada,
  usePagarServicioDirecto,
  useRegistrarAbono,
  type Abono,
  type ArchivoSubido,
  type Orden,
  type ServicioDirecto,
} from '@/lib/api/pedidos'
import { fechaHoraVE, money } from '@/lib/pedidos'
import { r2 } from '@/lib/ofertas'
import {
  MAX_DETALLE_OTRO,
  METODOS_PAGO,
  abrirArchivoPago,
  basesPago,
  errorDetalleOtro,
  etiquetaDocumento,
  nombreMetodoPago,
  labelRetencion,
  leerMonto,
  monedaPorMetodo,
  montoAPagar,
  pagoEnEfectivo,
  resumenDatosPago,
  saldoCredito,
  totalRetenciones,
  type MonedaPago,
} from '@/lib/pagos'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { abrirArchivoDirecto } from './ordenDesdeDirecto'

/*
  EL PAGO Y LOS ABONOS, DENTRO DE COMPRAS (fase 3)

  En MGG esto es Tesorería: «Pagar OC» (`PagarOrdenModal`) con caja, motivo de
  pago y comprobante, y «Cuentas por pagar (créditos)» con los abonos. Aquí no
  hay Tesorería (decisión de la dueña): se registra el pago —fecha, referencia,
  monto y el comprobante, que se puede subir o no— y los abonos del crédito, sin
  mover ninguna caja. Todo queda en la trazabilidad de la orden.
*/

const hoyCaracas = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })

const fmtMoneda = (n: number, m: string): string =>
  m === 'USD' ? money(n) : `${m} ${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const abrirArchivo = abrirArchivoPago

function Mosaico({ k, v, tono }: { k: string; v: string; tono?: 'success' | 'warning' | 'danger' | 'royal' }) {
  return (
    <div className="border-hairline rounded-[8px] border px-3 py-2">
      <div className="text-ink/50 text-[11px] font-semibold tracking-wide uppercase">{k}</div>
      <div
        className={cn(
          'font-mono text-lg font-bold',
          tono === 'success' && 'text-success',
          tono === 'warning' && 'text-warning',
          tono === 'danger' && 'text-danger',
          tono === 'royal' && 'text-royal-700 dark:text-royal-300',
        )}
      >
        {v}
      </div>
    </div>
  )
}

/** Fecha, moneda, monto, tasa, referencia, comprobante y nota: lo común del pago y del abono. */
function CamposPago({
  fecha,
  setFecha,
  moneda,
  setMoneda,
  monto,
  setMonto,
  tasa,
  setTasa,
  referencia,
  setReferencia,
  sinReferencia,
  archivo,
  setArchivo,
  nota,
  setNota,
}: {
  fecha: string
  setFecha: (v: string) => void
  moneda: MonedaPago
  setMoneda: (v: MonedaPago) => void
  monto: string
  setMonto: (v: string) => void
  tasa: string
  setTasa: (v: string) => void
  referencia: string
  setReferencia: (v: string) => void
  sinReferencia: boolean
  archivo: File | null
  setArchivo: (f: File | null) => void
  nota: string
  setNota: (v: string) => void
}) {
  const montoUsd = moneda === 'Bs' ? (leerMonto(tasa) > 0 ? r2(leerMonto(monto) / leerMonto(tasa)) : 0) : leerMonto(monto)
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="Fecha del pago *" type="date" value={fecha} max={hoyCaracas()} onChange={(e) => setFecha(e.target.value)} />
        <Select
          label="Moneda"
          value={moneda}
          onChange={(e) => setMoneda(e.target.value as MonedaPago)}
          opciones={[
            { valor: 'USD', etiqueta: 'Dólares ($)' },
            { valor: 'Bs', etiqueta: 'Bolívares (Bs)' },
            { valor: 'USDT', etiqueta: 'USDT' },
          ]}
        />
        <Input label={`Monto pagado (${moneda}) *`} type="number" limite={{ maxDecimales: 2, sinNegativos: true }} placeholder="0,00" value={monto} onChange={(e) => setMonto(e.target.value)} />
      </div>
      {moneda === 'Bs' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Tasa (Bs por $) *" type="number" limite={{ maxDecimales: 8, sinNegativos: true }} value={tasa} onChange={(e) => setTasa(e.target.value)} />
          <div className="text-ink/60 self-end pb-2 text-sm">
            Equivale a <strong className="font-mono">{money(montoUsd)}</strong>
          </div>
        </div>
      ) : null}
      <Input
        label={sinReferencia ? 'Referencia' : 'Referencia *'}
        sinNormalizar
        maxLength={80}
        placeholder="N° de la transferencia, del pago móvil, hash…"
        hint={sinReferencia ? 'En efectivo no hace falta.' : undefined}
        value={referencia}
        onChange={(e) => setReferencia(e.target.value)}
      />
      <div>
        <div className="text-ink/75 mb-1.5 text-sm font-medium">Comprobante de pago (PDF o imagen, máx. 10 MB)</div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="file" accept="application/pdf,image/*" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
          {archivo ? (
            <Button size="sm" variant="ghost" onClick={() => setArchivo(null)}>
              ✕ Quitar
            </Button>
          ) : null}
        </div>
      </div>
      <Textarea label="Nota" rows={2} placeholder="Observaciones del pago…" value={nota} onChange={(e) => setNota(e.target.value)} />
    </div>
  )
}

function validarArchivo(f: File | null): string | null {
  if (!f) return null
  if (f.type && f.type !== 'application/pdf' && !f.type.startsWith('image/')) return 'El comprobante debe ser un PDF o una imagen.'
  if (f.size > 10 * 1024 * 1024) return 'El comprobante supera los 10 MB.'
  return null
}

// ---------------------------------------------------------------------------
// 💵 Marcar pagada
// ---------------------------------------------------------------------------

export function MarcarPagadaModal({
  orden: o,
  onClose,
  onListo,
  directo,
}: {
  orden: Orden
  onClose: () => void
  onListo: () => void
  /** El servicio directo que se paga (la `orden` es `ordenDesdeDirecto(directo)`): queda Finalizado. */
  directo?: ServicioDirecto
}) {
  const pagar = useMarcarPagada()
  const pagarDirecto = usePagarServicioDirecto()
  const { data: tasaHoy } = useTasaVigente()
  const aPagar = montoAPagar(o)
  const metodos = o.metodo_pago ?? []
  const efectivo = pagoEnEfectivo(metodos)
  const monedaInicial = (metodos.length === 1 ? monedaPorMetodo(metodos[0].metodo) : 'USD') as MonedaPago

  const [fecha, setFecha] = useState(hoyCaracas())
  const [moneda, setMoneda] = useState<MonedaPago>(monedaInicial)
  const [tasa, setTasa] = useState(tasaHoy ? String(tasaHoy.tasa) : '')
  const [monto, setMonto] = useState(() =>
    monedaInicial === 'Bs' && tasaHoy ? String(r2(aPagar * Number(tasaHoy.tasa))) : String(aPagar),
  )
  const [referencia, setReferencia] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const ocCodigo = o.oc_codigo ?? o.codigo
  const rets = o.retenciones ?? []

  function cambiarMoneda(m: MonedaPago) {
    setMoneda(m)
    const t = leerMonto(tasa) || Number(tasaHoy?.tasa) || 0
    if (m === 'Bs' && t > 0) {
      if (!tasa) setTasa(String(t))
      setMonto(String(r2(aPagar * t)))
    } else if (m !== 'Bs') setMonto(String(aPagar))
  }

  async function onPagar() {
    setError(null)
    if (!fecha) return setError('Indicá la fecha del pago.')
    if (!(leerMonto(monto) > 0)) return setError('Indicá el monto pagado.')
    if (moneda === 'Bs' && !(leerMonto(tasa) > 0)) return setError('Indicá la tasa (Bs por $) para pasar el pago a dólares.')
    if (!referencia.trim() && !efectivo) return setError('Indicá la referencia del pago.')
    const eArch = validarArchivo(archivo)
    if (eArch) return setError(eArch)
    setGuardando(true)
    let subido: ArchivoSubido | null = null
    try {
      if (archivo) subido = directo ? await subirArchivoDirecto(directo.id, 'pago', archivo) : await subirArchivoPago(o.id, 'pago', archivo)
      const datos = {
        fecha,
        monto: leerMonto(monto),
        moneda,
        tasa: moneda === 'Bs' ? leerMonto(tasa) : null,
        referencia: referencia.trim() || null,
        comprobante: subido,
        nota: nota.trim() || null,
      }
      if (directo) {
        const r = await pagarDirecto.mutateAsync({ id: directo.id, datos })
        toast(`Servicio directo ${directo.codigo} pagado · ${money(r.monto_usd)}`, 'success')
      } else {
        const r = await pagar.mutateAsync({ id: o.id, datos })
        toast(
          `OC ${ocCodigo} pagada · ${money(r.monto_usd)}${r.estado === 'por_recibir' ? ' · pendiente por recepción' : ''}`,
          'success',
        )
      }
      onListo()
    } catch (e) {
      if (subido) void (directo ? borrarArchivosDirecto([subido.path]) : borrarArchivoPago(subido.path))
      setError(mensajeDe(e, 'No se pudo registrar el pago'))
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onClose}
      titulo={directo ? `Pagar servicio directo · ${directo.codigo}` : `Pagar OC ${ocCodigo}`}
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button className="bg-success hover:bg-success hover:brightness-95" onClick={() => void onPagar()} disabled={guardando}>
            {guardando ? 'Guardando…' : `${directo ? 'PAGAR SERVICIO' : 'PAGAR ORDEN'} · ${money(aPagar)}`}
          </Button>
        </>
      }
    >
      {directo ? (
        <p className="text-ink/65 mb-3 text-sm">
          Registrá el pago del servicio: la fecha, la referencia y el monto; el comprobante se puede subir o no. Al guardar, el
          servicio queda <strong>Finalizado</strong>.
        </p>
      ) : o.clase === 'servicio' ? (
        <p className="text-ink/65 mb-3 text-sm">
          Registrá el pago al proveedor: la fecha, la referencia y el monto; el comprobante se puede subir o no. Al guardar, el
          servicio pasa a <strong>Pagado</strong>
          {o.recibida_en ? ' (ya se prestó: queda listo para finalizar).' : ': después Compras confirma «🔧 Servicio realizado».'}
        </p>
      ) : (
        <p className="text-ink/65 mb-3 text-sm">
          Registrá el pago al proveedor: la fecha, la referencia y el monto; el comprobante se puede subir o no. Al guardar, la OC
          pasa a <strong>{o.recibida_en ? 'Pagada' : 'Pendiente por recepción'}</strong>
          {o.recibida_en ? ' (ya se recibió: queda lista para finalizar).' : ' y el almacén recibe el aviso.'}
        </p>
      )}
      {error ? (
        <div className="border-danger text-danger mb-3 rounded-[6px] border px-3 py-2 text-sm">
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <Mosaico k={directo ? 'Total del servicio' : 'Total OC'} v={money(basesPago(o).total)} />
        <Mosaico k="Retenciones y descuento" v={`− ${money(r2(totalRetenciones(rets) + (Number(o.descuento_pago) || 0)))}`} tono="danger" />
        <Mosaico k="Monto a pagar" v={money(aPagar)} tono="success" />
      </div>

      <div className="border-hairline mb-3 space-y-1 rounded-[8px] border px-3 py-2 text-sm">
        <div>
          <span className="text-ink/55">Documento:</span> <strong>{etiquetaDocumento(o.comprobante_tipo)}</strong>
        </div>
        {rets.map((r) => (
          <div key={r.tipo}>
            <span className="text-ink/55">🧾 Retención {labelRetencion(r)}:</span>{' '}
            <strong className="text-danger font-mono">− {money(r.monto)}</strong>
          </div>
        ))}
        {Number(o.descuento_pago) > 0 ? (
          <div>
            <span className="text-ink/55">🏷 Descuento en el pago:</span> <strong className="font-mono">− {money(o.descuento_pago)}</strong>
          </div>
        ) : null}
        <div className="text-ink/55 pt-1">Método de pago indicado{efectivo ? ' · efectivo' : ''}:</div>
        {metodos.map((m, i) => (
          <div key={i} className="pl-2">
            💳 <strong>{nombreMetodoPago(m.metodo, m.detalle)}</strong>
            {Number(m.monto) > 0 ? ` · ${fmtMoneda(Number(m.monto), String(m.moneda))}` : ''}
            {m.datos && resumenDatosPago(m.metodo, m.datos) ? (
              <div className="text-ink/60 pl-5 text-xs">↳ {resumenDatosPago(m.metodo, m.datos)}</div>
            ) : null}
          </div>
        ))}
        {o.numero_administracion ? (
          <div>
            <span className="text-ink/55">📞 Tel. administración del proveedor:</span> {o.numero_administracion}
          </div>
        ) : null}
        {o.pago_qr_path ? (
          <Button size="sm" variant="ghost" onClick={() => void (directo ? abrirArchivoDirecto(o.pago_qr_path!) : abrirArchivo(o.pago_qr_path!))}>
            📷 Ver QR / imagen de pago
          </Button>
        ) : null}
      </div>

      <CamposPago
        fecha={fecha}
        setFecha={setFecha}
        moneda={moneda}
        setMoneda={cambiarMoneda}
        monto={monto}
        setMonto={setMonto}
        tasa={tasa}
        setTasa={setTasa}
        referencia={referencia}
        setReferencia={setReferencia}
        sinReferencia={efectivo}
        archivo={archivo}
        setArchivo={setArchivo}
        nota={nota}
        setNota={setNota}
      />
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// 💵 Registrar abono (crédito)
// ---------------------------------------------------------------------------

export function AbonoModal({
  orden: o,
  onClose,
  onListo,
}: {
  orden: Orden
  onClose: () => void
  /** El abono recién registrado, para el aviso por WhatsApp. */
  onListo: (a: Abono) => void
}) {
  const abonar = useRegistrarAbono()
  const { data: tasaHoy } = useTasaVigente()
  const saldo = saldoCredito(o)
  const [metodo, setMetodo] = useState('transferencia')
  // Con «Otro»: cuál método es (la dueña, 09/11/2026).
  const [metodoDetalle, setMetodoDetalle] = useState('')
  const [fecha, setFecha] = useState(hoyCaracas())
  const [moneda, setMoneda] = useState<MonedaPago>('USD')
  const [tasa, setTasa] = useState(tasaHoy ? String(tasaHoy.tasa) : '')
  const [monto, setMonto] = useState('')
  const [referencia, setReferencia] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const efectivo = !!METODOS_PAGO.find((m) => m.value === metodo)?.sinComprobante
  const montoUsd = moneda === 'Bs' ? (leerMonto(tasa) > 0 ? r2(leerMonto(monto) / leerMonto(tasa)) : 0) : leerMonto(monto)
  const ocCodigo = o.oc_codigo ?? o.codigo

  function cambiarMoneda(m: MonedaPago) {
    setMoneda(m)
    if (m === 'Bs' && !tasa && tasaHoy) setTasa(String(tasaHoy.tasa))
  }

  async function onAbonar() {
    setError(null)
    if (!fecha) return setError('Indicá la fecha del pago.')
    const eOtro = errorDetalleOtro(metodo, metodoDetalle)
    if (eOtro) return setError(eOtro)
    if (!(leerMonto(monto) > 0)) return setError('Indicá cuánto abonar.')
    if (moneda === 'Bs' && !(leerMonto(tasa) > 0)) return setError('Indicá la tasa (Bs por $) para pasar el pago a dólares.')
    if (montoUsd > saldo + 0.01) return setError(`El abono (${money(montoUsd)}) supera el saldo pendiente (${money(saldo)}).`)
    if (!referencia.trim() && !efectivo) return setError('Indicá la referencia del abono.')
    const eArch = validarArchivo(archivo)
    if (eArch) return setError(eArch)
    setGuardando(true)
    let subido: ArchivoSubido | null = null
    try {
      if (archivo) subido = await subirArchivoPago(o.id, 'abono', archivo)
      const datos = {
        fecha,
        monto: leerMonto(monto),
        moneda,
        tasa: moneda === 'Bs' ? leerMonto(tasa) : null,
        metodo,
        metodo_detalle: metodo === 'otro' ? metodoDetalle.trim() : null,
        referencia: referencia.trim() || null,
        comprobante: subido,
        nota: nota.trim() || null,
      }
      const r = await abonar.mutateAsync({ id: o.id, datos })
      toast(`Abono ${money(Math.min(montoUsd, saldo))} · ${ocCodigo}`, 'success')
      onListo({
        id: r.id,
        orden_id: o.id,
        fecha,
        monto: Math.min(montoUsd, saldo),
        moneda,
        monto_moneda: leerMonto(monto),
        tasa: datos.tasa,
        metodo,
        metodo_detalle: datos.metodo_detalle,
        referencia: datos.referencia,
        comprobante_path: subido?.path ?? null,
        comprobante_nombre: subido?.filename ?? null,
        nota: datos.nota,
        saldo_restante: r.saldo,
        registrado_por: '',
        registrado_por_nombre: null,
        registrado_en: new Date().toISOString(),
      })
    } catch (e) {
      if (subido) void borrarArchivoPago(subido.path)
      setError(mensajeDe(e, 'No se pudo registrar el abono'))
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onClose}
      titulo={`Registrar abono · OC ${ocCodigo}`}
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button className="bg-success hover:bg-success hover:brightness-95" onClick={() => void onAbonar()} disabled={guardando}>
            {guardando ? 'Guardando…' : `💵 Registrar abono · ${money(montoUsd)}`}
          </Button>
        </>
      }
    >
      {error ? (
        <div className="border-danger text-danger mb-3 rounded-[6px] border px-3 py-2 text-sm">
          <strong>Error:</strong> {error}
        </div>
      ) : null}
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <Mosaico k="Monto a pagar" v={money(montoAPagar(o))} />
        <Mosaico k="Abonado" v={money(o.abonado_total)} tono="royal" />
        <Mosaico k="Saldo" v={money(saldo)} tono={saldo > 0.01 ? 'warning' : 'success'} />
      </div>
      <Select
        className="mb-3"
        label="Método del abono"
        value={metodo}
        onChange={(e) => {
          setMetodo(e.target.value)
          cambiarMoneda(monedaPorMetodo(e.target.value))
        }}
        opciones={METODOS_PAGO.map((m) => ({ valor: m.value, etiqueta: m.label }))}
      />
      {metodo === 'otro' ? (
        <Input
          className="mb-3"
          label="¿Cuál método? *"
          placeholder="Ej.: PayPal, cheque, Cashea…"
          maxLength={MAX_DETALLE_OTRO}
          value={metodoDetalle}
          onChange={(e) => setMetodoDetalle(e.target.value)}
        />
      ) : null}
      <CamposPago
        fecha={fecha}
        setFecha={setFecha}
        moneda={moneda}
        setMoneda={cambiarMoneda}
        monto={monto}
        setMonto={setMonto}
        tasa={tasa}
        setTasa={setTasa}
        referencia={referencia}
        setReferencia={setReferencia}
        sinReferencia={efectivo}
        archivo={archivo}
        setArchivo={setArchivo}
        nota={nota}
        setNota={setNota}
      />
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// 📋 Ver crédito / historial (MGG `AbonosModal`)
// ---------------------------------------------------------------------------

export function CreditoModal({
  orden: o,
  puedeAbonar,
  onAbonar,
  onClose,
}: {
  orden: Orden
  puedeAbonar: boolean
  onAbonar: () => void
  onClose: () => void
}) {
  const { data: abonos = [], isPending } = useAbonos(o.id)
  const saldo = saldoCredito(o)
  const rets = o.retenciones ?? []
  return (
    <Modal
      abierto
      onCerrar={onClose}
      titulo={`Crédito · OC ${o.oc_codigo ?? o.codigo}`}
      ancho="lg"
      acciones={
        <>
          {puedeAbonar && saldo > 0.01 ? <Button onClick={onAbonar}>💵 Registrar abono</Button> : null}
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </>
      }
    >
      <div className="mb-3 grid gap-2 sm:grid-cols-4">
        <Mosaico k="Total" v={money(basesPago(o).total)} />
        <Mosaico k="Retenciones" v={`− ${money(totalRetenciones(rets))}`} tono="danger" />
        <Mosaico k="Abonado" v={money(o.abonado_total)} tono="royal" />
        <Mosaico k="Saldo" v={money(saldo)} tono={saldo > 0.01 ? 'warning' : 'success'} />
      </div>
      <div className={cn('mb-3 rounded-[8px] border px-3 py-2 text-sm', saldo <= 0.01 ? 'border-success' : 'border-royal-600/50')}>
        {saldo <= 0.01 ? (
          <>
            ✅ <strong>Crédito pagado en su totalidad.</strong>{' '}
            {o.recibida_en ? 'Ya se recibió: queda para finalizar.' : 'Desde el detalle podés enviarla a Pendiente por recepción.'}
          </>
        ) : (
          <>
            💳 Monto a pagar <strong>{money(montoAPagar(o))}</strong> (total − retenciones). Los abonos se registran con{' '}
            <strong>«💵 Registrar abono»</strong>; aquí ves el historial.
          </>
        )}
      </div>
      <div className="border-hairline overflow-x-auto rounded-[6px] border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-ink/4 text-ink/55 text-left text-xs">
            <tr>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 text-right font-medium">Monto</th>
              <th className="px-3 py-2 font-medium">Método</th>
              <th className="px-3 py-2 font-medium">Referencia</th>
              <th className="px-3 py-2 text-right font-medium">Saldo</th>
              <th className="px-3 py-2 font-medium">Comprobante</th>
              <th className="px-3 py-2 font-medium">Nota</th>
            </tr>
          </thead>
          <tbody>
            {isPending ? (
              <tr>
                <td colSpan={7} className="text-ink/50 px-3 py-3">
                  Cargando…
                </td>
              </tr>
            ) : !abonos.length ? (
              <tr>
                <td colSpan={7} className="text-ink/50 px-3 py-4 text-center">
                  💵 Sin abonos todavía.
                </td>
              </tr>
            ) : (
              abonos.map((a) => (
                <tr key={a.id} className="border-hairline border-t">
                  <td className="px-3 py-2 text-xs">
                    {a.fecha.split('-').reverse().join('/')}
                    <div className="text-ink/45">
                      {a.registrado_por_nombre ?? '—'} · {fechaHoraVE(a.registrado_en)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {money(a.monto)}
                    {a.moneda !== 'USD' ? (
                      <div className="text-ink/45 text-xs">{fmtMoneda(Number(a.monto_moneda), a.moneda)}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{nombreMetodoPago(a.metodo, a.metodo_detalle)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{a.referencia ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono">{a.saldo_restante != null ? money(a.saldo_restante) : '—'}</td>
                  <td className="px-3 py-2">
                    {a.comprobante_path ? (
                      <Button size="sm" variant="ghost" onClick={() => void abrirArchivo(a.comprobante_path!)}>
                        📎 Ver
                      </Button>
                    ) : (
                      <span className="text-ink/40">—</span>
                    )}
                  </td>
                  <td className="text-ink/60 px-3 py-2 text-xs">{a.nota ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}

