import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'
import type { HechoDeFicha } from '@/components/Historial'

/**
 * Las máquinas, su horómetro y su paso por el taller.
 *
 * TODO SE ESCRIBE POR `rpc()`
 *
 * Este archivo llegó a ser uno de los dos únicos de `src/lib/api/` que escribía
 * con `.insert()` y `.update()` directos. Ya no: los permisos de escritura
 * sobre estas tablas están revocados y la única puerta son las funciones
 * `security definer` de la base, como en el resto del sistema. No es solo
 * coherencia — con el permiso abierto, cualquiera con sesión podía escribir
 * desde la consola del navegador saltándose todo lo que comprueba la pantalla,
 * y no había un sitio donde poner esas comprobaciones.
 *
 * EL SEMÁFORO NO SE CALCULA AQUÍ
 *
 * Viene de `v_maquinaria`, que lo deriva de los umbrales de cada máquina. Si el
 * front lo recalculara, dos pantallas podrían discrepar sobre si una máquina
 * puede seguir trabajando, y esa es de las cosas que no admiten dos opiniones.
 */

export type Semaforo = 'OK' | 'AVISO' | 'ALARMA' | 'BLOQUEANTE'

export type EstadoMaquina =
  | 'ACTIVA'
  | 'EN_ESPERA'
  | 'EN_MANTENIMIENTO'
  | 'FUERA_DE_SERVICIO'
  | 'DESINCORPORADA'

export interface Maquina {
  id: number
  codigo: string
  /** De quién es. Nulo en filas viejas; la base pone la casa por defecto. */
  propietario?: string
  nombre: string
  tipo: string
  marca: string | null
  modelo: string | null
  serial: string | null
  anio: number | null
  almacen_id: number | null
  almacen: string | null
  almacen_tipo: string | null
  /*
    QUIÉN LA LLEVA.

    Christopher: «una máquina necesita de un conductor, operador o responsable
    para funcionar o trasladarse». Es un cargo, no el turno de ayer: quién la
    condujo un día concreto vive en la lectura del horómetro y en el despacho.
    Nulo es una respuesta válida —una máquina en espera no tiene a nadie.
  */
  operador_id?: number | null
  operador?: string | null
  /*
    QUÉ CLASE DE COSA ES.

    Christopher: «segmentar si es una maquinaria (ej. volvo, chuto,
    retroexcavadora, etc) o vehículo (ej. camioneta)».

    NO se deduce de `tipo`: él llama maquinaria a un chuto —que es un camión— y
    vehículo a una camioneta —que también lo es—, así que el corte no es «tiene
    ruedas» sino para qué está la cosa. Y eso no está escrito en el tipo.
  */
  clase?: ClaseDeMaquina
  estado: EstadoMaquina
  tope_horas: string
  aviso_horas: string
  alarma_horas: string
  /** Cuánto suele tardar su mantenimiento. Nulo si nadie lo ha estimado. */
  dias_mantenimiento: number | null
  /** Qué combustible quema. Nulo mientras no se sepa. */
  combustible_id: number | null
  /** Cuántos litros le caben. Nulo mientras no se sepa. */
  capacidad_combustible: string | null
  foto_path: string | null
  foto_zoom: string
  foto_x: string
  foto_y: string
  nota: string | null
  /** Sale del estado: es «su estado no es DESINCORPORADA». */
  en_la_flota: boolean
  /** Lo que lleva trabajado desde el último mantenimiento cerrado. */
  horas_desde_mant: string
  horas_totales: string
  horas_para_el_tope: string
  ultima_lectura: string | null
  horometro_actual: string | null
  ultimo_mantenimiento: string | null
  /** Cuándo se le arregló algo por última vez. Distinto del mantenimiento. */
  ultima_reparacion: string | null
  reparaciones: number
  semaforo: Semaforo

  /** La orden de taller abierta, si la tiene. */
  mantenimiento_abierto_id: number | null
  mantenimiento_abierto_tipo: TipoOrden | null
  mantenimiento_desde: string | null
  mantenimiento_taller_id: number | null
  dias_en_taller: number | null
  /** Si lleva más días dentro de los estimados. Nulo si nadie estimó nada. */
  se_paso_en_el_taller: boolean | null
}

export interface Lectura {
  id: number
  maquina_id: number
  fecha: string
  inicial: string
  final: string
  horas: string
  operador_id: number | null
  nota: string | null
}

export type EstadoOrden = 'ABIERTO' | 'CERRADO' | 'ANULADO'

