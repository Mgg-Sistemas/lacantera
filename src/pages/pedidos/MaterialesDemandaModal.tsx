import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Visor } from '@/components/Visor'
import { cn } from '@/lib/cn'
import { useEmpresa, empresaDelPapel } from '@/lib/api/empresa'
import type { Orden } from '@/lib/api/pedidos'
import { fechaHoraVE, fmtCant, money } from '@/lib/pedidos'
import { fechaVE } from '@/lib/reportesCompras'
import { logoComoImagen } from '@/lib/ficha/logo'
import { membrete, pieDePagina, tabla, tituloDocumento } from '@/lib/ficha/papel'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { mensajeDe } from '@/lib/avisosFlotantes'

/*
  «📊 MATERIALES CON MÁS DEMANDA» (MGG `MaterialesDemandaModal` + `demandaPdf.ts`)

  Qué se pide más, por cantidad o por monto, en todo el histórico o en un
  día, mes o rango (por la fecha de la solicitud, en hora de Venezuela): las
  12 primeras en barras y la tabla completa. Se suman los renglones que se
  compran de las solicitudes de productos (no las canceladas).
*/

type Metrica = 'cantidad' | 'monto'
type Modo = 'todo' | 'dia' | 'mes' | 'rango'

interface FilaDemanda {
  sku: string
  nombre: string
  cantidad: number
  monto: number
  ordenes: number
}

const TOP_N = 12

const chipCls = (activo: boolean) =>
  cn(
    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
    activo ? 'border-royal-600/40 bg-royal-600/12 text-royal-700 dark:text-royal-300' : 'border-ink/15 text-ink/65 hover:bg-ink/5',
  )

