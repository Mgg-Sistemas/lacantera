/*
  CÓMO SE NOMBRA Y CÓMO SE ORDENA UNA MÁQUINA.

  Estas dos cosas viven fuera de la pantalla a propósito. Del documento del otro
  sistema, que Christopher pasó para adaptar: «construye los helpers puros fuera
  de la pantalla y pruébalos; en el sistema original son los únicos pedazos con
  pruebas propias, y por eso son los únicos que nunca se rompieron en silencio».
*/

/*
  EL NOMBRE DE UNA MÁQUINA NO LA IDENTIFICA.

  Es la primera lección de ese documento, y les costó caro: tenían tres máquinas
  llamadas RETROEXCAVADORA, dos pantallas agrupaban POR NOMBRE, y la ficha del
  trabajador sumaba las horas de las tres en una sola fila. No era confusión: eran
  números equivocados.

  Aquí el problema gordo no se puede dar —`codigo` es único y es la identidad—
  pero el nombre sí se repite, y hay sitios donde una máquina se nombra sola: el
  título de un modal decía «Estado de RETRO» sin más. Con dos RETRO, eso no dice
  cuál.

  El discriminante es el CÓDIGO y no el serial, al revés que en aquel sistema.
  Allí la placa manda porque es lo que la gente usa para asignar; aquí el código
  es lo que se pinta en el costado de la máquina y lo que se dice por radio. El
  serial queda de reserva para cuando no haya código, que hoy no puede pasar
  —es obligatorio— pero mañana un dato importado podría llegar cojo.
*/
export function etiquetaDeMaquina(m: {
  nombre?: string | null
  codigo?: string | null
  serial?: string | null
}): string {
  const nombre = (m.nombre ?? '').trim()
  const discriminante = (m.codigo ?? '').trim() || (m.serial ?? '').trim()

  if (!nombre) return discriminante || 'Sin nombre'
  if (!discriminante) return nombre
  return `${nombre} · ${discriminante}`
}

/*
  ORDENAR COMO SE LEE, NO COMO SE ALMACENA.

  «PAYLOADER 2» va antes que «PAYLOADER 10», y con una comparación de texto pelada
  va después, porque el «1» de diez pesa menos que el «2». Es de las cosas que
  nadie reporta como error pero que hacen que una lista se sienta rota.

  `numeric` lo resuelve, e `ignorePunctuation` deja que «RETRO-3» y «RETRO 3» caigan
  juntas. Los vacíos van al final: una lista de pendientes no empieza por lo que
  no se sabe.

  Está aquí y no en cada pantalla para que haya UNA respuesta a «cómo se ordena
  esto». Es la misma razón por la que el documento pide una sola función de
  comparación para todo el sistema.
*/
const colador = new Intl.Collator('es', {
  numeric: true,
  sensitivity: 'base',
  ignorePunctuation: true,
})

export function comparar(a: string | null | undefined, b: string | null | undefined): number {
  const x = (a ?? '').trim()
  const y = (b ?? '').trim()
  if (!x && !y) return 0
  if (!x) return 1
  if (!y) return -1
  return colador.compare(x, y)
}
