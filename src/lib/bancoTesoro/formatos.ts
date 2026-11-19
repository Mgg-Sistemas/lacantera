import type { Empleado, Recibo } from '@/lib/api/nomina'
import { BANCOS } from '@/lib/bancos'
import {
  ESTILO,
  armarLibro,
  letraDeColumna,
  type CeldaDeLibro,
  type HojaDelLibro,
  type ValidacionDeLista,
} from '@/lib/hojas/escribirLibro'
import {
  AGENCIAS_BT,
  CODIGO_BANCO_TESORO,
  CODIGO_INDUSTRIA_NOMINA_BT,
  deducirCargoYProfesionBt,
  mapearEstadoCivilBt,
  mapearNivelEducacionBt,
  mapearTipoNominaBt,
  resolverUbicacionYAgenciaPorDireccion,
  type UbicacionYAgenciaResuelta,
} from './catalogos'

// ---------------------------------------------------------------------------
// Tipos compartidos
// ---------------------------------------------------------------------------

export interface DatosExtrasBancoEmpleado {
  correo?: string | null
  telefono_local?: string | null
  calle_avenida?: string | null
  casa_edificio?: string | null
  piso_nivel?: string | null
  apto_local?: string | null
  referencia_domicilio?: string | null
  condicion_inmueble?: string | null
  tipo_vivienda?: string | null
  tiempo_residencia?: number | string | null
  bt_region?: string | null
  bt_estado?: string | null
  bt_ciudad?: string | null
  bt_municipio?: string | null
  bt_parroquia?: string | null
  zona_postal?: string | null
  bt_profesion?: string | null
  bt_tipo_cargo?: string | null
  bt_agencia?: string | null
  bt_tipo_cuenta?: string | null
}

export type EmpleadoConBanco = Empleado & DatosExtrasBancoEmpleado

// ---------------------------------------------------------------------------
// Normalización y validaciones bancarias
// ---------------------------------------------------------------------------

/**
 * Limpia acentos, Ñ -> N y signos de puntuación prohibidos por los validadores
 * planos de Tesoro en Línea (comas, punto y coma, comillas, tabuladores).
 */
export function limpiarTextoBanco(valor: string | null | undefined, maxLargo = 60): string {
  if (!valor) return ''
  const limpio = valor
    .replace(/ñ/gi, 'N')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[,;|"'`#\t\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
  return maxLargo > 0 ? limpio.slice(0, maxLargo).trim() : limpio
}

const PARTICULAS_NOMBRE = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'SAN', 'SANTA', 'VON', 'VAN'])

/**
 * Parte un campo de nombres o apellidos compuestos respetando partículas como
 * «DE LA CRUZ» o «DEL VALLE» para no dejar «DE» aislado como primer apellido.
 */
export function partirEnDosNombres(texto: string | null | undefined): [string, string] {
  const limpio = limpiarTextoBanco(texto, 80)
  if (!limpio) return ['', '']
  const palabras = limpio.split(' ').filter(Boolean)
  if (palabras.length === 1) return [palabras[0], '']

  const bloques: string[] = []
  let acum = ''
  for (const p of palabras) {
    if (PARTICULAS_NOMBRE.has(p)) {
      acum = acum ? `${acum} ${p}` : p
    } else if (acum) {
      bloques.push(`${acum} ${p}`)
      acum = ''
    } else {
      bloques.push(p)
    }
  }
  if (acum) {
    if (bloques.length > 0) bloques[bloques.length - 1] += ` ${acum}`
    else bloques.push(acum)
  }

  if (bloques.length === 1) return [bloques[0].slice(0, 30), '']
  return [bloques[0].slice(0, 30), bloques.slice(1).join(' ').slice(0, 30)]
}

export function desarmarCedulaBanco(cedula: string | null | undefined): {
  letra: 'V' | 'E' | 'P'
  nombreTipo: 'Venezolano' | 'Extranjero' | 'Pasaporte'
  numero: string
  rellena9: string
  lote10: string
  valida: boolean
} {
  const cruda = (cedula ?? '').trim().toUpperCase()
  const m = /^([VEJPG])[-.\s]*(\d+)$/.exec(cruda.replace(/\./g, ''))
  const letraOriginal = m ? m[1] : 'V'
  const letra: 'V' | 'E' | 'P' =
    letraOriginal === 'E' ? 'E' : letraOriginal === 'P' ? 'P' : 'V'
  const nombreTipo =
    letra === 'E' ? 'Extranjero' : letra === 'P' ? 'Pasaporte' : 'Venezolano'
  const digitos = (m ? m[2] : cruda.replace(/\D/g, '')).replace(/^0+/, '') || '0'
  const rellena9 = digitos.padStart(9, '0').slice(-9)
  return {
    letra,
    nombreTipo,
    numero: digitos,
    rellena9,
    lote10: `${letra}${rellena9}`,
    valida: digitos !== '0' && digitos.length >= 5 && digitos.length <= 10,
  }
}

export function formatearCorrelativoBanco(correlativo: number): string {
  const seguro = Math.max(1, Math.floor(Number(correlativo) || 1))
  return `${CODIGO_BANCO_TESORO}${String(seguro).padStart(6, '0')}`
}

export function montoACentimos15(montoBs: number | string): string {
  const num = Number(montoBs) || 0
  const centimos = Math.max(0, Math.round(num * 100))
  return String(centimos).padStart(15, '0').slice(-15)
}

export function montoBsComaDecimal(montoBs: number | string): string {
  const num = Math.max(0, Number(montoBs) || 0)
  return num.toFixed(2).replace('.', ',')
}

export function fechaIsoADdMmYyyy(iso: string | null | undefined): string {
  if (!iso) return ''
  const trozo = iso.slice(0, 10)
  const partes = trozo.split('-')
  if (partes.length !== 3) return ''
  return `${partes[2]}/${partes[1]}/${partes[0]}`
}

