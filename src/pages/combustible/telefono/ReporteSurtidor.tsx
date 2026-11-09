import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { FotosDeCarga } from '@/components/FotosDeCarga'
import { Visor } from '@/components/Visor'
import { useLibroTanque } from '@/lib/api/combustible'
import { referenciaDeFotos } from '@/lib/api/combustibleTelefono'
import { empresaDelPapel, useEmpresa } from '@/lib/api/empresa'
import { imagenesParaPapel, useFotosDeCarga } from '@/lib/api/fotosDeCarga'
import { useMiPerfil } from '@/lib/api/usuarios'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { horaParaLeer } from '@/lib/combustible/horaMovimiento'
import { fechaCorta } from '@/lib/combustible/mensajeMovimiento'
import { cuenta, n, type MovimientoLibro, type TanqueGt, type TipoMovTanque } from '@/lib/combustible/tipos'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { armarReporteSurtidor, type GrupoDelReporte } from '@/lib/ficha/reporteSurtidorPdf'
import { fechasMal, rangoDe } from '@/pages/inventario/telefono/comun'
import { RangoDeFechas } from '@/pages/inventario/telefono/piezas'
import { ICONO, litros, tituloDeMovimiento } from './comun'
import { CampoGrande } from './piezas'

/*
  EL REPORTE DEL SURTIDOR EN EL TELÉFONO (Golden Touch, `SurtidorReporteMovil`).

  Qué pasó en un rango de fechas, agrupado por TIPO, con los litros de cada
  grupo y las FOTOS de cada movimiento. Con «↓ PDF» se arma el mismo reporte
  en papel y se abre en el visor de la casa, que lo descarga si se pide.

  Lo anulado no entra: el reporte dice qué salió y qué entró de verdad; los
  anulados y sus reversos se ven en el libro, tachados. Con «Todos los
  tanques» un traslado se cuenta una vez (por su salida), no dos.
*/

const ORDEN_TIPOS: TipoMovTanque[] = ['uso', 'traslado', 'entrada', 'merma', 'retorno']
const TITULO_TIPO: Record<TipoMovTanque, string> = {
  uso: 'Surtidos (consumo de equipos)',
  traslado: 'Traslados',
  entrada: 'Entradas (ingresos)',
  merma: 'Mermas',
  retorno: 'Retornos',
}

const ATAJOS = ['hoy', 'mes', 'mesPasado', 'd60', 'd90'] as const

/** Segunda línea: fecha, hora, tanque (si se piden todos), autorizado y observación. */
function detalleDe(m: MovimientoLibro, conTanque: boolean): string {
  const partes = [`${fechaCorta(m.fecha)}${m.hora ? ` ${horaParaLeer(m.hora)}` : ''}`]
  if (conTanque) partes.push(m.tanque)
  if (m.recibio) partes.push(`Recibió: ${m.recibio}`)
  if (m.autorizado_por) partes.push(`Aut.: ${m.autorizado_por}`)
  if (m.equipo && m.observacion && m.tipo !== 'traslado') partes.push(m.observacion)
  if (m.ubicacion) partes.push(m.ubicacion)
  return partes.join(' · ')
}

