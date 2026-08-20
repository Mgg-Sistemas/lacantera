import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useEmpleados } from '@/lib/api/nomina'
import { useAsignarChofer, type Vehiculo } from '@/lib/api/vehiculos'
import { fecha as formatearFecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

/**
 * Poner un chofer a un vehículo, o traspasarlo a otro.
 *
 * ES UN TRASPASO, NO UNA EDICIÓN
 *
 * No se cambia el nombre del chofer: se abre un período nuevo y se cierra el
 * anterior el día antes. Así queda quién manejaba cada día, que es lo que se
 * pregunta cuando algo pasó en la carretera y ya nadie se acuerda.
 *
 * DE LA CASA O DEL TRANSPORTISTA
 *
 * Los choferes de la cantera están en nómina y se eligen de la lista, con lo
 * que su cédula y su cargo salen solos. Los que vienen con el camión de un
 * transportista no están en ningún lado, y para esos hay nombre y cédula a
 * mano — que es texto libre, sí, pero de gente que no es nuestra.
 */
export function ModalChofer({
  abierto,
  vehiculo,
  onCerrar,
}: {
  abierto: boolean
  vehiculo: Vehiculo
  onCerrar: () => void
}) {
  const asignar = useAsignarChofer()
  const { data: empleados } = useEmpleados()

  const hoy = new Date().toLocaleDateString('en-CA')
  const [deLaCasa, setDeLaCasa] = useState(true)
  const [empleadoId, setEmpleadoId] = useState('')
  const [nombre, setNombre] = useState('')
  const [cedula, setCedula] = useState('')
  const [desde, setDesde] = useState(hoy)
  const [motivo, setMotivo] = useState('')

  useEffect(() => {
    if (!abierto) return
    setDeLaCasa(true)
    setEmpleadoId('')
    setNombre('')
    setCedula('')
    setDesde(hoy)
    setMotivo('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  const esTraspaso = vehiculo.chofer_actual !== null
  const valido = deLaCasa ? empleadoId !== '' : nombre.trim().length >= 3

  const enviar = async () => {
    await asignar.mutateAsync({
      vehiculo_id: vehiculo.id,
      empleado_id: deLaCasa ? Number(empleadoId) : null,
      nombre: deLaCasa ? null : nombre.trim(),
      cedula: deLaCasa ? null : cedula.trim() || null,
      desde,
      motivo: motivo.trim() || null,
    })
    onCerrar()
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={esTraspaso ? `Traspasar ${vehiculo.placa}` : `Asignar chofer a ${vehiculo.placa}`}
      descripcion={
        esTraspaso
          ? `Ahora lo maneja ${vehiculo.chofer_actual}. Al guardar, su período se cierra el día antes de la fecha que pongas.`
          : 'Queda registrado desde la fecha que indiques.'
      }
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={!valido || asignar.isPending}>
            {asignar.isPending ? 'Guardando…' : esTraspaso ? 'Traspasar' : 'Asignar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { casa: true, titulo: 'De la casa', detalle: 'Está en nómina' },
          { casa: false, titulo: 'Del transportista', detalle: 'Viene con el camión' },
        ].map((o) => (
          <button
            key={String(o.casa)}
            type="button"
            onClick={() => setDeLaCasa(o.casa)}
            className={cn(
              'rounded-card border p-3 text-left transition-colors',
              deLaCasa === o.casa
                ? 'border-royal-600 bg-royal-600/5'
                : 'border-hairline hover:border-royal-300',
            )}
          >
            <p className="text-ink/90 text-sm font-medium">{o.titulo}</p>
            <p className="text-ink/50 mt-0.5 text-xs">{o.detalle}</p>
          </button>
        ))}
      </div>

      {deLaCasa ? (
        <div className="mt-4">
          <SelectBuscable
            label="Quién"
            vacio="Elige a la persona"
            valor={empleadoId}
            onCambio={(v) => setEmpleadoId(v)}
            opciones={(empleados ?? [])
              .filter((e) => e.activo)
              .map((e) => ({
                valor: String(e.id),
                etiqueta: `${e.nombres} ${e.apellidos}${e.cargo ? ` · ${e.cargo}` : ''}`,
              }))}
            hint="Su cédula y su cargo salen de la nómina."
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input
            label="Nombre del chofer"
            placeholder="José Rondón"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <Input
            label="Cédula"
            placeholder="V-12345678"
            value={cedula}
            onChange={(e) => setCedula(e.target.value)}
          />
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input
          label={esTraspaso ? 'Lo recibe el' : 'Desde'}
          type="date"
          max={hoy}
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
        />
        <Input
          label="Por qué"
          placeholder={esTraspaso ? 'Vacaciones, reposo, cambio de ruta' : 'Opcional'}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </div>

      {esTraspaso && vehiculo.chofer_desde ? (
        <p className="border-hairline text-ink/60 mt-4 rounded-[6px] border border-dashed p-3 text-sm leading-relaxed">
          {vehiculo.chofer_actual} lo tiene desde el {formatearFecha(vehiculo.chofer_desde)}. Su
          período se cierra solo; no hay que hacer nada más.
        </p>
      ) : null}

      {asignar.error ? <ErrorDeCarga error={asignar.error} className="mt-3" /> : null}
    </Modal>
  )
}
