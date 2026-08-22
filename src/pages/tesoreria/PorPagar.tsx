import { useMemo } from 'react'
import { Link } from 'react-router'
import { HandCoins } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_DEUDAS } from '@/components/pestanasDeModulos'
import { Card, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { usePorPagar } from '@/lib/api/tesoreria'
import type { PorPagar as Obligacion } from '@/lib/api/tesoreria'
import { dinero, dolares, fecha } from '@/lib/formato'

interface Grupo {
  proveedor: string
  rif: string | null
  deudas: Obligacion[]
  usd: number
  masVieja: number
}

/** El equivalente en dólares de una obligación, con IGTF incluido. */
function enDolares(o: Obligacion): number {
  const monto = Number(o.monto_usd)
  const igtf = o.igtf_aplica ? (Number(o.igtf_monto) * monto) / Number(o.monto) : 0
  return monto + igtf
}

export function PorPagar() {
  const { data, isPending, error } = usePorPagar()

  // Se agrupa por proveedor porque así es como se decide: no se paga "la orden
  // 14", se paga "a Repuestos del Orinoco, que tiene tres cosas pendientes".
  const grupos = useMemo<Grupo[]>(() => {
    const mapa = new Map<string, Grupo>()

    for (const o of data ?? []) {
      const clave = o.proveedor ?? 'Sin proveedor'
      const g = mapa.get(clave) ?? {
        proveedor: clave,
        rif: o.rif,
        deudas: [],
        usd: 0,
        masVieja: 0,
      }
      g.deudas.push(o)
      g.usd += enDolares(o)
      g.masVieja = Math.max(g.masVieja, o.dias_esperando)
      mapa.set(clave, g)
    }

    return [...mapa.values()].sort((a, b) => b.usd - a.usd)
  }, [data])

  const total = grupos.reduce((s, g) => s + g.usd, 0)

  return (
    <>
      <PageHeader
        title="Cuentas por pagar"
        description="Lo que se le debe a cada proveedor, por autorizaciones de compra que todavía no han salido del banco."
      />

      <Pestanas pestanas={PESTANAS_DEUDAS} />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {grupos.length > 0 ? (
        <>
          <Card className="mb-4">
            <p className="text-ink/45 text-xs">Deuda total con proveedores</p>
            <p className="text-safety tabular text-3xl font-semibold">{dolares(total)}</p>
            <p className="text-ink/45 mt-1 text-xs">
              {grupos.length} proveedor{grupos.length === 1 ? '' : 'es'} ·{' '}
              {(data ?? []).length} pago{(data ?? []).length === 1 ? '' : 's'} autorizado
              {(data ?? []).length === 1 ? '' : 's'}
            </p>
          </Card>

          <div className="space-y-4">
            {grupos.map((g) => (
              <Card key={g.proveedor} flush>
                <div className="flex flex-wrap items-start justify-between gap-3 p-4 pb-2">
                  <CardHeader
                    title={g.proveedor}
                    subtitle={g.rif ?? undefined}
                    action={
                      g.masVieja > 7 ? (
                        <Chip tone="danger">{g.masVieja} días la más vieja</Chip>
                      ) : g.masVieja > 3 ? (
                        <Chip tone="warning">{g.masVieja} días la más vieja</Chip>
                      ) : null
                    }
                  />
                  <p className="text-ink/90 tabular text-xl font-semibold">
                    {dolares(g.usd)}
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="text-ink/45 border-hairline border-y text-left text-xs">
                        <th className="px-4 py-2 font-medium">Orden</th>
                        <th className="px-3 py-2 font-medium">Compra</th>
                        <th className="px-3 py-2 font-medium">Autorizada</th>
                        <th className="px-4 py-2 text-right font-medium">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.deudas.map((o) => (
                        <tr key={o.instruccion_id} className="border-hairline border-b last:border-0">
                          <td className="px-4 py-2.5">
                            <Link
                              to={`/app/compras/${o.solicitud_id}`}
                              className="text-royal-600 dark:text-royal-300 font-mono text-xs hover:underline"
                            >
                              {o.orden_numero}
                            </Link>
                          </td>
                          <td className="text-ink/75 px-3 py-2.5">{o.titulo}</td>
                          <td className="text-ink/55 px-3 py-2.5 whitespace-nowrap">
                            {fecha(o.creada_en.slice(0, 10))}
                          </td>
                          <td className="text-ink/85 tabular px-4 py-2.5 text-right whitespace-nowrap">
                            {dinero(o.moneda, o.monto)}
                            {o.igtf_aplica ? (
                              <span className="text-warning block text-xs">
                                + {dinero(o.moneda, o.igtf_monto)} IGTF
                              </span>
                            ) : null}
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

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<HandCoins />}
            titulo="No se le debe nada a nadie"
            descripcion="Toda compra autorizada ya está pagada."
          />
        </Card>
      ) : null}
    </>
  )
}
