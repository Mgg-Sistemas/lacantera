import { useState } from 'react'
import { Check, ClipboardCopy, Download, Share2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useFotosDeCarga, archivosDeCarga } from '@/lib/api/fotosDeCarga'
import type { SolicitudDeSalida } from '@/lib/api/salidas'
import { textoDelReporteSalida } from '@/lib/ficha/reporteSalida'
import { copiarAlPortapapeles } from '@/lib/ficha/reporteDiario'
import { compartirConFotos } from '@/lib/ficha/compartirWhatsapp'

/**
 * El reporte de UNA salida, listo para compartir. Hermano de
 * `ModalReporteDespacho.tsx`: ver ahí el porqué de que exista por nota y no
 * por rango de fechas.
 */
export function ModalReporteSalida({
  s,
  numeroNota,
  razonSocial,
  destino,
  camiones,
  pedidoPor,
  aprobadoPor,
  entregadoPor,
  onCerrar,
}: {
  s: SolicitudDeSalida
  /** El NS- de verdad. Puede diferir de `s.nota_salida` justo al entregar, cuando todavía no se refrescó la lista. */
  numeroNota: string
  razonSocial: string
  destino: string | null
  /**
   * Los camiones de verdad, los de la NOTA —no el `vehiculo` de la orden,
   * que es lo que se escribió a mano al pedir y puede no coincidir con lo
   * que de verdad se cargó—. Si quien llama todavía no tiene la nota —justo
   * al entregar, antes de completarla—, pasa un arreglo vacío.
   */
  camiones: Array<{ vehiculo: string | null; chofer: string | null }>
  pedidoPor: string | null
  aprobadoPor: string | null
  entregadoPor: string | null
  onCerrar: () => void
}) {
  const [copiado, setCopiado] = useState(false)
  const [compartiendo, setCompartiendo] = useState(false)
  const [avisoCompartir, setAvisoCompartir] = useState<string | null>(null)

  const { data: fotos } = useFotosDeCarga('SALIDA')
  const fotosDeEstaSalida = (fotos ?? []).filter(
    (f) => f.referencia === s.numero && f.quitada_en === null,
  )

  const texto = textoDelReporteSalida({
    numeroOrden: s.numero,
    numeroNota,
    razonSocial,
    fecha: s.pedida_en,
    almacen: s.almacen?.nombre ?? '—',
    destino,
    camiones,
    renglones: (s.renglones ?? []).map((r) => ({
      cantidad: r.cantidad,
      unidad: r.articulo?.unidad ?? r.presentacion ?? '',
      articulo: r.articulo?.nombre ?? 'Artículo',
    })),
    pedidoPor,
    aprobadoPor,
    entregadoPor,
    fotos: fotosDeEstaSalida.length,
  })

  const copiar = async () => {
    setCopiado(await copiarAlPortapapeles(texto))
  }

  const descargar = () => {
    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `salida-${numeroNota}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const compartir = async () => {
    setCompartiendo(true)
    setAvisoCompartir(null)
    try {
      const archivos = await archivosDeCarga(fotosDeEstaSalida)
      const resultado = await compartirConFotos(texto, archivos)
      if (resultado === 'sin_soporte') {
        setAvisoCompartir(
          'Este navegador no deja compartir así. Use «Copiar el mensaje» y péguelo a mano.',
        )
      }
    } finally {
      setCompartiendo(false)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Reporte de la salida"
      descripcion="El mensaje para compartir por WhatsApp. No se guarda en el sistema."
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cerrar
          </Button>
          <Button variant="outline" icon={<Download />} onClick={descargar}>
            Descargar .txt
          </Button>
          <Button
            variant="outline"
            icon={<Share2 />}
            disabled={compartiendo}
            onClick={() => void compartir()}
          >
            {compartiendo ? 'Abriendo…' : 'Compartir con fotos'}
          </Button>
          <Button icon={copiado ? <Check /> : <ClipboardCopy />} onClick={() => void copiar()}>
            {copiado ? 'Copiado' : 'Copiar el mensaje'}
          </Button>
        </>
      }
    >
      <p className="text-ink/45 mb-1.5 text-xs">Así va a quedar</p>
      <pre className="bg-ink/4 text-ink/80 max-h-80 overflow-auto rounded-[6px] p-3 text-xs leading-relaxed whitespace-pre-wrap">
        {texto}
      </pre>
      {avisoCompartir ? <p className="text-warning mt-2 text-xs">{avisoCompartir}</p> : null}
      {copiado ? null : (
        <p className="text-ink/45 mt-2 text-xs">
          Si el botón de copiar no funciona, el texto de arriba se puede seleccionar a mano.
        </p>
      )}
    </Modal>
  )
}
