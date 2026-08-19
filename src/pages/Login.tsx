import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { AlertCircle, Fingerprint, User } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FondoCantera } from '@/components/FondoCantera'
import { EMPRESA } from '@/lib/empresa'
import { iniciarSesion } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { estadoGuardado, paseConHuella } from '@/lib/huella'
import { usePuntero } from '@/lib/puntero'
import { sonarError } from '@/lib/sonido'

export function Login() {
  const navigate = useNavigate()
  const pantalla = usePuntero<HTMLDivElement>()
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
        sonarError()
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

    // La clave equivocada es el error más frecuente del sistema y el único que
    // se comete a ciegas, mirando el teclado. Oírlo ahorra levantar la vista.
    sonarError()
    setError(resultado.error ?? 'No se pudo entrar.')
    setEnviando(false)
  }

  /*
    LA CANTERA A SANGRE, Y EL ACCESO COMO UNA PLACA.

    La versión anterior partía la pantalla en dos: dibujo a un lado,
    formulario al otro. Cambiarle el dibujo por una foto fue maquillaje —el
    esqueleto seguía siendo el de cualquier acceso de cualquier producto—, y
    por eso se descartó.

    Esto invierte el reparto. No hay dos columnas: hay una cantera que ocupa
    la pantalla entera y una placa apoyada encima. La referencia es cómo se
    presentan las areneras y canteras establecidas —Vulcan Materials abre con
    el paisaje de su propia explotación—, donde la autoridad no la da un
    adorno gráfico sino la escala de la operación fotografiada de verdad.

    El velo es deliberadamente flojo. En la versión anterior tapaba la roca
    al 72% y dejaba un azul turbio del que no se distinguía nada; aquí la
    piedra se ve, que es justamente lo que hay que enseñar. La legibilidad
    del texto blanco se resuelve con dos degradados en los bordes, no
    apagando la foto entera.
  */
  return (
    <div
      ref={pantalla}
      className="bg-royal-950 relative flex min-h-svh flex-col overflow-hidden"
    >
      {/* Tres capas, y cada una hace una cosa sola: el envoltorio se mueve con
          el ratón, el de dentro se acerca despacio y la galería cruza las
          fotografías. Juntas dan la sensación de cámara; separadas, cada una
          se puede tocar sin romper las otras.

          El envoltorio sobresale 16px por cada lado. El parallax desplaza
          hasta 10, así que sin ese margen se vería el borde del fondo asomar
          por el lado contrario justo al mover el ratón. */}
      <div className="sigue-al-puntero absolute -inset-4" aria-hidden="true">
        <div className="anim-encuadre absolute inset-0">
          <FondoCantera />
        </div>
      </div>

      {/* Un velo mínimo, solo para amarrar la foto al azul de la casa. */}
      <div className="bg-royal-950/30 anim-aparecer absolute inset-0" aria-hidden="true" />

      {/* Los degradados van donde hay texto encima, y solo ahí: arriba para
          la marca, abajo para la identidad. Oscurecer el centro no serviría
          a nadie y se llevaría por delante el frente. */}
      <div
        className="from-royal-950/75 absolute inset-x-0 top-0 h-40 bg-gradient-to-b to-transparent"
        aria-hidden="true"
      />
      {/* Abajo el degradado va más cargado que arriba, y no por simetría: el
          suelo del frente es arena clara y el cielo es azul. Sobre la arena,
          un blanco al 45% desaparece. */}
      <div
        className="from-royal-950/95 via-royal-950/45 absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t to-transparent"
        aria-hidden="true"
      />

      <main className="relative z-10 flex flex-1 items-center px-6 py-12 sm:px-10 lg:px-14">
        {/* La placa se apoya a la derecha y no en el centro: centrada parte la
            fotografía por la mitad y no deja ver ni el frente ni la máquina.
            Contra el margen, la explotación se lee entera. */}
        <div className="mx-auto w-full max-w-6xl lg:flex lg:justify-end">
          <div className="bg-surface rounded-card shadow-popover anim-surgir mx-auto w-full max-w-[400px] p-8 [animation-delay:440ms] sm:p-9 lg:mx-0">
            {/*
              LA MARCA

              Aquí hubo un rectángulo blanco. El logo anterior venía en JPEG,
              que no sabe de transparencia, y traía su fondo pegado; el truco
              era apoyarlo dentro de la placa —que ya era blanca— para que la
              costura no se viera. Funcionaba en tema claro y en oscuro se
              notaba, porque la placa se vuelve carbón y el rectángulo
              reaparecía.

              La insignia nueva tiene transparencia, así que el remiendo sobra:
              se apoya sobre la placa en los dos temas sin nada detrás.

              Va enlazada a la portada porque no hay otra marca en pantalla que
              pulsar: dos logos en un acceso sobran.
            */}
            <Link to="/" aria-label="Volver a la portada" className="block">
              <img
                src="/media/marca.webp"
                alt={`${EMPRESA.razonSocial} — ${EMPRESA.actividad}`}
                width={512}
                height={521}
                className="mx-auto block w-full max-w-[132px]"
              />
            </Link>

            <div className="bg-hairline mt-7 h-px" aria-hidden="true" />

            {/* El título dice el mismo verbo que el botón. Un encabezado que
                saluda y un botón que ordena obligan a leer dos veces para
                entender que son la misma acción. */}
            <h1 className="text-ink/90 mt-7 text-2xl font-semibold tracking-tight">
              Entrar al sistema
            </h1>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
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

            <p className="text-ink/45 mt-7 text-xs leading-relaxed">
              El acceso lo asigna la administración de la empresa. Si no tienes credenciales,
              escribe a sistemas.
            </p>
          </div>
        </div>
      </main>

      {/* Aquí iba la razón social y el RIF en versalitas. Se fueron con el
          logo: la marca ya los trae impresos, y repetirlos treinta píxeles
          más abajo era decir dos veces lo mismo en la misma pantalla. */}
    </div>
  )
}
