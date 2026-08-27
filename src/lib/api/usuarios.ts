import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

// ---------------------------------------------------------------------------
// Niveles
// ---------------------------------------------------------------------------

/**
 * Los cuatro niveles son una escalera, no cuatro opciones sueltas: control
 * total incluye escritura, que incluye lectura. La pantalla dibuja tres
 * casillas porque es como se lee de un vistazo quién puede qué, pero por
 * debajo hay un solo valor. Con tres casillas independientes se podría marcar
 * "escribe pero no lee", que no quiere decir nada.
 */
export type Nivel = 'NINGUNO' | 'LECTURA' | 'ESCRITURA' | 'TOTAL'

const RANGO: Record<Nivel, number> = { NINGUNO: 0, LECTURA: 1, ESCRITURA: 2, TOTAL: 3 }

export function alcanza(nivel: Nivel | undefined, minimo: Nivel): boolean {
  return RANGO[nivel ?? 'NINGUNO'] >= RANGO[minimo]
}

/** Qué nivel deja marcada una casilla al pulsarla, según cómo esté ahora. */
export function nivelAlMarcar(actual: Nivel, casilla: Nivel): Nivel {
  // Pulsar una casilla ya cubierta la apaga, y con ella todo lo que hay por
  // encima: quitar "lectura" no puede dejar "escritura" en pie.
  if (alcanza(actual, casilla)) {
    return casilla === 'LECTURA' ? 'NINGUNO' : casilla === 'ESCRITURA' ? 'LECTURA' : 'ESCRITURA'
  }
  return casilla
}

// ---------------------------------------------------------------------------
// Módulos y matriz
// ---------------------------------------------------------------------------

export interface Modulo {
  codigo: string
  nombre: string
  descripcion: string
  orden: number
}

export interface RolSistema {
  codigo: string
  nombre: string
  descripcion: string
  orden: number
  sistema: boolean
  /**
   * Cierto si el rol se rige por CASILLAS y no por la escalera.
   *
   * Solo en los módulos que ya tienen catálogo de acciones: en los demás sigue
   * mandando su escalón, para que un rol nuevo no se quede sin poder tocar nada
   * hasta que estén catalogados los quince.
   */
  a_la_medida: boolean
}

export interface PermisoRol {
  rol: string
  modulo: string
  nivel: Nivel
}

export function useModulos() {
  return useQuery({
    queryKey: ['modulos'],
    queryFn: async () =>
      desenvolver<Modulo[]>(
        await supabase.from('modulos').select('codigo, nombre, descripcion, orden').order('orden'),
      ),
    staleTime: 30 * 60_000,
  })
}

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: async () =>
      desenvolver<RolSistema[]>(
        await supabase
          .from('roles')
          .select('codigo, nombre, descripcion, orden, sistema, a_la_medida')
          .order('orden'),
      ),
  })
}

export function usePermisos() {
  return useQuery({
    queryKey: ['rol-permisos'],
    queryFn: async () =>
      desenvolver<PermisoRol[]>(await supabase.from('rol_permisos').select('rol, modulo, nivel')),
  })
}

/**
 * Lo que puede el usuario que está mirando.
 *
 * Decide qué módulos aparecen en el menú y qué botones se dibujan. No
 * autoriza: quien llegue a la función igual choca con la reja de la base.
 */
export function useMisPermisos() {
  const consulta = useQuery({
    queryKey: ['mis-permisos'],
    queryFn: () => rpc<{ modulo: string; nivel: Nivel }[]>('mis_permisos'),
    staleTime: 5 * 60_000,
  })

  const mapa = new Map((consulta.data ?? []).map((p) => [p.modulo, p.nivel]))

  return {
    ...consulta,
    /** Nivel en un módulo. `NINGUNO` mientras carga: se abre al confirmar, no antes. */
    nivel: (modulo: string): Nivel => mapa.get(modulo) ?? 'NINGUNO',
    puede: (modulo: string, minimo: Nivel = 'LECTURA') => alcanza(mapa.get(modulo), minimo),
    /** `true` solo cuando ya se sabe. Evita esconder el menú entero al cargar. */
    resuelto: consulta.isSuccess,
  }
}

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------