export function MaterialesDemandaModal({ ordenes, onClose }: { ordenes: Orden[]; onClose: () => void }) {
  const [metrica, setMetrica] = useState<Metrica>('cantidad')
  const [modo, setModo] = useState<Modo>('todo')
  const [dia, setDia] = useState('')
  const [mes, setMes] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [errorPdf, setErrorPdf] = useState<string | null>(null)
  const { data: empresa } = useEmpresa()

  const delPeriodo = useMemo(
    () =>
      ordenes.filter((o) => {
        if (o.clase === 'servicio' || o.estado === 'cancelada' || o.parent_orden_id) return false
        const f = fechaVE(o.creado_en)
        if (!f) return false
        if (modo === 'dia') return !dia || f === dia
        if (modo === 'mes') return !mes || f.slice(0, 7) === mes
        if (modo === 'rango') return (!desde || f >= desde) && (!hasta || f <= hasta)
        return true
      }),
    [ordenes, modo, dia, mes, desde, hasta],
  )

  const filas = useMemo<FilaDemanda[]>(() => {
    const m = new Map<string, FilaDemanda & { ids: Set<number> }>()
    for (const o of delPeriodo) {
      for (const it of o.items ?? []) {
        if (it.comprar === false) continue
        const clave = (it.articulo_id ? `a${it.articulo_id}` : it.nombre || it.sku || '—').trim().toLowerCase()
        let r = m.get(clave)
        if (!r) {
          r = { sku: it.sku || '—', nombre: it.nombre || it.sku || '—', cantidad: 0, monto: 0, ordenes: 0, ids: new Set() }
          m.set(clave, r)
        }
        const cant = Number(it.cantidad_solicitada ?? it.cantidad) || 0
        r.cantidad += cant
        r.monto += (Number(it.cantidad) || 0) * (Number(it.precio) || 0)
        r.ids.add(o.id)
      }
    }
    return [...m.values()].map((r) => ({
      sku: r.sku,
      nombre: r.nombre,
      cantidad: Math.round(r.cantidad * 100) / 100,
      monto: Math.round(r.monto * 100) / 100,
      ordenes: r.ids.size,
    }))
  }, [delPeriodo])

  const valor = (r: FilaDemanda) => (metrica === 'cantidad' ? r.cantidad : r.monto)
  const ordenadas = [...filas].sort((a, b) => valor(b) - valor(a))
  const top = ordenadas.slice(0, TOP_N)
  const max = Math.max(1, ...top.map(valor))
  const fmt = (v: number) => (metrica === 'cantidad' ? fmtCant(v) : money(v))

  const periodo =
    modo === 'dia'
      ? dia
        ? `Día ${dia}`
        : 'Todos los días'
      : modo === 'mes'
        ? mes
          ? `Mes ${mes}`
          : 'Todos los meses'
        : modo === 'rango'
          ? `Rango ${desde || '…'} → ${hasta || '…'}`
          : 'Todo el histórico'

  async function exportar() {
    try {
      setErrorPdf(null)
      const { jsPDF } = await import('jspdf')
      const logo = await logoComoImagen()
      const papel = empresaDelPapel(empresa)
      const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
      let y = membrete(doc, logo, {
        empresa: papel,
        datos: [
          ['Período', periodo],
          ['Fecha', fechaHoraVE()],
        ],
      })
      y = tituloDocumento(doc, y, `Materiales con más demanda · por ${metrica === 'cantidad' ? 'cantidad' : 'monto'}`)
      tabla(
        doc,
        y,
        [
          { titulo: '#', ancho: 8 },
          { titulo: 'SKU', ancho: 26 },
          { titulo: 'Producto', ancho: 60 },
          { titulo: 'Cantidad', ancho: 20, alDerecha: true },
          { titulo: 'Órdenes', ancho: 14, alDerecha: true },
          { titulo: 'Monto total', ancho: 22, alDerecha: true },
        ],
        ordenadas.map((r, i) => [String(i + 1), r.sku, r.nombre, fmtCant(r.cantidad), String(r.ordenes), money(r.monto)]),
        `${delPeriodo.length} orden(es) · ${ordenadas.length} material(es)`,
      )
      pieDePagina(doc, `Generado ${fechaHoraVE()} · ${papel.razonSocial}`)
      setPdf({ blob: doc.output('blob'), nombre: 'materiales-con-mas-demanda.pdf' })
    } catch (e) {
      setErrorPdf(mensajeDe(e, 'No se pudo generar el PDF'))
    }
  }

  const fecha = 'rounded-control border-ink/20 bg-surface text-ink/85 h-9 border px-2.5 text-sm'

  return (
    <>
      <Modal
        abierto
        onCerrar={onClose}
        titulo="📊 Materiales con más demanda"
        ancho="xl"
        acciones={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cerrar
            </Button>
            <Button onClick={() => void exportar()} disabled={!ordenadas.length}>
              ↓ Exportar PDF
            </Button>
          </>
        }
      >
        <div className="border-hairline mb-4 flex flex-wrap items-center gap-2 rounded-[8px] border px-4 py-3">
          <span className="text-ink/55 text-[13px]">Medir por:</span>
          <button type="button" className={chipCls(metrica === 'cantidad')} onClick={() => setMetrica('cantidad')}>
            Cantidad
          </button>
          <button type="button" className={chipCls(metrica === 'monto')} onClick={() => setMetrica('monto')}>
            Monto ($)
          </button>
          <span className="text-ink/55 ml-3 text-[13px]">Período:</span>
          {(['todo', 'dia', 'mes', 'rango'] as Modo[]).map((m) => (
            <button key={m} type="button" className={chipCls(modo === m)} onClick={() => setModo(m)}>
              {m === 'todo' ? 'Todo' : m === 'dia' ? 'Día' : m === 'mes' ? 'Mes' : 'Rango'}
            </button>
          ))}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {modo === 'dia' ? (
              <input type="date" aria-label="Día" className={fecha} value={dia} onChange={(e) => setDia(e.target.value)} />
            ) : null}
            {modo === 'mes' ? (
              <input type="month" aria-label="Mes" className={fecha} value={mes} onChange={(e) => setMes(e.target.value)} />
            ) : null}
            {modo === 'rango' ? (
              <>
                <span className="text-ink/55 text-[13px]">Desde</span>
                <input type="date" aria-label="Desde" className={fecha} value={desde} onChange={(e) => setDesde(e.target.value)} />
                <span className="text-ink/55 text-[13px]">Hasta</span>
                <input type="date" aria-label="Hasta" className={fecha} value={hasta} onChange={(e) => setHasta(e.target.value)} />
              </>
            ) : null}
          </div>
        </div>

        <p className="text-ink/55 mb-2.5 text-[13px]">
          {periodo} · {delPeriodo.length} orden(es) · {ordenadas.length} material(es)
        </p>

        {!ordenadas.length ? (
          <p className="text-ink/55 py-8 text-center text-sm">◇ No hay demanda registrada para el período seleccionado.</p>
        ) : (
          <>
            <div className="border-hairline mb-4 rounded-[8px] border p-4">
              <div className="mb-3 text-sm font-semibold">
                Top {top.length} por {metrica === 'cantidad' ? 'cantidad' : 'monto'}
              </div>
              <div className="flex flex-col gap-2">
                {top.map((r, i) => {
                  const pct = Math.max(2, (valor(r) / max) * 100)
                  return (
                    <div key={`${r.sku}-${i}`} className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-2.5">
                      <div className="truncate text-[13px]" title={`${r.sku} · ${r.nombre}`}>
                        <strong className="font-mono">{r.sku !== '—' && !r.sku.startsWith('GEN-') ? r.sku : ''}</strong> {r.nombre}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="bg-ink/8 h-[18px] flex-1 overflow-hidden rounded">
                          <div className={cn('h-full rounded', i === 0 ? 'bg-tierra-600' : 'bg-royal-600')} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="min-w-20 text-right font-mono text-xs">{fmt(valor(r))}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="border-hairline overflow-x-auto rounded-[8px] border">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead className="text-ink/55 border-hairline border-b text-left text-xs">
                  <tr>
                    <th className="w-9 px-3 py-2 text-right font-medium">#</th>
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 font-medium">Producto</th>
                    <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                    <th className="px-3 py-2 text-right font-medium">Órdenes</th>
                    <th className="px-3 py-2 text-right font-medium">Monto total</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenadas.map((r, i) => (
                    <tr key={`${r.sku}-fila-${i}`} className="border-hairline border-b last:border-b-0">
                      <td className="px-3 py-2 text-right font-mono">{i + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
                      <td className="px-3 py-2">{r.nombre}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtCant(r.cantidad)}</td>
                      <td className="px-3 py-2 text-right font-mono">{r.ordenes}</td>
                      <td className="px-3 py-2 text-right font-mono">{money(r.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>

      <Visor
        abierto={pdf !== null || errorPdf !== null}
        error={errorPdf}
        onCerrar={() => {
          setPdf(null)
          setErrorPdf(null)
        }}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? 'materiales-con-mas-demanda.pdf'}
        titulo="Materiales con más demanda"
        descripcion={periodo}
      />
    </>
  )
}
