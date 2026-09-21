import { supabase } from '@/lib/supabase'
import { desenvolver } from './rpc'

/*
  LO QUE LEEN LOS REPORTES DE TESORERÍA

  Christopher, 21/09/2026: Tesorería vuelve, «todo con sus reportes».

  Se lee de `v_tesoreria_libro`, que trae el Debe, el Haber y el saldo corriente
  de cada cuenta ya calculados por la base. El saldo no se guarda en ningún
  sitio: sale de sumar el libro, que no se puede editar ni borrar —solo
  reversar—. Por eso un mes pasado, vuelto a calcular hoy, da exactamente lo
  mismo que dio entonces, y un cierre no necesita guardar su foto para ser
  fiable.

  NADA SE SUMA ENTRE MONEDAS. Un bolívar y un dólar no son la misma cosa; lo que
  se enseña junto va cada uno en su fila, y su equivalente va aparte y rotulado.
*/

export interface RenglonDelLibroDeDinero {
  id: number
  numero: string
  fecha: string
  cuenta_id: number | null
  cuenta_codigo: string | null
  cuenta: string | null
  cuenta_tipo: string | null
  moneda: string
  tipo: string
  signo: number
  monto: string
  debe: string
  haber: string
  /** El saldo de su cuenta después de este renglón. Nulo si no tuvo cuenta. */
  saldo: string | null
  tasa: string
  tasa_usd: string
  monto_bs: string | null
  monto_usd: string | null
  concepto: string
  referencia: string | null
  contraparte: string | null
  categoria: string | null
  categoria_nombre: string | null
  categoria_padre: string | null
  metodo: string | null
  movimiento_origen: number | null
  transferencia_par: number | null
}

const TANDA = 1000

/**
 * Todo el libro de un rango, sin el tope de doscientos de la pantalla.
 *
 * Un reporte que corta en silencio es peor que uno que tarda: se pide por
 * tandas hasta que la base deja de devolver filas.
 */
export async function leerLibroDeDinero(f: {
  desde?: string | null
  hasta?: string | null
  cuenta_id?: number | null
  moneda?: string | null
}): Promise<RenglonDelLibroDeDinero[]> {
  const todo: RenglonDelLibroDeDinero[] = []
  for (let desdeFila = 0; ; desdeFila += TANDA) {
    let q = supabase
      .from('v_tesoreria_libro')
      .select('*')
      .order('fecha', { ascending: true })
      .order('id', { ascending: true })
      .range(desdeFila, desdeFila + TANDA - 1)
    if (f.desde) q = q.gte('fecha', f.desde)
    if (f.hasta) q = q.lte('fecha', f.hasta)
    if (f.cuenta_id) q = q.eq('cuenta_id', f.cuenta_id)
    if (f.moneda) q = q.eq('moneda', f.moneda)
    const tanda = desenvolver<RenglonDelLibroDeDinero[]>(await q)
    todo.push(...tanda)
    if (tanda.length < TANDA) return todo
  }
}

/** Lo que se debe y lo que deben, por moneda. Nulo si quien mira no puede verlo. */
export interface PendientePorMoneda {
  porPagar: Record<string, number> | null
  porCobrar: Record<string, number> | null
}

export async function leerPendientePorMoneda(): Promise<PendientePorMoneda> {
  const [pagar, cobrar] = await Promise.all([
    supabase.from('v_cuentas_por_pagar').select('moneda, monto'),
    supabase.from('v_cuentas_por_cobrar').select('moneda, saldo_bs, saldo_usd'),
  ])

  const porPagar = pagar.error
    ? null
    : (pagar.data ?? []).reduce<Record<string, number>>((s, r) => {
        s[r.moneda] = (s[r.moneda] ?? 0) + Number(r.monto ?? 0)
        return s
      }, {})

  /*
    La cuenta por cobrar se lleva en bolívares y en dólares, no en la moneda de
    cada factura. Lo facturado en bolívares va a VES; todo lo demás, a USD por
    su equivalente. El reporte lo dice al pie.
  */
  const porCobrar = cobrar.error
    ? null
    : (cobrar.data ?? []).reduce<Record<string, number>>((s, r) => {
        if (r.moneda === 'VES') s.VES = (s.VES ?? 0) + Number(r.saldo_bs ?? 0)
        else s.USD = (s.USD ?? 0) + Number(r.saldo_usd ?? 0)
        return s
      }, {})

  return { porPagar, porCobrar }
}

// ---------------------------------------------------------------------------
// Las cuentas que salen de sumar el libro
// ---------------------------------------------------------------------------

/**
 * Lo que entra y lo que sale de verdad.
 *
 * Un traslado entre dos cuentas propias no es ni ingreso ni gasto: el dinero no
 * salió de la empresa. Se cuenta en el Debe y el Haber de cada cuenta —ahí sí
 * se movió— pero no en el resultado del período.
 */
export const esTraslado = (r: Pick<RenglonDelLibroDeDinero, 'tipo'>) => r.tipo === 'TRANSFERENCIA'

/** El saldo con que arrancó cada cuenta tampoco es un ingreso del período. */
export const esApertura = (r: Pick<RenglonDelLibroDeDinero, 'tipo'>) => r.tipo === 'APERTURA'

