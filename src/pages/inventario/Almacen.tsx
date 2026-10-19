import { Navigate, useNavigate } from 'react-router'
import { PackageCheck, PackagePlus } from 'lucide-react'
import { Cargando } from '@/components/ui/Estado'
import { useMisPermisos } from '@/lib/api/usuarios'

/*
  INVENTARIO, EN EL TELÉFONO.

  Dos tareas, no una: Registrar entrada y Entregar material. Quien tiene las
  dos ve este menú; quien solo tiene una aterriza derecho en ella, igual que
  decide `Entrada.tsx` entre Cocina y el Surtidor — aterrizar en un sitio u
  otro es una comodidad, no un permiso.
*/
export function Almacen() {
  const { puede, resuelto } = useMisPermisos()
  const navegar = useNavigate()

  if (!resuelto) return <Cargando />

  const puedeEntrada = puede('INVENTARIO', 'ESCRITURA')
  const puedeSalida = puede('SALIDAS', 'ESCRITURA')

  if (puedeEntrada && !puedeSalida) return <Navigate to="/app/inventario/almacen/entrada" replace />
  if (puedeSalida && !puedeEntrada) return <Navigate to="/app/inventario/almacen/salida" replace />

  if (!puedeEntrada && !puedeSalida) {
    return (
      <p className="text-ink/60 mx-auto mt-10 max-w-sm text-center text-sm">
        Su usuario no tiene permiso para registrar entradas ni para entregar material.
      </p>
    )
  }

  return (
    <div className="mx-auto max-w-md pt-6">
      <h1 className="text-ink/85 font-titular text-xl">Inventario</h1>
      <p className="text-ink/55 mt-1 text-sm">¿Qué va a hacer?</p>

      <div className="mt-6 space-y-3">
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
      </div>
    </div>
  )
}
