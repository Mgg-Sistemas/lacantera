import { useMemo, useState } from 'react'
import { FileText, HandCoins, Lock, Pencil, Plus, Search, Users, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Interruptor } from '@/components/ui/Interruptor'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { Visor } from '@/components/Visor'
import { hoyEnCaracas, useTasaDeFecha, useTasaVigente } from '@/lib/api/tasas'
import { useMiPerfil, useUsuarios } from '@/lib/api/usuarios'
import { useMisRoles } from '@/lib/api/catalogo'
import { empresaDelPapel, useEmpresa } from '@/lib/api/empresa'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { armarPorPagarPdf } from '@/lib/ficha/porPagarPdf'
import {
  enAmbas,
  equivalente,
  useAbonarCuentaPorPagar,
  useAbonosPorPagar,
  useAnularAbonoPorPagar,
  useAnularCuentaPorPagar,
  useControladoresPorPagar,
  useControloPorPagar,
  useCuentasPorPagar,
  useEditarCuentaPorPagar,
  useGuardarControladorPorPagar,
  useRegistrarCuentaPorPagar,
  type AbonoPorPagar,
  type CuentaPorPagar,
  type EstadoPorPagar,
  type MonedaPorPagar,
} from '@/lib/api/porPagar'
import { cifra, dinero, fecha, tasa as formatoTasa } from '@/lib/formato'

/*
  GASTOS › PENDIENTE POR PAGAR (12/11/2026).

  La hoja de Excel «CUENTAS PENDIENTES POR PAGAR», llevada al sistema: a quién
  se le debe, qué, y cuánto, en Bs y en $ uno al lado del otro.

  EL MONTO ESCRITO NO CAMBIA; EL OTRO SE CALCULA CON LA TASA DE HOY. Una deuda
  en $ dice cuántos Bs cuesta pagarla hoy, y al revés. Por eso la tasa y su
  fecha se dicen arriba, siempre: sin ella, los dos números no significan nada.
  Si no hay tasa, se dice «sin tasa» y no se inventa ningún equivalente.

  LOS ABONOS (el «pagué un abono de 960$ el 21/10» que se escribía a mano). Cada
  uno congela la tasa de SU día, la pone la base. El saldo vive en la moneda de
  la deuda, y el estado sale solo: pendiente, abonada, pagada.

  SOLO DOS PERSONAS ESCRIBEN. Están en la lista del módulo; los demás que entran
  a Gastos —también los ADMIN— solo miran. Aquí se esconden los botones; la
  base cierra la puerta igual.

  No mueve Tesorería: es bitácora, como Gastos. Lo que viene de una orden de
  compra se paga en Compras › Pagos por hacer, no aquí.
*/

const HOY = hoyEnCaracas()

type FiltroEstado = 'POR_PAGAR' | 'PENDIENTE' | 'ABONADA' | 'PAGADA' | 'TODAS'

const OPCIONES_ESTADO: { valor: FiltroEstado; etiqueta: string }[] = [
  { valor: 'POR_PAGAR', etiqueta: 'Por pagar (pendientes y abonadas)' },
  { valor: 'PENDIENTE', etiqueta: 'Pendientes sin abono' },
  { valor: 'ABONADA', etiqueta: 'Abonadas' },
  { valor: 'PAGADA', etiqueta: 'Pagadas' },
  { valor: 'TODAS', etiqueta: 'Todas' },
]

const TONO: Record<EstadoPorPagar, 'warning' | 'info' | 'success' | 'danger'> = {
  PENDIENTE: 'warning',
  ABONADA: 'info',
  PAGADA: 'success',
  ANULADA: 'danger',
}

const NOMBRE_ESTADO: Record<EstadoPorPagar, string> = {
  PENDIENTE: 'Pendiente',
  ABONADA: 'Abonada',
  PAGADA: 'Pagada',
  ANULADA: 'Anulada',
}

const simbolo = (m: MonedaPorPagar) => (m === 'USD' ? '$' : 'Bs')

function formularioVacio() {
  return {
    fecha: HOY,
    proveedor: '',
    sin_factura: false,
    numero_factura: '',
    descripcion: '',
    moneda: 'USD' as MonedaPorPagar,
    monto: '',
    vence: '',
    observacion: '',
  }
}

