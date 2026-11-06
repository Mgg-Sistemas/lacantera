import { useState } from 'react'
import { Check, ClipboardCopy, ExternalLink } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { copiarAlPortapapeles } from '@/lib/ficha/reporteDiario'

/*
  EL MENSAJE SE VE ANTES DE MANDARLO.

  Nada de compras sale solo por WhatsApp: el botón abre esta vista previa, y
  desde aquí se copia o se abre WhatsApp con el texto puesto. Es el mismo
  patrón del reporte de ventas.
*/
export function ModalWhatsappCompra({
  titulo,
  texto,
  onCerrar,
}: {
  titulo: string
  texto: string
  onCerrar: () => void
}) {
  const [copiado, setCopiado] = useState(false)

  const copiar = async () => setCopiado(await copiarAlPortapapeles(texto))

  const abrirEnWhatsapp = () =>
    window.open(
      `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`,
      '_blank',
      'noopener,noreferrer',
    )

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={titulo}
      descripcion="Revise el mensaje y mándelo por WhatsApp o cópielo."
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cerrar
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
      <pre className="bg-ink/4 text-ink/80 max-h-80 overflow-auto rounded-[6px] p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap select-all">
        {texto}
      </pre>
    </Modal>
  )
}
