import { useEffect, useState } from 'react'
import { Database, Download, Loader2, Lock, Mail, Plus, ShieldAlert, X } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import {
  CORREO_POR_DEFECTO,
  MAX_CORREOS,
  correoValido,
  limpiarCorreos,
  useDescargarRespaldo,
  useEnviarRespaldoPorCorreo,
  useResumenRespaldo,
} from '@/lib/api/respaldo'
import { fechaHora } from '@/lib/formato'

const peso = (bytes: number) =>
  bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} kB`

/*
  LOS SEGUNDOS QUE LLEVA, CONTADOS A LA VISTA.

  El respaldo tarda cerca de un minuto: la base lo arma en un segundo y el resto
  es bajar varios megas por la red de la cantera. Hasta ahora el botón se
  limitaba a decir «Armando el respaldo…» y quedarse quieto, y un minuto sin que
  nada cambie no se lee como que está trabajando: se lee como que se colgó.

  Por eso un número que sube y no una barra de progreso. Nadie sabe cuánto falta
  —ni la base ni el navegador—, y una barra que avanza inventando sería peor que
  no tener ninguna: la primera vez que se parara a la mitad nadie volvería a
  creérsela.
*/
function useSegundos(corriendo: boolean): number {
  const [segundos, setSegundos] = useState(0)

  useEffect(() => {
    if (!corriendo) {
      setSegundos(0)
      return
    }
    const desde = Date.now()
    const reloj = setInterval(() => setSegundos(Math.floor((Date.now() - desde) / 1000)), 250)
    return () => clearInterval(reloj)
  }, [corriendo])

  return segundos
}

/*
  Y lo que se le dice mientras espera, que cambia con el tiempo.

  No es adorno: a los diez segundos la pregunta de quien mira es «¿esto va?», y
  al minuto es «¿esto se rompió?». Son preguntas distintas y merecen respuestas
  distintas. La última nombra el archivo y la red, que es lo que de verdad
  explica la espera.
*/
function comoVa(segundos: number): string {
  if (segundos < 8) return 'Leyendo las tablas…'
  if (segundos < 25) return 'Armando el archivo…'
  if (segundos < 75) return 'Bajando el archivo. Son varios megas por la red de la cantera.'
  return 'Sigue bajando. Con la red lenta puede pasar de dos minutos.'
}

/*
  Y lo mismo cuando no se baja nada, sino que se manda.

  Son esperas distintas y la de antes mentía en la mitad de su recorrido: decía
  «bajando el archivo» mientras lo que estaba pasando era una subida al servicio
  de correo. Quien espera mirando una frase que no describe lo que ocurre deja
  de creerse la siguiente.
*/
function comoVaElCorreo(segundos: number): string {
  if (segundos < 8) return 'Leyendo las tablas…'
  if (segundos < 25) return 'Comprimiendo el respaldo…'
  if (segundos < 75) return 'Subiéndolo al correo. Son un par de megas por la red de la cantera.'
  return 'Sigue subiendo. Con la red lenta puede pasar de dos minutos.'
}

/**
 * La copia de todos los datos, para llevársela.
 *
 * Hay dos cosas que esta pantalla tiene que conseguir, y la segunda es más
 * difícil que la primera. Una es que el respaldo se pueda sacar sin entrar al
 * panel de Supabase. La otra es que quien lo saque entienda qué tiene en la
 * mano: un archivo con las cédulas, los sueldos y las cuentas bancarias de todo
 * el personal, sin ninguna de las protecciones que tiene dentro del sistema.
 *
 * Por eso el aviso va antes del botón y no debajo, y por eso hay una
 * confirmación que lo repite. No es ceremonia: el archivo se descarga una vez y
 * después vive en una carpeta durante años.
 */
export function Respaldo() {
  const { data: resumen, isPending, error } = useResumenRespaldo()
  const descargar = useDescargarRespaldo()
  const enviar = useEnviarRespaldoPorCorreo()
  const [confirmando, setConfirmando] = useState(false)
  const [eligiendoCorreos, setEligiendoCorreos] = useState(false)

  /*
    LA LISTA EMPIEZA CON UNA FILA Y YA ESCRITA.

    Es el caso de todos los días: la líder manda el respaldo a la dirección de
    siempre. Arrancar con el campo vacío obligaría a teclearla cada vez, y una
    dirección tecleada a mano cada vez es una dirección que algún día se teclea
    mal — y este archivo no es de los que conviene mandar al buzón equivocado.
  */
  const [correos, setCorreos] = useState<string[]>([CORREO_POR_DEFECTO])

  const trabajando = descargar.isPending || enviar.isPending
  const segundos = useSegundos(trabajando)

  if (isPending) return <Cargando />
  if (error) return <ErrorDeCarga error={error} />

  const autorizado = resumen?.autorizado ?? false

  const cambiarCorreo = (i: number, valor: string) =>
    setCorreos((antes) => antes.map((c, j) => (j === i ? valor : c)))
  const quitarCorreo = (i: number) => setCorreos((antes) => antes.filter((_, j) => j !== i))
  const anadirCorreo = () => setCorreos((antes) => [...antes, ''])

  /*
    Qué habilita el botón de enviar.

    Se mira sobre la lista ya limpia —sin vacíos ni repetidos— porque es la que
    de verdad va a salir. Una fila en blanco al final, de alguien que pulsó
    «Añadir otro» y se arrepintió, no debe bloquear el envío: se cae sola.
  */
  const listaLimpia = limpiarCorreos(correos)
  const puedeEnviar =
    listaLimpia.length > 0 &&
    listaLimpia.length <= MAX_CORREOS &&
    listaLimpia.every((c) => correoValido(c))

  return (
    <>
      <PageHeader
        title="Respaldo de la base"
        description="Una copia de todos los datos del sistema, para guardarla fuera de aquí."
      />

      {/* ------------------------- Quien no puede ------------------------- */}
      {!autorizado ? (
        <Card className="mx-auto mt-6 max-w-lg text-center">
          <div className="bg-ink/6 text-ink/45 mx-auto flex size-12 items-center justify-center rounded-full">
            <Lock className="size-6" />
          </div>
          <h2 className="text-ink/90 mt-4 text-lg font-semibold">
            Esto no se reparte
          </h2>
          <p className="text-ink/55 mt-2 text-sm leading-relaxed">
            El respaldo lleva juntas las cédulas, los sueldos y las cuentas bancarias de todo el
            personal, junto con los precios, los clientes y la bitácora completa. Descargarlo pide
            un rol propio que tienen solo dos personas, y no lo abre ni quien administra el sistema
            por el hecho de administrarlo.
          </p>
        </Card>
      ) : (
        <>
          {/* -------------------------- El aviso -------------------------- */}
          <div className="border-danger/30 bg-danger/6 mb-4 flex items-start gap-3 rounded-[8px] border p-4">
            <ShieldAlert className="text-danger mt-0.5 size-5 shrink-0" />
            <div className="text-sm">
              <p className="text-ink/85 font-medium">
                Este es el archivo más delicado que produce el sistema
              </p>
            </div>
          </div>

          <Card>
            <div className="flex flex-wrap items-center gap-6">
              <div className="bg-royal-600/10 text-royal-600 dark:text-royal-300 flex size-12 shrink-0 items-center justify-center rounded-[10px]">
                <Database className="size-6" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-ink/85 font-medium">
                  {resumen?.tablas} tablas · alrededor de {resumen?.filas.toLocaleString('es-VE')}{' '}
                  filas
                </p>
                <p className="text-ink/50 mt-0.5 text-xs">
                  {resumen?.ultimo
                    ? `Último respaldo: ${fechaHora(resumen.ultimo)}${
                        resumen.ultimo_por ? ` · ${resumen.ultimo_por}` : ''
                      }`
                    : 'Todavía no se ha descargado ninguno.'}
                </p>
              </div>

              <Button
                icon={<Download className="size-[18px]" />}
                disabled={trabajando}
                onClick={() => setConfirmando(true)}
              >
                {descargar.isPending ? 'Armando el respaldo…' : 'Descargar respaldo'}
              </Button>
            </div>

            {/*
              MIENTRAS TANTO.

              Va dentro de la misma tarjeta del botón y no en un modal: quien
              está esperando tiene que poder seguir viendo qué pidió —las 145
              tablas, la fecha del último respaldo— y un diálogo encima tapa
              justo eso.

              Esto solo funciona porque el modal de confirmación se cierra al
              pulsar. La primera versión lo dejaba abierto hasta que la descarga
              terminaba, y entonces este panel quedaba detrás del velo: escrito,
              correcto y sin que nadie lo viera.
            */}
            {trabajando ? (
              <div className="border-hairline mt-4 border-t pt-4">
                {/*
                  El girador va NEUTRO y del tamaño del de la casa, no en tierra.

                  `Cargando` en `Estado.tsx` ya resuelve esto desde siempre:
                  `Loader2` a `size-4` y `text-ink/45`, sin color. Esperar no es
                  una llamada a la acción, y un girador en tierra compite por la
                  atención con el único botón primario de la pantalla.

                  Lo que sí tiene que verse es el número, y ese ya va en
                  `text-ink/85`.
                */}
                <div className="flex items-center gap-3">
                  <Loader2 className="text-ink/45 size-4 shrink-0 animate-spin" />
                  <div className="min-w-0 flex-1">
                    <p className="text-ink/85 text-sm font-medium">
                      {enviar.isPending ? comoVaElCorreo(segundos) : comoVa(segundos)}
                    </p>
                    <p className="text-ink/45 mt-0.5 text-xs">
                      <span className="tabular">{segundos}</span> segundo
                      {segundos === 1 ? '' : 's'} · no cierres esta pestaña
                    </p>
                  </div>
                </div>

                {/*
                  El aviso del F5, y solo cuando ya es plausible que lo esté
                  pensando. Ponerlo desde el segundo cero sería sugerirlo.

                  Y no es una advertencia de cortesía: recargar NO cancela el
                  trabajo del servidor —PostgreSQL no comprueba si el navegador
                  sigue ahí mientras la consulta corre—, así que cada recarga
                  deja otro respaldo armándose además del que ya iba.
                */}
                {segundos >= 20 ? (
                  <p className="border-hairline text-ink/55 mt-3 border-t pt-3 text-xs leading-relaxed">
                    <strong className="text-ink/75 font-medium">Recargar no lo acelera.</strong> Si
                    pulsas F5, el servidor no se entera y sigue armando el mismo archivo: lo único
                    que consigues es que se arme dos veces y tener que empezar la espera de nuevo.
                  </p>
                ) : null}
              </div>
            ) : null}

            {descargar.error ? <ErrorDeCarga error={descargar.error} className="mt-4" /> : null}

            {/*
              EL FALLO DEL ENVÍO SÍ ES UN ERROR ROJO, Y EL DE LA DESCARGA NO.

              No es una incoherencia: son dos cosas distintas. Cuando se baja el
              archivo y el correo no sale, la persona ya tiene lo que pidió y lo
              del correo es un aviso. Cuando lo único que se pidió fue mandarlo,
              que no salga es el fracaso entero.
            */}
            {enviar.error ? <ErrorDeCarga error={enviar.error} className="mt-4" /> : null}

            {enviar.isSuccess && enviar.data ? (
              <div className="border-hairline mt-4 border-t pt-4 text-sm">
                <p className="text-success">
                  Mandado a {enviar.data.para.join(', ')} · {peso(enviar.data.bytes)} comprimido.
                </p>
                <p className="text-ink/55 mt-1 text-xs">
                  Si no aparece en unos minutos, mira la carpeta de correo no deseado.
                </p>
              </div>
            ) : null}

            {descargar.isSuccess && descargar.data ? (
              <div className="border-hairline mt-4 border-t pt-4 text-sm">
                <p className="text-success">
                  Descargado: <span className="font-mono">{descargar.data.nombre}</span> ·{' '}
                  {peso(descargar.data.bytes)}
                </p>

              </div>
            ) : null}
          </Card>

          {/* -------------------- Qué lleva y qué no -------------------- */}
          <Card className="mt-4">
            <h2 className="text-royal-600 dark:text-royal-300 border-royal-600 dark:border-royal-300 mb-3 border-b pb-1.5 text-xs font-bold tracking-wider uppercase">
              Qué es y cómo se usa
            </h2>

            <dl className="text-sm">
              <div className="border-hairline flex flex-wrap justify-between gap-x-6 gap-y-1 border-b py-2.5">
                <dt className="text-ink/45">Qué lleva</dt>
                <dd className="text-ink/75 max-w-md text-right">
                  Todos los datos: personal, inventario, compras, ventas, tesorería, nómina y la
                  bitácora de auditoría completa.
                </dd>
              </div>
              <div className="border-hairline flex flex-wrap justify-between gap-x-6 gap-y-1 border-b py-2.5">
                <dt className="text-ink/45">Qué no lleva</dt>
                <dd className="text-ink/75 max-w-md text-right">
                  Las contraseñas, que están cifradas aparte y no se tocan. Al restaurar hay que
                  volver a crear los usuarios.
                </dd>
              </div>
              <div className="border-hairline flex flex-wrap justify-between gap-x-6 gap-y-1 border-b py-2.5">
                <dt className="text-ink/45">Para reconstruir la base</dt>
                <dd className="text-ink/75 max-w-md text-right">
                  Hacen falta dos cosas: las migraciones del repositorio, que son la estructura, y
                  este archivo, que son los datos. En ese orden.
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 py-2.5">
                <dt className="text-ink/45">Cada descarga queda escrita</dt>
                <dd className="text-ink/75 max-w-md text-right">
                  En la auditoría, con el nombre de quien la pidió, la fecha y la hora.
                </dd>
              </div>
            </dl>
          </Card>
        </>
      )}

      {/* ------------------------ La confirmación ------------------------ */}
      <Modal
        abierto={confirmando}
        onCerrar={() => setConfirmando(false)}
        titulo="Descargar el respaldo completo"
        /*
          `md` y no `sm` desde que hay tres botones al pie.

          Los tres piden unos 440 px y el modal estrecho deja 408: el pie tiene
          `flex-wrap`, así que «Descargar» caía solo a una segunda línea y la
          acción principal quedaba descolgada debajo de las otras dos. Se vio en
          producción antes de que nadie lo probara en un modal de tres botones.
        */
        ancho="md"
        acciones={
          /*
            Fila en el escritorio, columna en el teléfono — y al revés, para que
            arriba quede la acción principal y no «Cancelar», que es donde cae
            el pulgar. El pie del modal ya es un `flex`, así que esto se cuelga
            de él a ancho completo y manda sobre la colocación.
          */
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="ghost" onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>

            {/*
              Y las dos acciones juntas a la derecha, con «Cancelar» solo al
              otro lado.

              Los tres seguidos y pegados al borde se leían como tres cosas del
              mismo rango, y no lo son: irse no es hacer algo. Separado, el ojo
              ve primero qué puede hacer con el archivo y solo después la
              puerta de salida.
            */}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {/*
                LA SEGUNDA SALIDA DEL ARCHIVO, PEDIDA POR LA LÍDER EL
                24/09/2026.

                Va aquí dentro y no en la tarjeta de fuera, que es donde se
                pensó primero. El aviso de qué lleva el archivo está en este
                modal, y un botón que manda el respaldo a otra persona no puede
                vivir en un sitio donde ese aviso no se haya leído.

                `outline` y no `primary`: la acción principal de esta pantalla
                sigue siendo bajarlo. Dos botones naranjas uno al lado del otro
                no se eligen, se pulsan a ojo.
              */}
              <Button
                variant="outline"
                icon={<Mail className="size-[18px]" />}
                onClick={() => {
                  setConfirmando(false)
                  setEligiendoCorreos(true)
                }}
              >
                Enviar por correo
              </Button>

              {/*
                EL MODAL SE CIERRA AL PULSAR, NO AL TERMINAR.

                Estaba al revés: se esperaba a que la descarga acabara y solo
                entonces se cerraba. Durante ese minuto el modal se quedaba
                encima con un botón que decía «Armando…» y el contador
                corriendo detrás, atenuado por el velo. El usuario lo dijo
                exacto: «es como si no estuviera».

                Su trabajo —avisar de lo que lleva el archivo y pedir
                confirmación— termina en el momento en que se pulsa. Lo que
                viene después es esperar, y para esperar hay que poder VER la
                pantalla.

                `mutate` y no `mutateAsync`: el segundo devuelve una promesa que
                aquí ya no espera nadie, y cuando la base falla esa promesa
                queda sin capturar. Es lo que llenó la consola del usuario de
                «Uncaught (in promise)» cuando el respaldo se agotaba por
                tiempo. Con `mutate` el error llega igual, por
                `descargar.error`, que es donde la pantalla ya lo enseña.
              */}
              <Button
                onClick={() => {
                  setConfirmando(false)
                  descargar.mutate()
                }}
              >
                Descargar
              </Button>
            </div>
          </div>
        }
      >
        <p className="text-ink/70 text-sm leading-relaxed">
          El archivo que va a bajar a esta computadora lleva{' '}
          <strong className="text-ink/90 font-medium">
            las cédulas, los sueldos y las cuentas bancarias de todo el personal
          </strong>
          , además de los precios, los clientes y la bitácora completa. Sin clave y sin permisos:
          quien lo abra lo ve todo.
        </p>
        <p className="text-ink/55 mt-3 text-xs leading-relaxed">
          Va a quedar anotado en la auditoría que lo descargaste tú, con la fecha y la hora. Si esta
          computadora la usa alguien más, guarda el archivo en otro sitio y bórralo de la carpeta de
          descargas.
        </p>

        {/*
          CUÁNTO VA A TARDAR, DICHO ANTES DE EMPEZAR.

          Es la mitad que de verdad evita el F5. Un minuto de espera avisado se
          aguanta; un minuto de espera sin avisar se interpreta como que algo
          falló, y entonces se recarga. El contador de después ayuda, pero llega
          tarde: para entonces ya está esperando sin saber cuánto.
        */}
        <p className="border-hairline text-ink/65 mt-4 border-t pt-3 text-xs leading-relaxed">
          <strong className="text-ink/85 font-medium">Tarda cerca de un minuto.</strong> Son varios
          megas y la mayor parte del tiempo es la descarga, no la base. Mientras tanto verás los
          segundos correr aquí mismo: si el número se mueve, está trabajando.
        </p>
      </Modal>

      {/* ---------------------- A quién se le manda ---------------------- */}
      <Modal
        abierto={eligiendoCorreos}
        onCerrar={() => setEligiendoCorreos(false)}
        titulo="Enviar el respaldo por correo"
        descripcion="Va comprimido y como adjunto. No se baja a esta computadora."
        /* Del mismo ancho que el aviso del que sale: uno se abre encima del
           otro, y que el segundo encoja se lee como que es otra cosa. */
        ancho="md"
        acciones={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="ghost" onClick={() => setEligiendoCorreos(false)}>
              Cancelar
            </Button>
            {/*
              Se cierra al pulsar, igual que el de la descarga y por lo mismo:
              la espera se mira en la tarjeta de detrás, con su contador, y un
              velo encima la deja ilegible.

              `mutate` y no `mutateAsync`: la promesa del segundo no la espera
              nadie aquí, y cuando el envío falla queda sin capturar. El error
              llega igual por `enviar.error`, que es donde la pantalla lo pinta.
            */}
            <Button
              icon={<Mail className="size-[18px]" />}
              disabled={!puedeEnviar}
              onClick={() => {
                setEligiendoCorreos(false)
                enviar.mutate(listaLimpia)
              }}
            >
              Enviar
            </Button>
          </div>
        }
      >
        <div className="border-danger/30 bg-danger/6 mb-4 flex items-start gap-3 rounded-[8px] border p-3">
          <ShieldAlert className="text-danger mt-0.5 size-4 shrink-0" />
          <p className="text-ink/75 text-xs leading-relaxed">
            Quien reciba este correo tendrá{' '}
            <strong className="text-ink/90 font-medium">
              las cédulas, los sueldos y las cuentas bancarias de todo el personal
            </strong>
            , sin clave y sin permisos. Queda escrito a qué direcciones se mandó.
          </p>
        </div>

        <p className="text-ink/75 mb-2 text-sm font-medium">A quién se manda</p>

        <div className="space-y-2">
          {correos.map((c, i) => {
            /*
              El error de cada fila solo aparece cuando ya hay algo escrito.

              Marcar en rojo un campo vacío que la persona acaba de añadir es
              regañarla por no haber terminado de teclear. La fila en blanco no
              estorba: se cae sola al limpiar la lista.
            */
            const malo = c.trim().length > 0 && !correoValido(c)
            return (
              <div key={i} className="flex items-start gap-2">
                <Input
                  label={`Correo ${i + 1}`}
                  ocultarEtiqueta
                  sinNormalizar
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="nombre@dominio.com"
                  value={c}
                  error={malo ? 'Ese correo no se entiende.' : undefined}
                  onChange={(e) => cambiarCorreo(i, e.target.value)}
                />
                {correos.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => quitarCorreo(i)}
                    aria-label={`Quitar ${c.trim() || `el correo ${i + 1}`}`}
                    className="text-ink/45 hover:bg-ink/6 hover:text-ink/80 focus-visible:outline-royal-600 flex size-10 shrink-0 items-center justify-center rounded-[6px] transition-colors focus-visible:outline-2"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>

        {correos.length < MAX_CORREOS ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            icon={<Plus className="size-4" />}
            onClick={anadirCorreo}
          >
            Añadir otro correo
          </Button>
        ) : (
          <p className="text-ink/45 mt-2 text-xs">
            Diez es el máximo de una vez. Para más, manda el correo dos veces.
          </p>
        )}

        <p className="border-hairline text-ink/65 mt-4 border-t pt-3 text-xs leading-relaxed">
          <strong className="text-ink/85 font-medium">Tarda cerca de un minuto.</strong> La base
          arma el respaldo en segundos; el resto es subir el archivo por la red de la cantera. Verás
          los segundos correr en la tarjeta de atrás.
        </p>
      </Modal>
    </>
  )
}
