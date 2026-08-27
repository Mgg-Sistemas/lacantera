import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  ArrowLeft,
  Ban,
  BadgeCheck,
  Check,
  CircleDollarSign,
  Download,
  FileText,
  History,
  PackageCheck,
  Pencil,
  Printer,
  Receipt,
  Send,
  ShoppingCart,
  Undo2,
  UserX,
  Repeat,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ChipTasa } from '@/components/ChipTasa'
import { Visor } from '@/components/Visor'
import { Chip } from '@/components/ui/Chip'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { ModalCotizacion } from './ModalCotizacion'
import { ModalPago } from './ModalPago'
import { ModalCambiarMetodo } from './ModalCambiarMetodo'
import { ModalRecepcion } from './ModalRecepcion'
import { PapelesDeCompra } from './PapelesDeCompra'
import { usePapelesDeCompra, useRespaldarAutorizacion } from '@/lib/api/papelesDeCompra'
import { SoltarArchivo } from '@/components/SoltarArchivo'
import { ModalRegistrarPago } from '@/pages/tesoreria/ModalRegistrarPago'
import { usePerfiles, useMisRoles, useArticulos, CONDICIONES_PAGO } from '@/lib/api/catalogo'
import { useMisAcciones, useMisAutorizaciones } from '@/lib/api/usuarios'
import {
  ordenVigente,
  useAprobarCompra,
  useBitacora,
  useCancelarOrden,
  useCancelarPedido,
  useCompra,
  useConfirmarPedido,
  useDevolverACotizacion,
  useDevolverInstruccion,
  useEliminarCotizacion,
  useEnviarPedido,
  useMarcarDesistimiento,
  useProponerCotizacion,
  useRetirarCotizacion,
  useResolverDesistimiento,
  useDeclararComprobante,
} from '@/lib/api/compras'
// Con alias: la pantalla ya tiene su propio `nombreDe`, que traduce un
// identificador de usuario. Dos cosas distintas no pueden llamarse igual en el
// mismo archivo sin que una tape a la otra — y taparla es un error silencioso.
import { useMetodosPago, nombreDe as nombreDelMetodo } from '@/lib/api/metodosPago' 
import type { Cotizacion, InstruccionPago } from '@/lib/api/compras'
import { empresaDelPapel, useEmpresa } from '@/lib/api/empresa'
import { useFirmas } from '@/lib/api/firmas'
import {
  armarOrdenDeCompra,
  armarComprobanteDePago,
  armarCotizacionDeCompra,
} from '@/lib/ficha/comprasPdf'
import type { PdfArmado } from '@/lib/ficha/reciboPdf'
import { bolivares, dinero, dolares, fecha, fechaHora } from '@/lib/formato'
import { cn } from '@/lib/cn'

// ---------------------------------------------------------------------------

const ETIQUETAS: Record<string, { texto: string; tono: 'neutral' | 'info' | 'royal' | 'warning' | 'success' | 'danger' }> = {
  BORRADOR: { texto: 'Borrador', tono: 'neutral' },
  PEDIDO: { texto: 'Pedido', tono: 'neutral' },
  CONFIRMADA: { texto: 'Confirmada · indicar proveedores', tono: 'info' },
  POR_CONFIRMAR_GERENTE: { texto: 'Por confirmar el gerente', tono: 'royal' },
  APROBADA: { texto: 'Aprobada', tono: 'warning' },
  CANCELADA: { texto: 'Cancelada', tono: 'neutral' },
  POR_INDICAR_PAGO: { texto: 'Aprobada · indicar método de pago', tono: 'warning' },
  /*
    El estado se sigue llamando EN_TESORERIA en la base y el rotulo ya no lo
    dice. Christopher: «hay un momento en que el estatus es "En tesoreria" y eso
    ya no debe ser, pues "Tesoreria" como la habiamos conocido ya no existe».

    No se le cambia el nombre al estado: es un CHECK sobre texto que nombran
    varias funciones y ocho ordenes ya escritas, y renombrarlo por un rotulo
    seria mover la base para arreglar una palabra. Lo que se cambia es lo que
    lee la gente, que es lo unico que estaba mal: el estado nunca dijo «esta en
    un departamento», dijo «el pago esta indicado y falta que salga el dinero».
  */
  EN_TESORERIA: { texto: 'Por pagar', tono: 'info' },
  // Contra entrega: aprobada y esperando el material, sin un bolivar fuera.
  POR_RECIBIR: { texto: 'Contra entrega · esperando el material', tono: 'info' },
  PAGADA_POR_RECIBIR: { texto: 'Pagada · falta que llegue', tono: 'success' },
  RECIBIDA_PARCIAL: { texto: 'Recibida parcialmente', tono: 'success' },
  RECIBIDA: { texto: 'Recibida', tono: 'success' },
  PROVEEDOR_DESISTIO: { texto: 'El proveedor desistió', tono: 'danger' },
}

// ---------------------------------------------------------------------------
// Modal de un solo campo: el motivo.
//
// Cancelar, devolver y marcar un desistimiento comparten forma — una decisión
// y una explicación obligatoria. La explicación no es burocracia: dentro de un
// mes, "cancelada" sin motivo no le sirve a nadie.
// ---------------------------------------------------------------------------
function ModalMotivo({
  abierto,
  onCerrar,
  titulo,
  descripcion,
  etiqueta,
  variante = 'danger',
  pendiente,
  error,
  onConfirmar,
}: {
  abierto: boolean
  onCerrar: () => void
  titulo: string
  descripcion: string
  etiqueta: string
  variante?: 'primary' | 'danger'
  pendiente: boolean
  error: unknown
  onConfirmar: (motivo: string) => Promise<void>
}) {
  const [motivo, setMotivo] = useState('')

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={titulo}
      descripcion={descripcion}
      ancho="sm"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            variant={variante}
            disabled={pendiente || motivo.trim().length < 5}
            onClick={async () => {
              await onConfirmar(motivo)
              setMotivo('')
              onCerrar()
            }}
          >
            {pendiente ? 'Guardando…' : etiqueta}
          </Button>
        </>
      }
    >
      <Textarea
        label="Motivo"
        rows={4}
        autoFocus
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        hint="Queda en el historial de la compra."
      />
      {error ? <ErrorDeCarga error={error} className="mt-3" /> : null}
    </Modal>
  )
}

// ---------------------------------------------------------------------------

/**
 * En qué gana cada cotización frente a las demás.
 *
 * POR QUÉ NO HAY UNA «MEJOR» A SECAS
 *
 * Antes se marcaba una sola: la más barata. Y la más barata no siempre es la
 * que conviene — una que cuesta veinte dólares más pero se paga a treinta días
 * puede ser mejor para una empresa que anda ajustada de caja, y una que llega
 * en dos días puede serlo cuando la planta está parada esperando la pieza.
 *
 * Poner un ganador único obligaría a inventar una fórmula que pondere precio,
 * plazo y entrega. Cualquier peso que eligiéramos sería nuestro, no de quien
 * compra, y quedaría escondido detrás de una etiqueta que parece objetiva.
 *
 * Así que cada cotización lleva las etiquetas de aquello en lo que gana, y
 * decide la persona. Si una gana en todo, se le ven las tres juntas y la
 * decisión se toma sola.
 *
 * SOLO SE COMPARA LO QUE SE PUEDE COMPARAR
 *
 * Con una sola cotización no hay nada que decir: llamarla «la más económica»
 * sería cierto y vacío. Y una etiqueta solo aparece si de verdad hay
 * diferencia: si las tres cuestan lo mismo, ninguna es la más barata.
 */
export interface Ventaja {
  clave: string
  etiqueta: string
  detalle: string
  tono: 'success' | 'royal' | 'neutral'
}

/** Cuánto se tarda en pagar cada condición. Más días, más aire de caja. */
const DIAS_DE_PAGO: Record<string, number> = {
  CONTADO: 0,
  CONTRA_ENTREGA: 1,
  CREDITO_15: 15,
  CREDITO_30: 30,
  CREDITO_60: 60,
}

function compararCotizaciones(cotizaciones: Cotizacion[]): Map<number, Ventaja[]> {
  const mapa = new Map<number, Ventaja[]>()
  if (cotizaciones.length < 2) return mapa

  const anotar = (id: number, v: Ventaja) => mapa.set(id, [...(mapa.get(id) ?? []), v])

  // Precio: en dólares, que es lo único comparable entre monedas distintas.
  const precios = cotizaciones.map((c) => Number(c.total_usd))
  const menor = Math.min(...precios)
  if (Math.max(...precios) > menor) {
    for (const c of cotizaciones) {
      if (Number(c.total_usd) === menor) {
        anotar(c.id, {
          clave: 'precio',
          etiqueta: 'Más económica',
          detalle: 'Es la de menor total en dólares.',
          tono: 'success',
        })
      }
    }
  }

  // Pago: gana la que da más días para pagar.
  const plazos = cotizaciones.map((c) => DIAS_DE_PAGO[c.condicion_pago] ?? 0)
  const mayorPlazo = Math.max(...plazos)
  if (mayorPlazo > Math.min(...plazos)) {
    for (const c of cotizaciones) {
      if ((DIAS_DE_PAGO[c.condicion_pago] ?? 0) === mayorPlazo) {
        anotar(c.id, {
          clave: 'pago',
          etiqueta: c.condicion_pago === 'CONTRA_ENTREGA' ? 'Se paga al recibir' : 'Más plazo',
          detalle:
            c.condicion_pago === 'CONTRA_ENTREGA'
              ? 'Solo se paga lo que llegue.'
              : `Es la que da más días para pagar (${mayorPlazo}).`,
          tono: 'royal',
        })
      }
    }
  }

  // Entrega: solo entre las que dijeron en cuántos días.
  const conEntrega = cotizaciones.filter((c) => c.dias_entrega !== null)
  if (conEntrega.length > 1) {
    const dias = conEntrega.map((c) => Number(c.dias_entrega))
    const masRapida = Math.min(...dias)
    if (Math.max(...dias) > masRapida) {
      for (const c of conEntrega) {
        if (Number(c.dias_entrega) === masRapida) {
          anotar(c.id, {
            clave: 'entrega',
            etiqueta: 'Llega antes',
            detalle: `Entrega en ${masRapida} día${masRapida === 1 ? '' : 's'}.`,
            tono: 'neutral',
          })
        }
      }
    }
  }

  return mapa
}

