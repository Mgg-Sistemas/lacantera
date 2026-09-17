/**
 * Los viajes de camiones, y los sitios y rutas por los que van.
 *
 * Un viaje es a la vez la medida del material que se movió y una factura por
 * pagar. La pantalla pide «camión tal, tantos viajes» y la base guarda una fila
 * por viaje; estos hooks son la traducción entre las dos.
 *
 * DESDE EL 16/09/2026 NO HAY TRAMOS FIJOS. Christopher: «¿qué pasa si mañana
 * cierra o abre una nueva planta […] o la gobernación o cualquier aliado cede,
 * transfiere o desea incluirse en el proceso?». Los tres tramos escritos en la
 * base (`MINA_PLANTA`, `PLANTA_LAVADO`, `MINA_BASE`) pasaron a ser rutas entre
 * sitios, que se crean, se apagan y tienen tarifas con fecha. Los viajes de
 * antes no se reescribieron: la vista les encuentra su ruta al leer.
 *
 * Y cada viaje nuevo nace POR APROBAR: «debe de ser aprobado por lo mínimo por
 * un analista o responsable».
 *
 * EL DINERO PUEDE LLEGAR NULO Y ESO NO ES UN ERROR. `precio_usd` y `monto_usd`
 * los tapa la vista cuando quien mira no tiene la casilla
 * `EXPLOTACION.VER_PAGO_VIAJES`. Por eso van declarados `string | null` y la
 * pantalla dibuja un guion, no un cero.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

export type EstadoViaje = 'REGISTRADO' | 'POR_APROBAR' | 'APROBADO' | 'RECHAZADO' | 'ANULADO'

/**
 * Cómo se dice cada estado. REGISTRADO es el de los viajes de antes del 16/09,
 * que no pasaron por aprobación: se dice así, y no «aprobado», porque nadie los
 * aprobó.
 */
export const ESTADO_VIAJE: Record<
  EstadoViaje,
  { texto: string; tono: 'neutral' | 'warning' | 'success' | 'danger' }
> = {
  REGISTRADO: { texto: 'Anterior a la aprobación', tono: 'neutral' },
  POR_APROBAR: { texto: 'Por aprobar', tono: 'warning' },
  APROBADO: { texto: 'Aprobado', tono: 'success' },
  RECHAZADO: { texto: 'Rechazado', tono: 'danger' },
  ANULADO: { texto: 'Anulado', tono: 'neutral' },
}

export type CargaDelViaje = 'COMPLETA' | 'PARCIAL' | 'VACIO'

export const CARGA_DEL_VIAJE: Record<CargaDelViaje, { texto: string; explica: string }> = {
  COMPLETA: { texto: 'Con la carga completa', explica: 'Los m³ salen de la carga útil del camión.' },
  PARCIAL: { texto: 'Con carga parcial', explica: 'Hay que decir cuántos m³ traía.' },
  VACIO: { texto: 'Vacío', explica: 'No suma metros cúbicos.' },
}

export interface Acarreo {
  id: number
  fecha: string
  vehiculo_id: number | null
  /** La placa del camión, o el código de la máquina. */
  placa: string | null
  vehiculo: string | null
  tipo: string
  capacidad_m3: string | null
  carga_util_m3: string | null
  /** Solo en los viajes de antes y en las rutas que sustituyen un tramo. */
  tramo: string | null
  /** El nombre de la ruta. */
  tramo_dice: string
  secuencia: number
  /** Solo la lleva el primero de una tanda: no se inventan horas. */
  hora: string | null
  transportista: string
  chofer: string | null
  /** Nula cuando no se sabe cuánto cargó, o cuando volvió vacío. Nunca cero. */
  carga_m3: string | null
  /** Nulo sin la casilla del dinero. */
  precio_usd: string | null
  frente_id: number | null
  frente: string | null
  estado: EstadoViaje
  motivo_anulacion: string | null
  nota: string | null
  registrado_en: string
  registrado_por_nombre: string | null
  ruta_id: number | null
  origen_id: number | null
  destino_id: number | null
  maquina_id: number | null
  carga: CargaDelViaje | null
  decidido_en: string | null
  decidido_por_nombre: string | null
  decidido_como: 'RESPONSABLE' | 'CASILLA' | 'RESPALDO' | null
  motivo_rechazo: string | null
  anterior_a_la_aprobacion: boolean
  /** El precio que traía de su ruta, si quien aprueba lo ajustó. Nulo sin la casilla del dinero. */
  precio_antes_de_ajuste: string | null
  motivo_ajuste: string | null
  /** Quién cargó y quién decidió, por persona: la firma se busca por aquí y no por el nombre. */
  registrado_por: string | null
  decidido_por: string | null
  /** Si eligieron poner su firma digital en el registro del día. */
  firma_de_quien_registra: boolean | null
  firma_de_quien_aprueba: boolean | null
}

