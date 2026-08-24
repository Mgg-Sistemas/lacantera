import { useState } from 'react'
import { ArrowLeft, PieChart, Plus, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_ANALISIS } from '@/components/pestanasDeModulos'
import { RangoDeFechas } from '@/components/RangoDeFechas'
import { SIN_RANGO } from '@/components/rango'
import type { Rango } from '@/components/rango'
import { Dona } from '@/components/Dona'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import {
  useCategoriasGasto,
  useClasificarGasto,
  useGastoPorCategoria,
  useGastosDelPeriodo,
  useGuardarPresupuesto,
  useResumenCentroCostos,
} from '@/lib/api/centroDeCostos'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { useMisPermisos } from '@/lib/api/usuarios'
import { dolares, enteros, fecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

/*
  EL CENTRO DE COSTOS

  La líder pidió un control de egresos simplificado: cuánto se entregó, cuánto se
  ha gastado, qué queda, y cuánto cuesta sacar un metro cúbico.

  NO ES UNA CAJA, Y ESA ES LA DECISIÓN QUE ORDENA LA PANTALLA

  «El registro de un gasto no debe restar ni reiniciar a cero una caja general».
  Por eso arriba no hay ningún saldo de banco ni de caja chica: hay un FONDO
  ASIGNADO que no se mueve, y un gastado que se le compara. El balance puede
  quedar en negativo y no pasa nada — significa que se gastó más de lo entregado,
  que es información, no un error que haya que impedir.

  LA TORTA SE ABRE

  Christopher: «es la categoría de la categoría; todo depende de a qué nivel se
  esté tratando». Así que la torta empieza por los seis grandes y se pulsa para
  entrar en el detalle. Volver es un clic, y el rango de fechas se mantiene: lo
  que cambia es el nivel, no lo que se está mirando.
*/

export function CentroDeCostos() {
  const [rango, setRango] = useState<Rango>(SIN_RANGO)
  const [dentroDe, setDentroDe] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [clasificando, setClasificando] = useState<number | null>(null)

  const resumen = useResumenCentroCostos(rango)
  const trozos = useGastoPorCategoria(rango, dentroDe)
  const detalle = useGastosDelPeriodo(rango, dentroDe)

  const { puede } = useMisPermisos()
  const puedeAsignar = puede('COMPRAS', 'TOTAL')
  const puedeClasificar = puede('COMPRAS', 'ESCRITURA')

  const r = resumen.data
  const hayFondo = r ? Number(r.asignado_usd) > 0 : false
  const balance = r ? Number(r.balance_usd) : 0
  const sinClasificar = r ? Number(r.sin_clasificar_usd) : 0

  // El nombre legible del grupo en el que se ha entrado. Sale del propio
  // detalle en vez de pedirse aparte: las filas ya lo traen.
  const nombreDeDentro = dentroDe
    ? ((detalle.data ?? []).find((g) => g.categoria_raiz === dentroDe)?.categoria_raiz_nombre ??
      undefined)
    : undefined

  return (
    <>
      <PageHeader
        title="Centro de costos"
        description="Lo que se entregó para operar, lo que se ha gastado y lo que cuesta sacar el material. No es una caja: el fondo no se mueve."
        actions={
          puedeAsignar ? (
            <Button variant="outline" onClick={() => setEditando(true)}>
              <Plus className="size-4" />
              Asignar fondo
            </Button>
          ) : undefined
        }
      />

      <Pestanas pestanas={PESTANAS_ANALISIS} />

      <Card className="mb-4">
        <RangoDeFechas valor={rango} onCambio={setRango} />
        <p className="text-ink/40 mt-2 text-xs">
          Las fechas se cuentan por el día en que salió el dinero, en hora de Venezuela.
        </p>
      </Card>

      {resumen.isPending ? <Cargando /> : null}
      {resumen.error ? <ErrorDeCarga error={resumen.error} /> : null}

      {r ? (
        <>
          {/*
            Las cuatro cifras que pidió la líder, en el orden en que se leen:
            cuánto había, cuánto se fue, qué queda y a cuánto sale el material.
          */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Cifra
              rotulo="Fondo asignado"
              valor={hayFondo ? dolares(r.asignado_usd) : '—'}
              pie={
                hayFondo
                  ? 'Lo entregado para operar en el período'
                  : 'Todavía no se ha cargado ningún fondo'
              }
              apagada={!hayFondo}
            />
            <Cifra rotulo="Total gastado" valor={dolares(r.gastado_usd)} pie="Egresos del período" />
            <Cifra
              rotulo="Balance operativo"
              valor={hayFondo ? dolares(r.balance_usd) : '—'}
              pie={
                !hayFondo
                  ? 'Hace falta un fondo para compararlo'
                  : balance < 0
                    ? 'Se ha gastado más de lo entregado'
                    : `Ejecutado el ${r.ejecutado_pct}% del fondo`
              }
              alerta={hayFondo && balance < 0}
              apagada={!hayFondo}
            />
            <Cifra
              rotulo="Inversión por material"
              valor={
                r.costo_por_unidad
                  ? `${dolares(r.costo_por_unidad)} / ${r.unidad_produccion}`
                  : '—'
              }
              pie={
                r.costo_por_unidad
                  ? `Sobre ${enteros(r.produccion_asignada ?? 0)} ${r.unidad_produccion} asignados`
                  : 'Falta decir cuánto volumen tiene que sacar el fondo'
              }
              apagada={!r.costo_por_unidad}
            />
          </div>

          {/* Un hueco en los datos se avisa donde se ve, no en una nota al pie:
              si una quinta parte del gasto no está clasificado, la torta de al
              lado no se puede leer sin saberlo. */}
          {sinClasificar > 0 ? (
            <Card className="border-warning/30 bg-warning-soft mt-4">
              <p className="text-ink/80 text-sm">
                Hay <span className="tabular font-semibold">{dolares(sinClasificar)}</span> sin
                clasificar. Son egresos que no vienen de una orden ni de una nómina, así que el
                sistema no puede deducir de qué clase son: hay que decírselo al registrarlos.
              </p>
            </Card>
          ) : null}

          <Card className="mt-5">
            <CardHeader
              title={dentroDe ? `Dentro de ${nombreDeDentro ?? dentroDe}` : 'En qué se gasta'}
              subtitle={
                dentroDe
                  ? 'El detalle de esa categoría. Los porcentajes son sobre este grupo, no sobre el gasto total.'
                  : 'Los seis grandes. Pulsa una porción para ver el detalle de dentro.'
              }
              action={
                dentroDe ? (
                  <Button variant="ghost" onClick={() => setDentroDe(null)}>
                    <ArrowLeft className="size-4" />
                    Volver
                  </Button>
                ) : undefined
              }
            />

            {trozos.isPending ? <Cargando /> : null}
            {trozos.error ? <ErrorDeCarga error={trozos.error} className="mt-3" /> : null}

            {trozos.data && trozos.data.length === 0 ? (
              <Vacio
                icono={<PieChart />}
                titulo="Nada que repartir"
                descripcion="No hay egresos registrados en el período que estás mirando."
              />
            ) : null}

            {trozos.data && trozos.data.length > 0 ? (
              <Dona
                className="mt-4"
                total={dolares(r.gastado_usd)}
                rotulo={dentroDe ? (nombreDeDentro ?? 'gastado') : 'gastado'}
                porciones={trozos.data.map((t) => ({
                  codigo: t.codigo,
                  nombre: t.nombre,
                  valor: Number(t.total_usd),
                  porcentaje: Number(t.porcentaje),
                }))}
                // Solo se puede entrar en las que tienen detalle dentro. Pulsar
                // una hoja y que no pase nada se lee como que está rota.
                onElegir={
                  dentroDe
                    ? undefined
                    : (codigo) => {
                        const t = trozos.data?.find((x) => x.codigo === codigo)
                        if (t?.tiene_hijos) setDentroDe(codigo)
                      }
                }
              />
            ) : null}
          </Card>

          <Card flush className="mt-5">
            <div className="border-hairline border-b px-5 py-3.5">
              <p className="text-ink/85 text-sm font-medium">Movimientos</p>
              <p className="text-ink/45 mt-0.5 text-xs">
                Cada egreso del período, con su fecha, concepto, categoría y monto.
              </p>
            </div>

            {detalle.isPending ? <Cargando /> : null}
            {detalle.error ? <ErrorDeCarga error={detalle.error} className="m-4" /> : null}

            {detalle.data && detalle.data.length === 0 ? (
              <Vacio
                icono={<Wallet />}
                titulo="Sin movimientos"
                descripcion="No salió dinero en el período que estás mirando."
              />
            ) : null}

            {detalle.data && detalle.data.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                      <th className="px-5 py-2.5 font-medium">Fecha</th>
                      <th className="px-5 py-2.5 font-medium">Concepto</th>
                      <th className="px-5 py-2.5 font-medium">Categoría</th>
                      <th className="px-5 py-2.5 text-right font-medium">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-hairline divide-y">
                    {detalle.data.map((g) => (
                      <tr key={g.id}>
                        <td className="text-ink/60 px-5 py-2.5 whitespace-nowrap">
                          {fecha(g.fecha)}
                        </td>
                        <td className="text-ink/85 px-5 py-2.5">
                          {g.concepto}
                          {g.contraparte ? (
                            <span className="text-ink/45"> · {g.contraparte}</span>
                          ) : null}
                          {g.numero ? (
                            <span className="text-ink/35 text-2xs ml-1.5 font-mono">{g.numero}</span>
                          ) : null}
                        </td>
                        <td className="px-5 py-2.5">
                          {g.categoria_nombre ? (
                            <Chip tone="neutral">{g.categoria_nombre}</Chip>
                          ) : puedeClasificar ? (
                            /* El aviso ES el botón. Un «sin clasificar» que no
                               se puede tocar obliga a buscar dónde se arregla, y
                               el sitio donde se ve el problema es el sitio donde
                               hay que poder resolverlo. */
                            <button
                              type="button"
                              onClick={() => setClasificando(g.id)}
                              className="text-warning hover:bg-warning-soft rounded-full px-2.5 py-1 text-xs transition-colors"
                            >
                              Sin clasificar · decir de qué clase es
                            </button>
                          ) : (
                            <Chip tone="warning">Sin clasificar</Chip>
                          )}
                        </td>
                        <td className="tabular text-ink/85 px-5 py-2.5 text-right whitespace-nowrap">
                          {dolares(g.monto_usd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Card>
        </>
      ) : null}

      <ModalFondo abierto={editando} onCerrar={() => setEditando(false)} />
      <ModalClase gastoId={clasificando} onCerrar={() => setClasificando(null)} />
    </>
  )
}

function Cifra({
  rotulo,
  valor,
  pie,
  alerta,
  apagada,
}: {
  rotulo: string
  valor: string
  pie: string
  alerta?: boolean
  apagada?: boolean
}) {
  return (
    <Card className={cn(alerta ? 'border-danger/30' : undefined)}>
      <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">{rotulo}</p>
      <p
        className={cn(
          'tabular mt-3 text-2xl font-light',
          alerta ? 'text-danger' : apagada ? 'text-ink/30' : 'text-ink/90',
        )}
      >
        {valor}
      </p>
      <p className="text-ink/45 mt-2 text-xs">{pie}</p>
    </Card>
  )
}

/*
  ASIGNAR EL FONDO

  Es lo único que se escribe en esta pantalla, y no es un movimiento de dinero:
  es decir cuánto entregaron y qué se espera sacar con ello. Por eso no pide
  cuenta ni forma de pago — no sale de ningún sitio, entra.
*/
function ModalFondo({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const guardar = useGuardarPresupuesto()
  const hoy = hoyEnCaracas()

  const [desde, setDesde] = useState(hoy.slice(0, 8) + '01')
  const [hasta, setHasta] = useState(hoy)
  const [monto, setMonto] = useState('')
  const [volumen, setVolumen] = useState('')
  const [nota, setNota] = useState('')

  const valido = Number(monto) > 0 && desde !== '' && hasta !== '' && hasta >= desde

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Asignar fondo a la cantera"
      descripcion="El monto entregado para operar en un período. No es una cuenta: no se mueve ni baja al registrar gastos."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={!valido || guardar.isPending}
            onClick={async () => {
              await guardar.mutateAsync({
                desde,
                hasta,
                monto: Number(monto),
                produccion_asignada: volumen ? Number(volumen) : null,
                nota: nota.trim() || null,
              })
              setMonto('')
              setVolumen('')
              setNota('')
              onCerrar()
            }}
          >
            {guardar.isPending ? 'Guardando…' : 'Asignar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <Input label="Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input
          label="Monto asignado (USD)"
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />
        <Input
          label="Volumen a producir (M³)"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={volumen}
          onChange={(e) => setVolumen(e.target.value)}
          hint="Es lo que convierte el gasto en costo por metro cúbico. Opcional."
        />
      </div>

      <div className="mt-4">
        <Textarea label="Nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
      </div>

      {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-3" /> : null}
    </Modal>
  )
}

/*
  DECIR DE QUE CLASE ES UN GASTO YA REGISTRADO

  Solo se puede una vez y solo si nacio sin clase. El libro de tesoreria es
  inmutable —esa es su razon de ser— y esta es una de las tres transiciones que
  el disparador deja pasar: de nula a valor, sin tocar el monto ni la fecha ni
  la cuenta.

  Si la clase estuviera mal puesta, el camino es el de siempre en este libro:
  reversar el movimiento. No se corrige encima.
*/
function ModalClase({
  gastoId,
  onCerrar,
}: {
  gastoId: number | null
  onCerrar: () => void
}) {
  const categorias = useCategoriasGasto()
  const clasificar = useClasificarGasto()
  const [elegida, setElegida] = useState('')

  const hojas = (categorias.data ?? []).filter((c) => c.padre !== null)

  return (
    <Modal
      abierto={gastoId !== null}
      onCerrar={onCerrar}
      titulo="De qué clase es este gasto"
      descripcion="Se dice una vez. Después no se cambia, como todo en el libro de tesorería."
      ancho="sm"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={!elegida || clasificar.isPending || gastoId === null}
            onClick={async () => {
              if (gastoId === null) return
              await clasificar.mutateAsync({ id: gastoId, categoria: elegida })
              setElegida('')
              onCerrar()
            }}
          >
            {clasificar.isPending ? 'Guardando…' : 'Clasificar'}
          </Button>
        </>
      }
    >
      <Select
        label="Clase"
        vacio="Elegir"
        value={elegida}
        onChange={(e) => setElegida(e.target.value)}
        opciones={hojas.map((c) => {
          const padre = (categorias.data ?? []).find((p) => p.codigo === c.padre)
          return {
            valor: c.codigo,
            etiqueta: padre ? `${padre.nombre} · ${c.nombre}` : c.nombre,
          }
        })}
        hint="Se ofrece el detalle y no los seis grandes: la torta suma hacia arriba sola."
      />

      {clasificar.error ? <ErrorDeCarga error={clasificar.error} className="mt-3" /> : null}
    </Modal>
  )
}
