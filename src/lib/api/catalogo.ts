import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export type Rol =
  | 'ADMIN'
  | 'GERENTE_GENERAL'
  | 'COMPRAS'
  | 'TESORERIA'
  | 'ALMACEN'
  | 'OPERACIONES'
  | 'RRHH'
  | 'SOLICITANTE'
  | 'CONSULTA'

/**
 * Los roles solo deciden qué botones se dibujan. Quien intente la acción sin
 * el rol recibe el mismo "no" de la base, así que ocultar el botón es
 * cortesía, no seguridad.
 */
export function useMisRoles() {
  const consulta = useQuery({
    queryKey: ['mis-roles'],
    queryFn: () => rpc<Rol[]>('mis_roles'),
    staleTime: 5 * 60_000,
  })

  const roles = consulta.data ?? []
  const puede = (...requeridos: Rol[]) =>
    roles.includes('ADMIN') || requeridos.some((r) => roles.includes(r))

  return { ...consulta, roles, puede }
}

export function usePerfiles() {
  return useQuery({
    queryKey: ['perfiles'],
    queryFn: async () =>
      desenvolver(
        await supabase
          .from('perfiles')
          .select('id, usuario, nombre, cargo, activo')
          .order('nombre'),
      ),
    staleTime: 5 * 60_000,
  })
}

// ---------------------------------------------------------------------------
// Unidades y artículos
// ---------------------------------------------------------------------------

export interface Unidad {
  codigo: string
  nombre: string
  tipo: string
}

export interface Articulo {
  id: number
  codigo: string
  nombre: string
  descripcion: string | null
  categoria: string
  unidad: string
  inventariable: boolean
  /**
   * Si esto se puede mandar al taller y volver arreglado.
   *
   * Lo pidió Christopher viendo el selector del taller lleno de aceite de motor
   * y arena lavada: «no podemos mandar al taller a reparar un pote de aceite».
   * Un repuesto vuelve arreglado; un litro de aceite no se rectifica, se gasta.
   */
  reparable: boolean
  stock_minimo: string
  activo: boolean
  /**
   * Qué pasa cuando se le entrega a una persona.
   *
   * `NO` no se entrega a nadie, `RETORNABLE` se presta y vuelve, `CONSUMIBLE`
   * se lo lleva y no vuelve. Solo lo retornable aparece en asignaciones:
   * prestar algo que se consume abre una deuda que no puede cerrarse.
   */
  modo_entrega: string
}

export const CATEGORIAS_ARTICULO = [
  { valor: 'PRODUCTO', etiqueta: 'Producto de cantera' },
  { valor: 'REPUESTO', etiqueta: 'Repuesto' },
  { valor: 'INSUMO', etiqueta: 'Insumo' },
  { valor: 'COMBUSTIBLE', etiqueta: 'Combustible' },
  { valor: 'LUBRICANTE', etiqueta: 'Lubricante' },
  { valor: 'EPP', etiqueta: 'Equipo de protección' },
  { valor: 'HERRAMIENTA', etiqueta: 'Herramienta' },
  { valor: 'EXPLOSIVO', etiqueta: 'Explosivo' },
  { valor: 'SERVICIO', etiqueta: 'Servicio' },
]

/*
  CÓMO SE COMPORTA UN ARTÍCULO AL ENTREGARLO

  Christopher lo vio con la gasolina: el sistema ofrecía entregarla a un
  trabajador diciendo «queda a su nombre hasta que la devuelva». Entregar un
  destornillador y entregar gasolina no son la misma operación.
*/
export const MODOS_ENTREGA = [
  {
    valor: 'RETORNABLE',
    etiqueta: 'Se presta y vuelve',
    ayuda: 'Queda a nombre de quien lo recibe y se le pide de vuelta. Aparece en Asignaciones.',
  },
  {
    valor: 'CONSUMIBLE',
    etiqueta: 'Se entrega y no vuelve',
    ayuda: 'Se gasta al usarlo. Sale por su propio camino —combustible, dotación, movimiento de almacén— y no como préstamo.',
  },
  {
    valor: 'NO',
    etiqueta: 'No se le entrega a una persona',
    ayuda: 'Lo que se vende o se contrata. Nadie se lo lleva.',
  },
]

export function useUnidades() {
  return useQuery({
    queryKey: ['unidades'],
    queryFn: async () =>
      desenvolver<Unidad[]>(
        await supabase.from('unidades').select('codigo, nombre, tipo').order('orden'),
      ),
    staleTime: Infinity,
  })
}

export function useArticulos(soloActivos = true) {
  return useQuery({
    queryKey: ['articulos', soloActivos],
    queryFn: async () => {
      let q = supabase.from('articulos').select('*').order('nombre')
      if (soloActivos) q = q.eq('activo', true)
      return desenvolver<Articulo[]>(await q)
    },
    staleTime: 5 * 60_000,
  })
}

