import { twMerge } from 'tailwind-merge'

type ClassValue = string | number | null | undefined | false | ClassValue[]

/**
 * Une clases de Tailwind resolviendo conflictos.
 *
 * El merge no es cosmético: en CSS gana la regla que aparece después en la
 * hoja de estilos, no la que aparece después en el atributo `class`. Sin
 * resolver el conflicto, `cn('p-2', 'p-4')` deja las dos y el resultado
 * depende del orden en que Tailwind las haya emitido — que no controlamos.
 */
export function cn(...inputs: ClassValue[]): string {
  const parts: string[] = []

  const walk = (value: ClassValue): void => {
    if (value === null || value === undefined || value === false || value === '') return
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    parts.push(String(value))
  }

  inputs.forEach(walk)
  return twMerge(parts.join(' '))
}
