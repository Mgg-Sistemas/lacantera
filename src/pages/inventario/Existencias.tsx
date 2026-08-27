import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  Boxes,
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
import { useMisRoles, useArticulos } from '@/lib/api/catalogo'
import { CantidadDeArticulo } from '@/components/CantidadDeArticulo'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useMonedasUsables, enSimbolos } from '@/lib/api/tasas'
import {
  useAlmacenes,
  useExistencias,
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
      .select('numero, fecha, cantidad, unidad, costo_usd, valor_usd, almacen_id, articulo_id')
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
  const monedas = useMonedasUsables()
  const { data: empresa } = useEmpresa()
  const { nombre: yo } = useSesion()
  const [acta, setActa] = useState<ArchivoArmado | null>(null)

  const [busqueda, setBusqueda] = useState('')
  const [soloBajas, setSoloBajas] = useState(false)
  const [desglose, setDesglose] = useState<ExistenciaTotal | null>(null)
  const [modal, setModal] = useState<
    null | { tipo: 'salida' | 'salidas' | 'ajuste' | 'entrada' | 'baja'; fila: Existencia | null }
  >(null)
  const [valor, setValor] = useState('')
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
  const todas = useExistencias(undefined, modal?.tipo === 'salidas')

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

  const valorTotal = filtradas.reduce((s, e) => s + Number(e.valor_usd), 0)

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

  const abrir = (
    tipo: 'salida' | 'salidas' | 'ajuste' | 'entrada' | 'baja',
    fila: Existencia | null,
  ) => {
    setCausa(CAUSAS_DE_BAJA[0].valor)
    setDestino('')
    setClase((clases.data ?? [])[0]?.codigo ?? '')
    setValor(tipo === 'ajuste' && fila ? fila.existencia : '')
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
            cantidad: Number(r.cantidad),
            costo: Number(r.costo),
            moneda: r.moneda,
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
          cantidad: Number(r.cantidad),
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
      await ajuste.mutateAsync({
        almacen_id: modal.fila!.almacen_id,
        articulo_id: modal.fila!.articulo_id,
        contado: Number(valor),
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
            <p className="text-ink/80 text-sm">
              Valor del inventario:{' '}
              <span className="tabular font-semibold">{dolares(valorTotal)}</span>
            </p>
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
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <ModalDesglose
        articulo={desglose}
        onCerrar={() => setDesglose(null)}
        puedeMover={puede('ALMACEN')}
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
          ancho={modal.tipo === 'salidas' ? 'md' : 'sm'}
          acciones={
            <>
              <Button variant="ghost" onClick={() => setModal(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() => void guardar()}
                disabled={
                  (modal.tipo !== 'entrada' && modal.tipo !== 'salidas' && !valor) ||
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
                onCambio={setADonde}
                opciones={(almacenes ?? []).map((a) => ({
                  valor: String(a.id),
                  codigo: a.codigo,
                  nombre: a.nombre,
                  detalle: a.tipo,
                }))}
              />

              <div className="mt-4 space-y-3">
                {renglones.map((r, i) => {
                  const art = (articulos ?? []).find((a) => String(a.id) === r.articulo)
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
                            lista.map((x) => (x.clave === r.clave ? { ...x, articulo: v } : x)),
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

                      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                        {/*
                          Aqui es donde mas falta hacia: quien registra la
                          entrada esta contando bultos bajados de un camion y
                          tiene que dejar litros en la existencia.
                        */}
                        <CantidadDeArticulo
                          valor={r.cantidad}
                          onCambiar={(v: string) =>
                            setRenglones((lista) =>
                              lista.map((x) => (x.clave === r.clave ? { ...x, cantidad: v } : x)),
                            )
                          }
                          articulo={art}
                        />

                        <Input
                          label="Costo por unidad"
                          type="number"
                          min="0"
                          step="0.0001"
                          inputMode="decimal"
                          value={r.costo}
                          onChange={(e) =>
                            setRenglones((lista) =>
                              lista.map((x) =>
                                x.clave === r.clave ? { ...x, costo: e.target.value } : x,
                              ),
                            )
                          }
                          hint="Lo que costó, en la moneda en que se pagó."
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
                                x.clave === r.clave ? { ...x, moneda: e.target.value } : x,
                              ),
                            )
                          }
                          opciones={enSimbolos(monedas.data)}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

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

                      <div className="mt-3 grid gap-3 sm:grid-cols-[1.5fr_1fr]">
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

                        <Input
                          label="Cantidad"
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={r.cantidad}
                          onChange={(e) =>
                            setRenglones((lista) =>
                              lista.map((x) =>
                                x.clave === r.clave ? { ...x, cantidad: e.target.value } : x,
                              ),
                            )
                          }
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

              <Input
                label={
                  modal.tipo === 'salida'
                    ? 'Cantidad que sale'
                    : modal.tipo === 'baja'
                      ? 'Cantidad que se da de baja'
                      : 'Cantidad contada'
                }
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                autoFocus
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                hint={
                  modal.tipo === 'ajuste' && modal.fila && valor !== ''
                    ? `Diferencia: ${(Number(valor) - Number(modal.fila.existencia)).toLocaleString('es-VE', { maximumFractionDigits: 2 })} ${modal.fila.unidad}`
                    : modal.fila
                      ? `En ${modal.fila.unidad}`
                      : undefined
                }
              />

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
  valor: number
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

        <div className="flex items-baseline gap-1.5">
          <dt className="text-ink/45 text-xs">Vale</dt>
          <dd className="text-ink/85 tabular text-sm font-semibold">{dolares(valor)}</dd>
          <span className="text-ink/40 text-xs">a costo promedio</span>
        </div>

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
  onSacar,
  onContar,
}: {
  articulo: ExistenciaTotal | null
  onCerrar: () => void
  puedeMover: boolean
  onSacar: (fila: Existencia) => void
  onContar: (fila: Existencia) => void
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
                </div>

                {puedeMover ? (
                  <div className="flex gap-1">
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
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </Modal>
  )
}
