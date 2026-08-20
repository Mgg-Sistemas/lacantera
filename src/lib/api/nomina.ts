import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

// ---------------------------------------------------------------------------
// Personal
// ---------------------------------------------------------------------------

export interface Empleado {
  id: number
  /** Cuatro dígitos, correlativo de por vida. La asigna la base, no la pantalla. */
  ficha: string
  cedula: string
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
  nota: string | null
}

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


export function useEmpleados(soloActivos = true) {
  return useQuery({
    queryKey: ['nomina', 'empleados', soloActivos],
    queryFn: async () => {
      let q = supabase.from('empleados').select('*').order('apellidos').order('nombres')
      if (soloActivos) q = q.eq('activo', true)
      return desenvolver<Empleado[]>(await q)
    },
  })
}

export function useEmpleado(id: number | undefined) {
  return useQuery({
    queryKey: ['nomina', 'empleado', id],
    enabled: id !== undefined && Number.isFinite(id),
    queryFn: async () =>
      desenvolver<Empleado>(await supabase.from('empleados').select('*').eq('id', id!).single()),
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
  dias_pagados: string
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
            '*, empleado:empleados(ficha, cedula, nombres, apellidos, cargo, forma_pago, banco, numero_cuenta), lineas:nomina_recibo_lineas(*)',
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

export function useConceptos() {
  return useQuery({
    queryKey: ['nomina', 'conceptos'],
    queryFn: async () =>
      desenvolver<Concepto[]>(
        await supabase.from('nomina_conceptos').select('*').eq('activo', true).order('orden'),
      ),
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

export function useGuardarEmpleado() {
  return useAccionNomina((e: Partial<Empleado> & { salario_base: number | string }) =>
    rpc<number>('guardar_empleado', {
      p_id: e.id ?? null,
      p_cedula: e.cedula,
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

export function useGuardarNovedadMonto() {
  return useAccionNomina(
    (n: {
      periodo_id: number
      empleado_id: number
      concepto: string
      monto: number
      moneda?: string
      nota?: string
    }) =>
      rpc<number>('guardar_novedad_monto', {
        p_periodo_id: n.periodo_id,
        p_empleado_id: n.empleado_id,
        p_concepto: n.concepto,
        p_monto: n.monto,
        p_moneda: n.moneda ?? 'VES',
        p_nota: n.nota || null,
      }),
  )
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
