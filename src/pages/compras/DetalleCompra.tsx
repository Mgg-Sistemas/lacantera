import { useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  ArrowLeft,
  Ban,
  BadgeCheck,
  Check,
  CircleDollarSign,
  FileText,
  History,
  PackageCheck,
  Send,
  Undo2,
  UserX,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ChipTasa } from '@/components/ChipTasa'
import { Chip } from '@/components/ui/Chip'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { ModalCotizacion } from './ModalCotizacion'
import { ModalPago } from './ModalPago'
import { ModalRecepcion } from './ModalRecepcion'
import { ModalRegistrarPago } from '@/pages/tesoreria/ModalRegistrarPago'
import { usePerfiles, useMisRoles } from '@/lib/api/catalogo'
import {
  ordenVigente,
  useAprobarCompra,
  useBitacora,
  useCancelarOrden,
  useCancelarPedido,
  useCompra,
  useConfirmarPedido,
  useDevolverACotizacion,
  useDevolverInstruccion,
  useEliminarCotizacion,
  useEnviarPedido,
  useMarcarDesistimiento,
  useProponerCotizacion,
  useResolverDesistimiento,
} from '@/lib/api/compras'
import { useMetodosPago, nombreDe } from '@/lib/api/metodosPago'
import type { Cotizacion, InstruccionPago } from '@/lib/api/compras'
import { bolivares, dinero, dolares, fecha, fechaHora } from '@/lib/formato'
import { cn } from '@/lib/cn'

// ---------------------------------------------------------------------------

const ETIQUETAS: Record<string, { texto: string; tono: 'neutral' | 'info' | 'royal' | 'warning' | 'success' | 'danger' }> = {
  BORRADOR: { texto: 'Borrador', tono: 'neutral' },
  PEDIDO: { texto: 'Pedido', tono: 'neutral' },
  CONFIRMADA: { texto: 'Confirmada · indicar proveedores', tono: 'info' },
  POR_CONFIRMAR_GERENTE: { texto: 'Por confirmar el gerente', tono: 'royal' },
  APROBADA: { texto: 'Aprobada', tono: 'warning' },
  CANCELADA: { texto: 'Cancelada', tono: 'neutral' },
  POR_INDICAR_PAGO: { texto: 'Aprobada · indicar método de pago', tono: 'warning' },
  EN_TESORERIA: { texto: 'En tesorería', tono: 'info' },
  // Contra entrega: aprobada y esperando el material, sin un bolivar fuera.
  POR_RECIBIR: { texto: 'Contra entrega · esperando el material', tono: 'info' },
  PAGADA_POR_RECIBIR: { texto: 'Pagada · pendiente por recepcionar', tono: 'success' },
  RECIBIDA_PARCIAL: { texto: 'Recibida parcialmente', tono: 'success' },
  RECIBIDA: { texto: 'Recibida', tono: 'success' },
  PROVEEDOR_DESISTIO: { texto: 'El proveedor desistió', tono: 'danger' },
}

// ---------------------------------------------------------------------------
// Modal de un solo campo: el motivo.
//
// Cancelar, devolver y marcar un desistimiento comparten forma — una decisión
// y una explicación obligatoria. La explicación no es burocracia: dentro de un
// mes, "cancelada" sin motivo no le sirve a nadie.
// ---------------------------------------------------------------------------
function ModalMotivo({
  abierto,
  onCerrar,
  titulo,
  descripcion,
  etiqueta,
  variante = 'danger',
  pendiente,
  error,
  onConfirmar,
}: {
  abierto: boolean
  onCerrar: () => void
  titulo: string
  descripcion: string
  etiqueta: string
  variante?: 'primary' | 'danger'
  pendiente: boolean
  error: unknown
  onConfirmar: (motivo: string) => Promise<void>
}) {
  const [motivo, setMotivo] = useState('')

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={titulo}
      descripcion={descripcion}
      ancho="sm"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            variant={variante}
            disabled={pendiente || motivo.trim().length < 5}
            onClick={async () => {
              await onConfirmar(motivo)
              setMotivo('')
              onCerrar()
            }}
          >
            {pendiente ? 'Guardando…' : etiqueta}
          </Button>
        </>
      }
    >
      <Textarea
        label="Motivo"
        rows={4}
        autoFocus
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        hint="Queda en el historial de la compra."
      />
      {error ? <ErrorDeCarga error={error} className="mt-3" /> : null}
    </Modal>
  )
}

// ---------------------------------------------------------------------------

/**
 * En qué gana cada cotización frente a las demás.
 *
 * POR QUÉ NO HAY UNA «MEJOR» A SECAS
 *
 * Antes se marcaba una sola: la más barata. Y la más barata no siempre es la
 * que conviene — una que cuesta veinte dólares más pero se paga a treinta días
 * puede ser mejor para una empresa que anda ajustada de caja, y una que llega
 * en dos días puede serlo cuando la planta está parada esperando la pieza.
 *
 * Poner un ganador único obligaría a inventar una fórmula que pondere precio,
 * plazo y entrega. Cualquier peso que eligiéramos sería nuestro, no de quien
 * compra, y quedaría escondido detrás de una etiqueta que parece objetiva.
 *
 * Así que cada cotización lleva las etiquetas de aquello en lo que gana, y
 * decide la persona. Si una gana en todo, se le ven las tres juntas y la
 * decisión se toma sola.
 *
 * SOLO SE COMPARA LO QUE SE PUEDE COMPARAR
 *
 * Con una sola cotización no hay nada que decir: llamarla «la más económica»
 * sería cierto y vacío. Y una etiqueta solo aparece si de verdad hay
 * diferencia: si las tres cuestan lo mismo, ninguna es la más barata.
 */
