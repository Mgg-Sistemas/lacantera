import { useId, useState } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/cn'
import { enMayuscula } from '@/lib/texto'

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

/**
 * Un número tal como lo escribe la gente aquí, pasado a lo que entiende el código.
 *
 * LA COMA Y EL PUNTO SON LO MISMO
 *
 * En Venezuela el separador decimal es la coma —«3,20»— y el teclado numérico
 * del teléfono ofrece coma, no punto. Con `type="number"` el navegador
 * sencillamente no la admite: se pulsa y no aparece nada, o peor, aparece y el
 * campo se queda en blanco al leerlo. La gente escribía «320» sin decimales sin
 * saber por qué, y eso en un precio unitario no se nota hasta el total.
 *
 * Se traduce a punto, que es lo único que entiende `Number()`, así que todo lo
 * que ya lee `e.target.value` sigue leyendo lo mismo de siempre.
 *
 * Y SE SIGUE SIN PODER ESCRIBIR LETRAS
 *
 * Es lo que se pierde al dejar `type="number"`, que no admitía nada que no
 * fuera un número. Se repone aquí a mano: fuera todo lo que no sea cifra, punto
 * o el signo, un solo punto, y el signo solo delante. Sin esto, cambiar la coma
 * habría abierto la puerta a que en «cantidad» acabara escrito «doce».
 */
function comoNumero(bruto: string): string {
  let s = bruto.replace(/[^0-9.,-]/g, '')

  const negativo = s.startsWith('-')
  s = s.replace(/-/g, '')

  /*
    Cuando hay varios separadores, el decimal es el ÚLTIMO.

    Los de antes son de millar. Es lo que hace falta para que pegar «1.500,25»
    —copiado de una factura o de una hoja de cálculo— dé mil quinientos con
    veinticinco y no uno coma cincuenta mil. Quedarse con el PRIMERO, que es lo
    primero que se escribe, daba justo eso.

    Con un solo separador no hay nada que decidir y es siempre el decimal, así
    que escribir «1,5» sigue funcionando tecla a tecla: «1», «1,», «1,5».

    «1.500» a secas es ambiguo —mil quinientos o uno y medio— y aquí se toma
    como uno y medio, que es lo que se lee tal cual. No hay forma de acertar
    siempre: quien quiera mil quinientos lo escribe sin punto, como se escribe
    en un campo.
  */
  const ultimo = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
  if (ultimo !== -1) {
    s =
      s.slice(0, ultimo).replace(/[.,]/g, '') + '.' + s.slice(ultimo + 1).replace(/[.,]/g, '')
  }

  return (negativo ? '-' : '') + s
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
  ...rest
}: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const describedById = `${inputId}-desc`
  const [revealed, setRevealed] = useState(false)

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
          onChange={alEscribir}
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
    </div>
  )
}
