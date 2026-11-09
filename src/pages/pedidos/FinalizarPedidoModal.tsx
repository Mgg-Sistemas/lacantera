import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Estrellas } from '@/components/ui/Estrellas'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import {
  borrarArchivosRecepcion,
  subirArchivoRecepcion,
  useAdjuntarComprobante,
  useFinalizarOrden,
  useRecepcionesDeOrden,
  type DatosFinalizar,
  type Orden,
  type Recepcion,
} from '@/lib/api/pedidos'
import {
  CALIDAD_ESTRELLAS,
  DIAS_POR_ESTRELLAS,
  ETIQUETA_ALMACEN,
  PUNTUALIDAD_LABEL,
  estrellasPorDias,
  fechaHoraVE,
  fmtCant,
  money,
} from '@/lib/pedidos'
import { abrirArchivoRecepcion } from '@/lib/pagos'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'

/*
  ✓ FINALIZAR ORDEN, CON LA EVALUACIÓN DEL PROVEEDOR (MGG `FinalizarPedidoModal`)

  Los campos de MGG, calificados con estrellas (la dueña, 09/11/2026: «que
  al momento de calificar al proveedor sea todo tipo estrellas»): la calidad
  (5 Excelente … 1 Muy mala) y la puntualidad (5 a tiempo o antes … 1 más de
  7 días tarde), que se sugiere sola con la fecha prometida y la de recibido
  hasta que se toquen las estrellas. Luego la factura y el comentario. La
  evaluación alimenta el score de las próximas cotizaciones. Sin la palabra
  «(opcional)» (la dueña).

  Y dos piezas más de la fase 4:
    - «📎 Cargar factura / nota de entrega» (MGG `ComprobanteOcModal`), sin
      Retenciones: solo queda el soporte en la orden.
    - «📥 Ver recepción»: las recepciones de la orden (R1, R2…) con su WhatsApp.
*/

const hoyCaracas = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })

