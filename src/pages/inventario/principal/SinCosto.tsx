import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { useExistencias } from '@/lib/api/inventario'
import { useCostosSugeridos, useValorarSinCosto } from '@/lib/api/inventarioPrincipal'
import { useMonedasUsables } from '@/lib/api/tasas'
import { useMisAcciones } from '@/lib/api/usuarios'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { dinero, dolares, enteros } from '@/lib/formato'
import { cn } from '@/lib/cn'
import { cantidad, filaUsable, numeroTecleado } from './comun'

/*
  ⚠ «PRODUCTOS SIN COSTO» (fase 4 de «Almacén e Inventario como MGG»,
  08/11/2026). Copia de `SinCostoModal.tsx` de MGG.

  Aquí «sin costo» es lo que entró «sin valorar» (costo nulo: una donación,
  material sin factura) y todavía está en un almacén. Se carga el costo por
  fila y «Guardar {n} con costo» llama a `valorar_sin_costo` (migración de la
  fase 4), que deja un AJUSTE_COSTO en pareja por cada uno: la existencia no
  cambia y en el kardex queda quién lo valoró y cuándo.

  Lo que MGG hace además —cambiar de almacén desde la columna «Almacén» y
  trasladarlo al guardar— no se copia: aquí el traslado tiene su propio camino
  (⇄ / ↕ Transferencia) y mezclarlo con dinero haría dos cosas en un botón.
*/

interface Renglon {
  clave: string
  almacenId: number
  almacen: string
  articuloId: number
  sku: string
  producto: string
  unidad: string
  sinValorar: number
}

