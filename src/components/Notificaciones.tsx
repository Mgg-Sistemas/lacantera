import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Bell, BellOff, CheckCheck, List } from 'lucide-react'
import {
  agruparPorAsunto,
  useMarcarLeidas,
  useMarcarTodasLeidas,
  useNotificaciones,
} from '@/lib/api/notificaciones'
import type { GrupoDeAvisos } from '@/lib/api/notificaciones'
import { iconoDe, TONO_DE_IMPORTANCIA } from '@/components/avisos'
import { TodasLasNotificaciones } from '@/components/TodasLasNotificaciones'
import { alternarSilencio, silenciado, sonarAviso } from '@/lib/sonido'
import { hace } from '@/lib/formato'
import { cn } from '@/lib/cn'

/**
 * Un asunto, una fila.
 *
 * Enseña en qué estado está la cosa —el aviso más reciente— y, si llegó ahí
 * dando pasos, cuántos fueron. Los pasos se ven enteros en el modal de todas:
 * aquí ocuparían la campana entera para contar una historia que ya terminó.
 */
function Fila({
  grupo,
  onAbrir,
}: {
  grupo: GrupoDeAvisos
  onAbrir: (g: GrupoDeAvisos) => void
}) {
  const n = grupo.ultimo
  const Icono = iconoDe(n.modulo)

  return (
    <button
      type="button"
      onClick={() => onAbrir(grupo)}
      className={cn(
        'hover:bg-ink/5 flex w-full gap-3 px-3 py-3 text-left transition-colors',
        grupo.sinLeer > 0 && 'bg-royal-600/6',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
          TONO_DE_IMPORTANCIA[n.importancia],
        )}
      >
        <Icono className="size-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span
            className={cn(
              'text-ink/90 flex-1 text-sm leading-snug',
              grupo.sinLeer > 0 && 'font-semibold',
            )}
          >
            {n.titulo}
          </span>
          {grupo.sinLeer > 0 ? (
            <span className="bg-royal-600 mt-1.5 size-2 shrink-0 rounded-full" />
          ) : null}
        </span>

        {n.detalle ? (
          <span className="text-ink/55 mt-0.5 block text-xs leading-relaxed">{n.detalle}</span>
        ) : null}

        <span className="text-ink/40 mt-1 block text-2xs">
          {hace(n.creada_en)}
          {n.actor ? ` · ${n.actor}` : ''}
          {grupo.avisos.length > 1 ? ` · ${grupo.avisos.length} movimientos` : ''}
        </span>
      </span>
    </button>
  )
}

export function Notificaciones() {
  const navigate = useNavigate()
  const { data, isPending } = useNotificaciones()
  const marcarLeidas = useMarcarLeidas()
  const marcarTodas = useMarcarTodasLeidas()

  const [abierto, setAbierto] = useState(false)
  const [viendoTodas, setViendoTodas] = useState(false)
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

  /*
    La campana cuenta ASUNTOS sin ver, no avisos sin ver.

    Es la misma cuenta que se va a encontrar quien la abra: si aprobar una
    compra deja dos avisos y pedir otra deja dos más, el número decía cuatro y
    debajo había dos cosas. Un contador que no cuadra con lo que hay debajo
    enseña a no fiarse del contador.
  */
  const grupos = useMemo(() => agruparPorAsunto(data ?? []), [data])
  const sinLeer = grupos.filter((g) => g.sinLeer > 0).length

  const abrir = (g: GrupoDeAvisos) => {
    // Se marca leído el asunto entero, y aunque no lleve a ningún sitio: haber
    // abierto la compra es haberse enterado de cómo está, que es lo que la
    // marca significa. Ver `useMarcarLeidas`.
    const pendientes = g.avisos.filter((a) => !a.leida).map((a) => a.id)
    if (pendientes.length > 0) marcarLeidas.mutate({ ids: pendientes })
    setAbierto(false)
    if (g.ultimo.ruta) void navigate(g.ultimo.ruta)
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

            {grupos.length === 0 && !isPending ? (
              <div className="px-3 py-10 text-center">
                <Bell className="text-ink/20 mx-auto size-7" />
                <p className="text-ink/60 mt-2 text-sm">Sin movimientos todavía</p>
                <p className="text-ink/40 mt-0.5 text-xs">
                  Aquí entran los pedidos, las entradas de inventario y los pagos.
                </p>
              </div>
            ) : null}

            {/*
              Solo los ocho primeros. La campana es un vistazo, no un archivo:
              lo que no cabe aquí está entero un clic más allá, en «Ver todas».
            */}
            {grupos.slice(0, 8).map((g) => (
              <Fila key={g.clave} grupo={g} onAbrir={abrir} />
            ))}
          </div>

          <div className="border-hairline flex items-center gap-1 border-t px-2 py-1.5">
            <button
              type="button"
              onClick={() => {
                setAbierto(false)
                setViendoTodas(true)
              }}
              className="text-royal-600 hover:bg-royal-600/8 dark:text-royal-300 flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors"
            >
              <List className="size-4" />
              Ver todas
              {grupos.length > 8 ? (
                <span className="text-ink/40 font-normal">({grupos.length})</span>
              ) : null}
            </button>

            {sinLeer > 0 ? (
              <button
                type="button"
                onClick={() => marcarTodas.mutate()}
                disabled={marcarTodas.isPending}
                title="Marcar todas como leídas"
                aria-label="Marcar todas como leídas"
                className="text-ink/45 hover:bg-ink/6 hover:text-ink/80 rounded-md p-2 transition-colors disabled:opacity-60"
              >
                <CheckCheck className="size-4" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <TodasLasNotificaciones
        abierto={viendoTodas}
        onCerrar={() => setViendoTodas(false)}
      />
    </div>
  )
}
