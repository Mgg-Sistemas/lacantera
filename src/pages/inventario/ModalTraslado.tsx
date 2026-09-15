import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { CantidadDeArticulo } from '@/components/CantidadDeArticulo'
import { conDueno, detalleDeDueno } from '@/lib/deQuien'
import { conSusFormas, useArticulos, useTodasLasPresentaciones } from '@/lib/api/catalogo'
import {
  useAlmacenes,
  useComoActuoEnTraslados,
  useExistencias,
  usePropietarios,
  useSolicitarTraslado,
} from '@/lib/api/inventario'

/*
  EL RENGLÓN GUARDA EL TOTAL Y ADEMÁS LO QUE SE TECLEÓ.

  `cantidad` es la suma en la unidad de operación —es lo que mira el botón y la
  comprobación de que alcanza— y las tres de abajo son lo que la persona contó.
  Se mandan las dos cosas: la base rehace la cuenta y anota al lado del asiento
  «1 TAMBOR y 5 L» junto a «213 L». Mandando solo el total, el traslado le diría
  213 a quien cargó un tambor.
*/
const VACIO = {
  origen: '',
  destino: '',
  articulo: '',
  cantidad: '',
  motivo: '',
  presentaciones: null as number | null,
  presentacion: null as string | null,
  suelto: '',
  /* De quién sale. Solo se llena cuando en el origen hay mezcla; con un solo
     dueño la base lo resuelve y preguntar sería hacer trabajar a quien ya sabe
     la respuesta. */
  propietario: '',
  /* Hacerlo ya: sale y llega en este momento, sin pasar por «En camino». */
  inmediato: false,
}

