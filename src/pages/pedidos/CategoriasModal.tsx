import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Segmento } from '@/components/ui/Segmento'
import {
  useActivarCatalogo,
  useCatalogo,
  useEliminarCatalogo,
  useGuardarCatalogo,
  type Catalogo,
  type ItemCatalogo,
} from '@/lib/api/pedidos'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { ConfirmDialog } from './Dialogos'

/*
  «📒 CATEGORÍAS DE PEDIDOS» (MGG `CatalogoPedidosModal`)

  Las tres pestañas de MGG: «Unidad solicitante», «Categorías de servicio» y
  «Tipos de servicio». Agregar, buscar, editar, deshabilitar o eliminar. Lo
  administra quien lleva Compras; la base lo vuelve a preguntar.
*/

const TABS: { key: Catalogo; label: string; singular: string; placeholder: string }[] = [
  { key: 'unidad_solicitante', label: 'Unidad solicitante', singular: 'unidad solicitante', placeholder: 'Gerencia, Taller, Mina…' },
  { key: 'servicio_categoria', label: 'Categorías de servicio', singular: 'categoría de servicio', placeholder: 'Recarga de gas, Mantenimiento…' },
  { key: 'servicio_tipo', label: 'Tipos de servicio', singular: 'tipo de servicio', placeholder: 'Recarga 20kg, Cambio de aceite…' },
]

export function CategoriasModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Catalogo>('unidad_solicitante')
  const [filtro, setFiltro] = useState('')
  const [nombre, setNombre] = useState('')
  const [edit, setEdit] = useState<{ id: number; nombre: string } | null>(null)
  const [borrar, setBorrar] = useState<ItemCatalogo | null>(null)
  const { data: items = [], isPending } = useCatalogo(tab)
  const guardar = useGuardarCatalogo()
  const activar = useActivarCatalogo()
  const eliminar = useEliminarCatalogo()

  const meta = TABS.find((t) => t.key === tab) ?? TABS[0]
  const filtrados = items.filter((i) => i.nombre.toLowerCase().includes(filtro.trim().toLowerCase()))

  function cambiarTab(t: Catalogo) {
    setTab(t)
    setNombre('')
    setFiltro('')
    setEdit(null)
  }

  async function agregar() {
    if (!nombre.trim()) {
      toast('Escribí el nombre', 'error')
      return
    }
    try {
      await guardar.mutateAsync({ catalogo: tab, id: null, nombre })
      setNombre('')
      toast('Agregado', 'success')
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo agregar'), 'error')
    }
  }

  async function guardarEdit() {
    if (!edit || !edit.nombre.trim()) {
      toast('Indicá el nombre', 'error')
      return
    }
    try {
      await guardar.mutateAsync({ catalogo: tab, id: edit.id, nombre: edit.nombre })
      setEdit(null)
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo guardar'), 'error')
    }
  }

  async function toggle(it: ItemCatalogo) {
    try {
      await activar.mutateAsync({ catalogo: tab, id: it.id, activo: !it.activo })
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo cambiar'), 'error')
    }
  }

  async function confirmarBorrado() {
    const it = borrar
    if (!it) return
    setBorrar(null)
    try {
      await eliminar.mutateAsync({ catalogo: tab, id: it.id })
      toast('Eliminado', 'success')
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo eliminar'), 'error')
    }
  }

  return (
    <>
      <Modal abierto onCerrar={onClose} titulo="📒 Categorías de pedidos" ancho="lg" acciones={<Button onClick={onClose}>Cerrar</Button>}>
        <Segmento
          className="mb-4"
          valor={tab}
          onCambio={(v) => cambiarTab(v as Catalogo)}
          opciones={TABS.map((t) => ({ valor: t.key, etiqueta: t.label }))}
        />

        <Card className="mb-4 p-4">
          <div className="text-ink/80 mb-2 text-sm font-semibold">Agregar {meta.singular}</div>
          <div className="flex items-end gap-2">
            <Input
              label={`Nombre de la ${meta.singular}`}
              ocultarEtiqueta
              className="flex-1"
              placeholder={meta.placeholder}
              maxLength={80}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void agregar()
                }
              }}
            />
            <Button onClick={() => void agregar()} disabled={guardar.isPending}>
              + Agregar
            </Button>
          </div>
        </Card>

        <Input
          label="Buscar"
          ocultarEtiqueta
          sinNormalizar
          type="search"
          className="mb-2"
          placeholder={`Buscar ${meta.singular}…`}
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />

        <div className="border-hairline max-h-[360px] overflow-y-auto rounded-[6px] border">
          <table className="w-full text-sm">
            <thead className="bg-ink/4 text-ink/55 text-left text-xs">
              <tr>
                <th className="px-3 py-2 font-medium">{meta.label}</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {isPending ? (
                <tr>
                  <td colSpan={3} className="text-ink/50 px-3 py-4 text-center">
                    Cargando…
                  </td>
                </tr>
              ) : !filtrados.length ? (
                <tr>
                  <td colSpan={3} className="text-ink/50 px-3 py-4 text-center">
                    Sin resultados.
                  </td>
                </tr>
              ) : (
                filtrados.map((it) => (
                  <tr key={it.id} className="border-hairline border-t" style={{ opacity: it.activo ? 1 : 0.55 }}>
                    <td className="px-3 py-2">{it.nombre}</td>
                    <td className="px-3 py-2">{it.activo ? '🟢 Activo' : '⚪ Inactivo'}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => setEdit({ id: it.id, nombre: it.nombre })}>
                        ✎ Editar
                      </Button>
                      <Button size="sm" variant="ghost" disabled={activar.isPending} onClick={() => void toggle(it)}>
                        {it.activo ? 'Deshabilitar' : 'Habilitar'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger"
                        title="Eliminar definitivamente"
                        onClick={() => setBorrar(it)}
                      >
                        🗑 Eliminar
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Modal>

      {edit ? (
        <Modal
          abierto
          onCerrar={() => setEdit(null)}
          titulo={`Editar ${meta.singular}`}
          ancho="md"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setEdit(null)} disabled={guardar.isPending}>
                Cancelar
              </Button>
              <Button onClick={() => void guardarEdit()} disabled={guardar.isPending}>
                Guardar
              </Button>
            </>
          }
        >
          <Input
            label="Nombre"
            maxLength={80}
            value={edit.nombre}
            onChange={(e) => setEdit({ ...edit, nombre: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void guardarEdit()
            }}
          />
        </Modal>
      ) : null}

      {borrar ? (
        <ConfirmDialog
          title={`Eliminar ${meta.singular}`}
          message={`¿Eliminar definitivamente «${borrar.nombre}» del catálogo? Esta acción no se puede deshacer.`}
          confirmText="Eliminar"
          danger
          busy={eliminar.isPending}
          onCancel={() => setBorrar(null)}
          onConfirm={() => void confirmarBorrado()}
        />
      ) : null}
    </>
  )
}
