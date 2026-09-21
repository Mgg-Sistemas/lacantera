import { useMemo, useState } from 'react'
import { FileSpreadsheet, Search, Settings2, TriangleAlert } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useClientes } from '@/lib/api/ventas'
import {
  ROTULO_DEL_DOCUMENTO,
  useColumnaLibre,
  useControlDeDespacho,
  useEstadosDeControl,
  useGuardarColumnaLibre,
  useGuardarEstadoDeControl,
  useGuardarFilaDeControl,
  useVincularClienteDeDestino,
  type FilaDeControl,
} from '@/lib/api/controlDespacho'
import { fecha as fmtFecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

/*
  LA PLANILLA DE CONTROL DE DESPACHO

  Es el Excel de Christopher con la mitad izquierda llenándose sola. Se lee como
  una hoja: una fila por material despachado, y al tocarla se abre lo que se
  escribe a mano —RIF, precio, status, observaciones y la columna libre—.

  DOS MANERAS DE MIRARLA, y por eso el interruptor de arriba:
  - ENTERA, que es la de control: cada número de la serie aparece, también el
    anulado, la salida interna y el que no tiene documento. Un número que falta
    sin explicación es un despacho que pudo salir sin registrarse.
  - SOLO LO DESPACHADO, que es la que se le pasa a administración.

  NADA DE AQUÍ ESCRIBE EN OTRO MÓDULO. Ni siquiera al decir a qué cliente
  corresponde un nombre escrito a mano: eso se apunta en una tabla de este
  módulo, y la ficha del cliente no se entera.
*/

const hoyEnCaracas = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date())

const dec2 = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const n2 = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === '' ? '' : dec2.format(Number(v))

