import { Link } from 'react-router'
import {
  AlertTriangle,
  Banknote,
  Boxes,
  ClipboardCheck,
  Hammer,
  HandCoins,
  Info,
  Landmark,
  PackageSearch,
  Truck,
} from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { useResumenPanel } from '@/lib/api/tesoreria'
import { useTablero } from '@/lib/api/compras'
import { bolivares, dolares, dolaresRedondos, enteros, hace } from '@/lib/formato'

interface Aviso {
  tono: 'danger' | 'warning' | 'info'
  titulo: string
  detalle: string
  ruta: string
}

/**
 * Lo que hay que atender hoy.
 *
 * No es una lista escrita a mano: cada aviso nace de una condición del sistema
 * y desaparece cuando esa condición deja de cumplirse. Un tablero de avisos
 * que hay que apagar a mano se llena de cosas resueltas y deja de leerse.
 */
function avisosDe(r: ReturnType<typeof useResumenPanel>['data']): Aviso[] {
  if (!r) return []
  const avisos: Aviso[] = []

  if (!r.tasa_de_hoy) {
    avisos.push({
      tono: 'danger',
      titulo: 'No hay tasa del BCV de hoy',
      detalle:
        'Sin ella no se puede cotizar, aprobar ni pagar: todo documento valorado congela la tasa del día.',
      ruta: '/app/tasas',
    })
  }

  if (r.compras_atrasadas > 0) {
    avisos.push({
      tono: 'danger',
      titulo: `${r.compras_atrasadas} compra${r.compras_atrasadas === 1 ? '' : 's'} pagada${r.compras_atrasadas === 1 ? '' : 's'} sin recibir`,
      detalle: `Más de una semana esperando material. Son ${dolares(r.pagado_sin_recibir_usd)} que ya salieron de la empresa.`,
      ruta: '/app/compras',
    })
  }

  if (r.pago_mas_viejo_dias > 3) {
    avisos.push({
      tono: 'warning',
      titulo: `Un pago lleva ${r.pago_mas_viejo_dias} días autorizado sin salir`,
      detalle:
        'El proveedor no reserva el material hasta ver el pago, y la cotización tiene fecha de vencimiento.',
      ruta: '/app/tesoreria/pagos',
    })
  }

  if (r.compras_por_aprobar > 0) {
    avisos.push({
      tono: 'warning',
      titulo: `${r.compras_por_aprobar} compra${r.compras_por_aprobar === 1 ? '' : 's'} esperando al gerente`,
      detalle: 'Hasta que se apruebe no hay orden, y sin orden el proveedor no despacha.',
      ruta: '/app/compras',
    })
  }

  if (r.articulos_bajo_minimo > 0) {
    avisos.push({
      tono: 'warning',
      titulo: `${r.articulos_bajo_minimo} artículo${r.articulos_bajo_minimo === 1 ? '' : 's'} bajo el mínimo`,
      detalle: 'Reponer antes de que pare una máquina cuesta menos que pararla.',
      ruta: '/app/inventario/existencias',
    })
  }

  if (r.cuentas_sin_abrir > 0) {
    avisos.push({
      tono: 'info',
      titulo: `${r.cuentas_sin_abrir} cuenta${r.cuentas_sin_abrir === 1 ? '' : 's'} sin saldo de apertura`,
      detalle:
        'Mientras no se registre lo que había, esa cuenta figura en cero y no deja pagar desde ella.',
      ruta: '/app/tesoreria/cuentas',
    })
  }

  return avisos
}

const iconos = { danger: AlertTriangle, warning: AlertTriangle, info: Info } as const

