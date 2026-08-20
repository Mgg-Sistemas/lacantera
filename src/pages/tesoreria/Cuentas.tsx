import { useState } from 'react'
import {
  ArrowLeftRight,
  ArrowDownCircle,
  ArrowUpCircle,
  Landmark,
  Plus,
  Scale,
  Wallet,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import {
  TIPOS_CUENTA,
  useAjustarCuenta,
  useCuentas,
  useGuardarCuenta,
  useRegistrarApertura,
  useRegistrarEgreso,
  useRegistrarIngreso,
  useTransferir,
} from '@/lib/api/tesoreria'
import type { Cuenta } from '@/lib/api/tesoreria'
import { useMisRoles } from '@/lib/api/catalogo'
import { useMonedas, useTasasVigentes } from '@/lib/api/tasas'
import { dinero, fecha, tasa as formatoTasa } from '@/lib/formato'
import { BANCOS } from '@/lib/bancos'

const vacia = {
  codigo: '',
  nombre: '',
  tipo: 'BANCO',
  moneda: 'VES',
  banco: '',
  numero_cuenta: '',
  titular: '',
  documento: '',
  correo_binance: '',
  red_cripto: '',
  permite_sobregiro: false,
  activa: true,
  nota: '',
}

type Edicion = typeof vacia & { id?: number }

const iconos: Record<string, typeof Landmark> = {
  BANCO: Landmark,
  CAJA: Wallet,
  BILLETERA: Wallet,
}

// ---------------------------------------------------------------------------

function TarjetaCuenta({
  cuenta,
  puedeMover,
  onEditar,
  onMover,
}: {
  cuenta: Cuenta
  puedeMover: boolean
  onEditar: () => void
  onMover: (accion: 'apertura' | 'ingreso' | 'egreso' | 'ajuste') => void
}) {
  const Icono = iconos[cuenta.tipo] ?? Landmark
  const sinAbrir = !cuenta.movimientos

  return (
    <Card className={cuenta.activa ? undefined : 'opacity-60'}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="bg-royal-600/10 text-royal-600 dark:text-royal-300 rounded-[6px] p-2">
            <Icono className="size-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-ink/90 truncate text-base font-semibold">{cuenta.nombre}</h3>
            <p className="text-ink/45 truncate text-xs">
              {cuenta.numero_cuenta ?? cuenta.titular ?? cuenta.codigo}
            </p>
          </div>
        </div>
        <Chip tone={cuenta.moneda === 'VES' ? 'neutral' : 'info'}>{cuenta.moneda}</Chip>
      </div>

      <div className="mt-4">
        <p className="text-ink/45 text-xs">Saldo</p>
        {/* El saldo se muestra en la moneda de la cuenta y en ninguna otra: es
            el número que tiene que coincidir con el del banco. */}
        <p
          className={`tabular text-2xl font-semibold ${
            Number(cuenta.saldo) < 0 ? 'text-danger' : 'text-ink/90'
          }`}
        >
          {dinero(cuenta.moneda, cuenta.saldo)}
        </p>
        <p className="text-ink/40 mt-0.5 text-xs">
          {sinAbrir
            ? 'Sin movimientos todavía'
            : `${cuenta.movimientos} movimiento${cuenta.movimientos === 1 ? '' : 's'} · último ${fecha(cuenta.ultimo_movimiento)}`}
        </p>
      </div>

      {puedeMover ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {sinAbrir ? (
            <Button size="sm" variant="soft" icon={<Scale />} onClick={() => onMover('apertura')}>
              Saldo de apertura
            </Button>
          ) : null}
          <Button size="sm" variant="outline" icon={<ArrowDownCircle />} onClick={() => onMover('ingreso')}>
            Ingreso
          </Button>
          <Button size="sm" variant="outline" icon={<ArrowUpCircle />} onClick={() => onMover('egreso')}>
            Egreso
          </Button>
          {/* El ajuste es el único remedio cuando el saldo de apertura quedó
              mal: la apertura se registra una sola vez y la base rechaza la
              segunda. Sin este botón, esa cuenta no se podría corregir. */}
          {!sinAbrir ? (
            <Button size="sm" variant="ghost" icon={<Scale />} onClick={() => onMover('ajuste')}>
              Ajustar
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={onEditar}>
            Editar
          </Button>
        </div>
      ) : (
        <div className="mt-4">
          <Button size="sm" variant="ghost" onClick={onEditar}>
            Ver datos
          </Button>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------

export function Cuentas() {
  const { data, isPending, error } = useCuentas(false)
  const { puede } = useMisRoles()
  const guardar = useGuardarCuenta()
  const apertura = useRegistrarApertura()
  const ingreso = useRegistrarIngreso()
  const egreso = useRegistrarEgreso()
  const ajuste = useAjustarCuenta()
  const transferir = useTransferir()

  const [edicion, setEdicion] = useState<Edicion | null>(null)
  const [movimiento, setMovimiento] = useState<{
    cuenta: Cuenta
    accion: 'apertura' | 'ingreso' | 'egreso' | 'ajuste'
  } | null>(null)
  const [traslado, setTraslado] = useState(false)

  const puedeMover = puede('TESORERIA')

  const abrir = (c?: Cuenta) =>
    setEdicion(
      c
        ? {
            id: c.id,
            codigo: c.codigo,
            nombre: c.nombre,
            tipo: c.tipo,
            moneda: c.moneda,
            banco: c.banco ?? '',
            numero_cuenta: c.numero_cuenta ?? '',
            titular: c.titular ?? '',
            // Estos cuatro se cargan de la cuenta, no en blanco: el formulario
            // guarda todo lo que tiene, así que abrirlos vacíos borraría el RIF
            // del titular al corregir cualquier otra cosa.
            documento: c.documento ?? '',
            correo_binance: c.correo_binance ?? '',
            red_cripto: c.red_cripto ?? '',
            permite_sobregiro: c.permite_sobregiro,
            activa: c.activa,
            nota: c.nota ?? '',
          }
        : { ...vacia },
    )

  const cambiar = (c: Partial<Edicion>) => setEdicion((e) => (e ? { ...e, ...c } : e))

  /*
    EL TOTAL SUMA TODAS LAS MONEDAS, NO SOLO DOS

    Antes recorría las cuentas y devolvía `suma` sin tocarla para cualquier
    moneda que no fuera dólar o bolívar. Con una sola cuenta en euros o en USDT
    —y hay una, la de Binance— ese saldo desaparecía del total **sin avisar**:
    el número salía corto y parecía correcto, que es la peor forma de estar mal.

    Ahora cada moneda se convierte con su propia tasa y se dice cuál falta si
    alguna no la tiene.

    Se convierte con la tasa de hoy, no con la del día en que entró cada
    bolívar: la pregunta que se hace quien mira este número es «cuánto vale
    ahora lo que hay» antes de comprometer un pago.
  */
  const monedas = useMonedas()
  const tasas = useTasasVigentes(
    monedas.data?.filter((m) => m.codigo !== 'VES'),
    true,
  )

  const bsPorUnidad = new Map<string, number>([['VES', 1]])
  for (const { moneda, tasa: t } of tasas.datos) {
    if (t) bsPorUnidad.set(moneda.codigo, Number(t.tasa))
  }

  /*
    El total se lee en cualquier moneda que tenga tasa, no en dos escritas a
    mano.

    Empezó con `['USD', 'VES']` fijo, y eso era el mismo vicio que este cambio
    venía a quitar de otros sitios: quien va a pagar en euros o a pasar un saldo
    a Binance tiene la misma pregunta que quien paga en bolívares. Salen del
    catálogo, así que la lista es la misma que ofrece la calculadora y el día que
    entre otra moneda aparece sola.

    El dólar abre porque es con lo que se mide el sistema.
  */
  const [expresarEn, setExpresarEn] = useState('USD')

  const presentes = [...new Set((data ?? []).filter((c) => c.activa).map((c) => c.moneda))]
  const sinTasa = presentes.filter((m) => !bsPorUnidad.has(m))

  const totalBs = (data ?? []).reduce(
    (suma, c) => (c.activa ? suma + Number(c.saldo) * (bsPorUnidad.get(c.moneda) ?? 0) : suma),
    0,
  )

  const tasaDestino = bsPorUnidad.get(expresarEn)
  const total = totalBs / (tasaDestino ?? 1)

  // Faltando una tasa el total saldría corto sin avisar. Es preferible no dar
  // la cifra que darla mal.
  const totalCompleto = sinTasa.length === 0 && Boolean(tasaDestino)

  // Solo se ofrecen las que tienen tasa: expresar un total en una moneda sin
  // tasa no da un número, y ofrecerlo enseña a chocarse.
  const expresables = (monedas.data ?? []).filter((m) => bsPorUnidad.has(m.codigo))

  return (
    <>
      <PageHeader
        title="Bancos y cajas"
        description="Dónde está el dinero. El saldo se suma del libro: no hay un número guardado que pueda quedar viejo."
        actions={
          puedeMover ? (
            <div className="flex gap-2">
              <Button variant="outline" icon={<ArrowLeftRight />} onClick={() => setTraslado(true)}>
                Trasladar
              </Button>
              <Button icon={<Plus />} onClick={() => abrir()}>
                Nueva cuenta
              </Button>
            </div>
          ) : null
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length > 0 ? (
        <>
          <Card className="mb-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-ink/45 text-xs">Disponible en cuentas activas</p>
                  <div className="border-hairline flex overflow-hidden rounded-full border">
                    {expresables.map((m) => (
                      <button
                        key={m.codigo}
                        type="button"
                        onClick={() => setExpresarEn(m.codigo)}
                        title={`Expresar el total en ${m.nombre.toLowerCase()}`}
                        className={
                          m.codigo === expresarEn
                            ? 'bg-royal-600/12 text-ink/85 px-2 py-0.5 text-2xs font-medium'
                            : 'text-ink/45 hover:text-ink/75 px-2 py-0.5 text-2xs'
                        }
                      >
                        {m.codigo === 'VES' ? 'Bs' : m.simbolo}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-safety tabular text-2xl font-semibold">
                  {totalCompleto ? dinero(expresarEn, total) : '—'}
                </p>
              </div>
              <p className="text-ink/45 max-w-md text-xs">
                {totalCompleto ? (
                  <>
                    Convertido con las tasas de hoy
                    {expresarEn !== 'VES' && tasaDestino
                      ? ` (Bs ${formatoTasa(tasaDestino)} por ${
                          expresables.find((m) => m.codigo === expresarEn)?.simbolo ?? expresarEn
                        })`
                      : ''}
                    , no con la del día en que entró cada saldo. Cada cuenta manda el suyo.
                  </>
                ) : sinTasa.length > 0 ? (
                  `Hay cuentas en ${sinTasa.join(', ')} y falta registrar su tasa del día. Sin ella el total saldría corto: regístrala en Sistema › Tasas de cambio. El saldo de cada cuenta sí es exacto.`
                ) : (
                  'Falta la tasa del día para convertir. Regístrala en Sistema › Tasas de cambio; mientras tanto, el saldo de cada cuenta sí es exacto.'
                )}
              </p>
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.map((c) => (
              <TarjetaCuenta
                key={c.id}
                cuenta={c}
                puedeMover={puedeMover}
                onEditar={() => abrir(c)}
                onMover={(accion) => setMovimiento({ cuenta: c, accion })}
              />
            ))}
          </div>
        </>
      ) : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<Landmark />}
            titulo="No hay cuentas"
            descripcion="Sin una cuenta no se puede registrar de dónde sale el dinero de una compra."
            accion={
              puedeMover ? (
                <Button icon={<Plus />} onClick={() => abrir()}>
                  Crear la primera
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : null}

      {/* ------------------------------ Cuenta ------------------------------ */}
      {edicion ? (
        <Modal
          abierto
          onCerrar={() => setEdicion(null)}
          titulo={edicion.id ? 'Editar cuenta' : 'Nueva cuenta'}
          descripcion="Una cuenta, una moneda. Mezclarlas obliga a inventar un saldo que ya no coincide con el del banco."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setEdicion(null)}>
                Cancelar
              </Button>
              {puedeMover ? (
                <Button
                  disabled={guardar.isPending || !edicion.nombre}
                  onClick={async () => {
                    await guardar.mutateAsync(edicion)
                    setEdicion(null)
                  }}
                >
                  {guardar.isPending ? 'Guardando…' : 'Guardar'}
                </Button>
              ) : null}
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Tipo"
              value={edicion.tipo}
              onChange={(e) => cambiar({ tipo: e.target.value })}
              opciones={TIPOS_CUENTA}
            />
            <Select
              label="Moneda"
              value={edicion.moneda}
              onChange={(e) => cambiar({ moneda: e.target.value })}
              opciones={(monedas.data ?? []).map((m) => ({ valor: m.codigo, etiqueta: m.nombre }))}
              hint={edicion.id ? 'No cambia si ya tiene movimientos.' : undefined}
            />

            <div className="sm:col-span-2">
              <Input
                label="Nombre"
                placeholder="Banesco · cuenta corriente Bs"
                value={edicion.nombre}
                onChange={(e) => cambiar({ nombre: e.target.value })}
              />
            </div>

            {edicion.tipo === 'BANCO' ? (
              <>
                <Select
                  label="Banco"
                  vacio="Elige el banco"
                  value={edicion.banco}
                  onChange={(e) => cambiar({ banco: e.target.value })}
                  opciones={BANCOS.map((b) => ({ valor: b, etiqueta: b }))}
                />
                <Input
                  label="Número de cuenta"
                  placeholder="0134-0000-00-0000000000"
                  value={edicion.numero_cuenta}
                  onChange={(e) => cambiar({ numero_cuenta: e.target.value })}
                />
              </>
            ) : null}

            {edicion.tipo === 'BILLETERA' ? (
              <>
                <Input
                  label="Correo de la plataforma"
                  placeholder="pagos@lacantera.com"
                  value={edicion.correo_binance}
                  onChange={(e) => cambiar({ correo_binance: e.target.value })}
                />
                {/* Una billetera se identifica por el correo o por la dirección
                    de la wallet: hay quien solo tiene la segunda. */}
                <Input
                  label="Dirección de la wallet"
                  value={edicion.numero_cuenta}
                  onChange={(e) => cambiar({ numero_cuenta: e.target.value })}
                />
                <Input
                  label="Red"
                  placeholder="TRC20"
                  value={edicion.red_cripto}
                  onChange={(e) => cambiar({ red_cripto: e.target.value })}
                />
              </>
            ) : null}

            <Input
              label={edicion.tipo === 'CAJA' ? 'Quién responde por el efectivo' : 'Titular'}
              value={edicion.titular}
              onChange={(e) => cambiar({ titular: e.target.value })}
            />
            <Input
              label="Cédula o RIF"
              value={edicion.documento}
              onChange={(e) => cambiar({ documento: e.target.value })}
            />

            <div className="sm:col-span-2">
              <Textarea
                label="Nota"
                rows={2}
                placeholder="Solo para pagos a proveedores del interior."
                value={edicion.nota}
                onChange={(e) => cambiar({ nota: e.target.value })}
              />
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <label className="text-ink/75 flex cursor-pointer items-start gap-2 text-sm select-none">
              <input
                type="checkbox"
                className="accent-royal-600 mt-0.5 size-4"
                checked={edicion.permite_sobregiro}
                onChange={(e) => cambiar({ permite_sobregiro: e.target.checked })}
              />
              <span>
                Admite sobregiro
                <span className="text-ink/45 block text-xs">
                  Solo si el banco dio línea de crédito. Una caja chica no entrega billetes
                  que no tiene.
                </span>
              </span>
            </label>
            <label className="text-ink/75 flex cursor-pointer items-center gap-2 text-sm select-none">
              <input
                type="checkbox"
                className="accent-royal-600 size-4"
                checked={edicion.activa}
                onChange={(e) => cambiar({ activa: e.target.checked })}
              />
              Activa
            </label>
          </div>

          {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-4" /> : null}
        </Modal>
      ) : null}

      {/* ---------------------------- Movimiento ---------------------------- */}
      {movimiento ? (
        <ModalMovimiento
          cuenta={movimiento.cuenta}
          accion={movimiento.accion}
          onCerrar={() => setMovimiento(null)}
          onGuardar={async (datos) => {
            const base = { cuenta_id: movimiento.cuenta.id, ...datos }
            if (movimiento.accion === 'apertura') {
              await apertura.mutateAsync({ ...base, monto: datos.monto })
            } else if (movimiento.accion === 'ingreso') {
              await ingreso.mutateAsync({ ...base, concepto: datos.concepto })
            } else if (movimiento.accion === 'egreso') {
              await egreso.mutateAsync({ ...base, concepto: datos.concepto })
            } else {
              await ajuste.mutateAsync({ ...base, motivo: datos.concepto })
            }
            setMovimiento(null)
          }}
          error={apertura.error ?? ingreso.error ?? egreso.error ?? ajuste.error}
          guardando={
            apertura.isPending || ingreso.isPending || egreso.isPending || ajuste.isPending
          }
        />
      ) : null}

      {/* ---------------------------- Traslado ---------------------------- */}
      {traslado && data ? (
        <ModalTraslado
          cuentas={data.filter((c) => c.activa)}
          onCerrar={() => setTraslado(false)}
          onGuardar={async (t) => {
            await transferir.mutateAsync(t)
            setTraslado(false)
          }}
          error={transferir.error}
          guardando={transferir.isPending}
        />
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------

const titulos = {
  apertura: 'Saldo de apertura',
  ingreso: 'Registrar un ingreso',
  egreso: 'Registrar un egreso',
  ajuste: 'Ajustar el saldo',
}

const descripciones = {
  apertura:
    'Lo que había en la cuenta el día que empieza a llevarse aquí. Se registra una sola vez.',
  ingreso: 'Dinero que entró y no viene de una venta ya registrada.',
  egreso: 'Dinero que salió y no es el pago de una compra: eso se registra desde la compra.',
  ajuste:
    'Solo cuando el banco dice otra cosa y ya se buscó el porqué. La diferencia queda escrita.',
}

function ModalMovimiento({
  cuenta,
  accion,
  onCerrar,
  onGuardar,
  error,
  guardando,
}: {
  cuenta: Cuenta
  accion: 'apertura' | 'ingreso' | 'egreso' | 'ajuste'
  onCerrar: () => void
  onGuardar: (d: {
    monto: number
    concepto: string
    fecha?: string
    referencia?: string
    contraparte?: string
  }) => Promise<void>
  error: unknown
  guardando: boolean
}) {
  const [monto, setMonto] = useState('')
  const [concepto, setConcepto] = useState('')
  const [contraparte, setContraparte] = useState('')
  const [referencia, setReferencia] = useState('')
  const [dia, setDia] = useState('')

  const esAjuste = accion === 'ajuste'
  // Solo el ajuste admite un monto negativo: es el único caso en que el signo
  // significa algo — sobra o falta dinero. En el resto, el sentido lo pone la
  // operación, y un negativo sería un ingreso que resta.
  const montoValido = esAjuste ? Number(monto) !== 0 : Number(monto) > 0
  const listo =
    montoValido && (accion === 'apertura' || concepto.trim().length >= (esAjuste ? 10 : 4))

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={titulos[accion]}
      descripcion={`${cuenta.nombre} · ${descripciones[accion]}`}
      ancho="sm"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={guardando || !listo}
            onClick={() =>
              void onGuardar({
                monto: Number(monto),
                concepto,
                fecha: dia || undefined,
                referencia: referencia || undefined,
                contraparte: contraparte || undefined,
              })
            }
          >
            {guardando ? 'Guardando…' : 'Registrar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label={`Monto en ${cuenta.moneda}`}
          type="number"
          step="0.01"
          inputMode="decimal"
          autoFocus
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          hint={
            esAjuste
              ? 'Positivo si sobra dinero en la cuenta, negativo si falta.'
              : undefined
          }
        />

        {accion !== 'apertura' ? (
          <Textarea
            label={esAjuste ? 'Qué explica la diferencia' : 'Concepto'}
            rows={2}
            placeholder={
              esAjuste
                ? 'El banco cobró una comisión que no estaba registrada.'
                : accion === 'ingreso'
                  ? 'Aporte del socio para la nómina'
                  : 'Pago del servicio eléctrico'
            }
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
          />
        ) : null}

        {accion === 'ingreso' || accion === 'egreso' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="De quién / a quién"
              value={contraparte}
              onChange={(e) => setContraparte(e.target.value)}
            />
            <Input
              label="Referencia"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
            />
          </div>
        ) : null}

        <Input
          label="Fecha"
          type="date"
          value={dia}
          onChange={(e) => setDia(e.target.value)}
          hint="Vacío es hoy."
        />

        {error ? <ErrorDeCarga error={error} /> : null}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------

function ModalTraslado({
  cuentas,
  onCerrar,
  onGuardar,
  error,
  guardando,
}: {
  cuentas: Cuenta[]
  onCerrar: () => void
  onGuardar: (t: {
    origen: number
    destino: number
    monto: number
    monto_destino?: number | null
    fecha?: string
    referencia?: string
  }) => Promise<void>
  error: unknown
  guardando: boolean
}) {
  const [origen, setOrigen] = useState('')
  const [destino, setDestino] = useState('')
  const [monto, setMonto] = useState('')
  const [llega, setLlega] = useState('')
  const [referencia, setReferencia] = useState('')
  const [dia, setDia] = useState('')

  const cOrigen = cuentas.find((c) => String(c.id) === origen)
  const cDestino = cuentas.find((c) => String(c.id) === destino)
  const cambia = cOrigen && cDestino && cOrigen.moneda !== cDestino.moneda

  const listo =
    origen && destino && origen !== destino && Number(monto) > 0 && (!cambia || Number(llega) > 0)

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Trasladar entre cuentas"
      descripcion="El mismo dinero cambiando de sitio. No cuenta como ingreso ni como gasto del mes."
      ancho="sm"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={guardando || !listo}
            onClick={() =>
              void onGuardar({
                origen: Number(origen),
                destino: Number(destino),
                monto: Number(monto),
                monto_destino: cambia ? Number(llega) : null,
                fecha: dia || undefined,
                referencia: referencia || undefined,
              })
            }
          >
            {guardando ? 'Guardando…' : 'Trasladar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Sale de"
          vacio="Elige la cuenta"
          value={origen}
          onChange={(e) => setOrigen(e.target.value)}
          opciones={cuentas.map((c) => ({
            valor: String(c.id),
            etiqueta: `${c.nombre} — ${dinero(c.moneda, c.saldo)}`,
          }))}
        />

        <Input
          label={`Monto${cOrigen ? ` en ${cOrigen.moneda}` : ''}`}
          type="number"
          step="0.01"
          inputMode="decimal"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />

        <Select
          label="Entra en"
          vacio="Elige la cuenta"
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          opciones={cuentas
            .filter((c) => String(c.id) !== origen)
            .map((c) => ({
              valor: String(c.id),
              etiqueta: `${c.nombre} — ${dinero(c.moneda, c.saldo)}`,
            }))}
        />

        {cambia ? (
          <Input
            label={`Cuánto llegó en ${cDestino!.moneda}`}
            type="number"
            step="0.01"
            inputMode="decimal"
            value={llega}
            onChange={(e) => setLlega(e.target.value)}
            hint="Se copia del comprobante. La casa de cambio no usa la tasa oficial y el sistema no va a inventar un número que el banco desmienta."
          />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Referencia"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
          />
          <Input
            label="Fecha"
            type="date"
            value={dia}
            onChange={(e) => setDia(e.target.value)}
            hint="Vacío es hoy."
          />
        </div>

        {error ? <ErrorDeCarga error={error} /> : null}
      </div>
    </Modal>
  )
}
