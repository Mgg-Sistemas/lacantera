import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useMonedasUsables } from '@/lib/api/tasas'
import { Banknote, FileText, Paperclip } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_PROVEEDORES } from '@/components/pestanasDeModulos'
import { Visor } from '@/components/Visor'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { dinero, dolares, fecha, fechaHora } from '@/lib/formato'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useTablero } from '@/lib/api/compras'
import { useProveedores } from '@/lib/api/catalogo'
import { useEmpresa } from '@/lib/api/empresa'
import { useCuentas } from '@/lib/api/tesoreria'
import { useMetodosPago, nombreDe, opcionesDe } from '@/lib/api/metodosPago'
import {
  CONDICIONES_COMPRA,
  useAnularFacturaCompra,
  useAnularPagoCompra,
  useFacturasCompra,
  usePagosCompra,
  useRegistrarFacturaCompra,
  useRegistrarPagoCompra,
  type FacturaCompra,
  enlaceDelArchivo,
  useSubirArchivoFactura,
  useQuitarArchivoFactura,
} from '@/lib/api/facturasCompra'

/**
 * Facturas de proveedor.
 *
 * No se copian renglones: lo que el libro de compras necesita son cuatro cifras
 * —exento, base imponible, IVA y total— y esas se copian tal como están
 * impresas. El detalle de qué llegó ya vive en la recepción.
 */

const TONO: Record<string, 'royal' | 'success' | 'neutral'> = {
  REGISTRADA: 'royal',
  PAGADA: 'success',
  ANULADA: 'neutral',
}

const ETIQUETA: Record<string, string> = {
  REGISTRADA: 'Por pagar',
  PAGADA: 'Pagada',
  ANULADA: 'Anulada',
}

const vacio = {
  proveedor_id: '',
  orden_id: '',
  numero_factura: '',
  numero_control: '',
  fecha_emision: '',
  moneda: 'VES',
  condicion_pago: 'CONTADO',
  exento: '',
  base: '',
  alicuota: '16',
  iva: '',
  retencion_iva: '',
  retencion_islr: '',
  total_papel: '',
  observacion: '',
}

/**
 * Lo que se le retiene de IVA a un proveedor.
 *
 * Solo a quien está marcado como contribuyente especial en su ficha, y por el
 * porcentaje que la empresa tenga configurado en sus datos fiscales. Se propone
 * y se deja tocar: el porcentaje sube al 100% cuando la factura no cumple los
 * requisitos del reglamento, y eso lo ve quien tiene el papel delante, no el
 * sistema.
 */
function retencionQueTocaria(iva: number, especial: boolean, pct: number | null): number {
  if (!especial || iva <= 0) return 0
  return Math.round(iva * (pct ?? 75)) / 100
}

