import { logoComoImagen } from '@/lib/ficha/logo'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { ajustar } from '@/lib/ficha/hoja'
import {
  FILA_ALTERNA,
  GRIS,
  HAIRLINE,
  MARCA,
  ROTULO,
  TINTA,
  fechaLarga,
  fechaCorta,
  type EmpresaPapel,
} from '@/lib/ficha/papel'
import { dinero, bolivares, dolares, documento } from '@/lib/formato'
import type { NotaEntrega } from '@/lib/api/ventas'

/*
  REPORTE EJECUTIVO DE NOTAS DE ENTREGA (EN BOLÍVARES Y DÓLARES)

  Usa la geometría ejecutiva amplia de la casa (16 mm de margen lateral, 178 mm
  de ancho útil) para que el correlativo de la nota, la fecha y los montos en
  bolívares y dólares entren siempre en una sola línea sin partirse, e incorpora:
  - El estado de Cuenta por Cobrar (Por cobrar / Vencida / Cobrada y su fecha de
    vencimiento) tanto en los indicadores superiores como en cada renglón de la
    planilla y en su resumen ejecutivo de cobranza por cliente.
  - Las notas de respaldo de salida / convenio no facturables (como Optimavial,
    `!nota.facturable` o con `nota_salida` pendiente por completar), indicando su
    Nota de Salida (NS), los camiones de `nota.camiones` y su cuadro de resumen
    de convenio sin distorsionar los montos comerciales con falsos $ 0,00.

  Cada nota ya guarda su propia tasa BCV congelada el día en que se emitió
  (`tasa`/`tasa_usd`), y de ahí salen `total_bs`/`total_usd`. Solo se suman las
  notas vigentes (no anuladas).
*/

type Doc = import('jspdf').jsPDF

/** Geometría A4 Ejecutiva Cantera (210 × 297 mm, 16 mm de margen lateral). */
const IZQ = 16
const DER = 194
const ANCHO_UTIL = DER - IZQ // 178 mm
const ARRIBA = 16
const ABAJO = 279
const PIE = 281

/** Un artículo despachado, ya sumado entre todas las notas del alcance. */
export interface MaterialDespachado {
  articulo: string
  unidad: string
  cantidad: number
  subtotalBs: number
  subtotalUsd: number
}

const ETIQUETA_ESTADO: Record<string, string> = {
  PENDIENTE: 'Pendiente por completar',
  DESPACHADA: 'Despachada',
  FACTURADA: 'Facturada',
  ANULADA: 'Anulada',
}

interface EstiloPastilla {
  fondo: string
  texto: string
  borde?: string
}

const ESTILO_ESTADO: Record<string, EstiloPastilla> = {
  DESPACHADA: { fondo: '#ebe5e0', texto: ROTULO, borde: '#d6cfc9' },
  PENDIENTE: { fondo: '#fef3c7', texto: '#92400e', borde: '#f59e0b' },
  FACTURADA: { fondo: '#dcfce7', texto: '#166534', borde: '#4ade80' },
  ANULADA: { fondo: '#fee2e2', texto: '#991b1b', borde: '#f87171' },
}

const ESTILO_COBRO = {
  POR_COBRAR: { fondo: '#fef3c7', texto: '#92400e', borde: '#f59e0b' },
  VENCIDA: { fondo: '#fee2e2', texto: '#991b1b', borde: '#ef4444' },
  COBRADA: { fondo: '#dcfce7', texto: '#166534', borde: '#4ade80' },
  NO_FACTURABLE: { fondo: '#e7e5e4', texto: '#44403c', borde: '#a8a29e' },
} as const

const decimal2 = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Entera si es entera. 752 metros cúbicos no se leen «752,00». */
const cantidadLegible = (v: number): string =>
  Number.isInteger(v) ? v.toLocaleString('es-VE') : decimal2.format(v)

/** Determina si una nota es de respaldo / convenio (no facturable o nacida de salida sin precio). */
function esNotaRespaldoConvenio(nota: NotaEntrega): boolean {
  if (nota.estado === 'ANULADA') return false
  return !nota.facturable || (Boolean(nota.nota_salida) && Number(nota.total_usd) === 0)
}

/** Obtiene el vehículo principal y el chofer considerando también `nota.camiones`. */
function transporteDeNota(nota: NotaEntrega): {
  vehiculo: string
  chofer: string | null
  cantidadCamiones: number
} {
  const lista = nota.camiones ?? []
  if (lista.length > 0) {
    const primero = lista[0]
    const placaBase = (primero.vehiculo ?? nota.vehiculo ?? '—').split('·')[0].trim() || '—'
    const mas = lista.length > 1 ? ` (+${lista.length - 1})` : ''
    return {
      vehiculo: `${placaBase}${mas}`,
      chofer: primero.chofer ?? nota.chofer ?? null,
      cantidadCamiones: lista.length,
    }
  }
  return {
    vehiculo: nota.vehiculo ?? '—',
    chofer: nota.chofer ?? null,
    cantidadCamiones: nota.vehiculo ? 1 : 0,
  }
}

/**
 * Ajusta el tamaño de fuente hacia abajo para que una cifra o código de una
 * sola línea nunca se parta en dos renglones ni se recorte.
 */
function textoEnUnaLinea(
  doc: Doc,
  texto: string,
  x: number,
  y: number,
  anchoMax: number,
  tallaBase: number,
  estilo: 'bold' | 'normal',
  align: 'left' | 'right' | 'center' = 'left',
  tallaMin = 5.8,
) {
  doc.setFont('helvetica', estilo)
  let talla = tallaBase
  while (talla > tallaMin) {
    doc.setFontSize(talla)
    if (doc.getTextWidth(texto) <= anchoMax) break
    talla -= 0.25
  }
  doc.setFontSize(talla)
  const impreso = doc.getTextWidth(texto) <= anchoMax ? texto : ajustar(doc, texto, anchoMax)
  doc.text(impreso, x, y, { align })
}

/**
 * Dibuja una pastilla (badge) ejecutiva centrada o alineada a la derecha.
 */
function dibujarPastilla(
  doc: Doc,
  texto: string,
  xDerecha: number,
  yBase: number,
  anchoMax: number,
  estilo: EstiloPastilla,
  tallaBase = 6.2,
) {
  doc.setFont('helvetica', 'bold')
  const pad = 3.0
  let talla = tallaBase
  while (talla > 4.6) {
    doc.setFontSize(talla)
    if (doc.getTextWidth(texto) + pad <= anchoMax) break
    talla -= 0.2
  }
  doc.setFontSize(talla)
  const textoAjustado =
    doc.getTextWidth(texto) + pad <= anchoMax ? texto : ajustar(doc, texto, anchoMax - pad)
  const w = Math.min(anchoMax, Math.max(doc.getTextWidth(textoAjustado) + pad, 12))
  const h = 4.2
  const x = xDerecha - w
  const yCaja = yBase - 3.05

  doc.setFillColor(estilo.fondo)
  if (estilo.borde) {
    doc.setDrawColor(estilo.borde).setLineWidth(0.2)
    doc.roundedRect(x, yCaja, w, h, 0.9, 0.9, 'FD')
  } else {
    doc.roundedRect(x, yCaja, w, h, 0.9, 0.9, 'F')
  }

  doc.setTextColor(estilo.texto)
  doc.text(textoAjustado, x + w / 2, yBase, { align: 'center' })
}

/**
 * Cabecera ejecutiva en la primera página: membrete con logo a la izquierda y
 * tarjeta de control del reporte a la derecha.
 */
