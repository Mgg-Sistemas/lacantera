import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AppLayout } from '@/layouts/AppLayout'
import { Dashboard } from '@/pages/Dashboard'
import { Login } from '@/pages/Login'
import { ModuloPendiente } from '@/pages/ModuloPendiente'
import { navigation } from '@/config/navigation'
import { SesionProvider, useSesion } from '@/lib/sesion'
import { Logo } from '@/components/Logo'

/**
 * Las rutas de los módulos se derivan del mismo archivo que dibuja el menú.
 * Así es imposible que exista una entrada de menú sin ruta, o una ruta
 * huérfana que nadie puede alcanzar.
 */
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
            {rutasDeModulos.map((ruta) => (
              <Route
                key={ruta.path}
                // Las rutas del menú son absolutas; aquí se necesitan relativas al padre.
                path={ruta.path.replace('/app/', '')}
                element={<ModuloPendiente title={ruta.label} seccion={ruta.seccion} />}
              />
            ))}
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SesionProvider>
  )
}
