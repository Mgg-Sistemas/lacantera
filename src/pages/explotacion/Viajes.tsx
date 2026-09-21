/*
  Viajes de camiones.

  Sustituye tres hojas de Excel: la planilla diaria por camión, el registro de
  pago por empresa, y el resumen de transporte del reporte de operaciones.

  DOS DECISIONES QUE SE VEN EN LA PANTALLA

  1. Se carga por cantidad y la cantidad SUMA. Debajo del campo se dice qué va
     a quedar —«ya tiene 3, quedarán 8»— porque el error del otro proyecto fue
     que alguien tecleara el total del día creyendo que reemplazaba.

  2. Lo que no se sabe va en blanco. Un camión sin carga útil cargada enseña un
     guion en los metros cúbicos, no un cero, y el pie de la lista dice cuántos
     camiones no están sumando. Un total corto sin explicación es peor que no
     tener total.

  Y DESDE EL 16/09/2026, TRES MÁS

  3. Las columnas son RUTAS, no tres tramos fijos. Christopher: «¿qué pasa si
     mañana cierra o abre una nueva planta?». Una ruta nueva aparece sola como
     columna, y una apagada deja de ofrecerse sin que desaparezcan sus viajes.

  4. Todo viaje nuevo nace POR APROBAR y no cuenta para el pago hasta que lo
     aprueba «por lo mínimo un analista o responsable». La tabla enseña los que
     cuentan y, al lado, los que esperan; arriba está lo que hay que decidir.

  5. El viaje dice cómo volvió: completo, parcial o vacío. «En cada viaje se
     debe obtener material, aunque debemos evaluar la posibilidad de que algún
     camión vuelva sin carga o sin carga completa».
*/
import { useState } from 'react'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  Ban,
  Check,
  ClipboardCopy,
  Coins,
  Download,
  MessageSquare,
  Pencil,
  Plus,
  Printer,
  Route,
  Truck,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
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
  puedoDecidirViaje,
  tarifaEnPalabras,
  useAcarreosDelDia,
  useAcarreosDeEquipo,
  useAcarreosDia,
  useAjustarPrecioDeViajes,
  useAnularAcarreo,
  useAprobarViajes,
  useComoApruebo,
  useCorregirAcarreo,
  useEquiposEnOperacion,
  useMaquinasParaViajes,
  usePagoDeAcarreosEntre,
  useRechazarViajes,
  useRegistrarViajes,
  useRutasAcarreo,
  type Acarreo,
  type AcarreoDia,
  type CargaDelViaje,
  type RutaAcarreo,
} from '@/lib/api/acarreos'
import { useVehiculos, type Vehiculo } from '@/lib/api/vehiculos'
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

/** Un número que puede no saberse. El guion es la respuesta, no un hueco. */
function Cifra({ valor, comoDinero = false }: { valor: string | null; comoDinero?: boolean }) {
  if (valor === null) return <span className="text-ink/25">—</span>
  return <>{comoDinero ? dolares(valor) : enteros(valor)}</>
}

/** Quién hizo los viajes: un camión de tercero o una máquina propia. */
interface Equipo {
  vehiculoId: number | null
  maquinaId: number | null
  placa: string
  detalle: string
}

const esDe = (f: { vehiculo_id: number | null; maquina_id: number | null }, e: Equipo) =>
  e.vehiculoId !== null ? f.vehiculo_id === e.vehiculoId : f.maquina_id === e.maquinaId

