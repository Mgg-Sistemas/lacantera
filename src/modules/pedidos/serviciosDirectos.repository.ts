import { supabase } from '@/lib/supabase';

export interface ServicioDirectoItem {
  categoria?: string | null;
  descripcion: string;
  equipo_id?: string | null;
  equipo_nombre?: string | null;
  cantidad: number;
  unidad?: string | null;
  gasto?: number | null;
}

export interface ServicioDirecto {
  id: string;
  codigo?: string | null;
  estado?: string;
  moneda?: string;
  proveedor_id?: string | null;
  items?: ServicioDirectoItem[];
}

export interface CrearServicioDirectoInput {
  lineas: any[];
  proveedorId?: string | null;
  moneda?: string;
  observacion?: string | null;
  [key: string]: any;
}

export async function crearServicioDirecto(input: CrearServicioDirectoInput): Promise<ServicioDirecto> {
  const id = crypto.randomUUID();
  return {
    id,
    codigo: `SD-${Date.now().toString().slice(-6)}`,
    estado: 'en_proceso',
    moneda: input.moneda || 'USD',
    proveedor_id: input.proveedorId,
    items: input.lineas,
  };
}

export async function enviarServicioAPagar(_input: any): Promise<void> {
  // stub
}

export async function urlAdjuntoServicio(path: string): Promise<string> {
  try {
    const { data } = await supabase.storage.from('servicios-directos').createSignedUrl(path, 3600);
    return data?.signedUrl || '';
  } catch {
    return '';
  }
}

export async function eliminarServicioDirecto(_servicio: ServicioDirecto): Promise<void> {
  // stub
}
