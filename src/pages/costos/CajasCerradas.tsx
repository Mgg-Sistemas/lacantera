/*
  Las cajas cerradas.

  Cada una con su foto congelada: costo por m³, m³, costo. Arriba, la
  tendencia de las últimas, que es lo que gerencia mira para decidir si el
  precio de venta sigue valiendo. El PDF sale de la foto, nunca recalcula.
*/
import { useState } from 'react'
import { Archive, Eye, Printer } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { Visor } from '@/components/Visor'
import { CLASES, useCajas, useMovimientosCaja, type CajaCosto, type ResumenCaja } from '@/lib/api/costos'
import { empresaDelPapel, useEmpresa } from '@/lib/api/empresa'
import { armarCierreDeCaja } from '@/lib/ficha/costosPdf'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { useSesion } from '@/lib/sesion'
import { supabase } from '@/lib/supabase'
import { desenvolver } from '@/lib/api/rpc'
import type { MovimientoCosto } from '@/lib/api/costos'
import { dolares, enteros, fecha as fmtFecha } from '@/lib/formato'
import { dineroONada, porM3 } from './formato'

export function CajasCerradas() {
  const cajas = useCajas()
  const [viendo, setViendo] = useState<CajaCosto | null>(null)
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [armando, setArmando] = useState<number | null>(null)
  const { data: laEmpresa } = useEmpresa()
  const { nombre: yo } = useSesion()

  const cerradas = (cajas.data ?? []).filter((c) => c.estado === 'CERRADA' && c.resumen_json)

  const imprimir = async (c: CajaCosto) => {
    if (!c.resumen_json) return
    setArmando(c.id)
    try {
      const filas = desenvolver<MovimientoCosto[]>(
        await supabase.from('v_costo_movimientos').select('*').eq('caja_id', c.id).order('fecha').order('id'),
      )
      setPdf(
        await armarCierreDeCaja({
          resumen: c.resumen_json,
          filas,
          empresa_papel: empresaDelPapel(laEmpresa),
          emitidoPor: yo ?? '',
          momento: new Date(),
        }),
      )
    } finally {
      setArmando(null)
    }
  }

  if (cajas.isPending) return <Cargando />
  if (cajas.error) return <ErrorDeCarga error={cajas.error} />

  if (cerradas.length === 0) {
    return (
      <Vacio
        icono={<Archive />}
        titulo="Todavía no se ha cerrado ninguna caja"
        descripcion="Al cerrar la abierta, su foto queda aquí: costo por m³, m³ y costo, congelados."
      />
    )
  }

  return (
    <>
      <Card flush>
        <div className="border-hairline border-b px-5 py-3">
          <CardHeader title="Cierres" subtitle="De la más reciente a la más vieja. Las cifras son las de la foto del cierre." />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                <th className="px-5 py-2.5 font-medium">Caja</th>
                <th className="px-5 py-2.5 font-medium">Período</th>
                <th className="px-5 py-2.5 text-right font-medium">Costo por m³</th>
                <th className="px-5 py-2.5 text-right font-medium">m³ planta</th>
                <th className="px-5 py-2.5 text-right font-medium">Costo</th>
                <th className="px-5 py-2.5 text-right font-medium">Fondo al cierre</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-hairline divide-y">
              {cerradas.map((c) => {
                const r = c.resumen_json as ResumenCaja
                return (
                  <tr key={c.id}>
                    <td className="px-5 py-2.5">
                      <span className="text-ink/85 font-medium">Caja {c.numero}</span>
                      {c.nombre ? <span className="text-ink/45"> · {c.nombre}</span> : null}
                    </td>
                    <td className="text-ink/60 px-5 py-2.5 whitespace-nowrap">
                      {fmtFecha(c.fecha_inicio)} – {c.fecha_fin ? fmtFecha(c.fecha_fin) : ''}
                    </td>
                    <td className="tabular text-ink/85 px-5 py-2.5 text-right whitespace-nowrap">{porM3(r.costo_por_m3)}</td>
                    <td className="tabular px-5 py-2.5 text-right">{enteros(r.m3_planta)}</td>
                    <td className="tabular px-5 py-2.5 text-right whitespace-nowrap">{dineroONada(r.costo_usd)}</td>
                    <td className="tabular px-5 py-2.5 text-right whitespace-nowrap">{dolares(r.fondo_usd)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <Button size="sm" variant="ghost" title="Ver la foto" onClick={() => setViendo(c)}>
                        <Eye className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="PDF"
                        disabled={armando === c.id}
                        onClick={() => void imprimir(c)}
                      >
                        <Printer className="size-4" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {viendo?.resumen_json ? <Foto caja={viendo} onCerrar={() => setViendo(null)} /> : null}

      <Visor
        abierto={pdf !== null}
        onCerrar={() => setPdf(null)}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ''}
        titulo="Cierre de caja"
      />
    </>
  )
}

function Foto({ caja, onCerrar }: { caja: CajaCosto; onCerrar: () => void }) {
  const r = caja.resumen_json as ResumenCaja
  const filas = useMovimientosCaja(caja.id)
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Caja ${caja.numero}${caja.nombre ? ` · ${caja.nombre}` : ''}`}
      descripcion={`Cerrada el ${caja.cerrada_en ? fmtFecha(caja.cerrada_en) : ''}${caja.cerrada_por_nombre ? ` por ${caja.cerrada_por_nombre}` : ''}. Lo que sigue es la foto, no un recálculo.`}
      ancho="lg"
      acciones={
        <Button variant="ghost" onClick={onCerrar}>
          Listo
        </Button>
      }
    >
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Dato rotulo="Costo por m³" valor={porM3(r.costo_por_m3)} />
        <Dato rotulo="Incluye" valor={r.incluye.map((c) => CLASES[c]).join(', ') || 'nada'} />
        <Dato rotulo="Costo" valor={dineroONada(r.costo_usd)} />
        <Dato rotulo="Ajustes de cajas cerradas" valor={dineroONada(r.ajustes_tardios_usd)} />
        <Dato rotulo="m³ salidos de planta (estimado)" valor={enteros(r.m3_planta)} />
        <Dato rotulo="m³ bajados de la mina" valor={enteros(r.m3_mina)} />
        <Dato rotulo="Fondo" valor={dolares(r.fondo_usd)} />
        <Dato rotulo="Entregado / abonado" valor={`${dolares(r.entregado_usd)} / ${dolares(r.abonado_usd)}`} />
      </dl>

      {r.por_clase.length > 0 ? (
        <Bloque titulo="Por clase">
          {r.por_clase.map((x) => (
            <Fila key={x.clase} a={CLASES[x.clase] ?? x.clase} b={dolares(x.monto_usd)} />
          ))}
        </Bloque>
      ) : null}
      {r.por_categoria.length > 0 ? (
        <Bloque titulo="Por categoría">
          {r.por_categoria.map((x) => (
            <Fila key={x.categoria} a={x.nombre} b={dolares(x.monto_usd)} />
          ))}
        </Bloque>
      ) : null}
      {r.por_producto.length > 0 ? (
        <Bloque titulo="m³ por producto">
          {r.por_producto.map((x) => (
            <Fila key={x.producto_id} a={`${x.producto} · ${x.salidas} salidas`} b={`${enteros(x.m3)} m³`} />
          ))}
        </Bloque>
      ) : null}
      <Bloque titulo="Movimientos">
        {filas.isPending ? <Cargando /> : null}
        {(filas.data ?? []).map((m) => (
          <Fila
            key={m.id}
            a={`${fmtFecha(m.fecha)} · ${m.sentido === 'REVERSO' ? '↩ ' : ''}${m.descripcion}${m.llego_tarde ? ' (llegó tarde)' : ''}`}
            b={m.m3 !== null && Number(m.monto_usd) === 0 ? `${enteros(m.m3)} m³` : dolares(m.monto_usd)}
          />
        ))}
      </Bloque>
    </Modal>
  )
}

function Dato({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-ink/45 text-xs">{rotulo}</dt>
      <dd className="tabular text-ink/85">{valor}</dd>
    </div>
  )
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <p className="text-ink/45 text-2xs mb-2 font-mono tracking-[0.16em] uppercase">{titulo}</p>
      <ul className="divide-hairline divide-y text-sm">{children}</ul>
    </div>
  )
}

function Fila({ a, b }: { a: string; b: string }) {
  return (
    <li className="flex justify-between gap-4 py-1.5">
      <span className="text-ink/75 min-w-0 truncate">{a}</span>
      <span className="tabular text-ink/85 shrink-0">{b}</span>
    </li>
  )
}
