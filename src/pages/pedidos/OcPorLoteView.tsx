import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Vacio } from '@/components/ui/Estado'
import { Visor } from '@/components/Visor'
import { useEmpresa, empresaDelPapel } from '@/lib/api/empresa'
import { useAnularOc, useAprobarOc, useReabrirOc, type Orden, type PermisosPedidos } from '@/lib/api/pedidos'
import { fechaHoraVE, money, quienSolicita } from '@/lib/pedidos'
import { textoLoteAprobacion } from '@/lib/ficha/pedidosWhatsapp'
import { armarChecklistOcPdf } from '@/lib/ficha/pedidosPdf'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { ModalWhatsappCompra } from '@/pages/compras/ModalWhatsappCompra'
import { ConfirmDialog, MotivoModal } from './Dialogos'

/*
  «📋 OC POR LOTE» (MGG `OcPorLoteView`, `ocLote.repository.ts`, `checklistOcPdf.ts`)

  La lista de las OC «Ordenes pendiente por aprobar» (con «Incluir
  confirmadas», también las ya aprobadas), para marcar varias y aprobarlas
  juntas, reabrirlas («✎ Modificar») o anularlas, y sacar el PDF de la relación.

  Lo que cambia:
    - «✉ Enviar por correo» no está: La Cantera no tiene la función que manda
      el PDF por correo. En su lugar, «💬 WhatsApp» con la relación (como el
      resto del módulo).
    - «Incluir confirmadas» suma todos los estados después de la aprobación
      (MGG solo oc_aprobada, pagada, recibida y finalizada: deja fuera
      «Confirmada (indicar método)», crédito y «por recibir», que aquí son el
      paso siguiente más común).
    - El texto de «Aprobar en lote» no dice «Pasarán a Tesorería»: no hay
      Tesorería. Cada una va adonde dicta su condición de pago.
*/

const CONFIRMADAS = new Set(['confirmada_metodo', 'cuenta_abierta', 'oc_aprobada', 'por_recibir', 'pagada', 'recibida', 'finalizada'])

/** MGG: «notas · nombre [marca · modelo] (cantidad), …». */
function descripcion(o: Orden): string {
  const items = (o.items ?? [])
    .filter((i) => i.comprar !== false)
    .map((i) => `${i.nombre}${[i.marca, i.modelo].filter(Boolean).length ? ` [${[i.marca, i.modelo].filter(Boolean).join(' · ')}]` : ''} (${Number(i.cantidad)})`)
    .join(', ')
  return [o.notas?.trim(), items].filter(Boolean).join(' · ') || '—'
}

