import { useMemo } from 'react'
import { Link } from 'react-router'
import { Building2, CalendarClock, Coins } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { StatCard } from '@/components/StatCard'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { dinero, dolares, dolaresRedondos, fecha } from '@/lib/formato'
import { usePorCobrar, type PorCobrar as Cobranza } from '@/lib/api/ventas'

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

  const total = grupos.reduce((s, g) => s + g.usd, 0)
  const vencido = grupos.reduce((s, g) => s + g.vencidoUsd, 0)

  return (
    <>
      <PageHeader
        title="Cuentas por cobrar"
        description="Facturas emitidas y todavía sin cobrar del todo. El saldo va en dólares porque se cobra en las dos monedas."
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<Coins />}
            titulo="Nadie debe nada"
            descripcion="Todas las facturas emitidas están cobradas. Las nuevas aparecen aquí en cuanto se emiten a crédito o quedan con saldo."
          />
        </Card>
      ) : null}

      {data && data.length > 0 ? (
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
                  subtitle={`${g.rif} · ${g.facturas.length} factura(s)`}
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

          <p className="text-ink/45 mt-4 text-center text-xs">
            Los cobros se registran desde{' '}
            <Link to="/app/ventas/facturacion" className="text-royal-600 underline">
              Ventas › Facturación
            </Link>
            , abriendo la factura.
          </p>
        </>
      ) : null}
    </>
  )
}
