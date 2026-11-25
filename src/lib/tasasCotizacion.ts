import { useMemo } from 'react'
import { useMonedasConTasa, useTasaVigente, useTasasVigentes } from '@/lib/api/tasas'
import { useTasaBcv, useTasaEurBcv, useTasaUsdtVivo } from '@/lib/tasaBcv'
import type { MapaTasasCotizacion } from '@/lib/ofertas'

/**
 * Resuelve las tasas vigentes del día (en Bs) para cotizaciones de Compras:
 * - USD_BCV: prioriza la tasa registrada en `tasas_cambio` y respalda con BCV en vivo.
 * - EUR_BCV: prioriza la tasa EUR registrada en `tasas_cambio` y respalda con Euro BCV en vivo.
 * - USDT: prioriza la tasa USDT/UST registrada en `tasas_cambio` y, si se solicita en vivo, consulta Binance P2P.
 */
export function useTasasCotizacion(pedirUsdtEnVivo = false): {
  tasas: MapaTasasCotizacion
  cargando: boolean
} {
  const usdDb = useTasaVigente('USD', 'BCV')
  const eurDb = useTasaVigente('EUR', 'BCV')
  const monedas = useMonedasConTasa()
  const monedasUsdt = useMemo(
    () => (monedas.data ?? []).filter((m) => m.codigo === 'USDT' || m.codigo === 'UST' || m.simbolo === 'USDT'),
    [monedas.data],
  )
  const usdtDb = useTasasVigentes(monedasUsdt, monedasUsdt.length > 0)

  const faltaUsdDb = !usdDb.isPending && !(Number(usdDb.data?.tasa) > 0)
  const faltaEurDb = !eurDb.isPending && !(Number(eurDb.data?.tasa) > 0)
  const tasaUsdtRegistrada = Number(usdtDb.datos[0]?.tasa?.tasa) || 0

  const usdVivo = useTasaBcv()
  const eurVivo = useTasaEurBcv(faltaEurDb || true)
  const usdtVivo = useTasaUsdtVivo(pedirUsdtEnVivo && tasaUsdtRegistrada <= 0)

  const tasas = useMemo<MapaTasasCotizacion>(() => {
    const usd = Number(usdDb.data?.tasa) || (faltaUsdDb ? Number(usdVivo.data?.valor) : Number(usdVivo.data?.valor)) || 0
    const eur = Number(eurDb.data?.tasa) || Number(eurVivo.data?.valor) || 0
    const usdt = tasaUsdtRegistrada || Number(usdtVivo.data?.valor) || 0
    return {
      USD_BCV: Number(usdDb.data?.tasa) > 0 ? Number(usdDb.data!.tasa) : usd,
      EUR_BCV: Number(eurDb.data?.tasa) > 0 ? Number(eurDb.data!.tasa) : eur,
      USDT: usdt,
    }
  }, [usdDb.data, eurDb.data, faltaUsdDb, usdVivo.data, eurVivo.data, tasaUsdtRegistrada, usdtVivo.data])

  return {
    tasas,
    cargando: usdDb.isPending || eurDb.isPending,
  }
}
