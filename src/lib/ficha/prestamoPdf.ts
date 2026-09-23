import { logoComoImagen } from '@/lib/ficha/logo'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import {
  membrete,
  tituloDocumento,
  lineaEmpresa,
  seccion,
  etiquetaValor,
  firmas,
  pieDePagina,
  fechaLarga,
  fechaCorta,
  notaBajoLaTabla,
  GRIS,
  MARCA,
  TINTA,
  FILA_ALTERNA,
  type EmpresaPapel,
} from '@/lib/ficha/papel'
import { DER, IZQ } from '@/lib/ficha/hoja'
import { dinero } from '@/lib/formato'

/*
  EL RECIBO DE PRÉSTAMO

  Christopher, 23/09/2026, con el recibo que usa la otra empresa delante:
  «cuando hagan un préstamo o desde donde yo pueda ver el registro de préstamo
  me imprima algo con la información que te paso en la imagen… y que diga
  recibo de préstamo».

  Lleva el membrete de la casa, no el del papel que sirvió de modelo: un
  recibo de La Cantera con el logo de otra empresa no lo firma nadie.

  ═══════════════════════════════════════════════════════════════════════════
  PARA QUÉ SIRVE ESTE PAPEL
  ═══════════════════════════════════════════════════════════════════════════

  Para que quede firmado que se entregó el dinero. Por eso abajo hay dos
  rayas: la de quien recibe y la de quien entrega. Un préstamo sin papel
  firmado es una conversación, y a la hora de descontarlo por nómina la
  conversación no se sostiene.

  ═══════════════════════════════════════════════════════════════════════════
  DICE EL SALDO, NO SOLO EL CAPITAL
  ═══════════════════════════════════════════════════════════════════════════

  El recibo se imprime el día que se presta, pero también meses después desde
  la ficha, para revisar cómo va. Si solo dijera el capital, una reimpresión
  parecería un préstamo nuevo. Así que la caja grande dice lo que se prestó y
  debajo, en pequeño, lo que queda debiendo el día que se imprime.
*/

/** Lo que el recibo necesita saber de la persona. */
export interface TrabajadorDelRecibo {
  nombre: string
  cedula: string
  ficha: string
  cargo: string
  telefono: string | null
  activo: boolean
  banco: string | null
  numeroCuenta: string | null
  telefonoPago: string | null
}

/** Lo que el recibo necesita saber del préstamo. */
export interface PrestamoDelRecibo {
  id: number
  fecha: string
  capital: number
  moneda: string
  motivo: string | null
  cuotasPactadas: number | null
  estado: string
  abonado: number
  saldo: number
  nota: string | null
}

/** «En 6 quincenas, de 95,24 cada una». Sin cuotas pactadas no se inventa ninguna. */
function comoSePaga(p: PrestamoDelRecibo): string {
  const n = Number(p.cuotasPactadas ?? 0)
  if (n <= 0) return 'Sin cuotas pactadas'
  if (n === 1) return 'En una sola quincena'
  return `${n} quincenas de ${dinero(p.moneda, p.capital / n)}`
}

export async function armarReciboDePrestamo(d: {
  empresa: EmpresaPapel
  trabajador: TrabajadorDelRecibo
  prestamo: PrestamoDelRecibo
  momento: Date
}): Promise<ArchivoArmado> {
  const titulo = 'RECIBO DE PRÉSTAMO'
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  const { trabajador: t, prestamo: p } = d

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['N.º DE PRÉSTAMO', String(p.id)],
      ['FECHA', fechaCorta(p.fecha)],
      ['EMITIDO', fechaLarga(d.momento)],
    ],
  })

  y = tituloDocumento(doc, y, titulo)
  y = lineaEmpresa(doc, y, `${t.nombre} · ${fechaCorta(p.fecha)}`)

  // ── Quién ────────────────────────────────────────────────────────────────
  y = seccion(doc, y, 'Datos del trabajador')
  y = etiquetaValor(
    doc,
    y,
    [
      ['Nombre', t.nombre],
      ['Cédula', t.cedula],
      ['Ficha', t.ficha],
      ['Cargo', t.cargo],
      ['Teléfono', t.telefono],
      ['Estado', t.activo ? 'ACTIVO' : 'INACTIVO'],
    ],
    { columnas: 2 },
  )

  // ── Dónde cobra ──────────────────────────────────────────────────────────
  //
  // Solo si hay algo que decir. Un bloque con tres rayas donde deberían estar
  // el banco y la cuenta no informa: llena la hoja y hace dudar de si el dato
  // falta o si la persona cobra en efectivo.
  if (t.banco || t.numeroCuenta || t.telefonoPago) {
    y = seccion(doc, y, 'Datos bancarios')
    y = etiquetaValor(
      doc,
      y,
      [
        ['Banco', t.banco],
        ['Cuenta', t.numeroCuenta],
        ['Titular', t.nombre],
        ['C.I. titular', t.cedula],
        ...(t.telefonoPago ? ([['Pago móvil', t.telefonoPago]] as Array<[string, string]>) : []),
      ],
      { columnas: 2 },
    )
  }

  // ── El préstamo ──────────────────────────────────────────────────────────
  y = seccion(doc, y, 'Detalle del préstamo')
  y = etiquetaValor(
    doc,
    y,
    [
      ['Fecha', fechaCorta(p.fecha)],
      ['Estado', p.estado],
      ['Para qué es', p.motivo],
      ['Cómo se paga', comoSePaga(p)],
      ['Abonado a la fecha', dinero(p.moneda, p.abonado)],
      ['Saldo pendiente', dinero(p.moneda, p.saldo)],
    ],
    { columnas: 2 },
  )

  // ── La cifra ─────────────────────────────────────────────────────────────
  const ALTO = 14
  doc.setFillColor(FILA_ALTERNA)
  doc.rect(IZQ, y, DER - IZQ, ALTO, 'F')

  doc.setTextColor(TINTA).setFont('helvetica', 'bold').setFontSize(9)
  doc.text('MONTO PRESTADO', IZQ + 4, y + 8)

  doc.setTextColor(MARCA).setFontSize(14)
  doc.text(dinero(p.moneda, p.capital), DER - 4, y + 8.5, { align: 'right' })

  // Una reimpresión meses después tiene que distinguirse del día que se prestó.
  if (Number(p.saldo) > 0 && Number(p.abonado) > 0) {
    doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(6.5)
    doc.text(`queda debiendo: ${dinero(p.moneda, p.saldo)}`, DER - 4, y + 12.3, { align: 'right' })
  }
  y += ALTO + 8

  if (p.nota) y = notaBajoLaTabla(doc, y, p.nota)

  // ── Las dos rayas ────────────────────────────────────────────────────────
  //
  // El texto dice lo que se firma, no solo quién firma: quien recibe está
  // reconociendo la deuda y que se le descuente, y eso es lo que da valor al
  // papel el día que alguien discuta un descuento en su recibo.
  firmas(
    doc,
    y + 14,
    {
      texto: 'Recibí conforme y autorizo el descuento',
      nombre: t.nombre,
      nota: `C.I. ${t.cedula}`,
    },
    { texto: 'Entregó', nombre: d.empresa.razonSocial },
  )

  pieDePagina(doc, `${d.empresa.razonSocial} · ${titulo} · ${fechaLarga(d.momento)}`)
  doc.setProperties({ title: `${titulo} ${p.id}` })

  return {
    blob: doc.output('blob'),
    nombre: `recibo-prestamo-${p.id}-${t.ficha}.pdf`,
  }
}
