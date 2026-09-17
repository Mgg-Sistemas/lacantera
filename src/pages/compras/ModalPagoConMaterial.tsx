import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { ChipTasa } from '@/components/ChipTasa'
import { useArticulos } from '@/lib/api/catalogo'
import { useExistencias } from '@/lib/api/inventario'
import { usePrecios } from '@/lib/api/ventas'
import { useTasaVigente } from '@/lib/api/tasas'
import { useMiFirma } from '@/lib/api/firmas'
import {
  CONDICION_DEL_MATERIAL,
  EXCEDENTE_COMO,
  pendienteDeOrden,
  useIndicarPagoConMaterial,
  useRegistrarPagoConMaterial,
  useUsarSaldoAFavor,
  type CondicionDelMaterial,
  type ExcedenteComo,
  type SaldoAFavor,
} from '@/lib/api/intercambio'
import type { InstruccionPago, Orden } from '@/lib/api/compras'
import { listaEnMoneda, precioDeLista } from '@/pages/ventas/filas'
import { dinero } from '@/lib/formato'
import { cn } from '@/lib/cn'

/** Cantidades con los decimales que tengan, hasta cuatro: 18 y no 18,0000. */
const cant = (v: string | number) =>
  Number(v).toLocaleString('es-VE', { maximumFractionDigits: 4 })

