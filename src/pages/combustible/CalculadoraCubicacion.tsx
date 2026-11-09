import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/lib/avisosFlotantes'
import { calcularCubicacion, geometriaCompleta, tablaVarilla } from '@/lib/combustible/cubicacion'
import { n, type TanqueGt } from '@/lib/combustible/tipos'
import { copiarAlPortapapeles } from '@/lib/ficha/reporteDiario'
import { cn } from '@/lib/cn'

/*
  LA CALCULADORA DE CUBICACIÓN (Golden Touch, `CalculadoraCubicacionModal`).

  Se elige el tanque, se pone la altura que marca la varilla en centímetros y
  sale al instante el volumen en litros y m³, el % de llenado con su barra, el
  estado y el tabulador de la varilla. La usan el teléfono del surtidor
  (📐 Calculadora cubicación) y el módulo de la PC: por eso vive aquí, y no
  dentro de ninguno de los dos.

  Lo de aquí: Golden Touch traía escritas las medidas de sus cuatro tanques.
  Aquí no (decisión de la dueña): cada tanque usa las de su ficha, y si su
  ficha no las tiene, se dice —«Falta la medida del tanque»— en vez de
  inventar un número. La cuenta es la de `src/lib/combustible/cubicacion.ts`,
  la misma que hace la base al guardar una medición.

  No guarda nada: es una calculadora. La medición que queda en el libro se
  registra desde «📐 Cubicación» en la PC.
*/

const fmt = (v: number, dec = 2) =>
  (Number(v) || 0).toLocaleString('es-VE', { minimumFractionDigits: dec, maximumFractionDigits: dec })

const ATAJOS = [-10, -5, -1, 1, 5, 10]