export interface AcarreoDia {
  fecha: string
  vehiculo_id: number | null
  placa: string | null
  vehiculo: string | null
  transportista: string
  tramo: string | null
  /** Los que cuentan: aprobados, o anteriores a la aprobación. */
  viajes: number
  anulados: number
  /** Nulo cuando ningún viaje del grupo sabe cuánto cargó. */
  m3: string | null
  /** Cuántos de esos viajes no suman metros cúbicos sin haber vuelto vacíos. */
  sin_carga: number
  /** Nulo sin la casilla del dinero. */
  monto_usd: string | null
  chofer: string | null
  ruta_id: number | null
  ruta: string | null
  maquina_id: number | null
  por_aprobar: number
  rechazados: number
  vacios: number
  parciales: number
}

export interface EquipoEnOperacion {
  codigo: string
  maquina: string
  tipo: string
  horas: string | null
  operador: string | null
}

export interface PagoDeAcarreo {
  mes: string
  transportista: string
  fecha: string
  viajes: number
  m3: string | null
  monto_usd: string | null
  acumulado_usd: string | null
}

export type TipoDeSitio = 'MINA' | 'PLANTA' | 'PATIO' | 'BASE' | 'OTRO'

export const TIPO_DE_SITIO: Record<TipoDeSitio, string> = {
  MINA: 'Mina',
  PLANTA: 'Planta',
  PATIO: 'Patio',
  BASE: 'Base',
  OTRO: 'Otro',
}

export interface SitioDeOperacion {
  id: number
  codigo: string
  nombre: string
  tipo: TipoDeSitio
  almacen_id: number | null
  almacen: string | null
  responsable_id: number | null
  responsable: string | null
  estado: 'ACTIVO' | 'CERRADO'
  abierto_desde: string | null
  cerrado_en: string | null
  motivo_cierre: string | null
  nota: string | null
  /** Código del dueño que lo opera hoy: LACANTERA, GOBERNACION o un aliado. */
  operador: string | null
  operador_nombre: string | null
  operador_desde: string | null
}

export interface OperadorDeSitio {
  id: number
  sitio_id: number
  propietario: string
  desde: string
  hasta: string | null
  motivo: string | null
}

export interface RutaAcarreo {
  id: number
  nombre: string
  origen_id: number
  origen_codigo: string
  origen: string
  origen_tipo: TipoDeSitio
  origen_estado: 'ACTIVO' | 'CERRADO'
  destino_id: number
  destino_codigo: string
  destino: string
  destino_tipo: TipoDeSitio
  destino_estado: 'ACTIVO' | 'CERRADO'
  precio_libre: boolean
  tramo_anterior: string | null
  activa: boolean
  nota: string | null
  /** Encendida y con los dos sitios abiertos. */
  se_puede_usar: boolean
  /** Precio libre o tarifa en rango: el viaje tiene que decir cuánto se paga. */
  pide_precio: boolean
  /** Nulos sin la casilla del dinero, o si la ruta no tiene tarifa. */
  precio_usd: string | null
  precio_hasta_usd: string | null
  vigente_desde: string | null
}