/**
 * Por qué está el equipo en el taller.
 *
 * Los tres pasan por el mismo sitio y descuentan repuestos igual. Lo que los
 * separa es lo que arrastran al cerrar: solo MANTENIMIENTO reinicia el
 * contador de horas. Una reparación arregla algo que se dañó, y arreglar una
 * correa rota no adelanta el cambio de aceite.
 */
/*
  Los dos ultimos solo tienen sentido sobre MATERIAL: una varilla se rectifica y
  una pieza se fabrica, pero a una excavadora no se le hace ninguna de las dos.
  Van en la misma lista porque son la misma tabla y el mismo taller.
*/
export type TipoOrden =
  | 'MANTENIMIENTO'
  | 'SERVICIO'
  | 'REPARACION'
  | 'RECTIFICACION'
  | 'FABRICACION'

export interface Mantenimiento {
  id: number
  numero: string | null
  maquina_id: number
  maquina_codigo: string
  maquina: string
  maquina_tipo: string
  tipo: TipoOrden
  estado: EstadoOrden
  /** Por qué entró. Se pide al abrir. */
  motivo: string | null
  /** Qué se le hizo. Se pide al cerrar. */
  detalle: string | null
  /** El día que entró al taller. */
  fecha: string
  fecha_salida: string | null
  dias_estimados: number | null
  /** Días dentro: los que lleva si sigue abierta, los que tardó si cerró. */
  dias: number | null
  horometro: string | null
  taller_id: number | null
  taller: string | null
  costo_usd: string | null
  costo_repuestos_usd: string
  costo_total_usd: string
  repuestos: number
  motivo_anulacion: string | null
  registrado_en: string
}

export interface RepuestoUsado {
  articulo_id: number
  cantidad: number
}

export const TIPOS_MAQUINA = [
  { valor: 'EXCAVADORA', etiqueta: 'Excavadora' },
  { valor: 'CARGADOR', etiqueta: 'Cargador' },
  { valor: 'CAMION', etiqueta: 'Camión' },
  { valor: 'PLANTA', etiqueta: 'Planta' },
  { valor: 'PERFORADORA', etiqueta: 'Perforadora' },
  { valor: 'VEHICULO', etiqueta: 'Vehículo' },
  { valor: 'GENERADOR', etiqueta: 'Generador' },
  { valor: 'OTRO', etiqueta: 'Otro' },
]

/**
 * Los estados, con lo que significa cada uno.
 *
 * EN_MANTENIMIENTO no está en la lista que se ofrece para elegir: a ese estado
 * se entra abriendo la orden de taller y se sale cerrándola. Ofrecerlo aquí
 * sería una puerta lateral que se salta el contador de horas y el descuento de
 * repuestos.
 */
export const ESTADOS_MAQUINA = [
  { valor: 'ACTIVA', etiqueta: 'Activa', detalle: 'Trabajando o asignada a un frente.' },
  { valor: 'EN_ESPERA', etiqueta: 'En espera', detalle: 'Sana y disponible, sin asignar.' },
  {
    valor: 'FUERA_DE_SERVICIO',
    etiqueta: 'Fuera de servicio',
    detalle: 'Averiada o parada sin fecha. No se puede mandar a trabajar.',
  },
  {
    valor: 'DESINCORPORADA',
    etiqueta: 'Desincorporada',
    detalle: 'Ya no es de la flota. Se conserva por su historial.',
  },
]

export type ClaseDeMaquina = 'MAQUINA' | 'VEHICULO' | 'EQUIPO'

/*
  EQUIPO existe para lo que no es ninguna de las dos —una planta eléctrica, un
  generador— y está para que nadie tenga que meterlo a la fuerza en otra. Un
  generador clasificado como «vehículo» rompería el conteo.
*/
export const CLASES_DE_MAQUINA: { valor: ClaseDeMaquina; etiqueta: string; pista: string }[] = [
  { valor: 'MAQUINA', etiqueta: 'Maquinaria', pista: 'Trabaja en la mina: un volvo, un chuto, una retroexcavadora' },
  { valor: 'VEHICULO', etiqueta: 'Vehículo', pista: 'Lleva gente y encargos: una camioneta' },
  { valor: 'EQUIPO', etiqueta: 'Equipo', pista: 'Ni una cosa ni la otra: una planta, un generador' },
]

export const ETIQUETA_CLASE: Record<ClaseDeMaquina, string> = {
  MAQUINA: 'Maquinaria',
  VEHICULO: 'Vehículo',
  EQUIPO: 'Equipo',
}

