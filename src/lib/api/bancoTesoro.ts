import { useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { rpc } from './rpc'
import { useParametros, type Empleado } from './nomina'
import type {
  DatosExtrasBancoEmpleado,
  EmpleadoConBanco,
} from '@/lib/bancoTesoro/formatos'

const VIGENCIA_CONFIG_BT = '2026-01-01'
const CLAVE_CORRELATIVO_BT = 'BT_CORRELATIVO_SIGUIENTE'
const CLAVE_CUENTA_ORDENANTE_BT = 'BT_CUENTA_ORDENANTE'
const CLAVE_EXTRAS_JSON_BT = 'BT_EXTRAS_EMPLEADOS_JSON'

/**
 * Configuración operativa de Banco del Tesoro para Nómina (RRHH):
 * - `correlativoSiguiente`: arranca en `1` (`0163000001`) y avanza al emitir lotes.
 * - `cuentaOrdenante`: cuenta de 20 dígitos de la empresa a debitar en Tesoro en Línea.
 * - `extrasPorEmpleado`: respaldo transparente en `nomina_parametros` por si la
 *   migración SQL de columnas de `empleados` aún no se ha corrido en Supabase.
 */
export function useConfigBancoTesoro() {
  const { data: parametros, isPending } = useParametros()

  return useMemo(() => {
    const lista = parametros ?? []

    const filaCorr = lista.find((p) => p.clave === CLAVE_CORRELATIVO_BT)
    const correlativoSiguiente = Math.max(1, Math.floor(Number(filaCorr?.valor ?? 1) || 1))

    const filaCuenta = lista.find((p) => p.clave === CLAVE_CUENTA_ORDENANTE_BT)
    const cuentaOrdenante = (filaCuenta?.valor_texto ?? '').trim()

    const filaExtras = lista.find((p) => p.clave === CLAVE_EXTRAS_JSON_BT)
    let extrasPorEmpleado: Record<string, DatosExtrasBancoEmpleado> = {}
    if (filaExtras?.valor_texto) {
      try {
        const parsed = JSON.parse(filaExtras.valor_texto)
        if (parsed && typeof parsed === 'object') {
          extrasPorEmpleado = parsed as Record<string, DatosExtrasBancoEmpleado>
        }
      } catch {
        extrasPorEmpleado = {}
      }
    }

    return {
      isPending,
      correlativoSiguiente,
      cuentaOrdenante,
      extrasPorEmpleado,
    }
  }, [parametros, isPending])
}

/**
 * Une los campos nativos de `empleados` con cualquier respaldo guardado en
 * `BT_EXTRAS_EMPLEADOS_JSON`. Los valores no vacíos de la tabla `empleados`
 * tienen prioridad.
 */
export function combinarEmpleadoConExtras(
  e: Empleado,
  extrasMapa: Record<string, DatosExtrasBancoEmpleado>,
): EmpleadoConBanco {
  const respaldo = extrasMapa[String(e.id)] ?? {}
  const elegir = <T>(nativo: T | null | undefined, resp: T | null | undefined): T | null =>
    nativo !== undefined && nativo !== null && String(nativo).trim() !== ''
      ? nativo
      : (resp ?? null)

  return {
    ...e,
    correo: elegir(e.correo, respaldo.correo),
    telefono_local: elegir(e.telefono_local, respaldo.telefono_local),
    calle_avenida: elegir(e.calle_avenida, respaldo.calle_avenida),
    casa_edificio: elegir(e.casa_edificio, respaldo.casa_edificio),
    piso_nivel: elegir(e.piso_nivel, respaldo.piso_nivel),
    apto_local: elegir(e.apto_local, respaldo.apto_local),
    referencia_domicilio: elegir(e.referencia_domicilio, respaldo.referencia_domicilio),
    condicion_inmueble: elegir(e.condicion_inmueble, respaldo.condicion_inmueble),
    tipo_vivienda: elegir(e.tipo_vivienda, respaldo.tipo_vivienda),
    tiempo_residencia:
      e.tiempo_residencia !== undefined && e.tiempo_residencia !== null
        ? e.tiempo_residencia
        : respaldo.tiempo_residencia !== undefined && respaldo.tiempo_residencia !== null
          ? Number(respaldo.tiempo_residencia) || null
          : null,
    bt_region: elegir(e.bt_region, respaldo.bt_region),
    bt_estado: elegir(e.bt_estado, respaldo.bt_estado),
    bt_ciudad: elegir(e.bt_ciudad, respaldo.bt_ciudad),
    bt_municipio: elegir(e.bt_municipio, respaldo.bt_municipio),
    bt_parroquia: elegir(e.bt_parroquia, respaldo.bt_parroquia),
    zona_postal: elegir(e.zona_postal, respaldo.zona_postal),
    bt_profesion: elegir(e.bt_profesion, respaldo.bt_profesion),
    bt_tipo_cargo: elegir(e.bt_tipo_cargo, respaldo.bt_tipo_cargo),
    bt_agencia: elegir(e.bt_agencia, respaldo.bt_agencia),
    bt_tipo_cuenta: elegir(e.bt_tipo_cuenta, respaldo.bt_tipo_cuenta),
  }
}

/**
 * Reserva un bloque de correlativos (`0163XXXXXX`) y avanza el contador en base.
 * Usa la función atómica `reservar_correlativos_banco_tesoro` si ya está creada,
 * y cae de forma transparente en `guardar_parametro_nomina` si aún no se ha
 * aplicado la migración SQL.
 */
export function useReservarCorrelativosBt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { cantidad: number; desde: number }) => {
      const cantidad = Math.max(1, Math.floor(p.cantidad))
      const desde = Math.max(1, Math.floor(p.desde))
      try {
        return await rpc<number>('reservar_correlativos_banco_tesoro', {
          p_cantidad: cantidad,
          p_desde: desde,
        })
      } catch {
        const siguiente = desde + cantidad
        await rpc<number>('guardar_parametro_nomina', {
          p_clave: CLAVE_CORRELATIVO_BT,
          p_unidad: 'FACTOR',
          p_desde: VIGENCIA_CONFIG_BT,
          p_descripcion:
            'Siguiente correlativo secuencial para lotes de Pago Masivo Banco del Tesoro (0163XXXXXX)',
          p_valor: siguiente,
          p_texto: null,
          p_fuente: 'Tesoro en Línea',
        })
        return desde
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['nomina'] }),
  })
}

