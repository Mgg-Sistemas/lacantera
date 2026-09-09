import { useCostoPorPresentacion, usePresentacionesDeArticulo } from '@/lib/api/catalogo'
import { Card } from '@/components/ui/Card'

/*
  CUÁNTO HAY Y CUÁNTO VALE, DICHO EN CADA ENVASE.

  Christopher: «el sistema debe de ser capaz de expresar la valorización del
  item en sus diferentes presentaciones».

  La existencia se lleva en UNA sola cifra y en la unidad de operación —604 L—
  porque el aceite de un tambor y el de una paila es el mismo aceite y el mismo
  número de litros. Eso es lo que permite preguntar «cuánto aceite hidráulico
  hay» y que haya una respuesta. Pero nadie camina por el almacén contando
  litros: camina contando tambores y pailas, y hasta hoy tenía que hacer esa
  división de cabeza.

  EL REPARTO ES UNA LECTURA, NO UN CONTEO, y la pantalla tiene que decirlo. El
  sistema no sabe cuántos envases hay físicamente en el estante: sabe cuántos
  litros hay y cuántos litros trae un envase. Si entraron 8 pailas y salieron 30
  litros sueltos, aquí saldrá «31 pailas y 15 L» aunque en el suelo haya otra
  cosa, porque de los envases abiertos el libro no lleva cuenta.

  Y EL FACTOR ES NOMINAL. Christopher, el 9/09: las pailas son «de 19 litros
  aproximadamente, así como los tambores de 208 litros aproximadamente, de forma
  no estricta». Un tambor real trae lo que trae. Por eso esto se enseña como una
  equivalencia y no como un inventario de envases, y por eso lo que vale de
  verdad —el total— se calcula sobre los litros y nunca sobre los envases.
*/

/** Cuántos envases enteros caben y qué queda suelto. */
function repartir(total: number, por: number) {
  const enteros = Math.trunc(total / por)
  const resto = Number((total - enteros * por).toFixed(4))
  return { enteros, resto }
}

const numero = (n: number, decimales = 2) =>
  n.toLocaleString('es-VE', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })

const cantidad = (n: number) =>
  Number.isInteger(n) ? n.toLocaleString('es-VE') : numero(n, 2)