export function FinalizarPedidoModal({
  orden: o,
  fechaPrometidaOferta,
  onClose,
  onListo,
}: {
  orden: Orden
  /** La fecha prometida de la oferta aceptada (vive en la madre si es sub-OC). */
  fechaPrometidaOferta: string | null
  onClose: () => void
  onListo: () => void
}) {
  const finalizar = useFinalizarOrden()
  const [factura, setFactura] = useState<File | null>(null)
  const [facturaTipo, setFacturaTipo] = useState<'factura' | 'nota_entrega'>('factura')
  const [calidad, setCalidad] = useState(5)
  // null: la persona no tocó las estrellas y se sugieren por las fechas.
  const [puntualidadElegida, setPuntualidadElegida] = useState<number | null>(null)
  const [comentario, setComentario] = useState('')
  const [fechaPrometida, setFechaPrometida] = useState((fechaPrometidaOferta ?? '').slice(0, 10))
  const [fechaRecibido, setFechaRecibido] = useState(() =>
    o.recibida_en ? new Date(o.recibida_en).toLocaleDateString('en-CA', { timeZone: 'America/Caracas' }) : hoyCaracas(),
  )
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Días (firmado): + adelantado (recibido antes de lo prometido), − atrasado.
  const diasPorFecha = (() => {
    if (!fechaPrometida || !fechaRecibido) return null
    const p = new Date(`${fechaPrometida}T00:00:00`).getTime()
    const r = new Date(`${fechaRecibido}T00:00:00`).getTime()
    if (Number.isNaN(p) || Number.isNaN(r)) return null
    return Math.round((p - r) / 86_400_000)
  })()

  const sugerida = diasPorFecha != null ? estrellasPorDias(diasPorFecha) : null
  const puntualidad = puntualidadElegida ?? sugerida ?? 5

  async function handle() {
    setError(null)
    // Los días salen de las fechas si están las dos; si no, de las estrellas.
    const puntualidadDias = diasPorFecha ?? DIAS_POR_ESTRELLAS[puntualidad] ?? 0
    if (factura && factura.size > 10 * 1024 * 1024) {
      setError('La factura no puede superar 10 MB.')
      return
    }
    setGuardando(true)
    let subida: string | null = null
    try {
      let fac: DatosFinalizar['factura'] = null
      if (factura) {
        const s = await subirArchivoRecepcion(o.id, 'factura', factura)
        subida = s.path
        fac = { ...s, tipo: facturaTipo }
      }
      await finalizar.mutateAsync({
        id: o.id,
        datos: {
          calidad,
          puntualidad,
          puntualidad_dias: puntualidadDias,
          fecha_prometida: fechaPrometida || null,
          fecha_recibido: fechaRecibido || null,
          comentario: comentario.trim() || null,
          factura: fac,
        },
      })
      toast(`Pedido finalizado · ${o.codigo}`, 'success')
      onListo()
    } catch (e) {
      if (subida) void borrarArchivosRecepcion([subida])
      setError(mensajeDe(e, 'No se pudo finalizar'))
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onClose}
      titulo={`Finalizar pedido · ${o.codigo}`}
      ancho="md"
      acciones={
        <>
          <Button variant="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={() => void handle()} disabled={guardando}>
            {guardando ? 'Finalizando…' : 'Finalizar'}
          </Button>
        </>
      }
    >
      <p className="text-ink/65 mb-3 text-sm">
        Confirmá que recibiste todo correctamente y evaluá la recepción{o.proveedor_id ? ' del proveedor' : ''}. Esta
        evaluación queda en la <strong>trazabilidad</strong> de la orden y en el score de las próximas cotizaciones.
      </p>
      {error ? (
        <Card className="border-danger mb-3 border">
          <strong>Error:</strong> {error}
        </Card>
      ) : null}

      <div className="space-y-3">
        <Estrellas label="Calidad *" value={calidad} onChange={setCalidad} etiquetas={CALIDAD_ESTRELLAS} />
        <Estrellas
          label="Puntualidad *"
          value={puntualidad}
          onChange={setPuntualidadElegida}
          etiquetas={PUNTUALIDAD_LABEL}
          hint={
            puntualidadElegida == null
              ? sugerida != null
                ? 'Sugerida por las fechas de abajo; podés cambiarla.'
                : 'Sin las dos fechas, calificala con las estrellas.'
              : sugerida != null && sugerida !== puntualidadElegida
                ? `Por las fechas serían ${sugerida} estrella(s).`
                : undefined
          }
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Fecha prometida (de la oferta)"
            type="date"
            value={fechaPrometida}
            hint={fechaPrometida ? 'Tomada de la oferta del proveedor; podés ajustarla.' : 'La oferta no tiene fecha prometida: colocala acá.'}
            onChange={(e) => setFechaPrometida(e.target.value)}
          />
          <Input
            label="Fecha de recibido"
            type="date"
            value={fechaRecibido}
            max={hoyCaracas()}
            hint="Por defecto, el día en que el almacén cerró la recepción."
            onChange={(e) => setFechaRecibido(e.target.value)}
          />
        </div>
        {diasPorFecha != null ? (
          <div className="border-hairline rounded-[6px] border px-3 py-2 text-sm">
            {diasPorFecha === 0 ? (
              <>
                ✓ Recibido <strong>en la fecha prometida</strong>.
              </>
            ) : diasPorFecha > 0 ? (
              <>
                ✓ Recibido <strong>{diasPorFecha} día(s) antes</strong> de lo prometido (adelantado).
              </>
            ) : (
              <>
                ⚠ Recibido <strong>{Math.abs(diasPorFecha)} día(s) después</strong> de lo prometido (atrasado).
              </>
            )}
          </div>
        ) : null}

        <div>
          <div className="text-ink/75 mb-1.5 text-sm font-medium">CARGAR FACTURA {o.factura_path ? '(reemplaza la actual)' : ''}</div>
          <input
            type="file"
            accept="application/pdf,image/*"
            aria-label="Factura"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              if (f && f.size > 10 * 1024 * 1024) {
                setError('La factura no puede superar 10 MB.')
                e.target.value = ''
                return
              }
              setError(null)
              setFactura(f)
            }}
          />
          <div className="text-ink/50 mt-1 text-xs">
            {factura ? `✓ ${factura.name} (${(factura.size / 1024).toFixed(0)} KB)` : 'PDF o imagen · máx. 10 MB.'}
          </div>
          {factura ? (
            <div className="mt-2 max-w-xs">
              <Select
                label="Tipo de comprobante"
                value={facturaTipo}
                onChange={(e) => setFacturaTipo(e.target.value as 'factura' | 'nota_entrega')}
                opciones={[
                  { valor: 'factura', etiqueta: 'Factura' },
                  { valor: 'nota_entrega', etiqueta: 'Nota de entrega' },
                ]}
              />
            </div>
          ) : null}
        </div>

        <Textarea
          label="Comentario adicional"
          rows={3}
          placeholder="Observaciones de la recepción…"
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
        />
        <small className="text-ink/50 text-xs">Evaluador: Jefe / analista.</small>
      </div>
    </Modal>
  )
}

