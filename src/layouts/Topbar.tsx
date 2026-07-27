import { Bell, ChevronDown, Menu, PanelLeft, Search } from 'lucide-react'
import { cn } from '@/lib/cn'

interface TopbarProps {
  onToggleCollapsed: () => void
  onOpenMobile: () => void
  collapsed: boolean
}

export function Topbar({ onToggleCollapsed, onOpenMobile, collapsed }: TopbarProps) {
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
            <span className="text-ink/90 tabular block text-sm font-semibold">
              Bs 235,4180
            </span>
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
        <button
          type="button"
          className="hover:bg-ink/6 ml-1 flex items-center gap-2 rounded-md py-1 pr-2 pl-1 transition-colors"
        >
          <span className="bg-royal-600 flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white">
            AS
          </span>
          <span className="text-ink/80 hidden text-sm font-medium md:inline">Angélica</span>
          <ChevronDown className="text-ink/45 hidden size-4 md:inline" />
        </button>
      </div>
    </header>
  )
}
