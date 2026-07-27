import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { ArrowUpRight, Mail, Truck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { IconTile } from '@/components/ui/IconTile'
import { Logo } from '@/components/Logo'
import { MinerIllustration } from '@/components/MinerIllustration'

export function Login() {
  const navigate = useNavigate()
  const [enviando, setEnviando] = useState(false)

  // La autenticación real entra cuando esté definida la base de datos.
  // Por ahora la pantalla solo prueba la navegación al shell.
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setEnviando(true)
    void navigate('/app')
  }

  return (
    <div className="flex min-h-svh">
      {/* ---------- Columna de ilustración ---------- */}
      <div className="bg-canvas relative hidden flex-1 overflow-hidden lg:flex">
        {/* Plano del terreno: el mismo gesto diagonal de la referencia,
            aquí leído como el talud de un banco de explotación. */}
        <svg
          className="absolute inset-x-0 bottom-0 h-1/2 w-full"
          viewBox="0 0 800 300"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0 300 L800 120 L800 300 Z" fill="#FFFFFF" opacity="0.75" />
        </svg>

        <div className="absolute top-8 left-8 z-20">
          <Logo />
        </div>

        <div className="relative z-10 flex flex-1 items-center justify-center px-12">
          <div className="relative w-full max-w-[400px]">
            <MinerIllustration className="w-full drop-shadow-[0_18px_28px_rgba(38,44,61,0.10)]" />

            {/* Tarjetas flotantes: cifras reales de la operación, no adornos.
                Van por fuera de la silueta — encima tapan la tableta, que es
                justo lo que la ilustración tiene que contar. */}
            <div className="bg-surface shadow-card rounded-card absolute top-[6%] -left-16 w-[176px] p-3.5">
              <div className="flex items-start justify-between">
                <IconTile tone="royal" size="sm">
                  <Truck />
                </IconTile>
              </div>
              <p className="text-ink/55 mt-2.5 text-xs">Despachado hoy</p>
              <p className="text-ink/90 tabular mt-0.5 text-xl font-semibold">1.284 t</p>
              <p className="text-success mt-1 flex items-center gap-0.5 text-xs font-medium">
                <ArrowUpRight className="size-3.5" />
                12,4% vs. ayer
              </p>
            </div>

            <div className="bg-surface shadow-card rounded-card absolute -right-16 bottom-[8%] w-[180px] p-3.5">
              <p className="text-ink/55 text-xs">Existencia en patio</p>
              <ul className="mt-2 space-y-1.5">
                {[
                  { nombre: 'Piedra picada #1', valor: '3.410 t', ancho: 'w-full' },
                  { nombre: 'Arena lavada', valor: '2.180 t', ancho: 'w-2/3' },
                  { nombre: 'Granzón', valor: '940 t', ancho: 'w-1/4' },
                ].map((fila) => (
                  <li key={fila.nombre}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-ink/70 truncate text-2xs">{fila.nombre}</span>
                      <span className="text-ink/90 tabular text-2xs font-semibold">
                        {fila.valor}
                      </span>
                    </div>
                    <div className="bg-ink/8 mt-1 h-1 rounded-full">
                      <div className={`bg-royal-500 h-1 rounded-full ${fila.ancho}`} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Columna del formulario ---------- */}
      <div className="flex w-full flex-col justify-center bg-white px-6 py-12 sm:px-12 lg:w-[460px] lg:shrink-0 lg:px-14">
        <div className="mx-auto w-full max-w-[360px]">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>

          <h1 className="text-ink/90 text-2xl font-semibold tracking-tight">
            Bienvenido de vuelta
          </h1>
          <p className="text-ink/55 mt-1.5 text-base">
            Entra para registrar la operación del día.
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-5">
            <Input
              label="Correo"
              type="email"
              name="email"
              autoComplete="username"
              placeholder="tu.nombre@empresa.com"
              icon={<Mail />}
              required
            />

            <div>
              <Input
                label="Contraseña"
                name="password"
                autoComplete="current-password"
                placeholder="••••••••"
                revealable
                required
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <label className="text-ink/70 flex cursor-pointer items-center gap-2 text-sm select-none">
                  <input
                    type="checkbox"
                    name="recordar"
                    className="accent-royal-600 size-4 rounded"
                  />
                  Mantener sesión abierta
                </label>
                <a
                  href="#recuperar"
                  className="text-royal-600 hover:text-royal-700 text-sm font-medium"
                >
                  Olvidé mi contraseña
                </a>
              </div>
            </div>

            <Button type="submit" size="lg" block disabled={enviando}>
              {enviando ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>

          <p className="text-ink/45 mt-8 text-xs leading-relaxed">
            El acceso lo asigna la administración de la empresa. Si no tienes credenciales,
            escribe a sistemas.
          </p>
        </div>
      </div>
    </div>
  )
}