export interface FilaPorMoneda {
  moneda: string
  debe: number
  haber: number
  /** En cajas HOY, no al final del rango. */
  saldo: number
  porPagar: number | null
  porCobrar: number | null
}

export function resumirPorMoneda(
  libro: RenglonDelLibroDeDinero[],
  saldos: { moneda: string; saldo: string; activa: boolean }[],
  pendiente: PendientePorMoneda,
): FilaPorMoneda[] {
  const filas = new Map<string, FilaPorMoneda>()
  const de = (moneda: string) => {
    let f = filas.get(moneda)
    if (!f) {
      f = {
        moneda,
        debe: 0,
        haber: 0,
        saldo: 0,
        porPagar: pendiente.porPagar ? (pendiente.porPagar[moneda] ?? 0) : null,
        porCobrar: pendiente.porCobrar ? (pendiente.porCobrar[moneda] ?? 0) : null,
      }
      filas.set(moneda, f)
    }
    return f
  }
  for (const s of saldos) de(s.moneda).saldo += Number(s.saldo ?? 0)
  for (const r of libro) {
    const f = de(r.moneda)
    f.debe += Number(r.debe)
    f.haber += Number(r.haber)
  }
  for (const m of Object.keys(pendiente.porPagar ?? {})) de(m)
  for (const m of Object.keys(pendiente.porCobrar ?? {})) de(m)
  return [...filas.values()].sort((a, b) => a.moneda.localeCompare(b.moneda))
}

export interface GastoDeCategoria {
  moneda: string
  padre: string
  categoria: string
  monto: number
  movimientos: number
}

/** En qué se fue el dinero: lo que salió, sin traslados, por categoría y moneda. */
export function gastosPorCategoria(libro: RenglonDelLibroDeDinero[]): GastoDeCategoria[] {
  const mapa = new Map<string, GastoDeCategoria>()
  for (const r of libro) {
    if (r.signo >= 0 || esTraslado(r)) continue
    const categoria = r.categoria_nombre ?? 'SIN CLASIFICAR'
    const padre = r.categoria_padre ?? categoria
    const clave = `${r.moneda}|${padre}|${categoria}`
    const g = mapa.get(clave) ?? { moneda: r.moneda, padre, categoria, monto: 0, movimientos: 0 }
    g.monto += Number(r.haber)
    g.movimientos += 1
    mapa.set(clave, g)
  }
  return [...mapa.values()].sort(
    (a, b) =>
      a.moneda.localeCompare(b.moneda) || a.padre.localeCompare(b.padre) || b.monto - a.monto,
  )
}

export interface CierreDeCuenta {
  cuenta: string
  moneda: string
  inicial: number
  entradas: number
  salidas: number
  final: number
  movimientos: number
}

export interface CierreDeMoneda {
  moneda: string
  ingresos: number
  gastos: number
  resultado: number
}

/**
 * El cierre de un mes.
 *
 * El saldo inicial NO se guarda ni se lee: es el final menos lo que se movió en
 * el mes. Así no existe un segundo número que pueda decir otra cosa.
 *
 * `hastaElFinal` es el libro desde siempre hasta el último día del mes: de ahí
 * sale el saldo final de cada cuenta, y los renglones del mes se apartan por
 * fecha.
 */
export function cerrarMes(
  hastaElFinal: RenglonDelLibroDeDinero[],
  primerDia: string,
): { cuentas: CierreDeCuenta[]; monedas: CierreDeMoneda[]; delMes: RenglonDelLibroDeDinero[] } {
  const cuentas = new Map<number, CierreDeCuenta>()
  const monedas = new Map<string, CierreDeMoneda>()
  const delMes: RenglonDelLibroDeDinero[] = []

  for (const r of hastaElFinal) {
    const enElMes = r.fecha >= primerDia
    if (enElMes) delMes.push(r)

    if (r.cuenta_id !== null) {
      const c = cuentas.get(r.cuenta_id) ?? {
        cuenta: r.cuenta ?? '—',
        moneda: r.moneda,
        inicial: 0,
        entradas: 0,
        salidas: 0,
        final: 0,
        movimientos: 0,
      }
      c.final += r.signo * Number(r.monto)
      if (enElMes) {
        c.entradas += Number(r.debe)
        c.salidas += Number(r.haber)
        c.movimientos += 1
      }
      cuentas.set(r.cuenta_id, c)
    }

    if (enElMes && !esTraslado(r) && !esApertura(r)) {
      const m = monedas.get(r.moneda) ?? { moneda: r.moneda, ingresos: 0, gastos: 0, resultado: 0 }
      m.ingresos += Number(r.debe)
      m.gastos += Number(r.haber)
      m.resultado = m.ingresos - m.gastos
      monedas.set(r.moneda, m)
    }
  }

  for (const c of cuentas.values()) c.inicial = c.final - (c.entradas - c.salidas)

  return {
    cuentas: [...cuentas.values()].sort(
      (a, b) => a.moneda.localeCompare(b.moneda) || a.cuenta.localeCompare(b.cuenta),
    ),
    monedas: [...monedas.values()].sort((a, b) => a.moneda.localeCompare(b.moneda)),
    delMes,
  }
}
