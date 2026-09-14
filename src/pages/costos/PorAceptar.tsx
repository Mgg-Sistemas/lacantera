/*
  Por aceptar.

  Lo que otros módulos registraron y todavía no entró al libro: viajes,
  salidas de planta y gastos fijos. Se acepta o se rechaza; nada entra solo.
  «Aceptar todo el día» existe para los viajes y las salidas, que son muchos
  y de poco riesgo por fila; lo que trae aviso se salta y se dice.

  Debajo, lo rechazado en esta caja —que se puede deshacer con Total— y lo
  que se anuló después de aceptarse, que hay que reversar.
*/
import { useState } from 'react'
import { AlertTriangle, Check, Inbox, RotateCcw, Undo2, X } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import {
  useAceptar,
  useAceptarDia,
  useCandidatos,
  useDeshacerRechazo,
  useRechazar,
  useRechazosVigentes,
  useReversar,
  useReversosPendientes,
  type CajaCosto,
  type Candidato,
  type Decision,
  type ReversoPendiente,
} from '@/lib/api/costos'
import { useMisPermisos } from '@/lib/api/usuarios'
import { enteros, fecha as fmtFecha } from '@/lib/formato'
import { aTexto, dineroONada, ORIGENES } from './formato'

const AVISOS: Record<NonNullable<Candidato['aviso']>, { texto: string; tone: 'danger' | 'warning' }> = {
  SIN_PRECIO: { texto: 'Sin precio: corrígelo en Viajes', tone: 'danger' },
  PRECIO_RARO: { texto: 'Precio fuera de lo usual', tone: 'warning' },
  SIN_M3: { texto: 'Sin m³', tone: 'warning' },
}

