/*
  Los papeles de los viajes de camiones.

  Reproducen las dos hojas de Excel que hoy se llevan a mano: la planilla
  diaria por camión y el registro de pago por empresa.

  POR QUÉ EL REGISTRO DE PAGO NO SALE EN MATRIZ

  En la hoja de cálculo es empresa × día del mes, y en papel eso no cabe: la
  caja útil de esta casa son 150 mm en vertical, y treinta y un días serían
  columnas de menos de cinco milímetros. Apaisarlo obligaría a un segundo juego
  de márgenes y de membrete, es decir a duplicar `papel.ts` — que es justo lo
  que este plan prometió no hacer.

  Así que el papel va en lista —una línea por empresa y día, con su acumulado—
  y la matriz se conserva en los otros dos sitios donde sí cabe: la pantalla,
  que la dibuja entera, y el CSV, que se abre en la hoja de cálculo con la
  misma forma que tiene hoy. Las tres salen de la misma vista, así que no
  pueden discrepar.

  EL PAGO DEL DÍA ES UN TERCER PAPEL Y NO UN RECORTE DEL DEL MES

  Porque responde otra pregunta. El del mes sirve para cuadrar y para ver la
  tendencia; el del día se le enseña al transportista y dice una sola cosa:
  cuánto se le debe por lo de hoy. Meter ahí el acumulado, los otros días o la
  matriz sería contestarle algo que no preguntó. Sale de la misma vista que
  los otros dos, filtrada por fecha.
*/
import { logoComoImagen } from '@/lib/ficha/logo'
import { ABAJO, ARRIBA, PIE } from '@/lib/ficha/hoja'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import {
  TINTA,
  fechaCorta,
  fechaLarga,
  etiquetaValor,
  firmas,
  lineaEmpresa,
  membrete,
  pieDePagina,
  seccion,
  tabla,
  tituloDocumento,
  type Columna,
  type EmpresaPapel,
} from '@/lib/ficha/papel'

const decimal2 = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const numero = (v: string | number): string => decimal2.format(Number(v ?? 0))

/** Entera si es entera: ocho viajes no se leen «8,00». */
const cantidad = (v: string | number): string => {
  const n = Number(v ?? 0)
  return Number.isInteger(n) ? n.toLocaleString('es-VE') : decimal2.format(n)
}

/**
 * El guion del papel.
 *
 * Es la misma regla que en la pantalla: lo que no se sabe va en blanco. Un
 * cero en la columna de metros cúbicos diría que ese camión no movió nada.
 */
const oNada = (v: string | null | undefined, comoDinero = false): string => {
  if (v === null || v === undefined) return '—'
  return comoDinero ? `$ ${numero(v)}` : cantidad(v)
}

export interface ViajeDelPapel {
  secuencia: number
  tramo_dice: string
  hora: string | null
  carga_m3: string | null
  precio_usd: string | null
  estado: string
  motivo_anulacion: string | null
}

export interface CamionDelPapel {
  placa: string
  vehiculo: string | null
  transportista: string
  chofer: string | null
  viajes: ViajeDelPapel[]
}

/*
  QUIÉN FIRMA UN DÍA QUE CARGARON O APROBARON VARIOS.

  Christopher, 16/09/2026: el registro diario lleva «Registrado y aprobado», y
  nunca más de dos rayas. Pero un día lo pueden cargar dos personas y aprobarlo
  otras dos. Firma en cada raya quien más viajes cargó o aprobó, y los demás se
  nombran en el resumen con cuántos: el papel no calla a nadie que participó.
*/
export interface FirmaDelDia {
  nombre: string | null
  /** Cuántos viajes cargó o aprobó quien firma. */
  cuantos: number
  imagen: string | null
  /** Los demás que también cargaron o aprobaron ese día, con cuántos viajes. */
  otros: string | null
}

export interface FirmasDelDia {
  registro: FirmaDelDia
  aprobacion: FirmaDelDia
  /** Los que todavía esperan: sin ellos, «Aprobado por» se leería completo. */
  porAprobar: number
}

