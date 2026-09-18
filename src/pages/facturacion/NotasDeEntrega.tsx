import { useState } from 'react'
import { useMonedasUsables, useTasaVigente } from '@/lib/api/tasas'
import { Check, Printer, Truck, X } from 'lucide-react'
import { CatalogoTransporte } from '@/components/CatalogoTransporte'
import { ElegirArchivosDeCarga, FotosDeCarga } from '@/components/FotosDeCarga'
import { subirFotosDeCarga } from '@/lib/api/fotosDeCarga'
import { usePerfiles } from '@/lib/api/catalogo'
import {
  cedulaComparable,
  placaLimpia,
  useChoferes,
  useGuardarChofer,
  useGuardarVehiculoDeDespacho,
  useVehiculosDeDespacho,
} from '@/lib/api/transporte'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { CampoDocumento } from '@/components/CampoDocumento'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { Visor } from '@/components/Visor'
import { dinero, documento, enteros, fecha, fechaHora } from '@/lib/formato'
import { empresaDelPapel, useEmpresa } from '@/lib/api/empresa'
import { useMiPerfil } from '@/lib/api/usuarios'
import { useAlmacenes, useExistencias } from '@/lib/api/inventario'
import { densidadesDeArticulos } from '@/lib/api/catalogo'
import { useGuias, useTickets } from '@/lib/api/despachos'
import { useVehiculos } from '@/lib/api/vehiculos'
import { armarDocumento } from '@/lib/ficha/ventaPdf'
import type { PdfArmado } from '@/lib/ficha/reciboPdf'
import {
  useAnularNota,
  useAprobarDespacho,
  useCancelarDespacho,
  useClientes,
  useNotasEntrega,
  usePrecios,
  usePuedoAprobarDespachos,
  useRechazarDespacho,
  useRenglones,
  useSolicitarDespacho,
  useSolicitudesDespacho,
  type NotaEntrega,
  type RenglonGuardado,
  type SolicitudDeDespacho,
} from '@/lib/api/ventas'
/*
  Los renglones, el IVA y sus totales se quedaron en Ventas: son los mismos que
  arma una cotización, y partirlos en dos copias sería tener dos formas de sumar
  la misma factura. La nota de entrega se mudó a Facturación —«la nota de
  entrega debe moverse a Facturación», Christopher, 16/09/2026— porque gasta
  numeración y deja a alguien debiendo, no porque su formulario sea otro.
*/
import { Renglones } from '@/pages/ventas/Renglones'
import {
  aRenglones,
  conRomana,
  conversionDeRenglon,
  faltaEnFila,
  filaVacia,
  m3EnCamion,
  repreciar,
  subtotalDe,
  type FilaRenglon,
} from '@/pages/ventas/filas'
import { TablaRenglones, Totales } from '@/pages/ventas/Cotizaciones'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useDesenlazarNota, useEnlazarNotaAFactura, useFacturas } from '@/lib/api/facturacion'

/*
  LA NOTA NO ESTÁ ESPERANDO UNA FACTURA. Christopher, 17/09/2026: «una nota de
  entrega no necesariamente llevará o se anexará a una factura; manejarán sus
  estados de forma independiente hasta que se decida o no hacer factura (ahí
  cambiaría a facturada y se enlaza con el correlativo de la factura)». Por eso
  despachada se dice «Despachada», no «Por facturar», y no va en color de
  pendiente: no le falta nada.
*/
const TONO: Record<string, 'success' | 'neutral'> = {
  DESPACHADA: 'neutral',
  FACTURADA: 'success',
  ANULADA: 'neutral',
}

const ETIQUETA: Record<string, string> = {
  DESPACHADA: 'Despachada',
  FACTURADA: 'Facturada',
  ANULADA: 'Anulada',
}

