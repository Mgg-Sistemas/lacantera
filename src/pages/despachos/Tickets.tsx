import { useState } from 'react'
import { Plus, Scale } from 'lucide-react'
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
import { hoyEnCaracas } from '@/lib/api/tasas'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useArticulos, useProveedores } from '@/lib/api/catalogo'
import { useClientes } from '@/lib/api/ventas'
import {
  TIPOS_TICKET,
  useAnularTicket,
  useRegistrarTicket,
  useTickets,
  type Ticket,
} from '@/lib/api/despachos'

/**
 * Tickets de romana.
 *
 * La báscula pesa todo lo que cruza el portón, no solo lo que se vende: una
 * gandola de gasoil que llega también se pesa. Por eso el ticket tiene tipo, y
 * por eso vive aquí y no dentro de la nota de entrega.
 */

const TONO: Record<string, 'success' | 'royal' | 'neutral'> = {
  LIBRE: 'success',
  USADO: 'royal',
  ANULADO: 'neutral',
}

const ETIQUETA: Record<string, string> = {
  LIBRE: 'Sin usar',
  USADO: 'En una nota',
  ANULADO: 'Anulado',
}

const vacio = {
  tipo: 'SALIDA',
  vehiculo: '',
  chofer: '',
  cedula: '',
  transportista: '',
  articulo_id: '',
  cliente_id: '',
  proveedor_id: '',
  bruto: '',
  tara: '',
  romana: '',
  operador: '',
  fecha: '',
  hora: '',
  nota: '',
}