export const ETIQUETA_ESTADO: Record<EstadoMaquina, string> = {
  ACTIVA: 'Activa',
  EN_ESPERA: 'En espera',
  EN_MANTENIMIENTO: 'En el taller',
  FUERA_DE_SERVICIO: 'Fuera de servicio',
  DESINCORPORADA: 'Desincorporada',
}

// ---------------------------------------------------------------------------
// Leer
// ---------------------------------------------------------------------------

/**
 * Las máquinas.
 *
 * `enLaFlota` filtra las desincorporadas. Antes esto miraba una columna
 * `activa` que ninguna función escribía, así que desincorporar una máquina la
 * dejaba en la lista para siempre. Ahora se deriva del estado y no puede
 * volver a contradecirlo.
 */
export function useMaquinaria(enLaFlota = true) {
  return useQuery({
    queryKey: ['maquinaria', enLaFlota],
    queryFn: async () => {
      let q = supabase.from('v_maquinaria').select('*').order('codigo')
      if (enLaFlota) q = q.eq('en_la_flota', true)
      return desenvolver<Maquina[]>(await q)
    },
  })
}

export function useLecturas(maquinaId: number | null) {
  return useQuery({
    queryKey: ['maquinaria', 'lecturas', maquinaId],
    enabled: maquinaId !== null,
    queryFn: async () =>
      desenvolver<Lectura[]>(
        await supabase
          .from('horometro_lecturas')
          .select('*')
          .eq('maquina_id', maquinaId!)
          .order('fecha', { ascending: false })
          .limit(60),
      ),
  })
}

export function useMantenimientos(maquinaId: number | null) {
  return useQuery({
    queryKey: ['maquinaria', 'mantenimientos', maquinaId],
    enabled: maquinaId !== null,
    queryFn: async () =>
      desenvolver<Mantenimiento[]>(
        await supabase
          .from('v_mantenimientos')
          .select('*')
          .eq('maquina_id', maquinaId!)
          .order('fecha', { ascending: false })
          .limit(60),
      ),
  })
}

/**
 * Lo reparado en un taller, sea de la máquina que sea.
 *
 * Es la otra mitad de lo que hace un taller: la primera es lo que tiene
 * asignado en inventario, y esta es en qué lo gastó.
 */
export function useMantenimientosDeTaller(tallerId: number | null) {
  return useQuery({
    queryKey: ['maquinaria', 'mantenimientos-taller', tallerId],
    enabled: tallerId !== null,
    queryFn: async () =>
      desenvolver<Mantenimiento[]>(
        await supabase
          .from('v_mantenimientos')
          .select('*')
          .eq('taller_id', tallerId!)
          .order('fecha', { ascending: false })
          .limit(40),
      ),
  })
}

/** El reporte de taller entero, para la pantalla de historial. */
export function useReporteMantenimientos(estado?: EstadoOrden) {
  return useQuery({
    queryKey: ['maquinaria', 'reporte', estado ?? 'todo'],
    queryFn: async () => {
      let q = supabase
        .from('v_mantenimientos')
        .select('*')
        .order('fecha', { ascending: false })
        .limit(300)
      if (estado) q = q.eq('estado', estado)
      return desenvolver<Mantenimiento[]>(await q)
    },
  })
}

/** Los repuestos que se le pusieron a una orden. */
export function useRepuestosDeOrden(ordenId: number | null) {
  return useQuery({
    queryKey: ['maquinaria', 'repuestos', ordenId],
    enabled: ordenId !== null,
    queryFn: async () =>
      desenvolver<
        Array<{ id: number; articulo_id: number; cantidad: string; costo_usd: string }>
      >(
        await supabase
          .from('mantenimiento_repuestos')
          .select('id, articulo_id, cantidad, costo_usd')
          .eq('mantenimiento_id', ordenId!),
      ),
  })
}

/**
 * Lo que hay que atender.
 *
 * Se resuelve aquí y no en cada pantalla para que el Panel, el tablero y el
 * aviso de la barra cuenten lo mismo. Ordenado por gravedad y, dentro de cada
 * nivel, por lo que lleva más horas de más: si hay tres bloqueadas, la que peor
 * está va primero.
 */
export function useMaquinasQueUrgen() {
  const consulta = useMaquinaria(true)
  const orden: Record<Semaforo, number> = { BLOQUEANTE: 0, ALARMA: 1, AVISO: 2, OK: 3 }

  const urgentes = (consulta.data ?? [])
    .filter((m) => m.semaforo !== 'OK')
    .sort(
      (a, b) =>
        orden[a.semaforo] - orden[b.semaforo] ||
        Number(b.horas_desde_mant) - Number(a.horas_desde_mant),
    )

  return { ...consulta, urgentes }
}

