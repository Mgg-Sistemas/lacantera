import { cn } from '@/lib/cn'
import { conversionMientrasSeEscribe, enLaOtraMedida } from '@/lib/medidas'

/**
 * La misma cantidad en la otra medida, justo debajo de donde se escribe.
 *
 * Christopher, 16/09/2026: «en los formularios al cargar algo en m3, debe pedir
 * directamente su densidad y expresar su conversión a ton, viceversa de ton a
 * m3». La densidad es la del catálogo —una por material, lo eligió él— y la
 * línea dice cuál se usó: quien lee «25,92 t» tiene que saber que es una cuenta
 * y no un peso de la romana.
 *
 * No pinta nada si la unidad no es M3 ni TON, o si todavía no hay cantidad. Si
 * falta la densidad lo dice en tono de aviso, en vez de callarse.
 */
export function ConversionDeCantidad({
  cantidad,
  unidad,
  densidad,
  className,
}: {
  cantidad: string | number | null | undefined
  unidad: string | null | undefined
  densidad: string | number | null | undefined
  className?: string
}) {
  const texto = conversionMientrasSeEscribe(cantidad ?? 0, unidad, densidad)
  if (!texto) return null

  const sinDensidad = enLaOtraMedida(cantidad ?? 0, unidad ?? '', densidad) === null

  return (
    <p
      aria-live="polite"
      className={cn('tabular mt-1 text-xs', sinDensidad ? 'text-warning' : 'text-ink/60', className)}
    >
      {texto}
    </p>
  )
}
