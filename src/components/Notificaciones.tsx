import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  Bell,
  BellOff,
  Boxes,
  CheckCheck,
  ClipboardList,
  Landmark,
  Settings,
  ShoppingCart,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  useMarcarLeida,
  useMarcarTodasLeidas,
  useNotificaciones,
} from '@/lib/api/notificaciones'
import type { Importancia, Modulo, Notificacion } from '@/lib/api/notificaciones'
import { alternarSilencio, silenciado, sonarAviso } from '@/lib/sonido'
import { hace } from '@/lib/formato'
import { cn } from '@/lib/cn'

const iconos: Record<Modulo, LucideIcon> = {
  COMPRAS: ShoppingCart,
  INVENTARIO: Boxes,
  NOMINA: Users,
  TESORERIA: Landmark,
  VENTAS: ClipboardList,
  SISTEMA: Settings,
}

const tonos: Record<Importancia, string> = {
  INFO: 'bg-royal-600/12 text-royal-700 dark:text-royal-300',
  ATENCION: 'bg-warning/16 text-warning',
  URGENTE: 'bg-danger/12 text-danger',
}

function Fila({
  notificacion,
  onAbrir,
}: {
  notificacion: Notificacion
  onAbrir: (n: Notificacion) => void
}) {
  const Icono = iconos[notificacion.modulo] ?? Settings

  return (
    <button
      type="button"
      onClick={() => onAbrir(notificacion)}
      className={cn(
        'hover:bg-ink/5 flex w-full gap-3 px-3 py-3 text-left transition-colors',
        !notificacion.leida && 'bg-royal-600/6',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
          tonos[notificacion.importancia],
        )}
      >
        <Icono className="size-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span
            className={cn(
              'text-ink/90 flex-1 text-sm leading-snug',
              !notificacion.leida && 'font-semibold',
            )}
          >
            {notificacion.titulo}
          </span>
          {!notificacion.leida ? (
            <span className="bg-royal-600 mt-1.5 size-2 shrink-0 rounded-full" />
          ) : null}
        </span>

        {notificacion.detalle ? (
          <span className="text-ink/55 mt-0.5 block text-xs leading-relaxed">
            {notificacion.detalle}
          </span>
        ) : null}

        <span className="text-ink/40 mt-1 block text-2xs">
          {hace(notificacion.creada_en)}
          {notificacion.actor ? ` · ${notificacion.actor}` : ''}
        </span>
      </span>
    </button>
  )
}

export function Notificaciones() {
  const navigate = useNavigate()
  const { data, isPending } = useNotificaciones()
  const marcarLeida = useMarcarLeida()
  const marcarTodas = useMarcarTodasLeidas()

  const [abierto, setAbierto] = useState(false)
  const [mudo, setMudo] = useState(() => silenciado())
  const contenedor = useRef<HTMLDivElement>(null)

  // Último aviso conocido. Arranca en `null` para no sonar al entrar: al abrir
  // la aplicación todo es "nuevo" y sonaría una campanada por cada aviso
  // acumulado desde ayer.
  const ultimoVisto = useRef<number | null>(null)

  useEffect(() => {
    if (!data) return

    const mayor = data.reduce((m, n) => Math.max(m, n.id), 0)

    if (ultimoVisto.current === null) {
      ultimoVisto.current = mayor
      return
    }

    if (mayor > ultimoVisto.current) {
      const nuevas = data.filter((n) => n.id > ultimoVisto.current! && !n.leida)
      if (nuevas.length > 0) sonarAviso()
      ultimoVisto.current = mayor
    }
  }, [data])

  useEffect(() => {
    if (!abierto) return

    const alPulsarFuera = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false)
    }
    const alPulsarTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false)
    }

    document.addEventListener('mousedown', alPulsarFuera)
    document.addEventListener('keydown', alPulsarTecla)
    return () => {
      document.removeEventListener('mousedown', alPulsarFuera)
      document.removeEventListener('keydown', alPulsarTecla)
    }
  }, [abierto])

  const sinLeer = (data ?? []).filter((n) => !n.leida).length

  const abrir = (n: Notificacion) => {
    // Se marca leída aunque el aviso no lleve a ningún sitio: leerlo es
    // haberse enterado, que es lo que la marca significa.
    if (!n.leida) marcarLeida.mutate({ id: n.id })
    setAbierto(false)
    if (n.ruta) void navigate(n.ruta)
  }

  return (
    <div className="relative" ref={contenedor}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={
          sinLeer > 0 ? `Notificaciones, ${sinLeer} sin leer` : 'Notificaciones'
        }
        aria-expanded={abierto}
        className="text-ink/60 hover:bg-ink/6 hover:text-ink/90 relative flex size-9 items-center justify-center rounded-md transition-colors"
      >
        <Bell className="size-5" />
        {sinLeer > 0 ? (
          <span className="bg-danger ring-canvas absolute -top-0.5 -right-0.5 flex min-w-[18px] items-center justify-center rounded-full px-1 text-2xs font-semibold text-white ring-2">
            {sinLeer > 99 ? '99+' : sinLeer}
          </span>
        ) : null}
      </button>

      {abierto ? (
        <div
          role="dialog"
          aria-label="Notificaciones"
          className="bg-surface shadow-popover rounded-card border-hairline absolute right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden border"
        >
          <div className="border-hairline flex items-center justify-between gap-2 border-b px-3 py-2.5">
            <div>
              <p className="text-ink/85 text-sm font-semibold">Movimientos</p>
              <p className="text-ink/45 text-2xs">
                {sinLeer > 0 ? `${sinLeer} sin leer` : 'Todo al día'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setMudo(alternarSilencio())}
              aria-pressed={mudo}
              title={mudo ? 'Activar el sonido de aviso' : 'Silenciar el sonido de aviso'}
              className="text-ink/45 hover:bg-ink/6 hover:text-ink/80 rounded-md p-1.5 transition-colors"
            >
              {mudo ? <BellOff className="size-4" /> : <Bell className="size-4" />}
            </button>
          </div>

          <div className="divide-hairline max-h-[min(28rem,60svh)] divide-y overflow-y-auto">
            {isPending ? (
              <p className="text-ink/45 px-3 py-8 text-center text-sm">Cargando…</p>
            ) : null}

            {data && data.length === 0 ? (
              <div className="px-3 py-10 text-center">
                <Bell className="text-ink/20 mx-auto size-7" />
                <p className="text-ink/60 mt-2 text-sm">Sin movimientos todavía</p>
                <p className="text-ink/40 mt-0.5 text-xs">
                  Aquí entran los pedidos, las entradas de inventario y los pagos.
                </p>
              </div>
            ) : null}

            {data?.map((n) => (
              <Fila key={n.id} notificacion={n} onAbrir={abrir} />
            ))}
          </div>

          {sinLeer > 0 ? (
            <div className="border-hairline border-t px-3 py-2">
              <button
                type="button"
                onClick={() => marcarTodas.mutate()}
                disabled={marcarTodas.isPending}
                className="text-royal-600 hover:bg-royal-600/8 dark:text-royal-300 flex w-full items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors disabled:opacity-60"
              >
                <CheckCheck className="size-4" />
                Marcar todas como leídas
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
