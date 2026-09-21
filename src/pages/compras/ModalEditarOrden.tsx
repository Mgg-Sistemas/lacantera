import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { dinero } from '@/lib/formato'
import { CONDICIONES_PAGO, useArticulos, useProveedores, useUnidades } from '@/lib/api/catalogo'
import { useMonedasUsables } from '@/lib/api/tasas'
import { useEditarOrdenDeCompra, type Compra, type Orden } from '@/lib/api/compras'

/*
  EDITAR LA ORDEN ENTERA.

  Angélica, 21/09/2026: «permite desde compras poder editar la orden por
  completo: precio, ítems, nombre, todo… si ya fue aprobada por el Gerente
  General, sí puede modificar. Si el precio al modificarse sobrepasa los 100 $,
  es allí donde la compra pasará a pendiente por aprobar Gerente General».

  Aquí se cambia lo mismo que se cargó: el proveedor, el título del pedido, los
  renglones —añadir, quitar, cambiar artículo, cantidad, unidad y precio—, la
  moneda, la condición, el IVA, el descuento y el flete.

  La cuenta de los 100 $ se enseña ANTES de guardar, con la diferencia en
  dólares, para que quien edita sepa si lo que va a hacer devuelve la compra a
  la gerencia. La base vuelve a hacer esa cuenta por su lado: esto es un aviso,
  no el control.
*/

interface Fila {
  clave: number
  articulo_id: string
  descripcion: string
  cantidad: string
  unidad: string
  precio: string
  marca: string
  exento: boolean
}

let siguiente = 1
const filaVacia = (): Fila => ({
  clave: siguiente++,
  articulo_id: '',
  descripcion: '',
  cantidad: '',
  unidad: 'UND',
  precio: '',
  marca: '',
  exento: false,
})

