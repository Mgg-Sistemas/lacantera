import { useState } from 'react'
import { FileCheck, Plus } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { enteros, fecha } from '@/lib/formato'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useArticulos } from '@/lib/api/catalogo'
import { useClientes } from '@/lib/api/ventas'
import { useFrentes } from '@/lib/api/explotacion'
import { useAnularGuia, useGuias, useRegistrarGuia, type Guia } from '@/lib/api/despachos'
import { useVehiculos } from '@/lib/api/vehiculos'

/**
 * Guías de movilización.
 *
 * Es el papel que hace legal que el camión circule con el mineral. El sistema
 * no lo emite —lo emite el ministerio— pero sí lleva cuáles hay, cuáles siguen
 * vigentes y cuál amparó cada despacho, porque despachar mineral sin una es lo
 * que se rechaza en Ventas.
 *
 * Vencida no es un estado guardado: se compara la vigencia con hoy cada vez que
 * se mira. Guardado, haría falta que algo lo cambiara cada noche.
 */

const vacio = {
  numero_guia: '',
  fecha_emision: '',
  vigencia_hasta: '',
  destino: '',
  articulo_id: '',
  cantidad: '',
  unidad: 'M3',
  vehiculo_id: '',
  cliente_id: '',
  frente_id: '',
  origen: '',
  transportista: '',
  vehiculo: '',
  chofer: '',
  cedula: '',
  observacion: '',
}

