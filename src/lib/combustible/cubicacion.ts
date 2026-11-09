/*
  CUBICACIÓN: DE LA ALTURA DE LA VARILLA A LITROS (Golden Touch,
  tanques.repository.ts y calculadoraCubicacion.ts).

  Las fórmulas del Excel «CUBICACIÓN TANQUES»:
    · Cilíndrico horizontal: θ = 2·acos((R−h)/R); área = ½·R²·(θ − sen θ);
      litros = área · largo · 1000. La altura no pasa del diámetro.
    · Rectangular: litros = largo · ancho · h · 1000. La altura no pasa del alto.

  Golden Touch traía las medidas fijas de sus cuatro tanques; aquí no (decisión
  de la dueña): las medidas son las de la ficha de cada tanque. La base hace la
  misma cuenta al guardar una medición (`private.combustible_cubicar_litros`).
*/
import type { Numerico, TipoGeometria } from './tipos'

export interface GeometriaTanque {
  tipo_geometria: TipoGeometria
  radio_m?: Numerico | null
  largo_m?: Numerico | null
  ancho_m?: Numerico | null
  alto_m?: Numerico | null
}

const num = (v: Numerico | null | undefined): number => (Number.isFinite(Number(v)) ? Number(v) : 0)
const r2 = (v: number) => Math.round(v * 100) / 100

/** ¿El tanque tiene las medidas que su forma necesita? */
export function geometriaCompleta(g: GeometriaTanque): boolean {
  return g.tipo_geometria === 'cilindrico_horizontal'
    ? num(g.radio_m) > 0 && num(g.largo_m) > 0
    : num(g.largo_m) > 0 && num(g.ancho_m) > 0
}

/** Litros a una altura de líquido (cm). Sin medidas, cero. */
export function cubicarLitros(g: GeometriaTanque, alturaCm: number): number {
  const h = Math.max(0, num(alturaCm) / 100)
  if (g.tipo_geometria === 'cilindrico_horizontal') {
    const R = num(g.radio_m)
    const L = num(g.largo_m)
    if (R <= 0 || L <= 0) return 0
    const hh = Math.min(h, 2 * R)
    const theta = 2 * Math.acos(Math.min(1, Math.max(-1, (R - hh) / R)))
    const area = 0.5 * R * R * (theta - Math.sin(theta))
    return r2(area * L * 1000)
  }
  const L = num(g.largo_m)
  const A = num(g.ancho_m)
  const alto = num(g.alto_m)
  if (L <= 0 || A <= 0) return 0
  const hh = alto > 0 ? Math.min(h, alto) : h
  return r2(L * A * hh * 1000)
}

/** La altura total del tanque en cm (el diámetro, o el alto). */
export function alturaTotalCm(g: GeometriaTanque): number {
  return g.tipo_geometria === 'cilindrico_horizontal' ? num(g.radio_m) * 2 * 100 : num(g.alto_m) * 100
}

/** Capacidad por fórmula: lleno hasta su altura total. */
export function capacidadCalculada(g: GeometriaTanque): number {
  return cubicarLitros(g, alturaTotalCm(g))
}

export type EstadoCubicacion = 'NORMAL' | 'LLENO AL 100%' | 'SUPERA LA CAPACIDAD'

export interface ResultadoCubicacion {
  alturaCm: number
  alturaM: number
  volumenM3: number
  volumenLitros: number
  /** La rotulada si la hay; si no, la calculada. */
  capacidadLitros: number
  /** 0,524 para 52,4 %. */
  nivelPct: number
  estado: EstadoCubicacion
  alturaTotalCm: number
}

/** La hoja CALCULADORA del Excel, con las medidas del tanque. */
export function calcularCubicacion(
  g: GeometriaTanque & { capacidad_litros?: Numerico | null },
  alturaCm: number,
): ResultadoCubicacion {
  const cm = Math.max(0, num(alturaCm))
  const litros = cubicarLitros(g, cm)
  const cap = num(g.capacidad_litros) > 0 ? num(g.capacidad_litros) : capacidadCalculada(g)
  const nivel = cap > 0 ? litros / cap : 0
  const estado: EstadoCubicacion =
    nivel > 1.0005 ? 'SUPERA LA CAPACIDAD' : Math.abs(nivel - 1) <= 0.0005 ? 'LLENO AL 100%' : 'NORMAL'
  return {
    alturaCm: cm,
    alturaM: Math.round((cm / 100) * 1000) / 1000,
    volumenM3: Math.round((litros / 1000) * 10000) / 10000,
    volumenLitros: litros,
    capacidadLitros: r2(cap),
    nivelPct: Math.round(nivel * 10000) / 10000,
    estado,
    alturaTotalCm: alturaTotalCm(g),
  }
}

/** La tabla de la varilla (cm → litros) para consulta rápida. */
export function tablaVarilla(
  g: GeometriaTanque & { capacidad_litros?: Numerico | null },
  maxCm?: number,
): Array<{ cm: number; litros: number; pct: number }> {
  const tope = Math.floor(maxCm ?? alturaTotalCm(g))
  const filas: Array<{ cm: number; litros: number; pct: number }> = []
  for (let cm = 1; cm <= tope; cm++) {
    const r = calcularCubicacion(g, cm)
    filas.push({ cm, litros: r.volumenLitros, pct: r.nivelPct })
  }
  return filas
}
