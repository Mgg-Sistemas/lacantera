import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  AlertTriangle,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  FileText,
  Flame,
  Plus,
  Truck,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { COLUMNAS, useTablero } from '@/lib/api/compras'
import type { Columna, DefinicionColumna, Tarjeta } from '@/lib/api/compras'
import { dolares } from '@/lib/formato'
import { cn } from '@/lib/cn'

type Tono = DefinicionColumna['tono']

/** La franja de color es lo único que distingue una etapa de otra. */
const franjas: Record<Tono, string> = {
  neutral: 'bg-ink/25',
  info: 'bg-info',
  royal: 'bg-royal-600',
  warning: 'bg-warning',
  success: 'bg-success',
  danger: 'bg-danger',
}

function fechaCorta(iso: string | null): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('es-VE', { day: '2-digit', month: 'short' }).format(
    new Date(iso),
  )
}

/**
 * La señal propia de la etapa. Una sola por tarjeta: si cada fila lleva cuatro
 * insignias, no se lee ninguna.
 */
function SeñalDeEtapa({ tarjeta }: { tarjeta: Tarjeta }) {
  if (tarjeta.columna === 'CONFIRMADA') {
    return (
      <Chip tone={tarjeta.cotizaciones > 0 ? 'info' : 'neutral'} icon={<FileText />}>
        {tarjeta.cotizaciones === 0
          ? 'Sin cotizaciones'
          : `${tarjeta.cotizaciones} cotización${tarjeta.cotizaciones === 1 ? '' : 'es'}`}
      </Chip>
    )
  }

  if (tarjeta.columna === 'APROBADA') {
    return tarjeta.estado_orden === 'EN_TESORERIA' ? (
      <Chip tone="info">En tesorería</Chip>
    ) : (
      <Chip tone="warning">Falta el método de pago</Chip>
    )
  }

  if (tarjeta.columna === 'PAGADA' && tarjeta.dias_sin_recibir !== null) {
    const dias = tarjeta.dias_sin_recibir
    return (
      <Chip tone={dias > 15 ? 'danger' : dias > 7 ? 'warning' : 'success'} icon={<Truck />}>
        {dias === 0 ? 'Pagada hoy' : `${dias} día${dias === 1 ? '' : 's'} sin recibir`}
      </Chip>
    )
  }

  if (tarjeta.columna === 'DESISTIO') {
    return (
      <Chip
        tone={tarjeta.desistio_resolucion === 'PENDIENTE' ? 'danger' : 'neutral'}
        icon={<AlertTriangle />}
      >
        {tarjeta.desistio_resolucion === 'PENDIENTE'
          ? 'Dinero sin resolver'
          : tarjeta.desistio_resolucion === 'REEMBOLSADO'
            ? 'Reembolsado'
            : tarjeta.desistio_resolucion === 'SALDO_FAVOR'
              ? 'Queda a favor'
              : 'Dado por perdido'}
      </Chip>
    )
  }

  if (tarjeta.estado_solicitud === 'BORRADOR') return <Chip tone="neutral">Borrador</Chip>

  if (tarjeta.requerida_para) {
    return (
      <Chip tone="neutral" icon={<CalendarClock />}>
        Para el {fechaCorta(tarjeta.requerida_para)}
      </Chip>
    )
  }

  return null
}

/**
 * Tarjeta a lo ancho.
 *
 * La compra se lee de izquierda a derecha en una sola línea: qué es, en qué
 * anda y cuánto cuesta. En columnas estrechas el título se partía en dos y el
 * proveedor no cabía; aquí caben los tres datos que se miran de verdad.
 */
