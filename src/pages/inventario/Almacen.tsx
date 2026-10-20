import { Navigate, useNavigate } from 'react-router'
import { HandHelping, PackageCheck, PackagePlus } from 'lucide-react'
import { Cargando } from '@/components/ui/Estado'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useMisRoles } from '@/lib/api/catalogo'

/*
  INVENTARIO, EN EL TELÉFONO.

  Tres tareas, no una: Registrar entrada, Entregar material y Entregar a un
  trabajador. Quien tiene más de una ve este menú; quien tiene solo una
  aterriza derecho en ella, igual que decide `Entrada.tsx` entre Cocina y el
  Surtidor — aterrizar en un sitio u otro es una comodidad, no un permiso.
*/
export function Almacen() {
  const { puede, resuelto } = useMisPermisos()
  const { puede: tieneRol, isSuccess: rolesListos } = useMisRoles()
  const navegar = useNavigate()

  if (!resuelto || !rolesListos) return <Cargando />

  const puedeEntrada = puede('INVENTARIO', 'ESCRITURA')
  const puedeSalida = puede('SALIDAS', 'ESCRITURA')
  const puedePrestamo = tieneRol('ALMACEN', 'RRHH', 'ADMIN')

  const tareas = [
    { puede: puedeEntrada, ruta: '/app/inventario/almacen/entrada' },
    { puede: puedeSalida, ruta: '/app/inventario/almacen/salida' },
    { puede: puedePrestamo, ruta: '/app/inventario/almacen/prestamo' },
  ].filter((t) => t.puede)

  if (tareas.length === 1) return <Navigate to={tareas[0].ruta} replace />

  if (tareas.length === 0) {
    return (
      <p className="text-ink/60 mx-auto mt-10 max-w-sm text-center text-sm">
        Su usuario no tiene permiso para ninguna de las tareas del almacén del teléfono.
      </p>
    )
  }

  return (
    <div className="mx-auto max-w-md pt-6">
      <h1 className="text-ink/85 font-titular text-xl">Inventario</h1>
      <p className="text-ink/55 mt-1 text-sm">¿Qué va a hacer?</p>

      <div className="mt-6 space-y-3">
        {puedeEntrada ? (
          <button
            type="button"
            onClick={() => void navegar('/app/inventario/almacen/entrada')}
            className="border-hairline rounded-card active:bg-ink/5 flex w-full items-center gap-3 border p-5 text-left transition-colors"
          >
            <PackagePlus className="text-royal-600 size-7 shrink-0" />
            <span>
              <span className="text-ink/85 block text-base font-medium">Registrar entrada</span>
              <span className="text-ink/55 block text-xs">Lo que entra al almacén, con su costo</span>
            </span>
          </button>
        ) : null}

        {puedeSalida ? (
          <button
            type="button"
            onClick={() => void navegar('/app/inventario/almacen/salida')}
            className="border-hairline rounded-card active:bg-ink/5 flex w-full items-center gap-3 border p-5 text-left transition-colors"
          >
            <PackageCheck className="text-royal-600 size-7 shrink-0" />
            <span>
              <span className="text-ink/85 block text-base font-medium">Entregar material</span>
              <span className="text-ink/55 block text-xs">Lo que ya está aprobado, por entregar</span>
            </span>
          </button>
        ) : null}

        {puedePrestamo ? (
          <button
            type="button"
            onClick={() => void navegar('/app/inventario/almacen/prestamo')}
            className="border-hairline rounded-card active:bg-ink/5 flex w-full items-center gap-3 border p-5 text-left transition-colors"
          >
            <HandHelping className="text-royal-600 size-7 shrink-0" />
            <span>
              <span className="text-ink/85 block text-base font-medium">Entregar a un trabajador</span>
              <span className="text-ink/55 block text-xs">Herramienta en préstamo, o un consumible</span>
            </span>
          </button>
        ) : null}
      </div>
    </div>
  )
}
