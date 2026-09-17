import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { documento } from '@/lib/formato'
import { useAlicuotaIva } from '@/lib/api/empresa'
import { useAlmacenes, useExistencias } from '@/lib/api/inventario'
import { useMonedasUsables, useTasaVigente } from '@/lib/api/tasas'
import { CONDICIONES_PAGO, useClientes, usePrecios } from '@/lib/api/ventas'
import { useFacturarDirecto } from '@/lib/api/facturacion'
import { Renglones } from '@/pages/ventas/Renglones'
import { Totales } from '@/pages/ventas/Cotizaciones'
import { CasillaIva } from '@/pages/ventas/CasillaIva'
import { CasillaIgtf } from '@/pages/ventas/CasillaIgtf'
import { IGTF_POR_DEFECTO, tributoElegido, useIvaPorDefecto } from '@/pages/ventas/ivaPorDefecto'
import {
  aRenglones,
  faltaEnFila,
  filaVacia,
  gravadoDe,
  repreciar,
  subtotalDe,
  type FilaRenglon,
} from '@/pages/ventas/filas'

/*
  LA FACTURA SIN NOTA DE ENTREGA

  Christopher, 17/09/2026: «independizar más las notas de entrega y las
  facturas: que se pueda crear una factura sin necesidad de nota de entrega y
  viceversa». Hasta entonces una factura solo nacía de notas.

  Sus respuestas deciden el formulario:

    - el material SALE DEL PATIO al emitirla, con patio por renglón como en el
      despacho. Es la casilla de arriba, marcada;
    - si se desmarca, la factura no toca el patio y el material sale después con
      notas de entrega que se enlazan a ella desde la nota. Una factura que ya
      sacó el material no admite notas: se descontaría dos veces;
    - IVA e IGTF son casillas, el IVA marcado y el IGTF no, y «las facturas sí o
      sí tendrán IVA o IGTF»: sin ninguno no se emite.
*/
export function ModalFacturaDirecta({
  onCerrar,
  onEmitida,
}: {
  onCerrar: () => void
  onEmitida?: (id: number) => void
}) {
  const monedas = useMonedasUsables()
  const { data: clientes } = useClientes(true)
  const { data: precios } = usePrecios()
  const { data: almacenes } = useAlmacenes()
  const { data: tasaHoy } = useTasaVigente()
  const { data: existencias } = useExistencias(undefined, true)
  const facturar = useFacturarDirecto()
  const ivaPorDefecto = useIvaPorDefecto()
  const alicuotaVigente = useAlicuotaIva()

  const [clienteId, setClienteId] = useState('')
  const [moneda, setMoneda] = useState('USD')
  const [condicion, setCondicion] = useState('')
  const [sacaMaterial, setSacaMaterial] = useState(true)
  const [almacenId, setAlmacenId] = useState('')
  const [observacion, setObservacion] = useState('')
  const [filas, setFilas] = useState<FilaRenglon[]>([filaVacia()])
  const [conIva, setConIva] = useState(ivaPorDefecto)
  const [ivaEscrito, setIvaEscrito] = useState<string | null>(null)
  const [conIgtf, setConIgtf] = useState(false)
  const [igtfEscrito, setIgtfEscrito] = useState<string | null>(null)

  const cliente = clientes?.find((c) => String(c.id) === clienteId)
  const iva = tributoElegido({
    aplica: conIva,
    escrito: ivaEscrito,
    porDefecto: alicuotaVigente,
    exento: cliente?.exento_iva,
  })
  const igtf = tributoElegido({ aplica: conIgtf, escrito: igtfEscrito, porDefecto: IGTF_POR_DEFECTO })
  // La base lo exige igual; aquí se dice antes de gastar el viaje.
  const sinTributo = !!cliente && !cliente.exento_iva && iva.vale === 0 && igtf.vale === 0

  const porPatio: Record<string, Record<number, number>> = {}
  for (const e of existencias ?? []) {
    const deEse = (porPatio[String(e.almacen_id)] ??= {})
    deEse[e.articulo_id] = Number(e.existencia)
  }
  const opcionesDePatio = (almacenes ?? []).map((a) => ({ valor: String(a.id), etiqueta: a.nombre }))

  // Lo que se ve es un adelanto: la cifra buena la calcula la base al emitir.
  const subtotal = subtotalDe(filas)
  const montoIva = Math.round(gravadoDe(filas) * iva.vale) / 100
  const montoIgtf = Math.round((subtotal + montoIva) * igtf.vale) / 100
  const total = subtotal + montoIva + montoIgtf
  const incompletas = filas.some((f) => faltaEnFila(f, precios ?? []) !== null)

  const cambiarMoneda = (nueva: string) => {
    setMoneda(nueva)
    setFilas((actuales) => repreciar(actuales, precios ?? [], nueva, Number(tasaHoy?.tasa ?? 0)))
  }

  return (
    <Modal
      abierto
      ancho="lg"
      onCerrar={onCerrar}
      titulo="Factura sin nota de entrega"
      descripcion="Con sus propios renglones. Si el material sale con ella, se descuenta del patio al emitirla; si no, sale después con notas de entrega que se enlazan a esta factura."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={
              facturar.isPending ||
              !clienteId ||
              incompletas ||
              iva.malo ||
              igtf.malo ||
              sinTributo ||
              aRenglones(filas).length === 0
            }
            onClick={async () => {
              const id = await facturar.mutateAsync({
                cliente_id: Number(clienteId),
                renglones: aRenglones(filas).map((r) => (sacaMaterial ? r : { ...r, almacen_id: null })),
                moneda,
                condicion_pago: condicion || null,
                observacion: observacion || null,
                alicuota_iva: iva.vale,
                alicuota_igtf: igtf.vale,
                saca_material: sacaMaterial,
                almacen_id: sacaMaterial && almacenId ? Number(almacenId) : null,
              })
              onEmitida?.(id)
              onCerrar()
            }}
          >
            {facturar.isPending ? 'Emitiendo…' : 'Emitir la factura'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <SelectBuscable
            label="Cliente"
            vacio="Elige el cliente"
            valor={clienteId}
            onCambio={(v) => {
              setClienteId(v)
              const c = clientes?.find((x) => String(x.id) === v)
              if (c) cambiarMoneda(c.moneda_preferida)
            }}
            opciones={(clientes ?? []).map((c) => ({
              valor: String(c.id),
              etiqueta: `${c.nombre} · ${documento(c.rif)}`,
            }))}
          />
        </div>
        <Select
          label="Moneda"
          value={moneda}
          onChange={(e) => cambiarMoneda(e.target.value)}
          opciones={monedas.data ?? []}
        />
        <div className="sm:col-span-3">
          <Select
            label="Condición de pago"
            vacio="La que tenga el cliente"
            value={condicion}
            onChange={(e) => setCondicion(e.target.value)}
            opciones={CONDICIONES_PAGO}
            hint="A crédito, el sistema comprueba el límite del cliente antes de emitir."
          />
        </div>
      </div>

      <div className="border-hairline mt-4 rounded-[6px] border p-3">
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={sacaMaterial}
            onChange={(e) => setSacaMaterial(e.target.checked)}
            className="accent-royal-600 mt-0.5 size-4 shrink-0"
          />
          <span>
            <span className="text-ink/85 text-sm font-medium">
              El material sale del patio con esta factura
            </span>
            <span className="text-ink/50 mt-0.5 block text-xs leading-relaxed">
              {sacaMaterial
                ? 'Se descuenta al emitirla. A esta factura no se le podrán enlazar notas de entrega: el material ya salió.'
                : 'No toca el patio. El material sale después con notas de entrega, que se enlazan a esta factura desde la nota.'}
            </span>
          </span>
        </label>

        {sacaMaterial ? (
          <div className="mt-3">
            <SelectBuscable
              label="De qué patio sale"
              vacio="Elige el patio o almacén"
              valor={almacenId}
              onCambio={(v) => setAlmacenId(v)}
              opciones={opcionesDePatio}
              hint="Si un renglón sale de otro patio, se elige en el renglón. Un servicio, como un flete, no sale de ninguno."
            />
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        <Renglones
          filas={filas}
          onCambiar={setFilas}
          precios={precios ?? []}
          moneda={moneda}
          patios={
            sacaMaterial
              ? {
                  opciones: opcionesDePatio,
                  deLaNota: almacenId,
                  existencias: (id) => (existencias ? (porPatio[id] ?? {}) : undefined),
                }
              : undefined
          }
        />
      </div>

      <Textarea
        label="Observación"
        className="mt-4"
        rows={2}
        value={observacion}
        onChange={(e) => setObservacion(e.target.value)}
      />

      {cliente?.exento_iva ? (
        <p className="text-ink/55 mt-4 text-sm">
          {cliente.nombre} es exento de IVA: la factura sale sin IVA.
        </p>
      ) : (
        <CasillaIva
          aplica={conIva}
          onCambiar={setConIva}
          alicuota={ivaEscrito ?? String(alicuotaVigente)}
          onAlicuota={setIvaEscrito}
          className="mt-4"
        />
      )}

      <CasillaIgtf
        aplica={conIgtf}
        onCambiar={setConIgtf}
        alicuota={igtfEscrito ?? undefined}
        onAlicuota={setIgtfEscrito}
        className="mt-3"
      />

      {sinTributo ? (
        <p className="text-warning mt-2 text-sm">
          Una factura lleva IVA, IGTF o los dos: marca al menos uno.
        </p>
      ) : null}

      <div className="bg-ink/4 rounded-card mt-4 p-4">
        <Totales
          moneda={moneda}
          subtotal={subtotal}
          descuento={0}
          flete={0}
          alicuota={iva.vale}
          iva={montoIva}
          alicuotaIgtf={igtf.vale}
          igtf={montoIgtf}
          total={total}
          sinIva={iva.vale === 0}
        />
      </div>

      {facturar.error ? <ErrorDeCarga error={facturar.error} className="mt-4" /> : null}
    </Modal>
  )
}