export interface DatosRegistroDiario {
  dia: string
  /** Cuando se filtró por una empresa, su nombre. Nulo si salen todas. */
  empresa: string | null
  camiones: CamionDelPapel[]
  /** Quién va en «Registrado por» y en «Aprobado por». */
  firmas?: FirmasDelDia | null
  empresa_papel: EmpresaPapel
  emitidoPor: string
  momento: Date
}

/* Los anchos suman los 150 mm útiles. */
const COLUMNAS_VIAJE: Columna[] = [
  { titulo: 'N.º', ancho: 14 },
  { titulo: 'A dónde', ancho: 52 },
  { titulo: 'Hora', ancho: 20 },
  { titulo: 'm³', ancho: 22, alDerecha: true },
  { titulo: 'Precio', ancho: 24, alDerecha: true },
  { titulo: 'Estado', ancho: 18 },
]

/**
 * El registro diario de viajes: un bloque por camión.
 *
 * Es la tercera captura del Excel. Con `empresa` puesta, la cuarta.
 */
export async function armarRegistroDeViajes(d: DatosRegistroDiario): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  // Cuentan lo aprobado y lo anterior a la aprobación. Lo que espera, lo
  // rechazado y lo anulado sale en su renglón, pero no suma.
  const vivos = (c: CamionDelPapel) =>
    c.viajes.filter((v) => v.estado === 'REGISTRADO' || v.estado === 'APROBADO')

  const totalViajes = d.camiones.reduce((s, c) => s + vivos(c).length, 0)
  const conCarga = d.camiones.flatMap((c) => vivos(c)).filter((v) => v.carga_m3 !== null)
  const sinCarga = totalViajes - conCarga.length
  const totalM3 = conCarga.reduce((s, v) => s + Number(v.carga_m3), 0)

  const hayDinero = d.camiones.some((c) => vivos(c).some((v) => v.precio_usd !== null))
  const totalUsd = d.camiones
    .flatMap((c) => vivos(c))
    .reduce((s, v) => s + Number(v.precio_usd ?? 0), 0)

  let y = membrete(doc, logo, {
    empresa: d.empresa_papel,
    datos: [
      ['Día', fechaCorta(d.dia)],
      ['Generado', fechaLarga(d.momento)],
    ],
  })

  y = tituloDocumento(doc, y, 'Registro diario de viajes')
  y = lineaEmpresa(
    doc,
    y,
    `${d.empresa_papel.razonSocial} · RIF ${d.empresa_papel.rif} · Transporte interno`,
  )

  const f = d.firmas
  const quienYCuantos = (x: FirmaDelDia) =>
    x.nombre
      ? `${x.nombre}${x.otros ? ` (${cantidad(x.cuantos)}) · también ${x.otros}` : ''}`
      : null
  const registradoPor = f ? quienYCuantos(f.registro) : null
  const aprobadoPor = !f
    ? null
    : f.aprobacion.nombre
      ? `${quienYCuantos(f.aprobacion)}${f.porAprobar > 0 ? ` · ${cantidad(f.porAprobar)} por aprobar` : ''}`
      : f.porAprobar > 0
        ? `Pendiente: ${cantidad(f.porAprobar)} ${f.porAprobar === 1 ? 'viaje' : 'viajes'} por aprobar`
        : null

  y = seccion(doc, y, 'Resumen del día')
  y = etiquetaValor(doc, y, [
    ['Empresa', d.empresa ?? 'Todas'],
    ['Camiones', String(d.camiones.length)],
    ['Viajes', cantidad(totalViajes)],
    ['Metros cúbicos', sinCarga > 0 ? `${cantidad(totalM3)} (parcial)` : cantidad(totalM3)],
    ...(hayDinero ? ([['Total a pagar', `$ ${numero(totalUsd)}`]] as Array<[string, string]>) : []),
    ...(sinCarga > 0
      ? ([
          [
            'Sin medir',
            `${cantidad(sinCarga)} viajes no suman m³: esos camiones no tienen carga útil cargada`,
          ],
        ] as Array<[string, string]>)
      : []),
    ...(registradoPor ? ([['Registrado por', registradoPor]] as Array<[string, string]>) : []),
    ...(aprobadoPor ? ([['Aprobado por', aprobadoPor]] as Array<[string, string]>) : []),
  ])

  // Lo que ocupan las dos rayas con su nombre debajo, y la firma encima si la hay.
  const huecoDeFirmas = f ? (f.registro.imagen || f.aprobacion.imagen ? 18 : 8) : 0
  const altoDeFirmas = f ? huecoDeFirmas + 14 : 0

  for (const [i, camion] of d.camiones.entries()) {
    // Un bloque no se parte dejando el rótulo solo al final de la hoja: si no
    // caben el título y tres renglones, se empieza en la siguiente.
    const hueco = 4.5 + 6.5 + Math.min(camion.viajes.length, 3) * 8.8 + 8
    /*
      EL ÚLTIMO CAMIÓN SE LLEVA LAS FIRMAS. Si con ellas no cabe en lo que queda
      de hoja, empieza la siguiente y las rayas van debajo de él: cabiendo el
      camión solo, las firmas se iban a una hoja en blanco, que es un papel que
      nadie quiere firmar. El alto es una cuenta aproximada —un renglón que se
      parte ocupa más—; si falla, las firmas saltan de hoja igual, abajo.
    */
    const todoElBloque = 4.5 + 6.5 + camion.viajes.length * 8.8 + 8
    const esElUltimo = i === d.camiones.length - 1
    if (
      y + hueco > ABAJO - 30 ||
      (esElUltimo &&
        f &&
        y + todoElBloque + altoDeFirmas > PIE - 3 &&
        ARRIBA + todoElBloque + altoDeFirmas <= PIE - 3)
    ) {
      doc.addPage()
      y = ARRIBA
    }

    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(TINTA)
    doc.text(
      [camion.placa, camion.transportista, camion.chofer, camion.vehiculo]
        .filter(Boolean)
        .join(' · ')
        .toUpperCase(),
      20 + 10,
      y,
    )
    y += 4.5

    const suyosVivos = vivos(camion)
    const suMonto = suyosVivos.reduce((s, v) => s + Number(v.precio_usd ?? 0), 0)
    const suDinero = suyosVivos.some((v) => v.precio_usd !== null)

    y = tabla(
      doc,
      y,
      COLUMNAS_VIAJE,
      camion.viajes.map((v) => [
        String(v.secuencia),
        v.tramo_dice,
        v.hora?.slice(0, 5) ?? '—',
        oNada(v.carga_m3),
        oNada(v.precio_usd, true),
        ({ ANULADO: 'Anulado', RECHAZADO: 'Rechazado', POR_APROBAR: 'Por aprobar' } as Record<string, string>)[
          v.estado
        ] ?? '',
      ]),
      suDinero
        ? `${camion.placa} · ${cantidad(suyosVivos.length)} viajes   $ ${numero(suMonto)}`
        : `${camion.placa} · ${cantidad(suyosVivos.length)} viajes`,
    )
  }

  /*
    Las dos rayas, después del último camión y enteras en una hoja: una firma
    partida entre dos páginas no la firma nadie.
  */
  if (f) {
    if (y + altoDeFirmas > PIE - 3) {
      doc.addPage()
      y = ARRIBA
    }
    firmas(
      doc,
      Math.max(y + huecoDeFirmas, ABAJO - 26),
      { texto: 'Registrado por', nombre: f.registro.nombre, imagen: f.registro.imagen },
      { texto: 'Aprobado por', nombre: f.aprobacion.nombre, imagen: f.aprobacion.imagen },
    )
  }

  pieDePagina(
    doc,
    `Registro diario de viajes · ${fechaCorta(d.dia)} · emitido por ${d.emitidoPor}`,
  )

  doc.setProperties({ title: `Registro diario de viajes — ${d.dia}` })

  const sufijo = (d.empresa ?? 'todas').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return { blob: doc.output('blob'), nombre: `viajes-${d.dia}-${sufijo}.pdf` }
}

