import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Segmento } from '@/components/ui/Segmento'
import { CampoDocumento } from '@/components/CampoDocumento'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import {
  useChoferes,
  useGuardarChofer,
  useGuardarVehiculoDeDespacho,
  useVehiculosDeDespacho,
  type Chofer,
  type VehiculoDeDespacho,
} from '@/lib/api/transporte'

/*
  CHOFERES Y VEHÍCULOS: EL CATÁLOGO ENTERO.

  Angélica, 18/09/2026: «un catálogo en el que vas a permitir editar,
  deshabilitar y agregar datos». Deshabilitar no borra: el chofer o el camión
  deja de ofrecerse al pedir un despacho, y las notas que ya lo nombran siguen
  diciendo lo mismo, porque la nota guarda el texto y no un enlace.
*/

type Pestana = 'choferes' | 'vehiculos'

export function CatalogoTransporte({
  abierto,
  onCerrar,
  puedeEditar,
}: {
  abierto: boolean
  onCerrar: () => void
  puedeEditar: boolean
}) {
  const [pestana, setPestana] = useState<Pestana>('choferes')
  const [filtro, setFiltro] = useState('')

  if (!abierto) return null

  return (
    <Modal
      abierto
      ancho="lg"
      onCerrar={onCerrar}
      titulo="Choferes y vehículos"
      descripcion="Los que se llevan el material. Al pedir un despacho, uno que no esté se añade solo."
      acciones={
        <Button variant="ghost" onClick={onCerrar}>
          Cerrar
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmento
          opciones={[
            { valor: 'choferes', etiqueta: 'Choferes' },
            { valor: 'vehiculos', etiqueta: 'Vehículos' },
          ]}
          valor={pestana}
          onCambio={(v) => {
            setPestana(v as Pestana)
            setFiltro('')
          }}
        />
        <Input
          label="Buscar"
          className="min-w-[200px] flex-1"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder={pestana === 'choferes' ? 'Nombre o cédula' : 'Placa o marca'}
        />
      </div>

      {pestana === 'choferes' ? (
        <Choferes filtro={filtro} puedeEditar={puedeEditar} />
      ) : (
        <Vehiculos filtro={filtro} puedeEditar={puedeEditar} />
      )}
    </Modal>
  )
}

const coincide = (texto: string, filtro: string) =>
  texto.toUpperCase().includes(filtro.trim().toUpperCase())

function Choferes({ filtro, puedeEditar }: { filtro: string; puedeEditar: boolean }) {
  const { data, isPending, error } = useChoferes()
  const guardar = useGuardarChofer()
  const [editando, setEditando] = useState<Partial<Chofer> | null>(null)

  const lista = (data ?? []).filter((c) => coincide(`${c.nombre} ${c.cedula}`, filtro))

  return (
    <>
      {puedeEditar && !editando ? (
        <Button size="sm" variant="soft" className="mb-3" onClick={() => setEditando({})}>
          + Añadir chofer
        </Button>
      ) : null}

      {editando ? (
        <div className="border-hairline rounded-card mb-4 grid gap-3 border border-dashed p-3 sm:grid-cols-[2fr_1fr_auto]">
          <Input
            label="Nombre del chofer"
            value={editando.nombre ?? ''}
            onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
          />
          <CampoDocumento
            label="Cédula"
            valor={editando.cedula ?? ''}
            onCambiar={(v) => setEditando({ ...editando, cedula: v })}
          />
          <div className="flex items-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={
                guardar.isPending ||
                (editando.nombre ?? '').trim().length < 3 ||
                (editando.cedula ?? '').trim().length < 5
              }
              onClick={() =>
                guardar.mutate(
                  {
                    id: editando.id ?? null,
                    nombre: editando.nombre ?? '',
                    cedula: editando.cedula ?? '',
                    activo: editando.activo ?? true,
                  },
                  { onSuccess: () => setEditando(null) },
                )
              }
            >
              Guardar
            </Button>
          </div>
          {guardar.error ? <ErrorDeCarga error={guardar.error} className="sm:col-span-3" /> : null}
        </div>
      ) : null}

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}
      {data && lista.length === 0 ? (
        <Vacio titulo="Ningún chofer" descripcion="Se añaden aquí o al pedir un despacho." />
      ) : null}

      <ul className="divide-hairline divide-y">
        {lista.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className={c.activo ? '' : 'opacity-50'}>
              <p className="text-ink/85 text-sm font-medium">{c.nombre}</p>
              <p className="text-ink/50 tabular text-xs">{c.cedula}</p>
            </div>
            <div className="flex items-center gap-2">
              {!c.activo ? <Chip tone="neutral">Deshabilitado</Chip> : null}
              {puedeEditar ? (
                <>
                  <Button size="sm" variant="ghost" icon={<Pencil />} onClick={() => setEditando(c)}>
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={guardar.isPending}
                    onClick={() => guardar.mutate({ ...c, activo: !c.activo })}
                  >
                    {c.activo ? 'Deshabilitar' : 'Habilitar'}
                  </Button>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

function Vehiculos({ filtro, puedeEditar }: { filtro: string; puedeEditar: boolean }) {
  const { data, isPending, error } = useVehiculosDeDespacho()
  const guardar = useGuardarVehiculoDeDespacho()
  const [editando, setEditando] = useState<Partial<VehiculoDeDespacho> | null>(null)

  const lista = (data ?? []).filter((v) => coincide(`${v.placa} ${v.descripcion ?? ''}`, filtro))

  return (
    <>
      {puedeEditar && !editando ? (
        <Button size="sm" variant="soft" className="mb-3" onClick={() => setEditando({})}>
          + Añadir vehículo
        </Button>
      ) : null}

      {editando ? (
        <div className="border-hairline rounded-card mb-4 grid gap-3 border border-dashed p-3 sm:grid-cols-[2fr_1fr_auto]">
          <Input
            label="Vehículo (marca/modelo)"
            value={editando.descripcion ?? ''}
            onChange={(e) => setEditando({ ...editando, descripcion: e.target.value })}
          />
          <Input
            label="Placa"
            value={editando.placa ?? ''}
            onChange={(e) => setEditando({ ...editando, placa: e.target.value })}
          />
          <div className="flex items-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={guardar.isPending || (editando.placa ?? '').trim().length < 4}
              onClick={() =>
                guardar.mutate(
                  {
                    id: editando.id ?? null,
                    placa: editando.placa ?? '',
                    descripcion: editando.descripcion ?? null,
                    activo: editando.activo ?? true,
                  },
                  { onSuccess: () => setEditando(null) },
                )
              }
            >
              Guardar
            </Button>
          </div>
          {guardar.error ? <ErrorDeCarga error={guardar.error} className="sm:col-span-3" /> : null}
        </div>
      ) : null}

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}
      {data && lista.length === 0 ? (
        <Vacio titulo="Ningún vehículo" descripcion="Se añaden aquí o al pedir un despacho." />
      ) : null}

      <ul className="divide-hairline divide-y">
        {lista.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className={v.activo ? '' : 'opacity-50'}>
              <p className="text-ink/85 tabular font-mono text-sm font-medium">{v.placa}</p>
              <p className="text-ink/50 text-xs">{v.descripcion ?? 'Sin marca/modelo'}</p>
            </div>
            <div className="flex items-center gap-2">
              {!v.activo ? <Chip tone="neutral">Deshabilitado</Chip> : null}
              {puedeEditar ? (
                <>
                  <Button size="sm" variant="ghost" icon={<Pencil />} onClick={() => setEditando(v)}>
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={guardar.isPending}
                    onClick={() => guardar.mutate({ ...v, activo: !v.activo })}
                  >
                    {v.activo ? 'Deshabilitar' : 'Habilitar'}
                  </Button>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
