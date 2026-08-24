import { useState } from 'react'
import { Plus, Warehouse } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_SITIOS } from '@/components/pestanasDeModulos'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { TIPOS_ALMACEN, useAlmacenes, useGuardarAlmacen } from '@/lib/api/inventario'
import type { Almacen } from '@/lib/api/inventario'

const vacio = {
  codigo: '',
  nombre: '',
  tipo: 'ALMACEN',
  ubicacion: '',
  recibe_compras: false,
  activo: true,
  capacidad: '',
  trabajos_a_la_vez: '',
}

export function Almacenes() {
  const { data, isPending, error } = useAlmacenes(false)
  const guardar = useGuardarAlmacen()
  const [edicion, setEdicion] = useState<(typeof vacio & { id?: number }) | null>(null)

  const abrir = (a?: Almacen) =>
    setEdicion(
      a
        ? {
            id: a.id,
            codigo: a.codigo,
            nombre: a.nombre,
            tipo: a.tipo,
            ubicacion: a.ubicacion ?? '',
            recibe_compras: a.recibe_compras,
            activo: a.activo,
            capacidad: a.capacidad ?? '',
            trabajos_a_la_vez: a.trabajos_a_la_vez ? String(a.trabajos_a_la_vez) : '',
          }
        : { ...vacio },
    )

  const cambiar = (c: Partial<typeof vacio>) => setEdicion((e) => (e ? { ...e, ...c } : e))

  return (
    <>
      <PageHeader
        title="Almacenes y patios"
        description="Dónde se guarda cada cosa. Las existencias se llevan por almacén, no en un montón único."
        actions={
          <Button icon={<Plus />} onClick={() => abrir()}>
            Nuevo almacén
          </Button>
        }
      />

      <Pestanas pestanas={PESTANAS_SITIOS} />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<Warehouse />}
            titulo="No hay almacenes"
            descripcion="Sin al menos uno no se puede recibir material."
            accion={
              <Button icon={<Plus />} onClick={() => abrir()}>
                Crear el primero
              </Button>
            }
          />
        </Card>
      ) : null}

      {data && data.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Código</th>
                  <th className="px-3 py-3 font-medium">Nombre</th>
                  <th className="px-3 py-3 font-medium">Tipo</th>
                  <th className="px-3 py-3 font-medium">Ubicación</th>
                  <th className="px-5 py-3 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => abrir(a)}
                    className="border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors last:border-0"
                  >
                    <td className="text-ink/60 px-5 py-3 font-mono text-xs">{a.codigo}</td>
                    <td className="text-ink/85 px-3 py-3 font-medium">
                      {a.nombre}
                      {a.recibe_compras ? (
                        <Chip tone="royal" className="ml-2">
                          Recibe compras
                        </Chip>
                      ) : null}
                    </td>
                    <td className="text-ink/70 px-3 py-3">
                      {TIPOS_ALMACEN.find((t) => t.valor === a.tipo)?.etiqueta ?? a.tipo}
                    </td>
                    <td className="text-ink/60 px-3 py-3">{a.ubicacion ?? '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <Chip tone={a.activo ? 'success' : 'neutral'}>
                        {a.activo ? 'Activo' : 'Inactivo'}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {edicion ? (
        <Modal
          abierto
          onCerrar={() => setEdicion(null)}
          titulo={edicion.id ? 'Editar almacén' : 'Nuevo almacén'}
          acciones={
            <>
              <Button variant="ghost" onClick={() => setEdicion(null)}>
                Cancelar
              </Button>
              <Button
                disabled={guardar.isPending || !edicion.codigo || !edicion.nombre}
                onClick={async () => {
                  // Los dos campos de tipo viajan como numero o como nada: la
                  // base rechaza una capacidad en un patio, y una cadena vacia
                  // no es cero.
                  await guardar.mutateAsync({
                    ...edicion,
                    capacidad: edicion.capacidad || null,
                    trabajos_a_la_vez: edicion.trabajos_a_la_vez
                      ? Number(edicion.trabajos_a_la_vez)
                      : null,
                  })
                  setEdicion(null)
                }}
              >
                {guardar.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Código"
              placeholder="ALM-GEN"
              value={edicion.codigo}
              onChange={(e) => cambiar({ codigo: e.target.value.toUpperCase() })}
            />
            <Input
              label="Nombre"
              value={edicion.nombre}
              onChange={(e) => cambiar({ nombre: e.target.value })}
            />
            <Select
              label="Tipo"
              value={edicion.tipo}
              onChange={(e) => cambiar({ tipo: e.target.value })}
              opciones={TIPOS_ALMACEN}
            />
            <Input
              label="Ubicación"
              placeholder="Al lado de la planta"
              value={edicion.ubicacion}
              onChange={(e) => cambiar({ ubicacion: e.target.value })}
            />

            {/*
              LO QUE SOLO TIENE SENTIDO EN SU TIPO

              Un patio no tiene tope y un almacen tampoco: la capacidad solo
              significa algo en un tanque, y los trabajos a la vez solo en un
              taller. Se ensena el campo cuando toca en vez de dejarlo siempre a
              la vista pidiendo un dato que en la mayoria de los casos no existe
              — y la base rechaza lo demas, asi que las dos rejas dicen lo mismo.
            */}
            {edicion.tipo === 'COMBUSTIBLE' ? (
              <Input
                label="Capacidad del tanque"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="Litros"
                value={edicion.capacidad}
                onChange={(e) => cambiar({ capacidad: e.target.value })}
                hint="Con esto, el saldo deja de ser «720 L» y pasa a leerse «720 de 5.000»."
              />
            ) : null}

            {edicion.tipo === 'TALLER' ? (
              <Input
                label="Trabajos a la vez"
                type="number"
                min="1"
                step="1"
                placeholder="Opcional"
                value={edicion.trabajos_a_la_vez}
                onChange={(e) => cambiar({ trabajos_a_la_vez: e.target.value })}
                hint="Sin esto, el taller no dice si le queda sitio: no opinar es mejor que inventar."
              />
            ) : null}
          </div>

          <div className="mt-4 space-y-2">
            <label className="text-ink/75 flex cursor-pointer items-center gap-2 text-sm select-none">
              <input
                type="checkbox"
                className="accent-royal-600 size-4"
                checked={edicion.recibe_compras}
                onChange={(e) => cambiar({ recibe_compras: e.target.checked })}
              />
              Es el almacén propuesto al recibir una compra
            </label>
            <label className="text-ink/75 flex cursor-pointer items-center gap-2 text-sm select-none">
              <input
                type="checkbox"
                className="accent-royal-600 size-4"
                checked={edicion.activo}
                onChange={(e) => cambiar({ activo: e.target.checked })}
              />
              Activo
            </label>
          </div>

          {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-4" /> : null}
        </Modal>
      ) : null}
    </>
  )
}
