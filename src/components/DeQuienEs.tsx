import { Landmark } from 'lucide-react'
import { Chip } from '@/components/ui/Chip'
import { usePropietarios } from '@/lib/api/inventario'
import { esAjeno } from '@/lib/deQuien'

/*
  LO QUE NO ES NUESTRO SE VE SIN LEER.

  Christopher: «lo que sea de la gobernación debe de ser visiblemente diferente o
  diferenciable de lo que pertenezca a la cantera. Así mismo en la opción de
  darle entrada o formulario para crear el item».

  La marca ya existía suelta dentro de la tabla de almacenes. Se saca aquí porque
  la petición es que se note en TODAS partes, y una marca que se dibuja distinta
  en cada pantalla deja de ser una marca: se convierte en seis detalles que hay
  que aprender uno por uno.

  ═══════════════════════════════════════════════════════════════════════════
  SOLO SE MARCA LO AJENO
  ═══════════════════════════════════════════════════════════════════════════

  Rotular cada fila con «La Cantera» sería repetir en once renglones lo que se da
  por supuesto, y entonces la etiqueta de la gobernación se leería como una más.
  Se dice lo que rompe la norma; lo demás se calla, y por eso destaca.

  La excepción es la pantalla de dueños, donde la marca de la casa sí aparece:
  allí la pregunta ES cuál es cuál, y callarse una mitad no contesta nada.

  ═══════════════════════════════════════════════════════════════════════════
  UN ICONO ADEMÁS DEL COLOR
  ═══════════════════════════════════════════════════════════════════════════

  «Visiblemente diferente» con el color solo no se cumple para quien no distingue
  el amarillo del gris, y tampoco en una tabla impresa en blanco y negro para una
  reunión. El edificio de columnas dice «esto es de un ente» aun sin color.

  El tono es `warning` y no `safety`: lo de la gobernación no es un peligro, es
  material prestado. El naranja fuerte de esta casa está reservado para lo que
  hay que atender ya.
*/
export function DeQuienEs({
  propietario,
  className,
}: {
  propietario?: string | null
  className?: string
}) {
  const { data: propietarios } = usePropietarios()
  if (!esAjeno(propietario)) return null

  const nombre =
    (propietarios ?? []).find((d) => d.codigo === propietario)?.nombre ?? propietario

  return (
    <Chip
      tone="warning"
      icon={<Landmark />}
      className={className}
      title="No es de La Cantera: está aquí a disposición de la empresa, pero pertenece a otro."
    >
      {nombre}
    </Chip>
  )
}
