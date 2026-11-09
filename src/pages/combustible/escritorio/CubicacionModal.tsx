import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { useBorrarCubicacion, useCubicaciones, useRegistrarCubicacion } from '@/lib/api/combustible'
import { cubicarLitros, geometriaCompleta } from '@/lib/combustible/cubicacion'
import { hoyIsoVE } from '@/lib/combustible/reporteExistenciasCorte'
import { n, type TanqueGt } from '@/lib/combustible/tipos'
import { cn } from '@/lib/cn'
import { leerNumero, lt, usePermisosCombustible } from './comun'
import { Calculado } from './piezas'

/*
  📐 CUBICACIÓN (Golden Touch, CubicacionModal): medir y guardar.

  Se mete la varilla, se lee la altura del líquido en cm y salen los litros con
  la geometría del tanque; al guardar, la base vuelve a hacer la cuenta (no se
  fía de la pantalla) y anota la diferencia contra el saldo por libros. Debajo,
  el historial de mediciones del tanque.

  Golden Touch abría la del tanque elegido; aquí se puede cambiar de tanque
  dentro del modal, porque desde la grilla no hay uno elegido. Borrar una
  medición pide COMBUSTIBLE.TANQUES.
*/
export function CubicacionModal({
  tanques,
  tanqueInicial,
  onCerrar,
}: {
  tanques: TanqueGt[]
  tanqueInicial: number
  onCerrar: () => void
}) {
  const p = usePermisosCombustible()
  const medibles = tanques.filter((t) => !t.es_bidon)
  const [tanqueId, setTanqueId] = useState(String(tanqueInicial))
  const [fecha, setFecha] = useState(hoyIsoVE())
  const [altura, setAltura] = useState('')
  const [notas, setNotas] = useState('')
  const registrar = useRegistrarCubicacion()
  const borrar = useBorrarCubicacion()

  const tanque = medibles.find((t) => String(t.almacen_id) === tanqueId) ?? medibles[0]
  const historial = useCubicaciones(tanque?.almacen_id ?? null)
  const completa = tanque ? geometriaCompleta(tanque) : false
  const litros = tanque ? cubicarLitros(tanque, leerNumero(altura) ?? 0) : 0
  const libros = n(tanque?.saldo_litros)
  const dif = libros - litros

  const guardar = () => {
    if (!tanque) return
    registrar.mutate(
      { almacen_id: tanque.almacen_id, altura_cm: leerNumero(altura) ?? 0, fecha, notas: notas.trim() || null },
      {
        onSuccess: () => {
          setAltura('')
          setNotas('')
        },
      },
    )
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Cubicación · ${tanque?.nombre ?? ''}`}
      ancho="lg"
      acciones={
        <Button variant="ghost" onClick={onCerrar}>
          Cerrar
        </Button>
      }
    >
      <Select
        label="Tanque"
        value={String(tanque?.almacen_id ?? '')}
        onChange={(e) => setTanqueId(e.target.value)}
        opciones={medibles.map((t) => ({ valor: String(t.almacen_id), etiqueta: t.nombre }))}
      />
      {tanque && !completa ? (
        <div className="border-warning/40 bg-warning-soft mt-3 rounded-lg border p-3 text-sm">
          ⚠ Este tanque no tiene dimensiones cargadas. Editá el tanque (
          {tanque.tipo_geometria === 'cilindrico_horizontal' ? 'radio y largo' : 'largo y ancho'}) para poder cubicar.
        </div>
      ) : null}

      <div className="border-hairline mt-4 rounded-lg border p-3">
        <p className="text-ink/55 mb-3 text-sm">
          Tipo: <strong>{tanque?.tipo_geometria === 'cilindrico_horizontal' ? 'Cilíndrico horizontal' : 'Rectangular'}</strong>. Meté la
          varilla, leé la altura del líquido en cm y el sistema calcula los litros.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Fecha" type="date" value={fecha} max={hoyIsoVE()} onChange={(e) => setFecha(e.target.value)} />
          <Input
            label="Altura medida (cm)"
            type="number"
            inputMode="decimal"
            value={altura}
            onChange={(e) => setAltura(e.target.value)}
            placeholder="87"
          />
          <Calculado label="Litros (cubicación)" valor={altura ? lt(litros) : ''} />
          <Calculado label="Saldo por libros (L)" valor={lt(libros)} />
          <Calculado label="Diferencia (L)" valor={altura ? lt(dif) : ''} pista="Libros − cubicación." />
        </div>
        <Input className="mt-4" label="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
        <Button className="mt-3" size="sm" onClick={guardar} disabled={!completa || !altura || registrar.isPending}>
          {registrar.isPending ? 'Guardando…' : 'Guardar medición'}
        </Button>
        {registrar.error ? <ErrorDeCarga error={registrar.error} className="mt-3" /> : null}
      </div>

      {historial.isPending ? <Cargando /> : null}
      {borrar.error ? <ErrorDeCarga error={borrar.error} className="mt-3" /> : null}
      <div className="border-hairline mt-4 overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ink/50 border-hairline border-b text-left text-xs">
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 text-right font-medium">Altura (cm)</th>
              <th className="px-3 py-2 text-right font-medium">Litros</th>
              <th className="px-3 py-2 text-right font-medium">Libros</th>
              <th className="px-3 py-2 text-right font-medium">Diferencia</th>
              <th className="px-3 py-2 font-medium">Notas</th>
              {p.tanques ? <th className="px-3 py-2" /> : null}
            </tr>
          </thead>
          <tbody>
            {!(historial.data ?? []).length ? (
              <tr>
                <td colSpan={7} className="text-ink/45 px-3 py-4 text-center">
                  Sin mediciones.
                </td>
              </tr>
            ) : null}
            {(historial.data ?? []).map((c) => (
              <tr key={c.id} className="border-hairline border-b last:border-0">
                <td className="tabular px-3 py-2">{c.fecha}</td>
                <td className="tabular px-3 py-2 text-right">{lt(c.altura_cm)}</td>
                <td className="tabular text-success px-3 py-2 text-right">{lt(c.litros_cubicacion)}</td>
                <td className="tabular px-3 py-2 text-right">{lt(c.saldo_libros)}</td>
                <td className={cn('tabular px-3 py-2 text-right', Math.abs(n(c.diferencia)) > 0 && 'text-warning')}>{lt(c.diferencia)}</td>
                <td className="text-ink/60 px-3 py-2">{c.notas || '—'}</td>
                {p.tanques ? (
                  <td className="px-2 py-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Borrar esta medición"
                      disabled={borrar.isPending}
                      onClick={() => {
                        if (window.confirm('¿Borrar esta medición?')) borrar.mutate(c.id)
                      }}
                    >
                      🗑
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
