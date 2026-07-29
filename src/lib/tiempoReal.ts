import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * El sistema en vivo.
 *
 * Un solo canal escucha los cambios de la base y los traduce a "vuelve a pedir
 * estas consultas". Que sea uno solo y no uno por pantalla es lo que hace que
 * el tablero de compras se entere de que tesorería pagó, aunque quien mire el
 * tablero no haya abierto tesorería en su vida.
 *
 * No se usa el contenido del aviso, solo el hecho de que llegó. Aplicar la
 * fila recibida directamente a la caché sería más rápido y mucho más frágil:
 * casi todas estas pantallas leen vistas —saldos sumados del libro, el tablero
 * de compras, el resumen del panel— que no son la tabla que cambió. Pedir de
 * nuevo devuelve la verdad; parchear a mano devuelve una aproximación que se
 * va separando de ella sin avisar.
 */

/** Qué consultas quedan viejas cuando cambia cada tabla. */
const AFECTA: Record<string, string[][]> = {
  solicitudes_pedido: [['compras']],
  solicitud_renglones: [['compras']],
  cotizaciones: [['compras']],
  cotizacion_renglones: [['compras']],
  ordenes_compra: [['compras'], ['tesoreria']],
  orden_renglones: [['compras']],
  compras_bitacora: [['compras']],
  proveedores: [['proveedores']],

  // Una instrucción de pago vive entre los dos módulos: nace en la compra y se
  // salda en tesorería. Cualquiera de las dos pantallas queda vieja.
  instrucciones_pago: [['compras'], ['tesoreria']],

  // Recibir material cierra la compra, mueve las existencias y cambia lo que
  // vale el inventario en el panel, que se lee bajo la clave de tesorería.
  inventario_movimientos: [['movimientos'], ['existencias'], ['compras'], ['tesoreria']],
  articulos: [['articulos'], ['existencias'], ['tesoreria']],
  almacenes: [['almacenes'], ['existencias']],

  cuentas_tesoreria: [['tesoreria']],
  tesoreria_movimientos: [['tesoreria'], ['nomina']],

  empleados: [['nomina']],
  nomina_periodos: [['nomina']],
  nomina_recibos: [['nomina']],
  nomina_recibo_lineas: [['nomina']],
  nomina_novedades: [['nomina']],
  nomina_novedades_montos: [['nomina']],
  nomina_parametros: [['nomina']],

  // Quitarle un rol a alguien tiene que llegarle a esa persona sin que
  // recargue: hasta que no se refresque su menú, sigue viendo pantallas a las
  // que ya no debería llegar. La base ya le dice que no, pero la pantalla
  // todavía se las ofrece.
  roles: [['roles'], ['mis-permisos']],
  rol_permisos: [['rol-permisos'], ['mis-permisos']],
  usuarios_roles: [['usuarios'], ['mis-roles'], ['mis-permisos']],

  // El RIF y el domicilio salen impresos en lo que emite el sistema: quien
  // tenga un recibo a medias en otra pestaña debe verlos corregidos sin
  // recargar. Y un documento que alguien acaba de cargar tiene que aparecerle
  // a quien lo está buscando en ese momento.
  empresa: [['empresa']],
  empresa_documentos: [['documentos-legales']],

  notificaciones: [['notificaciones']],
  notificaciones_leidas: [['notificaciones']],
  tasas_cambio: [['tasas'], ['tasa-vigente']],
  perfiles: [['perfiles'], ['usuarios']],
}

/**
 * Cuánto se espera antes de refrescar.
 *
 * Una sola acción escribe en varias tablas dentro de la misma transacción:
 * recepcionar una compra toca el movimiento de inventario, la orden y la
 * bitácora. Sin esta pausa llegarían tres avisos y la pantalla pediría los
 * datos tres veces seguidas. Un cuarto de segundo no se percibe y convierte la
 * ráfaga en una sola recarga.
 */
const ESPERA_MS = 250

/** Cada cuánto se comprueba que el socket sigue vivo. */
const LATIDO_MS = 5_000

export type EstadoTiempoReal = 'conectando' | 'en-vivo' | 'sin-conexion'

export function useTiempoReal(): EstadoTiempoReal {
  const qc = useQueryClient()
  const [estado, setEstado] = useState<EstadoTiempoReal>('conectando')

  useEffect(() => {
    const pendientes = new Set<string>()
    let temporizador: ReturnType<typeof setTimeout> | undefined
    let suscrito = false

    const refrescar = () => {
      temporizador = undefined

      // Se juntan las claves de todas las tablas de la ráfaga y se quitan las
      // repetidas: dos tablas que afectan a "compras" no la piden dos veces.
      const claves = new Map<string, string[]>()
      for (const tabla of pendientes) {
        for (const clave of AFECTA[tabla] ?? []) claves.set(clave.join('|'), clave)
      }
      pendientes.clear()

      for (const clave of claves.values()) {
        void qc.invalidateQueries({ queryKey: clave })
      }
    }

    const anotar = (tabla: string) => {
      pendientes.add(tabla)
      if (temporizador) clearTimeout(temporizador)
      temporizador = setTimeout(refrescar, ESPERA_MS)
    }

    const canal = supabase.channel('cambios-del-sistema')

    for (const tabla of Object.keys(AFECTA)) {
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, () =>
        anotar(tabla),
      )
    }

    canal.subscribe((situacion) => {
      if (situacion === 'SUBSCRIBED') {
        suscrito = true
        setEstado('en-vivo')
        // Al reconectar después de un corte, lo que hay en pantalla puede ser
        // de hace rato. Se pide todo de nuevo una vez: los avisos que
        // ocurrieron mientras el socket estaba caído no van a llegar nunca.
        void qc.invalidateQueries()
        return
      }

      if (situacion === 'CHANNEL_ERROR' || situacion === 'TIMED_OUT' || situacion === 'CLOSED') {
        suscrito = false
        setEstado('sin-conexion')
      }
    })

    /*
      El canal no basta para saber si seguimos en vivo.

      Cuando se cae la red, el canal no cambia de estado hasta que vence su
      propio latido —medio minuto largo—, y durante ese rato la pantalla jura
      estar al día mientras ya no le llega nada. El socket sí lo sabe antes.
      Se comprueban las dos cosas, más el aviso del sistema operativo, que es
      inmediato: en un frente de cantera la señal se va cada tanto y quien
      mira los saldos tiene que enterarse enseguida, no medio minuto después.
    */
    const revisar = () => {
      const enLinea = navigator.onLine && supabase.realtime.isConnected()
      setEstado(enLinea && suscrito ? 'en-vivo' : enLinea ? 'conectando' : 'sin-conexion')
    }

    const latido = setInterval(revisar, LATIDO_MS)
    window.addEventListener('online', revisar)
    window.addEventListener('offline', revisar)

    return () => {
      if (temporizador) clearTimeout(temporizador)
      clearInterval(latido)
      window.removeEventListener('online', revisar)
      window.removeEventListener('offline', revisar)
      void supabase.removeChannel(canal)
    }
  }, [qc])

  return estado
}