export function SinCosto({ onCerrar }: { onCerrar: () => void }) {
  const existenciasQ = useExistencias()
  const valorar = useValorarSinCosto()
  const monedas = useMonedasUsables()
  const { puede: puedeAccion } = useMisAcciones()
  const puede = puedeAccion('INVENTARIO.AJUSTAR_COSTO')

  const [busca, setBusca] = useState('')
  const [almacen, setAlmacen] = useState('')
  const [moneda, setMoneda] = useState('USD')
  const [costos, setCostos] = useState<Record<string, string>>({})

  const renglones = useMemo<Renglon[]>(
    () =>
      (existenciasQ.data ?? [])
        .filter(filaUsable)
        .map((e) => ({
          clave: `${e.almacen_id}/${e.articulo_id}`,
          almacenId: e.almacen_id,
          almacen: e.almacen,
          articuloId: e.articulo_id,
          sku: e.articulo_codigo,
          producto: e.articulo,
          unidad: e.unidad,
          // Puede pasar de la existencia en un caso raro del libro: se valora lo que hay.
          sinValorar: Math.min(Number(e.existencia), Number(e.existencia_sin_valorar ?? 0)),
        }))
        .filter((r) => r.sinValorar > 0)
        .sort((a, b) => a.producto.localeCompare(b.producto, 'es')),
    [existenciasQ.data],
  )
  const sugeridos = useCostosSugeridos(
    renglones.map((r) => r.articuloId),
    renglones.length > 0,
  )

  const almacenes = [...new Map(renglones.map((r) => [r.almacenId, r.almacen])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1], 'es'),
  )
  const q = busca.trim().toLowerCase()
  const visibles = renglones.filter(
    (r) =>
      (!almacen || String(r.almacenId) === almacen) &&
      (!q || `${r.producto} ${r.sku}`.toLowerCase().includes(q)),
  )

  const conCosto = renglones
    .map((r) => ({ r, costo: numeroTecleado(costos[r.clave] ?? '') }))
    .filter((x) => Number.isFinite(x.costo) && x.costo > 0)
  const recupera = conCosto.reduce((s, x) => s + x.costo * x.r.sinValorar, 0)

  const guardar = async () => {
    if (conCosto.length === 0) return
    try {
      const r = await valorar.mutateAsync({
        renglones: conCosto.map((x) => ({
          almacen_id: x.r.almacenId,
          articulo_id: x.r.articuloId,
          costo: x.costo,
          moneda,
        })),
      })
      toast(`${r.renglones} producto(s) quedaron con costo · ${dolares(r.valor_usd)} en libros`, 'success')
      setCostos({})
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo guardar el costo'), 'error')
    }
  }

  return (
    <Modal
      abierto
      ancho="xl"
      onCerrar={onCerrar}
      titulo="Productos sin costo"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cerrar
          </Button>
          <Button disabled={!puede || conCosto.length === 0 || valorar.isPending} onClick={() => void guardar()}>
            {valorar.isPending ? 'Guardando…' : `Guardar ${conCosto.length} con costo`}
          </Button>
        </>
      }
    >
      <p className="text-ink/70 text-sm">
        Estas existencias tienen material contado pero valen <strong>$0</strong> en el inventario: el stock está, el
        valor no. Cargá el costo unitario y queda un ajuste en el kardex con quién lo valoró y cuándo.
      </p>
      {!puede ? (
        <p className="text-warning mt-2 text-sm">Cargar el costo lo hace quien tiene permiso para corregir costos.</p>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_14rem_9rem_auto] sm:items-end">
        <Input
          label="Buscar"
          ocultarEtiqueta
          icon={<Search />}
          placeholder="Buscar por nombre o SKU…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <Select
          label="Almacén"
          vacio={`Todos los almacenes (${renglones.length})`}
          value={almacen}
          onChange={(e) => setAlmacen(e.target.value)}
          opciones={almacenes.map(([id, n]) => ({ valor: String(id), etiqueta: n }))}
        />
        <Select
          label="Moneda"
          value={moneda}
          onChange={(e) => setMoneda(e.target.value)}
          opciones={(monedas.data ?? [{ valor: 'USD', etiqueta: 'USD' }]).map((m) => ({ valor: m.valor, etiqueta: m.etiqueta }))}
        />
        <Button variant="ghost" onClick={() => void existenciasQ.refetch()}>
          ↻ Refrescar
        </Button>
      </div>

      {conCosto.length > 0 ? (
        <p className="border-success/40 bg-success/6 text-ink/80 rounded-control mt-3 border px-3 py-2 text-sm">
          Con lo cargado el inventario recupera <strong>{dinero(moneda, recupera)}</strong> en {enteros(conCosto.length)}{' '}
          producto(s).
        </p>
      ) : null}

      {existenciasQ.isPending ? <Cargando /> : null}
      {existenciasQ.error ? <ErrorDeCarga error={existenciasQ.error} className="mt-3" /> : null}
      {valorar.error ? <ErrorDeCarga error={valorar.error} className="mt-3" /> : null}

      {!existenciasQ.isPending && renglones.length === 0 ? (
        <p className="text-ink/65 mt-6 text-center text-sm">
          <strong>No queda ningún producto sin costo.</strong> Todo el stock del inventario está valorado.
        </p>
      ) : null}

      {visibles.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                <th className="py-2 pr-3 font-medium">Producto</th>
                <th className="py-2 pr-3 font-medium">Almacén</th>
                <th className="py-2 pr-3 text-right font-medium">Stock</th>
                <th className="py-2 pr-3 font-medium">Costo unitario</th>
                <th className="py-2 pr-3 text-right font-medium">Valor</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((r) => {
                const texto = costos[r.clave] ?? ''
                const costo = numeroTecleado(texto)
                const ok = Number.isFinite(costo) && costo > 0
                const sug = sugeridos.data?.get(r.articuloId)
                return (
                  <tr key={r.clave} className={cn('border-hairline border-b last:border-0', ok && 'bg-success/4')}>
                    <td className="py-2 pr-3">
                      <p className="text-ink/85">{r.producto}</p>
                      <p className="text-ink/45 font-mono text-xs">{r.sku}</p>
                    </td>
                    <td className="py-2 pr-3">{r.almacen}</td>
                    <td className="tabular py-2 pr-3 text-right whitespace-nowrap">
                      {cantidad(r.sinValorar)} {r.unidad}
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        inputMode="decimal"
                        aria-label={`Costo unitario de ${r.producto}`}
                        placeholder="0,00"
                        disabled={!puede}
                        value={texto}
                        onChange={(e) => setCostos((c) => ({ ...c, [r.clave]: e.target.value }))}
                        className="rounded-control border-ink/20 bg-surface focus:border-royal-600 h-9 w-28 border px-2.5 text-right"
                      />
                      {sug ? (
                        <button
                          type="button"
                          disabled={!puede}
                          onClick={() =>
                            setCostos((c) => ({ ...c, [r.clave]: String(sug.costo_usd).replace('.', ',') }))
                          }
                          className="text-royal-600 dark:text-royal-300 mt-0.5 block text-xs underline"
                          title="Usar el último costo de compra (en dólares)"
                        >
                          sugerido de {sug.orden ?? 'la última compra'}: {dolares(sug.costo_usd)}
                        </button>
                      ) : null}
                    </td>
                    <td className="tabular py-2 pr-3 text-right whitespace-nowrap">
                      {ok ? dinero(moneda, costo * r.sinValorar) : '—'}
                    </td>
                    <td className="text-success py-2 text-center">{ok ? '✓' : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </Modal>
  )
}
