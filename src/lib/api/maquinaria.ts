import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/**
 * Las máquinas, su horómetro y su paso por el taller.
 *
 * TODO SE ESCRIBE POR `rpc()`
 *
 * Este archivo llegó a ser uno de los dos únicos de `src/lib/api/` que escribía
 * con `.insert()` y `.update()` directos. Ya no: los permisos de escritura
 * sobre estas tablas están revocados y la única puerta son las funciones
 * `security definer` de la base, como en el resto del sistema. No es solo
 * coherencia — con el permiso abierto, cualquiera con sesión podía escribir
 * desde la consola del navegador saltándose todo lo que comprueba la pantalla,
 * y no había un sitio donde poner esas comprobaciones.
 *
 * EL SEMÁFORO NO SE CALCULA AQUÍ
 *
 * Viene de `v_maquinaria`, que lo deriva de los umbrales de cada máquina. Si el
 * front lo recalculara, dos pantallas podrían discrepar sobre si una máquina
 * puede seguir trabajando, y esa es de las cosas que no admiten dos opiniones.
 */

export type Semaforo = 'OK' | 'AVISO' | 'ALARMA' | 'BLOQUEANTE'

export type EstadoMaquina =
  | 'ACTIVA'
  | 'EN_ESPERA'
  | 'EN_MANTENIMIENTO'
  | 'FUERA_DE_SERVICIO'
  | 'DESINCORPORADA'

export interface Maquina {
  id: number
  codigo: string
  nombre: string
  tipo: string
  marca: string | null
  modelo: string | null
  serial: string | null
  anio: number | null
  almacen_id: number | null
  almacen: string | null
  almacen_tipo: string | null
  estado: EstadoMaquina
  tope_horas: string
  aviso_horas: string
  alarma_horas: string
  /** Cuánto suele tardar su mantenimiento. Nulo si nadie lo ha estimado. */
  dias_mantenimiento: number | null
  nota: string | null
  activa: boolean
  /** Lo que lleva trabajado desde el último mantenimiento cerrado. */
  horas_desde_mant: string
  horas_totales: string
  horas_para_el_tope: string
  ultima_lectura: string | null
  horometro_actual: string | null
  ultimo_mantenimiento: string | null
  semaforo: Semaforo

  /** La orden de taller abierta, si la tiene. */
  mantenimiento_abierto_id: number | null
  mantenimiento_desde: string | null
  mantenimiento_taller_id: number | null
  dias_en_taller: number | null
  /** Si lleva más días dentro de los estimados. Nulo si nadie estimó nada. */
  se_paso_en_el_taller: boolean | null
}

export interface Lectura {
  id: number
  maquina_id: number
  fecha: string
  inicial: string
  final: string
  horas: string
  operador_id: number | null
  nota: string | null
}

export type EstadoOrden = 'ABIERTO' | 'CERRADO' | 'ANULADO'

export interface Mantenimiento {
  id: number
  numero: string | null
  maquina_id: number
  maquina_codigo: string
  maquina: string
  maquina_tipo: string
  tipo: 'MANTENIMIENTO' | 'SERVICIO'
  estado: EstadoOrden
  /** Por qué entró. Se pide al abrir. */
  motivo: string | null
  /** Qué se le hizo. Se pide al cerrar. */
  detalle: string | null
  /** El día que entró al taller. */
  fecha: string
  fecha_salida: string | null
  dias_estimados: number | null
  /** Días dentro: los que lleva si sigue abierta, los que tardó si cerró. */
  dias: number | null
  horometro: string | null
  taller_id: number | null
  taller: string | null
  costo_usd: string | null
  costo_repuestos_usd: string
  costo_total_usd: string
  repuestos: number
  motivo_anulacion: string | null
  registrado_en: string
}

export interface RepuestoUsado {
  articulo_id: number
  cantidad: number
}

export const TIPOS_MAQUINA = [
  { valor: 'EXCAVADORA', etiqueta: 'Excavadora' },
  { valor: 'CARGADOR', etiqueta: 'Cargador' },
  { valor: 'CAMION', etiqueta: 'Camión' },
  { valor: 'PLANTA', etiqueta: 'Planta' },
  { valor: 'PERFORADORA', etiqueta: 'Perforadora' },
  { valor: 'VEHICULO', etiqueta: 'Vehículo' },
  { valor: 'GENERADOR', etiqueta: 'Generador' },
  { valor: 'OTRO', etiqueta: 'Otro' },
]

/**
 * Los estados, con lo que significa cada uno.
 *
 * EN_MANTENIMIENTO no está en la lista que se ofrece para elegir: a ese estado
 * se entra abriendo la orden de taller y se sale cerrándola. Ofrecerlo aquí
 * sería una puerta lateral que se salta el contador de horas y el descuento de
 * repuestos.
 */
