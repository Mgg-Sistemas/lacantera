import { Link } from 'react-router'
import { ArrowDownRight, ArrowUpRight, Circle } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { fechaHora, hace } from '@/lib/formato'
import { cn } from '@/lib/cn'

/*
  LA LÍNEA DE TIEMPO DE UNA FICHA

  Christopher: «necesito que cada item, maquinaria, vehículo, equipo, tenga su
  propio historial, desde entradas, salidas, hasta reabastecimiento o
  reparaciones», y dónde: «dentro de las fichas que ya existen».

  POR QUÉ ESTO ES UN COMPONENTE Y NO UN COPIA-PEGA MÁS

  Al ir a hacerlo salió que ya había SIETE formas distintas de pintar «una lista
  de hechos con fecha» repartidas por las pantallas, y ninguna reutilizable: la
  historia del artículo, la actividad del vehículo, sus choferes, las incidencias
  del trabajador, sus dotaciones en tabla, los papeles del proveedor y la lista
  de mantenimientos. Siete dialectos para la misma frase.

  La petición añade tres más. Copiando se llega a diez, y las cinco fichas del
  sistema se leen como cinco productos distintos. Así que esto se escribe una vez
  y las que ya existen se mudan aquí en el mismo movimiento — si no, no serían
  siete dialectos: serían ocho.

  QUÉ SE CONSERVA, Y POR QUÉ ESE Y NO OTRO

  El de la ficha del artículo, que es el único de los siete que dice a la vez el
  signo, el detalle y quién lo registró. Sus decisiones ya estaban pensadas y no
  hay que volver a tomarlas:

  · flecha para lo que mueve existencia, punto para lo que no. Una herramienta
    que vuelve no es ni entrada ni salida.
  · color solo cuando significa algo. Verde entra, rojo sale, ámbar avisa. Lo
    demás en gris: si todo tiene color, el color no dice nada.
  · las cantidades no llevan «+» ni «−» escritos. El signo es la flecha.

  QUÉ SE LE AÑADE

  El «hace tres días» junto a la fecha. La función existe en formato.ts desde
  hace tiempo, comentada con que «es lo que distingue una lista de una
  herramienta», y ninguna pantalla la usaba. En una línea de tiempo es donde más
  rinde: «12 ago 2026, 09:14» a secas obliga a restar de cabeza.

  Y una etiqueta cuando el hecho viene de otro módulo. La ficha del camión
  enseña también lo de su máquina —el gasoil, el taller—, y sin decirlo parece
  que el camión tiene combustible propio.

  LO QUE NO ENTRA AQUÍ

  Los periodos —«lo manejó de marzo a julio»— y las tablas de dotación. «Qué
  tiene ahora» y «desde cuándo hasta cuándo» no son «qué pasó». Meterlos a la
  fuerza pediría un componente con dos modos, que es la forma habitual de que un
  componente compartido acabe siendo peor que copiar.
*/

/**
 * Un hecho, tal como lo devuelven `historial_maquina`, `historial_articulo` e
 * `historial_vehiculo`. Las tres comparten contrato a propósito: si cada una
 * devolviera lo suyo, este componente tendría que saber de las tres.
 */
export interface HechoDeFicha {
  /** El instante en que PASÓ, no en que alguien lo tecleó. */
  cuando: string
  fecha: string
  clase: string
  titulo: string
  detalle: string | null
  cantidad: string | number | null
  unidad: string | null
  /** Desde el punto de vista de lo que se está mirando: +1 entró, −1 salió, 0 ni una cosa ni otra. */
  signo: number
  valor_usd: string | number | null
  /** Almacén, taller o tanque. */
  lugar: string | null
  /** A quién le pasó: el que recibió, el operador, el chofer. */
  persona: string | null
  /** Quién lo registró en el sistema. */
  quien: string | null
  documento: string | null
  ruta: string | null
}

/**
 * Las clases que se pintan en ámbar.
 *
 * No es «lo malo»: es lo que hay que MIRAR. Una herramienta perdida y una dada
 * de baja no restan de la misma manera, y quien repasa la ficha busca justo
 * esas. Es una lista y no una regla porque las clases son texto libre venido de
 * un CHECK, no un ENUM: lo que no esté aquí cae en gris y no revienta.
 */
const AVISAN = new Set(['PERDIDA', 'DANADA', 'SALIDA_MERMA', 'SALIDA_BAJA', 'AJUSTE_NEGATIVO'])

