import { useState } from 'react'
import { Check, Clock, Undo2, X } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { dinero, fechaHora } from '@/lib/formato'
import { useMiPerfil, useMisAcciones } from '@/lib/api/usuarios'
import {
  AUTORIZAR_FACTURA,
  useAutorizarFactura,
  useFacturasPorAutorizar,
  useRechazarFacturaPorAutorizar,
  useRetirarFacturaPorAutorizar,
  type FacturaPorAutorizar,
} from '@/lib/api/facturacion'

/*
  LAS FACTURAS POR AUTORIZAR, ENCIMA DE LAS EMITIDAS.

  Christopher, 18/09/2026: a quien se le restringe «Autorizar y emitir
  facturas» prepara la factura «pero hasta ahí». Esto es el «hasta ahí» visto
  desde los dos lados:

  - quien autoriza ve lo que espera, con el cliente, lo que suma y quién lo
    preparó, y la emite o la rechaza con motivo;
  - quien la preparó ve que sigue esperando, puede retirarla, y ve durante una
    semana qué pasó con ella —la factura que salió o por qué se rechazó—.

  No se pinta nada si no hay nada que enseñar: una tarjeta vacía encima de las
  facturas sería ruido para quien nunca prepara ni autoriza.

  EL TOTAL ES EL QUE VIO QUIEN LA PREPARÓ. La base emite con la tasa del día en
  que se autoriza, así que en bolívares puede cambiar; se dice.
*/
export function FacturasPorAutorizar({ onEmitida }: { onEmitida?: (facturaId: number) => void }) {
  const { data, error } = useFacturasPorAutorizar()
  const { data: yo } = useMiPerfil()
  const { puede: casilla } = useMisAcciones()
  const autoriza = casilla(AUTORIZAR_FACTURA)

  const autorizar = useAutorizarFactura()
  const rechazar = useRechazarFacturaPorAutorizar()
  const retirar = useRetirarFacturaPorAutorizar()
  const [rechazando, setRechazando] = useState<FacturaPorAutorizar | null>(null)
  const [retirando, setRetirando] = useState<FacturaPorAutorizar | null>(null)
  const [autorizandoId, setAutorizandoId] = useState<number | null>(null)

  const miId = yo?.id
  // Quien autoriza ve todas las que esperan; quien prepara, las suyas.
  const visibles = (data ?? []).filter(
    (s) => (autoriza && s.estado === 'POR_AUTORIZAR') || s.preparada_por === miId,
  )
  const esperan = visibles.filter((s) => s.estado === 'POR_AUTORIZAR')
  const decididas = visibles.filter((s) => s.estado !== 'POR_AUTORIZAR')

  if (error) return <ErrorDeCarga error={error} className="mb-4" />
  if (visibles.length === 0) return null

  return (
    <Card className="mb-4">
      <CardHeader
        title={esperan.length === 1 ? '1 factura por autorizar' : `${esperan.length} facturas por autorizar`}
        subtitle={
          autoriza
            ? 'Todavía no son facturas: no tienen número de control ni tocaron el patio. Al autorizarla se emite con la tasa de hoy.'
            : 'Las preparaste tú. Quien tenga la casilla «Autorizar y emitir facturas» las emite o las rechaza.'
        }
      />

      {autorizar.error ? <ErrorDeCarga error={autorizar.error} className="mt-3" /> : null}

      <ul className="divide-hairline mt-3 divide-y">
        {[...esperan, ...decididas].map((s) => {
          const mia = s.preparada_por === miId
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-ink/85 text-sm font-medium">
                  <span className="tabular">{s.numero}</span> · {s.cliente}
                </p>
                <p className="text-ink/50 text-xs">
                  {s.origen === 'NOTAS'
                    ? `De ${s.notas ?? 'notas de entrega'}`
                    : `Sin nota, ${s.cuantos} renglón(es)`}
                  {' · '}preparada por {mia ? 'ti' : (s.preparada_por_nombre ?? 'alguien')},{' '}
                  {fechaHora(s.preparada_en)}
                </p>
                {s.estado === 'RECHAZADA' || s.estado === 'RETIRADA' ? (
                  <p className="text-ink/60 mt-1 text-xs">
                    {s.estado === 'RECHAZADA'
                      ? `Rechazada por ${s.decidida_por_nombre ?? 'alguien'}: `
                      : 'Retirada: '}
                    <span className="italic">{s.motivo}</span>
                  </p>
                ) : null}
                {s.estado === 'AUTORIZADA' ? (
                  <p className="text-ink/60 mt-1 text-xs">
                    Autorizada por {s.decidida_por_nombre ?? 'alguien'}: salió como{' '}
                    <span className="tabular font-medium">{s.factura_numero}</span>
                  </p>
                ) : null}
              </div>

              <span className="tabular text-ink/80 text-sm font-medium" title="Lo que vio quien la preparó">
                {dinero(s.moneda, s.total_estimado)}
              </span>

              {s.estado === 'POR_AUTORIZAR' ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {autoriza && !mia ? (
                    <>
                      <Button
                        size="sm"
                        icon={<Check />}
                        disabled={autorizar.isPending}
                        onClick={() => {
                          setAutorizandoId(s.id)
                          void autorizar
                            .mutateAsync(s.id)
                            .then((facturaId) => onEmitida?.(facturaId))
                            .catch(() => {})
                            .finally(() => setAutorizandoId(null))
                        }}
                      >
                        {autorizandoId === s.id ? 'Emitiendo…' : 'Autorizar y emitir'}
                      </Button>
                      <Button size="sm" variant="ghost" icon={<X />} onClick={() => setRechazando(s)}>
                        Rechazar
                      </Button>
                    </>
                  ) : (
                    <Chip tone="warning" icon={<Clock />}>
                      Esperando autorización
                    </Chip>
                  )}
                  {mia ? (
                    <Button size="sm" variant="ghost" icon={<Undo2 />} onClick={() => setRetirando(s)}>
                      Retirar
                    </Button>
                  ) : null}
                </div>
              ) : (
                <Chip tone={s.estado === 'AUTORIZADA' ? 'success' : 'neutral'}>
                  {s.estado === 'AUTORIZADA' ? 'Emitida' : s.estado === 'RECHAZADA' ? 'Rechazada' : 'Retirada'}
                </Chip>
              )}
            </li>
          )
        })}
      </ul>

      {rechazando ? (
        <ConMotivo
          titulo={`Rechazar ${rechazando.numero}`}
          descripcion="No se emite nada. Quien la preparó lee el motivo y, si hace falta, prepara otra."
          etiqueta="Por qué se rechaza"
          boton="Rechazar"
          accion={rechazar}
          id={rechazando.id}
          onCerrar={() => {
            rechazar.reset()
            setRechazando(null)
          }}
        />
      ) : null}

      {retirando ? (
        <ConMotivo
          titulo={`Retirar ${retirando.numero}`}
          descripcion="Deja de esperar autorización. Sus notas de entrega vuelven a quedar libres para otra factura."
          etiqueta="Por qué se retira"
          boton="Retirar"
          accion={retirar}
          id={retirando.id}
          onCerrar={() => {
            retirar.reset()
            setRetirando(null)
          }}
        />
      ) : null}
    </Card>
  )
}

function ConMotivo({
  titulo,
  descripcion,
  etiqueta,
  boton,
  accion,
  id,
  onCerrar,
}: {
  titulo: string
  descripcion: string
  etiqueta: string
  boton: string
  accion: ReturnType<typeof useRechazarFacturaPorAutorizar>
  id: number
  onCerrar: () => void
}) {
  const [motivo, setMotivo] = useState('')

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={titulo}
      descripcion={descripcion}
      ancho="sm"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={accion.isPending || motivo.trim().length < 5}
            onClick={() =>
              void accion
                .mutateAsync({ id, motivo })
                .then(onCerrar)
                .catch(() => {})
            }
          >
            {accion.isPending ? 'Guardando…' : boton}
          </Button>
        </>
      }
    >
      <Textarea label={etiqueta} rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      {accion.error ? <ErrorDeCarga error={accion.error} className="mt-3" /> : null}
    </Modal>
  )
}
