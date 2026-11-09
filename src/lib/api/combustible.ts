import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  CatalogoCombustible,
  ConciliacionCombustible,
  CubicacionCombustible,
  MovimientoLibro,
  TanqueGt,
  TipoCatalogoCombustible,
  TipoGeometria,
} from '@/lib/combustible/tipos'
import { desenvolver, rpc } from './rpc'

/**
 * El combustible: lo que entra, lo que sale y a qué se le echó.
 *
 * LO QUE HACE FALTA NO ES EL STOCK
 *
 * Las entradas, las salidas y el saldo ya los llevaba el inventario, y bien.
 * Lo que faltaba era el destino: el gasoil salía del tanque con un motivo
 * escrito a mano, así que se podía decir cuánto se gastó en el mes y nada más.
 *
 * Con la máquina y su horómetro anotados en cada despacho, el litro por hora
 * sale solo. Y con el litro por hora se ve la bomba de inyección antes de que
 * se rompa, que es para lo que sirve llevar control de combustible.
 */

/*
  PARA QUE SE SURTIO, QUE NO ES LO MISMO QUE A QUE MAQUINA

  La misma excavadora se surte para producir o para una prueba despues de
  reparar, y esa diferencia es la que separa consumo de desperdicio.

  LA LISTA VIVE EN LA BASE, NO AQUI

  Estaba escrita en este archivo. La lider pidio anadir «Produccion» —una
  palabra— y hizo falta un desarrollador y un despliegue. Eso es justo lo que
  dijo que no queria: «debe ser editable, no quiero nos llamen a cada rato por
  cosas asi».

  Ahora sale de `motivos_despacho`, que ella misma puede tocar. Y cada motivo
  dice si obliga a explicarse en pocas palabras — que es lo que pidio para
  «Otro», generalizado.
*/
export type MotivoDespacho = string

export interface MotivoDelVale {
  codigo: string
  nombre: string
  pista: string | null
  orden: number
  exige_detalle: boolean
  activo?: boolean
}

export function useMotivosDespacho(incluirApagados = false) {
  return useQuery({
    queryKey: ['combustible', 'motivos', incluirApagados],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      let consulta = supabase
        .from('motivos_despacho')
        .select('codigo, nombre, pista, orden, exige_detalle, activo')
        .order('orden')
      if (!incluirApagados) consulta = consulta.eq('activo', true)
      return desenvolver<MotivoDelVale[]>(await consulta)
    },
  })
}

function useAccionMotivo<A>(fn: (a: A) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['combustible'] })
    },
  })
}

export function useGuardarMotivoDespacho() {
  return useAccionMotivo(
    (m: {
      codigo?: string | null
      nombre: string
      pista?: string | null
      orden?: number | null
      exige_detalle?: boolean
      activo?: boolean
    }) =>
      rpc<string>('guardar_motivo_despacho', {
        p_codigo: m.codigo ?? null,
        p_nombre: m.nombre,
        p_pista: m.pista ?? null,
        p_orden: m.orden ?? null,
        p_exige_detalle: m.exige_detalle ?? false,
        p_activo: m.activo ?? true,
      }),
  )
}

/** Solo con los que nunca se usaron en un vale. El resto se apaga. */
export function useBorrarMotivoDespacho() {
  return useAccionMotivo((codigo: string) =>
    rpc<void>('borrar_motivo_despacho', { p_codigo: codigo }),
  )
}

export interface DespachoCombustible {
  id: number
  numero: string | null
  fecha: string
  /** Nula cuando el vale se transcribio otro dia: no la sabemos. */
  hora: string | null
  motivo: MotivoDespacho
  /** En pocas palabras, cuando el motivo obliga a explicarse. */
  motivo_detalle: string | null
  /** El rotulo legible del motivo, resuelto contra el catalogo. */
  motivo_nombre?: string | null
  articulo_id: number
  articulo_codigo: string
  combustible: string
  unidad: string
  almacen_id: number
  tanque: string
  cantidad: string
  maquina_id: number | null
  maquina_codigo: string | null
  /** El nombre de la máquina, o lo que se escribió cuando no hay ficha. */
  destino: string
  maquina_tipo: string | null
  horometro: string | null
  empleado_id: number | null
  /** Copiado dentro del vale al guardarlo, no unido con empleados. */
  recibio: string
  recibio_cedula: string | null
  surtio: string | null
  registrado_por: string | null
  costo_usd: string | null
  nota: string | null
  registrado_en: string
  /** Anulado con motivo y reverso: el vale queda, el combustible volvió. */
  anulado_en: string | null
  motivo_anulacion: string | null
  /** Corregido con rastro: mismo número, números nuevos. */
  corregido_en: string | null
}

