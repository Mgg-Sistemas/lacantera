import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { Chip } from '@/components/ui/Chip'
import { FotosDeCarga } from '@/components/FotosDeCarga'
import { cn } from '@/lib/cn'
import { fechaHora } from '@/lib/formato'
import { ESTADO_DE_SOLICITUD, type SolicitudDeSalida } from '@/lib/api/salidas'
import {
  ESTADO_TRASLADO,
  FORMA_DE_TRASLADO,
  formaDelTraslado,
  queFaltaAlTraslado,
  type Traslado,
} from '@/lib/api/inventario'
import {
  cantidadDe,
  cantidadLegible,
  historialDeSolicitud,
  historialDeTraslado,
  materialDe,
  type PasoDelHistorial,
  type TonoColumna,
} from './tableroSalidas'

/*
  TARJETAS Y DETALLE DE SALIDAS Y TRASLADOS COMO MGG (FASE 5), 08/11/2026.

  La tarjeta copia el orden de MGG: número arriba (aquí el SS de la solicitud,
  y a la derecha la NS de la nota cuando ya se entregó), quién la hizo, el
  material, cuánto y de dónde, para quién en verde, la fecha y, si se cerró
  sin entregar, el motivo en rojo. MGG lleva además un «N° 007» por usuario:
  aquí no existe esa columna y no se inventa.

  El detalle es la «Solicitud {numero}» de MGG: los datos, los materiales y el
  historial. Los botones NO viven aquí: los pone la pantalla, que son los
  mismos de siempre con su lógica (Aprobar, No aprobar, Entregar material,
  Cancelar, Reporte…).
*/

const PUNTO: Record<TonoColumna, string> = {
  warning: 'bg-warning',
  royal: 'bg-royal-600',
  success: 'bg-success',
  danger: 'bg-danger',
  neutral: 'bg-ink/30',
}

const CLASE_TARJETA =
  'bg-surface shadow-card hover:border-royal-600/40 w-full cursor-pointer rounded-[8px] border border-transparent p-3 text-left text-sm transition-colors'

export function TarjetaSalida({
  s,
  hizo,
  paraQuien,
  onAbrir,
}: {
  s: SolicitudDeSalida
  hizo: string
  paraQuien: string
  onAbrir: () => void
}) {
  const cerrada = s.estado === 'RECHAZADA' || s.estado === 'CANCELADA'
  return (
    <button type="button" className={CLASE_TARJETA} onClick={onAbrir}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-royal-700 dark:text-royal-300 font-mono text-sm font-bold" title="Número de la solicitud">
          {s.numero}
        </span>
        {s.nota_salida ? (
          <span className="text-ink/50 font-mono text-[11px]" title="Nota de salida">
            {s.nota_salida}
          </span>
        ) : null}
      </div>
      <div className="text-ink/50 text-[11px]">👤 {hizo}</div>
      <div className="text-ink/90 mt-0.5 font-semibold">{materialDe(s)}</div>
      <div className="text-ink/55 text-xs">
        {cantidadDe(s)} · {s.almacen?.nombre ?? '—'}
      </div>
      <div className="text-success mt-1 text-xs font-semibold">👤 {paraQuien}</div>
      <div className="text-ink/45 mt-0.5 text-[11px]">{fechaHora(s.pedida_en)}</div>
      {cerrada ? (
        <div className="text-danger mt-1 text-[11px] font-semibold" title="Motivo">
          ✖ {s.estado === 'RECHAZADA' ? 'No aprobada' : 'Cancelada'}
          {s.cierre_motivo ? `: ${s.cierre_motivo}` : ' sin motivo escrito'}
        </div>
      ) : null}
    </button>
  )
}

