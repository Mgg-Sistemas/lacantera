/* ============================================================
   La Cantera · Compras FIJAS · Base de datos y Repositorio
   Persistencia con Supabase y respaldo automático en localStorage.
   ============================================================ */
import { supabase } from '@/lib/supabase'
import { hoyVenezuela } from '@/shared/lib/rangosFecha'
import {
  siguienteFecha,
  type CompraFija,
  type ProductoFijo,
} from './comprasFijas'

const TABLE = 'compras_fijas'
const LOCAL_STORAGE_KEY = 'lacantera.compras_fijas.v1'
const HISTORIAL_STORAGE_KEY = 'lacantera.compras_fijas_historial.v1'

export const MSG_FALTA_SQL_COMPRAS_FIJAS =
  'Falta aplicar en Supabase el SQL supabase/compras-fijas-2026-11-24.sql (Compras fijas). Trabajando en modo local.'

const faltaSql = (e: { code?: string; message?: string } | null | undefined) =>
  !!e &&
  (e.code === '42P01' ||
    e.code === 'PGRST205' ||
    e.code === '42703' ||
    e.code === 'PGRST204' ||
    /does not exist|Could not find the (table|.*column)/i.test(e.message ?? ''))

export const PLANTILLAS_INICIALES_CANTERA: CompraFija[] = [
  {
    id: 'fija-mercado-comedor',
    nombre: 'Mercado Comedor',
    icono: '🛒',
    frecuencia: 'semanal',
    cada_dias: null,
    proxima_fecha: hoyVenezuela(),
    activa: true,
    modo: 'solicitud',
    permite_cotizar: true,
    solicitante: 'COCINA / CAMPAMENTO',
    unidad_solicitante: 'COCINA',
    finalidad: 'PEDIDO PARA RESTABLECER EL MERCADO',
    urgente: true,
    proveedor_id: null,
    proveedor_nombre: null,
    categorias: ['viver', 'proteina', 'hortaliza', 'legumbre', 'limpieza', 'higiene'],
    productos: [],
    nota: 'Restablecimiento semanal de víveres y alimentos para el campamento',
    orden: 1,
    sugerida: false,
    ultima_ref_tipo: null,
    ultima_ref_id: null,
    ultima_codigo: null,
    ultima_generada_en: null,
  },
  {
    id: 'fija-carnes-proteinas',
    nombre: 'Carnes y Proteínas',
    icono: '🥩',
    frecuencia: 'semanal',
    cada_dias: null,
    proxima_fecha: hoyVenezuela(),
    activa: false,
    modo: 'solicitud',
    permite_cotizar: true,
    solicitante: 'COCINA / CAMPAMENTO',
    unidad_solicitante: 'COCINA',
    finalidad: 'COMPRA FIJA DE CARNES Y PROTEÍNAS',
    urgente: false,
    proveedor_id: null,
    proveedor_nombre: null,
    categorias: ['carne', 'pollo', 'res', 'cerdo', 'pescado'],
    productos: [],
    nota: 'Cortes cárnicos y embutidos para el personal de cantera',
    orden: 2,
    sugerida: true,
    ultima_ref_tipo: null,
    ultima_ref_id: null,
    ultima_codigo: null,
    ultima_generada_en: null,
  },
  {
    id: 'fija-papeleria-romana',
    nombre: 'Papelería y Romana',
    icono: '📎',
    frecuencia: 'mensual',
    cada_dias: null,
    proxima_fecha: hoyVenezuela(),
    activa: false,
    modo: 'solicitud',
    permite_cotizar: true,
    solicitante: 'ADMINISTRACIÓN',
    unidad_solicitante: 'ADMINISTRACIÓN',
    finalidad: 'COMPRA FIJA DE PAPELERÍA Y FORMATOS DE ROMANA',
    urgente: false,
    proveedor_id: null,
    proveedor_nombre: null,
    categorias: ['papel', 'oficina', 'romana', 'impresion'],
    productos: [],
    nota: 'Rollos de tickets de báscula, papel membretado, carpetas y tóner',
    orden: 3,
    sugerida: true,
    ultima_ref_tipo: null,
    ultima_ref_id: null,
    ultima_codigo: null,
    ultima_generada_en: null,
  },
  {
    id: 'fija-filtros-lubricantes',
    nombre: 'Filtros y Lubricantes',
    icono: '🛢️',
    frecuencia: 'quincenal',
    cada_dias: null,
    proxima_fecha: hoyVenezuela(),
    activa: false,
    modo: 'solicitud',
    permite_cotizar: true,
    solicitante: 'TALLER Y MANTENIMIENTO',
    unidad_solicitante: 'TALLER',
    finalidad: 'COMPRA FIJA DE FILTROS Y LUBRICANTES PARA PLANTA Y FLOTA',
    urgente: false,
    proveedor_id: null,
    proveedor_nombre: null,
    categorias: ['filtro', 'aceite', 'lubricante', 'grasa'],
    productos: [],
    nota: 'Kits de mantenimiento preventivo para cargadores, retroexcavadoras y trituradora',
    orden: 4,
    sugerida: true,
    ultima_ref_tipo: null,
    ultima_ref_id: null,
    ultima_codigo: null,
    ultima_generada_en: null,
  },
  {
    id: 'fija-epp-seguridad',
    nombre: 'EPP y Seguridad Minera',
    icono: '🦺',
    frecuencia: 'mensual',
    cada_dias: null,
    proxima_fecha: hoyVenezuela(),
    activa: false,
    modo: 'solicitud',
    permite_cotizar: true,
    solicitante: 'SEGURIDAD INDUSTRIAL',
    unidad_solicitante: 'SEGURIDAD',
    finalidad: 'DOTACIÓN Y REPOSICIÓN FIJA DE EPP PARA TRABAJADORES',
    urgente: false,
    proveedor_id: null,
    proveedor_nombre: null,
    categorias: ['epp', 'seguridad', 'guantes', 'botas'],
    productos: [],
    nota: 'Guantes de carnaza, botas con puntera, lentes, cascos y mascarillas para polvo de trituración',
    orden: 5,
    sugerida: true,
    ultima_ref_tipo: null,
    ultima_ref_id: null,
    ultima_codigo: null,
    ultima_generada_en: null,
  },
]