export interface ConsumoMaquina {
  maquina_id: number
  maquina_codigo: string
  maquina: string
  tipo: string
  estado: string
  desde: string
  hasta: string
  veces: number
  litros: string
  costo_usd: string
  /** Horas trabajadas en el mismo período. Nula si no hay lecturas. */
  horas: string | null
  /** Nulo cuando no hay horas: un consumo sin horas no se puede calcular. */
  litros_por_hora: string | null
  costo_por_hora_usd: string | null
}

export function useDespachosCombustible(limite = 200) {
  return useQuery({
    queryKey: ['combustible', 'despachos', limite],
    queryFn: async () =>
      desenvolver<DespachoCombustible[]>(
        await supabase
          .from('v_despachos_combustible')
          .select('*')
          .order('fecha', { ascending: false })
          .order('id', { ascending: false })
          .limit(limite),
      ),
  })
}

export function useConsumoCombustible() {
  return useQuery({
    queryKey: ['combustible', 'consumo'],
    queryFn: async () =>
      desenvolver<ConsumoMaquina[]>(
        await supabase.from('v_consumo_combustible').select('*').order('litros', { ascending: false }),
      ),
  })
}

/** El saldo de cada combustible en cada tanque. */
/** Combustible en un sitio, sea tanque o no. */
export interface CombustibleEnSitio {
  almacen_id: number
  almacen: string
  almacen_tipo: string
  articulo_id: number
  articulo: string
  unidad: string
  existencia: string
  stock_minimo: string
  costo_promedio_usd: string | null
}

const COLUMNAS_DE_SITIO =
  'almacen_id, almacen, almacen_tipo, articulo_id, articulo, unidad, existencia, stock_minimo, costo_promedio_usd'

/**
 * Lo que hay EN LOS TANQUES.
 *
 * Filtra por el tipo del almacén, no por la categoría del artículo. Filtraba por
 * la categoría, y entonces cualquier sitio con gasoil —un patio, un taller— se
 * enseñaba bajo el título «En el tanque» y se ofrecía para despachar. La base lo
 * paraba al guardar, con razón, y el mensaje parecía un error del sistema
 * cuando el error estaba aquí: «hay combustible aquí» y «esto es un tanque» son
 * dos cosas distintas.
 *
 * El filtro va en la consulta y no en la pantalla a propósito: dos pantallas
 * usan este hook, y una de ellas es la que despacha.
 */
export function useTanques() {
  return useQuery({
    queryKey: ['combustible', 'tanques'],
    queryFn: async () =>
      desenvolver<CombustibleEnSitio[]>(
        await supabase
          .from('v_existencias')
          .select(COLUMNAS_DE_SITIO)
          .eq('categoria', 'COMBUSTIBLE')
          .eq('almacen_tipo', 'COMBUSTIBLE')
          .order('almacen'),
      ),
  })
}

/**
 * Combustible que está fuera de un tanque.
 *
 * Pasa de verdad y no es un error de nadie: una compra se recibe en el patio o
 * en el almacén general, y el gasoil se queda ahí hasta que alguien lo pasa al
 * tanque. Esconderlo sería peor —son litros que la empresa tiene y que no
 * aparecerían por ninguna parte—, así que se enseña aparte, dicho como lo que
 * es, y con la manera de moverlo al lado.
 */
export function useCombustibleFueraDeTanque() {
  return useQuery({
    queryKey: ['combustible', 'fuera-de-tanque'],
    queryFn: async () =>
      desenvolver<CombustibleEnSitio[]>(
        await supabase
          .from('v_existencias')
          .select(COLUMNAS_DE_SITIO)
          .eq('categoria', 'COMBUSTIBLE')
          .neq('almacen_tipo', 'COMBUSTIBLE')
          .gt('existencia', 0)
          .order('almacen'),
      ),
  })
}

/**
 * El número (CMB-…) de un vale recién creado.
 *
 * La RPC de despachar devuelve el id, pero las fotos del vale se cuelgan del
 * número, igual que en las salidas y los despachos. Se lee de la misma vista
 * que pinta la lista, así que quien puede despachar puede preguntarlo.
 */
export async function numeroDeDespacho(id: number): Promise<string | null> {
  const { data } = await supabase
    .from('v_despachos_combustible')
    .select('numero')
    .eq('id', id)
    .maybeSingle()
  return (data?.numero as string | null) ?? null
}

export function useDespacharCombustible() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (d: {
      articulo_id: number
      almacen_id: number
      cantidad: number
      motivo: MotivoDespacho
      motivo_detalle?: string | null
      maquina_id?: number | null
      destino?: string | null
      horometro?: number | null
      empleado_id?: number | null
      recibio_nombre?: string | null
      recibio_cedula?: string | null
      fecha?: string | null
      nota?: string | null
    }) =>
      rpc<number>('despachar_combustible', {
        p_articulo_id: d.articulo_id,
        p_almacen_id: d.almacen_id,
        p_cantidad: d.cantidad,
        p_motivo: d.motivo,
        p_motivo_detalle: d.motivo_detalle ?? null,
        p_maquina_id: d.maquina_id ?? null,
        p_destino: d.destino ?? null,
        p_horometro: d.horometro ?? null,
        p_empleado_id: d.empleado_id ?? null,
        p_recibio_nombre: d.recibio_nombre ?? null,
        p_recibio_cedula: d.recibio_cedula ?? null,
        p_fecha: d.fecha ?? null,
        p_nota: d.nota ?? null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['combustible'] })
      void qc.invalidateQueries({ queryKey: ['existencias'] })
      void qc.invalidateQueries({ queryKey: ['existencias-totales'] })
    },
  })
}

