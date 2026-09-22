import { useMemo, useState } from 'react'
import { Palmtree, Trash2 } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { ErrorDeCarga } from '@/components/ui/Estado'
import {
  useEliminarVacaciones,
  useGuardarVacaciones,
  useVacacionesDelPeriodo,
  type Empleado,
} from '@/lib/api/nomina'

/*
  QUIÉN SALE DE VACACIONES EN ESTE PERÍODO

  LO QUE ESTA PANTALLA **NO** HACE, Y ES LO QUE MÁS IMPORTA

  No paga los días de vacaciones. No hace falta: `calcular_nomina` descuenta del
  salario las faltas INJUSTIFICADAS y no las justificadas, así que quien está de
  vacaciones ya cobra su período completo por la línea de salario. Añadir encima
  una asignación por esos mismos días los pagaría dos veces.

  Lo que sí falta por otra vía es el BONO VACACIONAL, y eso es lo que decide la
  casilla. Los días se anotan igual —para que quede dicho quién estuvo fuera y
  cuántos días— aunque el bono se pague en otro período.

  LA CASILLA ES DE RRHH, NO DEL SISTEMA

  Se pidió así. No dispara sola en el aniversario: alguien decide, período a
  período, si ese recibo lleva el bono. Los días que le tocan sí los calcula la
  base —`dias_bono_vacacional`: lo pactado, o 15 más uno por año con tope 30—,
  que es la misma cuenta que usa la liquidación.
*/

export function VacacionesDelPeriodo({
  periodoId,
  empleados,
  puedeEditar,
  abierto,
}: {
  periodoId: number
  empleados: Empleado[]
  puedeEditar: boolean
  abierto: boolean
}) {
  const { data: vacaciones } = useVacacionesDelPeriodo(periodoId)
  const guardar = useGuardarVacaciones()
  const quitar = useEliminarVacaciones()

  const [quien, setQuien] = useState('')
  const [dias, setDias] = useState('')

  const nombreDe = useMemo(() => {
    const m = new Map<number, string>()
    for (const e of empleados) m.set(e.id, `${e.apellidos}, ${e.nombres}`)
    return m
  }, [empleados])

  const lista = vacaciones ?? []
  const yaAnotados = new Set(lista.map((v) => v.empleado_id))

  return (
    <Card className="mt-4">
      <CardHeader
        title="Vacaciones del período"
        subtitle="Quién estuvo fuera. Los días ya los paga el salario; la casilla decide si además lleva el bono."
      />

      {puedeEditar && abierto ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 sm:max-w-xs">
            <SelectBuscable
              label="Quién"
              valor={quien}
              onCambio={setQuien}
              vacio="Elige a alguien"
              opciones={empleados
                .filter((e) => !yaAnotados.has(e.id))
                .map((e) => ({ valor: String(e.id), etiqueta: `${e.apellidos}, ${e.nombres}` }))}
            />
          </div>
          <Input
            label="Días"
            type="number"
            className="w-28"
            value={dias}
            onChange={(e) => setDias(e.target.value)}
          />
          <Button
            variant="outline"
            disabled={guardar.isPending || !quien || !(Number(dias) > 0)}
            onClick={() =>
              guardar.mutate(
                {
                  periodo_id: periodoId,
                  empleado_id: Number(quien),
                  dias: Number(dias),
                  paga_bono: false,
                },
                {
                  onSuccess: () => {
                    setQuien('')
                    setDias('')
                  },
                },
              )
            }
          >
            Anotar
          </Button>
        </div>
      ) : null}

      {lista.length === 0 ? (
        <p className="text-ink/45 mt-4 text-sm">Nadie salió de vacaciones en este período.</p>
      ) : (
        <ul className="divide-hairline mt-4 divide-y">
          {lista.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <Palmtree className="text-ink/30 size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {nombreDe.get(v.empleado_id) ?? `Ficha ${v.empleado_id}`}
                </p>
                <p className="text-ink/45 text-xs">
                  {Number(v.dias)} {Number(v.dias) === 1 ? 'día' : 'días'}
                </p>
              </div>

              {/*
                La casilla, no un interruptor global: se decide por persona y
                por período. Marcarla y recalcular añade la línea; desmarcarla
                y recalcular la quita.
              */}
              <label className="text-ink/70 flex cursor-pointer items-center gap-2 text-sm select-none">
                <input
                  type="checkbox"
                  className="accent-royal-600 size-4"
                  disabled={!puedeEditar || !abierto || guardar.isPending}
                  checked={v.paga_bono}
                  onChange={(e) =>
                    guardar.mutate({
                      periodo_id: periodoId,
                      empleado_id: v.empleado_id,
                      dias: Number(v.dias),
                      paga_bono: e.target.checked,
                      desde: v.desde,
                      hasta: v.hasta,
                      nota: v.nota,
                    })
                  }
                />
                Pagar el bono vacacional
              </label>

              {v.paga_bono ? <Chip tone="info">Lleva bono</Chip> : null}

              {puedeEditar && abierto ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 />}
                  disabled={quitar.isPending}
                  onClick={() => quitar.mutate(v.id)}
                >
                  Quitar
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p className="text-ink/45 mt-4 text-xs">
        Los días no se pagan aquí: el salario del período ya los cubre. Marcar la casilla añade
        solo el <strong>bono vacacional</strong>, y hay que <strong>recalcular</strong> para que el
        recibo lo recoja.
      </p>

      {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-3" /> : null}
      {quitar.error ? <ErrorDeCarga error={quitar.error} className="mt-3" /> : null}
    </Card>
  )
}
