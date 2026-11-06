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

  /*
    EN EL TELÉFONO, LA HOJA DE COMPARTIR DEL TELÉFONO (como MGG).

    Deja elegir el chat o el grupo de WhatsApp sin salir de la app y sin que
    el enlace pase por el navegador. Si el teléfono no la tiene, o se cancela,
    queda el enlace de siempre.
  */
  const puedeCompartir =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    window.matchMedia('(pointer: coarse)').matches

  const abrirEnWhatsapp = async () => {
    if (puedeCompartir) {
      try {
        await navigator.share({ text: texto })
        return
      } catch (e) {
        // Cerrar la hoja sin elegir no es un error que haya que tapar con otra ventana.
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    window.open(
      `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`,
      '_blank',
      'noopener,noreferrer',
    )
  }

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
          <Button variant="outline" icon={copiado ? <Check /> : <ClipboardCopy />} onClick={() => void copiar()}>
            {copiado ? 'Copiado' : '📋 Copiar mensaje'}
          </Button>
          <Button icon={<ExternalLink />} onClick={() => void abrirEnWhatsapp()}>
            💬 Enviar por WhatsApp
          </Button>
        </>
      }
    >
      <p className="text-ink/45 mb-1.5 text-xs">Vista previa del mensaje</p>
      <pre className="bg-ink/4 text-ink/80 max-h-[55vh] overflow-auto rounded-[6px] p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap select-all">
        {texto}
      </pre>
    </Modal>
  )
}
