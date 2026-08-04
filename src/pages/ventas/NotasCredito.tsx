import { useState } from 'react'
import { FileMinus, Plus, Undo2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { dinero, fecha as fmtFecha, fechaHora } from '@/lib/formato'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useAlmacenes } from '@/lib/api/inventario'
import {
  TIPOS_NOTA_CREDITO,
  useAnularNotaCredito,
  useEmitirNotaCredito,
  useFacturas,
  useNotasCredito,
  useRenglones,
  type NotaCredito,
} from '@/lib/api/ventas'

/**
 * Notas de crédito.
 *
 * Anular una factura sirve mientras el papel no salió de la empresa. En cuanto
 * está en manos del cliente, él tiene un documento fiscal con un número de
 * control que existe —y el SENIAT también— así que lo que corresponde es
 * restarle por diferencia con este otro papel.
 *
 * La nota se arma desde los renglones de la factura y no en blanco. Corregir es
 * decir "de esto que facturé, esto de aquí sobra", y para eso hay que tener
 * delante lo que se facturó.
 */

const TONO: Record<string, 'royal' | 'neutral'> = { EMITIDA: 'royal', ANULADA: 'neutral' }

interface Linea {
  usar: boolean
  articulo_id: number
  descripcion: string
  unidad: string
  exento_iva: boolean
  cantidad: string
  precio_unitario: string
  /** Vacío = no vuelve material, solo se corrige plata. */
  almacen_id: string
}

