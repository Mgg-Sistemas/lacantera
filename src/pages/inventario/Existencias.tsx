import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  Boxes,
  Coins,
  MapPin,
  PackageMinus,
  PackagePlus,
  Plus,
  Printer,
  Scale,
  Search,
  TriangleAlert,
  Trash2,
  Wrench,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_MATERIAL } from '@/components/pestanasDeModulos'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Visor } from '@/components/Visor'
import { useEmpresa } from '@/lib/api/empresa'
import { useSesion } from '@/lib/sesion'
import { armarActaExistencias } from '@/lib/ficha/actaExistencias'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { ModalAlTaller } from './ModalAlTaller'
import { ListaEditable } from '@/components/ListaEditable'
import { armarNotaDeSalida } from '@/lib/ficha/notaDeSalidaPdf'
import { supabase } from '@/lib/supabase'
import {
  conSusFormas,
  useArticulos,
  useMisRoles,
  useCostoPorPresentacion,
  useTodasLasPresentaciones,
} from '@/lib/api/catalogo'
import { CantidadDeArticulo } from '@/components/CantidadDeArticulo'
import { ConteoDeEnvases } from '@/components/ConteoDeEnvases'
import type { LineaDeConteo } from '@/components/ConteoDeEnvases'
import { CostoDeArticulo } from '@/components/CostoDeArticulo'
import { useMisAcciones, useMisPermisos } from '@/lib/api/usuarios'
import { useMonedasUsables, enSimbolos } from '@/lib/api/tasas'
import {
  useAlmacenes,
  useExistencias,
  useCorregirCosto,
  useImpactoDeCorregirCosto,
  useRevisarCostoDeEntrada,
  useExistenciasDeArticulo,
  useExistenciasTotales,
  useMovimientos,
  useRegistrarAjuste,
  useRegistrarBaja,
  CAUSAS_DE_BAJA,
  useClasesDeSalida,
  useGuardarClaseDeSalida,
  useBorrarClaseDeSalida,
  useRegistrarEntradas,
  useRegistrarSalidas,
  leerNotaDeSalida,
} from '@/lib/api/inventario'
import type { Existencia, ExistenciaTotal } from '@/lib/api/inventario'
import { dolares, enteros, fecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

function cantidad(valor: string | number): string {
  const n = Number(valor)
  return Number.isInteger(n) ? enteros(n) : n.toLocaleString('es-VE', { maximumFractionDigits: 2 })
}

/**
 * Un monto con dos decimales y sin símbolo.
 *
 * Sin símbolo a propósito: la moneda la elige el renglón y puede no ser dólares,
 * así que se escribe al lado. `dolares()` clavaría un «$» que mentiría cuando la
 * factura viene en bolívares.
 */
/**
 * «7 TAMBOR y 10 L», o nada cuando se contó en la unidad de operación.
 *
 * Se arma aquí y no en el PDF porque el PDF no tiene por qué saber cómo se
 * llama cada columna de la base; recibe una frase y la imprime.
 */
function contadoLegible(l: {
  cantidad_capturada: string | null
  unidad_capturada: string | null
  suelto_capturado: string | null
  unidad: string
}): string | null {
  if (!l.cantidad_capturada || !l.unidad_capturada) return null
  const bultos = `${cantidad(l.cantidad_capturada)} ${l.unidad_capturada}`
  return Number(l.suelto_capturado)
    ? `${bultos} y ${cantidad(l.suelto_capturado!)} ${l.unidad}`
    : bultos
}

function monto(valor: number): string {
  return valor.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Lo que hay, empezando por el total de la empresa.
 *
 * PRIMERO TODO, DESPUÉS DÓNDE
 *
 * Antes esta pantalla abría con una fila por almacén y artículo: el mismo saco
 * de cemento aparecía cuatro veces y en ninguna decía cuántos hay en total. Con
 * un solo almacén no se notaba; con patio, almacenes y varios talleres, la
 * primera pregunta —cuánto tiene la empresa— no tenía respuesta en pantalla.
 *
 * Ahora se entra al total, y de ahí se baja: cuántos sitios lo tienen, cuáles
 * son, y en cada uno se saca o se cuenta. La dirección de Sistemas lo pidió en
 * ese orden y es también el orden en que se piensa.
 *
 * LAS ACCIONES SIGUEN COLGANDO DE UN ALMACÉN, NO DEL TOTAL
 *
 * Sacar material del «inventario general» no significa nada: el material sale
 * de un sitio concreto y de ahí se descuenta. Por eso desde el total no se saca
 * nada; se abre el desglose, se elige el almacén, y ahí sí. La pantalla no
 * ofrece lo que no se puede hacer.
 */
/** Un renglón mientras se escribe: todo texto, que es lo que da un input. */
interface RenglonEnCurso {
  clave: string
  articulo: string
  cantidad: string
  costo: string
  moneda: string
  /**
   * Solo en la entrada: alguien vio el aviso de costo raro y decidió guardarlo
   * igual. Va por RENGLÓN y no por formulario: con quince renglones, un solo
   * «confirmo» aceptaría a ciegas los catorce que nadie miró.
   */
  confirmado?: boolean
  /**
   * Bultos enteros, cuando se contó en bultos.
   *
   * `cantidad` guarda lo suelto y esto los enteros: «7 tambores y 10 L». La
   * suma la hace la base con `private.en_unidad_base`, que además anota al lado
   * del asiento lo que la persona contó. Si aquí se mandara la multiplicación
   * ya hecha, esas tres cifras se perderían y el movimiento diría «1.466 L» a
   * quien anotó siete tambores.
   */
  presentaciones?: number | null
  /**
   * Lo suelto que acompaña a los bultos: los diez litros del octavo tambor.
   *
   * VA APARTE DE `cantidad` A PROPÓSITO, y costó un susto aprenderlo. El primer
   * intento guardaba lo suelto EN `cantidad` cuando había bultos, y con «3
   * tambores y 0 sueltos» —el caso normal— eso deja la cadena vacía. Toda la
   * pantalla mide el renglón por `cantidad`: el botón se quedaba muerto, el
   * filtro del guardado tiraba el renglón sin decir nada, y el aviso del costo
   * no se pintaba, así que la casilla que la base exige no llegaba a aparecer.
   *
   * `cantidad` es siempre el TOTAL, que es lo que el resto de la pantalla lee y
   * lo que el componente promete devolver. Lo que se manda a la base se arma al
   * guardar.
   */
  sueltas?: string
  /**
   * En cuál de las presentaciones se contó.
   *
   * Con una sola forma declarada sobra —la base la resuelve—, pero desde que un
   * artículo puede tener varias es el dato que decide la cuenta: «3 bultos» de
   * un aceite que viene en TAMBOR (208 L) y en BIDON (20 L) son 624 litros o
   * son 60, y la diferencia no se descubre hasta que alguien cuenta el almacén.
   */
  presentacion?: string | null
  /**
   * Solo en la salida: de qué almacén sale ESTE renglón.
   *
   * En la entrada el sitio se elige una vez arriba, porque lo que entra entra
   * a un sitio. En la salida no es igual: «necesito estas cinco cosas» suele
   * significar el aceite del almacén y las varillas del patio.
   */
  almacen: string
}

let siguienteClave = 0
const renglonVacio = (articulo: string, almacen = ''): RenglonEnCurso => ({
  clave: String(++siguienteClave),
  articulo,
  cantidad: '',
  costo: '',
  moneda: 'USD',
  almacen,
})

export function Existencias() {
  const { data: almacenes } = useAlmacenes()

  // El sitio puede venir en la URL: desde Talleres se llega aquí con el taller
  // ya elegido. Sin esto el enlace prometía un filtro que no aplicaba.
  const [params, setParams] = useSearchParams()
  const almacenId = params.get('almacen') ?? ''
  const setAlmacenId = (v: string) =>
    setParams(v ? { almacen: v } : {}, { replace: true })
  const enTotal = almacenId === ''

  const totales = useExistenciasTotales(enTotal)
  const porAlmacen = useExistencias(almacenId ? Number(almacenId) : undefined, !enTotal)
  const { isPending, error } = enTotal ? totales : porAlmacen

  /*
    Los movimientos del sitio, para poder decir qué se movió aquí.

    Se piden acotados al almacén: en el total de la empresa la cifra sería la
    suma de todo el libro, que no informa de nada — siempre es «muchos».
  */
  const movimientos = useMovimientos(
    almacenId ? { almacenId: Number(almacenId) } : {},
  )

  const { puede } = useMisRoles()
  // El de arriba comprueba ROL literal; este comprueba NIVEL por modulo, que es
  // lo que exige `guardar_clase_de_salida` (INVENTARIO en TOTAL). Ofrecer el
  // boton a quien la RPC va a rechazar es enseñar una puerta cerrada.
  const { puede: alcanza } = useMisPermisos()
  const { puede: puedeAccion } = useMisAcciones()
  const salidas = useRegistrarSalidas()
  // Mandar algo al taller no es sacarlo: vuelve. Por eso va en su propio modal
  // y no como un quinto caso del de salidas.
  const [alTaller, setAlTaller] = useState<Existencia | null>(null)
  // Abierto desde la cabecera, sin fila: el modal pregunta que y de donde.
  const [alTallerSuelto, setAlTallerSuelto] = useState(false)

  /*
    LA NOTA DE SALIDA

    «Cada salida de material que se haga, hacer una nota de salida (PDF)».

    Se arma DESPUES de guardar y con el numero que devuelve la base, no con lo
    que hay en el formulario: el numero de movimiento lo pone la base y es lo
    unico que ata el papel al libro. Un papel con un numero inventado no
    respalda nada.

    Y se ensena en el visor en vez de descargarse de golpe: quien acaba de sacar
    material lo comprueba antes de imprimirlo y de que alguien lo firme.
  */
  const [nota, setNota] = useState<{ blob: Blob; nombre: string } | null>(null)

  /*
    Cuando la salida se registro pero el papel no salio.

    Pasa de verdad: `armarNotaDeSalida` carga jsPDF como trozo aparte, y el
    propio arranque de la aplicacion documenta que tras publicar una version los
    trozos cambian de nombre y una pestana vieja recibe 404 al pedirlos. Sin
    esto, el operador ve que no sale papel, cree que no se guardo, y vuelve a
    sacar el material.
  */
  const [falloElPapel, setFalloElPapel] = useState<string | null>(null)

  /*
    La lista de razones, editable desde donde se usa.

    Es la tercera del sistema que se abre así —motivos del vale, categorías de
    gasto y ahora esta—, y por la misma frase de la líder: «igual debe ser
    editable, no quiero nos llamen a cada rato por cosas así».
  */
  const [ordenandoClases, setOrdenandoClases] = useState(false)
  const guardarClase = useGuardarClaseDeSalida()
  const borrarClase = useBorrarClaseDeSalida()
  const todasLasClases = useClasesDeSalida(true)

  /*
    La nota entera, releída de la base por su número.

    No se arma con lo que hay en el formulario: el costo promedio y el valor de
    cada renglón los calcula la base al mover, y son justo las cifras que
    quedan en el papel que alguien firma. Un papel con cifras del navegador y un
    libro con otras es exactamente el problema que la nota venía a resolver.
  */
  const notaCompleta = async (numero: string, clase: string, motivo: string) => {
    const lineas = await leerNotaDeSalida(numero)
    if (lineas.length === 0) return

    setNota(
      await armarNotaDeSalida({
        numero,
        fecha: fecha(lineas[0].fecha),
        almacen: lineas[0].almacen,
        clase,
        motivo,
        renglones: lineas.map((l) => ({
          articuloCodigo: l.articulo_codigo,
          articulo: l.articulo,
          cantidad: l.cantidad,
          unidad: l.unidad,
          contado: contadoLegible(l),
          costoUnitarioUsd: l.costo_usd,
          valorUsd: l.valor_usd,
          almacen: l.almacen,
        })),
        empresa: { razonSocial: empresa?.razon_social ?? '', rif: empresa?.rif ?? '' },
        momento: new Date(),
      }),
    )
  }

  const notaDelMovimiento = async (movimientoId: number, clase: string, motivo: string) => {
    const { data } = await supabase
      .from('inventario_movimientos')
      .select(
        // El trio capturado tambien: hoy la baja no cuenta en bultos, pero el
        // dia que lo haga el papel ya lo dira sin que nadie se acuerde de esto.
        'numero, fecha, cantidad, unidad, costo_usd, valor_usd, almacen_id, articulo_id, cantidad_capturada, unidad_capturada, suelto_capturado',
      )
      .eq('id', movimientoId)
      .maybeSingle()

    if (!data) return

    const alm = (almacenes ?? []).find((a) => a.id === data.almacen_id)
    const art = (articulos ?? []).find((a) => a.id === data.articulo_id)

    setNota(
      await armarNotaDeSalida({
        numero: data.numero,
        fecha: fecha(data.fecha),
        almacen: alm?.nombre ?? '',
        clase,
        motivo,
        // Un renglon hoy. El papel ya sabe llevar varios, y la base tambien:
        // falta el formulario, que es lo unico que sigue siendo de una fila.
        renglones: [
          {
            contado: contadoLegible({ ...data, unidad: data.unidad }),
            articuloCodigo: art?.codigo ?? '',
            articulo: art?.nombre ?? '',
            cantidad: data.cantidad,
            unidad: data.unidad,
            costoUnitarioUsd: data.costo_usd,
            valorUsd: data.valor_usd,
          },
        ],
        empresa: {
          razonSocial: empresa?.razon_social ?? '',
          rif: empresa?.rif ?? '',
        },
        momento: new Date(),
      }),
    )
  }
  const ajuste = useRegistrarAjuste()
  const baja = useRegistrarBaja()
  const entrada = useRegistrarEntradas()
  const { data: articulos } = useArticulos()
  // Las formas de contar de todo el catalogo, de un tiron: quince renglones no
  // pueden ser quince consultas para leer quince filas.
  const { data: formasDeContar } = useTodasLasPresentaciones()
  const monedas = useMonedasUsables()
  const { data: empresa } = useEmpresa()
  const { nombre: yo } = useSesion()
  const [acta, setActa] = useState<ArchivoArmado | null>(null)

  const [busqueda, setBusqueda] = useState('')
  const [soloBajas, setSoloBajas] = useState(false)
  const [desglose, setDesglose] = useState<ExistenciaTotal | null>(null)
  /* Que fila se esta corrigiendo de valoracion. Va aparte de `modal` porque no
     comparte ni el formulario ni el permiso con las cuatro acciones de almacen. */
  const [costo, setCosto] = useState<Existencia | null>(null)
  const [modal, setModal] = useState<
    null | { tipo: 'salida' | 'salidas' | 'ajuste' | 'entrada' | 'baja'; fila: Existencia | null }
  >(null)
  const [valor, setValor] = useState('')
  /*
    Los bultos enteros del conteo. Aparte de `valor` —que guarda lo suelto—
    porque contar un almacén es «siete tambores y diez litros», no un número.
  */
  const [bultosContados, setBultosContados] = useState<number | null>(null)
  /*
    LA HOJA DE CONTEO, cuando en el estante hay envases de varios tipos.

    Vacía significa «se contó de la forma de siempre». En cuanto tiene una línea
    manda ella: es lo que la persona vio, y el total sale de sumarla.
  */
  const [hoja, setHoja] = useState<LineaDeConteo[]>([])
  const [sueltosContados, setSueltosContados] = useState('')
  /*
    Y EN CUAL SE CONTO. Desde que un articulo puede declarar varias formas, los
    bultos solos no dicen nada: «3» son 624 litros en tambores y 60 en bidones.
    Nulo cuando se conto en la unidad de operacion, que es cuando no hay bulto
    que nombrar.
  */
  const [presentacionContada, setPresentacionContada] = useState<string | null>(null)
  /*
    El total ya sumado, solo para enseñarlo y calcular la diferencia. Lo que
    viaja a la base son `valor` (lo suelto) y `bultosContados` por separado:
    la suma la hace ella, y así puede guardar al lado lo que la persona contó.
  */
  const [totalContado, setTotalContado] = useState('')

  /* El artículo de la fila del modal, para saber si viene en bultos. */
  const articuloDeLaFila = (articulos ?? []).find(
    (a) => a.id === modal?.fila?.articulo_id,
  )
  const [motivo, setMotivo] = useState('')
  // Solo para la entrada: el costo es lo que la distingue de un ajuste, y el
  // almacén y el artículo hacen falta cuando se abre sin fila debajo.
  const [referencia, setReferencia] = useState('')
  const [aDonde, setADonde] = useState('')
  /*
    LA ENTRADA ES DE VARIOS RENGLONES

    Christopher: «¿tengo que repetir ese formulario N veces?». Cargar el saldo
    inicial de un almacén con veinte artículos eran veinte formularios, veinte
    veces eligiendo el mismo sitio. Ahora el sitio se elige una vez y debajo se
    van añadiendo renglones.

    La clave es para React: sin una estable, borrar un renglón del medio
    reordena los de abajo y el foco salta al campo equivocado.
  */
  const [renglones, setRenglones] = useState<RenglonEnCurso[]>([])

  /*
    DE DÓNDE SE PUEDE SACAR CADA COSA

    La salida de varios renglones necesita ver el inventario entero, no el del
    almacén elegido arriba: quien empieza por «necesito estas cinco cosas»
    todavía no sabe en cuál de los cuatro sitios están.

    Se pide solo con el formulario abierto: doscientas filas de existencias no
    hacen falta para pintar la pantalla, que ya tiene las suyas.
  */
  const todas = useExistencias(
    undefined,
    modal?.tipo === 'salidas' || modal?.tipo === 'entrada',
  )

  /** Lo que hay de un artículo en un sitio concreto, para avisar antes y no después. */
  const hayEn = (almacen: string, articulo: string) =>
    Number(
      (todas.data ?? []).find(
        (e) => String(e.almacen_id) === almacen && String(e.articulo_id) === articulo,
      )?.disponibles ?? 0,
    )

  /*
    EL MISMO MATERIAL DOS VECES SE SUMA

    Con renglones libres aparece un caso que con una sola fila no existía: pedir
    el mismo artículo del mismo sitio en dos renglones. Mirando cada renglón por
    separado, dos de dos galones pasan aunque solo haya tres — cada uno ve el
    saldo entero.

    La base ya lo para y nombra el renglón, pero enterarse al pulsar Registrar
    es tarde. Se cuenta aquí lo mismo que cuenta ella.
  */
  const pedidoHasta = (indice: number, almacen: string, articulo: string) =>
    renglones
      .slice(0, indice)
      .filter((x) => x.almacen === almacen && x.articulo === articulo)
      .reduce((t, x) => t + Number(x.cantidad || 0), 0)

  /*
    El artículo se elige de lo que EXISTE, no del catálogo entero.

    Es la diferencia con la entrada: allí el artículo puede no tener existencia
    todavía —justamente se está cargando—, aquí no se puede sacar lo que no hay,
    y ofrecerlo sería dejar que el error salga al guardar en vez de al elegir.
  */
  const articulosConExistencia = useMemo(() => {
    const porArticulo = new Map<
      string,
      { codigo: string; nombre: string; unidad: string; total: number; sitios: number }
    >()
    for (const e of todas.data ?? []) {
      if (Number(e.disponibles) <= 0) continue
      const clave = String(e.articulo_id)
      const ya = porArticulo.get(clave)
      if (ya) {
        ya.total += Number(e.disponibles)
        ya.sitios += 1
      } else {
        porArticulo.set(clave, {
          codigo: e.articulo_codigo,
          nombre: e.articulo,
          unidad: e.unidad,
          total: Number(e.disponibles),
          sitios: 1,
        })
      }
    }
    return [...porArticulo.entries()].map(([valor, v]) => ({
      valor,
      codigo: v.codigo,
      nombre: v.nombre,
      detalle: `${cantidad(v.total)} ${v.unidad} · ${v.sitios === 1 ? 'un sitio' : `${v.sitios} sitios`}`,
    }))
  }, [todas.data])

  /** Los renglones que cuentan: uno a medio escribir no invalida los demás. */
  const renglonesDeSalida = renglones.filter(
    (r) => r.articulo && r.almacen && Number(r.cantidad) > 0,
  )

  /*
    La salida está en pie si hay al menos un renglón bueno y ninguno pide más de
    lo que hay. Se comprueba aquí y no solo en la base porque enterarse al
    pulsar Registrar, con el formulario ya lleno, llega tarde.
  */
  const salidaEnPie =
    renglonesDeSalida.length > 0 &&
    renglones.every(
      (r, i) =>
        !r.articulo ||
        !r.almacen ||
        Number(r.cantidad || 0) <= 0 ||
        Number(r.cantidad) + pedidoHasta(i, r.almacen, r.articulo) <=
          hayEn(r.almacen, r.articulo),
    )

  // La referencia tiene que ser estable o el filtrado se recalcula en cada
  // pintado: `?? []` crea un arreglo nuevo cada vez.
  const crudos = enTotal ? totales.data : porAlmacen.data
  const datos = useMemo<Array<Existencia | ExistenciaTotal>>(() => crudos ?? [], [crudos])

  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return datos.filter((e) => {
      const bajo = Number(e.stock_minimo) > 0 && Number(e.existencia) <= Number(e.stock_minimo)
      if (soloBajas && !bajo) return false
      if (!texto) return true
      return (
        e.articulo.toLowerCase().includes(texto) || e.articulo_codigo.toLowerCase().includes(texto)
      )
    })
  }, [datos, busqueda, soloBajas])

  /*
    El valor llega NULO a quien no tiene INVENTARIO.VER_VALORACION: la vista
    `v_existencias` lo anula en la base, no aquí. Hay que distinguir ese nulo
    del cero, porque `Number(null)` es 0 y esta franja pintaría el inventario
    valorado en cero dólares — que es justo lo contrario de lo que pasa, y la
    clase de cifra falsa con la que alguien cerraría un mes.
  */
  const puedeValorar = filtradas.some((e) => e.valor_usd !== null)
  const valorTotal = puedeValorar
    ? filtradas.reduce((s, e) => s + Number(e.valor_usd ?? 0), 0)
    : null

  /*
    LO QUE ESTE SITIO TIENE, VALE, NECESITA Y MUEVE

    Christopher: «cada almacén o taller debe informar cuánto tiene, cuánto
    vale, cuánto necesita reponer y cuánto transfiere». El tablero del módulo
    ya lo dice de la empresa entera; aquí hace falta del sitio que se está
    mirando, que es la pregunta que se hace estando en esta pantalla.

    Van en una franja y no en tarjetas grandes, a propósito: el protagonista
    de esta pantalla es la lista, no el resumen. Las cifras acompañan.

    Se calculan sobre `filtradas` y no sobre todo, porque si alguien filtró por
    «solo bajo mínimo» o buscó una palabra, el resumen tiene que hablar de lo
    que está viendo. Un total que no cuadra con la lista de debajo se lee como
    un error del sistema.
  */
  const conExistencia = filtradas.filter((e) => Number(e.existencia) > 0).length
  const porReponer = filtradas.filter(
    (e) => Number(e.stock_minimo) > 0 && Number(e.existencia) <= Number(e.stock_minimo),
  ).length
  const traslados = (movimientos.data ?? []).filter((m) =>
    m.tipo.startsWith('TRANSFERENCIA'),
  ).length
  const bajas = datos.filter(
    (e) => Number(e.stock_minimo) > 0 && Number(e.existencia) <= Number(e.stock_minimo),
  )

  /*
    EL ACTA SE ARMA CON LO QUE SE ESTÁ VIENDO

    Y no con todo el almacén: si alguien filtró por «solo bajo mínimo» y pide
    el papel, lo que quiere en la mano es esa lista. Por eso el filtro aplicado
    va impreso en el acta — un papel con quince renglones que no dice que son
    quince de doscientos se lee como si fueran todos.
  */
  const imprimirActa = async () => {
    const sitio = almacenes?.find((a) => String(a.id) === almacenId)
    const filtros = [
      busqueda.trim() ? `Búsqueda: «${busqueda.trim()}»` : null,
      soloBajas ? 'Solo lo que está en el mínimo o por debajo' : null,
    ].filter(Boolean)

    setActa(
      await armarActaExistencias({
        almacen: sitio?.nombre ?? null,
        filtro: filtros.length > 0 ? filtros.join(' · ') : null,
        renglones: filtradas.map((e) => ({
          codigo: e.articulo_codigo,
          articulo: e.articulo,
          unidad: e.unidad,
          existencia: e.existencia,
          // Nulo cuando el articulo nunca entro con un costo. Se imprime
          // cero, que es lo que vale en libros: la alternativa es un hueco,
          // y un hueco en una columna de dinero se lee como un error.
          costoUsd: e.costo_promedio_usd ?? 0,
          valorUsd: e.valor_usd,
        })),
        empresa: {
          razonSocial: empresa?.razon_social ?? '',
          rif: empresa?.rif ?? '',
        },
        emitidoPor: yo ?? '',
        momento: new Date(),
      }),
    )
  }

  /*
    LA BAJA NO ES UNA SALIDA MÁS

    Sacar material es darlo a quien lo va a usar; darlo de baja es decir que
    dejó de existir para la empresa. Comparten el formulario porque preguntan
    casi lo mismo, pero la causa solo aparece en la baja: es lo que después
    permite responder cuánto se perdió por obsolescencia y cuánto por robo.
  */
  const [causa, setCausa] = useState(CAUSAS_DE_BAJA[0].valor)
  const [destino, setDestino] = useState('')
  /*
    La lista ya no está escrita aquí: la lleva la empresa y llega por la red, así
    que al montar todavía no hay ninguna. Arranca vacía y se pone la primera en
    cuanto llegan.
  */
  const clases = useClasesDeSalida()
  const [clase, setClase] = useState('')
  const claseElegida = (clases.data ?? []).find((c) => c.codigo === clase)

  /*
    Las formas de contar del artículo que se está tocando. Se calculan aquí y no
    dentro del modal porque las miran tres sitios: el campo de cantidad, la hoja
    de conteo y el botón de guardar.
  */
  const formasDeLaFila = (formasDeContar ?? [])
    .filter((x) => x.articulo_id === articuloDeLaFila?.id && x.activa)
    .sort(
      (a, b) =>
        Number(b.por_defecto) - Number(a.por_defecto) ||
        a.presentacion.localeCompare(b.presentacion, 'es'),
    )
    .map((x) => ({ presentacion: x.presentacion, unidades: x.unidades }))

  const abrir = (
    tipo: 'salida' | 'salidas' | 'ajuste' | 'entrada' | 'baja',
    fila: Existencia | null,
  ) => {
    setCausa(CAUSAS_DE_BAJA[0].valor)
    setDestino('')
    setClase((clases.data ?? [])[0]?.codigo ?? '')
    setValor(tipo === 'ajuste' && fila ? fila.existencia : '')
    setTotalContado(tipo === 'ajuste' && fila ? fila.existencia : '')
    // Una hoja de conteo es de un artículo concreto: abrir otro empieza limpio.
    setHoja([])
    setSueltosContados('')
    setBultosContados(null)
    setPresentacionContada(null)
    setMotivo('')
    setReferencia('')
    // Abierta desde una fila, el primer renglón viene con ese artículo puesto.
    setRenglones(
      tipo === 'entrada'
        ? [renglonVacio(fila ? String(fila.articulo_id) : '')]
        : tipo === 'salidas'
          ? [
              renglonVacio(
                fila ? String(fila.articulo_id) : '',
                // El sitio del renglón arranca en el que se esté mirando. Es
                // el caso corriente, y así el primer renglón queda hecho.
                fila ? String(fila.almacen_id) : almacenId,
              ),
            ]
          : [],
    )
    // Abierta desde una fila, ya se sabe dónde y qué. Abierta desde la
    // cabecera —el caso del saldo inicial— no hay fila que preguntar, porque
    // justamente todavía no existe.
    setADonde(fila ? String(fila.almacen_id) : almacenId)
    setModal({ tipo, fila })
  }

  const guardar = async () => {
    if (!modal) return

    if (modal.tipo === 'entrada') {
      await entrada.mutateAsync({
        almacen_id: Number(aDonde),
        renglones: renglones
          .filter((r) => r.articulo && r.cantidad && r.costo)
          .map((r) => ({
            articulo_id: Number(r.articulo),
            /*
              A la base van las DOS cifras tecleadas y no el total: con bultos,
              `cantidad` son las sueltas y la suma la hace `en_unidad_base`, que
              de paso guarda al lado del asiento lo que la persona contó.
            */
            cantidad: r.presentaciones ? Number(r.sueltas || 0) : Number(r.cantidad || 0),
            presentaciones: r.presentaciones ?? null,
            presentacion: r.presentacion ?? null,
            costo: Number(r.costo),
            moneda: r.moneda,
            confirmado: r.confirmado === true,
          })),
        motivo,
        referencia: referencia || null,
      })
    } else if (modal.tipo === 'salidas') {
      /*
        Los renglones a medio escribir se descartan aquí y no se avisan: añadir
        uno y no llenarlo es lo que hace cualquiera antes de decidir que con
        cuatro basta, y pararle el guardado por eso sería castigar la duda.
      */
      const buenos = renglones.filter((r) => r.articulo && r.almacen && Number(r.cantidad) > 0)

      const numero = (await salidas.mutateAsync({
        almacen_id: aDonde ? Number(aDonde) : null,
        renglones: buenos.map((r) => ({
          almacen_id: Number(r.almacen),
          articulo_id: Number(r.articulo),
          cantidad: r.presentaciones ? Number(r.sueltas || 0) : Number(r.cantidad || 0),
          presentaciones: r.presentaciones ?? null,
          presentacion: r.presentacion ?? null,
        })),
        motivo,
        tipo: clase,
      })) as string

      /*
        El modal se cierra AQUÍ, antes de armar el papel.

        Armarlo tarda: dos viajes de red y la descarga del trozo de jsPDF la
        primera vez. Durante esa espera la mutación ya resolvió, así que el botón
        vuelve a decir «Registrar» y se deja pulsar — y el segundo toque registra
        una SEGUNDA salida completa, con su propio número de nota, sin que nadie
        se entere. La salida ya está hecha y el visor no depende del modal.
      */
      setModal(null)

      // Y si el papel no se puede armar, la salida sigue estando bien hecha: se
      // reimprime desde Movimientos. Tragarse el error aquí es peor que decirlo.
      try {
        await notaCompleta(
          numero,
          (clases.data ?? []).find((c) => c.codigo === clase)?.nombre ?? clase,
          motivo,
        )
      } catch (e) {
        setFalloElPapel(
          `La salida ${numero} quedó registrada, pero no se pudo armar el papel. Búscala en Movimientos y pulsa «Nota».`,
        )
        console.error(e)
      }
      return
    } else if (modal.tipo === 'baja') {
      const id = (await baja.mutateAsync({
        almacen_id: modal.fila!.almacen_id,
        articulo_id: modal.fila!.articulo_id,
        cantidad: Number(valor),
        causa,
        motivo,
        destino: destino || null,
      })) as number
      await notaDelMovimiento(
        id,
        `Baja · ${CAUSAS_DE_BAJA.find((c) => c.valor === causa)?.etiqueta ?? causa}`,
        motivo,
      )
    } else if (modal.tipo === 'salida') {
      /*
        Sacar una sola fila va por la MISMA puerta que sacar varias.

        Antes llamaba a `registrar_salida` en singular, que solo entiende los
        tipos de movimiento crudos. Al pasar las clases a una lista editable,
        `clase` dejo de ser 'SALIDA_CONSUMO' y paso a ser el codigo de una razon
        —'QUEDO_OBSOLETO'—, y esa funcion no sabe encaminarla. Habria reventado.

        Se podia traducir el codigo aqui antes de enviarlo. No se hace: seria un
        segundo sitio donde vive la regla de que «obsoleto» es una baja, y el dia
        que alguien añada una razon nueva por la pantalla, este camino no se
        enteraria. Un renglon es una lista de uno.
      */
      const numero = (await salidas.mutateAsync({
        almacen_id: modal.fila!.almacen_id,
        renglones: [
          {
            almacen_id: modal.fila!.almacen_id,
            articulo_id: modal.fila!.articulo_id,
            cantidad: Number(valor),
          },
        ],
        motivo,
        tipo: clase,
      })) as string

      // Igual que en la de varios renglones: el modal se cierra antes de armar
      // el papel, o el segundo toque registra una salida entera de mas.
      setModal(null)
      try {
        await notaCompleta(
          numero,
          (clases.data ?? []).find((c) => c.codigo === clase)?.nombre ?? clase,
          motivo,
        )
      } catch (e) {
        setFalloElPapel(
          `La salida ${numero} quedo registrada, pero no se pudo armar el papel. Buscala en Movimientos y pulsa «Nota».`,
        )
        console.error(e)
      }
      return
    } else {
      /*
        Con hoja manda la hoja: lo suelto son los litros del envase empezado y
        los bultos van en las líneas. Sin hoja, la forma de siempre.
      */
      const conHoja = hoja.filter((l) => l.presentacion && Number(l.cantidad) > 0)
      await ajuste.mutateAsync({
        almacen_id: modal.fila!.almacen_id,
        articulo_id: modal.fila!.articulo_id,
        contado: conHoja.length > 0 ? Number(sueltosContados || 0) : Number(valor || 0),
        presentaciones: conHoja.length > 0 ? null : bultosContados,
        presentacion: conHoja.length > 0 ? null : presentacionContada,
        envases: conHoja.map((l) => ({
          presentacion: l.presentacion,
          cantidad: Number(l.cantidad),
        })),
        motivo,
      })
    }

    setModal(null)
  }

  return (
    <>
      <PageHeader
        title="Existencias"
        description={
          enTotal
            ? 'Todo lo que tiene la empresa, sumado. Elige un almacén o taller para ver y mover lo que hay en él.'
            : 'Lo que hay en este sitio ahora mismo, calculado sumando el libro de movimientos.'
        }
        actions={
          puede('ALMACEN') ? (
            /*
              Antes esto era un atajo a Explotación, que hoy está fuera del
              MVP y detrás del cartel de obra: el botón principal de esta
              pantalla mandaba a una puerta cerrada.

              Y sobre todo, Inventario tiene que valerse solo. Sin esta
              entrada, la única forma de meter mercancía con su costo era una
              orden de compra, y un almacén que arranca no tiene ninguna
              todavía.
            */
            <>
              <Button
                variant="outline"
                icon={<Printer />}
                disabled={filtradas.length === 0}
                onClick={() => void imprimirActa()}
              >
                Acta de conteo físico
              </Button>
              <Button
                variant="outline"
                icon={<PackagePlus />}
                onClick={() => abrir('entrada', null)}
              >
                Registrar entrada
              </Button>
              {/*
                La salida estaba, pero solo dentro de cada fila. Quien empieza
                por «necesito estas cinco cosas» no tenía puerta: tenía que
                buscar cinco filas y sacar cinco veces, y le salían cinco notas
                para un solo trabajo. Aquí el orden es el suyo — primero qué,
                después de dónde.
              */}
              <Button
                variant="outline"
                icon={<PackageMinus />}
                onClick={() => abrir('salidas', null)}
              >
                Registrar salida
              </Button>
              {/*
                El «Al taller» existia desde ayer, pero solo dentro de una fila —y
                las filas solo salen cuando se elige un almacen, asi que desde
                «Todo el inventario», que es como se entra, no habia ninguno.
                Christopher pregunto «¿donde puedo enviar un item al taller?» y la
                respuesta era «primero elige un almacen», que no es una respuesta.
              */}
              <Button
                variant="outline"
                icon={<Wrench />}
                onClick={() => setAlTallerSuelto(true)}
              >
                Mandar al taller
              </Button>
            </>
          ) : undefined
        }
      />

      <Pestanas pestanas={PESTANAS_MATERIAL} />

      {bajas.length > 0 ? (
        <div className="border-warning/30 bg-warning-soft mb-4 flex items-start gap-2.5 rounded-[6px] border p-3.5">
          <TriangleAlert className="text-warning mt-px size-[18px] shrink-0" />
          <p className="text-ink/80 text-sm">
            <strong className="font-semibold">
              {bajas.length} artículo{bajas.length === 1 ? '' : 's'} en el mínimo o por debajo
            </strong>
            . Conviene pedirlos antes de que hagan falta.{' '}
            <button
              type="button"
              onClick={() => setSoloBajas((v) => !v)}
              className="text-royal-600 dark:text-royal-300 font-medium underline"
            >
              {soloBajas ? 'Ver todo' : 'Ver solo esos'}
            </button>
          </p>
        </div>
      ) : null}

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_240px]">
          <Input
            label="Buscar"
            icon={<Search />}
            placeholder="Nombre o código del artículo"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <SelectBuscable
            label="Dónde"
            vacio="Todo el inventario"
            valor={almacenId}
            onCambio={(v) => setAlmacenId(v)}
            opciones={(almacenes ?? []).map((a) => ({
              valor: String(a.id),
              etiqueta: `${a.nombre}${a.tipo === 'TALLER' ? ' · taller' : ''}`,
            }))}
          />
        </div>
      </Card>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {!isPending && !error && datos.length > 0 ? (
        <Franja
          sitio={enTotal ? null : (almacenes ?? []).find((a) => String(a.id) === almacenId)?.nombre ?? null}
          conExistencia={conExistencia}
          listados={filtradas.length}
          valor={valorTotal}
          porReponer={porReponer}
          traslados={traslados}
          onVerBajos={() => setSoloBajas(true)}
        />
      ) : null}

      {!isPending && !error && filtradas.length === 0 ? (
        <Card>
          <Vacio
            icono={<Boxes />}
            titulo={datos.length === 0 ? 'El inventario está vacío' : 'Nada coincide'}
            descripcion={
              datos.length === 0
                ? 'Las existencias aparecen cuando entra material. Si el almacén arranca ahora, usa «Registrar entrada» para cargar el saldo inicial con su costo.'
                : undefined
            }
          />
        </Card>
      ) : null}

      {filtradas.length > 0 ? (
        <Card flush>
          <div className="border-hairline flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-3">
            <p className="text-ink/60 text-sm">
              {filtradas.length} artículo{filtradas.length === 1 ? '' : 's'}
              {enTotal ? ' en toda la empresa' : ''}
            </p>
            {valorTotal !== null ? (
              <p className="text-ink/80 text-sm">
                Valor del inventario:{' '}
                <span className="tabular font-semibold">{dolares(valorTotal)}</span>
              </p>
            ) : (
              <p className="text-ink/45 text-sm">Sin permiso para ver el valor</p>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Artículo</th>
                  <th className="px-3 py-3 text-right font-medium">Existencia</th>
                  <th className="px-3 py-3 font-medium">{enTotal ? 'Repartido en' : 'Almacén'}</th>
                  <th className="px-3 py-3 text-right font-medium">Costo prom.</th>
                  <th className="px-3 py-3 text-right font-medium">Valor</th>
                  <th className="px-5 py-3 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtradas.map((e) => {
                  const bajo =
                    Number(e.stock_minimo) > 0 && Number(e.existencia) <= Number(e.stock_minimo)
                  const total = enTotal ? (e as ExistenciaTotal) : null
                  const fila = enTotal ? null : (e as Existencia)

                  return (
                    <tr
                      key={enTotal ? `t-${e.articulo_id}` : `${fila!.almacen_id}-${e.articulo_id}`}
                      className="border-hairline border-b last:border-0"
                    >
                      <td className="px-5 py-3">
                        <p className="text-ink/85 font-medium">{e.articulo}</p>
                        <p className="text-ink/45 text-2xs font-mono">{e.articulo_codigo}</p>
                      </td>

                      <td className="px-3 py-3 text-right">
                        <span
                          className={cn(
                            'tabular font-semibold',
                            bajo ? 'text-warning' : 'text-ink/85',
                          )}
                        >
                          {cantidad(e.existencia)}
                        </span>
                        <span className="text-ink/45 ml-1 text-xs">{e.unidad}</span>
                        {bajo ? (
                          <Chip tone="warning" className="ml-2">
                            Mínimo {cantidad(e.stock_minimo)}
                          </Chip>
                        ) : null}

                        {/*
                          AQUÍ NO VAN LAS EQUIVALENCIAS, Y LO DECIDIÓ CHRISTOPHER
                          con la pantalla delante: «cuando revisen el inventario,
                          buscarán existencias reales y no referencias o medidas
                          de items de conversión; es bueno saberlo pero no es lo
                          que guía el inventario o puede confundir al usuario».

                          Tenía razón y yo lo había pasado por alto. Esta lista
                          es donde se REVISA el inventario, y «≈ 2 tambores»
                          junto a la existencia se lee como que hay dos tambores.
                          No los hay: hay 604 litros, que es lo único que alguien
                          midió. Los tambores son una división.

                          La conversión no se pierde: vive en la ficha del
                          artículo, donde se va a entender algo y no a contar.
                        */}

                        {/*
                          EXISTIR NO ES ESTAR DISPONIBLE

                          Diez cascos en el libro pueden ser diez cascos en diez
                          cabezas. Lo prestado sigue contando como existencia
                          —es de la empresa y vale— pero no se puede entregar.

                          Solo se dice cuando difieren: repetir «10 · 10
                          disponibles» en cada renglón enseñaría a no leerlo, y
                          entonces no se leería el día que dice cero.
                        */}
                        {Number(e.prestadas) > 0 ? (
                          <p
                            className={cn(
                              'text-2xs mt-0.5',
                              Number(e.disponibles) <= 0 ? 'text-warning' : 'text-ink/50',
                            )}
                          >
                            {cantidad(e.disponibles)} disponible
                            {Number(e.disponibles) === 1 ? '' : 's'} ·{' '}
                            {cantidad(e.prestadas)} en manos de alguien
                          </p>
                        ) : null}

                        {/* La otra medida, solo en los materiales cuya densidad
                            se midió. Sin ese dato no se supone: se calla. */}
                        {total?.existencia_equivalente ? (
                          <p className="text-ink/40 text-2xs mt-0.5">
                            ≈ {cantidad(total.existencia_equivalente)} {total.unidad_equivalente}
                          </p>
                        ) : null}
                      </td>

                      <td className="text-ink/65 px-3 py-3">
                        {enTotal
                          ? `${total!.almacenes} sitio${total!.almacenes === 1 ? '' : 's'}`
                          : fila!.almacen}
                      </td>

                      <td className="tabular text-ink/65 px-3 py-3 text-right">
                        {e.costo_promedio_usd ? dolares(e.costo_promedio_usd) : '—'}
                      </td>
                      <td className="tabular text-ink/85 px-3 py-3 text-right">
                        {dolares(e.valor_usd)}
                      </td>

                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {enTotal ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<MapPin />}
                            onClick={() => setDesglose(total)}
                          >
                            Ver dónde está
                          </Button>
                        ) : puede('ALMACEN') ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<PackageMinus />}
                              onClick={() => abrir('salida', fila!)}
                            >
                              Sacar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Scale />}
                              onClick={() => abrir('ajuste', fila!)}
                            >
                              Contar
                            </Button>
                            {/* El boton de la fila tambien: un pote de aceite
                                no se manda a reparar, y ofrecerlo es hacer que
                                alguien llene la orden para que se la tumben. */}
                            {(articulos ?? []).find((a) => a.id === fila!.articulo_id)
                              ?.reparable ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<Wrench />}
                                onClick={() => setAlTaller(fila!)}
                              >
                                Al taller
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Trash2 />}
                              onClick={() => abrir('baja', fila!)}
                            >
                              Dar de baja
                            </Button>
                          </>
                        ) : null}

                        {/*
                          CORREGIR EL COSTO VA APARTE, Y NO ES UN DESCUIDO.

                          Los cuatro botones de arriba viven dentro de
                          `puede('ALMACEN')`, y la base le niega esta accion a
                          ALMACEN a proposito: «almacen no tiene interes sobre
                          el precio o valor de las cosas, pero si en que sus
                          items esten rigurosamente contados» —Christopher—.
                          Metido ahi lo verian justo quienes no pueden usarlo, y
                          no lo veria GERENTE_GENERAL, que no tiene rol ALMACEN.

                          Y solo por almacen: el costo promedio se lleva por
                          pareja (almacen, articulo), asi que desde el total no
                          significa nada.
                        */}
                        {!enTotal &&
                        puedeAccion('INVENTARIO.AJUSTAR_COSTO') &&
                        Number(fila!.existencia) > 0 ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Coins />}
                            onClick={() => setCosto(fila!)}
                          >
                            Corregir el costo
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {costo ? <ModalCorregirCosto fila={costo} onCerrar={() => setCosto(null)} /> : null}

      <ModalDesglose
        articulo={desglose}
        onCerrar={() => setDesglose(null)}
        puedeMover={puede('ALMACEN')}
        puedeCorregirCosto={puedeAccion('INVENTARIO.AJUSTAR_COSTO')}
        onCorregirCosto={(f) => {
          setDesglose(null)
          setCosto(f)
        }}
        onSacar={(f) => {
          setDesglose(null)
          abrir('salida', f)
        }}
        onContar={(f) => {
          setDesglose(null)
          abrir('ajuste', f)
        }}
      />

      <ModalAlTaller
        fila={alTaller}
        abierto={alTallerSuelto}
        onCerrar={() => {
          setAlTaller(null)
          setAlTallerSuelto(false)
        }}
      />

      {falloElPapel ? (
        <Modal
          abierto
          onCerrar={() => setFalloElPapel(null)}
          titulo="La salida quedo hecha, el papel no"
          ancho="sm"
          acciones={
            <Button onClick={() => setFalloElPapel(null)}>Entendido</Button>
          }
        >
          <p className="text-ink/70 text-sm leading-relaxed">{falloElPapel}</p>
        </Modal>
      ) : null}

      {ordenandoClases ? (
        <Modal
          abierto
          onCerrar={() => setOrdenandoClases(false)}
          titulo="Por qué puede salir un material"
          descripcion="La lista que aparece al sacar material. Cada razón ya sabe si es consumo, merma o baja: eso no se cambia desde aquí, porque movería de sitio salidas ya registradas."
          ancho="sm"
          acciones={<Button onClick={() => setOrdenandoClases(false)}>Listo</Button>}
        >
          <ListaEditable
            elementos={(todasLasClases.data ?? []).map((c) => ({
              codigo: c.codigo,
              nombre: c.nombre,
              pista: c.pista,
              activo: c.activa,
            }))}
            onGuardar={(e) =>
              guardarClase.mutateAsync({ codigo: e.codigo, nombre: e.nombre, activa: e.activo })
            }
            onBorrar={(codigo) => borrarClase.mutateAsync(codigo)}
            onAnadir={(nombre) => guardarClase.mutateAsync({ nombre })}
            error={guardarClase.error ?? borrarClase.error}
            guardando={guardarClase.isPending || borrarClase.isPending}
            etiquetaAnadir="Añadir una razón"
            placeholderNuevo="Se prestó a otra obra"
            nota="Una razón que ya se usó no se borra: se apaga. Si se borrara, las salidas de hace tres meses se quedarían sin poder decir por qué se hicieron."
          />
        </Modal>
      ) : null}

      <Visor
        abierto={nota !== null}
        onCerrar={() => setNota(null)}
        blob={nota?.blob ?? null}
        nombreArchivo={nota?.nombre ?? 'nota-salida.pdf'}
        titulo="Nota de salida"
        descripcion="Compruébala antes de imprimirla: es lo que va a firmar quien recibe el material."
      />

      {modal ? (
        <Modal
          abierto
          onCerrar={() => setModal(null)}
          titulo={
            modal.tipo === 'entrada'
              ? 'Entrada de material'
              : modal.tipo === 'salidas'
                ? 'Salida de material'
                : modal.tipo === 'salida'
                  ? 'Sacar material'
                  : modal.tipo === 'baja'
                    ? 'Dar de baja'
                    : 'Conteo físico'
          }
          descripcion={
            modal.tipo === 'entrada'
              ? 'Para lo que entra sin una compra de por medio: el saldo con el que arranca el almacén, algo comprado por fuera, material que trae alguien.'
              : modal.tipo === 'salidas'
                ? 'Todo lo que sale para un mismo trabajo, en un solo papel. Cada renglón dice qué se lleva y de qué sitio: el aceite puede estar en el almacén y las varillas en el patio.'
                : modal.tipo === 'salida'
                  ? 'Sale del almacén al costo promedio que tiene ahora. Di por qué sale: lo que se usa trabajando, lo que se pierde en el manejo y lo que se da de baja se miran por separado.'
                  : modal.tipo === 'baja'
                    ? 'Para lo que dejó de servir: se dañó, quedó obsoleto, venció, no aparece. Sale del inventario y su valor se da por perdido.'
                    : 'Escribe lo que contaste. El sistema calcula la diferencia y la deja registrada.'
          }
          /*
            LA ENTRADA NECESITA EL MISMO ANCHO QUE LA SALIDA.

            Estaba en `sm` —max-w-md, 448 px— y su fila pide tres columnas:
            cantidad, costo y moneda. Descontado el relleno quedan ~408 px, y
            como la columna de la moneda es `auto` y se lleva lo suyo, las dos
            de `1fr` se quedaban en unos 40 px: las cajas aplastadas y las
            etiquetas encimadas que se vieron en pantalla.

            El conteo y la baja siguen en `sm` a proposito: son de un campo.
          */
          /*
            SALIDAS Y ENTRADAS PIDEN SITIO, y se vio en pantalla antes que en el
            código: el renglón lleva artículo, sitio, cantidad, en qué envase se
            teclea y los sueltos que acompañan. En `md` las cajas salían
            aplastadas una contra otra y el selector de envase se comía el campo
            de cantidad. Los demás modales de aquí siguen en `sm` porque piden
            una cosa sola.
          */
          ancho={modal.tipo === 'salidas' || modal.tipo === 'entrada' ? 'lg' : 'sm'}
          acciones={
            <>
              <Button variant="ghost" onClick={() => setModal(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() => void guardar()}
                disabled={
                  /*
                    El conteo se mide por el TOTAL, no por `valor`: contando
                    «7 tambores y 0 sueltos» lo suelto queda vacío, y exigirlo
                    dejaría el botón muerto en el caso más normal de todos.
                  */
                  (modal.tipo === 'ajuste' && !totalContado) ||
                  (modal.tipo !== 'entrada' &&
                    modal.tipo !== 'salidas' &&
                    modal.tipo !== 'ajuste' &&
                    !valor) ||
                  motivo.trim().length < 4 ||
                  (modal.tipo === 'entrada' &&
                    (!aDonde ||
                      renglones.filter((r) => r.articulo && r.cantidad && r.costo).length === 0)) ||
                  /*
                    La salida se para si algún renglón pide más de lo que hay.
                    La base también lo para —y nombra el renglón—, pero
                    enterarse al pulsar Registrar, con el formulario ya lleno,
                    llega tarde: el aviso está debajo del renglón desde que se
                    escribe la cantidad.
                  */
                  (modal.tipo === 'salidas' && !salidaEnPie) ||
                  // Lo mismo que exige la base, dicho antes de pulsar. Una baja
                  // y un «Otro» piden diez caracteres, no cuatro.
                  ((modal.tipo === 'salidas' || modal.tipo === 'salida') &&
                    (claseElegida?.tipo === 'SALIDA_BAJA' || claseElegida?.exige_detalle) &&
                    motivo.trim().length < 10) ||
                  // Una baja pide más explicación: es lo único que quedará
                  // dentro de un año para justificar la pérdida.
                  (modal.tipo === 'baja' && motivo.trim().length < 10) ||
                  salidas.isPending ||
                  ajuste.isPending ||
                  entrada.isPending ||
                  baja.isPending
                }
              >
                {                salidas.isPending ||
                ajuste.isPending ||
                entrada.isPending ||
                baja.isPending
                  ? 'Guardando…'
                  : 'Registrar'}
              </Button>
            </>
          }
        >
          {/* Con fila debajo ya se sabe dónde y qué, y repetirlo como campos
              sería preguntar lo que se acaba de pulsar. Sin ella —el caso del
              saldo inicial— hay que elegirlo, y por eso el artículo sale del
              catálogo entero y no de lo que ya tiene existencia: justamente lo
              que se está cargando todavía no la tiene. */}
          {/* La entrada tiene su propio cuerpo: se elige el sitio una vez y
              debajo van los renglones. Salida y ajuste siguen siendo de una
              fila, que es como se hacen. */}
          {modal.tipo === 'entrada' ? (
            <>
              <SelectBuscable
                label="A qué almacén entra"
                vacio="Elige el sitio"
                valor={aDonde}
                /*
                  CAMBIAR DE ALMACEN OLVIDA TODAS LAS CONFIRMACIONES.

                  El costo promedio se lleva por pareja (almacen, articulo), asi
                  que mover la entrada de sitio cambia el numero contra el que se
                  comparan TODOS los renglones. Una confirmacion dada contra el
                  promedio de un almacen no dice nada del otro.
                */
                onCambio={(v) => {
                  setADonde(v)
                  setRenglones((lista) => lista.map((x) => ({ ...x, confirmado: false })))
                }}
                /*
                  EL TANQUE SIN COSTO NO ES DESTINO DE UNA ENTRADA CON PRECIO.

                  Un almacen marcado con `admite_sin_costo` lleva su promedio
                  aparte, y ese es el motivo de que exista: meterle material con
                  precio lo contamina igual que sacarlo de ahi contamina al
                  destino. La base lo rechaza; aqui simplemente no se ofrece.

                  Para meter en ese tanque esta «Cargar combustible al tanque»
                  con la casilla de «no costó nada para esta empresa».
                */
                opciones={(almacenes ?? [])
                  .filter((a) => !a.admite_sin_costo)
                  .map((a) => ({
                    valor: String(a.id),
                    codigo: a.codigo,
                    nombre: a.nombre,
                    detalle: a.tipo,
                  }))}
              />

              <div className="mt-4 space-y-3">
                {renglones.map((r, i) => {
                  const art = conSusFormas(
                    (articulos ?? []).find((a) => String(a.id) === r.articulo),
                    formasDeContar,
                  )

                  /*
                    CUÁNTO SUMA ESTE RENGLÓN, MIENTRAS SE ESCRIBE.

                    El 5 de septiembre de 2026 entraron cinco aceites con el
                    costo mal transcrito y el inventario pasó a valer 868
                    millones de dólares. El sistema hizo la aritmética sin un
                    fallo: guardó lo que recibió. Lo que no hizo fue enseñarlo.

                    El formulario pedía CANTIDAD y COSTO POR UNIDAD y nunca
                    mostraba el tercer número, que es el único que delata el
                    error. «208 × 1.318.073,76» no dice nada a nadie;
                    «274.159.342,08» lo dice todo, y lo dice cuando todavía se
                    puede borrar y volver a escribir.

                    Va en la moneda que se eligió y sin convertir: convertir aquí
                    sería calcular una tasa en el navegador, que es justo lo que
                    la regla 4 de la casa prohíbe. La conversión la hace la base
                    al guardar.
                  */
                  const cant = Number(r.cantidad)
                  const costo = Number(r.costo)
                  const suma =
                    r.cantidad.trim() !== '' &&
                    r.costo.trim() !== '' &&
                    Number.isFinite(cant) &&
                    Number.isFinite(costo) &&
                    cant > 0 &&
                    costo > 0
                      ? cant * costo
                      : null

                  return (
                    <div
                      key={r.clave}
                      className="border-hairline rounded-card border border-dashed p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-ink/40 text-2xs font-mono tracking-[0.16em] uppercase">
                          Renglón {i + 1}
                        </span>
                        {renglones.length > 1 ? (
                          <button
                            type="button"
                            className="text-ink/40 hover:text-danger text-xs underline underline-offset-2"
                            onClick={() =>
                              setRenglones((v) => v.filter((x) => x.clave !== r.clave))
                            }
                          >
                            Quitar
                          </button>
                        ) : null}
                      </div>

                      <SelectBuscable
                        label="Qué entra"
                        vacio="Elige el artículo"
                        valor={r.articulo}
                        onCambio={(v) =>
                          setRenglones((lista) =>
                            /*
                              CAMBIAR DE ARTICULO LIMPIA LA CANTIDAD.

                              La unidad cambia con el articulo: «3» de tambores
                              no es «3» de sacos, y los bultos del anterior no
                              significan nada en el nuevo. Peor si el nuevo no
                              viene en bultos: el selector desaparece de la
                              pantalla y `presentaciones` se queda en el renglon
                              y viaja igual, y la base rechaza con un mensaje
                              sobre un campo que ya no se ve.
                            */
                            lista.map((x) =>
                              x.clave === r.clave
                                ? {
                                    ...x,
                                    articulo: v,
                                    cantidad: '',
                                    // El costo tambien: 6,50 por litro de un
                                    // aceite no dice nada del articulo nuevo, y
                                    // dejarlo puesto es ofrecerlo como suyo.
                                    costo: '',
                                    presentaciones: null,
                                    presentacion: null,
                                    sueltas: '',
                                    confirmado: false,
                                  }
                                : x,
                            ),
                          )
                        }
                        opciones={(articulos ?? [])
                          .filter((a) => a.inventariable)
                          .map((a) => ({
                            valor: String(a.id),
                            codigo: a.codigo,
                            nombre: a.nombre,
                            detalle: `${a.categoria} · ${a.unidad}`,
                          }))}
                      />

                      {/*
                          `minmax(0,1fr)` y no `1fr`: una columna de rejilla no
                          baja de su contenido minimo salvo que se le diga, y es
                          lo que deja que un rotulo largo empuje a la de al lado
                          en vez de encogerse. Con esto, si el sitio vuelve a
                          faltar, el campo se estrecha — que se lee mal pero se
                          lee— en lugar de encimarse.
                        */}
                        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                        {/*
                          Aqui es donde mas falta hacia: quien registra la
                          entrada esta contando bultos bajados de un camion y
                          tiene que dejar litros en la existencia.
                        */}
                        {/*
                          CAMBIAR DE ARTICULO REMONTA EL CAMPO.

                          El componente guarda por dentro en que presentacion
                          se esta tecleando, y esa eleccion no significa nada
                          en el articulo siguiente: el selector se quedaba en
                          «CAJA» y la linea de equivalencia afirmaba una cuenta
                          con el factor del anterior. Con la clave, React lo
                          monta de nuevo y el estado nace limpio — que es lo
                          mismo que ya hacia el renglon con sus cifras.
                        */}
                        <CantidadDeArticulo
                          key={r.articulo}
                          valor={r.cantidad}
                          /*
                            Se guardan las DOS cifras tecleadas, no la suma. La
                            suma la vuelve a hacer la base, que además anota al
                            lado del asiento lo que la persona contó: «7 TAMBOR
                            + 10 L» junto a «1.466 L». Mandando solo el total,
                            el movimiento le diría 1.466 a quien contó tambores.
                          */
                          onCambiar={(v, cap) =>
                            setRenglones((lista) =>
                              lista.map((x) =>
                                x.clave === r.clave
                                  ? {
                                      ...x,
                                      // El TOTAL: es lo que lee el botón, el
                                      // filtro, la suma y el aviso del costo.
                                      cantidad: v,
                                      presentaciones: cap.presentaciones,
                                      presentacion: cap.unidad,
                                      sueltas: String(cap.sueltas ?? ''),
                                      // Cambiar la cantidad no debe arrastrar
                                      // una confirmación dada sobre otra.
                                      confirmado: false,
                                    }
                                  : x,
                              ),
                            )
                          }
                          articulo={art}
                        />

                        {/*
                          EL COSTO SE TECLEA COMO VIENE EN LA FACTURA.

                          El gemelo del campo de cantidad. Quien acaba de teclear
                          «3 tambores» y ver «= 624 L» sigue pensando en tambores
                          cuando llega aqui, y antes esta casilla pedia el precio
                          por litro sin decirlo. Ahora se puede teclear el precio
                          del tambor y el componente lo divide, ensenando la
                          cuenta con los dos lados escritos.
                        */}
                        <CostoDeArticulo
                          key={r.articulo}
                          valor={r.costo}
                          onCambiar={(v) =>
                            setRenglones((lista) =>
                              /*
                              LA CASILLA PERTENECE A UN NUMERO, NO AL RENGLON.

                              Sin esto, marcar «es correcto» con 5 y teclear
                              luego 5.000 mandaba `confirmado: true` con el
                              numero nuevo: la base lo aceptaba sin avisar de
                              nada. Es justo el defecto que este formulario
                              existe para evitar.
                            */
                            lista.map((x) =>
                              x.clave === r.clave ? { ...x, costo: v, confirmado: false } : x,
                            ),
                            )
                          }
                          articulo={art}
                          moneda={r.moneda}
                        />

                        {/* La moneda no se asume. El sistema maneja cuatro, y
                            convertir de cabeza es como se cargan los costos
                            equivocados. La conversión a dólares la hace la
                            base con la tasa del día. */}
                        <Select
                          label="Moneda"
                          value={r.moneda}
                          onChange={(e) =>
                            setRenglones((lista) =>
                              lista.map((x) =>
                                // La moneda tambien: el promedio esta en dolares y la
                                // conversion la hace la base con la tasa del dia.
                                x.clave === r.clave
                                  ? { ...x, moneda: e.target.value, confirmado: false }
                                  : x,
                              ),
                            )
                          }
                          opciones={enSimbolos(monedas.data)}
                        />
                      </div>

                      {/*
                        EL AVISO DEL COSTO RARO.

                        La regla la impone la base —`registrar_entradas` rechaza
                        el renglón si no viene confirmado— y esto es la cortesía
                        de decirlo mientras se escribe, con la casilla al lado
                        para no tener que guardar, leer el error y volver.

                        QUIEN DECIDE ES LA BASE, no esta pantalla. Antes se
                        deducía de `v_existencias`, y eso salió mal de dos
                        maneras que se tapaban entre sí: la vista esconde el
                        promedio a quien no ve valoraciones, así que al
                        almacenista le decía «primera entrada» siempre; y la
                        comparación solo se hacía en dólares, que no es la
                        moneda de las facturas de aquí.
                      */}
                      <AvisoDeCosto
                        almacenId={Number(aDonde) || null}
                        articuloId={Number(r.articulo) || null}
                        costo={costo}
                        moneda={r.moneda}
                        cantidad={cant}
                        unidad={art?.unidad ?? ''}
                        nombre={art?.nombre ?? 'Este artículo'}
                        confirmado={r.confirmado === true}
                        onConfirmar={(v) =>
                          setRenglones((lista) =>
                            lista.map((x) => (x.clave === r.clave ? { ...x, confirmado: v } : x)),
                          )
                        }
                      />

                      {/* La cuenta hecha, en grande. No es decoración: es la
                          única señal de que el número tecleado es el que se
                          quería teclear. */}
                      {suma !== null ? (
                        <p className="border-hairline mt-3 border-t pt-2.5 text-sm">
                          <span className="text-ink/45">
                            {new Intl.NumberFormat('es-VE', { maximumFractionDigits: 4 }).format(
                              cant,
                            )}{' '}
                            {art?.unidad ?? ''} × {monto(costo)} ={' '}
                          </span>
                          <span className="tabular text-ink/90 font-semibold">
                            {monto(suma)} {r.moneda}
                          </span>
                        </p>
                      ) : null}
                    </div>
                  )
                })}
              </div>

              {/*
                EL TOTAL DE LA ENTRADA, y solo cuando todos los renglones van en
                la misma moneda.

                Con monedas mezcladas habría que convertir para sumar, y aquí no
                se calcula ninguna tasa —regla 4—. Sumar peras con manzanas y
                enseñarlo como un total sería peor que no enseñar nada: parecería
                un dato y no lo sería. Con una sola moneda, que es el caso de una
                factura, la suma es exacta y no hace falta convertir nada.
              */}
              {(() => {
                const listos = renglones.filter(
                  (r) =>
                    r.articulo &&
                    r.cantidad.trim() !== '' &&
                    r.costo.trim() !== '' &&
                    Number(r.cantidad) > 0 &&
                    Number(r.costo) > 0,
                )
                if (listos.length < 2) return null
                const monedasUsadas = new Set(listos.map((r) => r.moneda))
                if (monedasUsadas.size > 1) return null
                const total = listos.reduce((a, r) => a + Number(r.cantidad) * Number(r.costo), 0)
                return (
                  <div className="border-hairline mt-3 flex items-baseline justify-between border-t pt-3">
                    <span className="text-ink/55 text-sm">
                      Total de la entrada · {listos.length} renglones
                    </span>
                    <span className="tabular text-ink/90 text-lg font-semibold">
                      {monto(total)} {listos[0].moneda}
                    </span>
                  </div>
                )
              })()}

              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                icon={<Plus />}
                onClick={() => setRenglones((v) => [...v, renglonVacio('')])}
              >
                Añadir otro artículo
              </Button>
            </>
          ) : modal.tipo === 'salidas' ? (
            /*
              EL ORDEN ES QUÉ, LUEGO DE DÓNDE

              Quien saca material piensa en lo que necesita, no en el almacén.
              Por eso el artículo va primero y el sitio después, filtrado a los
              que de verdad lo tienen: elegir un sitio y descubrir allí que no
              está es hacer el camino dos veces.

              Y no hay un «de dónde» arriba: con el sitio en cada renglón, uno
              general solo serviría para contradecirlo.
            */
            <>
              <div className="space-y-3">
                {renglones.map((r, i) => {
                  const sitios = (todas.data ?? []).filter(
                    (e) => String(e.articulo_id) === r.articulo && Number(e.disponibles) > 0,
                  )
                  const unidad = sitios[0]?.unidad ?? ''
                  /*
                    El articulo del catalogo, que es quien sabe en que viene.
                    `sitios` sale de las existencias y trae la unidad, pero no
                    la presentacion: para eso hay que ir al catalogo.
                  */
                  const artSale = conSusFormas(
                    (articulos ?? []).find((a) => String(a.id) === r.articulo),
                    formasDeContar,
                  )
                  // Lo que queda para ESTE renglón: lo que hay menos lo que ya
                  // se llevaron los renglones de arriba del mismo par.
                  const disponible =
                    hayEn(r.almacen, r.articulo) - pedidoHasta(i, r.almacen, r.articulo)
                  const pasado = Boolean(r.articulo && r.almacen && Number(r.cantidad) > disponible)

                  return (
                    <div
                      key={r.clave}
                      className="border-hairline rounded-card border border-dashed p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-ink/40 text-2xs font-mono tracking-[0.16em] uppercase">
                          Renglón {i + 1}
                        </span>
                        {renglones.length > 1 ? (
                          <button
                            type="button"
                            className="text-ink/40 hover:text-danger text-xs underline underline-offset-2"
                            onClick={() =>
                              setRenglones((v) => v.filter((x) => x.clave !== r.clave))
                            }
                          >
                            Quitar
                          </button>
                        ) : null}
                      </div>

                      <SelectBuscable
                        label="Qué sale"
                        vacio="Busca el material"
                        valor={r.articulo}
                        onCambio={(v) => {
                          /*
                            Al cambiar de artículo, el sitio elegido puede dejar
                            de tenerlo. Se conserva si lo tiene, y si solo hay
                            un sitio con existencia se pone solo — es la única
                            respuesta posible y preguntarla sobra. Con varios se
                            limpia: elegir por él uno de tres sería decidir de
                            qué almacén sale el costo, que no es cosa nuestra.
                          */
                          const conEse = (todas.data ?? []).filter(
                            (e) => String(e.articulo_id) === v && Number(e.disponibles) > 0,
                          )
                          const sigueValiendo = conEse.some(
                            (e) => String(e.almacen_id) === r.almacen,
                          )
                          setRenglones((lista) =>
                            lista.map((x) =>
                              x.clave === r.clave
                                ? {
                                    ...x,
                                    articulo: v,
                                    // Igual que en la entrada: la unidad cambia
                                    // con el articulo, asi que la cantidad
                                    // vieja y sus bultos dejan de significar
                                    // nada.
                                    cantidad: '',
                                    presentaciones: null,
                                    presentacion: null,
                                    sueltas: '',
                                    almacen: sigueValiendo
                                      ? x.almacen
                                      : conEse.length === 1
                                        ? String(conEse[0].almacen_id)
                                        : '',
                                  }
                                : x,
                            ),
                          )
                        }}
                        opciones={articulosConExistencia}
                      />

                      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                        <SelectBuscable
                          label="De dónde sale"
                          vacio={r.articulo ? 'Elige el sitio' : 'Elige antes el material'}
                          valor={r.almacen}
                          onCambio={(v) =>
                            setRenglones((lista) =>
                              lista.map((x) => (x.clave === r.clave ? { ...x, almacen: v } : x)),
                            )
                          }
                          // Solo los sitios que tienen ese material, con lo que
                          // hay en cada uno: es la información que decide.
                          opciones={sitios.map((e) => ({
                            valor: String(e.almacen_id),
                            codigo: e.almacen_codigo,
                            nombre: e.almacen,
                            detalle: `hay ${cantidad(e.disponibles)} ${e.unidad}`,
                          }))}
                        />

                        {/*
                          LA SALIDA TAMBIEN SE CUENTA EN BULTOS.

                          Aqui habia un campo pelado que pedia litros mientras la
                          entrada, tres pantallas mas arriba, dejaba teclear
                          tambores y convertia. Esa asimetria es peor que no
                          tener ninguna de las dos: quien mete «3 tambores» y ve
                          «= 624 L» aprende que el sistema entiende tambores, y
                          al sacar teclea «1» pensando en un tambor.

                          Lo levanto Christopher el 7/09/2026 preguntando si el
                          sistema interpreta tambores en la entrada Y en la
                          salida. En la entrada si; aqui no lo hacia.

                          El tope de existencia no cambia: `disponible` esta en
                          la unidad del articulo y el componente devuelve en la
                          unidad del articulo, asi que la comparacion sigue
                          siendo entre litros y litros.
                        */}
                        <CantidadDeArticulo
                          key={r.articulo}
                          valor={r.cantidad}
                          onCambiar={(v, cap) =>
                            setRenglones((lista) =>
                              lista.map((x) =>
                                x.clave === r.clave
                                  ? {
                                      ...x,
                                      cantidad: v,
                                      presentaciones: cap.presentaciones,
                                      presentacion: cap.unidad,
                                      sueltas: String(cap.sueltas ?? ''),
                                    }
                                  : x,
                              ),
                            )
                          }
                          articulo={artSale}
                          hintSinArticulo="Elige antes de dónde sale"
                          hint={
                            r.almacen
                              ? pedidoHasta(i, r.almacen, r.articulo) > 0
                                ? `Quedan ${cantidad(disponible)} ${unidad} tras los renglones de arriba`
                                : `Hay ${cantidad(disponible)} ${unidad}`
                              : 'Elige antes de dónde sale'
                          }
                        />
                      </div>

                      {pasado ? (
                        <p className="text-danger mt-2 text-xs">
                          {pedidoHasta(i, r.almacen, r.articulo) > 0
                            ? `Ya lo pediste más arriba: ahí solo quedan ${cantidad(disponible)} ${unidad}.`
                            : `Ahí solo quedan ${cantidad(disponible)} ${unidad}.`}
                        </p>
                      ) : null}
                    </div>
                  )
                })}
              </div>

              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                icon={<Plus />}
                onClick={() => setRenglones((v) => [...v, renglonVacio('', almacenId)])}
              >
                Añadir otro material
              </Button>

              <div className="mt-4">
                <Select
                  /* Decía «¿De qué clase?». Christopher: «falta aclarar un poco,
                     ¿clase de salida? ¿de qué clase... salida?». Era un rótulo
                     escrito por quien ya sabía la respuesta. */
                  label="¿Por qué sale?"
                  value={clase}
                  onChange={(e) => setClase(e.target.value)}
                  hint={claseElegida?.pista ?? undefined}
                  opciones={(clases.data ?? []).map((c) => ({
                    valor: c.codigo,
                    etiqueta: c.nombre,
                  }))}
                />

                {/* Cuando la clase es una baja, el papel deja de ser una salida
                    corriente: destruye valor en libros. Decirlo aquí, y no al
                    guardar, es lo que evita darse cuenta después. */}
                {claseElegida?.tipo === 'SALIDA_BAJA' ? (
                  <p className="text-ink/55 mt-2 text-xs leading-relaxed">
                    Esto es una <strong className="text-ink/75">baja</strong>: el material sale del
                    inventario y su valor se da por perdido. Hay que explicar qué pasó.
                  </p>
                ) : null}

                {/* ESCRITURA y no TOTAL: con TOTAL el boton solo lo veian las
                    cuatro cuentas de administrador, y la lista se hizo editable
                    justamente para que no nos llamaran por ella. */}
                {alcanza('INVENTARIO', 'ESCRITURA') ? (
                  <button
                    type="button"
                    className="text-ink/45 hover:text-ink/75 mt-2 text-xs underline underline-offset-2"
                    onClick={() => setOrdenandoClases(true)}
                  >
                    ¿Falta una razón? Editar la lista
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className="border-hairline bg-canvas rounded-card mb-4 border p-3">
                <p className="text-ink/85 text-sm font-medium">{modal.fila?.articulo}</p>
                <p className="text-ink/55 text-xs">
                  {modal.fila?.almacen} · hay {cantidad(modal.fila?.existencia ?? 0)}{' '}
                  {modal.fila?.unidad}
                </p>
              </div>

              {/*
                CONTAR ES LO QUE MÁS SE HACE EN BULTOS.

                Nadie recorre un almacén anotando «1.466 litros»: anota siete
                tambores llenos y uno empezado. Por eso el conteo estrena el
                componente y la salida de una fila y la baja siguen con el campo
                simple — ahí se saca una cantidad concreta, no se recuenta.

                La diferencia se calcula contra el TOTAL, que es lo que el
                componente devuelve ya sumado; lo que viaja son las dos cifras
                por separado.
              */}
              {modal.tipo === 'ajuste' ? (
                <>
                <CantidadDeArticulo
                    key={modal.fila?.articulo_id}
                  label="Cantidad contada"
                  valor={totalContado}
                  onCambiar={(v, cap) => {
                    setValor(cap.presentaciones ? String(cap.sueltas || '') : v)
                    setBultosContados(cap.presentaciones)
                    setPresentacionContada(cap.unidad)
                    setTotalContado(v)
                  }}
                  articulo={
                    modal.fila
                      ? {
                          /*
                            La unidad sale de la FILA y no del articulo: la fila
                            es la que se esta contando. Lo demas sale del
                            articulo, que es donde viven las formas de contarlo.
                          */
                          unidad: modal.fila.unidad,
                          presentacion: articuloDeLaFila?.presentacion ?? null,
                          unidades_por_presentacion:
                            articuloDeLaFila?.unidades_por_presentacion ?? null,
                          presentaciones: (formasDeContar ?? [])
                            .filter((x) => x.articulo_id === articuloDeLaFila?.id && x.activa)
                            .sort(
                              (a, b) =>
                                Number(b.por_defecto) - Number(a.por_defecto) ||
                                a.presentacion.localeCompare(b.presentacion, 'es'),
                            )
                            .map((x) => ({ presentacion: x.presentacion, unidades: x.unidades })),
                        }
                      : null
                  }
                  hint={
                    modal.fila && totalContado !== ''
                      ? `Diferencia: ${(Number(totalContado) - Number(modal.fila.existencia)).toLocaleString('es-VE', { maximumFractionDigits: 2 })} ${modal.fila.unidad}`
                      : modal.fila
                        ? `Hay ${cantidad(modal.fila.existencia)} ${modal.fila.unidad} según el sistema`
                        : undefined
                  }
                />

                  {/*
                    CONTAR UN ALMACÉN DONDE HAY DE TODO.

                    Christopher, del ACEITE HIDRAULICO 68: «hay 1 tambor, y
                    aproximadamente 21 pailas». Con un solo tipo de envase había
                    que elegir entre decir «2 tambores» o «31 pailas», y las dos
                    eran falsas. Solo aparece cuando el artículo tiene más de una
                    forma declarada: donde no hay mezcla posible, el campo de
                    arriba basta y este bloque sería una pregunta de más.
                  */}
                  {formasDeLaFila.length > 1 ? (
                    hoja.length === 0 ? (
                      <button
                        type="button"
                        className="text-ink/55 hover:text-ink/85 mt-2 text-xs underline underline-offset-2"
                        onClick={() =>
                          setHoja([{ presentacion: formasDeLaFila[0].presentacion, cantidad: '' }])
                        }
                      >
                        ¿Contaste envases de varios tipos?
                      </button>
                    ) : (
                      <div className="mt-3">
                        <ConteoDeEnvases
                          formas={formasDeLaFila}
                          unidad={modal.fila?.unidad ?? ''}
                          existencia={Number(modal.fila?.existencia ?? 0)}
                          lineas={hoja}
                          sueltos={sueltosContados}
                          onCambiar={(l, su, total) => {
                            setHoja(l)
                            setSueltosContados(su)
                            // El total viene del propio componente, que es el
                            // que lo enseña: dos cuentas separadas para la misma
                            // cifra es como dejan de coincidir.
                            setTotalContado(String(total))
                          }}
                        />
                        <button
                          type="button"
                          className="text-ink/45 hover:text-ink/75 mt-2 text-xs underline underline-offset-2"
                          onClick={() => {
                            setHoja([])
                            setSueltosContados('')
                            setTotalContado('')
                          }}
                        >
                          Volver a contar de una sola forma
                        </button>
                      </div>
                    )
                  ) : null}
                </>
              ) : (
                <Input
                  label={
                    modal.tipo === 'salida'
                      ? 'Cantidad que sale'
                      : 'Cantidad que se da de baja'
                  }
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  autoFocus
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  hint={modal.fila ? `En ${modal.fila.unidad}` : undefined}
                />
              )}

              {/*
                POR QUÉ DEJÓ DE SERVIR

                Debajo de la cantidad y antes del motivo: primero cuánto, luego
                de qué clase de pérdida se trata, y al final el relato. La causa
                es lo que después deja responder «cuánto se perdió por
                obsolescencia» sin leer doscientas notas a mano.
              */}
              {modal.tipo === 'salida' ? (
                <>
                  <Select
                    /* Decía «¿De qué clase?» y Christopher preguntó «¿clase de
                       salida? ¿de qué clase... salida?». Era un rótulo escrito
                       por quien ya sabía la respuesta. */
                    label="¿Por qué sale?"
                    value={clase}
                    onChange={(e) => setClase(e.target.value)}
                    hint={claseElegida?.pista ?? undefined}
                    opciones={(clases.data ?? []).map((c) => ({
                      valor: c.codigo,
                      etiqueta: c.nombre,
                    }))}
                  />

                  {/*
                    EL PUENTE A LA OTRA PUERTA

                    Christopher: «esta lista no da las opciones necesarias... esta
                    el caso en que no se dano, no se perdio, pero es obsoleto».

                    Y obsoleto SI existe — con danado, vencido, extraviado y
                    robado— pero vive en Dar de baja. El reparto es correcto:
                    sacar es haberlo gastado o perdido moviendolo; dar de baja es
                    que dejo de servir. Meter «obsoleto» aqui partiria la misma
                    pregunta en dos sitios y ninguno respondería entero.

                    Lo que faltaba era decirlo desde aqui. Quien abrio esta
                    puerta no tiene por que saber que hay otra al lado, y menos
                    con la lista delante pareciendo incompleta.
                  */}
                  <div className="border-hairline rounded-[6px] border p-3">
                    <p className="text-ink/60 text-xs leading-relaxed">
                      ¿Se dañó, venció, quedó obsoleto, se extravió o se lo llevaron? Eso no es
                      sacarlo: es <strong className="text-ink/80">darlo de baja</strong>, y ahí
                      sí está cada una de esas causas.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => abrir('baja', modal.fila)}
                    >
                      Darlo de baja
                    </Button>
                  </div>
                </>
              ) : null}

              {modal.tipo === 'baja' ? (
                <>
                  <Select
                    label="¿Por qué?"
                    value={causa}
                    onChange={(e) => setCausa(e.target.value)}
                    hint={CAUSAS_DE_BAJA.find((c) => c.valor === causa)?.dice}
                    opciones={CAUSAS_DE_BAJA.map((c) => ({
                      valor: c.valor,
                      etiqueta: c.etiqueta,
                    }))}
                  />

                  <Input
                    label="¿Y qué se hizo con eso?"
                    value={destino}
                    onChange={(e) => setDestino(e.target.value)}
                    hint="Opcional. Se desechó, se vendió como chatarra, se guardó para repuestos — para que nadie lo salga a buscar después."
                  />
                </>
              ) : null}
            </>
          )}

          {modal.tipo === 'entrada' ? (
            <Input
              className="mt-4"
              label="Referencia"
              hint="Opcional: quién lo trajo, o el número de una factura de fuera."
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
            />
          ) : null}

          <Textarea
            label={
              modal.tipo === 'entrada'
                ? 'De dónde vino'
                : modal.tipo === 'salidas'
                  ? // «Para qué sale» no encaja con una merma ni con una baja:
                    // nada se derrama para algo. Cada clase pregunta lo que de
                    // verdad se responde.
                    claseElegida?.tipo === 'SALIDA_CONSUMO' && !claseElegida?.exige_detalle
                    ? 'Para qué sale'
                    : 'Qué pasó'
                  : modal.tipo === 'salida'
                  // «Para qué sale» no encaja con una merma: nada se derrama
                  // para algo. Cada clase pregunta lo que de verdad se
                  // responde.
                  ? clase === 'SALIDA_MERMA'
                    ? 'Qué pasó'
                    : 'Para qué sale'
                  : modal.tipo === 'baja'
                    ? 'Qué pasó'
                    : 'Qué explica la diferencia'
            }
            className="mt-4"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            hint={
              modal.tipo === 'baja'
                ? 'Con detalle: dentro de un año esta frase será lo único que quede para justificar la pérdida. Queda en el libro y no se puede editar.'
                : 'Queda en el libro y no se puede editar después.'
            }
          />

          {/* El de `salidas` faltaba, y era el unico de los cinco. La base para
              la salida y nombra el renglon; sin esta linea el boton se quedaba
              mudo y el operador no sabia por que no pasaba nada. */}
          {salidas.error ? <ErrorDeCarga error={salidas.error} className="mt-3" /> : null}
          {ajuste.error ? <ErrorDeCarga error={ajuste.error} className="mt-3" /> : null}
          {entrada.error ? <ErrorDeCarga error={entrada.error} className="mt-3" /> : null}
          {baja.error ? <ErrorDeCarga error={baja.error} className="mt-3" /> : null}
        </Modal>
      ) : null}

      <Visor
        abierto={acta !== null}
        onCerrar={() => setActa(null)}
        blob={acta?.blob ?? null}
        nombreArchivo={acta?.nombre ?? ''}
        titulo="Acta de existencias"
      />
    </>
  )
}