export function Viajes() {
  const [pestana, setPestana] = useState<'dia' | 'pago'>('dia')

  return (
    <>
      <PageHeader
        title="Viajes de camiones"
        description="Cuántos viajes hizo cada camión o máquina y por qué ruta. Cada viaje nuevo espera a que lo apruebe el responsable de la mina o planta, o quien tenga la casilla de aprobar: hasta entonces no cuenta para el pago."
        actions={
          <Link to="/app/explotacion/plantas">
            <Button variant="outline" icon={<Route />}>
              Plantas y rutas
            </Button>
          </Link>
        }
      />

      <div className="border-hairline mb-5 flex gap-1 border-b">
        {(
          [
            { id: 'dia', etiqueta: 'Viajes del día' },
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

      {pestana === 'dia' ? <PestanaDia /> : <PestanaPago />}
    </>
  )
}

/* ══════════════════════════════════════════════════════ los viajes del día */

function PestanaDia() {
  const [dia, setDia] = useState(hoyEnCaracas())
  const [detalle, setDetalle] = useState<Equipo | null>(null)
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [conDescartados, setConDescartados] = useState(false)
  const [rehaciendo, setRehaciendo] = useState(false)
  const [reporte, setReporte] = useState(false)

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

  const filas = dias.data ?? []
  const flota = vehiculos.data ?? []
  const listaRutas = rutas.data ?? []
  const usables = listaRutas.filter((r) => r.se_puede_usar)

  /* Las columnas: las rutas que se pueden usar, y además las que tienen
     viajes ese día aunque ya estén apagadas o su planta cerrada. Un viaje no
     desaparece de la tabla porque su ruta se apague después. */
  const columnas = listaRutas.filter(
    (r) => r.se_puede_usar || filas.some((f) => f.ruta_id === r.id),
  )

  // Lo que ya tiene cada equipo hoy en una ruta, esperen o no, para decir «quedarán 8».
  const yaTiene = (e: Equipo, rutaId: number) =>
    filas
      .filter((f) => esDe(f, e) && f.ruta_id === rutaId)
      .reduce((s, f) => s + f.viajes + f.por_aprobar, 0)

  const totalViajes = filas.reduce((s, f) => s + f.viajes, 0)
  const totalPorAprobar = filas.reduce((s, f) => s + f.por_aprobar, 0)
  const totalM3 = filas.reduce((s, f) => s + Number(f.m3 ?? 0), 0)
  const sinCarga = filas.reduce((s, f) => s + f.sin_carga, 0)
  const hayDinero = filas.some((f) => f.monto_usd !== null)
  const totalUsd = filas.reduce((s, f) => s + Number(f.monto_usd ?? 0), 0)

  // Los camiones se agrupan por empresa porque es a la empresa a quien se le
  // paga, no al camión.
  const porEmpresa = new Map<string, Vehiculo[]>()
  for (const v of flota) {
    const empresa = v.propio ? 'Flota propia' : (v.transportista ?? 'Sin transportista')
    porEmpresa.set(empresa, [...(porEmpresa.get(empresa) ?? []), v])
  }

  const deCamion = (v: Vehiculo): Equipo => ({
    vehiculoId: v.id,
    maquinaId: null,
    placa: v.placa,
    detalle: [v.chofer_actual, v.descripcion].filter(Boolean).join(' · ') || 'Sin chofer asignado',
  })

  const listaMaquinas = maquinas.data ?? []
  const maquinasDelDia = listaMaquinas.filter((m) => filas.some((f) => f.maquina_id === m.id))

  /* El papel se arma de los viajes sueltos, no de la vista agrupada: la
     planilla imprime viaje por viaje, con su número y su hora. */
  const imprimir = async (conDescartados = false) => {
    const viajes = todos.data ?? []
    const placas = [...new Set(viajes.map((v) => v.placa ?? '—'))]
    // Leídas al armar: con la consulta en camino, el papel saldría sin las
    // firmas que sus dueños eligieron poner.
    const guardadas = await qc.fetchQuery({
      queryKey: ['firmas'],
      queryFn: leerFirmasEncendidas,
      staleTime: 5 * 60_000,
    })

    setPdf(
      await armarRegistroDeViajes({
        dia,
        empresa: null,
        // Quien solo cargó viajes que luego se descartaron no firma un papel
        // que no los lista.
        firmas: quienesFirmanElDia(
          conDescartados
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
        conDescartados,
        empresa_papel: empresaDelPapel(laEmpresa),
        emitidoPor: yo ?? '',
        momento: new Date(),
      }),
    )
  }

  /*
    Lo anulado y lo rechazado no va en el papel salvo que se pida. La casilla
    solo aparece si ese día hubo alguno: sin ninguno, no hay nada que decidir.
  */
  const hayDescartados = (todos.data ?? []).some(
    (v) => v.estado === 'ANULADO' || v.estado === 'RECHAZADO',
  )

  const tabla = (equipos: Equipo[]) => (
    <Card flush>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-ink/45 border-hairline border-b text-left text-xs">
              <th className="px-5 py-3 font-medium">Camión o máquina</th>
              {columnas.map((r) => (
                <th key={r.id} className="max-w-40 px-3 py-3 text-right font-medium" title={r.nombre}>
                  {r.nombre}
                </th>
              ))}
              <th className="px-3 py-3 text-right font-medium">m³</th>
              <th className="px-3 py-3 text-right font-medium">Se le debe</th>
              <th className="px-5 py-3 text-right font-medium" />
            </tr>
          </thead>
          <tbody>
            {equipos.map((e) => (
              <FilaEquipo
                key={`${e.vehiculoId ?? 'm'}-${e.maquinaId ?? 'v'}`}
                equipo={e}
                columnas={columnas}
                filas={filas.filter((f) => esDe(f, e))}
                onDetalle={() => setDetalle(e)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Input
            label="Día"
            type="date"
            value={dia}
            max={hoyEnCaracas()}
            onChange={(e) => setDia(e.target.value)}
            className="w-48"
          />
          <Button
            variant="outline"
            icon={<Printer />}
            disabled={(todos.data ?? []).length === 0}
            onClick={() => void imprimir()}
            className="mb-0.5"
          >
            Imprimir el día
          </Button>
          <Button
            variant="outline"
            icon={<MessageSquare />}
            onClick={() => setReporte(true)}
            className="mb-0.5"
          >
            Reporte de operaciones
          </Button>
        </div>
        <CajaDeTarifas rutas={usables} />
      </div>

      {vehiculos.isPending || dias.isPending || rutas.isPending ? <Cargando /> : null}
      {vehiculos.error ? <ErrorDeCarga error={vehiculos.error} /> : null}
      {dias.error ? <ErrorDeCarga error={dias.error} /> : null}
      {rutas.error ? <ErrorDeCarga error={rutas.error} /> : null}

      <PorAprobar viajes={todos.data ?? []} />

      {!rutas.isPending && usables.length === 0 ? (
        <Card className="mb-4">
          <Vacio
            icono={<Route />}
            titulo="No hay ninguna ruta abierta"
            descripcion="Los viajes se cargan por ruta, de un sitio a otro. Se crean en Explotación › Plantas y rutas."
          />
        </Card>
      ) : null}

      {!vehiculos.isPending && !vehiculos.error && flota.length === 0 ? (
        <Card>
          <Vacio
            icono={<Truck />}
            titulo="Todavía no hay camiones cargados"
            descripcion="Los viajes se anotan por camión, así que primero hay que dar de alta la flota en Maquinaria › Equipos, con su placa y su capacidad."
          />
        </Card>
      ) : null}

      {flota.length > 0 || maquinasDelDia.length > 0 ? (
        <div className="space-y-5">
          {[...porEmpresa.entries()].map(([empresa, camiones]) => (
            <section key={empresa}>
              <h2 className="text-ink/80 mb-2 text-sm font-semibold">{empresa}</h2>
              {tabla(camiones.map(deCamion))}

              {escribe ? (
                <CargarViajes
                  dia={dia}
                  equipos={camiones.map(deCamion)}
                  rutas={usables}
                  yaTiene={yaTiene}
                />
              ) : null}
            </section>
          ))}

          {/*
            LAS MÁQUINAS PROPIAS, APARTE.

            Un payloader o un articulado que mueve material entre la mina y las
            plantas no es un camión de tercero ni se le paga a una empresa. Sale
            aquí para que su viaje quede contado con su ruta; cuánto se paga, lo
            dice la ruta como con cualquier otro.
          */}
          {escribe || maquinasDelDia.length > 0 ? (
            <section>
              <h2 className="text-ink/80 mb-2 text-sm font-semibold">Máquinas propias</h2>
              {maquinasDelDia.length > 0 ? (
                tabla(
                  maquinasDelDia.map((m) => ({
                    vehiculoId: null,
                    maquinaId: m.id,
                    placa: m.codigo,
                    detalle: m.nombre,
                  })),
                )
              ) : (
                <p className="text-ink/45 text-xs">Ninguna máquina propia hizo viajes este día.</p>
              )}
              {escribe && listaMaquinas.length > 0 ? (
                <CargarViajes
                  dia={dia}
                  equipos={listaMaquinas.map((m) => ({
                    vehiculoId: null,
                    maquinaId: m.id,
                    placa: m.codigo,
                    detalle: m.nombre,
                  }))}
                  rutas={usables}
                  yaTiene={yaTiene}
                />
              ) : null}
            </section>
          ) : null}

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-ink/45 text-xs">Total del día (lo aprobado y lo anterior a la aprobación)</p>
                <p className="tabular text-ink/90 text-lg font-semibold">
                  {enteros(totalViajes)} viajes · {enteros(totalM3)} m³
                  {hayDinero ? ` · ${dolares(totalUsd)}` : ''}
                </p>
                {totalPorAprobar > 0 ? (
                  <p className="text-warning mt-0.5 text-xs">
                    Además, {enteros(totalPorAprobar)}{' '}
                    {totalPorAprobar === 1 ? 'viaje espera' : 'viajes esperan'} aprobación y todavía no
                    cuentan.
                  </p>
                ) : null}
              </div>
              {sinCarga > 0 ? (
                <p className="text-warning max-w-md text-xs leading-relaxed">
                  {enteros(sinCarga)} {sinCarga === 1 ? 'viaje no suma' : 'viajes no suman'} metros
                  cúbicos: esos camiones no tienen carga útil cargada. Cuentan y cobran, pero el
                  total de m³ no los incluye.
                </p>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}

      {detalle ? (
        <DetalleDelEquipo dia={dia} equipo={detalle} onCerrar={() => setDetalle(null)} />
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
        titulo="Registro diario de viajes"
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

/**
 * Lo que espera una decisión, arriba y agrupado.
 *
 * Por equipo y ruta, porque así se aprueba en la vida real: «los 12 del
 * A74AB3P a la planta fija». Cada grupo dice cómo volvieron sus viajes —un
 * vacío no se aprueba sin verlo— y los botones solo salen a quien puede
 * decidir sobre esa ruta.
 */
function PorAprobar({ viajes }: { viajes: Acarreo[] }) {
  const como = useComoApruebo()
  const aprobar = useAprobarViajes()
  const [rechazando, setRechazando] = useState<GrupoPorAprobar | null>(null)
  const [ajustando, setAjustando] = useState<GrupoPorAprobar | null>(null)
  /*
    La firma de quien aprueba, marcada de entrada y una sola vez para toda la
    bandeja: aprobar es de a grupos, y preguntarlo en cada botón sería pedir lo
    mismo doce veces. Solo a quien tiene una firma encendida.
  */
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
            Por aprobar · {enteros(esperando.length)} {esperando.length === 1 ? 'viaje' : 'viajes'}
          </h2>
          <p className="text-ink/55 mt-0.5 max-w-2xl text-xs leading-relaxed">
            Todavía no cuentan para el pago. Los aprueba o rechaza el responsable de la mina o
            planta de origen o de destino, o quien tenga la casilla «Aprobar o rechazar viajes».
            {decidibles.length === 0
              ? ' Tú no puedes decidir sobre ninguno de estos.'
              : ''}
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
              Vale para lo que apruebes aquí. Sin marcar, la raya sale en blanco con tu nombre
              debajo.
            </span>
          </span>
        </label>
      ) : null}

      <ul className="divide-hairline mt-3 divide-y">
        {lista.map((g) => {
          const puedo = puedoDecidirViaje(como.data, g)
          return (
            <li key={g.clave} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 text-sm">
                <p className="text-ink/85">
                  <span className="tabular font-medium">{g.equipo}</span> · {g.ruta}
                </p>
                <p className="text-ink/50 text-xs">
                  {enteros(g.ids.length)} {g.ids.length === 1 ? 'viaje' : 'viajes'}:{' '}
                  {comoVolvieron(g.cargas) || 'sin decir cómo volvieron'}
                  {g.hayM3 ? ` · ${enteros(g.m3)} m³` : ''}
                  {g.deMaquina ? ' · máquina propia: no se paga por viaje' : g.hayDinero ? ` · ${dolares(g.monto)}` : ''}
                </p>
                {g.viajes.some((v) => v.motivo_ajuste) ? (
                  <p className="text-ink/45 text-xs">
                    Precio ajustado en {g.viajes.filter((v) => v.motivo_ajuste).length} de ellos.
                  </p>
                ) : null}
              </div>
              {puedo ? (
                <div className="flex gap-2">
                  {/* Un parcial o un vacío se paga lo que diga quien aprueba. Para
                      decidirlo hay que ver el dinero, y una máquina propia no cobra. */}
                  {!g.deMaquina && g.hayDinero ? (
                    <Button size="sm" variant="ghost" icon={<Coins />} onClick={() => setAjustando(g)}>
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
                  <Button size="sm" variant="ghost" icon={<X />} onClick={() => setRechazando(g)}>
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
      {ajustando ? (
        <AjustarPrecio grupo={ajustando} onCerrar={() => setAjustando(null)} />
      ) : null}
    </Card>
  )
}

/*
  AJUSTAR EL PRECIO ANTES DE APROBAR.

  Christopher, sobre un viaje que vuelve a medias o vacío: «lo decide quien
  aprueba». Aquí se ve cómo volvió cada uno y lo que trae de su ruta, y se le
  pone otro precio a los que se marquen, con motivo. Vienen marcados los
  parciales y los vacíos, que son los que suelen cambiar; los completos se marcan
  a mano si también hace falta.
*/
function AjustarPrecio({ grupo, onCerrar }: { grupo: GrupoPorAprobar; onCerrar: () => void }) {
  const ajustar = useAjustarPrecioDeViajes()
  const [marcados, setMarcados] = useState<number[]>(
    grupo.viajes.filter((v) => v.carga === 'PARCIAL' || v.carga === 'VACIO').map((v) => v.id),
  )
  const [precio, setPrecio] = useState('')
  const [motivo, setMotivo] = useState('')

  const listo = marcados.length > 0 && precio !== '' && Number(precio) >= 0 && motivo.trim().length >= 4

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
                  setMarcados((m) => (e.target.checked ? [...m, v.id] : m.filter((x) => x !== v.id)))
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
        label="Por qué cambia"
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
        label="Por qué se rechazan"
        hint="Quien los cargó va a leerlo."
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

/**
 * El reporte que hoy se escribe a mano en WhatsApp cada tarde.
 *
 * Se enseña el texto completo y se copia de un botón. No se guarda en ningún
 * sitio: es un mensaje, no un documento. Las novedades se teclean aquí porque
 * son lo único que el sistema no puede saber.
 *
 * Cuenta también lo que espera aprobación: el reporte dice lo que pasó ese día,
 * y la aprobación suele llegar después de mandarlo.
 */
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
      descripcion="El mensaje que se manda por WhatsApp. Se copia y se pega tal cual: no se guarda en el sistema. Cuenta los viajes a planta fija, a lavado y de coraza, también los que esperan aprobación."
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
        hint="Lo que el sistema no sabe: una manguera rota, el generador, una visita. Se escribe aquí y sale en el mensaje."
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

      {copiado ? null : (
        <p className="text-ink/45 mt-2 text-xs">
          Si el botón de copiar no funciona, el texto de arriba se puede seleccionar a mano.
        </p>
      )}
    </Modal>
  )
}

function FilaEquipo({
  equipo,
  columnas,
  filas,
  onDetalle,
}: {
  equipo: Equipo
  columnas: RutaAcarreo[]
  filas: AcarreoDia[]
  onDetalle: () => void
}) {
  const deRuta = (rutaId: number) => filas.filter((f) => f.ruta_id === rutaId)
  const total = filas.reduce((s, f) => s + f.viajes + f.por_aprobar + f.rechazados + f.anulados, 0)
  const m3 = filas.reduce((s, f) => s + Number(f.m3 ?? 0), 0)
  const hayM3 = filas.some((f) => f.m3 !== null)
  const hayDinero = filas.some((f) => f.monto_usd !== null)
  const monto = filas.reduce((s, f) => s + Number(f.monto_usd ?? 0), 0)

  return (
    <tr className="border-hairline hover:bg-ink/3 border-b transition-colors last:border-0">
      <td className="px-5 py-3">
        <p className="tabular text-ink/85 font-medium">{equipo.placa}</p>
        <p className="text-ink/45 text-xs">{equipo.detalle}</p>
      </td>
      {columnas.map((r) => {
        const suyas = deRuta(r.id)
        const cuentan = suyas.reduce((s, f) => s + f.viajes, 0)
        const esperan = suyas.reduce((s, f) => s + f.por_aprobar, 0)
        return (
          <td key={r.id} className="tabular text-ink/75 px-3 py-3 text-right">
            {cuentan > 0 ? enteros(cuentan) : esperan > 0 ? null : <span className="text-ink/20">—</span>}
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
      <td className="px-5 py-3 text-right">
        {total > 0 ? (
          <Button size="sm" variant="ghost" onClick={onDetalle}>
            Ver los {enteros(total)}
          </Button>
        ) : null}
      </td>
    </tr>
  )
}

/*
  QUIÉN VA EN CADA RAYA DEL REGISTRO DEL DÍA.

  Firma quien más viajes cargó —o aprobó—, y los demás se nombran en el resumen.
  Su firma digital solo se estampa si la eligió en TODOS sus viajes de ese día:
  una tanda cargada sin firma basta para no ponerla en un papel que también
  cubre esa tanda.
*/
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

/** El formulario de carga: quién, por qué ruta, cómo volvió y cuántos. */
function CargarViajes({
  dia,
  equipos,
  rutas,
  yaTiene,
}: {
  dia: string
  equipos: Equipo[]
  rutas: RutaAcarreo[]
  yaTiene: (e: Equipo, rutaId: number) => number
}) {
  const registrar = useRegistrarViajes()
  // Quien carga no autoriza nada: su firma se ofrece sin marcar.
  const { data: miFirma } = useMiFirma()
  const [conMiFirma, setConMiFirma] = useState(false)
  const [indice, setIndice] = useState('')
  const [rutaId, setRutaId] = useState('')
  const [carga, setCarga] = useState<CargaDelViaje>('COMPLETA')
  const [m3, setM3] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [precio, setPrecio] = useState('')
  const [cargados, setCargados] = useState<number | null>(null)

  const equipo = indice === '' ? null : equipos[Number(indice)]
  const ruta = rutas.find((r) => String(r.id) === rutaId) ?? null
  const cuantos = Number(cantidad)
  const deMaquina = equipo?.maquinaId !== null && equipo !== null

  const pideM3 = carga === 'PARCIAL'
  const ofreceM3 = pideM3 || (carga === 'COMPLETA' && deMaquina)
  // Una máquina propia no se paga por viaje: no se le pregunta precio aunque la ruta lo pida.
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
      ? 'Esta ruta no tiene tarifa fija: se cuadra con el pedido.'
      : ruta.precio_hasta_usd !== null && ruta.precio_usd !== null
        ? `La tarifa va de ${dolares(ruta.precio_usd)} a ${dolares(ruta.precio_hasta_usd)}.`
        : 'La tarifa de esta ruta es un rango: di cuánto se paga.'

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
    setCargados(cuantos)
    setCantidad('')
    setPrecio('')
    setM3('')
  }

  return (
    <div className="border-hairline mt-2 rounded-[6px] border border-dashed p-3">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label={equipos[0]?.maquinaId != null ? 'Máquina' : 'Camión'}
          vacio={equipos[0]?.maquinaId != null ? 'Elige la máquina' : 'Elige el camión'}
          value={indice}
          onChange={(e) => {
            setIndice(e.target.value)
            setCargados(null)
          }}
          opciones={equipos.map((e, i) => ({
            valor: String(i),
            etiqueta: e.maquinaId !== null ? `${e.placa} · ${e.detalle}` : e.placa,
          }))}
          className="w-52"
        />
        <Select
          label="Por qué ruta"
          vacio="Elige la ruta"
          value={rutaId}
          onChange={(e) => {
            setRutaId(e.target.value)
            setPrecio('')
            setCargados(null)
          }}
          opciones={rutas.map((r) => ({ valor: String(r.id), etiqueta: r.nombre }))}
          className="w-72"
        />
        <Select
          label="Cómo volvió"
          value={carga}
          onChange={(e) => {
            setCarga(e.target.value as CargaDelViaje)
            setM3('')
          }}
          opciones={(Object.keys(CARGA_DEL_VIAJE) as CargaDelViaje[]).map((c) => ({
            valor: c,
            etiqueta: CARGA_DEL_VIAJE[c].texto,
          }))}
          hint={CARGA_DEL_VIAJE[carga].explica}
          className="w-56"
        />
        {ofreceM3 ? (
          <Input
            label={pideM3 ? 'Cuántos m³ traía' : 'Metros cúbicos (si se sabe)'}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={m3}
            onChange={(e) => setM3(e.target.value)}
            className="w-44"
          />
        ) : null}
        <Input
          label="Cuántos viajes"
          type="number"
          min="1"
          max="60"
          inputMode="numeric"
          value={cantidad}
          onChange={(e) => {
            setCantidad(e.target.value)
            setCargados(null)
          }}
          hint={
            equipo && ruta && cuantos >= 1
              ? `Ya tiene ${yaTiene(equipo, ruta.id)} en esta ruta: quedarán ${yaTiene(equipo, ruta.id) + cuantos}.`
              : 'Se suma a los que ya tenga.'
          }
          className="w-44"
        />
        {pidePrecio ? (
          <Input
            label="Precio de cada viaje"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            hint={pistaPrecio}
            className="w-52"
          />
        ) : null}
        <Button
          icon={<Plus />}
          disabled={!valido || registrar.isPending}
          onClick={() => void enviar()}
          className="mb-0.5"
        >
          {registrar.isPending ? 'Cargando…' : 'Cargar'}
        </Button>
      </div>
      {miFirma?.usar ? (
        <label className="text-ink/75 mt-3 flex cursor-pointer items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            className="accent-royal-600 mt-0.5 size-4 shrink-0"
            checked={conMiFirma}
            onChange={(e) => setConMiFirma(e.target.checked)}
          />
          <span>
            Poner mi firma digital en «Registrado por» del registro del día
            <span className="text-ink/50 mt-0.5 block text-xs">
              Solo se estampa si la pones en todos los viajes que cargues ese día.
            </span>
          </span>
        </label>
      ) : null}
      {equipos[0]?.maquinaId != null ? (
        <p className="text-ink/45 mt-2 text-xs">
          Las máquinas propias no se pagan por viaje: el viaje queda contado sin precio.
        </p>
      ) : null}
      {cargados !== null ? (
        <p className="text-ink/55 mt-2 text-xs">
          {cargados === 1 ? 'Cargado 1 viaje' : `Cargados ${cargados} viajes`}: quedan por aprobar y
          todavía no cuentan para el pago. Si alguno volvió a medias o vacío, quien aprueba ajusta su
          precio.
        </p>
      ) : null}
      {registrar.error ? <ErrorDeCarga error={registrar.error} className="mt-3" /> : null}
    </div>
  )
}

/* ═══════════════════════════════════════════════════ el detalle del equipo */

function DetalleDelEquipo({
  dia,
  equipo,
  onCerrar,
}: {
  dia: string
  equipo: Equipo
  onCerrar: () => void
}) {
  const viajes = useAcarreosDeEquipo(dia, equipo)
  const [anulando, setAnulando] = useState<Acarreo | null>(null)
  const [corrigiendo, setCorrigiendo] = useState<Acarreo | null>(null)
  const { puede } = useMisPermisos()

  return (
    <>
      <Modal
        abierto
        onCerrar={onCerrar}
        titulo={equipo.placa}
        descripcion={`Viaje por viaje · ${fmtFecha(dia)}`}
        ancho="lg"
      >
        {viajes.isPending ? <Cargando /> : null}
        {viajes.error ? <ErrorDeCarga error={viajes.error} /> : null}

        {(viajes.data ?? []).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="py-2 pr-3 font-medium">N.º</th>
                  <th className="px-3 py-2 font-medium">Ruta</th>
                  <th className="px-3 py-2 font-medium">Hora</th>
                  <th className="px-3 py-2 font-medium">Cómo volvió</th>
                  <th className="px-3 py-2 text-right font-medium">m³</th>
                  <th className="px-3 py-2 text-right font-medium">Precio</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="py-2 pl-3 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {(viajes.data ?? []).map((v) => {
                  const estado = ESTADO_VIAJE[v.estado]
                  const muerto = v.estado === 'ANULADO' || v.estado === 'RECHAZADO'
                  return (
                    <tr
                      key={v.id}
                      className={cn('border-hairline border-b last:border-0', muerto && 'opacity-55')}
                    >
                      <td className="tabular text-ink/70 py-2 pr-3">{v.secuencia}</td>
                      <td className="text-ink/70 px-3 py-2">{v.tramo_dice}</td>
                      <td className="tabular text-ink/60 px-3 py-2">
                        {v.hora?.slice(0, 5) ?? <span className="text-ink/25">—</span>}
                      </td>
                      <td className="text-ink/60 px-3 py-2 text-xs">
                        {v.carga ? CARGA_DEL_VIAJE[v.carga].texto : <span className="text-ink/25">—</span>}
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
                          <span className="text-ink/45 mt-0.5 block text-2xs">{v.motivo_rechazo}</span>
                        ) : null}
                      </td>
                      <td className="py-2 pl-3 text-right whitespace-nowrap">
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
        <CorregirViaje viaje={corrigiendo} onCerrar={() => setCorrigiendo(null)} />
      ) : null}
      {anulando ? <AnularViaje viaje={anulando} onCerrar={() => setAnulando(null)} /> : null}
    </>
  )
}

function CorregirViaje({ viaje, onCerrar }: { viaje: Acarreo; onCerrar: () => void }) {
  const corregir = useCorregirAcarreo()
  const [hora, setHora] = useState(viaje.hora?.slice(0, 5) ?? '')
  const [carga, setCarga] = useState(viaje.carga_m3 ?? '')
  const [precio, setPrecio] = useState(viaje.precio_usd ?? '')

  // El precio solo se enseña a quien lo puede ver. A quien no, la vista se lo
  // manda nulo y corregirlo a ciegas sería escribir sobre algo que no ve. Y el
  // de un viaje por aprobar es de quien aprueba: se ajusta desde «Por aprobar».
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
            Volvió vacío: no lleva metros cúbicos. Si traía carga, anúlalo y cárgalo de nuevo.
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

function AnularViaje({ viaje, onCerrar }: { viaje: Acarreo; onCerrar: () => void }) {
  const anular = useAnularAcarreo()
  const [motivo, setMotivo] = useState('')

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Anular el viaje ${viaje.secuencia} de ${viaje.placa ?? ''}`}
      descripcion="El viaje deja de contar y de cobrarse, pero la fila se queda. Su número tampoco se reutiliza: el hueco queda a la vista para poder explicarlo."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            No anular
          </Button>
          <Button
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
        label="Por qué se anula"
        hint="Queda en el registro de auditoría con tu nombre y la hora."
        rows={3}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        required
      />
      {anular.error ? <ErrorDeCarga error={anular.error} className="mt-4" /> : null}
    </Modal>
  )
}

/* ═══════════════════════════════════════════════════════════ las tarifas */

/**
 * Lo que se paga hoy por cada ruta abierta.
 *
 * Cambiar una tarifa ya no se hace aquí: vive con las rutas, en Plantas y
 * rutas, que es donde se decide qué rutas existen. Sin la casilla del dinero
 * las tarifas llegan nulas y la caja no se dibuja.
 */
function CajaDeTarifas({ rutas }: { rutas: RutaAcarreo[] }) {
  const conDinero = rutas.filter((r) => r.precio_usd !== null)
  if (conDinero.length === 0) return null

  return (
    <div className="border-hairline flex items-center gap-3 rounded-[6px] border px-3 py-2">
      <Coins className="text-ink/35 size-4 shrink-0" />
      <div className="text-xs">
        <p className="text-ink/45">Se paga por viaje</p>
        <p className="text-ink/80 tabular">
          {rutas
            .filter((r) => r.precio_usd !== null || r.precio_libre)
            .map((r) => `${r.nombre}: ${tarifaEnPalabras(r, dolares)}`)
            .join(' · ')}
        </p>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════ el registro de pago */

const esFecha = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)

/** Suma días a una fecha AAAA-MM-DD sin pasar por la zona horaria del navegador. */
function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

interface Periodo {
  desde: string
  hasta: string
}

/**
 * Los atajos de fecha, calculados desde hoy en Caracas.
 *
 * Son los que se piden de verdad: el día para pagarle a un transportista, la
 * semana y el mes para cuadrar. Cualquier otro rango se escribe a mano.
 */
function atajos(hoy: string): Array<{ id: string; etiqueta: string; periodo: Periodo }> {
  const deLunes = (new Date(`${hoy}T12:00:00Z`).getUTCDay() + 6) % 7
  const primeroDelMes = `${hoy.slice(0, 8)}01`
  const finDelMesPasado = sumarDias(primeroDelMes, -1)
  const ayer = sumarDias(hoy, -1)

  return [
    { id: 'hoy', etiqueta: 'Hoy', periodo: { desde: hoy, hasta: hoy } },
    { id: 'ayer', etiqueta: 'Ayer', periodo: { desde: ayer, hasta: ayer } },
    {
      id: 'semana',
      etiqueta: 'Esta semana',
      periodo: { desde: sumarDias(hoy, -deLunes), hasta: hoy },
    },
    { id: 'mes', etiqueta: 'Este mes', periodo: { desde: primeroDelMes, hasta: hoy } },
    {
      id: 'mes-pasado',
      etiqueta: 'Mes pasado',
      periodo: { desde: `${finDelMesPasado.slice(0, 8)}01`, hasta: finDelMesPasado },
    },
  ]
}

/*
  UN DÍA O UN RANGO, Y NO «MES» CON «VER»

  Antes se elegía el mes y dentro de él un día de los que tenían viajes. Eso
  no dejaba ver del 25 al 5, ni una quincena, ni dos meses seguidos. Ahora se
  elige lo que se quiere mirar: un día, o un rango con sus dos fechas. El mes
  sigue a un clic en los atajos.

  Los dos modos no son el mismo papel recortado. El día es lo que se le
  entrega a un transportista y dice solo cuánto se le debe. El rango es para
  cuadrar: la matriz de días con el acumulado de cada empresa dentro de esas
  fechas.
*/
function PestanaPago() {
  const hoy = hoyEnCaracas()
  const [modo, setModo] = useState<'dia' | 'rango'>('rango')
  const [dia, setDia] = useState(hoy)
  const [desde, setDesde] = useState(`${hoy.slice(0, 8)}01`)
  const [hasta, setHasta] = useState(hoy)
  /* Vacía quiere decir «todas». */
  const [empresaPedida, setEmpresaPedida] = useState('')
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const { data: laEmpresa } = useEmpresa()
  const { nombre: yo } = useSesion()

  const porDia = modo === 'dia'
  const periodo: Periodo = porDia ? { desde: dia, hasta: dia } : { desde, hasta }
  const periodoValido =
    esFecha(periodo.desde) && esFecha(periodo.hasta) && periodo.desde <= periodo.hasta

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

  /* Al cambiar de fechas, la empresa elegida puede no tener viajes en ellas.
     En vez de enseñar una tabla vacía sin explicación, el filtro se suelta. */
  const empresa = empresasDelPeriodo.includes(empresaPedida) ? empresaPedida : ''

  const filas = todas.filter((f) => empresa === '' || f.transportista === empresa)

  /* El acumulado se calcula aquí, dentro del período, y no se toma de la
     vista: el de la vista cuenta desde el primero del mes. Las filas llegan
     ordenadas por empresa y fecha, así que basta con ir sumando. */
  const corrido = new Map<string, number>()
  const conAcumulado = filas.map((f) => {
    if (f.monto_usd === null) return { ...f, acumulado: null as string | null }
    const suma = (corrido.get(f.transportista) ?? 0) + Number(f.monto_usd)
    corrido.set(f.transportista, suma)
    return { ...f, acumulado: String(suma) }
  })

  const empresas = [...new Set(filas.map((f) => f.transportista))].sort()
  // Las columnas de la matriz son los días que tienen viajes dentro del período.
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

  /* El CSV sale con los montos crudos, sin formatear: así la hoja de cálculo
     los lee como números y el acumulado se puede recalcular allí. */
  const exportar = () => {
    if (porDia) {
      descargarCsv(
        `pago-viajes-${dia}.csv`,
        ['Empresa', 'Fecha', 'Viajes', 'Metros cubicos', 'Monto USD'],
        filas.map((f) => [f.transportista, f.fecha, f.viajes, f.m3 ?? '', f.monto_usd ?? '']),
      )
      return
    }

    descargarCsv(
      `pago-viajes-${desde}_a_${hasta}.csv`,
      ['Empresa', 'Fecha', 'Viajes', 'Metros cubicos', 'Monto USD', 'Acumulado USD'],
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
            {/* Una fecha no puede quedar del lado equivocado de la otra: si
                se mueve una más allá, la otra la sigue. */}
            <Input
              label="Desde"
              type="date"
              value={desde}
              max={hoy}
              onChange={(e) => {
                const v = e.target.value
                setDesde(v)
                if (esFecha(v) && esFecha(hasta) && v > hasta) setHasta(v)
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
                if (esFecha(v) && esFecha(desde) && v < desde) setDesde(v)
              }}
              className="w-48"
            />
          </>
        )}

        <Select
          label="Empresa"
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
            titulo={porDia ? 'Elige un día' : 'Elige las dos fechas'}
            descripcion="Con la fecha completa aparece lo que se le debe a cada empresa."
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
                  ? 'Ese día no tiene viajes registrados'
                  : 'Esas fechas no tienen viajes registrados'
                : 'Con ese filtro no queda nada'
            }
            descripcion={
              todas.length === 0
                ? 'Prueba con otras fechas, o carga los viajes en la pestaña «Viajes del día».'
                : 'Esa empresa no hizo viajes en esas fechas. Prueba con otras, o pon la empresa en «Todas».'
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
                  <th className="px-5 py-3 font-medium">Empresa</th>
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
                <tr className="bg-ink/4">
                  <td className="text-ink/85 px-5 py-3 text-sm font-semibold">
                    Total del {fmtFecha(dia)}
                  </td>
                  <td className="tabular text-ink/85 px-3 py-3 text-right text-sm font-semibold">
                    {enteros(filas.reduce((s, f) => s + f.viajes, 0))}
                  </td>
                  <td />
                  <td className="tabular text-ink/90 px-5 py-3 text-right text-sm font-semibold">
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
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Empresa</th>
                  {dias.map((d) => (
                    <th key={d} className="px-3 py-3 text-right font-medium whitespace-nowrap">
                      {d.slice(8, 10)}/{d.slice(5, 7)}
                    </th>
                  ))}
                  <th className="px-5 py-3 text-right font-medium">Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {empresas.map((e) => (
                  <tr key={e} className="border-hairline border-b last:border-0">
                    <td className="text-ink/85 px-5 py-3 font-medium">{e}</td>
                    {dias.map((d) => {
                      const celda = enCruce(e, d)
                      return (
                        <td key={d} className="tabular text-ink/75 px-3 py-3 text-right">
                          {celda ? (
                            <Cifra valor={celda.monto_usd} comoDinero />
                          ) : (
                            <span className="text-ink/20">—</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="tabular text-ink/90 px-5 py-3 text-right font-semibold">
                      <Cifra
                        valor={sumaDinero(filas.filter((f) => f.transportista === e))}
                        comoDinero
                      />
                    </td>
                  </tr>
                ))}
                <tr className="bg-ink/4">
                  <td className="text-ink/85 px-5 py-3 text-sm font-semibold">Total diario</td>
                  {dias.map((d) => (
                    <td
                      key={d}
                      className="tabular text-ink/85 px-3 py-3 text-right text-sm font-semibold"
                    >
                      <Cifra valor={sumaDinero(filas.filter((f) => f.fecha === d))} comoDinero />
                    </td>
                  ))}
                  <td className="tabular text-ink/90 px-5 py-3 text-right text-sm font-semibold">
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
        titulo={porDia ? 'Pago de viajes del día' : 'Registro de pago de viajes'}
      />
    </>
  )
}
