import { Link } from 'react-router'
import { FileCheck, Scale } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { GrupoAcciones, PrimeraVez, type Accion } from '@/components/tablero/GrupoAcciones'
import { useGuias, useTickets } from '@/lib/api/despachos'
import { useMisPermisos } from '@/lib/api/usuarios'
import { enteros } from '@/lib/formato'

/**
 * Por dónde se empieza en despachos.
 *
 * DOS PASOS Y UN MALENTENDIDO QUE CONVIENE DESHACER
 *
 * Este módulo es el papeleo de la romana: se pesa el camión y se emite la guía
 * con la que sale a la calle. Son dos cosas y van en ese orden.
 *
 * Lo que confunde es que «despachar» también existe en ventas, y no es lo
 * mismo: allí la nota de entrega descuenta el patio y deja la venta lista para
 * facturar; aquí se pesa y se emite el permiso de movilización. Una es el
 * negocio, la otra es el trámite. Quien no lo sabe entra a este módulo
 * buscando registrar una venta y no encuentra dónde.
 *
 * Por eso el bloque de abajo lo dice con todas las letras y enlaza al otro
 * lado. Es más barato explicarlo aquí que dejar que cada quien lo descubra.
 */
export function TableroDespachos() {
  const { data: tickets, isPending, error } = useTickets()
  const { data: guias } = useGuias()
  const { puede } = useMisPermisos()

  const puedeEscribir = puede('DESPACHOS', 'ESCRITURA')

  const libres = (tickets ?? []).filter((t) => t.estado === 'LIBRE').length
  const vigentes = (guias ?? []).filter((g) => g.estado === 'VIGENTE').length

  const pasos: Accion[] = [
    {
      titulo: 'I · Se pesa en la romana',
      detalle: 'El ticket con el peso del camión, lleno y vacío. Es el soporte de lo que salió.',
      icono: Scale,
      ruta: '/app/despachos/tickets',
      cuenta: libres,
      exigeEscritura: true,
    },
    {
      titulo: 'II · Se emite la guía',
      detalle: 'La guía de movilización, que es con lo que el camión puede circular.',
      icono: FileCheck,
      ruta: '/app/despachos/guias',
      cuenta: vigentes,
      exigeEscritura: true,
    },
  ]

  return (
    <>
      <PageHeader
        title="Despachos"
        description="El papeleo de la romana: se pesa el camión y se emite la guía con la que sale."
        actions={
          <Link to="/app/despachos/tickets">
            <Button icon={<Scale />}>Pesar en romana</Button>
          </Link>
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {!isPending && !error ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">
                Tickets sin usar
              </p>
              <p className="text-ink/90 tabular mt-3 text-3xl font-light">{enteros(libres)}</p>
              <p className="text-ink/45 mt-2 text-xs">Pesajes registrados que no llevan guía</p>
            </Card>

            <Card>
              <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">
                Guías vigentes
              </p>
              <p className="text-ink/90 tabular mt-3 text-3xl font-light">{enteros(vigentes)}</p>
              <p className="text-ink/45 mt-2 text-xs">Emitidas y todavía sin usar</p>
            </Card>
          </div>

          <div className="mt-8 space-y-8">
            <GrupoAcciones titulo="El trámite" acciones={pasos} puedeEscribir={puedeEscribir} />

            <PrimeraVez>
              <p>
                Aquí no se registra la venta: se registra <strong>el peso y el permiso</strong>. Si
                lo que buscas es despachar material a un cliente y dejarlo listo para facturar, eso
                está en Ventas.
              </p>
              <p>
                <Link
                  to="/app/ventas"
                  className="text-royal-600 hover:text-royal-700 dark:text-royal-300 font-medium"
                >
                  Ir al tablero de ventas
                </Link>
              </p>
              <p className="text-ink/50">
                Un ticket es el pesaje del camión. La guía es lo que lo deja circular con el
                material. Van en ese orden y la segunda se apoya en la primera.
              </p>
            </PrimeraVez>
          </div>
        </>
      ) : null}
    </>
  )
}