export const ESTADOS_MAQUINA = [
  { valor: 'ACTIVA', etiqueta: 'Activa', detalle: 'Trabajando o asignada a un frente.' },
  { valor: 'EN_ESPERA', etiqueta: 'En espera', detalle: 'Sana y disponible, sin asignar.' },
  {
    valor: 'FUERA_DE_SERVICIO',
    etiqueta: 'Fuera de servicio',
    detalle: 'Averiada o parada sin fecha. No se puede mandar a trabajar.',
  },
  {
    valor: 'DESINCORPORADA',
    etiqueta: 'Desincorporada',
    detalle: 'Ya no es de la flota. Se conserva por su historial.',
  },
]

export const ETIQUETA_ESTADO: Record<EstadoMaquina, string> = {
  ACTIVA: 'Activa',
  EN_ESPERA: 'En espera',
  EN_MANTENIMIENTO: 'En el taller',
  FUERA_DE_SERVICIO: 'Fuera de servicio',
  DESINCORPORADA: 'Desincorporada',
}

// ---------------------------------------------------------------------------
// Leer
// ---------------------------------------------------------------------------

export function useMaquinaria(soloActivas = true) {
  return useQuery({
    queryKey: ['maquinaria', soloActivas],
    queryFn: async () => {
      let q = supabase.from('v_maquinaria').select('*').order('codigo')
      if (soloActivas) q = q.eq('activa', true)
      return desenvolver<Maquina[]>(await q)
    },
  })
}

export function useLecturas(maquinaId: number | null) {
  return useQuery({
    queryKey: ['maquinaria', 'lecturas', maquinaId],
    enabled: maquinaId !== null,
    queryFn: async () =>
      desenvolver<Lectura[]>(
        await supabase
          .from('horometro_lecturas')
          .select('*')
          .eq('maquina_id', maquinaId!)
          .order('fecha', { ascending: false })
          .limit(60),
      ),
  })
}

export function useMantenimientos(maquinaId: number | null) {
  return useQuery({
    queryKey: ['maquinaria', 'mantenimientos', maquinaId],
    enabled: maquinaId !== null,
    queryFn: async () =>
      desenvolver<Mantenimiento[]>(
        await supabase
          .from('v_mantenimientos')
          .select('*')
          .eq('maquina_id', maquinaId!)
          .order('fecha', { ascending: false })
          .limit(60),
      ),
  })
}

/**
 * Lo reparado en un taller, sea de la máquina que sea.
 *
 * Es la otra mitad de lo que hace un taller: la primera es lo que tiene
 * asignado en inventario, y esta es en qué lo gastó.
 */
export function useMantenimientosDeTaller(tallerId: number | null) {
  return useQuery({
    queryKey: ['maquinaria', 'mantenimientos-taller', tallerId],
    enabled: tallerId !== null,
    queryFn: async () =>
      desenvolver<Mantenimiento[]>(
        await supabase
          .from('v_mantenimientos')
          .select('*')
          .eq('taller_id', tallerId!)
          .order('fecha', { ascending: false })
          .limit(40),
      ),
  })
}

/** El reporte de taller entero, para la pantalla de historial. */
export function useReporteMantenimientos(estado?: EstadoOrden) {
  return useQuery({
    queryKey: ['maquinaria', 'reporte', estado ?? 'todo'],
    queryFn: async () => {
      let q = supabase
        .from('v_mantenimientos')
        .select('*')
        .order('fecha', { ascending: false })
        .limit(300)
      if (estado) q = q.eq('estado', estado)
      return desenvolver<Mantenimiento[]>(await q)
    },
  })
}

/** Los repuestos que se le pusieron a una orden. */
export function useRepuestosDeOrden(ordenId: number | null) {
  return useQuery({
    queryKey: ['maquinaria', 'repuestos', ordenId],
    enabled: ordenId !== null,
    queryFn: async () =>
      desenvolver<
        Array<{ id: number; articulo_id: number; cantidad: string; costo_usd: string }>
      >(
        await supabase
          .from('mantenimiento_repuestos')
          .select('id, articulo_id, cantidad, costo_usd')
          .eq('mantenimiento_id', ordenId!),
      ),
  })
}

/**
 * Lo que hay que atender.
 *
 * Se resuelve aquí y no en cada pantalla para que el Panel, el tablero y el
 * aviso de la barra cuenten lo mismo. Ordenado por gravedad y, dentro de cada
 * nivel, por lo que lleva más horas de más: si hay tres bloqueadas, la que peor
 * está va primero.
 */