export function FacturasProveedor() {
  const monedas = useMonedasUsables()
  const { data: metodos } = useMetodosPago()
  const { data, isPending, error } = useFacturasCompra()
  const { data: proveedores } = useProveedores()
  const { data: tarjetas } = useTablero()

  const { data: empresa } = useEmpresa()
  const { data: cuentas } = useCuentas()
  const registrar = useRegistrarFacturaCompra()
  const anular = useAnularFacturaCompra()
  const pagar = useRegistrarPagoCompra()
  const anularPago = useAnularPagoCompra()
  const subir = useSubirArchivoFactura()
  const quitar = useQuitarArchivoFactura()
  const { puede } = useMisPermisos()

  const [nueva, setNueva] = useState<typeof vacio | null>(null)

  /*
    EL PAPEL SE ELIGE ANTES DE QUE LA FACTURA EXISTA

    Christopher: «es el que recibe, que con el tiempo se daña, por eso una
    imagen en la base tiene importancia». Exacto: el papel del proveedor se
    despinta, se moja o se traspapela, y lo que queda es lo que se guardó.

    Se puede cargar después desde la ficha, pero pedirlo aquí es lo que hace
    que se cargue: quien tiene el papel en la mano es quien está tecleando sus
    cifras, y no va a volver mañana a buscarlo.

    Queda en memoria hasta que la base devuelve el número de la factura, que es
    la carpeta donde se guarda. Por eso son dos pasos y no uno.
  */
  const [papel, setPapel] = useState<File | null>(null)

  /*
    Se llega aquí con la orden decidida.

    El detalle de la compra manda `?orden=` y `?proveedor=`, y el formulario
    abre con las dos casillas puestas y bloqueadas. Reusar esta pantalla en vez
    de maquetar el formulario allá evita tener dos sitios que sepan calcular
    retenciones y descuadres, que es como acaban dando cifras distintas.
  */
  const navegar = useNavigate()
  const [params, setParams] = useSearchParams()
  const ordenPedida = params.get('orden')
  useEffect(() => {
    if (!ordenPedida) return
    setNueva({
      ...vacio,
      fecha_emision: hoyEnCaracas(),
      proveedor_id: params.get('proveedor') ?? '',
      orden_id: ordenPedida,
      // La moneda viaja también. Sin ella el formulario proponía bolívares
      // sobre una orden en dólares, y quien teclea las cifras del papel no
      // suele mirar dos veces una casilla que ya venía llena.
      moneda: params.get('moneda') || vacio.moneda,
    })
    // La dirección se limpia: si no, volver atrás en el navegador reabre el
    // formulario de una factura que quizá ya se registró.
    setParams({}, { replace: true })
  }, [ordenPedida, params, setParams])
  const [detalleId, setDetalleId] = useState<number | null>(null)
  const [pagando, setPagando] = useState<FacturaCompra | null>(null)

  // El bucket es privado: no hay dirección fija que guardar. Se firma una al
  // abrir y vive lo que dura el visor.
  const [viendo, setViendo] = useState<{ href: string; nombre: string } | null>(null)
  const [abriendo, setAbriendo] = useState(false)
  const [anulando, setAnulando] = useState<FacturaCompra | null>(null)
  const [motivo, setMotivo] = useState('')

  const [cuentaId, setCuentaId] = useState('')
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('TRANSFERENCIA')
  const [referencia, setReferencia] = useState('')
  const [igtf, setIgtf] = useState<boolean | null>(null)

  /*
    Las órdenes del proveedor elegido, para poder atar la factura.

    Salen del tablero de compras, que ya trae número, título y proveedor de
    cada una y se consulta igualmente. Pedir una consulta aparte para esto
    sería traer dos veces lo mismo.
  */
  const ordenesDelProveedor = (tarjetas ?? [])
    .filter(
      (t) =>
        t.orden_id !== null &&
        t.proveedor ===
          (proveedores ?? []).find((p) => String(p.id) === nueva?.proveedor_id)?.nombre,
    )
    .map((t) => ({
      id: t.orden_id as number,
      numero: t.orden_numero ?? '',
      titulo: t.titulo,
      detalle: [t.numero, t.total ? `${t.moneda} ${t.total}` : null]
        .filter(Boolean)
        .join(' · '),
    }))

  const detalle = detalleId !== null ? ((data ?? []).find((f) => f.id === detalleId) ?? null) : null
  const pagos = usePagosCompra(detalleId)

  const cuenta = cuentas?.find((c) => String(c.id) === cuentaId)

  // El IVA se propone desde la base y la alícuota, pero se puede pisar: lo que
  // vale es lo que dice el papel, y a veces el papel redondea distinto.
  const ivaPropuesto = nueva
    ? Math.round(((Number(nueva.base) || 0) * (Number(nueva.alicuota) || 0)) / 100 * 100) / 100
    : 0
  const totalCalculado = nueva
    ? (Number(nueva.exento) || 0) + (Number(nueva.base) || 0) + (Number(nueva.iva) || 0)
    : 0
  const descuadre =
    nueva && Number(nueva.total_papel) > 0
      ? Math.abs(Number(nueva.total_papel) - totalCalculado) > 0.01
      : false

  const proveedorElegido = nueva
    ? (proveedores ?? []).find((p) => String(p.id) === nueva.proveedor_id)
    : undefined

  const retencionPropuesta = nueva
    ? retencionQueTocaria(
        Number(nueva.iva) || 0,
        proveedorElegido?.contribuyente_especial ?? false,
        empresa?.retencion_iva_pct ?? null,
      )
    : 0

  // Lo que de verdad sale de tesorería: el total del papel menos lo que se le
  // retiene y se entera al SENIAT en su lugar. Es la cifra que se transfiere,
  // y verla aquí evita el error de pagarle el IVA completo al proveedor.
  const netoAPagar =
    totalCalculado - (Number(nueva?.retencion_iva) || 0) - (Number(nueva?.retencion_islr) || 0)

  // La retención se vuelve a proponer cada vez que cambia algo de lo que
  // depende: el proveedor decide si se retiene y el IVA decide cuánto. Pisa lo
  // tecleado a propósito, igual que la base pisa el IVA — quien quiera otra
  // cifra la escribe después, que es el orden en que se rellena el papel.
  const conRetencionPropuesta = (estado: typeof vacio) => ({
    ...estado,
    retencion_iva: String(
      retencionQueTocaria(
        Number(estado.iva) || 0,
        (proveedores ?? []).find((p) => String(p.id) === estado.proveedor_id)
          ?.contribuyente_especial ?? false,
        empresa?.retencion_iva_pct ?? null,
      ) || '',
    ),
  })

  const porPagar = (data ?? []).filter((f) => f.estado === 'REGISTRADA')
  const vencidas = porPagar.filter((f) => f.dias_vencida > 0).length

  return (
    <>
      <PageHeader
        title="Facturas recibidas de proveedores"
        description="El papel que manda el proveedor por una orden ya aprobada. Es lo que sustenta el crédito fiscal del IVA."
        /*
          AQUÍ NO SE CREA UNA FACTURA

          Christopher: «si creas nada más la factura sin lo que la motiva y los
          pasos previos, ¿qué significa?». Nada — y el botón invitaba a
          intentarlo. Una factura llega POR una orden: se registra desde ella,
          que es donde consta qué se pidió, a quién y por cuánto, y aparece
          aquí ya atada.

          Lo que queda es la lista: todas las facturas recibidas, cuáles están
          vencidas, cuáles alimentan el libro de compras. Eso sí se mira aquí y
          no desde una compra concreta.
        */
        actions={vencidas > 0 ? <Chip tone="danger">{vencidas} vencidas</Chip> : null}
      />

      <Pestanas pestanas={PESTANAS_PROVEEDORES} />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<FileText />}
            titulo="Todavía no se ha recibido ninguna factura"
            descripcion="Una factura se registra desde la orden de compra que la motivó: se abre la compra y ahí está el botón. Sin registrarla, el IVA que se pagó no se puede descontar del que se cobró — es dinero real que se queda en el camino."
            accion={
              <Button variant="outline" onClick={() => navegar('/app/compras')}>
                Ir a las compras
              </Button>
            }
          />
        </Card>
      ) : null}

      {data && data.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Factura</th>
                  <th className="px-3 py-3 font-medium">Proveedor</th>
                  <th className="px-3 py-3 font-medium">Fecha</th>
                  <th className="px-3 py-3 text-right font-medium">Total</th>
                  <th className="px-3 py-3 text-right font-medium">Saldo</th>
                  <th className="px-5 py-3 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.map((f) => (
                  <tr
                    key={f.id}
                    onClick={() => setDetalleId(f.id)}
                    className="border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors last:border-0"
                  >
                    <td className="px-5 py-3">
                      <p className="tabular text-ink/85 font-medium">{f.numero_factura}</p>
                      {f.numero_control ? (
                        <p className="text-ink/45 text-xs">control {f.numero_control}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-ink/70">{f.proveedor}</p>
                      <p className="text-ink/45 text-xs">{f.proveedor_rif}</p>
                    </td>
                    <td className="text-ink/60 px-3 py-3 text-xs">
                      {fecha(f.fecha_emision)}
                      {f.dias_vencida > 0 ? (
                        <span className="text-danger block">vencida hace {f.dias_vencida} d</span>
                      ) : f.dias_credito > 0 ? (
                        <span className="block">vence {fecha(f.vence_el)}</span>
                      ) : null}
                    </td>
                    <td className="tabular text-ink/85 px-3 py-3 text-right font-medium">
                      {dinero(f.moneda, f.total)}
                    </td>
                    <td className="tabular px-3 py-3 text-right">
                      {f.estado === 'REGISTRADA' ? (
                        <span className="text-ink/85 font-medium">{dolares(f.saldo_usd)}</span>
                      ) : (
                        <span className="text-ink/30">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Chip tone={TONO[f.estado] ?? 'neutral'}>{ETIQUETA[f.estado]}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* ------------------------------------------------------- nueva */}
      {nueva ? (
        <Modal
          abierto
          ancho="lg"
          onCerrar={() => {
            setNueva(null)
            setPapel(null)
          }}
          titulo="Registrar factura de proveedor"
          descripcion="Se copian las cifras del papel. Si la suma no coincide con el total impreso, el sistema se para antes de guardar."
          acciones={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setNueva(null)
                  setPapel(null)
                }}
              >
                Cancelar
              </Button>
              <Button
                disabled={
                  registrar.isPending ||
                  !nueva.proveedor_id ||
                  !nueva.numero_factura.trim() ||
                  !nueva.fecha_emision ||
                  totalCalculado <= 0 ||
                  !nueva.orden_id ||
                  descuadre ||
                  // La base lo rechaza igual, pero enterarse aquí ahorra el viaje.
                  Number(nueva.retencion_iva) > (Number(nueva.iva) || 0) + 0.01
                }
                onClick={async () => {
                  const facturaId = await registrar.mutateAsync({
                    proveedor_id: Number(nueva.proveedor_id),
                    orden_id: Number(nueva.orden_id),
                    numero_factura: nueva.numero_factura,
                    fecha_emision: nueva.fecha_emision,
                    exento: Number(nueva.exento) || 0,
                    base_imponible: Number(nueva.base) || 0,
                    iva: Number(nueva.iva) || 0,
                    moneda: nueva.moneda,
                    numero_control: nueva.numero_control || null,
                    condicion_pago: nueva.condicion_pago,
                    alicuota_iva: Number(nueva.alicuota) || 16,
                    retencion_iva: Number(nueva.retencion_iva) || 0,
                    retencion_islr: Number(nueva.retencion_islr) || 0,
                    total_del_papel: Number(nueva.total_papel) || null,
                    observacion: nueva.observacion || null,
                  })

                  // Si la subida falla, la factura queda registrada igual y el
                  // papel se puede cargar después desde su ficha. Deshacer el
                  // registro por un archivo sería perder las cifras ya
                  // tecleadas, que es lo caro de rehacer.
                  if (papel && facturaId) {
                    try {
                      await subir.mutateAsync({ factura_id: facturaId, archivo: papel })
                    } catch {
                      // El error ya se ve debajo del botón: `subir.error`.
                      return
                    }
                  }

                  setPapel(null)
                  setNueva(null)
                }}
              >
                {registrar.isPending
                  ? 'Registrando…'
                  : subir.isPending
                    ? 'Guardando el papel…'
                    : 'Registrar'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectBuscable
              label="Proveedor"
              vacio="Elige el proveedor"
              valor={nueva.proveedor_id}
              onCambio={(v) =>
                setNueva(conRetencionPropuesta({ ...nueva, proveedor_id: v }))
              }
              opciones={(proveedores ?? []).map((p) => ({
                valor: String(p.id),
                etiqueta: `${p.rif} · ${p.nombre}`,
              }))}
              className="sm:col-span-3"
            />

            {/*
              UNA FACTURA VA CASADA CON SU ORDEN

              Christopher: «una factura no se puede registrar individual, si no
              ¿que estamos facturando? ¿de donde salio esa factura?». Tenía
              razón: sin orden no se puede cuadrar contra lo pedido, lo
              recibido ni lo pagado, y en el libro de compras aparece un
              crédito fiscal que no se sabe de qué operación salió.

              La lista se acota al proveedor elegido. Ofrecer las órdenes de
              todos invita a atar la factura a la orden de otro, que es peor
              que no atarla.
            */}
            <SelectBuscable
              label="¿Contra qué orden?"
              vacio={
                nueva.proveedor_id ? 'Elige la orden' : 'Elige antes el proveedor'
              }
              valor={nueva.orden_id}
              onCambio={(v) => setNueva({ ...nueva, orden_id: v })}
              disabled={!nueva.proveedor_id || Boolean(ordenPedida)}
              hint="Es la que dice qué se compró y a qué precio."
              opciones={ordenesDelProveedor.map((o) => ({
                valor: String(o.id),
                codigo: o.numero,
                nombre: o.titulo,
                detalle: o.detalle,
              }))}
              className="sm:col-span-3"
            />

            <Input
              label="Número de factura"
              value={nueva.numero_factura}
              onChange={(e) => setNueva({ ...nueva, numero_factura: e.target.value })}
              required
            />
            <Input
              label="Número de control"
              placeholder="00-12345678"
              value={nueva.numero_control}
              onChange={(e) => setNueva({ ...nueva, numero_control: e.target.value })}
            />
            <Input
              label="Fecha de emisión"
              type="date"
              value={nueva.fecha_emision}
              onChange={(e) => setNueva({ ...nueva, fecha_emision: e.target.value })}
              required
            />
            <Select
              label="Moneda"
              value={nueva.moneda}
              onChange={(e) => setNueva({ ...nueva, moneda: e.target.value })}
              opciones={monedas.data ?? []}
            />
            <Select
              label="Condición de pago"
              value={nueva.condicion_pago}
              onChange={(e) => setNueva({ ...nueva, condicion_pago: e.target.value })}
              opciones={CONDICIONES_COMPRA}
              className="sm:col-span-2"
            />
            <Input
              label="Exento"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={nueva.exento}
              onChange={(e) => setNueva({ ...nueva, exento: e.target.value })}
              hint="Lo que no lleva IVA"
            />
            <Input
              label="Base imponible"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={nueva.base}
              onChange={(e) =>
                setNueva(
                  conRetencionPropuesta({
                    ...nueva,
                    base: e.target.value,
                    iva: String(
                      Math.round(
                        ((Number(e.target.value) || 0) * (Number(nueva.alicuota) || 0)) / 100 * 100,
                      ) / 100,
                    ),
                  }),
                )
              }
            />
            <Input
              label="Alícuota (%)"
              type="number"
              min="0"
              step="0.5"
              inputMode="decimal"
              value={nueva.alicuota}
              onChange={(e) => setNueva({ ...nueva, alicuota: e.target.value })}
            />
            <Input
              label="IVA"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={nueva.iva}
              onChange={(e) => setNueva(conRetencionPropuesta({ ...nueva, iva: e.target.value }))}
              hint={
                Number(nueva.iva) > 0 && Math.abs(Number(nueva.iva) - ivaPropuesto) > 0.01
                  ? `Por la alícuota daría ${ivaPropuesto.toFixed(2)}`
                  : 'Se propone solo; manda lo que diga el papel'
              }
            />
            <Input
              label="Total impreso"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={nueva.total_papel}
              onChange={(e) => setNueva({ ...nueva, total_papel: e.target.value })}
              error={descuadre ? `Lo tecleado suma ${totalCalculado.toFixed(2)}` : undefined}
              hint="Opcional. Sirve para que el sistema compruebe la suma."
            />
            <Input
              label="Retención de IVA"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={nueva.retencion_iva}
              onChange={(e) => setNueva({ ...nueva, retencion_iva: e.target.value })}
              error={
                Number(nueva.retencion_iva) > (Number(nueva.iva) || 0) + 0.01
                  ? 'No se retiene más IVA del que trae la factura'
                  : undefined
              }
              hint={
                !nueva.proveedor_id
                  ? 'Se propone al elegir el proveedor'
                  : !proveedorElegido?.contribuyente_especial
                    ? 'A este proveedor no se le retiene: no está marcado como contribuyente especial'
                    : Math.abs(Number(nueva.retencion_iva) - retencionPropuesta) > 0.01
                      ? `Por los datos de la empresa tocarían ${retencionPropuesta.toFixed(2)}`
                      : `${empresa?.retencion_iva_pct ?? 75}% del IVA, según los datos fiscales de la empresa`
              }
            />
            <Input
              label="Retención de ISLR"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={nueva.retencion_islr}
              onChange={(e) => setNueva({ ...nueva, retencion_islr: e.target.value })}
              hint="Solo si al proveedor le aplica por su actividad"
            />
            <div className="flex items-end">
              <div className="bg-ink/4 rounded-card w-full p-3">
                <p className="text-ink/45 text-xs">Total</p>
                <p className="tabular text-ink/90 text-lg font-semibold">
                  {dinero(nueva.moneda, totalCalculado)}
                </p>
              </div>
            </div>
            {/* Lo que se transfiere. Solo aparece cuando hay algo retenido:
                sin retenciones sería el total otra vez y solo haría ruido. */}
            {netoAPagar < totalCalculado - 0.01 ? (
              <div className="flex items-end sm:col-span-2">
                <div className="bg-royal-600/8 rounded-card w-full p-3">
                  <p className="text-ink/45 text-xs">Neto a pagar al proveedor</p>
                  <p className="tabular text-royal-700 dark:text-royal-300 text-lg font-semibold">
                    {dinero(nueva.moneda, netoAPagar)}
                  </p>
                  <p className="text-ink/45 mt-0.5 text-xs">
                    El resto se retiene y se entera al SENIAT
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <Textarea
            label="Observación"
            rows={2}
            className="mt-4"
            value={nueva.observacion}
            onChange={(e) => setNueva({ ...nueva, observacion: e.target.value })}
          />

          {/*
            EL PAPEL RECIBIDO

            Va al final, después de las cifras: primero se teclea lo que dice
            el papel y luego se guarda el papel que lo dice. Al revés invita a
            adjuntar y dar por hecho que el sistema leerá las cifras solo.
          */}
          <div className="border-hairline mt-4 border-t pt-4">
            <p className="text-ink/75 text-sm font-medium">
              Imagen o PDF de la factura recibida
            </p>
            <p className="text-ink/50 mt-0.5 text-xs">
              El papel del proveedor se despinta y se traspapela. Lo que quede aquí es lo que
              habrá dentro de un año para demostrar que estas cifras son las que llegaron.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="border-ink/20 hover:border-ink/32 text-ink/75 flex cursor-pointer items-center gap-2 rounded-[6px] border px-3 py-2 text-sm transition-colors">
                <Paperclip className="size-4" />
                {papel ? 'Cambiar el papel' : 'Elegir el papel'}
                <input
                  type="file"
                  className="hidden"
                  accept="application/pdf,image/*"
                  onChange={(e) => {
                    const elegido = e.target.files?.[0] ?? null
                    // El campo se limpia para que volver a elegir el mismo
                    // archivo dispare el `change` otra vez.
                    e.target.value = ''
                    if (elegido) setPapel(elegido)
                  }}
                />
              </label>

              {papel ? (
                <>
                  <span className="text-ink/60 min-w-0 flex-1 truncate text-xs">
                    {papel.name} · {Math.max(1, Math.round(papel.size / 1024))} KB
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setPapel(null)}>
                    Quitar
                  </Button>
                </>
              ) : (
                <span className="text-ink/45 text-xs">
                  Se puede cargar después desde la ficha de la factura.
                </span>
              )}
            </div>
          </div>

          {registrar.error ? <ErrorDeCarga error={registrar.error} className="mt-4" /> : null}
          {subir.error ? (
            <>
              <ErrorDeCarga error={subir.error} className="mt-4" />
              <p className="text-ink/55 mt-2 text-xs">
                La factura sí quedó registrada. Solo falló el papel: se puede cargar desde su
                ficha.
              </p>
            </>
          ) : null}
        </Modal>
      ) : null}

      {/* ----------------------------------------------------- detalle */}
      {detalle ? (
        <Modal
          abierto
          ancho="lg"
          onCerrar={() => setDetalleId(null)}
          titulo={`Factura ${detalle.numero_factura}`}
          descripcion={`${detalle.proveedor} · ${fecha(detalle.fecha_emision)}`}
          acciones={
            <>
              <Button variant="ghost" onClick={() => setDetalleId(null)}>
                Cerrar
              </Button>
              {detalle.estado === 'REGISTRADA' && puede('COMPRAS', 'TOTAL') ? (
                <Button
                  variant="outline"
                  className="text-danger"
                  onClick={() => {
                    setAnulando(detalle)
                    setMotivo('')
                  }}
                >
                  Anular
                </Button>
              ) : null}
              {detalle.estado === 'REGISTRADA' && puede('COMPRAS', 'ESCRITURA') ? (
                <Button
                  icon={<Banknote />}
                  onClick={() => {
                    setPagando(detalle)
                    setCuentaId('')
                    setMonto('')
                    setReferencia('')
                    setIgtf(null)
                  }}
                >
                  Registrar pago
                </Button>
              ) : null}
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={TONO[detalle.estado] ?? 'neutral'}>{ETIQUETA[detalle.estado]}</Chip>
            <Chip tone="neutral">
              {CONDICIONES_COMPRA.find((c) => c.valor === detalle.condicion_pago)?.etiqueta}
            </Chip>
            {detalle.dias_vencida > 0 ? (
              <Chip tone="danger">Vencida hace {detalle.dias_vencida} días</Chip>
            ) : null}
            {detalle.orden_numero ? <Chip tone="info">Orden {detalle.orden_numero}</Chip> : null}
          </div>

          {detalle.motivo_anulacion ? (
            <p className="text-danger mt-3 text-sm">Anulada: {detalle.motivo_anulacion}</p>
          ) : null}

          <div className="bg-ink/4 rounded-card mt-4 space-y-1.5 p-4 text-sm">
            {[
              ['Exento', detalle.exento],
              ['Base imponible', detalle.base_imponible],
              [`IVA ${Number(detalle.alicuota_iva)}%`, detalle.iva],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between">
                <span className="text-ink/55">{k}</span>
                <span className="tabular text-ink/80">{dinero(detalle.moneda, v as string)}</span>
              </div>
            ))}
            <div className="border-hairline flex justify-between border-t pt-1.5">
              <span className="text-ink/75 font-medium">Total</span>
              <span className="tabular text-ink/90 font-semibold">
                {dinero(detalle.moneda, detalle.total)}
              </span>
            </div>

            {/* Lo retenido no se le paga al proveedor: se entera al SENIAT. Sin
                verlo aquí, el total de arriba parece lo que hay que transferir. */}
            {Number(detalle.retencion_iva) > 0 || Number(detalle.retencion_islr) > 0 ? (
              <>
                {Number(detalle.retencion_iva) > 0 ? (
                  <div className="flex justify-between">
                    <span className="text-ink/55">IVA retenido</span>
                    <span className="tabular text-ink/80">
                      −{dinero(detalle.moneda, detalle.retencion_iva)}
                    </span>
                  </div>
                ) : null}
                {Number(detalle.retencion_islr) > 0 ? (
                  <div className="flex justify-between">
                    <span className="text-ink/55">ISLR retenido</span>
                    <span className="tabular text-ink/80">
                      −{dinero(detalle.moneda, detalle.retencion_islr)}
                    </span>
                  </div>
                ) : null}
                <div className="border-hairline flex justify-between border-t pt-1.5">
                  <span className="text-ink/75 font-medium">Neto al proveedor</span>
                  <span className="tabular text-ink/90 font-semibold">
                    {dinero(
                      detalle.moneda,
                      Number(detalle.total) -
                        Number(detalle.retencion_iva) -
                        Number(detalle.retencion_islr),
                    )}
                  </span>
                </div>
              </>
            ) : null}

            {detalle.estado === 'REGISTRADA' ? (
              <p className="text-ink/55 border-hairline mt-2 border-t pt-2">
                Pagado {dolares(detalle.pagado_usd)} · falta{' '}
                <span className="text-ink/85 font-semibold">{dolares(detalle.saldo_usd)}</span>
              </p>
            ) : null}
          </div>

          {/*
            EL PAPEL

            Los datos de arriba salen de lo que alguien tecleó del papel. Ante
            una fiscalización lo que vale es el papel, y para conciliar un
            número de control mal tecleado hay que poder mirar el original.
          */}
          <Card className="mt-4">
            <CardHeader
              title="El documento del proveedor"
              subtitle={
                detalle.archivo_path
                  ? 'Guardado. Solo lo ven compras, tesorería y gerencia.'
                  : 'PDF o foto del papel, hasta 10 MB.'
              }
            />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {detalle.archivo_path ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Paperclip />}
                    disabled={abriendo}
                    onClick={async () => {
                      setAbriendo(true)
                      try {
                        const href = await enlaceDelArchivo(detalle.archivo_path!)
                        setViendo({ href, nombre: detalle.archivo_nombre ?? 'factura' })
                      } finally {
                        setAbriendo(false)
                      }
                    }}
                  >
                    {abriendo ? 'Abriendo…' : 'Ver el documento'}
                  </Button>

                  <span className="text-ink/45 min-w-0 truncate text-xs">
                    {detalle.archivo_nombre}
                  </span>

                  {puede('COMPRAS', 'TOTAL') ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger ml-auto"
                      disabled={quitar.isPending}
                      onClick={() => void quitar.mutateAsync({ factura_id: detalle.id })}
                    >
                      Quitar
                    </Button>
                  ) : null}
                </>
              ) : puede('COMPRAS', 'ESCRITURA') ? (
                <label className="border-ink/20 hover:border-ink/32 text-ink/75 flex cursor-pointer items-center gap-2 rounded-[6px] border px-3 py-2 text-sm transition-colors">
                  <Paperclip className="size-4" />
                  {subir.isPending ? 'Subiendo…' : 'Cargar el documento'}
                  <input
                    type="file"
                    className="hidden"
                    accept="application/pdf,image/*"
                    disabled={subir.isPending}
                    onChange={(e) => {
                      const archivo = e.target.files?.[0]
                      // El campo se limpia para que volver a elegir el mismo
                      // archivo tras un fallo dispare el `change` otra vez.
                      e.target.value = ''
                      if (archivo) void subir.mutateAsync({ factura_id: detalle.id, archivo })
                    }}
                  />
                </label>
              ) : (
                <p className="text-ink/50 text-sm">Todavía no se ha cargado.</p>
              )}
            </div>

            {subir.error ? <ErrorDeCarga error={subir.error} className="mt-3" /> : null}
            {quitar.error ? <ErrorDeCarga error={quitar.error} className="mt-3" /> : null}
          </Card>

          {(pagos.data ?? []).length > 0 ? (
            <Card flush className="mt-4">
              <CardHeader title="Pagos" className="p-4 pb-0" />
              <div className="space-y-2 p-4 pt-3">
                {(pagos.data ?? []).map((p) => (
                  <div
                    key={p.id}
                    className={`border-hairline flex items-center justify-between gap-3 border-b pb-2 text-sm last:border-0 ${
                      p.estado === 'ANULADO' ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-ink/80">
                        {p.numero} ·{' '}
                        {nombreDe(metodos, p.metodo)}
                        {p.estado === 'ANULADO' ? ' · anulado' : ''}
                      </p>
                      <p className="text-ink/45 text-xs">
                        {fechaHora(p.registrado_en)} · {p.cuenta}
                        {p.referencia ? ` · ref. ${p.referencia}` : ''}
                        {Number(p.igtf_monto) > 0
                          ? ` · IGTF ${dinero(p.moneda, p.igtf_monto)}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="tabular text-ink/85 font-medium">
                        {dinero(p.moneda, p.monto)}
                      </span>
                      {p.estado === 'REGISTRADO' && puede('COMPRAS', 'TOTAL') ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger"
                          disabled={anularPago.isPending}
                          onClick={() =>
                            void anularPago.mutateAsync({
                              id: p.id,
                              motivo: 'ANULADO DESDE LA FACTURA',
                            })
                          }
                        >
                          Anular
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {anularPago.error ? <ErrorDeCarga error={anularPago.error} className="mt-4" /> : null}
        </Modal>
      ) : null}

      {/* -------------------------------------------------------- pago */}
      {pagando ? (
        <Modal
          abierto
          onCerrar={() => setPagando(null)}
          titulo={`Pagar la factura ${pagando.numero_factura}`}
          descripcion={`${pagando.proveedor} · faltan ${dolares(pagando.saldo_usd)}`}
          acciones={
            <>
              <Button variant="ghost" onClick={() => setPagando(null)}>
                Cancelar
              </Button>
              <Button
                disabled={pagar.isPending || !cuentaId || !Number(monto)}
                onClick={async () => {
                  await pagar.mutateAsync({
                    factura_id: pagando.id,
                    cuenta_id: Number(cuentaId),
                    monto: Number(monto),
                    metodo,
                    referencia: referencia || null,
                    igtf,
                  })
                  setPagando(null)
                  setDetalleId(null)
                }}
              >
                {pagar.isPending ? 'Registrando…' : 'Registrar el pago'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectBuscable
              label="De qué cuenta sale"
              vacio="Elige la cuenta"
              valor={cuentaId}
              onCambio={(v) => {
                setCuentaId(v)
                setIgtf(null)
              }}
              opciones={(cuentas ?? [])
                .filter((c) => c.activa)
                .map((c) => ({ valor: String(c.id), etiqueta: `${c.nombre} · ${c.moneda}` }))}
              hint="El pago se registra en la moneda de la cuenta."
            />
            <Input
              label={`Monto${cuenta ? ` en ${cuenta.moneda}` : ''}`}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              required
            />
            <Select
              label="Cómo se pagó"
              value={metodo}
              onChange={(e) => setMetodo(e.target.value)}
              opciones={opcionesDe(metodos)}
            />
            <Input
              label="Referencia"
              placeholder="Número de la transferencia"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
            />
          </div>

          {cuenta ? (
            <label className="text-ink/75 mt-4 flex cursor-pointer items-start gap-2 text-sm select-none">
              <input
                type="checkbox"
                className="accent-royal-600 mt-0.5 size-4"
                checked={igtf ?? cuenta.moneda !== 'VES'}
                onChange={(e) => setIgtf(e.target.checked)}
              />
              <span>
                Pagar el IGTF del 3%
                <span className="text-ink/45 block text-xs leading-relaxed">
                  Grava los pagos en divisas. No abona la factura: va en su propio asiento porque no
                  es del proveedor sino del fisco.
                </span>
              </span>
            </label>
          ) : null}

          {pagar.error ? <ErrorDeCarga error={pagar.error} className="mt-4" /> : null}
        </Modal>
      ) : null}

      {/* ------------------------------------------------------ anular */}
      {anulando ? (
        <Modal
          abierto
          onCerrar={() => setAnulando(null)}
          titulo={`Anular la factura ${anulando.numero_factura}`}
          descripcion="Sale del libro de compras y su crédito fiscal deja de contar."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setAnulando(null)}>
                No anular
              </Button>
              <Button
                disabled={anular.isPending || motivo.trim().length < 4}
                onClick={async () => {
                  await anular.mutateAsync({ id: anulando.id, motivo })
                  setAnulando(null)
                  setDetalleId(null)
                }}
              >
                {anular.isPending ? 'Anulando…' : 'Anular'}
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
      ) : null}

      {viendo ? (
        <Visor
          abierto
          onCerrar={() => setViendo(null)}
          href={viendo.href}
          nombreArchivo={viendo.nombre}
          titulo="Documento del proveedor"
          descripcion="Tal como lo entregó. La dirección caduca en cinco minutos."
        />
      ) : null}
    </>
  )
}
