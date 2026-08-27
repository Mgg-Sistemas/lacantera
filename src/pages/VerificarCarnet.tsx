import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { verificarCarnet, type CarnetVerificado } from '@/lib/api/carnets'
import { EMPRESA } from '@/lib/empresa'

/*
  VERIFICAR UN CARNET. LA PANTALLA QUE ABRE EL QR.

  La abre un vigilante en un portón, a pleno sol, con un teléfono barato y con el
  trabajador delante esperando. No tiene cuenta, nunca ha visto el sistema y no
  va a leer un párrafo. Tres preguntas, en este orden: ¿el carnet vale?, ¿es la
  misma cara?, y —si alguien está en el suelo— ¿a quién llamo?

  ────────────────────────────────────────────────────────────────────────────
  DE DÓNDE SALE EL DISEÑO

  De la tarjeta de plástico, que es el objeto contra el que se compara. La
  pantalla no la copia —copiarla la haría lenta, y eso ya se descartó midiéndolo
  con tres propuestas y nueve jueces— pero habla su idioma: la banda naranja
  arriba, la placa ámbar de la ficha abajo, y la misma tipografía de rótulo.

  Archivo para el veredicto y los rótulos: es la grotesca que la casa eligió
  «del mundo de los rótulos de maquinaria y la señalética de seguridad». Inter
  para los datos, que es donde importan las cifras tabulares. Las dos ya vienen
  servidas con la aplicación, así que no hay una sola petición de red por la
  tipografía — en un portón con mala señal eso se nota.

  LA FOTO VIVE DENTRO DEL CAMPO DE COLOR

  Es la decisión que más cambia la pantalla y viene de la última advertencia del
  panel: el riesgo que queda vivo es que el verde enseñe a no mirar la cara. Con
  la foto fuera, el color se lee y se pasa de largo. Con la foto DENTRO, el
  verde no existe sin cara: no se puede leer el veredicto sin tener el retrato
  en el mismo golpe de vista.

  EL SELLO SE ESTAMPA

  Al llegar la respuesta el cuño cae como sobre un papel. Es lo que la página es
  —un acto de certificación— y es un solo momento, no efectos sueltos. De paso
  resuelve algo que ninguna palabra resuelve: una captura de pantalla nunca se
  estampa.

  PRIMERO EL TELÉFONO

  Todo está medido para un teléfono: el veredicto y la cara caben juntos en la
  primera pantalla. En un escritorio no hay «versión de escritorio» — la misma
  columna, centrada, como un recibo largo. Un vigilante y una recepcionista
  tienen que ver exactamente lo mismo, porque una foto de una de las dos
  pantallas tiene que poder compararse con la otra.

  LO QUE NO SE TOCA, Y POR QUÉ

  El par de colores del veredicto está medido: verde #1FA24E en L* 59 y rojo
  #A31207 en L* 34, veinticinco puntos de separación, o sea que en blanco y
  negro siguen siendo dos manchas distintas. Las palabras son VIGENTE y
  RECHAZADO y no «válido / no válido», porque «NO VÁLIDO» contiene «VÁLIDO» y a
  dos metros el error caería siempre del lado de dejar pasar. Y el gris de
  «buscando» es acromático para que nunca pueda leerse como un veredicto.
*/

const HEX = /[^0-9A-F]/g

/**
 * Lo tecleado, convertido a código.
 *
 * El código es hexadecimal —`gen_random_bytes(9)` en hex— así que solo caben
 * `0-9` y `A-F`. Y se corrigen al vuelo las tres confusiones de siempre al
 * copiar de un plástico: la O por el cero, la I y la L por el uno. Casi todo el
 * «código desconocido» por mal tecleo desaparece, y con él el rechazo injusto.
 */
const limpio = (texto: string) =>
  texto.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(HEX, '')

/** Se lee de tres golpes en grupos de seis, como va impreso. */
const enGrupos = (codigo: string) => (codigo.match(/.{1,6}/g) ?? [codigo]).join(' ')

