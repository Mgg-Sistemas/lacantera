import { useState } from 'react'
import { Factory, Plus, Trash2 } from 'lucide-react'
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
import { useArticulos } from '@/lib/api/catalogo'
import { useAlmacenes } from '@/lib/api/inventario'
import {
  TURNOS,
  useAnularProduccionTurno,
  useFrentes,
  useProduccion,
  useRegistrarProduccionTurno,
  useRenglonesProduccion,
  useVoladuras,
  type ProduccionTurno,
} from '@/lib/api/explotacion'

/**
 * El parte de turno.
 *
 * Es la única puerta por la que entra material al patio. Lleva renglones porque
 * de un mismo turno salen varios materiales a la vez —piedra 1, piedra 2,
 * granzón, polvillo— y contarlos por separado obligaría a llenar cuatro partes
 * de lo mismo.
 */

let contador = 0
const filaVacia = () => ({ clave: contador++, articulo_id: '', cantidad: '' })

const vacio = {
  fecha: '',
  turno: 'I',
  frente_id: '',
  almacen_id: '',
  voladura_id: '',
  horas: '',
  paro: '',
  motivo_paro: '',
  operador: '',
  nota: '',
}

export function Produccion() {
  const { data, isPending, error } = useProduccion()
  const { data: frentes } = useFrentes()
  const { data: almacenes } = useAlmacenes()
  const { data: articulos } = useArticulos()
  const { data: voladuras } = useVoladuras()
  const registrar = useRegistrarProduccionTurno()
  const anular = useAnularProduccionTurno()
  const { puede } = useMisPermisos()

  const [nuevo, setNuevo] = useState<typeof vacio | null>(null)
  const [filas, setFilas] = useState([filaVacia()])
  const [detalle, setDetalle] = useState<ProduccionTurno | null>(null)
  const [anulando, setAnulando] = useState<ProduccionTurno | null>(null)
  const [motivo, setMotivo] = useState('')

  const renglonesDetalle = useRenglonesProduccion(detalle?.id ?? null)

  const productos = (articulos ?? [])
    .filter((a) => a.categoria === 'PRODUCTO' && a.activo)
    .map((a) => ({ valor: String(a.id), etiqueta: `${a.codigo} · ${a.nombre}` }))

  const frentesActivos = (frentes ?? [])
    .filter((f) => f.estado === 'ACTIVO')
    .map((f) => ({ valor: String(f.id), etiqueta: `${f.codigo} · ${f.nombre}` }))

  const voladurasDelFrente = (voladuras ?? [])
    .filter((v) => v.estado === 'REGISTRADA' && String(v.frente_id) === nuevo?.frente_id)
    .map((v) => ({ valor: String(v.id), etiqueta: `${v.numero} · ${fecha(v.fecha)}` }))

  const total = filas.reduce((s, f) => s + (Number(f.cantidad) || 0), 0)

  const abrir = () => {
    setFilas([filaVacia()])
    setNuevo({
      ...vacio,
      fecha: hoyEnCaracas(),
      almacen_id: almacenes?.length === 1 ? String(almacenes[0].id) : '',
    })
  }

  return (
    <>
      <PageHeader
        title="Producción por turno"
        description="Lo que produjo cada turno, y por dónde entra al patio."
        actions={
          puede('EXPLOTACION', 'ESCRITURA') ? (
            <Button icon={<Plus />} disabled={frentesActivos.length === 0} onClick={abrir}>
              Cargar parte
            </Button>
          ) : undefined
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<Factory />}
            titulo="Todavía no hay partes de turno"
            descripcion={
              frentesActivos.length === 0
                ? 'Primero hace falta un frente activo. Se crean en Explotación › Frentes y bancos.'
                : 'El parte de turno es lo que mete la piedra al patio: sin él, el inventario dice cero y no se puede despachar.'
            }
          />
        </Card>
      ) : null}

      {data && data.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Parte</th>
                  <th className="px-3 py-3 font-medium">Frente</th>
                  <th className="px-3 py-3 font-medium">Patio</th>
                  <th className="px-3 py-3 text-right font-medium">Producido</th>
                  <th className="px-3 py-3 text-right font-medium">Horas</th>
                  <th className="px-5 py-3 text-right font-medium">Rendimiento</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => setDetalle(p)}
                    className={`border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors last:border-0 ${
                      p.estado === 'ANULADA' ? 'opacity-45' : ''
                    }`}
                  >
                    <td className="px-5 py-3">
                      <p className="tabular text-ink/85 font-medium">{p.numero}</p>
                      <p className="text-ink/45 text-xs">
                        {fecha(p.fecha)} · turno {p.turno}
                      </p>
                    </td>
                    <td className="text-ink/70 px-3 py-3">{p.frente}</td>
                    <td className="text-ink/60 px-3 py-3 text-xs">{p.almacen}</td>
                    <td className="tabular text-ink/85 px-3 py-3 text-right font-medium">
                      {enteros(p.toneladas)} t
                    </td>
                    <td className="tabular text-ink/60 px-3 py-3 text-right text-xs">
                      {p.horas_operativas ? `${Number(p.horas_operativas)} h` : '—'}
                      {Number(p.horas_paro) > 0 ? (
                        <span className="text-warning block">
                          {Number(p.horas_paro)} h de paro
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {p.estado === 'ANULADA' ? (
                        <Chip tone="neutral">Anulado</Chip>
                      ) : p.rendimiento ? (
                        <span className="tabular text-ink/70">{Number(p.rendimiento)} t/h</span>
                      ) : (
                        <span className="text-ink/30">—</span>
                      )}
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
          titulo="Parte de turno"
          descripcion="Lo que se produjo entra al patio en el momento de guardar."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setNuevo(null)}>
                Cancelar
              </Button>
              <Button
                disabled={
                  registrar.isPending ||
                  !nuevo.frente_id ||
                  !nuevo.almacen_id ||
                  total <= 0 ||
                  (Number(nuevo.paro) > 0 && nuevo.motivo_paro.trim().length === 0)
                }
                onClick={async () => {
                  await registrar.mutateAsync({
                    fecha: nuevo.fecha,
                    turno: nuevo.turno,
                    frente_id: Number(nuevo.frente_id),
                    almacen_id: Number(nuevo.almacen_id),
                    renglones: filas
                      .filter((f) => f.articulo_id && Number(f.cantidad) > 0)
                      .map((f) => ({
                        articulo_id: Number(f.articulo_id),
                        cantidad: Number(f.cantidad),
                      })),
                    horas_operativas: Number(nuevo.horas) || null,
                    horas_paro: Number(nuevo.paro) || 0,
                    motivo_paro: nuevo.motivo_paro || null,
                    voladura_id: Number(nuevo.voladura_id) || null,
                    operador: nuevo.operador || null,
                    nota: nuevo.nota || null,
                  })
                  setNuevo(null)
                }}
              >
                {registrar.isPending ? 'Guardando…' : 'Guardar el parte'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Fecha"
              type="date"
              value={nuevo.fecha}
              onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })}
              required
            />
            <Select
              label="Turno"
              value={nuevo.turno}
              onChange={(e) => setNuevo({ ...nuevo, turno: e.target.value })}
              opciones={TURNOS}
            />
            <Input
              label="Operador"
              placeholder="Quién reporta"
              value={nuevo.operador}
              onChange={(e) => setNuevo({ ...nuevo, operador: e.target.value })}
            />
            <Select
              label="Frente"
              vacio="De dónde salió"
              value={nuevo.frente_id}
              onChange={(e) => setNuevo({ ...nuevo, frente_id: e.target.value, voladura_id: '' })}
              opciones={frentesActivos}
              required
            />
            <Select
              label="Patio"
              vacio="Adónde entra"
              value={nuevo.almacen_id}
              onChange={(e) => setNuevo({ ...nuevo, almacen_id: e.target.value })}
              opciones={(almacenes ?? []).map((a) => ({
                valor: String(a.id),
                etiqueta: a.nombre,
              }))}
              required
            />
            <Select
              label="Voladura"
              vacio="Ninguna en particular"
              value={nuevo.voladura_id}
              onChange={(e) => setNuevo({ ...nuevo, voladura_id: e.target.value })}
              opciones={voladurasDelFrente}
              hint="Enlazarla permite comparar lo estimado con lo producido."
            />
            <Input
              label="Horas operativas"
              type="number"
              min="0"
              step="0.5"
              inputMode="decimal"
              value={nuevo.horas}
              onChange={(e) => setNuevo({ ...nuevo, horas: e.target.value })}
              hint="Sin ellas, el tonelaje no se puede comparar con otro turno."
            />
            <Input
              label="Horas de paro"
              type="number"
              min="0"
              step="0.5"
              inputMode="decimal"
              value={nuevo.paro}
              onChange={(e) => setNuevo({ ...nuevo, paro: e.target.value })}
            />
            <Input
              label="Motivo del paro"
              placeholder="Cambio de muela"
              value={nuevo.motivo_paro}
              onChange={(e) => setNuevo({ ...nuevo, motivo_paro: e.target.value })}
              error={
                Number(nuevo.paro) > 0 && !nuevo.motivo_paro.trim()
                  ? 'Un paro sin motivo no se puede cuadrar después'
                  : undefined
              }
            />
          </div>

          <div className="mt-5 space-y-3">
            <p className="text-ink/75 text-sm font-medium">Material producido</p>
            {filas.map((f, i) => (
              <div key={f.clave} className="flex items-end gap-3">
                <Select
                  label={`Renglón ${i + 1}`}
                  vacio="Elige el material"
                  value={f.articulo_id}
                  onChange={(e) =>
                    setFilas(
                      filas.map((x) =>
                        x.clave === f.clave ? { ...x, articulo_id: e.target.value } : x,
                      ),
                    )
                  }
                  opciones={productos}
                  className="flex-1"
                />
                <Input
                  label="Toneladas"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={f.cantidad}
                  onChange={(e) =>
                    setFilas(
                      filas.map((x) =>
                        x.clave === f.clave ? { ...x, cantidad: e.target.value } : x,
                      ),
                    )
                  }
                  className="w-36"
                />
                <Button
                  variant="ghost"
                  icon={<Trash2 />}
                  disabled={filas.length === 1}
                  onClick={() => setFilas(filas.filter((x) => x.clave !== f.clave))}
                  className="text-danger hover:bg-danger/10 mb-0.5 shrink-0"
                >
                  Quitar
                </Button>
              </div>
            ))}

            <div className="flex items-center justify-between">
              <Button variant="soft" icon={<Plus />} onClick={() => setFilas([...filas, filaVacia()])}>
                Agregar material
              </Button>
              <p className="text-ink/70 text-sm">
                Total del turno{' '}
                <span className="tabular text-ink/90 font-semibold">{enteros(total)} t</span>
              </p>
            </div>
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

      {/* ----------------------------------------------------- detalle */}
      {detalle ? (
        <Modal
          abierto
          onCerrar={() => setDetalle(null)}
          titulo={detalle.numero}
          descripcion={`${detalle.frente} · ${fecha(detalle.fecha)} · turno ${detalle.turno}`}
          acciones={
            <>
              <Button variant="ghost" onClick={() => setDetalle(null)}>
                Cerrar
              </Button>
              {detalle.estado === 'REGISTRADA' && puede('EXPLOTACION', 'TOTAL') ? (
                <Button
                  variant="outline"
                  className="text-danger"
                  onClick={() => {
                    setAnulando(detalle)
                    setMotivo('')
                  }}
                >
                  Anular
                </Button>
              ) : null}
            </>
          }
        >
          {detalle.motivo_anulacion ? (
            <p className="text-danger mb-3 text-sm">Anulado: {detalle.motivo_anulacion}</p>
          ) : null}

          {renglonesDetalle.isPending ? <Cargando /> : null}

          <table className="w-full text-sm">
            <tbody>
              {(renglonesDetalle.data ?? []).map((r) => (
                <tr key={r.id} className="border-hairline border-b last:border-0">
                  <td className="text-ink/80 py-2">{r.articulo}</td>
                  <td className="tabular text-ink/85 py-2 text-right font-medium">
                    {enteros(r.cantidad)} {r.unidad}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="border-hairline mt-4 grid grid-cols-2 gap-3 border-t pt-3 text-sm sm:grid-cols-3">
            {[
              ['Patio', detalle.almacen],
              ['Horas operativas', detalle.horas_operativas ? `${Number(detalle.horas_operativas)} h` : '—'],
              ['Paro', Number(detalle.horas_paro) > 0 ? `${Number(detalle.horas_paro)} h` : 'sin paro'],
              ['Rendimiento', detalle.rendimiento ? `${Number(detalle.rendimiento)} t/h` : '—'],
              ['Voladura', detalle.voladura ?? '—'],
              ['Operador', detalle.operador ?? '—'],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <dt className="text-ink/45 text-xs">{k}</dt>
                <dd className="text-ink/80">{v}</dd>
              </div>
            ))}
          </dl>

          {detalle.motivo_paro ? (
            <p className="text-ink/60 mt-3 text-sm">Motivo del paro: {detalle.motivo_paro}</p>
          ) : null}
        </Modal>
      ) : null}

      {/* ------------------------------------------------------ anular */}
      {anulando ? (
        <Modal
          abierto
          onCerrar={() => setAnulando(null)}
          titulo={`Anular el parte ${anulando.numero}`}
          descripcion="El material que metió sale del patio con un asiento contrario. Si ya se despachó, no se puede: habrá que corregir con un ajuste."
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
                  setDetalle(null)
                }}
              >
                {anular.isPending ? 'Anulando…' : 'Anular el parte'}
              </Button>
            </>
          }
        >
          <Textarea
            label="Por qué se anula"
            hint="Queda en el registro de auditoría con tu nombre y la hora."
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
