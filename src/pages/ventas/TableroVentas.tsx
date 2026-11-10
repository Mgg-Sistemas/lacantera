import { memo, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Segmento } from '@/components/ui/Segmento'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { cn } from '@/lib/cn'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { dolares } from '@/lib/formato'
import { relTime } from '@/lib/pedidos'
import { usePermisosVentas, useVentasTablero, type EtapaVenta, type TarjetaVenta } from '@/lib/api/ventasTablero'
import { COLUMNAS, chipsDe, coincide, montoDe, type Tono } from './ventasTablero'
import { DetalleVentaModal } from './DetalleVentaModal'

/*
  TABLERO DE VENTAS (la dueña, 10/11/2026: «así como se tiene compras, quiero
  cambiar el flujo de ventas y facturación, notas de entrega…»; aprobó la
  maqueta y pidió implementarla fase a fase).

  Una tarjeta por venta, en su columna, como el de Compras: cotización →
  despacho por aprobar → despachada → facturada → cobrada. Al tocarla se abre
  su detalle con los papeles encadenados y los botones de su etapa.

  En el teléfono no caben seis columnas: arriba se elige la etapa y abajo salen
  sus tarjetas, en una sola columna.
*/

const ACENTO: Record<Tono, string> = {
  royal: 'bg-royal-600',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-ink/40',
}

/** Cuántas tarjetas se pintan por columna antes de «ver más». */
const TOPE = 25

export function TableroVentas() {
  const [dias, setDias] = useState('30')
  const [busca, setBusca] = useState('')
  const [abierta, setAbierta] = useState<string | null>(null)
  const [etapaTel, setEtapaTel] = useState<EtapaVenta>('aprobar')
  const [completas, setCompletas] = useState<Set<EtapaVenta>>(new Set())
  const enTelefono = useMediaQuery('(max-width: 767px)')
  const { data, isPending, error } = useVentasTablero(Number(dias))
  const { data: permisos } = usePermisosVentas()

  const filtradas = useMemo(() => (data ?? []).filter((t) => coincide(t, busca.trim())), [data, busca])
  const porEtapa = useMemo(() => {
    const m = new Map<EtapaVenta, TarjetaVenta[]>()
    COLUMNAS.forEach((c) => m.set(c.etapa, []))
    filtradas.forEach((t) => m.get(t.etapa)?.push(t))
    return m
  }, [filtradas])
  const tarjeta = abierta ? (data ?? []).find((t) => t.clave === abierta) ?? null : null

  const porCobrar = (data ?? [])
    .filter((t) => t.etapa === 'despachada' || t.etapa === 'facturada')
    .reduce((s, t) => s + Number(t.saldo_usd ?? 0), 0)
  const vencidas = (data ?? []).filter((t) => (t.etapa === 'despachada' || t.etapa === 'facturada') && t.vencida).length

  const acciones = (
    <div className="flex flex-wrap gap-2">
      {permisos?.cotizar ? (
        <Link to="/app/ventas/cotizaciones?nueva=1">
          <Button variant="outline">+ Nueva cotización</Button>
        </Link>
      ) : null}
      {permisos?.despachar ? (
        <Link to="/app/facturacion/notas-entrega?pedir=1">
          <Button>🚚 Pedir despacho</Button>
        </Link>
      ) : null}
    </div>
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ventas"
        description="Cada venta en su etapa, de la cotización al cobro. Toca una tarjeta para ver sus papeles y lo que sigue."
        actions={acciones}
      />

      {permisos?.montos !== false ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Indicador titulo="Cotizaciones abiertas" valor={String(porEtapa.get('cot')?.length ?? 0)} />
          <Indicador titulo="Despachos por aprobar" valor={String(porEtapa.get('aprobar')?.length ?? 0)} />
          <Indicador titulo="Despachadas por cobrar" valor={String(porEtapa.get('despachada')?.length ?? 0)} />
          <Indicador titulo="Por cobrar" valor={dolares(porCobrar)} />
          <Indicador titulo="Vencidas" valor={String(vencidas)} alerta={vencidas > 0} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <Input
            label="Buscar"
            placeholder="Cliente, RIF, número, producto, placa…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div>
          <span className="text-ink/60 mb-1 block text-xs font-medium">Cobradas y anuladas de los últimos</span>
          <Segmento
            opciones={[
              { valor: '7', etiqueta: '7 días' },
              { valor: '30', etiqueta: '30 días' },
              { valor: '90', etiqueta: '90 días' },
            ]}
            valor={dias}
            onCambio={setDias}
          />
        </div>
        <Link to="/app/ventas/registros-de-pagos" className="text-royal-700 dark:text-royal-300 pb-2 text-sm font-medium hover:underline">
          Conciliación de pagos →
        </Link>
      </div>

      {isPending ? (
        <Cargando texto="Cargando el tablero…" />
      ) : error ? (
        <ErrorDeCarga error={error} />
      ) : enTelefono ? (
        <div className="space-y-3">
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {COLUMNAS.map((c) => (
              <button
                key={c.etapa}
                type="button"
                aria-pressed={etapaTel === c.etapa}
                onClick={() => setEtapaTel(c.etapa)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold',
                  etapaTel === c.etapa ? 'bg-royal-600 border-royal-600 text-white' : 'border-hairline bg-surface text-ink/70',
                )}
              >
                {c.titulo} · {porEtapa.get(c.etapa)?.length ?? 0}
              </button>
            ))}
          </div>
          <Lista
            tarjetas={porEtapa.get(etapaTel) ?? []}
            tope={completas.has(etapaTel) ? null : TOPE}
            onVerMas={() => setCompletas(new Set(completas).add(etapaTel))}
            onAbrir={setAbierta}
          />
        </div>
      ) : (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
          {COLUMNAS.map((c) => {
            const items = porEtapa.get(c.etapa) ?? []
            return (
              <section key={c.etapa} className="bg-ink/3 border-hairline flex w-72 shrink-0 flex-col rounded-[10px] border" aria-label={c.titulo}>
                <header className="px-3 pt-2.5 pb-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink/70 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
                      <span className={cn('size-2 rounded-full', ACENTO[c.tono])} aria-hidden="true" />
                      {c.titulo}
                    </span>
                    <span className="bg-ink/8 text-ink/65 rounded-full px-2 py-0.5 text-xs font-medium">{items.length}</span>
                  </div>
                  <p className="text-ink/45 mt-0.5 text-[11px]">{c.ayuda}</p>
                </header>
                <Lista
                  tarjetas={items}
                  tope={completas.has(c.etapa) ? null : TOPE}
                  onVerMas={() => setCompletas(new Set(completas).add(c.etapa))}
                  onAbrir={setAbierta}
                />
              </section>
            )
          })}
        </div>
      )}

      {tarjeta ? <DetalleVentaModal tarjeta={tarjeta} permisos={permisos} onCerrar={() => setAbierta(null)} /> : null}
    </div>
  )
}