export interface TarifaDeRuta {
  id: number
  ruta_id: number
  precio_usd: string
  precio_hasta_usd: string | null
  vigente_desde: string
  nota: string | null
  fijada_en: string
}

export interface MaquinaParaViajes {
  id: number
  codigo: string
  nombre: string
  tipo: string
}

/** De qué viajes puedo decidir: todos, o los de los sitios por los que respondo. */
export interface ComoApruebo {
  todas: boolean
  sitios: number[]
}

export const puedoDecidirViaje = (
  como: ComoApruebo | undefined,
  v: { origen_id: number | null; destino_id: number | null },
) =>
  Boolean(
    como &&
      (como.todas ||
        (v.origen_id !== null && como.sitios.includes(v.origen_id)) ||
        (v.destino_id !== null && como.sitios.includes(v.destino_id))),
  )

/** Lo que se paga por una ruta, dicho en una frase. */
export function tarifaEnPalabras(r: Pick<RutaAcarreo, 'precio_libre' | 'precio_usd' | 'precio_hasta_usd'>, dinero: (v: string) => string) {
  if (r.precio_libre) return 'Precio libre: se dice en cada viaje'
  if (r.precio_usd === null) return 'Sin tarifa'
  if (r.precio_hasta_usd !== null) return `De ${dinero(r.precio_usd)} a ${dinero(r.precio_hasta_usd)}`
  return dinero(r.precio_usd)
}

/**
 * Invalida lo que un viaje puede haber movido.
 *
 * `explotacion` va también porque el tablero del módulo enseña los viajes del
 * día: si no, la tarjeta se queda con la cifra de antes hasta que alguien
 * recargue.
 */
function useAccion<A, R = unknown>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['acarreos'] })
      void qc.invalidateQueries({ queryKey: ['explotacion'] })
      void qc.invalidateQueries({ queryKey: ['vehiculos'] })
      void qc.invalidateQueries({ queryKey: ['sitios'] })
    },
  })
}

/** Lo que hizo cada camión o máquina en un día, agrupado por ruta. */
export function useAcarreosDia(fecha: string) {
  return useQuery({
    queryKey: ['acarreos', 'dia', fecha],
    enabled: Boolean(fecha),
    queryFn: async () =>
      desenvolver<AcarreoDia[]>(
        await supabase
          .from('v_acarreos_dia')
          .select('*')
          .eq('fecha', fecha)
          .order('transportista')
          .order('placa'),
      ),
  })
}

/**
 * Todos los viajes de un día, sin agrupar.
 *
 * Es lo que necesita el papel y la lista de lo que falta por aprobar: la vista
 * agrupada sirve para la tabla, pero el registro imprime viaje por viaje.
 */
export function useAcarreosDelDia(fecha: string) {
  return useQuery({
    queryKey: ['acarreos', 'todos', fecha],
    enabled: Boolean(fecha),
    queryFn: async () =>
      desenvolver<Acarreo[]>(
        await supabase
          .from('v_acarreos')
          .select('*')
          .eq('fecha', fecha)
          .order('transportista')
          .order('placa')
          .order('tramo_dice')
          .order('secuencia'),
      ),
  })
}

/** El detalle viaje por viaje de un camión o una máquina en un día. */
export function useAcarreosDeEquipo(
  fecha: string,
  equipo: { vehiculoId: number | null; maquinaId: number | null } | null,
) {
  return useQuery({
    queryKey: ['acarreos', 'detalle', fecha, equipo?.vehiculoId ?? null, equipo?.maquinaId ?? null],
    enabled: Boolean(fecha) && equipo !== null,
    queryFn: async () => {
      let q = supabase.from('v_acarreos').select('*').eq('fecha', fecha)
      q = equipo!.vehiculoId !== null
        ? q.eq('vehiculo_id', equipo!.vehiculoId)
        : q.eq('maquina_id', equipo!.maquinaId!)
      return desenvolver<Acarreo[]>(await q.order('tramo_dice').order('secuencia'))
    },
  })
}