function leerLocal(): CompraFija[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(PLANTILLAS_INICIALES_CANTERA))
      return PLANTILLAS_INICIALES_CANTERA
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : PLANTILLAS_INICIALES_CANTERA
  } catch {
    return PLANTILLAS_INICIALES_CANTERA
  }
}

function guardarLocal(lista: CompraFija[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(lista))
  } catch {
    /* localStorage no disponible */
  }
}

function normalizar(r: Record<string, unknown>): CompraFija {
  const c = r as unknown as CompraFija
  return {
    ...c,
    categorias: Array.isArray(r.categorias) ? (r.categorias as string[]) : [],
    productos: Array.isArray(r.productos) ? (r.productos as ProductoFijo[]) : [],
    urgente: !!r.urgente,
    activa: r.activa !== false,
    permite_cotizar: r.permite_cotizar !== false,
    sugerida: r.sugerida === true,
  }
}

/** Las plantillas (activas primero, por orden). Con fallback transparente en localStorage. */
export async function listComprasFijas(): Promise<{ lista: CompraFija[]; disponible: boolean }> {
  try {
    const { data, error } = await supabase.from(TABLE).select('*').order('orden').order('nombre')
    if (error) {
      if (faltaSql(error)) {
        return { lista: leerLocal().sort((a, b) => Number(b.activa) - Number(a.activa)), disponible: false }
      }
      return { lista: leerLocal().sort((a, b) => Number(b.activa) - Number(a.activa)), disponible: false }
    }
    const lista = ((data ?? []) as Record<string, unknown>[]).map(normalizar)
    if (!lista.length) {
      return { lista: leerLocal().sort((a, b) => Number(b.activa) - Number(a.activa)), disponible: true }
    }
    return { lista: lista.sort((a, b) => Number(b.activa) - Number(a.activa)), disponible: true }
  } catch {
    return { lista: leerLocal().sort((a, b) => Number(b.activa) - Number(a.activa)), disponible: false }
  }
}

