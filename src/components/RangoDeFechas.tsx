import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { SIN_RANGO } from '@/components/rango'
import type { Rango } from '@/components/rango'

/*
  DESDE CUÁNDO Y HASTA CUÁNDO

  Nos pidieron poder filtrar los movimientos por fecha. Lo que hace útil un
  filtro de fechas no son las dos casillas: son los atajos. Nadie que pregunta
  «¿cuánto se gastó este mes?» quiere teclear dos fechas — quiere pulsar «este
  mes». Las casillas quedan para el caso raro, que existe: el corte del 15 al
  30, el trimestre que pide el contador.

  Los atajos son los que se usan en una administración: hoy, esta semana, este
  mes, el mes pasado. «Este año» no está porque el libro no llega tan atrás con
  el tope de doscientos renglones, y ofrecerlo daría una respuesta incompleta
  sin decirlo.

  Las fechas se arman en horario de Caracas y no en UTC: a las ocho de la noche
  en Venezuela, `new Date().toISOString()` ya dice mañana, y el filtro de «hoy»
  se saltaría todo lo del día.
*/

/** El día de hoy en Caracas, como AAAA-MM-DD. */
function hoyAqui(): Date {
  const ahora = new Date()
  // Se pide la fecha ya formateada en la zona: restar horas a mano falla dos
  // veces al año en los países que cambian la hora, y aunque Venezuela no la
  // cambie, este código lo va a leer alguien que no lo sabe.
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora)
  return new Date(partes + 'T00:00:00')
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

function atajos(): Array<{ etiqueta: string; rango: Rango }> {
  const hoy = hoyAqui()

  const lunes = new Date(hoy)
  // getDay() da 0 el domingo; aquí la semana empieza el lunes, como en la nómina.
  lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7))

  const primeroDeMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const primeroPasado = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  const ultimoPasado = new Date(hoy.getFullYear(), hoy.getMonth(), 0)

  return [
    { etiqueta: 'Hoy', rango: { desde: iso(hoy), hasta: iso(hoy) } },
    { etiqueta: 'Esta semana', rango: { desde: iso(lunes), hasta: iso(hoy) } },
    { etiqueta: 'Este mes', rango: { desde: iso(primeroDeMes), hasta: iso(hoy) } },
    { etiqueta: 'Mes pasado', rango: { desde: iso(primeroPasado), hasta: iso(ultimoPasado) } },
  ]
}

export function RangoDeFechas({
  valor,
  onCambio,
  className,
}: {
  valor: Rango
  onCambio: (r: Rango) => void
  className?: string
}) {
  const puesto = Boolean(valor.desde || valor.hasta)

  return (
    /*
      LOS ATAJOS SE BAJAN SOLOS CUANDO NO CABEN

      Estaban en la tercera columna de la misma fila que las dos casillas, y con
      poco sitio se partian: cuatro pastillas de dos renglones cada una —«Esta /
      semana»— debajo de dos fechas. Se vio en el libro de tesoreria, que ahora
      lleva dos desplegables delante, pero pasaba en cualquier pantalla estrecha.

      Hasta `xl` ocupan una linea entera para ellos, que es lo que miden: cuatro
      atajos mas «quitar fechas» piden unos 380 px y dos casillas de fecha se
      llevan otros 380. En `xl` si hay sitio para las tres cosas seguidas.
    */
    <div className={cn('grid gap-3 sm:grid-cols-[auto_auto] xl:grid-cols-[auto_auto_1fr]', className)}>
      <Input
        label="Desde"
        type="date"
        value={valor.desde}
        max={valor.hasta || undefined}
        onChange={(e) => onCambio({ ...valor, desde: e.target.value })}
      />
      <Input
        label="Hasta"
        type="date"
        value={valor.hasta}
        min={valor.desde || undefined}
        onChange={(e) => onCambio({ ...valor, hasta: e.target.value })}
      />

      <div className="flex flex-wrap items-end gap-2 pb-1 sm:col-span-2 xl:col-span-1">
        {atajos().map((a) => {
          const activo = valor.desde === a.rango.desde && valor.hasta === a.rango.hasta
          return (
            <button
              key={a.etiqueta}
              type="button"
              onClick={() => onCambio(a.rango)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                activo
                  ? 'border-royal-600/40 bg-royal-600/10 text-royal-700 dark:text-royal-300'
                  : 'border-ink/15 text-ink/60 hover:border-ink/30',
              )}
            >
              {a.etiqueta}
            </button>
          )
        })}

        {/* Quitar el filtro tiene que costar un clic. Si no, quien lo pone sin
            querer se queda mirando una lista corta sin entender por qué. */}
        {puesto ? (
          <button
            type="button"
            onClick={() => onCambio(SIN_RANGO)}
            className="text-ink/45 hover:text-ink/70 px-2 py-1 text-xs underline-offset-2 transition-colors hover:underline"
          >
            Quitar fechas
          </button>
        ) : null}
      </div>
    </div>
  )
}
