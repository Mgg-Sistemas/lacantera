import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'
import type { PersonaDelInforme } from '@/lib/ficha/informePersonalPdf'

// ---------------------------------------------------------------------------
// Personal
// ---------------------------------------------------------------------------

export interface Empleado {
  id: number
  /** Cuatro dígitos, correlativo de por vida. La asigna la base, no la pantalla. */
  ficha: string
  cedula: string
  /**
   * El RIF de la persona, V-12345678-9. Nulo mientras no se sepa.
   *
   * No se deriva de la cédula aunque suela parecerse: quien tiene firma
   * personal lleva J, y el dígito verificador se calcula. Un RIF que el
   * sistema se inventa acaba impreso en una constancia.
   */
  rif: string | null
  nombres: string
  apellidos: string
  cargo: string
  departamento: string | null
  fecha_ingreso: string
  /**
   * `false` mientras nadie haya revisado la fecha de ingreso.
   *
   * Existe por la carga inicial desde el libro de nómina: ese archivo no traía
   * fecha de ingreso y hubo que poner una para que la ficha entrara. De esa
   * fecha salen la antigüedad, el bono vacacional y la liquidación, así que una
   * inventada que no se distingue de una verdadera es dinero mal calculado sin
   * que nadie lo note. Se pone en `true` sola al guardar la ficha.
   */
  fecha_ingreso_confirmada: boolean
  /** Nivel del tabulador. Nulo si esta persona está fuera de la escala. */
  tabulador_id: number | null
  fecha_egreso: string | null
  motivo_egreso: string | null
  fecha_nacimiento: string | null
  genero: 'MASCULINO' | 'FEMENINO' | null
  nacionalidad: string | null
  estado_civil: 'SOLTERO' | 'CASADO' | 'DIVORCIADO' | 'VIUDO' | 'CONCUBINATO' | null
  grupo_sanguineo: string | null
  direccion: string | null
  contacto_emergencia: string | null
  telefono_emergencia: string | null
  foto_path: string | null
  foto_zoom: string
  foto_x: string
  foto_y: string
  frecuencia: 'SEMANAL' | 'QUINCENAL' | 'MENSUAL'
  base_estipulacion: 'MENSUAL' | 'DIARIO' | 'HORA'
  salario_base: string
  moneda_salario: string
  tipo_jornada: 'DIURNA' | 'NOCTURNA' | 'MIXTA'
  dias_utilidades: string | null
  forma_pago: 'TRANSFERENCIA' | 'PAGO_MOVIL' | 'EFECTIVO' | 'BINANCE'
  banco: string | null
  numero_cuenta: string | null
  telefono_pago: string | null
  telefono: string | null
  activo: boolean
  /**
   * Contratado por día o por proyecto puntual.
   *
   * Decide si entra en las nóminas que corren solas. Un eventual queda fuera
   * de la semanal, la quincenal y la mensual, y entra en un período ESPECIAL,
   * que es el que alguien abre a propósito.
   *
   * No se guarda con el resto de la ficha: va por `marcar_empleado_eventual`,
   * porque decide si alguien cobra y eso no puede ser un efecto colateral de
   * corregirle el teléfono.
   */
  eventual: boolean
  nota: string | null

  /**
   * La cuenta del sistema de esta persona, si tiene.
   *
   * Nulo es lo normal y no significa nada malo: de los 22 trabajadores solo
   * unos pocos entran al sistema. Por eso la pantalla calla cuando esta vacio
   * —lo pidio la lider con esas palabras: «el sistema debe actuar de manera
   * silenciosa, sin mostrar ningun indicador ni mencion al respecto»—.
   */
  perfil_id: string | null
  /** Lo que se lee de esa cuenta cuando la hay. Viene por el enlace de arriba. */
  cuenta: {
    id: string
    usuario: string
    nombre: string
    creado_en: string
    activo: boolean
    roles: { rol: string }[]
  } | null
}

/*
  El empleado y su cuenta, en la misma consulta.

  Se trae por el enlace y no con una segunda consulta porque la lista de
  personal la pinta una sola tabla: dos consultas dejarian las filas apareciendo
  primero sin indicador y con el un instante despues, que es justo el parpadeo
  que hace dudar de si esa persona tiene cuenta o no.
*/
const SELECT_EMPLEADO =
  '*, cuenta:perfiles(id, usuario, nombre, creado_en, activo, roles:usuarios_roles(rol))'

export const GENEROS = [
  { valor: 'MASCULINO', etiqueta: 'Masculino' },
  { valor: 'FEMENINO', etiqueta: 'Femenino' },
]

export const ESTADOS_CIVILES = [
  { valor: 'SOLTERO', etiqueta: 'Soltero/a' },
  { valor: 'CASADO', etiqueta: 'Casado/a' },
  { valor: 'CONCUBINATO', etiqueta: 'Concubinato' },
  { valor: 'DIVORCIADO', etiqueta: 'Divorciado/a' },
  { valor: 'VIUDO', etiqueta: 'Viudo/a' },
]

export const GRUPOS_SANGUINEOS = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']

export const FRECUENCIAS = [
  { valor: 'SEMANAL', etiqueta: 'Semanal' },
  { valor: 'QUINCENAL', etiqueta: 'Quincenal' },
  { valor: 'MENSUAL', etiqueta: 'Mensual' },
]

export const BASES_SALARIO = [
  { valor: 'MENSUAL', etiqueta: 'Por mes' },
  { valor: 'DIARIO', etiqueta: 'Por día' },
  { valor: 'HORA', etiqueta: 'Por hora' },
]

export const JORNADAS = [
  { valor: 'DIURNA', etiqueta: 'Diurna — 8 h' },
  { valor: 'NOCTURNA', etiqueta: 'Nocturna — 7 h' },
  { valor: 'MIXTA', etiqueta: 'Mixta — 7,5 h' },
]


/**
 * De la ficha a la fila del informe de personal.
 *
 * Vive aquí y no en la pantalla —como `empresaDelPapel`— porque lo usan dos:
 * la lista de personal, para el informe en lote, y la ficha, para el de una
 * sola persona. Duplicarlo en las dos sería tener dos informes que se parecen
 * hasta el día que alguien toque uno.
 */
export function fichaDelInforme(e: Empleado): PersonaDelInforme {
  return {
    ficha: e.ficha,
    nombre: `${e.nombres} ${e.apellidos}`.trim(),
    cedula: e.cedula,
    cargo: e.cargo,
    departamento: e.departamento,
    fechaIngreso: e.fecha_ingreso,
    fechaEgreso: e.fecha_egreso,
    motivoEgreso: e.motivo_egreso,
    telefono: e.telefono,
  }
}

/*
  DE QUÉ RESPONDE CADA PERSONA.

  Christopher: «en nómina - personal, se debe indicar si la persona tiene o no
  algún almacén, área o proceso a su cargo».

  Va aparte de `useEmpleados` y no dentro: aquel lo llaman seis pantallas que
  solo quieren la lista de nombres, y cargarles un cruce con almacenes y
  máquinas para que ninguna lo use es pagar por nada.

  «Área o proceso» no aparece porque todavía no existe: lo más parecido es el
  organigrama, cuyo titular es texto libre. Cruzarlo por nombre daría aciertos y
  fallos indistinguibles, y un «no tiene nada a cargo» falso es peor que no
  contestar.
*/
export interface ACargoDe {
  empleado_id: number
  almacenes: number
  maquinas: number
  /** Los nombres, ya unidos. Nulo cuando no lleva nada. */
  detalle: string | null
}

export function useACargoDe() {
  return useQuery({
    queryKey: ['nomina', 'a-cargo'],
    staleTime: 60_000,
    queryFn: () => rpc<ACargoDe[]>('a_cargo_de_empleados', {}),
  })
}

export function useEmpleados(soloActivos = true) {
  return useQuery({
    queryKey: ['nomina', 'empleados', soloActivos],
    queryFn: async () => {
      let q = supabase
        .from('empleados')
        .select(SELECT_EMPLEADO)
        .order('apellidos')
        .order('nombres')
      if (soloActivos) q = q.eq('activo', true)
      return desenvolver<Empleado[]>(await q)
    },
  })
}

/**
 * Quién pertenece a un período de nómina.
 *
 * NO es lo mismo que «quién está activo», y confundirlos ya costó dos veces.
 *
 * La primera fue dentro de `calcular_nomina`, que filtraba por `activo` y por
 * eso dejaba de pagarle la quincena a quien se daba de baja el día 26: había
 * trabajado hasta el 26 y ese dinero se le debía. Se quitó aquel filtro y se
 * dejó solo la ventana de fechas, que es la que de verdad dice quién entra.
 *
 * La segunda fue en la pantalla de novedades, que seguía pidiendo los activos.
 * Christopher: «hay un desincorporado, Cortez Hernán, que hay que quitarle un
 * día pero no me aparece en novedades». El motor le pagaba su día y la pantalla
 * no dejaba tocarlo: se le podía pagar de más y no había dónde corregirlo.
 *
 * La condición de abajo es la MISMA que la del motor, palabra por palabra:
 * entró antes de que el período terminara y no se había ido antes de que
 * empezara. Si un día cambia allí, cambia aquí.
 */
