import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import { fechaHora } from '@/lib/formato'
import type { TarjetaVenta } from '@/lib/api/ventasTablero'
import { TIPO_DOC, chipsDe, coincide, montoDe, pdfDe, whatsappDe } from './ventasTablero'

/*
  EL HISTÓRICO DE UNA COLUMNA (la dueña, 10/11/2026: «que sea con un scroll,
  solo mostrar las primeras 10, las demás pasan a un histórico vista tipo
  lista buscable»).

  La columna del tablero enseña sus 10 primeras; «+ n más» abre aquí todas las
  de esa columna, en lista y con buscador. Tocar una fila abre su detalle.

  Cada fila trae su PDF y su WhatsApp (la dueña, 10/11/2026: «desde la vista de
  tabla e histórico, tendrá sus respectivos PDF y mensaje de WhatsApp»). El PDF
  se abre en la pantalla del documento, con el papel de siempre.
*/
export function HistoricoVentas({
  titulo,
  tarjetas,
  empresa,
  onAbrir,
  onWhatsapp,
  onCerrar,
}: {
  titulo: string
  tarjetas: TarjetaVenta[]
  empresa: string
  onAbrir: (clave: string) => void
  onWhatsapp: (titulo: string, texto: string) => void
  onCerrar: () => void
}) {
  const navegar = useNavigate()
  const [busca, setBusca] = useState('')
  const filas = useMemo(() => tarjetas.filter((t) => coincide(t, busca.trim())), [tarjetas, busca])

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Histórico · ${titulo}`}
      descripcion={`${tarjetas.length} documento(s) en esta columna. Toca uno para ver su detalle.`}
      ancho="xl"
      acciones={
        <Button variant="outline" onClick={onCerrar}>
          Cerrar
        </Button>
      }
    >
      <div className="space-y-3">
        <Input
          label="Buscar"
          placeholder="Cliente, RIF, número, producto, placa, chofer…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          autoFocus
        />
        <div className="text-ink/55 text-xs">
          {filas.length === tarjetas.length ? `${filas.length} en la lista` : `${filas.length} de ${tarjetas.length} coinciden`}
        </div>
        {filas.length === 0 ? (
          <div className="text-ink/45 border-ink/10 rounded-[8px] border border-dashed px-3 py-6 text-center text-sm">
            Nada coincide con la búsqueda.
          </div>
        ) : (
          <div className="border-hairline max-h-[60vh] overflow-auto rounded-[10px] border">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-surface text-ink/55 border-hairline sticky top-0 border-b text-left text-xs">
                <tr>
                  <th className="px-3 py-2 font-medium">Documento</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 text-right font-medium">Monto</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {filas.map((t) => {
                  const monto = montoDe(t)
                  const cadena = [t.cadena.cot, t.cadena.sd, t.cadena.ns, t.cadena.ne, t.cadena.fac].filter(
                    (x, i, a): x is string => !!x && x !== t.numero && a.indexOf(x) === i,
                  )
                  return (
                    <tr
                      key={t.clave}
                      className="border-hairline hover:bg-ink/3 cursor-pointer border-b align-top last:border-b-0"
                      onClick={() => onAbrir(t.clave)}
                      title="Ver detalle"
                    >
                      <td className="px-3 py-2">
                        <div className="font-mono text-xs font-semibold">{t.numero}</div>
                        <div className="text-ink/45 text-[11px]">{TIPO_DOC[t.tipo]}</div>
                        {cadena.length ? <div className="text-ink/45 font-mono text-[10.5px]">{cadena.join(' → ')}</div> : null}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{t.cliente ?? '—'}</div>
                        {t.rif ? <div className="text-ink/45 text-[11px]">{t.rif}</div> : null}
                      </td>
                      <td className="text-ink/70 max-w-64 px-3 py-2 text-xs">
                        <span className="line-clamp-2">{t.resumen ?? '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[13px] whitespace-nowrap tabular-nums">
                        {monto ? monto.texto : ''}
                        {monto?.etiqueta ? <div className="text-ink/50 font-sans text-[11px]">{monto.etiqueta}</div> : null}
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex flex-wrap gap-1">
                          {chipsDe(t).map((c, i) => (
                            <Chip key={i} tone={c.tono} title={c.titulo}>
                              {c.texto}
                            </Chip>
                          ))}
                        </span>
                      </td>
                      <td className="text-ink/55 px-3 py-2 text-xs whitespace-nowrap">{fechaHora(t.at)}</td>
                      <td className="px-3 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <AccionesDeFila t={t} empresa={empresa} onPdf={(ruta) => void navegar(ruta)} onWhatsapp={onWhatsapp} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  )
}

/** «📄 PDF» y «💬 WhatsApp» de un documento, para las filas de una lista. */
export function AccionesDeFila({
  t,
  empresa,
  onPdf,
  onWhatsapp,
}: {
  t: TarjetaVenta
  empresa: string
  onPdf: (ruta: string) => void
  onWhatsapp: (titulo: string, texto: string) => void
}) {
  const pdf = pdfDe(t)
  return (
    <span className="flex justify-end gap-1">
      {pdf ? (
        <Button size="sm" variant="ghost" title={`PDF de ${t.numero}`} onClick={() => onPdf(pdf)}>
          📄 PDF
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        title="Mensaje de WhatsApp de esta etapa"
        onClick={() => {
          const w = whatsappDe(t, empresa)
          onWhatsapp(w.titulo, w.texto)
        }}
      >
        💬 WhatsApp
      </Button>
    </span>
  )
}
