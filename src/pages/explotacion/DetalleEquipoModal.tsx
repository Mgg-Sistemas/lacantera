import { useMemo, useState } from 'react'
import { Ban, Check, Download, Pencil, Printer, Truck, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { Visor } from '@/components/Visor'
import {
  CARGA_DEL_VIAJE,
  ESTADO_VIAJE,
  esFechaIso,
  lunesDeSemana,
  puedoDecidirViaje,
  sumarDiasIso,
  useAcarreosDeEquipoEntre,
  useAnularAcarreo,
  useAprobarViajes,
  useComoApruebo,
  useCorregirAcarreo,
  useDevolverViajes,
  useRechazarViajes,
  type Acarreo,
  type EquipoAcarreo,
} from '@/lib/api/acarreos'
import { useMiFirma } from '@/lib/api/firmas'
import { empresaDelPapel, useEmpresa } from '@/lib/api/empresa'
import { descargarCsv } from '@/lib/api/libros'
import { armarViajesDeEquipo } from '@/lib/ficha/viajesPdf'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { useSesion } from '@/lib/sesion'
import { useMisPermisos } from '@/lib/api/usuarios'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { dolares, enteros, fecha as fmtFecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

type AlcanceModal = 'dia' | 'semana' | 'mes' | 'rango'

function Cifra({ valor, comoDinero = false }: { valor: string | null; comoDinero?: boolean }) {
  if (valor === null) return <span className="text-ink/25">—</span>
  return <>{comoDinero ? dolares(valor) : enteros(valor)}</>
}

export function DetalleEquipoModal({
  equipo,
  fechaBase,
  alcanceInicial = 'dia',
  rangoInicial,
  onCerrar,
}: {
  equipo: EquipoAcarreo
  fechaBase: string
  alcanceInicial?: AlcanceModal
  rangoInicial?: { desde: string; hasta: string }
  onCerrar: () => void
}) {
  const hoy = hoyEnCaracas()
  const lunesBase = lunesDeSemana(fechaBase)
  const domingoBase = sumarDiasIso(lunesBase, 6)
  const primeroMes = `${fechaBase.slice(0, 8)}01`

  const [alcance, setAlcance] = useState<AlcanceModal>(alcanceInicial)
  const [desdeLibre, setDesdeLibre] = useState(rangoInicial?.desde ?? lunesBase)
  const [hastaLibre, setHastaLibre] = useState(
    rangoInicial?.hasta ?? (domingoBase > hoy ? hoy : domingoBase),
  )
  const [filtroRuta, setFiltroRuta] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')

  const [anulando, setAnulando] = useState<Acarreo | null>(null)
  const [corrigiendo, setCorrigiendo] = useState<Acarreo | null>(null)
  const [devolviendo, setDevolviendo] = useState<Acarreo | null>(null)
  const [rechazando, setRechazando] = useState<Acarreo | null>(null)
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)

  const periodo = useMemo(() => {
    if (alcance === 'dia') return { desde: fechaBase, hasta: fechaBase }
    if (alcance === 'semana') {
      if (rangoInicial) return rangoInicial
      return { desde: lunesBase, hasta: domingoBase > hoy ? hoy : domingoBase }
    }
    if (alcance === 'mes') {
      const finMes = fechaBase.slice(0, 7) === hoy.slice(0, 7) ? hoy : fechaBase
      return { desde: primeroMes, hasta: finMes }
    }
    return { desde: desdeLibre, hasta: hastaLibre }
  }, [alcance, fechaBase, rangoInicial, lunesBase, domingoBase, hoy, primeroMes, desdeLibre, hastaLibre])

  const viajesQ = useAcarreosDeEquipoEntre(periodo.desde, periodo.hasta, equipo)
  const comoApruebo = useComoApruebo()
  const aprobar = useAprobarViajes()
  const { data: miFirma } = useMiFirma()
  const { puede } = useMisPermisos()
  const { data: laEmpresa } = useEmpresa()
  const { nombre: yo } = useSesion()

  const todos = useMemo(() => viajesQ.data ?? [], [viajesQ.data])
  const unSoloDia = periodo.desde === periodo.hasta

  const rutasDisponibles = useMemo(
    () => [...new Set(todos.map((v) => v.tramo_dice))].sort(),
    [todos],
  )

  const visibles = useMemo(
    () =>
      todos.filter((v) => {
        if (filtroRuta && v.tramo_dice !== filtroRuta) return false
        if (filtroEstado === 'CONTADOS' && v.estado !== 'APROBADO' && v.estado !== 'REGISTRADO')
          return false
        if (filtroEstado === 'POR_APROBAR' && v.estado !== 'POR_APROBAR') return false
        if (filtroEstado === 'DESCARTADOS' && v.estado !== 'ANULADO' && v.estado !== 'RECHAZADO')
          return false
        return true
      }),
    [todos, filtroRuta, filtroEstado],
  )

  const resumen = useMemo(() => {
    const vivos = visibles.filter((v) => v.estado === 'APROBADO' || v.estado === 'REGISTRADO')
    const porAprobar = visibles.filter((v) => v.estado === 'POR_APROBAR')
    const decidibles = porAprobar.filter((v) => puedoDecidirViaje(comoApruebo.data, v))
    const conM3 = vivos.filter((v) => v.carga_m3 !== null)
    const totalM3 = conM3.reduce((s, v) => s + Number(v.carga_m3 ?? 0), 0)
    const hayDinero = vivos.some((v) => v.precio_usd !== null)
    const totalUsd = vivos.reduce((s, v) => s + Number(v.precio_usd ?? 0), 0)

    const mapaRutas = new Map<
      string,
      { ruta: string; viajes: number; porAprobar: number; m3: number; conM3: boolean; usd: number }
    >()
    for (const v of visibles) {
      if (v.estado === 'ANULADO' || v.estado === 'RECHAZADO') continue
      const item = mapaRutas.get(v.tramo_dice) ?? {
        ruta: v.tramo_dice,
        viajes: 0,
        porAprobar: 0,
        m3: 0,
        conM3: false,
        usd: 0,
      }
      if (v.estado === 'POR_APROBAR') {
        item.porAprobar += 1
      } else {
        item.viajes += 1
        if (v.carga_m3 !== null) {
          item.m3 += Number(v.carga_m3)
          item.conM3 = true
        }
        if (v.precio_usd !== null) item.usd += Number(v.precio_usd)
      }
      mapaRutas.set(v.tramo_dice, item)
    }

    return {
      vivos: vivos.length,
      porAprobar: porAprobar.length,
      decidiblesIds: decidibles.map((v) => v.id),
      conM3: conM3.length > 0,
      totalM3,
      hayDinero,
      totalUsd,
      porRuta: [...mapaRutas.values()].sort((a, b) => b.viajes - a.viajes),
    }
  }, [visibles, comoApruebo.data])

  const imprimirPdf = async () => {
    setPdf(
      await armarViajesDeEquipo({
        desde: periodo.desde,
        hasta: periodo.hasta,
        placa: equipo.placa,
        nombre: equipo.nombre,
        compania: equipo.compania,
        chofer: equipo.chofer,
        cargaUtilM3: equipo.cargaUtilM3,
        viajes: visibles.map((v) => ({
          fecha: v.fecha,
          secuencia: v.secuencia,
          ruta: v.tramo_dice,
          hora: v.hora,
          carga: v.carga ? CARGA_DEL_VIAJE[v.carga].texto : '—',
          m3: v.carga_m3,
          precio_usd: v.precio_usd,
          estado: v.estado,
        })),
        empresa_papel: empresaDelPapel(laEmpresa),
        emitidoPor: yo ?? '',
        momento: new Date(),
      }),
    )
  }

  const exportarCsv = () => {
    const placaLimpia = equipo.placa.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    descargarCsv(
      `acarreos-${placaLimpia}-${periodo.desde}_a_${periodo.hasta}.csv`,
      [
        'Fecha',
        'Secuencia',
        'Compania',
        'Placa',
        'Descripcion',
        'Chofer',
        'Ruta',
        'Hora',
        'Carga',
        'm3',
        'Precio USD',
        'Estado',
      ],
      visibles.map((v) => [
        v.fecha,
        v.secuencia,
        equipo.compania,
        equipo.placa,
        equipo.nombre,
        v.chofer ?? equipo.chofer ?? '',
        v.tramo_dice,
        v.hora?.slice(0, 5) ?? '',
        v.carga ? CARGA_DEL_VIAJE[v.carga].texto : '',
        v.carga_m3 ?? '',
        v.precio_usd ?? '',
        ESTADO_VIAJE[v.estado].texto,
      ]),
    )
  }

  return (
    <>
      <Modal
        abierto
        onCerrar={onCerrar}
        titulo={`${equipo.placa}${equipo.nombre ? ` · ${equipo.nombre}` : ''}`}
        descripcion={[
          `Compañía: ${equipo.compania}`,
          equipo.chofer ? `Chofer: ${equipo.chofer}` : null,
          equipo.cargaUtilM3 ? `Carga útil: ${enteros(equipo.cargaUtilM3)} m³` : 'Sin carga útil medida',
        ]
          .filter(Boolean)
          .join(' · ')}
        ancho="xl"
        acciones={
          <>
            <Button variant="ghost" onClick={onCerrar}>
              Cerrar
            </Button>
            {visibles.length > 0 ? (
              <>
                <Button variant="outline" icon={<Download />} onClick={exportarCsv}>
                  Descargar CSV
                </Button>
                <Button variant="outline" icon={<Printer />} onClick={() => void imprimirPdf()}>
                  Imprimir PDF
                </Button>
              </>
            ) : null}
          </>
        }
      >
        {/* Selector de período y filtros del camión */}
        <div className="border-hairline mb-4 flex flex-wrap items-end justify-between gap-3 border-b pb-3">
          <div>
            <p className="text-ink/55 mb-1.5 text-xs font-medium">Período a consultar</p>
            <div className="rounded-control border-ink/20 inline-flex h-9 items-center border p-0.5">
              {(
                [
                  ['dia', `Día (${fmtFecha(fechaBase)})`],
                  ['semana', 'Semana (Lun–Dom)'],
                  ['mes', 'Este mes'],
                  ['rango', 'Rango libre'],
                ] as const
              ).map(([id, etiqueta]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAlcance(id)}
                  className={cn(
                    'h-full rounded-[5px] px-2.5 text-xs font-medium whitespace-nowrap transition-colors',
                    alcance === id
                      ? 'bg-royal-600 text-white'
                      : 'text-ink/65 hover:text-ink/90',
                  )}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
          </div>

          {alcance === 'rango' ? (
            <div className="flex flex-wrap items-end gap-2">
              <Input
                label="Desde"
                type="date"
                value={desdeLibre}
                max={hoy}
                onChange={(e) => {
                  const v = e.target.value
                  setDesdeLibre(v)
                  if (esFechaIso(v) && esFechaIso(hastaLibre) && v > hastaLibre) setHastaLibre(v)
                }}
                className="w-40"
              />
              <Input
                label="Hasta"
                type="date"
                value={hastaLibre}
                max={hoy}
                onChange={(e) => {
                  const v = e.target.value
                  setHastaLibre(v)
                  if (esFechaIso(v) && esFechaIso(desdeLibre) && v < desdeLibre) setDesdeLibre(v)
                }}
                className="w-40"
              />
            </div>
          ) : null}

          {todos.length > 0 ? (
            <div className="flex flex-wrap items-end gap-2">
              {rutasDisponibles.length > 1 ? (
                <Select
                  label="Ruta"
                  value={filtroRuta}
                  onChange={(e) => setFiltroRuta(e.target.value)}
                  opciones={[
                    { valor: '', etiqueta: 'Todas las rutas' },
                    ...rutasDisponibles.map((r) => ({ valor: r, etiqueta: r })),
                  ]}
                  className="w-52"
                />
              ) : null}
              <Select
                label="Estado"
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                opciones={[
                  { valor: '', etiqueta: 'Todos los estados' },
                  { valor: 'CONTADOS', etiqueta: 'Solo aprobados / contados' },
                  { valor: 'POR_APROBAR', etiqueta: 'Solo por aprobar' },
                  { valor: 'DESCARTADOS', etiqueta: 'Anulados y rechazados' },
                ]}
                className="w-48"
              />
            </div>
          ) : null}
        </div>

        {/* Resumen numérico del camión */}
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="border-hairline rounded-[6px] border px-3 py-2">
            <p className="text-ink/45 text-2xs font-mono tracking-wider uppercase">Viajes aprobados</p>
            <p className="tabular text-ink/90 mt-1 text-xl font-semibold">{enteros(resumen.vivos)}</p>
          </div>
          <div className="border-hairline rounded-[6px] border px-3 py-2">
            <p className="text-ink/45 text-2xs font-mono tracking-wider uppercase">Por aprobar</p>
            <p
              className={cn(
                'tabular mt-1 text-xl font-semibold',
                resumen.porAprobar > 0 ? 'text-warning' : 'text-ink/40',
              )}
            >
              {enteros(resumen.porAprobar)}
            </p>
          </div>
          <div className="border-hairline rounded-[6px] border px-3 py-2">
            <p className="text-ink/45 text-2xs font-mono tracking-wider uppercase">Volumen movido</p>
            <p className="tabular text-ink/90 mt-1 text-xl font-semibold">
              {resumen.conM3 ? `${enteros(resumen.totalM3)} m³` : '—'}
            </p>
          </div>
          <div className="border-hairline rounded-[6px] border px-3 py-2">
            <p className="text-ink/45 text-2xs font-mono tracking-wider uppercase">Monto generado</p>
            <p className="tabular text-ink/90 mt-1 text-xl font-semibold">
              {resumen.hayDinero ? dolares(resumen.totalUsd) : '—'}
            </p>
          </div>
        </div>

        {/* Desglose rápido por ruta del camión */}
        {resumen.porRuta.length > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-ink/45 text-xs">Desglose por ruta:</span>
            {resumen.porRuta.map((r) => (
              <span
                key={r.ruta}
                className="border-hairline bg-ink/3 text-ink/80 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
              >
                <span className="font-medium">{r.ruta}:</span>
                <span className="tabular">{enteros(r.viajes)} viajes</span>
                {r.porAprobar > 0 ? (
                  <span className="text-warning tabular">(+{enteros(r.porAprobar)})</span>
                ) : null}
                {r.conM3 ? <span className="text-ink/55 tabular">· {enteros(r.m3)} m³</span> : null}
                {resumen.hayDinero && r.usd > 0 ? (
                  <span className="text-ink/70 tabular font-medium">· {dolares(r.usd)}</span>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}

        {/* Aprobar en bloque los viajes pendientes de este equipo si tiene permiso */}
        {resumen.decidiblesIds.length > 0 ? (
          <div className="border-warning/35 bg-warning-soft/40 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[6px] border px-3 py-2 text-xs">
            <span className="text-ink/80">
              Este equipo tiene <strong>{enteros(resumen.decidiblesIds.length)}</strong>{' '}
              {resumen.decidiblesIds.length === 1 ? 'viaje pendiente' : 'viajes pendientes'} que
              usted puede aprobar.
            </span>
            <Button
              size="sm"
              icon={<Check />}
              disabled={aprobar.isPending}
              onClick={() =>
                aprobar.mutate({
                  ids: resumen.decidiblesIds,
                  con_firma: miFirma?.usar === true,
                })
              }
            >
              Aprobar pendientes de {equipo.placa}
            </Button>
          </div>
        ) : null}

        {viajesQ.isPending ? <Cargando /> : null}
        {viajesQ.error ? <ErrorDeCarga error={viajesQ.error} /> : null}
        {aprobar.error ? <ErrorDeCarga error={aprobar.error} className="mb-3" /> : null}

        {!viajesQ.isPending && !viajesQ.error && visibles.length === 0 ? (
          <Vacio
            icono={<Truck />}
            titulo="Sin acarreos en este período"
            descripcion="Cambie arriba a «Semana (Lun–Dom)», «Este mes» o «Rango libre» para consultar otros días de este camión."
          />
        ) : null}

        {visibles.length > 0 ? (
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-surface sticky top-0 z-10">
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  {!unSoloDia ? <th className="py-2 pr-3 font-medium">Fecha</th> : null}
                  <th className="py-2 pr-3 font-medium">N.º</th>
                  <th className="px-3 py-2 font-medium">Ruta</th>
                  <th className="px-3 py-2 font-medium">Hora</th>
                  <th className="px-3 py-2 font-medium">Carga</th>
                  <th className="px-3 py-2 text-right font-medium">m³</th>
                  <th className="px-3 py-2 text-right font-medium">Precio</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="py-2 pl-3 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {visibles.map((v) => {
                  const estado = ESTADO_VIAJE[v.estado]
                  const muerto = v.estado === 'ANULADO' || v.estado === 'RECHAZADO'
                  const decideEste = puedoDecidirViaje(comoApruebo.data, v)
                  return (
                    <tr
                      key={v.id}
                      className={cn(
                        'border-hairline border-b last:border-0',
                        muerto && 'opacity-55',
                      )}
                    >
                      {!unSoloDia ? (
                        <td className="tabular text-ink/75 py-2 pr-3 whitespace-nowrap">
                          {fmtFecha(v.fecha)}
                        </td>
                      ) : null}
                      <td className="tabular text-ink/70 py-2 pr-3">{v.secuencia}</td>
                      <td className="text-ink/80 px-3 py-2">{v.tramo_dice}</td>
                      <td className="tabular text-ink/60 px-3 py-2">
                        {v.hora?.slice(0, 5) ?? <span className="text-ink/25">—</span>}
                      </td>
                      <td className="text-ink/60 px-3 py-2 text-xs">
                        {v.carga ? (
                          CARGA_DEL_VIAJE[v.carga].texto
                        ) : (
                          <span className="text-ink/25">—</span>
                        )}
                      </td>
                      <td className="tabular text-ink/80 px-3 py-2 text-right">
                        <Cifra valor={v.carga_m3} />
                      </td>
                      <td className="tabular text-ink/80 px-3 py-2 text-right">
                        <Cifra valor={v.precio_usd} comoDinero />
                        {v.precio_antes_de_ajuste !== null ? (
                          <span className="text-ink/45 block text-2xs" title={v.motivo_ajuste ?? ''}>
                            ajustado; de la ruta {dolares(v.precio_antes_de_ajuste)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <Chip
                          tone={estado.tono}
                          title={v.motivo_rechazo ?? v.motivo_anulacion ?? v.decidido_por_nombre ?? ''}
                        >
                          {estado.texto}
                        </Chip>
                        {v.motivo_rechazo ? (
                          <span className="text-ink/45 mt-0.5 block text-2xs">
                            {v.motivo_rechazo}
                          </span>
                        ) : null}
                        {v.motivo_devolucion ? (
                          <span className="text-ink/45 mt-0.5 block text-2xs">
                            Devuelto{v.devuelto_por_nombre ? ` por ${v.devuelto_por_nombre}` : ''}:{' '}
                            {v.motivo_devolucion}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pl-3 text-right whitespace-nowrap">
                        {v.estado === 'POR_APROBAR' && decideEste ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Check />}
                              disabled={aprobar.isPending}
                              onClick={() =>
                                aprobar.mutate({ ids: [v.id], con_firma: miFirma?.usar === true })
                              }
                            >
                              Aprobar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<X />}
                              onClick={() => setRechazando(v)}
                            >
                              Rechazar
                            </Button>
                          </>
                        ) : null}
                        {(v.estado === 'POR_APROBAR' || v.estado === 'REGISTRADO') &&
                        puede('EXPLOTACION', 'ESCRITURA') ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Pencil />}
                            onClick={() => setCorrigiendo(v)}
                          >
                            Corregir
                          </Button>
                        ) : null}
                        {(v.estado === 'APROBADO' || v.estado === 'RECHAZADO') && decideEste ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Undo2 />}
                            onClick={() => setDevolviendo(v)}
                          >
                            Devolver
                          </Button>
                        ) : null}
                        {!muerto && puede('EXPLOTACION', 'TOTAL') ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Ban />}
                            className="text-danger"
                            onClick={() => setAnulando(v)}
                          >
                            Anular
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Modal>

      {corrigiendo ? (
        <CorregirViajeModal viaje={corrigiendo} onCerrar={() => setCorrigiendo(null)} />
      ) : null}
      {anulando ? <AnularViajeModal viaje={anulando} onCerrar={() => setAnulando(null)} /> : null}
      {devolviendo ? (
        <DevolverViajeModal viaje={devolviendo} onCerrar={() => setDevolviendo(null)} />
      ) : null}
      {rechazando ? (
        <RechazarViajeIndividualModal viaje={rechazando} onCerrar={() => setRechazando(null)} />
      ) : null}

      <Visor
        abierto={pdf !== null}
        onCerrar={() => setPdf(null)}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ''}
        titulo={`Historial de acarreos · ${equipo.placa}`}
      />
    </>
  )
}

function CorregirViajeModal({ viaje, onCerrar }: { viaje: Acarreo; onCerrar: () => void }) {
  const corregir = useCorregirAcarreo()
  const [hora, setHora] = useState(viaje.hora?.slice(0, 5) ?? '')
  const [carga, setCarga] = useState(viaje.carga_m3 ?? '')
  const [precio, setPrecio] = useState(viaje.precio_usd ?? '')

  const veElDinero = viaje.precio_usd !== null && viaje.estado !== 'POR_APROBAR'
  const volvioVacio = viaje.carga === 'VACIO'

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Viaje ${viaje.secuencia} · ${viaje.placa ?? ''}`}
      descripcion={`${viaje.tramo_dice}. Solo se corrige lo que todavía no se ha aprobado.`}
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={corregir.isPending}
            onClick={async () => {
              await corregir.mutateAsync({
                id: viaje.id,
                hora: hora === '' ? null : hora,
                carga_m3: volvioVacio || carga === '' ? null : Number(carga),
                precio_usd: veElDinero && precio !== '' ? Number(precio) : null,
              })
              onCerrar()
            }}
          >
            {corregir.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        {volvioVacio ? (
          <p className="text-ink/55 self-end text-xs">
            Volvió vacío: no lleva metros cúbicos. Si traía carga, anúlelo y cárguelo de nuevo.
          </p>
        ) : (
          <Input
            label="Metros cúbicos"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={carga}
            onChange={(e) => setCarga(e.target.value)}
            hint={
              viaje.capacidad_m3 !== null
                ? `El camión carga hasta ${enteros(viaje.capacidad_m3)} m³.`
                : undefined
            }
          />
        )}
        {veElDinero ? (
          <Input
            label="Precio del viaje"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
          />
        ) : null}
      </div>
      {corregir.error ? <ErrorDeCarga error={corregir.error} className="mt-4" /> : null}
    </Modal>
  )
}

function DevolverViajeModal({ viaje, onCerrar }: { viaje: Acarreo; onCerrar: () => void }) {
  const devolver = useDevolverViajes()
  const [motivo, setMotivo] = useState('')

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Devolver el viaje ${viaje.secuencia} de ${viaje.placa ?? ''}`}
      descripcion={`Vuelve a «por aprobar» y deja de contar hasta que alguien lo decida otra vez.${
        viaje.decidido_por_nombre ? ` Decidido antes por ${viaje.decidido_por_nombre}.` : ''
      }`}
      ancho="sm"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Volver
          </Button>
          <Button
            disabled={devolver.isPending || motivo.trim().length < 4}
            onClick={async () => {
              await devolver.mutateAsync({ ids: [viaje.id], motivo })
              onCerrar()
            }}
          >
            {devolver.isPending ? 'Devolviendo…' : 'Devolver a por aprobar'}
          </Button>
        </>
      }
    >
      <Textarea
        label="Motivo"
        hint="Lo lee quien tenga que decidirlo otra vez. Queda guardado aunque después se apruebe."
        placeholder="Se aprobó por error junto con otro lote"
        rows={3}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        required
      />
      {devolver.error ? <ErrorDeCarga error={devolver.error} className="mt-3" /> : null}
    </Modal>
  )
}

function RechazarViajeIndividualModal({
  viaje,
  onCerrar,
}: {
  viaje: Acarreo
  onCerrar: () => void
}) {
  const rechazar = useRechazarViajes()
  const [motivo, setMotivo] = useState('')

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Rechazar viaje ${viaje.secuencia} de ${viaje.placa ?? ''}`}
      descripcion={`${viaje.tramo_dice}. Un viaje rechazado no cuenta ni se paga.`}
      ancho="sm"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Volver
          </Button>
          <Button
            variant="danger"
            disabled={rechazar.isPending || motivo.trim().length < 4}
            onClick={async () => {
              await rechazar.mutateAsync({ ids: [viaje.id], motivo })
              onCerrar()
            }}
          >
            {rechazar.isPending ? 'Rechazando…' : 'Rechazar'}
          </Button>
        </>
      }
    >
      <Textarea
        label="Motivo"
        hint="Lo lee quien lo cargó."
        rows={3}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        required
      />
      {rechazar.error ? <ErrorDeCarga error={rechazar.error} className="mt-3" /> : null}
    </Modal>
  )
}

function AnularViajeModal({ viaje, onCerrar }: { viaje: Acarreo; onCerrar: () => void }) {
  const anular = useAnularAcarreo()
  const [motivo, setMotivo] = useState('')

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Anular el viaje ${viaje.secuencia} de ${viaje.placa ?? ''}`}
      descripcion="El viaje deja de contar y de cobrarse, pero la fila se queda, y su número no se reutiliza."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            No anular
          </Button>
          <Button
            variant="danger"
            disabled={anular.isPending || motivo.trim().length < 4}
            onClick={async () => {
              await anular.mutateAsync({ id: viaje.id, motivo })
              onCerrar()
            }}
          >
            {anular.isPending ? 'Anulando…' : 'Anular el viaje'}
          </Button>
        </>
      }
    >
      <Textarea
        label="Motivo"
        hint="Queda en el registro de auditoría con su nombre y la hora."
        rows={3}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        required
      />
      {anular.error ? <ErrorDeCarga error={anular.error} className="mt-4" /> : null}
    </Modal>
  )
}