export function CalculadoraCubicacion({
  abierto,
  onCerrar,
  tanques,
  tanqueInicial,
}: {
  abierto: boolean
  onCerrar: () => void
  tanques: TanqueGt[]
  /** El tanque con el que abre (almacen_id); si no, el primero. */
  tanqueInicial?: number | null
}) {
  const visibles = useMemo(() => tanques.filter((t) => t.activo && !t.es_bidon), [tanques])
  const [elegidoId, setElegidoId] = useState<number | null>(tanqueInicial ?? null)
  const [altura, setAltura] = useState('10')
  const [verTabla, setVerTabla] = useState(false)
  const [filtro, setFiltro] = useState('')

  const tanque = visibles.find((t) => t.almacen_id === elegidoId) ?? visibles[0] ?? null
  const completa = tanque ? geometriaCompleta(tanque) : false
  const alturaNum = Math.max(0, Number(altura.replace(',', '.')) || 0)
  const res = useMemo(
    () => (tanque && completa ? calcularCubicacion(tanque, alturaNum) : null),
    [tanque, completa, alturaNum],
  )

  const tabla = useMemo(
    () => (verTabla && tanque && completa ? tablaVarilla(tanque) : []),
    [verTabla, tanque, completa],
  )
  const tablaFiltrada = useMemo(() => {
    const f = filtro.trim()
    if (!f) return tabla
    return tabla.filter((r) => String(r.cm).includes(f) || fmt(r.litros).includes(f))
  }, [tabla, filtro])

  const sumar = (d: number) =>
    setAltura((prev) => String(Math.max(0, Math.round(((Number(prev.replace(',', '.')) || 0) + d) * 10) / 10)))

  const copiar = async () => {
    if (!tanque || !res) return
    const texto = `${tanque.nombre} · Altura: ${fmt(res.alturaCm, 1)} cm (${fmt(res.alturaM, 2)} m) · Volumen: ${fmt(res.volumenLitros)} L (${fmt(res.nivelPct * 100, 1)} %) · Estado: ${res.estado}`
    const ok = await copiarAlPortapapeles(texto)
    toast(ok ? 'Cubicación copiada' : 'No se pudo copiar', ok ? 'success' : 'error')
  }

  const pct = res ? Math.min(100, Math.max(0, res.nivelPct * 100)) : 0
  const tono = !res ? 'royal' : res.nivelPct > 1 ? 'danger' : res.nivelPct >= 0.9 ? 'warning' : 'royal'
  const COLOR: Record<string, { borde: string; texto: string; barra: string }> = {
    royal: { borde: 'border-royal-600', texto: 'text-royal-700 dark:text-royal-300', barra: 'bg-royal-600' },
    warning: { borde: 'border-warning', texto: 'text-warning', barra: 'bg-warning' },
    danger: { borde: 'border-danger', texto: 'text-danger', barra: 'bg-danger' },
  }
  const c = COLOR[tono]
  const saldo = tanque ? n(tanque.saldo_litros) : 0

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="📐 Calculadora de cubicación"
      ancho="lg"
      acciones={
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="outline" size="lg" className="h-14" disabled={!res} onClick={() => void copiar()}>
            📋 Copiar resultado
          </Button>
          <Button size="lg" className="h-14" onClick={onCerrar}>
            Cerrar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-ink/55 mb-1.5 text-xs font-bold tracking-[0.06em] uppercase">1. Elegí el tanque</p>
          {visibles.length === 0 ? (
            <p className="text-ink/55 text-sm">No hay tanques activos.</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2">
              {visibles.map((t) => {
                const activo = t.almacen_id === tanque?.almacen_id
                const conMedida = geometriaCompleta(t)
                const cap = n(t.capacidad_litros) || n(t.capacidad_calculada_litros)
                return (
                  <button
                    key={t.almacen_id}
                    type="button"
                    onClick={() => setElegidoId(t.almacen_id)}
                    className={cn(
                      'rounded-card min-h-14 border px-3 py-2.5 text-left transition-colors',
                      activo ? 'border-royal-600 bg-royal-600/10 border-2' : 'border-ink/20 bg-surface',
                    )}
                  >
                    <div className="text-ink/90 text-[0.95rem] font-bold">{t.nombre}</div>
                    <div className="text-ink/55 text-xs">
                      {conMedida ? (cap > 0 ? `${fmt(cap, 0)} L al 100 %` : 'con medidas') : 'falta la medida'}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {tanque && !completa ? (
          <div className="border-warning/40 bg-warning-soft rounded-card text-ink/85 border p-4 text-sm leading-snug">
            <p className="text-base font-bold">📐 Falta la medida del tanque</p>
            <p className="mt-1">
              «{tanque.nombre}» no tiene cargadas sus medidas (
              {tanque.tipo_geometria === 'cilindrico_horizontal' ? 'radio y largo' : 'largo, ancho y alto'}). Sin
              ellas no se puede pasar la altura de la varilla a litros. Se cargan en la ficha del tanque, desde el
              módulo de Combustible en la PC.
            </p>
          </div>
        ) : null}

        {tanque && completa && res ? (
          <>
            <div className="border-hairline bg-ink/3 rounded-card border p-4">
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <label htmlFor="calc-altura" className="text-ink/80 text-sm font-bold uppercase">
                  2. Altura leída en la varilla (cm)
                </label>
                <span className="text-ink/55 text-xs">
                  = <strong className="text-ink/85">{fmt(res.alturaM, 2)} m</strong>
                </span>
              </div>
              <div className="flex items-center gap-2 [&_input]:h-16 [&_input]:text-center [&_input]:font-mono [&_input]:text-[1.6rem] [&_input]:font-bold">
                <Input
                  id="calc-altura"
                  label="Altura en centímetros"
                  ocultarEtiqueta
                  type="number"
                  inputMode="decimal"
                  limite={{ maxDecimales: 1, sinNegativos: true }}
                  value={altura}
                  onChange={(e) => setAltura(e.target.value)}
                  placeholder="Ej: 85"
                />
                <span className="text-ink/55 text-lg font-bold">cm</span>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
                {ATAJOS.map((d) => (
                  <Button key={d} variant="outline" className="h-12" onClick={() => sumar(d)}>
                    {d > 0 ? `+${d}` : d}
                  </Button>
                ))}
                <Button variant="ghost" className="h-12" onClick={() => setAltura('0')}>
                  Limpiar
                </Button>
              </div>
            </div>

            <div className={cn('bg-surface rounded-card border-2 p-4', c.borde)}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-ink/55 text-xs font-extrabold tracking-[0.05em] uppercase">
                  Volumen calculado (cubicación)
                </span>
                <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-extrabold', c.borde, c.texto)}>
                  {res.estado}
                </span>
              </div>
              <div className="flex flex-wrap items-baseline gap-2.5">
                <span className={cn('font-mono text-[2.4rem] leading-none font-black', c.texto)}>
                  {fmt(res.volumenLitros)}
                </span>
                <span className="text-ink/55 text-xl font-bold">LITROS</span>
                <span className="text-ink/50 ml-auto">≈ {fmt(res.volumenM3, 3)} m³</span>
              </div>
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs">
                  <span>
                    Nivel de llenado: <strong>{fmt(res.nivelPct * 100, 1)} %</strong>
                  </span>
                  <span>
                    Capacidad 100 %: <strong>{fmt(res.capacidadLitros, 0)} L</strong>
                  </span>
                </div>
                <div className="bg-ink/8 h-3.5 w-full overflow-hidden rounded-full">
                  <div className={cn('h-full rounded-full transition-[width]', c.barra)} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="border-hairline mt-4 grid grid-cols-1 gap-1.5 border-t pt-3 text-xs sm:grid-cols-3">
                <div>
                  <span className="text-ink/55">Altura 100 %:</span>{' '}
                  <strong>
                    {fmt(res.alturaTotalCm, 0)} cm ({fmt(res.alturaTotalCm / 100, 2)} m)
                  </strong>
                </div>
                <div>
                  <span className="text-ink/55">Geometría:</span>{' '}
                  <strong>{tanque.tipo_geometria === 'cilindrico_horizontal' ? 'Cilíndrico' : 'Rectangular'}</strong>
                </div>
                <div>
                  <span className="text-ink/55">En libros hoy:</span> <strong>{fmt(saldo)} L</strong>
                  <span className="text-ink/55">
                    {' '}
                    (dif. {res.volumenLitros - saldo >= 0 ? '+' : ''}
                    {fmt(res.volumenLitros - saldo)} L)
                  </span>
                </div>
              </div>
            </div>

            <div>
              <Button variant="ghost" className="h-12 w-full" onClick={() => setVerTabla((v) => !v)}>
                {verTabla ? '▲ Ocultar tabulador de varilla' : '▼ 📋 Ver tabulador de varilla (cm → litros)'}
              </Button>
              {verTabla ? (
                <div className="border-hairline bg-surface rounded-card mt-2 border p-3">
                  <Input
                    label="Buscar en el tabulador"
                    ocultarEtiqueta
                    sinNormalizar
                    type="search"
                    placeholder="Buscar cm o litros…"
                    value={filtro}
                    onChange={(e) => setFiltro(e.target.value)}
                  />
                  <div className="mt-2 max-h-56 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="text-ink/55 text-xs uppercase">
                        <tr>
                          <th className="py-1 text-center">cm</th>
                          <th className="py-1 text-right">Litros</th>
                          <th className="py-1 text-right">% lleno</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tablaFiltrada.slice(0, 400).map((f) => {
                          const actual = f.cm === Math.round(alturaNum)
                          return (
                            <tr
                              key={f.cm}
                              onClick={() => setAltura(String(f.cm))}
                              className={cn(
                                'border-hairline cursor-pointer border-t',
                                actual && 'bg-royal-600/12 font-bold',
                              )}
                            >
                              <td className="py-2 text-center font-mono">{f.cm}</td>
                              <td className="py-2 text-right font-mono">{fmt(f.litros, 1)} L</td>
                              <td className="py-2 text-right font-mono">{fmt(f.pct * 100, 1)} %</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  )
}