export function TarjetaTraslado({ t, onAbrir }: { t: Traslado; onAbrir: () => void }) {
  const falta = queFaltaAlTraslado(t)
  return (
    <button type="button" className={CLASE_TARJETA} onClick={onAbrir}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-royal-700 dark:text-royal-300 font-mono text-sm font-bold" title="Número del traslado">
          {t.numero}
        </span>
        <span className="text-ink/50 text-[11px]">{FORMA_DE_TRASLADO[formaDelTraslado(t)].enLaLista}</span>
      </div>
      <div className="text-ink/50 text-[11px]">👤 {t.solicitado_por_nombre ?? '—'}</div>
      <div className="text-ink/90 mt-0.5 font-semibold">{t.articulo ?? '—'}</div>
      <div className="text-ink/55 flex flex-wrap items-center gap-1 text-xs">
        {cantidadLegible(t.cantidad)} {t.unidad ?? ''} · {t.origen ?? '—'}
        <ArrowRight className="text-ink/35 size-3" aria-hidden="true" />
        {t.destino ?? '—'}
      </div>
      {falta ? <div className="text-warning mt-1 text-[11px]">{falta}</div> : null}
      <div className="text-ink/45 mt-0.5 text-[11px]">{fechaHora(t.solicitado_en)}</div>
      {t.estado === 'CANCELADA' ? (
        <div className="text-danger mt-1 text-[11px] font-semibold" title="Motivo de la cancelación">
          ✖ {t.motivo_cancelacion || 'Cancelado sin motivo escrito'}
        </div>
      ) : null}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Detalle                                                             */
/* ------------------------------------------------------------------ */

function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="border-hairline grid grid-cols-[minmax(7rem,9rem)_1fr] gap-3 border-b py-2 text-sm last:border-0">
      <dt className="text-ink/50">{etiqueta}</dt>
      <dd className="text-ink/85 min-w-0 break-words">{children}</dd>
    </div>
  )
}

function LineaDeTiempo({ pasos }: { pasos: PasoDelHistorial[] }) {
  return (
    <div className="mt-5">
      <h3 className="text-ink/70 mb-2 text-sm font-semibold">📜 Historial</h3>
      <ol className="border-hairline space-y-3 border-l pl-4">
        {pasos.map((p, i) => (
          <li key={i} className="relative">
            <span
              className={cn('absolute top-1.5 -left-[21px] size-2.5 rounded-full', PUNTO[p.tono])}
              aria-hidden="true"
            />
            <p className="text-ink/85 text-sm font-medium">{p.evento}</p>
            <p className="text-ink/50 text-xs">
              {[p.cuando ? fechaHora(p.cuando) : null, p.quien].filter(Boolean).join(' · ') || '—'}
            </p>
            {p.detalle ? <p className="text-ink/60 mt-0.5 text-xs italic">{p.detalle}</p> : null}
          </li>
        ))}
      </ol>
    </div>
  )
}

