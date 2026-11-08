import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/cn'
import { BANCOS } from '@/lib/bancos'
import type { Proveedor } from '@/lib/api/catalogo'
import {
  borrarArchivoPago,
  borrarArchivosDirecto,
  subirArchivoDirecto,
  subirArchivoPago,
  useCorregirMetodoPago,
  useCuentasProveedor,
  useDocumentoRetenciones,
  useIndicarMetodoPago,
  useMetodoPagoServicioDirecto,
  useTelefonoAdministracion,
  type ArchivoSubido,
  type CuentaProveedor,
  type Orden,
  type ServicioDirecto,
} from '@/lib/api/pedidos'
import { money } from '@/lib/pedidos'
import { infoModalidad, r2 } from '@/lib/ofertas'
import {
  BASE_RETENCION,
  METODOS_PAGO,
  TIPOS_RETENCION,
  basesPago,
  calcularRetenciones,
  errorRetenciones,
  labelMetodoPago,
  leerMonto,
  monedaPorMetodo,
  montoAPagar,
  requiereDatos,
  resumenDatosPago,
  retencionesAForm,
  retencionesParaEnviar,
  totalRetenciones,
  validarDatosPago,
  type DatosPago,
  type RetencionesForm,
} from '@/lib/pagos'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'

/*
  «💳 INDICAR MÉTODO DE PAGO / ENVIAR PARA PAGAR» (MGG `MetodoPagoModal`)

  Las tarjetas de MGG, en su orden: la opción de pago elegida por el
  analista, el proveedor (con «🔁 Cambiar de proveedor (volver a cotizar)»),
  el documento (Nota de entrega
  o Factura), las retenciones, la imagen / QR de pago, el descuento en el pago,
  los métodos (multipago) con los datos del proveedor y, en contra entrega, la
  confirmación de lo recibido.

  Lo que cambia (sin Tesorería ni Retenciones):
    - No se pregunta «¿cuándo se retiene?»: con Factura se piden IVA, ISLR,
      IGTF e ISAE, cada una en % o en monto, y se restan del total. El resumen
      dice el «Monto a pagar».
    - Sin «🛵 Delivery · ¿quién entrega?».
    - Sin «📞 Teléfono de administración del proveedor» (la dueña,
      08/11/2026): va el de la OC o el de la ficha, si ya había uno.
    - Los datos del proveedor se eligen entre sus cuentas guardadas o se carga
      otra; al enviar quedan en su ficha (MGG guarda una por método).
    - En modo «corregir» (OC ya en «Confirmada pagar») también se corrigen el
      documento y las retenciones: no hay módulo de Retenciones que lo haga.

  El SERVICIO DIRECTO (fase 5a) usa esta misma pantalla con `directo`: en MGG
  lo paga Tesorería; aquí se indica el método, el documento y las
  retenciones igual que una OC. Sin «Opción de pago elegida» ni «🔁 Cambiar
  de proveedor» (no se cotizó).
*/

const CAMPO = 'rounded-control border-ink/20 bg-surface h-9 min-w-0 border px-2 text-sm'

interface Pata {
  metodo: string
  monto: string
  datos: DatosPago
  /** La cuenta guardada elegida, o 'nueva'. */
  cuenta: number | 'nueva'
}

