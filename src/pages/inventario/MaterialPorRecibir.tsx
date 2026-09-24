import { useState } from 'react'
import { Link } from 'react-router'
import { PackageCheck } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useMisRoles } from '@/lib/api/catalogo'
import { useMaterialPorRecibir, useRecibirMaterial, type CobroConMaterial } from '@/lib/api/cobrosConMaterial'
import { dinero, fecha } from '@/lib/formato'

/*
  LO QUE UN CLIENTE TRAE PARA PAGAR, Y ALMACÉN TIENE QUE CONFIRMAR

  Christopher, 24/09/2026, entre tres opciones eligió que almacén confirme
  antes de que el cobro cuente: «evita cobrar con piedra que nunca llegó, y
  separa a quien vende de quien cuenta».

  Es el espejo de la salida por intercambio de Compras, que almacén aprueba y
  entrega. Aquí almacén RECIBE: al confirmar, el material entra al patio con
  el costo acordado, la factura baja y, si sobró, la diferencia queda como
  crédito del cliente o por pagarle.
*/

const cant = (v: string | number) => Number(v).toLocaleString('es-VE', { maximumFractionDigits: 4 })

export function MaterialPorRecibir() {
  const { data, error } = useMaterialPorRecibir()
  const { puede } = useMisRoles()
  const recibir = useRecibirMaterial()
  const [recibiendo, setRecibiendo] = useState<CobroConMaterial | null>(null)
  const [nota, setNota] = useState('')

  const pendientes = data ?? []
  if (pendientes.length === 0 && !error) return null

  const puedeRecibir = puede('ALMACEN')

  return (
    <>
      <Card className="border-warning/30 mb-4" flush>
        <CardHeader
          className="p-5 pb-0"
          title="Material de clientes por recibir"
          subtitle="Pagos con material de facturas de venta. La factura no baja hasta que aquí se confirme que el material llegó al patio."
          action={<Chip tone="warning">{pendientes.length}</Chip>}
        />
        {error ? <ErrorDeCarga error={error} className="m-5" /> : null}
        <div className="divide-hairline divide-y px-5 pb-2">
          {pendientes.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-ink/90 text-sm font-medium">
                  {cant(m.cantidad)} {m.unidad} de {m.articulo}
                  {m.medida === 'ESTIMADA' ? (
                    <span className="text-ink/45 text-xs"> · al patio entran {cant(m.cantidad_inventario)}, estimado</span>
                  ) : null}
                </p>
                <p className="text-ink/50 text-xs">
                  De {m.cliente} · factura{' '}
                  <Link to="/app/facturacion" className="text-royal-600 hover:underline">
                    {m.factura}
                  </Link>{' '}
                  · entra a {m.almacen} · vale {dinero(m.moneda, m.valor)} · registrado el {fecha(m.registrado_en)}
                </p>
              </div>
              {puedeRecibir ? (
                <Button
                  size="sm"
                  icon={<PackageCheck />}
                  onClick={() => {
                    setNota('')
                    setRecibiendo(m)
                  }}
                >
                  Llegó
                </Button>
              ) : (
                <Chip tone="neutral">Lo confirma almacén</Chip>
              )}
            </div>
          ))}
        </div>
      </Card>

      {recibiendo ? (
        <Modal
          abierto
          onCerrar={() => setRecibiendo(null)}
          titulo={`Recibir ${cant(recibiendo.cantidad)} ${recibiendo.unidad} de ${recibiendo.articulo}`}
          descripcion={`Entra a ${recibiendo.almacen} con costo ${dinero(recibiendo.moneda, recibiendo.precio_unitario)} por ${recibiendo.unidad}, y la factura ${recibiendo.factura} baja lo que el material vale.`}
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setRecibiendo(null)}>
                Cancelar
              </Button>
              <Button
                disabled={recibir.isPending}
                onClick={() =>
                  recibir.mutate(
                    { id: recibiendo.id, nota: nota || null },
                    { onSuccess: () => setRecibiendo(null) },
                  )
                }
              >
                {recibir.isPending ? 'Recibiendo…' : 'Confirmar que llegó'}
              </Button>
            </>
          }
        >
          <p className="text-ink/60 mb-3 text-sm">
            Esto no se deshace: el material queda en el patio y el cobro registrado. Si no llegó completo,
            no lo confirmes; que Facturación anule este cobro y lo registre con la cantidad real.
          </p>
          <Textarea
            label="Nota"
            rows={2}
            placeholder="En qué llegó, quién lo trajo…"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />
          {recibir.error ? <ErrorDeCarga error={recibir.error} className="mt-3" /> : null}
        </Modal>
      ) : null}
    </>
  )
}
