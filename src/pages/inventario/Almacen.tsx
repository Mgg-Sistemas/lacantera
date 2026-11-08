import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Cargando } from '@/components/ui/Estado'
import { AvisosFlotantes } from '@/components/AvisosFlotantes'
import { AvisoDeCosto } from '@/components/AvisoDeCosto'
import { CantidadDeArticulo, type CantidadCapturada } from '@/components/CantidadDeArticulo'
import { CostoDeArticulo } from '@/components/CostoDeArticulo'
import { ParecidosAEste } from '@/components/ParecidosAEste'
import { useMiPerfil, useMisPermisos, useSoloTelefono } from '@/lib/api/usuarios'
import {
  conSusFormas,
  leerCodigoDeArticulo,
  opcionesDeCategoria,
  useArticulos,
  useCategoriasDeInventario,
  useCrearArticulo,
  useMisRoles,
  useTodasLasPresentaciones,
  useUnidades,
  type Articulo,
} from '@/lib/api/catalogo'
import { useAlmacenes, useExistencias, useRegistrarEntradas, type Almacen as Sitio } from '@/lib/api/inventario'
import { useAsignaciones } from '@/lib/api/asignaciones'
import { usePermisosPedidos, usePorRecibir, useSolicitudesEnRevision } from '@/lib/api/pedidos'
import { useEmpresa, empresaDelPapel } from '@/lib/api/empresa'
import { useMonedasUsables, enSimbolos } from '@/lib/api/tasas'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { copiarAlPortapapeles } from '@/lib/ficha/reporteDiario'
import { mensajeEntrada, mensajeProductoNuevo, num } from '@/lib/ficha/inventarioWhatsapp'
import { RecepcionesTelefono } from '@/pages/pedidos/RecepcionesTelefono'
import { cn } from '@/lib/cn'

/*
  INVENTARIO, EN EL TELÉFONO.

  Christopher, 29/10/2026: rediseño a tarjetas grandes, con "Producto nuevo"
  como su propia puerta (antes vivía escondida dentro de "Registrar entrada")
  y una cola de "Por retornar" que antes no existía en el teléfono —los
  préstamos activos (asignaciones sin devolver) solo se veían desde el
  escritorio.

  08/11/2026: arriba de todo, «Solicitudes de pedido» —revisar qué tiene el
  almacén general de cada solicitud y recibir las órdenes de compra—, como
  la vista «solicitudes» del teléfono del almacenista en MGG.

  08/11/2026, FASE 1a DE «ALMACÉN E INVENTARIO COMO MGG»: esta pantalla pasa a
  ser la página única de MGG (`InventarioMovilView`). Arriba se elige el
  almacén y todo lo de abajo es de ese almacén: los botones grandes, la lista
  de sus productos con su stock, el alta de un producto y su entrada, y la
  pantalla «✅» con el WhatsApp. Igual que allá, no hay modales: cada paso
  reemplaza el contenido debajo del selector, y el almacén no se cambia a
  mitad de un paso —lo que se está cargando es de ESE almacén—.

  Lo que todavía no se copia (fase 1b) abre lo de antes: «⬆ Salida» y
  «🔄 Por retornar» van a sus sub-páginas, y «🔁 Traslado» no se enseña. La
  entrada de muchos renglones (`AlmacenEntrada`) sigue viva: «Varios
  productos a la vez».

  Las escrituras son las mismas RPC de siempre (`crear_articulo` y
  `registrar_entradas`): el stock sigue siendo la suma del libro, el costo
  sigue moviendo el promedio y la base sigue pidiendo que se compruebe el
  costo la primera vez.
*/

/** Cuántos productos se listan sin buscar: en el teléfono no se recorre el almacén entero. */
const SIN_BUSCAR = 15
const CLAVE_ALMACEN = 'lacantera.inventarioMovil.almacen'
/** El almacén con el que arranca quien no ha elegido ninguno: el general. */
const ALMACEN_POR_DEFECTO = 'ALM-GEN'
const SEGUNDOS_PARA_AVISAR_DE_LA_SEÑAL = 12

/*
  El combustible tiene su propio módulo y su surtidor, y «En tránsito» solo lo
  mueven los traslados: ninguno de los dos se elige aquí (fase 1a, regla de
  todas las fases). El tanque que admite material sin costo tampoco: una
  entrada con precio no entra ahí, lo mismo que en `AlmacenEntrada`.
*/
const TIPOS_FUERA = ['COMBUSTIBLE', 'TRANSITO']

const leerAlmacen = () => {
  try {
    return localStorage.getItem(CLAVE_ALMACEN) ?? ''
  } catch {
    return ''
  }
}
const guardarAlmacen = (id: string) => {
  try {
    localStorage.setItem(CLAVE_ALMACEN, id)
  } catch {
    /* sin almacenamiento: se vuelve a elegir la próxima vez */
  }
}

const sinAcentos = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

type Paso = 'inicio' | 'nuevo' | 'entrada' | 'recepciones' | 'listo'

/** Un producto tal como se ve en la lista: con el stock DE ESTE almacén, no el de la empresa. */
interface ProductoEnAlmacen {
  id: number
  codigo: string
  nombre: string
  categoria: string
  unidad: string
  stock: number
  /** Nulo para quien no puede ver la valoración: la vista lo esconde. */
  costoPromedio: number | null
}

