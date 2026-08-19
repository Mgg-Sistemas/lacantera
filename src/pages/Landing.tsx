import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { FondoCantera } from '@/components/FondoCantera'
import { Capitulo, type CapituloDatos } from '@/components/Capitulo'
import { EMPRESA } from '@/lib/empresa'
import { usePuntero } from '@/lib/puntero'
import { useEnPantalla } from '@/lib/enPantalla'
import { cn } from '@/lib/cn'

/**
 * La puerta de la calle.
 *
 * Es lo único del sistema que ve alguien sin credenciales, así que no lleva
 * datos de la operación: ni cifras de producción, ni nombres, ni el estado del
 * patio.
 *
 * TODO ESTO EXISTE PARA UN SOLO BOTÓN
 *
 * La portada es larga y se recorre, pero tiene una única intención y no la
 * pierde en ningún punto: entrar al sistema. El llamado aparece en el frente,
 * en la barra que baja contigo y al cerrar; nunca hay que volver arriba a
 * buscarlo. Todo lo demás es el relato que justifica que exista un sistema
 * detrás.
 *
 * QUÉ SE QUEDÓ FUERA
 *
 * El "Quiénes somos", los "Servicios" y el "Contacto". Una cantera no se elige
 * por su página web. Lo que se cuenta es lo que le pasa a la roca —que es lo
 * que la empresa hace de verdad, y de paso explica cada módulo del sistema.
 */

/**
 * El camino real del material, en el orden en que ocurre.
 *
 * Numerar unas secciones cualesquiera es un adorno prestado, de los que más
 * delatan una plantilla. Aquí no lo es: se vuela antes de extraer y se tritura
 * antes de despachar. El número dice algo que hace falta saber, y por eso el
 * raíl de abajo puede usarlo para situar a quien lee.
 *
 * El tercero estuvo un tiempo sin fotografía, no por gusto sino porque no
 * había ninguna de la planta. Ya la hay, y el capítulo cierra el recorrido: la
 * trituración es la única parte que no ocurre en el frente sino dentro de una
 * máquina, y la imagen de las cintas y el molino lo dice sin explicarlo.
 */
const CAPITULOS: CapituloDatos[] = [
  {
    romano: 'I',
    titulo: 'Se abre el banco',
    detalle:
      'La barrenación y la carga explosiva cortan el frente en escalones. Cada banco es una cota, y de su altura depende dónde se para la máquina el resto del año.',
    imagen: '/cantera/02.jpg',
  },
  {
    romano: 'II',
    titulo: 'Se arranca la roca',
    detalle:
      'El cargador levanta lo que la voladura soltó y el camión lo baja al patio. Aquí empieza a contar el horómetro, y con él el mantenimiento de cada máquina.',
    imagen: '/cantera/01.jpg',
  },
  {
    romano: 'III',
    titulo: 'Se reduce y se clasifica',
    detalle:
      'La planta parte la roca y la separa por tamaño. De un mismo turno salen cuatro materiales distintos, y cada uno entra al patio contado por separado.',
    imagen: '/media/concrete-batching-plant-outdoor-gravel-conveyors.jpg',
  },
  {
    romano: 'IV',
    titulo: 'Se pesa y sale',
    detalle:
      'La romana pesa el camión cargado y el material sale con su guía de movilización. Desde ahí, lo que era piedra en el frente es una factura y un asiento.',
    imagen: '/cantera/03.jpg',
  },
]

