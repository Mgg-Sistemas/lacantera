import { Link } from 'react-router'
import { ArrowRight, FileText, Receipt, Truck, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { useCotizacionesVenta, useFacturas, useNotasEntrega } from '@/lib/api/ventas'
import { dolares } from '@/lib/formato'
import { cn } from '@/lib/cn'

/**
 * Por dónde se empieza una venta.
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * Ventas tenía siete entradas en el menú —clientes, precios, cotizaciones,
 * notas de entrega, facturación, notas de crédito, libro— y ninguna decía
 * *vender*. Quien entraba se quedaba con la duda de dónde se registra, porque
 * el menú nombra documentos y no trabajos: hay que saber de antemano que una
 * venta empieza en «Notas de entrega», que es el nombre del papel.
 *
 * Compras no tiene ese problema y no es casualidad: su primera entrada es un
 * tablero que enseña dónde está detenida cada compra. Ventas se hizo al revés,
 * documento por documento. Esto lo empareja.
 *
 * POR QUÉ CUATRO PASOS NUMERADOS
 *
 * Porque son cuatro y ocurren en ese orden: no se factura sin despachar, y no
 * se cobra sin facturar. El número no decora — dice qué va antes. Es el mismo
 * recurso que la portada usa para contar el recorrido de la piedra, y eso es
 * deliberado: fuera se cuenta que la piedra se vuela, se extrae, se tritura y
 * se despacha; dentro, que la venta se cotiza, se despacha, se factura y se
 * cobra. La misma casa hablando igual por los dos lados.
 *
 * LO QUE CADA PASO ENSEÑA
 *
 * Cuántos hay esperando ahí y el botón que los atiende. Un tablero que solo
 * cuenta obliga a ir a buscar la pantalla; con el botón al lado, el paso
 * siguiente está a un clic desde el primer vistazo.
 *
 * Cotizar va marcado como opcional porque lo es: en la cantera lo habitual es
 * que el cliente llegue con el camión y se despache directo. Decirlo evita que
 * alguien crea que tiene que cotizar antes de poder vender.
 */

interface Paso {
  romano: string
  titulo: string
  /** Qué está esperando en este paso, en palabras de quien trabaja. */
  espera: string
  icono: LucideIcon
  ruta: string
  accion: string
  opcional?: boolean
}

const PASOS: Paso[] = [
  {
    romano: 'I',
    titulo: 'Se cotiza',
    espera: 'cotizaciones esperando respuesta',
    icono: FileText,
    ruta: '/app/ventas/cotizaciones',
    accion: 'Cotizar',
    opcional: true,
  },
  {
    romano: 'II',
    titulo: 'Se despacha',
    espera: 'notas despachadas',
    icono: Truck,
    ruta: '/app/ventas/despachos',
    accion: 'Despachar',
  },
  {
    romano: 'III',
    titulo: 'Se factura',
    espera: 'notas por facturar',
    icono: Receipt,
    ruta: '/app/ventas/facturacion',
    accion: 'Facturar',
  },
  {
    romano: 'IV',
    titulo: 'Se cobra',
    espera: 'facturas por cobrar',
    icono: Wallet,
    ruta: '/app/ventas/facturacion',
    accion: 'Registrar cobro',
  },
]

export function TableroVentas() {
  const cotizaciones = useCotizacionesVenta('ENVIADA')
  const notas = useNotasEntrega('DESPACHADA')
  const facturas = useFacturas('EMITIDA')

  const cargando = cotizaciones.isPending || notas.isPending || facturas.isPending
  const error = cotizaciones.error ?? notas.error ?? facturas.error

  /*
    Las notas despachadas cuentan dos veces, y es correcto.

    Una nota que salió y no se ha facturado está a la vez «despachada» y «por
    facturar»: son el mismo hecho visto desde el paso anterior y desde el
    siguiente. Enseñarlo en los dos sitios es lo que hace que se entienda que
    facturar es lo que sigue.
  */
  const cuentas = [
    cotizaciones.data?.length ?? 0,
    notas.data?.length ?? 0,
    notas.data?.length ?? 0,
    facturas.data?.length ?? 0,
  ]

  // Lo que está por cobrar, que es la única cifra que la gerencia mira al
  // entrar. Sale del saldo de cada factura, no del total: lo cobrado a medias
  // ya no se debe.
  const porCobrar = (facturas.data ?? []).reduce((s, f) => s + Number(f.saldo_usd), 0)

  return (
    <>
      <PageHeader
        eyebrow="Ventas"
        title="Cómo va cada venta"
        description="Del pedido del cliente hasta el cobro. Cada paso enseña qué está esperando ahí."
        actions={
          <Link to="/app/ventas/despachos">
            <Button icon={<Truck />}>Despachar material</Button>
          </Link>
        }
      />

      {cargando ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {!cargando && !error ? (
        <>
          <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {PASOS.map((p, i) => {
              const n = cuentas[i]
              const Icono = p.icono

              return (
                <li key={p.romano}>
                  <Card className="flex h-full flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-ink/40 text-2xs font-mono tracking-[0.18em] uppercase">
                          Paso {p.romano}
                          {p.opcional ? ' · opcional' : ''}
                        </p>
                        <h2 className="text-ink/90 mt-1.5 text-lg font-medium">{p.titulo}</h2>
                      </div>
                      <Icono
                        className={cn('mt-0.5 size-[18px] shrink-0', n > 0 ? 'text-warning' : 'text-ink/25')}
                        aria-hidden="true"
                      />
                    </div>

                    {/* La cifra es lo que hay esperando, no un acumulado: un
                        tablero que suma lo del año no dice qué hacer hoy. */}
                    <p
                      className={cn(
                        'tabular mt-4 text-3xl font-light',
                        n > 0 ? 'text-ink/90' : 'text-ink/25',
                      )}
                    >
                      {n}
                    </p>
                    <p className="text-ink/50 mt-1 text-xs">
                      {n === 1 ? p.espera.replace(/s$/, '') : p.espera}
                    </p>

                    <div className="mt-4 grow" />

                    <Link to={p.ruta} className="block">
                      <Button variant={n > 0 ? 'primary' : 'soft'} size="sm" block>
                        {p.accion}
                      </Button>
                    </Link>
                  </Card>
                </li>
              )
            })}
          </ol>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <p className="text-ink/40 text-2xs font-mono tracking-[0.18em] uppercase">
                Si es la primera vez
              </p>
              <p className="text-ink/75 mt-3 text-sm leading-relaxed">
                Una venta se registra <strong>despachando</strong>. La nota de entrega es el papel
                con el que sale el camión y lo que descuenta el material del patio; la factura se
                emite después, contra una nota o contra todas las de la semana de un cliente.
              </p>
              <p className="text-ink/50 mt-2 text-sm leading-relaxed">
                Cotizar es opcional: sirve cuando el cliente pide precio antes de decidir. Si el
                camión ya está en la romana, se va directo a despachar.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/app/ventas/clientes">
                  <Button variant="outline" size="sm">
                    Clientes
                  </Button>
                </Link>
                <Link to="/app/ventas/precios">
                  <Button variant="outline" size="sm">
                    Lista de precios
                  </Button>
                </Link>
                <Link to="/app/ventas/libro">
                  <Button variant="outline" size="sm">
                    Libro de ventas
                  </Button>
                </Link>
              </div>
            </Card>

            <Card>
              <p className="text-ink/40 text-2xs font-mono tracking-[0.18em] uppercase">
                Por cobrar
              </p>
              <p className="text-ink/90 tabular mt-3 text-3xl font-light">{dolares(porCobrar)}</p>
              <p className="text-ink/50 mt-1 text-xs">
                Saldo de las facturas emitidas. Lo cobrado a medias ya no cuenta.
              </p>

              <Link to="/app/ventas/facturacion" className="mt-4 block">
                <Button variant="soft" size="sm" block icon={<ArrowRight />}>
                  Ver facturación
                </Button>
              </Link>
            </Card>
          </div>
        </>
      ) : null}
    </>
  )
}
