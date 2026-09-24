import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowDownLeft, ArrowUpRight, FileText, Printer, ScrollText, Undo2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { RangoDeFechas } from '@/components/RangoDeFechas'
import { SIN_RANGO } from '@/components/rango'
import type { Rango } from '@/components/rango'
import { PESTANAS_MATERIAL } from '@/components/pestanasDeModulos'
import { NotaRecortada } from '@/components/NotaRecortada'
import { useNotaDeTraslado } from '@/pages/salidas/NotaDeTraslado'
import { useNotaDeSalida } from '@/pages/salidas/NotaDeSalida'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { densidadesDeArticulos, useArticulos, useMisRoles, usePerfiles } from '@/lib/api/catalogo'
import {
  bajaDe,
  motivoDeSalida,
  nombreDeMovimiento,
  paraQuienSalio,
  puertaEnPalabras,
  useAlmacenes,
  useGruposDeSalida,
  useMovimientos,
  useReversarMovimiento,
} from '@/lib/api/inventario'
import type { Movimiento } from '@/lib/api/inventario'
import { Visor } from '@/components/Visor'
import { useEmpresa } from '@/lib/api/empresa'
import { useSesion } from '@/lib/sesion'
import { armarLibroDeMovimientos } from '@/lib/ficha/libroMovimientos'

