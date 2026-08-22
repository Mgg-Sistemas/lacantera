import { useState } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, CheckCircle2, ExternalLink, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_DEUDAS } from '@/components/pestanasDeModulos'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { usePorPagar } from '@/lib/api/tesoreria'
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

function Fila({
  pago,
  puedePagar,
  onPagar,
}: {
  pago: PorPagar
  puedePagar: boolean
  onPagar: () => void
}) {
  const { data: metodos } = useMetodosPago()
  const total = Number(pago.monto) + Number(pago.igtf_monto)

  return (
    <div className="border-hairline flex flex-wrap items-start justify-between gap-4 border-b p-4 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/app/compras/${pago.solicitud_id}`}
            className="text-ink/45 hover:text-royal-600 dark:hover:text-royal-300 font-mono text-xs"
          >
            {pago.orden_numero} <ExternalLink className="inline size-3" />
          </Link>
          <Chip tone="info">{nombreDe(metodos, pago.metodo)}</Chip>
          {pago.dias_esperando > 3 ? (
            <Chip tone={pago.dias_esperando > 7 ? 'danger' : 'warning'}>
              {pago.dias_esperando} días esperando
            </Chip>
          ) : null}
        </div>

        <p className="text-ink/90 mt-1 font-medium">{pago.proveedor ?? 'Sin proveedor'}</p>
        <p className="text-ink/55 text-sm">{pago.titulo}</p>
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

export function Pagos() {
  const { data, isPending, error } = usePorPagar()
  const { puede } = useMisRoles()
  const [pagando, setPagando] = useState<PorPagar | null>(null)

  /*
    QUIÉN PUEDE REGISTRAR EL PAGO

    Era solo el rol TESORERIA. Al combinarse las dos áreas por decisión de la
    empresa, quien lleva compras se quedaba mirando la cola sin poder cerrarla.

    Van los dos, y no es una apertura: `registrar_pago_compra` siempre exigió
    COMPRAS en escritura, nunca el rol de tesorería. El front pedía una llave
    distinta de la que pide la puerta, y quien tuviera compras y no tesorería
    veía el botón ausente sin saber por qué.
  */
  const puedePagar = puede('TESORERIA', 'COMPRAS')
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

          <Card flush>
            <div className="px-4 pt-4">
              <CardHeader
                title="Cola de pagos"
                subtitle="En orden de llegada. La más vieja primero."
              />
            </div>
            <div className="mt-2">
              {pendientes.map((p) => (
                <Fila
                  key={p.instruccion_id}
                  pago={p}
                  puedePagar={puedePagar}
                  onPagar={() => setPagando(p)}
                />
              ))}
            </div>
          </Card>
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
    </>
  )
}
