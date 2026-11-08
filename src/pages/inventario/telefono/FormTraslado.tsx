import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { useTransferir, type Almacen as Sitio } from '@/lib/api/inventario'
import { numerosDeMovimientos } from '@/lib/api/almacenTelefono'
import { mensajeTraslado, num } from '@/lib/ficha/inventarioWhatsapp'
import { errorLineas, lineaDe, useTardaPorLaSeñal, type LineaDeMaterial, type ProductoEnAlmacen } from './comun'
import { AvisoDeSeñal, LineasMateriales, TituloDePaso } from './piezas'

/*
  🔁 TRASLADO, EN EL TELÉFONO (MGG `FormTraslado`, fase 1b, 08/11/2026).

  Directo, como en MGG (decisión 0.2 de la dueña): sale del almacén elegido y
  entra al destino en el mismo instante, con `transferir_existencia` —la
  opción «directo» de siempre—, una vez por material. La base exige ahí el rol
  de Almacén (o escritura en Inventario), que el material alcance de ese
  dueño y un motivo. En escritorio el traslado sigue con sus tres pasos
  (pedido, en camino, recibido): eso no se toca.

  Antes de mover se confirma en la misma pantalla: «🔁 ¿Confirmas el
  traslado?» → «✓ Sí, trasladar a {destino}».
*/

export interface TrasladoHecho {
  titulo: string
  texto: string
  /** La salida del traslado, para su nota en PDF (solo con un material). */
  idSalida?: number
}

