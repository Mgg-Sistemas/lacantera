import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/*
  LOS MODULOS QUE AVISAN, QUE SON LOS QUE AVISAN DE VERDAD.

  `notificaciones.modulo` es texto libre: no hay CHECK que lo sujete —se
  comprobó en `pg_constraint`, la tabla solo restringe `importancia`—. Así que
  esta lista no la impone la base, la mantiene el front, y se le había quedado
  atrás: decía INVENTARIO, TESORERIA y VENTAS, que no los emite nadie, y le
  faltaban ASIGNACIONES, COMBUSTIBLE y MAQUINARIA, que sí. Resultado: la mitad
  de los avisos posibles salían con el icono de engranaje, el de «no sé qué es
  esto».

  Los cinco de arriba salen de mirar quién llama a `private.notificar`:

    select distinct (regexp_matches(prosrc, 'private\.notificar\(\s*''([A-Z_]+)''', 'g'))[1]
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public','private') and prosrc like '%private.notificar%';

  SISTEMA no lo emite nadie todavía y se queda a propósito: es el cajón para lo
  que no es de ningún módulo. Cualquier valor que no esté aquí cae en el mismo
  cajón al pintarse, así que la lista puede quedarse corta sin romper nada —
  solo pierde el icono, que es lo que pasaba.
*/
export type Modulo =
  | 'COMPRAS'
  | 'NOMINA'
  | 'MAQUINARIA'
  | 'COMBUSTIBLE'
  | 'ASIGNACIONES'
  | 'SISTEMA'

export type Importancia = 'INFO' | 'ATENCION' | 'URGENTE'

export interface Notificacion {
  id: number
  modulo: Modulo
  tipo: string
  titulo: string
  detalle: string | null
  /** A dónde lleva el clic. Puede faltar en avisos que no abren nada. */
  ruta: string | null
  importancia: Importancia
  creada_en: string
  actor_id: string | null
  actor: string | null
  leida: boolean
}

/**
 * Se consulta cada medio minuto en vez de por suscripción en vivo.
 *
 * Un aviso de este sistema no es un mensaje de chat: que "hay un pago por
 * ejecutar" llegue treinta segundos después no cambia nada, y una conexión
 * permanente abierta en cada pestaña sí se cae sola cuando la red del patio
 * flaquea. Además, cada acción propia invalida esta consulta, así que lo que
 * uno mismo provoca aparece al instante.
 */
export function useNotificaciones(limite = 40) {
  return useQuery({
    /*
      El límite va en la llave.

      La campana pide cuarenta y el modal de «todas» pide muchas más. Con una
      sola llave, la segunda consulta pisaría la caché de la primera y la
      campana se quedaría con lo que trajo el modal — o al revés, según quién
      llegara antes. Con el límite dentro son dos entradas distintas.

      Sigue empezando por 'notificaciones', que es lo que invalida
      `tiempoReal.ts` por prefijo: las dos se refrescan igual.
    */
    queryKey: ['notificaciones', limite],
    queryFn: async () =>
      desenvolver<Notificacion[]>(
        await supabase
          .from('v_mis_notificaciones')
          .select('*')
          .order('creada_en', { ascending: false })
          .limit(limite),
      ),
    // La campana la enciende el enlace en vivo; esto es solo el respaldo por
    // si el socket se cayó. Ver src/lib/tiempoReal.ts.
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  })
}

