import { useId, useState } from 'react'
import { cn } from '@/lib/cn'

/*
  LA TORTA DEL GASTO

  La líder pidió gráficas de torta para ver los gastos y sus segmentaciones.

  POR QUÉ ESTÁ ESCRITA A MANO Y NO ES UNA LIBRERÍA

  Meter una librería de gráficos para dibujar un círculo dividido son cientos de
  kilobytes en el paquete, un tema visual que no es el nuestro y una dependencia
  más que mantener. Un arco de SVG son dos líneas de trigonometría, y así el
  gráfico usa los mismos colores y la misma tipografía que el resto del sistema.

  POR QUÉ DONA Y NO TORTA MACIZA

  El agujero del medio es donde va el total, que es la cifra que la gente busca
  primero. En una torta maciza ese número tiene que ir fuera y compite con las
  etiquetas.

  LOS COLORES NO SON DECORACIÓN

  Van de más oscuro a más claro siguiendo el orden de las porciones, que llegan
  ya ordenadas de mayor a menor. Así el degradado *es* el ranking: se lee cuál
  pesa más sin mirar los números y sin necesitar que cada categoría tenga un
  color propio memorizado.

  Y «sin clasificar» rompe la escala a propósito, en el gris de aviso: es un
  hueco en los datos, no una categoría más, y tiene que verse como tal.
*/

export interface Porcion {
  codigo: string
  nombre: string
  valor: number
  porcentaje: number
}

/** El degradado del azul de la marca, de la porción mayor a la menor. */
const ESCALA = [
  '#1e3a8a',
  '#1d4ed8',
  '#2563eb',
  '#3b82f6',
  '#60a5fa',
  '#93c5fd',
  '#bfdbfe',
  '#dbeafe',
]

const SIN_CLASIFICAR = '#a8a29e'

function colorDe(codigo: string, i: number): string {
  return codigo === 'SIN_CLASIFICAR' ? SIN_CLASIFICAR : ESCALA[i % ESCALA.length]
}

/**
 * Un punto del borde del círculo.
 *
 * Se empieza arriba —de ahí el −90— porque es donde una persona espera que
 * arranque una torta, y se sigue en el sentido del reloj.
 */
function punto(cx: number, cy: number, radio: number, grados: number) {
  const rad = ((grados - 90) * Math.PI) / 180
  return { x: cx + radio * Math.cos(rad), y: cy + radio * Math.sin(rad) }
}

function arco(desde: number, hasta: number, radio: number, grosor: number): string {
  const cx = 100
  const cy = 100
  const fuera = radio
  const dentro = radio - grosor

  const a = punto(cx, cy, fuera, desde)
  const b = punto(cx, cy, fuera, hasta)
  const c = punto(cx, cy, dentro, hasta)
  const d = punto(cx, cy, dentro, desde)

  // Bandera de arco mayor: sin ella, una porción de más de media vuelta se
  // dibuja por el lado corto y sale al revés.
  const mayor = hasta - desde > 180 ? 1 : 0

  return [
    `M ${a.x} ${a.y}`,
    `A ${fuera} ${fuera} 0 ${mayor} 1 ${b.x} ${b.y}`,
    `L ${c.x} ${c.y}`,
    `A ${dentro} ${dentro} 0 ${mayor} 0 ${d.x} ${d.y}`,
    'Z',
  ].join(' ')
}

export function Dona({
  porciones,
  total,
  rotulo,
  onElegir,
  className,
}: {
  porciones: Porcion[]
  /** Lo que va en el agujero, ya formateado. */
  total: string
  /** La línea pequeña debajo del total. */
  rotulo?: string
  /** Si se pasa, las porciones se pueden pulsar para abrir el detalle. */
  onElegir?: (codigo: string) => void
  className?: string
}) {
  const [encima, setEncima] = useState<string | null>(null)
  const id = useId()

  const suma = porciones.reduce((s, p) => s + p.valor, 0)

  if (suma <= 0 || porciones.length === 0) return null

  /*
    Una sola porción se dibuja como anillo entero y no como arco.

    Un arco de 360 grados tiene el mismo punto de salida y de llegada, así que
    el navegador no dibuja nada: el círculo desaparece. Es el caso normal el
    primer mes, cuando todo el gasto es de una sola categoría.
  */
  const unaSola = porciones.length === 1

  let acumulado = 0

  return (
    <div className={cn('flex flex-wrap items-center gap-6', className)}>
      <svg viewBox="0 0 200 200" className="h-48 w-48 shrink-0" role="img" aria-labelledby={id}>
        <title id={id}>Reparto del gasto por categoría</title>

        {unaSola ? (
          <circle
            cx="100"
            cy="100"
            r="72"
            fill="none"
            stroke={colorDe(porciones[0].codigo, 0)}
            strokeWidth="28"
          />
        ) : (
          porciones.map((p, i) => {
            const grados = (p.valor / suma) * 360
            const desde = acumulado
            acumulado += grados

            // Un pelo de separación entre porciones para que se distingan sin
            // pintar un borde blanco, que en modo oscuro se vería como una raya.
            const hasta = acumulado - (grados > 2 ? 0.8 : 0)
            const activa = encima === p.codigo

            return (
              <path
                key={p.codigo}
                d={arco(desde, hasta, activa ? 90 : 86, 28)}
                fill={colorDe(p.codigo, i)}
                className={cn(
                  'transition-all duration-150',
                  onElegir ? 'cursor-pointer' : undefined,
                )}
                onMouseEnter={() => setEncima(p.codigo)}
                onMouseLeave={() => setEncima(null)}
                onClick={onElegir ? () => onElegir(p.codigo) : undefined}
              >
                <title>{`${p.nombre} · ${p.porcentaje}%`}</title>
              </path>
            )
          })
        )}

        <text
          x="100"
          y="96"
          textAnchor="middle"
          className="fill-ink/85 text-[15px] font-light"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {total}
        </text>
        {rotulo ? (
          <text x="100" y="112" textAnchor="middle" className="fill-ink/40 text-[8px]">
            {rotulo}
          </text>
        ) : null}
      </svg>

      {/* La leyenda lleva la cifra al lado del color: una torta sin números
          obliga a estimar áreas, que es justo lo que peor hace el ojo. */}
      <ul className="min-w-[13rem] grow space-y-1.5">
        {porciones.map((p, i) => (
          <li
            key={p.codigo}
            className={cn(
              'flex items-center gap-2.5 rounded-[4px] px-1.5 py-1 text-sm transition-colors',
              encima === p.codigo ? 'bg-ink/[0.04]' : undefined,
              onElegir ? 'cursor-pointer' : undefined,
            )}
            onMouseEnter={() => setEncima(p.codigo)}
            onMouseLeave={() => setEncima(null)}
            onClick={onElegir ? () => onElegir(p.codigo) : undefined}
          >
            <span
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: colorDe(p.codigo, i) }}
              aria-hidden
            />
            <span className="text-ink/75 min-w-0 grow truncate">{p.nombre}</span>
            <span className="tabular text-ink/45 shrink-0 text-xs">{p.porcentaje}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
