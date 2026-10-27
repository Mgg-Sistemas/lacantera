import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useMonedasUsables, useTasaVigente } from '@/lib/api/tasas'
import { Check, Combine, FileText, MessageCircle, Pencil, Printer, Truck, X } from 'lucide-react'
import { CatalogoTransporte } from '@/components/CatalogoTransporte'
import { ElegirArchivosDeCarga, FotosDeCarga } from '@/components/FotosDeCarga'
import { subirFotosDeCarga } from '@/lib/api/fotosDeCarga'
import { usePerfiles, useMisRoles } from '@/lib/api/catalogo'
import {
  cedulaComparable,
  placaLimpia,
  useChoferes,
  useGuardarChofer,
  useGuardarVehiculoDeDespacho,
  useVehiculosDeDespacho,
} from '@/lib/api/transporte'
import { PageHeader } from '@/components/PageHeader'
import { RangoDeFechas } from '@/components/RangoDeFechas'
import { SIN_RANGO } from '@/components/rango'
import type { Rango } from '@/components/rango'
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
import { bolivares, dinero, documento, dolares, enteros, fecha, fechaHora } from '@/lib/formato'
import { useEmpresa } from '@/lib/api/empresa'
import { useMiPerfil } from '@/lib/api/usuarios'
import { useAlmacenes, useExistencias } from '@/lib/api/inventario'
import { useGuias, useTickets } from '@/lib/api/despachos'
import { useVehiculos } from '@/lib/api/vehiculos'
import { armarNotaDeEntrega, armarNotasDeEntrega } from '@/lib/ficha/notaDeEntregaPapel'
import { armarReporteNotasDeEntrega, type MaterialDespachado } from '@/lib/ficha/notasDeEntregaReportePdf'
import type { PdfArmado } from '@/lib/ficha/reciboPdf'
import {
  useAnularNota,
  useAprobarDespacho,
  useCancelarDespacho,
  useClientes,
  useMarcarNotaCobrada,
  useMarcarNotaPendientePorCobrar,
  useNotasEntrega,
  leerNotaEntregaPorNumero,
  usePrecios,
  usePuedoAprobarDespachos,
  useRechazarDespacho,
  useRenglones,
  renglonesCompletosDeNotas,
  renglonesDeNotas,
  useSolicitarDespacho,
  useSolicitudesDespacho,
  type NotaEntrega,
  type RenglonGuardado,
  type SolicitudDeDespacho,
} from '@/lib/api/ventas'
import {
  useCompletarNotaDeEntrega,
  useGuardarCamionesDeNota,
  leerOrdenDeLaNota,
  type SolicitudDeSalida,
} from '@/lib/api/salidas'
import { ModalNotaDeEntrega } from '@/pages/salidas/ModalNotaDeEntrega'
import { ModalReporteSalida } from '@/pages/salidas/ModalReporteSalida'
import { ListaDeCamiones, ModalCamiones } from './CamionesDeLaNota'
import { ModalEditarNotaEntrega } from './ModalEditarNotaEntrega'
import { ModalReporteDespacho } from './ModalReporteDespacho'
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
import { enCastellano, porQueNoSubio } from '@/lib/castellano'

/*
  LA NOTA NO ESTÁ ESPERANDO UNA FACTURA. Christopher, 17/09/2026: «una nota de
  entrega no necesariamente llevará o se anexará a una factura; manejarán sus
  estados de forma independiente hasta que se decida o no hacer factura (ahí
  cambiaría a facturada y se enlaza con el correlativo de la factura)». Por eso
  despachada se dice «Despachada», no «Por facturar», y no va en color de
  pendiente: no le falta nada.
*/
const TONO: Record<string, 'success' | 'neutral' | 'warning'> = {
  // La que nació de una nota de salida y le falta cliente o algún precio.
  PENDIENTE: 'warning',
  DESPACHADA: 'neutral',
  FACTURADA: 'success',
  ANULADA: 'neutral',
}

const ETIQUETA: Record<string, string> = {
  PENDIENTE: 'Pendiente por completar',
  DESPACHADA: 'Despachada',
  FACTURADA: 'Facturada',
  ANULADA: 'Anulada',
}

/*
  LO QUE SE APRUEBA, EN DINERO.

  La tarjeta de aprobación enseñaba cantidades y descripciones, y ni un monto.
  Los responsables lo dijeron con sus palabras: «estamos aprobando casi a
  ciegas». Y es literal — aprobar un despacho saca material del patio y crea una
  nota de entrega al cliente, así que es la última puerta antes de que la
  mercancía se vaya y haya que cobrarla.

  El precio unitario solo llega a quien tiene permiso de ver montos: la vista lo
  omite para los demás. Por eso la cuenta puede salir incompleta, y cuando sale
  incompleta hay que DECIRLO en vez de enseñar un total más bajo del real, que
  sería peor que no enseñar ninguno.
*/
function cuentaDelDespacho(s: SolicitudDeDespacho) {
  const conPrecio = s.renglones.filter((r) => r.precio_unitario != null)
  const material = conPrecio.reduce(
    (suma, r) => suma + Number(r.cantidad) * Number(r.precio_unitario ?? 0),
    0,
  )
  const flete = Number(s.flete ?? 0)

  return {
    material,
    flete,
    total: material + flete,
    /** Falso cuando algún renglón vino sin precio: el total no es de fiar. */
    completa: conPrecio.length === s.renglones.length,
    /** Ni un precio: no es que la cuenta esté a medias, es que no hay permiso. */
    sinPermiso: conPrecio.length === 0 && s.renglones.length > 0,
  }
}

