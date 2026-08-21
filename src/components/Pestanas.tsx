import { NavLink, useLocation } from 'react-router'
import { cn } from '@/lib/cn'

/*
  PESTAÑAS PARA LO QUE ANTES ERAN ENTRADAS DEL MENÚ

  Christopher pidió reducir elementos y pasos. Inventario tenía ocho entradas
  en el riel y ahora tiene cuatro: existencias, catálogo y movimientos son tres
  miradas al mismo material —cuánto hay, qué puede haber, y qué le pasó— y
  viven bajo una sola entrada, con estas pestañas para pasar de una a otra.

  Siguen siendo rutas de verdad y no estado interno. Tres motivos:

    - La dirección se comparte. «Mírate los movimientos del taller» es un
      enlace, no unas instrucciones para llegar.
    - El botón de atrás del navegador hace lo que la gente espera.
    - Las pantallas no se tocan. Cada una sigue siendo lo que era; esto solo
      les pone un encabezado común.

  Se marca la pestaña por coincidencia exacta o por lo que cuelga de ella, y
  gana la más larga — el mismo criterio que el riel, y por el mismo motivo: sin
  eso, estando en la ficha de un artículo se encenderían dos.
*/

export interface Pestana {
  etiqueta: string
  a: string
}

export function Pestanas({ pestanas }: { pestanas: Pestana[] }) {
  const { pathname } = useLocation()

  const activa = pestanas.reduce<string | null>((mejor, p) => {
    const casa = pathname === p.a || pathname.startsWith(p.a + '/')
    if (!casa) return mejor
    return mejor === null || p.a.length > mejor.length ? p.a : mejor
  }, null)

  return (
    /*
      Se desplaza en horizontal en vez de partirse: cinco pestañas en un
      teléfono no caben, y partidas en dos filas dejan de leerse como una barra
      y pasan a leerse como dos grupos distintos.

      La barra de desplazamiento se esconde. Windows la pinta siempre, ocupe
      falta o no, y con tres pestañas que caben de sobra aparecía una barra
      gris a la derecha que no desplazaba nada. El desplazamiento sigue
      funcionando con el dedo y con la rueda; lo que se quita es el adorno.
    */
    <div className="border-hairline -mx-1 mb-5 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <nav className="flex min-w-max gap-1 px-1">
        {pestanas.map((p) => (
          <NavLink
            key={p.a}
            to={p.a}
            className={cn(
              'relative shrink-0 px-3 py-2.5 text-sm transition-colors',
              activa === p.a
                ? 'text-royal-700 dark:text-royal-300 font-medium'
                : 'text-ink/55 hover:text-ink/85',
            )}
          >
            {p.etiqueta}
            {activa === p.a ? (
              <span className="bg-royal-600 absolute inset-x-2 -bottom-px h-0.5 rounded-full" />
            ) : null}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

/** Las tres miradas al mismo material. */
export const PESTANAS_MATERIAL: Pestana[] = [
  { etiqueta: 'Existencias', a: '/app/inventario/existencias' },
  { etiqueta: 'Catálogo', a: '/app/inventario/articulos' },
  { etiqueta: 'Movimientos', a: '/app/inventario/movimientos' },
]

/** Dónde se guarda: un taller es un almacén con máquinas dentro. */
export const PESTANAS_SITIOS: Pestana[] = [
  { etiqueta: 'Almacenes y patios', a: '/app/inventario/almacenes' },
  { etiqueta: 'Talleres', a: '/app/inventario/talleres' },
]

/** Quién trabaja aquí, y cuánto cobra su cargo. */
export const PESTANAS_PERSONAL: Pestana[] = [
  { etiqueta: 'Personal', a: '/app/nomina/personal' },
  { etiqueta: 'Tabulador de cargos', a: '/app/nomina/tabulador' },
]

/** El período, en el orden en que se hace. */
export const PESTANAS_PERIODO: Pestana[] = [
  { etiqueta: '1 · Novedades', a: '/app/nomina/asistencia' },
  { etiqueta: '2 · Procesar', a: '/app/nomina/procesos' },
  { etiqueta: '3 · Recibos', a: '/app/nomina/recibos' },
]

/** Lo que no cambia cada quincena. */
export const PESTANAS_REGLAS: Pestana[] = [
  { etiqueta: 'Prestaciones sociales', a: '/app/nomina/prestaciones' },
  { etiqueta: 'Parámetros de nómina', a: '/app/nomina/parametros' },
]
