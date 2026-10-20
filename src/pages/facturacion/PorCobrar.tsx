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
  type PorCobrarAProveedor,
} from '@/lib/api/facturacion'
import { useNotasEntrega } from '@/lib/api/ventas'
import { hoyEnCaracas } from '@/lib/api/tasas'

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
 *
 * LAS NOTAS DE ENTREGA PENDIENTES POR COBRAR ENTRAN AL GRUPO DE SU CLIENTE
 * (20/10/2026). Christopher: «las notas de entrega que son cuentas por cobrar
 * debería poder verlas también desde cuentas por cobrar». Nacieron el 12/10
 * como recordatorio aparte, y separadas esta pantalla mentía: decía que un
 * cliente debía dos facturas cuando también se llevó tres gandolas sin
 * facturar. Entran las que siguen vivas, sin cobrar y SIN factura — la que ya
 * se facturó cobra por su factura, que ya está aquí, y sumarla dos veces
 * sería inventarse la deuda.
 */

/** Una factura con saldo o una nota de entrega pendiente, ya igualadas. */
interface RenglonPorCobrar {
  clave: string
  tipo: 'FACTURA' | 'NOTA'
  numero: string
  /** El número de control de la factura; la nota no tiene y lo dice. */
  detalle: string
  emitida: string
  vence: string | null
  moneda: string
  total: string
  saldoUsd: number
  diasVencida: number
}

interface Grupo {
  cliente: string
  rif: string
  renglones: RenglonPorCobrar[]
  facturas: number
  notas: number
  usd: number
  vencidoUsd: number
  masVieja: number
}

const tramo = (dias: number) => {
  if (dias <= 0) return 'Por vencer'
  if (dias <= 30) return 'Hasta 30 días'
  if (dias <= 60) return '31 a 60 días'
  if (dias <= 90) return '61 a 90 días'
  return 'Más de 90 días'
}

