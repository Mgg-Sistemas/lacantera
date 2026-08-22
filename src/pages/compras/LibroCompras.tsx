import { useState } from 'react'
import { BookOpen, Download } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_ANALISIS } from '@/components/pestanasDeModulos'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { bolivares, dinero, fecha as fmtFecha } from '@/lib/formato'
import { descargarCsv, mesCompleto, mesPasado } from '@/lib/api/libros'
import { useLibroCompras, type LineaLibroCompras } from '@/lib/api/facturasCompra'

/**
 * El libro de compras del IVA.
 *
 * La otra mitad de la declaración: el crédito fiscal es el IVA que se pagó y
 * que se descuenta del que se cobró. Sin este libro, ese dinero se queda en el
 * camino.
 *
 * Aquí las anuladas no aparecen, al revés que en el de ventas. El número de
 * control de una factura de compra es del proveedor, no nuestro, así que un
 * hueco en su serie no es algo que tengamos que explicar; una factura anulada
 * de este lado es una fila que se cargó mal y no se declara.
 */

const nombreMes = (mes: string) =>
  new Intl.DateTimeFormat('es-VE', { month: 'long', year: 'numeric' }).format(
    new Date(`${mes}-15T12:00:00`),
  )

const suma = (filas: LineaLibroCompras[], campo: keyof LineaLibroCompras) =>
  filas.reduce((t, f) => t + Number(f[campo] ?? 0), 0)

