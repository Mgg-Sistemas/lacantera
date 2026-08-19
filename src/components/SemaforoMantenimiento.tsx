import { AlertTriangle, CircleCheck, OctagonAlert, TriangleAlert } from 'lucide-react'
import type { Semaforo } from '@/lib/api/maquinaria'
import { cn } from '@/lib/cn'

/**
 * En qué punto de su mantenimiento está una máquina.
 *
 * POR QUÉ ESTE SÍ GRITA
 *
 * El resto del sistema está construido sobre lo contrario: la pantalla en
 * calma, el color reservado para lo que reclama atención. Aquí se rompe esa
 * moderación a propósito, y por instrucción de la dirección de Sistemas: una
 * máquina que pasa su tope sin mantenimiento no es un aviso administrativo, es
 * un riesgo mecánico y de seguridad. Cuesta un motor, o cuesta a alguien.
 *
 * Un chip discreto se aprende a ignorar en una semana. Por eso el estado
 * bloqueante ocupa, tiene color de peligro y titila —que es literalmente lo que
 * pedía el encargo original: «una alerta bloqueante o titilante».
 *
 * LOS CUATRO ESTADOS NO SE VEN IGUAL DE FUERTE, Y ES EL PUNTO
 *
 *   OK          neutro, casi invisible. Lo normal no debe llamar.
 *   AVISO       ámbar sobrio. Hay que ir pensando en programarlo.
 *   ALARMA      naranja fuerte. Quedan pocas horas.
 *   BLOQUEANTE  rojo, titilando. Se pasó: no debería estar trabajando.
 *
 * Si los cuatro se vieran parecido, el cuarto no significaría nada.
 *
 * TITILA, PERO NO PARA QUIEN PIDIÓ QUIETUD
 *
 * El parpadeo va bajo `motion-safe`. Con movimiento reducido se queda fijo en
 * rojo, que sigue siendo lo más visible de la pantalla: la advertencia no se
 * pierde, solo deja de moverse. Un parpadeo es de los efectos que peor sientan
 * a quien es sensible al movimiento, y no hay motivo para elegir entre avisar y
 * marear.
 */

const ESTILOS: Record<
  Semaforo,
  { etiqueta: string; clases: string; icono: typeof CircleCheck; titulo: string }
> = {
  OK: {
    etiqueta: 'Al día',
    clases: 'border-hairline bg-surface text-ink/55',
    icono: CircleCheck,
    titulo: 'Dentro de su intervalo de mantenimiento.',
  },
  AVISO: {
    etiqueta: 'Programar',
    clases: 'border-warning/40 bg-warning-soft text-warning',
    icono: TriangleAlert,
    titulo: 'Pasó el primer umbral. Conviene programar el mantenimiento.',
  },
  ALARMA: {
    etiqueta: 'Urgente',
    clases: 'border-safety/50 bg-safety-soft text-safety font-semibold',
    icono: AlertTriangle,
    titulo: 'Quedan pocas horas para el tope.',
  },
  BLOQUEANTE: {
    etiqueta: 'Pasó el tope',
    clases: 'border-danger bg-danger text-white font-semibold shadow-[0_0_0_3px_rgba(179,38,30,0.18)]',
    icono: OctagonAlert,
    titulo: 'Superó su tope de horas. No debería seguir trabajando sin mantenimiento.',
  },
}

export function SemaforoMantenimiento({
  estado,
  horas,
  tope,
  className,
}: {
  estado: Semaforo
  /** Horas desde el último mantenimiento. Sin esto solo se ve la etiqueta. */
  horas?: number
  tope?: number
  className?: string
}) {
  const e = ESTILOS[estado]
  const Icono = e.icono
  const bloquea = estado === 'BLOQUEANTE'

  return (
    <span
      title={e.titulo}
      role={bloquea ? 'alert' : undefined}
      className={cn(
        'text-2xs inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
        e.clases,
        // El parpadeo solo en el estado que lo justifica, y solo para quien no
        // pidió quietud. Sin movimiento se queda rojo fijo, que ya destaca.
        bloquea && 'motion-safe:animate-pulse',
        className,
      )}
    >
      <Icono className="size-3.5 shrink-0" aria-hidden="true" />
      <span>{e.etiqueta}</span>
      {horas !== undefined ? (
        <span className="tabular opacity-90">
          {Math.round(horas)}
          {tope !== undefined ? ` / ${Math.round(tope)} h` : ' h'}
        </span>
      ) : null}
    </span>
  )
}

/**
 * El aviso grande, para cuando hay máquinas pasadas de tope.
 *
 * Va arriba del tablero y ocupa: es la única cosa de este módulo que puede
 * costar un motor, así que no comparte fila con nada.
 */
export function AvisoBloqueantes({ cuantas }: { cuantas: number }) {
  if (cuantas === 0) return null

  return (
    <div
      role="alert"
      className={cn(
        'border-danger bg-danger-soft mb-6 flex items-start gap-3 rounded-[6px] border-2 p-4',
        'motion-safe:animate-pulse',
      )}
    >
      <OctagonAlert className="text-danger mt-0.5 size-6 shrink-0" aria-hidden="true" />
      <div>
        <p className="text-danger text-base font-semibold">
          {cuantas === 1
            ? 'Hay una máquina que pasó su tope de mantenimiento'
            : `Hay ${cuantas} máquinas que pasaron su tope de mantenimiento`}
        </p>
        <p className="text-ink/70 mt-1 text-sm leading-relaxed">
          Seguir operándolas sin mantenimiento arriesga el equipo y a quien lo maneja. Hay que
          detenerlas o registrar el mantenimiento hecho.
        </p>
      </div>
    </div>
  )
}