export function formatearTelefonoBanco(tel: string | null | undefined): string {
  const d = (tel ?? '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('58') && d.length >= 12) return `0${d.slice(2, 12)}`
  if (d.length === 10 && !d.startsWith('0')) return `0${d}`
  return d.slice(0, 11)
}

const CODIGOS_BANCO_CONOCIDOS = new Set(BANCOS.map((b) => b.slice(0, 4)))

export function validarCuentaBancariaVe(
  cuenta: string | null | undefined,
  bancoFicha?: string | null,
  exigirBancoTesoro = false,
): { limpia: string; errores: string[]; advertencias: string[]; esTesoro: boolean } {
  const limpia = (cuenta ?? '').replace(/\D/g, '')
  const errores: string[] = []
  const advertencias: string[] = []

  if (!limpia) {
    errores.push('Sin número de cuenta cargado')
    return { limpia: '', errores, advertencias, esTesoro: false }
  }
  if (limpia.length !== 20) {
    errores.push(`La cuenta tiene ${limpia.length} dígitos (deben ser 20)`)
  }
  const prefijo = limpia.slice(0, 4)
  const esTesoro = prefijo === CODIGO_BANCO_TESORO
  if (exigirBancoTesoro && !esTesoro) {
    errores.push(`La cuenta comienza en ${prefijo} (no es Banco del Tesoro 0163)`)
  } else if (limpia.length === 20 && !CODIGOS_BANCO_CONOCIDOS.has(prefijo)) {
    advertencias.push(`Prefijo bancario ${prefijo} no reconocido en catálogo Sudeban`)
  }

  const codigoBancoFicha = bancoFicha?.slice(0, 4)
  if (
    limpia.length === 20 &&
    codigoBancoFicha &&
    /^\d{4}$/.test(codigoBancoFicha) &&
    codigoBancoFicha !== prefijo
  ) {
    advertencias.push(
      `La ficha indica banco ${codigoBancoFicha} pero la cuenta abre con ${prefijo}`,
    )
  }

  return { limpia, errores, advertencias, esTesoro }
}

/**
 * Si la ficha aún no tiene la dirección desglosada en los 5 campos del banco,
 * reparte el campo `direccion` general con criterio para no dejar columnas
 * obligatorias vacías en la plantilla de 44 columnas.
 */
export function desglosarDireccionBanco(e: EmpleadoConBanco): {
  calle: string
  casa: string
  piso: string
  apto: string
  referencia: string
} {
  const calleManual = limpiarTextoBanco(e.calle_avenida, 40)
  const casaManual = limpiarTextoBanco(e.casa_edificio, 30)
  const pisoManual = limpiarTextoBanco(e.piso_nivel, 10)
  const aptoManual = limpiarTextoBanco(e.apto_local, 20)
  const refManual = limpiarTextoBanco(e.referencia_domicilio, 40)

  if (calleManual || casaManual) {
    return {
      calle: calleManual || limpiarTextoBanco(e.direccion, 40) || 'CALLE PRINCIPAL',
      casa: casaManual || 'CASA S/N',
      piso: pisoManual || 'PB',
      apto: aptoManual || 'S/N',
      referencia: refManual || 'CERCA DE LA VIA PRINCIPAL',
    }
  }

  const base = limpiarTextoBanco(e.direccion, 120)
  if (!base) {
    return {
      calle: 'SECTOR NAIGUATA',
      casa: 'CASA S/N',
      piso: 'PB',
      apto: 'S/N',
      referencia: 'SECTOR PRINCIPAL',
    }
  }

  return {
    calle: base.slice(0, 40).trim(),
    casa: base.length > 40 ? base.slice(40, 70).trim() || 'CASA S/N' : 'CASA S/N',
    piso: pisoManual || 'PB',
    apto: aptoManual || 'S/N',
    referencia:
      refManual || (base.length > 70 ? base.slice(70, 110).trim() : 'VIA PRINCIPAL'),
  }
}

export function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// MÓDULO 1: PAGO MASIVO DE NÓMINA (TESORO EN LÍNEA)
// ---------------------------------------------------------------------------

export interface FilaPagoMasivo {
  reciboId: number
  empleadoId: number
  correlativoNumero: number
  correlativoTexto: string // 0163000001
  ficha: string
  nombreMostrar: string
  beneficiarioBanco: string
  cargo: string
  tipoDocLetra: 'V' | 'E' | 'P'
  tipoDocNombre: 'Venezolano' | 'Extranjero' | 'Pasaporte'
  nroDocumento: string
  docLote10: string // V013224889
  cedulaOriginal: string
  formaPago: string
  banco: string | null
  tipoCuenta: string | null
  cuenta: string
  esTesoro: boolean
  montoBs: number
  montoUsd: number
  montoCsv: string // 18125,00
  montoTxt15: string // 000000001812500
  errores: string[]
  advertencias: string[]
}

export function construirFilasPagoMasivo(
  recibos: Recibo[],
  correlativoInicial: number,
  exigirBancoTesoro: boolean,
): FilaPagoMasivo[] {
  const ordenados = [...recibos]
    .filter((r) => r.empleado)
    .sort((a, b) =>
      `${a.empleado!.apellidos} ${a.empleado!.nombres}`.localeCompare(
        `${b.empleado!.apellidos} ${b.empleado!.nombres}`,
        'es-VE',
      ),
    )

  return ordenados.map((r, idx) => {
    const emp = r.empleado!
    const corrNum = Math.max(1, Math.floor(correlativoInicial || 1)) + idx
    const doc = desarmarCedulaBanco(emp.cedula)
    const cta = validarCuentaBancariaVe(emp.numero_cuenta, emp.banco, exigirBancoTesoro)
    const montoBs = Number(r.neto) || 0
    const montoUsd = Number(r.neto_usd ?? 0) || 0

    const errores = [...cta.errores]
    const advertencias = [...cta.advertencias]

    if (!doc.valida) errores.push('Cédula inválida o incompleta')
    if (emp.forma_pago !== 'TRANSFERENCIA') {
      advertencias.push(`Forma de pago en ficha: ${emp.forma_pago}`)
    }
    if (montoBs <= 0) {
      errores.push('Monto neto en Bs igual o menor a 0,00')
    }

    return {
      reciboId: r.id,
      empleadoId: r.empleado_id,
      correlativoNumero: corrNum,
      correlativoTexto: formatearCorrelativoBanco(corrNum),
      ficha: emp.ficha,
      nombreMostrar: `${emp.apellidos}, ${emp.nombres}`.trim(),
      beneficiarioBanco: limpiarTextoBanco(`${emp.nombres} ${emp.apellidos}`, 40),
      cargo: emp.cargo,
      tipoDocLetra: doc.letra,
      tipoDocNombre: doc.nombreTipo,
      nroDocumento: doc.numero,
      docLote10: doc.lote10,
      cedulaOriginal: emp.cedula,
      formaPago: emp.forma_pago,
      banco: emp.banco,
      tipoCuenta: emp.tipo_cuenta,
      cuenta: cta.limpia,
      esTesoro: cta.esTesoro,
      montoBs,
      montoUsd,
      montoCsv: montoBsComaDecimal(montoBs),
      montoTxt15: montoACentimos15(montoBs),
      errores,
      advertencias,
    }
  })
}

/**
 * TXT exacto de Lote Bancario con Correlativos:
 * `0163000001,V002940602,01630221012211002934,000000000725000`
 */
export function generarPagoMasivoTxt(filas: FilaPagoMasivo[]): Blob {
  const lineas = filas.map(
    (f) => `${f.correlativoTexto},${f.docLote10},${f.cuenta},${f.montoTxt15}`,
  )
  return new Blob([lineas.join('\r\n')], { type: 'text/plain;charset=utf-8' })
}

/**
 * CSV de Pago Masivo:
 * - `portal`: Estructura de Abonos de Tesoro en Línea (`Tipo Documento;Nro Documento;Cuenta;Nombre Beneficiario;Monto`)
 * - `correlativos`: Lote con correlativos (`Correlativo;Documento;Cuenta;Beneficiario;Monto Bs;Monto Céntimos`)
 */
export function generarPagoMasivoCsv(
  filas: FilaPagoMasivo[],
  modo: 'portal' | 'correlativos' = 'portal',
): Blob {
  if (modo === 'portal') {
    const cabeceras = [
      'Tipo Documento',
      'Nro Documento',
      'Cuenta',
      'Nombre Beneficiario',
      'Monto',
    ]
    const cuerpo = filas.map((f) => [
      f.tipoDocLetra,
      f.nroDocumento,
      f.cuenta,
      f.beneficiarioBanco,
      f.montoCsv,
    ])
    const texto = [cabeceras, ...cuerpo].map((r) => r.join(';')).join('\r\n')
    return new Blob(['\ufeff' + texto], { type: 'text/csv;charset=utf-8' })
  }

  const cabeceras = [
    'Correlativo',
    'Tipo Documento',
    'Nro Documento',
    'Doc Lote',
    'Cuenta',
    'Nombre Beneficiario',
    'Monto Bs',
    'Monto Lote (15 dig)',
  ]
  const cuerpo = filas.map((f) => [
    f.correlativoTexto,
    f.tipoDocLetra,
    f.nroDocumento,
    f.docLote10,
    f.cuenta,
    f.beneficiarioBanco,
    f.montoCsv,
    f.montoTxt15,
  ])
  const texto = [cabeceras, ...cuerpo].map((r) => r.join(';')).join('\r\n')
  return new Blob(['\ufeff' + texto], { type: 'text/csv;charset=utf-8' })
}

/**
 * Libro Excel (.xlsx) con 2 pestañas:
 * 1. `ESTRUCTURA DE ABONOS` (exacta al formato Tesoro en Línea)
 * 2. `CONTROL LOTE RRHH` (con correlativos 0163XXXXXX, ficha, cargo, Bs y USD)
 */
export function generarPagoMasivoXlsx(
  filas: FilaPagoMasivo[],
  meta: {
    periodoNumero: string
    desde: string
    hasta: string
    tasaUsd: string | number
    cuentaOrdenante?: string
    fechaValor?: string
    empresaNombre: string
    empresaRif: string
  },
): Blob {
  const totalBs = filas.reduce((s, f) => s + f.montoBs, 0)
  const totalUsd = filas.reduce((s, f) => s + f.montoUsd, 0)

  const cabAbonos = [
    'Tipo Documento',
    'Nro Documento',
    'Cuenta',
    'Nombre Beneficiario',
    'Monto',
  ]

  const hojaAbonos: HojaDelLibro = {
    nombre: 'ESTRUCTURA DE ABONOS',
    anchos: [18, 18, 26, 38, 18],
    filas: [
      cabAbonos.map((t) => ({ texto: t, estilo: ESTILO.cabecera })),
      ...filas.map((f): CeldaDeLibro[] => [
        { texto: f.tipoDocNombre },
        { texto: f.nroDocumento },
        { texto: f.cuenta },
        { texto: f.beneficiarioBanco },
        { texto: f.montoCsv },
      ]),
    ],
    validaciones:
      filas.length > 0
        ? [
            {
              columna: 0,
              desde: 2,
              hasta: filas.length + 20,
              origen: 'LISTAS!$A$2:$A$4',
            },
          ]
        : undefined,
  }

  const cabControl = [
    'Correlativo Banco',
    'Ficha',
    'Tipo Doc',
    'Cédula',
    'Beneficiario',
    'Cargo',
    'Banco',
    'Cuenta (20 dígitos)',
    'Neto Bs',
    'Neto USD',
    'Monto TXT (15 díg.)',
  ]

  const hojaControl: HojaDelLibro = {
    nombre: 'CONTROL LOTE RRHH',
    anchos: [18, 10, 10, 14, 34, 26, 26, 24, 16, 14, 20],
    filas: [
      [{ texto: `${meta.empresaNombre} (${meta.empresaRif}) — PAGO MASIVO DE NÓMINA`, estilo: ESTILO.titulo }],
      [
        {
          texto: [
            `Período: ${meta.periodoNumero} (${meta.desde} al ${meta.hasta})`,
            `Tasa BCV período: Bs ${Number(meta.tasaUsd).toFixed(4)}`,
            meta.cuentaOrdenante ? `Cuenta a debitar: ${meta.cuentaOrdenante}` : null,
            meta.fechaValor ? `Fecha valor: ${meta.fechaValor}` : null,
            `Registros: ${filas.length}`,
            `Total Bs: ${montoBsComaDecimal(totalBs)}`,
            `Total USD: ${totalUsd.toFixed(2).replace('.', ',')}`,
          ]
            .filter(Boolean)
            .join(' · '),
          estilo: ESTILO.subtitulo,
        },
      ],
      [],
      cabControl.map((t) => ({ texto: t, estilo: ESTILO.cabecera })),
      ...filas.map((f): CeldaDeLibro[] => [
        { texto: f.correlativoTexto },
        { texto: f.ficha },
        { texto: f.tipoDocLetra },
        { texto: f.nroDocumento },
        { texto: f.beneficiarioBanco },
        { texto: f.cargo },
        { texto: f.banco ?? '—' },
        { texto: f.cuenta },
        { texto: f.montoCsv },
        { texto: f.montoUsd.toFixed(2).replace('.', ',') },
        { texto: f.montoTxt15 },
      ]),
      [],
      [
        { texto: 'TOTAL GENERAL', estilo: ESTILO.etiqueta },
        { texto: `${filas.length} abonos`, estilo: ESTILO.etiqueta },
        { texto: '' },
        { texto: '' },
        { texto: '' },
        { texto: '' },
        { texto: '' },
        { texto: '' },
        { texto: montoBsComaDecimal(totalBs), estilo: ESTILO.etiqueta },
        { texto: totalUsd.toFixed(2).replace('.', ','), estilo: ESTILO.etiqueta },
        { texto: montoACentimos15(totalBs), estilo: ESTILO.etiqueta },
      ],
    ],
  }

  const hojaListas: HojaDelLibro = {
    nombre: 'LISTAS',
    oculta: true,
    anchos: [20],
    filas: [
      [{ texto: 'TIPOS_DOC' }],
      [{ texto: 'Venezolano' }],
      [{ texto: 'Extranjero' }],
      [{ texto: 'Pasaporte' }],
    ],
  }

  return armarLibro([hojaAbonos, hojaControl, hojaListas])
}

// ---------------------------------------------------------------------------
// MÓDULO 2: CARGA MASIVA MONEDA NACIONAL (44 COLUMNAS — APERTURA / CAMBIOS / BAJA)
// ---------------------------------------------------------------------------

/** Las 44 cabeceras literales exigidas por `1-FORMATO_CARGA_MASIVA-MONEDA_NACIONAL.xls`. */
export const CABECERAS_CARGA_MASIVA_44: readonly string[] = [
  'NUMERO BANCO (NO MODIFICAR)',
  'CORRELATIVO CLIENTE',
  'NACIONALIDAD',
  'NUEMRO DE CEDULA (COMPLETAR CON CEROS A LA IZQ)',
  'PRIMER APELLIDO',
  'SEGUNDO APELLIDO',
  'PRIMER NOMBRE',
  'SEGUNDO NOMBRE',
  'FECHA DE NACIMIENTO',
  'PAIS DE NACIMIENTO',
  'NACIONALIDAD',
  'SEXO',
  'ESTADO CIVIL',
  'DEPENDIENTES',
  'CALLE / AVENIDA',
  'CASA / EDIFICIO',
  'PISO / NIVEL',
  'APTO / OFIC / LOCAL / DEPTO',
  'REFERENCIA',
  'REGION',
  'ESTADO',
  'CIUDAD',
  'MUNICIPIO',
  'PARROQUIA',
  'ZONA POSTAL',
  'TELEFONO LOCAL',
  'TELEFONO DE CELULAR',
  'CONDICION DEL INMUEBLE',
  'TIPODE VIVIENDA',
  'CORREO ELECTRONICO',
  'TIEMPO DE RESIDENCIA',
  'NIVEL DE EDUCACION',
  'PROFESION',
  'CÓDIGO DE LA INDUSTRIA (UNA CONSTANTE)',
  'FUENTE DE INGRESO',
  'TIPO DE CONTRATO',
  'TIPO DE NOMINA',
  'TIPO DE CUENTE (NOMINA O PERSONAL)',
  'SUELDO BASICO (COMPLETAR CON CEROS A LA IZQUIERDA)',
  'FECHA DE INGRESO',
  'TIPO DE CARGO',
  'CÓDIGO DE LA OFICINA BANCARIA',
  'CÓDIGO DE LA OFICINA BANCARIA',
  'CONSTANTE (SE MANTIENE IGUAL)',
]

export interface FilaCargaMasiva44 {
  empleadoId: number
  ficha: string
  correlativoCliente: number
  nombreCompleto: string
  cedulaMostrar: string
  cargoMostrar: string
  tieneCuentaTesoro: boolean
  cuentaActual: string | null
  sueldoMensualBs: number
  ubicacionResuelta: UbicacionYAgenciaResuelta
  tipoCuentaNomina: string
  tipoSolicitud: 'I' | 'M' | 'D'
  columnas44: string[]
  errores: string[]
  advertencias: string[]
}

export function sueldoMensualEnBs(empleado: Empleado, tasaUsdActual: number): number {
  const base = Number(empleado.salario_base) || 0
  const mensual =
    empleado.base_estipulacion === 'DIARIO'
      ? base * 30
      : empleado.base_estipulacion === 'HORA'
        ? base * 8 * 30
        : base
  if (empleado.moneda_salario === 'VES') return mensual
  return mensual * (tasaUsdActual > 0 ? tasaUsdActual : 1)
}

export function construirFilasCargaMasiva44(params: {
  empleados: EmpleadoConBanco[]
  dependientesPorEmpleado: Map<number, number>
  tasaUsdActual: number
  correlativoInicial: number
  tipoSolicitud: 'I' | 'M' | 'D'
  tipoCuentaPorDefecto: 'VI01' | 'CCVI'
  agenciaForzada?: string // vacío = automática más cercana a la dirección de cada quien
  domicilioEmpresa?: string | null
  correoRespaldoEmpresa?: string | null
  telefonoRespaldoEmpresa?: string | null
}): FilaCargaMasiva44[] {
  const ordenados = [...params.empleados].sort((a, b) =>
    `${a.apellidos} ${a.nombres}`.localeCompare(`${b.apellidos} ${b.nombres}`, 'es-VE'),
  )

  return ordenados.map((e, idx) => {
    const correlativo = Math.max(1, Math.floor(params.correlativoInicial || 1)) + idx
    const doc = desarmarCedulaBanco(e.cedula)
    const [primerApellido, segundoApellido] = partirEnDosNombres(e.apellidos)
    const [primerNombre, segundoNombre] = partirEnDosNombres(e.nombres)

    const fechaNac = fechaIsoADdMmYyyy(e.fecha_nacimiento)
    const fechaIng = fechaIsoADdMmYyyy(e.fecha_ingreso)

    const esExtranjero =
      doc.letra === 'E' ||
      (Boolean(e.nacionalidad) && !/VENEZOLAN/i.test(e.nacionalidad ?? ''))
    const codigoPais = esExtranjero ? 'CO' : 'VE'

    const sexo = e.genero === 'FEMENINO' ? 'F' : 'M'
    const edoCivil = mapearEstadoCivilBt(e.estado_civil)
    const dependientes = String(params.dependientesPorEmpleado.get(e.id) ?? 0)

    const dom = desglosarDireccionBanco(e)
    const ubicacion = resolverUbicacionYAgenciaPorDireccion({
      direccionTrabajador: e.direccion,
      calleTrabajador: e.calle_avenida,
      referenciaTrabajador: e.referencia_domicilio,
      domicilioEmpresa: params.domicilioEmpresa,
      agenciaManual: params.agenciaForzada || e.bt_agencia,
      regionManual: e.bt_region,
      estadoManual: e.bt_estado,
      ciudadManual: e.bt_ciudad,
      municipioManual: e.bt_municipio,
      parroquiaManual: e.bt_parroquia,
      zonaPostalManual: e.zona_postal,
    })

    const celular = formatearTelefonoBanco(e.telefono || e.telefono_pago)
    const telefonoLocal =
      formatearTelefonoBanco(e.telefono_local) ||
      celular ||
      formatearTelefonoBanco(params.telefonoRespaldoEmpresa)

    const condicionInmueble = e.condicion_inmueble || '1'
    const tipoVivienda = e.tipo_vivienda || '1'
    const correo =
      limpiarTextoBanco(e.correo, 60).replace(/\s+/g, '') ||
      limpiarTextoBanco(params.correoRespaldoEmpresa, 60).replace(/\s+/g, '') ||
      ''
    const tiempoResidencia = String(Math.max(1, Number(e.tiempo_residencia) || 5))
    const nivelEducacion = mapearNivelEducacionBt(e.grado_instruccion)

    const deducido = deducirCargoYProfesionBt(e.cargo, e.grado_instruccion)
    const profesion = (e.bt_profesion || deducido.profesion).toUpperCase()
    const tipoCargo = (e.bt_tipo_cargo || deducido.tipoCargo).padStart(3, '0')

    const fuenteIngreso = '1' // 1 = SUELDO
    const tipoContrato = e.eventual ? '1' : '2' // 1 = FIJO, 2 = INDEFINIDO
    const tipoNomina = mapearTipoNominaBt(e.frecuencia)
    const tipoCuenta = (
      e.bt_tipo_cuenta ||
      params.tipoCuentaPorDefecto ||
      'VI01'
    ).toUpperCase()

    const sueldoBs = sueldoMensualEnBs(e, params.tasaUsdActual)
    const sueldoRelleno = montoACentimos15(sueldoBs)

    const ctaLimpia = (e.numero_cuenta ?? '').replace(/\D/g, '')
    const tieneCuentaTesoro =
      ctaLimpia.length === 20 && ctaLimpia.startsWith(CODIGO_BANCO_TESORO)

    const errores: string[] = []
    const advertencias: string[] = []

    if (!doc.valida) errores.push('Cédula inválida')
    if (!primerApellido || !primerNombre) errores.push('Falta nombre o apellido')
    if (!fechaNac) advertencias.push('Sin fecha de nacimiento en ficha')
    if (!celular) advertencias.push('Sin teléfono celular en ficha')
    if (!e.correo) advertencias.push('Sin correo propio (usa correo de respaldo o vacío)')
    if (!e.genero) advertencias.push('Género no indicado (asume M)')

    const columnas44: string[] = [
      CODIGO_BANCO_TESORO, // 1. NUMERO BANCO
      String(correlativo), // 2. CORRELATIVO CLIENTE
      doc.letra, // 3. NACIONALIDAD (V/E/P)
      doc.rellena9, // 4. NUMERO DE CEDULA (CEROS A LA IZQ)
      primerApellido, // 5. PRIMER APELLIDO
      segundoApellido, // 6. SEGUNDO APELLIDO
      primerNombre, // 7. PRIMER NOMBRE
      segundoNombre, // 8. SEGUNDO NOMBRE
      fechaNac, // 9. FECHA DE NACIMIENTO
      codigoPais, // 10. PAIS DE NACIMIENTO
      codigoPais, // 11. NACIONALIDAD (PAIS)
      sexo, // 12. SEXO
      edoCivil, // 13. ESTADO CIVIL
      dependientes, // 14. DEPENDIENTES
      dom.calle, // 15. CALLE / AVENIDA
      dom.casa, // 16. CASA / EDIFICIO
      dom.piso, // 17. PISO / NIVEL
      dom.apto, // 18. APTO / OFIC / LOCAL / DEPTO
      dom.referencia, // 19. REFERENCIA
      ubicacion.region, // 20. REGION
      ubicacion.estado, // 21. ESTADO
      ubicacion.ciudad, // 22. CIUDAD
      ubicacion.municipio, // 23. MUNICIPIO
      ubicacion.parroquia, // 24. PARROQUIA
      ubicacion.zonaPostal, // 25. ZONA POSTAL
      telefonoLocal, // 26. TELEFONO LOCAL
      celular || telefonoLocal, // 27. TELEFONO DE CELULAR
      condicionInmueble, // 28. CONDICION DEL INMUEBLE
      tipoVivienda, // 29. TIPO DE VIVIENDA
      correo, // 30. CORREO ELECTRONICO
      tiempoResidencia, // 31. TIEMPO DE RESIDENCIA
      nivelEducacion, // 32. NIVEL DE EDUCACION
      profesion, // 33. PROFESION
      CODIGO_INDUSTRIA_NOMINA_BT, // 34. CODIGO DE LA INDUSTRIA (0902)
      fuenteIngreso, // 35. FUENTE DE INGRESO
      tipoContrato, // 36. TIPO DE CONTRATO
      tipoNomina, // 37. TIPO DE NOMINA
      tipoCuenta, // 38. TIPO DE CUENTA (VI01 / CCVI)
      sueldoRelleno, // 39. SUELDO BASICO (CEROS A LA IZQ)
      fechaIng, // 40. FECHA DE INGRESO
      tipoCargo, // 41. TIPO DE CARGO
      ubicacion.agencia, // 42. CODIGO DE LA OFICINA BANCARIA (PRINCIPAL)
      ubicacion.agencia, // 43. CODIGO DE LA OFICINA BANCARIA (SECUNDARIA)
      params.tipoSolicitud, // 44. CONSTANTE (I / M / D)
    ]

    return {
      empleadoId: e.id,
      ficha: e.ficha,
      correlativoCliente: correlativo,
      nombreCompleto: `${e.apellidos}, ${e.nombres}`.trim(),
      cedulaMostrar: e.cedula,
      cargoMostrar: e.cargo,
      tieneCuentaTesoro,
      cuentaActual: ctaLimpia || null,
      sueldoMensualBs: sueldoBs,
      ubicacionResuelta: ubicacion,
      tipoCuentaNomina: tipoCuenta,
      tipoSolicitud: params.tipoSolicitud,
      columnas44,
      errores,
      advertencias,
    }
  })
}

/**
 * Genera el libro `.xlsx` respetando el diseño oficial de `MODELO` (44 columnas,
 * datos iniciando en la fila 14 como pide el Banco del Tesoro) + pestaña de
 * Resumen RRHH + pestaña oculta de Catálogos para listas desplegables.
 */
export function generarCargaMasivaXlsx(
  filas: FilaCargaMasiva44[],
  meta: {
    empresaNombre: string
    empresaRif: string
    tipoSolicitud: 'I' | 'M' | 'D'
    tasaUsd: number
  },
): Blob {
  const anchos44 = CABECERAS_CARGA_MASIVA_44.map((c) =>
    Math.min(Math.max(c.length + 3, 14), 34),
  )

  // Filas 1..13 de cabecera institucional del banco; fila 14 en adelante = datos
  const filasModelo: CeldaDeLibro[][] = [
    CABECERAS_CARGA_MASIVA_44.map((t) => ({ texto: t, estilo: ESTILO.cabecera })),
    [{ texto: `EMPRESA: ${meta.empresaNombre} · RIF: ${meta.empresaRif}`, estilo: ESTILO.subtitulo }],
    [
      {
        texto: `BANCO DEL TESORO (0163) · CARGA MASIVA MONEDA NACIONAL · TASA BCV REF: Bs ${meta.tasaUsd.toFixed(4)}`,
        estilo: ESTILO.subtitulo,
      },
    ],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    // Fila 11: ejemplo guía idéntico al formato del banco
    [
      { texto: '0163', estilo: ESTILO.subtitulo },
      { texto: '1', estilo: ESTILO.subtitulo },
      { texto: 'V', estilo: ESTILO.subtitulo },
      { texto: '002980635', estilo: ESTILO.subtitulo },
      { texto: 'EJEMPLO', estilo: ESTILO.subtitulo },
      { texto: 'REFERENCIA', estilo: ESTILO.subtitulo },
    ],
    [],
    // Fila 13: nota oficial del banco
    [
      {
        texto:
          'FAVOR COMPLETAR SU TABLA EN LA SIGUIENTE FILA (14) - NO MODIFICAR EL FORMATO DE ORIGEN (ESPACIOS - LETRAS) - VER PESTAÑAS ANEXAS PARA COMPLETAR LA INFORMACION',
        estilo: ESTILO.obligatoria,
      },
    ],
    // Fila 14+: registros reales de los trabajadores
    ...filas.map((f) => f.columnas44.map((valor): CeldaDeLibro => ({ texto: valor }))),
  ]

  const ultimaFilaValidacion = Math.max(14 + filas.length + 15, 30)
  const colAgencias = letraDeColumna(6)
  const validaciones: ValidacionDeLista[] = [
    { columna: 2, desde: 14, hasta: ultimaFilaValidacion, origen: 'CATALOGOS!$A$2:$A$4' },
    { columna: 11, desde: 14, hasta: ultimaFilaValidacion, origen: 'CATALOGOS!$B$2:$B$3' },
    { columna: 12, desde: 14, hasta: ultimaFilaValidacion, origen: 'CATALOGOS!$C$2:$C$6' },
    { columna: 36, desde: 14, hasta: ultimaFilaValidacion, origen: 'CATALOGOS!$D$2:$D$6' },
    { columna: 37, desde: 14, hasta: ultimaFilaValidacion, origen: 'CATALOGOS!$E$2:$E$3' },
    { columna: 41, desde: 14, hasta: ultimaFilaValidacion, origen: `CATALOGOS!$${colAgencias}$2:$${colAgencias}$${AGENCIAS_BT.length + 1}` },
    { columna: 42, desde: 14, hasta: ultimaFilaValidacion, origen: `CATALOGOS!$${colAgencias}$2:$${colAgencias}$${AGENCIAS_BT.length + 1}` },
    { columna: 43, desde: 14, hasta: ultimaFilaValidacion, origen: 'CATALOGOS!$F$2:$F$4' },
  ]

  const hojaModelo: HojaDelLibro = {
    nombre: 'MODELO',
    anchos: anchos44,
    filas: filasModelo,
    validaciones,
  }

  const hojaResumen: HojaDelLibro = {
    nombre: 'RESUMEN RRHH',
    anchos: [12, 10, 16, 34, 26, 28, 16, 12, 18, 12],
    filas: [
      [
        {
          texto: `${meta.empresaNombre} — CONTROL DE CARGA MASIVA BANCO DEL TESORO (44 COLUMNAS)`,
          estilo: ESTILO.titulo,
        },
      ],
      [
        {
          texto: `Trabajadores incluidos: ${filas.length} · Movimiento: ${meta.tipoSolicitud} · Tasa BCV: Bs ${meta.tasaUsd.toFixed(4)}`,
          estilo: ESTILO.subtitulo,
        },
      ],
      [],
      [
        'Correlativo',
        'Ficha',
        'Cédula',
        'Trabajador',
        'Cargo',
        'Agencia más cercana',
        'Parroquia / ZP',
        'Cuenta Tipo',
        'Sueldo Mensual Bs',
        'Movimiento',
      ].map((t) => ({ texto: t, estilo: ESTILO.cabecera })),
      ...filas.map((f): CeldaDeLibro[] => [
        { texto: String(f.correlativoCliente) },
        { texto: f.ficha },
        { texto: f.cedulaMostrar },
        { texto: f.nombreCompleto },
        { texto: f.cargoMostrar },
        { texto: `${f.ubicacionResuelta.agencia} · ${f.ubicacionResuelta.agenciaNombre}` },
        { texto: `${f.ubicacionResuelta.parroquia} / ${f.ubicacionResuelta.zonaPostal}` },
        { texto: f.tipoCuentaNomina },
        { texto: montoBsComaDecimal(f.sueldoMensualBs) },
        { texto: f.tipoSolicitud },
      ]),
    ],
  }

  // Construir hoja oculta de listas para los desplegables de MODELO
  const maxCatalogo = Math.max(AGENCIAS_BT.length + 1, 8)
  const filasCatalogo: CeldaDeLibro[][] = [
    [
      { texto: 'DOC' },
      { texto: 'SEXO' },
      { texto: 'EDO_CIVIL' },
      { texto: 'NOMINA' },
      { texto: 'CUENTA' },
      { texto: 'MOV' },
      { texto: 'AGENCIA' },
      { texto: 'NOMBRE_AGENCIA' },
    ],
  ]
  const docs = ['V', 'E', 'P']
  const sexos = ['M', 'F']
  const edos = ['1', '2', '3', '4', '5']
  const nominas = ['W', 'B', 'M', 'S', 'Y']
  const cuentas = ['VI01', 'CCVI']
  const movs = ['I', 'M', 'D']

  for (let i = 0; i < maxCatalogo - 1; i++) {
    filasCatalogo.push([
      { texto: docs[i] ?? '' },
      { texto: sexos[i] ?? '' },
      { texto: edos[i] ?? '' },
      { texto: nominas[i] ?? '' },
      { texto: cuentas[i] ?? '' },
      { texto: movs[i] ?? '' },
      { texto: AGENCIAS_BT[i]?.codigo ?? '' },
      { texto: AGENCIAS_BT[i]?.nombre ?? '' },
    ])
  }

  const hojaCatalogos: HojaDelLibro = {
    nombre: 'CATALOGOS',
    oculta: true,
    anchos: [10, 10, 10, 10, 12, 10, 12, 30],
    filas: filasCatalogo,
  }

  return armarLibro([hojaModelo, hojaResumen, hojaCatalogos])
}

export function generarCargaMasivaCsv(filas: FilaCargaMasiva44[]): Blob {
  const lineas = [
    CABECERAS_CARGA_MASIVA_44.join(';'),
    ...filas.map((f) => f.columnas44.join(';')),
  ]
  return new Blob(['\ufeff' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' })
}

export function generarCargaMasivaTxt(filas: FilaCargaMasiva44[]): Blob {
  const lineas = filas.map((f) => f.columnas44.join(','))
  return new Blob([lineas.join('\r\n')], { type: 'text/plain;charset=utf-8' })
}

// ---------------------------------------------------------------------------
// MÓDULO 3: LECTOR / CONCILIADOR DE RESPUESTA TXT/CSV DEL BANCO DEL TESORO
// ---------------------------------------------------------------------------

export interface LineaConciliacionBanco {
  filaArchivo: number
  correlativo: string
  documentoLote: string
  cedulaNormalizada: string
  cuenta: string
  montoBs: number
  estadoCodigo: string // P = Procesado, R = Rechazado
  estado: 'PROCESADO' | 'RECHAZADO' | 'OTRO'
  motivoBanco: string
  referenciaBanco: string
  empleadoId: number | null
  ficha: string | null
  trabajadorNombre: string | null
  reciboNetoBs: number | null
  diferenciaBs: number | null
}

export interface ResumenConciliacionBanco {
  lineas: LineaConciliacionBanco[]
  totalLineas: number
  procesados: number
  rechazados: number
  otros: number
  montoProcesadoBs: number
  montoRechazadoBs: number
}

export function analizarRespuestaBancoTxtCsv(
  contenidoCrudo: string,
  empleados: Empleado[],
  recibosPeriodo?: Recibo[],
): ResumenConciliacionBanco {
  const mapaPorCedula = new Map<string, Empleado>()
  const mapaPorCuenta = new Map<string, Empleado>()

  for (const e of empleados) {
    const d = desarmarCedulaBanco(e.cedula)
    mapaPorCedula.set(`${d.letra}-${d.numero}`, e)
    mapaPorCedula.set(d.numero, e)
    const cta = (e.numero_cuenta ?? '').replace(/\D/g, '')
    if (cta.length === 20) mapaPorCuenta.set(cta, e)
  }

  const reciboPorEmpleado = new Map<number, Recibo>()
  for (const r of recibosPeriodo ?? []) {
    reciboPorEmpleado.set(r.empleado_id, r)
  }

  const renglones = contenidoCrudo
    .replace(/^\ufeff/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const lineas: LineaConciliacionBanco[] = []

  renglones.forEach((linea, idx) => {
    // Soporta archivo separado por comas (como Hoja1: `0163180719,V002940602,0163...,000000000725000,R,,Saldo,,Insuficiente,,000...`)
    // o por punto y coma / pipe
    const sep = linea.includes(';') ? ';' : linea.includes('|') ? '|' : ','
    const partes = linea.split(sep).map((p) => p.trim())

    // Ignorar cabeceras textuales si alguien sube un CSV con encabezados
    if (idx === 0 && /correlativo|tipo\s*doc|documento/i.test(linea)) return

    const col0 = partes[0] ?? ''
    const col1 = partes[1] ?? ''
    const col2 = partes[2] ?? ''
    const col3 = partes[3] ?? ''

    // Detectar si viene con correlativo (4 columnas base) o formato portal
    let correlativo = ''
    let docRaw = ''
    let cuenta = ''
    let montoBs = 0
    let resto: string[] = []

    if (/^\d{7,12}$/.test(col0) && /^[VEJPG]\d+/i.test(col1)) {
      correlativo = col0
      docRaw = col1.toUpperCase()
      cuenta = col2.replace(/\D/g, '')
      const montRaw = col3.replace(/\D/g, '')
      montoBs =
        col3.includes(',') || col3.includes('.')
          ? Number(col3.replace(/\./g, '').replace(',', '.')) || 0
          : (Number(montRaw) || 0) / 100
      resto = partes.slice(4)
    } else {
      correlativo = `FILA-${idx + 1}`
      docRaw = `${col0}${col1}`.toUpperCase()
      cuenta = col2.replace(/\D/g, '')
      montoBs = Number((col4Or3(partes) ?? '0').replace(/\./g, '').replace(',', '.')) || 0
      resto = partes.slice(5)
    }

    const mDoc = /^([VEJPG])[-0]*(\d+)$/.exec(docRaw.replace(/\s+/g, ''))
    const letra = mDoc ? mDoc[1] : 'V'
    const numSinCeros = mDoc ? mDoc[2] : docRaw.replace(/\D/g, '').replace(/^0+/, '')
    const cedulaNormalizada = numSinCeros ? `${letra}-${numSinCeros}` : docRaw

    const tokensResto = resto.filter(Boolean)
    const estadoCod = (tokensResto[0] ?? '').toUpperCase()

    let referenciaBanco = ''
    const palabrasMotivo: string[] = []
    for (let i = 1; i < tokensResto.length; i++) {
      const tk = tokensResto[i]
      if (/^\d{12,25}$/.test(tk)) {
        referenciaBanco = /^0+$/.test(tk) ? '' : tk
      } else {
        palabrasMotivo.push(tk)
      }
    }

    let estado: 'PROCESADO' | 'RECHAZADO' | 'OTRO' = 'OTRO'
    const textoUnido = palabrasMotivo.join(' ')
    if (
      estadoCod === 'P' ||
      estadoCod === 'A' ||
      estadoCod === 'OK' ||
      /\bPROCESAD|\bAPLICAD|\bEXITOS/i.test(textoUnido)
    ) {
      estado = 'PROCESADO'
    } else if (
      estadoCod === 'R' ||
      estadoCod === 'E' ||
      estadoCod === 'D' ||
      /\bRECHAZ|\bINSUFICIENTE|\bINVALID|\bERROR|\bBLOQUEAD/i.test(textoUnido)
    ) {
      estado = 'RECHAZADO'
    }

    // Limpiar el caso en que una hoja editada dejó "Procesado Insuficiente"
    let motivoLimpio = textoUnido.trim()
    if (estado === 'PROCESADO' && /procesado/i.test(motivoLimpio)) {
      motivoLimpio = 'Procesado exitosamente'
    }
    if (!motivoLimpio) {
      motivoLimpio =
        estado === 'PROCESADO'
          ? 'Procesado'
          : estado === 'RECHAZADO'
            ? 'Rechazado por el banco'
            : estadoCod || 'Sin estado reportado'
    }

    const emp =
      (cuenta ? mapaPorCuenta.get(cuenta) : undefined) ??
      mapaPorCedula.get(cedulaNormalizada) ??
      mapaPorCedula.get(numSinCeros) ??
      null

    const recibo = emp ? reciboPorEmpleado.get(emp.id) : undefined
    const reciboNeto = recibo ? Number(recibo.neto) : null

    lineas.push({
      filaArchivo: idx + 1,
      correlativo,
      documentoLote: docRaw,
      cedulaNormalizada,
      cuenta,
      montoBs,
      estadoCodigo: estadoCod || (estado === 'PROCESADO' ? 'P' : estado === 'RECHAZADO' ? 'R' : '—'),
      estado,
      motivoBanco: motivoLimpio,
      referenciaBanco,
      empleadoId: emp?.id ?? null,
      ficha: emp?.ficha ?? null,
      trabajadorNombre: emp ? `${emp.apellidos}, ${emp.nombres}` : null,
      reciboNetoBs: reciboNeto,
      diferenciaBs: reciboNeto !== null ? Math.round((montoBs - reciboNeto) * 100) / 100 : null,
    })
  })

  const procesados = lineas.filter((l) => l.estado === 'PROCESADO').length
  const rechazados = lineas.filter((l) => l.estado === 'RECHAZADO').length
  const otros = lineas.length - procesados - rechazados
  const montoProcesadoBs = lineas
    .filter((l) => l.estado === 'PROCESADO')
    .reduce((s, l) => s + l.montoBs, 0)
  const montoRechazadoBs = lineas
    .filter((l) => l.estado === 'RECHAZADO')
    .reduce((s, l) => s + l.montoBs, 0)

  return {
    lineas,
    totalLineas: lineas.length,
    procesados,
    rechazados,
    otros,
    montoProcesadoBs,
    montoRechazadoBs,
  }
}

function col4Or3(partes: string[]): string | undefined {
  return partes[4] ?? partes[3]
}

export function generarConciliacionXlsx(
  resumen: ResumenConciliacionBanco,
  nombreArchivoOrigen: string,
): Blob {
  const hoja: HojaDelLibro = {
    nombre: 'CONCILIACION BANCO',
    anchos: [16, 10, 15, 34, 24, 16, 14, 30, 22],
    filas: [
      [{ texto: 'CONCILIACIÓN DE RESPUESTA DE LOTE — BANCO DEL TESORO (0163)', estilo: ESTILO.titulo }],
      [
        {
          texto: `Archivo: ${nombreArchivoOrigen} · Total: ${resumen.totalLineas} · Procesados: ${resumen.procesados} (Bs ${montoBsComaDecimal(resumen.montoProcesadoBs)}) · Rechazados: ${resumen.rechazados} (Bs ${montoBsComaDecimal(resumen.montoRechazadoBs)})`,
          estilo: ESTILO.subtitulo,
        },
      ],
      [],
      [
        'Correlativo',
        'Ficha',
        'Cédula',
        'Trabajador en Sistema',
        'Cuenta',
        'Monto Bs',
        'Resultado',
        'Detalle del Banco',
        'Referencia',
      ].map((t) => ({ texto: t, estilo: ESTILO.cabecera })),
      ...resumen.lineas.map((l): CeldaDeLibro[] => [
        { texto: l.correlativo },
        { texto: l.ficha ?? '—' },
        { texto: l.cedulaNormalizada },
        { texto: l.trabajadorNombre ?? 'NO IDENTIFICADO EN NÓMINA' },
        { texto: l.cuenta },
        { texto: montoBsComaDecimal(l.montoBs) },
        { texto: l.estado },
        { texto: l.motivoBanco },
        { texto: l.referenciaBanco || '—' },
      ]),
    ],
  }
  return armarLibro([hoja])
}
