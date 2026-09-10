import { useState } from 'react'
import { Landmark } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import {
  useCambiarDuenoDeMaterial,
  usePropietarios,
  type Existencia,
} from '@/lib/api/inventario'
import { hoyEnCaracas } from '@/lib/api/tasas'
/* El mismo formato que usa Existencias para una cantidad: entera cuando lo es,
   y con dos decimales cuando no. Se repite aquí porque allí es una función
   local de la pantalla, y sacarla a `formato` es una limpieza aparte. */
const enCantidad = (valor: string | number) => {
  const n = Number(valor)
  return Number.isInteger(n)
    ? n.toLocaleString('es-VE')
    : n.toLocaleString('es-VE', { maximumFractionDigits: 2 })
}

/*
  PASAR MATERIAL DE UN DUEÑO A OTRO.

  Christopher: «¿cómo se hace una transferencia de dueño de uno o N items?».

  ═══════════════════════════════════════════════════════════════════════════
  NO SE MUEVE NADA DE SITIO, Y LA PANTALLA TIENE QUE DECIRLO
  ═══════════════════════════════════════════════════════════════════════════

  Las sillas de la gobernación que pasan a ser nuestras siguen donde estaban. Es
  lo primero que hay que entender al abrir esto, porque todo lo demás en esta
  sección mueve cosas de un lado a otro y quien llega aquí espera lo mismo.

  Por eso el almacén no se elige: es el de la fila desde la que se abrió, y se
  enseña como un hecho, no como un campo.

  ═══════════════════════════════════════════════════════════════════════════
  DE UNO EN UNO, A PROPÓSITO
  ═══════════════════════════════════════════════════════════════════════════

  Él pregunta por «uno o N items». Se hace de uno en uno y no en lote, y no es
  pereza: cada renglón tiene su cantidad, su dueño de origen —que puede ser
  distinto— y sobre todo su motivo. Un lote con un motivo único obligaría a
  escribir una frase que valga para todo, y esa frase acaba siendo «traspaso»,
  que dentro de un año no explica nada.

  Cuando la donación es de veinte artículos, veinte apuntes con su acta es lo que
  hace falta para poder cuadrar con el ente renglón por renglón.
*/
export function ModalCambioDeDueno({
  fila,
  onCerrar,
}: {
  fila: Existencia
  onCerrar: () => void
}) {
  const { data: propietarios } = usePropietarios()
  const cambiar = useCambiarDuenoDeMaterial()

  /* De quién puede salir: solo los que de verdad tienen algo aquí. */
  const duenos = fila.duenos ?? []
  const [de, setDe] = useState(duenos[0] ?? '')
  const [a, setA] = useState('')
  const [cuanto, setCuanto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [fecha, setFecha] = useState(hoyEnCaracas())
  const [valor, setValor] = useState('')

  const nombreDe = (codigo: string) =>
    (propietarios ?? []).find((d) => d.codigo === codigo)?.nombre ?? codigo

  const cantidadNum = Number(cuanto.replace(',', '.'))
  const listo =
    Boolean(de) && Boolean(a) && de !== a && cantidadNum > 0 && motivo.trim().length >= 10

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Cambiar de dueño"
      descripcion="El material no se mueve: sigue donde está. Lo que cambia es de quién es."
      acciones={
        <>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            icon={<Landmark />}
            disabled={!listo || cambiar.isPending}
            onClick={async () => {
              await cambiar.mutateAsync({
                almacen_id: fila.almacen_id,
                articulo_id: fila.articulo_id,
                cantidad: cantidadNum,
                de,
                a,
                motivo: motivo.trim(),
                fecha,
                valor_usd: valor ? Number(valor.replace(',', '.')) : null,
              })
              onCerrar()
            }}
          >
            {cambiar.isPending ? 'Guardando…' : 'Cambiar de dueño'}
          </Button>
        </>
      }
    >
      {/* El qué y el dónde, como hechos y no como campos: vienen de la fila
          desde la que se abrió esto, y volver a preguntarlos sería pedir que se
          teclee lo que se acaba de pulsar. */}
      <p className="border-hairline text-ink/70 rounded-lg border px-3 py-2 text-sm">
        <span className="text-ink/90 font-medium">{fila.articulo}</span>
        <span className="text-ink/45"> · en {fila.almacen}</span>
        <span className="text-ink/45 block text-xs">
          Hay {enCantidad(fila.existencia)} {fila.unidad}
          {duenos.length > 1 ? `, repartidas entre ${duenos.length} dueños` : ''}
        </span>
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Select
          label="Era de"
          vacio={duenos.length > 1 ? 'Elige el dueño' : undefined}
          value={de}
          onChange={(e) => setDe(e.target.value)}
          hint="Solo salen los que tienen algo de esto aquí."
          opciones={duenos.map((d) => ({ valor: d, etiqueta: nombreDe(d) }))}
        />
        <Select
          label="Pasa a ser de"
          vacio="Elige el dueño"
          value={a}
          onChange={(e) => setA(e.target.value)}
          error={de && a && de === a ? 'Ya es suyo.' : undefined}
          opciones={(propietarios ?? [])
            .filter((d) => d.codigo !== de)
            .map((d) => ({
              valor: d.codigo,
              etiqueta: d.es_la_casa ? `${d.nombre} (nosotros)` : d.nombre,
            }))}
        />
        <Input
          label={`Cuántas ${fila.unidad}`}
          type="number"
          min="0"
          step="0.0001"
          inputMode="decimal"
          value={cuanto}
          onChange={(e) => setCuanto(e.target.value)}
        />
        <Input
          label="Cuándo"
          type="date"
          max={hoyEnCaracas()}
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />
      </div>

      {/*
        EL VALOR SOLO SI SE ACORDÓ OTRO.

        Por defecto entra a los libros del nuevo dueño al mismo valor con el que
        estaba, que es la continuidad y no inventa nada. Se admite declarar otro
        porque una donación puede acordarse en un valor distinto del que tenía en
        los papeles de quien la entrega — y entonces queda escrito que se
        declaró, que es distinto de que se calculara.
      */}
      <Input
        className="mt-4"
        label="Valor acordado, si se acordó uno (USD)"
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        placeholder="Vacío: entra al valor que ya tenía"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        hint="Es el total, no el unitario. Solo se llena si el acta dice otra cifra."
      />

      {/*
        DIEZ LETRAS COMO MÍNIMO, igual que una baja, y por el mismo motivo:
        dentro de un año esta frase es lo único que explicará por qué ese material
        dejó de ser de quien era. La base también lo exige.
      */}
      <Textarea
        className="mt-4"
        label="Por qué cambia de dueño"
        rows={3}
        placeholder="Acta de donación 2026-14 de la gobernación"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        hint="Con detalle: el acta, la factura o el acuerdo que lo respalda."
      />

      {cambiar.error ? <ErrorDeCarga error={cambiar.error} className="mt-4" /> : null}
    </Modal>
  )
}