function TarjetaCotizacion({
  cotizacion,
  ventajas,
  aprobada,
  puedeOperar,
  ocupado,
  onProponer,
  onRetirar,
  onEditar,
  onEliminar,
  onPdf,
}: {
  cotizacion: Cotizacion
  /** En qué gana esta cotización frente a las demás. Vacío si no gana en nada. */
  ventajas: Ventaja[]
  /** El gerente ya escogió esta. Distinto de propuesta: propuesta es antes. */
  aprobada: boolean
  puedeOperar: boolean
  /** Hay una petición en vuelo. El resto de la pantalla ya lo mira; esto faltaba. */
  ocupado: boolean
  onProponer: () => void
  onRetirar: () => void
  onEditar: () => void
  onEliminar: () => void
  onPdf: () => void
}) {
  /*
    Lo que el proveedor ofrece de verdad, resumido en una línea.

    Con dos cotizaciones del mismo proveedor —que desde el 27 de agosto
    conviven— el nombre de arriba ya no las distingue: lo que las distingue es
    justo esto, que uno ofrece Motul en bidón y el otro Chronus en barril. Sin
    esta línea las dos tarjetas se leen iguales.

    Se juntan las distintas y no se repite por renglón: la tarjeta compara
    ofertas, no las detalla. El detalle está en «Editar» y en el PDF.
  */
  const ofrece = [
    ...new Set(
      cotizacion.renglones
        .map((r) => [r.marca, r.presentacion].filter(Boolean).join(' · '))
        .filter(Boolean),
    ),
  ]

  return (
    <div
      className={cn(
        'rounded-card border p-3.5',
        cotizacion.propuesta || aprobada
          ? 'border-royal-600 bg-royal-600/5'
          : 'border-hairline',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ink/90 truncate text-base font-medium">
            {cotizacion.proveedor?.nombre ?? 'Proveedor'}
          </p>
          <p className="text-ink/50 text-xs">
            <span className="text-ink/45 font-mono">{cotizacion.numero}</span> ·{' '}
            {cotizacion.proveedor?.rif} · {fecha(cotizacion.fecha)}
            {cotizacion.numero_proveedor ? ` · s/n ${cotizacion.numero_proveedor}` : ''}
          </p>
        </div>
        {/*
          `flex-wrap` y sin `shrink-0`: con cinco chips —aprobada, propuesta y
          las tres ventajas— la fila medía más que la tarjeta, y como no podía
          encogerse ni partirse se salía por encima del borde. Ahora envuelve
          dentro de su bloque, y si aun así no cabe, el bloque entero baja
          debajo del nombre del proveedor.
        */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/*
            «Aprobada» a secas se leia como que la orden ya estaba dada. Dice
            quien aprobo y que: es la que el gerente escogio de entre las
            propuestas, y solo aparece cuando el pedido esta aprobado de verdad.
          */}
          {aprobada ? <Chip tone="success">La que aprobó el gerente</Chip> : null}
          {cotizacion.propuesta ? <Chip tone="royal">Propuesta al gerente</Chip> : null}
          {/*
            El detalle iba solo en `title`, que en un telefono no existe: no hay
            raton con el que pasar por encima. Se enseña al lado de la etiqueta,
            que ademas es lo que la vuelve util —«Mas economica» no dice cuanto,
            y con dos cotizaciones lo que se compara es cuanto—.
          */}
          {ventajas.map((v) => (
            <Chip key={v.clave} tone={v.tono} title={v.detalle}>
              {v.etiqueta}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <p className="text-ink/90 tabular text-xl font-semibold">
            {dinero(cotizacion.moneda, cotizacion.total)}
          </p>
          <p className="text-ink/45 tabular text-xs">
            {cotizacion.moneda === 'VES'
              ? dolares(cotizacion.total_usd)
              : bolivares(cotizacion.total_bs)}
          </p>
        </div>
        <dl className="text-ink/60 flex gap-4 text-xs">
          <div>
            <dt className="text-ink/40">Entrega</dt>
            <dd>{cotizacion.dias_entrega !== null ? `${cotizacion.dias_entrega} días` : '—'}</dd>
          </div>
          <div>
            <dt className="text-ink/40">IVA</dt>
            <dd className="tabular">{dinero(cotizacion.moneda, cotizacion.iva)}</dd>
          </div>
          <div>
            <dt className="text-ink/40">Validez</dt>
            <dd>{cotizacion.validez_dias} días</dd>
          </div>
        </dl>
      </div>

      {ofrece.length > 0 ? (
        <p className="text-ink/60 mt-2 text-sm">
          <span className="text-ink/40">Ofrece</span> {ofrece.join(' — ')}
        </p>
      ) : null}

      {cotizacion.observacion ? (
        <p className="text-ink/55 mt-2 text-sm">{cotizacion.observacion}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {/*
          El PDF no depende del permiso de compras y va el primero: es la
          cotización tal como se cargó, y sirve para mandarla por correo o
          enseñarla en una reunión sin tener que entrar al sistema.
        */}
        <Button size="sm" variant="ghost" icon={<Download />} onClick={onPdf}>
          PDF
        </Button>

        {puedeOperar ? (
          <>
            {/*
              PROPONER SUMA, NO SUSTITUYE. Antes esto era un botón que se
              apagaba —«Ya propuesta»— porque proponer otra desproponía esta.
              Ahora caben varias en la mesa del gerente, así que la pareja es
              proponer y retirar.
            */}
            {cotizacion.propuesta ? (
              <Button size="sm" variant="outline" disabled={ocupado} onClick={onRetirar}>
                Retirar la propuesta
              </Button>
            ) : (
              <Button size="sm" variant="soft" disabled={ocupado} onClick={onProponer}>
                Proponer al gerente
              </Button>
            )}
            {/*
              EDITAR Y ELIMINAR SE APAGAN CUANDO LA COTIZACIÓN ESTÁ PROPUESTA, y
              es la misma razón para los dos: el gerente aprobaría unas
              condiciones distintas de las que se le enseñaron. La base se niega
              igual —no hace falta que la pantalla acierte para que el control
              exista— pero enseñar un botón que va a rebotar manda a alguien a
              intentarlo para que le digan que no.

              Para corregir una propuesta se retira la propuesta primero, que
              ahora es un botón de al lado y no una explicación.
            */}
            {!cotizacion.propuesta ? (
              <>
                <Button size="sm" variant="ghost" disabled={ocupado} onClick={onEditar}>
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger"
                  disabled={ocupado}
                  onClick={onEliminar}
                >
                  Eliminar
                </Button>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function TarjetaInstruccion({
  instruccion,
  puedePagar,
  puedeCambiarMetodo,
  onPagar,
  onDevolver,
  onCambiarMetodo,
  onComprobante,
}: {
  instruccion: InstruccionPago
  puedePagar: boolean
  /** Corregir por dónde se paga sin retroceder la orden. */
  puedeCambiarMetodo: boolean
  onPagar: () => void
  onDevolver: () => void
  onCambiarMetodo: () => void
  /** Solo cuando ya está pagada: antes no hay nada que comprobar. */
  onComprobante: () => void
}) {
  const { data: metodos } = useMetodosPago()
  const i = instruccion

  return (
    <div className="border-hairline rounded-card border p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-ink/90 text-base font-medium">{nombreDelMetodo(metodos, i.metodo)}</p>
          <p className="text-ink/50 text-xs">Cargada el {fechaHora(i.creada_en)}</p>
        </div>
        <Chip
          tone={
            i.estado === 'PAGADA'
              ? 'success'
              : i.estado === 'POR_PAGAR'
                ? 'warning'
                : 'neutral'
          }
        >
          {i.estado === 'POR_PAGAR'
            ? 'Por pagar'
            : i.estado === 'PAGADA'
              ? 'Pagada'
              : i.estado === 'DEVUELTA'
                ? 'Devuelta a compras'
                : 'Anulada'}
        </Chip>
      </div>

      <p className="text-ink/90 tabular mt-2 text-xl font-semibold">
        {dinero(i.moneda, i.monto)}
      </p>
      {i.igtf_aplica ? (
        <p className="text-warning tabular text-xs">
          + IGTF 3% = {dinero(i.moneda, i.igtf_monto)}
        </p>
      ) : null}

      <dl className="text-ink/65 mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        {i.banco ? (
          <div className="flex gap-1.5">
            <dt className="text-ink/40">Banco</dt>
            <dd className="truncate">{i.banco}</dd>
          </div>
        ) : null}
        {i.numero_cuenta ? (
          <div className="flex gap-1.5">
            <dt className="text-ink/40">Cuenta</dt>
            <dd className="tabular truncate">{i.numero_cuenta}</dd>
          </div>
        ) : null}
        {i.telefono ? (
          <div className="flex gap-1.5">
            <dt className="text-ink/40">Teléfono</dt>
            <dd className="tabular">{i.telefono}</dd>
          </div>
        ) : null}
        {i.correo_binance ? (
          <div className="flex gap-1.5">
            <dt className="text-ink/40">Binance</dt>
            <dd className="truncate">{i.correo_binance}</dd>
          </div>
        ) : null}
        {i.red_cripto ? (
          <div className="flex gap-1.5">
            <dt className="text-ink/40">Red</dt>
            <dd>{i.red_cripto}</dd>
          </div>
        ) : null}
        {i.titular ? (
          <div className="flex gap-1.5">
            <dt className="text-ink/40">Titular</dt>
            <dd className="truncate">{i.titular}</dd>
          </div>
        ) : null}
        {i.receptor ? (
          <div className="flex gap-1.5">
            <dt className="text-ink/40">Recibe</dt>
            <dd className="truncate">{i.receptor}</dd>
          </div>
        ) : null}
        {i.documento ? (
          <div className="flex gap-1.5">
            <dt className="text-ink/40">Documento</dt>
            <dd className="tabular">{i.documento}</dd>
          </div>
        ) : null}
        {i.referencia ? (
          <div className="flex gap-1.5">
            <dt className="text-ink/40">Referencia</dt>
            <dd className="tabular truncate">{i.referencia}</dd>
          </div>
        ) : null}
        {i.fecha_pago ? (
          <div className="flex gap-1.5">
            <dt className="text-ink/40">Pagado el</dt>
            <dd>{fecha(i.fecha_pago)}</dd>
          </div>
        ) : null}
      </dl>

      {i.nota ? <p className="text-ink/55 mt-2 text-sm italic">«{i.nota}»</p> : null}
      {i.motivo_devolucion ? (
        <p className="text-danger mt-2 text-sm">Devuelta: {i.motivo_devolucion}</p>
      ) : null}

      {/* El comprobante solo existe cuando ya se pagó. Ofrecerlo antes
          sería ofrecer papel de algo que todavía no pasó. */}
      {i.estado === 'PAGADA' ? (
        <div className="mt-3">
          <Button size="sm" variant="outline" icon={<Printer />} onClick={onComprobante}>
            Comprobante de pago
          </Button>
        </div>
      ) : null}

      {i.estado === 'POR_PAGAR' && (puedePagar || puedeCambiarMetodo) ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {puedePagar ? (
            <Button size="sm" icon={<Check />} onClick={onPagar}>
              Registrar el pago
            </Button>
          ) : null}
          {/*
            Cambiar el método va ANTES de devolver a compras.

            Son las dos salidas cuando el pago no se puede hacer como está, y la
            de aquí es la barata: la orden no retrocede, sigue aprobada y sigue
            en la cola. Devolverla rehace un paso que estaba bien, así que se
            deja de última y sin destacar.
          */}
          {puedeCambiarMetodo ? (
            <Button size="sm" variant="outline" icon={<Repeat />} onClick={onCambiarMetodo}>
              Cambiar el método
            </Button>
          ) : null}
          {puedePagar ? (
            <Button size="sm" variant="ghost" className="text-danger" onClick={onDevolver}>
              Devolver a compras
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------

/*
  LA BITÁCORA NO PUEDE HABLAR EN MAYÚSCULAS

  `ETIQUETAS` solo nombra los estados de la solicitud y la orden. La bitácora
  registra además los de la cotización y los de cada instrucción de pago, y
  esos salían tal cual: «POR_PAGAR», «PAGADA», «REGISTRADA». Un historial que
  se lee «PAGO · POR_PAGAR · ADMINISTRADOR» no es un historial, es un volcado.

  Va por tipo de documento y no por estado a secas porque la misma palabra
  significa cosas distintas: una orden ANULADA se canceló antes de recibirse;
  un pago ANULADO no llegó a salir del banco.
*/
const NOMBRE_DEL_ESTADO: Record<string, Record<string, string>> = {
  COTIZACION: {
    REGISTRADA: 'Se cargó una cotización',
    ANULADA: 'Se quitó una cotización',
  },
  /*
    En una orden, dos de estas entradas no son estados: son el comprobante.

    Al declarar con qué respalda el proveedor, la base anota FACTURA o
    NOTA_ENTREGA en la misma columna donde anota los estados. En el historial
    salía una línea que decía «factura» a secas, que no cuenta nada de lo que
    pasó. Se nombra el acto, no el valor.
  */
  ORDEN: {
    FACTURA: 'El proveedor respalda con factura',
    NOTA_ENTREGA: 'El proveedor respalda con nota de entrega',
  },
  PAGO: {
    POR_PAGAR: 'Pago instruido a tesorería',
    PAGADA: 'Tesorería ejecutó el pago',
    DEVUELTA: 'Tesorería devolvió el pago a compras',
    ANULADA: 'Se anuló el pago autorizado',
  },
}

function comoSeLlama(documento: string, estado: string): string {
  return (
    NOMBRE_DEL_ESTADO[documento]?.[estado] ??
    ETIQUETAS[estado]?.texto ??
    // Si aparece uno nuevo, al menos que no grite: sin guiones bajos y en
    // minúscula, que se lee como una frase a medias y no como un código.
    estado.replace(/_/g, ' ').toLowerCase()
  )
}

export function DetalleCompra() {
  const { id } = useParams()
  const navegar = useNavigate()
  const compraId = Number(id)
  const { data: compra, isPending, error } = useCompra(compraId)
  const orden = ordenVigente(compra ?? undefined)

  /*
    Sin factura ni nota de entrega el material no entra.

    Lo pidio la lider: «intentan guardar sin subir nada -> el sistema muestra
    error (porque falta la factura o nota de entrega)». La reja de verdad esta en
    `registrar_recepcion`, que es la unica puerta; esto es para decirlo antes de
    que alguien llene el formulario con el camion esperando.
  */
  const papeles = usePapelesDeCompra(orden?.id)
  const hayPapelDelProveedor = (papeles.data ?? []).some(
    (x) => x.tipo === 'FACTURA' || x.tipo === 'NOTA_ENTREGA',
  )
  const { data: bitacora } = useBitacora(compraId, orden?.id)
  const { data: perfiles } = usePerfiles()
  const { data: firmas } = useFirmas()
  const { data: empresa } = useEmpresa()
  const { data: articulos } = useArticulos()
  const { data: metodosDePago } = useMetodosPago()
  const [pdf, setPdf] = useState<PdfArmado | null>(null)
  // Se marca a mano cada vez: no se recuerda de una aprobacion a la siguiente.
  const [bajoAutorizacion, setBajoAutorizacion] = useState(false)
  /*
    Cuál de las propuestas aprueba el gerente.

    Nulo mientras no escoja, y con una sola propuesta se queda nulo para
    siempre: la base la toma sola y no hay nada que preguntar. Preguntar
    igualmente sería pedirle que confirme que el único camino es el único
    camino.
  */
  const [cualAprobar, setCualAprobar] = useState<number | null>(null)
  const [respaldo, setRespaldo] = useState<File | null>(null)
  const { puede } = useMisRoles()
  const { puede: alcanza } = useMisAcciones()
  const misAutorizaciones = useMisAutorizaciones()

  const enviar = useEnviarPedido()
  const confirmar = useConfirmarPedido()
  const cancelarPedido = useCancelarPedido()
  const proponer = useProponerCotizacion()
  const retirar = useRetirarCotizacion()
  const declarar = useDeclararComprobante()
  const eliminarCotizacion = useEliminarCotizacion()
  const aprobar = useAprobarCompra()
  const respaldar = useRespaldarAutorizacion()
  const devolver = useDevolverACotizacion()
  const devolverPago = useDevolverInstruccion()
  const cancelarOrden = useCancelarOrden()
  const desistir = useMarcarDesistimiento()
  const resolver = useResolverDesistimiento()

  const [modal, setModal] = useState<
    | null
    | { tipo: 'cotizacion'; corregir?: Cotizacion }
    | { tipo: 'pago' }
    | { tipo: 'recepcion' }
    | { tipo: 'cancelar-pedido' }
    | { tipo: 'devolver-gerencia' }
    | { tipo: 'cancelar-orden' }
    | { tipo: 'desistir' }
    | { tipo: 'resolver' }
    | { tipo: 'registrar-pago'; instruccion: InstruccionPago }
    | { tipo: 'devolver-instruccion'; instruccion: InstruccionPago }
    | { tipo: 'cambiar-metodo'; instruccion: InstruccionPago }
  >(null)

  const [resolucion, setResolucion] = useState('REEMBOLSADO')

  /*
    LA ORDEN, EN PAPEL

    Es el único documento que sale de Compras y el que de verdad hace falta
    fuera del sistema: sin él, al proveedor se le pide por teléfono y no queda
    constancia de a qué precio ni en cuánto tiempo se acordó.

    Se arma con el mismo generador que la factura y la nota de entrega, no con
    uno propio. Si se maquetara aparte, en seis meses la orden y la factura de
    la misma empresa se verían como de dos empresas distintas.
  */
  /*
    LA ORDEN, EN PAPEL

    Es el documento que de verdad hace falta fuera del sistema: sin él, al
    proveedor se le pide por teléfono y no queda constancia de a qué precio ni
    en cuánto tiempo se acordó.

    Desde hoy sale con la forma que mandó la líder de sistemas —título negro
    sobre blanco, bloque de condiciones, tabla con cabecera teñida— y no con la
    del generador de ventas. Son papeles distintos y van a manos distintas: uno
    lo firma un cliente, el otro un proveedor.
  */
  /** El nombre detrás de un identificador de usuario, para el papel. */
  const quienEs = (id: string | null | undefined) =>
    id ? ((perfiles ?? []).find((x) => x.id === id)?.nombre ?? null) : null

  /*
    LA COTIZACIÓN, EN PAPEL

    Se pidió para poder mandarla por correo o llevarla a una reunión sin entrar
    al sistema. Sale con el mismo membrete que la orden —son papeles de la
    misma casa— pero sin firma y con un pie que dice que es nuestra
    transcripción: el que vale sigue siendo el papel del proveedor.

    El sello dice en qué punto está, que es lo primero que se pregunta quien la
    recibe en una reunión.
  */
  const imprimirCotizacion = async (c: Cotizacion) => {
    if (!compra) return

    setPdf(
      await armarCotizacionDeCompra({
        numero: c.numero,
        refPedido: compra.numero,
        numeroProveedor: c.numero_proveedor,
        fecha: fecha(c.fecha),
        proveedor: {
          nombre: c.proveedor?.nombre ?? '',
          rif: c.proveedor?.rif ?? '',
        },
        condiciones: {
          tituloPedido: compra.titulo,
          validezDias: c.validez_dias,
          diasEntrega: c.dias_entrega,
          condicionPago:
            CONDICIONES_PAGO.find((x) => x.valor === c.condicion_pago)?.etiqueta ??
            c.condicion_pago,
          cargadaPor: quienEs(c.registrada_por),
        },
        moneda: c.moneda,
        tasa: c.tasa,
        // Los renglones de la cotización no traen la descripción: la tienen los
        // del pedido, que es de donde salen. Se cruzan por
        // `solicitud_renglon_id`, que es lo que los une.
        renglones: c.renglones.map((r) => {
          const pedido = compra.renglones.find((x) => x.id === r.solicitud_renglon_id)
          return {
            descripcion: pedido?.descripcion ?? '—',
            marca: r.marca,
            presentacion: r.presentacion,
            cantidad: r.cantidad,
            unidad: pedido?.unidad ?? '',
            precioUnitario: r.precio_unitario,
            subtotal: r.subtotal,
            exento: r.exento_iva,
          }
        }),
        subtotal: c.subtotal,
        descuento: c.descuento,
        flete: c.flete,
        iva: c.iva,
        alicuota: c.alicuota_iva,
        total: c.total,
        observaciones: c.observacion,
        sello: c.propuesta
          ? 'PROPUESTA AL GERENTE'
          : compra.cotizacion_elegida_id === c.id
            ? 'APROBADA'
            : null,
        empresa: empresaDelPapel(empresa),
        momento: new Date(),
      }),
    )
  }

  const imprimirOrden = async () => {
    if (!compra || !orden) return

    setPdf(
      await armarOrdenDeCompra({
        autoriza: {
          nombre: quienEs(compra.aprobada_gg_por),
          imagen: compra.aprobada_gg_por ? (firmas?.porPerfil[compra.aprobada_gg_por] ?? null) : null,
          porAutorizacionDe: quienEs(compra.aprobada_por_autorizacion_de),
        },
        numero: orden.numero,
        refPedido: compra.numero,
        emitida: fechaHora(orden.creada_en),
        proveedor: {
          nombre: orden.proveedor?.nombre ?? '',
          rif: orden.proveedor?.rif ?? '',
          telefono: orden.proveedor?.telefono ?? null,
          direccion: orden.proveedor?.direccion ?? null,
        },
        condiciones: {
          unidadSolicitante: compra.destino,
          // Cuando quien pide tiene usuario, su nombre no se copia en la
          // solicitud: vive en su perfil. Se busca antes de rendirse a «—».
          solicitante: compra.solicitante_nombre ?? quienEs(compra.solicitante_id),
          fechaSolicitud: fechaHora(compra.creada_en),
          finalidad: compra.justificacion,
          notas: compra.titulo,
          clasificacion: compra.prioridad,
          entregaPrometida: orden.entrega_estimada ? fecha(orden.entrega_estimada) : null,
          condicionPago:
            CONDICIONES_PAGO.find((c) => c.valor === orden.condicion_pago)?.etiqueta ??
            orden.condicion_pago,
          documentos:
            orden.comprobante_tipo === 'FACTURA'
              ? 'Factura'
              : orden.comprobante_tipo === 'NOTA_ENTREGA'
                ? 'Nota de entrega'
                : null,
          aprobadaPor: quienEs(compra.confirmada_por),
          aprobadaEl: compra.confirmada_en ? fechaHora(compra.confirmada_en) : null,
          confirmadaPor: quienEs(compra.aprobada_gg_por),
          confirmadaEl: compra.aprobada_gg_en ? fechaHora(compra.aprobada_gg_en) : null,
        },
        moneda: orden.moneda,
        renglones: (orden.renglones ?? [])
          .slice()
          .sort((a, b) => a.linea - b.linea)
          .map((r) => {
            const art = (articulos ?? []).find((a) => a.id === r.articulo_id)
            return {
              // Sin artículo del catálogo no hay SKU: el renglón se describió
              // a mano porque lo que se pide no está dado de alta todavía.
              sku: art?.codigo ?? '—',
              descripcion: r.descripcion,
              categoria: art?.categoria ?? '—',
              cantidad: r.cantidad,
              unidad: r.unidad,
              precioUnitario: r.precio_unitario,
              subtotal: r.subtotal,
            }
          }),
        subtotal: orden.subtotal,
        descuento: orden.descuento,
        flete: orden.flete,
        iva: orden.iva,
        total: orden.total,
        observaciones: compra.justificacion,
        sello:
          orden.estado === 'ANULADA' || orden.estado === 'CANCELADA' ? 'ANULADA' : null,
        empresa: empresaDelPapel(empresa),
        momento: new Date(),
      }),
    )
  }

  /*
    EL COMPROBANTE DE PAGO

    Lo pide quien tiene que demostrar que se pagó: al proveedor que reclama, o
    a quien revisa las cuentas meses después. Sale de la instrucción, no de la
    orden, porque una orden se puede pagar en varias veces y cada pago tiene su
    propio comprobante.
  */
  const imprimirComprobante = async (i: InstruccionPago) => {
    if (!compra || !orden) return

    setPdf(
      await armarComprobanteDePago({
        ordenNumero: orden.numero,
        pedidoNumero: compra.numero,
        proveedor: orden.proveedor?.nombre ?? '',
        solicitante: compra.solicitante_nombre ?? quienEs(compra.solicitante_id),
        condicionPago:
          CONDICIONES_PAGO.find((c) => c.valor === orden.condicion_pago)?.etiqueta ??
          orden.condicion_pago,
        totalOrden: orden.total,
        monedaOrden: orden.moneda,
        metodo: nombreDelMetodo(metodosDePago, i.metodo),
        montoPagado: i.monto,
        monedaPago: i.moneda,
        // La instrucción guarda la fecha del pago, no la hora ni quién lo
        // ejecutó: eso vive en la bitácora. Se imprime lo que sabe.
        fechaPago: fecha(i.fecha_pago ?? orden.fecha_pago ?? ''),
        pagadoPor: null,
        comprobanteAdjunto: i.referencia ?? null,
        empresa: {
          razonSocial: empresa?.razon_social ?? '',
          rif: empresa?.rif ?? '',
        },
        momento: new Date(),
      }),
    )
  }

  if (isPending) return <Cargando texto="Cargando la compra…" />
  if (error) return <ErrorDeCarga error={error} />
  /*
    El pedido no está. Es un final normal, no un fallo: se llega aquí desde una
    notificación vieja, un enlace guardado o un número tecleado a mano — y ahora
    también desde un aviso de algo que se borró.

    Se dice qué pasó y se ofrece la salida, en vez de dejar a alguien mirando un
    cartel sin nada que pulsar.
  */
  if (!compra)
    return (
      <Vacio
        icono={<ShoppingCart />}
        titulo="Ese pedido ya no está"
        descripcion="Puede que lo hayan cancelado o borrado. Si llegaste desde un aviso, ese aviso quedó viejo."
        accion={
          <Link to="/app/compras">
            <Button variant="outline">Ver los pedidos</Button>
          </Link>
        }
      />
    )

  const nombreDe = (uid: string | null) =>
    (uid && perfiles?.find((p) => p.id === uid)?.nombre) || '—'

  // Quien pide puede no tener usuario: entonces su nombre está escrito a mano.
  const solicitante = compra.solicitante_id
    ? nombreDe(compra.solicitante_id)
    : (compra.solicitante_nombre ?? '—')

  const solicitanteCargo =
    compra.solicitante_cargo ??
    (compra.solicitante_id
      ? (perfiles?.find((p) => p.id === compra.solicitante_id)?.cargo ?? null)
      : null)

  const cotizaciones = compra.cotizaciones ?? []
  const comparacion = compararCotizaciones(cotizaciones)
  // Las que estan en la mesa del gerente. Antes era una y vivia en el pedido;
  // ahora son las que lleven el marbete, y pueden ser varias.
  const propuestas = cotizaciones.filter((c) => c.propuesta)

  const estadoVisible = orden ? orden.estado : compra.estado
  const etiqueta = ETIQUETAS[estadoVisible] ?? { texto: estadoVisible, tono: 'neutral' as const }

  // La columna de recibido solo aparece cuando ya hay algo que recibir: antes
  // del pago sería una columna de ceros.
  const muestraRecibido = [
    'PAGADA_POR_RECIBIR', 'RECIBIDA_PARCIAL', 'RECIBIDA',
    // Contra entrega recibe antes de pagar, asi que lo recibido importa
    // desde que la orden existe y no solo despues del pago.
    'POR_RECIBIR', 'POR_INDICAR_PAGO', 'EN_TESORERIA',
  ].includes(
    orden?.estado ?? '',
  )

  const puedeCompras = puede('COMPRAS')
  const puedeGerente = puede('GERENTE_GENERAL')

  /*
    Aprobar ya no se pregunta por el rol, sino por la casilla.

    Es lo que deja entrar a quien tenga la autorizacion extendida — el caso que
    pidio la lider con Jesmary—. Para quien le compete por su puesto no cambia
    nada: la casilla va sembrada en el gerente general.
  */
  const puedeAprobar = alcanza('COMPRAS.APROBAR_COMPRA')
  const autorizaAprobar = misAutorizaciones.de('COMPRAS.APROBAR_COMPRA')
  const puedeCambiarMetodo = alcanza('COMPRAS.CAMBIAR_METODO_PAGO')

  return (
    <>
      <PageHeader
        title={compra.titulo}
        description={`${compra.numero}${orden ? ` · Orden ${orden.numero}` : ''} · pedido por ${solicitante}${solicitanteCargo ? ` (${solicitanteCargo})` : ''}`}
        actions={
          <>
            {/* Aquí se cotiza, se aprueba y se paga, y las tres cosas congelan
                la tasa en la fila. Verla sin salir de la pantalla evita el
                error caro: emitir un lunes con la tasa del viernes. */}
            <ChipTasa className="self-center" />
            {/*
              CORREGIR EL PEDIDO, TAMBIÉN DESPUÉS DE ENVIARLO.

              Lo pidió Jesmary: una unidad mal puesta obligaba a cancelar el
              pedido entero y volver a teclear los siete renglones.

              Se ofrece hasta CONFIRMADA y solo mientras no haya cotizaciones.
              Lo segundo no es prudencia: los renglones de una cotización
              cuelgan de los del pedido con borrado en cascada, y corregir aquí
              los rehace — se llevaría las cotizaciones por delante sin dar un
              solo error. La base se niega igual; aquí no se ofrece el botón
              para no mandar a nadie a que le digan que no.
            */}
            {puedeCompras &&
            ['BORRADOR', 'PEDIDO', 'CONFIRMADA'].includes(compra.estado) &&
            cotizaciones.length === 0 ? (
              <Link to={`/app/compras/${compra.id}/editar`}>
                <Button variant="outline" icon={<Pencil />}>
                  Corregir
                </Button>
              </Link>
            ) : null}
            <Link to="/app/compras">
              <Button variant="outline" icon={<ArrowLeft />}>
                Tablero
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ---------------- Columna principal ----------------

            `min-w-0` no es cosmético: como elemento de cuadrícula, el mínimo
            por defecto es el ancho mínimo del contenido, y las tablas de aquí
            declaran 520px. Sin esto, la columna mide 520 en un teléfono de
            375 y la página entera se desplaza a lo ancho, aunque cada tabla
            tenga su propio contenedor con scroll. */}
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Qué se pidió"
              subtitle={compra.destino ? `Destino: ${compra.destino}` : undefined}
              action={<Chip tone={etiqueta.tono}>{etiqueta.texto}</Chip>}
            />

            <p className="text-ink/70 mt-3 text-base leading-relaxed">{compra.justificacion}</p>

            <div className="-mx-5 mt-4 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-ink/45 border-hairline border-y text-left text-xs">
                    <th className="py-2 pr-3 pl-5 font-medium">Descripción</th>
                    <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                    <th className="py-2 pr-5 pl-3 font-medium">Unidad</th>
                  </tr>
                </thead>
                <tbody>
                  {compra.renglones
                    ?.slice()
                    .sort((a, b) => a.linea - b.linea)
                    .map((r) => (
                      <tr key={r.id} className="border-hairline border-b last:border-0">
                        <td className="text-ink/85 py-2.5 pr-3 pl-5">
                          {r.descripcion}
                          {r.observacion ? (
                            <span className="text-ink/45 block text-xs">{r.observacion}</span>
                          ) : null}
                        </td>
                        <td className="tabular text-ink/85 px-3 py-2.5 text-right">{r.cantidad}</td>
                        <td className="text-ink/55 py-2.5 pr-5 pl-3">{r.unidad}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>

          {['CONFIRMADA', 'POR_CONFIRMAR_GERENTE', 'APROBADA'].includes(compra.estado) ? (
            <Card>
              <CardHeader
                title="Cotizaciones"
                /*
                  Cuenta cotizaciones y no proveedores: desde que un proveedor
                  puede mandar dos ofertas, «3 proveedores» sobre dos empresas
                  distintas era sencillamente falso.
                */
                /*
                  Con dos o mas se dice que las etiquetas comparan.

                  Sin eso, la tarjeta que gana en todo sale con tres etiquetas y
                  la otra con ninguna, y quien lo lee no sabe si a la segunda le
                  falta algo. Comparan; la que no las lleva no gana en nada, que
                  no es lo mismo que estar incompleta.
                */
                subtitle={
                  cotizaciones.length === 0
                    ? 'Ninguna todavía'
                    : [
                        `${cotizaciones.length} cotización${cotizaciones.length === 1 ? '' : 'es'}`,
                        propuestas.length > 0 ? `${propuestas.length} con el gerente` : null,
                        cotizaciones.length > 1
                          ? 'las etiquetas dicen en qué gana cada una'
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                }
                action={
                  puedeCompras && compra.estado !== 'APROBADA' ? (
                    <Button size="sm" variant="soft" onClick={() => setModal({ tipo: 'cotizacion' })}>
                      Cargar cotización
                    </Button>
                  ) : undefined
                }
              />

              <div className="mt-4 space-y-3">
                {cotizaciones.length === 0 ? (
                  <Vacio
                    icono={<FileText />}
                    titulo="Sin cotizaciones"
                    descripcion="Carga lo que manden los proveedores. Con dos o más, la comparación se hace sola."
                  />
                ) : null}

                {cotizaciones.map((c) => (
                  <TarjetaCotizacion
                    key={c.id}
                    cotizacion={c}
                    ventajas={comparacion.get(c.id) ?? []}
                    /*
                      Se pregunta tambien por el estado del pedido.

                      `cotizacion_elegida_id` cambio de significado al permitir
                      varias propuestas —antes decia «la que compras propone» y
                      ahora «la que el gerente aprobo»— y un pedido esperando en
                      la gerencia aparecio con una cotizacion marcada
                      «Aprobada». No lo estaba. Con el estado delante, la
                      etiqueta no puede volver a adelantarse a la decision
                      aunque la columna traiga algo viejo.
                    */
                    aprobada={
                      compra.estado === 'APROBADA' && compra.cotizacion_elegida_id === c.id
                    }
                    puedeOperar={puedeCompras && compra.estado !== 'APROBADA'}
                    ocupado={
                      proponer.isPending || retirar.isPending || eliminarCotizacion.isPending
                    }
                    onProponer={() =>
                      void proponer.mutate({ solicitud_id: compra.id, cotizacion_id: c.id })
                    }
                    onRetirar={() => void retirar.mutate({ id: c.id })}
                    onEditar={() => setModal({ tipo: 'cotizacion', corregir: c })}
                    onEliminar={() => void eliminarCotizacion.mutate({ id: c.id })}
                    onPdf={() => void imprimirCotizacion(c)}
                  />
                ))}
              </div>

              {proponer.error ? <ErrorDeCarga error={proponer.error} className="mt-3" /> : null}
              {retirar.error ? <ErrorDeCarga error={retirar.error} className="mt-3" /> : null}
              {eliminarCotizacion.error ? (
                <ErrorDeCarga error={eliminarCotizacion.error} className="mt-3" />
              ) : null}
            </Card>
          ) : null}

          {orden ? (
            <Card>
              <CardHeader
                title={`Orden ${orden.numero}`}
                subtitle={`${orden.proveedor?.nombre ?? ''} · aprobada el ${fecha(orden.creada_en.slice(0, 10))}`}
                action={
                  <span className="flex flex-wrap items-center justify-end gap-2">
                    {/*
                      LA FACTURA NACE AQUÍ

                      Christopher: «si creas nada más la factura sin lo que la
                      motiva y los pasos previos, ¿qué significa?». Por eso la
                      lista de facturas ya no deja crear ninguna: se registra
                      desde la orden, que es la que dice qué se pidió, a quién
                      y por cuánto, y de ahí sale ya atada.

                      Solo cuando el proveedor dijo que respalda con factura.
                      Si respalda con nota de entrega no hay factura que
                      registrar, y ofrecerlo sería invitar a inventarla.
                    */}
                    {orden.comprobante_tipo === 'FACTURA' &&
                    puedeCompras ? (
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<Receipt />}
                        onClick={() =>
                          navegar(
                            `/app/compras/facturas?orden=${orden.id}&proveedor=${orden.proveedor?.id ?? ''}&moneda=${orden.moneda}`,
                          )
                        }
                      >
                        Registrar factura
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Printer />}
                      onClick={() => void imprimirOrden()}
                    >
                      Imprimir
                    </Button>
                    <Chip tone={ETIQUETAS[orden.estado]?.tono ?? 'neutral'}>
                      {ETIQUETAS[orden.estado]?.texto ?? orden.estado}
                    </Chip>
                  </span>
                }
              />

              <div className="-mx-5 mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="text-ink/45 border-hairline border-y text-left text-xs">
                      <th className="py-2 pr-3 pl-5 font-medium">Descripción</th>
                      <th className="px-3 py-2 text-right font-medium">Cant.</th>
                      {muestraRecibido ? (
                        <th className="px-3 py-2 text-right font-medium">Recibido</th>
                      ) : null}
                      <th className="px-3 py-2 text-right font-medium">Precio</th>
                      <th className="py-2 pr-5 pl-3 text-right font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orden.renglones
                      ?.slice()
                      .sort((a, b) => a.linea - b.linea)
                      .map((r) => (
                        <tr key={r.id} className="border-hairline border-b last:border-0">
                          <td className="text-ink/85 py-2.5 pr-3 pl-5">{r.descripcion}</td>
                          <td className="tabular text-ink/85 px-3 py-2.5 text-right">
                            {r.cantidad} {r.unidad}
                          </td>
                          {muestraRecibido ? (
                            <td
                              className={cn(
                                'tabular px-3 py-2.5 text-right',
                                Number(r.cantidad_recibida) >= Number(r.cantidad)
                                  ? 'text-success'
                                  : Number(r.cantidad_recibida) > 0
                                    ? 'text-warning'
                                    : 'text-ink/40',
                              )}
                            >
                              {r.cantidad_recibida}
                            </td>
                          ) : null}
                          <td className="tabular text-ink/70 px-3 py-2.5 text-right">
                            {dinero(orden.moneda, r.precio_unitario)}
                          </td>
                          <td className="tabular text-ink/85 py-2.5 pr-5 pl-3 text-right">
                            {dinero(orden.moneda, r.subtotal)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              <dl className="border-hairline mt-4 space-y-1 border-t pt-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink/55">Subtotal</dt>
                  <dd className="tabular text-ink/80">{dinero(orden.moneda, orden.subtotal)}</dd>
                </div>
                {Number(orden.descuento) > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-ink/55">Descuento</dt>
                    <dd className="tabular text-ink/80">
                      −{dinero(orden.moneda, orden.descuento)}
                    </dd>
                  </div>
                ) : null}
                {Number(orden.flete) > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-ink/55">Flete</dt>
                    <dd className="tabular text-ink/80">{dinero(orden.moneda, orden.flete)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <dt className="text-ink/55">IVA</dt>
                  <dd className="tabular text-ink/80">{dinero(orden.moneda, orden.iva)}</dd>
                </div>
                <div className="border-hairline flex justify-between border-t pt-1.5">
                  <dt className="text-ink/85 font-semibold">Total</dt>
                  <dd className="tabular text-ink/90 font-semibold">
                    {dinero(orden.moneda, orden.total)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink/45 text-xs">Equivalente</dt>
                  <dd className="tabular text-ink/45 text-xs">
                    {orden.moneda === 'VES' ? dolares(orden.total_usd) : bolivares(orden.total_bs)}
                  </dd>
                </div>
              </dl>

              {orden.desistio_motivo ? (
                <div className="border-danger/25 bg-danger-soft mt-4 rounded-[6px] border p-3">
                  <p className="text-danger text-sm font-medium">El proveedor desistió</p>
                  <p className="text-ink/75 mt-1 text-sm">{orden.desistio_motivo}</p>
                  <p className="text-ink/55 mt-1 text-xs">
                    {orden.desistio_resolucion === 'PENDIENTE'
                      ? 'El dinero todavía no se ha resuelto.'
                      : orden.desistio_resolucion === 'REEMBOLSADO'
                        ? 'El proveedor devolvió el dinero.'
                        : orden.desistio_resolucion === 'SALDO_FAVOR'
                          ? 'Queda como saldo a favor con el proveedor.'
                          : 'Se dio por perdido.'}
                    {orden.desistio_nota ? ` ${orden.desistio_nota}` : ''}
                  </p>
                </div>
              ) : null}
            </Card>
          ) : null}

          {orden && orden.instrucciones.length > 0 ? (
            <Card>
              <CardHeader
                title="Pagos"
                subtitle="Lo que compras autorizó pagar y lo que tesorería ya pagó."
              />
              <div className="mt-4 space-y-3">
                {orden.instrucciones
                  .slice()
                  .sort((a, b) => a.creada_en.localeCompare(b.creada_en))
                  .map((i) => (
                    <TarjetaInstruccion
                      key={i.id}
                      instruccion={i}
                      puedePagar={puedeCompras}
                      puedeCambiarMetodo={puedeCambiarMetodo}
                      onPagar={() => setModal({ tipo: 'registrar-pago', instruccion: i })}
                      onDevolver={() => setModal({ tipo: 'devolver-instruccion', instruccion: i })}
                      onCambiarMetodo={() => setModal({ tipo: 'cambiar-metodo', instruccion: i })}
                      onComprobante={() => void imprimirComprobante(i)}
                    />
                  ))}
              </div>
            </Card>
          ) : null}

          {/*
            Los papeles cuelgan de la orden, así que hasta que no hay orden no
            hay dónde colgarlos. Antes de aprobar no ha llegado ninguno: no hay
            comprobante de un pago que no se hizo ni nota de entrega de un
            camión que no salió.
          */}
          {orden ? (
            <PapelesDeCompra
              ordenId={orden.id}
              puedeCargar={puedeCompras || puede('ALMACEN')}
              puedeQuitar={puedeCompras}
              puedeRespaldar={puedeAprobar && !!compra.aprobada_por_autorizacion_de}
            />
          ) : null}

          <Card>
            <CardHeader title="Historial" subtitle="Quién movió esta compra y cuándo." />
            <ol className="mt-4 space-y-3">
              {(bitacora ?? []).map((e) => (
                <li key={`${e.documento_tipo}-${e.id}`} className="flex gap-3">
                  <div className="mt-1.5 flex flex-col items-center">
                    <span className="bg-royal-600 size-2 rounded-full" />
                    <span className="bg-hairline w-px flex-1" />
                  </div>
                  <div className="min-w-0 pb-1">
                    <p className="text-ink/85 text-sm">
                      {comoSeLlama(e.documento_tipo, e.estado_nuevo)}
                      <span className="text-ink/45"> · {nombreDe(e.actor_id)}</span>
                    </p>
                    <p className="text-ink/45 text-xs">{fechaHora(e.ocurrido_en)}</p>
                    {e.nota ? <p className="text-ink/60 mt-0.5 text-sm">«{e.nota}»</p> : null}
                  </div>
                </li>
              ))}
              {(bitacora ?? []).length === 0 ? (
                <li className="text-ink/45 flex items-center gap-2 text-sm">
                  <History className="size-4" /> Sin movimientos todavía.
                </li>
              ) : null}
            </ol>
          </Card>
        </div>

        {/* ---------------- Panel de acciones ----------------

            `contents` en móvil disuelve esta columna para que sus dos tarjetas
            sean elementos de la cuadrícula por separado. Así la acción que toca
            ahora sube al principio —en el teléfono, tenerla al final obliga a
            recorrer el documento entero para poder tocar el botón— y los datos
            de cabecera bajan al final, que es donde se consultan. En escritorio
            vuelven a ser una columna. */}
        <div className="contents lg:flex lg:flex-col lg:gap-4">
          <Card className="order-first lg:order-none">
            <CardHeader title="Qué sigue" />

            <div className="mt-4 space-y-2">
              {compra.estado === 'BORRADOR' ? (
                <>
                  <p className="text-ink/60 mb-3 text-sm">
                    Todavía es un borrador: nadie más lo ve en el tablero hasta que lo envíes.
                  </p>
                  <Button
                    block
                    icon={<Send />}
                    disabled={enviar.isPending}
                    onClick={() => void enviar.mutate({ id: compra.id })}
                  >
                    Enviar el pedido
                  </Button>
                </>
              ) : null}

              {compra.estado === 'PEDIDO' ? (
                puedeCompras ? (
                  <>
                    <p className="text-ink/60 mb-3 text-sm">
                      Confirmar significa que la compra procede y que se van a pedir precios.
                    </p>
                    <Button
                      block
                      icon={<Check />}
                      disabled={confirmar.isPending}
                      onClick={() => void confirmar.mutate({ id: compra.id })}
                    >
                      Confirmar el pedido
                    </Button>
                  </>
                ) : (
                  <p className="text-ink/60 text-sm">Esperando que compras lo confirme.</p>
                )
              ) : null}

              {compra.estado === 'CONFIRMADA' ? (
                puedeCompras ? (
                  <>
                    <p className="text-ink/60 mb-3 text-sm">
                      Carga las cotizaciones que manden los proveedores y propón una al gerente
                      general.
                    </p>
                    <Button block icon={<FileText />} onClick={() => setModal({ tipo: 'cotizacion' })}>
                      Cargar cotización
                    </Button>
                  </>
                ) : (
                  <p className="text-ink/60 text-sm">
                    Compras está pidiendo precios a los proveedores.
                  </p>
                )
              ) : null}

              {compra.estado === 'POR_CONFIRMAR_GERENTE' ? (
                puedeAprobar ? (
                  <>
                    {/*
                      CON VARIAS PROPUESTAS, EL GERENTE ESCOGE AQUÍ.

                      Compras puede subir dos o tres ofertas, que es de lo que
                      trata comparar. La base se niega a elegir por su cuenta
                      cuando hay más de una —escoger por el gerente sería
                      firmarle una compra que no decidió— así que la pantalla
                      tiene que preguntarlo antes de dejar pulsar.

                      Con una sola no se pregunta nada y el texto es el de
                      siempre: no hay elección que hacer.
                    */}
                    {propuestas.length > 1 ? (
                      <div className="mb-3">
                        <p className="text-ink/60 mb-2 text-sm">
                          Compras subió {propuestas.length} cotizaciones. Escoge cuál se aprueba:
                        </p>
                        <div className="space-y-1.5">
                          {propuestas.map((c) => (
                            <label
                              key={c.id}
                              className={cn(
                                'flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-2.5 text-sm',
                                cualAprobar === c.id
                                  ? 'border-royal-600 bg-royal-600/5'
                                  : 'border-hairline',
                              )}
                            >
                              <input
                                type="radio"
                                name="cual-aprobar"
                                className="accent-royal-600 mt-0.5 size-4 shrink-0"
                                checked={cualAprobar === c.id}
                                onChange={() => setCualAprobar(c.id)}
                              />
                              <span className="min-w-0">
                                <span className="text-ink/85 block truncate font-medium">
                                  {c.proveedor?.nombre ?? 'Proveedor'}
                                </span>
                                <span className="text-ink/55 block text-xs">
                                  <span className="tabular">
                                    {dinero(c.moneda, c.total)}
                                  </span>
                                  {c.dias_entrega !== null ? ` · ${c.dias_entrega} días` : ''}
                                  {' · '}
                                  <span className="font-mono">{c.numero}</span>
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-ink/60 mb-3 text-sm">
                        Al aprobar se emite la orden de compra por{' '}
                        <strong className="text-ink/85">
                          {dinero(propuestas[0]?.moneda, propuestas[0]?.total ?? 0)}
                        </strong>
                        . A partir de ahí, el precio queda fijo.
                      </p>
                    )}
                    {/*
                      El check que pidio la lider, y solo cuando es verdad.

                      A quien le compete aprobar no se le pide que declare nada.
                      A quien lo hace con un permiso extendido si, y con el
                      nombre de quien se lo extendio delante: es lo que va a
                      quedar impreso en la orden, y quien lo firma tiene que
                      haberlo leido antes de pulsar.
                    */}
                    {autorizaAprobar ? (
                      <label
                        className={cn(
                          'mb-3 flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm',
                          bajoAutorizacion ? 'border-warning/30 bg-warning-soft' : 'border-hairline',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={bajoAutorizacion}
                          onChange={(e) => setBajoAutorizacion(e.target.checked)}
                          className="accent-royal-600 mt-0.5 size-4 shrink-0"
                        />
                        <span className="text-ink/80">
                          Autorizada bajo autorización del gerente general
                          <span className="text-ink/50 mt-0.5 block text-xs">
                            {autorizaAprobar.por_nombre} te lo autorizó
                            {autorizaAprobar.hasta ? ` hasta el ${fecha(autorizaAprobar.hasta)}` : ''}
                            . Va a quedar escrito en la orden.
                          </span>
                        </span>
                      </label>
                    ) : null}
                    {/*
                      El respaldo, y SOLO para quien aprueba con permiso
                      extendido.

                      Lo acotó Christopher: a quien le compete aprobar por su
                      puesto no se le pide que certifique nada, así que el campo
                      no existe para él. Aparece donde la acción la toma alguien
                      con un permiso especial, que es de quien puede hacer falta
                      saber en qué se apoyó.

                      Es opcional y por eso no bloquea el botón. Se sube DESPUÉS
                      de aprobar porque los papeles cuelgan de la orden y la
                      orden nace al aprobar: antes no hay dónde colgarlo.
                    */}
                    {autorizaAprobar ? (
                      <SoltarArchivo
                        valor={respaldo}
                        onCambio={setRespaldo}
                        acepta="application/pdf,image/*"
                        tope={10 * 1024 * 1024}
                        etiqueta="Respaldo de la autorización (opcional)"
                        pista="La captura de WhatsApp, el correo o el PDF donde el gerente autorizó esta compra. PDF o foto, hasta 10 MB."
                        deshabilitado={aprobar.isPending || respaldar.isPending}
                        className="mb-3"
                      />
                    ) : null}
                    <Button
                      block
                      icon={<BadgeCheck />}
                      disabled={
                        aprobar.isPending ||
                        respaldar.isPending ||
                        (!!autorizaAprobar && !bajoAutorizacion) ||
                        // Con varias propuestas no se aprueba a ciegas. La base
                        // lo rechaza igual; esto evita el viaje.
                        (propuestas.length > 1 && cualAprobar === null)
                      }
                      onClick={() => {
                        void (async () => {
                          const ordenId = await aprobar.mutateAsync({
                            solicitud_id: compra.id,
                            cotizacion_id: cualAprobar,
                          })
                          /*
                            Si el archivo falla, la compra YA está aprobada: eso
                            no se deshace y no se disimula. Se dice, y el papel
                            se sube desde la tarjeta de papeles de la orden, que
                            ya se lo ofrece a quien aprobó con permiso especial.
                          */
                          if (respaldo && ordenId) {
                            await respaldar.mutateAsync({ orden_id: ordenId, archivo: respaldo })
                            setRespaldo(null)
                          }
                        })()
                      }}
                    >
                      Aprobar la compra
                    </Button>
                    <Button
                      block
                      variant="outline"
                      icon={<Undo2 />}
                      onClick={() => setModal({ tipo: 'devolver-gerencia' })}
                    >
                      Devolver a compras
                    </Button>
                  </>
                ) : (
                  <p className="text-ink/60 text-sm">
                    Esperando la confirmación del gerente general.
                  </p>
                )
              ) : null}

              {orden?.estado === 'POR_INDICAR_PAGO' ? (
                puedeCompras ? (
                  <>
                    {/*
                      Se pregunta aquí y no dentro del formulario de pago.

                      La base se niega a instruir un pago sin esto, y descubrirlo
                      después de llenar banco, cuenta y titular sería enseñar la
                      puerta cerrada al final del pasillo. Además es un dato que
                      se sabe antes: se pacta al comprar o se ve al recibir.
                    */}
                    {!orden.comprobante_tipo ? (
                      <div className="border-warning/30 bg-warning-soft mb-3 rounded-[6px] border p-3">
                        <p className="text-ink/85 text-sm font-medium">
                          ¿Con qué entrega el proveedor?
                        </p>
                        <p className="text-ink/60 mt-1 text-xs leading-relaxed">
                          Solo la factura da derecho al crédito fiscal y entra en el libro de
                          compras. Sin decirlo no se puede pagar.
                        </p>

                        <div className="mt-3 flex gap-2">
                          {(['NOTA_ENTREGA', 'FACTURA'] as const).map((t) => (
                            <Button
                              key={t}
                              size="sm"
                              variant="outline"
                              disabled={declarar.isPending}
                              onClick={() =>
                                declarar.mutate({ orden_id: orden.id, tipo: t })
                              }
                            >
                              {t === 'FACTURA' ? 'Factura' : 'Nota de entrega'}
                            </Button>
                          ))}
                        </div>

                        {declarar.error ? (
                          <ErrorDeCarga error={declarar.error} className="mt-2" />
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-ink/50 mb-3 text-xs">
                        El proveedor entrega con{' '}
                        <span className="text-ink/75 font-medium">
                          {orden.comprobante_tipo === 'FACTURA' ? 'factura' : 'nota de entrega'}
                        </span>
                        .
                        {orden.comprobante_tipo === 'FACTURA'
                          ? ' Recuerda registrarla para poder descontar el IVA.'
                          : ''}
                      </p>
                    )}

                    <p className="text-ink/60 mb-3 text-sm">
                      Indica cómo se le paga al proveedor. Con eso la orden entra a tesorería.
                    </p>
                    <Button
                      block
                      icon={<CircleDollarSign />}
                      disabled={!orden.comprobante_tipo}
                      onClick={() => setModal({ tipo: 'pago' })}
                    >
                      Indicar método de pago
                    </Button>
                  </>
                ) : (
                  <p className="text-ink/60 text-sm">Compras está cargando el método de pago.</p>
                )
              ) : null}

              {orden?.estado === 'EN_TESORERIA' ? (
                puedeCompras ? (
                  <p className="text-ink/60 text-sm">
                    Registra el pago abajo, en el pago autorizado. Al hacerlo, la compra queda
                    esperando que llegue el material.
                  </p>
                ) : (
                  <p className="text-ink/60 text-sm">
                    Tesorería tiene la orden para pagar.
                  </p>
                )
              ) : null}

              {orden && ['PAGADA_POR_RECIBIR', 'RECIBIDA_PARCIAL', 'POR_RECIBIR'].includes(orden.estado) ? (
                <>
                  <div className="border-success/25 bg-success-soft rounded-[6px] border p-3">
                    <p className="text-ink/80 text-sm">
                      Pagada el {fecha(orden.fecha_pago)}. Falta que almacén reciba el material.
                      {orden.entrega_estimada
                        ? ` El proveedor ofreció entregar el ${fecha(orden.entrega_estimada)}.`
                        : ''}
                    </p>
                  </div>
                  {puede('ALMACEN') ? (
                    <>
                      {/*
                        Sin factura ni nota de entrega el material no entra, y se
                        dice AQUI en vez de al pulsar Guardar. La base tambien lo
                        para —es la unica puerta por la que entra material de una
                        compra— pero enterarse con el formulario ya lleno y el
                        camion en el porton es tarde.

                        El comprobante de pago no cuenta: dice que se pago, no
                        que llego ni que llego. Por eso sigue siendo opcional.
                      */}
                      {!hayPapelDelProveedor ? (
                        <div className="border-warning/30 bg-warning-soft mt-2 rounded-[6px] border p-3">
                          <p className="text-ink/80 text-sm leading-relaxed">
                            Falta el papel del proveedor. Sube la{' '}
                            <strong className="font-semibold">factura</strong> o la{' '}
                            <strong className="font-semibold">nota de entrega</strong> en «Papeles
                            de la compra», aquí abajo, y se podrá recibir.
                          </p>
                          <p className="text-ink/55 mt-1 text-xs">
                            El comprobante de pago puede llegar después.
                          </p>
                        </div>
                      ) : null}

                      <Button
                        block
                        className="mt-2"
                        icon={<PackageCheck />}
                        disabled={!hayPapelDelProveedor}
                        onClick={() => setModal({ tipo: 'recepcion' })}
                      >
                        Recibir material
                      </Button>
                    </>
                  ) : (
                    <p className="text-ink/45 mt-2 text-xs">
                      La recepción la registra almacén.
                    </p>
                  )}
                  {puedeCompras || puedeGerente ? (
                    <Button
                      block
                      variant="outline"
                      icon={<UserX />}
                      className="text-danger border-danger/30"
                      onClick={() => setModal({ tipo: 'desistir' })}
                    >
                      El proveedor desistió
                    </Button>
                  ) : null}
                </>
              ) : null}

              {orden?.estado === 'PROVEEDOR_DESISTIO' &&
              orden.desistio_resolucion === 'PENDIENTE' &&
              (puedeGerente || puedeCompras) ? (
                <>
                  <p className="text-ink/60 mb-3 text-sm">
                    Hay {dinero(orden.moneda, orden.total)} pagados sin material. Decide qué pasó
                    con ese dinero para cerrar la tarjeta.
                  </p>
                  <Button block variant="outline" onClick={() => setModal({ tipo: 'resolver' })}>
                    Resolver el dinero
                  </Button>
                </>
              ) : null}

              {/* Cancelar: disponible mientras no se haya pagado. */}
              {['PEDIDO', 'CONFIRMADA', 'POR_CONFIRMAR_GERENTE', 'BORRADOR'].includes(
                compra.estado,
              ) ? (
                <Button
                  block
                  variant="ghost"
                  icon={<Ban />}
                  className="text-danger"
                  onClick={() => setModal({ tipo: 'cancelar-pedido' })}
                >
                  Cancelar la compra
                </Button>
              ) : null}

              {orden && ['POR_INDICAR_PAGO', 'EN_TESORERIA'].includes(orden.estado) &&
              (puedeCompras || puedeGerente) ? (
                <Button
                  block
                  variant="ghost"
                  icon={<Ban />}
                  className="text-danger"
                  onClick={() => setModal({ tipo: 'cancelar-orden' })}
                >
                  Cancelar la orden
                </Button>
              ) : null}

              {compra.estado === 'CANCELADA' ? (
                <div className="border-hairline rounded-[6px] border p-3">
                  <p className="text-ink/70 text-sm">Cancelada.</p>
                  {compra.motivo_cancelacion ? (
                    <p className="text-ink/55 mt-1 text-sm">{compra.motivo_cancelacion}</p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {enviar.error ? <ErrorDeCarga error={enviar.error} className="mt-3" /> : null}
            {confirmar.error ? <ErrorDeCarga error={confirmar.error} className="mt-3" /> : null}
            {aprobar.error ? <ErrorDeCarga error={aprobar.error} className="mt-3" /> : null}
            {/*
              El respaldo falla APARTE de la aprobación, y se dice aparte.

              Ver solo el error del archivo, con el botón de aprobar ya
              desaparecido, deja a quien lo lee sin saber si la compra se aprobó
              o no. Se aprobó: eso va primero, y el fallo del papel después, con
              dónde volver a intentarlo.
            */}
            {respaldar.error ? (
              <div className="mt-3">
                <p className="text-ink/70 mb-2 text-sm">
                  La compra <strong className="text-ink/85">quedó aprobada</strong>, pero el
                  respaldo no llegó a subir. Vuelve a subirlo en «Papeles recibidos», dentro de la
                  orden.
                </p>
                <ErrorDeCarga error={respaldar.error} />
              </div>
            ) : null}
          </Card>

          <Card className="order-last lg:order-none">
            <CardHeader title="Datos" />
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ['Pedido', compra.numero],
                ['Solicita', solicitante + (solicitanteCargo ? ` · ${solicitanteCargo}` : '')],
                // Quien carga el pedido responde por lo que escribió, aunque no
                // sea quien lo necesita. Se muestra solo cuando son distintos:
                // repetir el mismo nombre dos veces no informa de nada.
                ...(compra.solicitante_id === compra.registrada_por
                  ? []
                  : [['Cargado por', nombreDe(compra.registrada_por)]]),
                ['Creado', fechaHora(compra.creada_en)],
                ['Prioridad', compra.prioridad === 'NORMAL' ? 'Normal' : compra.prioridad === 'ALTA' ? 'Alta' : 'Urgente'],
                ['Se necesita', fecha(compra.requerida_para)],
                ['Destino', compra.destino ?? '—'],
                ['Confirmado por', nombreDe(compra.confirmada_por)],
                ['Aprobado por', nombreDe(compra.aprobada_gg_por)],
                ...(compra.aprobada_por_autorizacion_de
                  ? [['Bajo autorización de', nombreDe(compra.aprobada_por_autorizacion_de)]]
                  : []),
              ].map(([clave, valor]) => (
                <div key={clave} className="flex justify-between gap-3">
                  <dt className="text-ink/50 shrink-0">{clave}</dt>
                  <dd className="text-ink/80 truncate text-right">{valor}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>

      {/* ---------------- Modales ---------------- */}
      {modal?.tipo === 'cotizacion' ? (
        /*
          La `key` obliga a rehacer el formulario al cambiar de cotización.

          Sus campos se inicializan una sola vez, al montarlo, que es lo
          correcto: si se recalcularan en cada pintado, lo que estás
          escribiendo se borraría solo. El precio es que reutilizar la misma
          instancia para otra cotización enseñaría los datos de la anterior.
        */
        <ModalCotizacion
          key={modal.corregir?.id ?? 'nueva'}
          abierto
          onCerrar={() => setModal(null)}
          compra={compra}
          cotizacion={modal.corregir}
        />
      ) : null}

      {modal?.tipo === 'pago' && orden ? (
        <ModalPago abierto onCerrar={() => setModal(null)} orden={orden} />
      ) : null}

      {modal?.tipo === 'recepcion' && orden ? (
        <ModalRecepcion abierto onCerrar={() => setModal(null)} orden={orden} />
      ) : null}

      <ModalMotivo
        abierto={modal?.tipo === 'cancelar-pedido'}
        onCerrar={() => setModal(null)}
        titulo="Cancelar la compra"
        descripcion="La tarjeta se va a la columna Cancelada y no se puede reabrir."
        etiqueta="Cancelar la compra"
        pendiente={cancelarPedido.isPending}
        error={cancelarPedido.error}
        onConfirmar={async (motivo) => {
          await cancelarPedido.mutateAsync({ id: compra.id, motivo })
        }}
      />

      <ModalMotivo
        abierto={modal?.tipo === 'devolver-gerencia'}
        onCerrar={() => setModal(null)}
        titulo="Devolver a compras"
        descripcion="Vuelve a la columna de cotizaciones para que consigan otra opción."
        etiqueta="Devolver"
        variante="primary"
        pendiente={devolver.isPending}
        error={devolver.error}
        onConfirmar={async (motivo) => {
          await devolver.mutateAsync({ solicitud_id: compra.id, motivo })
        }}
      />

      <ModalMotivo
        abierto={modal?.tipo === 'cancelar-orden'}
        onCerrar={() => setModal(null)}
        titulo="Cancelar la orden"
        descripcion="Solo se puede antes de que tesorería pague."
        etiqueta="Cancelar la orden"
        pendiente={cancelarOrden.isPending}
        error={cancelarOrden.error}
        onConfirmar={async (motivo) => {
          if (orden) await cancelarOrden.mutateAsync({ orden_id: orden.id, motivo })
        }}
      />

      <ModalMotivo
        abierto={modal?.tipo === 'desistir'}
        onCerrar={() => setModal(null)}
        titulo="El proveedor desistió"
        descripcion="La compra ya está pagada. La tarjeta se queda a la vista hasta que se resuelva el dinero."
        etiqueta="Registrar que desistió"
        pendiente={desistir.isPending}
        error={desistir.error}
        onConfirmar={async (motivo) => {
          if (orden) await desistir.mutateAsync({ orden_id: orden.id, motivo })
        }}
      />

      <ModalMotivo
        abierto={modal?.tipo === 'devolver-instruccion'}
        onCerrar={() => setModal(null)}
        titulo="Devolver a compras"
        descripcion="El pago no se ejecuta y compras tendrá que autorizarlo de nuevo."
        etiqueta="Devolver"
        pendiente={devolverPago.isPending}
        error={devolverPago.error}
        onConfirmar={async (motivo) => {
          if (modal?.tipo === 'devolver-instruccion') {
            await devolverPago.mutateAsync({ instruccion_id: modal.instruccion.id, motivo })
          }
        }}
      />

      {/* Se monta solo cuando hay una instruccion elegida: el modal arranca sus
          campos con los datos de esa, y sin ella no tendria de que partir. */}
      {modal?.tipo === 'cambiar-metodo' ? (
        <ModalCambiarMetodo
          abierto
          onCerrar={() => setModal(null)}
          instruccion={modal.instruccion}
        />
      ) : null}

      {modal?.tipo === 'registrar-pago' ? (
        <ModalRegistrarPago
          instruccion={modal.instruccion}
          onCerrar={() => setModal(null)}
        />
      ) : null}

      {modal?.tipo === 'resolver' && orden ? (
        <Modal
          abierto
          onCerrar={() => setModal(null)}
          titulo="Resolver el dinero"
          descripcion={`${dinero(orden.moneda, orden.total)} pagados a ${orden.proveedor?.nombre}`}
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setModal(null)}>
                Cancelar
              </Button>
              <Button
                disabled={resolver.isPending}
                onClick={async () => {
                  await resolver.mutateAsync({ orden_id: orden.id, resolucion })
                  setModal(null)
                }}
              >
                Guardar
              </Button>
            </>
          }
        >
          <Select
            label="Qué pasó con el dinero"
            value={resolucion}
            onChange={(e) => setResolucion(e.target.value)}
            opciones={[
              { valor: 'REEMBOLSADO', etiqueta: 'El proveedor lo devolvió' },
              { valor: 'SALDO_FAVOR', etiqueta: 'Queda como saldo a favor con el proveedor' },
              { valor: 'PERDIDA', etiqueta: 'Se dio por perdido' },
            ]}
          />
          {resolver.error ? <ErrorDeCarga error={resolver.error} className="mt-3" /> : null}
        </Modal>
      ) : null}

      <Visor
        abierto={pdf !== null}
        onCerrar={() => setPdf(null)}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ''}
        titulo="Orden de compra"
      />
    </>
  )
}
