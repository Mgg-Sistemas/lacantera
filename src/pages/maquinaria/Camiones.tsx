import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Building2, Trash2, Truck } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { SemaforoMantenimiento } from '@/components/SemaforoMantenimiento'
import { useMaquinaria } from '@/lib/api/maquinaria'
import { useEmpresa } from '@/lib/api/empresa'
import {
  TIPOS_VEHICULO,
  useEliminarVehiculo,
  useFijarCargaUtil,
  useGuardarVehiculo,
  useVehiculos,
} from '@/lib/api/vehiculos'
import type { Vehiculo } from '@/lib/api/vehiculos'
import { usePermisosDeCamion } from '@/lib/camiones'
import { cn } from '@/lib/cn'

function metros(valor: string | null): string {
  if (valor === null) return '—'
  return `${Number(valor).toLocaleString('es-VE', { maximumFractionDigits: 2 })} m³`
}

/** Las dos opciones de la lista de empresas que no son un nombre. */
const PROPIA = '__propia__'
const OTRA = '__otra__'

/** Un numérico de la base al texto del formulario. Llega como número: ver `ModalCamion`. */
const aTexto = (v: string | number | null | undefined): string => (v == null ? '' : String(v))

/**
 * Los camiones, debajo de las máquinas.
 *
 * VIVÍAN EN DESPACHOS, CON SU PROPIA PANTALLA
 *
 * Christopher, 16/09/2026: la maquinaria y los vehículos se llevan en una sola
 * pantalla, como en el otro sistema que ya usa. Son dos tablas y lo siguen
 * siendo —a los camiones les cuelgan los viajes, los pesajes, las guías y el
 * centro de costo—, pero se miran en un solo sitio, con un solo buscador.
 *
 * ESTO ES UN BLOQUE, NO UNA PANTALLA
 *
 * No trae cabecera, ni botón de alta, ni consulta propia: todo eso lo pone
 * Equipos, que es quien sabe qué se está buscando y qué filtro está puesto. Si
 * este bloque pidiera sus camiones por su cuenta, escribir una placa en el
 * buscador de arriba no le llegaría.
 *
 * LO PRIMERO DE CADA TARJETA ES CUÁNTO CARGA
 *
 * Es el dato por el que existe el catálogo. La placa identifica; la capacidad
 * es lo que se consulta.
 */
export function CamionesDeLaFlota({
  camiones,
  fueraDeServicio,
  verFueraDeServicio,
  onVerFueraDeServicio,
  puedeEditar,
  onEditar,
}: {
  camiones: Vehiculo[]
  /** Cuántos fuera de servicio quedaron escondidos por no haberlos pedido. */
  fueraDeServicio: number
  verFueraDeServicio: boolean
  onVerFueraDeServicio: (ver: boolean) => void
  puedeEditar: boolean
  onEditar: (v: Vehiculo) => void
}) {
  const propios = camiones.filter((v) => v.propio)
  const ajenos = camiones.filter((v) => !v.propio)

  return (
    <section id="camiones" className="mt-8 scroll-mt-6">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-ink/85 flex items-center gap-2 text-base font-semibold">
          <Truck className="text-ink/45 size-4" />
          Camiones
        </h2>
        <span className="text-ink/45 text-xs">
          {camiones.length === 1 ? '1 camión' : `${camiones.length} camiones`}
        </span>
        {fueraDeServicio > 0 || verFueraDeServicio ? (
          <button
            type="button"
            onClick={() => onVerFueraDeServicio(!verFueraDeServicio)}
            className="text-ink/55 hover:text-ink/80 ml-auto text-xs underline underline-offset-2"
          >
            {verFueraDeServicio
              ? 'Esconder los fuera de servicio'
              : `Ver los fuera de servicio (${fueraDeServicio})`}
          </button>
        ) : null}
      </div>

      {camiones.length === 0 ? (
        <p className="text-ink/45 text-sm">
          {fueraDeServicio > 0
            ? 'Los que coinciden están fuera de servicio.'
            : 'Ningún camión coincide con la búsqueda.'}
        </p>
      ) : null}

      {propios.length > 0 ? (
        <Grupo
          titulo="De la empresa"
          nota="Llevan horómetro y mantenimiento. El semáforo viene de su ficha de máquina."
          camiones={propios}
          puedeEditar={puedeEditar}
          onEditar={onEditar}
        />
      ) : null}

      {ajenos.length > 0 ? (
        <Grupo
          titulo="De transportistas"
          nota="No se les lleva mantenimiento: no son de la empresa. Van agrupados por la empresa a la que pertenecen, que es a quien se le paga el acarreo."
          camiones={ajenos}
          puedeEditar={puedeEditar}
          onEditar={onEditar}
          porEmpresa
        />
      ) : null}
    </section>
  )
}

