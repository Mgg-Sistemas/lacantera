import { useArticulosParecidos } from '@/lib/api/catalogo'
import { cn } from '@/lib/cn'

/**
 * Lo que ya está y se llama parecido a lo que se está escribiendo.
 *
 * Christopher: «debemos asegurar que el sistema impide (o mínimo
 * advierte/sugiere) duplicados... "Insumos" o "Insumo", "Repuesto disco de
 * corte 7'" o "Disco de corte 7'"».
 *
 * ADVIERTE Y SUGIERE, NO IMPIDE. Un almacén de verdad tiene DISCO DE CORTE 7 y
 * DISCO DE CORTE 9, y son dos cosas distintas: quien sabe cuál es cuál es la
 * persona. Lo que le faltaba era verlos.
 *
 * Solo el homónimo —los dos nombres se reducen a lo mismo— pide la casilla, y
 * es el único que la base también rechaza. Los demás se enseñan y ya: si uno de
 * ellos era el que buscaba, ahí tiene su código para irse a buscarlo.
 *
 * VIVE EN `components` Y NO EN LA FICHA DE ARTÍCULOS porque hay dos sitios
 * donde nace un artículo: esa ficha y el renglón de un pedido de compra. El
 * segundo llevaba semanas sin esta defensa —se pulsaba «Crear y usar» y el
 * duplicado entraba, o salía un error crudo de la base sin decir con qué
 * chocaba—. Un aviso que solo está en una de las dos puertas no es un aviso.
 */
export function ParecidosAEste({
  nombre,
  excluir,
  categoria,
  confirmado,
  onConfirmar,
}: {
  nombre: string
  excluir?: number
  categoria?: string
  confirmado: boolean
  onConfirmar: (valor: boolean) => void
}) {
  const { data } = useArticulosParecidos(nombre, excluir, categoria)
  const lista = data ?? []
  if (lista.length === 0) return null

  const homonimo = lista.some((p) => p.es_el_mismo)

  return (
    <div
      className={cn(
        'rounded-card mt-2 border p-2.5',
        homonimo ? 'border-warning/40 bg-warning-soft' : 'border-hairline bg-ink/4',
      )}
    >
      <p className="text-ink/70 text-xs">
        {homonimo
          ? 'Ya hay un artículo que se llama igual:'
          : 'Ya hay artículos que se llaman parecido:'}
      </p>
      <ul className="mt-1.5 space-y-1">
        {lista.map((p) => (
          <li key={p.id} className="text-ink/85 flex items-baseline gap-2 text-xs">
            <span className="text-ink/50 shrink-0 font-mono text-2xs">{p.codigo}</span>
            <span className={p.es_el_mismo ? 'font-semibold' : undefined}>{p.nombre}</span>
            <span className="text-ink/40 shrink-0">
              {p.categoria}
              {p.activo ? '' : ' · inactivo'}
            </span>
          </li>
        ))}
      </ul>
      {homonimo ? (
        <label className="text-ink/70 mt-2 flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={confirmado}
            onChange={(e) => onConfirmar(e.target.checked)}
          />
          Es otra cosa distinta — créalo aparte
        </label>
      ) : null}
    </div>
  )
}
