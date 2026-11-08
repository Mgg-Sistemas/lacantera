import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { Visor } from '@/components/Visor'
import { useArticulos } from '@/lib/api/catalogo'
import type { Articulo } from '@/lib/api/catalogo'
import { useExistencias } from '@/lib/api/inventario'
import { useMovimientosDelResumen } from '@/lib/api/inventarioPrincipal'
import type { MovimientoDelResumen } from '@/lib/api/inventarioPrincipal'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { empresaDelPapel, useEmpresa } from '@/lib/api/empresa'
import { useSesion } from '@/lib/sesion'
import { armarResumenInventarioPdf } from '@/lib/ficha/inventarioMggPdf'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { dolares, enteros } from '@/lib/formato'
import { cn } from '@/lib/cn'
import { FUERA, cantidad, fechaCorta, filaUsable } from './comun'

/*
  📊 «RESUMEN DE INVENTARIO» (fase 4 de «Almacén e Inventario como MGG»,
  08/11/2026). Copia de `ResumenInventarioModal.tsx` de MGG:

  - Período: «Hoy» · «Semana» · «Mes» y «Desde» / «Hasta».
  - KPIs: VALOR TOTAL INVENTARIO, PRODUCTOS NUEVOS, SALIDAS y TRASLADOS (los
    tres de movimientos abren su tabla al tocarlos).
  - «Total por almacén»; al tocar uno, sus productos; al tocar un producto, su
    trazabilidad.
  - «↓ PDF (vista previa)». El «✉ Enviar por correo» de MGG no se copia: aquí
    no hay correo saliente.

  Datos: el libro (`inventario_movimientos`) por fecha y `v_existencias` para
  el valor de hoy. Sin combustible ni lo que va en camino.
*/

type Grupo = 'nuevos' | 'salidas' | 'traslados'

interface Fila {
  articuloId: number
  fecha: string
  sku: string
  producto: string
  cantidad: string
  almacen: string
  destino: string
  valor: number | null
}

