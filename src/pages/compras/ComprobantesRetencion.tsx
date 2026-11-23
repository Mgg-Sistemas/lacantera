/*
  COMPROBANTES DE RETENCIÓN DE UNA FACTURA DEL PROVEEDOR (Art. 18 de la
  Providencia SNAT/2026/00093 · 23/11/2026).

  Solo aparece si la ficha de la empresa dice que es agente de retención y la
  factura tiene retención de IVA o de ISLR registrada. El número
  (AAAAMMSSSSSSSS) lo da la base la primera vez y no cambia: imprimirlo otra
  vez saca el mismo comprobante.
*/
import { useState } from 'react'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { Visor } from '@/components/Visor'
import { supabase } from '@/lib/supabase'
import { empresaDelPapel, useEmpresa } from '@/lib/api/empresa'
import { useMiPerfil } from '@/lib/api/usuarios'
import { hoyEnCaracas } from '@/lib/api/tasas'
import type { FacturaCompra } from '@/lib/api/facturasCompra'
import {
  useComprobantesRetencion,
  useConfigFiscal,
  useEmitirComprobanteRetencion,
} from '@/lib/api/seniat'
import { armarComprobanteRetencion } from '@/lib/ficha/comprobanteRetencionPdf'
import type { PdfArmado } from '@/lib/ficha/reciboPdf'

export function ComprobantesRetencion({ factura }: { factura: FacturaCompra }) {
  const fiscal = useConfigFiscal()
  const { data: empresa } = useEmpresa()
  const { data: yo } = useMiPerfil()
  const existentes = useComprobantesRetencion(factura.id)
  const emitir = useEmitirComprobanteRetencion()
  const [pdf, setPdf] = useState<PdfArmado | null>(null)

  const tipos = (
    [
      ['IVA', Number(factura.retencion_iva)],
      ['ISLR', Number(factura.retencion_islr)],
    ] as const
  ).filter(([, monto]) => monto > 0)

  if (!fiscal.agenteRetencion || tipos.length === 0 || factura.estado === 'ANULADA') return null

  const imprimir = async (tipo: 'IVA' | 'ISLR', monto: number) => {
    const numero = await emitir.mutateAsync({ factura_compra_id: factura.id, tipo })
    const ya = (existentes.data ?? []).find((c) => c.tipo === tipo)
    const { data: prov } = await supabase
      .from('proveedores')
      .select('direccion, correo')
      .eq('id', factura.proveedor_id)
      .maybeSingle()
    const fechaEmision = ya?.fecha_emision ?? hoyEnCaracas()
    const papel = empresaDelPapel(empresa)
    const domicilioFiscal = [empresa?.domicilio_fiscal, empresa?.ciudad, empresa?.estado]
      .filter(Boolean)
      .join(', ')
    setPdf(
      await armarComprobanteRetencion({
        numero,
        tipo,
        fechaEmision,
        periodo: ya?.periodo ?? numero.slice(0, 6),
        empresa: { ...papel, domicilioFiscal: domicilioFiscal || null },
        proveedor: {
          nombre: factura.proveedor,
          rif: factura.proveedor_rif,
          domicilio: (prov as { direccion?: string | null } | null)?.direccion ?? null,
          correo: (prov as { correo?: string | null } | null)?.correo ?? null,
        },
        factura: {
          numero: factura.numero_factura,
          control: factura.numero_control,
          fecha: factura.fecha_emision,
          moneda: factura.moneda,
          tasa: Number(factura.tasa),
          total: Number(factura.total),
          base: Number(factura.base_imponible),
          exento: Number(factura.exento),
          alicuota: Number(factura.alicuota_iva),
          iva: Number(factura.iva),
        },
        retenido: monto,
        porcentaje:
          tipo === 'IVA' && Number(factura.iva) > 0
            ? Math.round((monto / Number(factura.iva)) * 10000) / 100
            : null,
        emitidoPor: yo?.nombre ?? '',
      }),
    )
  }

  return (
    <div className="border-hairline mt-2 border-t pt-2">
      <p className="text-ink/55 mb-1.5 text-xs">Comprobantes de retención (Art. 18)</p>
      <div className="flex flex-wrap gap-2">
        {tipos.map(([tipo, monto]) => {
          const ya = (existentes.data ?? []).find((c) => c.tipo === tipo)
          return (
            <Button
              key={tipo}
              size="sm"
              variant="outline"
              icon={<FileText />}
              disabled={emitir.isPending}
              onClick={() => void imprimir(tipo, monto)}
            >
              {ya ? `Comprobante ${tipo} · ${ya.numero}` : `Emitir comprobante ${tipo}`}
            </Button>
          )
        })}
      </div>
      {emitir.error ? <ErrorDeCarga error={emitir.error} className="mt-2" /> : null}
      <Visor
        abierto={pdf !== null}
        onCerrar={() => setPdf(null)}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ''}
        titulo="Comprobante de retención"
      />
    </div>
  )
}
