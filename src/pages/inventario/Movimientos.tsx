import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowDownLeft, ArrowUpRight, ScrollText, Undo2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useMisRoles, usePerfiles } from '@/lib/api/catalogo'
import {
  TIPOS_MOVIMIENTO,
  useAlmacenes,
  useMovimientos,
  useReversarMovimiento,
} from '@/lib/api/inventario'
import { dolares } from '@/lib/formato'
import { cn } from '@/lib/cn'

function fechaHora(iso: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function Movimientos() {
  const { data: almacenes } = useAlmacenes()
  const { data: perfiles } = usePerfiles()
  const { puede } = useMisRoles()
  const reversar = useReversarMovimiento()

  const [almacenId, setAlmacenId] = useState('')
  const { data, isPending, error } = useMovimientos(
    almacenId ? { almacenId: Number(almacenId) } : {},
  )

  const [reversando, setReversando] = useState<{ id: number; numero: string } | null>(null)
  const [motivo, setMotivo] = useState('')

  const nombreDe = (uid: string | null) =>
    (uid && perfiles?.find((p) => p.id === uid)?.nombre) || '—'

  return (
    <>
      <PageHeader
        title="Movimientos"
        description="El libro del inventario. Nada se edita y nada se borra: una corrección se escribe como un movimiento nuevo."
      />

      <Card className="mb-4 sm:max-w-xs">
        <Select
          label="Almacén"
          vacio="Todos"
          value={almacenId}
          onChange={(e) => setAlmacenId(e.target.value)}
          opciones={(almacenes ?? []).map((a) => ({ valor: String(a.id), etiqueta: a.nombre }))}
        />
      </Card>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<ScrollText />}
            titulo="El libro está en blanco"
            descripcion="La primera línea la escribe la primera recepción de una compra."
          />
        </Card>
      ) : null}

      {data && data.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Movimiento</th>
                  <th className="px-3 py-3 font-medium">Artículo</th>
                  <th className="px-3 py-3 font-medium">Almacén</th>
                  <th className="px-3 py-3 text-right font-medium">Cantidad</th>
                  <th className="px-3 py-3 text-right font-medium">Valor</th>
                  <th className="px-5 py-3 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {data.map((m) => (
                  <tr key={m.id} className="border-hairline border-b last:border-0 align-top">
                    <td className="px-5 py-3">
                      <p className="text-ink/45 font-mono text-2xs">{m.numero}</p>
                      <p className="text-ink/85 font-medium">
                        {TIPOS_MOVIMIENTO[m.tipo] ?? m.tipo}
                      </p>
                      <p className="text-ink/45 text-xs">
                        {fechaHora(m.registrado_en)} · {nombreDe(m.registrado_por)}
                      </p>
                      {m.nota ? (
                        <p className="text-ink/55 mt-0.5 max-w-xs text-xs italic">«{m.nota}»</p>
                      ) : null}
                    </td>

                    <td className="text-ink/75 px-3 py-3">
                      {m.articulo?.nombre ?? '—'}
                      <span className="text-ink/40 block font-mono text-2xs">
                        {m.articulo?.codigo}
                      </span>
                    </td>

                    <td className="text-ink/65 px-3 py-3">{m.almacen?.nombre ?? '—'}</td>

                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <span
                        className={cn(
                          'tabular inline-flex items-center gap-1 font-semibold',
                          m.signo > 0 ? 'text-success' : 'text-danger',
                        )}
                      >
                        {m.signo > 0 ? (
                          <ArrowDownLeft className="size-3.5" />
                        ) : (
                          <ArrowUpRight className="size-3.5" />
                        )}
                        {m.signo > 0 ? '+' : '−'}
                        {m.cantidad}
                      </span>
                      <span className="text-ink/45 ml-1 text-xs">{m.unidad}</span>
                    </td>

                    <td className="tabular text-ink/70 px-3 py-3 text-right">
                      {dolares(m.valor_usd)}
                    </td>

                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {m.orden_id ? (
                        <Chip tone="royal" className="mr-2">
                          <Link to={`/app/compras`}>Compra</Link>
                        </Chip>
                      ) : null}
                      {puede('ALMACEN') && m.tipo !== 'REVERSO' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Undo2 />}
                          onClick={() => {
                            setMotivo('')
                            setReversando({ id: m.id, numero: m.numero })
                          }}
                        >
                          Reversar
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {reversando ? (
        <Modal
          abierto
          onCerrar={() => setReversando(null)}
          titulo="Reversar el movimiento"
          descripcion={`Se escribe el movimiento contrario a ${reversando.numero}. El original se queda en el libro.`}
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setReversando(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={motivo.trim().length < 4 || reversar.isPending}
                onClick={async () => {
                  await reversar.mutateAsync({ id: reversando.id, motivo })
                  setReversando(null)
                }}
              >
                {reversar.isPending ? 'Guardando…' : 'Reversar'}
              </Button>
            </>
          }
        >
          <Textarea
            label="Por qué se reversa"
            rows={3}
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          {reversar.error ? <ErrorDeCarga error={reversar.error} className="mt-3" /> : null}
        </Modal>
      ) : null}
    </>
  )
}