export function ValorPorPresentacion({
  articuloId,
  unidad,
  existencia,
  costoPorUnidad,
}: {
  articuloId: number
  unidad: string
  existencia: number
  /** El costo promedio de una unidad de operación. Nulo si nunca entró nada. */
  costoPorUnidad: number | null
}) {
  const { data } = usePresentacionesDeArticulo(articuloId)

  const formas = (data ?? []).filter((p) => p.activa)
  if (formas.length === 0) return null

  return (
    <Card className="mt-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-ink/90 text-base font-semibold">Cuánto hay, en cada envase</h2>
        <span className="text-ink/45 text-xs">
          {cantidad(existencia)} {unidad}
          {costoPorUnidad !== null ? ` · ${numero(costoPorUnidad)} USD por ${unidad}` : ''}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-ink/45 border-hairline border-b text-left text-xs">
              <th className="py-2 pr-3 font-medium">Envase</th>
              <th className="px-3 py-2 font-medium">Equivale a</th>
              <th className="px-3 py-2 text-right font-medium">Vale cada uno</th>
              <th className="py-2 pl-3 text-right font-medium">Vale lo que hay</th>
            </tr>
          </thead>
          <tbody>
            {formas.map((p) => {
              const por = Number(p.unidades)
              const { enteros, resto } = repartir(existencia, por)
              const valorDeUno = costoPorUnidad === null ? null : costoPorUnidad * por
              return (
                <tr key={p.id} className="border-hairline border-b last:border-0">
                  <td className="text-ink/80 py-2.5 pr-3">
                    {p.presentacion}
                    <span className="text-ink/45 text-xs">
                      {' '}
                      · {cantidad(por)} {unidad}
                    </span>
                    {p.por_defecto ? (
                      <span className="text-ink/40 text-2xs"> · la que se propone</span>
                    ) : null}
                  </td>
                  <td className="text-ink/85 px-3 py-2.5">
                    {cantidad(enteros)}
                    {resto > 0 ? (
                      <span className="text-ink/50">
                        {' '}
                        y {cantidad(resto)} {unidad} sueltos
                      </span>
                    ) : null}
                  </td>
                  <td className="text-ink/70 tabular px-3 py-2.5 text-right">
                    {valorDeUno === null ? '—' : `${numero(valorDeUno)} USD`}
                  </td>
                  <td className="text-ink/85 tabular py-2.5 pl-3 text-right font-medium">
                    {costoPorUnidad === null ? '—' : `${numero(costoPorUnidad * existencia)} USD`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/*
        LO QUE HAY QUE DECIR PARA QUE ESTO NO SE LEA COMO UN CONTEO.

        Sin esta línea, «31 pailas» se lee como si alguien las hubiera contado, y
        el día que el almacén cuente 30 el sistema parecerá estar mintiendo.
        Dice una equivalencia, y las equivalencias no cuadran con la realidad al
        último litro: los envases no vienen exactos y de los abiertos el libro no
        lleva cuenta.
      */}
      <p className="text-ink/50 mt-3 text-xs leading-relaxed">
        Es una equivalencia, no un conteo de envases: los factores son aproximados y de los envases
        abiertos el libro no lleva cuenta. La existencia se mide en {unidad}, que es lo único que se
        cuenta al entrar y al salir. Por eso la última columna repite el mismo total en cada fila:
        hay un solo montón de {unidad}, mirado de varias maneras.
      </p>

      <ComoSeCompro articuloId={articuloId} unidad={unidad} />
    </Card>
  )
}

/*
  A CUÁNTO SALIÓ EL LITRO CADA VEZ, Y EN QUÉ ENVASE SE COMPRÓ.

  Christopher: «imaginando el caso de que existan dos compras en tiempos
  distintos, donde se compre tambor y otra donde se compre en galón o paila, sus
  precios en litro serían diferentes aunque fuera el mismo producto». Es un hecho
  de mercado, no una rareza: al mayor sale más barato.

  ESTO NO COMPITE CON EL COSTO DE ARRIBA. Arriba está lo que vale el inventario,
  que es una sola cifra y tiene que serlo: cuando salen veinte litros nadie puede
  decir de cuál de las dos compras salieron. Aquí está cómo se formó esa cifra, y
  eso es lo que permite ver que el tambor salió a siete y la paila a nueve, ir al
  proveedor con el dato y decidir cómo comprar la próxima vez.

  Se calla cuando solo hay una forma de comprar: comparar una fila consigo misma
  no es una comparación, es ruido.
*/
function ComoSeCompro({ articuloId, unidad }: { articuloId: number; unidad: string }) {
  const { data } = useCostoPorPresentacion(articuloId)
  const compras = data ?? []
  if (compras.length < 2) return null

  const porUnidad = compras.map((c) => Number(c.costo_base))
  const menor = Math.min(...porUnidad)
  const mayor = Math.max(...porUnidad)
  // Sobre el menor, que es la referencia útil: «la paila sale un 28% más cara
  // que el tambor», no «el tambor sale un 22% más barato que la paila».
  const brecha = menor > 0 ? ((mayor - menor) / menor) * 100 : 0

  return (
    <div className="border-hairline mt-4 border-t pt-3">
      <h3 className="text-ink/80 mb-2 text-sm font-semibold">Cómo se compró, y a cómo salió</h3>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-ink/45 border-hairline border-b text-left text-xs">
              <th className="py-2 pr-3 font-medium">Se compró en</th>
              <th className="px-3 py-2 font-medium">Veces</th>
              <th className="px-3 py-2 text-right font-medium">Salió a</th>
              <th className="py-2 pl-3 font-medium">Cuándo</th>
            </tr>
          </thead>
          <tbody>
            {compras.map((c) => (
              <tr key={c.presentacion ?? 'base'} className="border-hairline border-b last:border-0">
                <td className="text-ink/80 py-2.5 pr-3">
                  {c.presentacion ?? `Suelto, en ${unidad}`}
                  {c.unidades ? (
                    <span className="text-ink/45 text-xs">
                      {' '}
                      · {cantidad(Number(c.unidades))} {unidad}
                    </span>
                  ) : null}
                </td>
                <td className="text-ink/65 tabular px-3 py-2.5">{c.veces}</td>
                <td className="tabular px-3 py-2.5 text-right">
                  <span
                    className={c.corregido_despues ? 'text-ink/40 line-through' : 'text-ink/85'}
                  >
                    {numero(Number(c.costo_base))} USD
                  </span>
                  <span className="text-ink/45 text-xs"> por {unidad}</span>
                  {c.corregido_despues ? (
                    <span className="text-ink/50 block text-2xs">
                      la valoración se corrigió después
                    </span>
                  ) : null}
                </td>
                <td className="text-ink/50 py-2.5 pl-3 text-xs">
                  {c.primera === c.ultima ? c.primera : `${c.primera} a ${c.ultima}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {brecha >= 1 ? (
        <p className="text-ink/60 mt-2 text-xs leading-relaxed">
          Entre la forma más barata y la más cara hay un{' '}
          <span className="text-ink/85 font-semibold">{numero(brecha, 1)}%</span> de diferencia por{' '}
          {unidad}. El inventario se valora al promedio de todas, que es lo que hace cuadrar el
          libro; esta tabla es para decidir cómo conviene comprar.
        </p>
      ) : null}
    </div>
  )
}