export function useEmpleadosDelPeriodo(desde?: string, hasta?: string) {
  return useQuery({
    queryKey: ['nomina', 'empleados-del-periodo', desde, hasta],
    enabled: Boolean(desde && hasta),
    queryFn: async () =>
      desenvolver<Empleado[]>(
        await supabase
          .from('empleados')
          .select(SELECT_EMPLEADO)
          .lte('fecha_ingreso', hasta!)
          .or(`fecha_egreso.is.null,fecha_egreso.gte.${desde!}`)
          .order('apellidos')
          .order('nombres'),
      ),
  })
}

/**
 * Un trabajador, o nada si esa ficha no existe.
 *
 * Con `single()` una ficha inexistente devolvía error, y react-query lo
 * reintentaba tres veces con espera creciente: siete segundos de «Cargando…»
 * para acabar en un error técnico. Un enlace viejo o un número tecleado a mano
 * son motivos de sobra para llegar aquí, y ninguno merece eso.
 *
 * Con `maybeSingle()` no hay error que reintentar: no está, y la pantalla lo
 * dice de una vez.
 */
export function useEmpleado(id: number | undefined) {
  return useQuery({
    queryKey: ['nomina', 'empleado', id],
    enabled: id !== undefined && Number.isFinite(id),
    queryFn: async () =>
      desenvolver<Empleado | null>(
        await supabase.from('empleados').select(SELECT_EMPLEADO).eq('id', id!).maybeSingle(),
      ),
  })
}

// ---------------------------------------------------------------------------
// Períodos
// ---------------------------------------------------------------------------

export interface Periodo {
  id: number
  numero: string
  tipo: 'SEMANAL' | 'QUINCENAL' | 'MENSUAL' | 'ESPECIAL'
  desde: string
  hasta: string
  dias: number
  descripcion: string | null
  tasa: string
  tasa_usd: string
  estado: 'BORRADOR' | 'CALCULADA' | 'APROBADA' | 'PAGADA' | 'ANULADA'
  calculada_en: string | null
  aprobada_en: string | null
  pagada_en: string | null
  motivo_anulacion: string | null
  recibos: number | null
  total_neto: string
  total_asignado: string
  total_deducido: string
  total_aportes: string
  total_neto_usd: string
  /**
   * Los conceptos de ley con que se CALCULÓ esta quincena, en su orden; vacía si fue
   * solo lo pactado (sueldo, bonos y descuentos manuales y faltas). La guarda
   * `calcular_nomina`; si nunca se calculó, son los que rigen para su fecha. Es la
   * que manda para enseñar sus recibos.
   *
   * La vista trae también `solo_lo_pactado` y `solo_lo_pactado_vigente`, derivadas,
   * para las pantallas de antes que sigan abiertas. Aquí no se declaran a propósito:
   * no dicen qué conceptos, y nada nuevo debe leerlas.
   */
  conceptos_de_ley: ConceptoDeLey[]
  /**
   * Los que rigen HOY para su fecha: los que usaría un cálculo nuevo. Si no
   * coinciden con `conceptos_de_ley`, algún interruptor se movió después de
   * calcular, y la base no deja aprobarla sin volver a calcular.
   */
  conceptos_de_ley_vigentes: ConceptoDeLey[]
}

export const ESTADOS_PERIODO: Record<
  string,
  { texto: string; tono: 'neutral' | 'info' | 'royal' | 'warning' | 'success' | 'danger' }
> = {
  BORRADOR: { texto: 'Borrador · cargar novedades', tono: 'neutral' },
  CALCULADA: { texto: 'Calculada · por aprobar', tono: 'info' },
  APROBADA: { texto: 'Aprobada · por pagar', tono: 'warning' },
  PAGADA: { texto: 'Pagada', tono: 'success' },
  ANULADA: { texto: 'Anulada', tono: 'danger' },
}

export function usePeriodos() {
  return useQuery({
    queryKey: ['nomina', 'periodos'],
    queryFn: async () =>
      desenvolver<Periodo[]>(
        await supabase
          .from('v_nomina_periodos')
          .select('*')
          .order('desde', { ascending: false })
          .limit(50),
      ),
  })
}

// ---------------------------------------------------------------------------
// Novedades
// ---------------------------------------------------------------------------

export interface Novedad {
  id: number
  periodo_id: number
  empleado_id: number
  horas_extra_diurnas: string
  horas_extra_nocturnas: string
  horas_nocturnas: string
  dias_feriados_trabajados: string
  dias_descanso_trabajados: string
  faltas_injustificadas: string
  faltas_justificadas: string
  nota: string | null
}

export function useNovedades(periodoId: number | undefined) {
  return useQuery({
    enabled: periodoId !== undefined,
    queryKey: ['nomina', 'novedades', periodoId],
    queryFn: async () =>
      desenvolver<Novedad[]>(
        await supabase.from('nomina_novedades').select('*').eq('periodo_id', periodoId!),
      ),
  })
}

export interface NovedadMonto {
  id: number
  periodo_id: number
  empleado_id: number
  concepto: string
  monto: string
  moneda: string
  nota: string | null
  /**
   * Cómo se paga este monto. Nulo: como se pague el resto de la nómina.
   *
   * Un bono puede ir por pago móvil mientras el sueldo va por transferencia, y
   * eso antes no se podía decir en ninguna parte.
   */
  metodo_pago: string | null
  /**
   * Qué día se paga. Nulo: con la nómina. Con fecha: diferido a ese día.
   *
   * NO HAY UN `pagado_en` AL LADO, Y NO ES UN OLVIDO. Aquí no se está
   * modelando el estado de un pago sino qué día toca. El recibo impreso dice
   * lo que se ganó y no lleva marca de pendiente: un papel que dice
   * «pendiente» sigue diciéndolo el año que viene, cuando ya se pagó, y
   * entonces es un documento firmado que afirma una deuda que no existe.
   */
  pagar_en: string | null
}

export function useNovedadesMontos(periodoId: number | undefined) {
  return useQuery({
    enabled: periodoId !== undefined,
    queryKey: ['nomina', 'novedades-montos', periodoId],
    queryFn: async () =>
      desenvolver<NovedadMonto[]>(
        await supabase
          .from('nomina_novedades_montos')
          .select('*')
          .eq('periodo_id', periodoId!),
      ),
  })
}

// ---------------------------------------------------------------------------
// Recibos
// ---------------------------------------------------------------------------

export interface LineaRecibo {
  id: number
  concepto: string
  descripcion: string
  cantidad: string | null
  base: string | null
  monto: string
  tipo: 'ASIGNACION' | 'DEDUCCION' | 'APORTE' | 'PROVISION'
  orden: number
}

export interface Recibo {
  id: number
  periodo_id: number
  empleado_id: number
  /*
    LOS TRES NUMEROS DE DIAS

    Los pidio la lider para el recibo. Facturados es lo que paga el periodo —15
    en una quincena, aunque su rango tenga 16 fechas—. Laborados es eso menos
    TODAS las faltas: lo que de verdad estuvo. A pagar es eso menos solo las
    INJUSTIFICADAS, porque la justificada se paga, y es el unico de los tres que
    entra en el calculo.
  */
  dias_facturados: string | null
  dias_laborados: string | null
  dias_pagados: string
  /**
   * La fecha en que esa persona salio, si salio dentro de este periodo.
   *
   * Se congela al calcular y no se lee de la ficha al imprimir: un recibo es un
   * documento y dice lo que era cierto el dia que se emitio. Si manana se
   * reincorpora, el recibo de agosto tiene que seguir diciendo que en agosto se
   * fue.
   *
   * Nula en el caso normal, y tambien en los recibos calculados antes de que la
   * columna existiera — que no es un fallo, es un recibo mas viejo.
   */
  egresado_en: string | null
  salario_basico_diario: string
  salario_normal_diario: string
  salario_integral_diario: string
  total_asignaciones: string
  total_deducciones: string
  neto: string
  total_aportes: string
  neto_usd: string
  empleado: {
    ficha: string
    cedula: string
    nombres: string
    apellidos: string
    cargo: string
    /*
      Los cuatro de abajo no los usa el recibo: los usa el informe de cierre,
      que se saca desde la misma pantalla y necesita decir de qué área es cada
      quien y quién salió y por qué.

      Van en esta consulta y no en una aparte porque son cuatro columnas de una
      fila que ya se está trayendo; pedirlas de nuevo serían veintidós viajes
      más para no enterarse de nada nuevo.
    */
    departamento: string | null
    fecha_ingreso: string
    fecha_egreso: string | null
    motivo_egreso: string | null
    forma_pago: string
    banco: string | null
    numero_cuenta: string | null
  } | null
  lineas: LineaRecibo[]
}

