import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'
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
/*
  ERA UNA LISTA Y FALLABA POR EL GENERO.

  Estaban `creado_en` y `creado_por`, en masculino, porque asi se llaman en casi
  todas las tablas. `articulo_presentaciones` los llama `creada_en` y
  `creada_por` — y por eso la ficha de una presentacion ensenaba
  «creada por 1b2ce2a7-d656-47ed-a583-8bd61d2af667», justo el identificador
  ilegible que esta lista existe para quitar.

  Lo levanto Christopher el 8/09/2026 con la ficha delante. Es la misma forma
  que llevo toda la semana persiguiendo: la regla escrita que no alcanza a la
  tabla de al lado. Un patron la alcanza; una lista, no.
*/
const DE_REGISTRO = /^(cread|actualizad|registrad|modificad|calculad)[oa]_(en|por)$/

export const esDeRegistro = (campo: string): boolean => DE_REGISTRO.test(campo)

/*
  EL ORDEN LO DECIDE EL SIGNIFICADO, NO `jsonb`.

  `to_jsonb` ordena las claves por LONGITUD DEL NOMBRE y luego alfabeticamente.
  En una presentacion eso daba:

      id(2) · activa(6) · unidades(8) · creada_en(9) · creada_por(10) ·
      articulo_id(11) · por_defecto(11) · presentacion(12)

  O sea: lo primero que se leia era un `id`, y `presentacion` —lo unico que
  identifica la fila— quedaba la ultima, debajo del pliegue. No faltaba: estaba
  donde nadie la ve.

  Aqui van delante los campos que dicen QUE es la fila. El resto detras, por su
  rotulo, que al menos es un orden que una persona puede predecir.
*/
const PRIMERO = [
  'numero', 'numero_control', 'numero_guia', 'numero_factura',
  'nombre', 'nombres', 'apellidos', 'razon_social', 'titulo', 'descripcion',
  'codigo', 'presentacion', 'unidad', 'unidades', 'cantidad',
  'articulo_id', 'empleado_id', 'maquina_id', 'almacen_id', 'cliente_id',
  'proveedor_id', 'periodo_id', 'orden_id',
]

/** Los campos de una fila, ordenados para leerlos y no para almacenarlos. */
export function camposOrdenados(
  fila: Record<string, unknown>,
  rotulo: (campo: string) => string,
): [string, unknown][] {
  const peso = (c: string) => {
    const i = PRIMERO.indexOf(c)
    return i === -1 ? PRIMERO.length : i
  }
  return Object.entries(fila)
    .filter(([k, v]) => v !== null && v !== '' && !esDeRegistro(k))
    .sort(([a], [b]) => peso(a) - peso(b) || rotulo(a).localeCompare(rotulo(b), 'es'))
}

/*
  LO QUE LA FICHA APARTA, PARA QUIEN QUIERA VERLO.

  `camposOrdenados` quita dos cosas: los campos de registro —quien guardo y
  cuando, que ya estan en la cabecera— y los vacios, que no dicen nada. Es lo
  correcto para leer de un vistazo y es una perdida cuando lo que se esta
  haciendo es AUDITAR: ahi «este campo estaba vacio» ES el dato, y hay que poder
  verlo sin salir de la ficha ni abrir la consola.

  Por eso se apartan y no se tiran: la ficha los ensena detras de un boton. La
  regla de esta pantalla es que nada de lo que el asiento guarda quede fuera de
  alcance; lo que se decide es que sale primero, no que se ve y que no.
*/
export function camposApartados(
  fila: Record<string, unknown>,
  rotulo: (campo: string) => string,
): { registro: [string, unknown][]; vacios: string[] } {
  const orden = (a: string, b: string) => rotulo(a).localeCompare(rotulo(b), 'es')
  const entradas = Object.entries(fila)
  return {
    registro: entradas
      .filter(([k, v]) => esDeRegistro(k) && v !== null && v !== '')
      .sort(([a], [b]) => orden(a, b)),
    vacios: entradas
      .filter(([, v]) => v === null || v === '')
      .map(([k]) => k)
      .sort(orden),
  }
}

/*
  EL RESTO DE LA FILA EN UNA MODIFICACION.

  La ficha de un UPDATE ensena solo lo que cambio, y eso esta bien: con cuarenta
  columnas, ensenarlas todas esconde las dos que importan. Pero deja fuera el
  contexto —«el costo paso de 5 a 7» sin decir de que articulo ni en que
  almacen— y una modificacion sin contexto no se puede auditar: no se sabe si el
  cambio tiene sentido porque no se sabe sobre que se hizo.

  Va detras de un boton, debajo de lo que cambio. Primero la noticia, y para
  quien la necesite, la fila entera como quedo.
*/
export function camposSinCambiar(
  fila: Record<string, unknown>,
  cambios: string[] | null,
  rotulo: (campo: string) => string,
): [string, unknown][] {
  const cambiados = new Set(cambios ?? [])
  return camposOrdenados(fila, rotulo).filter(([c]) => !cambiados.has(c))
}

