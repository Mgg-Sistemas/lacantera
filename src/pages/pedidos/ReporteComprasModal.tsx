import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Visor } from '@/components/Visor'
import { useEmpresa, empresaDelPapel } from '@/lib/api/empresa'
import { useReporteCompras } from '@/lib/api/pedidos'
import {
  COLOR_TOTAL,
  COLOR_TOTAL_TEXTO,
  agruparReporte,
  fmtMonto,
  mensajeReporteCompras,
  totalesPorMoneda,
  totalesTexto,
  type FilaReporteCompras,
} from '@/lib/reportesCompras'
import { armarReporteComprasPdf } from '@/lib/ficha/reportesComprasPdf'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { bajarArchivo, escribirXlsx } from '@/lib/xlsx'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { ModalWhatsappCompra } from '@/pages/compras/ModalWhatsappCompra'
import { imprimirPdf } from './imprimirPdf'

/*
  «📊 REPORTE POR RENGLÓN» (MGG `ReporteComprasModal`)

  Las compras pendientes, TIPO POR RENGLÓN, con su código, su motivo y su
  monto, en los cuatro renglones de MGG con sus colores pastel: pendiente por
  aprobar, cuentas a crédito (con abonado y saldo), por indicar método de pago
  y por pagar. Se actualiza en vivo. Salidas con la misma data: PDF (vista
  previa), Excel, WhatsApp e impresión.

  Lo que cambia: el monto es el MONTO A PAGAR de La Cantera (total −
  descuento − retenciones); no hay compra directa de MGG; los servicios
  directos con factura cargada van a «Por indicar método» y los confirmados a
  «Por pagar»; el Excel va en una hoja (por renglón y, debajo, el resumen),
  porque el libro de La Cantera se escribe sin librería y lleva una sola.
*/

function libroExcel(filas: FilaReporteCompras[]): Blob {
  const grupos = agruparReporte(filas).filter((g) => g.filas.length > 0)
  const { usd, bs } = totalesPorMoneda(filas)
  const datos: (string | number | null)[][] = []
  for (const g of grupos) {
    g.filas.forEach((f, i) =>
      datos.push([
        String(i + 1),
        `${g.emoji} ${g.titulo}`,
        f.codigo,
        f.tipo,
        f.motivo,
        f.proveedor,
        f.moneda === 'Bs' ? 'Bs' : '$',
        f.monto,
        g.key === 'cuenta_abierta' ? f.abonado : null,
        g.key === 'cuenta_abierta' ? f.saldo : null,
      ]),
    )
  }
  datos.push([])
  datos.push([null, 'RESUMEN POR RENGLÓN', null, 'RENGLONES', null, null, null, 'TOTAL $', null, 'TOTAL Bs'])
  for (const g of grupos)
    datos.push([null, `${g.emoji} ${g.titulo}`, null, String(g.filas.length), null, null, null, g.totalUsd, null, g.totalBs])
  datos.push([null, '💵 TOTAL GENERAL', null, String(filas.length), null, null, null, usd, null, bs])
  return escribirXlsx({
    nombre: 'Por renglón',
    columnas: [
      { titulo: '#', ancho: 5 },
      { titulo: 'RENGLÓN', ancho: 30 },
      { titulo: 'CÓDIGO', ancho: 18 },
      { titulo: 'TIPO', ancho: 16 },
      { titulo: 'MOTIVO', ancho: 60 },
      { titulo: 'PROVEEDOR', ancho: 30 },
      { titulo: 'MONEDA', ancho: 8 },
      { titulo: 'MONTO', ancho: 14 },
      { titulo: 'ABONADO', ancho: 14 },
      { titulo: 'SALDO', ancho: 14 },
    ],
    filas: datos,
  })
}

