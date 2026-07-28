import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AppLayout } from '@/layouts/AppLayout'
import { Dashboard } from '@/pages/Dashboard'
import { Login } from '@/pages/Login'
import { ModuloPendiente } from '@/pages/ModuloPendiente'
import { Tasas } from '@/pages/Tasas'
import { Almacenes } from '@/pages/config/Almacenes'
import { Articulos } from '@/pages/config/Articulos'
import { Existencias } from '@/pages/inventario/Existencias'
import { Movimientos } from '@/pages/inventario/Movimientos'
import { Asistencia } from '@/pages/nomina/Asistencia'
import { Parametros } from '@/pages/nomina/Parametros'
import { Personal } from '@/pages/nomina/Personal'
import { Procesos } from '@/pages/nomina/Procesos'
import { Recibos } from '@/pages/nomina/Recibos'
import { Cuentas } from '@/pages/tesoreria/Cuentas'
import { MovimientosTesoreria } from '@/pages/tesoreria/Movimientos'
import { Pagos } from '@/pages/tesoreria/Pagos'
import { PorPagar } from '@/pages/tesoreria/PorPagar'
import { DetalleCompra } from '@/pages/compras/DetalleCompra'
import { NuevoPedido } from '@/pages/compras/NuevoPedido'
import { Proveedores } from '@/pages/compras/Proveedores'
import { TableroCompras } from '@/pages/compras/Tablero'
import { navigation } from '@/config/navigation'
import { SesionProvider, useSesion } from '@/lib/sesion'
import { Logo } from '@/components/Logo'

/**
 * Pantallas ya construidas, por ruta.
 *
 * Las rutas del menú siguen derivándose de `navigation` para que no exista una
 * entrada sin destino; lo que hace este mapa es decidir cuál de ellas ya tiene
 * pantalla real y cuál sigue mostrando el aviso de pendiente. Así el menú y las
 * rutas no se pueden desincronizar.
 */
const paginas: Record<string, ReactNode> = {
  '/app/compras': <TableroCompras />,
  '/app/compras/proveedores': <Proveedores />,
  '/app/inventario/existencias': <Existencias />,
  '/app/inventario/movimientos': <Movimientos />,
  '/app/nomina/personal': <Personal />,
  '/app/nomina/asistencia': <Asistencia />,
  '/app/nomina/procesos': <Procesos />,
  '/app/nomina/recibos': <Recibos />,
  '/app/nomina/parametros': <Parametros />,
  '/app/tesoreria/cuentas': <Cuentas />,
  '/app/tesoreria/pagos': <Pagos />,
  '/app/tesoreria/por-pagar': <PorPagar />,
  '/app/tesoreria/movimientos': <MovimientosTesoreria />,
  '/app/config/articulos': <Articulos />,
  '/app/config/almacenes': <Almacenes />,
  '/app/tasas': <Tasas />,
}

const rutasDeModulos = navigation.flatMap((seccion) =>
  seccion.items.flatMap((item) => {
    if (item.children) {
      return item.children.map((hijo) => ({
        path: hijo.to,
        label: hijo.label,
        seccion: item.label,
      }))
    }
    // El panel tiene página propia; el resto de enlaces directos, no todavía.
    if (item.to && item.to !== '/app') {
      return [{ path: item.to, label: item.label, seccion: seccion.label ?? 'Sistema' }]
    }
    return []
  }),
)

/**
 * Pantalla de espera mientras se resuelve la sesión guardada.
 *
 * Sin ella, quien ya tiene sesión ve el login parpadear antes de entrar: en el
 * primer fotograma la sesión todavía no se ha leído del almacenamiento y el
 * guardián la interpreta como ausente.
 */
function Cargando() {
  return (
    <div className="bg-canvas flex min-h-svh items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Logo />
        <span className="sr-only">Cargando…</span>
        <div className="bg-ink/10 h-1 w-32 overflow-hidden rounded-full">
          <div className="bg-royal-600 h-full w-1/3 animate-pulse rounded-full" />
        </div>
      </div>
    </div>
  )
}

/** Exige sesión. Sin ella, devuelve al login. */
function RutaProtegida({ children }: { children: ReactNode }) {
  const { session, cargando } = useSesion()

  if (cargando) return <Cargando />
  if (!session) return <Navigate to="/" replace />
  return children
}

/** Evita que quien ya entró vuelva a ver el formulario de acceso. */
function RutaPublica({ children }: { children: ReactNode }) {
  const { session, cargando } = useSesion()

  if (cargando) return <Cargando />
  if (session) return <Navigate to="/app" replace />
  return children
}

export default function App() {
  return (
    <SesionProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <RutaPublica>
                <Login />
              </RutaPublica>
            }
          />

          <Route
            path="/app"
            element={
              <RutaProtegida>
                <AppLayout />
              </RutaProtegida>
            }
          >
            <Route index element={<Dashboard />} />

            {/* Pantallas que no están en el menú porque se llega a ellas desde
                el tablero, no desde la navegación. */}
            <Route path="compras/nuevo" element={<NuevoPedido />} />
            <Route path="compras/:id" element={<DetalleCompra />} />

            {rutasDeModulos.map((ruta) => (
              <Route
                key={ruta.path}
                // Las rutas del menú son absolutas; aquí se necesitan relativas al padre.
                path={ruta.path.replace('/app/', '')}
                element={
                  paginas[ruta.path] ?? (
                    <ModuloPendiente title={ruta.label} seccion={ruta.seccion} />
                  )
                }
              />
            ))}
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SesionProvider>
  )
}
