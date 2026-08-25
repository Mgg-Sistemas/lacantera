import { useState } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, CheckCircle2, ExternalLink, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_DEUDAS } from '@/components/pestanasDeModulos'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useCuentas, usePorPagar, useRegistrarPagosEnLote } from '@/lib/api/tesoreria'
import type { PorPagar } from '@/lib/api/tesoreria'
import { useMetodosPago, nombreDe } from '@/lib/api/metodosPago'
import { useMisRoles } from '@/lib/api/catalogo'
import { dinero, dolares, hace } from '@/lib/formato'
import { ModalRegistrarPago } from './ModalRegistrarPago'

/** El destino del dinero, dicho de la forma en que se paga por ese método. */
function destinoDe(p: PorPagar): string {
  if (p.metodo === 'PAGO_MOVIL') return `${p.banco ?? ''} · ${p.telefono ?? ''}`.trim()
  if (p.metodo === 'BINANCE') return p.correo_binance ?? p.numero_cuenta ?? '—'
  if (p.metodo === 'EFECTIVO') return `Entregar a ${p.receptor ?? '—'}`
  return `${p.banco ?? ''} · ${p.numero_cuenta ?? ''}`.trim()
}

const TONO_PRIORIDAD: Record<string, 'danger' | 'warning' | 'neutral'> = {
  URGENTE: 'danger',
  ALTA: 'warning',
  NORMAL: 'neutral',
}

