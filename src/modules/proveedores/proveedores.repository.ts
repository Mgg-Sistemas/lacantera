import { supabase } from '@/shared/lib/supabase';
import type { EstadoGenerico, Orden, Proveedor } from '@/shared/lib/types';
import { puntoValido, type PuntoMapa } from './ubicacionProveedor';

export type ProveedorInput = Omit<Proveedor, 'id' | 'created_at' | 'updated_at'>;
export type ProveedorPatch = Partial<ProveedorInput>;

/** Categorías sugeridas por defecto. Las nuevas que el usuario añada quedan en
 *  localStorage y se mezclan con éstas + con las que ya existen en proveedores. */
export const CATEGORIAS_DEFAULT = [
  'Explosivos',
  'EPP',
  'Herramientas',
  'Maquinaria',
  'Lubricantes',
  'Reactivos',
  'Repuestos',
  'Logística',
  'Químicos',
] as const;

// Mantengo el nombre viejo como alias mutable de la lista en uso por defecto,
// pero el código debe llamar a `getCategorias()` para incluir las añadidas.
export const CATEGORIAS_PROV = CATEGORIAS_DEFAULT;

/* Catálogo compartido: persistido en Supabase (tabla `taxonomias`) +
   categorías ya presentes en proveedores. */
import { addTaxonomia, deleteTaxonomia, listTaxonomia, renameTaxonomia } from '@/shared/lib/taxonomias';

export async function getCategorias(fromProveedores: Proveedor[] = []): Promise<string[]> {
  const set = new Set<string>();
  try {
    const extras = await listTaxonomia('proveedor.categoria');
    extras.forEach((c) => set.add(c));
  } catch { /* falla silenciosa */ }
  fromProveedores.forEach((p) => (p.categorias ?? []).forEach((c) => c && set.add(c)));
  if (set.size === 0) CATEGORIAS_DEFAULT.forEach((c) => set.add(c));
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'es-VE'));
}

export async function addCategoria(nombre: string, actorEmail?: string): Promise<string | null> {
  return addTaxonomia('proveedor.categoria', nombre, actorEmail);
}

/**
 * Renombra una categoría de proveedor:
 *  · Actualiza la fila de `taxonomias`.
 *  · Re-etiqueta los elementos del arreglo `proveedores.categorias` vía RPC.
 *  Devuelve la cantidad de proveedores afectados.
 */
export async function renombrarCategoria(oldNombre: string, newNombre: string, actorEmail?: string): Promise<number> {
  const oldClean = oldNombre.trim();
  const newClean = newNombre.trim();
  if (!oldClean || !newClean) throw new Error('Nombres vacíos');
  if (oldClean === newClean) return 0;

  await renameTaxonomia('proveedor.categoria', oldClean, newClean, actorEmail);

  const { data, error } = await supabase.rpc('renombrar_categoria_proveedor', {
    p_old: oldClean,
    p_new: newClean,
  });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export async function contarProveedoresPorCategoria(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('proveedores').select('categorias');
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const row of (data ?? []) as { categorias: string[] | null }[]) {
    (row.categorias ?? []).forEach((c) => { if (c) out[c] = (out[c] ?? 0) + 1; });
  }
  return out;
}

export async function eliminarCategoria(nombre: string): Promise<void> {
  const counts = await contarProveedoresPorCategoria();
  if ((counts[nombre] ?? 0) > 0) {
    throw new Error(`No se puede eliminar: ${counts[nombre]} proveedor(es) usan esta categoría`);
  }
  await deleteTaxonomia('proveedor.categoria', nombre);
}

export async function list(): Promise<Proveedor[]> {
  try {
    const { data, error } = await supabase
      .from('proveedores')
      .select('*');

    if (error) {
      console.warn('Error al consultar proveedores:', error);
      return [];
    }

    const normalizados = (data ?? []).map((p: any) => {
      const razon = p.razon_social || p.nombre || 'Proveedor';
      const estado = p.estado || (p.activo === false ? 'inactivo' : 'activo');
      return {
        ...p,
        id: String(p.id),
        razon_social: razon,
        nombre: p.nombre || razon,
        estado,
        activo: estado === 'activo',
        email: p.email || p.correo || null,
        rif: p.rif || '',
      };
    });

    return normalizados.sort((a: any, b: any) =>
      (a.razon_social || '').localeCompare(b.razon_social || '', 'es-VE')
    ) as Proveedor[];
  } catch (err) {
    console.warn('Fallo inesperado al listar proveedores:', err);
    return [];
  }
}

