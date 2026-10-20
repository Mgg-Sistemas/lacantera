import { Navigate, useNavigate } from 'react-router'
import { Boxes, HandHelping, PackageCheck, PackagePlus } from 'lucide-react'
import { Cargando } from '@/components/ui/Estado'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useMisRoles } from '@/lib/api/catalogo'

/*
  INVENTARIO, EN EL TELÉFONO.

  Cuatro tareas, no una: Registrar entrada, Entregar material, Entregar a un
  trabajador, y Ver inventario —consulta, no mueve nada—. Quien tiene más de
  una ve este menú; quien tiene solo una aterriza derecho en ella, igual que
  decide `Entrada.tsx` entre Cocina y el Surtidor — aterrizar en un sitio u
  otro es una comodidad, no un permiso.
*/
export function Almacen() {
  const { puede, resuelto } = useMisPermisos()
  const { puede: tieneRol, isSuccess: rolesListos } = useMisRoles()
  const navegar = useNavigate()

  if (!resuelto || !rolesListos) return <Cargando />

  const puedeEntrada = puede('INVENTARIO', 'ESCRITURA')
  const puedeSalida = puede('SALIDAS', 'ESCRITURA')
  /*
    LA MISMA REJA QUE EL RPC `entregar_a_trabajador`: por el rol de siempre
    (ALMACEN, RRHH, ADMIN) o por el permiso del módulo Asignaciones — la
    segunda rama es la que deja usar esto a un rol a la medida, como
    `ALMACEN_TELEFONO`, sin tener que darle el rol entero.
  */
  const puedePrestamo = tieneRol('ALMACEN', 'RRHH', 'ADMIN') || puede('ASIGNACIONES', 'ESCRITURA')
  const puedeVerInventario = puede('INVENTARIO', 'LECTURA')

  const tareas = [
    { puede: puedeEntrada, ruta: '/app/inventario/almacen/entrada' },
    { puede: puedeSalida, ruta: '/app/inventario/almacen/salida' },
    { puede: puedePrestamo, ruta: '/app/inventario/almacen/prestamo' },
    { puede: puedeVerInventario, ruta: '/app/inventario/almacen/existencias' },
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

        {puedeVerInventario ? (
          <button
            type="button"
            onClick={() => void navegar('/app/inventario/almacen/existencias')}
            className="border-hairline rounded-card active:bg-ink/5 flex w-full items-center gap-3 border p-5 text-left transition-colors"
          >
            <Boxes className="text-royal-600 size-7 shrink-0" />
            <span>
              <span className="text-ink/85 block text-base font-medium">Ver inventario</span>
              <span className="text-ink/55 block text-xs">Solo consulta: qué hay y dónde</span>
            </span>
          </button>
        ) : null}
      </div>
    </div>
  )
}
