import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { useDevoluciones, useResolverDevolucion, type Devolucion, type Orden } from '@/lib/api/pedidos'
import { fechaHoraVE, fmtCant, MOTIVO_NO_ENTRA } from '@/lib/pedidos'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'

/*
  LO QUE EL ALMACÉN NO RECIBIÓ, Y QUÉ HACE COMPRAS CON ELLO (la dueña, 09/11/2026)

  «Si un producto no entra al inventario porque van a cambiarlo con el
  proveedor, hubo una equivocación al momento de la compra o vino defectuoso,
  la compra vuelve a cotizarse, solo por ese producto, por si existe un cambio
  y se debe pagar la diferencia. Solo los de compras determinan qué hacer.»

  Tres decisiones:
    - Lo cambia el proveedor: sigue pendiente de recibir en esta OC.
    - Volver a cotizar: nace una SP nueva, ya aprobada, solo con ese producto.
    - No se repone: en esta OC ya no se espera.
*/

type Decision = 'cambio_proveedor' | 'recotizar' | 'descartar'

const ESTADO: Record<Devolucion['estado'], { texto: string; tono: 'warning' | 'success' | 'neutral' | 'info' }> = {
  pendiente: { texto: 'Esperando a Compras', tono: 'warning' },
  cambio_proveedor: { texto: 'Lo cambia el proveedor', tono: 'info' },
  recotizada: { texto: 'Se volvió a cotizar', tono: 'success' },
  descartada: { texto: 'No se repone', tono: 'neutral' },
}

const DECISION: Record<Decision, { boton: string; ayuda: string }> = {
  cambio_proveedor: {
    boton: '🔄 Lo cambia el proveedor',
    ayuda: 'El proveedor trae el reemplazo: el producto sigue pendiente de recibir en esta OC.',
  },
  recotizar: {
    boton: '🛒 Volver a cotizar',
    ayuda: 'Nace una SP nueva, ya aprobada, solo con este producto, para cotizarlo otra vez (y pagar la diferencia si la hay).',
  },
  descartar: {
    boton: '✕ No se repone',
    ayuda: 'En esta OC ya no se espera. Si no falta nada más, la recepción se cierra.',
  },
}

export function DevolucionesDeOrden({ orden: o, puedeDecidir }: { orden: Orden; puedeDecidir: boolean }) {
  const { data } = useDevoluciones(o.id)
  const resolver = useResolverDevolucion()
  const [abierta, setAbierta] = useState<{ id: number; decision: Decision } | null>(null)
  const [nota, setNota] = useState('')

  if (!data?.length) return null
  const pendientes = data.filter((d) => d.estado === 'pendiente').length

  async function decidir() {
    if (!abierta) return
    try {
      const r = await resolver.mutateAsync({ id: abierta.id, decision: abierta.decision, nota: nota.trim() || null })
      toast(
        r.nueva_codigo
          ? `Se creó ${r.nueva_codigo} para volver a cotizar el producto`
          : r.cerro_recepcion
            ? 'Decidido · la recepción de la OC quedó cerrada'
            : 'Decidido',
        'success',
      )
      setAbierta(null)
      setNota('')
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo guardar la decisión'), 'error')
    }
  }

  return (
    <div className="border-warning bg-warning/6 mt-4 rounded-[8px] border px-3 py-2.5">
      <h4 className="text-ink/85 mb-1 font-semibold">
        ↩ Productos para cambiar o devolver{pendientes ? ` · ${pendientes} esperando a Compras` : ''}
      </h4>
      <p className="text-ink/60 mb-2 text-xs">
        El almacén no los recibió. Compras decide: que los cambie el proveedor, volver a cotizarlos o no reponerlos.
      </p>
      <ul className="space-y-2">
        {data.map((d) => {
          const e = ESTADO[d.estado]
          return (
            <li key={d.id} className="border-hairline bg-surface rounded-[6px] border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{d.nombre}</strong>
                <span className="text-ink/60">
                  {fmtCant(Number(d.cantidad))} {d.unidad ?? ''}
                </span>
                <Chip tone="warning">{MOTIVO_NO_ENTRA[d.motivo]}</Chip>
                <Chip tone={e.tono}>{e.texto}</Chip>
              </div>
              {d.nota ? <div className="text-ink/70 text-xs">📝 {d.nota}</div> : null}
              <div className="text-ink/50 text-xs">
                Almacén · {d.creada_por_nombre ?? '—'} · {fechaHoraVE(d.creada_en)}
                {d.resuelta_en ? ` · Compras · ${d.resuelta_por_nombre ?? '—'} · ${fechaHoraVE(d.resuelta_en)}` : ''}
              </div>
              {d.decision_nota ? <div className="text-ink/70 text-xs">Compras: {d.decision_nota}</div> : null}

              {d.estado === 'pendiente' && puedeDecidir ? (
                abierta?.id === d.id ? (
                  <div className="mt-2 space-y-2">
                    <div className="text-ink/70 text-xs">{DECISION[abierta.decision].ayuda}</div>
                    <input
                      className="border-ink/20 bg-surface h-9 w-full rounded-[6px] border px-2 text-sm"
                      placeholder="Nota de Compras"
                      aria-label="Nota de Compras"
                      maxLength={300}
                      value={nota}
                      onChange={(ev) => setNota(ev.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" disabled={resolver.isPending} onClick={() => void decidir()}>
                        {resolver.isPending ? 'Guardando…' : `Confirmar: ${DECISION[abierta.decision].boton}`}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={resolver.isPending} onClick={() => setAbierta(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(Object.keys(DECISION) as Decision[]).map((k) => (
                      <Button
                        key={k}
                        size="sm"
                        variant={k === 'recotizar' ? 'primary' : 'ghost'}
                        title={DECISION[k].ayuda}
                        onClick={() => {
                          setAbierta({ id: d.id, decision: k })
                          setNota('')
                        }}
                      >
                        {DECISION[k].boton}
                      </Button>
                    ))}
                  </div>
                )
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
