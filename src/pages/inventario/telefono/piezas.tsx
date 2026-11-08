import { useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { DeQuienSale } from '@/components/DeQuienSale'
import { toast } from '@/lib/avisosFlotantes'
import { copiarAlPortapapeles } from '@/lib/ficha/reporteDiario'
import { num } from '@/lib/ficha/inventarioWhatsapp'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { cn } from '@/lib/cn'
import {
  ETIQUETA_ATAJO,
  fechasMal,
  lineaDe,
  rangoDe,
  sinAcentos,
  type Atajo,
  type LineaDeMaterial,
  type ProductoEnAlmacen,
} from './comun'

/*
  LAS PIEZAS DEL TELÉFONO DEL ALMACENISTA.

  Fase 1a (08/11/2026) las tenía dentro de `Almacen.tsx`; la fase 1b (misma
  fecha) las saca aquí porque salida, traslado, por retornar, reporte e
  históricos también las usan. Son las de MGG (`surt-btn`, `Listo`,
  `CompartirWhatsapp`, `LineasMateriales`) con los componentes y colores de La
  Cantera.
*/

type TonoBoton = 'royal' | 'success' | 'warning' | 'info'

const TONOS_BOTON: Record<TonoBoton, string> = {
  royal: 'bg-royal-600/10 border-royal-600/30',
  success: 'bg-success-soft border-success/25',
  warning: 'bg-warning-soft border-warning/35',
  info: 'bg-info-soft border-info/25',
}

/** Los botones grandes de MGG (`surt-btn`): icono, título y una línea chica. */
export function BotonGrande({
  tono,
  icono,
  titulo,
  sub,
  className,
  disabled,
  onClick,
}: {
  tono: TonoBoton
  icono?: string
  titulo: string
  sub: string
  className?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-card flex min-h-[96px] w-full flex-col items-center justify-center gap-1 border p-4 text-center transition-[filter] active:brightness-95 disabled:opacity-50',
        TONOS_BOTON[tono],
        className,
      )}
    >
      {icono ? (
        <span className="text-2xl leading-none" aria-hidden>
          {icono}
        </span>
      ) : null}
      <span className="text-ink/90 text-base font-semibold">{titulo}</span>
      <small className="text-ink/55 text-xs leading-snug">{sub}</small>
    </button>
  )
}

export function TituloDePaso({ icono, children }: { icono: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-2xl" aria-hidden>
        {icono}
      </span>
      <strong className="text-lg leading-snug">{children}</strong>
    </div>
  )
}

/** El título de un paso con su «← Volver» a la derecha. */
export function CabeceraDePaso({
  icono,
  titulo,
  onVolver,
}: {
  icono: string
  titulo: ReactNode
  onVolver: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <TituloDePaso icono={icono}>{titulo}</TituloDePaso>
      <Button variant="ghost" size="sm" className="shrink-0" onClick={onVolver}>
        ← Volver
      </Button>
    </div>
  )
}

export function AvisoDeSeñal({ que = 'La entrada' }: { que?: string }) {
  return (
    <p className="border-warning/30 bg-warning-soft text-ink/80 rounded-card border p-3 text-sm">
      Está tardando por la señal.{' '}
      <strong>
        {que} ya se está guardando: no {que.startsWith('El ') ? 'lo' : 'la'} cargue otra vez.
      </strong>
    </p>
  )
}

/** El aviso ámbar de MGG (`surt-alerta`). */
export function Alerta({ children }: { children: ReactNode }) {
  return <p className="border-warning/35 bg-warning-soft text-ink/80 rounded-[6px] border px-3 py-2 text-sm">{children}</p>
}

/* ──────────────────────────────────────── compartir y ✅ listo */

/**
 * MGG `CompartirWhatsapp`: el texto entero a la vista, «📲 Enviar por
 * WhatsApp» (la hoja de compartir del teléfono) y «📋 Copiar». Nada se manda solo.
 */
