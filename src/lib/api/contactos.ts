import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/*
  EL DIRECTORIO DE CONTACTOS

  Christopher, 24/09/2026: «un módulo de contactos donde se almacenen los
  contactos generales del sistema… lo básico y lo que cubra los escenarios».
  Personas y empresas con sus canales, dirección, etiquetas y quién los
  atiende. Un contacto puede ser la persona detrás de un cliente, un
  proveedor o un trabajador que ya existe: se enlaza, no se duplica.

  LA BASE MANDA EN LO QUE IMPORTA: el control de repetidos (correo en
  minúsculas, teléfono por sus dígitos) y el texto de búsqueda sin acentos
  los mantiene ella. La pantalla filtra y muestra.
*/

export type TipoContacto = 'PERSONA' | 'EMPRESA'
export type EstadoContacto = 'ACTIVO' | 'INACTIVO' | 'BLOQUEADO'

export interface Contacto {
  id: number
  tipo: TipoContacto
  tratamiento: string | null
  nombres: string | null
  apellidos: string | null
  razon_social: string | null
  /** La razón social, o nombres y apellidos. Lo pone la base. */
  nombre: string
  documento: string | null
  empresa_id: number | null
  /** El nombre de la empresa enlazada, si la hay. */
  empresa: string | null
  /** La empresa escrita a mano, cuando no está en el directorio. */
  empresa_nombre: string | null
  cargo: string | null
  correo: string | null
  correo_secundario: string | null
  telefono_oficina: string | null
  extension: string | null
  celular: string | null
  whatsapp: string | null
  direccion: string | null
  ciudad: string | null
  estado_region: string | null
  codigo_postal: string | null
  pais: string
  sitio_web: string | null
  linkedin: string | null
  instagram: string | null
  facebook: string | null
  otra_red: string | null
  etiquetas: string[]
  origen: string | null
  asignado_a: string | null
  asignado: string | null
  estado: EstadoContacto
  estado_motivo: string | null
  cliente_id: number | null
  cliente: string | null
  proveedor_id: number | null
  proveedor: string | null
  empleado_id: number | null
  empleado: string | null
  nota: string | null
  /** Cuántas personas del directorio tienen a esta empresa como suya. */
  personas: number
  busqueda: string
  creado_en: string
  actualizado_en: string | null
}

/** Lo que se teclea. Todo texto: la base convierte y valida. */
export interface DatosContacto {
  tipo: TipoContacto
  tratamiento: string
  nombres: string
  apellidos: string
  razon_social: string
  documento: string
  empresa_id: string
  empresa_nombre: string
  cargo: string
  correo: string
  correo_secundario: string
  telefono_oficina: string
  extension: string
  celular: string
  whatsapp: string
  direccion: string
  ciudad: string
  estado_region: string
  codigo_postal: string
  pais: string
  sitio_web: string
  linkedin: string
  instagram: string
  facebook: string
  otra_red: string
  etiquetas: string[]
  origen: string
  asignado_a: string
  estado: EstadoContacto
  estado_motivo: string
  cliente_id: string
  proveedor_id: string
  empleado_id: string
  nota: string
}

export interface EtiquetaDeContacto {
  codigo: string
  nombre: string
  orden: number
  activa: boolean
}

export interface DuplicadoDeContacto {
  id_a: number
  nombre_a: string
  id_b: number
  nombre_b: string
  por: string
}

export const ESTADOS_DE_CONTACTO: Record<EstadoContacto, { etiqueta: string; tono: 'success' | 'neutral' | 'danger' }> = {
  ACTIVO: { etiqueta: 'Activo', tono: 'success' },
  INACTIVO: { etiqueta: 'Inactivo', tono: 'neutral' },
  BLOQUEADO: { etiqueta: 'Bloqueado', tono: 'danger' },
}

export const TRATAMIENTOS = ['SR.', 'SRA.', 'ING.', 'LIC.', 'DR.', 'DRA.', 'ABG.', 'TSU']

