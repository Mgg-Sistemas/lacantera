import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Check, Droplets, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { useMaquinaria } from '@/lib/api/maquinaria'
import {
  useDespacharCombustible,
  useDespachosCombustible,
  useMotivosDespacho,
  usePersonasParaVale,
  useTanques,
} from '@/lib/api/combustible'
import { useMisPermisos } from '@/lib/api/usuarios'
import { enPlural } from '@/lib/formato'
import { cn } from '@/lib/cn'

/*
  EL SURTIDOR, EN EL TELÉFONO.

  Christopher, 05/10/2026: «las vistas de teléfono de campo, empezando por el
  surtidor de combustible… es lo que convierte a La Cantera de app de
  escritorio en app de campo».

  Esta pantalla no inventa nada por detrás: llama al MISMO `despachar_combustible`
  que el escritorio, con las mismas reglas —tope de tres al día por máquina, el
  horómetro que no retrocede, quién recibió obligatorio—. Lo único que cambia es
  para quién está hecha: alguien de pie al lado del tanque, con el celular en una
  mano y la manguera en la otra.

  DE AHÍ SALEN TODAS LAS DECISIONES DE ESTA PANTALLA:

  - Un paso por pantalla. Primero el tanque, en botones grandes que dicen cuánto
    queda; después el vale. Nada de un formulario de catorce campos a la vez.
  - El dedo, no el ratón. Botones altos, teclado numérico en litros y horómetro,
    y lo accesorio —fecha, nota— plegado hasta que haga falta.
  - La mala señal se dice. En la mina el guardado tarda, y el reflejo de quien
    espera es volver a pulsar. A los doce segundos aparece el aviso de que ya
    quedó guardado y que no lo cargue otra vez.
  - Solo los últimos vales. En un teléfono nadie lee un libro mayor: se enseñan
    los últimos del día para confirmar que lo suyo entró, y punto.
  - Al guardar, el vale se puede pasar por WhatsApp. Es como se avisa en el
    patio, y es más rápido que imprimir.

  El PDF firmado sigue existiendo y se saca desde la pantalla de escritorio: en
  el teléfono estorba más de lo que ayuda.
*/

const TOPE_AL_DIA = 3
const SEGUNDOS_PARA_AVISAR_DE_LA_SEÑAL = 12

const litros = (valor: string | number, unidad = 'L'): string =>
  `${Number(valor).toLocaleString('es-VE', { maximumFractionDigits: 2 })} ${unidad}`

