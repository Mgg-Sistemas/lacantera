import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Search, Warehouse } from 'lucide-react'
import { DeQuienEs } from '@/components/DeQuienEs'
import { Visor } from '@/components/Visor'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Segmento } from '@/components/ui/Segmento'
import { Select } from '@/components/ui/Select'
import { ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { estadisticasDeAlmacen, useMovimientosDeAlmacen } from '@/lib/api/almacenesValor'
import type { EstadisticaDeProducto } from '@/lib/api/almacenesValor'
import { useArticulos, useMisRoles } from '@/lib/api/catalogo'
import type { Articulo } from '@/lib/api/catalogo'
import { usePropietarios } from '@/lib/api/inventario'
import type { Almacen, Existencia } from '@/lib/api/inventario'
import { useEmpresa } from '@/lib/api/empresa'
import { useMisAcciones, useMisPermisos } from '@/lib/api/usuarios'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { LA_CASA } from '@/lib/deQuien'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { armarReporteAlmacen, hojaReporteAlmacen } from '@/lib/ficha/reporteAlmacen'
import { dolares } from '@/lib/formato'
import { useNotaDeTraslado } from '@/pages/salidas/NotaDeTraslado'
import { ModalArticuloNuevo } from '../Articulos'
import { BotonActaDeConteo } from '../BotonActaDeConteo'
import { ModalAlTaller } from '../ModalAlTaller'
import { ModalCambioDeDueno } from '../ModalCambioDeDueno'
import { ModalConteo } from '../ModalConteo'
import { ModalCorregirCosto } from '../ModalesDeExistencias'
import { ModalEntradaDeMaterial } from '../ModalEntradaDeMaterial'
import { ModalTraslado } from '../ModalTraslado'
import { Movimiento } from '../principal/Movimiento'
import { useSesion } from '@/lib/sesion'
import { bajarArchivo, escribirXlsx } from '@/lib/xlsx'
import { cn } from '@/lib/cn'
import { cantidad, guardarVista, leerVista, productos, renglonesDeReporte } from './comun'

/*
  ▣ DETALLE DE UN ALMACÉN (fase 6, 08/11/2026)

  El nivel 3 de MGG (`InventarioPage.tsx` L.1073-1128 y `AlmacenKanban.tsx`):
  cabecera con el valor, «📊 Consumo», «↓ Excel» y «↓ PDF», el conmutador
  «▦ Kanban» / «☰ Lista» (por defecto Lista, como MGG) y los productos del
  almacén con «Entradas» y «Salidas» en la tabla y «Stock · Precio UND · Valor
  total · Total usados · Consumo diario» en las tarjetas.

  Lo que no se copia, y por qué:
  - «📍 También en…»: aquí un artículo ya existe en todos los almacenes.
  - Subalmacenes y ubicación física: no existen en La Cantera (sin migración).

  09/11/2026 · LO DE LA PANTALLA VIEJA DE EXISTENCIAS, AQUÍ.
  «↕ Mover material» llevaba a la pantalla vieja de Existencias con este
  almacén elegido. Esa pantalla se retiró y lo que hacía vive aquí, con los
  mismos modales: en la cabecera «Registrar entrada», «Solicitar salida»,
  «Trasladar», «Mandar al taller» y el «Acta de conteo físico»; en cada fila
  «↕» (el movimiento de MGG con este almacén puesto) y «⋯» (contar, corregir
  el costo, al taller y cambiar de dueño). Y el filtro de dueño, para un
  almacén con material de varios dueños.
*/

type Vista = 'kanban' | 'lista'
const CLAVE_VISTA = 'lacantera.almacenes.detalle.vista'

const SIN_ESTADISTICA: EstadisticaDeProducto = { entradas: 0, salidas: 0, usados: 0, diario: 0 }

export function DetalleAlmacen({
  almacen,
  filas,
  etiquetaDeCategoria,
  escribe,
  onVolver,
  onConsumo,
}: {
  almacen: Almacen
  /** Las filas de `v_existencias` de este almacén. */
  filas: Existencia[]
  etiquetaDeCategoria: (codigo: string) => string
  escribe: boolean
  onVolver: () => void
  onConsumo: () => void
}) {
  const navegar = useNavigate()
  const hoy = hoyEnCaracas()
  const movs = useMovimientosDeAlmacen(almacen.id)
  const { data: empresa } = useEmpresa()
  const { nombre: yo } = useSesion()

  const [vista, setVistaEstado] = useState<Vista>(() => leerVista(CLAVE_VISTA, 'lista', ['kanban', 'lista']))
  const setVista = (v: Vista) => {
    setVistaEstado(v)
    guardarVista(CLAVE_VISTA, v)
  }
  const [texto, setTexto] = useState('')
  const [categoria, setCategoria] = useState('')
  const [dueno, setDueno] = useState('')
  const [conCeros, setConCeros] = useState(false)

  /*
    Los mismos permisos que la pantalla principal: rol ALMACEN para entrar,
    contar, trasladar y mandar al taller; SALIDAS para pedir una salida con
    «↕»; INVENTARIO.AJUSTAR_COSTO para el costo; INVENTARIO en TOTAL para el
    dueño. La base vuelve a comprobarlo todo.
  */
  const { puede: tieneRol } = useMisRoles()
  const { puede: alcanza } = useMisPermisos()
  const { puede: puedeAccion } = useMisAcciones()
  const almacenista = tieneRol('ALMACEN')
  const puedeMovimiento = almacenista || alcanza('SALIDAS', 'LECTURA')
  const { data: articulos } = useArticulos(false)
  const { data: propietarios } = usePropietarios()
  const nombreDeDueno = (codigo?: string | null) =>
    (propietarios ?? []).find((d) => d.codigo === codigo)?.nombre ?? codigo ?? undefined
  const articuloDe = (id: number): Articulo | undefined => (articulos ?? []).find((a) => a.id === id)

  // Los modales de siempre, con este almacén puesto.
  const [entrando, setEntrando] = useState(false)
  const [trasladando, setTrasladando] = useState(false)
  const [alTallerSuelto, setAlTallerSuelto] = useState(false)
  const [alTaller, setAlTaller] = useState<Existencia | null>(null)
  const [movimiento, setMovimiento] = useState<Articulo | null>(null)
  const [masAcciones, setMasAcciones] = useState<Existencia | null>(null)
  const [contando, setContando] = useState<Existencia | null>(null)
  const [costo, setCosto] = useState<Existencia | null>(null)
  const [cambiandoDueno, setCambiandoDueno] = useState<Existencia | null>(null)
  const notaDeTraslado = useNotaDeTraslado()
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [armando, setArmando] = useState(false)
  const [errorPdf, setErrorPdf] = useState<unknown>(null)

  const stats = useMemo(() => estadisticasDeAlmacen(movs.data ?? [], hoy), [movs.data, hoy])

  const veValor = filas.length === 0 || filas.some((e) => e.valor_usd !== null)
  const conExistencia = filas.filter((e) => (Number(e.existencia) || 0) !== 0)
  const valor = conExistencia.reduce((s, e) => s + (Number(e.valor_usd) || 0), 0)

  const categorias = useMemo(
    () => [...new Set(filas.map((e) => e.categoria))].sort((a, b) => etiquetaDeCategoria(a).localeCompare(etiquetaDeCategoria(b), 'es')),
    [filas, etiquetaDeCategoria],
  )

  const visibles = useMemo(() => {
    const q = texto.trim().toLowerCase()
    return filas
      .filter((e) => conCeros || (Number(e.existencia) || 0) !== 0)
      .filter((e) => !categoria || e.categoria === categoria)
      /* El dueño filtra por lo que hay de él en la fila (`duenos`); una fila
         sin dueños anotados es del dueño del almacén. */
      .filter(
        (e) =>
          !dueno ||
          ((e.duenos ?? []).length > 0 ? e.duenos.includes(dueno) : (almacen.propietario ?? LA_CASA) === dueno),
      )
      .filter(
        (e) => !q || e.articulo.toLowerCase().includes(q) || e.articulo_codigo.toLowerCase().includes(q),
      )
      .sort((a, b) => a.articulo.localeCompare(b.articulo, 'es', { numeric: true, sensitivity: 'base' }))
  }, [filas, texto, categoria, dueno, conCeros, almacen.propietario])

  /* Lo que ofrece «⋯» en una fila: lo de La Cantera que MGG no tiene. */
  const opcionesDe = (e: Existencia) => {
    const hay = Number(e.existencia) > 0
    const lista: { titulo: string; detalle: string; hacer: () => void }[] = []
    if (almacenista) {
      lista.push({
        titulo: 'Contar',
        detalle: 'Conteo físico. La diferencia queda como ajuste.',
        hacer: () => setContando(e),
      })
    }
    if (puedeAccion('INVENTARIO.AJUSTAR_COSTO') && hay) {
      lista.push({
        titulo: 'Corregir el costo',
        detalle: 'El costo por unidad de lo que hay en este almacén, con su factura.',
        hacer: () => setCosto(e),
      })
    }
    if (almacenista && articuloDe(e.articulo_id)?.reparable && Number(e.disponibles) > 0) {
      lista.push({
        titulo: 'Al taller',
        detalle: 'Mandarlo a reparar. Vuelve, no se consume.',
        hacer: () => setAlTaller(e),
      })
    }
    if (alcanza('INVENTARIO', 'TOTAL') && (propietarios ?? []).length > 1 && hay) {
      lista.push({
        titulo: 'Cambiar de dueño',
        detalle: 'El material no se mueve; cambia de dueño.',
        hacer: () => setCambiandoDueno(e),
      })
    }
    return lista
  }

  /* El acta lleva lo que se está viendo, y dice con qué filtro. */
  const filtroDelActa =
    [
      texto.trim() ? `Búsqueda: «${texto.trim()}»` : null,
      categoria ? `Categoría: ${etiquetaDeCategoria(categoria)}` : null,
      dueno ? `Solo lo de ${nombreDeDueno(dueno) ?? dueno}` : null,
      conCeros ? 'Con lo que está en cero' : null,
    ]
      .filter(Boolean)
      .join(' · ') || null

  const renglones = renglonesDeReporte(filas, etiquetaDeCategoria)
  const verFicha = (id: number) => void navegar(`/app/inventario/articulos/${id}`)

  const verPdf = async () => {
    setArmando(true)
    setErrorPdf(null)
    try {
      setPdf(
        await armarReporteAlmacen({
          almacen: almacen.nombre,
          renglones,
          empresa: { razonSocial: empresa?.razon_social ?? '', rif: empresa?.rif ?? '' },
          emitidoPor: yo ?? '',
          momento: new Date(),
        }),
      )
    } catch (e) {
      setErrorPdf(e)
    } finally {
      setArmando(false)
    }
  }

  const stockLabel = `Stock en ${almacen.nombre}`
  const statsDe = (id: number) => stats.get(id) ?? SIN_ESTADISTICA
  const cargandoStats = movs.isPending

  // 09/11/2026: «+ Nuevo producto» abre su ventana aquí mismo, sin ir al Catálogo.
  const [nuevo, setNuevo] = useState(false)

  return (
    <>
      {/* ---------------------------------------------------- cabecera */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button variant="ghost" size="sm" onClick={onVolver}>
          ← Volver a almacenes
        </Button>
        <h2 className="text-ink/90 text-xl font-semibold tracking-tight">▣ {almacen.nombre}</h2>
        <DeQuienEs propietario={almacen.propietario} />
        <span className="text-ink/55 font-mono text-sm">
          {veValor ? `${dolares(valor)} · ` : ''}
          {productos(conExistencia.length)}
        </span>
        <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          {escribe ? (
            <Button
              variant="ghost"
              size="sm"
              title="Dar de alta un producto en el catálogo"
              onClick={() => setNuevo(true)}
            >
              + Nuevo producto
            </Button>
          ) : null}
          {almacenista ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                title="Material que entra sin una compra: saldo inicial, compra por fuera, donación. Varios renglones a la vez."
                onClick={() => setEntrando(true)}
              >
                + Registrar entrada
              </Button>
              <Button
                variant="ghost"
                size="sm"
                title="Pedir una salida de este almacén: sale cuando la aprueba quien responde por él"
                onClick={() => void navegar(`/app/salidas/solicitudes?solicitar=1&almacen=${almacen.id}`)}
              >
                Solicitar salida
              </Button>
              <Button
                variant="ghost"
                size="sm"
                title="Trasladar material de este almacén a otro, con su nota de traslado"
                onClick={() => setTrasladando(true)}
              >
                ⇄ Trasladar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                title="Mandar a reparar algo reparable. Vuelve, no se consume."
                onClick={() => setAlTallerSuelto(true)}
              >
                Mandar al taller
              </Button>
              <BotonActaDeConteo
                sitio={almacen.nombre}
                filtro={filtroDelActa}
                renglones={visibles.map((e) => ({
                  articuloId: e.articulo_id,
                  codigo: e.articulo_codigo,
                  articulo: e.articulo,
                  unidad: e.unidad,
                  existencia: e.existencia,
                  costoUsd: veValor ? (e.costo_promedio_usd ?? 0) : null,
                  valorUsd: veValor ? e.valor_usd : null,
                }))}
              />
            </>
          ) : null}
          <Button size="sm" onClick={onConsumo} title="Gráfica de consumo por producto de este almacén">
            📊 Consumo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={renglones.length === 0}
            onClick={() =>
              bajarArchivo(
                escribirXlsx(hojaReporteAlmacen(almacen.nombre, renglones)),
                `almacen-${almacen.codigo.toLowerCase()}.xlsx`,
              )
            }
          >
            ↓ Excel
          </Button>
          <Button variant="ghost" size="sm" disabled={renglones.length === 0 || armando} onClick={() => void verPdf()}>
            {armando ? 'Generando…' : '↓ PDF'}
          </Button>
        </div>
      </div>
      {errorPdf ? <ErrorDeCarga error={errorPdf} className="mb-4" /> : null}

      {/* ----------------------------------------------- vista y filtros */}
      <Card className="mb-4">
        <div
          className={cn(
            'grid gap-3 sm:items-end',
            (propietarios ?? []).length > 1
              ? 'sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]'
              : 'sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]',
          )}
        >
          <Input
            maxLength={100}
            label="Buscar"
            icon={<Search />}
            placeholder="Nombre o código del producto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <Select
            label="Categoría"
            vacio="Todas"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            opciones={categorias.map((c) => ({ valor: c, etiqueta: etiquetaDeCategoria(c) }))}
          />
          {/* Solo si hay más de un dueño registrado; con uno solo no separa nada. */}
          {(propietarios ?? []).length > 1 ? (
            <Select
              label="Dueño"
              vacio="De todos"
              value={dueno}
              onChange={(e) => setDueno(e.target.value)}
              opciones={(propietarios ?? []).map((d) => ({ valor: d.codigo, etiqueta: d.nombre }))}
            />
          ) : null}
          <Segmento
            className="self-end"
            valor={vista}
            onCambio={(v) => setVista(v as Vista)}
            opciones={[
              { valor: 'kanban', etiqueta: '▦ Kanban' },
              { valor: 'lista', etiqueta: '☰ Lista' },
            ]}
          />
        </div>
        <label className="text-ink/70 mt-3 flex cursor-pointer items-center gap-2 text-sm select-none">
          <input
            type="checkbox"
            className="accent-royal-600 size-4"
            checked={conCeros}
            onChange={(e) => setConCeros(e.target.checked)}
          />
          Mostrar también lo que está en cero
        </label>
      </Card>

      {movs.error ? <ErrorDeCarga error={movs.error} className="mb-4" /> : null}

      {visibles.length === 0 ? (
        <Card>
          <Vacio
            icono={<Warehouse />}
            titulo={filas.length === 0 || (!texto && !categoria) ? 'El almacén no tiene productos.' : 'Sin productos que coincidan con los filtros.'}
          />
        </Card>
      ) : vista === 'kanban' ? (
        /* ------------------------------------------------- kanban */
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
          {visibles.map((e) => {
            const s = statsDe(e.articulo_id)
            const stock = Number(e.existencia) || 0
            const u = e.unidad
            return (
              <Card
                key={e.articulo_id}
                className="hover:shadow-primary relative cursor-pointer overflow-hidden transition-shadow"
                onClick={() => verFicha(e.articulo_id)}
                title="Ver detalle del producto"
              >
                <span className="bg-royal-600 absolute inset-x-0 top-0 h-[3px]" aria-hidden="true" />
                <p className="text-ink/90 font-semibold">{e.articulo}</p>
                <p className="text-ink/45 mb-3 font-mono text-xs">{e.articulo_codigo}</p>
                <div className="grid gap-2">
                  <Metrica label="Stock" valor={`${cantidad(stock)} ${u}`} className="text-royal-700 dark:text-royal-300" />
                  <Metrica
                    label="Precio UND"
                    valor={veValor && e.costo_promedio_usd !== null ? dolares(e.costo_promedio_usd) : '—'}
                    className="text-ink/85"
                  />
                  <Metrica
                    label="Valor total"
                    valor={veValor ? dolares(e.valor_usd ?? 0) : '—'}
                    className="text-success"
                  />
                  <Metrica
                    label="Total usados"
                    valor={cargandoStats ? '…' : `${cantidad(s.usados)} ${u}`}
                    className="text-warning"
                  />
                  <Metrica
                    label="Consumo diario"
                    valor={cargandoStats ? '…' : `${cantidad(s.diario)} ${u}/día`}
                    className="text-ink/55"
                  />
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        /* -------------------------------------------------- lista */
        <Card flush>
          <div className="border-hairline border-b px-5 py-3">
            <p className="text-ink/60 text-sm">{productos(visibles.length)}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">SKU</th>
                  <th className="px-3 py-3 font-medium">Producto</th>
                  <th className="px-3 py-3 font-medium">Categoría</th>
                  <th className="px-3 py-3 text-right font-medium" title="Total de entradas históricas">
                    Entradas
                  </th>
                  <th className="px-3 py-3 text-right font-medium" title="Total de salidas históricas">
                    Salidas
                  </th>
                  <th
                    className="px-3 py-3 text-right font-medium"
                    title={`${stockLabel}: solo lo que hay en este almacén. El total de todos se ve en la ficha del producto.`}
                  >
                    {stockLabel}
                  </th>
                  <th className="px-3 py-3 text-right font-medium">Precio UND</th>
                  <th className="px-3 py-3 text-right font-medium" title="Precio total = stock × precio UND">
                    Valor
                  </th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {visibles.map((e) => {
                  const s = statsDe(e.articulo_id)
                  const stock = Number(e.existencia) || 0
                  const minimo = Number(e.stock_minimo) || 0
                  const prestadas = Number(e.prestadas) || 0
                  return (
                    <tr
                      key={e.articulo_id}
                      onClick={() => verFicha(e.articulo_id)}
                      className="border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors last:border-0"
                    >
                      <td className="text-ink/60 px-5 py-3 font-mono text-xs">{e.articulo_codigo}</td>
                      <td className="text-ink/85 px-3 py-3 font-medium">{e.articulo}</td>
                      <td className="px-3 py-3">
                        <Chip tone="neutral">{etiquetaDeCategoria(e.categoria)}</Chip>
                      </td>
                      <td className="text-success tabular px-3 py-3 text-right">
                        {cargandoStats ? '…' : `+${cantidad(s.entradas)}`}
                      </td>
                      <td className="text-danger tabular px-3 py-3 text-right">
                        {cargandoStats ? '…' : `−${cantidad(s.salidas)}`}
                      </td>
                      <td className="tabular px-3 py-3 text-right">
                        <span className={cn('text-ink/85', stock === 0 && 'text-ink/40')}>
                          {cantidad(stock)} {e.unidad}
                        </span>
                        {minimo > 0 && stock < minimo ? (
                          <Chip tone="danger" className="ml-2" title="Stock por debajo del mínimo">
                            ⚠ crítico
                          </Chip>
                        ) : null}
                        {prestadas > 0 ? (
                          <span className="text-ink/45 block text-xs">{cantidad(prestadas)} prestada(s)</span>
                        ) : null}
                      </td>
                      <td className="text-ink/70 tabular px-3 py-3 text-right">
                        {veValor && e.costo_promedio_usd !== null ? dolares(e.costo_promedio_usd) : '—'}
                      </td>
                      <td className="text-ink/85 tabular px-3 py-3 text-right font-medium">
                        {veValor ? dolares(e.valor_usd ?? 0) : '—'}
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap" onClick={(ev) => ev.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Ver detalle y kardex"
                            onClick={() => verFicha(e.articulo_id)}
                          >
                            📋
                          </Button>
                          {puedeMovimiento && articuloDe(e.articulo_id) ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Registrar movimiento en este almacén"
                              aria-label={`Movimiento de ${e.articulo}`}
                              onClick={() => setMovimiento(articuloDe(e.articulo_id) ?? null)}
                            >
                              ↕
                            </Button>
                          ) : null}
                          {opcionesDe(e).length > 0 ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Más acciones"
                              aria-label={`Más acciones de ${e.articulo}`}
                              onClick={() => setMasAcciones(e)}
                            >
                              ⋯
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Visor
        abierto={pdf !== null}
        onCerrar={() => setPdf(null)}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ''}
        titulo={`Reporte · ${almacen.nombre}`}
      />
      {nuevo ? <ModalArticuloNuevo onCerrar={() => setNuevo(false)} /> : null}

      {/* ------------------------------------------- ↕ Movimiento · SKU */}
      {movimiento ? (
        <Movimiento
          articulo={movimiento}
          almacenInicial={almacen.id}
          tipoInicial={almacenista ? 'entrada' : 'salida'}
          onCerrar={() => setMovimiento(null)}
        />
      ) : null}

      {/* ---------------------------------------------------------- ⋯ */}
      {masAcciones ? (
        <Modal
          abierto
          ancho="sm"
          onCerrar={() => setMasAcciones(null)}
          titulo={`${masAcciones.articulo_codigo} · ${masAcciones.articulo}`}
          descripcion={`En ${almacen.nombre}: hay ${cantidad(Number(masAcciones.existencia) || 0)} ${masAcciones.unidad}.`}
          acciones={
            <Button variant="ghost" onClick={() => setMasAcciones(null)}>
              Cerrar
            </Button>
          }
        >
          <div className="grid gap-2">
            {opcionesDe(masAcciones).map((o) => (
              <button
                key={o.titulo}
                type="button"
                onClick={() => {
                  setMasAcciones(null)
                  o.hacer()
                }}
                className="border-ink/12 hover:border-ink/25 hover:bg-ink/4 rounded-control w-full border px-4 py-3 text-left transition-colors"
              >
                <span className="text-ink/85 block text-sm font-medium">{o.titulo}</span>
                <span className="text-ink/50 mt-0.5 block text-xs">{o.detalle}</span>
              </button>
            ))}
          </div>
        </Modal>
      ) : null}

      {/* Los modales de siempre, con este almacén puesto. */}
      {contando ? <ModalConteo fila={contando} onCerrar={() => setContando(null)} /> : null}
      {costo ? <ModalCorregirCosto fila={costo} onCerrar={() => setCosto(null)} /> : null}
      {cambiandoDueno ? (
        <ModalCambioDeDueno fila={cambiandoDueno} onCerrar={() => setCambiandoDueno(null)} />
      ) : null}
      <ModalAlTaller
        fila={alTaller}
        abierto={alTallerSuelto}
        onCerrar={() => {
          setAlTaller(null)
          setAlTallerSuelto(false)
        }}
      />
      {entrando ? (
        <ModalEntradaDeMaterial almacenInicial={String(almacen.id)} onCerrar={() => setEntrando(false)} />
      ) : null}
      <ModalTraslado
        abierto={trasladando}
        onCerrar={() => setTrasladando(false)}
        origen={String(almacen.id)}
        // La nota sale cuando el material ya salió; un pedido todavía no mueve nada.
        onTrasladado={(t) => {
          if (t.forma !== 'PEDIR') void notaDeTraslado.abrirTraslado(t.id)
        }}
      />
      {notaDeTraslado.visor}
    </>
  )
}

/** Una métrica de la tarjeta: rótulo chico en mayúsculas, valor a la derecha. */
function Metrica({ label, valor, className }: { label: string; valor: string; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-ink/45 text-2xs font-mono tracking-[0.08em] uppercase">{label}</span>
      <strong className={cn('tabular text-sm', className)}>{valor}</strong>
    </div>
  )
}
