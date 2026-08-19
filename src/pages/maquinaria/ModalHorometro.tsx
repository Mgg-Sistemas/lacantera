import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useGuardarLectura, useLecturas, type Maquina } from '@/lib/api/maquinaria'
import { fecha as formatearFecha } from '@/lib/formato'

/**
 * La lectura del horómetro del día.
 *
 * SE PIDE INICIAL Y FINAL, NO LAS HORAS
 *
 * Podría pedirse directamente «cuántas horas trabajó hoy», y sería más corto de
 * llenar y peor: quien anota tendría que hacer la resta de cabeza frente a la
 * máquina, y una resta mal hecha corre el mantenimiento de sitio sin que nadie
 * lo note. Aquí se copian los dos números que el reloj muestra y la resta la
 * hace la base.
 *
 * ADEMÁS DEJA VER EL ARRASTRE
 *
 * El inicial de hoy debería ser el final de ayer. Enseñar la última lectura
 * permite cazar al vuelo el día que no coincidan, que es cuando o falta un
 * parte o alguien se equivocó de casilla.
 */
export function ModalHorometro({
  abierto,
  maquina,
  onCerrar,
}: {
  abierto: boolean
  maquina: Maquina | null
  onCerrar: () => void
}) {
  const guardar = useGuardarLectura()
  const { data: lecturas } = useLecturas(maquina?.id ?? null)

  const hoy = new Date().toLocaleDateString('en-CA')
  const [dia, setDia] = useState(hoy)
  const [inicial, setInicial] = useState('')
  const [final, setFinal] = useState('')

  if (!maquina) return null

  const ultima = lecturas?.[0]
  const yaHayDeHoy = lecturas?.find((l) => l.fecha === dia)

  const horas = Number(final || 0) - Number(inicial || 0)
  const valido = inicial !== '' && final !== '' && horas >= 0

  const enviar = async () => {
    await guardar.mutateAsync({
      maquina_id: maquina.id,
      fecha: dia,
      inicial: Number(inicial),
      final: Number(final),
    })
    setInicial('')
    setFinal('')
    onCerrar()
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Horómetro · ${maquina.nombre}`}
      descripcion="Copia los dos números que marca el reloj. La resta la hace el sistema."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={!valido || guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : yaHayDeHoy ? 'Corregir la lectura' : 'Guardar'}
          </Button>
        </>
      }
    >
      {ultima ? (
        <p className="border-hairline text-ink/60 mb-4 rounded-[6px] border border-dashed p-3 text-sm">
          Última lectura: <strong>{formatearFecha(ultima.fecha)}</strong>, terminó en{' '}
          <span className="tabular font-semibold">{ultima.final}</span>. El inicial de hoy debería
          ser ese mismo número.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Input label="Fecha" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
        <Input
          label="Al arrancar"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={inicial}
          onChange={(e) => setInicial(e.target.value)}
        />
        <Input
          label="Al terminar"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={final}
          onChange={(e) => setFinal(e.target.value)}
        />
      </div>

      {/* La cuenta a la vista mientras se escribe: si sale un número raro, se
          ve antes de guardar y no tres semanas después. */}
      {inicial !== '' && final !== '' ? (
        <p
          className={
            horas < 0
              ? 'text-danger mt-4 text-sm font-medium'
              : 'text-ink/70 mt-4 text-sm'
          }
        >
          {horas < 0
            ? 'El final no puede ser menor que el inicial. Revisa las dos casillas.'
            : `Trabajó ${horas.toLocaleString('es-VE', { maximumFractionDigits: 2 })} horas ese día.`}
        </p>
      ) : null}

      {yaHayDeHoy ? (
        <p className="text-warning mt-3 text-sm">
          Ya hay una lectura de ese día. Al guardar se reemplaza.
        </p>
      ) : null}

      {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-3" /> : null}
    </Modal>
  )
}