export function Almacen() {
  const { puede, resuelto } = useMisPermisos()
  const { puede: tieneRol, isSuccess: rolesListos } = useMisRoles()
  const { soloTelefono } = useSoloTelefono()
  const { data: yo } = useMiPerfil()
  const { data: empresa } = useEmpresa()
  const navegar = useNavigate()

  const puedeEntrada = puede('INVENTARIO', 'ESCRITURA')
  // Pedir una salida solo exige LECTURA en Salidas; entregarla exige
  // ESCRITURA. El botón se enseña con cualquiera de las dos, y
  // AlmacenSalida.tsx decide a cuál de las dos aterriza.
  const puedeSalida = puede('SALIDAS', 'LECTURA')
  /*
    LA MISMA REJA QUE EL RPC `entregar_a_trabajador`: por el rol de siempre
    (ALMACEN, RRHH, ADMIN) o por el permiso del módulo Asignaciones — la
    segunda rama es la que deja usar esto a un rol a la medida, como
    `ALMACEN_TELEFONO`, sin tener que darle el rol entero.
  */
  const puedePrestamo = tieneRol('ALMACEN', 'RRHH', 'ADMIN') || puede('ASIGNACIONES', 'ESCRITURA')
  const puedeVerInventario = puede('INVENTARIO', 'LECTURA')

  const permisosPedidos = usePermisosPedidos()
  const revisa = permisosPedidos.data?.revisa_almacen === true
  const recibe = permisosPedidos.data?.recibe_almacen === true
  const porRevisar = useSolicitudesEnRevision()
  const porRecibir = usePorRecibir(recibe)
  const cantidadPorRevisar = (porRevisar.data ?? []).length
  const cantidadPorRecibir = (porRecibir.data ?? []).length

  const porRetornar = useAsignaciones({ estado: 'ASIGNADA' })
  const cantidadPorRetornar = (porRetornar.data ?? []).filter((a) => a.clase === 'ASIGNACION').length

  const almacenesQ = useAlmacenes()
  const visibles = useMemo(
    () => (almacenesQ.data ?? []).filter((a) => !TIPOS_FUERA.includes(a.tipo) && !a.admite_sin_costo),
    [almacenesQ.data],
  )
  const [sel, setSel] = useState(leerAlmacen)
  /*
    El recordado si sigue a la vista; si no, el general; si tampoco está, el
    primero. Se deduce en cada pintada en vez de corregir el estado: un
    almacén que se desactiva desde la PC no deja la pantalla apuntando a nada.
  */
  const almacen: Sitio | null =
    visibles.find((a) => String(a.id) === sel) ??
    visibles.find((a) => a.codigo === ALMACEN_POR_DEFECTO) ??
    visibles[0] ??
    null

  const existenciasQ = useExistencias(almacen?.id, !!almacen)
  const { data: articulos } = useArticulos()
  const { data: categorias } = useCategoriasDeInventario()

  const [paso, setPaso] = useState<Paso>('inicio')
  const [elegido, setElegido] = useState<number | null>(null)
  const [busca, setBusca] = useState('')
  const [listo, setListo] = useState<{ titulo: string; texto: string } | null>(null)

  const etiquetaCategoria = useMemo(() => {
    const m = new Map((categorias ?? []).map((c) => [c.codigo, c.etiqueta]))
    return (codigo: string) => m.get(codigo) ?? codigo
  }, [categorias])

  // Primero lo que tiene stock, después alfabético, como en MGG.
  const productos = useMemo<ProductoEnAlmacen[]>(
    () =>
      (existenciasQ.data ?? [])
        .map((e) => ({
          id: e.articulo_id,
          codigo: e.articulo_codigo,
          nombre: e.articulo,
          categoria: e.categoria,
          unidad: e.unidad,
          stock: Number(e.existencia) || 0,
          costoPromedio: e.costo_promedio_usd == null ? null : Number(e.costo_promedio_usd),
        }))
        .sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0) || a.nombre.localeCompare(b.nombre, 'es')),
    [existenciasQ.data],
  )

  const q = sinAcentos(busca.trim())
  const lista = useMemo(() => {
    if (!q) return productos.slice(0, SIN_BUSCAR)
    return productos.filter((p) =>
      sinAcentos(`${p.nombre} ${p.codigo} ${p.categoria} ${etiquetaCategoria(p.categoria)}`).includes(q),
    )
  }, [productos, q, etiquetaCategoria])

  /*
    LO QUE ESTÁ EN EL CATÁLOGO PERO NUNCA ENTRÓ A ESTE ALMACÉN.

    En MGG cada producto nace en un almacén y la lista los trae aunque estén en
    cero. Aquí el catálogo es uno para toda la empresa y la existencia sale del
    libro, así que un artículo que nunca entró a este almacén no aparece en la
    lista —y darlo de alta otra vez choca con el homónimo—. Al buscar se ofrecen
    también esos, con su cero, para que se les pueda cargar la Entrada.
  */
  const delCatalogo = useMemo<ProductoEnAlmacen[]>(() => {
    if (!q || !puedeEntrada) return []
    const aqui = new Set(productos.map((p) => p.id))
    return (articulos ?? [])
      .filter((a) => a.inventariable && !aqui.has(a.id))
      .filter((a) =>
        sinAcentos(
          `${a.nombre} ${a.codigo} ${a.codigo_anterior ?? ''} ${a.categoria} ${etiquetaCategoria(a.categoria)}`,
        ).includes(q),
      )
      .map((a) => ({
        id: a.id,
        codigo: a.codigo,
        nombre: a.nombre,
        categoria: a.categoria,
        unidad: a.unidad,
        stock: 0,
        costoPromedio: null,
      }))
  }, [articulos, productos, q, puedeEntrada, etiquetaCategoria])

  const prodActual =
    elegido == null ? null : (productos.find((p) => p.id === elegido) ?? delCatalogo.find((p) => p.id === elegido) ?? null)
  // Las formas de contarlo (bultos) salen de la ficha del artículo.
  const articuloActual = elegido == null ? undefined : (articulos ?? []).find((a) => a.id === elegido)

  if (!resuelto || !rolesListos || permisosPedidos.isPending) return <Cargando />

  // Quien no ve inventario y solo revisa o recibe aterriza en lo suyo.
  if (!puedeVerInventario) {
    if (revisa || recibe) return <Navigate to="/app/solicitudes-pedido/telefono" replace />
    return (
      <p className="text-ink/60 mx-auto mt-10 max-w-sm text-center text-sm">
        Su usuario no tiene permiso para ninguna de las tareas del almacén del teléfono.
      </p>
    )
  }

  const nombreAlm = almacen?.nombre ?? ''
  const quien = yo?.nombre ?? ''
  const empresaNombre = empresaDelPapel(empresa).razonSocial
  const esGeneral = almacen?.codigo === ALMACEN_POR_DEFECTO
  const eligiendo = paso === 'entrada' && prodActual == null
  const soloVe = !puedeEntrada && !puedeSalida && !puedePrestamo

  const elegirAlmacen = (id: string) => {
    setSel(id)
    guardarAlmacen(id)
    setPaso('inicio')
    setElegido(null)
    setBusca('')
  }
  const volver = () => {
    setPaso('inicio')
    setElegido(null)
    setListo(null)
  }
  const hecho = (titulo: string, texto: string) => {
    setListo({ titulo, texto })
    setPaso('listo')
    setElegido(null)
    setBusca('')
  }

  return (
    <div className="mx-auto max-w-lg pt-4 pb-10">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-ink/90 text-2xl font-semibold">📦 Inventario y Almacenes</h1>
          {quien ? <p className="text-ink/55 mt-0.5 text-sm">{quien}</p> : null}
        </div>
        {!soloTelefono ? (
          <Button variant="ghost" size="sm" className="shrink-0" onClick={() => void navegar('/app/inventario')}>
            🖥 Módulo completo
          </Button>
        ) : null}
      </header>

      {/* La fila de atajos de MGG (`AtajosTelefono`). Aquí hay una sola pantalla
          hermana: las solicitudes de pedido, con lo que espera al almacén. */}
      {revisa || recibe ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink/50">Ir a:</span>
          <Link
            to="/app/solicitudes-pedido/telefono"
            className={cn(
              'bg-surface shadow-card rounded-full border px-3 py-1.5 font-medium',
              cantidadPorRevisar + cantidadPorRecibir > 0 ? 'border-warning/50' : 'border-transparent',
            )}
          >
            📋 Solicitudes de Pedido
            {[
              revisa ? ` · ${cantidadPorRevisar} por revisar` : '',
              recibe ? ` · ${cantidadPorRecibir} por recibir` : '',
            ].join('')}
          </Link>
        </div>
      ) : null}

      {almacenesQ.isSuccess && visibles.length === 0 ? (
        <p className="text-ink/55 mt-4 text-sm">No hay almacenes activos. Se crean desde Inventario en la PC.</p>
      ) : null}

      {visibles.length > 0 ? (
        <div className="mt-4">
          <Select
            label="Almacén"
            value={almacen ? String(almacen.id) : ''}
            disabled={paso !== 'inicio'}
            onChange={(e) => elegirAlmacen(e.target.value)}
            opciones={visibles.map((a) => ({ valor: String(a.id), etiqueta: a.nombre }))}
            hint={paso !== 'inicio' ? 'Para cambiar de almacén, vuelve al inicio.' : undefined}
          />
        </div>
      ) : null}

      {almacenesQ.isPending || (almacen && existenciasQ.isPending) ? (
        <p className="text-ink/50 mt-3 text-sm">Cargando…</p>
      ) : null}

      {soloVe ? (
        <div className="border-warning/35 bg-warning-soft text-ink/80 rounded-card mt-3 flex gap-2 border p-3 text-sm">
          <span aria-hidden>👁</span>
          <span>Tu rol solo puede ver. Para mover inventario hace falta escritura en Inventario.</span>
        </div>
      ) : null}

      {paso === 'inicio' && almacen ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {puedeEntrada ? (
              <BotonGrande
                tono="royal"
                className="col-span-2"
                icono="＋"
                titulo="Producto nuevo"
                sub={`Algo que todavía no está en ${nombreAlm}`}
                onClick={() => setPaso('nuevo')}
              />
            ) : null}
            {puedeEntrada ? (
              <BotonGrande
                tono="success"
                className={puedeSalida ? undefined : 'col-span-2'}
                icono="⬇"
                titulo="Entrada"
                sub="Llegó más de un producto que ya está"
                onClick={() => {
                  setElegido(null)
                  setPaso('entrada')
                }}
              />
            ) : null}
            {puedeSalida ? (
              <BotonGrande
                tono="warning"
                className={puedeEntrada ? undefined : 'col-span-2'}
                icono="⬆"
                titulo="Salida"
                sub="Sale material del almacén"
                onClick={() => void navegar('/app/inventario/almacen/salida')}
              />
            ) : null}
            {puedePrestamo ? (
              <BotonGrande
                tono="info"
                className="col-span-2"
                icono="🔄"
                titulo={`Por retornar (${cantidadPorRetornar})`}
                sub={cantidadPorRetornar > 0 ? 'Dar retorno a lo que salió' : 'Sin pendientes por retornar'}
                onClick={() => void navegar('/app/inventario/almacen/retornar')}
              />
            ) : null}
            {/* 📥 Recepciones: las OC entran al almacén general (fase 4 de
                compras), así que el botón solo sale con ése elegido. */}
            {esGeneral && recibe ? (
              <BotonGrande
                tono="success"
                className="col-span-2"
                titulo="📥 Recepciones"
                sub={`Las OC por recibir: entran a ${nombreAlm}`}
                onClick={() => setPaso('recepciones')}
              />
            ) : null}
          </div>

          <div className="text-ink/55 mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm">
            {puedeEntrada ? (
              <Link
                to="/app/inventario/almacen/entrada"
                className="underline decoration-dotted underline-offset-4"
              >
                Varios productos a la vez
              </Link>
            ) : null}
            <Link to="/app/inventario/almacen/movimientos" className="underline decoration-dotted underline-offset-4">
              Historial de movimientos
            </Link>
          </div>
        </>
      ) : null}

      {paso === 'recepciones' ? (
        <div className="mt-4">
          <RecepcionesTelefono
            filas={porRecibir.data ?? []}
            cargando={porRecibir.isPending}
            error={porRecibir.error}
            canWrite={recibe}
            onVolver={volver}
          />
        </div>
      ) : null}

      {paso === 'listo' && listo ? <Listo titulo={listo.titulo} texto={listo.texto} onVolver={volver} /> : null}

      {paso === 'nuevo' && almacen ? (
        <FormNuevo
          almacen={almacen}
          productos={productos}
          quien={quien}
          empresa={empresaNombre}
          etiquetaCategoria={etiquetaCategoria}
          onCancel={volver}
          onHecho={hecho}
        />
      ) : null}

      {paso === 'entrada' && almacen && prodActual ? (
        <FormEntrada
          key={prodActual.id}
          almacen={almacen}
          producto={prodActual}
          articulo={articuloActual}
          quien={quien}
          empresa={empresaNombre}
          onCancel={() => setElegido(null)}
          onHecho={hecho}
        />
      ) : null}

      {(paso === 'inicio' || eligiendo) && almacen ? (
        <section className="mt-5">
          {eligiendo ? (
            <div className="mb-2 flex items-center justify-between gap-2">
              <strong className="text-lg">⬇ ¿A qué producto le llegó?</strong>
              <Button variant="ghost" onClick={volver}>
                Cancelar
              </Button>
            </div>
          ) : null}
          <Input
            label="Buscar producto"
            ocultarEtiqueta
            sinNormalizar
            type="search"
            autoComplete="off"
            placeholder="🔍 Buscar producto…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <h2 className="text-ink/80 mt-3 mb-2 font-semibold">
            {q
              ? `${lista.length + delCatalogo.length} encontrado(s)`
              : `Productos de ${nombreAlm} (${productos.length})${
                  productos.length > SIN_BUSCAR ? ` · se ven ${SIN_BUSCAR}, busca para ver el resto` : ''
                }`}
          </h2>
          {existenciasQ.isSuccess && productos.length === 0 && !q ? (
            <p className="text-ink/55 text-sm">
              {nombreAlm} no tiene productos todavía.
              {puedeEntrada ? ' Carga el primero con «Producto nuevo».' : ''}
            </p>
          ) : null}
          <div className="space-y-2">
            {lista.map((p) => (
              <FilaProducto
                key={p.id}
                producto={p}
                categoria={etiquetaCategoria(p.categoria)}
                disabled={!puedeEntrada}
                onClick={() => {
                  setElegido(p.id)
                  // Tocar un producto desde el inicio abre directamente su Entrada (MGG).
                  setPaso('entrada')
                }}
              />
            ))}
          </div>
          {delCatalogo.length > 0 ? (
            <>
              <p className="text-ink/50 mt-4 mb-2 text-xs">
                Del catálogo, todavía sin existencia en {nombreAlm}:
              </p>
              <div className="space-y-2">
                {delCatalogo.map((p) => (
                  <FilaProducto
                    key={p.id}
                    producto={p}
                    categoria={etiquetaCategoria(p.categoria)}
                    onClick={() => {
                      setElegido(p.id)
                      setPaso('entrada')
                    }}
                  />
                ))}
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      <AvisosFlotantes />
    </div>
  )
}

/* ──────────────────────────────────────── piezas de la pantalla */

type TonoBoton = 'royal' | 'success' | 'warning' | 'info'

const TONOS_BOTON: Record<TonoBoton, string> = {
  royal: 'bg-royal-600/10 border-royal-600/30',
  success: 'bg-success-soft border-success/25',
  warning: 'bg-warning-soft border-warning/35',
  info: 'bg-info-soft border-info/25',
}

/** Los botones grandes de MGG (`surt-btn`): icono, título y una línea chica. */
function BotonGrande({
  tono,
  icono,
  titulo,
  sub,
  className,
  onClick,
}: {
  tono: TonoBoton
  icono?: string
  titulo: string
  sub: string
  className?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-card flex min-h-[96px] w-full flex-col items-center justify-center gap-1 border p-4 text-center transition-[filter] active:brightness-95',
        TONOS_BOTON[tono],
        className,
      )}
    >
      {icono ? (
        <span className="text-2xl leading-none" aria-hidden>
          {icono}
        </span>
      ) : null}
      <span className="text-ink/90 text-base font-semibold">{titulo}</span>
      <small className="text-ink/55 text-xs leading-snug">{sub}</small>
    </button>
  )
}

