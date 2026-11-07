import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Monitor, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { useOrdenesPorRecibir, useCompra, useSoyAprobador, useTablero } from '@/lib/api/compras'
import type { Orden, Tarjeta } from '@/lib/api/compras'
import { useMisRoles, usePerfiles } from '@/lib/api/catalogo'
import { useMiPerfil } from '@/lib/api/usuarios'
import { useEmpresa } from '@/lib/api/empresa'
import {
  renglonesComoSePidieron,
  textoRecepcion,
  textoSolicitudPedido,
} from '@/lib/ficha/comprasWhatsapp'
import { estadoDeLaCompra } from '@/pages/compras/etiquetasDeEstado'
import { dinero, hace } from '@/lib/formato'
import { cn } from '@/lib/cn'
import { ModalRecepcion } from './ModalRecepcion'
import { ModalRevisionAlmacen } from './ModalRevisionAlmacen'
import { ModalWhatsappCompra } from './ModalWhatsappCompra'

/*
  COMPRAS EN EL TELÉFONO (como las «pantallas de teléfono» de MGG).

  Angélica, 06/11/2026: «las pantallas de tlf, TODO». En MGG el almacenista
  revisa los pedidos y recibe las órdenes desde el teléfono, con botones grandes
  por tarea y el WhatsApp de cada paso a un toque. Aquí lo mismo, para el flujo
  de La Cantera: revisar en el almacén general, recibir, y ver lo que espera
  aprobación o pago. Lo que pide más pantalla (cotizar, aprobar con el pago) se
  abre en la ficha de la compra, que también se adapta al teléfono.
*/

type Vista = 'inicio' | 'revisar' | 'recibir' | 'aprobar' | 'pagar' | 'urgentes' | 'finalizadas'

const ACTIVAS = ['REVISION', 'PEDIDO', 'CONFIRMADA', 'GERENTE', 'APROBADA', 'CREDITO', 'PAGADA', 'RECIBIDA']

const TREINTA_DIAS = 30 * 86_400_000

