import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, ShieldX, Search, TriangleAlert } from 'lucide-react'
import { verificarCarnet, type CarnetVerificado } from '@/lib/api/carnets'
import { EMPRESA } from '@/lib/empresa'

/*
  VERIFICAR UN CARNET. LA PANTALLA QUE ABRE EL QR.

  La abre un vigilante en un portón, a pleno sol, con un teléfono barato y con el
  trabajador delante esperando. No tiene cuenta, nunca ha visto el sistema y no
  va a leer un párrafo. Tiene UNA pregunta: ¿este carnet vale?

  Se diseñó con tres propuestas independientes y nueve jueces —velocidad,
  resistencia al engaño e identidad—. Lo que sigue son las decisiones que salieron
  de ahí, y están escritas porque cada una se va a leer como un capricho si no
  queda dicha la razón.

  1. «VIGENTE» Y «RECHAZADO», NUNCA «VÁLIDO» Y «NO VÁLIDO»

  Es el hallazgo más barato y el más importante: «NO VÁLIDO» contiene «VÁLIDO».
  A dos metros, con reflejo y prisa, el error cae siempre del mismo lado — el de
  dejar pasar. Dos palabras con distinta inicial, distinta longitud y distinta
  silueta no se confunden ni de refilón.

  2. EL COLOR NO PUEDE SER EL ÚNICO PORTADOR DEL VEREDICTO

  Verde #1FA24E y rojo #A31207 están a 24 puntos de L*, comprobado: en escala de
  grises siguen siendo dos manchas distintas, así que el veredicto sobrevive al
  sol, a una pantalla mala y al daltonismo. Y encima cambia la polaridad del
  texto —tinta sobre el claro, blanco sobre el oscuro—, que es un tercer canal.

  3. EL GRIS DE «BUSCANDO» ES ACROMÁTICO A PROPÓSITO

  Es la única superficie sin color de toda la pantalla, y por eso no puede
  leerse como un veredicto. Se le da al estado que sale en el cien por cien de
  los escaneos, y JAMÁS al fallo de red: el fallo de red pide una acción y el
  gris no la pide.

  4. LA FOTO MANDA, PORQUE ES EL ANTIFRAUDE

  Toda esta función existe para eso: la base guarda la foto QUE SE IMPRIMIÓ EN
  ESE CARNET, así que si alguien despegó el plástico y cambió el retrato,
  comparar lo delata.

  5. ALGO QUE UNA CAPTURA DE PANTALLA NO PUEDA FALSIFICAR

  Un bloque de color liso con un gancho se copia en diez líneas de HTML, y una
  captura de ayer se ve igual que una comprobación de ahora. Por eso los
  segundos corren, y por eso el código se enseña con la instrucción de cotejarlo
  contra el que está impreso bajo el QR: una captura del carnet de otro se cae
  ahí.

  6. NO SE RESPETA EL TEMA DEL SISTEMA, Y ES A PROPÓSITO

  En el resto de la aplicación respetar el modo oscuro es cortesía. Aquí el
  color ES el veredicto, y que el teléfono decida invertirlo es exactamente lo
  que no puede pasar. Los colores van escritos, no en tokens.
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

function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** El dominio donde vive esta página. Se enseña para poder desconfiar de otro. */
const dominio = () => window.location.host

// ---------------------------------------------------------------------------

type Cara = 'buscando' | 'vigente' | 'rechazado' | 'sin-senal'

const PALETA: Record<Cara, { fondo: string; texto: string; pie: string }> = {
  // Acromático: la única superficie sin color, y por eso nunca un veredicto.
  buscando: { fondo: '#6D6D6D', texto: '#FFFFFF', pie: '#cc3f00' },
  vigente: { fondo: '#1FA24E', texto: '#351e0e', pie: '#cc3f00' },
  rechazado: { fondo: '#A31207', texto: '#FFFFFF', pie: '#351e0e' },
  'sin-senal': { fondo: '#F0A128', texto: '#351e0e', pie: '#351e0e' },
}

