import { useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Segmento } from '@/components/ui/Segmento'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { RangoDeFechas } from '@/components/RangoDeFechas'
import { SIN_RANGO, type Rango } from '@/components/rango'
import { Visor } from '@/components/Visor'
import { useEmpresa } from '@/lib/api/empresa'
import { usePerfiles } from '@/lib/api/catalogo'
import { useGruposDeSalida, type GrupoDeSalida } from '@/lib/api/inventario'
import {
  TOPE_RESUMEN,
  usePersonasDeLaEmpresa,
  useResumenDeSalidas,
  type AsientoDeResumen,
  type PersonaDeLaEmpresa,
} from '@/lib/api/salidas'
import { armarResumenSalidas } from '@/lib/ficha/resumenSalidasPdf'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { dolares, fecha, fechaHora } from '@/lib/formato'
import { useSesion } from '@/lib/sesion'
import { cn } from '@/lib/cn'
import { cantidadLegible } from './tableroSalidas'

/*
  «📊 RESUMEN» DE SALIDAS (MGG `ResumenSalidas`), 08/11/2026.

  MGG: «Gasto de material por unidad solicitante», con Desde / Hasta, PDF,
  tarjetas «Gasto total», «Salidas», «Unidades» y una barra por unidad que se
  toca para ver el detalle. Aquí la pregunta es la misma con las palabras de La
  Cantera: a qué destino (la persona, el área o cargo del organigrama, o quien
  sea de fuera) se le entregó material y cuánto valía. Se puede agrupar por
  destino o por área o cargo.

  Lo que se suma son las salidas entregadas, leídas del libro de movimientos al
  costo con el que salieron. Lo que se deshizo después no cuenta. A quien no
  ve los costos (INVENTARIO.VER_VALORACION) la base no se los manda: se dice
  «sin valorar» y se ordena por cantidad de salidas.

  Sin Excel ni correo: el repo no tiene esas salidas para este reporte.
*/

type Agrupar = 'destino' | 'area'

interface Grupo {
  clave: string
  nombre: string
  valor: number
  sinValor: number
  notas: Set<string>
  asientos: AsientoDeResumen[]
}

const SIN_DESTINO = 'Sin destino escrito'

function destinoDe(a: AsientoDeResumen, personas: PersonaDeLaEmpresa[] | undefined, grupos: GrupoDeSalida[] | undefined) {
  if (a.destinatario_empleado_id) {
    const p = personas?.find((x) => x.id === a.destinatario_empleado_id)
    return p?.nombre ?? 'Persona de la empresa'
  }
  if (a.grupo_id) return grupos?.find((g) => g.id === a.grupo_id)?.nombre ?? 'Área de la empresa'
  if (a.destino_externo) return `${a.destino_externo} (fuera de la empresa)`
  return SIN_DESTINO
}

function areaDe(a: AsientoDeResumen, personas: PersonaDeLaEmpresa[] | undefined, grupos: GrupoDeSalida[] | undefined) {
  if (a.destinatario_empleado_id) {
    const p = personas?.find((x) => x.id === a.destinatario_empleado_id)
    return p?.cargo?.trim() || 'Persona sin cargo en nómina'
  }
  if (a.grupo_id) {
    const g = grupos?.find((x) => x.id === a.grupo_id)
    if (!g) return 'Área de la empresa'
    // Un cargo cuelga de su área: «PERSONAL › CHOFERES» suma en PERSONAL.
    if (g.tipo === 'CARGO') return g.camino.split(' › ').slice(-2)[0] ?? g.nombre
    return g.nombre
  }
  if (a.destino_externo) return 'Fuera de la empresa'
  return SIN_DESTINO
}

