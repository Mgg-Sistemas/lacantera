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
import { useQueryClient } from '@tanstack/react-query'
import { rpc } from '@/lib/api/rpc'
import { empresaDelPapel, useEmpresa } from '@/lib/api/empresa'
import { textoDespachoAprobado, textoDespachoNoAprobado } from '@/lib/ficha/ventasWhatsapp'
import { ModalWhatsappCompra } from '@/pages/compras/ModalWhatsappCompra'
import { DetalleVentaModal } from './DetalleVentaModal'
import { AprobarDespachoModal } from './AprobarDespachoModal'
import { HistoricoVentas } from './HistoricoVentas'

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

/*
  DIEZ POR COLUMNA, CON SCROLL (la dueña, 10/11/2026: «que sea con un scroll,
  solo mostrar las primeras 10, las demás pasan a un histórico vista tipo lista
  buscable»). «+ n más» abre el histórico de esa columna.
*/
const TOPE = 10

/*
  LOS INDICADORES FILTRAN (la dueña, 10/11/2026: «que estas tarjetas sean
  interactivas, al darle click que muestre solo la tarjeta seleccionada»).
  Tocar uno deja en el tablero solo lo que cuenta; tocarlo otra vez lo quita.
*/
type Foco = 'cot' | 'aprobar' | 'despachada' | 'porcobrar' | 'vencidas'
const esVencida = (t: TarjetaVenta) => !!t.vencida && (t.etapa === 'despachada' || t.etapa === 'facturada')
const FOCOS: Record<Foco, { titulo: string; etapas: EtapaVenta[]; solo?: (t: TarjetaVenta) => boolean }> = {
  cot: { titulo: 'Cotizaciones abiertas', etapas: ['cot'] },
  aprobar: { titulo: 'Despachos por aprobar', etapas: ['aprobar'] },
  despachada: { titulo: 'Despachadas por cobrar', etapas: ['despachada'] },
  porcobrar: { titulo: 'Por cobrar', etapas: ['despachada', 'facturada'] },
  vencidas: { titulo: 'Vencidas', etapas: ['despachada', 'facturada'], solo: esVencida },
}