function Indicador({ titulo, valor, alerta }: { titulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="border-hairline bg-surface rounded-[10px] border px-3 py-2">
      <div className="text-ink/50 text-[11px] font-semibold tracking-wide uppercase">{titulo}</div>
      <div className={cn('font-titular text-lg font-bold tabular-nums', alerta && 'text-danger')}>{valor}</div>
    </div>
  )
}

function Lista({
  tarjetas,
  tope,
  onVerMas,
  onAbrir,
}: {
  tarjetas: TarjetaVenta[]
  tope: number | null
  onVerMas: () => void
  onAbrir: (clave: string) => void
}) {
  const visibles = tope ? tarjetas.slice(0, tope) : tarjetas
  const sobran = tarjetas.length - visibles.length
  return (
    <div className="flex flex-col gap-2 px-2 pb-2">
      {tarjetas.length === 0 ? (
        <div className="text-ink/40 border-ink/10 rounded-[8px] border border-dashed px-3 py-4 text-center text-xs">
          Sin documentos en esta etapa
        </div>
      ) : (
        visibles.map((t) => <Tarjeta key={t.clave} t={t} onAbrir={onAbrir} />)
      )}
      {sobran > 0 ? (
        <button
          type="button"
          className="text-royal-700 dark:text-royal-300 px-2 py-1 text-left text-xs font-medium hover:underline"
          onClick={onVerMas}
        >
          + {sobran} más
        </button>
      ) : null}
    </div>
  )
}

const Tarjeta = memo(function Tarjeta({ t, onAbrir }: { t: TarjetaVenta; onAbrir: (clave: string) => void }) {
  const monto = montoDe(t)
  const cadena = [t.cadena.cot, t.cadena.sd, t.cadena.ns, t.cadena.ne, t.cadena.fac].filter(
    (x, i, a): x is string => !!x && x !== t.numero && a.indexOf(x) === i,
  )
  const vencida = t.vencida && (t.etapa === 'despachada' || t.etapa === 'facturada')
  return (
    <button
      type="button"
      onClick={() => onAbrir(t.clave)}
      className={cn(
        'bg-surface border-hairline hover:border-royal-600/50 grid gap-1 rounded-[9px] border px-3 py-2.5 text-left shadow-sm',
        'focus-visible:outline-royal-600 focus-visible:outline-2 focus-visible:outline-offset-2',
        vencida && 'border-danger',
      )}
    >
      <span className="font-mono text-xs font-semibold">{t.numero}</span>
      {cadena.length ? <span className="text-ink/45 font-mono text-[10.5px]">{cadena.join(' → ')}</span> : null}
      <span className="font-titular text-sm font-bold">{t.cliente ?? 'Sin cliente todavía'}</span>
      {t.resumen ? <span className="text-ink/60 line-clamp-2 text-xs">{t.resumen}</span> : null}
      {(() => {
        const chips = chipsDe(t)
        return chips.length ? (
          <span className="flex flex-wrap gap-1">
            {chips.map((c, i) => (
              <Chip key={i} tone={c.tono} title={c.titulo}>
                {c.texto}
              </Chip>
            ))}
          </span>
        ) : null
      })()}
      <span className="mt-0.5 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[13px] font-semibold tabular-nums">
          {monto ? monto.texto : ''}
          {monto?.etiqueta ? <span className="text-ink/50 ml-1 font-sans text-[11px] font-medium">{monto.etiqueta}</span> : null}
        </span>
        <span className="text-ink/45 text-[11px]">{relTime(t.at)}</span>
      </span>
    </button>
  )
})
