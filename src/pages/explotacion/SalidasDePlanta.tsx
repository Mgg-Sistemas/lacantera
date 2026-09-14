/*
  Salidas de planta.

  Lo que quien lleva la planta pidió: un registro de lo que SALE, camión por
  camión, separado de facturación. El reparto interno de la planta no se
  puede medir; lo que sale sí.

  TRES CAMPOS Y UN BOTÓN, EN COLUMNA

  Se carga desde un teléfono, en planta, con sol y polvo, veinte o treinta
  veces al día. Por eso el formulario no copia la fila apretada de Viajes:
  va en vertical, con targets grandes, y los m³ se llenan solos al elegir el
  camión. El historial del día está en su propia pestaña para que la de
  cargar quede limpia.

  LO QUE NO SE SABE VA EN BLANCO. Un camión sin carga útil sale con los m³ en
  blanco, no en cero, y el pie lo cuenta.
*/
import { useState } from 'react'
import { Ban, Plus, Truck } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useVehiculos } from '@/lib/api/vehiculos'
import {
  useAnularSalida,
  useProductosDePlanta,
  useRegistrarSalida,
  useSalidasDelDia,
  type SalidaPlanta,
} from '@/lib/api/salidasPlanta'
import { useMisAcciones } from '@/lib/api/usuarios'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { enteros } from '@/lib/formato'
import { cn } from '@/lib/cn'

const aTexto = (v: unknown): string => (v == null ? '' : String(v))