function tono(h: HechoDeFicha): 'entrada' | 'salida' | 'aviso' | 'quieto' {
  if (AVISAN.has(h.clase)) return 'aviso'
  if (h.signo > 0) return 'entrada'
  if (h.signo < 0) return 'salida'
  return 'quieto'
}

const numero = (valor: string | number) =>
  Number(valor).toLocaleString('es-VE', { maximumFractionDigits: 2 })

export interface HistorialProps {
  titulo?: string
  subtitulo?: string
  hechos: HechoDeFicha[] | undefined
  cargando?: boolean
  error?: unknown
  /** Qué decir cuando no ha pasado nada todavía. */
  vacio?: string
  /**
   * Los hechos cuya `ruta` empiece por aquí llevan etiqueta: vienen de otro
   * módulo. En la ficha del camión, `/app/maquinaria`.
   */
  prestadoDe?: { prefijo: string; etiqueta: string }
  className?: string
}

export function Historial({
  titulo = 'Su historia',
  subtitulo = 'Todo lo que le ha pasado, de lo más reciente a lo más viejo.',
  hechos,
  cargando,
  error,
  vacio = 'Todavía no ha pasado nada',
  prestadoDe,
  className,
}: HistorialProps) {
  return (
    <Card flush className={className}>
      <div className="px-5 pt-5">
        <CardHeader title={titulo} subtitle={subtitulo} />
      </div>

      {cargando ? <Cargando /> : null}

      {error ? (
        <div className="p-5">
          <ErrorDeCarga error={error} />
        </div>
      ) : null}

      {/* El vacío lleva su propio relleno: dentro de una card `flush` se pega al
          borde, y en dos de las fichas se veía así. */}
      {!cargando && !error && hechos && hechos.length === 0 ? (
        <div className="px-5 pb-5">
          <Vacio icono={<Circle />} titulo={vacio} />
        </div>
      ) : null}

      {hechos && hechos.length > 0 ? (
        <ul className="mt-2">
          {hechos.map((h, i) => {
            const t = tono(h)
            const prestado = Boolean(prestadoDe && h.ruta?.startsWith(prestadoDe.prefijo))

            return (
              <li
                /* Ninguna de las tres fuentes devuelve un id estable —son
                   uniones de cinco o seis tablas—, así que el índice entra en la
                   clave. Sin él, dos hechos del mismo día y sin documento
                   colisionan y React reordena mal al refrescar. */
                key={`${h.clase}-${h.documento ?? 'x'}-${h.cuando}-${i}`}
                className="border-hairline flex gap-3 border-t px-5 py-3"
              >
                <span
                  className={cn(
                    'mt-0.5 shrink-0',
                    t === 'entrada'
                      ? 'text-success'
                      : t === 'salida'
                        ? 'text-danger'
                        : t === 'aviso'
                          ? 'text-warning'
                          : 'text-ink/30',
                  )}
                >
                  {t === 'entrada' ? (
                    <ArrowDownRight className="size-4" />
                  ) : t === 'salida' ? (
                    <ArrowUpRight className="size-4" />
                  ) : (
                    <Circle className="size-3" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-ink/85 text-sm font-medium">{h.titulo}</span>

                    {h.cantidad ? (
                      <span className="tabular text-ink/70 text-sm">
                        {numero(h.cantidad)} {h.unidad ?? ''}
                      </span>
                    ) : null}

                    {h.lugar ? <span className="text-ink/45 text-xs">· {h.lugar}</span> : null}

                    {h.persona ? <Chip tone="neutral">{h.persona}</Chip> : null}

                    {prestado ? <Chip tone="royal">{prestadoDe!.etiqueta}</Chip> : null}
                  </div>

                  {h.detalle ? <p className="text-ink/55 mt-0.5 text-xs">{h.detalle}</p> : null}

                  <p className="text-ink/40 text-2xs mt-0.5">
                    {fechaHora(h.cuando)}
                    {` · ${hace(h.cuando)}`}
                    {h.documento ? ` · ${h.documento}` : ''}
                    {h.quien ? ` · lo registró ${h.quien}` : ''}
                  </p>
                </div>

                {/* El enlace lleva al sitio donde el hecho vive entero: el vale
                    de combustible, la orden de taller, el libro de movimientos.
                    Solo cuando la fila trae ruta, que no todas la traen. */}
                {h.ruta ? (
                  <Link
                    to={h.ruta}
                    className="text-ink/30 hover:text-ink/60 shrink-0 self-center text-xs underline underline-offset-2"
                  >
                    Ver
                  </Link>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </Card>
  )
}
