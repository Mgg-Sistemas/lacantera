import { useId, useState } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/cn'
import { enMayuscula } from '@/lib/texto'
import { comoNumero, vestido } from '@/lib/formato'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string
  /**
   * Esconde la etiqueta a la vista pero la deja para el lector de pantalla.
   * Para editar en linea, donde el rotulo lo da la fila y repetirlo es ruido.
   */
  ocultarEtiqueta?: boolean
  /** Texto de ayuda. Si hay error, el error lo sustituye. */
  hint?: string
  error?: string
  icon?: ReactNode
  /** Añade el botón de mostrar/ocultar y alterna el type. */
  revealable?: boolean
  /**
   * Deja el campo tal como se teclea.
   *
   * Los datos del sistema se guardan en mayúscula y sin tildes, así que el
   * campo lo enseña así desde la primera letra: escribir "Minería" y que
   * aparezca guardado "MINERIA" se lee como que el sistema cambió el dato por
   * su cuenta. Se apaga donde el valor no es un dato sino una credencial o una
   * dirección: el nombre de acceso se compara en minúscula y un correo puede
   * distinguir mayúsculas antes de la arroba.
   */
  sinNormalizar?: boolean
}

export function Input({
  label,
  ocultarEtiqueta,
  hint,
  error,
  icon,
  revealable = false,
  sinNormalizar = false,
  className,
  type = 'text',
  id,
  onChange,
  onFocus,
  onBlur,
  value,
  ...rest
}: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const describedById = `${inputId}-desc`
  const [revealed, setRevealed] = useState(false)
  const [enfocado, setEnfocado] = useState(false)

  /*
    Los campos de número se dibujan como texto.

    No es un capricho: `type="number"` no deja escribir la coma, y no hay forma
    de metérsela desde fuera porque el navegador tampoco expone dónde está el
    cursor en ese tipo de campo. Como texto sí se puede traducir la coma a punto
    sin que se mueva nada de sitio.

    A cambio se pierden las flechitas de subir y bajar —que en un precio nadie
    usa— y `min`, `max` y `step` dejan de restringir. No sostenían nada: no hay
    un solo sitio en el sistema que pregunte al navegador si el formulario es
    válido, la comprobación se hace siempre en el código.
  */
  const esNumero = type === 'number' && !revealable

  const resolvedType = revealable ? (revealed ? 'text' : 'password') : esNumero ? 'text' : type

  /*
    Solo se normaliza lo que es texto escrito a mano.

    Una clave, un correo, una fecha o un número no son datos del negocio: son
    credenciales, direcciones o valores con formato propio, y subirlos a
    mayúscula rompe desde el inicio de sesión hasta el selector de fecha del
    navegador. La base aplica la misma regla; esto solo hace que se vea venir.
  */
  const normaliza =
    !sinNormalizar &&
    !revealable &&
    (type === 'text' || type === 'search' || type === undefined)

  /*
    CRUDO MIENTRAS SE ESCRIBE, VESTIDO EN CUANTO SE SALE.

    Christopher: «el sistema en la pantalla puede dar un formato visual a los
    números que sirva de guía al ojo del usuario». Y hace falta: un cero de más
    no se ve en 1209012.48 y salta a la vista en 1.209.012,48. El inventario de
    esta empresa llegó a valer 868 millones porque cinco costos se teclearon mal
    y nadie los leyó — el número estaba en la pantalla y no se podía mirar.

    POR QUÉ AL SALIR Y NO MIENTRAS SE TECLEA. Meter puntos de millar tecla a
    tecla obliga a recolocar el cursor en cada pulsación, y ahí es donde estas
    cosas se rompen: se escribe en medio de un número y el cursor salta al
    final. Al salir del campo no hay cursor que mover y el número queda a la
    vista justo cuando se va a mirar el formulario entero antes de guardar.

    Lo que viaja a `onChange` no cambia nunca: sigue siendo el número canónico
    con punto decimal, que es lo que todo el sistema ya lee.
  */
  const valorVestido =
    esNumero && !enfocado && typeof value === 'string' && value !== ''
      ? vestido(value)
      : value

  /*
    Y MIENTRAS SE ESCRIBE, EL ECO DEBAJO — solo cuando el número es grande.

    Con cinco cifras o más ya no se lee de un vistazo, que es exactamente donde
    vive el error de mil veces. Por debajo de eso el eco sería ruido: nadie
    necesita que le confirmen que 208 es doscientos ocho.
  */
  const eco =
    esNumero && enfocado && typeof value === 'string' && /[0-9]{5}/.test(value.split('.')[0] ?? '')
      ? vestido(value)
      : null

  const alEscribir = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (esNumero) {
      const bruto = e.target.value
      const limpio = comoNumero(bruto)

      if (limpio !== bruto) {
        /*
          El cursor se recoloca por lo que se haya caído.

          Cambiar la coma por el punto no mueve nada —una letra por otra—, así
          que en el caso corriente el cursor se queda donde estaba. Solo se
          desplaza cuando de verdad se quitó algo, que es cuando alguien pegó
          texto o tecleó una letra: se retrocede tanto como se acortó.
        */
        const cursor = e.target.selectionStart ?? bruto.length
        e.target.value = limpio
        const sitio = Math.max(0, cursor - (bruto.length - limpio.length))
        e.target.setSelectionRange(sitio, sitio)
      }

      onChange?.(e)
      return
    }

    if (normaliza) {
      const cursor = e.target.selectionStart
      e.target.value = enMayuscula(e.target.value)
      // Sin esto el cursor salta al final en cuanto se corrige una letra
      // del medio, que es exactamente el fallo que ya costó una tarde.
      e.target.setSelectionRange(cursor, cursor)
    }
    onChange?.(e)
  }

  return (
    <div className={cn('w-full min-w-0', className)}>
      <label
        htmlFor={inputId}
        className={cn(
          ocultarEtiqueta ? 'sr-only' : 'text-ink/75 mb-1.5 block text-sm font-medium',
        )}
      >
        {label}
      </label>

      <div className="relative">
        {icon ? (
          <span className="text-ink/40 pointer-events-none absolute inset-y-0 left-3 flex items-center [&>svg]:size-[18px]">
            {icon}
          </span>
        ) : null}

        <input
          id={inputId}
          type={resolvedType}
          // El teclado del teléfono sigue abriéndose en cifras aunque el campo
          // ya sea de texto. Va antes de `...rest` para que quien lo declare a
          // mano —la mayoría lo hace— siga mandando.
          inputMode={esNumero ? 'decimal' : undefined}
          value={valorVestido}
          onChange={alEscribir}
          onFocus={(e) => {
            setEnfocado(true)
            onFocus?.(e)
          }}
          onBlur={(e) => {
            setEnfocado(false)
            onBlur?.(e)
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? describedById : undefined}
          className={cn(
            'rounded-control bg-surface h-10 w-full border text-base',
            'placeholder:text-ink/35 text-ink/90',
            'transition-[border-color,box-shadow] duration-150',
            'focus:outline-none',
            icon ? 'pl-10' : 'pl-3.5',
            revealable ? 'pr-10' : 'pr-3.5',
            error
              ? 'border-danger focus:border-danger focus:ring-danger/20 focus:ring-2'
              : 'border-ink/20 hover:border-ink/32 focus:border-royal-600 focus:ring-royal-600/20 focus:ring-2',
          )}
          {...rest}
        />

        {revealable ? (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            title={revealed ? 'Ocultar la clave' : 'Ver la clave'}
            // Al 40% no se veía: quien escribe mal la clave a ciegas no
            // descubre que hay forma de mirarla, y vuelve a intentarlo a
            // ciegas. Un control que existe pero no se distingue del fondo
            // es un control que no existe.
            className="text-ink/60 hover:bg-ink/8 hover:text-ink/90 focus-visible:outline-royal-600 absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-[6px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
          >
            {revealed ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
          </button>
        ) : null}
      </div>

      {error || hint ? (
        <p
          id={describedById}
          className={cn('mt-1.5 text-xs', error ? 'text-danger' : 'text-ink/50')}
        >
          {error ?? hint}
        </p>
      ) : null}

      {/* El eco va en el color del sistema y no en gris: es lo que hay que
          leer, no una nota al pie. */}
      {eco ? (
        <p className="text-royal-600 dark:text-royal-300 tabular mt-1 text-xs">{eco}</p>
      ) : null}
    </div>
  )
}