/*
  LA FRANJA DE CIFRAS DEL SITIO

  Cuatro datos en una línea, con un separador entre ellos. No son tarjetas: una
  tarjeta pide atención y aquí la atención es de la lista.

  El de reponer es el único que se enciende, y solo cuando hay algo que
  atender. Los demás informan; ese reclama, y además lleva — pulsarlo filtra la
  lista a lo que está bajo mínimo, que es lo que se quiere ver justo después de
  leer que hay siete.
*/
function Franja({
  sitio,
  conExistencia,
  listados,
  valor,
  porReponer,
  traslados,
  onVerBajos,
}: {
  sitio: string | null
  conExistencia: number
  listados: number
  /** Nulo cuando quien mira no tiene INVENTARIO.VER_VALORACION. */
  valor: number | null
  porReponer: number
  traslados: number
  onVerBajos: () => void
}) {
  return (
    <div className="border-hairline mb-4 rounded-[6px] border px-4 py-3">
      <p className="text-ink/40 text-2xs font-mono tracking-[0.16em] uppercase">
        {sitio ?? 'Toda la empresa'}
      </p>

      <dl className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-1.5">
          <dt className="text-ink/45 text-xs">Tiene</dt>
          <dd className="text-ink/85 tabular text-sm font-semibold">
            {enteros(conExistencia)}
          </dd>
          <span className="text-ink/40 text-xs">
            de {enteros(listados)} artículo{listados === 1 ? '' : 's'}
          </span>
        </div>

        {valor !== null ? (
          <div className="flex items-baseline gap-1.5">
            <dt className="text-ink/45 text-xs">Vale</dt>
            <dd className="text-ink/85 tabular text-sm font-semibold">{dolares(valor)}</dd>
            <span className="text-ink/40 text-xs">a costo promedio</span>
          </div>
        ) : null}

        <div className="flex items-baseline gap-1.5">
          <dt className="text-ink/45 text-xs">Por reponer</dt>
          {porReponer > 0 ? (
            <button
              type="button"
              onClick={onVerBajos}
              className="text-warning tabular text-sm font-semibold underline underline-offset-2"
            >
              {enteros(porReponer)}
            </button>
          ) : (
            <dd className="text-ink/30 tabular text-sm font-semibold">0</dd>
          )}
          <span className="text-ink/40 text-xs">
            {porReponer > 0 ? 'en el mínimo o por debajo' : 'nada pendiente'}
          </span>
        </div>

        <div className="flex items-baseline gap-1.5">
          <dt className="text-ink/45 text-xs">Traslados</dt>
          <dd className="text-ink/85 tabular text-sm font-semibold">{enteros(traslados)}</dd>
          <span className="text-ink/40 text-xs">
            {sitio ? 'entrados y salidos de aquí' : 'en el libro'}
          </span>
        </div>
      </dl>
    </div>
  )
}

