import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { Landing } from '@/pages/Landing'
import { Login } from '@/pages/Login'
import { ModuloPendiente } from '@/pages/ModuloPendiente'
import { navigation } from '@/config/navigation'
import { SesionProvider, useSesion } from '@/lib/sesion'
import { useMiPerfil } from '@/lib/api/usuarios'
import { Logo } from '@/components/Logo'
import { AvisoVersion } from '@/components/AvisoVersion'

/*
  Cada pantalla, en su propio archivo.

  Con todo junto, entrar al sistema costaba descargar 154 kB comprimidos antes
  de ver el formulario de acceso: la nómina entera, la tesorería, las compras y
  el inventario viajaban aunque solo se fuera a mirar el panel. En la oficina no
  se nota; en un teléfono en la cantera, con la señal que hay, sí.

  Ahora cada módulo se pide al entrar en él. La portada y el acceso siguen
  viniendo de entrada —son la primera pantalla y no pueden esperar a un segundo
  viaje—, y `ModuloPendiente` también, porque es un aviso de cuatro líneas y
  partirlo costaría más que traerlo.

  Los `.then(...)` están porque estas pantallas se exportan por su nombre y no
  por defecto: es el precio de no tener veinte archivos llamados `index`.
*/
// El armazón también. Quien está en la portada no ha entrado al sistema: no
// necesita el menú lateral, ni la barra superior, ni los iconos de los once
// módulos. Traérselos es cobrarle el sistema entero por mirar la puerta.
const AppLayout = lazy(() => import('@/layouts/AppLayout').then((m) => ({ default: m.AppLayout })))
const ExigePermiso = lazy(() =>
  import('@/layouts/ExigePermiso').then((m) => ({ default: m.ExigePermiso })),
)

const Dashboard = lazy(() => import('@/pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const MiCuenta = lazy(() => import('@/pages/MiCuenta').then((m) => ({ default: m.MiCuenta })))
const ExigeClaveNueva = lazy(() =>
  import('@/pages/MiCuenta').then((m) => ({ default: m.ExigeClaveNueva })),
)
const Tasas = lazy(() => import('@/pages/Tasas').then((m) => ({ default: m.Tasas })))
const Almacenes = lazy(() =>
  import('@/pages/config/Almacenes').then((m) => ({ default: m.Almacenes })),
)
const Articulos = lazy(() =>
  import('@/pages/config/Articulos').then((m) => ({ default: m.Articulos })),
)
const Usuarios = lazy(() => import('@/pages/config/Usuarios').then((m) => ({ default: m.Usuarios })))
const Existencias = lazy(() =>
  import('@/pages/inventario/Existencias').then((m) => ({ default: m.Existencias })),
)
const Movimientos = lazy(() =>
  import('@/pages/inventario/Movimientos').then((m) => ({ default: m.Movimientos })),
)
const Asistencia = lazy(() =>
  import('@/pages/nomina/Asistencia').then((m) => ({ default: m.Asistencia })),
)
const FichaTrabajador = lazy(() =>
  import('@/pages/nomina/FichaTrabajador').then((m) => ({ default: m.FichaTrabajador })),
)
const Parametros = lazy(() =>
  import('@/pages/nomina/Parametros').then((m) => ({ default: m.Parametros })),
)
const Personal = lazy(() => import('@/pages/nomina/Personal').then((m) => ({ default: m.Personal })))
const Procesos = lazy(() => import('@/pages/nomina/Procesos').then((m) => ({ default: m.Procesos })))
const Recibos = lazy(() => import('@/pages/nomina/Recibos').then((m) => ({ default: m.Recibos })))
const Cuentas = lazy(() =>
  import('@/pages/tesoreria/Cuentas').then((m) => ({ default: m.Cuentas })),
)
const MovimientosTesoreria = lazy(() =>
  import('@/pages/tesoreria/Movimientos').then((m) => ({ default: m.MovimientosTesoreria })),
)
const Pagos = lazy(() => import('@/pages/tesoreria/Pagos').then((m) => ({ default: m.Pagos })))
const PorPagar = lazy(() =>
  import('@/pages/tesoreria/PorPagar').then((m) => ({ default: m.PorPagar })),
)
const DetalleCompra = lazy(() =>
  import('@/pages/compras/DetalleCompra').then((m) => ({ default: m.DetalleCompra })),
)
const NuevoPedido = lazy(() =>
  import('@/pages/compras/NuevoPedido').then((m) => ({ default: m.NuevoPedido })),
)
const Proveedores = lazy(() =>
  import('@/pages/compras/Proveedores').then((m) => ({ default: m.Proveedores })),
)
const TableroCompras = lazy(() =>
  import('@/pages/compras/Tablero').then((m) => ({ default: m.TableroCompras })),
)

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
  // Esta pantalla se muestra fuera del armazón, así que trae su propia espera:
  // la de `AppLayout` cuelga del `Outlet`, y aquí todavía no hemos llegado.
  if (yo?.debe_cambiar_clave) {
    return (
      <Suspense fallback={<Cargando />}>
        <ExigeClaveNueva nombre={yo.nombre} />
      </Suspense>
    )
  }
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
      {/* Fuera del enrutador: da igual en qué pantalla esté quien lo lea. */}
      <AvisoVersion />

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
                  {/* El armazón llega en su propio archivo. Esta espera es la
                      de traerlo; la de cada pantalla vive dentro de él, para
                      que el menú no parpadee al cambiar de módulo. */}
                  <Suspense fallback={<Cargando />}>
                    <AppLayout />
                  </Suspense>
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
