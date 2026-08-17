import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { FondoCantera } from '@/components/FondoCantera'
import { EMPRESA } from '@/lib/empresa'
import { usePuntero } from '@/lib/puntero'
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
 * Se puede bajar y hay algo que leer, pero la página tiene una única intención
 * y no la pierde en ningún punto del recorrido: entrar al sistema. Por eso el
 * llamado aparece tres veces —en el frente, en la barra que baja contigo y al
 * cerrar— y nunca hay que volver arriba a buscarlo. Todo lo demás es contexto
 * para quien todavía no sabe de quién es esta casa.
 *
 * QUÉ SE QUEDÓ FUERA
 *
 * El "Quiénes somos", los "Servicios" y el "Contacto". Una cantera no se elige
 * por su página web. Lo que sí se cuenta es lo que le pasa a la roca, que es
 * lo que la empresa hace de verdad y además explica el sistema que hay detrás.
 */

/**
 * El camino real del material, en el orden en que ocurre.
 *
 * Numerar unas secciones cualesquiera es un adorno prestado, y de los que más
 * delatan una plantilla. Aquí no lo es: se vuela antes de extraer y se tritura
 * antes de despachar. El número dice algo que hace falta saber.
 */
const CAPITULOS = [
  {
    romano: 'I',
    titulo: 'Se vuela',
    detalle: 'La barrenación y la carga explosiva abren el banco en el frente.',
  },
  {
    romano: 'II',
    titulo: 'Se extrae',
    detalle: 'La excavadora carga la roca arrancada y el camión la baja al patio.',
  },
  {
    romano: 'III',
    titulo: 'Se tritura',
    detalle: 'La planta la reduce y la clasifica por tamaño, de piedra picada a polvillo.',
  },
  {
    romano: 'IV',
    titulo: 'Se despacha',
    detalle: 'La romana pesa el camión cargado y sale con su guía de movilización.',
  },
]

/**
 * Lo que sale del patio.
 *
 * Los nombres son los de la casa, no los de un folleto: salen del parte de
 * turno, que es donde se cuenta lo que produce cada jornada. Van sin cifras a
 * propósito — el sistema promete que ningún número de esta pantalla es de
 * ejemplo, y la producción acumulada no es asunto de la calle.
 */
const MATERIALES = ['Piedra picada #1', 'Piedra picada #2', 'Granzón', 'Polvillo']

