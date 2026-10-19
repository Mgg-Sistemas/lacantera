import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  Check,
  ClipboardCopy,
  Download,
  MessageCircle,
  Plus,
  Printer,
  ShoppingCart,
  Smartphone,
  TriangleAlert,
  UtensilsCrossed,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { RangoDeFechas } from '@/components/RangoDeFechas'
import type { Rango } from '@/components/rango'
import { Visor } from '@/components/Visor'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useEmpresa } from '@/lib/api/empresa'
import { useSesion } from '@/lib/sesion'
import { hoyEnCaracas } from '@/lib/api/tasas'
import {
  TIPOS_DE_COMIDA,
  useAnularComida,
  useComidas,
  useServirComida,
  useViveres,
  type Comida,
  type TipoComida,
} from '@/lib/api/alimentacion'
import { dolares, fecha as fmtFecha } from '@/lib/formato'
import { cn } from '@/lib/cn'
import { armarInformeAlimentacion } from '@/lib/ficha/alimentacionPdf'
import { copiarAlPortapapeles } from '@/lib/ficha/reporteDiario'
import { textoDelReporteAlimentacion } from '@/lib/ficha/reporteAlimentacion'
import { PedirMercado } from './PedirMercado'
import { CampoCantidadDeViver } from './CampoCantidadDeViver'

/*
  EL CONTROL DE ALIMENTACIÓN, EN EL ESCRITORIO.

  Tres cosas, en el orden en que se preguntan: cuánto costó el plato en el
  período que se mira, qué víveres quedan, y la lista de comidas servidas.
  Servir desde aquí existe —la analista transcribe un papel— pero la pantalla
  pensada para servir es la del teléfono, que es donde está el cocinero.
*/

const nombreDeTipo = (t: TipoComida) => TIPOS_DE_COMIDA.find((x) => x.tipo === t)?.nombre ?? t

const primerDiaDelMes = (hoy: string) => `${hoy.slice(0, 7)}-01`

