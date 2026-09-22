import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { CampoDocumento } from '@/components/CampoDocumento'
import { ErrorDeCarga } from '@/components/ui/Estado'
import {
  cedulaComparable,
  placaLimpia,
  useChoferes,
  useGuardarChofer,
  useGuardarVehiculoDeDespacho,
  useVehiculosDeDespacho,
} from '@/lib/api/transporte'
import { useGuardarCamionesDeNota } from '@/lib/api/salidas'
import type { CamionDeNota } from '@/lib/api/ventas'
import { documento, enteros } from '@/lib/formato'
import {
  camionVacio,
  camionesParaEditar,
  camionesParaGuardar,
  faltaEnLosCamiones,
  type CamionEnEdicion,
} from './camiones'

/*
  LOS CAMIONES DE UNA NOTA DE ENTREGA, LOS QUE HAGAN FALTA.

  Quien despacha, 22/09/2026: la nota que nace de una salida «me genera la nota
  de entrega sin información de los camiones», y «fueron 2 camiones, si se
  puede adjuntar la información de los 2 de una vez».

  Es una lista: cada fila un camión con su chofer, su placa y, si lo hay, su
  ticket de romana y su peso neto. Se añaden filas con «Otro camión» y se quita
  cualquiera con la papelera. Lo que se ve al guardar es lo que queda.

  EL CHOFER Y EL VEHÍCULO SALEN DEL CATÁLOGO, y si no están se añaden desde
  aquí mismo —nombre y cédula, placa y descripción— sin salir de la ventana.
  Es el mismo trato que el formulario de la nota de entrega de siempre: los
  datos «se van convirtiendo en un catálogo» (Angélica, 18/09/2026).
*/

/* ─────────────────────────────────────────────────────────── el editor */

export function CamionesDeLaNota({
  filas,
  onCambio,
}: {
  filas: CamionEnEdicion[]
  onCambio: (filas: CamionEnEdicion[]) => void
}) {
  const cambiar = (clave: string, parte: Partial<CamionEnEdicion>) =>
    onCambio(filas.map((c) => (c.clave === clave ? { ...c, ...parte } : c)))

  return (
    <div className="space-y-3">
      {filas.map((c, i) => (
        <FilaDeCamion
          key={c.clave}
          numero={i + 1}
          camion={c}
          onCambio={(parte) => cambiar(c.clave, parte)}
          onQuitar={filas.length > 1 ? () => onCambio(filas.filter((x) => x.clave !== c.clave)) : undefined}
        />
      ))}
      <Button size="sm" variant="outline" icon={<Plus />} onClick={() => onCambio([...filas, camionVacio()])}>
        Otro camión
      </Button>
    </div>
  )
}

