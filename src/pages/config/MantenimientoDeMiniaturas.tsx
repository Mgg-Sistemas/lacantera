import { useState } from 'react'
import { Images } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { repararMiniaturasFaltantes } from '@/lib/api/fotosDeCarga'

/*
  MANTENIMIENTO: GENERAR LAS MINIATURAS QUE FALTAN

  Las fotos de carga subidas antes del guardado de miniaturas (02/10/2026) no
  tienen su versión chica, y verlas baja el original. Este botón las recorre y
  les fabrica la suya de una vez, en lugar de esperar a que cada una se mire.

  Todo el trabajo ocurre en ESTE navegador, con la sesión del administrador:
  las fotos no salen del depósito privado, no se guardan en ningún otro lado,
  y no deja rastro de ellas fuera de donde ya vivían. Solo se admite para el
  administrador, que es quien ve la tarjeta.
*/
export function MantenimientoDeMiniaturas() {
  const [corriendo, setCorriendo] = useState(false)
  const [avance, setAvance] = useState({ hechas: 0, total: 0 })
  const [resultado, setResultado] = useState<{
    total: number
    generadas: number
    yaEstaban: number
    fallidas: number
  } | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)

  const correr = async () => {
    setCorriendo(true)
    setResultado(null)
    setFallo(null)
    setAvance({ hechas: 0, total: 0 })
    try {
      const r = await repararMiniaturasFaltantes((hechas, total) => setAvance({ hechas, total }))
      setResultado(r)
    } catch (e) {
      setFallo(e instanceof Error ? e.message : 'No se pudo completar el repaso.')
    } finally {
      setCorriendo(false)
    }
  }

  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h2 className="text-ink/85 font-titular text-base">Miniaturas de las fotos de carga</h2>
          <p className="text-ink/55 mt-1 text-sm">
            Las fotos subidas antes del cambio de miniaturas bajan la imagen completa cada vez que se
            miran. Este repaso les genera la versión pequeña que falta, de una sola vez. Las fotos se
            procesan aquí, en su navegador, y no salen a ningún lado.
          </p>
        </div>
        <Button icon={<Images />} onClick={() => void correr()} disabled={corriendo}>
          {corriendo ? 'Generando…' : 'Generar las que faltan'}
        </Button>
      </div>

      {corriendo && avance.total > 0 ? (
        <p className="text-ink/50 tabular mt-3 text-sm">
          Procesando {avance.hechas} de {avance.total}…
        </p>
      ) : null}

      {resultado ? (
        <p className="text-ink/70 mt-3 text-sm">
          Listo sobre {resultado.total} foto{resultado.total === 1 ? '' : 's'}:{' '}
          <strong>{resultado.generadas}</strong> generada{resultado.generadas === 1 ? '' : 's'}, {resultado.yaEstaban} ya
          la tenía{resultado.yaEstaban === 1 ? '' : 'n'}
          {resultado.fallidas > 0 ? `, ${resultado.fallidas} no se pudo` : ''}.
        </p>
      ) : null}

      {fallo ? <p className="text-danger mt-3 text-sm">{fallo}</p> : null}
    </Card>
  )
}