export function VerificarCarnet() {
  const { codigo } = useParams()
  const buscado = codigo ? limpio(codigo) : ''

  /*
    Fuera de los buscadores.

    Es una página abierta con nombres y cédulas de gente que no eligió estar en
    internet. Que exista para quien escanea no quiere decir que tenga que salir
    en una búsqueda.
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

  if (consulta.isPending) return <Marco cara="buscando" palabra="BUSCANDO" icono={<Search />} />

  if (consulta.error) return <SinSenal codigo={buscado} onReintentar={() => void consulta.refetch()} />

  const d = consulta.data

  if (!d || !d.existe) {
    return (
      <Marco cara="rechazado" palabra="RECHAZADO" rotulo="CÓDIGO DESCONOCIDO" icono={<ShieldX />}>
        <p className="text-[17px] leading-snug font-bold">
          Ningún carnet de esta empresa tiene ese código.
        </p>
        <p className="tabular mt-4 text-[15px] tracking-wider">{enGrupos(buscado)}</p>
        <p className="mt-2 text-[13px] leading-relaxed text-[#6b5b4e]">
          Revise los 18 caracteres impresos debajo del QR.
        </p>
        <a
          href="/v"
          className="mt-4 inline-flex h-11 items-center justify-center rounded-[6px] border-2 border-[#351e0e]/25 px-4 text-[15px] font-semibold"
        >
          Escribirlo a mano
        </a>
      </Marco>
    )
  }

  return <Veredicto d={d} codigo={buscado} />
}

// ---------------------------------------------------------------------------

/*
  EL MARCO ES EL MISMO EN TODAS.

  Mismo alto de bloque, mismo sitio del glifo, misma línea de sello. A partir
  del segundo carnet el ojo deja de buscar y va directo. Si el bloque creciera
  cuando hay algo que explicar, cada consulta empezaría de cero.
*/
function Marco({
  cara,
  palabra,
  rotulo,
  icono,
  children,
}: {
  cara: Cara
  palabra: string
  rotulo?: string
  icono: React.ReactNode
  children?: React.ReactNode
}) {
  const c = PALETA[cara]

  return (
    <div className="flex min-h-dvh flex-col bg-[#f5f2ef] text-[#351e0e]">
      <div
        className="flex flex-col items-center justify-center px-5 py-9 text-center"
        style={{ backgroundColor: c.fondo, color: c.texto }}
      >
        <div className="flex w-full max-w-[30rem] items-start">
          <img src="/media/marca.webp" alt="" className="size-6 rounded-full bg-white/90 p-px" />
        </div>

        <div className="[&>svg]:size-16 [&>svg]:stroke-[2.5]">{icono}</div>

        <p className="mt-2 text-[clamp(2rem,12vw,3.25rem)] leading-none font-extrabold tracking-tight">
          {palabra}
        </p>

        {/* Hueco reservado: el bloque mide igual haya o no haya causa. */}
        <p className="mt-2 h-6 text-[15px] leading-6 font-bold tracking-wide">{rotulo ?? ''}</p>
      </div>

      <Sello cara={cara} />

      <main className="mx-auto w-full max-w-[30rem] grow px-5 py-6">{children}</main>

      <Pie color={c.pie} />
    </div>
  )
}

/*
  LA HORA, CON LOS SEGUNDOS CORRIENDO.

  Es lo único de esta pantalla que una captura no puede imitar: quien enseñe la
  foto de una comprobación de ayer la tiene congelada, y ahí se ve. Va fuera del
  bloque para no robarle la primera mirada, y pegada a él para que se vea.
*/
function Sello({ cara }: { cara: Cara }) {
  const [ahora, setAhora] = useState(() => new Date())

  useEffect(() => {
    const t = window.setInterval(() => setAhora(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])

  if (cara === 'buscando') {
    return (
      <div className="bg-[#5a5a5a] py-2 text-center text-[12px] font-semibold tracking-wider text-white/90">
        COMPROBANDO EL CÓDIGO
      </div>
    )
  }

  return (
    <div
      className="tabular py-2 text-center text-[12px] font-semibold tracking-wider"
      style={{
        backgroundColor: cara === 'vigente' ? '#188A41' : cara === 'rechazado' ? '#7E0D05' : '#D18A1E',
        color: cara === 'rechazado' ? '#FFFFFF' : '#2a1608',
      }}
    >
      COMPROBADO{' '}
      {ahora.toLocaleString('es-VE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })}
    </div>
  )
}

function Pie({ color }: { color: string }) {
  return (
    <footer style={{ backgroundColor: color }}>
      <div className="mx-auto flex w-full max-w-[30rem] items-center gap-2.5 px-5 py-3">
        <img src="/media/marca.webp" alt="" className="size-9 shrink-0 rounded-full bg-white/95 p-0.5" />
        <div className="min-w-0">
          <p className="truncate text-[12px] leading-tight font-bold text-white">{EMPRESA.nombre}</p>
          <p className="truncate text-[10px] leading-tight text-white/75">
            {EMPRESA.forma} · RIF {EMPRESA.rif}
          </p>
          {/*
            El dominio, a la vista. Nadie puede impedir que un carnet falso
            apunte a una copia de esta página que diga VIGENTE siempre; lo único
            que se puede hacer es que la dirección buena esté escrita donde se
            pueda comparar.
          */}
          <p className="truncate text-[10px] leading-tight text-white/60">{dominio()}</p>
        </div>
      </div>
      <p className="pb-3 text-center text-[10px] text-white/60">
        Si los segundos no corren, es una foto de pantalla.
      </p>
    </footer>
  )
}

// ---------------------------------------------------------------------------

function Veredicto({ d, codigo }: { d: CarnetVerificado; codigo: string }) {
  const vale = d.vigente === true
  const egresado = d.causa === 'EGRESADO'

  const rotulo = vale ? undefined : egresado ? 'YA NO TRABAJA AQUÍ' : 'CARNET ANULADO'

  return (
    <Marco
      cara={vale ? 'vigente' : 'rechazado'}
      palabra={vale ? 'VIGENTE' : 'RECHAZADO'}
      rotulo={rotulo}
      icono={vale ? <BadgeCheck /> : <ShieldX />}
    >
      {/*
        La consecuencia, dicha en una frase, y distinta en los dos rechazos.

        Actuar es lo mismo —no pasa— pero lo que sigue no: con el carnet anulado
        el trabajador es de la casa y hay que pedirle el nuevo; con el egreso, no
        representa a la empresa. Quien está en el portón necesita saber cuál es.
      */}
      {!vale ? (
        <p className="mb-5 text-[17px] leading-snug font-bold">
          {egresado
            ? 'Esta persona no representa a la empresa.'
            : 'Este carnet no sirve. La persona sí trabaja aquí: pídale el carnet nuevo.'}
        </p>
      ) : null}

      {/*
        Del que ya no trabaja aquí no se enseña foto ni cargo, y la base tampoco
        los manda. La decisión ya está tomada y comparar la cara no la cambia:
        publicar el retrato y el puesto de un ex trabajador en una página abierta
        no compra seguridad, la regala.
      */}
      {!egresado ? (
        <div className="flex gap-4">
          {d.foto ? (
            <img
              src={d.foto}
              alt={`Foto impresa en el carnet de ${d.nombre ?? 'el trabajador'}`}
              className="h-[132px] w-[117px] shrink-0 rounded-[4px] border-4 border-white object-cover shadow-[2px_2px_0_rgba(53,30,14,.25)]"
            />
          ) : (
            <div className="flex h-[132px] w-[117px] shrink-0 items-center justify-center rounded-[4px] border-2 border-dashed border-[#351e0e]/30 px-2 text-center text-[11px] leading-tight font-semibold">
              ESTE CARNET SE EMITIÓ SIN FOTO
            </div>
          )}

          <div className="min-w-0 self-center">
            <p className="text-[11px] font-semibold tracking-wider text-[#6b5b4e]">NOMBRE COMPLETO</p>
            <p className="text-[21px] leading-tight font-bold break-words">{d.nombre}</p>
            {d.cargo ? (
              <p className="mt-1 text-[13px] leading-snug font-semibold tracking-wide text-[#9e4c01]">
                {d.cargo.toUpperCase()}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/*
        Sin foto el carnet SIGUE VALIENDO —lo dice la base— pero la comprobación
        contra suplantación se cayó, y quien verifica tiene que enterarse.
      */}
      {vale && !d.foto ? (
        <p className="mt-3 rounded-[6px] bg-[#fff6da] px-3 py-2 text-[13px] font-semibold">
          Este carnet no lleva foto guardada. Pida la cédula.
        </p>
      ) : null}

      {!egresado && d.foto ? (
        <p className="mt-3 text-[14px] font-bold tracking-wide">COMPARE LA CARA CON LA PERSONA</p>
      ) : null}

      <dl className="mt-5 text-[14px]">
        {[
          ['Cédula', d.cedula],
          ['Ficha', d.ficha],
          ...(!egresado
            ? ([
                ['Departamento', d.departamento ?? '—'],
                ['Trabaja aquí desde', fechaCorta(d.desde)],
              ] as Array<[string, string]>)
            : []),
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b-2 border-[#dedede] py-2">
            <dt className="text-[#6b5b4e]">{k}</dt>
            <dd className="tabular text-right font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      {egresado ? (
        <p className="mt-3 text-[13px] leading-relaxed text-[#6b5b4e]">
          No se publican más datos de quien ya no trabaja aquí.
        </p>
      ) : null}

      <div className="mt-5 rounded-[6px] bg-white px-4 py-3">
        <p className="text-[11px] font-semibold tracking-wider text-[#6b5b4e]">CÓDIGO DEL CARNET</p>
        <p className="tabular mt-0.5 text-[17px] font-semibold tracking-widest">
          {enGrupos(codigo)}
        </p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-[#6b5b4e]">
          Debe coincidir con el impreso debajo del QR.
        </p>
      </div>
    </Marco>
  )
}

// ---------------------------------------------------------------------------

/*
  SIN SEÑAL NO ES «NO VALE», Y TAMPOCO ES «PASA».

  Las dos frases hacen falta. Sin la primera, un trabajador con su carnet bueno
  se queda fuera por un problema de cobertura. Sin la segunda, «no se pudo
  comprobar» se lee como permiso.
*/
function SinSenal({ codigo, onReintentar }: { codigo: string; onReintentar: () => void }) {
  return (
    <Marco
      cara="sin-senal"
      palabra="SIN SEÑAL"
      rotulo="NO SE PUDO COMPROBAR"
      icono={<TriangleAlert />}
    >
      <p className="text-[17px] leading-snug font-bold">Esto no dice que el carnet sea falso.</p>
      <p className="mt-2 text-[17px] leading-snug font-bold">
        Tampoco autoriza el paso. Consulte con el supervisor.
      </p>

      <p className="tabular mt-5 text-[19px] font-semibold tracking-widest">{enGrupos(codigo)}</p>
      <p className="mt-1 text-[12px] text-[#6b5b4e]">
        Puede dictar este código por radio para que lo comprueben.
      </p>

      <button
        type="button"
        onClick={onReintentar}
        className="mt-5 h-14 w-full rounded-[6px] bg-[#cc3f00] text-[17px] font-bold text-white"
      >
        REINTENTAR
      </button>
    </Marco>
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
    <div className="flex min-h-dvh flex-col bg-[#f5f2ef] text-[#351e0e]">
      <header className="bg-[#cc3f00]">
        <div className="mx-auto flex w-full max-w-[30rem] items-center gap-2.5 px-5 py-3">
          <img src="/media/marca.webp" alt="" className="size-9 shrink-0 rounded-full bg-white/95 p-0.5" />
          <div className="min-w-0">
            <p className="truncate text-[13px] leading-tight font-bold text-white">{EMPRESA.nombre}</p>
            <p className="truncate text-[10px] leading-tight text-white/75">
              {EMPRESA.forma} · RIF {EMPRESA.rif}
            </p>
          </div>
        </div>
        <div className="h-1 bg-[#F0A128]" />
      </header>

      <main className="mx-auto w-full max-w-[30rem] grow px-5 py-8">
        <h1 className="text-[24px] leading-tight font-extrabold">Escriba el código del carnet</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#6b5b4e]">
          Está impreso al reverso, debajo del QR, en tres grupos de seis.
        </p>

        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault()
            if (codigo.length === 18) {
              window.location.assign(`/v/${codigo}`)
            } else if (faltan > 0) {
              setAviso(`Faltan ${faltan} ${faltan === 1 ? 'carácter' : 'caracteres'}.`)
            } else {
              setAviso('Sobran caracteres: el código tiene 18.')
            }
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
            className="tabular h-16 w-full rounded-[6px] border-2 border-[#351e0e]/25 px-4 text-center text-[22px] tracking-widest uppercase outline-none focus:border-[#cc3f00]"
          />

          <p className="tabular mt-1.5 text-right text-[12px] text-[#6b5b4e]">
            {codigo.length}/18
          </p>

          {aviso ? (
            <p className="mt-2 rounded-[6px] bg-[#fff6da] px-3 py-2 text-[14px] font-semibold">
              {aviso}
            </p>
          ) : null}

          <button
            type="submit"
            className="mt-4 h-16 w-full rounded-[6px] bg-[#cc3f00] text-[18px] font-bold text-white"
          >
            COMPROBAR
          </button>
        </form>

        <p className="mt-6 text-[13px] leading-relaxed text-[#6b5b4e]">
          Escanear el QR es más rápido y no se equivoca. Esto es para cuando el código no se deja
          leer.
        </p>
      </main>

      <Pie color="#351e0e" />
    </div>
  )
}
