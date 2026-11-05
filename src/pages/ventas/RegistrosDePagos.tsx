import { Fragment, useMemo, useState } from 'react'
import { Ban, ChevronDown, ChevronRight, Landmark, Link2, Pencil, Plus, Search, Upload, X } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { RangoDeFechas } from '@/components/RangoDeFechas'
import { SIN_RANGO, type Rango } from '@/components/rango'
import { dinero, fecha, tasa as formatoTasa } from '@/lib/formato'
import { enMayuscula } from '@/lib/texto'
import { useMisAcciones } from '@/lib/api/usuarios'
import { useMonedasUsables } from '@/lib/api/tasas'
import { leerMonto, leerPagosDelBanco, type FilaLeida } from '@/lib/leerPagosDelBanco'
import {
  useAnularPagoBancario,
  useAsociarNotas,
  useCambiarMontoAplicado,
  useGuardarPagoBancario,
  useImportarPagosBancarios,
  useNotasCandidatas,
  useNotasDePago,
  usePagosBancarios,
  useQuitarNotaDePago,
  type EstadoPago,
  type PagoBancario,
} from '@/lib/api/pagosBancarios'

/*
  REGISTROS DE PAGOS: CADA DEPÓSITO DEL BANCO Y LAS NOTAS QUE PAGA.

  Christopher, 06/11/2026: «que coteje las notas de entrega con los pagos
  registrados del banco… cuando se seleccione uno se desplieguen las notas de
  entrega relacionadas a ese pago… lo más simple posible». Una lista de pagos;
  al tocar uno se abre debajo con sus notas. Un pago puede cubrir varias notas.

  Ver es de cualquiera con Ventas. Registrar, importar, editar, anular y
  asociar es del permiso extendido VENTAS.REGISTRAR_PAGOS (ADMIN lo tiene
  siempre). No cobra notas ni toca Tesorería: solo relaciona.
*/

const ESTADOS: Record<EstadoPago, { etiqueta: string; tono: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  CUADRA: { etiqueta: 'Cuadra', tono: 'success' },
  MINIMA: { etiqueta: 'Diferencia mínima', tono: 'info' },
  DIFERENCIA: { etiqueta: 'No cuadra', tono: 'danger' },
  SIN_NOTAS: { etiqueta: 'Sin notas', tono: 'warning' },
  ANULADO: { etiqueta: 'Anulado', tono: 'neutral' },
}

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })

export function RegistrosDePagos() {
  const { data, isPending, error } = usePagosBancarios()
  const { puede } = useMisAcciones()
  const puedeRegistrar = puede('VENTAS.REGISTRAR_PAGOS')

  const [busca, setBusca] = useState('')
  const [estado, setEstado] = useState('')
  const [moneda, setMoneda] = useState('')
  const [montoDesde, setMontoDesde] = useState('')
  const [montoHasta, setMontoHasta] = useState('')
  const [rango, setRango] = useState<Rango>(SIN_RANGO)
  const [abierto, setAbierto] = useState<number | null>(null)
  const [editando, setEditando] = useState<PagoBancario | 'nuevo' | null>(null)
  const [importando, setImportando] = useState(false)

  const filtrados = useMemo(() => {
    const aguja = enMayuscula(busca.trim())
    const desde = montoDesde.trim() ? leerMonto(montoDesde) : null
    const hasta = montoHasta.trim() ? leerMonto(montoHasta) : null
    return (data ?? []).filter((p) => {
      if (estado && p.estado !== estado) return false
      if (!estado && p.estado === 'ANULADO') return false
      if (moneda && p.moneda !== moneda) return false
      if (rango.desde && p.fecha < rango.desde) return false
      if (rango.hasta && p.fecha > rango.hasta) return false
      if (desde != null && Number(p.monto) < desde) return false
      if (hasta != null && Number(p.monto) > hasta) return false
      if (!aguja) return true
      return [p.referencia, p.descripcion, p.numeros, p.clientes].some((x) =>
        enMayuscula(x ?? '').includes(aguja),
      )
    })
  }, [data, busca, estado, moneda, rango, montoDesde, montoHasta])

  const cuenta = (e: EstadoPago) => filtrados.filter((p) => p.estado === e).length
  const monedasEnLista = Array.from(new Set((data ?? []).map((p) => p.moneda)))

  return (
    <>
      <PageHeader
        title="Registros de pagos"
        description="Los pagos que llegaron al banco y las notas de entrega que cubre cada uno. Toque un pago para ver sus notas."
        actions={
          puedeRegistrar ? (
            <>
              <Button variant="outline" icon={<Upload />} onClick={() => setImportando(true)}>
                Importar del banco
              </Button>
              <Button icon={<Plus />} onClick={() => setEditando('nuevo')}>
                Registrar pago
              </Button>
            </>
          ) : null
        }
      />

      <Card className="mb-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="sm:col-span-2">
            <Input
              label="Buscar"
              icon={<Search />}
              placeholder="Referencia, descripción, NE o cliente"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Select
            label="Estado"
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            opciones={[
              { valor: '', etiqueta: 'Todos los vigentes' },
              ...Object.entries(ESTADOS).map(([valor, x]) => ({ valor, etiqueta: x.etiqueta })),
            ]}
          />
          <Select
            label="Moneda"
            value={moneda}
            onChange={(e) => setMoneda(e.target.value)}
            opciones={[
              { valor: '', etiqueta: 'Cualquiera' },
              ...monedasEnLista.map((m) => ({ valor: m, etiqueta: m === 'VES' ? 'Bolívares' : m === 'USD' ? 'Dólares' : m })),
            ]}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Monto desde" inputMode="decimal" value={montoDesde} onChange={(e) => setMontoDesde(e.target.value)} />
            <Input label="hasta" inputMode="decimal" value={montoHasta} onChange={(e) => setMontoHasta(e.target.value)} />
          </div>
        </div>
        <div className="mt-3">
          <RangoDeFechas valor={rango} onCambio={setRango} />
        </div>
      </Card>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && filtrados.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2 text-sm">
          <Chip>{filtrados.length} pagos</Chip>
          {(['CUADRA', 'MINIMA', 'DIFERENCIA', 'SIN_NOTAS'] as EstadoPago[]).map((e) =>
            cuenta(e) > 0 ? (
              <Chip key={e} tone={ESTADOS[e].tono}>
                {cuenta(e)} {ESTADOS[e].etiqueta.toLowerCase()}
              </Chip>
            ) : null,
          )}
        </div>
      ) : null}

      {data && filtrados.length === 0 ? (
        <Card>
          <Vacio
            icono={<Landmark />}
            titulo={data.length === 0 ? 'Sin pagos registrados' : 'Sin resultados'}
            descripcion={
              data.length === 0
                ? 'Registre un pago a mano o impórtelos desde la planilla del banco.'
                : 'Pruebe quitando algún filtro.'
            }
          />
        </Card>
      ) : null}

      {filtrados.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="w-8 px-3 py-3" />
                  <th className="px-3 py-3 font-medium">Fecha</th>
                  <th className="px-3 py-3 font-medium">Referencia · descripción</th>
                  <th className="px-3 py-3 text-right font-medium">Monto del banco</th>
                  <th className="px-3 py-3 font-medium">Notas</th>
                  <th className="px-5 py-3 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => {
                  const esteAbierto = abierto === p.id
                  return (
                    <Fragment key={p.id}>
                      <tr
                        onClick={() => setAbierto(esteAbierto ? null : p.id)}
                        className="border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors"
                      >
                        <td className="text-ink/40 px-3 py-3">
                          {esteAbierto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </td>
                        <td className="text-ink/75 px-3 py-3 whitespace-nowrap">{fecha(p.fecha)}</td>
                        <td className="px-3 py-3">
                          <p className="text-ink/85 font-medium">{p.referencia ? `REF ${p.referencia}` : 'Sin referencia'}</p>
                          {p.descripcion ? <p className="text-ink/50 line-clamp-1 text-xs">{p.descripcion}</p> : null}
                        </td>
                        <td className="tabular px-3 py-3 text-right whitespace-nowrap">
                          <span className="text-ink/90 font-medium">{dinero(p.moneda, p.monto)}</span>
                          {p.moneda !== 'USD' && p.monto_usd ? (
                            <span className="text-ink/45 block text-xs">{dinero('USD', p.monto_usd)}</span>
                          ) : null}
                        </td>
                        <td className="text-ink/70 px-3 py-3 text-xs">
                          {p.notas > 0 ? (
                            <>
                              <span className="text-ink/85 font-medium">{p.numeros}</span>
                              {p.clientes ? <span className="block">{p.clientes}</span> : null}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Chip tone={ESTADOS[p.estado].tono}>{ESTADOS[p.estado].etiqueta}</Chip>
                          {p.estado === 'MINIMA' || p.estado === 'DIFERENCIA' ? (
                            <span className="text-ink/50 tabular block pt-1 text-xs">
                              {Number(p.diferencia) > 0 ? 'Sobran ' : 'Faltan '}
                              {dinero(p.moneda, Math.abs(Number(p.diferencia)))}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                      {esteAbierto ? (
                        <tr className="border-hairline bg-ink/2 border-b">
                          <td colSpan={6} className="px-4 py-4 sm:px-6">
                            <DetalleDelPago
                              pago={p}
                              puedeRegistrar={puedeRegistrar}
                              onEditar={() => setEditando(p)}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {editando ? (
        <ModalPago pago={editando === 'nuevo' ? null : editando} onCerrar={() => setEditando(null)} />
      ) : null}
      {importando ? <ModalImportar onCerrar={() => setImportando(false)} /> : null}
    </>
  )
}

// ─────────────────────────────── el detalle ─────────────────────────────────

function DetalleDelPago({
  pago,
  puedeRegistrar,
  onEditar,
}: {
  pago: PagoBancario
  puedeRegistrar: boolean
  onEditar: () => void
}) {
  const { data, isPending, error } = useNotasDePago(pago.id)
  const cambiar = useCambiarMontoAplicado()
  const quitar = useQuitarNotaDePago()
  const anular = useAnularPagoBancario()
  const [asociando, setAsociando] = useState(false)
  const [anulando, setAnulando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [montos, setMontos] = useState<Record<number, string>>({})

  const vigente = pago.anulado_en == null
  const editable = puedeRegistrar && vigente

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span>
          <span className="text-ink/50">Banco: </span>
          <span className="text-ink/90 font-medium">{dinero(pago.moneda, pago.monto)}</span>
          {pago.tasa ? <span className="text-ink/45"> · tasa {formatoTasa(pago.tasa)}</span> : null}
        </span>
        <span>
          <span className="text-ink/50">Notas: </span>
          <span className="text-ink/90 font-medium">{dinero(pago.moneda, pago.aplicado)}</span>
        </span>
        {pago.notas > 0 ? (
          <span>
            <span className="text-ink/50">Diferencia: </span>
            <span className={Math.abs(Number(pago.diferencia)) < 0.005 ? 'text-success font-medium' : 'text-warning font-medium'}>
              {dinero(pago.moneda, pago.diferencia)}
            </span>
          </span>
        ) : null}
      </div>

      {pago.descripcion ? <p className="text-ink/60 mb-3 text-xs">{pago.descripcion}</p> : null}
      {!vigente ? (
        <p className="text-danger mb-3 text-sm">Anulado: {pago.motivo_anulacion}</p>
      ) : null}

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <p className="text-ink/55 mb-3 text-sm">Este pago todavía no tiene notas de entrega asociadas.</p>
      ) : null}

      {data && data.length > 0 ? (
        <div className="border-hairline mb-3 divide-y overflow-hidden rounded-[6px] border">
          {data.map((n) => {
            const escrito = montos[n.enlace_id]
            const cambiado = escrito != null && leerMonto(escrito) !== Number(n.monto_aplicado)
            return (
              <div key={n.enlace_id} className="border-hairline flex flex-wrap items-center gap-3 px-3 py-2.5">
                <div className="min-w-[180px] flex-1">
                  <p className="text-ink/85 font-medium">
                    {n.numero} <span className="text-ink/45 font-normal">· {fecha(n.fecha)}</span>
                  </p>
                  <p className="text-ink/55 text-xs">
                    {n.cliente ?? 'Sin cliente'} · total {dinero(n.moneda, n.total)}
                    {n.otros_pagos > 0 ? ` · también en ${n.otros_pagos} pago(s) más` : ''}
                  </p>
                </div>
                {editable ? (
                  <div className="flex items-end gap-2">
                    <Input
                      label={`Aplicado (${pago.moneda === 'VES' ? 'Bs' : pago.moneda})`}
                      inputMode="decimal"
                      className="w-36"
                      value={escrito ?? String(Number(n.monto_aplicado))}
                      onChange={(e) => setMontos((m) => ({ ...m, [n.enlace_id]: e.target.value }))}
                    />
                    {cambiado ? (
                      <Button
                        size="sm"
                        disabled={cambiar.isPending}
                        onClick={async () => {
                          await cambiar.mutateAsync({ enlaceId: n.enlace_id, monto: leerMonto(escrito) })
                          setMontos((m) => {
                            const { [n.enlace_id]: _, ...resto } = m
                            return resto
                          })
                        }}
                      >
                        Guardar
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<X />}
                      disabled={quitar.isPending}
                      onClick={() => quitar.mutate(n.enlace_id)}
                    >
                      Quitar
                    </Button>
                  </div>
                ) : (
                  <span className="text-ink/80 tabular text-sm">{dinero(pago.moneda, n.monto_aplicado)}</span>
                )}
              </div>
            )
          })}
        </div>
      ) : null}

      {cambiar.error ? <ErrorDeCarga error={cambiar.error} className="mb-3" /> : null}
      {quitar.error ? <ErrorDeCarga error={quitar.error} className="mb-3" /> : null}

      {editable ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Link2 />} onClick={() => setAsociando(true)}>
            Asociar notas
          </Button>
          <Button size="sm" variant="outline" icon={<Pencil />} onClick={onEditar}>
            Editar pago
          </Button>
          <Button size="sm" variant="ghost" icon={<Ban />} onClick={() => setAnulando(true)}>
            Anular pago
          </Button>
        </div>
      ) : null}

      {asociando ? <ModalAsociar pago={pago} onCerrar={() => setAsociando(false)} /> : null}

      {anulando ? (
        <Modal
          abierto
          onCerrar={() => setAnulando(false)}
          titulo="Anular pago"
          descripcion="El pago no se borra: queda marcado como anulado, con su motivo, y deja de contar."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setAnulando(false)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={anular.isPending || motivo.trim().length < 4}
                onClick={async () => {
                  await anular.mutateAsync({ id: pago.id, motivo })
                  setAnulando(false)
                }}
              >
                Anular
              </Button>
            </>
          }
        >
          <Textarea label="Motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          {anular.error ? <ErrorDeCarga error={anular.error} className="mt-3" /> : null}
        </Modal>
      ) : null}
    </div>
  )
}

// ─────────────────────────────── asociar notas ──────────────────────────────

function ModalAsociar({ pago, onCerrar }: { pago: PagoBancario; onCerrar: () => void }) {
  const [texto, setTexto] = useState('')
  const [buscado, setBuscado] = useState('')
  const { data, isPending, error } = useNotasCandidatas(pago.id, buscado)
  const asociar = useAsociarNotas()
  const [elegidas, setElegidas] = useState<Record<number, number>>({})

  const sumaElegida = Object.values(elegidas).reduce((a, b) => a + b, 0)
  const conLoAsociado = Number(pago.aplicado) + sumaElegida
  const diferencia = Number(pago.monto) - conLoAsociado

  return (
    <Modal
      abierto
      ancho="lg"
      onCerrar={onCerrar}
      titulo={`Asociar notas al pago de ${dinero(pago.moneda, pago.monto)}`}
      descripcion="Salen primero las notas de una semana antes o después con el monto más parecido. Para otra nota, búsquela por número o cliente."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={asociar.isPending || Object.keys(elegidas).length === 0}
            onClick={async () => {
              await asociar.mutateAsync({
                pagoId: pago.id,
                notas: Object.keys(elegidas).map((id) => ({ nota_id: Number(id) })),
              })
              onCerrar()
            }}
          >
            {asociar.isPending ? 'Asociando…' : `Asociar ${Object.keys(elegidas).length || ''}`}
          </Button>
        </>
      }
    >
      <form
        className="mb-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setBuscado(texto)
        }}
      >
        <Input
          label="Buscar nota"
          icon={<Search />}
          placeholder="NE-2026-0012 o nombre del cliente"
          className="flex-1"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>

      <div className="bg-ink/4 rounded-card mb-3 p-3 text-sm">
        Elegidas: <strong>{dinero(pago.moneda, sumaElegida)}</strong> · con lo ya asociado suman{' '}
        <strong>{dinero(pago.moneda, conLoAsociado)}</strong> de {dinero(pago.moneda, pago.monto)} ·{' '}
        <span className={Math.abs(diferencia) < 0.005 ? 'text-success' : 'text-warning'}>
          {Math.abs(diferencia) < 0.005
            ? 'cuadra'
            : `${diferencia > 0 ? 'faltan' : 'sobran'} ${dinero(pago.moneda, Math.abs(diferencia))}`}
        </span>
      </div>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}
      {data && data.length === 0 ? <p className="text-ink/55 text-sm">No apareció ninguna nota.</p> : null}

      {data && data.length > 0 ? (
        <div className="border-hairline max-h-[50vh] divide-y overflow-y-auto rounded-[6px] border">
          {data.map((n) => {
            const marcada = n.nota_id in elegidas
            return (
              <label
                key={n.nota_id}
                className="border-hairline hover:bg-ink/3 flex cursor-pointer items-center gap-3 px-3 py-2.5"
              >
                <input
                  type="checkbox"
                  className="accent-royal-600 size-5 shrink-0"
                  checked={marcada}
                  onChange={() =>
                    setElegidas((e) => {
                      if (marcada) {
                        const { [n.nota_id]: _, ...resto } = e
                        return resto
                      }
                      return { ...e, [n.nota_id]: Number(n.en_moneda_del_pago) }
                    })
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="text-ink/85 font-medium">
                    {n.numero} <span className="text-ink/45 font-normal">· {fecha(n.fecha)}</span>
                  </p>
                  <p className="text-ink/55 truncate text-xs">
                    {n.cliente ?? 'Sin cliente'}
                    {n.otros_pagos > 0 ? ` · ya está en ${n.otros_pagos} pago(s)` : ''}
                  </p>
                </div>
                <span className="text-ink/85 tabular text-sm whitespace-nowrap">
                  {dinero(pago.moneda, n.en_moneda_del_pago)}
                </span>
              </label>
            )
          })}
        </div>
      ) : null}

      {asociar.error ? <ErrorDeCarga error={asociar.error} className="mt-3" /> : null}
    </Modal>
  )
}