export function PendientePorPagar() {
  const cuentas = useCuentasPorPagar()
  const abonos = useAbonosPorPagar()
  const controlo = useControloPorPagar()
  const controladores = useControladoresPorPagar()
  const tasaHoy = useTasaVigente('USD')
  const roles = useMisRoles()
  const esAdmin = roles.roles.includes('ADMIN')
  const puedeEscribir = controlo.data === true

  const t = tasaHoy.data ? Number(tasaHoy.data.tasa) : null

  const [buscado, setBuscado] = useState('')
  const [estado, setEstado] = useState<FiltroEstado>('POR_PAGAR')
  const [soloSinFactura, setSoloSinFactura] = useState(false)
  const [verAnuladas, setVerAnuladas] = useState(false)

  const abonosDe = useMemo(() => {
    const mapa = new Map<number, AbonoPorPagar[]>()
    for (const a of abonos.data ?? []) mapa.set(a.cuenta_id, [...(mapa.get(a.cuenta_id) ?? []), a])
    return mapa
  }, [abonos.data])

  const filtradas = useMemo(() => {
    const texto = buscado.trim().toLowerCase()
    return (cuentas.data ?? []).filter((c) => {
      if (c.estado === 'ANULADA') {
        if (!verAnuladas) return false
      } else if (estado === 'POR_PAGAR') {
        if (c.estado === 'PAGADA') return false
      } else if (estado !== 'TODAS' && c.estado !== estado) {
        return false
      }
      if (soloSinFactura && !c.sin_factura) return false
      if (!texto) return true
      return (
        c.proveedor.toLowerCase().includes(texto) ||
        c.descripcion.toLowerCase().includes(texto) ||
        c.numero.toLowerCase().includes(texto) ||
        (c.numero_factura ?? '').toLowerCase().includes(texto)
      )
    })
  }, [cuentas.data, buscado, estado, soloSinFactura, verAnuladas])

  // Lo que se debe hoy: el saldo de lo vivo, en las dos monedas a la tasa de hoy.
  const resumen = useMemo(() => {
    const vivas = (cuentas.data ?? []).filter((c) => c.estado === 'PENDIENTE' || c.estado === 'ABONADA')
    let bs = 0
    let usd = 0
    let origBs = 0
    let origUsd = 0
    for (const c of vivas) {
      const ambos = enAmbas(c.moneda, c.saldo, t)
      bs += ambos.bs ?? 0
      usd += ambos.usd ?? 0
      if (c.moneda === 'USD') origUsd += c.saldo
      else origBs += c.saldo
    }
    return {
      cantidad: vivas.length,
      abonadas: vivas.filter((c) => c.estado === 'ABONADA').length,
      vencidas: vivas.filter((c) => c.vence && c.vence < HOY).length,
      bs,
      usd,
      origBs,
      origUsd,
    }
  }, [cuentas.data, t])

  // ── registrar / corregir ──
  const [editando, setEditando] = useState<CuentaPorPagar | 'nueva' | null>(null)
  const [form, setForm] = useState(formularioVacio())
  const registrar = useRegistrarCuentaPorPagar()
  const editar = useEditarCuentaPorPagar()

  const proveedoresConocidos = useMemo(
    () => Array.from(new Set((cuentas.data ?? []).map((c) => c.proveedor))).sort(),
    [cuentas.data],
  )

  const posibleDuplicado = useMemo(() => {
    const numero = form.numero_factura.trim().toUpperCase()
    const proveedor = form.proveedor.trim().toUpperCase()
    if (form.sin_factura || !numero || !proveedor) return null
    return (
      (cuentas.data ?? []).find(
        (c) =>
          c.estado !== 'ANULADA' &&
          c.proveedor === proveedor &&
          (c.numero_factura ?? '') === numero &&
          (editando === 'nueva' || c.id !== editando?.id),
      ) ?? null
    )
  }, [cuentas.data, form.numero_factura, form.proveedor, form.sin_factura, editando])

  const abrirNueva = () => {
    setForm(formularioVacio())
    registrar.reset()
    setEditando('nueva')
  }

  const abrirCorreccion = (c: CuentaPorPagar) => {
    setForm({
      fecha: c.fecha,
      proveedor: c.proveedor,
      sin_factura: c.sin_factura,
      numero_factura: c.numero_factura ?? '',
      descripcion: c.descripcion,
      moneda: c.moneda,
      monto: String(c.monto),
      vence: c.vence ?? '',
      observacion: c.observacion ?? '',
    })
    editar.reset()
    setDetalle(null)
    setEditando(c)
  }

  const datosDelFormulario = () => ({
    fecha: form.fecha,
    proveedor: form.proveedor.trim(),
    descripcion: form.descripcion.trim(),
    moneda: form.moneda,
    monto: Number(form.monto),
    sin_factura: form.sin_factura,
    numero_factura: form.numero_factura.trim() || null,
    vence: form.vence || null,
    observacion: form.observacion.trim() || null,
  })

  const guardar = (seguir: boolean) => {
    if (editando === 'nueva') {
      registrar.mutate(datosDelFormulario(), {
        onSuccess: () => {
          if (seguir) setForm((f) => ({ ...formularioVacio(), fecha: f.fecha, moneda: f.moneda }))
          else setEditando(null)
        },
      })
    } else if (editando) {
      editar.mutate({ id: editando.id, datos: datosDelFormulario() }, { onSuccess: () => setEditando(null) })
    }
  }

  const formValido =
    form.proveedor.trim().length >= 2 &&
    form.descripcion.trim().length >= 3 &&
    Number(form.monto) > 0 &&
    Boolean(form.fecha) &&
    (!form.vence || form.vence >= form.fecha)

  const guardando = registrar.isPending || editar.isPending
  const errorGuardar = registrar.error ?? editar.error

  // ── detalle, abonar, anular ──
  const [detalle, setDetalle] = useState<CuentaPorPagar | null>(null)
  const detalleVivo = detalle ? ((cuentas.data ?? []).find((c) => c.id === detalle.id) ?? detalle) : null

  const [abonando, setAbonando] = useState<CuentaPorPagar | null>(null)
  const [abono, setAbono] = useState({ fecha: HOY, moneda: 'USD' as MonedaPorPagar, monto: '', referencia: '', nota: '' })
  const abonar = useAbonarCuentaPorPagar()
  const tasaDelAbono = useTasaDeFecha(abonando ? abono.fecha : undefined)
  const tAbono = tasaDelAbono.data ? Number(tasaDelAbono.data.tasa) : null

  const abrirAbono = (c: CuentaPorPagar) => {
    setAbono({ fecha: HOY, moneda: c.moneda, monto: '', referencia: '', nota: '' })
    abonar.reset()
    setAbonando(c)
  }

  // Lo que el abono descontará, en la moneda de la deuda (la base lo recalcula igual).
  const abonoEnCuenta = useMemo(() => {
    if (!abonando) return null
    const m = Number(abono.monto)
    if (!(m > 0)) return null
    if (abono.moneda === abonando.moneda) return m
    const e = equivalente(abono.moneda, m, tAbono)
    return e == null ? null : Math.round(e * 100) / 100
  }, [abonando, abono.monto, abono.moneda, tAbono])

  const pagarTodo = () => {
    if (!abonando) return
    if (abono.moneda === abonando.moneda) {
      setAbono((a) => ({ ...a, monto: abonando.saldo.toFixed(2) }))
    } else {
      const e = equivalente(abonando.moneda, abonando.saldo, tAbono)
      if (e != null) setAbono((a) => ({ ...a, monto: e.toFixed(2) }))
    }
  }

  const [anulando, setAnulando] = useState<
    { tipo: 'cuenta'; cuenta: CuentaPorPagar } | { tipo: 'abono'; abono: AbonoPorPagar } | null
  >(null)
  const [motivo, setMotivo] = useState('')
  const anularCuenta = useAnularCuentaPorPagar()
  const anularAbono = useAnularAbonoPorPagar()

  const confirmarAnulacion = () => {
    if (!anulando) return
    if (anulando.tipo === 'cuenta') {
      anularCuenta.mutate({ id: anulando.cuenta.id, motivo }, { onSuccess: () => setAnulando(null) })
    } else {
      anularAbono.mutate({ id: anulando.abono.id, motivo }, { onSuccess: () => setAnulando(null) })
    }
  }

  // ── quién las lleva (lo cambia un ADMIN) ──
  const [viendoLista, setViendoLista] = useState(false)
  const usuarios = useUsuarios()
  const guardarControlador = useGuardarControladorPorPagar()
  const [agregar, setAgregar] = useState('')
  const quienesLlevan = (controladores.data ?? []).filter((c) => c.activo)

  // ── el PDF ──
  const { data: empresa } = useEmpresa()
  const { data: yo } = useMiPerfil()
  const [pidiendoPdf, setPidiendoPdf] = useState(false)
  const [conLogo, setConLogo] = useState(true)
  const [conPagadas, setConPagadas] = useState(false)
  const [armando, setArmando] = useState(false)
  const [fallaPdf, setFallaPdf] = useState<unknown>(null)
  const [archivo, setArchivo] = useState<ArchivoArmado | null>(null)

  const filtrosEnPalabras = [
    buscado.trim() ? `búsqueda «${buscado.trim()}»` : '',
    soloSinFactura ? 'solo sin factura' : '',
  ]
    .filter(Boolean)
    .join(' · ')

  const armarPdf = async () => {
    setArmando(true)
    setFallaPdf(null)
    try {
      const paraPapel = (cuentas.data ?? []).filter((c) => {
        if (c.estado === 'ANULADA') return false
        if (c.estado === 'PAGADA' && !conPagadas) return false
        if (soloSinFactura && !c.sin_factura) return false
        const texto = buscado.trim().toLowerCase()
        if (!texto) return true
        return (
          c.proveedor.toLowerCase().includes(texto) ||
          c.descripcion.toLowerCase().includes(texto) ||
          c.numero.toLowerCase().includes(texto) ||
          (c.numero_factura ?? '').toLowerCase().includes(texto)
        )
      })
      if (paraPapel.length === 0) throw new Error('No hay cuentas para poner en el papel con esos filtros.')
      // En el papel, la más vieja primero, como se llevaba la hoja.
      paraPapel.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id)
      setArchivo(
        await armarPorPagarPdf({
          cuentas: paraPapel,
          abonos: abonos.data ?? [],
          tasa: tasaHoy.data
            ? { tasa: Number(tasaHoy.data.tasa), fecha: tasaHoy.data.fecha, arrastrada: tasaHoy.data.arrastrada }
            : null,
          conLogo,
          conPagadas,
          filtros: filtrosEnPalabras,
          empresa: empresaDelPapel(empresa),
          emitidoPor: yo?.nombre ?? '',
          momento: new Date(),
          nombreArchivo: `cuentas-por-pagar-${HOY}${conLogo ? '' : '-sin-logo'}.pdf`,
        }),
      )
      setPidiendoPdf(false)
    } catch (e) {
      setFallaPdf(e)
    } finally {
      setArmando(false)
    }
  }

  // ── piezas ──
  const Concepto = ({ c }: { c: CuentaPorPagar }) => (
    <>
      <p className={c.estado === 'ANULADA' ? 'text-ink/45 line-through' : 'text-ink/90 font-medium'}>{c.proveedor}</p>
      <p className="text-ink/50 text-xs">
        {c.sin_factura ? 'Aún no entregan factura' : c.numero_factura ? `Fact. ${c.numero_factura}` : 'Sin n.º de factura'}
        {c.vence ? ` · vence ${fecha(c.vence)}` : ''}
      </p>
    </>
  )

  const vencida = (c: CuentaPorPagar) =>
    Boolean(c.vence && c.vence < HOY && (c.estado === 'PENDIENTE' || c.estado === 'ABONADA'))

  return (
    <>
      <PageHeader
        title="Pendiente por pagar"
        description="Facturas y servicios que se deben, en bolívares y en dólares uno al lado del otro, con sus abonos."
        actions={
          <>
            <Button
              variant="outline"
              icon={<FileText />}
              disabled={(cuentas.data ?? []).length === 0}
              onClick={() => {
                setFallaPdf(null)
                setPidiendoPdf(true)
              }}
            >
              PDF
            </Button>
            {puedeEscribir ? (
              <Button icon={<Plus />} onClick={abrirNueva}>
                Nueva cuenta
              </Button>
            ) : null}
          </>
        }
      />

      {/* Quién las lleva. A quien solo mira se le dice por qué no hay botones. */}
      <div className="border-hairline bg-surface mb-4 flex flex-wrap items-center gap-2 rounded-[6px] border px-4 py-3 text-sm">
        {puedeEscribir ? <Users className="text-ink/45 size-4" /> : <Lock className="text-ink/45 size-4" />}
        <span className="text-ink/70">
          {puedeEscribir ? 'Usted lleva estas cuentas junto con: ' : 'Usted puede verlas. Las registran y modifican: '}
          <strong className="text-ink/85">
            {quienesLlevan
              .filter((c) => !puedeEscribir || c.usuario_id !== yo?.id)
              .map((c) => c.nombre)
              .join(', ') || '—'}
          </strong>
        </span>
        {esAdmin ? (
          <button
            type="button"
            className="text-royal-700 dark:text-royal-300 ml-auto text-sm underline"
            onClick={() => {
              guardarControlador.reset()
              setAgregar('')
              setViendoLista(true)
            }}
          >
            Cambiar quién las lleva
          </button>
        ) : null}
      </div>

      {/* Lo que se debe hoy. */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-ink/50 text-xs font-semibold tracking-wide uppercase">Se debe hoy en $</p>
          <p className="tabular text-ink/90 mt-1 text-2xl font-semibold">
            {t == null && resumen.origBs > 0 ? 'sin tasa' : dinero('USD', resumen.usd)}
          </p>
          <p className="text-ink/50 mt-1 text-xs">Todo lo pendiente, llevado a dólares</p>
        </Card>
        <Card>
          <p className="text-ink/50 text-xs font-semibold tracking-wide uppercase">Se debe hoy en Bs</p>
          <p className="tabular text-ink/90 mt-1 text-2xl font-semibold">
            {t == null && resumen.origUsd > 0 ? 'sin tasa' : dinero('VES', resumen.bs)}
          </p>
          <p className="text-ink/50 mt-1 text-xs">Todo lo pendiente, llevado a bolívares</p>
        </Card>
        <Card>
          <p className="text-ink/50 text-xs font-semibold tracking-wide uppercase">Cuentas por pagar</p>
          <p className="tabular text-ink/90 mt-1 text-2xl font-semibold">{resumen.cantidad}</p>
          <p className="text-ink/50 mt-1 text-xs">
            {resumen.abonadas} con abonos{resumen.vencidas > 0 ? ` · ${resumen.vencidas} vencidas` : ''}
          </p>
        </Card>
        <Card>
          <p className="text-ink/50 text-xs font-semibold tracking-wide uppercase">Tasa BCV</p>
          <p className="tabular text-ink/90 mt-1 text-2xl font-semibold">
            {tasaHoy.data ? `Bs ${formatoTasa(tasaHoy.data.tasa)}` : tasaHoy.isPending ? '…' : 'sin tasa'}
          </p>
          <p className="text-ink/50 mt-1 text-xs">
            {tasaHoy.data
              ? tasaHoy.data.arrastrada
                ? `Del ${fecha(tasaHoy.data.fecha)}: no hay la de hoy`
                : `De hoy, ${fecha(tasaHoy.data.fecha)}`
              : 'Registre la tasa en Tasas de cambio'}
          </p>
        </Card>
      </div>
      {resumen.cantidad > 0 ? (
        <p className="text-ink/50 -mt-2 mb-4 text-xs">
          Lo escrito en cada moneda, sin convertir: {dinero('USD', resumen.origUsd)} en deudas en dólares y{' '}
          {dinero('VES', resumen.origBs)} en deudas en bolívares.
        </p>
      ) : null}

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_260px]">
          <Input
            label="Buscar"
            icon={<Search />}
            placeholder="Proveedor, descripción o número"
            maxLength={100}
            value={buscado}
            onChange={(e) => setBuscado(e.target.value)}
          />
          <Select
            label="Mostrar"
            value={estado}
            onChange={(e) => setEstado(e.target.value as FiltroEstado)}
            opciones={OPCIONES_ESTADO}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <label className="text-ink/60 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-royal-600 size-4"
              checked={soloSinFactura}
              onChange={(e) => setSoloSinFactura(e.target.checked)}
            />
            Solo las que aún no entregan factura
          </label>
          <label className="text-ink/60 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-royal-600 size-4"
              checked={verAnuladas}
              onChange={(e) => setVerAnuladas(e.target.checked)}
            />
            Mostrar anuladas
          </label>
        </div>
      </Card>

      {cuentas.isPending ? <Cargando /> : null}
      {cuentas.error ? <ErrorDeCarga error={cuentas.error} /> : null}
      {abonos.error ? <ErrorDeCarga error={abonos.error} className="mb-4" /> : null}

      {!cuentas.isPending && !cuentas.error && filtradas.length === 0 ? (
        <Card>
          <Vacio
            icono={<Wallet />}
            titulo={(cuentas.data ?? []).length === 0 ? 'Sin cuentas por pagar' : 'Sin resultados'}
            descripcion={
              (cuentas.data ?? []).length === 0
                ? 'Las facturas y servicios que se deban aparecen aquí. Lo que viene de una orden de compra se paga en Compras › Pagos por hacer.'
                : undefined
            }
          />
        </Card>
      ) : null}

      {filtradas.length > 0 ? (
        <Card flush>
          <div className="border-hairline border-b px-5 py-3">
            <p className="text-ink/60 text-sm">
              {filtradas.length} cuenta{filtradas.length === 1 ? '' : 's'} · los montos son lo que falta por pagar; en
              negrita, la moneda en que se debe
            </p>
          </div>

          {/* PC: la tabla, con las columnas de la hoja. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink/50 border-hairline border-b text-left text-xs uppercase">
                  <th className="px-4 py-2.5 font-semibold">N.º</th>
                  <th className="px-3 py-2.5 font-semibold">Factura / concepto</th>
                  <th className="px-3 py-2.5 font-semibold">Descripción</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Monto Bs</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Monto $</th>
                  <th className="px-3 py-2.5 font-semibold">Estado</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-hairline divide-y">
                {filtradas.map((c) => {
                  const valor = c.estado === 'PAGADA' ? c.monto : c.saldo
                  const ambos = enAmbas(c.moneda, valor, t)
                  return (
                    <tr
                      key={c.id}
                      className={
                        c.estado === 'PAGADA'
                          ? 'bg-success/8 hover:bg-success/12 cursor-pointer'
                          : 'hover:bg-ink/3 cursor-pointer'
                      }
                      onClick={() => setDetalle(c)}
                    >
                      <td className="px-4 py-3 align-top">
                        <span className="text-ink/45 font-mono text-xs">{c.numero}</span>
                        <p className="text-ink/60 text-xs">{fecha(c.fecha)}</p>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <Concepto c={c} />
                      </td>
                      <td className="text-ink/75 max-w-[320px] px-3 py-3 align-top">{c.descripcion}</td>
                      <td
                        className={`tabular px-3 py-3 text-right align-top whitespace-nowrap ${
                          c.moneda === 'VES' ? 'text-ink/90 font-semibold' : 'text-ink/55'
                        }`}
                      >
                        {ambos.bs == null ? 'sin tasa' : dinero('VES', ambos.bs)}
                      </td>
                      <td
                        className={`tabular px-3 py-3 text-right align-top whitespace-nowrap ${
                          c.moneda === 'USD' ? 'text-ink/90 font-semibold' : 'text-ink/55'
                        }`}
                      >
                        {ambos.usd == null ? 'sin tasa' : dinero('USD', ambos.usd)}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <Chip tone={TONO[c.estado]}>{NOMBRE_ESTADO[c.estado]}</Chip>
                        {vencida(c) ? (
                          <p className="text-danger mt-1 text-xs">Vencida</p>
                        ) : null}
                        {c.estado === 'ABONADA' ? (
                          <p className="text-ink/50 mt-1 text-xs">
                            Abonado {dinero(c.moneda, c.abonado)} de {dinero(c.moneda, c.monto)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right align-top" onClick={(e) => e.stopPropagation()}>
                        {puedeEscribir && (c.estado === 'PENDIENTE' || c.estado === 'ABONADA') ? (
                          <Button size="sm" variant="soft" icon={<HandCoins />} onClick={() => abrirAbono(c)}>
                            Abonar
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Teléfono: una tarjeta por cuenta, con los dos montos uno debajo del otro. */}
          <ul className="divide-hairline divide-y md:hidden">
            {filtradas.map((c) => {
              const valor = c.estado === 'PAGADA' ? c.monto : c.saldo
              const ambos = enAmbas(c.moneda, valor, t)
              return (
                <li
                  key={c.id}
                  className={c.estado === 'PAGADA' ? 'bg-success/8 px-4 py-4' : 'px-4 py-4'}
                  onClick={() => setDetalle(c)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-ink/45 font-mono text-xs">{c.numero}</span>
                    <Chip tone={TONO[c.estado]}>{NOMBRE_ESTADO[c.estado]}</Chip>
                    {vencida(c) ? <Chip tone="danger">Vencida</Chip> : null}
                  </div>
                  <div className="mt-1.5">
                    <Concepto c={c} />
                  </div>
                  <p className="text-ink/70 mt-1 text-sm">{c.descripcion}</p>
                  <div className="tabular mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-ink/45 text-xs">Monto Bs</p>
                      <p className={c.moneda === 'VES' ? 'text-ink/90 font-semibold' : 'text-ink/55'}>
                        {ambos.bs == null ? 'sin tasa' : dinero('VES', ambos.bs)}
                      </p>
                    </div>
                    <div>
                      <p className="text-ink/45 text-xs">Monto $</p>
                      <p className={c.moneda === 'USD' ? 'text-ink/90 font-semibold' : 'text-ink/55'}>
                        {ambos.usd == null ? 'sin tasa' : dinero('USD', ambos.usd)}
                      </p>
                    </div>
                  </div>
                  {c.estado === 'ABONADA' ? (
                    <p className="text-ink/50 mt-1 text-xs">
                      Abonado {dinero(c.moneda, c.abonado)} de {dinero(c.moneda, c.monto)}
                    </p>
                  ) : null}
                  {puedeEscribir && (c.estado === 'PENDIENTE' || c.estado === 'ABONADA') ? (
                    <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                      <Button size="lg" variant="soft" icon={<HandCoins />} className="w-full" onClick={() => abrirAbono(c)}>
                        Abonar
                      </Button>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </Card>
      ) : null}

      {/* ── Detalle de una cuenta, con sus abonos ── */}
      {detalleVivo ? (
        <Modal
          abierto
          onCerrar={() => setDetalle(null)}
          titulo={`${detalleVivo.numero} · ${detalleVivo.proveedor}`}
          descripcion={detalleVivo.descripcion}
          acciones={
            <>
              {puedeEscribir && detalleVivo.estado !== 'ANULADA' && detalleVivo.abonos === 0 ? (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setMotivo('')
                      anularCuenta.reset()
                      setAnulando({ tipo: 'cuenta', cuenta: detalleVivo })
                    }}
                  >
                    Anular
                  </Button>
                  <Button variant="outline" icon={<Pencil />} onClick={() => abrirCorreccion(detalleVivo)}>
                    Corregir
                  </Button>
                </>
              ) : null}
              {puedeEscribir && (detalleVivo.estado === 'PENDIENTE' || detalleVivo.estado === 'ABONADA') ? (
                <Button icon={<HandCoins />} onClick={() => abrirAbono(detalleVivo)}>
                  Abonar
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setDetalle(null)}>
                  Cerrar
                </Button>
              )}
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={TONO[detalleVivo.estado]}>{NOMBRE_ESTADO[detalleVivo.estado]}</Chip>
            {vencida(detalleVivo) ? <Chip tone="danger">Vencida</Chip> : null}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-ink/50">Fecha</dt>
            <dd className="text-ink/85">{fecha(detalleVivo.fecha)}</dd>
            <dt className="text-ink/50">Factura</dt>
            <dd className="text-ink/85">
              {detalleVivo.sin_factura ? 'Aún no entregan factura' : (detalleVivo.numero_factura ?? '—')}
            </dd>
            <dt className="text-ink/50">Vence</dt>
            <dd className="text-ink/85">{detalleVivo.vence ? fecha(detalleVivo.vence) : '—'}</dd>
            <dt className="text-ink/50">Se debía</dt>
            <dd className="tabular text-ink/90 font-semibold">{dinero(detalleVivo.moneda, detalleVivo.monto)}</dd>
            <dt className="text-ink/50">Abonado</dt>
            <dd className="tabular text-ink/85">{dinero(detalleVivo.moneda, detalleVivo.abonado)}</dd>
            <dt className="text-ink/50">Falta</dt>
            <dd className="tabular text-ink/90 font-semibold">
              {dinero(detalleVivo.moneda, detalleVivo.saldo)}
              {(() => {
                const e = equivalente(detalleVivo.moneda, detalleVivo.saldo, t)
                return e != null && detalleVivo.saldo > 0 ? (
                  <span className="text-ink/50 block text-xs font-normal">
                    ≈ {dinero(detalleVivo.moneda === 'USD' ? 'VES' : 'USD', e)} a la tasa de hoy
                  </span>
                ) : null
              })()}
            </dd>
          </dl>
          {detalleVivo.observacion ? <p className="text-ink/65 mt-3 text-sm">{detalleVivo.observacion}</p> : null}

          <h3 className="text-ink/80 mt-5 text-sm font-semibold">Abonos</h3>
          {(abonosDe.get(detalleVivo.id) ?? []).length === 0 ? (
            <p className="text-ink/45 mt-1 text-sm">Todavía no tiene abonos.</p>
          ) : (
            <ul className="divide-hairline mt-1 divide-y">
              {(abonosDe.get(detalleVivo.id) ?? []).map((a) => (
                <li key={a.id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-ink/70">{fecha(a.fecha)}</span>
                    <span
                      className={
                        a.anulado_en ? 'tabular text-ink/45 line-through' : 'tabular text-ink/90 font-semibold'
                      }
                    >
                      {dinero(a.moneda, a.monto)}
                    </span>
                    {a.moneda !== a.cuenta_moneda ? (
                      <span className="text-ink/50 text-xs">
                        = {dinero(a.cuenta_moneda, a.monto_en_moneda_cuenta)} a Bs {a.tasa ? formatoTasa(a.tasa) : '—'}
                      </span>
                    ) : null}
                    {a.anulado_en ? <Chip tone="danger">Anulado</Chip> : null}
                    {puedeEscribir && !a.anulado_en ? (
                      <button
                        type="button"
                        className="text-ink/45 hover:text-danger ml-auto text-xs underline"
                        onClick={() => {
                          setMotivo('')
                          anularAbono.reset()
                          setAnulando({ tipo: 'abono', abono: a })
                        }}
                      >
                        Anular abono
                      </button>
                    ) : null}
                  </div>
                  <p className="text-ink/45 text-xs">
                    {a.referencia ? `Ref. ${a.referencia} · ` : ''}
                    {a.nota ? `${a.nota} · ` : ''}
                    registró {a.registrado_por_nombre ?? '—'}
                    {a.anulado_en ? ` · anuló ${a.anulado_por_nombre ?? '—'}: «${a.motivo_anulacion}»` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <p className="text-ink/40 mt-4 text-xs">
            Registró {detalleVivo.registrado_por_nombre ?? '—'}
            {detalleVivo.actualizado_en ? ` · corrigió ${detalleVivo.actualizado_por_nombre ?? '—'}` : ''}
            {detalleVivo.anulada_en
              ? ` · anuló ${detalleVivo.anulada_por_nombre ?? '—'}: «${detalleVivo.motivo_anulacion}»`
              : ''}
          </p>
          {puedeEscribir && detalleVivo.abonos > 0 && detalleVivo.estado !== 'ANULADA' ? (
            <p className="text-ink/45 mt-2 text-xs">
              Con abonos ya no se corrige ni se anula: anule primero los abonos si hubo un error.
            </p>
          ) : null}
        </Modal>
      ) : null}

      {/* ── Registrar o corregir ── */}
      {editando ? (
        <Modal
          abierto
          onCerrar={() => setEditando(null)}
          titulo={editando === 'nueva' ? 'Nueva cuenta por pagar' : `Corregir ${editando.numero}`}
          descripcion="Lo que viene de una orden de compra no va aquí: se paga en Compras › Pagos por hacer."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
              {editando === 'nueva' ? (
                <Button variant="outline" disabled={!formValido || guardando} onClick={() => guardar(true)}>
                  {guardando ? 'Guardando…' : 'Guardar y cargar otra'}
                </Button>
              ) : null}
              <Button disabled={!formValido || guardando} onClick={() => guardar(false)}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </Button>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input
                label="A quién se le debe (proveedor o concepto)"
                maxLength={120}
                value={form.proveedor}
                list="por-pagar-proveedores"
                autoFocus
                onChange={(e) => setForm((f) => ({ ...f, proveedor: e.target.value }))}
              />
              <datalist id="por-pagar-proveedores">
                {proveedoresConocidos.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
            <div className="sm:col-span-2">
              <Textarea
                label="Descripción: qué se debe"
                rows={2}
                maxLength={300}
                placeholder="Ej.: Viajes de acarreo interno (128 viajes: semana del 12/10 al 16/10)"
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input
                label="Monto"
                type="number"
                limite={{ maxDecimales: 2, sinNegativos: true }}
                value={form.monto}
                onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
              />
              <Select
                label="Moneda"
                value={form.moneda}
                onChange={(e) => setForm((f) => ({ ...f, moneda: e.target.value as MonedaPorPagar }))}
                opciones={[
                  { valor: 'USD', etiqueta: 'Dólares ($)' },
                  { valor: 'VES', etiqueta: 'Bolívares (Bs)' },
                ]}
              />
            </div>
            <div className="text-ink/55 flex items-end pb-2 text-sm">
              {Number(form.monto) > 0
                ? (() => {
                    const e = equivalente(form.moneda, Number(form.monto), t)
                    return e == null
                      ? 'Sin tasa de hoy: no se puede mostrar el equivalente.'
                      : `≈ ${dinero(form.moneda === 'USD' ? 'VES' : 'USD', e)} a la tasa de hoy`
                  })()
                : null}
            </div>
            <Input
              label="Fecha de la deuda"
              type="date"
              value={form.fecha}
              max={HOY}
              onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
            />
            <Input
              label="Vence (si tiene)"
              type="date"
              value={form.vence}
              min={form.fecha}
              onChange={(e) => setForm((f) => ({ ...f, vence: e.target.value }))}
            />
            <div className="sm:col-span-2">
              <label className="text-ink/70 flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-royal-600 size-4"
                  checked={form.sin_factura}
                  onChange={(e) => setForm((f) => ({ ...f, sin_factura: e.target.checked }))}
                />
                Aún no entregan factura
              </label>
            </div>
            {!form.sin_factura ? (
              <div className="sm:col-span-2">
                <Input
                  label="N.º de factura (si tiene)"
                  solo="alfanumerico"
                  maxLength={20}
                  value={form.numero_factura}
                  onChange={(e) => setForm((f) => ({ ...f, numero_factura: e.target.value }))}
                />
                {posibleDuplicado ? (
                  <p className="text-warning mt-1 text-xs">
                    Ya está {posibleDuplicado.numero} de este proveedor con ese número de factura, por{' '}
                    {dinero(posibleDuplicado.moneda, posibleDuplicado.monto)}. Revise que no sea la misma.
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <Textarea
                label="Nota (opcional)"
                rows={2}
                maxLength={500}
                value={form.observacion}
                onChange={(e) => setForm((f) => ({ ...f, observacion: e.target.value }))}
              />
            </div>
          </div>
          {errorGuardar ? <ErrorDeCarga error={errorGuardar} className="mt-3" /> : null}
        </Modal>
      ) : null}

      {/* ── Abonar ── */}
      {abonando ? (
        <Modal
          abierto
          ancho="sm"
          onCerrar={() => setAbonando(null)}
          titulo={`Abonar a ${abonando.numero}`}
          descripcion={`${abonando.proveedor} · falta ${dinero(abonando.moneda, abonando.saldo)}`}
          acciones={
            <>
              <Button variant="ghost" onClick={() => setAbonando(null)}>
                Cancelar
              </Button>
              <Button
                disabled={!(Number(abono.monto) > 0) || !abono.fecha || abonar.isPending}
                onClick={() =>
                  abonar.mutate(
                    {
                      cuentaId: abonando.id,
                      fecha: abono.fecha,
                      moneda: abono.moneda,
                      monto: Number(abono.monto),
                      referencia: abono.referencia.trim() || null,
                      nota: abono.nota.trim() || null,
                    },
                    { onSuccess: () => setAbonando(null) },
                  )
                }
              >
                {abonar.isPending ? 'Guardando…' : 'Registrar abono'}
              </Button>
            </>
          }
        >
          <div className="grid gap-3">
            <Input
              label="Fecha del pago"
              type="date"
              value={abono.fecha}
              max={HOY}
              onChange={(e) => setAbono((a) => ({ ...a, fecha: e.target.value }))}
            />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input
                label="Monto pagado"
                type="number"
                limite={{ maxDecimales: 2, sinNegativos: true }}
                value={abono.monto}
                onChange={(e) => setAbono((a) => ({ ...a, monto: e.target.value }))}
              />
              <Select
                label="Moneda"
                value={abono.moneda}
                onChange={(e) => setAbono((a) => ({ ...a, moneda: e.target.value as MonedaPorPagar, monto: '' }))}
                opciones={[
                  { valor: 'USD', etiqueta: '$' },
                  { valor: 'VES', etiqueta: 'Bs' },
                ]}
              />
            </div>
            <Button variant="outline" onClick={pagarTodo}>
              Pagar todo lo que falta
            </Button>
            <p className="text-ink/60 text-sm">
              {abono.moneda !== abonando.moneda
                ? tasaDelAbono.data
                  ? `Tasa BCV del ${fecha(tasaDelAbono.data.fecha)}: Bs ${formatoTasa(tasaDelAbono.data.tasa)}. `
                  : tasaDelAbono.isPending
                    ? 'Buscando la tasa de ese día… '
                    : 'No hay tasa BCV para ese día: abone en la moneda de la deuda o registre la tasa. '
                : ''}
              {abonoEnCuenta != null
                ? `Descuenta ${dinero(abonando.moneda, abonoEnCuenta)}; quedarían ${dinero(
                    abonando.moneda,
                    Math.max(abonando.saldo - abonoEnCuenta, 0),
                  )} por pagar.`
                : null}
            </p>
            {abonoEnCuenta != null && abonoEnCuenta > abonando.saldo + 0.01 ? (
              <p className="text-danger text-sm">
                Pasa de lo que se debe ({simbolo(abonando.moneda)} {cifra(abonando.saldo)}).
              </p>
            ) : null}
            <Input
              label="Referencia (si tiene)"
              maxLength={40}
              value={abono.referencia}
              onChange={(e) => setAbono((a) => ({ ...a, referencia: e.target.value }))}
            />
            <Input
              label="Nota (opcional)"
              maxLength={200}
              value={abono.nota}
              onChange={(e) => setAbono((a) => ({ ...a, nota: e.target.value }))}
            />
          </div>
          {abonar.error ? <ErrorDeCarga error={abonar.error} className="mt-3" /> : null}
        </Modal>
      ) : null}

      {/* ── Anular (cuenta o abono) ── */}
      {anulando ? (
        <Modal
          abierto
          ancho="sm"
          onCerrar={() => setAnulando(null)}
          titulo={anulando.tipo === 'cuenta' ? `Anular ${anulando.cuenta.numero}` : 'Anular el abono'}
          descripcion="Queda a la vista, tachado, con el motivo. No se borra."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setAnulando(null)}>
                Volver
              </Button>
              <Button
                variant="danger"
                disabled={motivo.trim().length < 4 || anularCuenta.isPending || anularAbono.isPending}
                onClick={confirmarAnulacion}
              >
                {anularCuenta.isPending || anularAbono.isPending ? 'Anulando…' : 'Anular'}
              </Button>
            </>
          }
        >
          {anulando.tipo === 'abono' ? (
            <p className="text-ink/70 mb-3 text-sm">
              {dinero(anulando.abono.moneda, anulando.abono.monto)} del {fecha(anulando.abono.fecha)}. Lo que
              descontaba vuelve a quedar por pagar.
            </p>
          ) : null}
          <Textarea
            label="Motivo"
            rows={2}
            autoFocus
            maxLength={500}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          {anularCuenta.error ?? anularAbono.error ? (
            <ErrorDeCarga error={anularCuenta.error ?? anularAbono.error} className="mt-3" />
          ) : null}
        </Modal>
      ) : null}

      {/* ── Quién las lleva (ADMIN) ── */}
      {viendoLista ? (
        <Modal
          abierto
          ancho="sm"
          onCerrar={() => setViendoLista(false)}
          titulo="Quién lleva las cuentas por pagar"
          descripcion="Solo estas personas registran, abonan, corrigen y anulan. Los demás que entran a Gastos solo miran."
          acciones={
            <Button variant="ghost" onClick={() => setViendoLista(false)}>
              Cerrar
            </Button>
          }
        >
          <ul className="divide-hairline divide-y">
            {(controladores.data ?? []).map((c) => (
              <li key={c.usuario_id} className="flex items-center gap-2 py-2 text-sm">
                <span className={c.activo ? 'text-ink/85' : 'text-ink/40 line-through'}>{c.nombre}</span>
                <span className="text-ink/40 text-xs">{c.usuario}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  disabled={guardarControlador.isPending}
                  onClick={() => guardarControlador.mutate({ usuarioId: c.usuario_id, activo: !c.activo })}
                >
                  {c.activo ? 'Quitar' : 'Volver a poner'}
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-2">
            <Select
              label="Agregar a alguien"
              vacio="Elija un usuario"
              value={agregar}
              onChange={(e) => setAgregar(e.target.value)}
              opciones={(usuarios.data ?? [])
                .filter((u) => u.activo && !(controladores.data ?? []).some((c) => c.usuario_id === u.id))
                .map((u) => ({ valor: u.id, etiqueta: u.nombre }))}
            />
            <Button
              disabled={!agregar || guardarControlador.isPending}
              onClick={() =>
                guardarControlador.mutate({ usuarioId: agregar, activo: true }, { onSuccess: () => setAgregar('') })
              }
            >
              Agregar
            </Button>
          </div>
          {guardarControlador.error ? <ErrorDeCarga error={guardarControlador.error} className="mt-3" /> : null}
        </Modal>
      ) : null}

      {/* ── El PDF ── */}
      <Modal
        abierto={pidiendoPdf}
        onCerrar={() => setPidiendoPdf(false)}
        titulo="PDF de las cuentas por pagar"
        descripcion="Hoja horizontal como la de Excel: ítem, factura o concepto, descripción, monto en Bs y en $, y el total."
        acciones={
          <>
            <Button variant="ghost" onClick={() => setPidiendoPdf(false)}>
              Cancelar
            </Button>
            <Button icon={<FileText />} disabled={armando} onClick={() => void armarPdf()}>
              {armando ? 'Armando…' : 'Generar PDF'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Interruptor
            encendido={conPagadas}
            onCambio={setConPagadas}
            etiqueta="Incluir las pagadas"
            detalle="Salen en verde, como en la hoja, y no suman al total."
          />
          <Interruptor encendido={conLogo} onCambio={setConLogo} etiqueta="Incluir logo institucional" />
        </div>
        <p className="text-ink/50 mt-4 text-xs">
          Respeta la búsqueda y «solo sin factura» de la pantalla. Los montos se llevan a la otra moneda con la tasa BCV
          de hoy, que se dice al pie. Las anuladas no salen.
        </p>
        {fallaPdf ? <ErrorDeCarga error={fallaPdf} className="mt-4" /> : null}
      </Modal>

      <Visor
        abierto={archivo !== null}
        onCerrar={() => setArchivo(null)}
        blob={archivo?.blob ?? null}
        nombreArchivo={archivo?.nombre ?? ''}
        titulo="Cuentas por pagar"
      />
    </>
  )
}