export function Tickets() {
  const [filtro, setFiltro] = useState('')
  const { data, isPending, error } = useTickets(filtro || undefined)
  const { data: articulos } = useArticulos()
  const { data: clientes } = useClientes(true)
  const { data: proveedores } = useProveedores()
  const registrar = useRegistrarTicket()
  const anular = useAnularTicket()
  const { puede } = useMisPermisos()

  const [nuevo, setNuevo] = useState<typeof vacio | null>(null)
  const [anulando, setAnulando] = useState<Ticket | null>(null)
  const [motivo, setMotivo] = useState('')

  const neto = nuevo ? (Number(nuevo.bruto) || 0) - (Number(nuevo.tara) || 0) : 0

  const libres = (data ?? []).filter((t) => t.estado === 'LIBRE').length

  return (
    <>
      <PageHeader
        title="Tickets de romana"
        description="Cada pesada del portón, entre o salga."
        actions={
          <div className="flex items-center gap-3">
            {libres > 0 ? <Chip tone="success">{libres} sin usar</Chip> : null}
            {puede('DESPACHOS', 'ESCRITURA') ? (
              <Button
                icon={<Plus />}
                onClick={() => setNuevo({ ...vacio, fecha: hoyEnCaracas() })}
              >
                Pesar
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 max-w-xs">
        <Select
          label="Ver"
          vacio="Todos"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          opciones={[
            { valor: 'LIBRE', etiqueta: 'Sin usar' },
            { valor: 'USADO', etiqueta: 'Ya en una nota' },
            { valor: 'ANULADO', etiqueta: 'Anulados' },
          ]}
        />
      </div>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<Scale />}
            titulo="No hay pesadas registradas"
            descripcion="Un ticket guarda el bruto y la tara; el neto lo calcula la base. Al despachar, la nota de entrega toma los pesos de aquí en vez de que alguien los teclee dos veces."
          />
        </Card>
      ) : null}

      {data && data.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Ticket</th>
                  <th className="px-3 py-3 font-medium">Vehículo</th>
                  <th className="px-3 py-3 font-medium">Material</th>
                  <th className="px-3 py-3 font-medium">Para</th>
                  <th className="px-3 py-3 text-right font-medium">Bruto</th>
                  <th className="px-3 py-3 text-right font-medium">Tara</th>
                  <th className="px-3 py-3 text-right font-medium">Neto</th>
                  <th className="px-5 py-3 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.map((t) => (
                  <tr
                    key={t.id}
                    className={`border-hairline border-b last:border-0 ${
                      t.estado === 'ANULADO' ? 'opacity-45' : ''
                    }`}
                  >
                    <td className="px-5 py-3">
                      <p className="tabular text-ink/85 font-medium">{t.numero}</p>
                      <p className="text-ink/45 text-xs">
                        {fecha(t.fecha)}
                        {t.hora ? ` · ${t.hora.slice(0, 5)}` : ''}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-ink/80">{t.vehiculo}</p>
                      {t.chofer ? <p className="text-ink/45 text-xs">{t.chofer}</p> : null}
                    </td>
                    <td className="text-ink/70 px-3 py-3">{t.articulo ?? '—'}</td>
                    <td className="text-ink/60 px-3 py-3 text-xs">
                      {t.cliente ?? t.proveedor ?? '—'}
                      {t.nota_entrega ? (
                        <span className="text-royal-600 block">{t.nota_entrega}</span>
                      ) : null}
                    </td>
                    <td className="tabular text-ink/60 px-3 py-3 text-right">
                      {enteros(t.peso_bruto)}
                    </td>
                    <td className="tabular text-ink/60 px-3 py-3 text-right">
                      {enteros(t.peso_tara)}
                    </td>
                    <td className="tabular text-ink/85 px-3 py-3 text-right font-medium">
                      {enteros(t.peso_neto)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Chip tone={TONO[t.estado] ?? 'neutral'}>{ETIQUETA[t.estado]}</Chip>
                        {t.estado === 'LIBRE' && puede('DESPACHOS', 'TOTAL') ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger"
                            onClick={() => {
                              setAnulando(t)
                              setMotivo('')
                            }}
                          >
                            Anular
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* ------------------------------------------------------- nuevo */}
      {nuevo ? (
        <Modal
          abierto
          ancho="lg"
          onCerrar={() => setNuevo(null)}
          titulo="Pesar un vehículo"
          descripcion="El neto sale solo. Si el bruto no supera a la tara, algo se escribió al revés."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setNuevo(null)}>
                Cancelar
              </Button>
              <Button
                disabled={registrar.isPending || !nuevo.vehiculo.trim() || neto <= 0}
                onClick={async () => {
                  await registrar.mutateAsync({
                    tipo: nuevo.tipo,
                    vehiculo: nuevo.vehiculo,
                    peso_bruto: Number(nuevo.bruto),
                    peso_tara: Number(nuevo.tara),
                    articulo_id: Number(nuevo.articulo_id) || null,
                    cliente_id: Number(nuevo.cliente_id) || null,
                    proveedor_id: Number(nuevo.proveedor_id) || null,
                    chofer: nuevo.chofer || null,
                    cedula_chofer: nuevo.cedula || null,
                    transportista: nuevo.transportista || null,
                    romana: nuevo.romana || null,
                    operador: nuevo.operador || null,
                    fecha: nuevo.fecha || null,
                    hora: nuevo.hora || null,
                    nota: nuevo.nota || null,
                  })
                  setNuevo(null)
                }}
              >
                {registrar.isPending ? 'Guardando…' : 'Guardar el pesaje'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="Tipo"
              value={nuevo.tipo}
              onChange={(e) =>
                setNuevo({ ...nuevo, tipo: e.target.value, cliente_id: '', proveedor_id: '' })
              }
              opciones={TIPOS_TICKET}
            />
            <Input
              label="Placa"
              placeholder="A12BC34"
              value={nuevo.vehiculo}
              onChange={(e) => setNuevo({ ...nuevo, vehiculo: e.target.value })}
              required
            />
            <Input
              label="Transportista"
              value={nuevo.transportista}
              onChange={(e) => setNuevo({ ...nuevo, transportista: e.target.value })}
            />
            <Input
              label="Chofer"
              value={nuevo.chofer}
              onChange={(e) => setNuevo({ ...nuevo, chofer: e.target.value })}
            />
            <Input
              label="Cédula del chofer"
              placeholder="V-12345678"
              value={nuevo.cedula}
              onChange={(e) => setNuevo({ ...nuevo, cedula: e.target.value })}
            />
            <Select
              label="Material"
              vacio="Sin especificar"
              value={nuevo.articulo_id}
              onChange={(e) => setNuevo({ ...nuevo, articulo_id: e.target.value })}
              opciones={(articulos ?? [])
                .filter((a) => a.activo)
                .map((a) => ({ valor: String(a.id), etiqueta: `${a.codigo} · ${a.nombre}` }))}
            />
            {nuevo.tipo === 'SALIDA' ? (
              <Select
                label="Cliente"
                vacio="Sin cliente todavía"
                value={nuevo.cliente_id}
                onChange={(e) => setNuevo({ ...nuevo, cliente_id: e.target.value })}
                opciones={(clientes ?? []).map((c) => ({
                  valor: String(c.id),
                  etiqueta: c.nombre,
                }))}
                className="sm:col-span-3"
              />
            ) : (
              <Select
                label="Proveedor"
                vacio="Sin proveedor"
                value={nuevo.proveedor_id}
                onChange={(e) => setNuevo({ ...nuevo, proveedor_id: e.target.value })}
                opciones={(proveedores ?? []).map((p) => ({
                  valor: String(p.id),
                  etiqueta: p.nombre,
                }))}
                className="sm:col-span-3"
              />
            )}
            <Input
              label="Peso bruto (kg)"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              value={nuevo.bruto}
              onChange={(e) => setNuevo({ ...nuevo, bruto: e.target.value })}
              required
            />
            <Input
              label="Tara (kg)"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              value={nuevo.tara}
              onChange={(e) => setNuevo({ ...nuevo, tara: e.target.value })}
              error={
                Number(nuevo.bruto) > 0 && neto <= 0 ? 'La tara no puede igualar al bruto' : undefined
              }
              required
            />
            <div className="flex items-end">
              <div className="bg-ink/4 rounded-card w-full p-3">
                <p className="text-ink/45 text-xs">Neto</p>
                <p className="tabular text-ink/90 text-lg font-semibold">
                  {enteros(Math.max(neto, 0))} kg
                </p>
              </div>
            </div>
            <Input
              label="Fecha"
              type="date"
              value={nuevo.fecha}
              onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })}
            />
            <Input
              label="Hora"
              type="time"
              value={nuevo.hora}
              onChange={(e) => setNuevo({ ...nuevo, hora: e.target.value })}
            />
            <Input
              label="Romana"
              placeholder="Romana 1"
              value={nuevo.romana}
              onChange={(e) => setNuevo({ ...nuevo, romana: e.target.value })}
            />
            <Input
              label="Operador"
              placeholder="Quién pesó"
              value={nuevo.operador}
              onChange={(e) => setNuevo({ ...nuevo, operador: e.target.value })}
              className="sm:col-span-3"
            />
          </div>

          <Textarea
            label="Nota"
            rows={2}
            className="mt-4"
            value={nuevo.nota}
            onChange={(e) => setNuevo({ ...nuevo, nota: e.target.value })}
          />

          {registrar.error ? <ErrorDeCarga error={registrar.error} className="mt-4" /> : null}
        </Modal>
      ) : null}

      {/* ------------------------------------------------------ anular */}
      {anulando ? (
        <Modal
          abierto
          onCerrar={() => setAnulando(null)}
          titulo={`Anular el ticket ${anulando.numero}`}
          descripcion="Se queda con su número, marcado como anulado. Un pesaje que desaparece deja un hueco en la numeración de la garita."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setAnulando(null)}>
                No anular
              </Button>
              <Button
                disabled={anular.isPending || motivo.trim().length < 4}
                onClick={async () => {
                  await anular.mutateAsync({ id: anulando.id, motivo })
                  setAnulando(null)
                }}
              >
                {anular.isPending ? 'Anulando…' : 'Anular'}
              </Button>
            </>
          }
        >
          <Textarea
            label="Por qué se anula"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            required
          />
          {anular.error ? <ErrorDeCarga error={anular.error} className="mt-4" /> : null}
        </Modal>
      ) : null}
    </>
  )
}
