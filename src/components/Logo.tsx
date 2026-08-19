import { cn } from '@/lib/cn'
import { EMPRESA } from '@/lib/empresa'

interface LogoProps {
  className?: string
  /** Oculta el texto y deja solo la marca. Para el sidebar colapsado. */
  markOnly?: boolean
  /** Invierte el texto para fondos oscuros. */
  inverted?: boolean
}

/**
 * La marca de la casa.
 *
 * QUÉ HABÍA AQUÍ Y POR QUÉ SE FUE
 *
 * Un pico sobre un bloque de piedra, dibujado a mano en SVG. Tenía dos
 * problemas y el segundo lo volvió urgente.
 *
 * El primero: no era el logo de la empresa. Era una interpretación, y el logo
 * de verdad —la insignia circular de MITSCA— no se parece.
 *
 * El segundo: llevaba los colores escritos a mano, `#1D358F` y `#2B4FD9`, los
 * azules del tema anterior. Cuando la paleta pasó a tierra y naranja, ese
 * dibujo se quedó azul mientras el resto del sistema cambiaba. El menú lateral
 * y la barra superior salen en todas las pantallas, así que la marca azul
 * habría contradicho a la casa entera, en cada pantalla, todo el día.
 *
 * POR QUÉ UNA IMAGEN Y NO UN SVG NUEVO
 *
 * Redibujar la insignia en vectores sería mejor —escalaría sin peso y se podría
 * teñir— pero es un trabajo de horas y tiene que quedar idéntica al original o
 * no vale la pena. La insignia real ya viene con transparencia, así que se
 * apoya igual sobre el menú claro y sobre el oscuro sin nada detrás.
 *
 * Y es circular, que resuelve gratis el caso difícil: contraída, la barra
 * lateral necesita una marca cuadrada de 32 píxeles, y un círculo lo llena
 * mejor que cualquier recorte de un logotipo horizontal.
 *
 * PENDIENTE, Y NO ES MENOR: `src/lib/ficha/marca.ts` sigue dibujando el pico
 * azul sobre lienzo, y de ahí lo toman el carnet, las constancias, los recibos
 * de pago y los documentos de venta. Esos papeles salen de la empresa con la
 * marca vieja hasta que se redibujen.
 */
export function Logo({ className, markOnly = false, inverted = false }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <img
        src="/media/marca.webp"
        alt=""
        aria-hidden="true"
        width={512}
        height={521}
        className="size-8 shrink-0 object-contain"
      />

      {!markOnly && (
        <span
          className={cn(
            // 15px y no 17: "Minería Internacional" es el doble de largo que
            // el rótulo anterior y a 17 se sale del riel del menú contraíble.
            'min-w-0 truncate text-[15px] leading-tight font-semibold tracking-tight',
            inverted ? 'text-white' : 'text-ink/90',
          )}
        >
          {EMPRESA.marca}
        </span>
      )}
    </span>
  )
}