/*
  LOS NOMBRES DE LO QUE LA FILA APUNTA.

  Una ficha decía «articulo id 278 · periodo id 3 · empleado id 14»: tres números
  muertos. Quien lee la auditoría un año después no tiene forma de saber de qué
  artículo, de qué período ni de qué persona se habla sin abrir otras tres
  pantallas.

  `auditoria_nombres` los resuelve de una vez, indexados por columna y luego por
  valor —por columna y no por valor, porque `almacen_id` 9 y `articulo_id` 9 son
  dos cosas distintas—. Se pide al ABRIR la ficha, no por fila listada.

  Y se resuelve al mostrar, no al escribir, al revés que la etiqueta: la etiqueta
  es la identidad del asiento y se congela —si el artículo se renombra mañana, el
  asiento tiene que seguir diciendo cómo se llamaba ese día—; esto es una ayuda
  de lectura sobre columnas que ya están guardadas en crudo.
*/
export type NombresApuntados = Record<string, Record<string, string>>

export function useNombresDeAuditoria(id: number | null) {
  return useQuery({
    queryKey: ['auditoria', 'nombres', id],
    enabled: id !== null,
    staleTime: 5 * 60_000,
    queryFn: () => rpc<NombresApuntados>('auditoria_nombres', { p_id: id! }),
  })
}

/** El nombre de lo que apunta esa columna con ese valor, si se pudo resolver. */
export const nombreApuntado = (
  nombres: NombresApuntados | undefined,
  campo: string,
  valor: unknown,
): string | null =>
  (valor === null || valor === undefined ? null : nombres?.[campo]?.[String(valor)]) ?? null

/*
  LA FRASE QUE DICE QUÉ SIGNIFICA, no qué columnas cambiaron.

  Christopher, dos veces: «necesitamos un módulo de auditoría extremadamente
  explícito». Con la etiqueta y los nombres resueltos, la ficha ya dice de qué
  fila habla y de qué artículo. Lo que sigue faltando es lo que un asiento
  significa para el almacén:

      antes   Cómo llega: Barril · Cuántas trae: 3 · Activa: Sí
      ahora   «Desde ahora BOTAS DE SEGURIDAD también se puede contar en
               Barril: cada uno trae 3 PAR.»

  Se escribe aquí y no en la base a propósito: es presentación, no dato. La base
  guarda lo que pasó; poner además la frase sería guardar dos veces lo mismo y
  arriesgarse a que un día no digan lo mismo.

  SOLO LAS TABLAS EN LAS QUE LA CONSECUENCIA NO SE LEE SOLA. Un alta de cliente
  se entiende con sus campos delante; un permiso, un movimiento de inventario o
  una forma de contar, no. Donde no hay frase se devuelve nulo y la ficha
  enseña los campos, que es lo que hacía antes.
*/
const num = (v: unknown): string => {
  const n = Number(v)
  return Number.isFinite(n)
    ? n.toLocaleString('es-VE', { maximumFractionDigits: 4 })
    : String(v ?? '—')
}

/**
 * Un estado del sistema, escrito para leerlo dentro de una frase.
 *
 * `POR_CONFIRMAR_GERENTE` se lee «por confirmar gerente». No se traduce a un
 * rotulo bonito a proposito: la traduccion ya existe en la pantalla de Compras
 * y copiarla aqui seria tener dos listas que un dia dejarian de decir lo mismo.
 * Lo que se hace es abrir los guiones y bajar el tono, que no cambia el dato.
 */
const comoSeDice = (v: unknown): string =>
  String(v ?? '').replaceAll('_', ' ').toLowerCase()

const NIVELES: Record<string, string> = {
  NINGUNO: 'no puede entrar',
  LECTURA: 'puede mirar',
  ESCRITURA: 'puede escribir',
  TOTAL: 'puede todo',
}