/**
 * Lo que sale del patio.
 *
 * Los nombres son los de la casa, no los de un folleto: salen del catálogo del
 * sistema, que es el mismo con el que se cuenta cada turno.
 *
 * POR QUÉ NO VAN SOLOS
 *
 * Puestos a secas —cuatro nombres uno debajo de otro— se leen como títulos
 * puestos porque sí. A quien conoce el oficio no le dicen nada nuevo, y a quien
 * no, no le dicen nada.
 *
 * Lo que los vuelve una serie y no una lista es el hecho que los une: los
 * cuatro salen de la MISMA trituración y se separan por tamaño, del más grueso
 * al más fino. Eso no es adorno, es cómo funciona una planta, y explica por qué
 * son cuatro y no uno.
 *
 * QUÉ NO SE INVENTA AQUÍ
 *
 * Ni calibres en pulgadas ni usos recomendados. La granulometría exacta de esta
 * cantera la está averiguando la dirección de Sistemas; hasta que llegue, poner
 * un 3/4" copiado de la costumbre del gremio sería exactamente el número de
 * ejemplo que este sistema promete no tener. Cuando llegue el dato, entra en
 * `calibre` y la pantalla no cambia.
 *
 * La tonelada sí es real: los cinco productos del catálogo se llevan en TON.
 */
interface Material {
  nombre: string
  /** Dónde cae en el cribado. Es lo único que se afirma, y es verdad por el proceso. */
  grano: string
  /** Reservado para la granulometría cuando la dirección la confirme. */
  calibre?: string
}

const MATERIALES: Material[] = [
  { nombre: 'Piedra picada #1', grano: 'Grueso' },
  { nombre: 'Piedra picada #2', grano: 'Medio' },
  { nombre: 'Granzón', grano: 'Fino' },
  { nombre: 'Polvillo', grano: 'Lo más fino del cribado' },
]