// ─────────────────────────────── registrar / editar ─────────────────────────

function ModalPago({ pago, onCerrar }: { pago: PagoBancario | null; onCerrar: () => void }) {
  const monedas = useMonedasUsables()
  const guardar = useGuardarPagoBancario()
  const [f, setF] = useState({
    fecha: pago?.fecha ?? hoy(),
    moneda: pago?.moneda ?? 'VES',
    monto: pago ? String(Number(pago.monto)) : '',
    tasa: pago?.tasa ? String(Number(pago.tasa)) : '',
    referencia: pago?.referencia ?? '',
    descripcion: pago?.descripcion ?? '',
  })
  const cambiar = (c: Partial<typeof f>) => setF((x) => ({ ...x, ...c }))
  const monto = leerMonto(f.monto)

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={pago ? 'Editar pago' : 'Registrar pago'}
      descripcion="Un pago que llegó al banco. Después se le asocian las notas de entrega que cubre."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={guardar.isPending || !f.fecha || !(monto > 0)}
            onClick={async () => {
              await guardar.mutateAsync({
                id: pago?.id,
                fecha: f.fecha,
                moneda: f.moneda,
                monto,
                tasa: f.moneda === 'USD' || !f.tasa.trim() ? null : leerMonto(f.tasa),
                referencia: f.referencia.trim() || null,
                descripcion: f.descripcion.trim() || null,
              })
              onCerrar()
            }}
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Fecha" type="date" max={hoy()} value={f.fecha} onChange={(e) => cambiar({ fecha: e.target.value })} />
        <Select
          label="Moneda"
          value={f.moneda}
          onChange={(e) => cambiar({ moneda: e.target.value })}
          opciones={monedas.data ?? [{ valor: 'VES', etiqueta: 'Bolívares' }, { valor: 'USD', etiqueta: 'Dólares' }]}
        />
        <Input
          label="Monto"
          inputMode="decimal"
          placeholder="42.110,34"
          value={f.monto}
          onChange={(e) => cambiar({ monto: e.target.value })}
        />
        {f.moneda !== 'USD' ? (
          <Input
            label="Tasa (Bs por $)"
            inputMode="decimal"
            hint="Si la deja vacía se usa la del BCV de ese día."
            value={f.tasa}
            onChange={(e) => cambiar({ tasa: e.target.value })}
          />
        ) : null}
        <Input label="Referencia" value={f.referencia} onChange={(e) => cambiar({ referencia: e.target.value })} />
      </div>
      <Textarea
        label="Descripción"
        className="mt-4"
        rows={2}
        value={f.descripcion}
        onChange={(e) => cambiar({ descripcion: e.target.value })}
      />
      {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-4" /> : null}
    </Modal>
  )
}

