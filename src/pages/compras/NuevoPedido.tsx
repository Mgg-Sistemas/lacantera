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
import {
  CATEGORIAS_ARTICULO,
  useArticulos,
  useCrearArticulo,
  usePerfiles,
  useUnidades,
} from '@/lib/api/catalogo'
import { useAlmacenes } from '@/lib/api/inventario'
import { useActualizarPedido, useCompra, useCrearPedido } from '@/lib/api/compras'
import type { Compra } from '@/lib/api/compras'
import { Cargando, ErrorDeCarga as ErrorDeCargaPagina } from '@/components/ui/Estado'
import { useSesion } from '@/lib/sesion'

/**
 * Valor del selector para quien pide y no tiene usuario.
 *
 * En la cantera la mayoría de quienes necesitan algo no tienen computadora ni
 * cuenta: el mecánico pide por radio y alguien en la oficina carga el pedido.
 * Sin esta opción, el sistema anotaría al de la oficina y perdería a la única
 * persona a la que hay que preguntarle si llega otra cosa.
 */
const OTRA_PERSONA = 'OTRA'

interface FilaRenglon {
  clave: number
  articulo_id: string
  descripcion: string
  cantidad: string
  unidad: string
  observacion: string
  /* Solo mientras se crea el artículo desde aquí; no viajan al pedido. */
  nuevo_codigo: string
  nueva_categoria: string
}

let contador = 0
const filaVacia = (): FilaRenglon => ({
  clave: contador++,
  articulo_id: '',
  descripcion: '',
  cantidad: '',
  unidad: 'UND',
  observacion: '',
  nuevo_codigo: '',
  nueva_categoria: '',
})

const OTRO_SITIO = 'OTRO'

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
  return <Formulario pedido={null} />
}

