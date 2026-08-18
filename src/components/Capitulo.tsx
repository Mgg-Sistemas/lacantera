import { cn } from '@/lib/cn'
import { useEnPantalla } from '@/lib/enPantalla'

export interface CapituloDatos {
  romano: string
  /** El verbo. Es lo que le pasa a la roca, no lo que vende la empresa. */
  titulo: string
  detalle: string
  /** Sin fotografía, el capítulo cambia de registro y descansa la vista. */
  imagen?: string
}

/**
 * Un capítulo del recorrido de la piedra.
 *
 * Ocupa la pantalla entera porque un relato no se lee en tarjetas: si caben
 * tres a la vez, no hay recorrido, hay un catálogo. A pantalla completa cada
 * paso obliga a detenerse el tiempo que dura leerlo, que es exactamente lo que
 * hace que se perciba como una secuencia y no como una lista.
 *
 * EL NÚMERO EN GRANDE Y EL TÍTULO EN ARCHIVO
 *
 * El título estuvo en Inter ligera. La idea era que letra fina sobre roca dijera
 * que hay oficio detrás y no fuerza bruta, pero en pantalla no se sostenía: a
 * ese tamaño y sobre una fotografía, Inter ligera se deshace y el titular pierde
 * el peso que el asunto tiene.
 *
 * Archivo en peso medio resuelve las dos cosas. Es una grotesca de titular
 * —ancha, firme, sin redondeces, del mundo de los rótulos de maquinaria— así
 * que aguanta sobre la foto sin necesidad de negrita. Sigue sin gritar, que era
 * lo que se buscaba, pero ahora se lee.
 *
 * El número es lo único pesado, y va enorme y translúcido detrás del texto:
 * marca el sitio dentro del relato sin competir por la lectura.
 */
export function Capitulo({ datos, indice }: { datos: CapituloDatos; indice: number }) {
  const { ref, dentro } = useEnPantalla<HTMLElement>({ unaVez: true, parte: 0.4 })

  return (
    <section
      ref={ref}
      id={`capitulo-${indice}`}
      className="bg-royal-950 relative flex min-h-svh items-center overflow-hidden"
    >
      {datos.imagen ? (
        <>
          <img
            src={datos.imagen}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            width={1500}
            height={995}
            /* La imagen entra con la escala un punto por encima y se posa
               cuando el bloque llega. No es un zoom continuo —eso mareaba—:
               es el capítulo asentándose una sola vez. */
            className={cn(
              'absolute inset-0 size-full object-cover transition-[scale,opacity] duration-[1800ms] ease-out',
              dentro ? 'scale-100 opacity-100' : 'scale-105 opacity-0',
            )}
          />
          {/* Cargado, porque aquí la fotografía es atmósfera y el asunto es el
              texto: sobre roca a plena luz no se lee.

              Y casi neutro, no teñido con el marrón de la casa. Teñir una
              fotografía de roca con el color de la marca la vuelve sepia y le
              quita lo único que aporta, que es parecer real. El color de la
              casa entra por la insignia y por los acentos, no por un filtro
              encima de todo. */}
          <div className="absolute inset-0 bg-black/70" aria-hidden="true" />
        </>
      ) : null}

      {/* El hueco de abajo es para el raíl de capítulos, que va fijo sobre esta
          zona. Sin él, la última línea del párrafo queda debajo del indicador y
          hay que adivinarla. */}
      <div className="relative mx-auto w-full max-w-6xl px-6 pt-24 pb-40 sm:px-10 sm:pb-44">
        {/* El número, enorme y detrás. Se sale del bloque por arriba a
            propósito: un dígito recortado por el borde se lee como una marca
            impresa en la piedra, no como un adorno centrado. */}
        <p
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute -top-4 left-4 font-mono text-[7rem] leading-none font-bold text-white/[0.06] transition-opacity duration-1000 select-none sm:left-6 sm:text-[11rem]',
            dentro ? 'opacity-100' : 'opacity-0',
          )}
        >
          {datos.romano}
        </p>

        <div className="relative max-w-2xl">
          <p
            className={cn(
              'text-2xs font-mono tracking-[0.28em] text-white/45 uppercase transition-all duration-700 ease-out',
              dentro ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
            )}
          >
            Capítulo {datos.romano}
          </p>

          <h3
            className={cn(
              'font-titular mt-5 text-4xl leading-[1.02] font-medium tracking-[-0.01em] text-balance text-white transition-all delay-150 duration-700 ease-out sm:text-6xl lg:text-7xl',
              dentro ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0',
            )}
          >
            {datos.titulo}
          </h3>

          <p
            className={cn(
              'mt-7 max-w-lg text-base leading-relaxed text-white/65 transition-all delay-300 duration-700 ease-out sm:text-lg',
              dentro ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
            )}
          >
            {datos.detalle}
          </p>
        </div>
      </div>
    </section>
  )
}
