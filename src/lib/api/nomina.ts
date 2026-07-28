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

export const FORMAS_PAGO = [
  { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia' },
  { valor: 'PAGO_MOVIL', etiqueta: 'Pago móvil' },
  { valor: 'EFECTIVO', etiqueta: 'Efectivo' },
  { valor: 'BINANCE', etiqueta: 'Binance' },
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
  valor: string
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
    }),
  )
}

export function useEgresarEmpleado() {
  return useAccionNomina((e: { id: number; fecha: string; motivo: string }) =>
    rpc('egresar_empleado', { p_id: e.id, p_fecha: e.fecha, p_motivo: e.motivo }),
  )
}

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
      valor: number
      unidad: string
      desde: string
      descripcion: string
      fuente?: string
    }) =>
      rpc<number>('guardar_parametro_nomina', {
        p_clave: p.clave,
        p_valor: p.valor,
        p_unidad: p.unidad,
        p_desde: p.desde,
        p_descripcion: p.descripcion,
        p_fuente: p.fuente || null,
      }),
  )
}
