import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { CONDICIONES_PAGO, useProveedores } from '@/lib/api/catalogo'
import { useRegistrarCotizacion } from '@/lib/api/compras'
import type { Compra } from '@/lib/api/compras'
import { useTasaVigente, hoyEnCaracas } from '@/lib/api/tasas'
import { bolivares, dolares, tasa as fmtTasa } from '@/lib/formato'

interface Props {
  abierto: boolean
  onCerrar: () => void
  compra: Compra
}

interface Precio {
  cantidad: string
  precio: string
  exento: boolean
}

export function ModalCotizacion({ abierto, onCerrar, compra }: Props) {
  const { data: proveedores } = useProveedores()
  const { data: tasaVigente } = useTasaVigente()
  const registrar = useRegistrarCotizacion()

  const [proveedorId, setProveedorId] = useState('')
  const [numeroProveedor, setNumeroProveedor] = useState('')
  const [fecha, setFecha] = useState(hoyEnCaracas())
  const [moneda, setMoneda] = useState('USD')
  const [condicionPago, setCondicionPago] = useState('CONTADO')
  const [diasEntrega, setDiasEntrega] = useState('')
  const [validez, setValidez] = useState('15')
  const [alicuota, setAlicuota] = useState('16')
  const [descuento, setDescuento] = useState('0')
  const [flete, setFlete] = useState('0')
  const [observacion, setObservacion] = useState('')

  const [precios, setPrecios] = useState<Record<number, Precio>>(() =>
    Object.fromEntries(
      compra.renglones.map((r) => [r.id, { cantidad: r.cantidad, precio: '', exento: false }]),
    ),
  )

  const cambiar = (id: number, cambios: Partial<Precio>) =>
    setPrecios((p) => ({ ...p, [id]: { ...p[id], ...cambios } }))

  // Espejo del cálculo que hace la base. Existe para que quien carga la
  // cotización vea el total antes de guardar; el que vale es el de Postgres.
  const totales = useMemo(() => {
    let subtotal = 0
    let gravado = 0

    for (const r of compra.renglones) {
      const p = precios[r.id]
      if (!p) continue
      const linea = Number(p.cantidad || 0) * Number(p.precio || 0)
      if (!Number.isFinite(linea)) continue
      subtotal += linea
      if (!p.exento) gravado += linea
    }

    const desc = Number(descuento || 0)
    const flt = Number(flete || 0)
    const base = (subtotal > 0 ? Math.max(gravado - desc * (gravado / subtotal), 0) : 0) + flt
    const iva = (base * Number(alicuota || 0)) / 100

    return { subtotal, base, iva, total: subtotal - desc + flt + iva }
  }, [compra.renglones, precios, descuento, flete, alicuota])

  const guardar = async () => {
    await registrar.mutateAsync({
      solicitud_id: compra.id,
      proveedor_id: Number(proveedorId),
      moneda,
      numero_proveedor: numeroProveedor,
      fecha,
      validez_dias: Number(validez) || 15,
      dias_entrega: diasEntrega ? Number(diasEntrega) : null,
      condicion_pago: condicionPago,
      alicuota_iva: Number(alicuota) || 0,
      descuento: Number(descuento) || 0,
      flete: Number(flete) || 0,
      observacion,
      renglones: compra.renglones
        .filter((r) => Number(precios[r.id]?.precio) >= 0 && precios[r.id]?.precio !== '')
        .map((r) => ({
          solicitud_renglon_id: r.id,
          cantidad: Number(precios[r.id].cantidad),
          precio_unitario: Number(precios[r.id].precio),
          exento_iva: precios[r.id].exento,
        })),
    })
    onCerrar()
  }

  const enDivisa = moneda !== 'VES'
  const formato = enDivisa ? dolares : bolivares

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Cotización del proveedor"
      descripcion="Se carga tal como la mandó el proveedor. Cargar otra del mismo proveedor sustituye a esta."
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={!proveedorId || registrar.isPending}>
            {registrar.isPending ? 'Guardando…' : 'Guardar cotización'}
          </Button>
        </>
      }
    >
      {!tasaVigente ? (
        <div className="border-warning/30 bg-warning-soft mb-4 rounded-[6px] border p-3 text-sm">
          <p className="text-ink/80">
            No hay tasa del BCV registrada. Sin ella no se puede valorar la cotización.{' '}
            <Link to="/app/tasas" className="text-royal-600 dark:text-royal-300 font-medium underline">
              Registrar la tasa de hoy
            </Link>
          </p>
        </div>
      ) : (
        <p className="text-ink/50 mb-4 text-xs">
          Se congelará con la tasa BCV del {new Date(`${tasaVigente.fecha}T12:00`).toLocaleDateString('es-VE')}:{' '}
          <span className="tabular">Bs {fmtTasa(tasaVigente.tasa)}</span> por dólar
          {tasaVigente.arrastrada ? ' (arrastrada de un día anterior)' : ''}.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Proveedor"
          vacio="Elige el proveedor"
          value={proveedorId}
          onChange={(e) => {
            setProveedorId(e.target.value)
            const p = proveedores?.find((x) => String(x.id) === e.target.value)
            if (p) {
              setMoneda(p.moneda_preferida)
              setCondicionPago(p.condicion_pago)
            }
          }}
          opciones={(proveedores ?? []).map((p) => ({
            valor: String(p.id),
            etiqueta: `${p.nombre} · ${p.rif}`,
          }))}
        />

        <Input
          label="N.º de cotización del proveedor"
          placeholder="Opcional"
          value={numeroProveedor}
          onChange={(e) => setNumeroProveedor(e.target.value)}
        />

        <Input label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />

        <Select
          label="Moneda"
          value={moneda}
          onChange={(e) => setMoneda(e.target.value)}
          opciones={[
            { valor: 'USD', etiqueta: 'Dólares' },
            { valor: 'VES', etiqueta: 'Bolívares' },
            { valor: 'EUR', etiqueta: 'Euros' },
          ]}
        />
      </div>

      <h3 className="text-ink/85 mt-6 mb-2 text-sm font-semibold">Precios por renglón</h3>

      <div className="space-y-2.5">
        {compra.renglones.map((r) => (
          <div key={r.id} className="border-hairline rounded-card border p-3">
            <p className="text-ink/85 text-sm font-medium">{r.descripcion}</p>
            <p className="text-ink/50 text-xs">
              Pedido: {r.cantidad} {r.unidad}
              {r.observacion ? ` · ${r.observacion}` : ''}
            </p>

            <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3">
              <Input
                label="Cantidad"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={precios[r.id]?.cantidad ?? ''}
                onChange={(e) => cambiar(r.id, { cantidad: e.target.value })}
              />
              <Input
                label="Precio unitario"
                type="number"
                min="0"
                step="0.000001"
                inputMode="decimal"
                value={precios[r.id]?.precio ?? ''}
                onChange={(e) => cambiar(r.id, { precio: e.target.value })}
              />
              <label className="text-ink/70 flex cursor-pointer items-center gap-2 self-end pb-2.5 text-sm select-none">
                <input
                  type="checkbox"
                  className="accent-royal-600 size-4"
                  checked={precios[r.id]?.exento ?? false}
                  onChange={(e) => cambiar(r.id, { exento: e.target.checked })}
                />
                Exento de IVA
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <Input
          label="Descuento"
          type="number"
          min="0"
          step="0.01"
          value={descuento}
          onChange={(e) => setDescuento(e.target.value)}
        />
        <Input
          label="Flete"
          type="number"
          min="0"
          step="0.01"
          value={flete}
          onChange={(e) => setFlete(e.target.value)}
        />
        <Input
          label="IVA %"
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={alicuota}
          onChange={(e) => setAlicuota(e.target.value)}
        />
        <Input
          label="Entrega en (días)"
          type="number"
          min="0"
          value={diasEntrega}
          onChange={(e) => setDiasEntrega(e.target.value)}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Select
          label="Condición de pago"
          value={condicionPago}
          onChange={(e) => setCondicionPago(e.target.value)}
          opciones={CONDICIONES_PAGO}
        />
        <Input
          label="Validez (días)"
          type="number"
          min="1"
          value={validez}
          onChange={(e) => setValidez(e.target.value)}
        />
      </div>

      <Textarea
        label="Observación"
        className="mt-4"
        rows={2}
        value={observacion}
        onChange={(e) => setObservacion(e.target.value)}
      />

      <div className="border-hairline bg-canvas rounded-card mt-5 border p-3.5">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink/60">Subtotal</dt>
            <dd className="tabular text-ink/80">{formato(totales.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink/60">Base imponible</dt>
            <dd className="tabular text-ink/80">{formato(totales.base)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink/60">IVA</dt>
            <dd className="tabular text-ink/80">{formato(totales.iva)}</dd>
          </div>
          <div className="border-hairline flex justify-between border-t pt-1.5">
            <dt className="text-ink/85 font-semibold">Total</dt>
            <dd className="tabular text-ink/90 font-semibold">{formato(totales.total)}</dd>
          </div>
        </dl>
      </div>

      {registrar.error ? <ErrorDeCarga error={registrar.error} className="mt-4" /> : null}
    </Modal>
  )
}