export interface Ventaja {
  clave: string
  etiqueta: string
  detalle: string
  tono: 'success' | 'royal' | 'neutral'
}

/** Cuánto se tarda en pagar cada condición. Más días, más aire de caja. */
const DIAS_DE_PAGO: Record<string, number> = {
  CONTADO: 0,
  CONTRA_ENTREGA: 1,
  CREDITO_15: 15,
  CREDITO_30: 30,
  CREDITO_60: 60,
}

function compararCotizaciones(cotizaciones: Cotizacion[]): Map<number, Ventaja[]> {
  const mapa = new Map<number, Ventaja[]>()
  if (cotizaciones.length < 2) return mapa

  const anotar = (id: number, v: Ventaja) => mapa.set(id, [...(mapa.get(id) ?? []), v])

  // Precio: en dólares, que es lo único comparable entre monedas distintas.
  const precios = cotizaciones.map((c) => Number(c.total_usd))
  const menor = Math.min(...precios)
  if (Math.max(...precios) > menor) {
    for (const c of cotizaciones) {
      if (Number(c.total_usd) === menor) {
        anotar(c.id, {
          clave: 'precio',
          etiqueta: 'Más económica',
          detalle: 'Es la de menor total en dólares.',
          tono: 'success',
        })
      }
    }
  }

  // Pago: gana la que da más días para pagar.
  const plazos = cotizaciones.map((c) => DIAS_DE_PAGO[c.condicion_pago] ?? 0)
  const mayorPlazo = Math.max(...plazos)
  if (mayorPlazo > Math.min(...plazos)) {
    for (const c of cotizaciones) {
      if ((DIAS_DE_PAGO[c.condicion_pago] ?? 0) === mayorPlazo) {
        anotar(c.id, {
          clave: 'pago',
          etiqueta: c.condicion_pago === 'CONTRA_ENTREGA' ? 'Se paga al recibir' : 'Más plazo',
          detalle:
            c.condicion_pago === 'CONTRA_ENTREGA'
              ? 'Solo se paga lo que llegue.'
              : `Es la que da más días para pagar (${mayorPlazo}).`,
          tono: 'royal',
        })
      }
    }
  }

  // Entrega: solo entre las que dijeron en cuántos días.
  const conEntrega = cotizaciones.filter((c) => c.dias_entrega !== null)
  if (conEntrega.length > 1) {
    const dias = conEntrega.map((c) => Number(c.dias_entrega))
    const masRapida = Math.min(...dias)
    if (Math.max(...dias) > masRapida) {
      for (const c of conEntrega) {
        if (Number(c.dias_entrega) === masRapida) {
          anotar(c.id, {
            clave: 'entrega',
            etiqueta: 'Llega antes',
            detalle: `Entrega en ${masRapida} día${masRapida === 1 ? '' : 's'}.`,
            tono: 'neutral',
          })
        }
      }
    }
  }

  return mapa
}