export function useRecibos(periodoId: number | undefined) {
  return useQuery({
    enabled: periodoId !== undefined,
    queryKey: ['nomina', 'recibos', periodoId],
    queryFn: async () =>
      desenvolver<Recibo[]>(
        await supabase
          .from('nomina_recibos')
          .select(
            '*, empleado:empleados(ficha, cedula, nombres, apellidos, cargo, departamento, fecha_ingreso, fecha_egreso, motivo_egreso, forma_pago, banco, numero_cuenta), lineas:nomina_recibo_lineas(*)',
          )
          .eq('periodo_id', periodoId!),
      ),
  })
}

// ---------------------------------------------------------------------------
// Conceptos y parámetros
// ---------------------------------------------------------------------------

export interface Concepto {
  codigo: string
  nombre: string
  tipo: 'ASIGNACION' | 'DEDUCCION' | 'APORTE' | 'PROVISION'
  origen: 'AUTOMATICO' | 'NOVEDAD'
  incide_normal: boolean
  incide_integral: boolean
  orden: number
  base_legal: string | null
  activo: boolean
}

/**
 * Los conceptos del cálculo.
 *
 * Por omisión solo los encendidos, que es lo que se ofrece al cargar una
 * novedad. Con `soloActivos = false` vienen todos, para la pantalla que los
 * administra: ahí hay que poder ver el que se apagó para volver a encenderlo.
 */
export function useConceptos(soloActivos = true) {
  return useQuery({
    queryKey: ['nomina', 'conceptos', soloActivos],
    queryFn: async () => {
      const q = supabase.from('nomina_conceptos').select('*').order('orden')
      return desenvolver<Concepto[]>(await (soloActivos ? q.eq('activo', true) : q))
    },
    staleTime: 10 * 60_000,
  })
}

export interface Parametro {
  id: number
  clave: string
  /** Nulo cuando la unidad es TEXTO: entonces lo que vale está en valor_texto. */
  valor: string | null
  valor_texto: string | null
  unidad: string
  vigencia_desde: string
  vigencia_hasta: string | null
  descripcion: string
  fuente: string | null
}

export function useParametros() {
  return useQuery({
    queryKey: ['nomina', 'parametros'],
    queryFn: async () =>
      desenvolver<Parametro[]>(
        await supabase
          .from('nomina_parametros')
          .select('*')
          .order('clave')
          .order('vigencia_desde', { ascending: false }),
      ),
  })
}

/**
 * Los conceptos de ley que la nómina puede calcular, en el orden en que los guarda la
 * base (`private.conceptos_de_ley_todos`). Lo pactado —sueldo de la ficha, bonos y
 * descuentos, faltas— se calcula siempre; esto es lo que va encima, cada uno con su
 * interruptor en Parámetros de nómina.
 */
export const CONCEPTOS_DE_LEY = [
  {
    codigo: 'CESTATICKET',
    nombre: 'Cestaticket aparte',
    detalle: 'El beneficio de alimentación va en su propia línea del recibo.',
  },
  {
    codigo: 'IVSS',
    nombre: 'Seguro social (IVSS)',
    detalle: 'Retención al trabajador y aporte del patrono.',
  },
  {
    codigo: 'RPE',
    nombre: 'Paro forzoso (RPE)',
    detalle: 'Retención al trabajador y aporte del patrono.',
  },
  {
    codigo: 'FAOV',
    nombre: 'Vivienda (FAOV)',
    detalle: 'Retención al trabajador y aporte del patrono, sobre el salario integral.',
  },
  {
    codigo: 'RECARGOS',
    nombre: 'Recargos',
    detalle: 'Horas extra, bono nocturno, feriados y descansos trabajados, que se cargan en las novedades.',
  },
  {
    codigo: 'PRESTACIONES',
    nombre: 'Prestaciones sociales',
    detalle: 'Lo que se aparta en cada recibo, y la pantalla de prestaciones.',
  },
  {
    codigo: 'VACACIONES',
    nombre: 'Bono vacacional',
    detalle:
      'Permite añadir el bono al recibo de quien sale de vacaciones. Los días no se pagan aparte: las faltas justificadas no bajan el salario, así que ya los cobra.',
  },
] as const

export type ConceptoDeLey = (typeof CONCEPTOS_DE_LEY)[number]['codigo']

/**
 * Lo que dice el texto de `regimen_nomina`: la lista separada por comas, o SOLO LO
 * PACTADO si no hay ninguno. Se devuelve en el orden de la base.
 */
export function conceptosDelRegimen(texto: string | null): ConceptoDeLey[] {
  if (!texto || texto === 'SOLO LO PACTADO') return []
  const puestos = texto.split(', ')
  return CONCEPTOS_DE_LEY.map((c) => c.codigo).filter((c) => puestos.includes(c))
}

/**
 * Los conceptos de ley que se calculan en una fecha.
 *
 * La misma regla que `private.conceptos_de_ley` y que las columnas de la vista de
 * períodos: la vigencia más reciente de `regimen_nomina` que cubra la fecha, y sin
 * fila, todos. Sirve donde no hay un período del que leerlo, como los interruptores o
 * la pantalla de prestaciones.
 */
export function conceptosDeLeyEn(parametros: Parametro[], fecha: string): ConceptoDeLey[] {
  const vigente = parametros
    .filter(
      (p) =>
        p.clave === 'regimen_nomina' &&
        p.vigencia_desde <= fecha &&
        (p.vigencia_hasta === null || p.vigencia_hasta >= fecha),
    )
    .sort((a, b) => b.vigencia_desde.localeCompare(a.vigencia_desde))[0]
  return vigente ? conceptosDelRegimen(vigente.valor_texto) : CONCEPTOS_DE_LEY.map((c) => c.codigo)
}

/** Qué se enciende y qué se apaga al pasar de una lista a otra, ya con sus nombres. */
export function cambioDeConceptos(antes: readonly string[], despues: readonly string[]) {
  const nombre = (c: string) => CONCEPTOS_DE_LEY.find((x) => x.codigo === c)?.nombre ?? c
  return {
    encendidos: despues.filter((c) => !antes.includes(c)).map(nombre),
    apagados: antes.filter((c) => !despues.includes(c)).map(nombre),
  }
}

/** «A», «A y B», «A, B y C». */
export function enLista(nombres: readonly string[]): string {
  if (nombres.length < 2) return nombres.join('')
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

/**
 * Pagar la nómina mueve dinero y avisa; calcularla cambia los recibos. Se
 * invalida también tesorería y los avisos porque el pago escribe en el libro
 * y emite la notificación que pidió el gerente.
 */
function useAccionNomina<A>(fn: (args: A) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['nomina'] })
      void qc.invalidateQueries({ queryKey: ['tesoreria'] })
      void qc.invalidateQueries({ queryKey: ['notificaciones'] })
      // Tocar una ficha puede sacarla o meterla en el tabulador: quien tenga
      // esa pantalla abierta vería un botón de sincronizar que ya no hace nada,
      // o no lo vería habiendo alguien desfasado.
      void qc.invalidateQueries({ queryKey: ['tabulador'] })
    },
  })
}

/*
  Atar una ficha con su cuenta del sistema.

  No reparte ningun permiso: solo deja dicho que el trabajador de la ficha y el
  usuario que entra al sistema son la misma persona. Hace falta desde que un
  permiso se le puede extender a alguien concreto — una autorizacion se le da a
  una PERSONA, y hasta ahora el sistema no sabia que la ficha y la cuenta eran
  la misma.

  Se ata a mano y no por cedula: de los 12 perfiles solo 4 la tienen, y cruzarla
  con los 22 empleados daba CERO coincidencias. Adivinarlo habria colgado
  cuentas de quien no es.
*/
export function useVincularCuenta() {
  return useAccionNomina((v: { empleado_id: number; perfil_id: string | null }) =>
    rpc('vincular_cuenta_a_empleado', {
      p_empleado_id: v.empleado_id,
      p_perfil_id: v.perfil_id,
    }),
  )
}

/** Las cuentas que no son de nadie todavia, mas la que ya tenga esta ficha. */
export function useCuentasSinFicha(empleadoId: number | undefined) {
  return useQuery({
    queryKey: ['nomina', 'cuentas-sin-ficha', empleadoId],
    enabled: empleadoId !== undefined,
    queryFn: () =>
      rpc<{ id: string; usuario: string; nombre: string; cargo: string | null; creado_en: string }[]>(
        'cuentas_sin_ficha',
        { p_empleado_id: empleadoId ?? null },
      ),
  })
}

