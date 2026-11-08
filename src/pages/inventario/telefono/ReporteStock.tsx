import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { mensajeDe } from '@/lib/avisosFlotantes'
import { useReporteDeStock } from '@/lib/api/almacenTelefono'
import type { Almacen as Sitio } from '@/lib/api/inventario'
import { mensajeStock } from '@/lib/ficha/inventarioWhatsapp'
import { fechasMal, rangoDe } from './comun'
import { CabeceraDePaso, CompartirWhatsapp, RangoDeFechas } from './piezas'

/*
  📲 REPORTE DE STOCK, EN EL TELÉFONO (MGG `ReporteStock`, fase 1b, 08/11/2026).

  Lo que había en el almacén al cierre del «hasta» y lo que entró (📥) y salió
  (📤) en esas fechas, agrupado por categoría, listo para WhatsApp. La cuenta
  la hace la base (`reporte_de_stock`) sobre el libro, no el teléfono. Como en
  MGG, no tiene PDF.
*/

export function ReporteStock({
  almacen,
  quien,
  empresa,
  etiquetaCategoria,
  onVolver,
}: {
  almacen: Sitio
  quien: string
  empresa: string
  etiquetaCategoria: (codigo: string) => string
  onVolver: () => void
}) {
  const [rango, setRango] = useState(() => rangoDe('mes'))
  const mal = fechasMal(rango.desde, rango.hasta)
  const reporte = useReporteDeStock(almacen.id, rango.desde, rango.hasta, !mal)

  const texto = useMemo(() => {
    if (!reporte.data) return ''
    const filas = reporte.data
      .map((f) => ({
        nombre: f.nombre,
        categoria: etiquetaCategoria(f.categoria),
        unidad: f.unidad,
        cierre: Number(f.cierre) || 0,
        entradas: Number(f.entradas) || 0,
        salidas: Number(f.salidas) || 0,
      }))
      .sort((a, b) => a.categoria.localeCompare(b.categoria, 'es') || a.nombre.localeCompare(b.nombre, 'es'))
    return mensajeStock({ almacen: almacen.nombre, empresa, desde: rango.desde, hasta: rango.hasta, filas, quien })
  }, [reporte.data, etiquetaCategoria, almacen.nombre, empresa, rango, quien])

  return (
    <section className="bg-surface shadow-card mt-4 space-y-4 rounded-[10px] p-4">
      <CabeceraDePaso icono="📲" titulo={`Reporte de stock · ${almacen.nombre}`} onVolver={onVolver} />
      <RangoDeFechas
        atajos={['hoy', 'mes', 'mesPasado']}
        desde={rango.desde}
        hasta={rango.hasta}
        onCambiar={(desde, hasta) => setRango({ desde, hasta })}
      />
      <p className="text-ink/55 text-xs">
        Muestra lo que había al cierre del «hasta» y lo que entró (📥) y salió (📤) en esas fechas.
      </p>
      {!mal && reporte.isPending ? <p className="text-ink/50 text-sm">Armando el reporte…</p> : null}
      {reporte.error ? <p className="text-danger text-sm">{mensajeDe(reporte.error, 'No se pudo armar')}</p> : null}
      {!mal && texto ? <CompartirWhatsapp texto={texto} /> : null}
      <Button block size="lg" variant="ghost" onClick={onVolver}>
        ← Volver
      </Button>
    </section>
  )
}