/*
  EL VALE SE CORRIGE Y SE ANULA, no se edita ni se borra (05/10/2026).

  Es lo que Golden hace con editar/eliminar, traído a los rieles de la casa:
  anular deja el vale con su motivo y devuelve el combustible con un REVERSO;
  corregir conserva el número, marca quién y cuándo, y si cambió la cantidad
  o la fecha el inventario lo cuenta con reverso y salida nueva. Escritura
  alcanza para el vale de HOY; el de otro día exige control total.
*/

export interface CorreccionDeDespacho {
  id: number
  cantidad: number
  motivo: MotivoDespacho
  motivo_detalle?: string | null
  maquina_id?: number | null
  destino?: string | null
  horometro?: number | null
  empleado_id?: number | null
  recibio_nombre?: string | null
  recibio_cedula?: string | null
  fecha?: string | null
  nota?: string | null
  motivo_correccion?: string | null
}

export function useCorregirDespacho() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (c: CorreccionDeDespacho) =>
      rpc<void>('corregir_despacho_combustible', {
        p_id: c.id,
        p_cantidad: c.cantidad,
        p_motivo: c.motivo,
        p_motivo_detalle: c.motivo_detalle ?? null,
        p_maquina_id: c.maquina_id ?? null,
        p_destino: c.destino ?? null,
        p_horometro: c.horometro ?? null,
        p_empleado_id: c.empleado_id ?? null,
        p_recibio_nombre: c.recibio_nombre ?? null,
        p_recibio_cedula: c.recibio_cedula ?? null,
        p_fecha: c.fecha ?? null,
        p_nota: c.nota ?? null,
        p_motivo_correccion: c.motivo_correccion ?? null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['combustible'] })
      void qc.invalidateQueries({ queryKey: ['existencias'] })
      void qc.invalidateQueries({ queryKey: ['existencias-totales'] })
      void qc.invalidateQueries({ queryKey: ['movimientos'] })
    },
  })
}

export function useAnularDespacho() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: { id: number; motivo: string }) =>
      rpc<void>('anular_despacho_combustible', { p_id: a.id, p_motivo: a.motivo }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['combustible'] })
      void qc.invalidateQueries({ queryKey: ['existencias'] })
      void qc.invalidateQueries({ queryKey: ['existencias-totales'] })
      void qc.invalidateQueries({ queryKey: ['movimientos'] })
    },
  })
}

/**
 * Las personas a las que se les puede entregar combustible.
 *
 * NO SALE DE `empleados`, Y ESO NO ES CAPRICHO
 *
 * La tabla de empleados solo la puede leer quien tenga NOMINA:LECTURA, y los
 * dos roles que despachan combustible —ALMACEN y OPERACIONES— la tienen en
 * NINGUNO. Leyendola directamente, al almacenista el desplegable le salia
 * vacio: no podia decir quien recibio el gasoil.
 *
 * Y no se arregla abriendo la reja, porque las politicas se suman con OR y
 * abriria la ficha entera, sueldo incluido. La funcion devuelve el nombre, la
 * cedula y el cargo, y nada mas.
 */
export function usePersonasParaVale() {
  return useQuery({
    queryKey: ['combustible', 'personas'],
    staleTime: 5 * 60_000,
    queryFn: () =>
      rpc<Array<{ id: number; nombre: string; cedula: string | null; cargo: string | null }>>(
        'personas_para_vale',
        {},
      ),
  })
}

/**
 * Los combustibles del catálogo.
 *
 * NO SALE DE LOS TANQUES, Y ESA ES LA CORRECCIÓN
 *
 * La ficha de la máquina construía esta lista a partir de las existencias, así
 * que solo ofrecía lo que hubiera comprado. Una camioneta no podía declarar que
 * quema gasolina hasta que alguien comprara gasolina — y declarar qué quema una
 * máquina es justo lo que hay que hacer ANTES de comprarle nada.
 *
 * Son dos preguntas distintas: qué combustibles existen, y cuáles hay en el
 * tanque. Para el despacho manda la segunda; para la ficha, esta.
 */
