import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver } from '@/lib/api/rpc'
import { useEmpresa } from '@/lib/api/empresa'
import { useMisAcciones, useMisPermisos } from '@/lib/api/usuarios'
import type { DespachoCombustible, MotivoDelVale } from '@/lib/api/combustible'
import type { OpcionBuscable } from '@/components/ui/SelectBuscable'
import { opcionesEquipos } from '@/lib/combustible/opcionesEquipos'
import type { FichaMaquinaReporte } from '@/lib/combustible/reporteMoldeable'
import type { Maquina } from '@/lib/api/maquinaria'
import type { EmpresaPapel } from '@/lib/ficha/papel'
import { dolares } from '@/lib/formato'
import type { MovimientoLibro, Numerico, TanqueGt, TipoMovLibro, TipoMovTanque } from '@/lib/combustible/tipos'
import { n } from '@/lib/combustible/tipos'

/*
  LO COMÚN DE LA PANTALLA DE ESCRITORIO DEL COMBUSTIBLE (Golden Touch,
  TanquesView.tsx, 10/11/2026).

  Los textos, los emojis y el orden son los de Golden Touch; los colores, los
  de la casa (`--color-*`), para que se vea igual de bien en claro y en
  oscuro. Lo que allá era `var(--primary-3)` (entrada), `var(--danger)` (uso y
  merma), `var(--warning)` (traslado) e `var(--info)` (retorno) aquí son
  `text-success`, `text-danger`, `text-warning` y `text-info`.
*/

/** Litros como los escribe Golden Touch: hasta dos decimales, sin ceros de relleno. */
export const lt = (v: Numerico | null | undefined): string =>
  n(v).toLocaleString('es-VE', { maximumFractionDigits: 2 })

export const usd = (v: Numerico | null | undefined): string => dolares(n(v))

/** «2026-11» del mes en curso, en hora de Venezuela. */
export function mesActualVE(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .slice(0, 7)
}

/** «noviembre de 2026» a partir de «2026-11». */
export function nombreMes(ym: string): string {
  if (!ym) return ''
  const [y, m] = ym.split('-').map(Number)
  return new Intl.DateTimeFormat('es-VE', { month: 'long', year: 'numeric' }).format(new Date(y, (m || 1) - 1, 1))
}

/** El último día de un mes «2026-11» → «2026-11-30». */
export function finDeMes(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}

/** La hora de ahora en Venezuela, «16:05:09», para el campo de hora. */
export function horaAhoraVE(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Caracas',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date())
}

/** Un campo de número escrito → número, o nulo si está vacío. */
export function leerNumero(s: string): number | null {
  const t = s.trim().replace(',', '.')
  if (t === '') return null
  const x = Number(t)
  return Number.isFinite(x) ? x : null
}

export const iconoTanque = (t: Pick<TanqueGt, 'es_bidon' | 'es_movil'>) =>
  t.es_bidon ? '🪣' : t.es_movil ? '🚚' : '🛢'

/** El rótulo largo del tipo (el selector de Golden Touch). */
export const TIPO_MOV_LABEL: Record<TipoMovTanque, string> = {
  entrada: '⬇ Entrada (entra combustible)',
  uso: '⛽ Uso (consumo de equipo)',
  traslado: '↔ Traslado (a otro tanque)',
  retorno: '↩ Retorno (vuelve al tanque)',
  merma: '🔻 Merma del tanque (pérdida)',
}

/** El rótulo corto, para el filtro y el detalle. Con lo que aquí trae el libro además. */
export const TIPO_CORTO: Record<TipoMovLibro, string> = {
  entrada: '⬇ Entrada',
  uso: '⛽ Uso',
  traslado: '↔ Traslado',
  retorno: '↩ Retorno',
  merma: '🔻 Merma',
  reverso: '❌ Reverso',
  ajuste: '🧮 Ajuste de costo',
}

/** El color de la cifra de cada tipo en la tabla. */
export const COLOR_TIPO: Record<TipoMovLibro, string> = {
  entrada: 'text-success',
  uso: 'text-danger',
  traslado: 'text-warning',
  retorno: 'text-info',
  merma: 'text-danger',
  reverso: 'text-ink/50',
  ajuste: 'text-ink/50',
}

/**
 * Quién puede qué en Combustible, todo junto.
 *
 * Desde el 09/11/2026 los permisos son solo los de la matriz del rol: el nivel
 * del módulo y las acciones. Las acciones de Golden Touch se repartieron así:
 * surtir pide ESCRITURA; entrada y retorno, COMBUSTIBLE.ENTRADA; traslado,
 * COMBUSTIBLE.TRASLADO; merma, COMBUSTIBLE.MERMA; tanques, COMBUSTIBLE.TANQUES;
 * catálogos, COMBUSTIBLE.CATALOGOS. Cada función de la base lo vuelve a exigir.
 */
export function usePermisosCombustible() {
  const { puede } = useMisPermisos()
  const { puede: accion } = useMisAcciones()
  const escribe = puede('COMBUSTIBLE', 'ESCRITURA')
  return {
    escribe,
    total: puede('COMBUSTIBLE', 'TOTAL'),
    entrada: accion('COMBUSTIBLE.ENTRADA'),
    traslado: accion('COMBUSTIBLE.TRASLADO'),
    merma: accion('COMBUSTIBLE.MERMA'),
    tanques: accion('COMBUSTIBLE.TANQUES'),
    catalogos: accion('COMBUSTIBLE.CATALOGOS'),
    mermaFueraDeMargen: accion('COMBUSTIBLE.MERMA_FUERA_DE_MARGEN'),
    telefono: escribe || accion('COMBUSTIBLE.SURTIDOR_TELEFONO'),
    /** Sin INVENTARIO.VER_VALORACION la base devuelve los $ en nulo: no se enseñan. */
    veValor: accion('INVENTARIO.VER_VALORACION'),
  }
}

