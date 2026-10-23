import { useMemo, useState } from 'react'
import { BarChart3, Plus, Receipt, Search, X } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { RangoDeFechas } from '@/components/RangoDeFechas'
import { SIN_RANGO } from '@/components/rango'
import type { Rango } from '@/components/rango'
import { ElegirArchivosDeCarga, FotosDeCarga } from '@/components/FotosDeCarga'
import { useMisPermisos } from '@/lib/api/usuarios'
import { hoyEnCaracas, useMonedas } from '@/lib/api/tasas'
import { subirFotosDeCarga } from '@/lib/api/fotosDeCarga'
import { porQueNoSubio } from '@/lib/castellano'
import {
  opcionesDeCategoriaDeGasto,
  useAnularGasto,
  useCategoriasDeGasto,
  useGastos,
  useInformeGastosPorCategoria,
  useRegistrarGasto,
  type GastoFactura,
} from '@/lib/api/gastos'
import { dinero, fecha } from '@/lib/formato'

/*
  GASTOS: EL HISTORIAL DE FACTURAS, CON SU CATEGORÍA Y SU FOTO.

  Christopher, 22/10/2026: cargar la factura física (escaneo o foto),
  transcribirla con una observación de para qué se usó lo comprado, y un
  informe de gasto por categoría. Es bitácora, no contabilidad: no mueve
  ninguna cuenta de Tesorería.

  LA FOTO SE ADJUNTA EN EL MISMO FORMULARIO.

  Se probó al revés —registrar primero, adjuntar después desde la tarjeta,
  como el historial de taller—, y las primeras seis facturas reales mostraron
  que esa foto siempre llegaba de inmediato: nunca se dejó para después. Así
  que el selector vive aquí, en el mismo modal, con la misma infraestructura
  de fotos que ya usan Salidas, Despachos, Combustible, Avería y
  Mantenimiento. La tarjeta del historial conserva su propio `<FotosDeCarga>`
  por si hace falta añadir o corregir una foto más tarde.

  PROVEEDOR Y GUARDAR-Y-OTRA, PARA CARGAR VARIAS SEGUIDAS.

  Las mismas seis facturas eran del mismo proveedor, tecleado entero cada vez.
  El campo ahora sugiere los proveedores ya usados (una lista nativa del
  navegador, `<datalist>`, que no impide escribir uno nuevo) y rellena su RIF
  si coincide. Y «Registrar y cargar otra» guarda sin cerrar el modal,
  dejando puestos proveedor, RIF, categoría, moneda y fecha — lo que casi
  siempre se repite cuando se sube un lote de la misma visita.

  UNA FACTURA NO SE CORRIGE, SE ANULA.

  Es dinero ya gastado. Corregirla a mano borraría el rastro de qué se
  tecleó primero; anularla con motivo lo deja todo a la vista, tachado.
*/

const HOY = hoyEnCaracas()

function filaVacia(): {
  fecha: string
  proveedor: string
  categoria: string
  moneda: string
  monto: string
  observacion: string
  documento_proveedor: string
  numero_factura: string
} {
  return {
    fecha: HOY,
    proveedor: '',
    categoria: '',
    moneda: 'USD',
    monto: '',
    observacion: '',
    documento_proveedor: '',
    numero_factura: '',
  }
}