export function NotasDeEntrega() {
  const monedas = useMonedasUsables()
  /*
    LOS FILTROS DE LA LISTA VIAJAN A LA BASE.

    Christopher, 28/09/2026: «en las notas de salida y de entrega poder buscar
    una nota en específico». La lista trae las 200 más recientes: filtrar aquí
    encontraría sólo entre esas, y una nota de hace meses diría «no existe»
    existiendo. Por eso lo escrito va en la consulta.
  */
  const [busca, setBusca] = useState('')
  const [estado, setEstado] = useState('')
  const [monedaFiltro, setMonedaFiltro] = useState('')
  const [cobroFiltro, setCobroFiltro] = useState<'' | 'PENDIENTE' | 'VENCIDA'>('')
  const [rango, setRango] = useState<Rango>(SIN_RANGO)
  const { data, isPending, error } = useNotasEntrega({
    texto: busca,
    ...(estado ? { estado } : {}),
    ...(monedaFiltro ? { moneda: monedaFiltro } : {}),
    ...(cobroFiltro ? { cobro: cobroFiltro } : {}),
    ...(rango.desde ? { desde: rango.desde } : {}),
    ...(rango.hasta ? { hasta: rango.hasta } : {}),
  })
  const hayFiltros = Boolean(
    busca.trim() || estado || monedaFiltro || cobroFiltro || rango.desde || rango.hasta,
  )
  const { data: clientes } = useClientes(true)
  const { data: precios } = usePrecios()
  const { data: almacenes } = useAlmacenes()
  const { data: empresa } = useEmpresa()
  const { data: yo } = useMiPerfil()
  const despachar = useSolicitarDespacho()
  const anular = useAnularNota()
  const marcarCobrada = useMarcarNotaCobrada()
  const marcarPendiente = useMarcarNotaPendientePorCobrar()
  const [marcandoPendiente, setMarcandoPendiente] = useState<NotaEntrega | null>(null)
  const [fechaPagoNueva, setFechaPagoNueva] = useState('')
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
  /*
    EL AVISO DE QUE EL REPORTE YA ESTÁ LISTO.

    Christopher, 16/10/2026: «me están pidiendo un reporte individual de cada
    salida y nota de entrega», generado justo al aprobar. No se abre solo
    —interrumpiría a quien aprueba varios despachos seguidos—: sale un aviso
    chico con un botón, y se queda ahí hasta que se cierra o se pide otro.
  */
  const [avisoDespacho, setAvisoDespacho] = useState<{
    notaId: number
    solicitudNumero: string
    pedidoPor: string
    aprobadoPor: string
  } | null>(null)
  const [verReporteDespacho, setVerReporteDespacho] = useState<{
    notaId: number
    solicitudNumero: string | null
    pedidoPor: string | null
    aprobadoPor: string | null
  } | null>(null)
  /*
    UNA NOTA TAMBIÉN PUEDE NACER DE UNA SALIDA (Pedir→Aprobar→Entregar), NO
    SOLO DE UN DESPACHO PEDIDO. `solicitudes_despacho` no tiene esa solicitud
    —por eso el botón de abajo cae aquí cuando no la encuentra ahí—, y las
    fotos de esa salida viven con origen 'SALIDA', no 'DESPACHO': por eso se
    enseña con `ModalReporteSalida`, ya probado, y no estirando el de despacho.
  */
  const [verReporteSalida, setVerReporteSalida] = useState<{
    s: SolicitudDeSalida
    numeroNota: string
    destino: string | null
  } | null>(null)
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
  // Editar la nota entera es solo de ADMIN: lo exige también la función de la
  // base, esto solo decide si se enseña el botón.
  const { puede: puedeRol } = useMisRoles()
  const puedeEditar = puedeRol('ADMIN')

  const [nuevo, setNuevo] = useState(false)
  const [detalle, setDetalle] = useState<NotaEntrega | null>(null)
  const [editando, setEditando] = useState<NotaEntrega | null>(null)
  const [anulando, setAnulando] = useState<NotaEntrega | null>(null)
  /*
    UN ENLACE QUE TRAE `?nota=NE-2026-0012` ABRE ESA NOTA. Es como llega quien
    toca el número en Control de despacho. Si la nota es más vieja que las 200
    que carga la lista, se pide por su número. El parámetro se quita al abrir:
    cerrar el detalle no debe volver a abrirlo.
  */
  const [parametros, setParametros] = useSearchParams()
  const notaPedida = parametros.get('nota')
  useEffect(() => {
    if (!notaPedida || !data) return
    let vigente = true
    const abrirla = async () => {
      const laNota = data.find((n) => n.numero === notaPedida) ?? (await leerNotaEntregaPorNumero(notaPedida))
      if (!vigente) return
      if (laNota) setDetalle(laNota)
      setParametros({}, { replace: true })
    }
    void abrirla().catch(() => setParametros({}, { replace: true }))
    return () => {
      vigente = false
    }
  }, [notaPedida, data, setParametros])
  /*
    COMPLETAR LA QUE NACIÓ DE UNA NOTA DE SALIDA. Christopher, 21/09/2026: nace
    con lo mismo que la salida —sin precios, y sin cliente si el destino no
    coincide con ninguno— y se ve marcada hasta que alguien le pone lo que falta.
    Ponerle precio a una venta es de Facturación, así que se completa aquí.
  */
  const completar = useCompletarNotaDeEntrega()
  const guardarCamiones = useGuardarCamionesDeNota()
  const [completando, setCompletando] = useState<NotaEntrega | null>(null)
  // Los camiones se ponen o se corrigen aparte, en cualquier nota que no esté
  // anulada: la que nació de una salida llegó sin ninguno, y a la de siempre
  // puede faltarle el segundo.
  const [camionesDe, setCamionesDe] = useState<NotaEntrega | null>(null)
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
  const [reporte, setReporte] = useState<PdfArmado | null>(null)
  const [armandoReporte, setArmandoReporte] = useState(false)
  const [armandoLote, setArmandoLote] = useState(false)

  const [clienteId, setClienteId] = useState('')
  const [almacenId, setAlmacenId] = useState('')
  const [moneda, setMoneda] = useState('USD')
  /*
    PAGO COMBINADO: PARTE EN $, PARTE EN BS.

    Solo tiene sentido con la nota en dólares —es el caso real: precio en
    $, una parte se paga en efectivo en bolívares—. En cualquier otra
    moneda la casilla no se ofrece, y se apaga sola si el cliente elegido
    cambia la moneda a otra cosa.
  */
  const [pagoCombinado, setPagoCombinado] = useState(false)
  const [montoUsdCombinado, setMontoUsdCombinado] = useState('')
  const [montoBsCombinado, setMontoBsCombinado] = useState('')
  /*
    PENDIENTE POR COBRAR, APARTE DE FACTURACIÓN.

    Christopher, 12/10/2026: un recordatorio con fecha de pago, sin enlazarse
    a cuentas por cobrar, notas de crédito ni ninguna factura. La base exige
    la fecha cuando se marca, y que no sea anterior a hoy.
  */
  const [pendienteCobro, setPendienteCobro] = useState(false)
  const [fechaPago, setFechaPago] = useState('')
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
  const { data: existencias } = useExistencias(undefined, nuevo || editando !== null)
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

  /*
    EL PAGO COMBINADO SE COMPRUEBA CONTRA EL TOTAL, AQUÍ, NO EN LA BASE.

    `solicitar_despacho` solo exige que las dos cifras estén presentes y no
    sean negativas —no tiene un total que comprobar, ver la migración—.
    Pero la pantalla sí tiene el total a mano, así que es aquí donde se
    avisa si las dos partes no cuadran con lo que de verdad cuesta la nota,
    igual de en caliente que el resto de los avisos de este formulario.
  */
  const tasaUsdHoy = Number(tasaHoy?.tasa ?? 0)
  const totalUsdEquivalente = moneda === 'USD' ? total : tasaUsdHoy > 0 ? total / tasaUsdHoy : 0
  const combinadoUsd = Number(montoUsdCombinado) || 0
  const combinadoBsEnUsd = tasaUsdHoy > 0 ? (Number(montoBsCombinado) || 0) / tasaUsdHoy : 0
  const diferenciaCombinado = totalUsdEquivalente - combinadoUsd - combinadoBsEnUsd
  const combinadoCuadra = Math.abs(diferenciaCombinado) < 0.01
  const faltaElCombinado =
    pagoCombinado && (montoUsdCombinado.trim() === '' || montoBsCombinado.trim() === '' || !combinadoCuadra)

  // La lista en bolívares no es el mismo número que en dólares.
  const cambiarMoneda = (nueva: string) => {
    setMoneda(nueva)
    setFilas((actuales) => repreciar(actuales, precios ?? [], nueva, Number(tasaHoy?.tasa ?? 0)))
    // El pago combinado solo tiene sentido en dólares: ver la nota de arriba.
    if (nueva !== 'USD') {
      setPagoCombinado(false)
      setMontoUsdCombinado('')
      setMontoBsCombinado('')
    }
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
    setPagoCombinado(false)
    setMontoUsdCombinado('')
    setMontoBsCombinado('')
    setPendienteCobro(false)
    setFechaPago('')
  }

  // El papel se arma en un solo sitio: también lo imprime Salidas, cuando una
  // nota de salida dejó su nota de entrega de respaldo.
  const imprimir = async (n: NotaEntrega) => {
    setPdf(
      await armarNotaDeEntrega({
        nota: n,
        renglones: renglonesDetalle.data ?? [],
        cliente: clientes?.find((c) => c.id === n.cliente_id) ?? null,
        empresa,
        emitidoPor: yo?.nombre ?? '',
      }),
    )
  }

  /*
    IMPRIMIR NOTAS: CADA UNA COMPLETA, NO UN RESUMEN.

    Christopher, 23/10/2026: «un botón para imprimir todas las notas de
    entrega por categoría, no un reporte de todas, necesito cada nota de
    entrega». A diferencia de `verReporte` —que suma material y descarta las
    anuladas—, esto imprime exactamente lo que está filtrado en pantalla, tal
    cual está, en el mismo papel que sale al pedir una nota sola. Sin tope de
    cuántas: que el propio filtro (Estado, fechas…) se encargue de acotar.
  */
  const imprimirLote = async () => {
    setArmandoLote(true)
    try {
      const notas = data ?? []
      const renglones = await renglonesCompletosDeNotas(notas.map((n) => n.id))
      const renglonesPorNota = new Map<number, RenglonGuardado[]>()
      for (const r of renglones) {
        const lista = renglonesPorNota.get(r.nota_id) ?? []
        lista.push(r)
        renglonesPorNota.set(r.nota_id, lista)
      }
      const clientePorId = new Map((clientes ?? []).map((c) => [c.id, c]))

      setPdf(
        await armarNotasDeEntrega({
          notas,
          renglonesPorNota,
          clientePorId,
          empresa,
          emitidoPor: yo?.nombre ?? '',
        }),
      )
    } finally {
      setArmandoLote(false)
    }
  }

  // El reporte junta las notas tal como están filtradas en pantalla, cada una
  // con el total en su propia moneda y su equivalente en Bs y en $ a la tasa
  // que quedó congelada el día en que se emitió — no la de hoy.
  const verReporte = async () => {
    setArmandoReporte(true)
    try {
      const alcance = [
        busca.trim() ? `búsqueda «${busca.trim()}»` : '',
        estado ? `estado ${ETIQUETA[estado] ?? estado}` : '',
        monedaFiltro
          ? `moneda ${monedas.data?.find((m) => m.valor === monedaFiltro)?.etiqueta ?? monedaFiltro}`
          : '',
        rango.desde || rango.hasta ? `del ${rango.desde ? fecha(rango.desde) : 'inicio'} al ${rango.hasta ? fecha(rango.hasta) : 'hoy'}` : '',
      ]
        .filter(Boolean)
        .join(' · ') || `Las ${data?.length ?? 0} más recientes`

      const vigentes = (data ?? []).filter((n) => n.estado !== 'ANULADA')
      const porNota = new Map(vigentes.map((n) => [n.id, n]))
      const renglones = await renglonesDeNotas(vigentes.map((n) => n.id))

      /*
        QUÉ MATERIAL SE DESPACHÓ, SUMADO EN BS Y EN $.

        El renglón solo guarda su subtotal en la moneda de la nota; se
        convierte con la tasa de ESA nota, no con una tasa general, igual
        que ya hace el total de la planilla — es la misma regla de que la
        cifra del papel sea siempre la de la fila que la originó.
      */
      const porArticulo = new Map<string, MaterialDespachado>()
      for (const r of renglones) {
        const nota = porNota.get(r.nota_id)
        if (!nota) continue
        const subtotal = Number(r.subtotal)
        const subtotalBs = subtotal * Number(nota.tasa)
        const subtotalUsd = subtotalBs / Number(nota.tasa_usd)
        const clave = `${r.articulo}··${r.unidad}`
        const previo = porArticulo.get(clave)
        porArticulo.set(clave, {
          articulo: r.articulo,
          unidad: r.unidad,
          cantidad: (previo?.cantidad ?? 0) + Number(r.cantidad),
          subtotalBs: (previo?.subtotalBs ?? 0) + subtotalBs,
          subtotalUsd: (previo?.subtotalUsd ?? 0) + subtotalUsd,
        })
      }

      setReporte(
        await armarReporteNotasDeEntrega({
          empresa: { razonSocial: empresa?.razon_social ?? '', rif: empresa?.rif ?? '' },
          emitidoPor: yo?.nombre ?? '',
          momento: new Date(),
          alcance,
          notas: data ?? [],
          materiales: [...porArticulo.values()],
        }),
      )
    } finally {
      setArmandoReporte(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Notas de entrega"
        description="Notas de entrega: el documento con el que sale el camión. El despacho se solicita con chofer, cédula y placa; al aprobarse se emite la nota y el material se descuenta del patio."
        actions={
          <>
            <Button variant="outline" icon={<Truck />} onClick={() => setCatalogo(true)}>
              Choferes / Vehículos
            </Button>
            <Button
              variant="outline"
              icon={<FileText />}
              disabled={!data || data.length === 0 || armandoReporte}
              onClick={() => void verReporte()}
            >
              {armandoReporte ? 'Armando…' : 'Reporte Bs/$'}
            </Button>
            <Button
              variant="outline"
              icon={<Printer />}
              disabled={!data || data.length === 0 || armandoLote}
              onClick={() => void imprimirLote()}
            >
              {armandoLote ? 'Armando…' : 'Imprimir notas'}
            </Button>
            {puedeDespachar ? (
              <Button icon={<Truck />} onClick={() => setNuevo(true)}>
                Pedir despacho
              </Button>
            ) : null}
          </>
        }
      />

      {avisoDespacho ? (
        <div className="border-success/30 bg-success-soft mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[6px] border p-3.5">
          <p className="text-ink/80 flex items-center gap-2 text-sm">
            <Check className="text-success size-[18px] shrink-0" />
            <span>
              <strong className="font-semibold">Despacho aprobado</strong> — el reporte para
              compartir ya está listo.
            </span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              icon={<MessageCircle />}
              onClick={() => {
                setVerReporteDespacho(avisoDespacho)
                setAvisoDespacho(null)
              }}
            >
              Ver reporte
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<X />}
              aria-label="Cerrar aviso"
              onClick={() => setAvisoDespacho(null)}
            />
          </div>
        </div>
      ) : null}

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
              <p className="text-ink/50 text-sm">Sin despachos pendientes de aprobación.</p>
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
                      {/*
                        Cada renglón con su precio y su importe, y el importe
                        alineado a la derecha: una columna de cifras que no se
                        puede recorrer con el dedo no sirve para cuadrar nada.
                      */}
                      <ul className="text-ink/75 mt-2 space-y-0.5 text-sm">
                        {s.renglones.map((r, i) => (
                          <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <span className="min-w-0">
                              {Number(r.cantidad).toLocaleString('es-VE', { maximumFractionDigits: 2 })}{' '}
                              {r.unidad ?? ''} · {r.descripcion || r.articulo || '—'}
                              {r.precio_unitario != null ? (
                                <span className="text-ink/45">
                                  {' '}· {dinero(s.moneda, r.precio_unitario)} c/u
                                </span>
                              ) : null}
                            </span>
                            {r.precio_unitario != null ? (
                              <span className="text-ink/85 tabular shrink-0 font-medium">
                                {dinero(s.moneda, Number(r.cantidad) * Number(r.precio_unitario))}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>

                      {/* EL TOTAL, QUE ES LO QUE SE ESTABA APROBANDO A CIEGAS. */}
                      {(() => {
                        const c = cuentaDelDespacho(s)
                        if (c.sinPermiso) {
                          return (
                            <p className="text-ink/45 border-hairline mt-2 border-t pt-2 text-xs">
                              Los montos de este despacho no se muestran con su permiso.
                            </p>
                          )
                        }
                        return (
                          <div className="border-hairline mt-2 space-y-0.5 border-t pt-2 text-sm">
                            {c.flete > 0 ? (
                              <>
                                <p className="text-ink/60 flex justify-between gap-3">
                                  <span>Material</span>
                                  <span className="tabular">{dinero(s.moneda, c.material)}</span>
                                </p>
                                <p className="text-ink/60 flex justify-between gap-3">
                                  <span>Flete</span>
                                  <span className="tabular">{dinero(s.moneda, c.flete)}</span>
                                </p>
                              </>
                            ) : null}
                            <p className="text-ink/90 flex justify-between gap-3 font-medium">
                              <span>Total del despacho</span>
                              <span className="tabular">{dinero(s.moneda, c.total)}</span>
                            </p>
                            {!c.completa ? (
                              <p className="text-warning text-xs">
                                Falta el precio de algún renglón: el total está incompleto.
                              </p>
                            ) : null}
                            {s.pago_combinado ? (
                              <p className="text-ink/60 text-xs">
                                Pago combinado: {dolares(s.monto_usd_combinado ?? 0)} + {bolivares(s.monto_bs_combinado ?? 0)}
                              </p>
                            ) : null}
                            {s.pendiente_por_cobrar ? (
                              <p className="text-ink/60 text-xs">
                                Pendiente por cobrar · vence {fecha(s.fecha_pago!)}
                              </p>
                            ) : null}
                          </div>
                        )
                      })()}
                      {/*
                        LOS CORRELATIVOS, JUNTOS Y ANTES DE DECIDIR.

                        Estaban repartidos: el del despacho arriba, el de la nota
                        solo cuando ya existía, y el ticket de romana en ninguna
                        parte. Quien aprueba necesita poder decir «este despacho
                        es el del ticket tal», que es como se cotejan los papeles
                        en el patio.

                        Solo aparecen los que hay. Un renglón con tres rayas no
                        informa de nada y ocupa el sitio de lo que sí importa.
                      */}
                      {s.ticket || s.nota_numero ? (
                        <p className="text-ink/55 mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs">
                          {s.ticket ? <span>Ticket {s.ticket}</span> : null}
                          {s.nota_numero ? <span>Nota {s.nota_numero}</span> : null}
                        </p>
                      ) : null}

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
                                  onSuccess: (notaId) =>
                                    setAvisoDespacho({
                                      notaId,
                                      solicitudNumero: s.numero,
                                      pedidoPor: nombreDe(s.pedida_por),
                                      aprobadoPor: yo?.nombre ?? '—',
                                    }),
                                  onError: (e) => setFalloDespacho(enCastellano(e)),
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

      {/*
        BUSCAR UNA NOTA, Y NO SÓLO RECORRER LA LISTA.

        Se busca contra todo lo que alguien tiene a mano cuando pregunta por
        una nota: su número, el cliente, el RIF, la placa, el chofer, el ticket
        de romana, el NS que respalda y la factura en la que terminó. Es un
        campo y no seis, porque quien busca no sabe de antemano cuál de esos
        datos es el que tiene escrito.
      */}
      <Card className="mb-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_minmax(0,10rem)_minmax(0,10rem)_minmax(0,11rem)]">
          <Input
            label="Buscar una nota"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="NE-2026-0042, el cliente, la placa, el NS o la factura"
            hint="Busca en todas las notas, no solo en las que se ven."
          />
          <Select
            label="Estado"
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            opciones={[
              { valor: '', etiqueta: 'Cualquiera' },
              ...Object.entries(ETIQUETA).map(([valor, etiqueta]) => ({ valor, etiqueta })),
            ]}
          />
          {/*
            LA CATEGORÍA ELEGIBLE QUE PIDIÓ EL USUARIO: despachos en $ o en
            Bs, por separado. Es la moneda EN LA QUE SE EMITIÓ la nota, no el
            equivalente — una nota en bolívares siempre tiene su columna en
            dólares al lado, y esto no filtra por esa columna.
          */}
          <Select
            label="Moneda"
            value={monedaFiltro}
            onChange={(e) => setMonedaFiltro(e.target.value)}
            opciones={[
              { valor: '', etiqueta: 'Cualquiera' },
              ...(monedas.data ?? []).map((m) => ({ valor: m.valor, etiqueta: m.etiqueta })),
            ]}
          />
          {/*
            PENDIENTE POR COBRAR, LA CATEGORÍA APARTE DE FACTURACIÓN.
            Christopher, 12/10/2026: buscar por esto en Notas de entrega.
          */}
          <Select
            label="Cobro"
            value={cobroFiltro}
            onChange={(e) => setCobroFiltro(e.target.value as '' | 'PENDIENTE' | 'VENCIDA')}
            opciones={[
              { valor: '', etiqueta: 'Cualquiera' },
              { valor: 'PENDIENTE', etiqueta: 'Pendiente por cobrar' },
              { valor: 'VENCIDA', etiqueta: 'Vencidas' },
            ]}
          />
        </div>
        <div className="mt-3">
          <RangoDeFechas valor={rango} onCambio={setRango} />
        </div>
      </Card>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<Truck />}
            titulo={hayFiltros ? 'Sin resultados' : 'Sin notas de entrega'}
            descripcion={
              hayFiltros
                ? 'La búsqueda abarca todas las notas. Verifique el número completo —formato NE-2026-0042, con año y cuatro dígitos— o quite el estado y las fechas.'
                : 'Cada despacho se solicita y, al aprobarse, se descuenta del patio y tiene validez propia. Si se factura, se hace en Facturación › Facturas. Si el patio está en cero, registre primero la producción en Inventario › Existencias.'
            }
            accion={
              puedeDespachar && !hayFiltros ? (
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
            <table className="w-full min-w-[940px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Nota</th>
                  <th className="px-3 py-3 font-medium">Cliente</th>
                  <th className="px-3 py-3 font-medium">Vehículo</th>
                  <th className="px-3 py-3 font-medium">Fecha</th>
                  <th className="px-3 py-3 text-right font-medium">Total</th>
                  <th className="px-3 py-3 text-right font-medium">Total Bs</th>
                  <th className="px-3 py-3 text-right font-medium">Total $</th>
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
                    <td className="text-ink/70 px-3 py-3">
                      {n.cliente ?? <span className="text-ink/40 italic">Cliente por concretar</span>}
                      {n.nota_salida ? (
                        <span className="text-ink/45 block text-xs">
                          Respalda la salida {n.nota_salida}
                          {n.facturable ? '' : ' · solo respaldo'}
                        </span>
                      ) : null}
                    </td>
                    <td className="text-ink/60 px-3 py-3 text-xs">
                      {n.vehiculo ?? '—'}
                      {n.chofer ? <span className="block">{n.chofer}</span> : null}
                    </td>
                    <td className="text-ink/60 px-3 py-3 text-xs">{fecha(n.fecha)}</td>
                    <td className="tabular text-ink/85 px-3 py-3 text-right font-medium">
                      <span className="inline-flex items-center justify-end gap-1">
                        {dinero(n.moneda, n.total)}
                        {n.pago_combinado ? (
                          <span
                            title={`Pago combinado: ${dolares(n.monto_usd_combinado ?? 0)} + ${bolivares(n.monto_bs_combinado ?? 0)}`}
                          >
                            <Combine className="text-ink/45 size-3.5 shrink-0" />
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="tabular text-ink/60 px-3 py-3 text-right text-xs">
                      {bolivares(n.total_bs)}
                    </td>
                    <td className="tabular text-ink/60 px-3 py-3 text-right text-xs">
                      {dolares(n.total_usd)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <Chip tone={TONO[n.estado] ?? 'neutral'}>{ETIQUETA[n.estado]}</Chip>
                        {n.pendiente_por_cobrar && !n.cobrada_en ? (
                          <Chip tone={n.vencida_por_cobrar ? 'danger' : 'warning'}>
                            {n.vencida_por_cobrar ? 'Vencida' : 'Por cobrar'} · {fecha(n.fecha_pago!)}
                          </Chip>
                        ) : null}
                      </div>
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
                  en un vehículo de {Number(vehiculoElegido!.capacidad_m3)} m³. Se puede seguir.
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
                  faltaElCombinado ||
                  (pendienteCobro && !fechaPago) ||
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
                    pago_combinado: pagoCombinado,
                    monto_usd_combinado: pagoCombinado ? combinadoUsd : null,
                    monto_bs_combinado: pagoCombinado ? Number(montoBsCombinado) || 0 : null,
                    pendiente_por_cobrar: pendienteCobro,
                    fecha_pago: pendienteCobro ? fechaPago : null,
                  })
                  if (archivos.length > 0) {
                    try {
                      await subirFotosDeCarga('DESPACHO', [numero], archivos)
                    } catch (e) {
                      setFalloDespacho(
                        `El despacho ${numero} quedó pedido, pero las fotos no subieron${porQueNoSubio(e)} Añádalas desde su tarjeta.`,
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
                vacio="Seleccione el cliente"
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
                label="Patio"
                vacio="Seleccione el patio o almacén"
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
              que se factura. Si se vende un solo material en toneladas, las toneladas son las del
              ticket.
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
                    ? 'No hay pesajes sin usar.'
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
                    ? 'No hay guías vigentes.'
                    : 'Si este despacho lleva guía de movilización, elíjala.'
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
                  vacio="Busque el chofer…"
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
                      label="Nombre del chofer"
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
                  vacio="Busque el vehículo…"
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
                      label="Vehículo (marca/modelo)"
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

          {/*
            PAGO COMBINADO: SOLO CON LA NOTA EN DÓLARES.

            Es el caso real —precio en $, una parte se paga en efectivo en
            bolívares—; en cualquier otra moneda la casilla no aporta nada y
            se apaga sola (ver `cambiarMoneda`).
          */}
          {moneda === 'USD' ? (
            <div className="mt-4">
              <label className="border-hairline flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm">
                <input
                  type="checkbox"
                  className="accent-royal-600 mt-0.5 size-4 shrink-0"
                  checked={pagoCombinado}
                  onChange={(e) => {
                    setPagoCombinado(e.target.checked)
                    if (!e.target.checked) {
                      setMontoUsdCombinado('')
                      setMontoBsCombinado('')
                    }
                  }}
                />
                <span className="text-ink/80">
                  Pago combinado: parte en $ y parte en Bs
                  <span className="text-ink/50 mt-0.5 block text-xs">
                    No rebaja nada todavía: es lo que se espera cobrar, para que quien aprueba
                    y quien factura lo tengan presente.
                  </span>
                </span>
              </label>

              {pagoCombinado ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Monto en $"
                    type="number"
                    value={montoUsdCombinado}
                    onChange={(e) => setMontoUsdCombinado(e.target.value)}
                    placeholder="0,00"
                  />
                  <Input
                    label="Monto en Bs"
                    type="number"
                    value={montoBsCombinado}
                    onChange={(e) => setMontoBsCombinado(e.target.value)}
                    placeholder="0,00"
                  />
                  <p
                    className={`text-xs sm:col-span-2 ${
                      montoUsdCombinado.trim() === '' || montoBsCombinado.trim() === ''
                        ? 'text-ink/50'
                        : combinadoCuadra
                          ? 'text-success'
                          : 'text-warning'
                    }`}
                  >
                    {montoUsdCombinado.trim() === '' || montoBsCombinado.trim() === ''
                      ? 'Falta indicar cuánto se paga en cada moneda.'
                      : combinadoCuadra
                        ? `Cuadra con el total de la nota (${dolares(totalUsdEquivalente)}).`
                        : diferenciaCombinado > 0
                          ? `Faltan ${dolares(diferenciaCombinado)} por cubrir del total.`
                          : `Sobran ${dolares(Math.abs(diferenciaCombinado))} respecto al total.`}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {/*
            PENDIENTE POR COBRAR, APARTE DE FACTURACIÓN.

            Christopher, 12/10/2026: un recordatorio con fecha de pago, sin
            enlazarse a cuentas por cobrar, notas de crédito ni ninguna
            factura. Se puede buscar después por esa categoría, y la campana
            avisa sola cuando se pasa la fecha.
          */}
          <div className="mt-4">
            <label className="border-hairline flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm">
              <input
                type="checkbox"
                className="accent-royal-600 mt-0.5 size-4 shrink-0"
                checked={pendienteCobro}
                onChange={(e) => {
                  setPendienteCobro(e.target.checked)
                  if (!e.target.checked) setFechaPago('')
                }}
              />
              <span className="text-ink/80">
                Pendiente por cobrar
                <span className="text-ink/50 mt-0.5 block text-xs">
                  No se enlaza a Facturación ni a cuentas por cobrar: es solo un recordatorio con
                  fecha de pago. Se puede buscar después por esta categoría, y el sistema avisa si
                  se pasa la fecha.
                </span>
              </span>
            </label>

            {pendienteCobro ? (
              <div className="mt-3">
                <Input
                  label="Fecha de pago"
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={fechaPago}
                  onChange={(e) => setFechaPago(e.target.value)}
                  hint={!fechaPago ? 'Hace falta para dejarla pendiente por cobrar.' : undefined}
                />
              </div>
            ) : null}
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
          descripcion={`${detalle.cliente ?? 'Cliente por concretar'} · ${fecha(detalle.fecha)} · sale de ${detalle.almacen}${detalle.nota_salida ? ` · respalda la nota de salida ${detalle.nota_salida}` : ''}`}
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
              <Button
                variant="outline"
                icon={<MessageCircle />}
                onClick={() => {
                  void (async () => {
                    const s = (solicitudes.data ?? []).find((x) => x.nota_id === detalle.id)
                    if (s) {
                      setVerReporteDespacho({
                        notaId: detalle.id,
                        solicitudNumero: s.numero,
                        pedidoPor: nombreDe(s.pedida_por),
                        aprobadoPor: nombreDe(s.resuelta_por),
                      })
                      return
                    }

                    const orden = detalle.nota_salida
                      ? await leerOrdenDeLaNota(detalle.nota_salida).catch(() => null)
                      : null
                    if (orden) {
                      setVerReporteSalida({
                        s: orden,
                        numeroNota: detalle.nota_salida as string,
                        destino: detalle.cliente ?? null,
                      })
                      return
                    }

                    setVerReporteDespacho({
                      notaId: detalle.id,
                      solicitudNumero: null,
                      pedidoPor: null,
                      aprobadoPor: null,
                    })
                  })()
                }}
              >
                Reporte
              </Button>
              {puedeEditar ? (
                <Button
                  variant="outline"
                  icon={<Pencil />}
                  disabled={renglonesDetalle.isPending}
                  onClick={() => setEditando(detalle)}
                >
                  Editar
                </Button>
              ) : null}
              {detalle.estado === 'PENDIENTE' && puedeDespachar ? (
                <Button
                  disabled={renglonesDetalle.isPending}
                  onClick={() => {
                    completar.reset()
                    setCompletando(detalle)
                  }}
                >
                  Completar
                </Button>
              ) : null}
              {detalle.estado !== 'ANULADA' && puedeDespachar ? (
                <Button variant="outline" icon={<Truck />} onClick={() => setCamionesDe(detalle)}>
                  Camiones
                </Button>
              ) : null}
              {(detalle.estado === 'DESPACHADA' || detalle.estado === 'PENDIENTE') && puedeAnular ? (
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
              {detalle.estado === 'DESPACHADA' && detalle.facturable && puedeDespachar ? (
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
            {detalle.pendiente_por_cobrar ? (
              detalle.cobrada_en ? (
                <Chip tone="success">Cobrada el {fecha(detalle.cobrada_en)}</Chip>
              ) : (
                <Chip tone={detalle.vencida_por_cobrar ? 'danger' : 'warning'}>
                  {detalle.vencida_por_cobrar ? 'Vencida' : 'Por cobrar'} · vence{' '}
                  {fecha(detalle.fecha_pago!)}
                </Chip>
              )
            ) : null}
          </div>

          {detalle.motivo_anulacion ? (
            <p className="text-danger mt-3 text-sm">Anulada: {detalle.motivo_anulacion}</p>
          ) : null}

          {/*
            PENDIENTE POR COBRAR: EL ÚNICO BOTÓN QUE LE HACE FALTA.
            Christopher, 12/10/2026: marcarla como cobrada apaga el
            recordatorio. No reversa nada, no hay nada que reversar.
          */}
          {detalle.pendiente_por_cobrar && !detalle.cobrada_en && puedeDespachar ? (
            <div className="border-hairline mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[6px] border p-3 text-sm">
              <span className="text-ink/70">
                Pendiente por cobrar, vence el {fecha(detalle.fecha_pago!)}.
              </span>
              <Button
                size="sm"
                variant="outline"
                icon={<Check />}
                disabled={marcarCobrada.isPending}
                onClick={() => marcarCobrada.mutate({ id: detalle.id })}
              >
                {marcarCobrada.isPending ? 'Guardando…' : 'Marcar como cobrada'}
              </Button>
            </div>
          ) : null}
          {marcarCobrada.error ? (
            <ErrorDeCarga error={marcarCobrada.error} className="mt-2" />
          ) : null}

          {/*
            UNA NOTA QUE YA NACIÓ SIN LA CASILLA. Christopher, 14/10/2026:
            notas ya despachadas que hacía falta dejar pendientes por cobrar
            después. Solo si no está ya abierta una cuenta (pendiente sin
            cobrar) ni anulada.
          */}
          {!(detalle.pendiente_por_cobrar && !detalle.cobrada_en) &&
          detalle.estado !== 'ANULADA' &&
          puedeDespachar ? (
            <div className="mt-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFechaPagoNueva('')
                  setMarcandoPendiente(detalle)
                }}
              >
                Marcar pendiente por cobrar
              </Button>
            </div>
          ) : null}

          <ListaDeCamiones camiones={detalle.camiones ?? []} />

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
                vacio={posibles.length ? 'Seleccione la factura' : 'Sin facturas disponibles'}
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
            label="Motivo"
            hint="Queda escrito en el registro de auditoría con su nombre."
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            required
          />
          {anular.error ? <ErrorDeCarga error={anular.error} className="mt-4" /> : null}
        </Modal>
      ) : null}

      {/* -------------------------------- marcar pendiente por cobrar */}
      {marcandoPendiente ? (
        <Modal
          abierto
          ancho="sm"
          onCerrar={() => setMarcandoPendiente(null)}
          titulo={`Marcar pendiente por cobrar · ${marcandoPendiente.numero}`}
          descripcion="No se enlaza a Facturación ni a cuentas por cobrar: es solo un recordatorio con fecha de pago."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setMarcandoPendiente(null)}>
                Cancelar
              </Button>
              <Button
                disabled={marcarPendiente.isPending || !fechaPagoNueva}
                onClick={async () => {
                  await marcarPendiente.mutateAsync({
                    id: marcandoPendiente.id,
                    fecha_pago: fechaPagoNueva,
                  })
                  setMarcandoPendiente(null)
                  setDetalle(null)
                }}
              >
                {marcarPendiente.isPending ? 'Guardando…' : 'Marcar'}
              </Button>
            </>
          }
        >
          <Input
            label="Fecha de pago"
            type="date"
            min={new Date().toISOString().slice(0, 10)}
            value={fechaPagoNueva}
            onChange={(e) => setFechaPagoNueva(e.target.value)}
            autoFocus
          />
          {marcarPendiente.error ? (
            <ErrorDeCarga error={marcarPendiente.error} className="mt-4" />
          ) : null}
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
              ? 'Lo lee quien lo pidió.'
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
            label="Motivo"
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

      {camionesDe ? (
        <ModalCamiones
          notaId={camionesDe.id}
          numero={camionesDe.numero}
          camiones={camionesDe.camiones ?? []}
          onCerrar={() => {
            setCamionesDe(null)
            // El detalle abierto es una copia vieja: se cierra para no enseñar lo de antes.
            setDetalle(null)
          }}
        />
      ) : null}

      {editando ? (
        <ModalEditarNotaEntrega
          abierto
          onCerrar={() => {
            setEditando(null)
            // El detalle abierto es una copia vieja: se cierra para no
            // enseñar lo que ya se corrigió.
            setDetalle(null)
          }}
          nota={editando}
          renglones={renglonesDetalle.data ?? []}
          clientes={clientes ?? []}
          precios={precios ?? []}
          monedas={monedas.data ?? []}
          opcionesDePatio={opcionesDePatio}
          existenciasDePatio={(id) => porPatio[id]}
        />
      ) : null}

      {completando ? (
        <ModalNotaDeEntrega
          modo="completar"
          titulo={`Completar ${completando.numero}`}
          destino={null}
          clienteInicial={completando.cliente_id}
          facturableInicial={completando.facturable}
          camionesIniciales={completando.camiones}
          moneda={completando.moneda}
          lineas={(renglonesDetalle.data ?? []).map((r) => ({
            id: r.id,
            articulo: r.descripcion,
            cantidad: r.cantidad,
            unidad: r.unidad,
            precio: r.precio_unitario,
          }))}
          guardando={completar.isPending || guardarCamiones.isPending}
          error={completar.error ?? guardarCamiones.error}
          onCerrar={() => setCompletando(null)}
          onGuardar={(resp) =>
            void completar
              .mutateAsync({
                id: completando.id,
                cliente_id: resp.cliente_id,
                precios: resp.precios.map((x) => ({ renglon_id: x.id, precio: x.precio })),
                facturable: resp.facturable,
              })
              // Los camiones van aparte y después: si fallan, la nota ya quedó
              // completada y el error se enseña en el mismo cuadro.
              .then(() => guardarCamiones.mutateAsync({ nota_id: completando.id, camiones: resp.camiones }))
              .then(() => {
                // La lista se vuelve a pedir sola; el detalle abierto es una
                // copia vieja, así que se cierra para no enseñar lo de antes.
                setCompletando(null)
                setDetalle(null)
              })
              .catch(() => {})
          }
        />
      ) : null}

      <Visor
        abierto={pdf !== null}
        onCerrar={() => setPdf(null)}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ""}
        titulo="Nota de entrega"
      />

      <Visor
        abierto={reporte !== null}
        onCerrar={() => setReporte(null)}
        blob={reporte?.blob ?? null}
        nombreArchivo={reporte?.nombre ?? ""}
        titulo="Reporte de notas de entrega"
      />

      {verReporteDespacho ? (
        <ModalReporteDespacho
          notaId={verReporteDespacho.notaId}
          solicitudNumero={verReporteDespacho.solicitudNumero}
          razonSocial={empresa?.razon_social ?? ''}
          pedidoPor={verReporteDespacho.pedidoPor}
          aprobadoPor={verReporteDespacho.aprobadoPor}
          onCerrar={() => setVerReporteDespacho(null)}
        />
      ) : null}

      {verReporteSalida ? (
        <ModalReporteSalida
          s={verReporteSalida.s}
          numeroNota={verReporteSalida.numeroNota}
          razonSocial={empresa?.razon_social ?? ''}
          destino={verReporteSalida.destino}
          pedidoPor={nombreDe(verReporteSalida.s.pedida_por)}
          aprobadoPor={nombreDe(verReporteSalida.s.aprobada_por)}
          entregadoPor={nombreDe(verReporteSalida.s.entregada_por)}
          onCerrar={() => setVerReporteSalida(null)}
        />
      ) : null}
    </>
  )
}
