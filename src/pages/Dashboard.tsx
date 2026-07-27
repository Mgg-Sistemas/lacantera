import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Info,
  Layers,
  Pickaxe,
  Truck,
  Users,
} from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import {
  alertas,
  despachosRecientes,
  pendientesAprobacion,
  produccionSemana,
  productos,
} from '@/data/demo'
import { dolares, dolaresRedondos, enteros, toneladas } from '@/lib/formato'

const iconosAlerta = {
  danger: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
} as const

export function Dashboard() {
  const maxProduccion = Math.max(...produccionSemana.map((d) => d.toneladas))
  const hoy = new Date().toLocaleDateString('es-VE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <>
      <PageHeader
        title="Panel"
        description={`Operación de ${hoy}`}
        actions={<Button variant="outline">Exportar cierre del día</Button>}
      />

      {/* ---------- Indicadores ---------- */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Producción de hoy"
          value={toneladas(1480)}
          icon={<Pickaxe />}
          tone="royal"
          delta={-10.6}
          deltaLabel="vs. viernes"
        />
        <StatCard
          label="Despachado de hoy"
          value={toneladas(1284)}
          icon={<Truck />}
          tone="success"
          delta={12.4}
          deltaLabel="vs. ayer"
        />
        <StatCard
          label="Por cobrar vencido"
          value={dolaresRedondos(48250)}
          icon={<Banknote />}
          tone="warning"
          delta={8.2}
          deltaLabel="vs. mes pasado"
          invertDelta
        />
        <StatCard
          label="Nómina de la semana"
          value={dolaresRedondos(11840)}
          icon={<Users />}
          tone="info"
          delta={2.1}
          deltaLabel="38 obreros · 9 empleados"
        />
      </div>

      {/* ---------- Producción y existencias ---------- */}
      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Producción de la semana"
            subtitle={`${enteros(10329)} t acumuladas`}
          />

          {/* La barra vive dentro de un contenedor `flex-1 min-h-0`: sin una
              altura definida en el padre, un alto en porcentaje se resuelve
              contra `auto` y la barra desaparece. */}
          <div className="mt-6 flex h-52 gap-2.5">
            {produccionSemana.map((dia) => {
              const alto = (dia.toneladas / maxProduccion) * 100
              const esHoy = dia.dia === 'Hoy'
              return (
                <div key={dia.dia} className="flex h-full flex-1 flex-col items-center gap-2">
                  <span className="text-ink/50 tabular text-2xs">
                    {enteros(dia.toneladas)}
                  </span>
                  <div className="flex min-h-0 w-full flex-1 items-end">
                    <div
                      className={`w-full rounded-t-[4px] ${esHoy ? 'bg-royal-600' : 'bg-royal-200'}`}
                      style={{ height: `${alto}%` }}
                    />
                  </div>
                  <span
                    className={`text-2xs ${esHoy ? 'text-ink/90 font-semibold' : 'text-ink/45'}`}
                  >
                    {dia.dia}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader
            title="Existencia en patio"
            subtitle="Toneladas sobre capacidad de acopio"
            action={
              <Chip tone="neutral">Último conteo: 24 jul · dron</Chip>
            }
          />

          <ul className="mt-5 space-y-4">
            {productos.map((producto) => {
              const ocupacion = (producto.existenciaTon / producto.capacidadTon) * 100
              const bajo = ocupacion < 35
              return (
                <li key={producto.codigo}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink/80 truncate text-sm font-medium">
                      {producto.nombre}
                    </span>
                    <span className="text-ink/70 tabular shrink-0 text-sm">
                      {toneladas(producto.existenciaTon)}
                      <span className="text-ink/35"> / {enteros(producto.capacidadTon)}</span>
                    </span>
                  </div>
                  <div className="bg-ink/8 mt-1.5 h-1.5 overflow-hidden rounded-full">
                    <div
                      className={`h-full rounded-full ${bajo ? 'bg-warning' : 'bg-royal-500'}`}
                      style={{ width: `${ocupacion}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>

      {/* ---------- Despachos ---------- */}
      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card flush className="xl:col-span-2">
          <div className="p-5">
            <CardHeader
              title="Despachos recientes"
              subtitle="Registrados en romana hoy"
              action={
                <Button variant="ghost" size="sm">
                  Ver todos
                </Button>
              }
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left">
              <thead>
                <tr className="border-hairline border-y">
                  <th className="text-ink/50 px-5 py-2.5 text-2xs font-semibold tracking-wider uppercase">
                    Guía
                  </th>
                  <th className="text-ink/50 px-5 py-2.5 text-2xs font-semibold tracking-wider uppercase">
                    Cliente
                  </th>
                  <th className="text-ink/50 px-5 py-2.5 text-2xs font-semibold tracking-wider uppercase">
                    Producto
                  </th>
                  <th className="text-ink/50 px-5 py-2.5 text-right text-2xs font-semibold tracking-wider uppercase">
                    Neto
                  </th>
                  <th className="text-ink/50 px-5 py-2.5 text-2xs font-semibold tracking-wider uppercase">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-hairline divide-y">
                {despachosRecientes.map((despacho) => (
                  <tr key={despacho.guia} className="hover:bg-ink/3 transition-colors">
                    <td className="px-5 py-3">
                      <span className="text-ink/85 tabular text-sm font-medium">
                        {despacho.guia}
                      </span>
                      <span className="text-ink/45 block text-2xs">
                        {despacho.hora} · {despacho.vehiculo}
                      </span>
                    </td>
                    <td className="text-ink/75 px-5 py-3 text-sm">{despacho.cliente}</td>
                    <td className="text-ink/60 px-5 py-3 text-sm">{despacho.producto}</td>
                    <td className="text-ink/85 tabular px-5 py-3 text-right text-sm font-medium">
                      {despacho.toneladas.toLocaleString('es-VE', {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}{' '}
                      t
                    </td>
                    <td className="px-5 py-3">
                      <Chip tone={despacho.estado === 'Entregado' ? 'success' : 'info'}>
                        {despacho.estado}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ---------- Alertas ---------- */}
        <Card>
          <CardHeader title="Requiere atención" subtitle="4 asuntos abiertos" />

          <ul className="mt-4 space-y-3">
            {alertas.map((alerta) => {
              const Icono = iconosAlerta[alerta.tono]
              return (
                <li
                  key={alerta.titulo}
                  className="border-hairline flex gap-3 rounded-[6px] border p-3"
                >
                  <Icono
                    className={`mt-0.5 size-[18px] shrink-0 ${
                      alerta.tono === 'danger'
                        ? 'text-danger'
                        : alerta.tono === 'warning'
                          ? 'text-warning'
                          : 'text-info'
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-ink/85 text-sm font-medium">{alerta.titulo}</p>
                    <p className="text-ink/55 mt-0.5 text-xs leading-relaxed">
                      {alerta.detalle}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>

      {/* ---------- Aprobaciones ---------- */}
      <div className="mt-5">
        <Card>
          <CardHeader
            title="Esperando tu aprobación"
            subtitle="Ordenado por antigüedad de la solicitud"
            action={
              <Button variant="soft" size="sm" icon={<CheckCircle2 />}>
                Revisar todo
              </Button>
            }
          />

          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {pendientesAprobacion.map((pendiente) => (
              <li
                key={pendiente.documento}
                className="border-hairline hover:border-royal-300 flex items-start gap-3 rounded-[6px] border p-4 transition-colors"
              >
                <Layers className="text-ink/35 mt-0.5 size-[18px] shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-ink/85 tabular text-sm font-semibold">
                      {pendiente.documento}
                    </span>
                    {pendiente.urgente ? <Chip tone="danger">Urgente</Chip> : null}
                  </div>
                  <p className="text-ink/70 mt-1 text-sm">{pendiente.descripcion}</p>
                  <p className="text-ink/45 mt-1 text-xs">
                    {pendiente.solicitante} · {pendiente.nivel}
                  </p>
                </div>
                <span className="text-ink/90 tabular shrink-0 text-sm font-semibold">
                  {dolares(pendiente.montoUsd)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}