/**
 * Cuánto lleva aquí, dicho como lo dice la gente.
 *
 * «Desde el 20/07/2026» obliga a restar de cabeza, y en un portón nadie resta.
 * En años y meses, omitiendo lo que sea cero: decir «0 años y 7 meses» es
 * hablar como una máquina. Y de quien empieza mañana no se dice nada, porque
 * «menos de un mes» sería falso.
 */
function antiguedad(iso: string | null | undefined): string | null {
  if (!iso) return null

  const desde = new Date(`${iso}T12:00:00`)
  const hoy = new Date()

  let meses = (hoy.getFullYear() - desde.getFullYear()) * 12 + (hoy.getMonth() - desde.getMonth())
  if (hoy.getDate() < desde.getDate()) meses -= 1
  if (meses < 0) return null

  const anios = Math.floor(meses / 12)
  const resto = meses % 12

  const enAnios = `${anios} ${anios === 1 ? 'año' : 'años'}`
  const enMeses = `${resto} ${resto === 1 ? 'mes' : 'meses'}`

  if (anios === 0 && resto === 0) return 'menos de un mes'
  if (anios === 0) return enMeses
  if (resto === 0) return enAnios
  return `${enAnios} y ${enMeses}`
}

function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const soloDigitos = (t: string) => t.replace(/[^\d+]/g, '')

const TITULAR = { fontFamily: 'var(--font-titular)' } as const

// ---------------------------------------------------------------------------

type Cara = 'buscando' | 'vigente' | 'rechazado' | 'sin-senal'

const CAMPO: Record<Cara, { fondo: string; tinta: string; sello: string }> = {
  // Acromático: la única superficie sin color, y por eso nunca un veredicto.
  buscando: { fondo: '#6D6D6D', tinta: '#FFFFFF', sello: '#5A5A5A' },
  vigente: { fondo: '#1FA24E', tinta: '#0B2E18', sello: '#188A41' },
  rechazado: { fondo: '#A31207', tinta: '#FFFFFF', sello: '#7E0D05' },
  'sin-senal': { fondo: '#F0A128', tinta: '#3D2F00', sello: '#D18A1E' },
}

/*
  EL CUÑO, DIBUJADO Y NO UN ICONO DE LIBRERÍA.

  Una orla dentada de doce puntas: es la silueta de un sello de caucho y se
  reconoce como tal antes de leer nada. Cambia solo lo de dentro —el gancho, el
  aspa, la raya— porque esas tres siluetas no se parecen a ninguna distancia, y
  esa es la tercera vía por la que se distingue el veredicto, además del color y
  de la palabra.
*/
function Cuno({ vale }: { vale: boolean | null }) {
  /*
    El borde alterna dos radios, y ahí está la diferencia.

    A radio constante salen doce lados iguales, o sea un dodecágono: de lejos se
    lee como un círculo y no dice nada. Alternando 47 y 39 salen las muescas, y
    esa silueta dentada es lo que se reconoce como sello antes de leer nada.
  */
  const puntas = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 === 0 ? 47 : 39
    return `${(50 + Math.cos(a) * r).toFixed(2)},${(50 + Math.sin(a) * r).toFixed(2)}`
  }).join(' ')

  return (
    <svg viewBox="0 0 100 100" aria-hidden className="size-full">
      <polygon points={puntas} fill="none" stroke="currentColor" strokeWidth="5" />
      <circle cx="50" cy="50" r="35" fill="none" stroke="currentColor" strokeWidth="3.5" />
      {vale === true ? (
        <path d="M33 51 L45 63 L68 39" fill="none" stroke="currentColor" strokeWidth="9" />
      ) : vale === false ? (
        <path d="M36 36 L64 64 M64 36 L36 64" fill="none" stroke="currentColor" strokeWidth="9" />
      ) : (
        <path d="M33 50 H67" fill="none" stroke="currentColor" strokeWidth="9" />
      )}
    </svg>
  )
}

// ---------------------------------------------------------------------------