export interface UsuarioSistema {
  id: string
  usuario: string
  nombre: string
  cargo: string | null
  cedula: string | null
  telefono: string | null
  activo: boolean
  creado_en: string
  roles: string[]
}

export interface MiPerfil extends UsuarioSistema {
  /** La clave vigente la puso el administrador: todavía no identifica a nadie. */
  debe_cambiar_clave: boolean
}

/**
 * Quién soy.
 *
 * Se pregunta a la base y no al token: los datos del token se congelaron al
 * entrar, y quien acaba de cambiarse la clave o de recibir un rol seguiría
 * viendo lo de antes hasta que la sesión caducara.
 */
export function useMiPerfil() {
  return useQuery({
    queryKey: ['mi-perfil'],
    queryFn: async () => {
      const filas = await rpc<MiPerfil[]>('mi_perfil')
      return filas[0] ?? null
    },
  })
}

export function useCambiarMiClave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { actual: string; nueva: string }) =>
      rpc('cambiar_mi_clave', { p_actual: v.actual, p_nueva: v.nueva }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mi-perfil'] })
      void qc.invalidateQueries({ queryKey: ['usuarios'] })
    },
  })
}

export function useUsuarios() {
  return useQuery({
    queryKey: ['usuarios'],
    queryFn: async () => {
      const perfiles = desenvolver<Omit<UsuarioSistema, 'roles'>[]>(
        await supabase
          .from('perfiles')
          .select('id, usuario, nombre, cargo, cedula, telefono, activo, creado_en')
          .order('nombre'),
      )

      const asignaciones = desenvolver<{ usuario_id: string; rol: string }[]>(
        await supabase.from('usuarios_roles').select('usuario_id, rol'),
      )

      const porUsuario = new Map<string, string[]>()
      for (const a of asignaciones) {
        const lista = porUsuario.get(a.usuario_id) ?? []
        lista.push(a.rol)
        porUsuario.set(a.usuario_id, lista)
      }

      return perfiles.map((p) => ({ ...p, roles: porUsuario.get(p.id) ?? [] }))
    },
  })
}

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['usuarios'] })
  void qc.invalidateQueries({ queryKey: ['perfiles'] })
  void qc.invalidateQueries({ queryKey: ['mis-roles'] })
  void qc.invalidateQueries({ queryKey: ['mis-permisos'] })
  void qc.invalidateQueries({ queryKey: ['mi-perfil'] })
}

export function useCrearUsuario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: {
      usuario: string
      clave: string
      nombre: string
      cargo?: string
      cedula?: string
      telefono?: string
      roles: string[]
    }) =>
      /*
        El teléfono va, y antes no iba.

        La ventana de alta lo pedía y este hook no lo mandaba: la función de la
        base ni siquiera tenía el parámetro. El usuario se creaba sin dar error
        y el número se perdía en silencio, que es la peor forma de perder un
        dato — nadie lo nota hasta que hace falta llamar a esa persona.
      */
      rpc<string>('crear_usuario_sistema', {
        p_usuario: v.usuario,
        p_clave: v.clave,
        p_nombre: v.nombre,
        p_cargo: v.cargo || null,
        p_cedula: v.cedula || null,
        p_telefono: v.telefono || null,
        p_roles: v.roles,
      }),
    onSuccess: () => invalidar(qc),
  })
}

export function useGuardarPerfil() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: {
      id: string
      nombre: string
      cargo?: string
      cedula?: string
      telefono?: string
    }) =>
      rpc('guardar_perfil_usuario', {
        p_id: v.id,
        p_nombre: v.nombre,
        p_cargo: v.cargo || null,
        p_cedula: v.cedula || null,
        p_telefono: v.telefono || null,
      }),
    onSuccess: () => invalidar(qc),
  })
}

