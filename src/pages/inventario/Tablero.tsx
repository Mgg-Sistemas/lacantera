import { Link } from 'react-router'
import {
  ArrowLeftRight,
  Upload,
  Boxes,
  ClipboardList,
  PackageMinus,
  PackagePlus,
  TriangleAlert,
  Warehouse,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { QueHacer } from '@/components/QueHacer'
import type { GrupoDeAcciones } from '@/components/QueHacer'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { useExistencias, useMovimientos } from '@/lib/api/inventario'
import { dolares, enteros } from '@/lib/formato'
import { cn } from '@/lib/cn'

/**
 * Por dónde se empieza en el inventario.
 *
 * POR QUÉ NO SE COPIA EL TABLERO DE COMPRAS TAL CUAL
 *
 * Compras y ventas son cadenas: se pide, se cotiza, se aprueba, se paga, se
 * recibe. Cada cosa va detrás de la anterior y por eso sus tableros van
 * numerados — el número dice qué toca después.
 *
 * El inventario no es una cadena. Es un estado —lo que hay en el patio ahora
 * mismo— y unos movimientos que lo cambian. Ponerle «paso I, paso II» seria
 * inventarle un orden que no tiene, que es exactamente el adorno prestado que
 * se descartó en la portada.
 *
 * Lo que sí tiene es una estructura, y está en la base: cada movimiento entra,
 * sale o traslada. La columna `signo` lo dice literalmente. Así que el tablero
 * se organiza como se organiza el trabajo: primero cómo está el patio, después
 * lo que lo hace entrar, lo que lo hace salir y lo que lo mueve de sitio.
 *
 * LO QUE NO SE PUEDE HACER, NO SE OFRECE
 *
 * Quien tiene el inventario en lectura ve el estado y no ve los botones de
 * registrar. Enseñar una acción que va a rebotar contra un permiso es peor que
 * no enseñarla: manda a alguien a intentarlo para que el sistema le diga que
 * no.
 */


/*
  DE UN ALMACÉN VACÍO A UN ALMACÉN QUE SE MUEVE

  Los grupos van en el orden en que hacen falta, no por naturaleza. Antes se
  repartían en «entra / sale / se mueve», que es como lo ve quien construyó el
  sistema; quien abre el tablero viene con una tarea, y la primera de todas
  —cuando el almacén arranca— es que exista el catálogo.

  Los tres primeros van numerados porque hay un orden real: sin artículos no
  hay qué recibir, y sin existencia no hay qué mover. Los del día a día no se
  numeran: se hacen cuando toca y en cualquier orden.
*/
function QUE_HACER(faltantes: number): GrupoDeAcciones[] {
  return [
    {
      titulo: 'Poner el almacén en marcha',
      detalle: 'Los tres pasos para que el inventario empiece a decir la verdad.',
      acciones: [
        {
          paso: 1,
          titulo: 'Cargar el catálogo',
          detalle:
            'Los artículos que la empresa maneja. Se sube una planilla de Excel y el sistema comprueba fila por fila antes de escribir nada.',
          icono: Upload,
          a: '/app/inventario/articulos/carga',
          exige: 'ESCRITURA',
        },
        {
          paso: 2,
          titulo: 'Abrir los almacenes',
          detalle: 'Dónde se guarda cada cosa: patios, depósitos y talleres.',
          icono: Warehouse,
          a: '/app/inventario/almacenes',
          exige: 'ESCRITURA',
        },
        {
          paso: 3,
          titulo: 'Cargar el saldo inicial',
          detalle:
            'Lo que hay hoy en cada sitio, con su costo. Es la única entrada que no necesita una compra detrás.',
          icono: PackagePlus,
          a: '/app/inventario/existencias',
          exige: 'ESCRITURA',
        },
      ],
    },
    {
      titulo: 'El día a día',
      acciones: [
        {
          titulo: 'Llegó una compra',
          detalle: 'Recibir contra la orden. El material entra al almacén y la compra se cierra.',
          icono: PackagePlus,
          a: '/app/compras/recepciones',
          exige: 'ESCRITURA',
        },
        {
          titulo: 'Sacar o dar de baja material',
          detalle: 'Consumo, merma, o lo que se perdió. Sale al costo promedio que tiene.',
          icono: PackageMinus,
          a: '/app/inventario/existencias',
          exige: 'ESCRITURA',
        },
        {
          titulo: 'Trasladar a otro almacén',
          detalle: 'No cambia cuánto hay, cambia dónde está.',
          icono: ArrowLeftRight,
          a: '/app/inventario/transferencias',
          exige: 'ESCRITURA',
        },
      ],
    },
    {
      titulo: 'Revisar y cuadrar',
      acciones: [
        {
          titulo: 'Contar el almacén',
          detalle:
            'Se imprime el acta con lo que el sistema cree que hay, se cuenta a mano, y la diferencia se anota como ajuste.',
          icono: ClipboardList,
          a: '/app/inventario/existencias',
        },
        {
          titulo:
            faltantes > 0
              ? `Reponer lo que falta (${faltantes})`
              : 'Ver lo que está por debajo del mínimo',
          detalle:
            faltantes > 0
              ? 'Hay artículos en el mínimo o por debajo. Conviene pedirlos antes de que hagan falta.'
              : 'Ahora mismo no hay nada por reponer.',
          icono: TriangleAlert,
          a: '/app/inventario/existencias',
        },
        {
          titulo: 'Ver qué le pasó a un artículo',
          detalle:
            'Su historia entera desde que se creó: entradas, salidas, traslados y a quién se le entregó.',
          icono: Boxes,
          a: '/app/inventario/articulos',
        },
      ],
    },
  ]
}


/*
  LOS ATAJOS A LO QUE HOY NO SE OFRECE NO SE PINTAN

  Este tablero es un mapa de por dónde entra y por dónde sale el material, y
  dos de sus caminos —el parte de turno de Explotación y la nota de entrega de
  Ventas— llevan hoy al cartel de obra. Un mapa que enseña calles cortadas se
  deja de leer.

  Se filtra con la misma función que usan el riel y la lupa, y no con una lista
  aparte: cuando un módulo vuelva al menú, su atajo reaparece aquí solo. Una
  lista propia sería la que nadie se acuerda de tocar ese día.
*/

export function TableroInventario() {
  const { data: existencias, isPending, error } = useExistencias()
  const { data: movimientos } = useMovimientos()


  const filas = existencias ?? []

  // Solo cuenta lo que tiene existencia: un catálogo de veintiocho artículos
  // con cero en todos no son «28 artículos en el patio».
  const conExistencia = filas.filter((e) => Number(e.existencia) > 0)
  const valor = filas.reduce((s, e) => s + Number(e.valor_usd), 0)

  /*
    Bajo mínimo es la única cifra que pide acción.

    Se compara contra el mínimo del artículo y solo cuando hay mínimo puesto:
    un artículo sin punto de pedido no está «bajo mínimo», está sin configurar,
    y contarlo como alerta llenaría la pantalla de avisos que nadie puede
    resolver.
  */
  const bajoMinimo = filas.filter(
    (e) => Number(e.stock_minimo) > 0 && Number(e.existencia) < Number(e.stock_minimo),
  )

  const movimientosHoy = (movimientos ?? []).filter(
    (m) => m.fecha === new Date().toLocaleDateString('en-CA'),
  ).length

  return (
    <>
      <PageHeader
        title="Inventario"
        description="Cómo está el patio ahora mismo, y por dónde entra y sale el material."
        actions={
          <Link to="/app/inventario/existencias">
            <Button icon={<Boxes />}>Ver existencias</Button>
          </Link>
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {!isPending && !error ? (
        <>
          {/* ---------- Cómo está el patio ---------- */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">
                Artículos con existencia
              </p>
              <p className="text-ink/90 tabular mt-3 text-3xl font-light">
                {enteros(conExistencia.length)}
              </p>
              <p className="text-ink/45 mt-2 text-xs">de {enteros(filas.length)} en el catálogo</p>
            </Card>

            <Card>
              <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">
                Valor del inventario
              </p>
              <p className="text-ink/90 tabular mt-3 text-3xl font-light">{dolares(valor)}</p>
              <p className="text-ink/45 mt-2 text-xs">A costo promedio, no a precio de venta</p>
            </Card>

            {/* La única tarjeta que se enciende, y solo cuando hay algo que
                atender. Lo demás informa; esto reclama. */}
            <Card className={cn('relative overflow-hidden', bajoMinimo.length > 0 && 'border-warning/40 border')}>
              {bajoMinimo.length > 0 ? (
                <span className="bg-warning absolute inset-x-0 top-0 h-[3px]" aria-hidden="true" />
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">
                  Bajo el mínimo
                </p>
                <TriangleAlert
                  className={cn(
                    'size-[18px] shrink-0',
                    bajoMinimo.length > 0 ? 'text-warning' : 'text-ink/25',
                  )}
                  aria-hidden="true"
                />
              </div>
              <p
                className={cn(
                  'tabular mt-3 text-3xl font-light',
                  bajoMinimo.length > 0 ? 'text-ink/90' : 'text-ink/25',
                )}
              >
                {enteros(bajoMinimo.length)}
              </p>
              <p className="text-ink/45 mt-2 text-xs">
                {bajoMinimo.length === 0
                  ? 'Nada por reponer'
                  : 'Conviene pedirlos antes de que falten'}
              </p>
            </Card>

            <Card>
              <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">
                Movimientos de hoy
              </p>
              <p className="text-ink/90 tabular mt-3 text-3xl font-light">
                {enteros(movimientosHoy)}
              </p>
              <p className="text-ink/45 mt-2 text-xs">Entradas, salidas y traslados</p>
            </Card>
          </div>

          <QueHacer grupos={QUE_HACER(bajoMinimo.length)} />

          {/* Para quien entra por primera vez. Va al final y no arriba: quien
              ya sabe no tiene que saltárselo cada mañana. */}
          <Card className="mt-8">
            <p className="text-ink/40 text-2xs font-mono tracking-[0.18em] uppercase">
              Si es la primera vez
            </p>
            <p className="text-ink/75 mt-3 text-sm leading-relaxed">
              La existencia <strong>no se escribe: se deduce</strong>. Es la suma del libro de
              movimientos, y cada cosa que entra, sale o se traslada deja su renglón.
            </p>
            <p className="text-ink/50 mt-2 text-sm leading-relaxed">
              Registrar una entrada tampoco es escribirla a mano: es anotar que entraron
              cuarenta y cuánto costaron, y la existencia sube como consecuencia. La diferencia
              importa el día que alguien pregunte de dónde salieron.
            </p>
            <p className="text-ink/50 mt-2 text-sm leading-relaxed">
              Por eso no hay un botón de «poner existencia en 40». Si el conteo no cuadra con el
              sistema, se corrige con un ajuste, que queda anotado con su motivo y con quién lo
              hizo.
            </p>
          </Card>

        </>
      ) : null}
    </>
  )
}
