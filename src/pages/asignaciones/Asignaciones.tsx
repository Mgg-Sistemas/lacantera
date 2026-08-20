import { useMemo, useState } from 'react'
import { HandHelping, Search, TriangleAlert, Wrench } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useAlmacenes } from '@/lib/api/inventario'
import { useEmpleados } from '@/lib/api/nomina'
import {
  useAsignables,
  useAsignaciones,
  useAsignar,
  useDevolver,
  useReportarIncidencia,
  type Asignable,
  type Asignacion,
  type TipoIncidencia,
} from '@/lib/api/asignaciones'
import { useMisRoles } from '@/lib/api/catalogo'
import { dolares, fecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

function cantidad(valor: string | number): string {
  const n = Number(valor)
  return Number.isInteger(n) ? String(n) : n.toLocaleString('es-VE', { maximumFractionDigits: 2 })
}

/**
 * Quién tiene qué.
 *
 * LA PANTALLA ABRE POR LAS QUE ESTÁN FUERA, NO POR EL CATÁLOGO
 *
 * El pedido era trazabilidad y responsabilidad individual, y eso no se
 * responde con una lista de artículos: se responde con una lista de personas y
 * lo que tienen. El stock de cada artículo está debajo, que es donde hace
 * falta cuando alguien viene a pedir una.
 *
 * EXISTENCIA NO ES LO MISMO QUE DISPONIBLE
 *
 * Asignar no descuenta: la llave sigue siendo de la empresa. Con tres llaves y
 * tres prestadas, Existencias seguiría diciendo «hay 3» y estaría en lo cierto
 * — pero quien está en el mostrador necesita el otro número. Por eso cada fila
 * enseña los dos.
 */
export function Asignaciones() {
  const { data: almacenes } = useAlmacenes()
  const [almacenId, setAlmacenId] = useState('')
  const stock = useAsignables({ almacenId: almacenId ? Number(almacenId) : undefined })
  const fuera = useAsignaciones({ estado: 'ASIGNADA' })
  const perdidas = useAsignaciones({ estado: 'PERDIDA' })
  const { puede } = useMisRoles()

  const [busqueda, setBusqueda] = useState('')
  const [entregando, setEntregando] = useState<Asignable | null | undefined>(undefined)
  const [cerrando, setCerrando] = useState<{
    a: Asignacion
    como: 'devolver' | 'incidencia'
  } | null>(null)

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
        title="Asignaciones"
        description="Quién tiene qué, desde cuándo, y qué queda por entregar. Entregar no descuenta del almacén: el bien sigue siendo de la empresa."
      />

      {sinSaldar.length > 0 ? (
        <div className="border-warning/30 bg-warning-soft mb-4 flex items-start gap-2.5 rounded-[6px] border p-3.5">
          <TriangleAlert className="text-warning mt-px size-[18px] shrink-0" />
          <p className="text-ink/80 text-sm">
            <strong className="font-semibold">
              {sinSaldar.length} bien{sinSaldar.length === 1 ? '' : 'es'} con incidencia
            </strong>
            . Están sin resolver: falta decidir si se reponen, se descuentan o no se cobran.
          </p>
        </div>
      ) : null}

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_240px]">
          <Input
            label="Buscar"
            icon={<Search />}
            placeholder="Trabajador, ficha, cédula o artículo"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <SelectBuscable
            label="Sitio"
            vacio="Todos"
            valor={almacenId}
            onCambio={(v) => setAlmacenId(v)}
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
                ? 'Nadie tiene nada asignado'
                : 'Nadie coincide'
            }
            descripcion={
              (fuera.data ?? []).length === 0
                ? 'Cuando se entregue algo, aparecerá aquí a nombre de quien lo tiene.'
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
                        onClick={() => setCerrando({ a, como: 'incidencia' })}
                      >
                        Pasó algo
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
            titulo="No hay nada que asignar"
            descripcion="Se cargan en el catálogo y entran a un almacén por una compra recibida o una transferencia. Desde ahí se le pueden entregar a alguien."
          />
        </Card>
      ) : null}

      {(stock.data ?? []).length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Artículo</th>
                  <th className="px-3 py-3 font-medium">Dónde</th>
                  <th className="px-3 py-3 text-right font-medium">Hay</th>
                  <th className="px-3 py-3 text-right font-medium">Entregadas</th>
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
        bien={entregando ?? null}
        abierto={entregando !== undefined && entregando !== null}
        onCerrar={() => setEntregando(undefined)}
      />
      <ModalCierre cierre={cerrando} onCerrar={() => setCerrando(null)} />
    </>
  )
}

