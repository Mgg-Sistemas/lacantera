import { useMemo, useState } from 'react'
import { ArrowRight, MoveRight, Undo2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useArticulos, useMisRoles } from '@/lib/api/catalogo'
import {
  useAlmacenes,
  useExistencias,
  useMovimientos,
  useReversarMovimiento,
  useTransferir,
} from '@/lib/api/inventario'
import { fechaHora } from '@/lib/formato'

const VACIO = { origen: '', destino: '', articulo: '', cantidad: '', motivo: '' }

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
  const { data: articulos } = useArticulos()
  const { puede } = useMisRoles()
  const transferir = useTransferir()
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

  // Cuánto hay de ese artículo en ese almacén, para decirlo antes de intentarlo.
  const { data: existencias } = useExistencias(form.origen ? Number(form.origen) : undefined)
  const disponible = useMemo(() => {
    if (!form.origen || !form.articulo) return null
    const fila = existencias?.find((e) => String(e.articulo_id) === form.articulo)
    return fila ? Number(fila.existencia) : 0
  }, [existencias, form.origen, form.articulo])

  const activos = (almacenes ?? []).filter((a) => a.activo)
  const cantidad = Number(form.cantidad.replace(',', '.'))
  const listo =
    form.origen &&
    form.destino &&
    form.origen !== form.destino &&
    form.articulo &&
    cantidad > 0 &&
    (disponible === null || cantidad <= disponible) &&
    form.motivo.trim().length >= 4

  const enviar = async () => {
    setError('')
    try {
      await transferir.mutateAsync({
        origen_id: Number(form.origen),
        destino_id: Number(form.destino),
        articulo_id: Number(form.articulo),
        cantidad,
        motivo: form.motivo.trim(),
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
          descripcion="Cuando el material pase de un almacén a otro, el traslado queda aquí con las dos patas."
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Sale de"
            vacio="Elige el almacén"
            value={form.origen}
            onChange={(e) => cambiar({ origen: e.target.value })}
            opciones={activos.map((a) => ({ valor: String(a.id), etiqueta: a.nombre }))}
          />
          <Select
            label="Entra en"
            vacio="Elige el almacén"
            value={form.destino}
            onChange={(e) => cambiar({ destino: e.target.value })}
            error={
              form.destino && form.destino === form.origen
                ? 'No puede ser el mismo de donde sale.'
                : undefined
            }
            opciones={activos
              .filter((a) => String(a.id) !== form.origen)
              .map((a) => ({ valor: String(a.id), etiqueta: a.nombre }))}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Select
            label="Artículo"
            vacio="Elige el artículo"
            value={form.articulo}
            onChange={(e) => cambiar({ articulo: e.target.value })}
            opciones={(articulos ?? [])
              .filter((a) => a.inventariable && a.activo)
              .map((a) => ({ valor: String(a.id), etiqueta: `${a.codigo} · ${a.nombre}` }))}
          />
          <Input
            label="Cantidad"
            inputMode="decimal"
            value={form.cantidad}
            onChange={(e) => cambiar({ cantidad: e.target.value })}
            hint={
              disponible === null
                ? 'Elige almacén y artículo para ver cuánto hay.'
                : `Disponible: ${disponible.toLocaleString('es-VE')}`
            }
            error={
              disponible !== null && cantidad > disponible
                ? `Solo hay ${disponible.toLocaleString('es-VE')}.`
                : undefined
            }
          />
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
        descripcion="Se reversan las dos patas: el material vuelve a donde estaba."
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
