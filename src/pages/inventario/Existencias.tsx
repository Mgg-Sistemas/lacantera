import { useMemo, useState } from 'react'
import { Boxes, PackagePlus, PackageMinus, Scale, Search, TriangleAlert } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useArticulos, useMisRoles } from '@/lib/api/catalogo'
import {
  useAlmacenes,
  useExistencias,
  useRegistrarAjuste,
  useRegistrarSalida,
} from '@/lib/api/inventario'
import { useRegistrarProduccion } from '@/lib/api/ventas'
import type { Existencia } from '@/lib/api/inventario'
import { dolares, enteros } from '@/lib/formato'
import { cn } from '@/lib/cn'

function cantidad(valor: string): string {
  const n = Number(valor)
  return Number.isInteger(n) ? enteros(n) : n.toLocaleString('es-VE', { maximumFractionDigits: 2 })
}

export function Existencias() {
  const { data: almacenes } = useAlmacenes()
  const [almacenId, setAlmacenId] = useState('')
  const { data, isPending, error } = useExistencias(almacenId ? Number(almacenId) : undefined)
  const { puede } = useMisRoles()

  const salida = useRegistrarSalida()
  const ajuste = useRegistrarAjuste()
  const produccion = useRegistrarProduccion()
  const { data: articulos } = useArticulos()

  // La producción es la puerta por la que entra lo que la cantera fabrica. Sin
  // ella el patio dice cero de todo y no hay nada que despachar: es lo primero
  // que falta el día que se abre Ventas.
  const [cargando, setCargando] = useState(false)
  const [prodAlmacen, setProdAlmacen] = useState('')
  const [prodArticulo, setProdArticulo] = useState('')
  const [prodCantidad, setProdCantidad] = useState('')
  const [prodNota, setProdNota] = useState('')
  const [prodFecha, setProdFecha] = useState('')

  const productos = (articulos ?? []).filter((a) => a.categoria === 'PRODUCTO' && a.activo)

  const [busqueda, setBusqueda] = useState('')
  const [soloBajas, setSoloBajas] = useState(false)
  const [modal, setModal] = useState<
    null | { tipo: 'salida' | 'ajuste'; fila: Existencia }
  >(null)
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')

  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return (data ?? []).filter((e) => {
      const bajo = Number(e.stock_minimo) > 0 && Number(e.existencia) <= Number(e.stock_minimo)
      if (soloBajas && !bajo) return false
      if (!texto) return true
      return (
        e.articulo.toLowerCase().includes(texto) ||
        e.articulo_codigo.toLowerCase().includes(texto)
      )
    })
  }, [data, busqueda, soloBajas])

  const valorTotal = filtradas.reduce((s, e) => s + Number(e.valor_usd), 0)
  const bajas = (data ?? []).filter(
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
        description="Lo que hay ahora mismo, calculado sumando el libro de movimientos. No es un número guardado que pueda desincronizarse."
        actions={
          puede('ALMACEN') ? (
            <Button
              icon={<PackagePlus />}
              onClick={() => {
                setProdAlmacen(almacenId)
                setProdArticulo('')
                setProdCantidad('')
                setProdNota('')
                setProdFecha('')
                setCargando(true)
              }}
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
        <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
          <Input
            label="Buscar"
            icon={<Search />}
            placeholder="Nombre o código del artículo"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <Select
            label="Almacén"
            vacio="Todos"
            value={almacenId}
            onChange={(e) => setAlmacenId(e.target.value)}
            opciones={(almacenes ?? []).map((a) => ({
              valor: String(a.id),
              etiqueta: a.nombre,
            }))}
          />
        </div>
      </Card>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && filtradas.length === 0 ? (
        <Card>
          <Vacio
            icono={<Boxes />}
            titulo={data.length === 0 ? 'El inventario está vacío' : 'Nada coincide'}
            descripcion={
              data.length === 0
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
                  {!almacenId ? <th className="px-3 py-3 font-medium">Almacén</th> : null}
                  <th className="px-3 py-3 text-right font-medium">Existencia</th>
                  <th className="px-3 py-3 text-right font-medium">Costo prom.</th>
                  <th className="px-3 py-3 text-right font-medium">Valor</th>
                  <th className="px-5 py-3 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtradas.map((e) => {
                  const bajo =
                    Number(e.stock_minimo) > 0 && Number(e.existencia) <= Number(e.stock_minimo)

                  return (
                    <tr
                      key={`${e.almacen_id}-${e.articulo_id}`}
                      className="border-hairline border-b last:border-0"
                    >
                      <td className="px-5 py-3">
                        <p className="text-ink/85 font-medium">{e.articulo}</p>
                        <p className="text-ink/45 font-mono text-2xs">{e.articulo_codigo}</p>
                      </td>
                      {!almacenId ? (
                        <td className="text-ink/65 px-3 py-3">{e.almacen}</td>
                      ) : null}
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
                      </td>
                      <td className="tabular text-ink/65 px-3 py-3 text-right">
                        {e.costo_promedio_usd ? dolares(e.costo_promedio_usd) : '—'}
                      </td>
                      <td className="tabular text-ink/85 px-3 py-3 text-right">
                        {dolares(e.valor_usd)}
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {puede('ALMACEN') ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<PackageMinus />}
                              onClick={() => abrir('salida', e)}
                            >
                              Sacar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Scale />}
                              onClick={() => abrir('ajuste', e)}
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

      {cargando ? (
        <Modal
          abierto
          ancho="sm"
          onCerrar={() => setCargando(false)}
          titulo="Cargar producción"
          descripcion="Lo que salió de la planta y entra al patio. Es de donde sale el material que después se despacha."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setCargando(false)}>
                Cancelar
              </Button>
              <Button
                disabled={
                  produccion.isPending ||
                  !prodAlmacen ||
                  !prodArticulo ||
                  !Number(prodCantidad) ||
                  prodNota.trim().length < 4
                }
                onClick={async () => {
                  await produccion.mutateAsync({
                    almacen_id: Number(prodAlmacen),
                    articulo_id: Number(prodArticulo),
                    cantidad: Number(prodCantidad),
                    nota: prodNota,
                    fecha: prodFecha || undefined,
                  })
                  setCargando(false)
                }}
              >
                {produccion.isPending ? 'Registrando…' : 'Registrar'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Select
              label="A qué patio entra"
              vacio="Elige el patio"
              value={prodAlmacen}
              onChange={(e) => setProdAlmacen(e.target.value)}
              opciones={(almacenes ?? []).map((a) => ({ valor: String(a.id), etiqueta: a.nombre }))}
              required
            />
            <Select
              label="Qué se produjo"
              vacio="Elige el producto"
              value={prodArticulo}
              onChange={(e) => setProdArticulo(e.target.value)}
              opciones={productos.map((a) => ({
                valor: String(a.id),
                etiqueta: `${a.codigo} · ${a.nombre} (${a.unidad})`,
              }))}
              hint="Solo lo catalogado como producto de cantera."
              required
            />
            <Input
              label="Cantidad"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={prodCantidad}
              onChange={(e) => setProdCantidad(e.target.value)}
              required
            />
            <Input
              label="Fecha"
              type="date"
              hint="En blanco, hoy."
              value={prodFecha}
              onChange={(e) => setProdFecha(e.target.value)}
            />
            <Textarea
              label="De dónde sale"
              placeholder="Turno de la mañana, frente 3, voladura del 28"
              hint="Queda en el libro y no se puede editar. Sin esto, un mes después nadie puede cuadrar el patio."
              rows={2}
              value={prodNota}
              onChange={(e) => setProdNota(e.target.value)}
              required
            />
          </div>

          <p className="text-ink/50 mt-4 text-xs leading-relaxed">
            La producción entra valorada en cero. Lo que cuesta producir una tonelada sale de la
            nómina, el gasoil y la voladura, y ese cálculo todavía no lo lleva el sistema: poner un
            número inventado valoraría el patio con una cifra que nadie calculó.
          </p>

          {produccion.error ? <ErrorDeCarga error={produccion.error} className="mt-4" /> : null}
        </Modal>
      ) : null}
    </>
  )
}