export function Landing() {
  const pantalla = usePuntero<HTMLDivElement>()
  const frente = useRef<HTMLDivElement>(null)
  const [fuera, setFuera] = useState(false)
  const [activo, setActivo] = useState<number | null>(null)

  /* La barra aparece cuando el frente se va. */
  useEffect(() => {
    const el = frente.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(([e]) => setFuera(!e.isIntersecting))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  /*
    En qué capítulo va la lectura.

    Se guarda cuánto asoma cada uno y manda el que más. Elegir "el primero que
    entra" fallaría justo en el cruce entre dos, que es cuando el raíl tiene
    que decidir — y se quedaría marcando el anterior media pantalla de más.
  */
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const secciones = document.querySelectorAll<HTMLElement>('[id^="capitulo-"]')
    if (!secciones.length) return

    const asoma = new Map<number, number>()
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          asoma.set(Number(e.target.id.split('-')[1]), e.intersectionRatio)
        }
        let mejor: number | null = null
        let mayor = 0.25
        for (const [i, r] of asoma) {
          if (r > mayor) {
            mayor = r
            mejor = i
          }
        }
        setActivo(mejor)
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    )

    secciones.forEach((s) => obs.observe(s))
    return () => obs.disconnect()
  }, [])

  const cierre = useEnPantalla<HTMLElement>({ unaVez: true, parte: 0.3 })

  return (
    <div className="bg-canvas">
      {/* ================= La barra que baja contigo ================= */}
      {/* No está desde el principio: sobre el frente sobraría, porque allí el
          llamado ya ocupa el centro de la pantalla. Aparece justo cuando deja
          de verse, que es el momento en que se perdería. */}
      <div
        className={cn(
          'bg-royal-950/85 fixed inset-x-0 top-0 z-50 backdrop-blur transition-[opacity,translate] duration-300',
          fuera ? 'opacity-100' : 'pointer-events-none -translate-y-full opacity-0',
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3 sm:px-10">
          <img
            src="/media/marca.webp"
            alt={EMPRESA.razonSocial}
            width={512}
            height={521}
            /* Sin plancha blanca detras: la insignia nueva es transparente. */
            className="h-10 w-auto"
          />
          <Link
            to="/entrar"
            className="rounded-control text-royal-800 hover:bg-royal-50 focus-visible:outline-safety inline-flex h-9 items-center gap-2 bg-white px-4 text-sm font-semibold transition-[color,background-color,scale] duration-150 motion-safe:active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Entrar al sistema
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>

      {/* ================= El raíl de capítulos ================= */}
      {/*
        Dónde va la lectura dentro del relato.

        Es el único recurso que se tomó prestado tal cual de la referencia, y se
        tomó porque aquí dice algo cierto: el material recorre esos cuatro pasos
        en ese orden. Un raíl idéntico sobre cuatro secciones intercambiables
        sería decoración; sobre una secuencia real es orientación.

        Se oculta solo cuando la lectura sale de los capítulos. Un indicador de
        progreso que sigue en pantalla cuando ya no hay progreso que indicar
        estorba y confunde.
      */}
      <div
        className={cn(
          'pointer-events-none fixed inset-x-0 bottom-0 z-40 transition-opacity duration-500',
          activo === null ? 'opacity-0' : 'opacity-100',
        )}
        aria-hidden="true"
      >
        {/*
          El velo desenfocado va aquí y solo mientras hay raíl.

          Sobre la arena clara del capítulo I, las versalitas blancas del raíl
          se perdían: el degradado solo no basta porque la fotografía tiene
          detalle fino justo a esa altura, y el texto competía con la roca.

          El desenfoque se aplica de forma condicionada y no siempre. Puesto
          fijo seguiría emborronando la franja de abajo en la portada —donde
          está el botón de entrar— y en el cierre, que tiene otro. Son las dos
          pantallas donde no hay raíl y donde el fondo tiene que verse limpio.

          No basta con que el contenedor esté en `opacity-0`: un
          `backdrop-filter` sigue trabajando en varios navegadores aunque su
          elemento sea invisible, así que la clase entra y sale con el raíl.
        */}
        <div
          className={cn(
            /*
              La banda se ciñe al texto.

              La primera versión abría 40px por arriba y encima llevaba un
              degradado largo: el desenfoque se comía media fotografía y se
              notaba más el velo que el raíl. Ahora es una franja de la altura
              del filete más su rótulo, con un tinte plano en vez de degradado
              —un degradado alto vuelve a extender el borrón hacia arriba, que
              es justo lo que sobraba.
            */
            'bg-royal-950/55 px-6 pt-2 pb-2.5 sm:px-10',
            /*
              El borde de arriba se desvanece con una mascara.

              Con el tinte a secas se dibujaba una linea horizontal donde
              empezaba la banda, y esa linea se veia mas que el rail. La
              mascara apaga el borde superior de forma progresiva y —esto es lo
              que la hace la herramienta correcta— apaga con el la capa
              entera: el tinte y el desenfoque a la vez. Un degradado encima
              solo habria disimulado el color, dejando el corte del blur.
            */
            '[mask-image:linear-gradient(to_top,#000_58%,transparent)]',
            '[-webkit-mask-image:linear-gradient(to_top,#000_58%,transparent)]',
            activo !== null && 'backdrop-blur-[2px]',
          )}
        >
          <ol className="mx-auto flex max-w-6xl gap-3 sm:gap-6">
            {CAPITULOS.map((c, i) => (
              <li key={c.romano} className="min-w-0 flex-1">
                <div className="h-px w-full overflow-hidden bg-white/20">
                  <div
                    className={cn(
                      'h-px origin-left bg-white transition-transform duration-700 ease-out',
                      i < (activo ?? -1) ? 'scale-x-100' : i === activo ? 'scale-x-100' : 'scale-x-0',
                    )}
                  />
                </div>
                <p
                  className={cn(
                    'text-2xs mt-2 truncate font-mono tracking-[0.18em] uppercase transition-colors duration-500',
                    i === activo ? 'text-white' : 'text-white/35',
                  )}
                >
                  <span className="hidden sm:inline">Capítulo </span>
                  {c.romano}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* ================= El frente ================= */}
      <div ref={frente} className="bg-royal-950 relative flex min-h-svh flex-col overflow-hidden">
        <div ref={pantalla} className="absolute inset-0" aria-hidden="true">
          <div className="sigue-al-puntero absolute -inset-4">
            <div className="anim-encuadre absolute inset-0">
              <FondoCantera />
            </div>
          </div>
        </div>

        <div className="anim-aparecer absolute inset-0 bg-black/45" aria-hidden="true" />
        <div
          className="from-tierra-950/80 via-tierra-950/20 absolute inset-0 bg-gradient-to-t to-transparent"
          aria-hidden="true"
        />

        <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          {/*
            La marca, ya sin cartel.

            Aquí hubo un rectángulo blanco detrás del logo. No era un capricho:
            el logo llegaba en JPEG, que no sabe de transparencia, y sobre la
            fotografía habría sido un parche recortado a escuadra. El cartel
            convertía ese defecto en algo deliberado.

            La insignia nueva llega en PNG con transparencia, así que el
            problema desaparece y con él el remedio: se apoya directamente
            sobre la roca, que es como tiene que verse.

            Se sirve en WebP y recortada del aire que la rodeaba: 585 KB de
            origen a 79, sin pérdida visible. Esto se abre desde la cantera.
          */}
          <img
            src="/media/marca.webp"
            alt={EMPRESA.razonSocial}
            width={512}
            height={521}
            className="anim-surgir block w-[150px] drop-shadow-[0_6px_20px_rgba(0,0,0,0.5)] [animation-delay:240ms] sm:w-[190px]"
          />

          <h1 className="anim-surgir font-titular mt-9 text-4xl leading-[0.95] font-extrabold tracking-[-0.01em] text-balance text-white uppercase [animation-delay:420ms] sm:text-6xl lg:text-7xl">
            Explotación
            <br />
            Internacional
          </h1>

          <p className="anim-surgir text-2xs mt-6 font-mono tracking-[0.22em] text-white/75 uppercase [animation-delay:560ms]">
            {EMPRESA.actividad}
          </p>

          <Link
            to="/entrar"
            className="anim-surgir rounded-control text-royal-800 hover:bg-royal-50 focus-visible:outline-safety mt-10 inline-flex h-12 items-center gap-2 bg-white px-7 text-base font-semibold shadow-[0_10px_28px_rgba(0,0,0,0.35)] transition-[color,background-color,scale] duration-150 [animation-delay:700ms] motion-safe:active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-3"
          >
            Entrar al sistema
            <ArrowRight className="size-[18px]" />
          </Link>
        </main>

        {/* La invitación a bajar, con su rótulo. Sin ella el relato entero no
            existe para quien abre esto en un portátil, donde la pantalla se
            llena justa y nada asoma por el borde. */}
        <div className="relative z-10 flex flex-col items-center gap-2 pb-8">
          <p className="anim-aparecer text-2xs font-mono tracking-[0.24em] text-white/45 uppercase [animation-delay:1000ms]">
            De la roca al camión
          </p>
          <ChevronDown
            className="anim-aparecer size-5 text-white/40 [animation-delay:1150ms]"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* ================= El recorrido ================= */}
      {CAPITULOS.map((c, i) => (
        <Capitulo key={c.romano} datos={c} indice={i} />
      ))}

      {/* ================= Lo que sale del patio ================= */}
      {/*
        El único momento con una persona.

        Todo lo anterior son máquinas y paisaje, que es lo que hace grande a una
        cantera y también lo que la vuelve abstracta. Una mano sosteniendo la
        piedra devuelve la escala: esto es lo que se arranca, y cabe en un
        puño. Va aquí y no antes porque es el punto donde se nombra el
        material, y el material es justo lo que sujeta esa mano.

        La foto va al lado y no detrás. Detrás obligaría a taparla con un velo
        para que se leyeran los nombres, y lo que hay que ver de esta imagen
        —el grano de la piedra, el polvo en los dedos— es lo primero que se
        pierde bajo un velo.
      */}
      <section className="bg-royal-900 px-6 py-24 sm:px-10 lg:py-32">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[5fr_6fr] lg:gap-16">
          <img
            src="/media/tomandopiedra.jpeg"
            alt="Un trabajador sostiene en la mano un fragmento de la piedra extraída."
            width={1280}
            height={840}
            loading="lazy"
            decoding="async"
            className="rounded-card w-full object-cover"
          />

          <div>
            <h2 className="text-2xs font-mono tracking-[0.28em] text-white/45 uppercase">
              Lo que sale del patio
            </h2>

            {/* La frase que convierte la lista en una serie. Sin ella, cuatro
                nombres sueltos; con ella, cuatro salidas de un mismo proceso. */}
            <p className="mt-4 max-w-md text-base leading-relaxed text-white/60">
              Los cuatro salen de la misma trituración y se separan por tamaño. Se despachan por
              tonelada, pesados en romana.
            </p>

            {/* Los nombres solos y en grande. Sin descripciones inventadas de
                para qué sirve cada calibre y sin toneladas. */}
            <ul className="mt-8">
              {MATERIALES.map((m) => (
                <li
                  key={m.nombre}
                  className="flex items-baseline justify-between gap-6 border-t border-white/12 py-5"
                >
                  <span className="text-2xl font-light tracking-tight text-white/90 sm:text-3xl">
                    {m.nombre}
                  </span>
                  {/* El grano a la derecha y en mono: es un dato de ficha, no
                      un subtítulo. Alineado en columna, los cuatro se leen de
                      un vistazo como lo que son — una gradación. */}
                  <span className="text-2xs shrink-0 text-right font-mono tracking-[0.14em] text-white/40 uppercase">
                    {m.calibre ?? m.grano}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ================= El cierre ================= */}
      <section ref={cierre.ref} className="bg-royal-950 relative overflow-hidden">
        <img
          src="/cantera/01.jpg"
          alt=""
          aria-hidden="true"
          width={1500}
          height={995}
          loading="lazy"
          className={cn(
            'absolute inset-0 size-full object-cover transition-[scale,opacity] duration-[2000ms] ease-out',
            cierre.dentro ? 'scale-100 opacity-100' : 'scale-105 opacity-0',
          )}
        />
        <div className="absolute inset-0 bg-black/72" aria-hidden="true" />

        <div className="relative mx-auto max-w-6xl px-6 py-28 text-center sm:px-10 lg:py-36">
          <p className="text-2xs font-mono tracking-[0.28em] text-white/55 uppercase">
            Sistema de control interno
          </p>
          <p className="font-titular mx-auto mt-6 max-w-2xl text-3xl leading-[1.1] font-semibold text-balance text-white sm:text-5xl">
            Todo lo anterior, registrado en un solo sitio.
          </p>

          <Link
            to="/entrar"
            className="rounded-control text-royal-800 hover:bg-royal-50 focus-visible:outline-safety mt-10 inline-flex h-12 items-center gap-2 bg-white px-7 text-base font-semibold shadow-[0_10px_28px_rgba(0,0,0,0.35)] transition-[color,background-color,scale] duration-150 motion-safe:active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-3"
          >
            Entrar al sistema
            <ArrowRight className="size-[18px]" />
          </Link>

          <p className="mt-6 text-xs text-white/45">
            El acceso lo asigna la administración de la empresa.
          </p>
        </div>
      </section>

      {/* La firma, como al pie de cualquier papel que salga de aquí. No es un
          "quiénes somos": es quién responde por esto. */}
      <footer className="px-6 py-10 sm:px-10">
        <div className="mx-auto max-w-6xl">
          <p className="text-ink/70 text-2xs font-mono tracking-[0.18em] uppercase">
            {EMPRESA.razonSocial}
          </p>
          {/* Sin la ubicación. La portada es pública y la calle no tiene por
              qué saber dónde está la explotación; el RIF ya identifica a la
              empresa ante quien tenga que identificarla. */}
          <p className="text-ink/40 text-2xs mt-1.5 font-mono tracking-[0.14em]">
            RIF {EMPRESA.rif}
          </p>
        </div>
      </footer>
    </div>
  )
}