export function TableroVentas() {
  const [dias, setDias] = useState('30')
  const [busca, setBusca] = useState('')
  const [abierta, setAbierta] = useState<string | null>(null)
  const [etapaTel, setEtapaTel] = useState<EtapaVenta>('aprobar')
  const [historico, setHistorico] = useState<EtapaVenta | null>(null)
  const enTelefono = useMediaQuery('(max-width: 767px)')
  const { data, isPending, error } = useVentasTablero(Number(dias))
  const { data: permisos } = usePermisosVentas()
  const qc = useQueryClient()

  const filtradas = useMemo(() => (data ?? []).filter((t) => coincide(t, busca.trim())), [data, busca])
  const porEtapa = useMemo(() => {
    const m = new Map<EtapaVenta, TarjetaVenta[]>()
    COLUMNAS.forEach((c) => m.set(c.etapa, []))
    filtradas.forEach((t) => m.get(t.etapa)?.push(t))
    return m
  }, [filtradas])
  const [foco, setFoco] = useState<Foco | null>(null)
  const columnas = foco ? COLUMNAS.filter((c) => FOCOS[foco].etapas.includes(c.etapa)) : COLUMNAS
  const itemsDe = (etapa: EtapaVenta) => {
    const items = porEtapa.get(etapa) ?? []
    const solo = foco ? FOCOS[foco].solo : undefined
    return solo ? items.filter(solo) : items
  }
  const etapaVista = columnas.some((c) => c.etapa === etapaTel) ? etapaTel : (columnas[0]?.etapa ?? etapaTel)
  function enfocar(f: Foco) {
    const nuevo = foco === f ? null : f
    setFoco(nuevo)
    if (nuevo) setEtapaTel(FOCOS[nuevo].etapas[0])
  }
  const tarjeta = abierta ? (data ?? []).find((t) => t.clave === abierta) ?? null : null
  const [aprobando, setAprobando] = useState<TarjetaVenta | null>(null)
  const [ws, setWs] = useState<{ titulo: string; texto: string } | null>(null)
  const { data: datosEmpresa } = useEmpresa()
  const empresa = empresaDelPapel(datosEmpresa).razonSocial

  /** Aprobado: se busca la nota de entrega que nació para armar su WhatsApp. */
  async function alAprobar(sd: TarjetaVenta) {
    setAprobando(null)
    try {
      const fresco = await qc.fetchQuery({
        queryKey: ['ventas', 'tablero', Number(dias)],
        queryFn: () => rpc<TarjetaVenta[]>('ventas_tablero', { p_dias: Number(dias) }),
        staleTime: 0,
      })
      const ne = fresco.find((x) => x.tipo === 'NE' && x.cadena.sd === sd.numero)
      setWs({
        titulo: `Despacho aprobado · ${ne?.numero ?? sd.numero}`,
        texto: textoDespachoAprobado(ne ?? sd, empresa),
      })
    } catch {
      setWs({ titulo: `Despacho aprobado · ${sd.numero}`, texto: textoDespachoAprobado(sd, empresa) })
    }
  }

  const porCobrar = (data ?? [])
    .filter((t) => t.etapa === 'despachada' || t.etapa === 'facturada')
    .reduce((s, t) => s + Number(t.saldo_usd ?? 0), 0)
  const vencidas = (data ?? []).filter(esVencida).length
  const indicador = (f: Foco, valor: string, alerta?: boolean) => (
    <Indicador titulo={FOCOS[f].titulo} valor={valor} alerta={alerta} activo={foco === f} onClick={() => enfocar(f)} />
  )

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
          {indicador('cot', String(porEtapa.get('cot')?.length ?? 0))}
          {indicador('aprobar', String(porEtapa.get('aprobar')?.length ?? 0))}
          {indicador('despachada', String(porEtapa.get('despachada')?.length ?? 0))}
          {indicador('porcobrar', dolares(porCobrar))}
          {indicador('vencidas', String(vencidas), vencidas > 0)}
        </div>
      ) : null}

      {foco ? (
        <div className="bg-royal-600/8 border-royal-600/30 flex flex-wrap items-center gap-2 rounded-[10px] border px-3 py-2 text-sm">
          <span>
            Mostrando solo: <strong>{FOCOS[foco].titulo}</strong>
          </span>
          <button
            type="button"
            onClick={() => setFoco(null)}
            className="text-royal-700 dark:text-royal-300 ml-auto text-sm font-medium hover:underline"
          >
            ✕ Ver todo el tablero
          </button>
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
            {columnas.map((c) => (
              <button
                key={c.etapa}
                type="button"
                aria-pressed={etapaVista === c.etapa}
                onClick={() => setEtapaTel(c.etapa)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold',
                  etapaVista === c.etapa ? 'bg-royal-600 border-royal-600 text-white' : 'border-hairline bg-surface text-ink/70',
                )}
              >
                {c.titulo} · {itemsDe(c.etapa).length}
              </button>
            ))}
          </div>
          <Lista
            tarjetas={itemsDe(etapaVista)}
            tope={TOPE}
            onVerMas={() => setHistorico(etapaVista)}
            onAbrir={setAbierta}
          />
        </div>
      ) : (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
          {columnas.map((c) => {
            const items = itemsDe(c.etapa)
            return (
              <section
                key={c.etapa}
                className={cn(
                  'bg-ink/3 border-hairline flex shrink-0 flex-col rounded-[10px] border',
                  foco ? 'min-w-72 flex-1' : 'w-72',
                )}
                aria-label={c.titulo}
              >
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
                  tope={TOPE}
                  onVerMas={() => setHistorico(c.etapa)}
                  onAbrir={setAbierta}
                  rejilla={!!foco && columnas.length === 1}
                />
              </section>
            )
          })}
        </div>
      )}

      {historico ? (
        <HistoricoVentas
          titulo={`${COLUMNAS.find((c) => c.etapa === historico)?.titulo ?? ''}${foco ? ` · ${FOCOS[foco].titulo}` : ''}`}
          tarjetas={itemsDe(historico)}
          empresa={empresa}
          onAbrir={setAbierta}
          onWhatsapp={(titulo, texto) => setWs({ titulo, texto })}
          onCerrar={() => setHistorico(null)}
        />
      ) : null}

      {tarjeta ? (
        <DetalleVentaModal
          tarjeta={tarjeta}
          permisos={permisos}
          empresa={empresa}
          onCerrar={() => setAbierta(null)}
          onAprobar={(t) => {
            setAbierta(null)
            setAprobando(t)
          }}
          onWhatsapp={(titulo, texto) => setWs({ titulo, texto })}
        />
      ) : null}

      {aprobando ? (
        <AprobarDespachoModal
          tarjeta={aprobando}
          onCerrar={() => setAprobando(null)}
          onAprobado={() => void alAprobar(aprobando)}
          onNoAprobado={(motivo, noProcede) => {
            const sd = aprobando
            setAprobando(null)
            setWs({
              titulo: `Despacho no aprobado · ${sd.numero}`,
              texto: textoDespachoNoAprobado(sd, motivo, noProcede, empresa),
            })
          }}
        />
      ) : null}

      {ws ? <ModalWhatsappCompra titulo={ws.titulo} texto={ws.texto} onCerrar={() => setWs(null)} /> : null}
    </div>
  )
}

