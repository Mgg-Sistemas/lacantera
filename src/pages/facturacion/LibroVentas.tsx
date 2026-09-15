import { useState } from 'react'
import { BookOpen, Download } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { bolivares, dinero, fecha as fmtFecha } from '@/lib/formato'
import {
  descargarCsv,
  mesCompleto,
  mesPasado,
  useLibroVentas,
  type LineaLibroVentas,
} from '@/lib/api/libros'

/**
 * El libro de ventas del IVA.
 *
 * Es lo que se transcribe a la planilla del SENIAT cada mes. Por eso las
 * columnas se llaman como se llaman ahí —ventas exentas, base imponible, débito
 * fiscal— y no como en el resto del sistema.
 *
 * Se declara en bolívares. Las cifras en la moneda del documento se enseñan
 * también, porque quien coteja contra la factura impresa la ve en dólares si así
 * se emitió, pero lo que suma abajo son bolívares.
 */

const nombreMes = (mes: string) =>
  new Intl.DateTimeFormat('es-VE', { month: 'long', year: 'numeric' }).format(
    new Date(`${mes}-15T12:00:00`),
  )

const suma = (filas: LineaLibroVentas[], campo: keyof LineaLibroVentas) =>
  filas.reduce((t, f) => t + Number(f[campo] ?? 0), 0)

