import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fechaHora } from '@/lib/formato'
import type { OrdenEnPapel } from '@/lib/ficha/notaDeSalidaPdf'
import { desenvolver, rpc } from './rpc'
import type { NotaEntrega } from './ventas'

/*
  LAS SOLICITUDES DE SALIDA

  Christopher, 16/09/2026: «nos piden que manejemos las solicitudes de salida,
  así como la opción de salida directa. Por igual con traslados».

  Quien necesita material no siempre es quien puede entregarlo. Sin un sitio
  donde pedirlo, se pide por teléfono y se anota después —o no se anota—, y el
  libro deja de parecerse al patio.

  Ni PEDIDA ni APROBADA mueven una sola unidad: la entrega es la que llama a
  `registrar_salidas`, que es la única puerta que descuenta. El número de la
  nota que sale queda guardado en la solicitud, así que el papel firmado y lo
  que lo pidió se encuentran el uno al otro.
*/
/*
  LA PALABRA QUE HACE DE UNA SOLICITUD UNA VENTA

  Es la misma regla que aplica la base (`private.palabra_de_venta`): una venta
  no sale por una solicitud, sino por Facturación. Se mira aquí también para
  avisar mientras se escribe, junto al campo, y no después de enviar: los
  primeros cinco intentos rechazados se leyeron como «un error del sistema». Si
  la base y esto discrepan, manda la base.
*/
const PALABRAS_DE_VENTA =
  /\b(VENTA|VENDER|VENDID[OA]S?|VENDIO|SE VENDE|CLIENTES?|PERMUTAS?|TRUEQUES?|CANJES?|CRUCE DE FACTURAS?|PAGO CON MATERIAL(?:ES)?|PAGO EN MATERIAL(?:ES)?|PAGO EN ESPECIE)\b/

/** La palabra que nombra una venta en el texto, en minúscula, o null. */
export function palabraDeVenta(texto: string): string | null {
  const limpio = texto
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/_/g, ' ')
    // Parte del nombre de un artículo del catálogo, no una venta.
    .replace(/MATERIAL DE VENTA/g, ' ')
  return PALABRAS_DE_VENTA.exec(limpio)?.[1]?.toLowerCase() ?? null
}

export type EstadoDeSolicitud = 'PEDIDA' | 'APROBADA' | 'ENTREGADA' | 'RECHAZADA' | 'CANCELADA'

/** Cómo se dice cada estado en pantalla, y de qué color se pinta. */
export const ESTADO_DE_SOLICITUD: Record<
  EstadoDeSolicitud,
  { texto: string; tono: 'warning' | 'royal' | 'success' | 'neutral' }
> = {
  PEDIDA: { texto: 'Por aprobar', tono: 'warning' },
  APROBADA: { texto: 'Por entregar', tono: 'royal' },
  ENTREGADA: { texto: 'Entregada', tono: 'success' },
  RECHAZADA: { texto: 'No aprobada', tono: 'neutral' },
  CANCELADA: { texto: 'Cancelada', tono: 'neutral' },
}

export interface RenglonDeSolicitud {
  id: number
  articulo_id: number
  cantidad: string
  presentaciones: string | null
  presentacion: string | null
  suelto: string | null
  propietario: string | null
  articulo?: { codigo: string; nombre: string; unidad: string } | null
}

export interface SolicitudDeSalida {
  id: number
  numero: string
  estado: EstadoDeSolicitud
  almacen_id: number
  clase: string
  motivo: string
  grupo_id: number | null
  destino_externo: string | null
  responsable_externo: string | null
  pedida_por: string | null
  pedida_en: string
  aprobada_por: string | null
  aprobada_en: string | null
  /** Cierto cuando la aprobó administración y no quien responde por el almacén. */
  aprobada_de_respaldo: boolean | null
  entregada_por: string | null
  entregada_en: string | null
  /** El número de la nota de salida que se emitió al entregarla. */
  nota_salida: string | null
  /** Por qué se rechazó o se canceló. */
  cierre_motivo: string | null
  /**
   * Si quien la solicitó eligió poner su firma digital en la orden. Nula en las
   * de antes de preguntarlo: van sin su firma.
   */
  firma_de_quien_pide: boolean | null
  /**
   * Si quien la aprobó eligió poner su firma. Nula en las de antes: van con su
   * firma si la tiene encendida, que es lo de por defecto.
   */
  firma_de_quien_aprueba: boolean | null
  almacen?: { nombre: string } | null
  renglones?: RenglonDeSolicitud[]
}