/** Los campos de los datos de pago según el método (MGG `DatosPagoFields`). */
export function CamposDatosPago({
  metodo,
  value,
  onChange,
}: {
  metodo: string
  value: DatosPago
  onChange: (d: DatosPago) => void
}) {
  const set = (k: string, v: string) => onChange({ ...value, [k]: v })
  const soloNumeros = (v: string, max: number) => v.replace(/\D/g, '').slice(0, max)
  const banco = (
    <Select
      label="Banco *"
      vacio="— elegí el banco —"
      value={value.banco ?? ''}
      onChange={(e) => set('banco', e.target.value)}
      opciones={BANCOS.map((b) => ({ valor: b, etiqueta: b }))}
    />
  )
  if (metodo === 'pago_movil') {
    return (
      <div className="grid gap-2 sm:grid-cols-3">
        <Input label="CI o RIF *" placeholder="V-12345678 / J-..." value={value.ci_rif ?? ''} onChange={(e) => set('ci_rif', e.target.value)} />
        {banco}
        <Input
          label="Teléfono *"
          inputMode="numeric"
          sinNormalizar
          placeholder="04141234567"
          hint="11 dígitos · con el 58 adelante, 12"
          value={value.telefono ?? ''}
          onChange={(e) => set('telefono', soloNumeros(e.target.value, 12))}
        />
      </div>
    )
  }
  if (metodo === 'transferencia') {
    const cta = value.cuenta ?? ''
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Input label="Nombre / Razón social *" value={value.nombre ?? ''} onChange={(e) => set('nombre', e.target.value)} />
        <Input label="CI / RIF *" placeholder="V-12345678 / J-..." value={value.ci ?? ''} onChange={(e) => set('ci', e.target.value)} />
        {banco}
        <Input
          label="Número de cuenta *"
          inputMode="numeric"
          sinNormalizar
          placeholder="01050000000000000000"
          hint={`Solo números · ${cta.length}/20 dígitos`}
          value={cta}
          onChange={(e) => set('cuenta', soloNumeros(e.target.value, 20))}
        />
      </div>
    )
  }
  if (metodo === 'zelle') {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Input label="Nombre *" value={value.nombre ?? ''} onChange={(e) => set('nombre', e.target.value)} />
        <Input
          label="Correo *"
          type="email"
          sinNormalizar
          placeholder="correo@dominio.com"
          value={value.email ?? ''}
          onChange={(e) => set('email', e.target.value)}
        />
      </div>
    )
  }
  if (metodo === 'binance_usdt') {
    return (
      <Input
        label="Correo o ID de Binance *"
        sinNormalizar
        placeholder="correo@dominio.com o 123456789"
        value={value.email_o_id ?? ''}
        onChange={(e) => set('email_o_id', e.target.value)}
      />
    )
  }
  return null
}

/**
 * El documento y las retenciones: Factura o Nota de entrega; con Factura,
 * IVA, ISLR, IGTF e ISAE, cada una en % o en monto, y el resumen con el monto
 * a pagar. Lo usan el método de pago y «🧾 Documento y retenciones».
 */
