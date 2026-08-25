import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useAlmacenes, useExistencias } from '@/lib/api/inventario'
import { useArticulos } from '@/lib/api/catalogo'
import { enPlural } from '@/lib/formato'
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

  SE ABRE DESDE LA FILA DEL MATERIAL, Y TAMBIÉN SIN ELLA

  Nació abriéndose solo desde la fila, porque ahí ya se sabe qué es y de qué
  almacén sale. El razonamiento era bueno para el modal y dejó la pantalla sin
  puerta: las filas solo aparecen cuando se elige un almacén, así que desde
  «Todo el inventario» —que es como se entra— no había ningún botón. Christopher
  preguntó «¿dónde puedo enviar un item al taller?», y la respuesta era «primero
  elige un almacén», que no es una respuesta.

  Ahora hay botón en la cabecera y el modal se abre sin fila. Lo que se temía
  —que elegir el almacén a mano es lo que más fácil se equivoca cuando el mismo
  artículo está en dos sitios— se resuelve como en la salida de varios
  renglones: el sitio se elige DESPUÉS del artículo y solo entre los que de
  verdad lo tienen, con cuánto hay en cada uno. Así no hay un sitio equivocado
  que ofrecer.
*/

export function ModalAlTaller({
  fila,
  abierto = false,
  onCerrar,
}: {
  /** La fila de existencias desde la que se abre. Nula cuando se abre a pelo. */
  fila: Existencia | null
  /** Cierto para abrirlo sin fila, desde la cabecera de la pantalla. */
  abierto?: boolean
  onCerrar: () => void
}) {
  const seVe = fila !== null || abierto

  /*
    Sin fila hay que elegir qué y de dónde, y se pide el inventario entero para
    poder ofrecerlo. Solo con el modal abierto: doscientas filas de existencias
    no hacen falta para pintar la pantalla de detrás.
  */
  const todas = useExistencias(undefined, seVe && fila === null)
  const { data: articulos } = useArticulos()
  const [elegidoArticulo, setElegidoArticulo] = useState('')
  const [elegidoAlmacen, setElegidoAlmacen] = useState('')

  useEffect(() => {
    if (!seVe) return
    setElegidoArticulo('')
    setElegidoAlmacen('')
  }, [seVe])

  const sitiosConEse = (todas.data ?? []).filter(
    (e) => String(e.articulo_id) === elegidoArticulo && Number(e.disponibles) > 0,
  )

  /*
    Solo lo que se puede reparar.

    El selector se llenaba con todo lo que tuviera existencia —aceite de motor,
    arena lavada, botas, cascos— y nada de eso vuelve del taller arreglado. La
    base ya lo rechaza; ofrecerlo era hacer que alguien llenara la orden entera
    para que se la tumbaran al final.

    El dato vive en el articulo y no en la existencia, asi que se cruza con el
    catalogo que la aplicacion ya tiene cargado.
  */
  const reparables = new Set(
    (articulos ?? []).filter((a) => a.reparable).map((a) => a.id),
  )

  const articulosConExistencia = [
    ...new Map(
      (todas.data ?? [])
        .filter((e) => Number(e.disponibles) > 0 && reparables.has(e.articulo_id))
        .map((e) => [String(e.articulo_id), e]),
    ).entries(),
  ].map(([valor, e]) => ({
    valor,
    codigo: e.articulo_codigo,
    nombre: e.articulo,
    detalle: e.categoria,
  }))

  // La fila con la que se trabaja: la que llegó, o la que se acaba de elegir.
  const enCurso: Existencia | null =
    fila ??
    (todas.data ?? []).find(
      (e) => String(e.articulo_id) === elegidoArticulo && String(e.almacen_id) === elegidoAlmacen,
    ) ??
    null

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
    if (!seVe) return
    setTaller('')
    setCantidad('')
    setMotivo('')
    setUrgencia('NORMAL')
    setEspecialidad('')
    setDias('')
    setDia(hoy)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seVe])

  // El taller de destino no puede ser el almacén de origen, y esa opción no se
  // ofrece: un error que se puede quitar del desplegable no hace falta
  // explicarlo después con un mensaje.
  const talleres = (almacenes ?? []).filter(
    (a) => a.tipo === 'TALLER' && a.id !== enCurso?.almacen_id,
  )

  const pedidas = Number(cantidad)
  const hay = Number(enCurso?.existencia ?? 0)
  const excede = pedidas > hay
  const valido =
    Boolean(enCurso) && Boolean(taller) && pedidas > 0 && !excede && motivo.trim().length >= 4

  const enviar = async () => {
    if (!enCurso) return
    await abrir.mutateAsync({
      tipo: 'RECTIFICACION',
      motivo: motivo.trim(),
      taller_id: Number(taller),
      articulo_id: enCurso.articulo_id,
      cantidad: pedidas,
      origen_id: enCurso.almacen_id,
      urgencia,
      especialidad: especialidad || null,
      fecha: dia,
      dias_estimados: dias ? Number(dias) : null,
    })
    onCerrar()
  }

  return (
    <Modal
      abierto={seVe}
      onCerrar={onCerrar}
      titulo="Mandar material al taller"
      descripcion={
        enCurso
          ? `${enCurso.articulo} · sale de ${enCurso.almacen}. Al volver se anota cuánto volvió; lo que falte queda como merma del taller.`
          : 'Qué se manda a rectificar y de dónde sale. Al volver se anota cuánto volvió; lo que falte queda como merma del taller.'
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
      {/* Solo cuando se abre desde la cabecera. Abierto desde una fila, el qué y
          el de dónde ya están decididos y volver a preguntarlos sería pedir lo
          que se acaba de pulsar. */}
      {!fila ? (
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <SelectBuscable
            label="Qué se manda"
            vacio={
              articulosConExistencia.length === 0
                ? 'Nada reparable con existencia'
                : 'Busca el material'
            }
            valor={elegidoArticulo}
            onCambio={(v) => {
              // Al cambiar de artículo, el sitio elegido puede dejar de tenerlo.
              // Con uno solo se pone solo; con varios se limpia, porque elegir
              // por él de qué almacén sale no es cosa nuestra.
              const conEse = (todas.data ?? []).filter(
                (e) => String(e.articulo_id) === v && Number(e.disponibles) > 0,
              )
              setElegidoArticulo(v)
              setElegidoAlmacen(conEse.length === 1 ? String(conEse[0].almacen_id) : '')
            }}
            opciones={articulosConExistencia}
          />

          <SelectBuscable
            label="De dónde sale"
            vacio={elegidoArticulo ? 'Elige el sitio' : 'Elige antes el material'}
            valor={elegidoAlmacen}
            onCambio={setElegidoAlmacen}
            // Solo los sitios que lo tienen, con cuánto hay en cada uno: así no
            // hay un sitio equivocado que ofrecer.
            opciones={sitiosConEse.map((e) => ({
              valor: String(e.almacen_id),
              codigo: e.almacen_codigo,
              nombre: e.almacen,
              detalle: `hay ${Number(e.disponibles)} ${e.unidad}`,
            }))}
          />
        </div>
      ) : null}

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
          label={`Cuánto mandas${enCurso ? ` (${enPlural(enCurso.unidad)})` : ''}`}
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          error={excede && enCurso ? `Solo hay ${hay} ${enCurso.unidad}` : undefined}
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
