import { useSesion } from '@/lib/sesion';

export interface AppUser {
  id: string;
  nombre?: string;
  apellido?: string;
  email?: string;
  usuario?: string;
}

export function useSession() {
  const { session, usuario, nombre } = useSesion();
  return {
    user: session?.user
      ? {
          id: session.user.id,
          email: session.user.email || `${usuario}@mineriainternacionalts.com`,
          user_metadata: { name: nombre || usuario },
        }
      : usuario
        ? {
            id: usuario,
            email: `${usuario}@mineriainternacionalts.com`,
            user_metadata: { name: nombre || usuario },
          }
        : null,
    loading: false,
  };
}

export async function getAppUser(): Promise<AppUser | null> {
  return null;
}

export async function signOut() {
  // no-op
}