// ---------------------------------------------------------------------------
// Escribir — todo por función de la base
// ---------------------------------------------------------------------------

/*
  Se hizo generico tambien en lo que DEVUELVE. Antes prometia `unknown`, y con
  eso cualquier hook que necesitara su resultado —el que sube las fotos del alta
  devuelve las rutas— tenia que forzarlo con un molde. Un molde es una promesa
  que el compilador deja de comprobar, y aqui no hace falta ninguna.
*/
function useAccion<A, R = unknown>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['maquinaria'] })
      // Cerrar una orden con repuestos descuenta del taller: el inventario que
      // se esté mirando en otra pestaña ya no es el que hay.
      void qc.invalidateQueries({ queryKey: ['existencias'] })
      void qc.invalidateQueries({ queryKey: ['existencias-totales'] })
      /*
        Y LA FICHA, QUE ES DONDE SE MIRA LO QUE PASÓ.

        Nadie invalidaba esta clave. Anotar el horómetro o cerrar una orden
        dejaba el historial de la ficha con lo de antes hasta recargar la
        página, y el hecho recién anotado no aparecía — que es justo el que se
        acaba de mirar. Apareció al montar los agregados, pero venía de antes.
      */
      void qc.invalidateQueries({ queryKey: ['historial-maquina'] })
      void qc.invalidateQueries({ queryKey: ['agregados-maquina'] })
    },
  })
}

export function useGuardarMaquina() {
  return useAccion(
    async (m: {
      id?: number | null
      codigo: string
      nombre: string
      tipo: string
      marca?: string | null
      modelo?: string | null
      serial?: string | null
      anio?: number | null
      almacen_id?: number | null
      tope_horas: number
      aviso_horas: number
      alarma_horas: number
      dias_mantenimiento?: number | null
      combustible_id?: number | null
      capacidad_combustible?: number | null
      nota?: string | null
      /*
        DE QUIÉN ES LA MÁQUINA.

        Christopher: «este mismo aspecto se aplica también para las máquinas (ej.
        algún volvo, chuto con volqueta)». Nulo deja el que tenga; en un alta, la
        base pone la casa.
      */
      propietario?: string | null
      /*
        EL ESTADO CON EL QUE NACE. Christopher: «se desean registrar maquinas que
        no estan activas». Solo se atiende en el alta: cambiarlo despues es un
        hecho que `cambiar_estado_maquina` obliga a explicar con un motivo.
      */
      estado?: string | null
      /*
        LAS FOTOS DEL ALTA, ya subidas al almacen de ficheros. Van como rutas y
        no como ficheros porque la base cuenta cuantas hay y las anota; los
        megabytes viajan por su propia tuberia, no por una funcion.
      */
      fotos?: { path: string; nota?: string | null }[] | null
      /*
        QUIÉN LA CONDUCE U OPERA. Christopher: «una máquina necesita de un
        conductor, operador o responsable para funcionar o trasladarse».

        Viaja TAL CUAL y no con `?? null` que signifique «déjalo igual»: soltar
        el puesto es una decisión, y la base lo escribe sin coalesce justamente
        para que se pueda dejar en nadie.
      */
      operador_id?: number | null
      /** Maquinaria, vehículo o equipo. Nulo deja la que tenga. */
      clase?: string | null
    }) =>
      rpc<number>('guardar_maquina', {
        p_id: m.id ?? null,
        p_codigo: m.codigo,
        p_nombre: m.nombre,
        p_tipo: m.tipo,
        p_marca: m.marca ?? null,
        p_modelo: m.modelo ?? null,
        p_serial: m.serial ?? null,
        p_anio: m.anio ?? null,
        p_almacen_id: m.almacen_id ?? null,
        p_tope_horas: m.tope_horas,
        p_aviso_horas: m.aviso_horas,
        p_alarma_horas: m.alarma_horas,
        p_dias_mantenimiento: m.dias_mantenimiento ?? null,
        p_nota: m.nota ?? null,
        p_combustible_id: m.combustible_id ?? null,
        p_capacidad_combustible: m.capacidad_combustible ?? null,
        p_propietario: m.propietario ?? null,
        p_estado: m.estado ?? null,
        p_fotos: m.fotos && m.fotos.length > 0 ? m.fotos : null,
        p_operador_id: m.operador_id ?? null,
        p_clase: m.clase ?? null,
      }),
  )
}

/**
 * Anotar el horómetro del día.
 *
 * La función reemplaza la lectura si ya hay una de ese día: anotarla al
 * arrancar y completarla al terminar el turno es lo normal, y sin eso el
 * segundo intento chocaría contra la restricción de una lectura por día.
 */
