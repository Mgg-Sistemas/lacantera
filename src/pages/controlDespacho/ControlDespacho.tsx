import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  ArrowDown,
  ArrowUp,
  Download,
  FileSpreadsheet,
  FileText,
  Search,
  Settings2,
  TriangleAlert,
  Upload,
} from 'lucide-react'
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
import { Visor } from '@/components/Visor'
import { useMiPerfil, useMisPermisos } from '@/lib/api/usuarios'
import { useEmpresa } from '@/lib/api/empresa'
import { useClientes } from '@/lib/api/ventas'
import {
  ROTULO_DEL_DOCUMENTO,
  useCargarControlDeDespacho,
  useColumnaLibre,
  useControlDeDespacho,
  useEstadosDeControl,
  useGuardarColumnaLibre,
  useGuardarEstadoDeControl,
  useGuardarFilaDeControl,
  useVincularClienteDeDestino,
  type EstadoDeControl,
  type FilaDeControl,
} from '@/lib/api/controlDespacho'
import { armarControlDeDespacho } from '@/lib/ficha/controlDespachoPdf'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { bajarArchivo, escribirXlsx, leerHoja } from '@/lib/xlsx'
import { moduloDeRuta } from '@/config/navigation'
import { hojaDeLaPlanilla, interpretarCarga, plantillaDeCarga, type CargaInterpretada } from './hojas'
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

  EL NÚMERO DE LA NOTA ES UN ENLACE a su pantalla, para quien tiene permiso de
  entrar en ella; para quien no, es solo el número. Tocar el resto de la fila
  sigue abriendo lo que se escribe a mano.

  LO QUE SE MARCA ES LO QUE SALE. El Excel, el PDF y la plantilla de carga
  llevan las filas marcadas; sin ninguna marcada, llevan todo lo que se ve.
*/

