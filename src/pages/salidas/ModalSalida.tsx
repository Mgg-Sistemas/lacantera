import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { CantidadDeArticulo } from '@/components/CantidadDeArticulo'
import { DeQuienSale } from '@/components/DeQuienSale'
import { ListaEditable } from '@/components/ListaEditable'
import { conSusFormas, useArticulos, useTodasLasPresentaciones } from '@/lib/api/catalogo'
import { useMisPermisos } from '@/lib/api/usuarios'
import { usePedirSalida } from '@/lib/api/salidas'
import {
  grupoEnCorto,
  useBorrarClaseDeSalida,
  useClasesDeSalida,
  useExistencias,
  useGruposDeSalida,
  useGuardarClaseDeSalida,
  useRegistrarSalidas,
} from '@/lib/api/inventario'
import type { GrupoDeSalida } from '@/lib/api/inventario'
import { cn } from '@/lib/cn'

/*
  SACAR MATERIAL, EN EL MÓDULO QUE LE TOCA

  Christopher, 16/09/2026, mirando el módulo nuevo: «¿dónde puedo realizar una
  salida?». Estaba donde había estado siempre —dentro de Existencias, en un
  modal que compartía estado con la entrada, el conteo y el ajuste—, y mandar a
  la gente a otra pantalla a buscarlo es una respuesta mala.

  Así que el formulario vive aquí, como componente propio y con su estado, y
  Existencias se queda con lo que es suyo: enseñar lo que hay. Es el mismo
  reparto que ya tenían el traslado y su modal.

  EL ORDEN ES QUÉ, LUEGO DE DÓNDE. Quien saca material piensa en lo que
  necesita, no en el almacén. Por eso el artículo va primero y el sitio después,
  filtrado a los que de verdad lo tienen: elegir un sitio y descubrir allí que
  no está es hacer el camino dos veces.
*/

const cantidad = (valor: string | number): string =>
  Number(valor).toLocaleString('es-VE', { maximumFractionDigits: 2 })

interface RenglonEnCurso {
  clave: string
  articulo: string
  /** De qué almacén sale ESTE renglón: el aceite puede estar en otro sitio. */
  almacen: string
  /** El TOTAL, que es lo que mide toda la pantalla. Los bultos van aparte. */
  cantidad: string
  presentaciones?: number | null
  presentacion?: string | null
  sueltas?: string
  /** Solo hace falta cuando en ese sitio ese artículo es de varios dueños. */
  propietario?: string
}

let siguienteClave = 0
const renglonVacio = (articulo = '', almacen = ''): RenglonEnCurso => ({
  clave: String(++siguienteClave),
  articulo,
  almacen,
  cantidad: '',
})

/*
  ¿PARA QUIÉN SALE?

  Christopher, con el molde de MGG delante: «puede ser bien de la empresa o bien
  puede ser a un externo (debe indicar el responsable, empresa o persona)». En
  MGG el destino es un interruptor —almacén o persona— y en una salida el
  almacén no se ofrece, porque mandar material a otro almacén es un traslado.

  Aquí la lista es el organigrama de la empresa, y al final una opción para lo
  que se va fuera; solo entonces se piden los dos datos. Los dos y no uno:
  dentro de un año «FERRETERIA OSMAIRA» sin un nombre detrás no sirve para
  reclamarle nada a nadie.
*/
const FUERA_DE_LA_EMPRESA = '__FUERA__'

function ParaQuienSale({
  grupos,
  grupo,
  onGrupo,
  externo,
  onExterno,
  responsable,
  onResponsable,
}: {
  grupos: GrupoDeSalida[] | undefined
  grupo: string
  onGrupo: (v: string) => void
  externo: string
  onExterno: (v: string) => void
  responsable: string
  onResponsable: (v: string) => void
}) {
  return (
    <div className="mt-4">
      <Select
        label="¿Para quién sale?"
        vacio="Elige a quién"
        hint="El área o el cargo que lo recibe, del organigrama de la empresa."
        value={grupo}
        onChange={(e) => onGrupo(e.target.value)}
        opciones={[
          ...(grupos ?? [])
            .filter((g) => g.activo)
            .map((g) => ({ valor: String(g.id), etiqueta: grupoEnCorto(g) })),
          { valor: FUERA_DE_LA_EMPRESA, etiqueta: 'Alguien de fuera de la empresa' },
        ]}
      />

      {grupo === FUERA_DE_LA_EMPRESA ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input
            label="¿A quién?"
            hint="La empresa o la persona que lo recibe."
            value={externo}
            onChange={(e) => onExterno(e.target.value)}
          />
          <Input
            label="Responsable"
            hint="Quien responde por ello y firma la nota."
            value={responsable}
            onChange={(e) => onResponsable(e.target.value)}
          />
        </div>
      ) : null}
    </div>
  )
}

