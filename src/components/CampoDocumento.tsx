import { useState } from 'react'
import { Input } from '@/components/ui/Input'
import {
  documento,
  documentoCanonico,
  NATURALEZA_DEL_DOCUMENTO,
} from '@/lib/formato'

/*
  UNA CÉDULA O UN RIF, TECLEADO COMO SE DICE Y GUARDADO COMO SE COMPARA.

  Christopher, el 8 de septiembre: «la base no necesariamente debe guardar los
  puntos de la cédula por ejemplo V-123.123.123, pero la pantalla deberá
  mostrarlo e interpretarlo o validarlo o gestionarlo, para cédulas y rif, debe
  de estandarizarse junto con la letra que identifica la naturalidad del
  documento de identificación "E" o "G" o "J" o "V"».

  Así que se separan las dos cosas que hasta hoy iban juntas:

    lo que se guarda ... V-12345678      se compara, se cruza, se busca
    lo que se ve ....... V-12.345.678    se lee de un vistazo contra el carnet

  POR QUÉ LA LETRA NO SE PUEDE OMITIR, Y ESTÁ MEDIDO

  El 8 de septiembre: `empleados` guarda «V-12460702» y `perfiles` guardaba
  «12460702» para la misma persona. Resultado: **ninguno de los seis perfiles
  con cédula cruzaba con su ficha de empleado.** El sistema no sabía que el
  usuario Rafael y el empleado Rafael eran el mismo. Sin la letra, dos
  escrituras del mismo documento son dos documentos.

  Y NO SE ADIVINA. Poner una V donde nadie la puso escribe una nacionalidad que
  esa persona no declaró. El campo pide la letra; no la rellena.

  CRUDO MIENTRAS SE ESCRIBE, VESTIDO AL SALIR — el mismo trato que los números,
  y por la misma razón: meter puntos tecla a tecla obliga a recolocar el cursor
  en cada pulsación, y ahí es donde estas cosas se rompen.
*/

interface Props {
  label: string
  /** El valor canónico: `V-12345678`. Vacío mientras no haya uno válido. */
  valor: string
  /** Devuelve el canónico, o el texto crudo mientras aún no lo es. */
  onCambiar: (valor: string) => void
  /** Un RIF lleva dígito verificador; una cédula no. */
  tipo?: 'cedula' | 'rif'
  hint?: string
  className?: string
  required?: boolean
  disabled?: boolean
}

export function CampoDocumento({
  label,
  valor,
  onCambiar,
  tipo = 'cedula',
  hint,
  className,
  required,
  disabled,
}: Props) {
  const [enfocado, setEnfocado] = useState(false)

  const canonico = documentoCanonico(valor, tipo === 'rif')
  const hayAlgo = valor.trim() !== ''

  /*
    El error solo aparece al salir del campo. Mientras se escribe, «V-1» no está
    mal: está a medias, y decirle a alguien que se equivoca en la segunda tecla
    es lo que hace que la gente deje de leer los avisos.
  */
  const error =
    !enfocado && hayAlgo && canonico === null
      ? /^[0-9]/.test(valor.trim())
        ? 'Falta la letra delante: V, E, J, G o P.'
        : 'No se entiende. Se escribe como V-12.345.678.'
      : undefined

  const letra = canonico?.[0]

  return (
    <Input
      label={label}
      className={className}
      required={required}
      disabled={disabled}
      sinNormalizar
      autoComplete="off"
      placeholder={tipo === 'rif' ? 'J-12.345.678-9' : 'V-12.345.678'}
      value={enfocado ? valor : hayAlgo ? documento(valor) : ''}
      onFocus={() => setEnfocado(true)}
      onBlur={() => {
        setEnfocado(false)
        // Al salir se guarda lo canónico, si ya se puede. Si no, se deja lo
        // tecleado tal cual para que el error pueda señalarlo.
        if (canonico) onCambiar(canonico)
      }}
      onChange={(e) => onCambiar(e.target.value)}
      error={error}
      hint={
        hint ??
        (letra
          ? NATURALEZA_DEL_DOCUMENTO[letra]
          : 'Con la letra delante: V, E, J, G o P.')
      }
    />
  )
}
