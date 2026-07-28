import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AppLayout } from '@/layouts/AppLayout'
import { ExigePermiso } from '@/layouts/ExigePermiso'
import { Dashboard } from '@/pages/Dashboard'
import { Landing } from '@/pages/Landing'
import { ExigeClaveNueva, MiCuenta } from '@/pages/MiCuenta'
import { Login } from '@/pages/Login'
import { ModuloPendiente } from '@/pages/ModuloPendiente'
import { Tasas } from '@/pages/Tasas'
import { Almacenes } from '@/pages/config/Almacenes'
import { Articulos } from '@/pages/config/Articulos'
import { Usuarios } from '@/pages/config/Usuarios'
import { Existencias } from '@/pages/inventario/Existencias'
import { Movimientos } from '@/pages/inventario/Movimientos'
import { Asistencia } from '@/pages/nomina/Asistencia'
import { FichaTrabajador } from '@/pages/nomina/FichaTrabajador'
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
import { useMiPerfil } from '@/lib/api/usuarios'
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
  '/app/config/usuarios': <Usuarios />,
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

/**
 * Exige sesión. Sin ella, devuelve al formulario de acceso.
 *
 * Va a `/entrar` y no a la portada a propósito: quien llega aquí es alguien a
 * quien se le venció la sesión trabajando, y devolverlo a la portada le
 * añadiría un clic para volver a donde estaba.
 */
function RutaProtegida({ children }: { children: ReactNode }) {
  const { session, cargando } = useSesion()

  if (cargando) return <Cargando />
  if (!session) return <Navigate to="/entrar" replace />
  return children
}

/**
 * La clave prestada no pasa de aquí.
 *
 * Mientras la clave sea la que asignó la administración, la sesión existe pero
 * no identifica a nadie: la saben dos personas. Se deja entrar y se corta
 * antes de cualquier pantalla, porque lo que hay del otro lado se firma.
 */
function ExigeClavePropia({ children }: { children: ReactNode }) {
  const { data: yo, isPending } = useMiPerfil()

  if (isPending) return <Cargando />
  if (yo?.debe_cambiar_clave) return <ExigeClaveNueva nombre={yo.nombre} />
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
          {/* La portada es la única pantalla sin guardián: se ve con sesión y
              sin ella. Es la puerta de la calle, no una pantalla del sistema. */}
          <Route path="/" element={<Landing />} />

          <Route
            path="/entrar"
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
                <ExigeClavePropia>
                  <AppLayout />
                </ExigeClavePropia>
              </RutaProtegida>
            }
          >
            {/* Capa sin ruta propia: cuelga de ella todo lo que hay dentro del
                sistema, para que el permiso del módulo se compruebe en un solo
                sitio y no una vez por pantalla. */}
            <Route element={<ExigePermiso />}>
              <Route index element={<Dashboard />} />

              {/* La cuenta de cada quien no pertenece a ningún módulo: se
                  alcanza siempre, aunque le hayan cerrado todo lo demás. */}
              <Route path="cuenta" element={<MiCuenta />} />

              {/* Pantallas que no están en el menú porque se llega a ellas desde
                  el tablero, no desde la navegación. */}
              <Route path="compras/nuevo" element={<NuevoPedido />} />
              <Route path="compras/:id" element={<DetalleCompra />} />
              <Route path="nomina/personal/:id" element={<FichaTrabajador />} />

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
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SesionProvider>
  )
}
