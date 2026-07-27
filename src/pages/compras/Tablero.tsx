import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  AlertTriangle,
  CalendarClock,
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
import { useMediaQuery } from '@/lib/useMediaQuery'
import { cn } from '@/lib/cn'

/** La franja de color superior es lo único que distingue una columna de otra. */
const franjas: Record<DefinicionColumna['tono'], string> = {
  neutral: 'bg-ink/25',
  info: 'bg-info',
  royal: 'bg-royal-600',
  warning: 'bg-warning',
  success: 'bg-success',
  danger: 'bg-danger',
}

const tonoChip: Record<DefinicionColumna['tono'], 'neutral' | 'info' | 'royal' | 'warning' | 'success' | 'danger'> =
  {
    neutral: 'neutral',
    info: 'info',
    royal: 'royal',
    warning: 'warning',
    success: 'success',
    danger: 'danger',
  }

function fechaCorta(iso: string | null): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('es-VE', { day: '2-digit', month: 'short' }).format(
    new Date(iso),
  )
}

function TarjetaCompra({ tarjeta }: { tarjeta: Tarjeta }) {
  const navigate = useNavigate()
  const urgente = tarjeta.prioridad === 'URGENTE'

  return (
    <article
      onClick={() => void navigate(`/app/compras/${tarjeta.solicitud_id}`)}
      className={cn(
        'bg-surface rounded-card border-hairline group cursor-pointer border p-3.5',
        'hover:border-royal-600/40 hover:shadow-card transition-[border-color,box-shadow] duration-150',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-ink/45 font-mono text-2xs tracking-tight">
          {tarjeta.orden_numero ?? tarjeta.numero}
        </span>
        {urgente ? (
          <Chip tone="danger" icon={<Flame />}>
            Urgente
          </Chip>
        ) : tarjeta.prioridad === 'ALTA' ? (
          <Chip tone="warning">Alta</Chip>
        ) : null}
      </div>

      <h3 className="text-ink/90 group-hover:text-royal-700 dark:group-hover:text-royal-300 mt-1 line-clamp-2 text-base font-medium">
        {tarjeta.titulo}
      </h3>

      <p className="text-ink/50 mt-1 truncate text-xs">
        {tarjeta.solicitante ?? 'Sin solicitante'}
        {tarjeta.destino ? ` · ${tarjeta.destino}` : ''}
      </p>

      {/* Señal propia de la columna. Solo una por tarjeta: si cada tarjeta
          lleva cuatro insignias, ninguna se lee. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {tarjeta.columna === 'CONFIRMADA' ? (
          <Chip tone={tarjeta.cotizaciones > 0 ? 'info' : 'neutral'} icon={<FileText />}>
            {tarjeta.cotizaciones === 0
              ? 'Sin cotizaciones'
              : `${tarjeta.cotizaciones} cotización${tarjeta.cotizaciones === 1 ? '' : 'es'}`}
          </Chip>
        ) : null}

        {tarjeta.columna === 'APROBADA' && tarjeta.estado_orden === 'EN_TESORERIA' ? (
          <Chip tone="info">En tesorería</Chip>
        ) : null}

        {tarjeta.columna === 'APROBADA' && tarjeta.estado_orden === 'POR_INDICAR_PAGO' ? (
          <Chip tone="warning">Falta el método de pago</Chip>
        ) : null}

        {tarjeta.columna === 'PAGADA' && tarjeta.dias_sin_recibir !== null ? (
          <Chip
            tone={tarjeta.dias_sin_recibir > 15 ? 'danger' : tarjeta.dias_sin_recibir > 7 ? 'warning' : 'success'}
            icon={<Truck />}
          >
            {tarjeta.dias_sin_recibir === 0
              ? 'Pagada hoy'
              : `${tarjeta.dias_sin_recibir} día${tarjeta.dias_sin_recibir === 1 ? '' : 's'} sin recibir`}
          </Chip>
        ) : null}

        {tarjeta.columna === 'DESISTIO' ? (
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
        ) : null}

        {tarjeta.columna === 'PEDIDO' && tarjeta.estado_solicitud === 'BORRADOR' ? (
          <Chip tone="neutral">Borrador</Chip>
        ) : null}

        {tarjeta.requerida_para && ['PEDIDO', 'CONFIRMADA', 'GERENTE'].includes(tarjeta.columna) ? (
          <Chip tone="neutral" icon={<CalendarClock />}>
            {fechaCorta(tarjeta.requerida_para)}
          </Chip>
        ) : null}
      </div>

      {tarjeta.proveedor || tarjeta.total_usd ? (
        <div className="border-hairline mt-3 flex items-baseline justify-between gap-2 border-t pt-2.5">
          <span className="text-ink/60 truncate text-xs">{tarjeta.proveedor ?? '—'}</span>
          {tarjeta.total_usd ? (
            <span className="text-ink/90 tabular shrink-0 text-sm font-semibold">
              {dolares(tarjeta.total_usd)}
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

function ColumnaTablero({
  definicion,
  tarjetas,
  className,
}: {
  definicion: DefinicionColumna
  tarjetas: Tarjeta[]
  className?: string
}) {
  const totalUsd = tarjetas.reduce((suma, t) => suma + Number(t.total_usd ?? 0), 0)

  return (
    <section className={cn('flex min-h-0 flex-col', className)}>
      <div className="bg-surface rounded-card shadow-card overflow-hidden">
        <div className={cn('h-1', franjas[definicion.tono])} />
        <div className="px-3.5 py-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-ink/85 text-sm leading-tight font-semibold">
              {definicion.titulo}
            </h2>
            <Chip tone={tarjetas.length ? tonoChip[definicion.tono] : 'neutral'}>
              {tarjetas.length}
            </Chip>
          </div>
          <p className="text-ink/45 mt-0.5 truncate text-xs">
            {totalUsd > 0 ? dolares(totalUsd) : definicion.accion}
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-col gap-2.5 overflow-y-auto pb-2">
        {tarjetas.map((t) => (
          <TarjetaCompra key={t.solicitud_id} tarjeta={t} />
        ))}

        {tarjetas.length === 0 ? (
          <p className="border-hairline text-ink/35 rounded-card border border-dashed px-3 py-6 text-center text-xs">
            Nada aquí
          </p>
        ) : null}
      </div>
    </section>
  )
}

export function TableroCompras() {
  const { data, isPending, error } = useTablero()
  const esEscritorio = useMediaQuery('(min-width: 1024px)')
  const [columnaMovil, setColumnaMovil] = useState<Columna>('PEDIDO')

  const porColumna = useMemo(() => {
    const mapa = new Map<Columna, Tarjeta[]>(COLUMNAS.map((c) => [c.clave, []]))
    for (const t of data ?? []) {
      // Las recibidas ya no están en el tablero: la compra terminó. Se
      // consultan desde Recepciones cuando exista ese módulo.
      const lista = mapa.get(t.columna)
      if (lista) lista.push(t)
    }
    return mapa
  }, [data])

  const enRiesgo = (data ?? []).filter(
    (t) => t.columna === 'PAGADA' && (t.dias_sin_recibir ?? 0) > 7,
  )

  return (
    <>
      <PageHeader
        title="Compras"
        description="Cada tarjeta es una compra. Avanza de izquierda a derecha y no se salta pasos."
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

      {data && data.length === 0 ? (
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
      ) : null}

      {data && data.length > 0 ? (
        esEscritorio ? (
          // Siete columnas no caben a lo ancho sin apretarlas hasta lo
          // ilegible, así que el tablero desplaza en horizontal y cada columna
          // conserva un ancho cómodo.
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-4">
            {COLUMNAS.map((c) => (
              <ColumnaTablero
                key={c.clave}
                definicion={c}
                tarjetas={porColumna.get(c.clave) ?? []}
                className="max-h-[calc(100svh-15rem)] w-[268px] shrink-0"
              />
            ))}
          </div>
        ) : (
          <div>
            {/* En el teléfono el tablero se recorre por pasos, no deslizando:
                buscar la séptima columna a dedo es inservible en la obra. */}
            <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1">
              {COLUMNAS.map((c) => {
                const cantidad = porColumna.get(c.clave)?.length ?? 0
                const activa = c.clave === columnaMovil
                return (
                  <button
                    key={c.clave}
                    type="button"
                    onClick={() => setColumnaMovil(c.clave)}
                    className={cn(
                      'rounded-control shrink-0 px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                      activa
                        ? 'bg-royal-600 text-white'
                        : 'bg-surface text-ink/65 border-hairline border',
                    )}
                  >
                    {c.titulo}
                    <span className={cn('ml-1.5', activa ? 'text-white/70' : 'text-ink/40')}>
                      {cantidad}
                    </span>
                  </button>
                )
              })}
            </div>

            <ColumnaTablero
              definicion={COLUMNAS.find((c) => c.clave === columnaMovil)!}
              tarjetas={porColumna.get(columnaMovil) ?? []}
            />
          </div>
        )
      ) : null}
    </>
  )
}
