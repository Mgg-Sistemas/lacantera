import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ShoppingBag, Truck } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_COMPRA_DIRECTA } from '@/components/pestanasDeModulos'
import { RangoDeFechas } from '@/components/RangoDeFechas'
import { SIN_RANGO } from '@/components/rango'
import type { Rango } from '@/components/rango'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Select } from '@/components/ui/Select'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { ModalRecepcion } from './ModalRecepcion'
import { useComprasDirectas } from '@/lib/api/compras'
import { useMisPermisos } from '@/lib/api/usuarios'
import type { Orden } from '@/lib/api/compras'
import { dinero, fecha, fechaHora } from '@/lib/formato'

/*
  EL HISTORIAL DE LAS COMPRAS DIRECTAS

  «Nos solicitan permitir visualizar un historial o vista que permita revisar el
  estatus de las órdenes por compra directa» —el usuario, 24/09/2026—.

  La pantalla de compra directa solo registraba. Cuarenta y cinco compras por
  unos 8.700 dólares y ninguna lista donde repasarlas: para ver una había que
  saberse el número y buscarla por la dirección.

  UNA COMPRA DIRECTA NO SIGUE EL MISMO CAMINO que una normal, y por eso su
  historial no es el tablero de compras con un filtro. La normal se pide, se
  cotiza, se aprueba, se paga y se recibe; la directa nace ya comprada —alguien
  fue, la pagó y volvió con el material— así que solo puede estar en dos sitios:
  esperando que llegue lo comprado, o recibida. Un historial que ofreciera los
  ocho estados estaría ofreciendo seis que nunca salen.
*/

/*
  LOS ESTADOS, EN CASTELLANO Y CON SU TONO.

  El tono no es decorativo: `success` para lo terminado y `warning` para lo que
  todavía espera algo de alguien. Quien recorre la lista con la vista debería
  poder ver qué falta sin leer una palabra.
*/
const ESTADOS: Record<string, { texto: string; tono: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  RECIBIDA: { texto: 'Recibida', tono: 'success' },
  RECIBIDA_PARCIAL: { texto: 'Recibida a medias', tono: 'warning' },
  PAGADA_POR_RECIBIR: { texto: 'Pagada, falta recibirla', tono: 'warning' },
  POR_RECIBIR: { texto: 'Por recibir', tono: 'warning' },
  POR_INDICAR_PAGO: { texto: 'Falta indicar el pago', tono: 'warning' },
  EN_TESORERIA: { texto: 'En tesorería', tono: 'warning' },
  PROVEEDOR_DESISTIO: { texto: 'El proveedor desistió', tono: 'danger' },
  CANCELADA: { texto: 'Cancelada', tono: 'danger' },
}

const comoSeLlama = (estado: string) => ESTADOS[estado]?.texto ?? estado

/*
  Desde qué estados se puede recibir. Son los mismos tres que la pantalla de
  Recepciones pide a la base, y se nombran aquí para que las dos coincidan: una
  compra que sale en Recepciones y no ofrece el botón aquí es una compra que
  alguien va a creer trabada.
*/
const PENDIENTES = new Set(['PAGADA_POR_RECIBIR', 'RECIBIDA_PARCIAL', 'POR_RECIBIR'])

/*
  CUÁNTO LLEVA ESPERANDO LO QUE SE PAGÓ Y NO HA LLEGADO.

  Una compra directa se paga en el acto, así que lo único que puede envejecer es
  la espera del material. Se cuenta desde la fecha de pago, que es la misma que
  usa el Panel para su contador de compras atrasadas: dos pantallas contando lo
  mismo de dos maneras es como nace una discusión sobre cuál tiene razón.

  El umbral son siete días, el mismo del Panel. A partir de ahí deja de ser una
  espera y pasa a ser algo que preguntarle al proveedor.

  Y conviene saber por qué aparece ahora: hasta el 23/09/2026 las compras
  directas no sellaban su fecha de pago, así que ninguna envejecía y el contador
  del Panel las ignoraba. Arreglado eso, once de las doce que esperan material
  van a cruzar los siete días durante la próxima semana. No es que algo se haya
  roto: es que por fin se ve.
*/
const DIAS_QUE_YA_ES_MUCHO = 7

function diasEsperando(o: Orden): number | null {
  if (o.recibida_en || !o.fecha_pago) return null
  const desde = new Date(`${o.fecha_pago}T12:00:00`)
  return Math.floor((Date.now() - desde.getTime()) / 86_400_000)
}

