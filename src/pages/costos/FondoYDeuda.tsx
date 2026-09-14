/*
  El fondo y la deuda.

  El fondo es dinero real: inicial + entregado − abonado. La deuda por origen
  es seguimiento interno, no la cuenta por pagar oficial, y así se rotula. El
  fondo asignado (presupuesto) sigue siendo el tope contra el que se compara
  el gasto: son dos números distintos que conviven bien.
*/
import { useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Wallet } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import {
  useDeudaPorOrigen,
  useOrigenesFondo,
  useRegistrarAbono,
  useRegistrarEntrega,
  type CajaCosto,
  type ResumenCaja,
} from '@/lib/api/costos'
import { useGuardarPresupuesto } from '@/lib/api/categoriasGasto'
import { useMonedasUsables } from '@/lib/api/tasas'
import { useMisPermisos } from '@/lib/api/usuarios'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { dolares, fecha as fmtFecha } from '@/lib/formato'
import { Cifra } from './Cifra'
import { dineroONada } from './formato'

export function FondoYDeuda({ caja, resumen }: { caja: CajaCosto; resumen: ResumenCaja | null }) {
  const { puede } = useMisPermisos()
  const puedeFondo = puede('COSTOS', 'TOTAL')
  const deuda = useDeudaPorOrigen()
  const [modal, setModal] = useState<'entrega' | 'abono' | 'asignar' | null>(null)

  const r = resumen
  const quedaria =
    r && r.costo_usd !== null
      ? r.fondo_usd - r.costo_usd - (r.ajustes_tardios_usd ?? 0)
      : null

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Cifra
          rotulo="Fondo de la caja"
          valor={r ? dolares(r.fondo_usd) : '—'}
          pie={
            r
              ? `Inicial ${dolares(r.caja.saldo_inicial_usd)} + entregado ${dolares(r.entregado_usd)} − abonado ${dolares(r.abonado_usd)}`
              : ''
          }
        />
        <Cifra
          rotulo="Si se pagara todo el costo"
          valor={dineroONada(quedaria)}
          pie="Fondo menos el costo devengado. Es lo que se arrastra a la siguiente caja."
          alerta={quedaria !== null && quedaria < 0}
          apagada={quedaria === null}
        />
        <Cifra
          rotulo="Fondo asignado"
          valor={r?.fondo_asignado_usd == null ? '—' : dolares(r.fondo_asignado_usd)}
          pie={
            r?.fondo_asignado_usd == null
              ? 'Sin fondo asignado en estas fechas: es el tope contra el que se compara el gasto.'
              : r.costo_usd === null
                ? 'Lo autorizado para gastar en estas fechas'
                : `Gastado el ${((r.costo_usd * 100) / r.fondo_asignado_usd).toFixed(1)} % de lo autorizado`
          }
          apagada={r?.fondo_asignado_usd == null}
        />
      </div>

      {puedeFondo ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setModal('entrega')}>
            <ArrowDownToLine className="size-4" />
            Registrar entrega
          </Button>
          <Button variant="outline" onClick={() => setModal('abono')}>
            <ArrowUpFromLine className="size-4" />
            Registrar abono
          </Button>
          <Button variant="ghost" onClick={() => setModal('asignar')}>
            <Wallet className="size-4" />
            Asignar fondo
          </Button>
        </div>
      ) : null}

      <Card flush className="mt-5">
        <div className="border-hairline border-b px-5 py-3">
          <CardHeader
            title="Deuda por origen"
            subtitle="Seguimiento interno: entregado menos abonado, en todas las cajas. No es la cuenta por pagar oficial."
          />
        </div>
        {deuda.error ? <ErrorDeCarga error={deuda.error} className="m-4" /> : null}
        {deuda.data && deuda.data.length === 0 ? (
          <Vacio icono={<Wallet />} titulo="Sin orígenes" descripcion="Cárgalos en Catálogos." />
        ) : null}
        {deuda.data && deuda.data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-2.5 font-medium">Origen</th>
                  <th className="px-5 py-2.5 text-right font-medium">Entregado</th>
                  <th className="px-5 py-2.5 text-right font-medium">Abonado</th>
                  <th className="px-5 py-2.5 text-right font-medium">Se le debe</th>
                </tr>
              </thead>
              <tbody className="divide-hairline divide-y">
                {deuda.data.map((d) => (
                  <tr key={d.origen_fondo}>
                    <td className="px-5 py-2.5">
                      <span className="text-ink/85">{d.nombre}</span>
                      {!d.genera_deuda ? (
                        <Chip tone="neutral" className="ml-2">
                          No genera deuda
                        </Chip>
                      ) : null}
                      {!d.activo ? (
                        <Chip tone="neutral" className="ml-2">
                          Apagado
                        </Chip>
                      ) : null}
                    </td>
                    <td className="tabular px-5 py-2.5 text-right">{dolares(d.entregado_usd)}</td>
                    <td className="tabular px-5 py-2.5 text-right">{dolares(d.abonado_usd)}</td>
                    <td className="tabular text-ink/85 px-5 py-2.5 text-right font-medium">
                      {d.genera_deuda ? dolares(d.deuda_usd) : <span className="text-ink/25">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {modal === 'entrega' || modal === 'abono' ? (
        <MoverFondo tipo={modal} onCerrar={() => setModal(null)} />
      ) : null}
      {modal === 'asignar' ? <AsignarFondo caja={caja} onCerrar={() => setModal(null)} /> : null}
    </>
  )
}

function MoverFondo({ tipo, onCerrar }: { tipo: 'entrega' | 'abono'; onCerrar: () => void }) {
  const entrega = useRegistrarEntrega()
  const abono = useRegistrarAbono()
  const origenes = useOrigenesFondo()
  const monedas = useMonedasUsables()
  const hoy = hoyEnCaracas()
  const accion = tipo === 'entrega' ? entrega : abono

  const [fecha, setFecha] = useState(hoy)
  const [origen, setOrigen] = useState('')
  const [moneda, setMoneda] = useState('USD')
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [nota, setNota] = useState('')

  const valido = fecha !== '' && fecha <= hoy && origen !== '' && Number(monto) > 0 && descripcion.trim().length >= 3

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={tipo === 'entrega' ? 'Registrar entrega de dinero' : 'Registrar abono'}
      descripcion={
        tipo === 'entrega'
          ? 'Dinero que alguien entregó para operar. Suma al fondo y, si el origen genera deuda, a lo que se le debe.'
          : 'Dinero que se le devolvió a un origen. Resta del fondo y de su deuda; no puede dejarla en negativo.'
      }
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={!valido || accion.isPending}
            onClick={async () => {
              await accion.mutateAsync({
                fecha,
                origen_fondo: origen,
                moneda,
                monto: Number(monto),
                descripcion: descripcion.trim(),
                nota: nota.trim() || null,
              })
              onCerrar()
            }}
          >
            {accion.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Fecha" type="date" max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <Select
          label="Origen"
          vacio="Elegir"
          value={origen}
          onChange={(e) => setOrigen(e.target.value)}
          opciones={(origenes.data ?? []).map((o) => ({ valor: o.codigo, etiqueta: o.nombre }))}
        />
        <Select
          label="Moneda"
          value={moneda}
          onChange={(e) => setMoneda(e.target.value)}
          opciones={(monedas.data ?? []).map((m) => ({ valor: m.valor, etiqueta: m.etiqueta }))}
        />
        <Input
          label="Monto"
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />
      </div>
      <div className="mt-4">
        <Input
          label="Qué es"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder={tipo === 'entrega' ? 'Entrega de la primera quincena' : 'Devolución parcial'}
        />
      </div>
      <div className="mt-4">
        <Textarea label="Nota (opcional)" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
      </div>
      {accion.error ? <ErrorDeCarga error={accion.error} className="mt-3" /> : null}
    </Modal>
  )
}

/*
  El fondo asignado no es un movimiento de dinero: es decir cuánto se autorizó
  gastar en un período. Por eso no pide origen ni moneda de tasa.
*/
function AsignarFondo({ caja, onCerrar }: { caja: CajaCosto; onCerrar: () => void }) {
  const guardar = useGuardarPresupuesto()
  const hoy = hoyEnCaracas()
  const [desde, setDesde] = useState(caja.fecha_inicio)
  const [hasta, setHasta] = useState(hoy)
  const [monto, setMonto] = useState('')
  const [nota, setNota] = useState('')
  const valido = Number(monto) > 0 && desde !== '' && hasta !== '' && hasta >= desde

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Asignar fondo"
      descripcion={`Lo autorizado para gastar entre dos fechas. No se mueve ni baja al registrar gastos: es el tope. La caja abierta va desde el ${fmtFecha(caja.fecha_inicio)}.`}
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={!valido || guardar.isPending}
            onClick={async () => {
              await guardar.mutateAsync({ desde, hasta, monto: Number(monto), nota: nota.trim() || null })
              onCerrar()
            }}
          >
            {guardar.isPending ? 'Guardando…' : 'Asignar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <Input label="Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
      </div>
      <div className="mt-4">
        <Input
          label="Monto asignado (USD)"
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />
      </div>
      <div className="mt-4">
        <Textarea label="Nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
      </div>
      {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-3" /> : null}
    </Modal>
  )
}
