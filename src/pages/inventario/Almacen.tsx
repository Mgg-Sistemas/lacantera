import { useState, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { LayoutGrid, PackageCheck, PackagePlus, Search, Undo2 } from 'lucide-react'
import { Cargando } from '@/components/ui/Estado'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useMisRoles, type Rol } from '@/lib/api/catalogo'
import { useAsignaciones } from '@/lib/api/asignaciones'
import { cn } from '@/lib/cn'

/*
  INVENTARIO, EN EL TELÉFONO.

  Cinco tareas, no una: Dar de alta un producto, Registrar entrada, Entregar
  material, Entregar/retornar a un trabajador, y Ver inventario —consulta, no
  mueve nada—. Quien tiene más de una ve este menú; quien tiene solo una
  aterriza derecho en ella, igual que decide `Entrada.tsx` entre Cocina y el
  Surtidor — aterrizar en un sitio u otro es una comodidad, no un permiso.

  Christopher, 29/10/2026: rediseño a tarjetas grandes, con "Producto nuevo"
  como su propia puerta (antes vivía escondida dentro de "Registrar entrada")
  y una cola de "Por retornar" que antes no existía en el teléfono —los
  préstamos activos (asignaciones sin devolver) solo se veían desde el
  escritorio. Entregar a un trabajador por primera vez se mudó ahí dentro: es
  la misma puerta de siempre, solo que ahora cuelga de la cola de préstamos en
  vez de tener su propia tarjeta en esta portada.
*/

const ETIQUETA_ROL: Record<Rol, string> = {
  ADMIN: 'Administrador',
  GERENTE_GENERAL: 'Gerencia general',
  COMPRAS: 'Compras',
  TESORERIA: 'Tesorería',
  ALMACEN: 'Almacén',
  OPERACIONES: 'Operaciones',
  RRHH: 'Recursos humanos',
  SOLICITANTE: 'Solicitante',
  CONSULTA: 'Consulta',
}
// El orden en que se escoge cuál mostrar cuando el usuario tiene varios roles.
const ORDEN_ROL: Rol[] = [
  'ADMIN',
  'GERENTE_GENERAL',
  'ALMACEN',
  'RRHH',
  'COMPRAS',
  'TESORERIA',
  'OPERACIONES',
  'SOLICITANTE',
  'CONSULTA',
]

