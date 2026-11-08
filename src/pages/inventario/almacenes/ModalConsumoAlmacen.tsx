import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Visor } from '@/components/Visor'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Segmento } from '@/components/ui/Segmento'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { consumoPorProducto, useMovimientosDeAlmacen } from '@/lib/api/almacenesValor'
import type { ConsumoDeProducto } from '@/lib/api/almacenesValor'
import { TIPOS_MOVIMIENTO } from '@/lib/api/inventario'
import type { Almacen, Existencia } from '@/lib/api/inventario'
import { useEmpresa } from '@/lib/api/empresa'
import { hoyEnCaracas } from '@/lib/api/tasas'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { armarConsumoAlmacen, hojaConsumoAlmacen } from '@/lib/ficha/reporteAlmacen'
import { dolares, enteros } from '@/lib/formato'
import { fechaCorta, sumarDias } from '@/lib/reportesCompras'
import { useSesion } from '@/lib/sesion'
import { bajarArchivo, escribirXlsx } from '@/lib/xlsx'
import { cn } from '@/lib/cn'
import { cantidad } from './comun'

/*
  📊 CONSUMO · {ALMACÉN} (fase 6, 08/11/2026)

  `ConsumoChartModal` de MGG: período (hoy, 7 o 15 días, el mes o un rango),
  una barra por producto, la tabla «Producto · Cantidad · Valor ($)» con su
  total, el detalle de movimientos al tocar un producto, y el reporte en PDF
  (y aquí también en Excel).

  Sale del libro (`inventario_movimientos`) del almacén: las salidas que no
  vuelven, sin las que se reversaron (ver `almacenesValor.ts`). El valor es el
  del movimiento —cantidad por el costo con que salió—; lo que salió sin
  valorar suma cero. No hay «✉ Correo»: La Cantera no tiene hoy con qué mandar
  correos desde la pantalla.
*/

type Preset = 'hoy' | '7d' | '15d' | 'mes' | 'rango'

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: '7d', label: '7 días' },
  { key: '15d', label: '15 días' },
  { key: 'mes', label: 'Este mes' },
  { key: 'rango', label: 'Rango' },
]

function rangoDePreset(p: Preset, hoy: string, desde: string, hasta: string) {
  if (p === 'rango') return { desde, hasta }
  if (p === 'hoy') return { desde: hoy, hasta: hoy }
  if (p === '7d') return { desde: sumarDias(hoy, -7), hasta: hoy }
  if (p === '15d') return { desde: sumarDias(hoy, -15), hasta: hoy }
  return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy }
}

