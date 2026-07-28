import { useState } from 'react'
import type { FormEvent } from 'react'
import { AlertCircle, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useCambiarMiClave } from '@/lib/api/usuarios'

const MINIMO = 8

/**
 * Cambiarse la clave.
 *
 * Vive suelto de la pantalla porque se usa en dos sitios que no se parecen: en
 * los ajustes de la cuenta, cuando alguien decide cambiarla, y a pantalla
 * completa el primer día, cuando el sistema no le deja pasar sin hacerlo. La
 * comprobación es la misma en los dos, así que el formulario también.
 *
 * La confirmación no está por trámite: una clave se escribe a ciegas y no hay
 * a quién preguntarle después cuál se puso. Escribirla dos veces es lo único
 * que separa "la cambié" de "me quedé fuera".
 */
export function FormularioClave({
  onListo,
  textoBoton = 'Cambiar la clave',
}: {
  onListo?: () => void
  textoBoton?: string
}) {
  const cambiar = useCambiarMiClave()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState(false)

  // Solo se avisa del desajuste cuando ya se escribió algo en la confirmación:
  // señalar un error mientras la persona todavía teclea es ruido.
  const noCoinciden = confirmacion.length > 0 && nueva !== confirmacion
  const cortaDeMas = nueva.length > 0 && nueva.length < MINIMO
  const repetida = nueva.length > 0 && nueva === actual

  const listo =
    actual.length > 0 && nueva.length >= MINIMO && nueva === confirmacion && !repetida

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!listo) return

    cambiar.mutate(
      { actual, nueva },
      {
        onSuccess: () => {
          setActual('')
          setNueva('')
          setConfirmacion('')
          setHecho(true)
          onListo?.()
        },
        onError: (e: Error) => setError(e.message),
      },
    )
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      {error ? (
        <div
          role="alert"
          className="border-danger/25 bg-danger-soft flex items-start gap-2.5 rounded-[6px] border p-3"
        >
          <AlertCircle className="text-danger mt-px size-[18px] shrink-0" />
          <p className="text-danger text-sm">{error}</p>
        </div>
      ) : null}

      {hecho ? (
        <div
          role="status"
          className="border-success/25 bg-success-soft flex items-start gap-2.5 rounded-[6px] border p-3"
        >
          <Check className="text-success mt-px size-[18px] shrink-0" />
          <p className="text-success text-sm">
            Clave cambiada. La próxima vez entra con la nueva.
          </p>
        </div>
      ) : null}

      <Input
        label="Clave actual"
        value={actual}
        onChange={(e) => setActual(e.target.value)}
        autoComplete="current-password"
        revealable
        required
      />

      <Input
        label="Clave nueva"
        value={nueva}
        onChange={(e) => setNueva(e.target.value)}
        autoComplete="new-password"
        revealable
        required
        error={
          cortaDeMas
            ? `Faltan ${MINIMO - nueva.length} caracteres.`
            : repetida
              ? 'Tiene que ser distinta de la actual.'
              : undefined
        }
        hint={!cortaDeMas && !repetida ? `Mínimo ${MINIMO} caracteres.` : undefined}
      />

      <Input
        label="Repite la clave nueva"
        value={confirmacion}
        onChange={(e) => setConfirmacion(e.target.value)}
        autoComplete="new-password"
        revealable
        required
        error={noCoinciden ? 'Las dos claves no son iguales.' : undefined}
      />

      <Button type="submit" size="lg" block disabled={!listo || cambiar.isPending}>
        {cambiar.isPending ? 'Cambiando…' : textoBoton}
      </Button>
    </form>
  )
}