export function DocumentoYRetenciones({
  orden: o,
  doc,
  onDoc,
  form,
  onForm,
  descuento = 0,
  deQue = 'la OC',
}: {
  orden: Orden
  doc: 'factura' | 'nota_entrega'
  onDoc: (d: 'factura' | 'nota_entrega') => void
  form: RetencionesForm
  onForm: (f: RetencionesForm) => void
  descuento?: number
  /** «la OC» o «el servicio»: de qué es el total. */
  deQue?: string
}) {
  const rets = useMemo(() => (doc === 'factura' ? calcularRetenciones(o, form) : []), [o, form, doc])
  const b = basesPago(o)
  const totalRet = totalRetenciones(rets)
  return (
    <>
      <div className="border-hairline mb-3 rounded-[8px] border px-3 py-2.5">
        <div className="text-ink/85 mb-2 text-sm font-semibold">Tipo de soporte</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ['nota_entrega', 'Nota de entrega'],
              ['factura', 'Factura'],
            ] as const
          ).map(([v, l]) => (
            <label
              key={v}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-[8px] border px-3 py-2 text-sm',
                doc === v ? 'border-royal-600' : 'border-hairline',
              )}
            >
              <input type="radio" name="documento" checked={doc === v} onChange={() => onDoc(v)} />
              <strong>{l}</strong>
            </label>
          ))}
        </div>
      </div>

      {doc === 'factura' ? (
        <div className="border-hairline mb-3 rounded-[8px] border px-3 py-2.5">
          <div className="text-ink/85 text-sm font-semibold">Retenciones</div>
          <p className="text-ink/55 mb-2 text-xs">
            Indicá cada retención en % o en monto; las que no retienen se dejan en blanco. Se restan del total de {deQue}.
          </p>
          <div className="space-y-2">
            {TIPOS_RETENCION.map((tipo) => {
              const r = form[tipo]
              const calc = rets.find((x) => x.tipo === tipo)
              return (
                <div key={tipo} className="flex flex-wrap items-center gap-2">
                  <span className="w-12 text-sm font-semibold">{tipo}</span>
                  <select
                    className={CAMPO}
                    aria-label={`Retención de ${tipo}: porcentaje o monto`}
                    value={r.modo}
                    onChange={(e) => onForm({ ...form, [tipo]: { ...r, modo: e.target.value as 'porcentaje' | 'monto' } })}
                  >
                    <option value="porcentaje">%</option>
                    <option value="monto">Monto ($)</option>
                  </select>
                  <input
                    className={cn(CAMPO, 'w-28 text-right font-mono')}
                    inputMode="decimal"
                    aria-label={`Retención de ${tipo}`}
                    placeholder={r.modo === 'porcentaje' ? 'ej. 75' : '0,00'}
                    value={r.valor}
                    onChange={(e) => onForm({ ...form, [tipo]: { ...r, valor: e.target.value } })}
                  />
                  <span className="text-ink/45 text-xs">
                    {r.modo === 'porcentaje'
                      ? `${BASE_RETENCION[tipo]} (${money(tipo === 'IVA' ? b.iva : tipo === 'IGTF' ? b.total : b.base)})`
                      : ''}
                  </span>
                  {calc ? <span className="text-danger ml-auto font-mono text-sm">− {money(calc.monto)}</span> : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="border-royal-600/40 bg-royal-600/5 mb-3 rounded-[8px] border px-3 py-2 text-sm">
        <div className="flex justify-between">
          <span>{deQue === 'la OC' ? 'Total OC' : 'Total del servicio'}</span>
          <strong className="font-mono">{money(b.total)}</strong>
        </div>
        {descuento > 0 ? (
          <div className="flex justify-between">
            <span>− Descuento en el pago</span>
            <strong className="text-success font-mono">− {money(descuento)}</strong>
          </div>
        ) : null}
        {rets.map((r) => (
          <div key={r.tipo} className="flex justify-between">
            <span>− Retención {r.tipo}</span>
            <strong className="text-danger font-mono">− {money(r.monto)}</strong>
          </div>
        ))}
        <div className="border-hairline mt-1 flex justify-between border-t pt-1 text-base">
          <span className="font-semibold">Monto a pagar</span>
          <strong className="text-success font-mono">{money(r2(Math.max(0, b.total - descuento - totalRet)))}</strong>
        </div>
      </div>
    </>
  )
}

/** La pata de método vacía, con la primera cuenta guardada de ese método. */
function pataNueva(metodo: string, cuentas: CuentaProveedor[]): Pata {
  const c = cuentas.find((x) => x.metodo === metodo)
  return { metodo, monto: '', datos: c ? { ...c.datos } : {}, cuenta: c ? c.id : 'nueva' }
}

export function MetodoPagoModal({
  orden: o,
  proveedor,
  modo,
  onClose,
  onListo,
  onReabrir,
  directo,
}: {
  orden: Orden
  proveedor: Proveedor | undefined
  /** 'enviar' = indicar el método y mandar a pagar; 'corregir' = ya está en «Confirmada pagar». */
  modo: 'enviar' | 'corregir'
  onClose: () => void
  onListo: () => void
  /** «🔁 Cambiar de proveedor (volver a cotizar)», con su motivo. */
  onReabrir?: (motivo: string) => Promise<void>
  /** El servicio directo cuyo pago se indica (la `orden` es `ordenDesdeDirecto(directo)`). */
  directo?: ServicioDirecto
}) {
  const corrigiendo = modo === 'corregir'
  const indicar = useIndicarMetodoPago()
  const corregir = useCorregirMetodoPago()
  const metodoDirecto = useMetodoPagoServicioDirecto()
  const deQue = directo ? 'el servicio' : 'la OC'
  const { data: cuentas = [] } = useCuentasProveedor(o.proveedor_id)
  const { data: telFicha } = useTelefonoAdministracion(o.proveedor_id)

  const [patas, setPatas] = useState<Pata[]>(() =>
    corrigiendo && o.metodo_pago?.length
      ? o.metodo_pago.map((m) => ({
          metodo: m.metodo,
          monto: Number(m.monto) > 0 ? String(m.monto) : '',
          datos: { ...(m.datos ?? {}) },
          cuenta: 'nueva' as const,
        }))
      : [{ metodo: 'divisas_efectivo', monto: '', datos: {}, cuenta: 'nueva' }],
  )
  const [doc, setDoc] = useState<'factura' | 'nota_entrega'>(o.comprobante_tipo ?? (directo ? 'factura' : 'nota_entrega'))
  const [retForm, setRetForm] = useState<RetencionesForm>(() => retencionesAForm(o.retenciones))
  const [qr, setQr] = useState<File | null>(null)
  const [incluyeDesc, setIncluyeDesc] = useState(false)
  const [descModo, setDescModo] = useState<'monto' | 'pct'>('monto')
  const [descStr, setDescStr] = useState('')
  const [notaEntrega, setNotaEntrega] = useState(false)
  const [reabriendo, setReabriendo] = useState(false)
  const [motivoCambio, setMotivoCambio] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)


  // La primera vez que llegan las cuentas, la pata de partida toma la suya.
  const [cuentasPuestas, setCuentasPuestas] = useState(false)
  useEffect(() => {
    if (cuentasPuestas || !cuentas.length || corrigiendo) return
    setCuentasPuestas(true)
    setPatas((ps) => ps.map((p) => (requiereDatos(p.metodo) && !Object.keys(p.datos).length ? pataNueva(p.metodo, cuentas) : p)))
  }, [cuentas, cuentasPuestas, corrigiendo])

  const esContraEntrega = o.condiciones_pago === 'contra_entrega'
  const puedeCambiarProveedor = !directo && !corrigiendo && o.estado === 'confirmada_metodo' && !!onReabrir
  const b = basesPago(o)
  const descPct = incluyeDesc && descModo === 'pct' ? Math.max(0, Math.min(100, leerMonto(descStr))) : 0
  const descNum = !incluyeDesc ? 0 : descModo === 'pct' ? r2((b.total * descPct) / 100) : Math.max(0, r2(leerMonto(descStr)))
  const descuentoActual = corrigiendo ? Number(o.descuento_pago) || 0 : descNum
  const esMultipago = patas.length > 1
  const ocCodigo = o.oc_codigo ?? o.codigo

  const setPata = (i: number, c: Partial<Pata>) => setPatas((ps) => ps.map((p, k) => (k === i ? { ...p, ...c } : p)))

  async function enviar() {
    setError(null)
    if (!o.proveedor_id && !directo) return setError('Indicá el proveedor.')
    if (reabriendo) {
      const m = motivoCambio.trim()
      if (!m) return setError('Escribí el motivo del cambio de proveedor.')
      if (m.length < 5) return setError('El motivo es muy corto (mínimo 5 letras).')
      setGuardando(true)
      try {
        await onReabrir?.(m)
      } catch (e) {
        setError(mensajeDe(e, 'No se pudo reabrir la cotización'))
        setGuardando(false)
      }
      return
    }
    if (!patas.length) return setError('Indicá al menos un método de pago.')
    if (esMultipago && patas.some((p) => !(leerMonto(p.monto) > 0))) return setError('En multipago, indicá el monto por cada método/moneda.')
    if (esContraEntrega && !corrigiendo && !notaEntrega)
      return setError('Confirmá la Nota de entrega (verificaste lo recibido) antes de enviar a pagar.')
    if (doc === 'factura') {
      const e = errorRetenciones(o, retForm, descuentoActual)
      if (e) return setError(e)
    }
    if (incluyeDesc && !corrigiendo) {
      if (descNum <= 0) return setError('Indicá el monto del descuento o desmarcá «El pago incluye descuento».')
      if (descNum > b.total) return setError(`El descuento no puede superar el total de ${deQue}.`)
    }
    for (const p of patas) {
      if (requiereDatos(p.metodo)) {
        const e = validarDatosPago(p.metodo, p.datos)
        if (e) return setError(`${labelMetodoPago(p.metodo)}: ${e}`)
      }
    }

    setGuardando(true)
    let subido: ArchivoSubido | null = null
    try {
      if (qr && !corrigiendo) {
        if (qr.type && !qr.type.startsWith('image/')) throw new Error('El QR / comprobante de pago debe ser una imagen.')
        subido = directo ? await subirArchivoDirecto(directo.id, 'qr', qr) : await subirArchivoPago(o.id, 'qr', qr)
      }
      const datos = {
        metodos: patas.map((p) => ({
          metodo: p.metodo,
          monto: leerMonto(p.monto),
          ...(requiereDatos(p.metodo) ? { datos: p.datos } : {}),
        })),
        // Ya no se pide (08/11/2026): va el de la OC o el de la ficha, si hay.
        numero_administracion: (o.numero_administracion ?? telFicha ?? '').trim(),
        comprobante_tipo: doc,
        retenciones: doc === 'factura' ? retencionesParaEnviar(retForm) : [],
        ...(corrigiendo
          ? {}
          : {
              descuento_pago: incluyeDesc && descNum > 0 ? descNum : null,
              qr: subido,
              confirmo_recepcion: esContraEntrega ? notaEntrega : undefined,
            }),
      }
      const r = directo
        ? await metodoDirecto.mutateAsync({ id: directo.id, datos })
        : corrigiendo
          ? await corregir.mutateAsync({ id: o.id, datos })
          : await indicar.mutateAsync({ id: o.id, datos })
      const sujeto = directo ? `Servicio directo ${directo.codigo}` : `OC ${ocCodigo}`
      toast(
        corrigiendo
          ? `${sujeto} · método de pago corregido · monto a pagar ${money(r.monto_a_pagar)}`
          : `${sujeto} enviad${directo ? 'o' : 'a'} para pagar · monto a pagar ${money(r.monto_a_pagar)}`,
        'success',
      )
      onListo()
    } catch (e) {
      if (subido) void (directo ? borrarArchivosDirecto([subido.path]) : borrarArchivoPago(subido.path))
      setError(mensajeDe(e, 'No se pudo enviar'))
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onClose}
      titulo={`${corrigiendo ? 'Corregir método de pago' : 'Método de pago'} · ${
        directo ? `SERVICIO DIRECTO ${directo.codigo}` : o.clase === 'servicio' ? `SERVICIO ${o.codigo}` : `OC ${ocCodigo}`
      }`}
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={guardando}>
            {guardando ? 'Guardando…' : corrigiendo ? '💾 Guardar corrección' : reabriendo ? '↩ Reabrir cotizaciones' : '💳 Enviar para Pagar'}
          </Button>
        </>
      }
    >
      {corrigiendo ? (
        <p className="text-ink/65 mb-3 text-sm">
          Corregí <strong>cómo se le paga al proveedor</strong>: el método y los datos del beneficiario (banco, CI/RIF, teléfono,
          cuenta), el documento y las retenciones. {directo ? 'El servicio' : 'La OC'} <strong>no se mueve</strong>: sigue en{' '}
          <strong>{directo ? 'Confirmado pagar' : 'Confirmada pagar'}</strong>.
          El cambio queda firmado en la trazabilidad y los datos corregidos se guardan en la ficha del proveedor.
        </p>
      ) : (
        <p className="text-ink/65 mb-3 text-sm">
          Indicá <strong>con qué método(s)</strong> se va a pagar {deQue} (
          {esContraEntrega && o.recibido_total != null ? (
            <>
              recibido <strong>{money(o.recibido_total)}</strong>
            </>
          ) : (
            <>
              total <strong>{money(o.total)}</strong>
            </>
          )}
          ). Podés combinar varios (<strong>multipago</strong>); en ese caso <strong>indicá cuánto va por cada método/moneda</strong>.
          Al enviar pasa a <strong>Confirmada pagar</strong>, donde se marca pagada.
        </p>
      )}

      {o.modalidad_pago ? (
        <div className="border-royal-600/50 bg-canvas mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[8px] border-l-4 px-3 py-2">
          <span className="font-semibold">Opción de pago elegida por el analista:</span>
          <Chip tone={o.modalidad_pago === 'usd' ? 'success' : 'info'}>
            {infoModalidad(o.modalidad_pago).icono} {infoModalidad(o.modalidad_pago).larga} · {money(o.total)}
          </Chip>
        </div>
      ) : null}

      {error ? (
        <div className="border-danger text-danger mb-3 rounded-[6px] border px-3 py-2 text-sm">
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      {!corrigiendo ? (
        <div className={cn('mb-3 rounded-[8px] border px-3 py-2.5', reabriendo ? 'border-royal-600' : 'border-hairline')}>
          <div className="text-ink/85 mb-1 text-sm font-semibold">Proveedor</div>
          <div className="flex flex-wrap items-center gap-2">
            <strong>{proveedor?.nombre ?? directo?.proveedor_nombre ?? '—'}</strong>
            {proveedor?.rif ? <span className="text-ink/50 font-mono text-sm">{proveedor.rif}</span> : null}
            {puedeCambiarProveedor && !reabriendo ? (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                title="Volver a cotizar: se reabren las ofertas para escoger otra cotización"
                onClick={() => setReabriendo(true)}
              >
                🔁 Cambiar de proveedor (volver a cotizar)
              </Button>
            ) : null}
          </div>
          {reabriendo ? (
            <>
              <p className="text-royal-700 dark:text-royal-300 mt-2 text-xs">
                ⚠ Para cambiar de proveedor se <strong>vuelve a cotizar</strong>: la OC regresa a{' '}
                <strong>“Pendiente · cargar ofertas”</strong>, se reabren las ofertas para que cargues la{' '}
                <strong>nueva cotización</strong> y escojas la ganadora, y después se <strong>aprueba de nuevo</strong>. La
                confirmación actual se anula y el método de pago se indica al final. Todo queda en la{' '}
                <strong>trazabilidad</strong> de la OC: quién, cuándo, el proveedor anterior y el motivo.
              </p>
              <Input
                className="mt-2"
                label="Motivo del cambio de proveedor (obligatorio)"
                placeholder="Ej.: el proveedor no tiene existencia / mejor precio de otro proveedor"
                maxLength={200}
                value={motivoCambio}
                onChange={(e) => setMotivoCambio(e.target.value)}
              />
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                disabled={guardando}
                onClick={() => {
                  setReabriendo(false)
                  setMotivoCambio('')
                  setError(null)
                }}
              >
                No cambiar de proveedor
              </Button>
            </>
          ) : null}
          {!directo && !puedeCambiarProveedor && o.estado !== 'confirmada_metodo' ? (
            <p className="text-ink/50 mt-1 text-xs">El proveedor ya no se puede cambiar: la OC ya fue recibida.</p>
          ) : null}
        </div>
      ) : null}

      {reabriendo ? (
        <div className="border-royal-600 rounded-[8px] border px-3 py-3 text-sm">
          <strong>No hace falta indicar el método de pago.</strong> Al volver a cotizar, el método se indicará cuando la OC se
          apruebe de nuevo con la cotización que escojas.
        </div>
      ) : (
        <>
          <DocumentoYRetenciones
            orden={o}
            doc={doc}
            onDoc={setDoc}
            form={retForm}
            onForm={setRetForm}
            descuento={descuentoActual}
            deQue={deQue}
          />

          {!corrigiendo ? (
            <>
              <div className="border-hairline mb-3 rounded-[8px] border px-3 py-2.5">
                <div className="text-ink/85 text-sm font-semibold">Imagen / QR de pago</div>
                <p className="text-ink/55 mb-2 text-xs">
                  Si el proveedor mandó una imagen (ej. el <strong>QR de Binance</strong> del pago en cripto), subila: quien paga la{' '}
                  <strong>escanea y paga</strong> directo.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input type="file" accept="image/*" onChange={(e) => setQr(e.target.files?.[0] ?? null)} />
                  {qr ? (
                    <Button size="sm" variant="ghost" onClick={() => setQr(null)}>
                      ✕ Quitar
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className={cn('mb-3 rounded-[8px] border px-3 py-2.5', incluyeDesc ? 'border-royal-600' : 'border-hairline')}>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={incluyeDesc} onChange={(e) => setIncluyeDesc(e.target.checked)} />
                  <strong className="text-sm">El pago incluye descuento</strong>
                  <span className="text-ink/50 text-xs">(se resta del monto a pagar)</span>
                </label>
                {incluyeDesc ? (
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <Button
                      size="sm"
                      variant={descModo === 'monto' ? 'primary' : 'ghost'}
                      onClick={() => {
                        setDescModo('monto')
                        setDescStr('')
                      }}
                    >
                      Monto ($)
                    </Button>
                    <Button
                      size="sm"
                      variant={descModo === 'pct' ? 'primary' : 'ghost'}
                      onClick={() => {
                        setDescModo('pct')
                        setDescStr('')
                      }}
                    >
                      Porcentaje (%)
                    </Button>
                    <Input
                      className="max-w-[180px]"
                      label={descModo === 'pct' ? 'Descuento (%)' : 'Descuento ($)'}
                      type="number"
                      value={descStr}
                      onChange={(e) => setDescStr(e.target.value)}
                      placeholder={descModo === 'pct' ? '0' : '0,00'}
                    />
                    <span className="text-ink/60 text-xs">
                      Total OC <strong className="font-mono">{money(b.total)}</strong> · − Descuento{' '}
                      <strong className="font-mono">{money(descNum)}</strong>
                      {descModo === 'pct' && descPct > 0 ? ` (${descPct}%)` : ''}
                    </span>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          <div className="space-y-2">
            {patas.map((p, i) => {
              const deEste = cuentas.filter((c) => c.metodo === p.metodo)
              return (
                <div key={i} className="border-hairline rounded-[8px] border p-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <Select
                      className="min-w-[200px] flex-1"
                      label="Método"
                      value={p.metodo}
                      onChange={(e) => setPata(i, pataNueva(e.target.value, cuentas))}
                      opciones={METODOS_PAGO.map((m) => ({ valor: m.value, etiqueta: m.label }))}
                    />
                    {esMultipago ? (
                      <Input
                        className="max-w-[170px]"
                        label={`Monto (${monedaPorMetodo(p.metodo)}) *`}
                        type="number"
                        placeholder="0,00"
                        value={p.monto}
                        onChange={(e) => setPata(i, { monto: e.target.value })}
                      />
                    ) : null}
                    {patas.length > 1 ? (
                      <Button size="sm" variant="ghost" onClick={() => setPatas((ps) => ps.filter((_, k) => k !== i))}>
                        ✕ Quitar
                      </Button>
                    ) : null}
                  </div>
                  {requiereDatos(p.metodo) ? (
                    <div className="border-hairline mt-2 border-t border-dashed pt-2">
                      <div className="text-ink/55 mb-1.5 text-xs">
                        Datos del proveedor para pagarle (se guardan para próximas compras)
                      </div>
                      {deEste.length ? (
                        <select
                          className={cn(CAMPO, 'mb-2 w-full')}
                          aria-label="Cuenta guardada del proveedor"
                          value={String(p.cuenta)}
                          onChange={(e) => {
                            const v = e.target.value
                            if (v === 'nueva') setPata(i, { cuenta: 'nueva', datos: {} })
                            else {
                              const c = deEste.find((x) => String(x.id) === v)
                              if (c) setPata(i, { cuenta: c.id, datos: { ...c.datos } })
                            }
                          }}
                        >
                          {deEste.map((c) => (
                            <option key={c.id} value={c.id}>
                              {resumenDatosPago(c.metodo, c.datos)}
                            </option>
                          ))}
                          <option value="nueva">+ Otra cuenta</option>
                        </select>
                      ) : null}
                      <CamposDatosPago metodo={p.metodo} value={p.datos} onChange={(d) => setPata(i, { datos: d, cuenta: 'nueva' })} />
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() => setPatas((ps) => [...ps, pataNueva('transferencia', cuentas)])}
          >
            + Agregar método (multipago)
          </Button>
          {esMultipago ? (
            <div className="border-royal-600/40 mt-2 rounded-[8px] border px-3 py-2 text-sm">
              <div className="text-ink/55 text-xs">Reparto indicado</div>
              <div className="flex flex-wrap gap-4 font-mono font-semibold">
                {Object.entries(
                  patas.reduce<Record<string, number>>((a, p) => {
                    const m = monedaPorMetodo(p.metodo)
                    a[m] = r2((a[m] ?? 0) + leerMonto(p.monto))
                    return a
                  }, {}),
                )
                  .filter(([, v]) => v > 0)
                  .map(([m, v]) => (
                    <span key={m}>
                      {m === 'USD' ? money(v) : `${m} ${v.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`}
                    </span>
                  ))}
              </div>
            </div>
          ) : null}
          {esContraEntrega && !corrigiendo ? (
            <label
              className={cn(
                'mt-3 flex cursor-pointer items-start gap-2 rounded-[8px] border px-3 py-2 text-sm',
                notaEntrega ? 'border-success' : 'border-warning',
              )}
            >
              <input type="checkbox" className="mt-1" checked={notaEntrega} onChange={(e) => setNotaEntrega(e.target.checked)} />
              <strong>
                Confirmo que la mercancía se recibió y verificó contra lo solicitado. Recién entonces se paga (contra entrega).
              </strong>
            </label>
          ) : null}
          <p className="text-ink/50 mt-2 text-xs">
            Monto a pagar: <strong className="font-mono">{money(montoAPagar(o, doc === 'factura' ? calcularRetenciones(o, retForm) : [], descuentoActual))}</strong>.
            Si el método es <strong>en efectivo</strong> (divisas o Bs), al marcarla pagada no se pide referencia.
          </p>
        </>
      )}
    </Modal>
  )
}

/** «🧾 Documento y retenciones» de un crédito. */
export function DocumentoRetencionesModal({ orden: o, onClose, onListo }: { orden: Orden; onClose: () => void; onListo: () => void }) {
  const guardar = useDocumentoRetenciones()
  const [doc, setDoc] = useState<'factura' | 'nota_entrega'>(o.comprobante_tipo ?? 'factura')
  const [form, setForm] = useState<RetencionesForm>(() => retencionesAForm(o.retenciones))
  const [error, setError] = useState<string | null>(null)
  const abonado = Number(o.abonado_total) || 0

  async function onGuardar() {
    setError(null)
    if (doc === 'factura') {
      const e = errorRetenciones(o, form)
      if (e) return setError(e)
    }
    try {
      const r = await guardar.mutateAsync({
        id: o.id,
        comprobante_tipo: doc,
        retenciones: doc === 'factura' ? retencionesParaEnviar(form) : [],
      })
      toast(`OC ${o.oc_codigo ?? o.codigo} · documento y retenciones guardados · monto a pagar ${money(r.monto_a_pagar)}`, 'success')
      onListo()
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo guardar'))
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onClose}
      titulo={`Documento y retenciones · OC ${o.oc_codigo ?? o.codigo}`}
      ancho="md"
      acciones={
        <>
          <Button variant="ghost" onClick={onClose} disabled={guardar.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => void onGuardar()} disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : '💾 Guardar'}
          </Button>
        </>
      }
    >
      <p className="text-ink/65 mb-3 text-sm">
        El documento del proveedor y lo que se le retiene. Las retenciones se restan del total: el crédito se salda con el{' '}
        <strong>monto a pagar</strong>
        {abonado > 0 ? (
          <>
            {' '}
            (ya abonado <strong>{money(abonado)}</strong>)
          </>
        ) : null}
        .
      </p>
      {error ? (
        <div className="border-danger text-danger mb-3 rounded-[6px] border px-3 py-2 text-sm">
          <strong>Error:</strong> {error}
        </div>
      ) : null}
      <DocumentoYRetenciones orden={o} doc={doc} onDoc={setDoc} form={form} onForm={setForm} />
    </Modal>
  )
}

