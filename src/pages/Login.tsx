import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { AlertCircle, Fingerprint, User } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Logo } from '@/components/Logo'
import { EMPRESA } from '@/lib/empresa'
import { iniciarSesion } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { estadoGuardado, paseConHuella } from '@/lib/huella'

export function Login() {
  const navigate = useNavigate()
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // La huella se activa por equipo, así que el botón solo sale donde la hay.
  const [huella, setHuella] = useState<{ activa: boolean; usuario: string }>({
    activa: false,
    usuario: '',
  })
  const [conHuella, setConHuella] = useState(false)

  useEffect(() => setHuella(estadoGuardado()), [])

  /*
    Entrar con el dedo.

    Es un camino aparte y no un atajo del formulario: si algo falla aquí, el
    acceso con clave sigue justo debajo, intacto. Una comodidad rota no puede
    dejar a nadie fuera de su trabajo.
  */
  const entrarConHuella = async () => {
    setError(null)
    setConHuella(true)
    try {
      const pase = await paseConHuella()

      // `refreshSession` es la puerta buena para cambiar un pase por una
      // sesión. `setSession` pide además un token de acceso vigente, que aquí
      // no tenemos: lo que se guardó fue el pase, precisamente porque es lo
      // único que sobrevive a que el navegador se cierre.
      const { data, error: fallo } = await supabase.auth.refreshSession({ refresh_token: pase })
      if (fallo || !data.session) throw new Error(fallo?.message ?? 'No se pudo abrir la sesión.')

      // El pase nuevo lo guarda el propio SesionProvider al ver SIGNED_IN.

      void navigate('/app')
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e)
      // Cancelar el diálogo del sistema no es un fallo que haya que gritar.
      if (!/NotAllowed|abort/i.test(mensaje)) {
        setError(
          /refresh|token|JWT|expired/i.test(mensaje)
            ? 'Tu sesión guardada caducó. Entra con tu clave y vuelve a activar la huella.'
            : mensaje,
        )
      }
      setConHuella(false)
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setEnviando(true)

    const datos = new FormData(event.currentTarget)
    const resultado = await iniciarSesion(
      String(datos.get('usuario') ?? ''),
      String(datos.get('clave') ?? ''),
    )

    if (resultado.ok) {
      void navigate('/app')
      return
    }

    setError(resultado.error ?? 'No se pudo entrar.')
    setEnviando(false)
  }

  return (
    <div className="flex min-h-svh">
      {/* ---------- El frente de explotación ----------

          Aquí había un minero de caricatura y dos tarjetas flotantes con
          cifras inventadas: 1.284 t despachadas hoy, 12,4% vs. ayer, tres
          existencias en patio. El panel del sistema cierra prometiendo que
          "no hay ningún número de ejemplo en esta pantalla", y esta —la
          única que ve alguien sin credenciales— enseñaba seis. Ahora enseña
          el frente de verdad y ninguna cifra. */}
      <div className="bg-royal-950 relative hidden flex-1 overflow-hidden lg:flex">
        <img
          src="/cantera.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 size-full object-cover"
        />

        {/* El velo azul. Debajo queda la roca; encima manda la casa. Sin él
            la foto pelea con el formulario, y quien viene a entrar tiene que
            buscar dónde escribir. */}
        <div className="bg-royal-950/72 absolute inset-0" aria-hidden="true" />
        <div
          className="from-royal-950 via-royal-950/35 absolute inset-0 bg-gradient-to-t to-transparent"
          aria-hidden="true"
        />

        {/* El banco.

            Un frente no se corta a plomo: se baja en bancos, escalones de
            altura fija que es donde se para la máquina. El menú los nombra
            —"Frentes y bancos"—, así que la diagonal deja de ser un adorno
            heredado y pasa a ser lo que ordena la pantalla, la misma que
            cierra la portada. El filo naranja es la línea de cota que marca
            el banco, y es el único acento de la página: se gasta aquí y no
            se repite. */}
        <svg
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] w-full"
          viewBox="0 0 800 300"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {/* El banco baja hacia la derecha, al revés que el de la portada.
              No es capricho: la identidad se apoya abajo a la izquierda y
              necesita suelo sólido debajo, y la pendiente descendente lleva
              la vista hacia el formulario en vez de sacarla de la pantalla. */}
          <path d="M0 96 L800 300 L0 300 Z" className="fill-royal-950" opacity="0.94" />
          <path
            d="M0 96 L800 300"
            className="stroke-safety"
            strokeWidth="1.5"
            fill="none"
            opacity="0.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* La marca vuelve a la portada. Es lo que la gente intenta pulsar
            cuando llegó aquí sin querer. */}
        <Link to="/" className="absolute top-8 left-8 z-20" aria-label="Volver a la portada">
          <Logo inverted />
        </Link>

        {/* La identidad, abajo y en mono. Mono porque todo lo que este sistema
            cuenta —toneladas, horómetros, tickets de romana, el RIF— son
            cifras que se alinean en columna, y el rótulo de la puerta debe
            sonar a lo que hay dentro. */}
        <div className="absolute right-10 bottom-10 left-10 z-20">
          <p className="font-mono text-xs tracking-[0.14em] text-white/85 uppercase">
            {EMPRESA.razonSocial}
          </p>
          <p className="text-2xs mt-1.5 font-mono tracking-[0.1em] text-white/45">
            RIF {EMPRESA.rif} · {EMPRESA.estado}
          </p>
        </div>
      </div>

      {/* ---------- Columna del formulario ---------- */}
      <div className="bg-surface flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-[460px] lg:shrink-0 lg:px-14">
        <div className="mx-auto w-full max-w-[360px]">
          <Link
            to="/"
            className="mb-8 inline-flex lg:hidden"
            aria-label="Volver a la portada"
          >
            <Logo />
          </Link>

          {/* El título dice el mismo verbo que el botón. Un encabezado que
              saluda y un botón que ordena obligan a leer dos veces para
              entender que son la misma acción. */}
          <h1 className="text-ink/90 text-2xl font-semibold tracking-tight">Entrar al sistema</h1>
          <p className="text-ink/55 mt-1.5 text-base">
            Para registrar la operación del día.
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-5">
            {error ? (
              <div
                role="alert"
                className="border-danger/25 bg-danger-soft flex items-start gap-2.5 rounded-[6px] border p-3"
              >
                <AlertCircle className="text-danger mt-px size-[18px] shrink-0" />
                <p className="text-danger text-sm">{error}</p>
              </div>
            ) : null}

            <Input
              label="Usuario"
              // El nombre de acceso se compara en minuscula contra el correo
              // interno. Subirlo a mayuscula dejaria a todo el mundo fuera.
              sinNormalizar
              name="usuario"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="tu.usuario"
              icon={<User />}
              required
            />

            <div>
              <Input
                label="Clave"
                name="clave"
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
                  className="text-royal-600 hover:text-royal-700 dark:text-royal-300 dark:hover:text-royal-200 text-sm font-medium"
                >
                  Olvidé mi contraseña
                </a>
              </div>
            </div>

            <Button type="submit" size="lg" block disabled={enviando}>
              {enviando ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>

          {huella.activa ? (
            <>
              <div className="my-5 flex items-center gap-3">
                <span className="bg-ink/10 h-px flex-1" />
                <span className="text-ink/40 text-xs">o</span>
                <span className="bg-ink/10 h-px flex-1" />
              </div>

              <Button
                type="button"
                variant="outline"
                size="lg"
                block
                onClick={() => void entrarConHuella()}
                disabled={conHuella}
                icon={<Fingerprint className="size-[18px]" />}
              >
                {conHuella
                  ? 'Esperando el dedo…'
                  : `Entrar con la huella${huella.usuario ? ` de ${huella.usuario}` : ''}`}
              </Button>
            </>
          ) : null}

          <p className="text-ink/45 mt-8 text-xs leading-relaxed">
            El acceso lo asigna la administración de la empresa. Si no tienes credenciales,
            escribe a sistemas.
          </p>
        </div>
      </div>
    </div>
  )
}
