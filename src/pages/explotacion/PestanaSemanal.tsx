import { useMemo, useState } from 'react'
import {
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Download,
  Filter,
  MessageSquare,
  Printer,
  Route,
  Search,
  Truck,
  X,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { Visor } from '@/components/Visor'
import {
  claveEquipo,
  diasDeLaSemana,
  esFechaIso,
  lunesDeSemana,
  sumarDiasIso,
  useAcarreosDiaEntre,
  useMaquinasParaViajes,
  useRutasAcarreo,
  type EquipoAcarreo,
} from '@/lib/api/acarreos'
import { useVehiculos } from '@/lib/api/vehiculos'
import { empresaDelPapel, useEmpresa } from '@/lib/api/empresa'
import { descargarCsv } from '@/lib/api/libros'
import {
  armarReporteSemanalDeAcarreos,
  textoDelReporteSemanal,
  type FilaSemanalPdf,
  type ResumenRutaSemanalPdf,
} from '@/lib/ficha/viajesPdf'
import { copiarAlPortapapeles } from '@/lib/ficha/reporteDiario'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { useSesion } from '@/lib/sesion'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { dolares, enteros, fecha as fmtFecha } from '@/lib/formato'
import { cn } from '@/lib/cn'
import { DetalleEquipoModal } from './DetalleEquipoModal'

interface FilaCamionSemana extends FilaSemanalPdf {
  clave: string
  equipo: EquipoAcarreo
  porAprobarDia: number[]
}

export function PestanaSemanal() {
  const hoy = hoyEnCaracas()
  const lunesActual = lunesDeSemana(hoy)

  const [lunes, setLunes] = useState(lunesActual)
  const domingo = sumarDiasIso(lunes, 6)
  const dias = useMemo(() => diasDeLaSemana(lunes), [lunes])

  const [busqueda, setBusqueda] = useState('')
  const [companiaFiltro, setCompaniaFiltro] = useState('')
  const [rutaFiltro, setRutaFiltro] = useState('')
  const [mostrarSinViajes, setMostrarSinViajes] = useState(false)

  const [equipoAbierto, setEquipoAbierto] = useState<{
    equipo: EquipoAcarreo
    fechaBase: string
    alcance: 'dia' | 'semana'
  } | null>(null)
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [modalWhatsapp, setModalWhatsapp] = useState(false)
  const [obsSemanal, setObsSemanal] = useState('')
  const [copiado, setCopiado] = useState(false)

  const acarreosSemana = useAcarreosDiaEntre(lunes, domingo)
  const vehiculosQ = useVehiculos(true)
  const maquinasQ = useMaquinasParaViajes()
  const rutasQ = useRutasAcarreo()
  const { data: laEmpresa } = useEmpresa()
  const { nombre: yo } = useSesion()

  // Catálogo base de todos los equipos conocidos para enriquecer descripción/chofer/capacidad
  const catalogoEquipos = useMemo(() => {
    const mapa = new Map<string, EquipoAcarreo>()
    for (const v of vehiculosQ.data ?? []) {
      const eq: EquipoAcarreo = {
        vehiculoId: v.id,
        maquinaId: null,
        placa: v.placa,
        nombre: v.descripcion ?? '',
        chofer: v.chofer_actual,
        compania: v.propio ? 'Flota propia' : (v.transportista ?? 'Sin transportista'),
        cargaUtilM3: v.carga_util_m3,
        capacidadM3: v.capacidad_m3,
      }
      mapa.set(claveEquipo(eq), eq)
    }
    for (const m of maquinasQ.data ?? []) {
      const eq: EquipoAcarreo = {
        vehiculoId: null,
        maquinaId: m.id,
        placa: m.codigo,
        nombre: m.nombre,
        chofer: null,
        compania: 'Máquinas propias',
        cargaUtilM3: null,
        capacidadM3: null,
      }
      mapa.set(claveEquipo(eq), eq)
    }
    return mapa
  }, [vehiculosQ.data, maquinasQ.data])

  const filasCrudas = useMemo(() => acarreosSemana.data ?? [], [acarreosSemana.data])

  // Rutas con movimiento en la semana o activas
  const opcionesRuta = useMemo(() => {
    const nombres = new Set<string>()
    for (const r of rutasQ.data ?? []) {
      if (r.se_puede_usar) nombres.add(r.nombre)
    }
    for (const f of filasCrudas) {
      if (f.ruta) nombres.add(f.ruta)
    }
    return [...nombres].sort()
  }, [rutasQ.data, filasCrudas])

  // Filtrado previo por ruta
  const filasDeRuta = useMemo(
    () => (rutaFiltro ? filasCrudas.filter((f) => (f.ruta ?? '') === rutaFiltro) : filasCrudas),
    [filasCrudas, rutaFiltro],
  )

  // Construcción de la matriz semanal por camión
  const todasLasFilasCamion = useMemo(() => {
    const indiceDia = new Map(dias.map((d, idx) => [d.iso, idx]))
    const acumulador = new Map<
      string,
      {
        equipo: EquipoAcarreo
        porDia: number[]
        porAprobarDia: number[]
        viajes: number
        porAprobar: number
        m3: number
        conM3: boolean
        monto: number
        conMonto: boolean
      }
    >()

    // Si el usuario pidió ver también los que no tienen viajes, sembramos el catálogo
    if (mostrarSinViajes && !rutaFiltro) {
      for (const [clave, eq] of catalogoEquipos.entries()) {
        if (eq.maquinaId !== null) continue
        acumulador.set(clave, {
          equipo: eq,
          porDia: [0, 0, 0, 0, 0, 0, 0],
          porAprobarDia: [0, 0, 0, 0, 0, 0, 0],
          viajes: 0,
          porAprobar: 0,
          m3: 0,
          conM3: false,
          monto: 0,
          conMonto: false,
        })
      }
    }

    for (const f of filasDeRuta) {
      const clave = f.vehiculo_id !== null ? `v:${f.vehiculo_id}` : `m:${f.maquina_id ?? 0}`
      const delCatalogo = catalogoEquipos.get(clave)
      const comp =
        f.maquina_id !== null
          ? 'Máquinas propias'
          : delCatalogo?.compania ?? (f.transportista || 'Sin transportista')

      const actual = acumulador.get(clave) ?? {
        equipo: delCatalogo ?? {
          vehiculoId: f.vehiculo_id,
          maquinaId: f.maquina_id,
          placa: f.placa ?? '—',
          nombre: f.vehiculo ?? '',
          chofer: f.chofer,
          compania: comp,
          cargaUtilM3: null,
          capacidadM3: null,
        },
        porDia: [0, 0, 0, 0, 0, 0, 0],
        porAprobarDia: [0, 0, 0, 0, 0, 0, 0],
        viajes: 0,
        porAprobar: 0,
        m3: 0,
        conM3: false,
        monto: 0,
        conMonto: false,
      }

      if (!actual.equipo.chofer && f.chofer) {
        actual.equipo = { ...actual.equipo, chofer: f.chofer }
      }

      const idx = indiceDia.get(f.fecha)
      if (idx !== undefined) {
        actual.porDia[idx] += f.viajes
        actual.porAprobarDia[idx] += f.por_aprobar
      }
      actual.viajes += f.viajes
      actual.porAprobar += f.por_aprobar
      if (f.m3 !== null) {
        actual.m3 += Number(f.m3)
        actual.conM3 = true
      }
      if (f.monto_usd !== null) {
        actual.monto += Number(f.monto_usd)
        actual.conMonto = true
      }

      acumulador.set(clave, actual)
    }

    const resultado: FilaCamionSemana[] = []
    for (const [clave, v] of acumulador.entries()) {
      if (!mostrarSinViajes && v.viajes === 0 && v.porAprobar === 0) continue
      resultado.push({
        clave,
        equipo: v.equipo,
        compania: v.equipo.compania,
        placa: v.equipo.placa,
        nombre: v.equipo.nombre,
        chofer: v.equipo.chofer,
        porDia: v.porDia,
        porAprobarDia: v.porAprobarDia,
        viajes: v.viajes,
        porAprobar: v.porAprobar,
        m3: v.conM3 ? v.m3 : null,
        montoUsd: v.conMonto ? v.monto : null,
      })
    }

    return resultado.sort(
      (a, b) => a.compania.localeCompare(b.compania) || a.placa.localeCompare(b.placa),
    )
  }, [dias, filasDeRuta, catalogoEquipos, mostrarSinViajes, rutaFiltro])

  const companiasDisponibles = useMemo(
    () => [...new Set(todasLasFilasCamion.map((f) => f.compania))].sort(),
    [todasLasFilasCamion],
  )

  const termino = busqueda.trim().toLowerCase()

  const filasFiltradas = useMemo(
    () =>
      todasLasFilasCamion.filter((f) => {
        if (companiaFiltro && f.compania !== companiaFiltro) return false
        if (!termino) return true
        const bolsa = [f.placa, f.nombre, f.chofer ?? '', f.compania].join(' ').toLowerCase()
        return bolsa.includes(termino)
      }),
    [todasLasFilasCamion, companiaFiltro, termino],
  )

  const clavesVisibles = useMemo(
    () => new Set(filasFiltradas.map((f) => f.clave)),
    [filasFiltradas],
  )

  // Resumen semanal por ruta coherente con los filtros activos (compañía / búsqueda)
  const resumenPorRuta = useMemo<ResumenRutaSemanalPdf[]>(() => {
    const mapa = new Map<
      string,
      {
        ruta: string
        equipos: Set<string>
        viajes: number
        porAprobar: number
        m3: number
        conM3: boolean
        usd: number
        conUsd: boolean
      }
    >()

    for (const f of filasDeRuta) {
      const clave = f.vehiculo_id !== null ? `v:${f.vehiculo_id}` : `m:${f.maquina_id ?? 0}`
      if (!clavesVisibles.has(clave)) continue
      if (f.viajes === 0 && f.por_aprobar === 0) continue
      const nombreRuta = f.ruta ?? 'Sin ruta'
      const item = mapa.get(nombreRuta) ?? {
        ruta: nombreRuta,
        equipos: new Set<string>(),
        viajes: 0,
        porAprobar: 0,
        m3: 0,
        conM3: false,
        usd: 0,
        conUsd: false,
      }
      item.equipos.add(clave)
      item.viajes += f.viajes
      item.porAprobar += f.por_aprobar
      if (f.m3 !== null) {
        item.m3 += Number(f.m3)
        item.conM3 = true
      }
      if (f.monto_usd !== null) {
        item.usd += Number(f.monto_usd)
        item.conUsd = true
      }
      mapa.set(nombreRuta, item)
    }

    return [...mapa.values()]
      .map((r) => ({
        ruta: r.ruta,
        equipos: r.equipos.size,
        viajes: r.viajes,
        porAprobar: r.porAprobar,
        m3: r.conM3 ? r.m3 : null,
        montoUsd: r.conUsd ? r.usd : null,
      }))
      .sort((a, b) => b.viajes - a.viajes)
  }, [filasDeRuta, clavesVisibles])

  const kpis = useMemo(() => {
    const activos = filasFiltradas.filter((f) => f.viajes > 0 || f.porAprobar > 0).length
    const viajes = filasFiltradas.reduce((s, f) => s + f.viajes, 0)
    const porAprobar = filasFiltradas.reduce((s, f) => s + f.porAprobar, 0)
    const conM3 = filasFiltradas.some((f) => f.m3 !== null)
    const m3 = filasFiltradas.reduce((s, f) => s + Number(f.m3 ?? 0), 0)
    const hayDinero = filasFiltradas.some((f) => f.montoUsd !== null)
    const usd = filasFiltradas.reduce((s, f) => s + Number(f.montoUsd ?? 0), 0)
    return { activos, viajes, porAprobar, conM3, m3, hayDinero, usd }
  }, [filasFiltradas])

  const porCompania = useMemo(() => {
    const mapa = new Map<string, FilaCamionSemana[]>()
    for (const f of filasFiltradas) {
      mapa.set(f.compania, [...(mapa.get(f.compania) ?? []), f])
    }
    return [...mapa.entries()]
  }, [filasFiltradas])

  const imprimirPdf = async () => {
    setPdf(
      await armarReporteSemanalDeAcarreos({
        desde: lunes,
        hasta: domingo,
        diasCortos: dias.map((d) => d.corto),
        companiaFiltro: companiaFiltro || null,
        rutaFiltro: rutaFiltro || null,
        filas: filasFiltradas,
        rutas: resumenPorRuta,
        hayDinero: kpis.hayDinero,
        empresa_papel: empresaDelPapel(laEmpresa),
        emitidoPor: yo ?? '',
        momento: new Date(),
      }),
    )
  }

  const exportarCsv = () => {
    const sufijo = companiaFiltro
      ? `-${companiaFiltro.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
      : ''
    descargarCsv(
      `acarreos-semana-${lunes}_a_${domingo}${sufijo}.csv`,
      [
        'Compania',
        'Placa',
        'Descripcion',
        'Chofer',
        ...dias.map((d) => `${d.etiqueta} ${d.corto}`),
        'Viajes aprobados',
        'Por aprobar',
        'Metros cubicos',
        'Monto USD',
      ],
      filasFiltradas.map((f) => [
        f.compania,
        f.placa,
        f.nombre,
        f.chofer ?? '',
        ...f.porDia,
        f.viajes,
        f.porAprobar,
        f.m3 ?? '',
        f.montoUsd ?? '',
      ]),
    )
  }

  const textoWhatsapp = useMemo(
    () =>
      textoDelReporteSemanal({
        desde: lunes,
        hasta: domingo,
        razonSocial: laEmpresa?.razon_social ?? '',
        companiaFiltro: companiaFiltro || null,
        filas: filasFiltradas.filter((f) => f.viajes > 0 || f.porAprobar > 0),
        rutas: resumenPorRuta,
        hayDinero: kpis.hayDinero,
        observaciones: obsSemanal,
      }),
    [
      lunes,
      domingo,
      laEmpresa?.razon_social,
      companiaFiltro,
      filasFiltradas,
      resumenPorRuta,
      kpis.hayDinero,
      obsSemanal,
    ],
  )

  const esSemanaActual = lunes === lunesActual

  return (
    <>
      {/* Navegador de semana (Lunes a Domingo) y acciones de exportación */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <p className="text-ink/55 mb-1.5 text-xs font-medium">
              Semana (Lunes {fmtFecha(lunes)} al Domingo {fmtFecha(domingo)})
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                icon={<ChevronLeft />}
                onClick={() => setLunes(sumarDiasIso(lunes, -7))}
                title="Semana anterior"
              >
                Anterior
              </Button>
              <input
                type="date"
                value={lunes}
                max={hoy}
                aria-label="Elegir fecha de la semana"
                onChange={(e) => {
                  if (esFechaIso(e.target.value)) setLunes(lunesDeSemana(e.target.value))
                }}
                className="rounded-control border-ink/20 bg-surface text-ink/85 h-8 border px-2.5 text-xs"
              />
              <Button
                variant={esSemanaActual ? 'primary' : 'outline'}
                size="sm"
                icon={<CalendarRange />}
                onClick={() => setLunes(lunesActual)}
              >
                Esta semana
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={lunes >= lunesActual}
                onClick={() => {
                  const sig = sumarDiasIso(lunes, 7)
                  setLunes(sig > lunesActual ? lunesActual : sig)
                }}
                title="Semana siguiente"
              >
                Siguiente
                <ChevronRight className="ml-1 size-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            icon={<Printer />}
            disabled={filasFiltradas.length === 0}
            onClick={() => void imprimirPdf()}
          >
            PDF semanal
          </Button>
          <Button
            variant="outline"
            icon={<Download />}
            disabled={filasFiltradas.length === 0}
            onClick={exportarCsv}
          >
            Descargar CSV
          </Button>
          <Button
            variant="outline"
            icon={<MessageSquare />}
            disabled={kpis.activos === 0}
            onClick={() => {
              setCopiado(false)
              setModalWhatsapp(true)
            }}
          >
            Resumen WhatsApp
          </Button>
        </div>
      </div>

      {/* Tarjetas KPI de la semana */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <p className="text-ink/45 text-2xs font-mono tracking-[0.14em] uppercase">
            Viajes de la semana
          </p>
          <p className="tabular text-ink/90 mt-2 text-2xl font-semibold">{enteros(kpis.viajes)}</p>
          <p className="text-ink/50 mt-1 text-xs">
            {kpis.porAprobar > 0 ? (
              <span className="text-warning">+{enteros(kpis.porAprobar)} pendientes por aprobar</span>
            ) : (
              'Aprobados y contabilizados'
            )}
          </p>
        </Card>

        <Card>
          <p className="text-ink/45 text-2xs font-mono tracking-[0.14em] uppercase">
            Volumen semanal
          </p>
          <p className="tabular text-ink/90 mt-2 text-2xl font-semibold">
            {kpis.conM3 ? `${enteros(kpis.m3)} m³` : '—'}
          </p>
          <p className="text-ink/50 mt-1 text-xs">Material acarreado en la semana</p>
        </Card>

        <Card>
          <p className="text-ink/45 text-2xs font-mono tracking-[0.14em] uppercase">
            Camiones con viajes
          </p>
          <p className="tabular text-ink/90 mt-2 text-2xl font-semibold">
            {enteros(kpis.activos)}
          </p>
          <p className="text-ink/50 mt-1 text-xs">
            En {porCompania.length} {porCompania.length === 1 ? 'compañía' : 'compañías'}
          </p>
        </Card>

        <Card>
          <p className="text-ink/45 text-2xs font-mono tracking-[0.14em] uppercase">
            Monto de la semana
          </p>
          <p className="tabular text-ink/90 mt-2 text-2xl font-semibold">
            {kpis.hayDinero ? dolares(kpis.usd) : '—'}
          </p>
          <p className="text-ink/50 mt-1 text-xs">Total acumulado (Lun a Dom)</p>
        </Card>
      </div>

      {/* Barra de búsqueda y desglose */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[230px] flex-1">
            <Input
              label="Buscar camión, modelo, chofer o compañía"
              value={busqueda}
              sinNormalizar
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Ej. 02GBAB, Kodia rojo, Savanna, nombre del chofer…"
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
              ...opcionesRuta.map((r) => ({ valor: r, etiqueta: r })),
            ]}
            className="w-60"
          />

          <Button
            variant={mostrarSinViajes ? 'primary' : 'outline'}
            icon={<Filter />}
            onClick={() => setMostrarSinViajes((v) => !v)}
            className="mb-0.5"
          >
            {mostrarSinViajes ? 'Viendo toda la flota' : 'Incluir camiones sin viajes'}
          </Button>
        </div>
      </Card>

      {/* Resumen semanal por ruta (clicable para filtrar) */}
      {resumenPorRuta.length > 0 ? (
        <div className="mb-5">
          <p className="text-ink/55 mb-2 flex items-center gap-1.5 text-xs font-medium">
            <Route className="size-3.5" />
            Desglose semanal por ruta (toque una ruta para filtrar la matriz)
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {resumenPorRuta.map((r) => {
              const activa = rutaFiltro === r.ruta
              return (
                <button
                  key={r.ruta}
                  type="button"
                  onClick={() => setRutaFiltro(activa ? '' : r.ruta)}
                  className={cn(
                    'rounded-card border px-3.5 py-2.5 text-left transition-colors',
                    activa
                      ? 'border-royal-600 bg-royal-600/8'
                      : 'border-hairline bg-surface hover:border-ink/25',
                  )}
                >
                  <p className="text-ink/85 truncate text-xs font-semibold" title={r.ruta}>
                    {r.ruta}
                  </p>
                  <p className="text-ink/60 tabular mt-1 text-xs">
                    <strong className="text-ink/90">{enteros(r.viajes)}</strong> viajes ·{' '}
                    {enteros(r.equipos)} {r.equipos === 1 ? 'equipo' : 'equipos'}
                    {r.m3 !== null ? ` · ${enteros(r.m3)} m³` : ''}
                    {kpis.hayDinero && r.montoUsd !== null ? ` · ${dolares(r.montoUsd)}` : ''}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {acarreosSemana.isPending ? <Cargando /> : null}
      {acarreosSemana.error ? <ErrorDeCarga error={acarreosSemana.error} /> : null}

      {!acarreosSemana.isPending && !acarreosSemana.error && filasFiltradas.length === 0 ? (
        <Card>
          <Vacio
            icono={<Truck />}
            titulo="Sin acarreos en esta semana con los filtros actuales"
            descripcion="Pruebe otra semana con los botones «Anterior / Esta semana», limpie la búsqueda o pulse «Incluir camiones sin viajes»."
          />
        </Card>
      ) : null}

      {/* Matriz semanal por compañía y camión */}
      {porCompania.length > 0 ? (
        <div className="space-y-5">
          {porCompania.map(([comp, camiones]) => {
            const subDias = [0, 1, 2, 3, 4, 5, 6].map((i) =>
              camiones.reduce((s, c) => s + (c.porDia[i] ?? 0), 0),
            )
            const subViajes = camiones.reduce((s, c) => s + c.viajes, 0)
            const subPorAprobar = camiones.reduce((s, c) => s + c.porAprobar, 0)
            const subConM3 = camiones.some((c) => c.m3 !== null)
            const subM3 = camiones.reduce((s, c) => s + Number(c.m3 ?? 0), 0)
            const subUsd = camiones.reduce((s, c) => s + Number(c.montoUsd ?? 0), 0)

            return (
              <section key={comp}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-ink/85 text-sm font-semibold">
                    {comp}{' '}
                    <span className="text-ink/45 font-normal">
                      · {camiones.length} {camiones.length === 1 ? 'equipo' : 'equipos'} ·{' '}
                      {enteros(subViajes)} viajes
                      {kpis.hayDinero ? ` · ${dolares(subUsd)}` : ''}
                    </span>
                  </h2>
                </div>

                <Card flush>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[880px] text-sm">
                      <thead>
                        <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                          <th className="px-4 py-3 font-medium">Camión / Modelo</th>
                          {dias.map((d) => (
                            <th
                              key={d.iso}
                              className="px-2 py-2.5 text-right font-medium whitespace-nowrap"
                            >
                              <span className="block">{d.etiqueta}</span>
                              <span className="text-ink/35 font-normal">{d.corto}</span>
                            </th>
                          ))}
                          <th className="px-3 py-3 text-right font-medium">Total</th>
                          <th className="px-3 py-3 text-right font-medium">m³</th>
                          <th className="px-3 py-3 text-right font-medium">Monto</th>
                          <th className="px-4 py-3 text-right font-medium" />
                        </tr>
                      </thead>
                      <tbody>
                        {camiones.map((c) => (
                          <tr
                            key={c.clave}
                            onClick={() =>
                              setEquipoAbierto({
                                equipo: c.equipo,
                                fechaBase: lunes,
                                alcance: 'semana',
                              })
                            }
                            className="border-hairline hover:bg-ink/4 cursor-pointer border-b transition-colors last:border-0"
                          >
                            <td className="px-4 py-2.5">
                              <p className="tabular text-ink/90 font-medium">{c.placa}</p>
                              <p className="text-ink/50 text-xs">
                                {[c.nombre, c.chofer].filter(Boolean).join(' · ') || '—'}
                              </p>
                            </td>
                            {dias.map((d, idx) => {
                              const n = c.porDia[idx] ?? 0
                              const esp = c.porAprobarDia[idx] ?? 0
                              return (
                                <td
                                  key={d.iso}
                                  onClick={(ev) => {
                                    if (n > 0 || esp > 0) {
                                      ev.stopPropagation()
                                      setEquipoAbierto({
                                        equipo: c.equipo,
                                        fechaBase: d.iso,
                                        alcance: 'dia',
                                      })
                                    }
                                  }}
                                  title={
                                    n > 0 || esp > 0
                                      ? `Ver viajes de ${c.placa} el ${fmtFecha(d.iso)}`
                                      : undefined
                                  }
                                  className={cn(
                                    'tabular px-2 py-2.5 text-right',
                                    n > 0 || esp > 0
                                      ? 'text-ink/85 hover:text-royal-600 font-medium'
                                      : 'text-ink/20',
                                  )}
                                >
                                  {n > 0 ? enteros(n) : esp > 0 ? null : '—'}
                                  {esp > 0 ? (
                                    <span className="text-warning block text-2xs">+{esp}</span>
                                  ) : null}
                                </td>
                              )
                            })}
                            <td className="tabular text-ink/90 px-3 py-2.5 text-right font-semibold">
                              {enteros(c.viajes)}
                              {c.porAprobar > 0 ? (
                                <span className="text-warning block text-2xs font-normal">
                                  +{enteros(c.porAprobar)} pend.
                                </span>
                              ) : null}
                            </td>
                            <td className="tabular text-ink/80 px-3 py-2.5 text-right">
                              {c.m3 !== null ? enteros(c.m3) : <span className="text-ink/25">—</span>}
                            </td>
                            <td className="tabular text-ink/90 px-3 py-2.5 text-right font-medium">
                              {c.montoUsd !== null ? (
                                dolares(c.montoUsd)
                              ) : (
                                <span className="text-ink/25">—</span>
                              )}
                            </td>
                            <td
                              className="px-4 py-2.5 text-right"
                              onClick={(ev) => ev.stopPropagation()}
                            >
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setEquipoAbierto({
                                    equipo: c.equipo,
                                    fechaBase: lunes,
                                    alcance: 'semana',
                                  })
                                }
                              >
                                Abrir viajes
                              </Button>
                            </td>
                          </tr>
                        ))}

                        {/* Subtotal de la compañía */}
                        <tr className="bg-ink/3 text-ink/85 font-medium">
                          <td className="px-4 py-2.5 text-xs uppercase">Subtotal {comp}</td>
                          {subDias.map((n, idx) => (
                            <td key={dias[idx].iso} className="tabular px-2 py-2.5 text-right">
                              {n > 0 ? enteros(n) : <span className="text-ink/25">—</span>}
                            </td>
                          ))}
                          <td className="tabular px-3 py-2.5 text-right font-semibold">
                            {enteros(subViajes)}
                            {subPorAprobar > 0 ? (
                              <span className="text-warning block text-2xs font-normal">
                                +{enteros(subPorAprobar)}
                              </span>
                            ) : null}
                          </td>
                          <td className="tabular px-3 py-2.5 text-right">
                            {subConM3 ? enteros(subM3) : <span className="text-ink/25">—</span>}
                          </td>
                          <td className="tabular px-3 py-2.5 text-right font-semibold">
                            {kpis.hayDinero ? (
                              dolares(subUsd)
                            ) : (
                              <span className="text-ink/25">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5" />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Card>
              </section>
            )
          })}
        </div>
      ) : null}

      {equipoAbierto ? (
        <DetalleEquipoModal
          equipo={equipoAbierto.equipo}
          fechaBase={equipoAbierto.fechaBase}
          alcanceInicial={equipoAbierto.alcance}
          rangoInicial={
            equipoAbierto.alcance === 'semana' ? { desde: lunes, hasta: domingo } : undefined
          }
          onCerrar={() => setEquipoAbierto(null)}
        />
      ) : null}

      <Modal
        abierto={modalWhatsapp}
        onCerrar={() => setModalWhatsapp(false)}
        titulo="Resumen semanal para WhatsApp"
        descripcion={`Semana del lunes ${fmtFecha(lunes)} al domingo ${fmtFecha(domingo)}. Listo para copiar y enviar.`}
        ancho="lg"
        acciones={
          <>
            <Button variant="ghost" onClick={() => setModalWhatsapp(false)}>
              Cerrar
            </Button>
            <Button
              variant="outline"
              icon={<Download />}
              onClick={() => {
                const blob = new Blob([textoWhatsapp], { type: 'text/plain;charset=utf-8' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `resumen-semanal-acarreos-${lunes}_a_${domingo}.txt`
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              Descargar .txt
            </Button>
            <Button
              icon={copiado ? <Check /> : <ClipboardCopy />}
              onClick={async () => setCopiado(await copiarAlPortapapeles(textoWhatsapp))}
            >
              {copiado ? 'Copiado' : 'Copiar resumen'}
            </Button>
          </>
        }
      >
        <Textarea
          label="Observaciones de la semana (opcional)"
          placeholder="Novedades de flota, paradas de planta o acuerdos de la semana…"
          rows={2}
          sinNormalizar
          value={obsSemanal}
          onChange={(e) => {
            setObsSemanal(e.target.value)
            setCopiado(false)
          }}
        />
        <p className="text-ink/45 mt-3 mb-1.5 text-xs">Vista previa del mensaje</p>
        <pre className="bg-ink/4 text-ink/80 max-h-80 overflow-auto rounded-[6px] p-3 text-xs leading-relaxed whitespace-pre-wrap">
          {textoWhatsapp}
        </pre>
      </Modal>

      <Visor
        abierto={pdf !== null}
        onCerrar={() => setPdf(null)}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ''}
        titulo="Reporte semanal de acarreos internos"
      />
    </>
  )
}
