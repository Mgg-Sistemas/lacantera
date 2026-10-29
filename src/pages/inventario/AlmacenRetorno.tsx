import { useState } from 'react'
import { Link } from 'react-router'
import { HandHelping, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { useMisRoles } from '@/lib/api/catalogo'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useAsignaciones, useDevolver, type Asignacion } from '@/lib/api/asignaciones'

/*
  LO QUE FALTA POR VOLVER, EN EL TELÉFONO.

  Christopher, 29/10/2026: antes esto solo se veía desde Asignaciones, en el
  escritorio. La portada del teléfono traía un número —"por retornar"— sin
  tener dónde aterrizar, así que esta pantalla es ese dónde: la cola de
  préstamos (`clase = ASIGNACION`) sin devolver, con un botón para cerrarlos.

  AQUÍ TAMBIÉN VIVE "ENTREGAR A UN TRABAJADOR"

  La portada dejó de tener una tarjeta propia para prestar algo nuevo: es la
  otra cara de la misma moneda que devolver, así que comparte la puerta.
*/

export function AlmacenRetorno() {
  const { puede: tieneRol } = useMisRoles()
  const { puede: puedeModulo } = useMisPermisos()
  const puedeOperar = tieneRol('ALMACEN', 'RRHH', 'ADMIN') || puedeModulo('ASIGNACIONES', 'ESCRITURA')

  const { data, isPending, error } = useAsignaciones({ estado: 'ASIGNADA' })
  const [cerrando, setCerrando] = useState<Asignacion | null>(null)

  if (!puedeOperar) {
    return (
      <p className="text-ink/60 mx-auto mt-10 max-w-sm text-center text-sm">
        Entregar o retornar material a un trabajador lo hace almacén, recursos humanos o
        administración.
      </p>
    )
  }

  const pendientes = (data ?? []).filter((a) => a.clase === 'ASIGNACION')

  return (
    <div className="mx-auto max-w-md pb-10">
      <Link
        to="/app/inventario/almacen"
        className="text-ink/45 active:text-ink/80 mb-3 inline-block text-sm underline decoration-dotted underline-offset-4"
      >
        ← Atrás
      </Link>
      <h1 className="text-ink/85 font-titular text-xl">Por retornar</h1>
      <p className="text-ink/55 mt-1 text-sm">Préstamos activos, de cualquier almacén.</p>

      <Link
        to="/app/inventario/almacen/prestamo"
        className="border-hairline active:bg-ink/5 rounded-card mt-4 flex items-center gap-3 border border-dashed p-4 text-left transition-colors"
      >
        <HandHelping className="text-royal-600 size-6 shrink-0" />
        <span>
          <span className="text-ink/85 block text-sm font-medium">Prestar algo a un trabajador</span>
          <span className="text-ink/50 block text-xs">Herramienta en préstamo, o un consumible</span>
        </span>
      </Link>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} className="mt-4" /> : null}

      {!isPending && pendientes.length === 0 ? (
        <p className="text-ink/45 mt-8 text-center text-sm">No hay nada pendiente por retornar.</p>
      ) : null}

      {pendientes.length > 0 ? (
        <ul className="divide-hairline border-hairline mt-4 divide-y rounded-card border">
          {pendientes.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-ink/85 text-sm">{a.articulo}</p>
                <p className="text-ink/40 text-xs">
                  {a.empleado} · {a.almacen}
                </p>
                {a.dias_vencida ? (
                  <p className="text-danger mt-0.5 text-xs font-medium">
                    {a.dias_vencida} {a.dias_vencida === 1 ? 'día' : 'días'} de retraso
                  </p>
                ) : null}
              </div>
              <Button size="sm" variant="outline" icon={<Undo2 />} onClick={() => setCerrando(a)}>
                Devolver
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {cerrando ? <ModalDevolver asignacion={cerrando} onCerrar={() => setCerrando(null)} /> : null}
    </div>
  )
}

function ModalDevolver({
  asignacion,
  onCerrar,
}: {
  asignacion: Asignacion
  onCerrar: () => void
}) {
  const devolver = useDevolver()
  const hoy = new Date().toLocaleDateString('en-CA')
  const [nota, setNota] = useState('')

  const guardar = async () => {
    await devolver.mutateAsync({ id: asignacion.id, fecha: hoy, nota: nota.trim() || null })
    onCerrar()
  }

  return (
    <Modal
      abierto
      ancho="sm"
      onCerrar={onCerrar}
      titulo="Marcar devuelta"
      descripcion={`${asignacion.articulo} · ${asignacion.empleado}`}
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button disabled={devolver.isPending} onClick={() => void guardar()}>
            {devolver.isPending ? 'Guardando…' : 'Confirmar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Textarea label="Nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
        {devolver.error ? <ErrorDeCarga error={devolver.error} /> : null}
      </div>
    </Modal>
  )
}
