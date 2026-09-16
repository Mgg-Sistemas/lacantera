import { useState } from 'react'
import { useMonedasUsables } from '@/lib/api/tasas'
import { Tag } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { dinero, fecha } from '@/lib/formato'
import {
  unidadesDeVenta,
  useGuardarPrecio,
  usePrecios,
  useQuitarPrecio,
  type PrecioVenta,
} from '@/lib/api/ventas'

/**
 * La lista de precios.
 *
 * No se crean artículos aquí: se le pone precio a lo que ya está en el catálogo
 * y es vendible. Por eso la tabla muestra también lo que no tiene precio —en
 * gris y sin cifra—, que es la única forma de que alguien se dé cuenta de que
 * el granzón se puede despachar y todavía nadie dijo a cuánto.
 *
 * UN PRECIO POR UNIDAD. Lo que tiene densidad se vende en metros cúbicos o en
 * toneladas, y cada unidad lleva su precio y su mínimo: la tonelada no se
 * deduce del metro, se decide. Cada fila de la tabla es un precio; la que falta
 * se dice debajo de la unidad, para que no parezca que no se puede.
 */
export function Precios() {
  const monedas = useMonedasUsables()
  const { data, isPending, error } = usePrecios()
  const guardar = useGuardarPrecio()
  const quitar = useQuitarPrecio()
  const [edicion, setEdicion] = useState<{
    articulo_id: number
    nombre: string
    unidades: string[]
    unidad_articulo: string
    densidad: string | null
    unidad: string
    moneda: string
    precio: string
    precio_minimo: string
    tenia: boolean
  } | null>(null)

  const precioPor = (articuloId: number, unidad: string) =>
    (data ?? []).find((p) => p.articulo_id === articuloId && p.unidad === unidad && p.precio)

  const conUnidad = (base: NonNullable<typeof edicion>, unidad: string) => {
    const p = precioPor(base.articulo_id, unidad)
    return {
      ...base,
      unidad,
      moneda: p?.moneda ?? base.moneda,
      precio: p?.precio ? String(Number(p.precio)) : '',
      precio_minimo: p?.precio_minimo ? String(Number(p.precio_minimo)) : '',
      tenia: Boolean(p),
    }
  }

  const abrir = (p: PrecioVenta) => {
    guardar.reset()
    quitar.reset()
    setEdicion(
      conUnidad(
        {
          articulo_id: p.articulo_id,
          nombre: p.nombre,
          unidades: unidadesDeVenta(p),
          unidad_articulo: p.unidad_articulo,
          densidad: p.densidad_ton_m3,
          unidad: p.unidad,
          moneda: p.moneda ?? 'USD',
          precio: '',
          precio_minimo: '',
          tenia: false,
        },
        p.unidad,
      ),
    )
  }

  // Artículos activos sin ningún precio: una fila por artículo, sin cifra.
  const sinPrecio = (data ?? []).filter((p) => p.activo && !p.precio).length

  return (
    <>
      <PageHeader
        title="Lista de precios"
        description="A cuánto se vende cada cosa, por unidad, y por debajo de cuánto no se vende."
        actions={
          sinPrecio > 0 ? (
            <Chip tone="warning">
              {sinPrecio} {sinPrecio === 1 ? 'producto sin precio' : 'productos sin precio'}
            </Chip>
          ) : undefined
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<Tag />}
            titulo="No hay nada que vender en el catálogo"
            descripcion="Los precios se le ponen a los artículos de categoría Producto o Servicio. Créalos primero en Inventario › Catálogo de artículos."
          />
        </Card>
      ) : null}

      {data && data.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Producto</th>
                  <th className="px-3 py-3 font-medium">Se vende por</th>
                  <th className="px-3 py-3 text-right font-medium">Precio</th>
                  <th className="px-3 py-3 text-right font-medium">Mínimo</th>
                  <th className="px-5 py-3 text-right font-medium">Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => {
                  const faltan = p.precio
                    ? unidadesDeVenta(p).filter(
                        (u) => u !== p.unidad && !precioPor(p.articulo_id, u),
                      )
                    : []
                  return (
                    <tr
                      key={`${p.articulo_id}-${p.unidad}`}
                      onClick={() => abrir(p)}
                      className="border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors last:border-0"
                    >
                      <td className="px-5 py-3">
                        <p className="text-ink/85 font-medium">{p.nombre}</p>
                        <p className="text-ink/45 text-xs">
                          {p.codigo}
                          {p.categoria === 'SERVICIO' ? ' · servicio' : ''}
                          {!p.activo ? ' · dado de baja' : ''}
                        </p>
                      </td>
                      <td className="text-ink/60 px-3 py-3">
                        {p.unidad}
                        {faltan.map((u) => (
                          <span key={u} className="text-ink/40 block text-xs">
                            por {u}: sin precio
                          </span>
                        ))}
                      </td>
                      <td className="tabular px-3 py-3 text-right">
                        {p.precio ? (
                          <span className="text-ink/85 font-semibold">
                            {dinero(p.moneda, p.precio)}
                          </span>
                        ) : (
                          <Chip tone="warning">Sin precio</Chip>
                        )}
                      </td>
                      <td className="tabular text-ink/55 px-3 py-3 text-right">
                        {p.precio_minimo && Number(p.precio_minimo) > 0
                          ? dinero(p.moneda, p.precio_minimo)
                          : '—'}
                      </td>
                      <td className="text-ink/50 px-5 py-3 text-right text-xs">
                        {p.actualizado_en ? fecha(p.actualizado_en) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {edicion ? (
        <Modal
          abierto
          onCerrar={() => setEdicion(null)}
          titulo={edicion.nombre}
          descripcion={`Precio por ${edicion.unidad}.`}
          acciones={
            <>
              <Button variant="ghost" onClick={() => setEdicion(null)}>
                Cancelar
              </Button>
              {edicion.tenia ? (
                <Button
                  variant="outline"
                  className="text-danger"
                  disabled={quitar.isPending}
                  onClick={async () => {
                    await quitar.mutateAsync({
                      articulo_id: edicion.articulo_id,
                      unidad: edicion.unidad,
                    })
                    setEdicion(null)
                  }}
                >
                  {quitar.isPending ? 'Quitando…' : `Quitar el precio por ${edicion.unidad}`}
                </Button>
              ) : null}
              <Button
                disabled={guardar.isPending || !Number(edicion.precio)}
                onClick={async () => {
                  await guardar.mutateAsync({
                    articulo_id: edicion.articulo_id,
                    unidad: edicion.unidad,
                    precio: Number(edicion.precio),
                    precio_minimo: Number(edicion.precio_minimo) || 0,
                    moneda: edicion.moneda,
                  })
                  setEdicion(null)
                }}
              >
                {guardar.isPending ? 'Guardando…' : 'Guardar precio'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Se vende por"
              value={edicion.unidad}
              onChange={(e) => setEdicion(conUnidad(edicion, e.target.value))}
              opciones={edicion.unidades.map((u) => ({
                valor: u,
                etiqueta: precioPor(edicion.articulo_id, u) ? u : `${u} · sin precio todavía`,
              }))}
              hint={
                edicion.unidades.length === 1 && edicion.unidad_articulo === 'M3'
                  ? 'Sin densidad en el catálogo solo se vende en metros cúbicos.'
                  : undefined
              }
            />
            <Select
              label="Moneda"
              value={edicion.moneda}
              onChange={(e) => setEdicion({ ...edicion, moneda: e.target.value })}
              opciones={monedas.data ?? []}
            />
            <Input
              label={`Precio de lista por ${edicion.unidad}`}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={edicion.precio}
              onChange={(e) => setEdicion({ ...edicion, precio: e.target.value })}
              required
            />
            <Input
              label={`Precio mínimo por ${edicion.unidad}`}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={edicion.precio_minimo}
              onChange={(e) => setEdicion({ ...edicion, precio_minimo: e.target.value })}
            />
          </div>

          <p className="text-ink/55 mt-4 text-sm leading-relaxed">
            El mínimo no es una sugerencia: un descuento no baja de ahí. Solo lo salta quien tenga
            la casilla de vender bajo el mínimo. En cero, no hay tope por abajo.
          </p>

          {edicion.unidad !== edicion.unidad_articulo && edicion.densidad ? (
            <p className="text-ink/55 mt-2 text-sm leading-relaxed">
              El patio lo lleva en {edicion.unidad_articulo}. Al vender por {edicion.unidad}, lo
              que sale se calcula con la densidad del catálogo,{' '}
              {Number(edicion.densidad).toLocaleString('es-VE')} t/m³, salvo que el camión se pese
              en la romana.
            </p>
          ) : null}

          {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-4" /> : null}
          {quitar.error ? <ErrorDeCarga error={quitar.error} className="mt-4" /> : null}
        </Modal>
      ) : null}
    </>
  )
}