/** Qué máquinas trabajaron ese día, para el reporte de operaciones. */
export function useEquiposEnOperacion(fecha: string) {
  return useQuery({
    queryKey: ['acarreos', 'equipos', fecha],
    enabled: Boolean(fecha),
    queryFn: () => rpc<EquipoEnOperacion[]>('equipos_en_operacion', { p_fecha: fecha }),
  })
}

/**
 * Lo que se le debe a cada transportista, día por día, entre dos fechas.
 * Solo cuenta lo aprobado y lo anterior a la aprobación.
 */
export function usePagoDeAcarreosEntre(desde: string, hasta: string) {
  const esFecha = /^\d{4}-\d{2}-\d{2}$/
  return useQuery({
    queryKey: ['acarreos', 'pago', desde, hasta],
    enabled: esFecha.test(desde) && esFecha.test(hasta) && desde <= hasta,
    queryFn: async () =>
      desenvolver<PagoDeAcarreo[]>(
        await supabase
          .from('v_acarreo_pago_mensual')
          .select('*')
          .gte('fecha', desde)
          .lte('fecha', hasta)
          .order('transportista')
          .order('fecha'),
      ),
  })
}

/** Las rutas, con su tarifa de hoy. La tarifa llega nula a quien no ve el dinero. */
export function useRutasAcarreo() {
  return useQuery({
    queryKey: ['sitios', 'rutas'],
    queryFn: async () =>
      desenvolver<RutaAcarreo[]>(
        await supabase.from('v_rutas_acarreo').select('*').order('origen').order('destino').order('nombre'),
      ),
  })
}

/** La historia de tarifas de una ruta. Vacía para quien no ve el dinero. */
export function useTarifasDeRuta(rutaId: number | null) {
  return useQuery({
    queryKey: ['sitios', 'tarifas', rutaId],
    enabled: rutaId !== null,
    queryFn: async () =>
      desenvolver<TarifaDeRuta[]>(
        await supabase
          .from('ruta_tarifas')
          .select('id, ruta_id, precio_usd, precio_hasta_usd, vigente_desde, nota, fijada_en')
          .eq('ruta_id', rutaId!)
          .order('vigente_desde', { ascending: false }),
      ),
  })
}

export function useSitiosDeOperacion() {
  return useQuery({
    queryKey: ['sitios', 'lista'],
    queryFn: () => rpc<SitioDeOperacion[]>('sitios_de_operacion'),
  })
}

export function useOperadoresDeSitio(sitioId: number | null) {
  return useQuery({
    queryKey: ['sitios', 'operadores', sitioId],
    enabled: sitioId !== null,
    queryFn: async () =>
      desenvolver<OperadorDeSitio[]>(
        await supabase
          .from('sitio_operadores')
          .select('id, sitio_id, propietario, desde, hasta, motivo')
          .eq('sitio_id', sitioId!)
          .order('desde', { ascending: false }),
      ),
  })
}

/** Las máquinas propias que pueden hacer viajes. Pasa por función: son de Maquinaria. */
export function useMaquinasParaViajes() {
  return useQuery({
    queryKey: ['acarreos', 'maquinas'],
    queryFn: () => rpc<MaquinaParaViajes[]>('maquinas_para_viajes'),
    staleTime: 5 * 60_000,
  })
}

export function useComoApruebo() {
  return useQuery({
    queryKey: ['acarreos', 'como-apruebo'],
    queryFn: () => rpc<ComoApruebo>('como_apruebo_viajes'),
    staleTime: 60_000,
  })
}

/**
 * Carga viajes, que nacen por aprobar. La cantidad SUMA a lo que el camión ya
 * tenga ese día en esa ruta: no reemplaza el total.
 */
