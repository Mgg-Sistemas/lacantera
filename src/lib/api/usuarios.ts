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
      roles: string[]
    }) =>
      rpc<string>('crear_usuario_sistema', {
        p_usuario: v.usuario,
        p_clave: v.clave,
        p_nombre: v.nombre,
        p_cargo: v.cargo || null,
        p_cedula: v.cedula || null,
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

export function useEliminarRol() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (codigo: string) => rpc('eliminar_rol', { p_codigo: codigo }),
    onSuccess: () => invalidarRoles(qc),
  })
}
