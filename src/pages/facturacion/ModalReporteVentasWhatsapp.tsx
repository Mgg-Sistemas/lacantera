import { useState } from 'react'
import { Check, ClipboardCopy, Download, ExternalLink } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { copiarAlPortapapeles } from '@/lib/ficha/reporteDiario'

interface Props {
  texto: string
  onCerrar: () => void
}

export function ModalReporteVentasWhatsapp({ texto, onCerrar }: Props) {
  const [copiado, setCopiado] = useState(false)

  const copiar = async () => {
    const exito = await copiarAlPortapapeles(texto)
    setCopiado(exito)
  }

  const descargar = () => {
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date())
    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporte-ventas-${hoy}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const abrirEnWhatsapp = () => {
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Reporte de ventas para WhatsApp"
      descripcion="Mensaje formateado con emojis para copiar y pegar en grupos de WhatsApp o chat."
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cerrar
          </Button>
          <Button variant="outline" icon={<Download />} onClick={descargar}>
            Descargar .txt
          </Button>
          <Button variant="outline" icon={<ExternalLink />} onClick={abrirEnWhatsapp}>
            Abrir WhatsApp
          </Button>
          <Button icon={copiado ? <Check /> : <ClipboardCopy />} onClick={() => void copiar()}>
            {copiado ? 'Copiado' : 'Copiar mensaje'}
          </Button>
        </>
      }
    >
      <p className="text-ink/45 mb-1.5 text-xs">Vista previa del mensaje</p>
      <pre className="bg-ink/4 text-ink/80 max-h-80 overflow-auto rounded-[6px] p-3 text-xs leading-relaxed whitespace-pre-wrap select-all font-mono">
        {texto}
      </pre>
      {copiado ? null : (
        <p className="text-ink/45 mt-2 text-xs">
          Puedes pulsar «Copiar mensaje» o «Abrir WhatsApp» para compartir directamente.
        </p>
      )}
    </Modal>
  )
}
