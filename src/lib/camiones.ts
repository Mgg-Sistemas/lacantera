/*
  Quién puede qué con un camión, en un solo sitio.

  Es el espejo de la base (migración «los camiones los gobierna Maquinaria»,
  16/09/2026). Si la pantalla dejara ver un botón que la base rechaza, el botón
  mentiría; si escondiera uno que la base acepta, quien tiene la casilla
  prestada no encontraría cómo usarla. Por eso va aquí y no repetido en la
  pantalla de Equipos, en la ficha del camión y en su formulario.

  - Editar y dar de alta: Maquinaria en escritura, Despachos en escritura o la
    casilla DESPACHOS.EDITAR_VEHICULO (también prestada).
  - De quién es, lo que le cabe y su ficha de mantenimiento, en un camión que
    ya existe: solo Despachos en escritura o esa casilla. Deciden a quién se le
    pagan los viajes.
  - Chofer: Maquinaria o Despachos en escritura, o DESPACHOS.ASIGNAR_CHOFER.
  - Carga útil y eliminar: sus casillas, como siempre.

  Las casillas siguen llamándose DESPACHOS.* aunque la pantalla viva en
  Maquinaria: hay autorizaciones vivas sobre ellas, y renombrarlas obligaría a
  mudarlas sin ganar nada.
*/
import { useMisAcciones, useMisPermisos } from '@/lib/api/usuarios'

export function usePermisosDeCamion() {
  const { puede: modulo } = useMisPermisos()
  const { puede: casilla } = useMisAcciones()

  const despachos = modulo('DESPACHOS', 'ESCRITURA')
  const maquinaria = modulo('MAQUINARIA', 'ESCRITURA')

  return {
    editar: maquinaria || despachos || casilla('DESPACHOS.EDITAR_VEHICULO'),
    cambiarDueno: despachos || casilla('DESPACHOS.EDITAR_VEHICULO'),
    chofer: maquinaria || despachos || casilla('DESPACHOS.ASIGNAR_CHOFER'),
    cargaUtil: casilla('DESPACHOS.FIJAR_CARGA_UTIL'),
    eliminar: casilla('DESPACHOS.ELIMINAR_VEHICULO'),
  }
}