export function useCombustibles() {
  return useQuery({
    queryKey: ['combustibles'],
    staleTime: 10 * 60_000,
    queryFn: async () =>
      desenvolver<Array<{ id: number; codigo: string; nombre: string; unidad: string }>>(
        await supabase
          .from('articulos')
          .select('id, codigo, nombre, unidad')
          .eq('categoria', 'COMBUSTIBLE')
          .eq('activo', true)
          .order('nombre'),
      ),
  })
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMBUSTIBLE COMO GOLDEN TOUCH (10/11/2026)

   Lo de arriba sigue igual: el vale, sus correcciones y anulaciones, los
   motivos y las personas. Lo de abajo es el módulo de Golden Touch sobre los
   rieles de la casa: tanques con su libro mayor (`v_combustible_tanques`,
   `v_combustible_libro`), las cinco operaciones (uso, entrada, traslado,
   retorno, merma), anular y corregir con reverso, catálogos, cubicación y
   conciliación. Toda escritura va por una función de la base; la lógica pura
   (horas, contador, merma, cubicación, reportes) vive en `src/lib/combustible`.
═══════════════════════════════════════════════════════════════════════════ */

/** Lo que queda viejo cuando se mueve combustible: el libro, las existencias y el kardex. */
function useAccionCombustible<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['combustible'] })
      void qc.invalidateQueries({ queryKey: ['existencias'] })
      void qc.invalidateQueries({ queryKey: ['existencias-totales'] })
      void qc.invalidateQueries({ queryKey: ['movimientos'] })
    },
  })
}

// ─── Lecturas ──────────────────────────────────────────────────────────────

/** Los tanques con su ficha, su saldo y su tasa ponderada, en el orden de la grilla. */
export function useTanquesGt(incluirInactivos = false) {
  return useQuery({
    queryKey: ['combustible', 'tanques-gt', incluirInactivos],
    queryFn: async () => {
      let consulta = supabase.from('v_combustible_tanques').select('*').order('orden').order('nombre')
      if (!incluirInactivos) consulta = consulta.eq('activo', true)
      return desenvolver<TanqueGt[]>(await consulta)
    },
  })
}

export interface FiltroLibro {
  /** Un tanque, o todos si es nulo. */
  tanqueId?: number | null
  /** AAAA-MM-DD, los dos inclusive. */
  desde?: string | null
  hasta?: string | null
  /** Desde 0. */
  pagina?: number
  porPagina?: number
  /** Más reciente primero (el teléfono) o en el orden del libro (la PC, el Excel). */
  recientesPrimero?: boolean
}

/**
 * El libro mayor por rango y por páginas. Cada renglón trae su saldo corrido,
 * calculado sobre TODO el libro del tanque: filtrar por fecha no lo cambia.
 */
export function useLibroTanque(f: FiltroLibro, habilitado = true) {
  const porPagina = f.porPagina ?? 500
  const pagina = f.pagina ?? 0
  return useQuery({
    queryKey: [
      'combustible',
      'libro',
      f.tanqueId ?? null,
      f.desde ?? null,
      f.hasta ?? null,
      pagina,
      porPagina,
      !!f.recientesPrimero,
    ],
    enabled: habilitado,
    queryFn: async () => {
      let consulta = supabase.from('v_combustible_libro').select('*', { count: 'exact' })
      if (f.tanqueId != null) consulta = consulta.eq('tanque_id', f.tanqueId)
      if (f.desde) consulta = consulta.gte('fecha', f.desde)
      if (f.hasta) consulta = consulta.lte('fecha', f.hasta)
      const asc = !f.recientesPrimero
      const { data, error, count } = await consulta
        .order('fecha', { ascending: asc })
        .order('tanque_id')
        .order('orden', { ascending: asc })
        .range(pagina * porPagina, pagina * porPagina + porPagina - 1)
      return { filas: desenvolver<MovimientoLibro[]>({ data, error }), total: count ?? 0 }
    },
  })
}

/** Un renglón del libro (el detalle de un movimiento). */
export function useMovimientoLibro(id: number | null | undefined) {
  return useQuery({
    queryKey: ['combustible', 'libro', 'uno', id],
    enabled: id != null,
    queryFn: async () =>
      desenvolver<MovimientoLibro | null>(
        await supabase
          .from('v_combustible_libro')
          .select('*')
          .eq('id', id as number)
          .maybeSingle(),
      ),
  })
}

/** Equipos, autorizados y destinos. */
export function useCatalogosCombustible() {
  return useQuery({
    queryKey: ['combustible', 'catalogos'],
    staleTime: 5 * 60_000,
    queryFn: async () =>
      desenvolver<CatalogoCombustible[]>(
        await supabase
          .from('combustible_catalogos')
          .select('id, tipo, valor, maquina_id, activo, orden, tanques_permitidos, creado_en')
          .order('tipo')
          .order('orden')
          .order('valor'),
      ),
  })
}

type NumeroDeLaBase = string | number | null