export function Guias() {
  const [filtro, setFiltro] = useState('')
  const { data, isPending, error } = useGuias(filtro || undefined)
  const { data: articulos } = useArticulos()
  const { data: vehiculos } = useVehiculos()
  const { data: clientes } = useClientes(true)
  const { data: frentes } = useFrentes()
  const registrar = useRegistrarGuia()
  const anular = useAnularGuia()
  const { puede } = useMisPermisos()

  const [nueva, setNueva] = useState<typeof vacio | null>(null)
  const [anulando, setAnulando] = useState<Guia | null>(null)
  const [motivo, setMotivo] = useState('')

  const disponibles = (data ?? []).filter((g) => g.estado === 'VIGENTE' && !g.vencida).length
  const porVencer = (data ?? []).filter(
    (g) => g.estado === 'VIGENTE' && !g.vencida && g.dias_para_vencer <= 3,
  ).length

  const estadoDe = (g: Guia) => {
    if (g.estado === 'ANULADA') return { tono: 'neutral' as const, texto: 'Anulada' }
    if (g.estado === 'USADA') return { tono: 'royal' as const, texto: 'Usada' }
    if (g.vencida) return { tono: 'danger' as const, texto: 'Vencida' }
    if (g.dias_para_vencer <= 3)
      return { tono: 'warning' as const, texto: `Vence en ${g.dias_para_vencer} d` }
    return { tono: 'success' as const, texto: 'Vigente' }
  }

  return (
    <>
      <PageHeader
        title="Guías de movilización"
        description="El permiso con el que el mineral puede circular."
        actions={
          <div className="flex items-center gap-3">
            {porVencer > 0 ? <Chip tone="warning">{porVencer} por vencer</Chip> : null}
            {disponibles > 0 ? <Chip tone="success">{disponibles} vigentes</Chip> : null}
            {puede('DESPACHOS', 'ESCRITURA') ? (
              <Button
                icon={<Plus />}
                onClick={() => setNueva({ ...vacio, fecha_emision: hoyEnCaracas() })}
              >
                Cargar guía
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 max-w-xs">
        <Select
          label="Ver"
          vacio="Todas"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          opciones={[
            { valor: 'VIGENTE', etiqueta: 'Vigentes' },
            { valor: 'USADA', etiqueta: 'Ya usadas' },
            { valor: 'ANULADA', etiqueta: 'Anuladas' },
          ]}
        />
      </div>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<FileCheck />}
            titulo="No hay guías cargadas"
            descripcion="Sin guía vigente, Ventas rechaza el despacho de mineral. Quien tenga control total sobre Despachos puede autorizar una salida sin ella, y esa nota queda marcada."
          />
        </Card>
      ) : null}

      {data && data.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Guía</th>
                  <th className="px-3 py-3 font-medium">Destino</th>
                  <th className="px-3 py-3 font-medium">Material</th>
                  <th className="px-3 py-3 text-right font-medium">Ampara</th>
                  <th className="px-3 py-3 font-medium">Vigencia</th>
                  <th className="px-5 py-3 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.map((g) => {
                  const e = estadoDe(g)
                  return (
                    <tr
                      key={g.id}
                      className={`border-hairline border-b last:border-0 ${
                        g.estado === 'ANULADA' ? 'opacity-45' : ''
                      }`}
                    >
                      <td className="px-5 py-3">
                        <p className="tabular text-ink/85 font-medium">{g.numero_guia}</p>
                        <p className="text-ink/45 text-xs">
                          {g.numero} · {fecha(g.fecha_emision)}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-ink/80">{g.destino}</p>
                        {g.cliente ? <p className="text-ink/45 text-xs">{g.cliente}</p> : null}
                      </td>
                      <td className="text-ink/70 px-3 py-3">
                        {g.articulo}
                        {g.frente ? (
                          <span className="text-ink/45 block text-xs">desde {g.frente}</span>
                        ) : null}
                      </td>
                      <td className="tabular text-ink/85 px-3 py-3 text-right font-medium">
                        {enteros(g.cantidad)} {g.unidad === 'TON' ? 't' : 'm³'}
                      </td>
                      <td className="text-ink/60 px-3 py-3 text-xs">
                        hasta {fecha(g.vigencia_hasta)}
                        {g.nota_entrega ? (
                          <span className="text-royal-600 block">{g.nota_entrega}</span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Chip tone={e.tono}>{e.texto}</Chip>
                          {g.estado === 'VIGENTE' && puede('DESPACHOS', 'TOTAL') ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-danger"
                              onClick={() => {
                                setAnulando(g)
                                setMotivo('')
                              }}
                            >
                              Anular
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* ------------------------------------------------------- nueva */}
      {nueva ? (
        <Modal
          abierto
          ancho="lg"
          onCerrar={() => setNueva(null)}
          titulo="Cargar guía de movilización"
          descripcion="Se copia del papel que emitió el ministerio. El número es el suyo, no uno nuestro."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setNueva(null)}>
                Cancelar
              </Button>
              <Button
                disabled={
                  registrar.isPending ||
                  !nueva.numero_guia.trim() ||
                  !nueva.destino.trim() ||
                  !nueva.articulo_id ||
                  !nueva.vigencia_hasta ||
                  Number(nueva.cantidad) <= 0
                }
                onClick={async () => {
                  await registrar.mutateAsync({
                    numero_guia: nueva.numero_guia,
                    vigencia_hasta: nueva.vigencia_hasta,
                    destino: nueva.destino,
                    articulo_id: Number(nueva.articulo_id),
                    cantidad: Number(nueva.cantidad),
                    unidad: nueva.unidad,
                    cliente_id: Number(nueva.cliente_id) || null,
                    frente_id: Number(nueva.frente_id) || null,
                    origen: nueva.origen || null,
                    transportista: nueva.transportista || null,
                    vehiculo: nueva.vehiculo || null,
                    chofer: nueva.chofer || null,
                    cedula_chofer: nueva.cedula || null,
                    fecha_emision: nueva.fecha_emision || null,
                    observacion: nueva.observacion || null,
                  })
                  setNueva(null)
                }}
              >
                {registrar.isPending ? 'Guardando…' : 'Guardar la guía'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Número de guía"
              placeholder="GM-2026-0099"
              value={nueva.numero_guia}
              onChange={(e) => setNueva({ ...nueva, numero_guia: e.target.value })}
              required
            />
            <Input
              label="Emitida el"
              type="date"
              value={nueva.fecha_emision}
              onChange={(e) => setNueva({ ...nueva, fecha_emision: e.target.value })}
            />
            <Input
              label="Vence el"
              type="date"
              value={nueva.vigencia_hasta}
              onChange={(e) => setNueva({ ...nueva, vigencia_hasta: e.target.value })}
              required
            />
            <Input
              label="Destino"
              placeholder="Ciudad Bolívar"
              value={nueva.destino}
              onChange={(e) => setNueva({ ...nueva, destino: e.target.value })}
              className="sm:col-span-2"
              required
            />
            <SelectBuscable
              label="Cliente"
              vacio="Sin cliente concreto"
              valor={nueva.cliente_id}
              onCambio={(v) => setNueva({ ...nueva, cliente_id: v })}
              opciones={(clientes ?? []).map((c) => ({ valor: String(c.id), etiqueta: c.nombre }))}
            />
            <SelectBuscable
              label="Material"
              vacio="Elige el material"
              valor={nueva.articulo_id}
              onCambio={(v) => setNueva({ ...nueva, articulo_id: v })}
              opciones={(articulos ?? [])
                .filter((a) => a.activo && a.categoria === 'PRODUCTO')
                .map((a) => ({
                  valor: String(a.id),
                  codigo: a.codigo,
                  nombre: a.nombre,
                  detalle: a.unidad,
                }))}
              className="sm:col-span-2"
            />
            {/* La medida se elige. El campo decía «toneladas» y solo admitía
                eso; la cantera opera en metros cúbicos mientras tramita la
                licencia de toneladas, y el papel del ministerio dice una o la
                otra. Un campo con nombre de unidad era una trampa. */}
            <Input
              label="Cantidad que ampara"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={nueva.cantidad}
              onChange={(e) => setNueva({ ...nueva, cantidad: e.target.value })}
              required
            />
            <Select
              label="Medida"
              value={nueva.unidad}
              onChange={(e) => setNueva({ ...nueva, unidad: e.target.value })}
              opciones={[
                { valor: 'M3', etiqueta: 'Metros cúbicos' },
                { valor: 'TON', etiqueta: 'Toneladas' },
              ]}
              hint="La que diga el papel."
            />
            <Select
              label="Frente de origen"
              vacio="Sin frente concreto"
              value={nueva.frente_id}
              onChange={(e) => setNueva({ ...nueva, frente_id: e.target.value })}
              opciones={(frentes ?? []).map((f) => ({
                valor: String(f.id),
                etiqueta: `${f.codigo} · ${f.nombre}`,
              }))}
            />
            <Input
              label="Origen"
              placeholder="La mina, si no sale de un frente"
              value={nueva.origen}
              onChange={(e) => setNueva({ ...nueva, origen: e.target.value })}
              className="sm:col-span-2"
            />
            <Input
              label="Transportista"
              value={nueva.transportista}
              onChange={(e) => setNueva({ ...nueva, transportista: e.target.value })}
            />
            {/* La placa sale del catálogo. Escribirla a mano es como el
                mismo camión termina existiendo tres veces: «A12BC3D»,
                «a12bc3d» y «A12 BC3D». Queda «Otra» para el que no esté
                cargado, que sigue siendo texto. */}
            <SelectBuscable
              label="Vehículo"
              vacio="Otro — escribo la placa"
              valor={nueva.vehiculo_id}
              onCambio={(elegido) => {
                const veh = (vehiculos ?? []).find((x) => String(x.id) === elegido)
                setNueva({
                  ...nueva,
                  vehiculo_id: elegido,
                  vehiculo: veh ? veh.placa : '',
                })
              }}
              opciones={(vehiculos ?? []).map((v) => ({
                valor: String(v.id),
                etiqueta: `${v.placa} · ${Number(v.capacidad_m3)} m³${
                  v.transportista ? ` · ${v.transportista}` : ''
                }`,
              }))}
              hint={
                (vehiculos ?? []).length === 0
                  ? 'No hay vehículos cargados. Se dan de alta en Despachos › Vehículos.'
                  : undefined
              }
            />

            {nueva.vehiculo_id === '' ? (
              <Input
                label="Placa"
                placeholder="A12BC3D"
                value={nueva.vehiculo}
                onChange={(e) => setNueva({ ...nueva, vehiculo: e.target.value })}
              />
            ) : null}
            <Input
              label="Chofer"
              value={nueva.chofer}
              onChange={(e) => setNueva({ ...nueva, chofer: e.target.value })}
            />
            <Input
              label="Cédula del chofer"
              placeholder="V-12345678"
              value={nueva.cedula}
              onChange={(e) => setNueva({ ...nueva, cedula: e.target.value })}
              className="sm:col-span-3"
            />
          </div>

          <Textarea
            label="Observación"
            rows={2}
            className="mt-4"
            value={nueva.observacion}
            onChange={(e) => setNueva({ ...nueva, observacion: e.target.value })}
          />

          {registrar.error ? <ErrorDeCarga error={registrar.error} className="mt-4" /> : null}
        </Modal>
      ) : null}

      {/* ------------------------------------------------------ anular */}
      {anulando ? (
        <Modal
          abierto
          onCerrar={() => setAnulando(null)}
          titulo={`Anular la guía ${anulando.numero_guia}`}
          descripcion="Deja de estar disponible para amparar despachos."
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
