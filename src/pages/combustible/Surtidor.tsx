import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Check, Droplets, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { Modal } from '@/components/ui/Modal'
import { ElegirArchivosDeCarga, FotosDeCarga } from '@/components/FotosDeCarga'
import { ModalCargarCombustible } from './ModalCargarCombustible'
import { ModalTraslado } from '../inventario/ModalTraslado'
import { subirFotosDeCarga } from '@/lib/api/fotosDeCarga'
import { useMaquinaria } from '@/lib/api/maquinaria'
import {
  numeroDeDespacho,
  useAnularDespacho,
  useCorregirDespacho,
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

/** Lo que el formulario tenía al guardar: con esto se precarga la corrección. */
interface ValoresDelVale {
  cantidad: string
  maquina: string
  destino: string
  horometro: string
  motivo: string
  detalle: string
  empleado: string
  otroNombre: string
  dia: string
  nota: string
}

interface ValeGuardado {
  texto: string
  litros: string
  /** El número del vale, para colgarle fotos y para el acuse. */
  numero: string | null
  /** Si las fotos no subieron por la señal, aquí se dice. */
  avisoFotos: string | null
  id: number
  valores: ValoresDelVale
}

const litros = (valor: string | number, unidad = 'L'): string =>
  `${Number(valor).toLocaleString('es-VE', { maximumFractionDigits: 2 })} ${unidad}`

export function Surtidor() {
  const { puede } = useMisPermisos()
  const puedeDespachar = puede('COMBUSTIBLE', 'ESCRITURA')
  /*
    ENTRADA Y TRASLADO, SOLO PARA QUIEN YA PUEDE (05/10/2026). En Golden el
    surtidor móvil también registra entradas y pasa combustible de tanque;
    aquí esas operaciones son del almacén —`registrar_entrada` exige ese rol—
    así que se ofrecen en el teléfono únicamente a quien ya las puede hacer
    en el escritorio. No se abre ningún permiso: se acerca la puerta.
  */
  const puedeAlmacen = puede('INVENTARIO', 'ESCRITURA')

  const tanques = useTanques()
  const [tanque, setTanque] = useState('')
  const [guardado, setGuardado] = useState<ValeGuardado | null>(null)
  /** Volver al formulario con el vale puesto, para corregirlo. */
  const [corrigiendo, setCorrigiendo] = useState(false)
  const [entrando, setEntrando] = useState(false)
  const [trasladando, setTrasladando] = useState(false)

  const conSaldo = (tanques.data ?? []).filter((t) => Number(t.existencia) > 0)
  const elegido = conSaldo.find((t) => `${t.almacen_id}|${t.articulo_id}` === tanque)

  // Con un solo tanque no se pregunta: se entra directo a surtir. Salvo a
  // quien también opera el almacén, que necesita la pantalla del tanque para
  // llegar a la entrada y al traslado.
  useEffect(() => {
    if (tanque === '' && conSaldo.length === 1 && !puedeAlmacen) {
      setTanque(`${conSaldo[0].almacen_id}|${conSaldo[0].articulo_id}`)
    }
  }, [conSaldo, tanque, puedeAlmacen])

  if (tanques.isPending) return <Cargando />
  if (tanques.error) return <ErrorDeCarga error={tanques.error} />

  if (!puedeDespachar) {
    return (
      <p className="text-ink/60 mx-auto mt-10 max-w-sm text-center text-sm">
        Su usuario puede ver el combustible, pero no despacharlo. Para surtir hace falta el permiso de
        escritura en Combustible.
      </p>
    )
  }

  // La corrección vuelve al mismo formulario con el vale puesto. El tanque se
  // busca entre TODOS —no solo los con saldo—, porque el del vale cuenta
  // aunque hoy marque cero: el reverso le devuelve lo suyo antes de la salida.
  if (guardado && corrigiendo) {
    const delVale = (tanques.data ?? []).find(
      (t) => `${t.almacen_id}|${t.articulo_id}` === tanque,
    )
    if (delVale) {
      return (
        <Vale
          tanque={delVale}
          correccion={{ id: guardado.id, numero: guardado.numero, valores: guardado.valores }}
          onVolver={() => setCorrigiendo(false)}
          onGuardado={(g) => {
            setGuardado(g)
            setCorrigiendo(false)
          }}
        />
      )
    }
    // Sin el tanque a la vista no hay formulario: se cae al acuse de abajo.
  }

  if (guardado) {
    return (
      <Listo
        texto={guardado.texto}
        cuanto={guardado.litros}
        numero={guardado.numero}
        avisoFotos={guardado.avisoFotos}
        id={guardado.id}
        onCorregir={() => setCorrigiendo(true)}
        onOtro={() => {
          setGuardado(null)
          setCorrigiendo(false)
        }}
      />
    )
  }

  /*
    LA ENTRADA Y EL TRASLADO, DESDE EL TELÉFONO (05/10/2026). Reutilizan los
    MISMOS modales del escritorio —cargar a mano y el traslado de
    inventario—, así que las reglas y los permisos son idénticos. Solo los
    ve quien opera el almacén; al bombero no se le ofrece lo que la base le
    va a negar.
  */
  const operacionesDeAlmacen = puedeAlmacen ? (
    <>
      <div className="border-hairline mt-6 border-t pt-4">
        <p className="text-ink/55 text-2xs mb-2 font-mono tracking-[0.16em] uppercase">
          Otras operaciones
        </p>
        <div className="flex gap-3">
          <Button className="flex-1" variant="outline" onClick={() => setEntrando(true)}>
            Entrada de combustible
          </Button>
          <Button className="flex-1" variant="outline" onClick={() => setTrasladando(true)}>
            Pasar de sitio
          </Button>
        </div>
      </div>
      <ModalCargarCombustible abierto={entrando} onCerrar={() => setEntrando(false)} />
      <ModalTraslado
        abierto={trasladando}
        onCerrar={() => setTrasladando(false)}
        origen={elegido?.almacen}
      />
    </>
  ) : null

  if (conSaldo.length === 0) {
    return (
      <div className="mx-auto max-w-md">
        <p className="text-ink/60 mt-10 text-center text-sm">
          Sin combustible en los tanques. Debe cargarse antes de surtir.
        </p>
        {operacionesDeAlmacen}
      </div>
    )
  }

  if (!elegido) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="text-ink/85 font-titular text-xl">¿De qué tanque?</h1>
        <p className="text-ink/50 mt-1 text-sm">Toque el tanque del que va a surtir.</p>
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
        {operacionesDeAlmacen}
      </div>
    )
  }

  /*
    EL BOTÓN DE VOLVER EXISTE SIEMPRE QUE HAYA ADÓNDE VOLVER. Antes solo
    salía con más de un tanque, y estaba bien: con uno solo, la pantalla de
    selección se saltaba y no había atrás. Pero quien opera el almacén SÍ
    pasa por esa pantalla aunque haya un solo tanque —ahí viven la entrada y
    el traslado— y entraba al vale sin poder regresar (Christopher lo
    encontró el 05/10/2026). El único caso sin botón sigue siendo el bombero
    con un solo tanque, que nunca vio otra pantalla.
  */
  return (
    <Vale
      tanque={elegido}
      onVolver={conSaldo.length > 1 || puedeAlmacen ? () => setTanque('') : undefined}
      onGuardado={(g) => setGuardado(g)}
    />
  )
}

