import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { dinero } from '@/lib/formato'
import { useTasaVigente } from '@/lib/api/tasas'
import type { PrecioVenta } from '@/lib/api/ventas'
import { filaVacia, type FilaRenglon } from './filas'

/**
 * Los renglones de un documento de venta.
 *
 * Lo comparten la cotización y el despacho porque escriben lo mismo, y porque
 * el día que se añada una columna tiene que aparecer en los dos: un despacho
 * que no dice exactamente lo que decía la cotización es una discusión con el
 * cliente.
 *
 * EL PRECIO SE TRAE DE LA LISTA Y SE PUEDE PISAR. Traerlo evita que cada quien
 * teclee el suyo; dejarlo editable es necesario porque se negocia. Lo que no se
 * negocia es el mínimo, y de eso se encarga la base: aquí solo se avisa en
 * amarillo antes de enviar, para que quien no tenga permiso no descubra el
 * rechazo después de llenar el formulario.
 */

interface Props {
  filas: FilaRenglon[]
  onCambiar: (filas: FilaRenglon[]) => void
  precios: PrecioVenta[]
  moneda: string
  /** Existencia por artículo, cuando el documento saca material del patio. */
  existencias?: Record<number, number>
}

export function Renglones({ filas, onCambiar, precios, moneda, existencias }: Props) {
  const { data: tasaHoy } = useTasaVigente()
  const tasa = Number(tasaHoy?.tasa ?? 0)

  /**
   * El mínimo del artículo, puesto en la moneda del documento.
   *
   * El precio de lista puede estar en dólares y el documento salir en
   * bolívares, que es lo normal aquí: material en divisas, clientes que
   * facturan en bolívares. Comparar los dos números crudos avisaba de un
   * "precio por debajo del mínimo" cada vez que se tecleaba una cifra en
   * bolívares —siempre más grande que el mínimo en dólares—, y callaba en el
   * caso contrario. La base sí convierte antes de comparar; esto hace lo mismo.
   *
   * Devuelve null cuando no se puede saber: sin tasa del día registrada, un
   * aviso inventado es peor que ninguno.
   */
  const minimoEnMoneda = (p: PrecioVenta | undefined): number | null => {
    const minimo = Number(p?.precio_minimo ?? 0)
    if (!p || minimo <= 0) return null
    if (p.moneda === moneda) return minimo
    if (!tasa) return null
    if (p.moneda === 'USD' && moneda === 'VES') return minimo * tasa
    if (p.moneda === 'VES' && moneda === 'USD') return minimo / tasa
    return null
  }

  const cambiar = (clave: number, cambios: Partial<FilaRenglon>) =>
    onCambiar(filas.map((f) => (f.clave === clave ? { ...f, ...cambios } : f)))

  const elegir = (clave: number, id: string) => {
    const p = precios.find((x) => String(x.articulo_id) === id)
    cambiar(clave, {
      articulo_id: id,
      descripcion: p?.nombre ?? '',
      unidad: p?.unidad ?? '',
      precio: p?.precio ? String(Number(p.precio)) : '',
    })
  }

  const opciones = precios
    .filter((p) => p.activo)
    .map((p) => ({
      valor: String(p.articulo_id),
      etiqueta: `${p.codigo} · ${p.nombre}${p.precio ? ` — ${dinero(p.moneda, p.precio)}` : ' — sin precio'}`,
    }))

  return (
    <div className="space-y-3">
      {filas.map((fila, indice) => {
        const precio = precios.find((p) => String(p.articulo_id) === fila.articulo_id)
        const minimo = minimoEnMoneda(precio)
        const bajoMinimo = minimo !== null && Number(fila.precio) > 0 && Number(fila.precio) < minimo
        const avisoMinimo =
          bajoMinimo && minimo !== null
            ? `Por debajo del mínimo de ${dinero(moneda, minimo)}`
            : undefined

        const disponible = fila.articulo_id ? existencias?.[Number(fila.articulo_id)] : undefined
        const sinMaterial =
          disponible !== undefined && Number(fila.cantidad) > 0 && Number(fila.cantidad) > disponible

        const total = (Number(fila.cantidad) || 0) * (Number(fila.precio) || 0)

        return (
          <div
            key={fila.clave}
            className="border-hairline rounded-card grid gap-3 border p-3 sm:grid-cols-12"
          >
            <div className="sm:col-span-12">
              <Select
                label={`Renglón ${indice + 1}`}
                vacio="Elige el producto"
                value={fila.articulo_id}
                onChange={(e) => elegir(fila.clave, e.target.value)}
                opciones={opciones}
                hint={
                  disponible !== undefined
                    ? `Hay ${disponible.toLocaleString('es-VE')} ${fila.unidad || ''} en el patio elegido.`
                    : undefined
                }
              />
            </div>

            <div className="sm:col-span-4">
              <Input
                label="Cantidad"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={fila.cantidad}
                onChange={(e) => cambiar(fila.clave, { cantidad: e.target.value })}
                error={sinMaterial ? 'No hay tanto en el patio' : undefined}
              />
            </div>

            <div className="sm:col-span-4">
              <Input
                label={`Precio por ${fila.unidad || 'unidad'}`}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={fila.precio}
                onChange={(e) => cambiar(fila.clave, { precio: e.target.value })}
                hint={avisoMinimo}
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

            <label className="text-ink/60 flex cursor-pointer items-center gap-2 text-xs select-none sm:col-span-12">
              <input
                type="checkbox"
                className="accent-royal-600 size-3.5"
                checked={fila.exento}
                onChange={(e) => cambiar(fila.clave, { exento: e.target.checked })}
              />
              Exento de IVA
            </label>
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