/** El horómetro y el kilometraje vigentes de una máquina, y su operador (para «¿Quién recibió?»). */
export function useLecturaVigente(maquinaId: number | null | undefined) {
  return useQuery({
    queryKey: ['combustible', 'lectura-vigente', maquinaId],
    enabled: maquinaId != null,
    queryFn: async () => {
      const filas = await rpc<
        Array<{ horometro: NumeroDeLaBase; kilometraje: NumeroDeLaBase; operador_id: number | null }>
      >('combustible_lectura_vigente', { p_maquina_id: maquinaId })
      const r = filas?.[0]
      return {
        horometro: r?.horometro == null ? null : Number(r.horometro),
        kilometraje: r?.kilometraje == null ? null : Number(r.kilometraje),
        operador_id: r?.operador_id ?? null,
      }
    },
  })
}

/** El contador del surtidor de un tanque: donde arranca el próximo surtido. */
export function useUltimoContador(almacenId: number | null | undefined) {
  return useQuery({
    queryKey: ['combustible', 'ultimo-contador', almacenId],
    enabled: almacenId != null,
    queryFn: async () => {
      const v = await rpc<NumeroDeLaBase>('combustible_ultimo_contador', { p_almacen_id: almacenId })
      return v == null ? null : Number(v)
    },
  })
}

export function useCubicaciones(almacenId?: number | null) {
  return useQuery({
    queryKey: ['combustible', 'cubicaciones', almacenId ?? null],
    queryFn: async () => {
      let consulta = supabase
        .from('combustible_cubicaciones')
        .select('*')
        .order('fecha', { ascending: false })
        .order('creado_en', { ascending: false })
      if (almacenId != null) consulta = consulta.eq('almacen_id', almacenId)
      return desenvolver<CubicacionCombustible[]>(await consulta)
    },
  })
}

export function useConciliaciones(almacenId?: number | null) {
  return useQuery({
    queryKey: ['combustible', 'conciliaciones', almacenId ?? null],
    queryFn: async () => {
      let consulta = supabase
        .from('combustible_conciliaciones')
        .select('*')
        .order('hasta', { ascending: false })
        .order('creado_en', { ascending: false })
      if (almacenId != null) consulta = consulta.eq('almacen_id', almacenId)
      return desenvolver<ConciliacionCombustible[]>(await consulta)
    },
  })
}

export interface ResumenTanquePeriodo {
  almacen_id: number
  tanque: string
  saldo_inicial: string | number
  entradas: string | number
  usos: string | number
  traslados: string | number
  retornos: string | number
  mermas: string | number
  /** Reversos y ajustes, con su signo: lo que hace cerrar la cuenta. */
  otros: string | number
  saldo_libros: string | number
  movimientos: number
}

/** El libro de cada tanque en un rango: con qué abrió, qué pasó y con qué cerró. */
export function useResumenPeriodo(desde: string | null, hasta: string | null, habilitado = true) {
  return useQuery({
    queryKey: ['combustible', 'resumen-periodo', desde, hasta],
    enabled: habilitado,
    queryFn: () =>
      rpc<ResumenTanquePeriodo[]>('combustible_resumen_periodo', { p_desde: desde, p_hasta: hasta }),
  })
}

/** Altura → litros con la geometría del tanque, calculado en la base. */
export async function cubicarEnLaBase(almacenId: number, alturaCm: number) {
  const filas = await rpc<
    Array<{ litros: NumeroDeLaBase; capacidad: NumeroDeLaBase; nivel_pct: NumeroDeLaBase; saldo_libros: NumeroDeLaBase }>
  >('combustible_cubicar', { p_almacen_id: almacenId, p_altura_cm: alturaCm })
  const r = filas?.[0]
  if (!r) return null
  return {
    litros: Number(r.litros ?? 0),
    capacidad: r.capacidad == null ? null : Number(r.capacidad),
    nivel_pct: r.nivel_pct == null ? null : Number(r.nivel_pct),
    saldo_libros: Number(r.saldo_libros ?? 0),
  }
}

// ─── Movimientos ───────────────────────────────────────────────────────────

/** Lo común a los cinco tipos de Golden Touch. */
interface DatosComunes {
  fecha?: string | null
  /** «HH:MM» o «HH:MM:SS». */
  hora?: string | null
  autorizado?: string | null
  ubicacion?: string | null
  cuaderno?: boolean
  cuaderno_litros?: number | null
  articulo_id?: number | null
}

export interface DatosUso extends DatosComunes {
  almacen_id: number
  litros: number
  motivo: MotivoDespacho
  motivo_detalle?: string | null
  maquina_id?: number | null
  /** Cuando no hay ficha de máquina: a qué se le echó. */
  equipo?: string | null
  horometro_ini?: number | null
  horometro_fin?: number | null
  km?: number | null
  empleado_id?: number | null
  recibio_nombre?: string | null
  recibio_cedula?: string | null
  observacion?: string | null
  contador_ini?: number | null
  contador_fin?: number | null
}

