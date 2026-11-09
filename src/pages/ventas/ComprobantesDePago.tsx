import { useEffect, useState } from 'react'
import { FileText, Paperclip, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { ElegirArchivosDeCarga } from '@/components/FotosDeCarga'
import { usePerfiles } from '@/lib/api/catalogo'
import { fechaHora } from '@/lib/formato'
import {
  MAXIMO_COMPROBANTES,
  abrirComprobante,
  bajarComprobante,
  miniaturaDeComprobante,
  useQuitarComprobante,
  useSubirComprobantes,
  type ComprobantePago,
} from '@/lib/api/pagosBancarios'
import { abrirArchivo, nombreLegible } from '@/lib/abrirArchivo'

/*
  LOS COMPROBANTES DE UN PAGO: la captura del pago móvil, la transferencia, el
  PDF que mandó el cliente. Se ven al desplegar el pago; se adjuntan y se quitan
  con el permiso de registrar pagos. Quitar uno no lo borra: queda tachado, con
  quién lo quitó y por qué.
*/

/** Una miniatura: la imagen si es foto, un icono si es PDF. Al pulsarla se abre entera. */
function Miniatura({ c }: { c: ComprobantePago }) {
  const [url, setUrl] = useState<string | null>(null)
  const esPdf = c.tipo === 'application/pdf'

  useEffect(() => {
    if (esPdf) return
    let vigente = true
    let creada: string | null = null
    void miniaturaDeComprobante(c.path)
      .catch(async () => {
        // Sin miniatura guardada: se baja el original.
        const u = await abrirComprobante(c.path)
        creada = u
        return u
      })
      .then((u) => {
        if (vigente) setUrl(u)
        else if (creada) URL.revokeObjectURL(creada)
      })
      .catch(() => undefined)
    return () => {
      vigente = false
      if (creada) URL.revokeObjectURL(creada)
    }
  }, [c.path, esPdf])

  const [falla, setFalla] = useState(false)
  // Sin la dirección del almacén en la barra; la ventana se abre en el clic
  // para que el navegador no la bloquee (ver `abrirArchivo.ts`).
  const abrir = async () => {
    try {
      await abrirArchivo(() => bajarComprobante(c.path), nombreLegible(c.path, c.nombre, 'Comprobante'))
      setFalla(false)
    } catch {
      setFalla(true)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void abrir()}
        title={c.nombre ?? 'Abrir comprobante'}
        className="border-hairline bg-ink/4 hover:border-ink/30 flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-[6px] border"
      >
        {esPdf ? (
          <span className="text-ink/60 flex flex-col items-center gap-1 text-[10px]">
            <FileText className="size-6" />
            PDF
          </span>
        ) : url ? (
          <img src={url} alt={c.nombre ?? 'Comprobante de pago'} className="size-full object-cover" />
        ) : (
          <Receipt className="text-ink/30 size-5" />
        )}
      </button>
      {falla ? <p className="text-danger mt-1 text-[10px]">No se pudo abrir.</p> : null}
    </>
  )
}

export function ComprobantesDePago({
  pagoId,
  comprobantes,
  puedeAdjuntar,
}: {
  pagoId: number
  /** Los de este pago, vigentes y quitados. */
  comprobantes: ComprobantePago[]
  puedeAdjuntar: boolean
}) {
  const { data: perfiles } = usePerfiles()
  const subir = useSubirComprobantes()
  const quitar = useQuitarComprobante()
  const [nuevos, setNuevos] = useState<File[]>([])
  const [quitando, setQuitando] = useState<ComprobantePago | null>(null)
  const [motivo, setMotivo] = useState('')

  const nombreDe = (uid: string | null) => (uid && perfiles?.find((p) => p.id === uid)?.nombre) || '—'

  const vigentes = comprobantes.filter((c) => !c.quitado_en)
  const quitados = comprobantes.filter((c) => c.quitado_en)
  const disponibles = MAXIMO_COMPROBANTES - vigentes.length

  if (comprobantes.length === 0 && !puedeAdjuntar) return null

  return (
    <div className="mb-3">
      <p className="text-ink/55 mb-1.5 flex items-center gap-1.5 text-xs font-medium">
        <Paperclip className="size-3.5" />
        Comprobantes ({vigentes.length} de {MAXIMO_COMPROBANTES})
      </p>

      {vigentes.length === 0 ? (
        <p className="text-ink/45 mb-2 text-xs">Este pago no tiene comprobante adjunto.</p>
      ) : (
        <ul className="flex flex-wrap gap-3">
          {vigentes.map((c) => (
            <li key={c.id} className="w-24">
              <Miniatura c={c} />
              <p className="text-ink/45 mt-1 text-[10px] leading-tight">
                {nombreDe(c.subido_por)}
                <br />
                {fechaHora(c.subido_en)}
              </p>
              {puedeAdjuntar ? (
                <button
                  type="button"
                  className="text-ink/45 hover:text-danger text-[10px] underline"
                  onClick={() => {
                    setMotivo('')
                    setQuitando(c)
                  }}
                >
                  Quitar
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {quitados.length > 0 ? (
        <ul className="text-ink/45 mt-2 space-y-0.5 text-[11px]">
          {quitados.map((c) => (
            <li key={c.id}>
              <span className="line-through">{c.nombre ?? 'Comprobante'}</span> · lo subió {nombreDe(c.subido_por)} · lo
              quitó {nombreDe(c.quitado_por)} el {fechaHora(c.quitado_en!)}: «{c.motivo_quitado}»
            </li>
          ))}
        </ul>
      ) : null}

      {puedeAdjuntar && disponibles > 0 ? (
        <div className="mt-2">
          <ElegirArchivosDeCarga
            archivos={nuevos}
            onCambiar={setNuevos}
            disponibles={disponibles}
            descripcion="captura o PDF del pago. Con la cámara o desde la galería."
          />
          {nuevos.length > 0 ? (
            <Button
              size="sm"
              className="mt-2"
              disabled={subir.isPending}
              onClick={() => subir.mutate({ pagoId, archivos: nuevos }, { onSuccess: () => setNuevos([]) })}
            >
              {subir.isPending ? 'Subiendo…' : `Subir ${nuevos.length}`}
            </Button>
          ) : null}
          {subir.error ? <ErrorDeCarga error={subir.error} className="mt-2" /> : null}
        </div>
      ) : null}

      {quitando ? (
        <Modal
          abierto
          ancho="sm"
          onCerrar={() => setQuitando(null)}
          titulo="Quitar el comprobante"
          descripcion="Deja de verse en el pago, pero no se borra: queda anotado quién lo subió, quién lo quitó y por qué."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setQuitando(null)}>
                Volver
              </Button>
              <Button
                disabled={motivo.trim().length < 4 || quitar.isPending}
                onClick={() => quitar.mutate({ id: quitando.id, motivo }, { onSuccess: () => setQuitando(null) })}
              >
                {quitar.isPending ? 'Quitando…' : 'Quitar'}
              </Button>
            </>
          }
        >
          <Textarea label="Motivo" rows={2} autoFocus maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          {quitar.error ? <ErrorDeCarga error={quitar.error} className="mt-3" /> : null}
        </Modal>
      ) : null}
    </div>
  )
}
