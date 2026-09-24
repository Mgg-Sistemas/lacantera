import { useMemo } from 'react'
import { Link } from 'react-router'
import { Building2, CalendarClock, Coins } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { StatCard } from '@/components/StatCard'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { dinero, documento, dolares, dolaresRedondos, fecha } from '@/lib/formato'
import {
  usePorCobrar,
  usePorCobrarAProveedores,
  type PorCobrar as Cobranza,
  type PorCobrarAProveedor,
} from '@/lib/api/facturacion'

/**
 * Lo que deben los clientes.
 *
 * Se agrupa por cliente y no por factura porque así es como se cobra: no se
 * llama por "la factura 31", se llama a Constructora del Sur, que tiene tres
 * facturas y dos de ellas vencidas.
 *
 * LA ANTIGÜEDAD ES LO QUE SE MIRA PRIMERO. Una deuda de 400 $ de hace noventa
 * días es un problema distinto de una de 4.000 $ emitida ayer, y una lista
 * ordenada por monto las pone al revés. Por eso el orden es por vencimiento y
 * lo vencido se separa del resto con color.
 */

interface Grupo {
  cliente: string
  rif: string
  facturas: Cobranza[]
  usd: number
  vencidoUsd: number
  masVieja: number
}

const tramo = (dias: number) => {
  if (dias <= 0) return 'Al día'
  if (dias <= 30) return 'Hasta 30 días'
  if (dias <= 60) return '31 a 60 días'
  if (dias <= 90) return '61 a 90 días'
  return 'Más de 90 días'
}

