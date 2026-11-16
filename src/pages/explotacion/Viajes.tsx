/*
  Acarreos internos (antes «Viajes de camiones»).

  Sustituye las hojas de control diario por camión, el corte semanal de lunes a
  domingo, el registro de pago por compañía y el resumen de transporte del
  reporte de operaciones.
*/
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Coins,
  Download,
  Filter,
  MessageSquare,
  Plus,
  Printer,
  Route,
  Search,
  Truck,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { Visor } from '@/components/Visor'
import {
  CARGA_DEL_VIAJE,
  claveEquipo,
  esEquipo,
  esFechaIso,
  lunesDeSemana,
  puedoDecidirViaje,
  sumarDiasIso,
  tarifaEnPalabras,
  useAcarreosDelDia,
  useAcarreosDia,
  useAjustarPrecioDeViajes,
  useAprobarViajes,
  useComoApruebo,
  useEquiposEnOperacion,
  useMaquinasParaViajes,
  usePagoDeAcarreosEntre,
  useRechazarViajes,
  useRegistrarViajes,
  useRutasAcarreo,
  type Acarreo,
  type AcarreoDia,
  type CargaDelViaje,
  type EquipoAcarreo,
  type RutaAcarreo,
} from '@/lib/api/acarreos'
import { useVehiculos } from '@/lib/api/vehiculos'
import { leerFirmasEncendidas, useMiFirma } from '@/lib/api/firmas'
import type { FirmaDelDia, FirmasDelDia } from '@/lib/ficha/viajesPdf'
import { empresaDelPapel, useEmpresa } from '@/lib/api/empresa'
import { descargarCsv } from '@/lib/api/libros'
import {
  armarPagoDelDia,
  armarRegistroDePago,
  armarRegistroDeViajes,
} from '@/lib/ficha/viajesPdf'
import { copiarAlPortapapeles, textoDelReporteDiario } from '@/lib/ficha/reporteDiario'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { useSesion } from '@/lib/sesion'
import { useMisPermisos } from '@/lib/api/usuarios'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { dolares, enteros, fecha as fmtFecha } from '@/lib/formato'
import { cn } from '@/lib/cn'
import { DetalleEquipoModal } from './DetalleEquipoModal'
import { PestanaSemanal } from './PestanaSemanal'

/** Un número que puede no saberse. El guion es la respuesta, no un hueco. */
function Cifra({ valor, comoDinero = false }: { valor: string | null; comoDinero?: boolean }) {
  if (valor === null) return <span className="text-ink/25">—</span>
  return <>{comoDinero ? dolares(valor) : enteros(valor)}</>
}

type PestanaPrincipal = 'dia' | 'semanal' | 'pago'

