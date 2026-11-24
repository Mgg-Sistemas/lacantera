import type { WorkSheet } from 'xlsx-js-style'
import { previewExcel } from '@/shared/lib/reportePreview'
import type { RetencionItem } from '@/lib/api/retenciones'
import { EMPRESA } from '@/lib/empresa'

export interface OpcionesExportarExcelRetenciones {
  filas: RetencionItem[]
  periodo: string
  quincena: 'TODAS' | 'Q1' | 'Q2'
  empresa?: {
    razonSocial?: string
    rif?: string
  }
}

type Celda = string | number | null

function estiloEncabezado(XLSX: typeof import('xlsx-js-style'), ws: WorkSheet, fila: number, nCols: number) {
  for (let c = 0; c < nCols; c += 1) {
    const cell = ws[XLSX.utils.encode_cell({ r: fila, c })]
    if (cell && typeof cell === 'object') {
      ;(cell as any).s = {
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
        fill: { fgColor: { rgb: '8C2F1F' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: {
          top: { style: 'thin', color: { rgb: 'D0D7DE' } },
          bottom: { style: 'thin', color: { rgb: 'D0D7DE' } },
          left: { style: 'thin', color: { rgb: 'D0D7DE' } },
          right: { style: 'thin', color: { rgb: 'D0D7DE' } },
        },
      }
    }
  }
}

function estiloTotales(XLSX: typeof import('xlsx-js-style'), ws: WorkSheet, fila: number, nCols: number) {
  for (let c = 0; c < nCols; c += 1) {
    const cell = ws[XLSX.utils.encode_cell({ r: fila, c })]
    if (cell && typeof cell === 'object') {
      ;(cell as any).s = {
        font: { bold: true, sz: 10 },
        fill: { fgColor: { rgb: 'F5EBE6' } },
        border: {
          top: { style: 'double', color: { rgb: '8C2F1F' } },
          bottom: { style: 'double', color: { rgb: '8C2F1F' } },
        },
      }
    }
  }
}

export async function exportarRetencionesExcel({
  filas,
  periodo,
  quincena,
  empresa,
}: OpcionesExportarExcelRetenciones): Promise<void> {
  const XLSX = await import('xlsx-js-style')

  const razon = empresa?.razonSocial || EMPRESA.razonSocial
  const rifAgente = empresa?.rif || EMPRESA.rif

  const textoQuincena =
    quincena === 'Q1'
      ? 'Primera Quincena (01 al 15)'
      : quincena === 'Q2'
        ? 'Segunda Quincena (16 al fin de mes)'
        : 'Mes Completo'

  const totalBs = filas.reduce((s, r) => s + (r.monto_retenido_bs || 0), 0)
  const totalUsd = filas.reduce((s, r) => s + (r.monto_retenido_usd || 0), 0)

  // Armar matriz AOA
  const aoa: Celda[][] = [
    [`${razon} · RIF: ${rifAgente}`],
    [`LIBRO DE RETENCIONES FISCALES · Período ${periodo} · ${textoQuincena}`],
    [
      `Total Registros: ${filas.length} · Retenido en Bs: ${totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} · Retenido en USD: $${totalUsd.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
    ],
    [], // fila vacía de separación
    [
      'N° Comprobante (R14)',
      'F. Emisión',
      'Impuesto',
      'Cod. Concepto',
      'RIF Proveedor',
      'Razón Social Proveedor',
      'N° Factura',
      'N° Control',
      'F. Factura',
      'Moneda',
      'Base Imponible',
      '% Alícuota',
      'Retenido (Moneda)',
      'Tasa Bs/$',
      'Retenido (Bs)',
      'Estado',
      'Origen / Reintegro',
    ],
  ]

  const filaEncabezado = aoa.length - 1

  let sumaBase = 0
  let sumaRetenidoMoneda = 0
  let sumaRetenidoBs = 0

  for (const r of filas) {
    sumaBase += r.base_imponible
    sumaRetenidoMoneda += r.monto_retenido
    sumaRetenidoBs += r.monto_retenido_bs

    const estadoReintegro =
      r.origen_retencion === 'POST_PAGO'
        ? `Post-pago (${r.estado_reintegro})`
        : 'Pago directo'

    aoa.push([
      r.numero_comprobante,
      r.fecha_emision,
      r.tipo_impuesto,
      r.concepto_islr_codigo || '—',
      r.proveedor_rif,
      r.proveedor_nombre,
      r.factura_numero,
      r.factura_control || '—',
      r.factura_fecha,
      r.moneda,
      Math.round(r.base_imponible * 100) / 100,
      r.alicuota_pct,
      Math.round(r.monto_retenido * 100) / 100,
      Math.round(r.tasa * 100) / 100,
      Math.round(r.monto_retenido_bs * 100) / 100,
      r.estado,
      estadoReintegro,
    ])
  }

  // Fila de Totales
  aoa.push([
    'TOTALES GENERALES',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    Math.round(sumaBase * 100) / 100,
    '',
    Math.round(sumaRetenidoMoneda * 100) / 100,
    '',
    Math.round(sumaRetenidoBs * 100) / 100,
    '',
    '',
  ])
  const filaTotal = aoa.length - 1

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Configuración de anchos de columna
  ws['!cols'] = [
    { wch: 18 }, // Comprobante
    { wch: 12 }, // Emisión
    { wch: 10 }, // Impuesto
    { wch: 13 }, // Cod. Concepto
    { wch: 14 }, // RIF
    { wch: 30 }, // Proveedor
    { wch: 14 }, // Factura
    { wch: 14 }, // Control
    { wch: 12 }, // Fecha Factura
    { wch: 8 },  // Moneda
    { wch: 15 }, // Base
    { wch: 10 }, // %
    { wch: 16 }, // Retenido Moneda
    { wch: 12 }, // Tasa
    { wch: 16 }, // Retenido Bs
    { wch: 12 }, // Estado
    { wch: 20 }, // Reintegro
  ]

  // Estilos
  estiloEncabezado(XLSX, ws, filaEncabezado, 17)
  estiloTotales(XLSX, ws, filaTotal, 17)

  // Título en negrita y grande
  const cellTitulo = ws[XLSX.utils.encode_cell({ r: 0, c: 0 })]
  if (cellTitulo && typeof cellTitulo === 'object') {
    ;(cellTitulo as any).s = { font: { bold: true, sz: 13, color: { rgb: '8C2F1F' } } }
  }
  const cellSubtitulo = ws[XLSX.utils.encode_cell({ r: 1, c: 0 })]
  if (cellSubtitulo && typeof cellSubtitulo === 'object') {
    ;(cellSubtitulo as any).s = { font: { bold: true, sz: 11 } }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Libro de Retenciones')

  const nombreArchivo = `Libro_Retenciones_${periodo}_${quincena.toLowerCase()}.xlsx`
  await previewExcel(wb, nombreArchivo)
}
