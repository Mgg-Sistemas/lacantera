import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { calcularCubicacion, geometriaCompleta, tablaVarilla } from '@/lib/combustible/cubicacion'
import { n, type TanqueGt } from '@/lib/combustible/tipos'
import { leerNumero, lt } from './comun'
import { BarraNivel } from './piezas'

/*
  📐 CALCULADORA DE CUBICACIÓN (Golden Touch, CalculadoraCubicacionModal).

  La hoja CALCULADORA del Excel «CUBICACIÓN TANQUES»: se elige el tanque, se
  escribe la altura de la varilla en cm y salen los litros, el nivel y el
  estado. No guarda nada (para guardar una medición está 📐 Cubicación). Con
  las medidas de la ficha de cada tanque, no las fijas de Golden Touch.

  Es la de la PC. La del teléfono la hace otra fase
  (`src/pages/combustible/CalculadoraCubicacion.tsx`); esta vive aparte para
  no pisarse.
*/
export function CalculadoraCubicacion({
  tanques,
  tanqueInicial,
  onCerrar,
}: {
  tanques: TanqueGt[]
  tanqueInicial: number | null
  onCerrar: () => void
}) {
  const medibles = tanques.filter((t) => !t.es_bidon)
  const primero = medibles.find((t) => t.almacen_id === tanqueInicial) ?? medibles.find((t) => geometriaCompleta(t)) ?? medibles[0]
  const [tanqueId, setTanqueId] = useState(primero ? String(primero.almacen_id) : '')
  const [altura, setAltura] = useState('0')
  const [verTabla, setVerTabla] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const tanque = medibles.find((t) => String(t.almacen_id) === tanqueId)
  const cm = Math.max(0, leerNumero(altura) ?? 0)
  const res = tanque ? calcularCubicacion(tanque, cm) : null
  const completa = tanque ? geometriaCompleta(tanque) : false
  const tabla = useMemo(() => (tanque && verTabla && completa ? tablaVarilla(tanque) : []), [tanque, verTabla, completa])

  const sumar = (d: number) => setAltura(String(Math.max(0, Math.round((cm + d) * 100) / 100)))

  const copiar = async () => {
    if (!tanque || !res) return
    const texto = [
      `📐 Cubicación · ${tanque.nombre}`,
      `Altura: ${lt(res.alturaCm)} cm`,
      `Volumen: ${lt(res.volumenLitros)} L (${lt(res.volumenM3)} m³)`,
      `Nivel: ${lt(res.nivelPct * 100)} % de ${lt(res.capacidadLitros)} L`,
      `Saldo por libros: ${lt(tanque.saldo_litros)} L`,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      /* sin portapapeles: no pasa nada */
    }
  }

  const tonoEstado = res?.estado === 'NORMAL' ? 'success' : res?.estado === 'LLENO AL 100%' ? 'warning' : 'danger'

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="📐 Calculadora de cubicación"
      ancho="md"
      acciones={
        <>
          <Button variant="ghost" onClick={() => void copiar()} disabled={!res} title="Copiar resumen en texto para WhatsApp o notas">
            {copiado ? '✓ Copiado' : '📋 Copiar resumen'}
          </Button>
          <Button variant="ghost" onClick={onCerrar}>
            Cerrar
          </Button>
        </>
      }
    >
      <Select
        label="Tanque"
        value={tanqueId}
        onChange={(e) => setTanqueId(e.target.value)}
        opciones={medibles.map((t) => ({ valor: String(t.almacen_id), etiqueta: `${t.nombre}${geometriaCompleta(t) ? '' : ' · sin medidas'}` }))}
      />
      {tanque && !completa ? (
        <p className="text-warning mt-2 text-sm">
          ⚠ Este tanque no tiene medidas cargadas ({tanque.tipo_geometria === 'cilindrico_horizontal' ? 'radio y largo' : 'largo y ancho'}).
          Cargalas con ✎ en su tarjeta.
        </p>
      ) : null}

      <div className="mt-4">
        <Input
          label="Altura del líquido (cm)"
          type="number"
          inputMode="decimal"
          value={altura}
          onChange={(e) => setAltura(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {[-10, -5, -1, 1, 5, 10].map((d) => (
            <Button key={d} size="sm" variant="ghost" onClick={() => sumar(d)} title={`${d > 0 ? 'Sumar' : 'Restar'} ${Math.abs(d)} cm`}>
              {d > 0 ? `+${d}` : d}
            </Button>
          ))}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setAltura('0')} title="Poner en 0 cm">
            0 cm
          </Button>
        </div>
      </div>

      {res && tanque ? (
        <div className="border-royal-600 mt-4 rounded-lg border-2 p-4 text-center">
          <p className="tabular text-royal-700 dark:text-royal-300 text-4xl font-extrabold">{lt(res.volumenLitros)}</p>
          <p className="text-ink/55 text-sm font-semibold tracking-wide">LITROS</p>
          <BarraNivel pct={res.nivelPct * 100} />
          <div className="text-ink/70 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
            <span>
              Nivel de llenado: <strong>{lt(res.nivelPct * 100)} %</strong>
            </span>
            <span>
              Capacidad 100%: <strong>{lt(res.capacidadLitros)} L</strong>
            </span>
            <span>
              Volumen: <strong>{lt(res.volumenM3)} m³</strong>
            </span>
          </div>
          <div className="mt-2">
            <Chip tone={tonoEstado}>{res.estado}</Chip>
          </div>
          <p className="text-ink/50 mt-3 text-xs">
            Altura 100%: {lt(res.alturaTotalCm)} cm · Geometría:{' '}
            {tanque.tipo_geometria === 'cilindrico_horizontal'
              ? `cilíndrico horizontal (R ${lt(tanque.radio_m)} m · L ${lt(tanque.largo_m)} m)`
              : `rectangular (${lt(tanque.largo_m)} × ${lt(tanque.ancho_m)} × ${lt(tanque.alto_m)} m)`}{' '}
            · Saldo por libros: {lt(n(tanque.saldo_litros))} L
          </p>
        </div>
      ) : null}

      {completa ? (
        <button type="button" className="text-info mt-3 text-sm font-medium" onClick={() => setVerTabla((v) => !v)}>
          {verTabla ? '▾ Ocultar la tabla de la varilla' : '▸ Ver la tabla de la varilla (cm → litros)'}
        </button>
      ) : null}
      {verTabla && tabla.length ? (
        <div className="border-hairline mt-2 max-h-64 overflow-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-ink/50 border-hairline border-b text-left">
                <th className="px-2 py-1.5 font-medium">cm</th>
                <th className="px-2 py-1.5 text-right font-medium">Litros</th>
                <th className="px-2 py-1.5 text-right font-medium">% Lleno</th>
              </tr>
            </thead>
            <tbody>
              {tabla.map((f) => (
                <tr key={f.cm} className="border-hairline border-b last:border-0">
                  <td className="tabular px-2 py-1">{f.cm}</td>
                  <td className="tabular px-2 py-1 text-right">{lt(f.litros)}</td>
                  <td className="tabular px-2 py-1 text-right">{lt(f.pct * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Modal>
  )
}
