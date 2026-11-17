import { logoComoImagen } from '@/lib/ficha/logo'
import { ARRIBA, ABAJO, IZQ, DER, ANCHO_UTIL, ajustar } from '@/lib/ficha/hoja'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { dinero, documento } from '@/lib/formato'
import {
  membrete,
  tituloDocumento,
  seccion,
  tabla,
  pieDePagina,
  fechaLarga,
  fechaCorta,
  encajar,
  MARCA,
  ROTULO,
  REALCE,
  TINTA,
  GRIS,
  GRIS_SUAVE,
  HAIRLINE,
  FILA_ALTERNA,
  type EmpresaPapel,
} from '@/lib/ficha/papel'

/*
  DIRECTORIO EJECUTIVO DE PERSONAL CON FOTOS, TABULADOR Y REMUNERACIÓN

  Integra en un formato ejecutivo de administración:
    1. Resumen ejecutivo superior (total trabajadores, en tabulador vs. fuera
       de escala, nómina mensual base, estimado quincenal y promedio salarial).
    2. Ficha tabular con foto recortada, datos de identificación e ingreso,
       cargo/departamento, nivel del tabulador asignado (mensual y quincenal) y
       cuánto cobra el trabajador (sueldo base y cobro por período de pago).
    3. Cuadro consolidado del tabulador de cargos al cierre del documento.
*/

export interface PersonaDelDirectorio {
  ficha: string
  nombre: string
  cedula: string
  cargo: string
  departamento: string | null
  fechaIngreso: string
  antiguedadTexto?: string | null
  activo?: boolean
  eventual?: boolean
  aCargo?: string | null
  /** Nivel del tabulador que tiene asignado el trabajador (por id o por cargo). */
  tabuladorCargo?: string | null
  tabuladorMensual?: string | null
  tabuladorQuincenal?: string | null
  enTabulador?: boolean
  coincideConTabulador?: boolean
  /** Cuánto cobra el trabajador según su ficha. */
  salarioBaseTexto?: string
  salarioMensualMonto?: number
  monedaSalario?: string
  modalidadPago?: string
  cobroPorPeriodoTexto?: string | null
  /** Ya recortada con el encuadre de la persona, lista para `addImage`. Nula sin foto. */
  fotoDataUrl: string | null
}

export interface ResumenNivelTabulador {
  cargo: string
  moneda: string
  sueldoMensual: string
  sueldoQuincenal: string | null
  trabajadores: number
  subtotalMensual: number
}

export interface DatosDirectorioPersonal {
  personas: PersonaDelDirectorio[]
  resumenTabulador?: ResumenNivelTabulador[]
  /** Lo que el filtro de la pantalla dejó fuera, dicho en palabras. */
  filtro?: string | null
  empresa: EmpresaPapel
  emitidoPor: string
  momento: Date
}

type Doc = import('jspdf').jsPDF

const ALTO_CABECERA_TABLA = 7
const ALTO_FILA = 21.5
const ANCHO_FOTO = 14
const ALTO_FOTO = 16.5

// Coordenadas horizontales dentro de ANCHO_UTIL (IZQ = 30 .. DER = 180)
const X_FOTO = IZQ + 2
const X_TRABAJADOR = X_FOTO + ANCHO_FOTO + 2.8
const X_DIV_CARGO = IZQ + 61
const X_CARGO = X_DIV_CARGO + 2.2
const X_DIV_TAB = IZQ + 93
const X_TAB = X_DIV_TAB + 2.2
const X_DIV_COBRO = IZQ + 122.5
const X_COBRO_DER = DER - 2.2

function inicialesDe(nombre: string): string {
  const partes = nombre
    .replace(',', ' ')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (partes.length === 0) return '—'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return `${partes[0][0] ?? ''}${partes[1][0] ?? ''}`.toUpperCase()
}

function pintarCabeceraDirectorio(doc: Doc, y: number): number {
  doc.setFillColor(MARCA)
  doc.rect(IZQ, y, ANCHO_UTIL, ALTO_CABECERA_TABLA, 'F')

  doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor('#FFFFFF')
  doc.text('TRABAJADOR', X_FOTO, y + 4.7)
  doc.text('CARGO Y ÁREA', X_CARGO, y + 4.7)
  doc.text('TABULADOR ASIGNADO', X_TAB, y + 4.7)
  doc.text('CUÁNTO COBRA', X_COBRO_DER, y + 4.7, { align: 'right' })

  return y + ALTO_CABECERA_TABLA
}