/*
  AGRUPAR POR ASUNTO.

  De dónde sale el problema: `private.anotar` emite un aviso por cada cambio de
  estado, y una compra tiene TRES documentos —solicitud, orden y pago— que se
  mueven a veces en la misma transacción. Aprobar una compra deja dos avisos con
  el mismo segundo, el mismo destinatario y la misma ruta: «Compra aprobada por
  gerencia» y «Orden de compra sin método de pago». Y pedir algo deja «Nuevo
  pedido de compra» y, siete segundos después, «Pedido confirmado: hay que
  cotizar».

  No son avisos repetidos —dicen cosas distintas y la bitácora los quiere todos—
  pero leídos en fila parecen el mismo dos veces, que es lo que se reportó.

  Lo que el lector pregunta no es «qué pasó» sino «qué me falta». Y eso se
  contesta por asunto: una compra, una línea, con el estado en el que está hoy.
  Los pasos anteriores no se pierden, se pliegan debajo.

  La ruta es la que identifica el asunto porque es literalmente a dónde lleva el
  clic: dos avisos que abren la misma pantalla hablan de lo mismo. Un aviso sin
  ruta no se agrupa con nadie —se agrupa consigo mismo—, que es lo correcto: si
  no lleva a ningún sitio, no hay asunto que compartir.
*/
export interface GrupoDeAvisos {
  clave: string
  /** El más reciente. Es lo que hoy es cierto del asunto. */
  ultimo: Notificacion
  /** Todos, del más nuevo al más viejo. `ultimo` es el primero. */
  avisos: Notificacion[]
  sinLeer: number
}

export function agruparPorAsunto(avisos: Notificacion[]): GrupoDeAvisos[] {
  const porClave = new Map<string, Notificacion[]>()

  for (const a of avisos) {
    const clave = a.ruta ?? `aviso:${a.id}`
    const ya = porClave.get(clave)
    if (ya) ya.push(a)
    else porClave.set(clave, [a])
  }

  const grupos: GrupoDeAvisos[] = []
  for (const [clave, lista] of porClave) {
    const ordenados = [...lista].sort(
      (a, b) => Date.parse(b.creada_en) - Date.parse(a.creada_en),
    )
    grupos.push({
      clave,
      ultimo: ordenados[0],
      avisos: ordenados,
      sinLeer: ordenados.filter((a) => !a.leida).length,
    })
  }

  /*
    EL ORDEN ES EL TIEMPO, DE LO MÁS NUEVO A LO MÁS VIEJO.

    Christopher: «el aspecto de las notificaciones deben de organizarse por
    tiempo más reciente».

    Antes mandaba lo no leído, después lo que más apuraba, y la fecha era el
    último criterio. Cada regla tenía su motivo, pero juntas hacían que la lista
    saltara en el tiempo: «hace 18 h», «hace 3 días», «hace 19 h». Un lector no
    puede confiar en un orden que no entiende, y entonces los lee todos o no lee
    ninguno.

    Una lista de avisos se lee como una conversación: lo último arriba. Es lo
    único que no hay que explicar.

    LO QUE HACÍAN LAS OTRAS DOS REGLAS NO SE PIERDE, cambia de sitio: lo no leído
    lleva su punto naranja y va contado en la campana, y la importancia se ve en
    el color del icono. Las dos siguen estando; lo que dejan de hacer es pelear
    con la cronología.

    Se ordena por el ÚLTIMO aviso del grupo, que es lo que el grupo dice hoy: una
    compra de la que se habló ayer y otra vez esta mañana está arriba por la de
    esta mañana.
  */
  return grupos.sort(
    (a, b) => Date.parse(b.ultimo.creada_en) - Date.parse(a.ultimo.creada_en),
  )
}

export function useMarcarLeida() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { id: number }) => rpc('marcar_notificacion_leida', { p_id: p.id }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  })
}

/**
 * Marca leído un grupo entero.
 *
 * Al abrir una compra se ha visto en qué estado está, y eso vale por todos los
 * pasos que la trajeron hasta ahí: dejar «Nuevo pedido» sin leer después de
 * abrir el pedido es contar como pendiente algo que ya se miró. De ahí venía
 * buena parte de los veintinueve sin leer.
 *
 * La base solo sabe marcar de una en una (`marcar_notificacion_leida`) o todas
 * (`marcar_notificaciones_leidas`). Un grupo son dos o tres, así que van en
 * paralelo y se invalida una sola vez al final, en vez de una por aviso.
 */
export function useMarcarLeidas() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { ids: number[] }) => {
      await Promise.all(p.ids.map((id) => rpc('marcar_notificacion_leida', { p_id: id })))
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  })
}

export function useMarcarTodasLeidas() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => rpc<number>('marcar_notificaciones_leidas'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  })
}