/**
 * Todo lo que le ha pasado a una máquina, en un solo hilo.
 *
 * La ficha era hasta hoy un formulario puro: decía qué ES la máquina y nada de
 * lo que le había pasado. El combustible vivía en Combustible, las horas en un
 * modal de la lista, y los pasos por el taller en Mantenimientos — para saber
 * qué le habían hecho a la excavadora había que abrir tres pantallas y juntarlo
 * de cabeza.
 *
 * `historial_maquina` estaba escrita desde ayer y no la llamaba nadie. Y no
 * corría: al ejecutarla daba «column h.cuando does not exist». Aplicada y nunca
 * probada, que es la forma más cara de dar algo por hecho.
 */
export function useHistorialMaquina(maquinaId: number | null) {
  return useQuery({
    queryKey: ['historial-maquina', maquinaId],
    enabled: maquinaId != null,
    queryFn: () =>
      rpc<HechoDeFicha[]>('historial_maquina', {
        p_maquina_id: maquinaId,
        p_limite: 200,
      }),
  })
}

/*
  LO QUE LA MÁQUINA LLEVA ENCIMA.

  Christopher: «debemos permitir que las máquinas puedan modificarse (añadir
  elementos o incluir características adicionales, ej. antenas Starlink, cauchos
  especiales, etc), eso estará incluido en el historial de la máquina».

  No es un repuesto. Un repuesto REPONE algo que la máquina ya tenía y contesta
  «cuánto me ha costado mantenerla»; un agregado AÑADE algo que no tenía y
  contesta «qué lleva encima ahora mismo» — la pregunta que se hace al mandarla a
  una faena o al devolvérsela a su dueño.
*/
export interface Agregado {
  id: number
  maquina_id: number
  nombre: string
  /*
    POR QUÉ SE MODIFICÓ. Christopher: «cuando se realiza la modificación de la
    máquina, es importante indicar quién lo hizo o la razón de por qué se
    modificó». Obligatorio: dentro de un año, «tiene una antena» no explica nada
    y «se le puso para tener señal en el frente norte» explica si sigue haciendo
    falta.
  */
  motivo: string
  /*
    QUIÉN HIZO EL TRABAJO, que no es quien lo anotó. Texto libre y opcional: el
    taller de la esquina y el proveedor no tienen ficha de nómina, y a veces la
    máquina llega con la antena ya puesta y de verdad no se sabe.
  */
  hecho_por: string | null
  articulo_id: number | null
  /*
    DE QUÉ ALMACÉN SALIÓ, SI SALIÓ DE ALGUNO.

    Christopher: «la antena puede no ser descontada, pero tampoco podrá estar
    disponible». Cuando esto tiene valor, el agregado DESCONTÓ de verdad y
    `movimiento_id` apunta al asiento. Nulo es una respuesta legítima: lo
    comprado afuera nunca pasó por un estante.
  */
  almacen_id: number | null
  movimiento_id: number | null
  serial: string | null
  cantidad: string | null
  fecha: string
  costo_usd: string | null
  /** El unitario con el que salió, para devolverlo al mismo si vuelve. */
  costo_unitario: string | null
  nota: string | null
  retirado_el: string | null
  motivo_retiro: string | null
  /** A qué almacén volvió al quitarlo, si volvió. */
  destino_id: number | null
}

export function useAgregadosDeMaquina(maquinaId: number | null) {
  return useQuery({
    queryKey: ['agregados-maquina', maquinaId],
    enabled: maquinaId != null,
    queryFn: async () =>
      desenvolver<Agregado[]>(
        await supabase
          .from('maquina_agregados')
          .select(
            'id, maquina_id, nombre, motivo, hecho_por, articulo_id, almacen_id, movimiento_id, serial, cantidad, fecha, costo_usd, costo_unitario, nota, retirado_el, motivo_retiro, destino_id',
          )
          .eq('maquina_id', maquinaId!)
          // Lo que sigue puesto arriba: es lo que se viene a mirar. Lo quitado
          // queda debajo, en orden de cuándo se puso.
          .order('retirado_el', { ascending: true, nullsFirst: true })
          .order('fecha', { ascending: false }),
      ),
  })
}