function TarjetaCotizacion({
  cotizacion,
  ventajas,
  elegida,
  puedeOperar,
  onProponer,
  onEliminar,
}: {
  cotizacion: Cotizacion
  /** En qué gana esta cotización frente a las demás. Vacío si no gana en nada. */
  ventajas: Ventaja[]
  elegida: boolean
  puedeOperar: boolean
  onProponer: () => void
  onEliminar: () => void
}) {
  return (
    <div
      className={cn(
        'rounded-card border p-3.5',
        elegida ? 'border-royal-600 bg-royal-600/5' : 'border-hairline',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ink/90 truncate text-base font-medium">
            {cotizacion.proveedor?.nombre ?? 'Proveedor'}
          </p>
          <p className="text-ink/50 text-xs">
            <span className="text-ink/45 font-mono">{cotizacion.numero}</span> ·{' '}
            {cotizacion.proveedor?.rif} · {fecha(cotizacion.fecha)}
            {cotizacion.numero_proveedor ? ` · s/n ${cotizacion.numero_proveedor}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {elegida ? <Chip tone="royal">Propuesta al gerente</Chip> : null}
          {ventajas.map((v) => (
            <Chip key={v.clave} tone={v.tono} title={v.detalle}>
              {v.etiqueta}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <p className="text-ink/90 tabular text-xl font-semibold">
            {dinero(cotizacion.moneda, cotizacion.total)}
          </p>
          <p className="text-ink/45 tabular text-xs">
            {cotizacion.moneda === 'VES'
              ? dolares(cotizacion.total_usd)
              : bolivares(cotizacion.total_bs)}
          </p>
        </div>
        <dl className="text-ink/60 flex gap-4 text-xs">
          <div>
            <dt className="text-ink/40">Entrega</dt>
            <dd>{cotizacion.dias_entrega !== null ? `${cotizacion.dias_entrega} días` : '—'}</dd>
          </div>
          <div>
            <dt className="text-ink/40">IVA</dt>
            <dd className="tabular">{dinero(cotizacion.moneda, cotizacion.iva)}</dd>
          </div>
          <div>
            <dt className="text-ink/40">Validez</dt>
            <dd>{cotizacion.validez_dias} días</dd>
          </div>
        </dl>
      </div>

      {cotizacion.observacion ? (
        <p className="text-ink/55 mt-2 text-sm">{cotizacion.observacion}</p>
      ) : null}

      {puedeOperar ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant={elegida ? 'outline' : 'soft'} onClick={onProponer}>
            {elegida ? 'Ya propuesta' : 'Proponer al gerente'}
          </Button>
          {!elegida ? (
            <Button size="sm" variant="ghost" className="text-danger" onClick={onEliminar}>
              Eliminar
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------

function TarjetaInstruccion({
  instruccion,
  puedePagar,
  onPagar,
  onDevolver,
}: {
  instruccion: InstruccionPago
  puedePagar: boolean
  onPagar: () => void
  onDevolver: () => void
}) {
  const { data: metodos } = useMetodosPago()
  const i = instruccion

  return (
    <div className="border-hairline rounded-card border p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-ink/90 text-base font-medium">{nombreDe(metodos, i.metodo)}</p>
          <p className="text-ink/50 text-xs">Cargada el {fechaHora(i.creada_en)}</p>
        </div>
        <Chip
          tone={
            i.estado === 'PAGADA'
              ? 'success'
              : i.estado === 'POR_PAGAR'
                ? 'warning'
                : 'neutral'
          }
        >
          {i.estado === 'POR_PAGAR'
            ? 'Por pagar'
            : i.estado === 'PAGADA'
              ? 'Pagada'
              : i.estado === 'DEVUELTA'
                ? 'Devuelta a compras'
                : 'Anulada'}
        </Chip>
      </div>

      <p className="text-ink/90 tabular mt-2 text-xl font-semibold">
        {dinero(i.moneda, i.monto)}
      </p>
      {i.igtf_aplica ? (
        <p className="text-warning tabular text-xs">
          + IGTF 3% = {dinero(i.moneda, i.igtf_monto)}
        </p>
      ) : null}

      <dl className="text-ink/65 mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        {i.banco ? (
          <div className="flex gap-1.5">
            <dt className="text-ink/40">Banco</dt>
            <dd className="truncate">{i.banco}</dd>
          </div>
        ) : null}
        {i.numero_cuenta ? (
          <div className="flex gap-1.5">
            <dt className="text-ink/40">Cuenta</dt>
            <dd className="tabular truncate">{i.numero_cuenta}</dd>
          </div>
        ) : null}
        {i.telefono ? (
          <div className="flex gap-1.5">
            <dt className="text-ink/40">Teléfono</dt>
            <dd className="tabular">{i.telefono}</dd>
          </div>
        ) : null}
        {i.correo_binance ? (
          <div className="flex gap-1.5">
            <dt className="text-ink/40">Binance</dt>
            <dd className="truncate">{i.correo_binance}</dd>
          </div>
        ) : null}
        {i.red_cripto ? (
          <div className="flex gap-1.5">
            <dt className="text-ink/40">Red</dt>
            <dd>{i.red_cripto}</dd>
          </div>
        ) : null}
        {i.titular ? (
          <div className="flex gap-1.5">
            <dt className="text-ink/40">Titular</dt>
            <dd className="truncate">{i.titular}</dd>
          </div>
        ) : null}
        {i.receptor ? (
          <div className="flex gap-1.5">
            <dt className="text-ink/40">Recibe</dt>
            <dd className="truncate">{i.receptor}</dd>
          </div>
        ) : null}
        {i.documento ? (
          <div className="flex gap-1.5">
            <dt className="text-ink/40">Documento</dt>
            <dd className="tabular">{i.documento}</dd>
          </div>
        ) : null}
        {i.referencia ? (
          <div className="flex gap-1.5">
            <dt className="text-ink/40">Referencia</dt>
            <dd className="tabular truncate">{i.referencia}</dd>
          </div>
        ) : null}
        {i.fecha_pago ? (
          <div className="flex gap-1.5">
            <dt className="text-ink/40">Pagado el</dt>
            <dd>{fecha(i.fecha_pago)}</dd>
          </div>
        ) : null}
      </dl>

      {i.nota ? <p className="text-ink/55 mt-2 text-sm italic">«{i.nota}»</p> : null}
      {i.motivo_devolucion ? (
        <p className="text-danger mt-2 text-sm">Devuelta: {i.motivo_devolucion}</p>
      ) : null}

      {puedePagar && i.estado === 'POR_PAGAR' ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" icon={<Check />} onClick={onPagar}>
            Registrar el pago
          </Button>
          <Button size="sm" variant="ghost" className="text-danger" onClick={onDevolver}>
            Devolver a compras
          </Button>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------

export function DetalleCompra() {
  const { id } = useParams()
  const compraId = Number(id)
  const { data: compra, isPending, error } = useCompra(compraId)
  const orden = ordenVigente(compra)
  const { data: bitacora } = useBitacora(compraId, orden?.id)
  const { data: perfiles } = usePerfiles()
  const { puede } = useMisRoles()

  const enviar = useEnviarPedido()
  const confirmar = useConfirmarPedido()
  const cancelarPedido = useCancelarPedido()
  const proponer = useProponerCotizacion()
  const eliminarCotizacion = useEliminarCotizacion()
  const aprobar = useAprobarCompra()
  const devolver = useDevolverACotizacion()
  const devolverPago = useDevolverInstruccion()
  const cancelarOrden = useCancelarOrden()
  const desistir = useMarcarDesistimiento()
  const resolver = useResolverDesistimiento()

  const [modal, setModal] = useState<
    | null
    | { tipo: 'cotizacion' }
    | { tipo: 'pago' }
    | { tipo: 'recepcion' }
    | { tipo: 'cancelar-pedido' }
    | { tipo: 'devolver-gerencia' }
    | { tipo: 'cancelar-orden' }
    | { tipo: 'desistir' }
    | { tipo: 'resolver' }
    | { tipo: 'registrar-pago'; instruccion: InstruccionPago }
    | { tipo: 'devolver-instruccion'; instruccion: InstruccionPago }
  >(null)

  const [resolucion, setResolucion] = useState('REEMBOLSADO')

  if (isPending) return <Cargando texto="Cargando la compra…" />
  if (error) return <ErrorDeCarga error={error} />
  if (!compra) return <Vacio titulo="No se encontró esa compra" />

  const nombreDe = (uid: string | null) =>
    (uid && perfiles?.find((p) => p.id === uid)?.nombre) || '—'

  // Quien pide puede no tener usuario: entonces su nombre está escrito a mano.
  const solicitante = compra.solicitante_id
    ? nombreDe(compra.solicitante_id)
    : (compra.solicitante_nombre ?? '—')

  const solicitanteCargo =
    compra.solicitante_cargo ??
    (compra.solicitante_id
      ? (perfiles?.find((p) => p.id === compra.solicitante_id)?.cargo ?? null)
      : null)

  const cotizaciones = compra.cotizaciones ?? []
  const comparacion = compararCotizaciones(cotizaciones)

  const estadoVisible = orden ? orden.estado : compra.estado
  const etiqueta = ETIQUETAS[estadoVisible] ?? { texto: estadoVisible, tono: 'neutral' as const }

  // La columna de recibido solo aparece cuando ya hay algo que recibir: antes
  // del pago sería una columna de ceros.
  const muestraRecibido = [
    'PAGADA_POR_RECIBIR', 'RECIBIDA_PARCIAL', 'RECIBIDA',
    // Contra entrega recibe antes de pagar, asi que lo recibido importa
    // desde que la orden existe y no solo despues del pago.
    'POR_RECIBIR', 'POR_INDICAR_PAGO', 'EN_TESORERIA',
  ].includes(
    orden?.estado ?? '',
  )

  const puedeCompras = puede('COMPRAS')
  const puedeGerente = puede('GERENTE_GENERAL')
  const puedeTesoreria = puede('TESORERIA')

  return (
    <>
      <PageHeader
        title={compra.titulo}
        description={`${compra.numero}${orden ? ` · Orden ${orden.numero}` : ''} · pedido por ${solicitante}${solicitanteCargo ? ` (${solicitanteCargo})` : ''}`}
        actions={
          <>
            {/* Aquí se cotiza, se aprueba y se paga, y las tres cosas congelan
                la tasa en la fila. Verla sin salir de la pantalla evita el
                error caro: emitir un lunes con la tasa del viernes. */}
            <ChipTasa className="self-center" />
            <Link to="/app/compras">
              <Button variant="outline" icon={<ArrowLeft />}>
                Tablero
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ---------------- Columna principal ----------------

            `min-w-0` no es cosmético: como elemento de cuadrícula, el mínimo
            por defecto es el ancho mínimo del contenido, y las tablas de aquí
            declaran 520px. Sin esto, la columna mide 520 en un teléfono de
            375 y la página entera se desplaza a lo ancho, aunque cada tabla
            tenga su propio contenedor con scroll. */}
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Qué se pidió"
              subtitle={compra.destino ? `Destino: ${compra.destino}` : undefined}
              action={<Chip tone={etiqueta.tono}>{etiqueta.texto}</Chip>}
            />

            <p className="text-ink/70 mt-3 text-base leading-relaxed">{compra.justificacion}</p>

            <div className="-mx-5 mt-4 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-ink/45 border-hairline border-y text-left text-xs">
                    <th className="py-2 pr-3 pl-5 font-medium">Descripción</th>
                    <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                    <th className="py-2 pr-5 pl-3 font-medium">Unidad</th>
                  </tr>
                </thead>
                <tbody>
                  {compra.renglones
                    ?.slice()
                    .sort((a, b) => a.linea - b.linea)
                    .map((r) => (
                      <tr key={r.id} className="border-hairline border-b last:border-0">
                        <td className="text-ink/85 py-2.5 pr-3 pl-5">
                          {r.descripcion}
                          {r.observacion ? (
                            <span className="text-ink/45 block text-xs">{r.observacion}</span>
                          ) : null}
                        </td>
                        <td className="tabular text-ink/85 px-3 py-2.5 text-right">{r.cantidad}</td>
                        <td className="text-ink/55 py-2.5 pr-5 pl-3">{r.unidad}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>

          {['CONFIRMADA', 'POR_CONFIRMAR_GERENTE', 'APROBADA'].includes(compra.estado) ? (
            <Card>
              <CardHeader
                title="Cotizaciones"
                subtitle={
                  cotizaciones.length === 0
                    ? 'Ninguna todavía'
                    : `${cotizaciones.length} proveedor${cotizaciones.length === 1 ? '' : 'es'}`
                }
                action={
                  puedeCompras && compra.estado !== 'APROBADA' ? (
                    <Button size="sm" variant="soft" onClick={() => setModal({ tipo: 'cotizacion' })}>
                      Cargar cotización
                    </Button>
                  ) : undefined
                }
              />

              <div className="mt-4 space-y-3">
                {cotizaciones.length === 0 ? (
                  <Vacio
                    icono={<FileText />}
                    titulo="Sin cotizaciones"
                    descripcion="Carga lo que manden los proveedores. Con dos o más, la comparación se hace sola."
                  />
                ) : null}

                {cotizaciones.map((c) => (
                  <TarjetaCotizacion
                    key={c.id}
                    cotizacion={c}
                    ventajas={comparacion.get(c.id) ?? []}
                    elegida={compra.cotizacion_elegida_id === c.id}
                    puedeOperar={puedeCompras && compra.estado !== 'APROBADA'}
                    onProponer={() =>
                      void proponer.mutate({ solicitud_id: compra.id, cotizacion_id: c.id })
                    }
                    onEliminar={() => void eliminarCotizacion.mutate({ id: c.id })}
                  />
                ))}
              </div>

              {proponer.error ? <ErrorDeCarga error={proponer.error} className="mt-3" /> : null}
              {eliminarCotizacion.error ? (
                <ErrorDeCarga error={eliminarCotizacion.error} className="mt-3" />
              ) : null}
            </Card>
          ) : null}

          {orden ? (
            <Card>
              <CardHeader
                title={`Orden ${orden.numero}`}
                subtitle={`${orden.proveedor?.nombre ?? ''} · aprobada el ${fecha(orden.creada_en.slice(0, 10))}`}
                action={<Chip tone={ETIQUETAS[orden.estado]?.tono ?? 'neutral'}>{ETIQUETAS[orden.estado]?.texto ?? orden.estado}</Chip>}
              />

              <div className="-mx-5 mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="text-ink/45 border-hairline border-y text-left text-xs">
                      <th className="py-2 pr-3 pl-5 font-medium">Descripción</th>
                      <th className="px-3 py-2 text-right font-medium">Cant.</th>
                      {muestraRecibido ? (
                        <th className="px-3 py-2 text-right font-medium">Recibido</th>
                      ) : null}
                      <th className="px-3 py-2 text-right font-medium">Precio</th>
                      <th className="py-2 pr-5 pl-3 text-right font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orden.renglones
                      ?.slice()
                      .sort((a, b) => a.linea - b.linea)
                      .map((r) => (
                        <tr key={r.id} className="border-hairline border-b last:border-0">
                          <td className="text-ink/85 py-2.5 pr-3 pl-5">{r.descripcion}</td>
                          <td className="tabular text-ink/85 px-3 py-2.5 text-right">
                            {r.cantidad} {r.unidad}
                          </td>
                          {muestraRecibido ? (
                            <td
                              className={cn(
                                'tabular px-3 py-2.5 text-right',
                                Number(r.cantidad_recibida) >= Number(r.cantidad)
                                  ? 'text-success'
                                  : Number(r.cantidad_recibida) > 0
                                    ? 'text-warning'
                                    : 'text-ink/40',
                              )}
                            >
                              {r.cantidad_recibida}
                            </td>
                          ) : null}
                          <td className="tabular text-ink/70 px-3 py-2.5 text-right">
                            {dinero(orden.moneda, r.precio_unitario)}
                          </td>
                          <td className="tabular text-ink/85 py-2.5 pr-5 pl-3 text-right">
                            {dinero(orden.moneda, r.subtotal)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              <dl className="border-hairline mt-4 space-y-1 border-t pt-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink/55">Subtotal</dt>
                  <dd className="tabular text-ink/80">{dinero(orden.moneda, orden.subtotal)}</dd>
                </div>
                {Number(orden.descuento) > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-ink/55">Descuento</dt>
                    <dd className="tabular text-ink/80">
                      −{dinero(orden.moneda, orden.descuento)}
                    </dd>
                  </div>
                ) : null}
                {Number(orden.flete) > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-ink/55">Flete</dt>
                    <dd className="tabular text-ink/80">{dinero(orden.moneda, orden.flete)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <dt className="text-ink/55">IVA</dt>
                  <dd className="tabular text-ink/80">{dinero(orden.moneda, orden.iva)}</dd>
                </div>
                <div className="border-hairline flex justify-between border-t pt-1.5">
                  <dt className="text-ink/85 font-semibold">Total</dt>
                  <dd className="tabular text-ink/90 font-semibold">
                    {dinero(orden.moneda, orden.total)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink/45 text-xs">Equivalente</dt>
                  <dd className="tabular text-ink/45 text-xs">
                    {orden.moneda === 'VES' ? dolares(orden.total_usd) : bolivares(orden.total_bs)}
                  </dd>
                </div>
              </dl>

              {orden.desistio_motivo ? (
                <div className="border-danger/25 bg-danger-soft mt-4 rounded-[6px] border p-3">
                  <p className="text-danger text-sm font-medium">El proveedor desistió</p>
                  <p className="text-ink/75 mt-1 text-sm">{orden.desistio_motivo}</p>
                  <p className="text-ink/55 mt-1 text-xs">
                    {orden.desistio_resolucion === 'PENDIENTE'
                      ? 'El dinero todavía no se ha resuelto.'
                      : orden.desistio_resolucion === 'REEMBOLSADO'
                        ? 'El proveedor devolvió el dinero.'
                        : orden.desistio_resolucion === 'SALDO_FAVOR'
                          ? 'Queda como saldo a favor con el proveedor.'
                          : 'Se dio por perdido.'}
                    {orden.desistio_nota ? ` ${orden.desistio_nota}` : ''}
                  </p>
                </div>
              ) : null}
            </Card>
          ) : null}

          {orden && orden.instrucciones.length > 0 ? (
            <Card>
              <CardHeader
                title="Pagos"
                subtitle="Lo que se instruyó pagar y lo que tesorería ya ejecutó."
              />
              <div className="mt-4 space-y-3">
                {orden.instrucciones
                  .slice()
                  .sort((a, b) => a.creada_en.localeCompare(b.creada_en))
                  .map((i) => (
                    <TarjetaInstruccion
                      key={i.id}
                      instruccion={i}
                      puedePagar={puedeTesoreria}
                      onPagar={() => setModal({ tipo: 'registrar-pago', instruccion: i })}
                      onDevolver={() => setModal({ tipo: 'devolver-instruccion', instruccion: i })}
                    />
                  ))}
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Historial" subtitle="Quién movió esta compra y cuándo." />
            <ol className="mt-4 space-y-3">
              {(bitacora ?? []).map((e) => (
                <li key={`${e.documento_tipo}-${e.id}`} className="flex gap-3">
                  <div className="mt-1.5 flex flex-col items-center">
                    <span className="bg-royal-600 size-2 rounded-full" />
                    <span className="bg-hairline w-px flex-1" />
                  </div>
                  <div className="min-w-0 pb-1">
                    <p className="text-ink/85 text-sm">
                      {ETIQUETAS[e.estado_nuevo]?.texto ?? e.estado_nuevo}
                      <span className="text-ink/45"> · {nombreDe(e.actor_id)}</span>
                    </p>
                    <p className="text-ink/45 text-xs">{fechaHora(e.ocurrido_en)}</p>
                    {e.nota ? <p className="text-ink/60 mt-0.5 text-sm">«{e.nota}»</p> : null}
                  </div>
                </li>
              ))}
              {(bitacora ?? []).length === 0 ? (
                <li className="text-ink/45 flex items-center gap-2 text-sm">
                  <History className="size-4" /> Sin movimientos todavía.
                </li>
              ) : null}
            </ol>
          </Card>
        </div>

        {/* ---------------- Panel de acciones ----------------

            `contents` en móvil disuelve esta columna para que sus dos tarjetas
            sean elementos de la cuadrícula por separado. Así la acción que toca
            ahora sube al principio —en el teléfono, tenerla al final obliga a
            recorrer el documento entero para poder tocar el botón— y los datos
            de cabecera bajan al final, que es donde se consultan. En escritorio
            vuelven a ser una columna. */}
        <div className="contents lg:flex lg:flex-col lg:gap-4">
          <Card className="order-first lg:order-none">
            <CardHeader title="Qué sigue" />

            <div className="mt-4 space-y-2">
              {compra.estado === 'BORRADOR' ? (
                <>
                  <p className="text-ink/60 mb-3 text-sm">
                    Todavía es un borrador: nadie más lo ve en el tablero hasta que lo envíes.
                  </p>
                  <Button
                    block
                    icon={<Send />}
                    disabled={enviar.isPending}
                    onClick={() => void enviar.mutate({ id: compra.id })}
                  >
                    Enviar el pedido
                  </Button>
                </>
              ) : null}

              {compra.estado === 'PEDIDO' ? (
                puedeCompras ? (
                  <>
                    <p className="text-ink/60 mb-3 text-sm">
                      Confirmar significa que la compra procede y que se van a pedir precios.
                    </p>
                    <Button
                      block
                      icon={<Check />}
                      disabled={confirmar.isPending}
                      onClick={() => void confirmar.mutate({ id: compra.id })}
                    >
                      Confirmar el pedido
                    </Button>
                  </>
                ) : (
                  <p className="text-ink/60 text-sm">Esperando que compras lo confirme.</p>
                )
              ) : null}

              {compra.estado === 'CONFIRMADA' ? (
                puedeCompras ? (
                  <>
                    <p className="text-ink/60 mb-3 text-sm">
                      Carga las cotizaciones que manden los proveedores y propón una al gerente
                      general.
                    </p>
                    <Button block icon={<FileText />} onClick={() => setModal({ tipo: 'cotizacion' })}>
                      Cargar cotización
                    </Button>
                  </>
                ) : (
                  <p className="text-ink/60 text-sm">
                    Compras está pidiendo precios a los proveedores.
                  </p>
                )
              ) : null}

              {compra.estado === 'POR_CONFIRMAR_GERENTE' ? (
                puedeGerente ? (
                  <>
                    <p className="text-ink/60 mb-3 text-sm">
                      Al aprobar se emite la orden de compra por{' '}
                      <strong className="text-ink/85">
                        {dinero(
                          cotizaciones.find((c) => c.id === compra.cotizacion_elegida_id)?.moneda,
                          cotizaciones.find((c) => c.id === compra.cotizacion_elegida_id)?.total ?? 0,
                        )}
                      </strong>
                      . A partir de ahí, el precio queda fijo.
                    </p>
                    <Button
                      block
                      icon={<BadgeCheck />}
                      disabled={aprobar.isPending}
                      onClick={() => void aprobar.mutate({ solicitud_id: compra.id })}
                    >
                      Aprobar la compra
                    </Button>
                    <Button
                      block
                      variant="outline"
                      icon={<Undo2 />}
                      onClick={() => setModal({ tipo: 'devolver-gerencia' })}
                    >
                      Devolver a compras
                    </Button>
                  </>
                ) : (
                  <p className="text-ink/60 text-sm">
                    Esperando la confirmación del gerente general.
                  </p>
                )
              ) : null}

              {orden?.estado === 'POR_INDICAR_PAGO' ? (
                puedeCompras ? (
                  <>
                    <p className="text-ink/60 mb-3 text-sm">
                      Indica cómo se le paga al proveedor. Con eso la orden entra a tesorería.
                    </p>
                    <Button block icon={<CircleDollarSign />} onClick={() => setModal({ tipo: 'pago' })}>
                      Indicar método de pago
                    </Button>
                  </>
                ) : (
                  <p className="text-ink/60 text-sm">Compras está cargando el método de pago.</p>
                )
              ) : null}

              {orden?.estado === 'EN_TESORERIA' ? (
                puedeTesoreria ? (
                  <p className="text-ink/60 text-sm">
                    Registra el pago desde la instrucción, abajo. Al hacerlo, la compra queda
                    pendiente por recepcionar.
                  </p>
                ) : (
                  <p className="text-ink/60 text-sm">
                    Tesorería tiene la orden para pagar.
                  </p>
                )
              ) : null}

              {orden && ['PAGADA_POR_RECIBIR', 'RECIBIDA_PARCIAL', 'POR_RECIBIR'].includes(orden.estado) ? (
                <>
                  <div className="border-success/25 bg-success-soft rounded-[6px] border p-3">
                    <p className="text-ink/80 text-sm">
                      Pagada el {fecha(orden.fecha_pago)}. Falta que almacén reciba el material.
                      {orden.entrega_estimada
                        ? ` El proveedor ofreció entregar el ${fecha(orden.entrega_estimada)}.`
                        : ''}
                    </p>
                  </div>
                  {puede('ALMACEN') ? (
                    <Button
                      block
                      className="mt-2"
                      icon={<PackageCheck />}
                      onClick={() => setModal({ tipo: 'recepcion' })}
                    >
                      Recibir material
                    </Button>
                  ) : (
                    <p className="text-ink/45 mt-2 text-xs">
                      La recepción la registra almacén.
                    </p>
                  )}
                  {puedeCompras || puedeGerente ? (
                    <Button
                      block
                      variant="outline"
                      icon={<UserX />}
                      className="text-danger border-danger/30"
                      onClick={() => setModal({ tipo: 'desistir' })}
                    >
                      El proveedor desistió
                    </Button>
                  ) : null}
                </>
              ) : null}

              {orden?.estado === 'PROVEEDOR_DESISTIO' &&
              orden.desistio_resolucion === 'PENDIENTE' &&
              (puedeGerente || puedeTesoreria) ? (
                <>
                  <p className="text-ink/60 mb-3 text-sm">
                    Hay {dinero(orden.moneda, orden.total)} pagados sin material. Decide qué pasó
                    con ese dinero para cerrar la tarjeta.
                  </p>
                  <Button block variant="outline" onClick={() => setModal({ tipo: 'resolver' })}>
                    Resolver el dinero
                  </Button>
                </>
              ) : null}

              {/* Cancelar: disponible mientras no se haya pagado. */}
              {['PEDIDO', 'CONFIRMADA', 'POR_CONFIRMAR_GERENTE', 'BORRADOR'].includes(
                compra.estado,
              ) ? (
                <Button
                  block
                  variant="ghost"
                  icon={<Ban />}
                  className="text-danger"
                  onClick={() => setModal({ tipo: 'cancelar-pedido' })}
                >
                  Cancelar la compra
                </Button>
              ) : null}

              {orden && ['POR_INDICAR_PAGO', 'EN_TESORERIA'].includes(orden.estado) &&
              (puedeCompras || puedeGerente) ? (
                <Button
                  block
                  variant="ghost"
                  icon={<Ban />}
                  className="text-danger"
                  onClick={() => setModal({ tipo: 'cancelar-orden' })}
                >
                  Cancelar la orden
                </Button>
              ) : null}

              {compra.estado === 'CANCELADA' ? (
                <div className="border-hairline rounded-[6px] border p-3">
                  <p className="text-ink/70 text-sm">Cancelada.</p>
                  {compra.motivo_cancelacion ? (
                    <p className="text-ink/55 mt-1 text-sm">{compra.motivo_cancelacion}</p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {enviar.error ? <ErrorDeCarga error={enviar.error} className="mt-3" /> : null}
            {confirmar.error ? <ErrorDeCarga error={confirmar.error} className="mt-3" /> : null}
            {aprobar.error ? <ErrorDeCarga error={aprobar.error} className="mt-3" /> : null}
          </Card>

          <Card className="order-last lg:order-none">
            <CardHeader title="Datos" />
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ['Pedido', compra.numero],
                ['Solicita', solicitante + (solicitanteCargo ? ` · ${solicitanteCargo}` : '')],
                // Quien carga el pedido responde por lo que escribió, aunque no
                // sea quien lo necesita. Se muestra solo cuando son distintos:
                // repetir el mismo nombre dos veces no informa de nada.
                ...(compra.solicitante_id === compra.registrada_por
                  ? []
                  : [['Cargado por', nombreDe(compra.registrada_por)]]),
                ['Creado', fechaHora(compra.creada_en)],
                ['Prioridad', compra.prioridad === 'NORMAL' ? 'Normal' : compra.prioridad === 'ALTA' ? 'Alta' : 'Urgente'],
                ['Se necesita', fecha(compra.requerida_para)],
                ['Destino', compra.destino ?? '—'],
                ['Confirmado por', nombreDe(compra.confirmada_por)],
                ['Aprobado por', nombreDe(compra.aprobada_gg_por)],
              ].map(([clave, valor]) => (
                <div key={clave} className="flex justify-between gap-3">
                  <dt className="text-ink/50 shrink-0">{clave}</dt>
                  <dd className="text-ink/80 truncate text-right">{valor}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>

      {/* ---------------- Modales ---------------- */}
      {modal?.tipo === 'cotizacion' ? (
        <ModalCotizacion abierto onCerrar={() => setModal(null)} compra={compra} />
      ) : null}

      {modal?.tipo === 'pago' && orden ? (
        <ModalPago abierto onCerrar={() => setModal(null)} orden={orden} />
      ) : null}

      {modal?.tipo === 'recepcion' && orden ? (
        <ModalRecepcion abierto onCerrar={() => setModal(null)} orden={orden} />
      ) : null}

      <ModalMotivo
        abierto={modal?.tipo === 'cancelar-pedido'}
        onCerrar={() => setModal(null)}
        titulo="Cancelar la compra"
        descripcion="La tarjeta se va a la columna Cancelada y no se puede reabrir."
        etiqueta="Cancelar la compra"
        pendiente={cancelarPedido.isPending}
        error={cancelarPedido.error}
        onConfirmar={async (motivo) => {
          await cancelarPedido.mutateAsync({ id: compra.id, motivo })
        }}
      />

      <ModalMotivo
        abierto={modal?.tipo === 'devolver-gerencia'}
        onCerrar={() => setModal(null)}
        titulo="Devolver a compras"
        descripcion="Vuelve a la columna de cotizaciones para que consigan otra opción."
        etiqueta="Devolver"
        variante="primary"
        pendiente={devolver.isPending}
        error={devolver.error}
        onConfirmar={async (motivo) => {
          await devolver.mutateAsync({ solicitud_id: compra.id, motivo })
        }}
      />

      <ModalMotivo
        abierto={modal?.tipo === 'cancelar-orden'}
        onCerrar={() => setModal(null)}
        titulo="Cancelar la orden"
        descripcion="Solo se puede antes de que tesorería pague."
        etiqueta="Cancelar la orden"
        pendiente={cancelarOrden.isPending}
        error={cancelarOrden.error}
        onConfirmar={async (motivo) => {
          if (orden) await cancelarOrden.mutateAsync({ orden_id: orden.id, motivo })
        }}
      />

      <ModalMotivo
        abierto={modal?.tipo === 'desistir'}
        onCerrar={() => setModal(null)}
        titulo="El proveedor desistió"
        descripcion="La compra ya está pagada. La tarjeta se queda a la vista hasta que se resuelva el dinero."
        etiqueta="Marcar desistimiento"
        pendiente={desistir.isPending}
        error={desistir.error}
        onConfirmar={async (motivo) => {
          if (orden) await desistir.mutateAsync({ orden_id: orden.id, motivo })
        }}
      />

      <ModalMotivo
        abierto={modal?.tipo === 'devolver-instruccion'}
        onCerrar={() => setModal(null)}
        titulo="Devolver a compras"
        descripcion="La instrucción no se paga y compras tendrá que corregirla."
        etiqueta="Devolver"
        pendiente={devolverPago.isPending}
        error={devolverPago.error}
        onConfirmar={async (motivo) => {
          if (modal?.tipo === 'devolver-instruccion') {
            await devolverPago.mutateAsync({ instruccion_id: modal.instruccion.id, motivo })
          }
        }}
      />

      {modal?.tipo === 'registrar-pago' ? (
        <ModalRegistrarPago
          instruccion={modal.instruccion}
          onCerrar={() => setModal(null)}
        />
      ) : null}

      {modal?.tipo === 'resolver' && orden ? (
        <Modal
          abierto
          onCerrar={() => setModal(null)}
          titulo="Resolver el dinero"
          descripcion={`${dinero(orden.moneda, orden.total)} pagados a ${orden.proveedor?.nombre}`}
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setModal(null)}>
                Cancelar
              </Button>
              <Button
                disabled={resolver.isPending}
                onClick={async () => {
                  await resolver.mutateAsync({ orden_id: orden.id, resolucion })
                  setModal(null)
                }}
              >
                Guardar
              </Button>
            </>
          }
        >
          <Select
            label="Qué pasó con el dinero"
            value={resolucion}
            onChange={(e) => setResolucion(e.target.value)}
            opciones={[
              { valor: 'REEMBOLSADO', etiqueta: 'El proveedor lo devolvió' },
              { valor: 'SALDO_FAVOR', etiqueta: 'Queda como saldo a favor con el proveedor' },
              { valor: 'PERDIDA', etiqueta: 'Se dio por perdido' },
            ]}
          />
          {resolver.error ? <ErrorDeCarga error={resolver.error} className="mt-3" /> : null}
        </Modal>
      ) : null}
    </>
  )
}