export async function getById(id: string): Promise<Proveedor | null> {
  try {
    const { data, error } = await supabase
      .from('proveedores')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.warn(`Error al consultar proveedor ${id}:`, error);
      return null;
    }
    if (!data) return null;
    const p = data as any;
    const razon = p.razon_social || p.nombre || 'Proveedor';
    const estado = p.estado || (p.activo === false ? 'inactivo' : 'activo');
    return {
      ...p,
      id: String(p.id),
      razon_social: razon,
      nombre: p.nombre || razon,
      estado,
      activo: estado === 'activo',
      email: p.email || p.correo || null,
      rif: p.rif || '',
    } as Proveedor;
  } catch {
    return null;
  }
}

function normalizarRifProveedor(raw: string | null | undefined): string {
  const limpio = String(raw ?? '').toUpperCase().replace(/[^VEJPGC0-9]/g, '');
  if (/^[VEJPGC][0-9]{9}$/.test(limpio)) {
    return `${limpio[0]}-${limpio.slice(1, 9)}-${limpio[9]}`;
  }
  return String(raw ?? '').trim().toUpperCase();
}

/** Traduce el error de RIF duplicado (constraint único) a un mensaje claro. */
function traducirError(error: { code?: string; message?: string } | null): Error {
  if (error?.code === '23505') return new Error('Ya existe un proveedor con ese RIF.');
  return new Error(error?.message || 'No se pudo guardar el proveedor.');
}

export async function insert(payload: ProveedorInput): Promise<Proveedor> {
  const rifNorm = normalizarRifProveedor(payload.rif);
  const nombre = (payload.razon_social || (payload as any).nombre || '').trim();
  const activo = payload.estado ? payload.estado === 'activo' : ((payload as any).activo ?? true);

  const { data: idRpc, error: errRpc } = await supabase.rpc('guardar_proveedor', {
    p_id: null,
    p_rif: rifNorm,
    p_nombre: nombre,
    p_nombre_comercial: (payload as any).nombre_comercial ?? null,
    p_contacto: payload.contacto ?? null,
    p_telefono: payload.telefono ?? null,
    p_correo: payload.email ?? (payload as any).correo ?? null,
    p_direccion: payload.direccion ?? null,
    p_condicion_pago: (payload as any).condicion_pago ?? 'CONTADO',
    p_moneda_preferida: (payload as any).moneda_preferida ?? 'USD',
    p_contribuyente_especial: (payload as any).contribuyente_especial ?? false,
    p_notas: (payload as any).notas ?? null,
    p_activo: activo,
    p_metodo_pago_preferido: (payload as any).metodo_pago_preferido ?? null,
  });

  if (errRpc) throw traducirError(errRpc);

  const nuevoId = String(idRpc);
  const creado = await getById(nuevoId);
  if (creado) return creado;

  return {
    id: nuevoId,
    rif: rifNorm,
    razon_social: nombre,
    contacto: payload.contacto ?? null,
    telefono: payload.telefono ?? null,
    email: payload.email ?? (payload as any).correo ?? null,
    direccion: payload.direccion ?? null,
    categorias: payload.categorias ?? [],
    origen: payload.origen ?? 'nacional',
    estado: activo ? 'activo' : 'inactivo',
    created_at: new Date().toISOString(),
  } as Proveedor;
}