export function NotasCredito() {
  const { data, isPending, error } = useNotasCredito()
  const facturas = useFacturas()
  const { data: almacenes } = useAlmacenes()
  const emitir = useEmitirNotaCredito()
  const anular = useAnularNotaCredito()
  const { puede } = useMisPermisos()

  const [emitiendo, setEmitiendo] = useState(false)
  const [facturaId, setFacturaId] = useState('')
  const [tipo, setTipo] = useState('CORRECCION')
  const [motivo, setMotivo] = useState('')
  const [dia, setDia] = useState(hoyEnCaracas())
  const [lineas, setLineas] = useState<Linea[]>([])

  const [detalle, setDetalle] = useState<NotaCredito | null>(null)
  const [anulando, setAnulando] = useState<NotaCredito | null>(null)
  const [motivoAnulacion, setMotivoAnulacion] = useState('')

  // Solo se corrige lo que sigue en pie. Una factura anulada no tiene nada que
  // restar y la base lo rechazaría de todos modos.
  const facturables = (facturas.data ?? []).filter((f) => f.estado !== 'ANULADA')
  const factura = facturables.find((f) => String(f.id) === facturaId)
  const renglones = useRenglones('factura_venta_renglones', 'factura_id', factura?.id ?? null)

  const detalleRenglones = useRenglones('nota_credito_renglones', 'nota_id', detalle?.id ?? null)

  const elegirFactura = (id: string) => {
    setFacturaId(id)
    const f = facturables.find((x) => String(x.id) === id)
    setDia(f && f.fecha > hoyEnCaracas() ? f.fecha : hoyEnCaracas())
    setLineas([])
  }

  // Los renglones se cargan una vez, cuando llegan, y a partir de ahí se editan.
  if (facturaId && renglones.data && lineas.length === 0 && renglones.data.length > 0) {
    setLineas(
      renglones.data.map((r) => ({
        usar: false,
        articulo_id: r.articulo_id,
        descripcion: r.descripcion,
        unidad: r.unidad,
        exento_iva: r.exento_iva,
        cantidad: r.cantidad,
        precio_unitario: r.precio_unitario,
        almacen_id: '',
      })),
    )
  }

  const elegidas = lineas.filter((l) => l.usar)
  const subtotal = elegidas.reduce(
    (t, l) => t + (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0),
    0,
  )
  const gravado = elegidas.reduce(
    (t, l) =>
      t + (l.exento_iva ? 0 : (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0)),
    0,
  )
  const alicuota = Number(factura?.alicuota_iva ?? 16)
  const totalNota = Math.round((subtotal + (gravado * alicuota) / 100) * 100) / 100
  const seExcede = factura ? totalNota > Number(factura.total) + 0.01 : false

  const cerrar = () => {
    setEmitiendo(false)
    setFacturaId('')
    setTipo('CORRECCION')
    setMotivo('')
    setLineas([])
  }

  const cambiar = (i: number, cambio: Partial<Linea>) =>
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...cambio } : l)))

  return (
    <>
      <PageHeader
        title="Notas de crédito"
        description="El papel que corrige una factura que ya salió de la empresa."
        actions={
          puede('VENTAS', 'TOTAL') ? (
            <Button icon={<Plus />} onClick={() => setEmitiendo(true)}>
              Emitir nota de crédito
            </Button>
          ) : null
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<FileMinus />}
            titulo="No se ha emitido ninguna nota de crédito"
            descripcion="Mientras la factura no haya salido de la empresa se anula y se hace otra. Esto es para cuando ya está en manos del cliente."
          />
        </Card>
      ) : null}

      {data && data.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Nota</th>
                  <th className="px-3 py-3 font-medium">Corrige</th>
                  <th className="px-3 py-3 font-medium">Cliente</th>
                  <th className="px-3 py-3 font-medium">Motivo</th>
                  <th className="px-3 py-3 text-right font-medium">Monto</th>
                  <th className="px-5 py-3 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.map((n) => (
                  <tr
                    key={n.id}
                    onClick={() => setDetalle(n)}
                    className="border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors last:border-0"
                  >
                    <td className="px-5 py-3">
                      <p className="tabular text-ink/85 font-medium">{n.numero}</p>
                      <p className="text-ink/45 text-xs">
                        control {n.numero_control} · {fmtFecha(n.fecha)}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="tabular text-ink/70">{n.factura_numero}</p>
                      <p className="text-ink/45 text-xs">{fmtFecha(n.factura_fecha)}</p>
                    </td>
                    <td className="text-ink/70 px-3 py-3">{n.cliente}</td>
                    <td className="px-3 py-3">
                      <p className="text-ink/70 text-xs">
                        {TIPOS_NOTA_CREDITO.find((t) => t.valor === n.tipo)?.etiqueta ?? n.tipo}
                      </p>
                      {n.devolvio_material ? (
                        <p className="text-ink/45 text-xs">volvió material al patio</p>
                      ) : null}
                    </td>
                    <td className="tabular text-ink/85 px-3 py-3 text-right font-medium">
                      −{dinero(n.moneda, n.total)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Chip tone={TONO[n.estado] ?? 'neutral'}>
                        {n.estado === 'EMITIDA' ? 'Vigente' : 'Anulada'}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* --------------------------------------------------------- emitir */}
      {emitiendo ? (
        <Modal
          abierto
          ancho="lg"
          onCerrar={cerrar}
          titulo="Emitir nota de crédito"
          descripcion="Se arma sobre los renglones de la factura: marca lo que sobra y ajusta la cantidad o el precio."
          acciones={
            <>
              <Button variant="ghost" onClick={cerrar}>
                Cancelar
              </Button>
              <Button
                disabled={
                  emitir.isPending ||
                  !factura ||
                  elegidas.length === 0 ||
                  motivo.trim().length < 6 ||
                  totalNota <= 0 ||
                  seExcede
                }
                onClick={async () => {
                  await emitir.mutateAsync({
                    factura_id: factura!.id,
                    tipo,
                    motivo,
                    fecha: dia,
                    renglones: elegidas.map((l) => ({
                      articulo_id: l.articulo_id,
                      descripcion: l.descripcion,
                      cantidad: Number(l.cantidad),
                      unidad: l.unidad,
                      precio_unitario: Number(l.precio_unitario),
                      exento_iva: l.exento_iva,
                      almacen_id: l.almacen_id ? Number(l.almacen_id) : null,
                    })),
                  })
                  cerrar()
                }}
              >
                {emitir.isPending ? 'Emitiendo…' : 'Emitir'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Factura que se corrige"
              value={facturaId}
              onChange={(e) => elegirFactura(e.target.value)}
              opciones={[
                { valor: '', etiqueta: 'Elige la factura…' },
                ...facturables.map((f) => ({
                  valor: String(f.id),
                  etiqueta: `${f.numero} · ${f.cliente} · ${dinero(f.moneda, f.total)}`,
                })),
              ]}
            />
            <Input label="Fecha de la nota" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
          </div>

          {factura ? (
            <>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Select
                  label="Por qué se corrige"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                  opciones={TIPOS_NOTA_CREDITO.map((t) => ({
                    valor: t.valor,
                    etiqueta: t.etiqueta,
                  }))}
                  hint={TIPOS_NOTA_CREDITO.find((t) => t.valor === tipo)?.ayuda}
                />
                <div className="text-ink/55 self-end pb-1 text-sm">
                  La nota toma la tasa de la factura (Bs {factura.tasa} por dólar), no la de hoy:
                  tiene que restar los mismos bolívares que sumó.
                </div>
              </div>

              <Textarea
                label="Motivo"
                className="mt-4"
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Se despachó piedra 2 en lugar de piedra 1 y el cliente devolvió 12 t."
                hint="Lo lee el cliente, lo lee el SENIAT y lo lee quien abra esto dentro de un año."
              />

              <div className="border-hairline mt-5 overflow-x-auto rounded-[6px] border">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="text-ink/45 border-hairline bg-ink/3 border-b text-left text-xs">
                      <th className="w-10 px-3 py-2.5"></th>
                      <th className="px-3 py-2.5 font-medium">Renglón de la factura</th>
                      <th className="w-28 px-3 py-2.5 font-medium">Cantidad</th>
                      <th className="w-32 px-3 py-2.5 font-medium">Precio</th>
                      <th className="w-44 px-3 py-2.5 font-medium">¿Vuelve al patio?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map((l, i) => (
                      <tr key={i} className="border-hairline border-b last:border-0">
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={l.usar}
                            onChange={(e) => cambiar(i, { usar: e.target.checked })}
                            className="accent-royal-600 size-4"
                            aria-label={`Corregir ${l.descripcion}`}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <p className={l.usar ? 'text-ink/85' : 'text-ink/45'}>{l.descripcion}</p>
                          {l.exento_iva ? (
                            <p className="text-ink/45 text-xs">exento de IVA</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            min="0"
                            step="0.0001"
                            disabled={!l.usar}
                            value={l.cantidad}
                            onChange={(e) => cambiar(i, { cantidad: e.target.value })}
                            className="border-hairline tabular bg-surface text-ink/85 w-full rounded-[5px] border px-2 py-1.5 text-right text-sm disabled:opacity-40"
                            aria-label={`Cantidad de ${l.descripcion}`}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            min="0"
                            step="0.000001"
                            disabled={!l.usar}
                            value={l.precio_unitario}
                            onChange={(e) => cambiar(i, { precio_unitario: e.target.value })}
                            className="border-hairline tabular bg-surface text-ink/85 w-full rounded-[5px] border px-2 py-1.5 text-right text-sm disabled:opacity-40"
                            aria-label={`Precio de ${l.descripcion}`}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <select
                            disabled={!l.usar}
                            value={l.almacen_id}
                            onChange={(e) => cambiar(i, { almacen_id: e.target.value })}
                            className="border-hairline bg-surface text-ink/85 w-full rounded-[5px] border px-2 py-1.5 text-sm disabled:opacity-40"
                            aria-label={`Patio al que vuelve ${l.descripcion}`}
                          >
                            <option value="">No vuelve material</option>
                            {(almacenes ?? []).map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.nombre}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border-hairline mt-4 flex items-center justify-between border-t pt-3">
                <p className="text-ink/55 text-sm">
                  {elegidas.length === 0
                    ? 'Marca al menos un renglón.'
                    : `${elegidas.length} renglón${elegidas.length === 1 ? '' : 'es'} · la factura es de ${dinero(factura.moneda, factura.total)}`}
                </p>
                <p
                  className={`tabular text-xl font-semibold ${seExcede ? 'text-danger' : 'text-ink/90'}`}
                >
                  −{dinero(factura.moneda, totalNota)}
                </p>
              </div>

              {seExcede ? (
                <p className="text-danger mt-2 text-sm">
                  La nota es mayor que la factura. Una nota de crédito no puede devolver más de lo
                  que se cobró.
                </p>
              ) : null}
            </>
          ) : null}

          {emitir.error ? <ErrorDeCarga error={emitir.error} className="mt-3" /> : null}
        </Modal>
      ) : null}

      {/* -------------------------------------------------------- detalle */}
      {detalle ? (
        <Modal
          abierto
          ancho="lg"
          onCerrar={() => setDetalle(null)}
          titulo={detalle.numero}
          descripcion={`Corrige la factura ${detalle.factura_numero} · control ${detalle.numero_control}`}
          acciones={
            <>
              {detalle.estado === 'EMITIDA' && puede('VENTAS', 'TOTAL') ? (
                <Button
                  variant="outline"
                  icon={<Undo2 />}
                  onClick={() => {
                    setAnulando(detalle)
                    setMotivoAnulacion('')
                    setDetalle(null)
                  }}
                >
                  Anular
                </Button>
              ) : null}
              <Button variant="ghost" onClick={() => setDetalle(null)}>
                Cerrar
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Dato rotulo="Cliente" valor={detalle.cliente} nota={detalle.cliente_rif} />
            <Dato
              rotulo="Motivo"
              valor={TIPOS_NOTA_CREDITO.find((t) => t.valor === detalle.tipo)?.etiqueta ?? detalle.tipo}
            />
            <Dato rotulo="Emitida" valor={fmtFecha(detalle.fecha)} nota={fechaHora(detalle.emitida_en)} />
          </div>

          <p className="text-ink/70 bg-ink/3 mt-4 rounded-[6px] p-3 text-sm">{detalle.motivo}</p>

          {detalleRenglones.data && detalleRenglones.data.length > 0 ? (
            <table className="mt-4 w-full text-sm">
              <tbody>
                {detalleRenglones.data.map((r) => (
                  <tr key={r.id} className="border-hairline border-b last:border-0">
                    <td className="text-ink/70 py-2">{r.descripcion}</td>
                    <td className="tabular text-ink/60 py-2 text-right text-xs">
                      {r.cantidad} {r.unidad} × {dinero(detalle.moneda, r.precio_unitario)}
                    </td>
                    <td className="tabular text-ink/85 py-2 text-right font-medium">
                      {dinero(detalle.moneda, r.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          <div className="border-hairline mt-4 flex items-center justify-between border-t pt-3">
            <span className="text-ink/55 text-sm">
              Base {dinero(detalle.moneda, detalle.base_imponible)} · IVA{' '}
              {dinero(detalle.moneda, detalle.iva)}
            </span>
            <span className="tabular text-ink/90 text-xl font-semibold">
              −{dinero(detalle.moneda, detalle.total)}
            </span>
          </div>

          {detalle.estado === 'ANULADA' ? (
            <p className="text-ink/55 border-hairline mt-4 border-t pt-3 text-sm">
              Anulada: {detalle.motivo_anulacion}
            </p>
          ) : null}
        </Modal>
      ) : null}

      {/* --------------------------------------------------------- anular */}
      {anulando ? (
        <Modal
          abierto
          onCerrar={() => setAnulando(null)}
          titulo={`Anular la nota ${anulando.numero}`}
          descripcion="El número de control se gastó y no vuelve: queda la nota anulada con su motivo, que es lo que el SENIAT espera encontrar. Si volvió material al patio, vuelve a salir."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setAnulando(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={anular.isPending || motivoAnulacion.trim().length < 4}
                onClick={async () => {
                  await anular.mutateAsync({ id: anulando.id, motivo: motivoAnulacion })
                  setAnulando(null)
                }}
              >
                {anular.isPending ? 'Anulando…' : 'Anular'}
              </Button>
            </>
          }
        >
          <Textarea
            label="Por qué se anula"
            rows={3}
            value={motivoAnulacion}
            onChange={(e) => setMotivoAnulacion(e.target.value)}
          />
          {anular.error ? <ErrorDeCarga error={anular.error} className="mt-3" /> : null}
        </Modal>
      ) : null}
    </>
  )
}

function Dato({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div>
      <p className="text-ink/50 text-xs">{rotulo}</p>
      <p className="text-ink/85 mt-0.5 text-sm">{valor}</p>
      {nota ? <p className="text-ink/45 text-xs">{nota}</p> : null}
    </div>
  )
}