export function useSolicitudesDeSalida() {
  return useQuery({
    queryKey: ['solicitudes-salida'],
    queryFn: async () =>
      desenvolver<SolicitudDeSalida[]>(
        await supabase
          .from('solicitudes_salida')
          .select(
            '*, almacen:almacenes(nombre), renglones:solicitud_salida_renglones(*, articulo:articulos(codigo, nombre, unidad))',
          )
          .order('pedida_en', { ascending: false })
          .limit(200),
      ),
  })
}

/*
  Cada paso cambia tres cosas a la vez: la solicitud, lo que hay en el almacén
  —solo al entregar— y el libro. Se invalidan las tres para no dejar una
  pantalla abierta contando otra historia.
*/
function useAccionDeSolicitud<A>(fn: (a: A) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['solicitudes-salida'] })
      void qc.invalidateQueries({ queryKey: ['existencias'] })
      void qc.invalidateQueries({ queryKey: ['existencias-totales'] })
      void qc.invalidateQueries({ queryKey: ['movimientos'] })
      void qc.invalidateQueries({ queryKey: ['notificaciones'] })
    },
  })
}

/**
 * Pedir material, de uno o de varios almacenes.
 *
 * UNA SOLICITUD POR ALMACÉN. Christopher, 17/09/2026: cada renglón puede decir
 * de qué almacén sale, y sale una solicitud por almacén, porque aprobar es
 * responder por lo que sale de un sitio. Los renglones se agrupan aquí, en el
 * orden en que aparecen; la base crea todas en una sola transacción, así que o
 * quedan todas o ninguna. Devuelve sus números.
 */
export function usePedirSalida() {
  return useAccionDeSolicitud(
    (s: {
      renglones: Array<{
        almacen_id: number
        articulo_id: number
        cantidad: number
        presentaciones?: number | null
        presentacion?: string | null
        suelto?: number | null
        propietario?: string | null
      }>
      /** Para qué se necesita. Una solicitud no elige razón de salida. */
      motivo: string
      grupo_id?: number | null
      externo?: string | null
      responsable?: string | null
      /** Si quien solicita pone su firma digital en la orden. Por defecto no. */
      con_firma?: boolean
    }) =>
      rpc<string[]>('pedir_salidas', {
        p_por_almacen: [...new Set(s.renglones.map((r) => r.almacen_id))].map((almacen_id) => ({
          almacen_id,
          renglones: s.renglones
            .filter((r) => r.almacen_id === almacen_id)
            .map((r) => ({
              articulo_id: String(r.articulo_id),
              cantidad: String(r.cantidad),
              ...(r.presentaciones ? { presentaciones: String(r.presentaciones) } : {}),
              ...(r.presentacion ? { presentacion: r.presentacion } : {}),
              ...(r.suelto ? { suelto: String(r.suelto) } : {}),
              ...(r.propietario ? { propietario: r.propietario } : {}),
            })),
        })),
        p_motivo: s.motivo,
        p_grupo_id: s.grupo_id ?? null,
        p_externo: s.externo || null,
        p_responsable: s.responsable || null,
        p_con_firma: s.con_firma ?? false,
      }),
  )
}

/**
 * Aprobar, diciendo si la firma de quien aprueba va en la orden.
 *
 * Christopher eligió que la firma la decide su dueño al actuar, y que por
 * defecto vaya la de quien autoriza. La base guarda solo lo que se puede
 * estampar: sin firma encendida queda en falso aunque llegue en cierto.
 */
export function useAprobarSolicitud() {
  return useAccionDeSolicitud((a: { id: number; con_firma: boolean }) =>
    rpc<number>('aprobar_solicitud_salida', { p_id: a.id, p_con_firma: a.con_firma }),
  )
}

/** La orden de la que salió una nota, o nula si la nota es de una salida directa. */
export async function leerOrdenDeLaNota(nota: string): Promise<SolicitudDeSalida | null> {
  return desenvolver<SolicitudDeSalida | null>(
    await supabase.from('solicitudes_salida').select('*').eq('nota_salida', nota).maybeSingle(),
  )
}

/**
 * La orden, lista para el papel: nombres, fechas legibles y solo las firmas
 * que tocan.
 *
 * Aquí se aplica lo que eligió cada dueño: la de quien pide va si dijo que sí;
 * la de quien aprueba va salvo que haya dicho que no —en las órdenes de antes
 * de preguntarlo no dijo nada, y por defecto va—. En las dos, solo si la firma
 * sigue guardada y encendida: `firmas` trae únicamente esas.
 */
