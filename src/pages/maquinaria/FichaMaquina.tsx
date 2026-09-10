import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Save, ToggleLeft } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EncuadreFoto } from '@/components/EncuadreFoto'
import { Card, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useAlmacenes, usePropietarios } from '@/lib/api/inventario'
import { useEmpleados } from '@/lib/api/nomina'
import { DeQuienEs } from '@/components/DeQuienEs'
import { detalleDeDueno } from '@/lib/deQuien'
import { FotosDeLaMaquina, FOTOS_MINIMAS } from '@/components/FotosDeLaMaquina'
import { QueLlevaEncima } from './QueLlevaEncima'
import { cn } from '@/lib/cn'
import { useCombustibles } from '@/lib/api/combustible'
import {
  ETIQUETA_ESTADO,
  ESTADOS_MAQUINA,
  CLASES_DE_MAQUINA,
  TIPOS_MAQUINA,
  useFotoMaquina,
  useGuardarEncuadreMaquina,
  useGuardarMaquina,
  useSubirFotosDeAlta,
  useMaquinaria,
  useQuitarFotoMaquina,
  useHistorialMaquina,
  useSubirFotoMaquina,
} from '@/lib/api/maquinaria'
import { useMisPermisos } from '@/lib/api/usuarios'
import { Historial } from '@/components/Historial'
import { ModalEstado } from './ModalEstado'

/*
  LA FICHA DE UNA MÁQUINA

  La líder: «no usar el formulario en el modal, y permitir subir una imagen
  referencial de la máquina».

  POR QUÉ EL MODAL NO DABA MÁS DE SÍ

  Eran catorce campos en una caja con desplazamiento propio: en la captura que
  mandó Christopher, «Dónde vive» quedaba cortado por el borde inferior. Y un
  modal no puede alojar una foto —hace falta sitio para verla y para
  encuadrarla— sin convertirse en una ventana dentro de otra.

  Es el mismo camino que ya hizo la ficha del trabajador, y por los mismos
  motivos: una pantalla tiene dirección propia, botón de atrás y se puede pasar
  por enlace. Un modal largo no gana nada por serlo.

  LA FOTO SOLO APARECE CUANDO LA MÁQUINA EXISTE

  El archivo se guarda en una carpeta con el número de la máquina, así que hasta
  que no hay número no hay dónde ponerlo. En vez de esconder eso, se dice: la
  tarjeta está desde el principio y explica que primero se guarda. Es la misma
  restricción que tiene la foto del personal.

  «GUARDAR Y CREAR OTRA»

  Hoy hay cero máquinas cargadas y hay que meter la flota entera. Volver a la
  lista y pulsar «Nueva» entre equipo y equipo son dos clics de más por máquina,
  y son los que hacen que alguien deje la carga a medias.
*/

const vacio = {
  codigo: '',
  nombre: '',
  tipo: 'OTRO',
  propietario: 'LACANTERA',
  clase: 'MAQUINA',
  operador_id: '',
  // La respuesta segura: ver el comentario de ESTADOS_MAQUINA.
  estado: 'EN_ESPERA',
  marca: '',
  modelo: '',
  serial: '',
  anio: '',
  almacen_id: '',
  combustible_id: '',
  capacidad_combustible: '',
  tope_horas: '250',
  aviso_horas: '200',
  alarma_horas: '220',
  dias_mantenimiento: '',
  nota: '',
}

