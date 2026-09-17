import { Plus, Trash2 } from 'lucide-react'
import { ConversionDeCantidad } from '@/components/ConversionDeCantidad'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { dinero } from '@/lib/formato'
import { useTasaVigente } from '@/lib/api/tasas'
import { useMisAcciones } from '@/lib/api/usuarios'
import {
  CONDICION_VENTA,
  unidadesDeVenta,
  type CondicionVenta,
  type PrecioVenta,
} from '@/lib/api/ventas'
import {
  cantidadDelPatio,
  conPrecio,
  faltaEnFila,
  filaVacia,
  listaEnMoneda,
  precioDeLista,
  type FilaRenglon,
} from './filas'

/**
 * Los renglones de un documento de venta.
 *
 * Lo comparten la cotización y el despacho porque escriben lo mismo, y porque
 * el día que se añada una columna tiene que aparecer en los dos: un despacho
 * que no dice exactamente lo que decía la cotización es una discusión con el
 * cliente.
 *
 * CADA RENGLÓN DICE A QUÉ PRECIO SALE. Antes el precio de la lista se traía y
 * se podía pisar sin decir nada, y un 9 donde la lista decía 12 no se sabía si
 * era un descuento o un dedo. Ahora se elige: de lista, con descuento (en
 * porcentaje o en monto por unidad), sin cargo con su motivo, o acordado
 * cuando esa unidad no tiene precio de lista. La cifra la calcula la base con
 * la misma cuenta que se enseña aquí; ninguna oferta se ata a un cliente.
 *
 * Y EN QUÉ UNIDAD. Lo que tiene densidad se vende en metros cúbicos o en
 * toneladas; en la nota se enseña cuánto sale del patio y que es estimado, o
 * que lo dice la romana.
 */

interface Props {
  filas: FilaRenglon[]
  onCambiar: (filas: FilaRenglon[]) => void
  precios: PrecioVenta[]
  moneda: string
  /**
   * Los patios, cuando el documento saca material. Christopher, 17/09/2026:
   * «que se permita escoger (opcional) de dónde sale cada renglón». Sin elegir,
   * el renglón sale del patio de la nota.
   */
  patios?: {
    opciones: { valor: string; etiqueta: string }[]
    /** El de la nota. Vacío mientras no se elija. */
    deLaNota: string
    /** La existencia por artículo en ese patio. */
    existencias: (almacenId: string) => Record<number, number> | undefined
  }
  /**
   * Las toneladas del ticket de romana elegido. Con un solo material del patio
   * vendido en toneladas, su cantidad es esta y no se teclea.
   */
  toneladasDeRomana?: number | null
  /** Una nota de entrega: no pregunta por el IVA, que lo decide la factura. */
  sinIva?: boolean
}