function pintarTarjetasResumen(
  doc: Doc,
  y: number,
  tarjetas: Array<{ titulo: string; valor: string; detalle: string; destacar?: boolean }>,
): number {
  const SEP = 2.8
  const ANCHO_CAJA = (ANCHO_UTIL - SEP * (tarjetas.length - 1)) / tarjetas.length
  const ALTO_CAJA = 15

  tarjetas.forEach((t, idx) => {
    const x = IZQ + idx * (ANCHO_CAJA + SEP)

    doc.setFillColor(FILA_ALTERNA)
    doc.setDrawColor(HAIRLINE).setLineWidth(0.25)
    doc.roundedRect(x, y, ANCHO_CAJA, ALTO_CAJA, 1, 1, 'FD')

    // Banda superior de acento ejecutivo
    doc.setFillColor(t.destacar ? MARCA : ROTULO)
    doc.rect(x, y, ANCHO_CAJA, 1.1, 'F')

    doc.setFont('helvetica', 'bold').setFontSize(5.8).setTextColor(ROTULO)
    doc.text(ajustar(doc, t.titulo.toUpperCase(), ANCHO_CAJA - 4), x + 2.2, y + 4.5)

    doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(t.destacar ? MARCA : TINTA)
    doc.text(ajustar(doc, t.valor, ANCHO_CAJA - 4), x + 2.2, y + 9.6)

    doc.setFont('helvetica', 'normal').setFontSize(6).setTextColor(GRIS)
    doc.text(ajustar(doc, t.detalle, ANCHO_CAJA - 4), x + 2.2, y + 13.3)
  })

  return y + ALTO_CAJA + 4
}

