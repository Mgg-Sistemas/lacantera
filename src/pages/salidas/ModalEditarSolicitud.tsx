import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useArticulos } from '@/lib/api/catalogo'
import { useEditarSolicitudSalida, type SolicitudDeSalida } from '@/lib/api/salidas'

/*
  EDITAR LA SOLICITUD ANTES DE ENTREGARLA (MGG «Editar», la dueña 11/11/2026:
  «trae… toda la funcionalidad»).

  Se cambia el «para qué» y los materiales: la cantidad, quitar un renglón o
  agregar otro. Si ya estaba aprobada vuelve a Por aprobar —lo aprobado era otra
  cosa—, y la ventana lo avisa antes de guardar.
*/

interface Fila {
  clave: string
  articulo_id: string
  cantidad: string
  presentaciones?: string | null
  presentacion?: string | null
  suelto?: string | null
  propietario?: string | null
}

export function ModalEditarSolicitud({ s, onCerrar }: { s: SolicitudDeSalida; onCerrar: () => void }) {
  const editar = useEditarSolicitudSalida()
  const { data: articulos } = useArticulos()
  const [motivo, setMotivo] = useState(s.motivo ?? '')
  const [filas, setFilas] = useState<Fila[]>(() =>
    (s.renglones ?? []).map((r) => ({
      clave: `r${r.id}`,
      articulo_id: String(r.articulo_id),
      // Si se pidió en bultos, la cantidad editable es la total en la unidad del artículo.
      cantidad: String(Number(r.cantidad)),
      presentaciones: null,
      presentacion: null,
      suelto: null,
      propietario: r.propietario,
    })),
  )

  const opciones = useMemo(
    () =>
      (articulos ?? [])
        .filter((a) => a.inventariable)
        .map((a) => ({ valor: String(a.id), codigo: a.codigo, nombre: `${a.nombre} (${a.unidad})` })),
    [articulos],
  )
  const unidadDe = (id: string) => (articulos ?? []).find((a) => String(a.id) === id)?.unidad ?? ''

  const cambiar = (clave: string, c: Partial<Fila>) =>
    setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...c } : f)))

  const validas = filas.filter((f) => f.articulo_id && Number(f.cantidad) > 0)
  const listo = motivo.trim().length >= 10 && validas.length > 0 && validas.length === filas.length

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Editar ${s.numero}`}
      descripcion={
        s.estado === 'APROBADA'
          ? 'Ya estaba aprobada: al guardar vuelve a Por aprobar.'
          : 'Cambie lo que hace falta antes de que se entregue.'
      }
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={!listo || editar.isPending}
            onClick={async () => {
              await editar.mutateAsync({
                id: s.id,
                motivo: motivo.trim(),
                renglones: validas.map((f) => ({
                  articulo_id: Number(f.articulo_id),
                  cantidad: Number(f.cantidad),
                  propietario: f.propietario ?? null,
                })),
              })
              onCerrar()
            }}
          >
            {editar.isPending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Textarea
          maxLength={500}
          label="Para qué se necesita"
          rows={2}
          hint="Mínimo 10 letras: es lo que lee quien la aprueba."
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />

        <div className="space-y-3">
          {filas.map((f, i) => (
            <div key={f.clave} className="border-hairline grid gap-3 rounded-[10px] border p-3 sm:grid-cols-[1fr_10rem_auto]">
              <SelectBuscable
                label={`Material ${i + 1}`}
                vacio="Elegir…"
                valor={f.articulo_id}
                onCambio={(v) => cambiar(f.clave, { articulo_id: v })}
                opciones={opciones}
              />
              <Input
                label={`Cantidad${f.articulo_id ? ` (${unidadDe(f.articulo_id)})` : ''}`}
                type="number"
                inputMode="decimal"
                limite={{ maxDecimales: 4, sinNegativos: true }}
                value={f.cantidad}
                error={f.cantidad.trim() !== '' && !(Number(f.cantidad) > 0) ? 'Mayor que cero.' : undefined}
                onChange={(e) => cambiar(f.clave, { cantidad: e.target.value })}
              />
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  disabled={filas.length === 1}
                  title={filas.length === 1 ? 'La solicitud necesita al menos un material' : 'Quitar este material'}
                  onClick={() => setFilas((fs) => fs.filter((x) => x.clave !== f.clave))}
                >
                  ✕ Quitar
                </Button>
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            onClick={() => setFilas((fs) => [...fs, { clave: `n${Date.now()}`, articulo_id: '', cantidad: '' }])}
          >
            + Agregar material
          </Button>
        </div>

        {editar.error ? <ErrorDeCarga error={editar.error} /> : null}
      </div>
    </Modal>
  )
}