export function LibroVentas() {
  const [mes, setMes] = useState(mesPasado())
  const { desde, hasta } = mesCompleto(mes)
  const { data, isPending, error } = useLibroVentas(desde, hasta)

  const filas = data ?? []
  const anuladas = filas.filter((f) => f.anulada).length
  const notas = filas.filter((f) => f.documento === 'NOTA_CREDITO' && !f.anulada).length

  const totales = {
    exentas: suma(filas, 'ventas_exentas_bs'),
    base: suma(filas, 'base_imponible_bs'),
    debito: suma(filas, 'debito_fiscal_bs'),
    total: suma(filas, 'total_ventas_bs'),
    retenido: suma(filas, 'iva_retenido_bs'),
  }

  const exportar = () =>
    descargarCsv(
      `libro-ventas-${mes}.csv`,
      [
        'Fecha',
        'RIF',
        'Cliente',
        'Documento',
        'Número',
        'Nº de control',
        'Afecta a',
        'Ventas exentas Bs',
        'Base imponible Bs',
        'Alícuota %',
        'Débito fiscal Bs',
        'Total ventas Bs',
        'IVA retenido Bs',
        'Estado',
      ],
      filas.map((f) => [
        fmtFecha(f.fecha),
        f.rif_cliente,
        f.cliente,
        f.documento === 'FACTURA' ? 'Factura' : 'Nota de crédito',
        f.numero,
        f.numero_control,
        f.afecta_a ?? '',
        f.ventas_exentas_bs,
        f.base_imponible_bs,
        f.alicuota_iva,
        f.debito_fiscal_bs,
        f.total_ventas_bs,
        f.iva_retenido_bs,
        f.anulada ? 'ANULADA' : '',
      ]),
    )

  return (
    <>
      <PageHeader
        title="Libro de ventas"
        description="Lo que se declara del IVA cobrado. Las facturas suman y las notas de crédito restan."
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
            titulo={`No se facturó nada en ${nombreMes(mes)}`}
            descripcion="Un mes sin ventas se declara igual, en cero. Lo que no se puede es no declararlo."
          />
        </Card>
      ) : null}

      {filas.length > 0 ? (
        <>
          <Card className="mb-4">
            <CardHeader
              title={`Resumen de ${nombreMes(mes)}`}
              subtitle="Estas son las cifras que van a la planilla. Todas en bolívares, a la tasa que congeló cada documento."
            />
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Cifra rotulo="Ventas exentas" valor={totales.exentas} />
              <Cifra rotulo="Base imponible" valor={totales.base} />
              <Cifra rotulo="Débito fiscal" valor={totales.debito} destacada />
              <Cifra rotulo="Total ventas" valor={totales.total} />
            </div>

            {totales.retenido > 0 ? (
              <p className="text-ink/55 border-hairline mt-4 border-t pt-3 text-sm">
                Los clientes retuvieron{' '}
                <span className="tabular text-ink/80 font-medium">
                  {bolivares(totales.retenido)}
                </span>{' '}
                del IVA y lo enteran ellos. Ese monto ya no se cobra, pero se declara igual.
              </p>
            ) : null}
          </Card>

          <Card flush>
            <CardHeader
              title={`${filas.length} documento${filas.length === 1 ? '' : 's'}`}
              subtitle={
                anuladas > 0
                  ? `Incluye ${anuladas} anulado${anuladas === 1 ? '' : 's'} en cero: la numeración de control tiene que correr sin huecos.`
                  : 'Ordenados por número de control, que es como se lee la serie.'
              }
              className="px-5 pt-5"
            />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="text-ink/45 border-hairline border-y text-left text-xs">
                    <th className="px-5 py-3 font-medium">Fecha</th>
                    <th className="px-3 py-3 font-medium">Documento</th>
                    <th className="px-3 py-3 font-medium">Cliente</th>
                    <th className="px-3 py-3 text-right font-medium">Exentas</th>
                    <th className="px-3 py-3 text-right font-medium">Base imponible</th>
                    <th className="px-3 py-3 text-right font-medium">Débito fiscal</th>
                    <th className="px-5 py-3 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr
                      key={f.clave}
                      className={`border-hairline border-b last:border-0 ${
                        f.anulada ? 'text-ink/35' : ''
                      }`}
                    >
                      <td className="text-ink/60 px-5 py-3 text-xs whitespace-nowrap">
                        {fmtFecha(f.fecha)}
                      </td>
                      <td className="px-3 py-3">
                        <p className="tabular text-ink/85 font-medium">{f.numero}</p>
                        <p className="text-ink/45 text-xs">
                          control {f.numero_control}
                          {f.afecta_a ? ` · corrige ${f.afecta_a}` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-ink/70">{f.cliente}</p>
                        <p className="text-ink/45 text-xs">{f.rif_cliente}</p>
                      </td>
                      <td className="tabular text-ink/70 px-3 py-3 text-right">
                        {Number(f.ventas_exentas_bs) === 0 ? (
                          <span className="text-ink/25">—</span>
                        ) : (
                          bolivares(f.ventas_exentas_bs)
                        )}
                      </td>
                      <td className="tabular text-ink/70 px-3 py-3 text-right">
                        {bolivares(f.base_imponible_bs)}
                      </td>
                      <td className="tabular text-ink/85 px-3 py-3 text-right font-medium">
                        {bolivares(f.debito_fiscal_bs)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {f.anulada ? (
                          <Chip tone="neutral">Anulada</Chip>
                        ) : (
                          <>
                            <p className="tabular text-ink/85 font-medium">
                              {bolivares(f.total_ventas_bs)}
                            </p>
                            {f.moneda !== 'VES' ? (
                              <p className="text-ink/45 tabular text-xs">
                                {dinero(f.moneda, f.total_ventas)}
                              </p>
                            ) : null}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-hairline bg-ink/3 border-t">
                    <td colSpan={3} className="text-ink/60 px-5 py-3 text-xs">
                      {notas > 0
                        ? `${notas} nota${notas === 1 ? '' : 's'} de crédito restando`
                        : 'Sin notas de crédito en el período'}
                    </td>
                    <td className="tabular text-ink/85 px-3 py-3 text-right font-semibold">
                      {bolivares(totales.exentas)}
                    </td>
                    <td className="tabular text-ink/85 px-3 py-3 text-right font-semibold">
                      {bolivares(totales.base)}
                    </td>
                    <td className="tabular text-ink/85 px-3 py-3 text-right font-semibold">
                      {bolivares(totales.debito)}
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
