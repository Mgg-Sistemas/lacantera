import { useState } from 'react'
import { Check, ClipboardCopy, Download, Share2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Cargando } from '@/components/ui/Estado'
import { useFotosDeCarga, archivosDeCarga } from '@/lib/api/fotosDeCarga'
import {
  bajaDe,
  motivoDeSalida,
  nombreDeMovimiento,
  paraQuienSalio,
  useGruposDeSalida,
  useReferenciaDeFotosDelMovimiento,
} from '@/lib/api/inventario'
import type { Movimiento } from '@/lib/api/inventario'
import { textoDelReporteMovimiento } from '@/lib/ficha/reporteMovimiento'
import { copiarAlPortapapeles } from '@/lib/ficha/reporteDiario'
import { compartirConFotos } from '@/lib/ficha/compartirWhatsapp'

/**
 * El reporte de UN movimiento del libro de inventario, listo para compartir.
 * Hermano de `ModalReporteSalida.tsx`/`ModalReporteDespacho.tsx`: mismo
 * patrón de texto + fotos, pero aquí las fotos pueden no existir —ver
 * `useReferenciaDeFotosDelMovimiento`— porque no todo movimiento nace de un
 * papel que las traiga.
 */
export function ModalReporteMovimiento({
  m,
  quien,
  onCerrar,
}: {
  m: Movimiento
  quien: string
  onCerrar: () => void
}) {
  const [copiado, setCopiado] = useState(false)
  const [compartiendo, setCompartiendo] = useState(false)
  const [avisoCompartir, setAvisoCompartir] = useState<string | null>(null)

  const grupos = useGruposDeSalida()
  const { data: refFotos, isPending: buscandoRef } = useReferenciaDeFotosDelMovimiento(m.id)
  const { data: fotos, isPending: buscandoFotos } = useFotosDeCarga(refFotos?.origen)
  const fotosDeEsteMovimiento = (fotos ?? []).filter(
    (f) => f.referencia === refFotos?.referencia && f.quitada_en === null,
  )

  const cargando = buscandoRef || (refFotos != null && buscandoFotos)

  const destino = bajaDe(m)?.destino
  const paraQuien = paraQuienSalio(m, grupos.data) ?? destino ?? null

  const texto = textoDelReporteMovimiento({
    numero: m.numero,
    tipo: nombreDeMovimiento(m),
    fecha: m.fecha,
    articulo: m.articulo?.nombre ?? 'Artículo',
    almacen: m.almacen?.nombre ?? '—',
    cantidad: m.cantidad,
    unidad: m.unidad,
    signo: m.signo,
    valorUsd: m.valor_usd,
    paraQuien,
    nota: motivoDeSalida(m) ?? m.nota,
    registradoPor: quien,
    fotos: refFotos ? fotosDeEsteMovimiento.length : null,
  })

  const copiar = async () => {
    setCopiado(await copiarAlPortapapeles(texto))
  }

  const descargar = () => {
    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `movimiento-${m.numero}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const compartir = async () => {
    setCompartiendo(true)
    setAvisoCompartir(null)
    try {
      const archivos = await archivosDeCarga(fotosDeEsteMovimiento)
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
      titulo="Reporte del movimiento"
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
            disabled={compartiendo || cargando}
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
      {cargando ? <Cargando /> : null}
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
