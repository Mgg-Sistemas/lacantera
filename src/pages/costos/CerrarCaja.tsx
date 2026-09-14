/*
  Cerrar la caja.

  Una sola pantalla que enseña lo que se va a congelar y obliga a decidir
  qué pasa con lo que está por aceptar: o entra todo, o se queda para la
  siguiente. Nunca se acepta en silencio.

  Con el corte mensual encendido, la fecha propuesta es el último día del
  mes, y si se cambia se avisa. No se impide: un solo calendario no quiere
  decir un solo motivo para cerrar.
*/
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useCandidatos, useCerrarCaja, useConfiguracionCostos, type CajaCosto, type ResumenCaja } from '@/lib/api/costos'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { enteros, fecha as fmtFecha } from '@/lib/formato'
import { dineroONada, porM3 } from './formato'

function finDeMes(iso: string): string {
  const [a, m] = iso.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return `${iso.slice(0, 7)}-${String(ultimo).padStart(2, '0')}`
}

export function CerrarCaja({
  caja,
  resumen,
  onCerrar,
}: {
  caja: CajaCosto
  resumen: ResumenCaja
  onCerrar: () => void
}) {
  const cerrar = useCerrarCaja()
  const conf = useConfiguracionCostos()
  const candidatos = useCandidatos()
  const hoy = hoyEnCaracas()

  const corteMensual = conf.data?.corte_mensual ?? false
  const propuesta = corteMensual ? (finDeMes(caja.fecha_inicio) <= hoy ? finDeMes(caja.fecha_inicio) : hoy) : hoy

  const [fechaFin, setFechaFin] = useState(propuesta)
  const [nombre, setNombre] = useState('')
  const [pendientes, setPendientes] = useState<'ACEPTAR_TODOS' | 'DEJAR'>('DEJAR')

  const enRango = (candidatos.data ?? []).filter((k) => k.fecha >= caja.fecha_inicio && k.fecha <= fechaFin)
  const sinPrecio = enRango.filter((k) => k.aviso === 'SIN_PRECIO')
  const valido = fechaFin >= caja.fecha_inicio && fechaFin <= hoy && !(pendientes === 'ACEPTAR_TODOS' && sinPrecio.length > 0)
  const avisaFecha = corteMensual && fechaFin !== finDeMes(caja.fecha_inicio)

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Cerrar la caja ${caja.numero}`}
      descripcion="Se congela la foto y se abre la siguiente el día después. No se puede reabrir: lo que llegue con fecha de esta caja entrará en la siguiente como llegado tarde."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Todavía no
          </Button>
          <Button
            variant="danger"
            disabled={!valido || cerrar.isPending}
            onClick={async () => {
              await cerrar.mutateAsync({ fecha_fin: fechaFin, nombre_siguiente: nombre.trim() || null, pendientes })
              onCerrar()
            }}
          >
            {cerrar.isPending ? 'Cerrando…' : 'Cerrar caja'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Cerrar hasta el"
          type="date"
          min={caja.fecha_inicio}
          max={hoy}
          value={fechaFin}
          onChange={(e) => setFechaFin(e.target.value)}
          hint={avisaFecha ? 'El corte mensual está encendido y esta fecha no es fin de mes.' : undefined}
        />
        <Input
          label="Nombre de la siguiente (opcional)"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Octubre"
        />
      </div>

      <div className="bg-ink/4 mt-4 rounded-[6px] p-3 text-sm">
        <p className="text-ink/85 font-medium">Lo que se congela</p>
        <p className="text-ink/65 mt-1">
          Costo {dineroONada(resumen.costo_usd)} · {enteros(resumen.m3_planta)} m³ salidos ·{' '}
          {resumen.dinero_tapado ? 'costo por m³ sin acceso' : porM3(resumen.costo_por_m3)}
        </p>
        {resumen.reversos_pendientes > 0 ? (
          <p className="text-warning mt-1">
            Hay {resumen.reversos_pendientes} anulados sin reversar. Quedarán para la siguiente caja.
          </p>
        ) : null}
      </div>

      {enRango.length > 0 ? (
        <fieldset className="mt-4">
          <legend className="text-ink/85 text-sm font-medium">
            {enRango.length} por aceptar con fecha hasta el {fmtFecha(fechaFin)}
          </legend>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="pendientes"
              className="mt-1"
              checked={pendientes === 'ACEPTAR_TODOS'}
              disabled={sinPrecio.length > 0}
              onChange={() => setPendientes('ACEPTAR_TODOS')}
            />
            <span className="text-ink/75">
              Aceptar todos y cerrar
              {sinPrecio.length > 0 ? (
                <span className="text-danger block text-xs">
                  No se puede: {sinPrecio.length} sin precio. Corrígelos en Viajes o ciérrala dejándolos.
                </span>
              ) : null}
            </span>
          </label>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="pendientes"
              className="mt-1"
              checked={pendientes === 'DEJAR'}
              onChange={() => setPendientes('DEJAR')}
            />
            <span className="text-ink/75">
              Cerrar y dejarlos para la siguiente caja
              <span className="text-ink/45 block text-xs">Entrarán como llegados tarde, fuera del costo por m³ de la siguiente.</span>
            </span>
          </label>
        </fieldset>
      ) : null}

      {cerrar.error ? <ErrorDeCarga error={cerrar.error} className="mt-3" /> : null}
    </Modal>
  )
}