export function useGuardarCuentaOrdenanteBt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (cuenta: string) => {
      const limpia = cuenta.replace(/\D/g, '').slice(0, 20)
      if (!limpia) return
      await rpc<number>('guardar_parametro_nomina', {
        p_clave: CLAVE_CUENTA_ORDENANTE_BT,
        p_unidad: 'TEXTO',
        p_desde: VIGENCIA_CONFIG_BT,
        p_descripcion: 'Cuenta ordenante de la empresa para Pago Masivo Banco del Tesoro',
        p_valor: null,
        p_texto: limpia,
        p_fuente: 'Tesoro en Línea',
      })
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['nomina'] }),
  })
}

export function useGuardarDatosBancariosEmpleado() {
  const qc = useQueryClient()
  const { extrasPorEmpleado } = useConfigBancoTesoro()

  return useMutation({
    mutationFn: async (
      p: { empleado_id: number } & DatosExtrasBancoEmpleado,
    ) => {
      const tiempoNum =
        p.tiempo_residencia !== undefined &&
        p.tiempo_residencia !== null &&
        String(p.tiempo_residencia).trim() !== ''
          ? Math.max(0, Math.floor(Number(p.tiempo_residencia) || 0))
          : null

      try {
        await rpc<void>('guardar_datos_bancarios_empleado', {
          p_empleado_id: p.empleado_id,
          p_correo: p.correo ?? '',
          p_telefono_local: p.telefono_local ?? '',
          p_calle_avenida: p.calle_avenida ?? '',
          p_casa_edificio: p.casa_edificio ?? '',
          p_piso_nivel: p.piso_nivel ?? '',
          p_apto_local: p.apto_local ?? '',
          p_referencia_domicilio: p.referencia_domicilio ?? '',
          p_condicion_inmueble: p.condicion_inmueble ?? '',
          p_tipo_vivienda: p.tipo_vivienda ?? '',
          p_tiempo_residencia: tiempoNum,
          p_bt_region: p.bt_region ?? '',
          p_bt_estado: p.bt_estado ?? '',
          p_bt_ciudad: p.bt_ciudad ?? '',
          p_bt_municipio: p.bt_municipio ?? '',
          p_bt_parroquia: p.bt_parroquia ?? '',
          p_zona_postal: p.zona_postal ?? '',
          p_bt_profesion: p.bt_profesion ?? '',
          p_bt_tipo_cargo: p.bt_tipo_cargo ?? '',
          p_bt_agencia: p.bt_agencia ?? '',
          p_bt_tipo_cuenta: p.bt_tipo_cuenta ?? '',
        })
      } catch {
        // Respaldo inmediato en nomina_parametros si las columnas SQL aún no están aplicadas
        const copia: Record<string, DatosExtrasBancoEmpleado> = {
          ...extrasPorEmpleado,
          [String(p.empleado_id)]: {
            correo: p.correo?.trim().toUpperCase() || null,
            telefono_local: p.telefono_local?.replace(/\D/g, '') || null,
            calle_avenida: p.calle_avenida?.trim().toUpperCase() || null,
            casa_edificio: p.casa_edificio?.trim().toUpperCase() || null,
            piso_nivel: p.piso_nivel?.trim().toUpperCase() || null,
            apto_local: p.apto_local?.trim().toUpperCase() || null,
            referencia_domicilio: p.referencia_domicilio?.trim().toUpperCase() || null,
            condicion_inmueble: p.condicion_inmueble || null,
            tipo_vivienda: p.tipo_vivienda || null,
            tiempo_residencia: tiempoNum,
            bt_region: p.bt_region || null,
            bt_estado: p.bt_estado || null,
            bt_ciudad: p.bt_ciudad || null,
            bt_municipio: p.bt_municipio || null,
            bt_parroquia: p.bt_parroquia || null,
            zona_postal: p.zona_postal?.replace(/\D/g, '') || null,
            bt_profesion: p.bt_profesion || null,
            bt_tipo_cargo: p.bt_tipo_cargo || null,
            bt_agencia: p.bt_agencia || null,
            bt_tipo_cuenta: p.bt_tipo_cuenta || null,
          },
        }
        await rpc<number>('guardar_parametro_nomina', {
          p_clave: CLAVE_EXTRAS_JSON_BT,
          p_unidad: 'TEXTO',
          p_desde: VIGENCIA_CONFIG_BT,
          p_descripcion: 'Datos complementarios de apertura bancaria de empleados',
          p_valor: null,
          p_texto: JSON.stringify(copia),
          p_fuente: 'RRHH',
        })
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['nomina'] }),
  })
}
