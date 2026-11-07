import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ChipTasa } from '@/components/ChipTasa'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useMiFirma } from '@/lib/api/firmas'
import { usePerfiles, useUnidades } from '@/lib/api/catalogo'
import { useActualizarPedido, useCompra, useCrearPedido, usePuedePedirPorOtro } from '@/lib/api/compras'
import type { Compra } from '@/lib/api/compras'
import { Cargando, ErrorDeCarga as ErrorDeCargaPagina } from '@/components/ui/Estado'
import { useSesion } from '@/lib/sesion'
import { useMisPermisos } from '@/lib/api/usuarios'
import { PedidoEnviado } from '@/pages/compras/PedidoEnviado'

/**
 * Valor del selector para quien pide y no tiene usuario.
 *
 * En la cantera la mayoría de quienes necesitan algo no tienen computadora ni
 * cuenta: el mecánico pide por radio y alguien en la oficina carga el pedido.
 * Sin esta opción, el sistema anotaría al de la oficina y perdería a la única
 * persona a la que hay que preguntarle si llega otra cosa.
 */
const OTRA_PERSONA = 'OTRA'

/*
  EL PEDIDO SE HACE CON PALABRAS GENERALES.

  Angélica, 06/11/2026: «el pedido será con palabras generales, ejemplo:
  Botas, y la cantidad». Quien pide no tiene por qué saber cómo se llama la
  cosa en el inventario. Eso lo resuelve Compras al cotizar: lo guarda con ese
  nombre o le pone el nombre real (`vincular_renglon_al_inventario`).
*/
interface FilaRenglon {
  clave: number
  descripcion: string
  cantidad: string
  unidad: string
  observacion: string
  /* Solo al corregir un renglón que Compras ya nombró; no se edita aquí. */
  articulo_id: string
  descripcion_pedida: string
}

let contador = 0
const filaVacia = (): FilaRenglon => ({
  clave: contador++,
  descripcion: '',
  cantidad: '',
  unidad: 'UND',
  observacion: '',
  articulo_id: '',
  descripcion_pedida: '',
})


/*
  EL MISMO FORMULARIO CREA Y CORRIGE.

  Lo pidió Jesmary: equivocarse en un pedido ya enviado obligaba a cancelarlo
  entero y volver a teclear los siete renglones, y el pedido perdía su número.

  No se hace una pantalla gemela porque piden exactamente los mismos datos, y
  dos pantallas iguales se separan a la primera semana — una gana un campo y la
  otra no. Lo único que cambia es de dónde salen los valores iniciales y a qué
  función se llama al guardar.

  La base permite corregir hasta CONFIRMADA y se niega en seco si ya hay
  cotizaciones cargadas: los renglones de una cotización cuelgan de los del
  pedido con borrado en cascada, y guardar aquí los rehace. Esta pantalla ni
  siquiera se ofrece en ese caso, pero el control que vale es el de allá.
*/
export function CorregirPedido() {
  const { id } = useParams()
  const { data: compra, isPending, error } = useCompra(Number(id))

  if (isPending) return <Cargando texto="Cargando el pedido…" />
  if (error) return <ErrorDeCargaPagina error={error} />
  if (!compra) return <ErrorDeCargaPagina error={new Error('Ese pedido no existe.')} />

  /*
    `key` para que el formulario se rearme al cambiar de pedido.

    Sin ella, los `useState` de dentro conservarían los valores del pedido
    anterior al navegar de uno a otro: se editaría el pedido nuevo con los
    renglones del viejo delante.
  */
  return <Formulario key={compra.id} pedido={compra} />
}

export function NuevoPedido() {
  // Cambia al pedir otra: el formulario se rearma vacío.
  const [vuelta, setVuelta] = useState(0)
  return <Formulario key={vuelta} pedido={null} onOtra={() => setVuelta((v) => v + 1)} />
}