export function FichaMaquina() {
  const { id } = useParams()
  const navegar = useNavigate()
  const esNueva = !id

  const { data, isPending } = useMaquinaria(false)
  // Con los sitios que no guardan material: un patio de máquinas es
  // justamente donde se resguarda una máquina.
  const { data: almacenes } = useAlmacenes(true, true)
  const combustibles = useCombustibles()
  const guardar = useGuardarMaquina()
  const { data: propietarios } = usePropietarios()
  const { data: empleados } = useEmpleados(true)
  const subirFotos = useSubirFotosDeAlta()
  /* Dos huecos abiertos desde el principio: el minimo se ve antes de empezar. */
  const [fotos, setFotos] = useState<(File | null)[]>([null, null])
  const subir = useSubirFotoMaquina()
  const quitar = useQuitarFotoMaquina()
  const guardarEncuadre = useGuardarEncuadreMaquina()

  const { puede } = useMisPermisos()
  const editable = puede('MAQUINARIA', 'ESCRITURA')

  const maquina = esNueva ? undefined : data?.find((m) => m.id === Number(id))

  const [f, setF] = useState(vacio)
  const [cargado, setCargado] = useState(false)
  const [encuadre, setEncuadre] = useState({ zoom: 1, x: 0.5, y: 0.5 })
  const [cambiandoEstado, setCambiandoEstado] = useState(false)

  const foto = useFotoMaquina(maquina?.foto_path)

  /*
    La ficha era hasta hoy un formulario y nada más: decía qué ES la máquina y
    ni una palabra de lo que le había pasado. El combustible vivía en
    Combustible, las horas en un modal de la lista y el taller en Mantenimientos.

    Va con el id de la URL y no con `maquina.id`, que llega un pintado más tarde;
    y solo cuando la máquina existe, porque en «Nueva máquina» no hay id que
    preguntar y pediría el historial de NaN.
  */
  const historial = useHistorialMaquina(esNueva ? null : Number(id))

  // Se rellena una sola vez, cuando llega la máquina. Sin el pestillo, cada
  // refresco de la lista pisaría lo que se está escribiendo.
  useEffect(() => {
    if (esNueva || !maquina || cargado) return
    setF({
      codigo: maquina.codigo,
      nombre: maquina.nombre,
      tipo: maquina.tipo,
      propietario: maquina.propietario ?? 'LACANTERA',
      clase: maquina.clase ?? 'MAQUINA',
      operador_id: maquina.operador_id ? String(maquina.operador_id) : '',
      // Se rellena para que el formulario cuadre; al corregir no viaja.
      estado: maquina.estado,
      marca: maquina.marca ?? '',
      modelo: maquina.modelo ?? '',
      serial: maquina.serial ?? '',
      anio: maquina.anio ? String(maquina.anio) : '',
      almacen_id: maquina.almacen_id ? String(maquina.almacen_id) : '',
      combustible_id: maquina.combustible_id ? String(maquina.combustible_id) : '',
      capacidad_combustible: maquina.capacidad_combustible ?? '',
      tope_horas: maquina.tope_horas,
      aviso_horas: maquina.aviso_horas,
      alarma_horas: maquina.alarma_horas,
      dias_mantenimiento: maquina.dias_mantenimiento ? String(maquina.dias_mantenimiento) : '',
      nota: maquina.nota ?? '',
    })
    setEncuadre({
      zoom: Number(maquina.foto_zoom ?? 1),
      x: Number(maquina.foto_x ?? 0.5),
      y: Number(maquina.foto_y ?? 0.5),
    })
    setCargado(true)
  }, [esNueva, maquina, cargado])

  const cambiar = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))

  const aviso = Number(f.aviso_horas)
  const alarma = Number(f.alarma_horas)
  const tope = Number(f.tope_horas)
  const umbralesEnOrden = aviso <= alarma && alarma <= tope
  /* La base no deja nacer una máquina con menos de dos: aquí se dice antes. */
  const faltanFotos = !maquina && fotos.filter(Boolean).length < FOTOS_MINIMAS

  const listo = Boolean(
    f.codigo.trim() && f.nombre.trim() && tope > 0 && umbralesEnOrden && !faltanFotos,
  )

  if (!esNueva && isPending) return <Cargando />

  if (!esNueva && !maquina) {
    return (
      <Card>
        <Vacio
          titulo="No encontramos esa máquina"
          descripcion="Puede que se haya desincorporado o que el enlace esté equivocado."
          accion={
            <Link to="/app/maquinaria">
              <Button variant="outline">Ver los equipos</Button>
            </Link>
          }
        />
      </Card>
    )
  }

  const enviar = async (seguirCargando: boolean) => {
    /*
      LAS FOTOS PRIMERO, Y SOLO EN EL ALTA.

      La base cuenta las rutas que le llegan y no deja nacer una maquina con
      menos de dos, asi que tienen que estar subidas ANTES de crearla. Si el alta
      falla despues, quedan ficheros sueltos en la carpeta temporal: es el lado
      bueno del que equivocarse, porque un fichero huerfano no le miente a nadie
      y una maquina sin registro fotografico si.
    */
    const rutas = maquina
      ? null
      : await subirFotos.mutateAsync({ archivos: fotos.filter((x): x is File => x !== null) })

    const guardado = await guardar.mutateAsync({
      id: maquina?.id ?? null,
      codigo: f.codigo.trim(),
      nombre: f.nombre.trim(),
      tipo: f.tipo,
      propietario: f.propietario,
      clase: f.clase,
      // Tal cual, sin coalesce: dejarlo en nadie es una decisión, y si vacío
      // significara «déjalo como está» no habría manera de soltar el puesto.
      operador_id: f.operador_id ? Number(f.operador_id) : null,
      marca: f.marca.trim() || null,
      modelo: f.modelo.trim() || null,
      serial: f.serial.trim() || null,
      anio: f.anio ? Number(f.anio) : null,
      almacen_id: f.almacen_id ? Number(f.almacen_id) : null,
      combustible_id: f.combustible_id ? Number(f.combustible_id) : null,
      capacidad_combustible: f.capacidad_combustible ? Number(f.capacidad_combustible) : null,
      tope_horas: Number(f.tope_horas),
      aviso_horas: Number(f.aviso_horas),
      alarma_horas: Number(f.alarma_horas),
      dias_mantenimiento: f.dias_mantenimiento ? Number(f.dias_mantenimiento) : null,
      nota: f.nota.trim() || null,
      // Solo al nacer: la base ignora los dos en la correccion.
      estado: maquina ? null : f.estado,
      fotos: rutas,
    })

    if (seguirCargando) {
      // Se queda en la misma pantalla, en blanco y con el foco arriba. Cargar
      // una flota es teclear lo mismo veinte veces: cada viaje a la lista y
      // vuelta son dos clics que no aportan nada.
      setF(vacio)
      window.scrollTo({ top: 0 })
      setFotos([null, null])
      return
    }

    void navegar(`/app/maquinaria/${esNueva ? guardado : id}`)
  }

  return (
    <>
      <PageHeader
        title={esNueva ? 'Nueva máquina' : (maquina?.nombre ?? '')}
        description={
          esNueva
            ? 'El código la identifica en todo el sistema. Lo demás se puede completar después.'
            : 'Los cambios se ven en la lista de equipos en cuanto se guardan.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/*
              EL ESTADO SE VE AQUÍ PERO NO SE EDITA CON LOS DEMÁS CAMPOS

              Cambiar la marca de una máquina no puede ser también la vía para
              sacarla de servicio: son decisiones de peso muy distinto y una se
              guarda sin mirar. El estado va por su propia puerta, que avisa de
              lo que arrastra cada paso.

              Pero tiene que VERSE: una ficha que no dice si la máquina está
              trabajando o averiada obliga a volver a la lista para saberlo.
            */}
            {!esNueva && maquina ? (
              <>
                <Chip
                  tone={
                    maquina.estado === 'ACTIVA'
                      ? 'success'
                      : maquina.estado === 'FUERA_DE_SERVICIO'
                        ? 'danger'
                        : maquina.estado === 'EN_MANTENIMIENTO'
                          ? 'warning'
                          : 'neutral'
                  }
                >
                  {ETIQUETA_ESTADO[maquina.estado]}
                </Chip>

                {/* Y de quién es, al lado del estado, con la misma marca que en
                    los almacenes: un chuto de la gobernación tiene que
                    distinguirse de uno nuestro sin abrir el formulario. */}
                <DeQuienEs propietario={maquina.propietario} />

                {editable ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<ToggleLeft />}
                    onClick={() => setCambiandoEstado(true)}
                  >
                    Cambiar estado
                  </Button>
                ) : null}
              </>
            ) : null}

            <Link to="/app/maquinaria">
              <Button variant="outline" size="sm" icon={<ArrowLeft />}>
                A los equipos
              </Button>
            </Link>
          </div>
        }
      />

      <ModalEstado
        abierto={cambiandoEstado}
        maquina={maquina ?? null}
        onCerrar={() => setCambiandoEstado(false)}
      />

      {/*
        DOS PANELES DE FOTO A LA VEZ SE CONTRADECÍAN.

        Christopher: «estas 2 indicaciones FOTO están chocando». Y era verdad: a
        la izquierda ponía «guarda primero la máquina y la foto se podrá subir
        aquí» y en el formulario, dos huecos que impiden guardar sin llenarlos.
        Una decía que no se puede subir todavía y la otra que sin subir no se
        guarda.

        Al dar de alta, el panel de la cara desaparece. No es un capricho de
        maquetación: la cara es una imagen recortada que se elige entre las que
        ya hay, y mientras no haya ninguna no hay nada que elegir. Pedir tres
        fotos —dos de registro y una de cara— para crear una máquina es pedir
        una de más.
      */}
      <div
        className={cn(
          'grid gap-4',
          esNueva ? 'lg:grid-cols-1' : 'lg:grid-cols-[260px_minmax(0,1fr)]',
        )}
      >
        {/* --------------------------------- Foto --------------------------------- */}
        {!esNueva ? (
        <Card>
          <CardHeader title="Foto" subtitle="Para reconocerla de un vistazo." />

          <div className="mt-4">
              <EncuadreFoto
                url={foto}
                encuadre={encuadre}
                editable={editable}
                guardando={subir.isPending || quitar.isPending}
                onEncuadre={setEncuadre}
                onArchivo={(archivo) => subir.mutate({ maquina_id: maquina!.id, archivo })}
                onQuitar={() => quitar.mutate({ maquina_id: maquina!.id })}
              />

              {editable && foto ? (
                <div className="mt-4 flex justify-center">
                  <Button
                    size="sm"
                    variant="soft"
                    disabled={guardarEncuadre.isPending}
                    onClick={() =>
                      guardarEncuadre.mutate({
                        maquina_id: maquina!.id,
                        zoom: encuadre.zoom,
                        x: encuadre.x,
                        y: encuadre.y,
                      })
                    }
                  >
                    {guardarEncuadre.isPending ? 'Guardando…' : 'Guardar el encuadre'}
                  </Button>
                </div>
              ) : null}

            {subir.error ? <ErrorDeCarga error={subir.error} className="mt-3" /> : null}
          </div>
        </Card>
        ) : null}

        <div className="grid gap-4">
          {/* ------------------------------ Cuál es ------------------------------ */}
          <Card>
            <CardHeader
              title="Cuál es"
              subtitle="El código es con el que se la nombra en el patio y en todos los papeles."
            />

            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Input
                label="Código"
                placeholder="EXC-01"
                value={f.codigo}
                onChange={(e) => cambiar('codigo', e.target.value)}
              />
              <Input
                label="Nombre"
                placeholder="Excavadora del frente norte"
                value={f.nombre}
                onChange={(e) => cambiar('nombre', e.target.value)}
              />
              {/*
                QUÉ CLASE DE COSA ES, ANTES QUE DE QUÉ TIPO.

                Christopher: «segmentar si es una maquinaria (ej. volvo, chuto,
                retroexcavadora) o vehículo (ej. camioneta)».

                Va delante del tipo porque es la pregunta más gruesa, y no se
                deduce de él: un chuto es un camión y para él es maquinaria; una
                camioneta también es un camión y es vehículo. El corte no es
                «tiene ruedas», es para qué está la cosa.
              */}
              <Select
                label="Qué es"
                value={f.clase}
                onChange={(e) => cambiar('clase', e.target.value)}
                hint={CLASES_DE_MAQUINA.find((c) => c.valor === f.clase)?.pista}
                opciones={CLASES_DE_MAQUINA.map((c) => ({
                  valor: c.valor,
                  etiqueta: c.etiqueta,
                }))}
              />
              <Select
                label="Tipo"
                value={f.tipo}
                onChange={(e) => cambiar('tipo', e.target.value)}
                opciones={TIPOS_MAQUINA}
              />

              {/*
                DE QUIÉN ES LA MÁQUINA.

                Christopher: «este mismo aspecto se aplica también para las
                máquinas (ej. algún volvo, chuto con volqueta)». Va en la ficha
                de la máquina, que es donde vive el activo, y no en el vehículo:
                allí `propio` contesta otra cosa —si la placa de una guía es de
                la casa o de un transportista contratado— y un chuto de la
                gobernación conducido por la cantera no es un transportista
                contratado.
              */}
              <Select
                label="De quién es"
                value={f.propietario}
                onChange={(e) => cambiar('propietario', e.target.value)}
                opciones={(propietarios ?? []).map((d) => ({
                  valor: d.codigo,
                  etiqueta: d.es_la_casa ? `${d.nombre} (nosotros)` : d.nombre,
                }))}
              />

              {/*
                CÓMO LLEGA, Y SOLO AL DARLA DE ALTA.

                Christopher: «se desean registrar máquinas que no están activas o
                que directamente están en mantenimiento en algún taller». Antes
                toda máquina nacía ACTIVA, así que una que llegó rota había que
                darla de alta como buena y corregirla después — y en medio el
                sistema decía que estaba disponible.

                Al corregir no aparece: cambiar el estado es un hecho que se
                explica con un motivo, y para eso está el botón de la ficha. Y
                «en mantenimiento» no está en la lista a propósito: eso lo pone
                el mantenimiento al abrirse, que además dice en qué taller.
              */}
              {!maquina ? (
                <Select
                  label="Cómo llega"
                  value={f.estado}
                  onChange={(e) => cambiar('estado', e.target.value)}
                  hint="Después se cambia desde la ficha, explicando por qué."
                  opciones={ESTADOS_MAQUINA}
                />
              ) : null}

              {/*
                LAS DOS FOTOS, SOLO AL DAR DE ALTA.

                Christopher: «al registrar una máquina, debe incluir como mínimo
                y obligatorio 2 fotos o imágenes de ese vehículo». Al corregir no
                se piden: la única máquina que hay se registró antes de esta
                regla, y bloquear su ficha por una foto que nadie le pidió sería
                castigarla por haber llegado primero.
              */}
              {!maquina ? (
                <FotosDeLaMaquina
                  fotos={fotos}
                  onCambiar={setFotos}
                  deshabilitado={guardar.isPending || subirFotos.isPending}
                />
              ) : null}
              <Input
                label="Marca"
                value={f.marca}
                onChange={(e) => cambiar('marca', e.target.value)}
              />
              <Input
                label="Modelo"
                value={f.modelo}
                onChange={(e) => cambiar('modelo', e.target.value)}
              />
              <Input
                label="Serial"
                value={f.serial}
                onChange={(e) => cambiar('serial', e.target.value)}
              />
              <Input
                label="Año"
                type="number"
                min="1950"
                max="2100"
                value={f.anio}
                onChange={(e) => cambiar('anio', e.target.value)}
              />
              {/*
                QUIÉN LA LLEVA.

                Christopher: «una máquina necesita de un conductor, operador o
                responsable para funcionar o trasladarse». Y en el mismo mensaje:
                «una máquina no necesariamente tiene un único sitio de resguardo,
                puede estar en constante exploración o traslado y viajes».

                Las dos cosas dicen lo mismo: lo que ata una máquina no es un
                sitio, es una persona. Por eso este campo va ANTES que el del
                resguardo, que pasa a ser el opcional de los dos.

                Es un cargo, no el turno de ayer: quién la condujo un día
                concreto ya se anota en la lectura del horómetro y en el
                despacho. Puede quedar en nadie —una máquina en espera, que
                todavía no ha llegado, no tiene a quién asignarle— y exigirlo
                solo conseguiría que se pusiera a cualquiera.
              */}
              <div className="sm:col-span-2">
                <SelectBuscable
                  label="Quién la conduce u opera"
                  vacio="Nadie por ahora"
                  valor={f.operador_id}
                  onCambio={(v) => cambiar('operador_id', v)}
                  hint="Quien responde por ella para funcionar o trasladarse. Una máquina en espera puede quedarse sin nadie."
                  opciones={(empleados ?? []).map((e) => ({
                    valor: String(e.id),
                    codigo: e.ficha,
                    nombre: `${e.nombres} ${e.apellidos}`,
                    detalle: e.cargo,
                  }))}
                />
              </div>

              <div className="sm:col-span-2">
                <SelectBuscable
                  label="Dónde se resguarda, si tiene un sitio fijo"
                  vacio="No tiene sitio fijo"
                  valor={f.almacen_id}
                  onCambio={(v) => cambiar('almacen_id', v)}
                  hint="Muchas andan de viaje o en exploración y no paran en un solo lado: dejarlo vacío es una respuesta válida."
                  opciones={(almacenes ?? []).map((a) => ({
                    valor: String(a.id),
                    etiqueta: `${a.nombre}${a.tipo === 'TALLER' ? ' (taller)' : ''}`,
                    /* De quién es el sitio, porque no cabe una pastilla dentro
                       de la lista. Guardar una máquina nuestra en un almacén de
                       la gobernación se puede hacer, pero se ve. */
                    detalle: detalleDeDueno(
                      a.propietario,
                      (propietarios ?? []).find((d) => d.codigo === a.propietario)?.nombre,
                    ),
                  }))}
                />
              </div>
            </div>
          </Card>

          {/* --------------------------- Qué combustible --------------------------- */}
          <Card>
            <CardHeader
              title="Qué combustible quema"
              subtitle="Con esto, el vale se niega a echarle lo que no es y a pasarse de lo que le cabe."
            />

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Select
                label="Combustible"
                vacio="No se sabe todavía"
                value={f.combustible_id}
                onChange={(e) => cambiar('combustible_id', e.target.value)}
                opciones={(combustibles.data ?? []).map((c) => ({
                  valor: String(c.id),
                  etiqueta: c.nombre,
                }))}
                hint="Vacío no estorba: se puede surtir igual, solo que sin esta comprobación."
              />
              <Input
                label="Capacidad del tanque"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="Litros"
                value={f.capacidad_combustible}
                onChange={(e) => cambiar('capacidad_combustible', e.target.value)}
                hint="No se podrán despachar más litros de los que caben."
              />
            </div>
          </Card>

          {/* ----------------------------- Cuándo avisa ----------------------------- */}
          <Card>
            <CardHeader
              title="Cuándo avisar"
              subtitle="Horas desde el último mantenimiento. Los tres van en orden: primero el aviso, después la alarma, y el tope al final."
            />

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Input
                label="Aviso"
                type="number"
                min="1"
                step="1"
                value={f.aviso_horas}
                onChange={(e) => cambiar('aviso_horas', e.target.value)}
              />
              <Input
                label="Alarma"
                type="number"
                min="1"
                step="1"
                value={f.alarma_horas}
                onChange={(e) => cambiar('alarma_horas', e.target.value)}
              />
              <Input
                label="Tope"
                type="number"
                min="1"
                step="1"
                value={f.tope_horas}
                onChange={(e) => cambiar('tope_horas', e.target.value)}
              />
            </div>

            {!umbralesEnOrden ? (
              <p className="text-danger mt-3 text-sm">
                El aviso tiene que ser menor o igual que la alarma, y la alarma menor o igual que
                el tope.
              </p>
            ) : null}

            <div className="mt-4 max-w-sm">
              <Input
                label="Días que suele tardar su mantenimiento"
                type="number"
                min="1"
                step="1"
                placeholder="Si se sabe"
                value={f.dias_mantenimiento}
                onChange={(e) => cambiar('dias_mantenimiento', e.target.value)}
                hint="Sirve para avisar cuando lleva más de lo previsto en el taller. Vacío no compara contra nada."
              />
            </div>

          </Card>

          {/* ------------------------- Observaciones ------------------------- */}
          {/*
            LA NOTA ERA DE LA MÁQUINA Y PARECÍA DEL HORÓMETRO.

            Christopher: «las máquinas requieren de un campo llamado nota, u
            observación de la máquina (el campo nota que existe es del
            horómetro)».

            En la base nunca fue del horómetro: `maquinaria.nota` es de la
            máquina y siempre lo fue. Lo que engañaba era dónde estaba puesta —al
            final de la tarjeta «Cuándo avisar», debajo de tres umbrales de horas
            y de los días de taller—, y una etiqueta que dice «Nota» ahí solo
            puede leerse como una nota sobre eso.

            Por eso NO se añade una segunda columna. Habría dos sitios donde
            escribir lo mismo, y la observación de una máquina acabaría repartida
            entre las dos sin que nadie supiera cuál mirar. Se saca a su propia
            tarjeta y se dice qué es, que es lo que faltaba.
          */}
          <Card>
            <CardHeader
              title="Observaciones"
              subtitle="Lo que hay que saber de esta máquina y no cabe en un campo: de dónde vino, qué manías tiene, qué se le prometió a quien la presta."
            />
            <div className="mt-4">
              <Textarea
                label="Observación de la máquina"
                rows={4}
                placeholder="Llegó con el vidrio lateral partido. La bomba hidráulica es reconstruida."
                value={f.nota}
                onChange={(e) => cambiar('nota', e.target.value)}
                hint="No es del horómetro ni del mantenimiento: es de la máquina."
              />
            </div>
          </Card>

          {guardar.error ? <ErrorDeCarga error={guardar.error} /> : null}

          {/*
            QUÉ LLEVA ENCIMA, ENTRE EL FORMULARIO Y LA HISTORIA.

            Christopher: «debemos permitir que las máquinas puedan modificarse
            (añadir elementos o incluir características adicionales, ej. antenas
            Starlink, cauchos especiales, etc), eso estará incluido en el
            historial de la máquina».

            Va aquí y no dentro del formulario porque no es un campo de la
            máquina: es una lista que crece con el tiempo, y meterla entre el
            serial y el año la convertiría en algo que se guarda con el botón de
            abajo — cuando cada apunte se guarda solo, con su fecha.

            Y va ENCIMA de la historia porque contesta el presente: «qué lleva
            ahora». La historia, debajo, contesta el pasado.

            En una máquina nueva no aparece: todavía no existe a qué montarle
            nada.
          */}
          {!esNueva && maquina ? (
            <QueLlevaEncima maquinaId={maquina.id} editable={editable} />
          ) : null}

          {/* Debajo del formulario y no encima: quien entra a corregir un campo
              lo tiene a la vista, y quien entra a mirar qué le pasó baja una
              vez. En una máquina nueva no hay historia que contar todavía. */}
          {!esNueva ? (
            <Historial
              titulo="Su historia"
              subtitulo="Combustible, horas trabajadas, pasos por el taller, repuestos, modificaciones y cambios de estado, de lo más reciente a lo más viejo."
              hechos={historial.data}
              cargando={historial.isPending}
              error={historial.error}
              vacio="Todavía no se le ha hecho nada"
            />
          ) : null}

          {/* Los botones abajo, no arriba: después de llenar catorce campos, subir
              a buscar el de guardar es el único paso del formulario que no
              adelanta nada. */}
          {editable ? (
            <div className="flex flex-wrap justify-end gap-2 pb-2">
              <Link to="/app/maquinaria">
                <Button variant="ghost">Cancelar</Button>
              </Link>

              {esNueva ? (
                <Button
                  variant="outline"
                  disabled={!listo || guardar.isPending || subirFotos.isPending}
                  onClick={() => void enviar(true)}
                >
                  Guardar y crear otra
                </Button>
              ) : null}

              <Button
                icon={<Save />}
                disabled={!listo || guardar.isPending || subirFotos.isPending}
                onClick={() => void enviar(false)}
              >
                {subirFotos.isPending
                  ? 'Subiendo las fotos…'
                  : guardar.isPending
                    ? 'Guardando…'
                    : 'Guardar'}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}