/** Una fecha `aaaa-mm-dd` corrida unos días. */
function correr(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00`)
  d.setDate(d.getDate() + dias)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}

export function ResumenInventario({
  onCerrar,
  onVerProducto,
}: {
  onCerrar: () => void
  onVerProducto: (articuloId: number) => void
}) {
  const hoy = hoyEnCaracas()
  const [desde, setDesde] = useState(`${hoy.slice(0, 8)}01`)
  const [hasta, setHasta] = useState(hoy)
  const [verGrupo, setVerGrupo] = useState<Grupo | null>(null)
  const [verAlmacen, setVerAlmacen] = useState<number | null>(null)
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [armando, setArmando] = useState(false)

  const existenciasQ = useExistencias()
  const articulosQ = useArticulos(false)
  const movsQ = useMovimientosDelResumen(desde, hasta, desde <= hasta)
  const { data: empresa } = useEmpresa()
  const { nombre: yo } = useSesion()

  const existencias = useMemo(() => (existenciasQ.data ?? []).filter(filaUsable), [existenciasQ.data])
  const veValor = existencias.some((e) => e.valor_usd !== null)
  const valorTotal = existencias.reduce((s, e) => s + Number(e.valor_usd ?? 0), 0)

  // ------------------------------------------------- total por almacén
  const porAlmacen = useMemo(() => {
    const m = new Map<number, { nombre: string; productos: number; unidades: number; valor: number }>()
    for (const e of existencias) {
      if (Number(e.existencia) <= 0) continue
      const a = m.get(e.almacen_id) ?? { nombre: e.almacen, productos: 0, unidades: 0, valor: 0 }
      a.productos += 1
      a.unidades += Number(e.existencia)
      a.valor += Number(e.valor_usd ?? 0)
      m.set(e.almacen_id, a)
    }
    return [...m.entries()].sort((a, b) => b[1].valor - a[1].valor || a[1].nombre.localeCompare(b[1].nombre, 'es'))
  }, [existencias])

  // ------------------------------------------------ los tres grupos
  const grupos = useMemo(() => {
    const movs = (movsQ.data ?? []).filter((m) => !FUERA.includes(m.almacen?.tipo ?? ''))
    const fila = (m: MovimientoDelResumen): Fila => ({
      articuloId: m.articulo_id,
      fecha: m.fecha,
      sku: m.articulo?.codigo ?? '—',
      producto: m.articulo?.nombre ?? '—',
      cantidad: `${cantidad(Number(m.cantidad))} ${m.unidad}`,
      almacen: m.almacen?.nombre ?? '—',
      destino: m.destino ?? '',
      valor: veValor && m.valor_usd != null ? Number(m.valor_usd) : null,
    })
    const salidas = movs.filter((m) => m.tipo.startsWith('SALIDA_')).map(fila)
    const traslados = movs.filter((m) => m.tipo === 'TRANSFERENCIA_SALIDA').map(fila)

    /*
      PRODUCTOS NUEVOS: lo que se dio de alta en el catálogo en el período. En
      MGG es el movimiento «Alta de producto»; aquí el alta no mueve el libro,
      así que se cuenta el artículo y se suma lo que entró de él en el período.
    */
    const entradas = movs.filter((m) => m.tipo.startsWith('ENTRADA_'))
    const nuevos: Fila[] = (articulosQ.data ?? [])
      .filter((a) => a.inventariable && a.categoria !== 'COMBUSTIBLE')
      .map((a) => ({ a, creado: ((a as Articulo & { creado_en?: string }).creado_en ?? '').slice(0, 10) }))
      .filter(({ creado }) => creado >= desde && creado <= hasta)
      .map(({ a, creado }) => {
        const suyas = entradas.filter((m) => m.articulo_id === a.id)
        const total = suyas.reduce((s, m) => s + Number(m.cantidad), 0)
        const valor = suyas.reduce((s, m) => s + Number(m.valor_usd ?? 0), 0)
        return {
          articuloId: a.id,
          fecha: creado,
          sku: a.codigo,
          producto: a.nombre,
          cantidad: `${cantidad(total)} ${a.unidad}`,
          almacen: [...new Set(suyas.map((m) => m.almacen?.nombre).filter(Boolean))].join(', ') || '—',
          destino: '',
          valor: veValor ? valor : null,
        }
      })
      .sort((x, y) => y.fecha.localeCompare(x.fecha))
    return { nuevos, salidas, traslados }
  }, [movsQ.data, articulosQ.data, desde, hasta, veValor])

  const totalDe = (f: Fila[]) => (veValor ? f.reduce((s, x) => s + (x.valor ?? 0), 0) : null)
  const TITULO: Record<Grupo, string> = { nuevos: 'Productos nuevos', salidas: 'Salidas', traslados: 'Traslados' }

  const descargarPdf = async () => {
    setArmando(true)
    try {
      setPdf(
        await armarResumenInventarioPdf({
          empresa: empresaDelPapel(empresa),
          desde: fechaCorta(desde),
          hasta: fechaCorta(hasta),
          valorTotal: veValor ? valorTotal : null,
          almacenes: porAlmacen.map(([, a]) => ({ ...a, valor: veValor ? a.valor : null })),
          grupos: (['nuevos', 'salidas', 'traslados'] as Grupo[]).map((g) => ({
            titulo: TITULO[g],
            filas: grupos[g].map((f) => ({ ...f, fecha: fechaCorta(f.fecha) })),
            valor: totalDe(grupos[g]),
          })),
          emitidoPor: yo ?? '',
          momento: new Date(),
        }),
      )
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo armar el PDF'), 'error')
    } finally {
      setArmando(false)
    }
  }

  const elegir = (d: string, h: string) => {
    setDesde(d)
    setHasta(h)
  }

  const grupoSel = verGrupo ? grupos[verGrupo] : null
  const almacenSel = porAlmacen.find(([id]) => id === verAlmacen)
  const productosDeAlmacen = existencias
    .filter((e) => e.almacen_id === verAlmacen && Number(e.existencia) > 0)
    .sort((a, b) => Number(b.valor_usd ?? 0) - Number(a.valor_usd ?? 0) || a.articulo.localeCompare(b.articulo, 'es'))

  return (
    <>
      <Modal
        abierto
        ancho="xl"
        onCerrar={onCerrar}
        titulo="📊 Resumen de Inventario"
        acciones={
          <>
            <Button variant="ghost" onClick={onCerrar}>
              Cerrar
            </Button>
            <Button disabled={!movsQ.data || armando} onClick={() => void descargarPdf()}>
              {armando ? 'Generando…' : '↓ PDF (vista previa)'}
            </Button>
          </>
        }
      >
        {/* ------------------------------------------------- período */}
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => elegir(hoy, hoy)}>
            Hoy
          </Button>
          <Button size="sm" variant="ghost" onClick={() => elegir(correr(hoy, -6), hoy)}>
            Semana
          </Button>
          <Button size="sm" variant="ghost" onClick={() => elegir(`${hoy.slice(0, 8)}01`, hoy)}>
            Mes
          </Button>
          <div className="w-40">
            <Input label="Desde" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="w-40">
            <Input label="Hasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
          </div>
          {movsQ.isFetching ? <span className="text-ink/50 pb-2 text-sm">cargando…</span> : null}
        </div>

        {movsQ.error ? <ErrorDeCarga error={movsQ.error} className="mb-4" /> : null}

        {/* ---------------------------------------------------- KPIs */}
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiResumen
            label="VALOR TOTAL INVENTARIO"
            valor={veValor ? dolares(valorTotal) : '—'}
            sub={`${enteros(porAlmacen.length)} almacén(es)`}
          />
          {(['nuevos', 'salidas', 'traslados'] as Grupo[]).map((g) => (
            <KpiResumen
              key={g}
              label={TITULO[g].toUpperCase()}
              valor={enteros(grupos[g].length)}
              sub={totalDe(grupos[g]) !== null ? dolares(totalDe(grupos[g])!) : '—'}
              color={g === 'nuevos' ? 'border-l-success' : g === 'salidas' ? 'border-l-warning' : 'border-l-info'}
              activo={verGrupo === g}
              onClick={() => setVerGrupo(verGrupo === g ? null : g)}
            />
          ))}
        </div>

        {/* ----------------------------------------- detalle del grupo */}
        {verGrupo && grupoSel ? (
          <Card className="mb-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-ink/85 font-semibold">
                {TITULO[verGrupo]} · {enteros(grupoSel.length)}
                {totalDe(grupoSel) !== null ? ` · ${dolares(totalDe(grupoSel)!)}` : ''}
              </p>
              <Button size="sm" variant="ghost" aria-label="Cerrar el detalle" onClick={() => setVerGrupo(null)}>
                ✕
              </Button>
            </div>
            {grupoSel.length === 0 ? (
              <p className="text-ink/55 text-sm">Sin movimientos en el período.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                        <th className="py-2 pr-3 font-medium">Fecha</th>
                        <th className="py-2 pr-3 font-medium">SKU</th>
                        <th className="py-2 pr-3 font-medium">Producto</th>
                        <th className="py-2 pr-3 text-right font-medium">Cant.</th>
                        <th className="py-2 pr-3 font-medium">Almacén</th>
                        <th className="py-2 pr-3 font-medium">Destino</th>
                        <th className="py-2 text-right font-medium">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grupoSel.map((f, i) => (
                        <tr
                          key={`${f.articuloId}-${i}`}
                          title="Ver la trazabilidad del producto"
                          className="border-hairline hover:bg-ink/4 cursor-pointer border-b last:border-0"
                          onClick={() => onVerProducto(f.articuloId)}
                        >
                          <td className="py-2 pr-3 whitespace-nowrap">{fechaCorta(f.fecha)}</td>
                          <td className="text-ink/60 py-2 pr-3 font-mono text-xs">{f.sku}</td>
                          <td className="py-2 pr-3">{f.producto}</td>
                          <td className="tabular py-2 pr-3 text-right whitespace-nowrap">{f.cantidad}</td>
                          <td className="py-2 pr-3">{f.almacen}</td>
                          <td className="py-2 pr-3">{f.destino || '—'}</td>
                          <td className="tabular py-2 text-right whitespace-nowrap">
                            {f.valor !== null ? dolares(f.valor) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-ink/50 mt-2 text-xs">👆 Tocá una fila para ver la trazabilidad (kardex) del producto.</p>
              </>
            )}
          </Card>
        ) : null}

        {/* -------------------------------------- total por almacén */}
        <Card>
          <p className="text-ink/85 mb-2 font-semibold">Total por almacén</p>
          {existenciasQ.isPending ? <Cargando /> : null}
          {existenciasQ.error ? <ErrorDeCarga error={existenciasQ.error} /> : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="py-2 pr-3 font-medium">Almacén</th>
                  <th className="py-2 pr-3 text-right font-medium">Productos</th>
                  <th className="py-2 pr-3 text-right font-medium">Unidades</th>
                  <th className="py-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {porAlmacen.map(([id, a]) => (
                  <tr
                    key={id}
                    className="border-hairline hover:bg-ink/4 cursor-pointer border-b last:border-0"
                    onClick={() => setVerAlmacen(id)}
                  >
                    <td className="py-2 pr-3">{a.nombre}</td>
                    <td className="tabular py-2 pr-3 text-right">{enteros(a.productos)}</td>
                    <td className="tabular py-2 pr-3 text-right">{cantidad(a.unidades)}</td>
                    <td className="tabular py-2 text-right">{veValor ? dolares(a.valor) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Modal>

      {/* ------------------------------------------- 📦 un almacén */}
      {almacenSel ? (
        <Modal
          abierto
          ancho="lg"
          onCerrar={() => setVerAlmacen(null)}
          titulo={`📦 ${almacenSel[1].nombre}`}
          acciones={<Button onClick={() => setVerAlmacen(null)}>Cerrar</Button>}
        >
          {productosDeAlmacen.length === 0 ? (
            <p className="text-ink/55 text-sm">Sin productos con stock en este almacén.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                    <th className="py-2 pr-3 font-medium">SKU</th>
                    <th className="py-2 pr-3 font-medium">Producto</th>
                    <th className="py-2 pr-3 text-right font-medium">Stock</th>
                    <th className="py-2 pr-3 text-right font-medium">Costo</th>
                    <th className="py-2 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {productosDeAlmacen.map((e) => (
                    <tr
                      key={e.articulo_id}
                      title="Ver la trazabilidad del producto"
                      className="border-hairline hover:bg-ink/4 cursor-pointer border-b last:border-0"
                      onClick={() => onVerProducto(e.articulo_id)}
                    >
                      <td className="text-ink/60 py-2 pr-3 font-mono text-xs">{e.articulo_codigo}</td>
                      <td className="py-2 pr-3">{e.articulo}</td>
                      <td className="tabular py-2 pr-3 text-right whitespace-nowrap">
                        {cantidad(Number(e.existencia))} {e.unidad}
                      </td>
                      <td className="tabular py-2 pr-3 text-right">
                        {e.costo_promedio_usd != null ? dolares(Number(e.costo_promedio_usd)) : '—'}
                      </td>
                      <td className="tabular py-2 text-right">{e.valor_usd != null ? dolares(Number(e.valor_usd)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      ) : null}

      <Visor
        abierto={pdf !== null}
        onCerrar={() => setPdf(null)}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ''}
        titulo="Resumen de inventario"
      />
    </>
  )
}

function KpiResumen({
  label,
  valor,
  sub,
  color,
  activo = false,
  onClick,
}: {
  label: string
  valor: string
  sub: string
  color?: string
  activo?: boolean
  onClick?: () => void
}) {
  const clases = cn(
    'bg-surface border-hairline rounded-card border px-4 py-3 text-left',
    color && `border-l-4 ${color}`,
    onClick && 'hover:bg-ink/3 cursor-pointer transition-colors',
    activo && 'ring-royal-600/40 ring-2',
  )
  const dentro = (
    <>
      <p className="text-ink/50 text-2xs font-mono tracking-[0.12em]">{label}</p>
      <p className="text-ink/90 tabular mt-1 text-xl font-semibold">{valor}</p>
      <p className="text-ink/50 mt-0.5 text-xs">{sub}</p>
    </>
  )
  return onClick ? (
    <button type="button" onClick={onClick} className={clases}>
      {dentro}
    </button>
  ) : (
    <div className={clases}>{dentro}</div>
  )
}
