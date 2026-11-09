import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Visor } from '@/components/Visor'
import { densidadesDeArticulos } from '@/lib/api/catalogo'
import { useEmpresa } from '@/lib/api/empresa'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { armarActaExistencias } from '@/lib/ficha/actaExistencias'
import { useSesion } from '@/lib/sesion'

/*
  «ACTA DE CONTEO FÍSICO» (09/11/2026).

  Vivía en la cabecera de la pantalla vieja de Existencias. Se mudó a la de
  inventario de MGG y al detalle de un almacén con el mismo papel de siempre
  (`armarActaExistencias`): se arma con LO QUE SE ESTÁ VIENDO, y el filtro
  aplicado va impreso, porque un acta con quince renglones que no dice que son
  quince de doscientos se lee como si fueran todos.

  El precio solo va si quien imprime puede verlo: la vista lo devuelve nulo sin
  `INVENTARIO.VER_VALORACION`, y ese nulo no se imprime como cero.
*/

export interface RenglonParaActa {
  articuloId: number
  codigo: string
  articulo: string
  unidad: string
  existencia: string | number
  costoUsd: string | number | null
  valorUsd: string | number | null
}

export function BotonActaDeConteo({
  sitio,
  filtro,
  renglones,
}: {
  /** El almacén que se está mirando; nulo es toda la empresa. */
  sitio: string | null
  /** Lo que está filtrado, dicho con palabras. */
  filtro: string | null
  renglones: RenglonParaActa[]
}) {
  const { data: empresa } = useEmpresa()
  const { nombre: yo } = useSesion()
  const [acta, setActa] = useState<ArchivoArmado | null>(null)
  const [armando, setArmando] = useState(false)

  const imprimir = async () => {
    setArmando(true)
    try {
      // La otra medida, solo en lo que tiene densidad: ver `lib/medidas.ts`.
      const densidades = await densidadesDeArticulos({ ids: renglones.map((r) => r.articuloId) })
      setActa(
        await armarActaExistencias({
          almacen: sitio,
          filtro,
          renglones: renglones.map((r) => ({
            codigo: r.codigo,
            articulo: r.articulo,
            unidad: r.unidad,
            existencia: r.existencia,
            densidad: densidades.find((a) => a.id === r.articuloId)?.densidad_ton_m3 ?? null,
            costoUsd: r.costoUsd,
            valorUsd: r.valorUsd,
          })),
          empresa: { razonSocial: empresa?.razon_social ?? '', rif: empresa?.rif ?? '' },
          emitidoPor: yo ?? '',
          momento: new Date(),
        }),
      )
    } finally {
      setArmando(false)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        title="Imprimir el acta para contar a mano lo que se está viendo"
        disabled={renglones.length === 0 || armando}
        onClick={() => void imprimir()}
      >
        {armando ? 'Generando…' : 'Acta de conteo físico'}
      </Button>
      <Visor
        abierto={acta !== null}
        onCerrar={() => setActa(null)}
        blob={acta?.blob ?? null}
        nombreArchivo={acta?.nombre ?? ''}
        titulo="Acta de existencias"
      />
    </>
  )
}
