import { useState } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Interruptor } from '@/components/ui/Interruptor'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { Visor } from '@/components/Visor'
import { useArticulos, useCategoriasDeInventario, useUnidades } from '@/lib/api/catalogo'
import { empresaDelPapel, useEmpresa } from '@/lib/api/empresa'
import { enArbol, useAlmacenes } from '@/lib/api/inventario'
import { hoyEnCaracas } from '@/lib/api/tasas'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { armarPlanillaDeEntrada } from '@/lib/ficha/planillaDeEntradaPdf'
import { useSesion } from '@/lib/sesion'

/*
  «PLANILLA DE ENTRADA (PDF)» (12/11/2026).

  El formulario de «Entrada de material» en papel, para llenarlo con
  bolígrafo donde no hay teléfono a mano y pasarlo al sistema después. Las
  listas —almacenes, unidades, categorías y, si se pide, el catálogo— se leen
  al imprimir, para que el papel solo ofrezca lo que el sistema acepta.

  Los almacenes son los mismos del desplegable de la entrada: `useAlmacenes`
  ya deja fuera los sitios del sistema (en camino) y los que no guardan
  material. Se quita además el que admite material sin costo (el tanque del
  combustible inicial): nadie recibe material ahí con una planilla.

  Solo lee: no escribe nada en la base.
*/

export function BotonPlanillaDeEntrada() {
  const { data: almacenes } = useAlmacenes()
  const { data: unidades } = useUnidades()
  const { data: categorias } = useCategoriasDeInventario()
  const { data: articulos } = useArticulos()
  const { data: empresa } = useEmpresa()
  const { nombre: yo } = useSesion()

  const [abierto, setAbierto] = useState(false)
  const [conCatalogo, setConCatalogo] = useState(true)
  const [conLogo, setConLogo] = useState(true)
  const [armando, setArmando] = useState(false)
  const [falla, setFalla] = useState<unknown>(null)
  const [archivo, setArchivo] = useState<ArchivoArmado | null>(null)

  const listo = Boolean(almacenes && unidades && categorias && articulos)

  const armar = async () => {
    setArmando(true)
    setFalla(null)
    try {
      const sitios = (almacenes ?? []).filter((a) => !a.admite_sin_costo)
      if (sitios.length === 0) throw new Error('No hay ningún almacén activo donde recibir material.')
      const nombrePorId = new Map(sitios.map((a) => [a.id, a.nombre]))
      const etiqueta = new Map((categorias ?? []).map((c) => [c.codigo, c.etiqueta]))
      setArchivo(
        await armarPlanillaDeEntrada({
          almacenes: enArbol(sitios).map(({ a }) => ({
            nombre: a.nombre,
            padre: (a.padre_id && nombrePorId.get(a.padre_id)) || null,
          })),
          unidades: (unidades ?? []).map((u) => u.codigo),
          categorias: (categorias ?? []).filter((c) => c.activa).map((c) => c.etiqueta),
          catalogo: (articulos ?? [])
            .filter((a) => a.activo && a.inventariable)
            .map((a) => ({
              codigo: a.codigo,
              nombre: a.nombre,
              categoria: etiqueta.get(a.categoria) ?? a.categoria,
              unidad: a.unidad,
            })),
          conCatalogo,
          conLogo,
          empresa: empresaDelPapel(empresa),
          emitidoPor: yo ?? '',
          momento: new Date(),
          nombreArchivo: `planilla-de-entrada-${hoyEnCaracas()}${conLogo ? '' : '-sin-logo'}.pdf`,
        }),
      )
      setAbierto(false)
    } catch (e) {
      setFalla(e)
    } finally {
      setArmando(false)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        title="Imprimir una planilla en blanco para anotar a mano lo que entra al almacén"
        onClick={() => {
          setFalla(null)
          setAbierto(true)
        }}
      >
        Planilla de entrada (PDF)
      </Button>

      <Modal
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        titulo="Planilla de entrada para llenar a mano"
        descripcion="Hoja horizontal en blanco con los mismos campos de «Registrar entrada», para anotar con bolígrafo y pasarla al sistema después."
        acciones={
          <>
            <Button variant="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button icon={<Printer />} disabled={armando || !listo} onClick={() => void armar()}>
              {armando ? 'Armando…' : !listo ? 'Cargando listas…' : 'Generar PDF'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Interruptor
            encendido={conCatalogo}
            onCambio={setConCatalogo}
            etiqueta="Incluir la lista de artículos del catálogo"
            detalle="Una hoja más con código, nombre, categoría y unidad de cada artículo, para escribir el código correcto."
          />
          <Interruptor encendido={conLogo} onCambio={setConLogo} etiqueta="Incluir logo institucional" />
        </div>
        {falla ? <ErrorDeCarga error={falla} className="mt-4" /> : null}
      </Modal>

      <Visor
        abierto={archivo !== null}
        onCerrar={() => setArchivo(null)}
        blob={archivo?.blob ?? null}
        nombreArchivo={archivo?.nombre ?? ''}
        titulo="Planilla de entrada"
      />
    </>
  )
}