export function ResumenSalidas() {
  const [rango, setRango] = useState<Rango>(SIN_RANGO)
  const [agrupar, setAgrupar] = useState<Agrupar>('destino')
  const [abierto, setAbierto] = useState<string | null>(null)
  const [papel, setPapel] = useState<ArchivoArmado | null>(null)
  const [armando, setArmando] = useState(false)

  const { data, isPending, error } = useResumenDeSalidas(rango)
  const { data: personas } = usePersonasDeLaEmpresa()
  const grupos = useGruposDeSalida()
  const { data: perfiles } = usePerfiles()
  const { data: empresa } = useEmpresa()
  const { nombre: yo } = useSesion()

  const nombreDe = (uid: string | null) => (uid && perfiles?.find((p) => p.id === uid)?.nombre) || '—'

  const asientos = useMemo(() => data ?? [], [data])
  const hayValor = asientos.some((a) => a.valor_usd !== null)

  const lista = useMemo(() => {
    const m = new Map<string, Grupo>()
    for (const a of asientos) {
      const nombre =
        agrupar === 'destino' ? destinoDe(a, personas, grupos.data) : areaDe(a, personas, grupos.data)
      let g = m.get(nombre)
      if (!g) {
        g = { clave: nombre, nombre, valor: 0, sinValor: 0, notas: new Set(), asientos: [] }
        m.set(nombre, g)
      }
      g.asientos.push(a)
      g.notas.add(a.nota_salida ?? a.numero)
      if (a.valor_usd === null) g.sinValor += 1
      else g.valor += Number(a.valor_usd)
    }
    return [...m.values()].sort((x, y) => y.valor - x.valor || y.notas.size - x.notas.size)
  }, [asientos, agrupar, personas, grupos.data])

  const total = lista.reduce((t, g) => t + g.valor, 0)
  const salidas = new Set(asientos.map((a) => a.nota_salida ?? a.numero)).size
  const maximo = Math.max(1, ...lista.map((g) => (hayValor ? g.valor : g.notas.size)))
  const elegido = abierto ? lista.find((g) => g.clave === abierto) : undefined
  const porQue = agrupar === 'destino' ? 'destino' : 'área o cargo'
  const valorDe = (v: number, sinValor: number) => (hayValor ? dolares(v) + (sinValor ? ' *' : '') : 'sin valorar')

  const imprimir = async () => {
    setArmando(true)
    try {
      setPapel(
        await armarResumenSalidas({
          porQue,
          alcance: [
            [
              'Periodo',
              rango.desde || rango.hasta
                ? `${rango.desde ? fecha(rango.desde) : 'sin inicio'} — ${rango.hasta ? fecha(rango.hasta) : 'hoy'}`
                : 'Todo el historial',
            ],
            ['Salidas', String(salidas)],
            [agrupar === 'destino' ? 'Destinos' : 'Áreas o cargos', String(lista.length)],
          ],
          grupos: lista.map((g) => ({
            nombre: g.nombre,
            salidas: g.notas.size,
            renglones: g.asientos.length,
            valor: valorDe(g.valor, g.sinValor),
          })),
          renglones: lista.flatMap((g) =>
            g.asientos.map((a) => ({
              fecha: fechaHora(a.registrado_en),
              nota: a.nota_salida ?? a.numero,
              grupo: g.nombre,
              articulo: a.articulo?.nombre ?? '—',
              cantidad: `${cantidadLegible(a.cantidad)} ${a.unidad}`,
              valor: a.valor_usd === null ? 'sin valorar' : dolares(a.valor_usd),
            })),
          ),
          total: hayValor ? dolares(total) : 'sin valorar',
          empresa: { razonSocial: empresa?.razon_social ?? '', rif: empresa?.rif ?? '' },
          emitidoPor: yo ?? '',
          momento: new Date(),
        }),
      )
    } finally {
      setArmando(false)
    }
  }

  return (
    <div>
      <Card className="mb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-ink/85 font-titular text-lg">Gasto de material por {porQue}</h2>
            <p className="text-ink/50 text-xs">
              Salidas entregadas, al costo con el que salieron del almacén. Lo que se deshizo después no
              cuenta.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmento
              valor={agrupar}
              onCambio={(v) => {
                setAgrupar(v as Agrupar)
                setAbierto(null)
              }}
              opciones={[
                { valor: 'destino', etiqueta: 'Por destino', pista: 'La persona, el área o quien sea de fuera' },
                { valor: 'area', etiqueta: 'Por área o cargo', pista: 'El área del organigrama o el cargo en nómina' },
              ]}
            />
            <Button
              variant="outline"
              size="sm"
              icon={<Printer />}
              disabled={armando || lista.length === 0}
              onClick={() => void imprimir()}
            >
              {armando ? 'Armando…' : '↓ PDF'}
            </Button>
          </div>
        </div>
        <div className="mt-3">
          <RangoDeFechas
            valor={rango}
            onCambio={(r) => {
              setRango(r)
              setAbierto(null)
            }}
          />
        </div>
      </Card>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && asientos.length === 0 ? (
        <Card>
          <Vacio icono={<span className="text-3xl">📊</span>} titulo="Sin salidas de material entregadas para el periodo." />
        </Card>
      ) : null}

      {data && asientos.length > 0 ? (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card>
              <p className="text-ink/50 text-xs">Gasto total</p>
              <p className="text-ink/90 font-titular mt-1 text-2xl">{hayValor ? dolares(total) : 'sin valorar'}</p>
            </Card>
            <Card>
              <p className="text-ink/50 text-xs">Salidas</p>
              <p className="text-ink/90 font-titular mt-1 text-2xl">{salidas.toLocaleString('es-VE')}</p>
            </Card>
            <Card>
              <p className="text-ink/50 text-xs">{agrupar === 'destino' ? 'Destinos' : 'Áreas o cargos'}</p>
              <p className="text-ink/90 font-titular mt-1 text-2xl">{lista.length.toLocaleString('es-VE')}</p>
            </Card>
          </div>

          {asientos.length >= TOPE_RESUMEN ? (
            <p className="text-warning mb-2 text-xs">
              Se sumaron los {TOPE_RESUMEN.toLocaleString('es-VE')} renglones más recientes: acotá las fechas para
              que el total sea exacto.
            </p>
          ) : null}
          {lista.some((g) => g.sinValor > 0) && hayValor ? (
            <p className="text-ink/50 mb-2 text-xs">* Tiene renglones sin valorar: su valor no se sumó.</p>
          ) : null}

          <Card>
            <p className="text-ink/50 mb-3 text-xs">
              Tocá un {agrupar === 'destino' ? 'destino' : 'área o cargo'} para ver el detalle de sus salidas
              (fecha, hora, nota, artículo, cantidad y monto).
            </p>
            <ul className="space-y-2">
              {lista.map((g) => {
                const medida = hayValor ? g.valor : g.notas.size
                return (
                  <li key={g.clave}>
                    <button
                      type="button"
                      onClick={() => setAbierto(abierto === g.clave ? null : g.clave)}
                      className={cn(
                        'hover:bg-ink/3 w-full rounded-[6px] px-2 py-1.5 text-left transition-colors',
                        abierto === g.clave && 'bg-royal-600/8',
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-ink/85 min-w-0 truncate font-medium">{g.nombre}</span>
                        <span className="text-ink/70 shrink-0 tabular-nums">
                          {valorDe(g.valor, g.sinValor)}
                          <span className="text-ink/40 text-xs"> · {g.notas.size} salida(s)</span>
                        </span>
                      </div>
                      <div className="bg-ink/6 mt-1 h-2 overflow-hidden rounded-full">
                        <div
                          className="bg-royal-600 h-full rounded-full"
                          style={{ width: `${Math.max(2, (medida / maximo) * 100)}%` }}
                        />
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Card>

          {elegido ? (
            <Card className="mt-4" flush>
              <div className="flex items-center justify-between gap-2 px-4 py-3">
                <h3 className="text-ink/85 text-sm font-semibold">{elegido.nombre}</h3>
                <Button size="sm" variant="ghost" onClick={() => setAbierto(null)}>
                  ✕ Cerrar
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-ink/45 border-hairline border-y text-left text-xs">
                      <th className="px-4 py-2 font-medium">Fecha / hora</th>
                      <th className="px-3 py-2 font-medium">Nota</th>
                      <th className="px-3 py-2 font-medium">Artículo</th>
                      <th className="px-3 py-2 font-medium">Registró</th>
                      <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                      <th className="px-4 py-2 text-right font-medium">Valor ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {elegido.asientos.map((a) => (
                      <tr key={a.id} className="border-hairline border-b last:border-0">
                        <td className="text-ink/60 px-4 py-2 text-xs whitespace-nowrap">{fechaHora(a.registrado_en)}</td>
                        <td className="text-ink/70 px-3 py-2 font-mono text-xs">{a.nota_salida ?? a.numero}</td>
                        <td className="text-ink/85 px-3 py-2">
                          {a.articulo?.nombre ?? '—'}
                          <span className="text-ink/40 block text-[11px]">{a.almacen?.nombre ?? ''}</span>
                        </td>
                        <td className="text-ink/60 px-3 py-2 text-xs">{nombreDe(a.registrado_por)}</td>
                        <td className="tabular text-ink/85 px-3 py-2 text-right whitespace-nowrap">
                          {cantidadLegible(a.cantidad)} {a.unidad}
                        </td>
                        <td className="tabular text-ink/85 px-4 py-2 text-right whitespace-nowrap">
                          {a.valor_usd === null ? 'sin valorar' : dolares(a.valor_usd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </>
      ) : null}

      <Visor
        abierto={papel !== null}
        onCerrar={() => setPapel(null)}
        blob={papel?.blob ?? null}
        nombreArchivo={papel?.nombre ?? ''}
        titulo="Resumen de salidas"
      />
    </div>
  )
}