export async function update(id: string, patch: ProveedorPatch): Promise<Proveedor> {
  const actual = (await getById(id)) as any;
  const rifNorm = normalizarRifProveedor(patch.rif ?? actual?.rif ?? '');
  const nombre = (patch.razon_social ?? (patch as any).nombre ?? actual?.razon_social ?? actual?.nombre ?? '').trim();
  const activo = patch.estado
    ? patch.estado === 'activo'
    : ((patch as any).activo ?? actual?.activo ?? true);
  const idNum = Number(id);

  const { error: errRpc } = await supabase.rpc('guardar_proveedor', {
    p_id: Number.isFinite(idNum) ? idNum : id,
    p_rif: rifNorm,
    p_nombre: nombre,
    p_nombre_comercial: (patch as any).nombre_comercial ?? actual?.nombre_comercial ?? null,
    p_contacto: patch.contacto !== undefined ? patch.contacto : (actual?.contacto ?? null),
    p_telefono: patch.telefono !== undefined ? patch.telefono : (actual?.telefono ?? null),
    p_correo: patch.email !== undefined ? patch.email : ((patch as any).correo ?? actual?.correo ?? actual?.email ?? null),
    p_direccion: patch.direccion !== undefined ? patch.direccion : (actual?.direccion ?? null),
    p_condicion_pago: (patch as any).condicion_pago ?? actual?.condicion_pago ?? 'CONTADO',
    p_moneda_preferida: (patch as any).moneda_preferida ?? actual?.moneda_preferida ?? 'USD',
    p_contribuyente_especial: (patch as any).contribuyente_especial ?? actual?.contribuyente_especial ?? false,
    p_notas: (patch as any).notas ?? actual?.notas ?? null,
    p_activo: activo,
    p_metodo_pago_preferido: (patch as any).metodo_pago_preferido ?? actual?.metodo_pago_preferido ?? null,
  });

  if (errRpc) throw traducirError(errRpc);

  if (patch.actividad_economica !== undefined || patch.numero_administracion !== undefined) {
    await supabase.rpc('retencion_guardar_perfil_proveedor', {
      p_id: Number.isFinite(idNum) ? idNum : id,
      p_datos: {
        ...(patch.actividad_economica !== undefined ? { actividad_economica: patch.actividad_economica } : {}),
        ...(patch.numero_administracion !== undefined ? { numero_administracion: patch.numero_administracion } : {}),
      },
    }).then(() => undefined, () => undefined);
  }

  const actualizado = await getById(id);
  if (actualizado) return actualizado;

  return {
    ...(actual ?? {}),
    ...patch,
    id: String(id),
    rif: rifNorm,
    razon_social: nombre,
    estado: activo ? 'activo' : 'inactivo',
  } as Proveedor;
}

export async function toggleEstado(id: string, estado: EstadoGenerico): Promise<Proveedor> {
  return update(id, { estado });
}

/**
 * Histórico de órdenes de un proveedor. Se ordena por fecha desc para que el
 * detalle muestre primero lo más reciente. El conteo de "recibidas" se calcula
 * en el caller para evitar un segundo round-trip.
 */
export async function getOrdenesByProveedor(proveedorId: string): Promise<Orden[]> {
  const { data, error } = await supabase
    .from('ordenes')
    .select('*')
    .eq('proveedor_id', proveedorId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Orden[];
}

/**
 * 03/11/2026: la ubicación del local (proveedores.lat / lng) para Delivery. Va aparte del
 * resto de la ficha porque `Proveedor` (tipos compartidos) no la trae; `null` la quita.
 * El trigger de la base anota quién y cuándo. Escritura: RLS de Proveedores.
 */
export async function guardarUbicacion(id: string, punto: PuntoMapa | null): Promise<void> {
  const { error } = await supabase.from('proveedores')
    .update({ lat: punto?.lat ?? null, lng: punto?.lng ?? null })
    .eq('id', id);
  if (error) throw new Error(error.message || 'No se pudo guardar la ubicación del proveedor.');
}

/** La ubicación que trae la fila (select *), validada. */
export function ubicacionDe(p: Proveedor | null | undefined): PuntoMapa | null {
  const r = p as (Proveedor & { lat?: unknown; lng?: unknown }) | null | undefined;
  return r ? puntoValido(r.lat, r.lng) : null;
}

/** Guarda el número de administración en la ficha del proveedor. Va por RPC porque quien
 *  indica el método de pago (Compras) puede no tener permiso de escritura en Proveedores. */
export async function fijarNumeroAdministracion(proveedorId: string, numero: string): Promise<void> {
  const { error } = await supabase.rpc('proveedor_fijar_numero_administracion', { p_proveedor_id: proveedorId, p_numero: numero });
  if (error) throw new Error(error.message || 'No se pudo guardar el número de administración del proveedor.');
}