/* ──────────────────────────────────────────────────────────────── el vale */

function Vale({
  tanque,
  correccion,
  onVolver,
  onGuardado,
}: {
  tanque: { almacen_id: number; almacen: string; articulo_id: number; articulo: string; unidad: string; existencia: string }
  /** Con esto puesto, el formulario corrige ese vale en vez de crear uno. */
  correccion?: { id: number; numero: string | null; valores: ValoresDelVale }
  onVolver?: () => void
  onGuardado: (g: ValeGuardado) => void
}) {
  const despachar = useDespacharCombustible()
  const corregir = useCorregirDespacho()
  const { data: maquinas } = useMaquinaria(true)
  const { data: personas } = usePersonasParaVale()
  const motivos = useMotivosDespacho()
  const { data: vales } = useDespachosCombustible()

  const hoy = new Date().toLocaleDateString('en-CA')
  const v0 = correccion?.valores
  const [cantidad, setCantidad] = useState(v0?.cantidad ?? '')
  const [maquina, setMaquina] = useState(v0?.maquina ?? '')
  const [destino, setDestino] = useState(v0?.destino ?? '')
  const [horometro, setHorometro] = useState(v0?.horometro ?? '')
  const [motivo, setMotivo] = useState(v0?.motivo ?? '')
  const [detalle, setDetalle] = useState(v0?.detalle ?? '')
  const [empleado, setEmpleado] = useState(v0?.empleado ?? '')
  const [otroNombre, setOtroNombre] = useState(v0?.otroNombre ?? '')
  const [masDatos, setMasDatos] = useState(false)
  const [dia, setDia] = useState(v0?.dia ?? hoy)
  const [nota, setNota] = useState(v0?.nota ?? '')
  const [tarda, setTarda] = useState(false)
  /** Las fotos del despacho, tomadas antes de guardar. Se suben DESPUÉS de
      que el vale quede guardado: si la señal se las come, el vale no se pierde. */
  const [archivos, setArchivos] = useState<File[]>([])

  /*
    EL AVISO DE MALA SEÑAL.

    En la mina el guardado tarda, y el reflejo del que espera es volver a
    pulsar: así es como salen dos vales del mismo gasoil. A los doce segundos
    se le dice que ya quedó guardado y que no lo repita.
  */
  const guardando = despachar.isPending || corregir.isPending
  useEffect(() => {
    if (!guardando) {
      setTarda(false)
      return
    }
    const t = setTimeout(() => setTarda(true), SEGUNDOS_PARA_AVISAR_DE_LA_SEÑAL * 1000)
    return () => clearTimeout(t)
  }, [guardando])

  const maquinasQuePueden = (maquinas ?? []).filter(
    (m) => !m.combustible_id || m.combustible_id === tanque.articulo_id,
  )
  const elMotivo = motivos.data?.find((m) => m.codigo === motivo)
  const pedidos = Number(cantidad)
  const sinFicha = maquina === ''

  // Las mismas reglas del escritorio, adelantadas aquí. La base las impone igual.
  // Los anulados no atan, y el vale que se corrige no se cuenta a sí mismo.
  const valesDeLaMaquina = useMemo(
    () =>
      maquina
        ? (vales ?? []).filter(
            (v) =>
              String(v.maquina_id ?? '') === maquina &&
              !v.anulado_en &&
              v.id !== correccion?.id,
          )
        : [],
    [vales, maquina, correccion?.id],
  )
  const yaSurtidoHoy = valesDeLaMaquina.filter((v) => v.fecha === dia).length
  const topeAlcanzado = Boolean(maquina) && yaSurtidoHoy >= TOPE_AL_DIA
  const ultimoHorometro = valesDeLaMaquina
    .filter((v) => v.horometro != null && v.fecha <= dia)
    .map((v) => Number(v.horometro))
    .reduce<number | null>((alto, n) => (alto === null || n > alto ? n : alto), null)

  // Al corregir, lo que este vale ya sacó vuelve antes de la salida nueva.
  const devuelve = correccion ? Number(correccion.valores.cantidad) || 0 : 0
  const excede = pedidos > Number(tanque.existencia) + devuelve
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

    const valores: ValoresDelVale = {
      cantidad: String(pedidos),
      maquina,
      destino,
      horometro,
      motivo,
      detalle,
      empleado,
      otroNombre,
      dia,
      nota,
    }
    const armarTexto = (numero: string | null, corregido: boolean) =>
      [
        numero ? `Vale ${numero}${corregido ? ' (corregido)' : ''}` : 'Vale de combustible',
        `${litros(pedidos, tanque.unidad)} de ${tanque.articulo}`,
        `Tanque: ${tanque.almacen}`,
        `A: ${nombreMaquina}`,
        horometro ? `Horómetro: ${horometro}` : null,
        `Recibió: ${quien}`,
        `Motivo: ${elMotivo?.nombre ?? motivo}`,
        `Fecha: ${dia}`,
      ]
        .filter(Boolean)
        .join('\n')

    const comun = {
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
    }

    /*
      LA CORRECCIÓN NO CREA OTRO VALE: mismo número, números nuevos, y el
      inventario cuenta el cambio con reverso y salida nueva si hizo falta.
    */
    if (correccion) {
      await corregir.mutateAsync({ id: correccion.id, ...comun })
      onGuardado({
        texto: armarTexto(correccion.numero, true),
        litros: litros(pedidos, tanque.unidad),
        numero: correccion.numero,
        avisoFotos: null,
        id: correccion.id,
        valores,
      })
      return
    }

    const id = await despachar.mutateAsync({
      articulo_id: tanque.articulo_id,
      almacen_id: tanque.almacen_id,
      ...comun,
    })

    /*
      LAS FOTOS VAN DESPUÉS DEL VALE, A PROPÓSITO.

      El vale es el registro que no se puede perder; las fotos son su
      respaldo. Si la señal se cae a mitad de la subida, el vale ya quedó
      guardado y el acuse dice que las fotos faltan y dónde reintentarlas.
      Al revés —fotos primero— una caída dejaría fotos huérfanas y el
      combustible sin descontar.
    */
    let numero: string | null = null
    let avisoFotos: string | null = null
    try {
      numero = await numeroDeDespacho(id)
    } catch {
      /* sin número no hay dónde colgar las fotos; se avisa abajo */
    }
    if (archivos.length > 0) {
      if (numero) {
        try {
          await subirFotosDeCarga('COMBUSTIBLE', [numero], archivos)
        } catch {
          avisoFotos =
            'El vale quedó guardado, pero las fotos no subieron por la señal. Añádalas aquí abajo cuando mejore.'
        }
      } else {
        avisoFotos =
          'El vale quedó guardado, pero no se pudo confirmar su número para colgarle las fotos. Añádalas desde la computadora.'
      }
    }

    onGuardado({
      texto: armarTexto(numero, false),
      litros: litros(pedidos, tanque.unidad),
      numero,
      avisoFotos,
      id,
      valores,
    })
  }

  return (
    <div className="mx-auto max-w-md pb-28">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-ink/85 font-titular truncate text-xl">
            {correccion ? `Corregir ${correccion.numero ?? 'el vale'}` : tanque.almacen}
          </h1>
          <p className="text-ink/50 text-sm">
            {correccion
              ? `Mismo número, números nuevos. Tanque: ${tanque.almacen}.`
              : `Quedan ${litros(tanque.existencia, tanque.unidad)} de ${tanque.articulo}`}
          </p>
        </div>
        {onVolver ? (
          <Button size="sm" variant="ghost" icon={<ArrowLeft />} onClick={onVolver}>
            {correccion ? 'Volver' : 'Tanque'}
          </Button>
        ) : null}
      </div>

      <div className="mt-5 space-y-4">
        <Input
          label={`Cantidad (${enPlural(tanque.unidad) || 'litros'})`}
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
          label="Máquina"
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
            label="Destino"
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
          <p className="text-ink/55 text-2xs mb-2 font-mono tracking-[0.16em] uppercase">Uso</p>
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
            label="Detalle del uso"
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            placeholder={elMotivo.pista ?? 'Por qué'}
          />
        ) : null}

        <SelectBuscable
          label="Receptor"
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
            label="Nombre del receptor"
            value={otroNombre}
            onChange={(e) => setOtroNombre(e.target.value)}
            placeholder="Nombre de quien recibe"
            hint="Un vale sin nombre no se le puede preguntar a nadie."
          />
        ) : null}

        {/* Las fotos del despacho: el tablero con el horómetro, la máquina
            recibiendo. En el teléfono el botón abre la cámara directo. Se
            suben cuando el vale ya quedó guardado, para que la señal no se
            lleve el registro por delante. Al corregir no se piden: las del
            vale ya están colgadas y se manejan desde el acuse. */}
        {!correccion ? (
          <div>
            <p className="text-ink/55 text-2xs mb-2 font-mono tracking-[0.16em] uppercase">
              Fotos del despacho
            </p>
            <ElegirArchivosDeCarga archivos={archivos} onCambiar={setArchivos} />
          </div>
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
        {corregir.error ? <ErrorDeCarga error={corregir.error} /> : null}

        {tarda ? (
          <p className="border-warning/30 bg-warning-soft text-ink/80 rounded-card border p-3 text-sm">
            Está tardando por la señal. <strong>El vale ya se está guardando: no lo cargue otra vez.</strong>
          </p>
        ) : null}
      </div>

      {/* El botón vive abajo, fijo, que es donde está el pulgar. */}
      <div className="bg-surface/95 border-hairline fixed inset-x-0 bottom-0 border-t p-4 backdrop-blur">
        <div className="mx-auto max-w-md">
          <Button
            className="w-full py-4 text-base"
            icon={<Droplets />}
            disabled={!valido || guardando}
            onClick={() => void guardar()}
          >
            {guardando ? 'Guardando…' : correccion ? 'Guardar la corrección' : 'Surtir'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────── el acuse */

function Listo({
  texto,
  cuanto,
  numero,
  avisoFotos,
  id,
  onCorregir,
  onOtro,
}: {
  texto: string
  cuanto: string
  numero: string | null
  avisoFotos: string | null
  id: number
  onCorregir: () => void
  onOtro: () => void
}) {
  /*
    CORREGIR Y ANULAR, TAMBIÉN DESDE EL TELÉFONO (05/10/2026). En Golden el
    bombero borra desde el teléfono; aquí corrige con rastro o anula con
    motivo, y el combustible vuelve con un reverso. Solo sobre el vale que
    acaba de emitir, que es donde se descubre el error; los de antes se
    tocan desde la computadora.
  */
  const anular = useAnularDespacho()
  const [anulando, setAnulando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [anulado, setAnulado] = useState(false)

  if (anulado) {
    return (
      <div className="mx-auto max-w-md pt-6 text-center">
        <div className="bg-danger/10 text-danger mx-auto flex size-16 items-center justify-center rounded-full">
          <Check className="size-8" />
        </div>
        <h1 className="text-ink/85 font-titular mt-4 text-xl">Vale anulado</h1>
        <p className="text-ink/60 mt-1 text-sm">
          {cuanto} volvieron al tanque con un reverso. El vale queda a la vista con su motivo.
        </p>
        <div className="mt-6">
          <Button className="w-full py-3.5" icon={<Droplets />} onClick={onOtro}>
            Surtir otra vez
          </Button>
        </div>
      </div>
    )
  }
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

      {avisoFotos ? (
        <p className="border-warning/30 bg-warning-soft text-ink/80 rounded-card mt-4 border p-3 text-left text-sm">
          {avisoFotos}
        </p>
      ) : null}

      {/* Las fotos del vale: las que subieron se ven, y desde aquí mismo se
          añaden las que falten — es el reintento natural cuando la señal se
          comió la subida. */}
      {numero ? (
        <div className="mt-5 text-left">
          <p className="text-ink/55 text-2xs mb-2 font-mono tracking-[0.16em] uppercase">
            Fotos del vale {numero}
          </p>
          {/* Quien llegó a este acuse despachó, así que puede añadir. */}
          <FotosDeCarga origen="COMBUSTIBLE" referencia={numero} puedeAnadir />
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        <Button className="w-full py-3.5" variant="outline" icon={<Share2 />} onClick={() => void compartir()}>
          Pasarlo por WhatsApp
        </Button>
        <Button className="w-full py-3.5" icon={<Droplets />} onClick={onOtro}>
          Surtir otra vez
        </Button>
        {/* El error se descubre leyendo el acuse: por eso el arreglo vive aquí. */}
        <div className="flex gap-3">
          <Button className="flex-1 py-3" variant="outline" onClick={onCorregir}>
            Corregir este vale
          </Button>
          <Button
            className="text-danger border-danger/30 flex-1 py-3"
            variant="outline"
            onClick={() => {
              setMotivo('')
              setAnulando(true)
            }}
          >
            Anular
          </Button>
        </div>
        <Link
          to="/app/combustible"
          className="text-ink/45 active:text-ink/80 block pt-1 text-sm underline decoration-dotted underline-offset-4"
        >
          Ver todo el combustible
        </Link>
      </div>

      <Modal
        abierto={anulando}
        onCerrar={() => setAnulando(false)}
        titulo={`Anular ${numero ?? 'el vale'}`}
        descripcion="El combustible vuelve al tanque con un reverso a la vista. El vale queda con su motivo."
        acciones={
          <>
            <Button variant="ghost" onClick={() => setAnulando(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={motivo.trim().length < 3 || anular.isPending}
              onClick={() =>
                anular.mutate(
                  { id, motivo: motivo.trim() },
                  {
                    onSuccess: () => {
                      setAnulando(false)
                      setAnulado(true)
                    },
                  },
                )
              }
            >
              {anular.isPending ? 'Anulando…' : 'Anular'}
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
    </div>
  )
}