export function useCrearArticulo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: {
      codigo: string
      nombre: string
      categoria: string
      unidad: string
      descripcion?: string
      inventariable?: boolean
      reparable?: boolean
      stock_minimo?: number
      modo_entrega?: string
    }) =>
      rpc<number>('crear_articulo', {
        p_reparable: a.reparable ?? null,
        p_codigo: a.codigo,
        p_nombre: a.nombre,
        p_categoria: a.categoria,
        p_unidad: a.unidad,
        p_descripcion: a.descripcion ?? null,
        p_inventariable: a.inventariable ?? true,
        p_stock_minimo: a.stock_minimo ?? 0,
        p_modo_entrega: a.modo_entrega ?? null,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['articulos'] }),
  })
}

/**
 * Corregir un artículo ya creado.
 *
 * El código no viaja: es con lo que se pide en el almacén y ya está impreso en
 * órdenes y guías emitidas. Todo lo demás sí, porque un nombre mal tecleado se
 * quedaba mal para siempre.
 */
export function useEditarArticulo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: {
      id: number
      nombre: string
      categoria: string
      unidad: string
      descripcion?: string
      inventariable?: boolean
      reparable?: boolean
      stock_minimo?: number
      modo_entrega?: string
    }) =>
      rpc('editar_articulo', {
        p_reparable: a.reparable ?? null,
        p_id: a.id,
        p_nombre: a.nombre,
        p_categoria: a.categoria,
        p_unidad: a.unidad,
        p_descripcion: a.descripcion ?? null,
        p_inventariable: a.inventariable ?? true,
        p_stock_minimo: a.stock_minimo ?? 0,
        p_modo_entrega: a.modo_entrega ?? null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['articulos'] })
      void qc.invalidateQueries({ queryKey: ['asignables'] })
    },
  })
}

/**
 * Borrar uno creado por error.
 *
 * Solo sale si no lo ha tocado nada. En cuanto aparece en una orden, un
 * movimiento o una guía, la base lo impide y el mensaje dice qué hacer en su
 * lugar: desactivarlo.
 */
export function useEliminarArticulo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: { id: number }) => rpc('eliminar_articulo', { p_id: a.id }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['articulos'] }),
  })
}

export function useCambiarEstadoArticulo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: { id: number; activo: boolean }) =>
      rpc('cambiar_estado_articulo', { p_id: a.id, p_activo: a.activo }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['articulos'] }),
  })
}

// ---------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------

export interface Proveedor {
  id: number
  rif: string
  nombre: string
  nombre_comercial: string | null
  contacto: string | null
  telefono: string | null
  correo: string | null
  direccion: string | null
  condicion_pago: string
  moneda_preferida: string
  /** Cómo suele cobrar. Se propone al pagarle; no obliga. */
  metodo_pago_preferido: string | null
  contribuyente_especial: boolean
  activo: boolean
  notas: string | null
}

/**
 * Cómo se paga una compra.
 *
 * `CONTRA_ENTREGA` no es una etiqueta más: cambia el orden del recorrido. Las
 * otras tres dicen CUÁNDO se paga —ahora, o a tantos días— pero todas pagan
 * antes de recibir. Contra entrega recibe primero y paga solo lo que llegó, así
 * que la orden nace en `POR_RECIBIR` en vez de esperando instrucción de pago.
 *
 * Esta lista es la de compras. Ventas tiene la suya en `ventas.ts` y de momento
 * no ofrece contra entrega: nadie lo ha pedido de ese lado, y un valor que
 * ninguna pantalla ofrece es una puerta sin puerta detrás.
 */
export const CONDICIONES_PAGO = [
  { valor: 'CONTADO', etiqueta: 'De contado' },
  { valor: 'CONTRA_ENTREGA', etiqueta: 'Contra entrega' },
  { valor: 'CREDITO_15', etiqueta: 'Crédito 15 días' },
  { valor: 'CREDITO_30', etiqueta: 'Crédito 30 días' },
  { valor: 'CREDITO_60', etiqueta: 'Crédito 60 días' },
]

export function useProveedores(soloActivos = true) {
  return useQuery({
    queryKey: ['proveedores', soloActivos],
    queryFn: async () => {
      let q = supabase.from('proveedores').select('*').order('nombre')
      if (soloActivos) q = q.eq('activo', true)
      return desenvolver<Proveedor[]>(await q)
    },
    staleTime: 5 * 60_000,
  })
}

export function useGuardarProveedor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: Partial<Proveedor> & { rif: string; nombre: string }) =>
      rpc<number>('guardar_proveedor', {
        p_id: p.id ?? null,
        p_rif: p.rif,
        p_nombre: p.nombre,
        p_nombre_comercial: p.nombre_comercial ?? null,
        p_contacto: p.contacto ?? null,
        p_telefono: p.telefono ?? null,
        p_correo: p.correo ?? null,
        p_direccion: p.direccion ?? null,
        p_condicion_pago: p.condicion_pago ?? 'CONTADO',
        p_moneda_preferida: p.moneda_preferida ?? 'USD',
        p_contribuyente_especial: p.contribuyente_especial ?? false,
        p_notas: p.notas ?? null,
        p_activo: p.activo ?? true,
        p_metodo_pago_preferido: p.metodo_pago_preferido ?? null,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['proveedores'] }),
  })
}
