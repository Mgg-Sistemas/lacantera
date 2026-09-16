import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { PackageMinus } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_SALIDAS } from '@/components/pestanasDeModulos'
import { RangoDeFechas } from '@/components/RangoDeFechas'
import { SIN_RANGO } from '@/components/rango'
import type { Rango } from '@/components/rango'
import { Visor } from '@/components/Visor'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { Modal } from '@/components/ui/Modal'
import { useArticulos, usePerfiles } from '@/lib/api/catalogo'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useEmpresa } from '@/lib/api/empresa'
import {
  grupoEnCorto,
  leerCabeceraDeNota,
  leerNotaDeSalida,
  nombreDeMovimiento,
  paraQuienSalio,
  puertaEnPalabras,
  useAlmacenes,
  useGruposDeSalida,
  useMovimientos,
} from '@/lib/api/inventario'
import { ModalSalida } from './ModalSalida'
import { armarNotaDeSalida } from '@/lib/ficha/notaDeSalidaPdf'
import type { DatosNotaDeSalida } from '@/lib/ficha/notaDeSalidaPdf'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { fecha, fechaHora } from '@/lib/formato'

/*
  LO QUE SALIÓ Y LO QUE SE MOVIÓ, EN UNA SOLA PANTALLA

  Christopher, 16/09/2026: «nos solicitan querer ver las salidas y los traslados
  en una misma pantalla… además de poder responder a preguntas tales como:
  ¿cuántos X ítems ha dado salida o enviado X almacenista para X unidad en N
  rango de tiempo?».

  Las dos cosas ya estaban en el libro de movimientos, pero mezcladas con las
  entradas, los ajustes y los reversos, y sin forma de cruzarlas con el
  artículo, con quien las registró ni con el grupo que las recibió. El libro
  contesta «qué pasó en el almacén»; esta pantalla contesta «qué se entregó, a
  quién y cuánto», que es otra pregunta y la hace otra gente.

  Y aquí se saca el material, que es lo primero que preguntó al verla: «¿dónde
  puedo realizar una salida?». El formulario es `ModalSalida` y vive en este
  módulo; Existencias se quedó con enseñar lo que hay.
*/

interface Vista {
  etiqueta: string
  tipos: string[]
}

const SALIDAS = ['SALIDA_CONSUMO', 'SALIDA_MERMA', 'SALIDA_BAJA', 'SALIDA_DESPACHO']
const TRASLADOS = ['TRANSFERENCIA_SALIDA', 'TRANSFERENCIA_ENTRADA']

const VISTAS: Record<string, Vista> = {
  TODO: { etiqueta: 'Salidas y traslados', tipos: [...SALIDAS, ...TRASLADOS] },
  SALIDAS: { etiqueta: 'Solo salidas', tipos: SALIDAS },
  TRASLADOS: { etiqueta: 'Solo traslados', tipos: TRASLADOS },
}

const numeroLegible = (v: string | number): string =>
  Number(v).toLocaleString('es-VE', { maximumFractionDigits: 2 })

/**
 * «7 TAMBOR y 10 L», o nada cuando se contó en la unidad de operación.
 *
 * Se arma aquí y no en el PDF porque el PDF no tiene por qué saber cómo se
 * llama cada columna de la base: recibe una frase y la imprime.
 */
function contadoLegible(l: {
  cantidad_capturada: string | null
  unidad_capturada: string | null
  suelto_capturado: string | null
  unidad: string
}): string | null {
  if (!l.cantidad_capturada || !l.unidad_capturada) return null
  const bultos = `${numeroLegible(l.cantidad_capturada)} ${l.unidad_capturada}`
  return Number(l.suelto_capturado)
    ? `${bultos} y ${numeroLegible(l.suelto_capturado ?? 0)} ${l.unidad}`
    : bultos
}