export function LibroCompras() {
  const [mes, setMes] = useState(mesPasado())
  const { desde, hasta } = mesCompleto(mes)
  const { data, isPending, error } = useLibroCompras(desde, hasta)

  const filas = data ?? []

  const totales = {
    exentas: suma(filas, 'compras_exentas_bs'),
    base: suma(filas, 'base_imponible_bs'),
    credito: suma(filas, 'credito_fiscal_bs'),
    total: suma(filas, 'total_compras_bs'),
    retenido: suma(filas, 'iva_retenido_bs'),
  }

  const exportar = () =>
    descargarCsv(
      `libro-compras-${mes}.csv`,
      [
        'Fecha',
        'RIF',
        'Proveedor',
        'Nº de factura',
        'Nº de control',
        'Compras exentas Bs',
        'Base imponible Bs',
        'Alícuota %',
        'Crédito fiscal Bs',
        'Total compras Bs',
        'IVA retenido Bs',
      ],
      filas.map((f) => [
        fmtFecha(f.fecha),
        f.rif_proveedor,
        f.proveedor,
        f.numero_factura,
        f.numero_control ?? '',
        f.compras_exentas_bs,
        f.base_imponible_bs,
        f.alicuota_iva,
        f.credito_fiscal_bs,
        f.total_compras_bs,
        f.iva_retenido_bs,
      ]),
    )

  return (
    <>
      <PageHeader
        title="Libro de compras"
        description="El IVA que se pagó a los proveedores y que se descuenta del que se cobró."
        actions={
          /* `items-end` alinea el botón con la caja del mes, no con su
             etiqueta. Antes llevaba un `mb-6` a mano que lo levantaba 24 px de
             más y lo dejaba flotando por encima. */
          <div className="flex items-end gap-3">
            <Input
              label="Mes"
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="w-[170px]"
            />

      <Pestanas pestanas={PESTANAS_ANALISIS} />
            <Button
              variant="outline"
              icon={<Download />}
              disabled={filas.length === 0}
              onClick={exportar}
            >
              Descargar
            </Button>
          </div>
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && filas.length === 0 ? (
        <Card>
          <Vacio
            icono={<BookOpen />}
            titulo={`No hay compras registradas en ${nombreMes(mes)}`}
            descripcion="Si hubo compras y no aparecen, es que falta cargar la factura del proveedor. Sin ella su IVA no se puede descontar."
          />
        </Card>
      ) : null}

      {filas.length > 0 ? (
        <>
          <Card className="mb-4">
            <CardHeader
              title={`Resumen de ${nombreMes(mes)}`}
              subtitle="Todas en bolívares, a la tasa que congeló cada factura."
            />
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Cifra rotulo="Compras exentas" valor={totales.exentas} />
              <Cifra rotulo="Base imponible" valor={totales.base} />
              <Cifra rotulo="Crédito fiscal" valor={totales.credito} destacada />
              <Cifra rotulo="Total compras" valor={totales.total} />
            </div>

            {totales.retenido > 0 ? (
              <p className="text-ink/55 border-hairline mt-4 border-t pt-3 text-sm">
                Se retuvo{' '}
                <span className="tabular text-ink/80 font-medium">
                  {bolivares(totales.retenido)}
                </span>{' '}
                del IVA de estas facturas, que la empresa entera por su cuenta.
              </p>
            ) : null}
          </Card>

          <Card flush>
            <CardHeader
              title={`${filas.length} factura${filas.length === 1 ? '' : 's'}`}
              subtitle="Ordenadas por fecha de emisión, que es como las pide la planilla."
              className="px-5 pt-5"
            />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="text-ink/45 border-hairline border-y text-left text-xs">
                    <th className="px-5 py-3 font-medium">Fecha</th>
                    <th className="px-3 py-3 font-medium">Factura</th>
                    <th className="px-3 py-3 font-medium">Proveedor</th>
                    <th className="px-3 py-3 text-right font-medium">Exentas</th>
                    <th className="px-3 py-3 text-right font-medium">Base imponible</th>
                    <th className="px-3 py-3 text-right font-medium">Crédito fiscal</th>
                    <th className="px-5 py-3 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.id} className="border-hairline border-b last:border-0">
                      <td className="text-ink/60 px-5 py-3 text-xs whitespace-nowrap">
                        {fmtFecha(f.fecha)}
                      </td>
                      <td className="px-3 py-3">
                        <p className="tabular text-ink/85 font-medium">{f.numero_factura}</p>
                        {f.numero_control ? (
                          <p className="text-ink/45 text-xs">control {f.numero_control}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-ink/70">{f.proveedor}</p>
                        <p className="text-ink/45 text-xs">{f.rif_proveedor}</p>
                      </td>
                      <td className="tabular text-ink/70 px-3 py-3 text-right">
                        {Number(f.compras_exentas_bs) === 0 ? (
                          <span className="text-ink/25">—</span>
                        ) : (
                          bolivares(f.compras_exentas_bs)
                        )}
                      </td>
                      <td className="tabular text-ink/70 px-3 py-3 text-right">
                        {bolivares(f.base_imponible_bs)}
                      </td>
                      <td className="tabular text-ink/85 px-3 py-3 text-right font-medium">
                        {bolivares(f.credito_fiscal_bs)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <p className="tabular text-ink/85 font-medium">
                          {bolivares(f.total_compras_bs)}
                        </p>
                        {f.moneda !== 'VES' ? (
                          <p className="text-ink/45 tabular text-xs">
                            {dinero(f.moneda, f.total_compras)}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-hairline bg-ink/3 border-t">
                    <td colSpan={3} className="text-ink/60 px-5 py-3 text-xs">
                      Total del período
                    </td>
                    <td className="tabular text-ink/85 px-3 py-3 text-right font-semibold">
                      {bolivares(totales.exentas)}
                    </td>
                    <td className="tabular text-ink/85 px-3 py-3 text-right font-semibold">
                      {bolivares(totales.base)}
                    </td>
                    <td className="tabular text-ink/85 px-3 py-3 text-right font-semibold">
                      {bolivares(totales.credito)}
                    </td>
                    <td className="tabular text-ink/85 px-5 py-3 text-right font-semibold">
                      {bolivares(totales.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </>
  )
}

function Cifra({
  rotulo,
  valor,
  destacada,
}: {
  rotulo: string
  valor: number
  destacada?: boolean
}) {
  return (
    <div>
      <p className="text-ink/50 text-xs">{rotulo}</p>
      <p
        className={`tabular mt-1 text-2xl font-semibold ${
          destacada ? 'text-royal-600 dark:text-royal-300' : 'text-ink/90'
        }`}
      >
        {bolivares(valor)}
      </p>
    </div>
  )
}
