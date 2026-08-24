import { Link, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Cargando } from '@/components/ui/Estado'
import { cn } from '@/lib/cn'
import { Historial } from '@/components/Historial'
import { useArticulos } from '@/lib/api/catalogo'
import { useHistorialArticulo, useExistenciasTotales } from '@/lib/api/inventario'
import { enteros } from '@/lib/formato'

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

      {/* -------------------------------- La historia -------------------------------
          Antes esto eran noventa líneas aquí mismo. Se mudó a <Historial>, que
          es el mismo dibujo: se copió DE aquí, porque de los siete dialectos que
          había este era el único que decía a la vez el signo, el detalle y quién
          lo registró. Lo que cambia es que ahora lo comparten las tres fichas. */}
      <Historial
        className="mt-4"
        titulo="Su historia"
        subtitulo="Todo lo que le ha pasado desde que se creó, de lo más reciente a lo más viejo."
        hechos={historial.data}
        cargando={historial.isPending}
        error={historial.error}
        vacio="Sin movimientos todavía"
      />
    </>
  )
}
