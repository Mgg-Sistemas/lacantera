import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
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
