/*
  Salidas de planta.

  Lo que quien lleva la planta pidió: un registro de lo que SALE, camión por
  camión, separado de facturación. El reparto interno de la planta no se
  puede medir; lo que sale sí.

  Se carga desde un teléfono, en planta, con sol y polvo, veinte o treinta
  veces al día. Ese sigue siendo el encargo y lo de abajo sigue siendo su
  consecuencia: vertical, targets grandes, y los m³ llenándose solos.

  ─────────────────────────────────────────────────────────────────────────

  REDISEÑO DEL 24/09/2026, Y EL DATO QUE LO GUIÓ

  La tabla `salidas_planta` tiene CERO filas. No pocas: ninguna, nunca. La
  pantalla se construyó para las treinta veces al día de alguien que ya la
  domina, y a día de hoy no la ha estrenado nadie. Son dos diseños distintos:
  el veterano quiere velocidad, el que nunca la abrió quiere entender qué le
  están pidiendo y ver que funcionó. Esto atiende al segundo sin encarecerle
  nada al primero.

  DESAPARECEN LAS DOS PESTAÑAS. Anotar estaba en una y lo anotado en la otra,
  así que la única señal de que algo se había guardado era una línea de texto
  gris que decía «Anotada». Quien anota veinte camiones necesita ver los veinte
  creciendo, sobre todo para no anotar el mismo dos veces. Ahora el formulario
  y el día están a la vez: al lado en pantalla ancha, uno encima del otro en el
  teléfono.

  EL CAMIÓN SE TOCA, NO SE DESPLIEGA. Hay ocho activos. Ocho caben a la vista, y
  tocar uno es UN gesto donde un desplegable son tres —abrir, buscar, elegir—
  repetidos treinta veces al día. Pasados doce vuelve a ser un desplegable,
  porque una rejilla de veinte placas ya no se lee de un vistazo.

  EL PRODUCTO SÍ SIGUE SIENDO DESPLEGABLE. Son dieciocho, no caben en rejilla, y
  se descartó el buscador con teclado a propósito: en planta, con guantes y
  polvo, escribir es peor que recorrer. El desplegable del teléfono se abre a
  pantalla completa y con renglones grandes, que es justo lo que hace falta.

  LA CONFIRMACIÓN DICE QUÉ SE ANOTÓ. «Anotada» no responde a la pregunta que se
  hace quien acaba de pulsar, que es «¿anoté ESTE camión o el anterior?». Ahora
  se nombra la placa, el producto y los metros, y se dice cuánto va del día.

  EL DÍA SE PLIEGA. Casi siempre es hoy. Ocupaba una tarjeta entera arriba del
  todo —lo primero que se ve, lo que menos se toca— y ahora es un renglón que se
  abre solo si hace falta mirar otro día.
*/
import { useState } from 'react'
import { Ban, CalendarDays, Plus, Truck } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { ConversionDeCantidad } from '@/components/ConversionDeCantidad'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useVehiculos } from '@/lib/api/vehiculos'
import { useArticulos } from '@/lib/api/catalogo'
import {
  useAnularSalida,
  useProductosDePlanta,
  useRegistrarSalida,
  useSalidasDelDia,
  type SalidaPlanta,
} from '@/lib/api/salidasPlanta'
import { useMisAcciones } from '@/lib/api/usuarios'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { enteros, fecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

const aTexto = (v: unknown): string => (v == null ? '' : String(v))

/*
  A partir de cuántos camiones la rejilla deja de servir. Con ocho se leen de un
  vistazo; con veinte hay que recorrerla con la vista, que es exactamente lo que
  la rejilla venía a evitar, y entonces un desplegable es mejor.
*/
const CABEN_EN_REJILLA = 12

export function SalidasDePlanta() {
  const [dia, setDia] = useState(hoyEnCaracas())

  const salidas = useSalidasDelDia(dia)

  return (
    <>
      <PageHeader
        title="Salidas de planta"
        description="Cada camión que sale de la planta con un producto. Es lo que se mide de verdad: los metros cúbicos son la carga útil del camión, estimados."
      />

      <ElDia dia={dia} onCambio={setDia} />

      {/*
        Anotar y lo anotado, a la vez. En el teléfono se apilan —primero el
        formulario, que es a lo que se viene— y en pantalla ancha van al lado,
        con el formulario en una columna fija: si creciera con el contenido, los
        campos se estirarían a media pantalla y se leerían peor.
      */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <AnotarSalida dia={dia} />
        <LoQueVaSaliendo
          salidas={salidas.data ?? []}
          cargando={salidas.isPending}
          error={salidas.error}
        />
      </div>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════ qué día es */

function ElDia({ dia, onCambio }: { dia: string; onCambio: (d: string) => void }) {
  const hoy = hoyEnCaracas()
  const esHoy = dia === hoy
  const [abierto, setAbierto] = useState(false)

  // Al volver a hoy se pliega solo: dejarlo abierto sería dejar un campo
  // pidiendo atención cuando ya no hay nada que decidir.
  const volverAHoy = () => {
    onCambio(hoy)
    setAbierto(false)
  }

  if (esHoy && !abierto) {
    return (
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-ink/70 text-sm font-medium">Hoy, {fecha(hoy)}</p>
        <Button variant="ghost" size="sm" icon={<CalendarDays />} onClick={() => setAbierto(true)}>
          Ver otro día
        </Button>
      </div>
    )
  }

  return (
    <Card className="mb-5">
      <div className="flex flex-wrap items-end gap-3">
        <Input
          label="Día"
          type="date"
          value={dia}
          onChange={(e) => onCambio(e.target.value)}
          className="max-w-xs"
        />
        {!esHoy ? (
          <Button variant="outline" size="sm" onClick={volverAHoy} className="mb-0.5">
            Volver a hoy
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setAbierto(false)} className="mb-0.5">
            Listo
          </Button>
        )}
      </div>
      {!esHoy ? (
        <p className="text-warning mt-3 text-sm">
          Estás mirando otro día. Lo que anotes se guarda con esa fecha.
        </p>
      ) : null}
    </Card>
  )
}

/* ═══════════════════════════════════════════════════════ anotar una salida */

/** Lo último que se anotó, para poder decirlo con nombre y apellido. */
interface Anotada {
  placa: string
  producto: string
  m3: number | null
}

function AnotarSalida({ dia }: { dia: string }) {
  const camiones = useVehiculos(true)
  const productos = useProductosDePlanta()
  const articulos = useArticulos(false)
  const registrar = useRegistrarSalida()
  const { puede } = useMisAcciones()

  const [vehiculo, setVehiculo] = useState('')
  const [producto, setProducto] = useState('')
  const [m3, setM3] = useState('')
  const [ultima, setUltima] = useState<Anotada | null>(null)

  const listaCamiones = camiones.data ?? []
  const listaProductos = productos.data ?? []

  const elegido = listaCamiones.find((c) => String(c.id) === vehiculo)
  const sugerido = aTexto(elegido?.carga_util_m3)
  const m3Efectivo = m3 === '' ? sugerido : m3
  const valido =
    Number(vehiculo) > 0 && Number(producto) > 0 && (m3Efectivo === '' || Number(m3Efectivo) > 0)

  if (!puede('EXPLOTACION.REGISTRAR_SALIDAS')) {
    return (
      <Card>
        <Vacio
          icono={<Truck />}
          titulo="Tu rol no anota salidas"
          descripcion="Las del día se ven al lado, con lo que lleva sacado la planta."
        />
      </Card>
    )
  }

  if (productos.isPending || camiones.isPending) {
    return (
      <Card>
        <Cargando />
      </Card>
    )
  }
  if (productos.error) return <ErrorDeCarga error={productos.error} />

  if (listaProductos.length === 0) {
    return (
      <Card>
        <Vacio
          icono={<Truck />}
          titulo="Todavía no hay productos de planta"
          descripcion="Cárgalos por la planilla de artículos con categoría PRODUCTO (arena lavada, piedra picada…). Sin ellos no hay qué anotar."
        />
      </Card>
    )
  }

  /*
    Los metros del camión, también en toneladas. La capacidad del camión no se
    convierte —un camión no tiene densidad—, pero lo que lleva sí, en cuanto se
    sabe qué producto es.
  */
  const densidadDelProducto = articulos.data?.find(
    (a) => a.id === Number(producto),
  )?.densidad_ton_m3

  // Cambiar de camión borra los metros escritos a mano: si quedaran, el
  // siguiente camión saldría con la carga útil del anterior sin avisar.
  const elegirCamion = (id: string) => {
    setVehiculo(id)
    setM3('')
  }

  const enviar = async () => {
    const dicho = {
      placa: elegido?.placa ?? '',
      producto: listaProductos.find((p) => String(p.id) === producto)?.nombre ?? '',
      m3: m3Efectivo === '' ? null : Number(m3Efectivo),
    }
    await registrar.mutateAsync({
      fecha: dia,
      vehiculo_id: Number(vehiculo),
      producto_id: Number(producto),
      m3: dicho.m3,
    })
    // El camión y el producto se quedan puestos: en planta se cargan varios
    // viajes seguidos del mismo material, y volver a elegirlos treinta veces
    // es el trabajo que esta pantalla venía a quitar.
    setM3('')
    setUltima(dicho)
  }

  return (
    <Card>
      <div className="grid gap-4">
        <ElCamion camiones={listaCamiones} valor={vehiculo} onCambio={elegirCamion} />

        <Select
          label="Producto"
          vacio="Elige el producto"
          value={producto}
          onChange={(e) => setProducto(e.target.value)}
          opciones={listaProductos.map((p) => ({
            valor: String(p.id),
            etiqueta: p.nombre,
          }))}
        />

        <Input
          label="Metros cúbicos (estimado)"
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          value={m3Efectivo}
          onChange={(e) => setM3(e.target.value)}
          hint={
            !elegido
              ? 'Se llena solo al elegir el camión.'
              : sugerido
                ? `La carga útil de ${elegido.placa} es ${sugerido} m³. Cámbialo si trajo otra cosa.`
                : `${elegido.placa} no tiene carga útil cargada: pon los m³ o queda sin medir.`
          }
        />

        {producto ? (
          <ConversionDeCantidad
            className="-mt-3"
            cantidad={m3Efectivo}
            unidad="M3"
            densidad={densidadDelProducto}
          />
        ) : null}

        <Button
          icon={<Plus />}
          size="lg"
          block
          disabled={!valido || registrar.isPending}
          onClick={() => void enviar()}
        >
          {registrar.isPending ? 'Anotando…' : 'Anotar salida'}
        </Button>

        {/*
          La confirmación nombra lo que se guardó. La pregunta de quien acaba de
          pulsar no es «¿se guardó?» sino «¿guardé ESTE camión o el de antes?»,
          y a esa solo contesta la placa.
        */}
        {ultima && !registrar.isPending ? (
          <p className="anim-surgir border-hairline text-ink/70 rounded-md border px-3 py-2 text-sm">
            Anotada la salida de <span className="text-ink/90 font-medium">{ultima.placa}</span> con{' '}
            {ultima.producto}
            {ultima.m3 === null ? (
              <span className="text-warning">, sin medir</span>
            ) : (
              <>
                , <span className="tabular">{enteros(ultima.m3)}</span> m³
              </>
            )}
            . El camión y el producto quedan puestos para la siguiente.
          </p>
        ) : null}

        {registrar.error ? <ErrorDeCarga error={registrar.error} /> : null}
      </div>
    </Card>
  )
}

/** Los camiones, tocables mientras quepan y desplegables cuando no. */
function ElCamion({
  camiones,
  valor,
  onCambio,
}: {
  camiones: { id: number; placa: string; transportista: string | null }[]
  valor: string
  onCambio: (id: string) => void
}) {
  if (camiones.length > CABEN_EN_REJILLA) {
    return (
      <Select
        label="Camión"
        vacio="Elige el camión"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        opciones={camiones.map((c) => ({
          valor: String(c.id),
          etiqueta: c.transportista ? `${c.placa} · ${c.transportista}` : c.placa,
        }))}
      />
    )
  }

  return (
    <div>
      <p className="text-ink/70 mb-1.5 text-sm font-medium">Camión</p>
      {/*
        Dos columnas. A una sola, ocho camiones son una columna larga que hay que
        desplazar; a tres, la placa no cabe y se parte. El alto mínimo es el del
        dedo, no el del texto.
      */}
      <div className="grid grid-cols-2 gap-2">
        {camiones.map((c) => {
          const activo = String(c.id) === valor
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={activo}
              // Volver a tocarlo lo apaga. Sin eso no hay forma de
              // deshacer una elección con el dedo, solo de cambiarla.
              onClick={() => onCambio(activo ? '' : String(c.id))}
              className={cn(
                'flex min-h-[3.25rem] flex-col justify-center rounded-md border px-3 py-2 text-left transition-colors',
                'focus-visible:ring-2 focus-visible:-outline-offset-2 focus-visible:outline-none',
                activo
                  ? 'border-tierra-600 bg-tierra-600/10 text-tierra-700 dark:text-tierra-300'
                  : 'border-hairline text-ink/75 hover:border-tierra-300',
              )}
            >
              <span className="truncate text-sm font-medium">{c.placa}</span>
              {c.transportista ? (
                <span className={cn('truncate text-xs', activo ? 'opacity-70' : 'text-ink/45')}>
                  {c.transportista}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════ las salidas del día */

function LoQueVaSaliendo({
  salidas,
  cargando,
  error,
}: {
  salidas: SalidaPlanta[]
  cargando: boolean
  error: unknown
}) {
  const { puede } = useMisAcciones()
  const [anulando, setAnulando] = useState<SalidaPlanta | null>(null)

  // Las anuladas siguen en la lista —queda el rastro— pero no suman: un total
  // que cuenta lo anulado es un total que nadie puede cuadrar contra la báscula.
  const vivas = salidas.filter((s) => s.estado === 'REGISTRADO')
  const m3 = vivas.reduce((s, x) => s + Number(x.m3 ?? 0), 0)
  const sinM3 = vivas.filter((x) => x.m3 === null).length

  if (error) return <ErrorDeCarga error={error} />

  return (
    <>
      <Card flush>
        <div className="border-hairline flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b px-4 py-3">
          <h2 className="text-ink/85 text-sm font-medium">Lo que va saliendo</h2>
          <p className="text-ink/60 text-sm">
            <span className="tabular font-medium">{vivas.length}</span>{' '}
            {vivas.length === 1 ? 'salida' : 'salidas'} ·{' '}
            <span className="tabular font-medium">{enteros(m3)}</span> m³
            {sinM3 > 0 ? (
              <span className="text-warning">
                {' '}
                · <span className="tabular">{sinM3}</span> sin medir
              </span>
            ) : null}
          </p>
        </div>

        {cargando ? (
          <div className="px-4 py-6">
            <Cargando />
          </div>
        ) : salidas.length === 0 ? (
          <div className="px-4 py-2">
            <Vacio
              icono={<Truck />}
              titulo="Todavía no ha salido nada"
              descripcion="Lo que anotes aparece aquí, camión por camión, y suma arriba."
            />
          </div>
        ) : (
          <ul className="divide-hairline divide-y">
            {salidas.map((s) => (
              <li
                key={s.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-3',
                  s.estado === 'ANULADO' && 'opacity-50',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-ink/85 text-sm font-medium">
                    {s.placa} · {s.producto}
                  </p>
                  <p className="text-ink/45 text-xs">
                    {s.numero}
                    {s.transportista ? ` · ${s.transportista}` : ''}
                    {s.estado === 'ANULADO' ? ` · Anulada: ${s.motivo_anulacion ?? ''}` : ''}
                  </p>
                </div>
                <Chip tone={s.m3 === null ? 'warning' : 'neutral'}>
                  {s.m3 === null ? 'Sin medir' : `${enteros(s.m3)} m³`}
                </Chip>
                {s.estado === 'REGISTRADO' && puede('EXPLOTACION.ANULAR_SALIDA') ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAnulando(s)}
                    /* Con solo el icono, el lector de pantalla leía «botón» y
                       nada más. El nombre dice cuál de las filas anula. */
                    aria-label={`Anular la salida ${s.numero} de ${s.placa}`}
                    title="Anular"
                  >
                    <Ban className="size-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {anulando ? <AnularSalida salida={anulando} onCerrar={() => setAnulando(null)} /> : null}
    </>
  )
}

function AnularSalida({ salida, onCerrar }: { salida: SalidaPlanta; onCerrar: () => void }) {
  const anular = useAnularSalida()
  const [motivo, setMotivo] = useState('')

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Anular la salida ${salida.numero}`}
      descripcion="No se borra: queda anulada con el motivo. Si ya entró al centro de costo, allí aparece para reversarla."
      ancho="sm"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            No anular
          </Button>
          <Button
            variant="danger"
            disabled={anular.isPending || motivo.trim().length < 4}
            onClick={async () => {
              await anular.mutateAsync({ id: salida.id, motivo })
              onCerrar()
            }}
          >
            {anular.isPending ? 'Anulando…' : 'Sí, anular'}
          </Button>
        </>
      }
    >
      <Textarea
        label="Por qué se anula"
        rows={2}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
      />
      {anular.error ? <ErrorDeCarga error={anular.error} className="mt-3" /> : null}
    </Modal>
  )
}