export function FormTraslado({
  origen,
  destinos,
  productos,
  inicial,
  quien,
  empresa,
  onCancel,
  onHecho,
}: {
  origen: Sitio
  destinos: Sitio[]
  productos: ProductoEnAlmacen[]
  inicial: ProductoEnAlmacen
  quien: string
  empresa: string
  onCancel: () => void
  onHecho: (h: TrasladoHecho) => void
}) {
  const transferir = useTransferir()
  const [destinoId, setDestinoId] = useState('')
  const [lineas, setLineas] = useState<LineaDeMaterial[]>([lineaDe(inicial)])
  const [motivo, setMotivo] = useState('')
  const [revisando, setRevisando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const tarda = useTardaPorLaSeñal(guardando)

  const destino = destinos.find((d) => String(d.id) === destinoId) ?? null

  const problema = (): string | null => {
    if (!destinoId) return 'Elige el almacén destino.'
    if (destinoId === String(origen.id)) return 'El destino tiene que ser otro almacén.'
    const e = errorLineas(lineas)
    if (e) return e
    // `transferir_existencia` pide cuatro letras: un traslado sin motivo no se puede auditar.
    if (motivo.trim().length < 4) return 'Escribe el motivo del traslado.'
    return null
  }
  const falta = problema()

  const trasladar = async () => {
    if (falta || !destino) return toast(falta ?? 'Elige el almacén destino.', 'error')
    setGuardando(true)
    const ids: number[] = []
    const hechas: LineaDeMaterial[] = []
    try {
      for (const l of lineas) {
        const id = await transferir.mutateAsync({
          origen_id: origen.id,
          destino_id: destino.id,
          articulo_id: l.producto.id,
          cantidad: Number(l.cantidad),
          motivo: `${motivo.trim()} (teléfono)`,
          propietario: l.propietario || null,
        })
        ids.push(Number(id))
        hechas.push(l)
      }
    } catch (err) {
      if (hechas.length > 0) {
        toast(`Se trasladaron ${hechas.length} material(es); el resto no: revisa y vuelve a intentar.`, 'warning')
        // Lo que ya se movió sale de la lista: volver a «Sí» no lo traslada dos veces.
        setLineas((v) => v.filter((x) => !hechas.includes(x)))
      }
      toast(mensajeDe(err, 'No se pudo trasladar'), 'error')
      setGuardando(false)
      return
    }

    const numeros = await numerosDeMovimientos(ids).catch(() => [] as string[])
    const uno = lineas.length === 1 ? lineas[0] : null
    toast(
      uno
        ? `Traslado: ${num(Number(uno.cantidad))} ${uno.producto.unidad} de ${uno.producto.nombre} a ${destino.nombre}`
        : `Traslado a ${destino.nombre}: ${lineas.length} materiales`,
      'success',
    )
    setGuardando(false)
    onHecho({
      titulo: `Traslado a ${destino.nombre} registrado${uno ? '' : ` · ${lineas.length} materiales`}`,
      idSalida: uno ? ids[0] : undefined,
      texto: mensajeTraslado({
        empresa,
        origen: origen.nombre,
        destino: destino.nombre,
        numeros,
        materiales: lineas.map((l) => ({
          nombre: l.producto.nombre,
          codigo: l.producto.codigo,
          unidad: l.producto.unidad,
          cantidad: Number(l.cantidad),
        })),
        motivo,
        quedaEnOrigen: uno ? uno.producto.stock - Number(uno.cantidad) : null,
        quien,
      }),
    })
  }

  if (revisando && destino) {
    return (
      <div className="bg-surface shadow-card mt-4 space-y-4 rounded-[10px] p-4">
        <TituloDePaso icono="🔁">¿Confirmas el traslado?</TituloDePaso>
        <table className="w-full text-sm">
          <tbody className="divide-hairline divide-y">
            {lineas.map((l) => (
              <tr key={l.producto.id}>
                <th className="text-ink/60 py-1.5 pr-3 text-left font-normal">{l.producto.nombre}</th>
                <td className="tabular py-1.5 text-right font-semibold whitespace-nowrap">
                  {num(Number(l.cantidad))} {l.producto.unidad}
                </td>
              </tr>
            ))}
            <tr>
              <th className="text-ink/60 py-1.5 pr-3 text-left font-normal">De</th>
              <td className="py-1.5 text-right">{origen.nombre}</td>
            </tr>
            <tr>
              <th className="text-ink/60 py-1.5 pr-3 text-left font-normal">A</th>
              <td className="py-1.5 text-right font-semibold">{destino.nombre}</td>
            </tr>
            <tr>
              <th className="text-ink/60 py-1.5 pr-3 text-left align-top font-normal">Motivo</th>
              <td className="py-1.5 text-right">{motivo.trim()}</td>
            </tr>
          </tbody>
        </table>
        {tarda ? <AvisoDeSeñal que="El traslado" /> : null}
        <Button block size="lg" disabled={guardando} onClick={() => void trasladar()}>
          {guardando ? 'Trasladando…' : `✓ Sí, trasladar a ${destino.nombre}`}
        </Button>
        <Button block size="lg" variant="ghost" disabled={guardando} onClick={() => setRevisando(false)}>
          ← Corregir
        </Button>
      </div>
    )
  }

  return (
    <form
      className="bg-surface shadow-card mt-4 space-y-4 rounded-[10px] p-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (falta) return toast(falta, 'error')
        setRevisando(true)
      }}
    >
      <TituloDePaso icono="🔁">Traslado · desde {origen.nombre}</TituloDePaso>

      <Select
        label="¿A qué almacén va?"
        vacio="Elegir…"
        value={destinoId}
        onChange={(e) => setDestinoId(e.target.value)}
        opciones={destinos.map((d) => ({ valor: String(d.id), etiqueta: d.nombre }))}
      />

      <LineasMateriales lineas={lineas} productos={productos} onCambiar={setLineas} />

      <Textarea
        label="Motivo"
        rows={2}
        placeholder="Para qué se lleva, quién lo lleva…"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
      />

      <Button type="submit" block size="lg" disabled={falta !== null}>
        {lineas.length > 1 ? `🔁 Revisar traslado (${lineas.length} materiales)` : '🔁 Revisar traslado'}
      </Button>
      {falta ? <p className="text-ink/55 -mt-2 text-center text-xs">{falta}</p> : null}
      <Button block variant="ghost" size="lg" onClick={onCancel}>
        ← Otro material
      </Button>
    </form>
  )
}