function FilaProducto({
  producto: p,
  categoria,
  disabled,
  onClick,
}: {
  producto: ProductoEnAlmacen
  categoria: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="bg-surface shadow-card flex w-full items-center gap-3 rounded-[10px] p-3 text-left disabled:cursor-default"
    >
      <span className="text-2xl" aria-hidden>
        📦
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-ink/90 block truncate font-medium">{p.nombre}</span>
        <span className="text-ink/55 block truncate text-xs">
          {p.codigo} · {categoria}
        </span>
      </span>
      <span className="tabular shrink-0 text-right font-semibold whitespace-nowrap">
        {num(p.stock)} <small className="font-semibold">{p.unidad}</small>
      </span>
    </button>
  )
}

/** El aviso de mala señal de las demás vistas de teléfono, a los doce segundos. */
function useTardaPorLaSeñal(guardando: boolean) {
  const [tarda, setTarda] = useState(false)
  useEffect(() => {
    if (!guardando) {
      setTarda(false)
      return
    }
    const t = setTimeout(() => setTarda(true), SEGUNDOS_PARA_AVISAR_DE_LA_SEÑAL * 1000)
    return () => clearTimeout(t)
  }, [guardando])
  return tarda
}

function AvisoDeSeñal() {
  return (
    <p className="border-warning/30 bg-warning-soft text-ink/80 rounded-card border p-3 text-sm">
      Está tardando por la señal. <strong>La entrada ya se está guardando: no la cargue otra vez.</strong>
    </p>
  )
}

