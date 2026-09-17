/*
  PLANTAS Y RUTAS

  Christopher, 16/09/2026: «¿Qué pasa si mañana cierra o abre una nueva planta y
  que ésta ofrezca iguales o nuevos procesos? (ej. que la gobernación o
  cualquier posible aliado ceda o transfiera o desee incluirse en el proceso)».

  Hasta ese día la respuesta era «hay que programarlo»: la planta no existía, y
  los tramos por los que se pagaban los viajes eran tres valores escritos en la
  base. Esta pantalla es la respuesta nueva, y por eso todo en ella tiene fecha:

    - un sitio se abre y se cierra, y cerrado deja de ofrecerse sin que sus
      viajes desaparezcan;
    - quién lo opera cambia desde un día —una cesión, una transferencia, un
      aliado que entra— y lo de antes queda en la historia;
    - una ruta lleva las tarifas que haga falta, cada una desde su fecha. «Para
      una nueva planta o proceso puede llegar a existir 1 o más viajes con 1 o
      más tarifas involucradas».

  Nada se borra. Lo que cambia se anota encima, con motivo.
*/
import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, Factory, History, Pencil, Plus, Route, Truck } from 'lucide-react'
import { Ayuda } from '@/components/Ayuda'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { ConversionDeCantidad } from '@/components/ConversionDeCantidad'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import {
  TIPO_DE_SITIO,
  tarifaEnPalabras,
  useCederSitio,
  useCerrarSitio,
  useFijarTarifaRuta,
  useGuardarRuta,
  useGuardarSitio,
  useLoQueLeFaltaALosSitios,
  useOperadoresDeSitio,
  useQueHayEnSitio,
  useQueImpideCerrarSitio,
  useReabrirSitio,
  useRutasAcarreo,
  useSitiosDeOperacion,
  useTarifasDeRuta,
  type RutaAcarreo,
  type SitioDeOperacion,
  type TipoDeSitio,
} from '@/lib/api/acarreos'
import { useAlmacenes, usePropietarios } from '@/lib/api/inventario'
import { useArticulos } from '@/lib/api/catalogo'
import { useEmpleados } from '@/lib/api/nomina'
import { useMisAcciones } from '@/lib/api/usuarios'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { dolares, fecha as fmtFecha } from '@/lib/formato'