export function useRegistrarViajes() {
  return useAccion(
    (a: {
      fecha: string
      ruta_id: number
      carga: CargaDelViaje
      cantidad: number
      vehiculo_id?: number | null
      maquina_id?: number | null
      hora?: string | null
      carga_m3?: number | null
      precio_usd?: number | null
      nota?: string | null
      /** Si la firma de quien carga va en «Registrado por». */
      con_firma?: boolean
    }) =>
      rpc<number>('registrar_viajes', {
        p_fecha: a.fecha,
        p_ruta_id: a.ruta_id,
        p_carga: a.carga,
        p_cantidad: a.cantidad,
        p_vehiculo_id: a.vehiculo_id ?? null,
        p_maquina_id: a.maquina_id ?? null,
        p_hora: a.hora ?? null,
        p_carga_m3: a.carga_m3 ?? null,
        p_precio_usd: a.precio_usd ?? null,
        p_frente_id: null,
        p_nota: a.nota ?? null,
        p_con_firma: a.con_firma === true,
      }),
  )
}

export function useAprobarViajes() {
  return useAccion((a: { ids: number[]; con_firma: boolean }) =>
    rpc<number>('aprobar_viajes', { p_ids: a.ids, p_con_firma: a.con_firma }),
  )
}

/**
 * Le pone otro precio a viajes que esperan aprobación: un parcial, un vacío.
 * Christopher: «lo decide quien aprueba». Queda el precio de la ruta y el motivo.
 */
export function useAjustarPrecioDeViajes() {
  return useAccion((a: { ids: number[]; precio: number; motivo: string }) =>
    rpc<number>('ajustar_precio_de_viajes', { p_ids: a.ids, p_precio: a.precio, p_motivo: a.motivo }),
  )
}

export function useRechazarViajes() {
  return useAccion((a: { ids: number[]; motivo: string }) =>
    rpc<number>('rechazar_viajes', { p_ids: a.ids, p_motivo: a.motivo }),
  )
}

/** Arregla un viaje suelto que todavía no se ha aprobado. Lo que no se manda se queda como está. */
export function useCorregirAcarreo() {
  return useAccion(
    (a: {
      id: number
      hora?: string | null
      carga_m3?: number | null
      precio_usd?: number | null
      nota?: string | null
    }) =>
      rpc('corregir_acarreo', {
        p_id: a.id,
        p_hora: a.hora ?? null,
        p_carga_m3: a.carga_m3 ?? null,
        p_precio_usd: a.precio_usd ?? null,
        p_nota: a.nota ?? null,
      }),
  )
}

export function useAnularAcarreo() {
  return useAccion((a: { id: number; motivo: string }) =>
    rpc('anular_acarreo', { p_id: a.id, p_motivo: a.motivo }),
  )
}

export function useGuardarSitio() {
  return useAccion(
    (s: {
      id?: number | null
      codigo?: string | null
      nombre: string
      tipo: TipoDeSitio
      almacen_id: number | null
      responsable_id: number | null
      abierto_desde: string | null
      nota: string | null
      operador?: string | null
    }) =>
      rpc<number>('guardar_sitio', {
        p_id: s.id ?? null,
        p_codigo: s.codigo ?? null,
        p_nombre: s.nombre,
        p_tipo: s.tipo,
        p_almacen_id: s.almacen_id,
        p_responsable_id: s.responsable_id,
        p_abierto_desde: s.abierto_desde,
        p_nota: s.nota,
        p_operador: s.operador ?? null,
      }),
  )
}

export function useCerrarSitio() {
  return useAccion((a: { id: number; fecha: string; motivo: string }) =>
    rpc('cerrar_sitio', { p_id: a.id, p_fecha: a.fecha, p_motivo: a.motivo }),
  )
}

export function useReabrirSitio() {
  return useAccion((id: number) => rpc('reabrir_sitio', { p_id: id }))
}