export function PorCobrar() {
  const { data, isPending, error } = usePorCobrar()
  const proveedores = usePorCobrarAProveedores()

  /*
    LOS PROVEEDORES QUE DEBEN VAN APARTE Y EN SU MONEDA.

    Nacen en Compras: un pago con material que valió más que la orden y se
    dejó «por cobrar». No son facturas, no tienen vencimiento y el saldo está
    en la moneda de la orden, sin tasa congelada; convertirlo con la de hoy
    sería inventar. Por eso se listan aparte, cada uno en su moneda, y al
    total en dólares solo suman los que ya están en dólares.
  */
  const deProveedores = useMemo(() => {
    const porProveedor = new Map<string, { proveedor: string; rif: string; saldos: PorCobrarAProveedor[] }>()
    for (const s of proveedores.data ?? []) {
      const g = porProveedor.get(s.rif) ?? { proveedor: s.proveedor, rif: s.rif, saldos: [] }
      g.saldos.push(s)
      porProveedor.set(s.rif, g)
    }
    return [...porProveedor.values()]
  }, [proveedores.data])
  const proveedoresUsd = (proveedores.data ?? [])
    .filter((s) => s.moneda === 'USD')
    .reduce((s, x) => s + Number(x.pendiente), 0)
  const proveedoresOtraMoneda = (proveedores.data ?? []).some((s) => s.moneda !== 'USD')

  const grupos = useMemo<Grupo[]>(() => {
    const mapa = new Map<string, Grupo>()

    for (const f of data ?? []) {
      const g = mapa.get(f.cliente) ?? {
        cliente: f.cliente,
        rif: f.cliente_rif,
        facturas: [],
        usd: 0,
        vencidoUsd: 0,
        masVieja: 0,
      }
      g.facturas.push(f)
      g.usd += Number(f.saldo_usd)
      if (f.dias_vencida > 0) g.vencidoUsd += Number(f.saldo_usd)
      g.masVieja = Math.max(g.masVieja, f.dias_vencida)
      mapa.set(f.cliente, g)
    }

    // Primero quien lleva más tiempo debiendo, y a igualdad de días, quien más
    // debe. Es el orden en el que se hacen las llamadas.
    return [...mapa.values()].sort((a, b) => b.masVieja - a.masVieja || b.usd - a.usd)
  }, [data])

  const total = grupos.reduce((s, g) => s + g.usd, 0) + proveedoresUsd
  const vencido = grupos.reduce((s, g) => s + g.vencidoUsd, 0)
  const hayAlgo = (data?.length ?? 0) > 0 || deProveedores.length > 0

  return (
    <>
      <PageHeader
        title="Cuentas por cobrar"
        description="Facturas emitidas y todavía sin cobrar del todo. El saldo va en dólares porque se cobra en las dos monedas."
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && !proveedores.isPending && !hayAlgo ? (
        <Card>
          <Vacio
            icono={<Coins />}
            titulo="Nadie debe nada"
            descripcion="Todas las facturas emitidas están cobradas y ningún proveedor debe diferencia. Las nuevas aparecen aquí en cuanto se emiten a crédito, quedan con saldo, o un pago con material deja dinero por cobrar."
          />
        </Card>
      ) : null}

      {data && hayAlgo ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Por cobrar"
              value={dolaresRedondos(total)}
              tone="royal"
              icon={<Coins />}
            />
            <StatCard
              label="Vencido"
              value={dolaresRedondos(vencido)}
              tone={vencido > 0 ? 'danger' : 'success'}
              icon={<CalendarClock />}
            />
            <StatCard
              label="Clientes que deben"
              value={String(grupos.length)}
              tone="info"
              icon={<Building2 />}
            />
          </div>

          <div className="mt-4 space-y-4">
            {grupos.map((g) => (
              <Card key={g.cliente} flush>
                <CardHeader
                  className="p-5 pb-0"
                  title={g.cliente}
                  subtitle={`${documento(g.rif)} · ${g.facturas.length} factura(s)`}
                  action={
                    <div className="text-right">
                      <p className="tabular text-ink/90 text-lg font-semibold">{dolares(g.usd)}</p>
                      {g.vencidoUsd > 0 ? (
                        <Chip tone="danger">{dolares(g.vencidoUsd)} vencido</Chip>
                      ) : (
                        <Chip tone="success">Al día</Chip>
                      )}
                    </div>
                  }
                />

                <div className="overflow-x-auto p-5 pt-4">
                  <table className="w-full min-w-[600px] text-sm">
                    <thead>
                      <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                        <th className="py-2 font-medium">Factura</th>
                        <th className="py-2 font-medium">Emitida</th>
                        <th className="py-2 font-medium">Vence</th>
                        <th className="py-2 text-right font-medium">Total</th>
                        <th className="py-2 text-right font-medium">Saldo</th>
                        <th className="py-2 text-right font-medium">Antigüedad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.facturas.map((f) => (
                        <tr key={f.factura_id} className="border-hairline border-b last:border-0">
                          <td className="tabular text-ink/85 py-2 font-medium">
                            {f.numero}
                            <span className="text-ink/40 block text-xs">{f.numero_control}</span>
                          </td>
                          <td className="text-ink/60 py-2 text-xs">{fecha(f.fecha)}</td>
                          <td className="text-ink/60 py-2 text-xs">{fecha(f.vence_el)}</td>
                          <td className="tabular text-ink/70 py-2 text-right">
                            {dinero(f.moneda, f.total)}
                          </td>
                          <td className="tabular text-ink/90 py-2 text-right font-medium">
                            {dolares(f.saldo_usd)}
                          </td>
                          <td className="py-2 text-right">
                            <Chip tone={f.dias_vencida > 0 ? 'danger' : 'neutral'}>
                              {tramo(f.dias_vencida)}
                            </Chip>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </div>

          {deProveedores.length > 0 ? (
            <>
              <h2 className="text-ink/60 mt-8 mb-1 text-sm font-semibold">Proveedores que deben</h2>
              <p className="text-ink/45 mb-3 text-xs">
                Pagaron una compra con material que valía más que la orden, y la diferencia quedó
                por cobrarles en dinero. Cada saldo va en la moneda de su orden
                {proveedoresOtraMoneda ? '; al total de arriba solo suman los que están en dólares' : ''}.
              </p>
              <div className="space-y-4">
                {deProveedores.map((g) => (
                  <Card key={g.rif} flush>
                    <CardHeader
                      className="p-5 pb-0"
                      title={g.proveedor}
                      subtitle={`${documento(g.rif)} · ${g.saldos.length} saldo(s)`}
                      action={<Chip tone="warning">Por cobrar</Chip>}
                    />
                    <div className="overflow-x-auto p-5 pt-4">
                      <table className="w-full min-w-[600px] text-sm">
                        <thead>
                          <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                            <th className="py-2 font-medium">Saldo</th>
                            <th className="py-2 font-medium">Compra</th>
                            <th className="py-2 font-medium">Desde</th>
                            <th className="py-2 text-right font-medium">Original</th>
                            <th className="py-2 text-right font-medium">Pendiente</th>
                            <th className="py-2 text-right font-medium">Antigüedad</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.saldos.map((s) => (
                            <tr key={s.saldo_id} className="border-hairline border-b last:border-0">
                              <td className="tabular text-ink/85 py-2 font-medium">
                                {s.numero}
                                <span className="text-ink/40 block text-xs">{s.motivo}</span>
                              </td>
                              <td className="text-ink/60 py-2 text-xs">{s.orden ?? '—'}</td>
                              <td className="text-ink/60 py-2 text-xs">{fecha(s.desde)}</td>
                              <td className="tabular text-ink/70 py-2 text-right">{dinero(s.moneda, s.monto)}</td>
                              <td className="tabular text-ink/90 py-2 text-right font-medium">
                                {dinero(s.moneda, s.pendiente)}
                              </td>
                              <td className="py-2 text-right">
                                <Chip tone={s.dias > 30 ? 'danger' : 'neutral'}>{tramo(s.dias)}</Chip>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          ) : null}

          <p className="text-ink/45 mt-4 text-center text-xs">
            Los cobros a clientes se registran desde{' '}
            <Link to="/app/facturacion" className="text-royal-600 underline">
              Facturación › Facturas
            </Link>
            , abriendo la factura. Lo que debe un proveedor se cobra desde{' '}
            <Link to="/app/compras/proveedores" className="text-royal-600 underline">
              Compras › Proveedores
            </Link>
            , en sus saldos.
          </p>
        </>
      ) : null}
    </>
  )
}
