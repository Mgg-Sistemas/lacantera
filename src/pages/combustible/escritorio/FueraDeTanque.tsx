import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { useCombustibleFueraDeTanque, type CombustibleEnSitio } from '@/lib/api/combustible'
import { useMisRoles } from '@/lib/api/catalogo'
import { useAlmacenes, useTransferir } from '@/lib/api/inventario'
import { lt } from './comun'

/*
  EL COMBUSTIBLE QUE NO ESTÁ EN UN TANQUE (lo de La Cantera que Golden Touch
  no tiene, 17/10/2026; aquí como aviso arriba de los banners).

  Una compra se recibe en el patio o en el almacén general y el gasoil se queda
  ahí hasta que alguien lo pasa al tanque. No se esconde —son litros que la
  empresa tiene— y no se ofrece para surtir: se dice aparte, con la puerta al
  lado. Pasar al tanque es un TRASLADO (`transferir_existencia`, rol ALMACEN),
  no una carga: cargar contaría dos veces los mismos litros.
*/
export function FueraDeTanque() {
  const fuera = useCombustibleFueraDeTanque()
  const { puede: tieneRol } = useMisRoles()
  const [pasar, setPasar] = useState<CombustibleEnSitio | null>(null)
  const sitios = fuera.data ?? []
  if (sitios.length === 0) return null

  return (
    <>
      <div className="border-warning/30 bg-warning-soft mb-4 rounded-[6px] border p-3.5">
        <p className="text-ink/85 flex items-center gap-2 text-sm font-semibold">
          <TriangleAlert className="text-warning size-[18px] shrink-0" />
          Fuera de tanque
        </p>
        <p className="text-ink/60 mt-0.5 text-xs">
          Combustible fuera de un tanque. No se surte desde ahí: pasalo primero a un tanque.
        </p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {sitios.map((c) => (
            <li
              key={`${c.almacen_id}-${c.articulo_id}`}
              className="border-hairline bg-surface flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2"
            >
              <span className="text-sm">
                <span className="text-ink/55 text-xs">
                  {c.almacen} · {c.almacen_tipo}
                </span>
                <br />
                <strong className="tabular text-ink/90">
                  {lt(c.existencia)} {c.unidad}
                </strong>{' '}
                <span className="text-ink/60">de {c.articulo}</span>
              </span>
              {tieneRol('ALMACEN') ? (
                <Button size="sm" variant="outline" onClick={() => setPasar(c)}>
                  Pasar al tanque
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      <ModalPasarAlTanque origen={pasar} onCerrar={() => setPasar(null)} />
    </>
  )
}

/**
 * Pasar al tanque el combustible que está en otro sitio. Se mueve con su
 * costo: el total de la empresa no cambia.
 */
function ModalPasarAlTanque({ origen, onCerrar }: { origen: CombustibleEnSitio | null; onCerrar: () => void }) {
  const qc = useQueryClient()
  const transferir = useTransferir()
  const { data: almacenes } = useAlmacenes()
  const [tanque, setTanque] = useState('')
  const [cuanto, setCuanto] = useState('')
  const [motivo, setMotivo] = useState('')

  /*
    El tanque del combustible inicial no es destino: lo que hay ahí entró sin
    costo y `transferir_existencia` no lo mezcla con combustible pagado.
  */
  const tanques = (almacenes ?? []).filter((a) => a.tipo === 'COMBUSTIBLE' && !a.admite_sin_costo)

  useEffect(() => {
    if (!origen) return
    setTanque(tanques.length === 1 ? String(tanques[0].id) : '')
    setCuanto(String(Number(origen.existencia)))
    setMotivo('')
    // Lo que decide es el origen, que es lo que abre este formulario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origen])

  if (!origen) return null

  const hay = Number(origen.existencia)
  const pedido = Number(cuanto || 0)
  const pasado = pedido > hay
  const capacidad = tanques.find((t) => String(t.id) === tanque)?.capacidad

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Pasar al tanque"
      descripcion="Se mueve con su costo. El total de la empresa no cambia."
      ancho="sm"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            onClick={() =>
              void (async () => {
                await transferir.mutateAsync({
                  origen_id: origen.almacen_id,
                  destino_id: Number(tanque),
                  articulo_id: origen.articulo_id,
                  cantidad: pedido,
                  motivo,
                })
                // Un traslado no pasa por las mutaciones de combustible: sin esto los
                // banners siguen diciendo lo de antes.
                await qc.invalidateQueries({ queryKey: ['combustible'] })
                onCerrar()
              })()
            }
            disabled={!tanque || pedido <= 0 || pasado || motivo.trim().length < 4 || transferir.isPending}
          >
            {transferir.isPending ? 'Pasando…' : 'Pasar'}
          </Button>
        </>
      }
    >
      <div className="border-hairline bg-canvas rounded-card mb-4 border p-3">
        <p className="text-ink/85 text-sm font-medium">{origen.articulo}</p>
        <p className="text-ink/55 text-xs">
          {origen.almacen} · hay {lt(origen.existencia)} {origen.unidad}
        </p>
      </div>

      {tanques.length === 0 ? (
        <p className="text-danger text-sm">Sin tanques registrados. Crealo primero con «+ Tanque».</p>
      ) : (
        <>
          <SelectBuscable
            label="Destino"
            vacio="Elegí el tanque"
            valor={tanque}
            onCambio={setTanque}
            opciones={tanques.map((t) => ({
              valor: String(t.id),
              codigo: t.codigo,
              nombre: t.nombre,
              detalle: t.capacidad ? `le caben ${Number(t.capacidad)}` : 'sin tope declarado',
            }))}
          />
          <Input
            className="mt-3"
            label="Cantidad"
            type="number"
            inputMode="decimal"
            value={cuanto}
            onChange={(e) => setCuanto(e.target.value)}
            hint={
              pasado
                ? `Ahí solo hay ${lt(origen.existencia)} ${origen.unidad}`
                : capacidad
                  ? `Al tanque le caben ${Number(capacidad)} ${origen.unidad}`
                  : `En ${origen.unidad}`
            }
          />
          <Textarea
            className="mt-3"
            label="Motivo"
            rows={2}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            hint="Ej.: «la compra se recibió en el patio y va al tanque»."
          />
          {transferir.error ? <ErrorDeCarga error={transferir.error} className="mt-3" /> : null}
        </>
      )}
    </Modal>
  )
}
