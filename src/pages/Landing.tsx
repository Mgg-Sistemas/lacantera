import { Link } from 'react-router'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { FondoCantera } from '@/components/FondoCantera'
import { EMPRESA } from '@/lib/empresa'
import { usePuntero } from '@/lib/puntero'

/**
 * La puerta de la calle.
 *
 * Es lo único del sistema que ve alguien sin credenciales, así que no lleva
 * datos: ni cifras de producción, ni nombres, ni el estado de la operación.
 *
 * DOS PANTALLAS Y NI UNA MÁS
 *
 * Arriba, la explotación a sangre y una sola cosa que hacer. Abajo, un único
 * bloque con el recorrido de la piedra. Se descartó el "Quiénes somos", los
 * "Servicios" y el "Contacto": una cantera no se elige por su página web, y
 * quien llega aquí o viene a entrar al sistema o viene a saber a qué se dedica
 * la casa. Las dos preguntas se responden sin bajar.
 *
 * POR QUÉ LOS CAPÍTULOS VAN NUMERADOS
 *
 * Numerar unas secciones cualesquiera es un adorno prestado. Aquí no lo es:
 * la piedra tiene un recorrido y ocurre en ese orden y no en otro. Se vuela
 * antes de extraer y se tritura antes de despachar. El número dice algo que el
 * lector necesita —esto va después de aquello—, y por eso se queda.
 *
 * Es además lo contrario de una lista de servicios: no enumera lo que la
 * empresa vende, enumera lo que le pasa a la roca.
 */

/** El camino real del material, en el orden en que ocurre. */
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
    detalle: 'La planta la reduce y la clasifica por tamaño, de piedra picada a arena.',
  },
  {
    romano: 'IV',
    titulo: 'Se despacha',
    detalle: 'La romana pesa el camión cargado y sale con su guía de movilización.',
  },
]

export function Landing() {
  const pantalla = usePuntero<HTMLDivElement>()

  return (
    <div className="bg-royal-950">
      {/* ================= El frente ================= */}
      <div
        ref={pantalla}
        className="bg-royal-950 relative flex min-h-svh flex-col overflow-hidden"
      >
        <div className="sigue-al-puntero absolute -inset-4" aria-hidden="true">
          <div className="anim-encuadre absolute inset-0">
            <FondoCantera />
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

          {/* El encargo pedía resaltar esto y sólo esto. Va en versalitas y
              partido en dos renglones: a este cuerpo, en uno solo, no cabe en
              un teléfono sin encogerlo hasta volverlo un subtítulo. */}
          <h1 className="anim-surgir mt-9 text-3xl leading-[1.05] font-bold tracking-[0.02em] text-balance text-white uppercase [animation-delay:420ms] sm:text-5xl lg:text-6xl">
            Explotación
            <br />
            Internacional
          </h1>

          {/* Al 55% se perdía sobre la arena. Subido al 75%: sigue siendo un
              rótulo por debajo del titular, pero se lee. */}
          <p className="anim-surgir text-2xs mt-6 font-mono tracking-[0.22em] text-white/75 uppercase [animation-delay:560ms]">
            {EMPRESA.actividad} · {EMPRESA.estado}
          </p>

          <Link
            to="/entrar"
            className="anim-surgir rounded-control text-royal-800 hover:bg-royal-50 focus-visible:outline-safety mt-10 inline-flex h-12 items-center gap-2 bg-white px-7 text-base font-semibold shadow-[0_10px_28px_rgba(0,0,0,0.35)] transition-[color,background-color,scale] duration-150 [animation-delay:700ms] motion-safe:active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-3"
          >
            Entrar al sistema
            <ArrowRight className="size-[18px]" />
          </Link>
        </main>

        {/* La única invitación a bajar. Sin ella el bloque de abajo no existe
            para quien abre esto en un portátil, donde la pantalla se llena
            justa y no hay nada que asome por el borde. */}
        <div className="relative z-10 flex justify-center pb-8">
          <ChevronDown
            className="anim-aparecer size-5 text-white/40 [animation-delay:1100ms]"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* ================= El recorrido de la piedra ================= */}
      <section className="bg-canvas px-6 py-20 sm:px-10 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-ink/40 text-2xs font-mono tracking-[0.22em] uppercase">
            De la roca al camión
          </h2>

          <ol className="mt-10 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
            {CAPITULOS.map((c) => (
              <li key={c.romano}>
                {/* El número y el filete: el filete es lo que hace que cuatro
                    bloques se lean como una secuencia y no como cuatro
                    tarjetas sueltas puestas en fila. */}
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

          {/* El pie identifica a la empresa donde toca identificarla: al final
              y en letra pequeña, como en cualquier papel que salga de aquí. No
              es una sección de "quiénes somos" — es la firma. */}
          <div className="border-hairline mt-20 border-t pt-8">
            <p className="text-ink/70 text-2xs font-mono tracking-[0.18em] uppercase">
              {EMPRESA.razonSocial}
            </p>
            <p className="text-ink/40 text-2xs mt-1.5 font-mono tracking-[0.14em]">
              RIF {EMPRESA.rif} · {EMPRESA.estado}
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
