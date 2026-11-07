import { useState } from 'react'
import { CheckCircle2, MessageCircle, Plus } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { usePerfiles } from '@/lib/api/catalogo'
import { useCompra } from '@/lib/api/compras'
import { useEmpresa } from '@/lib/api/empresa'
import { renglonesComoSePidieron, textoSolicitudPedido } from '@/lib/ficha/comprasWhatsapp'
import { estadoDeLaCompra } from '@/pages/compras/etiquetasDeEstado'
import { ModalWhatsappCompra } from '@/pages/compras/ModalWhatsappCompra'

/*
  LA SOLICITUD ENVIADA, PARA QUIEN NO LLEVA COMPRAS.

  Pedir lo puede cualquiera (06/11/2026), pero el detalle de compras es de
  quien lleva compras. Quien solo pide se queda aquí: ve que salió, con su
  número, y manda el WhatsApp al almacén general, como en MGG.
*/
export function PedidoEnviado({ id, onOtra }: { id: number; onOtra: () => void }) {
  const { data: compra, isPending, error } = useCompra(id)
  const { data: perfiles } = usePerfiles()
  const { data: empresa } = useEmpresa()
  const [whatsapp, setWhatsapp] = useState(true)

  if (isPending) return <Cargando texto="Enviando la solicitud…" />
  if (error) return <ErrorDeCarga error={error} />
  if (!compra) return <ErrorDeCarga error={new Error('No se encontró la solicitud.')} />

  const perfil = perfiles?.find((p) => p.id === compra.solicitante_id)
  const solicitante = perfil?.nombre ?? compra.solicitante_nombre ?? '—'
  const cargo = compra.solicitante_cargo ?? perfil?.cargo ?? null

  const texto = textoSolicitudPedido({
    compra,
    renglones: renglonesComoSePidieron(compra),
    personas: { solicita: solicitante },
    cargo,
    estado: estadoDeLaCompra(compra),
    empresa: empresa?.razon_social,
  })

  return (
    <Card className="mx-auto max-w-lg text-center">
      <CheckCircle2 className="text-success mx-auto size-10" />
      <h2 className="text-ink/90 mt-3 text-lg font-semibold">Solicitud {compra.numero} enviada</h2>
      <p className="text-ink/55 mt-1 text-sm">
        Va al almacén general, que dice si lo tiene. Lo que falte pasa a Compras.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button variant="outline" icon={<MessageCircle />} onClick={() => setWhatsapp(true)}>
          WhatsApp
        </Button>
        <Button icon={<Plus />} onClick={onOtra}>
          Hacer otra solicitud
        </Button>
      </div>

      {whatsapp ? (
        <ModalWhatsappCompra
          titulo="WhatsApp del pedido"
          texto={texto}
          onCerrar={() => setWhatsapp(false)}
        />
      ) : null}
    </Card>
  )
}
