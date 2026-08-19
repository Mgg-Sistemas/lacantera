import { Link } from 'react-router'
import { ArrowLeftRight, BookOpen, HandCoins, Landmark, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { GrupoAcciones, PrimeraVez, type Accion } from '@/components/tablero/GrupoAcciones'
import { useCuentas, usePorPagar, useResumenPanel } from '@/lib/api/tesoreria'
import { useMisPermisos } from '@/lib/api/usuarios'
import { bolivares, dolares, enteros } from '@/lib/formato'
import { cn } from '@/lib/cn'

/**
 * Por dónde se empieza en tesorería.
 *
 * LA FORMA DE ESTE MÓDULO NO ES UNA CADENA
 *
 * Compras va en fila —se pide, se aprueba, se paga— y por eso su tablero va
 * numerado. Tesorería no: es un estado —cuánto hay y dónde— y dos colas que no
 * dependen una de otra: lo que hay que pagar y lo que hay que cobrar. Ninguna
 * va antes que la otra.
 *
 * Así que el tablero enseña primero cuánto hay, y después las dos colas por
 * separado. Numerarlas insinuaría un orden que no existe.
 *
 * LA CUENTA SIN ABRIR ES UN AVISO, NO UN DATO
 *
 * Una cuenta de banco creada y sin saldo de apertura no suma al disponible, así
 * que el total miente por lo bajo sin decir por qué. Es de los errores que se
 * descubren al cierre, cuando ya no hay a quién preguntarle cuánto había.
 */
export function TableroTesoreria() {
  const { data: r, isPending, error } = useResumenPanel()
  const { data: cuentas } = useCuentas()
  const { data: porPagar } = usePorPagar()
  const { puede } = useMisPermisos()

  const puedeEscribir = puede('TESORERIA', 'ESCRITURA')

  const sinAbrir = r?.cuentas_sin_abrir ?? 0
  const activas = (cuentas ?? []).filter((c) => c.activa).length

  const colaPagos: Accion[] = [
    {
      titulo: 'Pagos autorizados',
      detalle: 'Órdenes que compras ya aprobó y esperan que salga la plata.',
      icono: HandCoins,
      ruta: '/app/tesoreria/pagos',
      cuenta: r?.por_pagar_n ?? 0,
      exigeEscritura: true,
    },
    {
      titulo: 'Cuentas por pagar',
      detalle: 'Facturas de proveedor con saldo, ordenadas por antigüedad.',
      icono: BookOpen,
      ruta: '/app/tesoreria/por-pagar',
      cuenta: (porPagar ?? []).length,
    },
  ]

  const colaCobros: Accion[] = [
    {
      titulo: 'Cuentas por cobrar',
      detalle: 'Facturas emitidas con saldo. Lo cobrado a medias ya no se debe.',
      icono: Wallet,
      ruta: '/app/tesoreria/por-cobrar',
    },
  ]

  const movimientos: Accion[] = [
    {
      titulo: 'Mover entre cuentas',
      detalle: 'Traslado de una cuenta a otra. No cambia el total, cambia dónde está.',
      icono: ArrowLeftRight,
      ruta: '/app/tesoreria/movimientos',
      exigeEscritura: true,
    },
    {
      titulo: 'Libro de tesorería',
      detalle: 'Todo lo que entró y salió, en orden. No se edita: se corrige con un asiento.',
      icono: BookOpen,
      ruta: '/app/tesoreria/movimientos',
    },
  ]

  return (
    <>
      <PageHeader
        title="Tesorería"
        description="Cuánto hay y dónde, qué hay que pagar y qué está por cobrar."
        actions={
          <Link to="/app/tesoreria/cuentas">
            <Button icon={<Landmark />}>Bancos y cajas</Button>
          </Link>
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {!isPending && !error && r ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">
                En cuentas, en divisas
              </p>
              <p className="text-ink/90 tabular mt-3 text-3xl font-light">
                {dolares(Number(r.disponible_usd))}
              </p>
              <p className="text-ink/45 mt-2 text-xs">
                {bolivares(Number(r.disponible_ves))} en bolívares
              </p>
            </Card>

            <Card>
              <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">
                Por pagar a proveedores
              </p>
              <p className="text-ink/90 tabular mt-3 text-3xl font-light">
                {dolares(Number(r.por_pagar_usd))}
              </p>
              <p className="text-ink/45 mt-2 text-xs">
                {r.por_pagar_n === 0
                  ? 'Nada autorizado esperando'
                  : `${enteros(r.por_pagar_n)} autorizado${r.por_pagar_n === 1 ? '' : 's'}`}
              </p>
            </Card>

            <Card>
              <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">
                Cuentas activas
              </p>
              <p className="text-ink/90 tabular mt-3 text-3xl font-light">{enteros(activas)}</p>
              <p className="text-ink/45 mt-2 text-xs">Bancos y cajas en uso</p>
            </Card>

            {/* La única que se enciende, y solo cuando hay algo que arreglar. */}
            <Card className={cn('relative overflow-hidden', sinAbrir > 0 && 'border-warning/40 border')}>
              {sinAbrir > 0 ? (
                <span className="bg-warning absolute inset-x-0 top-0 h-[3px]" aria-hidden="true" />
              ) : null}
              <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">
                Sin saldo de apertura
              </p>
              <p
                className={cn(
                  'tabular mt-3 text-3xl font-light',
                  sinAbrir > 0 ? 'text-warning' : 'text-ink/25',
                )}
              >
                {enteros(sinAbrir)}
              </p>
              <p className="text-ink/45 mt-2 text-xs">
                {sinAbrir === 0
                  ? 'Todas abiertas'
                  : 'No suman al disponible hasta abrirlas'}
              </p>
            </Card>
          </div>

          <div className="mt-8 space-y-8">
            <GrupoAcciones titulo="Sale plata" acciones={colaPagos} puedeEscribir={puedeEscribir} />
            <GrupoAcciones titulo="Entra plata" acciones={colaCobros} puedeEscribir={puedeEscribir} />
            <GrupoAcciones titulo="Se mueve" acciones={movimientos} puedeEscribir={puedeEscribir} />

            <PrimeraVez>
              <p>
                Tesorería no decide qué se paga: <strong>ejecuta lo que ya se autorizó</strong>. Las
                órdenes llegan aprobadas desde compras y aquí se indica de qué cuenta sale.
              </p>
              <p className="text-ink/50">
                Una cuenta recién creada no cuenta hasta que se le registra el saldo de apertura. Si
                el disponible parece bajo, es lo primero que hay que mirar.
              </p>
            </PrimeraVez>
          </div>
        </>
      ) : null}
    </>
  )
}
