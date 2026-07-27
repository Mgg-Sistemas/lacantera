import { useState } from 'react'
import { Plus, Truck } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { CONDICIONES_PAGO, useGuardarProveedor, useProveedores } from '@/lib/api/catalogo'
import type { Proveedor } from '@/lib/api/catalogo'

const vacio = {
  rif: '',
  nombre: '',
  nombre_comercial: '',
  contacto: '',
  telefono: '',
  correo: '',
  direccion: '',
  condicion_pago: 'CONTADO',
  moneda_preferida: 'USD',
  contribuyente_especial: false,
  notas: '',
  activo: true,
}

export function Proveedores() {
  const { data, isPending, error } = useProveedores(false)
  const guardar = useGuardarProveedor()
  const [edicion, setEdicion] = useState<(typeof vacio & { id?: number }) | null>(null)

  const abrir = (p?: Proveedor) =>
    setEdicion(
      p
        ? {
            id: p.id,
            rif: p.rif,
            nombre: p.nombre,
            nombre_comercial: p.nombre_comercial ?? '',
            contacto: p.contacto ?? '',
            telefono: p.telefono ?? '',
            correo: p.correo ?? '',
            direccion: p.direccion ?? '',
            condicion_pago: p.condicion_pago,
            moneda_preferida: p.moneda_preferida,
            contribuyente_especial: p.contribuyente_especial,
            notas: p.notas ?? '',
            activo: p.activo,
          }
        : { ...vacio },
    )

  const cambiar = (c: Partial<typeof vacio>) => setEdicion((e) => (e ? { ...e, ...c } : e))

  return (
    <>
      <PageHeader
        title="Proveedores"
        description="A quién se le compra. El RIF y la condición de pago se usan al emitir la orden."
        actions={
          <Button icon={<Plus />} onClick={() => abrir()}>
            Nuevo proveedor
          </Button>
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<Truck />}
            titulo="Todavía no hay proveedores"
            descripcion="Sin proveedores no se pueden cargar cotizaciones. Empieza por los tres o cuatro con los que se compra siempre."
            accion={
              <Button icon={<Plus />} onClick={() => abrir()}>
                Registrar el primero
              </Button>
            }
          />
        </Card>
      ) : null}

      {data && data.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Proveedor</th>
                  <th className="px-3 py-3 font-medium">RIF</th>
                  <th className="px-3 py-3 font-medium">Contacto</th>
                  <th className="px-3 py-3 font-medium">Condición</th>
                  <th className="px-5 py-3 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => abrir(p)}
                    className="border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors last:border-0"
                  >
                    <td className="px-5 py-3">
                      <p className="text-ink/85 font-medium">{p.nombre}</p>
                      {p.nombre_comercial ? (
                        <p className="text-ink/45 text-xs">{p.nombre_comercial}</p>
                      ) : null}
                    </td>
                    <td className="tabular text-ink/70 px-3 py-3">{p.rif}</td>
                    <td className="text-ink/70 px-3 py-3">
                      {p.contacto ?? '—'}
                      {p.telefono ? <span className="text-ink/45 block text-xs">{p.telefono}</span> : null}
                    </td>
                    <td className="text-ink/70 px-3 py-3">
                      {CONDICIONES_PAGO.find((c) => c.valor === p.condicion_pago)?.etiqueta}
                      {p.contribuyente_especial ? (
                        <Chip tone="warning" className="ml-2">
                          Especial
                        </Chip>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Chip tone={p.activo ? 'success' : 'neutral'}>
                        {p.activo ? 'Activo' : 'Inactivo'}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {edicion ? (
        <Modal
          abierto
          onCerrar={() => setEdicion(null)}
          titulo={edicion.id ? 'Editar proveedor' : 'Nuevo proveedor'}
          descripcion="El RIF se guarda normalizado: J-12345678-9."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setEdicion(null)}>
                Cancelar
              </Button>
              <Button
                disabled={guardar.isPending}
                onClick={async () => {
                  await guardar.mutateAsync(edicion)
                  setEdicion(null)
                }}
              >
                {guardar.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="RIF"
              placeholder="J-12345678-9"
              value={edicion.rif}
              onChange={(e) => cambiar({ rif: e.target.value })}
              required
            />
            <Input
              label="Razón social"
              value={edicion.nombre}
              onChange={(e) => cambiar({ nombre: e.target.value })}
              required
            />
            <Input
              label="Nombre comercial"
              value={edicion.nombre_comercial}
              onChange={(e) => cambiar({ nombre_comercial: e.target.value })}
            />
            <Input
              label="Persona de contacto"
              value={edicion.contacto}
              onChange={(e) => cambiar({ contacto: e.target.value })}
            />
            <Input
              label="Teléfono"
              inputMode="tel"
              value={edicion.telefono}
              onChange={(e) => cambiar({ telefono: e.target.value })}
            />
            <Input
              label="Correo"
              type="email"
              value={edicion.correo}
              onChange={(e) => cambiar({ correo: e.target.value })}
            />
            <Select
              label="Condición de pago"
              value={edicion.condicion_pago}
              onChange={(e) => cambiar({ condicion_pago: e.target.value })}
              opciones={CONDICIONES_PAGO}
            />
            <Select
              label="Moneda con la que cotiza"
              value={edicion.moneda_preferida}
              onChange={(e) => cambiar({ moneda_preferida: e.target.value })}
              opciones={[
                { valor: 'USD', etiqueta: 'Dólares' },
                { valor: 'VES', etiqueta: 'Bolívares' },
                { valor: 'EUR', etiqueta: 'Euros' },
              ]}
            />
          </div>

          <Input
            label="Dirección"
            className="mt-4"
            value={edicion.direccion}
            onChange={(e) => cambiar({ direccion: e.target.value })}
          />

          <Textarea
            label="Notas"
            className="mt-4"
            rows={2}
            value={edicion.notas}
            onChange={(e) => cambiar({ notas: e.target.value })}
          />

          <div className="mt-4 space-y-2">
            <label className="text-ink/75 flex cursor-pointer items-center gap-2 text-sm select-none">
              <input
                type="checkbox"
                className="accent-royal-600 size-4"
                checked={edicion.contribuyente_especial}
                onChange={(e) => cambiar({ contribuyente_especial: e.target.checked })}
              />
              Contribuyente especial — se le retiene IVA al pagar
            </label>
            <label className="text-ink/75 flex cursor-pointer items-center gap-2 text-sm select-none">
              <input
                type="checkbox"
                className="accent-royal-600 size-4"
                checked={edicion.activo}
                onChange={(e) => cambiar({ activo: e.target.checked })}
              />
              Activo — aparece al cargar cotizaciones
            </label>
          </div>

          {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-4" /> : null}
        </Modal>
      ) : null}
    </>
  )
}