/** De dónde suele venir un contacto aquí. Es texto libre; esto solo sugiere. */
export const ORIGENES_SUGERIDOS = [
  'RECOMENDADO',
  'VISITA A LA CANTERA',
  'LLAMADA',
  'WHATSAPP',
  'FERIA',
  'SITIO WEB',
  'REDES SOCIALES',
  'LICITACIÓN',
  'PROVEEDOR ACTUAL',
  'CLIENTE ACTUAL',
]

export const ESTADOS_DE_VENEZUELA = [
  'AMAZONAS', 'ANZOÁTEGUI', 'APURE', 'ARAGUA', 'BARINAS', 'BOLÍVAR', 'CARABOBO', 'COJEDES',
  'DELTA AMACURO', 'DISTRITO CAPITAL', 'FALCÓN', 'GUÁRICO', 'LA GUAIRA', 'LARA', 'MÉRIDA',
  'MIRANDA', 'MONAGAS', 'NUEVA ESPARTA', 'PORTUGUESA', 'SUCRE', 'TÁCHIRA', 'TRUJILLO',
  'YARACUY', 'ZULIA',
]

export function datosVacios(): DatosContacto {
  return {
    tipo: 'PERSONA',
    tratamiento: '',
    nombres: '',
    apellidos: '',
    razon_social: '',
    documento: '',
    empresa_id: '',
    empresa_nombre: '',
    cargo: '',
    correo: '',
    correo_secundario: '',
    telefono_oficina: '',
    extension: '',
    celular: '',
    whatsapp: '',
    direccion: '',
    ciudad: '',
    estado_region: 'BOLÍVAR',
    codigo_postal: '',
    pais: 'VENEZUELA',
    sitio_web: '',
    linkedin: '',
    instagram: '',
    facebook: '',
    otra_red: '',
    etiquetas: [],
    origen: '',
    asignado_a: '',
    estado: 'ACTIVO',
    estado_motivo: '',
    cliente_id: '',
    proveedor_id: '',
    empleado_id: '',
    nota: '',
  }
}

export function datosDe(c: Contacto): DatosContacto {
  const t = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v))
  return {
    tipo: c.tipo,
    tratamiento: t(c.tratamiento),
    nombres: t(c.nombres),
    apellidos: t(c.apellidos),
    razon_social: t(c.razon_social),
    documento: t(c.documento),
    empresa_id: t(c.empresa_id),
    empresa_nombre: t(c.empresa_nombre),
    cargo: t(c.cargo),
    correo: t(c.correo),
    correo_secundario: t(c.correo_secundario),
    telefono_oficina: t(c.telefono_oficina),
    extension: t(c.extension),
    celular: t(c.celular),
    whatsapp: t(c.whatsapp),
    direccion: t(c.direccion),
    ciudad: t(c.ciudad),
    estado_region: t(c.estado_region),
    codigo_postal: t(c.codigo_postal),
    pais: t(c.pais) || 'VENEZUELA',
    sitio_web: t(c.sitio_web),
    linkedin: t(c.linkedin),
    instagram: t(c.instagram),
    facebook: t(c.facebook),
    otra_red: t(c.otra_red),
    etiquetas: c.etiquetas ?? [],
    origen: t(c.origen),
    asignado_a: t(c.asignado_a),
    estado: c.estado,
    estado_motivo: t(c.estado_motivo),
    cliente_id: t(c.cliente_id),
    proveedor_id: t(c.proveedor_id),
    empleado_id: t(c.empleado_id),
    nota: t(c.nota),
  }
}

/* ───────────────────────────────────────────── enlaces que abren algo */

/** Solo dígitos, con el 58 delante: lo que entiende wa.me. */
export function telefonoParaWhatsApp(v: string | null | undefined): string | null {
  const d = (v ?? '').replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('58')) return d
  return '58' + d.replace(/^0/, '')
}

