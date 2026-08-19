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
  import('@/pages/inventario/Almacenes').then((m) => ({ default: m.Almacenes })),
)
const Articulos = lazy(() =>
  import('@/pages/inventario/Articulos').then((m) => ({ default: m.Articulos })),
)
const Transferencias = lazy(() =>
  import('@/pages/inventario/Transferencias').then((m) => ({ default: m.Transferencias })),
)
const Empresa = lazy(() => import('@/pages/config/Empresa').then((m) => ({ default: m.Empresa })))
const Documentos = lazy(() =>
  import('@/pages/config/Documentos').then((m) => ({ default: m.Documentos })),
)
const Usuarios = lazy(() => import('@/pages/config/Usuarios').then((m) => ({ default: m.Usuarios })))
const Auditoria = lazy(() =>
  import('@/pages/config/Auditoria').then((m) => ({ default: m.Auditoria })),
)
const Respaldo = lazy(() =>
  import('@/pages/config/Respaldo').then((m) => ({ default: m.Respaldo })),
)
const TableroInventario = lazy(() =>
  import('@/pages/inventario/Tablero').then((m) => ({ default: m.TableroInventario })),
)
const Talleres = lazy(() =>
  import('@/pages/inventario/Talleres').then((m) => ({ default: m.Talleres })),
)
const Vehiculos = lazy(() =>
  import('@/pages/despachos/Vehiculos').then((m) => ({ default: m.Vehiculos })),
)
const Maquinaria = lazy(() =>
  import('@/pages/maquinaria/Maquinaria').then((m) => ({ default: m.Maquinaria })),
)
const Existencias = lazy(() =>
  import('@/pages/inventario/Existencias').then((m) => ({ default: m.Existencias })),
)
const Movimientos = lazy(() =>
  import('@/pages/inventario/Movimientos').then((m) => ({ default: m.Movimientos })),
)
const TableroNomina = lazy(() =>
  import('@/pages/nomina/Tablero').then((m) => ({ default: m.TableroNomina })),
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
const Tabulador = lazy(() =>
  import('@/pages/nomina/Tabulador').then((m) => ({ default: m.Tabulador })),
)
const TableroTesoreria = lazy(() =>
  import('@/pages/tesoreria/Tablero').then((m) => ({ default: m.TableroTesoreria })),
)
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
const TableroVentas = lazy(() =>
  import('@/pages/ventas/Tablero').then((m) => ({ default: m.TableroVentas })),
)
const ClientesVenta = lazy(() =>
  import('@/pages/ventas/Clientes').then((m) => ({ default: m.Clientes })),
)
const PreciosVenta = lazy(() =>
  import('@/pages/ventas/Precios').then((m) => ({ default: m.Precios })),
)
const CotizacionesVenta = lazy(() =>
  import('@/pages/ventas/Cotizaciones').then((m) => ({ default: m.Cotizaciones })),
)
const Despachos = lazy(() =>
  import('@/pages/ventas/Despachos').then((m) => ({ default: m.Despachos })),
)
const Facturacion = lazy(() =>
  import('@/pages/ventas/Facturacion').then((m) => ({ default: m.Facturacion })),
)
const PorCobrar = lazy(() =>
  import('@/pages/tesoreria/PorCobrar').then((m) => ({ default: m.PorCobrar })),
)
const TableroExplotacion = lazy(() =>
  import('@/pages/explotacion/Tablero').then((m) => ({ default: m.TableroExplotacion })),
)
const Frentes = lazy(() =>
  import('@/pages/explotacion/Frentes').then((m) => ({ default: m.Frentes })),
)
const Voladuras = lazy(() =>
  import('@/pages/explotacion/Voladuras').then((m) => ({ default: m.Voladuras })),
)
const ProduccionTurno = lazy(() =>
  import('@/pages/explotacion/Produccion').then((m) => ({ default: m.Produccion })),
)
const TableroDespachos = lazy(() =>
  import('@/pages/despachos/Tablero').then((m) => ({ default: m.TableroDespachos })),
)
const Tickets = lazy(() =>
  import('@/pages/despachos/Tickets').then((m) => ({ default: m.Tickets })),
)
const Guias = lazy(() => import('@/pages/despachos/Guias').then((m) => ({ default: m.Guias })))
const FacturasProveedor = lazy(() =>
  import('@/pages/compras/FacturasProveedor').then((m) => ({ default: m.FacturasProveedor })),
)
const Prestaciones = lazy(() =>
  import('@/pages/nomina/Prestaciones').then((m) => ({ default: m.Prestaciones })),
)
const Recepciones = lazy(() =>
  import('@/pages/compras/Recepciones').then((m) => ({ default: m.Recepciones })),
)
const LibroCompras = lazy(() =>
  import('@/pages/compras/LibroCompras').then((m) => ({ default: m.LibroCompras })),
)
const LibroVentas = lazy(() =>
  import('@/pages/ventas/LibroVentas').then((m) => ({ default: m.LibroVentas })),
)
const NotasCredito = lazy(() =>
  import('@/pages/ventas/NotasCredito').then((m) => ({ default: m.NotasCredito })),
)
// El manual pesa medio megabyte de texto. Partido, solo lo descarga quien lo abre.
const Manual = lazy(() => import('@/pages/Manual').then((m) => ({ default: m.Manual })))

/**
 * Pantallas ya construidas, por ruta.
 *
 * Las rutas del menú siguen derivándose de `navigation` para que no exista una
 * entrada sin destino; lo que hace este mapa es decidir cuál de ellas ya tiene
 * pantalla real y cuál sigue mostrando el aviso de pendiente. Así el menú y las
 * rutas no se pueden desincronizar.
 */
const paginas: Record<string, ReactNode> = {
  '/app/explotacion': <TableroExplotacion />,
  '/app/explotacion/frentes': <Frentes />,
  '/app/explotacion/voladuras': <Voladuras />,
  '/app/explotacion/produccion': <ProduccionTurno />,
  '/app/despachos': <TableroDespachos />,
  '/app/despachos/tickets': <Tickets />,
  '/app/despachos/guias': <Guias />,
  '/app/compras': <TableroCompras />,
  '/app/compras/proveedores': <Proveedores />,
  '/app/compras/recepciones': <Recepciones />,
  '/app/compras/facturas': <FacturasProveedor />,
  '/app/compras/libro': <LibroCompras />,
  '/app/ventas/notas-credito': <NotasCredito />,
  '/app/ventas/libro': <LibroVentas />,
  '/app/nomina/prestaciones': <Prestaciones />,
  '/app/maquinaria': <Maquinaria />,
  '/app/inventario': <TableroInventario />,
  '/app/inventario/existencias': <Existencias />,
  '/app/inventario/movimientos': <Movimientos />,
  '/app/inventario/talleres': <Talleres />,
  '/app/despachos/vehiculos': <Vehiculos />,
  '/app/nomina': <TableroNomina />,
  '/app/nomina/personal': <Personal />,
  '/app/nomina/tabulador': <Tabulador />,
  '/app/nomina/asistencia': <Asistencia />,
  '/app/nomina/procesos': <Procesos />,
  '/app/nomina/recibos': <Recibos />,
  '/app/nomina/parametros': <Parametros />,
  '/app/tesoreria': <TableroTesoreria />,
  '/app/tesoreria/cuentas': <Cuentas />,
  '/app/tesoreria/pagos': <Pagos />,
  '/app/tesoreria/por-pagar': <PorPagar />,
  '/app/tesoreria/movimientos': <MovimientosTesoreria />,
  '/app/tesoreria/por-cobrar': <PorCobrar />,
  '/app/ventas': <TableroVentas />,
  '/app/ventas/clientes': <ClientesVenta />,
  '/app/ventas/precios': <PreciosVenta />,
  '/app/ventas/cotizaciones': <CotizacionesVenta />,
  '/app/ventas/despachos': <Despachos />,
  '/app/ventas/facturacion': <Facturacion />,
  '/app/config/usuarios': <Usuarios />,
  '/app/inventario/articulos': <Articulos />,
  '/app/inventario/almacenes': <Almacenes />,
  '/app/inventario/transferencias': <Transferencias />,
  '/app/config/empresa': <Empresa />,
  '/app/config/documentos': <Documentos />,
  '/app/config/auditoria': <Auditoria />,
  '/app/config/respaldo': <Respaldo />,
  '/app/tasas': <Tasas />,
  '/app/manual': <Manual />,
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
