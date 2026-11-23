import { supabase } from '@/lib/supabase';

export interface Proveedor {
  id: string;
  nombre: string;
  razon_social?: string;
  rif?: string | null;
  telefono?: string | null;
  activo?: boolean;
}

export async function listProveedoresActivos(): Promise<Proveedor[]> {
  const { data, error } = await supabase
    .from('proveedores')
    .select('id, nombre, rif, telefono, activo')
    .order('nombre');
  if (error) {
    console.warn('Error al listar proveedores:', error);
    return [];
  }
  return (data ?? []).filter((p) => p.activo !== false);
}
