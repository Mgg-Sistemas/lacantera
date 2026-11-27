import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useProveedores, type Proveedor } from '@/lib/api/catalogo'
import { rpc } from '@/lib/api/rpc'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ErrorDeCarga } from '@/components/ui/Estado'

const tiposPersona = [
  { valor: '', etiqueta: 'Sin clasificar' },
  { valor: 'PJD', etiqueta: 'Persona jurídica domiciliada' },
  { valor: 'PNR', etiqueta: 'Persona natural residente' },
  { valor: 'PJND', etiqueta: 'Persona jurídica no domiciliada' },
  { valor: 'PNNR', etiqueta: 'Persona natural no residente' },
]

function perfilDe(p: Proveedor) {
  return {
    tipo_persona: p.tipo_persona ?? '',
    actividad_economica: p.actividad_economica ?? '',
    numero_administracion: p.numero_administracion ?? '',
    contribuyente_especial: p.contribuyente_especial,
  }
}

export function PerfilFiscalProveedor({ onClose }: { onClose: () => void }) {
  const proveedores = useProveedores(false)
  const qc = useQueryClient()
  const [id, setId] = useState<number>()
  const [perfil, setPerfil] = useState<ReturnType<typeof perfilDe>>()
  const guardar = useMutation({
    mutationFn: (datos: { id: number; perfil: ReturnType<typeof perfilDe> }) =>
      rpc('retencion_guardar_perfil_proveedor', { p_id: datos.id, p_datos: datos.perfil }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['proveedores'] })
      onClose()
    },
  })

  return (
    <Modal abierto titulo="Perfil fiscal del proveedor" onCerrar={onClose} acciones={
      <>
        <Button variant="outline" onClick={onClose} disabled={guardar.isPending}>Cancelar</Button>
        <Button disabled={!id || !perfil || guardar.isPending} onClick={() => {
          if (id && perfil) guardar.mutate({ id, perfil })
        }}>Guardar</Button>
      </>
    }>
      <Select label="Proveedor registrado" value={id ?? ''} disabled={proveedores.isPending || guardar.isPending}
        opciones={[
          { valor: '', etiqueta: proveedores.isPending ? 'Cargando…' : 'Seleccione un proveedor' },
          ...(proveedores.data ?? []).map((p) => ({ valor: String(p.id), etiqueta: p.nombre + ' · ' + p.rif })),
        ]}
        onChange={(e) => {
          const proveedor = proveedores.data?.find((p) => p.id === Number(e.target.value))
          setId(proveedor?.id)
          setPerfil(proveedor ? perfilDe(proveedor) : undefined)
          guardar.reset()
        }}
      />
      {proveedores.error && <ErrorDeCarga error={proveedores.error} />}
      {perfil && (
        <fieldset className="mt-4 grid gap-4" disabled={guardar.isPending}>
          <Select label="Calificación ISLR / Sujeto" value={perfil.tipo_persona} opciones={tiposPersona}
            onChange={(e) => setPerfil({ ...perfil, tipo_persona: e.target.value })} />
          <Input label="Actividad económica (CIIU / SENIAT)" value={perfil.actividad_economica} maxLength={50}
            onChange={(e) => setPerfil({ ...perfil, actividad_economica: e.target.value })} />
          <Input label="Teléfono / Contacto de Administración" value={perfil.numero_administracion} maxLength={40}
            onChange={(e) => setPerfil({ ...perfil, numero_administracion: e.target.value })} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={perfil.contribuyente_especial}
              onChange={(e) => setPerfil({ ...perfil, contribuyente_especial: e.target.checked })} />
            Contribuyente especial
          </label>
        </fieldset>
      )}
      {guardar.error && <ErrorDeCarga error={guardar.error} className="mt-4" />}
    </Modal>
  )
}
