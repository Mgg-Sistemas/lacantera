import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { PackageMinus } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_SALIDAS } from '@/components/pestanasDeModulos'
import { RangoDeFechas } from '@/components/RangoDeFechas'
import { SIN_RANGO } from '@/components/rango'
import type { Rango } from '@/components/rango'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useArticulos, usePerfiles } from '@/lib/api/catalogo'
import {
  grupoEnCorto,
  nombreDeMovimiento,
  paraQuienSalio,
  puertaEnPalabras,
  useAlmacenes,
  useGruposDeSalida,
  useMovimientos,
} from '@/lib/api/inventario'
import { fechaHora } from '@/lib/formato'

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

  No repite el papel: la nota de salida se imprime desde el libro, que es donde
  vive el visor. Cuando el formulario de sacar se mude aquí, se muda con él.
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

export function Salidas() {
  const [vista, setVista] = useState('TODO')
  const [almacenId, setAlmacenId] = useState('')
  const [articuloId, setArticuloId] = useState('')
  const [quien, setQuien] = useState('')
  const [grupoId, setGrupoId] = useState('')
  const [rango, setRango] = useState<Rango>(SIN_RANGO)

  const { data: almacenes } = useAlmacenes()
  const { data: articulos } = useArticulos()
  const { data: perfiles } = usePerfiles()
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

  const hayFiltros = Boolean(almacenId || articuloId || quien || grupoId || rango.desde || rango.hasta)

  return (
    <>
      <PageHeader
        title="Salidas y traslados"
        description="Lo que se entregó y lo que se movió entre almacenes. Para registrar una salida, se hace desde Existencias."
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

      {/* El papel y el detalle viven en el libro, que es una sola pantalla y no
          dos que se copian. Desde aquí se llega con un clic. */}
      <p className="text-ink/40 mt-4 text-xs">
        ¿Hace falta el detalle de un movimiento o reimprimir su nota?{' '}
        <Link className="underline underline-offset-2" to="/app/inventario/movimientos">
          Está en el libro de movimientos
        </Link>
        .
      </p>
    </>
  )
}
