import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useAlmacenes } from '@/lib/api/inventario'
import type { Existencia } from '@/lib/api/inventario'
import {
  URGENCIAS,
  useAbrirMantenimiento,
  useEspecialidades,
  type Urgencia,
} from '@/lib/api/maquinaria'
import { hoyEnCaracas } from '@/lib/api/tasas'

/*
  MANDAR MATERIAL AL TALLER

  Christopher: «¿qué pasa si dispongo de varillas que se han desviado levemente
  durante su traslado y necesitamos enviarlas al taller para rectificarlas?».

  Antes no había forma. El taller solo recibía máquinas, así que lo más que se
  podía hacer era una transferencia al almacén del taller — el material aparecía
  allí sin decir por qué, sin plazo, sin costo y sin nada que dijera que volvió.

  VA EN UN MODAL PROPIO Y NO EN EL DE SALIDAS

  El de Existencias ya distingue cuatro casos —entrada, salida, baja y conteo— y
  cada uno con su explicación. Meter un quinto que además no es una salida
  —el material vuelve— habría hecho el más usado del inventario más difícil de
  leer para arreglar un caso que ocurre poco.

  ESTO NO ES UNA SALIDA, ES UN VIAJE DE IDA Y VUELTA

  Y eso manda en el texto de la pantalla: no se pregunta «cuánto sale» sino
  «cuánto mandas», y se dice desde el principio que al volver se anota cuánto
  volvió. Lo que no vuelva se registra como merma del taller, no desaparece.

  SE ABRE DESDE LA FILA DEL MATERIAL

  Porque ahí ya se sabe qué es y de qué almacén sale. Abrirlo desde el taller
  obligaría a buscar el artículo y a elegir el almacén a mano, que es justo el
  dato que más fácil se equivoca cuando el mismo artículo está en dos sitios.
*/

export function ModalAlTaller({
  fila,
  onCerrar,
}: {
  /** La fila de existencias desde la que se abre. `null` cierra el modal. */
  fila: Existencia | null
  onCerrar: () => void
}) {
  const { data: almacenes } = useAlmacenes()
  const especialidades = useEspecialidades()
  const abrir = useAbrirMantenimiento()
  const hoy = hoyEnCaracas()

  const [taller, setTaller] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [urgencia, setUrgencia] = useState<Urgencia>('NORMAL')
  const [especialidad, setEspecialidad] = useState('')
  const [dias, setDias] = useState('')
  const [dia, setDia] = useState(hoy)

  useEffect(() => {
    if (!fila) return
    setTaller('')
    setCantidad('')
    setMotivo('')
    setUrgencia('NORMAL')
    setEspecialidad('')
    setDias('')
    setDia(hoy)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fila])

  // El taller de destino no puede ser el almacén de origen, y esa opción no se
  // ofrece: un error que se puede quitar del desplegable no hace falta
  // explicarlo después con un mensaje.
  const talleres = (almacenes ?? []).filter((a) => a.tipo === 'TALLER' && a.id !== fila?.almacen_id)

  const pedidas = Number(cantidad)
  const hay = Number(fila?.existencia ?? 0)
  const excede = pedidas > hay
  const valido = Boolean(taller) && pedidas > 0 && !excede && motivo.trim().length >= 4

  const enviar = async () => {
    if (!fila) return
    await abrir.mutateAsync({
      tipo: 'RECTIFICACION',
      motivo: motivo.trim(),
      taller_id: Number(taller),
      articulo_id: fila.articulo_id,
      cantidad: pedidas,
      origen_id: fila.almacen_id,
      urgencia,
      especialidad: especialidad || null,
      fecha: dia,
      dias_estimados: dias ? Number(dias) : null,
    })
    onCerrar()
  }

  return (
    <Modal
      abierto={fila !== null}
      onCerrar={onCerrar}
      titulo="Mandar material al taller"
      descripcion={
        fila
          ? `${fila.articulo} · sale de ${fila.almacen}. Al volver se anota cuánto volvió; lo que falte queda como merma del taller.`
          : ''
      }
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button disabled={!valido || abrir.isPending} onClick={() => void enviar()}>
            {abrir.isPending ? 'Mandando…' : 'Mandar al taller'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="A qué taller"
          vacio="Elegir"
          value={taller}
          onChange={(e) => setTaller(e.target.value)}
          opciones={talleres.map((t) => ({ valor: String(t.id), etiqueta: t.nombre }))}
          hint={
            talleres.length === 0
              ? 'No hay ningún otro taller donde mandarlo.'
              : 'El material se mueve de verdad: sale del almacén y entra al taller.'
          }
        />
        <Input
          label={`Cuánto mandas (${fila?.unidad?.toLowerCase() ?? 'unidades'})`}
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          error={excede && fila ? `Solo hay ${hay} ${fila.unidad}` : undefined}
        />
      </div>

      <div className="mt-4">
        <Textarea
          label="Qué le pasa"
          rows={2}
          placeholder="Se torcieron en el traslado y hay que enderezarlas"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          hint="Lo que se sabe ahora. Qué se le hizo se anota al cerrarla."
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Select
          label="Urgencia"
          value={urgencia}
          onChange={(e) => setUrgencia(e.target.value as Urgencia)}
          opciones={URGENCIAS.map((u) => ({ valor: u.valor, etiqueta: u.etiqueta }))}
          hint={URGENCIAS.find((u) => u.valor === urgencia)?.detalle}
        />
        <Select
          label="Qué hace falta"
          vacio="Sin especificar"
          value={especialidad}
          onChange={(e) => setEspecialidad(e.target.value)}
          opciones={(especialidades.data ?? []).map((x) => ({
            valor: x.codigo,
            etiqueta: x.nombre,
          }))}
          hint="Si el taller declaró sus oficios y este no está, no lo acepta."
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input label="Sale el" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
        <Input
          label="Días estimados"
          type="number"
          min="1"
          step="1"
          placeholder="Opcional"
          value={dias}
          onChange={(e) => setDias(e.target.value)}
          hint="Si se pasa, el taller lo marca en su cola."
        />
      </div>

      {abrir.error ? <ErrorDeCarga error={abrir.error} className="mt-3" /> : null}
    </Modal>
  )
}