export function useMontarAgregado() {
  return useAccion(
    async (a: {
      maquina_id: number
      nombre: string
      /** Obligatorio. La base lo exige con al menos cuatro letras. */
      motivo: string
      /** Quién hizo el trabajo. Opcional: a veces no se sabe. */
      hecho_por?: string | null
      articulo_id?: number | null
      /*
        DE QUÉ ALMACÉN SALE. Con esto la base descuenta de verdad —cerrojo,
        comprobación y asiento al costo promedio— porque lo montado no puede
        seguir disponible. Sin esto no se mueve nada.
      */
      almacen_id?: number | null
      serial?: string | null
      cantidad?: number | null
      fecha?: string | null
      costo_usd?: number | null
      nota?: string | null
    }) =>
      rpc<number>('montar_agregado', {
        p_maquina_id: a.maquina_id,
        p_nombre: a.nombre,
        p_motivo: a.motivo,
        p_hecho_por: a.hecho_por ?? null,
        p_articulo_id: a.articulo_id ?? null,
        p_almacen_id: a.almacen_id ?? null,
        p_serial: a.serial ?? null,
        p_cantidad: a.cantidad ?? null,
        p_fecha: a.fecha ?? null,
        p_costo_usd: a.costo_usd ?? null,
        p_nota: a.nota ?? null,
      }),
  )
}

/** Se quita, no se borra: el historial se quedaría sin la mitad de la historia. */
export function useRetirarAgregado() {
  return useAccion(
    async (a: {
      id: number
      motivo: string
      fecha?: string | null
      /** A qué almacén vuelve. Sin esto no vuelve a contarse: se gastó, se pasó
       *  a otra máquina, se lo llevó su dueño. */
      destino_id?: number | null
    }) =>
      rpc<number>('retirar_agregado', {
        p_id: a.id,
        p_motivo: a.motivo,
        p_fecha: a.fecha ?? null,
        p_destino_id: a.destino_id ?? null,
      }),
  )
}

export function useGuardarLectura() {
  return useAccion(
    async (l: { maquina_id: number; fecha: string; inicial: number; final: number }) =>
      rpc<number>('registrar_lectura', {
        p_maquina_id: l.maquina_id,
        p_fecha: l.fecha,
        p_inicial: l.inicial,
        p_final: l.final,
      }),
  )
}

/** La máquina entra al taller. */
export function useAbrirMantenimiento() {
  return useAccion(
    async (m: {
      maquina_id?: number | null
      tipo: TipoOrden
      motivo: string
      taller_id?: number | null
      fecha?: string | null
      dias_estimados?: number | null
      /** Sobre material en vez de sobre una maquina. */
      articulo_id?: number | null
      cantidad?: number | null
      /** De que almacen sale el material. Obligatorio si es material. */
      origen_id?: number | null
      urgencia?: Urgencia
      especialidad?: string | null
      /** Lo que se preve usar. No descuenta nada hasta cerrar. */
      repuestos?: Array<{ articulo_id: number; cantidad: number }>
    }) =>
      rpc<number>('abrir_mantenimiento', {
        p_maquina_id: m.maquina_id ?? null,
        p_tipo: m.tipo,
        p_motivo: m.motivo,
        p_taller_id: m.taller_id ?? null,
        p_fecha: m.fecha ?? null,
        p_dias_estimados: m.dias_estimados ?? null,
        p_articulo_id: m.articulo_id ?? null,
        p_cantidad: m.cantidad ?? null,
        p_origen_id: m.origen_id ?? null,
        p_urgencia: m.urgencia ?? 'NORMAL',
        p_especialidad: m.especialidad ?? null,
        p_repuestos: m.repuestos ?? [],
      }),
  )
}

/** La máquina sale del taller, y sale a espera salvo que se diga otra cosa. */
export function useCerrarMantenimiento() {
  return useAccion(
    async (m: {
      id: number
      detalle: string
      costo_usd?: number | null
      repuestos?: RepuestoUsado[]
      estado_salida?: 'EN_ESPERA' | 'ACTIVA' | 'FUERA_DE_SERVICIO'
      fecha_salida?: string | null
      /** Cuanto material volvio. Lo que falte se registra como merma. */
      devuelto?: number | null
      /** A que almacen vuelve. Obligatorio si la orden era sobre material. */
      destino_id?: number | null
    }) =>
      rpc<number>('cerrar_mantenimiento', {
        p_id: m.id,
        p_detalle: m.detalle,
        p_costo_usd: m.costo_usd ?? null,
        p_repuestos: m.repuestos ?? [],
        p_estado_salida: m.estado_salida ?? 'EN_ESPERA',
        p_devuelto: m.devuelto ?? null,
        p_destino_id: m.destino_id ?? null,
        p_fecha_salida: m.fecha_salida ?? null,
      }),
  )
}

