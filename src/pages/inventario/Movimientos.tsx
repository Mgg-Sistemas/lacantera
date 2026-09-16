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
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Modal } from '@/components/ui/Modal'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { densidadesDeArticulos, useMisRoles, usePerfiles } from '@/lib/api/catalogo'
import {
  bajaDe,
  motivoDeSalida,
  motivoParaLaNota,
  nombreDeMovimiento,
  paraQuienSalio,
  puertaEnPalabras,
  useAlmacenes,
  useGruposDeSalida,
  useMovimientos,
  useReversarMovimiento,
} from '@/lib/api/inventario'
import type { Movimiento } from '@/lib/api/inventario'
import { leerNotaDeSalida } from '@/lib/api/inventario'
import { armarNotaDeSalida } from '@/lib/ficha/notaDeSalidaPdf'
import type { DatosNotaDeSalida } from '@/lib/ficha/notaDeSalidaPdf'
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
  const [armando, setArmando] = useState<number | null>(null)

  const verLaNota = async (m: Movimiento) => {
    setArmando(m.id)
    try {
      // Con número de nota se trae la nota entera; sin él, este renglón solo.
      const lineas = m.nota_salida ? await leerNotaDeSalida(m.nota_salida) : null

      /*
        La densidad, para la columna «Conversión». Esta nota se arma aquí y no en
        `useNotaDeSalida`, así que tiene que pedirla ella: la primera vez se pidió
        solo allá, y NS-2026-0009 abierta desde este libro seguía saliendo sin la
        columna.
      */
      const densidades = await densidadesDeArticulos({
        codigos: lineas && lineas.length > 0 ? lineas.map((l) => l.articulo_codigo) : [m.articulo?.codigo ?? ''],
      })
      const densidadDe = (codigo: string) =>
        densidades.find((a) => a.codigo === codigo)?.densidad_ton_m3 ?? null

      setTituloDoc(`Nota de salida ${m.nota_salida ?? m.numero}`)

      const datos: DatosNotaDeSalida = {
          conCostos: notaConCostos,
          numero: m.nota_salida ?? m.numero,
          fecha: fecha(m.fecha),
          almacen: m.almacen?.nombre ?? '',
          clase: motivoParaLaNota(m),
          paraQuien: paraQuienSalio(m, grupos.data),
          motivo: m.nota,
          renglones:
            lineas && lineas.length > 0
              ? lineas.map((l) => ({
                  articuloCodigo: l.articulo_codigo,
                  articulo: l.articulo,
                  cantidad: l.cantidad,
                  unidad: l.unidad,
                  costoUnitarioUsd: l.costo_usd,
                  valorUsd: l.valor_usd,
                  densidad: densidadDe(l.articulo_codigo),
                  // Una nota puede llevar material de varios sitios: el papel
                  // se parte en un bloque por almacén y necesita saberlo.
                  almacen: l.almacen,
                }))
              : [
                  {
                    articuloCodigo: m.articulo?.codigo ?? '',
                    articulo: m.articulo?.nombre ?? '',
                    cantidad: m.cantidad,
                    unidad: m.unidad,
                    costoUnitarioUsd: m.costo_usd,
                    valorUsd: m.valor_usd,
                    densidad: densidadDe(m.articulo?.codigo ?? ''),
                  },
                ],
          empresa: {
            razonSocial: empresa?.razon_social ?? '',
            rif: empresa?.rif ?? '',
          },
          momento: new Date(),
      }

      setDatosNota(datos)
      setPdf(await armarNotaDeSalida(datos))
    } finally {
      setArmando(null)
    }
  }

  const [almacenId, setAlmacenId] = useState('')
  const [rango, setRango] = useState<Rango>(SIN_RANGO)
  const { data, isPending, error } = useMovimientos({
    ...(almacenId ? { almacenId: Number(almacenId) } : {}),
    ...(rango.desde ? { desde: rango.desde } : {}),
    ...(rango.hasta ? { hasta: rango.hasta } : {}),
  })

  const [reversando, setReversando] = useState<{ id: number; numero: string } | null>(null)
  // El movimiento entero y no su número: el libro no se edita, así que lo que
  // se abrió no puede quedarse viejo mientras la ventana sigue abierta.
  const [detalle, setDetalle] = useState<Movimiento | null>(null)
  const [motivo, setMotivo] = useState('')
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  /*
    LOS DATOS DE LA NOTA, PARA PODER REHACERLA.

    Esta pantalla enseña dos papeles con el mismo visor: el libro de movimientos
    y la nota de salida. La casilla de «incluir costos» es solo de la nota, así
    que colgar de esto es lo que la hace aparecer únicamente cuando toca.

    Y hacen falta los datos, no solo el blob: marcar la casilla rehace el papel
    sin cerrar el visor, y sin ellos habría que volver a consultar la base.
  */
  const [datosNota, setDatosNota] = useState<DatosNotaDeSalida | null>(null)
  // Por defecto sin cifras: la nota es lo que firma quien recibe el material.
  const [notaConCostos, setNotaConCostos] = useState(false)
  const [rehaciendoNota, setRehaciendoNota] = useState(false)
  const [tituloDoc, setTituloDoc] = useState('Libro de movimientos')
  const { data: empresa } = useEmpresa()
  const { nombre: yo } = useSesion()

  const nombreDe = (uid: string | null) =>
    (uid && perfiles?.find((p) => p.id === uid)?.nombre) || '—'

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
    // El libro no lleva casilla: es un informe interno y siempre va con cifras.
    setDatosNota(null)
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
        <div className="grid gap-3 lg:grid-cols-[minmax(0,16rem)_1fr]">
          <SelectBuscable
            label="Almacén"
            vacio="Todos"
            valor={almacenId}
            onCambio={(v) => setAlmacenId(v)}
            opciones={(almacenes ?? []).map((a) => ({ valor: String(a.id), etiqueta: a.nombre }))}
          />
          <RangoDeFechas valor={rango} onCambio={setRango} />
        </div>
      </Card>

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
                          disabled={armando === m.id || notaDeTraslado.armando === m.id}
                          onClick={() =>
                            void (m.tipo === 'TRANSFERENCIA_SALIDA'
                              ? notaDeTraslado.abrir(m.id)
                              : verLaNota(m))
                          }
                        >
                          {armando === m.id || notaDeTraslado.armando === m.id ? 'Armando…' : 'Nota'}
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

      <Visor
        abierto={pdf !== null}
        onCerrar={() => {
          setPdf(null)
          setDatosNota(null)
        }}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ''}
        titulo={tituloDoc}
        casilla={
          datosNota
            ? {
                etiqueta: 'Incluir costos',
                marcada: notaConCostos,
                rehaciendo: rehaciendoNota,
                onCambiar: async (marcada) => {
                  setNotaConCostos(marcada)
                  setRehaciendoNota(true)
                  try {
                    setPdf(await armarNotaDeSalida({ ...datosNota, conCostos: marcada }))
                  } finally {
                    setRehaciendoNota(false)
                  }
                },
              }
            : null
        }
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
