import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  ChevronDown,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PanelLeft,
  Sun,
  UserRound,
  WifiOff,
} from 'lucide-react'
import { Notificaciones } from '@/components/Notificaciones'
import { Buscador } from '@/components/Buscador'
import { cn } from '@/lib/cn'
import { useSesion } from '@/lib/sesion'
import { cerrarSesion } from '@/lib/auth'
import { useTema } from '@/lib/tema'
import type { Tema } from '@/lib/tema'
import { useTasaBcv } from '@/lib/tasaBcv'
import { useTasaVigente } from '@/lib/api/tasas'
import type { EstadoTiempoReal } from '@/lib/tiempoReal'
import { tasa as formatearTasa } from '@/lib/formato'

interface TopbarProps {
  onToggleCollapsed: () => void
  onOpenMobile: () => void
  collapsed: boolean
  tiempoReal: EstadoTiempoReal
}

/**
 * Aviso de que la pantalla dejó de actualizarse sola.
 *
 * Solo aparece cuando el enlace en vivo se cayó. Un distintivo permanente que
 * dijera "en vivo" sería ruido: lo normal no hace falta anunciarlo. Lo que sí
 * hay que decir es lo contrario, porque una pantalla quieta se ve exactamente
 * igual que una pantalla al día, y sobre esos números se paga y se despacha.
 */
function IndicadorEnVivo({ estado }: { estado: EstadoTiempoReal }) {
  if (estado !== 'sin-conexion') return null

  const explicacion =
    'Se perdió el enlace con el servidor. Lo que ves puede estar viejo; recarga la página para ponerlo al día.'

  return (
    <span
      role="status"
      title={explicacion}
      aria-label={`Sin conexión en vivo. ${explicacion}`}
      // Visible también en el teléfono, solo que reducido al icono. Esconderlo
      // en pantallas chicas sería esconderlo justo donde la señal se cae: en el
      // patio y en los frentes, no en la oficina.
      className="border-warning/40 bg-warning-soft text-warning mr-1 flex shrink-0 items-center gap-1.5 rounded-full border py-1.5 pr-2.5 pl-2.5 text-xs font-medium sm:pr-3"
    >
      <WifiOff className="size-3.5 shrink-0" />
      <span className="hidden sm:inline">Sin conexión en vivo</span>
    </span>
  )
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
 *
 * ENSEÑA DOS COSAS PORQUE SON DOS COSAS
 *
 * Lo que el BCV publica y lo que el sistema tiene registrado no son lo mismo.
 * Las tasas no se registran solas a propósito: una vez guardadas no se
 * corrigen, así que alguien tiene que confirmarlas.
 *
 * Este indicador enseñaba solo la publicada, con su punto verde y su «hoy», y
 * eso era un problema: el día que el BCV publica y nadie la carga, arriba se
 * lee la nueva mientras los documentos salen con la de ayer. Quien mira la
 * barra cree que está todo bien. Christopher lo vio de frente —dos números
 * distintos en la misma pantalla— y tenía razón en preguntar.
 *
 * Ahora el punto verde significa una sola cosa: lo que ves es lo que se va a
 * usar. Si no coinciden, el indicador se pone ámbar y lleva a arreglarlo.
 */
function IndicadorTasa() {
  const { data, isPending, isError } = useTasaBcv()
  const registrada = useTasaVigente()

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

  // La publicada de hoy está, pero el sistema todavía valora con una anterior
  // —o con ninguna—. Es el caso que hacía que la barra dijera una cosa y los
  // documentos otra.
  const sinRegistrar =
    data.vigente && !registrada.isPending && (!registrada.data || registrada.data.arrastrada)

  const enCalma = data.vigente && !sinRegistrar

  const contenido = (
    <>
      <span
        className={cn('size-1.5 shrink-0 rounded-full', enCalma ? 'bg-success' : 'bg-warning')}
      />
      <div className="leading-tight">
        <span className="text-ink/45 text-2xs block">
          Tasa BCV · {data.vigente ? 'hoy' : fechaCorta}
          {sinRegistrar ? ' · sin registrar' : ''}
        </span>
        <span className="text-ink/90 tabular block text-sm font-semibold">
          Bs {formatearTasa(data.valor)}
        </span>
      </div>
    </>
  )

  const clases = cn(
    'mr-1 hidden items-center gap-2.5 rounded-full border py-1.5 pr-3 pl-3 sm:flex',
    enCalma ? 'border-hairline bg-surface' : 'border-warning/40 bg-warning-soft',
  )

  // Cuando hay algo que arreglar, el indicador lleva a donde se arregla.
  // Avisar de un problema sin decir dónde se resuelve solo sirve para molestar.
  if (sinRegistrar) {
    return (
      <Link
        to="/app/tasas"
        title={
          registrada.data
            ? `El BCV publicó Bs ${formatearTasa(data.valor)} hoy, pero el sistema todavía valora con la del ${new Date(`${registrada.data.fecha}T12:00:00`).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })}. Regístrala antes de emitir documentos.`
            : 'No hay ninguna tasa registrada: no se puede valorar ningún documento.'
        }
        className={cn(clases, 'hover:border-warning/60 transition-colors')}
      >
        {contenido}
      </Link>
    )
  }

  return (
    <div
      title={
        data.vigente
          ? 'Tasa publicada hoy y registrada en el sistema: es la que valora lo que se emita ahora.'
          : `La última tasa publicada es del ${fechaCorta}. Confirma antes de emitir documentos.`
      }
      className={clases}
    >
      {contenido}
    </div>
  )
}

export function Topbar({
  onToggleCollapsed,
  onOpenMobile,
  collapsed,
  tiempoReal,
}: TopbarProps) {
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

        {/* Búsqueda. Llevaba puesta desde el principio sin `onClick`: un botón
            con su atajo dibujado al lado que no hacía nada. */}
        <Buscador />

        <div className="flex-1" />

        <IndicadorEnVivo estado={tiempoReal} />

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

              <Link
                to="/app/cuenta"
                role="menuitem"
                onClick={() => setMenuAbierto(false)}
                className="text-ink/75 hover:bg-ink/6 hover:text-ink/90 flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors"
              >
                <UserRound className="size-[18px]" />
                Mi cuenta
              </Link>

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