function FilaDeCamion({
  numero,
  camion,
  onCambio,
  onQuitar,
}: {
  numero: number
  camion: CamionEnEdicion
  onCambio: (parte: Partial<CamionEnEdicion>) => void
  onQuitar?: () => void
}) {
  const { data: choferes } = useChoferes()
  const { data: vehiculos } = useVehiculosDeDespacho()
  const guardarChofer = useGuardarChofer()
  const guardarVehiculo = useGuardarVehiculoDeDespacho()
  const [nuevoChofer, setNuevoChofer] = useState('')
  const [nuevaCedula, setNuevaCedula] = useState('')
  const [nuevoVehiculo, setNuevoVehiculo] = useState('')
  const [nuevaPlaca, setNuevaPlaca] = useState('')

  return (
    <div className="border-hairline rounded-card border p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-ink/55 text-xs font-medium tracking-wide uppercase">Camión {numero}</p>
        {onQuitar ? (
          <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={onQuitar}>
            Quitar
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <SelectBuscable
            label="Chofer"
            vacio="Busca el chofer…"
            valor={camion.chofer_id}
            onCambio={(v) => onCambio({ chofer_id: v })}
            opciones={(choferes ?? [])
              .filter((c) => c.activo || String(c.id) === camion.chofer_id)
              .map((c) => ({ valor: String(c.id), etiqueta: `${c.nombre} · ${documento(c.cedula)}` }))}
          />
          {camion.chofer_id === '' ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
              <Input
                label="¿No está? Nombre"
                value={nuevoChofer}
                onChange={(e) => setNuevoChofer(e.target.value)}
              />
              <CampoDocumento label="Cédula" valor={nuevaCedula} onCambiar={setNuevaCedula} />
              <div className="flex items-end">
                <Button
                  variant="outline"
                  disabled={
                    guardarChofer.isPending ||
                    nuevoChofer.trim().length < 3 ||
                    cedulaComparable(nuevaCedula).length < 5
                  }
                  onClick={() =>
                    guardarChofer.mutate(
                      { nombre: nuevoChofer, cedula: nuevaCedula },
                      {
                        onSuccess: (id) => {
                          onCambio({ chofer_id: String(id) })
                          setNuevoChofer('')
                          setNuevaCedula('')
                        },
                      },
                    )
                  }
                >
                  + Añadir
                </Button>
              </div>
            </div>
          ) : null}
          {guardarChofer.error ? <ErrorDeCarga error={guardarChofer.error} className="mt-2" /> : null}
        </div>

        <div>
          <SelectBuscable
            label="Vehículo"
            vacio="Busca el vehículo…"
            valor={camion.vehiculo_id}
            onCambio={(v) => onCambio({ vehiculo_id: v })}
            opciones={(vehiculos ?? [])
              .filter((v) => v.activo || String(v.id) === camion.vehiculo_id)
              .map((v) => ({
                valor: String(v.id),
                etiqueta: `${v.placa}${v.descripcion ? ` · ${v.descripcion}` : ''}`,
              }))}
          />
          {camion.vehiculo_id === '' ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
              <Input
                label="¿No está? Marca / modelo"
                value={nuevoVehiculo}
                onChange={(e) => setNuevoVehiculo(e.target.value)}
              />
              <Input label="Placa" value={nuevaPlaca} onChange={(e) => setNuevaPlaca(e.target.value)} />
              <div className="flex items-end">
                <Button
                  variant="outline"
                  disabled={guardarVehiculo.isPending || placaLimpia(nuevaPlaca).length < 4}
                  onClick={() =>
                    guardarVehiculo.mutate(
                      { placa: nuevaPlaca, descripcion: nuevoVehiculo },
                      {
                        onSuccess: (id) => {
                          onCambio({ vehiculo_id: String(id) })
                          setNuevoVehiculo('')
                          setNuevaPlaca('')
                        },
                      },
                    )
                  }
                >
                  + Añadir
                </Button>
              </div>
            </div>
          ) : null}
          {guardarVehiculo.error ? <ErrorDeCarga error={guardarVehiculo.error} className="mt-2" /> : null}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Input
          label="Ticket de romana"
          value={camion.ticket}
          onChange={(e) => onCambio({ ticket: e.target.value })}
          hint="Opcional."
        />
        <Input
          label="Peso neto (kg)"
          inputMode="decimal"
          value={camion.peso_neto}
          onChange={(e) => onCambio({ peso_neto: e.target.value })}
          hint="Opcional. Lo que cargó este camión."
        />
      </div>
    </div>
  )
}

/* ───────────────────────────────────────── la lista, como se lee en el detalle */

export function ListaDeCamiones({ camiones }: { camiones: CamionDeNota[] }) {
  if (camiones.length === 0) return null
  return (
    <ul className="mt-3 space-y-1">
      {camiones.map((c, i) => (
        <li key={c.id} className="text-ink/70 text-sm">
          <span className="text-ink/45 text-xs">Camión {i + 1} · </span>
          {[
            c.vehiculo,
            c.chofer,
            c.cedula_chofer ? documento(c.cedula_chofer) : null,
            c.ticket ? `ticket ${c.ticket}` : null,
            c.peso_neto ? `neto ${enteros(c.peso_neto)} kg` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </li>
      ))}
    </ul>
  )
}

/* ────────────────────────────────────── la ventana para ponerlos después */

/**
 * Para una nota que ya existe: la generada desde una salida que salió sin
 * camiones, o una de siempre a la que hay que añadirle el segundo. Se abre
 * desde el detalle de la nota y desde la nota de salida que la dejó.
 */
export function ModalCamiones({
  notaId,
  numero,
  camiones,
  onCerrar,
}: {
  notaId: number
  numero: string
  camiones: CamionDeNota[]
  onCerrar: () => void
}) {
  const guardar = useGuardarCamionesDeNota()
  const [filas, setFilas] = useState<CamionEnEdicion[]>(() => camionesParaEditar(camiones))
  const falta = faltaEnLosCamiones(filas)

  return (
    <Modal
      abierto
      ancho="lg"
      onCerrar={onCerrar}
      titulo={`Camiones de ${numero}`}
      descripcion="Con qué se llevó el material. Salen en el papel de la nota de entrega, uno debajo del otro."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={guardar.isPending || falta !== null}
            onClick={() =>
              guardar.mutate({ nota_id: notaId, camiones: camionesParaGuardar(filas) }, { onSuccess: onCerrar })
            }
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <CamionesDeLaNota filas={filas} onCambio={setFilas} />
      {falta ? <p className="text-warning mt-3 text-sm">{falta}</p> : null}
      {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-3" /> : null}
    </Modal>
  )
}