export function Salidas() {
  const [vista, setVista] = useState('TODO')
  const [almacenId, setAlmacenId] = useState('')
  const [articuloId, setArticuloId] = useState('')
  const [quien, setQuien] = useState('')
  const [grupoId, setGrupoId] = useState('')
  const [rango, setRango] = useState<Rango>(SIN_RANGO)

  const { puede: alcanza } = useMisPermisos()
  const { data: almacenes } = useAlmacenes()
  const { data: articulos } = useArticulos()
  const { data: perfiles } = usePerfiles()
  const { data: empresa } = useEmpresa()
  const grupos = useGruposDeSalida()

  const { data, isPending, error } = useMovimientos({
    tipos: (VISTAS[vista] ?? VISTAS.TODO).tipos,
    ...(almacenId ? { almacenId: Number(almacenId) } : {}),
    ...(articuloId ? { articuloId: Number(articuloId) } : {}),
    ...(quien ? { registradoPor: quien } : {}),
    ...(grupoId ? { grupoId: Number(grupoId) } : {}),
    ...(rango.desde ? { desde: rango.desde } : {}),
    ...(rango.hasta ? { hasta: rango.hasta } : {}),
  })

  /*
    SACAR MATERIAL DESDE AQUÍ, Y TAMBIÉN DESDE UNA FILA DE EXISTENCIAS.

    Existencias enseña lo que hay y manda aquí con el artículo y el sitio en la
    dirección; el formulario se abre con el primer renglón puesto. La marca se
    borra de la dirección en cuanto se usa: recargar no vuelve a abrirlo.
  */
  const [parametros, setParametros] = useSearchParams()
  const [sacando, setSacando] = useState(false)
  const [desdeFila, setDesdeFila] = useState<{ articulo?: string; almacen?: string }>({})

  useEffect(() => {
    if (!parametros.has('sacar')) return
    setDesdeFila({
      articulo: parametros.get('articulo') ?? undefined,
      almacen: parametros.get('almacen') ?? undefined,
    })
    setSacando(true)
    setParametros(new URLSearchParams(), { replace: true })
  }, [parametros, setParametros])

  const [nota, setNota] = useState<ArchivoArmado | null>(null)
  const [datosNota, setDatosNota] = useState<DatosNotaDeSalida | null>(null)
  // Por defecto sin cifras: la nota es lo que firma quien recibe el material.
  const [notaConCostos, setNotaConCostos] = useState(false)
  const [rehaciendoNota, setRehaciendoNota] = useState(false)
  const [falloElPapel, setFalloElPapel] = useState<string | null>(null)

  /*
    La nota entera, releída de la base por su número.

    No se arma con lo que hay en el formulario: el costo promedio y el valor de
    cada renglón los calcula la base al mover, y son justo las cifras que quedan
    en el papel que alguien firma. Un papel con cifras del navegador y un libro
    con otras es exactamente el problema que la nota venía a resolver.
  */
  const armarLaNota = async (numero: string, motivo: string) => {
    const [lineas, cabecera] = await Promise.all([
      leerNotaDeSalida(numero),
      leerCabeceraDeNota(numero),
    ])
    if (lineas.length === 0) return

    const datos: DatosNotaDeSalida = {
      conCostos: notaConCostos,
      numero,
      fecha: fecha(lineas[0].fecha),
      almacen: lineas[0].almacen,
      clase: cabecera.motivo,
      paraQuien: paraQuienSalio(cabecera.para, grupos.data),
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
    }
    setDatosNota(datos)
    setNota(await armarNotaDeSalida(datos))
  }

  const nombreDe = (uid: string | null) =>
    (uid && perfiles?.find((p) => p.id === uid)?.nombre) || '—'

  /*
    EL TOTAL, SOLO CON UN ARTÍCULO ELEGIDO.

    Sumar cantidades de artículos distintos es sumar litros con pares de botas:
    el número saldría y no querría decir nada. Con un artículo elegido, la suma
    ES la respuesta —«cuántas mascarillas»—, y por eso aparece justo entonces.
  */
  const resumen = useMemo(() => {
    const filas = data ?? []
    if (filas.length === 0) return null

    const cuantos = `${filas.length} movimiento${filas.length === 1 ? '' : 's'}`
    if (!articuloId) return cuantos

    const unidad = filas[0]?.unidad ?? ''
    const salieron = filas
      .filter((m) => m.signo < 0)
      .reduce((total, m) => total + Number(m.cantidad), 0)
    const entraron = filas
      .filter((m) => m.signo > 0)
      .reduce((total, m) => total + Number(m.cantidad), 0)

    return [
      cuantos,
      salieron ? `${numeroLegible(salieron)} ${unidad} salieron` : null,
      entraron ? `${numeroLegible(entraron)} ${unidad} entraron` : null,
    ]
      .filter(Boolean)
      .join(' · ')
  }, [data, articuloId])

  const hayFiltros = Boolean(
    almacenId || articuloId || quien || grupoId || rango.desde || rango.hasta,
  )

  return (
    <>
      <PageHeader
        title="Salidas y traslados"
        description="Lo que se entregó y lo que se movió entre almacenes."
        actions={
          alcanza('SALIDAS', 'ESCRITURA') ? (
            <Button icon={<PackageMinus />} onClick={() => setSacando(true)}>
              Registrar salida
            </Button>
          ) : null
        }
      />

      <Pestanas pestanas={PESTANAS_SALIDAS} />

      <Card className="mb-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,14rem)_1fr]">
          <Select
            label="Qué mirar"
            value={vista}
            onChange={(e) => setVista(e.target.value)}
            opciones={Object.entries(VISTAS).map(([clave, v]) => ({
              valor: clave,
              etiqueta: v.etiqueta,
            }))}
          />
          <RangoDeFechas valor={rango} onCambio={setRango} />
        </div>

        {/*
          LAS TRES PREGUNTAS QUE SE HACEN JUNTAS.

          «¿Cuántas mascarillas se le han dado al personal de cribado?» es
          artículo + para quién + fechas. «¿En agosto el almacenista X dio algún
          insumo a los operadores?» es quién + para quién + fechas. Por eso van
          en la misma fila y no repartidas por la pantalla.
        */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectBuscable
            label="Artículo"
            vacio="Todos"
            valor={articuloId}
            onCambio={(v) => setArticuloId(v)}
            opciones={(articulos ?? []).map((a) => ({
              valor: String(a.id),
              etiqueta: `${a.codigo} · ${a.nombre}`,
            }))}
          />
          <SelectBuscable
            label="Almacén"
            vacio="Todos"
            valor={almacenId}
            onCambio={(v) => setAlmacenId(v)}
            opciones={(almacenes ?? []).map((a) => ({ valor: String(a.id), etiqueta: a.nombre }))}
          />
          <SelectBuscable
            label="Quién lo registró"
            vacio="Todos"
            valor={quien}
            onCambio={(v) => setQuien(v)}
            opciones={(perfiles ?? []).map((p) => ({
              valor: p.id,
              etiqueta: p.nombre ?? p.usuario,
            }))}
          />
          <SelectBuscable
            label="Para quién salió"
            vacio="Todos"
            valor={grupoId}
            onCambio={(v) => setGrupoId(v)}
            opciones={(grupos.data ?? []).map((g) => ({
              valor: String(g.id),
              etiqueta: grupoEnCorto(g),
            }))}
          />
        </div>

        {resumen ? (
          <p className="text-ink/50 mt-3 text-xs">
            {resumen}
            {(data ?? []).length === 200
              ? ' · el libro trae los 200 más recientes: acota las fechas para ver más atrás'
              : ''}
          </p>
        ) : null}
      </Card>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<PackageMinus />}
            titulo={hayFiltros ? 'Nada con esos filtros' : 'Todavía no ha salido nada'}
            descripcion={
              hayFiltros
                ? 'Prueba a ampliar las fechas, o a quitar el artículo o el grupo.'
                : 'La primera línea la escribe la primera salida de material.'
            }
          />
        </Card>
      ) : null}

      {data && data.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="min-w-60 px-5 py-3 font-medium">Movimiento</th>
                  <th className="px-3 py-3 font-medium">Artículo</th>
                  <th className="px-3 py-3 font-medium">Almacén</th>
                  <th className="px-3 py-3 font-medium">Para quién</th>
                  <th className="px-3 py-3 text-right font-medium">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {data.map((m) => (
                  <tr key={m.id} className="border-hairline border-b align-top last:border-0">
                    <td className="px-5 py-3">
                      <p className="text-ink/45 font-mono text-2xs">{m.numero}</p>
                      <p className="text-ink/85 font-medium">{nombreDeMovimiento(m)}</p>
                      <p className="text-ink/45 text-xs">
                        {fechaHora(m.registrado_en)} · {nombreDe(m.registrado_por)}
                        {puertaEnPalabras(m.hecho_con)
                          ? ` · por ${puertaEnPalabras(m.hecho_con)}`
                          : ''}
                      </p>
                      {/* Recortada a dos renglones y sin «ver más»: el relato
                          entero se lee en el detalle del libro, que es donde
                          está el resto del movimiento. */}
                      {m.nota ? (
                        <p className="text-ink/55 mt-0.5 line-clamp-2 max-w-xs text-xs italic">
                          {m.nota}
                        </p>
                      ) : null}
                    </td>

                    <td className="text-ink/75 px-3 py-3">{m.articulo?.nombre ?? '—'}</td>
                    <td className="text-ink/65 px-3 py-3">{m.almacen?.nombre ?? '—'}</td>
                    <td className="text-ink/65 px-3 py-3">
                      {paraQuienSalio(m, grupos.data) ?? '—'}
                    </td>
                    <td className="tabular text-ink/85 px-3 py-3 text-right whitespace-nowrap">
                      {m.signo > 0 ? '+' : '−'}
                      {numeroLegible(m.cantidad)} {m.unidad}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* El detalle de un movimiento y la reimpresión de su nota viven en el
          libro, que es una sola pantalla y no dos que se copian. */}
      <p className="text-ink/40 mt-4 text-xs">
        ¿Hace falta el detalle de un movimiento o reimprimir su nota?{' '}
        <Link className="underline underline-offset-2" to="/app/inventario/movimientos">
          Está en el libro de movimientos
        </Link>
        .
      </p>

      <ModalSalida
        abierto={sacando}
        articuloInicial={desdeFila.articulo}
        almacenInicial={desdeFila.almacen}
        onCerrar={() => {
          setSacando(false)
          setDesdeFila({})
        }}
        onRegistrada={(numero, motivo) => {
          /*
            El modal se cierra AQUÍ, antes de armar el papel.

            Armarlo tarda: dos viajes de red y la descarga del trozo de jsPDF la
            primera vez. Durante esa espera el botón vuelve a dejarse pulsar, y
            el segundo toque registra una SEGUNDA salida completa, con su propio
            número de nota, sin que nadie se entere.
          */
          setSacando(false)
          setDesdeFila({})
          void armarLaNota(numero, motivo).catch((e: unknown) => {
            // Y si el papel no se puede armar, la salida sigue estando bien
            // hecha: se reimprime desde Movimientos.
            setFalloElPapel(
              `La salida ${numero} quedó registrada, pero no se pudo armar el papel. Búscala en Movimientos y pulsa «Nota».`,
            )
            console.error(e)
          })
        }}
      />

      <Visor
        abierto={nota !== null}
        onCerrar={() => {
          setNota(null)
          setDatosNota(null)
        }}
        blob={nota?.blob ?? null}
        nombreArchivo={nota?.nombre ?? 'nota-salida.pdf'}
        titulo="Nota de salida"
        descripcion="Compruébala antes de imprimirla: es lo que va a firmar quien recibe el material."
        casilla={
          datosNota
            ? {
                etiqueta: 'Incluir costos',
                marcada: notaConCostos,
                rehaciendo: rehaciendoNota,
                onCambiar: async (marcada: boolean) => {
                  setNotaConCostos(marcada)
                  setRehaciendoNota(true)
                  try {
                    setNota(await armarNotaDeSalida({ ...datosNota, conCostos: marcada }))
                  } finally {
                    setRehaciendoNota(false)
                  }
                },
              }
            : undefined
        }
      />

      {falloElPapel ? (
        <Modal
          abierto
          onCerrar={() => setFalloElPapel(null)}
          titulo="La salida quedó registrada"
          ancho="sm"
          acciones={<Button onClick={() => setFalloElPapel(null)}>Entendido</Button>}
        >
          <p className="text-ink/70 text-sm leading-relaxed">{falloElPapel}</p>
        </Modal>
      ) : null}
    </>
  )
}