export function ControlDespacho() {
  const hoy = hoyEnCaracas()
  const [desde, setDesde] = useState(`${hoy.slice(0, 7)}-01`)
  const [hasta, setHasta] = useState(hoy)
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('')
  const [soloDespachado, setSoloDespachado] = useState(false)
  const [editando, setEditando] = useState<FilaDeControl | null>(null)
  const [ajustes, setAjustes] = useState(false)

  const planilla = useControlDeDespacho(desde || null, hasta || null)
  const estados = useEstadosDeControl()
  const { data: columnaLibre = 'Otra' } = useColumnaLibre()
  const { puede } = useMisPermisos()
  const puedeEscribir = puede('CONTROL_DESPACHO', 'ESCRITURA')
  const puedeAjustar = puede('CONTROL_DESPACHO', 'TOTAL')

  const filas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return (planilla.data ?? []).filter((f) => {
      if (soloDespachado && f.estado_doc !== 'VIGENTE') return false
      if (status === '—' ? f.estado_control !== null || f.estado_doc !== 'VIGENTE' : status && f.estado_control !== status)
        return false
      if (!q) return true
      return [f.documento, f.cliente, f.destino_escrito, f.rif, f.material, f.observacion, f.extra].some(
        (t) => (t ?? '').toLowerCase().includes(q),
      )
    })
  }, [planilla.data, busca, status, soloDespachado])

  const vigentes = filas.filter((f) => f.estado_doc === 'VIGENTE')
  const totalMonto = vigentes.reduce((s, f) => s + Number(f.monto ?? 0), 0)
  // Los m³ se suman por unidad: si un día se despacha en toneladas, no se mezclan.
  const porUnidad = vigentes.reduce<Record<string, number>>((s, f) => {
    if (f.unidad) s[f.unidad] = (s[f.unidad] ?? 0) + Number(f.cantidad ?? 0)
    return s
  }, {})
  const sinRif = vigentes.filter((f) => f.falta_rif).length
  const sinPrecio = vigentes.filter((f) => f.precio === null).length

  /*
    LA HOJA DE CÁLCULO. Lo que se está viendo, con los filtros puestos. CSV con
    punto y coma y marca de orden de bytes: Excel en español lo abre de un doble
    clic, con los acentos bien y cada dato en su celda.
  */
  const bajarHoja = () => {
    const celda = (v: string) => `"${v.replaceAll('"', '""')}"`
    const num = (v: number | string | null) => (v === null || v === '' ? '' : Number(v).toFixed(2).replace('.', ','))
    const lineas = [
      ['# NOTA', 'FECHA', 'CLIENTE', 'RIF', 'MATERIAL', 'CANTIDAD', 'UNIDAD', 'PRECIO US$', 'MONTO US$', 'STATUS', 'OBSERVACIONES', columnaLibre.toUpperCase(), 'DOCUMENTO'],
      ...filas.map((f) => [
        f.documento,
        f.fecha ?? '',
        f.cliente ?? '',
        f.rif ?? '',
        f.material ?? '',
        num(f.cantidad),
        f.unidad ?? '',
        num(f.precio),
        num(f.monto),
        f.estado_control_nombre ?? '',
        f.observacion ?? '',
        f.extra ?? '',
        ROTULO_DEL_DOCUMENTO[f.estado_doc],
      ]),
    ]
    const texto = '﻿' + lineas.map((l) => l.map((c) => celda(String(c))).join(';')).join('\r\n')
    const enlace = document.createElement('a')
    enlace.href = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }))
    enlace.download = `control-de-despacho-${desde || 'inicio'}-a-${hasta || hoy}.csv`
    enlace.click()
    setTimeout(() => URL.revokeObjectURL(enlace.href), 1000)
  }

  return (
    <>
      <PageHeader
        title="Control de despacho"
        description="Lo que salió, de qué nota, para quién y en cuánto. El número, la fecha, el cliente, el material y la cantidad vienen de las notas; el RIF, el precio, el status y las observaciones se escriben aquí. No cambia nada en ningún otro módulo."
        actions={
          <>
            {puedeAjustar ? (
              <Button variant="ghost" icon={<Settings2 />} onClick={() => setAjustes(true)}>
                Status y columna
              </Button>
            ) : null}
            <Button variant="outline" icon={<FileSpreadsheet />} disabled={filas.length === 0} onClick={bajarHoja}>
              Hoja de cálculo
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Input label="Desde" type="date" value={desde} max={hasta || hoy} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="w-40">
            <Input label="Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div className="w-48">
            <Select
              label="Status"
              vacio="Todos"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              opciones={[
                { valor: '—', etiqueta: 'Sin status todavía' },
                ...(estados.data ?? []).map((e) => ({ valor: e.codigo, etiqueta: e.nombre })),
              ]}
            />
          </div>
          <div className="min-w-[14rem] flex-1">
            <Input
              label="Buscar"
              icon={<Search />}
              placeholder="Nota, cliente, RIF, material u observación"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>
        <label className="text-ink/75 mt-3 flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-royal-600 size-4"
            checked={soloDespachado}
            onChange={(e) => setSoloDespachado(e.target.checked)}
          />
          Solo lo despachado
          <span className="text-ink/45">
            — quita lo anulado, las salidas internas y los números sin documento. Es la vista para pasar el informe.
          </span>
        </label>
      </Card>

      {planilla.isPending ? (
        <Cargando />
      ) : planilla.error ? (
        <ErrorDeCarga error={planilla.error} />
      ) : filas.length === 0 ? (
        <Vacio titulo="Nada en ese período" descripcion="No hay notas de entrega ni de salida con esas fechas y esos filtros." />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <span className="text-ink/60">
              {vigentes.length} despacho{vigentes.length === 1 ? '' : 's'}
            </span>
            {Object.entries(porUnidad).map(([u, c]) => (
              <span key={u} className="text-ink/60">
                <span className="tabular text-ink/90 font-medium">{n2(c)}</span> {u}
              </span>
            ))}
            <span className="text-ink/60">
              Monto <span className="tabular text-ink/90 font-medium">$ {n2(totalMonto)}</span>
            </span>
            {sinPrecio > 0 ? <Chip tone="neutral">{sinPrecio} sin precio</Chip> : null}
            {sinRif > 0 ? (
              <Chip tone="warning" icon={<TriangleAlert />}>
                {sinRif} sin RIF
              </Chip>
            ) : null}
          </div>

          <Card flush>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-sm">
                <thead>
                  <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                    <th className="px-4 py-3 font-medium"># Nota</th>
                    <th className="px-3 py-3 font-medium">Fecha</th>
                    <th className="px-3 py-3 font-medium">Cliente</th>
                    <th className="px-3 py-3 font-medium">RIF</th>
                    <th className="px-3 py-3 font-medium">Material</th>
                    <th className="px-3 py-3 text-right font-medium">Cantidad</th>
                    <th className="px-3 py-3 text-right font-medium">Precio</th>
                    <th className="px-3 py-3 text-right font-medium">Monto US$</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Observaciones</th>
                    <th className="px-4 py-3 font-medium">{columnaLibre}</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => {
                    const viva = f.estado_doc === 'VIGENTE'
                    return (
                      <tr
                        key={f.clave}
                        onClick={viva && puedeEscribir ? () => setEditando(f) : undefined}
                        className={cn(
                          'border-hairline border-b last:border-0',
                          viva ? (puedeEscribir ? 'hover:bg-ink/3 cursor-pointer transition-colors' : '') : 'text-ink/40 bg-ink/2',
                        )}
                      >
                        <td className="tabular px-4 py-2.5 font-medium whitespace-nowrap">{f.documento}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{f.fecha ? fmtFecha(f.fecha) : ''}</td>
                        {viva ? (
                          <>
                            <td className="px-3 py-2.5">
                              {f.cliente}
                              {f.destino_escrito && f.cliente !== f.destino_escrito ? (
                                <span className="text-ink/40 block text-xs">escrito «{f.destino_escrito}»</span>
                              ) : null}
                              {f.detalle ? <span className="text-ink/40 block text-xs">{f.detalle}</span> : null}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              {f.rif ?? <span className="text-warning text-xs font-medium">falta</span>}
                            </td>
                            <td className="px-3 py-2.5">{f.material}</td>
                            <td className="tabular px-3 py-2.5 text-right whitespace-nowrap">
                              {n2(f.cantidad)} <span className="text-ink/40 text-xs">{f.unidad}</span>
                            </td>
                            <td className="tabular px-3 py-2.5 text-right">
                              {n2(f.precio)}
                              {f.precio === null && f.moneda_doc && f.moneda_doc !== 'USD' ? (
                                <span className="text-ink/35 block text-xs">nota en {f.moneda_doc}</span>
                              ) : null}
                            </td>
                            <td className="tabular text-ink/90 px-3 py-2.5 text-right font-medium">{n2(f.monto)}</td>
                            <td className="px-3 py-2.5">{f.estado_control_nombre ?? ''}</td>
                            <td className="px-3 py-2.5">{f.observacion ?? ''}</td>
                            <td className="px-4 py-2.5">{f.extra ?? ''}</td>
                          </>
                        ) : (
                          <td className="px-3 py-2.5 italic" colSpan={9}>
                            {ROTULO_DEL_DOCUMENTO[f.estado_doc]}
                            {f.cliente ? ` · ${f.cliente}` : ''}
                            {f.material ? ` · ${f.material} ${n2(f.cantidad)} ${f.unidad ?? ''}` : ''}
                            {f.detalle ? ` · ${f.detalle}` : ''}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="text-ink/45 mt-2 text-xs">
            Solo suma lo despachado. Las filas en gris enseñan que el número existe y qué le pasó: así se ve que a la
            serie no le falta ninguno.
          </p>
        </>
      )}

      {editando ? (
        <EditarFila fila={editando} columnaLibre={columnaLibre} onCerrar={() => setEditando(null)} />
      ) : null}
      {ajustes ? <Ajustes columnaLibre={columnaLibre} onCerrar={() => setAjustes(false)} /> : null}
    </>
  )
}

/* ─────────────────────────────────────────────── lo que se escribe a mano */

function EditarFila({
  fila,
  columnaLibre,
  onCerrar,
}: {
  fila: FilaDeControl
  columnaLibre: string
  onCerrar: () => void
}) {
  const estados = useEstadosDeControl()
  const { data: clientes } = useClientes(true)
  const guardar = useGuardarFilaDeControl()
  const vincular = useVincularClienteDeDestino()

  // El RIF que viene del cliente no se copia a la casilla: si el cliente lo
  // corrige en su ficha, la planilla debe seguirlo.
  const [rif, setRif] = useState(fila.rif_del_cliente ? '' : String(fila.rif ?? ''))
  const [precio, setPrecio] = useState(
    fila.precio_de_la_nota || fila.precio === null ? '' : String(Number(fila.precio)),
  )
  const [estado, setEstado] = useState(fila.estado_control ?? '')
  const [observacion, setObservacion] = useState(fila.observacion ?? '')
  const [extra, setExtra] = useState(fila.extra ?? '')
  const [clienteId, setClienteId] = useState(fila.cliente_id && fila.destino_escrito ? String(fila.cliente_id) : '')

  const precioNum = precio.trim() === '' ? null : Number(precio.replace(',', '.'))
  const precioMalo = precioNum !== null && (Number.isNaN(precioNum) || precioNum < 0)
  const precioFinal = precioNum ?? (fila.precio_de_la_nota ? Number(fila.precio) : null)
  const monto = precioFinal === null ? null : precioFinal * Number(fila.cantidad ?? 0)
  const error = guardar.error ?? vincular.error

  const enviar = async () => {
    try {
      // Primero a quién corresponde el nombre: de ahí sale el RIF de esta fila
      // y el de todas las que vengan con ese mismo nombre.
      if (fila.destino_escrito && clienteId !== String(fila.cliente_id ?? '')) {
        await vincular.mutateAsync({
          destino: fila.destino_escrito,
          cliente_id: clienteId ? Number(clienteId) : null,
        })
      }
      await guardar.mutateAsync({
        fila,
        rif: rif.trim() || null,
        precio: precioNum,
        estado: estado || null,
        observacion: observacion.trim() || null,
        extra: extra.trim() || null,
      })
      onCerrar()
    } catch {
      // El error ya está en la mutación y se pinta abajo.
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={fila.documento}
      descripcion={`${fila.cliente ?? ''} · ${fila.material ?? ''} · ${n2(fila.cantidad)} ${fila.unidad ?? ''}. Lo de arriba viene de la nota y no se cambia aquí.`}
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button disabled={guardar.isPending || vincular.isPending || precioMalo} onClick={() => void enviar()}>
            {guardar.isPending || vincular.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {fila.destino_escrito ? (
          <SelectBuscable
            label={`¿Qué cliente es «${fila.destino_escrito}»?`}
            opciones={(clientes ?? []).map((c) => ({ valor: String(c.id), etiqueta: c.nombre, detalle: c.rif }))}
            valor={clienteId}
            onCambio={setClienteId}
            vacio="Sin decir todavía"
            hint="Se dice una vez. Desde ahí, toda salida escrita con ese nombre trae su cliente y su RIF sola. La ficha del cliente no se toca."
          />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="RIF o cédula"
            value={rif}
            onChange={(e) => setRif(e.target.value)}
            placeholder={fila.rif_del_cliente ? String(fila.rif) : 'V-12345678'}
            hint={
              fila.rif_del_cliente
                ? 'Viene del cliente registrado. Escribe aquí solo si para esta fila debe ser otro.'
                : clienteId
                  ? 'Al guardar, saldrá del cliente elegido arriba.'
                  : 'Obligatorio: sin él la fila queda marcada.'
            }
          />
          <Input
            label="Precio US$"
            inputMode="decimal"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            placeholder={fila.precio_de_la_nota ? n2(fila.precio) : 'Sin precio'}
            error={precioMalo ? 'No es un precio válido.' : undefined}
            hint={
              fila.precio_de_la_nota
                ? 'Viene de la nota de entrega. Escribe aquí solo para cambiarlo.'
                : fila.moneda_doc && fila.moneda_doc !== 'USD'
                  ? `La nota está en ${fila.moneda_doc}: su precio no se trae a una columna en dólares.`
                  : undefined
            }
          />
        </div>

        <p className="text-ink/60 text-sm">
          Monto:{' '}
          <span className="tabular text-ink/90 font-medium">{monto === null ? '—' : `$ ${n2(monto)}`}</span>
          <span className="text-ink/40"> · cantidad × precio, no se teclea</span>
        </p>

        <Select
          label="Status"
          vacio="Sin status"
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          opciones={(estados.data ?? [])
            .filter((e) => e.activo || e.codigo === fila.estado_control)
            .map((e) => ({ valor: e.codigo, etiqueta: e.nombre }))}
        />
        <Textarea label="Observaciones" rows={2} value={observacion} onChange={(e) => setObservacion(e.target.value)} />
        <Input label={columnaLibre} value={extra} onChange={(e) => setExtra(e.target.value)} />

        {error ? <ErrorDeCarga error={error} /> : null}
      </div>
    </Modal>
  )
}

/* ───────────────────────────────────────── la lista de status y la columna */

function Ajustes({ columnaLibre, onCerrar }: { columnaLibre: string; onCerrar: () => void }) {
  const estados = useEstadosDeControl()
  const guardarEstado = useGuardarEstadoDeControl()
  const guardarColumna = useGuardarColumnaLibre()
  const [nuevo, setNuevo] = useState('')
  const [columna, setColumna] = useState(columnaLibre)
  const error = guardarEstado.error ?? guardarColumna.error

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Status y columna libre"
      descripcion="La lista de status es tuya. Un status en uso no se borra: se apaga, y deja de ofrecerse sin perderse de las filas que ya lo tienen."
      acciones={<Button onClick={onCerrar}>Listo</Button>}
    >
      <div className="space-y-4">
        <ul className="divide-hairline border-hairline rounded-card divide-y border">
          {(estados.data ?? []).map((e) => (
            <li key={e.codigo} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className={cn('text-sm', !e.activo && 'text-ink/40 line-through')}>{e.nombre}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={guardarEstado.isPending}
                onClick={() => guardarEstado.mutate({ ...e, activo: !e.activo })}
              >
                {e.activo ? 'Apagar' : 'Encender'}
              </Button>
            </li>
          ))}
        </ul>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input label="Status nuevo" value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="POR COBRAR" />
          </div>
          <Button
            variant="outline"
            disabled={nuevo.trim().length < 2 || guardarEstado.isPending}
            onClick={() =>
              guardarEstado.mutate(
                { codigo: null, nombre: nuevo, orden: ((estados.data ?? []).length + 1) * 10, activo: true },
                { onSuccess: () => setNuevo('') },
              )
            }
          >
            Agregar
          </Button>
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              label="Cómo se llama la columna libre"
              value={columna}
              onChange={(e) => setColumna(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            disabled={columna.trim().length < 2 || columna.trim() === columnaLibre || guardarColumna.isPending}
            onClick={() => guardarColumna.mutate(columna.trim())}
          >
            Renombrar
          </Button>
        </div>

        {error ? <ErrorDeCarga error={error} /> : null}
      </div>
    </Modal>
  )
}