export function Plantas() {
  const sitios = useSitiosDeOperacion()
  const rutas = useRutasAcarreo()
  const faltas = useLoQueLeFaltaALosSitios()
  const { puede: tieneCasilla } = useMisAcciones()
  const gestiona = tieneCasilla('EXPLOTACION.GESTIONAR_SITIOS')
  const tarifa = tieneCasilla('EXPLOTACION.FIJAR_TARIFAS')
  const veDinero = tieneCasilla('EXPLOTACION.VER_PAGO_VIAJES')

  const [editandoSitio, setEditandoSitio] = useState<SitioDeOperacion | 'nuevo' | null>(null)
  const [cerrando, setCerrando] = useState<SitioDeOperacion | null>(null)
  const [operador, setOperador] = useState<SitioDeOperacion | null>(null)
  const [editandoRuta, setEditandoRuta] = useState<RutaAcarreo | 'nueva' | null>(null)
  const [tarifas, setTarifas] = useState<RutaAcarreo | null>(null)
  const reabrir = useReabrirSitio()

  const listaSitios = sitios.data ?? []
  const listaRutas = rutas.data ?? []

  return (
    <>
      <PageHeader
        title="Plantas y rutas"
        description="Las minas, plantas, patios y bases de la operación, quién opera cada uno y las rutas entre ellos con lo que se paga por viaje. Abrir, cerrar o ceder un sitio se hace aquí, con fecha, y no borra su historia."
        actions={
          <>
            <Link to="/app/explotacion/viajes">
              <Button variant="outline" icon={<Truck />}>
                Viajes de camiones
              </Button>
            </Link>
            {gestiona ? (
              <Button variant="outline" icon={<Plus />} onClick={() => setEditandoSitio('nuevo')}>
                Nuevo sitio
              </Button>
            ) : null}
            {tarifa ? (
              <Button icon={<Route />} onClick={() => setEditandoRuta('nueva')}>
                Nueva ruta
              </Button>
            ) : null}
          </>
        }
      />

      {/* ─────────────────────────────────────────────────────────── sitios */}
      <section className="mb-8">
        <h2 className="text-ink/85 font-titular mb-1 text-lg">Sitios</h2>
        <Ayuda>
          <p className="text-ink/50 mb-3 max-w-3xl text-xs leading-relaxed">
            Cada sitio dice quién lo opera —la empresa, la gobernación o un aliado— y desde cuándo.
            El responsable es quien aprueba los viajes que salen de él o llegan a él. Un sitio
            cerrado deja de ofrecerse para viajes nuevos desde su fecha de cierre.
          </p>
        </Ayuda>

        {sitios.isPending ? <Cargando /> : null}
        {sitios.error ? <ErrorDeCarga error={sitios.error} /> : null}

        {sitios.data && listaSitios.length === 0 ? (
          <Card>
            <Vacio
              icono={<Factory />}
              titulo="Todavía no hay sitios"
              descripcion="Una mina, una planta, un patio o una base. Las rutas de los viajes van de un sitio a otro."
            />
          </Card>
        ) : null}

        {listaSitios.length > 0 ? (
          <Card flush>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                    <th className="px-5 py-3 font-medium">Sitio</th>
                    <th className="px-3 py-3 font-medium">Qué es</th>
                    <th className="px-3 py-3 font-medium">Lo opera</th>
                    <th className="px-3 py-3 font-medium">Responsable</th>
                    <th className="px-3 py-3 font-medium">Patio de inventario</th>
                    <th className="px-3 py-3 font-medium">Estado</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {listaSitios.map((s) => (
                    <tr key={s.id} className="border-hairline border-b align-top last:border-0">
                      <td className="px-5 py-3">
                        <p className="text-ink/85 font-medium">{s.nombre}</p>
                        <p className="text-ink/45 font-mono text-2xs">{s.codigo}</p>
                        {/* Lo que le falta para operar, dicho por la base. */}
                        {(faltas.data ?? [])
                          .filter((f) => f.sitio_id === s.id)
                          .map((f) => (
                            <p key={`${f.que}-${f.detalle}`} className="text-warning mt-1 max-w-72 text-xs leading-snug">
                              {f.detalle}
                            </p>
                          ))}
                      </td>
                      <td className="text-ink/70 px-3 py-3">{TIPO_DE_SITIO[s.tipo]}</td>
                      <td className="text-ink/75 px-3 py-3">
                        {s.operador_nombre ?? <span className="text-ink/40 italic">Sin operador</span>}
                        {s.operador_desde ? (
                          <span className="text-ink/45 block text-xs">desde el {fmtFecha(s.operador_desde)}</span>
                        ) : null}
                      </td>
                      <td className="text-ink/75 px-3 py-3">
                        {s.responsable ?? (
                          <span className="text-ink/40 text-xs italic">
                            Nadie asignado: sus viajes los aprueba quien tenga la casilla
                          </span>
                        )}
                      </td>
                      <td className="text-ink/70 px-3 py-3">
                        {s.almacen ?? <span className="text-ink/40 text-xs italic">Sin patio</span>}
                      </td>
                      <td className="px-3 py-3">
                        {s.estado === 'ACTIVO' ? (
                          <Chip tone="success">Abierto</Chip>
                        ) : (
                          <>
                            <Chip tone="neutral">Cerrado desde el {fmtFecha(s.cerrado_en!)}</Chip>
                            {s.motivo_cierre ? (
                              <span className="text-ink/45 mt-1 block text-xs">{s.motivo_cierre}</span>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {gestiona ? (
                          <Button size="sm" variant="ghost" icon={<Pencil />} onClick={() => setEditandoSitio(s)}>
                            Editar
                          </Button>
                        ) : null}
                        <Button size="sm" variant="ghost" icon={<History />} onClick={() => setOperador(s)}>
                          {gestiona ? 'Ceder u operador' : 'Historia'}
                        </Button>
                        {gestiona && s.estado === 'ACTIVO' ? (
                          <Button size="sm" variant="ghost" className="text-danger" onClick={() => setCerrando(s)}>
                            Cerrar
                          </Button>
                        ) : null}
                        {gestiona && s.estado === 'CERRADO' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={reabrir.isPending}
                            onClick={() => reabrir.mutate(s.id)}
                          >
                            Reabrir
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
        {reabrir.error ? <ErrorDeCarga error={reabrir.error} className="mt-3" /> : null}
      </section>

      {/* ──────────────────────────────────────────────────────────── rutas */}
      <section>
        <h2 className="text-ink/85 font-titular mb-1 text-lg">Rutas</h2>
        <Ayuda>
          <p className="text-ink/50 mb-3 max-w-3xl text-xs leading-relaxed">
            Por donde se cargan los viajes. Entre los mismos dos sitios puede haber más de una ruta, y
            cada ruta puede tener una tarifa fija, un rango («de 12 a 12,5 $», y cada viaje dice cuánto)
            o precio libre. Una tarifa nueva rige desde su fecha: la anterior queda en la historia y
            los viajes ya cargados no cambian de precio.
          </p>
        </Ayuda>

        {rutas.isPending ? <Cargando /> : null}
        {rutas.error ? <ErrorDeCarga error={rutas.error} /> : null}

        {rutas.data && listaRutas.length === 0 ? (
          <Card>
            <Vacio
              icono={<Route />}
              titulo="Todavía no hay rutas"
              descripcion="Sin rutas no se pueden cargar viajes: cada viaje va por una."
            />
          </Card>
        ) : null}

        {listaRutas.length > 0 ? (
          <Card flush>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                    <th className="px-5 py-3 font-medium">Ruta</th>
                    <th className="px-3 py-3 font-medium">De dónde a dónde</th>
                    <th className="px-3 py-3 font-medium">Se paga hoy</th>
                    <th className="px-3 py-3 font-medium">Estado</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {listaRutas.map((r) => (
                    <tr key={r.id} className="border-hairline border-b align-top last:border-0">
                      <td className="px-5 py-3">
                        <p className="text-ink/85 font-medium">{r.nombre}</p>
                        {r.tramo_anterior ? (
                          <p className="text-ink/45 text-xs">
                            Sustituye a un tramo de antes: sus viajes anteriores cuentan aquí.
                          </p>
                        ) : null}
                      </td>
                      <td className="text-ink/70 px-3 py-3">
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          {r.origen}
                          <ArrowRight className="text-ink/35 size-3.5" />
                          {r.destino}
                        </span>
                      </td>
                      <td className="tabular text-ink/80 px-3 py-3">
                        {r.precio_libre || r.precio_usd !== null ? (
                          tarifaEnPalabras(r, dolares)
                        ) : veDinero ? (
                          <span className="text-warning text-xs">Sin tarifa: no se pueden cargar viajes</span>
                        ) : (
                          <span className="text-ink/30">—</span>
                        )}
                        {r.vigente_desde && !r.precio_libre ? (
                          <span className="text-ink/45 block text-xs">desde el {fmtFecha(r.vigente_desde)}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        {r.se_puede_usar ? (
                          <Chip tone="success">Se usa</Chip>
                        ) : !r.activa ? (
                          <Chip tone="neutral">Apagada</Chip>
                        ) : (
                          <Chip tone="warning">Un sitio está cerrado</Chip>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {tarifa ? (
                          <Button size="sm" variant="ghost" icon={<Pencil />} onClick={() => setEditandoRuta(r)}>
                            Editar
                          </Button>
                        ) : null}
                        {veDinero && !r.precio_libre ? (
                          <Button size="sm" variant="ghost" icon={<History />} onClick={() => setTarifas(r)}>
                            {tarifa ? 'Tarifas' : 'Historia'}
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
      </section>


      {editandoSitio ? (
        <FichaDeSitio
          sitio={editandoSitio === 'nuevo' ? null : editandoSitio}
          onCerrar={() => setEditandoSitio(null)}
        />
      ) : null}
      {cerrando ? <CerrarSitio sitio={cerrando} onCerrar={() => setCerrando(null)} /> : null}
      {operador ? (
        <OperadorDelSitio sitio={operador} puedeCambiar={gestiona} onCerrar={() => setOperador(null)} />
      ) : null}
      {editandoRuta ? (
        <FichaDeRuta
          ruta={editandoRuta === 'nueva' ? null : editandoRuta}
          sitios={listaSitios}
          onCerrar={() => setEditandoRuta(null)}
        />
      ) : null}
      {tarifas ? (
        <TarifasDeRuta ruta={tarifas} puedeFijar={tarifa} onCerrar={() => setTarifas(null)} />
      ) : null}
    </>
  )
}

/* ═════════════════════════════════════════════════════════════════ sitios */

const TIPOS = (Object.keys(TIPO_DE_SITIO) as TipoDeSitio[]).map((t) => ({
  valor: t,
  etiqueta: TIPO_DE_SITIO[t],
}))

function FichaDeSitio({ sitio, onCerrar }: { sitio: SitioDeOperacion | null; onCerrar: () => void }) {
  const guardar = useGuardarSitio()
  const { data: almacenes } = useAlmacenes()
  const { data: empleados } = useEmpleados(true)
  const { data: duenos } = usePropietarios()

  const [codigo, setCodigo] = useState(sitio?.codigo ?? '')
  const [nombre, setNombre] = useState(sitio?.nombre ?? '')
  const [tipo, setTipo] = useState<TipoDeSitio | ''>(sitio?.tipo ?? '')
  const [almacen, setAlmacen] = useState(sitio?.almacen_id ? String(sitio.almacen_id) : '')
  const [responsable, setResponsable] = useState(sitio?.responsable_id ? String(sitio.responsable_id) : '')
  const [desde, setDesde] = useState(sitio?.abierto_desde ?? '')
  const [nota, setNota] = useState(sitio?.nota ?? '')
  const [operador, setOperador] = useState('')

  const nuevo = sitio === null
  const listo =
    nombre.trim().length >= 3 && tipo !== '' && (!nuevo || (codigo.trim().length >= 2 && operador !== ''))

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={nuevo ? 'Nuevo sitio' : `Editar ${sitio.nombre}`}
      descripcion={
        nuevo
          ? 'Una mina, planta, patio o base. Quién lo opera se dice al crearlo; después se cambia con fecha desde «Operador», nunca aquí.'
          : 'Quién lo opera no se cambia aquí: se hace desde «Operador», con fecha y motivo, para que quede la historia.'
      }
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={!listo || guardar.isPending}
            onClick={async () => {
              await guardar.mutateAsync({
                id: sitio?.id ?? null,
                codigo: nuevo ? codigo : null,
                nombre,
                tipo: tipo as TipoDeSitio,
                almacen_id: almacen ? Number(almacen) : null,
                responsable_id: responsable ? Number(responsable) : null,
                abierto_desde: desde || null,
                nota: nota || null,
                operador: nuevo ? operador : null,
              })
              onCerrar()
            }}
          >
            {guardar.isPending ? 'Guardando…' : nuevo ? 'Crear el sitio' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {nuevo ? (
          <Input
            label="Código"
            placeholder="PLANTA-NORTE"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            hint="Corto y sin espacios. No se cambia después."
          />
        ) : null}
        <Input label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <Select
          label="Qué es"
          vacio="Elige el tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoDeSitio)}
          opciones={TIPOS}
        />
        {nuevo ? (
          <Select
            label="Quién lo opera"
            vacio="Elige quién"
            value={operador}
            onChange={(e) => setOperador(e.target.value)}
            opciones={(duenos ?? []).map((d) => ({ valor: d.codigo, etiqueta: d.nombre }))}
            hint="Si es un aliado que no está en la lista, se añade primero en Inventario › Dueños."
          />
        ) : null}
        <Select
          label="Patio de inventario"
          vacio="Sin patio"
          value={almacen}
          onChange={(e) => setAlmacen(e.target.value)}
          opciones={(almacenes ?? []).map((a) => ({ valor: String(a.id), etiqueta: `${a.codigo} · ${a.nombre}` }))}
          hint="Donde queda el material que llega o sale de este sitio."
        />
        <SelectBuscable
          label="Responsable"
          vacio="Nadie por ahora"
          valor={responsable}
          onCambio={(v) => setResponsable(v)}
          hint="Aprueba los viajes que salen de este sitio o llegan a él."
          opciones={(empleados ?? []).map((e) => ({
            valor: String(e.id),
            codigo: e.ficha,
            nombre: `${e.nombres} ${e.apellidos}`,
            detalle: e.cargo,
          }))}
        />
        <Input
          label="Abierto desde"
          type="date"
          max={hoyEnCaracas()}
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          hint="En blanco si no se sabe."
        />
      </div>
      <Textarea className="mt-4" label="Nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
      {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-3" /> : null}
    </Modal>
  )
}

/*
  CERRAR ENSEÑA ANTES LO QUE LA BASE VA A MIRAR.

  Christopher decidió que cerrar con pendientes se bloquea hasta resolverlos, y
  que el patio de una planta cerrada sigue abierto. La lista la calcula la base
  con la misma función que usa para negarse: lo que dice esta ventana y lo que
  hace el botón no se pueden separar.
*/
function CerrarSitio({ sitio, onCerrar }: { sitio: SitioDeOperacion; onCerrar: () => void }) {
  const cerrar = useCerrarSitio()
  const comprobacion = useQueImpideCerrarSitio(sitio.id)
  const [fecha, setFecha] = useState(hoyEnCaracas())
  const [motivo, setMotivo] = useState('')

  const bloquea = (comprobacion.data ?? []).filter((c) => c.nivel === 'BLOQUEA')
  const avisa = (comprobacion.data ?? []).filter((c) => c.nivel === 'AVISA')

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Cerrar ${sitio.nombre}`}
      descripcion="Desde esa fecha no se pueden cargar viajes que salgan de este sitio o lleguen a él. Los viajes de antes se quedan como están, su patio sigue abierto y el sitio se puede reabrir."
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Volver
          </Button>
          <Button
            variant="danger"
            disabled={
              cerrar.isPending ||
              comprobacion.isPending ||
              bloquea.length > 0 ||
              motivo.trim().length < 4 ||
              !fecha
            }
            onClick={async () => {
              await cerrar.mutateAsync({ id: sitio.id, fecha, motivo })
              onCerrar()
            }}
          >
            {cerrar.isPending ? 'Cerrando…' : 'Cerrar el sitio'}
          </Button>
        </>
      }
    >
      {comprobacion.isPending ? <Cargando /> : null}
      {comprobacion.error ? <ErrorDeCarga error={comprobacion.error} /> : null}

      {bloquea.length > 0 ? (
        <div className="border-danger/40 mb-4 rounded-[6px] border p-3">
          <p className="text-danger text-sm font-medium">No se puede cerrar todavía</p>
          <ul className="text-ink/75 mt-1.5 list-disc space-y-1 pl-5 text-sm">
            {bloquea.map((c) => (
              <li key={c.que}>{c.detalle}</li>
            ))}
          </ul>
        </div>
      ) : comprobacion.data ? (
        <p className="text-ink/55 mb-4 text-sm">Nada pendiente impide cerrarlo.</p>
      ) : null}

      {avisa.length > 0 ? (
        <div className="border-hairline mb-4 rounded-[6px] border p-3">
          <p className="text-ink/80 text-sm font-medium">Al cerrarlo, ten presente</p>
          <ul className="text-ink/65 mt-1.5 list-disc space-y-1 pl-5 text-sm">
            {avisa.map((c) => (
              <li key={c.que}>{c.detalle}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Input label="Cerrado desde" type="date" max={hoyEnCaracas()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
      <Textarea className="mt-3" label="Por qué se cierra" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      {cerrar.error ? <ErrorDeCarga error={cerrar.error} className="mt-3" /> : null}
    </Modal>
  )
}

function OperadorDelSitio({
  sitio,
  puedeCambiar,
  onCerrar,
}: {
  sitio: SitioDeOperacion
  puedeCambiar: boolean
  onCerrar: () => void
}) {
  const historia = useOperadoresDeSitio(sitio.id)
  const { data: duenos } = usePropietarios(false)
  const cambiar = useCederSitio()
  const queHay = useQueHayEnSitio(puedeCambiar ? sitio.id : null)
  // Solo por la densidad del material que pasa, que la lista del patio no trae.
  const { data: articulos } = useArticulos(false)
  const [operador, setOperador] = useState('')
  const [desde, setDesde] = useState('')
  const [motivo, setMotivo] = useState('')
  /* Lo marcado para pasar: clave «MATERIAL-articulo-dueño» con su cantidad, o «MAQUINA-id». */
  const [pasa, setPasa] = useState<Record<string, string>>({})

  const nombreDe = (codigo: string) => (duenos ?? []).find((d) => d.codigo === codigo)?.nombre ?? codigo
  const listo = operador !== '' && operador !== sitio.operador && desde !== '' && motivo.trim().length >= 4

  /* Solo se ofrece lo que hoy es de otro: lo que ya es del nuevo operador no tiene que pasar. */
  const cedible = (queHay.data ?? []).filter((x) => operador !== '' && x.propietario !== operador)
  const claveDe = (x: { tipo: string; id: number; propietario: string }) =>
    x.tipo === 'MATERIAL' ? `MATERIAL-${x.id}-${x.propietario}` : `MAQUINA-${x.id}`
  const marcados = cedible.filter((x) => pasa[claveDe(x)] !== undefined)
  const cantidadesBien = marcados
    .filter((x) => x.tipo === 'MATERIAL')
    .every((x) => {
      const n = Number(pasa[claveDe(x)])
      return n > 0 && n <= Number(x.cantidad)
    })

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Quién opera ${sitio.nombre}`}
      descripcion="Ceder, transferir o sumar un aliado es cambiar el operador desde una fecha. El de antes queda en la historia hasta el día anterior. El material del patio y las máquinas ubicadas ahí solo pasan si se marcan."
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cerrar
          </Button>
          {puedeCambiar ? (
            <Button
              disabled={!listo || !cantidadesBien || cambiar.isPending}
              onClick={async () => {
                await cambiar.mutateAsync({
                  id: sitio.id,
                  operador,
                  desde,
                  motivo,
                  material: marcados
                    .filter((x) => x.tipo === 'MATERIAL')
                    .map((x) => ({ articulo_id: x.id, de: x.propietario, cantidad: Number(pasa[claveDe(x)]) })),
                  maquinas: marcados.filter((x) => x.tipo === 'MAQUINA').map((x) => x.id),
                })
                setOperador('')
                setDesde('')
                setMotivo('')
                setPasa({})
              }}
            >
              {cambiar.isPending
                ? 'Guardando…'
                : marcados.length > 0
                  ? `Ceder, con ${marcados.length} ${marcados.length === 1 ? 'cosa' : 'cosas'} marcadas`
                  : 'Cambiar el operador'}
            </Button>
          ) : null}
        </>
      }
    >
      {historia.isPending ? <Cargando /> : null}
      {historia.error ? <ErrorDeCarga error={historia.error} /> : null}
      <ul className="divide-hairline mb-4 divide-y text-sm">
        {(historia.data ?? []).map((o) => (
          <li key={o.id} className="py-2">
            <p className="text-ink/85">
              {nombreDe(o.propietario)}{' '}
              <span className="text-ink/50 text-xs">
                desde el {fmtFecha(o.desde)}
                {o.hasta ? ` hasta el ${fmtFecha(o.hasta)}` : ' · hoy'}
              </span>
            </p>
            {o.motivo ? <p className="text-ink/45 text-xs">{o.motivo}</p> : null}
          </li>
        ))}
      </ul>

      {puedeCambiar ? (
        <div className="border-hairline rounded-[6px] border border-dashed p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Nuevo operador"
              vacio="Elige quién"
              value={operador}
              onChange={(e) => setOperador(e.target.value)}
              opciones={(duenos ?? [])
                .filter((d) => d.activo && d.codigo !== sitio.operador)
                .map((d) => ({ valor: d.codigo, etiqueta: d.nombre }))}
              hint="Un aliado nuevo se añade primero en Inventario › Dueños."
            />
            <Input label="Lo opera desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <Textarea
            className="mt-3"
            label="Por qué cambia"
            placeholder="Cesión de la gobernación según acta del…"
            rows={2}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />

          {/*
            QUÉ PASA CON LO QUE HAY. Christopher decidió que se pregunte en cada
            cesión: nada pasa solo. Lo marcado cambia de dueño con su asiento en
            el libro, el mismo día de la cesión; lo demás sigue siendo de quien es.
          */}
          {operador !== '' ? (
            <div className="mt-4">
              <p className="text-ink/80 text-sm font-medium">
                ¿Pasa algo de lo que hay con el nuevo operador?
              </p>
              <p className="text-ink/50 mt-0.5 text-xs">
                Lo que no marques sigue siendo de quien es hoy. Lo marcado cambia de dueño el día de la
                cesión, así que esa fecha no puede ser futura. El material pide Inventario total; las
                máquinas, Maquinaria en escritura.
              </p>
              {queHay.isPending ? <Cargando /> : null}
              {queHay.error ? <ErrorDeCarga error={queHay.error} className="mt-2" /> : null}
              {queHay.data && cedible.length === 0 ? (
                <p className="text-ink/45 mt-2 text-xs italic">
                  {sitio.almacen
                    ? 'En su patio no hay material ni máquinas de otro dueño.'
                    : 'Este sitio no tiene patio: no hay material ni máquinas que pasar.'}
                </p>
              ) : null}
              <ul className="divide-hairline mt-2 divide-y text-sm">
                {cedible.map((x) => {
                  const clave = claveDe(x)
                  const marcado = pasa[clave] !== undefined
                  return (
                    <li key={clave} className="flex flex-wrap items-center gap-3 py-2">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                        <input
                          type="checkbox"
                          className="accent-royal-600 mt-0.5 size-4 shrink-0"
                          checked={marcado}
                          onChange={(e) =>
                            setPasa((v) => {
                              const nuevo = { ...v }
                              if (e.target.checked) nuevo[clave] = x.tipo === 'MATERIAL' ? String(Number(x.cantidad)) : ''
                              else delete nuevo[clave]
                              return nuevo
                            })
                          }
                        />
                        <span className="text-ink/80">
                          {x.tipo === 'MAQUINA' ? 'Máquina: ' : ''}
                          {x.nombre}
                          <span className="text-ink/45 block text-xs">
                            {x.tipo === 'MATERIAL'
                              ? `${Number(x.cantidad).toLocaleString('es-VE')} ${x.unidad ?? ''} de ${nombreDe(x.propietario)}`
                              : `${x.codigo} · de ${nombreDe(x.propietario)}`}
                          </span>
                        </span>
                      </label>
                      {marcado && x.tipo === 'MATERIAL' ? (
                        <div className="w-48">
                          <Input
                            label="Cuánto pasa"
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={pasa[clave]}
                            onChange={(e) => setPasa((v) => ({ ...v, [clave]: e.target.value }))}
                          />
                          <ConversionDeCantidad
                            cantidad={pasa[clave]}
                            unidad={x.unidad}
                            densidad={articulos?.find((a) => a.id === x.id)?.densidad_ton_m3}
                          />
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {cambiar.error ? <ErrorDeCarga error={cambiar.error} className="mt-3" /> : null}
    </Modal>
  )
}

/* ══════════════════════════════════════════════════════════════════ rutas */

function FichaDeRuta({
  ruta,
  sitios,
  onCerrar,
}: {
  ruta: RutaAcarreo | null
  sitios: SitioDeOperacion[]
  onCerrar: () => void
}) {
  const guardar = useGuardarRuta()
  const [origen, setOrigen] = useState(ruta ? String(ruta.origen_id) : '')
  const [destino, setDestino] = useState(ruta ? String(ruta.destino_id) : '')
  const [nombre, setNombre] = useState(ruta?.nombre ?? '')
  const [libre, setLibre] = useState(ruta?.precio_libre ?? false)
  const [activa, setActiva] = useState(ruta?.activa ?? true)
  const [nota, setNota] = useState(ruta?.nota ?? '')

  const opciones = sitios.map((s) => ({
    valor: String(s.id),
    etiqueta: `${s.nombre} · ${TIPO_DE_SITIO[s.tipo]}${s.estado === 'CERRADO' ? ' (cerrado)' : ''}`,
  }))
  const listo = origen !== '' && destino !== '' && origen !== destino

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={ruta ? `Editar ${ruta.nombre}` : 'Nueva ruta'}
      descripcion={
        ruta
          ? 'Una ruta con viajes no cambia de origen ni de destino: se apaga y se crea otra. La tarifa se pone aparte, en «Tarifas».'
          : 'De un sitio a otro. Después de crearla hay que ponerle tarifa, salvo que sea de precio libre.'
      }
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={!listo || guardar.isPending}
            onClick={async () => {
              await guardar.mutateAsync({
                id: ruta?.id ?? null,
                nombre: nombre.trim() || null,
                origen_id: Number(origen),
                destino_id: Number(destino),
                precio_libre: libre,
                activa,
                nota: nota || null,
              })
              onCerrar()
            }}
          >
            {guardar.isPending ? 'Guardando…' : ruta ? 'Guardar' : 'Crear la ruta'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Sale de" vacio="Elige el sitio" value={origen} onChange={(e) => setOrigen(e.target.value)} opciones={opciones} />
        <Select
          label="Llega a"
          vacio="Elige el sitio"
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          opciones={opciones.filter((o) => o.valor !== origen)}
        />
      </div>
      <Input
        className="mt-4"
        label="Nombre"
        placeholder="En blanco: «ORIGEN → DESTINO»"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        hint="Útil cuando hay dos rutas entre los mismos sitios (por material, o por tipo de camión)."
      />
      <label className="border-hairline mt-4 flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm">
        <input
          type="checkbox"
          className="accent-royal-600 mt-0.5 size-4 shrink-0"
          checked={libre}
          onChange={(e) => setLibre(e.target.checked)}
        />
        <span className="text-ink/80">
          Precio libre
          <span className="text-ink/50 mt-0.5 block text-xs">
            No lleva tarifa: quien carga el viaje dice cuánto se paga. Es lo que se hace con la coraza,
            que se cuadra con el pedido.
          </span>
        </span>
      </label>
      {ruta ? (
        <label className="border-hairline mt-2 flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm">
          <input
            type="checkbox"
            className="accent-royal-600 mt-0.5 size-4 shrink-0"
            checked={activa}
            onChange={(e) => setActiva(e.target.checked)}
          />
          <span className="text-ink/80">
            Encendida
            <span className="text-ink/50 mt-0.5 block text-xs">
              Apagada no se ofrece para viajes nuevos. Sus viajes de antes se quedan.
            </span>
          </span>
        </label>
      ) : null}
      <Textarea className="mt-4" label="Nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
      {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-3" /> : null}
    </Modal>
  )
}

function TarifasDeRuta({
  ruta,
  puedeFijar,
  onCerrar,
}: {
  ruta: RutaAcarreo
  puedeFijar: boolean
  onCerrar: () => void
}) {
  const historia = useTarifasDeRuta(ruta.id)
  const fijar = useFijarTarifaRuta()
  const [precio, setPrecio] = useState('')
  const [enRango, setEnRango] = useState(false)
  const [hasta, setHasta] = useState('')
  const [desde, setDesde] = useState(hoyEnCaracas())
  const [nota, setNota] = useState('')

  const listo =
    precio !== '' && Number(precio) >= 0 && desde !== '' && (!enRango || Number(hasta) > Number(precio))

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Tarifas de ${ruta.nombre}`}
      descripcion="Una tarifa rige desde su fecha hasta que otra la sustituye. Los viajes ya cargados llevan copiado su precio y no cambian."
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cerrar
          </Button>
          {puedeFijar ? (
            <Button
              disabled={!listo || fijar.isPending}
              onClick={async () => {
                await fijar.mutateAsync({
                  ruta_id: ruta.id,
                  precio: Number(precio),
                  precio_hasta: enRango ? Number(hasta) : null,
                  desde,
                  nota: nota || null,
                })
                setPrecio('')
                setHasta('')
                setNota('')
              }}
            >
              {fijar.isPending ? 'Guardando…' : 'Poner la tarifa'}
            </Button>
          ) : null}
        </>
      }
    >
      {historia.isPending ? <Cargando /> : null}
      {historia.error ? <ErrorDeCarga error={historia.error} /> : null}
      {historia.data && historia.data.length === 0 ? (
        <p className="text-warning mb-4 text-sm">Esta ruta todavía no tiene tarifa: no se le pueden cargar viajes.</p>
      ) : null}
      <ul className="divide-hairline mb-4 divide-y text-sm">
        {(historia.data ?? []).map((t) => (
          <li key={t.id} className="py-2">
            <p className="tabular text-ink/85">
              {t.precio_hasta_usd ? `De ${dolares(t.precio_usd)} a ${dolares(t.precio_hasta_usd)}` : dolares(t.precio_usd)}{' '}
              <span className="text-ink/50 text-xs">desde el {fmtFecha(t.vigente_desde)}</span>
            </p>
            {t.nota ? <p className="text-ink/45 text-xs">{t.nota}</p> : null}
          </li>
        ))}
      </ul>

      {puedeFijar ? (
        <div className="border-hairline rounded-[6px] border border-dashed p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label={enRango ? 'Desde (USD)' : 'Precio por viaje (USD)'}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
            />
            {enRango ? (
              <Input
                label="Hasta (USD)"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
              />
            ) : null}
            <Input label="Rige desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              className="accent-royal-600 mt-0.5 size-4 shrink-0"
              checked={enRango}
              onChange={(e) => setEnRango(e.target.checked)}
            />
            <span className="text-ink/80">
              Es un rango
              <span className="text-ink/50 mt-0.5 block text-xs">
                Cada viaje dirá cuánto se paga dentro del rango.
              </span>
            </span>
          </label>
          <Textarea className="mt-3" label="Nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
      ) : null}
      {fijar.error ? <ErrorDeCarga error={fijar.error} className="mt-3" /> : null}
    </Modal>
  )
}
