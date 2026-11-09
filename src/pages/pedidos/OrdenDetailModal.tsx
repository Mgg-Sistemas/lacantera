import { useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Estrellas } from '@/components/ui/Estrellas'
import { Visor } from '@/components/Visor'
import { cn } from '@/lib/cn'
import { useArticulos, useProveedores } from '@/lib/api/catalogo'
import { useEmpresa, empresaDelPapel } from '@/lib/api/empresa'
import { useTasaVigente } from '@/lib/api/tasas'
import { leerFirmasEncendidas } from '@/lib/api/firmas'
import {
  BUCKET_OFERTAS,
  BUCKET_PEDIDOS,
  useAnularOc,
  useAprobarOc,
  useCambiarModalidad,
  useEnviarCreditoARecepcion,
  useDesistirProveedor,
  useEditarCantidades,
  useEstadisticasProveedores,
  useEvaluacionDeOrden,
  useMarcarComprar,
  useOfertas,
  useReabrirOc,
  type Abono,
  type EstadoOrden,
  type ItemOrden,
  type Oferta,
  type Orden,
  type PermisosPedidos,
  type Recepcion,
} from '@/lib/api/pedidos'
import {
  CALIDAD_ESTRELLAS,
  ETIQUETA_ALMACEN,
  ESTADOS,
  claseEvento,
  etiquetaEvento,
  extraEvento,
  fechaHoraVE,
  fmtCant,
  money,
  MOTIVO_NO_PAGO,
  esMercado,
  esRecibible,
  PUNTUALIDAD_LABEL,
  progresoRecepcion,
  puedeFinalizarse,
  recibidoDe,
  repartoRenglon,
  revisadaPorAlmacen,
  textoEstadoSedes,
  textoNoPago,
  textoPuntualidad,
  tieneRecepcion,
  type TonoEstado,
} from '@/lib/pedidos'
import {
  DATOS_TECNICOS,
  LOGISTICA,
  avisoDeCuadre,
  desglosarOc,
  esHijaViva,
  infoModalidad,
  itemsPendientes,
  labelCondicionPago,
  montoFinalOferta,
  moneyBs,
  type ScoredOferta,
} from '@/lib/ofertas'
import {
  mensajeRecepcion,
  mensajeRevisionAlmacen,
  mensajeSolicitudPedido,
  mensajeSolicitudServicio,
  textoAbono,
  textoFinalizada,
  textoOcAprobada,
  textoOcNoSePagara,
  textoOrdenAprobacion,
  textoOrdenPagada,
  textoOrdenPago,
  type CotizacionMensaje,
} from '@/lib/ficha/pedidosWhatsapp'
import {
  abrirArchivoPago,
  abrirArchivoRecepcion,
  aceptaAbonos,
  basesPago,
  esCredito,
  etiquetaDocumento,
  nombreMetodoPago,
  labelRetencion,
  montoAPagar,
  resumenDatosPago,
  saldoCredito,
} from '@/lib/pagos'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { armarOrdenCompraPdf, armarSolicitudCotizacionPdf, armarSolicitudPedidoPdf } from '@/lib/ficha/pedidosPdf'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { abrirDeAlmacen } from '@/lib/abrirArchivo'
import { comoNumero } from '@/lib/formato'
import { ModalWhatsappCompra } from '@/pages/compras/ModalWhatsappCompra'
import { ConfirmDialog, MotivoModal } from './Dialogos'
import { AprobarOcModal } from './AprobarOcModal'
import { OfertasComparativa } from './OfertasComparativa'
import { AgregarOfertaModal } from './AgregarOfertaModal'
import { AceptarOfertaModal } from './AceptarOfertaModal'
import { AsignarProveedoresModal } from './AsignarProveedoresModal'
import { EditarOcModal } from './EditarOcModal'
import { DocumentoRetencionesModal, MetodoPagoModal } from './MetodoPagoModal'
import { AbonoModal, CreditoModal, MarcarPagadaModal } from './PagoModales'
import { RecibirOrdenModal } from './RecibirOrdenModal'
import { DevolucionesDeOrden } from './DevolucionesDeOrden'
import { ComprobanteOcModal, FinalizarPedidoModal, RecepcionesDeOrdenModal } from './FinalizarPedidoModal'
import { ServicioRealizadoModal } from './ServicioRealizadoModal'

/*
  EL DETALLE DE UNA ORDEN (MGG `OrdenDetailModal`), FASES 1 Y 2

  Fase 1: los avisos de arriba (urgente, en revisión de almacén, revisada por
  almacén), las filas clave → valor, la tabla «Ítems» con «✎ Cantidades» y la
  columna «Comprar», el historial y los botones de la SP.

  Fase 2: el proveedor, la condición y la modalidad de pago de la OC, los
  datos de la oferta elegida y su motivo, la tarjeta «🧩 Sub-órdenes por
  proveedor», el panel «Ofertas y comparativa», el pie de totales de la OC,
  el chat interno y los botones de la etapa de cotización y de la OC por
  aprobar (PDF para cotizar, asignar por producto, proveedor desistió, editar
  OC, re-elegir oferta, OC PDF, WhatsApp para aprobar, anular OC, cambiar de
  proveedor).

  Fase 3 (sin Tesorería): «✔ Aprobar OC», «💳 Indicar método de pago / Enviar
  para Pagar» (y «💳 Editar método de pago / datos»), «💵 Marcar pagada», el
  crédito («📋 Ver crédito / historial», «💵 Registrar abono», «🧾 Documento y
  retenciones», «📦 Enviar a Pendiente por recepción»), los WhatsApp de cada
  paso y las filas del pago: método, documento, retenciones, monto a pagar,
  abonado y pago registrado. Donde MGG dice «Tesorería», aquí lo hace Compras.

  Fase 4: «📦 Confirmar recepción» (solo quien recibe en el almacén: Inventario
  en escritura o rol de almacén), «📥 Ver recepción» con las recepciones R1,
  R2… y su WhatsApp, «✓ Finalizar orden» con la evaluación del proveedor, «📎
  Cargar factura / nota de entrega», las filas de la recepción y del cierre, y
  la columna «Recibido» de los ítems.

  No se minimiza a la barra de abajo como en MGG: esa barra es una pieza del
  armazón de MGG que La Cantera no tiene.
*/

const PUNTO: Record<TonoEstado, string> = {
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  royal: 'bg-royal-600',
  danger: 'bg-danger',
  neutral: 'bg-ink/30',
}

/** Donde se ve el panel de ofertas (MGG `mostrarOfertas`). */
const ESTADOS_CON_OFERTAS = new Set(['aprobada', 'desistida_proveedor', 'oc_creada', 'confirmada_metodo', 'oc_aprobada', 'pagada'])

export function EstadoBadge({ estado }: { estado: string }) {
  const e = ESTADOS[estado as keyof typeof ESTADOS]
  return <Chip tone={e?.tono === 'royal' ? 'royal' : (e?.tono ?? 'neutral')}>{e?.label ?? estado}</Chip>
}

function Fila({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="border-hairline grid grid-cols-[9rem_1fr] gap-3 border-b py-2 text-sm last:border-b-0 sm:grid-cols-[12rem_1fr]">
      <div className="text-ink/50">{k}</div>
      <div className="text-ink/85 min-w-0 break-words">{children}</div>
    </div>
  )
}

type SubModal =
  | { kind: 'none' }
  | { kind: 'oferta'; oferta: Oferta | null; soloSkus?: Set<string>; volverAAsignar?: boolean }
  | { kind: 'aceptar'; scored: ScoredOferta }
  | { kind: 'asignar' }
  | { kind: 'editar_oc' }
  | { kind: 'desistir' }
  | { kind: 'anular' }
  | { kind: 'reabrir' }
  | { kind: 'metodo'; modo: 'enviar' | 'corregir' }
  | { kind: 'pagar' }
  | { kind: 'abono' }
  | { kind: 'credito' }
  | { kind: 'documento' }
  | { kind: 'credito_recepcion' }
  | { kind: 'recibir' }
  | { kind: 'recepciones' }
  | { kind: 'finalizar' }
  | { kind: 'comprobante' }
  | { kind: 'realizado' }

/** El WhatsApp que se ofrece después de cada paso del pago. */
type AvisoWs =
  | { tipo: 'aprobada' }
  | { tipo: 'pago' }
  | { tipo: 'pagada' }
  | { tipo: 'abono'; abono: Abono }
  | { tipo: 'recepcion'; recepcion: Recepcion }
  | { tipo: 'finalizada' }

