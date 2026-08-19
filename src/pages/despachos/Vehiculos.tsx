import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Plus, Truck } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { SemaforoMantenimiento } from '@/components/SemaforoMantenimiento'
import { useMaquinaria } from '@/lib/api/maquinaria'
import { TIPOS_VEHICULO, useGuardarVehiculo, useVehiculos } from '@/lib/api/vehiculos'
import type { Vehiculo } from '@/lib/api/vehiculos'
import { useMisPermisos } from '@/lib/api/usuarios'
import { cn } from '@/lib/cn'

function metros(valor: string | null): string {
  if (valor === null) return '—'
  return `${Number(valor).toLocaleString('es-VE', { maximumFractionDigits: 2 })} m³`
}

/**
 * Los vehículos que entran al patio.
 *
 * ESTÁ AQUÍ Y NO EN CONFIGURACIÓN
 *
 * Quien da de alta un camión es quien lo ve llegar, no quien administra el
 * sistema. Escondido en Configuración, el día que aparece un transportista
 * nuevo nadie lo carga y la placa vuelve a escribirse a mano.
 *
 * LO PRIMERO DE CADA FILA ES CUÁNTO CARGA
 *
 * Es el dato por el que existe la pantalla. La placa identifica; la capacidad
 * es lo que se consulta.
 */