/*
  CÓMO ENTRÓ ESTE ARTÍCULO A ESTE ALMACÉN.

  Una línea por envase con el que se compró aquí, con lo que costó ese envase y
  cuándo fue la última vez. Se calla entera si no hay compras con envase
  anotado: una tabla vacía es peor que ninguna, porque parece que falta un dato
  en vez de que no lo hay.

  Hoy se calla en todas partes, y es esperable: las ocho entradas que existen son
  del 5 de septiembre y ninguna capturó el envase, porque ese día el sistema no
  sabía capturarlo. Empieza a hablar con la próxima compra que se teclee en
  tambores.
*/
function ComoEntroAqui({ articuloId, almacenId }: { articuloId: number; almacenId: number }) {
  const { data } = useCostoPorPresentacion(articuloId, almacenId)

  // Solo las compras que dijeron en qué envase venían. La fila sin envase es la
  // compra suelta, y de esa el costo por unidad ya está arriba.
  const conEnvase = (data ?? []).flatMap((c) =>
    c.presentacion ? [{ ...c, presentacion: c.presentacion }] : [],
  )
  if (conEnvase.length === 0) return null

  return (
    <div className="mt-1 space-y-0.5">
      {conEnvase.map((c) => (
        <p key={c.presentacion} className="text-ink/50 text-xs">
          Entró en <span className="text-ink/70">{c.presentacion}</span>
          {c.costo_envase ? (
            <>
              {' · '}
              <span className={c.corregido_despues ? 'line-through' : undefined}>
                {dolares(c.costo_envase)}
              </span>{' '}
              el {c.presentacion.toLowerCase()}
            </>
          ) : null}
          {c.corregido_despues ? (
            <span className="text-ink/40"> · su valoración se corrigió después</span>
          ) : null}
        </p>
      ))}
    </div>
  )
}

