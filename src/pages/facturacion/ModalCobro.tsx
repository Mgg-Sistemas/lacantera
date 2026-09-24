import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { ChipTasa } from '@/components/ChipTasa'
import { useCuentas } from '@/lib/api/tesoreria'
import { useMetodosPago, metodosParaMoneda, nombreDe, opcionesDe } from '@/lib/api/metodosPago'
import { useArticulos } from '@/lib/api/catalogo'
import { useAlmacenes } from '@/lib/api/inventario'
import { usePrecios } from '@/lib/api/ventas'
import { useTasaVigente } from '@/lib/api/tasas'
import { useEmpresa } from '@/lib/api/empresa'
import { listaEnMoneda, precioDeLista } from '@/pages/ventas/filas'
import { CONDICION_DEL_MATERIAL } from '@/lib/api/intercambio'
import {
  EXCEDENTE_DEL_CLIENTE,
  useCobrosConMaterial,
  useCreditosDeCliente,
  useRegistrarCobros,
  type CondicionDelMaterial,
  type ExcedenteDelCliente,
  type LineaDeCobro,
} from '@/lib/api/cobrosConMaterial'
import type { FacturaVenta } from '@/lib/api/facturacion'
import { dinero, dolares } from '@/lib/formato'

/*
  COBRAR UNA FACTURA, EN VARIAS LÍNEAS

  Christopher, 24/09/2026: «a la hora de una venta sea multipagos, porque
  puede ser por intercambio de materiales, pero también puedo pagar con otro
  método el resto ahí mismo».

  Una sola ventana con tres clases de línea:

  - DINERO: a qué cuenta entró, cuánto y cómo. Las que hay hoy, pero varias.
  - CRÉDITO DEL CLIENTE: lo que le sobró de otro intercambio, si lo tiene.
  - MATERIAL: lo que trae para pagar. Todavía no baja la factura: baja cuando
    almacén confirma que llegó. Aquí solo se dice qué, cuánto y a qué precio.

  Se manda todo junto y la base lo registra todo o nada. Por eso no hay un
  botón por línea: si la tercera falla, no queda la primera cobrada a medias.

  LAS CIFRAS DE LA PANTALLA SON ESTIMADAS. El saldo se lleva en dólares y las
  líneas van en la moneda de cada cuenta; convertirlas aquí con la tasa de hoy
  es para que quien cobra vea por dónde va. La que vale la pone la base, con
  las tasas congeladas de la factura y del día del cobro.
*/

const cant = (v: string | number) => Number(v).toLocaleString('es-VE', { maximumFractionDigits: 4 })

interface LineaDinero {
  clave: number
  cuenta_id: string
  monto: string
  metodo: string
  referencia: string
  igtf: boolean | null
}

interface Material {
  articulo_id: string
  almacen_id: string
  cantidad: string
  unidad: string
  condicion: CondicionDelMaterial | ''
  descuentoEn: 'PORCENTAJE' | 'MONTO'
  descuento: string
  acordado: string
  motivo: string
  excedenteComo: ExcedenteDelCliente | ''
}

const materialVacio: Material = {
  articulo_id: '',
  almacen_id: '',
  cantidad: '',
  unidad: '',
  condicion: '',
  descuentoEn: 'PORCENTAJE',
  descuento: '',
  acordado: '',
  motivo: '',
  excedenteComo: '',
}

let siguienteClave = 1

