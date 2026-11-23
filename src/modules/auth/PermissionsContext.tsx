import { createContext, useContext, type ReactNode } from 'react';
import { useSession, type AppUser } from './authStore';

interface PermissionsContextType {
  can: (module?: string, level?: string) => boolean;
  isAdmin: boolean;
  appUser: AppUser | null;
}

const PermissionsContext = createContext<PermissionsContextType>({
  can: () => true,
  isAdmin: true,
  appUser: null,
});

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const appUser = user ? { id: user.id, email: user.email, nombre: user.user_metadata?.name || user.email } : null;
  return (
    <PermissionsContext.Provider value={{ can: () => true, isAdmin: true, appUser }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext);
  const { user } = useSession();
  const appUser = ctx.appUser || (user ? { id: user.id, email: user.email, nombre: user.user_metadata?.name || user.email } : { id: 'admin', email: 'admin@mineriainternacionalts.com', nombre: 'Administrador' });
  return {
    ...ctx,
    appUser,
  };
}
