import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Boxes, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_MATERIAL } from '@/components/pestanasDeModulos'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import {
  CATEGORIAS_ARTICULO,
  MODOS_ENTREGA,
  useArticulos,
  useCambiarEstadoArticulo,
  useCrearArticulo,
  useEditarArticulo,
  useEliminarArticulo,
  usePresentaciones,
  useUnidades,
} from '@/lib/api/catalogo'

const nuevo = {
  id: 0,
  codigo: '',
  nombre: '',
  categoria: 'REPUESTO',
  unidad: 'UND',
  descripcion: '',
  inventariable: true,
  reparable: false,
  stock_minimo: '0',
  modo_entrega: 'CONSUMIBLE',
  presentacion: '',
  unidades_por_presentacion: '',
  marca: '',
  numero_parte: '',
}

/*
  El modo por defecto lo propone la categoría.

  Es lo que acierta más veces —una herramienta vuelve, un repuesto se instala,
  un producto se vende— y se puede cambiar en el mismo formulario. Poner uno
  fijo obligaría a corregirlo casi siempre, que es como se acaba dejando mal.
*/
const modoDe = (categoria: string) =>
  categoria === 'HERRAMIENTA' || categoria === 'EPP'
    ? 'RETORNABLE'
    : categoria === 'PRODUCTO' || categoria === 'SERVICIO'
      ? 'NO'
      : 'CONSUMIBLE'

/**
 * «un bulto», «una paleta» — con su artículo, para que la ayuda se lea.
 *
 * El código no sirve para esto: «Lo que trae BULTO» está escrito para una
 * máquina. Se busca el nombre del catálogo, que ya viene en castellano y con
 * su tilde, y se le pone el artículo mirando la última letra. No es gramática
 * perfecta —«un paleta» no pasaría— pero acierta con todos los de la lista, y
 * la lista es cerrada.
 */
function unNombre(
  lista: { codigo: string; nombre: string }[] | undefined,
  codigo: string,
): string {
  const nombre = lista?.find((p) => p.codigo === codigo)?.nombre ?? codigo
  return `${nombre.trim().toLowerCase().endsWith('a') ? 'una' : 'un'} ${nombre.toLowerCase()}`
}

