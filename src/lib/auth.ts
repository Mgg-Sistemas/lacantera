import { supabase } from './supabase'

/**
 * Dominio interno para el mapeo usuario → correo.
 *
 * Supabase Auth se autentica contra un correo, pero aquí la gente entra con
 * nombre de usuario: la mitad de la plantilla no tiene correo de empresa, y
 * pedirle uno a un obrero para marcar asistencia es una barrera inútil.
 *
 * El correo sintético nunca se muestra ni se escribe. No es un dominio real y
 * no debe serlo: si fuera real, alguien podría registrar la cuenta por fuera y
 * recibir los correos de recuperación de contraseña.
 */
const DOMINIO_INTERNO = 'lacantera.local'

/** Reglas de forma del nombre de usuario, aplicadas también en la base. */
export const PATRON_USUARIO = /^[a-z0-9._-]{3,32}$/

export function normalizarUsuario(usuario: string): string {
  return usuario.trim().toLowerCase()
}

export function correoDeUsuario(usuario: string): string {
  return `${normalizarUsuario(usuario)}@${DOMINIO_INTERNO}`
}

export interface ResultadoInicioSesion {
  ok: boolean
  error?: string
}

export async function iniciarSesion(
  usuario: string,
  clave: string,
): Promise<ResultadoInicioSesion> {
  const normalizado = normalizarUsuario(usuario)

  if (!PATRON_USUARIO.test(normalizado)) {
    return {
      ok: false,
      error: 'El usuario solo admite letras, números, punto, guion y guion bajo.',
    }
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: correoDeUsuario(normalizado),
    password: clave,
  })

  if (error) {
    // No se distingue entre "usuario inexistente" y "clave incorrecta": decir
    // cuál de los dos falló permite averiguar qué usuarios existen.
    if (error.status === 400) {
      return { ok: false, error: 'Usuario o clave incorrectos.' }
    }
    return { ok: false, error: `No se pudo entrar: ${error.message}` }
  }

  return { ok: true }
}

export async function cerrarSesion(): Promise<void> {
  /*
    `scope: 'local'` CIERRA ESTE EQUIPO, NO LA CUENTA ENTERA

    Sin el argumento, Supabase usa `scope: 'global'` y **borra todas las
    sesiones del usuario en todos los aparatos**. Como aquí varias personas
    comparten un mismo acceso —`admin_`, `administradora_`, `sistemas2`—, el
    que se iba a su casa y pulsaba «Salir» expulsaba a los demás en mitad del
    trabajo.

    Se veía en los registros del 19 de agosto: cierre de sesión de `admin_`
    desde una IP a las 20:43, y a partir de las 21:18 tres
    `refresh_token_not_found` seguidos desde otra IP de la misma cuenta —otra
    persona, otro equipo—, que después tecleó mal la clave tres veces antes de
    poder volver a entrar. Eso es lo que se reportó como «el sistema me cerró
    la sesión porque sí».

    Lo correcto sería una cuenta por persona; mientras se comparten, al menos
    salir no arrastra a nadie.
  */
  await supabase.auth.signOut({ scope: 'local' })
}