export function VerificarCarnet() {
  const { codigo } = useParams()
  const buscado = codigo ? limpio(codigo) : ''

  /*
    Fuera de los buscadores.

    Es una página abierta con nombres, cédulas y —por decisión de la empresa—
    direcciones y teléfonos de familiares. Que exista para quien escanea no
    quiere decir que tenga que salir en una búsqueda.
  */
  useEffect(() => {
    const m = document.createElement('meta')
    m.name = 'robots'
    m.content = 'noindex, noarchive, nofollow'
    document.head.appendChild(m)
    return () => m.remove()
  }, [])

  const consulta = useQuery({
    enabled: buscado.length > 0,
    queryKey: ['verificar-carnet', buscado],
    queryFn: () => verificarCarnet(buscado),
    /*
      Ni caché ni respuestas guardadas. Un carnet anulado hace un minuto tiene
      que salir anulado ahora: la regla es que solo el verde autoriza, y un verde
      de hace doce minutos no es un verde.
    */
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  })

  if (!buscado) return <PedirCodigo />
  if (consulta.isPending) return <Hoja cara="buscando" palabra="Buscando" vale={null} />
  if (consulta.error)
    return <SinSenal codigo={buscado} onReintentar={() => void consulta.refetch()} />

  const d = consulta.data
  if (!d || !d.existe) return <NoExiste codigo={buscado} />

  return <Resultado d={d} codigo={buscado} />
}

// ---------------------------------------------------------------------------

/** La banda de la casa. Igual en todas las pantallas, y la primera que carga. */
function Banda() {
  return (
    <header
      className="flex items-center gap-2.5 bg-[#cc3f00] px-4 pb-2.5"
      style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}
    >
      <img src="/media/marca.webp" alt="" className="size-9 shrink-0 rounded-full bg-white p-1" />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[13px] font-bold tracking-wide text-white" style={TITULAR}>
          {EMPRESA.nombre}
        </p>
        <p className="truncate text-[10px] text-white/70">
          {EMPRESA.forma} · RIF {EMPRESA.rif}
        </p>
      </div>
    </header>
  )
}

function Pie() {
  return (
    <footer className="bg-[#351e0e] px-5 py-4 text-center">
      <p className="text-[10px] leading-relaxed text-white/55">
        Esta página dice si un carnet es auténtico y si sigue vigente.
      </p>
      <p className="mt-1 text-[10px] text-white/40">{window.location.host}</p>
    </footer>
  )
}