/** «📎 Cargar factura / nota de entrega» (MGG `ComprobanteOcModal`). */
export function ComprobanteOcModal({ orden: o, onClose }: { orden: Orden; onClose: () => void }) {
  const adjuntar = useAdjuntarComprobante()
  const [tipo, setTipo] = useState<'factura' | 'nota_entrega'>('factura')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const oc = o.oc_codigo ?? o.codigo

  async function subir() {
    setError(null)
    if (!archivo) {
      setError('Elegí el archivo (PDF o imagen).')
      return
    }
    setGuardando(true)
    let subida: string | null = null
    try {
      const s = await subirArchivoRecepcion(o.id, 'factura', archivo)
      subida = s.path
      await adjuntar.mutateAsync({ id: o.id, archivo: { ...s, tipo } })
      toast(`${tipo === 'factura' ? 'Factura' : 'Nota de entrega'} cargada · ${oc}`, 'success')
      onClose()
    } catch (e) {
      if (subida) void borrarArchivosRecepcion([subida])
      setError(mensajeDe(e, 'No se pudo subir el comprobante'))
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onClose}
      titulo={`📎 Comprobante · OC ${oc}`}
      ancho="md"
      acciones={
        <>
          <Button variant="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={() => void subir()} disabled={guardando}>
            {guardando ? 'Subiendo…' : 'Subir comprobante'}
          </Button>
        </>
      }
    >
      {error ? (
        <Card className="border-danger mb-3 border">
          <strong>Error:</strong> {error}
        </Card>
      ) : null}
      <div className="space-y-3">
        <Select
          label="Tipo de comprobante"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as 'factura' | 'nota_entrega')}
          opciones={[
            { valor: 'factura', etiqueta: 'Factura' },
            { valor: 'nota_entrega', etiqueta: 'Nota de entrega' },
          ]}
        />
        <div>
          <div className="text-ink/75 mb-1.5 text-sm font-medium">Archivo (PDF o imagen · máx. 10 MB)</div>
          <input type="file" accept="application/pdf,image/*" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
        </div>
        {o.factura_path ? (
          <div className="text-sm">
            Ya hay un comprobante cargado: {o.factura_nombre ?? '—'}{' '}
            <Button size="sm" variant="ghost" onClick={() => void abrirArchivoRecepcion(o.factura_path!, o.factura_nombre)}>
              👁 Vista previa
            </Button>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

/** «📥 Ver recepción»: las recepciones de la orden, cada una con su WhatsApp. */
export function RecepcionesDeOrdenModal({
  orden: o,
  onWhatsapp,
  onClose,
}: {
  orden: Orden
  onWhatsapp: (r: Recepcion) => void
  onClose: () => void
}) {
  const q = useRecepcionesDeOrden(o.id)
  const lista = q.data ?? []
  return (
    <Modal
      abierto
      onCerrar={onClose}
      titulo={`📥 Recepciones · ${o.oc_codigo ?? o.codigo}`}
      ancho="lg"
      acciones={
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      {q.isPending ? (
        <p className="text-ink/50 text-sm">Cargando…</p>
      ) : q.error ? (
        <p className="text-danger text-sm">{mensajeDe(q.error, 'No se pudieron leer las recepciones')}</p>
      ) : lista.length === 0 ? (
        <p className="text-ink/50 text-sm">Todavía no se recibió nada de esta orden.</p>
      ) : (
        <div className="space-y-3">
          {lista.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-center gap-2">
                <strong className="font-mono">{r.codigo}</strong>
                <Chip tone={r.completa ? 'success' : r.cierra ? 'warning' : 'info'}>
                  {r.completa ? 'Completa' : r.cierra ? 'Cerrada con lo recibido' : 'Parcial'}
                </Chip>
                {r.sin_inventario ? <Chip tone="warning">📦 Sin inventario</Chip> : null}
                <span className="text-ink/50 ml-auto text-xs">
                  {fechaHoraVE(r.recibida_en)} · {r.recibida_por_nombre ?? '—'} · 📦 {ETIQUETA_ALMACEN}
                </span>
              </div>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {r.renglones.map((it) => (
                    <tr key={it.sku} className="border-hairline border-t">
                      <td className="py-1 pr-2">
                        {it.nombre}
                        {it.articulo_nombre && it.articulo_nombre !== it.nombre ? (
                          <span className="text-ink/50 text-xs"> → {it.articulo_nombre}</span>
                        ) : null}
                        {it.ficha_creada ? <Chip tone="info" className="ml-1">ficha nueva</Chip> : null}
                        {it.marca_recibida ? (
                          <div className="text-warning text-xs">
                            ⚠ Llegó {it.marca_recibida}
                            {it.nota_marca ? ` — ${it.nota_marca}` : ''}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-1 pr-2 text-right whitespace-nowrap">
                        {fmtCant(it.cantidad)} {it.unidad ?? ''}
                        {Number(it.recibido) < Number(it.pedido) ? (
                          <div className="text-ink/50 text-xs">
                            van {fmtCant(it.recibido)} de {fmtCant(it.pedido)}
                          </div>
                        ) : null}
                      </td>
                      <td className="text-ink/60 py-1 text-right text-xs whitespace-nowrap">
                        {it.movimiento_numero
                          ? `${it.movimiento_numero} · entró ${fmtCant(it.cantidad_inventario)} ${it.unidad_inventario ?? ''}`
                          : 'no entra al inventario'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {r.faltan?.length ? (
                <div className="text-warning mt-1 text-xs">
                  {r.cierra ? 'No llegó' : 'Falta'}:{' '}
                  {r.faltan.map((f) => `${f.nombre} ${fmtCant(f.falta)}${f.unidad ? ` ${f.unidad}` : ''}`).join(', ')}
                </div>
              ) : null}
              {r.nota ? <div className="text-ink/60 mt-1 text-xs">📝 {r.nota}</div> : null}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-sm">{money(r.valor)}</span>
                <Button size="sm" variant="ghost" onClick={() => onWhatsapp(r)}>
                  💬 WhatsApp
                </Button>
                {r.documento_path ? (
                  <Button size="sm" variant="ghost" onClick={() => void abrirArchivoRecepcion(r.documento_path!)}>
                    📎 {r.documento_tipo === 'nota_entrega' ? 'Nota de entrega' : 'Factura'}
                  </Button>
                ) : null}
                {r.fotos.map((f, i) => (
                  <Button key={f.path} size="sm" variant="ghost" onClick={() => void abrirArchivoRecepcion(f.path)}>
                    📷 Foto {i + 1}
                  </Button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Modal>
  )
}