export function Vehiculos() {
  const { data, isPending, error } = useVehiculos(false)
  const { puede } = useMisPermisos()
  const [editando, setEditando] = useState<Vehiculo | null | undefined>(undefined)

  const puedeEscribir = puede('DESPACHOS', 'ESCRITURA')

  const propios = (data ?? []).filter((v) => v.propio)
  const ajenos = (data ?? []).filter((v) => !v.propio)

  return (
    <>
      <PageHeader
        title="Vehículos"
        description="La flota propia y la de los transportistas, con lo que carga cada uno. Es lo que permite saber si un despacho cabe en el camión."
        actions={
          puedeEscribir ? (
            <Button icon={<Plus />} onClick={() => setEditando(null)}>
              Nuevo vehículo
            </Button>
          ) : undefined
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {!isPending && !error && (data ?? []).length === 0 ? (
        <Card>
          <Vacio
            icono={<Truck />}
            titulo="No hay vehículos cargados"
            descripcion="Mientras no los haya, la placa se sigue escribiendo a mano en cada pesaje y nadie contrasta lo despachado con lo que cabe."
            accion={
              puedeEscribir ? (
                <Button icon={<Plus />} onClick={() => setEditando(null)}>
                  Cargar el primero
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : null}

      {propios.length > 0 ? (
        <Grupo
          titulo="De la empresa"
          nota="Llevan horómetro y mantenimiento. El semáforo viene de su ficha en Maquinaria."
          vehiculos={propios}
          puedeEscribir={puedeEscribir}
          onEditar={setEditando}
        />
      ) : null}

      {ajenos.length > 0 ? (
        <Grupo
          titulo="De transportistas"
          nota="No se les lleva mantenimiento: no son de la empresa. Se cargan por la capacidad y para no volver a escribir la placa."
          vehiculos={ajenos}
          puedeEscribir={puedeEscribir}
          onEditar={setEditando}
        />
      ) : null}

      <ModalVehiculo
        abierto={editando !== undefined}
        vehiculo={editando ?? null}
        onCerrar={() => setEditando(undefined)}
      />
    </>
  )
}

function Grupo({
  titulo,
  nota,
  vehiculos,
  puedeEscribir,
  onEditar,
}: {
  titulo: string
  nota: string
  vehiculos: Vehiculo[]
  puedeEscribir: boolean
  onEditar: (v: Vehiculo) => void
}) {
  return (
    <section className="mb-6">
      <h2 className="text-ink/80 text-sm font-semibold">{titulo}</h2>
      <p className="text-ink/50 mt-0.5 mb-3 text-xs leading-relaxed">{nota}</p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {vehiculos.map((v) => (
          <Card key={v.id} className={cn('flex h-full flex-col', !v.activo && 'opacity-55')}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-ink/90 font-mono text-lg font-semibold tracking-[0.06em]">
                  {v.placa}
                </p>
                <p className="text-ink/50 mt-0.5 truncate text-xs">
                  {TIPOS_VEHICULO.find((t) => t.valor === v.tipo)?.etiqueta ?? v.tipo}
                  {v.descripcion ? ` · ${v.descripcion}` : ''}
                </p>
              </div>
              {v.semaforo_mantenimiento ? (
                <SemaforoMantenimiento estado={v.semaforo_mantenimiento} />
              ) : null}
            </div>

            <p className="text-ink/85 mt-3 text-sm">
              Carga <span className="tabular font-semibold">{metros(v.capacidad_m3)}</span>
              {v.capacidad_ton ? (
                <span className="text-ink/50">
                  {' '}
                  · {Number(v.capacidad_ton).toLocaleString('es-VE')} TON
                </span>
              ) : null}
            </p>

            {v.transportista ? (
              <p className="text-ink/55 mt-1 text-xs">{v.transportista}</p>
            ) : null}
            {v.maquina ? (
              <p className="text-ink/45 mt-1 text-xs">
                Ficha: {v.maquina_codigo} · {v.maquina}
              </p>
            ) : null}
            {v.chofer_actual ? (
              <p className="text-ink/55 mt-1 text-xs">Lo maneja {v.chofer_actual}</p>
            ) : null}

            <div className="grow" />

            <div className="mt-3 flex items-center justify-between gap-2">
              {!v.activo ? <Chip tone="neutral">Fuera de servicio</Chip> : <span />}
              <div className="flex gap-1">
                <Link to={`/app/despachos/vehiculos/${v.id}`}>
                  <Button size="sm" variant="soft">
                    Ver ficha
                  </Button>
                </Link>
                {puedeEscribir ? (
                  <Button size="sm" variant="ghost" onClick={() => onEditar(v)}>
                    Editar
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  )
}

/**
 * Alta y corrección de un vehículo.
 *
 * LA CAPACIDAD EN TONELADAS SE DEJA VACÍA SI NADIE LA PESÓ
 *
 * Se podría deducir de los metros cúbicos multiplicando por una densidad, y
 * saldría un número redondo y falso: depende del material que lleve. Vacía, la
 * pantalla simplemente no la muestra. Deducida, alguien carga de más.
 */
function ModalVehiculo({
  abierto,
  vehiculo,
  onCerrar,
}: {
  abierto: boolean
  vehiculo: Vehiculo | null
  onCerrar: () => void
}) {
  const guardar = useGuardarVehiculo()
  const { data: maquinas } = useMaquinaria(true)

  const [f, setF] = useState({
    placa: '',
    tipo: 'VOLTEO',
    descripcion: '',
    capacidad_m3: '',
    capacidad_ton: '',
    propio: true,
    transportista: '',
    maquina_id: '',
    activo: true,
    nota: '',
  })

  useEffect(() => {
    if (!abierto) return
    setF({
      placa: vehiculo?.placa ?? '',
      tipo: vehiculo?.tipo ?? 'VOLTEO',
      descripcion: vehiculo?.descripcion ?? '',
      capacidad_m3: vehiculo?.capacidad_m3 ?? '',
      capacidad_ton: vehiculo?.capacidad_ton ?? '',
      propio: vehiculo?.propio ?? true,
      transportista: vehiculo?.transportista ?? '',
      maquina_id: vehiculo?.maquina_id ? String(vehiculo.maquina_id) : '',
      activo: vehiculo?.activo ?? true,
      nota: vehiculo?.nota ?? '',
    })
  }, [abierto, vehiculo])

  const cambiar = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }))

  const valido =
    f.placa.trim().length >= 4 &&
    Number(f.capacidad_m3) > 0 &&
    (f.propio || f.transportista.trim().length > 0)

  const enviar = async () => {
    await guardar.mutateAsync({
      ...(vehiculo ? { id: vehiculo.id } : {}),
      placa: f.placa.trim(),
      tipo: f.tipo,
      descripcion: f.descripcion.trim() || null,
      capacidad_m3: f.capacidad_m3,
      capacidad_ton: f.capacidad_ton || null,
      propio: f.propio,
      transportista: f.propio ? null : f.transportista.trim(),
      maquina_id: f.propio && f.maquina_id ? Number(f.maquina_id) : null,
      activo: f.activo,
      nota: f.nota.trim() || null,
    } as never)
    onCerrar()
  }

  // Las máquinas que se pueden enlazar: solo las que ruedan.
  const rodantes = (maquinas ?? []).filter((m) => m.tipo === 'CAMION' || m.tipo === 'VEHICULO')

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={vehiculo ? `Editar ${vehiculo.placa}` : 'Nuevo vehículo'}
      descripcion="La placa se guarda en mayúsculas y sin espacios: es un identificador, no un texto libre."
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
          label="Placa"
          placeholder="A12BC3D"
          value={f.placa}
          onChange={(e) => cambiar('placa', e.target.value)}
        />
        <Select
          label="Tipo"
          value={f.tipo}
          onChange={(e) => cambiar('tipo', e.target.value)}
          opciones={TIPOS_VEHICULO}
        />
        <div className="sm:col-span-2">
          <Input
            label="Descripción"
            placeholder="Volteo Toronto del patio"
            value={f.descripcion}
            onChange={(e) => cambiar('descripcion', e.target.value)}
          />
        </div>
      </div>

      <h3 className="text-ink/85 mt-6 mb-1 text-sm font-semibold">Cuánto carga</h3>
      <p className="text-ink/50 mb-3 text-xs leading-relaxed">
        Los metros cúbicos son obligatorios: es la medida con la que se despacha hoy. Las toneladas
        quedan vacías hasta que alguien las pese — deducirlas de los metros cúbicos da un número
        distinto según el material.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Metros cúbicos"
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          placeholder="18"
          value={f.capacidad_m3}
          onChange={(e) => cambiar('capacidad_m3', e.target.value)}
        />
        <Input
          label="Toneladas"
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          placeholder="Si se pesó"
          value={f.capacidad_ton}
          onChange={(e) => cambiar('capacidad_ton', e.target.value)}
        />
      </div>

      <h3 className="text-ink/85 mt-6 mb-3 text-sm font-semibold">De quién es</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          {
            propio: true,
            titulo: 'De la empresa',
            detalle: 'Se le lleva horómetro y mantenimiento.',
          },
          {
            propio: false,
            titulo: 'De un transportista',
            detalle: 'Solo se registra para despachar.',
          },
        ].map((o) => (
          <button
            key={String(o.propio)}
            type="button"
            onClick={() => cambiar('propio', o.propio)}
            className={cn(
              'rounded-card border p-3 text-left transition-colors',
              f.propio === o.propio
                ? 'border-royal-600 bg-royal-600/5'
                : 'border-hairline hover:border-royal-300',
            )}
          >
            <p className="text-ink/90 text-sm font-medium">{o.titulo}</p>
            <p className="text-ink/50 mt-0.5 text-xs">{o.detalle}</p>
          </button>
        ))}
      </div>

      {f.propio ? (
        <div className="mt-4">
          <Select
            label="Ficha en Maquinaria"
            vacio="Sin enlazar"
            value={f.maquina_id}
            onChange={(e) => cambiar('maquina_id', e.target.value)}
            opciones={rodantes.map((m) => ({
              valor: String(m.id),
              etiqueta: `${m.codigo} · ${m.nombre}`,
            }))}
            hint="Enlazarlo hace que el semáforo de mantenimiento se vea aquí y al momento de despachar."
          />
        </div>
      ) : (
        <div className="mt-4">
          <Input
            label="Transportista"
            placeholder="Nombre de la empresa o del dueño"
            value={f.transportista}
            onChange={(e) => cambiar('transportista', e.target.value)}
          />
        </div>
      )}

      <div className="mt-4">
        <Textarea
          label="Nota"
          rows={2}
          value={f.nota}
          onChange={(e) => cambiar('nota', e.target.value)}
        />
      </div>

      {vehiculo ? (
        <label className="text-ink/70 mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={f.activo}
            onChange={(e) => cambiar('activo', e.target.checked)}
            className="accent-royal-600 size-4"
          />
          En servicio
        </label>
      ) : null}

      {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-3" /> : null}
    </Modal>
  )
}
