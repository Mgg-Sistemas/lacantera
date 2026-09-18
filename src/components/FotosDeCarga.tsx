import { useEffect, useRef, useState } from 'react'
import { Camera, FileText, Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { usePerfiles } from '@/lib/api/catalogo'
import { fechaHora } from '@/lib/formato'
import {
  MAXIMO_DE_ARCHIVOS,
  TIPOS_ADMITIDOS,
  abrirFotoDeCarga,
  problemaDelArchivo,
  useFotosDeCarga,
  useQuitarFotoDeCarga,
  useSubirFotosDeCarga,
  type FotoDeCarga,
  type OrigenDeCarga,
} from '@/lib/api/fotosDeCarga'

/*
  LAS FOTOS DEL CAMIÓN, EN DOS SITIOS.

  Al pedir la salida o el despacho se eligen (`ElegirArchivosDeCarga`) y suben
  en cuanto el papel tiene número. Después, en el histórico, cada salida y cada
  despacho enseña las suyas (`FotosDeCarga`) con quién las subió y cuándo, y
  deja añadir hasta completar cuatro.

  No van en el PDF impreso: lo pidió así Angélica. Son la prueba de qué camión
  se lo llevó, no parte del documento que firma el cliente.
*/

/** El selector del formulario: guarda los archivos hasta que haya número al que colgarlos. */
export function ElegirArchivosDeCarga({
  archivos,
  onCambiar,
  disponibles = MAXIMO_DE_ARCHIVOS,
}: {
  archivos: File[]
  onCambiar: (a: File[]) => void
  disponibles?: number
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const anadir = (lista: FileList | null) => {
    if (!lista) return
    const nuevos = Array.from(lista)
    const malo = nuevos.map(problemaDelArchivo).find(Boolean) ?? null
    const buenos = nuevos.filter((f) => problemaDelArchivo(f) === null)
    const juntos = [...archivos, ...buenos]
    setAviso(
      malo ??
        (juntos.length > disponibles
          ? `Caben ${disponibles} archivo${disponibles === 1 ? '' : 's'}: se quedaron los primeros.`
          : null),
    )
    onCambiar(juntos.slice(0, disponibles))
    if (entrada.current) entrada.current.value = ''
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          icon={<Camera />}
          disabled={archivos.length >= disponibles}
          onClick={() => entrada.current?.click()}
        >
          Adjuntar fotos o PDF
        </Button>
        <span className="text-ink/50 text-xs">
          {archivos.length} de {disponibles} · del vehículo que se lo lleva. No salen en el papel
          impreso.
        </span>
        <input
          ref={entrada}
          type="file"
          multiple
          accept={TIPOS_ADMITIDOS.join(',')}
          className="hidden"
          onChange={(e) => anadir(e.target.files)}
        />
      </div>

      {archivos.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {archivos.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="border-hairline text-ink/75 flex items-center gap-1.5 rounded-[6px] border px-2 py-1 text-xs"
            >
              {f.type === 'application/pdf' ? (
                <FileText className="size-3.5" />
              ) : (
                <Camera className="size-3.5" />
              )}
              <span className="max-w-[180px] truncate">{f.name}</span>
              <button
                type="button"
                aria-label={`Quitar ${f.name}`}
                className="text-ink/45 hover:text-danger"
                onClick={() => onCambiar(archivos.filter((_, j) => j !== i))}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {aviso ? <p className="text-warning mt-1 text-xs">{aviso}</p> : null}
    </div>
  )
}

/** Una miniatura: la imagen si es foto, un icono si es PDF. Al pulsarla se abre entera. */
function Miniatura({ foto }: { foto: FotoDeCarga }) {
  const [url, setUrl] = useState<string | null>(null)
  const esPdf = foto.tipo === 'application/pdf'

  useEffect(() => {
    if (esPdf) return
    let vigente = true
    let creada: string | null = null
    abrirFotoDeCarga(foto.path)
      .then((u) => {
        creada = u
        if (vigente) setUrl(u)
        else URL.revokeObjectURL(u)
      })
      .catch(() => undefined)
    return () => {
      vigente = false
      if (creada) URL.revokeObjectURL(creada)
    }
  }, [foto.path, esPdf])

  const abrir = async () => {
    // Se abre la ventana antes de descargar: si no, el navegador la toma por
    // una ventana emergente y la bloquea.
    const ventana = window.open('', '_blank')
    try {
      const u = await abrirFotoDeCarga(foto.path)
      if (ventana) ventana.location.href = u
    } catch {
      ventana?.close()
    }
  }

  return (
    <button
      type="button"
      onClick={() => void abrir()}
      title={foto.nombre ?? 'Abrir'}
      className="border-hairline bg-ink/4 hover:border-ink/30 flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-[6px] border"
    >
      {esPdf ? (
        <span className="text-ink/60 flex flex-col items-center gap-1 text-[10px]">
          <FileText className="size-6" />
          PDF
        </span>
      ) : url ? (
        <img src={url} alt={foto.nombre ?? 'Foto del vehículo'} className="size-full object-cover" />
      ) : (
        <Camera className="text-ink/30 size-5" />
      )}
    </button>
  )
}

/** Las fotos de una salida o un despacho, con su rastro. */
export function FotosDeCarga({
  origen,
  referencia,
  puedeAnadir,
}: {
  origen: OrigenDeCarga
  referencia: string
  puedeAnadir: boolean
}) {
  const { data } = useFotosDeCarga(origen)
  const { data: perfiles } = usePerfiles()
  const subir = useSubirFotosDeCarga()
  const quitar = useQuitarFotoDeCarga()
  const [nuevos, setNuevos] = useState<File[]>([])
  const [quitando, setQuitando] = useState<FotoDeCarga | null>(null)
  const [motivo, setMotivo] = useState('')

  const nombreDe = (uid: string | null) =>
    (uid && perfiles?.find((p) => p.id === uid)?.nombre) || '—'

  const todas = (data ?? []).filter((f) => f.referencia === referencia)
  const vigentes = todas.filter((f) => !f.quitada_en)
  const quitadas = todas.filter((f) => f.quitada_en)
  const disponibles = MAXIMO_DE_ARCHIVOS - vigentes.length

  if (todas.length === 0 && !puedeAnadir) return null

  return (
    <div className="mt-3">
      <p className="text-ink/55 mb-1.5 flex items-center gap-1.5 text-xs font-medium">
        <Paperclip className="size-3.5" />
        Fotos del vehículo ({vigentes.length} de {MAXIMO_DE_ARCHIVOS})
      </p>

      {vigentes.length > 0 ? (
        <ul className="flex flex-wrap gap-3">
          {vigentes.map((f) => (
            <li key={f.id} className="w-20">
              <Miniatura foto={f} />
              <p className="text-ink/45 mt-1 text-[10px] leading-tight">
                {nombreDe(f.subida_por)}
                <br />
                {fechaHora(f.subida_en)}
              </p>
              {puedeAnadir ? (
                <button
                  type="button"
                  className="text-ink/45 hover:text-danger text-[10px] underline"
                  onClick={() => {
                    setMotivo('')
                    setQuitando(f)
                  }}
                >
                  Quitar
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {quitadas.length > 0 ? (
        <ul className="text-ink/45 mt-2 space-y-0.5 text-[11px]">
          {quitadas.map((f) => (
            <li key={f.id}>
              <span className="line-through">{f.nombre ?? 'Archivo'}</span> · la subió{' '}
              {nombreDe(f.subida_por)} · la quitó {nombreDe(f.quitada_por)} el{' '}
              {fechaHora(f.quitada_en!)}: «{f.motivo_quitada}»
            </li>
          ))}
        </ul>
      ) : null}

      {puedeAnadir && disponibles > 0 ? (
        <div className="mt-2">
          <ElegirArchivosDeCarga archivos={nuevos} onCambiar={setNuevos} disponibles={disponibles} />
          {nuevos.length > 0 ? (
            <Button
              size="sm"
              className="mt-2"
              disabled={subir.isPending}
              onClick={() =>
                subir.mutate(
                  { origen, referencias: [referencia], archivos: nuevos },
                  { onSuccess: () => setNuevos([]) },
                )
              }
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
          titulo="Quitar el archivo"
          descripcion="Deja de contar entre los cuatro, pero queda anotado quién lo subió, quién lo quitó y por qué."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setQuitando(null)}>
                Volver
              </Button>
              <Button
                disabled={motivo.trim().length < 4 || quitar.isPending}
                onClick={() =>
                  quitar.mutate(
                    { id: quitando.id, motivo },
                    { onSuccess: () => setQuitando(null) },
                  )
                }
              >
                {quitar.isPending ? 'Quitando…' : 'Quitar'}
              </Button>
            </>
          }
        >
          <Textarea
            label="Por qué se quita"
            rows={2}
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          {quitar.error ? <ErrorDeCarga error={quitar.error} className="mt-3" /> : null}
        </Modal>
      ) : null}
    </div>
  )
}