export function Renglones({
  filas,
  onCambiar,
  precios,
  moneda,
  patios,
  toneladasDeRomana,
  sinIva,
}: Props) {
  const { data: tasaHoy } = useTasaVigente()
  const tasa = Number(tasaHoy?.tasa ?? 0)
  const { puede } = useMisAcciones()
  const puedeRegalar = puede('VENTAS.VENDER_BAJO_MINIMO')

  // Un artículo sale una vez en el selector aunque tenga precio en dos unidades.
  const articulos = precios.filter(
    (p, i) => p.activo && precios.findIndex((x) => x.articulo_id === p.articulo_id) === i,
  )

  const delPatio = filas.filter(
    (f) => f.articulo_id && articulos.find((a) => String(a.articulo_id) === f.articulo_id)?.categoria === 'PRODUCTO',
  )
  const claveDeRomana =
    toneladasDeRomana && delPatio.length === 1 && delPatio[0].unidad === 'TON'
      ? delPatio[0].clave
      : null

  const listaDe = (f: FilaRenglon) =>
    listaEnMoneda(precioDeLista(precios, f.articulo_id, f.unidad), moneda, tasa)

  /**
   * El mínimo de esa unidad, puesto en la moneda del documento. Null cuando no
   * se puede saber: sin tasa, un aviso inventado es peor que ninguno.
   */
  const minimoEnMoneda = (f: FilaRenglon): number | null => {
    const p = precioDeLista(precios, f.articulo_id, f.unidad)
    if (!p || !(Number(p.precio_minimo) > 0)) return null
    return listaEnMoneda({ ...p, precio: p.precio_minimo }, moneda, tasa)
  }

  const cambiar = (clave: number, cambios: Partial<FilaRenglon>) =>
    onCambiar(
      filas.map((f) => {
        if (f.clave !== clave) return f
        const nueva = { ...f, ...cambios }
        return conPrecio(nueva, listaDe(nueva))
      }),
    )

  const elegirArticulo = (clave: number, id: string) => {
    const a = articulos.find((x) => String(x.articulo_id) === id)
    const unidad = a?.unidad_articulo ?? ''
    const hayLista = a ? precioDeLista(precios, id, unidad) !== undefined : false
    cambiar(clave, {
      articulo_id: id,
      descripcion: a?.nombre ?? '',
      unidad,
      precio: '',
      condicion: hayLista ? 'LISTA' : '',
      descuento: '',
      motivo: '',
    })
  }

  const elegirUnidad = (f: FilaRenglon, unidad: string) => {
    const hayLista = precioDeLista(precios, f.articulo_id, unidad) !== undefined
    // La condición que ya no cabe se borra: sin lista no hay lista ni descuento.
    const condicion: FilaRenglon['condicion'] =
      f.condicion === 'SIN_CARGO'
        ? 'SIN_CARGO'
        : hayLista
          ? f.condicion === 'DESCUENTO'
            ? 'DESCUENTO'
            : 'LISTA'
          : ''
    cambiar(f.clave, { unidad, condicion, precio: condicion === '' ? '' : f.precio })
  }

  return (
    <div className="space-y-3">
      {filas.map((fila, indice) => {
        const articulo = articulos.find((a) => String(a.articulo_id) === fila.articulo_id)
        const unidades = articulo ? unidadesDeVenta(articulo) : []
        const hayLista = precioDeLista(precios, fila.articulo_id, fila.unidad) !== undefined
        const lista = listaDe(fila)
        const deRomana = claveDeRomana === fila.clave
        const cantidad = deRomana ? String(Math.round(toneladasDeRomana! * 1e4) / 1e4) : fila.cantidad

        const minimo = minimoEnMoneda(fila)
        const bajoMinimo =
          fila.condicion === 'DESCUENTO' &&
          minimo !== null &&
          Number(fila.precio) > 0 &&
          Number(fila.precio) < minimo

        const patio = articulo ? cantidadDelPatio({ ...fila, cantidad }, precios) : null
        const patioDelRenglon = fila.almacen_id || patios?.deLaNota || ''
        const nombreDelPatio = patios?.opciones.find((o) => o.valor === patioDelRenglon)?.etiqueta
        const existencias = patios && patioDelRenglon ? patios.existencias(patioDelRenglon) : undefined
        const disponible = fila.articulo_id ? existencias?.[Number(fila.articulo_id)] : undefined
        const sinMaterial = disponible !== undefined && patio !== null && patio > disponible
        const convertida = articulo && fila.unidad && fila.unidad !== articulo.unidad_articulo
        /*
          Lo que sale del patio en otra medida ya lo dice la pista de la nota de
          entrega; en ese caso la línea de conversión lo repetiría con otras
          palabras. En los demás —la cotización, o vendido en la unidad del
          patio— se enseña la otra medida: «se desea que todo producto de venta
          se exprese en m3 y ton por igual».
        */
        const pistaDelPatio = !deRomana && !!convertida && patio !== null && !!existencias

        const total = (Number(cantidad) || 0) * (Number(fila.precio) || 0)
        const falta = faltaEnFila({ ...fila, cantidad }, precios)

        const opcionesCondicion: { valor: CondicionVenta; etiqueta: string }[] = hayLista
          ? [
              {
                valor: 'LISTA',
                etiqueta: `De lista${lista !== null ? ` · ${dinero(moneda, lista)} por ${fila.unidad}` : ''}`,
              },
              { valor: 'DESCUENTO', etiqueta: 'Con descuento sobre la lista' },
              { valor: 'SIN_CARGO', etiqueta: 'Sin cargo' },
            ]
          : [
              { valor: 'ACORDADO', etiqueta: 'Precio acordado (no hay lista)' },
              { valor: 'SIN_CARGO', etiqueta: 'Sin cargo' },
            ]

        return (
          <div
            key={fila.clave}
            className="border-hairline rounded-card grid gap-3 border p-3 sm:grid-cols-12"
          >
            <div className={patios ? 'sm:col-span-5' : 'sm:col-span-8'}>
              <Select
                label={`Renglón ${indice + 1}`}
                vacio="Elige el producto"
                value={fila.articulo_id}
                onChange={(e) => elegirArticulo(fila.clave, e.target.value)}
                opciones={articulos.map((p) => ({
                  valor: String(p.articulo_id),
                  etiqueta: `${p.codigo} · ${p.nombre}`,
                }))}
                hint={
                  disponible !== undefined && articulo
                    ? `Hay ${disponible.toLocaleString('es-VE')} ${articulo.unidad_articulo} en ${nombreDelPatio ?? 'el patio elegido'}.`
                    : undefined
                }
              />
            </div>

            {patios ? (
              <div className="sm:col-span-4">
                <Select
                  label="De qué patio sale"
                  vacio={
                    patios.deLaNota
                      ? `El de la nota (${patios.opciones.find((o) => o.valor === patios.deLaNota)?.etiqueta ?? '—'})`
                      : 'El de la nota'
                  }
                  value={fila.almacen_id}
                  onChange={(e) => cambiar(fila.clave, { almacen_id: e.target.value })}
                  opciones={patios.opciones}
                />
              </div>
            ) : null}

            <div className={patios ? 'sm:col-span-3' : 'sm:col-span-4'}>
              <Select
                label="Se vende por"
                value={fila.unidad}
                disabled={!articulo}
                onChange={(e) => elegirUnidad(fila, e.target.value)}
                opciones={
                  unidades.length > 0
                    ? unidades.map((u) => ({
                        valor: u,
                        etiqueta: precioDeLista(precios, fila.articulo_id, u)
                          ? u
                          : `${u} · sin precio de lista`,
                      }))
                    : [{ valor: '', etiqueta: '—' }]
                }
                hint={
                  articulo && unidades.length === 1 && articulo.categoria === 'PRODUCTO'
                    ? 'Sin densidad en el catálogo solo se vende en su unidad.'
                    : undefined
                }
              />
            </div>

            <div className="sm:col-span-4">
              <Input
                label={`Cantidad${fila.unidad ? ` (${fila.unidad})` : ''}`}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={cantidad}
                disabled={deRomana}
                onChange={(e) => cambiar(fila.clave, { cantidad: e.target.value })}
                error={sinMaterial ? 'No hay tanto en el patio' : undefined}
                hint={
                  deRomana
                    ? 'Las toneladas del ticket de romana.'
                    : pistaDelPatio
                      ? `Salen del patio unos ${patio!.toLocaleString('es-VE', { maximumFractionDigits: 2 })} ${articulo!.unidad_articulo}, estimado con ${Number(articulo!.densidad_ton_m3).toLocaleString('es-VE')} t/m³.`
                      : undefined
                }
              />
              {pistaDelPatio ? null : (
                <ConversionDeCantidad
                  cantidad={cantidad}
                  unidad={fila.unidad}
                  densidad={articulo?.densidad_ton_m3}
                />
              )}
            </div>

            <div className="sm:col-span-4">
              <Select
                label="A qué precio sale"
                vacio={fila.articulo_id ? 'Elige la condición' : '—'}
                value={fila.condicion}
                disabled={!fila.articulo_id}
                onChange={(e) =>
                  cambiar(fila.clave, {
                    condicion: e.target.value as FilaRenglon['condicion'],
                    precio: e.target.value === 'ACORDADO' ? '' : fila.precio,
                  })
                }
                opciones={opcionesCondicion}
                error={
                  fila.condicion === 'SIN_CARGO' && !puedeRegalar
                    ? 'Sin cargo lo autoriza quien pueda vender bajo el mínimo, y no tienes esa casilla.'
                    : undefined
                }
                hint={
                  fila.condicion
                    ? fila.condicion === 'LISTA' && lista === null && hayLista
                      ? 'La lista está en otra moneda: la cifra la pone la base al guardar.'
                      : CONDICION_VENTA[fila.condicion].ayuda
                    : undefined
                }
              />
            </div>

            <div className="flex items-end justify-between gap-2 sm:col-span-4">
              <div className="min-w-0">
                <p className="text-ink/45 text-xs">Total del renglón</p>
                <p className="tabular text-ink/85 text-sm font-semibold">{dinero(moneda, total)}</p>
              </div>
              <Button
                variant="ghost"
                icon={<Trash2 />}
                disabled={filas.length === 1}
                onClick={() => onCambiar(filas.filter((f) => f.clave !== fila.clave))}
                className="text-danger hover:bg-danger/10 shrink-0"
              >
                Quitar
              </Button>
            </div>

            {fila.condicion === 'DESCUENTO' ? (
              <>
                <div className="sm:col-span-4">
                  <Input
                    label="Descuento"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={fila.descuento}
                    onChange={(e) => cambiar(fila.clave, { descuento: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-4">
                  <Select
                    label="En"
                    value={fila.descuentoEn}
                    onChange={(e) =>
                      cambiar(fila.clave, {
                        descuentoEn: e.target.value as FilaRenglon['descuentoEn'],
                      })
                    }
                    opciones={[
                      { valor: 'PORCENTAJE', etiqueta: 'Porcentaje de la lista' },
                      { valor: 'MONTO', etiqueta: `${moneda} menos por ${fila.unidad || 'unidad'}` },
                    ]}
                  />
                </div>
                <div className="flex items-end sm:col-span-4">
                  <p className="text-ink/60 text-sm">
                    {Number(fila.precio) > 0 && lista !== null
                      ? `Queda en ${dinero(moneda, fila.precio)} por ${fila.unidad}, de ${dinero(moneda, lista)}.`
                      : 'Escribe el descuento para ver en cuánto queda.'}
                    {bajoMinimo ? (
                      <span className="text-warning block text-xs">
                        Por debajo del mínimo de {dinero(moneda, minimo!)}: lo autoriza quien pueda
                        vender bajo el mínimo.
                      </span>
                    ) : null}
                  </p>
                </div>
              </>
            ) : null}

            {fila.condicion === 'SIN_CARGO' ? (
              <div className="sm:col-span-12">
                <Input
                  label="Por qué sale sin cargo"
                  value={fila.motivo}
                  onChange={(e) => cambiar(fila.clave, { motivo: e.target.value })}
                  hint="Queda escrito en el renglón y en el papel."
                />
              </div>
            ) : null}

            {fila.condicion === 'ACORDADO' ? (
              <div className="sm:col-span-4">
                <Input
                  label={`Precio acordado por ${fila.unidad || 'unidad'}`}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={fila.precio}
                  onChange={(e) => cambiar(fila.clave, { precio: e.target.value })}
                />
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-12">
              {sinIva ? (
                <span />
              ) : (
                <label className="text-ink/60 flex cursor-pointer items-center gap-2 text-xs select-none">
                  <input
                    type="checkbox"
                    className="accent-royal-600 size-3.5"
                    checked={fila.exento}
                    onChange={(e) => cambiar(fila.clave, { exento: e.target.checked })}
                  />
                  Exento de IVA
                </label>
              )}
              {falta && fila.articulo_id ? <p className="text-warning text-xs">{falta}</p> : null}
            </div>
          </div>
        )
      })}

      <Button
        variant="soft"
        icon={<Plus />}
        onClick={() => onCambiar([...filas, filaVacia()])}
      >
        Agregar renglón
      </Button>
    </div>
  )
}