function TarjetaCompra({ tarjeta }: { tarjeta: Tarjeta }) {
  const navigate = useNavigate()

  return (
    <article
      onClick={() => void navigate(`/app/compras/${tarjeta.solicitud_id}`)}
      className={cn(
        'bg-surface rounded-card border-hairline group flex cursor-pointer flex-col gap-3 border p-3.5',
        'hover:border-royal-600/40 hover:shadow-card transition-[border-color,box-shadow] duration-150',
        'sm:flex-row sm:items-center sm:gap-4',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink/45 font-mono text-2xs tracking-tight">
            {tarjeta.orden_numero ?? tarjeta.numero}
          </span>
          {tarjeta.prioridad === 'URGENTE' ? (
            <Chip tone="danger" icon={<Flame />}>
              Urgente
            </Chip>
          ) : tarjeta.prioridad === 'ALTA' ? (
            <Chip tone="warning">Alta</Chip>
          ) : null}
        </div>

        <h3 className="text-ink/90 group-hover:text-royal-700 dark:group-hover:text-royal-300 mt-0.5 truncate text-base font-medium">
          {tarjeta.titulo}
        </h3>
        <p className="text-ink/50 truncate text-xs">
          {tarjeta.solicitante ?? 'Sin solicitante'}
          {tarjeta.destino ? ` · ${tarjeta.destino}` : ''}
        </p>
      </div>

      <div className="shrink-0 sm:w-52">
        <SeñalDeEtapa tarjeta={tarjeta} />
      </div>

      {/* Hasta que hay cotización no existen ni proveedor ni monto. Un guion
          en su sitio no informa de nada; mejor que la fila no lo ocupe. */}
      {tarjeta.proveedor || tarjeta.total_usd ? (
        <div className="border-hairline flex shrink-0 items-baseline justify-between gap-3 border-t pt-2.5 sm:w-56 sm:flex-col sm:items-end sm:justify-center sm:border-t-0 sm:pt-0">
          {tarjeta.proveedor ? (
            <span className="text-ink/55 truncate text-xs">{tarjeta.proveedor}</span>
          ) : null}
          {tarjeta.total_usd ? (
            <span className="text-ink/90 tabular text-base font-semibold">
              {dolares(tarjeta.total_usd)}
            </span>
          ) : null}
        </div>
      ) : null}

      <ChevronRight className="text-ink/25 group-hover:text-royal-600 hidden size-4 shrink-0 sm:block" />
    </article>
  )
}

function Etapa({
  definicion,
  tarjetas,
}: {
  definicion: DefinicionColumna
  tarjetas: Tarjeta[]
}) {
  const totalUsd = tarjetas.reduce((suma, t) => suma + Number(t.total_usd ?? 0), 0)

  return (
    <section>
      <header className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={cn('h-4 w-1 rounded-full', franjas[definicion.tono])} />
        <h2 className="text-ink/85 text-sm font-semibold">{definicion.titulo}</h2>
        <span className="text-ink/45 text-sm">{tarjetas.length}</span>
        {totalUsd > 0 ? (
          <span className="text-ink/45 tabular text-xs">{dolares(totalUsd)}</span>
        ) : null}
        <span className="text-ink/35 ml-auto text-xs">{definicion.accion}</span>
      </header>

      <div className="space-y-2">
        {tarjetas.map((t) => (
          <TarjetaCompra key={t.solicitud_id} tarjeta={t} />
        ))}
      </div>
    </section>
  )
}

export function TableroCompras() {
  const { data, isPending, error } = useTablero()

  const porColumna = useMemo(() => {
    const mapa = new Map<Columna, Tarjeta[]>(COLUMNAS.map((c) => [c.clave, []]))
    for (const t of data ?? []) {
      // Las recibidas salen del tablero: la compra terminó.
      mapa.get(t.columna)?.push(t)
    }
    return mapa
  }, [data])

  const conTrabajo = COLUMNAS.filter((c) => (porColumna.get(c.clave)?.length ?? 0) > 0)

  const enRiesgo = (data ?? []).filter(
    (t) => t.columna === 'PAGADA' && (t.dias_sin_recibir ?? 0) > 7,
  )

  return (
    <>
      <PageHeader
        title="Compras"
        description="Cada tarjeta es una compra. Avanza de arriba abajo y no se salta pasos."
        actions={
          <Link to="/app/compras/nuevo">
            <Button icon={<Plus />}>Nuevo pedido</Button>
          </Link>
        }
      />

      {enRiesgo.length > 0 ? (
        <div className="border-warning/30 bg-warning-soft mb-4 flex items-start gap-2.5 rounded-[6px] border p-3.5">
          <AlertTriangle className="text-warning mt-px size-[18px] shrink-0" />
          <p className="text-ink/80 text-sm">
            <strong className="font-semibold">
              {enRiesgo.length} compra{enRiesgo.length === 1 ? '' : 's'} pagada
              {enRiesgo.length === 1 ? '' : 's'} sin recibir
            </strong>{' '}
            desde hace más de una semana, por{' '}
            {dolares(enRiesgo.reduce((s, t) => s + Number(t.total_usd ?? 0), 0))}. Ese dinero
            ya salió de la empresa.
          </p>
        </div>
      ) : null}

      {isPending ? <Cargando texto="Cargando el tablero…" /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data ? (
        <>
          {/* Resumen de las siete etapas. Está siempre completo, también con
              las vacías: quien mira el tablero tiene que ver el recorrido
              entero, no solo el trozo donde hoy hay trabajo. */}
          <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {COLUMNAS.map((c) => {
              const cantidad = porColumna.get(c.clave)?.length ?? 0
              return (
                <div
                  key={c.clave}
                  className={cn(
                    'bg-surface rounded-card border-hairline flex shrink-0 items-center gap-2 border px-3 py-2',
                    cantidad === 0 && 'opacity-55',
                  )}
                >
                  <span className={cn('h-3.5 w-1 rounded-full', franjas[c.tono])} />
                  <span className="text-ink/70 text-xs whitespace-nowrap">{c.titulo}</span>
                  <span
                    className={cn(
                      'tabular text-sm font-semibold',
                      cantidad === 0 ? 'text-ink/30' : 'text-ink/90',
                    )}
                  >
                    {cantidad}
                  </span>
                </div>
              )
            })}
          </div>

          {conTrabajo.length === 0 ? (
            <Vacio
              icono={<ClipboardList />}
              titulo="Todavía no hay compras"
              descripcion="Un pedido arranca cuando alguien necesita algo: un repuesto, combustible, un servicio. Créalo y el tablero se llena solo."
              accion={
                <Link to="/app/compras/nuevo">
                  <Button icon={<Plus />}>Crear el primer pedido</Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-6">
              {conTrabajo.map((c) => (
                <Etapa
                  key={c.clave}
                  definicion={c}
                  tarjetas={porColumna.get(c.clave) ?? []}
                />
              ))}
            </div>
          )}
        </>
      ) : null}
    </>
  )
}
