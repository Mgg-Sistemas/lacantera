import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Visor } from '@/components/Visor'
import { useArticulos, useCategoriasDeInventario, useUnidades } from '@/lib/api/catalogo'
import { useAlmacenes, useExistencias } from '@/lib/api/inventario'
import type { Existencia } from '@/lib/api/inventario'
import { empresaDelPapel, useEmpresa } from '@/lib/api/empresa'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { useSesion } from '@/lib/sesion'
import { armarInventarioExportadoPdf } from '@/lib/ficha/inventarioMggPdf'
import type { RenglonExportado } from '@/lib/ficha/inventarioMggPdf'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { bajarArchivo, escribirXlsx } from '@/lib/xlsx'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { enteros } from '@/lib/formato'
import { almacenUsable, filaUsable } from './comun'
import { CategoriasConCasillas } from './CategoriasConCasillas'

/*
  «EXPORTAR INVENTARIO» (fase 4 de «Almacén e Inventario como MGG»,
  08/11/2026). Copia de `ExportInventarioModal.tsx` de MGG: los filtros, el
  contador de lo que va a salir y `↓ PDF` / `↓ Excel`.

  El PDF agrupa por almacén con su subtotal y el «VALOR TOTAL», como el reporte
  general de MGG (`almacenExport.ts`). El Excel es el mismo listado en una
  hoja, con el escritor de Excel del repo (`lib/xlsx.ts`, sin librería).

  Sin «Receta de fundición»: aquí no hay fundición. Sin permiso para ver el
  valor, el costo y el valor no salen (la base los manda nulos).
*/

type Estado = '' | 'activos' | 'inactivos'

