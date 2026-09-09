import { usePresentacionesDeArticulo } from '@/lib/api/catalogo'
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
    </Card>
  )
}
