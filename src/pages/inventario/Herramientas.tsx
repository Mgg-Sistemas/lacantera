import { useMemo, useState } from 'react'
import { HandHelping, Search, TriangleAlert, Wrench } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useAlmacenes } from '@/lib/api/inventario'
import { useEmpleados } from '@/lib/api/nomina'
import {
  useAsignaciones,
  useAsignarHerramienta,
  useDevolverHerramienta,
  useHerramientas,
  useReportarPerdida,
  type Asignacion,
  type Herramienta,
} from '@/lib/api/herramientas'
import { useMisRoles } from '@/lib/api/catalogo'
import { dolares, fecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

function cantidad(valor: string | number): string {
  const n = Number(valor)
  return Number.isInteger(n) ? String(n) : n.toLocaleString('es-VE', { maximumFractionDigits: 2 })
}

/**
 * Quién tiene qué herramienta.
 *
 * LA PANTALLA ABRE POR LAS QUE ESTÁN FUERA, NO POR EL CATÁLOGO
 *
 * El pedido era trazabilidad y responsabilidad individual, y eso no se
 * responde con una lista de artículos: se responde con una lista de personas y
 * lo que tienen. El stock de cada herramienta está debajo, que es donde hace
 * falta cuando alguien viene a pedir una.
 *
 * EXISTENCIA NO ES LO MISMO QUE DISPONIBLE
 *
 * Asignar no descuenta: la llave sigue siendo de la empresa. Con tres llaves y
 * tres prestadas, Existencias seguiría diciendo «hay 3» y estaría en lo cierto
 * — pero quien está en el mostrador necesita el otro número. Por eso cada fila
 * enseña los dos.
 */
export function Herramientas() {
  const { data: almacenes } = useAlmacenes()
  const [almacenId, setAlmacenId] = useState('')
  const stock = useHerramientas(almacenId ? Number(almacenId) : undefined)
  const fuera = useAsignaciones({ estado: 'ASIGNADA' })
  const perdidas = useAsignaciones({ estado: 'PERDIDA' })
  const { puede } = useMisRoles()

  const [busqueda, setBusqueda] = useState('')
  const [entregando, setEntregando] = useState<Herramienta | null | undefined>(undefined)
  const [cerrando, setCerrando] = useState<{ a: Asignacion; como: 'devolver' | 'perder' } | null>(
    null,
  )

  const puedeMover = puede('ALMACEN')

  const asignadas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    if (!texto) return fuera.data ?? []
    return (fuera.data ?? []).filter(
      (a) =>
        a.empleado.toLowerCase().includes(texto) ||
        a.articulo.toLowerCase().includes(texto) ||
        a.ficha.toLowerCase().includes(texto) ||
        a.cedula.toLowerCase().includes(texto),
    )
  }, [fuera.data, busqueda])

  // Agrupadas por persona: la pregunta es «qué tiene fulano», no «quién tiene
  // el destornillador número 4».
  const porPersona = useMemo(() => {
    const mapa = new Map<number, { nombre: string; ficha: string; cargo: string | null; filas: Asignacion[] }>()
    for (const a of asignadas) {
      const acc = mapa.get(a.empleado_id) ?? {
        nombre: a.empleado,
        ficha: a.ficha,
        cargo: a.cargo,
        filas: [],
      }
      acc.filas.push(a)
      mapa.set(a.empleado_id, acc)
    }
    return [...mapa.values()].sort((x, y) => x.nombre.localeCompare(y.nombre))
  }, [asignadas])

  const sinSaldar = perdidas.data ?? []

  return (
    <>
      <PageHeader
        title="Herramientas"
        description="Quién tiene qué, desde cuándo, y qué queda para prestar. Entregar no descuenta del almacén: la herramienta sigue siendo de la empresa."
      />

      {sinSaldar.length > 0 ? (
        <div className="border-warning/30 bg-warning-soft mb-4 flex items-start gap-2.5 rounded-[6px] border p-3.5">
          <TriangleAlert className="text-warning mt-px size-[18px] shrink-0" />
          <p className="text-ink/80 text-sm">
            <strong className="font-semibold">
              {sinSaldar.length} herramienta{sinSaldar.length === 1 ? '' : 's'} sin devolver
            </strong>
            , ya descontada{sinSaldar.length === 1 ? '' : 's'} del inventario. Quien lleva la nómina
            las ve para decidir si se reponen o se descuentan.
          </p>
        </div>
      ) : null}

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_240px]">
          <Input
            label="Buscar"
            icon={<Search />}
            placeholder="Trabajador, ficha, cédula o herramienta"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <Select
            label="Sitio"
            vacio="Todos"
            value={almacenId}
            onChange={(e) => setAlmacenId(e.target.value)}
            opciones={(almacenes ?? []).map((a) => ({
              valor: String(a.id),
              etiqueta: `${a.nombre}${a.tipo === 'TALLER' ? ' · taller' : ''}`,
            }))}
          />
        </div>
      </Card>

      {/* ------------------------------------------------ quién tiene qué */}
      <h2 className="text-ink/80 mb-1 text-sm font-semibold">En manos de alguien</h2>
      <p className="text-ink/50 mb-3 text-xs">
        {asignadas.length} entrega{asignadas.length === 1 ? '' : 's'} sin cerrar.
      </p>

      {fuera.isPending ? <Cargando /> : null}
      {fuera.error ? <ErrorDeCarga error={fuera.error} /> : null}

      {!fuera.isPending && porPersona.length === 0 ? (
        <Card className="mb-6">
          <Vacio
            icono={<HandHelping />}
            titulo={
              (fuera.data ?? []).length === 0
                ? 'Ninguna herramienta está prestada'
                : 'Nadie coincide'
            }
            descripcion={
              (fuera.data ?? []).length === 0
                ? 'Cuando se entregue una, aparecerá aquí a nombre de quien la tiene.'
                : undefined
            }
          />
        </Card>
      ) : null}

      <div className="mb-6 grid gap-3 lg:grid-cols-2">
        {porPersona.map((p) => (
          <Card key={p.ficha} className="flex h-full flex-col">
            <div>
              <p className="text-ink/90 text-sm font-semibold">{p.nombre}</p>
              <p className="text-ink/45 text-xs">
                Ficha {p.ficha}
                {p.cargo ? ` · ${p.cargo}` : ''}
              </p>
            </div>

            <ul className="divide-hairline mt-3 divide-y">
              {p.filas.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <div className="min-w-0 grow">
                    <p className="text-ink/85 text-sm">
                      <span className="tabular font-medium">{cantidad(a.cantidad)}</span>{' '}
                      {a.articulo}
                    </p>
                    <p className="text-ink/45 text-xs">
                      Desde el {fecha(a.fecha_entrega)}
                      {a.dias_fuera > 0 ? ` · ${a.dias_fuera} día${a.dias_fuera === 1 ? '' : 's'}` : ''}
                      {a.almacen ? ` · ${a.almacen}` : ''}
                    </p>
                  </div>

                  {puedeMover ? (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setCerrando({ a, como: 'devolver' })}
                      >
                        Devolvió
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setCerrando({ a, como: 'perder' })}
                      >
                        Se perdió
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      {/* ------------------------------------------------------- el stock */}
      <h2 className="text-ink/80 mb-1 text-sm font-semibold">Lo que hay</h2>
      <p className="text-ink/50 mb-3 text-xs leading-relaxed">
        La existencia cuenta todas, prestadas incluidas: siguen siendo de la empresa. Lo que se
        puede entregar hoy es la columna de disponibles.
      </p>

      {stock.isPending ? <Cargando /> : null}
      {stock.error ? <ErrorDeCarga error={stock.error} /> : null}

      {!stock.isPending && (stock.data ?? []).length === 0 ? (
        <Card>
          <Vacio
            icono={<Wrench />}
            titulo="No hay herramientas cargadas"
            descripcion="Se cargan en el catálogo con la categoría Herramienta, y entran al taller por una compra recibida o una transferencia."
          />
        </Card>
      ) : null}

      {(stock.data ?? []).length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Herramienta</th>
                  <th className="px-3 py-3 font-medium">Dónde</th>
                  <th className="px-3 py-3 text-right font-medium">Hay</th>
                  <th className="px-3 py-3 text-right font-medium">Prestadas</th>
                  <th className="px-3 py-3 text-right font-medium">Disponibles</th>
                  <th className="px-5 py-3 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {(stock.data ?? []).map((h) => {
                  const libres = Number(h.disponibles)
                  return (
                    <tr
                      key={`${h.almacen_id}-${h.articulo_id}`}
                      className="border-hairline border-b last:border-0"
                    >
                      <td className="px-5 py-3">
                        <p className="text-ink/85 font-medium">{h.articulo}</p>
                        <p className="text-ink/45 text-2xs font-mono">{h.articulo_codigo}</p>
                      </td>
                      <td className="text-ink/65 px-3 py-3">{h.almacen}</td>
                      <td className="tabular text-ink/85 px-3 py-3 text-right">
                        {cantidad(h.existencia)}
                      </td>
                      <td className="tabular text-ink/65 px-3 py-3 text-right">
                        {cantidad(h.asignadas)}
                        {h.personas > 0 ? (
                          <span className="text-ink/40 ml-1 text-xs">
                            · {h.personas} persona{h.personas === 1 ? '' : 's'}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span
                          className={cn(
                            'tabular font-semibold',
                            libres <= 0 ? 'text-warning' : 'text-ink/85',
                          )}
                        >
                          {cantidad(h.disponibles)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {puedeMover ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<HandHelping />}
                            disabled={libres <= 0}
                            onClick={() => setEntregando(h)}
                          >
                            Entregar
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <ModalEntrega
        herramienta={entregando ?? null}
        abierto={entregando !== undefined && entregando !== null}
        onCerrar={() => setEntregando(undefined)}
      />
      <ModalCierre cierre={cerrando} onCerrar={() => setCerrando(null)} />
    </>
  )
}

/**
 * Entregar una herramienta.
 *
 * El trabajador es obligatorio y no hay opción de «sin asignar»: el módulo
 * existe para saber quién la tiene. Una entrega sin responsable es una salida
 * de almacén, y para eso ya está Existencias.
 */
function ModalEntrega({
  herramienta,
  abierto,
  onCerrar,
}: {
  herramienta: Herramienta | null
  abierto: boolean
  onCerrar: () => void
}) {
  const asignar = useAsignarHerramienta()
  const { data: empleados } = useEmpleados()

  const hoy = new Date().toLocaleDateString('en-CA')
  const [empleado, setEmpleado] = useState('')
  const [cuantas, setCuantas] = useState('1')
  const [dia, setDia] = useState(hoy)
  const [nota, setNota] = useState('')

  if (!herramienta) return null

  const libres = Number(herramienta.disponibles)
  const pedidas = Number(cuantas)
  const excede = pedidas > libres
  const valido = empleado !== '' && pedidas > 0 && !excede

  const enviar = async () => {
    await asignar.mutateAsync({
      articulo_id: herramienta.articulo_id,
      almacen_id: herramienta.almacen_id,
      empleado_id: Number(empleado),
      cantidad: pedidas,
      fecha: dia,
      nota: nota.trim() || null,
    })
    setEmpleado('')
    setCuantas('1')
    setNota('')
    onCerrar()
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Entregar ${herramienta.articulo}`}
      descripcion={`Quedan ${cantidad(herramienta.disponibles)} sin prestar en ${herramienta.almacen}.`}
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={!valido || asignar.isPending}>
            {asignar.isPending ? 'Guardando…' : 'Entregar'}
          </Button>
        </>
      }
    >
      <Select
        label="A quién"
        vacio="Elegir trabajador"
        value={empleado}
        onChange={(e) => setEmpleado(e.target.value)}
        opciones={(empleados ?? []).map((e) => ({
          valor: String(e.id),
          etiqueta: `${e.nombres} ${e.apellidos} · ficha ${e.ficha}`,
        }))}
        hint="Queda a su nombre hasta que la devuelva."
      />

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input
          label="Cuántas"
          type="number"
          min="1"
          step="1"
          value={cuantas}
          onChange={(e) => setCuantas(e.target.value)}
          error={excede ? `Solo quedan ${cantidad(herramienta.disponibles)}` : undefined}
        />
        <Input label="Fecha" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
      </div>

      <div className="mt-4">
        <Textarea label="Nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
      </div>

      <p className="border-hairline text-ink/60 mt-4 rounded-[6px] border border-dashed p-3 text-sm leading-relaxed">
        Entregar no descuenta del almacén: la herramienta sigue siendo de la empresa. Lo que baja es
        cuántas quedan para prestar.
      </p>

      {asignar.error ? <ErrorDeCarga error={asignar.error} className="mt-3" /> : null}
    </Modal>
  )
}

/**
 * Cerrar una entrega: o volvió, o no volvió.
 *
 * Las dos salidas viven en el mismo modal porque son la misma pregunta hecha
 * en el mismo momento —cuando alguien viene a entregar la herramienta o a
 * decir que no la tiene—, y separarlas en dos pantallas obligaría a elegir
 * antes de saber.
 */
function ModalCierre({
  cierre,
  onCerrar,
}: {
  cierre: { a: Asignacion; como: 'devolver' | 'perder' } | null
  onCerrar: () => void
}) {
  const devolver = useDevolverHerramienta()
  const perder = useReportarPerdida()

  const hoy = new Date().toLocaleDateString('en-CA')
  const [dia, setDia] = useState(hoy)
  const [motivo, setMotivo] = useState('')

  if (!cierre) return null

  const { a, como } = cierre
  const perdida = como === 'perder'
  const valido = perdida ? motivo.trim().length >= 4 : true
  const trabajando = devolver.isPending || perder.isPending

  const enviar = async () => {
    if (perdida) {
      await perder.mutateAsync({ id: a.id, motivo: motivo.trim(), fecha: dia })
    } else {
      await devolver.mutateAsync({ id: a.id, fecha: dia, nota: motivo.trim() || null })
    }
    setMotivo('')
    onCerrar()
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      ancho="sm"
      titulo={perdida ? 'Reportar que se perdió' : 'Devolvió la herramienta'}
      descripcion={`${cantidad(a.cantidad)} ${a.articulo} · ${a.empleado}`}
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={!valido || trabajando}>
            {trabajando ? 'Guardando…' : perdida ? 'Reportar la pérdida' : 'Registrar la devolución'}
          </Button>
        </>
      }
    >
      <Input label="Fecha" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />

      <div className="mt-4">
        <Textarea
          label={perdida ? 'Qué pasó' : 'Nota'}
          rows={3}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          hint={
            perdida
              ? 'Dentro de tres meses es lo único que dirá si fue un descuido o un accidente de trabajo.'
              : undefined
          }
        />
      </div>

      {perdida ? (
        <div className="border-warning/30 bg-warning-soft mt-4 rounded-[6px] border p-3">
          <p className="text-ink/80 text-sm leading-relaxed">
            Al guardar, la herramienta se descuenta del inventario —la existencia pasa a ser la
            real— y queda anotada a nombre de {a.empleado}.
          </p>
          {a.costo_usd ? (
            <p className="text-ink/60 mt-1 text-xs">Valor aproximado: {dolares(a.costo_usd)}.</p>
          ) : null}
          <p className="text-ink/60 mt-1 text-xs">
            Quien procese la nómina la verá para decidir si se repone, se descuenta o no se cobra.
          </p>
        </div>
      ) : null}

      {devolver.error ? <ErrorDeCarga error={devolver.error} className="mt-3" /> : null}
      {perder.error ? <ErrorDeCarga error={perder.error} className="mt-3" /> : null}
    </Modal>
  )
}

/** El estado, con el tono que le corresponde. Se usa también desde Nómina. */
export function ChipAsignacion({ estado }: { estado: Asignacion['estado'] }) {
  const tono =
    estado === 'ASIGNADA'
      ? 'neutral'
      : estado === 'DEVUELTA'
        ? 'success'
        : estado === 'PERDIDA'
          ? 'danger'
          : 'neutral'
  const texto =
    estado === 'ASIGNADA'
      ? 'En sus manos'
      : estado === 'DEVUELTA'
        ? 'Devuelta'
        : estado === 'PERDIDA'
          ? 'Sin devolver'
          : 'Saldada'

  return <Chip tone={tono as 'neutral' | 'success' | 'danger'}>{texto}</Chip>
}