import type { ArchivoArmado } from '@/lib/ficha/armado'
import { dolares, fecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

function fechaHora(iso: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/**
 * «contó 7 TAMBOR y 10 L», o nada si se contó directamente en la unidad de
 * operación. Sale de aquí para que la fila y el detalle lo digan igual.
 */
function loQueSeConto(m: Movimiento): string | null {
  if (!m.cantidad_capturada) return null
  const suelto = Number(m.suelto_capturado)
  return (
    `contó ${Number(m.cantidad_capturada).toLocaleString('es-VE')} ${m.unidad_capturada ?? ''}` +
    (suelto ? ` y ${suelto.toLocaleString('es-VE')} ${m.unidad}` : '')
  )
}

/** Lo que se pide a la base. Ver por qué en la llamada. */
const TOPE = 1000

/*
  CUÁNTAS FILAS SE ENSEÑAN ANTES DE PEDIR EL RESTO.

  Ocho, que es lo que cabe sin empujar la lista fuera de la pantalla en un
  portátil. No es un número redondo por gusto: por debajo de seis el resumen deja
  de resumir, y por encima de diez ya hay que hacer scroll para llegar al detalle
  que el resumen venía a encabezar.
*/
const VISIBLES = 8

/*
  LAS TRES CLASES QUE LA GENTE DISTINGUE, Y NO LOS DIEZ TIPOS QUE GUARDA LA BASE.

  El usuario habló de «salidas, entradas o traslados». La base guarda diez tipos
  —entrada por compra, salida a consumo, transferencia de entrada…— y esa
  precisión sirve para el renglón, no para filtrar: quien pregunta «cuánto salió
  de arena» no quiere elegir entre salida a consumo, por despacho, como pago de
  una compra y por baja.

  Los ajustes de costo y los reversos quedan fuera de las tres a propósito: no
  mueven material, mueven el valor. Meterlos entre las entradas inflaría la
  cuenta con kilos que nunca entraron.
*/
const TIPOS_DE_CLASE: Record<string, string[]> = {
  ENTRADAS: ['ENTRADA_COMPRA', 'ENTRADA_PRODUCCION', 'ENTRADA_DEVOLUCION', 'ENTRADA_DIRECTA'],
  SALIDAS: ['SALIDA_CONSUMO', 'SALIDA_DESPACHO', 'SALIDA_INTERCAMBIO', 'SALIDA_BAJA'],
  TRASLADOS: ['TRANSFERENCIA_ENTRADA', 'TRANSFERENCIA_SALIDA'],
}

const CLASES = [
  { valor: 'ENTRADAS', etiqueta: 'Solo entradas' },
  { valor: 'SALIDAS', etiqueta: 'Solo salidas' },
  { valor: 'TRASLADOS', etiqueta: 'Solo traslados' },
]

const AGRUPACIONES = [
  { valor: 'articulo', etiqueta: 'Por material' },
  { valor: 'persona', etiqueta: 'Por quién lo movió' },
  { valor: 'mes', etiqueta: 'Por mes' },
]

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/*
  DE QUÉ SE SUMA, Y POR QUÉ NO SE SUMA TODO JUNTO.

  «Si hay 10 salidas de arena, ¿cuánto es el total?» —el usuario—. La respuesta
  parece un `sum(cantidad)` y no lo es: en el mismo libro conviven sacos,
  litros, metros cúbicos y unidades. Sumar 3 sacos con 40 litros da 43 de nada.

  Así que se cuenta SIEMPRE cuántos movimientos, que no tiene unidad, y la
  cantidad se suma **por unidad**. Un grupo que mezcla dos unidades enseña las
  dos, y ninguna de las dos miente.

  Y el signo se respeta: una entrada suma y una salida resta. Cuando el filtro
  ya acotó a una sola clase, el signo es el mismo en todas y el total se lee
  como «cuánto salió» sin más.
*/
interface Grupo {
  clave: string
  etiqueta: string
  cuantos: number
  porUnidad: Map<string, number>
}

function agrupar(
  movimientos: Movimiento[],
  por: string,
  nombreDe: (id: string | null) => string,
): Grupo[] {
  const grupos = new Map<string, Grupo>()

  for (const m of movimientos) {
    let clave: string
    let etiqueta: string
    if (por === 'persona') {
      clave = m.registrado_por ?? 'sin-nombre'
      etiqueta = nombreDe(m.registrado_por) || 'Sin registrar quién'
    } else if (por === 'mes') {
      // Se agrupa por la FECHA del movimiento y no por cuándo se escribió: es
      // la misma razón por la que la consulta filtra por `fecha`.
      const [anio, mes] = (m.fecha ?? '').split('-')
      clave = `${anio}-${mes}`
      etiqueta = mes ? `${MESES[Number(mes) - 1]} de ${anio}` : 'Sin fecha'
    } else {
      clave = String(m.articulo_id ?? 'sin-articulo')
      etiqueta = m.articulo?.nombre ?? 'Sin artículo'
    }

    const g = grupos.get(clave) ?? { clave, etiqueta, cuantos: 0, porUnidad: new Map() }
    g.cuantos += 1
    const unidad = m.unidad || '—'
    g.porUnidad.set(unidad, (g.porUnidad.get(unidad) ?? 0) + Number(m.cantidad) * (m.signo ?? 1))
    grupos.set(clave, g)
  }

  // Por mes se ordena por fecha —enero antes que abril, que es lo que se
  // pregunta—; en los otros dos manda quién movió más.
  const lista = [...grupos.values()]
  return por === 'mes'
    ? lista.sort((a, b) => b.clave.localeCompare(a.clave))
    : lista.sort((a, b) => b.cuantos - a.cuantos)
}

/*
  QUÉ GRUPOS SE PUEDEN PULSAR PARA FILTRAR.

  Material y persona sí: los dos son un filtro que ya existe arriba. El mes no,
  porque el rango de fechas es un control con sus dos extremos y meterle un mes
  desde aquí dejaría la pantalla diciendo una cosa y el control otra.

  Y los grupos sin dato —«Sin artículo», «Sin registrar quién»— tampoco: no hay
  nada que poner en el filtro.
*/
const puedeFiltrarse = (por: string, clave: string) =>
  (por === 'articulo' && clave !== 'sin-articulo') ||
  (por === 'persona' && clave !== 'sin-nombre')

const cantidadLegible = (porUnidad: Map<string, number>) =>
  [...porUnidad.entries()]
    .map(([unidad, total]) => `${total.toLocaleString('es-VE', { maximumFractionDigits: 2 })} ${unidad}`)
    .join(' · ')

export function Movimientos() {
  const { data: almacenes } = useAlmacenes()
  const { data: perfiles } = usePerfiles()
  // Para poder decir «para CHOFERES» sin traerse el organigrama entero, que
  // además está cerrado a quien no tiene nómina.
  const grupos = useGruposDeSalida()
  const { puede } = useMisRoles()
  const reversar = useReversarMovimiento()
  const notaDeTraslado = useNotaDeTraslado()

  /*
    LA NOTA, DESDE EL MOVIMIENTO

    Christopher: «esto aquí es una salida, que ciertamente pertenece a los
    movimientos, pero ¿por qué no puedo ver u obtener el PDF desde acá también?».

    Tenía razón y era un descuido de sitio: la nota se armaba solo en el momento
    de registrar la salida. Quien la necesita otra vez —porque se perdió el
    papel, o porque quien lo firmó lo pidió— llega por el libro.

    LOS MOVIMIENTOS VIEJOS NO TIENEN NÚMERO DE NOTA

    El número se inventó hoy, así que los de antes no lo llevan. En vez de
    negarles el papel, se les arma una nota de un renglón con el número del
    propio movimiento. La forma del documento es la misma; lo único que cambia
    es que no agrupa.
  */
  const notaDeSalida = useNotaDeSalida()

  const [almacenId, setAlmacenId] = useState('')
  const [rango, setRango] = useState<Rango>(SIN_RANGO)

  /*
    LOS TRES FILTROS QUE FALTABAN, Y NINGUNO HUBO QUE CONSTRUIRLO.

    El usuario los pidió así: «qué material, cuánto, a quién, por quién y en qué
    fecha». La consulta ya sabía filtrar por artículo, por quién lo registró y
    por clase de movimiento desde siempre — la pantalla solo ofrecía almacén y
    fechas. Es el mismo caso del informe de personal de esta mañana: la
    capacidad estaba y no se ofrecía.
  */
  const [articuloId, setArticuloId] = useState('')
  const [clase, setClase] = useState('')
  const [registradoPor, setRegistradoPor] = useState('')
  const [agrupacion, setAgrupacion] = useState('articulo')
  /*
    PLEGADO POR DEFECTO, Y NO POR GUSTO.

    Agrupar por material da HOY 122 filas —medido— y el techo son los 303
    artículos del catálogo. Una tabla de 122 renglones encima de la lista no es
    un resumen: es otra lista, y empuja fuera de la pantalla justo lo que se
    venía a leer.

    Se enseñan los ocho primeros y el resto se pide. Es divulgación progresiva,
    que es la regla que aplica: enseñar lo complejo por partes en vez de
    volcarlo de golpe.

    Por persona son 7 filas y por mes 3, así que ahí el plegado no llega a
    aparecer — el umbral lo decide el contenido, no la agrupación.
  */
  const [expandido, setExpandido] = useState(false)
  const { data: articulos } = useArticulos()

  // Cambiar de agrupación con la tabla desplegada deja al ojo en mitad de otra
  // cosa: se vuelve a plegar, que es donde la vista empieza.
  /** Pulsar una fila del resumen deja el libro filtrado por ella. */
  const aplicarComoFiltro = (por: string, clave: string) => {
    if (por === 'articulo') setArticuloId(clave)
    if (por === 'persona') setRegistradoPor(clave)
    setExpandido(false)
  }

  const cambiarAgrupacion = (v: string) => {
    setAgrupacion(v)
    setExpandido(false)
  }

  const { data, isPending, error } = useMovimientos({
    ...(almacenId ? { almacenId: Number(almacenId) } : {}),
    ...(articuloId ? { articuloId: Number(articuloId) } : {}),
    ...(registradoPor ? { registradoPor } : {}),
    ...(clase ? { tipos: TIPOS_DE_CLASE[clase] } : {}),
    ...(rango.desde ? { desde: rango.desde } : {}),
    ...(rango.hasta ? { hasta: rango.hasta } : {}),
    /*
      Se piden mil y no doscientos porque este libro ahora SUMA. Con
      doscientos, un total de trescientos movimientos saldría corto sin avisar.

      Mil cubre con holgura: el libro crece unos nueve movimientos al día, así
      que son más de dos años. Y si algún día se pasa, se dice — ver el aviso
      debajo del resumen.
    */
    tope: TOPE,
  })

  const [reversando, setReversando] = useState<{ id: number; numero: string } | null>(null)
  // El movimiento entero y no su número: el libro no se edita, así que lo que
  // se abrió no puede quedarse viejo mientras la ventana sigue abierta.
  const [detalle, setDetalle] = useState<Movimiento | null>(null)
  const [motivo, setMotivo] = useState('')
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [tituloDoc, setTituloDoc] = useState('Libro de movimientos')
  const { data: empresa } = useEmpresa()
  const { nombre: yo } = useSesion()

  const nombreDe = (uid: string | null) =>
    (uid && perfiles?.find((p) => p.id === uid)?.nombre) || '—'

  /*
    EL FILTRO, DICHO EN PALABRAS DEBAJO DE LA CIFRA.

    Un resumen que dice «74 movimientos» sin decir de qué es un número sin
    sujeto, y en un libro de inventario eso se copia a un informe y se convierte
    en el total de todo. La misma razón por la que el informe de personal lleva
    su renglón de «filtro aplicado».
  */
  const resumenDelFiltro = [
    clase ? CLASES.find((c) => c.valor === clase)?.etiqueta.toLowerCase() : null,
    articuloId ? `de ${articulos?.find((a) => String(a.id) === articuloId)?.nombre ?? 'un material'}` : null,
    almacenId ? `en ${almacenes?.find((a) => String(a.id) === almacenId)?.nombre ?? 'un almacén'}` : null,
    registradoPor ? `movidos por ${nombreDe(registradoPor)}` : null,
    rango.desde || rango.hasta
      ? `entre ${rango.desde ? fecha(rango.desde) : 'el principio'} y ${rango.hasta ? fecha(rango.hasta) : 'hoy'}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  /*
    EL LIBRO EN PAPEL

    Lo pidió Christopher: poder enterar los movimientos de todo el inventario o
    de un almacén concreto. Sale con lo que se está viendo —si hay un sitio
    elegido, ese— y el filtro va impreso: una lista de treinta renglones que no
    dice que son los de un solo taller se lee como si fueran todos.
  */
  const sitio = (almacenes ?? []).find((a) => String(a.id) === almacenId)

  const imprimirLibro = async () => {
    setTituloDoc('Libro de movimientos')
    // La otra medida, solo en lo que tiene densidad: ver `lib/medidas.ts`.
    const densidades = await densidadesDeArticulos({ ids: (data ?? []).map((m) => m.articulo_id) })
    setPdf(
      await armarLibroDeMovimientos({
        almacen: sitio?.nombre ?? null,
        filtro: null,
        renglones: (data ?? []).map((m) => ({
          numero: m.numero,
          fecha: fechaHora(m.registrado_en),
          tipo: nombreDeMovimiento(m),
          articulo: m.articulo?.nombre ?? '—',
          densidad: densidades.find((a) => a.id === m.articulo_id)?.densidad_ton_m3 ?? null,
          almacen: m.almacen?.nombre ?? '—',
          cantidad: m.cantidad,
          unidad: m.unidad,
          signo: m.signo,
          valorUsd: Number(m.cantidad) * Number(m.costo_usd ?? 0),
          quien: nombreDe(m.registrado_por),
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

  return (
    <>
      <PageHeader
        title="Movimientos"
        description="El libro del inventario. Nada se edita y nada se borra: una corrección se escribe como un movimiento nuevo."
        actions={
          <Button
            variant="outline"
            icon={<Printer />}
            disabled={(data ?? []).length === 0}
            onClick={() => void imprimirLibro()}
          >
            Imprimir el libro
          </Button>
        }
      />

      <Pestanas pestanas={PESTANAS_MATERIAL} />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectBuscable
            label="Almacén"
            vacio="Todos"
            valor={almacenId}
            onCambio={(v) => setAlmacenId(v)}
            opciones={(almacenes ?? []).map((a) => ({ valor: String(a.id), etiqueta: a.nombre }))}
          />
          {/*
            Buscable y no un desplegable: hay 303 artículos, y elegir arena en
            una lista de trescientos es peor que teclear «are».
          */}
          <SelectBuscable
            label="Material"
            vacio="Todos"
            valor={articuloId}
            onCambio={(v) => setArticuloId(v)}
            opciones={(articulos ?? []).map((a) => ({
              valor: String(a.id),
              etiqueta: a.codigo ? `${a.codigo} · ${a.nombre}` : a.nombre,
            }))}
          />
          <Select
            label="Clase"
            vacio="Entradas, salidas y traslados"
            value={clase}
            onChange={(e) => setClase(e.target.value)}
            opciones={CLASES}
          />
          <SelectBuscable
            label="Quién lo movió"
            vacio="Cualquiera"
            valor={registradoPor}
            onCambio={(v) => setRegistradoPor(v)}
            opciones={(perfiles ?? []).map((p) => ({ valor: p.id, etiqueta: p.nombre ?? p.id }))}
          />
        </div>
        <div className="mt-3">
          <RangoDeFechas valor={rango} onCambio={setRango} />
        </div>
      </Card>

      {/*
        EL RESUMEN, QUE ES LO QUE SE PIDIÓ.

        «Si hay 10 salidas de arena, ¿cuánto es el total? ¿Cuántas veces lo movió
        X persona? ¿Cuántas en enero y cuántas en abril?» Son tres preguntas con
        la misma forma —contar y sumar, agrupando por algo distinto— así que se
        resuelven con un selector y no con tres pantallas.

        Va ARRIBA de la lista y no debajo: quien viene a cuadrar quiere el número,
        y el detalle es para cuando el número no cuadra.
      */}
      {data && data.length > 0 ? (
        <Card className="mb-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-ink/85 font-medium">
                <span className="tabular">{data.length}</span> movimiento
                {data.length === 1 ? '' : 's'}
              </p>
              <p className="text-ink/45 text-xs">
                {resumenDelFiltro || 'Todo el libro, sin filtrar'}
              </p>
            </div>
            <Select
              label="Agrupar"
              className="w-56"
              value={agrupacion}
              onChange={(e) => cambiarAgrupacion(e.target.value)}
              opciones={AGRUPACIONES}
            />
          </div>

          {(() => {
            const grupos = agrupar(data, agrupacion, nombreDe)
            const aLaVista = expandido ? grupos : grupos.slice(0, VISIBLES)
            const ocultos = grupos.length - aLaVista.length

            return (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                        <th className="py-2 pr-3 font-medium">
                          {AGRUPACIONES.find((a) => a.valor === agrupacion)?.etiqueta.replace('Por ', '')}
                        </th>
                        {/*
                          La tabla se ordena por movimientos y no por cantidad, y
                          es a propósito: en esta lista conviven sacos, litros y
                          metros cúbicos, así que ordenar por cantidad compararía
                          40 litros con 3 sacos. El número de movimientos no tiene
                          unidad y se puede comparar entre cualquier par de filas.
                        */}
                        <th className="px-3 py-2 text-right font-medium" aria-sort="descending">
                          Movimientos
                        </th>
                        <th className="py-2 pl-3 text-right font-medium">Cantidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aLaVista.map((g) => {
                        /*
                          CADA FILA ES UN FILTRO, y eso es lo que de verdad
                          resuelve las 122.

                          Plegar esconde el problema; poder bajar al detalle lo
                          quita. Pulsar «ARENA» deja el libro entero filtrado por
                          arena, y entonces el resumen pasa a tener una fila y la
                          lista de abajo enseña solo lo suyo. Es más rápido que
                          desplegar y buscar con la vista.
                        */
                        const filtrable = puedeFiltrarse(agrupacion, g.clave)
                        const Fila = filtrable ? 'button' : 'span'
                        return (
                          <tr key={g.clave} className="border-hairline border-b last:border-0">
                            <td className="py-2 pr-3">
                              <Fila
                                {...(filtrable
                                  ? {
                                      type: 'button' as const,
                                      onClick: () => aplicarComoFiltro(agrupacion, g.clave),
                                      title: `Ver solo ${g.etiqueta}`,
                                      className:
                                        'text-ink/85 hover:text-tierra-600 dark:hover:text-tierra-300 text-left underline-offset-4 hover:underline',
                                    }
                                  : { className: 'text-ink/85' })}
                              >
                                {g.etiqueta}
                              </Fila>
                            </td>
                            <td className="text-ink/70 tabular px-3 py-2 text-right">{g.cuantos}</td>
                            <td className="text-ink/85 tabular py-2 pl-3 text-right whitespace-nowrap">
                              {cantidadLegible(g.porUnidad)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/*
                  El botón dice CUÁNTOS faltan y no «ver más»: «ver más» no
                  informa de si son tres o doscientos, y de eso depende que
                  alguien lo pulse o prefiera acotar el filtro.
                */}
                {grupos.length > VISIBLES ? (
                  <button
                    type="button"
                    aria-expanded={expandido}
                    onClick={() => setExpandido((v) => !v)}
                    className="text-tierra-600 dark:text-tierra-300 border-hairline mt-2 w-full rounded-[6px] border border-dashed py-2 text-xs font-medium transition-colors hover:bg-ink/4"
                  >
                    {expandido
                      ? `Ver solo los ${VISIBLES} primeros`
                      : `Ver los otros ${ocultos} ${agrupacion === 'articulo' ? 'materiales' : agrupacion === 'persona' ? 'nombres' : 'meses'}`}
                  </button>
                ) : null}
              </>
            )
          })()}

          {/*
            SI SE LLEGÓ AL TOPE, SE DICE.

            Un total corto y callado es peor que no dar total: quien lo copia a
            un informe no tiene forma de saber que le faltan filas. Con el aviso,
            acota el filtro y vuelve a mirar.
          */}
          {data.length >= TOPE ? (
            <p className="text-warning border-hairline mt-3 border-t pt-3 text-xs">
              Se están contando los <span className="tabular">{TOPE}</span> movimientos más
              recientes, y hay más. Acota el material, la clase o las fechas para que el total sea
              de todo.
            </p>
          ) : null}
        </Card>
      ) : null}

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<ScrollText />}
            titulo={
              rango.desde || rango.hasta || almacenId
                ? 'Nada con esos filtros'
                : 'El libro está en blanco'
            }
            descripcion={
              rango.desde || rango.hasta || almacenId
                ? 'No hubo movimientos en lo que estás mirando. Prueba a ampliar las fechas o a quitar el almacén.'
                : 'La primera línea la escribe la primera recepción de una compra.'
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
                  {/* Con ancho mínimo: cuando las otras columnas traen
                      botones, la tabla encogía ésta hasta partir la fecha en
                      dos renglones y una nota corta en cinco. */}
                  <th className="min-w-60 px-5 py-3 font-medium">Movimiento</th>
                  <th className="px-3 py-3 font-medium">Artículo</th>
                  <th className="px-3 py-3 font-medium">Almacén</th>
                  <th className="px-3 py-3 text-right font-medium">Cantidad</th>
                  <th className="px-3 py-3 text-right font-medium">Valor</th>
                  <th className="px-5 py-3 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {data.map((m) => (
                  <tr key={m.id} className="border-hairline border-b last:border-0 align-top">
                    <td className="px-5 py-3">
                      <p className="text-ink/45 font-mono text-2xs">{m.numero}</p>
                      <p className="text-ink/85 font-medium">
                        {nombreDeMovimiento(m)}
                      </p>
                      <p className="text-ink/45 text-xs">
                        {fechaHora(m.registrado_en)} · {nombreDe(m.registrado_por)}
                        {paraQuienSalio(m, grupos.data)
                          ? ` · para ${paraQuienSalio(m, grupos.data)}`
                          : ''}
                        {puertaEnPalabras(m.hecho_con)
                          ? ` · por ${puertaEnPalabras(m.hecho_con)}`
                          : ''}
                      </p>
                      {m.nota ? (
                        <NotaRecortada
                          texto={m.nota}
                          className="text-ink/55 mt-0.5 max-w-xs text-xs italic"
                          onVerMas={() => setDetalle(m)}
                        />
                      ) : null}
                    </td>

                    <td className="text-ink/75 px-3 py-3">
                      {m.articulo?.nombre ?? '—'}
                      <span className="text-ink/40 block font-mono text-2xs">
                        {m.articulo?.codigo}
                      </span>
                    </td>

                    <td className="text-ink/65 px-3 py-3">{m.almacen?.nombre ?? '—'}</td>

                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <span
                        className={cn(
                          'tabular inline-flex items-center gap-1 font-semibold',
                          m.signo > 0 ? 'text-success' : 'text-danger',
                        )}
                      >
                        {m.signo > 0 ? (
                          <ArrowDownLeft className="size-3.5" />
                        ) : (
                          <ArrowUpRight className="size-3.5" />
                        )}
                        {m.signo > 0 ? '+' : '−'}
                        {m.cantidad}
                      </span>
                      <span className="text-ink/45 ml-1 text-xs">{m.unidad}</span>

                      {/*
                        LO QUE LA PERSONA CONTÓ, DEBAJO DE LO QUE EL SISTEMA OPERA.

                        Quien anotó siete tambores no reconoce «1.466 L» al
                        releerlo dentro de un mes, y entonces no puede cuadrar
                        este renglón contra su hoja de conteo. Las dos cifras
                        juntas son la única forma de que el asiento le hable a
                        quien lo hizo.
                      */}
                      {m.cantidad_capturada ? (
                        <span className="text-ink/45 mt-0.5 block text-2xs">{loQueSeConto(m)}</span>
                      ) : null}
                    </td>

                    {/*
                      NULO NO ES CERO, Y EL LIBRO YA LO DISTINGUE.

                      Christopher, viendo la laptop donada: «este ítem no debe
                      tener precio pues fue una donación». El libro lo tenía
                      bien —entró con el valor en nulo— y era esta celda la que
                      lo enseñaba como «$ 0,00», que es justo lo contrario de lo
                      que dice: cero afirma que no vale nada.

                      Aquí un nulo solo puede significar una cosa. La regla de
                      lectura de esta tabla es por fila y no tapa columnas, así
                      que nadie ve nulos por no tener permiso de ver precios.
                    */}
                    <td className="tabular text-ink/70 px-3 py-3 text-right">
                      {m.valor_usd === null ? (
                        <span className="text-ink/40 text-xs">sin valorar</span>
                      ) : (
                        dolares(m.valor_usd)
                      )}
                    </td>

                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {/*
                        DE QUE COMPRA VINO, y no solo que vino de una.

                        Una orden normal se aprueba antes de comprar; una compra
                        directa se registra con la factura ya en la mano. En la
                        lista se veian igual, y son dos controles distintos: la
                        primera la autorizo alguien antes, la segunda se revisa
                        despues. El numero va en el rotulo para no tener que
                        abrir Compras solo para saber cual era.
                      */}
                      {/*
                        LA MARCA DE QUE SE AVISO Y SE ACEPTO IGUAL.

                        Lo pidio Christopher: que se vea en el historial que ese
                        costo levanto una sospecha y alguien decidio que estaba
                        bien. Dentro de un ano, cuadrando el mes, «x20» al lado
                        de un movimiento dice mas que cualquier auditoria.

                        Lleva el factor y no un simbolo generico porque «se
                        aviso» no dice nada: «x366» distingue una subida real de
                        un cero de mas.
                      */}
                      {m.aviso_costo ? (
                        (() => {
                          /*
                            EL FACTOR SE INVIERTE AQUI, Y CON UN CERO NO SE PUEDE.

                            La base guarda `costo nuevo / promedio viejo`. Hacia
                            arriba es un numero comodo —164,62— y hacia abajo es
                            una fraccion diminuta que hay que invertir para poder
                            leerla. Cuando ese cociente redondea a cero, dividir
                            escribia «÷∞», que es justo el caso mas grave: el que
                            entra doscientas veces mas barato de lo que venia.

                            La base ya guarda seis decimales, asi que el cero solo
                            queda en los movimientos anteriores a ese arreglo. Se
                            protege igual: un chip que dice «∞» no informa de nada.
                          */
                          const f = Number(m.aviso_costo)
                          const veces = f >= 1 ? f : f > 0 ? 1 / f : null
                          const cifra =
                            veces === null
                              ? 'muchísimas'
                              : veces.toLocaleString('es-VE', { maximumFractionDigits: 2 })
                          return (
                            <Chip
                              tone="warning"
                              className="mr-2"
                              title={`El costo se salió ${cifra} veces de lo que venía costando. Se avisó y se guardó igual.`}
                            >
                              {f >= 1 ? `×${cifra}` : `÷${cifra}`}
                            </Chip>
                          )
                        })()
                      ) : null}

                      {m.orden_id ? (
                        <Chip tone={m.orden?.solicitud?.directa ? 'warning' : 'royal'} className="mr-2">
                          <Link to="/app/compras">
                            {m.orden?.solicitud?.directa ? 'Compra directa' : 'Compra'}
                            {m.orden?.numero ? ` ${m.orden.numero}` : ''}
                          </Link>
                        </Chip>
                      ) : null}
                      {/* Solo en las salidas: una entrada no tiene nota de
                          salida, y ofrecerla ahí sería un botón que miente.

                          Y la pata negativa de una corrección de costo tampoco
                          es una salida: no se llevó nadie nada, el material
                          sigue en el estante. Armarle una nota de entrega sería
                          fabricar el papel de un despacho que no ocurrió.

                          La salida de un traslado saca su nota de traslado, no
                          una de salida: la de salida no decía a dónde iba el
                          material ni tenía dónde firmar quien lo recibe. */}
                      {m.signo < 0 && m.tipo !== 'REVERSO' && m.tipo !== 'AJUSTE_COSTO' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<FileText />}
                          disabled={notaDeSalida.armando === m.id || notaDeTraslado.armando === m.id}
                          onClick={() =>
                            void (m.tipo === 'TRANSFERENCIA_SALIDA'
                              ? notaDeTraslado.abrir(m.id)
                              : notaDeSalida.abrirMovimiento(m))
                          }
                        >
                          {notaDeSalida.armando === m.id || notaDeTraslado.armando === m.id
                            ? 'Armando…'
                            : 'Nota'}
                        </Button>
                      ) : null}

                      {/* Una corrección de costo no se deshace: se vuelve a
                          corregir, y la base lo dice igual. Las dos patas están
                          enlazadas pero `reversar_movimiento` solo sabe
                          emparejar traslados, así que este botón habría
                          reversado media corrección y dejado el promedio peor
                          que antes de corregirlo. */}
                      {puede('ALMACEN') && m.tipo !== 'REVERSO' && m.tipo !== 'AJUSTE_COSTO' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Undo2 />}
                          onClick={() => {
                            setMotivo('')
                            setReversando({ id: m.id, numero: m.numero })
                          }}
                        >
                          Deshacer
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {reversando ? (
        <Modal
          abierto
          onCerrar={() => setReversando(null)}
          titulo="Deshacer el movimiento"
          descripcion={`Se escribe el movimiento contrario a ${reversando.numero}. El original se queda en el libro.`}
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setReversando(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={motivo.trim().length < 4 || reversar.isPending}
                onClick={async () => {
                  await reversar.mutateAsync({ id: reversando.id, motivo })
                  setReversando(null)
                }}
              >
                {reversar.isPending ? 'Guardando…' : 'Deshacer'}
              </Button>
            </>
          }
        >
          <Textarea
            label="Por qué se deshace"
            rows={3}
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          {reversar.error ? <ErrorDeCarga error={reversar.error} className="mt-3" /> : null}
        </Modal>
      ) : null}

      {detalle ? (
        <DetalleDelMovimiento
          m={detalle}
          quien={nombreDe(detalle.registrado_por)}
          onCerrar={() => setDetalle(null)}
        />
      ) : null}

      {notaDeTraslado.visor}

      {notaDeSalida.visor}

      <Visor
        abierto={pdf !== null}
        onCerrar={() => setPdf(null)}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ''}
        titulo={tituloDoc}
      />
    </>
  )
}

/**
 * La nota entera y los datos del movimiento, sin salir del libro.
 *
 * La fila corta la nota en dos líneas; esto la enseña completa, con lo que
 * hace falta al lado para entenderla —qué artículo, en qué almacén, cuánto y a
 * qué costo—, para no tener que volver a la tabla a buscar de qué hablaba.
 *
 * Solo se lee. Deshacer y sacar la nota de salida siguen en la fila, que es
 * donde se deciden: repetirlos aquí haría dos sitios para lo mismo.
 */
function DetalleDelMovimiento({
  m,
  quien,
  onCerrar,
}: {
  m: Movimiento
  quien: string
  onCerrar: () => void
}) {
  const grupos = useGruposDeSalida()
  const contado = loQueSeConto(m)
  const datos: [string, string][] = [
    [
      'Artículo',
      m.articulo ? `${m.articulo.nombre}${m.articulo.codigo ? ` · ${m.articulo.codigo}` : ''}` : '—',
    ],
    ['Almacén', m.almacen?.nombre ?? '—'],
    ['Cantidad', `${m.signo > 0 ? '+' : '−'}${m.cantidad} ${m.unidad}${contado ? ` (${contado})` : ''}`],
    // El día en que pasó, que puede no ser el día en que se escribió: ése va arriba.
    ['Día del movimiento', fecha(m.fecha)],
    ['Costo por unidad', m.costo_usd === null ? 'sin valorar' : dolares(m.costo_usd)],
    ['Valor', m.valor_usd === null ? 'sin valorar' : dolares(m.valor_usd)],
  ]
  if (m.orden?.numero) {
    datos.push([m.orden.solicitud?.directa ? 'Compra directa' : 'Compra', m.orden.numero])
  }
  if (m.nota_salida) datos.push(['Nota de salida', m.nota_salida])

  /*
    LO QUE EL MOVIMIENTO GUARDA Y EL DETALLE NO DECÍA.

    Christopher: «necesitamos todo explícito en el movimiento o detalle». Una
    salida no decía por qué salió —la razón no se guardaba, y la causa de las
    viejas vivía en otra tabla—, ni de quién era lo que salió, ni en qué moneda
    se tecleó el costo. El motivo sale de `motivoDeSalida`, el mismo que usan la
    fila, el papel y la auditoría.
  */
  const motivoGuardado = motivoDeSalida(m)
  if (motivoGuardado) datos.push(['Motivo', motivoGuardado])
  const paraQuien = paraQuienSalio(m, grupos.data)
  if (paraQuien) datos.push(['Para quién', paraQuien])
  const destino = bajaDe(m)?.destino
  if (destino) datos.push(['Destino', destino])
  if (m.propietario) datos.push(['Dueño', m.propietario])
  if (m.costo_capturado && m.moneda_capturada) {
    datos.push([
      'Costo tecleado',
      `${Number(m.costo_capturado).toLocaleString('es-VE', { maximumFractionDigits: 4 })} ${m.moneda_capturada}`,
    ])
  }
  // Por dónde pasó: distingue una entrada de planilla de una tecleada a mano,
  // que hasta el 16/09/2026 eran indistinguibles en el libro.
  const puerta = puertaEnPalabras(m.hecho_con)
  if (puerta) datos.push(['Hecho con', puerta])
  datos.push(['Registró', quien])

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={nombreDeMovimiento(m)}
      descripcion={`${m.numero} · ${fechaHora(m.registrado_en)} · ${quien}`}
      acciones={
        <Button variant="ghost" onClick={onCerrar}>
          Cerrar
        </Button>
      }
    >
      <p className="text-ink/45 text-xs">Nota</p>
      <p className="text-ink/85 mt-1 text-sm leading-relaxed break-words whitespace-pre-line">
        {m.nota}
      </p>

      <dl className="border-hairline mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 text-sm">
        {datos.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-ink/45 text-xs">{k}</dt>
            <dd className="tabular text-ink/80 break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  )
}