export function Landing() {
  const pantalla = usePuntero<HTMLDivElement>()
  const frente = useRef<HTMLDivElement>(null)
  const [fuera, setFuera] = useState(false)

  /*
    La barra aparece cuando el frente se va.

    Con un observador y no escuchando el scroll: el navegador avisa cuando la
    portada deja de verse, en vez de preguntárselo nosotros en cada uno de los
    cientos de eventos que dispara una rueda de ratón.
  */
  useEffect(() => {
    const el = frente.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(([e]) => setFuera(!e.isIntersecting))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div className="bg-canvas">
      {/* ================= La barra que baja contigo ================= */}
      {/* No está arriba desde el principio: sobre el frente sobraría, porque
          ahí el llamado ya ocupa el centro de la pantalla. Aparece justo
          cuando deja de verse, que es el momento en que se perdería. */}
      <div
        className={cn(
          'bg-royal-950/90 fixed inset-x-0 top-0 z-50 backdrop-blur transition-[opacity,translate] duration-300',
          fuera ? 'opacity-100' : 'pointer-events-none -translate-y-full opacity-0',
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3 sm:px-10">
          <img
            src="/marca.jpg"
            alt={EMPRESA.razonSocial}
            width={566}
            height={525}
            className="h-9 w-auto rounded-[3px] bg-white p-1"
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

      {/* ================= El frente ================= */}
      <div
        ref={frente}
        className="bg-royal-950 relative flex min-h-svh flex-col overflow-hidden"
      >
        <div ref={pantalla} className="absolute inset-0" aria-hidden="true">
          <div className="sigue-al-puntero absolute -inset-4">
            <div className="anim-encuadre absolute inset-0">
              <FondoCantera />
            </div>
          </div>
        </div>

        {/* El velo va más cargado que en el acceso, y por una razón concreta:
            allí el texto blanco vive dentro de una placa blanca y sólo la
            firma queda al aire; aquí el titular, el rótulo y el botón están
            todos sobre la fotografía. Sobre la arena clara del fondo aéreo, un
            blanco al 55% se pierde. */}
        <div className="bg-royal-950/50 anim-aparecer absolute inset-0" aria-hidden="true" />
        <div
          className="from-royal-950/90 via-royal-950/35 absolute inset-0 bg-gradient-to-t to-transparent"
          aria-hidden="true"
        />

        <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          {/*
            La marca sobre un cartel blanco.

            El logo trae su propio fondo blanco —llega en JPEG y el formato no
            sabe de transparencia—, así que sobre la fotografía sería un parche
            recortado a escuadra. Puesto deliberadamente sobre un cartel, con
            aire alrededor, deja de ser un defecto: es como una cantera rotula
            su entrada, una placa atornillada a la vista de quien llega.
          */}
          <div className="anim-surgir bg-white shadow-popover rounded-card p-4 [animation-delay:240ms] sm:p-5">
            <img
              src="/marca.jpg"
              alt={EMPRESA.razonSocial}
              width={566}
              height={525}
              className="block w-[160px] sm:w-[190px]"
            />
          </div>

          <h1 className="anim-surgir mt-9 text-3xl leading-[1.05] font-bold tracking-[0.02em] text-balance text-white uppercase [animation-delay:420ms] sm:text-5xl lg:text-6xl">
            Explotación
            <br />
            Internacional
          </h1>

          {/* Al 55% se perdía sobre la arena. Subido al 75%: sigue siendo un
              rótulo por debajo del titular, pero se lee. */}
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

        {/* La única invitación a bajar. Sin ella el resto no existe para quien
            abre esto en un portátil, donde la pantalla se llena justa y no hay
            nada que asome por el borde. */}
        <div className="relative z-10 flex justify-center pb-8">
          <ChevronDown
            className="anim-aparecer size-5 text-white/40 [animation-delay:1100ms]"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* ================= El recorrido de la piedra ================= */}
      <section className="px-6 py-20 sm:px-10 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-ink/40 text-2xs font-mono tracking-[0.22em] uppercase">
            De la roca al camión
          </h2>

          <ol className="mt-10 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
            {CAPITULOS.map((c) => (
              <li key={c.romano}>
                {/* El filete es lo que hace que cuatro bloques se lean como una
                    secuencia y no como cuatro tarjetas sueltas puestas en fila. */}
                <p className="text-royal-600 dark:text-royal-300 font-mono text-sm tracking-[0.1em]">
                  {c.romano}
                </p>
                <div className="bg-royal-600/25 mt-3 h-px w-full" aria-hidden="true" />

                <h3 className="text-ink/90 mt-5 text-xl font-semibold tracking-tight">
                  {c.titulo}
                </h3>
                <p className="text-ink/55 mt-2 text-sm leading-relaxed">{c.detalle}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ================= Lo que sale del patio ================= */}
      {/* En negativo para separar del bloque anterior sin una línea ni un
          borde. El cambio de fondo hace de división y de respiro a la vez. */}
      <section className="bg-royal-950 px-6 py-20 sm:px-10 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xs font-mono tracking-[0.22em] text-white/40 uppercase">
            Lo que sale del patio
          </h2>

          {/* Los nombres solos y en grande. Sin descripciones inventadas de
              para qué sirve cada calibre y sin toneladas: la producción no es
              asunto de la calle, y este sistema tiene por norma que ningún
              número en pantalla sea de ejemplo. */}
          <ul className="mt-10 grid gap-x-10 sm:grid-cols-2">
            {MATERIALES.map((m) => (
              <li
                key={m}
                className="border-t border-white/12 py-6 text-2xl font-semibold tracking-tight text-white/90 sm:text-3xl"
              >
                {m}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ================= El cierre ================= */}
      <section className="relative overflow-hidden">
        <img
          src="/cantera/01.jpg"
          alt=""
          aria-hidden="true"
          width={1500}
          height={995}
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
        <div className="bg-royal-950/72 absolute inset-0" aria-hidden="true" />

        <div className="relative mx-auto max-w-6xl px-6 py-24 text-center sm:px-10 lg:py-32">
          <p className="text-2xs font-mono tracking-[0.22em] text-white/55 uppercase">
            Sistema de control interno
          </p>
          <p className="mx-auto mt-5 max-w-xl text-xl leading-snug text-balance text-white/90 sm:text-2xl">
            La explotación, el inventario, las compras y la nómina, en un solo sitio.
          </p>

          <Link
            to="/entrar"
            className="rounded-control text-royal-800 hover:bg-royal-50 focus-visible:outline-safety mt-9 inline-flex h-12 items-center gap-2 bg-white px-7 text-base font-semibold shadow-[0_10px_28px_rgba(0,0,0,0.35)] transition-[color,background-color,scale] duration-150 motion-safe:active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-3"
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