/** Dónde vive cada nota. Lo que no tiene documento detrás no lleva a ningún lado. */
const rutaDeLaNota = (f: FilaDeControl): string | null =>
  f.estado_doc === 'SIN_DOCUMENTO'
    ? null
    : f.origen === 'NOTA_ENTREGA'
      ? `/app/facturacion/notas-entrega?nota=${encodeURIComponent(f.documento)}`
      : `/app/salidas?nota=${encodeURIComponent(f.documento)}`

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
  /*
    Empieza de la más vieja a la más nueva, que es como venía la lista hasta
    hoy. Cambiar además el orden al añadir el botón sería moverle el suelo a
    quien ya se sabe esta pantalla de memoria.
  */
  const [orden, setOrden] = useState<'ASC' | 'DESC'>('ASC')
  const [editando, setEditando] = useState<FilaDeControl | null>(null)
  const [ajustes, setAjustes] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set())
  const [papel, setPapel] = useState<ArchivoArmado | null>(null)
  const [armando, setArmando] = useState(false)
  const [falloPapel, setFalloPapel] = useState<unknown>(null)

  const planilla = useControlDeDespacho(desde || null, hasta || null)
  const estados = useEstadosDeControl()
  const { data: columnaLibre = 'Otra' } = useColumnaLibre()
  const { puede } = useMisPermisos()
  const { data: empresa } = useEmpresa()
  const { data: yo } = useMiPerfil()
  const puedeEscribir = puede('CONTROL_DESPACHO', 'ESCRITURA')
  const puedeAjustar = puede('CONTROL_DESPACHO', 'TOTAL')

  const filas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const vistas = (planilla.data ?? []).filter((f) => {
      if (soloDespachado && f.estado_doc !== 'VIGENTE') return false
      if (status === '—' ? f.estado_control !== null || f.estado_doc !== 'VIGENTE' : status && f.estado_control !== status)
        return false
      if (!q) return true
      return [f.documento, f.cliente, f.destino_escrito, f.rif, f.material, f.observacion, f.extra].some(
        (t) => (t ?? '').toLowerCase().includes(q),
      )
    })

    /*
      EL ORDEN POR FECHA, QUE AHORA SE ELIGE.

      Lo pidió la líder el 24/09/2026: de mayor a menor y al revés. Antes
      llegaba en el orden que quisiera la base y no había forma de darle la
      vuelta; para pasar el informe del mes se quiere lo último arriba, y para
      cuadrar contra el talonario se quiere lo primero.

      Las fechas vienen de la base como `2026-09-24`, así que compararlas como
      texto ordena igual que compararlas como fechas — y sin construir 52
      objetos `Date` en cada tecla que se escribe en el buscador.

      A IGUAL FECHA, MANDA EL NÚMERO DE NOTA. Sin ese desempate, dos despachos
      del mismo día se colocan como quiera el navegador y la lista baila entre
      un render y el siguiente; con él, el orden es siempre el mismo y además
      es el que tiene sentido, porque los números se dan en orden.

      `filter` ya devolvió un arreglo nuevo, así que ordenarlo aquí no toca lo
      que guarda la caché de la consulta.
    */
    return vistas.sort((a, b) => {
      const fa = a.fecha ?? ''
      const fb = b.fecha ?? ''
      if (fa !== fb) {
        // Lo que no tiene fecha se va al fondo en los dos sentidos. Arriba del
        // todo se leería como lo más antiguo, y no lo es: es que no se sabe.
        if (!fa) return 1
        if (!fb) return -1
        return orden === 'ASC' ? (fa < fb ? -1 : 1) : fa < fb ? 1 : -1
      }
      return a.documento.localeCompare(b.documento, 'es', { numeric: true })
    })
  }, [planilla.data, busca, status, soloDespachado, orden])

  const vigentes = filas.filter((f) => f.estado_doc === 'VIGENTE')
  const totalMonto = vigentes.reduce((s, f) => s + Number(f.monto ?? 0), 0)
  // Los m³ se suman por unidad: si un día se despacha en toneladas, no se mezclan.
  const porUnidad = vigentes.reduce<Record<string, number>>((s, f) => {
    if (f.unidad) s[f.unidad] = (s[f.unidad] ?? 0) + Number(f.cantidad ?? 0)
    return s
  }, {})
  const sinRif = vigentes.filter((f) => f.falta_rif).length
  const sinPrecio = vigentes.filter((f) => f.precio === null).length

  // Marcada y a la vista: lo que un filtro escondió no sale aunque siguiera marcado.
  const elegidas = filas.filter((f) => marcadas.has(f.clave))
  const paraSacar = elegidas.length > 0 ? elegidas : filas
  const todasMarcadas = filas.length > 0 && elegidas.length === filas.length
  const marcar = (clave: string) =>
    setMarcadas((m) => {
      const n = new Set(m)
      if (!n.delete(clave)) n.add(clave)
      return n
    })
  const nombreBase = `control-de-despacho-${desde || 'inicio'}-a-${hasta || hoy}`

  /*
    EL EXCEL. Un libro de verdad, con la cabecera en el color del sistema y los
    números como números, para poder sumarlos allá.
  */
  const bajarHoja = () => bajarArchivo(escribirXlsx(hojaDeLaPlanilla(paraSacar, columnaLibre)), `${nombreBase}.xlsx`)

  const verPapel = async () => {
    setArmando(true)
    setFalloPapel(null)
    try {
      const alcance = [
        elegidas.length > 0 ? `Las ${elegidas.length} filas marcadas` : soloDespachado ? 'Solo lo despachado' : 'La serie entera',
        status === '—' ? 'sin status' : status ? `status ${estados.data?.find((e) => e.codigo === status)?.nombre ?? status}` : '',
        busca.trim() ? `búsqueda «${busca.trim()}»` : '',
      ]
        .filter(Boolean)
        .join(' · ')
      setPapel(
        await armarControlDeDespacho({
          empresa: { razonSocial: empresa?.razon_social ?? '', rif: empresa?.rif ?? '' },
          emitidoPor: yo?.nombre ?? '',
          momento: new Date(),
          desde: desde || null,
          hasta: hasta || null,
          alcance,
          columnaLibre,
          filas: paraSacar,
        }),
      )
    } catch (e) {
      setFalloPapel(e)
    } finally {
      setArmando(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Control de despacho"
        actions={
          <>
            {puedeAjustar ? (
              <Button variant="ghost" icon={<Settings2 />} onClick={() => setAjustes(true)}>
                Status y columna
              </Button>
            ) : null}
            {puedeEscribir ? (
              <Button variant="ghost" icon={<Upload />} onClick={() => setCargando(true)}>
                Cargar desde Excel
              </Button>
            ) : null}
            <Button variant="outline" icon={<FileSpreadsheet />} disabled={filas.length === 0} onClick={bajarHoja}>
              Excel{elegidas.length > 0 ? ` (${elegidas.length})` : ''}
            </Button>
            <Button variant="outline" icon={<FileText />} disabled={filas.length === 0 || armando} onClick={() => void verPapel()}>
              {armando ? 'Armando…' : `PDF${elegidas.length > 0 ? ` (${elegidas.length})` : ''}`}
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

      {falloPapel ? <ErrorDeCarga error={falloPapel} /> : null}

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
            {elegidas.length > 0 ? (
              <span className="text-royal-700 font-medium">
                {elegidas.length} marcada{elegidas.length === 1 ? '' : 's'}: el Excel y el PDF llevan solo esas ·{' '}
                <button type="button" className="underline" onClick={() => setMarcadas(new Set())}>
                  quitar marcas
                </button>
              </span>
            ) : null}
          </div>

          <Card flush>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-sm">
                <thead>
                  <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                    <th className="py-3 pr-1 pl-4">
                      <input
                        type="checkbox"
                        aria-label="Marcar todas las que se ven"
                        className="accent-royal-600 size-4 align-middle"
                        checked={todasMarcadas}
                        onChange={() => setMarcadas(todasMarcadas ? new Set() : new Set(filas.map((f) => f.clave)))}
                      />
                    </th>
                    <th className="px-3 py-3 font-medium"># Nota</th>
                    {/*
                      La única columna que ordena, y se dice sola.

                      La flecha no aparece al pasar por encima: está siempre,
                      porque también es la que cuenta cómo está ordenada la
                      lista ahora mismo. Una cabecera que solo se delata al
                      acercarle el ratón no la encuentra quien no la busca.
                    */}
                    <th className="px-3 py-3 font-medium">
                      <button
                        type="button"
                        onClick={() => setOrden((o) => (o === 'ASC' ? 'DESC' : 'ASC'))}
                        aria-label={
                          orden === 'ASC'
                            ? 'Ordenado de la fecha más vieja a la más nueva. Pulsa para darle la vuelta.'
                            : 'Ordenado de la fecha más nueva a la más vieja. Pulsa para darle la vuelta.'
                        }
                        className="text-ink/45 hover:text-ink/85 focus-visible:outline-royal-600 -mx-1 -my-0.5 flex items-center gap-1 rounded-[4px] px-1 py-0.5 font-medium transition-colors focus-visible:outline-2"
                      >
                        Fecha
                        {orden === 'ASC' ? (
                          <ArrowUp className="size-3.5 shrink-0" />
                        ) : (
                          <ArrowDown className="size-3.5 shrink-0" />
                        )}
                      </button>
                    </th>
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
                    const ruta = rutaDeLaNota(f)
                    const puedeIr = ruta !== null && puede(moduloDeRuta(ruta.split('?')[0]))
                    return (
                      <tr
                        key={f.clave}
                        onClick={viva && puedeEscribir ? () => setEditando(f) : undefined}
                        className={cn(
                          'border-hairline border-b last:border-0',
                          viva ? (puedeEscribir ? 'hover:bg-ink/3 cursor-pointer transition-colors' : '') : 'text-ink/40 bg-ink/2',
                        )}
                      >
                        <td className="py-2.5 pr-1 pl-4" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Marcar ${f.documento}`}
                            className="accent-royal-600 size-4 align-middle"
                            checked={marcadas.has(f.clave)}
                            onChange={() => marcar(f.clave)}
                          />
                        </td>
                        <td className="tabular px-3 py-2.5 font-medium whitespace-nowrap">
                          {puedeIr && ruta ? (
                            <Link
                              to={ruta}
                              onClick={(e) => e.stopPropagation()}
                              title={f.origen === 'NOTA_ENTREGA' ? 'Ir a la nota de entrega' : 'Ir a la nota de salida'}
                              className="text-royal-700 underline decoration-dotted underline-offset-2 hover:decoration-solid"
                            >
                              {f.documento}
                            </Link>
                          ) : (
                            f.documento
                          )}
                        </td>
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
      {cargando ? (
        <CargaDesdeExcel
          filas={planilla.data ?? []}
          paraLaPlantilla={paraSacar}
          marcadas={elegidas.length}
          estados={estados.data ?? []}
          columnaLibre={columnaLibre}
          nombrePlantilla={`plantilla-${nombreBase}.xlsx`}
          onCerrar={() => setCargando(false)}
        />
      ) : null}
      <Visor
        abierto={papel !== null}
        onCerrar={() => setPapel(null)}
        blob={papel?.blob ?? null}
        nombreArchivo={papel?.nombre ?? 'control-de-despacho.pdf'}
        titulo="Control de despacho"
        descripcion="Revísalo antes de descargarlo o imprimirlo."
      />
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

/* ─────────────────────────────────────────────────── la carga desde Excel */

/*
  TRES PASOS, Y EL DEL MEDIO ES EL QUE IMPORTA: antes de guardar se enseña qué
  va a cambiar, fila por fila. Una hoja mal pegada —una columna corrida, un
  filtro que desordenó— se ve aquí y no después, con cuarenta precios cambiados.

  Se guarda todo o nada. Si la hoja trae un error, no se ofrece guardar: se
  corrige la hoja y se vuelve a subir.
*/
function CargaDesdeExcel({
  filas,
  paraLaPlantilla,
  marcadas,
  estados,
  columnaLibre,
  nombrePlantilla,
  onCerrar,
}: {
  filas: FilaDeControl[]
  paraLaPlantilla: FilaDeControl[]
  marcadas: number
  estados: EstadoDeControl[]
  columnaLibre: string
  nombrePlantilla: string
  onCerrar: () => void
}) {
  const cargar = useCargarControlDeDespacho()
  const selector = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState('')
  const [leida, setLeida] = useState<CargaInterpretada | null>(null)
  const [fallo, setFallo] = useState<unknown>(null)
  const [guardadas, setGuardadas] = useState<number | null>(null)

  const vigentes = paraLaPlantilla.filter((f) => f.estado_doc === 'VIGENTE').length

  const leer = async (f: File | undefined) => {
    if (!f) return
    setArchivo(f.name)
    setLeida(null)
    setFallo(null)
    setGuardadas(null)
    cargar.reset()
    try {
      setLeida(interpretarCarga(await leerHoja(f), filas, estados, columnaLibre))
    } catch (e) {
      setFallo(e)
    }
  }

  const sePuede = leida !== null && leida.errores.length === 0 && leida.cambios.length > 0

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Cargar desde Excel"
      descripcion="Para llenar muchas filas de una vez: RIF, precio, status, observaciones y la columna libre. El número, la fecha, el cliente, el material y la cantidad siguen viniendo de las notas y no se cargan."
      acciones={
        guardadas !== null ? (
          <Button onClick={onCerrar}>Listo</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button
              disabled={!sePuede || cargar.isPending}
              onClick={() =>
                cargar.mutate(
                  (leida?.cambios ?? []).map((c) => c.paraGuardar),
                  { onSuccess: (n) => setGuardadas(n) },
                )
              }
            >
              {cargar.isPending ? 'Guardando…' : sePuede ? `Guardar ${leida.cambios.length} fila${leida.cambios.length === 1 ? '' : 's'}` : 'Guardar'}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-5 text-sm">
        <div>
          <p className="text-ink/90 font-medium">1. Baja la plantilla</p>
          <p className="text-ink/60 mt-1">
            Trae {marcadas > 0 ? `las ${vigentes} filas marcadas` : `los ${vigentes} despachos que se ven en pantalla`}, con lo que
            ya tengan escrito. Las columnas de cabecera roja clara son las que se llenan. No toques la columna CLAVE: es lo
            que ata cada fila a la suya.
          </p>
          <Button
            className="mt-2"
            size="sm"
            variant="outline"
            icon={<Download />}
            disabled={vigentes === 0}
            onClick={() => bajarArchivo(escribirXlsx(plantillaDeCarga(paraLaPlantilla, columnaLibre)), nombrePlantilla)}
          >
            Descargar plantilla
          </Button>
        </div>

        <div>
          <p className="text-ink/90 font-medium">2. Llénala en Excel y súbela</p>
          <p className="text-ink/60 mt-1">
            Lo que subas es cómo queda la fila: una celda vacía borra lo que había. El status tiene que ser uno de la lista
            {estados.some((e) => e.activo) ? ` (${estados.filter((e) => e.activo).map((e) => e.nombre).join(', ')})` : ''}.
          </p>
          <input
            ref={selector}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(e) => {
              void leer(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <div className="mt-2 flex items-center gap-3">
            <Button size="sm" variant="outline" icon={<Upload />} onClick={() => selector.current?.click()}>
              Elegir archivo
            </Button>
            {archivo ? <span className="text-ink/50 truncate">{archivo}</span> : null}
          </div>
        </div>

        {fallo ? <ErrorDeCarga error={fallo} /> : null}

        {leida && guardadas === null ? (
          <div>
            <p className="text-ink/90 font-medium">3. Revisa antes de guardar</p>
            <p className="text-ink/60 mt-1">
              {leida.cambios.length} fila{leida.cambios.length === 1 ? '' : 's'} con cambios · {leida.iguales} igual
              {leida.iguales === 1 ? '' : 'es'} a como están
              {leida.errores.length > 0 ? ` · ${leida.errores.length} con error` : ''}
            </p>

            {leida.errores.length > 0 ? (
              <div className="border-warning/40 bg-warning/5 rounded-card mt-2 border p-3">
                <p className="text-warning font-medium">No se guarda nada hasta que la hoja venga sin errores:</p>
                <ul className="text-ink/70 mt-1 list-disc space-y-0.5 pl-5">
                  {leida.errores.slice(0, 12).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                  {leida.errores.length > 12 ? <li>…y {leida.errores.length - 12} más.</li> : null}
                </ul>
              </div>
            ) : null}

            {leida.cambios.length > 0 ? (
              <ul className="divide-hairline border-hairline rounded-card mt-2 max-h-64 divide-y overflow-y-auto border">
                {leida.cambios.map((c) => (
                  <li key={c.fila.clave} className="px-3 py-2">
                    <span className="tabular font-medium">{c.fila.documento}</span>
                    <span className="text-ink/50">
                      {' '}
                      · {c.fila.cliente} · {c.fila.material}
                    </span>
                    <span className="text-ink/70 block text-xs">{c.resumen.join(' · ')}</span>
                  </li>
                ))}
              </ul>
            ) : leida.errores.length === 0 ? (
              <p className="text-ink/50 mt-2">La hoja dice lo mismo que el sistema: no hay nada que guardar.</p>
            ) : null}
          </div>
        ) : null}

        {guardadas !== null ? (
          <p className="text-success font-medium">
            Se guardaron {guardadas} fila{guardadas === 1 ? '' : 's'}.
          </p>
        ) : null}
        {cargar.error ? <ErrorDeCarga error={cargar.error} /> : null}
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
