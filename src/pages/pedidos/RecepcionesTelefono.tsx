import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Vacio } from '@/components/ui/Estado'
import { cn } from '@/lib/cn'
import { useEmpresa, empresaDelPapel } from '@/lib/api/empresa'
import type { PorRecibir, Recepcion } from '@/lib/api/pedidos'
import { ETIQUETA_ALMACEN, progresoRecepcion, relTime, renglonesARecibir } from '@/lib/pedidos'
import { mensajeDe } from '@/lib/avisosFlotantes'
import { mensajeRecepcion } from '@/lib/ficha/pedidosWhatsapp'
import { ModalWhatsappCompra } from '@/pages/compras/ModalWhatsappCompra'
import { FormularioRecepcion, type RecepcionHecha } from './RecibirOrdenModal'
import { HistoricoRecepciones } from './RecepcionesPorRecibir'

/*
  📥 RECEPCIONES EN EL TELÉFONO (MGG `RecepcionesTelefono.tsx`)

  El almacenista recepciona desde su teléfono: ve las OC por recibir, elige
  una, dice cuánto llegó (con fotos, nota y la factura / nota de entrega) y la
  mercancía entra al inventario del Almacén General; la orden queda recibida
  en Compras y sale su WhatsApp. Debajo, el histórico de lo recibido con el
  WhatsApp de cada recepción. Nada se manda solo.

  Sin Delivery ni sedes: no hay «🛵 Delivery encargado» ni almacén que elegir.
*/

export function RecepcionesTelefono({
  filas,
  cargando,
  error,
  canWrite,
  onVolver,
}: {
  filas: PorRecibir[]
  cargando: boolean
  error: unknown
  canWrite: boolean
  onVolver: () => void
}) {
  const { data: empresa } = useEmpresa()
  const empresaNombre = empresaDelPapel(empresa).razonSocial
  const [vista, setVista] = useState<'lista' | 'historico'>('lista')
  const [elegida, setElegida] = useState<PorRecibir | null>(null)
  const [listo, setListo] = useState<RecepcionHecha | null>(null)
  const [whatsapp, setWhatsapp] = useState<Recepcion | null>(null)

  if (listo) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">✅</span>
          <strong className="text-lg">Recepción {listo.recepcion.codigo} registrada</strong>
        </div>
        <p className="text-ink/60 text-sm">
          {listo.recepcion.sin_inventario
            ? 'Quedó registrada sin sumar al inventario.'
            : `Entró al inventario de ${ETIQUETA_ALMACEN}`}
          {listo.cerrada ? ' y la orden quedó recibida en Compras.' : '. Lo que falta queda pendiente para otra recepción.'}
        </p>
        <Button block size="lg" onClick={() => setWhatsapp(listo.recepcion)}>
          💬 Mensaje de WhatsApp
        </Button>
        <Button block variant="ghost" onClick={() => setListo(null)}>
          ← Volver a recepciones
        </Button>
        {whatsapp ? (
          <ModalWhatsappCompra
            titulo={`📥 Recepción ${whatsapp.codigo}`}
            texto={mensajeRecepcion(whatsapp, { empresa: empresaNombre })}
            onCerrar={() => setWhatsapp(null)}
          />
        ) : null}
      </div>
    )
  }

  if (elegida) {
    return (
      <FormularioRecepcion
        key={elegida.orden.id}
        orden={elegida.orden}
        proveedor={elegida.proveedor}
        variante="telefono"
        onCancel={() => setElegida(null)}
        onHecho={(r) => {
          setElegida(null)
          setListo(r)
          setWhatsapp(r.recepcion)
        }}
      />
    )
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-lg">📥 Recepciones · {ETIQUETA_ALMACEN}</strong>
        <Button variant="ghost" onClick={onVolver}>
          ← Volver
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" variant={vista === 'lista' ? 'primary' : 'ghost'} onClick={() => setVista('lista')}>
          Por recibir ({filas.length})
        </Button>
        <Button size="lg" variant={vista === 'historico' ? 'primary' : 'ghost'} onClick={() => setVista('historico')}>
          🧾 Histórico
        </Button>
      </div>

      {vista === 'historico' ? (
        <HistoricoRecepciones compacto onWhatsapp={(r) => setWhatsapp(r)} />
      ) : error ? (
        <p className="text-danger text-sm">{mensajeDe(error, 'No se pudieron leer las recepciones')}</p>
      ) : cargando ? (
        <p className="text-ink/50 text-sm">Cargando…</p>
      ) : filas.length === 0 ? (
        <Vacio icono={<span className="text-3xl">📦</span>} titulo="No hay órdenes por recibir" />
      ) : (
        <>
          <h2 className="font-semibold">{filas.length} orden(es) por recibir</h2>
          <div className="space-y-2">
            {filas.map((f) => {
              const o = f.orden
              const prog = progresoRecepcion(o)
              return (
                <button
                  key={o.id}
                  type="button"
                  disabled={!canWrite}
                  onClick={() => setElegida(f)}
                  className={cn(
                    'bg-surface shadow-card flex w-full items-center gap-3 rounded-[10px] border p-3 text-left disabled:opacity-60',
                    o.urgente ? 'border-danger' : 'border-transparent',
                  )}
                >
                  <span className="text-2xl">{o.urgente ? '🚨' : '📦'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {o.oc_codigo ?? o.codigo} · {f.proveedor ?? '—'}
                    </span>
                    <span className="text-ink/55 block text-xs">
                      {renglonesARecibir(o).length} material(es) · {relTime(o.pagada_en ?? o.oc_aprobada_en ?? o.creado_en)}
                    </span>
                    {prog.parcial ? (
                      <span className="text-warning block text-xs">
                        Recepción parcial · {prog.completos}/{prog.total} completos
                      </span>
                    ) : null}
                  </span>
                  <span className="text-lg">›</span>
                </button>
              )
            })}
          </div>
          {!canWrite ? (
            <small className="text-ink/50">Tu rol solo puede ver: para recepcionar hace falta escritura en Inventario.</small>
          ) : null}
        </>
      )}

      {whatsapp ? (
        <ModalWhatsappCompra
          titulo={`📥 Recepción ${whatsapp.codigo}`}
          texto={mensajeRecepcion(whatsapp, { empresa: empresaNombre })}
          onCerrar={() => setWhatsapp(null)}
        />
      ) : null}
    </section>
  )
}
