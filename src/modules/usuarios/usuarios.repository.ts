import { supabase } from '@/lib/supabase';
import type { Usuario } from '@/shared/lib/types';

export type { Usuario };

export async function listUsuarios(): Promise<Usuario[]> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .order('usuario');
  if (error) {
    console.warn('Error al listar usuarios:', error);
    return [];
  }
  return (data ?? []).map((u: any) => ({
    id: u.id || u.usuario || crypto.randomUUID(),
    nombre: u.nombre || u.usuario || 'Usuario',
    email: u.correo || u.email || `${u.usuario}@mineriainternacionalts.com`,
    role: u.rol || 'admin',
    estado: 'activo' as const,
    created_at: u.creado_en || new Date().toISOString(),
  }));
}