export function Surtidor() {
  const { puede } = useMisPermisos()
  const puedeDespachar = puede('COMBUSTIBLE', 'ESCRITURA')

  const tanques = useTanques()
  const [tanque, setTanque] = useState('')
  const [guardado, setGuardado] = useState<{ texto: string; litros: string } | null>(null)

  const conSaldo = (tanques.data ?? []).filter((t) => Number(t.existencia) > 0)
  const elegido = conSaldo.find((t) => `${t.almacen_id}|${t.articulo_id}` === tanque)

  // Con un solo tanque no se pregunta: se entra directo a surtir.
  useEffect(() => {
    if (tanque === '' && conSaldo.length === 1) {
      setTanque(`${conSaldo[0].almacen_id}|${conSaldo[0].articulo_id}`)
    }
  }, [conSaldo, tanque])

  if (tanques.isPending) return <Cargando />
  if (tanques.error) return <ErrorDeCarga error={tanques.error} />

  if (!puedeDespachar) {
    return (
      <p className="text-ink/60 mx-auto mt-10 max-w-sm text-center text-sm">
        Tu usuario puede ver el combustible, pero no despacharlo. Para surtir hace falta el permiso de
        escritura en Combustible.
      </p>
    )
  }

  if (guardado) {
    return <Listo texto={guardado.texto} cuanto={guardado.litros} onOtro={() => setGuardado(null)} />
  }

  if (conSaldo.length === 0) {
    return (
      <p className="text-ink/60 mx-auto mt-10 max-w-sm text-center text-sm">
        No hay combustible en ningún tanque. Hay que cargarlo antes de poder surtir.
      </p>
    )
  }

  if (!elegido) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="text-ink/85 font-titular text-xl">¿De qué tanque?</h1>
        <p className="text-ink/50 mt-1 text-sm">Toca el tanque del que vas a surtir.</p>
        <div className="mt-4 space-y-3">
          {conSaldo.map((t) => (
            <button
              key={`${t.almacen_id}|${t.articulo_id}`}
              type="button"
              onClick={() => setTanque(`${t.almacen_id}|${t.articulo_id}`)}
              className="border-hairline bg-surface hover:border-royal-600/40 active:bg-ink/5 flex w-full items-center justify-between gap-3 rounded-card border px-4 py-5 text-left transition-colors"
            >
              <span className="min-w-0">
                <span className="text-ink/85 block text-base font-medium">{t.almacen}</span>
                <span className="text-ink/50 block text-sm">{t.articulo}</span>
              </span>
              <span className="tabular text-ink/85 shrink-0 text-lg font-light">
                {litros(t.existencia, t.unidad)}
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <Vale
      tanque={elegido}
      onVolver={conSaldo.length > 1 ? () => setTanque('') : undefined}
      onGuardado={(texto, cuanto) => setGuardado({ texto, litros: cuanto })}
    />
  )
}

/* ──────────────────────────────────────────────────────────────── el vale */

function Vale({
  tanque,
  onVolver,
  onGuardado,
}: {
  tanque: { almacen_id: number; almacen: string; articulo_id: number; articulo: string; unidad: string; existencia: string }
  onVolver?: () => void
  onGuardado: (texto: string, cuanto: string) => void
}) {
  const despachar = useDespacharCombustible()
  const { data: maquinas } = useMaquinaria(true)
  const { data: personas } = usePersonasParaVale()
  const motivos = useMotivosDespacho()
  const { data: vales } = useDespachosCombustible()

  const hoy = new Date().toLocaleDateString('en-CA')
  const [cantidad, setCantidad] = useState('')
  const [maquina, setMaquina] = useState('')
  const [destino, setDestino] = useState('')
  const [horometro, setHorometro] = useState('')
  const [motivo, setMotivo] = useState('')
  const [detalle, setDetalle] = useState('')
  const [empleado, setEmpleado] = useState('')
  const [otroNombre, setOtroNombre] = useState('')
  const [masDatos, setMasDatos] = useState(false)
  const [dia, setDia] = useState(hoy)
  const [nota, setNota] = useState('')
  const [tarda, setTarda] = useState(false)

  /*
    EL AVISO DE MALA SEÑAL.

    En la mina el guardado tarda, y el reflejo del que espera es volver a
    pulsar: así es como salen dos vales del mismo gasoil. A los doce segundos
    se le dice que ya quedó guardado y que no lo repita.
  */
  useEffect(() => {
    if (!despachar.isPending) {
      setTarda(false)
      return
    }
    const t = setTimeout(() => setTarda(true), SEGUNDOS_PARA_AVISAR_DE_LA_SEÑAL * 1000)
    return () => clearTimeout(t)
  }, [despachar.isPending])

  const maquinasQuePueden = (maquinas ?? []).filter(
    (m) => !m.combustible_id || m.combustible_id === tanque.articulo_id,
  )
  const elMotivo = motivos.data?.find((m) => m.codigo === motivo)
  const pedidos = Number(cantidad)
  const sinFicha = maquina === ''

  // Las mismas reglas del escritorio, adelantadas aquí. La base las impone igual.
  const valesDeLaMaquina = useMemo(
    () => (maquina ? (vales ?? []).filter((v) => String(v.maquina_id ?? '') === maquina) : []),
    [vales, maquina],
  )
  const yaSurtidoHoy = valesDeLaMaquina.filter((v) => v.fecha === dia).length
  const topeAlcanzado = Boolean(maquina) && yaSurtidoHoy >= TOPE_AL_DIA
  const ultimoHorometro = valesDeLaMaquina
    .filter((v) => v.horometro != null && v.fecha <= dia)
    .map((v) => Number(v.horometro))
    .reduce<number | null>((alto, n) => (alto === null || n > alto ? n : alto), null)

  const excede = pedidos > Number(tanque.existencia)
  const faltaHorometro = Boolean(maquina) && horometro.trim() === ''
  const horometroRetrocede =
    Boolean(maquina) && horometro.trim() !== '' && ultimoHorometro !== null && Number(horometro) < ultimoHorometro
  const faltaDetalle = elMotivo?.exige_detalle === true && detalle.trim().length < 3
  const hayQuienRecibe = empleado !== '' || otroNombre.trim().length >= 3

  const valido =
    pedidos > 0 &&
    !excede &&
    motivo !== '' &&
    !faltaDetalle &&
    hayQuienRecibe &&
    !topeAlcanzado &&
    !faltaHorometro &&
    !horometroRetrocede &&
    (!sinFicha || destino.trim().length >= 3)

  const guardar = async () => {
    const nombreMaquina = sinFicha
      ? destino.trim()
      : (maquinasQuePueden.find((m) => String(m.id) === maquina)?.nombre ?? '')
    const quien = empleado
      ? (personas ?? []).find((p) => String(p.id) === empleado)?.nombre || ''
      : otroNombre.trim()

    await despachar.mutateAsync({
      articulo_id: tanque.articulo_id,
      almacen_id: tanque.almacen_id,
      cantidad: pedidos,
      motivo,
      motivo_detalle: elMotivo?.exige_detalle ? detalle.trim() : null,
      maquina_id: maquina ? Number(maquina) : null,
      destino: sinFicha ? destino.trim() : null,
      horometro: horometro ? Number(horometro) : null,
      empleado_id: empleado ? Number(empleado) : null,
      recibio_nombre: empleado ? null : otroNombre.trim(),
      recibio_cedula: null,
      fecha: dia,
      nota: nota.trim() || null,
    })

    onGuardado(
      [
        'Vale de combustible',
        `${litros(pedidos, tanque.unidad)} de ${tanque.articulo}`,
        `Tanque: ${tanque.almacen}`,
        `A: ${nombreMaquina}`,
        horometro ? `Horómetro: ${horometro}` : null,
        `Recibió: ${quien}`,
        `Motivo: ${elMotivo?.nombre ?? motivo}`,
        `Fecha: ${dia}`,
      ]
        .filter(Boolean)
        .join('\n'),
      litros(pedidos, tanque.unidad),
    )
  }

  return (
    <div className="mx-auto max-w-md pb-28">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-ink/85 font-titular truncate text-xl">{tanque.almacen}</h1>
          <p className="text-ink/50 text-sm">
            Quedan {litros(tanque.existencia, tanque.unidad)} de {tanque.articulo}
          </p>
        </div>
        {onVolver ? (
          <Button size="sm" variant="ghost" icon={<ArrowLeft />} onClick={onVolver}>
            Tanque
          </Button>
        ) : null}
      </div>

      <div className="mt-5 space-y-4">
        <Input
          label={`Cuántos ${enPlural(tanque.unidad) || 'litros'}`}
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          autoFocus
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          error={excede ? `En el tanque solo quedan ${litros(tanque.existencia, tanque.unidad)}` : undefined}
        />

        <SelectBuscable
          label="A qué máquina"
          vacio="No está en la ficha"
          valor={maquina}
          onCambio={setMaquina}
          opciones={maquinasQuePueden.map((m) => ({
            valor: String(m.id),
            codigo: m.codigo,
            nombre: m.nombre,
          }))}
        />

        {sinFicha ? (
          <Input
            label="A qué se le echó"
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            placeholder="La planta, una bomba, un camión de fuera…"
            hint="Sin ficha hay que decir a qué fue, o el vale no dice nada."
          />
        ) : (
          <Input
            label="Horómetro"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={horometro}
            onChange={(e) => setHorometro(e.target.value)}
            placeholder={ultimoHorometro !== null ? `Lo último: ${ultimoHorometro}` : 'Lo que marca el tablero'}
            error={horometroRetrocede ? `No puede ser menor que ${ultimoHorometro}` : undefined}
          />
        )}

        {topeAlcanzado ? (
          <p className="border-warning/30 bg-warning-soft text-ink/80 rounded-card border p-3 text-sm">
            Esa máquina ya tiene {TOPE_AL_DIA} vales hoy. Si de verdad hace falta otro, se carga desde la
            computadora.
          </p>
        ) : null}

        {/* El motivo en botones, no en un desplegable: es lo que más se toca. */}
        <div>
          <p className="text-ink/55 text-2xs mb-2 font-mono tracking-[0.16em] uppercase">Para qué</p>
          <div className="flex flex-wrap gap-2">
            {(motivos.data ?? []).map((m) => (
              <button
                key={m.codigo}
                type="button"
                onClick={() => setMotivo(m.codigo)}
                className={cn(
                  'rounded-full border px-4 py-2.5 text-sm transition-colors',
                  motivo === m.codigo
                    ? 'border-royal-600 bg-royal-600/10 text-royal-700'
                    : 'border-hairline text-ink/70 active:bg-ink/5',
                )}
              >
                {m.nombre}
              </button>
            ))}
          </div>
        </div>

        {elMotivo?.exige_detalle ? (
          <Input
            label="En pocas palabras"
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            placeholder={elMotivo.pista ?? 'Por qué'}
          />
        ) : null}

        <SelectBuscable
          label="Quién lo recibió"
          vacio="No está en la nómina"
          valor={empleado}
          onCambio={setEmpleado}
          opciones={(personas ?? []).map((p) => ({
            valor: String(p.id),
            etiqueta: p.cargo ? `${p.nombre} · ${p.cargo}` : p.nombre,
          }))}
        />

        {empleado === '' ? (
          <Input
            label="O escribe quién"
            value={otroNombre}
            onChange={(e) => setOtroNombre(e.target.value)}
            placeholder="Nombre de quien recibe"
            hint="Un vale sin nombre no se le puede preguntar a nadie."
          />
        ) : null}

        {/* Lo que casi nunca se toca, plegado: en el teléfono cada campo de más estorba. */}
        {masDatos ? (
          <>
            <Input label="Fecha" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
            <Textarea label="Nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setMasDatos(true)}
            className="text-ink/50 active:text-ink/80 text-sm underline decoration-dotted underline-offset-4"
          >
            Otro día o una nota
          </button>
        )}

        {despachar.error ? <ErrorDeCarga error={despachar.error} /> : null}

        {tarda ? (
          <p className="border-warning/30 bg-warning-soft text-ink/80 rounded-card border p-3 text-sm">
            Está tardando por la señal. <strong>El vale ya se está guardando: no lo cargues otra vez.</strong>
          </p>
        ) : null}
      </div>

      {/* El botón vive abajo, fijo, que es donde está el pulgar. */}
      <div className="bg-surface/95 border-hairline fixed inset-x-0 bottom-0 border-t p-4 backdrop-blur">
        <div className="mx-auto max-w-md">
          <Button
            className="w-full py-4 text-base"
            icon={<Droplets />}
            disabled={!valido || despachar.isPending}
            onClick={() => void guardar()}
          >
            {despachar.isPending ? 'Guardando…' : 'Surtir'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────── el acuse */

function Listo({ texto, cuanto, onOtro }: { texto: string; cuanto: string; onOtro: () => void }) {
  const compartir = async () => {
    // Compartir nativo donde lo hay; si no, WhatsApp, que es como se avisa aquí.
    if (navigator.share) {
      try {
        await navigator.share({ text: texto })
        return
      } catch {
        /* lo cerró: se cae a WhatsApp */
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
  }

  return (
    <div className="mx-auto max-w-md pt-6 text-center">
      <div className="bg-success/12 text-success mx-auto flex size-16 items-center justify-center rounded-full">
        <Check className="size-8" />
      </div>
      <h1 className="text-ink/85 font-titular mt-4 text-xl">Quedó anotado</h1>
      <p className="text-ink/60 mt-1 text-sm">Salieron {cuanto} del tanque.</p>

      <pre className="border-hairline bg-ink/2 text-ink/70 mt-5 rounded-card border p-3 text-left text-xs whitespace-pre-wrap">
        {texto}
      </pre>

      <div className="mt-5 space-y-3">
        <Button className="w-full py-3.5" variant="outline" icon={<Share2 />} onClick={() => void compartir()}>
          Pasarlo por WhatsApp
        </Button>
        <Button className="w-full py-3.5" icon={<Droplets />} onClick={onOtro}>
          Surtir otra vez
        </Button>
        <Link
          to="/app/combustible"
          className="text-ink/45 active:text-ink/80 block pt-1 text-sm underline decoration-dotted underline-offset-4"
        >
          Ver todo el combustible
        </Link>
      </div>
    </div>
  )
}
