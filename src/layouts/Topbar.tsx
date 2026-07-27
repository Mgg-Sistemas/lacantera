import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut, Menu, Monitor, Moon, PanelLeft, Search, Sun } from 'lucide-react'
import { Notificaciones } from '@/components/Notificaciones'
import { cn } from '@/lib/cn'
import { useSesion } from '@/lib/sesion'
import { cerrarSesion } from '@/lib/auth'
import { useTema } from '@/lib/tema'
import type { Tema } from '@/lib/tema'
import { useTasaBcv } from '@/lib/tasaBcv'
import { tasa as formatearTasa } from '@/lib/formato'

interface TopbarProps {
  onToggleCollapsed: () => void
  onOpenMobile: () => void
  collapsed: boolean
}

const opcionesTema: { valor: Tema; etiqueta: string; icono: typeof Sun }[] = [
  { valor: 'claro', etiqueta: 'Claro', icono: Sun },
  { valor: 'oscuro', etiqueta: 'Oscuro', icono: Moon },
  { valor: 'sistema', etiqueta: 'Sistema', icono: Monitor },
]

/**
 * Tasa del día.
 *
 * No es un adorno: cada documento que se emita hoy se congela a esta tasa. Por
 * eso el estado importa tanto como el número — una tasa de ayer mostrada como
 * si fuera de hoy hace que todo lo registrado quede mal valorado, y eso no se
 * descubre hasta el cierre del mes.
 */
function IndicadorTasa() {
  const { data, isPending, isError } = useTasaBcv()

  if (isPending) {
    return (
      <div className="border-hairline bg-surface mr-1 hidden items-center gap-2.5 rounded-full border py-1.5 pr-3 pl-3 sm:flex">
        <span className="bg-ink/20 size-1.5 shrink-0 animate-pulse rounded-full" />
        <div className="leading-tight">
          <span className="text-ink/45 text-2xs block">Tasa BCV</span>
          <span className="bg-ink/10 mt-0.5 block h-3 w-20 animate-pulse rounded" />
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div
        title="No se pudo consultar la tasa. Verifica la conexión antes de emitir documentos."
        className="border-danger/30 bg-danger-soft mr-1 hidden items-center gap-2.5 rounded-full border py-1.5 pr-3 pl-3 sm:flex"
      >
        <span className="bg-danger size-1.5 shrink-0 rounded-full" />
        <div className="leading-tight">
          <span className="text-ink/45 text-2xs block">Tasa BCV</span>
          <span className="text-danger block text-sm font-semibold">No disponible</span>
        </div>
      </div>
    )
  }

  const fechaCorta = data.fecha.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })

  return (
    <div
      title={
        data.vigente
          ? 'Tasa publicada hoy'
          : `La última tasa publicada es del ${fechaCorta}. Confirma antes de emitir documentos.`
      }
      className={cn(
        'mr-1 hidden items-center gap-2.5 rounded-full border py-1.5 pr-3 pl-3 sm:flex',
        data.vigente ? 'border-hairline bg-surface' : 'border-warning/40 bg-warning-soft',
      )}
    >
      <span
        className={cn('size-1.5 shrink-0 rounded-full', data.vigente ? 'bg-success' : 'bg-warning')}
      />
      <div className="leading-tight">
        <span className="text-ink/45 text-2xs block">
          Tasa BCV · {data.vigente ? 'hoy' : fechaCorta}
        </span>
        <span className="text-ink/90 tabular block text-sm font-semibold">
          Bs {formatearTasa(data.valor)}
        </span>
      </div>
    </div>
  )
}

export function Topbar({ onToggleCollapsed, onOpenMobile, collapsed }: TopbarProps) {
  const { nombre, usuario, iniciales } = useSesion()
  const { tema, setTema } = useTema()
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

        <IndicadorTasa />

        <Notificaciones />

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
              className="bg-surface shadow-popover rounded-card border-hairline absolute right-0 mt-2 w-60 overflow-hidden border py-1"
            >
              <div className="border-hairline border-b px-3 py-2.5">
                <p className="text-ink/85 truncate text-sm font-medium">{nombre}</p>
                <p className="text-ink/45 truncate text-xs">{usuario}</p>
              </div>

              {/* Tema: los tres estados a la vista. Un botón que rota entre
                  modos obliga a pulsarlo para descubrir qué opciones hay. */}
              <div className="border-hairline border-b px-3 py-2.5">
                <p className="text-ink/45 mb-1.5 text-2xs font-semibold tracking-wider uppercase">
                  Apariencia
                </p>
                <div className="bg-ink/6 flex gap-0.5 rounded-md p-0.5">
                  {opcionesTema.map(({ valor, etiqueta, icono: Icono }) => (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => setTema(valor)}
                      aria-pressed={tema === valor}
                      className={cn(
                        'flex flex-1 flex-col items-center gap-1 rounded px-1 py-1.5 text-2xs font-medium transition-colors',
                        tema === valor
                          ? 'bg-surface text-ink/90 shadow-control'
                          : 'text-ink/55 hover:text-ink/80',
                      )}
                    >
                      <Icono className="size-4" />
                      {etiqueta}
                    </button>
                  ))}
                </div>
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