function Indicador({
  titulo,
  valor,
  alerta,
  activo,
  onClick,
}: {
  titulo: string
  valor: string
  alerta?: boolean
  activo: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      title={activo ? 'Ver todo el tablero' : `Ver solo: ${titulo.toLowerCase()}`}
      className={cn(
        'bg-surface rounded-[10px] border px-3 py-2 text-left transition-colors',
        'hover:border-royal-600/50 focus-visible:outline-royal-600 focus-visible:outline-2 focus-visible:outline-offset-2',
        activo ? 'border-royal-600 ring-royal-600 bg-royal-600/8 ring-1' : 'border-hairline',
      )}
    >
      <div className="text-ink/50 text-[11px] font-semibold tracking-wide uppercase">{titulo}</div>
      <div className={cn('font-titular text-lg font-bold tabular-nums', alerta && 'text-danger')}>{valor}</div>
    </button>
  )
}

function Lista({
  tarjetas,
  tope,
  onVerMas,
  onAbrir,
  rejilla,
}: {
  tarjetas: TarjetaVenta[]
  tope: number | null
  onVerMas: () => void
  onAbrir: (clave: string) => void
  /** Una sola columna a lo ancho: las tarjetas en rejilla. */
  rejilla?: boolean
}) {
  const visibles = tope ? tarjetas.slice(0, tope) : tarjetas
  const sobran = tarjetas.length - visibles.length
  return (
    <div
      className={cn(
        'gap-2 px-2 pb-2',
        rejilla ? 'grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'flex max-h-[70vh] flex-col overflow-y-auto',
      )}
    >
      {tarjetas.length === 0 ? (
        <div className="text-ink/40 border-ink/10 col-span-full rounded-[8px] border border-dashed px-3 py-4 text-center text-xs">
          Sin documentos en esta etapa
        </div>
      ) : (
        visibles.map((t) => <Tarjeta key={t.clave} t={t} onAbrir={onAbrir} />)
      )}
      {sobran > 0 ? (
        <button
          type="button"
          className="text-royal-700 dark:text-royal-300 col-span-full px-2 py-1 text-left text-xs font-medium hover:underline"
          onClick={onVerMas}
        >
          + {sobran} más · ver en el histórico →
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