/** Surtir a un equipo: el vale de siempre, con los datos de Golden Touch. */
export function useRegistrarUso() {
  return useAccionCombustible((d: DatosUso) =>
    rpc<{ despacho_id: number; movimiento_id: number; numero: string }>('combustible_registrar_uso', {
      p_almacen_id: d.almacen_id,
      p_litros: d.litros,
      p_motivo: d.motivo,
      p_motivo_detalle: d.motivo_detalle ?? null,
      p_maquina_id: d.maquina_id ?? null,
      p_equipo: d.equipo ?? null,
      p_horometro_ini: d.horometro_ini ?? null,
      p_horometro_fin: d.horometro_fin ?? null,
      p_km: d.km ?? null,
      p_empleado_id: d.empleado_id ?? null,
      p_recibio_nombre: d.recibio_nombre ?? null,
      p_recibio_cedula: d.recibio_cedula ?? null,
      p_autorizado: d.autorizado ?? null,
      p_ubicacion: d.ubicacion ?? null,
      p_observacion: d.observacion ?? null,
      p_contador_ini: d.contador_ini ?? null,
      p_contador_fin: d.contador_fin ?? null,
      p_cuaderno: d.cuaderno ?? false,
      p_cuaderno_litros: d.cuaderno_litros ?? null,
      p_fecha: d.fecha ?? null,
      p_hora: d.hora || null,
      p_articulo_id: d.articulo_id ?? null,
    }),
  )
}

export interface DatosEntrada extends DatosComunes {
  almacen_id: number
  litros: number
  costo_litro?: number | null
  /** Solo en el tanque del combustible sin costo. */
  sin_costo?: boolean
  /** De dónde vino. */
  motivo: string
  referencia?: string | null
  /** Lo que llegó de verdad: la diferencia queda como merma. */
  recibidos?: number | null
  merma_motivo?: string | null
  /** Ya vio el aviso de costo raro y lo acepta. */
  confirmado?: boolean
}

export function useRegistrarEntradaCombustible() {
  return useAccionCombustible((d: DatosEntrada) =>
    rpc<{ movimiento_id: number; merma_movimiento_id: number | null }>('combustible_registrar_entrada', {
      p_almacen_id: d.almacen_id,
      p_litros: d.litros,
      p_costo_litro: d.costo_litro ?? null,
      p_sin_costo: d.sin_costo ?? false,
      p_motivo: d.motivo,
      p_referencia: d.referencia ?? null,
      p_fecha: d.fecha ?? null,
      p_hora: d.hora || null,
      p_recibidos: d.recibidos ?? null,
      p_merma_motivo: d.merma_motivo ?? null,
      p_autorizado: d.autorizado ?? null,
      p_ubicacion: d.ubicacion ?? null,
      p_cuaderno: d.cuaderno ?? false,
      p_cuaderno_litros: d.cuaderno_litros ?? null,
      p_confirmado: d.confirmado ?? false,
      p_articulo_id: d.articulo_id ?? null,
    }),
  )
}

export interface DatosTraslado extends DatosComunes {
  origen_id: number
  destino_id: number
  litros: number
  observacion?: string | null
  contador_ini?: number | null
  contador_fin?: number | null
  recibidos?: number | null
  merma_motivo?: string | null
  propietario?: string | null
  /** Si el destino es un bidón, sale con vale: para qué y quién recibió. */
  motivo_vale?: MotivoDespacho | null
  motivo_detalle?: string | null
  empleado_id?: number | null
  recibio_nombre?: string | null
  recibio_cedula?: string | null
}

export interface ResultadoTraslado {
  salida_id: number
  entrada_id: number | null
  merma_movimiento_id: number | null
  bidon: boolean
  despacho_id: number | null
  numero: string | null
}

/** De un tanque a otro (o del almacén al tanque). A un bidón, es un surtido con vale. */
export function useTrasladarCombustible() {
  return useAccionCombustible((d: DatosTraslado) =>
    rpc<ResultadoTraslado>('combustible_trasladar', {
      p_origen_id: d.origen_id,
      p_destino_id: d.destino_id,
      p_litros: d.litros,
      p_motivo: d.observacion ?? null,
      p_fecha: d.fecha ?? null,
      p_hora: d.hora || null,
      p_autorizado: d.autorizado ?? null,
      p_ubicacion: d.ubicacion ?? null,
      p_contador_ini: d.contador_ini ?? null,
      p_contador_fin: d.contador_fin ?? null,
      p_recibidos: d.recibidos ?? null,
      p_merma_motivo: d.merma_motivo ?? null,
      p_cuaderno: d.cuaderno ?? false,
      p_cuaderno_litros: d.cuaderno_litros ?? null,
      p_articulo_id: d.articulo_id ?? null,
      p_propietario: d.propietario ?? null,
      p_motivo_vale: d.motivo_vale ?? null,
      p_motivo_detalle: d.motivo_detalle ?? null,
      p_empleado_id: d.empleado_id ?? null,
      p_recibio_nombre: d.recibio_nombre ?? null,
      p_recibio_cedula: d.recibio_cedula ?? null,
    }),
  )
}