export function Gastos() {
  const { puede } = useMisPermisos()
  const puedeEscribir = puede('GASTOS', 'ESCRITURA')
  const puedeAnular = puede('GASTOS', 'TOTAL')

  const { data, isPending, error } = useGastos()
  const { data: categorias } = useCategoriasDeGasto()
  const { data: monedas } = useMonedas()

  const [buscado, setBuscado] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('')
  const [rango, setRango] = useState<Rango>(SIN_RANGO)
  /*
    LAS ANULADAS NO ESTORBAN EL HISTORIAL POR DEFECTO.

    Christopher, 23/10/2026: una factura anulada —típicamente, un error de
    tecleo que se corrigió registrando la correcta aparte— no es trabajo
    pendiente ni gasto real, y verla mezclada con las vigentes entorpece
    revisar lo que de verdad se gastó. No se oculta del todo —sigue siendo el
    rastro de qué se tecleó primero—, solo deja de salir salvo que se pida.
  */
  const [verAnuladas, setVerAnuladas] = useState(false)

  const [registrando, setRegistrando] = useState(false)
  const [form, setForm] = useState(filaVacia())
  const [archivos, setArchivos] = useState<File[]>([])
  const [avisoFoto, setAvisoFoto] = useState<string | null>(null)
  const registrar = useRegistrarGasto()

  /** Los proveedores ya usados, más reciente primero, con su RIF. Alimenta el `<datalist>`. */
  const proveedoresConocidos = useMemo(() => {
    const vistos = new Map<string, string>()
    for (const g of [...(data ?? [])].sort((a, b) => b.registrado_en.localeCompare(a.registrado_en))) {
      if (!vistos.has(g.proveedor)) vistos.set(g.proveedor, g.documento_proveedor ?? '')
    }
    return Array.from(vistos, ([proveedor, documento_proveedor]) => ({ proveedor, documento_proveedor }))
  }, [data])

  /**
   * Una factura vigente con el mismo proveedor y el mismo número de factura.
   *
   * No bloquea: puede ser legítimo (dos renglones de una misma compra grande,
   * o simple coincidencia). Solo avisa, para que un tecleo apurado no la
   * duplique sin darse cuenta.
   */
  const posibleDuplicado = useMemo(() => {
    const numero = form.numero_factura.trim()
    const proveedor = form.proveedor.trim().toUpperCase()
    if (!numero || !proveedor) return null
    return (
      (data ?? []).find(
        (g) => !g.anulada_en && g.proveedor === proveedor && (g.numero_factura ?? '').trim() === numero,
      ) ?? null
    )
  }, [data, form.numero_factura, form.proveedor])

  const [anulando, setAnulando] = useState<GastoFactura | null>(null)
  const [motivo, setMotivo] = useState('')
  const anular = useAnularGasto()

  const [pidiendoInforme, setPidiendoInforme] = useState(false)
  const [rangoInforme, setRangoInforme] = useState<Rango>(SIN_RANGO)
  const informe = useInformeGastosPorCategoria(rangoInforme.desde || null, rangoInforme.hasta || null)

  const filtrados = useMemo(() => {
    const texto = buscado.trim().toLowerCase()
    return (data ?? []).filter((g) => {
      if (!verAnuladas && g.anulada_en) return false
      if (categoriaFiltro && g.categoria !== categoriaFiltro) return false
      if (rango.desde && g.fecha < rango.desde) return false
      if (rango.hasta && g.fecha > rango.hasta) return false
      if (!texto) return true
      return (
        g.proveedor.toLowerCase().includes(texto) ||
        (g.numero ?? '').toLowerCase().includes(texto) ||
        (g.numero_factura ?? '').toLowerCase().includes(texto) ||
        g.observacion.toLowerCase().includes(texto)
      )
    })
  }, [data, buscado, categoriaFiltro, rango, verAnuladas])

  const anuladasOcultas = (data ?? []).filter((g) => g.anulada_en).length

  const abrirRegistro = () => {
    setForm(filaVacia())
    setArchivos([])
    setRegistrando(true)
  }

  /** Registra la factura y, si hay fotos elegidas, las sube de una vez. Devuelve el número. */
  const registrarUno = async () => {
    const numero = await registrar.mutateAsync({
      fecha: form.fecha,
      proveedor: form.proveedor.trim(),
      categoria: form.categoria,
      moneda: form.moneda,
      monto: Number(form.monto),
      observacion: form.observacion.trim(),
      documento_proveedor: form.documento_proveedor.trim() || null,
      numero_factura: form.numero_factura.trim() || null,
    })
    if (archivos.length > 0) {
      try {
        await subirFotosDeCarga('GASTO', [numero], archivos)
      } catch (e) {
        setAvisoFoto(
          `La factura ${numero} quedó registrada, pero la foto no subió${porQueNoSubio(e)} Añádala desde su tarjeta, más abajo en el historial.`,
        )
      }
    }
    return numero
  }

  const guardar = async () => {
    await registrarUno()
    setRegistrando(false)
  }

  /** Guarda sin cerrar el modal, para cargar varias facturas seguidas del mismo proveedor. */
  const guardarYOtra = async () => {
    await registrarUno()
    setForm((f) => ({
      ...filaVacia(),
      fecha: f.fecha,
      proveedor: f.proveedor,
      documento_proveedor: f.documento_proveedor,
      categoria: f.categoria,
      moneda: f.moneda,
    }))
    setArchivos([])
  }

  const formValido =
    form.proveedor.trim().length >= 2 &&
    form.categoria !== '' &&
    form.moneda !== '' &&
    Number(form.monto) > 0 &&
    form.observacion.trim().length >= 4

  return (
    <>
      <PageHeader
        title="Gastos"
        description="Facturas físicas transcritas, con su categoría y su foto: qué se compró, cuánto costó y para qué se usó."
        actions={
          <>
            <Button variant="outline" icon={<BarChart3 />} onClick={() => setPidiendoInforme(true)}>
              Informe por categoría
            </Button>
            {puedeEscribir ? (
              <Button icon={<Plus />} onClick={abrirRegistro}>
                Registrar factura
              </Button>
            ) : null}
          </>
        }
      />

      {avisoFoto ? (
        <div className="border-warning/30 bg-warning-soft mb-4 flex items-start gap-2.5 rounded-[6px] border p-3.5">
          <p className="text-ink/80 grow text-sm">{avisoFoto}</p>
          <button
            type="button"
            aria-label="Cerrar el aviso"
            className="text-ink/45 hover:text-ink/80 shrink-0"
            onClick={() => setAvisoFoto(null)}
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <Input
            label="Buscar"
            icon={<Search />}
            placeholder="Proveedor, número o para qué se usó"
            value={buscado}
            onChange={(e) => setBuscado(e.target.value)}
          />
          <Select
            label="Categoría"
            vacio="Todas"
            value={categoriaFiltro}
            onChange={(e) => setCategoriaFiltro(e.target.value)}
            opciones={opcionesDeCategoriaDeGasto(categorias)}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <RangoDeFechas valor={rango} onCambio={setRango} className="grow" />
          <label className="text-ink/60 flex shrink-0 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-royal-600 size-4"
              checked={verAnuladas}
              onChange={(e) => setVerAnuladas(e.target.checked)}
            />
            Mostrar anuladas
            {!verAnuladas && anuladasOcultas > 0 ? (
              <span className="text-ink/35">({anuladasOcultas})</span>
            ) : null}
          </label>
        </div>
      </Card>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {!isPending && !error && filtrados.length === 0 ? (
        <Card>
          <Vacio
            icono={<Receipt />}
            titulo={(data ?? []).length === 0 ? 'Sin facturas registradas' : 'Sin resultados'}
            descripcion={
              (data ?? []).length === 0
                ? 'Lo que se registre aquí, con su categoría y su foto, aparece en este historial.'
                : undefined
            }
          />
        </Card>
      ) : null}

      {filtrados.length > 0 ? (
        <Card flush>
          <div className="border-hairline flex items-baseline justify-between gap-2 border-b px-5 py-3">
            <p className="text-ink/60 text-sm">
              {filtrados.length} factura{filtrados.length === 1 ? '' : 's'}
            </p>
          </div>

          <ul className="divide-hairline divide-y">
            {filtrados.map((g) => (
              <li key={g.id} className="px-5 py-4">
                <div className="flex flex-wrap items-baseline gap-2">
                  {g.numero ? <span className="text-ink/40 font-mono text-xs">{g.numero}</span> : null}
                  <span className="text-ink/70 text-sm">{fecha(g.fecha)}</span>
                  <Chip tone="neutral">{g.categoria_nombre}</Chip>
                  {g.anulada_en ? <Chip tone="danger">Anulada</Chip> : null}
                  <span className="tabular text-ink/85 ml-auto text-sm font-semibold">
                    {dinero(g.moneda, g.monto)}
                  </span>
                </div>

                <p
                  className={
                    g.anulada_en ? 'text-ink/45 mt-1 text-sm line-through' : 'text-ink/85 mt-1 text-sm'
                  }
                >
                  {g.proveedor}
                  {g.numero_factura ? ` · Fact. ${g.numero_factura}` : ''}
                  {g.documento_proveedor ? ` · ${g.documento_proveedor}` : ''}
                </p>

                <p className="text-ink/60 mt-1 text-sm leading-relaxed">{g.observacion}</p>

                <p className="text-ink/40 mt-1 text-xs">
                  Registró {g.registrado_por_nombre ?? '—'}
                  {g.anulada_en
                    ? ` · anuló ${g.anulada_por_nombre ?? '—'}: «${g.motivo_anulacion}»`
                    : ''}
                </p>

                {g.numero ? (
                  <FotosDeCarga
                    origen="GASTO"
                    referencia={g.numero}
                    puedeAnadir={puedeEscribir && !g.anulada_en}
                    etiqueta="Fotos de la factura"
                    descripcionAdjunto="de la factura. No salen en ningún papel impreso."
                  />
                ) : null}

                {puedeAnular && !g.anulada_en ? (
                  <button
                    type="button"
                    className="text-ink/45 hover:text-danger mt-2 text-xs underline"
                    onClick={() => {
                      setMotivo('')
                      setAnulando(g)
                    }}
                  >
                    Anular
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {registrando ? (
        <Modal
          abierto
          onCerrar={() => setRegistrando(false)}
          titulo="Registrar factura"
          descripcion="Con su foto de una vez: no hace falta bajar después a buscarla en la tarjeta."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setRegistrando(false)}>
                Cancelar
              </Button>
              <Button
                variant="outline"
                disabled={!formValido || registrar.isPending}
                onClick={() => void guardarYOtra()}
              >
                {registrar.isPending ? 'Guardando…' : 'Registrar y cargar otra'}
              </Button>
              <Button disabled={!formValido || registrar.isPending} onClick={() => void guardar()}>
                {registrar.isPending ? 'Guardando…' : 'Registrar'}
              </Button>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Fecha"
              type="date"
              value={form.fecha}
              max={HOY}
              onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
            />
            <div>
              <Input
                label="Proveedor"
                value={form.proveedor}
                list="gastos-proveedores-conocidos"
                onChange={(e) => {
                  const valor = e.target.value
                  const conocido = proveedoresConocidos.find((p) => p.proveedor === valor.trim().toUpperCase())
                  setForm((f) => ({
                    ...f,
                    proveedor: valor,
                    // Solo rellena el RIF si venía vacío: no pisa lo que ya se tecleó a mano.
                    documento_proveedor:
                      conocido && !f.documento_proveedor ? conocido.documento_proveedor : f.documento_proveedor,
                  }))
                }}
                autoFocus
              />
              {/* Lista nativa del navegador: sugiere, pero no impide escribir un proveedor nuevo. */}
              <datalist id="gastos-proveedores-conocidos">
                {proveedoresConocidos.map((p) => (
                  <option key={p.proveedor} value={p.proveedor} />
                ))}
              </datalist>
            </div>
            <Select
              label="Categoría"
              vacio="Seleccione una categoría"
              value={form.categoria}
              onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
              opciones={opcionesDeCategoriaDeGasto(categorias)}
            />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input
                label="Monto"
                type="number"
                value={form.monto}
                onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
              />
              <Select
                label="Moneda"
                value={form.moneda}
                onChange={(e) => setForm((f) => ({ ...f, moneda: e.target.value }))}
                opciones={(monedas ?? []).map((m) => ({ valor: m.codigo, etiqueta: m.codigo }))}
              />
            </div>
            <div>
              <Input
                label="N.º de factura (si tiene)"
                value={form.numero_factura}
                onChange={(e) => setForm((f) => ({ ...f, numero_factura: e.target.value }))}
              />
              {posibleDuplicado ? (
                <p className="text-warning mt-1 text-xs">
                  Ya hay una factura {posibleDuplicado.numero} de este proveedor con ese número, por{' '}
                  {dinero(posibleDuplicado.moneda, posibleDuplicado.monto)}. Revise que no sea la misma.
                </p>
              ) : null}
            </div>
            <Input
              label="RIF o cédula del proveedor (si tiene)"
              placeholder="J-12345678-9"
              value={form.documento_proveedor}
              onChange={(e) => setForm((f) => ({ ...f, documento_proveedor: e.target.value }))}
            />
          </div>

          <div className="mt-3">
            <Textarea
              label="Para qué se usó lo comprado"
              rows={3}
              value={form.observacion}
              onChange={(e) => setForm((f) => ({ ...f, observacion: e.target.value }))}
            />
          </div>

          <div className="mt-3">
            <ElegirArchivosDeCarga
              archivos={archivos}
              onCambiar={setArchivos}
              descripcion="de la factura. No salen en ningún papel impreso."
            />
          </div>

          {registrar.error ? <ErrorDeCarga error={registrar.error} className="mt-3" /> : null}
        </Modal>
      ) : null}

      {anulando ? (
        <Modal
          abierto
          ancho="sm"
          onCerrar={() => setAnulando(null)}
          titulo="Anular la factura"
          descripcion="Queda a la vista, tachada, con el motivo. No se borra ni se corrige."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setAnulando(null)}>
                Volver
              </Button>
              <Button
                disabled={motivo.trim().length < 4 || anular.isPending}
                onClick={() =>
                  anular.mutate(
                    { id: anulando.id, motivo },
                    { onSuccess: () => setAnulando(null) },
                  )
                }
              >
                {anular.isPending ? 'Anulando…' : 'Anular'}
              </Button>
            </>
          }
        >
          <Textarea
            label="Motivo"
            rows={2}
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          {anular.error ? <ErrorDeCarga error={anular.error} className="mt-3" /> : null}
        </Modal>
      ) : null}

      {pidiendoInforme ? (
        <Modal
          abierto
          onCerrar={() => setPidiendoInforme(false)}
          titulo="Informe por categoría"
          descripcion="Nunca se suma entre monedas: cada categoría sale por separado en bolívares y en dólares."
          acciones={
            <Button variant="ghost" onClick={() => setPidiendoInforme(false)}>
              Cerrar
            </Button>
          }
        >
          <RangoDeFechas valor={rangoInforme} onCambio={setRangoInforme} />

          <div className="mt-4">
            {informe.isPending ? <Cargando /> : null}
            {informe.error ? <ErrorDeCarga error={informe.error} /> : null}

            {informe.data && informe.data.length === 0 ? (
              <p className="text-ink/45 text-center text-sm">Sin gastos en ese rango.</p>
            ) : null}

            {informe.data && informe.data.length > 0 ? (
              <ul className="divide-hairline divide-y">
                {informe.data.map((f) => (
                  <li key={`${f.categoria}-${f.moneda}`} className="flex items-center gap-2 py-2">
                    <span className="text-ink/80 text-sm">{f.categoria_nombre}</span>
                    <span className="text-ink/40 text-xs">
                      {f.cantidad} factura{f.cantidad === 1 ? '' : 's'}
                    </span>
                    <span className="tabular text-ink/85 ml-auto text-sm font-semibold">
                      {dinero(f.moneda, f.monto)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </>
  )
}