export function HistorialDirectas() {
  const { data, isPending, error } = useComprasDirectas()
  const [estado, setEstado] = useState('')
  const [rango, setRango] = useState<Rango>(SIN_RANGO)

  /*
    RECIBIR DESDE AQUÍ, QUE ES DONDE SE LEE QUE FALTA.

    Lo preguntó el usuario nada más verlo: «si el estatus es pagada, falta
    recibirla, ¿cómo se puede recibir o dónde está la opción?». Existía —en
    Compras › Recepciones— pero había que saberlo, y eso es lo mismo que no
    existir para quien acaba de leer «falta recibirla» en esta pantalla.

    Se abre el MISMO modal que usa Recepciones, no una copia: si el día de
    mañana recibir pide un dato más, lo pide en los dos sitios o en ninguno.

    Y se pide INVENTARIO en escritura, igual que allí. Recibir mueve existencias:
    el permiso no es de quien mira las compras, es de quien responde del almacén.
  */
  const [recibiendo, setRecibiendo] = useState<Orden | null>(null)
  const { puede } = useMisPermisos()
  const puedeRecibir = puede('INVENTARIO', 'ESCRITURA')

  /*
    El filtro se aplica aquí y no en la consulta a propósito: son 45 órdenes y
    caben de sobra en una petición. Ir a la base por cada cambio de filtro
    costaría un viaje de medio segundo para reordenar lo que ya está en la
    pantalla.
  */
  const filtradas = useMemo(() => {
    return (data ?? []).filter((o: Orden) => {
      if (estado && o.estado !== estado) return false
      const dia = o.creada_en.slice(0, 10)
      if (rango.desde && dia < rango.desde) return false
      if (rango.hasta && dia > rango.hasta) return false
      return true
    })
  }, [data, estado, rango])

  /*
    Solo se ofrecen los estados QUE HAY, y no los ocho que admite la base.

    Un desplegable con seis opciones que siempre devuelven nada enseña a la
    gente que el filtro no sirve. Si algún día una compra directa acaba
    cancelada, la opción aparece sola.
  */
  const estadosPresentes = useMemo(() => {
    const vistos = new Map<string, number>()
    for (const o of data ?? []) vistos.set(o.estado, (vistos.get(o.estado) ?? 0) + 1)
    return [...vistos.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([valor, n]) => ({ valor, etiqueta: `${comoSeLlama(valor)} (${n})` }))
  }, [data])

  const totalUsd = filtradas.reduce((s, o) => s + Number(o.total_usd ?? 0), 0)

  return (
    <>
      <PageHeader
        title="Compras directas"
        description="Lo que se compró yendo a buscarlo, con su estatus. Una compra directa nace ya pagada: lo único que puede faltarle es que llegue el material."
      />

      <Pestanas pestanas={PESTANAS_COMPRA_DIRECTA} />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,18rem)_1fr]">
          <Select
            label="Estatus"
            vacio="Todos"
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            opciones={estadosPresentes}
          />
          <RangoDeFechas valor={rango} onCambio={setRango} />
        </div>
      </Card>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && filtradas.length > 0 ? (
        <>
          {/* La cuenta arriba, que es lo que se viene a saber. */}
          <Card className="mb-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <p className="text-ink/85 font-medium">
                <span className="tabular">{filtradas.length}</span> compra
                {filtradas.length === 1 ? '' : 's'}
                {estado ? ` · ${comoSeLlama(estado).toLowerCase()}` : ''}
              </p>
              <p className="text-ink/85 tabular font-medium">{dinero('USD', totalUsd)}</p>
            </div>
          </Card>

          <Card flush>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                    <th className="px-5 py-3 font-medium">Orden</th>
                    <th className="px-3 py-3 font-medium">Proveedor</th>
                    <th className="px-3 py-3 font-medium">Estatus</th>
                    <th className="px-3 py-3 text-right font-medium">Total</th>
                    <th className="px-3 py-3 font-medium">Material</th>
                    <th className="px-5 py-3 text-right font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((o) => {
                    const e = ESTADOS[o.estado] ?? { texto: o.estado, tono: 'neutral' as const }
                    return (
                      <tr key={o.id} className="border-hairline border-b last:border-0">
                        <td className="px-5 py-3">
                          {/* El número lleva al detalle, que es donde están los
                              renglones y los papeles. Subrayado al pasar por
                              encima: un número en una tabla no se lee como algo
                              que se pueda pulsar. */}
                          <Link
                            to={`/app/compras/${o.id}`}
                            className="text-ink/85 hover:text-tierra-600 dark:hover:text-tierra-300 tabular font-mono text-xs font-medium hover:underline"
                          >
                            {o.numero}
                          </Link>
                          <p className="text-ink/45 text-xs">{fecha(o.creada_en)}</p>
                        </td>
                        <td className="text-ink/70 px-3 py-3">{o.proveedor?.nombre ?? '—'}</td>
                        <td className="px-3 py-3">
                          <Chip tone={e.tono}>{e.texto}</Chip>
                        </td>
                        <td className="text-ink/85 tabular px-3 py-3 text-right font-medium whitespace-nowrap">
                          {dinero('USD', o.total_usd)}
                        </td>
                        <td className="px-3 py-3 text-xs whitespace-nowrap">
                          {o.recibida_en ? (
                            <span className="text-ink/70">{fechaHora(o.recibida_en)}</span>
                          ) : (
                            (() => {
                              const d = diasEsperando(o)
                              if (d === null) return <span className="text-ink/40">Todavía no</span>
                              return (
                                <span
                                  className={
                                    d >= DIAS_QUE_YA_ES_MUCHO
                                      ? 'text-warning font-medium'
                                      : 'text-ink/55'
                                  }
                                >
                                  Esperando <span className="tabular">{d}</span> día
                                  {d === 1 ? '' : 's'}
                                </span>
                              )
                            })()
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {/* Solo donde tiene sentido: una recibida no se
                              recibe otra vez, y una cancelada tampoco. */}
                          {puedeRecibir && !o.recibida_en && PENDIENTES.has(o.estado) ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Truck />}
                              onClick={() => setRecibiendo(o)}
                            >
                              Recibir
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
        </>
      ) : null}

      {recibiendo ? (
        <ModalRecepcion abierto onCerrar={() => setRecibiendo(null)} orden={recibiendo} />
      ) : null}

      {data && filtradas.length === 0 ? (
        <Card>
          <Vacio
            icono={<ShoppingBag />}
            titulo={
              estado || rango.desde || rango.hasta
                ? 'Nada con esos filtros'
                : 'Todavía no hay compras directas'
            }
            descripcion={
              estado || rango.desde || rango.hasta
                ? 'Prueba a quitar el estatus o a ampliar las fechas.'
                : 'La primera la escribe quien registre una compra en la pestaña de al lado.'
            }
          />
        </Card>
      ) : null}
    </>
  )
}