/** La casilla de «sin valorar», la misma de `AlmacenEntrada`. */
function CasillaSinValor({ marcada, onCambiar }: { marcada: boolean; onCambiar: (v: boolean) => void }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm',
        marcada ? 'border-warning/30 bg-warning-soft' : 'border-hairline',
      )}
    >
      <input
        type="checkbox"
        className="accent-royal-600 mt-0.5 size-4 shrink-0"
        checked={marcada}
        onChange={(e) => onCambiar(e.target.checked)}
      />
      <span className="text-ink/80">Donación, o no se sabe cuánto costó</span>
    </label>
  )
}

function TituloDePaso({ icono, children }: { icono: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-2xl" aria-hidden>
        {icono}
      </span>
      <strong className="text-lg leading-snug">{children}</strong>
    </div>
  )
}

/* ──────────────────────────────────────── ＋ producto nuevo (MGG `FormNuevo`) */

/*
  La regla de MGG: si entra cantidad, el costo es obligatorio —sin costo el
  almacén queda valorado en $0—. Aquí además existe «sin valorar», que guarda
  el hueco como hueco (`registrar_entradas`, 12/09/2026), así que el mensaje
  lo ofrece en vez de mandar a la PC a hacer un ajuste.
*/
const MENSAJE_COSTO =
  'Una entrada necesita el costo unitario (USD). Sin costo el producto entra valorado en $0 y descuadra el valor del almacén. Si de verdad no se sabe, marca «Donación, o no se sabe cuánto costó».'

