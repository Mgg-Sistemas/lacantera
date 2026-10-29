import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Input } from '@/components/ui/Input'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useAlmacenes, useExistencias, useExistenciasTotales } from '@/lib/api/inventario'
import { cn } from '@/lib/cn'

/*
  VER INVENTARIO, EN EL TELÉFONO.

  Christopher, 20/10/2026: antes de registrar una entrada o entregar algo,
  hace falta poder mirar qué hay sin salir del teléfono. Es solo consulta
  —ninguna acción cuelga de aquí—, así que basta con escritura o lectura en
  Inventario: a diferencia de las otras tres tareas, esta no mueve nada.
*/

export function AlmacenExistencias() {
  const { puede } = useMisPermisos()
  const puedeVer = puede('INVENTARIO', 'LECTURA')
  const { data: almacenes } = useAlmacenes()
  const [params] = useSearchParams()

  const [almacen, setAlmacen] = useState('')
  // Llega con lo ya tecleado cuando viene del buscador de la portada del
  // teléfono (`?q=`), para no obligar a escribirlo dos veces.
  const [buscado, setBuscado] = useState(params.get('q') ?? '')

  const totales = useExistenciasTotales(!almacen)
  const delSitio = useExistencias(almacen ? Number(almacen) : undefined, Boolean(almacen))
  const { data, isPending, error } = almacen ? delSitio : totales

  if (!puedeVer) {
    return (
      <p className="text-ink/60 mx-auto mt-10 max-w-sm text-center text-sm">
        Su usuario no tiene permiso para ver el inventario.
      </p>
    )
  }

  const filtradas = (data ?? []).filter(
    (v) => !buscado.trim() || v.articulo.toLowerCase().includes(buscado.trim().toLowerCase()),
  )

  return (
    <div className="mx-auto max-w-md pb-10">
      <Link
        to="/app/inventario/almacen"
        className="text-ink/45 active:text-ink/80 mb-3 inline-block text-sm underline decoration-dotted underline-offset-4"
      >
        ← Atrás
      </Link>
      <h1 className="text-ink/85 font-titular text-xl">Ver inventario</h1>
      <p className="text-ink/55 mt-1 text-sm">Solo consulta: nada se mueve desde aquí.</p>

      <div className="mt-4 space-y-3">
        <SelectBuscable
          label="Almacén"
          vacio="Todo el inventario"
          valor={almacen}
          onCambio={setAlmacen}
          opciones={(almacenes ?? []).map((a) => ({ valor: String(a.id), etiqueta: a.nombre }))}
        />
        <Input
          label="Buscar"
          ocultarEtiqueta
          value={buscado}
          onChange={(e) => setBuscado(e.target.value)}
          placeholder="Buscar un artículo…"
        />
      </div>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {!isPending && filtradas.length === 0 ? (
        <p className="text-ink/45 mt-8 text-center text-sm">Sin artículos que coincidan.</p>
      ) : null}

      {filtradas.length > 0 ? (
        <ul className="divide-hairline border-hairline mt-4 divide-y rounded-card border">
          {filtradas.map((v) => {
            const bajoMinimo = Number(v.stock_minimo) > 0 && Number(v.existencia) <= Number(v.stock_minimo)
            return (
              <li key={v.articulo_id} className="flex items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-ink/85 text-sm">{v.articulo}</p>
                  <p className="text-ink/40 text-xs">{v.categoria}</p>
                </div>
                <span className={cn('tabular text-sm', bajoMinimo ? 'text-warning font-medium' : 'text-ink/85')}>
                  {Number(v.existencia).toLocaleString('es-VE', { maximumFractionDigits: 2 })} {v.unidad}
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
