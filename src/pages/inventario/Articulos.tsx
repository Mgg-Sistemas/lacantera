import { useMemo, useState } from 'react'
import { Boxes, Plus, Search } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
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
  useArticulos,
  useCambiarEstadoArticulo,
  useCrearArticulo,
  useUnidades,
} from '@/lib/api/catalogo'

const nuevo = {
  codigo: '',
  nombre: '',
  categoria: 'REPUESTO',
  unidad: 'UND',
  descripcion: '',
  inventariable: true,
  stock_minimo: '0',
}

export function Articulos() {
  const { data, isPending, error } = useArticulos(false)
  const { data: unidades } = useUnidades()
  const crear = useCrearArticulo()
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
          <Button icon={<Plus />} onClick={() => setForm({ ...nuevo })}>
            Nuevo artículo
          </Button>
        }
      />

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
                  <th className="px-3 py-3 text-right font-medium">Mínimo</th>
                  <th className="px-5 py-3 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((a) => (
                  <tr key={a.id} className="border-hairline border-b last:border-0">
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
                    <td className="tabular text-ink/70 px-3 py-3 text-right">
                      {Number(a.stock_minimo) > 0 ? a.stock_minimo : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {form ? (
        <Modal
          abierto
          onCerrar={() => setForm(null)}
          titulo="Nuevo artículo"
          descripcion="El código no se puede repetir y no se cambia después."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setForm(null)}>
                Cancelar
              </Button>
              <Button
                disabled={crear.isPending}
                onClick={async () => {
                  await crear.mutateAsync({
                    ...form,
                    stock_minimo: Number(form.stock_minimo) || 0,
                  })
                  setForm(null)
                }}
              >
                {crear.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Código"
              placeholder="REP-BOMBA"
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
