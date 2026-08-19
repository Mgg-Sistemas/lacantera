import { Link } from 'react-router'
import { CalendarClock, Calculator, FileText, Receipt, Users } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { GrupoAcciones, PrimeraVez, type Accion } from '@/components/tablero/GrupoAcciones'
import { useEmpleados, usePeriodos } from '@/lib/api/nomina'
import { useMisPermisos } from '@/lib/api/usuarios'
import { enteros, fecha } from '@/lib/formato'

/**
 * Por dónde se empieza en nómina.
 *
 * NÓMINA NO ES UNA COLA NI UN ESTADO: ES UN CICLO
 *
 * Compras atiende lo que va llegando. El inventario refleja lo que hay ahora.
 * Nómina no hace ninguna de las dos: trabaja por períodos que se abren, se
 * calculan, se aprueban y se pagan, y después empieza otro igual.
 *
 * Por eso el tablero enseña arriba EL PERÍODO EN CURSO y en qué punto va. La
 * pregunta de quien entra no es «qué hay pendiente» sino «en qué punto va esta
 * quincena y qué falta para cerrarla».
 *
 * LO QUE SE CONFIGURA UNA VEZ, APARTE
 *
 * El personal, el tabulador y los parámetros no son trabajo del período: se
 * tocan cuando entra alguien, cuando cambia un sueldo o cuando cambia la ley.
 * Mezclarlos con los pasos de la quincena haría parecer que hay que revisarlos
 * cada vez.
 */

const PASOS_DEL_PERIODO: Record<string, { texto: string; tono: 'neutral' | 'info' | 'warning' | 'success' }> = {
  BORRADOR: { texto: 'Abierta · cargando novedades', tono: 'neutral' },
  CALCULADA: { texto: 'Calculada · falta aprobar', tono: 'info' },
  APROBADA: { texto: 'Aprobada · falta pagar', tono: 'warning' },
  PAGADA: { texto: 'Pagada', tono: 'success' },
  ANULADA: { texto: 'Anulada', tono: 'neutral' },
}

export function TableroNomina() {
  const { data: periodos, isPending, error } = usePeriodos()
  const { data: empleados } = useEmpleados(true)
  const { puede } = useMisPermisos()

  const puedeEscribir = puede('NOMINA', 'ESCRITURA')

  // El período en curso es el último que no está pagado ni anulado; si todos lo
  // están, el más reciente, que es el que se acaba de cerrar.
  const abiertos = (periodos ?? []).filter((p) => !['PAGADA', 'ANULADA'].includes(p.estado))
  const actual = abiertos[0] ?? (periodos ?? [])[0]
  const paso = actual ? PASOS_DEL_PERIODO[actual.estado] : undefined

  const delPeriodo: Accion[] = [
    {
      titulo: 'Novedades del período',
      detalle: 'Faltas, horas extra, préstamos y todo lo que cambia el pago de esta quincena.',
      icono: CalendarClock,
      ruta: '/app/nomina/asistencia',
      exigeEscritura: true,
    },
    {
      titulo: 'Procesar la nómina',
      detalle: 'Calcular, revisar y aprobar. De aquí sale lo que tesorería tiene que pagar.',
      icono: Calculator,
      ruta: '/app/nomina/procesos',
      exigeEscritura: true,
    },
    {
      titulo: 'Recibos de pago',
      detalle: 'El comprobante de cada trabajador, para entregar o archivar.',
      icono: Receipt,
      ruta: '/app/nomina/recibos',
    },
  ]

  const permanente: Accion[] = [
    {
      titulo: 'Personal',
      detalle: 'Quién trabaja aquí, su ficha, su cargo y cómo cobra.',
      icono: Users,
      ruta: '/app/nomina/personal',
    },
    {
      titulo: 'Tabulador de cargos',
      detalle: 'Cuánto gana cada cargo. De aquí sale el sueldo base al procesar.',
      icono: FileText,
      ruta: '/app/nomina/tabulador',
      exigeEscritura: true,
    },
    {
      titulo: 'Prestaciones sociales',
      detalle: 'Lo que se acumula por antigüedad, aparte del pago de cada quincena.',
      icono: FileText,
      ruta: '/app/nomina/prestaciones',
    },
    {
      titulo: 'Parámetros de nómina',
      detalle: 'Alícuotas, topes y porcentajes. Se tocan cuando cambia la ley, no cada mes.',
      icono: FileText,
      ruta: '/app/nomina/parametros',
      exigeEscritura: true,
    },
  ]

  return (
    <>
      <PageHeader
        title="Nómina"
        description="En qué punto va el período y qué falta para cerrarlo."
        actions={
          <Link to="/app/nomina/procesos">
            <Button icon={<Calculator />}>Procesar nómina</Button>
          </Link>
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {!isPending && !error ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {/* El período manda: ocupa dos columnas porque es la pregunta con
                la que la gente entra a este módulo. */}
            <Card className="sm:col-span-2">
              <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">
                Período en curso
              </p>

              {actual ? (
                <>
                  <div className="mt-3 flex flex-wrap items-baseline gap-3">
                    <p className="text-ink/90 text-2xl font-light">
                      {fecha(actual.desde)} — {fecha(actual.hasta)}
                    </p>
                    {paso ? <Chip tone={paso.tono}>{paso.texto}</Chip> : null}
                  </div>
                  <p className="text-ink/45 mt-2 text-xs">
                    {actual.estado === 'BORRADOR'
                      ? 'Todavía se pueden cargar novedades'
                      : actual.estado === 'CALCULADA'
                        ? 'Revisar los recibos antes de aprobar'
                        : actual.estado === 'APROBADA'
                          ? 'Tesorería tiene que ejecutar el pago'
                          : 'Cerrado'}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-ink/25 mt-3 text-2xl font-light">Sin períodos</p>
                  <p className="text-ink/45 mt-2 text-xs">
                    El primero se abre desde Procesar nómina.
                  </p>
                </>
              )}
            </Card>

            <Card>
              <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">
                Personal activo
              </p>
              <p className="text-ink/90 tabular mt-3 text-3xl font-light">
                {enteros((empleados ?? []).length)}
              </p>
              <p className="text-ink/45 mt-2 text-xs">Trabajadores que entran en la nómina</p>
            </Card>
          </div>

          <div className="mt-8 space-y-8">
            <GrupoAcciones
              titulo="Esta quincena"
              acciones={delPeriodo}
              puedeEscribir={puedeEscribir}
              columnas={3}
            />
            <GrupoAcciones
              titulo="Se configura una vez"
              acciones={permanente}
              puedeEscribir={puedeEscribir}
            />

            <PrimeraVez>
              <p>
                La nómina va por períodos. Se abre uno, se cargan las novedades del que trabajó, se
                calcula, se aprueba y <strong>tesorería lo paga</strong>. Después empieza otro igual.
              </p>
              <p className="text-ink/50">
                El sueldo base no se escribe por persona: sale del tabulador según el cargo. Si a
                alguien hay que pagarle distinto, se corrige el cargo o se carga una novedad — así
                queda dicho por qué.
              </p>
            </PrimeraVez>
          </div>
        </>
      ) : null}
    </>
  )
}
