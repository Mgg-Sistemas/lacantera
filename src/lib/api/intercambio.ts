import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'
import type { Orden } from './compras'

/*
  COMPRA POR INTERCAMBIO: PAGAR UNA COMPRA CON MATERIAL

  Christopher, 17/09/2026: «se puede comprar un item, y pagar con ej. arena
  lavada», y «la compra con materiales es lo mismo que decir compra por
  intercambio». El recorrido, que decide la base y aquí solo se cuenta:

    1. Compras INDICA el pago con material: qué, de qué patio, cuánto y a qué
       precio (el de ventas). Nace una instrucción por pagar.
    2. Compras lo REGISTRA: la compra queda pagada en lo que vale el material, y
       nace la orden de salida para almacén —«solo creará la solicitud para
       almacén cuando sea pagada»—, con aviso.
    3. Almacén aprueba y entrega esa orden de salida. Sale la nota de salida, y
       lo que el material vale de más queda a favor de la empresa.

  Si almacén no la aprueba, el pago vuelve a Compras. Si la compra se cancela o
  el proveedor desiste, la salida que no ha salido se cancela con ella: «la
  salida del almacén, al estar relacionada con una compra, deberá depender del
  estatus de esa compra».

  Plan y decisiones: docs/plan-compra-por-intercambio.md.
*/

export type CondicionDelMaterial = 'LISTA' | 'DESCUENTO' | 'ACORDADO'
export type ExcedenteComo = 'CREDITO' | 'POR_COBRAR'

/** Lo que dice una instrucción de pago con material. */
export interface PagoConMaterial {
  id: number
  articulo_id: number
  almacen_id: number
  propietario: string
  cantidad: string
  unidad: string
  /** Lo que sale del patio, en la unidad del patio. */
  cantidad_inventario: string
  medida: 'DIRECTA' | 'ESTIMADA'
  densidad_usada: string | null
  condicion: CondicionDelMaterial
  precio_lista: string | null
  descuento_pct: string | null
  descuento_unitario: string | null
  motivo_condicion: string | null
  moneda: string
  precio_unitario: string
  valor: string
  /** Lo que paga de la orden. */
  aplicado: string
  /** Lo que el material vale de más, y qué pasa con ello. */
  excedente: string
  excedente_como: ExcedenteComo | null
  articulo: { codigo: string; nombre: string; unidad: string } | null
  almacen: { nombre: string } | null
  /** La orden de salida. Nula hasta que se registra el pago. */
  solicitud: {
    numero: string
    estado: 'PEDIDA' | 'APROBADA' | 'ENTREGADA' | 'RECHAZADA' | 'CANCELADA'
    nota_salida: string | null
    cierre_motivo: string | null
  } | null
  /** El saldo a favor que dejó al entregarse, si sobró. */
  saldo: { numero: string; forma: string; estado: string; pendiente: string } | null
}

/** Lo que se pide junto a cada instrucción de pago para ver su material. */
export const SELECT_MATERIAL = `material:pagos_con_material(
      *,
      articulo:articulos(codigo, nombre, unidad),
      almacen:almacenes(nombre),
      solicitud:solicitudes_salida(numero, estado, nota_salida, cierre_motivo),
      saldo:saldos_a_favor(numero, forma, estado, pendiente)
    )`

export const CONDICION_DEL_MATERIAL: Record<CondicionDelMaterial, string> = {
  LISTA: 'Precio de lista',
  DESCUENTO: 'Con descuento',
  ACORDADO: 'Precio acordado',
}

export const EXCEDENTE_COMO: Record<ExcedenteComo, { etiqueta: string; explica: string; corto: string }> = {
  CREDITO: {
    etiqueta: 'Crédito para la próxima compra',
    explica: 'Se descuenta de otra orden a este mismo proveedor.',
    corto: 'como crédito con este proveedor',
  },
  POR_COBRAR: {
    etiqueta: 'Por cobrarle al proveedor',
    explica: 'El proveedor la paga en dinero, y entra a una cuenta.',
    corto: 'por cobrarle al proveedor',
  },
}

/** En qué va la orden de salida, dicho para quien pagó. */
export const PASO_DE_LA_SALIDA: Record<
  NonNullable<PagoConMaterial['solicitud']>['estado'],
  { texto: string; tono: 'warning' | 'success' | 'danger' | 'neutral' }
> = {
  PEDIDA: { texto: 'almacén todavía no la aprueba', tono: 'warning' },
  APROBADA: { texto: 'aprobada, falta que almacén la entregue', tono: 'warning' },
  ENTREGADA: { texto: 'entregada', tono: 'success' },
  RECHAZADA: { texto: 'almacén no la aprobó', tono: 'danger' },
  CANCELADA: { texto: 'cancelada', tono: 'neutral' },
}

/**
 * Lo que falta por instruir de una orden, en su moneda.
 *
 * Es la cuenta de `indicar_pago` en la base, la misma que usa la ventana de
 * pago: lo que está en la moneda de la orden va tal cual, y lo demás se
 * reconvierte con la tasa congelada de la orden.
 */
