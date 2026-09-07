import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import {
  useAlmacenes,
  useRegistrarRecepcion,
  useRevisarCostoDeEntrada,
} from '@/lib/api/inventario'
import type { Orden } from '@/lib/api/compras'
import { hoyEnCaracas } from '@/lib/api/tasas'

interface Props {
  abierto: boolean
  onCerrar: () => void
  orden: Orden
}

export function ModalRecepcion({ abierto, onCerrar, orden }: Props) {
  const { data: almacenes } = useAlmacenes()
  const recibir = useRegistrarRecepcion()

  const pendientes = orden.renglones
    .slice()
    .sort((a, b) => a.linea - b.linea)
    .map((r) => ({
      ...r,
      pendiente: Number(r.cantidad) - Number(r.cantidad_recibida),
    }))
    .filter((r) => r.pendiente > 0.0001)

  // Se propone recibir todo lo que falta: lo normal es que llegue completo, y
  // corregir un número es más rápido que escribir todos.
  const [cantidades, setCantidades] = useState<Record<number, string>>(() =>
    Object.fromEntries(pendientes.map((r) => [r.id, String(r.pendiente)])),
  )
  /*
    EL ALMACÉN LO PROPONE EL PEDIDO, NO LA CONFIGURACIÓN

    Antes venía siempre el almacén marcado como «recibe compras», el mismo para
    todo. Un filtro de aire terminó en ALIMENTACIÓN, y no fue un descuido de
    quien recibió: la pantalla se lo puso y él no tenía por qué saber que estaba
    mal.

    Ahora manda lo que dijo quien pidió. Si el pedido decía «Taller de
    Reparación Primaria», ahí va; si el destino no era un almacén —un frente, la
    planta— se cae al de por defecto, que es lo único que queda.
  */
  const destinoDelPedido = orden.solicitud?.destino_almacen_id

  /*
    Y si el pedido no dijo destino, no se adivina.

    No hay almacén predeterminado, y esa es la decisión: `recibe_compras` marca
    los sitios a los que se puede pedir que llegue algo, no uno que gane por
    defecto. El código lo leía al revés y tomaba el primero de esa lista, que
    por orden alfabético es ALIMENTACIÓN. De ahí el filtro de aire.

    Por eso el almacén se enlaza desde la solicitud: quien pide sabe a dónde
    va, y quien recibe no tiene por qué adivinarlo.
  */
  /*
    LO QUE SE ACEPTA A SABIENDAS.

    `registrar_recepcion` rechaza el renglón cuyo precio se sale diez veces de
    lo que el artículo viene costando, salvo que venga confirmado. Y rechaza la
    recepción ENTERA: sin esta casilla, el mensaje decía «acéptalo y quedará
    anotado» en una pantalla donde no había nada que aceptar, y de paso se
    perdían las cantidades ya tecleadas de los demás renglones.

    Aquí el precio no se teclea —viene de la orden— así que la otra salida es
    corregir la orden. Eso se dice en el aviso.
  */
  const [confirmados, setConfirmados] = useState<Record<number, boolean>>({})

  const [almacenId, setAlmacenId] = useState(() => String(destinoDelPedido ?? ''))
  const [fecha, setFecha] = useState(hoyEnCaracas())
  const [nota, setNota] = useState('')

  // El almacén por defecto llega con la consulta, después del primer render.
  const almacenElegido = almacenId || String(destinoDelPedido ?? '')

  const guardar = async () => {
    await recibir.mutateAsync({
      orden_id: orden.id,
      almacen_id: Number(almacenElegido),
      fecha,
      nota,
      renglones: pendientes
        .map((r) => ({
          orden_renglon_id: r.id,
          cantidad: Number(cantidades[r.id] ?? 0),
          confirmado: confirmados[r.id] === true,
        }))
        .filter((r) => r.cantidad > 0),
    })
    onCerrar()
  }

  const algo = pendientes.some((r) => Number(cantidades[r.id] ?? 0) > 0)

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Recibir material"
      descripcion="Lo que se registre aquí entra al inventario y no se puede editar después: una corrección se hace con un ajuste."
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={!algo || !almacenElegido || recibir.isPending}>
            {recibir.isPending ? 'Registrando…' : 'Registrar la recepción'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectBuscable
          label="Almacén que recibe"
          vacio="Elige el almacén"
          valor={almacenElegido}
          /*
            CAMBIAR DE ALMACEN OLVIDA LAS CONFIRMACIONES.

            El precio del renglon no cambia —viene de la orden— pero el promedio
            contra el que se compara si: se lleva por pareja (almacen, articulo).
            Aceptar un desvio contra el promedio de un sitio no dice nada del
            otro.
          */
          onCambio={(v) => {
            setAlmacenId(v)
            setConfirmados({})
          }}
          opciones={(almacenes ?? []).map((a) => ({
            valor: String(a.id),
            etiqueta: `${a.codigo} · ${a.nombre}`,
          }))}
          hint={
            destinoDelPedido
              ? String(destinoDelPedido) === almacenElegido
                ? 'Es el destino que pidió quien lo solicitó.'
                : 'Ojo: el pedido era para otro sitio.'
              : orden.solicitud?.destino
                ? `El pedido decía «${orden.solicitud.destino}», que no es un almacén. Elige dónde entra.`
                : 'El pedido no dijo a dónde iba. Elige dónde entra.'
          }
        />
        <Input
          label="Fecha de recepción"
          type="date"
          max={hoyEnCaracas()}
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />
      </div>

      <h3 className="text-ink/85 mt-6 mb-2 text-sm font-semibold">Qué llegó</h3>

      <div className="space-y-2.5">
        {pendientes.map((r) => (
          <div key={r.id} className="border-hairline rounded-card border p-3">
            <p className="text-ink/85 text-sm font-medium">{r.descripcion}</p>
            <p className="text-ink/50 text-xs">
              Pedido {r.cantidad} {r.unidad}
              {Number(r.cantidad_recibida) > 0
                ? ` · ya recibido ${r.cantidad_recibida}`
                : ''}{' '}
              · falta {r.pendiente}
            </p>

            <Input
              label="Cantidad que llegó"
              className="mt-2 sm:max-w-[220px]"
              type="number"
              min="0"
              max={r.pendiente}
              step="0.01"
              inputMode="decimal"
              value={cantidades[r.id] ?? ''}
              onChange={(e) => setCantidades((c) => ({ ...c, [r.id]: e.target.value }))}
              hint="Déjalo en cero si este renglón no llegó todavía."
            />

            <AvisoDelPrecioDeLaOrden
              almacenId={Number(almacenElegido) || null}
              articuloId={r.articulo_id}
              precio={Number(r.precio_unitario)}
              moneda={orden.moneda}
              descripcion={r.descripcion}
              activo={Number(cantidades[r.id] ?? 0) > 0}
              confirmado={confirmados[r.id] === true}
              onConfirmar={(v) => setConfirmados((c) => ({ ...c, [r.id]: v }))}
            />
          </div>
        ))}

        {pendientes.length === 0 ? (
          <p className="text-ink/55 text-sm">Ya se recibió todo lo de esta orden.</p>
        ) : null}
      </div>

      <Textarea
        label="Nota"
        className="mt-4"
        rows={2}
        placeholder="Opcional: número de guía, quién trajo el material, estado en que llegó"
        value={nota}
        onChange={(e) => setNota(e.target.value)}
      />

      {recibir.error ? <ErrorDeCarga error={recibir.error} className="mt-4" /> : null}
    </Modal>
  )
}