/**
 * En qué sitios está repartido un artículo, y qué se puede hacer en cada uno.
 *
 * Es el puente entre el total y el almacén. Las filas con existencia en cero se
 * muestran igual, apagadas: saber que un taller tuvo el repuesto y se le acabó
 * es distinto de no verlo listado, que se lee como que nunca lo manejó.
 */
function ModalDesglose({
  articulo,
  onCerrar,
  puedeMover,
  puedeCorregirCosto,
  onSacar,
  onContar,
  onCorregirCosto,
}: {
  articulo: ExistenciaTotal | null
  onCerrar: () => void
  puedeMover: boolean
  puedeCorregirCosto: boolean
  onSacar: (fila: Existencia) => void
  onContar: (fila: Existencia) => void
  onCorregirCosto: (fila: Existencia) => void
}) {
  const { data, isPending, error } = useExistenciasDeArticulo(articulo?.articulo_id ?? null)

  return (
    <Modal
      abierto={articulo !== null}
      onCerrar={onCerrar}
      titulo={articulo?.articulo ?? ''}
      descripcion={
        articulo
          ? `Hay ${cantidad(articulo.existencia)} ${articulo.unidad} en total. Aquí es donde están.`
          : undefined
      }
      acciones={
        <Button variant="ghost" onClick={onCerrar}>
          Cerrar
        </Button>
      }
    >
      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data ? (
        <ul className="divide-hairline divide-y">
          {data.map((f) => {
            const vacio = Number(f.existencia) <= 0
            return (
              <li key={f.almacen_id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 grow">
                  <p className={cn('text-sm font-medium', vacio ? 'text-ink/40' : 'text-ink/85')}>
                    {f.almacen}
                  </p>
                  <p className="text-ink/45 text-xs">
                    <span className="tabular">{cantidad(f.existencia)}</span> {f.unidad}
                    {f.costo_promedio_usd ? ` · ${dolares(f.costo_promedio_usd)} c/u` : ''}
                  </p>

                  {/*
                    EN QUÉ ENVASE ENTRÓ AQUÍ, Y A CÓMO.

                    Christopher: «si se compra un tambor para un almacén, ¿cómo
                    puedo ver expresamente esa forma de medir o presentación del
                    item en ese almacén y con el valor acorde?».

                    Esto NO es la equivalencia que quitamos hace un rato. Aquella
                    dividía 604 entre 208 y decía «2 tambores», que nadie contó y
                    resultó ser falso. Esto es lo que alguien tecleó al recibir:
                    el envase, el precio y el día. Un hecho cabe en una pantalla
                    de existencias; una suposición no.
                  */}
                  <ComoEntroAqui articuloId={f.articulo_id} almacenId={f.almacen_id} />

                </div>

                <div className="flex gap-1">
                  {puedeMover ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<PackageMinus />}
                        disabled={vacio}
                        onClick={() => onSacar(f)}
                      >
                        Sacar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Scale />}
                        onClick={() => onContar(f)}
                      >
                        Contar
                      </Button>
                    </>
                  ) : null}

                  {/*
                    CORREGIR EL COSTO TAMBIEN AQUI, y esta es la puerta que de
                    verdad se usa.

                    El boton existia solo en la fila de un almacen concreto,
                    porque el costo promedio se lleva por pareja (almacen,
                    articulo) y desde el total no significa nada. Cierto, y por
                    eso INDESCUBRIBLE: la vista de serie es el total, donde la
                    fila solo ofrece «Ver donde esta», y nadie adivina que hay
                    que cambiar de vista antes.

                    Este modal ES el sitio: aqui cada renglon ya ES una pareja
                    (almacen, articulo). Lo pidio Christopher no encontrandolo,
                    que es la unica forma fiable de saber que algo no se
                    encuentra.
                  */}
                  {puedeCorregirCosto ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Coins />}
                      disabled={vacio}
                      onClick={() => onCorregirCosto(f)}
                    >
                      Corregir el costo
                    </Button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
    </Modal>
  )
}

/**
 * El aviso del costo, con la respuesta de la base en vez de una deducción.
 *
 * Es un componente y no un trozo suelto porque tiene que preguntar, y preguntar
 * es un hook. Lo que gana con eso son las dos cosas que antes fallaban en
 * silencio: sale en cualquier moneda —la conversión la hace la base con la tasa
 * del día— y distingue de verdad la primera entrada del desvío, aunque quien
 * teclea no tenga permiso para ver el promedio.
 *
 * A esa persona se le dice QUE se sale, no CUANTO. Es poco, pero es cierto, y
 * es exactamente lo que dice el mensaje de la base cuando rechaza: así lo que
 * lee antes de guardar y lo que leería después no se contradicen.
 */
function AvisoDeCosto({
  almacenId,
  articuloId,
  costo,
  moneda,
  cantidad: cant,
  unidad,
  nombre,
  confirmado,
  onConfirmar,
}: {
  almacenId: number | null
  articuloId: number | null
  costo: number
  moneda: string
  cantidad: number
  unidad: string
  nombre: string
  confirmado: boolean
  onConfirmar: (valor: boolean) => void
}) {
  const revision = useRevisarCostoDeEntrada(almacenId, articuloId, costo, moneda)

  if (!articuloId || costo <= 0 || cant <= 0) return null

  const r = revision.data
  /*
    Mientras la base contesta no se pinta nada. Enseñar un hueco reservado que
    luego casi siempre queda vacío entrena a no mirarlo, que es lo contrario de
    lo que hace falta aquí.
  */
  if (!r || r.estado === 'NORMAL' || r.estado === 'SIN_ARTICULO') return null

  if (r.estado === 'SIN_TASA') {
    return (
      <p className="text-ink/50 mt-3 text-xs">
        No hay tasa del {moneda} para hoy, así que este costo no se puede comparar con lo que el
        artículo viene costando. La base avisará al guardar.
      </p>
    )
  }

  const casilla = (texto: string) => (
    <label className="text-ink/70 mt-2 flex cursor-pointer items-center gap-2 text-xs">
      <input type="checkbox" checked={confirmado} onChange={(e) => onConfirmar(e.target.checked)} />
      {texto}
    </label>
  )

  /*
    LA PRIMERA VEZ NO HAY CONTRA QUE COMPARAR, Y ES CUANDO MAS DUELE.

    Los cinco aceites del 5 de septiembre entraban por primera vez, así que la
    reja de las diez veces no tenía con qué medirlos y calló. No hay número
    contra el que avisar; lo que sí se puede es decir que NADIE lo está
    comprobando, y que ese costo se convierte en la referencia de todo lo que
    venga después.

    La base lo exige igual, así que esto no es un adorno: sin la casilla, el
    guardado fallaría con un error que la pantalla no ofrece cómo resolver.
  */
  if (r.estado === 'PRIMERA') {
    return (
      <div className="border-hairline bg-ink/4 rounded-card mt-3 border p-2.5">
        <p className="text-ink/80 text-xs leading-relaxed">
          <strong>Es la primera vez que entra a este almacén</strong>, así que no hay con qué
          comparar el costo. Serán <span className="tabular">{cantidad(cant)}</span> {unidad} a{' '}
          <span className="tabular">{monto(costo)}</span> cada una. Este costo se convierte en la
          referencia de todo lo que entre después.
        </p>
        {casilla('Lo comprobé con la factura')}
      </div>
    )
  }

  const veLasCifras = r.veces != null && r.viene_costando != null && r.entra_a != null

  return (
    <div className="border-warning/40 bg-warning-soft rounded-card mt-3 border p-2.5">
      <p className="text-ink/80 text-xs leading-relaxed">
        {veLasCifras ? (
          <>
            <strong>
              {nombre} viene costando {monto(r.viene_costando!)}
            </strong>{' '}
            por {unidad || 'unidad'} y lo estás metiendo a {monto(r.entra_a!)}: son{' '}
            <strong>
              {monto(r.veces!)} veces {r.hacia === 'ARRIBA' ? 'más' : 'menos'}
            </strong>
            .
          </>
        ) : (
          <>
            <strong>
              Este costo se sale mucho de lo que {nombre} viene costando en este almacén
            </strong>{' '}
            — es más de diez veces {r.hacia === 'ARRIBA' ? 'más caro' : 'más barato'}.
          </>
        )}{' '}
        Comprueba la factura y la moneda: un cero de más aquí se arrastra a cada salida.
      </p>
      {casilla('Es correcto, guárdalo así — quedará anotado en el movimiento')}
    </div>
  )
}

/**
 * Corregir el costo de lo que hay, con el parte delante.
 *
 * Hasta hoy esto solo existía en la base: `corregir_costo` estaba escrita,
 * probada y sin ninguna puerta. Era la única salida real del aceite cargado a
 * 1.209.012,48 y del gasoil del tanque sin costo, y no la podía usar nadie.
 *
 * EL RECORRIDO ES EL DE UN RUNBOOK, que es como lo pidió Christopher: se
 * escribe el costo correcto, se ve el parte entero —incluida la parte incómoda,
 * lo que ya salió cargado al costo falso y no se recupera—, se dice por qué, y
 * se confirma. El parte va antes y no después: quien va a mover medio millón de
 * dólares de valoración tiene que ver el número primero.
 *
 * NO EDITA NADA. La base escribe un par de movimientos —sale todo al costo
 * equivocado, entra todo al correcto—, así que la existencia no se mueve y los
 * dos renglones quedan a la vista en el historial. Una corrección de esta
 * magnitud tiene que verse.
 */
function ModalCorregirCosto({ fila, onCerrar }: { fila: Existencia; onCerrar: () => void }) {
  const corregir = useCorregirCosto()
  const [nuevo, setNuevo] = useState('')
  const [porque, setPorque] = useState('')

  const valor = Number(nuevo.replace(',', '.'))
  const valido = nuevo.trim() !== '' && Number.isFinite(valor) && valor >= 0
  const impacto = useImpactoDeCorregirCosto(
    fila.almacen_id,
    fila.articulo_id,
    valido ? valor : NaN,
  )

  const p = impacto.data
  /*
    Las tres exigencias de la base, repetidas en el botón para que nadie tenga
    que chocar contra ellas: motivo de diez, costo válido, y distinto del que
    hay.
  */
  const listo =
    valido &&
    porque.trim().length >= 10 &&
    p != null &&
    Math.abs(valor - Number(p.costo_actual)) > 1e-6

  const linea = (que: string, cuanto: string, fuerte?: boolean) => (
    <div className="flex justify-between gap-4">
      <dt className="text-ink/55">{que}</dt>
      <dd className={cn('tabular', fuerte ? 'text-ink/90 font-semibold' : 'text-ink/80')}>
        {cuanto}
      </dd>
    </div>
  )

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Corregir el costo"
      descripcion={`${fila.articulo} · ${fila.almacen}`}
      ancho="sm"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={!listo || corregir.isPending}
            onClick={async () => {
              await corregir.mutateAsync({
                almacen_id: fila.almacen_id,
                articulo_id: fila.articulo_id,
                costo_correcto: valor,
                motivo: porque.trim(),
              })
              onCerrar()
            }}
          >
            {corregir.isPending ? 'Corrigiendo…' : 'Corregir el costo'}
          </Button>
        </>
      }
    >
      <p className="text-ink/70 text-sm">
        Hay <span className="tabular">{cantidad(fila.existencia)}</span> {fila.unidad} a{' '}
        <span className="tabular text-ink/90 font-semibold">
          {fila.costo_promedio_usd == null ? '—' : monto(Number(fila.costo_promedio_usd))}
        </span>{' '}
        cada una. No se cambia ninguna cantidad: sale todo al costo de ahora y vuelve a entrar al
        correcto, y los dos renglones quedan en el historial.
      </p>

      <Input
        label="Costo correcto por unidad (USD)"
        className="mt-4"
        type="number"
        min="0"
        step="0.000001"
        inputMode="decimal"
        value={nuevo}
        onChange={(e) => setNuevo(e.target.value)}
      />

      {p ? (
        <dl className="border-hairline rounded-card mt-4 space-y-1 border p-3 text-sm">
          {linea('Valor de ahora', monto(Number(p.valor_actual)))}
          {linea('Valor corregido', monto(Number(p.valor_corregido)))}
          {linea(
            'Ajuste en libros',
            `${Number(p.ajuste) < 0 ? '−' : '+'}${monto(Math.abs(Number(p.ajuste)))}`,
            true,
          )}

          {/*
            LA PARTE INCÓMODA, y se enseña a propósito.

            Corregir hoy no reprecia lo que salió ayer: eso ya se le cargó a una
            máquina o a un centro de costo y ahí se queda. La base devuelve este
            número justamente para que no se esconda.
          */}
          {Number(p.no_se_recupera) !== 0 ? (
            <div className="border-hairline mt-2 border-t pt-2">
              <p className="text-ink/70 text-xs leading-relaxed">
                Ya salieron <span className="tabular">{cantidad(p.ya_salio)}</span> {p.unidad}{' '}
                cargados al costo de ahora.{' '}
                <strong>{monto(Math.abs(Number(p.no_se_recupera)))} no se recupera</strong>: eso ya
                se le cargó a una máquina o a un centro de costo, y esto no lo reprecia.
              </p>
            </div>
          ) : null}
        </dl>
      ) : null}

      {impacto.error ? <ErrorDeCarga error={impacto.error} className="mt-3" /> : null}

      {/*
          EL EJEMPLO DICE QUE ESCRIBIR, NO QUE RESPONDER.

          Aqui habia un caso real entero —«Se cargo el precio del tambor donde
          iba el del litro. Factura NASELF 000617»— y Christopher lo paro: «es
          demasiado especifico a un caso puntual en vez de ser generico o de
          guia».

          Y el problema es peor que la especificidad: un ejemplo que parece una
          respuesta invita a copiarlo. Con veinte correcciones diciendo todas lo
          mismo, el campo del porque deja de explicar nada — que es justo lo
          contrario de por que existe. Ademas metia un numero de factura real en
          un texto de pantalla.

          Asi que se dice que tiene que llevar: el error y el respaldo.
        */}
      <Textarea
        label="Por qué se corrige"
        className="mt-4"
        rows={2}
        placeholder="Qué se cargó mal y con qué papel se comprueba el costo correcto"
        value={porque}
        onChange={(e) => setPorque(e.target.value)}
        hint="Queda en el movimiento y se avisa a administración y gerencia. Mínimo diez caracteres."
      />

      {corregir.error ? <ErrorDeCarga error={corregir.error} className="mt-3" /> : null}
    </Modal>
  )
}
