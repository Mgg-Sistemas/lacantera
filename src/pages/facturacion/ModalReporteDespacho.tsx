import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ClipboardCopy, Download, Share2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { desenvolver } from '@/lib/api/rpc'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { useRenglones, type NotaEntrega } from '@/lib/api/ventas'
import { useFotosDeCarga, archivosDeCarga } from '@/lib/api/fotosDeCarga'
import { textoDelReporteDespacho } from '@/lib/ficha/reporteDespacho'
import { copiarAlPortapapeles } from '@/lib/ficha/reporteDiario'
import { compartirConFotos } from '@/lib/ficha/compartirWhatsapp'

/**
 * El reporte de UN despacho, listo para compartir.
 *
 * Christopher, 16/10/2026: «me están pidiendo un reporte individual de cada
 * salida y nota de entrega». Sale solo apenas se aprueba el despacho —ver el
 * aviso en `NotasDeEntrega.tsx`— y también se puede volver a abrir desde el
 * detalle de la nota, por si hay que reenviarlo días después.
 */
export function ModalReporteDespacho({
  notaId,
  solicitudNumero,
  razonSocial,
  pedidoPor,
  aprobadoPor,
  onCerrar,
}: {
  notaId: number
  /** El número de la SOLICITUD (SD-...), de donde cuelgan las fotos. Null si no se sabe —una nota ya vieja—. */
  solicitudNumero: string | null
  razonSocial: string
  pedidoPor: string | null
  aprobadoPor: string | null
  onCerrar: () => void
}) {
  const [copiado, setCopiado] = useState(false)
  const [compartiendo, setCompartiendo] = useState(false)
  const [avisoCompartir, setAvisoCompartir] = useState<string | null>(null)

  const nota = useQuery({
    queryKey: ['ventas', 'nota-para-reporte', notaId],
    queryFn: async () => {
      const filas = desenvolver<NotaEntrega[]>(
        await supabase.from('v_notas_entrega').select('*').eq('id', notaId).limit(1),
      )
      return filas[0] ?? null
    },
  })
  const renglones = useRenglones('nota_entrega_renglones', 'nota_id', notaId)
  const { data: fotos } = useFotosDeCarga('DESPACHO')

  const fotosDeEsteDespacho = (fotos ?? []).filter(
    (f) => f.referencia === solicitudNumero && f.quitada_en === null,
  )

  const texto = nota.data
    ? textoDelReporteDespacho({
        numero: nota.data.numero,
        razonSocial,
        fecha: nota.data.fecha,
        cliente: nota.data.cliente,
        camiones:
          nota.data.camiones.length > 0
            ? nota.data.camiones.map((c) => ({ vehiculo: c.vehiculo, chofer: c.chofer }))
            : [{ vehiculo: nota.data.vehiculo, chofer: nota.data.chofer }],
        renglones: (renglones.data ?? []).map((r) => ({
          cantidad: r.cantidad,
          unidad: r.unidad,
          descripcion: r.descripcion,
        })),
        moneda: nota.data.moneda,
        total: nota.data.total,
        totalBs: nota.data.total_bs,
        totalUsd: nota.data.total_usd,
        pedidoPor,
        aprobadoPor,
        fotos: fotosDeEsteDespacho.length,
      })
    : ''

  const copiar = async () => {
    setCopiado(await copiarAlPortapapeles(texto))
  }

  const descargar = () => {
    if (!nota.data) return
    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `despacho-${nota.data.numero}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const compartir = async () => {
    setCompartiendo(true)
    setAvisoCompartir(null)
    try {
      const archivos = await archivosDeCarga(fotosDeEsteDespacho)
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
      titulo="Reporte del despacho"
      descripcion="El mensaje para compartir por WhatsApp. No se guarda en el sistema."
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cerrar
          </Button>
          <Button variant="outline" icon={<Download />} disabled={!nota.data} onClick={descargar}>
            Descargar .txt
          </Button>
          <Button
            variant="outline"
            icon={<Share2 />}
            disabled={!nota.data || compartiendo}
            onClick={() => void compartir()}
          >
            {compartiendo ? 'Abriendo…' : 'Compartir con fotos'}
          </Button>
          <Button icon={copiado ? <Check /> : <ClipboardCopy />} disabled={!nota.data} onClick={() => void copiar()}>
            {copiado ? 'Copiado' : 'Copiar el mensaje'}
          </Button>
        </>
      }
    >
      {nota.isPending ? <Cargando /> : null}
      {nota.error ? <ErrorDeCarga error={nota.error} /> : null}

      {nota.data ? (
        <>
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
        </>
      ) : null}
    </Modal>
  )
}
