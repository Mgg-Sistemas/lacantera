import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { CantidadDeArticulo } from '@/components/CantidadDeArticulo'
import { ConteoDeEnvases } from '@/components/ConteoDeEnvases'
import type { LineaDeConteo } from '@/components/ConteoDeEnvases'
import { DeQuienSale } from '@/components/DeQuienSale'
import { faltaDecirDeQuien } from '@/lib/deQuien'
import { useArticulos, useTodasLasPresentaciones } from '@/lib/api/catalogo'
import { useRegistrarAjuste } from '@/lib/api/inventario'
import type { Existencia } from '@/lib/api/inventario'
import { enteros } from '@/lib/formato'

/*
  «CONTEO FÍSICO» DE UNA FILA (almacén, artículo).

  Vivía dentro de la pantalla vieja de Existencias, y la de inventario de MGG
  mandaba allá con `?accion=contar` para abrirlo. Desde el 09/11/2026 esa
  pantalla se retiró y el conteo es su propio modal: lo abren «⋯ › Contar» de
  la pantalla principal, «Contar» del detalle de un almacén y «Ver dónde está».

  Es el mismo formulario de siempre y la misma RPC (`registrar_ajuste`): se
  cuenta en bultos y sueltos, o con la hoja de envases cuando hay de varios
  tipos, y la diferencia queda como ajuste.
*/

function cantidad(valor: string | number): string {
  const n = Number(valor)
  return Number.isInteger(n) ? enteros(n) : n.toLocaleString('es-VE', { maximumFractionDigits: 2 })
}

