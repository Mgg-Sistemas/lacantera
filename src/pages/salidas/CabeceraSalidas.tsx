import { Link } from 'react-router'
import { cn } from '@/lib/cn'

/*
  LA CABECERA DE SALIDAS Y TRASLADOS COMO MGG (FASE 5), 08/11/2026.

  MGG tiene una sola pantalla con dos interruptores: «↘ Salidas / ↔ Traslados»
  y, debajo, «🗂 Solicitudes / 📚 Histórico / 📜 Historial / 📊 Resumen». Aquí
  el menú «Salidas y traslados» conserva sus tres rutas (Historial, Salidas y
  Traslados), así que cada botón es un enlace a la ruta que ya existía, con la
  sub-vista en la dirección (`?vista=historico`, `?ver=SALIDAS`…): se comparte,
  y el botón de atrás hace lo que se espera.

  «📊 Resumen» es solo de Salidas, como en MGG. «🔧 Salidas temporales» no se
  copia: aquí eso lo hacen Asignaciones y Talleres.
*/

export type AlcanceSalidas = 'salidas' | 'traslados'
export type VistaSalidas = 'solicitudes' | 'historico' | 'historial' | 'resumen'

function enlace(alcance: AlcanceSalidas, vista: VistaSalidas): string {
  if (vista === 'historial') return `/app/salidas?ver=${alcance === 'salidas' ? 'SALIDAS' : 'TRASLADOS'}`
  const base = alcance === 'salidas' ? '/app/salidas/solicitudes' : '/app/salidas/traslados'
  if (vista === 'historico') return `${base}?vista=historico`
  if (vista === 'resumen' && alcance === 'salidas') return `${base}?vista=resumen`
  return base
}

function Boton({ a, activo, title, children }: { a: string; activo: boolean; title?: string; children: string }) {
  return (
    <Link
      to={a}
      role="tab"
      aria-selected={activo}
      title={title}
      className={cn(
        'shrink-0 rounded-[8px] px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
        activo ? 'bg-royal-600/12 text-royal-700 dark:text-royal-300' : 'text-ink/60 hover:bg-ink/5',
      )}
    >
      {children}
    </Link>
  )
}

export function CabeceraSalidas({
  alcance,
  vista,
}: {
  /** Nulo en el Historial que enseña salidas y traslados juntos. */
  alcance: AlcanceSalidas | null
  vista: VistaSalidas
}) {
  // Al cambiar de Salidas a Traslados se queda en la misma sub-vista, salvo el
  // Resumen, que solo existe en Salidas (MGG).
  const vistaAl = (destino: AlcanceSalidas): VistaSalidas =>
    destino === 'traslados' && vista === 'resumen' ? 'solicitudes' : vista
  const alcanceDeVistas: AlcanceSalidas = alcance ?? 'salidas'

  return (
    <div className="mb-4 space-y-2">
      <div
        role="tablist"
        aria-label="Tipo de operación"
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Boton a={enlace('salidas', vistaAl('salidas'))} activo={alcance === 'salidas'}>
          ↘ Salidas
        </Boton>
        <Boton a={enlace('traslados', vistaAl('traslados'))} activo={alcance === 'traslados'}>
          ↔ Traslados
        </Boton>
      </div>
      <div
        role="tablist"
        aria-label="Vista"
        className="border-hairline -mx-1 flex gap-1.5 overflow-x-auto border-b px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Boton a={enlace(alcanceDeVistas, 'solicitudes')} activo={vista === 'solicitudes'}>
          🗂 Solicitudes
        </Boton>
        <Boton
          a={enlace(alcanceDeVistas, 'historico')}
          activo={vista === 'historico'}
          title="Todas las solicitudes, con filtros y quién hizo cada cosa"
        >
          📚 Histórico
        </Boton>
        <Boton
          a={alcance ? enlace(alcance, 'historial') : '/app/salidas'}
          activo={vista === 'historial'}
          title="Lo que ya movió existencia: salidas entregadas y traslados enviados"
        >
          📜 Historial
        </Boton>
        {alcance !== 'traslados' ? (
          <Boton
            a={enlace('salidas', 'resumen')}
            activo={vista === 'resumen'}
            title="Gasto de material por destino o por área"
          >
            📊 Resumen
          </Boton>
        ) : null}
      </div>
    </div>
  )
}
