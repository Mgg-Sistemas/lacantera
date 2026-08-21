import { Link } from 'react-router'
import {
  Calculator,
  ClipboardList,
  FileText,
  Landmark,
  Settings,
  Upload,
  Users,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { QueHacer } from '@/components/QueHacer'
import type { GrupoDeAcciones } from '@/components/QueHacer'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { PrimeraVez } from '@/components/tablero/GrupoAcciones'
import { useEmpleados, usePeriodos } from '@/lib/api/nomina'
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

/*
  LA QUINCENA, EN EL ORDEN EN QUE SE HACE

  Antes eran dos grupos —«esta quincena» y «se configura una vez»— y dentro de
  cada uno las tarjetas iban sueltas. Pero una nómina tiene orden: se anotan
  las novedades, se calcula, se revisa y salen los recibos. Quien lo hace por
  primera vez no lo sabe, y quien lo hace cada quince días tampoco tiene por
  qué recordarlo.

  Lo que se configura una vez va después y sin numerar: no es un paso de la
  quincena, es la regla con la que se calcula.
*/
const QUE_HACER: GrupoDeAcciones[] = [
  {
    titulo: 'La quincena, paso a paso',
    detalle: 'En este orden. Cada paso se apoya en el anterior.',
    acciones: [
      {
        paso: 1,
        titulo: 'Anotar las novedades',
        detalle:
          'Quién faltó, quién hizo horas extra, préstamos y descuentos. Lo que hace que esta quincena no sea igual que la anterior.',
        icono: ClipboardList,
        a: '/app/nomina/asistencia',
        exige: 'ESCRITURA',
      },
      {
        paso: 2,
        titulo: 'Calcular la nómina',
        detalle:
          'El sistema aplica el tabulador, las novedades y los parámetros. Se puede recalcular las veces que haga falta antes de aprobar.',
        icono: Calculator,
        a: '/app/nomina/procesos',
        exige: 'ESCRITURA',
      },
      {
        paso: 3,
        titulo: 'Sacar los recibos',
        detalle: 'El papel que se le entrega a cada quien, con sus asignaciones y deducciones.',
        icono: FileText,
        a: '/app/nomina/recibos',
      },
    ],
  },
  {
    titulo: 'La gente',
    acciones: [
      {
        titulo: 'Cargar personal por planilla',
        detalle:
          'Para dar de alta a toda la gente de una vez. Se baja la plantilla, se llena y el sistema comprueba fila por fila antes de escribir nada.',
        icono: Upload,
        a: '/app/nomina/personal/carga',
        exige: 'ESCRITURA',
      },
      {
        titulo: 'Contratar o corregir una ficha',
        detalle: 'Datos, cargo, cuenta donde cobra, y lo que se le ha entregado.',
        icono: Users,
        a: '/app/nomina/personal',
        exige: 'ESCRITURA',
      },
      {
        titulo: 'Ajustar el tabulador',
        detalle:
          'El sueldo no se escribe por persona: sale del cargo. Cambiarlo aquí cambia a todos los que lo tienen.',
        icono: Landmark,
        a: '/app/nomina/tabulador',
        exige: 'ESCRITURA',
      },
    ],
  },
  {
    titulo: 'Las reglas, que se tocan de vez en cuando',
    acciones: [
      {
        titulo: 'Parámetros de nómina',
        detalle: 'Los porcentajes y topes con los que se calcula todo lo demás.',
        icono: Settings,
        a: '/app/nomina/parametros',
        exige: 'ESCRITURA',
      },
      {
        titulo: 'Prestaciones sociales',
        detalle: 'Lo que la empresa le debe a cada quien por su antigüedad.',
        icono: Landmark,
        a: '/app/nomina/prestaciones',
      },
    ],
  },
]

export function TableroNomina() {
  const { data: periodos, isPending, error } = usePeriodos()
  const { data: empleados } = useEmpleados(true)


  // El período en curso es el último que no está pagado ni anulado; si todos lo
  // están, el más reciente, que es el que se acaba de cerrar.
  const abiertos = (periodos ?? []).filter((p) => !['PAGADA', 'ANULADA'].includes(p.estado))
  const actual = abiertos[0] ?? (periodos ?? [])[0]
  const paso = actual ? PASOS_DEL_PERIODO[actual.estado] : undefined

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

          <QueHacer grupos={QUE_HACER} />

          <div className="mt-8">
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