export function ModalConteo({ fila, onCerrar }: { fila: Existencia; onCerrar: () => void }) {
  const ajuste = useRegistrarAjuste()
  const { data: articulos } = useArticulos()
  // Las formas de contar de todo el catálogo, de un tirón (ya están en caché).
  const { data: formasDeContar } = useTodasLasPresentaciones()

  /* De quién se cuenta, cuando en ese sitio el artículo es de varios dueños. */
  const [saleDe, setSaleDe] = useState('')
  /* Lo suelto. Los bultos enteros van aparte: «siete tambores y diez litros». */
  const [valor, setValor] = useState(fila.existencia)
  const [bultosContados, setBultosContados] = useState<number | null>(null)
  /* Y en cuál se contó: «3» son 624 litros en tambores y 60 en bidones. */
  const [presentacionContada, setPresentacionContada] = useState<string | null>(null)
  /* La hoja de conteo, cuando en el estante hay envases de varios tipos. */
  const [hoja, setHoja] = useState<LineaDeConteo[]>([])
  const [sueltosContados, setSueltosContados] = useState('')
  /* El total ya sumado, solo para enseñarlo y calcular la diferencia. */
  const [totalContado, setTotalContado] = useState(fila.existencia)
  const [motivo, setMotivo] = useState('')

  const articulo = (articulos ?? []).find((a) => a.id === fila.articulo_id)
  const formas = (formasDeContar ?? [])
    .filter((x) => x.articulo_id === fila.articulo_id && x.activa)
    .sort(
      (a, b) =>
        Number(b.por_defecto) - Number(a.por_defecto) ||
        a.presentacion.localeCompare(b.presentacion, 'es'),
    )
    .map((x) => ({ presentacion: x.presentacion, unidades: x.unidades }))

  const guardar = async () => {
    /*
      Con hoja manda la hoja: lo suelto son los litros del envase empezado y los
      bultos van en las líneas. Sin hoja, la forma de siempre.
    */
    const conHoja = hoja.filter((l) => l.presentacion && Number(l.cantidad) > 0)
    await ajuste.mutateAsync({
      almacen_id: fila.almacen_id,
      articulo_id: fila.articulo_id,
      propietario: saleDe || null,
      contado: conHoja.length > 0 ? Number(sueltosContados || 0) : Number(valor || 0),
      presentaciones: conHoja.length > 0 ? null : bultosContados,
      presentacion: conHoja.length > 0 ? null : presentacionContada,
      envases: conHoja.map((l) => ({ presentacion: l.presentacion, cantidad: Number(l.cantidad) })),
      motivo,
    })
    onCerrar()
  }

  return (
    <Modal
      abierto
      ancho="sm"
      onCerrar={onCerrar}
      titulo="Conteo físico"
      descripcion="Cantidad contada. La diferencia queda registrada como ajuste."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            onClick={() => void guardar()}
            disabled={
              // Se mide por el TOTAL: «7 tambores y 0 sueltos» deja lo suelto vacío.
              !totalContado ||
              faltaDecirDeQuien(fila.duenos, saleDe) ||
              motivo.trim().length < 4 ||
              ajuste.isPending
            }
          >
            {ajuste.isPending ? 'Guardando…' : 'Registrar'}
          </Button>
        </>
      }
    >
      <div className="border-hairline bg-canvas rounded-card mb-4 border p-3">
        <p className="text-ink/85 text-sm font-medium">{fila.articulo}</p>
        <p className="text-ink/55 text-xs">
          {fila.almacen} · hay {cantidad(fila.existencia)} {fila.unidad}
        </p>
      </div>

      {/* Solo aparece cuando en ese sitio el artículo es de varios dueños. */}
      <div className="mb-4">
        <DeQuienSale duenos={fila.duenos} valor={saleDe} onCambio={setSaleDe} label="Dueño" />
      </div>

      <CantidadDeArticulo
        key={fila.articulo_id}
        label="Cantidad contada"
        valor={totalContado}
        onCambiar={(v, cap) => {
          setValor(cap.presentaciones ? String(cap.sueltas || '') : v)
          setBultosContados(cap.presentaciones)
          setPresentacionContada(cap.unidad)
          setTotalContado(v)
        }}
        articulo={{
          // La unidad sale de la FILA, que es lo que se está contando.
          unidad: fila.unidad,
          densidad_ton_m3: articulo?.densidad_ton_m3 ?? null,
          presentacion: articulo?.presentacion ?? null,
          unidades_por_presentacion: articulo?.unidades_por_presentacion ?? null,
          presentaciones: formas,
        }}
        hint={
          totalContado !== ''
            ? `Diferencia: ${(Number(totalContado) - Number(fila.existencia)).toLocaleString('es-VE', { maximumFractionDigits: 2 })} ${fila.unidad}`
            : `Hay ${cantidad(fila.existencia)} ${fila.unidad} según el sistema`
        }
      />

      {/* Contar un almacén donde hay de todo: un tambor y veintiuna pailas. Solo
          cuando el artículo tiene más de una forma declarada. */}
      {formas.length > 1 ? (
        hoja.length === 0 ? (
          <button
            type="button"
            className="text-ink/55 hover:text-ink/85 mt-2 text-xs underline underline-offset-2"
            onClick={() => setHoja([{ presentacion: formas[0].presentacion, cantidad: '' }])}
          >
            ¿Contó envases de varios tipos?
          </button>
        ) : (
          <div className="mt-3">
            <ConteoDeEnvases
              formas={formas}
              unidad={fila.unidad}
              existencia={Number(fila.existencia)}
              lineas={hoja}
              sueltos={sueltosContados}
              onCambiar={(l, su, total) => {
                setHoja(l)
                setSueltosContados(su)
                setTotalContado(String(total))
              }}
            />
            <button
              type="button"
              className="text-ink/45 hover:text-ink/75 mt-2 text-xs underline underline-offset-2"
              onClick={() => {
                setHoja([])
                setSueltosContados('')
                setTotalContado('')
              }}
            >
              Volver a contar de una sola forma
            </button>
          </div>
        )
      ) : null}

      <Textarea
        maxLength={500}
        label="Motivo"
        className="mt-4"
        rows={3}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        hint="Queda en el libro y no se puede editar después."
      />

      {ajuste.error ? <ErrorDeCarga error={ajuste.error} className="mt-3" /> : null}
    </Modal>
  )
}
