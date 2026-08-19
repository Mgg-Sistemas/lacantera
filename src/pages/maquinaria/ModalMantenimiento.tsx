import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useAlmacenes } from '@/lib/api/inventario'
import { useRegistrarMantenimiento, type Maquina } from '@/lib/api/maquinaria'
import { enteros } from '@/lib/formato'
import { cn } from '@/lib/cn'

/**
 * Anotar un mantenimiento o un servicio.
 *
 * LA ELECCIÓN DE ARRIBA NO ES UNA ETIQUETA: DECIDE SI EL CONTADOR VUELVE A CERO
 *
 * Es la parte de esta pantalla que hay que dejar imposible de confundir. Quien
 * marque «servicio» habiendo hecho un mantenimiento profundo dejará la máquina
 * contando horas que ya no debía, y el aviso saltará tarde. Al revés es peor:
 * marcar «mantenimiento» por engrasar pone el contador a cero y la máquina se
 * pasa su intervalo real sin que nadie se entere.
 *
 * Por eso no es un desplegable con dos opciones parecidas, sino dos botones
 * grandes que dicen su consecuencia en la propia tarjeta.
 */
export function ModalMantenimiento({
  abierto,
  maquina,
  onCerrar,
}: {
  abierto: boolean
  maquina: Maquina | null
  onCerrar: () => void
}) {
  const registrar = useRegistrarMantenimiento()
  const { data: almacenes } = useAlmacenes()

  const hoy = new Date().toLocaleDateString('en-CA')
  const [tipo, setTipo] = useState<'MANTENIMIENTO' | 'SERVICIO'>('MANTENIMIENTO')
  const [dia, setDia] = useState(hoy)
  const [detalle, setDetalle] = useState('')
  const [taller, setTaller] = useState('')
  const [costo, setCosto] = useState('')

  if (!maquina) return null

  const talleres = (almacenes ?? []).filter((a) => a.tipo === 'TALLER')
  const valido = detalle.trim().length >= 3

  const enviar = async () => {
    await registrar.mutateAsync({
      maquina_id: maquina.id,
      fecha: dia,
      tipo,
      detalle: detalle.trim(),
      horometro: maquina.horometro_actual ? Number(maquina.horometro_actual) : null,
      taller_id: taller ? Number(taller) : null,
      costo_usd: costo ? Number(costo) : null,
    })
    setDetalle('')
    setCosto('')
    onCerrar()
  }

  const opciones = [
    {
      valor: 'MANTENIMIENTO' as const,
      titulo: 'Mantenimiento',
      ejemplo: 'Motor, correas, filtros, cambio de aceite',
      consecuencia: 'Pone el contador de horas a cero',
    },
    {
      valor: 'SERVICIO' as const,
      titulo: 'Servicio',
      ejemplo: 'Engrase, combustible, revisión rápida',
      consecuencia: 'No toca el contador',
    },
  ]

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Registrar en ${maquina.nombre}`}
      descripcion={`Lleva ${enteros(Number(maquina.horas_desde_mant))} horas desde el último mantenimiento, sobre un tope de ${enteros(Number(maquina.tope_horas))}.`}
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={!valido || registrar.isPending}>
            {registrar.isPending ? 'Guardando…' : 'Registrar'}
          </Button>
        </>
      }
    >
      {/* Dos tarjetas y no un desplegable: la consecuencia de cada una tiene
          que estar a la vista en el momento de elegir, no escondida en una
          opción de lista. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {opciones.map((o) => {
          const elegida = tipo === o.valor
          return (
            <button
              key={o.valor}
              type="button"
              onClick={() => setTipo(o.valor)}
              className={cn(
                'rounded-card border p-3 text-left transition-colors',
                elegida
                  ? 'border-royal-600 bg-royal-600/5'
                  : 'border-hairline hover:border-royal-300',
              )}
            >
              <p className="text-ink/90 text-base font-medium">{o.titulo}</p>
              <p className="text-ink/55 mt-1 text-xs leading-relaxed">{o.ejemplo}</p>
              <p
                className={cn(
                  'text-2xs mt-2 font-medium',
                  o.valor === 'MANTENIMIENTO' ? 'text-warning' : 'text-ink/45',
                )}
              >
                {o.consecuencia}
              </p>
            </button>
          )
        })}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Input label="Fecha" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
        <Select
          label="Taller"
          vacio="Sin taller / externo"
          value={taller}
          onChange={(e) => setTaller(e.target.value)}
          opciones={talleres.map((t) => ({ valor: String(t.id), etiqueta: t.nombre }))}
        />
      </div>

      <div className="mt-4">
        <Textarea
          label="Qué se hizo"
          rows={3}
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          hint="Dentro de seis meses esto es lo único que dirá si ya se cambiaron las correas."
        />
      </div>

      <div className="mt-4 max-w-xs">
        <Input
          label="Costo en dólares"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          placeholder="Opcional"
          value={costo}
          onChange={(e) => setCosto(e.target.value)}
        />
      </div>

      {tipo === 'MANTENIMIENTO' ? (
        <p className="border-warning/30 bg-warning-soft text-ink/80 mt-4 rounded-[6px] border p-3 text-sm">
          Al guardar, esta máquina vuelve a cero horas y su semáforo pasa a estar al día.
        </p>
      ) : null}

      {registrar.error ? <ErrorDeCarga error={registrar.error} className="mt-3" /> : null}
    </Modal>
  )
}