export interface LineaDePago {
  transportista: string
  fecha: string
  viajes: number
  m3: string | null
  monto_usd: string | null
  acumulado_usd: string | null
}

export interface DatosRegistroDePago {
  /** El período, con las dos fechas incluidas, en AAAA-MM-DD. */
  desde: string
  hasta: string
  /** Cuando se filtró por una empresa, su nombre. Nulo si salen todas. */
  empresa: string | null
  /** El acumulado de cada línea tiene que venir calculado dentro del período. */
  lineas: LineaDePago[]
  empresa_papel: EmpresaPapel
  emitidoPor: string
  momento: Date
}

const COLUMNAS_PAGO: Columna[] = [
  { titulo: 'Empresa', ancho: 52 },
  { titulo: 'Día', ancho: 22 },
  { titulo: 'Viajes', ancho: 18, alDerecha: true },
  { titulo: 'm³', ancho: 20, alDerecha: true },
  { titulo: 'Monto', ancho: 20, alDerecha: true },
  { titulo: 'Acumulado', ancho: 18, alDerecha: true },
]

/** «01/09/2026 al 11/09/2026», o una sola fecha si el período es de un día. */
const periodoDice = (desde: string, hasta: string): string => {
  const f = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
  return desde === hasta ? f(desde) : `${f(desde)} al ${f(hasta)}`
}

