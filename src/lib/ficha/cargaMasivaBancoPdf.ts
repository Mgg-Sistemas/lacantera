import { logoComoImagen } from '@/lib/ficha/logo'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import {
  membrete,
  tituloDocumento,
  seccion,
  etiquetaValor,
  tabla,
  firmas,
  pieDePagina,
  fechaLarga,
  notaBajoLaTabla,
  type Columna,
  type EmpresaPapel,
} from '@/lib/ficha/papel'
import { ABAJO } from '@/lib/ficha/hoja'
import { bolivares, documento } from '@/lib/formato'
import type {
  FilaCargaMasiva44,
  ResumenConciliacionBanco,
} from '@/lib/bancoTesoro/formatos'
import { TIPOS_SOLICITUD_BT } from '@/lib/bancoTesoro/catalogos'

// Suma exacta = 150 mm (ANCHO_UTIL)
const COLUMNAS_CARGA_44: Columna[] = [
  { titulo: '#', ancho: 9 },
  { titulo: 'Ficha', ancho: 11 },
  { titulo: 'Trabajador / Cédula', ancho: 40 },
  { titulo: 'Cargo / Códigos BT', ancho: 30 },
  { titulo: 'Agencia más cercana / ZP', ancho: 36 },
  { titulo: 'Sueldo Bs', ancho: 24, alDerecha: true },
]

export async function armarCargaMasivaBancoPdf(d: {
  filas: FilaCargaMasiva44[]
  tipoSolicitud: 'I' | 'M' | 'D'
  tasaUsd: number
  empresa: EmpresaPapel
  emitidoPor: string
  firmaRrhh?: string | null
  momento: Date
}): Promise<ArchivoArmado> {
  const etiquetaMov =
    TIPOS_SOLICITUD_BT.find((x) => x.codigo === d.tipoSolicitud)?.nombre ?? d.tipoSolicitud
  const titulo = 'Carga masiva — Banco del Tesoro (0163)'
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['Banco destino', '0163 · Banco del Tesoro'],
      ['Movimiento', `${d.tipoSolicitud} — ${etiquetaMov}`],
      ['Emitido', fechaLarga(d.momento)],
    ],
  })
  y = tituloDocumento(doc, y, titulo)

  const totalSueldoBs = d.filas.reduce((s, f) => s + f.sueldoMensualBs, 0)

  // Contar agencias resueltas para resumen ejecutivo
  const porAgencia = new Map<string, number>()
  for (const f of d.filas) {
    const etq = `${f.ubicacionResuelta.agencia} (${f.ubicacionResuelta.agenciaNombre})`
    porAgencia.set(etq, (porAgencia.get(etq) ?? 0) + 1)
  }
  const resumenAgencias =
    [...porAgencia.entries()].map(([ag, n]) => `${ag}: ${n}`).join(' · ') || '—'

  y = seccion(doc, y, 'Parámetros de la planilla maestra (44 columnas)')
  y = etiquetaValor(doc, y, [
    ['Operación bancaria', `${d.tipoSolicitud} — ${etiquetaMov}`],
    ['Registros incluidos', String(d.filas.length)],
    [
      'Correlativo cliente',
      d.filas.length > 0
        ? `Del ${d.filas[0].correlativoCliente} al ${d.filas.at(-1)!.correlativoCliente}`
        : '—',
    ],
    ['Código industria', '0902 · Cuentas Nóminas o Personal'],
    [
      'Tasa BCV aplicada',
      `Bs ${d.tasaUsd.toLocaleString('es-VE', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} por $`,
    ],
    ['Emitido por', d.emitidoPor],
    ['Agencias asignadas', resumenAgencias],
  ])

  y = seccion(doc, y, 'Relación de trabajadores incluidos en el archivo')
  y = tabla(
    doc,
    y,
    COLUMNAS_CARGA_44,
    d.filas.length === 0
      ? [['', '', 'Sin trabajadores seleccionados', '', '', '']]
      : d.filas.map((f) => [
          String(f.correlativoCliente),
          f.ficha,
          `${f.nombreCompleto}\n${documento(f.cedulaMostrar)} · Nac: ${f.columnas44[8] || '—'}`,
          `${f.cargoMostrar}\nProf: ${f.columnas44[32]} · Cargo: ${f.columnas44[40]} · ${f.tipoCuentaNomina}`,
          `${f.ubicacionResuelta.agencia} · ${f.ubicacionResuelta.agenciaNombre}\nParr. ${f.ubicacionResuelta.parroquia} · ZP ${f.ubicacionResuelta.zonaPostal}`,
          bolivares(f.sueldoMensualBs),
        ]),
    `Total trabajadores: ${d.filas.length} · Nómina mensual estimada: Bs ${bolivares(totalSueldoBs)}`,
  )

  y = notaBajoLaTabla(
    doc,
    y,
    'Respaldo administrativo de la matriz oficial de 44 columnas (Moneda Nacional) para Banco del Tesoro (0163). La agencia bancaria de cada registro fue asignada según cercanía al domicilio del trabajador.',
  )

  if (y + 30 > ABAJO) {
    doc.addPage()
    y = 32
  }
  firmas(
    doc,
    y + 22,
    { texto: 'Elaborado por Recursos Humanos', nombre: d.firmaRrhh || d.emitidoPor },
    { texto: 'Autorizado por Representante Legal / Gerencia' },
  )

  pieDePagina(doc, `Documento generado por el sistema · ${titulo} · ${fechaLarga(d.momento)}`)
  doc.setProperties({ title: titulo })
  return {
    blob: doc.output('blob'),
    nombre: `carga-masiva-banco-tesoro-${d.tipoSolicitud.toLowerCase()}.pdf`,
  }
}

