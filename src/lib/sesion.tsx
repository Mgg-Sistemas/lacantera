import { createContext, use, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface EstadoSesion {
  session: Session | null
  /** Nombre de usuario con el que entró. */
  usuario: string
  /** Nombre para mostrar. Cae al usuario si no hay nombre cargado. */
  nombre: string
  /** Iniciales para el avatar. */
  iniciales: string
  /** `true` mientras se resuelve la sesión inicial desde el almacenamiento. */
  cargando: boolean
}

const ContextoSesion = createContext<EstadoSesion | null>(null)

function calcularIniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

export function SesionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vigente = true

    // Sesión inicial: puede venir de localStorage, así que no es instantánea.
    void supabase.auth.getSession().then(({ data }) => {
      if (!vigente) return
      setSession(data.session)
      setCargando(false)
    })

    // Cubre inicio de sesión, cierre, refresco de token y expiración.
    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, nueva) => {
      setSession(nueva)
      setCargando(false)
    })

    return () => {
      vigente = false
      suscripcion.subscription.unsubscribe()
    }
  }, [])

  const metadatos = session?.user.user_metadata ?? {}
  const usuario = typeof metadatos.usuario === 'string' ? metadatos.usuario : ''
  const nombre = typeof metadatos.nombre === 'string' && metadatos.nombre ? metadatos.nombre : usuario

  return (
    <ContextoSesion
      value={{
        session,
        usuario,
        nombre,
        iniciales: calcularIniciales(nombre),
        cargando,
      }}
    >
      {children}
    </ContextoSesion>
  )
}

export function useSesion(): EstadoSesion {
  const contexto = use(ContextoSesion)
  if (!contexto) {
    throw new Error('useSesion debe usarse dentro de <SesionProvider>.')
  }
  return contexto
}