export function NotasDeEntrega() {
  const monedas = useMonedasUsables()
  const { data, isPending, error } = useNotasEntrega()
  const { data: clientes } = useClientes(true)
  const { data: precios } = usePrecios()
  const { data: almacenes } = useAlmacenes()
  const { data: empresa } = useEmpresa()
  const { data: yo } = useMiPerfil()
  const despachar = useSolicitarDespacho()
  const anular = useAnularNota()
  const solicitudes = useSolicitudesDespacho()
  const { data: puedoAprobar } = usePuedoAprobarDespachos()
  const aprobar = useAprobarDespacho()
  const rechazar = useRechazarDespacho()
  const cancelar = useCancelarDespacho()
  const { data: perfiles } = usePerfiles()
  const [verResueltas, setVerResueltas] = useState(false)
  const [cerrando, setCerrando] = useState<{ s: SolicitudDeDespacho; como: 'RECHAZAR' | 'CANCELAR' } | null>(null)
  const [motivoCierre, setMotivoCierre] = useState('')
  const [falloDespacho, setFalloDespacho] = useState<string | null>(null)
  const [catalogo, setCatalogo] = useState(false)
  const nombreDe = (uid: string | null) =>
    (uid && perfiles?.find((p) => p.id === uid)?.nombre) || '—'
  const { data: tasaHoy } = useTasaVigente()
  /* La nota es de Facturación también en la base desde el 16/09/2026: despachar
     pide Facturación en escritura y anular, total. Sin eso no se enseña el
     botón que la base iba a rechazar. */
  const { puede } = useMisPermisos()
  const puedeDespachar = puede('FACTURACION', 'ESCRITURA')
  const puedeAnular = puede('FACTURACION', 'TOTAL')

  const [nuevo, setNuevo] = useState(false)
  const [detalle, setDetalle] = useState<NotaEntrega | null>(null)
  const [anulando, setAnulando] = useState<NotaEntrega | null>(null)
  /*
    ENLAZAR A UNA FACTURA QUE YA EXISTE. Christopher, 17/09/2026: la nota y la
    factura van por separado, y una nota hecha aparte se enlaza después a una
    factura del mismo cliente. Solo a una factura sin nota que no haya sacado el
    material: si lo sacó, esta nota lo contaría dos veces.
  */
  const [enlazando, setEnlazando] = useState<NotaEntrega | null>(null)
  const [facturaElegida, setFacturaElegida] = useState('')
  const facturas = useFacturas()
  const enlazar = useEnlazarNotaAFactura()
  const desenlazar = useDesenlazarNota()
  const [motivo, setMotivo] = useState('')
  const [pdf, setPdf] = useState<PdfArmado | null>(null)

  const [clienteId, setClienteId] = useState('')
  const [almacenId, setAlmacenId] = useState('')
  const [moneda, setMoneda] = useState('USD')
  /*
    CHOFER Y VEHÍCULO, OBLIGATORIOS Y DEL CATÁLOGO. Se elige del catálogo o, si
    no está, se escribe al lado y se añade —con «+ Añadir» o, si no se pulsa,
    al enviar: la base lo añade sola—.
  */
  const [choferId, setChoferId] = useState('')
  const [nuevoChofer, setNuevoChofer] = useState('')
  const [nuevaCedula, setNuevaCedula] = useState('')
  const [vehiculoDespId, setVehiculoDespId] = useState('')
  const [nuevoVehiculo, setNuevoVehiculo] = useState('')
  const [nuevaPlaca, setNuevaPlaca] = useState('')
  const [archivos, setArchivos] = useState<File[]>([])
  const [ticket, setTicket] = useState('')
  const [ticketId, setTicketId] = useState('')
  const [guiaId, setGuiaId] = useState('')
  const [bruto, setBruto] = useState('')
  const [tara, setTara] = useState('')
  const [flete, setFlete] = useState('')
  const [observacion, setObservacion] = useState('')
  const [filas, setFilas] = useState<FilaRenglon[]>([filaVacia()])

  const { data: vehiculos } = useVehiculos()
  const { data: choferes } = useChoferes()
  const { data: vehiculosDesp } = useVehiculosDeDespacho()
  const guardarChofer = useGuardarChofer()
  const guardarVehiculo = useGuardarVehiculoDeDespacho()
  const choferElegido = (choferes ?? []).find((c) => String(c.id) === choferId) ?? null
  const vehiculoDespElegido = (vehiculosDesp ?? []).find((v) => String(v.id) === vehiculoDespId) ?? null
  const chofer = choferElegido ? choferElegido.nombre : nuevoChofer.trim()
  const cedula = choferElegido ? choferElegido.cedula : nuevaCedula.trim()
  const vehiculo = vehiculoDespElegido ? vehiculoDespElegido.placa : placaLimpia(nuevaPlaca)
  const faltaTransporte = chofer.length < 3 || cedulaComparable(cedula).length < 5 || vehiculo.length < 4
  const { data: tickets } = useTickets('LIBRE')
  const { data: guias } = useGuias('VIGENTE')

  const ticketsLibres = (tickets ?? []).filter((t) => t.tipo === 'SALIDA')

  /*
    Con el ticket elegido de la báscula, un solo material del patio vendido en
    toneladas lleva las toneladas del ticket: la base las pone así al guardar, y
    aquí se enseña lo mismo antes. Los pesos tecleados a mano no cuentan: no
    salen de la báscula.
  */
  const ticketElegido = ticketsLibres.find((t) => String(t.id) === ticketId) ?? null
  const toneladasDeRomana = ticketElegido ? Number(ticketElegido.peso_neto) / 1000 : null
  const filasEfectivas = conRomana(filas, precios ?? [], toneladasDeRomana)

  /*
    LA CAPACIDAD DEL CAMIÓN, CONTRASTADA CON LO QUE SE VA A CARGAR

    Es la razón de que exista el catálogo de vehículos. La cantera despacha en
    metros cúbicos y sus camiones tienen medida conocida —el volteo lleva unos
    18 m³, el chuto unos 25—, así que despachar 30 en uno de 18 es un error que
    se puede ver antes de que el camión salga.

    Avisa, no impide. Puede ser deliberado: dos viajes con la misma nota, o una
    carga que se completa después. Bloquearlo obligaría a inventar una excusa
    para algo legítimo; callarlo dejaría pasar el error de tecleo. El aviso es
    la única de las tres opciones que respeta las dos situaciones.

    Solo cuenta lo que el patio lleva en M³, también cuando se vende en
    toneladas: esas se pasan a metros con la densidad. Un renglón en sacos o en
    unidades no ocupa la volqueta del mismo modo y sumarlo daría un número sin
    sentido.
  */
  const porPlaca = (placa: string) =>
    (vehiculos ?? []).find((v) => v.placa === placa.trim().toUpperCase().replace(/\s+/g, ''))

  // Si la placa es de la flota, su capacidad y su mantenimiento entran en juego.
  const vehiculoElegido = vehiculo ? (porPlaca(vehiculo) ?? null) : null

  const m3EnLaCarga = m3EnCamion(filasEfectivas, precios ?? [])

  const excedeCapacidad =
    vehiculoElegido !== null && m3EnLaCarga > Number(vehiculoElegido.capacidad_m3)
  const guiasVigentes = (guias ?? []).filter((g) => !g.vencida)

  // Todos los patios: cada renglón puede salir de uno distinto.
  const { data: existencias } = useExistencias(undefined, nuevo)
  const renglonesDetalle = useRenglones('nota_entrega_renglones', 'nota_id', detalle?.id ?? null)

  const porPatio: Record<string, Record<number, number>> = {}
  for (const e of existencias ?? []) {
    const deEse = (porPatio[String(e.almacen_id)] ??= {})
    deEse[e.articulo_id] = Number(e.existencia)
  }
  const opcionesDePatio = (almacenes ?? []).map((a) => ({ valor: String(a.id), etiqueta: a.nombre }))
  const nombreDePatio = (id: number | null | undefined) =>
    id ? ((almacenes ?? []).find((a) => a.id === id)?.nombre ?? null) : null

  /*
    LA NOTA DE ENTREGA NO LLEVA IVA. Christopher, 17/09/2026: «solo la factura
    tendrá mención de IVA o IGTF; las notas de entrega deben decir NOTA DE
    ENTREGA», y «nota de entrega es una cosa y factura otra posterior». La
    casilla del IVA que había aquí pasó a «Emitir factura», y la base guarda la
    nota al 0 % aunque le llegue otra cosa.
  */
  const subtotal = subtotalDe(filasEfectivas)
  const total = subtotal + (Number(flete) || 0)
  const incompletas = filasEfectivas.some((f) => faltaEnFila(f, precios ?? []) !== null)

  // La lista en bolívares no es el mismo número que en dólares.
  const cambiarMoneda = (nueva: string) => {
    setMoneda(nueva)
    setFilas((actuales) => repreciar(actuales, precios ?? [], nueva, Number(tasaHoy?.tasa ?? 0)))
  }

  const limpiar = () => {
    setClienteId('')
    setMoneda('USD')
    setChoferId('')
    setNuevoChofer('')
    setNuevaCedula('')
    setVehiculoDespId('')
    setNuevoVehiculo('')
    setNuevaPlaca('')
    setArchivos([])
    setTicket('')
    setTicketId('')
    setGuiaId('')
    setBruto('')
    setTara('')
    setFlete('')
    setObservacion('')
    setFilas([filaVacia()])
  }

  const imprimir = async (n: NotaEntrega) => {
    const renglones = renglonesDetalle.data ?? []
    const densidades = await densidadesDeArticulos({ ids: renglones.map((r) => r.articulo_id) })
    const densidadDe = (r: RenglonGuardado) =>
      densidades.find((a) => a.id === r.articulo_id)?.densidad_ton_m3
    setPdf(
      await armarDocumento({
        tipo: 'NOTA',
        numero: n.numero,
        fecha: n.fecha,
        contraparte: {
          nombre: n.cliente,
          rif: n.cliente_rif,
          direccion: clientes?.find((c) => c.id === n.cliente_id)?.direccion ?? null,
          // El hueco del teléfono existía en el papel desde el primer día y nadie
          // lo llenaba: salía «TELÉFONO —» en todas las notas y todas las
          // cotizaciones. El dato está aquí mismo, en la lista de clientes.
          telefono: clientes?.find((c) => c.id === n.cliente_id)?.telefono ?? null,
        },
        despacho: {
          vehiculo: n.vehiculo,
          chofer: n.chofer,
          cedulaChofer: n.cedula_chofer,
          ticket: n.ticket_romana,
          pesoNeto: n.peso_neto ? `${enteros(n.peso_neto)} kg` : null,
        },
        moneda: n.moneda,
        tasa: n.tasa,
        tasaUsd: n.tasa_usd,
        renglones: renglones.map((r) => ({
          descripcion: r.descripcion,
          // Sin línea de detalle: la nota no lleva más notas que el total.
          detalle: null,
          cantidad: r.cantidad,
          unidad: r.unidad,
          conversion: conversionDeRenglon(r, densidadDe(r)),
          precio_unitario: r.precio_unitario,
          subtotal: r.subtotal,
          exento_iva: r.exento_iva,
        })),
        notaConversion: null,
        subtotal: n.subtotal,
        descuento: n.descuento,
        flete: n.flete,
        baseImponible: n.base_imponible,
        iva: n.iva,
        alicuotaIva: n.alicuota_iva,
        total: n.total,
        observacion: n.observacion,
        sello: n.estado === 'ANULADA' ? 'ANULADA' : null,
        empresa: empresaDelPapel(empresa),
        emitidoPor: yo?.nombre ?? '',
      }),
    )
  }

  return (
    <>
      <PageHeader
        title="Notas de entrega"
        description="El papel con el que sale el camión. El despacho se pide con chofer, cédula y placa; al aprobarlo nace la nota y el material se descuenta del patio."
        actions={
          <>
            <Button variant="outline" icon={<Truck />} onClick={() => setCatalogo(true)}>
              Choferes / Vehículos
            </Button>
            {puedeDespachar ? (
              <Button icon={<Truck />} onClick={() => setNuevo(true)}>
                Pedir despacho
              </Button>
            ) : null}
          </>
        }
      />

      {/* ------------------------------------------ despachos por aprobar */}
      {(() => {
        const todas = solicitudes.data ?? []
        const esperando = todas.filter((s) => s.estado === 'PEDIDA')
        const resueltas = todas.filter((s) => s.estado === 'RECHAZADA' || s.estado === 'CANCELADA')
        const aLaVista = verResueltas ? [...esperando, ...resueltas] : esperando
        if (todas.length === 0 && !solicitudes.error) return null
        return (
          <section className="mb-6">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-ink/85 font-titular text-lg">
                Despachos por aprobar{esperando.length ? ` (${esperando.length})` : ''}
              </h2>
              {resueltas.length > 0 ? (
                <Button size="sm" variant="ghost" onClick={() => setVerResueltas((v) => !v)}>
                  {verResueltas ? 'Ocultar los no aprobados' : `Ver los no aprobados (${resueltas.length})`}
                </Button>
              ) : null}
            </div>
            {solicitudes.error ? <ErrorDeCarga error={solicitudes.error} /> : null}
            {falloDespacho ? <p className="text-danger mb-2 text-sm">{falloDespacho}</p> : null}
            {aLaVista.length === 0 ? (
              <p className="text-ink/50 text-sm">Ningún despacho espera aprobación.</p>
            ) : null}
            <div className="space-y-3">
              {aLaVista.map((s) => (
                <Card key={s.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-ink/70 tabular font-mono text-xs">Despacho {s.numero}</span>
                        <Chip tone={s.estado === 'PEDIDA' ? 'warning' : 'neutral'}>
                          {s.estado === 'PEDIDA' ? 'Por aprobar' : s.estado === 'RECHAZADA' ? 'No aprobado' : 'Cancelado'}
                        </Chip>
                      </div>
                      <p className="text-ink/85 mt-1.5 text-sm font-medium">
                        {s.cliente} · sale de {s.almacen}
                      </p>
                      <p className="text-ink/60 text-xs">
                        {s.vehiculo}
                        {s.vehiculo_descripcion ? ` · ${s.vehiculo_descripcion}` : ''} · {s.chofer} ·{' '}
                        {documento(s.cedula_chofer)}
                      </p>
                      <ul className="text-ink/75 mt-2 space-y-0.5 text-sm">
                        {s.renglones.map((r, i) => (
                          <li key={i}>
                            {Number(r.cantidad).toLocaleString('es-VE', { maximumFractionDigits: 2 })}{' '}
                            {r.unidad ?? ''} · {r.descripcion || r.articulo || '—'}
                          </li>
                        ))}
                      </ul>
                      <p className="text-ink/40 mt-2 text-xs">
                        Lo pidió {nombreDe(s.pedida_por)} · {fechaHora(s.pedida_en)}
                        {s.resuelta_en ? ` · lo cerró ${nombreDe(s.resuelta_por)} · ${fechaHora(s.resuelta_en)}` : ''}
                      </p>
                      {s.motivo_cierre ? (
                        <p className="text-ink/55 mt-1 text-xs italic">{s.motivo_cierre}</p>
                      ) : null}
                      <FotosDeCarga
                        origen="DESPACHO"
                        referencia={s.numero}
                        puedeAnadir={puedeDespachar && s.estado === 'PEDIDA'}
                      />
                    </div>
                    {s.estado === 'PEDIDA' ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {puedoAprobar ? (
                          <>
                            <Button
                              size="sm"
                              icon={<Check />}
                              disabled={aprobar.isPending}
                              onClick={() => {
                                setFalloDespacho(null)
                                aprobar.mutate(s.id, {
                                  onError: (e) => setFalloDespacho(e instanceof Error ? e.message : String(e)),
                                })
                              }}
                            >
                              {aprobar.isPending ? 'Aprobando…' : 'Aprobar'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<X />}
                              onClick={() => {
                                setMotivoCierre('')
                                setCerrando({ s, como: 'RECHAZAR' })
                              }}
                            >
                              No aprobar
                            </Button>
                          </>
                        ) : null}
                        {s.pedida_por === yo?.id || puedeAnular ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setMotivoCierre('')
                              setCerrando({ s, como: 'CANCELAR' })
                            }}
                          >
                            Cancelar
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </Card>
              ))}
            </div>
            {esperando.length > 0 && !puedoAprobar ? (
              <p className="text-ink/50 mt-2 text-xs">
                Los aprueba quien tenga el permiso «Aprobar los despachos» (la gerencia general, o a quien
                se le preste).
              </p>
            ) : null}
          </section>
        )
      })()}

      <h2 className="text-ink/85 font-titular mb-2 text-lg">Notas de entrega</h2>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<Truck />}
            titulo="Todavía no ha salido ningún camión"
            descripcion="Cada despacho se pide y, al aprobarlo, rebaja el patio y vale por sí solo. Si se decide facturarlo, se hace en Facturación y la nota queda enlazada a su factura. Si el patio está en cero, carga primero la producción desde Inventario › Existencias."
            accion={
              puedeDespachar ? (
                <Button icon={<Truck />} onClick={() => setNuevo(true)}>
                  Pedir despacho
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : null}

      {data && data.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Nota</th>
                  <th className="px-3 py-3 font-medium">Cliente</th>
                  <th className="px-3 py-3 font-medium">Vehículo</th>
                  <th className="px-3 py-3 font-medium">Fecha</th>
                  <th className="px-3 py-3 text-right font-medium">Total</th>
                  <th className="px-5 py-3 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.map((n) => (
                  <tr
                    key={n.id}
                    onClick={() => setDetalle(n)}
                    className="border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors last:border-0"
                  >
                    <td className="tabular text-ink/85 px-5 py-3 font-medium">
                      {n.numero}
                      {n.factura_numero ? (
                        <span className="text-ink/45 block text-xs">{n.factura_numero}</span>
                      ) : null}
                    </td>
                    <td className="text-ink/70 px-3 py-3">{n.cliente}</td>
                    <td className="text-ink/60 px-3 py-3 text-xs">
                      {n.vehiculo ?? '—'}
                      {n.chofer ? <span className="block">{n.chofer}</span> : null}
                    </td>
                    <td className="text-ink/60 px-3 py-3 text-xs">{fecha(n.fecha)}</td>
                    <td className="tabular text-ink/85 px-3 py-3 text-right font-medium">
                      {dinero(n.moneda, n.total)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Chip tone={TONO[n.estado] ?? 'neutral'}>{ETIQUETA[n.estado]}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* ---------------------------------------------------- despachar */}
      {nuevo ? (
        <Modal
          abierto
          ancho="lg"
          onCerrar={() => {
            setNuevo(false)
            limpiar()
          }}
          titulo="Pedir despacho"
          descripcion="No rebaja nada todavía. Al aprobarlo quien tiene el permiso, nace la nota de entrega y el material sale del patio."
          acciones={
            <>
              {/* Ocupa toda la fila para que no compita con los botones: es
                  una advertencia, no un control. */}
              {excedeCapacidad ? (
                <p className="border-warning/40 bg-warning-soft text-ink/80 mb-1 w-full rounded-[6px] border px-3 py-2 text-sm">
                  Se están cargando{' '}
                  <strong className="font-semibold">
                    {m3EnLaCarga.toLocaleString('es-VE', { maximumFractionDigits: 2 })} m³
                  </strong>{' '}
                  en un vehículo de {Number(vehiculoElegido!.capacidad_m3)} m³. Si es a propósito
                  —dos viajes, carga parcial— sigue adelante.
                </p>
              ) : null}

              {vehiculoElegido?.semaforo_mantenimiento === 'BLOQUEANTE' ? (
                <p
                  role="alert"
                  className="border-danger bg-danger-soft text-danger mb-1 w-full rounded-[6px] border px-3 py-2 text-sm font-medium"
                >
                  {vehiculoElegido.placa} pasó su tope de mantenimiento. No debería estar
                  trabajando.
                </p>
              ) : null}

              <Button
                variant="ghost"
                onClick={() => {
                  setNuevo(false)
                  limpiar()
                }}
              >
                Cancelar
              </Button>
              <Button
                disabled={
                  despachar.isPending ||
                  !clienteId ||
                  !almacenId ||
                  incompletas ||
                  faltaTransporte ||
                  aRenglones(filasEfectivas).length === 0
                }
                onClick={async () => {
                  const numero = await despachar.mutateAsync({
                    cliente_id: Number(clienteId),
                    almacen_id: Number(almacenId),
                    renglones: aRenglones(filasEfectivas),
                    moneda,
                    alicuota_iva: 0,
                    vehiculo,
                    vehiculo_descripcion: vehiculoDespElegido ? null : nuevoVehiculo.trim() || null,
                    chofer,
                    cedula_chofer: cedula,
                    ticket: ticket || null,
                    peso_bruto: Number(bruto) || null,
                    peso_tara: Number(tara) || null,
                    flete: Number(flete) || 0,
                    observacion: observacion || null,
                    ticket_id: Number(ticketId) || null,
                    guia_id: Number(guiaId) || null,
                  })
                  if (archivos.length > 0) {
                    try {
                      await subirFotosDeCarga('DESPACHO', [numero], archivos)
                    } catch (e) {
                      setFalloDespacho(
                        `El despacho ${numero} quedó pedido, pero las fotos no subieron (${e instanceof Error ? e.message : String(e)}). Añádelas desde su tarjeta.`,
                      )
                    }
                  }
                  setNuevo(false)
                  limpiar()
                }}
              >
                {despachar.isPending ? 'Enviando…' : 'Enviar a aprobación'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <SelectBuscable
                label="Cliente"
                vacio="Elige el cliente"
                valor={clienteId}
                onCambio={(v) => {
                  setClienteId(v)
                  const c = clientes?.find((x) => String(x.id) === v)
                  if (c) cambiarMoneda(c.moneda_preferida)
                }}
                opciones={(clientes ?? []).map((c) => ({
                  valor: String(c.id),
                  etiqueta: `${c.nombre} · ${documento(c.rif)}`,
                }))}
              />
            </div>
            <Select
              label="Moneda"
              value={moneda}
              onChange={(e) => cambiarMoneda(e.target.value)}
              opciones={monedas.data ?? []}
            />
            <div className="sm:col-span-3">
              <SelectBuscable
                label="De qué patio sale"
                vacio="Elige el patio o almacén"
                valor={almacenId}
                onCambio={(v) => setAlmacenId(v)}
                opciones={opcionesDePatio}
                hint="Si un renglón sale de otro patio, se elige en el renglón."
              />
            </div>
          </div>

          <div className="mt-4">
            <Renglones
              filas={filas}
              onCambiar={setFilas}
              precios={precios ?? []}
              moneda={moneda}
              patios={{
                opciones: opcionesDePatio,
                deLaNota: almacenId,
                existencias: (id) => (existencias ? (porPatio[id] ?? {}) : undefined),
              }}
              sinIva
              toneladasDeRomana={toneladasDeRomana}
            />
          </div>

          <div className="border-hairline rounded-card mt-4 border border-dashed p-3">
            <p className="text-ink/60 mb-3 text-xs">
              Datos del camión y de la romana. Si se vende en metros cúbicos, el peso no cambia lo
              que se factura: es la prueba del día que alguien discuta la cantidad. Si se vende un
              solo material en toneladas, las toneladas son las del ticket.
            </p>

            {/* El pesaje y la guía se eligen de lo que la garita ya registró.
                Elegir un ticket trae sus pesos y su placa: volver a teclearlos
                es la forma de que el papel y la báscula digan cosas distintas.
                La guía es opcional desde el 17/09/2026. */}
            <div className="mb-4 grid gap-4 sm:grid-cols-2">
              <Select
                label="Ticket de romana"
                vacio="Sin pesaje registrado"
                value={ticketId}
                onChange={(e) => {
                  setTicketId(e.target.value)
                  const t = ticketsLibres.find((x) => String(x.id) === e.target.value)
                  if (t) {
                    // La báscula guarda placa, chofer y cédula como texto. Si
                    // están en el catálogo se eligen; si no, quedan escritos
                    // al lado para añadirlos.
                    const v = (vehiculosDesp ?? []).find(
                      (x) => x.activo && x.placa === placaLimpia(t.vehiculo),
                    )
                    setVehiculoDespId(v ? String(v.id) : '')
                    setNuevaPlaca(v ? '' : t.vehiculo)
                    const c = (choferes ?? []).find(
                      (x) => x.activo && cedulaComparable(x.cedula) === cedulaComparable(t.cedula_chofer ?? ''),
                    )
                    setChoferId(c ? String(c.id) : '')
                    setNuevoChofer(c ? '' : (t.chofer ?? ''))
                    setNuevaCedula(c ? '' : (t.cedula_chofer ?? ''))
                    setBruto(String(Number(t.peso_bruto)))
                    setTara(String(Number(t.peso_tara)))
                    setTicket(t.numero)
                  }
                }}
                opciones={ticketsLibres.map((t) => ({
                  valor: String(t.id),
                  etiqueta: `${t.numero} · ${t.vehiculo} · ${enteros(t.peso_neto)} kg`,
                }))}
                hint={
                  ticketsLibres.length === 0
                    ? 'No hay pesajes sin usar. Se registran en Despachos › Tickets de romana.'
                    : 'Al elegirlo, los pesos y la placa se traen de la báscula.'
                }
              />
              <Select
                label="Guía de movilización"
                vacio="Sin guía"
                value={guiaId}
                onChange={(e) => setGuiaId(e.target.value)}
                opciones={guiasVigentes.map((g) => ({
                  valor: String(g.id),
                  etiqueta: `${g.numero_guia} · ${g.articulo} · ${enteros(g.cantidad)} ${g.unidad === 'TON' ? 't' : 'm³'}`,
                }))}
                /*
                  OPCIONAL DESDE EL 17/09/2026. Christopher: «No tenemos guía».
                  Decía en rojo que sin guía el despacho se rechazaría, y la
                  base lo cumplía. Si la hay, se engancha; si no, sale igual.
                */
                hint={
                  guiasVigentes.length === 0
                    ? 'Opcional. No hay guías cargadas: el despacho sale sin guía.'
                    : 'Opcional. Si este despacho lleva guía de movilización, elígela.'
                }
              />
            </div>

            {/*
              DATOS DEL DESPACHO, como el modelo que mandó Angélica: a la
              izquierda el chofer, a la derecha el vehículo; arriba se busca en
              el catálogo y debajo, si no está, se escribe y se añade. Los tres
              datos —nombre, cédula, placa— son obligatorios.
            */}
            <p className="text-ink/55 mb-2 text-xs font-medium tracking-wide uppercase">
              Datos del despacho
            </p>
            <div className="mb-4 grid gap-4 lg:grid-cols-2">
              <div>
                <SelectBuscable
                  label="Chofer / responsable"
                  vacio="Busca el chofer…"
                  valor={choferId}
                  onCambio={(v) => {
                    setChoferId(v)
                    if (v) {
                      setNuevoChofer('')
                      setNuevaCedula('')
                    }
                  }}
                  opciones={(choferes ?? [])
                    .filter((c) => c.activo)
                    .map((c) => ({ valor: String(c.id), etiqueta: `${c.nombre} · ${c.cedula}` }))}
                />
                {choferId === '' ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
                    <Input
                      label="¿No está? Nombre del chofer"
                      value={nuevoChofer}
                      onChange={(e) => setNuevoChofer(e.target.value)}
                    />
                    <CampoDocumento label="Cédula" valor={nuevaCedula} onCambiar={setNuevaCedula} />
                    <div className="flex items-end">
                      <Button
                        variant="outline"
                        disabled={
                          guardarChofer.isPending ||
                          nuevoChofer.trim().length < 3 ||
                          cedulaComparable(nuevaCedula).length < 5
                        }
                        onClick={() =>
                          guardarChofer.mutate(
                            { nombre: nuevoChofer, cedula: nuevaCedula },
                            {
                              onSuccess: (id) => {
                                setChoferId(String(id))
                                setNuevoChofer('')
                                setNuevaCedula('')
                              },
                            },
                          )
                        }
                      >
                        + Añadir
                      </Button>
                    </div>
                  </div>
                ) : null}
                {guardarChofer.error ? <ErrorDeCarga error={guardarChofer.error} className="mt-2" /> : null}
              </div>

              <div>
                <SelectBuscable
                  label="Vehículo"
                  vacio="Busca el vehículo…"
                  valor={vehiculoDespId}
                  onCambio={(v) => {
                    setVehiculoDespId(v)
                    if (v) {
                      setNuevoVehiculo('')
                      setNuevaPlaca('')
                    }
                  }}
                  opciones={(vehiculosDesp ?? [])
                    .filter((v) => v.activo)
                    .map((v) => ({
                      valor: String(v.id),
                      etiqueta: `${v.placa}${v.descripcion ? ` · ${v.descripcion}` : ''}`,
                    }))}
                />
                {vehiculoDespId === '' ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
                    <Input
                      label="¿No está? Vehículo (marca/modelo)"
                      value={nuevoVehiculo}
                      onChange={(e) => setNuevoVehiculo(e.target.value)}
                    />
                    <Input
                      label="Placa"
                      value={nuevaPlaca}
                      onChange={(e) => setNuevaPlaca(e.target.value)}
                    />
                    <div className="flex items-end">
                      <Button
                        variant="outline"
                        disabled={guardarVehiculo.isPending || placaLimpia(nuevaPlaca).length < 4}
                        onClick={() =>
                          guardarVehiculo.mutate(
                            { placa: nuevaPlaca, descripcion: nuevoVehiculo },
                            {
                              onSuccess: (id) => {
                                setVehiculoDespId(String(id))
                                setNuevoVehiculo('')
                                setNuevaPlaca('')
                              },
                            },
                          )
                        }
                      >
                        + Añadir
                      </Button>
                    </div>
                  </div>
                ) : null}
                {guardarVehiculo.error ? (
                  <ErrorDeCarga error={guardarVehiculo.error} className="mt-2" />
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Ticket de romana"
                value={ticket}
                onChange={(e) => setTicket(e.target.value)}
              />
              <Input
                label="Peso bruto (kg)"
                type="number"
                min="0"
                inputMode="decimal"
                value={bruto}
                onChange={(e) => setBruto(e.target.value)}
              />
              <Input
                label="Tara (kg)"
                type="number"
                min="0"
                inputMode="decimal"
                hint={
                  Number(bruto) > Number(tara)
                    ? `Neto: ${enteros(Number(bruto) - Number(tara))} kg`
                    : undefined
                }
                value={tara}
                onChange={(e) => setTara(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input
              label="Flete"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={flete}
              onChange={(e) => setFlete(e.target.value)}
            />
            <Textarea
              label="Observación"
              rows={2}
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
            />
          </div>

          <div className="mt-4">
            <ElegirArchivosDeCarga archivos={archivos} onCambiar={setArchivos} />
          </div>

          {faltaTransporte ? (
            <p className="text-ink/60 mt-3 text-xs">
              Para enviarlo falta{' '}
              {[
                chofer.length < 3 ? 'el nombre del chofer' : null,
                cedulaComparable(cedula).length < 5 ? 'su cédula' : null,
                vehiculo.length < 4 ? 'la placa del vehículo' : null,
              ]
                .filter(Boolean)
                .join(', ')}
              .
            </p>
          ) : null}

          <div className="bg-ink/4 rounded-card mt-4 p-4">
            <Totales
              moneda={moneda}
              subtotal={subtotal}
              descuento={0}
              flete={Number(flete) || 0}
              alicuota={0}
              iva={0}
              total={total}
              sinIva
            />
          </div>

          {despachar.error ? <ErrorDeCarga error={despachar.error} className="mt-4" /> : null}
        </Modal>
      ) : null}

      {/* ------------------------------------------------------ detalle */}
      {detalle ? (
        <Modal
          abierto
          ancho="lg"
          onCerrar={() => setDetalle(null)}
          titulo={detalle.numero}
          descripcion={`${detalle.cliente} · ${fecha(detalle.fecha)} · sale de ${detalle.almacen}`}
          acciones={
            <>
              <Button variant="ghost" onClick={() => setDetalle(null)}>
                Cerrar
              </Button>
              <Button
                variant="outline"
                icon={<Printer />}
                disabled={renglonesDetalle.isPending}
                onClick={() => void imprimir(detalle)}
              >
                Imprimir
              </Button>
              {detalle.estado === 'DESPACHADA' && puedeAnular ? (
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
              {detalle.estado === 'DESPACHADA' && puedeDespachar ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEnlazando(detalle)
                    setFacturaElegida('')
                  }}
                >
                  Enlazar a una factura
                </Button>
              ) : null}
              {detalle.estado === 'FACTURADA' &&
              puedeAnular &&
              (facturas.data ?? []).find((f) => f.id === detalle.factura_id)?.origen === 'DIRECTA' ? (
                <Button
                  variant="outline"
                  disabled={desenlazar.isPending}
                  onClick={async () => {
                    await desenlazar.mutateAsync(detalle.id)
                    setDetalle(null)
                  }}
                >
                  Soltar de la factura
                </Button>
              ) : null}
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={TONO[detalle.estado] ?? 'neutral'}>{ETIQUETA[detalle.estado]}</Chip>
            {detalle.vehiculo ? <Chip tone="neutral">{detalle.vehiculo}</Chip> : null}
            {detalle.peso_neto ? (
              <Chip tone="info">Neto {enteros(detalle.peso_neto)} kg</Chip>
            ) : null}
            {detalle.factura_numero ? (
              <Chip tone="success">En la factura {detalle.factura_numero}</Chip>
            ) : null}
          </div>

          {detalle.motivo_anulacion ? (
            <p className="text-danger mt-3 text-sm">Anulada: {detalle.motivo_anulacion}</p>
          ) : null}

          {/* De qué despacho salió: quién lo pidió, quién lo aprobó, y sus fotos. */}
          {(() => {
            const s = (solicitudes.data ?? []).find((x) => x.nota_id === detalle.id)
            if (!s) return null
            return (
              <div className="mt-3">
                <p className="text-ink/50 text-xs">
                  Despacho {s.numero} · lo pidió {nombreDe(s.pedida_por)} · {fechaHora(s.pedida_en)}
                  {s.resuelta_en ? ` · lo aprobó ${nombreDe(s.resuelta_por)} · ${fechaHora(s.resuelta_en)}` : ''}
                </p>
                <p className="text-ink/60 text-xs">
                  {s.vehiculo}
                  {s.vehiculo_descripcion ? ` · ${s.vehiculo_descripcion}` : ''} · {s.chofer} ·{' '}
                  {documento(s.cedula_chofer)}
                </p>
                <FotosDeCarga
                  origen="DESPACHO"
                  referencia={s.numero}
                  puedeAnadir={puedeDespachar && detalle.estado !== 'ANULADA'}
                />
              </div>
            )
          })()}

          <TablaRenglones
            moneda={detalle.moneda}
            renglones={renglonesDetalle.data ?? []}
            cargando={renglonesDetalle.isPending}
            patioDe={(r) => (r.almacen_id && r.almacen_id !== detalle.almacen_id ? nombreDePatio(r.almacen_id) : null)}
            sinIva
          />

          <div className="bg-ink/4 rounded-card mt-4 p-4">
            <Totales
              moneda={detalle.moneda}
              subtotal={Number(detalle.subtotal)}
              descuento={Number(detalle.descuento)}
              flete={Number(detalle.flete)}
              alicuota={0}
              iva={0}
              total={Number(detalle.total) - Number(detalle.iva)}
              sinIva
            />
          </div>
        </Modal>
      ) : null}

      {enlazando ? (
        <Modal
          abierto
          onCerrar={() => setEnlazando(null)}
          titulo={`Enlazar la nota ${enlazando.numero}`}
          descripcion="La nota pasa a facturada con el número de esa factura. La factura no cambia: sus montos siguen siendo los suyos."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setEnlazando(null)}>
                Cancelar
              </Button>
              <Button
                disabled={enlazar.isPending || !facturaElegida}
                onClick={async () => {
                  await enlazar.mutateAsync({ nota_id: enlazando.id, factura_id: Number(facturaElegida) })
                  setEnlazando(null)
                  setDetalle(null)
                }}
              >
                {enlazar.isPending ? 'Enlazando…' : 'Enlazar'}
              </Button>
            </>
          }
        >
          {(() => {
            const posibles = (facturas.data ?? []).filter(
              (f) =>
                f.cliente_id === enlazando.cliente_id &&
                f.estado !== 'ANULADA' &&
                f.origen === 'DIRECTA' &&
                !f.saca_material,
            )
            return (
              <Select
                label="Factura"
                vacio={posibles.length ? 'Elige la factura' : 'No hay ninguna disponible'}
                value={facturaElegida}
                onChange={(e) => setFacturaElegida(e.target.value)}
                opciones={posibles.map((f) => ({
                  valor: String(f.id),
                  etiqueta: `${f.numero} · ${fecha(f.fecha)} · ${dinero(f.moneda, f.total)}`,
                }))}
                hint="Solo facturas de este cliente emitidas sin nota y que no sacaron el material del patio."
              />
            )
          })()}
          {enlazar.error ? <ErrorDeCarga error={enlazar.error} className="mt-4" /> : null}
        </Modal>
      ) : null}

      {/* ------------------------------------------------------- anular */}
      {anulando ? (
        <Modal
          abierto
          onCerrar={() => setAnulando(null)}
          titulo={`Anular la nota ${anulando.numero}`}
          descripcion="El material vuelve al patio con un reverso. La nota se queda a la vista, anulada."
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
                  setDetalle(null)
                }}
              >
                {anular.isPending ? 'Anulando…' : 'Anular la nota'}
              </Button>
            </>
          }
        >
          <Textarea
            label="Por qué se anula"
            hint="Queda escrito en el registro de auditoría con tu nombre."
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            required
          />
          {anular.error ? <ErrorDeCarga error={anular.error} className="mt-4" /> : null}
        </Modal>
      ) : null}

      {cerrando ? (
        <Modal
          abierto
          ancho="sm"
          onCerrar={() => setCerrando(null)}
          titulo={cerrando.como === 'RECHAZAR' ? `No aprobar ${cerrando.s.numero}` : `Cancelar ${cerrando.s.numero}`}
          descripcion={
            cerrando.como === 'RECHAZAR'
              ? 'Quien lo pidió va a leer el motivo, así que conviene que diga algo.'
              : 'Queda escrito y no se puede editar después.'
          }
          acciones={
            <>
              <Button variant="ghost" onClick={() => setCerrando(null)}>
                Volver
              </Button>
              <Button
                disabled={motivoCierre.trim().length < 4 || rechazar.isPending || cancelar.isPending}
                onClick={async () => {
                  const accion = cerrando.como === 'RECHAZAR' ? rechazar : cancelar
                  await accion.mutateAsync({ id: cerrando.s.id, motivo: motivoCierre })
                  setCerrando(null)
                }}
              >
                {rechazar.isPending || cancelar.isPending ? 'Guardando…' : 'Confirmar'}
              </Button>
            </>
          }
        >
          <Textarea
            label={cerrando.como === 'RECHAZAR' ? 'Por qué no se aprueba' : 'Por qué se cancela'}
            rows={3}
            autoFocus
            value={motivoCierre}
            onChange={(e) => setMotivoCierre(e.target.value)}
          />
          {rechazar.error ? <ErrorDeCarga error={rechazar.error} className="mt-3" /> : null}
          {cancelar.error ? <ErrorDeCarga error={cancelar.error} className="mt-3" /> : null}
        </Modal>
      ) : null}

      <CatalogoTransporte
        abierto={catalogo}
        onCerrar={() => setCatalogo(false)}
        puedeEditar={puedeDespachar}
      />

      <Visor
        abierto={pdf !== null}
        onCerrar={() => setPdf(null)}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ""}
        titulo="Nota de entrega"
      />
    </>
  )
}
