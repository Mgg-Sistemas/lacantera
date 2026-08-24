import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Save } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EncuadreFoto } from '@/components/EncuadreFoto'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useAlmacenes } from '@/lib/api/inventario'
import { useCombustibles } from '@/lib/api/combustible'
import {
  TIPOS_MAQUINA,
  useFotoMaquina,
  useGuardarEncuadreMaquina,
  useGuardarMaquina,
  useMaquinaria,
  useQuitarFotoMaquina,
  useSubirFotoMaquina,
} from '@/lib/api/maquinaria'
import { useMisPermisos } from '@/lib/api/usuarios'

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
  const { data: almacenes } = useAlmacenes()
  const combustibles = useCombustibles()
  const guardar = useGuardarMaquina()
  const subir = useSubirFotoMaquina()
  const quitar = useQuitarFotoMaquina()
  const guardarEncuadre = useGuardarEncuadreMaquina()

  const { puede } = useMisPermisos()
  const editable = puede('MAQUINARIA', 'ESCRITURA')

  const maquina = esNueva ? undefined : data?.find((m) => m.id === Number(id))

  const [f, setF] = useState(vacio)
  const [cargado, setCargado] = useState(false)
  const [encuadre, setEncuadre] = useState({ zoom: 1, x: 0.5, y: 0.5 })

  const foto = useFotoMaquina(maquina?.foto_path)

  // Se rellena una sola vez, cuando llega la máquina. Sin el pestillo, cada
  // refresco de la lista pisaría lo que se está escribiendo.
  useEffect(() => {
    if (esNueva || !maquina || cargado) return
    setF({
      codigo: maquina.codigo,
      nombre: maquina.nombre,
      tipo: maquina.tipo,
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
  const listo = Boolean(f.codigo.trim() && f.nombre.trim() && tope > 0 && umbralesEnOrden)

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
    const guardado = await guardar.mutateAsync({
      id: maquina?.id ?? null,
      codigo: f.codigo.trim(),
      nombre: f.nombre.trim(),
      tipo: f.tipo,
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
    })

    if (seguirCargando) {
      // Se queda en la misma pantalla, en blanco y con el foco arriba. Cargar
      // una flota es teclear lo mismo veinte veces: cada viaje a la lista y
      // vuelta son dos clics que no aportan nada.
      setF(vacio)
      window.scrollTo({ top: 0 })
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
          <Link to={esNueva ? '/app/maquinaria' : '/app/maquinaria'}>
            <Button variant="outline" size="sm" icon={<ArrowLeft />}>
              A los equipos
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* --------------------------------- Foto --------------------------------- */}
        <Card>
          <CardHeader title="Foto" subtitle="Para reconocerla de un vistazo." />

          {esNueva ? (
            /* Hasta que la máquina no tiene número no hay carpeta donde dejar el
               archivo. Se dice, en vez de enseñar un recuadro que no responde. */
            <p className="text-ink/45 mt-4 text-sm leading-relaxed">
              Guarda primero la máquina y la foto se podrá subir aquí. Hace falta su número para
              saber dónde guardarla.
            </p>
          ) : (
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
          )}
        </Card>

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
              <Select
                label="Tipo"
                value={f.tipo}
                onChange={(e) => cambiar('tipo', e.target.value)}
                opciones={TIPOS_MAQUINA}
              />
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
              <div className="sm:col-span-2">
                <SelectBuscable
                  label="Dónde vive"
                  vacio="Sin asignar"
                  valor={f.almacen_id}
                  onCambio={(v) => cambiar('almacen_id', v)}
                  opciones={(almacenes ?? []).map((a) => ({
                    valor: String(a.id),
                    etiqueta: `${a.nombre}${a.tipo === 'TALLER' ? ' (taller)' : ''}`,
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

            <div className="mt-4">
              <Textarea
                label="Nota"
                rows={2}
                value={f.nota}
                onChange={(e) => cambiar('nota', e.target.value)}
              />
            </div>
          </Card>

          {guardar.error ? <ErrorDeCarga error={guardar.error} /> : null}

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
                  disabled={!listo || guardar.isPending}
                  onClick={() => void enviar(true)}
                >
                  Guardar y crear otra
                </Button>
              ) : null}

              <Button
                icon={<Save />}
                disabled={!listo || guardar.isPending}
                onClick={() => void enviar(false)}
              >
                {guardar.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}