/*
  MOVER MATERIAL DE UN SITIO A OTRO, DESDE DONDE SE ESTÉ MIRANDO.

  La ventana vivía dentro de Transferencias, y ahí se quedaba sola: quien veía
  en Existencias que al patio le sobraba y al taller le faltaba tenía que irse a
  otra pantalla y empezar de cero. Christopher: «debemos incluir un botón para
  hacer un traslado de un almacén a otro, o de un punto a otro».

  UNA SOLA VENTANA PARA LAS DOS PUERTAS

  Copiarla en Existencias habría dejado las reglas del traslado escritas dos
  veces —los filtros cruzados, los envases, el dueño, el tanque sin costo—, y el
  día que una cambie la otra se queda atrás sin que nada avise. Por eso sale a
  su propio archivo y las dos pantallas abren esta.

  EL ORIGEN PUEDE LLEGAR PUESTO

  Si en Existencias hay un almacén elegido, casi seguro que de ahí sale lo que
  se va a mover. Llega puesto, pero solo si ese sitio tiene algo que trasladar:
  proponer un almacén vacío dejaría escrito en el formulario un valor que su
  propia lista no enseña.
*/
export function ModalTraslado({
  abierto,
  onCerrar,
  origen,
  onTrasladado,
}: {
  abierto: boolean
  onCerrar: () => void
  /** El almacén que la pantalla tiene elegido, para proponerlo como origen. */
  origen?: string
  /**
   * Con el traslado pedido o hecho recibe su id. Si se hizo en el acto, el
   * material ya se movió y la pantalla saca la nota; si solo se pidió, todavía no.
   */
  onTrasladado?: (t: { id: number; inmediato: boolean }) => void
}) {
  const { data: almacenes } = useAlmacenes()
  const { data: propietarios } = usePropietarios()
  const { data: yo } = useComoActuoEnTraslados()
  /* De dónde sale lo que se acaba de pedir, para decir a quién le toca ahora. */
  const [pedido, setPedido] = useState<string | null>(null)

  /* El rótulo del dueño, para donde no cabe una pastilla. */
  const nombreDeDueno = (codigo?: string | null) =>
    (propietarios ?? []).find((d) => d.codigo === codigo)?.nombre ?? codigo ?? undefined
  const { data: articulos } = useArticulos()
  const solicitar = useSolicitarTraslado()
  const { data: formasDeContar } = useTodasLasPresentaciones()

  const [form, setForm] = useState(VACIO)
  const [error, setError] = useState('')

  const cambiar = (parte: Partial<typeof VACIO>) => setForm((v) => ({ ...v, ...parte }))

  /*
    TODAS LAS EXISTENCIAS, NO SOLO LAS DEL ORIGEN.

    Antes se pedían las del almacén elegido, que basta para decir cuánto hay. Ya
    no basta: las listas se filtran en los dos sentidos —el almacén por lo que
    tiene, el artículo por dónde está— y para eso hace falta el mapa entero. Es
    una consulta más ancha y una sola: `v_existencias` sin filtro.

    Y solo con la ventana abierta. En Existencias este modal está montado desde
    que se entra, y la pantalla de detrás no necesita el mapa entero para
    pintarse.
  */
  const { data: existencias } = useExistencias(undefined, abierto)
  /*
    LAS DOS LISTAS SE FILTRAN LA UNA A LA OTRA.

    Christopher: «solo pueden aparecer almacenes que tengan algo (¿si no qué
    pudieran trasladar?) o items que tengan existencia (y esto filtre o reduzca a
    los almacenes que se puedan escoger, pues de ahí salen), es casi la versión
    inversa de lo anterior».

    Y es exactamente eso, en los dos sentidos:

      sin artículo elegido .... salen los almacenes que tienen ALGO
      con artículo elegido .... salen los que tienen ESE artículo
      sin almacén elegido ..... salen los artículos que hay en algún sitio
      con almacén elegido ..... salen los que hay AHÍ

    Ofrecer lo imposible no es neutral: el operador elige, pulsa y se come un
    error por algo que la pantalla ya sabía antes de que empezara a escribir.
  */
  const conAlgo = useMemo(
    () => (existencias ?? []).filter((e) => Number(e.existencia) > 0),
    [existencias],
  )

  /*
    EL ORIGEN PROPUESTO SE PONE UNA VEZ POR APERTURA.

    Y no cada vez que cambian las existencias. Cualquier movimiento de otra
    persona las refresca, y si la propuesta se volviera a aplicar entonces, a
    quien ya había cambiado el origen se le deshacería el formulario mientras
    escribe.
  */
  const propuesto = useRef(false)
  useEffect(() => {
    if (!abierto) {
      propuesto.current = false
      return
    }
    if (propuesto.current || !origen || !existencias) return
    propuesto.current = true
    if (conAlgo.some((e) => String(e.almacen_id) === origen)) {
      // Otro origen invalida lo demás: el artículo y el dueño eran de aquel sitio.
      setForm((v) => (v.origen === origen ? v : { ...VACIO, origen }))
    }
  }, [abierto, origen, existencias, conAlgo])

  const almacenesQueSirven = useMemo(() => {
    const suyos = form.articulo
      ? conAlgo.filter((e) => String(e.articulo_id) === form.articulo)
      : conAlgo
    return new Set(suyos.map((e) => e.almacen_id))
  }, [conAlgo, form.articulo])

  const articulosQueHay = useMemo(() => {
    const aqui = form.origen
      ? conAlgo.filter((e) => String(e.almacen_id) === form.origen)
      : conAlgo
    return new Set(aqui.map((e) => e.articulo_id))
  }, [conAlgo, form.origen])

  const disponible = useMemo(() => {
    if (!form.origen || !form.articulo) return null
    /*
      SE BUSCA POR ALMACÉN **Y** POR ARTÍCULO, y ese `and` es nuevo.

      Antes bastaba con el artículo porque la consulta ya venía filtrada por el
      almacén elegido. Al ensancharla para poder cruzar las dos listas, buscar
      solo por artículo pasó a devolver la existencia del PRIMER sitio que lo
      tuviera — otro almacén— y con eso el tope de «solo hay tanto» dejaba pasar
      traslados imposibles.

      Es el riesgo de ensanchar una consulta que alguien ya está leyendo: lo que
      antes era redundante se vuelve obligatorio, y sin ruido.
    */
    const fila = existencias?.find(
      (e) => String(e.almacen_id) === form.origen && String(e.articulo_id) === form.articulo,
    )
    return fila ? Number(fila.existencia) : 0
  }, [existencias, form.origen, form.articulo])

  const activos = (almacenes ?? []).filter((a) => a.activo)

  /*
    Si el sitio del que sale admite material sin costo, el destino tiene que
    admitirlo tambien. Indefinido mientras no se haya elegido origen: ahi no hay
    nada que estrechar todavia.
  */
  const origenSinCosto = form.origen
    ? Boolean(activos.find((a) => String(a.id) === form.origen)?.admite_sin_costo)
    : undefined

  /*
    DE QUIÉN ES LO QUE SE MUEVE.

    Esto era un filtro y ha dejado de serlo. Mientras el dueño lo ponía el sitio,
    llevar una silla de la gobernación a un almacén nuestro la volvía nuestra, y
    por eso la pantalla no ofrecía la pareja. Desde el 10/09/2026 el dueño viaja
    con el material: la bomba de la gobernación puede estar en nuestro taller sin
    dejar de ser suya, que es justo lo que hacía falta para poder repararla.

    Así que ahora todos los destinos se ofrecen, y lo que se pregunta es OTRA
    cosa: cuando en el origen hay material de varios dueños, de cuál sale. Con un
    solo dueño no se pregunta, porque no hay nada que decidir.
  */
  const duenosEnElOrigen = useMemo(
    () =>
      (existencias ?? []).find(
        (e) =>
          String(e.almacen_id) === form.origen && String(e.articulo_id) === form.articulo,
      )?.duenos ?? [],
    [existencias, form.origen, form.articulo],
  )

  const hayMezcla = duenosEnElOrigen.length > 1

  /*
    PEDIRLO O HACERLO YA.

    Christopher: «un traslado no necesariamente es inmediato (aunque hay que
    dejar abierta la posibilidad con alguna opción)». Hacerlo ya es aceptar en el
    origen y recibir en el destino a la vez, así que la casilla solo aparece para
    quien responde por los dos sitios, o para administración.

    Lo que entró sin costo no pasa por «En camino» —se mezclaría con lo que sí
    costó—, así que desde ahí solo se puede en el acto.
  */
  const puedeHacerloYa =
    yo != null &&
    Boolean(form.origen && form.destino) &&
    (yo.respaldo ||
      (yo.sitios.includes(Number(form.origen)) && yo.sitios.includes(Number(form.destino))))
  const soloEnElActo = origenSinCosto === true
  const inmediato = soloEnElActo || (form.inmediato && puedeHacerloYa)

  const cantidad = Number(form.cantidad.replace(',', '.'))
  const listo =
    form.origen &&
    form.destino &&
    form.origen !== form.destino &&
    form.articulo &&
    cantidad > 0 &&
    (disponible === null || cantidad <= disponible) &&
    form.motivo.trim().length >= 4 &&
    // Con mezcla en el origen hay que decir de quién sale. La base también lo
    // para, pero enterarse al pulsar con el formulario lleno llega tarde.
    (!hayMezcla || Boolean(form.propietario)) &&
    (!soloEnElActo || puedeHacerloYa)

  const cerrar = () => {
    setError('')
    setPedido(null)
    onCerrar()
  }

  const enviar = async () => {
    setError('')
    try {
      const deDonde = activos.find((a) => String(a.id) === form.origen)?.nombre ?? 'el origen'
      const id = await solicitar.mutateAsync({
        origen_id: Number(form.origen),
        destino_id: Number(form.destino),
        articulo_id: Number(form.articulo),
        cantidad,
        motivo: form.motivo.trim(),
        presentaciones: form.presentaciones,
        presentacion: form.presentacion,
        suelto: form.suelto ? Number(form.suelto.replace(',', '.')) : null,
        // Vacío cuando no hay mezcla: la base lo resuelve mirando lo que hay.
        propietario: form.propietario || null,
        inmediato,
      })
      setForm(VACIO)
      if (inmediato) {
        onCerrar()
        // El papel sale en el acto, como la nota de salida: viaja con el material.
        onTrasladado?.({ id: Number(id), inmediato: true })
      } else {
        // Queda pedido. Se dice aquí, en la misma ventana, a quién le toca ahora:
        // cerrarla sin más dejaría a quien pidió sin saber si llegó a algún sitio.
        setPedido(deDonde)
        onTrasladado?.({ id: Number(id), inmediato: false })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={cerrar}
      titulo={pedido ? 'Traslado pedido' : 'Nuevo traslado'}
      descripcion={
        pedido
          ? undefined
          : 'Se pide; lo acepta quien responde por el sitio de donde sale y lo recibe quien responde por el de destino. El costo viaja con el material.'
      }
      acciones={
        pedido ? (
          <>
            <Button variant="ghost" onClick={() => setPedido(null)}>
              Pedir otro
            </Button>
            <Button onClick={cerrar}>Listo</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={cerrar}>
              Cancelar
            </Button>
            <Button onClick={enviar} disabled={!listo || solicitar.isPending}>
              {solicitar.isPending ? 'Enviando…' : inmediato ? 'Trasladar ya' : 'Pedir traslado'}
            </Button>
          </>
        )
      }
    >
      {pedido ? (
        <p className="text-ink/80 text-sm">
          Queda pedido. Lo acepta quien responde por «{pedido}», o administración, y hasta
          entonces el material no se mueve. Lo sigues en Transferencias.
        </p>
      ) : (
      <>
      {/* Once almacenes con nombres largos —«TALLER DE REPARACION DE PLANTA
          FIJA»— no se eligen en un desplegable: hay que abrirlo, recorrerlo
          con la vista y acertar. Escribiendo «planta» sale solo, y de paso
          se ve el código y el tipo de sitio, que es lo que distingue un
          taller de un patio cuando los dos empiezan igual. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectBuscable
          label="Sale de"
          vacio="Elige el almacén"
          valor={form.origen}
          onCambio={(v) => {
            // Y al reves: si el articulo elegido no esta en el almacen nuevo.
            const sigueEstando =
              !form.articulo ||
              conAlgo.some(
                (e) => String(e.almacen_id) === v && String(e.articulo_id) === form.articulo,
              )
            cambiar({ origen: v, ...(sigueEstando ? {} : { articulo: '', cantidad: '' }) })
          }}
          hint={
            form.articulo
              ? 'Solo los sitios donde hay ese artículo.'
              : 'Solo los sitios que tienen algo que trasladar.'
          }
          opciones={activos
            .filter((a) => almacenesQueSirven.has(a.id))
            .map((a) => ({
              valor: String(a.id),
              codigo: a.codigo,
              nombre: a.nombre,
              detalle: conDueno(
                a.tipo,
                detalleDeDueno(a.propietario, nombreDeDueno(a.propietario)),
              ),
            }))}
        />
        {/*
          EL DESTINO SE ESTRECHA SEGUN DE DONDE SALGA.

          `transferir_existencia` rechaza mover entre un almacen que admite
          material sin costo y uno que no, en los dos sentidos: lo que entro
          sin costar nada hundiria el promedio del destino, y al reves lo
          inflaria. La reja esta bien puesta, pero la pantalla seguia
          ofreciendo la pareja imposible y el operador solo se enteraba al
          pulsar.

          Se ofrece lo que si se puede y se dice por que falta el resto, que
          es lo mismo que ya hace el modal de cargar combustible.
        */}
        <SelectBuscable
          label="Entra en"
          vacio="Elige el almacén"
          valor={form.destino}
          onCambio={(v) => cambiar({ destino: v })}
          hint={
            origenSinCosto === undefined
              ? undefined
              : origenSinCosto
                ? 'Solo salen los sitios que también admiten material sin costo: lo que hay aquí entró sin precio y hundiría el promedio de los demás.'
                : 'No sale el tanque del combustible inicial: lo que hay ahí entró sin precio y no se mezcla con lo que sí costó.'
          }
          error={
            form.destino && form.destino === form.origen
              ? 'No puede ser el mismo de donde sale.'
              : undefined
          }
          opciones={activos
            .filter((a) => String(a.id) !== form.origen)
            .filter(
              (a) =>
                origenSinCosto === undefined ||
                Boolean(a.admite_sin_costo) === origenSinCosto,
            )
            .map((a) => ({
              valor: String(a.id),
              codigo: a.codigo,
              nombre: a.nombre,
              detalle: conDueno(
                a.tipo,
                detalleDeDueno(a.propietario, nombreDeDueno(a.propietario)),
              ),
            }))}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <SelectBuscable
          label="Artículo"
          vacio="Elige el artículo"
          valor={form.articulo}
          /*
            CAMBIAR DE ARTICULO PUEDE DEJAR HUERFANO EL ALMACEN.

            Si estaba elegido ALMACEN GENERAL y se pasa a un articulo que solo
            hay en el patio, el almacen deja de estar en su propia lista pero
            sigue escrito en el formulario: invisible y equivocado. Se suelta.

            Lo mismo al reves lo resuelve el filtro sin ayuda, porque la lista
            de articulos se rehace con el almacen nuevo.
          */
          onCambio={(v) => {
            const sirveElOrigen =
              !form.origen ||
              conAlgo.some(
                (e) => String(e.almacen_id) === form.origen && String(e.articulo_id) === v,
              )
            cambiar({
              articulo: v,
              ...(sirveElOrigen ? {} : { origen: '' }),
              // Cambiar de artículo invalida el dueño elegido: el que tenía
              // el anterior puede no tener nada de éste.
              propietario: '',
            })
          }}
          hint={
            form.origen
              ? 'Solo lo que hay en ese almacén.'
              : 'Solo lo que hay en algún sitio.'
          }
          opciones={(articulos ?? [])
            .filter((a) => a.inventariable && a.activo && articulosQueHay.has(a.id))
            .map((a) => ({
              valor: String(a.id),
              codigo: a.codigo,
              nombre: a.nombre,
              detalle: `${a.categoria} · ${a.unidad}`,
            }))}
        />
        {/*
          SE CUENTA EN ENVASES, COMO EN LA ENTRADA Y EN LA SALIDA.

          Christopher: «¿es posible hacer una transferencia o traslado para
          otro almacén de un item y que solo sean pailas o tambores o ambos?».
          No lo era: ésta era la única de las cuatro puertas del inventario que
          pedía una cifra pelada, y justo la que se usa con los envases
          delante, cargándolos en la camioneta, sin ninguna factura que mirar.

          Para mover un tambor Y tres pailas se hacen dos traslados. No es una
          carencia: son dos hechos, y un solo asiento mezclado diría «455 L»
          sin decir qué envases se movieron.
        */}
        <CantidadDeArticulo
          key={form.articulo}
          valor={form.cantidad}
          onCambiar={(v, cap) =>
            cambiar({
              cantidad: v,
              presentaciones: cap.presentaciones,
              presentacion: cap.unidad,
              suelto: String(cap.sueltas ?? ''),
            })
          }
          articulo={conSusFormas(
            articulos?.find((a) => String(a.id) === form.articulo),
            formasDeContar,
          )}
          hintSinArticulo="Elige almacén y artículo para ver cuánto hay."
          hint={
            disponible === null ? undefined : `Disponible: ${disponible.toLocaleString('es-VE')}`
          }
          required
        />

        {/*
          DE QUIÉN SALE, Y SOLO CUANDO HAY DUDA.

          Desde que el dueño viaja con el material, un mismo sitio puede tener
          cosas de la casa y de la gobernación. Sacar sin decir de quién era
          sería inventarlo, así que la base se para — y aquí se pregunta antes,
          que es donde se puede contestar.

          Con un solo dueño no aparece: preguntar lo que ya se sabe enseña a
          responder sin mirar.
        */}
        {hayMezcla ? (
          <Select
            label="¿De quién sale?"
            vacio="Elige el dueño"
            value={form.propietario}
            onChange={(e) => cambiar({ propietario: e.target.value })}
            hint="Aquí hay material de varios dueños. El traslado no cambia de dueño: lo lleva."
            opciones={duenosEnElOrigen.map((d) => ({
              valor: d,
              etiqueta: nombreDeDueno(d) ?? d,
            }))}
          />
        ) : null}
      </div>

      <Textarea
        className="mt-4"
        label="Por qué se mueve"
        rows={2}
        value={form.motivo}
        onChange={(e) => cambiar({ motivo: e.target.value })}
        hint="Dentro de seis meses esto será lo único que explique el movimiento."
      />

      {form.origen && form.destino ? (
        soloEnElActo && !puedeHacerloYa ? (
          <p className="text-danger mt-3 text-sm">
            Lo que hay en ese sitio entró sin costo y solo se traslada en el acto. Eso lo hace
            quien responde por los dos sitios, o administración.
          </p>
        ) : puedeHacerloYa ? (
          <label className="border-hairline mt-4 flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm">
            <input
              type="checkbox"
              className="accent-royal-600 mt-0.5 size-4 shrink-0"
              checked={inmediato}
              disabled={soloEnElActo}
              onChange={(e) => cambiar({ inmediato: e.target.checked })}
            />
            <span className="text-ink/80">
              Hacerlo ya
              <span className="text-ink/50 mt-0.5 block text-xs">
                {soloEnElActo
                  ? 'Lo que entró sin costo no pasa por «En camino»: sale y llega en este momento.'
                  : `Sale y llega en este momento, sin esperar a que lo acepten y lo reciban. ${
                      yo?.respaldo
                        ? 'Lo puedes hacer como administración.'
                        : 'Lo puedes hacer porque respondes por los dos sitios.'
                    }`}
              </span>
            </span>
          </label>
        ) : null
      ) : null}

      {error ? <p className="text-danger mt-3 text-sm">{error}</p> : null}
      </>
      )}
    </Modal>
  )
}
