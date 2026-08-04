import { useState } from 'react'
import { Link } from 'react-router'
import { PackageCheck, Truck } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { dinero, fecha as fmtFecha, fechaHora } from '@/lib/formato'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useOrdenesPorRecibir, type Orden } from '@/lib/api/compras'
import { useMovimientos } from '@/lib/api/inventario'
import { ModalRecepcion } from './ModalRecepcion'

/**
 * Recepciones.
 *
 * La entrada del menú existía desde el principio y llevaba a un aviso de
 * "pendiente", porque recibir se hacía —y se sigue pudiendo hacer— desde el
 * detalle de cada compra. Eso sirve para quien está siguiendo una compra, pero
 * no para quien está en el portón: el almacenista no sabe de qué compra viene
 * el camión que acaba de llegar, sabe qué proveedor es y qué trae.
 *
 * Esta pantalla es esa lista: lo que está pagado y no ha llegado, en orden de
 * antigüedad del pago, porque lo que se pagó primero es lo que lleva más tiempo
 * esperando.
 */

const faltan = (o: Orden) =>
  o.renglones.reduce(
    (t, r) => t + Math.max(Number(r.cantidad) - Number(r.cantidad_recibida), 0),
    0,
  )

const parcial = (o: Orden) => o.renglones.some((r) => Number(r.cantidad_recibida) > 0)

export function Recepciones() {
  const { data, isPending, error } = useOrdenesPorRecibir()
  const movimientos = useMovimientos()
  const { puede } = useMisPermisos()

  const [recibiendo, setRecibiendo] = useState<Orden | null>(null)

  const ordenes = data ?? []
  const recibidas = (movimientos.data ?? []).filter((m) => m.tipo === 'ENTRADA_COMPRA').slice(0, 30)

  return (
    <>
      <PageHeader
        title="Recepciones"
        description="Lo que está pagado y todavía no ha entrado al almacén."
        actions={
          ordenes.length > 0 ? (
            <Chip tone={ordenes.length > 3 ? 'warning' : 'royal'}>
              {ordenes.length} por recibir
            </Chip>
          ) : null
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && ordenes.length === 0 ? (
        <Card className="mb-4">
          <Vacio
            icono={<PackageCheck />}
            titulo="No hay nada esperando"
            descripcion="Todo lo que se pagó ya llegó al almacén. Cuando se pague una orden nueva aparecerá aquí."
          />
        </Card>
      ) : null}

      {ordenes.length > 0 ? (
        <div className="mb-4 grid gap-3">
          {ordenes.map((o) => (
            <Card key={o.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="tabular text-ink/85 font-medium">{o.numero}</p>
                    {parcial(o) ? <Chip tone="warning">Llegó una parte</Chip> : null}
                  </div>
                  <p className="text-ink/70 mt-0.5">{o.proveedor?.nombre ?? 'Sin proveedor'}</p>
                  <p className="text-ink/45 mt-0.5 text-xs">
                    {o.fecha_pago ? `Pagada el ${fmtFecha(o.fecha_pago)}` : 'Sin fecha de pago'}
                    {o.entrega_estimada ? ` · entrega estimada ${fmtFecha(o.entrega_estimada)}` : ''}
                    {' · '}
                    {dinero(o.moneda, o.total)}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {puede('INVENTARIO', 'ESCRITURA') ? (
                    <Button icon={<Truck />} onClick={() => setRecibiendo(o)}>
                      Registrar recepción
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="border-hairline mt-3 border-t pt-3">
                <table className="w-full text-sm">
                  <tbody>
                    {o.renglones
                      .slice()
                      .sort((a, b) => a.linea - b.linea)
                      .map((r) => {
                        const falta = Number(r.cantidad) - Number(r.cantidad_recibida)
                        return (
                          <tr key={r.id}>
                            <td className="text-ink/70 py-1.5">{r.descripcion}</td>
                            <td className="tabular text-ink/60 py-1.5 text-right text-xs">
                              {falta > 0.0001 ? (
                                <>
                                  faltan {falta} {r.unidad}
                                  {Number(r.cantidad_recibida) > 0
                                    ? ` de ${r.cantidad}`
                                    : ''}
                                </>
                              ) : (
                                <span className="text-success">completo</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
                <p className="text-ink/45 mt-2 text-xs">
                  Faltan {faltan(o)} unidades en total ·{' '}
                  <Link to="/app/compras" className="text-royal-600 dark:text-royal-300">
                    ver la compra
                  </Link>
                </p>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {/* -------------------------------------------------- lo que ya entró */}
      <Card flush>
        <CardHeader
          title="Lo último que entró"
          subtitle="Cada recepción escribe su entrada en el libro de inventario y no se edita después."
          className="px-5 pt-5"
        />

        {recibidas.length === 0 ? (
          <div className="px-5 pb-5">
            <p className="text-ink/55 mt-3 text-sm">Todavía no se ha recibido ningún material.</p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-y text-left text-xs">
                  <th className="px-5 py-3 font-medium">Entrada</th>
                  <th className="px-3 py-3 font-medium">Material</th>
                  <th className="px-3 py-3 font-medium">Almacén</th>
                  <th className="px-5 py-3 text-right font-medium">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {recibidas.map((m) => (
                  <tr key={m.id} className="border-hairline border-b last:border-0">
                    <td className="px-5 py-3">
                      <p className="tabular text-ink/80">{m.numero}</p>
                      <p className="text-ink/45 text-xs">{fechaHora(m.registrado_en)}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-ink/70">{m.articulo?.nombre}</p>
                      <p className="text-ink/45 text-xs">{m.articulo?.codigo}</p>
                    </td>
                    <td className="text-ink/60 px-3 py-3 text-xs">{m.almacen?.nombre}</td>
                    <td className="tabular text-ink/85 px-5 py-3 text-right font-medium">
                      {m.cantidad} {m.unidad}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {recibiendo ? (
        <ModalRecepcion abierto onCerrar={() => setRecibiendo(null)} orden={recibiendo} />
      ) : null}
    </>
  )
}