/*
  LA HOJA.

  Una sola columna, siempre igual de ancha, con la banda de la empresa arriba y
  la placa de la ficha abajo. En un teléfono ocupa la pantalla; en un escritorio
  se centra sobre el fondo de piedra y se lee como un recibo largo. No hay
  «versión de escritorio»: un vigilante y una recepcionista tienen que ver
  exactamente lo mismo, porque una foto de una de las dos pantallas tiene que
  poder compararse con la otra.
*/
function Hoja({
  cara,
  palabra,
  causa,
  vale,
  foto,
  nombre,
  ficha,
  children,
}: {
  cara: Cara
  palabra: string
  causa?: string
  vale: boolean | null
  foto?: string | null
  nombre?: string
  ficha?: string
  children?: React.ReactNode
}) {
  const c = CAMPO[cara]

  return (
    <div
      className="flex min-h-dvh justify-center bg-[#e9e4de]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/*
        Las claves de la animación viven aquí y no en la hoja de estilos global:
        esta pantalla es la única de todo el sistema que las usa, y meterlas en
        el CSS de la aplicación las cargaría en las otras cincuenta.
      */}
      <style>{`
        @keyframes cuno {
          0%   { transform: scale(2.6) rotate(-16deg); opacity: 0 }
          55%  { transform: scale(.92) rotate(-7deg);  opacity: 1 }
          100% { transform: scale(1)   rotate(-5deg);  opacity: 1 }
        }
        @keyframes surge {
          from { opacity: 0; transform: translateY(6px) }
          to   { opacity: 1; transform: none }
        }
        .cuno  { animation: cuno .42s cubic-bezier(.2,1.4,.4,1) both }
        .surge { animation: surge .3s ease-out both; animation-delay: .2s }
        @media (prefers-reduced-motion: reduce) {
          .cuno  { animation: none; transform: rotate(-5deg) }
          .surge { animation: none }
        }
      `}</style>

      <main className="flex w-full max-w-[26rem] flex-col bg-[#f5f2ef] shadow-[0_0_40px_rgba(53,30,14,.12)]">
        <Banda />

        {/* ------------------------------------------------- el veredicto */}
        <section
          className="px-5 pt-7 pb-6 text-center"
          style={{ backgroundColor: c.fondo, color: c.tinta }}
          aria-live="polite"
        >
          <div className="cuno mx-auto size-[4.5rem]">
            <Cuno vale={vale} />
          </div>

          <p
            className="surge mt-3 text-[clamp(2.25rem,13vw,3rem)] leading-[.95] font-extrabold uppercase"
            style={{ ...TITULAR, letterSpacing: '-.01em' }}
          >
            {palabra}
          </p>

          {/* Hueco reservado: el campo mide igual haya causa o no la haya. */}
          <p
            className="surge mt-2 h-5 text-[13px] leading-5 font-bold tracking-[.08em] uppercase opacity-90"
            style={TITULAR}
          >
            {causa ?? ''}
          </p>

          {/*
            LA CARA, DENTRO DEL COLOR.

            Es lo que impide que el verde enseñe a no mirar. Con la foto abajo,
            el color se lee y se pasa de largo; aquí no se puede leer el
            veredicto sin tener el retrato en el mismo golpe de vista.

            El marco blanco y la sombra dura no son adorno: separan el retrato
            del campo de color, que si no se lo traga.
          */}
          {foto ? (
            <div className="surge mt-5">
              <img
                src={foto}
                alt={`Foto impresa en el carnet de ${nombre ?? 'el trabajador'}`}
                className="mx-auto block w-[40vw] max-w-[9.5rem] rounded-[3px] border-[5px] border-white object-cover shadow-[3px_3px_0_rgba(0,0,0,.22)]"
                style={{ aspectRatio: '24 / 27' }}
              />
              <p className="mt-3 text-[12px] font-bold tracking-[.1em] uppercase" style={TITULAR}>
                Compare la cara con la persona
              </p>
            </div>
          ) : null}
        </section>

        {/*
          EL SELLO DEL MOMENTO.

          Con los segundos corriendo. Es lo único de esta pantalla que una
          captura no puede imitar: quien enseñe la foto de una comprobación de
          ayer la tiene congelada, y ahí se ve. Va pegado al campo y fuera de él,
          para no robarle la primera mirada.
        */}
        <Momento cara={cara} color={c.sello} tinta={c.tinta} />

        <div className="grow px-5 py-5">{children}</div>

        {/*
          LA PLACA DE LA FICHA.

          Es la barra amarilla del carnet, continuada en la pantalla. Va abajo,
          como en el plástico, y con el número grande: puestos uno al lado del
          otro, es lo que hace que las dos cosas se lean como el mismo
          documento.
        */}
        {ficha ? (
          <div className="flex items-center justify-between bg-[#F0A128] px-5 py-3.5">
            <span
              className="text-[11px] font-bold tracking-[.18em] text-[#3D2F00] uppercase"
              style={TITULAR}
            >
              Ficha
            </span>
            <span
              className="text-[26px] leading-none font-extrabold text-[#3D2F00] tabular-nums"
              style={TITULAR}
            >
              {ficha}
            </span>
          </div>
        ) : null}

        <Pie />
      </main>
    </div>
  )
}