export function CompartirWhatsapp({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false)

  // En el teléfono, la hoja de compartir del teléfono (como MGG y ModalWhatsappCompra).
  const puedeCompartir =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    window.matchMedia('(pointer: coarse)').matches

  const enviar = async () => {
    if (puedeCompartir) {
      try {
        await navigator.share({ text: texto })
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`, '_blank', 'noopener,noreferrer')
  }

  const copiar = async () => {
    const ok = await copiarAlPortapapeles(texto)
    setCopiado(ok)
    toast(
      ok ? 'Mensaje copiado' : 'No se pudo copiar. Mantén el dedo sobre el texto para copiarlo.',
      ok ? 'success' : 'error',
    )
  }

  return (
    <>
      <pre className="bg-ink/4 text-ink/80 max-h-[50vh] overflow-auto rounded-[6px] p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap select-all">
        {texto}
      </pre>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button size="lg" onClick={() => void enviar()}>
          📲 Enviar por WhatsApp
        </Button>
        <Button size="lg" variant="outline" onClick={() => void copiar()}>
          {copiado ? '✅ Copiado' : '📋 Copiar'}
        </Button>
      </div>
    </>
  )
}

/**
 * MGG `Listo`: lo guardado, su aviso para WhatsApp y la vuelta. «📄 Ver PDF del
 * comprobante» solo cuando hay un papel de aquí que reutilizar (la orden de
 * salida o la nota de traslado).
 */
export function Listo({
  icono = '✅',
  titulo,
  texto,
  aviso,
  pdf,
  volver = '← Volver al inicio',
  onVolver,
}: {
  icono?: string
  titulo: string
  texto: string
  /** Una línea debajo del título: lo que pasa ahora (p. ej. «Por aprobar»). */
  aviso?: ReactNode
  pdf?: { armando: boolean; abrir: () => void }
  volver?: string
  onVolver: () => void
}) {
  return (
    <div className="bg-surface shadow-card mt-4 space-y-4 rounded-[10px] p-4">
      <TituloDePaso icono={icono}>{titulo}</TituloDePaso>
      {aviso ? <Alerta>{aviso}</Alerta> : null}
      <CompartirWhatsapp texto={texto} />
      {pdf ? (
        <Button block size="lg" variant="outline" disabled={pdf.armando} onClick={pdf.abrir}>
          {pdf.armando ? 'Armando el PDF…' : '📄 Ver PDF del comprobante'}
        </Button>
      ) : null}
      <Button block size="lg" variant="ghost" onClick={onVolver}>
        {volver}
      </Button>
    </div>
  )
}

/* ──────────────────────────────────────── fechas */

/** Los atajos y las fechas «Desde» / «Hasta» del reporte y los históricos. */
export function RangoDeFechas({
  atajos,
  desde,
  hasta,
  onCambiar,
}: {
  atajos: Atajo[]
  desde: string
  hasta: string
  onCambiar: (desde: string, hasta: string) => void
}) {
  const hoy = hoyEnCaracas()
  const activo = atajos.find((a) => {
    const r = rangoDe(a)
    return r.desde === desde && r.hasta === hasta
  })
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {atajos.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => {
              const r = rangoDe(a)
              onCambiar(r.desde, r.hasta)
            }}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-medium',
              activo === a ? 'border-royal-600 bg-royal-600/10 text-royal-700' : 'border-hairline bg-surface',
            )}
          >
            {ETIQUETA_ATAJO[a]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Desde" type="date" max={hoy} value={desde} onChange={(e) => onCambiar(e.target.value, hasta)} />
        <Input label="Hasta" type="date" max={hoy} value={hasta} onChange={(e) => onCambiar(desde, e.target.value)} />
      </div>
      {fechasMal(desde, hasta) ? (
        <Alerta>⚠ Revisa las fechas: «desde» no puede ir después de «hasta» ni pasar de hoy.</Alerta>
      ) : null}
    </div>
  )
}

/* ──────────────────────────────────────── materiales de una salida o un traslado */

/** Cuántos candidatos se ofrecen al agregar otro material (MGG). */
const CANDIDATOS = 8

/**
 * MGG `LineasMateriales`: una salida o un traslado lleva varios materiales,
 * cada uno con su cantidad, «No alcanza» o «Quedan», y «＋ Agregar otro
 * material». Lo de aquí: si en el almacén hay material de varios dueños, cada
 * renglón dice de cuál sale (`DeQuienSale`).
 */
export function LineasMateriales({
  lineas,
  productos,
  onCambiar,
}: {
  lineas: LineaDeMaterial[]
  /** Los productos del almacén; solo se ofrecen los que tienen existencia. */
  productos: ProductoEnAlmacen[]
  onCambiar: (l: LineaDeMaterial[]) => void
}) {
  const [buscando, setBuscando] = useState(false)
  const [busca, setBusca] = useState('')

  const candidatos = useMemo(() => {
    const ya = new Set(lineas.map((l) => l.producto.id))
    const q = sinAcentos(busca.trim())
    return productos
      .filter((p) => p.disponible > 0 && !ya.has(p.id))
      .filter((p) => !q || sinAcentos(`${p.nombre} ${p.codigo} ${p.categoria}`).includes(q))
      .slice(0, CANDIDATOS)
  }, [productos, lineas, busca])

  const cambiar = (i: number, cambio: Partial<LineaDeMaterial>) =>
    onCambiar(lineas.map((l, j) => (j === i ? { ...l, ...cambio } : l)))

  return (
    <div className="space-y-2">
      <p className="text-ink/75 text-sm font-medium">Materiales ({lineas.length})</p>
      {lineas.map((l, i) => {
        const p = l.producto
        const c = Number(l.cantidad) || 0
        return (
          <div key={p.id} className="border-hairline rounded-[8px] border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-ink/90 truncate font-medium">{p.nombre}</p>
                <p className="text-ink/55 text-xs">
                  {p.codigo} · hay {num(p.disponible)} {p.unidad}
                </p>
              </div>
              {lineas.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Quitar ${p.nombre}`}
                  className="text-ink/45 hover:text-danger shrink-0 px-2 text-lg leading-none"
                  onClick={() => onCambiar(lineas.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              ) : null}
            </div>
            <Input
              className="mt-2"
              label={`Cantidad (${p.unidad})`}
              ocultarEtiqueta
              type="number"
              inputMode="decimal"
              placeholder={`Cantidad (${p.unidad})`}
              value={l.cantidad}
              onChange={(e) => cambiar(i, { cantidad: e.target.value })}
            />
            {c > p.disponible ? (
              <p className="text-danger mt-1 text-sm">
                No alcanza: hay {num(p.disponible)} {p.unidad}.
              </p>
            ) : c > 0 ? (
              <p className="text-ink/55 mt-1 text-xs">
                Quedan {num(p.disponible - c)} {p.unidad}.
              </p>
            ) : null}
            {p.duenos.length > 1 ? (
              <div className="mt-2">
                <DeQuienSale duenos={p.duenos} valor={l.propietario} onCambio={(v) => cambiar(i, { propietario: v })} />
              </div>
            ) : null}
          </div>
        )
      })}

      {buscando ? (
        <div className="border-hairline space-y-2 rounded-[8px] border border-dashed p-3">
          <Input
            label="Buscar el material"
            ocultarEtiqueta
            sinNormalizar
            type="search"
            autoFocus
            autoComplete="off"
            placeholder="🔍 Buscar el material…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {candidatos.length === 0 ? (
            <p className="text-ink/55 text-sm">No hay más materiales con existencia que coincidan.</p>
          ) : (
            candidatos.map((p) => (
              <button
                key={p.id}
                type="button"
                className="bg-surface shadow-card flex w-full items-center gap-3 rounded-[8px] p-2.5 text-left"
                onClick={() => {
                  onCambiar([...lineas, lineaDe(p)])
                  setBuscando(false)
                  setBusca('')
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="text-ink/90 block truncate text-sm font-medium">{p.nombre}</span>
                  <span className="text-ink/55 block text-xs">{p.codigo}</span>
                </span>
                <span className="tabular shrink-0 text-sm font-semibold">
                  {num(p.disponible)} <small>{p.unidad}</small>
                </span>
              </button>
            ))
          )}
          <Button
            block
            variant="ghost"
            onClick={() => {
              setBuscando(false)
              setBusca('')
            }}
          >
            Cerrar búsqueda
          </Button>
        </div>
      ) : (
        <Button block variant="outline" onClick={() => setBuscando(true)}>
          ＋ Agregar otro material
        </Button>
      )}
    </div>
  )
}