export type CompraFijaEditable = Omit<
  CompraFija,
  'id' | 'ultima_ref_tipo' | 'ultima_ref_id' | 'ultima_codigo' | 'ultima_generada_en'
>

export async function guardarCompraFija(id: string | null, c: CompraFijaEditable): Promise<CompraFija> {
  const fila = {
    nombre: c.nombre.trim(),
    icono: c.icono || '🔁',
    frecuencia: c.frecuencia,
    cada_dias: c.frecuencia === 'cada_dias' ? Number(c.cada_dias) || 30 : null,
    proxima_fecha: c.proxima_fecha,
    activa: c.activa,
    modo: c.modo,
    permite_cotizar: c.permite_cotizar,
    solicitante: c.solicitante?.trim().toUpperCase() || null,
    unidad_solicitante: c.unidad_solicitante?.trim().toUpperCase() || null,
    finalidad: c.finalidad?.trim().toUpperCase() || null,
    urgente: c.urgente,
    proveedor_id: c.proveedor_id || null,
    proveedor_nombre: c.proveedor_nombre || null,
    categorias: c.categorias.map((x) => x.trim()).filter(Boolean),
    productos: c.productos,
    nota: c.nota?.trim() || null,
    orden: Number(c.orden) || 0,
    sugerida: false,
    avisada_para: null,
  }

  try {
    const q = id
      ? supabase.from(TABLE).update(fila).eq('id', id).select('*').single()
      : supabase.from(TABLE).insert(fila).select('*').single()
    const { data, error } = await q
    if (!error && data) {
      return normalizar(data as Record<string, unknown>)
    }
  } catch {
    /* Fallback local */
  }

  // Guardar en localStorage
  const actual = leerLocal()
  const realId = id || `fija-${Date.now().toString(36)}`
  const guardada: CompraFija = {
    ...fila,
    id: realId,
    ultima_ref_tipo: null,
    ultima_ref_id: null,
    ultima_codigo: null,
    ultima_generada_en: null,
  }
  const index = actual.findIndex((x) => x.id === realId)
  if (index >= 0) {
    actual[index] = { ...actual[index], ...guardada }
  } else {
    actual.push(guardada)
  }
  guardarLocal(actual)
  return guardada
}

export async function eliminarCompraFija(id: string): Promise<void> {
  try {
    await supabase.from(TABLE).delete().eq('id', id)
  } catch {
    /* ignore */
  }
  const actual = leerLocal().filter((x) => x.id !== id)
  guardarLocal(actual)
}

/** Después de generar: anota cuál fue y corre la próxima fecha según la frecuencia. */
export async function marcarCompraFijaGenerada(
  c: CompraFija,
  ref: { tipo: 'orden' | 'compra_directa'; id: string; codigo: string | null },
): Promise<void> {
  const prox = siguienteFecha(c, hoyVenezuela())
  try {
    await supabase
      .from(TABLE)
      .update({
        ultima_ref_tipo: ref.tipo,
        ultima_ref_id: ref.id,
        ultima_codigo: ref.codigo,
        ultima_generada_en: new Date().toISOString(),
        proxima_fecha: prox,
        avisada_para: null,
      })
      .eq('id', c.id)
  } catch {
    /* ignore */
  }

  // Actualizar también en local
  const actual = leerLocal()
  const idx = actual.findIndex((x) => x.id === c.id)
  if (idx >= 0) {
    actual[idx] = {
      ...actual[idx],
      ultima_ref_tipo: ref.tipo,
      ultima_ref_id: ref.id,
      ultima_codigo: ref.codigo,
      ultima_generada_en: new Date().toISOString(),
      proxima_fecha: prox,
    }
    guardarLocal(actual)
  }

  // Registrar en historial local
  try {
    const rawHist = localStorage.getItem(HISTORIAL_STORAGE_KEY)
    const hist = rawHist ? JSON.parse(rawHist) : {}
    if (!hist[c.id]) hist[c.id] = []
    hist[c.id].unshift({
      tipo: ref.tipo,
      id: ref.id,
      codigo: ref.codigo,
      fecha: new Date().toISOString(),
      estado: 'generada',
      total: null,
    })
    localStorage.setItem(HISTORIAL_STORAGE_KEY, JSON.stringify(hist))
  } catch {
    /* ignore */
  }
}

