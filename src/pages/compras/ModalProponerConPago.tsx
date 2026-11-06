import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { CamposDePago } from '@/components/CamposDePago'
import { useProponerConPago } from '@/lib/api/compras'
import type { Cotizacion, DatosPago } from '@/lib/api/compras'
import { useMetodosPago, opcionesDe } from '@/lib/api/metodosPago'
import { dinero } from '@/lib/formato'
import { cn } from '@/lib/cn'

/*
  PROPONER UNA COTIZACIÓN, CON EL PAGO YA DICHO.

  Flujo nuevo (Angélica, 06/11/2026): «compras cotiza y coloca el método y los
  datos del pago, aprueban». Antes el método se indicaba después de aprobar;
  ahora va con la propuesta, porque quien aprueba decide en el mismo paso si se
  paga, y para eso tiene que ver a quién y cómo.

  Lo que se pide:
  - con qué entrega el proveedor (factura o nota): sin esto la base no deja
    instruir ningún pago;
  - cómo se paga: los métodos en dinero, o con productos (intercambio);
  - en qué moneda: la de la cotización o bolívares a su tasa, que es la única
    conversión exacta sin la tasa del día de otra divisa;
  - los datos del beneficiario que pida ese método.
*/

const CON_PRODUCTOS = 'INTERCAMBIO'

export function ModalProponerConPago({
  solicitudId,
  cotizacion,
  onCerrar,
}: {
  solicitudId: number
  cotizacion: Cotizacion
  onCerrar: () => void
}) {
  const proponer = useProponerConPago()
  const { data: metodos } = useMetodosPago()

  const [comprobante, setComprobante] = useState<'NOTA_ENTREGA' | 'FACTURA' | ''>(
    cotizacion.pago_comprobante ?? '',
  )
  const [metodo, setMetodo] = useState(cotizacion.pago_metodo ?? 'TRANSFERENCIA')
  const [moneda, setMoneda] = useState(cotizacion.pago_moneda ?? cotizacion.moneda)
  const [datos, setDatos] = useState<DatosPago>(cotizacion.pago_datos ?? {})
  const [conIgtf, setConIgtf] = useState(cotizacion.pago_igtf ?? cotizacion.moneda !== 'VES')
  const [nota, setNota] = useState(cotizacion.pago_nota ?? '')

  const conProductos = metodo === CON_PRODUCTOS
  const elegido = (metodos ?? []).find((m) => m.codigo === metodo)

  const opcionesMetodo = useMemo(
    () => [...opcionesDe(metodos), { valor: CON_PRODUCTOS, etiqueta: 'Con productos (intercambio)' }],
    [metodos],
  )

  /* La moneda de la cotización y bolívares, filtradas por lo que admite el método. */
  const monedas = useMemo(() => {
    const posibles = [...new Set([cotizacion.moneda, 'VES'])]
    return posibles
      .filter((m) => {
        if (!elegido) return true
        if (elegido.moneda_regla === 'SOLO_VES') return m === 'VES'
        if (elegido.moneda_regla === 'NUNCA_VES') return m !== 'VES'
        return true
      })
      .map((m) => ({ valor: m, etiqueta: m === 'VES' ? 'Bolívares (VES)' : m }))
  }, [cotizacion.moneda, elegido])

  // Si el método nuevo no admite la moneda puesta, se pasa a la primera que sí.
  useEffect(() => {
    if (conProductos) return
    if (monedas.length > 0 && !monedas.some((m) => m.valor === moneda)) {
      setMoneda(monedas[0].valor)
      setConIgtf(monedas[0].valor !== 'VES')
    }
  }, [monedas, moneda, conProductos])

  const totalEnLaMoneda =
    moneda === cotizacion.moneda ? Number(cotizacion.total) : Number(cotizacion.total_bs)

  const guardar = async () => {
    await proponer.mutateAsync({
      solicitud_id: solicitudId,
      cotizacion_id: cotizacion.id,
      metodo,
      moneda: conProductos ? cotizacion.moneda : moneda,
      datos: conProductos ? {} : datos,
      comprobante: comprobante as 'NOTA_ENTREGA' | 'FACTURA',
      igtf: conProductos ? false : conIgtf,
      nota,
    })
    onCerrar()
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Proponer para aprobar"
      descripcion={`${cotizacion.proveedor?.nombre ?? 'Proveedor'} · ${dinero(cotizacion.moneda, cotizacion.total)} · ${cotizacion.numero}`}
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={proponer.isPending || !comprobante}>
            {proponer.isPending ? 'Enviando…' : 'Proponer para aprobar'}
          </Button>
        </>
      }
    >
      <div>
        <p className="text-ink/85 text-sm font-medium">¿Con qué entrega el proveedor?</p>
        <p className="text-ink/55 mt-0.5 text-xs">
          Solo la factura da derecho al crédito fiscal y entra en el libro de compras.
        </p>
        <div className="mt-2 flex gap-2">
          {(['NOTA_ENTREGA', 'FACTURA'] as const).map((t) => (
            <Button
              key={t}
              size="sm"
              variant={comprobante === t ? 'primary' : 'outline'}
              onClick={() => setComprobante(t)}
            >
              {t === 'FACTURA' ? 'Factura' : 'Nota de entrega'}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Select
          label="Cómo se paga"
          value={metodo}
          onChange={(e) => {
            setMetodo(e.target.value)
            setDatos({})
          }}
          opciones={opcionesMetodo}
        />
        {conProductos ? (
          <p className="text-ink/55 text-xs leading-relaxed sm:mt-6">
            Se paga con material de la empresa. Después de aprobar, Compras lo registra con «Pagar con
            material», que manda la salida al almacén.
          </p>
        ) : (
          <Select
            label="Moneda"
            value={moneda}
            onChange={(e) => {
              setMoneda(e.target.value)
              setConIgtf(e.target.value !== 'VES')
            }}
            opciones={monedas}
            hint={`Total a pagar: ${dinero(moneda, totalEnLaMoneda)}`}
          />
        )}
      </div>

      {conProductos ? null : (
        <>
          <label
            className={cn(
              'mt-4 flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm',
              conIgtf ? 'border-warning/30 bg-warning-soft' : 'border-hairline',
            )}
          >
            <input
              type="checkbox"
              checked={conIgtf}
              onChange={(e) => setConIgtf(e.target.checked)}
              className="accent-royal-600 mt-0.5 size-4 shrink-0"
            />
            <span className="text-ink/80">
              Causa <strong>IGTF del 3%</strong>
              <span className="text-ink/50"> — se marca solo en divisas; se puede quitar.</span>
            </span>
          </label>

          <h3 className="text-ink/85 mt-5 mb-2 text-sm font-semibold">Datos del beneficiario</h3>
          <CamposDePago
            metodo={elegido}
            datos={datos}
            onCambiar={(c) => setDatos((d) => ({ ...d, ...c }))}
          />
        </>
      )}

      <Textarea
        label="Nota para quien aprueba"
        className="mt-4"
        rows={2}
        placeholder="Opcional: por qué esta oferta, plazo de entrega, condiciones…"
        value={nota}
        onChange={(e) => setNota(e.target.value)}
      />

      {proponer.error ? <ErrorDeCarga error={proponer.error} className="mt-4" /> : null}
    </Modal>
  )
}