export function ordenEnPapel(
  s: SolicitudDeSalida,
  nombreDe: (uid: string | null) => string | null,
  firmas: Record<string, string>,
): OrdenEnPapel {
  const aprobada = s.estado === 'APROBADA' || s.estado === 'ENTREGADA'
  return {
    numero: s.numero,
    estado: ESTADO_DE_SOLICITUD[s.estado].texto,
    sello: s.estado === 'RECHAZADA' ? 'NO APROBADA' : s.estado === 'CANCELADA' ? 'CANCELADA' : null,
    fechaOrden: fechaHora(s.pedida_en),
    solicito: {
      nombre: nombreDe(s.pedida_por),
      firma: s.firma_de_quien_pide === true && s.pedida_por ? (firmas[s.pedida_por] ?? null) : null,
    },
    autorizo: {
      nombre: s.aprobada_por ? nombreDe(s.aprobada_por) : null,
      fecha: s.aprobada_en ? fechaHora(s.aprobada_en) : null,
      deRespaldo: aprobada && s.aprobada_de_respaldo === true,
      noAprobo: s.estado === 'RECHAZADA',
      firma:
        aprobada && s.firma_de_quien_aprueba !== false && s.aprobada_por
          ? (firmas[s.aprobada_por] ?? null)
          : null,
    },
    entrego: {
      nombre: s.entregada_por ? nombreDe(s.entregada_por) : null,
      fecha: s.entregada_en ? fechaHora(s.entregada_en) : null,
    },
    notaSalida: s.nota_salida,
    cierre: s.estado === 'RECHAZADA' || s.estado === 'CANCELADA' ? s.cierre_motivo : null,
  }
}

export function useRechazarSolicitud() {
  return useAccionDeSolicitud((s: { id: number; motivo: string }) =>
    rpc<number>('rechazar_solicitud_salida', { p_id: s.id, p_motivo: s.motivo }),
  )
}

export function useCancelarSolicitud() {
  return useAccionDeSolicitud((s: { id: number; motivo: string }) =>
    rpc<number>('cancelar_solicitud_salida', { p_id: s.id, p_motivo: s.motivo }),
  )
}

export function useEntregarSolicitud() {
  return useAccionDeSolicitud((id: number) =>
    rpc<string>('entregar_solicitud_salida', { p_id: id }),
  )
}

/**
 * Cómo apruebo las solicitudes de salida: `respaldo` si tengo la casilla y
 * apruebo en cualquier almacén, `sitios` los almacenes por los que respondo, y
 * `restringida` si se me quitó, que deja las otras dos vacías.
 *
 * Es la regla de `private.como_aprueba_salida`, dicha a la pantalla. Ya no es
 * la del traslado: desde el 16/09 aprobar una salida tiene casilla propia, que
 * se extiende y se restringe por persona, y aceptar un traslado no.
 */
export interface ComoAprueboSalidas {
  yo: string
  respaldo: boolean
  restringida: boolean
  sitios: number[]
}

/*
  LA GENTE DE LA EMPRESA, PARA DECIR QUIÉN RESPONDE POR LO QUE SALE.

  Solo nombre y cargo, y solo los activos: `empleados` lo lee nómina, y aquí no
  hace falta nada más de la ficha para reconocer a alguien.
*/
export interface PersonaDeLaEmpresa {
  id: number
  nombre: string
  cargo: string | null
}

export function usePersonasDeLaEmpresa() {
  return useQuery({
    queryKey: ['personas-de-la-empresa'],
    queryFn: () => rpc<PersonaDeLaEmpresa[]>('personas_de_la_empresa', {}),
    staleTime: 5 * 60_000,
  })
}

export function useComoAprueboSalidas() {
  return useQuery({
    // Bajo `mis-acciones` a propósito: extender o restringir una casilla
    // invalida esa clave, y esto cambia con ellas.
    queryKey: ['mis-acciones', 'aprobar-salidas'],
    queryFn: () => rpc<ComoAprueboSalidas>('como_apruebo_salidas'),
    staleTime: 60_000,
  })
}

/**
 * Lo que la pantalla ofrece en cada solicitud.
 *
 * Es la misma regla que aplica la base, dicha aquí solo para no enseñar botones
 * que van a fallar. Quien decide sigue siendo la base al pulsar.
 */