export function PorCobrar() {
  const { data, isPending, error } = usePorCobrar()
  const proveedores = usePorCobrarAProveedores()
  // Las notas marcadas pendientes y aún sin cobrar; lo demás se filtra abajo.
  const notas = useNotasEntrega({ cobro: 'PENDIENTE' })

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
    const grupoDe = (cliente: string, rif: string): Grupo => {
      const g = mapa.get(cliente) ?? {
        cliente,
        rif,
        renglones: [],
        facturas: 0,
        notas: 0,
        usd: 0,
        vencidoUsd: 0,
        masVieja: 0,
      }
      mapa.set(cliente, g)
      return g
    }
    const anotar = (g: Grupo, r: RenglonPorCobrar) => {
      g.renglones.push(r)
      g.usd += r.saldoUsd
      if (r.diasVencida > 0) g.vencidoUsd += r.saldoUsd
      g.masVieja = Math.max(g.masVieja, r.diasVencida)
    }

    for (const f of data ?? []) {
      const g = grupoDe(f.cliente, f.cliente_rif)
      g.facturas += 1
      anotar(g, {
        clave: `F-${f.factura_id}`,
        tipo: 'FACTURA',
        numero: f.numero,
        detalle: f.numero_control,
        emitida: f.fecha,
        vence: f.vence_el,
        moneda: f.moneda,
        total: f.total,
        saldoUsd: Number(f.saldo_usd),
        diasVencida: f.dias_vencida,
      })
    }

    /*
      La vencida se calcula aquí contra el día de Caracas, no con el reloj del
      navegador: la vista trae la bandera pero no los días, y el tramo de
      antigüedad se arma con días. Fechas AAAA-MM-DD: comparar las cadenas es
      comparar los días.
    */
    const hoy = hoyEnCaracas()
    for (const n of notas.data ?? []) {
      if (!n.cliente || n.estado === 'ANULADA' || n.factura_id !== null) continue
      const vencidaHace =
        n.fecha_pago && n.fecha_pago < hoy
          ? Math.round((Date.parse(hoy) - Date.parse(n.fecha_pago)) / 86_400_000)
          : 0
      const g = grupoDe(n.cliente, n.cliente_rif ?? '')
      g.notas += 1
      anotar(g, {
        clave: `N-${n.id}`,
        tipo: 'NOTA',
        numero: n.numero,
        detalle: 'Nota de entrega',
        emitida: n.fecha,
        vence: n.fecha_pago,
        moneda: n.moneda,
        total: n.total,
        saldoUsd: Number(n.total_usd),
        diasVencida: vencidaHace,
      })
    }

    // Dentro del cliente, lo más vencido primero; entre clientes, quien lleva
    // más tiempo debiendo y, a igualdad de días, quien más debe. Es el orden
    // en el que se hacen las llamadas.
    for (const g of mapa.values()) {
      g.renglones.sort((a, b) => b.diasVencida - a.diasVencida || b.saldoUsd - a.saldoUsd)
    }
    return [...mapa.values()].sort((a, b) => b.masVieja - a.masVieja || b.usd - a.usd)
  }, [data, notas.data])

  const total = grupos.reduce((s, g) => s + g.usd, 0) + proveedoresUsd
  const vencido = grupos.reduce((s, g) => s + g.vencidoUsd, 0)
  const hayAlgo = grupos.length > 0 || deProveedores.length > 0

  return (
    <>
      <PageHeader
        title="Cuentas por cobrar"
        description="Facturas con saldo pendiente y notas de entrega pendientes por cobrar, agrupadas por cliente. El saldo se expresa en dólares."
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && !proveedores.isPending && !notas.isPending && !hayAlgo ? (
        <Card>
          <Vacio
            icono={<Coins />}
            titulo="Sin saldos por cobrar"
            descripcion="Todas las facturas están cobradas, ninguna nota de entrega espera su pago y ningún proveedor adeuda diferencias. Aparecen aquí las facturas a crédito o con saldo, las notas de entrega marcadas pendientes por cobrar y los pagos con material que dejan un monto por cobrar."
          />
        </Card>
      ) : null}

      {data && !notas.isPending && hayAlgo ? (
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
              label="Clientes con saldo"
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
                  subtitle={[
                    documento(g.rif),
                    g.facturas > 0 ? `${g.facturas} factura(s)` : null,
                    g.notas > 0 ? `${g.notas} nota(s) de entrega` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  action={
                    <div className="text-right">
                      <p className="tabular text-ink/90 text-lg font-semibold">{dolares(g.usd)}</p>
                      {g.vencidoUsd > 0 ? (
                        <Chip tone="danger">{dolares(g.vencidoUsd)} vencido</Chip>
                      ) : (
                        <Chip tone="success">Sin vencidos</Chip>
                      )}
                    </div>
                  }
                />

                <div className="overflow-x-auto p-5 pt-4">
                  <table className="w-full min-w-[600px] text-sm">
                    <thead>
                      <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                        <th className="py-2 font-medium">Documento</th>
                        <th className="py-2 font-medium">Emitida</th>
                        <th className="py-2 font-medium">Vence</th>
                        <th className="py-2 text-right font-medium">Total</th>
                        <th className="py-2 text-right font-medium">Saldo</th>
                        <th className="py-2 text-right font-medium">Antigüedad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.renglones.map((r) => (
                        <tr key={r.clave} className="border-hairline border-b last:border-0">
                          <td className="tabular text-ink/85 py-2 font-medium">
                            {r.numero}
                            <span className="text-ink/40 block text-xs">{r.detalle}</span>
                          </td>
                          <td className="text-ink/60 py-2 text-xs">{fecha(r.emitida)}</td>
                          {/* La nota sin fecha de pago no vence: se dice, no se inventa. */}
                          <td className="text-ink/60 py-2 text-xs">
                            {r.vence ? fecha(r.vence) : 'Sin fecha de pago'}
                          </td>
                          <td className="tabular text-ink/70 py-2 text-right">
                            {dinero(r.moneda, r.total)}
                          </td>
                          <td className="tabular text-ink/90 py-2 text-right font-medium">
                            {dolares(r.saldoUsd)}
                          </td>
                          <td className="py-2 text-right">
                            <Chip tone={r.diasVencida > 0 ? 'danger' : 'neutral'}>
                              {tramo(r.diasVencida)}
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
              <h2 className="text-ink/60 mt-8 mb-1 text-sm font-semibold">Proveedores con saldo</h2>
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
            Los cobros de facturas se registran desde{' '}
            <Link to="/app/facturacion" className="text-royal-600 underline">
              Facturación › Facturas
            </Link>
            , abriendo la factura. Una nota de entrega se marca cobrada desde{' '}
            <Link to="/app/facturacion/notas-entrega" className="text-royal-600 underline">
              Facturación › Notas de entrega
            </Link>
            . Lo que debe un proveedor se cobra desde{' '}
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
