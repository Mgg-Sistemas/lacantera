import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver } from './rpc'

/**
 * El registro de lo que hace cada quien.
 *
 * Solo lee. No hay funciones de escritura y no las va a haber: las filas las
 * pone un disparador dentro de la base, y la tabla rechaza cualquier UPDATE o
 * DELETE. Un registro de auditoría con una puerta para escribirlo desde la
 * aplicación no sería un registro de auditoría.
 */

export type Operacion = 'INSERT' | 'UPDATE' | 'DELETE' | 'ACCESO' | 'CLAVE'

export interface Movimiento {
  id: number
  ocurrido_en: string
  usuario_id: string | null
  usuario: string
  nombre: string | null
  tabla: string
  operacion: Operacion
  fila_id: string | null
  etiqueta: string | null
  antes: Record<string, unknown> | null
  despues: Record<string, unknown> | null
  cambios: string[] | null
  ip: string | null
}

export interface FiltrosAuditoria {
  desde?: string
  hasta?: string
  usuario_id?: string
  tabla?: string
  operacion?: string
  texto?: string
  /**
   * Traer también lo que hizo el sistema por su cuenta. Apagado por defecto.
   *
   * Ver la nota en la consulta: una limpieza de mantenimiento escribe cientos
   * de renglones de golpe y tapa lo que hicieron las personas, que es a lo que
   * se entra a esta pantalla.
   */
  incluirSistema?: boolean
}

/** Cuántos renglones se traen de una vez. */
export const POR_PAGINA = 60

export function useAuditoria(filtros: FiltrosAuditoria, pagina: number) {
  return useQuery({
    queryKey: ['auditoria', filtros, pagina],
    queryFn: async () => {
      let q = supabase
        .from('auditoria')
        .select('*', { count: 'exact' })
        .order('ocurrido_en', { ascending: false })
        .order('id', { ascending: false })
        .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1)

      /*
        Por defecto, solo lo que hizo alguien.

        Un mantenimiento —una limpieza de datos, una migración que reordena
        filas— escribe cientos de renglones en el mismo segundo, todos con la
        misma pinta que si una persona hubiera borrado una factura a mano. El
        18 de agosto una limpieza de datos de prueba dejó 95 renglones rojos
        seguidos y hubo que borrarlos para que la pantalla volviera a ser
        legible. Esto evita tener que volver a tocar la bitácora: los registros
        se quedan, simplemente no tapan.

        La marca no es el nombre `SISTEMA` sino `usuario_id` nulo, que es la
        diferencia de verdad: lo que corre sin sesión no tiene quién. Filtrar
        por el texto fallaría el día que alguien llame a un usuario así.
      */
      if (!filtros.incluirSistema) q = q.not('usuario_id', 'is', null)

      if (filtros.desde) q = q.gte('ocurrido_en', `${filtros.desde}T00:00:00`)
      // Hasta el final del día elegido: quien escribe "hasta el 30" espera que
      // lo del 30 por la tarde entre, no que se corte a medianoche del 29.
      if (filtros.hasta) q = q.lte('ocurrido_en', `${filtros.hasta}T23:59:59.999`)
      if (filtros.usuario_id) q = q.eq('usuario_id', filtros.usuario_id)
      if (filtros.tabla) q = q.eq('tabla', filtros.tabla)
      if (filtros.operacion) q = q.eq('operacion', filtros.operacion)
      if (filtros.texto?.trim()) {
        const t = filtros.texto.trim()
        q = q.or(`etiqueta.ilike.%${t}%,usuario.ilike.%${t}%,nombre.ilike.%${t}%`)
      }

      const { data, error, count } = await q
      return {
        filas: desenvolver<Movimiento[]>({ data, error }),
        total: count ?? 0,
      }
    },
  })
}

/**
 * Las tablas que aparecen en el registro, para el desplegable.
 *
 * Se sacan de lo que hay anotado y no de una lista escrita a mano: así el
 * filtro nunca ofrece una tabla en la que no ha pasado nada, ni deja fuera una
 * que se añadió después.
 */
export function useTablasAuditadas() {
  return useQuery({
    queryKey: ['auditoria', 'tablas'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const filas = desenvolver<{ tabla: string }[]>(
        await supabase.from('auditoria').select('tabla').limit(5000),
      )
      return [...new Set(filas.map((f) => f.tabla))].sort()
    },
  })
}

/**
 * Cómo se llama cada tabla en castellano.
 *
 * Sin esto el registro dice «ordenes_compra» y «nomina_novedades_montos», que
 * son nombres para la base, no para quien audita. Lo que falte cae al nombre
 * crudo con los guiones bajos convertidos en espacios: se lee peor, pero se lee.
 */
const NOMBRES: Record<string, string> = {
  acceso: 'Entrada al sistema',
  clave: 'Cambio de clave',
  almacenes: 'Almacén',
  articulos: 'Artículo',
  compras_bitacora: 'Bitácora de compra',
  cotizacion_renglones: 'Renglón de cotización',
  cotizaciones: 'Cotización',
  cuentas_tesoreria: 'Cuenta de tesorería',
  empleados: 'Trabajador',
  empresa: 'Datos de la empresa',
  empresa_documentos: 'Documento legal',
  instrucciones_pago: 'Instrucción de pago',
  inventario_movimientos: 'Movimiento de inventario',
  modulos: 'Módulo',
  monedas: 'Moneda',
  nomina_conceptos: 'Concepto de nómina',
  nomina_novedades: 'Novedad de nómina',
  nomina_novedades_montos: 'Monto de novedad',
  nomina_parametros: 'Parámetro de nómina',
  nomina_periodos: 'Período de nómina',
  nomina_recibos: 'Recibo de pago',
  nomina_tabulador: 'Tabulador de cargos',
  orden_renglones: 'Renglón de orden',
  ordenes_compra: 'Orden de compra',
  perfiles: 'Perfil de usuario',
  proveedores: 'Proveedor',
  rol_permisos: 'Permiso de un rol',
  roles: 'Rol',
  solicitud_renglones: 'Renglón de pedido',
  solicitudes_pedido: 'Pedido',
  tasas_cambio: 'Tasa de cambio',
  tesoreria_movimientos: 'Movimiento de tesorería',
  tipos_documento_legal: 'Tipo de documento legal',
  unidades: 'Unidad de medida',
  usuarios_roles: 'Rol de un usuario',
}