export function useGuardarEmpleado() {
  return useAccionNomina((e: Partial<Empleado> & { salario_base: number | string }) =>
    rpc<number>('guardar_empleado', {
      p_id: e.id ?? null,
      p_cedula: e.cedula,
      /*
        SIEMPRE SE MANDA, Y VACÍO QUIERE DECIR «BÓRRALO».

        La base distingue no recibirlo —no lo toca— de recibirlo en blanco
        —lo borra—, para que una pantalla vieja que no lo conoce no arrase
        con el RIF de alguien al guardar un teléfono. Esta pantalla sí lo
        conoce, así que manda lo que tenga el formulario, incluso vacío.
      */
      p_rif: e.rif ?? '',
      p_nombres: e.nombres,
      p_apellidos: e.apellidos,
      p_cargo: e.cargo,
      p_departamento: e.departamento || null,
      p_fecha_ingreso: e.fecha_ingreso,
      p_fecha_nacimiento: e.fecha_nacimiento || null,
      p_genero: e.genero || null,
      p_nacionalidad: e.nacionalidad || null,
      p_estado_civil: e.estado_civil || null,
      p_grupo_sanguineo: e.grupo_sanguineo || null,
      p_direccion: e.direccion || null,
      p_contacto_emergencia: e.contacto_emergencia || null,
      p_telefono_emergencia: e.telefono_emergencia || null,
      p_frecuencia: e.frecuencia ?? 'QUINCENAL',
      p_base: e.base_estipulacion ?? 'MENSUAL',
      p_salario: Number(e.salario_base),
      p_moneda: e.moneda_salario ?? 'VES',
      p_jornada: e.tipo_jornada ?? 'DIURNA',
      p_dias_utilidades: e.dias_utilidades ? Number(e.dias_utilidades) : null,
      p_forma_pago: e.forma_pago ?? 'TRANSFERENCIA',
      p_banco: e.banco || null,
      p_numero_cuenta: e.numero_cuenta || null,
      p_telefono_pago: e.telefono_pago || null,
      p_telefono: e.telefono || null,
      p_activo: e.activo ?? true,
      p_nota: e.nota || null,
      // El desplegable manda texto —'' cuando está fuera del tabulador— y la
      // base espera un bigint. Sin esta conversión, "fuera del tabulador" viaja
      // como cadena vacía y la función revienta con un error de tipo que no le
      // dice nada a quien solo quería guardar una ficha.
      p_tabulador_id: e.tabulador_id ? Number(e.tabulador_id) : null,
    }),
  )
}

export function useEgresarEmpleado() {
  return useAccionNomina((e: { id: number; fecha: string; motivo: string }) =>
    rpc('egresar_empleado', { p_id: e.id, p_fecha: e.fecha, p_motivo: e.motivo }),
  )
}

/**
 * Borrar de verdad, para la ficha que nunca debió existir.
 *
 * No es lo mismo que egresar. La base solo lo deja pasar si esa persona no
 * cobró ni tiene novedades: borrar a quien ya cobró descuadraría el libro de
 * nómina contra lo que salió de tesorería, y eso no se ve hasta el cierre.
 *
 * Devuelve la ruta de su foto, si tenía, para poder sacarla del
 * almacenamiento: la base no habla con el bucket, y si no se borra aquí queda
 * ocupando espacio pagado para siempre.
 */
/*
  Aquí vivía `useEliminarEmpleado`. Se quitó junto con el botón de la papelera:
  una ficha de personal no se borra, se desincorpora con `useEgresarEmpleado`.

  La función `eliminar_empleado` sigue existiendo en la base, pero solo para
  negarse con una frase que se entienda. Quien tenga la pantalla vieja abierta
  recibe esa frase en lugar de un "función no encontrada".
*/

// ---------------------------------------------------------------------------
// La foto de la ficha
// ---------------------------------------------------------------------------

const BUCKET_FOTOS = 'personal'

/**
 * Sube la foto y anota dónde quedó.
 *
 * El archivo viaja directo del navegador al bucket; la base solo guarda la
 * ruta. Si la subida falla, no queda una ficha apuntando a un archivo que no
 * existe. Al reemplazar una foto, la anterior se borra: nadie va a volver a
 * mirarla y ocupa espacio pagado.
 */
export function useSubirFoto() {
  return useAccionNomina(async (f: { empleado_id: number; archivo: File }) => {
    const extension = f.archivo.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const ruta = `${f.empleado_id}/${Date.now()}.${extension}`

    const { error } = await supabase.storage
      .from(BUCKET_FOTOS)
      .upload(ruta, f.archivo, { contentType: f.archivo.type, upsert: false })

    if (error) throw error

    // Al cambiar de foto el encuadre anterior deja de tener sentido: apuntaba a
    // una cara que estaba en otro sitio de otra imagen.
    const anterior = await rpc<string | null>('guardar_foto_empleado', {
      p_id: f.empleado_id,
      p_path: ruta,
      p_zoom: 1,
      p_x: 0.5,
      p_y: 0.5,
    })

    if (anterior) await supabase.storage.from(BUCKET_FOTOS).remove([anterior])

    return ruta
  })
}

// ---------------------------------------------------------------------------
// Los papeles del trabajador
//
// Christopher, 22/09/2026: «Documentación del Trabajador (Cédula, Rif,
// Currículum)». Van al MISMO depósito privado que las fotos, bajo
// `<ficha>/documentos/`: ese depósito ya tiene sus reglas puestas —escriben
// ADMIN y RRHH— y son las que le tocan a la cédula de alguien.
//
// NUNCA HAY UNA DIRECCIÓN PÚBLICA: el enlace lo firma el servidor contra la
// sesión de quien lo pide y caduca. La cédula de un trabajador no puede quedar
// colgada de una dirección que se reenvía por WhatsApp.
// ---------------------------------------------------------------------------

/** Diez minutos: lo que se tarda en mirar un papel, no en repartirlo. */
const VIGENCIA_ENLACE = 600

export interface TipoDeDocumento {
  codigo: string
  nombre: string
  orden: number
  activo: boolean
}

export interface DocumentoDeEmpleado {
  id: number
  empleado_id: number
  tipo: string
  nombre: string
  archivo_path: string
  mime: string | null
  bytes: number | null
  emitido_el: string | null
  vence_el: string | null
  nota: string | null
  subido_por: string | null
  subido_en: string
}

export function useTiposDeDocumento() {
  return useQuery({
    queryKey: ['nomina', 'tipos-documento'],
    staleTime: 30 * 60_000,
    queryFn: async () =>
      desenvolver<TipoDeDocumento[]>(
        await supabase.from('tipos_documento_personal').select('*').order('orden'),
      ),
  })
}

export function useDocumentosDeEmpleado(empleadoId: number | undefined) {
  return useQuery({
    enabled: empleadoId !== undefined,
    queryKey: ['nomina', 'documentos', empleadoId],
    queryFn: async () =>
      desenvolver<DocumentoDeEmpleado[]>(
        await supabase
          .from('empleado_documentos')
          .select('*')
          .eq('empleado_id', empleadoId!)
          .order('subido_en', { ascending: false }),
      ),
  })
}

/**
 * Sube el archivo y solo después lo anota.
 *
 * En ese orden a propósito: si la subida falla no queda una fila señalando un
 * archivo que no existe, que es un renglón que al pulsarlo no abre nada. Al
 * revés el fallo es más benigno —un archivo que nadie ve— y aun así se retira.
 */