/*
  PAGAR UNA COMPRA CON MATERIAL

  Christopher, 17/09/2026: «se puede comprar un item, y pagar con ej. arena
  lavada». Esta ventana es el primer paso: dice qué material, de qué patio,
  cuánto y a qué precio. No mueve nada todavía. La orden de salida para almacén
  nace al REGISTRAR el pago, no aquí: «solo creará la solicitud para almacén
  cuando sea pagada».

  EL PRECIO, COMO EN VENTAS. De lista o con descuento si el material tiene
  precio en esa unidad; acordado si no lo tiene. La cifra que se ve es una
  estimación con la tasa de hoy: la que vale la calcula la base al guardar, con
  la misma regla que una nota de entrega.

  SI VALE MÁS DE LO QUE SE DEBE, se pregunta qué pasa con lo que sobra antes de
  guardar, no después: la base no lo deja pasar sin saberlo.
*/
export function ModalPagoConMaterial({ orden, onCerrar }: { orden: Orden; onCerrar: () => void }) {
  const indicar = useIndicarPagoConMaterial()
  const { data: articulos } = useArticulos()
  const { data: existencias } = useExistencias(undefined, true)
  const { data: precios } = usePrecios()
  const { data: tasaHoy } = useTasaVigente()

  const [articuloId, setArticuloId] = useState('')
  const [almacenId, setAlmacenId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [unidad, setUnidad] = useState('')
  const [condicion, setCondicion] = useState<CondicionDelMaterial | ''>('')
  const [descuentoEn, setDescuentoEn] = useState<'PORCENTAJE' | 'MONTO'>('PORCENTAJE')
  const [descuento, setDescuento] = useState('')
  const [acordado, setAcordado] = useState('')
  const [excedenteComo, setExcedenteComo] = useState<ExcedenteComo | ''>('')
  const [nota, setNota] = useState('')

  /*
    Solo lo que hay y es de la empresa: con lo de otro dueño no se paga una
    compra, y «En camino» no es un patio del que sacar nada.
  */
  const conMaterial = useMemo(
    () =>
      (existencias ?? []).filter(
        (e) => e.almacen_tipo !== 'TRANSITO' && Number(e.existencia_propia) > 0,
      ),
    [existencias],
  )

  // Un renglón por material, con lo que la empresa tiene de él sumando los patios.
  const opcionesArticulo = useMemo(() => {
    const vistos = new Map<number, { codigo: string; nombre: string; unidad: string; total: number }>()
    for (const e of conMaterial) {
      const previo = vistos.get(e.articulo_id)
      vistos.set(e.articulo_id, {
        codigo: e.articulo_codigo,
        nombre: e.articulo,
        unidad: e.unidad,
        total: (previo?.total ?? 0) + Number(e.existencia_propia),
      })
    }
    return [...vistos.entries()].map(([id, a]) => ({
      valor: String(id),
      codigo: a.codigo,
      nombre: a.nombre,
      detalle: `${cant(a.total)} ${a.unidad} de la empresa`,
    }))
  }, [conMaterial])

  const articulo = (articulos ?? []).find((a) => String(a.id) === articuloId)
  const patios = conMaterial.filter((e) => String(e.articulo_id) === articuloId)
  const patio = patios.find((e) => String(e.almacen_id) === almacenId)

  // En qué unidades se puede entregar: la del patio, y la otra entre m³ y t si hay densidad.
  const unidades = !articulo
    ? []
    : articulo.densidad_ton_m3 && (articulo.unidad === 'M3' || articulo.unidad === 'TON')
      ? [articulo.unidad, articulo.unidad === 'M3' ? 'TON' : 'M3']
      : [articulo.unidad]
  const unidadElegida = unidad || articulo?.unidad || ''

  const filaLista = articuloId ? precioDeLista(precios ?? [], articuloId, unidadElegida) : undefined
  const lista = listaEnMoneda(filaLista, orden.moneda, Number(tasaHoy?.tasa) || 0)
  const hayLista = filaLista !== undefined

  const precio = (() => {
    if (condicion === 'LISTA') return lista
    if (condicion === 'DESCUENTO') {
      const d = Number(descuento) || 0
      if (lista === null || d <= 0) return lista
      return descuentoEn === 'PORCENTAJE' ? (lista * (100 - d)) / 100 : lista - d
    }
    if (condicion === 'ACORDADO') return Number(acordado) || null
    return null
  })()

  const n = Number(cantidad) || 0
  const valor = precio !== null && n > 0 ? Math.round(n * precio * 100) / 100 : null
  const pendiente = Math.round(pendienteDeOrden(orden) * 100) / 100
  const aplicado = valor === null ? null : Math.min(valor, pendiente)
  const excedente = valor === null || aplicado === null ? 0 : Math.round((valor - aplicado) * 100) / 100

  const densidad = Number(articulo?.densidad_ton_m3) || 0
  const delPatio =
    !articulo || n <= 0
      ? null
      : unidadElegida === articulo.unidad
        ? n
        : unidadElegida === 'TON'
          ? n / densidad
          : n * densidad
  const noAlcanza = patio && delPatio !== null && delPatio > Number(patio.existencia_propia)

  const listo =
    articuloId &&
    almacenId &&
    n > 0 &&
    condicion &&
    (condicion !== 'DESCUENTO' || Number(descuento) > 0) &&
    (condicion !== 'ACORDADO' || Number(acordado) > 0) &&
    !noAlcanza &&
    pendiente > 0.01 &&
    (excedente <= 0 || excedenteComo)

  const elegirArticulo = (id: string) => {
    setArticuloId(id)
    const a = (articulos ?? []).find((x) => String(x.id) === id)
    const suyos = conMaterial.filter((e) => String(e.articulo_id) === id)
    setAlmacenId(suyos.length === 1 ? String(suyos[0].almacen_id) : '')
    setUnidad(a?.unidad ?? '')
    const tieneLista = a ? precioDeLista(precios ?? [], id, a.unidad) !== undefined : false
    setCondicion(tieneLista ? 'LISTA' : 'ACORDADO')
    setDescuento('')
    setAcordado('')
  }

  const elegirUnidad = (u: string) => {
    setUnidad(u)
    const tieneLista = precioDeLista(precios ?? [], articuloId, u) !== undefined
    setCondicion(tieneLista ? 'LISTA' : 'ACORDADO')
  }

  const guardar = async () => {
    if (!condicion) return
    await indicar.mutateAsync({
      orden_id: orden.id,
      articulo_id: Number(articuloId),
      almacen_id: Number(almacenId),
      cantidad: n,
      unidad: unidadElegida,
      condicion,
      descuento_pct: condicion === 'DESCUENTO' && descuentoEn === 'PORCENTAJE' ? Number(descuento) : null,
      descuento_unitario: condicion === 'DESCUENTO' && descuentoEn === 'MONTO' ? Number(descuento) : null,
      precio_acordado: condicion === 'ACORDADO' ? Number(acordado) : null,
      excedente_como: excedente > 0 && excedenteComo ? excedenteComo : null,
      nota,
    })
    onCerrar()
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Pagar con material"
      descripcion="Compra por intercambio: se paga con material de la empresa. Todavía no sale nada: la orden de salida para almacén nace al registrar el pago."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={!listo || indicar.isPending}>
            {indicar.isPending ? 'Guardando…' : 'Indicar el pago con material'}
          </Button>
        </>
      }
    >
      <ChipTasa className="mb-4" />

      <p className="text-ink/60 mb-4 text-sm">
        A la orden {orden.numero} le faltan{' '}
        <strong className="text-ink/85 tabular">{dinero(orden.moneda, pendiente)}</strong> por
        instruir.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectBuscable
          className="sm:col-span-2"
          label="Qué material se entrega"
          vacio="Elige el material"
          valor={articuloId}
          onCambio={elegirArticulo}
          opciones={opcionesArticulo}
          hint="Solo lo que hay en inventario y es de la empresa."
        />

        <Select
          label="De qué patio sale"
          vacio={articuloId ? 'Elige el patio' : 'Primero el material'}
          value={almacenId}
          onChange={(e) => setAlmacenId(e.target.value)}
          disabled={!articuloId}
          opciones={patios.map((e) => ({
            valor: String(e.almacen_id),
            etiqueta: `${e.almacen} · ${cant(e.existencia_propia)} ${e.unidad}`,
          }))}
        />

        <div className="flex gap-2">
          <Input
            className="flex-1"
            label="Cuánto"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            error={noAlcanza ? `En ese patio hay ${cant(patio!.existencia_propia)} ${patio!.unidad}.` : undefined}
            hint={
              delPatio !== null && articulo && unidadElegida !== articulo.unidad
                ? `Del patio salen unos ${cant(Math.round(delPatio * 10000) / 10000)} ${articulo.unidad}, estimado con la densidad.`
                : undefined
            }
          />
          {unidades.length > 1 ? (
            <Select
              className="w-28"
              label="Unidad"
              value={unidadElegida}
              onChange={(e) => elegirUnidad(e.target.value)}
              opciones={unidades.map((u) => ({ valor: u, etiqueta: u }))}
            />
          ) : null}
        </div>

        <Select
          label="A qué precio se toma"
          value={condicion}
          disabled={!articuloId}
          onChange={(e) => setCondicion(e.target.value as CondicionDelMaterial)}
          opciones={(hayLista ? (['LISTA', 'DESCUENTO'] as const) : (['ACORDADO'] as const)).map((c) => ({
            valor: c,
            etiqueta: CONDICION_DEL_MATERIAL[c],
          }))}
          hint={
            !articuloId
              ? 'Como en ventas: de lista, con descuento, o acordado si no tiene precio.'
              : hayLista
                ? lista !== null
                  ? `Lista: ${dinero(orden.moneda, lista)} por ${unidadElegida}. Por debajo del mínimo hace falta la casilla de vender bajo el mínimo.`
                  : 'Tiene precio de lista en otra moneda: la cifra la pone la base al guardar.'
                : `No tiene precio de lista por ${unidadElegida}: se escribe el acordado.`
          }
        />

        {condicion === 'DESCUENTO' ? (
          <div className="flex gap-2">
            <Input
              className="flex-1"
              label="Descuento"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={descuento}
              onChange={(e) => setDescuento(e.target.value)}
            />
            <Select
              className="w-36"
              label="En"
              value={descuentoEn}
              onChange={(e) => setDescuentoEn(e.target.value as 'PORCENTAJE' | 'MONTO')}
              opciones={[
                { valor: 'PORCENTAJE', etiqueta: '%' },
                { valor: 'MONTO', etiqueta: `${orden.moneda} por ${unidadElegida || 'unidad'}` },
              ]}
            />
          </div>
        ) : null}

        {condicion === 'ACORDADO' ? (
          <Input
            label={`Precio acordado por ${unidadElegida || 'unidad'} (${orden.moneda})`}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={acordado}
            onChange={(e) => setAcordado(e.target.value)}
          />
        ) : null}
      </div>

      {valor !== null ? (
        <div className="border-hairline mt-5 rounded-[6px] border p-3 text-sm">
          <p className="text-ink/80">
            El material vale{' '}
            <strong className="tabular">{dinero(orden.moneda, valor)}</strong>
            {precio !== null ? (
              <span className="text-ink/50">
                {' '}
                ({cant(n)} {unidadElegida} a {dinero(orden.moneda, precio)})
              </span>
            ) : null}
            .
          </p>
          <p className="text-ink/60 mt-1">
            A la orden se le aplican{' '}
            <strong className="tabular">{dinero(orden.moneda, aplicado ?? 0)}</strong>
            {excedente > 0 ? (
              <>
                {' '}
                y sobran <strong className="tabular text-warning">{dinero(orden.moneda, excedente)}</strong>.
              </>
            ) : (
              '.'
            )}
          </p>
          <p className="text-ink/40 mt-1 text-xs">
            Estimado con la tasa de hoy. La cifra que vale la calcula el sistema al guardar.
          </p>

          {excedente > 0 ? (
            <fieldset className="mt-3">
              <legend className="text-ink/80 mb-2 text-sm font-medium">
                ¿Qué pasa con lo que sobra?
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(EXCEDENTE_COMO) as ExcedenteComo[]).map((c) => (
                  <label
                    key={c}
                    className={cn(
                      'border-hairline flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm',
                      excedenteComo === c && 'border-royal-600 bg-royal-600/8',
                    )}
                  >
                    <input
                      type="radio"
                      name="excedente-como"
                      className="accent-royal-600 mt-0.5 size-4 shrink-0"
                      checked={excedenteComo === c}
                      onChange={() => setExcedenteComo(c)}
                    />
                    <span>
                      <span className="text-ink/85 block font-medium">{EXCEDENTE_COMO[c].etiqueta}</span>
                      <span className="text-ink/55 mt-0.5 block text-xs">{EXCEDENTE_COMO[c].explica}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-ink/45 mt-2 text-xs">
                Queda a favor de la empresa cuando almacén entregue el material, no antes.
              </p>
            </fieldset>
          ) : null}
        </div>
      ) : null}

      <Textarea
        label="Nota"
        className="mt-4"
        rows={2}
        placeholder="Opcional: lo acordado con el proveedor."
        value={nota}
        onChange={(e) => setNota(e.target.value)}
      />

      {pendiente <= 0.01 ? (
        <p className="text-warning mt-3 text-sm">
          Esta orden ya tiene instruido todo lo que se debe. Para pagarla con material, devuelve antes
          una instrucción.
        </p>
      ) : null}
      {indicar.error ? <ErrorDeCarga error={indicar.error} className="mt-4" /> : null}
    </Modal>
  )
}

/*
  REGISTRAR EL PAGO CON MATERIAL

  Es el «pagar» de este método. La compra queda pagada en lo que vale el
  material, y nace la orden de salida para almacén, que recibe el aviso. Se pide
  quién recibe el material por el proveedor porque su nombre va en la nota de
  salida, y la firma de quien lo registra, que es quien solicita la salida.
*/
export function ModalRegistrarPagoConMaterial({
  instruccion,
  onCerrar,
}: {
  instruccion: InstruccionPago
  onCerrar: () => void
}) {
  const registrar = useRegistrarPagoConMaterial()
  const { data: miFirma } = useMiFirma()
  const [recibe, setRecibe] = useState('')
  const [nota, setNota] = useState('')
  const [conMiFirma, setConMiFirma] = useState(false)
  const m = instruccion.material

  const guardar = async () => {
    await registrar.mutateAsync({
      instruccion_id: instruccion.id,
      recibe: recibe.trim(),
      nota,
      con_firma: miFirma?.usar === true && conMiFirma,
    })
    onCerrar()
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Registrar el pago con material"
      descripcion="La compra queda pagada en lo que vale el material, y almacén recibe la orden de salida para aprobarla y entregarla."
      ancho="sm"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={recibe.trim().length < 3 || registrar.isPending}>
            {registrar.isPending ? 'Registrando…' : 'Registrar y mandar a almacén'}
          </Button>
        </>
      }
    >
      {m ? (
        <p className="text-ink/75 mb-4 text-sm">
          {cant(m.cantidad)} {m.unidad} de <strong>{m.articulo?.nombre}</strong>, de{' '}
          {m.almacen?.nombre}, por{' '}
          <strong className="tabular">{dinero(instruccion.moneda, instruccion.monto)}</strong>
          {Number(m.excedente) > 0
            ? ` (vale ${dinero(m.moneda, m.valor)}; lo que sobra queda ${EXCEDENTE_COMO[m.excedente_como ?? 'CREDITO'].corto} al entregarse)`
            : ''}
          .
        </p>
      ) : null}

      <Input
        label="¿Quién lo recibe por el proveedor?"
        hint="Su nombre va en la nota de salida, en «Para quién» y en quién responde."
        value={recibe}
        onChange={(e) => setRecibe(e.target.value)}
        required
      />

      {miFirma?.usar ? (
        <label className="border-hairline mt-4 flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm">
          <input
            type="checkbox"
            className="accent-royal-600 mt-0.5 size-4 shrink-0"
            checked={conMiFirma}
            onChange={(e) => setConMiFirma(e.target.checked)}
          />
          <span className="text-ink/80">
            Poner mi firma digital en «Solicitado por» de la orden de salida
            <span className="text-ink/50 mt-0.5 block text-xs">
              Sin marcar, la raya sale en blanco con tu nombre debajo.
            </span>
          </span>
        </label>
      ) : null}

      <Textarea
        label="Nota"
        className="mt-4"
        rows={2}
        placeholder="Opcional."
        value={nota}
        onChange={(e) => setNota(e.target.value)}
      />

      {registrar.error ? <ErrorDeCarga error={registrar.error} className="mt-4" /> : null}
    </Modal>
  )
}