export function ModalCobro({
  factura,
  onCerrar,
  onListo,
}: {
  factura: FacturaVenta
  onCerrar: () => void
  onListo: () => void
}) {
  const registrar = useRegistrarCobros()
  const { data: cuentas } = useCuentas(true)
  const { data: metodos } = useMetodosPago()
  const { data: articulos } = useArticulos()
  const { data: almacenes } = useAlmacenes()
  const { data: precios } = usePrecios()
  const { data: tasaHoy } = useTasaVigente()
  const { data: empresa } = useEmpresa()
  const creditos = useCreditosDeCliente(factura.cliente_id)
  const pendientesDeMaterial = useCobrosConMaterial(factura.id)

  const aplicaIgtf = empresa?.aplica_igtf ?? true
  const tasa = Number(tasaHoy?.tasa) || 0

  const [dinero_, setDinero] = useState<LineaDinero[]>([
    { clave: siguienteClave++, cuenta_id: '', monto: '', metodo: 'TRANSFERENCIA', referencia: '', igtf: null },
  ])
  const [credito, setCredito] = useState<{ saldo_id: string; monto: string } | null>(null)
  const [material, setMaterial] = useState<Material | null>(null)

  const faltanUsd = Number(factura.saldo_usd) || 0
  // Lo que falta en la moneda de la factura, para valorar el material. Si la
  // factura va en bolívares, es la tasa de hoy: estimado, y se dice.
  const faltanEnMoneda = factura.moneda === 'USD' ? faltanUsd : tasa > 0 ? faltanUsd * tasa : 0

  /* ── dinero ────────────────────────────────────────────────────────────── */

  const cuentaDe = (id: string) => cuentas?.find((c) => String(c.id) === id)
  const cambiarDinero = (clave: number, cambio: Partial<LineaDinero>) =>
    setDinero((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)))

  const dineroUsd = dinero_.reduce((s, l) => {
    const c = cuentaDe(l.cuenta_id)
    const m = Number(l.monto) || 0
    if (!c || m <= 0) return s
    return s + (c.moneda === 'USD' ? m : c.moneda === 'VES' && tasa > 0 ? m / tasa : 0)
  }, 0)

  const lineasDineroListas = dinero_.every((l) => {
    if (!l.cuenta_id && !l.monto) return true // una línea vacía no estorba
    const c = cuentaDe(l.cuenta_id)
    return !!c && Number(l.monto) > 0 && metodosParaMoneda(metodos, c.moneda).some((m) => m.codigo === l.metodo)
  })
  const lineasDineroConAlgo = dinero_.filter((l) => l.cuenta_id && Number(l.monto) > 0)

  /* ── crédito ───────────────────────────────────────────────────────────── */

  const creditosUsables = (creditos.data ?? []).filter((c) => c.moneda === factura.moneda)
  const creditoElegido = creditosUsables.find((c) => String(c.id) === credito?.saldo_id)
  const creditoUsd =
    credito && creditoElegido && Number(credito.monto) > 0
      ? factura.moneda === 'USD'
        ? Number(credito.monto)
        : tasa > 0
          ? Number(credito.monto) / tasa
          : 0
      : 0
  const creditoListo =
    !credito ||
    (!!creditoElegido && Number(credito.monto) > 0 && Number(credito.monto) <= Number(creditoElegido.pendiente) + 0.001)

  /* ── material ──────────────────────────────────────────────────────────── */

  const articulo = (articulos ?? []).find((a) => String(a.id) === material?.articulo_id)
  const patios = (almacenes ?? []).filter((a) => a.activo && a.tipo !== 'TRANSITO')
  const unidades = !articulo
    ? []
    : articulo.densidad_ton_m3 && (articulo.unidad === 'M3' || articulo.unidad === 'TON')
      ? [articulo.unidad, articulo.unidad === 'M3' ? 'TON' : 'M3']
      : [articulo.unidad]
  const unidadElegida = material?.unidad || articulo?.unidad || ''
  const filaLista = material?.articulo_id ? precioDeLista(precios ?? [], material.articulo_id, unidadElegida) : undefined
  const lista = listaEnMoneda(filaLista, factura.moneda, tasa)
  const hayLista = filaLista !== undefined

  const precioMaterial = (() => {
    if (!material) return null
    if (material.condicion === 'LISTA') return lista
    if (material.condicion === 'DESCUENTO') {
      const d = Number(material.descuento) || 0
      if (lista === null || d <= 0) return lista
      return material.descuentoEn === 'PORCENTAJE' ? (lista * (100 - d)) / 100 : lista - d
    }
    if (material.condicion === 'ACORDADO') return Number(material.acordado) || null
    return null
  })()
  const cantidadMaterial = Number(material?.cantidad) || 0
  const valorMaterial =
    precioMaterial !== null && cantidadMaterial > 0 ? Math.round(cantidadMaterial * precioMaterial * 100) / 100 : null
  // Lo que quedará cuando llegue el material: lo que falta menos el dinero y el crédito de esta misma ventana.
  const quedaParaMaterialUsd = Math.max(faltanUsd - dineroUsd - creditoUsd, 0)
  const quedaParaMaterial = factura.moneda === 'USD' ? quedaParaMaterialUsd : quedaParaMaterialUsd * tasa
  const aplicadoMaterial = valorMaterial === null ? null : Math.min(valorMaterial, quedaParaMaterial)
  const excedenteMaterial =
    valorMaterial === null || aplicadoMaterial === null ? 0 : Math.round((valorMaterial - aplicadoMaterial) * 100) / 100
  const sobreLista = precioMaterial !== null && lista !== null && precioMaterial > lista

  const materialListo =
    !material ||
    (!!material.articulo_id &&
      !!material.almacen_id &&
      cantidadMaterial > 0 &&
      !!material.condicion &&
      (material.condicion !== 'DESCUENTO' || Number(material.descuento) > 0) &&
      (material.condicion !== 'ACORDADO' || Number(material.acordado) > 0) &&
      (excedenteMaterial <= 0 || !!material.excedenteComo))

  const elegirArticulo = (id: string) => {
    const a = (articulos ?? []).find((x) => String(x.id) === id)
    const tieneLista = a ? precioDeLista(precios ?? [], id, a.unidad) !== undefined : false
    setMaterial((m) => ({
      ...(m ?? materialVacio),
      articulo_id: id,
      unidad: a?.unidad ?? '',
      condicion: tieneLista ? 'LISTA' : 'ACORDADO',
      descuento: '',
      acordado: '',
    }))
  }

  /* ── el total ──────────────────────────────────────────────────────────── */

  const hayAlgo = lineasDineroConAlgo.length > 0 || (!!credito && creditoUsd > 0) || !!material
  const listo = hayAlgo && lineasDineroListas && creditoListo && materialListo
  const cubiertoAhoraUsd = Math.min(dineroUsd + creditoUsd, faltanUsd)
  const quedaTrasHoyUsd = Math.max(faltanUsd - cubiertoAhoraUsd, 0)

  const porRecibir = useMemo(
    () => (pendientesDeMaterial.data ?? []).filter((m) => m.estado === 'POR_RECIBIR'),
    [pendientesDeMaterial.data],
  )

  const guardar = async () => {
    const lineas: LineaDeCobro[] = []
    for (const l of lineasDineroConAlgo) {
      const c = cuentaDe(l.cuenta_id)!
      lineas.push({
        tipo: 'DINERO',
        cuenta_id: c.id,
        monto: Number(l.monto),
        metodo: l.metodo,
        referencia: l.referencia || null,
        igtf: l.igtf ?? (aplicaIgtf ? null : false),
      })
    }
    if (credito && creditoElegido && Number(credito.monto) > 0) {
      lineas.push({ tipo: 'CREDITO', saldo_id: creditoElegido.id, monto: Number(credito.monto) })
    }
    if (material && material.condicion) {
      lineas.push({
        tipo: 'MATERIAL',
        articulo_id: Number(material.articulo_id),
        almacen_id: Number(material.almacen_id),
        cantidad: cantidadMaterial,
        unidad: unidadElegida,
        condicion: material.condicion,
        descuento_pct:
          material.condicion === 'DESCUENTO' && material.descuentoEn === 'PORCENTAJE' ? Number(material.descuento) : null,
        descuento_unitario:
          material.condicion === 'DESCUENTO' && material.descuentoEn === 'MONTO' ? Number(material.descuento) : null,
        precio_acordado: material.condicion === 'ACORDADO' ? Number(material.acordado) : null,
        motivo_condicion: material.motivo || null,
        excedente_como: excedenteMaterial > 0 && material.excedenteComo ? material.excedenteComo : null,
      })
    }
    await registrar.mutateAsync({ factura_id: factura.id, lineas })
    onListo()
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Cobrar la factura ${factura.numero}`}
      descripcion={`${factura.cliente} · faltan ${dolares(faltanUsd)}`}
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button disabled={!listo || registrar.isPending} onClick={() => void guardar()}>
            {registrar.isPending ? 'Registrando…' : 'Registrar el cobro'}
          </Button>
        </>
      }
    >
      <ChipTasa className="mb-4" />

      {porRecibir.length > 0 ? (
        <p className="border-warning/30 bg-warning-soft text-ink/80 mb-4 rounded-[6px] border p-3 text-sm">
          Esta factura ya tiene material por recibir:{' '}
          {porRecibir.map((m) => `${cant(m.cantidad)} ${m.unidad} de ${m.articulo}`).join(', ')}. Hasta que almacén
          lo confirme, el saldo no baja. No lo vuelvas a registrar.
        </p>
      ) : null}

      {/* ── Dinero ────────────────────────────────────────────────────── */}
      <h3 className="text-ink/80 mb-2 text-sm font-semibold">En dinero</h3>
      <div className="space-y-3">
        {dinero_.map((l, i) => {
          const cuenta = cuentaDe(l.cuenta_id)
          const metodosDeLaCuenta = metodosParaMoneda(metodos, cuenta?.moneda)
          const metodoNoVale = !!cuenta && !metodosDeLaCuenta.some((m) => m.codigo === l.metodo)
          return (
            <div key={l.clave} className="border-hairline rounded-[6px] border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectBuscable
                  label="A qué cuenta entró"
                  vacio="Elige la cuenta"
                  valor={l.cuenta_id}
                  onCambio={(v) => {
                    const moneda = cuentaDe(v)?.moneda
                    cambiarDinero(l.clave, {
                      cuenta_id: v,
                      igtf: null,
                      metodo: metodosParaMoneda(metodos, moneda).some((m) => m.codigo === l.metodo)
                        ? l.metodo
                        : 'TRANSFERENCIA',
                    })
                  }}
                  opciones={(cuentas ?? []).map((c) => ({ valor: String(c.id), etiqueta: `${c.nombre} · ${c.moneda}` }))}
                />
                <Input
                  label={`Monto${cuenta ? ` en ${cuenta.moneda}` : ''}`}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={l.monto}
                  onChange={(e) => cambiarDinero(l.clave, { monto: e.target.value })}
                />
                <Select
                  label="Cómo pagó"
                  value={l.metodo}
                  onChange={(e) => cambiarDinero(l.clave, { metodo: e.target.value })}
                  opciones={opcionesDe(metodosDeLaCuenta)}
                  error={metodoNoVale ? `${nombreDe(metodos, l.metodo)} no se usa en ${cuenta?.moneda}.` : undefined}
                />
                <Input
                  label="Referencia"
                  placeholder={l.metodo === 'EFECTIVO' ? 'Se genera sola' : 'Número de la transferencia'}
                  value={l.referencia}
                  onChange={(e) => cambiarDinero(l.clave, { referencia: e.target.value })}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                {cuenta ? (
                  <label className="text-ink/75 flex cursor-pointer items-center gap-2 text-xs select-none">
                    <input
                      type="checkbox"
                      className="accent-royal-600 size-4"
                      checked={l.igtf ?? (aplicaIgtf && cuenta.moneda !== 'VES' && !(Number(factura.igtf) > 0))}
                      onChange={(e) => cambiarDinero(l.clave, { igtf: e.target.checked })}
                    />
                    Cobrarle el IGTF del 3% en esta línea
                  </label>
                ) : (
                  <span />
                )}
                {dinero_.length > 1 || i > 0 ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 />}
                    onClick={() => setDinero((ls) => ls.filter((x) => x.clave !== l.clave))}
                  >
                    Quitar
                  </Button>
                ) : null}
              </div>
            </div>
          )
        })}
        <Button
          size="sm"
          variant="outline"
          icon={<Plus />}
          onClick={() =>
            setDinero((ls) => [
              ...ls,
              { clave: siguienteClave++, cuenta_id: '', monto: '', metodo: 'TRANSFERENCIA', referencia: '', igtf: null },
            ])
          }
        >
          Otra cuenta o método
        </Button>
      </div>

      {/* ── Crédito del cliente ───────────────────────────────────────── */}
      {creditosUsables.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-ink/80 mb-2 text-sm font-semibold">Con crédito del cliente</h3>
          {credito ? (
            <div className="border-hairline grid gap-3 rounded-[6px] border p-3 sm:grid-cols-2">
              <Select
                label="Qué crédito"
                value={credito.saldo_id}
                onChange={(e) => {
                  const c = creditosUsables.find((x) => String(x.id) === e.target.value)
                  setCredito({ saldo_id: e.target.value, monto: c ? String(Math.min(Number(c.pendiente), faltanEnMoneda)) : '' })
                }}
                opciones={creditosUsables.map((c) => ({
                  valor: String(c.id),
                  etiqueta: `${c.numero} · quedan ${dinero(c.moneda, c.pendiente)}`,
                }))}
              />
              <Input
                label={`Cuánto usar (${factura.moneda})`}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={credito.monto}
                onChange={(e) => setCredito({ ...credito, monto: e.target.value })}
                hint={creditoElegido ? `Quedan ${dinero(creditoElegido.moneda, creditoElegido.pendiente)} de ese crédito.` : undefined}
              />
              <div className="sm:col-span-2">
                <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setCredito(null)}>
                  No usar crédito
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              icon={<Plus />}
              onClick={() => {
                const c = creditosUsables[0]
                setCredito({ saldo_id: String(c.id), monto: String(Math.min(Number(c.pendiente), faltanEnMoneda)) })
              }}
            >
              Usar el crédito que tiene ({creditosUsables.map((c) => dinero(c.moneda, c.pendiente)).join(' + ')})
            </Button>
          )}
        </div>
      ) : null}

      {/* ── Material ──────────────────────────────────────────────────── */}
      <div className="mt-6">
        <h3 className="text-ink/80 mb-2 text-sm font-semibold">Con material</h3>
        {material ? (
          <div className="border-hairline rounded-[6px] border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectBuscable
                className="sm:col-span-2"
                label="Qué material trae"
                vacio="Elige el material"
                valor={material.articulo_id}
                onCambio={elegirArticulo}
                opciones={(articulos ?? [])
                  .filter((a) => a.activo && a.inventariable)
                  .map((a) => ({ valor: String(a.id), etiqueta: `${a.codigo} · ${a.nombre}`, detalle: a.unidad }))}
              />
              <Select
                label="A qué patio entra"
                vacio="Elige el patio"
                value={material.almacen_id}
                onChange={(e) => setMaterial({ ...material, almacen_id: e.target.value })}
                opciones={patios.map((a) => ({ valor: String(a.id), etiqueta: a.nombre }))}
              />
              <div className="flex gap-2">
                <Input
                  className="flex-1"
                  label="Cuánto"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={material.cantidad}
                  onChange={(e) => setMaterial({ ...material, cantidad: e.target.value })}
                />
                {unidades.length > 1 ? (
                  <Select
                    className="w-28"
                    label="Unidad"
                    value={unidadElegida}
                    onChange={(e) => {
                      const tieneLista = precioDeLista(precios ?? [], material.articulo_id, e.target.value) !== undefined
                      setMaterial({ ...material, unidad: e.target.value, condicion: tieneLista ? 'LISTA' : 'ACORDADO' })
                    }}
                    opciones={unidades.map((u) => ({ valor: u, etiqueta: u }))}
                  />
                ) : null}
              </div>
              <Select
                label="A qué precio se toma"
                value={material.condicion}
                disabled={!material.articulo_id}
                onChange={(e) => setMaterial({ ...material, condicion: e.target.value as CondicionDelMaterial })}
                opciones={(hayLista ? (['LISTA', 'DESCUENTO', 'ACORDADO'] as const) : (['ACORDADO'] as const)).map((c) => ({
                  valor: c,
                  etiqueta: CONDICION_DEL_MATERIAL[c],
                }))}
                hint={
                  !material.articulo_id
                    ? 'De lista, con descuento, o acordado si no tiene precio.'
                    : hayLista && lista !== null
                      ? `Lista: ${dinero(factura.moneda, lista)} por ${unidadElegida}. Por encima de la lista hace falta control total sobre Facturación.`
                      : `Sin precio de lista por ${unidadElegida}: se escribe el acordado, y lo firma control total.`
                }
              />
              {material.condicion === 'DESCUENTO' ? (
                <div className="flex gap-2">
                  <Input
                    className="flex-1"
                    label="Descuento"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={material.descuento}
                    onChange={(e) => setMaterial({ ...material, descuento: e.target.value })}
                  />
                  <Select
                    className="w-36"
                    label="En"
                    value={material.descuentoEn}
                    onChange={(e) => setMaterial({ ...material, descuentoEn: e.target.value as 'PORCENTAJE' | 'MONTO' })}
                    opciones={[
                      { valor: 'PORCENTAJE', etiqueta: '%' },
                      { valor: 'MONTO', etiqueta: `${factura.moneda} por ${unidadElegida || 'unidad'}` },
                    ]}
                  />
                </div>
              ) : null}
              {material.condicion === 'ACORDADO' ? (
                <Input
                  label={`Precio acordado por ${unidadElegida || 'unidad'} (${factura.moneda})`}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={material.acordado}
                  onChange={(e) => setMaterial({ ...material, acordado: e.target.value })}
                />
              ) : null}
              {material.condicion === 'ACORDADO' || material.condicion === 'DESCUENTO' ? (
                <Input
                  label="Por qué ese precio"
                  value={material.motivo}
                  onChange={(e) => setMaterial({ ...material, motivo: e.target.value })}
                />
              ) : null}
            </div>

            {valorMaterial !== null ? (
              <div className="border-hairline mt-4 rounded-[6px] border p-3 text-sm">
                <p className="text-ink/80">
                  El material vale <strong className="tabular">{dinero(factura.moneda, valorMaterial)}</strong>
                  {precioMaterial !== null ? (
                    <span className="text-ink/50">
                      {' '}
                      ({cant(cantidadMaterial)} {unidadElegida} a {dinero(factura.moneda, precioMaterial)})
                    </span>
                  ) : null}
                  {sobreLista ? <span className="text-warning"> · por encima de la lista</span> : null}.
                </p>
                <p className="text-ink/60 mt-1">
                  A la factura se le aplican{' '}
                  <strong className="tabular">{dinero(factura.moneda, aplicadoMaterial ?? 0)}</strong>
                  {excedenteMaterial > 0 ? (
                    <>
                      {' '}
                      y sobran <strong className="tabular text-warning">{dinero(factura.moneda, excedenteMaterial)}</strong>.
                    </>
                  ) : (
                    '.'
                  )}{' '}
                  <span className="text-ink/45">Cuando almacén confirme que llegó.</span>
                </p>
                {excedenteMaterial > 0 ? (
                  <Select
                    className="mt-3"
                    label="Qué pasa con lo que sobra"
                    vacio="Elige"
                    value={material.excedenteComo}
                    onChange={(e) => setMaterial({ ...material, excedenteComo: e.target.value as ExcedenteDelCliente })}
                    opciones={(Object.keys(EXCEDENTE_DEL_CLIENTE) as ExcedenteDelCliente[]).map((k) => ({
                      valor: k,
                      etiqueta: `${EXCEDENTE_DEL_CLIENTE[k].etiqueta}: ${EXCEDENTE_DEL_CLIENTE[k].explica}`,
                    }))}
                  />
                ) : null}
              </div>
            ) : null}

            <div className="mt-3">
              <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setMaterial(null)}>
                Sin material
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" icon={<Plus />} onClick={() => setMaterial({ ...materialVacio })}>
            El cliente paga con material
          </Button>
        )}
      </div>

      {/* ── Resumen ───────────────────────────────────────────────────── */}
      <div className="bg-ink/5 mt-6 rounded-[6px] p-3 text-sm">
        <p className="text-ink/80">
          Faltan <strong className="tabular">{dolares(faltanUsd)}</strong>. En dinero y crédito entran hoy unos{' '}
          <strong className="tabular">{dolares(cubiertoAhoraUsd)}</strong>
          {material && aplicadoMaterial ? (
            <>
              , y cuando llegue el material otros{' '}
              <strong className="tabular">
                {dolares(factura.moneda === 'USD' ? aplicadoMaterial : tasa > 0 ? aplicadoMaterial / tasa : 0)}
              </strong>
            </>
          ) : null}
          .
        </p>
        <p className="text-ink/45 mt-1 text-xs">
          {quedaTrasHoyUsd > 0.01
            ? `Quedarían por cobrar unos ${dolares(quedaTrasHoyUsd)} después de hoy${material ? ', antes del material' : ''}.`
            : 'Con esto la factura queda cobrada.'}{' '}
          Cifras estimadas con la tasa de hoy; las de verdad las pone la base con la tasa de cada documento.
        </p>
      </div>

      {registrar.error ? <ErrorDeCarga error={registrar.error} className="mt-4" /> : null}
    </Modal>
  )
}