function Formulario({ pedido, onOtra }: { pedido: Compra | null; onOtra?: () => void }) {
  const corrigiendo = !!pedido
  const navigate = useNavigate()
  /*
    Pedir lo puede cualquiera; el tablero y el detalle, solo quien lleva
    compras. A quien solo pide no se le manda a pantallas que no le abren.
  */
  const { puede: puedeModulo } = useMisPermisos()
  const llevaCompras = puedeModulo('COMPRAS', 'LECTURA')
  const [enviado, setEnviado] = useState<number | null>(null)
  const { data: unidades } = useUnidades()
  const { data: perfiles } = usePerfiles()
  const { session } = useSesion()
  const crear = useCrearPedido()
  const actualizar = useActualizarPedido()

  const yo = session?.user.id ?? ''
  const [quienPide, setQuienPide] = useState(
    pedido?.solicitante_id ?? (pedido?.solicitante_nombre ? OTRA_PERSONA : ''),
  )
  const [otroNombre, setOtroNombre] = useState(pedido?.solicitante_nombre ?? '')
  const [otroCargo, setOtroCargo] = useState(pedido?.solicitante_cargo ?? '')
  /*
    LA FIRMA EN «SOLICITADO POR», SOLO DE QUIEN PIDE.

    Se ofrece a quien carga su propio pedido y tiene una firma encendida, sin
    marcar: quien pide no autoriza nada. A quien carga el pedido de otro no se
    le ofrece, porque no puede poner la firma de ese otro.
  */
  const { data: miFirma } = useMiFirma()
  const [conMiFirma, setConMiFirma] = useState(pedido?.firma_de_quien_pide === true)

  const [titulo, setTitulo] = useState(pedido?.titulo ?? '')
  const [justificacion, setJustificacion] = useState(pedido?.justificacion ?? '')
  const [prioridad, setPrioridad] = useState<string>(pedido?.prioridad ?? 'NORMAL')
  const [requeridaPara, setRequeridaPara] = useState(pedido?.requerida_para ?? '')
  const [filas, setFilas] = useState<FilaRenglon[]>(() =>
    pedido && pedido.renglones.length > 0
      ? pedido.renglones.map((r) => ({
          ...filaVacia(),
          articulo_id: r.articulo_id != null ? String(r.articulo_id) : '',
          descripcion_pedida: r.descripcion_pedida ?? '',
          descripcion: r.descripcion,
          cantidad: String(r.cantidad),
          unidad: r.unidad,
          observacion: r.observacion ?? '',
        }))
      : [filaVacia()],
  )

  // Mientras la lista de perfiles carga, el selector todavía no tiene opciones;
  // el valor por defecto es uno mismo, que es el caso más común.
  /*
    Quien no lleva compras (ni almacén, operaciones o nómina) pide a su nombre:
    la base no le deja poner a otro, así que la pantalla no se lo ofrece.
  */
  const { data: porOtro } = usePuedePedirPorOtro()
  const aSuNombre = porOtro === false
  const seleccion = aSuNombre ? yo : quienPide || yo
  const ofrecerFirma = miFirma?.usar === true && seleccion === yo

  const cambiar = (clave: number, cambios: Partial<FilaRenglon>) =>
    setFilas((f) => f.map((fila) => (fila.clave === clave ? { ...fila, ...cambios } : fila)))

  /*
    LO QUE FALTA SE DICE ANTES DE ENVIAR.

    Antes, un renglón sin cantidad se descartaba callado; si no quedaba
    ninguno, la base contestaba «El pedido necesita al menos un renglón» con el
    renglón escrito a la vista. Ahora solo se ignoran los recuadros vacíos del
    todo, y al que está a medias se le dice qué le falta.
  */
  const [aviso, setAviso] = useState<string | null>(null)

  const faltaAlgo = (): string | null => {
    const escritos = filas
      .map((f, i) => ({ f, n: i + 1 }))
      .filter(({ f }) => f.descripcion.trim() || f.cantidad.trim() || f.observacion.trim())

    if (escritos.length === 0) return 'Escriba qué se necesita y cuánto.'

    for (const { f, n } of escritos) {
      if (f.descripcion.trim().length < 2) return `Al renglón ${n} le falta decir qué se necesita.`
      const cantidad = Number(f.cantidad)
      if (!f.cantidad.trim() || !Number.isFinite(cantidad) || cantidad <= 0) {
        return `Al renglón ${n} («${f.descripcion.trim()}») le falta la cantidad.`
      }
    }
    return null
  }

  const enviar = async (enviarAhora: boolean) => {
    const falta = faltaAlgo()
    setAviso(falta)
    if (falta) return

    const renglones = filas
      .filter((f) => f.descripcion.trim() && Number(f.cantidad) > 0)
      .map((f) => ({
        articulo_id: f.articulo_id ? Number(f.articulo_id) : null,
        descripcion: f.descripcion.trim(),
        cantidad: Number(f.cantidad),
        unidad: f.unidad,
        observacion: f.observacion.trim() || null,
        descripcion_pedida: f.descripcion_pedida || null,
      }))

    const otra = seleccion === OTRA_PERSONA

    const comun = {
      titulo,
      justificacion,
      renglones,
      prioridad,
      requerida_para: requeridaPara || null,
      // Todo llega al almacén general; la base lo pone sola.
      destino: null,
      destino_almacen_id: null,
      solicitante_id: otra ? null : seleccion,
      solicitante_nombre: otra ? otroNombre : null,
      solicitante_cargo: otra ? otroCargo : null,
    }

    if (pedido) {
      await actualizar.mutateAsync({
        id: pedido.id,
        ...comun,
        con_firma: ofrecerFirma ? conMiFirma : null,
      })
      void navigate(`/app/compras/${pedido.id}`)
      return
    }

    const id = await crear.mutateAsync({
      ...comun,
      enviar: enviarAhora,
      con_firma: ofrecerFirma && conMiFirma,
    })
    if (!llevaCompras) {
      setEnviado(id)
      return
    }
    // Enviado, sale su WhatsApp para el almacén general (como en MGG).
    void navigate(`/app/compras/${id}${enviarAhora ? '?avisar=pedido' : ''}`)
  }

  if (enviado !== null) {
    return (
      <>
        <PageHeader title="Solicitud de pedido" />
        <PedidoEnviado id={enviado} onOtra={() => onOtra?.()} />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={corrigiendo ? `Corregir ${pedido.numero}` : 'Nuevo pedido'}
        description={
          corrigiendo
            ? 'La corrección se hace sobre el mismo pedido: conserva su número y su lugar en el historial.'
            : 'El pedido va primero al almacén general, que dice si lo tiene. Lo que falte pasa a Compras.'
        }
        actions={
          <>
            {/* Con qué se va a valorar lo que se pida. A un pedido todavía no
                se le ponen precios, así que lo que hay que saber antes de
                empezar es si la tasa del día está cargada, no cuánto suma. */}
            <ChipTasa className="self-center" />
            {corrigiendo || llevaCompras ? (
              <Link to={corrigiendo ? `/app/compras/${pedido.id}` : '/app/compras'}>
                <Button variant="outline" icon={<ArrowLeft />}>
                  {corrigiendo ? 'Volver al pedido' : 'Volver al tablero'}
                </Button>
              </Link>
            ) : null}
          </>
        }
      />

      {/*
        UNA SOLA COLUMNA, Y NO DOS

        Estaba en rejilla de tres: los renglones a la izquierda ocupando dos
        tercios y los datos del pedido a la derecha. Con un solo renglón la
        columna izquierda medía un tercio de lo que medía la derecha, y quedaba
        un vacío alto y sin sentido en medio de la pantalla.

        Dos columnas solo funcionan cuando los dos lados crecen parecido. Aquí
        uno crece con cada renglón que se agrega y el otro es fijo, así que no
        pueden emparejarse nunca. En columna, y con un ancho de lectura, el
        formulario se recorre de arriba abajo sin huecos.
      */}
      <div className="max-w-3xl">
        <Card className="space-y-5">
        <div>
          <h3 className="text-ink/85 text-sm font-semibold">Datos del pedido</h3>


          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Input
              label="Título"
              placeholder="Repuestos para la trituradora primaria"
              hint="Es lo que se lee en la tarjeta del tablero."
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              required
            />

            <div className="sm:col-span-2">
            <Textarea
              label="Motivo de compra (opcional)"
              placeholder="La muela está gastada y el material sale fuera de medida."
              hint="No hace falta: cada renglón ya lleva su observación."
              rows={3}
              value={justificacion}
              onChange={(e) => setJustificacion(e.target.value)}
            />
            </div>

            {/* El cargo va en la tercera línea y no pegado al nombre: así se
                busca por «tesoreria» y sale quien la lleva, sin que el
                renglón se parta en dos cuando el cargo es largo. */}
            {aSuNombre ? (
              <div>
                <span className="text-ink/70 mb-1.5 block text-sm font-medium">Solicitante</span>
                <p className="text-ink/85 text-sm">
                  {(perfiles ?? []).find((p) => p.id === yo)?.nombre ?? 'Usted'} (yo)
                </p>
              </div>
            ) : (
            <SelectBuscable
              label="Solicitante"
              hint="Si a quien lo necesita le falta algo, se le pregunta a esta persona."
              valor={seleccion}
              onCambio={setQuienPide}
              opciones={[
                ...(perfiles ?? [])
                  .filter((p) => p.activo)
                  .map((p) => ({
                    valor: p.id,
                    nombre: p.id === yo ? `${p.nombre} (yo)` : p.nombre,
                    detalle: p.cargo ?? undefined,
                  })),
                { valor: OTRA_PERSONA, nombre: 'Otra persona — no tiene usuario' },
              ]}
            />
            )}

            {seleccion === OTRA_PERSONA ? (
              <div className="border-hairline rounded-card space-y-4 border border-dashed p-3">
                <Input
                  label="Nombre del solicitante"
                  placeholder="José Rondón"
                  value={otroNombre}
                  onChange={(e) => setOtroNombre(e.target.value)}
                  required
                />
                <Input
                  label="Cargo o frente"
                  placeholder="Mecánico · frente 3"
                  value={otroCargo}
                  onChange={(e) => setOtroCargo(e.target.value)}
                />
              </div>
            ) : null}

            {ofrecerFirma ? (
              <label className="border-hairline flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm">
                <input
                  type="checkbox"
                  className="accent-royal-600 mt-0.5 size-4 shrink-0"
                  checked={conMiFirma}
                  onChange={(e) => setConMiFirma(e.target.checked)}
                />
                <span className="text-ink/80">
                  Poner mi firma digital en «Solicitado por»
                  <span className="text-ink/50 mt-0.5 block text-xs">
                    Sin marcar, la raya de la orden de compra sale en blanco con su nombre debajo.
                  </span>
                </span>
              </label>
            ) : null}

            <Select
              label="Prioridad"
              value={prioridad}
              onChange={(e) => setPrioridad(e.target.value)}
              opciones={[
                { valor: 'NORMAL', etiqueta: 'Normal' },
                { valor: 'ALTA', etiqueta: 'Alta' },
                { valor: 'URGENTE', etiqueta: 'Urgente — para la planta' },
              ]}
            />

            <Input
              label="Fecha requerida"
              type="date"
              value={requeridaPara}
              onChange={(e) => setRequeridaPara(e.target.value)}
            />

            {/*
              SIN DESTINO QUE ELEGIR.

              Angélica, 06/11/2026: «todo llega al general y del general se
              harán traslados a los almacenes que corresponda». La base lo
              pone sola (`trg_el_pedido_llega_al_general`).
            */}
            <div className="border-hairline bg-canvas rounded-card text-ink/70 border p-3 text-sm sm:col-span-2">
              <span className="text-ink/85 font-medium">Llega al almacén general (ALM-GEN).</span>{' '}
              De ahí se traslada al almacén o al frente que lo necesite.
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-ink/85 text-sm font-semibold">Qué se necesita</h3>
          <p className="text-ink/50 mt-0.5 mb-3 text-xs">Un renglón por cosa distinta.</p>

          <div className="space-y-3">
              {filas.map((fila, indice) => (
                <div
                  key={fila.clave}
                  className="border-hairline rounded-card grid gap-3 border p-3 sm:grid-cols-12"
                >
                  <div className="sm:col-span-6">
                    <Input
                      label={`Renglón ${indice + 1} · qué se necesita`}
                      placeholder="Botas"
                      hint="Con palabras generales. Compras le pone el nombre del inventario al cotizar."
                      value={fila.descripcion}
                      onChange={(e) =>
                        // Si Compras ya lo había nombrado y aquí se cambia, lo que se
                        // pide es otra cosa: se vuelve a nombrar al cotizar.
                        cambiar(fila.clave, {
                          descripcion: e.target.value,
                          articulo_id: '',
                          descripcion_pedida: '',
                        })
                      }
                      required
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <Input
                      label="Cantidad"
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={fila.cantidad}
                      onChange={(e) => cambiar(fila.clave, { cantidad: e.target.value })}
                      required
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <Select
                      label="Unidad"
                      value={fila.unidad}
                      onChange={(e) => cambiar(fila.clave, { unidad: e.target.value })}
                      opciones={(unidades ?? []).map((u) => ({ valor: u.codigo, etiqueta: u.nombre }))}
                    />
                  </div>

                  <div className="sm:col-span-10">
                    <Input
                      label="Observación"
                      placeholder="Talla, marca, medida, para qué es"
                      value={fila.observacion}
                      onChange={(e) => cambiar(fila.clave, { observacion: e.target.value })}
                    />
                  </div>

                  <div className="flex items-end sm:col-span-2">
                    <Button
                      variant="ghost"
                      icon={<Trash2 />}
                      disabled={filas.length === 1}
                      onClick={() =>
                        setFilas((f) => f.filter((x) => x.clave !== fila.clave))
                      }
                      className="text-danger hover:bg-danger/10 w-full"
                    >
                      Quitar
                    </Button>
                  </div>
                </div>
              ))}

              <Button
                variant="soft"
                icon={<Plus />}
                onClick={() => setFilas((f) => [...f, filaVacia()])}
              >
                Agregar renglón
              </Button>
          </div>
        </div>

          {aviso ? (
            <ErrorDeCarga error={new Error(aviso)} />
          ) : crear.error ? (
            <ErrorDeCarga error={crear.error} />
          ) : actualizar.error ? (
            <ErrorDeCarga error={actualizar.error} />
          ) : null}
        </Card>

        {/* Los botones fuera de la tarjeta: cierran la pantalla, no la
            sección. */}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {/* El borrador se retoma desde el tablero, que es de quien lleva compras. */}
          {llevaCompras ? (
            <Button variant="outline" disabled={crear.isPending || actualizar.isPending} onClick={() => void enviar(false)}>
              Guardar borrador
            </Button>
          ) : null}
          <Button size="lg" disabled={crear.isPending || actualizar.isPending} onClick={() => void enviar(true)}>
            {crear.isPending ? 'Enviando…' : 'Enviar el pedido'}
          </Button>
        </div>
      </div>
    </>
  )
}