/*
  Lo que viaja a la base: o el grupo, o los dos datos de fuera. Nunca los dos
  —es justo lo que la base rechaza— y nunca ninguno.
*/
const paraQuienVa = (grupo: string, externo: string, responsable: string) =>
  grupo === FUERA_DE_LA_EMPRESA
    ? { externo: externo.trim(), responsable: responsable.trim() }
    : { grupo_id: Number(grupo) }

export function ModalSalida({
  abierto,
  modo = 'registrar',
  articuloInicial,
  almacenInicial,
  onCerrar,
  onRegistrada,
}: {
  abierto: boolean
  /*
    PEDIR Y ENTREGAR SON EL MISMO FORMULARIO.

    Lo que se pide es lo que se entrega: los mismos renglones, la misma razón y
    el mismo «para quién». Hacer dos pantallas parecidas es la forma segura de
    que dentro de un mes pregunten distinto.

    Cambian tres cosas: quien pide elige UN almacén para todo —aprobar es
    responder por lo que sale de un sitio—, el botón dice otra cosa, y lo que
    devuelve la base es un número de solicitud en vez de uno de nota.
  */
  modo?: 'registrar' | 'pedir'
  /** Cuando se llega desde una fila de existencias, el primer renglón viene puesto. */
  articuloInicial?: string
  almacenInicial?: string
  onCerrar: () => void
  onRegistrada: (numero: string, motivo: string) => void
}) {
  const { puede: alcanza } = useMisPermisos()
  const salidas = useRegistrarSalidas()
  const pedido = usePedirSalida()
  const clases = useClasesDeSalida()
  const todasLasClases = useClasesDeSalida(true)
  const guardarClase = useGuardarClaseDeSalida()
  const borrarClase = useBorrarClaseDeSalida()
  const grupos = useGruposDeSalida()
  const { data: articulos } = useArticulos()
  const { data: formasDeContar } = useTodasLasPresentaciones()

  /*
    Todas las existencias, y solo con el formulario abierto: doscientas filas no
    hacen falta para pintar una pantalla que ya tiene las suyas.
  */
  const todas = useExistencias(undefined, abierto)

  const [renglones, setRenglones] = useState<RenglonEnCurso[]>([])
  /** Solo al pedir: el almacén del que sale todo, que es quien decide quién aprueba. */
  const [almacenPedido, setAlmacenPedido] = useState('')
  const [clase, setClase] = useState('')
  const [grupo, setGrupo] = useState('')
  const [externo, setExterno] = useState('')
  const [responsable, setResponsable] = useState('')
  const [motivo, setMotivo] = useState('')
  const [ordenandoClases, setOrdenandoClases] = useState(false)

  /*
    Cada vez que se abre, empieza limpio. Arrastrar lo de la vez anterior es
    como se registra una salida a nombre de quien no era: el formulario se ve
    lleno y nadie vuelve a leerlo.
  */
  useEffect(() => {
    if (!abierto) return
    setRenglones([renglonVacio(articuloInicial ?? '', almacenInicial ?? '')])
    setAlmacenPedido(almacenInicial ?? '')
    setGrupo('')
    setExterno('')
    setResponsable('')
    setMotivo('')
  }, [abierto, articuloInicial, almacenInicial])

  // Al pedir, el sitio es uno para todos los renglones: el de arriba manda.
  useEffect(() => {
    if (modo !== 'pedir') return
    setRenglones((lista) => lista.map((r) => ({ ...r, almacen: almacenPedido })))
  }, [modo, almacenPedido])

  // La razón se propone sola en cuanto llega la lista, que viene por la red.
  useEffect(() => {
    if (!abierto || clase) return
    setClase((clases.data ?? [])[0]?.codigo ?? '')
  }, [abierto, clase, clases.data])

  const claseElegida = (clases.data ?? []).find((c) => c.codigo === clase)

  /** Lo que hay de un artículo en un sitio, para avisar antes y no después. */
  const hayEn = (almacen: string, articulo: string) =>
    Number(
      (todas.data ?? []).find(
        (e) => String(e.almacen_id) === almacen && String(e.articulo_id) === articulo,
      )?.disponibles ?? 0,
    )

  /*
    EL MISMO MATERIAL DOS VECES SE SUMA. Mirando cada renglón por separado, dos
    de dos galones pasan aunque solo haya tres: cada uno ve el saldo entero. La
    base ya lo para y nombra el renglón, pero enterarse al pulsar Registrar es
    tarde.
  */
  const pedidoHasta = (indice: number, almacen: string, articulo: string) =>
    renglones
      .slice(0, indice)
      .filter((x) => x.almacen === almacen && x.articulo === articulo)
      .reduce((total, x) => total + Number(x.cantidad || 0), 0)

  /*
    El artículo se elige de lo que EXISTE, no del catálogo entero: no se puede
    sacar lo que no hay, y ofrecerlo sería dejar que el error salga al guardar
    en vez de al elegir.
  */
  const articulosConExistencia = useMemo(() => {
    const porArticulo = new Map<
      string,
      { codigo: string; nombre: string; unidad: string; total: number; sitios: number }
    >()
    for (const e of todas.data ?? []) {
      if (Number(e.disponibles) <= 0) continue
      const clave = String(e.articulo_id)
      const ya = porArticulo.get(clave)
      if (ya) {
        ya.total += Number(e.disponibles)
        ya.sitios += 1
      } else {
        porArticulo.set(clave, {
          codigo: e.articulo_codigo,
          nombre: e.articulo,
          unidad: e.unidad,
          total: Number(e.disponibles),
          sitios: 1,
        })
      }
    }
    return [...porArticulo.entries()].map(([valor, v]) => ({
      valor,
      codigo: v.codigo,
      nombre: v.nombre,
      detalle: `${cantidad(v.total)} ${v.unidad} · ${v.sitios === 1 ? 'un sitio' : `${v.sitios} sitios`}`,
    }))
  }, [todas.data])

  /** Los sitios que tienen algo, para elegir uno al pedir. */
  const sitiosConMaterial = useMemo(() => {
    const porSitio = new Map<string, { codigo: string; nombre: string; cuantos: number }>()
    for (const e of todas.data ?? []) {
      if (Number(e.disponibles) <= 0) continue
      const clave = String(e.almacen_id)
      const ya = porSitio.get(clave)
      if (ya) ya.cuantos += 1
      else porSitio.set(clave, { codigo: e.almacen_codigo, nombre: e.almacen, cuantos: 1 })
    }
    return [...porSitio.entries()].map(([valor, v]) => ({
      valor,
      codigo: v.codigo,
      nombre: v.nombre,
      detalle: `${v.cuantos} artículo${v.cuantos === 1 ? '' : 's'}`,
    }))
  }, [todas.data])

  /** Al pedir, el artículo se elige de lo que hay EN ESE SITIO. */
  const articulosDelSitio = useMemo(
    () =>
      (todas.data ?? [])
        .filter((e) => String(e.almacen_id) === almacenPedido && Number(e.disponibles) > 0)
        .map((e) => ({
          valor: String(e.articulo_id),
          codigo: e.articulo_codigo,
          nombre: e.articulo,
          detalle: `hay ${cantidad(e.disponibles)} ${e.unidad}`,
        })),
    [todas.data, almacenPedido],
  )

  /** Los renglones que cuentan: uno a medio escribir no invalida los demás. */
  const buenos = renglones.filter((r) => r.articulo && r.almacen && Number(r.cantidad) > 0)

  const enPie =
    buenos.length > 0 &&
    renglones.every(
      (r, i) =>
        !r.articulo ||
        !r.almacen ||
        Number(r.cantidad || 0) <= 0 ||
        Number(r.cantidad) + pedidoHasta(i, r.almacen, r.articulo) <= hayEn(r.almacen, r.articulo),
    )

  const faltaElDetalle = claseElegida?.exige_detalle === true && motivo.trim().length < 10
  const faltaDecirParaQuien =
    !grupo ||
    (grupo === FUERA_DE_LA_EMPRESA &&
      (externo.trim().length < 3 || responsable.trim().length < 3))

  const pedir = async () => {
    const numero = (await pedido.mutateAsync({
      almacen_id: Number(almacenPedido),
      renglones: buenos.map((r) => ({
        articulo_id: Number(r.articulo),
        cantidad: r.presentaciones ? Number(r.sueltas || 0) : Number(r.cantidad || 0),
        presentaciones: r.presentaciones ?? null,
        presentacion: r.presentacion ?? null,
        propietario: r.propietario || null,
      })),
      motivo,
      tipo: clase,
      ...paraQuienVa(grupo, externo, responsable),
    })) as string

    onRegistrada(numero, motivo)
  }

  const registrar = async () => {
    const numero = (await salidas.mutateAsync({
      almacen_id: null,
      renglones: buenos.map((r) => ({
        almacen_id: Number(r.almacen),
        articulo_id: Number(r.articulo),
        /*
          A la base van las DOS cifras tecleadas y no el total: con bultos,
          `cantidad` son las sueltas y la suma la hace la base, que de paso
          guarda al lado del asiento lo que la persona contó.
        */
        cantidad: r.presentaciones ? Number(r.sueltas || 0) : Number(r.cantidad || 0),
        presentaciones: r.presentaciones ?? null,
        presentacion: r.presentacion ?? null,
        propietario: r.propietario || null,
      })),
      motivo,
      tipo: clase,
      ...paraQuienVa(grupo, externo, responsable),
    })) as string

    onRegistrada(numero, motivo)
  }

  return (
    <>
      {abierto ? (
        <Modal
          abierto
          onCerrar={onCerrar}
          titulo={modo === 'pedir' ? 'Pedir material' : 'Registrar salida directa'}
          descripcion={
            modo === 'pedir'
              ? 'Queda como solicitud y no descuenta nada. La aprueba quien responde por el almacén, y el material sale cuando alguien de almacén la entrega.'
              : 'Descuenta del inventario en este momento, sin solicitud. Todo lo que sale para un mismo trabajo va en un solo papel, y cada renglón dice qué se lleva y de qué sitio.'
          }
          ancho="lg"
          acciones={
            <>
              <Button variant="ghost" onClick={onCerrar}>
                Cancelar
              </Button>
              <Button
                disabled={
                  !enPie ||
                  !clase ||
                  (modo === 'pedir' && !almacenPedido) ||
                  faltaDecirParaQuien ||
                  faltaElDetalle ||
                  motivo.trim().length < 4 ||
                  salidas.isPending ||
                  pedido.isPending
                }
                onClick={() => void (modo === 'pedir' ? pedir() : registrar())}
              >
                {salidas.isPending || pedido.isPending
                  ? 'Guardando…'
                  : modo === 'pedir'
                    ? 'Enviar solicitud'
                    : 'Registrar salida'}
              </Button>
            </>
          }
        >
          {modo === 'pedir' ? (
            <div className="mb-4">
              <SelectBuscable
                label="¿De qué almacén?"
                vacio="Elige el sitio"
                valor={almacenPedido}
                onCambio={(v) => setAlmacenPedido(v)}
                opciones={sitiosConMaterial}
              />
              <p className="text-ink/45 mt-1.5 text-xs">
                Una solicitud es de un sitio: la aprueba quien responde por él. Si hace falta
                material de dos almacenes, son dos solicitudes.
              </p>
            </div>
          ) : null}

          <div className="space-y-3">
            {renglones.map((r, i) => {
              const sitios = (todas.data ?? []).filter(
                (e) => String(e.articulo_id) === r.articulo && Number(e.disponibles) > 0,
              )
              const unidad = sitios[0]?.unidad ?? ''
              /*
                El artículo del catálogo, que es quien sabe en qué viene.
                `sitios` sale de las existencias y trae la unidad, pero no la
                presentación: para eso hay que ir al catálogo.
              */
              const artSale = conSusFormas(
                (articulos ?? []).find((a) => String(a.id) === r.articulo),
                formasDeContar,
              )
              const disponible = hayEn(r.almacen, r.articulo) - pedidoHasta(i, r.almacen, r.articulo)
              const pasado = Boolean(r.articulo && r.almacen && Number(r.cantidad) > disponible)
              const sitioElegido = sitios.find((e) => String(e.almacen_id) === r.almacen)

              return (
                <div key={r.clave} className="border-hairline rounded-card border border-dashed p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-ink/40 text-2xs font-mono tracking-[0.16em] uppercase">
                      Renglón {i + 1}
                    </span>
                    {renglones.length > 1 ? (
                      <button
                        type="button"
                        className="text-ink/40 hover:text-danger text-xs underline underline-offset-2"
                        onClick={() => setRenglones((v) => v.filter((x) => x.clave !== r.clave))}
                      >
                        Quitar
                      </button>
                    ) : null}
                  </div>

                  <SelectBuscable
                    label="Qué sale"
                    vacio="Busca el material"
                    valor={r.articulo}
                    onCambio={(v) => {
                      /*
                        Al cambiar de artículo, el sitio elegido puede dejar de
                        tenerlo. Se conserva si lo tiene, y si solo hay un sitio
                        con existencia se pone solo — es la única respuesta
                        posible. Con varios se limpia: elegir por él uno de tres
                        sería decidir de qué almacén sale el costo.
                      */
                      const conEse = (todas.data ?? []).filter(
                        (e) => String(e.articulo_id) === v && Number(e.disponibles) > 0,
                      )
                      const sigueValiendo = conEse.some((e) => String(e.almacen_id) === r.almacen)
                      setRenglones((lista) =>
                        lista.map((x) =>
                          x.clave === r.clave
                            ? {
                                ...x,
                                articulo: v,
                                // La unidad cambia con el artículo, así que la
                                // cantidad vieja y sus bultos dejan de
                                // significar nada.
                                cantidad: '',
                                presentaciones: null,
                                presentacion: null,
                                sueltas: '',
                                propietario: undefined,
                                almacen: sigueValiendo
                                  ? x.almacen
                                  : conEse.length === 1
                                    ? String(conEse[0].almacen_id)
                                    : '',
                              }
                            : x,
                        ),
                      )
                    }}
                    opciones={modo === 'pedir' ? articulosDelSitio : articulosConExistencia}
                  />

                  <div
                    className={cn(
                      'mt-3 grid gap-3',
                      modo === 'registrar' && 'sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]',
                    )}
                  >
                    {/* Al pedir, el sitio se eligió arriba y es uno para todo:
                        repetirlo en cada renglón sería invitar a contradecirlo. */}
                    {modo === 'registrar' ? (
                      <SelectBuscable
                        label="De dónde sale"
                        vacio={r.articulo ? 'Elige el sitio' : 'Elige antes el material'}
                        valor={r.almacen}
                        onCambio={(v) =>
                          setRenglones((lista) =>
                            lista.map((x) =>
                              x.clave === r.clave ? { ...x, almacen: v, propietario: undefined } : x,
                            ),
                          )
                        }
                        // Solo los sitios que tienen ese material, con lo que hay
                        // en cada uno: es la información que decide.
                        opciones={sitios.map((e) => ({
                          valor: String(e.almacen_id),
                          codigo: e.almacen_codigo,
                          nombre: e.almacen,
                          detalle: `hay ${cantidad(e.disponibles)} ${e.unidad}`,
                        }))}
                      />
                    ) : null}

                    {/*
                      LA SALIDA TAMBIÉN SE CUENTA EN BULTOS. Quien mete «3
                      tambores» en la entrada y ve «= 624 L» aprende que el
                      sistema entiende tambores, y al sacar teclea «1» pensando
                      en un tambor. Lo levantó Christopher el 7/09/2026.
                    */}
                    <CantidadDeArticulo
                      key={`cantidad-${r.articulo}`}
                      valor={r.cantidad}
                      onCambiar={(v, cap) =>
                        setRenglones((lista) =>
                          lista.map((x) =>
                            x.clave === r.clave
                              ? {
                                  ...x,
                                  cantidad: v,
                                  presentaciones: cap.presentaciones,
                                  presentacion: cap.unidad,
                                  sueltas: String(cap.sueltas ?? ''),
                                }
                              : x,
                          ),
                        )
                      }
                      articulo={artSale}
                      hintSinArticulo="Elige antes de dónde sale"
                      hint={
                        r.almacen
                          ? pedidoHasta(i, r.almacen, r.articulo) > 0
                            ? `Quedan ${cantidad(disponible)} ${unidad} tras los renglones de arriba`
                            : `Hay ${cantidad(disponible)} ${unidad}`
                          : 'Elige antes de dónde sale'
                      }
                    />
                  </div>

                  {/*
                    DE QUIÉN SALE. Solo aparece cuando en ese sitio ese artículo
                    es de varios dueños: decide a nombre de quién se descuenta.
                    Sacar material de la gobernación cargándolo a la cuenta de
                    la cantera sería regalarle una pérdida al que no la tuvo.
                  */}
                  {sitioElegido?.duenos ? (
                    <div className="mt-3">
                      <DeQuienSale
                        duenos={sitioElegido.duenos}
                        valor={r.propietario ?? ''}
                        onCambio={(v) =>
                          setRenglones((lista) =>
                            lista.map((x) => (x.clave === r.clave ? { ...x, propietario: v } : x)),
                          )
                        }
                        label="¿De quién sale?"
                      />
                    </div>
                  ) : null}

                  {pasado ? (
                    <p className="text-danger mt-2 text-xs">
                      {pedidoHasta(i, r.almacen, r.articulo) > 0
                        ? `Ya lo pediste más arriba: ahí solo quedan ${cantidad(disponible)} ${unidad}.`
                        : `Ahí solo quedan ${cantidad(disponible)} ${unidad}.`}
                    </p>
                  ) : null}
                </div>
              )
            })}
          </div>

          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            icon={<Plus />}
            onClick={() =>
              setRenglones((v) => [...v, renglonVacio('', modo === 'pedir' ? almacenPedido : '')])
            }
          >
            Añadir otro material
          </Button>

          <div className="mt-4">
            <Select
              /* Decía «¿De qué clase?». Christopher: «falta aclarar un poco,
                 ¿clase de salida? ¿de qué clase... salida?». Era un rótulo
                 escrito por quien ya sabía la respuesta. */
              label="¿Por qué sale?"
              value={clase}
              onChange={(e) => setClase(e.target.value)}
              hint={claseElegida?.pista ?? undefined}
              opciones={(clases.data ?? []).map((c) => ({ valor: c.codigo, etiqueta: c.nombre }))}
            />

            <ParaQuienSale
              grupos={grupos.data}
              grupo={grupo}
              onGrupo={setGrupo}
              externo={externo}
              onExterno={setExterno}
              responsable={responsable}
              onResponsable={setResponsable}
            />

            {/* ESCRITURA y no TOTAL: con TOTAL el botón solo lo veían las cuatro
                cuentas de administrador, y la lista se hizo editable justamente
                para que no nos llamaran por ella. */}
            {alcanza('SALIDAS', 'ESCRITURA') ? (
              <button
                type="button"
                className="text-ink/45 hover:text-ink/75 mt-2 text-xs underline underline-offset-2"
                onClick={() => setOrdenandoClases(true)}
              >
                ¿Falta una razón? Editar la lista
              </button>
            ) : null}
          </div>

          <Textarea
            label={
              /* «Para qué sale» no encaja con una merma: nada se derrama para
                 algo. Cada razón pregunta lo que de verdad se responde. */
              claseElegida?.tipo === 'SALIDA_CONSUMO' && !claseElegida?.exige_detalle
                ? 'Para qué sale'
                : 'Qué pasó'
            }
            className="mt-4"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            hint="Queda en el libro y no se puede editar después."
          />

          {salidas.error ? <ErrorDeCarga error={salidas.error} className="mt-3" /> : null}
        </Modal>
      ) : null}

      {ordenandoClases ? (
        <Modal
          abierto
          onCerrar={() => setOrdenandoClases(false)}
          titulo="Por qué puede salir un material"
          descripcion="La lista que aparece al sacar material. Cada razón ya sabe si es consumo o merma: eso no se cambia desde aquí, porque movería de sitio salidas ya registradas."
          ancho="sm"
          acciones={<Button onClick={() => setOrdenandoClases(false)}>Listo</Button>}
        >
          <ListaEditable
            elementos={(todasLasClases.data ?? []).map((c) => ({
              codigo: c.codigo,
              nombre: c.nombre,
              pista: c.pista,
              activo: c.activa,
            }))}
            onGuardar={(e) =>
              guardarClase.mutateAsync({ codigo: e.codigo, nombre: e.nombre, activa: e.activo })
            }
            onBorrar={(codigo) => borrarClase.mutateAsync(codigo)}
            onAnadir={(nombre) => guardarClase.mutateAsync({ nombre })}
            error={guardarClase.error ?? borrarClase.error}
            guardando={guardarClase.isPending || borrarClase.isPending}
            etiquetaAnadir="Añadir una razón"
            placeholderNuevo="Se prestó a otra obra"
            nota="Una razón que ya se usó no se borra: se apaga. Si se borrara, las salidas de hace tres meses se quedarían sin poder decir por qué se hicieron."
          />
        </Modal>
      ) : null}
    </>
  )
}