// ─────────────────────────────── importar ───────────────────────────────────

function ModalImportar({ onCerrar }: { onCerrar: () => void }) {
  const importar = useImportarPagosBancarios()
  const [texto, setTexto] = useState('')
  const [filas, setFilas] = useState<FilaLeida[]>([])
  const [resultado, setResultado] = useState<{ nuevos: number; repetidos: number } | null>(null)
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null)

  const leer = (t: string) => {
    setTexto(t)
    setResultado(null)
    setFilas(leerPagosDelBanco(t, hoy()))
  }

  const marcadas = filas.filter((x) => x.incluir)

  return (
    <Modal
      abierto
      ancho="lg"
      onCerrar={onCerrar}
      titulo="Importar pagos del banco"
      descripcion="Copie las filas de la planilla del banco (en Excel o Google Sheets) y péguelas aquí, o suba el archivo en CSV. Revise la vista previa antes de importar."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            {resultado ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!resultado ? (
            <Button
              disabled={importar.isPending || marcadas.length === 0}
              onClick={async () => {
                const r = await importar.mutateAsync(marcadas.map((x) => x.fila))
                setResultado(r)
              }}
            >
              {importar.isPending ? 'Importando…' : `Importar ${marcadas.length} pago(s)`}
            </Button>
          ) : null}
        </>
      }
    >
      {resultado ? (
        <div className="bg-success/10 rounded-card p-4 text-sm">
          Listo: <strong>{resultado.nuevos}</strong> pago(s) nuevo(s).
          {resultado.repetidos > 0
            ? ` ${resultado.repetidos} ya estaban registrados (misma fecha, monto y referencia) y no se duplicaron.`
            : ''}
        </div>
      ) : (
        <>
          <Textarea
            label="Pegue aquí las filas"
            rows={5}
            placeholder="15-09-26 · VES-BS BDT · 42.110,34 · Bs842,2067 · … · VENTA DE ARENA REF: 0928"
            value={texto}
            onChange={(e) => leer(e.target.value)}
          />
          <label className="text-ink/70 mt-3 inline-flex cursor-pointer items-center gap-2 text-sm">
            <Upload className="size-4" />
            <span className="underline">O suba un archivo (.csv o .txt)</span>
            <input
              type="file"
              accept=".csv,.txt,.tsv,text/csv,text/plain"
              className="sr-only"
              onChange={async (e) => {
                const archivo = e.target.files?.[0]
                e.target.value = ''
                if (!archivo) return
                if (/\.xlsx?$/i.test(archivo.name)) {
                  setErrorArchivo('Ese es un archivo de Excel. Ábralo y copie las filas, o guárdelo como CSV y súbalo.')
                  return
                }
                setErrorArchivo(null)
                try {
                  leer(await archivo.text())
                } catch {
                  setErrorArchivo('No se pudo leer el archivo. Pruebe copiando y pegando las filas.')
                }
              }}
            />
          </label>
          {errorArchivo ? <p className="text-danger mt-2 text-sm">{errorArchivo}</p> : null}

          {filas.length > 0 ? (
            <div className="border-hairline mt-4 max-h-[45vh] overflow-auto rounded-[6px] border">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                    <th className="px-3 py-2" />
                    <th className="px-3 py-2 font-medium">Fecha</th>
                    <th className="px-3 py-2 text-right font-medium">Monto</th>
                    <th className="px-3 py-2 font-medium">Referencia</th>
                    <th className="px-3 py-2 font-medium">Descripción</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((x, i) => (
                    <tr key={i} className={`border-hairline border-b ${x.incluir ? '' : 'opacity-55'}`}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          className="accent-royal-600 size-5"
                          checked={x.incluir}
                          disabled={x.problema != null}
                          onChange={() =>
                            setFilas((fs) => fs.map((y, j) => (j === i ? { ...y, incluir: !y.incluir } : y)))
                          }
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{x.fila.fecha ? fecha(x.fila.fecha) : '—'}</td>
                      <td className="tabular px-3 py-2 text-right whitespace-nowrap">
                        {x.fila.monto > 0 ? dinero(x.fila.moneda, x.fila.monto) : '—'}
                      </td>
                      <td className="px-3 py-2">{x.fila.referencia ?? '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        {x.problema ? <span className="text-danger">{x.problema} </span> : null}
                        <span className="text-ink/60 line-clamp-2">{x.fila.descripcion ?? x.texto}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {filas.length > 0 ? (
            <p className="text-ink/50 mt-2 text-xs">
              {marcadas.length} de {filas.length} filas marcadas. Las de nómina, préstamos, intereses y saldo
              inicial vienen desmarcadas; márquelas si sí son ventas.
            </p>
          ) : null}
        </>
      )}
      {importar.error ? <ErrorDeCarga error={importar.error} className="mt-4" /> : null}
    </Modal>
  )
}