export function Articulos() {
  const navegar = useNavigate()
  const { data, isPending, error } = useArticulos(false)
  const { data: unidades } = useUnidades()
  const { data: presentaciones } = usePresentaciones()
  /*
    Las marcas que ya se han usado, para ofrecerlas en vez de que cada quien
    teclee la suya. Salen de los articulos que ya estan cargados —no hace falta
    otra consulta— y se ordenan para que la lista no baile entre aperturas.
  */
  const marcasUsadas = useMemo(
    () =>
      [...new Set((data ?? []).map((a) => a.marca).filter((m): m is string => !!m))].sort((x, y) =>
        x.localeCompare(y, 'es'),
      ),
    [data],
  )
  const crear = useCrearArticulo()
  const editar = useEditarArticulo()
  const eliminar = useEliminarArticulo()
  const cambiarEstado = useCambiarEstadoArticulo()

  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState('')
  const [form, setForm] = useState<typeof nuevo | null>(null)

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return (data ?? []).filter(
      (a) =>
        (!categoria || a.categoria === categoria) &&
        (!texto ||
          a.nombre.toLowerCase().includes(texto) ||
          a.codigo.toLowerCase().includes(texto)),
    )
  }, [data, busqueda, categoria])

  return (
    <>
      <PageHeader
        title="Catálogo de artículos"
        description="Lo que se pide, se compra y se cuenta. Un artículo mal definido se convierte en existencias que no cuadran."
        actions={
          <>
            {/* Dejo de ser entrada del menú y paso a estar donde hago falta:
                quien va a cargar cien artículos de golpe está mirando el
                catálogo, no buscándome en el riel. */}
            <Link to="/app/inventario/articulos/carga">
              <Button variant="outline" icon={<Upload />}>
                Cargar por planilla
              </Button>
            </Link>
            <Button icon={<Plus />} onClick={() => setForm({ ...nuevo })}>
              Nuevo artículo
            </Button>
          </>
        }
      />

      <Pestanas pestanas={PESTANAS_MATERIAL} />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
          <Input
            label="Buscar"
            icon={<Search />}
            placeholder="Nombre o código"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <Select
            label="Categoría"
            vacio="Todas"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            opciones={CATEGORIAS_ARTICULO}
          />
        </div>
      </Card>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && filtrados.length === 0 ? (
        <Card>
          <Vacio
            icono={<Boxes />}
            titulo={data.length === 0 ? 'El catálogo está vacío' : 'Nada coincide con la búsqueda'}
            descripcion={
              data.length === 0
                ? 'Las migraciones traen un catálogo inicial de cantera. Si no aparece, todavía no se han corrido.'
                : undefined
            }
          />
        </Card>
      ) : null}

      {filtrados.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Código</th>
                  <th className="px-3 py-3 font-medium">Artículo</th>
                  <th className="px-3 py-3 font-medium">Categoría</th>
                  <th className="px-3 py-3 font-medium">Unidad</th>
                  <th className="px-3 py-3 font-medium">Al entregarlo</th>
                  <th className="px-3 py-3 text-right font-medium">Mínimo</th>
                  <th className="px-3 py-3 text-right font-medium">Estado</th>
                  <th className="px-5 py-3 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {/* La fila entera lleva a la ficha del artículo. Es donde está su
                    historia, y llegar ahí no debería costar buscar un enlace
                    pequeño al final del renglón. */}
                {filtrados.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => void navegar(`/app/inventario/articulos/${a.id}`)}
                    className="border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors last:border-0"
                  >
                    <td className="tabular text-ink/60 px-5 py-3 font-mono text-xs">{a.codigo}</td>
                    <td className="px-3 py-3">
                      <p className="text-ink/85 font-medium">{a.nombre}</p>
                      {a.descripcion ? (
                        <p className="text-ink/45 text-xs">{a.descripcion}</p>
                      ) : null}
                    </td>
                    <td className="text-ink/70 px-3 py-3">
                      {CATEGORIAS_ARTICULO.find((c) => c.valor === a.categoria)?.etiqueta ??
                        a.categoria}
                    </td>
                    <td className="text-ink/70 px-3 py-3">{a.unidad}</td>
                    <td className="px-3 py-3">
                      <Chip tone={a.modo_entrega === 'RETORNABLE' ? 'royal' : 'neutral'}>
                        {MODOS_ENTREGA.find((m) => m.valor === a.modo_entrega)?.etiqueta ??
                          a.modo_entrega}
                      </Chip>
                    </td>
                    <td className="tabular text-ink/70 px-3 py-3 text-right">
                      {Number(a.stock_minimo) > 0 ? a.stock_minimo : '—'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          void cambiarEstado.mutate({ id: a.id, activo: !a.activo })
                        }
                      >
                        <Chip tone={a.activo ? 'success' : 'neutral'}>
                          {a.activo ? 'Activo' : 'Inactivo'}
                        </Chip>
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right" onClick={(ev) => ev.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Pencil />}
                          aria-label={`Editar ${a.nombre}`}
                          onClick={() =>
                            setForm({
                              id: a.id,
                              codigo: a.codigo,
                              nombre: a.nombre,
                              categoria: a.categoria,
                              unidad: a.unidad,
                              descripcion: a.descripcion ?? '',
                              inventariable: a.inventariable,
                              reparable: a.reparable,
                              stock_minimo: String(a.stock_minimo),
                              modo_entrega: a.modo_entrega,
                              presentacion: a.presentacion ?? '',
                              marca: a.marca ?? '',
                              numero_parte: a.numero_parte ?? '',
                              unidades_por_presentacion:
                                a.unidades_por_presentacion == null
                                  ? ''
                                  : String(Number(a.unidades_por_presentacion)),
                            })
                          }
                        />
                        {/* Borrar solo sale si nada lo ha tocado todavía. En
                            cuanto aparece en una orden o un movimiento, la base
                            lo impide y el mensaje dice que se desactive. */}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger"
                          icon={<Trash2 />}
                          aria-label={`Borrar ${a.nombre}`}
                          disabled={eliminar.isPending}
                          onClick={() => void eliminar.mutateAsync({ id: a.id }).catch(() => {})}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {eliminar.error ? <ErrorDeCarga error={eliminar.error} className="mt-3" /> : null}

      {form ? (
        <Modal
          abierto
          onCerrar={() => setForm(null)}
          titulo={form.id ? `Corregir ${form.codigo}` : 'Nuevo artículo'}
          descripcion={
            form.id
              ? 'El código no se cambia: es con lo que se pide en el almacén y ya está impreso en lo emitido.'
              : 'Solo hacen falta el nombre, la categoría y la unidad. El código se pone solo si lo dejas vacío.'
          }
          acciones={
            <>
              <Button variant="ghost" onClick={() => setForm(null)}>
                Cancelar
              </Button>
              <Button
                disabled={crear.isPending || editar.isPending || !form.nombre}
                onClick={async () => {
                  const datos = {
                    ...form,
                    stock_minimo: Number(form.stock_minimo) || 0,
                    presentacion: form.presentacion || null,
                    marca: form.marca.trim() || null,
                    numero_parte: form.numero_parte.trim() || null,
                    // Sin presentación no viaja el número: la base rechaza
                    // decir cuántas trae algo que no dice en qué viene.
                    unidades_por_presentacion:
                      form.presentacion && Number(form.unidades_por_presentacion) > 0
                        ? Number(form.unidades_por_presentacion)
                        : null,
                  }
                  if (form.id) await editar.mutateAsync(datos)
                  else await crear.mutateAsync(datos)
                  setForm(null)
                }}
              >
                {crear.isPending || editar.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {/* El codigo dejo de ser obligatorio.
                Lo pidio la lider: quien va a cargar cuarenta repuestos de una
                caja tenia que inventarse cuarenta codigos antes de escribir el
                primer nombre, y lo que sale de ahi son codigos inventados a las
                prisas. Ya se nota en los que hay: junto a REP-FILTRO-A conviven
                TAN-250-HQ, sin el prefijo de su categoria, e INS_HOJA_01 con
                guion bajo.

                Sigue pudiendose escribir: quien tiene una nomenclatura la usa.
                Lo que cambia es que dejarlo vacio ya no es un error. */}
            <Input
              label="Código"
              placeholder="Se pone solo"
              disabled={Boolean(form.id)}
              hint={
                form.id
                  ? 'No se cambia.'
                  : 'Opcional. Vacío, se pone solo con el prefijo de su categoría.'
              }
              value={form.codigo}
              onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })}
            />
            <Input
              label="Nombre"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            />
            <Select
              label="Categoría"
              value={form.categoria}
              onChange={(e) =>
                setForm({
                  ...form,
                  categoria: e.target.value,
                  inventariable: e.target.value !== 'SERVICIO',
                  // La categoria decide por defecto, y se puede desmarcar. Un
                  // repuesto y una herramienta vuelven arreglados del taller; un
                  // lubricante o un producto se gastan.
                  reparable: ['HERRAMIENTA', 'REPUESTO'].includes(e.target.value),
                  // Al cambiar de categoría se propone el modo que le toca. Si
                  // ya se había elegido a mano se respeta: cambiarlo por debajo
                  // sería deshacer una decisión de quien está mirando.
                  modo_entrega: form.id ? form.modo_entrega : modoDe(e.target.value),
                })
              }
              opciones={CATEGORIAS_ARTICULO}
            />
            <Select
              label="Unidad"
              value={form.unidad}
              onChange={(e) => setForm({ ...form, unidad: e.target.value })}
              opciones={(unidades ?? []).map((u) => ({ valor: u.codigo, etiqueta: u.nombre }))}
            />
            <Input
              label="Existencia mínima"
              type="number"
              min="0"
              step="0.01"
              hint="Cero significa que no se controla."
              value={form.stock_minimo}
              onChange={(e) => setForm({ ...form, stock_minimo: e.target.value })}
            />

            {/*
              CÓMO LLEGA, QUE NO ES CÓMO SE USA.

              La unidad de arriba es lo que la empresa **usa**: litros, kilos,
              metros cúbicos. En eso se lleva la existencia y en eso se
              descuenta el consumo, y eso no cambia.

              Esto de aquí es cómo **llega**: un bulto, un bidón de 20 L, una
              paleta. Una barra de acero llega suelta y se queda en blanco —no
              es un dato que falte, es que no lo tiene—.

              Sirve para pedir y para recibir. El almacén cuenta bultos al
              descargar el camión, y el pedido se hace en litros; sin esta
              equivalencia escrita en algún sitio, cada quien la calcula de
              cabeza y se piden seis veces de más.
            */}
            <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
              {/*
                De lista y no escrito a mano. Con el campo libre el mismo envase
                acababa como BIDON, BIDOM y BIDON DE 20, y entonces ninguna
                consulta los junta: ni la que dice cuánto se compró en bidones,
                ni la que busca lo que llega en paletas.

                Y la medida no va aquí. «BIDON DE 20 L» sería texto libre otra
                vez, con un desplegable delante: esto dice BIDON y cuántos
                litros trae lo dice el campo de al lado, que es donde se puede
                contar.
              */}
              <Select
                label="Cómo llega"
                vacio="Suelto, sin empaque"
                value={form.presentacion}
                onChange={(e) =>
                  setForm({
                    ...form,
                    presentacion: e.target.value,
                    // Al quitar la presentación se va con ella lo que traía:
                    // «6 por nada» no significa nada, y la base lo rechaza.
                    unidades_por_presentacion: e.target.value
                      ? form.unidades_por_presentacion
                      : '',
                  })
                }
                opciones={(presentaciones ?? []).map((p) => ({
                  valor: p.codigo,
                  etiqueta: p.nombre,
                }))}
              />
              <Input
                label={`Cuántas ${form.unidad} trae`}
                type="number"
                min="0"
                step="0.0001"
                inputMode="decimal"
                disabled={!form.presentacion}
                hint={
                  form.presentacion
                    ? `Lo que trae ${unNombre(presentaciones, form.presentacion)}.`
                    : 'Primero di cómo llega.'
                }
                value={form.unidades_por_presentacion}
                onChange={(e) =>
                  setForm({ ...form, unidades_por_presentacion: e.target.value })
                }
              />
            </div>

            {/*
              LO QUE IDENTIFICA AL PRODUCTO, Y NO ESTABA EN NINGUNA PARTE.

              Lo pidió Christopher: «no se está apreciando dónde ingresar la
              marca, serial, etc.». Estaba yendo a parar a la descripción, que
              es el cajón de lo que no tiene campo — y de ahí no se puede
              buscar ni comparar.

              La marca es libre pero ofrece las ya usadas: una lista cerrada de
              marcas envejece mal, cada compra puede traer una nueva, pero
              dejarla a pelo produce MOTUL, Motul y Motul S.A.

              El número de parte no tiene lista posible: es distinto en cada
              producto. Es lo que se le dice al proveedor cuando el nombre no
              basta para que mande la pieza correcta.
            */}
            <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
              <Input
                label="Marca"
                list="marcas-usadas"
                placeholder="Motul, Komatsu…"
                hint="Se ofrecen las que ya se han usado."
                value={form.marca}
                onChange={(e) => setForm({ ...form, marca: e.target.value })}
              />
              <datalist id="marcas-usadas">
                {marcasUsadas.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <Input
                label="N° de parte o serial"
                placeholder="La referencia del fabricante"
                hint="Lo que se le dice al proveedor para que mande la pieza correcta."
                value={form.numero_parte}
                onChange={(e) => setForm({ ...form, numero_parte: e.target.value })}
              />
            </div>

            {/* Lo que faltaba: el formulario no decía si esto se le puede
                entregar a alguien, y por eso Asignaciones ofrecía gasolina
                «hasta que la devuelva». */}
            <Select
              label="Al entregarlo a una persona"
              className="sm:col-span-2"
              hint={MODOS_ENTREGA.find((m) => m.valor === form.modo_entrega)?.ayuda}
              value={form.modo_entrega}
              onChange={(e) => setForm({ ...form, modo_entrega: e.target.value })}
              opciones={MODOS_ENTREGA.map((m) => ({ valor: m.valor, etiqueta: m.etiqueta }))}
            />
          </div>

          <Textarea
            label="Descripción"
            className="mt-4"
            rows={2}
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
          />

          <label className="text-ink/75 mt-4 flex cursor-pointer items-center gap-2 text-sm select-none">
            <input
              type="checkbox"
              className="accent-royal-600 size-4"
              disabled={form.categoria === 'SERVICIO'}
              checked={form.inventariable}
              onChange={(e) => setForm({ ...form, inventariable: e.target.checked })}
            />
            Entra al inventario
            {form.categoria === 'SERVICIO' ? (
              <span className="text-ink/45 text-xs">(un servicio no se almacena)</span>
            ) : null}
          </label>

          {/*
            Lo pidio Christopher viendo el selector del taller lleno de aceite de
            motor y arena lavada: «no podemos mandar al taller a reparar un pote
            de aceite, por lo tanto al crear un articulo se debe especificar si
            es o no apto para enviar al taller».

            Viene marcada sola segun la categoria porque para la mayoria la
            respuesta es evidente, y se puede corregir: la casilla esta para el
            caso raro, no para hacer pensar en cada alta.
          */}
          <label className="text-ink/75 mt-3 flex cursor-pointer items-center gap-2 text-sm select-none">
            <input
              type="checkbox"
              className="accent-royal-600 size-4"
              disabled={!form.inventariable}
              checked={form.reparable}
              onChange={(e) => setForm({ ...form, reparable: e.target.checked })}
            />
            Se puede mandar al taller
            <span className="text-ink/45 text-xs">
              {form.reparable ? '(vuelve arreglado)' : '(se gasta, no se repara)'}
            </span>
          </label>

          {crear.error ? <ErrorDeCarga error={crear.error} className="mt-4" /> : null}
        </Modal>
      ) : null}
    </>
  )
}
