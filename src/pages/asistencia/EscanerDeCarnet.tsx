import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

/*
  LA CÁMARA QUE LEE EL QR DEL CARNET

  Sin librería: el navegador trae un lector de códigos —`BarcodeDetector`— en
  Chrome y Edge, en el teléfono y en el computador. Donde no existe (Firefox,
  Safari de escritorio) el botón de la cámara no aparece y se marca con el
  lector USB o eligiendo a la persona, que funcionan en todos.

  Se pide la cámara trasera, que es la que apunta al carnet. Se mira el vídeo
  cada trescientos milisegundos y, en cuanto sale un código, se devuelve y se
  cierra: un solo toque, una sola marca.
*/

interface Detector {
  detect(fuente: HTMLVideoElement): Promise<{ rawValue: string }[]>
}
interface ConDetector {
  BarcodeDetector?: new (o: { formats: string[] }) => Detector
}

export function EscanerDeCarnet({ onLeido, onCerrar }: { onLeido: (texto: string) => void; onCerrar: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [fallo, setFallo] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    let flujo: MediaStream | null = null
    let reloj: number | undefined
    const Ctor = (window as unknown as ConDetector).BarcodeDetector
    if (!Ctor) {
      setFallo('Este navegador no sabe leer códigos con la cámara.')
      return
    }
    const detector = new Ctor({ formats: ['qr_code'] })

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((s) => {
        if (!vivo) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        flujo = s
        if (video.current) {
          video.current.srcObject = s
          void video.current.play()
        }
        reloj = window.setInterval(() => {
          const v = video.current
          if (!v || v.readyState < 2) return
          detector
            .detect(v)
            .then((codigos) => {
              const texto = codigos[0]?.rawValue?.trim()
              if (texto && vivo) {
                vivo = false
                onLeido(texto)
              }
            })
            .catch(() => {})
        }, 300)
      })
      .catch((e: Error) => setFallo(`No se pudo abrir la cámara: ${e.message}`))

    return () => {
      vivo = false
      if (reloj) window.clearInterval(reloj)
      flujo?.getTracks().forEach((t) => t.stop())
    }
  }, [onLeido])

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
        <video ref={video} muted playsInline className="rounded-card bg-ink/90 aspect-[4/3] w-full object-cover" />
      )}
    </Modal>
  )
}