function Momento({ cara, color, tinta }: { cara: Cara; color: string; tinta: string }) {
  const [ahora, setAhora] = useState(() => new Date())

  useEffect(() => {
    const t = window.setInterval(() => setAhora(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])

  return (
    <div
      className="py-2 text-center text-[11px] font-bold tracking-[.12em] uppercase tabular-nums"
      style={{ backgroundColor: color, color: tinta, ...TITULAR }}
    >
      {cara === 'buscando'
        ? 'Comprobando el código'
        : `Comprobado ${ahora.toLocaleString('es-VE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}`}
    </div>
  )
}

// ---------------------------------------------------------------------------

/** Una etiqueta y su valor, con la raya gruesa que el sol no borra. */
function Fila({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b-2 border-[#e0d9d1] py-2.5">
      <dt className="text-[13px] text-[#7a6a5c]">{k}</dt>
      <dd className="text-right text-[15px] font-semibold text-[#351e0e]">{v}</dd>
    </div>
  )
}

/** Un rótulo de sección: Archivo, versalitas, y muy espaciado. */
function Rotulo({ children, color = '#9e4c01' }: { children: React.ReactNode; color?: string }) {
  return (
    <p
      className="mb-2 text-[11px] font-bold tracking-[.16em] uppercase"
      style={{ ...TITULAR, color }}
    >
      {children}
    </p>
  )
}

function Resultado({ d, codigo }: { d: CarnetVerificado; codigo: string }) {
  const vale = d.vigente === true
  const egresado = d.causa === 'EGRESADO'

  return (
    <Hoja
      cara={vale ? 'vigente' : 'rechazado'}
      palabra={vale ? 'Vigente' : 'Rechazado'}
      causa={vale ? undefined : egresado ? 'Ya no trabaja aquí' : 'Carnet anulado'}
      vale={vale}
      foto={egresado ? null : d.foto}
      nombre={d.nombre}
      ficha={d.ficha}
    >
      {/*
        La consecuencia, en una frase, y distinta en los dos rechazos.

        Actuar es lo mismo —no pasa— pero lo que sigue no: con el carnet anulado
        el trabajador es de la casa y hay que pedirle el nuevo; con el egreso, no
        representa a la empresa.
      */}
      {!vale ? (
        <p className="mb-5 text-[17px] leading-snug font-bold text-[#351e0e]">
          {egresado
            ? 'Esta persona no representa a la empresa.'
            : 'Este carnet no sirve. La persona sí trabaja aquí: pídale el carnet nuevo.'}
        </p>
      ) : null}

      <p className="text-[11px] font-semibold tracking-[.14em] text-[#7a6a5c] uppercase">
        Nombre completo
      </p>
      <p className="mt-0.5 text-[22px] leading-tight font-bold text-[#351e0e]" style={TITULAR}>
        {d.nombre}
      </p>
      {d.cargo ? (
        <p className="mt-1 text-[13px] font-semibold tracking-[.06em] text-[#9e4c01] uppercase">
          {d.cargo}
        </p>
      ) : null}

      {/*
        Sin foto el carnet SIGUE VALIENDO —lo dice la base— pero la comprobación
        contra suplantación se cayó, y quien verifica tiene que enterarse.
      */}
      {vale && !d.foto ? (
        <p className="mt-4 border-l-4 border-[#F0A128] bg-[#fff6da] px-3 py-2 text-[14px] font-semibold text-[#3D2F00]">
          Este carnet se emitió sin foto. Pida la cédula.
        </p>
      ) : null}

      <dl className="mt-5">
        <Fila k="Cédula" v={<span className="tabular-nums">{d.cedula}</span>} />
        {!egresado ? (
          <>
            <Fila k="Departamento" v={d.departamento ?? '—'} />
            <Fila
              k="Trabaja aquí desde"
              v={
                <>
                  <span className="tabular-nums">{fechaCorta(d.desde)}</span>
                  {antiguedad(d.desde) ? (
                    <span className="block text-[12px] font-normal text-[#7a6a5c]">
                      {antiguedad(d.desde)}
                    </span>
                  ) : null}
                </>
              }
            />
            {d.edad ? <Fila k="Edad" v={`${d.edad} años`} /> : null}
          </>
        ) : null}
      </dl>

      {egresado ? (
        <p className="mt-3 text-[13px] leading-relaxed text-[#7a6a5c]">
          No se publican más datos de quien ya no trabaja aquí.
        </p>
      ) : null}

      {/*
        EN CASO DE EMERGENCIA.

        No se lee en el mismo momento que el veredicto: el portón se resuelve
        arriba; esto se busca cuando alguien está en el suelo. Por eso va abajo,
        con su propio color, y con los teléfonos como botones de llamada — quien
        atiende a un herido no va a copiar once dígitos a mano.
      */}
      {!egresado &&
      (d.sangre || d.contacto_emergencia || d.telefono_emergencia || d.telefono || d.direccion) ? (
        <section className="mt-6 border-l-4 border-[#A31207] bg-white px-4 py-3.5">
          <Rotulo color="#A31207">En caso de emergencia</Rotulo>

          {d.sangre ? (
            <div className="mb-3 flex items-baseline gap-2">
              <span className="text-[13px] text-[#7a6a5c]">Grupo sanguíneo</span>
              <span
                className="text-[24px] leading-none font-extrabold text-[#A31207]"
                style={TITULAR}
              >
                {d.sangre}
              </span>
            </div>
          ) : null}

          {d.telefono_emergencia ? (
            <a
              href={`tel:${soloDigitos(d.telefono_emergencia)}`}
              className="mb-2 flex min-h-14 items-center justify-between gap-3 rounded-[4px] bg-[#A31207] px-3.5 text-white"
            >
              <span className="min-w-0">
                <span className="block text-[10px] tracking-[.14em] uppercase opacity-80">
                  Llamar a
                </span>
                <span className="block truncate text-[15px] font-semibold">
                  {d.contacto_emergencia ?? 'el contacto de emergencia'}
                </span>
              </span>
              <span className="shrink-0 text-[16px] font-bold tabular-nums">
                {d.telefono_emergencia}
              </span>
            </a>
          ) : d.contacto_emergencia ? (
            <Fila k="Llamar a" v={d.contacto_emergencia} />
          ) : null}

          {d.telefono ? (
            <a
              href={`tel:${soloDigitos(d.telefono)}`}
              className="flex min-h-14 items-center justify-between gap-3 rounded-[4px] border-2 border-[#A31207]/25 px-3.5 text-[#351e0e]"
            >
              <span className="text-[10px] tracking-[.14em] text-[#7a6a5c] uppercase">
                Su propio teléfono
              </span>
              <span className="text-[15px] font-semibold tabular-nums">{d.telefono}</span>
            </a>
          ) : null}

          {d.direccion ? (
            <div className="mt-3 border-t-2 border-[#e0d9d1] pt-2.5">
              <p className="text-[10px] tracking-[.14em] text-[#7a6a5c] uppercase">Dirección</p>
              <p className="mt-0.5 text-[14px] leading-snug text-[#351e0e]">{d.direccion}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {/*
        El código, y la instrucción de cotejarlo.

        Es lo que convierte a quien verifica en parte de la comprobación: una
        captura de pantalla del carnet de otro se cae justo aquí.
      */}
      <section className="mt-6">
        <Rotulo>Código del carnet</Rotulo>
        <p className="text-[19px] leading-none font-semibold tracking-[.12em] text-[#351e0e] tabular-nums">
          {enGrupos(codigo)}
        </p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-[#7a6a5c]">
          Debe coincidir con el impreso debajo del QR.
        </p>
      </section>
    </Hoja>
  )
}

// ---------------------------------------------------------------------------

function NoExiste({ codigo }: { codigo: string }) {
  return (
    <Hoja cara="rechazado" palabra="Rechazado" causa="Código desconocido" vale={false}>
      <p className="text-[17px] leading-snug font-bold text-[#351e0e]">
        Ningún carnet de esta empresa tiene ese código.
      </p>

      <p className="mt-5 text-[19px] leading-none font-semibold tracking-[.12em] text-[#351e0e] tabular-nums">
        {enGrupos(codigo)}
      </p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-[#7a6a5c]">
        Revise los 18 caracteres impresos debajo del QR.
      </p>

      {/*
        Escribirlo a mano va en segundo plano y no como botón grande: la
        reparación no puede pesar más que el rechazo, con el trabajador delante
        y la cola detrás.
      */}
      <a
        href="/v"
        className="mt-4 inline-flex min-h-12 items-center rounded-[4px] border-2 border-[#351e0e]/20 px-4 text-[15px] font-semibold text-[#351e0e]"
      >
        Escribirlo a mano
      </a>
    </Hoja>
  )
}

/*
  SIN SEÑAL NO ES «NO VALE», Y TAMPOCO ES «PASA».

  Las dos frases hacen falta. Sin la primera, un trabajador con su carnet bueno
  se queda fuera por un problema de cobertura. Sin la segunda, «no se pudo
  comprobar» se lee como permiso.
*/
function SinSenal({ codigo, onReintentar }: { codigo: string; onReintentar: () => void }) {
  return (
    <Hoja cara="sin-senal" palabra="Sin señal" causa="No se pudo comprobar" vale={null}>
      <p className="text-[17px] leading-snug font-bold text-[#351e0e]">
        Esto no dice que el carnet sea falso.
      </p>
      <p className="mt-2 text-[17px] leading-snug font-bold text-[#351e0e]">
        Tampoco autoriza el paso. Consulte con el supervisor.
      </p>

      <p className="mt-5 text-[22px] leading-none font-semibold tracking-[.12em] text-[#351e0e] tabular-nums">
        {enGrupos(codigo)}
      </p>
      <p className="mt-1.5 text-[12px] text-[#7a6a5c]">
        Puede dictar este código por radio para que lo comprueben.
      </p>

      <button
        type="button"
        onClick={onReintentar}
        className="mt-5 min-h-14 w-full rounded-[4px] bg-[#cc3f00] text-[17px] font-bold tracking-wide text-white uppercase"
        style={TITULAR}
      >
        Reintentar
      </button>
    </Hoja>
  )
}

// ---------------------------------------------------------------------------

/*
  TECLEAR EL CÓDIGO A MANO.

  Existe porque el QR se raya. Va impreso debajo, en grupos de seis, justo para
  esto: cuando el plástico lleva un año en un bolsillo y el lector no engancha,
  se teclean dieciocho caracteres y se llega igual.

  UN SOLO CAMPO, NO TRES CASILLAS. Con guantes, tres casillas son tres aciertos
  de foco y el teclado tapa las que quedan. Y el botón NUNCA se apaga: si faltan
  caracteres lo dice, en vez de quedarse mudo y dejar a alguien mirando un botón
  gris sin saber qué le falta.
*/
function PedirCodigo() {
  const [texto, setTexto] = useState('')
  const [aviso, setAviso] = useState('')

  const codigo = limpio(texto)
  const faltan = 18 - codigo.length

  return (
    <div
      className="flex min-h-dvh justify-center bg-[#e9e4de]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <main className="flex w-full max-w-[26rem] flex-col bg-[#f5f2ef] shadow-[0_0_40px_rgba(53,30,14,.12)]">
        <Banda />

        <div className="grow px-5 py-8">
          <h1
            className="text-[26px] leading-tight font-extrabold text-[#351e0e] uppercase"
            style={{ ...TITULAR, letterSpacing: '-.01em' }}
          >
            Verificar un carnet
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-[#7a6a5c]">
            Escanee el QR del reverso. Si no se deja leer, escriba aquí el código impreso debajo,
            en tres grupos de seis.
          </p>

          <form
            className="mt-6"
            onSubmit={(e) => {
              e.preventDefault()
              if (codigo.length === 18) window.location.assign(`/v/${codigo}`)
              else if (faltan > 0)
                setAviso(`Faltan ${faltan} ${faltan === 1 ? 'carácter' : 'caracteres'}.`)
              else setAviso('Sobran caracteres: el código tiene 18.')
            }}
          >
            <input
              aria-label="Código del carnet"
              value={enGrupos(codigo)}
              onChange={(e) => {
                setTexto(e.target.value)
                setAviso('')
              }}
              placeholder="1A2B3C 4D5E6F 708192"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              className="h-16 w-full rounded-[4px] border-2 border-[#351e0e]/25 bg-white px-4 text-center text-[22px] tracking-[.1em] text-[#351e0e] uppercase tabular-nums outline-none focus:border-[#cc3f00]"
            />

            <p className="mt-1.5 text-right text-[12px] text-[#7a6a5c] tabular-nums">
              {codigo.length}/18
            </p>

            {aviso ? (
              <p className="mt-2 border-l-4 border-[#F0A128] bg-[#fff6da] px-3 py-2 text-[14px] font-semibold text-[#3D2F00]">
                {aviso}
              </p>
            ) : null}

            <button
              type="submit"
              className="mt-4 min-h-16 w-full rounded-[4px] bg-[#cc3f00] text-[18px] font-bold tracking-wide text-white uppercase"
              style={TITULAR}
            >
              Comprobar
            </button>
          </form>
        </div>

        <Pie />
      </main>
    </div>
  )
}
