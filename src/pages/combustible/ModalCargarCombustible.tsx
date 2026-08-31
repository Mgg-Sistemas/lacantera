import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useAlmacenes, useRegistrarEntrada } from '@/lib/api/inventario'
import { useCombustibles } from '@/lib/api/combustible'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { cn } from '@/lib/cn'

/*
  CARGAR COMBUSTIBLE AL TANQUE

  Christopher lo pregunto dos veces: «¿como puedo ingresar combustible a un
  tanque?». Y la segunda vez es la que importa — cuando alguien pregunta dos
  veces lo mismo, el problema no es que no se lo hayan explicado.

  Se podia hacer, en Inventario → Existencias → Entrada de material, eligiendo el
  almacen y el articulo correctos entre todos los que hay. Pero quien tiene esa
  duda esta parado en la pantalla de combustible, donde el unico boton decia
  «Despachar». El modulo sabia sacar y no sabia meter.

  POR QUE UN MODAL PROPIO Y NO UN ENLACE A EXISTENCIAS

  Un enlace habria resuelto el camino y no el problema: al llegar alli hay que
  elegir el almacen entre once y el articulo entre once, y equivocarse en
  cualquiera de los dos mete gasoil en el patio — que es exactamente lo que ya
  paso y por lo que los 5.400 litros no estan en el tanque.

  Aqui los dos desplegables solo ofrecen tanques y combustibles. El error no se
  explica: no se puede cometer.

  LA ENTRADA NORMAL ES POR COMPRA

  Cuando el gasoil llega con una orden, entra al recibirla y no hace falta esto.
  Esto es para lo demas: el saldo con el que arranca un tanque, una compra hecha
  por fuera, un traslado de otro sitio. Va dicho en la pantalla para que nadie
  registre dos veces la misma compra.
*/

export function ModalCargarCombustible({
  abierto,
  onCerrar,
}: {
  abierto: boolean
  onCerrar: () => void
}) {
  const { data: almacenes } = useAlmacenes()
  const combustibles = useCombustibles()
  const entrada = useRegistrarEntrada()
  const hoy = hoyEnCaracas()

  const [tanque, setTanque] = useState('')
  const [articulo, setArticulo] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [costo, setCosto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [referencia, setReferencia] = useState('')
  /*
    LO QUE LLEGO SIN COSTAR NADA AQUI.

    Jesmary: «ese combustible llego hace ya bastante tiempo y no tiene factura
    ni una constancia de pago, solo lo llevaron y lo ingresaron a la cantera».
    Venia de la base principal del grupo, donde se registro el gasto.

    No es una compra sin precio: es un traslado entre empresas. Por eso la
    casilla dice quien asumio el gasto en vez de dejar el costo en blanco — un
    costo vacio no se distingue de un descuido, y este no lo es.
  */
  const [sinCosto, setSinCosto] = useState(false)
  const [dia, setDia] = useState(hoy)

  const tanques = (almacenes ?? []).filter((a) => a.tipo === 'COMBUSTIBLE')

  useEffect(() => {
    if (!abierto) return
    // Con un solo tanque no se pregunta a cuál: se elige solo.
    setTanque(tanques.length === 1 ? String(tanques[0].id) : '')
    setArticulo('')
    setCantidad('')
    setCosto('')
    setMotivo('')
    setReferencia('')
    setDia(hoy)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  const litros = Number(cantidad)
  const valido =
    Boolean(tanque) && Boolean(articulo) && litros > 0 &&
    (sinCosto ? motivo.trim().length >= 15 : Number(costo) > 0) &&
    motivo.trim().length >= 4

  const unidad =
    (combustibles.data ?? []).find((c) => String(c.id) === articulo)?.unidad ?? 'L'

  const enviar = async () => {
    await entrada.mutateAsync({
      almacen_id: Number(tanque),
      articulo_id: Number(articulo),
      cantidad: litros,
      costo_usd: sinCosto ? 0 : Number(costo),
      sin_costo: sinCosto,
      motivo: motivo.trim(),
      referencia: referencia.trim() || null,
      fecha: dia,
    })
    onCerrar()
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Cargar combustible al tanque"
      descripcion="Para lo que entra sin una compra de por medio: el saldo con el que arranca el tanque, algo comprado por fuera, un traslado. Si llegó con una orden de compra, entra al recibirla."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button disabled={!valido || entrada.isPending} onClick={() => void enviar()}>
            {entrada.isPending ? 'Cargando…' : 'Cargar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="A qué tanque"
          vacio="Elegir"
          value={tanque}
          onChange={(e) => setTanque(e.target.value)}
          opciones={tanques.map((t) => ({ valor: String(t.id), etiqueta: t.nombre }))}
          hint={
            tanques.length === 0
              ? 'No hay ningún tanque. Se crea en Inventario → Almacenes, con tipo Combustible.'
              : undefined
          }
        />
        <Select
          label="Qué combustible"
          vacio="Elegir"
          value={articulo}
          onChange={(e) => setArticulo(e.target.value)}
          opciones={(combustibles.data ?? []).map((c) => ({
            valor: String(c.id),
            etiqueta: c.nombre,
          }))}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input
          label={`Cuántos ${unidad.toLowerCase()}`}
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
        />
        <Input
          label={`Cuánto costó cada ${unidad.toLowerCase()} (USD)`}
          type="number"
          min="0"
          step="0.0001"
          inputMode="decimal"
          disabled={sinCosto}
          value={sinCosto ? '' : costo}
          onChange={(e) => setCosto(e.target.value)}
          hint={
            sinCosto
              ? 'Entra en cero: el gasto lo asumió la otra empresa.'
              : 'Con esto se valora lo que se despache después. Sin costo, cada vale sale en cero.'
          }
        />

        {/*
          La casilla va debajo del costo y no arriba, a propósito: primero se
          intenta poner lo que costó, que es el caso de casi siempre. Esto es la
          salida para cuando de verdad no costó nada AQUÍ.
        */}
        <label
          className={cn(
            'flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm sm:col-span-2',
            sinCosto ? 'border-warning/30 bg-warning-soft' : 'border-hairline',
          )}
        >
          <input
            type="checkbox"
            className="accent-royal-600 mt-0.5 size-4 shrink-0"
            checked={sinCosto}
            onChange={(e) => setSinCosto(e.target.checked)}
          />
          <span className="text-ink/80">
            No costó nada para esta empresa
            <span className="text-ink/50 mt-0.5 block text-xs">
              {sinCosto
                ? 'Escribe abajo de dónde vino y quién asumió el gasto. Queda escrito en el movimiento.'
                : 'Para material trasladado desde otra empresa del grupo, donde ya se registró el gasto.'}
            </span>
          </span>
        </label>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input label="Entra el" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
        <Input
          label="Referencia"
          placeholder="Factura, guía, nota"
          value={referencia}
          onChange={(e) => setReferencia(e.target.value)}
        />
      </div>

      <div className="mt-4">
        <Textarea
          label="De dónde viene"
          rows={2}
          placeholder="Saldo inicial del tanque"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </div>

      {entrada.error ? <ErrorDeCarga error={entrada.error} className="mt-3" /> : null}
    </Modal>
  )
}
