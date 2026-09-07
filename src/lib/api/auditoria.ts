import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver } from './rpc'
import { descargarCsv } from './libros'

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
  /**
   * De qué módulo es la tabla tocada.
   *
   * Contesta «¿qué pasó ayer en Nómina?» sin que quien pregunta tenga que saber
   * qué tablas son de Nómina. Sale de `auditoria_modulos`, que es un mapa
   * corregible, y se congela al escribirse: lo ya registrado sigue diciendo
   * dónde pasó aunque el mapa cambie después.
   */
  modulo: string | null
  /**
   * El porqué, cuando la fila lo llevaba.
   *
   * Estaba guardado dentro de `despues` y había que abrir el JSON para leerlo.
   * Ahora sube a columna, así que se puede leer de un vistazo y filtrar por él.
   */
  motivo: string | null
}

export interface FiltrosAuditoria {
  desde?: string
  hasta?: string
  usuario_id?: string
  tabla?: string
  modulo?: string
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
      /*
        Se lee de `v_auditoria` y no de la tabla.

        La tabla es inmutable —y debe serlo— así que los 1.024 registros
        anteriores al 7/09/2026 no tienen las columnas nuevas. La vista las
        deduce al leer: el módulo desde el mapa y el motivo desde el JSON. Así
        el registro se ve entero desde el primer día sin haber reescrito una
        sola fila.
      */
      let q = supabase
        .from('v_auditoria')
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
      if (filtros.modulo) q = q.eq('modulo', filtros.modulo)
      if (filtros.operacion) q = q.eq('operacion', filtros.operacion)
      if (filtros.texto?.trim()) {
        const t = filtros.texto.trim()
        // El motivo entra en la búsqueda: «¿quién anuló algo por daño?» es una
        // pregunta que se hace por el porqué y no por el nombre de nadie.
        q = q.or(
          `etiqueta.ilike.%${t}%,usuario.ilike.%${t}%,nombre.ilike.%${t}%,motivo.ilike.%${t}%`,
        )
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
 * Los módulos que aparecen en el registro, para el desplegable.
 *
 * Del mapa y no de lo anotado: a diferencia de las tablas, aquí sí interesa
 * ofrecer un módulo donde todavía no ha pasado nada. Que Explotación salga
 * vacía es una respuesta —«ahí no se ha tocado nada»— y no un hueco.
 */
export function useModulosAuditados() {
  return useQuery({
    queryKey: ['auditoria', 'modulos'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const filas = desenvolver<{ modulo: string }[]>(
        await supabase.from('auditoria_modulos').select('modulo'),
      )
      return [...new Set(filas.map((f) => f.modulo))].sort()
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

// ---------------------------------------------------------------------------
// La copia del registro
// ---------------------------------------------------------------------------

/**
 * Cuántos renglones se lleva una copia como máximo.
 *
 * No es una preferencia: una descarga sin tope es una consulta que puede tumbar
 * el navegador con el registro de un año. Si se llega al tope se avisa, que es
 * lo que separa una copia incompleta de una copia incompleta y silenciosa.
 */
export const TOPE_DE_COPIA = 5000

/**
 * El registro filtrado, entero, para llevárselo.
 *
 * Respeta los filtros de la pantalla y NO la paginación: quien pide una copia
 * quiere lo que está mirando, no los sesenta renglones que le caben en el
 * cristal. Es la misma consulta sin `range`.
 */
async function traerParaCopiar(filtros: FiltrosAuditoria): Promise<Movimiento[]> {
  let q = supabase
    .from('v_auditoria')
    .select('*')
    .order('ocurrido_en', { ascending: false })
    .order('id', { ascending: false })
    .limit(TOPE_DE_COPIA)

  if (!filtros.incluirSistema) q = q.not('usuario_id', 'is', null)
  if (filtros.desde) q = q.gte('ocurrido_en', `${filtros.desde}T00:00:00`)
  if (filtros.hasta) q = q.lte('ocurrido_en', `${filtros.hasta}T23:59:59.999`)
  if (filtros.usuario_id) q = q.eq('usuario_id', filtros.usuario_id)
  if (filtros.tabla) q = q.eq('tabla', filtros.tabla)
  if (filtros.modulo) q = q.eq('modulo', filtros.modulo)
  if (filtros.operacion) q = q.eq('operacion', filtros.operacion)
  if (filtros.texto?.trim()) {
    const t = filtros.texto.trim()
    q = q.or(`etiqueta.ilike.%${t}%,usuario.ilike.%${t}%,nombre.ilike.%${t}%,motivo.ilike.%${t}%`)
  }

  return desenvolver<Movimiento[]>(await q)
}

const marcaDeTiempo = () =>
  new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '')

/**
 * La copia en CSV, para abrirla en una hoja de cálculo.
 *
 * Va sin el `antes` y el `despues` completos a propósito: son dos objetos JSON
 * que en una celda no se leen y que hacen el archivo diez veces más grande. Lo
 * que llevan estas columnas es lo que se lee de corrido —quién, cuándo, qué,
 * dónde, por qué y qué campos cambiaron—, que es para lo que se abre una hoja.
 *
 * Quien necesite el detalle completo se lleva el JSON, que está al lado.
 */
export async function copiarAuditoriaCsv(filtros: FiltrosAuditoria): Promise<number> {
  const filas = await traerParaCopiar(filtros)

  descargarCsv(
    `registro-${marcaDeTiempo()}.csv`,
    ['Cuándo', 'Usuario', 'Nombre', 'Módulo', 'Qué', 'Operación', 'Cuál', 'Por qué', 'Cambió', 'IP'],
    filas.map((f) => [
      valorLegible(f.ocurrido_en),
      f.usuario ?? '',
      f.nombre ?? '',
      f.modulo ?? '',
      nombreDeTabla(f.tabla),
      VERBOS[f.operacion] ?? f.operacion,
      f.etiqueta ?? '',
      f.motivo ?? '',
      cambiosDeFondo(f.cambios).map(nombreDeCampo).join(', '),
      f.ip ?? '',
    ]),
  )

  return filas.length
}

/**
 * La copia en JSON, con el antes y el después enteros.
 *
 * Esta es la que sirve para averiguar qué pasó de verdad: lleva cada fila tal
 * como quedó registrada, sin traducir ni recortar. Es la que pidió Christopher
 * pensando en nosotros —«más para nosotros que para el usuario»— y la que
 * habría convertido la investigación del 5 de septiembre en una consulta.
 *
 * Se envuelve en un objeto con la fecha y los filtros usados, y no en un array
 * pelado: un archivo de registro que no dice de dónde salió ni qué se pidió es
 * un archivo que dentro de un mes no se puede defender.
 */
export async function copiarAuditoriaJson(filtros: FiltrosAuditoria): Promise<number> {
  const filas = await traerParaCopiar(filtros)

  const contenido = {
    sistema: 'La Cantera · Minería Internacional TS',
    extraido_en: new Date().toISOString(),
    filtros,
    completo: filas.length < TOPE_DE_COPIA,
    tope: TOPE_DE_COPIA,
    renglones: filas.length,
    registro: filas,
  }

  const blob = new Blob([JSON.stringify(contenido, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `registro-${marcaDeTiempo()}.json`
  a.click()
  URL.revokeObjectURL(url)

  return filas.length
}
