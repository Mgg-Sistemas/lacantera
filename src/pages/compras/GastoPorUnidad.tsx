import { Building2, TrendingUp } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_ANALISIS } from '@/components/pestanasDeModulos'
import { Card } from '@/components/ui/Card'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useGastoPorUnidad } from '@/lib/api/proveedorFicha'
import { dolares, enteros, fecha } from '@/lib/formato'

/*
  QUÉ UNIDAD GASTA MÁS

  La líder: «¿Qué unidad/departamento genera más consumo/gasto?».

  Son dos preguntas y la pantalla no las mezcla, porque una unidad puede gastar
  mucho y consumir poco —compró repuestos que siguen en el estante— o al revés:
  llevar meses gastando lo que se compró el trimestre pasado.

    GASTO   — lo que se compró para ese sitio. Responde cuánto cuesta
              mantenerlo.
    CONSUMO — lo que salió del almacén y ya se usó. Responde cuánto material se
              está gastando ahí de verdad.

  La barra compara contra el que más gasta, no contra el total. Con quince
  unidades, las barras contra el total serían todas un hilo y no se distinguiría
  la segunda de la última.
*/

export function GastoPorUnidad() {
  const { data, isPending, error } = useGastoPorUnidad()

  const mayor = Math.max(1, ...(data ?? []).map((u) => Number(u.gastado_usd)))
  const totalGasto = (data ?? []).reduce((s, u) => s + Number(u.gastado_usd), 0)
  const totalMes = (data ?? []).reduce((s, u) => s + Number(u.gastado_mes_usd), 0)

  return (
    <>
      <PageHeader
        title="Gasto por unidad"
        description="A dónde va el dinero de las compras. Cada pedido dice para qué sitio es, y aquí se suma."
      />

      <Pestanas pestanas={PESTANAS_ANALISIS} />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<Building2 />}
            titulo="Todavía no hay compras que repartir"
            descripcion="Cuando se apruebe la primera orden, aquí aparecerá para qué unidad fue y cuánto costó."
          />
        </Card>
      ) : null}

      {data && data.length > 0 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">
                Comprado en total
              </p>
              <p className="text-ink/90 tabular mt-3 text-2xl font-light">{dolares(totalGasto)}</p>
              <p className="text-ink/45 mt-2 text-xs">
                Repartido entre {enteros(data.length)} unidad{data.length === 1 ? '' : 'es'}
              </p>
            </Card>
            <Card>
              <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">
                Comprado este mes
              </p>
              <p className="text-ink/90 tabular mt-3 text-2xl font-light">{dolares(totalMes)}</p>
              <p className="text-ink/45 mt-2 text-xs">Desde el día 1 del mes corrido</p>
            </Card>
          </div>

          <Card flush className="mt-5">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                    <th className="px-5 py-3 font-medium">Unidad</th>
                    <th className="px-3 py-3 text-right font-medium">Pedidos</th>
                    <th className="px-3 py-3 text-right font-medium">Comprado</th>
                    <th className="px-3 py-3 text-right font-medium">Este mes</th>
                    <th className="px-3 py-3 text-right font-medium">Consumido</th>
                    <th className="px-5 py-3 font-medium">Peso</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((u) => (
                    <tr key={u.unidad} className="border-hairline border-b last:border-0">
                      <td className="px-5 py-3">
                        <p className="text-ink/85 font-medium">{u.unidad}</p>
                        <p className="text-ink/40 text-xs">
                          {u.ultima_compra
                            ? `Última compra: ${fecha(u.ultima_compra.slice(0, 10))}`
                            : 'Sin compras aprobadas'}
                        </p>
                      </td>
                      <td className="text-ink/70 tabular px-3 py-3 text-right">
                        {enteros(u.pedidos)}
                      </td>
                      <td className="text-ink/85 tabular px-3 py-3 text-right font-medium">
                        {dolares(u.gastado_usd)}
                      </td>
                      <td className="text-ink/70 tabular px-3 py-3 text-right">
                        {Number(u.gastado_mes_usd) > 0 ? dolares(u.gastado_mes_usd) : '—'}
                      </td>
                      {/*
                        El consumo solo existe si la unidad es un almacén: es lo
                        que salió de sus estantes. Un frente o una planta reciben
                        material pero no lo guardan, así que ahí no hay nada que
                        contar — y un cero se leería como «no consume».
                      */}
                      <td className="text-ink/70 tabular px-3 py-3 text-right">
                        {u.almacen_id === null
                          ? '—'
                          : Number(u.consumido_usd) > 0
                            ? dolares(u.consumido_usd)
                            : dolares(0)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="bg-ink/8 h-1.5 w-full overflow-hidden rounded-full">
                          <div
                            className="bg-royal-600 h-full rounded-full"
                            style={{
                              width: `${Math.round((Number(u.gastado_usd) / mayor) * 100)}%`,
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="text-ink/40 mt-3 flex items-start gap-2 text-xs">
            <TrendingUp className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Comprado cuenta órdenes aprobadas, en dólares a la tasa de cada una. Consumido es lo
              que salió del almacén y se usó; no incluye lo que se dio de baja, porque perder algo
              no es gastarlo. La barra compara contra la unidad que más gasta.
            </span>
          </p>
        </>
      ) : null}
    </>
  )
}