export function OcPorLoteView({
  ordenes,
  permisos,
  cargando,
  proveedor,
  onOpen,
}: {
  ordenes: Orden[]
  permisos: PermisosPedidos
  cargando: boolean
  proveedor: (id: number | null | undefined) => string | null
  onOpen: (id: number) => void
}) {
  const isAdmin = permisos.gestiona
  const soloAdmin = permisos.aprueba_oc
  const [incluirConfirmadas, setIncluirConfirmadas] = useState(false)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [dialogo, setDialogo] = useState<'aprobar' | 'modificar' | 'anular' | null>(null)
  const [ws, setWs] = useState<string | null>(null)
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [errorPdf, setErrorPdf] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const { data: empresa } = useEmpresa()
  const aprobar = useAprobarOc()
  const reabrir = useReabrirOc()
  const anular = useAnularOc()

  const lista = useMemo(
    () =>
      ordenes
        .filter((o) => o.clase !== 'servicio' && (o.estado === 'oc_creada' || (incluirConfirmadas && CONFIRMADAS.has(o.estado))))
        .sort((a, b) => (b.oc_creada_en ?? '').localeCompare(a.oc_creada_en ?? '')),
    [ordenes, incluirConfirmadas],
  )
  const marcadas = lista.filter((o) => sel.has(o.id))
  const porConfirmar = marcadas.filter((o) => o.estado === 'oc_creada')
  const total = lista.reduce((a, o) => a + (Number(o.total) || 0), 0)
  const todas = lista.length > 0 && lista.every((o) => sel.has(o.id))
  const provDe = (o: Orden) => proveedor(o.proveedor_id) ?? ''

  const alternar = (id: number) =>
    setSel((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  function exigir(): boolean {
    if (!porConfirmar.length) {
      toast('Seleccioná al menos una OC por confirmar', 'error')
      return false
    }
    return true
  }

  async function aprobarLote() {
    try {
      const r = await aprobar.mutateAsync(porConfirmar.map((o) => o.id))
      toast(`${r.length} orden(es) de compra confirmada(s) · cada una sigue su flujo según la condición de pago`, 'success')
      setSel(new Set())
      setDialogo(null)
    } catch (e) {
      toast(mensajeDe(e, 'Error al confirmar'), 'error')
    }
  }

  async function modificarLote() {
    setOcupado(true)
    let n = 0
    try {
      for (const o of porConfirmar) {
        await reabrir.mutateAsync({ id: o.id, motivo: null })
        n++
      }
      toast(`${n} OC reabierta(s) para re-elegir oferta`, 'info')
      setSel(new Set())
      setDialogo(null)
    } catch (e) {
      toast(`${mensajeDe(e, 'No se pudo reabrir')} · se reabrieron ${n} de ${porConfirmar.length}.`, 'error')
    } finally {
      setOcupado(false)
    }
  }

  async function anularLote(motivo: string) {
    setOcupado(true)
    let n = 0
    try {
      for (const o of porConfirmar) {
        await anular.mutateAsync({ id: o.id, motivo })
        n++
      }
      toast(`${n} OC anulada(s)`, 'warning')
      setSel(new Set())
      setDialogo(null)
    } catch (e) {
      toast(`${mensajeDe(e, 'No se pudo anular')} · se anularon ${n} de ${porConfirmar.length}.`, 'error')
    } finally {
      setOcupado(false)
    }
  }

  async function verPdf() {
    if (!marcadas.length) {
      toast('Seleccioná al menos una orden para el PDF', 'error')
      return
    }
    try {
      setErrorPdf(null)
      setPdf(await armarChecklistOcPdf(marcadas, empresaDelPapel(empresa), { proveedorDe: provDe, descripcionDe: descripcion }))
    } catch (e) {
      setErrorPdf(mensajeDe(e, 'No se pudo generar el PDF'))
    }
  }

  function verWhatsapp() {
    if (!marcadas.length) {
      toast('Seleccioná al menos una orden', 'error')
      return
    }
    setWs(textoLoteAprobacion(marcadas, { proveedorDe: provDe, empresa: empresaDelPapel(empresa).razonSocial }))
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin || soloAdmin ? (
            <>
              {soloAdmin ? (
                <Button onClick={() => exigir() && setDialogo('aprobar')}>✔ Aprobar en lote ({porConfirmar.length})</Button>
              ) : null}
              {isAdmin ? (
                <>
                  <Button variant="ghost" title="Reabrir las OC seleccionadas para re-elegir oferta" onClick={() => exigir() && setDialogo('modificar')}>
                    ✎ Modificar ({porConfirmar.length})
                  </Button>
                  <Button variant="danger" title="Anular las OC seleccionadas" onClick={() => exigir() && setDialogo('anular')}>
                    ⊘ Anular ({porConfirmar.length})
                  </Button>
                </>
              ) : null}
            </>
          ) : null}
          <Button variant="ghost" onClick={() => void verPdf()}>
            ↓ PDF ({marcadas.length})
          </Button>
          <Button variant="ghost" onClick={verWhatsapp}>
            💬 WhatsApp ({marcadas.length})
          </Button>
          <label className="text-ink/60 flex cursor-pointer items-center gap-1.5 text-sm">
            <input type="checkbox" checked={incluirConfirmadas} onChange={(e) => setIncluirConfirmadas(e.target.checked)} />
            Incluir confirmadas
          </label>
        </div>
        <span className="text-ink/55 text-sm">
          {lista.length} orden(es) · Total <strong className="font-mono">{money(total)}</strong>
        </span>
      </div>

      <Card flush className="overflow-x-auto">
        <div className="text-royal-700 dark:text-royal-300 px-4 pt-3 pb-2 text-center text-sm font-extrabold tracking-wide uppercase">
          Órdenes de compra pendientes
        </div>
        {cargando ? (
          <p className="text-ink/50 px-4 py-6 text-sm">Cargando…</p>
        ) : !lista.length ? (
          <Vacio icono={<span className="text-3xl">🧾</span>} titulo="Sin compras pendientes por confirmar" />
        ) : (
          <table className="w-full min-w-[980px] text-[13px]">
            <thead className="text-ink/55 border-hairline border-b text-left text-xs">
              <tr>
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todas"
                    checked={todas}
                    onChange={() => setSel(todas ? new Set() : new Set(lista.map((o) => o.id)))}
                  />
                </th>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">N°ODC</th>
                <th className="px-3 py-2 font-medium">Solicitado por</th>
                <th className="px-3 py-2 font-medium">Proveedor</th>
                <th className="px-3 py-2 font-medium">Descripción</th>
                <th className="px-3 py-2 text-right font-medium">Monto $</th>
                <th className="px-3 py-2 font-medium">Fecha de compra</th>
                <th className="px-3 py-2 font-medium">Fecha de firma</th>
                <th className="px-3 py-2 font-medium">Estatus</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((o, i) => {
                const pagado = o.estado !== 'oc_creada'
                return (
                  <tr key={o.id} className="border-hairline hover:bg-ink/3 border-b last:border-b-0">
                    <td className="px-3 py-2">
                      <input type="checkbox" aria-label={`Seleccionar ${o.oc_codigo ?? o.codigo}`} checked={sel.has(o.id)} onChange={() => alternar(o.id)} />
                    </td>
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2 font-mono">
                      <button type="button" className="text-royal-700 dark:text-royal-300 hover:underline" onClick={() => onOpen(o.id)}>
                        {o.oc_codigo ?? o.codigo}
                      </button>
                      {o.urgente ? <div className="text-danger font-sans text-[10px] font-semibold">🚨 URGENTE</div> : null}
                    </td>
                    <td className="px-3 py-2">
                      {quienSolicita(o) ?? '—'}
                      {o.unidad_solicitante ? <div className="text-ink/45 text-xs">{o.unidad_solicitante}</div> : null}
                    </td>
                    <td className="px-3 py-2">{provDe(o) || '—'}</td>
                    <td className="text-ink/70 max-w-[320px] px-3 py-2 text-xs">{descripcion(o)}</td>
                    <td className="px-3 py-2 text-right font-mono">{money(o.total)}</td>
                    <td className="text-ink/60 px-3 py-2 text-xs">{o.oc_creada_en ? fechaHoraVE(o.oc_creada_en) : '—'}</td>
                    <td className="text-ink/60 px-3 py-2 text-xs">{o.oc_aprobada_en ? fechaHoraVE(o.oc_aprobada_en) : '—'}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-[6px] px-2 py-0.5 text-[11px] font-bold text-white ${pagado ? 'bg-success' : 'bg-danger'}`}
                      >
                        {pagado ? 'CONFIRMADA' : 'PENDIENTE POR CONFIRMAR'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      {dialogo === 'aprobar' ? (
        <ConfirmDialog
          title="Aprobar órdenes de compra en lote"
          message={`Vas a confirmar ${porConfirmar.length} orden(es) de compra. Cada una sigue según su condición de pago: contado o anticipado a «Confirmada (indicar método de pago)», crédito a «Crédito · cuenta abierta» y contra entrega a «Pendiente por recepción». ¿Continuar?`}
          confirmText={aprobar.isPending ? 'Aprobando…' : 'Aprobar en lote'}
          success
          busy={aprobar.isPending}
          onCancel={() => setDialogo(null)}
          onConfirm={() => void aprobarLote()}
        />
      ) : null}

      {dialogo === 'modificar' ? (
        <ConfirmDialog
          title="Modificar órdenes de compra en lote"
          message={`Vas a reabrir ${porConfirmar.length} orden(es) de compra a “Pendiente · cargar ofertas” para re-elegir la oferta ganadora. ¿Continuar?`}
          confirmText="Modificar (volver a ofertas)"
          busy={ocupado}
          onCancel={() => setDialogo(null)}
          onConfirm={() => void modificarLote()}
        />
      ) : null}

      {dialogo === 'anular' ? (
        <MotivoModal
          title="Anular órdenes de compra en lote"
          intro={`Las ${porConfirmar.length} OC seleccionadas pasan a estado ANULADA. No mueven inventario ni caja.`}
          label="Motivo de la anulación"
          placeholder="Ya no se requiere, error de carga, se reemplaza por otra…"
          confirmText={`Anular ${porConfirmar.length} OC`}
          doubleConfirm={`¿Seguro que querés anular ${porConfirmar.length} OC? Esta acción no se puede deshacer.`}
          busy={ocupado}
          onClose={() => setDialogo(null)}
          onConfirm={(m) => void anularLote(m)}
        />
      ) : null}

      {ws ? <ModalWhatsappCompra titulo="Órdenes de compra por aprobar" texto={ws} onCerrar={() => setWs(null)} /> : null}

      <Visor
        abierto={pdf !== null || errorPdf !== null}
        error={errorPdf}
        onCerrar={() => {
          setPdf(null)
          setErrorPdf(null)
        }}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? 'checklist-oc.pdf'}
        titulo="Órdenes de compra pendientes por confirmación"
        descripcion={empresaDelPapel(empresa).razonSocial}
      />
    </>
  )
}