export function useAsignarRoles() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; roles: string[] }) =>
      rpc('asignar_roles', { p_usuario_id: v.id, p_roles: v.roles }),
    onSuccess: () => invalidar(qc),
  })
}

export function useActivarUsuario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; activo: boolean }) =>
      rpc('activar_usuario', { p_id: v.id, p_activo: v.activo }),
    onSuccess: () => invalidar(qc),
  })
}

export function useCambiarClave() {
  return useMutation({
    mutationFn: (v: { id: string; clave: string }) =>
      rpc('cambiar_clave_usuario', { p_id: v.id, p_clave: v.clave }),
  })
}

// ---------------------------------------------------------------------------
// Roles y matriz
// ---------------------------------------------------------------------------

function invalidarRoles(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['roles'] })
  void qc.invalidateQueries({ queryKey: ['rol-permisos'] })
  void qc.invalidateQueries({ queryKey: ['mis-permisos'] })
}

export function useGuardarPermiso() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { rol: string; modulo: string; nivel: Nivel }) =>
      rpc('guardar_permiso_rol', { p_rol: v.rol, p_modulo: v.modulo, p_nivel: v.nivel }),
    onSuccess: () => invalidarRoles(qc),
  })
}

export function useCrearRol() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: {
      codigo: string
      nombre: string
      descripcion: string
      a_la_medida?: boolean
    }) =>
      rpc<string>('crear_rol', {
        p_codigo: v.codigo,
        p_nombre: v.nombre,
        p_descripcion: v.descripcion,
        p_a_la_medida: v.a_la_medida ?? false,
      }),
    onSuccess: () => invalidarRoles(qc),
  })
}

export function useGuardarRol() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: {
      codigo: string
      nombre: string
      descripcion: string
      a_la_medida?: boolean
    }) =>
      rpc('guardar_rol', {
        p_codigo: v.codigo,
        p_nombre: v.nombre,
        p_descripcion: v.descripcion,
        // Nulo deja la clase como estaba: quien solo viene a corregir el nombre
        // no cambia de qué se rige el rol sin querer.
        p_a_la_medida: v.a_la_medida ?? null,
      }),
    onSuccess: () => invalidarRoles(qc),
  })
}

// ---------------------------------------------------------------------------
// Acciones: lo que un rol puede hacer, casilla por casilla
//
// Es lo que pidió la líder: «al crear un rol estamos creando un título o caja
// que se llenará de permisos». La escalera decía a qué módulo llegas y con qué
// fuerza; esto dice QUÉ COSAS puedes hacer ahí dentro, una por una.
// ---------------------------------------------------------------------------

export interface AccionDelSistema {
  codigo: string
  modulo: string
  modulo_nombre: string
  nombre: string
  dice: string | null
  orden: number
  /**
   * El escalón que la cubría antes, para que los roles de siempre no pierdan
   * nada. Nulo cuando ningún nivel la abre: esas solo se tienen marcándolas.
   */
  nivel_equivalente: Nivel | null
}

export function useAcciones() {
  return useQuery({
    queryKey: ['acciones'],
    queryFn: () => rpc<AccionDelSistema[]>('acciones_del_sistema'),
    staleTime: 10 * 60_000,
  })
}

export function useAccionesDeLosRoles() {
  return useQuery({
    queryKey: ['acciones-de-roles'],
    queryFn: () => rpc<{ rol: string; accion: string }[]>('acciones_de_los_roles'),
  })
}

export function useMarcarAccion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { rol: string; accion: string; marcada: boolean }) =>
      rpc('marcar_accion_de_rol', {
        p_rol: v.rol,
        p_accion: v.accion,
        p_marcada: v.marcada,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['acciones-de-roles'] })
      // Y lo que YO puedo: si me acabo de recortar a mí mismo, la pantalla
      // tiene que enterarse sin recargar.
      void qc.invalidateQueries({ queryKey: ['mis-acciones'] })
    },
  })
}