export function SalidasDePlanta() {
  const [dia, setDia] = useState(hoyEnCaracas())
  const [pestana, setPestana] = useState<'cargar' | 'dia'>('cargar')

  const salidas = useSalidasDelDia(dia)
  const vivas = (salidas.data ?? []).filter((s) => s.estado === 'REGISTRADO')
  const m3 = vivas.reduce((s, x) => s + Number(x.m3 ?? 0), 0)
  const sinM3 = vivas.filter((x) => x.m3 === null).length

  return (
    <>
      <PageHeader
        title="Salidas de planta"
        description="Cada camión que sale de la planta con un producto. Es lo que se mide de verdad: los metros cúbicos son la carga útil del camión, estimados."
      />

      <Card className="mb-4">
        <Input
          label="Día"
          type="date"
          value={dia}
          onChange={(e) => setDia(e.target.value)}
          className="max-w-xs"
        />
        <p className="text-ink/60 mt-3 text-sm">
          <span className="tabular font-medium">{vivas.length}</span> salidas ·{' '}
          <span className="tabular font-medium">{enteros(m3)}</span> m³ estimados
          {sinM3 > 0 ? <span className="text-warning"> · {sinM3} sin m³</span> : null}
        </p>
      </Card>

      <div className="border-hairline mb-5 flex gap-1 border-b">
        {(
          [
            { id: 'cargar', etiqueta: 'Anotar salida' },
            { id: 'dia', etiqueta: 'Salidas del día' },
          ] as const
        ).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPestana(p.id)}
            aria-current={pestana === p.id}
            className={cn(
              '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              pestana === p.id
                ? 'border-royal-600 text-royal-700 dark:text-royal-300'
                : 'text-ink/55 hover:text-ink/80 border-transparent',
            )}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {pestana === 'cargar' ? (
        <AnotarSalida dia={dia} />
      ) : (
        <SalidasDelDia
          salidas={salidas.data ?? []}
          cargando={salidas.isPending}
          error={salidas.error}
        />
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════════════ anotar una salida */

function AnotarSalida({ dia }: { dia: string }) {
  const camiones = useVehiculos(true)
  const productos = useProductosDePlanta()
  const registrar = useRegistrarSalida()
  const { puede } = useMisAcciones()

  const [vehiculo, setVehiculo] = useState('')
  const [producto, setProducto] = useState('')
  const [m3, setM3] = useState('')

  const elegido = (camiones.data ?? []).find((c) => String(c.id) === vehiculo)
  const sugerido = aTexto(elegido?.carga_util_m3)
  const m3Efectivo = m3 === '' ? sugerido : m3
  const valido =
    Number(vehiculo) > 0 && Number(producto) > 0 && (m3Efectivo === '' || Number(m3Efectivo) > 0)

  if (!puede('EXPLOTACION.REGISTRAR_SALIDAS')) {
    return (
      <Vacio
        icono={<Truck />}
        titulo="Tu rol no anota salidas"
        descripcion="Puedes ver las del día en la otra pestaña."
      />
    )
  }

  if (productos.isPending || camiones.isPending) return <Cargando />
  if (productos.error) return <ErrorDeCarga error={productos.error} />

  if ((productos.data ?? []).length === 0) {
    return (
      <Vacio
        icono={<Truck />}
        titulo="Todavía no hay productos de planta"
        descripcion="Cárgalos por la planilla de artículos con categoría PRODUCTO (arena lavada, piedra picada…). Sin ellos no hay qué anotar."
      />
    )
  }

  const enviar = async () => {
    await registrar.mutateAsync({
      fecha: dia,
      vehiculo_id: Number(vehiculo),
      producto_id: Number(producto),
      m3: m3Efectivo === '' ? null : Number(m3Efectivo),
    })
    setM3('')
  }

  return (
    <Card className="max-w-md">
      <div className="grid gap-4">
        <Select
          label="Camión"
          vacio="Elige el camión"
          value={vehiculo}
          onChange={(e) => {
            setVehiculo(e.target.value)
            setM3('')
          }}
          opciones={(camiones.data ?? []).map((c) => ({
            valor: String(c.id),
            etiqueta: c.transportista ? `${c.placa} · ${c.transportista}` : c.placa,
          }))}
        />
        <Select
          label="Producto"
          vacio="Elige el producto"
          value={producto}
          onChange={(e) => setProducto(e.target.value)}
          opciones={(productos.data ?? []).map((p) => ({ valor: String(p.id), etiqueta: p.nombre }))}
        />
        <Input
          label="Metros cúbicos (estimado)"
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          value={m3Efectivo}
          onChange={(e) => setM3(e.target.value)}
          hint={
            !elegido
              ? 'Se llena solo al elegir el camión.'
              : sugerido
                ? `La carga útil de ${elegido.placa} es ${sugerido} m³. Cámbialo si trajo otra cosa.`
                : `${elegido.placa} no tiene carga útil cargada: pon los m³ o queda sin medir.`
          }
        />
        <Button
          icon={<Plus />}
          size="lg"
          block
          disabled={!valido || registrar.isPending}
          onClick={() => void enviar()}
        >
          {registrar.isPending ? 'Anotando…' : 'Anotar salida'}
        </Button>
        {registrar.isSuccess && !registrar.isPending ? (
          <p className="text-ink/55 text-center text-sm">Anotada. El camión queda elegido para la siguiente.</p>
        ) : null}
        {registrar.error ? <ErrorDeCarga error={registrar.error} /> : null}
      </div>
    </Card>
  )
}

/* ═══════════════════════════════════════════════════════ las salidas del día */

function SalidasDelDia({
  salidas,
  cargando,
  error,
}: {
  salidas: SalidaPlanta[]
  cargando: boolean
  error: unknown
}) {
  const { puede } = useMisAcciones()
  const [anulando, setAnulando] = useState<SalidaPlanta | null>(null)

  if (cargando) return <Cargando />
  if (error) return <ErrorDeCarga error={error} />

  if (salidas.length === 0) {
    return (
      <Vacio
        icono={<Truck />}
        titulo="Ese día no salió nada de la planta"
        descripcion="Lo que se anote aparece aquí, camión por camión."
      />
    )
  }

  return (
    <>
      <Card flush>
        <ul className="divide-hairline divide-y">
          {salidas.map((s) => (
            <li
              key={s.id}
              className={cn('flex items-center gap-3 px-4 py-3', s.estado === 'ANULADO' && 'opacity-50')}
            >
              <div className="min-w-0 flex-1">
                <p className="text-ink/85 text-sm font-medium">
                  {s.placa} · {s.producto}
                </p>
                <p className="text-ink/45 text-xs">
                  {s.numero}
                  {s.transportista ? ` · ${s.transportista}` : ''}
                  {s.estado === 'ANULADO' ? ` · Anulada: ${s.motivo_anulacion ?? ''}` : ''}
                </p>
              </div>
              <Chip tone={s.m3 === null ? 'warning' : 'neutral'}>
                {s.m3 === null ? 'Sin m³' : `${enteros(s.m3)} m³`}
              </Chip>
              {s.estado === 'REGISTRADO' && puede('EXPLOTACION.ANULAR_SALIDA') ? (
                <Button variant="ghost" size="sm" onClick={() => setAnulando(s)} title="Anular">
                  <Ban className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      {anulando ? <AnularSalida salida={anulando} onCerrar={() => setAnulando(null)} /> : null}
    </>
  )
}

function AnularSalida({ salida, onCerrar }: { salida: SalidaPlanta; onCerrar: () => void }) {
  const anular = useAnularSalida()
  const [motivo, setMotivo] = useState('')

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Anular la salida ${salida.numero}`}
      descripcion="No se borra: queda anulada con el motivo. Si ya entró al centro de costo, allí aparece para reversarla."
      ancho="sm"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            No anular
          </Button>
          <Button
            variant="danger"
            disabled={anular.isPending || motivo.trim().length < 4}
            onClick={async () => {
              await anular.mutateAsync({ id: salida.id, motivo })
              onCerrar()
            }}
          >
            {anular.isPending ? 'Anulando…' : 'Sí, anular'}
          </Button>
        </>
      }
    >
      <Textarea
        label="Por qué se anula"
        rows={2}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
      />
      {anular.error ? <ErrorDeCarga error={anular.error} className="mt-3" /> : null}
    </Modal>
  )
}
