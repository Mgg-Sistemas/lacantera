import { Fragment, useMemo, useState, type ComponentProps } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Ban,
  ChevronDown,
  ChevronRight,
  Landmark,
  Link2,
  MessageSquareText,
  Paperclip,
  Pencil,
  Plus,
  Printer,
  Search,
  Upload,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Visor } from '@/components/Visor'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Interruptor } from '@/components/ui/Interruptor'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { RangoDeFechas } from '@/components/RangoDeFechas'
import { SIN_RANGO, type Rango } from '@/components/rango'
import { cifra, comoNumero, dinero, fecha, fechaHora, tasa as formatoTasa } from '@/lib/formato'
import { usePerfiles } from '@/lib/api/catalogo'
import { enMayuscula } from '@/lib/texto'
import { useMiPerfil, useMisAcciones } from '@/lib/api/usuarios'
import { useMonedasUsables } from '@/lib/api/tasas'
import { empresaDelPapel, useEmpresa } from '@/lib/api/empresa'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { armarReportePagos } from '@/lib/ficha/pagosBancariosPdf'
import { leerMonto, leerPagosDelBanco, type FilaLeida } from '@/lib/leerPagosDelBanco'
import { ElegirArchivosDeCarga } from '@/components/FotosDeCarga'
import { ComprobantesDePago } from './ComprobantesDePago'
import {
  MAXIMO_COMPROBANTES,
  leerNotasSinPago,
  subirComprobantes,
  useComprobantesDePagos,
  useGuardarObservacionPago,
  useObservacionesDePagos,
  useAnularPagoBancario,
  useAsociarNotas,
  useCambiarMontoAplicado,
  useGuardarPagoBancario,
  useImportarPagosBancarios,
  useNotasCandidatas,
  useNotasCubiertasDeMas,
  useNotasDePago,
  usePagosBancarios,
  useQuitarNotaDePago,
  type ComprobantePago,
  type EstadoPago,
  type NotaCubiertaDeMas,
  type ObservacionPago,
  type PagoBancario,
} from '@/lib/api/pagosBancarios'

/*
  REGISTROS DE PAGOS: CADA DEPÓSITO DEL BANCO Y LAS NOTAS QUE PAGA.

  Christopher, 06/11/2026: «que coteje las notas de entrega con los pagos
  registrados del banco… cuando se seleccione uno se desplieguen las notas de
  entrega relacionadas a ese pago… lo más simple posible». Una lista de pagos;
  al tocar uno se abre debajo con sus notas. Un pago puede cubrir varias notas.

  Ver es de cualquiera con Ventas. Registrar, importar, editar, anular y
  asociar es del permiso extendido VENTAS.REGISTRAR_PAGOS (ADMIN lo tiene
  siempre). No cobra notas ni toca Tesorería: solo relaciona.
*/

const ESTADOS: Record<EstadoPago, { etiqueta: string; tono: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  CUADRA: { etiqueta: 'Cuadra', tono: 'success' },
  MINIMA: { etiqueta: 'Diferencia mínima', tono: 'info' },
  DIFERENCIA: { etiqueta: 'No cuadra', tono: 'danger' },
  SIN_NOTAS: { etiqueta: 'Sin notas', tono: 'warning' },
  ANULADO: { etiqueta: 'Anulado', tono: 'neutral' },
}

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })

/*
  UN MONTO SE ESCRIBE CON SUS PUNTOS. Christopher, 06/11/2026: «687248» en la
  casilla del monto aplicado «se confunde con un código». Mientras se escribe
  se deja tal cual —poner puntos a mitad de tecleo mueve el cursor—; al salir
  de la casilla se reescribe como 687.248,00. Se acepta punto o coma.
*/
/** La tasa no tiene miles: «848.546» es 848,546, no 848.546 bolívares. */
const leerTasa = (texto: string) => Number(comoNumero(texto))

const comoCifra = (texto: string, decimales: 2 | 4 = 2) => {
  if (!texto.trim()) return ''
  const n = decimales === 4 ? leerTasa(texto) : leerMonto(texto)
  if (!Number.isFinite(n) || n === 0) return texto
  return decimales === 4 ? formatoTasa(n) : cifra(n)
}

function CampoMonto({
  decimales = 2,
  value,
  onChange,
  ...resto
}: Omit<ComponentProps<typeof Input>, 'value' | 'onChange'> & {
  value: string
  onChange: (texto: string) => void
  decimales?: 2 | 4
}) {
  return (
    <Input
      // Cifras y separadores nada más; el largo cabe 12 enteras con sus puntos
      // de millar y los decimales (08/11/2026).
      maxLength={22}
      {...resto}
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ''))}
      onBlur={() => onChange(comoCifra(value, decimales))}
    />
  )
}

/** El mes anterior al de hoy, «2026-10»: es el que se suele cerrar. */
const mesAnterior = () => {
  const [a, m] = hoy().split('-').map(Number)
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
}

const nombreDelMes = (aaaamm: string) => {
  const [a, m] = aaaamm.split('-').map(Number)
  const texto = new Date(a, m - 1, 1).toLocaleDateString('es-VE', { month: 'long' })
  return `${texto.charAt(0).toUpperCase()}${texto.slice(1)} ${a}`
}