export function useAnularMantenimiento() {
  return useAccion(async (m: { id: number; motivo: string }) =>
    rpc<number>('anular_mantenimiento', { p_id: m.id, p_motivo: m.motivo }),
  )
}

export function useCambiarEstadoMaquina() {
  return useAccion(
    async (m: { id: number; estado: string; motivo?: string | null }) =>
      rpc<number>('cambiar_estado_maquina', {
        p_id: m.id,
        p_estado: m.estado,
        p_motivo: m.motivo ?? null,
      }),
  )
}

/*
  LA FOTO DE LA MAQUINA

  La lider la pidio: «una imagen referencial de la maquina». Sirve para que quien
  va a surtir combustible o a mandar algo al taller reconozca cual es — en una
  cantera hay tres excavadoras y el codigo pintado se borra.

  Es la misma tuberia que la foto del personal, copiada sin cambiarla: el archivo
  viaja del navegador al bucket y la base solo guarda la ruta. Es la excepcion
  conocida a la regla 1 — el navegador no escribe en las TABLAS, pero si sube
  ficheros, porque pasar megabytes por una funcion es usar una tuberia pensada
  para filas.
*/
const BUCKET_MAQUINAS = 'maquinaria'

export function useSubirFotoMaquina() {
  return useAccion(async (f: { maquina_id: number; archivo: File }) => {
    const extension = f.archivo.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const ruta = `${f.maquina_id}/${Date.now()}.${extension}`

    const { error } = await supabase.storage
      .from(BUCKET_MAQUINAS)
      .upload(ruta, f.archivo, { contentType: f.archivo.type, upsert: false })

    if (error) throw error

    // Al cambiar de foto el encuadre anterior deja de tener sentido: apuntaba a
    // un sitio de otra imagen.
    const anterior = await rpc<string | null>('guardar_foto_maquina', {
      p_id: f.maquina_id,
      p_path: ruta,
      p_zoom: 1,
      p_x: 0.5,
      p_y: 0.5,
    })

    if (anterior) await supabase.storage.from(BUCKET_MAQUINAS).remove([anterior])

    return ruta
  })
}

/*
  SUBIR LAS FOTOS ANTES DE QUE LA MAQUINA EXISTA.

  «Obligatorio al registrar» solo significa algo si la maquina no puede nacer sin
  ellas, y para eso las rutas tienen que viajar EN el alta. Pero la ruta de
  siempre empieza por el id, y el id todavia no existe.

  Van a una carpeta `nuevas/<algo irrepetible>/`, que no necesita id. Si el alta
  falla despues, quedan ficheros sueltos ahi: es el precio de que no pueda haber
  una maquina sin fotos, y es el lado bueno del que equivocarse — un fichero
  huerfano no le miente a nadie, una maquina sin registro fotografico si.
*/
export function useSubirFotosDeAlta() {
  return useAccion(async (f: { archivos: File[] }) => {
    const carpeta = `nuevas/${crypto.randomUUID()}`
    const rutas: { path: string }[] = []

    for (const [i, archivo] of f.archivos.entries()) {
      const extension = archivo.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const ruta = `${carpeta}/${i + 1}.${extension}`
      const { error } = await supabase.storage
        .from(BUCKET_MAQUINAS)
        .upload(ruta, archivo, { contentType: archivo.type, upsert: false })
      if (error) throw error
      rutas.push({ path: ruta })
    }

    return rutas
  })
}

export function useGuardarEncuadreMaquina() {
  return useAccion((e: { maquina_id: number; zoom: number; x: number; y: number }) =>
    rpc<string | null>('guardar_foto_maquina', {
      p_id: e.maquina_id,
      p_path: null,
      p_zoom: e.zoom,
      p_x: e.x,
      p_y: e.y,
    }),
  )
}

export function useQuitarFotoMaquina() {
  return useAccion(async (m: { maquina_id: number }) => {
    const anterior = await rpc<string | null>('quitar_foto_maquina', { p_id: m.maquina_id })
    if (anterior) await supabase.storage.from(BUCKET_MAQUINAS).remove([anterior])
  })
}

/**
 * La foto, lista para pintar.
 *
 * Se descarga y se envuelve en una URL de objeto en vez de pedir una firmada,
 * por lo mismo que en el personal: una URL firmada apunta a otro dominio y el
 * navegador prohibe exportar un lienzo que toco una imagen de otro origen — que
 * es justo lo que hace el recortador.
 */
export function useFotoMaquina(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!path) {
      setUrl(null)
      return
    }

    let vigente = true
    let objeto: string | null = null

    void supabase.storage
      .from(BUCKET_MAQUINAS)
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