/**
 * Lo que puede hacer quien está mirando.
 *
 * Es el gemelo de `useMisPermisos`, y hace falta para lo otro que se pidió:
 * «que un módulo se pueda visualizar, pero no modificar (sin botones)». Con
 * solo el escalón no se puede pintar eso — los botones se quedarían ahí para
 * fallar al pulsarlos.
 */
export function useMisAcciones() {
  const consulta = useQuery({
    queryKey: ['mis-acciones'],
    queryFn: () => rpc<string[]>('mis_acciones'),
    staleTime: 5 * 60_000,
  })

  const suyas = new Set(consulta.data ?? [])

  return {
    ...consulta,
    /** Falso mientras carga: se abre al confirmar, no antes. */
    puede: (accion: string) => suyas.has(accion),
    resuelto: consulta.isSuccess,
  }
}

// ---------------------------------------------------------------------------
// Autorizaciones: lo que se le extiende a UNA PERSONA por encima de su rol
//
// La lider: «Coloca que Jesmary pueda aprobar las ordenes marcando un check que
// diga: Autorizada bajo autorizacion del gerente general».
//
// Y Christopher lo que hay detras: «en usuarios, se pueda extender permisos que
// no competen a un rol, bajo una justificacion». Por persona, no por rol — el
// rol dice lo que compete al puesto, y esto es lo que se le presta a alguien
// concreto por encima de su puesto, con fecha de fin o sin ella.
//
// El check solo es verdad porque hay un registro detras. Sin el, seria una
// frase que teclea sobre si mismo quien aprueba, en un papel que compromete
// dinero.
// ---------------------------------------------------------------------------

export interface AutorizacionDelSistema {
  id: number
  accion: string
  accion_nombre: string
  modulo: string
  modulo_nombre: string
  a_usuario: string
  a_nombre: string
  por_usuario: string
  por_nombre: string
  desde: string
  /** Nulo es indefinida, que es la mitad de lo que se pidio. */
  hasta: string | null
  motivo: string
  /** Ya calculado por la base: ni retirada, ni por empezar, ni caducada. */
  vigente: boolean
  revocada_en: string | null
  revocada_por: string | null
  revocada_nombre: string | null
  revocada_motivo: string | null
  creada_en: string
}

export function useAutorizaciones() {
  return useQuery({
    queryKey: ['autorizaciones'],
    queryFn: () => rpc<AutorizacionDelSistema[]>('autorizaciones_del_sistema'),
  })
}

/** Lo que devuelve extender varias: cuantas entraron y cuales no, con su motivo. */
export interface ResumenDeExtension {
  extendidas: number
  omitidas: { accion: string; motivo: string }[]
}

/**
 * Extender varias casillas de una vez, a la misma persona y con el mismo motivo.
 *
 * La base las mete una a una en su propia subtransaccion, asi que la que no
 * entra no tumba a las demas: marcar cinco y que una ya la tuviera por su rol
 * no puede dejar las otras cuatro sin extender. Devuelve cuantas entraron y
 * cuales se quedaron fuera, que es lo que hay que enseñar despues.
 */
export function useAutorizarVarias() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: {
      usuario_id: string
      acciones: string[]
      motivo: string
      desde?: string | null
      hasta?: string | null
    }) =>
      rpc<ResumenDeExtension>('autorizar_varias', {
        p_usuario_id: v.usuario_id,
        p_acciones: v.acciones,
        p_motivo: v.motivo,
        p_desde: v.desde || null,
        p_hasta: v.hasta || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['autorizaciones'] })
      void qc.invalidateQueries({ queryKey: ['mis-autorizaciones'] })
      void qc.invalidateQueries({ queryKey: ['mis-acciones'] })
    },
  })
}

