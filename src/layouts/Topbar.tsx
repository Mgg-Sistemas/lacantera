import { useEffect, useRef, useState } from 'react'
import { Bell, ChevronDown, LogOut, Menu, PanelLeft, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useSesion } from '@/lib/sesion'
import { cerrarSesion } from '@/lib/auth'

interface TopbarProps {
  onToggleCollapsed: () => void
  onOpenMobile: () => void
  collapsed: boolean
}

export function Topbar({ onToggleCollapsed, onOpenMobile, collapsed }: TopbarProps) {
  const { nombre, usuario, iniciales } = useSesion()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const contenedorMenu = useRef<HTMLDivElement>(null)

  // Cierra al pulsar fuera o con Escape. Un menú que solo cierra pulsando de
  // nuevo su botón se queda abierto tapando contenido.
  useEffect(() => {
    if (!menuAbierto) return

    const alPulsarFuera = (evento: MouseEvent) => {
      if (!contenedorMenu.current?.contains(evento.target as Node)) setMenuAbierto(false)
    }
    const alPulsarTecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setMenuAbierto(false)
    }

    document.addEventListener('mousedown', alPulsarFuera)
    document.addEventListener('keydown', alPulsarTecla)
    return () => {
      document.removeEventListener('mousedown', alPulsarFuera)
      document.removeEventListener('keydown', alPulsarTecla)
    }
  }, [menuAbierto])

  return (
    <header className="bg-canvas/85 sticky top-0 z-30 backdrop-blur-md">
      <div className="flex h-16 items-center gap-2 px-4 sm:px-6">
        {/* Abrir cajón en móvil */}
        <button
          type="button"
          onClick={onOpenMobile}
          aria-label="Abrir menú"
          className="text-ink/60 hover:bg-ink/6 hover:text-ink/90 flex size-9 items-center justify-center rounded-md transition-colors lg:hidden"
        >
          <Menu className="size-5" />
        </button>

        {/* Contraer / expandir en escritorio */}
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
          className="text-ink/60 hover:bg-ink/6 hover:text-ink/90 hidden size-9 items-center justify-center rounded-md transition-colors lg:flex"
        >
          <PanelLeft className={cn('size-5 transition-transform', collapsed && 'rotate-180')} />
        </button>

        {/* Búsqueda */}
        <button
          type="button"
          className="text-ink/45 hover:text-ink/70 ml-1 flex items-center gap-2 rounded-md text-base transition-colors"
        >
          <Search className="size-5" />
          <span className="hidden sm:inline">Buscar</span>
          <kbd className="text-ink/40 border-ink/15 hidden rounded border px-1.5 py-0.5 text-2xs font-medium md:inline">
            Ctrl K
          </kbd>
        </button>

        <div className="flex-1" />

        {/*
          Tasa del día, siempre visible.
          En un sistema bimoneda no es un adorno: cada documento que alguien
          emita hoy se congela a esta tasa. Si está desactualizada, todo lo
          que se registre queda mal valorado.
        */}
        <div className="border-hairline bg-surface mr-1 hidden items-center gap-2.5 rounded-full border py-1.5 pr-3 pl-3 sm:flex">
          <span className="bg-success size-1.5 shrink-0 rounded-full" />
          <div className="leading-tight">
            <span className="text-ink/45 text-2xs block">Tasa BCV · hoy</span>
            <span className="text-ink/90 tabular block text-sm font-semibold">Bs 235,4180</span>
          </div>
        </div>

        {/* Notificaciones */}
        <button
          type="button"
          aria-label="Notificaciones"
          className="text-ink/60 hover:bg-ink/6 hover:text-ink/90 relative flex size-9 items-center justify-center rounded-md transition-colors"
        >
          <Bell className="size-5" />
          <span className="bg-danger absolute top-1.5 right-1.5 size-2 rounded-full ring-2 ring-[#F3F5FB]" />
        </button>

        {/* Usuario */}
        <div className="relative ml-1" ref={contenedorMenu}>
          <button
            type="button"
            onClick={() => setMenuAbierto((v) => !v)}
            aria-expanded={menuAbierto}
            aria-haspopup="menu"
            className="hover:bg-ink/6 flex items-center gap-2 rounded-md py-1 pr-2 pl-1 transition-colors"
          >
            <span className="bg-royal-600 flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white">
              {iniciales}
            </span>
            <span className="text-ink/80 hidden max-w-[140px] truncate text-sm font-medium md:inline">
              {nombre}
            </span>
            <ChevronDown
              className={cn(
                'text-ink/45 hidden size-4 transition-transform md:inline',
                menuAbierto && 'rotate-180',
              )}
            />
          </button>

          {menuAbierto ? (
            <div
              role="menu"
              className="bg-surface shadow-popover rounded-card absolute right-0 mt-2 w-56 overflow-hidden py-1"
            >
              <div className="border-hairline border-b px-3 py-2.5">
                <p className="text-ink/85 truncate text-sm font-medium">{nombre}</p>
                <p className="text-ink/45 truncate text-xs">{usuario}</p>
              </div>

              <button
                type="button"
                role="menuitem"
                onClick={() => void cerrarSesion()}
                className="text-ink/75 hover:bg-ink/6 hover:text-ink/90 flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors"
              >
                <LogOut className="size-[18px]" />
                Cerrar sesión
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
