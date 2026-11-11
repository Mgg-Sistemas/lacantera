import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Plus, Warehouse } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_SITIOS } from '@/components/pestanasDeModulos'
import { DeQuienEs } from '@/components/DeQuienEs'
import { Visor } from '@/components/Visor'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Segmento } from '@/components/ui/Segmento'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import {
  TIPOS_ALMACEN,
  guardaMaterial,
  useAlmacenes,
  useExistencias,
  useGuardarAlmacen,
  useAsignarAlmacenPadre,
  enArbol,
  usePropietarios,
} from '@/lib/api/inventario'
import type { Almacen, Existencia } from '@/lib/api/inventario'
import {
  FUERA_DE_VALORES,
  VALOR_VACIO,
  useQueImpideDesactivarAlmacen,
  valoresPorAlmacen,
} from '@/lib/api/almacenesValor'
import { useCategoriasDeInventario } from '@/lib/api/catalogo'
import { useEmpresa } from '@/lib/api/empresa'
import { useEmpleados } from '@/lib/api/nomina'
import { useMisAcciones, useMisPermisos } from '@/lib/api/usuarios'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { armarReporteGeneral } from '@/lib/ficha/reporteAlmacen'
import { dolares, enteros } from '@/lib/formato'
import { useSesion } from '@/lib/sesion'
import { cn } from '@/lib/cn'
import { DetalleAlmacen } from './almacenes/DetalleAlmacen'
import { ModalConsumoAlmacen } from './almacenes/ModalConsumoAlmacen'
import { ModalReporteAlmacen } from './almacenes/ModalReporteAlmacen'
import { cantidad, guardarVista, leerVista, productos, renglonesDeReporte } from './almacenes/comun'

/*
  ▣ ALMACENES COMO MGG (fase 6, 08/11/2026)

  La pantalla de almacenes de MGG (`AlmacenesView.tsx`, archivo 1 §3-4 del
  spec `mgg-inventario`) con lo que La Cantera ya tenía:
  - «▦ Kanban» / «☰ Lista». Cada almacén con «VALOR TOTAL» y «{n} producto(s)
    · {n} und.», y sus botones 📄 (reporte), 📊 (consumo), ✎ (el formulario de
    siempre) y ✕ (desactivar, con lo que la base dice que lo impide).
  - Se quedan Tipo, Dueño, Responsable y «Recibe compras»: son de La Cantera y
    MGG no los tiene.
  - La tarjeta de un taller lleva a Talleres, donde viven sus órdenes.
  - Tocar un almacén abre su detalle (`?almacen=ID`, sin ruta nueva).

  Lo que no se copia: sedes, subalmacenes y ubicación física (no existen aquí y
  no hay migración en esta fase), y eliminar un almacén (aquí se desactiva: su
  libro no se borra).

  Combustible no se toca: los tanques siguen en «☰ Lista», donde estaban, pero
  fuera de los valores, del kanban, del reporte y del consumo. «En tránsito» ya
  no se listaba (lo esconde `useAlmacenes`).
*/

type Vista = 'kanban' | 'lista'
const CLAVE_VISTA = 'lacantera.almacenes.vista'

const vacio = {
  codigo: '',
  nombre: '',
  tipo: 'ALMACEN',
  ubicacion: '',
  recibe_compras: false,
  activo: true,
  propietario: 'LACANTERA',
  responsable_id: '',
  capacidad: '',
  trabajos_a_la_vez: '',
  /** Subalmacén de MGG (11/11/2026): el almacén del que cuelga; vacío = principal. */
  padre_id: '',
}

/** Los que no entran en los valores ni en el kanban. */
const fuera = (a: Almacen) => FUERA_DE_VALORES.includes(a.tipo)

/** Un patio de máquinas no guarda material: no tiene valor, ni reporte, ni consumo. */
const conMaterial = (a: Almacen) => !fuera(a) && guardaMaterial(a.tipo)

