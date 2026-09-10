import { useState } from 'react'
import { Plus, Warehouse } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_SITIOS } from '@/components/pestanasDeModulos'
import { DeQuienEs } from '@/components/DeQuienEs'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import {
  TIPOS_ALMACEN,
  useAlmacenes,
  useGuardarAlmacen,
  usePropietarios,
} from '@/lib/api/inventario'
import type { Almacen } from '@/lib/api/inventario'
import { useEmpleados } from '@/lib/api/nomina'

const vacio = {
  codigo: '',
  nombre: '',
  tipo: 'ALMACEN',
  ubicacion: '',
  recibe_compras: false,
  activo: true,
  propietario: 'LACANTERA',
  responsable_id: '',
  capacidad: '',
  trabajos_a_la_vez: '',
}

export function Almacenes() {
  // `true` al final: esta es la pantalla donde se administran, así que aquí
  // sí aparecen los sitios que no guardan material.
  const { data, isPending, error } = useAlmacenes(false, true)
  const guardar = useGuardarAlmacen()
  const { data: propietarios } = usePropietarios()
  const { data: empleados } = useEmpleados(true)
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
            propietario: a.propietario ?? 'LACANTERA',
            responsable_id: a.responsable_id ? String(a.responsable_id) : '',
            capacidad: a.capacidad ?? '',
            trabajos_a_la_vez: a.trabajos_a_la_vez ? String(a.trabajos_a_la_vez) : '',
          }
        : { ...vacio },
    )

  const cambiar = (c: Partial<typeof vacio>) => setEdicion((e) => (e ? { ...e, ...c } : e))

  /* Solo los activos vienen del gancho: quien lleve un almacén y ya no trabaje
     aquí sale como «Sin asignar», que es la verdad —nadie responde— y no un
     nombre que ya no se puede llamar. */
  const nombreDe = (id?: number | null) => {
    const e = (empleados ?? []).find((x) => x.id === id)
    return e ? `${e.nombres} ${e.apellidos}` : null
  }

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
                  {/* A quién se le pregunta. Va en la tabla y no solo dentro del
                      formulario: la pregunta «¿quién lleva este almacén?» se
                      hace mirando la lista, no abriendo once fichas. */}
                  <th className="px-3 py-3 font-medium">Responsable</th>
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

                      {/* La marca de lo ajeno vive en un solo sitio: se dibuja
                          igual aquí, en existencias, en los traslados y en las
                          máquinas. Ver `DeQuienEs`. */}
                      <DeQuienEs propietario={a.propietario} className="ml-2" />
                    </td>
                    <td className="text-ink/70 px-3 py-3">
                      {TIPOS_ALMACEN.find((t) => t.valor === a.tipo)?.etiqueta ?? a.tipo}
                    </td>
                    <td className="text-ink/60 px-3 py-3">{a.ubicacion ?? '—'}</td>
                    <td className="text-ink/60 px-3 py-3">
                      {nombreDe(a.responsable_id) ?? (
                        <span className="text-ink/35">Sin asignar</span>
                      )}
                    </td>
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
                    // Vacío es nadie, y llega como nadie: la base lo escribe tal
                    // cual para que se pueda soltar el cargo.
                    responsable_id: edicion.responsable_id
                      ? Number(edicion.responsable_id)
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

            {/*
              DE QUIÉN ES LO QUE SE GUARDA AQUÍ.

              Christopher: «hay elementos, sillas, mesas, equipos, etc. que son
              de la gobernación, entre los items que tiene a disposición la
              cantera». El dueño va en el ALMACÉN y no en el artículo: veinte
              sillas pueden ser ocho de ellos y doce compradas, y marcar el
              artículo obligaría a inventar dos sillas distintas.

              La base no deja cambiarlo con el almacén lleno —reescribiría de
              quién es lo que hay dentro sin un asiento que lo explique— y
              tampoco deja trasladar entre dueños: eso no es mover, es cambiar
              de dueño, y no lo decide quien carga una silla.
            */}
            <Select
              label="De quién es lo que guarda"
              value={edicion.propietario}
              onChange={(e) => cambiar({ propietario: e.target.value })}
              hint={
                edicion.id
                  ? 'Solo se puede cambiar con el almacén vacío.'
                  : 'Lo que entre aquí será de este dueño.'
              }
              opciones={(propietarios ?? []).map((d) => ({
                valor: d.codigo,
                etiqueta: d.es_la_casa ? `${d.nombre} (nosotros)` : d.nombre,
              }))}
            />
            {/*
              QUIÉN RESPONDE POR ESTE SITIO.

              Christopher: «se nos solicita que un empleado pueda ser responsable
              de algún área, como almacén(es), es decir, un empleado puede tener
              a su cargo uno o más almacenes».

              Por eso el cargo se elige AQUÍ, en el almacén, y no como una lista
              de almacenes en la ficha del empleado. Puesto en el almacén, que la
              misma persona lleve tres sale gratis —se elige tres veces— y cada
              sitio conserva una sola respuesta a «¿a quién le pregunto?». Al
              revés habría hecho falta una tabla intermedia para lo mismo.

              Se puede dejar en nadie. Un almacén sin encargado es un hecho —pasa
              cuando alguien se va— y obligar a rellenarlo solo consigue que se
              ponga a cualquiera para poder guardar.
            */}
            <SelectBuscable
              label="Quién responde por él"
              vacio="Nadie por ahora"
              valor={edicion.responsable_id}
              onCambio={(v) => cambiar({ responsable_id: v })}
              hint="Una misma persona puede llevar varios almacenes: se la elige en cada uno."
              opciones={(empleados ?? []).map((e) => ({
                valor: String(e.id),
                codigo: e.ficha,
                nombre: `${e.nombres} ${e.apellidos}`,
                detalle: e.cargo,
              }))}
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
