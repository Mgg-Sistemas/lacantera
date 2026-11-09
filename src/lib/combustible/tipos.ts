/*
  LOS TIPOS DEL COMBUSTIBLE COMO GOLDEN TOUCH (10/11/2026).

  Salen de las vistas `v_combustible_tanques` y `v_combustible_libro` y de las
  tablas de catálogos, cubicaciones y conciliaciones. Los nombres de las
  columnas del libro son los de Golden Touch a propósito (tanque_id,
  autorizado_por, contador_global_ini, horometro_fin, kilometraje,
  registrado_en_cuaderno…): así la lógica y las pantallas que se traen de allá
  se leen igual aquí.

  Los números de la base pueden llegar como texto (numeric de PostgREST): por
  eso son `Numerico`, y la lógica de esta carpeta los pasa por `n()` antes de
  hacer cuentas.
*/

export type Numerico = number | string

/** Los cinco tipos de Golden Touch. */
export type TipoMovTanque = 'entrada' | 'uso' | 'traslado' | 'retorno' | 'merma'

/**
 * Lo que trae el libro de aquí además: el REVERSO de una anulación o una
 * corrección, y el ajuste de costo de Inventario.
 */
export type TipoMovLibro = TipoMovTanque | 'reverso' | 'ajuste'

export type TipoGeometria = 'cilindrico_horizontal' | 'rectangular'

export type TipoCatalogoCombustible = 'equipo' | 'autorizado' | 'ubicacion'

/** Un tanque con su ficha y su saldo (`v_combustible_tanques`). */
export interface TanqueGt {
  almacen_id: number
  codigo: string
  nombre: string
  ubicacion: string | null
  activo: boolean
  recibe_compras: boolean
  /** El tanque del combustible que no costó nada (CMB-INI): se dice «sin costo», no «Tasa $0,00». */
  sin_costo: boolean
  propietario: string
  /** Capacidad rotulada: el tope que cuida el libro. */
  capacidad_litros: Numerico | null
  tipo_geometria: TipoGeometria
  es_movil: boolean
  es_bidon: boolean
  radio_m: Numerico | null
  largo_m: Numerico | null
  ancho_m: Numerico | null
  alto_m: Numerico | null
  capacidad_calculada_litros: Numerico | null
  margen_merma_pct: Numerico
  merma_implicita_pct: Numerico
  orden: number
  articulo_id: number
  articulo_codigo: string
  articulo: string
  unidad: string
  stock_minimo: Numerico
  saldo_litros: Numerico
  /** Nulo sin INVENTARIO.VER_VALORACION. */
  saldo_usd: Numerico | null
  /** La tasa ponderada del tanque. Nula sin valoración o sin litros valorados. */
  tasa_usd_litro: Numerico | null
  lleno_pct: Numerico | null
  entradas_litros: Numerico
  usos_litros: Numerico
  traslados_litros: Numerico
  mermas_litros: Numerico
  movimientos: number
  ultimo_movimiento: string | null
}

/** Un renglón del libro mayor de un tanque (`v_combustible_libro`). */
export interface MovimientoLibro {
  id: number
  numero: string
  tanque_id: number
  tanque: string
  articulo_id: number
  articulo: string
  unidad: string
  fecha: string
  /** «HH:MM:SS». Nula cuando no se sabe (un vale transcrito otro día). */
  hora: string | null
  tipo: TipoMovLibro
  /** El tipo del libro de inventario (ENTRADA_DIRECTA, SALIDA_CONSUMO, REVERSO…). */
  tipo_inventario: string
  signo: 1 | -1
  litros: Numerico
  /** Nulo sin INVENTARIO.VER_VALORACION. */
  tasa_usd_litro: Numerico | null
  monto_usd: Numerico | null
  /** Posición en el libro del tanque: el orden del saldo corrido. */
  orden: number
  saldo_litros: Numerico
  saldo_usd: Numerico | null
  sin_costo: boolean
  equipo: string | null
  maquina_id: number | null
  maquina_codigo: string | null
  maquina_clase: string | null
  autorizado_por: string | null
  ubicacion: string | null
  observacion: string | null
  nota: string | null
  contador_global_ini: Numerico | null
  contador_global_fin: Numerico | null
  contador_global_dif: Numerico | null
  horometro_ini: Numerico | null
  horometro_fin: Numerico | null
  horas_utilizadas: Numerico | null
  kilometraje: Numerico | null
  registrado_en_cuaderno: boolean
  cuaderno_litros: Numerico | null
  despacho_id: number | null
  vale_numero: string | null
  motivo: string | null
  motivo_detalle: string | null
  recibio: string | null
  tanque_destino_id: number | null
  tanque_destino: string | null
  /** La otra pata de un traslado. */
  mov_vinculado_id: number | null
  /** Merma de recepción: la entrada o el traslado del que sale. */
  merma_de_id: number | null
  merma_motivo: string | null
  merma_fuera_de_margen: boolean
  /** Tiene su REVERSO: se ve tachado, no se borra. */
  anulado: boolean
  anulado_por_id: number | null
  anulado_motivo: string | null
  /** En un reverso: el movimiento que anula. */
  anula_a: number | null
  registrado_en: string
  registrado_por: string | null
  actor_name: string | null
}

export interface CatalogoCombustible {
  id: number
  tipo: TipoCatalogoCombustible
  valor: string
  maquina_id: number | null
  /** «¿Puede surtir?». */
  activo: boolean
  orden: number
  /** Tanques (almacen_id) de los que surte. Nulo: de todos. */
  tanques_permitidos: number[] | null
  creado_en: string
}

export interface CubicacionCombustible {
  id: number
  almacen_id: number
  fecha: string
  altura_cm: Numerico
  litros_cubicacion: Numerico
  saldo_libros: Numerico
  diferencia: Numerico | null
  notas: string | null
  creado_por: string | null
  creado_en: string
}

export interface ConciliacionCombustible {
  id: number
  almacen_id: number
  periodo: string | null
  desde: string | null
  hasta: string
  fecha: string
  saldo_libros: Numerico
  saldo_reportado_mina: Numerico
  diferencia: Numerico | null
  saldo_cubicacion: Numerico | null
  dif_cubicacion: Numerico | null
  notas: string | null
  creado_por: string | null
  creado_en: string
}

/** Un número de la base, o cero si no lo es. */
export const n = (v: Numerico | null | undefined): number => {
  const x = Number(v)
  return v == null || !Number.isFinite(x) ? 0 : x
}

/** Un número de la base, o nulo si no hay. */
export const nulo = (v: Numerico | null | undefined): number | null => {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

export const redondear = (v: number, decimales = 2): number => {
  const f = 10 ** decimales
  return Math.round(v * f) / f
}

/** ¿Este renglón cuenta? Lo anulado y sus reversos se ven, pero no suman en los totales. */
export const cuenta = (m: Pick<MovimientoLibro, 'anulado' | 'tipo'>): boolean =>
  !m.anulado && m.tipo !== 'reverso'