export function narracion(
  m: { tabla: string; operacion: string; antes?: Record<string, unknown> | null; despues?: Record<string, unknown> | null },
  nombre: (campo: string, valor: unknown) => string | null,
): string | null {
  const f = m.despues ?? m.antes
  if (!f) return null
  const borrado = m.operacion === 'DELETE'
  const de = (c: string) => nombre(c, f[c]) ?? String(f[c] ?? '')

  switch (m.tabla) {
    case 'articulo_presentaciones': {
      const art = de('articulo_id')
      const pres = de('presentacion')
      const cuantas = num(f.unidades)
      if (borrado) return `${art} deja de poder contarse en ${pres}.`
      const propuesta = f.por_defecto
        ? ' Es la que se propone en los formularios.'
        : ''
      if (f.activa === false) {
        return `${art} ya no se cuenta en ${pres}. Los movimientos viejos que la usaron siguen legibles: el asiento guarda el nombre, no un puntero.`
      }
      return `Desde ahora ${art} también se puede contar en ${pres}: cada uno trae ${cuantas}.${propuesta}`
    }

    case 'rol_permisos': {
      const nivel = NIVELES[String(f.nivel)] ?? String(f.nivel)
      return borrado
        ? `El rol ${de('rol')} pierde lo que tenía sobre ${de('modulo')}.`
        : `Quien tenga el rol ${de('rol')} ${nivel} en ${de('modulo')}.`
    }

    case 'usuarios_roles':
      return borrado
        ? `A ${de('usuario_id')} se le quitó el rol ${de('rol')}.`
        : `A ${de('usuario_id')} se le dio el rol ${de('rol')}.`

    case 'rol_acciones':
      return borrado
        ? `El rol ${de('rol')} deja de poder «${de('accion')}».`
        : `El rol ${de('rol')} pasa a poder «${de('accion')}».`

    case 'tasas_cambio':
      return `La tasa del ${valorLegible(f.fecha)}: 1 ${de('moneda_origen')} son ${num(f.tasa)} ${de('moneda_destino')}${f.fuente ? `, según ${f.fuente}` : ''}.`

    case 'inventario_movimientos': {
      const signo = Number(f.signo)
      const art = de('articulo_id')
      const alm = de('almacen_id')
      const cant = `${num(f.cantidad)} ${f.unidad ?? ''}`.trim()
      const contado =
        f.cantidad_capturada && f.unidad_capturada
          ? ` Se contó como ${num(f.cantidad_capturada)} ${f.unidad_capturada}${
              Number(f.suelto_capturado) ? ` y ${num(f.suelto_capturado)} ${f.unidad}` : ''
            }.`
          : ''
      const hacia = signo < 0 ? `salieron de ${alm}` : `entraron a ${alm}`
      return `${cant} de ${art} ${hacia}, a ${num(f.costo_usd)} USD cada ${f.unidad ?? 'unidad'}.${contado}`
    }

    /*
      LA BITACORA DE COMPRAS: EL CASO QUE LEVANTO CHRISTOPHER.

      Su captura era un renglon de `compras_bitacora` que decia «Creo una
      anotacion de compras» y nada mas. Y resulta que la fila guarda justo lo
      que hacia falta: de que documento habla, en que estado estaba y en cual
      quedo. Estaba todo escrito; no estaba dicho.

      El estado se escribe en minuscula y con los guiones abiertos para que la
      frase se lea —«paso de confirmada a por confirmar gerente»—. El valor
      literal no se pierde: sale intacto en los campos de abajo, que es donde se
      va a mirar si hay que discutirlo.
    */
    case 'compras_bitacora': {
      const doc = `${comoSeDice(f.documento_tipo) || 'documento'} n.º ${f.documento_id ?? '—'}`
      const nota = f.nota ? ` Quedó anotado: «${f.nota}».` : ''
      if (!f.estado_nuevo) return `Se anotó algo sobre la ${doc}.${nota}`
      const ahora = comoSeDice(f.estado_nuevo)
      return f.estado_anterior
        ? `La ${doc} pasó de ${comoSeDice(f.estado_anterior)} a ${ahora}.${nota}`
        : `La ${doc} quedó en ${ahora}.${nota}`
    }

    default:
      return null
  }
}

/** Los campos que de verdad cambiaron, sin la contabilidad del guardado. */
export const cambiosDeFondo = (cambios: string[] | null): string[] =>
  (cambios ?? []).filter((c) => !esDeRegistro(c))

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
/*
  UN SOLO EVENTO, PARA LLEVÁRSELO.

  Christopher: «¿qué pasa si solo quiero hacer el copy de un evento puntual?».
  Se podía copiar el registro ENTERO filtrado —CSV o JSON, hasta cinco mil
  filas— y no se podía copiar UNO. Y es lo que se necesita a diario: mandarle a
  alguien por WhatsApp qué pasó con una fila, pegarlo en un correo, adjuntarlo a
  un reclamo.

  Sale como texto plano y no como JSON a propósito: quien lo pega no es un
  programa, es una persona. Lleva todo lo que la ficha enseña —incluido el
  porqué y la frase que explica el asiento— para que se entienda fuera del
  sistema, que es donde se va a leer.
*/
/*
  El salto de línea, en una constante.

  No es un capricho: escribir este archivo desde un script hizo que la barra
  invertida se perdiera por el camino y dejara literales de cadena partidos por
  la mitad. Con la constante no hay barra que perder.
*/
const SALTO = String.fromCharCode(10)

