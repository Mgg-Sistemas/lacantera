import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Archive, Search } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { RangoDeFechas } from '@/components/RangoDeFechas'
import { SIN_RANGO } from '@/components/rango'
import type { Rango } from '@/components/rango'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { COLUMNAS, useHistoricoCompras } from '@/lib/api/compras'
import type { Columna } from '@/lib/api/compras'
import { dinero, fecha } from '@/lib/formato'

/*
  EL HISTÓRICO DE COMPRAS

  Angélica, 06/11/2026: «todo lo que está en el módulo de compras, lo coloques
  en un botón que diga histórico de compras, donde vas a colocar todo lo que
  está en compras COMO FINALIZÓ, sin sumar stock en los inventarios. Esto con
  el fin de dejar el módulo vacío para el nuevo flujo».

  Todas se leen FINALIZADA, que es lo que se decidió. Pero al lado va la etapa
  en la que estaba cada una cuando se cerró, porque no es lo mismo una compra
  que llegó entera que una pagada cuyo material nunca entró al almacén. Esconder
  eso sería decir que llegó lo que no llegó.

  Nada de aquí se mueve: la base frena cualquier recepción, pago o cambio de
  estado de una compra del histórico (`trg_historico_no_se_mueve`).
*/

/** Cómo se llama la etapa en la que quedó, con el mismo nombre que tenía en el tablero. */
function etapa(columna: Columna | null): string {
  if (!columna) return '—'
  return COLUMNAS.find((c) => c.clave === columna)?.titulo ?? columna
}

/** El tono de la etapa: lo que llegó en verde; lo que quedó a medias, en ámbar. */
function tonoDeEtapa(columna: Columna | null): 'success' | 'warning' | 'neutral' | 'danger' {
  if (columna === 'RECIBIDA') return 'success'
  if (columna === 'CANCELADA') return 'neutral'
  if (columna === 'DESISTIO') return 'danger'
  return 'warning'
}

export function HistoricoCompras() {
  const { data, isPending, error } = useHistoricoCompras()
  const [texto, setTexto] = useState('')
  const [columna, setColumna] = useState('')
  const [rango, setRango] = useState<Rango>(SIN_RANGO)

  const filtradas = useMemo(() => {
    const buscado = texto.trim().toLowerCase()
    return (data ?? []).filter((t) => {
      if (columna && t.historico_columna !== columna) return false
      const dia = t.creada_en.slice(0, 10)
      if (rango.desde && dia < rango.desde) return false
      if (rango.hasta && dia > rango.hasta) return false
      if (buscado) {
        const donde = [t.numero, t.orden_numero, t.titulo, t.proveedor, t.solicitante, t.destino]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!donde.includes(buscado)) return false
      }
      return true
    })
  }, [data, texto, columna, rango])

  /* Solo las etapas QUE HAY, con cuántas tiene cada una. */
  const etapasPresentes = useMemo(() => {
    const vistas = new Map<string, number>()
    for (const t of data ?? []) {
      const c = t.historico_columna ?? ''
      vistas.set(c, (vistas.get(c) ?? 0) + 1)
    }
    return COLUMNAS.filter((c) => vistas.has(c.clave)).map((c) => ({
      valor: c.clave,
      etiqueta: `${c.titulo} (${vistas.get(c.clave)})`,
    }))
  }, [data])

  const totalUsd = filtradas.reduce((s, t) => s + Number(t.total_usd ?? 0), 0)
  const hayFiltro = Boolean(texto.trim() || columna || rango.desde || rango.hasta)

  return (
    <>
      <PageHeader
        title="Histórico de compras"
        description="Las compras que había antes del flujo nuevo. Todas quedaron cerradas como finalizadas, sin mover inventario."
        actions={
          <Link to="/app/compras">
            <Button variant="outline" icon={<ArrowLeft />}>
              Tablero
            </Button>
          </Link>
        }
      />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_1fr]">
          <Input
            label="Buscar"
            icon={<Search />}
            placeholder="Número, orden, proveedor, quién pidió…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <Select
            label="Etapa en la que quedó"
            vacio="Todas"
            value={columna}
            onChange={(e) => setColumna(e.target.value)}
            opciones={etapasPresentes}
          />
          <RangoDeFechas valor={rango} onCambio={setRango} />
        </div>
      </Card>

      {isPending ? <Cargando texto="Cargando el histórico…" /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && filtradas.length > 0 ? (
        <>
          <Card className="mb-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <p className="text-ink/85 font-medium">
                <span className="tabular">{filtradas.length}</span> compra
                {filtradas.length === 1 ? '' : 's'} finalizada{filtradas.length === 1 ? '' : 's'}
              </p>
              <p className="text-ink/85 tabular font-medium">{dinero('USD', totalUsd)}</p>
            </div>
          </Card>

          <Card flush>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                    <th className="px-5 py-3 font-medium">Compra</th>
                    <th className="px-3 py-3 font-medium">Qué se pidió</th>
                    <th className="px-3 py-3 font-medium">Proveedor</th>
                    <th className="px-3 py-3 font-medium">Estatus</th>
                    <th className="px-3 py-3 font-medium">Quedó en</th>
                    <th className="px-5 py-3 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((t) => (
                    <tr key={t.solicitud_id} className="border-hairline border-b last:border-0">
                      <td className="px-5 py-3">
                        <Link
                          to={`/app/compras/${t.solicitud_id}`}
                          className="text-ink/85 hover:text-tierra-600 dark:hover:text-tierra-300 tabular font-mono text-xs font-medium hover:underline"
                        >
                          {t.orden_numero ?? t.numero}
                        </Link>
                        <p className="text-ink/45 text-xs">{fecha(t.creada_en)}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-ink/85 leading-snug">{t.titulo}</p>
                        <p className="text-ink/45 text-xs">
                          {t.solicitante ?? 'Sin solicitante'}
                          {t.destino ? ` · ${t.destino}` : ''}
                        </p>
                      </td>
                      <td className="text-ink/70 px-3 py-3">{t.proveedor ?? '—'}</td>
                      <td className="px-3 py-3">
                        <Chip tone="info">Finalizada</Chip>
                      </td>
                      <td className="px-3 py-3">
                        <Chip tone={tonoDeEtapa(t.historico_columna)}>
                          {etapa(t.historico_columna)}
                        </Chip>
                      </td>
                      <td className="text-ink/85 tabular px-5 py-3 text-right font-medium whitespace-nowrap">
                        {t.total_usd ? dinero('USD', t.total_usd) : <span className="text-ink/30">Sin cotizar</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}

      {data && filtradas.length === 0 ? (
        <Card>
          <Vacio
            icono={<Archive />}
            titulo={hayFiltro ? 'Sin resultados' : 'El histórico está vacío'}
            descripcion={
              hayFiltro
                ? 'Quite algún filtro o amplíe las fechas.'
                : 'Aquí quedan las compras que se cerraron antes del flujo nuevo.'
            }
          />
        </Card>
      ) : null}
    </>
  )
}