/** Una fila de un histórico o de la lista de por retornar (MGG `surt-mov`). */
export function FilaDeLista({
  titulo,
  lineas,
  derecha,
  pie,
  disabled,
  onClick,
  children,
}: {
  titulo: string
  lineas: ReactNode[]
  derecha: ReactNode
  pie?: ReactNode
  disabled?: boolean
  onClick?: () => void
  children?: ReactNode
}) {
  const cuerpo = (
    <>
      <span className="text-2xl" aria-hidden>
        📦
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-ink/90 block font-medium">{titulo}</span>
        {lineas.filter(Boolean).map((l, i) => (
          <span key={i} className="text-ink/55 block text-xs leading-snug">
            {l}
          </span>
        ))}
        {pie ? <span className="text-ink/70 mt-0.5 block text-xs">{pie}</span> : null}
      </span>
      <span className="tabular shrink-0 text-right font-semibold whitespace-nowrap">{derecha}</span>
    </>
  )
  return (
    <div className="bg-surface shadow-card rounded-[10px] p-3">
      {onClick ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onClick}
          className="flex w-full items-start gap-3 text-left disabled:cursor-default"
        >
          {cuerpo}
        </button>
      ) : (
        <div className="flex w-full items-start gap-3">{cuerpo}</div>
      )}
      {children ? <div className="mt-2 flex flex-wrap gap-2">{children}</div> : null}
    </div>
  )
}