export function ReporteComprasModal({ onClose }: { onClose: () => void }) {
  const q = useReporteCompras()
  const { data: empresa } = useEmpresa()
  const papel = empresaDelPapel(empresa)
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [errorPdf, setErrorPdf] = useState<string | null>(null)
  const [genPdf, setGenPdf] = useState(false)
  const [imprimiendo, setImprimiendo] = useState(false)
  const [avisar, setAvisar] = useState(false)

  const filas = useMemo(() => q.data ?? [], [q.data])
  const grupos = useMemo(() => agruparReporte(filas), [filas])
  const total = useMemo(() => totalesPorMoneda(filas), [filas])
  const cargando = q.isPending
  const vacio = !cargando && filas.length === 0

  async function verPdf() {
    setGenPdf(true)
    try {
      setErrorPdf(null)
      setPdf(await armarReporteComprasPdf(filas, papel))
    } catch (e) {
      setErrorPdf(mensajeDe(e, 'No se pudo generar el PDF'))
    } finally {
      setGenPdf(false)
    }
  }

  function verExcel() {
    try {
      bajarArchivo(libroExcel(filas), 'reporte-compras-por-renglon.xlsx')
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo generar el Excel'), 'error')
    }
  }

  async function imprimir() {
    setImprimiendo(true)
    try {
      imprimirPdf((await armarReporteComprasPdf(filas, papel)).blob)
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo imprimir el reporte'), 'error')
    } finally {
      setImprimiendo(false)
    }
  }

  return (
    <>
      <Modal
        abierto
        onCerrar={onClose}
        titulo="Reporte de compras por renglón"
        ancho="lg"
        acciones={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cerrar
            </Button>
            <Button variant="ghost" onClick={() => void verPdf()} disabled={genPdf || vacio || cargando}>
              {genPdf ? 'Generando…' : '📄 PDF (vista previa)'}
            </Button>
            <Button variant="ghost" onClick={verExcel} disabled={vacio || cargando}>
              📊 Excel
            </Button>
            <Button variant="ghost" onClick={() => setAvisar(true)} disabled={vacio || cargando}>
              💬 WhatsApp
            </Button>
            <Button onClick={() => void imprimir()} disabled={imprimiendo || vacio || cargando}>
              {imprimiendo ? 'Enviando…' : '🖨 Imprimir'}
            </Button>
          </>
        }
      >
        <p className="text-ink/60 mb-3 text-[13px]">
          Pendiente por aprobar · Cuentas a crédito · Por indicar método de pago · Por pagar · <strong>{filas.length}</strong>{' '}
          renglón(es) · se actualiza en vivo
        </p>

        {q.error ? (
          <p className="border-danger text-danger rounded-[8px] border px-3 py-2 text-sm">
            <strong>Error:</strong> {mensajeDe(q.error, 'No se pudo cargar el reporte')}
          </p>
        ) : null}
        {cargando ? <p className="text-ink/55 text-sm">Cargando…</p> : null}
        {vacio && !q.error ? <p className="text-ink/60 text-sm">✅ No hay compras pendientes en este momento.</p> : null}

        {!cargando
          ? grupos
              .filter((g) => g.filas.length > 0)
              .map((g) => {
                const credito = g.key === 'cuenta_abierta'
                const cols = credito ? 7 : 5
                return (
                  <div key={g.key} className="border-hairline mb-3.5 overflow-x-auto rounded-[8px] border">
                    <table className="w-full min-w-[620px] text-[13px]">
                      <thead>
                        <tr>
                          <th
                            colSpan={cols}
                            className="px-3 py-2 text-left font-bold tracking-wide"
                            style={{ background: g.color, color: g.colorTexto }}
                          >
                            {g.emoji} {g.titulo} · {g.filas.length}
                          </th>
                        </tr>
                        <tr className="text-ink/55 border-hairline border-b text-left text-xs">
                          <th className="w-9 px-3 py-2 text-center font-medium">#</th>
                          <th className="w-32 px-3 py-2 font-medium">CÓDIGO</th>
                          <th className="w-28 px-3 py-2 font-medium">TIPO</th>
                          <th className="px-3 py-2 font-medium">MOTIVO</th>
                          <th className="px-3 py-2 text-right font-medium">MONTO</th>
                          {credito ? <th className="px-3 py-2 text-right font-medium whitespace-nowrap">ABONADO</th> : null}
                          {credito ? <th className="px-3 py-2 text-right font-medium whitespace-nowrap">SALDO</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {g.filas.map((f, i) => (
                          <tr key={`${f.origen}-${f.id}`} className="border-hairline border-b last:border-b-0">
                            <td className="text-ink/50 px-3 py-2 text-center">{i + 1}</td>
                            <td className="px-3 py-2 font-mono">{f.codigo}</td>
                            <td className="text-ink/55 px-3 py-2 text-xs">{f.tipo}</td>
                            <td className="px-3 py-2">
                              {f.motivo}
                              {f.proveedor && f.proveedor !== '—' ? <div className="text-ink/45 text-xs">{f.proveedor}</div> : null}
                            </td>
                            <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{fmtMonto(f.monto, f.moneda)}</td>
                            {credito ? (
                              <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{fmtMonto(f.abonado, f.moneda)}</td>
                            ) : null}
                            {credito ? (
                              <td className="px-3 py-2 text-right font-mono font-semibold whitespace-nowrap">
                                {fmtMonto(f.saldo, f.moneda)}
                              </td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: g.color, color: g.colorTexto }}>
                          <td colSpan={cols - 1} className="px-3 py-2 text-right font-bold">
                            TOTAL {g.titulo}
                            {credito ? ' (saldo pendiente)' : ''}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold whitespace-nowrap">{totalesTexto(g)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )
              })
          : null}

        {!cargando && !vacio ? (
          <div
            className="flex flex-wrap items-center justify-between gap-2.5 rounded-[8px] px-4 py-3"
            style={{ background: COLOR_TOTAL, color: COLOR_TOTAL_TEXTO }}
          >
            <div>
              <strong className="text-[1.05rem]">TOTAL GENERAL</strong>
              <div className="text-xs opacity-85">
                Suma de los cuatro renglones (en crédito, el saldo pendiente) · en la moneda de cada compra
              </div>
            </div>
            <div className="text-right font-mono text-xl font-extrabold">
              {fmtMonto(total.usd, 'USD')} · {fmtMonto(total.bs, 'Bs')}
            </div>
          </div>
        ) : null}
      </Modal>

      {avisar ? (
        <ModalWhatsappCompra
          titulo="Avisar · Reporte de compras por renglón"
          texto={mensajeReporteCompras(filas, papel.razonSocial)}
          onCerrar={() => setAvisar(false)}
        />
      ) : null}

      <Visor
        abierto={pdf !== null || errorPdf !== null}
        error={errorPdf}
        onCerrar={() => {
          setPdf(null)
          setErrorPdf(null)
        }}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? 'reporte-compras-por-renglon.pdf'}
        titulo="Reporte de compras por renglón"
        descripcion={papel.razonSocial}
      />
    </>
  )
}
