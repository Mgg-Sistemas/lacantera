import { useMemo, useState } from 'react'
import { ArrowRight, MoveRight, Undo2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { CantidadDeArticulo } from '@/components/CantidadDeArticulo'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { conDueno, detalleDeDueno } from '@/lib/deQuien'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import {
  conSusFormas,
  useArticulos,
  useMisRoles,
  useTodasLasPresentaciones,
} from '@/lib/api/catalogo'
import {
  useAlmacenes,
  usePropietarios,
  useExistencias,
  useMovimientos,
  useReversarMovimiento,
  useTransferir,
} from '@/lib/api/inventario'
import { fechaHora } from '@/lib/formato'

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
}

/**
 * Mover material de un sitio a otro.
 *
 * Un traslado no cambia cuánto hay en la cantera, cambia dónde está: por eso
 * son siempre dos movimientos que nacen juntos, y por eso deshacerlo tumba los
 * dos. La pantalla enseña las parejas, no los movimientos sueltos — ver una
 * salida sin su entrada obligaría a buscar la otra mitad a mano.
 */
export function Transferencias() {
  const { data: almacenes } = useAlmacenes()
  const { data: propietarios } = usePropietarios()

  /* El rótulo del dueño, para donde no cabe una pastilla. */
  const nombreDeDueno = (codigo?: string | null) =>
    (propietarios ?? []).find((d) => d.codigo === codigo)?.nombre ?? codigo ?? undefined
  const { data: articulos } = useArticulos()
  const { puede } = useMisRoles()
  const transferir = useTransferir()
  const { data: formasDeContar } = useTodasLasPresentaciones()
  const reversar = useReversarMovimiento()

  const [form, setForm] = useState(VACIO)
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState('')

  const [deshaciendo, setDeshaciendo] = useState<{ id: number; numero: string } | null>(null)
  const [motivoReverso, setMotivoReverso] = useState('')

  const cambiar = (parte: Partial<typeof VACIO>) => setForm((v) => ({ ...v, ...parte }))

  // Solo se listan las salidas: cada una arrastra su entrada.
  const { data: movimientos, isPending, error: fallo } = useMovimientos({})
  const traslados = useMemo(
    () => (movimientos ?? []).filter((m) => m.tipo === 'TRANSFERENCIA_SALIDA'),
    [movimientos],
  )

  /*
    TODAS LAS EXISTENCIAS, NO SOLO LAS DEL ORIGEN.

    Antes se pedían las del almacén elegido, que basta para decir cuánto hay. Ya
    no basta: las listas se filtran en los dos sentidos —el almacén por lo que
    tiene, el artículo por dónde está— y para eso hace falta el mapa entero. Es
    una consulta más ancha y una sola: `v_existencias` sin filtro.
  */
  const { data: existencias } = useExistencias()
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
    (!hayMezcla || Boolean(form.propietario))

  const enviar = async () => {
    setError('')
    try {
      await transferir.mutateAsync({
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
      })
      setForm(VACIO)
      setAbierto(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const deshacer = async () => {
    if (!deshaciendo) return
    setError('')
    try {
      await reversar.mutateAsync({ id: deshaciendo.id, motivo: motivoReverso.trim() })
      setDeshaciendo(null)
      setMotivoReverso('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const nombreAlmacen = (id: number) => almacenes?.find((a) => a.id === id)?.nombre ?? '—'

  return (
    <>
      <PageHeader
        title="Transferencias"
        description="Material que cambia de sitio. Sale de un almacén y entra en otro por la misma cantidad y al mismo costo."
        actions={
          puede('ALMACEN') ? (
            <Button icon={<MoveRight className="size-[18px]" />} onClick={() => setAbierto(true)}>
              Nuevo traslado
            </Button>
          ) : null
        }
      />

      {isPending ? (
        <Cargando />
      ) : fallo ? (
        <ErrorDeCarga error={fallo} />
      ) : traslados.length === 0 ? (
        <Vacio
          icono={<MoveRight className="size-6" />}
          titulo="Todavía no se ha movido nada de sitio"
          descripcion="Cuando el material pase de un almacén a otro, el traslado queda aquí: la salida de un sitio y la entrada en el otro."
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="text-ink/50 border-ink/10 border-b text-left text-xs">
              <tr>
                <th className="px-4 py-3 font-medium">Movimiento</th>
                <th className="px-4 py-3 font-medium">Artículo</th>
                <th className="px-4 py-3 text-right font-medium">Cantidad</th>
                <th className="px-4 py-3 font-medium">Recorrido</th>
                <th className="px-4 py-3 font-medium">Cuándo</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-ink/8 divide-y">
              {traslados.map((m) => (
                <tr key={m.id} className="hover:bg-ink/3">
                  <td className="text-ink/70 tabular px-4 py-3 font-mono text-xs">{m.numero}</td>
                  <td className="text-ink/85 px-4 py-3">{m.articulo?.nombre ?? '—'}</td>
                  <td className="tabular text-ink/85 px-4 py-3 text-right">
                    {Number(m.cantidad).toLocaleString('es-VE')} {m.unidad}
                  </td>
                  <td className="text-ink/70 px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      {nombreAlmacen(m.almacen_id)}
                      <ArrowRight className="text-ink/35 size-3.5" />
                      {/* El destino se lee de la nota, que la función escribe
                          con el nombre del almacén: la fila de la salida no lo
                          guarda, y traerlo obligaría a otra consulta por fila. */}
                      <span className="text-ink/85">
                        {m.nota?.replace(/^Traslado a ([^.]+)\..*$/, '$1') ?? '—'}
                      </span>
                    </span>
                  </td>
                  <td className="text-ink/55 px-4 py-3 text-xs">{fechaHora(m.registrado_en)}</td>
                  <td className="px-4 py-3 text-right">
                    {puede('ALMACEN') ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Undo2 className="size-4" />}
                        onClick={() => setDeshaciendo({ id: m.id, numero: m.numero })}
                      >
                        Deshacer
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        titulo="Nuevo traslado"
        descripcion="El costo del material viaja con él. Trasladar no cambia lo que vale."
        acciones={
          <>
            <Button variant="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={enviar} disabled={!listo || transferir.isPending}>
              {transferir.isPending ? 'Trasladando…' : 'Trasladar'}
            </Button>
          </>
        }
      >
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

        {error ? <p className="text-danger mt-3 text-sm">{error}</p> : null}
      </Modal>

      <Modal
        abierto={deshaciendo !== null}
        onCerrar={() => setDeshaciendo(null)}
        titulo={`Deshacer ${deshaciendo?.numero ?? ''}`}
        descripcion="Un traslado son dos movimientos —la salida de un almacén y la entrada en el otro— y se deshacen los dos. El material vuelve donde estaba."
        ancho="sm"
        acciones={
          <>
            <Button variant="ghost" onClick={() => setDeshaciendo(null)}>
              Cancelar
            </Button>
            <Button
              onClick={deshacer}
              disabled={motivoReverso.trim().length < 4 || reversar.isPending}
            >
              {reversar.isPending ? 'Deshaciendo…' : 'Deshacer'}
            </Button>
          </>
        }
      >
        <Textarea
          label="Por qué se deshace"
          rows={2}
          value={motivoReverso}
          onChange={(e) => setMotivoReverso(e.target.value)}
        />
        <p className="text-ink/55 mt-3 text-xs">
          No se borra nada: se escriben dos movimientos nuevos que anulan los anteriores. Si el
          material ya salió del destino, el sistema no dejará deshacerlo.
        </p>
        {error ? <p className="text-danger mt-3 text-sm">{error}</p> : null}
      </Modal>
    </>
  )
}