export function Alimentacion() {
  const { puede } = useMisPermisos()
  const puedeServir = puede('ALIMENTACION', 'ESCRITURA')
  const hoy = hoyEnCaracas()
  const { data: empresa } = useEmpresa()
  const { nombre: yo } = useSesion()

  const [rango, setRango] = useState<Rango>({ desde: primerDiaDelMes(hoy), hasta: hoy })
  const desde = rango.desde || primerDiaDelMes(hoy)
  const hasta = rango.hasta || hoy
  const comidas = useComidas(desde, hasta)
  const viveres = useViveres()

  const [sirviendo, setSirviendo] = useState(false)
  const [pidiendoMercado, setPidiendoMercado] = useState(false)
  const [anulando, setAnulando] = useState<Comida | null>(null)
  const [reportando, setReportando] = useState(false)
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)

  const vivas = useMemo(() => (comidas.data ?? []).filter((c) => c.estado === 'SERVIDA'), [comidas.data])
  const totalValor = vivas.reduce((s, c) => s + Number(c.valor_usd), 0)
  const totalPlatos = vivas.reduce((s, c) => s + c.platos, 0)

  /*
    LOS VÍVERES DEL PERÍODO, SUMADOS POR ARTÍCULO. Es lo que de verdad
    responde «¿en qué se fue la plata»: sirve tanto para el reporte (los
    cinco de mayor gasto) como para la tabla entera del informe en PDF.
    Nace de los renglones que ya trae cada comida servida: no hace falta
    ninguna consulta aparte.
  */
  const viveresAgregados = useMemo(() => {
    const mapa = new Map<number, { articulo: string; unidad: string; cantidad: number; valorUsd: number }>()
    for (const c of vivas) {
      for (const r of c.renglones) {
        const actual = mapa.get(r.articulo_id) ?? {
          articulo: r.articulo,
          unidad: r.unidad,
          cantidad: 0,
          valorUsd: 0,
        }
        actual.cantidad += Number(r.cantidad)
        actual.valorUsd += Number(r.valor_usd)
        mapa.set(r.articulo_id, actual)
      }
    }
    return [...mapa.values()].sort((a, b) => b.valorUsd - a.valorUsd)
  }, [vivas])

  const generarInforme = async () => {
    setPdf(
      await armarInformeAlimentacion({
        desde,
        hasta,
        comidas: (comidas.data ?? []).map((c) => ({
          numero: c.numero,
          fecha: fmtFecha(c.fecha),
          tipo: nombreDeTipo(c.tipo),
          platos: c.platos,
          valorUsd: c.valor_usd,
          costoPorPlatoUsd: c.costo_por_plato_usd,
          estado: c.estado,
        })),
        viveres: viveresAgregados,
        empresa: { razonSocial: empresa?.razon_social ?? '', rif: empresa?.rif ?? '' },
        emitidoPor: yo ?? '',
        momento: new Date(),
      }),
    )
  }

  return (
    <>
      <PageHeader
        title="Alimentación"
        description="Comidas servidas al personal: platos, víveres consumidos y costo por plato. Los víveres se descuentan del inventario al servir."
        actions={
          <>
            <Link to="/app/alimentacion/cocina">
              <Button variant="ghost" icon={<Smartphone />}>
                Vista de teléfono
              </Button>
            </Link>
            {puedeServir ? (
              <>
                {/* La lista de compra llega armada: todos los víveres del
                    catálogo con la cantidad de la última vez. Sale como un
                    pedido urgente al circuito de Compras. */}
                <Button variant="outline" icon={<ShoppingCart />} onClick={() => setPidiendoMercado(true)}>
                  Pedir el mercado
                </Button>
                <Button icon={<Plus />} onClick={() => setSirviendo(true)}>
                  Servir comida
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {/* --------------------------------------------------- las cifras */}
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">Costo por plato</p>
          <p className="tabular text-ink/90 mt-3 text-3xl font-light">
            {totalPlatos > 0 ? dolares(totalValor / totalPlatos) : '—'}
          </p>
          <p className="text-ink/45 mt-2 text-xs">
            {totalPlatos > 0
              ? `Promedio del período: ${dolares(totalValor)} entre ${totalPlatos} platos`
              : 'Sale solo cuando haya comidas servidas en el período'}
          </p>
        </Card>
        <Card>
          <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">Comidas del período</p>
          <p className="tabular text-ink/90 mt-3 text-3xl font-light">{vivas.length}</p>
          <p className="text-ink/45 mt-2 text-xs">{totalPlatos} platos servidos</p>
        </Card>
        <Card>
          <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">Gastado en víveres</p>
          <p className="tabular text-ink/90 mt-3 text-3xl font-light">{dolares(totalValor)}</p>
          <p className="text-ink/45 mt-2 text-xs">Al costo promedio con que salió cada víver</p>
        </Card>
      </div>

      {/* ------------------------------------------------ los víveres */}
      <Card className="mb-4">
        <CardHeader
          title="Víveres en existencia"
          subtitle="Lo que hay para cocinar, por almacén. Entran por una compra recibida, y se traen a la cocina con un traslado."
        />
        {viveres.isPending ? (
          <Cargando />
        ) : viveres.error ? (
          <ErrorDeCarga error={viveres.error} />
        ) : (viveres.data ?? []).length === 0 ? (
          <p className="text-ink/45 mt-4 text-sm">
            Sin víveres en los almacenes. Los víveres son artículos de la categoría «Víveres»: se crean
            en Inventario › Artículos e ingresan por compra.
          </p>
        ) : (
          <ul className="divide-hairline mt-3 divide-y">
            {(viveres.data ?? []).map((v) => (
              <li key={`${v.almacen_id}|${v.articulo_id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <div className="min-w-48 flex-1">
                  <p className="text-ink/85 text-sm">{v.articulo}</p>
                  <p className="text-ink/45 text-xs">{v.almacen}</p>
                </div>
                <span className="tabular text-ink/85 text-sm">
                  {Number(v.existencia).toLocaleString('es-VE', { maximumFractionDigits: 2 })} {v.unidad}
                </span>
                {Number(v.stock_minimo) > 0 && Number(v.existencia) <= Number(v.stock_minimo) ? (
                  <Chip tone="warning" icon={<TriangleAlert />}>
                    Bajo mínimo
                  </Chip>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ------------------------------------------------- las comidas */}
      <Card>
        <CardHeader
          title="Comidas servidas"
          subtitle="Una fila por comida, con sus víveres y su costo por plato."
          action={
            comidas.data && comidas.data.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" icon={<MessageCircle />} onClick={() => setReportando(true)}>
                  Reporte
                </Button>
                <Button variant="outline" size="sm" icon={<Printer />} onClick={() => void generarInforme()}>
                  Informe PDF
                </Button>
              </div>
            ) : null
          }
        />
        <div className="mt-3">
          <RangoDeFechas valor={rango} onCambio={setRango} />
        </div>

        {comidas.isPending ? <Cargando /> : null}
        {comidas.error ? <ErrorDeCarga error={comidas.error} /> : null}

        {comidas.data && comidas.data.length === 0 ? (
          <Vacio
            icono={<UtensilsCrossed />}
            titulo="Sin comidas en este período"
            descripcion="Las comidas se registran desde la vista de teléfono o con el botón Servir comida."
          />
        ) : null}

        {comidas.data && comidas.data.length > 0 ? (
          <ul className="divide-hairline mt-2 divide-y">
            {comidas.data.map((c) => (
              <li key={c.id} className={cn('py-3', c.estado === 'ANULADA' && 'opacity-50')}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <div className="min-w-56 flex-1">
                    <p className="text-ink/85 text-sm font-medium">
                      <span className="text-ink/45 font-mono text-xs">{c.numero}</span> ·{' '}
                      {nombreDeTipo(c.tipo)} del {fmtFecha(c.fecha)}
                      {c.origen === 'TELEFONO' ? <span className="text-ink/40"> · 📱</span> : null}
                    </p>
                    <p className="text-ink/50 text-xs">
                      {c.renglones.map((r) => `${r.articulo} ${Number(r.cantidad).toLocaleString('es-VE')} ${r.unidad}`).join(' · ')}
                      {c.nota ? ` · ${c.nota}` : ''}
                      {c.estado === 'ANULADA' ? ` · anulada: ${c.motivo_anulacion}` : ''}
                    </p>
                  </div>
                  <span className="tabular text-ink/60 text-sm">{c.platos} platos</span>
                  <span className="tabular text-ink/85 w-24 text-right text-sm font-medium">
                    {dolares(c.valor_usd)}
                  </span>
                  <span className="tabular text-ink/50 w-28 text-right text-xs">
                    {c.costo_por_plato_usd ? `${dolares(c.costo_por_plato_usd)} / plato` : ''}
                  </span>
                  {c.estado === 'SERVIDA' && puedeServir ? (
                    <Button size="sm" variant="ghost" className="text-danger" onClick={() => setAnulando(c)}>
                      Anular
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      {sirviendo ? <ServirComida onCerrar={() => setSirviendo(false)} /> : null}
      {pidiendoMercado ? <PedirMercado onCerrar={() => setPidiendoMercado(false)} /> : null}
      {anulando ? <AnularComida comida={anulando} hoy={hoy} onCerrar={() => setAnulando(null)} /> : null}
      {reportando ? (
        <ReporteDeAlimentacion
          desde={desde}
          hasta={hasta}
          razonSocial={empresa?.razon_social ?? ''}
          comidas={comidas.data ?? []}
          viveresAgregados={viveresAgregados}
          onCerrar={() => setReportando(false)}
        />
      ) : null}

      <Visor
        abierto={pdf !== null}
        onCerrar={() => setPdf(null)}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ''}
        titulo="Informe de alimentación"
      />
    </>
  )
}

/* ──────────────────────────────────────────────── reporte (WhatsApp) */

function ReporteDeAlimentacion({
  desde,
  hasta,
  razonSocial,
  comidas,
  viveresAgregados,
  onCerrar,
}: {
  desde: string
  hasta: string
  razonSocial: string
  comidas: Comida[]
  viveresAgregados: { articulo: string; unidad: string; cantidad: number; valorUsd: number }[]
  onCerrar: () => void
}) {
  const [copiado, setCopiado] = useState(false)

  const servidas = comidas.filter((c) => c.estado === 'SERVIDA')
  const anuladas = comidas.length - servidas.length
  const platos = servidas.reduce((s, c) => s + c.platos, 0)
  const valorUsd = servidas.reduce((s, c) => s + Number(c.valor_usd), 0)

  const porTipo = TIPOS_DE_COMIDA.map((t) => ({
    tipo: t.tipo,
    nombre: t.nombre,
    comidas: servidas.filter((c) => c.tipo === t.tipo).length,
    platos: servidas.filter((c) => c.tipo === t.tipo).reduce((s, c) => s + c.platos, 0),
  }))

  const texto = textoDelReporteAlimentacion({
    desde,
    hasta,
    razonSocial,
    comidasServidas: servidas.length,
    comidasAnuladas: anuladas,
    platos,
    valorUsd,
    porTipo,
    viveresDeMayorGasto: viveresAgregados.slice(0, 5),
  })

  const copiar = async () => {
    setCopiado(await copiarAlPortapapeles(texto))
  }

  const descargar = () => {
    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporte-alimentacion-${desde}-a-${hasta}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Reporte de alimentación"
      descripcion="El mensaje para compartir por WhatsApp. No se guarda en el sistema."
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
      <p className="text-ink/45 mb-1.5 text-xs">Así va a quedar</p>
      <pre className="bg-ink/4 text-ink/80 max-h-80 overflow-auto rounded-[6px] p-3 text-xs leading-relaxed whitespace-pre-wrap">
        {texto}
      </pre>
    </Modal>
  )
}

/* ─────────────────────────────────────────────────────── servir (PC) */

interface LineaDelModal {
  articulo_id: string
  cantidad: string
}

export function ServirComida({ onCerrar }: { onCerrar: () => void }) {
  const servir = useServirComida()
  const viveres = useViveres()
  const hoy = hoyEnCaracas()

  const [tipo, setTipo] = useState<TipoComida | ''>('')
  const [platos, setPlatos] = useState('')
  const [almacen, setAlmacen] = useState('')
  const [lineas, setLineas] = useState<LineaDelModal[]>([{ articulo_id: '', cantidad: '' }])
  const [dia, setDia] = useState(hoy)
  const [nota, setNota] = useState('')

  // Los almacenes que tienen víveres: no vale la pena ofrecer los demás.
  const almacenes = useMemo(() => {
    const m = new Map<number, string>()
    for (const v of viveres.data ?? []) m.set(v.almacen_id, v.almacen)
    return [...m.entries()].map(([id, nombre]) => ({ id, nombre }))
  }, [viveres.data])

  // Con un solo almacén con víveres, se elige solo.
  const almacenElegido = almacen || (almacenes.length === 1 ? String(almacenes[0].id) : '')
  const delAlmacen = (viveres.data ?? []).filter((v) => String(v.almacen_id) === almacenElegido)

  const pon = (i: number, campo: keyof LineaDelModal, valor: string) =>
    setLineas((xs) => xs.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)))

  const completas = lineas.filter((l) => l.articulo_id !== '' && Number(l.cantidad) > 0)
  const repetido = new Set(completas.map((l) => l.articulo_id)).size !== completas.length

  const valorEstimado = completas.reduce((s, l) => {
    const v = delAlmacen.find((x) => String(x.articulo_id) === l.articulo_id)
    return s + Number(l.cantidad) * Number(v?.costo_promedio_usd ?? 0)
  }, 0)

  const excedida = completas.find((l) => {
    const v = delAlmacen.find((x) => String(x.articulo_id) === l.articulo_id)
    return v !== undefined && Number(l.cantidad) > Number(v.existencia)
  })

  const valido =
    tipo !== '' &&
    Number(platos) > 0 &&
    almacenElegido !== '' &&
    completas.length > 0 &&
    !repetido &&
    excedida === undefined &&
    dia <= hoy

  const enviar = async () => {
    if (tipo === '') return
    await servir.mutateAsync({
      tipo,
      platos: Number(platos),
      almacen_id: Number(almacenElegido),
      renglones: completas.map((l) => ({ articulo_id: Number(l.articulo_id), cantidad: Number(l.cantidad) })),
      fecha: dia,
      nota: nota.trim() || null,
      origen: 'PC',
    })
    onCerrar()
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      ancho="lg"
      titulo="Servir una comida"
      descripcion="Los víveres se descuentan del inventario al costo promedio que tengan ahora."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button disabled={!valido || servir.isPending} onClick={() => void enviar()}>
            {servir.isPending ? 'Guardando…' : 'Servir'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-ink/55 text-2xs mb-2 font-mono tracking-[0.16em] uppercase">Tipo de comida</p>
          <div className="flex flex-wrap gap-2">
            {TIPOS_DE_COMIDA.map((t) => (
              <button
                key={t.tipo}
                type="button"
                onClick={() => setTipo(t.tipo)}
                className={cn(
                  'rounded-full border px-4 py-2 text-sm transition-colors',
                  tipo === t.tipo
                    ? 'border-royal-600 bg-royal-600/10 text-royal-700'
                    : 'border-hairline text-ink/70 hover:bg-ink/4',
                )}
              >
                {t.emoji} {t.nombre}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Platos"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={platos}
            onChange={(e) => setPlatos(e.target.value)}
          />
          <SelectBuscable
            label="Almacén"
            vacio="El que tiene los víveres"
            valor={almacenElegido}
            onCambio={setAlmacen}
            opciones={almacenes.map((a) => ({ valor: String(a.id), etiqueta: a.nombre }))}
          />
          <Input label="Fecha" type="date" value={dia} max={hoy} onChange={(e) => setDia(e.target.value)} />
        </div>

        <div>
          <p className="text-ink/55 text-2xs mb-2 font-mono tracking-[0.16em] uppercase">Víveres</p>
          <div className="space-y-2">
            {lineas.map((l, i) => {
              const v = delAlmacen.find((x) => String(x.articulo_id) === l.articulo_id)
              return (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_minmax(8rem,13rem)_auto]">
                  <SelectBuscable
                    label="Víver"
                    vacio="Busque el víver…"
                    valor={l.articulo_id}
                    onCambio={(val) => pon(i, 'articulo_id', val)}
                    opciones={delAlmacen.map((x) => ({
                      valor: String(x.articulo_id),
                      etiqueta: x.articulo,
                      detalle: `hay ${Number(x.existencia).toLocaleString('es-VE')} ${x.unidad}`,
                    }))}
                  />
                  <CampoCantidadDeViver
                    unidad={v?.unidad ?? ''}
                    valor={l.cantidad}
                    onCambiar={(val) => pon(i, 'cantidad', val)}
                    error={
                      v && Number(l.cantidad) > Number(v.existencia)
                        ? `Hay ${Number(v.existencia).toLocaleString('es-VE')}`
                        : undefined
                    }
                  />
                  <div className="flex items-end pb-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setLineas((xs) => (xs.length === 1 ? xs : xs.filter((_, j) => j !== i)))}
                    >
                      Quitar
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            icon={<Plus />}
            onClick={() => setLineas((xs) => [...xs, { articulo_id: '', cantidad: '' }])}
          >
            Otro víver
          </Button>
          {repetido ? <p className="text-danger mt-2 text-xs">Hay un víver repetido: junte sus cantidades.</p> : null}
        </div>

        <Textarea label="Nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />

        {valorEstimado > 0 && Number(platos) > 0 ? (
          <p className="text-ink/60 text-sm">
            Saldría en <span className="tabular text-ink/85">{dolares(valorEstimado)}</span>, unos{' '}
            <span className="tabular text-ink/85">{dolares(valorEstimado / Number(platos))}</span> por plato. La
            cifra final se calcula con el costo promedio del momento.
          </p>
        ) : null}

        {servir.error ? <ErrorDeCarga error={servir.error} /> : null}
      </div>
    </Modal>
  )
}

/* ──────────────────────────────────────────────────────────── anular */

function AnularComida({ comida, hoy, onCerrar }: { comida: Comida; hoy: string; onCerrar: () => void }) {
  const anular = useAnularComida()
  const [motivo, setMotivo] = useState('')
  const esDeHoy = comida.fecha === hoy
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Anular ${comida.numero}`}
      descripcion={`${nombreDeTipo(comida.tipo)} del ${fmtFecha(comida.fecha)}, ${comida.platos} platos. Los víveres vuelven al inventario. ${esDeHoy ? '' : 'No es de hoy: requiere control total.'}`}
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={motivo.trim().length < 3 || anular.isPending}
            onClick={() => anular.mutate({ id: comida.id, motivo: motivo.trim() }, { onSuccess: onCerrar })}
          >
            {anular.isPending ? 'Anulando…' : 'Anular'}
          </Button>
        </>
      }
    >
      <Textarea label="Motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      {anular.error ? <ErrorDeCarga error={anular.error} className="mt-3" /> : null}
    </Modal>
  )
}
