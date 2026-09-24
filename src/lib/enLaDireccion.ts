import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/*
  LO QUE SE BUSCA VIVE EN LA DIRECCIÓN, NO EN LA PANTALLA.

  Nació de un fallo que reportó el usuario el 24/09/2026: escribir «aceite» en
  `Ctrl+K` llevaba al catálogo —los 328 artículos, sin filtrar— y había que
  volver a escribir «aceite» al llegar. El buscador tenía el término en la mano
  y lo soltaba en la puerta.

  La causa estaba escrita en `busqueda.ts` desde el principio: solo tres de las
  nueve fuentes llevan a un registro concreto; las demás dejan en la lista. Era
  media victoria razonable cuando la lupa solo encontraba pantallas. Con datos
  dentro, se nota.

  SE ARREGLA PASANDO EL TÉRMINO EN LA DIRECCIÓN, y no por un estado compartido
  ni por un contexto, por el mismo motivo por el que las pestañas de módulo son
  rutas de verdad:

    - La dirección se comparte. «Mírate el aceite en el catálogo» pasa a ser un
      enlace y no unas instrucciones para llegar.
    - El botón de atrás hace lo que la gente espera.
    - La pantalla no se entera de quién la llamó. Funciona igual llegando por
      la lupa, por el menú o por un enlace pegado en un mensaje.

  NO ABRE NINGUNA PUERTA. El permiso de la pantalla lo resuelve `ExigePermiso`
  con `pathname`, que no incluye la parte de después del `?`, así que un `?q=`
  no cambia qué módulo se exige. Y lo que se filtra aquí son filas que la
  pantalla ya tenía: esto tacha, no trae. La RLS sigue siendo la red de debajo.

  SE REEMPLAZA LA ENTRADA DEL HISTORIAL EN VEZ DE APILAR UNA NUEVA. Sin eso,
  escribir «aceite» deja seis entradas —«a», «ac», «ace»…— y el botón de atrás
  tarda seis pulsaciones en salir de la pantalla.
*/
export function useFiltroEnLaDireccion(clave = 'q'): [string, (valor: string) => void] {
  const [parametros, setParametros] = useSearchParams()

  const poner = useCallback(
    (valor: string) => {
      setParametros(
        (previos) => {
          const siguientes = new URLSearchParams(previos)
          // Vacío se borra en vez de quedarse como `?q=`: una dirección con un
          // filtro vacío se comparte y el que la abre no ve filtro ninguno,
          // pero la barra dice que hay uno.
          if (valor) siguientes.set(clave, valor)
          else siguientes.delete(clave)
          return siguientes
        },
        { replace: true },
      )
    },
    [clave, setParametros],
  )

  return [parametros.get(clave) ?? '', poner]
}
