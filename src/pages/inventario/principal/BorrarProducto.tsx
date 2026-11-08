import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useCambiarEstadoArticulo } from '@/lib/api/catalogo'
import type { Articulo } from '@/lib/api/catalogo'
import { toast } from '@/lib/avisosFlotantes'

/*
  ✕ «BORRAR PRODUCTO» (fase 4 de «Almacén e Inventario como MGG»,
  08/11/2026). Copia de `EliminarProductoDialog` de MGG: el motivo y escribir
  el nombre para confirmar.

  En MGG «borrar» NO borra: deja el producto inactivo, con su historial, y se
  reactiva desde «🗄 PRODUCTOS DESHABILITADOS». Aquí es exactamente lo que hace
  `cambiar_estado_articulo` con su motivo, así que no hace falta ninguna
  función nueva. La base pide diez letras de motivo (MGG pedía cinco) y niega
  la baja si el producto tiene existencia o algo a medias, y dice por qué.

  El «Eliminar duplicado» de verdad (`eliminar_articulo_duplicado`, solo
  ADMIN) sigue en el menú «⋯» de la fila.
*/
export function BorrarProducto({ articulo, onCerrar }: { articulo: Articulo; onCerrar: () => void }) {
  const cambiar = useCambiarEstadoArticulo()
  const [motivo, setMotivo] = useState('')
  const [nombre, setNombre] = useState('')

  const motivoCorto = motivo.trim().length > 0 && motivo.trim().length < 10
  const coincide = nombre.trim().toUpperCase() === articulo.nombre.trim().toUpperCase()
  const listo = motivo.trim().length >= 10 && coincide

  return (
    <Modal
      abierto
      ancho="sm"
      onCerrar={onCerrar}
      titulo="Borrar producto"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={!listo || cambiar.isPending}
            onClick={async () => {
              try {
                await cambiar.mutateAsync({ id: articulo.id, activo: false, motivo })
                toast(`Producto desactivado: ${articulo.codigo}`, 'success')
                onCerrar()
              } catch {
                // El error de la base se enseña abajo.
              }
            }}
          >
            {cambiar.isPending ? 'Borrando…' : 'Borrar producto'}
          </Button>
        </>
      }
    >
      <p className="text-ink/75 text-sm">
        ¿Seguro que deseas borrar el producto <strong>«{articulo.nombre}»</strong> ({articulo.codigo})? Quedará{' '}
        <strong>inactivo</strong>: deja de existir para el sistema (no aparece en el inventario, ni en los almacenes, ni
        en el buscador) y su historial se conserva. Se puede reactivar desde el botón{' '}
        <strong>«PRODUCTOS DESHABILITADOS»</strong>.
      </p>
      <div className="mt-4 space-y-3">
        <Textarea
          maxLength={500}
          label="¿Por qué se da de baja? *"
          rows={2}
          placeholder="Ej. Unificado en otro código · ya no se compra · ficha repetida"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          error={motivoCorto ? 'Escribí un motivo un poco más claro.' : undefined}
        />
        <Input
          maxLength={120}
          label={`Para confirmar, escribí el nombre del producto: ${articulo.nombre}`}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          error={nombre.trim() && !coincide ? 'El nombre no coincide.' : undefined}
        />
      </div>
      {cambiar.error ? <ErrorDeCarga error={cambiar.error} className="mt-3" /> : null}
    </Modal>
  )
}
