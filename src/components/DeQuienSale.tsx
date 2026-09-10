import { Select } from '@/components/ui/Select'
import { usePropietarios } from '@/lib/api/inventario'
/*
  DE QUIÉN SALE, CUANDO EN EL SITIO HAY DE VARIOS.

  Desde que el dueño viaja con el material, un mismo almacén puede tener tres
  bombas nuestras y ocho de la gobernación. Sacarlas sin decir de quién eran
  sería inventarlo, así que la base se para — y esto es donde se contesta.

  ═══════════════════════════════════════════════════════════════════════════
  NO APARECE CUANDO NO HAY DUDA
  ═══════════════════════════════════════════════════════════════════════════

  Con un solo dueño en ese sitio devuelve nada. Preguntar lo que ya se sabe
  enseña a responder sin mirar, y entonces el día que la pregunta importa se
  contesta igual de rápido y mal.

  Por eso también se pasa la lista de dueños PRESENTES y no el catálogo entero:
  ofrecer a alguien que no tiene nada ahí es ofrecer un error.

  ═══════════════════════════════════════════════════════════════════════════
  SIN VALOR POR DEFECTO
  ═══════════════════════════════════════════════════════════════════════════

  Cuando hay varios, arranca vacío y hay que elegir. Preseleccionar el primero
  —o «lo nuestro»— convertiría un descuido en un asiento a nombre de quien no
  era, y eso no se ve al guardar: se ve meses después, cuadrando con el ente.
*/
export function DeQuienSale({
  duenos,
  valor,
  onCambio,
  label = '¿De quién sale?',
}: {
  /** Los que tienen saldo positivo de ese artículo en ese sitio. */
  duenos: string[] | undefined
  valor: string
  onCambio: (v: string) => void
  label?: string
}) {
  const { data: propietarios } = usePropietarios()
  if (!duenos || duenos.length < 2) return null

  return (
    <Select
      label={label}
      vacio="Elige el dueño"
      value={valor}
      onChange={(e) => onCambio(e.target.value)}
      hint="Aquí hay material de varios dueños. Sacarlo sin decir de cuál era sería inventarlo."
      opciones={duenos.map((d) => ({
        valor: d,
        etiqueta: (propietarios ?? []).find((x) => x.codigo === d)?.nombre ?? d,
      }))}
    />
  )
}
