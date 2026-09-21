import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useClientes } from '@/lib/api/ventas'
import { clienteQueSeParece } from '@/lib/api/salidas'

/*
  LO QUE SE LE PREGUNTA A UNA NOTA DE ENTREGA QUE NACE DE UNA SALIDA.

  Christopher, 21/09/2026: «los datos que existan en esa nota de salida deben
  existir por igual en la nota de entrega; si no hay coincidencias en el
  sistema, se puede dar opción para crearlo o visualmente denotar que tiene un
  aspecto pendiente». Y de los precios: «con lo exactamente mismo que la nota de
  salida» —que no los tiene—.

  Por eso NADA aquí es obligatorio. El cliente viene puesto si el destino
  escrito a mano coincide con uno del sistema; los precios vienen vacíos. Lo que
  falte deja la nota PENDIENTE, y se dice antes de guardar, no después.

  El mismo cuadro sirve para completarla más tarde desde Facturación: las
  preguntas son las mismas, solo cambia a qué se le ponen los precios.
*/

export interface LineaPorPreciar {
  /** El asiento de la salida al generar; el renglón de la nota al completar. */
  id: number
  articulo: string
  cantidad: string
  unidad: string
  /** Al completar: el precio que ya tiene, si lo tiene. */
  precio?: string | null
}

export interface RespuestaDeLaNota {
  cliente_id: number | null
  precios: { id: number; precio: number }[]
  facturable: boolean
}

const numeroLegible = (v: string | number) =>
  Number(v).toLocaleString('es-VE', { maximumFractionDigits: 2 })