export function Dashboard() {
  const { data: r, isPending, error } = useResumenPanel()
  const { data: tarjetas } = useTablero()

  const hoy = new Date().toLocaleDateString('es-VE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const avisos = avisosDe(r)

  // Lo que espera decisión del gerente, lo más viejo arriba: quien aprueba
  // necesita saber qué lleva más tiempo detenido, no qué llegó de último.
  const porAprobar = (tarjetas ?? [])
    .filter((t) => t.columna === 'GERENTE')
    .sort((a, b) => a.creada_en.localeCompare(b.creada_en))

  return (
    <>
      <PageHeader title="Panel" description={`Operación de ${hoy}`} />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {r ? (
        <>
          {/* ---------- Indicadores ---------- */}
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="En cuentas, en divisas"
              value={dolaresRedondos(r.disponible_usd)}
              icon={<Landmark />}
              tone="royal"
              deltaLabel={`${bolivares(r.disponible_ves)} en bolívares`}
            />
            <StatCard
              label="Por pagar a proveedores"
              value={dolaresRedondos(r.por_pagar_usd)}
              icon={<HandCoins />}
              tone={r.pago_mas_viejo_dias > 7 ? 'warning' : 'info'}
              deltaLabel={
                r.por_pagar_n === 0
                  ? 'Nada pendiente'
                  : `${r.por_pagar_n} pago${r.por_pagar_n === 1 ? '' : 's'} autorizado${r.por_pagar_n === 1 ? '' : 's'}`
              }
            />
            <StatCard
              label="Pagado sin recibir"
              value={dolaresRedondos(r.pagado_sin_recibir_usd)}
              icon={<Truck />}
              tone={r.compras_atrasadas > 0 ? 'warning' : 'success'}
              deltaLabel={
                r.compras_pagadas_sin_recibir === 0
                  ? 'Todo lo pagado llegó'
                  : `${r.compras_pagadas_sin_recibir} orden${r.compras_pagadas_sin_recibir === 1 ? '' : 'es'} en camino`
              }
            />
            <StatCard
              label="Valor del inventario"
              value={dolaresRedondos(r.inventario_usd)}
              icon={<Boxes />}
              tone="info"
              deltaLabel={
                r.articulos_bajo_minimo === 0
                  ? 'Ningún artículo bajo mínimo'
                  : `${r.articulos_bajo_minimo} bajo el mínimo`
              }
            />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            {/* ---------- Avisos ---------- */}
            <Card className="lg:col-span-2">
              <CardHeader
                title="Requiere atención"
                subtitle={
                  avisos.length === 0
                    ? 'Nada detenido ahora mismo'
                    : `${avisos.length} asunto${avisos.length === 1 ? '' : 's'} abierto${avisos.length === 1 ? '' : 's'}`
                }
              />

              {avisos.length === 0 ? (
                <p className="text-ink/50 border-hairline mt-4 rounded-[6px] border border-dashed p-6 text-center text-sm">
                  Ninguna compra atrasada, ningún pago esperando y ningún artículo bajo el
                  mínimo.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {avisos.map((a) => {
                    const Icono = iconos[a.tono]
                    return (
                      <li key={a.titulo}>
                        <Link
                          to={a.ruta}
                          className="border-hairline hover:border-royal-300 flex gap-3 rounded-[6px] border p-3 transition-colors"
                        >
                          <Icono
                            className={`mt-0.5 size-[18px] shrink-0 ${
                              a.tono === 'danger'
                                ? 'text-danger'
                                : a.tono === 'warning'
                                  ? 'text-warning'
                                  : 'text-info'
                            }`}
                          />
                          <div className="min-w-0">
                            <p className="text-ink/85 text-sm font-medium">{a.titulo}</p>
                            <p className="text-ink/55 mt-0.5 text-xs leading-relaxed">
                              {a.detalle}
                            </p>
                          </div>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>

            {/* ---------- Compras, por etapa ---------- */}
            <Card>
              <CardHeader title="Compras en curso" subtitle="Dónde está detenida cada una" />

              <ul className="mt-4 space-y-2.5">
                {[
                  ['Pedidos por confirmar', r.compras_pedido],
                  ['Buscando precios', r.compras_cotizando],
                  ['Esperando al gerente', r.compras_por_aprobar],
                  ['Por indicar el pago', r.compras_aprobadas],
                  ['Pagadas, por recibir', r.compras_pagadas_sin_recibir],
                ].map(([etiqueta, n]) => (
                  <li key={etiqueta as string} className="flex items-baseline justify-between gap-3">
                    <span className="text-ink/70 text-sm">{etiqueta}</span>
                    <span
                      className={`tabular text-sm font-semibold ${
                        Number(n) > 0 ? 'text-ink/90' : 'text-ink/30'
                      }`}
                    >
                      {enteros(Number(n))}
                    </span>
                  </li>
                ))}
              </ul>

              <Link to="/app/compras" className="mt-4 block">
                <Button variant="soft" size="sm" block>
                  Ver el tablero
                </Button>
              </Link>
            </Card>
          </div>

          {/* ---------- Aprobaciones ---------- */}
          {porAprobar.length > 0 ? (
            <div className="mt-5">
              <Card>
                <CardHeader
                  title="Esperando aprobación del gerente"
                  subtitle="Lo que lleva más tiempo detenido, primero"
                />

                <ul className="mt-4 grid gap-3 md:grid-cols-2">
                  {porAprobar.map((t) => (
                    <li key={t.solicitud_id}>
                      <Link
                        to={`/app/compras/${t.solicitud_id}`}
                        className="border-hairline hover:border-royal-300 flex items-start gap-3 rounded-[6px] border p-4 transition-colors"
                      >
                        <ClipboardCheck className="text-ink/35 mt-0.5 size-[18px] shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-ink/45 font-mono text-xs">{t.numero}</span>
                            {t.prioridad === 'URGENTE' ? <Chip tone="danger">Urgente</Chip> : null}
                          </div>
                          <p className="text-ink/85 mt-1 text-sm font-medium">{t.titulo}</p>
                          <p className="text-ink/45 mt-1 text-xs">
                            {t.solicitante ?? 'Sin solicitante'} · {t.proveedor ?? 'sin proveedor'}{' '}
                            · {hace(t.creada_en)}
                          </p>
                        </div>
                        <span className="text-ink/90 tabular shrink-0 text-sm font-semibold">
                          {t.total_usd ? dolares(t.total_usd) : '—'}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          ) : null}

          {/* ---------- Lo que todavía no existe ----------
              Antes esta zona mostraba producción y despachos inventados. Un
              número falso al lado de los verdaderos es peor que un hueco: nadie
              sabe cuáles creer. */}
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Card>
              <div className="flex items-start gap-3">
                <Hammer className="text-ink/25 mt-0.5 size-5 shrink-0" />
                <div>
                  <h2 className="text-ink/70 text-base font-medium">Producción y explotación</h2>
                  <p className="text-ink/45 mt-1 text-sm">
                    Todavía no se registra. Cuando el módulo esté, aquí van las toneladas del
                    día y de la semana.
                  </p>
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-start gap-3">
                <PackageSearch className="text-ink/25 mt-0.5 size-5 shrink-0" />
                <div>
                  <h2 className="text-ink/70 text-base font-medium">Ventas y despachos</h2>
                  <p className="text-ink/45 mt-1 text-sm">
                    Todavía no se registran. Con ellos aparecerán aquí las guías de la romana y
                    lo que está por cobrar.
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <p className="text-ink/35 mt-5 flex items-center gap-1.5 text-xs">
            <Banknote className="size-3.5" />
            Todas las cifras salen de lo registrado en el sistema. No hay ningún número de
            ejemplo en esta pantalla.
          </p>
        </>
      ) : null}
    </>
  )
}