/** Lo que bloquea o avisa antes de cerrar algo. Lo calcula la base, la misma que después se niega. */
export interface Comprobacion {
  nivel: 'BLOQUEA' | 'AVISA'
  que: string
  cuantos: number
  detalle: string
}

export function useQueImpideCerrarSitio(sitioId: number | null) {
  return useQuery({
    queryKey: ['sitios', 'cierre', sitioId],
    enabled: sitioId !== null,
    queryFn: () => rpc<Comprobacion[]>('que_impide_cerrar_sitio', { p_id: sitioId }),
  })
}

export interface FaltaDeSitio {
  sitio_id: number
  que: string
  detalle: string
}

/** Lo que le falta a cada sitio abierto para operar: patio, responsable, rutas con tarifa. */
export function useLoQueLeFaltaALosSitios() {
  return useQuery({
    queryKey: ['sitios', 'faltas'],
    queryFn: () => rpc<FaltaDeSitio[]>('lo_que_le_falta_a_los_sitios'),
  })
}

export interface LoQueHayEnSitio {
  tipo: 'MATERIAL' | 'MAQUINA'
  id: number
  codigo: string
  nombre: string
  unidad: string | null
  /** De quién es hoy. */
  propietario: string
  /** Solo en el material. */
  cantidad: string | null
}

/** El material de su patio, por dueño, y las máquinas ubicadas ahí. Para decidir qué pasa en una cesión. */
export function useQueHayEnSitio(sitioId: number | null) {
  return useQuery({
    queryKey: ['sitios', 'que-hay', sitioId],
    enabled: sitioId !== null,
    queryFn: () => rpc<LoQueHayEnSitio[]>('que_hay_en_sitio', { p_id: sitioId }),
  })
}

/**
 * Cambia quién opera el sitio desde una fecha y, si se marca, le pasa material y
 * máquinas. Lo que no se marca sigue siendo de quien era.
 */
export function useCederSitio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: {
      id: number
      operador: string
      desde: string
      motivo: string
      material: Array<{ articulo_id: number; de: string; cantidad: number }>
      maquinas: number[]
    }) =>
      rpc<{ material: number; maquinas: number }>('ceder_sitio', {
        p_id: a.id,
        p_operador: a.operador,
        p_desde: a.desde,
        p_motivo: a.motivo,
        p_material: a.material,
        p_maquinas: a.maquinas,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sitios'] })
      void qc.invalidateQueries({ queryKey: ['existencias'] })
      void qc.invalidateQueries({ queryKey: ['movimientos'] })
      void qc.invalidateQueries({ queryKey: ['maquinaria'] })
    },
  })
}

export function useGuardarRuta() {
  return useAccion(
    (r: {
      id?: number | null
      nombre: string | null
      origen_id: number
      destino_id: number
      precio_libre: boolean
      activa: boolean
      nota: string | null
    }) =>
      rpc<number>('guardar_ruta', {
        p_id: r.id ?? null,
        p_nombre: r.nombre,
        p_origen_id: r.origen_id,
        p_destino_id: r.destino_id,
        p_precio_libre: r.precio_libre,
        p_activa: r.activa,
        p_nota: r.nota,
      }),
  )
}

export function useFijarTarifaRuta() {
  return useAccion(
    (t: { ruta_id: number; precio: number; precio_hasta: number | null; desde: string; nota: string | null }) =>
      rpc('fijar_tarifa_ruta', {
        p_ruta_id: t.ruta_id,
        p_precio: t.precio,
        p_precio_hasta: t.precio_hasta,
        p_desde: t.desde,
        p_nota: t.nota,
      }),
  )
}

/*
  La carga útil del camión vive en `vehiculos.ts`, no aquí.

  Es un dato del vehículo, no del viaje, y se teclea en la ficha del camión
  junto a la capacidad. Estuvo aquí sin que ninguna pantalla la llamara, que
  es como el campo acabó sin existir en el formulario y los metros cúbicos
  saliendo en cero.
*/
