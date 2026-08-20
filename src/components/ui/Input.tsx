import { useId, useState } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/cn'
import { enMayuscula } from '@/lib/texto'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string
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

  const resolvedType = revealable ? (revealed ? 'text' : 'password') : type

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
      <label htmlFor={inputId} className="text-ink/75 mb-1.5 block text-sm font-medium">
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