/** La empresa como la pide el membrete de los papeles. */
export function useEmpresaPapel(): EmpresaPapel {
  const { data } = useEmpresa()
  return useMemo(
    () => ({ razonSocial: data?.razon_social ?? '', rif: data?.rif ?? '' }),
    [data?.razon_social, data?.rif],
  )
}

/** Un vale, para imprimirlo desde el renglón del libro. */
export function useDespachoDelLibro(id: number | null | undefined) {
  return useQuery({
    queryKey: ['combustible', 'despacho', id],
    enabled: id != null,
    queryFn: async () =>
      desenvolver<DespachoCombustible | null>(
        await supabase.from('v_despachos_combustible').select('*').eq('id', id as number).maybeSingle(),
      ),
  })
}

/** Lee y guarda en el navegador sin romper si el navegador no deja. */
export function leerGuardado<T>(clave: string, porDefecto: T): T {
  try {
    const crudo = window.localStorage.getItem(clave)
    return crudo ? (JSON.parse(crudo) as T) : porDefecto
  } catch {
    return porDefecto
  }
}

export function guardar(clave: string, valor: unknown): void {
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    /* modo privado o almacenamiento lleno: se queda en memoria y ya */
  }
}

/** Con qué número se cuelgan las fotos de un renglón: el del vale si lo tiene; si no, el del libro. */
export const referenciaFotos = (m: Pick<MovimientoLibro, 'vale_numero' | 'numero'>) => m.vale_numero ?? m.numero

/** A qué se le echó, o a dónde fue. */
export function equipoDe(m: MovimientoLibro): string {
  if (m.tipo === 'traslado' && m.tanque_destino) return `→ ${m.tanque_destino}`
  return (m.equipo ?? '').trim() || (m.maquina_codigo ?? '')
}

/** Sin acentos y en minúscula, para buscar. */
export const norm = (t: string | null | undefined) =>
  (t ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

// ─── El vale: para qué y quién recibió ─────────────────────────────────────

export interface EstadoVale {
  motivo: string
  detalle: string
  /** El id de `personas_para_vale`, o vacío si no está en la nómina. */
  empleado: string
  nombre: string
  cedula: string
}

export const VALE_VACIO: EstadoVale = { motivo: '', detalle: '', empleado: '', nombre: '', cedula: '' }

/** Lo que le falta al vale, dicho en palabras. */
export function faltaDelVale(v: EstadoVale, motivos: MotivoDelVale[] | undefined): string[] {
  const falta: string[] = []
  const m = motivos?.find((x) => x.codigo === v.motivo)
  if (!v.motivo) falta.push('para qué')
  else if (m?.exige_detalle && v.detalle.trim().length < 3) falta.push('el detalle del uso')
  if (v.empleado === '' && v.nombre.trim().length < 3) falta.push('quién recibió')
  return falta
}

/** El vale como lo piden las funciones de la base. */
export function valeParaLaBase(v: EstadoVale, motivos: MotivoDelVale[] | undefined) {
  const m = motivos?.find((x) => x.codigo === v.motivo)
  return {
    motivo: v.motivo,
    motivo_detalle: m?.exige_detalle ? v.detalle.trim() : null,
    empleado_id: v.empleado ? Number(v.empleado) : null,
    recibio_nombre: v.empleado ? null : v.nombre.trim() || null,
    recibio_cedula: v.empleado ? null : v.cedula.trim() || null,
  }
}

// ─── El equipo ─────────────────────────────────────────────────────────────

/** Las opciones del buscador de equipos, con el grupo y el icono a la vista. */
export function opcionesDeEquipo(args: Parameters<typeof opcionesEquipos>[0]): OpcionBuscable[] {
  return opcionesEquipos(args).map((o) => ({
    valor: o.valor,
    codigo: o.codigo,
    nombre: o.nombre ? `${o.icono} ${o.nombre}` : undefined,
    etiqueta: o.codigo ? undefined : `${o.icono} ${o.etiqueta ?? o.valor}`,
    detalle: [o.grupo, o.detalle].filter(Boolean).join(' · '),
  }))
}

/** Las máquinas como las cruza el reporte moldeable (dueño, tipo y clase). */
export function fichasDeMaquinas(ms: Maquina[]): FichaMaquinaReporte[] {
  return ms.map((m) => ({
    id: m.id,
    codigo: m.codigo,
    nombre: m.nombre,
    tipo: m.tipo ?? null,
    clase: m.clase ?? null,
    propietario: m.propietario ?? null,
  }))
}

export interface TotalesGrupo {
  litros: number
  valor: number
  tasa: number
  count: number
}

export function totalesGrupo(ts: TanqueGt[]): TotalesGrupo {
  const conSaldo = ts.filter((t) => !t.es_bidon)
  const litros = conSaldo.reduce((a, t) => a + n(t.saldo_litros), 0)
  const valor = conSaldo.reduce((a, t) => a + n(t.saldo_usd), 0)
  return { litros, valor, tasa: litros > 0 ? valor / litros : 0, count: conSaldo.length }
}