export function useSubirDocumentoDeEmpleado() {
  return useAccionNomina(async (d: {
    empleado_id: number
    tipo: string
    nombre: string
    archivo: File
    emitido_el?: string
    vence_el?: string
    nota?: string
  }) => {
    const extension = d.archivo.name.split('.').pop()?.toLowerCase() ?? 'pdf'
    // El nombre en el depósito no es el visible: dos cédulas se llaman igual y
    // una ruta repetida pisaría la anterior.
    const ruta = `${d.empleado_id}/documentos/${crypto.randomUUID()}.${extension}`

    const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(ruta, d.archivo, {
      contentType: d.archivo.type || 'application/octet-stream',
      upsert: false,
    })
    if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`)

    try {
      return await rpc<number>('registrar_documento_de_empleado', {
        p_empleado_id: d.empleado_id,
        p_tipo: d.tipo,
        p_nombre: d.nombre,
        p_archivo: ruta,
        p_mime: d.archivo.type || null,
        p_bytes: d.archivo.size,
        p_emitido_el: d.emitido_el || null,
        p_vence_el: d.vence_el || null,
        p_nota: d.nota || null,
      })
    } catch (e) {
      await supabase.storage.from(BUCKET_FOTOS).remove([ruta])
      throw e
    }
  })
}

export function useEliminarDocumentoDeEmpleado() {
  return useAccionNomina(async (id: number) => {
    // La función devuelve la ruta justamente para poder llevarse el archivo.
    const ruta = await rpc<string>('eliminar_documento_de_empleado', { p_id: id })
    if (ruta) await supabase.storage.from(BUCKET_FOTOS).remove([ruta])
  })
}

/** Una dirección firmada para mirar un papel. Caduca en diez minutos. */
export async function urlDeDocumentoDeEmpleado(ruta: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET_FOTOS)
    .createSignedUrl(ruta, VIGENCIA_ENLACE)

  if (error || !data) {
    throw new Error(`No se pudo abrir el documento: ${error?.message ?? 'sin respuesta'}`)
  }
  return data.signedUrl
}

/* ────────────────────────────────────────────────────────────────────────────
   LAS VACACIONES DEL PERÍODO

   Una fila por persona y período. Los DÍAS no se pagan aquí: las faltas
   justificadas no bajan lo que se paga, así que quien está de vacaciones ya
   cobra su salario completo por `SAL-BAS`. Lo que decide esta fila es si el
   recibo lleva además la línea del **bono vacacional**, y lo decide RRHH con
   una casilla, caso por caso.
   ──────────────────────────────────────────────────────────────────────────── */

export interface VacacionesDelPeriodo {
  id: number
  periodo_id: number
  empleado_id: number
  dias: string
  desde: string | null
  hasta: string | null
  /** La casilla: si el recibo de ESTE período lleva el bono. */
  paga_bono: boolean
  nota: string | null
}

export function useVacacionesDelPeriodo(periodoId: number | undefined) {
  return useQuery({
    enabled: periodoId !== undefined,
    queryKey: ['nomina', 'vacaciones', periodoId],
    queryFn: async () =>
      desenvolver<VacacionesDelPeriodo[]>(
        await supabase
          .from('nomina_vacaciones')
          .select('*')
          .eq('periodo_id', periodoId!),
      ),
  })
}

export function useGuardarVacaciones() {
  return useAccionNomina((v: {
    periodo_id: number
    empleado_id: number
    dias: number
    paga_bono?: boolean
    desde?: string | null
    hasta?: string | null
    nota?: string | null
  }) =>
    rpc<number>('guardar_vacaciones', {
      p_periodo_id: v.periodo_id,
      p_empleado_id: v.empleado_id,
      p_dias: v.dias,
      p_paga_bono: v.paga_bono ?? false,
      p_desde: v.desde || null,
      p_hasta: v.hasta || null,
      p_nota: v.nota || null,
    }),
  )
}

export function useEliminarVacaciones() {
  return useAccionNomina((id: number) => rpc<void>('eliminar_vacaciones', { p_id: id }))
}

/* ────────────────────────────────────────────────────────────────────────────
   EL LIBRO DE PRÉSTAMOS

   El cálculo ya sabía descontar `DED-PRE`; lo que faltaba era el préstamo.
   Aquí el saldo NO se guarda: sale de `v_prestamos`, que resta los abonos cada
   vez. Guardado se quedaría viejo en cuanto entrara un abono por otra vía, y
   esa vía existe — el trabajador puede pagar por fuera de la nómina.
   ──────────────────────────────────────────────────────────────────────────── */

export interface Prestamo {
  id: number
  empleado_id: number
  ficha: string
  trabajador: string
  fecha: string
  capital: string
  moneda: string
  motivo: string
  /** Lo pactado, que es una intención y no un calendario. */
  cuotas_pactadas: number | null
  estado: 'VIGENTE' | 'SALDADO' | 'ANULADO'
  nota: string | null
  abonado: string
  saldo: string
  abonos: number
  ultimo_abono: string | null
}

export interface AbonoDePrestamo {
  id: number
  prestamo_id: number
  fecha: string
  monto: string
  /** `NOMINA` si se descontó del recibo; `DIRECTO` si lo trajo la persona. */
  origen: 'NOMINA' | 'DIRECTO'
  novedad_id: number | null
  periodo_id: number | null
  nota: string | null
}

export function usePrestamosDeEmpleado(empleadoId: number | undefined) {
  return useQuery({
    enabled: empleadoId !== undefined,
    queryKey: ['nomina', 'prestamos', empleadoId],
    queryFn: async () =>
      desenvolver<Prestamo[]>(
        await supabase
          .from('v_prestamos')
          .select('*')
          .eq('empleado_id', empleadoId!)
          .order('fecha', { ascending: false }),
      ),
  })
}

export function useAbonosDePrestamo(prestamoId: number | undefined) {
  return useQuery({
    enabled: prestamoId !== undefined,
    queryKey: ['nomina', 'prestamo-abonos', prestamoId],
    queryFn: async () =>
      desenvolver<AbonoDePrestamo[]>(
        await supabase
          .from('prestamo_abonos')
          .select('*')
          .eq('prestamo_id', prestamoId!)
          .order('fecha'),
      ),
  })
}

export function useRegistrarPrestamo() {
  return useAccionNomina((p: {
    empleado_id: number
    capital: number
    motivo: string
    fecha?: string | null
    moneda?: string
    cuotas?: number | null
    nota?: string | null
  }) =>
    rpc<number>('registrar_prestamo', {
      p_empleado_id: p.empleado_id,
      p_capital: p.capital,
      p_motivo: p.motivo,
      p_fecha: p.fecha || null,
      p_moneda: p.moneda ?? 'VES',
      p_cuotas: p.cuotas ?? null,
      p_nota: p.nota || null,
    }),
  )
}

/**
 * Cobra una cuota por nómina.
 *
 * Escribe el renglón del recibo Y el abono que baja el saldo, en la misma
 * transacción. Es lo que impide que un préstamo se cobre dos veces por dos
 * caminos distintos.
 */
export function useCobrarCuota() {
  return useAccionNomina((c: {
    prestamo_id: number
    monto: number
    periodo_id?: number | null
    nota?: string | null
  }) =>
    rpc<number>('cobrar_cuota_de_prestamo', {
      p_prestamo_id: c.prestamo_id,
      p_monto: c.monto,
      p_periodo_id: c.periodo_id ?? null,
      p_nota: c.nota || null,
    }),
  )
}

/** Un pago que trae el propio trabajador, por fuera de la nómina. */
export function useAbonarPrestamo() {
  return useAccionNomina((a: {
    prestamo_id: number
    monto: number
    fecha?: string | null
    nota?: string | null
  }) =>
    rpc<number>('abonar_prestamo', {
      p_prestamo_id: a.prestamo_id,
      p_monto: a.monto,
      p_fecha: a.fecha || null,
      p_nota: a.nota || null,
    }),
  )
}

export function useAnularPrestamo() {
  return useAccionNomina((a: { id: number; motivo: string }) =>
    rpc<void>('anular_prestamo', { p_id: a.id, p_motivo: a.motivo }),
  )
}

/**
 * Marca o desmarca a alguien como eventual.
 *
 * Aparte de `useGuardarEmpleado` a propósito: esto decide si una persona entra
 * o no en la nómina del ciclo, y no puede pasar de refilón al guardar la ficha.
 * La base además lo rechaza si hay un período sin cerrar que ya la recogió.
 */
export function useMarcarEventual() {
  return useAccionNomina((e: { id: number; eventual: boolean }) =>
    rpc<boolean>('marcar_empleado_eventual', { p_id: e.id, p_eventual: e.eventual }),
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   LA CARGA FAMILIAR Y LA SALUD

   Dos tablas hijas de `empleados`, cada una con N filas por persona. Se leen
   con el permiso de Nómina —nunca abiertas— porque llevan lo más sensible que
   guarda esta base: condiciones de salud, y nombres y fechas de nacimiento de
   posibles menores.

   Se escriben por función, como todo lo demás aquí: no hay policies de
   escritura en ninguna tabla de este sistema.
   ──────────────────────────────────────────────────────────────────────────── */

export interface Parentesco {
  codigo: string
  nombre: string
  orden: number
  activo: boolean
}

export interface TipoCondicionSalud {
  codigo: string
  nombre: string
  orden: number
  activo: boolean
}

export interface FamiliarDeEmpleado {
  id: number
  empleado_id: number
  nombres: string
  apellidos: string
  parentesco: string
  /** La fecha, no la edad: una edad guardada es falsa a los doce meses. */
  fecha_nacimiento: string | null
  /** Opcional a propósito — los menores no la tienen. */
  cedula: string | null
  depende: boolean
  nota: string | null
  creado_en: string
}

export interface CondicionDeSalud {
  id: number
  empleado_id: number
  tipo: string
  descripcion: string
  detalle: string | null
  desde: string | null
  creado_en: string
}

/** Lo que preguntan los filtros de Personal, ya contado por la base. */
export interface CargasDeEmpleado {
  empleado_id: number
  familiares: number
  dependientes: number
  tiene_carga_familiar: boolean
  tiene_dependientes: boolean
  condiciones_salud: number
  tiene_condicion_salud: boolean
}

/**
 * Los años cumplidos a día de hoy, o `null` si no se sabe la fecha.
 *
 * Se calcula al enseñar y no se guarda, que es el motivo de que la tabla tenga
 * `fecha_nacimiento` y no `edad`. Cuenta el cumpleaños: restar los años sin
 * mirar el mes daría un año de más a casi la mitad de la gente.
 */
export function edadEnAnios(fechaNacimiento: string | null): number | null {
  if (!fechaNacimiento) return null
  const nace = new Date(`${fechaNacimiento}T00:00:00`)
  if (Number.isNaN(nace.getTime())) return null
  const hoy = new Date()
  let anios = hoy.getFullYear() - nace.getFullYear()
  const mes = hoy.getMonth() - nace.getMonth()
  if (mes < 0 || (mes === 0 && hoy.getDate() < nace.getDate())) anios -= 1
  return anios < 0 ? null : anios
}

export function useParentescos() {
  return useQuery({
    queryKey: ['nomina', 'parentescos'],
    queryFn: async () =>
      desenvolver<Parentesco[]>(
        await supabase.from('parentescos').select('*').eq('activo', true).order('orden'),
      ),
  })
}

export function useTiposCondicionSalud() {
  return useQuery({
    queryKey: ['nomina', 'tipos-condicion-salud'],
    queryFn: async () =>
      desenvolver<TipoCondicionSalud[]>(
        await supabase.from('tipos_condicion_salud').select('*').eq('activo', true).order('orden'),
      ),
  })
}

export function useFamiliaresDeEmpleado(empleadoId: number | undefined) {
  return useQuery({
    enabled: empleadoId !== undefined,
    queryKey: ['nomina', 'familiares', empleadoId],
    queryFn: async () =>
      desenvolver<FamiliarDeEmpleado[]>(
        await supabase
          .from('empleado_familiares')
          .select('*')
          .eq('empleado_id', empleadoId!)
          .order('depende', { ascending: false })
          .order('apellidos'),
      ),
  })
}

export function useGuardarFamiliar() {
  return useAccionNomina((f: {
    id?: number
    empleado_id: number
    nombres: string
    apellidos: string
    parentesco: string
    fecha_nacimiento?: string | null
    cedula?: string | null
    depende?: boolean
    nota?: string | null
  }) =>
    rpc<number>('guardar_familiar_de_empleado', {
      p_id: f.id ?? null,
      p_empleado_id: f.empleado_id,
      p_nombres: f.nombres,
      p_apellidos: f.apellidos,
      p_parentesco: f.parentesco,
      p_fecha_nacimiento: f.fecha_nacimiento || null,
      p_cedula: f.cedula || null,
      p_depende: f.depende ?? false,
      p_nota: f.nota || null,
    }),
  )
}

export function useEliminarFamiliar() {
  return useAccionNomina((id: number) =>
    rpc<void>('eliminar_familiar_de_empleado', { p_id: id }),
  )
}

export function useSaludDeEmpleado(empleadoId: number | undefined) {
  return useQuery({
    enabled: empleadoId !== undefined,
    queryKey: ['nomina', 'salud', empleadoId],
    queryFn: async () =>
      desenvolver<CondicionDeSalud[]>(
        await supabase
          .from('empleado_salud')
          .select('*')
          .eq('empleado_id', empleadoId!)
          .order('tipo'),
      ),
  })
}

export function useGuardarCondicionDeSalud() {
  return useAccionNomina((c: {
    id?: number
    empleado_id: number
    tipo: string
    descripcion: string
    detalle?: string | null
    desde?: string | null
  }) =>
    rpc<number>('guardar_condicion_de_salud', {
      p_id: c.id ?? null,
      p_empleado_id: c.empleado_id,
      p_tipo: c.tipo,
      p_descripcion: c.descripcion,
      p_detalle: c.detalle || null,
      p_desde: c.desde || null,
    }),
  )
}

export function useEliminarCondicionDeSalud() {
  return useAccionNomina((id: number) =>
    rpc<void>('eliminar_condicion_de_salud', { p_id: id }),
  )
}

/**
 * Las cargas de todos, para filtrar la lista de personal.
 *
 * Una consulta y no una por persona: la pantalla filtra sobre 32 fichas y
 * pedir 32 cuentas separadas sería 32 viajes para contestar una pregunta que
 * la vista ya contesta de una vez.
 */
export function useCargasDeEmpleados() {
  return useQuery({
    queryKey: ['nomina', 'cargas'],
    queryFn: async () =>
      desenvolver<CargasDeEmpleado[]>(await supabase.from('v_empleado_cargas').select('*')),
  })
}

export function useGuardarEncuadre() {
  return useAccionNomina((e: { empleado_id: number; zoom: number; x: number; y: number }) =>
    rpc<string | null>('guardar_foto_empleado', {
      p_id: e.empleado_id,
      p_path: null,
      p_zoom: e.zoom,
      p_x: e.x,
      p_y: e.y,
    }),
  )
}

export function useQuitarFoto() {
  return useAccionNomina(async (p: { empleado_id: number }) => {
    const anterior = await rpc<string | null>('quitar_foto_empleado', { p_id: p.empleado_id })
    if (anterior) await supabase.storage.from(BUCKET_FOTOS).remove([anterior])
  })
}

/**
 * La foto, lista para pintar.
 *
 * Se descarga como archivo y se envuelve en una URL de objeto en vez de pedir
 * una URL firmada. Una URL firmada apunta a otro dominio y ensucia el lienzo:
 * el navegador prohíbe exportar un canvas que tocó una imagen de otro origen,
 * que es justo lo que hacen los dos botones de esta pantalla. Una URL de objeto
 * es local y nunca lo ensucia.
 */
export function useFoto(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!path) {
      setUrl(null)
      return
    }

    let vigente = true
    let objeto: string | null = null

    void supabase.storage
      .from(BUCKET_FOTOS)
      .download(path)
      .then(({ data }) => {
        if (!vigente || !data) return
        objeto = URL.createObjectURL(data)
        setUrl(objeto)
      })

    return () => {
      vigente = false
      if (objeto) URL.revokeObjectURL(objeto)
    }
  }, [path])

  return url
}

export function useAbrirPeriodo() {
  return useAccionNomina((p: { tipo: string; desde: string; hasta: string; descripcion?: string }) =>
    rpc<number>('abrir_periodo', {
      p_tipo: p.tipo,
      p_desde: p.desde,
      p_hasta: p.hasta,
      p_descripcion: p.descripcion || null,
    }),
  )
}

export function useCalcularNomina() {
  return useAccionNomina((p: { periodo_id: number }) =>
    rpc<number>('calcular_nomina', { p_periodo_id: p.periodo_id }),
  )
}

export function useAprobarNomina() {
  return useAccionNomina((p: { periodo_id: number }) =>
    rpc('aprobar_nomina', { p_periodo_id: p.periodo_id }),
  )
}

export function useAnularPeriodo() {
  return useAccionNomina((p: { periodo_id: number; motivo: string }) =>
    rpc('anular_periodo_nomina', { p_periodo_id: p.periodo_id, p_motivo: p.motivo }),
  )
}

export function usePagarNomina() {
  return useAccionNomina(
    (p: { periodo_id: number; cuenta_id: number; referencia?: string; fecha?: string }) =>
      rpc<number>('pagar_nomina', {
        p_periodo_id: p.periodo_id,
        p_cuenta_id: p.cuenta_id,
        p_referencia: p.referencia || null,
        p_fecha: p.fecha || null,
      }),
  )
}

/*
  LAS FALTAS SE SEÑALAN POR DIA

  La lider: «que permita indicar si no trabajo algun dia para descontarlo, que
  pueda escoger los dias que falto y se le descuente».

  Antes se tecleaba un numero —«2»— en una casilla. Un 2 no se puede discutir el
  dia del reclamo: no dice que dias, ni quien lo escribio, ni cuando. Dos fechas
  señaladas si, y quedan en la auditoria con su autor.

  El numero sigue existiendo en nomina_novedades porque es de donde lee
  calcular_nomina, pero lo mantiene la base sola al marcar y desmarcar. Aqui no
  se toca nunca.
*/
export interface FaltaDelPeriodo {
  empleado_id: number
  fecha: string
  tipo: 'INJUSTIFICADA' | 'JUSTIFICADA'
  motivo: string | null
  quien: string | null
}

export function useFaltas(periodoId: number | undefined) {
  return useQuery({
    queryKey: ['nomina', 'faltas', periodoId],
    enabled: periodoId !== undefined,
    queryFn: () => rpc<FaltaDelPeriodo[]>('faltas_del_periodo', { p_periodo_id: periodoId }),
  })
}

export function useMarcarFalta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: {
      periodo_id: number
      empleado_id: number
      fecha: string
      /** Nulo limpia el dia. */
      tipo: 'INJUSTIFICADA' | 'JUSTIFICADA' | null
      motivo?: string | null
    }) =>
      rpc('marcar_falta', {
        p_periodo_id: v.periodo_id,
        p_empleado_id: v.empleado_id,
        p_fecha: v.fecha,
        p_tipo: v.tipo,
        p_motivo: v.motivo ?? null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['nomina', 'faltas'] })
      // Las novedades tambien: la base acaba de rehacerles el contador.
      void qc.invalidateQueries({ queryKey: ['nomina', 'novedades'] })
    },
  })
}

export function useGuardarNovedad() {
  return useAccionNomina(
    (n: {
      periodo_id: number
      empleado_id: number
      he_diurnas?: number
      he_nocturnas?: number
      horas_nocturnas?: number
      feriados?: number
      descansos?: number
      faltas_inj?: number
      faltas_just?: number
      nota?: string
    }) =>
      rpc<number>('guardar_novedad', {
        p_periodo_id: n.periodo_id,
        p_empleado_id: n.empleado_id,
        p_he_diurnas: n.he_diurnas ?? 0,
        p_he_nocturnas: n.he_nocturnas ?? 0,
        p_horas_nocturnas: n.horas_nocturnas ?? 0,
        p_feriados: n.feriados ?? 0,
        p_descansos: n.descansos ?? 0,
        p_faltas_inj: n.faltas_inj ?? 0,
        p_faltas_just: n.faltas_just ?? 0,
        p_nota: n.nota || null,
      }),
  )
}

/**
 * Un bono o un descuento suelto, con cómo y cuándo se paga.
 *
 * La base solo lo deja mientras la nómina no esté pagada ni anulada — «deberán
 * poder editarse en todo momento siempre que la nómina no se haya pagado o
 * cerrado»—, así que la pantalla apaga los botones en esos dos estados para no
 * mandar a nadie a que le digan que no.
 */
export function useGuardarNovedadMonto() {
  return useAccionNomina(
    (n: {
      periodo_id: number
      empleado_id: number
      concepto: string
      monto: number
      moneda?: string
      nota?: string
      metodo_pago?: string | null
      /** Vacío: se paga con la nómina. Con fecha: diferido a ese día. */
      pagar_en?: string | null
    }) =>
      rpc<number>('guardar_novedad_monto', {
        p_periodo_id: n.periodo_id,
        p_empleado_id: n.empleado_id,
        p_concepto: n.concepto,
        p_monto: n.monto,
        p_moneda: n.moneda ?? 'VES',
        p_nota: n.nota || null,
        p_metodo_pago: n.metodo_pago || null,
        p_pagar_en: n.pagar_en || null,
      }),
  )
}

/**
 * Crear o corregir un concepto de novedad — un bono, un descuento.
 *
 * «Desconocemos el motivo o las razones o títulos de estos bonos, por lo tanto
 * lo correcto es permitirle gestionar.» El catálogo era cerrado y sembrado por
 * migración; ahora la parte que se carga a mano cada período se administra
 * desde la pantalla.
 *
 * Los `AUTOMATICO` siguen cerrados y la base se niega a tocarlos: esos los
 * calcula el sistema buscándolos por su código, y apagarlos dejaría el recibo
 * sin una línea que la ley exige.
 */
export function useGuardarConceptoNomina() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (c: {
      codigo: string
      nombre: string
      tipo: 'ASIGNACION' | 'DEDUCCION'
      incide_normal?: boolean
      incide_integral?: boolean
      orden?: number
      base_legal?: string | null
    }) =>
      rpc<string>('guardar_concepto_nomina', {
        p_codigo: c.codigo,
        p_nombre: c.nombre,
        p_tipo: c.tipo,
        p_incide_normal: c.incide_normal ?? false,
        p_incide_integral: c.incide_integral ?? false,
        p_orden: c.orden ?? 500,
        p_base_legal: c.base_legal || null,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['nomina', 'conceptos'] }),
  })
}

/**
 * Apagar o encender un concepto. No se borra.
 *
 * Uno usado en un período viejo no se puede borrar sin dejar recibos
 * huérfanos, y esos recibos son documentos que ya se entregaron. Apagado deja
 * de ofrecerse al cargar novedades y sigue explicando lo que ya está impreso.
 */
export function useCambiarEstadoConcepto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (c: { codigo: string; activo: boolean }) =>
      rpc('cambiar_estado_concepto_nomina', { p_codigo: c.codigo, p_activo: c.activo }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['nomina', 'conceptos'] }),
  })
}

export function useEliminarNovedadMonto() {
  return useAccionNomina((p: { id: number }) =>
    rpc('eliminar_novedad_monto', { p_id: p.id }),
  )
}

export function useGuardarParametro() {
  return useAccionNomina(
    (p: {
      clave: string
      unidad: string
      desde: string
      descripcion: string
      /** Para las unidades numéricas. */
      valor?: number
      /** Solo para la unidad TEXTO. */
      texto?: string
      fuente?: string
    }) =>
      rpc<number>('guardar_parametro_nomina', {
        p_clave: p.clave,
        p_unidad: p.unidad,
        p_desde: p.desde,
        p_descripcion: p.descripcion,
        // La base rechaza la combinación que no toca; aquí no se manda de más.
        p_valor: p.unidad === 'TEXTO' ? null : (p.valor ?? null),
        p_texto: p.unidad === 'TEXTO' ? (p.texto ?? null) : null,
        p_fuente: p.fuente || null,
      }),
  )
}

/**
 * Los interruptores de los conceptos de ley: pone desde un día la lista de los que
 * calcula la nómina.
 *
 * Tiene su puerta propia y no pasa por la de los parámetros: no se teclea. Va la lista
 * entera de los que quedan encendidos, no un interruptor suelto. Lo decide gerencia
 * general, y la base no deja cambiarla por debajo de una nómina aprobada ni por
 * delante de un cambio ya programado.
 */
export function useCambiarConceptosDeLey() {
  return useAccionNomina((p: { conceptos: ConceptoDeLey[]; desde: string }) =>
    rpc<number>('cambiar_conceptos_de_ley', {
      p_conceptos: p.conceptos,
      p_desde: p.desde,
    }),
  )
}

/**
 * Le pone fecha de fin a una cifra legal.
 *
 * No la borra: las nóminas de ese tiempo tienen que poder recalcularse con la
 * cifra que regía entonces, que es lo primero que pide una inspección.
 */
export function useCerrarParametro() {
  return useAccionNomina((p: { id: number; hasta: string }) =>
    rpc('cerrar_parametro_nomina', { p_id: p.id, p_hasta: p.hasta }),
  )
}

/**
 * Borra una vigencia que nunca calculó nada.
 *
 * La base se niega en cuanto hubo una nómina en esas fechas, y lo dice
 * nombrando cuál. Es más estricta de lo necesario a propósito: antes negar un
 * borrado legítimo que permitir uno que descuadre una nómina ya pagada.
 */
export function useEliminarParametro() {
  return useAccionNomina((p: { id: number }) =>
    rpc('eliminar_parametro_nomina', { p_id: p.id }),
  )
}

/**
 * Quién firma por la empresa, hoy.
 *
 * Los parámetros llevan vigencia, así que de cada clave puede haber varias
 * filas; la buena es la que ya empezó y no se ha cerrado. Se lee de la misma
 * consulta que ya trae los parámetros, sin pedir nada nuevo.
 *
 * Los campos sin llenar salen vacíos y el recibo los omite. Un papel con el
 * renglón en blanco se corrige; uno firmado por alguien inventado, no.
 */
export function useFirmaRrhh() {
  const { data, isPending } = useParametros()

  const hoy = new Date().toISOString().slice(0, 10)
  const vigente = (clave: string) => {
    const p = (data ?? []).find(
      (x) =>
        x.clave === clave &&
        x.vigencia_desde <= hoy &&
        (x.vigencia_hasta === null || x.vigencia_hasta >= hoy),
    )
    const v = p?.valor_texto?.trim()

    /*
      "Por definir" es lo que siembra la migración: es un hueco, no un nombre.

      La comparación va sin distinguir mayúsculas porque el sistema normaliza
      todo lo que se guarda: el valor sembrado como "Por definir" hoy está en la
      base como "POR DEFINIR", y con la comparación exacta dejó de reconocerse.
      El resultado es que los recibos de pago llevaban semanas saliendo firmados
      por una persona llamada POR DEFINIR — un hueco disfrazado de nombre, que es
      justo lo que este filtro existía para evitar.
    */
    return !v || v.toLowerCase() === 'por definir' ? '' : v
  }

  return {
    isPending,
    firma: {
      nombre: vigente('RRHH_FIRMA_NOMBRE'),
      cargo: vigente('RRHH_FIRMA_CARGO'),
      cedula: vigente('RRHH_FIRMA_CEDULA'),
    },
  }
}

// ---------------------------------------------------------------------------
// Dotación
//
// Lo que se le ha entregado a cada trabajador: uniformes, botas, casco. No es
// una tabla aparte sino el propio libro de inventario mirado por trabajador —
// una entrega es una salida de almacén a nombre de alguien—, así que descuenta
// existencias y arrastra su costo como cualquier otra salida.
// ---------------------------------------------------------------------------

export interface Dotacion {
  id: number
  numero: string
  fecha: string
  empleado_id: number
  ficha: string
  nombres: string
  apellidos: string
  cargo: string | null
  articulo_id: number
  articulo_codigo: string
  articulo: string
  categoria: string
  cantidad: string
  unidad: string
  costo_usd: string
  valor_usd: string
  almacen_id: number
  almacen: string
  nota: string | null
  registrado_por: string | null
  registrado_en: string
}

export function useDotaciones(empleadoId?: number) {
  return useQuery({
    queryKey: ['nomina', 'dotaciones', empleadoId ?? 'todos'],
    queryFn: async () => {
      let q = supabase.from('v_dotaciones').select('*').order('fecha', { ascending: false })
      if (empleadoId) q = q.eq('empleado_id', empleadoId)
      return desenvolver<Dotacion[]>(await q)
    },
    enabled: empleadoId === undefined || Number.isFinite(empleadoId),
  })
}

export interface PrendaEntregada {
  articulo_id: number
  cantidad: number
}

/**
 * Entregar varias prendas de una vez, que es como se entregan: el casco, las
 * botas y los guantes salen juntos y se firman en el mismo papel.
 *
 * Invalida también el inventario: la entrega descuenta del almacén, y quien
 * tenga las existencias abiertas en otra pestaña estaría viendo un par de botas
 * que ya no están.
 */
/*
  LA FICHA SIGUE ENTREGANDO, PERO YA NO LO CONSUME TODO

  Llamaba a `entregar_dotacion`, que registra una salida de consumo para cada
  renglón. Con botas y guantes está bien; con un torquímetro no, y la ficha
  ofrecía la categoría HERRAMIENTA entera. Entregar una herramienta desde aquí
  la hacía desaparecer del almacén en vez de dejarla prestada a nombre de nadie.

  Ahora va por `entregar_a_trabajador`, que mira `articulos.modo_entrega` y
  decide por cada renglón: lo retornable queda prestado, lo consumible sale. La
  pantalla no cambia; lo que cambia es que hace lo que dice.
*/
export function useEntregarDotacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: {
      empleado_id: number
      almacen_id: number
      renglones: PrendaEntregada[]
      fecha?: string
      nota?: string
    }) =>
      rpc<{ prestados: number; consumidos: number }>('entregar_a_trabajador', {
        p_empleado_id: d.empleado_id,
        p_almacen_id: d.almacen_id,
        p_renglones: d.renglones,
        p_fecha: d.fecha || null,
        p_nota: d.nota || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['nomina', 'dotaciones'] })
      void qc.invalidateQueries({ queryKey: ['existencias'] })
      void qc.invalidateQueries({ queryKey: ['movimientos'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Lo que le pasa a una persona
// ---------------------------------------------------------------------------

/*
  «Incidencia» significaba dos cosas y ninguna era esta.

  En asignaciones es lo que le pasa a una herramienta —perdida, dañada—. En
  nómina, `faltas_injustificadas` es un número dentro de un período, hecho para
  restar de un pago: no dice cuándo fue, ni por qué, ni si estaba enfermo.

  Esto es el hecho: qué pasó, cuándo, dónde, cuánto duró, con quién y por qué.
*/
export const TIPOS_INCIDENCIA = [
  { valor: 'CONFLICTO', etiqueta: 'Conflicto', reposo: false },
  { valor: 'ENFERMEDAD', etiqueta: 'Enfermedad', reposo: true },
  { valor: 'LESION_LABORAL', etiqueta: 'Lesión en labores', reposo: true },
  { valor: 'ACCIDENTE_COMUN', etiqueta: 'Accidente común', reposo: true },
  { valor: 'AUSENCIA_JUSTIFICADA', etiqueta: 'Ausencia justificada', reposo: true },
  { valor: 'AUSENCIA_INJUSTIFICADA', etiqueta: 'Ausencia injustificada', reposo: true },
  { valor: 'LLEGADA_TARDE', etiqueta: 'Llegada tarde', reposo: false },
  { valor: 'OTRA', etiqueta: 'Otra', reposo: false },
]

export const MOMENTOS_INCIDENCIA = [
  { valor: 'MANANA', etiqueta: 'En la mañana' },
  { valor: 'TARDE', etiqueta: 'En la tarde' },
  { valor: 'NOCHE', etiqueta: 'En la noche' },
  { valor: 'TODO_EL_DIA', etiqueta: 'Todo el día' },
  { valor: 'VARIOS_DIAS', etiqueta: 'Varios días' },
]

export interface Incidencia {
  id: number
  numero: string
  empleado_id: number
  empleado: string
  ficha: string
  fecha: string
  tipo: string
  lugar: string | null
  momento: string
  dias_reposo: string | null
  motivo: string
  nota: string | null
  registrado_en: string
  /** Los demás implicados, con nombre. Vacío es individual. */
  participantes: string[]
  participantes_id: number[]
}

/**
 * Las incidencias de una persona, las suyas y aquellas en las que estuvo.
 *
 * Un conflicto tiene dos lados: sale en la ficha de quien lo protagoniza y en
 * la de quien participó. Verlo solo en una de las dos contaría media historia.
 */
export function useIncidencias(empleadoId?: number) {
  return useQuery({
    queryKey: ['incidencias', empleadoId ?? 'todas'],
    enabled: empleadoId != null,
    queryFn: async () => {
      const propias = desenvolver<Incidencia[]>(
        await supabase
          .from('v_incidencias_personal')
          .select('*')
          .eq('empleado_id', empleadoId!)
          .order('fecha', { ascending: false }),
      )

      const ajenas = desenvolver<Incidencia[]>(
        await supabase
          .from('v_incidencias_personal')
          .select('*')
          .contains('participantes_id', [empleadoId!])
          .order('fecha', { ascending: false }),
      )

      const vistas = new Set(propias.map((i) => i.id))
      return [...propias, ...ajenas.filter((i) => !vistas.has(i.id))].sort((a, b) =>
        a.fecha < b.fecha ? 1 : -1,
      )
    },
  })
}

export interface DotacionEntregada {
  id: number
  numero: string
  empleado_id: number
  fecha: string
  articulo_id: number
  articulo_codigo: string
  articulo: string
  unidad: string
  categoria: string
  cantidad: string
  almacen: string
  nota: string | null
}

/** Lo consumible que se llevó: casco, guantes, botas. No vuelve. */
export function useDotacionEntregada(empleadoId?: number) {
  return useQuery({
    queryKey: ['dotacion-entregada', empleadoId ?? 'todos'],
    enabled: empleadoId != null,
    queryFn: async () =>
      desenvolver<DotacionEntregada[]>(
        await supabase
          .from('v_dotacion_entregada')
          .select('*')
          .eq('empleado_id', empleadoId!)
          .order('fecha', { ascending: false }),
      ),
  })
}

export function useRegistrarIncidencia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (i: {
      empleado_id: number
      fecha: string
      tipo: string
      motivo: string
      lugar?: string | null
      momento?: string
      dias_reposo?: number | null
      participantes?: number[]
      nota?: string | null
    }) =>
      rpc<number>('registrar_incidencia', {
        p_empleado_id: i.empleado_id,
        p_fecha: i.fecha,
        p_tipo: i.tipo,
        p_motivo: i.motivo,
        p_lugar: i.lugar ?? null,
        p_momento: i.momento ?? 'TODO_EL_DIA',
        p_dias_reposo: i.dias_reposo ?? null,
        p_participantes: i.participantes?.length ? i.participantes : null,
        p_nota: i.nota ?? null,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['incidencias'] }),
  })
}

/**
 * La foto de alguien, cargada de una vez y sin hook.
 *
 * `useFoto` sirve para pintar la de UNA ficha abierta. Emitir carnets en tanda
 * necesita cargar veinte, una detrás de otra, dentro de un bucle: para eso un
 * hook no vale — no se pueden llamar en un bucle ni esperar a que resuelvan.
 *
 * Se descarga y se envuelve en una URL de objeto por la misma razón que allí:
 * una URL firmada apunta a otro dominio y ensucia el lienzo, y un lienzo sucio
 * no se puede exportar, que es justo lo que hay que hacer con él.
 */
export async function cargarFoto(path: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!path) return null

  const { data } = await supabase.storage.from(BUCKET_FOTOS).download(path)
  if (!data) return null

  const objeto = URL.createObjectURL(data)
  try {
    const img = new Image()
    img.src = objeto
    await img.decode()
    return img
  } catch {
    // Una foto que el navegador no sabe leer no puede impedir que salga el
    // carnet: sale sin ella, y la página de verificación lo dice.
    return null
  } finally {
    // La imagen ya está decodificada en memoria; la URL puede irse.
    URL.revokeObjectURL(objeto)
  }
}
