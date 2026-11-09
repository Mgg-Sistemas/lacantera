import { Chip } from '@/components/ui/Chip'
import { cn } from '@/lib/cn'
import { n, type TanqueGt } from '@/lib/combustible/tipos'
import { iconoTanque, lt, usd, type TotalesGrupo } from './comun'
import { BarraNivel } from './piezas'

/*
  LOS BANNERS Y LAS TARJETAS DE LOS TANQUES (Golden Touch, ResumenCombustible,
  GrupoTanques y TanqueCard).

  Golden Touch partía el total en «Combustible disponible» y «Los Brasileros».
  Aquí la partición es la de la dueña (09/11/2026): el combustible con costo
  (CMB-TAN, el que recibe las compras) y el combustible inicial que no costó
  nada (CMB-INI). Sumarlos daría una tasa ponderada que no es la de ninguno,
  por eso van en dos banners. En el de sin costo no se dice «Tasa $0,00»: se
  dice «sin costo», que es lo que es.
*/

function Gota() {
  return (
    <svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true" className="shrink-0">
      <path d="M7 0 C7 0 0 8 0 12 a7 7 0 0 0 14 0 C14 8 7 0 7 0 Z" className="fill-ink/85" />
    </svg>
  )
}

export function ResumenCombustible({
  titulo,
  totales,
  veValor,
  sinCosto = false,
}: {
  titulo: string
  totales: TotalesGrupo
  veValor: boolean
  sinCosto?: boolean
}) {
  return (
    <div className="border-royal-600 from-canvas to-surface rounded-card shadow-card border-2 bg-gradient-to-br p-5">
      <p className="text-ink/80 flex items-center gap-1.5 text-sm font-semibold">
        <Gota />
        {titulo}
      </p>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="tabular text-royal-700 dark:text-royal-300 text-3xl font-extrabold">
          {lt(totales.litros)} <span className="text-base font-medium">ltrs</span>
        </p>
        <p className="text-ink/55 text-sm">
          disponibles en <strong className="text-ink/80">{totales.count}</strong> tanque
          {totales.count === 1 ? '' : 's'}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
        {sinCosto ? (
          <div>
            <p className="text-ink/50 text-xs">Costo</p>
            <p className="text-ink/80 text-lg font-semibold">sin costo</p>
          </div>
        ) : veValor ? (
          <>
            <div>
              <p className="text-ink/50 text-xs">Valor total del combustible</p>
              <p className="tabular text-success text-xl font-bold">{usd(totales.valor)}</p>
            </div>
            <div>
              <p className="text-ink/50 text-xs">Tasa promedio (ponderada por litros)</p>
              <p className="tabular text-ink/90 text-xl font-bold">
                {usd(totales.tasa)} <span className="text-sm font-medium">/ltrs</span>
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

export function TanqueCard({
  t,
  veValor,
  puedeEditar,
  activo,
  onClick,
  onEdit,
}: {
  t: TanqueGt
  veValor: boolean
  puedeEditar: boolean
  activo?: boolean
  onClick?: () => void
  onEdit?: () => void
}) {
  const cap = n(t.capacidad_litros)
  const capCalc = n(t.capacidad_calculada_litros)
  const disp = n(t.saldo_litros)
  const pct = cap > 0 ? (disp / cap) * 100 : 0
  const clickable = !!onClick

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') onClick?.()
            }
          : undefined
      }
      className={cn(
        'bg-surface rounded-card shadow-card min-w-0 p-4 text-left',
        activo ? 'border-royal-600 border-2' : 'border-hairline border',
        clickable && 'hover:shadow-card-hover cursor-pointer transition-shadow',
        !t.activo && 'opacity-55',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-ink/85 min-w-0 truncate text-sm font-semibold">
          {iconoTanque(t)} {t.nombre}
        </p>
        <span className="inline-flex shrink-0 items-center gap-1">
          {t.es_bidon ? (
            <Chip title="Bidón para consumo en campo (sin saldo)">bidón</Chip>
          ) : t.es_movil ? (
            <Chip title="Tanque móvil">móvil</Chip>
          ) : null}
          {t.sin_costo ? <Chip tone="info">sin costo</Chip> : null}
          {!t.activo ? <Chip>inactivo</Chip> : null}
          {puedeEditar && onEdit ? (
            <button
              type="button"
              title="Editar tanque"
              onClick={(e) => {
                e.stopPropagation()
                onEdit()
              }}
              className="text-ink/55 hover:bg-ink/6 hover:text-ink/85 rounded-[6px] px-1.5 py-0.5 text-sm"
            >
              ✎
            </button>
          ) : null}
        </span>
      </div>
      <p className="tabular text-ink/90 mt-1 text-2xl font-extrabold">
        {lt(disp)} <span className="text-sm font-medium">ltrs</span>
      </p>
      <BarraNivel pct={pct} />
      <p className="text-ink/55 text-xs">
        {t.es_bidon ? (
          'Salida directa · Sin saldo en sistema'
        ) : (
          <>
            Cap. {lt(cap)} ltrs
            {capCalc > 0 ? (
              <>
                {' '}
                · calc. <span className="tabular">{lt(capCalc)}</span>
              </>
            ) : null}
            {t.sin_costo ? (
              ' · sin costo'
            ) : veValor && t.tasa_usd_litro != null ? (
              <>
                {' '}
                · Tasa <strong className="tabular text-ink/75">{usd(t.tasa_usd_litro)}</strong>/ltrs
              </>
            ) : null}
          </>
        )}
      </p>
      <p className="text-ink/50 text-2xs mt-1">
        ↓{lt(t.entradas_litros)} · ⛽{lt(t.usos_litros)} · ↔{lt(t.traslados_litros)} ltrs
      </p>
    </div>
  )
}