/*
  USAR UN SALDO A FAVOR

  Lo que un intercambio anterior dejó como crédito con este proveedor paga esta
  orden, sin mover dinero: la instrucción nace pagada y el saldo baja.
*/
export function ModalUsarSaldo({
  orden,
  saldos,
  onCerrar,
}: {
  orden: Orden
  saldos: SaldoAFavor[]
  onCerrar: () => void
}) {
  const usar = useUsarSaldoAFavor()
  const pendiente = Math.round(pendienteDeOrden(orden) * 100) / 100
  const [saldoId, setSaldoId] = useState(saldos.length === 1 ? String(saldos[0].id) : '')
  const saldo = saldos.find((s) => String(s.id) === saldoId)
  const propuesto = saldo ? Math.min(Number(saldo.pendiente), pendiente) : 0
  const [monto, setMonto] = useState(propuesto > 0 ? propuesto.toFixed(2) : '')
  const [nota, setNota] = useState('')
  const n = Number(monto) || 0

  const listo = saldo && n > 0 && n <= Number(saldo.pendiente) + 0.001 && n <= pendiente + 0.001

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Usar saldo a favor"
      descripcion="Lo que el proveedor le debe a la empresa por un intercambio anterior paga esta orden, sin mover dinero."
      ancho="sm"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={!listo || usar.isPending}
            onClick={() =>
              void usar
                .mutateAsync({ orden_id: orden.id, saldo_id: Number(saldoId), monto: n, nota })
                .then(onCerrar)
            }
          >
            {usar.isPending ? 'Aplicando…' : 'Aplicar a la orden'}
          </Button>
        </>
      }
    >
      <p className="text-ink/60 mb-4 text-sm">
        A la orden {orden.numero} le faltan{' '}
        <strong className="text-ink/85 tabular">{dinero(orden.moneda, pendiente)}</strong>.
      </p>
      <Select
        label="Qué saldo"
        vacio="Elige el saldo"
        value={saldoId}
        onChange={(e) => {
          setSaldoId(e.target.value)
          const s = saldos.find((x) => String(x.id) === e.target.value)
          if (s) setMonto(Math.min(Number(s.pendiente), pendiente).toFixed(2))
        }}
        opciones={saldos.map((s) => ({
          valor: String(s.id),
          etiqueta: `${s.numero} · quedan ${dinero(s.moneda, s.pendiente)}`,
        }))}
      />
      <Input
        className="mt-4"
        label={`Cuánto se aplica (${orden.moneda})`}
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        value={monto}
        onChange={(e) => setMonto(e.target.value)}
      />
      <Textarea
        label="Nota"
        className="mt-4"
        rows={2}
        value={nota}
        onChange={(e) => setNota(e.target.value)}
      />
      {usar.error ? <ErrorDeCarga error={usar.error} className="mt-4" /> : null}
    </Modal>
  )
}
