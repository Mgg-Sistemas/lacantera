import { useState } from 'react'
import { Visor } from '@/components/Visor'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useEmpresa } from '@/lib/api/empresa'
import type { Almacen, Existencia } from '@/lib/api/inventario'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { armarReporteAlmacen, hojaReporteAlmacen } from '@/lib/ficha/reporteAlmacen'
import { dolares } from '@/lib/formato'
import { useSesion } from '@/lib/sesion'
import { bajarArchivo, escribirXlsx } from '@/lib/xlsx'
import { productos, renglonesDeReporte } from './comun'

/*
  📄 REPORTE · {ALMACÉN} (fase 6, 08/11/2026)

  El modal chico de MGG que se abre desde la tarjeta o la fila de un almacén:
  cuántos productos, cuánto valen, y los dos formatos. El PDF se abre en el
  Visor de La Cantera, que es la «vista previa con botón de descarga» de MGG.
*/

export function ModalReporteAlmacen({
  almacen,
  filas,
  etiquetaDeCategoria,
  onCerrar,
}: {
  almacen: Almacen
  /** Las filas de `v_existencias` de este almacén. */
  filas: Existencia[]
  etiquetaDeCategoria: (codigo: string) => string
  onCerrar: () => void
}) {
  const { data: empresa } = useEmpresa()
  const { nombre: yo } = useSesion()
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [armando, setArmando] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const renglones = renglonesDeReporte(filas, etiquetaDeCategoria)
  const veValor = renglones.some((r) => r.valor !== null)
  const valor = renglones.reduce((s, r) => s + (r.valor ?? 0), 0)

  const verPdf = async () => {
    setArmando(true)
    setError(null)
    try {
      setPdf(
        await armarReporteAlmacen({
          almacen: almacen.nombre,
          renglones,
          empresa: { razonSocial: empresa?.razon_social ?? '', rif: empresa?.rif ?? '' },
          emitidoPor: yo ?? '',
          momento: new Date(),
        }),
      )
    } catch (e) {
      setError(e)
    } finally {
      setArmando(false)
    }
  }

  const bajarExcel = () =>
    bajarArchivo(
      escribirXlsx(hojaReporteAlmacen(almacen.nombre, renglones)),
      `almacen-${almacen.codigo.toLowerCase()}.xlsx`,
    )

  return (
    <>
      <Modal
        abierto
        onCerrar={onCerrar}
        titulo={`📄 Reporte · ${almacen.nombre}`}
        ancho="sm"
        acciones={
          <>
            <Button variant="ghost" onClick={onCerrar}>
              Cerrar
            </Button>
            <Button variant="ghost" disabled={renglones.length === 0} onClick={bajarExcel}>
              ↓ Excel
            </Button>
            <Button disabled={renglones.length === 0 || armando} onClick={() => void verPdf()}>
              {armando ? 'Generando…' : '↓ PDF'}
            </Button>
          </>
        }
      >
        {renglones.length === 0 ? (
          <p className="text-ink/60 text-sm">Este almacén no tiene productos con existencia.</p>
        ) : (
          <p className="text-ink/80 text-sm">
            <strong>{productos(renglones.length)}</strong>
            {veValor ? (
              <>
                {' '}
                · valor total <strong className="tabular">{dolares(valor)}</strong>
              </>
            ) : null}
            .
            <br />
            <span className="text-ink/50 text-xs">
              Elegí el formato. El PDF se abre en vista previa con botón de descarga.
            </span>
          </p>
        )}
        {error ? <ErrorDeCarga error={error} className="mt-3" /> : null}
      </Modal>

      <Visor
        abierto={pdf !== null}
        onCerrar={() => setPdf(null)}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ''}
        titulo={`Reporte · ${almacen.nombre}`}
      />
    </>
  )
}