/**
 * Un grupo de camiones.
 *
 * LOS AJENOS SE SUBDIVIDEN POR EMPRESA
 *
 * A quien se le paga el acarreo es a la empresa, no al camión, así que la
 * lista se lee como se lee el registro de pago: primero de quién son, después
 * cuáles. Es además la única forma de ver de un vistazo que la misma empresa
 * no quedó escrita de dos maneras — dos bloques con nombres parecidos saltan,
 * dos tarjetas sueltas no.
 *
 * No se mezclan con los dueños de las máquinas: el dueño de una máquina sale de
 * un catálogo (La Cantera, la gobernación) y el de un camión es el
 * transportista al que se le paga. No hay forma honrada de ponerlos bajo el
 * mismo encabezado.
 */
function Grupo({
  titulo,
  nota,
  camiones,
  puedeEditar,
  onEditar,
  porEmpresa = false,
}: {
  titulo: string
  nota: string
  camiones: Vehiculo[]
  puedeEditar: boolean
  onEditar: (v: Vehiculo) => void
  porEmpresa?: boolean
}) {
  const bloques = new Map<string | null, Vehiculo[]>()

  if (porEmpresa) {
    for (const v of camiones) {
      const empresa = v.transportista ?? 'Sin empresa'
      bloques.set(empresa, [...(bloques.get(empresa) ?? []), v])
    }
  } else {
    bloques.set(null, camiones)
  }

  const ordenados = [...bloques.entries()].sort(([a], [b]) =>
    a === null || b === null ? 0 : a.localeCompare(b, 'es'),
  )

  return (
    <div className="mb-6">
      <h3 className="text-ink/80 text-sm font-semibold">{titulo}</h3>
      <p className="text-ink/50 mt-0.5 mb-3 text-xs leading-relaxed">{nota}</p>

      {ordenados.map(([empresa, lista]) => (
        <div key={empresa ?? '·'} className={empresa === null ? '' : 'mb-4'}>
          {empresa === null ? null : (
            <h4 className="text-ink/70 mb-2 text-xs font-semibold tracking-wide uppercase">
              {empresa}
              <span className="text-ink/40 ml-2 font-normal normal-case">
                {lista.length === 1 ? '1 camión' : `${lista.length} camiones`}
              </span>
            </h4>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {lista.map((v) => (
              <TarjetaCamion key={v.id} camion={v} puedeEditar={puedeEditar} onEditar={onEditar} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * La tarjeta de un camión.
 *
 * DE QUIÉN ES VA EN PASTILLA, NO EN LETRA GRIS
 *
 * Estaba como una línea tenue debajo de la capacidad y no se veía. Es el dato
 * por el que se agrupa el pago del acarreo: quien revisa la flota necesita
 * verlo antes de leer nada más.
 */
function TarjetaCamion({
  camion: v,
  puedeEditar,
  onEditar,
}: {
  camion: Vehiculo
  puedeEditar: boolean
  onEditar: (v: Vehiculo) => void
}) {
  return (
    <Card className={cn('flex h-full flex-col', !v.activo && 'opacity-55')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ink/90 font-mono text-lg font-semibold tracking-[0.06em]">{v.placa}</p>
          <p className="text-ink/50 mt-0.5 truncate text-xs">
            {TIPOS_VEHICULO.find((t) => t.valor === v.tipo)?.etiqueta ?? v.tipo}
            {v.descripcion ? ` · ${v.descripcion}` : ''}
          </p>
        </div>
        {v.semaforo_mantenimiento ? (
          <SemaforoMantenimiento estado={v.semaforo_mantenimiento} />
        ) : null}
      </div>

      <div className="mt-2">
        <Chip
          tone={v.propio ? 'royal' : 'info'}
          icon={<Building2 />}
          title="Empresa a la que pertenece el camión"
        >
          {v.propio ? 'Flota propia' : (v.transportista ?? 'Sin empresa')}
        </Chip>
      </div>

      <p className="text-ink/85 mt-3 text-sm">
        Carga <span className="tabular font-semibold">{metros(v.capacidad_m3)}</span>
        {v.capacidad_ton ? (
          <span className="text-ink/50">
            {' '}
            · {Number(v.capacidad_ton).toLocaleString('es-VE')} TON
          </span>
        ) : null}
      </p>

      {/* Sin carga útil los viajes de este camión suman cero metros cúbicos,
          y eso no se ve por ningún lado hasta que alguien cuadra el día. */}
      {v.carga_util_m3 ? (
        <p className="text-ink/55 mt-1 text-xs">Trae {metros(v.carga_util_m3)} por viaje</p>
      ) : (
        <p className="text-warning mt-1 text-xs">Sin carga útil: sus viajes no suman m³</p>
      )}

      {/* Un camión propio enlazado sale también arriba, entre las máquinas: es
          dos cosas a la vez. Se dice aquí para que nadie crea que está repetido. */}
      {v.maquina_id ? (
        <p className="text-ink/45 mt-1 text-xs">
          También es la máquina{' '}
          <Link
            to={`/app/maquinaria/${v.maquina_id}`}
            className="hover:text-ink/75 underline underline-offset-2"
          >
            {v.maquina_codigo}
          </Link>
          {v.maquina ? ` · ${v.maquina}` : ''}
        </p>
      ) : null}
      {v.chofer_actual ? (
        <p className="text-ink/55 mt-1 text-xs">Lo maneja {v.chofer_actual}</p>
      ) : null}

      <div className="grow" />

      <div className="mt-3 flex items-center justify-between gap-2">
        {!v.activo ? <Chip tone="neutral">Fuera de servicio</Chip> : <span />}
        <div className="flex gap-1">
          <Link to={`/app/maquinaria/camiones/${v.id}`}>
            <Button size="sm" variant="soft">
              Ver ficha
            </Button>
          </Link>
          {puedeEditar ? (
            <Button size="sm" variant="ghost" onClick={() => onEditar(v)}>
              Editar
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  )
}

/**
 * Alta y corrección de un camión.
 *
 * LA CAPACIDAD EN TONELADAS SE DEJA VACÍA SI NADIE LA PESÓ
 *
 * Se podría deducir de los metros cúbicos multiplicando por una densidad, y
 * saldría un número redondo y falso: depende del material que lleve. Vacía, la
 * pantalla simplemente no la muestra. Deducida, alguien carga de más.
 *
 * LO QUE MUEVE DINERO SE VE, PERO NO SE TOCA SIN LA CASILLA
 *
 * Desde que los camiones viven en Maquinaria, quien lleva los equipos los da de
 * alta y les corrige la placa. Cambiarle a un camión que ya existe de quién es,
 * lo que le cabe o su ficha decide a quién se le pagan los viajes, y eso sigue
 * pidiendo la casilla de Despachos. Los campos quedan a la vista y apagados, con
 * la razón debajo: esconderlos haría creer que no existen.
 */
export function ModalCamion({
  abierto,
  vehiculo,
  onCerrar,
}: {
  abierto: boolean
  vehiculo: Vehiculo | null
  onCerrar: () => void
}) {
  const guardar = useGuardarVehiculo()
  const fijarCarga = useFijarCargaUtil()
  const eliminar = useEliminarVehiculo()
  const { data: maquinas } = useMaquinaria(true)
  const { data: flota } = useVehiculos(false)
  const { data: laEmpresa } = useEmpresa()
  const permisos = usePermisosDeCamion()
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false)

  // Al dar de alta no hay dinero en juego todavía: el camión no tiene viajes.
  const duenoBloqueado = vehiculo !== null && !permisos.cambiarDueno
  const RAZON_DUENO =
    'Cambiarlo decide a quién se le pagan sus viajes: pide la casilla «Dar de alta y corregir un vehículo».'

  /*
    LA EMPRESA SE ELIGE DE UNA LISTA, Y LA PROPIA VA PRIMERO.

    Era un campo de texto libre, y el registro de pago agrupa por ese texto
    exacto: «Transporte Peña», «TRANSPORTE PEÑA» y «Transporte Peña C.A.» son
    tres empresas distintas para la base, tres bloques en la pantalla de viajes
    y tres pagos donde hay uno. La lista sale de los vehículos ya cargados, así
    que no hace falta mantener un catálogo aparte para que deje de partirse.

    Y ESTÁ SIEMPRE A LA VISTA. Antes solo aparecía después de marcar «De un
    transportista», y el formulario arrancaba marcado «De la empresa»: así
    quedaron los seis primeros camiones, porque nadie cambió lo que ya venía
    puesto y nadie vio el campo. Ahora un camión nuevo empieza sin empresa y no
    se guarda hasta que alguien diga de quién es.
  */
  const [empresaElegida, setEmpresaElegida] = useState('')
  const propio = empresaElegida === PROPIA
  const otraEmpresa = empresaElegida === OTRA

  const empresas = [
    ...new Set(
      [...(flota ?? []).map((v) => v.transportista), vehiculo?.transportista].filter(
        (x): x is string => Boolean(x?.trim()),
      ),
    ),
  ].sort((a, b) => a.localeCompare(b, 'es'))

  const [f, setF] = useState({
    placa: '',
    tipo: 'VOLTEO',
    descripcion: '',
    capacidad_m3: '',
    capacidad_ton: '',
    carga_util_m3: '',
    transportista: '',
    maquina_id: '',
    activo: true,
    nota: '',
  })

  useEffect(() => {
    if (!abierto) return
    setConfirmandoBorrado(false)
    eliminar.reset()
    guardar.reset()
    fijarCarga.reset()
    setEmpresaElegida(
      vehiculo ? (vehiculo.propio ? PROPIA : (vehiculo.transportista ?? '')) : '',
    )
    setF({
      placa: vehiculo?.placa ?? '',
      tipo: vehiculo?.tipo ?? 'VOLTEO',
      descripcion: vehiculo?.descripcion ?? '',
      /*
        Los numéricos llegan de la base como número, aunque el tipo diga texto:
        PostgREST los manda como número en el JSON. El formulario trabaja en
        texto, y sin convertirlos el primer `.trim()` revienta y la ventana se
        queda en blanco. Es lo que pasaba al editar un camión con carga útil;
        los que no la tenían abrían bien porque les llegaba vacía.
      */
      capacidad_m3: aTexto(vehiculo?.capacidad_m3),
      capacidad_ton: aTexto(vehiculo?.capacidad_ton),
      carga_util_m3: aTexto(vehiculo?.carga_util_m3),
      transportista: '',
      maquina_id: vehiculo?.maquina_id ? String(vehiculo.maquina_id) : '',
      activo: vehiculo?.activo ?? true,
      nota: vehiculo?.nota ?? '',
    })
    // Las mutaciones cambian de identidad en cada render; reiniciarlas solo importa al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, vehiculo])

  const cambiar = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }))

  const cabe = Number(f.capacidad_m3)
  const cargaUtil = f.carga_util_m3.trim() === '' ? null : Number(f.carga_util_m3)
  const antes = vehiculo?.carga_util_m3 == null ? null : Number(vehiculo.carga_util_m3)

  // La base también lo comprueba. Aquí se comprueba para poder decirlo antes
  // de guardar, con el número delante.
  const errorCargaUtil =
    cargaUtil === null
      ? undefined
      : !(cargaUtil > 0)
        ? 'Tiene que ser mayor que cero.'
        : cabe > 0 && cargaUtil > cabe
          ? `No puede pasar de los ${cabe} m³ que le caben.`
          : undefined

  // Sin la casilla de la carga útil, lo que le quepa no puede quedar por debajo
  // de la que ya trae: la base lo rechazaría y quien edita no podría arreglarlo.
  const errorCapacidad =
    !permisos.cargaUtil && antes !== null && cabe > 0 && cabe < antes
      ? `Trae ${antes} m³ por viaje: lo que le cabe no puede quedar por debajo.`
      : undefined

  const nombreNuevo = f.transportista.trim()

  // La empresa nueva no puede ser una que ya está escrita con otras mayúsculas
  // o sin acento: sería justo la partición que la lista existe para evitar.
  const yaExiste = otraEmpresa
    ? empresas.find((e) => e.localeCompare(nombreNuevo, 'es', { sensitivity: 'base' }) === 0)
    : undefined

  const valido =
    f.placa.trim().length >= 4 &&
    cabe > 0 &&
    errorCargaUtil === undefined &&
    errorCapacidad === undefined &&
    empresaElegida !== '' &&
    (!otraEmpresa || (nombreNuevo.length > 0 && yaExiste === undefined))

  const enviar = async () => {
    const guardarCamion = () =>
      guardar.mutateAsync({
        ...(vehiculo ? { id: vehiculo.id } : {}),
        placa: f.placa.trim(),
        tipo: f.tipo,
        descripcion: f.descripcion.trim() || null,
        capacidad_m3: f.capacidad_m3,
        capacidad_ton: f.capacidad_ton || null,
        propio,
        transportista: propio ? null : otraEmpresa ? nombreNuevo : empresaElegida,
        maquina_id: propio && f.maquina_id ? Number(f.maquina_id) : null,
        activo: f.activo,
        nota: f.nota.trim() || null,
      } as never)

    /*
      La carga útil va en su propia llamada y solo si cambió.

      Es otra función en la base porque tiene que poder borrarse, y se salta
      cuando no cambió para no exigirle la casilla de fijarla a quien entró
      solo a corregir una placa.

      Y EL ORDEN IMPORTA. La base no deja que lo que le cabe quede por debajo de
      la carga útil. Si las dos bajan a la vez, primero baja la carga útil y
      después la capacidad; si suben, al revés. En un camión nuevo no hay
      orden que elegir: primero tiene que existir.
    */
    const cambiaCarga = cargaUtil !== antes
    const bajaPrimero =
      vehiculo !== null && cambiaCarga && (cargaUtil === null || (antes !== null && cargaUtil < antes))

    if (bajaPrimero) {
      await fijarCarga.mutateAsync({ vehiculo_id: vehiculo.id, carga_util: cargaUtil })
      await guardarCamion()
    } else {
      const id = await guardarCamion()
      if (cambiaCarga) {
        await fijarCarga.mutateAsync({ vehiculo_id: Number(id), carga_util: cargaUtil })
      }
    }

    onCerrar()
  }

  // Las máquinas que se pueden enlazar: solo las que ruedan.
  const rodantes = (maquinas ?? []).filter((m) => m.tipo === 'CAMION' || m.tipo === 'VEHICULO')

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={vehiculo ? `Editar ${vehiculo.placa}` : 'Nuevo camión'}
      descripcion="La placa se guarda en mayúsculas y sin espacios: es un identificador, no un texto libre."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            onClick={() => void enviar().catch(() => {})}
            disabled={!valido || guardar.isPending || fijarCarga.isPending}
          >
            {guardar.isPending || fijarCarga.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Placa"
          placeholder="A12BC3D"
          value={f.placa}
          onChange={(e) => cambiar('placa', e.target.value)}
        />
        <Select
          label="Tipo"
          value={f.tipo}
          onChange={(e) => cambiar('tipo', e.target.value)}
          opciones={TIPOS_VEHICULO}
        />
        <div className="sm:col-span-2">
          <Input
            label="Descripción"
            placeholder="Volteo Toronto del patio"
            value={f.descripcion}
            onChange={(e) => cambiar('descripcion', e.target.value)}
          />
        </div>
      </div>

      <h3 className="text-ink/85 mt-6 mb-1 text-sm font-semibold">De quién es</h3>
      <p className="text-ink/50 mb-3 text-xs leading-relaxed">
        La empresa es a quien se le paga el acarreo: los viajes de este camión se agrupan por ella
        en el registro de pago.
      </p>

      <div className="grid gap-4">
        <Select
          label="Empresa a la que pertenece"
          vacio="Elige la empresa"
          value={empresaElegida}
          disabled={duenoBloqueado}
          onChange={(e) => {
            setEmpresaElegida(e.target.value)
            cambiar('transportista', '')
          }}
          opciones={[
            {
              valor: PROPIA,
              etiqueta: `${laEmpresa?.razon_social || 'La empresa'} · flota propia`,
            },
            ...empresas.map((x) => ({ valor: x, etiqueta: x })),
            { valor: OTRA, etiqueta: 'Otra empresa…' },
          ]}
          hint={
            duenoBloqueado
              ? RAZON_DUENO
              : empresaElegida === ''
                ? 'Hace falta para guardar.'
                : propio
                  ? 'Se le lleva horómetro y mantenimiento.'
                  : 'Se elige de las ya cargadas para que la misma empresa no quede escrita de dos maneras.'
          }
        />

        {otraEmpresa ? (
          <Input
            label="Nombre de la empresa nueva"
            placeholder="Nombre de la empresa o del dueño"
            value={f.transportista}
            onChange={(e) => cambiar('transportista', e.target.value)}
            error={yaExiste ? `Ya está cargada como «${yaExiste}»: elígela de la lista.` : undefined}
          />
        ) : null}

        {propio ? (
          <Select
            label="Ficha de máquina"
            vacio="Sin enlazar"
            value={f.maquina_id}
            disabled={duenoBloqueado}
            onChange={(e) => cambiar('maquina_id', e.target.value)}
            opciones={rodantes.map((m) => ({
              valor: String(m.id),
              etiqueta: `${m.codigo} · ${m.nombre}`,
            }))}
            hint={
              duenoBloqueado
                ? RAZON_DUENO
                : 'Enlazarlo hace que el semáforo de mantenimiento se vea aquí y al momento de despachar.'
            }
          />
        ) : null}
      </div>

      <h3 className="text-ink/85 mt-6 mb-1 text-sm font-semibold">Cuánto carga</h3>
      <p className="text-ink/50 mb-3 text-xs leading-relaxed">
        Los metros cúbicos son obligatorios: es la medida con la que se despacha hoy. Las toneladas
        quedan vacías hasta que alguien las pese — deducirlas de los metros cúbicos da un número
        distinto según el material.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Metros cúbicos"
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          placeholder="18"
          value={f.capacidad_m3}
          disabled={duenoBloqueado}
          onChange={(e) => cambiar('capacidad_m3', e.target.value)}
          error={errorCapacidad}
          hint={duenoBloqueado ? 'Es el tope de metros de cada viaje: pide la misma casilla.' : undefined}
        />
        <Input
          label="Toneladas"
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          placeholder="Si se pesó"
          value={f.capacidad_ton}
          onChange={(e) => cambiar('capacidad_ton', e.target.value)}
        />

        <div className="sm:col-span-2">
          <Input
            label="Carga útil en m³"
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            placeholder="Vacía mientras nadie la mida"
            value={f.carga_util_m3}
            disabled={!permisos.cargaUtil}
            onChange={(e) => cambiar('carga_util_m3', e.target.value)}
            error={errorCargaUtil}
            hint={
              permisos.cargaUtil
                ? 'Lo que de verdad baja de la mina en cada viaje, que los supervisores miden por paladas. Siempre va por debajo de la capacidad. De aquí salen los metros cúbicos de los viajes de camiones: sin ella esos viajes cuentan y cobran, pero suman cero.'
                : 'De aquí salen los metros cúbicos de los viajes y el costo por m³: la pone quien tiene la casilla «Poner la carga útil de un camión».'
            }
          />
        </div>
      </div>

      <div className="mt-4">
        <Textarea
          label="Nota"
          rows={2}
          value={f.nota}
          onChange={(e) => cambiar('nota', e.target.value)}
        />
      </div>

      {vehiculo ? (
        <label className="text-ink/70 mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={f.activo}
            onChange={(e) => cambiar('activo', e.target.checked)}
            className="accent-royal-600 size-4"
          />
          En servicio
        </label>
      ) : null}

      {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-3" /> : null}
      {/* Si esto falla, lo otro puede haber quedado guardado: la carga útil va aparte. */}
      {fijarCarga.error ? <ErrorDeCarga error={fijarCarga.error} className="mt-3" /> : null}

      {/*
        Eliminar va separado y abajo, con su propia confirmación: es lo único
        del formulario que no se deshace. Solo sale al editar y a quien tiene la
        casilla, que viene con Total.
      */}
      {vehiculo && permisos.eliminar ? (
        <div className="border-hairline mt-6 border-t pt-4">
          {confirmandoBorrado ? (
            <div className="rounded-card border-danger/30 bg-danger/5 border p-3">
              <p className="text-ink/85 text-sm font-medium">¿Eliminar {vehiculo.placa}?</p>
              <p className="text-ink/60 mt-1 text-xs leading-relaxed">
                Es para un camión cargado por error. Si ya hizo viajes, pesajes o guías no se va a
                poder, y lo que corresponde es desmarcar «En servicio»: deja de ofrecerse y lo
                registrado sigue cuadrando.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  disabled={eliminar.isPending}
                  onClick={() =>
                    void eliminar
                      .mutateAsync({ id: vehiculo.id })
                      .then(onCerrar)
                      .catch(() => {})
                  }
                >
                  {eliminar.isPending ? 'Eliminando…' : 'Sí, eliminar'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setConfirmandoBorrado(false)
                    eliminar.reset()
                  }}
                >
                  No eliminar
                </Button>
              </div>
              {eliminar.error ? <ErrorDeCarga error={eliminar.error} className="mt-3" /> : null}
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger"
              icon={<Trash2 />}
              onClick={() => setConfirmandoBorrado(true)}
            >
              Eliminar camión
            </Button>
          )}
        </div>
      ) : null}
    </Modal>
  )
}