export function PorAceptar({ caja }: { caja: CajaCosto }) {
  const { puede } = useMisPermisos()
  const puedeAceptar = puede('COSTOS', 'ESCRITURA')
  const puedeDeshacer = puede('COSTOS', 'TOTAL')

  const candidatos = useCandidatos()
  const rechazos = useRechazosVigentes(caja.id)
  const reversos = useReversosPendientes()

  const aceptar = useAceptar()
  const aceptarDia = useAceptarDia()
  const rechazar = useRechazar()
  const deshacer = useDeshacerRechazo()
  const reversar = useReversar()

  const [aceptandoFijo, setAceptandoFijo] = useState<Candidato | null>(null)
  const [rechazando, setRechazando] = useState<Candidato | null>(null)
  const [reversando, setReversando] = useState<ReversoPendiente | null>(null)
  const [resultadoDia, setResultadoDia] = useState<string | null>(null)

  const lista = candidatos.data ?? []
  const porFecha = new Map<string, Candidato[]>()
  for (const k of lista) {
    const grupo = porFecha.get(k.fecha) ?? []
    grupo.push(k)
    porFecha.set(k.fecha, grupo)
  }
  const fechas = [...porFecha.keys()].sort()

  const todoElDia = async (fecha: string, origen: 'ACARREO' | 'SALIDA_PLANTA') => {
    const r = await aceptarDia.mutateAsync({ fecha, origen })
    setResultadoDia(
      `${fmtFecha(fecha)}: ${r.aceptados} aceptados${r.saltados > 0 ? `, ${r.saltados} saltados por traer aviso` : ''}.`,
    )
  }

  return (
    <>
      {candidatos.isPending ? <Cargando /> : null}
      {candidatos.error ? <ErrorDeCarga error={candidatos.error} /> : null}

      {resultadoDia ? (
        <Card className="border-success/30 mb-4">
          <p className="text-ink/80 text-sm">{resultadoDia}</p>
        </Card>
      ) : null}

      {candidatos.data && lista.length === 0 ? (
        <Vacio
          icono={<Inbox />}
          titulo="Nada por aceptar"
          descripcion="Todo lo registrado ya entró al libro o se rechazó. Lo nuevo aparece aquí en cuanto se registre."
          resuelto
        />
      ) : null}

      {fechas.map((f) => {
        const del = porFecha.get(f) ?? []
        const viajes = del.filter((k) => k.origen === 'ACARREO')
        const salidas = del.filter((k) => k.origen === 'SALIDA_PLANTA')
        return (
          <Card key={f} flush className="mb-4">
            <div className="border-hairline flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
              <p className="text-ink/85 text-sm font-medium">
                {fmtFecha(f)}
                <span className="text-ink/45 ml-2 font-normal">{del.length} por aceptar</span>
                {f < caja.fecha_inicio ? (
                  <Chip tone="warning" className="ml-2">
                    Llegaría tarde
                  </Chip>
                ) : null}
              </p>
              {puedeAceptar ? (
                <div className="flex gap-2">
                  {viajes.length > 1 ? (
                    <Button size="sm" variant="soft" disabled={aceptarDia.isPending} onClick={() => void todoElDia(f, 'ACARREO')}>
                      Aceptar los {viajes.length} viajes
                    </Button>
                  ) : null}
                  {salidas.length > 1 ? (
                    <Button size="sm" variant="soft" disabled={aceptarDia.isPending} onClick={() => void todoElDia(f, 'SALIDA_PLANTA')}>
                      Aceptar las {salidas.length} salidas
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <ul className="divide-hairline divide-y">
              {del.map((k) => (
                <li key={`${k.origen}-${k.origen_id}`} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-ink/85 text-sm">{k.descripcion}</p>
                    <p className="text-ink/45 text-xs">
                      {ORIGENES[k.origen] ?? k.origen}
                      {k.aviso ? (
                        <Chip tone={AVISOS[k.aviso].tone} className="ml-2">
                          <AlertTriangle className="size-3" />
                          {AVISOS[k.aviso].texto}
                        </Chip>
                      ) : null}
                    </p>
                  </div>
                  <div className="tabular text-ink/70 w-20 text-right text-sm">
                    {k.m3 === null ? '' : `${enteros(k.m3)} m³`}
                  </div>
                  <div className="tabular text-ink/85 w-24 text-right text-sm">
                    {k.origen === 'SALIDA_PLANTA' ? '' : dineroONada(k.monto)}
                  </div>
                  {puedeAceptar ? (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Aceptar"
                        disabled={aceptar.isPending || k.aviso === 'SIN_PRECIO'}
                        onClick={() =>
                          k.origen === 'FIJO'
                            ? setAceptandoFijo(k)
                            : void aceptar.mutateAsync({ origen: k.origen, origen_id: k.origen_id })
                        }
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" title="Rechazar" onClick={() => setRechazando(k)}>
                        <X className="size-4" />
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        )
      })}

      {aceptar.error ? <ErrorDeCarga error={aceptar.error} className="mb-4" /> : null}
      {aceptarDia.error ? <ErrorDeCarga error={aceptarDia.error} className="mb-4" /> : null}

      {(reversos.data ?? []).length > 0 ? (
        <Card flush className="mb-4">
          <div className="border-hairline border-b px-5 py-3">
            <CardHeader
              title="Anulados después de aceptarse"
              subtitle="Entraron al libro y luego se anularon en su módulo. Reversar los saca del costo dejando rastro."
            />
          </div>
          <ul className="divide-hairline divide-y">
            {(reversos.data ?? []).map((v) => (
              <li key={v.movimiento_id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-ink/85 text-sm">{v.descripcion}</p>
                  <p className="text-ink/45 text-xs">
                    {fmtFecha(v.fecha)}
                    {v.motivo ? ` · anulado: ${v.motivo}` : ''}
                  </p>
                </div>
                <div className="tabular text-ink/85 w-24 text-right text-sm">{dineroONada(v.monto_usd)}</div>
                {puedeAceptar ? (
                  <Button size="sm" variant="soft" onClick={() => setReversando(v)}>
                    <RotateCcw className="size-4" />
                    Reversar
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {(rechazos.data ?? []).length > 0 ? (
        <Card flush>
          <div className="border-hairline border-b px-5 py-3">
            <CardHeader
              title="Rechazados en esta caja"
              subtitle="Se puede deshacer mientras la caja siga abierta. Deshacerlo pide Total."
            />
          </div>
          <ul className="divide-hairline divide-y">
            {(rechazos.data ?? []).map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-ink/85 text-sm">{describeDecision(d)}</p>
                  <p className="text-ink/45 text-xs">{d.motivo}</p>
                </div>
                {puedeDeshacer ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={deshacer.isPending}
                    onClick={() => void deshacer.mutateAsync(d.id)}
                  >
                    <Undo2 className="size-4" />
                    Deshacer
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {deshacer.error ? <ErrorDeCarga error={deshacer.error} className="m-4" /> : null}
        </Card>
      ) : null}

      {aceptandoFijo ? (
        <AceptarFijo
          candidato={aceptandoFijo}
          onCerrar={() => setAceptandoFijo(null)}
          onAceptar={(monto, nota) =>
            aceptar.mutateAsync({ origen: 'FIJO', origen_id: aceptandoFijo.origen_id, monto, nota })
          }
          error={aceptar.error}
          ocupado={aceptar.isPending}
        />
      ) : null}

      {rechazando ? (
        <ConMotivo
          titulo="Rechazar"
          descripcion={`${rechazando.descripcion}. Queda registrado con tu nombre; se puede deshacer mientras la caja siga abierta.`}
          verbo="Rechazar"
          onCerrar={() => setRechazando(null)}
          onConfirmar={(motivo) =>
            rechazar.mutateAsync({ origen: rechazando.origen, origen_id: rechazando.origen_id, motivo })
          }
          error={rechazar.error}
          ocupado={rechazar.isPending}
          minimo={5}
        />
      ) : null}

      {reversando ? (
        <ConMotivo
          titulo="Reversar"
          descripcion={`${reversando.descripcion}. Se escribe una fila que lo anula; la original se queda.`}
          verbo="Reversar"
          onCerrar={() => setReversando(null)}
          onConfirmar={(motivo) => reversar.mutateAsync({ movimiento_id: reversando.movimiento_id, motivo })}
          error={reversar.error}
          ocupado={reversar.isPending}
          minimo={4}
        />
      ) : null}
    </>
  )
}

function describeDecision(d: Decision): string {
  const que =
    d.origen === 'ACARREO' ? 'Viaje' : d.origen === 'SALIDA_PLANTA' ? 'Salida de planta' : 'Gasto fijo'
  return `${que} n.º ${d.origen_id} · rechazado el ${fmtFecha(d.decidido_en)}`
}

function AceptarFijo({
  candidato,
  onCerrar,
  onAceptar,
  error,
  ocupado,
}: {
  candidato: Candidato
  onCerrar: () => void
  onAceptar: (monto: number, nota: string | null) => Promise<unknown>
  error: unknown
  ocupado: boolean
}) {
  const [monto, setMonto] = useState(aTexto(candidato.monto))
  const [nota, setNota] = useState('')
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={candidato.descripcion}
      descripcion="Es un gasto fijo: entra con su monto salvo que este mes haya sido otro."
      ancho="sm"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={ocupado || Number(monto) <= 0}
            onClick={async () => {
              await onAceptar(Number(monto), nota.trim() || null)
              onCerrar()
            }}
          >
            {ocupado ? 'Aceptando…' : 'Aceptar'}
          </Button>
        </>
      }
    >
      <Input
        label={`Monto (${candidato.moneda})`}
        type="number"
        min="0.01"
        step="0.01"
        inputMode="decimal"
        value={monto}
        onChange={(e) => setMonto(e.target.value)}
      />
      <div className="mt-4">
        <Textarea label="Nota (opcional)" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
      </div>
      {error ? <ErrorDeCarga error={error} className="mt-3" /> : null}
    </Modal>
  )
}

function ConMotivo({
  titulo,
  descripcion,
  verbo,
  onCerrar,
  onConfirmar,
  error,
  ocupado,
  minimo,
}: {
  titulo: string
  descripcion: string
  verbo: string
  onCerrar: () => void
  onConfirmar: (motivo: string) => Promise<unknown>
  error: unknown
  ocupado: boolean
  minimo: number
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
            disabled={ocupado || motivo.trim().length < minimo}
            onClick={async () => {
              await onConfirmar(motivo.trim())
              onCerrar()
            }}
          >
            {ocupado ? `${verbo}…` : verbo}
          </Button>
        </>
      }
    >
      <Textarea label="Por qué" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      {error ? <ErrorDeCarga error={error} className="mt-3" /> : null}
    </Modal>
  )
}