export interface DatosMerma extends DatosComunes {
  almacen_id: number
  litros: number
  /** Por qué se perdió. */
  motivo: string
}

export function useRegistrarMerma() {
  return useAccionCombustible((d: DatosMerma) =>
    rpc<number>('combustible_registrar_merma', {
      p_almacen_id: d.almacen_id,
      p_litros: d.litros,
      p_motivo: d.motivo,
      p_fecha: d.fecha ?? null,
      p_hora: d.hora || null,
      p_autorizado: d.autorizado ?? null,
      p_ubicacion: d.ubicacion ?? null,
      p_articulo_id: d.articulo_id ?? null,
    }),
  )
}

export interface DatosRetorno extends DatosComunes {
  almacen_id: number
  litros: number
  /** De dónde vuelve. */
  motivo: string
  maquina_id?: number | null
  equipo?: string | null
}

export function useRegistrarRetorno() {
  return useAccionCombustible((d: DatosRetorno) =>
    rpc<number>('combustible_registrar_retorno', {
      p_almacen_id: d.almacen_id,
      p_litros: d.litros,
      p_motivo: d.motivo,
      p_maquina_id: d.maquina_id ?? null,
      p_equipo: d.equipo ?? null,
      p_fecha: d.fecha ?? null,
      p_hora: d.hora || null,
      p_autorizado: d.autorizado ?? null,
      p_ubicacion: d.ubicacion ?? null,
      p_articulo_id: d.articulo_id ?? null,
    }),
  )
}

/** «🗑 Eliminar» de Golden Touch: anular con motivo. El renglón queda tachado, con su reverso. */
export function useAnularMovimientoCombustible() {
  return useAccionCombustible((a: { movimiento_id: number; motivo: string }) =>
    rpc<number>('combustible_anular_movimiento', {
      p_movimiento_id: a.movimiento_id,
      p_motivo: a.motivo,
    }),
  )
}

/**
 * Lo que se corrige. Una clave ausente es «déjalo como está»; una con `null`,
 * «bórralo». Si cambian los litros, la fecha, el costo o el destino, hace falta
 * `motivo_correccion`: el movimiento viejo se anula y se registra uno nuevo.
 */
export interface CorreccionMovimiento {
  litros?: number
  fecha?: string
  hora?: string | null
  costo_litro?: number | null
  destino_id?: number
  motivo?: MotivoDespacho
  motivo_detalle?: string | null
  maquina_id?: number | null
  equipo?: string | null
  horometro_ini?: number | null
  horometro_fin?: number | null
  km?: number | null
  empleado_id?: number | null
  recibio_nombre?: string | null
  recibio_cedula?: string | null
  autorizado?: string | null
  ubicacion?: string | null
  observacion?: string | null
  contador_ini?: number | null
  contador_fin?: number | null
  recibidos?: number | null
  merma_motivo?: string | null
  confirmado?: boolean
  motivo_correccion?: string | null
}

export function useCorregirMovimientoCombustible() {
  return useAccionCombustible((c: { movimiento_id: number; datos: CorreccionMovimiento }) =>
    rpc<{ movimiento_id: number; camino: 'vale' | 'reverso' | 'datos' }>(
      'combustible_corregir_movimiento',
      { p_movimiento_id: c.movimiento_id, p_datos: c.datos },
    ),
  )
}

/** «📖 Cuaderno»: asentado en el cuaderno de campo, con sus litros. */
export function useMarcarCuaderno() {
  return useAccionCombustible((c: { movimiento_id: number; cuaderno: boolean; litros?: number | null }) =>
    rpc<void>('combustible_marcar_cuaderno', {
      p_movimiento_id: c.movimiento_id,
      p_cuaderno: c.cuaderno,
      p_litros: c.litros ?? null,
    }),
  )
}

// ─── Tanques ───────────────────────────────────────────────────────────────

export interface DatosTanque {
  /** Nulo: se crea el almacén de tipo COMBUSTIBLE. */
  almacen_id?: number | null
  nombre: string
  codigo?: string | null
  ubicacion?: string | null
  /** Capacidad rotulada. */
  capacidad?: number | null
  tipo_geometria?: TipoGeometria
  es_movil?: boolean
  es_bidon?: boolean
  radio_m?: number | null
  largo_m?: number | null
  ancho_m?: number | null
  alto_m?: number | null
  margen_merma_pct?: number | null
  merma_implicita_pct?: number | null
  orden?: number | null
  recibe_compras?: boolean | null
  sin_costo?: boolean | null
}

