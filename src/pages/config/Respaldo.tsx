import { useEffect, useState } from 'react'
import {
  Database,
  Download,
  Loader2,
  Lock,
  Mail,
  CalendarClock,
  Pencil,
  Plus,
  Trash2,
  ShieldAlert,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Segmento } from '@/components/ui/Segmento'
import { Interruptor } from '@/components/ui/Interruptor'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import {
  CORREO_POR_DEFECTO,
  MAX_CORREOS,
  correoValido,
  limpiarCorreos,
  useDescargarRespaldo,
  useEnviarRespaldoPorCorreo,
  loQueImpideProgramar,
  useDestinatariosDelRespaldo,
  useCambiarDestinatarioDelRespaldo,
  useGuardarDestinatarioDelRespaldo,
  useQuitarDestinatarioDelRespaldo,
  type DestinatarioDelRespaldo,
  useProgramacionDelRespaldo,
  useProgramarRespaldo,
  useUltimoIntentoDelRespaldo,
  type Cadencia,
  useResumenRespaldo,
} from '@/lib/api/respaldo'
import { useMisRoles } from '@/lib/api/catalogo'
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

          {/* -------------------- El envío automático -------------------- */}
          <ElEnvioAutomatico />

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

/*
  EL ENVÍO AUTOMÁTICO, Y A QUIÉN LE LLEGA.

  Faltaba desde el encargo original del 24/09/2026 —«el correo se indica después
  en sistema, justificando el porqué, en caso de edición una vez añadido»—. La
  tabla y la función se construyeron ese día y la pantalla no, así que el envío
  mensual no se ha podido encender nunca: no hay a quién mandárselo.

  LA PANTALLA DICE SI ESTÁ ENCENDIDO DE VERDAD, no si está configurado. Son dos
  cosas distintas y confundirlas es lo que hace que alguien dé por hecho que
  tiene respaldos y no los tenga. Hoy hacen falta dos piezas y ninguna está: un
  destinatario —esto— y un secreto en el vault de la base, que lo pone quien
  administra Supabase y no se puede poner desde aquí.

  QUIÉN LO VE Y QUIÉN LO CAMBIA NO SON LOS MISMOS. Lo lee quien tenga permiso de
  Respaldo; lo cambia solo el rol de administrador, y lo exige la función de la
  base. Por eso el botón aparece según el rol y no según la pantalla: si un día
  cambia la regla, cambia en la base y aquí se sigue.

  LOS ANTERIORES SE ENSEÑAN. No es adorno: el motivo de por qué el archivo con
  las cédulas y los sueldos de todo el personal iba a una dirección concreta es
  exactamente lo que alguien va a querer leer dentro de un año.
*/
function ElEnvioAutomatico() {
  const { data: destinatarios, isPending, error } = useDestinatariosDelRespaldo()
  const { puede: tieneRol } = useMisRoles()
  const [editando, setEditando] = useState(false)
  const [corrigiendo, setCorrigiendo] = useState<DestinatarioDelRespaldo | null>(null)
  const [quitando, setQuitando] = useState<DestinatarioDelRespaldo | null>(null)

  const puedeCambiarlo = tieneRol('ADMIN')
  const activos = (destinatarios ?? []).filter((d) => d.activo)
  const anteriores = (destinatarios ?? []).filter((d) => !d.activo)

  return (
    <Card className="mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-royal-600 dark:text-royal-300 border-royal-600 dark:border-royal-300 mb-3 border-b pb-1.5 text-xs font-bold tracking-wider uppercase">
            El envío automático
          </h2>
          <p className="text-ink/60 text-sm">
            Una copia del respaldo, sola y sin que nadie la pida, a una dirección de la empresa.
          </p>
        </div>

        {puedeCambiarlo ? (
          <Button variant="outline" size="sm" icon={<Plus />} onClick={() => setEditando(true)}>
            {/* «Añadir» y no «cambiar»: desde el 24/09/2026 puede haber varios,
                y el botón tiene que decir lo que de verdad hace. */}
            Añadir un correo
          </Button>
        ) : null}
      </div>

      {/*
        CUÁNDO SALE, ANTES DE A QUIÉN LE LLEGA.

        Las dos mitades viven en la misma tarjeta porque son el mismo envío, y
        van en este orden porque así se lee: primero si esto ocurre y cuándo,
        después a quién le toca recibirlo.
      */}
      <LaProgramacion />

      <div className="border-hairline my-5 border-t" />

      <p className="text-ink/40 text-2xs font-mono tracking-[0.18em] uppercase">
        A quién le llega
      </p>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} className="mt-3" /> : null}

      {!isPending && !error ? (
        <div className="mt-4">
          {/*
            EL AVISO DE QUE NO ESTÁ ENCENDIDO VA PRIMERO Y EN ÁMBAR.

            Quien abre esta pantalla viene a comprobar que la empresa tiene
            respaldos. Enseñarle la configuración sin decirle que no está
            corriendo sería dejarle creer que sí.
          */}
          {activos.length === 0 ? (
            <div className="border-warning/30 bg-warning/5 rounded-md border px-4 py-3">
              <p className="text-ink/80 text-sm leading-relaxed">
                <strong>No hay ninguna dirección configurada.</strong> La tarea programada se
                despierta, ve que no tiene a quién mandárselo y no hace nada.
              </p>
              {!puedeCambiarlo ? (
                <p className="text-ink/55 mt-2 text-xs">
                  Lo pone quien tenga el rol de administrador.
                </p>
              ) : null}
            </div>
          ) : (
            <ul className="space-y-2">
              {activos.map((d) => (
                <li key={d.id} className="border-hairline rounded-md border px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <p className="text-ink/90 text-sm font-medium">
                        {d.correo}
                        {d.nombre ? <span className="text-ink/45"> · {d.nombre}</span> : null}
                      </p>
                      <p className="text-ink/45 text-xs">Desde el {fechaHora(d.puesto_en)}</p>
                      <p className="text-ink/60 mt-1.5 text-sm leading-relaxed">{d.motivo}</p>
                    </div>

                    {puedeCambiarlo ? (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Pencil />}
                          onClick={() => setCorrigiendo(d)}
                        >
                          Corregir
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Trash2 />}
                          onClick={() => setQuitando(d)}
                        >
                          Quitar
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/*
            AQUÍ ESTABA EL AVISO DEL SECRETO DEL VAULT, y se quita el 24/09/2026
            porque ya está puesto y el envío sale. Lo que falte lo dice arriba
            `por_que_no`, que lo calcula la base en cada consulta; un texto fijo
            avisando de algo que puede haberse resuelto envejece mal y acaba
            diciendo lo contrario de lo que pasa.
          */}

          {anteriores.length > 0 ? (
            <div className="mt-5">
              <p className="text-ink/40 text-2xs font-mono tracking-[0.18em] uppercase">
                A quién se le mandaba antes
              </p>
              <ul className="divide-hairline mt-2 divide-y">
                {anteriores.map((d) => (
                  <li key={d.id} className="py-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <p className="text-ink/70 text-sm">{d.correo}</p>
                      <p className="text-ink/40 text-xs">{fechaHora(d.puesto_en)}</p>
                    </div>
                    <p className="text-ink/45 mt-0.5 text-xs leading-relaxed">{d.motivo}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {editando ? (
        <ModalDestinatario onCerrar={() => setEditando(false)} hay={activos.length > 0} />
      ) : null}
      {corrigiendo ? (
        <ModalCorregir destinatario={corrigiendo} onCerrar={() => setCorrigiendo(null)} />
      ) : null}
      {quitando ? (
        <ModalQuitar destinatario={quitando} onCerrar={() => setQuitando(null)} />
      ) : null}
    </Card>
  )
}

/** Poner o cambiar a quién le llega el respaldo mensual. */
function ModalDestinatario({ onCerrar, hay }: { onCerrar: () => void; hay: boolean }) {
  const guardar = useGuardarDestinatarioDelRespaldo()
  const [correo, setCorreo] = useState('')
  const [nombre, setNombre] = useState('')
  const [motivo, setMotivo] = useState('')

  // Las mismas dos reglas que exige la base, dichas antes de pulsar y no
  // después: el correo tiene que valer y el motivo tiene que estar escrito.
  const falta = !correoValido(correo)
    ? 'Falta una dirección de correo válida.'
    : motivo.trim().length < 4
      ? 'Falta decir por qué va a esa dirección.'
      : null

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={hay ? 'Cambiar a quién le llega' : 'A quién le llega el respaldo'}
      descripcion="Una sola dirección a la vez. La anterior deja de recibirlo, y queda guardada con su motivo."
      ancho="md"
      acciones={
        <>
          {falta ? <p className="text-ink/45 mr-auto text-left text-xs">{falta}</p> : null}
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={!!falta || guardar.isPending}
            onClick={async () => {
              await guardar.mutateAsync({ correo, motivo, nombre })
              onCerrar()
            }}
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      {/*
        EL AVISO ANTES DE LOS CAMPOS, NO DESPUÉS.

        Es el mismo criterio que el modal de descargar: quien está a punto de
        decidir a qué buzón va este archivo tiene que saber qué lleva dentro
        ANTES de escribir la dirección, no al pulsar.
      */}
      <div className="border-danger/30 bg-danger/5 mb-4 flex gap-3 rounded-md border px-4 py-3">
        <ShieldAlert className="text-danger mt-0.5 size-[18px] shrink-0" aria-hidden="true" />
        <p className="text-ink/75 text-sm leading-relaxed">
          Esta dirección va a recibir, sola y cada vez, el archivo con las cédulas, los sueldos y
          las cuentas bancarias de todo el personal. Que sea una dirección de la empresa y de
          alguien que ya podría descargarlo por su cuenta.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Correo"
          type="email"
          placeholder="administracion@mineriainternacionalts.com"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
        />
        <Input
          label="De quién es"
          hint="Opcional. Ayuda a saber de quién era la dirección dentro de un año."
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
      </div>

      <div className="mt-4">
        <Textarea
          label="Por qué va a esa dirección"
          rows={3}
          hint="Lo pide la base, no la pantalla. Un «campo obligatorio» se rellena con un punto; una razón escrita se escribe."
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </div>

      {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-3" /> : null}
    </Modal>
  )
}

const CADENCIAS: { valor: Cadencia; etiqueta: string }[] = [
  { valor: 'SEMANAL', etiqueta: 'Cada semana' },
  { valor: 'QUINCENAL', etiqueta: 'Cada quincena' },
  { valor: 'MENSUAL', etiqueta: 'Cada mes' },
]

const DIAS_DE_LA_SEMANA = [
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
  'domingo',
]

/*
  CADA CUÁNTO SALE EL RESPALDO.

  Lo pidió el usuario el 24/09/2026: que la frecuencia se pueda configurar. Y
  se decidió sin opción diaria, que no es una limitación técnica: cada envío
  deja una copia del archivo con las cédulas, los sueldos y las cuentas
  bancarias en un buzón, y un correo no se puede retirar.

  LA HORA ES DE CARACAS, SIEMPRE. La conversión a la hora del servidor la hace
  la base. Es la pieza que estaba mal: el cron decía `0 8 1 * *` creyendo que
  eran las 8:00, y eran las 4:00 de la madrugada.

  SE DICE SI ESTÁ ENCENDIDO, NO SI ESTÁ CONFIGURADO. Son cosas distintas y hacen
  falta tres piezas para la primera: esta programación, un destinatario y el
  secreto del vault. La base devuelve `por_que_no` con las que falten, y aquí
  se enseñan en lista porque «faltan tres cosas» en una línea no se lee.
*/
function LaProgramacion() {
  const { data, isPending, error } = useProgramacionDelRespaldo()
  const [editando, setEditando] = useState(false)

  if (isPending) return <Cargando />
  if (error) return <ErrorDeCarga error={error} />
  if (!data) return null

  if (!data.autorizado) {
    return (
      <p className="text-ink/55 text-sm">
        Cada cuánto sale el respaldo lo ve y lo cambia quien tiene el rol de Respaldo de la base.
      </p>
    )
  }

  const razones = (data.por_que_no ?? '').split(' · ').filter(Boolean)

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-ink/40 text-2xs font-mono tracking-[0.18em] uppercase">Cada cuánto sale</p>
        <Button
          variant="outline"
          size="sm"
          icon={<CalendarClock />}
          onClick={() => setEditando(true)}
        >
          {data.cadencia ? 'Cambiar cuándo' : 'Programarlo'}
        </Button>
      </div>

      <div className="mt-3">
        {data.cadencia ? (
          <p className="text-ink/85 text-sm">
            {comoSeLee(data.cadencia, data.dia, data.hora ?? 0, data.minuto ?? 0)}
            {data.motivo ? (
              <span className="text-ink/50 block text-xs leading-relaxed">{data.motivo}</span>
            ) : null}
          </p>
        ) : (
          <p className="text-ink/55 text-sm">Todavía no se ha programado ninguna frecuencia.</p>
        )}

        {data.encendido ? (
          <p className="text-success mt-2 text-sm">
            Encendido. El próximo sale el {fechaHora(data.proxima_vez)}.
          </p>
        ) : (
          <div className="border-warning/30 bg-warning/5 mt-3 rounded-md border px-4 py-3">
            <p className="text-ink/80 text-sm font-medium">El envío automático está apagado.</p>
            {razones.length > 0 ? (
              <ul className="text-ink/65 mt-1.5 space-y-0.5 text-sm">
                {razones.map((r) => (
                  <li key={r}>· {r}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </div>

      <ElUltimoIntento />

      {editando ? <ModalProgramacion actual={data} onCerrar={() => setEditando(false)} /> : null}
    </>
  )
}

/*
  SI SE DESPERTÓ Y QUÉ HIZO.

  Es la respuesta a «no se aprecia ni detecta que el cron esté funcionando». El
  cron sí funcionaba —se despertó a las 12:45:00 en punto— y no había dónde
  verlo: el rastro vive en la auditoría, que esconde por defecto lo que hace el
  sistema y además pide ser administrador.

  TRES ESTADOS Y NO DOS, porque hay un caso intermedio que no se puede callar:
  que se haya despertado y no haya quedado constancia de lo que hizo. Pasa con
  las pasadas anteriores a que existiera el rastro, y pasaría si algún día la
  función muriera antes de poder anotar. Decir «se despertó y no sabemos qué
  hizo» es incómodo y es la verdad; inventarse un «todo bien» sería peor.
*/
function ElUltimoIntento() {
  const { data } = useUltimoIntentoDelRespaldo()

  // Sin ninguna pasada todavía no se dice nada: un «nunca ha corrido» al lado
  // de «está apagado» es decir dos veces lo mismo.
  if (!data?.cuando) return null

  const seSabeQueHizo = data.resultado !== null

  return (
    <p className="text-ink/55 mt-3 text-xs leading-relaxed">
      Último intento: <span className="text-ink/75">{fechaHora(data.cuando)}</span>
      {seSabeQueHizo ? (
        <>
          {' · '}
          <span className={data.enviado ? 'text-success' : 'text-warning'}>{data.resultado}</span>
        </>
      ) : (
        <span className="text-ink/45"> · no quedó constancia de lo que hizo</span>
      )}
    </p>
  )
}

/** La programación, dicha como se dice en voz alta. */
function comoSeLee(cadencia: Cadencia, dia: number | null, hora: number, minuto: number): string {
  const aLas = `las ${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`
  if (cadencia === 'SEMANAL') {
    return `Cada semana, los ${DIAS_DE_LA_SEMANA[(dia ?? 1) - 1]} a ${aLas}.`
  }
  // La quincena de esta casa es la de la nómina: el 1 y el 16, no «cada 14 días».
  if (cadencia === 'QUINCENAL') return `Cada quincena, los días 1 y 16 a ${aLas}.`
  return `Cada mes, el día ${dia} a ${aLas}.`
}

function ModalProgramacion({
  actual,
  onCerrar,
}: {
  actual: ReturnType<typeof useProgramacionDelRespaldo>['data'] & object
  onCerrar: () => void
}) {
  const programar = useProgramarRespaldo()
  const [cadencia, setCadencia] = useState<Cadencia>(actual.cadencia ?? 'MENSUAL')
  const [dia, setDia] = useState(String(actual.dia ?? 1))
  const [hora, setHora] = useState(String(actual.hora ?? 8))
  const [minuto, setMinuto] = useState(String(actual.minuto ?? 0))
  const [activo, setActivo] = useState(actual.activo ?? true)
  const [motivo, setMotivo] = useState('')

  const falta = loQueImpideProgramar({
    cadencia,
    dia: cadencia === 'QUINCENAL' ? null : Number(dia),
    hora: Number(hora),
    motivo,
  })

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Cada cuánto sale el respaldo"
      descripcion="La hora es la de Caracas. El sistema la convierte sola a la del servidor."
      ancho="md"
      acciones={
        <>
          {falta ? <p className="text-ink/45 mr-auto text-left text-xs">{falta}</p> : null}
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={!!falta || programar.isPending}
            onClick={async () => {
              await programar.mutateAsync({
                cadencia,
                dia: cadencia === 'QUINCENAL' ? null : Number(dia),
                hora: Number(hora),
                minuto: Number(minuto),
                activo,
                motivo,
              })
              onCerrar()
            }}
          >
            {programar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div>
          <p className="text-ink/70 mb-1.5 text-sm font-medium">Cada cuánto</p>
          <Segmento
            opciones={CADENCIAS.map((c) => ({ valor: c.valor, etiqueta: c.etiqueta }))}
            valor={cadencia}
            onCambio={(v) => setCadencia(v as Cadencia)}
          />
          {/* Sin opción diaria, y se dice por qué: no es que no se pueda. */}
          <p className="text-ink/45 mt-1.5 text-xs leading-relaxed">
            No hay opción diaria a propósito. Cada envío deja una copia del archivo con las cédulas
            y los sueldos en un buzón, y un correo no se puede retirar.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {cadencia === 'SEMANAL' ? (
            <Select
              label="Qué día"
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              opciones={DIAS_DE_LA_SEMANA.map((d, i) => ({
                valor: String(i + 1),
                etiqueta: d.charAt(0).toUpperCase() + d.slice(1),
              }))}
            />
          ) : cadencia === 'MENSUAL' ? (
            <Select
              label="Qué día del mes"
              hint="Hasta el 28: los meses cortos no tienen 29, 30 ni 31."
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              opciones={Array.from({ length: 28 }, (_, i) => ({
                valor: String(i + 1),
                etiqueta: String(i + 1),
              }))}
            />
          ) : (
            <div className="sm:col-span-1">
              <p className="text-ink/70 mb-1.5 text-sm font-medium">Qué días</p>
              <p className="text-ink/55 border-hairline rounded-md border px-3 py-2 text-sm">
                El 1 y el 16
              </p>
            </div>
          )}

          <Select
            label="A qué hora"
            hint="Hora de Caracas."
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            opciones={Array.from({ length: 24 }, (_, i) => ({
              valor: String(i),
              etiqueta: `${String(i).padStart(2, '0')}:00`,
            }))}
          />

          <Select
            label="Y minuto"
            value={minuto}
            onChange={(e) => setMinuto(e.target.value)}
            opciones={[0, 15, 30, 45].map((m) => ({
              valor: String(m),
              etiqueta: String(m).padStart(2, '0'),
            }))}
          />
        </div>

        <Interruptor
          etiqueta="Que salga"
          detalle="Apagado, la programación se guarda pero no sale ningún correo."
          encendido={activo}
          onCambio={setActivo}
        />

        <Textarea
          label="Por qué así"
          rows={2}
          hint="Queda guardado con la programación. Dentro de un año explica por qué se eligió esta frecuencia."
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </div>

      {programar.error ? <ErrorDeCarga error={programar.error} className="mt-3" /> : null}
    </Modal>
  )
}

/** Corregir una dirección que ya estaba puesta. */
function ModalCorregir({
  destinatario,
  onCerrar,
}: {
  destinatario: DestinatarioDelRespaldo
  onCerrar: () => void
}) {
  const cambiar = useCambiarDestinatarioDelRespaldo()
  const [correo, setCorreo] = useState(destinatario.correo)
  const [nombre, setNombre] = useState(destinatario.nombre ?? '')
  const [motivo, setMotivo] = useState('')

  const falta = !correoValido(correo)
    ? 'Falta una dirección de correo válida.'
    : motivo.trim().length < 4
      ? 'Falta decir por qué se corrige.'
      : null

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Corregir la dirección"
      descripcion="Queda guardado quién la corrigió, cuándo y por qué."
      ancho="md"
      acciones={
        <>
          {falta ? <p className="text-ink/45 mr-auto text-left text-xs">{falta}</p> : null}
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={!!falta || cambiar.isPending}
            onClick={async () => {
              await cambiar.mutateAsync({ id: destinatario.id, correo, motivo, nombre })
              onCerrar()
            }}
          >
            {cambiar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Correo"
          type="email"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
        />
        <Input label="De quién es" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </div>
      <div className="mt-4">
        <Textarea
          label="Por qué se corrige"
          rows={2}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </div>
      {cambiar.error ? <ErrorDeCarga error={cambiar.error} className="mt-3" /> : null}
    </Modal>
  )
}

/*
  Quitar a alguien de la lista.

  No borra: apaga. La fila se queda con quién lo quitó, cuándo y por qué, y eso
  es deliberado — un destinatario que desaparece sin rastro es justo lo que no
  se puede permitir en la lista de quién recibe las cédulas y los sueldos de
  toda la plantilla.
*/
function ModalQuitar({
  destinatario,
  onCerrar,
}: {
  destinatario: DestinatarioDelRespaldo
  onCerrar: () => void
}) {
  const quitar = useQuitarDestinatarioDelRespaldo()
  const [motivo, setMotivo] = useState('')
  const falta = motivo.trim().length < 4 ? 'Falta decir por qué deja de recibirlo.' : null

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Quitar a ${destinatario.correo}`}
      descripcion="Deja de recibir el respaldo. No se borra: queda en la lista de los anteriores con el motivo."
      ancho="sm"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            No quitar
          </Button>
          <Button
            variant="danger"
            disabled={!!falta || quitar.isPending}
            onClick={async () => {
              await quitar.mutateAsync({ id: destinatario.id, motivo })
              onCerrar()
            }}
          >
            {quitar.isPending ? 'Quitando…' : 'Sí, quitar'}
          </Button>
        </>
      }
    >
      <Textarea
        label="Por qué deja de recibirlo"
        rows={2}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
      />
      {quitar.error ? <ErrorDeCarga error={quitar.error} className="mt-3" /> : null}
    </Modal>
  )
}
