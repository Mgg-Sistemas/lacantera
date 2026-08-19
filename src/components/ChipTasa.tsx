import { Link } from 'react-router'
import { AlertTriangle } from 'lucide-react'
import { useTasaVigente } from '@/lib/api/tasas'
import { tasa as formatearTasa } from '@/lib/formato'
import { cn } from '@/lib/cn'

/**
 * Con qué tasa se va a valorar esto.
 *
 * NO ES EL INDICADOR DE LA BARRA, Y LA DIFERENCIA IMPORTA
 *
 * Arriba, en la barra, va la tasa que el BCV publicó: se consulta a una fuente
 * pública, informa y no compromete a nada. Este chip muestra otra cosa — la
 * tasa registrada en el sistema, que es con la que de verdad se va a congelar
 * el documento que se está emitiendo.
 *
 * Las dos coinciden casi siempre, y por eso confundirlas es fácil y caro: el
 * día que el BCV publica y nadie la carga, la barra enseña la nueva y el
 * documento se valora con la de ayer. Quien mira arriba cree que está bien.
 * Este chip se pone donde se emite, no donde se navega, y dice la que manda.
 *
 * SOLO APARECE CUANDO HACE FALTA
 *
 * La primera versión se dibujaba siempre, y estaba mal: la barra ya enseña la
 * tasa en todas las pantallas, así que en el caso normal quedaban dos etiquetas
 * con el mismo número a diez píxeles de distancia. Eso no informa — enseña a no
 * mirar ninguna de las dos.
 *
 * Ahora solo se dibuja en los dos casos en que dice algo que la barra no puede
 * decir:
 *
 * Arrastrada: hay tasa, pero es de un día anterior porque nadie cargó la de
 * hoy. La barra enseña la que el BCV publicó y parece que todo está bien; el
 * documento, en cambio, se va a valorar con la vieja. Eso no se descubre hasta
 * el cierre del mes.
 *
 * Sin ninguna: no se puede emitir nada valorado. Ahí deja de informar y se
 * vuelve un enlace a la pantalla donde se arregla, porque avisar de un problema
 * sin decir dónde se resuelve solo sirve para molestar.
 */
export function ChipTasa({ className }: { className?: string }) {
  const { data, isPending } = useTasaVigente()

  // Mientras carga no se dibuja nada. Un esqueleto que casi siempre termina en
  // nada es un parpadeo en la cabecera cada vez que se entra a la pantalla.
  if (isPending) return null

  // Sin tasa registrada no se puede valorar nada, así que el chip lleva a
  // resolverlo en vez de limitarse a dar la mala noticia.
  if (!data) {
    return (
      <Link
        to="/app/tasas"
        className={cn(
          'border-danger/30 bg-danger-soft text-danger hover:border-danger/50 text-2xs inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium transition-colors',
          className,
        )}
      >
        <AlertTriangle className="size-3.5 shrink-0" />
        Sin tasa registrada — cárgala
      </Link>
    )
  }

  /*
    Si la tasa está al día, el chip no se dibuja.

    La barra de arriba ya enseña la tasa en todas las pantallas. Cuando las dos
    coinciden —que es casi siempre— poner otra debajo son dos etiquetas con el
    mismo número a diez píxeles de distancia, y eso no informa: enseña a no
    mirar ninguna de las dos.

    Este chip existe para el caso en que NO coinciden: el BCV publicó, la barra
    enseña la nueva, y en el sistema sigue la de ayer porque nadie la cargó. Ahí
    aparece, y aparece solo. Un aviso que está siempre puesto deja de ser un
    aviso al tercer día.
  */
  if (!data.arrastrada) return null

  const fechaCorta = new Date(`${data.fecha}T12:00:00`).toLocaleDateString('es-VE', {
    day: 'numeric',
    month: 'short',
  })

  return (
    <span
      title={`No hay tasa de hoy registrada. Lo que se emita ahora se valora con la del ${fechaCorta}.`}
      className={cn(
        'border-warning/40 bg-warning-soft text-warning text-2xs inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium',
        className,
      )}
    >
      <AlertTriangle className="size-3.5 shrink-0" />
      <span>Se valora con la tasa del {fechaCorta}</span>
      <span className="tabular font-semibold">Bs {formatearTasa(Number(data.tasa))}</span>
    </span>
  )
}
