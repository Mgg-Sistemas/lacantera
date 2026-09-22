import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

/*
  LA CÁMARA QUE LEE EL QR DEL CARNET

  Primero se pide la cámara —ahí salta el permiso del navegador— y después se
  elige quién descifra el código:

  - `BarcodeDetector`, el lector que traen Chrome y Edge en el teléfono. Es
    nativo y rápido, pero no está en todas partes: en Windows existe el objeto
    y no sabe leer QR, y en Safari de iPhone no existe.
  - `jsqr`, que lee el QR en JavaScript desde un fotograma pintado en un lienzo.
    Funciona donde haya cámara: iPhone, Windows, Firefox.

  Se mira el vídeo cada trescientos milisegundos y, en cuanto sale un código,
  se devuelve y se cierra: un solo toque, una sola marca.

  Si la cámara no abre, el mensaje dice por qué en cristiano. El caso más
  común no es del teléfono: es el servidor prohibiendo la cámara al sitio
  entero con la cabecera Permissions-Policy, y entonces el navegador rechaza
  sin preguntar nada.
*/

interface Detector {
  detect(fuente: HTMLVideoElement): Promise<{ rawValue: string }[]>
}
interface ConDetector {
  BarcodeDetector?: {
    new (o: { formats: string[] }): Detector
    getSupportedFormats?: () => Promise<string[]>
  }
}

type Lector = (v: HTMLVideoElement) => Promise<string | null>

/** El lector nativo si sabe leer QR aquí; si no, el de JavaScript. */
async function elegirLector(lienzo: HTMLCanvasElement): Promise<Lector> {
  const Ctor = (window as unknown as ConDetector).BarcodeDetector
  if (Ctor) {
    const formatos = (await Ctor.getSupportedFormats?.().catch(() => [])) ?? []
    if (formatos.includes('qr_code')) {
      const detector = new Ctor({ formats: ['qr_code'] })
      return async (v) => (await detector.detect(v))[0]?.rawValue ?? null
    }
  }
  const { default: jsQR } = await import('jsqr')
  const ctx = lienzo.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('sin lienzo')
  return async (v) => {
    // A media resolución: sobra para un QR de carnet y descifra el doble de rápido.
    const w = Math.floor(v.videoWidth / 2)
    const h = Math.floor(v.videoHeight / 2)
    if (w === 0 || h === 0) return null
    lienzo.width = w
    lienzo.height = h
    ctx.drawImage(v, 0, 0, w, h)
    const img = ctx.getImageData(0, 0, w, h)
    return jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })?.data ?? null
  }
}

function explicar(e: unknown): string {
  const nombre = e instanceof Error ? e.name : ''
  if (nombre === 'NotAllowedError' || nombre === 'SecurityError')
    return 'La cámara está bloqueada. Si el navegador no preguntó nada, revisa el candado junto a la dirección y permite la cámara; si sigue igual, el servidor tiene la cámara prohibida para el sitio.'
  if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') return 'Este equipo no tiene cámara, o el navegador no la encuentra.'
  if (nombre === 'NotReadableError') return 'Otra aplicación está usando la cámara. Ciérrala y vuelve a intentar.'
  return `No se pudo abrir la cámara: ${e instanceof Error ? e.message : String(e)}`
}

export function EscanerDeCarnet({ onLeido, onCerrar }: { onLeido: (texto: string) => void; onCerrar: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [fallo, setFallo] = useState<string | null>(null)
  const [abriendo, setAbriendo] = useState(true)
  // En una referencia para que un nuevo `onLeido` del padre no reinicie la cámara.
  const alLeer = useRef(onLeido)
  alLeer.current = onLeido

  useEffect(() => {
    let vivo = true
    let flujo: MediaStream | null = null
    let reloj: number | undefined
    let ocupado = false
    const lienzo = document.createElement('canvas')

    if (!navigator.mediaDevices?.getUserMedia) {
      setFallo('Este navegador no da acceso a la cámara. Usa el lector USB o elige a la persona.')
      setAbriendo(false)
      return
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(async (s) => {
        if (!vivo) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        flujo = s
        setAbriendo(false)
        if (video.current) {
          video.current.srcObject = s
          await video.current.play().catch(() => {})
        }
        const leer = await elegirLector(lienzo)
        reloj = window.setInterval(() => {
          const v = video.current
          if (!v || v.readyState < 2 || ocupado || !vivo) return
          ocupado = true
          leer(v)
            .then((texto) => {
              const t = texto?.trim()
              if (t && vivo) {
                vivo = false
                alLeer.current(t)
              }
            })
            .catch(() => {})
            .finally(() => {
              ocupado = false
            })
        }, 300)
      })
      .catch((e: unknown) => {
        setAbriendo(false)
        setFallo(explicar(e))
      })

    return () => {
      vivo = false
      if (reloj) window.clearInterval(reloj)
      flujo?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Escanear el carnet"
      descripcion="Apunta al QR del reverso. En cuanto lo lea, marca solo."
      acciones={<Button variant="ghost" onClick={onCerrar}>Cancelar</Button>}
    >
      {fallo ? (
        <p className="text-danger text-sm">{fallo}</p>
      ) : (
        <div className="relative">
          <video ref={video} muted playsInline className="rounded-card bg-ink/90 aspect-4/3 w-full object-cover" />
          {abriendo ? (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Abriendo la cámara…</p>
          ) : null}
        </div>
      )}
    </Modal>
  )
}
