import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { ChevronDown, X } from 'lucide-react'
import { navigation } from '@/config/navigation'
import type { NavItem } from '@/config/navigation'
import { Logo } from '@/components/Logo'
import { cn } from '@/lib/cn'

interface SidebarProps {
  collapsed: boolean
  /** Estado del cajón en móvil. En escritorio siempre es false. */
  mobileOpen: boolean
  onCloseMobile: () => void
}

export function Sidebar({ collapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const { pathname } = useLocation()

  // Un grupo abierto a la vez: con ocho módulos, permitir varios abiertos
  // convierte el riel en una lista de cuarenta líneas.
  const [openGroup, setOpenGroup] = useState<string | null>(null)

  const groupContains = (item: NavItem) =>
    item.children?.some((child) => pathname.startsWith(child.to)) ?? false

  // Al navegar, abre el grupo que contiene la ruta actual.
  useEffect(() => {
    const active = navigation
      .flatMap((section) => section.items)
      .find((item) => groupContains(item))
    if (active) setOpenGroup(active.label)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Colapsado no puede tener submenús desplegados: no hay ancho para el texto.
  useEffect(() => {
    if (collapsed) setOpenGroup(null)
  }, [collapsed])

  return (
    <>
      {/* Velo en móvil */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={onCloseMobile}
          className="bg-ink/40 fixed inset-0 z-40 lg:hidden"
        />
      )}

      <aside
        className={cn(
          'bg-surface fixed inset-y-0 left-0 z-50 flex flex-col border-r transition-[width,transform] duration-200 ease-out',
          'border-hairline',
          collapsed ? 'w-[72px]' : 'w-[260px]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Cabecera */}
        <div
          className={cn(
            'flex h-16 shrink-0 items-center',
            collapsed ? 'justify-center px-3' : 'justify-between pr-3 pl-5',
          )}
        >
          <NavLink to="/app" onClick={onCloseMobile}>
            <Logo markOnly={collapsed} />
          </NavLink>

          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Cerrar menú"
            className="text-ink/45 hover:bg-ink/6 flex size-8 items-center justify-center rounded-md lg:hidden"
          >
            <X className="size-[18px]" />
          </button>
        </div>

        {/* Navegación */}
        <nav className="scrollbar-none flex-1 overflow-y-auto px-3 pb-4">
          {navigation.map((section, index) => (
            <div key={section.label ?? `seccion-${index}`} className={index > 0 ? 'mt-5' : ''}>
              {section.label ? (
                collapsed ? (
                  <div className="bg-hairline mx-2 my-3 h-px" />
                ) : (
                  <p className="text-ink/40 mb-1.5 px-3 text-2xs font-semibold tracking-wider uppercase">
                    {section.label}
                  </p>
                )
              ) : null}

              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <SidebarItem
                    key={item.label}
                    item={item}
                    collapsed={collapsed}
                    open={openGroup === item.label}
                    onToggle={() =>
                      setOpenGroup((current) => (current === item.label ? null : item.label))
                    }
                    onNavigate={onCloseMobile}
                  />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Pie: quién está dentro. En un sistema con segregación de
            funciones, el usuario activo debe estar siempre a la vista. */}
        <div className={cn('border-hairline shrink-0 border-t p-3', collapsed && 'px-2')}>
          <div className={cn('flex items-center gap-2.5', collapsed && 'justify-center')}>
            <span className="bg-royal-600/12 text-royal-700 flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
              AS
            </span>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-ink/85 truncate text-sm font-medium">Angélica Solís</p>
                <p className="text-ink/45 truncate text-xs">Administración</p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}

interface SidebarItemProps {
  item: NavItem
  collapsed: boolean
  open: boolean
  onToggle: () => void
  onNavigate: () => void
}

function SidebarItem({ item, collapsed, open, onToggle, onNavigate }: SidebarItemProps) {
  const { pathname } = useLocation()
  const Icon = item.icon
  const isGroupActive = item.children?.some((child) => pathname.startsWith(child.to)) ?? false

  const baseRow = cn(
    'group relative flex w-full items-center rounded-md transition-colors duration-150',
    collapsed ? 'h-10 justify-center px-0' : 'h-10 gap-3 px-3',
  )

  // --- Enlace directo ---
  if (item.to) {
    return (
      <li>
        <NavLink
          to={item.to}
          end
          onClick={onNavigate}
          title={collapsed ? item.label : undefined}
          className={({ isActive }) =>
            cn(
              baseRow,
              isActive
                ? 'bg-royal-600 shadow-primary text-white'
                : 'text-ink/70 hover:bg-ink/6 hover:text-ink/90',
            )
          }
        >
          <Icon className="size-[20px] shrink-0" />
          {!collapsed && <span className="truncate text-base">{item.label}</span>}
        </NavLink>
      </li>
    )
  }

  // --- Grupo con submenú ---
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        title={collapsed ? item.label : undefined}
        aria-expanded={open}
        className={cn(
          baseRow,
          isGroupActive && !open
            ? 'bg-royal-600/10 text-royal-700'
            : 'text-ink/70 hover:bg-ink/6 hover:text-ink/90',
        )}
      >
        <Icon className="size-[20px] shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 truncate text-left text-base">{item.label}</span>
            {item.badge ? (
              <span className="bg-danger flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-2xs font-semibold text-white">
                {item.badge}
              </span>
            ) : null}
            <ChevronDown
              className={cn(
                'size-4 shrink-0 transition-transform duration-200',
                open && 'rotate-180',
              )}
            />
          </>
        )}
        {/* Colapsado: el badge se reduce a un punto sobre el icono */}
        {collapsed && item.badge ? (
          <span className="bg-danger absolute top-1.5 right-1.5 size-2 rounded-full ring-2 ring-white" />
        ) : null}
      </button>

      {!collapsed && open && item.children ? (
        <ul className="border-hairline mt-0.5 ml-[26px] space-y-0.5 border-l pl-3">
          {item.children.map((child) => (
            <li key={child.to}>
              <NavLink
                to={child.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'block truncate rounded-md px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-royal-600/12 text-royal-700 font-medium'
                      : 'text-ink/60 hover:bg-ink/5 hover:text-ink/90',
                  )
                }
              >
                {child.label}
              </NavLink>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}
