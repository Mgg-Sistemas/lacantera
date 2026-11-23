import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import {
  type FacturaPendienteRetencion,
  type TipoImpuestoRetencion,
  IMPUESTOS_DISPONIBLES,
  useRegistrarRetencion,
} from '@/lib/api/retenciones'
import { AlertCircle, FileCheck } from 'lucide-react'

interface Props {
  abierta: boolean
  onCerrar: () => void
  facturaPrevia?: FacturaPendienteRetencion | null
}

export function ModalRegistrarRetencion({ abierta, onCerrar, facturaPrevia }: Props) {
  const registrar = useRegistrarRetencion()

  const [tipoImpuesto, setTipoImpuesto] = useState<TipoImpuestoRetencion>('IVA')
  const [ordenNumero, setOrdenNumero] = useState('')
  const [proveedorNombre, setProveedorNombre] = useState('')
  const [proveedorRif, setProveedorRif] = useState('')
  const [proveedorEmail, setProveedorEmail] = useState('')
  const [proveedorDireccion, setProveedorDireccion] = useState('')
  const [proveedorTelefono, setProveedorTelefono] = useState('')

  const [facturaNumero, setFacturaNumero] = useState('')
  const [facturaControl, setFacturaControl] = useState('')
  const [facturaFecha, setFacturaFecha] = useState(new Date().toISOString().slice(0, 10))
  const [fechaEmision, setFechaEmision] = useState(new Date().toISOString().slice(0, 10))
  const [fechaEntrega, setFechaEntrega] = useState('')

  const [moneda, setMoneda] = useState('USD')
  const [tasa, setTasa] = useState(1)
  const [totalFactura, setTotalFactura] = useState(0)
  const [exento, setExento] = useState(0)
  const [sinDerechoIva, setSinDerechoIva] = useState(0)
  const [baseImponible, setBaseImponible] = useState(0)
  const [alicuotaPct, setAlicuotaPct] = useState(75) // Para IVA 75% o 100%; para ISLR 2%
  const [impuestoCausado, setImpuestoCausado] = useState(0)
  const [montoRetenido, setMontoRetenido] = useState(0)

  const [yaPagada, setYaPagada] = useState(false)
  const [observacion, setObservacion] = useState('')

  // Sincronizar cuando se pasa una factura previa
  useEffect(() => {
    if (facturaPrevia) {
      setOrdenNumero(facturaPrevia.orden_numero || '')
      setProveedorNombre(facturaPrevia.proveedor_nombre || '')
      setProveedorRif(facturaPrevia.proveedor_rif || '')
      setProveedorEmail(facturaPrevia.proveedor_email || '')
      setProveedorTelefono(facturaPrevia.proveedor_telefono || '')
      setFacturaNumero(facturaPrevia.factura_numero || '')
      setFacturaControl(facturaPrevia.factura_control || '')
      setFacturaFecha(facturaPrevia.factura_fecha || new Date().toISOString().slice(0, 10))
      setMoneda(facturaPrevia.moneda || 'USD')
      setTasa(facturaPrevia.tasa || 1)
      setTotalFactura(facturaPrevia.total || 0)
      setBaseImponible(facturaPrevia.base_imponible || 0)
      setImpuestoCausado(facturaPrevia.iva || 0)
      setYaPagada(facturaPrevia.ya_pagada || false)

      // Cálculo por defecto según tipo
      if (tipoImpuesto === 'IVA') {
        setAlicuotaPct(75)
        setMontoRetenido(Math.round(facturaPrevia.iva * 0.75 * 100) / 100)
      } else if (tipoImpuesto === 'ISLR') {
        setAlicuotaPct(2)
        setMontoRetenido(Math.round(facturaPrevia.base_imponible * 0.02 * 100) / 100)
      } else {
        setAlicuotaPct(1)
        setMontoRetenido(Math.round(facturaPrevia.base_imponible * 0.01 * 100) / 100)
      }
    }
  }, [facturaPrevia, abierta])

  // Recalcular montos al cambiar impuesto o alícuota
  const recalcular = (imp: TipoImpuestoRetencion, ali: number, base: number, impCaus: number) => {
    setTipoImpuesto(imp)
    setAlicuotaPct(ali)
    if (imp === 'IVA') {
      const ret = Math.round(impCaus * (ali / 100) * 100) / 100
      setMontoRetenido(ret)
    } else {
      const ret = Math.round(base * (ali / 100) * 100) / 100
      setMontoRetenido(ret)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!facturaNumero.trim()) return

    await registrar.mutateAsync({
      orden_id: facturaPrevia?.orden_id ?? null,
      orden_numero: ordenNumero || null,
      proveedor_id: facturaPrevia?.proveedor_id ?? 1,
      proveedor_nombre: proveedorNombre || 'Proveedor General',
      proveedor_rif: proveedorRif || 'J-00000000-0',
      proveedor_email: proveedorEmail || null,
      proveedor_direccion: proveedorDireccion || null,
      proveedor_telefono: proveedorTelefono || null,
      factura_numero: facturaNumero,
      factura_control: facturaControl || null,
      factura_fecha: facturaFecha,
      fecha_emision: fechaEmision,
      fecha_entrega: fechaEntrega || null,
      tipo_impuesto: tipoImpuesto,
      moneda,
      tasa,
      total_factura: Number(totalFactura) || 0,
      monto_sin_derecho_credito_iva: Number(sinDerechoIva) || 0,
      monto_exento: Number(exento) || 0,
      base_imponible: Number(baseImponible) || 0,
      alicuota_pct: Number(alicuotaPct) || 0,
      impuesto_causado: Number(impuestoCausado) || 0,
      monto_retenido: Number(montoRetenido) || 0,
      ya_pagada: yaPagada,
      observacion: observacion || null,
    })

    onCerrar()
  }

  return (
    <Modal abierto={abierta} onCerrar={onCerrar} titulo="Emitir Comprobante de Retención (G.O. 43.484)">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Banner Informativo si es Post-Pago */}
        {yaPagada ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 text-xs flex gap-2.5 items-start">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-950">Orden de compra ya pagada al 100%</p>
              <p className="mt-0.5 text-amber-800 leading-relaxed">
                Esta compra ya fue cancelada al proveedor. La retención se emitirá conforme a la ley y quedará
                registrada como <strong>REINTEGRO PENDIENTE</strong> por cobrar al proveedor. El sistema rastreará los
                días en espera hasta que el dinero ingrese a Tesorería.
              </p>
            </div>
          </div>
        ) : null}

        {/* Tipo de Impuesto */}
        <div className="grid grid-cols-3 gap-2">
          {IMPUESTOS_DISPONIBLES.map((t) => (
            <button
              key={t.tipo}
              type="button"
              onClick={() => {
                const aliDef = t.tipo === 'IVA' ? 75 : t.tipo === 'ISLR' ? 2 : 1
                recalcular(t.tipo, aliDef, baseImponible, impuestoCausado)
              }}
              className={`p-2.5 rounded-lg border text-left transition-all ${
                tipoImpuesto === t.tipo
                  ? 'border-[#8c2f1f] bg-[#8c2f1f]/5 text-[#8c2f1f] font-semibold'
                  : 'border-stone-200 hover:border-stone-300 text-stone-700'
              }`}
            >
              <div className="text-xs font-bold">{t.tipo}</div>
              <div className="text-[11px] text-stone-500 truncate">{t.nombre}</div>
            </button>
          ))}
        </div>

        {/* Datos del Documento */}
        <div className="rounded-lg border border-stone-200 bg-stone-50/50 p-3 space-y-3">
          <p className="text-xs font-semibold text-stone-700 uppercase tracking-wider">Factura del Proveedor</p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Proveedor"
              value={proveedorNombre}
              onChange={(e) => setProveedorNombre(e.target.value)}
              required
            />
            <Input
              label="RIF del Proveedor"
              value={proveedorRif}
              onChange={(e) => setProveedorRif(e.target.value)}
              placeholder="J-12345678-9"
              required
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="N° Factura"
              value={facturaNumero}
              onChange={(e) => setFacturaNumero(e.target.value)}
              placeholder="000123"
              required
            />
            <Input
              label="N° Control"
              value={facturaControl}
              onChange={(e) => setFacturaControl(e.target.value)}
              placeholder="00-000123"
            />
            <Input
              label="Fecha Factura"
              type="date"
              value={facturaFecha}
              onChange={(e) => setFacturaFecha(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Correo Fiscal Proveedor (Art. 18.4)"
              type="email"
              value={proveedorEmail}
              onChange={(e) => setProveedorEmail(e.target.value)}
              placeholder="facturacion@proveedor.com"
            />
            <Input
              label="Teléfono / Contacto"
              value={proveedorTelefono}
              onChange={(e) => setProveedorTelefono(e.target.value)}
              placeholder="0414-0000000"
            />
          </div>
          <Input
            label="Domicilio Fiscal del Proveedor"
            value={proveedorDireccion}
            onChange={(e) => setProveedorDireccion(e.target.value)}
            placeholder="Ciudad, Estado, Dirección..."
          />
        </div>

        {/* Montos y Cálculos de Retención */}
        <div className="rounded-lg border border-stone-200 bg-white p-3 space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-xs font-semibold text-stone-700 uppercase tracking-wider">Cálculo de la Retención</p>
            <div className="text-xs text-stone-500">
              Moneda: <strong>{moneda}</strong> | Tasa: Bs. {tasa.toFixed(2)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Monto Exento / Exonerado"
              type="number"
              step="0.01"
              value={exento || ''}
              onChange={(e) => setExento(Number(e.target.value) || 0)}
            />
            <Input
              label="Sin Derecho a Crédito IVA"
              type="number"
              step="0.01"
              value={sinDerechoIva || ''}
              onChange={(e) => setSinDerechoIva(Number(e.target.value) || 0)}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Base Imponible"
              type="number"
              step="0.01"
              value={baseImponible || ''}
              onChange={(e) => {
                const b = Number(e.target.value) || 0
                setBaseImponible(b)
                recalcular(tipoImpuesto, alicuotaPct, b, impuestoCausado)
              }}
              required
            />
            <Input
              label={tipoImpuesto === 'IVA' ? 'IVA Facturado (Causado)' : 'Impuesto Causado'}
              type="number"
              step="0.01"
              value={impuestoCausado || ''}
              onChange={(e) => {
                const ic = Number(e.target.value) || 0
                setImpuestoCausado(ic)
                recalcular(tipoImpuesto, alicuotaPct, baseImponible, ic)
              }}
              required
            />
            <Input
              label="% Retención"
              type="number"
              step="1"
              value={alicuotaPct || ''}
              onChange={(e) => {
                const ali = Number(e.target.value) || 0
                setAlicuotaPct(ali)
                recalcular(tipoImpuesto, ali, baseImponible, impuestoCausado)
              }}
              required
            />
          </div>

          {/* Resultado del Monto Retenido */}
          <div className="p-3 bg-stone-100 rounded-lg flex justify-between items-center">
            <div>
              <p className="text-xs text-stone-600 font-medium">Monto del Impuesto Retenido:</p>
              <p className="text-lg font-bold text-[#8c2f1f]">
                {montoRetenido.toLocaleString('es-VE', { minimumFractionDigits: 2 })} {moneda}
              </p>
            </div>
            {moneda !== 'BS' ? (
              <div className="text-right">
                <p className="text-[11px] text-stone-500">Equivalente en moneda nacional:</p>
                <p className="text-sm font-semibold text-stone-800">
                  Bs. {(Math.round(montoRetenido * tasa * 100) / 100).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Fechas de Emisión y Entrega (Art. 18.3) */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Fecha Emisión Comprobante"
            type="date"
            value={fechaEmision}
            onChange={(e) => setFechaEmision(e.target.value)}
            required
          />
          <Input
            label="Fecha Entrega (Opcional, Art. 18.3)"
            type="date"
            value={fechaEntrega}
            onChange={(e) => setFechaEntrega(e.target.value)}
            placeholder="Dejar vacía si aún no se entregó"
          />
        </div>

        <Textarea
          label="Observaciones (Opcional)"
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
          placeholder="Comentario sobre la retención o motivo especial..."
          rows={2}
        />

        {registrar.error ? <ErrorDeCarga error={registrar.error} /> : null}

        <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
          <Button variant="outline" type="button" onClick={onCerrar} disabled={registrar.isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={registrar.isPending} icon={<FileCheck className="w-4 h-4" />}>
            {registrar.isPending ? 'Emitiendo...' : 'Emitir comprobante R14'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