export function quePuedoHacerConLaSolicitud(
  s: SolicitudDeSalida,
  yo: { yo: string; respaldo: boolean; sitios: number[] } | undefined | null,
  puedoEntregar: boolean,
) {
  if (!yo) return { aprobar: false, rechazar: false, cancelar: false, entregar: false }
  const respondoPorElAlmacen = yo.respaldo || yo.sitios.includes(s.almacen_id)
  return {
    aprobar: s.estado === 'PEDIDA' && respondoPorElAlmacen,
    rechazar: s.estado === 'PEDIDA' && respondoPorElAlmacen,
    cancelar:
      (s.estado === 'PEDIDA' || s.estado === 'APROBADA') &&
      (s.pedida_por === yo.yo || respondoPorElAlmacen),
    entregar: s.estado === 'APROBADA' && puedoEntregar,
  }
}

// ---------------------------------------------------------------------------
// LA NOTA DE ENTREGA QUE DEJA UNA SALIDA
//
// Christopher, 21/09/2026: al imprimir una nota de salida hacia fuera se puede
// marcar que deje además su nota de entrega. Al cliente se le entrega solo la de
// salida; la de entrega queda de respaldo y se imprime cuando haga falta.
//
// La casilla no la da ningún nivel ni ningún rol: «que sea un permiso
// extendido». Se presta persona por persona en Configuración › Usuarios.
//
// No mueve inventario: documenta los mismos asientos que ya escribió la salida.
// ---------------------------------------------------------------------------

export const GENERAR_NOTA_ENTREGA = 'SALIDAS.GENERAR_NOTA_ENTREGA'

/** Un asiento de la salida que sigue en pie: lo que será un renglón de la nota. */
export interface AsientoDeLaSalida {
  id: number
  articulo_id: number
  articulo: string
  cantidad: string
  unidad: string
}

export async function leerAsientosDeLaSalida(numero: string): Promise<AsientoDeLaSalida[]> {
  const asientos = desenvolver<
    { id: number; articulo_id: number; cantidad: string; unidad: string; articulo: { nombre: string } | null }[]
  >(
    await supabase
      .from('inventario_movimientos')
      // Con «*» el cliente no intenta adivinar la forma del enlace a artículos.
      .select('*, articulo:articulos(nombre)')
      .eq('nota_salida', numero)
      .eq('signo', -1)
      .neq('tipo', 'REVERSO')
      .order('id'),
  )
  if (asientos.length === 0) return []

  // Lo que se deshizo después no se respalda: la base tampoco lo cuenta.
  const deshechos = desenvolver<{ movimiento_origen: number | null }[]>(
    await supabase
      .from('inventario_movimientos')
      .select('movimiento_origen')
      .eq('tipo', 'REVERSO')
      .in(
        'movimiento_origen',
        asientos.map((a) => a.id),
      ),
  )
  const fuera = new Set(deshechos.map((d) => d.movimiento_origen))

  return asientos
    .filter((a) => !fuera.has(a.id))
    .map((a) => ({
      id: a.id,
      articulo_id: a.articulo_id,
      articulo: a.articulo?.nombre ?? '—',
      cantidad: a.cantidad,
      unidad: a.unidad,
    }))
}

/** La nota de entrega viva que dejó esa salida, si dejó alguna. */
export async function leerNotaDeEntregaDeLaSalida(numero: string): Promise<NotaEntrega | null> {
  const filas = desenvolver<NotaEntrega[]>(
    await supabase
      .from('v_notas_entrega')
      .select('*')
      .eq('nota_salida', numero)
      .neq('estado', 'ANULADA')
      .limit(1),
  )
  return filas[0] ?? null
}

/** El cliente al que se parece el destino escrito a mano, si es uno y solo uno. */
export const clienteQueSeParece = (nombre: string) =>
  rpc<number | null>('cliente_que_se_parece', { p_nombre: nombre })

export function useGenerarNotaDeEntrega() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: {
      nota_salida: string
      cliente_id: number | null
      precios: { movimiento_id: number; precio: number }[]
      facturable: boolean
    }) =>
      rpc<number>('generar_nota_de_entrega', {
        p_nota_salida: v.nota_salida,
        p_cliente_id: v.cliente_id,
        p_precios: v.precios,
        p_facturable: v.facturable,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ventas', 'notas'] })
    },
  })
}

export function useCompletarNotaDeEntrega() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: {
      id: number
      cliente_id: number | null
      precios: { renglon_id: number; precio: number }[]
      facturable: boolean
    }) =>
      rpc<'PENDIENTE' | 'DESPACHADA'>('completar_nota_de_entrega', {
        p_id: v.id,
        p_cliente_id: v.cliente_id,
        p_precios: v.precios,
        p_moneda: null,
        p_facturable: v.facturable,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ventas'] })
    },
  })
}
