import { Link, useParams } from 'react-router'
import { ArrowLeft, ArrowDownRight, ArrowUpRight, Circle } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { cn } from '@/lib/cn'
import { useArticulos } from '@/lib/api/catalogo'
import { useHistorialArticulo, useExistenciasTotales } from '@/lib/api/inventario'
import type { HechoDelArticulo } from '@/lib/api/inventario'
import { enteros, fechaHora } from '@/lib/formato'

/**
 * La misma forma de escribir cantidades que Existencias.
 *
 * Entera sin decimales, con decimales solo si los tiene. Ocho mil novecientos
 * litros no se leen «8900,00».
 */
function fmtCantidad(valor: string | number): string {
  const n = Number(valor)
  return Number.isInteger(n) ? enteros(n) : n.toLocaleString('es-VE', { maximumFractionDigits: 2 })
}

/*
  LA VIDA DE UN ARTÍCULO, EN UNA PÁGINA

  Todo esto ya estaba registrado y no había dónde leerlo junto. Para saber qué
  le había pasado a un neumático había que abrir Movimientos, filtrar, abrir
  Asignaciones, buscar por artículo y juntarlo de cabeza.

  Va de lo más nuevo a lo más viejo porque la pregunta que trae aquí a alguien
  casi siempre es «¿qué pasó con esto?», no «¿cómo empezó?». El nacimiento
  queda al fondo, que es donde corresponde a algo que se mira una vez.
*/

/** Cada tipo de hecho tiene su color, y el color significa una sola cosa. */
function tono(h: HechoDelArticulo): 'entrada' | 'salida' | 'aviso' | 'quieto' {
  if (h.tipo === 'PERDIDA' || h.tipo === 'DANADA') return 'aviso'
  if (h.signo > 0) return 'entrada'
  if (h.signo < 0) return 'salida'
  return 'quieto'
}

