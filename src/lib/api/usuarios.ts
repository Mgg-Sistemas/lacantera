import { useEffect } from 'react'
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

const RANGO: Record<Nivel, number> = {
  NINGUNO: 0,
  LECTURA: 1,
  ESCRITURA: 2,
  TOTAL: 3,
}

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
  /** El color de la tarjeta, como en MGG. */
  color: string
  /** Entra solo por sus pantallas de teléfono; no ve las de escritorio. */
  solo_telefono: boolean
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
          .select('codigo, nombre, descripcion, orden, sistema, a_la_medida, color, solo_telefono')
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
 * A qué roles equivale cada rol.
 *
 * Desde el 09/11/2026 un usuario tiene un solo rol. Quien tenía varios recibió
 * uno que junta los suyos («Compras + Almacén»), y ese rol cuenta como cada uno
 * de ellos para lo que el sistema pregunta por rol (avisos, quién aprueba de
 * respaldo…). Los permisos no salen de aquí: salen de su propia matriz.
 */
export function useRolIncluye() {
  return useQuery({
    queryKey: ['rol-incluye'],
    queryFn: async () =>
      desenvolver<{ rol: string; incluye: string }[]>(
        await supabase.from('rol_incluye').select('rol, incluye'),
      ),
    staleTime: 10 * 60_000,
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
  /**
   * El archivo. Una cuenta archivada está siempre inactiva —lo garantiza la
   * base— y sale de la lista de en uso. La marca es la fecha: no hay booleano.
   */
  archivado_en: string | null
  archivado_por: string | null
  /** Resuelto aquí, contra la misma lista: la base guarda solo el uuid. */
  archivado_por_nombre: string | null
  archivado_motivo: string | null
}

export interface MiPerfil extends Omit<
  UsuarioSistema,
  'archivado_en' | 'archivado_por' | 'archivado_por_nombre' | 'archivado_motivo'
> {
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
      const perfiles = desenvolver<Omit<UsuarioSistema, 'roles' | 'archivado_por_nombre'>[]>(
        await supabase
          .from('perfiles')
          .select(
            'id, usuario, nombre, cargo, cedula, telefono, activo, creado_en, archivado_en, archivado_por, archivado_motivo',
          )
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

      // Quién archivó a quién, con nombre. Sale de esta misma lista: quien
      // archiva es siempre un usuario del sistema, y la lista los trae a todos.
      const nombrePorId = new Map(perfiles.map((p) => [p.id, p.nombre]))

      return perfiles.map((p) => ({
        ...p,
        roles: porUsuario.get(p.id) ?? [],
        archivado_por_nombre: p.archivado_por ? (nombrePorId.get(p.archivado_por) ?? null) : null,
      }))
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
      /** Un usuario, un rol (09/11/2026). */
      rol: string
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
        p_roles: [v.rol],
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

/** Un usuario tiene un solo rol: asignarlo reemplaza el que tenía. */
export function useAsignarRol() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; rol: string }) =>
      rpc('asignar_rol', { p_usuario_id: v.id, p_rol: v.rol }),
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

/**
 * Al archivo. Solo entra una cuenta ya inactiva, y hay que decir por qué: la
 * base rechaza las dos cosas, esto solo lleva la orden.
 */
export function useArchivarUsuario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; motivo: string }) =>
      rpc('archivar_usuario', { p_id: v.id, p_motivo: v.motivo }),
    onSuccess: () => invalidar(qc),
  })
}

/** Del archivo a la lista de en uso — inactiva. Encenderla es otro botón. */
export function useDesarchivarUsuario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string }) => rpc('desarchivar_usuario', { p_id: v.id }),
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
      rpc('guardar_permiso_rol', {
        p_rol: v.rol,
        p_modulo: v.modulo,
        p_nivel: v.nivel,
      }),
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
      color?: string | null
      solo_telefono?: boolean
    }) =>
      rpc<string>('crear_rol', {
        p_codigo: v.codigo,
        p_nombre: v.nombre,
        p_descripcion: v.descripcion,
        p_a_la_medida: v.a_la_medida ?? false,
        p_color: v.color ?? null,
        p_solo_telefono: v.solo_telefono ?? false,
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
      color?: string | null
      solo_telefono?: boolean | null
    }) =>
      rpc('guardar_rol', {
        p_codigo: v.codigo,
        p_nombre: v.nombre,
        p_descripcion: v.descripcion,
        // Nulo deja cada cosa como estaba: quien solo viene a corregir el
        // nombre no cambia de qué se rige el rol sin querer.
        p_a_la_medida: v.a_la_medida ?? null,
        p_color: v.color ?? null,
        p_solo_telefono: v.solo_telefono ?? null,
      }),
    onSuccess: () => {
      invalidarRoles(qc)
      void qc.invalidateQueries({ queryKey: ['mi-solo-telefono'] })
    },
  })
}

/** «↺ Por defecto»: vuelve la matriz del rol a la guardada de fábrica. */
export function useRestablecerRol() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rol: string) => rpc('restablecer_rol', { p_rol: rol }),
    onSuccess: () => invalidarRoles(qc),
  })
}

// ---------------------------------------------------------------------------
// Usuarios autorizados para aprobar (como en MGG)
// ---------------------------------------------------------------------------

