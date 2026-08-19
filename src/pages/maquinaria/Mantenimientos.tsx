import { useMemo, useState } from 'react'
import { Search, Wrench } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useReporteMantenimientos, type EstadoOrden } from '@/lib/api/maquinaria'
import { dolares, enteros, fecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

/**
 * El reporte de taller.
 *
 * QUÉ RESPONDE QUE NO RESPONDÍA NADA
 *
 * Cada máquina ya enseñaba su última fecha de mantenimiento. Lo que faltaba era
 * mirarlo al revés: qué ha pasado por el taller este mes, cuánto tardó cada
 * cosa, qué costó entre mano de obra y repuestos, y qué hay dentro ahora
 * mismo. Es la pregunta que se hace quien decide si conviene reparar una
 * máquina otra vez o cambiarla.
 *
 * LO ABIERTO VA PRIMERO Y SIN QUE HAYA QUE PEDIRLO
 *
 * Una orden abierta es una máquina parada. Ordenar por fecha las mezclaría con
 * el historial, que es justo lo contrario de lo que hace falta: lo de hoy
 * importa más que lo del mes pasado.
 */
export function Mantenimientos() {
  const { data, isPending, error } = useReporteMantenimientos()
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState<'' | EstadoOrden>('')

  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    const orden: Record<EstadoOrden, number> = { ABIERTO: 0, CERRADO: 1, ANULADO: 2 }

    return (data ?? [])
      .filter((m) => {
        if (estado && m.estado !== estado) return false
        if (!texto) return true
        return (
          m.maquina.toLowerCase().includes(texto) ||
          m.maquina_codigo.toLowerCase().includes(texto) ||
          (m.numero ?? '').toLowerCase().includes(texto) ||
          (m.detalle ?? '').toLowerCase().includes(texto) ||
          (m.motivo ?? '').toLowerCase().includes(texto)
        )
      })
      .sort((a, b) => orden[a.estado] - orden[b.estado] || b.fecha.localeCompare(a.fecha))
  }, [data, busqueda, estado])

  const abiertas = (data ?? []).filter((m) => m.estado === 'ABIERTO')
  const gasto = filtradas
    .filter((m) => m.estado === 'CERRADO')
    .reduce((s, m) => s + Number(m.costo_total_usd), 0)

  return (
    <>
      <PageHeader
        title="Historial de taller"
        description="Qué ha entrado, cuánto tardó, qué se le hizo y qué costó. Las órdenes abiertas son máquinas paradas ahora mismo."
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {abiertas.length > 0 ? (
        <div className="border-warning/30 bg-warning-soft mb-4 flex items-start gap-2.5 rounded-[6px] border p-3.5">
          <Wrench className="text-warning mt-px size-[18px] shrink-0" />
          <p className="text-ink/80 text-sm">
            <strong className="font-semibold">
              {abiertas.length} máquina{abiertas.length === 1 ? '' : 's'} en el taller
            </strong>
            {abiertas.some((m) => m.dias !== null && m.dias_estimados !== null && m.dias > m.dias_estimados)
              ? ', alguna lleva más días de los previstos.'
              : '. No están trabajando mientras tanto.'}
          </p>
        </div>
      ) : null}

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
          <Input
            label="Buscar"
            icon={<Search />}
            placeholder="Máquina, número de orden o qué se le hizo"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <Select
            label="Estado"
            vacio="Todas"
            value={estado}
            onChange={(e) => setEstado(e.target.value as '' | EstadoOrden)}
            opciones={[
              { valor: 'ABIERTO', etiqueta: 'En el taller' },
              { valor: 'CERRADO', etiqueta: 'Terminadas' },
              { valor: 'ANULADO', etiqueta: 'Anuladas' },
            ]}
          />
        </div>
      </Card>

      {!isPending && !error && filtradas.length === 0 ? (
        <Card>
          <Vacio
            icono={<Wrench />}
            titulo={
              (data ?? []).length === 0 ? 'Todavía no ha pasado nada por el taller' : 'Nada coincide'
            }
            descripcion={
              (data ?? []).length === 0
                ? 'Cuando una máquina entre al taller desde su ficha, la orden aparecerá aquí con lo que se le hizo y lo que costó.'
                : undefined
            }
          />
        </Card>
      ) : null}

      {filtradas.length > 0 ? (
        <Card flush>
          <div className="border-hairline flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-3">
            <p className="text-ink/60 text-sm">
              {filtradas.length} orden{filtradas.length === 1 ? '' : 'es'}
            </p>
            {gasto > 0 ? (
              <p className="text-ink/80 text-sm">
                Costo de lo terminado:{' '}
                <span className="tabular font-semibold">{dolares(gasto)}</span>
              </p>
            ) : null}
          </div>

          <ul className="divide-hairline divide-y">
            {filtradas.map((m) => {
              const tarde =
                m.estado === 'ABIERTO' &&
                m.dias !== null &&
                m.dias_estimados !== null &&
                m.dias > m.dias_estimados

              return (
                <li key={m.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-ink/85 font-mono text-sm">{m.maquina_codigo}</span>
                    <span className="text-ink/70 text-sm">{m.maquina}</span>

                    <Chip
                      tone={
                        m.estado === 'ABIERTO'
                          ? 'warning'
                          : m.estado === 'ANULADO'
                            ? 'neutral'
                            : 'success'
                      }
                    >
                      {m.estado === 'ABIERTO'
                        ? 'En el taller'
                        : m.estado === 'ANULADO'
                          ? 'Anulada'
                          : 'Terminada'}
                    </Chip>
                    <Chip tone={m.tipo === 'MANTENIMIENTO' ? 'warning' : 'neutral'}>
                      {m.tipo === 'MANTENIMIENTO' ? 'Mantenimiento' : 'Servicio'}
                    </Chip>

                    {m.numero ? (
                      <span className="text-ink/40 text-2xs font-mono">{m.numero}</span>
                    ) : null}

                    {Number(m.costo_total_usd) > 0 ? (
                      <span className="tabular text-ink/80 ml-auto text-sm font-semibold">
                        {dolares(m.costo_total_usd)}
                      </span>
                    ) : null}
                  </div>

                  <p className="text-ink/45 mt-1 text-xs">
                    Entró el {fecha(m.fecha)}
                    {m.fecha_salida ? ` · salió el ${fecha(m.fecha_salida)}` : ''}
                    {m.dias !== null ? (
                      <span className={cn(tarde && 'text-warning font-medium')}>
                        {' '}
                        · {m.dias} día{m.dias === 1 ? '' : 's'}
                        {tarde ? ` (se estimaron ${m.dias_estimados})` : ''}
                      </span>
                    ) : null}
                    {m.taller ? ` · ${m.taller}` : ''}
                    {m.horometro ? ` · ${enteros(Number(m.horometro))} h` : ''}
                    {m.repuestos > 0
                      ? ` · ${m.repuestos} repuesto${m.repuestos === 1 ? '' : 's'} por ${dolares(m.costo_repuestos_usd)}`
                      : ''}
                  </p>

                  {/* Al abrir se dice por qué entra; al cerrar, qué se le hizo.
                      Se enseñan los dos porque no dicen lo mismo: uno es el
                      síntoma y el otro la reparación. */}
                  {m.motivo ? (
                    <p className="text-ink/60 mt-2 text-sm leading-relaxed">
                      <span className="text-ink/40">Entró por:</span> {m.motivo}
                    </p>
                  ) : null}
                  {m.detalle ? (
                    <p className="text-ink/75 mt-1 text-sm leading-relaxed">{m.detalle}</p>
                  ) : null}
                  {m.motivo_anulacion ? (
                    <p className="text-ink/50 mt-1 text-sm italic">
                      Anulada: {m.motivo_anulacion}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </Card>
      ) : null}
    </>
  )
}
