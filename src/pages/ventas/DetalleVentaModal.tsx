import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { cn } from '@/lib/cn'
import { bolivares, dinero, dolares, fecha } from '@/lib/formato'
import { fechaHoraVE } from '@/lib/pedidos'
import type { PermisosVentas, TarjetaVenta } from '@/lib/api/ventasTablero'
import {
  textoAnulada,
  textoCotizacion,
  textoDespachoAprobado,
  textoDespachoPorAprobar,
  textoFacturada,
  textoFinalizada,
  textoRecordatorio,
} from '@/lib/ficha/ventasWhatsapp'
import { COLUMNAS, TIPO_DOC, chipsDe, condicionTxt, rutaDe, textoNoDespacho } from './ventasTablero'

/*
  EL DETALLE DE UNA VENTA EN EL TABLERO.

  Arriba, sus papeles encadenados (cotización → despacho → nota de entrega →
  factura), con el de la etapa resaltado. Debajo, lo que hay que saber para
  decidir y, al pie, los botones de SU etapa. Lo que ya tiene su pantalla
  (camiones, anular, reportes, cobros) se abre ahí mismo con el documento puesto.
*/

export function DetalleVentaModal({
  tarjeta: t,
  permisos,
  empresa,
  onCerrar,
  onAprobar,
  onWhatsapp,
  acciones,
  extra,
}: {
  tarjeta: TarjetaVenta
  permisos: PermisosVentas | undefined
  /** La razón social, para el pie de los mensajes. */
  empresa: string
  onCerrar: () => void
  /** «✔ Aprobar despacho»: la ventana vive en el tablero (la tarjeta cambia de columna). */
  onAprobar: (t: TarjetaVenta) => void
  onWhatsapp: (titulo: string, texto: string) => void
  /** Botones propios de fases siguientes. */
  acciones?: ReactNode
  extra?: ReactNode
}) {
  const navegar = useNavigate()
  const col = COLUMNAS.find((c) => c.etapa === t.etapa)
  const ir = rutaDe(t)
  const chips = chipsDe(t)
  const debe = (t.etapa === 'despachada' || t.etapa === 'facturada') && Number(t.saldo_usd ?? 0) > 0.01
  const wa = (titulo: string, texto: string) => onWhatsapp(`${titulo} · ${t.numero}`, texto)

  const deEtapa = (
    <>
      {t.etapa === 'cot' ? (
        <>
          {permisos?.despachar ? (
            <Button onClick={() => navegar(`/app/facturacion/notas-entrega?cotizacion=${t.id}`)}>🚚 Despachar esta cotización</Button>
          ) : null}
          <Button variant="outline" onClick={() => wa('Cotización', textoCotizacion(t, empresa))}>
            💬 WhatsApp de la cotización
          </Button>
        </>
      ) : null}
      {t.etapa === 'aprobar' ? (
        <>
          {permisos?.aprueba_despacho ? (
            <Button className="bg-success hover:bg-success hover:brightness-95" onClick={() => onAprobar(t)}>
              ✔ Aprobar despacho
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => wa('Despacho por aprobar', textoDespachoPorAprobar(t, empresa))}>
            💬 WhatsApp para aprobar
          </Button>
        </>
      ) : null}
      {t.etapa === 'despachada' && t.tipo === 'NE' ? (
        <>
          {/* Facturar es de quien factura, y solo una nota lista: con cliente,
              con precios y que no sea de respaldo. */}
          {permisos?.facturar && t.facturable !== false && t.cliente && !(t.precios_pendientes ?? 0) && t.estado_doc === 'DESPACHADA' ? (
            <Button onClick={() => navegar(`/app/facturacion?notas=${t.id}`)}>🧾 Facturar esta nota</Button>
          ) : null}
          <Button variant="outline" onClick={() => wa('Despacho aprobado', textoDespachoAprobado(t, empresa))}>
            💬 Reporte del despacho
          </Button>
        </>
      ) : null}
      {t.etapa === 'facturada' ? (
        <>
          {permisos?.cobrar ? (
            <Button onClick={() => navegar(`/app/facturacion?factura=${encodeURIComponent(t.numero)}`)}>💵 Registrar cobro</Button>
          ) : null}
          <Button variant="outline" onClick={() => wa('Factura', textoFacturada(t, empresa))}>
            💬 WhatsApp de la factura
          </Button>
        </>
      ) : null}
      {debe ? (
        <Button variant="outline" onClick={() => wa('Recordatorio de cobro', textoRecordatorio(t, empresa))}>
          🔔 Recordar cobro
        </Button>
      ) : null}
      {t.etapa === 'cobrada' ? (
        <Button variant="outline" onClick={() => wa('Venta finalizada', textoFinalizada(t, empresa))}>
          💬 Venta finalizada
        </Button>
      ) : null}
      {t.etapa === 'anulada' ? (
        <Button variant="outline" onClick={() => wa('Anulación', textoAnulada(t, empresa))}>
          💬 WhatsApp de la anulación
        </Button>
      ) : null}
    </>
  )

  const papeles: { tipo: string; numero: string | null | undefined }[] = [
    { tipo: 'Cotización', numero: t.cadena.cot },
    { tipo: 'Despacho', numero: t.cadena.sd },
    ...(t.cadena.ns ? [{ tipo: 'Nota de salida', numero: t.cadena.ns }] : []),
    { tipo: 'Nota de entrega', numero: t.cadena.ne },
    { tipo: 'Factura', numero: t.cadena.fac },
  ]

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={t.cliente ?? 'Sin cliente todavía'}
      descripcion={`${col?.titulo ?? ''} · ${TIPO_DOC[t.tipo]} ${t.numero}`}
      ancho="lg"
      acciones={
        <>
          {deEtapa}
          {acciones}
          <Button variant="outline" onClick={() => navegar(ir.ruta)}>
            {ir.etiqueta}
          </Button>
          {(t.etapa === 'despachada' || t.etapa === 'cobrada') && t.tipo === 'NE' && permisos?.conciliar ? (
            <Button variant="ghost" onClick={() => navegar('/app/ventas/registros-de-pagos')}>
              🏦 Conciliación de pagos
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onCerrar}>
            Cerrar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {papeles.map((p, i) => (
            <span key={p.tipo} className="flex items-center gap-1.5">
              {i ? <span className="text-ink/35">→</span> : null}
              <span
                className={cn(
                  'grid rounded-[7px] border px-2 py-1 text-[11px]',
                  p.numero === t.numero ? 'border-royal-600 bg-royal-600/8' : 'border-hairline bg-ink/2',
                  !p.numero && 'opacity-45',
                )}
              >
                <span className="text-ink/55">{p.tipo}</span>
                <span className="font-mono font-semibold">{p.numero ?? '—'}</span>
              </span>
            </span>
          ))}
        </div>

        {chips.length ? (
          <div className="flex flex-wrap gap-1">
            {chips.map((c, i) => (
              <Chip key={i} tone={c.tono} title={c.titulo}>
                {c.texto}
              </Chip>
            ))}
          </div>
        ) : null}

        {t.etapa === 'aprobar' && t.no_despacho_motivo ? (
          <Aviso tono="warning" titulo="⏳ No aprobado por ahora">
            {textoNoDespacho(t)}
            {t.no_despacho_por ? ` · ${t.no_despacho_por}` : ''}
            {t.no_despacho_en ? ` · ${fechaHoraVE(t.no_despacho_en)}` : ''}
          </Aviso>
        ) : null}
        {t.etapa === 'anulada' && t.motivo ? <Aviso tono="danger" titulo="Motivo">{t.motivo}</Aviso> : null}
        {t.tipo === 'NE' && t.etapa === 'despachada' && ((t.precios_pendientes ?? 0) > 0 || !t.cliente) ? (
          <Aviso tono="warning" titulo="Le falta para cobrarse">
            {[!t.cliente ? 'el cliente' : null, (t.precios_pendientes ?? 0) > 0 ? `el precio de ${t.precios_pendientes} renglón(es)` : null]
              .filter(Boolean)
              .join(' y ')}
            . Se completa en la nota de entrega.
          </Aviso>
        ) : null}

        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Dato titulo="RIF">{t.rif ?? '—'}</Dato>
          {t.fecha ? <Dato titulo="Fecha">{fecha(t.fecha)}</Dato> : null}
          {t.por ? <Dato titulo={t.tipo === 'SD' ? 'Pidió' : t.tipo === 'NE' ? 'Aprobó' : 'Hizo'}>{t.por}</Dato> : null}
          {condicionTxt(t.condicion) ? <Dato titulo="Condición">{condicionTxt(t.condicion)}</Dato> : null}
          {t.numero_control ? <Dato titulo="Nº de control"><span className="font-mono">{t.numero_control}</span></Dato> : null}
          {t.vence_el && t.tipo !== 'NE' ? <Dato titulo={t.tipo === 'COT' ? 'Válida hasta' : 'Vence'}>{fecha(t.vence_el)}</Dato> : null}
          {t.almacen ? <Dato titulo="Sale de">{t.almacen}</Dato> : null}
          {t.chofer ? (
            <Dato titulo="Chofer">
              {t.chofer}
              {t.cedula_chofer ? ` · ${t.cedula_chofer}` : ''}
            </Dato>
          ) : null}
          {t.vehiculo ? <Dato titulo="Vehículo">{t.vehiculo}</Dato> : null}
          {t.ticket ? <Dato titulo="Romana">{t.ticket}</Dato> : null}
          {t.pendiente_por_cobrar && t.fecha_pago ? <Dato titulo="Cobrar el">{fecha(t.fecha_pago)}</Dato> : null}
        </dl>

        {t.resumen ? (
          <div>
            <h4 className="text-ink/55 mb-1 text-xs font-semibold tracking-wide uppercase">Productos</h4>
            <ul className="space-y-0.5 text-sm">
              {t.resumen.split(' · ').reduce<string[]>((acc, parte, i, arr) => {
                // El resumen viene «producto · cantidad unidad · producto · …».
                if (i % 2 === 0) acc.push(`${parte} — ${arr[i + 1] ?? ''}`)
                return acc
              }, []).map((r, i) => (
                <li key={i}>• {r}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {t.total != null || t.total_usd != null ? (
          <div className="border-hairline ml-auto grid w-full max-w-xs gap-0.5 border-t pt-2 text-sm tabular-nums">
            {t.iva ? <Fila etiqueta="IVA">{dinero(t.moneda, Number(t.iva))}</Fila> : null}
            {t.igtf ? <Fila etiqueta="IGTF">{dinero(t.moneda, Number(t.igtf))}</Fila> : null}
            {t.total != null ? <Fila etiqueta="Total" fuerte>{dinero(t.moneda, Number(t.total))}</Fila> : null}
            {t.total_usd != null && t.moneda !== 'USD' ? <Fila etiqueta="En $">{dolares(Number(t.total_usd))}</Fila> : null}
            {t.total_bs != null && t.moneda !== 'VES' ? <Fila etiqueta="En Bs">{bolivares(Number(t.total_bs))}</Fila> : null}
            {Number(t.aplicado) > 0 ? <Fila etiqueta="Conciliado">{dolares(Number(t.aplicado))}</Fila> : null}
            {Number(t.cobrado) > 0 ? <Fila etiqueta="Cobrado">{dolares(Number(t.cobrado))}</Fila> : null}
            {(t.etapa === 'despachada' || t.etapa === 'facturada') && t.saldo_usd != null ? (
              <Fila etiqueta="Saldo" fuerte>
                {dolares(Number(t.saldo_usd))}
              </Fila>
            ) : null}
          </div>
        ) : null}

        {t.observacion ? <p className="text-ink/70 text-sm">📝 {t.observacion}</p> : null}
        {extra}
      </div>
    </Modal>
  )
}

function Dato({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink/50 text-[11px] font-semibold tracking-wide uppercase">{titulo}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  )
}

function Fila({ etiqueta, children, fuerte }: { etiqueta: string; children: ReactNode; fuerte?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-6', fuerte && 'font-semibold')}>
      <span className="text-ink/60">{etiqueta}</span>
      <span>{children}</span>
    </div>
  )
}

function Aviso({ tono, titulo, children }: { tono: 'warning' | 'danger'; titulo: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-[8px] border px-3 py-2 text-sm', tono === 'warning' ? 'border-warning bg-warning/6' : 'border-danger bg-danger/6')}>
      <strong>{titulo}</strong> · {children}
    </div>
  )
}