export function ReporteSurtidor({
  tanques,
  tanqueInicial,
  onCerrar,
}: {
  tanques: TanqueGt[]
  tanqueInicial: number | null
  onCerrar: () => void
}) {
  const inicio = rangoDe('mes')
  const [desde, setDesde] = useState(inicio.desde)
  const [hasta, setHasta] = useState(inicio.hasta)
  const [tanqueId, setTanqueId] = useState(tanqueInicial == null ? '' : String(tanqueInicial))
  const [armando, setArmando] = useState(false)
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const { data: empresa } = useEmpresa()
  const { data: yo } = useMiPerfil()

  const malas = fechasMal(desde, hasta)
  const libro = useLibroTanque(
    { tanqueId: tanqueId ? Number(tanqueId) : null, desde, hasta, porPagina: 2000, recientesPrimero: true },
    !malas,
  )
  const fotos = useFotosDeCarga('COMBUSTIBLE')

  const todos = tanqueId === ''
  const movs = useMemo(
    () =>
      (libro.data?.filas ?? []).filter(
        (m) =>
          cuenta(m) &&
          (ORDEN_TIPOS as string[]).includes(m.tipo) &&
          // Con todos los tanques, el traslado se cuenta por su salida.
          !(todos && m.tipo === 'traslado' && m.signo === 1),
      ),
    [libro.data, todos],
  )

  const fotosDe = useMemo(() => {
    const mapa = new Map<string, NonNullable<typeof fotos.data>>()
    for (const f of fotos.data ?? []) {
      if (f.quitada_en) continue
      const l = mapa.get(f.referencia) ?? []
      l.push(f)
      mapa.set(f.referencia, l)
    }
    return (m: MovimientoLibro) => mapa.get(referenciaDeFotos(m)) ?? []
  }, [fotos.data])

  const grupos = useMemo(
    () =>
      ORDEN_TIPOS.map((tipo) => {
        const lista = movs.filter((m) => m.tipo === tipo)
        return {
          tipo,
          lista,
          litros: lista.reduce((s, m) => s + n(m.litros), 0),
          fotos: lista.reduce((s, m) => s + fotosDe(m).length, 0),
        }
      }).filter((g) => g.lista.length > 0),
    [movs, fotosDe],
  )

  const nombreTanque = todos
    ? 'Todos los tanques'
    : (tanques.find((t) => String(t.almacen_id) === tanqueId)?.nombre ?? '—')

  async function armarPdf() {
    setArmando(true)
    try {
      const gruposPdf: GrupoDelReporte[] = []
      // De uno en uno: veinte descargas del almacén a la vez se rechazan a medias.
      for (const g of grupos) {
        const movimientos = []
        for (const m of g.lista) {
          const adj = fotosDe(m)
          movimientos.push({
            titulo: tituloDeMovimiento(m),
            detalle: detalleDe(m, todos),
            litros: litros(m.litros),
            imagenes: await imagenesParaPapel(adj),
            otros: adj.filter((f) => !(f.tipo ?? '').startsWith('image/')).map((f) => f.nombre ?? 'archivo'),
          })
        }
        gruposPdf.push({
          titulo: TITULO_TIPO[g.tipo as TipoMovTanque],
          cantidad: g.lista.length,
          litros: litros(g.litros),
          fotos: g.fotos,
          movimientos,
        })
      }
      setPdf(
        await armarReporteSurtidor({
          empresa: empresaDelPapel(empresa),
          tanque: nombreTanque,
          desde,
          hasta,
          grupos: gruposPdf,
          total: {
            cantidad: movs.length,
            litros: litros(grupos.reduce((s, g) => s + g.litros, 0)),
            fotos: grupos.reduce((s, g) => s + g.fotos, 0),
          },
          emitidoPor: yo?.nombre ?? '',
          momento: new Date(),
        }),
      )
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo generar el PDF'), 'error')
    } finally {
      setArmando(false)
    }
  }

  return (
    <>
      <Modal
        abierto
        onCerrar={onCerrar}
        titulo="📊 Reporte con fotos"
        ancho="lg"
        acciones={
          <div className="grid w-full gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              size="lg"
              className="h-14 w-full"
              disabled={libro.isPending || armando || movs.length === 0}
              onClick={() => void armarPdf()}
            >
              {armando ? 'Armando el PDF…' : '↓ PDF (vista previa)'}
            </Button>
            <Button size="lg" className="h-14 w-full" onClick={onCerrar}>
              Cerrar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <RangoDeFechas
            atajos={[...ATAJOS]}
            desde={desde}
            hasta={hasta}
            onCambiar={(a, b) => {
              setDesde(a)
              setHasta(b)
            }}
          />
          <CampoGrande>
            <Select
              label="Tanque"
              value={tanqueId}
              onChange={(e) => setTanqueId(e.target.value)}
              opciones={[
                { valor: '', etiqueta: 'Todos los tanques' },
                ...tanques.map((t) => ({ valor: String(t.almacen_id), etiqueta: t.nombre })),
              ]}
            />
          </CampoGrande>

          {libro.isPending && !malas ? <Cargando texto="Armando el reporte…" /> : null}
          {libro.error ? <ErrorDeCarga error={libro.error} /> : null}
          {!libro.isPending && !malas && grupos.length === 0 ? (
            <p className="text-ink/55 py-6 text-center text-sm">📊 Sin movimientos en ese rango.</p>
          ) : null}

          {grupos.map((g) => (
            <section key={g.tipo}>
              <h3 className="border-royal-600 mb-2 flex items-center justify-between gap-2 border-b-2 pb-1 text-[0.95rem] font-bold">
                <span>
                  {ICONO[g.tipo]} {TITULO_TIPO[g.tipo as TipoMovTanque]}
                </span>
                <span className="tabular font-mono">
                  {g.lista.length} · {litros(g.litros)} L
                </span>
              </h3>
              {g.lista.map((m) => (
                <div key={m.id} className="border-hairline bg-surface rounded-card mb-2 border p-3">
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="min-w-0">
                      <div className="text-ink/90 truncate font-bold">{tituloDeMovimiento(m)}</div>
                      <div className="text-ink/55 text-xs">{detalleDe(m, todos)}</div>
                    </div>
                    <span className="tabular shrink-0 font-mono font-extrabold whitespace-nowrap">
                      {litros(m.litros)} L
                    </span>
                  </div>
                  {fotosDe(m).length > 0 ? (
                    <FotosDeCarga
                      origen="COMBUSTIBLE"
                      referencia={referenciaDeFotos(m)}
                      puedeAnadir={false}
                      etiqueta="Fotos"
                    />
                  ) : (
                    <p className="text-ink/45 mt-1 text-xs">Sin fotos</p>
                  )}
                </div>
              ))}
            </section>
          ))}
          {(libro.data?.total ?? 0) > 2000 ? (
            <p className="text-warning text-sm">
              El rango tiene más de 2000 renglones: se ven los 2000 más recientes. Acortá las fechas.
            </p>
          ) : null}
        </div>
      </Modal>

      <Visor
        abierto={pdf !== null}
        onCerrar={() => setPdf(null)}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ''}
        titulo="Reporte del surtidor"
      />
    </>
  )
}