export function ComprasTelefono() {
  const tablero = useTablero()
  const porRecibir = useOrdenesPorRecibir()
  const { puede, roles } = useMisRoles()
  const { data: soyAprobador } = useSoyAprobador()
  const { data: yo } = useMiPerfil()
  const { data: empresa } = useEmpresa()

  const [vista, setVista] = useState<Vista>('inicio')
  const [busca, setBusca] = useState('')
  const [revisarId, setRevisarId] = useState<number | null>(null)
  const [pedidoId, setPedidoId] = useState<number | null>(null)
  const [recibiendo, setRecibiendo] = useState<Orden | null>(null)
  const [mensaje, setMensaje] = useState<{ titulo: string; texto: string } | null>(null)

  const tarjetas = useMemo(() => tablero.data ?? [], [tablero.data])
  const de = (...cols: string[]) => tarjetas.filter((t) => cols.includes(t.columna))

  const listas: Record<Exclude<Vista, 'inicio' | 'recibir'>, Tarjeta[]> = {
    revisar: de('REVISION'),
    aprobar: de('GERENTE'),
    pagar: de('APROBADA', 'CREDITO'),
    urgentes: tarjetas.filter((t) => t.prioridad === 'URGENTE' && ACTIVAS.includes(t.columna)),
    finalizadas: de('FINALIZADA').filter(
      (t) => Date.now() - new Date(t.creada_en).getTime() < TREINTA_DIAS,
    ),
  }
  const ordenes = porRecibir.data ?? []

  const esAlmacen = puede('ALMACEN')
  const esCompras = puede('COMPRAS')

  const mosaicos: { vista: Vista; icono: string; titulo: string; pie: string; n: number; ver: boolean; alerta?: boolean }[] = [
    { vista: 'revisar', icono: '🏬', titulo: 'Por revisar', pie: 'El almacén general dice qué tiene', n: listas.revisar.length, ver: esAlmacen || esCompras, alerta: listas.revisar.length > 0 },
    { vista: 'recibir', icono: '📥', titulo: 'Por recibir', pie: 'Lo que llega al almacén general', n: ordenes.length, ver: esAlmacen || esCompras },
    { vista: 'aprobar', icono: '⏳', titulo: 'Por aprobar', pie: soyAprobador ? 'Le toca a usted' : 'Esperan aprobación', n: listas.aprobar.length, ver: true, alerta: soyAprobador === true && listas.aprobar.length > 0 },
    { vista: 'pagar', icono: '💰', titulo: 'Por pagar', pie: 'Aprobadas y cuentas abiertas', n: listas.pagar.length, ver: esCompras || soyAprobador === true || puede('GERENTE_GENERAL') },
    { vista: 'urgentes', icono: '🚨', titulo: 'Urgentes', pie: 'En curso', n: listas.urgentes.length, ver: true, alerta: listas.urgentes.length > 0 },
    { vista: 'finalizadas', icono: '✅', titulo: 'Finalizadas', pie: 'Últimos 30 días', n: listas.finalizadas.length, ver: true },
  ]

  const filtra = <T,>(lista: T[], texto: (x: T) => string) => {
    const q = busca.trim().toUpperCase()
    return q ? lista.filter((x) => texto(x).toUpperCase().includes(q)) : lista
  }

  const titulo = mosaicos.find((m) => m.vista === vista)

  return (
    <div className="mx-auto max-w-lg pb-10">
      {/* Cabecera */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-ink/90 text-2xl font-semibold">
            {vista === 'inicio' ? '🛒 Compras' : `${titulo?.icono} ${titulo?.titulo}`}
          </h1>
          <p className="text-ink/55 mt-0.5 text-sm">
            {yo?.nombre ?? ''}
            {roles.length ? ` · ${roles.filter((r) => r !== 'BASICO').slice(0, 2).join(', ')}` : ''}
          </p>
        </div>
        {vista === 'inicio' ? (
          <Link to="/app/compras">
            <Button variant="outline" icon={<Monitor />}>
              Tablero
            </Button>
          </Link>
        ) : (
          <Button
            variant="outline"
            icon={<ArrowLeft />}
            onClick={() => {
              setVista('inicio')
              setBusca('')
            }}
          >
            Volver
          </Button>
        )}
      </div>

      {tablero.isPending ? <Cargando texto="Cargando las compras…" /> : null}
      {tablero.error ? <ErrorDeCarga error={tablero.error} /> : null}

      {vista === 'inicio' ? (
        <>
          <Link to="/app/compras/nuevo" className="mb-3 block">
            <span className="bg-royal-600 hover:bg-royal-700 flex items-center justify-center gap-2 rounded-[10px] px-4 py-4 text-lg font-semibold text-white">
              ➕ Nuevo pedido
            </span>
          </Link>

          <div className="grid grid-cols-2 gap-3">
            {mosaicos
              .filter((m) => m.ver)
              .map((m) => (
                <button
                  key={m.vista}
                  type="button"
                  onClick={() => setVista(m.vista)}
                  className={cn(
                    'border-hairline bg-surface hover:bg-ink/4 flex min-h-[118px] flex-col items-start rounded-[10px] border p-3.5 text-left transition-colors',
                    m.alerta && 'border-warning/50 bg-warning-soft',
                  )}
                >
                  <span className="text-2xl leading-none">{m.icono}</span>
                  <span className="text-ink/90 mt-2 text-base font-semibold">{m.titulo}</span>
                  <span className="tabular text-ink/90 text-2xl font-semibold">{m.n}</span>
                  <span className="text-ink/55 mt-auto text-xs leading-snug">{m.pie}</span>
                </button>
              ))}
          </div>
        </>
      ) : (
        <Input
          label="Buscar"
          ocultarEtiqueta
          icon={<Search />}
          placeholder="Número, título o proveedor"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="mb-3"
        />
      )}

      {/* Por recibir: órdenes, no tarjetas */}
      {vista === 'recibir' ? (
        <div className="space-y-3">
          {porRecibir.isPending ? <Cargando /> : null}
          {porRecibir.error ? <ErrorDeCarga error={porRecibir.error} /> : null}
          {porRecibir.data && ordenes.length === 0 ? (
            <p className="text-ink/55 py-8 text-center text-sm">✅ No hay nada por recibir.</p>
          ) : null}
          {filtra(ordenes, (o) => `${o.numero} ${o.proveedor?.nombre ?? ''} ${o.solicitud?.titulo ?? ''}`).map(
            (o) => (
              <div key={o.id} className="border-hairline bg-surface rounded-[10px] border p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="tabular text-ink/90 font-semibold">{o.numero}</p>
                    <p className="text-ink/75 text-sm">{o.proveedor?.nombre ?? 'Sin proveedor'}</p>
                    {o.solicitud?.titulo ? (
                      <p className="text-ink/55 text-xs">{o.solicitud.titulo}</p>
                    ) : null}
                  </div>
                  {o.renglones.some((r) => Number(r.cantidad_recibida) > 0) ? (
                    <Chip tone="warning">Llegó una parte</Chip>
                  ) : null}
                </div>
                <ul className="text-ink/70 mt-2 space-y-0.5 text-sm">
                  {o.renglones
                    .slice()
                    .sort((a, b) => a.linea - b.linea)
                    .map((r) => {
                      const falta = Number(r.cantidad) - Number(r.cantidad_recibida)
                      return (
                        <li key={r.id} className="flex justify-between gap-2">
                          <span className="min-w-0 truncate">{r.descripcion}</span>
                          <span className="tabular text-ink/55 shrink-0 text-xs">
                            {falta > 0.0001 ? `faltan ${falta} ${r.unidad}` : '✅'}
                          </span>
                        </li>
                      )
                    })}
                </ul>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {esAlmacen ? (
                    <Button block size="lg" onClick={() => setRecibiendo(o)}>
                      📥 Recibir
                    </Button>
                  ) : null}
                  {o.solicitud?.id ? (
                    <Link to={`/app/compras/${o.solicitud.id}`} className={esAlmacen ? '' : 'col-span-2'}>
                      <Button block size="lg" variant="outline">
                        Ver la compra
                      </Button>
                    </Link>
                  ) : null}
                </div>
              </div>
            ),
          )}
        </div>
      ) : null}

      {/* Las demás vistas: tarjetas del tablero */}
      {vista !== 'inicio' && vista !== 'recibir' ? (
        <div className="space-y-3">
          {filtra(listas[vista], (t) => `${t.numero} ${t.titulo} ${t.proveedor ?? ''} ${t.solicitante ?? ''}`)
            .length === 0 && tablero.data ? (
            <p className="text-ink/55 py-8 text-center text-sm">✅ No hay nada aquí.</p>
          ) : null}
          {filtra(listas[vista], (t) => `${t.numero} ${t.titulo} ${t.proveedor ?? ''} ${t.solicitante ?? ''}`).map(
            (t) => (
              <TarjetaTelefono
                key={t.solicitud_id}
                t={t}
                acciones={
                  <>
                    {t.columna === 'REVISION' && esAlmacen ? (
                      <Button block size="lg" onClick={() => setRevisarId(t.solicitud_id)}>
                        🏬 Revisar
                      </Button>
                    ) : (
                      <Link to={`/app/compras/${t.solicitud_id}`}>
                        <Button block size="lg">
                          {t.columna === 'GERENTE' && soyAprobador ? '⏳ Aprobar' : 'Abrir'}
                        </Button>
                      </Link>
                    )}
                    <Button block size="lg" variant="outline" onClick={() => setPedidoId(t.solicitud_id)}>
                      💬 WhatsApp
                    </Button>
                  </>
                }
              />
            ),
          )}
        </div>
      ) : null}

      {/* Revisar en el almacén, desde el teléfono */}
      {revisarId != null ? (
        <ConLaCompra id={revisarId} onCerrar={() => setRevisarId(null)}>
          {(compra, solicitante) => (
            <ModalRevisionAlmacen
              compra={compra}
              solicitante={solicitante}
              empresa={empresa?.razon_social}
              onCerrar={() => setRevisarId(null)}
              onHecho={(texto) => {
                setRevisarId(null)
                setMensaje({ titulo: 'WhatsApp del almacén', texto })
              }}
            />
          )}
        </ConLaCompra>
      ) : null}

      {/* El WhatsApp del pedido */}
      {pedidoId != null ? (
        <ConLaCompra id={pedidoId} onCerrar={() => setPedidoId(null)}>
          {(compra, solicitante, cargo) => (
            <ModalWhatsappCompra
              titulo="WhatsApp del pedido"
              texto={textoSolicitudPedido({
                compra,
                renglones: renglonesComoSePidieron(compra),
                personas: { solicita: solicitante },
                cargo,
                estado: estadoDeLaCompra(compra),
                empresa: empresa?.razon_social,
              })}
              onCerrar={() => setPedidoId(null)}
            />
          )}
        </ConLaCompra>
      ) : null}

      {recibiendo ? (
        <ModalRecepcion
          abierto
          orden={recibiendo}
          onCerrar={() => setRecibiendo(null)}
          onHecho={(recibida, datos) => {
            setRecibiendo(null)
            setMensaje({
              titulo: 'WhatsApp de la recepción',
              texto: textoRecepcion({
                compra: recibida.solicitud,
                orden: recibida,
                ...datos,
                empresa: empresa?.razon_social,
              }),
            })
          }}
        />
      ) : null}

      {mensaje ? (
        <ModalWhatsappCompra
          titulo={mensaje.titulo}
          texto={mensaje.texto}
          onCerrar={() => setMensaje(null)}
        />
      ) : null}
    </div>
  )
}

function TarjetaTelefono({ t, acciones }: { t: Tarjeta; acciones: ReactNode }) {
  return (
    <div
      className={cn(
        'border-hairline bg-surface rounded-[10px] border p-3.5',
        t.prioridad === 'URGENTE' && 'border-danger/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="tabular text-ink/90 font-semibold">
            {t.numero}
            {t.orden_numero ? <span className="text-ink/50 font-normal"> · {t.orden_numero}</span> : null}
          </p>
          <p className="text-ink/80 text-sm">{t.titulo}</p>
          <p className="text-ink/50 mt-0.5 text-xs">
            {[t.solicitante, t.proveedor, hace(t.creada_en)].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {t.prioridad === 'URGENTE' ? <Chip tone="danger">🚨 Urgente</Chip> : null}
          {t.total && t.moneda ? (
            <span className="tabular text-ink/85 text-sm font-medium">{dinero(t.moneda, t.total)}</span>
          ) : null}
          {t.columna === 'CREDITO' && t.credito_vence ? (
            <span className="text-ink/55 text-xs">
              vence {t.credito_vence.split('-').reverse().join('/')}
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">{acciones}</div>
    </div>
  )
}

/** Carga la compra entera (renglones, lo atendido) y se la pasa a quien la necesita. */
function ConLaCompra({
  id,
  onCerrar,
  children,
}: {
  id: number
  onCerrar: () => void
  children: (
    compra: NonNullable<ReturnType<typeof useCompra>['data']>,
    solicitante: string | null,
    cargo: string | null,
  ) => ReactNode
}) {
  const { data: compra, error } = useCompra(id)
  const { data: perfiles } = usePerfiles()

  if (error) {
    return (
      <ModalWhatsappCompra titulo="No se pudo cargar" texto={String(error.message)} onCerrar={onCerrar} />
    )
  }
  if (!compra) return null

  const perfil = compra.solicitante_id ? perfiles?.find((p) => p.id === compra.solicitante_id) : null
  const solicitante = perfil?.nombre ?? compra.solicitante_nombre ?? null
  const cargo = compra.solicitante_cargo ?? perfil?.cargo ?? null
  return <>{children(compra, solicitante, cargo)}</>
}