export function ModalConsumoAlmacen({
  almacen,
  filas,
  onCerrar,
}: {
  almacen: Almacen
  /** Las filas de `v_existencias` de este almacén: de ahí salen nombre, código y unidad. */
  filas: Existencia[]
  onCerrar: () => void
}) {
  const hoy = hoyEnCaracas()
  const movs = useMovimientosDeAlmacen(almacen.id)
  const { data: empresa } = useEmpresa()
  const { nombre: yo } = useSesion()

  const [preset, setPreset] = useState<Preset>('15d')
  const [desdeStr, setDesdeStr] = useState(hoy)
  const [hastaStr, setHastaStr] = useState(hoy)
  const [busca, setBusca] = useState('')
  const [detalle, setDetalle] = useState<ConsumoDeProducto | null>(null)
  const [tipoFiltro, setTipoFiltro] = useState('')
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [generando, setGenerando] = useState(false)
  const [errorPdf, setErrorPdf] = useState<unknown>(null)

  /*
    Sin `INVENTARIO.VER_VALORACION` la vista anula el valor. Entonces la
    métrica es la cantidad y la columna de dinero no se dibuja: una tabla que
    dice que todo costó 0,00 afirma algo falso.
  */
  const veValor = filas.length === 0 || filas.some((e) => e.valor_usd !== null)
  const [metricaElegida, setMetrica] = useState<'valor' | 'cantidad'>('valor')
  const metrica = veValor ? metricaElegida : 'cantidad'

  const { desde, hasta } = rangoDePreset(preset, hoy, desdeStr, hastaStr)
  const periodoLabel =
    preset === 'rango'
      ? `${fechaCorta(desde)} → ${fechaCorta(hasta)}`
      : (PRESETS.find((p) => p.key === preset)?.label ?? '')

  const filasConsumo = useMemo(
    () =>
      consumoPorProducto(movs.data ?? [], desde, hasta, filas).sort((a, b) =>
        metrica === 'valor' ? b.valor - a.valor : b.cantidad - a.cantidad,
      ),
    [movs.data, desde, hasta, filas, metrica],
  )

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return filasConsumo
    return filasConsumo.filter(
      (r) => r.nombre.toLowerCase().includes(q) || r.codigo.toLowerCase().includes(q),
    )
  }, [filasConsumo, busca])

  const totalCantidad = filtradas.reduce((s, r) => s + r.cantidad, 0)
  const totalValor = filtradas.reduce((s, r) => s + r.valor, 0)
  const maximo = Math.max(0, ...filtradas.map((r) => (metrica === 'valor' ? r.valor : r.cantidad)))

  const renglones = filtradas.map((r) => ({
    producto: r.nombre,
    codigo: r.codigo,
    unidad: r.unidad,
    cantidad: r.cantidad,
    valor: r.valor,
  }))

  const verPdf = async () => {
    setGenerando(true)
    setErrorPdf(null)
    try {
      setPdf(
        await armarConsumoAlmacen({
          almacen: almacen.nombre,
          periodo: periodoLabel,
          renglones,
          conValor: veValor,
          empresa: { razonSocial: empresa?.razon_social ?? '', rif: empresa?.rif ?? '' },
          emitidoPor: yo ?? '',
          momento: new Date(),
        }),
      )
    } catch (e) {
      setErrorPdf(e)
    } finally {
      setGenerando(false)
    }
  }

  const bajarExcel = () =>
    bajarArchivo(
      escribirXlsx(hojaConsumoAlmacen({ almacen: almacen.nombre, renglones, conValor: veValor })),
      `consumo-${almacen.codigo.toLowerCase()}-${hoy}.xlsx`,
    )

  const tiposDetalle = detalle ? [...new Set(detalle.movimientos.map((m) => m.tipo))] : []
  const detalleFiltrado = detalle
    ? detalle.movimientos
        .filter((m) => !tipoFiltro || m.tipo === tipoFiltro)
        .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)
    : []

  return (
    <>
      <Modal
        abierto
        onCerrar={onCerrar}
        titulo={`📊 Consumo · ${almacen.nombre}`}
        ancho="lg"
        acciones={
          <>
            <Button variant="ghost" onClick={onCerrar}>
              Cerrar
            </Button>
            <Button
              variant="ghost"
              disabled={filtradas.length === 0}
              onClick={bajarExcel}
              title="Bajar el consumo del período en Excel"
            >
              ↓ Excel
            </Button>
            <Button
              disabled={filtradas.length === 0 || generando}
              onClick={() => void verPdf()}
              title="Ver el reporte del período en PDF"
            >
              {generando ? 'Generando…' : '↓ PDF'}
            </Button>
          </>
        }
      >
        <p className="text-ink/55 mb-4 text-sm">
          Consumo de productos de este almacén (salidas a consumo, por despacho, como pago de una
          compra y mermas). La gráfica muestra cada producto; el valor en $ usa el costo del
          movimiento.
        </p>

        {detalle ? (
          /* ------------------------------- Movimientos · {producto} */
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDetalle(null)}>
                ← Volver
              </Button>
              <h3 className="text-ink/85 text-base font-semibold">Movimientos · {detalle.nombre}</h3>
            </div>
            {tiposDetalle.length > 1 ? (
              <div className="mb-3 flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant={tipoFiltro === '' ? 'soft' : 'ghost'}
                  onClick={() => setTipoFiltro('')}
                >
                  Todos
                </Button>
                {tiposDetalle.map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant={tipoFiltro === t ? 'soft' : 'ghost'}
                    onClick={() => setTipoFiltro(t)}
                  >
                    {TIPOS_MOVIMIENTO[t] ?? t}
                  </Button>
                ))}
              </div>
            ) : null}
            <div className="border-hairline max-h-80 overflow-auto rounded-lg border">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                    <th className="px-3 py-2 font-medium">Fecha</th>
                    <th className="px-3 py-2 font-medium">Movimiento</th>
                    <th className="px-3 py-2 font-medium">Tipo</th>
                    <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                    {veValor ? <th className="px-3 py-2 text-right font-medium">Valor ($)</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {detalleFiltrado.map((m) => (
                    <tr key={m.id} className="border-hairline border-b last:border-0">
                      <td className="text-ink/70 px-3 py-2">{fechaCorta(m.fecha)}</td>
                      <td className="text-ink/60 px-3 py-2 font-mono text-xs">{m.numero}</td>
                      <td className="text-ink/70 px-3 py-2">{TIPOS_MOVIMIENTO[m.tipo] ?? m.tipo}</td>
                      <td className="tabular px-3 py-2 text-right">
                        {cantidad(Number(m.cantidad) || 0)} {detalle.unidad}
                      </td>
                      {veValor ? (
                        <td className="tabular px-3 py-2 text-right">
                          {m.valor_usd === null ? 'sin valorar' : dolares(Math.abs(Number(m.valor_usd)))}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <>
            {/* -------------------------------------------- período */}
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {PRESETS.map((p) => (
                <Button
                  key={p.key}
                  size="sm"
                  variant={preset === p.key ? 'soft' : 'ghost'}
                  onClick={() => setPreset(p.key)}
                >
                  {p.label}
                </Button>
              ))}
              {veValor ? (
                <Segmento
                  className="sm:ml-auto"
                  valor={metrica}
                  onCambio={(v) => setMetrica(v as 'valor' | 'cantidad')}
                  opciones={[
                    { valor: 'valor', etiqueta: 'Valor ($)' },
                    { valor: 'cantidad', etiqueta: 'Cantidad' },
                  ]}
                />
              ) : null}
            </div>
            {preset === 'rango' ? (
              <div className="mb-3 grid grid-cols-2 gap-3 sm:max-w-sm">
                <Input
                  label="Desde"
                  type="date"
                  value={desdeStr}
                  max={hastaStr}
                  onChange={(e) => setDesdeStr(e.target.value)}
                />
                <Input
                  label="Hasta"
                  type="date"
                  value={hastaStr}
                  min={desdeStr}
                  max={hoy}
                  onChange={(e) => setHastaStr(e.target.value)}
                />
              </div>
            ) : null}

            <div className="mb-4 sm:max-w-xs">
              <Input
                label="Buscar"
                icon={<Search />}
                placeholder="Buscar por nombre…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>

            {movs.isPending ? <Cargando texto="Cargando el consumo…" /> : null}
            {movs.error ? <ErrorDeCarga error={movs.error} className="mb-4" /> : null}

            {!movs.isPending && !movs.error ? (
              <>
                {/* --------------------------------------- totales */}
                <div className={cn('mb-4 grid gap-3', veValor ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
                  <Total label="Productos consumidos" valor={enteros(filtradas.length)} />
                  <Total label="Cantidad total" valor={cantidad(totalCantidad)} />
                  {veValor ? <Total label="Valor total ($)" valor={dolares(totalValor)} realce /> : null}
                </div>

                {/* ---------------------------------------- gráfica */}
                <Card className="mb-4 p-4">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-ink/80 text-sm font-semibold">
                      Consumo por producto {metrica === 'valor' ? '(en $)' : '(en cantidad)'}
                    </p>
                    <p className="text-ink/45 font-mono text-xs">{productosEn(filtradas.length)}</p>
                  </div>
                  {filtradas.length === 0 ? (
                    <p className="text-ink/45 py-6 text-center text-sm">Sin consumo en el período seleccionado.</p>
                  ) : (
                    <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                      {filtradas.map((r) => {
                        const v = metrica === 'valor' ? r.valor : r.cantidad
                        return (
                          <li
                            key={r.articulo_id}
                            title={`${r.nombre}: ${cantidad(r.cantidad)} ${r.unidad}${veValor ? ` · ${dolares(r.valor)}` : ''}`}
                          >
                            <div className="flex items-baseline justify-between gap-3 text-xs">
                              <span className="text-ink/70 truncate">{r.nombre}</span>
                              <span className="text-ink/80 tabular shrink-0 font-medium">
                                {metrica === 'valor' ? dolares(v) : `${cantidad(v)} ${r.unidad}`}
                              </span>
                            </div>
                            <div className="bg-ink/6 mt-1 h-2 overflow-hidden rounded-full">
                              <div
                                className="bg-royal-600 h-full rounded-full"
                                style={{ width: `${maximo > 0 ? Math.max(2, (v / maximo) * 100) : 0}%` }}
                              />
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </Card>

                {/* ------------------------------------------ tabla */}
                <div className="border-hairline max-h-72 overflow-auto rounded-lg border">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                        <th className="px-3 py-2 font-medium">Producto</th>
                        <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                        {veValor ? <th className="px-3 py-2 text-right font-medium">Valor ($)</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {filtradas.length === 0 ? (
                        <tr>
                          <td colSpan={veValor ? 3 : 2} className="text-ink/45 px-3 py-4 text-center">
                            Sin consumo en el período.
                          </td>
                        </tr>
                      ) : null}
                      {filtradas.map((r) => (
                        <tr
                          key={r.articulo_id}
                          onClick={() => {
                            setTipoFiltro('')
                            setDetalle(r)
                          }}
                          title="Ver detalle de movimientos"
                          className="border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors last:border-0"
                        >
                          <td className="text-ink/85 px-3 py-2">
                            {r.nombre}
                            <span className="text-ink/40 font-mono text-xs"> · {r.codigo}</span>
                            <span className="text-ink/40 text-xs"> ›</span>
                          </td>
                          <td className="tabular px-3 py-2 text-right">
                            {cantidad(r.cantidad)} {r.unidad}
                          </td>
                          {veValor ? <td className="tabular px-3 py-2 text-right">{dolares(r.valor)}</td> : null}
                        </tr>
                      ))}
                    </tbody>
                    {filtradas.length > 0 ? (
                      <tfoot>
                        <tr className="border-hairline border-t font-semibold">
                          <td className="px-3 py-2 text-right">TOTAL</td>
                          <td className="tabular px-3 py-2 text-right">{cantidad(totalCantidad)}</td>
                          {veValor ? (
                            <td className="tabular text-royal-700 dark:text-royal-300 px-3 py-2 text-right">
                              {dolares(totalValor)}
                            </td>
                          ) : null}
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
                </div>
              </>
            ) : null}
          </>
        )}

        {errorPdf ? <ErrorDeCarga error={errorPdf} className="mt-3" /> : null}
      </Modal>

      <Visor
        abierto={pdf !== null}
        onCerrar={() => setPdf(null)}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ''}
        titulo={`Consumo · ${almacen.nombre}`}
      />
    </>
  )
}

const productosEn = (n: number) => `${enteros(n)} producto(s)`

function Total({ label, valor, realce = false }: { label: string; valor: string; realce?: boolean }) {
  return (
    <div className="border-hairline min-w-0 rounded-lg border px-3 py-2">
      <p className="text-ink/45 text-2xs truncate font-mono tracking-[0.12em] uppercase">{label}</p>
      <p
        className={cn(
          'tabular mt-1 truncate text-base font-semibold sm:text-lg',
          realce ? 'text-royal-700 dark:text-royal-300' : 'text-ink/85',
        )}
      >
        {valor}
      </p>
    </div>
  )
}