function FormNuevo({
  almacen,
  productos,
  quien,
  empresa,
  etiquetaCategoria,
  onCancel,
  onHecho,
}: {
  almacen: Sitio
  productos: ProductoEnAlmacen[]
  quien: string
  empresa: string
  etiquetaCategoria: (codigo: string) => string
  onCancel: () => void
  onHecho: (titulo: string, texto: string) => void
}) {
  const { data: categorias } = useCategoriasDeInventario()
  const { data: unidades } = useUnidades()
  const crear = useCrearArticulo()
  const entrada = useRegistrarEntradas()

  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState('')
  const [unidad, setUnidad] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [costo, setCosto] = useState('')
  const [sinValor, setSinValor] = useState(false)
  // «Es otra cosa distinta»: la base pide confirmar cuando ya hay uno que se llama igual.
  const [otraCosa, setOtraCosa] = useState(false)
  // La primera entrada de un artículo no tiene con qué comparar el costo: la base pide aceptarlo.
  const [costoComprobado, setCostoComprobado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const tarda = useTardaPorLaSeñal(guardando)

  const cant = Number(cantidad) || 0
  const precio = Number(costo) || 0
  const pideCosto = cant > 0 && !sinValor

  const guardar = async () => {
    const n = nombre.trim().replace(/\s+/g, ' ').toUpperCase()
    if (!n) return toast('Escribe el nombre del producto.', 'error')
    if (!categoria) return toast('Elige la categoría del producto.', 'error')
    if (!unidad) return toast('Elige la unidad (kg, und, saco…).', 'error')
    if (cant < 0) return toast('La cantidad no puede ser negativa.', 'error')
    if (pideCosto && !(precio > 0)) return toast(MENSAJE_COSTO, 'error')
    if (pideCosto && !costoComprobado) {
      return toast('Comprueba el costo con la factura y marca la casilla de abajo.', 'error')
    }
    if (productos.some((p) => sinAcentos(p.nombre.trim()) === sinAcentos(n))) {
      return toast(`«${n}» ya está en ${almacen.nombre}: cárgale lo que llegó con «Entrada».`, 'error')
    }

    setGuardando(true)
    try {
      // El código lo pone la base con el prefijo de la categoría, como en el catálogo.
      const id = await crear.mutateAsync({
        codigo: '',
        nombre: n,
        categoria,
        unidad,
        inventariable: true,
        confirmado: otraCosa,
      })
      const codigo = await leerCodigoDeArticulo(id).catch(() => `#${id}`)
      if (cant > 0) {
        try {
          await entrada.mutateAsync({
            almacen_id: almacen.id,
            renglones: [
              {
                almacen_id: almacen.id,
                articulo_id: id,
                cantidad: cant,
                costo: sinValor ? 0 : precio,
                moneda: 'USD',
                confirmado: costoComprobado,
                sin_valor: sinValor,
              },
            ],
            motivo: `Stock inicial al dar de alta el producto · ${almacen.nombre} (teléfono)`,
            referencia: null,
          })
        } catch (err) {
          /*
            El artículo ya existe: volver a «Guardar» lo crearía dos veces. Se
            dice qué pasó y se vuelve al inicio, donde se le carga con Entrada.
          */
          toast(
            `El producto ${codigo} quedó creado pero sin stock (${mensajeDe(err, 'error')}). Cárgale la cantidad con «Entrada».`,
            'error',
          )
          onCancel()
          return
        }
      }
      toast(`Producto ${codigo} cargado en ${almacen.nombre}`, 'success')
      onHecho(
        `Cargado en ${almacen.nombre}: ${codigo}`,
        mensajeProductoNuevo({
          almacen: almacen.nombre,
          empresa,
          codigo,
          nombre: n,
          categoria: etiquetaCategoria(categoria),
          unidad,
          cantidad: cant,
          costo: sinValor ? null : precio,
          sinValor,
          quien,
        }),
      )
    } catch (err) {
      toast(mensajeDe(err, 'No se pudo guardar'), 'error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form
      className="bg-surface shadow-card mt-4 space-y-4 rounded-[10px] p-4"
      onSubmit={(e) => {
        e.preventDefault()
        void guardar()
      }}
    >
      <TituloDePaso icono="＋">Producto nuevo · {almacen.nombre}</TituloDePaso>

      <div>
        <Input
          label="Nombre"
          value={nombre}
          autoFocus
          autoComplete="off"
          placeholder="Ej.: MANGUERA 2 PULGADAS"
          onChange={(e) => {
            setNombre(e.target.value)
            setOtraCosa(false)
          }}
        />
        <ParecidosAEste nombre={nombre} confirmado={otraCosa} onConfirmar={setOtraCosa} />
      </div>

      <SelectBuscable
        label="Categoría"
        vacio="Elegir…"
        valor={categoria}
        onCambio={setCategoria}
        opciones={opcionesDeCategoria(categorias)}
      />

      <Select
        label="Unidad"
        vacio="Elegir…"
        value={unidad}
        onChange={(e) => setUnidad(e.target.value)}
        opciones={(unidades ?? []).map((u) => ({ valor: u.codigo, etiqueta: `${u.nombre} (${u.codigo})` }))}
      />

      <Input
        label="¿Cuánto hay?"
        type="number"
        inputMode="decimal"
        placeholder="0"
        className="text-lg"
        value={cantidad}
        onChange={(e) => {
          setCantidad(e.target.value)
          setCostoComprobado(false)
        }}
        hint="Lo que entra hoy. Si no llegó nada todavía, déjalo en 0."
      />

      <Input
        label={`Costo c/u (USD)${pideCosto ? ' *' : ''}`}
        type="number"
        inputMode="decimal"
        placeholder={pideCosto ? 'Obligatorio' : '0'}
        value={costo}
        disabled={sinValor}
        onChange={(e) => {
          setCosto(e.target.value)
          setCostoComprobado(false)
        }}
        error={pideCosto && costo.trim() !== '' && !(precio > 0) ? 'Si entra cantidad, el costo es obligatorio.' : undefined}
      />

      <CasillaSinValor
        marcada={sinValor}
        onCambiar={(v) => {
          setSinValor(v)
          if (v) setCosto('')
          setCostoComprobado(false)
        }}
      />

      {/* Lo mismo que `AvisoDeCosto` dice la primera vez —y que la base exige—,
          escrito aquí porque el artículo todavía no existe para preguntárselo. */}
      {pideCosto && precio > 0 ? (
        <div className="border-hairline bg-ink/4 rounded-card border p-2.5">
          <p className="text-ink/80 text-xs leading-relaxed">
            <strong>Es la primera vez que entra a este almacén</strong>, así que no hay con qué comparar el costo.
            Serán <span className="tabular">{num(cant)}</span> {unidad} a{' '}
            <span className="tabular font-semibold">{num(precio)} USD</span> cada una, que son{' '}
            <span className="tabular font-semibold">{num(cant * precio)} USD</span>. Este costo se convierte en la
            referencia de todo lo que entre después.
          </p>
          <label className="text-ink/70 mt-2 flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={costoComprobado}
              onChange={(e) => setCostoComprobado(e.target.checked)}
            />
            Lo comprobé con la factura
          </label>
        </div>
      ) : null}

      {tarda ? <AvisoDeSeñal /> : null}

      <Button type="submit" block size="lg" disabled={guardando}>
        {guardando ? 'Guardando…' : '✓ Guardar producto'}
      </Button>
      <Button block variant="ghost" size="lg" disabled={guardando} onClick={onCancel}>
        Cancelar
      </Button>
    </form>
  )
}

/* ──────────────────────────────────────── ⬇ entrada (MGG `FormEntrada`) */

function FormEntrada({
  almacen,
  producto,
  articulo,
  quien,
  empresa,
  onCancel,
  onHecho,
}: {
  almacen: Sitio
  producto: ProductoEnAlmacen
  articulo: Articulo | undefined
  quien: string
  empresa: string
  onCancel: () => void
  onHecho: (titulo: string, texto: string) => void
}) {
  const entrada = useRegistrarEntradas()
  const monedas = useMonedasUsables()
  const { data: formasDeContar } = useTodasLasPresentaciones()
  const art = conSusFormas(articulo, formasDeContar)

  const [cantidad, setCantidad] = useState('')
  const [captura, setCaptura] = useState<CantidadCapturada | null>(null)
  const [costo, setCosto] = useState('')
  const [moneda, setMoneda] = useState('USD')
  const [sinValor, setSinValor] = useState(false)
  const [confirmado, setConfirmado] = useState(false)
  const [nota, setNota] = useState('')
  /*
    LAS PRESENTACIONES Y LA MONEDA VAN PLEGADAS (fase 1a). Lo de todos los días
    es la pantalla de MGG: cuánto llegó y a cuánto, en dólares. Contar en
    bultos, pagar en bolívares o meter una donación es lo raro, y abrirlo
    cambia los dos campos por los mismos de la entrada de escritorio.
  */
  const [masOpciones, setMasOpciones] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const tarda = useTardaPorLaSeñal(guardando)

  const cant = Number(cantidad) || 0
  const precio = Number(costo) || 0
  const hay = producto.stock
  const u = producto.unidad
  const listoParaGuardar = cant > 0 && (sinValor || (precio > 0 && !!moneda))

  const guardar = async () => {
    if (!(cant > 0)) return toast('Escribe cuánto llegó.', 'error')
    if (!sinValor && !(precio > 0)) return toast(MENSAJE_COSTO, 'error')
    setGuardando(true)
    try {
      const enBultos = masOpciones && captura?.presentaciones ? captura : null
      // `registrar_entradas` pide de dónde vino: la nota si la hay; si no, lo que MGG escribe solo.
      const motivo = nota.trim()
        ? `${nota.trim()} · ${almacen.nombre} (teléfono)`
        : `Entrada en ${almacen.nombre} (teléfono)`
      await entrada.mutateAsync({
        almacen_id: almacen.id,
        renglones: [
          {
            almacen_id: almacen.id,
            articulo_id: producto.id,
            cantidad: enBultos ? enBultos.sueltas : cant,
            presentaciones: enBultos?.presentaciones ?? null,
            presentacion: enBultos?.unidad ?? null,
            costo: sinValor ? 0 : precio,
            moneda,
            confirmado,
            sin_valor: sinValor,
          },
        ],
        motivo,
        referencia: null,
      })
      const titulo = `Entrada: +${num(cant)} ${u} de ${producto.nombre}`
      toast(titulo, 'success')
      onHecho(
        titulo,
        mensajeEntrada({
          almacen: almacen.nombre,
          empresa,
          nombre: producto.nombre,
          codigo: producto.codigo,
          unidad: u,
          cantidad: cant,
          stockDespues: hay + cant,
          costo: sinValor ? null : precio,
          moneda,
          sinValor,
          nota,
          quien,
        }),
      )
    } catch (err) {
      toast(mensajeDe(err, 'No se pudo guardar'), 'error')
    } finally {
      setGuardando(false)
    }
  }

  const cambiarCantidad = (v: string, cap: CantidadCapturada | null) => {
    setCantidad(v)
    setCaptura(cap)
    setConfirmado(false)
  }
  const cambiarCosto = (v: string) => {
    setCosto(v)
    setConfirmado(false)
  }

  const pistaCantidad = cant > 0 ? `Queda en ${num(hay + cant)} ${u}.` : undefined
  const pistaCosto = `${
    producto.costoPromedio && producto.costoPromedio > 0 ? `Costo promedio actual: $${num(producto.costoPromedio)}. ` : ''
  }Lo que costó cada ${u || 'unidad'} que llegó.`

  return (
    <form
      className="bg-surface shadow-card mt-4 space-y-4 rounded-[10px] p-4"
      onSubmit={(e) => {
        e.preventDefault()
        void guardar()
      }}
    >
      <div>
        <TituloDePaso icono="⬇">Entrada · {producto.nombre}</TituloDePaso>
        <p className="text-ink/55 mt-1 text-sm">
          {producto.codigo} · hay {num(hay)} {u} en {almacen.nombre}
        </p>
      </div>

      {masOpciones ? (
        <CantidadDeArticulo
          label={`¿Cuánto llegó? (${u})`}
          valor={cantidad}
          articulo={art}
          hint={pistaCantidad}
          onCambiar={(v, cap) => cambiarCantidad(v, cap)}
        />
      ) : (
        <Input
          label={`¿Cuánto llegó? (${u})`}
          type="number"
          inputMode="decimal"
          placeholder="0"
          autoFocus
          className="text-lg"
          value={cantidad}
          onChange={(e) => cambiarCantidad(e.target.value, null)}
          hint={pistaCantidad}
        />
      )}

      {masOpciones ? (
        // El campo de la casa trae su rótulo («Costo por {u}» o por bulto) y su pista.
        <CostoDeArticulo valor={costo} onCambiar={cambiarCosto} articulo={art} moneda={moneda} disabled={sinValor} />
      ) : (
        <Input
          label="Costo c/u (USD) *"
          type="number"
          inputMode="decimal"
          placeholder="Obligatorio"
          value={costo}
          onChange={(e) => cambiarCosto(e.target.value)}
          hint={pistaCosto}
        />
      )}

      {masOpciones ? (
        <>
          <Select
            label="Moneda"
            value={moneda}
            disabled={sinValor}
            onChange={(e) => {
              setMoneda(e.target.value)
              setConfirmado(false)
            }}
            opciones={enSimbolos(monedas.data)}
          />
          <CasillaSinValor
            marcada={sinValor}
            onCambiar={(v) => {
              setSinValor(v)
              if (v) setCosto('')
              setConfirmado(false)
            }}
          />
        </>
      ) : (
        <button
          type="button"
          className="text-royal-600 text-sm underline decoration-dotted underline-offset-4"
          onClick={() => setMasOpciones(true)}
        >
          Contar en bultos, otra moneda o donación
        </button>
      )}

      {!sinValor ? (
        <AvisoDeCosto
          almacenId={almacen.id}
          articuloId={producto.id}
          costo={precio}
          moneda={moneda}
          cantidad={cant}
          unidad={u}
          nombre={producto.nombre}
          confirmado={confirmado}
          onConfirmar={setConfirmado}
        />
      ) : null}

      <Input
        label="Nota"
        autoComplete="off"
        placeholder="De dónde vino, quién lo trajo…"
        value={nota}
        onChange={(e) => setNota(e.target.value)}
      />

      {tarda ? <AvisoDeSeñal /> : null}

      <Button type="submit" block size="lg" disabled={guardando || !listoParaGuardar}>
        {guardando ? 'Guardando…' : '✓ Guardar entrada'}
      </Button>
      <Button block variant="ghost" size="lg" disabled={guardando} onClick={onCancel}>
        ← Otro producto
      </Button>
      <p className="text-center text-sm">
        <Link
          to="/app/inventario/almacen/entrada"
          className="text-ink/55 underline decoration-dotted underline-offset-4"
        >
          Varios productos a la vez
        </Link>
      </p>
    </form>
  )
}

/* ──────────────────────────────────────── ✅ listo (MGG `Listo`) */

/*
  Lo guardado: el aviso para WhatsApp y la vuelta al inicio. Nada se manda
  solo. Sin «📄 Ver PDF del comprobante»: aquí todavía no hay un comprobante
  de una entrada suelta que reutilizar.
*/
function Listo({ titulo, texto, onVolver }: { titulo: string; texto: string; onVolver: () => void }) {
  const [copiado, setCopiado] = useState(false)

  // En el teléfono, la hoja de compartir del teléfono (como MGG y ModalWhatsappCompra).
  const puedeCompartir =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    window.matchMedia('(pointer: coarse)').matches

  const enviar = async () => {
    if (puedeCompartir) {
      try {
        await navigator.share({ text: texto })
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`, '_blank', 'noopener,noreferrer')
  }

  const copiar = async () => {
    const ok = await copiarAlPortapapeles(texto)
    setCopiado(ok)
    toast(
      ok ? 'Mensaje copiado' : 'No se pudo copiar. Mantén el dedo sobre el texto para copiarlo.',
      ok ? 'success' : 'error',
    )
  }

  return (
    <div className="bg-surface shadow-card mt-4 space-y-4 rounded-[10px] p-4">
      <TituloDePaso icono="✅">{titulo}</TituloDePaso>
      <pre className="bg-ink/4 text-ink/80 max-h-[50vh] overflow-auto rounded-[6px] p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap select-all">
        {texto}
      </pre>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button size="lg" onClick={() => void enviar()}>
          📲 Enviar por WhatsApp
        </Button>
        <Button size="lg" variant="outline" onClick={() => void copiar()}>
          {copiado ? '✅ Copiado' : '📋 Copiar'}
        </Button>
      </div>
      <Button block size="lg" variant="ghost" onClick={onVolver}>
        ← Volver al inicio
      </Button>
    </div>
  )
}
