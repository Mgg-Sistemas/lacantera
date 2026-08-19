import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  Boxes,
  MapPin,
  PackagePlus,
  PackageMinus,
  Scale,
  Search,
  TriangleAlert,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useMisRoles } from '@/lib/api/catalogo'
import {
  useAlmacenes,
  useExistencias,
  useExistenciasDeArticulo,
  useExistenciasTotales,
  useRegistrarAjuste,
  useRegistrarSalida,
} from '@/lib/api/inventario'
import type { Existencia, ExistenciaTotal } from '@/lib/api/inventario'
import { dolares, enteros } from '@/lib/formato'
import { cn } from '@/lib/cn'

function cantidad(valor: string | number): string {
  const n = Number(valor)
  return Number.isInteger(n) ? enteros(n) : n.toLocaleString('es-VE', { maximumFractionDigits: 2 })
}

/**
 * Lo que hay, empezando por el total de la empresa.
 *
 * PRIMERO TODO, DESPUÉS DÓNDE
 *
 * Antes esta pantalla abría con una fila por almacén y artículo: el mismo saco
 * de cemento aparecía cuatro veces y en ninguna decía cuántos hay en total. Con
 * un solo almacén no se notaba; con patio, almacenes y varios talleres, la
 * primera pregunta —cuánto tiene la empresa— no tenía respuesta en pantalla.
 *
 * Ahora se entra al total, y de ahí se baja: cuántos sitios lo tienen, cuáles
 * son, y en cada uno se saca o se cuenta. La dirección de Sistemas lo pidió en
 * ese orden y es también el orden en que se piensa.
 *
 * LAS ACCIONES SIGUEN COLGANDO DE UN ALMACÉN, NO DEL TOTAL
 *
 * Sacar material del «inventario general» no significa nada: el material sale
 * de un sitio concreto y de ahí se descuenta. Por eso desde el total no se saca
 * nada; se abre el desglose, se elige el almacén, y ahí sí. La pantalla no
 * ofrece lo que no se puede hacer.
 */