export function RegistrosDePagos() {
  const { data, isPending, error } = usePagosBancarios()
  const { data: cubiertasDeMas } = useNotasCubiertasDeMas()
  const { data: comprobantes } = useComprobantesDePagos()
  const { puede } = useMisAcciones()
  const puedeRegistrar = puede('VENTAS.REGISTRAR_PAGOS')
  // 11/11/2026: cambiar el monto aplicado a una nota ya enlazada es permiso aparte.
  const puedeCambiarMonto = puede('VENTAS.CAMBIAR_MONTO_APLICADO')

  const comprobantesPorPago = useMemo(() => {
    const m = new Map<number, ComprobantePago[]>()
    for (const c of comprobantes ?? []) m.set(c.pago_id, [...(m.get(c.pago_id) ?? []), c])
    return m
  }, [comprobantes])
  const vigentesDe = (pagoId: number) => (comprobantesPorPago.get(pagoId) ?? []).filter((c) => !c.quitado_en).length

  const { data: observaciones } = useObservacionesDePagos()
  const observacionDe = useMemo(() => {
    const m = new Map<number, ObservacionPago>()
    for (const o of observaciones ?? []) m.set(o.id, o)
    return m
  }, [observaciones])

  const [busca, setBusca] = useState('')
  const [estado, setEstado] = useState('')
  const [moneda, setMoneda] = useState('')
  const [montoDesde, setMontoDesde] = useState('')
  const [montoHasta, setMontoHasta] = useState('')
  const [rango, setRango] = useState<Rango>(SIN_RANGO)
  const [abierto, setAbierto] = useState<number | null>(null)
  const [editando, setEditando] = useState<PagoBancario | 'nuevo' | null>(null)
  const [importando, setImportando] = useState(false)
  const [pidiendoReporte, setPidiendoReporte] = useState(false)
  const [reporte, setReporte] = useState<ArchivoArmado | null>(null)

  const filtrados = useMemo(() => {
    const aguja = enMayuscula(busca.trim())
    const desde = montoDesde.trim() ? leerMonto(montoDesde) : null
    const hasta = montoHasta.trim() ? leerMonto(montoHasta) : null
    return (data ?? []).filter((p) => {
      if (estado && p.estado !== estado) return false
      if (!estado && p.estado === 'ANULADO') return false
      if (moneda && p.moneda !== moneda) return false
      if (rango.desde && p.fecha < rango.desde) return false
      if (rango.hasta && p.fecha > rango.hasta) return false
      if (desde != null && Number(p.monto) < desde) return false
      if (hasta != null && Number(p.monto) > hasta) return false
      if (!aguja) return true
      return [p.referencia, p.descripcion, p.numeros, p.clientes, observacionDe.get(p.id)?.observacion].some((x) =>
        enMayuscula(x ?? '').includes(aguja),
      )
    })
  }, [data, busca, estado, moneda, rango, montoDesde, montoHasta, observacionDe])

  const cuenta = (e: EstadoPago) => filtrados.filter((p) => p.estado === e).length
  const monedasEnLista = Array.from(new Set((data ?? []).map((p) => p.moneda)))

  return (
    <>
      <PageHeader
        title="Conciliación de Pagos"
        description="Los pagos que llegaron al banco y las notas de entrega que cubre cada uno. Toque un pago para ver sus notas."
        actions={
          <>
            <Button
              variant="outline"
              icon={<Printer />}
              disabled={!data || data.length === 0}
              onClick={() => setPidiendoReporte(true)}
            >
              Reporte PDF
            </Button>
            {puedeRegistrar ? (
              <>
                <Button variant="outline" icon={<Upload />} onClick={() => setImportando(true)}>
                  Importar del banco
                </Button>
                <Button icon={<Plus />} onClick={() => setEditando('nuevo')}>
                  Registrar pago
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <Card className="mb-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="sm:col-span-2">
            <Input
              label="Buscar"
              icon={<Search />}
              placeholder="Referencia, descripción, NE o cliente"
              maxLength={100}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Select
            label="Estado"
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            opciones={[
              { valor: '', etiqueta: 'Todos los vigentes' },
              ...Object.entries(ESTADOS).map(([valor, x]) => ({ valor, etiqueta: x.etiqueta })),
            ]}
          />
          <Select
            label="Moneda"
            value={moneda}
            onChange={(e) => setMoneda(e.target.value)}
            opciones={[
              { valor: '', etiqueta: 'Cualquiera' },
              ...monedasEnLista.map((m) => ({ valor: m, etiqueta: m === 'VES' ? 'Bolívares' : m === 'USD' ? 'Dólares' : m })),
            ]}
          />
          <div className="grid grid-cols-2 gap-2">
            <CampoMonto label="Monto desde" value={montoDesde} onChange={setMontoDesde} />
            <CampoMonto label="hasta" value={montoHasta} onChange={setMontoHasta} />
          </div>
        </div>
        <div className="mt-3">
          <RangoDeFechas valor={rango} onCambio={setRango} />
        </div>
      </Card>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {/*
        UNA NOTA COBRADA MÁS DE UNA VEZ. Se vio el 06/11/2026: siete notas
        asociadas a dos, tres y cinco pagos, cada pago «cuadrando». Desde ese
        día el sistema ya no lo deja hacer; las que quedaron así se enseñan
        aquí hasta que alguien quite los enlaces que sobran.
      */}
      {cubiertasDeMas && cubiertasDeMas.length > 0 ? (
        <Card className="border-danger/30 bg-danger/5 mb-4">
          <p className="text-danger font-medium">
            {cubiertasDeMas.length === 1
              ? 'Una nota está cubierta de más'
              : `${cubiertasDeMas.length} notas están cubiertas de más`}
          </p>
          <p className="text-ink/65 mt-1 text-sm">
            Reciben en sus pagos más de lo que valen: casi siempre porque la misma nota quedó asociada a varios
            pagos. Busque la nota, abra sus pagos y quite la que sobra (o baje su monto aplicado).
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {cubiertasDeMas.map((n) => (
              <li key={n.nota_id}>
                <button
                  type="button"
                  className="text-ink/85 hover:text-royal-700 font-medium underline-offset-2 hover:underline"
                  onClick={() => setBusca(n.numero)}
                >
                  {n.numero}
                </button>
                <span className="text-ink/55">
                  {' '}
                  · {n.cliente ?? 'Sin cliente'} · vale {dinero('USD', n.total_usd)} y recibe{' '}
                  {dinero('USD', n.aplicado_usd)} en {n.pagos} pagos
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {data && filtrados.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2 text-sm">
          <Chip>{filtrados.length} pagos</Chip>
          {(['CUADRA', 'MINIMA', 'DIFERENCIA', 'SIN_NOTAS'] as EstadoPago[]).map((e) =>
            cuenta(e) > 0 ? (
              <Chip key={e} tone={ESTADOS[e].tono}>
                {cuenta(e)} {ESTADOS[e].etiqueta.toLowerCase()}
              </Chip>
            ) : null,
          )}
        </div>
      ) : null}

      {data && filtrados.length === 0 ? (
        <Card>
          <Vacio
            icono={<Landmark />}
            titulo={data.length === 0 ? 'Sin pagos registrados' : 'Sin resultados'}
            descripcion={
              data.length === 0
                ? 'Registre un pago a mano o impórtelos desde la planilla del banco.'
                : 'Pruebe quitando algún filtro.'
            }
          />
        </Card>
      ) : null}

      {filtrados.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="w-8 px-3 py-3" />
                  <th className="px-3 py-3 font-medium">Fecha</th>
                  <th className="px-3 py-3 font-medium">Referencia · descripción</th>
                  <th className="px-3 py-3 text-right font-medium">Monto del banco</th>
                  <th className="px-3 py-3 font-medium">Notas</th>
                  <th className="px-5 py-3 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => {
                  const esteAbierto = abierto === p.id
                  return (
                    <Fragment key={p.id}>
                      <tr
                        onClick={() => setAbierto(esteAbierto ? null : p.id)}
                        className="border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors"
                      >
                        <td className="text-ink/40 px-3 py-3">
                          {esteAbierto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </td>
                        <td className="text-ink/75 px-3 py-3 whitespace-nowrap">{fecha(p.fecha)}</td>
                        <td className="px-3 py-3">
                          <p className="text-ink/85 flex items-center gap-1.5 font-medium">
                            {p.referencia ? `REF ${p.referencia}` : 'Sin referencia'}
                            {vigentesDe(p.id) > 0 ? (
                              <span
                                className="text-ink/50 inline-flex items-center gap-0.5 text-xs font-normal"
                                title="Tiene comprobante adjunto"
                              >
                                <Paperclip className="size-3.5" />
                                {vigentesDe(p.id) > 1 ? vigentesDe(p.id) : null}
                              </span>
                            ) : null}
                          </p>
                          {p.descripcion ? <p className="text-ink/50 line-clamp-1 text-xs">{p.descripcion}</p> : null}
                          {observacionDe.get(p.id) ? (
                            <p className="text-info line-clamp-1 text-xs">Obs.: {observacionDe.get(p.id)!.observacion}</p>
                          ) : null}
                        </td>
                        <td className="tabular px-3 py-3 text-right whitespace-nowrap">
                          <span className="text-ink/90 font-medium">{dinero(p.moneda, p.monto)}</span>
                          {p.moneda !== 'USD' && p.monto_usd ? (
                            <span className="text-ink/45 block text-xs">{dinero('USD', p.monto_usd)}</span>
                          ) : null}
                        </td>
                        <td className="text-ink/70 px-3 py-3 text-xs">
                          {p.notas > 0 ? (
                            <>
                              <span className="text-ink/85 font-medium">{p.numeros}</span>
                              {p.clientes ? <span className="block">{p.clientes}</span> : null}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Chip tone={ESTADOS[p.estado].tono}>{ESTADOS[p.estado].etiqueta}</Chip>
                          {p.estado === 'MINIMA' || p.estado === 'DIFERENCIA' ? (
                            <span className="text-ink/50 tabular block pt-1 text-xs">
                              {Number(p.diferencia) > 0 ? 'Sobran ' : 'Faltan '}
                              {dinero(p.moneda, Math.abs(Number(p.diferencia)))}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                      {esteAbierto ? (
                        <tr className="border-hairline bg-ink/2 border-b">
                          <td colSpan={6} className="px-4 py-4 sm:px-6">
                            <DetalleDelPago
                              pago={p}
                              puedeRegistrar={puedeRegistrar}
                              puedeCambiarMonto={puedeCambiarMonto}
                              cubiertasDeMas={cubiertasDeMas ?? []}
                              comprobantes={comprobantesPorPago.get(p.id) ?? []}
                              observacion={observacionDe.get(p.id) ?? null}
                              onEditar={() => setEditando(p)}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {editando ? (
        <ModalPago pago={editando === 'nuevo' ? null : editando} onCerrar={() => setEditando(null)} />
      ) : null}
      {importando ? <ModalImportar existentes={data ?? []} onCerrar={() => setImportando(false)} /> : null}

      {pidiendoReporte ? (
        <ModalReporte
          todos={data ?? []}
          cubiertasDeMas={cubiertasDeMas ?? []}
          filtrados={filtrados}
          alcanceEnPantalla={[
            [
              'Fechas',
              rango.desde || rango.hasta
                ? `${rango.desde ? fecha(rango.desde) : 'sin inicio'} — ${rango.hasta ? fecha(rango.hasta) : 'hoy'}`
                : 'Todas',
            ],
            ['Estado', estado ? ESTADOS[estado as EstadoPago].etiqueta : 'Todos los vigentes'],
            ['Moneda', moneda || 'Todas'],
            ...(montoDesde || montoHasta
              ? ([['Monto', `${montoDesde || '0'} a ${montoHasta || 'sin tope'}`]] as [string, string][])
              : []),
            ...(busca.trim() ? ([['Búsqueda', busca.trim()]] as [string, string][]) : []),
          ]}
          onCerrar={() => setPidiendoReporte(false)}
          onListo={(archivo) => {
            setPidiendoReporte(false)
            setReporte(archivo)
          }}
        />
      ) : null}

      <Visor
        abierto={reporte !== null}
        onCerrar={() => setReporte(null)}
        blob={reporte?.blob ?? null}
        nombreArchivo={reporte?.nombre ?? ''}
        titulo="Conciliación de Pagos"
      />
    </>
  )
}

// ─────────────────────────────── el reporte ─────────────────────────────────

function ModalReporte({
  todos,
  cubiertasDeMas,
  filtrados,
  alcanceEnPantalla,
  onCerrar,
  onListo,
}: {
  todos: PagoBancario[]
  cubiertasDeMas: NotaCubiertaDeMas[]
  filtrados: PagoBancario[]
  alcanceEnPantalla: Array<[string, string]>
  onCerrar: () => void
  onListo: (a: ArchivoArmado) => void
}) {
  const { data: empresa } = useEmpresa()
  const { data: yo } = useMiPerfil()

  /*
    UN PAPEL QUE NO INFORMA NO SE IMPRIME (06/11/2026). Christopher recibió un
    «cierre de octubre» con el resumen en cero y la tabla vacía: el mes no
    tenía pagos pendientes y el interruptor los había quitado todos. Desde
    entonces:
      - el mes se elige entre los que TIENEN pagos, y puede ser un rango;
      - el resumen cuenta siempre el período entero, aunque la lista lleve
        solo lo pendiente;
      - una lista vacía se dice en una línea, nunca como tabla sin filas;
      - si no queda nada que contar, no se genera y se dice por qué.
  */
  const meses = useMemo(() => {
    const cuenta = new Map<string, number>()
    for (const p of todos) {
      if (p.estado === 'ANULADO') continue
      const m = p.fecha.slice(0, 7)
      cuenta.set(m, (cuenta.get(m) ?? 0) + 1)
    }
    return Array.from(cuenta.entries()).sort((x, y) => (x[0] < y[0] ? 1 : -1))
  }, [todos])
  // Por defecto, el mes anterior si tuvo pagos; si no, el último que tuvo.
  const mesInicial = meses.find(([m]) => m === mesAnterior())?.[0] ?? meses[0]?.[0] ?? mesAnterior()

  const [modo, setModo] = useState<'LISTA' | 'CIERRE'>('CIERRE')
  const [desdeMes, setDesdeMes] = useState(mesInicial)
  const [hastaMes, setHastaMes] = useState(mesInicial)
  const [conLista, setConLista] = useState(true)
  const [conNotasDelPago, setConNotasDelPago] = useState(true)
  const [conCuadrados, setConCuadrados] = useState(true)
  const [conSinPago, setConSinPago] = useState(true)
  const [conAnulados, setConAnulados] = useState(false)
  const [conLogo, setConLogo] = useState(true)
  const [armando, setArmando] = useState(false)
  const [falla, setFalla] = useState<string | null>(null)

  // El período, aunque se elijan los meses al revés.
  const [mesA, mesB] = desdeMes <= hastaMes ? [desdeMes, hastaMes] : [hastaMes, desdeMes]
  const desde = `${mesA}-01`
  const hasta = (() => {
    const [a, m] = mesB.split('-').map(Number)
    return `${mesB}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`
  })()
  const variosMeses = mesA !== mesB
  const nombrePeriodo = variosMeses ? `${nombreDelMes(mesA)} — ${nombreDelMes(mesB)}` : nombreDelMes(mesA)

  // Lo del período (para el resumen) y lo que de verdad irá en la lista.
  const delPeriodo =
    modo === 'CIERRE'
      ? todos.filter((p) => p.fecha >= desde && p.fecha <= hasta && (conAnulados || p.estado !== 'ANULADO'))
      : filtrados
  const enLista = conCuadrados ? delPeriodo : delPeriodo.filter((p) => p.estado !== 'CUADRA')
  const vigentesDelPeriodo = delPeriodo.filter((p) => p.estado !== 'ANULADO').length

  // Lo que se le dice a la persona antes de generar.
  const previo =
    vigentesDelPeriodo === 0
      ? modo === 'CIERRE'
        ? conSinPago
          ? `En ${nombrePeriodo} no hay pagos del banco. El papel llevará solo las notas de entrega sin pago, si las hay.`
          : `En ${nombrePeriodo} no hay pagos del banco: no hay nada que informar.`
        : 'La pantalla no tiene pagos con esos filtros: no hay nada que informar.'
      : !conLista
        ? `Saldrá solo el resumen de ${vigentesDelPeriodo} pago(s), sin la lista.`
        : enLista.length === 0
          ? `Los ${vigentesDelPeriodo} pago(s) cuadran: en lugar de la lista saldrá una línea que lo dice.`
          : `Saldrán ${enLista.length} de ${delPeriodo.length} pago(s) en la lista.`
  const nadaQueInformar = vigentesDelPeriodo === 0 && !(modo === 'CIERRE' && conSinPago)

  const armar = async () => {
    setArmando(true)
    setFalla(null)
    try {
      let notasSinPago = null
      let deMas: NotaCubiertaDeMas[] | null = null
      let alcance: Array<[string, string]>
      let nombre = 'registros-de-pagos'

      if (modo === 'CIERRE') {
        if (conSinPago) notasSinPago = await leerNotasSinPago(desde, hasta)
        if (vigentesDelPeriodo === 0 && (notasSinPago?.length ?? 0) === 0) {
          setFalla(`En ${nombrePeriodo} no hay pagos del banco ni notas de entrega sin pago: no hay nada que informar.`)
          return
        }
        // Un cierre no se firma sin decir que hay notas cobradas dos veces en el período.
        deMas = cubiertasDeMas.filter((n) => n.fecha >= desde && n.fecha <= hasta)
        alcance = [
          [variosMeses ? 'Meses' : 'Mes', nombrePeriodo],
          ['Período', `${fecha(desde)} — ${fecha(hasta)}`],
        ]
        nombre += variosMeses ? `-cierre-${mesA}-a-${mesB}` : `-cierre-${mesA}`
      } else {
        alcance = alcanceEnPantalla
      }

      if (!conLista) {
        alcance = [...alcance, ['Se muestra', 'Solo el resumen, sin la lista de pagos']]
        nombre += '-resumen'
      } else if (!conCuadrados) {
        alcance = [...alcance, ['Se muestran', 'Solo los pagos que no cuadran o no tienen notas']]
        nombre += '-pendientes'
      }
      if (!conLogo) nombre += '-sin-logo'

      onListo(
        await armarReportePagos({
          modo,
          mes: nombrePeriodo,
          variosMeses,
          alcance,
          resumenDe: delPeriodo,
          pagos: conLista
            ? [...enLista].sort((x, y) => (x.fecha === y.fecha ? x.id - y.id : x.fecha < y.fecha ? -1 : 1))
            : null,
          conNotasDelPago,
          notasSinPago,
          cubiertasDeMas: deMas,
          conLogo,
          nombreArchivo: `${nombre}.pdf`,
          empresa: empresaDelPapel(empresa),
          emitidoPor: yo?.nombre ?? '',
          momento: new Date(),
        }),
      )
    } catch (e) {
      setFalla(e instanceof Error ? e.message : 'No se pudo armar el reporte.')
    } finally {
      setArmando(false)
    }
  }

  const opcionesDeMes = meses.map(([m, n]) => ({ valor: m, etiqueta: `${nombreDelMes(m)} · ${n} pago${n === 1 ? '' : 's'}` }))

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Reporte PDF de pagos"
      descripcion="Elija qué sale en el papel. El cierre toma los meses enteros, sin importar los filtros de la pantalla."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button icon={<Printer />} disabled={armando || nadaQueInformar} onClick={() => void armar()}>
            {armando ? 'Armando…' : 'Generar PDF'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Qué reporte"
          value={modo}
          onChange={(e) => {
            setModo(e.target.value as 'LISTA' | 'CIERRE')
            setFalla(null)
          }}
          opciones={[
            { valor: 'CIERRE', etiqueta: 'Cierre de mes' },
            { valor: 'LISTA', etiqueta: `Lo que está en pantalla (${filtrados.length} pagos)` },
          ]}
        />
      </div>
      {modo === 'CIERRE' ? (
        opcionesDeMes.length > 0 ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Select
              label="Desde el mes"
              value={desdeMes}
              onChange={(e) => {
                setDesdeMes(e.target.value)
                setFalla(null)
              }}
              opciones={opcionesDeMes}
            />
            <Select
              label="Hasta el mes"
              hint="Para un solo mes, deje el mismo en los dos."
              value={hastaMes}
              onChange={(e) => {
                setHastaMes(e.target.value)
                setFalla(null)
              }}
              opciones={opcionesDeMes}
            />
          </div>
        ) : (
          <p className="text-ink/60 mt-4 text-sm">Todavía no hay pagos registrados para cerrar.</p>
        )
      ) : null}

      <p className={`mt-4 text-sm ${nadaQueInformar ? 'text-warning font-medium' : 'text-ink/65'}`}>{previo}</p>

      <div className="mt-5 space-y-3">
        <Interruptor
          encendido={conLista}
          onCambio={setConLista}
          etiqueta="Incluir la lista de pagos"
          detalle="Apagado, el papel lleva solo el resumen del período (y las secciones de abajo que estén encendidas)."
        />
        {conLista ? (
          <>
            <Interruptor
              encendido={conNotasDelPago}
              onCambio={setConNotasDelPago}
              etiqueta="Mostrar las notas de cada pago"
              detalle="Debajo de cada pago, los números de nota y el cliente."
            />
            <Interruptor
              encendido={conCuadrados}
              onCambio={setConCuadrados}
              etiqueta="Incluir los pagos que ya cuadran"
              detalle="Apagado, la lista lleva solo lo pendiente. El resumen sigue contando todo el período."
            />
          </>
        ) : null}
        {modo === 'CIERRE' ? (
          <>
            <Interruptor
              encendido={conSinPago}
              onCambio={setConSinPago}
              etiqueta="Incluir las notas sin pago"
              detalle="Las notas de entrega del período que no tienen ningún pago asociado."
            />
            <Interruptor
              encendido={conAnulados}
              onCambio={setConAnulados}
              etiqueta="Incluir los pagos anulados"
              detalle="Salen marcados como anulados y no suman."
            />
          </>
        ) : null}
        <Interruptor encendido={conLogo} onCambio={setConLogo} etiqueta="Con logo" />
      </div>

      {falla ? <ErrorDeCarga error={new Error(falla)} className="mt-4" /> : null}
    </Modal>
  )
}

// ─────────────────────────────── el detalle ─────────────────────────────────

function DetalleDelPago({
  pago,
  puedeRegistrar,
  puedeCambiarMonto,
  cubiertasDeMas,
  comprobantes,
  observacion,
  onEditar,
}: {
  pago: PagoBancario
  puedeRegistrar: boolean
  puedeCambiarMonto: boolean
  cubiertasDeMas: NotaCubiertaDeMas[]
  comprobantes: ComprobantePago[]
  observacion: ObservacionPago | null
  onEditar: () => void
}) {
  const { data, isPending, error } = useNotasDePago(pago.id)
  const cambiar = useCambiarMontoAplicado()
  const quitar = useQuitarNotaDePago()
  const anular = useAnularPagoBancario()
  const [asociando, setAsociando] = useState(false)
  const [anulando, setAnulando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [montos, setMontos] = useState<Record<number, string>>({})

  const vigente = pago.anulado_en == null
  const editable = puedeRegistrar && vigente

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span>
          <span className="text-ink/50">Banco: </span>
          <span className="text-ink/90 font-medium">{dinero(pago.moneda, pago.monto)}</span>
          {pago.tasa ? <span className="text-ink/45"> · tasa {formatoTasa(pago.tasa)}</span> : null}
        </span>
        <span>
          <span className="text-ink/50">Notas: </span>
          <span className="text-ink/90 font-medium">{dinero(pago.moneda, pago.aplicado)}</span>
        </span>
        {pago.notas > 0 ? (
          <span>
            <span className="text-ink/50">Diferencia: </span>
            <span className={Math.abs(Number(pago.diferencia)) < 0.005 ? 'text-success font-medium' : 'text-warning font-medium'}>
              {dinero(pago.moneda, pago.diferencia)}
            </span>
          </span>
        ) : null}
      </div>

      {pago.descripcion ? <p className="text-ink/60 mb-3 text-xs">{pago.descripcion}</p> : null}
      {!vigente ? (
        <p className="text-danger mb-3 text-sm">Anulado: {pago.motivo_anulacion}</p>
      ) : null}

      <ObservacionDelPago pagoId={pago.id} observacion={observacion} puedeEditar={puedeRegistrar} />

      <ComprobantesDePago pagoId={pago.id} comprobantes={comprobantes} puedeAdjuntar={editable} />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <p className="text-ink/55 mb-3 text-sm">Este pago todavía no tiene notas de entrega asociadas.</p>
      ) : null}

      {data && data.length > 0 ? (
        <div className="border-hairline mb-3 divide-y overflow-hidden rounded-[6px] border">
          {data.map((n) => {
            const escrito = montos[n.enlace_id]
            const cambiado = escrito != null && leerMonto(escrito) !== Number(n.monto_aplicado)
            return (
              <div key={n.enlace_id} className="border-hairline flex flex-wrap items-center gap-3 px-3 py-2.5">
                <div className="min-w-[180px] flex-1">
                  <p className="text-ink/85 font-medium">
                    {n.numero} <span className="text-ink/45 font-normal">· {fecha(n.fecha)}</span>
                  </p>
                  <p className="text-ink/55 text-xs">
                    {n.cliente ?? 'Sin cliente'} · total {dinero(n.moneda, n.total)}
                    {n.otros_pagos > 0 ? ` · también en ${n.otros_pagos} pago(s) más` : ''}
                  </p>
                  {cubiertasDeMas.some((c) => c.nota_id === n.nota_id) ? (
                    <Chip tone="danger" className="mt-1">
                      Cubierta de más: revise sus otros pagos
                    </Chip>
                  ) : null}
                </div>
                {editable ? (
                  <div className="flex items-end gap-2">
                    {puedeCambiarMonto ? (
                    <CampoMonto
                      label={`Aplicado (${pago.moneda === 'VES' ? 'Bs' : pago.moneda})`}
                      className="w-40"
                      value={escrito ?? cifra(n.monto_aplicado)}
                      onChange={(t) => setMontos((m) => ({ ...m, [n.enlace_id]: t }))}
                    />
                    ) : (
                      <span className="text-ink/80 tabular self-center text-sm">{dinero(pago.moneda, n.monto_aplicado)}</span>
                    )}
                    {cambiado && puedeCambiarMonto ? (
                      <Button
                        size="sm"
                        disabled={cambiar.isPending}
                        onClick={async () => {
                          await cambiar.mutateAsync({ enlaceId: n.enlace_id, monto: leerMonto(escrito) })
                          setMontos((m) => {
                            const { [n.enlace_id]: _, ...resto } = m
                            return resto
                          })
                        }}
                      >
                        Guardar
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<X />}
                      disabled={quitar.isPending}
                      onClick={() => quitar.mutate(n.enlace_id)}
                    >
                      Quitar
                    </Button>
                  </div>
                ) : (
                  <span className="text-ink/80 tabular text-sm">{dinero(pago.moneda, n.monto_aplicado)}</span>
                )}
              </div>
            )
          })}
        </div>
      ) : null}

      {cambiar.error ? <ErrorDeCarga error={cambiar.error} className="mb-3" /> : null}
      {quitar.error ? <ErrorDeCarga error={quitar.error} className="mb-3" /> : null}

      {editable ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Link2 />} onClick={() => setAsociando(true)}>
            Asociar notas
          </Button>
          <Button size="sm" variant="outline" icon={<Pencil />} onClick={onEditar}>
            Editar pago
          </Button>
          <Button size="sm" variant="ghost" icon={<Ban />} onClick={() => setAnulando(true)}>
            Anular pago
          </Button>
        </div>
      ) : null}

      {asociando ? <ModalAsociar pago={pago} onCerrar={() => setAsociando(false)} /> : null}

      {anulando ? (
        <Modal
          abierto
          onCerrar={() => setAnulando(false)}
          titulo="Anular pago"
          descripcion="El pago no se borra: queda marcado como anulado, con su motivo, y deja de contar."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setAnulando(false)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={anular.isPending || motivo.trim().length < 4}
                onClick={async () => {
                  await anular.mutateAsync({ id: pago.id, motivo })
                  setAnulando(false)
                }}
              >
                Anular
              </Button>
            </>
          }
        >
          <Textarea label="Motivo" rows={2} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          {anular.error ? <ErrorDeCarga error={anular.error} className="mt-3" /> : null}
        </Modal>
      ) : null}
    </div>
  )
}

// ─────────────────────────────── la observación ─────────────────────────────

/*
  La nota interna de quien concilia, aparte de la descripción del banco. Se
  edita en el mismo sitio; vaciarla la quita. Se puede escribir también en un
  pago anulado: a veces es justo ahí donde hace falta explicar algo.
*/
function ObservacionDelPago({
  pagoId,
  observacion,
  puedeEditar,
}: {
  pagoId: number
  observacion: ObservacionPago | null
  puedeEditar: boolean
}) {
  const guardar = useGuardarObservacionPago()
  const { data: perfiles } = usePerfiles()
  const [texto, setTexto] = useState<string | null>(null)
  const actual = observacion?.observacion ?? ''
  const quien = observacion?.observacion_por
    ? perfiles?.find((p) => p.id === observacion.observacion_por)?.nombre
    : null

  if (texto != null) {
    return (
      <div className="mb-3">
        <Textarea
          label="Observación"
          rows={2}
          autoFocus
          maxLength={1000}
          placeholder="Por ejemplo: el cliente pagó dos viajes en una sola transferencia."
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            disabled={guardar.isPending || texto.trim() === actual}
            onClick={async () => {
              await guardar.mutateAsync({ id: pagoId, texto })
              setTexto(null)
            }}
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar observación'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setTexto(null)}>
            Cancelar
          </Button>
        </div>
        {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-2" /> : null}
      </div>
    )
  }

  if (!actual && !puedeEditar) return null

  return (
    <div className="mb-3">
      <p className="text-ink/55 mb-1 flex items-center gap-1.5 text-xs font-medium">
        <MessageSquareText className="size-3.5" />
        Observación
      </p>
      {actual ? (
        <>
          <p className="text-ink/85 text-sm whitespace-pre-line">{actual}</p>
          {observacion?.observacion_en ? (
            <p className="text-ink/45 mt-0.5 text-[11px]">
              {quien ?? '—'} · {fechaHora(observacion.observacion_en)}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-ink/45 text-xs">Sin observación.</p>
      )}
      {puedeEditar ? (
        <Button size="sm" variant="outline" className="mt-2" icon={<Pencil />} onClick={() => setTexto(actual)}>
          {actual ? 'Editar observación' : 'Agregar observación'}
        </Button>
      ) : null}
    </div>
  )
}

// ─────────────────────────────── asociar notas ──────────────────────────────

function ModalAsociar({ pago, onCerrar }: { pago: PagoBancario; onCerrar: () => void }) {
  const [texto, setTexto] = useState('')
  const [buscado, setBuscado] = useState('')
  const { data, isPending, error } = useNotasCandidatas(pago.id, buscado)
  const asociar = useAsociarNotas()
  const [elegidas, setElegidas] = useState<Record<number, number>>({})

  const sumaElegida = Object.values(elegidas).reduce((a, b) => a + b, 0)
  const conLoAsociado = Number(pago.aplicado) + sumaElegida
  const diferencia = Number(pago.monto) - conLoAsociado

  return (
    <Modal
      abierto
      ancho="lg"
      onCerrar={onCerrar}
      titulo={`Asociar notas al pago de ${dinero(pago.moneda, pago.monto)}`}
      descripcion="Salen primero las notas de una semana antes o después con el monto más parecido. Para otra nota, búsquela por número o cliente."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={asociar.isPending || Object.keys(elegidas).length === 0}
            onClick={async () => {
              await asociar.mutateAsync({
                pagoId: pago.id,
                notas: Object.keys(elegidas).map((id) => ({ nota_id: Number(id) })),
              })
              onCerrar()
            }}
          >
            {asociar.isPending ? 'Asociando…' : `Asociar ${Object.keys(elegidas).length || ''}`}
          </Button>
        </>
      }
    >
      <form
        className="mb-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setBuscado(texto)
        }}
      >
        <Input
          label="Buscar nota"
          icon={<Search />}
          placeholder="NE-2026-0012 o nombre del cliente"
          className="flex-1"
          maxLength={100}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>

      <div className="bg-ink/4 rounded-card mb-3 p-3 text-sm">
        Elegidas: <strong>{dinero(pago.moneda, sumaElegida)}</strong> · con lo ya asociado suman{' '}
        <strong>{dinero(pago.moneda, conLoAsociado)}</strong> de {dinero(pago.moneda, pago.monto)} ·{' '}
        <span className={Math.abs(diferencia) < 0.005 ? 'text-success' : 'text-warning'}>
          {Math.abs(diferencia) < 0.005
            ? 'cuadra'
            : `${diferencia > 0 ? 'faltan' : 'sobran'} ${dinero(pago.moneda, Math.abs(diferencia))}`}
        </span>
      </div>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}
      {data && data.length === 0 ? <p className="text-ink/55 text-sm">No apareció ninguna nota.</p> : null}

      {data && data.length > 0 ? (
        <div className="border-hairline max-h-[50vh] divide-y overflow-y-auto rounded-[6px] border">
          {data.map((n) => {
            const marcada = n.nota_id in elegidas
            return (
              <label
                key={n.nota_id}
                className="border-hairline hover:bg-ink/3 flex cursor-pointer items-center gap-3 px-3 py-2.5"
              >
                <input
                  type="checkbox"
                  className="accent-royal-600 size-5 shrink-0"
                  checked={marcada}
                  onChange={() =>
                    setElegidas((e) => {
                      if (marcada) {
                        const { [n.nota_id]: _, ...resto } = e
                        return resto
                      }
                      return { ...e, [n.nota_id]: Number(n.en_moneda_del_pago) }
                    })
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="text-ink/85 font-medium">
                    {n.numero} <span className="text-ink/45 font-normal">· {fecha(n.fecha)}</span>
                  </p>
                  <p className="text-ink/55 truncate text-xs">
                    {n.cliente ?? 'Sin cliente'} · total {dinero(n.moneda, n.total)}
                    {n.otros_pagos > 0 ? ` · ya está en ${n.otros_pagos} pago(s)` : ''}
                  </p>
                </div>
                {/* Lo que le falta a la nota, no su total: lo demás ya lo cubrieron otros pagos. */}
                <span className="tabular text-right text-sm whitespace-nowrap">
                  {Number(n.en_moneda_del_pago) > 0.005 ? (
                    <>
                      <span className="text-ink/45 block text-xs">{n.otros_pagos > 0 ? 'le falta' : 'vale'}</span>
                      <span className="text-ink/85">{dinero(pago.moneda, n.en_moneda_del_pago)}</span>
                    </>
                  ) : (
                    <span className="text-danger text-xs">Ya cubierta</span>
                  )}
                </span>
              </label>
            )
          })}
        </div>
      ) : null}

      {asociar.error ? <ErrorDeCarga error={asociar.error} className="mt-3" /> : null}
    </Modal>
  )
}

// ─────────────────────────────── registrar / editar ─────────────────────────

function ModalPago({ pago, onCerrar }: { pago: PagoBancario | null; onCerrar: () => void }) {
  const monedas = useMonedasUsables()
  const guardar = useGuardarPagoBancario()
  const [f, setF] = useState({
    fecha: pago?.fecha ?? hoy(),
    moneda: pago?.moneda ?? 'VES',
    monto: pago ? cifra(pago.monto) : '',
    tasa: pago?.tasa ? formatoTasa(pago.tasa) : '',
    referencia: pago?.referencia ?? '',
    descripcion: pago?.descripcion ?? '',
  })
  const cambiar = (c: Partial<typeof f>) => setF((x) => ({ ...x, ...c }))
  const monto = leerMonto(f.monto)
  // El comprobante va al registrar. Al editar, se adjunta desde el detalle del pago.
  const [archivos, setArchivos] = useState<File[]>([])
  const [subiendo, setSubiendo] = useState(false)
  // El pago ya se guardó pero el comprobante no subió: no se ofrece «Guardar» otra vez,
  // que crearía el pago repetido.
  const [aviso, setAviso] = useState<string | null>(null)
  const qc = useQueryClient()

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={pago ? 'Editar pago' : 'Registrar pago'}
      descripcion={
        pago
          ? 'Un pago que llegó al banco. Después se le asocian las notas de entrega que cubre.'
          : 'Adjunte la captura del pago y escriba los datos que se leen en ella. Después se le asocian las notas de entrega que cubre.'
      }
      acciones={
        aviso ? (
          <Button onClick={onCerrar}>Cerrar</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button
              disabled={guardar.isPending || subiendo || !f.fecha || !(monto > 0)}
              onClick={async () => {
                const r = await guardar.mutateAsync({
                  id: pago?.id,
                  fecha: f.fecha,
                  moneda: f.moneda,
                  monto,
                  tasa: f.moneda === 'USD' || !f.tasa.trim() ? null : leerTasa(f.tasa),
                  referencia: f.referencia.trim() || null,
                  descripcion: f.descripcion.trim() || null,
                })
                if (!pago && archivos.length > 0) {
                  setSubiendo(true)
                  try {
                    await subirComprobantes(Number(r), archivos)
                  } catch (e) {
                    setAviso(
                      `El pago quedó guardado, pero el comprobante no subió: ${e instanceof Error ? e.message : 'error desconocido'}. Despliegue el pago en la lista y adjúntelo de nuevo.`,
                    )
                    return
                  } finally {
                    setSubiendo(false)
                    void qc.invalidateQueries({ queryKey: ['pagos-bancarios'] })
                  }
                }
                onCerrar()
              }}
            >
              {guardar.isPending ? 'Guardando…' : subiendo ? 'Subiendo comprobante…' : 'Guardar'}
            </Button>
          </>
        )
      }
    >
      {!pago ? (
        <div className="mb-4">
          <ElegirArchivosDeCarga
            archivos={archivos}
            onCambiar={setArchivos}
            disponibles={MAXIMO_COMPROBANTES}
            descripcion="captura o PDF del pago. Con la cámara o desde la galería."
          />
        </div>
      ) : null}
      {aviso ? <p className="text-danger mb-4 text-sm">{aviso}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Fecha" type="date" max={hoy()} value={f.fecha} onChange={(e) => cambiar({ fecha: e.target.value })} />
        <Select
          label="Moneda"
          value={f.moneda}
          onChange={(e) => cambiar({ moneda: e.target.value })}
          opciones={monedas.data ?? [{ valor: 'VES', etiqueta: 'Bolívares' }, { valor: 'USD', etiqueta: 'Dólares' }]}
        />
        <CampoMonto
          label="Monto"
          placeholder="42.110,34"
          value={f.monto}
          onChange={(t) => cambiar({ monto: t })}
        />
        {f.moneda !== 'USD' ? (
          <CampoMonto
            label="Tasa (Bs por $)"
            decimales={4}
            hint="Si la deja vacía se usa la del BCV de ese día."
            value={f.tasa}
            onChange={(t) => cambiar({ tasa: t })}
          />
        ) : null}
        <Input
          label="Referencia"
          solo="alfanumerico"
          maxLength={30}
          value={f.referencia}
          onChange={(e) => cambiar({ referencia: e.target.value })}
        />
      </div>
      <Textarea
        label="Descripción"
        className="mt-4"
        rows={2}
        maxLength={500}
        value={f.descripcion}
        onChange={(e) => cambiar({ descripcion: e.target.value })}
      />
      {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-4" /> : null}
    </Modal>
  )
}

// ─────────────────────────────── importar ───────────────────────────────────

function ModalImportar({ existentes, onCerrar }: { existentes: PagoBancario[]; onCerrar: () => void }) {
  const importar = useImportarPagosBancarios()
  const [texto, setTexto] = useState('')
  const [filas, setFilas] = useState<FilaLeida[]>([])
  const [resultado, setResultado] = useState<{ nuevos: number; repetidos: number } | null>(null)
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null)

  /*
    POSIBLE REPETIDO. Un pago registrado a mano con su captura puede volver a
    llegar en el estado del banco, y la referencia rara vez se escribe igual
    en los dos (completa en uno, los últimos dígitos en el otro). La base solo
    descarta el repetido con la referencia exacta; aquí se avisa también cuando
    coinciden fecha, moneda y monto, y la fila llega desmarcada: que decida
    una persona.
  */
  const parecido = (fila: FilaLeida['fila']) =>
    existentes.find(
      (p) =>
        p.estado !== 'ANULADO' &&
        p.fecha === fila.fecha &&
        p.moneda === fila.moneda &&
        Math.abs(Number(p.monto) - fila.monto) < 0.005,
    ) ?? null

  const leer = (t: string) => {
    setTexto(t)
    setResultado(null)
    setFilas(leerPagosDelBanco(t, hoy()).map((x) => (x.incluir && parecido(x.fila) ? { ...x, incluir: false } : x)))
  }

  const marcadas = filas.filter((x) => x.incluir)

  return (
    <Modal
      abierto
      ancho="lg"
      onCerrar={onCerrar}
      titulo="Importar pagos del banco"
      descripcion="Copie las filas de la planilla del banco (en Excel o Google Sheets) y péguelas aquí, o suba el archivo en CSV. Revise la vista previa antes de importar."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            {resultado ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!resultado ? (
            <Button
              disabled={importar.isPending || marcadas.length === 0}
              onClick={async () => {
                const r = await importar.mutateAsync(marcadas.map((x) => x.fila))
                setResultado(r)
              }}
            >
              {importar.isPending ? 'Importando…' : `Importar ${marcadas.length} pago(s)`}
            </Button>
          ) : null}
        </>
      }
    >
      {resultado ? (
        <div className="bg-success/10 rounded-card p-4 text-sm">
          Listo: <strong>{resultado.nuevos}</strong> pago(s) nuevo(s).
          {resultado.repetidos > 0
            ? ` ${resultado.repetidos} ya estaban registrados (misma fecha, monto y referencia) y no se duplicaron.`
            : ''}
        </div>
      ) : (
        <>
          <Textarea
            label="Pegue aquí las filas"
            rows={5}
            placeholder="15-09-26 · VES-BS BDT · 42.110,34 · Bs842,2067 · … · VENTA DE ARENA REF: 0928"
            value={texto}
            onChange={(e) => leer(e.target.value)}
          />
          <label className="text-ink/70 mt-3 inline-flex cursor-pointer items-center gap-2 text-sm">
            <Upload className="size-4" />
            <span className="underline">O suba un archivo (.csv o .txt)</span>
            <input
              type="file"
              accept=".csv,.txt,.tsv,text/csv,text/plain"
              className="sr-only"
              onChange={async (e) => {
                const archivo = e.target.files?.[0]
                e.target.value = ''
                if (!archivo) return
                if (/\.xlsx?$/i.test(archivo.name)) {
                  setErrorArchivo('Ese es un archivo de Excel. Ábralo y copie las filas, o guárdelo como CSV y súbalo.')
                  return
                }
                setErrorArchivo(null)
                try {
                  leer(await archivo.text())
                } catch {
                  setErrorArchivo('No se pudo leer el archivo. Pruebe copiando y pegando las filas.')
                }
              }}
            />
          </label>
          {errorArchivo ? <p className="text-danger mt-2 text-sm">{errorArchivo}</p> : null}

          {filas.length > 0 ? (
            <div className="border-hairline mt-4 max-h-[45vh] overflow-auto rounded-[6px] border">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                    <th className="px-3 py-2" />
                    <th className="px-3 py-2 font-medium">Fecha</th>
                    <th className="px-3 py-2 text-right font-medium">Monto</th>
                    <th className="px-3 py-2 font-medium">Referencia</th>
                    <th className="px-3 py-2 font-medium">Descripción</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((x, i) => (
                    <tr key={i} className={`border-hairline border-b ${x.incluir ? '' : 'opacity-55'}`}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          className="accent-royal-600 size-5"
                          checked={x.incluir}
                          disabled={x.problema != null}
                          onChange={() =>
                            setFilas((fs) => fs.map((y, j) => (j === i ? { ...y, incluir: !y.incluir } : y)))
                          }
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{x.fila.fecha ? fecha(x.fila.fecha) : '—'}</td>
                      <td className="tabular px-3 py-2 text-right whitespace-nowrap">
                        {x.fila.monto > 0 ? dinero(x.fila.moneda, x.fila.monto) : '—'}
                      </td>
                      <td className="px-3 py-2">{x.fila.referencia ?? '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        {x.problema ? <span className="text-danger">{x.problema} </span> : null}
                        {(() => {
                          const p = x.problema ? null : parecido(x.fila)
                          if (!p) return null
                          const mismaRef =
                            !!p.referencia && !!x.fila.referencia && p.referencia === enMayuscula(x.fila.referencia.trim())
                          return (
                            <span className="text-warning block font-medium">
                              {mismaRef
                                ? 'Ya está registrado con esta misma referencia: no se duplicará.'
                                : `Posible repetido: ya hay un pago de ese día por ese monto (${p.referencia ? `REF ${p.referencia}` : 'sin referencia'}). Márquelo solo si es otro pago.`}
                            </span>
                          )
                        })()}
                        <span className="text-ink/60 line-clamp-2">{x.fila.descripcion ?? x.texto}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {filas.length > 0 ? (
            <p className="text-ink/50 mt-2 text-xs">
              {marcadas.length} de {filas.length} filas marcadas. Las de nómina, préstamos, intereses y saldo
              inicial vienen desmarcadas; márquelas si sí son ventas. También vienen desmarcadas las que se
              parecen a un pago ya registrado (misma fecha y monto).
            </p>
          ) : null}
        </>
      )}
      {importar.error ? <ErrorDeCarga error={importar.error} className="mt-4" /> : null}
    </Modal>
  )
}