export function pendienteDeOrden(orden: Orden): number {
  const tasaOrden = Number(orden.tasa) || 0
  const comprometido = orden.instrucciones
    .filter((i) => i.estado === 'POR_PAGAR' || i.estado === 'PAGADA')
    .reduce(
      (s, i) =>
        s +
        (i.moneda === orden.moneda
          ? Number(i.monto)
          : tasaOrden > 0
            ? Number(i.monto_bs) / tasaOrden
            : 0),
      0,
    )
  return Math.max((Number(orden.total) || 0) - comprometido, 0)
}

function useAccionIntercambio<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      // Un pago con material toca compras, la cola de pagos, las salidas y el
      // saldo del proveedor: todo lo que lo enseña se vuelve a pedir.
      for (const clave of ['compras', 'tesoreria', 'solicitudes-salida', 'saldos-a-favor', 'notificaciones']) {
        void qc.invalidateQueries({ queryKey: [clave] })
      }
    },
  })
}

export function useIndicarPagoConMaterial() {
  return useAccionIntercambio(
    (p: {
      orden_id: number
      articulo_id: number
      almacen_id: number
      cantidad: number
      unidad: string
      condicion: CondicionDelMaterial
      descuento_pct?: number | null
      descuento_unitario?: number | null
      precio_acordado?: number | null
      excedente_como?: ExcedenteComo | null
      nota?: string | null
    }) =>
      rpc<number>('indicar_pago_con_material', {
        p_orden_id: p.orden_id,
        p_articulo_id: p.articulo_id,
        p_almacen_id: p.almacen_id,
        p_cantidad: p.cantidad,
        p_unidad: p.unidad,
        p_condicion: p.condicion,
        p_descuento_pct: p.descuento_pct ?? null,
        p_descuento_unitario: p.descuento_unitario ?? null,
        p_precio_acordado: p.precio_acordado ?? null,
        p_motivo_condicion: null,
        p_excedente_como: p.excedente_como ?? null,
        p_propietario: null,
        p_nota: p.nota || null,
      }),
  )
}

/** Devuelve el número de la orden de salida que nace. */
export function useRegistrarPagoConMaterial() {
  return useAccionIntercambio(
    (p: { instruccion_id: number; recibe: string; nota?: string | null; con_firma: boolean }) =>
      rpc<string>('registrar_pago_con_material', {
        p_instruccion_id: p.instruccion_id,
        p_recibe: p.recibe,
        p_nota: p.nota || null,
        p_con_firma: p.con_firma,
      }),
  )
}

// ---------------------------------------------------------------------------
// Saldos a favor
// ---------------------------------------------------------------------------

export interface MovimientoDeSaldo {
  id: number
  tipo: 'APLICADO' | 'COBRADO'
  monto: string
  referencia: string | null
  fecha: string
  nota: string | null
  orden: { numero: string; solicitud_id: number } | null
}

export interface SaldoAFavor {
  id: number
  numero: string
  proveedor_id: number | null
  a_favor_de: 'EMPRESA' | 'CONTRAPARTE'
  forma: 'CREDITO' | 'POR_COBRAR' | 'POR_PAGAR'
  moneda: string
  monto: string
  pendiente: string
  estado: 'ABIERTO' | 'LIQUIDADO' | 'ANULADO'
  motivo: string
  creado_en: string
  orden: { numero: string; solicitud_id: number } | null
  movimientos: MovimientoDeSaldo[]
}

export function useSaldosAFavor(proveedorId: number | null | undefined) {
  return useQuery({
    queryKey: ['saldos-a-favor', proveedorId],
    enabled: proveedorId != null,
    queryFn: async () =>
      desenvolver<SaldoAFavor[]>(
        await supabase
          .from('saldos_a_favor')
          .select(
            '*, orden:ordenes_compra(numero, solicitud_id), movimientos:saldo_movimientos(*, orden:ordenes_compra(numero, solicitud_id))',
          )
          .eq('proveedor_id', proveedorId!)
          .order('creado_en', { ascending: false }),
      ),
  })
}

export function useUsarSaldoAFavor() {
  return useAccionIntercambio(
    (p: { orden_id: number; saldo_id: number; monto: number; nota?: string | null }) =>
      rpc<number>('usar_saldo_a_favor', {
        p_orden_id: p.orden_id,
        p_saldo_id: p.saldo_id,
        p_monto: p.monto,
        p_nota: p.nota || null,
      }),
  )
}

export function useCobrarSaldoAFavor() {
  return useAccionIntercambio(
    (p: {
      saldo_id: number
      cuenta_id: number
      monto: number
      referencia?: string | null
      fecha?: string | null
      nota?: string | null
    }) =>
      rpc<number>('cobrar_saldo_a_favor', {
        p_saldo_id: p.saldo_id,
        p_cuenta_id: p.cuenta_id,
        p_monto: p.monto,
        p_referencia: p.referencia || null,
        p_fecha: p.fecha || null,
        p_nota: p.nota || null,
      }),
  )
}
