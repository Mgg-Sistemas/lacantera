import { useState } from 'react'
import { Input } from '@/components/ui/Input'
import { comoTelefono, telefono } from '@/lib/formato'

/*
  UN TELÉFONO, CON LA TECLA FILTRADA.

  Christopher, el 8 de septiembre: «teléfono debe permitir ingresar solo números
  y adicional (ej. +58 0412-)».

  POR QUÉ SE FILTRA LA TECLA Y NO SE AVISA DESPUÉS, que es la parte que importa

  Entre los diecinueve teléfonos de empleados hay uno guardado como
  `O4123917198`: la letra O en lugar del cero de delante. Es un número que no
  sirve para llamar a nadie, lleva ahí desde que se cargó, y nadie se enteró
  hasta que se midió.

  Un aviso al guardar no lo habría evitado: sobre la pantalla se lee
  «04123917198» y parece correcto — la O y el 0 son la misma forma. Que la tecla
  no entre, sí lo evita, y sin decirle nada a nadie.

  CRUDO MIENTRAS SE ESCRIBE, VESTIDO AL SALIR, como los números y los
  documentos: `0412-555.1234` se dicta por teléfono sin repetir, y once cifras
  seguidas no.
*/

interface Props {
  label?: string
  valor: string
  onCambiar: (valor: string) => void
  hint?: string
  className?: string
  required?: boolean
  disabled?: boolean
}

export function CampoTelefono({
  label = 'Teléfono',
  valor,
  onCambiar,
  hint,
  className,
  required,
  disabled,
}: Props) {
  const [enfocado, setEnfocado] = useState(false)
  const hayAlgo = valor.trim() !== ''

  /*
    El aviso solo al salir. Mientras se escribe, «0412» no está mal: está a
    medias, y decirle a alguien que se equivoca en la cuarta tecla es lo que
    hace que la gente deje de leer los avisos.

    Y solo avisa; no impide. Hay teléfonos de tres cifras, extensiones y números
    de fuera, y un campo que solo admite el formato de aquí es un campo donde no
    se puede escribir el del proveedor de Colombia.
  */
  const raro =
    !enfocado && hayAlgo && telefono(valor) === valor.trim() && !/^\+/.test(valor.trim())

  return (
    <Input
      label={label}
      className={className}
      required={required}
      disabled={disabled}
      sinNormalizar
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder="0412-5551234"
      value={enfocado ? valor : hayAlgo ? telefono(valor) : ''}
      onFocus={() => setEnfocado(true)}
      onBlur={() => setEnfocado(false)}
      onChange={(e) => onCambiar(comoTelefono(e.target.value))}
      hint={
        hint ??
        (raro
          ? 'No parece un número venezolano. Si es de fuera, escríbelo con +.'
          : 'Once cifras: 0412-5551234. Con el + delante si es de otro país.')
      }
    />
  )
}