export const nombreDeTabla = (tabla: string): string =>
  NOMBRES[tabla] ?? tabla.replaceAll('_', ' ')

/**
 * Cómo se llama cada columna.
 *
 * Solo las que se repiten por todo el sistema o las que serían un jeroglífico.
 * El resto cae al nombre de la columna con los guiones bajos abiertos, que casi
 * siempre se entiende: `fecha_ingreso` se lee «fecha ingreso» y basta.
 */
const CAMPOS: Record<string, string> = {
  activo: 'Activo',
  anulada_en: 'Anulada el',
  aprobada_en: 'Aprobada el',
  archivado_en: 'Archivado el',
  archivado_por: 'Archivado por',
  archivado_motivo: 'Motivo del archivo',
  banco: 'Banco',
  base_estipulacion: 'Salario estipulado',
  cantidad: 'Cantidad',
  cargo: 'Cargo',
  cedula: 'Cédula',
  codigo: 'Código',
  descripcion: 'Descripción',
  estado: 'Estado',
  fecha_egreso: 'Fecha de egreso',
  fecha_ingreso: 'Fecha de ingreso',
  fecha_ingreso_confirmada: 'Fecha de ingreso confirmada',
  moneda: 'Moneda',
  moneda_salario: 'Moneda del salario',
  monto: 'Monto',
  nivel: 'Nivel de permiso',
  nombre: 'Nombre',
  nombres: 'Nombres',
  apellidos: 'Apellidos',
  numero: 'Número',
  numero_cuenta: 'Número de cuenta',
  nota: 'Nota',
  precio: 'Precio',
  salario_base: 'Salario',
  sueldo_mensual: 'Sueldo mensual',
  // El campo ya no existe: se quitó del tabulador el 06/08/2026 porque el
  // beneficio de alimentación vive en Parámetros y allí es donde se paga. La
  // traducción se queda para que los asientos viejos se sigan leyendo: la
  // bitácora es historia, y una historia con nombres en clave no se lee.
  bono_mensual: 'Bono de alimentación',
  tabulador_id: 'Nivel del tabulador',
  tasa: 'Tasa',
  telefono: 'Teléfono',
  telefono_pago: 'Teléfono de pago móvil',
  total: 'Total',
  valor: 'Valor',
}

export const nombreDeCampo = (campo: string): string =>
  CAMPOS[campo] ?? campo.replaceAll('_', ' ')

/** Qué hizo, en una palabra. */
export const VERBOS: Record<Operacion, string> = {
  INSERT: 'Creó',
  UPDATE: 'Modificó',
  DELETE: 'Borró',
  ACCESO: 'Entró al sistema',
  CLAVE: 'Cambió una clave',
}

export const TONO: Record<Operacion, 'success' | 'info' | 'danger' | 'royal' | 'warning'> = {
  INSERT: 'success',
  UPDATE: 'info',
  DELETE: 'danger',
  ACCESO: 'royal',
  CLAVE: 'warning',
}

/**
 * Las columnas que solo dicen quién guardó y cuándo.
 *
 * Cambian en cada escritura, así que salen en TODAS las modificaciones. Un
 * cambio de sueldo se veía así:
 *
 *   actualizado en   2026-07-29T19:16:25.502119+00:00 → 2026-07-30T15:55:54…
 *   actualizado por  —                                → e0a9d9b2-12c5-42f9-…
 *   Sueldo mensual   310                              → 330
 *
 * Dos renglones de ruido delante del único que se estaba buscando. Y es ruido
 * REPETIDO: quién lo hizo y a qué hora ya están arriba, en la cabecera de este
 * mismo movimiento, con el nombre de la persona en vez de su identificador.
 *
 * No se pierden: siguen guardados en la fila del registro, que es inmutable.
 * Lo que se quita es enseñarlos dos veces y peor la segunda.
 */
const DE_REGISTRO = new Set([
  'creado_en', 'creado_por',
  'actualizado_en', 'actualizado_por',
  'registrado_en', 'registrado_por',
  'calculado_en', 'modificado_en', 'modificado_por',
])

export const esDeRegistro = (campo: string): boolean => DE_REGISTRO.has(campo)

/** Los campos que de verdad cambiaron, sin la contabilidad del guardado. */
export const cambiosDeFondo = (cambios: string[] | null): string[] =>
  (cambios ?? []).filter((c) => !DE_REGISTRO.has(c))

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

/**
 * Un valor del registro, listo para leer.
 *
 * `null` no se muestra como la palabra "null": eso es lenguaje de máquina y
 * dentro de un registro que alguien va a usar para explicar qué pasó, se lee
 * como si el valor fuera la cadena "null" y no como que estaba vacío.
 */
export function valorLegible(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (typeof v === 'object') return JSON.stringify(v)

  // Las fechas viajan en el formato de la base. Enseñarlas tal cual obliga a
  // descifrar un huso horario para saber si fue por la mañana.
  const s = String(v)
  if (ISO.test(s)) {
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString('es-VE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    }
  }

  return s
}