export function useGuardarTanque() {
  return useAccionCombustible((t: DatosTanque) =>
    rpc<number>('combustible_guardar_tanque', {
      p_almacen_id: t.almacen_id ?? null,
      p_nombre: t.nombre,
      p_codigo: t.codigo ?? null,
      p_ubicacion: t.ubicacion ?? null,
      p_capacidad: t.capacidad ?? null,
      p_tipo_geometria: t.tipo_geometria ?? 'rectangular',
      p_es_movil: t.es_movil ?? false,
      p_es_bidon: t.es_bidon ?? false,
      p_radio_m: t.radio_m ?? null,
      p_largo_m: t.largo_m ?? null,
      p_ancho_m: t.ancho_m ?? null,
      p_alto_m: t.alto_m ?? null,
      p_margen_merma_pct: t.margen_merma_pct ?? null,
      p_merma_implicita_pct: t.merma_implicita_pct ?? null,
      p_orden: t.orden ?? null,
      p_recibe_compras: t.recibe_compras ?? null,
      p_sin_costo: t.sin_costo ?? null,
    }),
  )
}

/** Apagar (vacío) o volver a encender un tanque. */
export function useDesactivarTanque() {
  return useAccionCombustible((t: { almacen_id: number; activo: boolean }) =>
    rpc<void>('combustible_desactivar_tanque', { p_almacen_id: t.almacen_id, p_activo: t.activo }),
  )
}

// ─── Catálogos ─────────────────────────────────────────────────────────────

export interface DatosCatalogo {
  id?: number | null
  tipo?: TipoCatalogoCombustible
  valor?: string | null
  maquina_id?: number | null
  activo?: boolean | null
  orden?: number | null
  /** Al corregir: nulo es «no lo toques», vacío es «de todos». */
  tanques_permitidos?: number[] | null
}

export function useGuardarCatalogo() {
  return useAccionCombustible((c: DatosCatalogo) =>
    rpc<number>('combustible_guardar_catalogo', {
      p_id: c.id ?? null,
      p_tipo: c.tipo ?? null,
      p_valor: c.valor ?? null,
      p_maquina_id: c.maquina_id ?? null,
      p_activo: c.activo ?? null,
      p_orden: c.orden ?? null,
      p_tanques_permitidos: c.tanques_permitidos ?? null,
    }),
  )
}

/** El valor escrito al vuelo: reutiliza el que ya existe (sin acentos ni mayúsculas) o lo crea. */
export function useAsegurarCatalogo() {
  return useAccionCombustible((c: { tipo: TipoCatalogoCombustible; valor: string }) =>
    rpc<number>('combustible_asegurar_catalogo', { p_tipo: c.tipo, p_valor: c.valor }),
  )
}

/** «¿Puede surtir?» de varios a la vez. */
export function useActivarCatalogos() {
  return useAccionCombustible((c: { ids: number[]; activo: boolean }) =>
    rpc<number>('combustible_activar_catalogos', { p_ids: c.ids, p_activo: c.activo }),
  )
}

/** De qué tanques surten unos equipos. Vacío: de todos. */
export function useFijarTanquesPermitidos() {
  return useAccionCombustible((c: { ids: number[]; tanques: number[] }) =>
    rpc<number>('combustible_fijar_tanques_permitidos', { p_ids: c.ids, p_tanques: c.tanques }),
  )
}

/** Solo lo que nunca se usó; lo usado se apaga. */
export function useBorrarCatalogo() {
  return useAccionCombustible((id: number) => rpc<void>('combustible_borrar_catalogo', { p_id: id }))
}

// ─── Cubicación y conciliación ─────────────────────────────────────────────

export function useRegistrarCubicacion() {
  return useAccionCombustible(
    (c: { almacen_id: number; altura_cm: number; fecha?: string | null; notas?: string | null }) =>
      rpc<number>('combustible_registrar_cubicacion', {
        p_almacen_id: c.almacen_id,
        p_altura_cm: c.altura_cm,
        p_fecha: c.fecha ?? null,
        p_notas: c.notas ?? null,
      }),
  )
}

export function useBorrarCubicacion() {
  return useAccionCombustible((id: number) => rpc<void>('combustible_borrar_cubicacion', { p_id: id }))
}

export interface DatosConciliacion {
  almacen_id: number
  saldo_reportado: number
  hasta?: string | null
  desde?: string | null
  saldo_cubicacion?: number | null
  periodo?: string | null
  notas?: string | null
}

export function useRegistrarConciliacion() {
  return useAccionCombustible((c: DatosConciliacion) =>
    rpc<number>('combustible_registrar_conciliacion', {
      p_almacen_id: c.almacen_id,
      p_saldo_reportado: c.saldo_reportado,
      p_hasta: c.hasta ?? null,
      p_desde: c.desde ?? null,
      p_saldo_cubicacion: c.saldo_cubicacion ?? null,
      p_periodo: c.periodo ?? null,
      p_notas: c.notas ?? null,
    }),
  )
}