export function ModalEditarOrden({
  abierto,
  onCerrar,
  compra,
  orden,
}: {
  abierto: boolean
  onCerrar: () => void
  compra: Compra
  orden: Orden
}) {
  const editar = useEditarOrdenDeCompra()
  const { data: proveedores } = useProveedores()
  const { data: articulos } = useArticulos()
  const { data: unidades } = useUnidades()
  const monedas = useMonedasUsables()

  const [proveedorId, setProveedorId] = useState(String(orden.proveedor?.id ?? ''))
  const [titulo, setTitulo] = useState(compra.titulo)
  const [moneda, setMoneda] = useState(orden.moneda)
  const [condicion, setCondicion] = useState(orden.condicion_pago ?? 'CONTADO')
  const [descuento, setDescuento] = useState(String(Number(orden.descuento)))
  const [flete, setFlete] = useState(String(Number(orden.flete)))
  const [motivo, setMotivo] = useState('')
  const [filas, setFilas] = useState<Fila[]>(() =>
    orden.renglones
      .slice()
      .sort((a, b) => a.linea - b.linea)
      .map((r) => ({
        clave: siguiente++,
        articulo_id: r.articulo_id ? String(r.articulo_id) : '',
        descripcion: r.descripcion,
        cantidad: String(Number(r.cantidad)),
        unidad: r.unidad,
        precio: String(Number(r.precio_unitario)),
        marca: r.marca ?? '',
        exento: r.exento_iva === true,
      })),
  )

  const cambiar = (clave: number, cambio: Partial<Fila>) =>
    setFilas((f) => f.map((x) => (x.clave === clave ? { ...x, ...cambio } : x)))

  const buenas = filas.filter((f) => f.descripcion.trim() && Number(f.cantidad) > 0)

  /*
    LA CUENTA DE LOS 100 $, EN DÓLARES.

    La orden guarda su tasa: `total` está en su moneda y `total_usd` en dólares.
    Para comparar peras con peras, lo nuevo se pasa a dólares con la misma
    proporción que tiene la orden hoy. Si la moneda cambia, el aviso deja de ser
    fiable y se dice: manda la cuenta de la base.
  */
  const subtotal = buenas.reduce((s, f) => s + Number(f.cantidad || 0) * Number(f.precio || 0), 0)
  const gravado = buenas
    .filter((f) => !f.exento)
    .reduce((s, f) => s + Number(f.cantidad || 0) * Number(f.precio || 0), 0)
  const base = Math.max(0, gravado - Number(descuento || 0))
  const iva = base * (Number(compra.cotizaciones?.find((c) => c.id === orden.cotizacion_id)?.alicuota_iva ?? 16) / 100)
  const totalNuevo = subtotal - Number(descuento || 0) + Number(flete || 0) + iva

  const mismaMoneda = moneda === orden.moneda
  const aUsd = useMemo(() => {
    const total = Number(orden.total)
    const usd = Number(orden.total_usd)
    return total > 0 && usd > 0 ? usd / total : null
  }, [orden.total, orden.total_usd])

  const diferenciaUsd = mismaMoneda && aUsd ? totalNuevo * aUsd - Number(orden.total_usd) : null
  const vuelveAGerencia = !compra.directa && diferenciaUsd !== null && diferenciaUsd > 100

  const guardar = async () => {
    const resultado = await editar.mutateAsync({
      orden_id: orden.id,
      proveedor_id: Number(proveedorId),
      moneda,
      motivo,
      titulo,
      condicion_pago: condicion,
      descuento: Number(descuento) || 0,
      flete: Number(flete) || 0,
      renglones: buenas.map((f) => ({
        articulo_id: f.articulo_id ? Number(f.articulo_id) : null,
        descripcion: f.descripcion.trim(),
        cantidad: Number(f.cantidad),
        unidad: f.unidad,
        precio_unitario: Number(f.precio) || 0,
        exento_iva: f.exento,
        marca: f.marca.trim() || null,
      })),
    })
    onCerrar()
    return resultado
  }

  if (!abierto) return null

  return (
    <Modal
      abierto
      ancho="lg"
      onCerrar={onCerrar}
      titulo={`Editar la orden ${orden.numero}`}
      descripcion="Cambia lo que haga falta: proveedor, renglones, cantidades y precios. El almacén recibirá lo que quede aquí."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={
              editar.isPending ||
              !proveedorId ||
              buenas.length === 0 ||
              motivo.trim().length < 4 ||
              titulo.trim().length < 3
            }
            onClick={() => void guardar()}
          >
            {editar.isPending ? 'Guardando…' : vuelveAGerencia ? 'Guardar y mandar a la gerencia' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectBuscable
          label="Proveedor"
          valor={proveedorId}
          onCambio={setProveedorId}
          opciones={(proveedores ?? []).map((p) => ({
            valor: String(p.id),
            etiqueta: `${p.nombre} · ${p.rif}`,
          }))}
        />
        <Input label="Título de la compra" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        <Select
          label="Moneda"
          value={moneda}
          onChange={(e) => setMoneda(e.target.value)}
          opciones={monedas.data ?? []}
        />
        <Select
          label="Condición de pago"
          value={condicion}
          onChange={(e) => setCondicion(e.target.value)}
          opciones={CONDICIONES_PAGO.map((c) => ({ valor: c.valor, etiqueta: c.etiqueta }))}
        />
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-ink/85 font-titular text-base">Qué se compra</h3>
          <Button size="sm" variant="outline" icon={<Plus />} onClick={() => setFilas([...filas, filaVacia()])}>
            Añadir renglón
          </Button>
        </div>

        <div className="space-y-3">
          {filas.map((f) => (
            <div
              key={f.clave}
              className="border-hairline rounded-card grid gap-3 border p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]"
            >
              <div className="sm:col-span-2">
                <Input
                  label="Descripción"
                  value={f.descripcion}
                  onChange={(e) => cambiar(f.clave, { descripcion: e.target.value })}
                />
                <div className="mt-2">
                  <SelectBuscable
                    label="Artículo del catálogo"
                    vacio="Sin artículo (no entra al inventario)"
                    valor={f.articulo_id}
                    onCambio={(v) => {
                      const a = (articulos ?? []).find((x) => String(x.id) === v)
                      cambiar(f.clave, {
                        articulo_id: v,
                        descripcion: a && !f.descripcion.trim() ? a.nombre : f.descripcion,
                        unidad: a ? a.unidad : f.unidad,
                      })
                    }}
                    opciones={(articulos ?? []).map((a) => ({
                      valor: String(a.id),
                      codigo: a.codigo,
                      nombre: a.nombre,
                    }))}
                    hint="Sin artículo, el renglón es un gasto: no suma existencia al recibirlo."
                  />
                </div>
              </div>

              <Input
                label="Cantidad"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={f.cantidad}
                onChange={(e) => cambiar(f.clave, { cantidad: e.target.value })}
              />
              <Select
                label="Unidad"
                value={f.unidad}
                onChange={(e) => cambiar(f.clave, { unidad: e.target.value })}
                opciones={(unidades ?? []).map((u) => ({ valor: u.codigo, etiqueta: u.nombre }))}
              />
              <Input
                label="Precio"
                type="number"
                min="0"
                step="0.0001"
                inputMode="decimal"
                value={f.precio}
                onChange={(e) => cambiar(f.clave, { precio: e.target.value })}
                hint={
                  Number(f.cantidad) > 0 && Number(f.precio) > 0
                    ? dinero(moneda, Number(f.cantidad) * Number(f.precio))
                    : undefined
                }
              />

              <div className="flex items-end justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 />}
                  className="text-danger"
                  disabled={filas.length === 1}
                  onClick={() => setFilas(filas.filter((x) => x.clave !== f.clave))}
                >
                  Quitar
                </Button>
              </div>

              <div className="sm:col-span-5 flex flex-wrap items-center gap-4">
                <Input
                  label="Marca"
                  className="max-w-[220px]"
                  value={f.marca}
                  onChange={(e) => cambiar(f.clave, { marca: e.target.value })}
                />
                <label className="text-ink/75 mt-5 flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-royal-600 size-4"
                    checked={f.exento}
                    onChange={(e) => cambiar(f.clave, { exento: e.target.checked })}
                  />
                  Exento de IVA
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input
          label="Descuento"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={descuento}
          onChange={(e) => setDescuento(e.target.value)}
        />
        <Input
          label="Flete"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={flete}
          onChange={(e) => setFlete(e.target.value)}
        />
      </div>

      <div className="bg-ink/4 rounded-card mt-4 p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-ink/60">Antes</span>
          <span className="tabular">{dinero(orden.moneda, orden.total)}</span>
        </div>
        <div className="mt-1 flex justify-between font-medium">
          <span className="text-ink/80">Queda en</span>
          <span className="tabular">{dinero(moneda, totalNuevo)}</span>
        </div>
        {diferenciaUsd !== null ? (
          <p className={vuelveAGerencia ? 'text-warning mt-2 text-xs' : 'text-ink/55 mt-2 text-xs'}>
            {diferenciaUsd > 0
              ? `Sube ${diferenciaUsd.toFixed(2)} $ sobre lo aprobado.`
              : `Baja ${Math.abs(diferenciaUsd).toFixed(2)} $ respecto a lo aprobado.`}{' '}
            {compra.directa
              ? 'Una compra directa no pasa por la gerencia.'
              : vuelveAGerencia
                ? 'Pasa de 100 $: al guardar, esta orden se cancela y el pedido vuelve a la gerencia para que lo apruebe otra vez.'
                : 'Dentro de los 100 $: la orden sigue aprobada.'}
          </p>
        ) : (
          <p className="text-ink/55 mt-2 text-xs">
            Cambiaste la moneda: la cuenta de los 100 $ la hace la base al guardar.
          </p>
        )}
      </div>

      <Textarea
        label="Por qué se edita"
        className="mt-4"
        rows={2}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        hint="Queda en la bitácora de la compra y en el registro de auditoría, con tu nombre."
      />

      {editar.error ? <ErrorDeCarga error={editar.error} className="mt-4" /> : null}
    </Modal>
  )
}