function Fila({
  pago,
  puedePagar,
  onPagar,
  marcado,
  onMarcar,
}: {
  pago: PorPagar
  puedePagar: boolean
  onPagar: () => void
  marcado: boolean
  onMarcar: () => void
}) {
  const { data: metodos } = useMetodosPago()
  const total = Number(pago.monto) + Number(pago.igtf_monto)

  return (
    <div className="border-hairline flex flex-wrap items-start justify-between gap-4 border-b p-4 last:border-0">
      {/*
        La casilla, primero de todo.

        Va pegada a la fila y no en una columna aparte porque lo que se marca es
        el pago entero, no una celda. Y solo aparece para quien puede pagar:
        marcar sin poder cerrar el lote es una promesa que no se cumple.
      */}
      {puedePagar ? (
        <input
          type="checkbox"
          checked={marcado}
          onChange={onMarcar}
          aria-label={`Marcar el pago de ${pago.proveedor ?? 'este proveedor'}`}
          className="accent-royal-600 mt-1 size-4 shrink-0 cursor-pointer"
        />
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/app/compras/${pago.solicitud_id}`}
            className="text-ink/45 hover:text-royal-600 dark:hover:text-royal-300 font-mono text-xs"
          >
            {pago.orden_numero} <ExternalLink className="inline size-3" />
          </Link>
          <Chip tone="info">{nombreDe(metodos, pago.metodo)}</Chip>
          {/* La prioridad viene de la solicitud. Solo se enseña cuando dice
              algo: marcar «normal» en todas las filas no distingue ninguna. */}
          {pago.prioridad !== 'NORMAL' ? (
            <Chip tone={TONO_PRIORIDAD[pago.prioridad]}>{pago.prioridad.toLowerCase()}</Chip>
          ) : null}
          {pago.dias_esperando > 3 ? (
            <Chip tone={pago.dias_esperando > 7 ? 'danger' : 'warning'}>
              {pago.dias_esperando} días esperando
            </Chip>
          ) : null}
        </div>

        <p className="text-ink/90 mt-1 font-medium">{pago.proveedor ?? 'Sin proveedor'}</p>
        <p className="text-ink/55 text-sm">{pago.titulo}</p>
        <p className="text-ink/45 text-xs">Para {pago.unidad}</p>
        <p className="text-ink/45 mt-1 text-xs">{destinoDe(pago)}</p>
        {pago.titular ? (
          <p className="text-ink/45 text-xs">
            {pago.titular}
            {pago.documento ? ` · ${pago.documento}` : ''}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <div className="text-right">
          <p className="text-ink/90 tabular text-lg font-semibold">
            {dinero(pago.moneda, pago.monto)}
          </p>
          {pago.igtf_aplica ? (
            <p className="text-warning tabular text-xs">
              + {dinero(pago.moneda, pago.igtf_monto)} IGTF = {dinero(pago.moneda, total)}
            </p>
          ) : null}
          <p className="text-ink/40 text-xs">Instruida {hace(pago.creada_en)}</p>
        </div>

        {puedePagar ? (
          <Button size="sm" icon={<CheckCircle2 />} onClick={onPagar}>
            Pagar
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/*
  REGISTRAR LA TANDA

  Un lote comparte cuenta, fecha y referencia porque comparte transferencia:
  quien paga doce facturas del día lo hace en una tanda del banco y vuelve con
  un número. Si de verdad fueran doce transferencias distintas, se pagan una a
  una, que es lo que ya se podía hacer.

  Enseña la lista completa antes de confirmar. Es lo último que se ve antes de
  que salga el dinero, y con doce marcadas de un vistazo es fácil llevarse una
  que no tocaba.
*/
function ModalTanda({
  pagos,
  moneda,
  suma,
  onCerrar,
}: {
  pagos: PorPagar[]
  moneda: string
  suma: number
  onCerrar: (hecho: boolean) => void
}) {
  const { data: cuentas } = useCuentas(true)
  const enLote = useRegistrarPagosEnLote()

  const [cuentaId, setCuentaId] = useState('')
  const [referencia, setReferencia] = useState('')
  const [fecha, setFecha] = useState('')

  // Solo las de la moneda del lote: el resto no puede pagarlo y ofrecerlas
  // sería enseñar una puerta cerrada.
  const compatibles = (cuentas ?? []).filter((c) => c.moneda === moneda)

  // El efectivo no devuelve referencia; el banco sí, y sin ella un pago no se
  // puede señalar después en una conversación.
  const todoEfectivo = pagos.every((p) => p.metodo === 'EFECTIVO')

  return (
    <Modal
      abierto
      onCerrar={() => onCerrar(false)}
      ancho="lg"
      titulo={`Registrar ${pagos.length} pagos`}
      descripcion="Salen todos de la misma cuenta y con la misma referencia, como una sola tanda del banco."
      acciones={
        <>
          <Button variant="ghost" onClick={() => onCerrar(false)}>
            Cancelar
          </Button>
          <Button
            disabled={enLote.isPending || !cuentaId || (!todoEfectivo && !referencia.trim())}
            onClick={async () => {
              await enLote.mutateAsync({
                ids: pagos.map((p) => p.instruccion_id),
                cuenta_id: Number(cuentaId),
                referencia: referencia.trim() || undefined,
                fecha: fecha || undefined,
              })
              onCerrar(true)
            }}
          >
            {enLote.isPending ? 'Registrando…' : `Registrar los ${pagos.length}`}
          </Button>
        </>
      }
    >
      <div className="border-hairline bg-ink/2 mb-4 rounded-[6px] border p-3">
        <p className="text-ink/85 tabular text-lg font-semibold">{dinero(moneda, suma)}</p>
        <p className="text-ink/50 text-xs">
          {pagos.length} pagos, con IGTF donde aplica. Sale de una sola cuenta.
        </p>
      </div>

      <ul className="border-hairline mb-4 max-h-52 overflow-y-auto rounded-[6px] border">
        {pagos.map((p) => (
          <li
            key={p.instruccion_id}
            className="border-hairline flex items-center justify-between gap-3 border-b px-3 py-2 text-sm last:border-0"
          >
            <span className="min-w-0 flex-1 truncate">
              <span className="text-ink/85">{p.proveedor ?? 'Sin proveedor'}</span>
              <span className="text-ink/40 ml-2 font-mono text-xs">{p.orden_numero}</span>
            </span>
            <span className="text-ink/75 tabular shrink-0">
              {dinero(p.moneda, Number(p.monto) + Number(p.igtf_monto))}
            </span>
          </li>
        ))}
      </ul>

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Por dónde salió el dinero"
          vacio={compatibles.length ? 'Elige' : `No hay ninguna en ${moneda}`}
          value={cuentaId}
          onChange={(e) => setCuentaId(e.target.value)}
          opciones={compatibles.map((c) => ({ valor: String(c.id), etiqueta: c.nombre }))}
          hint="El sistema no lleva el saldo de las cuentas: queda anotado en cada pago."
        />
        <Input
          label="Fecha del pago"
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          hint="Vacío es hoy."
        />
        <div className="sm:col-span-2">
          <Input
            label={todoEfectivo ? 'Referencia (opcional en efectivo)' : 'Número de referencia'}
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            hint="La misma para todos: es la tanda que devolvió el banco."
          />
        </div>
      </div>

      {enLote.error ? <ErrorDeCarga error={enLote.error} className="mt-3" /> : null}

      <p className="text-ink/40 mt-3 text-xs">
        O pasan todos o no pasa ninguno. Si uno falla, se deshacen los demás y el sistema dice
        cuál fue.
      </p>
    </Modal>
  )
}

export function Pagos() {
  const { data, isPending, error } = usePorPagar()
  const { puede } = useMisRoles()
  const [pagando, setPagando] = useState<PorPagar | null>(null)

  /*
    CÓMO SE AGRUPA EL TRABAJO

    La líder: los lotes «se clasificarán por urgencia o prioridad y por
    departamento, además se podrá organizar por valor de mayor a menor».

    Los filtros acotan lo que se ve y el orden decide por dónde se empieza. Van
    juntos a propósito: se filtra por «urgente», se ordena por monto, se marca
    todo y se paga. Eso es la tanda.

    El orden por defecto sigue siendo el de llegada. Es el que responde a la
    pregunta que más se hace —«¿qué lleva más esperando?»— y el que evita que
    un proveedor pequeño quede al final para siempre por pedir poco.
  */
  const [marcados, setMarcados] = useState<Set<number>>(new Set())
  const [prioridad, setPrioridad] = useState('')
  const [unidad, setUnidad] = useState('')
  const [orden, setOrden] = useState<'ANTIGUEDAD' | 'MONTO' | 'PRIORIDAD'>('ANTIGUEDAD')
  const [enLote, setEnLote] = useState(false)

  /*
    QUIÉN PUEDE REGISTRAR EL PAGO

    Era solo el rol TESORERIA. Al combinarse las dos áreas por decisión de la
    empresa, quien lleva compras se quedaba mirando la cola sin poder cerrarla.

    Van los dos, y no es una apertura: `registrar_pago_compra` siempre exigió
    COMPRAS en escritura, nunca el rol de tesorería. El front pedía una llave
    distinta de la que pide la puerta, y quien tuviera compras y no tesorería
    veía el botón ausente sin saber por qué.
  */
  const puedePagar = puede('COMPRAS')
  const pendientes = data ?? []

  // Lo que hay que pagar, en dólares, para compararlo con lo que hay. Es la
  // única cifra que responde "¿alcanza?" cuando las instrucciones vienen en
  // dos monedas.
  const totalUsd = pendientes.reduce((s, p) => {
    const monto = Number(p.monto_usd)
    // El IGTF viene en la moneda de la instrucción; se lleva a dólares con la
    // misma proporción del monto en vez de sumarlo tal cual.
    const igtf = p.igtf_aplica ? (Number(p.igtf_monto) * monto) / Number(p.monto) : 0
    return s + monto + igtf
  }, 0)

  const unidades = [...new Set(pendientes.map((p) => p.unidad))].sort()

  const visibles = pendientes
    .filter((p) => (prioridad ? p.prioridad === prioridad : true))
    .filter((p) => (unidad ? p.unidad === unidad : true))
    .sort((a, b) => {
      if (orden === 'MONTO') return Number(b.monto_usd) - Number(a.monto_usd)
      if (orden === 'PRIORIDAD') {
        // A igual prioridad manda la antigüedad: dentro de lo urgente, lo que
        // lleva más esperando urge más.
        if (a.prioridad_orden !== b.prioridad_orden) return a.prioridad_orden - b.prioridad_orden
        return b.dias_esperando - a.dias_esperando
      }
      return b.dias_esperando - a.dias_esperando
    })

  // Solo se pueden marcar los de una misma moneda: el lote sale de una cuenta,
  // y una cuenta tiene una moneda. Se resuelve en la pantalla para no dejar que
  // alguien marque doce y descubra el problema al pulsar.
  const monedaDelLote = marcados.size
    ? pendientes.find((p) => marcados.has(p.instruccion_id))?.moneda
    : null

  const seleccionados = pendientes.filter((p) => marcados.has(p.instruccion_id))
  const sumaMarcada = seleccionados.reduce(
    (s, p) => s + Number(p.monto) + Number(p.igtf_monto),
    0,
  )

  const alternar = (id: number) =>
    setMarcados((antes) => {
      const nuevo = new Set(antes)
      if (nuevo.has(id)) nuevo.delete(id)
      else nuevo.add(id)
      return nuevo
    })

  const marcarTodos = () => {
    // Marca lo visible que comparta moneda con lo que ya hay marcado, o con el
    // primero de la lista si no hay nada.
    const moneda = monedaDelLote ?? visibles[0]?.moneda
    setMarcados(
      new Set(visibles.filter((p) => p.moneda === moneda).map((p) => p.instruccion_id)),
    )
  }

  return (
    <>
      <PageHeader
        title="Pagos por hacer"
        description="Lo que compras ya autorizó y todavía no ha salido del banco. Al pagar, la compra queda esperando que llegue el material."
      />

      <Pestanas pestanas={PESTANAS_DEUDAS} />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {pendientes.length > 0 ? (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-ink/45 text-xs">Por pagar</p>
              <p className="text-ink/90 tabular text-2xl font-semibold">
                {pendientes.length}
              </p>
              <p className="text-ink/40 text-xs">
                {pendientes.filter((p) => p.dias_esperando > 3).length} llevan más de tres días
              </p>
            </Card>
            <Card>
              <p className="text-ink/45 text-xs">Suma, con IGTF</p>
              <p className="text-safety tabular text-2xl font-semibold">{dolares(totalUsd)}</p>
              <p className="text-ink/40 text-xs">Al cambio de cada pago</p>
            </Card>
            {/*
              Aquí había un tercer indicador: cuánto había en las cuentas en
              dólares. Se va con los bancos.

              La empresa dejó de llevar saldos, así que ese número no lo
              actualiza nadie — y un disponible desactualizado al lado de lo que
              hay que pagar es peor que no tenerlo: invita a decidir sobre él.
              Además remitía a «Bancos y cajas», que ya no está en el menú.
            */}
          </div>

          {pendientes.some((p) => p.dias_esperando > 7) ? (
            <div className="border-warning/30 bg-warning-soft mb-4 flex items-start gap-2.5 rounded-[6px] border p-3.5">
              <AlertTriangle className="text-warning mt-px size-[18px] shrink-0" />
              <p className="text-ink/80 text-sm">
                Hay instrucciones esperando más de una semana. El proveedor no reserva el
                material hasta que ve el pago, y la cotización tiene fecha de vencimiento.
              </p>
            </div>
          ) : null}

          {/* --------------- Cómo se agrupa la tanda --------------- */}
          <Card className="mb-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Select
                label="Qué urge"
                vacio="Todas las prioridades"
                value={prioridad}
                onChange={(e) => setPrioridad(e.target.value)}
                opciones={[
                  { valor: 'URGENTE', etiqueta: 'Urgente' },
                  { valor: 'ALTA', etiqueta: 'Alta' },
                  { valor: 'NORMAL', etiqueta: 'Normal' },
                ]}
              />
              <Select
                label="Para qué unidad"
                vacio="Todas las unidades"
                value={unidad}
                onChange={(e) => setUnidad(e.target.value)}
                opciones={unidades.map((u) => ({ valor: u, etiqueta: u }))}
              />
              <Select
                label="Por dónde empezar"
                value={orden}
                onChange={(e) => setOrden(e.target.value as typeof orden)}
                opciones={[
                  { valor: 'ANTIGUEDAD', etiqueta: 'Lo que lleva más esperando' },
                  { valor: 'PRIORIDAD', etiqueta: 'Lo más urgente' },
                  { valor: 'MONTO', etiqueta: 'De mayor a menor monto' },
                ]}
              />
            </div>
          </Card>

          <Card flush>
            <div className="px-4 pt-4">
              <CardHeader
                title="Cola de pagos"
                subtitle={
                  visibles.length === pendientes.length
                    ? `${pendientes.length} por pagar`
                    : `${visibles.length} de ${pendientes.length}, con los filtros puestos`
                }
                action={
                  puedePagar && visibles.length > 1 ? (
                    <Button size="sm" variant="ghost" onClick={marcarTodos}>
                      Marcar los de una moneda
                    </Button>
                  ) : undefined
                }
              />
            </div>
            <div className="mt-2">
              {visibles.map((p) => (
                <Fila
                  key={p.instruccion_id}
                  pago={p}
                  puedePagar={
                    // Con un lote empezado, solo se pueden sumar los de la
                    // misma moneda: el dinero sale de una sola cuenta.
                    puedePagar && (!monedaDelLote || p.moneda === monedaDelLote)
                  }
                  marcado={marcados.has(p.instruccion_id)}
                  onMarcar={() => alternar(p.instruccion_id)}
                  onPagar={() => setPagando(p)}
                />
              ))}
              {visibles.length === 0 ? (
                <p className="text-ink/50 p-6 text-center text-sm">
                  Ninguno cuadra con los filtros puestos.
                </p>
              ) : null}
            </div>
          </Card>

          {/*
            LA BARRA DE LA TANDA

            Aparece al marcar el primero y se queda abajo mientras se recorre la
            lista. Fija a propósito: con veinte pagos en pantalla, un botón al
            final de la tabla obliga a bajar cada vez para ver cuánto llevas
            marcado.
          */}
          {marcados.size > 0 ? (
            <div className="border-hairline bg-surface shadow-card sticky bottom-4 mt-4 flex flex-wrap items-center gap-3 rounded-[8px] border p-4">
              <div className="min-w-0 flex-1">
                <p className="text-ink/85 text-sm font-medium">
                  {marcados.size} pago{marcados.size === 1 ? '' : 's'} marcado
                  {marcados.size === 1 ? '' : 's'}
                </p>
                <p className="text-ink/50 text-xs">
                  Suman {dinero(monedaDelLote ?? 'USD', sumaMarcada)}, con IGTF. Salen todos de la
                  misma cuenta y con la misma referencia.
                </p>
              </div>
              <Button variant="ghost" onClick={() => setMarcados(new Set())}>
                Desmarcar
              </Button>
              <Button icon={<CheckCircle2 />} onClick={() => setEnLote(true)}>
                Registrar los {marcados.size}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<Wallet />}
            titulo="No hay nada por pagar"
            descripcion="Cuando compras autorice una orden e indique cómo se paga, aparece aquí."
          />
        </Card>
      ) : null}

      {pagando ? (
        <ModalRegistrarPago
          instruccion={{ ...pagando, id: pagando.instruccion_id }}
          onCerrar={() => setPagando(null)}
        />
      ) : null}

      {enLote ? (
        <ModalTanda
          pagos={seleccionados}
          moneda={monedaDelLote ?? 'USD'}
          suma={sumaMarcada}
          onCerrar={(hecho) => {
            setEnLote(false)
            if (hecho) setMarcados(new Set())
          }}
        />
      ) : null}
    </>
  )
}