export function ExportarInventario({
  onCerrar,
  inicial,
}: {
  onCerrar: () => void
  /** Los filtros que ya tenía la pantalla principal. */
  inicial?: { texto?: string; categorias?: string[]; almacen?: string }
}) {
  const { data: articulos } = useArticulos(false)
  const existenciasQ = useExistencias()
  const { data: almacenesTodos } = useAlmacenes()
  const { data: categorias } = useCategoriasDeInventario()
  const { data: unidades } = useUnidades()
  const { data: empresa } = useEmpresa()
  const { nombre: yo } = useSesion()

  const [texto, setTexto] = useState(inicial?.texto ?? '')
  const [cats, setCats] = useState<string[]>(inicial?.categorias ?? [])
  const [estado, setEstado] = useState<Estado>('activos')
  const [almacen, setAlmacen] = useState(inicial?.almacen ?? '')
  const [unidad, setUnidad] = useState('')
  const [bajoMinimo, setBajoMinimo] = useState(false)
  const [generando, setGenerando] = useState<'pdf' | 'excel' | null>(null)
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)

  const almacenes = useMemo(() => (almacenesTodos ?? []).filter(almacenUsable), [almacenesTodos])
  const etiquetaDe = (codigo: string) => (categorias ?? []).find((c) => c.codigo === codigo)?.etiqueta ?? codigo

  const renglones = useMemo<RenglonExportado[]>(() => {
    const filasPor = new Map<number, Existencia[]>()
    for (const e of (existenciasQ.data ?? []).filter(filaUsable)) {
      const l = filasPor.get(e.articulo_id) ?? []
      l.push(e)
      filasPor.set(e.articulo_id, l)
    }
    const tokens = texto.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const fuera: RenglonExportado[] = []
    for (const a of articulos ?? []) {
      if (!a.inventariable || a.categoria === 'COMBUSTIBLE') continue
      if (estado === 'activos' && !a.activo) continue
      if (estado === 'inactivos' && a.activo) continue
      if (cats.length > 0 && !cats.includes(a.categoria)) continue
      if (unidad && a.unidad !== unidad) continue
      if (tokens.length > 0) {
        const pajar = `${a.codigo} ${a.codigo_anterior ?? ''} ${a.nombre}`.toLowerCase()
        if (!tokens.every((t) => pajar.includes(t))) continue
      }
      const todas = filasPor.get(a.id) ?? []
      if (bajoMinimo) {
        const minimo = Number(a.stock_minimo) || 0
        const propio = todas.reduce((s, f) => s + Number(f.existencia_propia ?? 0), 0)
        if (!(minimo > 0 && propio < minimo)) continue
      }
      const filas = todas.filter((f) => Number(f.existencia) !== 0 && (!almacen || String(f.almacen_id) === almacen))
      if (filas.length === 0) {
        // Sin existencia en ningún sitio: sale igual, en su propio grupo.
        if (!almacen) {
          fuera.push({
            almacen: 'Sin existencia',
            sku: a.codigo,
            producto: a.nombre,
            categoria: etiquetaDe(a.categoria),
            unidad: a.unidad,
            stock: 0,
            costo: null,
            valor: null,
          })
        }
        continue
      }
      for (const f of filas) {
        fuera.push({
          almacen: f.almacen,
          sku: a.codigo,
          producto: a.nombre,
          categoria: etiquetaDe(a.categoria),
          unidad: a.unidad,
          stock: Number(f.existencia),
          costo: f.costo_promedio_usd == null ? null : Number(f.costo_promedio_usd),
          valor: f.valor_usd == null ? null : Number(f.valor_usd),
        })
      }
    }
    return fuera.sort(
      (x, y) =>
        Number(x.almacen === 'Sin existencia') - Number(y.almacen === 'Sin existencia') ||
        x.almacen.localeCompare(y.almacen, 'es') ||
        x.producto.localeCompare(y.producto, 'es'),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articulos, existenciasQ.data, texto, cats, estado, almacen, unidad, bajoMinimo, categorias])

  const productos = new Set(renglones.map((r) => r.sku)).size
  const veValor = (existenciasQ.data ?? []).some((e) => e.valor_usd !== null)

  const filtroEnPalabras = () =>
    [
      texto.trim() ? `Texto: «${texto.trim()}»` : null,
      cats.length > 0 ? `Categorías: ${cats.map(etiquetaDe).join(', ')}` : null,
      estado === 'activos' ? 'Activos' : estado === 'inactivos' ? 'Inactivos' : null,
      almacen ? `Almacén: ${almacenes.find((a) => String(a.id) === almacen)?.nombre ?? almacen}` : null,
      unidad ? `Unidad: ${unidad}` : null,
      bajoMinimo ? 'Solo con stock por debajo del mínimo' : null,
    ]
      .filter(Boolean)
      .join(' · ')

  const exportarPdf = async () => {
    if (productos === 0) return toast('Ningún producto coincide con los filtros', 'warning')
    setGenerando('pdf')
    try {
      setPdf(
        await armarInventarioExportadoPdf({
          empresa: empresaDelPapel(empresa),
          filtro: filtroEnPalabras() || null,
          renglones,
          emitidoPor: yo ?? '',
          momento: new Date(),
        }),
      )
      toast(`PDF exportado · ${productos} productos`, 'success')
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo armar el PDF'), 'error')
    } finally {
      setGenerando(null)
    }
  }

  const exportarExcel = () => {
    if (productos === 0) return toast('Ningún producto coincide con los filtros', 'warning')
    setGenerando('excel')
    try {
      const total = renglones.reduce((s, r) => s + (r.valor ?? 0), 0)
      const blob = escribirXlsx({
        nombre: 'Inventario',
        columnas: [
          { titulo: 'Almacén', ancho: 22 },
          { titulo: 'SKU', ancho: 14 },
          { titulo: 'Producto', ancho: 40 },
          { titulo: 'Categoría', ancho: 18 },
          { titulo: 'Unidad', ancho: 10 },
          { titulo: 'Stock', ancho: 12 },
          ...(veValor
            ? [
                { titulo: 'Costo unit. (PMP)', ancho: 16 },
                { titulo: 'Valor', ancho: 16 },
              ]
            : []),
        ],
        filas: [
          ...renglones.map((r) => [
            r.almacen,
            r.sku,
            r.producto,
            r.categoria,
            r.unidad,
            r.stock,
            ...(veValor ? [r.costo, r.valor] : []),
          ]),
          ...(veValor ? [['VALOR TOTAL', null, null, null, null, null, null, Math.round(total * 100) / 100]] : []),
        ],
      })
      bajarArchivo(blob, `inventario-${hoyEnCaracas()}.xlsx`)
      toast(`Excel exportado · ${productos} productos`, 'success')
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo armar el Excel'), 'error')
    } finally {
      setGenerando(null)
    }
  }

  return (
    <>
      <Modal
        abierto
        ancho="md"
        onCerrar={onCerrar}
        titulo="Exportar inventario"
        descripcion="Aplicá los filtros que querés que aparezcan en el reporte. La vista previa muestra cuántos productos quedan."
        acciones={
          <>
            <Button variant="ghost" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button variant="outline" disabled={generando !== null} onClick={() => void exportarPdf()}>
              {generando === 'pdf' ? 'Generando…' : '↓ PDF'}
            </Button>
            <Button disabled={generando !== null} onClick={exportarExcel}>
              {generando === 'excel' ? 'Generando…' : '↓ Excel'}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input
              maxLength={100}
              label="Texto (SKU o nombre)"
              icon={<Search />}
              placeholder="Filtro libre"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </div>
          <CategoriasConCasillas
            opciones={(categorias ?? []).filter((c) => c.codigo !== 'COMBUSTIBLE').map((c) => ({ valor: c.codigo, etiqueta: c.etiqueta }))}
            seleccionadas={cats}
            onCambio={setCats}
          />
          <Select
            label="Estado"
            value={estado}
            onChange={(e) => setEstado(e.target.value as Estado)}
            opciones={[
              { valor: '', etiqueta: 'Todos' },
              { valor: 'activos', etiqueta: 'Activos' },
              { valor: 'inactivos', etiqueta: 'Inactivos' },
            ]}
          />
          <Select
            label="Almacén"
            vacio="Todos"
            value={almacen}
            onChange={(e) => setAlmacen(e.target.value)}
            opciones={almacenes.map((a) => ({ valor: String(a.id), etiqueta: a.nombre }))}
          />
          <Select
            label="Unidad"
            vacio="Todas"
            value={unidad}
            onChange={(e) => setUnidad(e.target.value)}
            opciones={(unidades ?? []).map((u) => ({ valor: u.codigo, etiqueta: u.nombre }))}
          />
        </div>
        <label className="text-ink/75 mt-3 flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-royal-600 size-4"
            checked={bajoMinimo}
            onChange={(e) => setBajoMinimo(e.target.checked)}
          />
          Sólo productos con stock por debajo del mínimo
        </label>
        <p className="text-ink/70 mt-4 text-sm">
          <strong>{enteros(productos)}</strong> producto(s) coinciden con los filtros · van a salir en el reporte.
        </p>
      </Modal>

      <Visor
        abierto={pdf !== null}
        onCerrar={() => setPdf(null)}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ''}
        titulo="Exportar inventario"
      />
    </>
  )
}
