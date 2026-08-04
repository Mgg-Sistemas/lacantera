import { useState } from 'react'
import { Mountain, Plus } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { enteros, fecha } from '@/lib/formato'
import { useMisPermisos } from '@/lib/api/usuarios'
import {
  ESTADOS_FRENTE,
  METODOS_ARRANQUE,
  useFrentes,
  useGuardarFrente,
  type Frente,
} from '@/lib/api/explotacion'

/**
 * Frentes y bancos.
 *
 * El frente no es una etiqueta: dice con qué se arranca el material, y de eso
 * depende que una voladura se pueda registrar contra él o no. Por eso el método
 * es un campo del frente y no una casilla que se marca en cada voladura.
 */

const TONO: Record<string, 'success' | 'warning' | 'neutral'> = {
  ACTIVO: 'success',
  SUSPENDIDO: 'warning',
  AGOTADO: 'neutral',
}

const METODO: Record<string, string> = {
  VOLADURA: 'Voladura',
  MARTILLO: 'Martillo',
  AMBOS: 'Voladura y martillo',
}

const vacio = {
  id: null as number | null,
  codigo: '',
  nombre: '',
  banco: '',
  metodo_arranque: 'VOLADURA',
  material: '',
  estado: 'ACTIVO',
  reserva: '',
  nota: '',
}

export function Frentes() {
  const { data, isPending, error } = useFrentes()
  const guardar = useGuardarFrente()
  const { puede } = useMisPermisos()
  const [edicion, setEdicion] = useState<typeof vacio | null>(null)

  const abrir = (f: Frente) =>
    setEdicion({
      id: f.id,
      codigo: f.codigo,
      nombre: f.nombre,
      banco: f.banco ?? '',
      metodo_arranque: f.metodo_arranque,
      material: f.material ?? '',
      estado: f.estado,
      reserva: f.reserva_estimada ? String(Number(f.reserva_estimada)) : '',
      nota: f.nota ?? '',
    })

  return (
    <>
      <PageHeader
        title="Frentes y bancos"
        description="Dónde se está arrancando el material, y con qué."
        actions={
          puede('EXPLOTACION', 'ESCRITURA') ? (
            <Button icon={<Plus />} onClick={() => setEdicion({ ...vacio })}>
              Nuevo frente
            </Button>
          ) : undefined
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<Mountain />}
            titulo="Todavía no hay frentes"
            descripcion="Un frente es el sitio del cerro donde se está trabajando. Sin al menos uno no se puede cargar producción, porque el parte de turno dice de dónde salió la piedra."
          />
        </Card>
      ) : null}

      {data && data.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((f) => (
            <Card
              key={f.id}
              className="hover:border-royal-600/30 cursor-pointer transition-colors"
              onClick={() => abrir(f)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-ink/85 font-semibold">{f.nombre}</p>
                  <p className="text-ink/45 text-xs">
                    {f.codigo}
                    {f.banco ? ` · ${f.banco}` : ''}
                    {f.material ? ` · ${f.material}` : ''}
                  </p>
                </div>
                <Chip tone={TONO[f.estado] ?? 'neutral'}>{f.estado.toLowerCase()}</Chip>
              </div>

              <div className="border-hairline mt-4 grid grid-cols-2 gap-3 border-t pt-3 text-sm">
                <div>
                  <p className="text-ink/45 text-xs">Producido</p>
                  <p className="tabular text-ink/85 font-medium">
                    {enteros(f.toneladas_producidas)} t
                  </p>
                </div>
                <div>
                  <p className="text-ink/45 text-xs">Arranque</p>
                  <p className="text-ink/70">{METODO[f.metodo_arranque]}</p>
                </div>
                <div>
                  <p className="text-ink/45 text-xs">Voladuras</p>
                  <p className="tabular text-ink/70">{f.voladuras}</p>
                </div>
                <div>
                  <p className="text-ink/45 text-xs">Última</p>
                  <p className="text-ink/70">{f.ultima_voladura ? fecha(f.ultima_voladura) : '—'}</p>
                </div>
              </div>

              {f.reserva_estimada && Number(f.reserva_estimada) > 0 ? (
                <p className="text-ink/45 mt-3 text-xs">
                  Reserva estimada {enteros(f.reserva_estimada)} t
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      ) : null}

      {edicion ? (
        <Modal
          abierto
          onCerrar={() => setEdicion(null)}
          titulo={edicion.id ? edicion.nombre : 'Nuevo frente'}
          descripcion="El método de arranque manda: un frente de martillo no admite voladuras."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setEdicion(null)}>
                Cancelar
              </Button>
              <Button
                disabled={guardar.isPending || !edicion.codigo.trim() || !edicion.nombre.trim()}
                onClick={async () => {
                  await guardar.mutateAsync({
                    id: edicion.id,
                    codigo: edicion.codigo,
                    nombre: edicion.nombre,
                    banco: edicion.banco || null,
                    metodo_arranque: edicion.metodo_arranque,
                    material: edicion.material || null,
                    estado: edicion.estado,
                    reserva: Number(edicion.reserva) || null,
                    nota: edicion.nota || null,
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
              placeholder="F-01"
              value={edicion.codigo}
              onChange={(e) => setEdicion({ ...edicion, codigo: e.target.value })}
              required
            />
            <Input
              label="Nombre"
              placeholder="Frente norte"
              value={edicion.nombre}
              onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })}
              required
            />
            <Input
              label="Banco o cota"
              placeholder="Banco 3"
              value={edicion.banco}
              onChange={(e) => setEdicion({ ...edicion, banco: e.target.value })}
            />
            <Input
              label="Material"
              placeholder="Granito"
              value={edicion.material}
              onChange={(e) => setEdicion({ ...edicion, material: e.target.value })}
            />
            <Select
              label="Cómo se arranca"
              value={edicion.metodo_arranque}
              onChange={(e) => setEdicion({ ...edicion, metodo_arranque: e.target.value })}
              opciones={METODOS_ARRANQUE}
            />
            <Select
              label="Estado"
              value={edicion.estado}
              onChange={(e) => setEdicion({ ...edicion, estado: e.target.value })}
              opciones={ESTADOS_FRENTE}
              hint="Un frente suspendido o agotado no admite partes de turno."
            />
            <Input
              label="Reserva estimada (t)"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              value={edicion.reserva}
              onChange={(e) => setEdicion({ ...edicion, reserva: e.target.value })}
              hint="Lo que estima geología. Es una cifra que se corrige, no una cuenta."
            />
          </div>

          <Textarea
            label="Nota"
            rows={2}
            className="mt-4"
            value={edicion.nota}
            onChange={(e) => setEdicion({ ...edicion, nota: e.target.value })}
          />

          {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-4" /> : null}
        </Modal>
      ) : null}
    </>
  )
}
