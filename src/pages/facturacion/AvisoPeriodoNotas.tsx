import { useNotasEntrega } from '@/lib/api/ventas'
import { notasPorFacturarEnPeriodo } from '@/lib/fiscal/providencia'

/**
 * Art. 14 de la Providencia SNAT/2026/00093: la venta amparada por una nota de
 * despacho se factura dentro del mismo período de imposición. Avisa de las
 * notas de meses anteriores sin factura y, en los últimos cinco días del mes,
 * de las del mes en curso.
 */
export function AvisoPeriodoNotas() {
  const { data } = useNotasEntrega('DESPACHADA')
  const notas = (data ?? []).filter((n) => n.facturable !== false)
  const p = notasPorFacturarEnPeriodo(notas)
  if (p.vencidas.length === 0 && !(p.cierreCerca && p.delMes.length > 0)) return null

  return (
    <div className="border-warning/40 bg-warning/8 rounded-card mb-4 border px-4 py-3 text-sm">
      <p className="text-warning font-medium">
        Notas de despacho por facturar en el período (Art. 14, Providencia SNAT/2026/00093)
      </p>
      <p className="text-ink/70 mt-0.5 text-xs leading-relaxed">
        {p.vencidas.length > 0
          ? `${p.vencidas.length} nota(s) de meses anteriores siguen sin factura: ${p.vencidas
              .slice(0, 6)
              .map((n) => n.numero)
              .join(', ')}${p.vencidas.length > 6 ? '…' : ''}. `
          : ''}
        {p.cierreCerca && p.delMes.length > 0
          ? `${p.delMes.length} nota(s) de este mes deben facturarse antes del cierre (quedan ${p.diasParaCierre} día(s)).`
          : ''}
      </p>
    </div>
  )
}
