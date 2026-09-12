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
*/
import { useState } from 'react'
import { Ban, Check, ClipboardCopy, Coins, Download, MessageSquare, Pencil, Plus, Printer, Truck } from 'lucide-react'
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
  TRAMOS,
  useAcarreosDelDia,
  useAcarreosDeVehiculo,
  useAcarreosDia,
  useAnularAcarreo,
  useEquiposEnOperacion,
  useCorregirAcarreo,
  useFijarTarifaAcarreo,
  usePagoDeAcarreos,
  useRegistrarAcarreos,
  useTarifasAcarreo,
  type Acarreo,
  type AcarreoDia,
  type Tramo,
} from '@/lib/api/acarreos'
import { useVehiculos, type Vehiculo } from '@/lib/api/vehiculos'
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

const OPCIONES_TRAMO = TRAMOS.map((t) => ({ valor: t.valor, etiqueta: t.etiqueta }))

/** Un número que puede no saberse. El guion es la respuesta, no un hueco. */
function Cifra({ valor, comoDinero = false }: { valor: string | null; comoDinero?: boolean }) {
  if (valor === null) return <span className="text-ink/25">—</span>
  return <>{comoDinero ? dolares(valor) : enteros(valor)}</>
}

export function Viajes() {
  const [pestana, setPestana] = useState<'dia' | 'pago'>('dia')

  return (
    <>
      <PageHeader
        title="Viajes de camiones"
        description="Cuántos viajes hizo cada camión y a dónde. Es la medida del material que bajó de la mina y lo que se le debe a cada transportista."
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
  const [detalle, setDetalle] = useState<Vehiculo | null>(null)
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [reporte, setReporte] = useState(false)

  const vehiculos = useVehiculos(true)
  const dias = useAcarreosDia(dia)
  const todos = useAcarreosDelDia(dia)
  const { data: laEmpresa } = useEmpresa()
  const { nombre: yo } = useSesion()
  const { puede } = useMisPermisos()
  const escribe = puede('EXPLOTACION', 'ESCRITURA')

  const filas = dias.data ?? []
  const flota = vehiculos.data ?? []

  // Lo que ya tiene cada camión hoy, para poder decir «quedarán 8».
  const yaTiene = (vehiculoId: number, tramo: Tramo) =>
    filas.find((f) => f.vehiculo_id === vehiculoId && f.tramo === tramo)?.viajes ?? 0

  const totalViajes = filas.reduce((s, f) => s + f.viajes, 0)
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

  /* El papel se arma de los viajes sueltos, no de la vista agrupada: la
     planilla imprime viaje por viaje, con su número y su hora. */
  const imprimir = async () => {
    const viajes = todos.data ?? []
    const placas = [...new Set(viajes.map((v) => v.placa))]

    setPdf(
      await armarRegistroDeViajes({
        dia,
        empresa: null,
        camiones: placas.map((placa) => {
          const suyos = viajes.filter((v) => v.placa === placa)
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
              motivo_anulacion: v.motivo_anulacion,
            })),
          }
        }),
        empresa_papel: empresaDelPapel(laEmpresa),
        emitidoPor: yo ?? '',
        momento: new Date(),
      }),
    )
  }

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
        <CajaDeTarifas />
      </div>

      {vehiculos.isPending || dias.isPending ? <Cargando /> : null}
      {vehiculos.error ? <ErrorDeCarga error={vehiculos.error} /> : null}
      {dias.error ? <ErrorDeCarga error={dias.error} /> : null}

      {!vehiculos.isPending && !vehiculos.error && flota.length === 0 ? (
        <Card>
          <Vacio
            icono={<Truck />}
            titulo="Todavía no hay camiones cargados"
            descripcion="Los viajes se anotan por camión, así que primero hay que dar de alta la flota en Despachos › Vehículos, con su placa y su capacidad."
          />
        </Card>
      ) : null}

      {flota.length > 0 ? (
        <div className="space-y-5">
          {[...porEmpresa.entries()].map(([empresa, camiones]) => (
            <section key={empresa}>
              <h2 className="text-ink/80 mb-2 text-sm font-semibold">{empresa}</h2>
              <Card flush>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                        <th className="px-5 py-3 font-medium">Camión</th>
                        {TRAMOS.map((t) => (
                          <th key={t.valor} className="px-3 py-3 text-right font-medium">
                            {t.corto}
                          </th>
                        ))}
                        <th className="px-3 py-3 text-right font-medium">m³</th>
                        <th className="px-3 py-3 text-right font-medium">Se le debe</th>
                        <th className="px-5 py-3 text-right font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {camiones.map((v) => (
                        <FilaCamion
                          key={v.id}
                          vehiculo={v}
                          filas={filas.filter((f) => f.vehiculo_id === v.id)}
                          onDetalle={() => setDetalle(v)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {escribe ? (
                <CargarViajes dia={dia} camiones={camiones} yaTiene={yaTiene} />
              ) : null}
            </section>
          ))}

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-ink/45 text-xs">Total del día</p>
                <p className="tabular text-ink/90 text-lg font-semibold">
                  {enteros(totalViajes)} viajes · {enteros(totalM3)} m³
                  {hayDinero ? ` · ${dolares(totalUsd)}` : ''}
                </p>
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
        <DetalleDelCamion dia={dia} vehiculo={detalle} onCerrar={() => setDetalle(null)} />
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
      />
    </>
  )
}

/* ════════════════════════════════════ el mensaje del reporte de operaciones */

/**
 * El reporte que hoy se escribe a mano en WhatsApp cada tarde.
 *
 * Se enseña el texto completo y se copia de un botón. No se guarda en ningún
 * sitio: es un mensaje, no un documento. Las novedades se teclean aquí porque
 * son lo único que el sistema no puede saber.
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

  const placas = [...new Set(filas.map((f) => f.placa))]
  const camiones = placas.map((placa) => {
    const suyas = filas.filter((f) => f.placa === placa)
    const conM3 = suyas.some((f) => f.m3 !== null)
    const porTramo = (t: Tramo) => suyas.find((f) => f.tramo === t)?.viajes ?? 0
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
      descripcion="El mensaje que se manda por WhatsApp. Se copia y se pega tal cual: no se guarda en el sistema."
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

function FilaCamion({
  vehiculo,
  filas,
  onDetalle,
}: {
  vehiculo: Vehiculo
  filas: AcarreoDia[]
  onDetalle: () => void
}) {
  const viajes = (tramo: Tramo) => filas.find((f) => f.tramo === tramo)?.viajes ?? 0
  const total = filas.reduce((s, f) => s + f.viajes, 0)
  const m3 = filas.reduce((s, f) => s + Number(f.m3 ?? 0), 0)
  const hayM3 = filas.some((f) => f.m3 !== null)
  const hayDinero = filas.some((f) => f.monto_usd !== null)
  const monto = filas.reduce((s, f) => s + Number(f.monto_usd ?? 0), 0)
  const chofer = filas.find((f) => f.chofer)?.chofer ?? vehiculo.chofer_actual

  return (
    <tr className="border-hairline hover:bg-ink/3 border-b transition-colors last:border-0">
      <td className="px-5 py-3">
        <p className="tabular text-ink/85 font-medium">{vehiculo.placa}</p>
        <p className="text-ink/45 text-xs">
          {[chofer, vehiculo.descripcion].filter(Boolean).join(' · ') || 'Sin chofer asignado'}
        </p>
      </td>
      {TRAMOS.map((t) => (
        <td key={t.valor} className="tabular text-ink/75 px-3 py-3 text-right">
          {viajes(t.valor) > 0 ? enteros(viajes(t.valor)) : <span className="text-ink/20">—</span>}
        </td>
      ))}
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

/** El formulario de carga, uno por empresa: camión, tramo y cuántos. */
function CargarViajes({
  dia,
  camiones,
  yaTiene,
}: {
  dia: string
  camiones: Vehiculo[]
  yaTiene: (vehiculoId: number, tramo: Tramo) => number
}) {
  const registrar = useRegistrarAcarreos()
  const [vehiculo, setVehiculo] = useState('')
  const [tramo, setTramo] = useState<Tramo>('MINA_PLANTA')
  const [cantidad, setCantidad] = useState('')
  const [precio, setPrecio] = useState('')

  const id = Number(vehiculo)
  const cuantos = Number(cantidad)
  const coraza = tramo === 'MINA_BASE'
  const valido =
    id > 0 && cuantos >= 1 && cuantos <= 60 && (!coraza || Number(precio) >= 0) && (!coraza || precio !== '')

  const enviar = async () => {
    await registrar.mutateAsync({
      fecha: dia,
      vehiculo_id: id,
      tramo,
      cantidad: cuantos,
      precio_usd: coraza ? Number(precio) : null,
    })
    setCantidad('')
    setPrecio('')
  }

  return (
    <div className="border-hairline mt-2 rounded-[6px] border border-dashed p-3">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Camión"
          vacio="Elige el camión"
          value={vehiculo}
          onChange={(e) => setVehiculo(e.target.value)}
          opciones={camiones.map((c) => ({ valor: String(c.id), etiqueta: c.placa }))}
          className="w-44"
        />
        <Select
          label="A dónde"
          value={tramo}
          onChange={(e) => setTramo(e.target.value as Tramo)}
          opciones={OPCIONES_TRAMO}
          className="w-56"
        />
        <Input
          label="Cuántos viajes"
          type="number"
          min="1"
          max="60"
          inputMode="numeric"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          hint={
            id > 0 && cuantos >= 1
              ? `Ya tiene ${yaTiene(id, tramo)}: quedarán ${yaTiene(id, tramo) + cuantos}.`
              : 'Se suma a los que ya tenga.'
          }
          className="w-44"
        />
        {coraza ? (
          <Input
            label="Precio del viaje"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            hint="La coraza no tiene tarifa fija: se cuadra con el pedido."
            className="w-48"
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
      {registrar.error ? <ErrorDeCarga error={registrar.error} className="mt-3" /> : null}
    </div>
  )
}

/* ═══════════════════════════════════════════════════ el detalle del camión */

function DetalleDelCamion({
  dia,
  vehiculo,
  onCerrar,
}: {
  dia: string
  vehiculo: Vehiculo
  onCerrar: () => void
}) {
  const viajes = useAcarreosDeVehiculo(dia, vehiculo.id)
  const [anulando, setAnulando] = useState<Acarreo | null>(null)
  const [corrigiendo, setCorrigiendo] = useState<Acarreo | null>(null)
  const { puede } = useMisPermisos()

  return (
    <>
      <Modal
        abierto
        onCerrar={onCerrar}
        titulo={vehiculo.placa}
        descripcion={`Viaje por viaje · ${fmtFecha(dia)}`}
        ancho="lg"
      >
        {viajes.isPending ? <Cargando /> : null}
        {viajes.error ? <ErrorDeCarga error={viajes.error} /> : null}

        {(viajes.data ?? []).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="py-2 pr-3 font-medium">N.º</th>
                  <th className="px-3 py-2 font-medium">A dónde</th>
                  <th className="px-3 py-2 font-medium">Hora</th>
                  <th className="px-3 py-2 text-right font-medium">m³</th>
                  <th className="px-3 py-2 text-right font-medium">Precio</th>
                  <th className="py-2 pl-3 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {(viajes.data ?? []).map((v) => (
                  <tr
                    key={v.id}
                    className={cn(
                      'border-hairline border-b last:border-0',
                      v.estado === 'ANULADO' && 'opacity-45',
                    )}
                  >
                    <td className="tabular text-ink/70 py-2 pr-3">{v.secuencia}</td>
                    <td className="text-ink/70 px-3 py-2">{v.tramo_dice}</td>
                    <td className="tabular text-ink/60 px-3 py-2">
                      {v.hora?.slice(0, 5) ?? <span className="text-ink/25">—</span>}
                    </td>
                    <td className="tabular text-ink/80 px-3 py-2 text-right">
                      <Cifra valor={v.carga_m3} />
                    </td>
                    <td className="tabular text-ink/80 px-3 py-2 text-right">
                      <Cifra valor={v.precio_usd} comoDinero />
                    </td>
                    <td className="py-2 pl-3 text-right whitespace-nowrap">
                      {v.estado === 'ANULADO' ? (
                        <Chip tone="neutral" title={v.motivo_anulacion ?? ''}>
                          Anulado
                        </Chip>
                      ) : (
                        <>
                          {puede('EXPLOTACION', 'ESCRITURA') ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Pencil />}
                              onClick={() => setCorrigiendo(v)}
                            >
                              Corregir
                            </Button>
                          ) : null}
                          {puede('EXPLOTACION', 'TOTAL') ? (
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
                        </>
                      )}
                    </td>
                  </tr>
                ))}
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
  // manda nulo y corregirlo a ciegas sería escribir sobre algo que no ve.
  const veElDinero = viaje.precio_usd !== null

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Viaje ${viaje.secuencia} · ${viaje.placa}`}
      descripcion={viaje.tramo_dice}
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
                carga_m3: carga === '' ? null : Number(carga),
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
        <Input
          label="Metros cúbicos"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={carga}
          onChange={(e) => setCarga(e.target.value)}
          hint={`El camión carga hasta ${enteros(viaje.capacidad_m3)} m³.`}
        />
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
      titulo={`Anular el viaje ${viaje.secuencia} de ${viaje.placa}`}
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

function CajaDeTarifas() {
  const tarifas = useTarifasAcarreo()
  const { puede } = useMisPermisos()
  const [abierta, setAbierta] = useState(false)

  // Sin la casilla del dinero la vista llega vacía. No es un error: es que
  // esta persona no tiene por qué ver cuánto se paga.
  if ((tarifas.data ?? []).length === 0) return null

  return (
    <>
      <div className="border-hairline flex items-center gap-3 rounded-[6px] border px-3 py-2">
        <Coins className="text-ink/35 size-4 shrink-0" />
        <div className="text-xs">
          <p className="text-ink/45">Se paga por viaje</p>
          <p className="text-ink/80 tabular">
            {(tarifas.data ?? [])
              .map((t) => `${t.tramo_dice}: ${dolares(t.precio_usd)}`)
              .join(' · ')}
          </p>
        </div>
        {puede('EXPLOTACION', 'TOTAL') ? (
          <Button size="sm" variant="ghost" onClick={() => setAbierta(true)}>
            Cambiar
          </Button>
        ) : null}
      </div>

      {abierta ? <CambiarTarifa onCerrar={() => setAbierta(false)} /> : null}
    </>
  )
}

function CambiarTarifa({ onCerrar }: { onCerrar: () => void }) {
  const fijar = useFijarTarifaAcarreo()
  const [tramo, setTramo] = useState<Tramo>('MINA_PLANTA')
  const [precio, setPrecio] = useState('')
  const [desde, setDesde] = useState(hoyEnCaracas())

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Cambiar lo que se paga por viaje"
      descripcion="La tarifa anterior se queda guardada. Los viajes ya registrados no cambian de precio: cada uno lleva copiado el suyo."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={fijar.isPending || precio === '' || Number(precio) < 0}
            onClick={async () => {
              await fijar.mutateAsync({ tramo, precio: Number(precio), desde })
              onCerrar()
            }}
          >
            {fijar.isPending ? 'Guardando…' : 'Poner la tarifa'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          label="Tramo"
          value={tramo}
          onChange={(e) => setTramo(e.target.value as Tramo)}
          opciones={OPCIONES_TRAMO}
        />
        <Input
          label="Precio por viaje"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
        />
        <Input
          label="Rige desde"
          type="date"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
        />
      </div>
      {fijar.error ? <ErrorDeCarga error={fijar.error} className="mt-4" /> : null}
    </Modal>
  )
}

/* ════════════════════════════════════════════════════ el registro de pago */

function PestanaPago() {
  const [mes, setMes] = useState(hoyEnCaracas().slice(0, 7))
  /* Vacíos quieren decir «todo»: el mes entero y todas las empresas. */
  const [diaPedido, setDiaPedido] = useState('')
  const [empresaPedida, setEmpresaPedida] = useState('')
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const pago = usePagoDeAcarreos(mes)
  const { data: laEmpresa } = useEmpresa()
  const { nombre: yo } = useSesion()

  const todas = pago.data ?? []
  const empresasDelMes = [...new Set(todas.map((f) => f.transportista))].sort()
  const diasDelMes = [...new Set(todas.map((f) => f.fecha))].sort()

  /* Al cambiar de mes, el día y la empresa elegidos pueden no existir allí.
     En vez de enseñar una tabla vacía sin explicación, el filtro se suelta. */
  const dia = diasDelMes.includes(diaPedido) ? diaPedido : ''
  const empresa = empresasDelMes.includes(empresaPedida) ? empresaPedida : ''
  const porDia = dia !== ''

  const filas = todas.filter(
    (f) => (dia === '' || f.fecha === dia) && (empresa === '' || f.transportista === empresa),
  )

  const empresas = [...new Set(filas.map((f) => f.transportista))].sort()
  // Las columnas de la matriz son los días del mes, los tenga esta empresa o no.
  const dias = diasDelMes

  const totalFilas = filas.every((f) => f.monto_usd === null)
    ? null
    : String(filas.reduce((s, f) => s + Number(f.monto_usd ?? 0), 0))

  const enCruce = (empresa: string, dia: string) =>
    filas.find((f) => f.transportista === empresa && f.fecha === dia)

  const acumulado = (empresa: string) => {
    const suyas = filas.filter((f) => f.transportista === empresa)
    if (suyas.every((f) => f.monto_usd === null)) return null
    return String(suyas.reduce((s, f) => s + Number(f.monto_usd ?? 0), 0))
  }

  const totalDia = (dia: string) => {
    const suyas = filas.filter((f) => f.fecha === dia)
    if (suyas.every((f) => f.monto_usd === null)) return null
    return String(suyas.reduce((s, f) => s + Number(f.monto_usd ?? 0), 0))
  }

  const imprimir = async () => {
    const papel = { empresa_papel: empresaDelPapel(laEmpresa), emitidoPor: yo ?? '', momento: new Date() }

    /* Dos papeles distintos, no uno recortado: el del día es el que se le
       entrega al transportista y dice solo cuánto se le debe por hoy. */
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
        mes,
        lineas: filas.map((f) => ({
          transportista: f.transportista,
          fecha: f.fecha,
          viajes: f.viajes,
          m3: f.m3,
          monto_usd: f.monto_usd,
          acumulado_usd: f.acumulado_usd,
        })),
        ...papel,
      }),
    )
  }

  /* El CSV sale con los montos crudos, sin formatear: así la hoja de cálculo
     los lee como números y el acumulado se puede recalcular allí. Es el
     archivo que reproduce la matriz tal como la llevan hoy. */
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
      `pago-viajes-${mes}.csv`,
      ['Empresa', 'Fecha', 'Viajes', 'Metros cubicos', 'Monto USD', 'Acumulado USD'],
      filas.map((f) => [
        f.transportista,
        f.fecha,
        f.viajes,
        f.m3 ?? '',
        f.monto_usd ?? '',
        f.acumulado_usd ?? '',
      ]),
    )
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input
          label="Mes"
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="w-48"
        />
        {/* Solo se ofrecen los días que tienen viajes: así no se puede pedir
            un papel vacío ni hay que acordarse de qué días se trabajó. */}
        <Select
          label="Ver"
          value={dia}
          onChange={(e) => setDiaPedido(e.target.value)}
          opciones={[
            { valor: '', etiqueta: 'Todo el mes' },
            ...diasDelMes.map((d) => ({ valor: d, etiqueta: fmtFecha(d) })),
          ]}
          className="w-52"
        />
        <Select
          label="Empresa"
          value={empresa}
          onChange={(e) => setEmpresaPedida(e.target.value)}
          opciones={[
            { valor: '', etiqueta: 'Todas' },
            ...empresasDelMes.map((x) => ({ valor: x, etiqueta: x })),
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
          {porDia ? 'Imprimir el día' : 'Imprimir el mes'}
        </Button>
        <Button
          variant="outline"
          icon={<Download />}
          disabled={filas.length === 0}
          onClick={exportar}
          className="mb-0.5"
        >
          {porDia ? 'Descargar el día' : 'Descargar el mes'}
        </Button>
      </div>

      {pago.isPending ? <Cargando /> : null}
      {pago.error ? <ErrorDeCarga error={pago.error} /> : null}

      {!pago.isPending && !pago.error && filas.length === 0 ? (
        <Card>
          <Vacio
            icono={<Coins />}
            titulo={
              todas.length === 0
                ? 'Ese mes no tiene viajes registrados'
                : 'Con ese filtro no queda nada'
            }
            descripcion={
              todas.length === 0
                ? 'En cuanto se carguen viajes, esta matriz enseña lo que se le debe a cada empresa por día, con su acumulado.'
                : 'Esa empresa no hizo viajes el día elegido. Prueba con otro día, o pon la empresa en «Todas».'
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
                      <Cifra valor={acumulado(e)} comoDinero />
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
                      <Cifra valor={totalDia(d)} comoDinero />
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
