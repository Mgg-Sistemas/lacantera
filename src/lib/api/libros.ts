import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver } from './rpc'

/**
 * El libro de ventas del IVA.
 *
 * Una fila por documento fiscal del período: las facturas en positivo y las
 * notas de crédito en negativo, porque para el SENIAT una nota de crédito es
 * una venta con signo contrario y no un anexo aparte.
 *
 * Las anuladas vienen en cero y marcadas. No se filtran: el número de control
 * sale de la numeración autorizada de la imprenta y tiene que correr continua.
 * Un salto sin explicar en la serie es lo primero que se busca en una
 * fiscalización.
 */
export interface LineaLibroVentas {
  clave: string
  id: number
  documento: 'FACTURA' | 'NOTA_CREDITO'
  fecha: string
  rif_cliente: string
  cliente: string
  numero: string
  numero_control: string
  /** El control de la factura que corrige. Solo en las notas de crédito. */
  afecta_a: string | null
  anulada: boolean
  moneda: string
  tasa: string
  alicuota_iva: string
  ventas_exentas: string
  base_imponible: string
  debito_fiscal: string
  total_ventas: string
  iva_retenido: string
  /*
    Las mismas cifras en bolívares, a la tasa que congeló el documento. Aquí se
    factura en las dos monedas y el libro se declara en una: sumar la columna en
    moneda original daría un número que no es ni dólares ni bolívares.
  */
  ventas_exentas_bs: string
  base_imponible_bs: string
  debito_fiscal_bs: string
  total_ventas_bs: string
  iva_retenido_bs: string
}

export function useLibroVentas(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['ventas', 'libro', desde, hasta],
    queryFn: async () =>
      desenvolver<LineaLibroVentas[]>(
        await supabase
          .from('v_libro_ventas')
          .select('*')
          .gte('fecha', desde)
          .lte('fecha', hasta)
          .order('fecha')
          .order('numero_control'),
      ),
  })
}

/** El primer y el último día del mes que se está declarando. */
export function mesCompleto(mes: string): { desde: string; hasta: string } {
  const [anio, m] = mes.split('-').map(Number)
  const ultimo = new Date(Date.UTC(anio, m, 0)).getUTCDate()
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, '0')}` }
}

/**
 * El mes que toca declarar: el anterior al de hoy.
 *
 * El IVA se declara dentro de los primeros quince días del mes siguiente, así
 * que quien abre esta pantalla casi siempre viene a ver el mes que cerró.
 */
export function mesPasado(): string {
  const hoy = new Date()
  const d = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth() - 1, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Una tabla en CSV para abrirla en la hoja de cálculo desde la que se
 * transcribe a la planilla.
 *
 * Punto y coma y no coma: en la configuración regional de Venezuela el
 * separador decimal es la coma, así que un CSV separado por comas se abre
 * partido por la mitad.
 */
export function descargarCsv(nombre: string, cabeceras: string[], filas: (string | number)[][]) {
  const escapar = (v: string | number) => {
    const t = String(v ?? '')
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }

  const texto = [cabeceras, ...filas].map((f) => f.map(escapar).join(';')).join('\r\n')

  // El BOM es lo que hace que Excel reconozca el UTF-8 y no parta los acentos.
  const blob = new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}