export function Viajes() {
  const [pestana, setPestana] = useState<PestanaPrincipal>('dia')

  return (
    <>
      <PageHeader
        title="Acarreos internos"
        description="Control diario y semanal de viajes por camión, compañía y ruta. Cada viaje nuevo queda pendiente de aprobación del responsable antes de contar para el pago."
        actions={
          <Link to="/app/explotacion/plantas">
            <Button variant="outline" icon={<Route />}>
              Plantas y rutas
            </Button>
          </Link>
        }
      />

      <div className="border-hairline mb-5 flex flex-wrap gap-1 border-b">
        {(
          [
            { id: 'dia', etiqueta: 'Acarreos del día' },
            { id: 'semanal', etiqueta: 'Reporte semanal' },
            { id: 'pago', etiqueta: 'Registro de pago' },
          ] as const
        ).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPestana(p.id)}
            aria-current={pestana === p.id}
            className={cn(
              '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              pestana === p.id
                ? 'border-royal-600 text-royal-700 dark:text-royal-300'
                : 'text-ink/55 hover:text-ink/80 border-transparent',
            )}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {pestana === 'dia' ? (
        <PestanaDia />
      ) : pestana === 'semanal' ? (
        <PestanaSemanal />
      ) : (
        <PestanaPago />
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════════ los acarreos del día */

function PestanaDia() {
  const hoy = hoyEnCaracas()
  const [dia, setDia] = useState(hoy)
  const [detalle, setDetalle] = useState<EquipoAcarreo | null>(null)
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [conDescartados, setConDescartados] = useState(false)
  const [rehaciendo, setRehaciendo] = useState(false)
  const [reporte, setReporte] = useState(false)
  const [verTarifas, setVerTarifas] = useState(false)

  // Búsqueda y filtros de desglose (por defecto muestra toda la flota como hoy)
  const [busqueda, setBusqueda] = useState('')
  const [companiaFiltro, setCompaniaFiltro] = useState('')
  const [rutaFiltro, setRutaFiltro] = useState('')
  const [soloConViajes, setSoloConViajes] = useState(false)
  const [plegadas, setPlegadas] = useState<Record<string, boolean>>({})

  // Formulario unificado de registro rápido
  const [mostrarCarga, setMostrarCarga] = useState(true)
  const [clavePreseleccionada, setClavePreseleccionada] = useState('')
  const refCarga = useRef<HTMLDivElement>(null)

  const vehiculos = useVehiculos(true)
  const maquinas = useMaquinasParaViajes()
  const rutas = useRutasAcarreo()
  const dias = useAcarreosDia(dia)
  const todos = useAcarreosDelDia(dia)
  const { data: laEmpresa } = useEmpresa()
  const qc = useQueryClient()
  const { nombre: yo } = useSesion()
  const { puede } = useMisPermisos()
  const escribe = puede('EXPLOTACION', 'ESCRITURA')

  const filas = useMemo(() => dias.data ?? [], [dias.data])
  const flota = useMemo(() => vehiculos.data ?? [], [vehiculos.data])
  const listaRutas = useMemo(() => rutas.data ?? [], [rutas.data])
  const listaMaquinas = useMemo(() => maquinas.data ?? [], [maquinas.data])

  const usables = useMemo(() => listaRutas.filter((r) => r.se_puede_usar), [listaRutas])

  const columnas = useMemo(
    () => listaRutas.filter((r) => r.se_puede_usar || filas.some((f) => f.ruta_id === r.id)),
    [listaRutas, filas],
  )

  // Todos los equipos (camiones + máquinas propias) normalizados
  const todosLosEquipos = useMemo<EquipoAcarreo[]>(() => {
    const camiones: EquipoAcarreo[] = flota.map((v) => ({
      vehiculoId: v.id,
      maquinaId: null,
      placa: v.placa,
      nombre: v.descripcion ?? '',
      chofer: v.chofer_actual,
      compania: v.propio ? 'Flota propia' : (v.transportista ?? 'Sin transportista'),
      cargaUtilM3: v.carga_util_m3,
      capacidadM3: v.capacidad_m3,
    }))
    const maq: EquipoAcarreo[] = listaMaquinas.map((m) => ({
      vehiculoId: null,
      maquinaId: m.id,
      placa: m.codigo,
      nombre: m.nombre,
      chofer: null,
      compania: 'Máquinas propias',
      cargaUtilM3: null,
      capacidadM3: null,
    }))
    return [...camiones, ...maq]
  }, [flota, listaMaquinas])

  // Índice rápido de filas del día por equipo
  const filasPorEquipo = useMemo(() => {
    const mapa = new Map<string, AcarreoDia[]>()
    for (const f of filas) {
      const k = f.vehiculo_id !== null ? `v:${f.vehiculo_id}` : `m:${f.maquina_id ?? 0}`
      mapa.set(k, [...(mapa.get(k) ?? []), f])
    }
    return mapa
  }, [filas])

  const yaTiene = (e: EquipoAcarreo, rutaId: number) =>
    (filasPorEquipo.get(claveEquipo(e)) ?? [])
      .filter((f) => f.ruta_id === rutaId)
      .reduce((s, f) => s + f.viajes + f.por_aprobar, 0)

  const companiasDisponibles = useMemo(() => {
    const set = new Set<string>()
    for (const eq of todosLosEquipos) {
      if (eq.maquinaId !== null) {
        const tieneHoy = (filasPorEquipo.get(claveEquipo(eq)) ?? []).length > 0
        if (tieneHoy || escribe) set.add(eq.compania)
      } else {
        set.add(eq.compania)
      }
    }
    return [...set].sort()
  }, [todosLosEquipos, filasPorEquipo, escribe])

  const termino = busqueda.trim().toLowerCase()

  // Equipos filtrados por búsqueda, compañía, ruta y botón «Solo con viajes»
  const seccionesPorCompania = useMemo(() => {
    const mapa = new Map<string, EquipoAcarreo[]>()
    for (const eq of todosLosEquipos) {
      const suyas = filasPorEquipo.get(claveEquipo(eq)) ?? []
      const movioHoy = suyas.some(
        (f) => f.viajes > 0 || f.por_aprobar > 0 || f.rechazados > 0 || f.anulados > 0,
      )

      // Las máquinas propias sin viajes hoy solo se listan cuando se filtra o se busca por ellas
      if (eq.maquinaId !== null && !movioHoy && !termino && companiaFiltro !== 'Máquinas propias') {
        continue
      }

      if (companiaFiltro && eq.compania !== companiaFiltro) continue

      if (rutaFiltro) {
        const movioEnRuta = suyas.some(
          (f) => String(f.ruta_id) === rutaFiltro && (f.viajes > 0 || f.por_aprobar > 0),
        )
        if (!movioEnRuta) continue
      }

      if (soloConViajes && !movioHoy) continue

      if (termino) {
        const choferDia = suyas.find((f) => f.chofer)?.chofer ?? ''
        const bolsa = [eq.placa, eq.nombre, eq.chofer ?? '', choferDia, eq.compania]
          .join(' ')
          .toLowerCase()
        if (!bolsa.includes(termino)) continue
      }

      mapa.set(eq.compania, [...(mapa.get(eq.compania) ?? []), eq])
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [todosLosEquipos, filasPorEquipo, companiaFiltro, rutaFiltro, soloConViajes, termino])

  // KPIs del día (calculados sobre las filas del día coherentes con los filtros si hay alguno activo)
  const kpisDia = useMemo(() => {
    const hayFiltro = Boolean(companiaFiltro || rutaFiltro || termino)
    const clavesPermitidas = hayFiltro
      ? new Set(seccionesPorCompania.flatMap(([, eqs]) => eqs.map(claveEquipo)))
      : null

    const consideradas = filas.filter((f) => {
      if (rutaFiltro && String(f.ruta_id) !== rutaFiltro) return false
      if (clavesPermitidas) {
        const k = f.vehiculo_id !== null ? `v:${f.vehiculo_id}` : `m:${f.maquina_id ?? 0}`
        if (!clavesPermitidas.has(k)) return false
      }
      return true
    })

    const equiposActivos = new Set(
      consideradas
        .filter((f) => f.viajes > 0 || f.por_aprobar > 0)
        .map((f) => (f.vehiculo_id !== null ? `v:${f.vehiculo_id}` : `m:${f.maquina_id ?? 0}`)),
    ).size

    return {
      viajes: consideradas.reduce((s, f) => s + f.viajes, 0),
      porAprobar: consideradas.reduce((s, f) => s + f.por_aprobar, 0),
      m3: consideradas.reduce((s, f) => s + Number(f.m3 ?? 0), 0),
      conM3: consideradas.some((f) => f.m3 !== null),
      sinCarga: consideradas.reduce((s, f) => s + f.sin_carga, 0),
      hayDinero: consideradas.some((f) => f.monto_usd !== null),
      usd: consideradas.reduce((s, f) => s + Number(f.monto_usd ?? 0), 0),
      equiposActivos,
    }
  }, [filas, companiaFiltro, rutaFiltro, termino, seccionesPorCompania])

  const seleccionarParaCargar = (eq: EquipoAcarreo) => {
    setClavePreseleccionada(claveEquipo(eq))
    setMostrarCarga(true)
    requestAnimationFrame(() => {
      refCarga.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  const imprimir = async (incluirDescartados = false) => {
    const todosViajes = todos.data ?? []
    const viajes = companiaFiltro
      ? todosViajes.filter((v) => {
          const comp = v.maquina_id !== null ? 'Máquinas propias' : v.transportista
          return comp === companiaFiltro
        })
      : todosViajes
    const placas = [...new Set(viajes.map((v) => v.placa ?? '—'))]
    const guardadas = await qc.fetchQuery({
      queryKey: ['firmas'],
      queryFn: leerFirmasEncendidas,
      staleTime: 5 * 60_000,
    })

    setPdf(
      await armarRegistroDeViajes({
        dia,
        empresa: companiaFiltro || null,
        firmas: quienesFirmanElDia(
          incluirDescartados
            ? viajes
            : viajes.filter((v) => v.estado !== 'ANULADO' && v.estado !== 'RECHAZADO'),
          guardadas.porPerfil,
        ),
        camiones: placas.map((placa) => {
          const suyos = viajes.filter((v) => (v.placa ?? '—') === placa)
          return {
            placa,
            vehiculo: suyos[0]?.vehiculo ?? null,
            transportista: suyos[0]?.transportista ?? '',
            chofer: suyos.find((v) => v.chofer)?.chofer ?? null,
            viajes: suyos.map((v) => ({
              secuencia: v.secuencia,
              tramo_dice: v.tramo_dice,
              hora: v.hora,
              carga_m3: v.carga_m3,
              precio_usd: v.precio_usd,
              estado: v.estado,
              motivo_anulacion: v.motivo_anulacion ?? v.motivo_rechazo,
            })),
          }
        }),
        conDescartados: incluirDescartados,
        empresa_papel: empresaDelPapel(laEmpresa),
        emitidoPor: yo ?? '',
        momento: new Date(),
      }),
    )
  }

  const hayDescartados = (todos.data ?? []).some(
    (v) => v.estado === 'ANULADO' || v.estado === 'RECHAZADO',
  )

  const columnasMostradas = useMemo(
    () => (rutaFiltro ? columnas.filter((c) => String(c.id) === rutaFiltro) : columnas),
    [columnas, rutaFiltro],
  )

  const conTarifaVisible = usables.some((r) => r.precio_usd !== null || r.precio_libre)

  return (
    <>
      {/* Barra superior: selector de fecha rápido y acciones del día */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <p className="text-ink/55 mb-1.5 text-xs font-medium">Fecha de operación</p>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                icon={<ChevronLeft />}
                onClick={() => setDia(sumarDiasIso(dia, -1))}
                title="Día anterior"
              />
              <input
                type="date"
                value={dia}
                max={hoy}
                aria-label="Fecha de operación"
                onChange={(e) => {
                  if (esFechaIso(e.target.value)) setDia(e.target.value)
                }}
                className="rounded-control border-ink/20 bg-surface text-ink/90 h-9 border px-2.5 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                icon={<ChevronRight />}
                disabled={dia >= hoy}
                onClick={() => {
                  const sig = sumarDiasIso(dia, 1)
                  setDia(sig > hoy ? hoy : sig)
                }}
                title="Día siguiente"
              />
              {dia !== hoy ? (
                <Button variant="ghost" size="sm" onClick={() => setDia(hoy)}>
                  Ir a hoy
                </Button>
              ) : null}
            </div>
          </div>

          <Button
            variant="outline"
            icon={<Printer />}
            disabled={(todos.data ?? []).length === 0}
            onClick={() => void imprimir(conDescartados)}
          >
            Imprimir el día
          </Button>
          <Button variant="outline" icon={<MessageSquare />} onClick={() => setReporte(true)}>
            Reporte de operaciones
          </Button>
          {conTarifaVisible ? (
            <Button
              variant={verTarifas ? 'primary' : 'ghost'}
              icon={<Coins />}
              onClick={() => setVerTarifas((v) => !v)}
            >
              Tarifas vigentes
            </Button>
          ) : null}
        </div>

        {escribe && usables.length > 0 && todosLosEquipos.length > 0 ? (
          <Button
            variant={mostrarCarga ? 'outline' : 'primary'}
            icon={<Plus />}
            onClick={() => setMostrarCarga((v) => !v)}
          >
            {mostrarCarga ? 'Ocultar carga rápida' : 'Registrar acarreo'}
          </Button>
        ) : null}
      </div>

      {/* Tarifas vigentes desplegables */}
      {verTarifas && conTarifaVisible ? (
        <div className="border-hairline bg-ink/2 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[6px] border px-3.5 py-2.5 text-xs">
          <span className="text-ink/50 font-medium">Tarifa por viaje:</span>
          {usables
            .filter((r) => r.precio_usd !== null || r.precio_libre)
            .map((r) => (
              <span key={r.id} className="text-ink/80 tabular">
                <strong>{r.nombre}:</strong> {tarifaEnPalabras(r, dolares)}
              </span>
            ))}
        </div>
      ) : null}

      {/* Tarjetas KPI arriba (visibilidad inmediata del día) */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <p className="text-ink/45 text-2xs font-mono tracking-[0.14em] uppercase">
            Viajes aprobados
          </p>
          <p className="tabular text-ink/90 mt-2 text-2xl font-semibold">
            {enteros(kpisDia.viajes)}
          </p>
          <p className="text-ink/50 mt-1 text-xs">
            {kpisDia.porAprobar > 0 ? (
              <span className="text-warning">
                +{enteros(kpisDia.porAprobar)} esperando aprobación
              </span>
            ) : (
              'Contabilizados en el día'
            )}
          </p>
        </Card>

        <Card>
          <p className="text-ink/45 text-2xs font-mono tracking-[0.14em] uppercase">
            Volumen del día
          </p>
          <p className="tabular text-ink/90 mt-2 text-2xl font-semibold">
            {kpisDia.conM3 || kpisDia.viajes > 0 ? `${enteros(kpisDia.m3)} m³` : '—'}
          </p>
          <p className="text-ink/50 mt-1 text-xs">
            {kpisDia.sinCarga > 0 ? (
              <span className="text-warning">
                {enteros(kpisDia.sinCarga)} sin carga útil medida
              </span>
            ) : (
              'Según carga útil de cada equipo'
            )}
          </p>
        </Card>

        <Card>
          <p className="text-ink/45 text-2xs font-mono tracking-[0.14em] uppercase">
            Equipos activos hoy
          </p>
          <p className="tabular text-ink/90 mt-2 text-2xl font-semibold">
            {enteros(kpisDia.equiposActivos)}
          </p>
          <p className="text-ink/50 mt-1 text-xs">De {enteros(flota.length)} camiones en flota</p>
        </Card>

        <Card>
          <p className="text-ink/45 text-2xs font-mono tracking-[0.14em] uppercase">
            Monto del día
          </p>
          <p className="tabular text-ink/90 mt-2 text-2xl font-semibold">
            {kpisDia.hayDinero ? dolares(kpisDia.usd) : '—'}
          </p>
          <p className="text-ink/50 mt-1 text-xs">Solo viajes aprobados</p>
        </Card>
      </div>

      {/* Panel unificado de registro rápido con buscador inteligente */}
      {escribe && mostrarCarga && usables.length > 0 && todosLosEquipos.length > 0 ? (
        <div ref={refCarga} className="mb-5">
          <CargarViajesUnificado
            dia={dia}
            equipos={todosLosEquipos}
            rutas={usables}
            clavePreseleccionada={clavePreseleccionada}
            onCambioClave={setClavePreseleccionada}
            yaTiene={yaTiene}
          />
        </div>
      ) : null}

      {vehiculos.isPending || dias.isPending || rutas.isPending ? <Cargando /> : null}
      {vehiculos.error ? <ErrorDeCarga error={vehiculos.error} /> : null}
      {dias.error ? <ErrorDeCarga error={dias.error} /> : null}
      {rutas.error ? <ErrorDeCarga error={rutas.error} /> : null}

      <PorAprobar viajes={todos.data ?? []} />

      {/* Barra de búsqueda y filtro por desglose (compañía, nombre, placa, ruta, solo con viajes) */}
      {flota.length > 0 || listaMaquinas.length > 0 ? (
        <Card className="mb-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Input
                label="Buscar camión por placa, nombre/modelo, chofer o compañía"
                value={busqueda}
                sinNormalizar
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Ej. 02GBAB, Kodia rojo, Sinotruk, Savanna, chofer…"
              />
              {busqueda ? (
                <button
                  type="button"
                  aria-label="Limpiar búsqueda"
                  onClick={() => setBusqueda('')}
                  className="text-ink/40 hover:text-ink/80 absolute right-2.5 bottom-2.5"
                >
                  <X className="size-4" />
                </button>
              ) : (
                <Search className="text-ink/35 pointer-events-none absolute right-3 bottom-3 size-4" />
              )}
            </div>

            <Select
              label="Compañía"
              value={companiaFiltro}
              onChange={(e) => setCompaniaFiltro(e.target.value)}
              opciones={[
                { valor: '', etiqueta: 'Todas las compañías' },
                ...companiasDisponibles.map((c) => ({ valor: c, etiqueta: c })),
              ]}
              className="w-52"
            />

            <Select
              label="Ruta"
              value={rutaFiltro}
              onChange={(e) => setRutaFiltro(e.target.value)}
              opciones={[
                { valor: '', etiqueta: 'Todas las rutas' },
                ...columnas.map((r) => ({ valor: String(r.id), etiqueta: r.nombre })),
              ]}
              className="w-56"
            />

            <Button
              variant={soloConViajes ? 'primary' : 'outline'}
              icon={<Filter />}
              onClick={() => setSoloConViajes((v) => !v)}
              className="mb-0.5"
            >
              {soloConViajes ? 'Solo con viajes (activo)' : 'Solo con viajes'}
            </Button>

            {busqueda || companiaFiltro || rutaFiltro || soloConViajes ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setBusqueda('')
                  setCompaniaFiltro('')
                  setRutaFiltro('')
                  setSoloConViajes(false)
                }}
                className="mb-1"
              >
                Limpiar filtros
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {!rutas.isPending && usables.length === 0 ? (
        <Card className="mb-4">
          <Vacio
            icono={<Route />}
            titulo="Sin rutas abiertas"
            descripcion="Los acarreos se registran por ruta. Las rutas se crean en Explotación › Plantas y rutas."
          />
        </Card>
      ) : null}

      {!vehiculos.isPending && !vehiculos.error && flota.length === 0 ? (
        <Card>
          <Vacio
            icono={<Truck />}
            titulo="Sin camiones registrados"
            descripcion="Registre primero la flota en Maquinaria › Equipos, con placa, modelo y capacidad."
          />
        </Card>
      ) : null}

      {/* Si hay filtros activos y ningún camión coincide */}
      {!vehiculos.isPending &&
      flota.length > 0 &&
      seccionesPorCompania.length === 0 ? (
        <Card>
          <Vacio
            icono={<Search />}
            titulo="Ningún camión coincide con los filtros actuales"
            descripcion={
              soloConViajes
                ? 'No hay camiones con viajes registrados para este filtro. Desactive «Solo con viajes» para ver toda la flota.'
                : 'Pruebe con otra palabra clave, placa o compañía.'
            }
          />
        </Card>
      ) : null}

      {/* Tablas agrupadas por compañía (plegables y clicables para abrir viajes) */}
      {seccionesPorCompania.length > 0 ? (
        <div className="space-y-4">
          {seccionesPorCompania.map(([empresa, equiposEmpresa]) => {
            const filasEmpresa = equiposEmpresa.flatMap(
              (eq) => filasPorEquipo.get(claveEquipo(eq)) ?? [],
            )
            const filtradasRuta = rutaFiltro
              ? filasEmpresa.filter((f) => String(f.ruta_id) === rutaFiltro)
              : filasEmpresa
            const subViajes = filtradasRuta.reduce((s, f) => s + f.viajes, 0)
            const subPend = filtradasRuta.reduce((s, f) => s + f.por_aprobar, 0)
            const subM3 = filtradasRuta.reduce((s, f) => s + Number(f.m3 ?? 0), 0)
            const subConM3 = filtradasRuta.some((f) => f.m3 !== null)
            const subUsd = filtradasRuta.reduce((s, f) => s + Number(f.monto_usd ?? 0), 0)
            const subHayDinero = filtradasRuta.some((f) => f.monto_usd !== null)
            const activosComp = equiposEmpresa.filter((eq) =>
              (filasPorEquipo.get(claveEquipo(eq)) ?? []).some(
                (f) => f.viajes > 0 || f.por_aprobar > 0,
              ),
            ).length
            const estaPlegada = Boolean(plegadas[empresa])

            return (
              <section key={empresa}>
                <button
                  type="button"
                  onClick={() => setPlegadas((p) => ({ ...p, [empresa]: !p[empresa] }))}
                  className="mb-2 flex w-full flex-wrap items-center justify-between gap-2 text-left"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <ChevronDown
                      className={cn(
                        'text-ink/50 size-4 transition-transform',
                        estaPlegada && '-rotate-90',
                      )}
                    />
                    <span className="text-ink/90 text-sm font-semibold">{empresa}</span>
                    <span className="text-ink/45 text-xs">
                      ({activosComp} de {equiposEmpresa.length}{' '}
                      {equiposEmpresa.length === 1 ? 'equipo con viajes' : 'equipos con viajes'})
                    </span>
                  </span>
                  <span className="text-ink/65 tabular text-xs">
                    {enteros(subViajes)} viajes
                    {subPend > 0 ? (
                      <span className="text-warning"> (+{enteros(subPend)} por aprobar)</span>
                    ) : null}
                    {subConM3 ? ` · ${enteros(subM3)} m³` : ''}
                    {subHayDinero ? ` · ${dolares(subUsd)}` : ''}
                  </span>
                </button>

                {!estaPlegada ? (
                  <Card flush>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] text-sm">
                        <thead>
                          <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                            <th className="px-5 py-3 font-medium">Camión / Modelo</th>
                            {columnasMostradas.map((r) => (
                              <th
                                key={r.id}
                                className="max-w-40 px-3 py-3 text-right font-medium"
                                title={r.nombre}
                              >
                                {r.nombre}
                              </th>
                            ))}
                            <th className="px-3 py-3 text-right font-medium">m³</th>
                            <th className="px-3 py-3 text-right font-medium">Monto a pagar</th>
                            <th className="px-4 py-3 text-right font-medium">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {equiposEmpresa.map((e) => (
                            <FilaEquipo
                              key={claveEquipo(e)}
                              equipo={e}
                              columnas={columnasMostradas}
                              filas={(filasPorEquipo.get(claveEquipo(e)) ?? []).filter(
                                (f) => !rutaFiltro || String(f.ruta_id) === rutaFiltro,
                              )}
                              puedeCargar={escribe && usables.length > 0}
                              onDetalle={() => setDetalle(e)}
                              onPreseleccionar={() => seleccionarParaCargar(e)}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                ) : null}
              </section>
            )
          })}
        </div>
      ) : null}

      {detalle ? (
        <DetalleEquipoModal
          equipo={detalle}
          fechaBase={dia}
          alcanceInicial="dia"
          onCerrar={() => setDetalle(null)}
        />
      ) : null}

      {reporte ? (
        <ReporteDeOperaciones
          dia={dia}
          filas={filas}
          razonSocial={laEmpresa?.razon_social ?? ''}
          onCerrar={() => setReporte(false)}
        />
      ) : null}

      <Visor
        abierto={pdf !== null}
        onCerrar={() => setPdf(null)}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ''}
        titulo="Registro diario de acarreos internos"
        descripcion={
          hayDescartados && !conDescartados
            ? 'No lista los viajes anulados ni los rechazados: nunca sumaron. Siguen en la pantalla.'
            : undefined
        }
        casilla={
          hayDescartados
            ? {
                etiqueta: 'Incluir anulados y rechazados',
                marcada: conDescartados,
                rehaciendo,
                onCambiar: async (marcada: boolean) => {
                  setConDescartados(marcada)
                  setRehaciendo(true)
                  try {
                    await imprimir(marcada)
                  } finally {
                    setRehaciendo(false)
                  }
                },
              }
            : undefined
        }
      />
    </>
  )
}

/* ═══════════════════════════ formulario unificado con buscador de camiones */

function CargarViajesUnificado({
  dia,
  equipos,
  rutas,
  clavePreseleccionada,
  onCambioClave,
  yaTiene,
}: {
  dia: string
  equipos: EquipoAcarreo[]
  rutas: RutaAcarreo[]
  clavePreseleccionada: string
  onCambioClave: (clave: string) => void
  yaTiene: (e: EquipoAcarreo, rutaId: number) => number
}) {
  const registrar = useRegistrarViajes()
  const { data: miFirma } = useMiFirma()
  const [conMiFirma, setConMiFirma] = useState(false)
  const [rutaId, setRutaId] = useState('')
  const [carga, setCarga] = useState<CargaDelViaje>('COMPLETA')
  const [m3, setM3] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [precio, setPrecio] = useState('')
  const [avisoCargado, setAvisoCargado] = useState<string | null>(null)

  const opcionesEquipo = useMemo(
    () =>
      equipos.map((e) => ({
        valor: claveEquipo(e),
        codigo: e.placa,
        nombre: e.nombre || e.compania,
        detalle: [e.compania, e.chofer ? `Chofer: ${e.chofer}` : null, e.cargaUtilM3 ? `${enteros(e.cargaUtilM3)} m³` : null]
          .filter(Boolean)
          .join(' · '),
      })),
    [equipos],
  )

  const opcionesRuta = useMemo(
    () =>
      rutas.map((r) => ({
        valor: String(r.id),
        etiqueta: r.nombre,
        detalle: r.precio_usd !== null || r.precio_libre ? tarifaEnPalabras(r, dolares) : undefined,
      })),
    [rutas],
  )

  const equipo = equipos.find((e) => claveEquipo(e) === clavePreseleccionada) ?? null
  const ruta = rutas.find((r) => String(r.id) === rutaId) ?? null
  const cuantos = Number(cantidad)
  const deMaquina = equipo !== null && equipo.maquinaId !== null

  const pideM3 = carga === 'PARCIAL'
  const ofreceM3 = pideM3 || (carga === 'COMPLETA' && deMaquina)
  const pidePrecio = Boolean(ruta?.pide_precio) && !deMaquina

  const valido =
    equipo !== null &&
    ruta !== null &&
    cuantos >= 1 &&
    cuantos <= 60 &&
    (!pideM3 || Number(m3) > 0) &&
    (!pidePrecio || (precio !== '' && Number(precio) >= 0))

  const pistaPrecio = !ruta
    ? undefined
    : ruta.precio_libre
      ? 'Ruta de precio libre: indique tarifa acordada.'
      : ruta.precio_hasta_usd !== null && ruta.precio_usd !== null
        ? `Rango permitido: ${dolares(ruta.precio_usd)} a ${dolares(ruta.precio_hasta_usd)}.`
        : 'Indique el monto del viaje.'

  const enviar = async () => {
    if (!equipo || !ruta) return
    await registrar.mutateAsync({
      fecha: dia,
      ruta_id: ruta.id,
      carga,
      cantidad: cuantos,
      vehiculo_id: equipo.vehiculoId,
      maquina_id: equipo.maquinaId,
      carga_m3: ofreceM3 && m3 !== '' ? Number(m3) : null,
      precio_usd: pidePrecio ? Number(precio) : null,
      con_firma: miFirma?.usar === true && conMiFirma,
    })
    setAvisoCargado(
      `${cuantos === 1 ? '1 viaje cargado' : `${cuantos} viajes cargados`} a ${equipo.placa} (${equipo.compania}) en ${ruta.nombre}. Quedan pendientes de aprobación.`,
    )
    setCantidad('')
    setPrecio('')
    setM3('')
  }

  return (
    <Card className="border-royal-600/25">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-ink/85 text-xs font-semibold tracking-wide uppercase">
          Registrar acarreo rápido · {fmtFecha(dia)}
        </p>
        {equipo ? (
          <span className="text-ink/55 text-xs">
            Seleccionado: <strong className="text-ink/85">{equipo.placa}</strong>
            {equipo.nombre ? ` · ${equipo.nombre}` : ''} ({equipo.compania})
          </span>
        ) : (
          <span className="text-ink/45 text-xs">
            Busque por placa, modelo («Kodia rojo»), chofer o compañía, o pulse «+» en la tabla
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-4">
          <SelectBuscable
            label="Camión o máquina"
            vacio="Buscar placa, modelo, chofer o compañía…"
            valor={clavePreseleccionada}
            onCambio={(v) => {
              onCambioClave(v)
              setAvisoCargado(null)
            }}
            opciones={opcionesEquipo}
          />
        </div>

        <div className="lg:col-span-3">
          <SelectBuscable
            label="Ruta"
            vacio="Seleccione la ruta…"
            valor={rutaId}
            onCambio={(v) => {
              setRutaId(v)
              setPrecio('')
              setAvisoCargado(null)
            }}
            opciones={opcionesRuta}
          />
        </div>

        <div className="lg:col-span-2">
          <Select
            label="Carga"
            value={carga}
            onChange={(e) => {
              setCarga(e.target.value as CargaDelViaje)
              setM3('')
            }}
            opciones={(Object.keys(CARGA_DEL_VIAJE) as CargaDelViaje[]).map((c) => ({
              valor: c,
              etiqueta: CARGA_DEL_VIAJE[c].texto,
            }))}
          />
        </div>

        <div className="lg:col-span-2">
          <Input
            label="Cant. viajes"
            type="number"
            min="1"
            max="60"
            inputMode="numeric"
            value={cantidad}
            onChange={(e) => {
              setCantidad(e.target.value)
              setAvisoCargado(null)
            }}
            hint={
              equipo && ruta && cuantos >= 1
                ? `Ya tiene ${yaTiene(equipo, ruta.id)} → quedarán ${yaTiene(equipo, ruta.id) + cuantos}.`
                : 'Se suma al día.'
            }
          />
        </div>

        <div className="flex items-end lg:col-span-1 lg:pt-6">
          <Button
            icon={<Plus />}
            disabled={!valido || registrar.isPending}
            onClick={() => void enviar()}
            className="w-full"
          >
            {registrar.isPending ? '…' : 'Cargar'}
          </Button>
        </div>
      </div>

      {ofreceM3 || pidePrecio ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ofreceM3 ? (
            <Input
              label="Metros cúbicos por viaje"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={m3}
              onChange={(e) => setM3(e.target.value)}
            />
          ) : null}
          {pidePrecio ? (
            <Input
              label="Precio por viaje (USD)"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              hint={pistaPrecio}
            />
          ) : null}
        </div>
      ) : null}

      {miFirma?.usar ? (
        <label className="text-ink/75 mt-3 flex cursor-pointer items-start gap-2.5 text-xs">
          <input
            type="checkbox"
            className="accent-royal-600 mt-0.5 size-4 shrink-0"
            checked={conMiFirma}
            onChange={(e) => setConMiFirma(e.target.checked)}
          />
          <span>
            Estampar mi firma digital en «Registrado por» del registro diario (si se marca en todos
            los viajes del día).
          </span>
        </label>
      ) : null}

      {deMaquina ? (
        <p className="text-ink/45 mt-2 text-xs">
          Las máquinas propias no generan monto por pagar: el acarreo queda contado en volumen y
          ruta.
        </p>
      ) : null}

      {avisoCargado ? (
        <p className="text-success mt-2 text-xs font-medium">{avisoCargado}</p>
      ) : null}

      {registrar.error ? <ErrorDeCarga error={registrar.error} className="mt-3" /> : null}
    </Card>
  )
}

function FilaEquipo({
  equipo,
  columnas,
  filas,
  puedeCargar,
  onDetalle,
  onPreseleccionar,
}: {
  equipo: EquipoAcarreo
  columnas: RutaAcarreo[]
  filas: AcarreoDia[]
  puedeCargar: boolean
  onDetalle: () => void
  onPreseleccionar: () => void
}) {
  const deRuta = (rutaId: number) => filas.filter((f) => esEquipo(f, equipo) && f.ruta_id === rutaId)
  const total = filas.reduce((s, f) => s + f.viajes + f.por_aprobar + f.rechazados + f.anulados, 0)
  const m3 = filas.reduce((s, f) => s + Number(f.m3 ?? 0), 0)
  const hayM3 = filas.some((f) => f.m3 !== null)
  const hayDinero = filas.some((f) => f.monto_usd !== null)
  const monto = filas.reduce((s, f) => s + Number(f.monto_usd ?? 0), 0)
  const subtitulo =
    [equipo.nombre, equipo.chofer].filter(Boolean).join(' · ') || 'Sin descripción ni chofer'

  return (
    <tr
      onClick={onDetalle}
      title={`Abrir viajes e historial de ${equipo.placa}`}
      className="border-hairline hover:bg-ink/4 cursor-pointer border-b transition-colors last:border-0"
    >
      <td className="px-5 py-3">
        <p className="tabular text-ink/90 font-medium">{equipo.placa}</p>
        <p className="text-ink/45 text-xs">{subtitulo}</p>
      </td>
      {columnas.map((r) => {
        const suyas = deRuta(r.id)
        const cuentan = suyas.reduce((s, f) => s + f.viajes, 0)
        const esperan = suyas.reduce((s, f) => s + f.por_aprobar, 0)
        return (
          <td key={r.id} className="tabular text-ink/75 px-3 py-3 text-right">
            {cuentan > 0 ? (
              enteros(cuentan)
            ) : esperan > 0 ? null : (
              <span className="text-ink/20">—</span>
            )}
            {esperan > 0 ? (
              <span className="text-warning block text-2xs">+{enteros(esperan)} por aprobar</span>
            ) : null}
          </td>
        )
      })}
      <td className="tabular text-ink/85 px-3 py-3 text-right font-medium">
        <Cifra valor={hayM3 ? String(m3) : null} />
      </td>
      <td className="tabular text-ink/85 px-3 py-3 text-right font-medium">
        <Cifra valor={hayDinero ? String(monto) : null} comoDinero />
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(ev) => ev.stopPropagation()}>
        <div className="inline-flex items-center gap-1">
          {puedeCargar ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus />}
              title={`Cargar viaje a ${equipo.placa}`}
              aria-label={`Cargar viaje a ${equipo.placa}`}
              onClick={onPreseleccionar}
            />
          ) : null}
          <Button size="sm" variant="ghost" onClick={onDetalle}>
            {total > 0 ? `Ver (${enteros(total)})` : 'Viajes'}
          </Button>
        </div>
      </td>
    </tr>
  )
}

/* ═════════════════════════════════════════════════════════════ por aprobar */

interface GrupoPorAprobar {
  clave: string
  ruta: string
  equipo: string
  origen_id: number | null
  destino_id: number | null
  deMaquina: boolean
  viajes: Acarreo[]
  ids: number[]
  cargas: Record<CargaDelViaje, number>
  m3: number
  hayM3: boolean
  monto: number
  hayDinero: boolean
}

function PorAprobar({ viajes }: { viajes: Acarreo[] }) {
  const como = useComoApruebo()
  const aprobar = useAprobarViajes()
  const [rechazando, setRechazando] = useState<GrupoPorAprobar | null>(null)
  const [ajustando, setAjustando] = useState<GrupoPorAprobar | null>(null)
  const { data: miFirma } = useMiFirma()
  const tengoFirma = miFirma?.usar === true
  const [conMiFirma, setConMiFirma] = useState(true)
  const conFirma = tengoFirma && conMiFirma

  const esperando = viajes.filter((v) => v.estado === 'POR_APROBAR')
  if (esperando.length === 0) return null

  const grupos = new Map<string, GrupoPorAprobar>()
  for (const v of esperando) {
    const clave = `${v.ruta_id}-${v.vehiculo_id ?? ''}-${v.maquina_id ?? ''}`
    const g = grupos.get(clave) ?? {
      clave,
      ruta: v.tramo_dice,
      equipo: v.placa ?? '—',
      origen_id: v.origen_id,
      destino_id: v.destino_id,
      deMaquina: v.maquina_id !== null,
      viajes: [],
      ids: [],
      cargas: { COMPLETA: 0, PARCIAL: 0, VACIO: 0 },
      m3: 0,
      hayM3: false,
      monto: 0,
      hayDinero: false,
    }
    g.ids.push(v.id)
    g.viajes.push(v)
    if (v.carga) g.cargas[v.carga] += 1
    if (v.carga_m3 !== null) {
      g.m3 += Number(v.carga_m3)
      g.hayM3 = true
    }
    if (v.precio_usd !== null) {
      g.monto += Number(v.precio_usd)
      g.hayDinero = true
    }
    grupos.set(clave, g)
  }

  const lista = [...grupos.values()]
  const decidibles = lista.filter((g) => puedoDecidirViaje(como.data, g))

  const comoVolvieron = (c: Record<CargaDelViaje, number>) =>
    [
      c.COMPLETA ? `${c.COMPLETA} completo${c.COMPLETA === 1 ? '' : 's'}` : null,
      c.PARCIAL ? `${c.PARCIAL} parcial${c.PARCIAL === 1 ? '' : 'es'}` : null,
      c.VACIO ? `${c.VACIO} vacío${c.VACIO === 1 ? '' : 's'}` : null,
    ]
      .filter(Boolean)
      .join(', ')

  return (
    <Card className="border-warning/40 mb-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-ink/85 text-sm font-semibold">
            Por aprobar · {enteros(esperando.length)}{' '}
            {esperando.length === 1 ? 'viaje' : 'viajes'}
          </h2>
          <p className="text-ink/55 mt-0.5 max-w-2xl text-xs leading-relaxed">
            Todavía no cuentan para el pago. Los aprueba o rechaza el responsable de la mina o
            planta de origen o de destino, o quien tenga la casilla «Aprobar o rechazar viajes».
            {decidibles.length === 0 ? ' Usted no puede decidir sobre ninguno de estos.' : ''}
          </p>
        </div>
        {decidibles.length > 1 ? (
          <Button
            size="sm"
            icon={<Check />}
            disabled={aprobar.isPending}
            onClick={() =>
              aprobar.mutate({ ids: decidibles.flatMap((g) => g.ids), con_firma: conFirma })
            }
          >
            Aprobar los {enteros(decidibles.reduce((s, g) => s + g.ids.length, 0))} que puedo
          </Button>
        ) : null}
      </div>

      {tengoFirma && decidibles.length > 0 ? (
        <label className="border-hairline mt-3 flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm">
          <input
            type="checkbox"
            className="accent-royal-600 mt-0.5 size-4 shrink-0"
            checked={conMiFirma}
            onChange={(e) => setConMiFirma(e.target.checked)}
          />
          <span className="text-ink/80">
            Poner mi firma digital en «Aprobado por» del registro del día
            <span className="text-ink/50 mt-0.5 block text-xs">
              Vale para lo que apruebe aquí. Sin marcar, la raya sale en blanco con su nombre
              debajo.
            </span>
          </span>
        </label>
      ) : null}

      <ul className="divide-hairline mt-3 divide-y">
        {lista.map((g) => {
          const puedo = puedoDecidirViaje(como.data, g)
          const comp = g.viajes[0]?.transportista
          const modelo = g.viajes[0]?.vehiculo
          return (
            <li key={g.clave} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 text-sm">
                <p className="text-ink/85">
                  <span className="tabular font-medium">{g.equipo}</span>
                  {modelo ? <span className="text-ink/55"> ({modelo})</span> : null}
                  {comp ? <span className="text-ink/50"> · {comp}</span> : null} · {g.ruta}
                </p>
                <p className="text-ink/50 text-xs">
                  {enteros(g.ids.length)} {g.ids.length === 1 ? 'viaje' : 'viajes'}:{' '}
                  {comoVolvieron(g.cargas) || 'sin decir cómo volvieron'}
                  {g.hayM3 ? ` · ${enteros(g.m3)} m³` : ''}
                  {g.deMaquina
                    ? ' · máquina propia: no se paga por viaje'
                    : g.hayDinero
                      ? ` · ${dolares(g.monto)}`
                      : ''}
                </p>
                {g.viajes.some((v) => v.motivo_ajuste) ? (
                  <p className="text-ink/45 text-xs">
                    Precio ajustado en {g.viajes.filter((v) => v.motivo_ajuste).length} de ellos.
                  </p>
                ) : null}
              </div>
              {puedo ? (
                <div className="flex gap-2">
                  {!g.deMaquina && g.hayDinero ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Coins />}
                      onClick={() => setAjustando(g)}
                    >
                      Ajustar precio
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    icon={<Check />}
                    disabled={aprobar.isPending}
                    onClick={() => aprobar.mutate({ ids: g.ids, con_firma: conFirma })}
                  >
                    Aprobar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<X />}
                    onClick={() => setRechazando(g)}
                  >
                    Rechazar
                  </Button>
                </div>
              ) : (
                <span className="text-ink/40 text-xs">Lo decide el responsable</span>
              )}
            </li>
          )
        })}
      </ul>

      {aprobar.error ? <ErrorDeCarga error={aprobar.error} className="mt-3" /> : null}

      {rechazando ? (
        <RechazarViajes grupo={rechazando} onCerrar={() => setRechazando(null)} />
      ) : null}
      {ajustando ? <AjustarPrecio grupo={ajustando} onCerrar={() => setAjustando(null)} /> : null}
    </Card>
  )
}

function AjustarPrecio({ grupo, onCerrar }: { grupo: GrupoPorAprobar; onCerrar: () => void }) {
  const ajustar = useAjustarPrecioDeViajes()
  const [marcados, setMarcados] = useState<number[]>(
    grupo.viajes.filter((v) => v.carga === 'PARCIAL' || v.carga === 'VACIO').map((v) => v.id),
  )
  const [precio, setPrecio] = useState('')
  const [motivo, setMotivo] = useState('')

  const listo =
    marcados.length > 0 && precio !== '' && Number(precio) >= 0 && motivo.trim().length >= 4

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Ajustar el precio · ${grupo.equipo}`}
      descripcion={`${grupo.ruta}. El precio nuevo se pone a los viajes marcados. Queda escrito lo que traían de la ruta y por qué cambió.`}
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Volver
          </Button>
          <Button
            disabled={!listo || ajustar.isPending}
            onClick={async () => {
              await ajustar.mutateAsync({ ids: marcados, precio: Number(precio), motivo })
              onCerrar()
            }}
          >
            {ajustar.isPending
              ? 'Guardando…'
              : `Ajustar ${marcados.length} ${marcados.length === 1 ? 'viaje' : 'viajes'}`}
          </Button>
        </>
      }
    >
      <ul className="divide-hairline mb-4 divide-y text-sm">
        {grupo.viajes.map((v) => (
          <li key={v.id}>
            <label className="flex cursor-pointer items-center gap-3 py-2">
              <input
                type="checkbox"
                className="accent-royal-600 size-4 shrink-0"
                checked={marcados.includes(v.id)}
                onChange={(e) =>
                  setMarcados((m) =>
                    e.target.checked ? [...m, v.id] : m.filter((x) => x !== v.id),
                  )
                }
              />
              <span className="tabular text-ink/70 w-10">N.º {v.secuencia}</span>
              <span className="text-ink/80 flex-1">
                {v.carga ? CARGA_DEL_VIAJE[v.carga].texto : 'Sin decir cómo volvió'}
                {v.carga_m3 !== null ? ` · ${enteros(v.carga_m3)} m³` : ''}
              </span>
              <span className="tabular text-ink/85 text-right">
                <Cifra valor={v.precio_usd} comoDinero />
                {v.precio_antes_de_ajuste !== null ? (
                  <span className="text-ink/45 block text-2xs">
                    de la ruta: {dolares(v.precio_antes_de_ajuste)}
                  </span>
                ) : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Precio nuevo de cada viaje marcado (USD)"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          hint="Cero si no se paga."
        />
      </div>
      <Textarea
        className="mt-3"
        label="Motivo"
        placeholder="Volvió vacío por falla de la pala; se paga la mitad por medio viaje…"
        rows={2}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
      />
      {ajustar.error ? <ErrorDeCarga error={ajustar.error} className="mt-3" /> : null}
    </Modal>
  )
}

function RechazarViajes({ grupo, onCerrar }: { grupo: GrupoPorAprobar; onCerrar: () => void }) {
  const rechazar = useRechazarViajes()
  const [motivo, setMotivo] = useState('')

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Rechazar ${grupo.ids.length === 1 ? 'el viaje' : `los ${grupo.ids.length} viajes`} de ${grupo.equipo}`}
      descripcion={`${grupo.ruta}. Un viaje rechazado no cuenta ni se paga, y no se puede volver a aprobar: si fue un error de carga, se carga de nuevo.`}
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
              await rechazar.mutateAsync({ ids: grupo.ids, motivo })
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
        hint="Lo lee quien los cargó."
        rows={3}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        required
      />
      {rechazar.error ? <ErrorDeCarga error={rechazar.error} className="mt-3" /> : null}
    </Modal>
  )
}

/* ════════════════════════════════════ el mensaje del reporte de operaciones */

function ReporteDeOperaciones({
  dia,
  filas,
  razonSocial,
  onCerrar,
}: {
  dia: string
  filas: AcarreoDia[]
  razonSocial: string
  onCerrar: () => void
}) {
  const equipos = useEquiposEnOperacion(dia)
  const [novedades, setNovedades] = useState('')
  const [copiado, setCopiado] = useState(false)

  const placas = [...new Set(filas.map((f) => f.placa ?? '—'))]
  const camiones = placas.map((placa) => {
    const suyas = filas.filter((f) => (f.placa ?? '—') === placa)
    const conM3 = suyas.some((f) => f.m3 !== null)
    const porTramo = (t: string) =>
      suyas.filter((f) => f.tramo === t).reduce((s, f) => s + f.viajes + f.por_aprobar, 0)
    return {
      placa,
      transportista: suyas[0]?.transportista ?? '',
      chofer: suyas.find((f) => f.chofer)?.chofer ?? null,
      aPlanta: porTramo('MINA_PLANTA'),
      aLavado: porTramo('PLANTA_LAVADO'),
      coraza: porTramo('MINA_BASE'),
      m3: conM3 ? suyas.reduce((s, f) => s + Number(f.m3 ?? 0), 0) : null,
      sinCarga: suyas.reduce((s, f) => s + f.sin_carga, 0),
    }
  })

  const texto = textoDelReporteDiario({
    fecha: dia,
    razonSocial,
    equipos: equipos.data ?? [],
    camiones,
    novedades,
  })

  const copiar = async () => {
    setCopiado(await copiarAlPortapapeles(texto))
  }

  const descargar = () => {
    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporte-operaciones-${dia}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Reporte diario de operaciones"
      descripcion="El mensaje que se manda por WhatsApp. Se copia y se pega tal cual: no se guarda en el sistema. Cuenta los acarreos a planta fija, a lavado y de coraza, también los que esperan aprobación."
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cerrar
          </Button>
          <Button variant="outline" icon={<Download />} onClick={descargar}>
            Descargar .txt
          </Button>
          <Button icon={copiado ? <Check /> : <ClipboardCopy />} onClick={() => void copiar()}>
            {copiado ? 'Copiado' : 'Copiar el mensaje'}
          </Button>
        </>
      }
    >
      <Textarea
        label="Novedades del día"
        hint="Lo que no consta en el sistema: una manguera rota, el generador, una visita. Se escribe aquí y sale en el mensaje."
        rows={3}
        value={novedades}
        sinNormalizar
        onChange={(e) => {
          setNovedades(e.target.value)
          setCopiado(false)
        }}
      />

      {equipos.error ? <ErrorDeCarga error={equipos.error} className="mt-3" /> : null}

      <p className="text-ink/45 mt-4 mb-1.5 text-xs">Así va a quedar</p>
      <pre className="bg-ink/4 text-ink/80 max-h-80 overflow-auto rounded-[6px] p-3 text-xs leading-relaxed whitespace-pre-wrap">
        {texto}
      </pre>
    </Modal>
  )
}

function quienesFirmanElDia(viajes: Acarreo[], firmas: Record<string, string>): FirmasDelDia {
  const firmaDe = (
    lista: Acarreo[],
    quien: (v: Acarreo) => string | null,
    nombre: (v: Acarreo) => string | null,
    eligio: (v: Acarreo) => boolean | null,
  ): FirmaDelDia => {
    const porPersona = new Map<string, { nombre: string; viajes: Acarreo[] }>()
    for (const v of lista) {
      const uid = quien(v)
      if (!uid) continue
      const suyo = porPersona.get(uid) ?? { nombre: nombre(v) ?? '—', viajes: [] }
      suyo.viajes.push(v)
      porPersona.set(uid, suyo)
    }
    const [primero, ...resto] = [...porPersona.entries()].sort(
      (a, b) => b[1].viajes.length - a[1].viajes.length,
    )
    if (!primero) return { nombre: null, cuantos: 0, imagen: null, otros: null }
    const [uid, suyo] = primero
    return {
      nombre: suyo.nombre,
      cuantos: suyo.viajes.length,
      imagen: suyo.viajes.every((v) => eligio(v) === true) ? (firmas[uid] ?? null) : null,
      otros:
        resto.length > 0
          ? resto.map(([, o]) => `${o.nombre} (${enteros(o.viajes.length)})`).join(', ')
          : null,
    }
  }

  return {
    registro: firmaDe(
      viajes,
      (v) => v.registrado_por,
      (v) => v.registrado_por_nombre,
      (v) => v.firma_de_quien_registra,
    ),
    aprobacion: firmaDe(
      viajes.filter((v) => v.estado === 'APROBADO'),
      (v) => v.decidido_por,
      (v) => v.decidido_por_nombre,
      (v) => v.firma_de_quien_aprueba,
    ),
    porAprobar: viajes.filter((v) => v.estado === 'POR_APROBAR').length,
  }
}

/* ════════════════════════════════════════════════════ el registro de pago */

interface Periodo {
  desde: string
  hasta: string
}

function atajos(hoy: string): Array<{ id: string; etiqueta: string; periodo: Periodo }> {
  const lunesEsta = lunesDeSemana(hoy)
  const lunesPasada = sumarDiasIso(lunesEsta, -7)
  const domingoPasada = sumarDiasIso(lunesPasada, 6)
  const primeroDelMes = `${hoy.slice(0, 8)}01`
  const finDelMesPasado = sumarDiasIso(primeroDelMes, -1)
  const ayer = sumarDiasIso(hoy, -1)

  return [
    { id: 'hoy', etiqueta: 'Hoy', periodo: { desde: hoy, hasta: hoy } },
    { id: 'ayer', etiqueta: 'Ayer', periodo: { desde: ayer, hasta: ayer } },
    {
      id: 'semana',
      etiqueta: 'Esta semana (Lun–Dom)',
      periodo: { desde: lunesEsta, hasta: hoy },
    },
    {
      id: 'semana-pasada',
      etiqueta: 'Semana pasada (Lun–Dom)',
      periodo: { desde: lunesPasada, hasta: domingoPasada },
    },
    { id: 'mes', etiqueta: 'Este mes', periodo: { desde: primeroDelMes, hasta: hoy } },
    {
      id: 'mes-pasado',
      etiqueta: 'Mes pasado',
      periodo: { desde: `${finDelMesPasado.slice(0, 8)}01`, hasta: finDelMesPasado },
    },
  ]
}

function PestanaPago() {
  const hoy = hoyEnCaracas()
  const [modo, setModo] = useState<'dia' | 'rango'>('rango')
  const [dia, setDia] = useState(hoy)
  const [desde, setDesde] = useState(lunesDeSemana(hoy))
  const [hasta, setHasta] = useState(hoy)
  const [empresaPedida, setEmpresaPedida] = useState('')
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const { data: laEmpresa } = useEmpresa()
  const { nombre: yo } = useSesion()

  const porDia = modo === 'dia'
  const periodo: Periodo = porDia ? { desde: dia, hasta: dia } : { desde, hasta }
  const periodoValido =
    esFechaIso(periodo.desde) && esFechaIso(periodo.hasta) && periodo.desde <= periodo.hasta

  const pago = usePagoDeAcarreosEntre(periodo.desde, periodo.hasta)

  const elegir = (p: Periodo) => {
    if (p.desde === p.hasta) {
      setModo('dia')
      setDia(p.desde)
    } else {
      setModo('rango')
      setDesde(p.desde)
      setHasta(p.hasta)
    }
  }

  const todas = pago.data ?? []
  const empresasDelPeriodo = [...new Set(todas.map((f) => f.transportista))].sort()
  const empresa = empresasDelPeriodo.includes(empresaPedida) ? empresaPedida : ''
  const filas = todas.filter((f) => empresa === '' || f.transportista === empresa)

  const corrido = new Map<string, number>()
  const conAcumulado = filas.map((f) => {
    if (f.monto_usd === null) return { ...f, acumulado: null as string | null }
    const suma = (corrido.get(f.transportista) ?? 0) + Number(f.monto_usd)
    corrido.set(f.transportista, suma)
    return { ...f, acumulado: String(suma) }
  })

  const empresas = [...new Set(filas.map((f) => f.transportista))].sort()
  const dias = [...new Set(todas.map((f) => f.fecha))].sort()

  const sumaDinero = (lista: typeof filas) =>
    lista.every((f) => f.monto_usd === null)
      ? null
      : String(lista.reduce((s, f) => s + Number(f.monto_usd ?? 0), 0))

  const totalFilas = sumaDinero(filas)
  const enCruce = (e: string, d: string) =>
    filas.find((f) => f.transportista === e && f.fecha === d)

  const imprimir = async () => {
    const papel = {
      empresa_papel: empresaDelPapel(laEmpresa),
      emitidoPor: yo ?? '',
      momento: new Date(),
    }

    if (porDia) {
      setPdf(
        await armarPagoDelDia({
          dia,
          empresa: empresa === '' ? null : empresa,
          lineas: filas.map((f) => ({
            transportista: f.transportista,
            viajes: f.viajes,
            m3: f.m3,
            monto_usd: f.monto_usd,
          })),
          ...papel,
        }),
      )
      return
    }

    setPdf(
      await armarRegistroDePago({
        desde,
        hasta,
        empresa: empresa === '' ? null : empresa,
        lineas: conAcumulado.map((f) => ({
          transportista: f.transportista,
          fecha: f.fecha,
          viajes: f.viajes,
          m3: f.m3,
          monto_usd: f.monto_usd,
          acumulado_usd: f.acumulado,
        })),
        ...papel,
      }),
    )
  }

  const exportar = () => {
    if (porDia) {
      descargarCsv(
        `pago-acarreos-${dia}.csv`,
        ['Compania', 'Fecha', 'Viajes', 'Metros cubicos', 'Monto USD'],
        filas.map((f) => [f.transportista, f.fecha, f.viajes, f.m3 ?? '', f.monto_usd ?? '']),
      )
      return
    }

    descargarCsv(
      `pago-acarreos-${desde}_a_${hasta}.csv`,
      ['Compania', 'Fecha', 'Viajes', 'Metros cubicos', 'Monto USD', 'Acumulado USD'],
      conAcumulado.map((f) => [
        f.transportista,
        f.fecha,
        f.viajes,
        f.m3 ?? '',
        f.monto_usd ?? '',
        f.acumulado ?? '',
      ]),
    )
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div>
          <p className="text-ink/75 mb-1.5 text-sm font-medium">Ver</p>
          <div
            role="group"
            aria-label="Qué fechas ver"
            className="rounded-control border-ink/20 inline-flex h-10 items-center border p-0.5"
          >
            {(
              [
                ['dia', 'Un día'],
                ['rango', 'Rango de fechas'],
              ] as const
            ).map(([id, etiqueta]) => (
              <button
                key={id}
                type="button"
                aria-pressed={modo === id}
                onClick={() => setModo(id)}
                className={cn(
                  'h-full rounded-[5px] px-3 text-sm font-medium whitespace-nowrap transition-colors',
                  modo === id ? 'bg-royal-600 text-white' : 'text-ink/65 hover:text-ink/90',
                )}
              >
                {etiqueta}
              </button>
            ))}
          </div>
        </div>

        {porDia ? (
          <Input
            label="Día"
            type="date"
            value={dia}
            max={hoy}
            onChange={(e) => setDia(e.target.value)}
            className="w-48"
          />
        ) : (
          <>
            <Input
              label="Desde"
              type="date"
              value={desde}
              max={hoy}
              onChange={(e) => {
                const v = e.target.value
                setDesde(v)
                if (esFechaIso(v) && esFechaIso(hasta) && v > hasta) setHasta(v)
              }}
              className="w-48"
            />
            <Input
              label="Hasta"
              type="date"
              value={hasta}
              max={hoy}
              onChange={(e) => {
                const v = e.target.value
                setHasta(v)
                if (esFechaIso(v) && esFechaIso(desde) && v < desde) setDesde(v)
              }}
              className="w-48"
            />
          </>
        )}

        <Select
          label="Compañía"
          value={empresa}
          onChange={(e) => setEmpresaPedida(e.target.value)}
          opciones={[
            { valor: '', etiqueta: 'Todas' },
            ...empresasDelPeriodo.map((x) => ({ valor: x, etiqueta: x })),
          ]}
          className="w-56"
        />
        <Button
          variant="outline"
          icon={<Printer />}
          disabled={filas.length === 0}
          onClick={() => void imprimir()}
          className="mb-0.5"
        >
          {porDia ? 'Imprimir el día' : 'Imprimir el período'}
        </Button>
        <Button
          variant="outline"
          icon={<Download />}
          disabled={filas.length === 0}
          onClick={exportar}
          className="mb-0.5"
        >
          {porDia ? 'Descargar el día' : 'Descargar el período'}
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-ink/45 text-xs">Atajos</span>
        {atajos(hoy).map((a) => {
          const activo = periodo.desde === a.periodo.desde && periodo.hasta === a.periodo.hasta
          return (
            <button
              key={a.id}
              type="button"
              aria-pressed={activo}
              onClick={() => elegir(a.periodo)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                activo
                  ? 'border-royal-600 bg-royal-600/10 text-royal-700 dark:text-royal-300'
                  : 'border-hairline text-ink/65 hover:border-royal-300',
              )}
            >
              {a.etiqueta}
            </button>
          )
        })}
      </div>

      {!periodoValido ? (
        <Card>
          <Vacio
            icono={<Coins />}
            titulo={porDia ? 'Seleccione un día' : 'Seleccione las dos fechas'}
            descripcion="Con la fecha completa se muestra lo adeudado a cada compañía."
          />
        </Card>
      ) : null}

      {periodoValido && pago.isLoading ? <Cargando /> : null}
      {pago.error ? <ErrorDeCarga error={pago.error} /> : null}

      {periodoValido && !pago.isLoading && !pago.error && filas.length === 0 ? (
        <Card>
          <Vacio
            icono={<Coins />}
            titulo={
              todas.length === 0
                ? porDia
                  ? 'Sin acarreos aprobados ese día'
                  : 'Sin acarreos aprobados en esas fechas'
                : 'Sin resultados'
            }
            descripcion={
              todas.length === 0
                ? 'Seleccione otras fechas o registre los viajes en la pestaña «Acarreos del día».'
                : 'La compañía no registra viajes aprobados en esas fechas.'
            }
          />
        </Card>
      ) : null}

      {filas.length > 0 && porDia ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Compañía</th>
                  <th className="px-3 py-3 text-right font-medium">Viajes</th>
                  <th className="px-3 py-3 text-right font-medium">m³</th>
                  <th className="px-5 py-3 text-right font-medium">Monto a pagar</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.transportista} className="border-hairline border-b last:border-0">
                    <td className="text-ink/85 px-5 py-3 font-medium">{f.transportista}</td>
                    <td className="tabular text-ink/75 px-3 py-3 text-right">
                      {enteros(f.viajes)}
                    </td>
                    <td className="tabular text-ink/75 px-3 py-3 text-right">
                      <Cifra valor={f.m3} />
                    </td>
                    <td className="tabular text-ink/90 px-5 py-3 text-right font-semibold">
                      <Cifra valor={f.monto_usd} comoDinero />
                    </td>
                  </tr>
                ))}
                <tr className="bg-ink/3 font-semibold">
                  <td className="text-ink/85 px-5 py-3">Total del día</td>
                  <td className="tabular text-ink/85 px-3 py-3 text-right">
                    {enteros(filas.reduce((s, f) => s + f.viajes, 0))}
                  </td>
                  <td className="tabular text-ink/85 px-3 py-3 text-right">
                    <Cifra
                      valor={
                        filas.some((f) => f.m3 !== null)
                          ? String(filas.reduce((s, f) => s + Number(f.m3 ?? 0), 0))
                          : null
                      }
                    />
                  </td>
                  <td className="tabular text-ink/95 px-5 py-3 text-right">
                    <Cifra valor={totalFilas} comoDinero />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {filas.length > 0 && !porDia ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Compañía</th>
                  {dias.map((d) => (
                    <th
                      key={d}
                      className="px-2.5 py-3 text-right font-medium whitespace-nowrap"
                      title={fmtFecha(d)}
                    >
                      {d.slice(8, 10)}/{d.slice(5, 7)}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right font-medium">Viajes</th>
                  <th className="px-5 py-3 text-right font-medium">Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {empresas.map((e) => {
                  const deEsta = filas.filter((f) => f.transportista === e)
                  const totalEmpresa = sumaDinero(deEsta)
                  const viajesEmpresa = deEsta.reduce((s, f) => s + f.viajes, 0)
                  return (
                    <tr key={e} className="border-hairline border-b last:border-0">
                      <td className="text-ink/85 px-5 py-3 font-medium whitespace-nowrap">{e}</td>
                      {dias.map((d) => {
                        const celda = enCruce(e, d)
                        return (
                          <td
                            key={d}
                            className="tabular text-ink/75 px-2.5 py-3 text-right whitespace-nowrap"
                          >
                            {celda ? (
                              <Cifra valor={celda.monto_usd} comoDinero />
                            ) : (
                              <span className="text-ink/20">—</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="tabular text-ink/80 px-3 py-3 text-right">
                        {enteros(viajesEmpresa)}
                      </td>
                      <td className="tabular text-ink/90 px-5 py-3 text-right font-semibold whitespace-nowrap">
                        <Cifra valor={totalEmpresa} comoDinero />
                      </td>
                    </tr>
                  )
                })}
                <tr className="bg-ink/3 font-semibold">
                  <td className="text-ink/85 px-5 py-3">Total del período</td>
                  {dias.map((d) => {
                    const delDia = filas.filter((f) => f.fecha === d)
                    return (
                      <td
                        key={d}
                        className="tabular text-ink/85 px-2.5 py-3 text-right whitespace-nowrap"
                      >
                        <Cifra valor={sumaDinero(delDia)} comoDinero />
                      </td>
                    )
                  })}
                  <td className="tabular text-ink/85 px-3 py-3 text-right">
                    {enteros(filas.reduce((s, f) => s + f.viajes, 0))}
                  </td>
                  <td className="tabular text-ink/95 px-5 py-3 text-right whitespace-nowrap">
                    <Cifra valor={totalFilas} comoDinero />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Visor
        abierto={pdf !== null}
        onCerrar={() => setPdf(null)}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ''}
        titulo={porDia ? 'Pago de acarreos del día' : 'Registro de pago de acarreos'}
      />
    </>
  )
}
