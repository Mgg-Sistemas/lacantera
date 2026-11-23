import { Modal } from '@/components/ui/Modal'
import { CalendarioBancarioView } from './CalendarioBancarioView'

interface CalendarioBancarioModalProps {
  abierto: boolean
  onCerrar: () => void
}

export function CalendarioBancarioModal({ abierto, onCerrar }: CalendarioBancarioModalProps) {
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Calendario bancario (SUDEBAN)"
      descripcion="Feriados bancarios, nacionales y cálculo del siguiente día hábil oficial para la tasa BCV."
      ancho="xl"
    >
      <CalendarioBancarioView onCerrar={onCerrar} />
    </Modal>
  )
}