/**
 * Entregar un bien.
 *
 * El trabajador es obligatorio y no hay opción de «sin asignar»: el módulo
 * existe para saber quién lo tiene. Una entrega sin responsable es una salida
 * de almacén, y para eso ya está Existencias.
 */
function ModalEntrega({
  bien,
  abierto,
  onCerrar,
}: {
  bien: Asignable | null
  abierto: boolean
  onCerrar: () => void
}) {
  const asignar = useAsignar()
  const { data: empleados } = useEmpleados()

  const hoy = new Date().toLocaleDateString('en-CA')
  const [empleado, setEmpleado] = useState('')
  const [cuantas, setCuantas] = useState('1')
  const [dia, setDia] = useState(hoy)
  const [nota, setNota] = useState('')

  if (!bien) return null

  const libres = Number(bien.disponibles)
  const pedidas = Number(cuantas)
  const excede = pedidas > libres
  const valido = empleado !== '' && pedidas > 0 && !excede

  const enviar = async () => {
    await asignar.mutateAsync({
      articulo_id: bien.articulo_id,
      almacen_id: bien.almacen_id,
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
      titulo={`Entregar ${bien.articulo}`}
      descripcion={`Quedan ${cantidad(bien.disponibles)} sin prestar en ${bien.almacen}.`}
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
      <SelectBuscable
        label="A quién"
        vacio="Elegir trabajador"
        valor={empleado}
        onCambio={(v) => setEmpleado(v)}
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
          error={excede ? `Solo quedan ${cantidad(bien.disponibles)}` : undefined}
        />
        <Input label="Fecha" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
      </div>

      <div className="mt-4">
        <Textarea label="Nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
      </div>

      <p className="border-hairline text-ink/60 mt-4 rounded-[6px] border border-dashed p-3 text-sm leading-relaxed">
        Entregar no descuenta del almacén: el bien sigue siendo de la empresa. Lo que baja es
        cuántos quedan por entregar.
      </p>

      {asignar.error ? <ErrorDeCarga error={asignar.error} className="mt-3" /> : null}
    </Modal>
  )
}

/**
 * Cerrar una entrega: o volvió, o no volvió.
 *
 * Las dos salidas viven en el mismo modal porque son la misma pregunta hecha
 * en el mismo momento —cuando alguien viene a entregar la bien o a
 * decir que no la tiene—, y separarlas en dos pantallas obligaría a elegir
 * antes de saber.
 */
/**
 * Cerrar una entrega: o volvió bien, o pasó algo.
 *
 * TRES SALIDAS, PERO DOS PREGUNTAS
 *
 * Primero: ¿volvió o no? Y si algo pasó, ¿no aparece o apareció rota? Son dos
 * cosas distintas y la segunda decide lo que ocurre con el inventario. Una
 * llave que no aparece sale del libro; una silla con una pata partida sigue
 * ahí, y darla de baja dejaría el inventario diciendo que no existe algo que
 * se puede ver y tocar.
 *
 * Por eso la baja se pregunta. Llega marcada según lo normal en cada caso
 * —perdido sí, dañado no— y quien reporta la cambia cuando el caso es el otro:
 * una llave que se sabe dónde está, o una silla que no tiene arreglo.
 */
function ModalCierre({
  cierre,
  onCerrar,
}: {
  cierre: { a: Asignacion; como: 'devolver' | 'incidencia' } | null
  onCerrar: () => void
}) {
  const devolver = useDevolver()
  const reportar = useReportarIncidencia()

  const hoy = new Date().toLocaleDateString('en-CA')
  const [dia, setDia] = useState(hoy)
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState<TipoIncidencia>('PERDIDA')
  const [deBaja, setDeBaja] = useState(true)

  if (!cierre) return null

  const { a, como } = cierre
  const incidencia = como === 'incidencia'
  const valido = incidencia ? texto.trim().length >= 4 : true
  const trabajando = devolver.isPending || reportar.isPending

  const elegirTipo = (t: TipoIncidencia) => {
    setTipo(t)
    // Lo perdido sale del libro, lo dañado se queda. Es lo que pasa casi
    // siempre en cada caso; sigue siendo cambiable.
    setDeBaja(t === 'PERDIDA')
  }

  const enviar = async () => {
    if (incidencia) {
      await reportar.mutateAsync({ id: a.id, tipo, motivo: texto.trim(), deBaja, fecha: dia })
    } else {
      await devolver.mutateAsync({ id: a.id, fecha: dia, nota: texto.trim() || null })
    }
    setTexto('')
    onCerrar()
  }

  const tipos = [
    { valor: 'PERDIDA' as const, titulo: 'No aparece', detalle: 'Se perdió o no la devolvió.' },
    { valor: 'DANO' as const, titulo: 'Está dañada', detalle: 'Volvió rota o dejó de servir.' },
  ]

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      ancho="sm"
      titulo={incidencia ? 'Qué pasó con el bien' : 'Lo devolvió'}
      descripcion={`${cantidad(a.cantidad)} ${a.articulo} · ${a.empleado}`}
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={!valido || trabajando}>
            {trabajando ? 'Guardando…' : incidencia ? 'Reportar' : 'Registrar la devolución'}
          </Button>
        </>
      }
    >
      {incidencia ? (
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          {tipos.map((t) => (
            <button
              key={t.valor}
              type="button"
              onClick={() => elegirTipo(t.valor)}
              className={cn(
                'rounded-card border p-3 text-left transition-colors',
                tipo === t.valor
                  ? 'border-royal-600 bg-royal-600/5'
                  : 'border-hairline hover:border-royal-300',
              )}
            >
              <p className="text-ink/90 text-sm font-medium">{t.titulo}</p>
              <p className="text-ink/50 mt-0.5 text-xs leading-relaxed">{t.detalle}</p>
            </button>
          ))}
        </div>
      ) : null}

      <Input label="Fecha" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />

      <div className="mt-4">
        <Textarea
          label={incidencia ? 'Qué pasó' : 'Nota'}
          rows={3}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          hint={
            incidencia
              ? 'Dentro de tres meses es lo único que dirá si fue un descuido o un accidente de trabajo.'
              : undefined
          }
        />
      </div>

      {incidencia ? (
        <>
          <label className="border-hairline mt-4 flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3">
            <input
              type="checkbox"
              checked={deBaja}
              onChange={(e) => setDeBaja(e.target.checked)}
              className="accent-royal-600 mt-0.5 size-4 shrink-0"
            />
            <span>
              <span className="text-ink/85 text-sm font-medium">Sale del inventario</span>
              <span className="text-ink/50 mt-0.5 block text-xs leading-relaxed">
                {deBaja
                  ? `La existencia baja de verdad: se registra una merma en ${a.almacen}.`
                  : 'Sigue contando en el inventario. El bien está, aunque no sirva ahora mismo.'}
              </span>
            </span>
          </label>

          <div className="border-warning/30 bg-warning-soft mt-4 rounded-[6px] border p-3">
            <p className="text-ink/80 text-sm leading-relaxed">
              Queda anotado a nombre de {a.empleado}, con lo que costaba, hasta que alguien decida
              si se repone, se descuenta o no se cobra.
            </p>
            {a.costo_usd ? (
              <p className="text-ink/60 mt-1 text-xs">Valor aproximado: {dolares(a.costo_usd)}.</p>
            ) : null}
          </div>
        </>
      ) : null}

      {devolver.error ? <ErrorDeCarga error={devolver.error} className="mt-3" /> : null}
      {reportar.error ? <ErrorDeCarga error={reportar.error} className="mt-3" /> : null}
    </Modal>
  )
}


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
