import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Search, Warehouse } from 'lucide-react'
import { DeQuienEs } from '@/components/DeQuienEs'
import { Visor } from '@/components/Visor'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Segmento } from '@/components/ui/Segmento'
import { Select } from '@/components/ui/Select'
import { ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { estadisticasDeAlmacen, useMovimientosDeAlmacen } from '@/lib/api/almacenesValor'
import type { EstadisticaDeProducto } from '@/lib/api/almacenesValor'
import type { Almacen, Existencia } from '@/lib/api/inventario'
import { useEmpresa } from '@/lib/api/empresa'
import { hoyEnCaracas } from '@/lib/api/tasas'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { armarReporteAlmacen, hojaReporteAlmacen } from '@/lib/ficha/reporteAlmacen'
import { dolares } from '@/lib/formato'
import { useSesion } from '@/lib/sesion'
import { bajarArchivo, escribirXlsx } from '@/lib/xlsx'
import { cn } from '@/lib/cn'
import { cantidad, guardarVista, leerVista, productos, renglonesDeReporte } from './comun'

/*
  ▣ DETALLE DE UN ALMACÉN (fase 6, 08/11/2026)

  El nivel 3 de MGG (`InventarioPage.tsx` L.1073-1128 y `AlmacenKanban.tsx`):
  cabecera con el valor, «📊 Consumo», «↓ Excel» y «↓ PDF», el conmutador
  «▦ Kanban» / «☰ Lista» (por defecto Lista, como MGG) y los productos del
  almacén con «Entradas» y «Salidas» en la tabla y «Stock · Precio UND · Valor
  total · Total usados · Consumo diario» en las tarjetas.

  Lo que no se copia, y por qué:
  - «⇄ Mover» y «📍 También en…»: aquí se mueve con un traslado y un artículo
    ya existe en todos los almacenes. Para mover está «Ver en Existencias»,
    que abre este mismo almacén con todos sus botones de La Cantera.
  - Subalmacenes y ubicación física: no existen en La Cantera (sin migración).
*/

type Vista = 'kanban' | 'lista'
const CLAVE_VISTA = 'lacantera.almacenes.detalle.vista'

const SIN_ESTADISTICA: EstadisticaDeProducto = { entradas: 0, salidas: 0, usados: 0, diario: 0 }

export function DetalleAlmacen({
  almacen,
  filas,
  etiquetaDeCategoria,
  escribe,
  onVolver,
  onConsumo,
}: {
  almacen: Almacen
  /** Las filas de `v_existencias` de este almacén. */
  filas: Existencia[]
  etiquetaDeCategoria: (codigo: string) => string
  escribe: boolean
  onVolver: () => void
  onConsumo: () => void
}) {
  const navegar = useNavigate()
  const hoy = hoyEnCaracas()
  const movs = useMovimientosDeAlmacen(almacen.id)
  const { data: empresa } = useEmpresa()
  const { nombre: yo } = useSesion()

  const [vista, setVistaEstado] = useState<Vista>(() => leerVista(CLAVE_VISTA, 'lista', ['kanban', 'lista']))
  const setVista = (v: Vista) => {
    setVistaEstado(v)
    guardarVista(CLAVE_VISTA, v)
  }
  const [texto, setTexto] = useState('')
  const [categoria, setCategoria] = useState('')
  const [conCeros, setConCeros] = useState(false)
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [armando, setArmando] = useState(false)
  const [errorPdf, setErrorPdf] = useState<unknown>(null)

  const stats = useMemo(() => estadisticasDeAlmacen(movs.data ?? [], hoy), [movs.data, hoy])

  const veValor = filas.length === 0 || filas.some((e) => e.valor_usd !== null)
  const conExistencia = filas.filter((e) => (Number(e.existencia) || 0) !== 0)
  const valor = conExistencia.reduce((s, e) => s + (Number(e.valor_usd) || 0), 0)

  const categorias = useMemo(
    () => [...new Set(filas.map((e) => e.categoria))].sort((a, b) => etiquetaDeCategoria(a).localeCompare(etiquetaDeCategoria(b), 'es')),
    [filas, etiquetaDeCategoria],
  )

  const visibles = useMemo(() => {
    const q = texto.trim().toLowerCase()
    return filas
      .filter((e) => conCeros || (Number(e.existencia) || 0) !== 0)
      .filter((e) => !categoria || e.categoria === categoria)
      .filter(
        (e) => !q || e.articulo.toLowerCase().includes(q) || e.articulo_codigo.toLowerCase().includes(q),
      )
      .sort((a, b) => a.articulo.localeCompare(b.articulo, 'es', { numeric: true, sensitivity: 'base' }))
  }, [filas, texto, categoria, conCeros])

  const renglones = renglonesDeReporte(filas, etiquetaDeCategoria)
  const verFicha = (id: number) => void navegar(`/app/inventario/articulos/${id}`)

  const verPdf = async () => {
    setArmando(true)
    setErrorPdf(null)
    try {
      setPdf(
        await armarReporteAlmacen({
          almacen: almacen.nombre,
          renglones,
          empresa: { razonSocial: empresa?.razon_social ?? '', rif: empresa?.rif ?? '' },
          emitidoPor: yo ?? '',
          momento: new Date(),
        }),
      )
    } catch (e) {
      setErrorPdf(e)
    } finally {
      setArmando(false)
    }
  }

  const stockLabel = `Stock en ${almacen.nombre}`
  const statsDe = (id: number) => stats.get(id) ?? SIN_ESTADISTICA
  const cargandoStats = movs.isPending

  return (
    <>
      {/* ---------------------------------------------------- cabecera */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button variant="ghost" size="sm" onClick={onVolver}>
          ← Volver a almacenes
        </Button>
        <h2 className="text-ink/90 text-xl font-semibold tracking-tight">▣ {almacen.nombre}</h2>
        <DeQuienEs propietario={almacen.propietario} />
        <span className="text-ink/55 font-mono text-sm">
          {veValor ? `${dolares(valor)} · ` : ''}
          {productos(conExistencia.length)}
        </span>
        <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          {escribe ? (
            <Link to="/app/inventario/articulos?nuevo=1" title="Dar de alta un producto en el catálogo">
              <Button variant="ghost" size="sm">+ Nuevo producto</Button>
            </Link>
          ) : null}
          <Link
            to={`/app/inventario/existencias?almacen=${almacen.id}`}
            title="Contar, trasladar, sacar o corregir el costo de lo que hay en este almacén"
          >
            <Button variant="ghost" size="sm">↕ Mover material</Button>
          </Link>
          <Button size="sm" onClick={onConsumo} title="Gráfica de consumo por producto de este almacén">
            📊 Consumo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={renglones.length === 0}
            onClick={() =>
              bajarArchivo(
                escribirXlsx(hojaReporteAlmacen(almacen.nombre, renglones)),
                `almacen-${almacen.codigo.toLowerCase()}.xlsx`,
              )
            }
          >
            ↓ Excel
          </Button>
          <Button variant="ghost" size="sm" disabled={renglones.length === 0 || armando} onClick={() => void verPdf()}>
            {armando ? 'Generando…' : '↓ PDF'}
          </Button>
        </div>
      </div>
      {errorPdf ? <ErrorDeCarga error={errorPdf} className="mb-4" /> : null}

      {/* ----------------------------------------------- vista y filtros */}
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
          <Input
            maxLength={100}
            label="Buscar"
            icon={<Search />}
            placeholder="Nombre o código del producto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <Select
            label="Categoría"
            vacio="Todas"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            opciones={categorias.map((c) => ({ valor: c, etiqueta: etiquetaDeCategoria(c) }))}
          />
          <Segmento
            className="self-end"
            valor={vista}
            onCambio={(v) => setVista(v as Vista)}
            opciones={[
              { valor: 'kanban', etiqueta: '▦ Kanban' },
              { valor: 'lista', etiqueta: '☰ Lista' },
            ]}
          />
        </div>
        <label className="text-ink/70 mt-3 flex cursor-pointer items-center gap-2 text-sm select-none">
          <input
            type="checkbox"
            className="accent-royal-600 size-4"
            checked={conCeros}
            onChange={(e) => setConCeros(e.target.checked)}
          />
          Mostrar también lo que está en cero
        </label>
      </Card>

      {movs.error ? <ErrorDeCarga error={movs.error} className="mb-4" /> : null}

      {visibles.length === 0 ? (
        <Card>
          <Vacio
            icono={<Warehouse />}
            titulo={filas.length === 0 || (!texto && !categoria) ? 'El almacén no tiene productos.' : 'Sin productos que coincidan con los filtros.'}
          />
        </Card>
      ) : vista === 'kanban' ? (
        /* ------------------------------------------------- kanban */
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
          {visibles.map((e) => {
            const s = statsDe(e.articulo_id)
            const stock = Number(e.existencia) || 0
            const u = e.unidad
            return (
              <Card
                key={e.articulo_id}
                className="hover:shadow-primary relative cursor-pointer overflow-hidden transition-shadow"
                onClick={() => verFicha(e.articulo_id)}
                title="Ver detalle del producto"
              >
                <span className="bg-royal-600 absolute inset-x-0 top-0 h-[3px]" aria-hidden="true" />
                <p className="text-ink/90 font-semibold">{e.articulo}</p>
                <p className="text-ink/45 mb-3 font-mono text-xs">{e.articulo_codigo}</p>
                <div className="grid gap-2">
                  <Metrica label="Stock" valor={`${cantidad(stock)} ${u}`} className="text-royal-700 dark:text-royal-300" />
                  <Metrica
                    label="Precio UND"
                    valor={veValor && e.costo_promedio_usd !== null ? dolares(e.costo_promedio_usd) : '—'}
                    className="text-ink/85"
                  />
                  <Metrica
                    label="Valor total"
                    valor={veValor ? dolares(e.valor_usd ?? 0) : '—'}
                    className="text-success"
                  />
                  <Metrica
                    label="Total usados"
                    valor={cargandoStats ? '…' : `${cantidad(s.usados)} ${u}`}
                    className="text-warning"
                  />
                  <Metrica
                    label="Consumo diario"
                    valor={cargandoStats ? '…' : `${cantidad(s.diario)} ${u}/día`}
                    className="text-ink/55"
                  />
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        /* -------------------------------------------------- lista */
        <Card flush>
          <div className="border-hairline border-b px-5 py-3">
            <p className="text-ink/60 text-sm">{productos(visibles.length)}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">SKU</th>
                  <th className="px-3 py-3 font-medium">Producto</th>
                  <th className="px-3 py-3 font-medium">Categoría</th>
                  <th className="px-3 py-3 text-right font-medium" title="Total de entradas históricas">
                    Entradas
                  </th>
                  <th className="px-3 py-3 text-right font-medium" title="Total de salidas históricas">
                    Salidas
                  </th>
                  <th
                    className="px-3 py-3 text-right font-medium"
                    title={`${stockLabel}: solo lo que hay en este almacén. El total de todos se ve en la ficha del producto.`}
                  >
                    {stockLabel}
                  </th>
                  <th className="px-3 py-3 text-right font-medium">Precio UND</th>
                  <th className="px-3 py-3 text-right font-medium" title="Precio total = stock × precio UND">
                    Valor
                  </th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {visibles.map((e) => {
                  const s = statsDe(e.articulo_id)
                  const stock = Number(e.existencia) || 0
                  const minimo = Number(e.stock_minimo) || 0
                  const prestadas = Number(e.prestadas) || 0
                  return (
                    <tr
                      key={e.articulo_id}
                      onClick={() => verFicha(e.articulo_id)}
                      className="border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors last:border-0"
                    >
                      <td className="text-ink/60 px-5 py-3 font-mono text-xs">{e.articulo_codigo}</td>
                      <td className="text-ink/85 px-3 py-3 font-medium">{e.articulo}</td>
                      <td className="px-3 py-3">
                        <Chip tone="neutral">{etiquetaDeCategoria(e.categoria)}</Chip>
                      </td>
                      <td className="text-success tabular px-3 py-3 text-right">
                        {cargandoStats ? '…' : `+${cantidad(s.entradas)}`}
                      </td>
                      <td className="text-danger tabular px-3 py-3 text-right">
                        {cargandoStats ? '…' : `−${cantidad(s.salidas)}`}
                      </td>
                      <td className="tabular px-3 py-3 text-right">
                        <span className={cn('text-ink/85', stock === 0 && 'text-ink/40')}>
                          {cantidad(stock)} {e.unidad}
                        </span>
                        {minimo > 0 && stock < minimo ? (
                          <Chip tone="danger" className="ml-2" title="Stock por debajo del mínimo">
                            ⚠ crítico
                          </Chip>
                        ) : null}
                        {prestadas > 0 ? (
                          <span className="text-ink/45 block text-xs">{cantidad(prestadas)} prestada(s)</span>
                        ) : null}
                      </td>
                      <td className="text-ink/70 tabular px-3 py-3 text-right">
                        {veValor && e.costo_promedio_usd !== null ? dolares(e.costo_promedio_usd) : '—'}
                      </td>
                      <td className="text-ink/85 tabular px-3 py-3 text-right font-medium">
                        {veValor ? dolares(e.valor_usd ?? 0) : '—'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Ver detalle y kardex"
                          onClick={(ev) => {
                            ev.stopPropagation()
                            verFicha(e.articulo_id)
                          }}
                        >
                          📋
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Visor
        abierto={pdf !== null}
        onCerrar={() => setPdf(null)}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ''}
        titulo={`Reporte · ${almacen.nombre}`}
      />
    </>
  )
}

/** Una métrica de la tarjeta: rótulo chico en mayúsculas, valor a la derecha. */
function Metrica({ label, valor, className }: { label: string; valor: string; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-ink/45 text-2xs font-mono tracking-[0.08em] uppercase">{label}</span>
      <strong className={cn('tabular text-sm', className)}>{valor}</strong>
    </div>
  )
}