/**
 * Quién aprueba órdenes de compra y quién aprueba salidas.
 *
 * Es una lista por persona, aparte de los roles. El administrador aprueba
 * siempre, sin estar en ella.
 */
export interface UsuarioAutorizado {
  usuario_id: string
  nombre: string
  usuario: string
  activo: boolean
  aprobar_oc: boolean
  aprobar_salidas: boolean
  /** Aprueba despachos de ventas (10/11/2026: una sola aprobación por venta). */
  aprobar_despachos: boolean
  /** Su firma (PNG en data URL), o nulo si no tiene. */
  firma: string | null
}

export function useUsuariosAutorizados() {
  return useQuery({
    queryKey: ['usuarios-autorizados'],
    queryFn: () => rpc<UsuarioAutorizado[]>('usuarios_autorizados_lista'),
  })
}

function invalidarAutorizados(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['usuarios-autorizados'] })
  // Quién aprueba se lee también en compras y en salidas.
  void qc.invalidateQueries({ queryKey: ['compras'] })
  void qc.invalidateQueries({ queryKey: ['salidas'] })
  void qc.invalidateQueries({ queryKey: ['ventas'] })
}

export function useGuardarAutorizado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { usuario_id: string; aprobar_oc: boolean; aprobar_salidas: boolean; aprobar_despachos: boolean }) =>
      rpc('guardar_usuario_autorizado', {
        p_usuario: v.usuario_id,
        p_aprobar_oc: v.aprobar_oc,
        p_aprobar_salidas: v.aprobar_salidas,
        p_aprobar_despachos: v.aprobar_despachos,
      }),
    onSuccess: () => invalidarAutorizados(qc),
  })
}

export function useQuitarAutorizado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (usuario_id: string) => rpc('quitar_usuario_autorizado', { p_usuario: usuario_id }),
    onSuccess: () => invalidarAutorizados(qc),
  })
}

export function useGuardarFirmaDeUsuario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { usuario_id: string; imagen: string; origen: string }) =>
      rpc('guardar_firma_de_usuario', { p_usuario: v.usuario_id, p_imagen: v.imagen, p_origen: v.origen }),
    onSuccess: () => {
      invalidarAutorizados(qc)
      void qc.invalidateQueries({ queryKey: ['firmas'] })
    },
  })
}

export function useQuitarFirmaDeUsuario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (usuario_id: string) => rpc('quitar_firma_de_usuario', { p_usuario: usuario_id }),
    onSuccess: () => {
      invalidarAutorizados(qc)
      void qc.invalidateQueries({ queryKey: ['firmas'] })
    },
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

/**
 * Si quien mira solo debe ver la vista de teléfono de sus módulos.
 *
 * Es la restricción, no la comodidad: `Entrada.tsx` decide dónde ATERRIZA
 * quien tiene una casilla de teléfono; esto decide qué le queda CERRADO
 * después. Las usa juntas `ExigePermiso`.
 */
export function useSoloTelefono() {
  const consulta = useQuery({
    queryKey: ['mi-solo-telefono'],
    queryFn: () => rpc<boolean>('mi_solo_telefono'),
    staleTime: 5 * 60_000,
  })

  return {
    ...consulta,
    soloTelefono: consulta.data ?? false,
    resuelto: consulta.isSuccess,
  }
}

// ---------------------------------------------------------------------------
// Presencia
// ---------------------------------------------------------------------------

export interface Presencia {
  id: string
  nombre: string
  usuario: string
  cargo: string | null
  visto_en: string | null
  en_linea: boolean
  /** Cuando entro por ultima vez, de la auditoria. Distinto de `visto_en`. */
  ultimo_acceso: string | null
}

/**
 * Quien esta en el sistema ahora, y cuando se le vio por ultima vez si no.
 *
 * Se refresca sola cada medio minuto. Una lista de conectados que hay que
 * recargar a mano no dice quien esta: dice quien estaba cuando se abrio.
 */
export function usePresencia() {
  return useQuery({
    queryKey: ['presencia'],
    queryFn: async () =>
      desenvolver<Presencia[]>(
        await supabase.from('v_presencia').select('*').order('nombre'),
      ),
    refetchInterval: 30_000,
  })
}

/**
 * El latido: le dice a la base que esta persona sigue delante de la pantalla.
 *
 * Cada dos minutos y al entrar. Es lo unico que distingue «esta trabajando» de
 * «entro esta mañana y se fue»: la auditoria solo apunta entradas y
 * escrituras, asi que quien se pasa el dia leyendo pantallas no dejaria rastro
 * y figuraria desconectado.
 *
 * Se para cuando la pestaña se esconde. Un portatil cerrado con veinte
 * pestañas abiertas no es alguien a quien se le pueda preguntar algo, que es
 * para lo que se mira esta lista.
 */
export function useLatido() {
  useEffect(() => {
    let vivo = true

    const latir = () => {
      if (!vivo || document.visibilityState !== 'visible') return
      void rpc('sigo_aqui', {}).catch(() => {
        // Un latido perdido no es nada: al siguiente se vuelve a intentar, y
        // molestar con un error por esto seria peor que el propio silencio.
      })
    }

    latir()
    const cada = setInterval(latir, 120_000)
    document.addEventListener('visibilitychange', latir)

    return () => {
      vivo = false
      clearInterval(cada)
      document.removeEventListener('visibilitychange', latir)
    }
  }, [])
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