export const enlaceWhatsApp = (v: string | null | undefined): string | null => {
  const d = telefonoParaWhatsApp(v)
  return d ? `https://wa.me/${d}` : null
}

export const enlaceLlamada = (v: string | null | undefined): string | null =>
  v ? `tel:${v.replace(/[^\d+]/g, '')}` : null

/** Sin Google Maps integrado: un enlace al mapa armado con la dirección escrita. */
export function enlaceMapa(c: Pick<Contacto, 'direccion' | 'ciudad' | 'estado_region' | 'pais'>): string | null {
  const partes = [c.direccion, c.ciudad, c.estado_region, c.pais].filter(Boolean)
  return partes.length ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(partes.join(', '))}` : null
}

/** Una dirección web sin protocolo abre igual. */
export const enlaceWeb = (v: string | null | undefined): string | null =>
  v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : null

/* ───────────────────────────────────────────── consultas */

export function useContactos() {
  return useQuery({
    queryKey: ['contactos'],
    queryFn: async () =>
      desenvolver<Contacto[]>(await supabase.from('v_contactos').select('*').order('nombre')),
  })
}

export function useEtiquetasDeContacto() {
  return useQuery({
    queryKey: ['contactos', 'etiquetas'],
    queryFn: async () =>
      desenvolver<EtiquetaDeContacto[]>(
        await supabase.from('contacto_etiquetas').select('*').order('orden').order('nombre'),
      ),
  })
}

export function useDuplicadosDeContactos() {
  return useQuery({
    queryKey: ['contactos', 'duplicados'],
    queryFn: () => rpc<DuplicadoDeContacto[]>('contactos_duplicados', {}),
  })
}

/** Para enlazar un contacto a lo que ya existe. Quien no lee ese módulo ve la lista vacía. */
export function useEnlazables() {
  return useQuery({
    queryKey: ['contactos', 'enlazables'],
    queryFn: async () => {
      const [clientes, proveedores, empleados] = await Promise.all([
        supabase.from('clientes').select('id, nombre, rif').eq('activo', true).order('nombre'),
        supabase.from('proveedores').select('id, nombre, rif').eq('activo', true).order('nombre'),
        supabase.from('empleados').select('id, nombres, apellidos, cedula').eq('activo', true).order('apellidos'),
      ])
      const lista = <T,>(r: { data: T[] | null }) => r.data ?? []
      return {
        clientes: lista<{ id: number; nombre: string; rif: string }>(clientes),
        proveedores: lista<{ id: number; nombre: string; rif: string }>(proveedores),
        empleados: lista<{ id: number; nombres: string; apellidos: string; cedula: string }>(empleados),
      }
    },
  })
}

/* ───────────────────────────────────────────── acciones */

function useAccion<A, R = unknown>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['contactos'] }),
  })
}

export function useGuardarContacto() {
  return useAccion(
    (c: { id: number | null; datos: DatosContacto; aunqueParezcaRepetido?: boolean }) =>
      rpc<number>('guardar_contacto', {
        p_id: c.id,
        p_datos: c.datos,
        p_aunque_parezca_repetido: c.aunqueParezcaRepetido ?? false,
      }),
  )
}

export function useEliminarContacto() {
  return useAccion((id: number) => rpc<void>('eliminar_contacto', { p_id: id }))
}

export function useCargarContactos() {
  return useAccion((filas: DatosContacto[]) => rpc<number>('cargar_contactos', { p_filas: filas }))
}

export function useGuardarEtiquetaDeContacto() {
  return useAccion((e: { codigo: string; nombre: string; activa: boolean }) =>
    rpc<void>('guardar_etiqueta_de_contacto', { p_codigo: e.codigo, p_nombre: e.nombre, p_activa: e.activa }),
  )
}

/** Si el error de guardar es «ya existe otro con ese correo o teléfono». */
export const esErrorDeRepetido = (e: unknown): boolean =>
  e instanceof Error && /Ya existe «/.test(e.message)
