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
  stock_minimo: '0',
  modo_entrega: 'CONSUMIBLE',
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

export function Articulos() {
  const navegar = useNavigate()
  const { data, isPending, error } = useArticulos(false)
  const { data: unidades } = useUnidades()
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
                              stock_minimo: String(a.stock_minimo),
                              modo_entrega: a.modo_entrega,
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
                  const datos = { ...form, stock_minimo: Number(form.stock_minimo) || 0 }
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

          {crear.error ? <ErrorDeCarga error={crear.error} className="mt-4" /> : null}
        </Modal>
      ) : null}
    </>
  )
}