export function FichaArticulo() {
  const { id } = useParams()
  const articuloId = Number(id)

  const { data: articulos, isPending } = useArticulos(false)
  const { data: totales } = useExistenciasTotales()
  const historial = useHistorialArticulo(Number.isFinite(articuloId) ? articuloId : null)

  const a = (articulos ?? []).find((x) => x.id === articuloId)
  const t = (totales ?? []).find((x) => x.articulo_id === articuloId)

  if (isPending) return <Cargando />

  if (!a) {
    return (
      <Card>
        <p className="text-ink/70 text-sm">No existe ese artículo.</p>
        <Link to="/app/inventario/articulos" className="text-royal-600 mt-2 inline-block text-sm">
          Volver al catálogo
        </Link>
      </Card>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow={a.codigo}
        title={a.nombre}
        description={a.descripcion ?? undefined}
        actions={
          <Link to="/app/inventario/articulos">
            <Button variant="outline" size="sm" icon={<ArrowLeft />}>
              Al catálogo
            </Button>
          </Link>
        }
      />

      {/* ------------------------------ De un vistazo ----------------------------- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-ink/45 text-xs">Existencia</p>
          <p className="text-ink/90 tabular mt-1 text-2xl font-semibold">
            {t ? fmtCantidad(t.existencia) : '0'}
            <span className="text-ink/45 ml-1 text-sm font-normal">{a.unidad}</span>
          </p>

          {/* Solo cuando difieren. Repetirlo siempre enseña a no leerlo. */}
          {t && Number(t.prestadas) > 0 ? (
            <p
              className={cn(
                'mt-1 text-xs',
                Number(t.disponibles) <= 0 ? 'text-warning' : 'text-ink/50',
              )}
            >
              {fmtCantidad(t.disponibles)} disponible · {fmtCantidad(t.prestadas)} en manos de
              alguien
            </p>
          ) : null}
        </Card>

        <Card>
          <p className="text-ink/45 text-xs">Categoría</p>
          <p className="text-ink/85 mt-1 text-lg">{a.categoria}</p>
          <p className="text-ink/45 mt-1 text-xs">
            {a.inventariable ? 'Se lleva en el libro' : 'No entra al inventario'}
          </p>
        </Card>

        <Card>
          <p className="text-ink/45 text-xs">Al entregarlo</p>
          <p className="text-ink/85 mt-1 text-lg">
            {a.modo_entrega === 'RETORNABLE'
              ? 'Vuelve'
              : a.modo_entrega === 'CONSUMIBLE'
                ? 'Se gasta'
                : 'No se entrega'}
          </p>
          <p className="text-ink/45 mt-1 text-xs">
            {a.modo_entrega === 'RETORNABLE'
              ? 'Queda a nombre de quien lo tiene'
              : a.modo_entrega === 'CONSUMIBLE'
                ? 'Sale del almacén y no vuelve'
                : 'No es algo que se le dé a una persona'}
          </p>
        </Card>

        <Card>
          <p className="text-ink/45 text-xs">Mínimo</p>
          <p className="text-ink/85 tabular mt-1 text-2xl font-semibold">
            {Number(a.stock_minimo) > 0 ? fmtCantidad(a.stock_minimo) : '—'}
          </p>
          <p className="text-ink/45 mt-1 text-xs">
            {Number(a.stock_minimo) > 0 ? 'Avisa al bajar de aquí' : 'No se controla'}
          </p>
        </Card>
      </div>

      {/* -------------------------------- La historia ------------------------------- */}
      <Card flush className="mt-4">
        <div className="px-5 pt-5">
          <CardHeader
            title="Su historia"
            subtitle="Todo lo que le ha pasado desde que se creó, de lo más reciente a lo más viejo."
          />
        </div>

        {historial.isPending ? <Cargando /> : null}
        {historial.error ? (
          <div className="p-5">
            <ErrorDeCarga error={historial.error} />
          </div>
        ) : null}

        {historial.data && historial.data.length === 0 ? (
          <Vacio icono={<Circle />} titulo="Sin movimientos todavía" />
        ) : null}

        {historial.data && historial.data.length > 0 ? (
          <ul className="mt-2">
            {historial.data.map((h, i) => {
              const t = tono(h)

              return (
                <li
                  key={`${h.tipo}-${h.documento ?? 'x'}-${h.ocurrido_en}-${i}`}
                  className="border-hairline flex gap-3 border-t px-5 py-3"
                >
                  {/* La flecha dice en un golpe de vista si sumó o restó. Lo que
                      no mueve existencia —una entrega que vuelve— lleva punto,
                      no flecha: no es ni entrada ni salida. */}
                  <span
                    className={cn(
                      'mt-0.5 shrink-0',
                      t === 'entrada'
                        ? 'text-success'
                        : t === 'salida'
                          ? 'text-danger'
                          : t === 'aviso'
                            ? 'text-warning'
                            : 'text-ink/30',
                    )}
                  >
                    {t === 'entrada' ? (
                      <ArrowDownRight className="size-4" />
                    ) : t === 'salida' ? (
                      <ArrowUpRight className="size-4" />
                    ) : (
                      <Circle className="size-3" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-ink/85 text-sm font-medium">{h.titulo}</span>

                      {h.cantidad ? (
                        <span className="tabular text-ink/70 text-sm">
                          {fmtCantidad(h.cantidad)} {a.unidad}
                        </span>
                      ) : null}

                      {h.almacen ? (
                        <span className="text-ink/45 text-xs">· {h.almacen}</span>
                      ) : null}

                      {h.persona ? <Chip tone="neutral">{h.persona}</Chip> : null}
                    </div>

                    {h.detalle ? (
                      <p className="text-ink/55 mt-0.5 text-xs">{h.detalle}</p>
                    ) : null}

                    <p className="text-ink/40 text-2xs mt-0.5">
                      {fechaHora(h.ocurrido_en)}
                      {h.documento ? ` · ${h.documento}` : ''}
                      {h.quien ? ` · lo registró ${h.quien}` : ''}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : null}
      </Card>
    </>
  )
}