/*
  EL TALLER, COMO SITIO Y NO SOLO COMO CAMPO

  Christopher pregunto seis cosas seguidas: a que taller mandar, si esta libre,
  que tiene en cola, que ha hecho, cuanto tardara y que se usara. Ninguna se
  podia contestar porque un taller era solo un almacen con nombre.

  Lo que sigue es lo que hace falta para contestarlas todas desde la pantalla.
*/
export type Urgencia = 'NORMAL' | 'ALTA' | 'URGENTE'

export const URGENCIAS: Array<{ valor: Urgencia; etiqueta: string; detalle: string }> = [
  { valor: 'NORMAL', etiqueta: 'Normal', detalle: 'Entra en la cola cuando toque.' },
  { valor: 'ALTA', etiqueta: 'Alta', detalle: 'Antes que lo normal, sin parar lo demas.' },
  { valor: 'URGENTE', etiqueta: 'Urgente', detalle: 'La maquina no trabaja hasta que salga.' },
]

export interface OrdenDeTaller {
  id: number
  numero: string | null
  estado: EstadoOrden
  tipo: TipoOrden
  urgencia: Urgencia
  peso_urgencia: number
  especialidad: string | null
  especialidad_nombre: string | null
  motivo: string
  detalle: string | null
  fecha: string
  fecha_salida: string | null
  dias_estimados: number | null
  taller_id: number | null
  taller: string | null
  maquina_id: number | null
  maquina_codigo: string | null
  articulo_id: number | null
  articulo: string | null
  unidad: string | null
  cantidad: string | null
  cantidad_devuelta: string | null
  /** Sobre que recae, ya en palabras. */
  sobre: string
  sobre_que: 'MAQUINA' | 'MATERIAL'
  costo_usd: string | null
  costo_repuestos_usd: string | null
  /** Nulo si ya esta cerrada. */
  dias_dentro: number | null
  /** Cierto si lleva mas de lo estimado. Nulo si nadie estimo nada. */
  se_paso: boolean | null
  repuestos_previstos: string
  repuestos_usados: string
}

export interface Taller {
  id: number
  codigo: string
  nombre: string
  ubicacion: string | null
  activo: boolean
  trabajos_a_la_vez: number | null
  abiertas: number
  urgentes: number
  pasadas_de_plazo: number
  cerradas: number
  ultimo_trabajo: string | null
  /** Nulo cuando nadie declaro cuantos trabajos aguanta. */
  tiene_sitio: boolean | null
  especialidades: string[]
  sabe_hacer: string
}

export interface Especialidad {
  codigo: string
  nombre: string
  orden: number
}

/** La cola y el historial salen de la misma vista: cambia el filtro. */
export function useOrdenesTaller(estado?: EstadoOrden, tallerId?: number | null) {
  return useQuery({
    queryKey: ['maquinaria', 'ordenes-taller', estado ?? 'todo', tallerId ?? 'todos'],
    queryFn: async () => {
      let consulta = supabase.from('v_ordenes_taller').select('*')
      if (estado) consulta = consulta.eq('estado', estado)
      if (tallerId) consulta = consulta.eq('taller_id', tallerId)
      return desenvolver<OrdenDeTaller[]>(
        await consulta
          .order('peso_urgencia')
          .order('fecha', { ascending: false })
          .limit(200),
      )
    },
  })
}

export function useTalleres() {
  return useQuery({
    queryKey: ['maquinaria', 'talleres'],
    queryFn: async () =>
      desenvolver<Taller[]>(await supabase.from('v_talleres').select('*').order('nombre')),
  })
}

export function useEspecialidades() {
  return useQuery({
    queryKey: ['especialidades-taller'],
    staleTime: 30 * 60_000,
    queryFn: async () =>
      desenvolver<Especialidad[]>(
        await supabase
          .from('especialidades_taller')
          .select('codigo, nombre, orden')
          .eq('activa', true)
          .order('orden'),
      ),
  })
}

export function useGuardarEspecialidadesTaller() {
  return useAccion((t: { taller_id: number; especialidades: string[] }) =>
    rpc<number>('guardar_especialidades_taller', {
      p_taller_id: t.taller_id,
      p_especialidades: t.especialidades,
    }),
  )
}

export function useGuardarCapacidadTaller() {
  return useAccion((t: { taller_id: number; trabajos: number | null }) =>
    rpc<number>('guardar_capacidad_taller', {
      p_taller_id: t.taller_id,
      p_trabajos: t.trabajos,
    }),
  )
}
