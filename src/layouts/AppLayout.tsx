import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { Cargando } from '@/components/ui/Estado'
import { cn } from '@/lib/cn'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useTiempoReal } from '@/lib/tiempoReal'
import { useLatido } from '@/lib/api/usuarios'

const CLAVE_COLAPSADO = 'lacantera:sidebar-colapsado'

export function AppLayout() {
  /*
    La señal de vida, una sola para toda la aplicacion.

    Va aqui y no en la pantalla que enseña los conectados, porque lo que hay
    que saber es quien esta usando el sistema, no quien esta mirando la lista.
  */
  useLatido()

  // Se recuerda entre sesiones: quien trabaja todo el día en tablas anchas
  // deja el menú contraído y no quiere volver a hacerlo cada mañana.
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(CLAVE_COLAPSADO) === 'true',
  )
  const [mobileOpen, setMobileOpen] = useState(false)

  // La ruta actual, para reiniciar la entrada del contenido en cada pantalla.
  const { pathname } = useLocation()

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

        {/* Cada pantalla llega en su propio archivo y se pide al entrar en
            ella. La espera va aquí dentro, no encima de todo: el menú y la
            barra siguen puestos, así que se ve una pantalla cargando y no la
            aplicación reiniciándose. */}
        <main className="px-4 pb-10 sm:px-6">
          <Suspense fallback={<Cargando />}>
            {/*
              Cada pantalla entra, no aparece de golpe.

              Es el mismo gesto del acceso y de la portada, y aquí hace un
              trabajo además de estético: el menú y la barra no se mueven al
              navegar, así que sin nada que cambie visiblemente cuesta saber si
              el clic surtió efecto. Que el contenido suba un poco al llegar lo
              confirma sin decir nada.

              La `key` es la ruta: React vuelve a montar el bloque al cambiar de
              pantalla y la animación se repite. Va dentro del Suspense y no
              fuera, porque envolviéndolo cada navegación remontaría también la
              espera y se vería el "cargando" parpadear en pantallas que ya
              estaban descargadas.

              400 ms y no los 800 de la portada: allí la entrada es el
              espectáculo y aquí es un acuse de recibo. Las guías de UX cortan
              las transiciones de pantalla en 400 ms, y con razón — esto se
              repite decenas de veces al día.
            */}
            <div key={pathname} className="anim-surgir [animation-duration:400ms]">
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>
    </div>
  )
}
