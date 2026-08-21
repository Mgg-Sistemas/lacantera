import { Link } from 'react-router'
import {
  ArrowLeftRight,
  ArrowRight,
  Boxes,
  ClipboardList,
  PackageMinus,
  PackagePlus,
  TriangleAlert,
  Warehouse,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { useExistencias, useMovimientos } from '@/lib/api/inventario'
import { esRutaFueraDelMvp } from '@/config/navigation'
import { useMisPermisos } from '@/lib/api/usuarios'
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

interface Accion {
  titulo: string
  detalle: string
  icono: LucideIcon
  ruta: string
  /** Sin esto, se ve siempre. Con esto, solo con permiso de escritura. */
  exigeEscritura?: boolean
}

const ENTRA: Accion[] = [
  {
    titulo: 'Llegó una compra',
    detalle: 'Recibir contra la orden. El material entra al almacén y la compra se cierra.',
    icono: PackagePlus,
    ruta: '/app/compras/recepciones',
    exigeEscritura: true,
  },
  {
    titulo: 'Entró sin compra de por medio',
    detalle:
      'El saldo con el que arranca el almacén, algo comprado por fuera, material que trae alguien. Lleva su costo.',
    icono: PackagePlus,
    ruta: '/app/inventario/existencias',
    exigeEscritura: true,
  },
  {
    titulo: 'Salió producción del turno',
    detalle: 'El parte de turno es la única puerta por la que entra material de la planta.',
    icono: PackagePlus,
    ruta: '/app/explotacion/produccion',
    exigeEscritura: true,
  },
]

const SALE: Accion[] = [
  {
    titulo: 'Se despachó a un cliente',
    detalle: 'La nota de entrega descuenta el patio al salir el camión.',
    icono: PackageMinus,
    ruta: '/app/ventas/despachos',
    exigeEscritura: true,
  },
  {
    titulo: 'Se consumió o se perdió',
    detalle: 'Consumo en el frente, merma y ajustes de conteo.',
    icono: PackageMinus,
    ruta: '/app/inventario/movimientos',
    exigeEscritura: true,
  },
]

const MUEVE: Accion[] = [
  {
    titulo: 'Cambió de almacén',
    detalle: 'Traslado entre almacenes o patios. No cambia el total, cambia dónde está.',
    icono: ArrowLeftRight,
    ruta: '/app/inventario/transferencias',
    exigeEscritura: true,
  },
]

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
function Grupo({
  titulo,
  acciones,
  puedeEscribir,
}: {
  titulo: string
  acciones: Accion[]
  puedeEscribir: boolean
}) {
  const visibles = acciones.filter(
    (a) => (!a.exigeEscritura || puedeEscribir) && !esRutaFueraDelMvp(a.ruta),
  )
  if (visibles.length === 0) return null

  return (
    <div>
      <h2 className="text-ink/40 text-2xs font-mono tracking-[0.18em] uppercase">{titulo}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {visibles.map((a) => {
          const Icono = a.icono
          return (
            <Link key={a.titulo} to={a.ruta} className="block">
              <Card className="hover:border-royal-300 border-hairline h-full border transition-colors">
                <div className="flex items-start gap-3">
                  <Icono className="text-ink/30 mt-0.5 size-[18px] shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-ink/90 text-base font-medium">{a.titulo}</p>
                    <p className="text-ink/55 mt-1 text-sm leading-relaxed">{a.detalle}</p>
                  </div>
                </div>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export function TableroInventario() {
  const { data: existencias, isPending, error } = useExistencias()
  const { data: movimientos } = useMovimientos()
  const { puede } = useMisPermisos()

  const puedeEscribir = puede('INVENTARIO', 'ESCRITURA')

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

          {/* ---------- Por dónde se mueve el material ---------- */}
          <div className="mt-8 space-y-8">
            <Grupo titulo="Entra material" acciones={ENTRA} puedeEscribir={puedeEscribir} />
            <Grupo titulo="Sale material" acciones={SALE} puedeEscribir={puedeEscribir} />
            <Grupo titulo="Cambia de sitio" acciones={MUEVE} puedeEscribir={puedeEscribir} />

            {/* ---------- Lo que define el inventario ---------- */}
            <div>
              <h2 className="text-ink/40 text-2xs font-mono tracking-[0.18em] uppercase">
                Consultar y configurar
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/app/inventario/existencias">
                  <Button variant="outline" size="sm" icon={<Boxes />}>
                    Existencias
                  </Button>
                </Link>
                <Link to="/app/inventario/movimientos">
                  <Button variant="outline" size="sm" icon={<ClipboardList />}>
                    Movimientos
                  </Button>
                </Link>
                <Link to="/app/inventario/articulos">
                  <Button variant="outline" size="sm" icon={<ArrowRight />}>
                    Catálogo de artículos
                  </Button>
                </Link>
                <Link to="/app/inventario/almacenes">
                  <Button variant="outline" size="sm" icon={<Warehouse />}>
                    Almacenes y patios
                  </Button>
                </Link>
              </div>
            </div>

            {/* Para quien entra por primera vez. Va al final y no arriba: quien
                ya sabe no tiene que saltárselo cada mañana. */}
            <Card>
              <p className="text-ink/40 text-2xs font-mono tracking-[0.18em] uppercase">
                Si es la primera vez
              </p>
              <p className="text-ink/75 mt-3 text-sm leading-relaxed">
                El inventario no se escribe a mano: <strong>se mueve solo</strong> cuando pasa algo.
                Entra al recibir una compra o al cargar el parte de turno; sale al despachar a un
                cliente o al consumir en el frente. Las existencias son la suma de todo eso.
              </p>
              <p className="text-ink/50 mt-2 text-sm leading-relaxed">
                Por eso no hay un botón de «cargar existencias»: si un número no cuadra, se corrige
                con un ajuste, que queda anotado con su motivo.
              </p>
            </Card>
          </div>
        </>
      ) : null}
    </>
  )
}
