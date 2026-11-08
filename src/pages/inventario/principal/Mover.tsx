import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { DeQuienSale } from '@/components/DeQuienSale'
import type { Articulo } from '@/lib/api/catalogo'
import { useAlmacenes, useExistenciasDeArticulo, useTransferir } from '@/lib/api/inventario'
import { toast } from '@/lib/avisosFlotantes'
import { LA_CASA, faltaDecirDeQuien } from '@/lib/deQuien'
import { almacenUsable, cantidad, filaUsable, numeroTecleado } from './comun'

/*
  ⇄ «MOVER · {NOMBRE}» (fase 3 de «Almacén e Inventario como MGG»,
  08/11/2026). Copia de `MoverProductoModal.tsx` de MGG: el traslado corto de
  un producto a otro almacén, directo, con `transferir_existencia` (decisión
  de la dueña: transferencia directa). El motivo lo pone la pantalla, como en
  MGG («Traslado a {destino}»): quien quiere escribir uno usa «↕ Movimiento ›
  Transferencia a otro almacén».

  En MGG se abre desde el detalle de un almacén, que ya dice de dónde sale.
  Aquí se abre desde la pantalla principal: si el producto está en más de un
  almacén y no hay uno elegido, se pregunta «Desde».
*/
export function Mover({
  articulo,
  almacenInicial,
  onCerrar,
}: {
  articulo: Articulo
  almacenInicial?: number | null
  onCerrar: () => void
}) {
  const existenciasQ = useExistenciasDeArticulo(articulo.id)
  const { data: almacenesTodos } = useAlmacenes()
  const transferir = useTransferir()

  const almacenes = useMemo(() => (almacenesTodos ?? []).filter(almacenUsable), [almacenesTodos])
  const conStock = useMemo(
    () =>
      (existenciasQ.data ?? [])
        .filter(filaUsable)
        .filter((f) => Number(f.disponibles ?? f.existencia) > 0 && almacenes.some((a) => a.id === f.almacen_id)),
    [existenciasQ.data, almacenes],
  )

  const [desdeElegido, setDesdeElegido] = useState('')
  const [destino, setDestino] = useState('')
  const [cantidadTxt, setCantidadTxt] = useState('')
  const [dueno, setDueno] = useState('')

  const desde =
    desdeElegido ||
    (almacenInicial && conStock.some((f) => f.almacen_id === almacenInicial)
      ? String(almacenInicial)
      : conStock.length === 1
        ? String(conStock[0].almacen_id)
        : '')
  const origen = conStock.find((f) => String(f.almacen_id) === desde)
  const destinoSitio = almacenes.find((a) => String(a.id) === destino)
  const duenos = origen?.duenos ?? []
  const mixto = duenos.length > 1
  const disponible = !origen
    ? 0
    : mixto && dueno
      ? dueno === LA_CASA
        ? Number(origen.existencia_propia ?? 0)
        : Number(origen.existencia_ajena ?? 0)
      : Number(origen.disponibles ?? origen.existencia)
  const cant = numeroTecleado(cantidadTxt)
  const supera = Number.isFinite(cant) && cant > disponible
  const listo =
    !!origen && !!destinoSitio && Number.isFinite(cant) && cant > 0 && !supera && !faltaDecirDeQuien(duenos, dueno)

  const mover = async () => {
    if (!listo || !origen || !destinoSitio) return
    try {
      await transferir.mutateAsync({
        origen_id: origen.almacen_id,
        destino_id: destinoSitio.id,
        articulo_id: articulo.id,
        cantidad: cant,
        motivo: `Traslado a ${destinoSitio.nombre}`,
        propietario: mixto ? dueno : null,
      })
      toast(`Movido ${cantidad(cant)} de ${articulo.nombre} → ${destinoSitio.nombre}`, 'success')
      onCerrar()
    } catch {
      // El error se enseña en el modal.
    }
  }

  return (
    <Modal
      abierto
      ancho="sm"
      onCerrar={onCerrar}
      titulo={`Mover · ${articulo.nombre}`}
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button disabled={!listo || transferir.isPending} onClick={() => void mover()}>
            {transferir.isPending ? 'Moviendo…' : 'Mover'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {existenciasQ.isPending ? <p className="text-ink/55 text-sm">Cargando…</p> : null}
        {!existenciasQ.isPending && conStock.length === 0 ? (
          <p className="text-ink/60 text-sm">No hay stock disponible de este producto en ningún almacén.</p>
        ) : null}

        {conStock.length > 1 ? (
          <Select
            label="Desde"
            vacio="— Elegí un almacén —"
            value={desde}
            onChange={(e) => {
              setDesdeElegido(e.target.value)
              setDestino('')
              setDueno('')
            }}
            opciones={conStock.map((f) => ({
              valor: String(f.almacen_id),
              etiqueta: `${f.almacen} · ${cantidad(Number(f.disponibles ?? f.existencia))} ${articulo.unidad}`,
            }))}
          />
        ) : null}

        {origen ? (
          <p className="text-ink/70 text-sm">
            Desde <strong>{origen.almacen}</strong> · disponible{' '}
            <strong>
              {cantidad(disponible)} {articulo.unidad}
            </strong>
          </p>
        ) : null}

        {mixto ? <DeQuienSale duenos={duenos} valor={dueno} onCambio={setDueno} /> : null}

        <Select
          label="Almacén destino"
          vacio="— Elegí un almacén —"
          value={destino}
          disabled={!origen}
          onChange={(e) => setDestino(e.target.value)}
          opciones={almacenes
            .filter((a) => a.id !== origen?.almacen_id)
            .map((a) => ({ valor: String(a.id), etiqueta: a.nombre }))}
        />

        <Input
          label={`Cantidad (${articulo.unidad})`}
          inputMode="decimal"
          placeholder={origen ? `Máx ${cantidad(disponible)}` : ''}
          value={cantidadTxt}
          onChange={(e) => setCantidadTxt(e.target.value)}
          error={supera ? 'Supera el stock disponible.' : undefined}
        />

        {transferir.error ? <ErrorDeCarga error={transferir.error} /> : null}
      </div>
    </Modal>
  )
}
