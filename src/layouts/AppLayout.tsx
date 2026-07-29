import { useEffect, useState } from 'react'
import { Outlet } from 'react-router'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { cn } from '@/lib/cn'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useTiempoReal } from '@/lib/tiempoReal'

const CLAVE_COLAPSADO = 'lacantera:sidebar-colapsado'

export function AppLayout() {
  // Se recuerda entre sesiones: quien trabaja todo el día en tablas anchas
  // deja el menú contraído y no quiere volver a hacerlo cada mañana.
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(CLAVE_COLAPSADO) === 'true',
  )
  const [mobileOpen, setMobileOpen] = useState(false)

  // Contraer es una decisión de escritorio. En un teléfono el menú es un cajón
  // que tapa la pantalla: mostrarlo en modo icono deja al usuario adivinando
  // qué significa cada símbolo, sin ganar nada de espacio a cambio.
  const esEscritorio = useMediaQuery('(min-width: 1024px)')
  const contraido = esEscritorio && collapsed

  // El enlace en vivo se abre una sola vez para toda la aplicación. Uno por
  // pantalla multiplicaría las conexiones sin ganar nada: lo que cambia no es
  // lo que se está mirando, es la base.
  const tiempoReal = useTiempoReal()

  useEffect(() => {
    localStorage.setItem(CLAVE_COLAPSADO, String(collapsed))
  }, [collapsed])

  // Bloquea el scroll del fondo mientras el cajón móvil está abierto.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  return (
    <div className="bg-canvas min-h-svh">
      <Sidebar
        collapsed={contraido}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div
        className={cn(
          'transition-[padding] duration-200 ease-out',
          collapsed ? 'lg:pl-[72px]' : 'lg:pl-[260px]',
        )}
      >
        <Topbar
          collapsed={collapsed}
          tiempoReal={tiempoReal}
          onToggleCollapsed={() => setCollapsed((v) => !v)}
          onOpenMobile={() => setMobileOpen(true)}
        />

        <main className="px-4 pb-10 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