/** Los renglones de la última vez que se generó esta plantilla. */
export async function ultimosItemsDe(
  c: CompraFija,
): Promise<{
  items: Array<{ productoId?: string | number; articulo_id?: number | null; sku?: string; cantidad: number }>
  codigo: string | null
  fecha: string | null
}> {
  if (!c?.id) return { items: [], codigo: null, fecha: null }

  try {
    const [o, cd] = await Promise.all([
      supabase
        .from('ordenes')
        .select('codigo, items, created_at, estado')
        .eq('compra_fija_id', c.id)
        .not('estado', 'in', '(cancelada,anulada,desistida_proveedor)')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('compras_directas')
        .select('codigo, items, created_at, estado')
        .eq('compra_fija_id', c.id)
        .not('estado', 'in', '(cancelada,anulada)')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    type FilaO = {
      codigo: string
      items: Array<{ productoId?: string | number; articulo_id?: number | null; sku?: string; cantidad: number; comprar?: boolean }> | null
      created_at: string
    }
    const ord = (o?.data ?? null) as FilaO | null
    const dir = (cd?.data ?? null) as FilaO | null
    const elegida = c.modo === 'compra_directa' ? dir || ord : ord || dir
    if (elegida && elegida.items) {
      return {
        items: (elegida.items ?? []).filter((i) => i.comprar !== false),
        codigo: elegida.codigo,
        fecha: elegida.created_at,
      }
    }
  } catch {
    /* Fallback to local */
  }

  return { items: [], codigo: null, fecha: null }
}

export interface GeneradaFija {
  tipo: 'orden' | 'compra_directa'
  id: string
  codigo: string | null
  fecha: string
  estado: string
  total: number | null
}

/** Historial de una plantilla: sus solicitudes y compras directas. */
export async function historialCompraFija(id: string): Promise<GeneradaFija[]> {
  try {
    const [o, cd] = await Promise.all([
      supabase
        .from('ordenes')
        .select('id, codigo, oc_codigo, created_at, estado, total')
        .eq('compra_fija_id', id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('compras_directas')
        .select('id, codigo, created_at, estado, gasto')
        .eq('compra_fija_id', id)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    if (!o.error && (o.data?.length || cd.data?.length)) {
      const ords = ((o.data ?? []) as Array<{ id: string; codigo: string; oc_codigo?: string; created_at: string; estado: string; total: number | null }>).map((x) => ({
        tipo: 'orden' as const,
        id: String(x.id),
        codigo: x.oc_codigo ?? x.codigo,
        fecha: x.created_at,
        estado: x.estado,
        total: Number(x.total) || null,
      }))
      const cds = ((cd.data ?? []) as Array<{ id: string; codigo: string | null; created_at: string; estado: string; gasto: number | null }>).map((x) => ({
        tipo: 'compra_directa' as const,
        id: String(x.id),
        codigo: x.codigo,
        fecha: x.created_at,
        estado: x.estado,
        total: x.gasto == null ? null : Number(x.gasto),
      }))
      return [...ords, ...cds].sort((a, b) => b.fecha.localeCompare(a.fecha))
    }
  } catch {
    /* ignore */
  }

  // Fallback historial local
  try {
    const rawHist = localStorage.getItem(HISTORIAL_STORAGE_KEY)
    const hist = rawHist ? JSON.parse(rawHist) : {}
    return (hist[id] || []) as GeneradaFija[]
  } catch {
    return []
  }
}
