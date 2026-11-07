import { useState } from 'react'
import { Visor } from '@/components/Visor'
import { useEmpresa, empresaDelPapel } from '@/lib/api/empresa'
import type { Orden } from '@/lib/api/pedidos'
import { armarSolicitudPedidoPdf } from '@/lib/ficha/pedidosPdf'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'

/** La casilla de la pantalla de teléfono del almacén (ver la migración de la fase 1). */
export const ACCION_TELEFONO_SOLICITUDES = 'INVENTARIO.SOLICITUDES_TELEFONO'

/*
  El PDF de la SP en el visor, para las pantallas del almacén. Como en MGG, se
  abre en la vista previa y no se descarga solo; mientras se arma, el botón
  dice «Armando…».
*/
export function usePdfSolicitud() {
  const { data: empresa } = useEmpresa()
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [armando, setArmando] = useState<number | null>(null)

  const ver = async (o: Orden) => {
    setArmando(o.id)
    try {
      setPdf(await armarSolicitudPedidoPdf(o, empresaDelPapel(empresa)))
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo armar el PDF'), 'error')
    } finally {
      setArmando(null)
    }
  }

  const visor = (
    <Visor
      abierto={pdf !== null}
      onCerrar={() => setPdf(null)}
      blob={pdf?.blob ?? null}
      nombreArchivo={pdf?.nombre ?? 'solicitud.pdf'}
      titulo="Solicitud de Pedido"
    />
  )

  return { ver, armando, visor }
}
