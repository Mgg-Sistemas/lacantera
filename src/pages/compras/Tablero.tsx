import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  AlertTriangle,
  BookOpen,
  Building2,
  ClipboardList,
  FileText,
  HandCoins,
  PackageCheck,
  Plus,
  Upload,
  User,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { QueHacer } from '@/components/QueHacer'
import type { GrupoDeAcciones } from '@/components/QueHacer'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { COLUMNAS, useTablero } from '@/lib/api/compras'
import type { Columna, DefinicionColumna, Tarjeta } from '@/lib/api/compras'
import { dolares, hace } from '@/lib/formato'
import { cn } from '@/lib/cn'

type Tono = DefinicionColumna['tono']

/** Franja superior del panel. Solo aparece cuando la etapa tiene trabajo. */
const franjas: Record<Tono, string> = {
  neutral: 'bg-ink/25',
  info: 'bg-info',
  royal: 'bg-royal-600',
  warning: 'bg-warning',
  success: 'bg-success',
  danger: 'bg-danger',
}

const puntos: Record<Tono, string> = {
  neutral: 'bg-ink/30',
  info: 'bg-info',
  royal: 'bg-royal-500',
  warning: 'bg-warning',
  success: 'bg-success',
  danger: 'bg-danger',
}

function fechaLarga(iso: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/** La señal propia de la etapa, cuando la etapa tiene algo que señalar. */
function señal(t: Tarjeta): { texto: string; tono: Tono } | null {
  if (t.columna === 'CONFIRMADA') {
    return t.cotizaciones === 0
      ? { texto: 'Sin cotizaciones', tono: 'neutral' }
      : {
          texto: `${t.cotizaciones} cotización${t.cotizaciones === 1 ? '' : 'es'}`,
          tono: 'info',
        }
  }

  if (t.columna === 'APROBADA') {
    // El estado sigue llamandose EN_TESORERIA en la base; lo que se lee, no.
    // Vease el comentario de ESTADOS en DetalleCompra.tsx.
    return t.estado_orden === 'EN_TESORERIA'
      ? { texto: 'Por pagar', tono: 'info' }
      : { texto: 'Falta el método de pago', tono: 'warning' }
  }

  if (t.columna === 'PAGADA' && t.dias_sin_recibir !== null) {
    const d = t.dias_sin_recibir
    return {
      texto: d === 0 ? 'Pagada hoy' : `${d} día${d === 1 ? '' : 's'} sin recibir`,
      tono: d > 15 ? 'danger' : d > 7 ? 'warning' : 'success',
    }
  }

  if (t.columna === 'DESISTIO') {
    return t.desistio_resolucion === 'PENDIENTE'
      ? { texto: 'Dinero sin resolver', tono: 'danger' }
      : {
          texto:
            t.desistio_resolucion === 'REEMBOLSADO'
              ? 'Reembolsado'
              : t.desistio_resolucion === 'SALDO_FAVOR'
                ? 'Queda a favor'
                : 'Dado por perdido',
          tono: 'neutral',
        }
  }

  if (t.estado_solicitud === 'BORRADOR') return { texto: 'Borrador', tono: 'neutral' }
  return null
}

function TarjetaCompra({ tarjeta }: { tarjeta: Tarjeta }) {
  const navigate = useNavigate()
  const marca = señal(tarjeta)

  return (
    <article
      onClick={() => void navigate(`/app/compras/${tarjeta.solicitud_id}`)}
      className={cn(
        'bg-ink/4 border-hairline rounded-card group cursor-pointer border p-3',
        'hover:border-royal-600/40 hover:bg-ink/6 transition-colors duration-150',
      )}
    >
      <p className="text-ink/45 font-mono text-2xs tracking-tight">
        {tarjeta.orden_numero ?? tarjeta.numero}
      </p>

      <h3 className="text-ink/90 group-hover:text-royal-700 dark:group-hover:text-royal-300 mt-0.5 text-base leading-snug font-semibold">
        {tarjeta.titulo}
      </h3>

      <p className="text-ink/50 text-xs">
        {tarjeta.renglones} {tarjeta.renglones === 1 ? 'ítem' : 'ítems'}
        {tarjeta.prioridad !== 'NORMAL'
          ? ` · ${tarjeta.prioridad === 'URGENTE' ? 'Urgente' : 'Prioridad alta'}`
          : ''}
      </p>

      <p className="text-ink/60 mt-2 flex items-center gap-1.5 text-xs">
        <User className="text-royal-500 dark:text-royal-300 size-3.5 shrink-0" />
        <span className="truncate">
          {tarjeta.solicitante ?? 'Sin solicitante'}
          {tarjeta.destino ? ` · ${tarjeta.destino}` : ''}
        </span>
      </p>

      <p className="text-ink/40 mt-0.5 text-xs">· {fechaLarga(tarjeta.creada_en)}</p>

      {tarjeta.proveedor ? (
        <p className="text-ink/55 mt-1.5 truncate text-xs">{tarjeta.proveedor}</p>
      ) : null}

      {marca ? (
        <Chip tone={marca.tono} className="mt-2">
          {marca.texto}
        </Chip>
      ) : null}

      <div className="border-hairline mt-2.5 flex items-baseline justify-between gap-2 border-t pt-2">
        {/* El ámbar es el único color cálido del sistema y aquí gana su sitio:
            en un panel lleno de tarjetas iguales, el monto es lo que se busca
            con la vista.

            Sin cotización todavía no hay monto. Escribir "$ 0,00" sería
            decir que la compra no cuesta nada. */}
        {tarjeta.total_usd ? (
          <span className="text-safety font-mono text-sm font-semibold">
            {dolares(tarjeta.total_usd)}
          </span>
        ) : (
          <span className="text-ink/30 text-xs">Sin cotizar</span>
        )}
        <span className="text-ink/40 text-xs whitespace-nowrap">
          {hace(tarjeta.creada_en)}
        </span>
      </div>
    </article>
  )
}

function Panel({
  definicion,
  tarjetas,
}: {
  definicion: DefinicionColumna
  tarjetas: Tarjeta[]
}) {
  const hayTrabajo = tarjetas.length > 0

  return (
    // `self-start` evita que un panel vacío se estire hasta la altura del más
    // lleno de su fila: media pantalla de vacío no dice nada que no diga ya
    // el "Sin órdenes".
    <section className="bg-surface rounded-card shadow-card flex max-h-[26rem] flex-col self-start overflow-hidden">
      {/* La franja de color solo se enciende donde hay algo que hacer. Con las
          siete encendidas a la vez, ninguna señala nada. */}
      <div className={cn('h-[3px] shrink-0', hayTrabajo ? franjas[definicion.tono] : 'bg-transparent')} />

      <header className="flex items-start justify-between gap-3 px-4 pt-3 pb-2.5">
        <div className="flex min-w-0 items-start gap-2">
          <span className={cn('mt-[5px] size-2 shrink-0 rounded-full', puntos[definicion.tono])} />
          <h2 className="text-ink/80 text-xs leading-snug font-semibold tracking-wide uppercase">
            {definicion.titulo}
            <span className="text-ink/40 block text-2xs font-normal normal-case">
              {definicion.accion}
            </span>
          </h2>
        </div>
        <span
          className={cn(
            'tabular shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
            hayTrabajo ? 'bg-ink/10 text-ink/75' : 'bg-ink/6 text-ink/35',
          )}
        >
          {tarjetas.length}
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 pb-3">
        {hayTrabajo ? (
          tarjetas.map((t) => <TarjetaCompra key={t.solicitud_id} tarjeta={t} />)
        ) : (
          <p className="border-hairline text-ink/35 rounded-card border border-dashed py-8 text-center text-sm">
            Sin órdenes
          </p>
        )}
      </div>
    </section>
  )
}

/*
  UNA COMPRA ES UNA CADENA DE MANOS

  El tablero de arriba enseña dónde está parada cada una. Esto de abajo dice
  qué le toca hacer a quien mira, y en qué orden: el pedido lo levanta quien
  necesita algo, compras lo cotiza, gerencia lo aprueba, tesorería lo paga y
  almacén lo recibe.

  Van numerados porque el orden no se puede saltar —no se paga lo que el
  gerente no aprobó— y porque cada paso lo hace un rol distinto: ver la cadena
  entera es lo que permite saber a quién reclamarle.
*/
const QUE_HACER: GrupoDeAcciones[] = [
  {
    titulo: 'La cadena de una compra',
    detalle: 'De la necesidad al material en el patio. Cada paso lo hace alguien distinto.',
    acciones: [
      {
        paso: 1,
        titulo: 'Pedir algo',
        detalle:
          'Lo levanta quien lo necesita: un repuesto, combustible, un servicio. Con decir qué hace falta y para qué, basta.',
        icono: Plus,
        a: '/app/compras/nuevo',
        exige: 'ESCRITURA',
      },
      {
        paso: 2,
        titulo: 'Cotizar y proponer',
        detalle:
          'Compras carga las cotizaciones que consiguió y propone una al gerente. Se comparan lado a lado.',
        icono: ClipboardList,
        a: '/app/compras',
        exige: 'ESCRITURA',
      },
      {
        paso: 3,
        titulo: 'Pagar lo aprobado',
        detalle:
          'Tesorería ejecuta el pago de lo que gerencia autorizó, y deja el comprobante.',
        icono: HandCoins,
        a: '/app/tesoreria/pagos',
        exige: 'ESCRITURA',
      },
      {
        paso: 4,
        titulo: 'Recibir el material',
        detalle:
          'Almacén cuenta lo que llegó contra la orden. Puede llegar en partes; el sistema lleva la cuenta.',
        icono: PackageCheck,
        a: '/app/compras/recepciones',
        exige: 'ESCRITURA',
      },
    ],
  },
  {
    titulo: 'Alrededor de la compra',
    acciones: [
      {
        titulo: 'Cargar proveedores por planilla',
        detalle:
          'Para dar de alta a todos de una vez. Manda el RIF: el mismo proveedor con dos RIF distintos es como se paga dos veces la misma factura.',
        icono: Upload,
        a: '/app/compras/proveedores/carga',
        exige: 'ESCRITURA',
      },
      {
        titulo: 'Proveedores',
        detalle: 'A quién se le compra: su RIF, cómo cobra y cómo se le paga.',
        icono: Building2,
        a: '/app/compras/proveedores',
      },
      {
        titulo: 'Facturas del proveedor',
        detalle: 'El papel que respalda cada compra, guardado donde se pueda encontrar.',
        icono: FileText,
        a: '/app/compras/facturas',
      },
      {
        titulo: 'Libro de compras',
        detalle: 'Lo que va al SENIAT: base imponible, IVA y crédito fiscal del período.',
        icono: BookOpen,
        a: '/app/compras/libro',
      },
    ],
  },
]

export function TableroCompras() {
  const { data, isPending, error } = useTablero()

  const porColumna = useMemo(() => {
    const mapa = new Map<Columna, Tarjeta[]>(COLUMNAS.map((c) => [c.clave, []]))
    for (const t of data ?? []) {
      mapa.get(t.columna)?.push(t)
    }
    return mapa
  }, [data])

  const enRiesgo = (data ?? []).filter(
    (t) => t.columna === 'PAGADA' && (t.dias_sin_recibir ?? 0) > 7,
  )

  return (
    <>
      <PageHeader
        title="Compras"
        description="Cada tarjeta es una compra. Avanza de un panel al siguiente y no se salta pasos."
        actions={
          <Link to="/app/compras/nuevo">
            <Button icon={<Plus />}>Nuevo pedido</Button>
          </Link>
        }
      />

      {enRiesgo.length > 0 ? (
        <div className="border-warning/30 bg-warning-soft mb-4 flex items-start gap-2.5 rounded-[6px] border p-3.5">
          <AlertTriangle className="text-warning mt-px size-[18px] shrink-0" />
          <p className="text-ink/80 text-sm">
            <strong className="font-semibold">
              {enRiesgo.length} compra{enRiesgo.length === 1 ? '' : 's'} pagada
              {enRiesgo.length === 1 ? '' : 's'} sin recibir
            </strong>{' '}
            desde hace más de una semana, por{' '}
            {dolares(enRiesgo.reduce((s, t) => s + Number(t.total_usd ?? 0), 0))}. Ese dinero
            ya salió de la empresa.
          </p>
        </div>
      ) : null}

      {isPending ? <Cargando texto="Cargando el tablero…" /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Vacio
          icono={<ClipboardList />}
          titulo="Todavía no hay compras"
          descripcion="Un pedido arranca cuando alguien necesita algo: un repuesto, combustible, un servicio. Créalo y el tablero se llena solo."
          accion={
            <Link to="/app/compras/nuevo">
              <Button icon={<Plus />}>Crear el primer pedido</Button>
            </Link>
          }
        />
      ) : null}

      {data && data.length > 0 ? (
        // Los paneles se reparten en rejilla en vez de en una fila que se
        // desplaza: las siete etapas caben en dos filas y se ven todas a la
        // vez, incluidas las vacías. Que una etapa esté vacía también es
        // información.
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {COLUMNAS.map((c) => (
            <Panel key={c.clave} definicion={c} tarjetas={porColumna.get(c.clave) ?? []} />
          ))}
        </div>
      ) : null}

      <QueHacer grupos={QUE_HACER} />
    </>
  )
}
