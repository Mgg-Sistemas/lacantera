import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ChipTasa } from '@/components/ChipTasa'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useArticulos, usePerfiles, useUnidades } from '@/lib/api/catalogo'
import { useAlmacenes } from '@/lib/api/inventario'
import { useCrearPedido } from '@/lib/api/compras'
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
}

let contador = 0
const filaVacia = (): FilaRenglon => ({
  clave: contador++,
  articulo_id: '',
  descripcion: '',
  cantidad: '',
  unidad: 'UND',
  observacion: '',
})

const OTRO_SITIO = 'OTRO'

export function NuevoPedido() {
  const navigate = useNavigate()
  const { data: articulos } = useArticulos()
  const { data: almacenes } = useAlmacenes()
  const { data: unidades } = useUnidades()
  const { data: perfiles } = usePerfiles()
  const { session } = useSesion()
  const crear = useCrearPedido()

  const yo = session?.user.id ?? ''
  const [quienPide, setQuienPide] = useState('')
  const [otroNombre, setOtroNombre] = useState('')
  const [otroCargo, setOtroCargo] = useState('')

  const [titulo, setTitulo] = useState('')
  const [justificacion, setJustificacion] = useState('')
  const [prioridad, setPrioridad] = useState('NORMAL')
  const [requeridaPara, setRequeridaPara] = useState('')
  // OTRO_SITIO es la única opción del desplegable que no es un almacén: es la
  // puerta para lo que el inventario no conoce —un frente, la planta, una
  // máquina— sin volver al texto libre para todo lo demás.
  const [sitio, setSitio] = useState('')
  const [destino, setDestino] = useState('')
  const [filas, setFilas] = useState<FilaRenglon[]>([filaVacia()])

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

    const id = await crear.mutateAsync({
      titulo,
      justificacion,
      renglones,
      prioridad,
      requerida_para: requeridaPara || null,
      destino: sitio === OTRO_SITIO ? destino || null : null,
      destino_almacen_id: sitio && sitio !== OTRO_SITIO ? Number(sitio) : null,
      enviar: enviarAhora,
      solicitante_id: otra ? null : seleccion,
      solicitante_nombre: otra ? otroNombre : null,
      solicitante_cargo: otra ? otroCargo : null,
    })

    void navigate(`/app/compras/${id}`)
  }

  return (
    <>
      <PageHeader
        title="Nuevo pedido"
        description="Lo que pidas aquí entra al tablero en la columna Pedido."
        actions={
          <>
            {/* Con qué se va a valorar lo que se pida. A un pedido todavía no
                se le ponen precios, así que lo que hay que saber antes de
                empezar es si la tasa del día está cargada, no cuánto suma. */}
            <ChipTasa className="self-center" />
            <Link to="/app/compras">
              <Button variant="outline" icon={<ArrowLeft />}>
                Volver al tablero
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

            <Select
              label="Quién lo solicita"
              hint="Si a quien lo necesita le falta algo, se le pregunta a esta persona."
              value={seleccion}
              onChange={(e) => setQuienPide(e.target.value)}
              opciones={[
                ...(perfiles ?? [])
                  .filter((p) => p.activo)
                  .map((p) => ({
                    valor: p.id,
                    etiqueta:
                      (p.id === yo ? `${p.nombre} (yo)` : p.nombre) +
                      (p.cargo ? ` · ${p.cargo}` : ''),
                  })),
                { valor: OTRA_PERSONA, etiqueta: 'Otra persona — no tiene usuario' },
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
                    <Select
                      label={`Renglón ${indice + 1} · artículo del catálogo`}
                      vacio="No está en el catálogo — lo describo abajo"
                      value={fila.articulo_id}
                      onChange={(e) => elegirArticulo(fila.clave, e.target.value)}
                      opciones={(articulos ?? []).map((a) => ({
                        valor: String(a.id),
                        etiqueta: `${a.codigo} · ${a.nombre}`,
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