export function OrdenDetailModal({
  orden: o,
  ordenes,
  permisos,
  onClose,
  onApprove,
  onEditar,
  onCancel,
  onAbrir,
}: {
  orden: Orden
  /** Todas las que se ven: de aquí salen la madre y sus sub-OC. */
  ordenes: Orden[]
  permisos: PermisosPedidos
  onClose: () => void
  onApprove: () => void
  onEditar: () => void
  onCancel: () => void
  /** Abrir otra orden (la madre o una sub-OC). */
  onAbrir: (id: number) => void
}) {
  const yo = permisos.yo
  const canManageProcurement = permisos.gestiona
  const puedeAprobarOc = permisos.aprueba_oc
  const isPendiente = o.estado === 'pendiente'
  const enRevisionAlmacen = o.estado === 'revision_almacen'
  const canApprove = canManageProcurement && isPendiente
  const esServicio = o.clase === 'servicio'
  // Un servicio no recibe OC- (conserva su SV): se edita mientras no tenga proveedor.
  const canEditar =
    (isPendiente || o.estado === 'aprobada' || enRevisionAlmacen) &&
    !o.oc_codigo &&
    !(esServicio && (o.proveedor_id || o.parent_orden_id)) &&
    (canManageProcurement || o.creado_por === yo)
  const canEditarCant =
    ['pendiente', 'aprobada', 'oc_creada'].includes(o.estado) && (canManageProcurement || o.creado_por === yo)
  // MGG lo ofrece a quien vea el detalle; la base solo lo acepta de quien la
  // cargó o la pide, o de Compras.
  const canCancel =
    ['pendiente', 'aprobada', 'revision_almacen'].includes(o.estado) &&
    (permisos.escribe || o.creado_por === yo || o.solicitante_id === yo)
  const revisadaAlmacen = o.clase !== 'servicio' && revisadaPorAlmacen(o)

  // La madre y sus sub-OC (MGG `ordenDeOfertas`: las ofertas viven en la madre).
  const madre = useMemo(
    () => (o.parent_orden_id ? (ordenes.find((x) => x.id === o.parent_orden_id) ?? o) : o),
    [o, ordenes],
  )
  const hijas = useMemo(() => ordenes.filter((x) => x.parent_orden_id === madre.id), [ordenes, madre.id])
  const misHijas = o.parent_orden_id ? [] : hijas
  const pendientesMadre = useMemo(() => itemsPendientes(madre, hijas), [madre, hijas])

  // MGG: el panel sale en la pestaña OC y en la de servicios.
  const veOfertas = permisos.compras && ESTADOS_CON_OFERTAS.has(o.estado)
  const ofertasQ = useOfertas(permisos.compras ? [madre.id] : [])
  const ofertas = useMemo(() => ofertasQ.data ?? [], [ofertasQ.data])
  const { data: stats } = useEstadisticasProveedores(permisos.compras)
  const { data: proveedores } = useProveedores(false)
  const proveedorDe = (id: number | null | undefined) => (id ? proveedores?.find((p) => p.id === id) : undefined)
  const prov = proveedorDe(o.proveedor_id)
  const { data: tasa } = useTasaVigente()
  const { data: evaluacion } = useEvaluacionDeOrden(o.id, permisos.compras && o.estado === 'finalizada')
  // Un servicio no lo recibe el almacén: Compras confirma que se prestó (MGG «🔧 Servicio realizado»).
  const recibible = permisos.recibe_almacen === true && !esServicio && esRecibible(o)
  const servicioRealizable =
    esServicio && canManageProcurement && !o.recibida_en && ['por_recibir', 'cuenta_abierta', 'pagada'].includes(o.estado)
  const conRecepcion = tieneRecepcion(o)
  const progreso = progresoRecepcion(o)

  const { data: articulos } = useArticulos()
  const categoriaDe = useMemo(() => {
    const m = new Map<number, string>()
    for (const a of articulos ?? []) m.set(a.id, a.categoria)
    return m
  }, [articulos])
  const { data: empresa } = useEmpresa()

  const marcarComprar = useMarcarComprar()
  const editarCantidades = useEditarCantidades()
  const desistir = useDesistirProveedor()
  const anular = useAnularOc()
  const reabrir = useReabrirOc()
  const cambiarModalidad = useCambiarModalidad()
  const aprobarOc = useAprobarOc()
  const creditoARecepcion = useEnviarCreditoARecepcion()
  const qc = useQueryClient()
  const [avisoPaso, setAvisoPaso] = useState<AvisoWs | null>(null)

  const [sub, setSub] = useState<SubModal>({ kind: 'none' })
  const [mensajeWs, setMensajeWs] = useState<{ titulo: string; texto: string } | null>(null)
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [tituloPdf, setTituloPdf] = useState('')
  const [errorPdf, setErrorPdf] = useState<string | null>(null)

  const [editandoCant, setEditandoCant] = useState(false)
  const [cantDraft, setCantDraft] = useState<Record<string, string>>({})
  const [skusAEliminar, setSkusAEliminar] = useState<Set<string>>(new Set())
  const [porEliminar, setPorEliminar] = useState<ItemOrden | null>(null)

  function abrirEdicionCant() {
    const d: Record<string, string> = {}
    o.items.forEach((it) => {
      d[it.sku] = String(it.cantidad ?? 0)
    })
    setCantDraft(d)
    setSkusAEliminar(new Set())
    setEditandoCant(true)
  }
  function cerrarEdicionCant() {
    setEditandoCant(false)
    setSkusAEliminar(new Set())
    setPorEliminar(null)
  }
  async function guardarCantidades() {
    const mapa: Record<string, number> = {}
    for (const it of o.items) {
      if (skusAEliminar.has(it.sku)) continue
      const v = Number(String(cantDraft[it.sku] ?? '').replace(',', '.'))
      // Lo que el almacén ya entregó entero queda en cero: no se manda.
      if (v === 0 && Number(it.cantidad) === 0 && Number(it.cantidad_almacen) > 0) continue
      if (!Number.isFinite(v) || v <= 0) {
        toast(`La cantidad de "${it.nombre}" debe ser mayor que 0.`, 'error')
        return
      }
      mapa[it.sku] = v
    }
    if (!Object.keys(mapa).length) {
      toast('La orden debe conservar al menos un producto: no se pueden eliminar todos.', 'error')
      return
    }
    try {
      const eliminados = Array.from(skusAEliminar)
      await editarCantidades.mutateAsync({ id: o.id, cantidades: mapa, eliminar: eliminados })
      toast(
        eliminados.length
          ? `${eliminados.length} producto(s) eliminado(s) · ofertas y presupuesto recalculados`
          : 'Cantidades actualizadas · comparativa recalculada',
        'success',
      )
      cerrarEdicionCant()
    } catch (e) {
      toast(mensajeDe(e, 'No se pudieron actualizar las cantidades'), 'error')
    }
  }

  async function toggleComprar(sku: string, comprar: boolean) {
    try {
      await marcarComprar.mutateAsync({ id: o.id, sku, comprar })
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo actualizar el ítem'), 'error')
    }
  }

  async function armarPdf(titulo: string, armar: () => Promise<ArchivoArmado>) {
    try {
      setErrorPdf(null)
      setTituloPdf(titulo)
      setPdf(await armar())
    } catch (e) {
      setErrorPdf(mensajeDe(e, 'No se pudo generar el PDF'))
    }
  }

  const ofertaAceptada = ofertas.find((f) => f.estado === 'aceptada' && f.proveedor_id === o.proveedor_id) ?? null

  function pdfOc() {
    void armarPdf(`${o.clase === 'servicio' ? 'Orden de servicio' : 'Orden de compra'} ${o.oc_codigo ?? o.codigo}`, async () => {
      // La firma guardada de quien la aprobó (si la tiene encendida).
      const firmas = o.oc_aprobada_por
        ? await qc.fetchQuery({ queryKey: ['firmas'], queryFn: leerFirmasEncendidas, staleTime: 5 * 60_000 }).catch(() => null)
        : null
      return armarOrdenCompraPdf(o, empresaDelPapel(empresa), {
        firmaAprobador: o.oc_aprobada_por ? (firmas?.porPerfil[o.oc_aprobada_por] ?? null) : null,
        proveedor: prov
          ? {
              nombre: prov.nombre,
              rif: prov.rif,
              contacto: prov.contacto,
              correo: prov.correo,
              telefono: prov.telefono,
              direccion: prov.direccion,
            }
          : null,
        fechaEntregaPrometida: ofertaAceptada?.fecha_entrega_prometida ?? null,
        categoriaDe: (id) => (id ? (categoriaDe.get(id) ?? null) : null),
      })
    })
  }

  // Las cotizaciones de la orden, del monto final más bajo al más alto (MGG).
  function cotizacionesMensaje(): CotizacionMensaje[] {
    return [...ofertas]
      .map((f) => ({ f, monto: montoFinalOferta(f).final }))
      .sort((a, b) => a.monto - b.monto)
      .map(({ f, monto }) => {
        const elegida = f.estado === 'aceptada' && (o.proveedor_id ? f.proveedor_id === o.proveedor_id : true)
        return {
          proveedor: proveedorDe(f.proveedor_id)?.nombre ?? '—',
          monto,
          elegida,
          elegidaPor: elegida ? f.decidida_por_nombre : null,
        }
      })
  }

  function whatsappAprobar() {
    const cotizaciones = cotizacionesMensaje()
    setMensajeWs({
      titulo: `Avisar para aprobar · ${o.oc_codigo ?? o.codigo}`,
      texto: textoOrdenAprobacion(o, {
        proveedor: prov?.nombre ?? '',
        condicion: o.condiciones_pago ? labelCondicionPago(o.condiciones_pago) : null,
        empresa: empresaDelPapel(empresa).razonSocial,
        cotizaciones,
        tasaBs: tasa ? Number(tasa.tasa) : null,
      }),
    })
  }

  const empresaNombre = empresaDelPapel(empresa).razonSocial
  const datosMensaje = {
    proveedor: prov?.nombre ?? '',
    empresa: empresaNombre,
    condicion: o.condiciones_pago ? labelCondicionPago(o.condiciones_pago) : null,
  }

  /** «💬 WhatsApp para pagar» (MGG `textoOrdenPago`), con el saldo si es crédito. */
  const textoPago = () =>
    textoOrdenPago(o, { ...datosMensaje, cotizaciones: cotizacionesMensaje(), tasaBs: tasa ? Number(tasa.tasa) : null })

  // El WhatsApp de cada paso se arma con la orden ya al día (el canal en vivo la trae).
  const avisoTexto: { titulo: string; texto: string } | null = !avisoPaso
    ? null
    : avisoPaso.tipo === 'aprobada'
      ? { titulo: `Avisar por WhatsApp · OC ${o.oc_codigo ?? o.codigo} aprobada`, texto: textoOcAprobada(o, datosMensaje) }
      : avisoPaso.tipo === 'pago'
        ? { titulo: `Avisar por WhatsApp · OC ${o.oc_codigo ?? o.codigo} para pagar`, texto: textoPago() }
        : avisoPaso.tipo === 'pagada'
          ? { titulo: `Avisar por WhatsApp · OC ${o.oc_codigo ?? o.codigo} PAGADA`, texto: textoOrdenPagada(o, datosMensaje) }
          : avisoPaso.tipo === 'recepcion'
            ? {
                titulo: `📥 Recepción ${avisoPaso.recepcion.codigo}`,
                texto: mensajeRecepcion(avisoPaso.recepcion, { empresa: empresaNombre }),
              }
            : avisoPaso.tipo === 'finalizada'
              ? {
                  titulo: `Avisar por WhatsApp · ${o.oc_codigo ?? o.codigo} FINALIZADA`,
                  texto: textoFinalizada(o, evaluacion ?? null, datosMensaje),
                }
              : { titulo: `Avisar por WhatsApp · abono a OC ${o.oc_codigo ?? o.codigo}`, texto: textoAbono(o, avisoPaso.abono, datosMensaje) }

  // «✔ Aprobar OC» abre la ventana con «¿Se pagará esta OC?» (09/11/2026).
  const [aprobando, setAprobando] = useState(false)
  function onAprobarOc() {
    if (!puedeAprobarOc) {
      toast('Solo los usuarios autorizados para aprobar órdenes de compra (Usuarios > Roles y Permisos) pueden autorizarlas.', 'error')
      return
    }
    setAprobando(true)
  }
  function alAprobar(estado: EstadoOrden | undefined) {
    setAprobando(false)
    toast(
      estado === 'por_recibir'
        ? `OC confirmada: ${ocCodigo} · contra entrega: pendiente por recepción`
        : estado === 'cuenta_abierta'
          ? `OC confirmada: ${ocCodigo} · crédito (cuenta abierta)`
          : `OC confirmada: ${ocCodigo} · falta indicar el método de pago`,
      'success',
    )
    setAvisoPaso({ tipo: 'aprobada' })
  }
  function alNoSePagara(motivo: string, noProcede: boolean) {
    setAprobando(false)
    setMensajeWs({
      titulo: `Avisar por WhatsApp · OC ${ocCodigo} ${noProcede ? 'NO PROCEDE' : 'no se pagará por ahora'}`,
      texto: textoOcNoSePagara(o, { ...datosMensaje, motivo, noProcede }),
    })
  }

  // Sin la dirección del almacén en la barra (ver `abrirArchivo.ts`).
  const verImagen = (path: string, deOferta = false, nombre?: string) =>
    deOferta
      ? abrirDeAlmacen(BUCKET_OFERTAS, path, nombre, 'Adjunto de la oferta')
      : abrirDeAlmacen(BUCKET_PEDIDOS, path, nombre, `Imagen de ${o.codigo}`)

  async function onCambiarModalidad() {
    const a = o.modalidad_pago === 'usd' ? 'bs' : 'usd'
    try {
      await cambiarModalidad.mutateAsync({ id: o.id, modalidad: a })
      toast(`Modalidad cambiada a ${a === 'usd' ? 'Pago en $ (USD / Divisa)' : 'Pago en Bs al cambio (tasa BCV)'}`, 'success')
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo cambiar la modalidad de pago'), 'error')
    }
  }

  const conPrecio = Number(o.total) > 0
  const puedeEditarComprar =
    !conPrecio && canManageProcurement && o.estado !== 'revision_almacen' && o.estado !== 'atendida_almacen'
  const historial = [...(o.historial ?? [])].reverse()
  const ocCodigo = o.oc_codigo ?? o.codigo
  // MGG: anulable ya aprobada, antes de pagarse o recibirse y sin abonos.
  const anulable =
    puedeAprobarOc &&
    !o.pagada_en &&
    !o.recibida_en &&
    o.recibido_total == null &&
    !Number(o.abonado_total) &&
    ['confirmada_metodo', 'oc_aprobada', 'por_recibir', 'cuenta_abierta'].includes(o.estado)
  const desglose = desglosarOc(o)
  const aviso = conPrecio ? avisoDeCuadre(o, money) : null

  /*
    CADA BOTÓN EN SU ETAPA (la dueña, 09/11/2026: «hay muchos botones de lo
    mismo; en este nivel solo debe salir confirmar recepción, comprobante de
    pago, OC PDF y cerrar»). Los mensajes de la solicitud y del almacén son de
    antes de la OC; una vez creada, ya no se ofrecen.
  */
  const etapaDeSolicitud = ['revision_almacen', 'atendida_almacen', 'pendiente', 'aprobada', 'asignada'].includes(o.estado)
  const buttons = (
    <>
      {isPendiente ? (
        <Button
          variant="ghost"
          onClick={() => void armarPdf(`Solicitud de Pedido ${o.codigo}`, () => armarSolicitudPedidoPdf(o, empresaDelPapel(empresa)))}
          title="Descargar la Orden de Pedido en PDF"
        >
          ↓ PDF de la OP
        </Button>
      ) : null}
      {!etapaDeSolicitud ? null : !esServicio ? (
        <Button
          variant="ghost"
          title="Ver el mensaje de la Solicitud de Pedido (productos y cantidades) para copiarlo o mandarlo por WhatsApp"
          onClick={() => setMensajeWs({ titulo: `Solicitud de Pedido · ${o.codigo}`, texto: mensajeSolicitudPedido(o) })}
        >
          💬 WhatsApp de la SP
        </Button>
      ) : (
        <Button
          variant="ghost"
          title="Ver el mensaje de la solicitud de servicio (servicios, equipo y detalle) para copiarlo o mandarlo por WhatsApp"
          onClick={() => setMensajeWs({ titulo: `Solicitud de servicio · ${o.codigo}`, texto: mensajeSolicitudServicio(o) })}
        >
          💬 WhatsApp del servicio
        </Button>
      )}
      {revisadaAlmacen && etapaDeSolicitud ? (
        <Button
          variant="ghost"
          title="Ver el mensaje de almacén (qué tiene y qué va a solicitar a Compras) para copiarlo o mandarlo por WhatsApp"
          onClick={() => setMensajeWs({ titulo: `Revisión de almacén · ${o.codigo}`, texto: mensajeRevisionAlmacen(o) })}
        >
          💬 Mensaje de almacén
        </Button>
      ) : null}
      {canCancel ? (
        <Button variant="danger" onClick={onCancel}>
          Cancelar orden
        </Button>
      ) : null}

      {/* Cotización (fase 2) */}
      {(o.estado === 'aprobada' || o.estado === 'asignada') && permisos.compras ? (
        <Button
          variant="ghost"
          title="Descargar la solicitud en PDF (materiales, medidas y cantidades) para mandarla a cotizar"
          onClick={() => void armarPdf(`Solicitud de cotización ${o.codigo}`, () => armarSolicitudCotizacionPdf(o, empresaDelPapel(empresa)))}
        >
          ↓ PDF para cotizar
        </Button>
      ) : null}
      {(o.estado === 'aprobada' || o.estado === 'asignada') && canManageProcurement && !o.parent_orden_id ? (
        <Button
          title="Repartir los productos entre varios proveedores (una OC por proveedor)"
          onClick={() => setSub({ kind: 'asignar' })}
        >
          🧩 Asignar por producto (multi-proveedor)
        </Button>
      ) : null}

      {/* OC por aprobar */}
      {o.estado === 'oc_creada' && canManageProcurement ? (
        <>
          <Button variant="ghost" title="El proveedor no cumplió: la orden queda abierta para otro" onClick={() => setSub({ kind: 'desistir' })}>
            ⚠ Proveedor desistió
          </Button>
          <Button
            variant="ghost"
            title="Antes de aprobarla se corrige todo: unidad y persona que solicita, motivo, finalidad, proveedor, productos (marca, cantidad, precio), descuento, IVA e IGTF, condición y nota"
            onClick={() => setSub({ kind: 'editar_oc' })}
          >
            ✎ Editar OC (todo)
          </Button>
          <Button variant="ghost" title="Volver a las ofertas para elegir otra" onClick={() => setSub({ kind: 'reabrir' })}>
            ↩ Re-elegir oferta
          </Button>
          <Button variant="ghost" onClick={pdfOc}>
            ↓ OC PDF
          </Button>
          <Button variant="ghost" title="Mensaje para pedir la aprobación de la OC" onClick={whatsappAprobar}>
            💬 WhatsApp para aprobar
          </Button>
          <Button variant="danger" onClick={() => setSub({ kind: 'anular' })}>
            ⊘ Anular OC
          </Button>
        </>
      ) : null}
      {o.estado === 'oc_creada' && puedeAprobarOc ? (
        <Button
          className="bg-success hover:bg-success hover:brightness-95"
          disabled={aprobarOc.isPending}
          title="Aprobar la OC: «¿Se pagará esta OC?» Sí sigue según su condición de pago; No deja el motivo"
          onClick={onAprobarOc}
        >
          {aprobarOc.isPending ? 'Aprobando…' : '✔ Aprobar OC'}
        </Button>
      ) : null}

      {/* Confirmada (indicar método de pago) */}
      {o.estado === 'confirmada_metodo' && canManageProcurement ? (
        <>
          <Button variant="ghost" onClick={pdfOc}>
            ↓ OC PDF
          </Button>
          <Button variant="ghost" title="Un cambio material devuelve la OC a aprobación" onClick={() => setSub({ kind: 'editar_oc' })}>
            ✎ Modificar OC
          </Button>
          <Button onClick={() => setSub({ kind: 'metodo', modo: 'enviar' })}>💳 Indicar método de pago / Enviar para Pagar</Button>
        </>
      ) : null}

      {/* Confirmada pagar: en MGG la paga Tesorería; aquí, Compras */}
      {o.estado === 'oc_aprobada' ? (
        <>
          <Button variant="ghost" onClick={pdfOc}>
            ↓ OC PDF
          </Button>
          <Button variant="ghost" title="Mensaje con el monto a pagar y los datos del proveedor" onClick={() => setMensajeWs({ titulo: `Avisar para pagar · ${ocCodigo}`, texto: textoPago() })}>
            💬 WhatsApp para pagar
          </Button>
          {canManageProcurement ? (
            <Button variant="ghost" title="Corregir precios sin moverla; cambiar el proveedor o la condición la devuelve a aprobación" onClick={() => setSub({ kind: 'editar_oc' })}>
              ✎ Editar precios
            </Button>
          ) : null}
          {canManageProcurement ? (
            <Button variant="ghost" title="Corregir el método, los datos del proveedor, el documento y las retenciones" onClick={() => setSub({ kind: 'metodo', modo: 'corregir' })}>
              💳 Editar método de pago / datos
            </Button>
          ) : null}
          {puedeAprobarOc ? (
            <Button className="bg-success hover:bg-success hover:brightness-95" onClick={() => setSub({ kind: 'pagar' })}>
              💵 Marcar pagada
            </Button>
          ) : null}
        </>
      ) : null}

      {/* Crédito · cuenta abierta (y el crédito que sigue con saldo) */}
      {o.estado === 'cuenta_abierta' && permisos.compras ? (
        <>
          <Button variant="ghost" onClick={pdfOc}>
            ↓ OC PDF
          </Button>
          <Button variant="ghost" title="Mensaje con el saldo del crédito" onClick={() => setMensajeWs({ titulo: `Avisar para pagar · ${ocCodigo}`, texto: textoPago() })}>
            💬 WhatsApp para pagar
          </Button>
        </>
      ) : null}
      {esCredito(o) && ['cuenta_abierta', 'por_recibir', 'recibida'].includes(o.estado) && permisos.compras ? (
        <>
          <Button variant="ghost" onClick={() => setSub({ kind: 'credito' })}>
            📋 Ver crédito / historial
          </Button>
          {canManageProcurement && !o.pagada_en ? (
            <Button variant="ghost" title="Factura o nota de entrega, y las retenciones (se restan del total)" onClick={() => setSub({ kind: 'documento' })}>
              🧾 Documento y retenciones
            </Button>
          ) : null}
          {puedeAprobarOc && aceptaAbonos(o) ? (
            <Button className="bg-success hover:bg-success hover:brightness-95" onClick={() => setSub({ kind: 'abono' })}>
              💵 Registrar abono
            </Button>
          ) : null}
        </>
      ) : null}
      {o.estado === 'cuenta_abierta' && canManageProcurement && !o.recibida_en ? (
        <Button title="La orden sigue siendo a crédito: los abonos se siguen registrando" onClick={() => setSub({ kind: 'credito_recepcion' })}>
          {esServicio ? '🔧 Enviar a Pendiente por realizar' : '📦 Enviar a Pendiente por recepción'}
        </Button>
      ) : null}
      {servicioRealizable ? (
        <Button
          title="Dejar constancia de que el servicio se prestó (no entra al inventario)"
          onClick={() => setSub({ kind: 'realizado' })}
        >
          🔧 Servicio realizado
        </Button>
      ) : null}

      {/* Contra entrega ya recibida: se indica cómo pagar lo recibido */}
      {o.estado === 'recibida' && o.condiciones_pago === 'contra_entrega' && !o.metodo_pago?.length && canManageProcurement ? (
        <Button onClick={() => setSub({ kind: 'metodo', modo: 'enviar' })}>💳 Indicar método de pago (pagar lo recibido)</Button>
      ) : null}

      {['por_recibir', 'pagada', 'recibida', 'finalizada'].includes(o.estado) && (canManageProcurement || permisos.compras) ? (
        <Button variant="ghost" onClick={pdfOc}>
          ↓ OC PDF
        </Button>
      ) : null}
      {o.pagada_en && o.pago_monto_usd != null && permisos.compras ? (
        <>
          <Button
            variant="ghost"
            onClick={() =>
              o.pago_comprobante_path
                ? void abrirArchivoPago(o.pago_comprobante_path)
                : toast('No se adjuntó comprobante en este pago', 'info')
            }
          >
            📥 Comprobante de pago
          </Button>
          {o.estado === 'pagada' ? (
            <Button variant="ghost" onClick={() => setAvisoPaso({ tipo: 'pagada' })}>
              💬 Aviso de pago
            </Button>
          ) : null}
        </>
      ) : null}
      {/* Recepción y cierre (fase 4) */}
      {recibible ? (
        <Button title="La mercancía entra al inventario del Almacén General" onClick={() => setSub({ kind: 'recibir' })}>
          {o.estado === 'cuenta_abierta'
            ? '📦 Recibir (crédito pendiente)'
            : o.estado === 'pagada'
              ? 'Marcar recibida'
              : progreso.parcial
                ? '📦 Recibir lo que falta'
                : '📦 Confirmar recepción'}
        </Button>
      ) : null}
      {conRecepcion && !esServicio && (permisos.compras || permisos.recibe_almacen) ? (
        <Button variant="ghost" onClick={() => setSub({ kind: 'recepciones' })}>
          📥 Ver recepción
        </Button>
      ) : null}
      {/*
        Finalizada (la dueña, 09/11/2026: «muchos botones»): la factura en un
        solo botón —verla si está, cargarla si falta— y nada de avisos.
      */}
      {o.estado === 'finalizada' && o.factura_path && (permisos.compras || permisos.recibe_almacen) ? (
        <Button variant="ghost" onClick={() => void abrirArchivoRecepcion(o.factura_path!, o.factura_nombre)}>
          📎 Ver factura
        </Button>
      ) : null}
      {o.estado === 'finalizada' && !o.factura_path && canManageProcurement ? (
        <Button onClick={() => setSub({ kind: 'comprobante' })}>📎 Cargar factura / nota de entrega</Button>
      ) : null}
      {puedeFinalizarse(o) && canManageProcurement ? (
        <Button title="Confirmá que se recibió todo y evaluá al proveedor" onClick={() => setSub({ kind: 'finalizar' })}>
          ✓ Finalizar orden
        </Button>
      ) : null}

      {anulable ? (
        <Button variant="danger" onClick={() => setSub({ kind: 'anular' })}>
          ⊘ Anular OC
        </Button>
      ) : null}

      {canEditar ? (
        <Button variant="ghost" onClick={onEditar} title="Editar la orden antes de su aprobación">
          ✎ Editar orden
        </Button>
      ) : null}
      {canApprove ? (
        <Button
          className="bg-success hover:bg-success hover:brightness-95"
          onClick={onApprove}
          title="Aprobar la Orden de Pedido"
        >
          Aprobar Orden de Pedido
        </Button>
      ) : null}
      <Button variant="ghost" onClick={onClose}>
        Cerrar
      </Button>
    </>
  )

  const det = o.oferta_detalle
  const bcvOferta = Number(o.oferta_precio_bcv) || 0
  const efeOferta = Number(o.oferta_precio_efectivo) || 0

  return (
    <>
      <Modal
        abierto
        onCerrar={onClose}
        titulo={`Orden ${o.codigo}${esMercado(o) ? ' · 🛒 Mercado' : ''}${o.urgente ? ' · 🚨 URGENTE' : ''}`}
        ancho="lg"
        acciones={buttons}
      >
        {o.urgente ? (
          <div className="border-danger bg-danger/8 text-danger mb-3 rounded-[6px] border px-3 py-2 text-sm font-bold">
            🚨 ORDEN URGENTE — solicitud marcada como prioritaria.
          </div>
        ) : null}

        {enRevisionAlmacen ? (
          <div className="border-info bg-canvas mb-3 rounded-[6px] border px-3 py-2 text-sm font-semibold">
            ⏳ En revisión de almacén ({textoEstadoSedes(o)}): Compras la recibe cuando todos los almacenes confirmen.
            <div className="text-ink/55 text-xs font-normal">📍 Se necesita en Almacén General</div>
          </div>
        ) : null}

        {revisadaAlmacen ? (
          <div
            className={cn(
              'bg-canvas mb-3 rounded-[6px] border px-3 py-2 text-sm',
              o.estado === 'atendida_almacen' ? 'border-success' : 'border-info',
            )}
          >
            <div className="font-semibold">
              📦 Revisada por almacén
              {o.revisada_almacen_por_nombre ? <> · {o.revisada_almacen_por_nombre}</> : null}
              {o.revisada_almacen_en ? (
                <span className="text-ink/55 font-normal"> · {fechaHoraVE(o.revisada_almacen_en)}</span>
              ) : null}
            </div>
            <div className="text-ink/60 text-xs">
              {o.estado === 'atendida_almacen'
                ? 'Almacén tiene todo lo solicitado: no pasa a Compras.'
                : 'A Compras llega solo lo que falta (columna «A comprar»).'}
              {(() => {
                const n = o.items.filter((it) => repartoRenglon(it).almacen > 0).length
                return n > 0 ? <> Entrega: Almacén General {n} renglón(es).</> : null
              })()}
            </div>
            <div className="mt-1 text-xs">
              📍 Se necesita en <strong className="font-semibold">Almacén General</strong>
            </div>
            {o.salida_almacen_numero ? (
              <div className="mt-1 text-xs">
                📤 Sale por la solicitud de salida{' '}
                <strong className="font-mono font-semibold">{o.salida_almacen_numero}</strong>, a autorizar en Salidas.
              </div>
            ) : null}
            {o.nota_almacen?.trim() ? <div className="mt-1 text-xs whitespace-pre-wrap">📝 {o.nota_almacen}</div> : null}
          </div>
        ) : null}

        <div>
          {o.imagenes?.length ? (
            <Fila k="Imágenes de referencia">
              <div className="flex flex-wrap gap-1.5">
                {o.imagenes.map((a, i) => (
                  <Button key={a.path} size="sm" variant="ghost" onClick={() => void verImagen(a.path, false, a.filename)}>
                    📷 Ver imagen{o.imagenes.length > 1 ? ` ${i + 1}` : ''}
                  </Button>
                ))}
              </div>
            </Fila>
          ) : null}
          <Fila k="Código">
            <span className="font-mono">{o.codigo}</span>
          </Fila>
          <Fila k="Estado">
            <EstadoBadge estado={o.estado} />
            {o.estado === 'cuenta_abierta' && o.recibida_en ? (
              <Chip tone="info" className="ml-1.5">
                📦 Recibido · pendiente por pagar
              </Chip>
            ) : null}
            {progreso.parcial && !o.recibida_en ? (
              <Chip tone="warning" className="ml-1.5">
                📦 Recepción parcial · {progreso.completos}/{progreso.total} completos
              </Chip>
            ) : null}
          </Fila>
          <Fila k="Proveedor actual">
            {prov ? (
              <>
                {prov.nombre} <span className="text-ink/50">· {prov.rif}</span>
              </>
            ) : (
              '—'
            )}
          </Fila>
          <Fila k="Unidad solicitante">{o.unidad_solicitante ?? '—'}</Fila>
          <Fila k="Solicita">{o.solicitante_nombre ?? '—'}</Fila>
          <Fila k="Cargada por">{o.creado_por_nombre ?? '—'}</Fila>
          <Fila k="Creada">{fechaHoraVE(o.creado_en)}</Fila>
          {o.notas?.trim() ? <Fila k="Nota">{o.notas}</Fila> : null}
          {o.aprobada_en ? (
            <Fila k="Aprobada">
              {fechaHoraVE(o.aprobada_en)} <span className="text-ink/50">por {o.aprobada_por_nombre ?? '—'}</span>
            </Fila>
          ) : null}
          {o.rechazada_en ? (
            <Fila k="Rechazada">
              {fechaHoraVE(o.rechazada_en)} · {o.motivo_rechazo ?? ''}
            </Fila>
          ) : null}
          {o.cancelada_en ? (
            <Fila k="Cancelada">
              {fechaHoraVE(o.cancelada_en)} · {o.motivo_cancelacion ?? ''}{' '}
              <span className="text-ink/50">por {o.cancelada_por_nombre ?? '—'}</span>
            </Fila>
          ) : null}
          {o.oc_codigo ? (
            <Fila k="Código OC">
              <span className="font-mono">{o.oc_codigo}</span>
            </Fila>
          ) : null}
          {o.oc_creada_en ? (
            <Fila k="OC creada">
              {fechaHoraVE(o.oc_creada_en)} <span className="text-ink/50">por {o.oc_creada_por_nombre ?? '—'}</span>
            </Fila>
          ) : null}
          {o.oc_aprobada_en ? (
            <Fila k="OC confirmada">
              {fechaHoraVE(o.oc_aprobada_en)}{' '}
              <span className="text-ink/50">por {o.oc_aprobada_por_nombre ?? '—'}</span>
            </Fila>
          ) : null}
          {o.anulada_en ? (
            <Fila k="Anulada">
              {fechaHoraVE(o.anulada_en)} · {o.motivo_anulacion ?? ''}{' '}
              <span className="text-ink/50">por {o.anulada_por_nombre ?? '—'}</span>
            </Fila>
          ) : null}
          {o.oc_codigo || o.condiciones_pago ? (
            <Fila k="Condición de pago">
              <Chip tone="royal">{o.condiciones_pago ? labelCondicionPago(o.condiciones_pago) : 'Contado / anticipado'}</Chip>
            </Fila>
          ) : null}
          {det && (DATOS_TECNICOS.some((t) => det[t.clave]) || det.logistica || (bcvOferta > 0 && efeOferta > 0)) ? (
            <Fila k="Datos de la oferta">
              <div className="space-y-0.5 text-xs">
                {DATOS_TECNICOS.filter((t) => det[t.clave]).map((t) => (
                  <div key={t.clave}>
                    <strong>{t.label}:</strong> {det[t.clave]}
                  </div>
                ))}
                {LOGISTICA.filter((l) => det.logistica?.[l.clave]).map((l) => (
                  <div key={l.clave}>
                    🚚 <strong>{l.label}:</strong> {det.logistica?.[l.clave] === 'incluido' ? 'incluido' : 'por cuenta del comprador'}
                  </div>
                ))}
                {bcvOferta > 0 && efeOferta > 0 && efeOferta < bcvOferta ? (
                  <div>
                    💵 Efectivo: {money(efeOferta)}{' '}
                    <Chip tone="success">−{Math.round(((bcvOferta - efeOferta) / bcvOferta) * 100)}%</Chip>{' '}
                    <span className="text-ink/50">(BCV {money(bcvOferta)})</span>
                  </div>
                ) : null}
              </div>
            </Fila>
          ) : null}
          {o.modalidad_pago && (o.oc_codigo || o.oc_creada_en) ? (
            <Fila k="Modalidad de pago">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={o.modalidad_pago === 'usd' ? 'success' : 'info'}>
                  {infoModalidad(o.modalidad_pago).icono} {infoModalidad(o.modalidad_pago).larga} · {money(o.total)}
                </Chip>
                {o.modalidad_pago === 'usd' && bcvOferta > 0 ? (
                  <span className="text-ink/50 text-xs">(Cotización original a tasa BCV: {money(bcvOferta)})</span>
                ) : null}
                {(o.estado === 'oc_creada' || o.estado === 'confirmada_metodo') && canManageProcurement ? (
                  <Button size="sm" variant="ghost" disabled={cambiarModalidad.isPending} onClick={() => void onCambiarModalidad()}>
                    {o.modalidad_pago === 'usd' ? '🔄 Cambiar a Pago en Bs (BCV)' : '🔄 Cambiar a Pago en $ (Divisa)'}
                  </Button>
                ) : null}
              </div>
            </Fila>
          ) : null}
          {o.metodo_pago?.length ? (
            <Fila k="Método de pago">
              {o.metodo_pago.map((m, i) => (
                <div key={i}>
                  💳 {nombreMetodoPago(m.metodo, m.detalle)}
                  {Number(m.monto) > 0 ? ` · ${m.moneda === 'USD' ? money(m.monto) : `${m.moneda} ${Number(m.monto).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`}` : ` · ${m.moneda}`}
                  {m.datos && resumenDatosPago(m.metodo, m.datos) ? (
                    <div className="text-ink/55 pl-5 text-xs">↳ {resumenDatosPago(m.metodo, m.datos)}</div>
                  ) : null}
                </div>
              ))}
              {o.metodo_pago_en ? (
                <div className="text-ink/50 text-xs">
                  indicado {fechaHoraVE(o.metodo_pago_en)} por {o.metodo_pago_por_nombre ?? '—'}
                </div>
              ) : null}
              {o.pago_qr_path ? (
                <Button size="sm" variant="ghost" onClick={() => void abrirArchivoPago(o.pago_qr_path!, o.pago_qr_nombre)}>
                  📷 Ver QR / imagen de pago
                </Button>
              ) : null}
            </Fila>
          ) : null}
          {o.numero_administracion ? <Fila k="📞 Tel. administración">{o.numero_administracion}</Fila> : null}
          {o.comprobante_tipo ? (
            <Fila k="Documento">
              <Chip tone="neutral">🧾 {etiquetaDocumento(o.comprobante_tipo)}</Chip>
            </Fila>
          ) : null}
          {o.retenciones?.length ? (
            <Fila k="Retenciones">
              {o.retenciones.map((r) => (
                <div key={r.tipo}>
                  {labelRetencion(r)}
                  {r.modo === 'porcentaje' && r.base != null ? <span className="text-ink/50"> sobre {money(r.base)}</span> : null}{' '}
                  <strong className="text-danger font-mono">− {money(r.monto)}</strong>
                  {r.moneda === 'Bs' && Number(r.monto_bs) > 0 ? (
                    <span className="text-ink/60 text-xs"> · se paga en {moneyBs(r.monto_bs)}</span>
                  ) : null}
                </div>
              ))}
            </Fila>
          ) : null}
          {Number(o.iva_factura) > 0 ? (
            <Fila k="IVA de la factura">
              + {money(o.iva_factura)} · <span className="text-ink/50">total con IVA {money(basesPago(o).total)}</span>
            </Fila>
          ) : null}
          {Number(o.descuento_pago) > 0 ? (
            <Fila k="Descuento en el pago">
              − {money(o.descuento_pago)} · <span className="text-ink/50">total OC {money(basesPago(o).total)} (no cambia)</span>
            </Fila>
          ) : null}
          {o.metodo_pago?.length || o.retenciones?.length || Number(o.descuento_pago) > 0 || esCredito(o) ? (
            ['confirmada_metodo', 'oc_aprobada', 'cuenta_abierta', 'por_recibir', 'pagada', 'recibida', 'finalizada'].includes(o.estado) ? (
              <Fila k="Monto a pagar">
                <strong className="text-success font-mono">{money(montoAPagar(o))}</strong>
                {o.retenciones?.length || Number(o.descuento_pago) > 0 ? (
                  <span className="text-ink/50 text-xs"> (total − retenciones{Number(o.descuento_pago) > 0 ? ' − descuento' : ''})</span>
                ) : null}
              </Fila>
            ) : null
          ) : null}
          {esCredito(o) && ['cuenta_abierta', 'por_recibir', 'recibida', 'pagada', 'finalizada'].includes(o.estado) ? (
            <Fila k="Abonado (crédito)">
              {money(o.abonado_total)} de {money(montoAPagar(o))}{' '}
              {saldoCredito(o) > 0.01 ? (
                <Chip tone="warning">Saldo {money(saldoCredito(o))}</Chip>
              ) : (
                <Chip tone="success">✓ Saldado</Chip>
              )}
            </Fila>
          ) : null}
          {o.pagada_en && o.pago_monto_usd != null ? (
            <Fila k="Pagada">
              {o.pago_fecha ? o.pago_fecha.split('-').reverse().join('/') : fechaHoraVE(o.pagada_en)} · {money(o.pago_monto_usd)}
              {o.pago_moneda === 'Bs' ? (
                <span className="text-ink/50">
                  {' '}
                  (Bs {Number(o.pago_monto).toLocaleString('es-VE', { minimumFractionDigits: 2 })} a {Number(o.pago_tasa).toLocaleString('es-VE')})
                </span>
              ) : null}
              {o.pago_referencia ? <> · ref. <span className="font-mono">{o.pago_referencia}</span></> : null}
              <span className="text-ink/50"> · registró {o.pagada_por_nombre ?? '—'}</span>
              {o.pago_nota ? <div className="text-ink/60 text-xs">📝 {o.pago_nota}</div> : null}
            </Fila>
          ) : o.pagada_en && esCredito(o) ? (
            <Fila k="Pagada">
              {fechaHoraVE(o.pagada_en)} <span className="text-ink/50">· crédito saldado con abonos</span>
            </Fila>
          ) : null}
          {conRecepcion ? (
            <Fila k={esServicio ? 'Servicio realizado' : 'Recepción'}>
              {o.recibida_en ? (
                <>
                  {fechaHoraVE(o.recibida_en)} <span className="text-ink/50">por {o.recibida_por_nombre ?? '—'}</span>
                </>
              ) : (
                <span className="text-warning">Parcial: falta mercancía por llegar</span>
              )}
              <div>
                Total recibido: <strong className="font-mono">{money(o.recibido_total)}</strong>{' '}
                <span className="text-ink/50">· de {money(o.total)}</span>
              </div>
            </Fila>
          ) : null}
          {conRecepcion && !esServicio ? <Fila k="Almacén destino">📦 {ETIQUETA_ALMACEN}</Fila> : null}
          {o.nota_recepcion?.trim() ? (
            <Fila k="Nota de recepción">
              <span className="whitespace-pre-wrap">{o.nota_recepcion}</span>
            </Fila>
          ) : null}
          {o.recepcion_fotos?.length ? (
            <Fila k="Fotos de la recepción">
              <div className="flex flex-wrap gap-1.5">
                {o.recepcion_fotos.map((f, i) => (
                  <Button key={f.path} size="sm" variant="ghost" onClick={() => void abrirArchivoRecepcion(f.path)}>
                    📷 {f.recepcion ? `R${f.recepcion} · ` : ''}Foto {i + 1}
                  </Button>
                ))}
              </div>
            </Fila>
          ) : null}
          {o.factura_path ? (
            <Fila k={o.factura_tipo === 'nota_entrega' ? 'Nota de entrega' : 'Factura'}>
              <Button size="sm" variant="ghost" onClick={() => void abrirArchivoRecepcion(o.factura_path!, o.factura_nombre)}>
                📎 {o.factura_nombre ?? 'Ver'}
              </Button>
            </Fila>
          ) : null}
          {o.finalizada_en ? (
            <Fila k="Finalizada">
              {fechaHoraVE(o.finalizada_en)} <span className="text-ink/50">por {o.finalizada_por_nombre ?? '—'}</span>
            </Fila>
          ) : null}
          {evaluacion ? (
            <Fila k="Evaluación del proveedor">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Estrellas soloLectura size="sm" label="Calidad" value={evaluacion.calidad} etiquetas={CALIDAD_ESTRELLAS} />
                {evaluacion.puntualidad != null ? (
                  <Estrellas soloLectura size="sm" label="Puntualidad" value={evaluacion.puntualidad} etiquetas={PUNTUALIDAD_LABEL} />
                ) : null}
              </div>
              <div className="text-ink/60 text-xs">🕒 {textoPuntualidad(evaluacion.puntualidad_dias)}</div>
              {evaluacion.comentario ? <div className="text-ink/60 text-xs">📝 {evaluacion.comentario}</div> : null}
            </Fila>
          ) : null}
          {o.oferta_motivo?.trim() || o.oferta_motivo_adjuntos?.length ? (
            <Fila k="📝 Motivo de elección">
              {o.oferta_motivo ? <div>{o.oferta_motivo}</div> : null}
              <div className="flex flex-wrap gap-1">
                {(o.oferta_motivo_adjuntos ?? []).map((a) => (
                  <Button key={a.path} size="sm" variant="ghost" onClick={() => void verImagen(a.path, true, a.filename)}>
                    📎 {a.filename}
                  </Button>
                ))}
              </div>
            </Fila>
          ) : null}
          {o.motivo?.trim() ? <Fila k="Motivo">{o.motivo}</Fila> : null}
          {o.finalidad?.trim() ? <Fila k="Finalidad">{o.finalidad}</Fila> : null}
        </div>

        {/* 🧩 Sub-órdenes por proveedor */}
        {misHijas.length ? (
          <Card className="mt-5">
            <h4 className="text-ink/85 mb-2 font-semibold">🧩 Sub-órdenes por proveedor ({misHijas.length})</h4>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-ink/55 text-left text-xs">
                  <tr>
                    <th className="py-1 pr-2">OC</th>
                    <th className="py-1 pr-2">Proveedor</th>
                    <th className="py-1 pr-2 text-right">Productos</th>
                    <th className="py-1 pr-2 text-right">Total</th>
                    <th className="py-1">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {misHijas.map((h) => (
                    <tr key={h.id} className="border-hairline hover:bg-ink/3 cursor-pointer border-t" onClick={() => onAbrir(h.id)}>
                      <td className="py-1.5 pr-2 font-mono text-xs">
                        {h.oc_codigo ?? '—'}
                        <div className="text-ink/45">{h.codigo}</div>
                      </td>
                      <td className="py-1.5 pr-2">{proveedorDe(h.proveedor_id)?.nombre ?? '—'}</td>
                      <td className="py-1.5 pr-2 text-right">{h.items.filter((i) => i.comprar !== false).length}</td>
                      <td className="py-1.5 pr-2 text-right font-mono">{money(h.total)}</td>
                      <td className="py-1.5">
                        <EstadoBadge estado={h.estado} />
                        {!esHijaViva(h) ? <span className="text-ink/45 ml-1 text-xs">(sus productos vuelven a esta OP)</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-ink/55 mt-2 text-xs">Cada sub-OC se confirma, paga y recibe por separado (método de pago por proveedor).</p>
            {pendientesMadre.length ? (
              <div className="border-warning bg-warning/6 mt-2 rounded-[6px] border px-3 py-2">
                <div className="font-semibold">
                  ⚠ {pendientesMadre.length} ítem(s) sin asignar — la SP sigue en «Pendiente (cargar ofertas)»
                </div>
                <ul className="text-ink/70 ml-4 list-disc text-xs">
                  {pendientesMadre.map((it) => (
                    <li key={it.sku}>
                      {it.nombre} · {fmtCant(it.cantidad)} {it.unidad ?? ''}
                    </li>
                  ))}
                </ul>
                {canManageProcurement && ['aprobada', 'asignada', 'desistida_proveedor'].includes(o.estado) ? (
                  <Button size="sm" className="mt-1" onClick={() => setSub({ kind: 'asignar' })}>
                    🧩 Asignar / cargar ofertas de lo que falta
                  </Button>
                ) : null}
              </div>
            ) : null}
          </Card>
        ) : null}

        {veOfertas ? (
          <OfertasComparativa
            orden={o}
            madre={madre}
            hijas={hijas}
            ofertas={ofertas}
            cargando={ofertasQ.isPending}
            stats={stats ?? []}
            proveedorDe={proveedorDe}
            canDecidir={canManageProcurement}
            onAgregar={() => setSub({ kind: 'oferta', oferta: null })}
            onEditar={(f) => setSub({ kind: 'oferta', oferta: f })}
            onAceptar={(s) => setSub({ kind: 'aceptar', scored: s })}
            onIrMadre={() => onAbrir(madre.id)}
          />
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-ink/85 font-semibold">
            Ítems
            {o.sin_inventario ? (
              <Chip tone="warning" className="ml-2">
                📦 Sin inventario
              </Chip>
            ) : null}
          </h4>
          {canEditarCant ? (
            editandoCant ? (
              <span className="inline-flex items-center gap-2">
                {skusAEliminar.size > 0 ? <Chip tone="danger">{skusAEliminar.size} por eliminar</Chip> : null}
                <Button size="sm" variant="ghost" onClick={cerrarEdicionCant} disabled={editarCantidades.isPending}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={() => void guardarCantidades()} disabled={editarCantidades.isPending}>
                  {editarCantidades.isPending ? 'Guardando…' : '✓ Guardar cambios'}
                </Button>
              </span>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={abrirEdicionCant}
                title="Editar las cantidades de la SP o eliminar productos antes de elegir el proveedor"
              >
                ✎ Cantidades
              </Button>
            )
          ) : null}
        </div>

        <div className="border-hairline mt-2 overflow-x-auto rounded-[6px] border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-ink/4 text-ink/55 text-left text-xs">
              <tr>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 font-medium">Categoría</th>
                <th className="px-3 py-2 font-medium">Subcategoría</th>
                {revisadaAlmacen ? (
                  <>
                    <th className="px-3 py-2 text-right font-medium">Solicitado</th>
                    <th className="px-3 py-2 text-right font-medium">Almacén tiene</th>
                  </>
                ) : null}
                <th className="px-3 py-2 text-right font-medium">{revisadaAlmacen ? 'A comprar' : 'Cantidad'}</th>
                {conRecepcion ? <th className="px-3 py-2 text-right font-medium">Recibido</th> : null}
                {conPrecio ? (
                  <>
                    <th className="px-3 py-2 text-right font-medium">Precio</th>
                    <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                  </>
                ) : (
                  <th className="px-3 py-2 text-right font-medium">Comprar</th>
                )}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {o.items.map((it, idx) => {
                const marcado = skusAEliminar.has(it.sku)
                const u = it.unidad_compra ? ` ${it.unidad_compra}` : it.unidad ? ` ${it.unidad}` : ''
                return (
                  <tr
                    key={`${it.sku}-${idx}`}
                    className="border-hairline border-t"
                    style={{ opacity: marcado ? 0.45 : it.comprar === false ? 0.5 : 1 }}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{it.sku}</td>
                    <td className={cn('px-3 py-2', marcado && 'line-through')}>
                      {it.nombre}
                      {it.general && !it.articulo_id ? (
                        <Chip
                          tone="warning"
                          className="ml-1.5"
                          title="Nombre general: no es un producto del inventario. Compras fija el nombre de inventario al cotizar."
                        >
                          nombre general
                        </Chip>
                      ) : null}
                      {it.agregado ? (
                        <Chip tone="info" className="ml-1.5" title="El proveedor lo agregó en su cotización">
                          agregado
                        </Chip>
                      ) : null}
                      {it.articulo_nombre && it.articulo_nombre !== it.nombre ? (
                        <div className="text-ink/55 text-xs">📦 Se guarda en inventario como {it.articulo_nombre}</div>
                      ) : null}
                      {[it.marca, it.modelo].filter(Boolean).length > 0 ? (
                        <div className="text-ink/55 text-xs">🏷 {[it.marca, it.modelo].filter(Boolean).join(' · ')}</div>
                      ) : null}
                      {it.unidad_compra && it.factor_compra ? (
                        <div className="text-ink/55 text-xs">
                          1 {it.unidad_compra} = {fmtCant(it.factor_compra)} {it.unidad}
                        </div>
                      ) : null}
                      {it.finalidad ? <div className="text-ink/55 text-xs">🎯 {it.finalidad}</div> : null}
                      {esServicio && it.equipo_nombre ? <div className="text-ink/55 text-xs">🚜 {it.equipo_nombre}</div> : null}
                      {it.detalle_items?.length ? (
                        <ul className="text-ink/55 ml-4 list-disc text-xs">
                          {it.detalle_items.map((d, k) => (
                            <li key={k}>
                              {d.descripcion}
                              {d.cantidad != null ? ` · ${fmtCant(d.cantidad)}` : ''}
                              {d.precio != null ? ` · ${money(d.precio)}` : ''}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {it.marca_recibida ? (
                        <div className="text-warning text-xs">
                          ⚠ Pedido: {it.marca ?? '—'} · Recibido: {it.marca_recibida}
                          {it.nota_marca ? ` — ${it.nota_marca}` : ''}
                        </div>
                      ) : null}
                      {it.sin_inventario ? (
                        <Chip tone="warning" className="ml-1.5" title="No entra al inventario (servicio o consumo inmediato)">
                          sin inventario
                        </Chip>
                      ) : null}
                      {it.ficha_creada ? (
                        <Chip tone="info" className="ml-1.5" title="La ficha de inventario se creó al recibir">
                          ficha nueva
                        </Chip>
                      ) : null}
                      {it.almacen_sin_salida ? (
                        <div className="text-warning text-xs">
                          ⚠ La salida {it.almacen_sin_salida} no se aprobó: volvió a Compras
                        </div>
                      ) : null}
                    </td>
                    {/* MGG: en un servicio, Categoría y Subcategoría son la categoría y el tipo de servicio. */}
                    <td className="text-ink/65 px-3 py-2 text-xs">
                      {esServicio
                        ? (it.servicio_categoria ?? '—')
                        : it.articulo_id
                          ? (categoriaDe.get(it.articulo_id) ?? '—')
                          : '—'}
                    </td>
                    <td className={cn('px-3 py-2 text-xs', esServicio && it.servicio_tipo ? 'text-ink/65' : 'text-ink/40')}>
                      {esServicio ? (it.servicio_tipo ?? '—') : '—'}
                    </td>
                    {revisadaAlmacen ? (
                      <>
                        <td className="px-3 py-2 text-right">
                          {it.cantidad_solicitada != null ? `${fmtCant(it.cantidad_solicitada)} ${it.unidad ?? ''}` : '—'}
                        </td>
                        <td
                          className={cn(
                            'px-3 py-2 text-right',
                            Number(it.cantidad_almacen) > 0 && 'text-success font-semibold',
                          )}
                        >
                          {it.cantidad_almacen != null ? `${fmtCant(it.cantidad_almacen)} ${it.unidad ?? ''}` : '—'}
                        </td>
                      </>
                    ) : null}
                    <td className="px-3 py-2 text-right">
                      {editandoCant ? (
                        <span className="inline-flex items-center justify-end gap-1">
                          <input
                            inputMode="decimal"
                            className="border-ink/20 w-20 rounded border px-1.5 py-0.5 text-right font-mono"
                            value={cantDraft[it.sku] ?? ''}
                            disabled={editarCantidades.isPending}
                            onChange={(e) => setCantDraft((d) => ({ ...d, [it.sku]: comoNumero(e.target.value, { maxDecimales: 4, sinNegativos: true }) }))}
                          />
                          {it.unidad ? <span className="text-ink/50 text-xs">{it.unidad}</span> : null}
                        </span>
                      ) : (
                        <>
                          {fmtCant(it.cantidad)}
                          {u}
                        </>
                      )}
                    </td>
                    {conRecepcion ? (
                      <td
                        className={cn(
                          'px-3 py-2 text-right',
                          it.comprar !== false && recibidoDe(it) < Number(it.cantidad) ? 'text-warning' : 'text-success',
                        )}
                      >
                        {it.comprar === false ? '—' : fmtCant(recibidoDe(it))}
                      </td>
                    ) : null}
                    {conPrecio ? (
                      <>
                        <td className="px-3 py-2 text-right">{money(it.precio)}</td>
                        <td className="px-3 py-2 text-right">{money(Number(it.cantidad) * Number(it.precio))}</td>
                      </>
                    ) : (
                      <td className="px-3 py-2 text-right">
                        {puedeEditarComprar ? (
                          <input
                            type="checkbox"
                            className="accent-royal-600 size-4 cursor-pointer"
                            checked={it.comprar !== false}
                            disabled={marcarComprar.isPending}
                            title={it.comprar === false ? 'Marcar para comprar' : 'Quitar de la compra'}
                            onChange={(e) => void toggleComprar(it.sku, e.target.checked)}
                          />
                        ) : it.comprar === false ? (
                          '—'
                        ) : (
                          '✓'
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {editandoCant ? (
                        marcado ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Deshacer: volver a incluir este producto"
                            onClick={() =>
                              setSkusAEliminar((s) => {
                                const n = new Set(s)
                                n.delete(it.sku)
                                return n
                              })
                            }
                          >
                            ↩ deshacer
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger"
                            title="Eliminar este producto de la solicitud"
                            onClick={() => setPorEliminar(it)}
                          >
                            🗑
                          </Button>
                        )
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {conPrecio ? (
              <tfoot className="text-sm">
                {(
                  [
                    [desglose.ivaIncluido ? 'Base (precios con IVA)' : 'Base', money(desglose.subtotal), ''],
                    desglose.descuento ? ['Descuento obtenido', `−${money(desglose.descuento)}`, 'text-success'] : null,
                    desglose.iva ? [desglose.ivaIncluido ? 'IVA (incluido en los precios) · ya sumado' : 'IVA', money(desglose.iva), ''] : null,
                    desglose.igtf ? ['IGTF', money(desglose.igtf), ''] : null,
                    desglose.ajuste ? [o.ajuste_motivo ? `Ajuste · ${o.ajuste_motivo}` : 'Ajuste', money(desglose.ajuste), ''] : null,
                  ].filter((x): x is string[] => !!x && (desglose.total !== desglose.subtotal || desglose.ivaIncluido))
                ).map(([k, v, c]) => (
                  <tr key={k} className="border-hairline border-t">
                    <td colSpan={(revisadaAlmacen ? 8 : 6) + (conRecepcion ? 1 : 0)} className="text-ink/60 px-3 py-1.5 text-right">
                      {k}
                    </td>
                    <td className={cn('px-3 py-1.5 text-right', c)}>{v}</td>
                    <td />
                  </tr>
                ))}
                <tr className="border-hairline border-t font-semibold">
                  <td colSpan={(revisadaAlmacen ? 8 : 6) + (conRecepcion ? 1 : 0)} className="px-3 py-2 text-right">
                    TOTAL
                  </td>
                  <td className={cn('px-3 py-2 text-right', !desglose.cuadra && 'text-warning')}>{money(o.total)}</td>
                  <td />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
        {aviso ? <p className="text-warning mt-1 text-xs">⚠ {aviso}</p> : null}

        {o.estado === 'oc_creada' && o.no_pago_motivo ? (
          <div
            className={cn(
              'mt-4 rounded-[8px] border px-3 py-2.5 text-sm',
              o.no_pago_motivo === 'no_procede' ? 'border-danger bg-danger/6' : 'border-warning bg-warning/6',
            )}
          >
            <strong>
              {MOTIVO_NO_PAGO[o.no_pago_motivo].icono}{' '}
              {o.no_pago_motivo === 'no_procede' ? 'No procede esta compra' : 'No se pagará por ahora'}
            </strong>
            <span className="text-ink/75"> · {textoNoPago(o)}</span>
            <div className="text-ink/55 text-xs">
              {o.no_pago_por_nombre ?? '—'} · {fechaHoraVE(o.no_pago_en)}
              {o.no_pago_motivo === 'no_procede'
                ? ' · el analista cancela la OC o busca otra cotización'
                : ' · se aprueba cuando se pueda pagar'}
            </div>
          </div>
        ) : null}

        {o.oc_codigo ? <DevolucionesDeOrden orden={o} puedeDecidir={canManageProcurement} /> : null}

        <h4 className="text-ink/85 mt-6 mb-2 font-semibold">Historial</h4>
        {historial.length === 0 ? (
          <p className="text-ink/50 text-sm">Sin eventos registrados.</p>
        ) : (
          <ol className="border-hairline ml-1.5 space-y-3 border-l pl-4">
            {historial.map((h, i) => (
              <li key={`${h.at}-${i}`} className="relative">
                <span
                  className={cn(
                    'absolute top-1.5 -left-[21px] size-2.5 rounded-full ring-2 ring-[var(--color-surface,white)]',
                    PUNTO[claseEvento(h.evento)],
                  )}
                  aria-hidden="true"
                />
                <div className="text-ink/85 text-sm">
                  {etiquetaEvento(h.evento)}
                  {extraEvento(h)}
                </div>
                {h.evento === 'oc_reabierta' && typeof h.confirmada_por === 'string' ? (
                  <div className="text-warning text-xs">↩ Vuelve a cotizar · se anula la confirmación de {h.confirmada_por}</div>
                ) : null}
                {h.evento === 'oc_reabierta_edicion' && typeof h.confirmada_por === 'string' ? (
                  <div className="text-warning text-xs">↩ Vuelve a aprobación · se anula la confirmación de {h.confirmada_por}</div>
                ) : null}
                <div className="text-ink/50 text-xs">
                  {fechaHoraVE(h.at)} · {h.actor_nombre ?? '—'}
                </div>
              </li>
            ))}
          </ol>
        )}

      </Modal>

      {porEliminar ? (
        <ConfirmDialog
          title="Eliminar producto de la solicitud"
          message={`¿Eliminar "${porEliminar.nombre}"${porEliminar.sku ? ` (${porEliminar.sku})` : ''} de ${o.codigo}?\n\nSale de la solicitud y las ofertas cargadas se recalculan sin él: su presupuesto baja y el IVA/IGTF se ajusta a lo que queda.\n\nSe aplica al guardar los cambios.`}
          confirmText="Eliminar producto"
          danger
          onCancel={() => setPorEliminar(null)}
          onConfirm={() => {
            setSkusAEliminar((s) => new Set(s).add(porEliminar.sku))
            setPorEliminar(null)
          }}
        />
      ) : null}

      {sub.kind === 'oferta' ? (
        <AgregarOfertaModal
          orden={o}
          madre={madre}
          ofertas={ofertas}
          oferta={sub.oferta}
          soloSkus={sub.soloSkus}
          skusTomados={new Set(hijas.filter(esHijaViva).flatMap((h) => h.items.map((i) => i.sku)))}
          onClose={() => setSub(sub.volverAAsignar ? { kind: 'asignar' } : { kind: 'none' })}
          onSaved={() => setSub(sub.volverAAsignar ? { kind: 'asignar' } : { kind: 'none' })}
        />
      ) : null}

      {sub.kind === 'aceptar' ? (
        <AceptarOfertaModal
          orden={o}
          madre={madre}
          hijas={hijas}
          scored={sub.scored}
          proveedorNombre={proveedorDe(sub.scored.oferta.proveedor_id)?.nombre ?? 'Proveedor'}
          onClose={() => setSub({ kind: 'none' })}
          onDone={() => setSub({ kind: 'none' })}
        />
      ) : null}

      {sub.kind === 'asignar' ? (
        <AsignarProveedoresModal
          madre={madre}
          hijas={hijas}
          ofertas={ofertas}
          stats={stats ?? []}
          proveedorDe={proveedorDe}
          onCargarOferta={(skus) => setSub({ kind: 'oferta', oferta: null, soloSkus: skus, volverAAsignar: true })}
          onClose={() => setSub({ kind: 'none' })}
          onDone={() => setSub({ kind: 'none' })}
        />
      ) : null}

      {sub.kind === 'editar_oc' ? (
        <EditarOcModal
          orden={o}
          proveedores={proveedores ?? []}
          onClose={() => setSub({ kind: 'none' })}
          onDone={() => setSub({ kind: 'none' })}
        />
      ) : null}

      {sub.kind === 'desistir' ? (
        <MotivoModal
          title={`Desistimiento · ${o.codigo}`}
          intro="Registra que el proveedor no cumplió. La orden quedará abierta para reasignar a otro proveedor."
          label="¿Por qué no cumplió?"
          placeholder="No respondió, no entregó a tiempo, retiró la propuesta…"
          confirmText="Registrar desistimiento"
          busy={desistir.isPending}
          onClose={() => setSub({ kind: 'none' })}
          onConfirm={async (motivo) => {
            try {
              await desistir.mutateAsync({ id: o.id, motivo })
              toast(`Proveedor desistió en ${o.codigo} · abierta para reasignar`, 'warning')
              setSub({ kind: 'none' })
            } catch (e) {
              toast(mensajeDe(e, 'No se pudo registrar el desistimiento'), 'error')
            }
          }}
        />
      ) : null}

      {sub.kind === 'anular' ? (
        <MotivoModal
          title={`Anular OC · ${ocCodigo}`}
          intro="La OC pasa a estado ANULADA y no continúa el flujo. No mueve inventario ni caja."
          label="Motivo de la anulación"
          placeholder="Ya no se requiere, error de carga, se reemplaza por otra…"
          confirmText="Anular OC"
          doubleConfirm={`¿Seguro que querés anular la OC ${ocCodigo}? Esta acción no se puede deshacer.`}
          busy={anular.isPending}
          onClose={() => setSub({ kind: 'none' })}
          onConfirm={async (motivo) => {
            try {
              await anular.mutateAsync({ id: o.id, motivo })
              toast(`OC anulada: ${ocCodigo}`, 'warning')
              setSub({ kind: 'none' })
            } catch (e) {
              toast(mensajeDe(e, 'No se pudo anular la OC'), 'error')
            }
          }}
        />
      ) : null}

      {sub.kind === 'reabrir' ? (
        <ConfirmDialog
          title={`Modificar OC · ${ocCodigo}`}
          message="La OC vuelve a “Pendiente · cargar ofertas”: se reabren las ofertas de los proveedores para que elijas de nuevo la ganadora. ¿Continuar?"
          confirmText="Modificar (volver a ofertas)"
          busy={reabrir.isPending}
          onCancel={() => setSub({ kind: 'none' })}
          onConfirm={async () => {
            try {
              await reabrir.mutateAsync({ id: o.id, motivo: null })
              toast(`OC ${ocCodigo} reabierta para re-elegir oferta`, 'info')
              setSub({ kind: 'none' })
            } catch (e) {
              toast(mensajeDe(e, 'No se pudo reabrir la OC'), 'error')
            }
          }}
        />
      ) : null}

      {sub.kind === 'metodo' ? (
        <MetodoPagoModal
          orden={o}
          proveedor={prov}
          modo={sub.modo}
          onClose={() => setSub({ kind: 'none' })}
          onListo={() => {
            setSub({ kind: 'none' })
            setAvisoPaso({ tipo: 'pago' })
          }}
          onReabrir={async (motivo) => {
            await reabrir.mutateAsync({ id: o.id, motivo })
            toast(`OC ${ocCodigo} · cambio de proveedor: vuelve a «cargar ofertas» para escoger nueva cotización`, 'info')
            setSub({ kind: 'none' })
          }}
        />
      ) : null}

      {sub.kind === 'pagar' ? (
        <MarcarPagadaModal
          orden={o}
          onClose={() => setSub({ kind: 'none' })}
          onListo={() => {
            setSub({ kind: 'none' })
            setAvisoPaso({ tipo: 'pagada' })
          }}
        />
      ) : null}

      {sub.kind === 'abono' ? (
        <AbonoModal
          orden={o}
          onClose={() => setSub({ kind: 'none' })}
          onListo={(a) => {
            setSub({ kind: 'none' })
            setAvisoPaso({ tipo: 'abono', abono: a })
          }}
        />
      ) : null}

      {sub.kind === 'credito' ? (
        <CreditoModal
          orden={o}
          puedeAbonar={puedeAprobarOc && aceptaAbonos(o)}
          onAbonar={() => setSub({ kind: 'abono' })}
          onClose={() => setSub({ kind: 'none' })}
        />
      ) : null}

      {sub.kind === 'documento' ? (
        <DocumentoRetencionesModal orden={o} onClose={() => setSub({ kind: 'none' })} onListo={() => setSub({ kind: 'none' })} />
      ) : null}

      {sub.kind === 'credito_recepcion' ? (
        <ConfirmDialog
          title={`${esServicio ? 'Enviar a Pendiente por realizar' : 'Enviar a Pendiente por recepción'} · ${ocCodigo}`}
          message={
            esServicio
              ? `El servicio pasa a «Pendiente por realizar»: Compras confirma que se prestó. Sigue siendo a crédito: los abonos se siguen registrando mientras haya saldo (hoy ${money(saldoCredito(o))}). ¿Continuar?`
              : `La OC pasa a «Pendiente por recepción» y el almacén recibe el aviso. Sigue siendo a crédito: los abonos se siguen registrando mientras haya saldo (hoy ${money(saldoCredito(o))}). ¿Continuar?`
          }
          confirmText={esServicio ? '🔧 Enviar a Pendiente por realizar' : '📦 Enviar a Pendiente por recepción'}
          busy={creditoARecepcion.isPending}
          onCancel={() => setSub({ kind: 'none' })}
          onConfirm={async () => {
            try {
              await creditoARecepcion.mutateAsync(o.id)
              toast(`OC ${ocCodigo} (crédito) · pendiente por recepción`, 'success')
              setSub({ kind: 'none' })
            } catch (e) {
              toast(mensajeDe(e, 'No se pudo enviar a recepción'), 'error')
            }
          }}
        />
      ) : null}

      {sub.kind === 'recibir' ? (
        <RecibirOrdenModal
          orden={o}
          proveedor={prov ? `${prov.nombre} · ${prov.rif}` : null}
          onCancel={() => setSub({ kind: 'none' })}
          onHecho={(r) => {
            setSub({ kind: 'none' })
            setAvisoPaso({ tipo: 'recepcion', recepcion: r.recepcion })
          }}
        />
      ) : null}

      {sub.kind === 'recepciones' ? (
        <RecepcionesDeOrdenModal
          orden={o}
          onClose={() => setSub({ kind: 'none' })}
          onWhatsapp={(r) => {
            setSub({ kind: 'none' })
            setAvisoPaso({ tipo: 'recepcion', recepcion: r })
          }}
        />
      ) : null}

      {sub.kind === 'finalizar' ? (
        <FinalizarPedidoModal
          orden={o}
          fechaPrometidaOferta={ofertaAceptada?.fecha_entrega_prometida ?? null}
          onClose={() => setSub({ kind: 'none' })}
          onListo={() => {
            setSub({ kind: 'none' })
            setAvisoPaso({ tipo: 'finalizada' })
          }}
        />
      ) : null}

      {sub.kind === 'comprobante' ? <ComprobanteOcModal orden={o} onClose={() => setSub({ kind: 'none' })} /> : null}

      {sub.kind === 'realizado' ? (
        <ServicioRealizadoModal orden={o} onClose={() => setSub({ kind: 'none' })} onListo={() => setSub({ kind: 'none' })} />
      ) : null}

      {avisoTexto ? <ModalWhatsappCompra titulo={avisoTexto.titulo} texto={avisoTexto.texto} onCerrar={() => setAvisoPaso(null)} /> : null}

      {aprobando ? (
        <AprobarOcModal
          orden={o}
          proveedor={prov?.nombre ?? ''}
          onCerrar={() => setAprobando(false)}
          onAprobada={alAprobar}
          onNoSePagara={alNoSePagara}
        />
      ) : null}

      {mensajeWs ? (
        <ModalWhatsappCompra titulo={mensajeWs.titulo} texto={mensajeWs.texto} onCerrar={() => setMensajeWs(null)} />
      ) : null}

      <Visor
        abierto={pdf !== null || errorPdf !== null}
        error={errorPdf}
        onCerrar={() => {
          setPdf(null)
          setErrorPdf(null)
        }}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? `${o.codigo}.pdf`}
        titulo={tituloPdf || `Orden ${o.codigo}`}
        descripcion={empresaDelPapel(empresa).razonSocial}
      />
    </>
  )
}