export function useMaquinasQueUrgen() {
  const consulta = useMaquinaria(true)
  const orden: Record<Semaforo, number> = { BLOQUEANTE: 0, ALARMA: 1, AVISO: 2, OK: 3 }

  const urgentes = (consulta.data ?? [])
    .filter((m) => m.semaforo !== 'OK')
    .sort(
      (a, b) =>
        orden[a.semaforo] - orden[b.semaforo] ||
        Number(b.horas_desde_mant) - Number(a.horas_desde_mant),
    )

  return { ...consulta, urgentes }
}

// ---------------------------------------------------------------------------
// Escribir — todo por función de la base
// ---------------------------------------------------------------------------

function useAccion<A>(fn: (args: A) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['maquinaria'] })
      // Cerrar una orden con repuestos descuenta del taller: el inventario que
      // se esté mirando en otra pestaña ya no es el que hay.
      void qc.invalidateQueries({ queryKey: ['existencias'] })
      void qc.invalidateQueries({ queryKey: ['existencias-totales'] })
    },
  })
}

export function useGuardarMaquina() {
  return useAccion(
    async (m: {
      id?: number | null
      codigo: string
      nombre: string
      tipo: string
      marca?: string | null
      modelo?: string | null
      serial?: string | null
      anio?: number | null
      almacen_id?: number | null
      tope_horas: number
      aviso_horas: number
      alarma_horas: number
      dias_mantenimiento?: number | null
      nota?: string | null
    }) =>
      rpc<number>('guardar_maquina', {
        p_id: m.id ?? null,
        p_codigo: m.codigo,
        p_nombre: m.nombre,
        p_tipo: m.tipo,
        p_marca: m.marca ?? null,
        p_modelo: m.modelo ?? null,
        p_serial: m.serial ?? null,
        p_anio: m.anio ?? null,
        p_almacen_id: m.almacen_id ?? null,
        p_tope_horas: m.tope_horas,
        p_aviso_horas: m.aviso_horas,
        p_alarma_horas: m.alarma_horas,
        p_dias_mantenimiento: m.dias_mantenimiento ?? null,
        p_nota: m.nota ?? null,
      }),
  )
}

/**
 * Anotar el horómetro del día.
 *
 * La función reemplaza la lectura si ya hay una de ese día: anotarla al
 * arrancar y completarla al terminar el turno es lo normal, y sin eso el
 * segundo intento chocaría contra la restricción de una lectura por día.
 */
export function useGuardarLectura() {
  return useAccion(
    async (l: { maquina_id: number; fecha: string; inicial: number; final: number }) =>
      rpc<number>('registrar_lectura', {
        p_maquina_id: l.maquina_id,
        p_fecha: l.fecha,
        p_inicial: l.inicial,
        p_final: l.final,
      }),
  )
}

/** La máquina entra al taller. */
export function useAbrirMantenimiento() {
  return useAccion(
    async (m: {
      maquina_id: number
      tipo: 'MANTENIMIENTO' | 'SERVICIO'
      motivo: string
      taller_id?: number | null
      fecha?: string | null
      dias_estimados?: number | null
    }) =>
      rpc<number>('abrir_mantenimiento', {
        p_maquina_id: m.maquina_id,
        p_tipo: m.tipo,
        p_motivo: m.motivo,
        p_taller_id: m.taller_id ?? null,
        p_fecha: m.fecha ?? null,
        p_dias_estimados: m.dias_estimados ?? null,
      }),
  )
}

/** La máquina sale del taller, y sale a espera salvo que se diga otra cosa. */
export function useCerrarMantenimiento() {
  return useAccion(
    async (m: {
      id: number
      detalle: string
      costo_usd?: number | null
      repuestos?: RepuestoUsado[]
      estado_salida?: 'EN_ESPERA' | 'ACTIVA' | 'FUERA_DE_SERVICIO'
      fecha_salida?: string | null
    }) =>
      rpc<number>('cerrar_mantenimiento', {
        p_id: m.id,
        p_detalle: m.detalle,
        p_costo_usd: m.costo_usd ?? null,
        p_repuestos: m.repuestos ?? [],
        p_estado_salida: m.estado_salida ?? 'EN_ESPERA',
        p_fecha_salida: m.fecha_salida ?? null,
      }),
  )
}

export function useAnularMantenimiento() {
  return useAccion(async (m: { id: number; motivo: string }) =>
    rpc<number>('anular_mantenimiento', { p_id: m.id, p_motivo: m.motivo }),
  )
}

export function useCambiarEstadoMaquina() {
  return useAccion(
    async (m: { id: number; estado: string; motivo?: string | null }) =>
      rpc<number>('cambiar_estado_maquina', {
        p_id: m.id,
        p_estado: m.estado,
        p_motivo: m.motivo ?? null,
      }),
  )
}