export function textoDeEvento(
  m: Movimiento,
  opciones: {
    frase: string | null
    nombreDeTabla: (t: string) => string
    nombreDeCampo: (c: string) => string
    nombreApuntado: (campo: string, valor: unknown) => string | null
  },
): string {
  const { frase, nombreDeTabla: tabla, nombreDeCampo: campo, nombreApuntado: apunta } = opciones

  const cuando = new Date(m.ocurrido_en).toLocaleString('es-VE', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const linea = (r: string, v: string | null | undefined) =>
    v ? `${r.padEnd(12)}${v}` : null

  const valor = (c: string, v: unknown) => {
    const n = apunta(c, v)
    return n ? `${n} · ${valorLegible(v)}` : valorLegible(v)
  }

  const bloque = (titulo: string, fila: Record<string, unknown>) => {
    const campos = camposOrdenados(fila, campo)
    if (!campos.length) return null
    return [
      '',
      titulo,
      ...campos.map(([c, v]) => `  ${campo(c).padEnd(24)}${valor(c, v)}`),
    ].join(SALTO)
  }

  const partes: (string | null)[] = [
    'REGISTRO DE AUDITORÍA · La Cantera · Minería Internacional TS',
    `Asiento n.º ${m.id}`,
    '',
    linea('Qué pasó', frase ?? `${m.operacion} en ${tabla(m.tabla)}`),
    frase && m.etiqueta ? `${''.padEnd(12)}Sobre: ${m.etiqueta}` : null,
    linea('Quién', `${m.nombre ?? '—'} (${m.usuario})`),
    linea('Cuándo', cuando),
    linea('Desde', m.ip ?? 'no registrada'),
    linea('Módulo', m.modulo),
    linea('Dónde', `${tabla(m.tabla)}${m.fila_id ? ` · fila ${m.fila_id}` : ''}`),
    linea('Por qué', m.motivo),
  ]

  if (m.operacion === 'UPDATE' && m.cambios?.length) {
    const campos = cambiosDeFondo(m.cambios)
    if (campos.length) {
      partes.push(
        '',
        `Lo que cambió (${campos.length})`,
        ...campos.map(
          (c) =>
            `  ${campo(c).padEnd(24)}${valor(c, m.antes?.[c])}  →  ${valor(c, m.despues?.[c])}`,
        ),
      )
    } else {
      partes.push('', 'Se volvió a guardar sin cambiar ningún dato.')
    }

    /*
      Y DEBAJO, LA FILA ENTERA. Sin ella, «el costo pasó de 5 a 7» no dice de
      qué artículo se habla, y quien recibe el texto pegado en un correo no
      tiene la pantalla delante para averiguarlo.
    */
    const resto = camposSinCambiar(m.despues ?? {}, m.cambios, campo)
    if (resto.length) {
      partes.push(
        '',
        'El resto de la fila, que no cambió',
        ...resto.map(([c, v]) => `  ${campo(c).padEnd(24)}${valor(c, v)}`),
      )
    }
  } else if (m.despues) {
    partes.push(bloque('Cómo quedó', m.despues))
  } else if (m.antes) {
    partes.push(bloque('Lo que había antes de borrarlo', m.antes))
  }

  return partes.filter((x) => x !== null && x !== undefined).join(SALTO)
}

/** Lo deja en el portapapeles. Devuelve si se pudo. */
export async function copiarEvento(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    // Sin permiso de portapapeles —o sin https— no se puede. Se dice, no se
    // finge: quien copia necesita saber si lo tiene o no.
    return false
  }
}

/*
  EL MISMO EVENTO, EN CRUDO.

  El texto de arriba está escrito para una persona. Este es para cuando hay que
  discutir el dato y no la redacción: la fila del registro tal como está
  guardada, con los nombres de columna sin traducir y los valores sin formato.

  Es lo que se le manda a quien va a comprobarlo contra la base. Las dos formas
  hacen falta, y no compiten: la de arriba se lee, ésta se coteja.
*/
export function jsonDeEvento(m: Movimiento): string {
  return JSON.stringify(
    {
      asiento: m.id,
      ocurrido_en: m.ocurrido_en,
      operacion: m.operacion,
      usuario: m.usuario,
      nombre: m.nombre,
      usuario_id: m.usuario_id,
      ip: m.ip,
      modulo: m.modulo,
      tabla: m.tabla,
      fila_id: m.fila_id,
      etiqueta: m.etiqueta,
      motivo: m.motivo,
      cambios: m.cambios,
      antes: m.antes,
      despues: m.despues,
    },
    null,
    2,
  )
}

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
