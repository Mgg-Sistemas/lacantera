import type { Articulo } from '@/lib/api/catalogo'

/* Los datos de la ficha de MGG (ver `CamposFichaMgg.tsx`). */

export interface FormFichaMgg {
  ubicacion_fisica: string
  alias: string
  modelo: string
  fabricante: string
  color: string
  restock_pct: string
}

export const fichaVacia: FormFichaMgg = {
  ubicacion_fisica: '',
  alias: '',
  modelo: '',
  fabricante: '',
  color: '',
  restock_pct: '',
}

export function fichaDe(a: Articulo): FormFichaMgg {
  return {
    ubicacion_fisica: a.ubicacion_fisica ?? '',
    alias: a.alias ?? '',
    modelo: a.modelo ?? '',
    fabricante: a.fabricante ?? '',
    color: a.color ?? '',
    restock_pct: a.restock_pct == null ? '' : String(Number(a.restock_pct)),
  }
}

/** Lo que viaja a `guardar_ficha_de_articulo`. */
export function fichaParaGuardar(f: FormFichaMgg) {
  const pct = Number(f.restock_pct)
  return {
    ubicacion_fisica: f.ubicacion_fisica.trim() || null,
    alias: f.alias.trim() || null,
    modelo: f.modelo.trim() || null,
    fabricante: f.fabricante.trim() || null,
    color: f.color.trim() || null,
    restock_pct: f.restock_pct.trim() && pct > 0 ? pct : null,
  }
}

export const umbralValido = (f: FormFichaMgg) =>
  !f.restock_pct.trim() || (Number(f.restock_pct) > 0 && Number(f.restock_pct) <= 1000)