export function DetalleSolicitud({
  s,
  nombreDe,
  paraQuien,
  aviso,
  puedeAnadirFotos,
}: {
  s: SolicitudDeSalida
  nombreDe: (uid: string | null) => string
  paraQuien: string
  /** Lo que falta y a quién le toca, el mismo texto de la lista. */
  aviso: string | null
  puedeAnadirFotos: boolean
}) {
  const estado = ESTADO_DE_SOLICITUD[s.estado]
  return (
    <div>
      <dl>
        <Fila etiqueta="Tipo">Salida de material</Fila>
        <Fila etiqueta="Estado">
          <Chip tone={estado.tono}>{estado.texto}</Chip>
        </Fila>
        <Fila etiqueta="Almacén origen">{s.almacen?.nombre ?? '—'}</Fila>
        <Fila etiqueta="Dirigido a">{paraQuien}</Fila>
        <Fila etiqueta="Motivo">{s.motivo || '—'}</Fila>
        {s.vehiculo ? <Fila etiqueta="Vehículo">{s.vehiculo}</Fila> : null}
        {s.recibio_nombre ? (
          <Fila etiqueta="Retira">
            {s.recibio_nombre}
            {s.recibio_cedula ? ` · C.I. ${s.recibio_cedula}` : ''}
          </Fila>
        ) : null}
        <Fila etiqueta="Creada">
          {fechaHora(s.pedida_en)} · {nombreDe(s.pedida_por)}
        </Fila>
        {s.nota_salida ? (
          <Fila etiqueta="Nota de salida">
            <span className="font-mono">{s.nota_salida}</span>
          </Fila>
        ) : null}
        {s.cierre_motivo ? (
          <Fila etiqueta={s.estado === 'RECHAZADA' ? 'Por qué no se aprobó' : 'Motivo de cancelación'}>
            {s.cierre_motivo}
          </Fila>
        ) : null}
      </dl>

      <h3 className="text-ink/70 mt-4 mb-2 text-sm font-semibold">Materiales</h3>
      <div className="border-hairline overflow-x-auto rounded-[8px] border">
        <table className="w-full min-w-[22rem] text-sm">
          <thead>
            <tr className="text-ink/45 border-hairline border-b text-left text-xs">
              <th className="px-3 py-2 font-medium">Artículo</th>
              <th className="px-3 py-2 text-right font-medium">Cantidad</th>
              <th className="px-3 py-2 font-medium">Dueño</th>
            </tr>
          </thead>
          <tbody>
            {(s.renglones ?? []).map((r) => (
              <tr key={r.id} className="border-hairline border-b last:border-0">
                <td className="text-ink/85 px-3 py-2">
                  {r.articulo?.nombre ?? '—'}
                  {r.articulo?.codigo ? (
                    <span className="text-ink/40 block font-mono text-[11px]">{r.articulo.codigo}</span>
                  ) : null}
                </td>
                <td className="tabular text-ink/85 px-3 py-2 text-right whitespace-nowrap">
                  {cantidadLegible(r.cantidad)} {r.articulo?.unidad ?? ''}
                </td>
                <td className="text-ink/60 px-3 py-2">{r.propietario ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {aviso ? <p className="text-warning mt-3 text-xs">{aviso}</p> : null}

      <LineaDeTiempo pasos={historialDeSolicitud(s, nombreDe)} />

      <div className="mt-4">
        <FotosDeCarga origen="SALIDA" referencia={s.numero} puedeAnadir={puedeAnadirFotos} />
      </div>
    </div>
  )
}

export function DetalleTraslado({ t }: { t: Traslado }) {
  const estado = ESTADO_TRASLADO[t.estado]
  const falta = queFaltaAlTraslado(t)
  return (
    <div>
      <dl>
        <Fila etiqueta="Tipo">Traslado de material · {FORMA_DE_TRASLADO[formaDelTraslado(t)].enLaLista}</Fila>
        <Fila etiqueta="Estado">
          <Chip tone={estado.tono}>{estado.texto}</Chip>
        </Fila>
        <Fila etiqueta="Artículo">
          {t.articulo ?? '—'}
          {t.articulo_codigo ? <span className="text-ink/40 block font-mono text-[11px]">{t.articulo_codigo}</span> : null}
        </Fila>
        <Fila etiqueta="Cantidad">
          {cantidadLegible(t.cantidad)} {t.unidad ?? ''}
        </Fila>
        <Fila etiqueta="Origen → Destino">
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {t.origen ?? '—'}
            <ArrowRight className="text-ink/35 size-3.5" aria-hidden="true" />
            {t.destino ?? '—'}
          </span>
        </Fila>
        {t.propietario ? <Fila etiqueta="Dueño">{t.propietario}</Fila> : null}
        <Fila etiqueta="Motivo">{t.motivo || '—'}</Fila>
        {t.motivo_cancelacion ? <Fila etiqueta="Motivo de cancelación">{t.motivo_cancelacion}</Fila> : null}
      </dl>
      {falta ? <p className="text-warning mt-3 text-xs">{falta}</p> : null}
      <LineaDeTiempo pasos={historialDeTraslado(t)} />
    </div>
  )
}