export async function armarDirectorioPersonal(
  d: DatosDirectorioPersonal,
): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['TRABAJADORES', String(d.personas.length)],
      ['GENERADO', fechaLarga(d.momento)],
    ],
  })

  y = tituloDocumento(doc, y, 'Directorio ejecutivo de personal')

  // Cálculos del resumen ejecutivo
  const monedaPrincipal =
    d.personas.find((p) => p.monedaSalario)?.monedaSalario ??
    d.resumenTabulador?.[0]?.moneda ??
    'USD'
  const totalMensual = d.personas.reduce((acc, p) => acc + (p.salarioMensualMonto ?? 0), 0)
  const totalQuincenal = totalMensual / 2
  const promedioMensual = d.personas.length > 0 ? totalMensual / d.personas.length : 0
  const enTabuladorCount = d.personas.filter((p) => p.enTabulador).length
  const fueraTabuladorCount = d.personas.length - enTabuladorCount
  const cargosUnicos = new Set(d.personas.map((p) => p.cargo.trim().toUpperCase()).filter(Boolean))
    .size

  y = pintarTarjetasResumen(doc, y, [
    {
      titulo: 'Personal en directorio',
      valor: `${d.personas.length} ${d.personas.length === 1 ? 'trabajador' : 'trabajadores'}`,
      detalle: `${enTabuladorCount} en tabulador · ${fueraTabuladorCount} fuera`,
    },
    {
      titulo: 'Nómina mensual base',
      valor: dinero(monedaPrincipal, totalMensual),
      detalle: 'Suma salarial mensual',
      destacar: true,
    },
    {
      titulo: 'Estimado quincenal',
      valor: dinero(monedaPrincipal, totalQuincenal),
      detalle: 'Equivalente por quincena',
    },
    {
      titulo: 'Promedio por trabajador',
      valor: dinero(monedaPrincipal, promedioMensual),
      detalle: `${cargosUnicos} ${cargosUnicos === 1 ? 'cargo activo' : 'cargos activos'}`,
    },
  ])

  // Tira ejecutiva de alcance y emisor
  doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(GRIS)
  const textoFiltro = `Alcance: ${d.filtro || 'Personal completo'}`
  doc.text(ajustar(doc, textoFiltro, ANCHO_UTIL * 0.68), IZQ, y + 2.5)
  doc.text(
    ajustar(doc, `Emitido por: ${d.emitidoPor || '—'}`, ANCHO_UTIL * 0.3),
    DER,
    y + 2.5,
    { align: 'right' },
  )
  y += 5.5

  // Cabecera de la tabla de trabajadores
  y = pintarCabeceraDirectorio(doc, y)

  const anchoColTrabajador = X_DIV_CARGO - X_TRABAJADOR - 2
  const anchoColCargo = X_DIV_TAB - X_CARGO - 2
  const anchoColTab = X_DIV_COBRO - X_TAB - 2
  const anchoColCobro = X_COBRO_DER - X_DIV_COBRO - 2

  d.personas.forEach((p, i) => {
    if (y + ALTO_FILA > ABAJO - 14) {
      doc.addPage()
      y = pintarCabeceraDirectorio(doc, ARRIBA)
    }

    // Fondo alterno y bordes de la fila
    if (i % 2 === 1) {
      doc.setFillColor(FILA_ALTERNA)
      doc.rect(IZQ, y, ANCHO_UTIL, ALTO_FILA, 'F')
    }

    doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
    doc.rect(IZQ, y, ANCHO_UTIL, ALTO_FILA, 'S')
    doc.line(X_DIV_CARGO, y, X_DIV_CARGO, y + ALTO_FILA)
    doc.line(X_DIV_TAB, y, X_DIV_TAB, y + ALTO_FILA)
    doc.line(X_DIV_COBRO, y, X_DIV_COBRO, y + ALTO_FILA)

    // 1. Foto del trabajador con marco limpio
    const yFoto = y + (ALTO_FILA - ALTO_FOTO) / 2
    doc.setFillColor('#FFFFFF')
    doc.setDrawColor(HAIRLINE).setLineWidth(0.25)
    doc.rect(X_FOTO - 0.3, yFoto - 0.3, ANCHO_FOTO + 0.6, ALTO_FOTO + 0.6, 'FD')

    let fotoPintada = false
    if (p.fotoDataUrl) {
      try {
        doc.addImage(p.fotoDataUrl, 'JPEG', X_FOTO, yFoto, ANCHO_FOTO, ALTO_FOTO)
        fotoPintada = true
      } catch {
        fotoPintada = false
      }
    }
    if (!fotoPintada) {
      doc.setFillColor('#EFECE8')
      doc.rect(X_FOTO, yFoto, ANCHO_FOTO, ALTO_FOTO, 'F')
      doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(ROTULO)
      doc.text(inicialesDe(p.nombre), X_FOTO + ANCHO_FOTO / 2, yFoto + ALTO_FOTO / 2 - 0.5, {
        align: 'center',
      })
      doc.setFont('helvetica', 'normal').setFontSize(4.8).setTextColor(GRIS_SUAVE)
      doc.text('SIN FOTO', X_FOTO + ANCHO_FOTO / 2, yFoto + ALTO_FOTO - 2.2, {
        align: 'center',
      })
    }

    // 2. Columna TRABAJADOR (Nombre, Cédula + Ficha, Ingreso + Antigüedad)
    const celdaNombre = encajar(doc, p.nombre, anchoColTrabajador, 8, 'bold', true)
    doc.setFont('helvetica', 'bold').setFontSize(celdaNombre.talla).setTextColor(TINTA)
    doc.text(ajustar(doc, p.nombre, anchoColTrabajador), X_TRABAJADOR, y + 6.2)

    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(GRIS)
    const lineaIdentidad = `${documento(p.cedula)} · Ficha ${p.ficha}`
    doc.text(ajustar(doc, lineaIdentidad, anchoColTrabajador), X_TRABAJADOR, y + 11)

    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(GRIS_SUAVE)
    const textoIngreso = [
      `Ingreso: ${fechaCorta(p.fechaIngreso)}`,
      p.antiguedadTexto || null,
      p.activo === false ? 'DESINCORPORADO' : null,
    ]
      .filter(Boolean)
      .join(' · ')
    doc.text(ajustar(doc, textoIngreso, anchoColTrabajador), X_TRABAJADOR, y + 15.4)

    // 3. Columna CARGO Y ÁREA
    const celdaCargo = encajar(doc, p.cargo, anchoColCargo, 7.3, 'bold')
    const lineasCargo = celdaCargo.lineas.slice(0, 2)
    doc.setFont('helvetica', 'bold').setFontSize(celdaCargo.talla).setTextColor(TINTA)
    doc.text(lineasCargo, X_CARGO, y + 6, { lineHeightFactor: 1.25 })

    const yBajoCargo = y + 6 + (lineasCargo.length - 1) * 3.2 + 4.3
    doc.setFont('helvetica', 'normal').setFontSize(6.6).setTextColor(GRIS)
    doc.text(
      ajustar(doc, p.departamento || 'Operación general', anchoColCargo),
      X_CARGO,
      yBajoCargo,
    )

    const extraCargo = [p.aCargo ? `A cargo: ${p.aCargo}` : null, p.eventual ? 'Eventual' : null]
      .filter(Boolean)
      .join(' · ')
    if (extraCargo && yBajoCargo + 3.8 <= y + ALTO_FILA - 1.5) {
      doc.setFont('helvetica', 'bold').setFontSize(6.1).setTextColor(ROTULO)
      doc.text(ajustar(doc, extraCargo, anchoColCargo), X_CARGO, yBajoCargo + 3.8)
    }

    // 4. Columna TABULADOR ASIGNADO
    if (p.enTabulador && p.tabuladorCargo) {
      const celdaTab = encajar(doc, p.tabuladorCargo, anchoColTab, 7, 'bold')
      const lineasTab = celdaTab.lineas.slice(0, 2)
      doc.setFont('helvetica', 'bold').setFontSize(celdaTab.talla).setTextColor(ROTULO)
      doc.text(lineasTab, X_TAB, y + 6, { lineHeightFactor: 1.25 })

      const yEscala = y + 6 + (lineasTab.length - 1) * 3.1 + 4.3
      if (p.tabuladorMensual) {
        doc.setFont('helvetica', 'normal').setFontSize(6.7).setTextColor(TINTA)
        doc.text(
          ajustar(doc, `Escala: ${p.tabuladorMensual}/mes`, anchoColTab),
          X_TAB,
          yEscala,
        )
      }

      if (yEscala + 3.8 <= y + ALTO_FILA - 1.5) {
        if (p.coincideConTabulador === false) {
          doc.setFont('helvetica', 'bold').setFontSize(6.1).setTextColor(REALCE)
          doc.text(ajustar(doc, 'Difiere de la escala', anchoColTab), X_TAB, yEscala + 3.8)
        } else if (p.tabuladorQuincenal) {
          doc.setFont('helvetica', 'normal').setFontSize(6.3).setTextColor(GRIS_SUAVE)
          doc.text(
            ajustar(doc, `Quinc. escala: ${p.tabuladorQuincenal}`, anchoColTab),
            X_TAB,
            yEscala + 3.8,
          )
        }
      }
    } else {
      doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(GRIS)
      doc.text('Fuera de tabulador', X_TAB, y + 6.2)
      doc.setFont('helvetica', 'normal').setFontSize(6.4).setTextColor(GRIS_SUAVE)
      doc.text('Estipulación directa', X_TAB, y + 10.8)
    }

    // 5. Columna CUÁNTO COBRA (alineada a la derecha)
    const textoSalario = p.salarioBaseTexto || '—'
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(MARCA)
    doc.text(ajustar(doc, textoSalario, anchoColCobro), X_COBRO_DER, y + 6.4, {
      align: 'right',
    })

    if (p.modalidadPago) {
      doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(GRIS)
      doc.text(ajustar(doc, p.modalidadPago, anchoColCobro), X_COBRO_DER, y + 11, {
        align: 'right',
      })
    }

    if (p.cobroPorPeriodoTexto) {
      doc.setFont('helvetica', 'bold').setFontSize(6.7).setTextColor(TINTA)
      doc.text(ajustar(doc, p.cobroPorPeriodoTexto, anchoColCobro), X_COBRO_DER, y + 15.4, {
        align: 'right',
      })
    }

    y += ALTO_FILA
  })

  // Barra de total general al cierre del directorio
  if (y + 8.5 > ABAJO - 10) {
    doc.addPage()
    y = ARRIBA
  }
  doc.setFillColor('#EFEAE4')
  doc.setDrawColor(MARCA).setLineWidth(0.35)
  doc.rect(IZQ, y, ANCHO_UTIL, 8, 'FD')
  doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(ROTULO)
  doc.text(`TOTAL DIRECTORIO (${d.personas.length} TRABAJADORES)`, IZQ + 2.5, y + 5.2)
  doc.setTextColor(MARCA)
  doc.text(
    `MENSUAL: ${dinero(monedaPrincipal, totalMensual)}   ·   QUINCENAL: ${dinero(monedaPrincipal, totalQuincenal)}`,
    X_COBRO_DER,
    y + 5.2,
    { align: 'right' },
  )
  y += 14

  // Cuadro consolidado del Tabulador de Cargos (si hay niveles para mostrar)
  if (d.resumenTabulador && d.resumenTabulador.length > 0) {
    if (y + 34 > ABAJO - 14) {
      doc.addPage()
      y = ARRIBA
    }
    y = seccion(doc, y, 'Resumen del tabulador de cargos')
    y = tabla(
      doc,
      y,
      [
        { titulo: 'Cargo / Nivel del tabulador', ancho: 56 },
        { titulo: 'Trabajadores', ancho: 20, alDerecha: true },
        { titulo: 'Escala mensual', ancho: 24, alDerecha: true },
        { titulo: 'Escala quincenal', ancho: 24, alDerecha: true },
        { titulo: 'Subtotal mensual', ancho: 26, alDerecha: true },
      ],
      d.resumenTabulador.map((r) => [
        r.cargo,
        String(r.trabajadores),
        dinero(r.moneda, r.sueldoMensual),
        r.sueldoQuincenal ? dinero(r.moneda, r.sueldoQuincenal) : '—',
        dinero(r.moneda, r.subtotalMensual),
      ]),
      `Total mensual según fichas listadas: ${dinero(monedaPrincipal, totalMensual)}`,
    )
  }

  pieDePagina(
    doc,
    `Documento ejecutivo confidencial · Directorio de personal y tabulador · ${fechaLarga(d.momento)}`,
  )

  doc.setProperties({ title: 'Directorio ejecutivo de personal' })

  return { blob: doc.output('blob'), nombre: 'directorio-de-personal.pdf' }
}