export function ModalNotaDeEntrega({
  modo,
  titulo,
  destino,
  clienteInicial,
  facturableInicial = true,
  moneda,
  lineas,
  guardando,
  error,
  onGuardar,
  onCerrar,
}: {
  modo: 'generar' | 'completar'
  titulo: string
  /** El destino escrito a mano en la salida, para buscarle cliente. */
  destino: string | null
  clienteInicial?: number | null
  facturableInicial?: boolean
  /** En qué moneda se leen los precios. Al generar sin cliente es USD. */
  moneda?: string
  lineas: LineaPorPreciar[]
  guardando: boolean
  error: Error | null
  onGuardar: (r: RespuestaDeLaNota) => void
  onCerrar: () => void
}) {
  const { data: clientes } = useClientes(true)
  const [clienteId, setClienteId] = useState(clienteInicial ? String(clienteInicial) : '')
  const [coincidio, setCoincidio] = useState<boolean | null>(null)
  const [precios, setPrecios] = useState<Record<number, string>>(() =>
    Object.fromEntries(lineas.map((l) => [l.id, Number(l.precio) > 0 ? String(l.precio) : ''])),
  )
  const [facturable, setFacturable] = useState(facturableInicial)

  // El destino de la salida se busca entre los clientes UNA vez, al abrir.
  useEffect(() => {
    if (clienteInicial || !destino) return
    let vivo = true
    clienteQueSeParece(destino)
      .then((id) => {
        if (!vivo) return
        setCoincidio(id !== null)
        if (id !== null) setClienteId(String(id))
      })
      .catch(() => vivo && setCoincidio(false))
    return () => {
      vivo = false
    }
  }, [destino, clienteInicial])

  const opciones = (clientes ?? []).map((c) => ({
    valor: String(c.id),
    etiqueta: c.nombre,
    detalle: c.rif,
  }))

  const valorDe = (id: number) => Number(String(precios[id] ?? '').replace(',', '.'))
  const sinPrecio = lineas.filter((l) => !(valorDe(l.id) > 0)).length
  const conNegativo = lineas.some((l) => valorDe(l.id) < 0)
  const quedaPendiente = !clienteId || sinPrecio > 0
  const total = lineas.reduce((s, l) => s + (valorDe(l.id) > 0 ? valorDe(l.id) * Number(l.cantidad) : 0), 0)
  const monedaLeida = clientes?.find((c) => String(c.id) === clienteId)?.moneda_preferida ?? moneda ?? 'USD'

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={titulo}
      descripcion={
        modo === 'generar'
          ? 'Respalda lo mismo que ya salió: no vuelve a descontar material. Al cliente se le entrega solo la nota de salida; esta queda para el archivo.'
          : 'Ponle lo que le falta. Cuando tenga cliente y todos sus precios deja de estar pendiente.'
      }
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={guardando || conNegativo}
            onClick={() =>
              onGuardar({
                cliente_id: clienteId ? Number(clienteId) : null,
                precios: lineas
                  .filter((l) => valorDe(l.id) > 0)
                  .map((l) => ({ id: l.id, precio: valorDe(l.id) })),
                facturable,
              })
            }
          >
            {guardando ? 'Guardando…' : modo === 'generar' ? 'Generar la nota' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <SelectBuscable
            label="Cliente"
            opciones={opciones}
            valor={clienteId}
            onCambio={setClienteId}
            vacio="Sin cliente todavía"
            hint={
              destino && modo === 'generar' ? `La salida dice que se entregó a «${destino}».` : undefined
            }
          />
          {coincidio === false && !clienteId ? (
            <p className="text-ink/60 mt-1.5 text-xs">
              No hay un cliente que se llame así. Elige otro,{' '}
              <a
                href="/app/ventas/clientes"
                target="_blank"
                rel="noreferrer"
                className="text-royal-600 dark:text-royal-300 underline"
              >
                créalo en Ventas › Clientes
              </a>{' '}
              o déjalo sin cliente: la nota queda pendiente y se completa después.
            </p>
          ) : null}
        </div>

        <div>
          <p className="text-ink/80 mb-2 text-sm font-medium">
            Precios <span className="text-ink/45 font-normal">· en {monedaLeida}, opcionales</span>
          </p>
          <ul className="divide-hairline border-hairline rounded-card divide-y border">
            {lineas.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-ink/85 text-sm">{l.articulo}</p>
                  <p className="text-ink/45 tabular text-xs">
                    {numeroLegible(l.cantidad)} {l.unidad}
                  </p>
                </div>
                <div className="w-32">
                  <Input
                    label={`Precio de ${l.articulo}`}
                    ocultarEtiqueta
                    inputMode="decimal"
                    placeholder="Sin precio"
                    value={precios[l.id] ?? ''}
                    onChange={(e) => setPrecios((p) => ({ ...p, [l.id]: e.target.value }))}
                  />
                </div>
              </li>
            ))}
          </ul>
          {total > 0 ? (
            <p className="text-ink/60 tabular mt-1.5 text-right text-xs">
              Suma {numeroLegible(total)} {monedaLeida}
            </p>
          ) : null}
        </div>

        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            className="accent-royal-600 mt-0.5 size-4 shrink-0"
            checked={facturable}
            onChange={(e) => setFacturable(e.target.checked)}
          />
          <span>
            <span className="text-ink/85 block text-sm">Se podrá facturar</span>
            <span className="text-ink/45 block text-xs">
              Desmarcada, queda solo de respaldo: nunca aparece en Facturación para cobrarla.
            </span>
          </span>
        </label>

        {quedaPendiente ? (
          <div className="border-warning/30 bg-warning-soft rounded-card border p-3">
            <p className="text-ink/80 text-sm font-medium">Va a quedar pendiente por completar</p>
            <p className="text-ink/65 mt-1 text-xs">
              {[
                !clienteId ? 'no tiene cliente' : null,
                sinPrecio > 0
                  ? sinPrecio === 1
                    ? 'un renglón no tiene precio'
                    : `${sinPrecio} renglones no tienen precio`
                  : null,
              ]
                .filter(Boolean)
                .join(' y ')}
              . Se puede imprimir igual, con el sello PENDIENTE, y se completa en Facturación ›
              Notas de entrega.
            </p>
          </div>
        ) : null}

        {error ? <ErrorDeCarga error={error} /> : null}
      </div>
    </Modal>
  )
}