export function Almacenes() {
  const navegar = useNavigate()
  const [params, setParams] = useSearchParams()

  // `true` al final: esta es la pantalla donde se administran, así que aquí
  // sí aparecen los sitios que no guardan material.
  const { data, isPending, error } = useAlmacenes(false, true)
  const guardar = useGuardarAlmacen()
  const asignarPadre = useAsignarAlmacenPadre()
  const nombreDelAlmacen = (id?: number | null) => (data ?? []).find((x) => x.id === id)?.nombre ?? null
  const { data: propietarios } = usePropietarios()
  const { data: empleados } = useEmpleados(true)
  const existenciasQ = useExistencias()
  const { data: categorias } = useCategoriasDeInventario()
  const { data: empresa } = useEmpresa()
  const { nombre: yo } = useSesion()
  const [edicion, setEdicion] = useState<(typeof vacio & { id?: number }) | null>(null)

  /*
    Quién ve ✎, ✕ y «+ Agregar almacén»: quien escribe en Inventario o tiene
    la casilla «Crear y corregir los sitios». La base vuelve a comprobarlo.
  */
  const { puede: alcanza } = useMisPermisos()
  const { puede: puedeAccion } = useMisAcciones()
  const escribe = alcanza('INVENTARIO', 'ESCRITURA') || puedeAccion('INVENTARIO.GUARDAR_ALMACEN')

  const [vista, setVistaEstado] = useState<Vista>(() => leerVista(CLAVE_VISTA, 'kanban', ['kanban', 'lista']))
  const setVista = (v: Vista) => {
    setVistaEstado(v)
    guardarVista(CLAVE_VISTA, v)
  }
  const [reporteDe, setReporteDe] = useState<Almacen | null>(null)
  const [consumoDe, setConsumoDe] = useState<Almacen | null>(null)
  const [desactivando, setDesactivando] = useState<Almacen | null>(null)
  const [general, setGeneral] = useState<ArchivoArmado | null>(null)
  const [armandoGeneral, setArmandoGeneral] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState<unknown>(null)

  const abrir = (a?: Almacen) => {
    // Un error de antes (un ✓ que la base negó) no se arrastra al formulario.
    guardar.reset()
    setEdicion(
      a
        ? {
            id: a.id,
            codigo: a.codigo,
            nombre: a.nombre,
            tipo: a.tipo,
            ubicacion: a.ubicacion ?? '',
            recibe_compras: a.recibe_compras,
            activo: a.activo,
            propietario: a.propietario ?? 'LACANTERA',
            responsable_id: a.responsable_id ? String(a.responsable_id) : '',
            capacidad: a.capacidad ?? '',
            trabajos_a_la_vez: a.trabajos_a_la_vez ? String(a.trabajos_a_la_vez) : '',
            padre_id: a.padre_id ? String(a.padre_id) : '',
          }
        : { ...vacio },
    )
  }

  const cambiar = (c: Partial<typeof vacio>) => setEdicion((e) => (e ? { ...e, ...c } : e))

  /* Solo los activos vienen del gancho: quien lleve un almacén y ya no trabaje
     aquí sale como «Sin asignar», que es la verdad —nadie responde— y no un
     nombre que ya no se puede llamar. */
  const nombreDe = (id?: number | null) => {
    const e = (empleados ?? []).find((x) => x.id === id)
    return e ? `${e.nombres} ${e.apellidos}` : null
  }

  const etiquetaDeCategoria = useMemo(() => {
    const mapa = new Map((categorias ?? []).map((c) => [c.codigo, c.etiqueta]))
    return (codigo: string) => mapa.get(codigo) ?? codigo
  }, [categorias])

  const tipoDe = (a: Almacen) => TIPOS_ALMACEN.find((t) => t.valor === a.tipo)?.etiqueta ?? a.tipo

  // ------------------------------------------------------------ valores
  const existencias = useMemo(
    () => (existenciasQ.data ?? []).filter((e) => !FUERA_DE_VALORES.includes(e.almacen_tipo ?? '')),
    [existenciasQ.data],
  )
  const valores = useMemo(() => valoresPorAlmacen(existencias), [existencias])
  const filasDe = (id: number): Existencia[] => existencias.filter((e) => e.almacen_id === id)
  /*
    El valor llega NULO a quien no tiene INVENTARIO.VER_VALORACION (la vista lo
    anula en la base). Sin valor visible, «VALOR TOTAL» dice «—» y no $ 0,00.
  */
  const veValor = existencias.length === 0 || existencias.some((e) => e.valor_usd !== null)

  const kanban = useMemo(
    () =>
      enArbol((data ?? []).filter((a) => !fuera(a)))
        .map((x) => x.a)
        .sort((a, b) => Number(b.activo) - Number(a.activo)),
    [data],
  )
  const tanques = (data ?? []).filter(fuera).length
  const valorTotal = kanban
    .filter((a) => a.activo)
    .reduce((s, a) => s + (valores.get(a.id) ?? VALOR_VACIO).valor, 0)

  // ----------------------------------------------------------- acciones
  const seleccionado = (data ?? []).find((a) => String(a.id) === params.get('almacen')) ?? null

  /** Tocar un almacén: su detalle; un taller, Talleres; combustible, su formulario. */
  const abrirAlmacen = (a: Almacen) => {
    if (a.tipo === 'TALLER') void navegar('/app/inventario/talleres')
    else if (fuera(a)) {
      if (escribe) abrir(a)
    } else setParams({ almacen: String(a.id) })
  }

  const guardarActivo = (a: Almacen, activo: boolean) =>
    guardar.mutateAsync({
      id: a.id,
      codigo: a.codigo,
      nombre: a.nombre,
      tipo: a.tipo,
      ubicacion: a.ubicacion,
      recibe_compras: a.recibe_compras,
      activo,
      propietario: a.propietario,
      // Viaja el que tiene: nulo aquí sería soltar el cargo, y no se pidió eso.
      responsable_id: a.responsable_id ?? null,
      capacidad: a.capacidad ?? null,
      trabajos_a_la_vez: a.trabajos_a_la_vez ?? null,
    })

  const reporteGeneral = async () => {
    setArmandoGeneral(true)
    setErrorGeneral(null)
    try {
      setGeneral(
        await armarReporteGeneral({
          almacenes: kanban
            .filter((a) => a.activo && conMaterial(a))
            .map((a) => ({
              nombre: a.nombre,
              codigo: a.codigo,
              renglones: renglonesDeReporte(filasDe(a.id), etiquetaDeCategoria),
            })),
          empresa: { razonSocial: empresa?.razon_social ?? '', rif: empresa?.rif ?? '' },
          emitidoPor: yo ?? '',
          momento: new Date(),
        }),
      )
    } catch (e) {
      setErrorGeneral(e)
    } finally {
      setArmandoGeneral(false)
    }
  }

  /** Los botones de un almacén, iguales en la tarjeta y en la fila. */
  const acciones = (a: Almacen, conTexto = false) => (
    <div className="flex flex-wrap items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {conTexto && !fuera(a) ? (
        <Button variant="ghost" size="sm" onClick={() => abrirAlmacen(a)}
          title={a.tipo === 'TALLER' ? 'Ver el taller en Talleres' : 'Ver los productos del almacén'}
        >
          Ver
        </Button>
      ) : null}
      {conMaterial(a) ? (
        <>
          <Button variant="ghost" size="sm" onClick={() => setReporteDe(a)} title="Reporte del almacén (Excel/PDF)">
            {conTexto ? '📄 Reporte' : '📄'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConsumoDe(a)} title="Gráfica de consumo por producto">
            {conTexto ? '📊 Consumo' : '📊'}
          </Button>
        </>
      ) : null}
      {escribe ? (
        <>
          <Button variant="ghost" size="sm" onClick={() => abrir(a)} title="Editar">
            {conTexto ? 'Editar' : '✎'}
          </Button>
          {/* Combustible no se toca: su tanque se apaga desde el formulario, como siempre. */}
          {fuera(a) ? null : a.activo ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger hover:text-danger"
              onClick={() => setDesactivando(a)}
              title="Desactivar"
            >
              ✕
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-success hover:text-success"
              disabled={guardar.isPending}
              onClick={() => void guardarActivo(a, true).catch(() => undefined)}
              title="Activar"
            >
              ✓
            </Button>
          )}
        </>
      ) : null}
    </div>
  )

  /** Lo de La Cantera que MGG no tiene: tipo, recibe compras, dueño, estado. */
  const marcas = (a: Almacen) => (
    <>
      <Chip tone={a.tipo === 'TALLER' ? 'info' : 'neutral'}>{tipoDe(a)}</Chip>
      {a.recibe_compras ? <Chip tone="royal">Recibe compras</Chip> : null}
      {/* La marca de lo ajeno vive en un solo sitio: se dibuja igual aquí, en
          existencias, en los traslados y en las máquinas. Ver `DeQuienEs`. */}
      <DeQuienEs propietario={a.propietario} />
      {a.activo ? null : <Chip tone="neutral">Inactivo</Chip>}
    </>
  )

  return (
    <>
      <PageHeader
        title="▣ Almacenes y patios"
        description="Almacenes, patios y talleres, con su valor. Las existencias se controlan por almacén: tocá uno para ver sus productos y su consumo."
        actions={
          <>
            <Button
              variant="ghost"
              title="Descargar un PDF de todo el inventario, por almacenes"
              disabled={armandoGeneral || existenciasQ.isPending}
              onClick={() => void reporteGeneral()}
            >
              {armandoGeneral ? 'Generando…' : '📄 Reporte general (PDF)'}
            </Button>
            {escribe ? (
              <Button icon={<Plus />} onClick={() => abrir()}>
                Agregar almacén
              </Button>
            ) : null}
          </>
        }
      />

      <Pestanas pestanas={PESTANAS_SITIOS} />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}
      {existenciasQ.error ? <ErrorDeCarga error={existenciasQ.error} className="mb-4" /> : null}
      {errorGeneral ? <ErrorDeCarga error={errorGeneral} className="mb-4" /> : null}
      {/* Lo que la base contestó al ✓ de activar (los modales enseñan el suyo). */}
      {guardar.error && !edicion && !desactivando ? (
        <ErrorDeCarga error={guardar.error} className="mb-4" />
      ) : null}

      {seleccionado && !fuera(seleccionado) ? (
        <DetalleAlmacen
          key={seleccionado.id}
          almacen={seleccionado}
          filas={filasDe(seleccionado.id)}
          etiquetaDeCategoria={etiquetaDeCategoria}
          escribe={escribe}
          onVolver={() => setParams({})}
          onConsumo={() => setConsumoDe(seleccionado)}
        />
      ) : null}

      {!seleccionado && data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<Warehouse />}
            titulo="No hay almacenes."
            descripcion="Creá el primero con «+ Agregar almacén»: se necesita al menos uno para recibir material."
            accion={
              escribe ? (
                <Button icon={<Plus />} onClick={() => abrir()}>
                  Agregar almacén
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : null}

      {!seleccionado && data && data.length > 0 ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Segmento
              valor={vista}
              onCambio={(v) => setVista(v as Vista)}
              opciones={[
                { valor: 'kanban', etiqueta: '▦ Kanban' },
                { valor: 'lista', etiqueta: '☰ Lista' },
              ]}
            />
            {veValor && !existenciasQ.isPending ? (
              <p className="text-ink/55 text-sm">
                <span className="text-2xs font-mono tracking-[0.12em] uppercase">Valor total</span>{' '}
                <strong className="text-ink/85 tabular">{dolares(valorTotal)}</strong>
              </p>
            ) : null}
          </div>

          {vista === 'kanban' ? (
            /* ------------------------------------------------- kanban */
            <>
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
                {kanban.map((a) => {
                  const v = valores.get(a.id) ?? VALOR_VACIO
                  const taller = a.tipo === 'TALLER'
                  return (
                    <Card
                      key={a.id}
                      onClick={() => abrirAlmacen(a)}
                      title={taller ? 'Ver el taller en Talleres' : 'Ver detalle del almacén'}
                      className={cn(
                        'hover:shadow-primary relative flex cursor-pointer flex-col overflow-hidden transition-shadow',
                        !a.activo && 'opacity-60',
                      )}
                    >
                      <span
                        className={cn('absolute inset-x-0 top-0 h-[3px]', taller ? 'bg-info' : 'bg-royal-600')}
                        aria-hidden="true"
                      />
                      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                        <div className="min-w-0">
                          <p className="text-ink/90 font-semibold">{a.padre_id ? '↳' : '▣'} {a.nombre}</p>
                          {a.padre_id && nombreDelAlmacen(a.padre_id) ? (
                            <p className="text-ink/50 text-xs">Sección de {nombreDelAlmacen(a.padre_id)}</p>
                          ) : null}
                          <p className="text-ink/45 text-xs">
                            <span className="font-mono">{a.codigo}</span> · {a.ubicacion || 'Sin ubicación'}
                          </p>
                        </div>
                        {acciones(a)}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5">{marcas(a)}</div>

                      {conMaterial(a) ? (
                        <>
                          <div className="mt-4">
                            <p className="text-ink/45 text-2xs font-mono tracking-[0.12em] uppercase">Valor total</p>
                            <p className="text-royal-700 dark:text-royal-300 tabular text-2xl font-semibold">
                              {existenciasQ.isPending ? '…' : veValor ? dolares(v.valor) : '—'}
                            </p>
                          </div>
                          <p className="text-ink/55 mt-1 text-sm">
                            {productos(v.items)} · {cantidad(v.unidades)} und.
                          </p>
                        </>
                      ) : (
                        <p className="text-ink/45 mt-4 text-sm">No guarda material.</p>
                      )}

                      <p className="text-ink/50 mt-auto pt-3 text-xs">
                        Responsable:{' '}
                        {nombreDe(a.responsable_id) ?? <span className="text-ink/35">Sin asignar</span>}
                        {taller ? <span className="text-info float-right font-medium">Talleres ›</span> : null}
                      </p>
                    </Card>
                  )
                })}
              </div>
              {tanques > 0 ? (
                <p className="text-ink/45 mt-3 text-xs">
                  Los tanques de combustible no entran en estas cuentas: se ven en «☰ Lista» y en
                  Combustible.
                </p>
              ) : null}
            </>
          ) : (
            /* -------------------------------------------------- lista */
            <Card flush>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead>
                    <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                      <th className="px-5 py-3 font-medium">Código</th>
                      <th className="px-3 py-3 font-medium">Almacén</th>
                      <th className="px-3 py-3 font-medium">Tipo</th>
                      <th className="px-3 py-3 font-medium">Ubicación</th>
                      {/* A quién se le pregunta. Va en la tabla y no solo dentro del
                          formulario: la pregunta «¿quién lleva este almacén?» se
                          hace mirando la lista, no abriendo once fichas. */}
                      <th className="px-3 py-3 font-medium">Responsable</th>
                      <th className="px-3 py-3 text-right font-medium">Productos</th>
                      <th className="px-3 py-3 text-right font-medium">Unidades</th>
                      <th className="px-3 py-3 text-right font-medium">Valor total</th>
                      <th className="px-3 py-3 text-right font-medium">Estado</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {enArbol(data).map(({ a, nivel }) => {
                      const v = valores.get(a.id) ?? VALOR_VACIO
                      const material = conMaterial(a)
                      return (
                        <tr
                          key={a.id}
                          onClick={() => abrirAlmacen(a)}
                          className="border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors last:border-0"
                        >
                          <td className="text-ink/60 px-5 py-3 font-mono text-xs">{a.codigo}</td>
                          <td className="text-ink/85 px-3 py-3 font-medium" style={{ paddingLeft: `${0.75 + nivel * 1.25}rem` }}>
                            {nivel ? <span className="text-ink/40 mr-1">↳</span> : null}
                            {a.nombre}
                            {a.recibe_compras ? (
                              <Chip tone="royal" className="ml-2">
                                Recibe compras
                              </Chip>
                            ) : null}
                            <DeQuienEs propietario={a.propietario} className="ml-2" />
                          </td>
                          <td className="text-ink/70 px-3 py-3">{tipoDe(a)}</td>
                          <td className="text-ink/60 px-3 py-3">{a.ubicacion ?? '—'}</td>
                          <td className="text-ink/60 px-3 py-3">
                            {nombreDe(a.responsable_id) ?? <span className="text-ink/35">Sin asignar</span>}
                          </td>
                          <td className="tabular px-3 py-3 text-right">{material ? enteros(v.items) : '—'}</td>
                          <td className="tabular px-3 py-3 text-right">{material ? cantidad(v.unidades) : '—'}</td>
                          <td className="text-royal-700 dark:text-royal-300 tabular px-3 py-3 text-right font-semibold">
                            {material && veValor ? dolares(v.valor) : '—'}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <Chip tone={a.activo ? 'success' : 'neutral'}>{a.activo ? 'Activo' : 'Inactivo'}</Chip>
                          </td>
                          <td className="px-5 py-2">
                            {acciones(a, true)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      ) : null}

      {reporteDe ? (
        <ModalReporteAlmacen
          almacen={reporteDe}
          filas={filasDe(reporteDe.id)}
          etiquetaDeCategoria={etiquetaDeCategoria}
          onCerrar={() => setReporteDe(null)}
        />
      ) : null}

      {consumoDe ? (
        <ModalConsumoAlmacen almacen={consumoDe} filas={filasDe(consumoDe.id)} onCerrar={() => setConsumoDe(null)} />
      ) : null}

      {desactivando ? (
        <ModalDesactivarAlmacen
          almacen={desactivando}
          pendiente={guardar.isPending}
          error={guardar.error}
          onCerrar={() => {
            guardar.reset()
            setDesactivando(null)
          }}
          onConfirmar={async () => {
            await guardarActivo(desactivando, false)
            setDesactivando(null)
          }}
        />
      ) : null}

      <Visor
        abierto={general !== null}
        onCerrar={() => setGeneral(null)}
        blob={general?.blob ?? null}
        nombreArchivo={general?.nombre ?? ''}
        titulo="Reporte por almacenes"
      />

      {asignarPadre.error ? <ErrorDeCarga error={asignarPadre.error} /> : null}

      {edicion ? (
        <Modal
          abierto
          onCerrar={() => setEdicion(null)}
          titulo={edicion.id ? 'Editar almacén' : 'Nuevo almacén'}
          acciones={
            <>
              <Button variant="ghost" onClick={() => setEdicion(null)}>
                Cancelar
              </Button>
              <Button
                /*
                  Al crear, el código ya no hace falta: si se deja vacío lo
                  pone la base, con las tres letras del tipo y el siguiente
                  número de esa serie. Al editar sí se exige, porque vaciarlo
                  no significa «ponme otro», significa que se borró sin querer.
                */
                disabled={
                  guardar.isPending || asignarPadre.isPending || !edicion.nombre || (!!edicion.id && !edicion.codigo)
                }
                onClick={async () => {
                  // Los dos campos de tipo viajan como numero o como nada: la
                  // base rechaza una capacidad en un patio, y una cadena vacia
                  // no es cero.
                  const idGuardado = await guardar.mutateAsync({
                    ...edicion,
                    // El padre no viaja aquí: lo cuelga `asignar_almacen_padre`, abajo.
                    padre_id: undefined,
                    capacidad: edicion.capacidad || null,
                    trabajos_a_la_vez: edicion.trabajos_a_la_vez
                      ? Number(edicion.trabajos_a_la_vez)
                      : null,
                    // Vacío es nadie, y llega como nadie: la base lo escribe tal
                    // cual para que se pueda soltar el cargo.
                    responsable_id: edicion.responsable_id
                      ? Number(edicion.responsable_id)
                      : null,
                  })
                  const idAlmacen = edicion.id ?? idGuardado
                  const padreAntes = (data ?? []).find((x) => x.id === idAlmacen)?.padre_id ?? null
                  const padreNuevo = edicion.padre_id ? Number(edicion.padre_id) : null
                  if (idAlmacen && padreNuevo !== padreAntes) {
                    await asignarPadre.mutateAsync({ id: idAlmacen, padre_id: padreNuevo })
                  }
                  setEdicion(null)
                }}
              >
                {guardar.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              solo="alfanumerico"
              maxLength={20}
              label="Código"
              placeholder={edicion.id ? 'ALM-0001' : 'Se pone solo'}
              hint={
                edicion.id
                  ? undefined
                  : 'Vacío, se asigna solo: tres letras del tipo y el siguiente número.'
              }
              value={edicion.codigo}
              onChange={(e) => cambiar({ codigo: e.target.value.toUpperCase() })}
            />
            <Input
              maxLength={120}
              label="Nombre"
              value={edicion.nombre}
              onChange={(e) => cambiar({ nombre: e.target.value })}
            />
            <Select
              label="Tipo"
              value={edicion.tipo}
              onChange={(e) => cambiar({ tipo: e.target.value })}
              // «En camino» lo lleva el sistema y la base no deja crearlo.
              opciones={TIPOS_ALMACEN.filter((t) => t.valor !== 'TRANSITO')}
            />
            {/* SUBALMACENES DE MGG (11/11/2026): una sección, un estante o una
                pila dentro de otro almacén. La base impide las vueltas. */}
            <Select
              label="Es sección de"
              vacio="Ninguno: es un almacén principal"
              hint="Para un subalmacén: la sección, el estante o la pila dentro de otro."
              value={edicion.padre_id}
              onChange={(e) => cambiar({ padre_id: e.target.value })}
              opciones={(data ?? [])
                .filter((x) => x.id !== edicion.id && x.activo && x.tipo !== 'TRANSITO')
                .map((x) => ({ valor: String(x.id), etiqueta: x.nombre }))}
            />

            {/*
              DE QUIÉN ES LO QUE SE GUARDA AQUÍ.

              Christopher: «hay elementos, sillas, mesas, equipos, etc. que son
              de la gobernación, entre los items que tiene a disposición la
              cantera». El dueño va en el ALMACÉN y no en el artículo: veinte
              sillas pueden ser ocho de ellos y doce compradas, y marcar el
              artículo obligaría a inventar dos sillas distintas.

              La base no deja cambiarlo con el almacén lleno —reescribiría de
              quién es lo que hay dentro sin un asiento que lo explique— y
              tampoco deja trasladar entre dueños: eso no es mover, es cambiar
              de dueño, y no lo decide quien carga una silla.
            */}
            <Select
              label="Dueño"
              value={edicion.propietario}
              onChange={(e) => cambiar({ propietario: e.target.value })}
              hint={
                edicion.id
                  ? 'Solo se puede cambiar con el almacén vacío.'
                  : 'Lo que entre aquí será de este dueño.'
              }
              opciones={(propietarios ?? []).map((d) => ({
                valor: d.codigo,
                etiqueta: d.nombre,
              }))}
            />
            {/*
              QUIÉN RESPONDE POR ESTE SITIO.

              Christopher: «se nos solicita que un empleado pueda ser responsable
              de algún área, como almacén(es), es decir, un empleado puede tener
              a su cargo uno o más almacenes».

              Por eso el cargo se elige AQUÍ, en el almacén, y no como una lista
              de almacenes en la ficha del empleado. Puesto en el almacén, que la
              misma persona lleve tres sale gratis —se elige tres veces— y cada
              sitio conserva una sola respuesta a «¿a quién le pregunto?». Al
              revés habría hecho falta una tabla intermedia para lo mismo.

              Se puede dejar en nadie. Un almacén sin encargado es un hecho —pasa
              cuando alguien se va— y obligar a rellenarlo solo consigue que se
              ponga a cualquiera para poder guardar.
            */}
            <SelectBuscable
              label="Responsable"
              vacio="Sin asignar"
              valor={edicion.responsable_id}
              onCambio={(v) => cambiar({ responsable_id: v })}
              hint="Una misma persona puede llevar varios almacenes: se la elige en cada uno."
              opciones={(empleados ?? []).map((e) => ({
                valor: String(e.id),
                codigo: e.ficha,
                nombre: `${e.nombres} ${e.apellidos}`,
                detalle: e.cargo,
              }))}
            />
            <Input
              maxLength={200}
              label="Ubicación"
              placeholder="Al lado de la planta"
              value={edicion.ubicacion}
              onChange={(e) => cambiar({ ubicacion: e.target.value })}
            />

            {/*
              LO QUE SOLO TIENE SENTIDO EN SU TIPO

              Un patio no tiene tope y un almacen tampoco: la capacidad solo
              significa algo en un tanque, y los trabajos a la vez solo en un
              taller. Se ensena el campo cuando toca en vez de dejarlo siempre a
              la vista pidiendo un dato que en la mayoria de los casos no existe
              — y la base rechaza lo demas, asi que las dos rejas dicen lo mismo.
            */}
            {edicion.tipo === 'COMBUSTIBLE' ? (
              <Input
                limite={{ maxDecimales: 2, sinNegativos: true }}
                label="Capacidad del tanque"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="Litros"
                value={edicion.capacidad}
                onChange={(e) => cambiar({ capacidad: e.target.value })}
                hint="El saldo se muestra como «720 de 5.000»."
              />
            ) : null}

            {edicion.tipo === 'TALLER' ? (
              <Input
                limite={{ maxEnteros: 3, maxDecimales: 0, sinNegativos: true }}
                label="Trabajos simultáneos"
                type="number"
                min="1"
                step="1"
                value={edicion.trabajos_a_la_vez}
                onChange={(e) => cambiar({ trabajos_a_la_vez: e.target.value })}
                hint="Sin este dato no se indica si el taller tiene sitio."
              />
            ) : null}
          </div>

          <div className="mt-4 space-y-2">
            <label className="text-ink/75 flex cursor-pointer items-center gap-2 text-sm select-none">
              <input
                type="checkbox"
                className="accent-royal-600 size-4"
                checked={edicion.recibe_compras}
                onChange={(e) => cambiar({ recibe_compras: e.target.checked })}
              />
              Es el almacén propuesto al recibir una compra
            </label>
            <label className="text-ink/75 flex cursor-pointer items-center gap-2 text-sm select-none">
              <input
                type="checkbox"
                className="accent-royal-600 size-4"
                checked={edicion.activo}
                onChange={(e) => cambiar({ activo: e.target.checked })}
              />
              Activo
            </label>
          </div>

          {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-4" /> : null}
        </Modal>
      ) : null}
    </>
  )
}

/*
  ✕ DESACTIVAR UN ALMACÉN.

  MGG elimina; aquí se desactiva, porque el libro de un almacén no se borra
  nunca. Antes de ofrecer el botón se le pregunta a la base qué lo impide
  (`que_impide_desactivar_almacen`): la misma lista con la que después se
  negaría. Con algo que bloquea, el botón no se ofrece.
*/
function ModalDesactivarAlmacen({
  almacen,
  pendiente,
  error,
  onCerrar,
  onConfirmar,
}: {
  almacen: Almacen
  pendiente: boolean
  error: unknown
  onCerrar: () => void
  onConfirmar: () => Promise<void>
}) {
  const q = useQueImpideDesactivarAlmacen(almacen.id)
  const lista = q.data ?? []
  const bloquea = lista.some((c) => c.nivel === 'BLOQUEA')

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Desactivar almacén"
      ancho="sm"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={pendiente || q.isPending || !!q.error || bloquea}
            onClick={() => void onConfirmar().catch(() => undefined)}
          >
            {pendiente ? 'Desactivando…' : 'Desactivar'}
          </Button>
        </>
      }
    >
      <p className="text-ink/80 text-sm">
        ¿Seguro que querés desactivar el almacén <strong>«{almacen.nombre}»</strong>? Deja de
        ofrecerse para recibir y mover material. Su historia no se borra y se puede volver a activar
        con ✓.
      </p>

      {q.isPending ? <Cargando texto="Revisando qué lo impide…" /> : null}
      {q.error ? <ErrorDeCarga error={q.error} className="mt-3" /> : null}
      {lista.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {lista.map((c) => (
            <li
              key={c.que}
              className={cn(
                'rounded-lg px-3 py-2 text-sm',
                c.nivel === 'BLOQUEA' ? 'bg-danger/10 text-danger' : 'bg-warning/12 text-warning',
              )}
            >
              <strong>{c.nivel === 'BLOQUEA' ? 'No se puede: ' : 'Ojo: '}</strong>
              {c.detalle}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <ErrorDeCarga error={error} className="mt-3" /> : null}
    </Modal>
  )
}
