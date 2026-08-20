import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  /** Una línea que sitúa la pantalla. No repite el título. */
  description?: string
  /**
   * El módulo al que pertenece la pantalla, en versalitas sobre el título.
   *
   * Opcional a propósito: sin él la cabecera se comporta como antes, así que
   * las pantallas que no lo pasen no cambian de sitio nada.
   */
  eyebrow?: string
  actions?: ReactNode
}

/**
 * La cabecera de cada pantalla.
 *
 * Es la pieza que más veces se ve del sistema —una vez por pantalla, cincuenta
 * pantallas— y por eso es donde más rinde poner la identidad de la casa.
 *
 * El filete de abajo hace un trabajo además de decorar: separa la cabecera del
 * contenido sin necesidad de dejar un hueco grande, y da un borde de referencia
 * para que las tarjetas de debajo no queden flotando en el vacío. Es la misma
 * línea fina que ordena las páginas de entrada.
 *
 * El rótulo va en mono porque todo lo que este sistema cuenta —toneladas,
 * horómetros, tickets, cédulas— son cifras alineadas, y porque es el mismo
 * recurso que encabeza los papeles que salen de aquí.
 */
export function PageHeader({ title, description, eyebrow, actions }: PageHeaderProps) {
  return (
    <div className="border-hairline mb-6 flex flex-wrap items-end justify-between gap-4 border-b pt-6 pb-5">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-ink/40 text-2xs mb-2 font-mono tracking-[0.22em] uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-ink/90 text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-ink/55 mt-1 text-base">{description}</p> : null}
      </div>
      {/*
        Los botones se parten de línea antes que empujar la página.

        Llevaban `shrink-0` a secas: nunca se encogían y nunca se partían, así
        que dos botones con nombre largo —«Historial de taller» y «Nueva
        máquina», o «Cerrar trimestre» e «Intereses del trimestre»— medían 366
        y 375 píxeles en una pantalla de 345 y sacaban la página entera de
        cuadro. Se veía el título cortado por la izquierda, que es lo que menos
        hace pensar en un botón.

        De `sm` para arriba se comportan como antes: no se encogen, y el título
        cede si hace falta. Debajo, mandan las líneas.
      */}
      {actions ? <div className="flex flex-wrap gap-2 sm:shrink-0">{actions}</div> : null}
    </div>
  )
}
