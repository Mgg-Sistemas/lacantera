import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useAlmacenes } from '@/lib/api/inventario'
import {
  ESTADOS_MAQUINA,
  TIPOS_MAQUINA,
  useGuardarMaquina,
  type Maquina,
} from '@/lib/api/maquinaria'

/**
 * Dar de alta o corregir una máquina.
 *
 * LOS TRES UMBRALES SE PUEDEN TOCAR, Y VAN JUNTOS
 *
 * Vienen en 200, 220 y 250 porque es lo que pidió el encargo, y la mayoría de
 * las máquinas se quedarán así. Pero el fabricante de una puede decir otra
 * cosa, y entonces cambiarlos no puede exigir tocar la base.
 *
 * Van los tres en la misma fila a propósito: el orden entre ellos importa —el
 * aviso antes que la alarma y la alarma antes que el tope— y la base lo exige.
 * Verlos juntos hace evidente esa relación antes de guardar, en vez de después
 * con un error que habla de una restricción.
 */
export function ModalMaquina({
  abierto,
  maquina,
  onCerrar,
}: {
  abierto: boolean
  /** `null` para una máquina nueva. */
  maquina: Maquina | null
  onCerrar: () => void
}) {
  const guardar = useGuardarMaquina()
  const { data: almacenes } = useAlmacenes()

  const [f, setF] = useState({
    codigo: '',
    nombre: '',
    tipo: 'OTRO',
    marca: '',
    modelo: '',
    serial: '',
    anio: '',
    almacen_id: '',
    estado: 'ACTIVA',
    tope_horas: '250',
    aviso_horas: '200',
    alarma_horas: '220',
    nota: '',
  })

  // Al abrir sobre una máquina existente se rellena; al abrir en blanco se
  // limpia. Sin esto, editar una y después crear otra arrastraría los datos de
  // la primera.
  useEffect(() => {
    if (!abierto) return
    setF({
      codigo: maquina?.codigo ?? '',
      nombre: maquina?.nombre ?? '',
      tipo: maquina?.tipo ?? 'OTRO',
      marca: maquina?.marca ?? '',
      modelo: maquina?.modelo ?? '',
      serial: maquina?.serial ?? '',
      anio: maquina?.anio ? String(maquina.anio) : '',
      almacen_id: maquina?.almacen_id ? String(maquina.almacen_id) : '',
      estado: maquina?.estado ?? 'ACTIVA',
      tope_horas: maquina?.tope_horas ?? '250',
      aviso_horas: maquina?.aviso_horas ?? '200',
      alarma_horas: maquina?.alarma_horas ?? '220',
      nota: maquina?.nota ?? '',
    })
  }, [abierto, maquina])

  const cambiar = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))

  const aviso = Number(f.aviso_horas)
  const alarma = Number(f.alarma_horas)
  const tope = Number(f.tope_horas)
  const umbralesEnOrden = aviso <= alarma && alarma <= tope
  const valido = f.codigo.trim() && f.nombre.trim() && tope > 0 && umbralesEnOrden

  const enviar = async () => {
    await guardar.mutateAsync({
      ...(maquina ? { id: maquina.id } : {}),
      codigo: f.codigo.trim(),
      nombre: f.nombre.trim(),
      tipo: f.tipo,
      marca: f.marca,
      modelo: f.modelo,
      serial: f.serial,
      anio: f.anio ? Number(f.anio) : null,
      almacen_id: f.almacen_id ? Number(f.almacen_id) : null,
      estado: f.estado,
      tope_horas: f.tope_horas,
      aviso_horas: f.aviso_horas,
      alarma_horas: f.alarma_horas,
      nota: f.nota,
    } as never)
    onCerrar()
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={maquina ? `Editar ${maquina.nombre}` : 'Nueva máquina'}
      descripcion="El código la identifica en todo el sistema. El tope de horas decide cuándo avisa."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={!valido || guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
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
        <Select
          label="Estado"
          value={f.estado}
          onChange={(e) => cambiar('estado', e.target.value)}
          opciones={ESTADOS_MAQUINA}
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
          <Select
            label="Dónde vive"
            vacio="Sin asignar"
            value={f.almacen_id}
            onChange={(e) => cambiar('almacen_id', e.target.value)}
            opciones={(almacenes ?? []).map((a) => ({
              valor: String(a.id),
              etiqueta: `${a.nombre}${a.tipo === 'TALLER' ? ' (taller)' : ''}`,
            }))}
          />
        </div>
      </div>

      <h3 className="text-ink/85 mt-6 mb-1 text-sm font-semibold">Cuándo avisar</h3>
      <p className="text-ink/50 mb-3 text-xs leading-relaxed">
        Horas desde el último mantenimiento. Los tres van en orden: primero el aviso, después la
        alarma, y el tope al final.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
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
          El aviso tiene que ser menor o igual que la alarma, y la alarma menor o igual que el tope.
        </p>
      ) : null}

      <div className="mt-4">
        <Textarea
          label="Nota"
          rows={2}
          value={f.nota}
          onChange={(e) => cambiar('nota', e.target.value)}
        />
      </div>

      {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-3" /> : null}
    </Modal>
  )
}
