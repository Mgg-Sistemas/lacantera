import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { EMPRESA } from '@/lib/empresa'

/**
 * La puerta de la calle.
 *
 * Es lo único del sistema que ve alguien sin credenciales, así que no lleva
 * datos: ni cifras de producción, ni nombres, ni el estado de la operación.
 * Dice de quién es la casa y dónde se toca; lo demás está del otro lado del
 * acceso.
 *
 * Va sobre fondo azul fijo y no sigue al tema claro/oscuro. El resto del
 * sistema sí lo hace porque se mira ocho horas seguidas; esto se mira cinco
 * segundos antes de entrar, y el azul de la casa es justamente lo que tiene
 * que quedar.
 */
export function Landing() {
  return (
    <div className="bg-royal-950 relative flex min-h-svh flex-col overflow-hidden">
      {/* Talud: el mismo gesto diagonal del acceso, para que las dos pantallas
          se lean como la misma casa. */}
      <svg
        className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 w-full"
        viewBox="0 0 800 300"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M0 300 L800 90 L800 300 Z" fill="#1A2E73" opacity="0.55" />
        <path d="M0 300 L800 190 L800 300 Z" fill="#1D358F" opacity="0.45" />
      </svg>

      <header className="relative z-10 px-6 py-6 sm:px-10">
        <Logo inverted />
      </header>

      <main className="relative z-10 flex flex-1 items-center px-6 py-10 sm:px-10">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[1fr_auto] lg:gap-16">
          {/* ---------- Lo que dice ---------- */}
          <div className="text-center lg:text-left">
            <h1 className="text-2xl font-bold tracking-tight text-balance text-white sm:text-3xl lg:text-4xl">
              BIENVENIDO AL SISTEMA DE CONTROL INTERNO DE{' '}
              <span className="text-safety">{EMPRESA.razonSocial}</span>
            </h1>

            <div
              className="bg-safety/70 mt-7 h-px w-12 mx-auto lg:mx-0"
              aria-hidden="true"
            />

            {/* El RIF va debajo del nombre que ya trae el titular. Repetir la
                razón social en dos renglones seguidos se lee como un descuido,
                y así —nombre arriba, RIF debajo— identifican a la empresa
                igual que en cualquier papel que salga de aquí. */}
            <p className="tabular mt-7 text-sm text-white/65">RIF {EMPRESA.rif}</p>

            <Link
              to="/entrar"
              className="rounded-control text-royal-800 hover:bg-royal-50 focus-visible:outline-safety mt-8 inline-flex h-12 items-center gap-2 bg-white px-7 text-base font-semibold shadow-[0_10px_28px_rgba(0,0,0,0.35)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-3"
            >
              Ingresar al Sistema
              <ArrowRight className="size-[18px]" />
            </Link>

            <p className="mt-5 text-xs text-white/45">
              El acceso lo asigna la administración de la empresa.
            </p>
          </div>

          {/* ---------- La operación ---------- */}
          {/* El halo detrás despega la foto del fondo sin un borde grueso, que
              sobre azul se vería como un aro pegado encima. */}
          <div className="relative mx-auto w-full max-w-[320px] sm:max-w-[400px] lg:mx-0 lg:w-[440px] lg:max-w-none xl:w-[500px]">
            <div
              aria-hidden="true"
              className="bg-royal-500/25 absolute -inset-8 rounded-full blur-3xl"
            />
            <img
              src="/cantera.jpg"
              alt="Frente de explotación de la cantera, con la excavadora trabajando el talud."
              width={800}
              height={600}
              className="ring-safety/35 relative aspect-square w-full rounded-full object-cover shadow-[0_24px_50px_rgba(0,0,0,0.5)] ring-2"
            />
          </div>
        </div>
      </main>

      <footer className="relative z-10 px-6 pb-7 text-center text-xs text-white/40 sm:px-10">
        {EMPRESA.actividad}
      </footer>
    </div>
  )
}