function cabeceraEjecutivaReporte(
  doc: Doc,
  logo: string,
  d: {
    empresa: EmpresaPapel
    emitidoPor: string
    momento: Date
    totalNotas: number
    vigentes: number
    noFacturables: number
  },
): number {
  const y = ARRIBA
  const ANCHO_CAJA = 68
  const xCaja = DER - ANCHO_CAJA

  const LADO_LOGO = 23
  if (logo) doc.addImage(logo, 'PNG', IZQ, y - 0.5, LADO_LOGO, LADO_LOGO)

  const TEXTO = logo ? IZQ + LADO_LOGO + 4.5 : IZQ
  const ANCHO_NOMBRE = xCaja - TEXTO - 4

  let talla = 15
  doc.setFont('helvetica', 'bold')
  const nombre = (d.empresa.razonSocial || 'MINERÍA INTERNACIONAL TS, C.A.').toUpperCase()
  while (talla > 9.5) {
    doc.setFontSize(talla)
    if (doc.getTextWidth(nombre) <= ANCHO_NOMBRE) break
    talla -= 0.5
  }

  doc.setTextColor(MARCA).setFontSize(talla)
  doc.text(ajustar(doc, nombre, ANCHO_NOMBRE), TEXTO, y + 5)

  let bajoIzq = y + 5
  if (d.empresa.actividad) {
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(ROTULO)
    doc.text(ajustar(doc, d.empresa.actividad.toUpperCase(), ANCHO_NOMBRE), TEXTO, y + 10)
    bajoIzq = y + 10
  }

  const rifTexto = `RIF: ${d.empresa.rif}`
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(TINTA)
  doc.text(rifTexto, TEXTO, bajoIzq + 4.8)
  if (d.empresa.contacto) {
    const xContacto = TEXTO + doc.getTextWidth(rifTexto)
    doc.setFont('helvetica', 'normal').setTextColor(GRIS)
    doc.text(
      ajustar(doc, `  ·  ${d.empresa.contacto}`, Math.max(12, ANCHO_NOMBRE - (xContacto - TEXTO))),
      xContacto,
      bajoIzq + 4.8,
    )
  }
  bajoIzq += 4.8

  if (d.empresa.domicilio) {
    doc.setFont('helvetica', 'normal').setFontSize(7.1).setTextColor(GRIS)
    const lineas = (
      doc.splitTextToSize(d.empresa.domicilio.toUpperCase(), ANCHO_NOMBRE) as string[]
    ).slice(0, 2)
    doc.text(lineas, TEXTO, bajoIzq + 4.2, { lineHeightFactor: 1.3 })
    bajoIzq = bajoIzq + 4.2 + (lineas.length - 1) * 3
  }

  bajoIzq = Math.max(bajoIzq, y + LADO_LOGO - 1)

  const valorRegistros =
    d.noFacturables > 0 && d.noFacturables === d.vigentes
      ? `${d.vigentes} de convenio / respaldo`
      : d.noFacturables > 0
        ? `${d.vigentes} vigentes (${d.noFacturables} conv.)`
        : `${d.vigentes} vigente${d.vigentes === 1 ? '' : 's'} de ${d.totalNotas}`

  // Tarjeta de Control a la derecha
  const filasCaja = [
    { etiqueta: 'EMITIDO', valor: fechaLarga(d.momento), destacado: false },
    { etiqueta: 'EMITIDO POR', valor: d.emitidoPor || 'Sistema', destacado: false },
    {
      etiqueta: 'REGISTROS',
      valor: valorRegistros,
      destacado: true,
    },
  ]

  const ALTO_CAB = 6.8
  const ALTO_FILA = 5.4
  const altoCaja = ALTO_CAB + filasCaja.length * ALTO_FILA + 2.4
  const yCaja = y - 0.5

  doc.setFillColor('#faf8f6')
  doc.setDrawColor('#d6d3d1').setLineWidth(0.3)
  doc.roundedRect(xCaja, yCaja, ANCHO_CAJA, altoCaja, 1.4, 1.4, 'FD')

  doc.setFillColor(MARCA)
  doc.rect(xCaja, yCaja, ANCHO_CAJA, ALTO_CAB, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(8.2).setTextColor('#FFFFFF')
  doc.text('REPORTE DE NOTAS DE ENTREGA', xCaja + ANCHO_CAJA / 2, yCaja + 4.7, {
    align: 'center',
  })

  let yFila = yCaja + ALTO_CAB + 4.2
  filasCaja.forEach((f, idx) => {
    if (idx > 0) {
      doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
      doc.line(xCaja + 3, yFila - 3.7, DER - 3, yFila - 3.7)
    }
    doc.setFont('helvetica', 'bold').setFontSize(6.8).setTextColor(GRIS)
    doc.text(`${f.etiqueta}:`, xCaja + 3, yFila)

    doc.setTextColor(f.destacado ? MARCA : TINTA)
    textoEnUnaLinea(
      doc,
      f.valor,
      DER - 3,
      yFila,
      ANCHO_CAJA - 27,
      f.destacado ? 7.8 : 7.4,
      'bold',
      'right',
      5.8,
    )
    yFila += ALTO_FILA
  })

  const regla = Math.max(bajoIzq + 3.5, yCaja + altoCaja + 3)
  doc.setDrawColor(MARCA).setLineWidth(0.7)
  doc.line(IZQ, regla, DER, regla)

  return regla + 4.5
}

/**
 * Cabecera ejecutiva compacta para las páginas 2 en adelante, conservando el
 * logo oficial de la empresa sobre fondo limpio.
 */
function cabeceraContinuacion(
  doc: Doc,
  logo: string,
  razonSocial: string,
  momento: Date,
): number {
  const LADO = 12
  if (logo) doc.addImage(logo, 'PNG', IZQ, ARRIBA - 1, LADO, LADO)
  const xTxt = logo ? IZQ + LADO + 3.5 : IZQ

  doc.setTextColor(MARCA).setFont('helvetica', 'bold').setFontSize(9.5)
  doc.text('REPORTE DE NOTAS DE ENTREGA', xTxt, ARRIBA + 4.2)

  doc.setFont('helvetica', 'bold').setFontSize(7.4).setTextColor(ROTULO)
  doc.text(
    ajustar(doc, (razonSocial || 'MINERÍA INTERNACIONAL TS, C.A.').toUpperCase(), 95),
    xTxt,
    ARRIBA + 8.6,
  )

  doc.setFont('helvetica', 'normal').setFontSize(7.4).setTextColor(GRIS)
  doc.text(
    `Emitido: ${fechaLarga(momento)}`,
    DER,
    ARRIBA + 6.5,
    { align: 'right' },
  )

  const yRegla = ARRIBA + 12.2
  doc.setDrawColor(MARCA).setLineWidth(0.6)
  doc.line(IZQ, yRegla, DER, yRegla)

  return yRegla + 5
}

/**
 * Tres tarjetas ejecutivas de resumen en la parte superior del reporte.
 * Si todo el alcance corresponde a notas de respaldo / convenio (ej. Optimavial
 * pendiente por completar y no facturable), adapta las tarjetas para destacar
 * el volumen despachado y la condición «No facturable · Solo respaldo».
 */
function pintarTarjetasResumen(
  doc: Doc,
  y: number,
  resumen: {
    vigentes: number
    despachadas: number
    pendientes: number
    facturadas: number
    anuladas: number
    noFacturables: number
    totalBs: number
    totalUsd: number
    porCobrarCount: number
    porCobrarBs: number
    porCobrarUsd: number
    vencidasCount: number
    vencidasBs: number
    vencidasUsd: number
    cobradasCount: number
    volumenResumenTexto: string
    totalCamiones: number
    /** Sin la tarjeta de cuentas por cobrar: en su lugar, el volumen despachado. */
    sinCobro?: boolean
  },
): number {
  const GAP = 4
  const ancho = (ANCHO_UTIL - GAP * 2) / 3
  const alto = 22.5

  const soloConvenioSinMonto =
    resumen.vigentes > 0 &&
    resumen.noFacturables === resumen.vigentes &&
    resumen.totalUsd === 0 &&
    resumen.porCobrarCount === 0

  const colorCobro =
    resumen.vencidasCount > 0
      ? '#dc2626'
      : resumen.porCobrarCount > 0
        ? '#d97706'
        : '#15803d'

  const tarjetas = soloConvenioSinMonto
    ? [
        {
          acento: '#d97706',
          titulo: 'RESUMEN DE NOTAS',
          valor: `${resumen.vigentes} ${resumen.vigentes === 1 ? 'nota vigente' : 'notas vigentes'}`,
          linea1: `${resumen.pendientes} pendiente${resumen.pendientes === 1 ? '' : 's'} por completar`,
          linea2: 'Respaldo de Notas de Salida (NS)',
          colorLinea2: GRIS,
        },
        {
          acento: ROTULO,
          titulo: 'VOLUMEN DESPACHADO',
          valor: resumen.volumenResumenTexto || `${resumen.vigentes} despachos`,
          linea1: `${resumen.totalCamiones} ${resumen.totalCamiones === 1 ? 'camión registrado' : 'camiones registrados'}`,
          linea2: 'Material descontado en su Nota de Salida',
          colorLinea2: GRIS,
        },
        {
          acento: '#57534e',
          titulo: 'CONDICIÓN FINANCIERA',
          valor: 'No facturable',
          linea1: 'Solo respaldo de convenio / salida',
          linea2: 'No genera cuenta por cobrar ni factura',
          colorLinea2: GRIS,
        },
      ]
    : [
        {
          acento: ROTULO,
          titulo: 'RESUMEN DE NOTAS',
          valor: `${resumen.vigentes} ${resumen.vigentes === 1 ? 'nota vigente' : 'notas vigentes'}`,
          linea1: `${resumen.despachadas} despachada${resumen.despachadas === 1 ? '' : 's'} · ${resumen.pendientes} pendiente${resumen.pendientes === 1 ? '' : 's'}`,
          linea2:
            resumen.noFacturables > 0
              ? `${resumen.noFacturables} solo respaldo / convenio (no fact.)`
              : `${resumen.facturadas > 0 ? `${resumen.facturadas} facturada${resumen.facturadas === 1 ? '' : 's'} · ` : ''}${resumen.anuladas} anulada${resumen.anuladas === 1 ? '' : 's'}`,
          colorLinea2: resumen.noFacturables > 0 ? '#92400e' : GRIS,
        },
        {
          acento: MARCA,
          titulo: resumen.noFacturables > 0 ? 'MONTO TOTAL (FACTURABLES)' : 'MONTO TOTAL (VIGENTES)',
          valor: dolares(resumen.totalUsd),
          linea1: `En bolívares: ${bolivares(resumen.totalBs)}`,
          linea2:
            resumen.noFacturables > 0
              ? 'Excluye notas sin cargo / no facturables'
              : 'Convertido a la tasa BCV de cada nota',
          colorLinea2: GRIS,
        },
        resumen.sinCobro
          ? {
              acento: ROTULO,
              titulo: 'VOLUMEN DESPACHADO',
              valor: resumen.volumenResumenTexto || `${resumen.vigentes} despachos`,
              linea1: `${resumen.totalCamiones} ${resumen.totalCamiones === 1 ? 'camión registrado' : 'camiones registrados'}`,
              linea2: 'Suma de los renglones de las notas vigentes',
              colorLinea2: GRIS,
            }
          : {
          acento: colorCobro,
          titulo: 'CUENTAS POR COBRAR',
          valor:
            resumen.porCobrarCount > 0
              ? `${dolares(resumen.porCobrarUsd)} (${resumen.porCobrarCount})`
              : dolares(0),
          linea1:
            resumen.porCobrarCount > 0
              ? `Equivalente: ${bolivares(resumen.porCobrarBs)}`
              : 'Sin notas pendientes de cobro',
          linea2:
            resumen.vencidasCount > 0
              ? `${resumen.vencidasCount} vencida${resumen.vencidasCount === 1 ? '' : 's'}: ${dolares(resumen.vencidasUsd)} (${bolivares(resumen.vencidasBs)})`
              : resumen.porCobrarCount > 0
                ? `${resumen.porCobrarCount} por cobrar al día · 0 vencidas`
                : resumen.cobradasCount > 0
                  ? `${resumen.cobradasCount} nota${resumen.cobradasCount === 1 ? '' : 's'} ya cobrada${resumen.cobradasCount === 1 ? '' : 's'}`
                  : 'Todas las notas están al día',
          colorLinea2: resumen.vencidasCount > 0 ? '#b91c1c' : GRIS,
        },
      ]

  tarjetas.forEach((t, i) => {
    const x = IZQ + i * (ancho + GAP)
    doc.setFillColor('#ffffff')
    doc.setDrawColor('#d6d3d1').setLineWidth(0.28)
    doc.roundedRect(x, y, ancho, alto, 1.3, 1.3, 'FD')

    doc.setFillColor(t.acento)
    doc.rect(x, y, 2, alto, 'F')

    const xTexto = x + 4.5
    const anchoTexto = ancho - 7

    doc.setFont('helvetica', 'bold').setFontSize(6.8).setTextColor(t.acento)
    doc.text(t.titulo, xTexto, y + 4.8)

    doc.setTextColor('#1c1917')
    textoEnUnaLinea(doc, t.valor, xTexto, y + 11.2, anchoTexto, 11.2, 'bold', 'left', 8)

    doc.setFont('helvetica', 'bold').setFontSize(6.9).setTextColor(TINTA)
    doc.text(ajustar(doc, t.linea1, anchoTexto), xTexto, y + 16.2)

    doc
      .setFont('helvetica', t.colorLinea2 !== GRIS ? 'bold' : 'normal')
      .setFontSize(6.6)
      .setTextColor(t.colorLinea2)
    doc.text(ajustar(doc, t.linea2, anchoTexto), xTexto, y + 20.1)
  })

  return y + alto + 6
}

/**
 * Título de sección con barra lateral ejecutiva.
 */
function tituloSeccionEjecutiva(
  doc: Doc,
  y: number,
  titulo: string,
  subtitulo?: string,
  color = ROTULO,
): number {
  doc.setFillColor(color)
  doc.rect(IZQ, y, 2.2, 5.2, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(ROTULO)
  doc.text(titulo.toUpperCase(), IZQ + 4.5, y + 4.1)

  if (subtitulo) {
    const xSub = IZQ + 4.5 + doc.getTextWidth(titulo.toUpperCase()) + 3
    doc.setFont('helvetica', 'normal').setFontSize(7.4).setTextColor(GRIS)
    doc.text(ajustar(doc, subtitulo, DER - xSub), xSub, y + 4.1)
  }

  return y + 7.2
}

// ---------------------------------------------------------------------------
// Geometría de columnas de la Planilla Principal (suma = 178 mm)
// ---------------------------------------------------------------------------
const COL_PLANILLA = {
  nota: { x: IZQ, w: 22 }, // 16..38
  cliente: { x: IZQ + 22, w: 35 }, // 38..73
  vehiculo: { x: IZQ + 57, w: 23 }, // 73..96
  fecha: { x: IZQ + 80, w: 16 }, // 96..112
  total: { x: IZQ + 96, w: 18 }, // 112..130
  totalBs: { x: IZQ + 114, w: 20 }, // 130..150
  totalUsd: { x: IZQ + 134, w: 15 }, // 150..165
  estado: { x: IZQ + 149, w: 29 }, // 165..194
  divisores: [IZQ + 22, IZQ + 57, IZQ + 80, IZQ + 96, IZQ + 114, IZQ + 134, IZQ + 149],
}

function cabeceraTablaPlanilla(doc: Doc, y: number): number {
  const ALTO = 7.8
  doc.setFillColor(MARCA)
  doc.rect(IZQ, y, ANCHO_UTIL, ALTO, 'F')

  doc.setDrawColor('#b05646').setLineWidth(0.22)
  for (const xDiv of COL_PLANILLA.divisores) {
    doc.line(xDiv, y + 1.3, xDiv, y + ALTO - 1.3)
  }

  const yTxt = y + 5.1
  doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor('#FFFFFF')
  doc.text('# NOTA', COL_PLANILLA.nota.x + 2, yTxt)
  doc.text('CLIENTE / DESTINO', COL_PLANILLA.cliente.x + 2, yTxt)
  doc.text('VEHÍCULO', COL_PLANILLA.vehiculo.x + 2, yTxt)
  doc.text('FECHA', COL_PLANILLA.fecha.x + COL_PLANILLA.fecha.w / 2, yTxt, { align: 'center' })
  doc.text('TOTAL', COL_PLANILLA.total.x + COL_PLANILLA.total.w - 2, yTxt, { align: 'right' })
  doc.text('TOTAL BS', COL_PLANILLA.totalBs.x + COL_PLANILLA.totalBs.w - 2, yTxt, {
    align: 'right',
  })
  doc.text('TOTAL $', COL_PLANILLA.totalUsd.x + COL_PLANILLA.totalUsd.w - 2, yTxt, {
    align: 'right',
  })
  doc.text('ESTADO / CONDICIÓN', COL_PLANILLA.estado.x + COL_PLANILLA.estado.w - 2, yTxt, {
    align: 'right',
  })

  return y + ALTO
}

function infoSecundariaEstado(nota: NotaEntrega, sinCobro = false): {
  etiqueta: string
  estilo: EstiloPastilla
} | null {
  if (nota.estado === 'ANULADA') return null

  if (!nota.facturable) {
    return {
      etiqueta: nota.nota_salida ? `No facturable · ${nota.nota_salida}` : 'No facturable · Respaldo',
      estilo: ESTILO_COBRO.NO_FACTURABLE,
    }
  }

  if (!nota.pendiente_por_cobrar) {
    if (nota.nota_salida && Number(nota.total_usd) === 0) {
      return {
        etiqueta: `Respaldo · ${nota.nota_salida}`,
        estilo: ESTILO_COBRO.NO_FACTURABLE,
      }
    }
    return null
  }
  // Ocultar el cobro: ni «Por cobrar», ni «Vencida», ni «Cobrada».
  if (sinCobro) return null

  if (nota.cobrada_en) {
    return {
      etiqueta: `Cobrada · ${fechaCorta(nota.cobrada_en)}`,
      estilo: ESTILO_COBRO.COBRADA,
    }
  }
  const f = nota.fecha_pago ? fechaCorta(nota.fecha_pago) : 'Sin fecha'
  if (nota.vencida_por_cobrar) {
    return {
      etiqueta: `Vencida · ${f}`,
      estilo: ESTILO_COBRO.VENCIDA,
    }
  }
  return {
    etiqueta: `Por cobrar · ${f}`,
    estilo: ESTILO_COBRO.POR_COBRAR,
  }
}

export async function armarReporteNotasDeEntrega(d: {
  empresa: EmpresaPapel
  emitidoPor: string
  momento: Date
  notas: NotaEntrega[]
  /** Qué se despachó, ya sumado por artículo. */
  materiales?: MaterialDespachado[]
  /**
   * Sin nada de cobro (Christopher, 06/11/2026): ni la tarjeta de cuentas por
   * cobrar, ni las etiquetas «Por cobrar / Vencida / Cobrada», ni el fondo de
   * las vencidas, ni el renglón de pendiente ni la relación por cliente. Las
   * notas y sus montos siguen iguales. Lo que se apaga no deja rastro.
   */
  ocultarCobro?: boolean
  /** Se agrega al nombre del archivo: «-sin-cobro», «-sin-por-cobrar»… */
  sufijoArchivo?: string
}): Promise<ArchivoArmado> {
  const titulo = 'Reporte de Notas de Entrega'
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen(600, false)
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  const vigentes = d.notas.filter((nota) => nota.estado !== 'ANULADA')
  const despachadas = vigentes.filter((n) => n.estado === 'DESPACHADA').length
  const pendientes = vigentes.filter((n) => n.estado === 'PENDIENTE').length
  const facturadas = vigentes.filter((n) => n.estado === 'FACTURADA').length
  const anuladas = d.notas.length - vigentes.length

  const notasRespaldo = vigentes.filter(esNotaRespaldoConvenio)
  const notasComerciales = vigentes.filter((n) => !esNotaRespaldoConvenio(n))

  const totalBs = vigentes.reduce((s, nota) => s + Number(nota.total_bs), 0)
  const totalUsd = vigentes.reduce((s, nota) => s + Number(nota.total_usd), 0)

  // Cuentas por cobrar dentro del alcance (notas vigentes con pendiente_por_cobrar y sin cobrar)
  // Con el cobro oculto quedan vacías, y con ellas el renglón de pendiente y la relación por cliente.
  const sinCobro = d.ocultarCobro === true
  const notasPorCobrar = sinCobro ? [] : vigentes.filter((n) => n.pendiente_por_cobrar && !n.cobrada_en)
  const notasVencidas = notasPorCobrar.filter((n) => n.vencida_por_cobrar)
  const notasCobradas = sinCobro ? [] : vigentes.filter((n) => n.pendiente_por_cobrar && Boolean(n.cobrada_en))

  const porCobrarBs = notasPorCobrar.reduce((s, n) => s + Number(n.total_bs), 0)
  const porCobrarUsd = notasPorCobrar.reduce((s, n) => s + Number(n.total_usd), 0)
  const vencidasBs = notasVencidas.reduce((s, n) => s + Number(n.total_bs), 0)
  const vencidasUsd = notasVencidas.reduce((s, n) => s + Number(n.total_usd), 0)

  // Volumen total por unidad (para resúmenes de convenio / Optimavial)
  const volumenPorUnidad = new Map<string, number>()
  for (const m of d.materiales ?? []) {
    const u = m.unidad || 'UND'
    volumenPorUnidad.set(u, (volumenPorUnidad.get(u) ?? 0) + Number(m.cantidad))
  }
  const volumenResumenTexto = [...volumenPorUnidad.entries()]
    .map(([u, cant]) => `${cantidadLegible(cant)} ${u}`)
    .join(' · ')

  const totalCamiones = vigentes.reduce((s, n) => s + transporteDeNota(n).cantidadCamiones, 0)

  let y = cabeceraEjecutivaReporte(doc, logo, {
    empresa: d.empresa,
    emitidoPor: d.emitidoPor,
    momento: d.momento,
    totalNotas: d.notas.length,
    vigentes: vigentes.length,
    noFacturables: notasRespaldo.length,
  })

  y = pintarTarjetasResumen(doc, y, {
    vigentes: vigentes.length,
    despachadas,
    pendientes,
    facturadas,
    anuladas,
    noFacturables: notasRespaldo.length,
    totalBs,
    totalUsd,
    porCobrarCount: notasPorCobrar.length,
    porCobrarBs,
    porCobrarUsd,
    vencidasCount: notasVencidas.length,
    vencidasBs,
    vencidasUsd,
    cobradasCount: notasCobradas.length,
    volumenResumenTexto,
    totalCamiones,
    sinCobro,
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 1. PLANILLA DE NOTAS DE ENTREGA
  // ─────────────────────────────────────────────────────────────────────────
  y = tituloSeccionEjecutiva(
    doc,
    y,
    'Planilla de notas de entrega',
    notasRespaldo.length > 0
      ? 'Incluye notas comerciales (tasa BCV congelada) y notas de respaldo de salida / convenio'
      : 'Montos expresados con la tasa BCV congelada en la fecha de cada nota',
  )

  let yInicioTabla = y
  y = cabeceraTablaPlanilla(doc, y)

  const cerrarBordeTablaPlanilla = (yFin: number) => {
    doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
    doc.line(IZQ, yInicioTabla, IZQ, yFin)
    doc.line(DER, yInicioTabla, DER, yFin)
    doc.setDrawColor(MARCA).setLineWidth(0.5)
    doc.line(IZQ, yFin, DER, yFin)
  }

  if (d.notas.length === 0) {
    const altoVacio = 12
    doc.setFillColor('#ffffff')
    doc.rect(IZQ, y, ANCHO_UTIL, altoVacio, 'F')
    doc.setFont('helvetica', 'italic').setFontSize(8.5).setTextColor(GRIS)
    doc.text('No existen notas de entrega registradas para generar el informe.', IZQ + ANCHO_UTIL / 2, y + 7.2, {
      align: 'center',
    })
    y += altoVacio
    cerrarBordeTablaPlanilla(y)
  } else {
    for (const [idx, nota] of d.notas.entries()) {
      const clienteNombre = nota.cliente ?? 'Cliente por concretar'
      doc.setFont('helvetica', 'bold').setFontSize(7.5)
      const lineasCliente = (
        doc.splitTextToSize(clienteNombre, COL_PLANILLA.cliente.w - 4) as string[]
      ).slice(0, 3)

      const esRespaldo = esNotaRespaldoConvenio(nota)

      const subNota = nota.factura_numero
        ? `Fact. ${nota.factura_numero}`
        : nota.nota_salida
          ? `Respalda ${nota.nota_salida}`
          : null

      const subCliente = !nota.facturable
        ? 'Convenio · Solo respaldo (No fact.)'
        : nota.nota_salida && Number(nota.total_usd) === 0
          ? 'Respaldo de salida · Sin precio'
          : nota.cliente_rif
            ? documento(nota.cliente_rif)
            : null

      const trans = transporteDeNota(nota)
      const infoSecundaria = infoSecundariaEstado(nota, sinCobro)
      const tieneDosPastillas = infoSecundaria !== null
      const renglonesIzq = Math.max(
        subNota ? 2 : 1,
        lineasCliente.length + (subCliente ? 1 : 0),
        trans.chofer ? 2 : 1,
      )
      const altoPorTexto = 6.6 + (renglonesIzq - 1) * 3.2
      const altoPorPastillas = tieneDosPastillas ? 11.2 : 7
      const altoFila = Math.max(altoPorTexto, altoPorPastillas)

      if (y + altoFila > ABAJO - 14) {
        cerrarBordeTablaPlanilla(y)
        doc.addPage()
        y = cabeceraContinuacion(doc, logo, d.empresa.razonSocial, d.momento)
        yInicioTabla = y
        y = cabeceraTablaPlanilla(doc, y)
      }

      // Fondo alterno o sutil realce según vencimiento o nota de convenio
      if (!sinCobro && nota.vencida_por_cobrar && !nota.cobrada_en && nota.estado !== 'ANULADA') {
        doc.setFillColor('#fff8f8')
      } else if (esRespaldo) {
        doc.setFillColor(idx % 2 === 1 ? '#faf6ee' : '#fffdf7')
      } else {
        doc.setFillColor(idx % 2 === 1 ? FILA_ALTERNA : '#ffffff')
      }
      doc.rect(IZQ, y, ANCHO_UTIL, altoFila, 'F')

      // Separadores verticales y línea inferior
      doc.setDrawColor(HAIRLINE).setLineWidth(0.22)
      for (const xDiv of COL_PLANILLA.divisores) {
        doc.line(xDiv, y, xDiv, y + altoFila)
      }
      doc.line(IZQ, y + altoFila, DER, y + altoFila)

      const yBase = y + 4.5

      // 1. # Nota (siempre en una línea) + Factura o NS
      doc.setTextColor('#1c1917')
      textoEnUnaLinea(
        doc,
        nota.numero,
        COL_PLANILLA.nota.x + 2,
        yBase,
        COL_PLANILLA.nota.w - 4,
        7.8,
        'bold',
        'left',
      )
      if (subNota) {
        doc.setTextColor(nota.nota_salida ? '#92400e' : GRIS)
        textoEnUnaLinea(
          doc,
          subNota,
          COL_PLANILLA.nota.x + 2,
          yBase + 3.3,
          COL_PLANILLA.nota.w - 4,
          6.3,
          nota.nota_salida ? 'bold' : 'normal',
          'left',
        )
      }

      // 2. Cliente (+ RIF o leyenda de convenio / solo respaldo)
      doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor('#1c1917')
      lineasCliente.forEach((linea, lIdx) => {
        doc.text(linea, COL_PLANILLA.cliente.x + 2, yBase + lIdx * 3.2)
      })
      if (subCliente) {
        doc
          .setFont('helvetica', !nota.facturable ? 'bold' : 'normal')
          .setFontSize(6.2)
          .setTextColor(!nota.facturable ? '#92400e' : GRIS)
        doc.text(
          ajustar(doc, subCliente, COL_PLANILLA.cliente.w - 4),
          COL_PLANILLA.cliente.x + 2,
          yBase + lineasCliente.length * 3.2,
        )
      }

      // 3. Vehículo y Chofer (considerando nota.camiones cuando hay varios)
      doc.setTextColor('#1c1917')
      textoEnUnaLinea(
        doc,
        trans.vehiculo,
        COL_PLANILLA.vehiculo.x + 2,
        yBase,
        COL_PLANILLA.vehiculo.w - 4,
        7.4,
        'bold',
        'left',
      )
      if (trans.chofer) {
        doc.setFont('helvetica', 'normal').setFontSize(6.3).setTextColor(GRIS)
        doc.text(
          ajustar(doc, trans.chofer, COL_PLANILLA.vehiculo.w - 4),
          COL_PLANILLA.vehiculo.x + 2,
          yBase + 3.3,
        )
      }

      // 4. Fecha (siempre en una línea)
      doc.setTextColor(TINTA)
      textoEnUnaLinea(
        doc,
        fechaCorta(nota.fecha),
        COL_PLANILLA.fecha.x + COL_PLANILLA.fecha.w / 2,
        yBase,
        COL_PLANILLA.fecha.w - 2.5,
        7.2,
        'normal',
        'center',
      )

      // 5, 6 y 7. Montos (o indicación de Sin cargo / Sin precio si es respaldo con monto 0)
      const sinMontoPorConvenio = esRespaldo && Number(nota.total_usd) === 0
      if (sinMontoPorConvenio) {
        doc.setTextColor('#57534e')
        textoEnUnaLinea(
          doc,
          !nota.facturable ? 'Sin cargo' : 'Sin precio',
          COL_PLANILLA.total.x + COL_PLANILLA.total.w - 2,
          yBase,
          COL_PLANILLA.total.w - 3.5,
          7.1,
          'bold',
          'right',
        )
        if (nota.precios_pendientes > 0) {
          doc.setTextColor(GRIS)
          textoEnUnaLinea(
            doc,
            'Sin precio',
            COL_PLANILLA.total.x + COL_PLANILLA.total.w - 2,
            yBase + 3.2,
            COL_PLANILLA.total.w - 3.5,
            5.8,
            'normal',
            'right',
          )
        }
        doc.setFont('helvetica', 'normal').setFontSize(7.4).setTextColor(GRIS)
        doc.text('—', COL_PLANILLA.totalBs.x + COL_PLANILLA.totalBs.w - 2, yBase, {
          align: 'right',
        })
        doc.text('—', COL_PLANILLA.totalUsd.x + COL_PLANILLA.totalUsd.w - 2, yBase, {
          align: 'right',
        })
      } else {
        doc.setTextColor('#1c1917')
        textoEnUnaLinea(
          doc,
          dinero(nota.moneda, nota.total),
          COL_PLANILLA.total.x + COL_PLANILLA.total.w - 2,
          yBase,
          COL_PLANILLA.total.w - 3.5,
          7.5,
          'bold',
          'right',
        )
        if (nota.pago_combinado) {
          doc.setTextColor(ROTULO)
          textoEnUnaLinea(
            doc,
            'Pago comb.',
            COL_PLANILLA.total.x + COL_PLANILLA.total.w - 2,
            yBase + 3.2,
            COL_PLANILLA.total.w - 3.5,
            5.8,
            'normal',
            'right',
          )
        }

        doc.setTextColor(TINTA)
        textoEnUnaLinea(
          doc,
          bolivares(nota.total_bs),
          COL_PLANILLA.totalBs.x + COL_PLANILLA.totalBs.w - 2,
          yBase,
          COL_PLANILLA.totalBs.w - 3.5,
          7.3,
          'normal',
          'right',
        )

        doc.setTextColor('#1c1917')
        textoEnUnaLinea(
          doc,
          dolares(nota.total_usd),
          COL_PLANILLA.totalUsd.x + COL_PLANILLA.totalUsd.w - 2,
          yBase,
          COL_PLANILLA.totalUsd.w - 3.5,
          7.6,
          'bold',
          'right',
        )
      }

      // 8. Estado + Cuenta por cobrar / Condición No facturable (en pastillas ejecutivas)
      const xDerEstado = COL_PLANILLA.estado.x + COL_PLANILLA.estado.w - 2
      const anchoMaxPastilla = COL_PLANILLA.estado.w - 3.5
      const etqEstado = ETIQUETA_ESTADO[nota.estado] ?? nota.estado
      const estiloEst = ESTILO_ESTADO[nota.estado] ?? ESTILO_ESTADO.DESPACHADA

      dibujarPastilla(doc, etqEstado, xDerEstado, yBase - 0.2, anchoMaxPastilla, estiloEst, 6.1)

      if (infoSecundaria) {
        dibujarPastilla(
          doc,
          infoSecundaria.etiqueta,
          xDerEstado,
          yBase + 4.5,
          anchoMaxPastilla,
          infoSecundaria.estilo,
          5.9,
        )
      }

      y += altoFila
    }

    cerrarBordeTablaPlanilla(y)
  }

  // Banda de totales al pie de la planilla
  const filasTotales: Array<{ izq: string; der: string; color: string }> = []
  if (notasComerciales.length > 0 || notasRespaldo.length === 0) {
    filasTotales.push({
      izq:
        notasRespaldo.length > 0
          ? `TOTAL NOTAS COMERCIALES VIGENTES (${notasComerciales.length})`
          : `TOTAL NOTAS VIGENTES (${vigentes.length})`,
      der: `${bolivares(totalBs)}   ·   ${dolares(totalUsd)}`,
      color: MARCA,
    })
  }
  if (notasRespaldo.length > 0) {
    const clientesRespaldo = [
      ...new Set(notasRespaldo.map((n) => n.cliente ?? 'Sin cliente')),
    ].slice(0, 2)
    const sufijoClientes = clientesRespaldo.length > 0 ? ` · ${clientesRespaldo.join(', ')}` : ''
    filasTotales.push({
      izq: `NOTAS DE RESPALDO / CONVENIO NO FACTURABLES (${notasRespaldo.length} ${notasRespaldo.length === 1 ? 'nota' : 'notas'}${sufijoClientes})`,
      der:
        notasComerciales.length === 0 && volumenResumenTexto
          ? `Volumen total: ${volumenResumenTexto} (Sin cargo)`
          : 'Solo control de volumen (sin cargo en $)',
      color: '#92400e',
    })
  }
  if (notasPorCobrar.length > 0) {
    filasTotales.push({
      izq: `PENDIENTE POR COBRAR (${notasPorCobrar.length} ${notasPorCobrar.length === 1 ? 'nota' : 'notas'}${
        notasVencidas.length > 0
          ? ` · ${notasVencidas.length} vencida${notasVencidas.length === 1 ? '' : 's'}`
          : ''
      })`,
      der: `${bolivares(porCobrarBs)}   ·   ${dolares(porCobrarUsd)}`,
      color: notasVencidas.length > 0 ? '#b91c1c' : '#92400e',
    })
  }

  const altoTotalPlanilla = 2.6 + filasTotales.length * 5.6
  if (y + altoTotalPlanilla > ABAJO - 14) {
    doc.addPage()
    y = cabeceraContinuacion(doc, logo, d.empresa.razonSocial, d.momento)
  }

  doc.setFillColor('#faf8f6')
  doc.setDrawColor(MARCA).setLineWidth(0.4)
  doc.rect(IZQ, y, ANCHO_UTIL, altoTotalPlanilla, 'FD')

  filasTotales.forEach((f, idx) => {
    const yF = y + 5.1 + idx * 5.6
    if (idx > 0) {
      doc.setDrawColor(HAIRLINE).setLineWidth(0.22)
      doc.line(IZQ + 3, yF - 3.8, DER - 3, yF - 3.8)
    }
    doc.setFont('helvetica', 'bold').setFontSize(idx === 0 ? 8.0 : 7.3).setTextColor(f.color)
    doc.text(ajustar(doc, f.izq, 108), IZQ + 3.5, yF)
    doc.setFont('helvetica', 'bold').setFontSize(idx === 0 ? 8.3 : 7.5).setTextColor('#111111')
    doc.text(f.der, DER - 3.5, yF, { align: 'right' })
  })

  y += altoTotalPlanilla + 3.5
  doc.setFont('helvetica', 'italic').setFontSize(6.8).setTextColor(GRIS)
  const notaPiePlanilla = doc.splitTextToSize(
    'Cada monto se calcula con la tasa BCV vigente el día en que se emitió su nota, ya congelada. Las notas de respaldo de salida (convenio / no facturables) documentan la entrega de material sin generar factura comercial.',
    ANCHO_UTIL,
  ) as string[]
  doc.text(notaPiePlanilla, IZQ, y + 1.5, { lineHeightFactor: 1.3 })
  y += notaPiePlanilla.length * 3.1 + 4.5

  // ─────────────────────────────────────────────────────────────────────────
  // 2. RELACIÓN DE DESPACHOS POR CONVENIO / RESPALDO DE SALIDA (NO FACTURABLES)
  // ─────────────────────────────────────────────────────────────────────────
  if (notasRespaldo.length > 0) {
    interface ResumenConvenio {
      cliente: string
      notas: number
      salidas: string[]
      camiones: number
      pendientes: number
    }
    const mapaConvenio = new Map<string, ResumenConvenio>()
    for (const n of notasRespaldo) {
      const clave = n.cliente ?? 'Destinatario por concretar'
      const actual = mapaConvenio.get(clave) ?? {
        cliente: clave,
        notas: 0,
        salidas: [],
        camiones: 0,
        pendientes: 0,
      }
      actual.notas += 1
      if (n.nota_salida && !actual.salidas.includes(n.nota_salida)) {
        actual.salidas.push(n.nota_salida)
      }
      actual.camiones += transporteDeNota(n).cantidadCamiones
      if (n.estado === 'PENDIENTE') actual.pendientes += 1
      mapaConvenio.set(clave, actual)
    }

    const listaConvenios = [...mapaConvenio.values()].sort((a, b) => b.notas - a.notas)

    if (y + 32 > ABAJO - 14) {
      doc.addPage()
      y = cabeceraContinuacion(doc, logo, d.empresa.razonSocial, d.momento)
    }

    y = tituloSeccionEjecutiva(
      doc,
      y,
      'Relación de despachos por convenio / respaldo de salida (No facturables)',
      'Material despachado con Nota de Salida sin generación de factura comercial',
      '#d97706',
    )

    const COL_CONV = {
      cliente: { x: IZQ, w: 64 }, // 16..80
      notas: { x: IZQ + 64, w: 24 }, // 80..104
      salidas: { x: IZQ + 88, w: 42 }, // 104..146
      camiones: { x: IZQ + 130, w: 20 }, // 146..166
      condicion: { x: IZQ + 150, w: 28 }, // 166..194
      divisores: [IZQ + 64, IZQ + 88, IZQ + 130, IZQ + 150],
    }

    const pintarCabeceraConvenio = (yCab: number) => {
      const H = 7.5
      doc.setFillColor(ROTULO)
      doc.rect(IZQ, yCab, ANCHO_UTIL, H, 'F')
      doc.setDrawColor('#6e5544').setLineWidth(0.22)
      for (const xDiv of COL_CONV.divisores) {
        doc.line(xDiv, yCab + 1.3, xDiv, yCab + H - 1.3)
      }
      const yT = yCab + 5
      doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor('#FFFFFF')
      doc.text('DESTINATARIO / CONVENIO', COL_CONV.cliente.x + 2.5, yT)
      doc.text('NOTAS ENTREGA', COL_CONV.notas.x + COL_CONV.notas.w / 2, yT, { align: 'center' })
      doc.text('NOTAS DE SALIDA (NS)', COL_CONV.salidas.x + COL_CONV.salidas.w / 2, yT, {
        align: 'center',
      })
      doc.text('VIAJES', COL_CONV.camiones.x + COL_CONV.camiones.w / 2, yT, { align: 'center' })
      doc.text('CONDICIÓN', COL_CONV.condicion.x + COL_CONV.condicion.w - 2.5, yT, {
        align: 'right',
      })
      return yCab + H
    }

    let yInicioConv = y
    y = pintarCabeceraConvenio(y)

    const cerrarTablaConv = (yFin: number) => {
      doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
      doc.line(IZQ, yInicioConv, IZQ, yFin)
      doc.line(DER, yInicioConv, DER, yFin)
      doc.setDrawColor(ROTULO).setLineWidth(0.5)
      doc.line(IZQ, yFin, DER, yFin)
    }

    for (const [idx, c] of listaConvenios.entries()) {
      const altoFila = 8.2
      if (y + altoFila > ABAJO - 16) {
        cerrarTablaConv(y)
        doc.addPage()
        y = cabeceraContinuacion(doc, logo, d.empresa.razonSocial, d.momento)
        yInicioConv = y
        y = pintarCabeceraConvenio(y)
      }

      doc.setFillColor(idx % 2 === 1 ? '#faf6ee' : '#fffdf7')
      doc.rect(IZQ, y, ANCHO_UTIL, altoFila, 'F')

      doc.setDrawColor(HAIRLINE).setLineWidth(0.22)
      for (const xDiv of COL_CONV.divisores) {
        doc.line(xDiv, y, xDiv, y + altoFila)
      }
      doc.line(IZQ, y + altoFila, DER, y + altoFila)

      const yB = y + 4.3
      doc.setFont('helvetica', 'bold').setFontSize(7.6).setTextColor('#1c1917')
      doc.text(ajustar(doc, c.cliente, COL_CONV.cliente.w - 5), COL_CONV.cliente.x + 2.5, yB)
      doc.setFont('helvetica', 'normal').setFontSize(6.2).setTextColor(GRIS)
      doc.text('Respaldo de salidas autorizadas de patio', COL_CONV.cliente.x + 2.5, yB + 2.9)

      doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(TINTA)
      doc.text(
        `${c.notas} ${c.notas === 1 ? 'nota' : 'notas'}`,
        COL_CONV.notas.x + COL_CONV.notas.w / 2,
        yB + 0.8,
        { align: 'center' },
      )

      const nsTexto =
        c.salidas.length === 0
          ? '—'
          : c.salidas.length <= 2
            ? c.salidas.join(', ')
            : `${c.salidas[c.salidas.length - 1]} a ${c.salidas[0]} (${c.salidas.length})`

      doc.setTextColor(TINTA)
      textoEnUnaLinea(
        doc,
        nsTexto,
        COL_CONV.salidas.x + COL_CONV.salidas.w / 2,
        yB + 0.8,
        COL_CONV.salidas.w - 4,
        7.1,
        'normal',
        'center',
      )

      doc.setFont('helvetica', 'bold').setFontSize(7.4).setTextColor(TINTA)
      doc.text(
        c.camiones > 0 ? `${c.camiones}` : '—',
        COL_CONV.camiones.x + COL_CONV.camiones.w / 2,
        yB + 0.8,
        { align: 'center' },
      )

      dibujarPastilla(
        doc,
        c.pendientes > 0 ? 'Pendiente · No fact.' : 'No facturable',
        COL_CONV.condicion.x + COL_CONV.condicion.w - 2.5,
        yB + 0.8,
        COL_CONV.condicion.w - 4,
        ESTILO_ESTADO.PENDIENTE,
        6.0,
      )

      y += altoFila
    }

    cerrarTablaConv(y)
    y += 5.5
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. RELACIÓN EJECUTIVA DE CUENTAS POR COBRAR (cuando hay notas por cobrar)
  // ─────────────────────────────────────────────────────────────────────────
  if (notasPorCobrar.length > 0) {
    interface ResumenClienteCobro {
      cliente: string
      rif: string | null
      notas: number
      vencidas: number
      proximoVencimiento: string | null
      totalBs: number
      totalUsd: number
    }
    const mapaClientes = new Map<string, ResumenClienteCobro>()
    for (const n of notasPorCobrar) {
      const clave = n.cliente ?? 'Cliente por concretar'
      const actual = mapaClientes.get(clave) ?? {
        cliente: clave,
        rif: n.cliente_rif,
        notas: 0,
        vencidas: 0,
        proximoVencimiento: null,
        totalBs: 0,
        totalUsd: 0,
      }
      actual.notas += 1
      if (n.vencida_por_cobrar) actual.vencidas += 1
      if (
        n.fecha_pago &&
        (!actual.proximoVencimiento || n.fecha_pago < actual.proximoVencimiento)
      ) {
        actual.proximoVencimiento = n.fecha_pago
      }
      actual.totalBs += Number(n.total_bs)
      actual.totalUsd += Number(n.total_usd)
      mapaClientes.set(clave, actual)
    }

    const clientesCobro = [...mapaClientes.values()].sort(
      (a, b) => b.vencidas - a.vencidas || b.totalUsd - a.totalUsd,
    )

    if (y + 34 > ABAJO - 14) {
      doc.addPage()
      y = cabeceraContinuacion(doc, logo, d.empresa.razonSocial, d.momento)
    }

    y = tituloSeccionEjecutiva(
      doc,
      y,
      'Resumen de cuentas por cobrar por cliente',
      `${notasPorCobrar.length} ${notasPorCobrar.length === 1 ? 'nota con saldo pendiente' : 'notas con saldo pendiente'} de cobro`,
      notasVencidas.length > 0 ? '#dc2626' : '#d97706',
    )

    const COL_COBRO = {
      cliente: { x: IZQ, w: 66 }, // 16..82
      notas: { x: IZQ + 66, w: 20 }, // 82..102
      vence: { x: IZQ + 86, w: 24 }, // 102..126
      bs: { x: IZQ + 110, w: 24 }, // 126..150
      usd: { x: IZQ + 134, w: 20 }, // 150..170
      estado: { x: IZQ + 154, w: 24 }, // 170..194
      divisores: [IZQ + 66, IZQ + 86, IZQ + 110, IZQ + 134, IZQ + 154],
    }

    const pintarCabeceraCobro = (yCab: number) => {
      const H = 7.5
      doc.setFillColor(ROTULO)
      doc.rect(IZQ, yCab, ANCHO_UTIL, H, 'F')
      doc.setDrawColor('#6e5544').setLineWidth(0.22)
      for (const xDiv of COL_COBRO.divisores) {
        doc.line(xDiv, yCab + 1.3, xDiv, yCab + H - 1.3)
      }
      const yT = yCab + 5
      doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor('#FFFFFF')
      doc.text('CLIENTE', COL_COBRO.cliente.x + 2.5, yT)
      doc.text('NOTAS', COL_COBRO.notas.x + COL_COBRO.notas.w / 2, yT, { align: 'center' })
      doc.text('VENCIMIENTO', COL_COBRO.vence.x + COL_COBRO.vence.w / 2, yT, { align: 'center' })
      doc.text('SALDO BS', COL_COBRO.bs.x + COL_COBRO.bs.w - 2.5, yT, { align: 'right' })
      doc.text('SALDO $', COL_COBRO.usd.x + COL_COBRO.usd.w - 2.5, yT, { align: 'right' })
      doc.text('ESTADO', COL_COBRO.estado.x + COL_COBRO.estado.w - 2.5, yT, { align: 'right' })
      return yCab + H
    }

    let yInicioCobro = y
    y = pintarCabeceraCobro(y)

    const cerrarTablaCobro = (yFin: number) => {
      doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
      doc.line(IZQ, yInicioCobro, IZQ, yFin)
      doc.line(DER, yInicioCobro, DER, yFin)
      doc.setDrawColor(ROTULO).setLineWidth(0.5)
      doc.line(IZQ, yFin, DER, yFin)
    }

    for (const [idx, c] of clientesCobro.entries()) {
      const altoFila = c.rif ? 8.5 : 7
      if (y + altoFila > ABAJO - 16) {
        cerrarTablaCobro(y)
        doc.addPage()
        y = cabeceraContinuacion(doc, logo, d.empresa.razonSocial, d.momento)
        yInicioCobro = y
        y = pintarCabeceraCobro(y)
      }

      doc.setFillColor(idx % 2 === 1 ? FILA_ALTERNA : '#ffffff')
      doc.rect(IZQ, y, ANCHO_UTIL, altoFila, 'F')

      doc.setDrawColor(HAIRLINE).setLineWidth(0.22)
      for (const xDiv of COL_COBRO.divisores) {
        doc.line(xDiv, y, xDiv, y + altoFila)
      }
      doc.line(IZQ, y + altoFila, DER, y + altoFila)

      const yB = y + 4.4
      doc.setFont('helvetica', 'bold').setFontSize(7.6).setTextColor('#1c1917')
      doc.text(ajustar(doc, c.cliente, COL_COBRO.cliente.w - 5), COL_COBRO.cliente.x + 2.5, yB)
      if (c.rif) {
        doc.setFont('helvetica', 'normal').setFontSize(6.4).setTextColor(GRIS)
        doc.text(documento(c.rif), COL_COBRO.cliente.x + 2.5, yB + 3)
      }

      doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(TINTA)
      doc.text(
        `${c.notas}${c.vencidas > 0 ? ` (${c.vencidas} venc.)` : ''}`,
        COL_COBRO.notas.x + COL_COBRO.notas.w / 2,
        yB,
        { align: 'center' },
      )

      doc.setFont('helvetica', 'normal').setFontSize(7.3).setTextColor(TINTA)
      doc.text(
        c.proximoVencimiento ? fechaCorta(c.proximoVencimiento) : '—',
        COL_COBRO.vence.x + COL_COBRO.vence.w / 2,
        yB,
        { align: 'center' },
      )

      doc.setTextColor(TINTA)
      textoEnUnaLinea(
        doc,
        bolivares(c.totalBs),
        COL_COBRO.bs.x + COL_COBRO.bs.w - 2.5,
        yB,
        COL_COBRO.bs.w - 4,
        7.4,
        'normal',
        'right',
      )

      doc.setTextColor('#1c1917')
      textoEnUnaLinea(
        doc,
        dolares(c.totalUsd),
        COL_COBRO.usd.x + COL_COBRO.usd.w - 2.5,
        yB,
        COL_COBRO.usd.w - 4,
        7.8,
        'bold',
        'right',
      )

      dibujarPastilla(
        doc,
        c.vencidas > 0 ? 'Vencida' : 'Por cobrar',
        COL_COBRO.estado.x + COL_COBRO.estado.w - 2.5,
        yB,
        COL_COBRO.estado.w - 4,
        c.vencidas > 0 ? ESTILO_COBRO.VENCIDA : ESTILO_COBRO.POR_COBRAR,
        6.3,
      )

      y += altoFila
    }

    cerrarTablaCobro(y)

    // Total de cuentas por cobrar
    const altoPieCobro = 7.8
    doc.setFillColor('#faf8f6')
    doc.setDrawColor(ROTULO).setLineWidth(0.35)
    doc.rect(IZQ, y, ANCHO_UTIL, altoPieCobro, 'FD')
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(ROTULO)
    doc.text(
      `TOTAL CUENTAS POR COBRAR (${clientesCobro.length} ${clientesCobro.length === 1 ? 'cliente' : 'clientes'} · ${notasPorCobrar.length} ${notasPorCobrar.length === 1 ? 'nota' : 'notas'})`,
      IZQ + 3.5,
      y + 5.1,
    )
    doc.setFont('helvetica', 'bold').setFontSize(8.4).setTextColor('#111111')
    doc.text(
      `${bolivares(porCobrarBs)}   ·   ${dolares(porCobrarUsd)}`,
      DER - 3.5,
      y + 5.1,
      { align: 'right' },
    )
    y += altoPieCobro + 6
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. DESGLOSE POR MATERIAL
  // ─────────────────────────────────────────────────────────────────────────
  if (d.materiales && d.materiales.length > 0) {
    const totalMaterialBs = d.materiales.reduce((s, m) => s + m.subtotalBs, 0)
    const totalMaterialUsd = d.materiales.reduce((s, m) => s + m.subtotalUsd, 0)

    if (y + 34 > ABAJO - 14) {
      doc.addPage()
      y = cabeceraContinuacion(doc, logo, d.empresa.razonSocial, d.momento)
    }

    y = tituloSeccionEjecutiva(
      doc,
      y,
      'Desglose por material despachado',
      'Volumen y subtotales acumulados por artículo en las notas vigentes',
      MARCA,
    )

    const COL_MAT = {
      articulo: { x: IZQ, w: 68 }, // 16..84
      unidad: { x: IZQ + 68, w: 20 }, // 84..104
      cantidad: { x: IZQ + 88, w: 24 }, // 104..128
      bs: { x: IZQ + 112, w: 28 }, // 128..156
      usd: { x: IZQ + 140, w: 22 }, // 156..178
      pct: { x: IZQ + 162, w: 16 }, // 178..194
      divisores: [IZQ + 68, IZQ + 88, IZQ + 112, IZQ + 140, IZQ + 162],
    }

    const pintarCabeceraMaterial = (yCab: number) => {
      const H = 7.5
      doc.setFillColor(MARCA)
      doc.rect(IZQ, yCab, ANCHO_UTIL, H, 'F')
      doc.setDrawColor('#b05646').setLineWidth(0.22)
      for (const xDiv of COL_MAT.divisores) {
        doc.line(xDiv, yCab + 1.3, xDiv, yCab + H - 1.3)
      }
      const yT = yCab + 5
      doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor('#FFFFFF')
      doc.text('ARTÍCULO', COL_MAT.articulo.x + 2.5, yT)
      doc.text('UNIDAD', COL_MAT.unidad.x + COL_MAT.unidad.w / 2, yT, { align: 'center' })
      doc.text('CANTIDAD', COL_MAT.cantidad.x + COL_MAT.cantidad.w - 2.5, yT, { align: 'right' })
      doc.text('SUBTOTAL BS', COL_MAT.bs.x + COL_MAT.bs.w - 2.5, yT, { align: 'right' })
      doc.text('SUBTOTAL $', COL_MAT.usd.x + COL_MAT.usd.w - 2.5, yT, { align: 'right' })
      doc.text('% $', COL_MAT.pct.x + COL_MAT.pct.w - 2.5, yT, { align: 'right' })
      return yCab + H
    }

    let yInicioMat = y
    y = pintarCabeceraMaterial(y)

    const cerrarTablaMat = (yFin: number) => {
      doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
      doc.line(IZQ, yInicioMat, IZQ, yFin)
      doc.line(DER, yInicioMat, DER, yFin)
      doc.setDrawColor(MARCA).setLineWidth(0.5)
      doc.line(IZQ, yFin, DER, yFin)
    }

    const ordenados = [...d.materiales].sort(
      (a, b) => b.subtotalUsd - a.subtotalUsd || b.cantidad - a.cantidad,
    )
    for (const [idx, m] of ordenados.entries()) {
      const altoFila = 7.2
      if (y + altoFila > ABAJO - 16) {
        cerrarTablaMat(y)
        doc.addPage()
        y = cabeceraContinuacion(doc, logo, d.empresa.razonSocial, d.momento)
        yInicioMat = y
        y = pintarCabeceraMaterial(y)
      }

      doc.setFillColor(idx % 2 === 1 ? FILA_ALTERNA : '#ffffff')
      doc.rect(IZQ, y, ANCHO_UTIL, altoFila, 'F')

      doc.setDrawColor(HAIRLINE).setLineWidth(0.22)
      for (const xDiv of COL_MAT.divisores) {
        doc.line(xDiv, y, xDiv, y + altoFila)
      }
      doc.line(IZQ, y + altoFila, DER, y + altoFila)

      const yB = y + 4.7
      doc.setFont('helvetica', 'bold').setFontSize(7.8).setTextColor('#1c1917')
      doc.text(ajustar(doc, m.articulo, COL_MAT.articulo.w - 5), COL_MAT.articulo.x + 2.5, yB)

      // Pastilla de unidad centrada
      doc.setFont('helvetica', 'bold').setFontSize(6.6)
      const uTxt = m.unidad || '—'
      const wPastilla = Math.max(doc.getTextWidth(uTxt) + 4, 8.5)
      const xCentroU = COL_MAT.unidad.x + COL_MAT.unidad.w / 2
      doc.setFillColor(idx % 2 === 1 ? '#ebe5e0' : '#f3efeb')
      doc.roundedRect(xCentroU - wPastilla / 2, yB - 3.1, wPastilla, 4.2, 0.8, 0.8, 'F')
      doc.setTextColor(ROTULO)
      doc.text(uTxt, xCentroU, yB - 0.1, { align: 'center' })

      doc.setTextColor('#1c1917')
      textoEnUnaLinea(
        doc,
        cantidadLegible(m.cantidad),
        COL_MAT.cantidad.x + COL_MAT.cantidad.w - 2.5,
        yB,
        COL_MAT.cantidad.w - 4,
        7.8,
        'bold',
        'right',
      )

      if (m.subtotalUsd === 0 && totalMaterialUsd === 0) {
        doc.setFont('helvetica', 'normal').setFontSize(7.2).setTextColor(GRIS)
        doc.text('Sin cargo', COL_MAT.bs.x + COL_MAT.bs.w - 2.5, yB, { align: 'right' })
        doc.text('No facturable', COL_MAT.usd.x + COL_MAT.usd.w - 2.5, yB, { align: 'right' })
        doc.text('—', COL_MAT.pct.x + COL_MAT.pct.w - 2.5, yB, { align: 'right' })
      } else {
        doc.setTextColor(TINTA)
        textoEnUnaLinea(
          doc,
          bolivares(m.subtotalBs),
          COL_MAT.bs.x + COL_MAT.bs.w - 2.5,
          yB,
          COL_MAT.bs.w - 4,
          7.5,
          'normal',
          'right',
        )

        doc.setTextColor('#1c1917')
        textoEnUnaLinea(
          doc,
          dolares(m.subtotalUsd),
          COL_MAT.usd.x + COL_MAT.usd.w - 2.5,
          yB,
          COL_MAT.usd.w - 4,
          7.8,
          'bold',
          'right',
        )

        const pct = totalMaterialUsd > 0 ? (m.subtotalUsd / totalMaterialUsd) * 100 : 0
        doc.setFont('helvetica', 'normal').setFontSize(7.2).setTextColor(GRIS)
        doc.text(
          `${decimal2.format(pct)} %`,
          COL_MAT.pct.x + COL_MAT.pct.w - 2.5,
          yB,
          { align: 'right' },
        )
      }

      y += altoFila
    }

    cerrarTablaMat(y)

    const altoPieMat = 7.8
    doc.setFillColor('#faf8f6')
    doc.setDrawColor(MARCA).setLineWidth(0.35)
    doc.rect(IZQ, y, ANCHO_UTIL, altoPieMat, 'FD')
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(MARCA)
    doc.text(`TOTAL POR MATERIAL (${d.materiales.length} artículos)`, IZQ + 3.5, y + 5.1)
    doc.setFont('helvetica', 'bold').setFontSize(8.4).setTextColor('#111111')
    doc.text(
      totalMaterialUsd === 0 && volumenResumenTexto
        ? `Volumen acumulado: ${volumenResumenTexto}`
        : `${bolivares(totalMaterialBs)}   ·   ${dolares(totalMaterialUsd)}`,
      DER - 3.5,
      y + 5.1,
      { align: 'right' },
    )
    y += altoPieMat + 3.5

    doc.setFont('helvetica', 'italic').setFontSize(6.8).setTextColor(GRIS)
    const notaPieMaterial = doc.splitTextToSize(
      'Suma el subtotal de cada renglón de las notas vigentes incluidas en el reporte, convertido con la tasa BCV de emisión de cada nota. Si una nota incluye flete o descuento, la suma de renglones puede diferir del total de la planilla.',
      ANCHO_UTIL,
    ) as string[]
    doc.text(notaPieMaterial, IZQ, y + 1.5, { lineHeightFactor: 1.3 })
  }

  // Pie de página ejecutivo en todas las páginas
  const paginas = doc.getNumberOfPages()
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p)
    doc.setDrawColor('#d6d3d1').setLineWidth(0.3)
    doc.line(IZQ, PIE - 5.5, DER, PIE - 5.5)

    doc.setFont('helvetica', 'normal').setFontSize(7.2).setTextColor(GRIS)
    doc.text(
      `Documento generado por el sistema · ${titulo} · Emitido por ${d.emitidoPor || 'Sistema'} · ${fechaLarga(d.momento)}`,
      IZQ,
      PIE - 1,
    )
    doc.setFont('helvetica', 'bold').setFontSize(7.4).setTextColor(ROTULO)
    doc.text(`Página ${p} de ${paginas}`, DER, PIE - 1, { align: 'right' })
  }

  doc.setProperties({ title: titulo })
  return {
    blob: doc.output('blob'),
    nombre: `notas-de-entrega-${d.momento.toISOString().slice(0, 10)}${d.sufijoArchivo ?? ''}.pdf`,
  }
}