export function Existencias() {
  const { data: almacenes } = useAlmacenes()
  const [almacenId, setAlmacenId] = useState('')
  const enTotal = almacenId === ''

  const totales = useExistenciasTotales(enTotal)
  const porAlmacen = useExistencias(almacenId ? Number(almacenId) : undefined, !enTotal)
  const { isPending, error } = enTotal ? totales : porAlmacen

  const { puede } = useMisRoles()
  const salida = useRegistrarSalida()
  const ajuste = useRegistrarAjuste()
  const navegar = useNavigate()

  const [busqueda, setBusqueda] = useState('')
  const [soloBajas, setSoloBajas] = useState(false)
  const [desglose, setDesglose] = useState<ExistenciaTotal | null>(null)
  const [modal, setModal] = useState<null | { tipo: 'salida' | 'ajuste'; fila: Existencia }>(null)
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')

  // La referencia tiene que ser estable o el filtrado se recalcula en cada
  // pintado: `?? []` crea un arreglo nuevo cada vez.
  const crudos = enTotal ? totales.data : porAlmacen.data
  const datos = useMemo<Array<Existencia | ExistenciaTotal>>(() => crudos ?? [], [crudos])

  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return datos.filter((e) => {
      const bajo = Number(e.stock_minimo) > 0 && Number(e.existencia) <= Number(e.stock_minimo)
      if (soloBajas && !bajo) return false
      if (!texto) return true
      return (
        e.articulo.toLowerCase().includes(texto) || e.articulo_codigo.toLowerCase().includes(texto)
      )
    })
  }, [datos, busqueda, soloBajas])

  const valorTotal = filtradas.reduce((s, e) => s + Number(e.valor_usd), 0)
  const bajas = datos.filter(
    (e) => Number(e.stock_minimo) > 0 && Number(e.existencia) <= Number(e.stock_minimo),
  )

  const abrir = (tipo: 'salida' | 'ajuste', fila: Existencia) => {
    setValor(tipo === 'ajuste' ? fila.existencia : '')
    setMotivo('')
    setModal({ tipo, fila })
  }

  const guardar = async () => {
    if (!modal) return

    if (modal.tipo === 'salida') {
      await salida.mutateAsync({
        almacen_id: modal.fila.almacen_id,
        articulo_id: modal.fila.articulo_id,
        cantidad: Number(valor),
        motivo,
      })
    } else {
      await ajuste.mutateAsync({
        almacen_id: modal.fila.almacen_id,
        articulo_id: modal.fila.articulo_id,
        contado: Number(valor),
        motivo,
      })
    }

    setModal(null)
  }

  return (
    <>
      <PageHeader
        title="Existencias"
        description={
          enTotal
            ? 'Todo lo que tiene la empresa, sumado. Elige un almacén o taller para ver y mover lo que hay en él.'
            : 'Lo que hay en este sitio ahora mismo, calculado sumando el libro de movimientos.'
        }
        actions={
          puede('ALMACEN') ? (
            /* El botón de cargar producción vivía aquí mientras Explotación no
               existía. Ahora existe, y la piedra entra por el parte de turno,
               que además sabe de qué frente salió y con cuántas horas. Dos
               puertas al mismo patio es como se cuenta dos veces la misma
               piedra, así que esta se queda como lo que es: un atajo. */
            <Button
              variant="outline"
              icon={<PackagePlus />}
              onClick={() => navegar('/app/explotacion/produccion')}
            >
              Cargar producción
            </Button>
          ) : undefined
        }
      />

      {bajas.length > 0 ? (
        <div className="border-warning/30 bg-warning-soft mb-4 flex items-start gap-2.5 rounded-[6px] border p-3.5">
          <TriangleAlert className="text-warning mt-px size-[18px] shrink-0" />
          <p className="text-ink/80 text-sm">
            <strong className="font-semibold">
              {bajas.length} artículo{bajas.length === 1 ? '' : 's'} en el mínimo o por debajo
            </strong>
            . Conviene pedirlos antes de que hagan falta.{' '}
            <button
              type="button"
              onClick={() => setSoloBajas((v) => !v)}
              className="text-royal-600 dark:text-royal-300 font-medium underline"
            >
              {soloBajas ? 'Ver todo' : 'Ver solo esos'}
            </button>
          </p>
        </div>
      ) : null}

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_240px]">
          <Input
            label="Buscar"
            icon={<Search />}
            placeholder="Nombre o código del artículo"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <Select
            label="Dónde"
            vacio="Todo el inventario"
            value={almacenId}
            onChange={(e) => setAlmacenId(e.target.value)}
            opciones={(almacenes ?? []).map((a) => ({
              valor: String(a.id),
              etiqueta: `${a.nombre}${a.tipo === 'TALLER' ? ' · taller' : ''}`,
            }))}
          />
        </div>
      </Card>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {!isPending && !error && filtradas.length === 0 ? (
        <Card>
          <Vacio
            icono={<Boxes />}
            titulo={datos.length === 0 ? 'El inventario está vacío' : 'Nada coincide'}
            descripcion={
              datos.length === 0
                ? 'Las existencias aparecen cuando entra material: al recibir una compra, al registrar producción o con un ajuste por conteo.'
                : undefined
            }
          />
        </Card>
      ) : null}

      {filtradas.length > 0 ? (
        <Card flush>
          <div className="border-hairline flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-3">
            <p className="text-ink/60 text-sm">
              {filtradas.length} artículo{filtradas.length === 1 ? '' : 's'}
              {enTotal ? ' en toda la empresa' : ''}
            </p>
            <p className="text-ink/80 text-sm">
              Valor del inventario:{' '}
              <span className="tabular font-semibold">{dolares(valorTotal)}</span>
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Artículo</th>
                  <th className="px-3 py-3 text-right font-medium">Existencia</th>
                  <th className="px-3 py-3 font-medium">{enTotal ? 'Repartido en' : 'Almacén'}</th>
                  <th className="px-3 py-3 text-right font-medium">Costo prom.</th>
                  <th className="px-3 py-3 text-right font-medium">Valor</th>
                  <th className="px-5 py-3 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtradas.map((e) => {
                  const bajo =
                    Number(e.stock_minimo) > 0 && Number(e.existencia) <= Number(e.stock_minimo)
                  const total = enTotal ? (e as ExistenciaTotal) : null
                  const fila = enTotal ? null : (e as Existencia)

                  return (
                    <tr
                      key={enTotal ? `t-${e.articulo_id}` : `${fila!.almacen_id}-${e.articulo_id}`}
                      className="border-hairline border-b last:border-0"
                    >
                      <td className="px-5 py-3">
                        <p className="text-ink/85 font-medium">{e.articulo}</p>
                        <p className="text-ink/45 text-2xs font-mono">{e.articulo_codigo}</p>
                      </td>

                      <td className="px-3 py-3 text-right">
                        <span
                          className={cn(
                            'tabular font-semibold',
                            bajo ? 'text-warning' : 'text-ink/85',
                          )}
                        >
                          {cantidad(e.existencia)}
                        </span>
                        <span className="text-ink/45 ml-1 text-xs">{e.unidad}</span>
                        {bajo ? (
                          <Chip tone="warning" className="ml-2">
                            Mínimo {cantidad(e.stock_minimo)}
                          </Chip>
                        ) : null}

                        {/* La otra medida, solo en los materiales cuya densidad
                            se midió. Sin ese dato no se supone: se calla. */}
                        {total?.existencia_equivalente ? (
                          <p className="text-ink/40 text-2xs mt-0.5">
                            ≈ {cantidad(total.existencia_equivalente)} {total.unidad_equivalente}
                          </p>
                        ) : null}
                      </td>

                      <td className="text-ink/65 px-3 py-3">
                        {enTotal
                          ? `${total!.almacenes} sitio${total!.almacenes === 1 ? '' : 's'}`
                          : fila!.almacen}
                      </td>

                      <td className="tabular text-ink/65 px-3 py-3 text-right">
                        {e.costo_promedio_usd ? dolares(e.costo_promedio_usd) : '—'}
                      </td>
                      <td className="tabular text-ink/85 px-3 py-3 text-right">
                        {dolares(e.valor_usd)}
                      </td>

                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {enTotal ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<MapPin />}
                            onClick={() => setDesglose(total)}
                          >
                            Ver dónde está
                          </Button>
                        ) : puede('ALMACEN') ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<PackageMinus />}
                              onClick={() => abrir('salida', fila!)}
                            >
                              Sacar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Scale />}
                              onClick={() => abrir('ajuste', fila!)}
                            >
                              Contar
                            </Button>
                          </>
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

      <ModalDesglose
        articulo={desglose}
        onCerrar={() => setDesglose(null)}
        puedeMover={puede('ALMACEN')}
        onSacar={(f) => {
          setDesglose(null)
          abrir('salida', f)
        }}
        onContar={(f) => {
          setDesglose(null)
          abrir('ajuste', f)
        }}
      />

      {modal ? (
        <Modal
          abierto
          onCerrar={() => setModal(null)}
          titulo={modal.tipo === 'salida' ? 'Sacar material' : 'Conteo físico'}
          descripcion={
            modal.tipo === 'salida'
              ? 'Sale del almacén al costo promedio que tiene ahora.'
              : 'Escribe lo que contaste. El sistema calcula la diferencia y la deja registrada.'
          }
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setModal(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() => void guardar()}
                disabled={!valor || motivo.trim().length < 4 || salida.isPending || ajuste.isPending}
              >
                {salida.isPending || ajuste.isPending ? 'Guardando…' : 'Registrar'}
              </Button>
            </>
          }
        >
          <div className="border-hairline bg-canvas rounded-card mb-4 border p-3">
            <p className="text-ink/85 text-sm font-medium">{modal.fila.articulo}</p>
            <p className="text-ink/55 text-xs">
              {modal.fila.almacen} · hay {cantidad(modal.fila.existencia)} {modal.fila.unidad}
            </p>
          </div>

          <Input
            label={modal.tipo === 'salida' ? 'Cantidad que sale' : 'Cantidad contada'}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            autoFocus
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            hint={
              modal.tipo === 'ajuste' && valor !== ''
                ? `Diferencia: ${(Number(valor) - Number(modal.fila.existencia)).toLocaleString('es-VE', { maximumFractionDigits: 2 })} ${modal.fila.unidad}`
                : undefined
            }
          />

          <Textarea
            label={modal.tipo === 'salida' ? 'Para qué sale' : 'Qué explica la diferencia'}
            className="mt-4"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            hint="Queda en el libro y no se puede editar después."
          />

          {salida.error ? <ErrorDeCarga error={salida.error} className="mt-3" /> : null}
          {ajuste.error ? <ErrorDeCarga error={ajuste.error} className="mt-3" /> : null}
        </Modal>
      ) : null}
    </>
  )
}

