import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Cargando, Vacio } from '@/components/ui/Estado'
import { Modal } from '@/components/ui/Modal'
import { useLibroTanque } from '@/lib/api/combustible'
import { restarDiasIso } from '@/lib/combustible/reporteExistenciasCorte'
import type { MovimientoLibro, TanqueGt } from '@/lib/combustible/tipos'
import { iconoTanque, nombreMes, usePermisosCombustible } from './comun'
import { MiniSelect } from './piezas'
import { RegistroMovimientos } from './RegistroMovimientos'
import { TanqueCard } from './Tarjetas'

/*
  📚 HISTÓRICO DE MOVIMIENTOS (Golden Touch, HistoricoMovimientosModal).

  Tarjetas de tanques → al elegir uno, sus movimientos de los meses ANTERIORES
  al actual, uno por mes, con la misma tabla, filtros y reportes. El mes en
  curso no está aquí: vive en el detalle del tanque. Nada se reinicia al
  cambiar de mes —saldo, horómetro y contador siguen encadenados—: es solo una
  vista del mismo libro partida por mes. Aquí están también los vales viejos
  que antes se veían en «Últimos despachos».
*/
export function HistoricoModal({
  tanques,
  mesActual,
  onVer,
  onCerrar,
}: {
  tanques: TanqueGt[]
  mesActual: string
  onVer: (m: MovimientoLibro) => void
  onCerrar: () => void
}) {
  const p = usePermisosCombustible()
  const [tanqueId, setTanqueId] = useState<number | null>(null)
  const [mes, setMes] = useState('')
  const tanque = tanques.find((t) => t.almacen_id === tanqueId) ?? null

  const libro = useLibroTanque(
    { tanqueId, hasta: restarDiasIso(`${mesActual}-01`, 1), porPagina: 20000 },
    tanqueId != null,
  )
  const movs = useMemo(() => libro.data?.filas ?? [], [libro.data])
  const meses = useMemo(
    () => Array.from(new Set(movs.map((m) => m.fecha.slice(0, 7)))).sort().reverse(),
    [movs],
  )

  // Se conserva el mes que se mira si sigue existiendo; si no, el más reciente.
  useEffect(() => {
    setMes((prev) => (prev && meses.includes(prev) ? prev : (meses[0] ?? '')))
  }, [meses])

  const movsMes = useMemo(() => movs.filter((m) => m.fecha.slice(0, 7) === mes), [movs, mes])

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="📚 Histórico de Movimientos"
      ancho="xl"
      acciones={
        <Button variant="ghost" onClick={onCerrar}>
          Cerrar
        </Button>
      }
    >
      {!tanque ? (
        <>
          <p className="text-ink/55 mb-4 text-sm">
            Elegí un tanque para ver sus movimientos de meses anteriores, agrupados por mes.
          </p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
            {tanques.map((t) => (
              <TanqueCard key={t.almacen_id} t={t} veValor={p.veValor} puedeEditar={false} onClick={() => setTanqueId(t.almacen_id)} />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Button size="sm" variant="ghost" onClick={() => setTanqueId(null)}>
              ← Tanques
            </Button>
            <h3 className="text-ink/85 text-base font-semibold">
              {iconoTanque(tanque)} {tanque.nombre}
            </h3>
            {meses.length ? (
              <label className="text-ink/55 inline-flex items-center gap-1.5 text-sm">
                Mes
                <MiniSelect value={mes} onChange={setMes} opciones={meses.map((m) => ({ valor: m, etiqueta: nombreMes(m) }))} />
              </label>
            ) : null}
          </div>
          {libro.isPending ? (
            <Cargando />
          ) : !meses.length ? (
            <Vacio icono={<span className="text-3xl">📚</span>} titulo="Este tanque aún no tiene meses anteriores en el histórico." />
          ) : (
            <RegistroMovimientos
              tanque={tanque}
              movs={movsMes}
              titulo={`Movimientos · ${nombreMes(mes)}`}
              vacio="Sin movimientos en este mes."
              error={libro.error}
              veValor={p.veValor}
              onVer={onVer}
            />
          )}
        </>
      )}
    </Modal>
  )
}
