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

  Cuatro y no siete: quien llena el vale son las cinco de la manana, con guantes
  mojados y una maquina esperando. Una lista larga se contesta siempre con la
  primera opcion, y entonces el dato existe pero no informa.

  La lista vive tambien en un CHECK de la base. Aqui esta para pintar el
  desplegable y traducir el codigo a algo legible; la que manda es la de alla.
*/
export type MotivoDespacho = 'OPERACION' | 'TALLER' | 'PLANTA' | 'TERCERO'

export const MOTIVOS: Array<{ valor: MotivoDespacho; etiqueta: string; pista: string }> = [
  { valor: 'OPERACION', etiqueta: 'Operacion', pista: 'Arrancar y trabajar: producir o acarrear' },
  { valor: 'TALLER', etiqueta: 'Taller', pista: 'Mantenimiento, y la prueba de despues' },
  { valor: 'PLANTA', etiqueta: 'Planta', pista: 'La planta fija y los generadores' },
  { valor: 'TERCERO', etiqueta: 'Tercero', pista: 'Equipo que no es de la casa' },
]

export interface DespachoCombustible {
  id: number
  numero: string | null
  fecha: string
  /** Nula cuando el vale se transcribio otro dia: no la sabemos. */
  hora: string | null
  motivo: MotivoDespacho
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
export function useTanques() {
  return useQuery({
    queryKey: ['combustible', 'tanques'],
    queryFn: async () =>
      desenvolver<
        Array<{
          almacen_id: number
          almacen: string
          articulo_id: number
          articulo: string
          unidad: string
          existencia: string
          stock_minimo: string
          costo_promedio_usd: string | null
        }>
      >(
        await supabase
          .from('v_existencias')
          .select('almacen_id, almacen, articulo_id, articulo, unidad, existencia, stock_minimo, costo_promedio_usd')
          .eq('categoria', 'COMBUSTIBLE')
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
