import { useState } from 'react'
import { Building2, Plus } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { dolares, fecha } from '@/lib/formato'
import {
  CONDICIONES_PAGO,
  MONEDAS,
  useClientes,
  useGuardarCliente,
  type Cliente,
} from '@/lib/api/ventas'

const vacio = {
  rif: '',
  nombre: '',
  nombre_comercial: '',
  contacto: '',
  telefono: '',
  correo: '',
  direccion: '',
  condicion_pago: 'CONTADO',
  limite_credito: '',
  moneda_preferida: 'USD',
  contribuyente_especial: false,
  retencion_iva: '75',
  exento_iva: false,
  activo: true,
  notas: '',
}

export function Clientes() {
  const { data, isPending, error } = useClientes()
  const guardar = useGuardarCliente()
  const [edicion, setEdicion] = useState<(typeof vacio & { id?: number }) | null>(null)

  const abrir = (c?: Cliente) =>
    setEdicion(
      c
        ? {
            id: c.id,
            rif: c.rif,
            nombre: c.nombre,
            nombre_comercial: c.nombre_comercial ?? '',
            contacto: c.contacto ?? '',
            telefono: c.telefono ?? '',
            correo: c.correo ?? '',
            direccion: c.direccion ?? '',
            condicion_pago: c.condicion_pago,
            limite_credito: String(Number(c.limite_credito) || ''),
            moneda_preferida: c.moneda_preferida,
            contribuyente_especial: c.contribuyente_especial,
            retencion_iva: String(Number(c.retencion_iva)),
            exento_iva: c.exento_iva,
            activo: c.activo,
            notas: c.notas ?? '',
          }
        : { ...vacio },
    )

  const cambiar = (c: Partial<typeof vacio>) => setEdicion((e) => (e ? { ...e, ...c } : e))

  const aCredito = edicion ? edicion.condicion_pago !== 'CONTADO' : false

  return (
    <>
      <PageHeader
        title="Clientes"
        description="A quién se le vende. La dirección se imprime en la factura y el límite de crédito se aplica al facturar."
        actions={
          <Button icon={<Plus />} onClick={() => abrir()}>
            Nuevo cliente
          </Button>
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<Building2 />}
            titulo="Todavía no hay clientes"
            descripcion="Sin cliente no se puede despachar ni facturar. Empieza por los que se llevan material todas las semanas."
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
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Cliente</th>
                  <th className="px-3 py-3 font-medium">RIF</th>
                  <th className="px-3 py-3 font-medium">Condición</th>
                  <th className="px-3 py-3 text-right font-medium">Debe</th>
                  <th className="px-3 py-3 text-right font-medium">Última venta</th>
                  <th className="px-5 py-3 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => {
                  const debe = Number(c.deuda_usd)
                  const limite = Number(c.limite_credito)
                  const pasado = limite > 0 && debe > limite

                  return (
                    <tr
                      key={c.id}
                      onClick={() => abrir(c)}
                      className="border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors last:border-0"
                    >
                      <td className="px-5 py-3">
                        <p className="text-ink/85 font-medium">{c.nombre}</p>
                        {c.nombre_comercial ? (
                          <p className="text-ink/45 text-xs">{c.nombre_comercial}</p>
                        ) : null}
                      </td>
                      <td className="tabular text-ink/70 px-3 py-3">{c.rif}</td>
                      <td className="text-ink/70 px-3 py-3">
                        {CONDICIONES_PAGO.find((x) => x.valor === c.condicion_pago)?.etiqueta}
                        {c.contribuyente_especial ? (
                          <Chip tone="warning" className="ml-2">
                            Retiene IVA
                          </Chip>
                        ) : null}
                      </td>
                      <td className="tabular px-3 py-3 text-right">
                        <span className={debe > 0 ? 'text-ink/85 font-medium' : 'text-ink/35'}>
                          {dolares(debe)}
                        </span>
                        {limite > 0 ? (
                          <span
                            className={`block text-xs ${pasado ? 'text-danger' : 'text-ink/40'}`}
                          >
                            de {dolares(limite)}
                          </span>
                        ) : null}
                      </td>
                      <td className="text-ink/60 px-3 py-3 text-right text-xs">
                        {c.ultima_venta ? fecha(c.ultima_venta) : '—'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Chip tone={c.activo ? 'success' : 'neutral'}>
                          {c.activo ? 'Activo' : 'Inactivo'}
                        </Chip>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {edicion ? (
        <Modal
          abierto
          onCerrar={() => setEdicion(null)}
          titulo={edicion.id ? 'Editar cliente' : 'Nuevo cliente'}
          descripcion="El RIF y la dirección salen impresos en la factura."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setEdicion(null)}>
                Cancelar
              </Button>
              <Button
                disabled={guardar.isPending}
                onClick={async () => {
                  await guardar.mutateAsync({
                    ...edicion,
                    limite_credito: Number(edicion.limite_credito) || 0,
                    retencion_iva: Number(edicion.retencion_iva) || 75,
                  })
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
          </div>

          <Input
            label="Domicilio fiscal"
            className="mt-4"
            hint="Va impreso en la factura. Una factura sin la dirección del comprador está mal emitida."
            value={edicion.direccion}
            onChange={(e) => cambiar({ direccion: e.target.value })}
          />

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Select
              label="Condición de pago"
              value={edicion.condicion_pago}
              onChange={(e) => cambiar({ condicion_pago: e.target.value })}
              opciones={CONDICIONES_PAGO}
            />
            <Select
              label="Moneda con la que se le factura"
              value={edicion.moneda_preferida}
              onChange={(e) => cambiar({ moneda_preferida: e.target.value })}
              opciones={MONEDAS}
            />
          </div>

          {aCredito ? (
            <div className="border-warning/30 bg-warning-soft rounded-card mt-4 border p-3">
              <Input
                label="Límite de crédito, en dólares"
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                hint="No es un aviso: por encima de este monto el sistema no deja facturarle a crédito. En cero, no se le vende a crédito."
                value={edicion.limite_credito}
                onChange={(e) => cambiar({ limite_credito: e.target.value })}
              />
              <p className="text-warning mt-2 text-xs leading-relaxed">
                Dar crédito compromete dinero de la empresa. Solo lo puede fijar quien tenga control
                total sobre Ventas.
              </p>
            </div>
          ) : null}

          <div className="mt-4 space-y-2">
            <label className="text-ink/75 flex cursor-pointer items-center gap-2 text-sm select-none">
              <input
                type="checkbox"
                className="accent-royal-600 size-4"
                checked={edicion.contribuyente_especial}
                onChange={(e) => cambiar({ contribuyente_especial: e.target.checked })}
              />
              Contribuyente especial — retiene IVA al pagar
            </label>

            {edicion.contribuyente_especial ? (
              <Input
                label="Porcentaje de IVA que retiene"
                type="number"
                min="0"
                max="100"
                step="1"
                className="ml-6"
                hint="Normalmente 75%. Se descuenta de lo que hay que cobrarle, no del total de la factura."
                value={edicion.retencion_iva}
                onChange={(e) => cambiar({ retencion_iva: e.target.value })}
              />
            ) : null}

            <label className="text-ink/75 flex cursor-pointer items-center gap-2 text-sm select-none">
              <input
                type="checkbox"
                className="accent-royal-600 size-4"
                checked={edicion.exento_iva}
                onChange={(e) => cambiar({ exento_iva: e.target.checked })}
              />
              Exento de IVA — sus documentos salen con alícuota cero
            </label>

            <label className="text-ink/75 flex cursor-pointer items-center gap-2 text-sm select-none">
              <input
                type="checkbox"
                className="accent-royal-600 size-4"
                checked={edicion.activo}
                onChange={(e) => cambiar({ activo: e.target.checked })}
              />
              Activo — aparece al cotizar y despachar
            </label>
          </div>

          <Textarea
            label="Notas"
            className="mt-4"
            rows={2}
            value={edicion.notas}
            onChange={(e) => cambiar({ notas: e.target.value })}
          />

          {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-4" /> : null}
        </Modal>
      ) : null}
    </>
  )
}