/** El registro de pago de un período, empresa por empresa y día por día. */
export async function armarRegistroDePago(d: DatosRegistroDePago): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  const hayDinero = d.lineas.some((l) => l.monto_usd !== null)
  const total = d.lineas.reduce((s, l) => s + Number(l.monto_usd ?? 0), 0)
  const empresas = [...new Set(d.lineas.map((l) => l.transportista))].sort()

  let y = membrete(doc, logo, {
    empresa: d.empresa_papel,
    datos: [
      ['Período', periodoDice(d.desde, d.hasta)],
      ['Generado', fechaLarga(d.momento)],
    ],
  })

  y = tituloDocumento(doc, y, 'Registro de pago de viajes')
  y = lineaEmpresa(
    doc,
    y,
    `${d.empresa_papel.razonSocial} · RIF ${d.empresa_papel.rif} · Transporte interno`,
  )

  y = seccion(doc, y, 'Resumen del período')
  y = etiquetaValor(doc, y, [
    ['Empresa', d.empresa ?? 'Todas'],
    ['Transportistas', String(empresas.length)],
    ['Viajes', cantidad(d.lineas.reduce((s, l) => s + l.viajes, 0))],
    ...(hayDinero
      ? ([['Total del período', `$ ${numero(total)}`]] as Array<[string, string]>)
      : ([['Montos', 'No se muestran: hace falta la casilla de ver el pago']] as Array<
          [string, string]
        >)),
  ])

  // Una sección por empresa, para que cada una se pueda arrancar y mandar.
  for (const empresa of empresas) {
    const suyas = d.lineas.filter((l) => l.transportista === empresa)
    const suTotal = suyas.reduce((s, l) => s + Number(l.monto_usd ?? 0), 0)

    if (y + 30 > ABAJO - 30) {
      doc.addPage()
      y = ARRIBA
    }

    y = seccion(doc, y, empresa)
    y = tabla(
      doc,
      y,
      COLUMNAS_PAGO,
      suyas.map((l) => [
        l.transportista,
        fechaCorta(l.fecha),
        cantidad(l.viajes),
        oNada(l.m3),
        oNada(l.monto_usd, true),
        oNada(l.acumulado_usd, true),
      ]),
      hayDinero
        ? `${empresa} · ${cantidad(suyas.reduce((s, l) => s + l.viajes, 0))} viajes   $ ${numero(suTotal)}`
        : `${empresa} · ${cantidad(suyas.reduce((s, l) => s + l.viajes, 0))} viajes`,
    )
  }

  const periodo = periodoDice(d.desde, d.hasta)
  pieDePagina(doc, `Registro de pago de viajes · ${periodo} · emitido por ${d.emitidoPor}`)
  doc.setProperties({ title: `Registro de pago de viajes — ${periodo}` })

  const sufijo = d.empresa ? `-${d.empresa.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : ''
  return {
    blob: doc.output('blob'),
    nombre: `pago-viajes-${d.desde}_a_${d.hasta}${sufijo}.pdf`,
  }
}

export interface LineaDelDia {
  transportista: string
  viajes: number
  m3: string | null
  monto_usd: string | null
}

export interface DatosPagoDelDia {
  dia: string
  /** Cuando se filtró por una empresa, su nombre. Nulo si salen todas. */
  empresa: string | null
  lineas: LineaDelDia[]
  empresa_papel: EmpresaPapel
  emitidoPor: string
  momento: Date
}

/* Los anchos suman los 150 mm útiles. Cuatro columnas y ninguna más: es un
   papel que se lee de un vistazo, no una hoja de cálculo. */
const COLUMNAS_DIA: Columna[] = [
  { titulo: 'Empresa', ancho: 74 },
  { titulo: 'Viajes', ancho: 22, alDerecha: true },
  { titulo: 'm³', ancho: 24, alDerecha: true },
  { titulo: 'Monto a pagar', ancho: 30, alDerecha: true },
]

/** «3 empresas», «1 empresa». El plural de mentira se nota. */
const empresasDice = (n: number): string => (n === 1 ? '1 empresa' : `${cantidad(n)} empresas`)

/**
 * Lo que se le debe a cada transportista por un solo día.
 *
 * Es el papel que se le entrega al transportista. Con `empresa` puesta sale
 * solo la suya, que es como se entrega.
 */
export async function armarPagoDelDia(d: DatosPagoDelDia): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  const hayDinero = d.lineas.some((l) => l.monto_usd !== null)
  const total = d.lineas.reduce((s, l) => s + Number(l.monto_usd ?? 0), 0)
  const viajes = d.lineas.reduce((s, l) => s + l.viajes, 0)

  // Los metros cúbicos solo se suman de quien los sabe, y si no los sabe
  // nadie la línea dice un guion en vez de un cero.
  const conM3 = d.lineas.filter((l) => l.m3 !== null)
  const m3 = conM3.reduce((s, l) => s + Number(l.m3), 0)

  let y = membrete(doc, logo, {
    empresa: d.empresa_papel,
    datos: [
      ['Día', fechaCorta(d.dia)],
      ['Generado', fechaLarga(d.momento)],
    ],
  })

  y = tituloDocumento(doc, y, 'Pago de viajes del día')
  y = lineaEmpresa(
    doc,
    y,
    `${d.empresa_papel.razonSocial} · RIF ${d.empresa_papel.rif} · Transporte interno`,
  )

  y = seccion(doc, y, 'Resumen del día')
  y = etiquetaValor(doc, y, [
    ['Empresa', d.empresa ?? 'Todas'],
    ['Transportistas', String(d.lineas.length)],
    ['Viajes', cantidad(viajes)],
    [
      'Metros cúbicos',
      conM3.length === 0
        ? '—'
        : conM3.length < d.lineas.length
          ? `${cantidad(m3)} (parcial)`
          : cantidad(m3),
    ],
    ...(hayDinero
      ? ([['Total a pagar', `$ ${numero(total)}`]] as Array<[string, string]>)
      : ([['Montos', 'No se muestran: hace falta la casilla de ver el pago']] as Array<
          [string, string]
        >)),
  ])

  y = seccion(doc, y, 'Lo que se le debe a cada empresa')
  tabla(
    doc,
    y,
    COLUMNAS_DIA,
    d.lineas.map((l) => [
      l.transportista,
      cantidad(l.viajes),
      oNada(l.m3),
      oNada(l.monto_usd, true),
    ]),
    hayDinero
      ? `${empresasDice(d.lineas.length)} · ${cantidad(viajes)} viajes   $ ${numero(total)}`
      : `${empresasDice(d.lineas.length)} · ${cantidad(viajes)} viajes`,
  )

  pieDePagina(doc, `Pago de viajes · ${fechaCorta(d.dia)} · emitido por ${d.emitidoPor}`)
  doc.setProperties({ title: `Pago de viajes — ${d.dia}` })

  const sufijo = (d.empresa ?? 'todas').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return { blob: doc.output('blob'), nombre: `pago-viajes-${d.dia}-${sufijo}.pdf` }
}