// Suma exacta = 150 mm (ANCHO_UTIL)
const COLUMNAS_CONCILIACION: Columna[] = [
  { titulo: 'Correlativo', ancho: 22 },
  { titulo: 'Trabajador / Cédula', ancho: 44 },
  { titulo: 'Cuenta destino', ancho: 34 },
  { titulo: 'Resultado banco', ancho: 28 },
  { titulo: 'Monto Bs', ancho: 22, alDerecha: true },
]

export async function armarConciliacionBancoPdf(d: {
  resumen: ResumenConciliacionBanco
  nombreArchivo: string
  empresa: EmpresaPapel
  emitidoPor: string
  momento: Date
}): Promise<ArchivoArmado> {
  const titulo = 'Conciliación de lote bancario — Banco del Tesoro'
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['Archivo banco', d.nombreArchivo.slice(0, 28)],
      ['Emitido', fechaLarga(d.momento)],
    ],
  })
  y = tituloDocumento(doc, y, titulo)

  y = seccion(doc, y, 'Resultado general del archivo devuelto por el banco')
  y = etiquetaValor(doc, y, [
    ['Total operaciones leídas', String(d.resumen.totalLineas)],
    ['Abonos procesados (P)', `${d.resumen.procesados} · Bs ${bolivares(d.resumen.montoProcesadoBs)}`],
    ['Abonos rechazados (R)', `${d.resumen.rechazados} · Bs ${bolivares(d.resumen.montoRechazadoBs)}`],
    ['Revisado por', d.emitidoPor],
  ])

  y = seccion(doc, y, 'Detalle línea por línea')
  y = tabla(
    doc,
    y,
    COLUMNAS_CONCILIACION,
    d.resumen.lineas.length === 0
      ? [['', 'Archivo sin registros válidos', '', '', '']]
      : d.resumen.lineas.map((l) => [
          l.correlativo,
          `${l.trabajadorNombre ?? 'Sin cruce en nómina'}\n${l.cedulaNormalizada}${l.ficha ? ` · Ficha ${l.ficha}` : ''}`,
          l.cuenta || '—',
          `${l.estado === 'PROCESADO' ? 'PROCESADO' : l.estado === 'RECHAZADO' ? 'RECHAZADO' : l.estadoCodigo}\n${l.motivoBanco}`,
          bolivares(l.montoBs),
        ]),
    `Procesados: Bs ${bolivares(d.resumen.montoProcesadoBs)} · Rechazados: Bs ${bolivares(d.resumen.montoRechazadoBs)}`,
  )

  pieDePagina(doc, `Documento generado por el sistema · ${titulo} · ${fechaLarga(d.momento)}`)
  doc.setProperties({ title: titulo })
  return {
    blob: doc.output('blob'),
    nombre: `conciliacion-banco-tesoro.pdf`,
  }
}