/**
 * En qué sitios está repartido un artículo, y qué se puede hacer en cada uno.
 *
 * Es el puente entre el total y el almacén. Las filas con existencia en cero se
 * muestran igual, apagadas: saber que un taller tuvo el repuesto y se le acabó
 * es distinto de no verlo listado, que se lee como que nunca lo manejó.
 */
function ModalDesglose({
  articulo,
  onCerrar,
  puedeMover,
  onSacar,
  onContar,
}: {
  articulo: ExistenciaTotal | null
  onCerrar: () => void
  puedeMover: boolean
  onSacar: (fila: Existencia) => void
  onContar: (fila: Existencia) => void
}) {
  const { data, isPending, error } = useExistenciasDeArticulo(articulo?.articulo_id ?? null)

  return (
    <Modal
      abierto={articulo !== null}
      onCerrar={onCerrar}
      titulo={articulo?.articulo ?? ''}
      descripcion={
        articulo
          ? `Hay ${cantidad(articulo.existencia)} ${articulo.unidad} en total. Aquí es donde están.`
          : undefined
      }
      acciones={
        <Button variant="ghost" onClick={onCerrar}>
          Cerrar
        </Button>
      }
    >
      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data ? (
        <ul className="divide-hairline divide-y">
          {data.map((f) => {
            const vacio = Number(f.existencia) <= 0
            return (
              <li key={f.almacen_id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 grow">
                  <p className={cn('text-sm font-medium', vacio ? 'text-ink/40' : 'text-ink/85')}>
                    {f.almacen}
                  </p>
                  <p className="text-ink/45 text-xs">
                    <span className="tabular">{cantidad(f.existencia)}</span> {f.unidad}
                    {f.costo_promedio_usd ? ` · ${dolares(f.costo_promedio_usd)} c/u` : ''}
                  </p>
                </div>

                {puedeMover ? (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<PackageMinus />}
                      disabled={vacio}
                      onClick={() => onSacar(f)}
                    >
                      Sacar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Scale />}
                      onClick={() => onContar(f)}
                    >
                      Contar
                    </Button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </Modal>
  )
}
