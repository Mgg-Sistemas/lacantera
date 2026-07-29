import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useArticulos, usePerfiles, useUnidades } from '@/lib/api/catalogo'
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

export function NuevoPedido() {
  const navigate = useNavigate()
  const { data: articulos } = useArticulos()
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
      destino: destino || null,
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
          <Link to="/app/compras">
            <Button variant="outline" icon={<ArrowLeft />}>
              Volver al tablero
            </Button>
          </Link>
        }
      />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void enviar(true)
        }}
        className="grid gap-4 lg:grid-cols-3"
      >
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Qué se necesita" subtitle="Un renglón por cosa distinta." />

            <div className="mt-4 space-y-3">
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
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Datos del pedido" />

            <div className="mt-4 space-y-4">
              <Input
                label="Título"
                placeholder="Repuestos para la trituradora primaria"
                hint="Es lo que se lee en la tarjeta del tablero."
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                required
              />

              <Textarea
                label="Para qué es"
                placeholder="La muela está gastada y el material sale fuera de medida."
                hint="Quien aprueba no está en el frente."
                rows={4}
                value={justificacion}
                onChange={(e) => setJustificacion(e.target.value)}
                required
              />

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

              <Input
                label="Destino"
                placeholder="Taller, planta, frente 3"
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
              />
            </div>
          </Card>

          {crear.error ? <ErrorDeCarga error={crear.error} /> : null}

          <div className="flex flex-col gap-2">
            <Button type="submit" size="lg" block disabled={crear.isPending}>
              {crear.isPending ? 'Enviando…' : 'Enviar el pedido'}
            </Button>
            <Button
              variant="outline"
              block
              disabled={crear.isPending}
              onClick={() => void enviar(false)}
            >
              Guardar como borrador
            </Button>
          </div>
        </div>
      </form>
    </>
  )
}