function Formulario({ pedido }: { pedido: Compra | null }) {
  const corrigiendo = !!pedido
  const navigate = useNavigate()
  const { data: articulos } = useArticulos()
  const { data: almacenes } = useAlmacenes()
  const crearArticulo = useCrearArticulo()
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

  const [titulo, setTitulo] = useState(pedido?.titulo ?? '')
  const [justificacion, setJustificacion] = useState(pedido?.justificacion ?? '')
  const [prioridad, setPrioridad] = useState<string>(pedido?.prioridad ?? 'NORMAL')
  const [requeridaPara, setRequeridaPara] = useState(pedido?.requerida_para ?? '')
  // OTRO_SITIO es la única opción del desplegable que no es un almacén: es la
  // puerta para lo que el inventario no conoce —un frente, la planta, una
  // máquina— sin volver al texto libre para todo lo demás.
  const [sitio, setSitio] = useState(
    pedido?.destino_almacen_id != null
      ? String(pedido.destino_almacen_id)
      : pedido?.destino
        ? OTRO_SITIO
        : '',
  )
  const [destino, setDestino] = useState(
    pedido && pedido.destino_almacen_id == null ? (pedido.destino ?? '') : '',
  )
  const [filas, setFilas] = useState<FilaRenglon[]>(() =>
    pedido && pedido.renglones.length > 0
      ? pedido.renglones.map((r) => ({
          ...filaVacia(),
          articulo_id: r.articulo_id != null ? String(r.articulo_id) : '',
          descripcion: r.descripcion,
          cantidad: String(r.cantidad),
          unidad: r.unidad,
          observacion: r.observacion ?? '',
        }))
      : [filaVacia()],
  )

  // Mientras la lista de perfiles carga, el selector todavía no tiene opciones;
  // el valor por defecto es uno mismo, que es el caso más común.
  const seleccion = quienPide || yo

  const cambiar = (clave: number, cambios: Partial<FilaRenglon>) =>
    setFilas((f) => f.map((fila) => (fila.clave === clave ? { ...fila, ...cambios } : fila)))

  // Elegir un artículo del catálogo rellena descripción y unidad: lo que se
  // pide es lo que el catálogo dice que es, no lo que cada quien escriba.
  const elegirArticulo = (clave: number, id: string) => {
    const articulo = articulos?.find((a) => String(a.id) === id)
    cambiar(clave, {
      articulo_id: id,
      descripcion: articulo ? articulo.nombre : '',
      unidad: articulo ? articulo.unidad : 'UND',
    })
  }

  const enviar = async (enviarAhora: boolean) => {
    const renglones = filas
      .filter((f) => f.descripcion.trim() && Number(f.cantidad) > 0)
      .map((f) => ({
        articulo_id: f.articulo_id ? Number(f.articulo_id) : null,
        descripcion: f.descripcion.trim(),
        cantidad: Number(f.cantidad),
        unidad: f.unidad,
        observacion: f.observacion.trim() || null,
      }))

    const otra = seleccion === OTRA_PERSONA

    const comun = {
      titulo,
      justificacion,
      renglones,
      prioridad,
      requerida_para: requeridaPara || null,
      destino: sitio === OTRO_SITIO ? destino || null : null,
      destino_almacen_id: sitio && sitio !== OTRO_SITIO ? Number(sitio) : null,
      solicitante_id: otra ? null : seleccion,
      solicitante_nombre: otra ? otroNombre : null,
      solicitante_cargo: otra ? otroCargo : null,
    }

    if (pedido) {
      await actualizar.mutateAsync({ id: pedido.id, ...comun })
      void navigate(`/app/compras/${pedido.id}`)
      return
    }

    const id = await crear.mutateAsync({ ...comun, enviar: enviarAhora })
    void navigate(`/app/compras/${id}`)
  }

  return (
    <>
      <PageHeader
        title={corrigiendo ? `Corregir ${pedido.numero}` : 'Nuevo pedido'}
        description={
          corrigiendo
            ? 'Se corrige sobre el mismo pedido: conserva su número y su sitio en el historial.'
            : 'Lo que pidas aquí entra al tablero en la columna Pedido.'
        }
        actions={
          <>
            {/* Con qué se va a valorar lo que se pida. A un pedido todavía no
                se le ponen precios, así que lo que hay que saber antes de
                empezar es si la tasa del día está cargada, no cuánto suma. */}
            <ChipTasa className="self-center" />
            <Link to={corrigiendo ? `/app/compras/${pedido.id}` : '/app/compras'}>
              <Button variant="outline" icon={<ArrowLeft />}>
                {corrigiendo ? 'Volver al pedido' : 'Volver al tablero'}
              </Button>
            </Link>
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
              label="Para qué es"
              placeholder="La muela está gastada y el material sale fuera de medida."
              hint="Quien aprueba no está en el frente."
              rows={4}
              value={justificacion}
              onChange={(e) => setJustificacion(e.target.value)}
              required
            />
            </div>

            {/* El cargo va en la tercera línea y no pegado al nombre: así se
                busca por «tesoreria» y sale quien la lleva, sin que el
                renglón se parta en dos cuando el cargo es largo. */}
            <SelectBuscable
              label="Quién lo solicita"
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

            {seleccion === OTRA_PERSONA ? (
              <div className="border-hairline rounded-card space-y-4 border border-dashed p-3">
                <Input
                  label="Nombre de quien solicita"
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
              label="Se necesita para"
              type="date"
              value={requeridaPara}
              onChange={(e) => setRequeridaPara(e.target.value)}
            />

            <Select
              label="Destino"
              vacio="Sin definir"
              value={sitio}
              onChange={(e) => {
                setSitio(e.target.value)
                if (e.target.value !== OTRO_SITIO) setDestino('')
              }}
              opciones={[
                ...(almacenes ?? [])
                  // Los que están marcados como «recibe compras». No es un
                  // almacén por defecto —no hay— sino la lista de sitios a los
                  // que se puede pedir que llegue algo.
                  .filter((a) => a.recibe_compras)
                  .map((a) => ({ valor: String(a.id), etiqueta: a.nombre })),
                { valor: OTRO_SITIO, etiqueta: 'Otro — no es un almacén' },
              ]}
              hint="A dónde va lo que se pide. Al recibirlo, entra aquí."
            />

            {sitio === OTRO_SITIO ? (
              <div className="sm:col-span-2">
                <Input
                  label="Cuál es el destino"
                  placeholder="Frente 3, planta de lavado, la 966"
                  value={destino}
                  onChange={(e) => setDestino(e.target.value)}
                />
              </div>
            ) : null}
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
                  <div className="sm:col-span-12">
                    <SelectBuscable
                      label={`Renglón ${indice + 1} · artículo del catálogo`}
                      vacio="No está en el catálogo — lo describo abajo"
                      valor={fila.articulo_id}
                      onCambio={(v) => elegirArticulo(fila.clave, v)}
                      opciones={(articulos ?? []).map((a) => ({
                        valor: String(a.id),
                        codigo: a.codigo,
                        nombre: a.nombre,
                        detalle: `${a.categoria} · ${a.unidad}`,
                      }))}
                    />
                  </div>

                  <div className="sm:col-span-6">
                    <Input
                      label="Descripción"
                      placeholder="Filtro de aire de la 966"
                      value={fila.descripcion}
                      onChange={(e) => cambiar(fila.clave, { descripcion: e.target.value })}
                      required
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <Input
                      label="Cantidad"
                      type="number"
                      min="0"
                      step="0.01"
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
                      opciones={(unidades ?? []).map((u) => ({
                        valor: u.codigo,
                        etiqueta: u.nombre,
                      }))}
                    />
                  </div>

                  {/* CREAR EN EL CATÁLOGO SIN SALIR DE AQUÍ

                      «No está en el catálogo» deja la descripción como texto
                      libre, y a los seis meses conviven «Hoja CARTA A4», «hoja
                      carta a4» y «oja carta A-4»: tres artículos que son el
                      mismo y ninguna forma de sumar lo que se gastó en papel.

                      Se podría exigir que estuviera en el catálogo antes de
                      pedir, pero eso frena la compra por un trámite y la gente
                      acabaría escribiendo cualquier cosa en la descripción para
                      salir del paso. Así que se ofrece crearlo aquí, con lo que
                      ya escribió, sin abandonar el pedido. */}
                  {!fila.articulo_id && fila.descripcion.trim().length >= 3 ? (
                    <div className="border-hairline rounded-card bg-canvas grid gap-3 border border-dashed p-3 sm:col-span-12 sm:grid-cols-12">
                      <p className="text-ink/60 text-xs sm:col-span-12">
                        No está en el catálogo. Si es algo que se va a volver a pedir, créalo
                        ahora y queda con un solo nombre para siempre.
                      </p>

                      <div className="sm:col-span-4">
                        <Input
                          label="Código"
                          placeholder="INS-HOJA-A4"
                          value={fila.nuevo_codigo}
                          onChange={(e) => cambiar(fila.clave, { nuevo_codigo: e.target.value })}
                        />
                      </div>

                      <div className="sm:col-span-5">
                        <Select
                          label="Categoría"
                          vacio="Elige"
                          value={fila.nueva_categoria}
                          onChange={(e) =>
                            cambiar(fila.clave, { nueva_categoria: e.target.value })
                          }
                          opciones={CATEGORIAS_ARTICULO}
                        />
                      </div>

                      <div className="flex items-end sm:col-span-3">
                        <Button
                          variant="outline"
                          className="w-full"
                          disabled={
                            !fila.nuevo_codigo.trim() ||
                            !fila.nueva_categoria ||
                            crearArticulo.isPending
                          }
                          onClick={async () => {
                            const id = await crearArticulo.mutateAsync({
                              codigo: fila.nuevo_codigo.trim(),
                              nombre: fila.descripcion.trim(),
                              categoria: fila.nueva_categoria,
                              unidad: fila.unidad,
                            })
                            cambiar(fila.clave, {
                              articulo_id: String(id),
                              nuevo_codigo: '',
                              nueva_categoria: '',
                            })
                          }}
                        >
                          {crearArticulo.isPending ? 'Creando…' : 'Crear y usar'}
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="sm:col-span-10">
                    <Input
                      label="Observación"
                      placeholder="Opcional: marca, medida, número de parte"
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

          {crear.error ? <ErrorDeCarga error={crear.error} /> : null}
        </Card>

        {/* Los botones fuera de la tarjeta: cierran la pantalla, no la
            sección. */}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={crear.isPending} onClick={() => void enviar(false)}>
            Guardar borrador
          </Button>
          <Button size="lg" disabled={crear.isPending} onClick={() => void enviar(true)}>
            {crear.isPending ? 'Enviando…' : 'Enviar el pedido'}
          </Button>
        </div>
      </div>
    </>
  )
}