export function Almacen() {
  const { puede, resuelto } = useMisPermisos()
  const { puede: tieneRol, roles, isSuccess: rolesListos } = useMisRoles()
  const navegar = useNavigate()
  const [buscado, setBuscado] = useState('')

  const puedeEntrada = puede('INVENTARIO', 'ESCRITURA')
  // Pedir una salida solo exige LECTURA en Salidas; entregarla exige
  // ESCRITURA. La tarjeta se enseña con cualquiera de las dos, y
  // AlmacenSalida.tsx decide a cuál de las dos aterriza.
  const puedeSalida = puede('SALIDAS', 'LECTURA')
  /*
    LA MISMA REJA QUE EL RPC `entregar_a_trabajador`: por el rol de siempre
    (ALMACEN, RRHH, ADMIN) o por el permiso del módulo Asignaciones — la
    segunda rama es la que deja usar esto a un rol a la medida, como
    `ALMACEN_TELEFONO`, sin tener que darle el rol entero.
  */
  const puedePrestamo = tieneRol('ALMACEN', 'RRHH', 'ADMIN') || puede('ASIGNACIONES', 'ESCRITURA')
  const puedeVerInventario = puede('INVENTARIO', 'LECTURA')

  const porRetornar = useAsignaciones({ estado: 'ASIGNADA' })
  const cantidadPorRetornar = (porRetornar.data ?? []).filter((a) => a.clase === 'ASIGNACION').length

  if (!resuelto || !rolesListos) return <Cargando />

  const tareas = [
    { puede: puedeEntrada, ruta: '/app/inventario/almacen/entrada' },
    { puede: puedeSalida, ruta: '/app/inventario/almacen/salida' },
    { puede: puedePrestamo, ruta: '/app/inventario/almacen/retornar' },
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

  const miRol = ORDEN_ROL.find((r) => roles.includes(r))

  const buscar = () => {
    const q = buscado.trim()
    void navegar(q ? `/app/inventario/almacen/existencias?q=${encodeURIComponent(q)}` : '/app/inventario/almacen/existencias')
  }

  return (
    <div className="mx-auto max-w-md pt-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-ink/85 font-titular text-xl">Inventario</h1>
          {miRol ? (
            <p className="text-ink/45 text-2xs mt-0.5 font-mono tracking-[0.16em] uppercase">
              {ETIQUETA_ROL[miRol]}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void navegar('/app/inventario')}
          className="border-hairline text-ink/55 active:bg-ink/5 rounded-control flex shrink-0 items-center gap-1.5 border px-3 py-2 text-xs transition-colors"
        >
          <LayoutGrid className="size-3.5" />
          Módulo completo
        </button>
      </div>

      <div className="mt-6 space-y-3">
        {puedeEntrada ? (
          <Tarjeta
            tono="warning"
            icono={<PackagePlus />}
            titulo="Producto nuevo"
            subtitulo="Algo que todavía no está en el almacén"
            onClick={() => void navegar('/app/inventario/almacen/entrada?nuevo=1')}
          />
        ) : null}

        {puedeEntrada || puedeSalida ? (
          <div className="flex gap-3">
            {puedeEntrada ? (
              <Tarjeta
                tono="success"
                icono={<PackagePlus />}
                titulo="Entrada"
                subtitulo="Llegó más de un producto que ya está"
                onClick={() => void navegar('/app/inventario/almacen/entrada')}
              />
            ) : null}
            {puedeSalida ? (
              <Tarjeta
                tono="warning"
                icono={<PackageCheck />}
                titulo="Salida"
                subtitulo="Sale material del almacén"
                onClick={() => void navegar('/app/inventario/almacen/salida')}
              />
            ) : null}
          </div>
        ) : null}

        {puedePrestamo ? (
          <Tarjeta
            tono="info"
            icono={<Undo2 />}
            titulo={`Por retornar (${cantidadPorRetornar})`}
            subtitulo={
              cantidadPorRetornar > 0
                ? 'Hay préstamos pendientes por devolver'
                : 'No hay nada pendiente por retornar'
            }
            onClick={() => void navegar('/app/inventario/almacen/retornar')}
          />
        ) : null}

        {puedeVerInventario ? (
          <div className="border-hairline bg-surface focus-within:border-royal-400 rounded-card flex items-center gap-2 border px-3 py-2.5 transition-colors">
            <Search className="text-ink/35 size-4 shrink-0" />
            <input
              value={buscado}
              onChange={(e) => setBuscado(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') buscar()
              }}
              placeholder="Buscar producto…"
              className="text-ink/85 placeholder:text-ink/35 min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

type TonoTarjeta = 'success' | 'warning' | 'info'

const TONOS_TARJETA: Record<TonoTarjeta, string> = {
  success: 'bg-success-soft border-success/25',
  warning: 'bg-warning-soft border-warning/35',
  info: 'bg-info-soft border-info/25',
}

const ICONO_TARJETA: Record<TonoTarjeta, string> = {
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-info',
}

function Tarjeta({
  tono,
  icono,
  titulo,
  subtitulo,
  onClick,
}: {
  tono: TonoTarjeta
  icono: ReactNode
  titulo: string
  subtitulo: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'active:brightness-95 rounded-card flex w-full flex-1 flex-col items-center justify-center gap-2 border p-6 text-center transition-[filter]',
        TONOS_TARJETA[tono],
      )}
    >
      <span className={cn('[&>svg]:size-7', ICONO_TARJETA[tono])}>{icono}</span>
      <span>
        <span className="text-ink/90 block text-base font-semibold">{titulo}</span>
        <span className="text-ink/55 mt-0.5 block text-xs leading-snug">{subtitulo}</span>
      </span>
    </button>
  )
}