/**
 * El precio de esta orden contra lo que el artículo viene costando.
 *
 * Se pregunta a la base —`revisar_costo_de_entrada`— y no se deduce de la
 * vista de existencias, porque esa esconde el promedio a quien no puede ver
 * valoraciones y entonces el aviso no le saldría nunca a quien recibe.
 *
 * Aquí solo importa el desvío. La primera entrada de un artículo no se
 * confirma en la recepción: el precio ya lo miró alguien al armar la orden, y
 * `registrar_recepcion` tampoco la exige.
 */
function AvisoDelPrecioDeLaOrden({
  almacenId,
  articuloId,
  precio,
  moneda,
  descripcion,
  activo,
  confirmado,
  onConfirmar,
}: {
  almacenId: number | null
  articuloId: number | null
  precio: number
  moneda: string
  descripcion: string
  activo: boolean
  confirmado: boolean
  onConfirmar: (valor: boolean) => void
}) {
  const revision = useRevisarCostoDeEntrada(
    activo ? almacenId : null,
    activo ? articuloId : null,
    precio,
    moneda,
  )

  const r = revision.data
  if (!activo || !r || r.estado !== 'DESVIA') return null

  const veLasCifras = r.veces != null && r.viene_costando != null && r.entra_a != null

  return (
    <div className="border-warning/40 bg-warning-soft rounded-card mt-3 border p-2.5">
      <p className="text-ink/80 text-xs leading-relaxed">
        {veLasCifras ? (
          <>
            <strong>
              {descripcion} viene costando {r.viene_costando}
            </strong>{' '}
            y en esta orden entra a {r.entra_a}: son{' '}
            <strong>
              {r.veces} veces {r.hacia === 'ARRIBA' ? 'más' : 'menos'}
            </strong>
            .
          </>
        ) : (
          <>
            <strong>El precio de esta orden se sale mucho de lo que {descripcion} viene costando</strong>{' '}
            — es más de diez veces {r.hacia === 'ARRIBA' ? 'más caro' : 'más barato'}.
          </>
        )}{' '}
        Si el precio de la orden está mal, corrígelo en la orden antes de recibir: aquí solo se
        acepta o se para.
      </p>
      <label className="text-ink/70 mt-2 flex cursor-pointer items-center gap-2 text-xs">
        <input type="checkbox" checked={confirmado} onChange={(e) => onConfirmar(e.target.checked)} />
        El precio de la orden es correcto — quedará anotado en el movimiento
      </label>
    </div>
  )
}
