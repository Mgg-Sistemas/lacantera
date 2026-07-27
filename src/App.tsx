import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AppLayout } from '@/layouts/AppLayout'
import { Dashboard } from '@/pages/Dashboard'
import { Login } from '@/pages/Login'
import { ModuloPendiente } from '@/pages/ModuloPendiente'
import { navigation } from '@/config/navigation'

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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />

        <Route path="/app" element={<AppLayout />}>
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
  )
}