export function useAutorizar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: {
      usuario_id: string
      accion: string
      motivo: string
      desde?: string | null
      hasta?: string | null
    }) =>
      rpc<number>('autorizar_accion', {
        p_usuario_id: v.usuario_id,
        p_accion: v.accion,
        p_motivo: v.motivo,
        p_desde: v.desde || null,
        p_hasta: v.hasta || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['autorizaciones'] })
      // Lo que YO puedo cambia si me acabo de autorizar algo a otro y luego
      // miro su ficha; y sobre todo cambia para quien la recibe al recargar.
      void qc.invalidateQueries({ queryKey: ['mis-acciones'] })
      void qc.invalidateQueries({ queryKey: ['mis-autorizaciones'] })
    },
  })
}

export function useRetirarAutorizacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: number; motivo?: string }) =>
      rpc('retirar_autorizacion', { p_id: v.id, p_motivo: v.motivo || null }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['autorizaciones'] })
      void qc.invalidateQueries({ queryKey: ['mis-acciones'] })
      void qc.invalidateQueries({ queryKey: ['mis-autorizaciones'] })
    },
  })
}

/**
 * Lo que tiene prestado quien esta mirando, y de quien.
 *
 * Distinto de `useMisAcciones`, que dice lo que puede sin distinguir de donde
 * le viene. Aqui hace falta la distincion: el check de «bajo autorizacion de»
 * solo debe salir cuando de verdad esta actuando con permiso de otro. A quien
 * le compete por su rol no se le pide que declare nada.
 */
export function useMisAutorizaciones() {
  const consulta = useQuery({
    queryKey: ['mis-autorizaciones'],
    queryFn: () =>
      rpc<{ accion: string; por_nombre: string; hasta: string | null; motivo: string }[]>(
        'mis_autorizaciones',
      ),
    staleTime: 5 * 60_000,
  })

  const mapa = new Map((consulta.data ?? []).map((a) => [a.accion, a]))

  return {
    ...consulta,
    /** La autorizacion viva para esa casilla, o `undefined` si va por lo suyo. */
    de: (accion: string) => mapa.get(accion),
  }
}

export function useEliminarRol() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (codigo: string) => rpc('eliminar_rol', { p_codigo: codigo }),
    onSuccess: () => invalidarRoles(qc),
  })
}

/*
  DE QUÉ TRABAJADOR ES CADA CUENTA

  La ficha ya decía con qué usuario entra una persona; esto es el camino de
  vuelta, que pidió Christopher.

  Sale de una función de la base y no de un cruce aquí. Los nombres y las fichas
  están en `empleados`, cuya política exige NOMINA:LECTURA, y esta pantalla la ve
  quien tiene USUARIOS. Hoy los dos únicos roles con USUARIOS tienen también
  NOMINA, así que cruzarlo aquí funcionaría — y dejaría de funcionar EN SILENCIO
  el día que alguien reciba USUARIOS sin NOMINA. La columna se quedaría vacía sin
  un solo error y quien la mirara concluiría que ninguna cuenta tiene ficha.
*/

export interface FichaDeCuenta {
  perfil_id: string
  empleado_id: number
  ficha: string
  nombre: string
  /**
   * `true` cuando la cuenta NO está atada y solo se parece por la cédula.
   *
   * Se sugiere únicamente por cédula. Cruzar por nombre daba basura: la cuenta
   * «admin_», cuyo titular se llama ADMINISTRADOR, casaba con diecinueve
   * trabajadores. En un sistema que paga nóminas, sugerir mal es peor que no
   * sugerir.
   */
  sugerida: boolean
}

export function useFichasDeLasCuentas() {
  return useQuery({
    queryKey: ['usuarios', 'fichas'],
    queryFn: () => rpc<FichaDeCuenta[]>('fichas_de_las_cuentas'),
  })
}
