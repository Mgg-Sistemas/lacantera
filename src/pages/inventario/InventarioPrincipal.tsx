import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Boxes, ChevronDown, Search } from 'lucide-react'
import { Pestanas } from '@/components/Pestanas'
import type { Pestana } from '@/components/Pestanas'
import { PESTANAS_MATERIAL } from '@/components/pestanasDeModulos'
import { Visor } from '@/components/Visor'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import {
  useArticulos,
  useCambiarEstadoArticulo,
  useCategoriasDeInventario,
  useEliminarArticuloDuplicado,
  useMisRoles,
} from '@/lib/api/catalogo'
import type { Articulo } from '@/lib/api/catalogo'
import {
  useAlmacenes,
  useExistencias,
  useExistenciasTotales,
  useMovimientos,
  usePropietarios,
} from '@/lib/api/inventario'
import type { Existencia } from '@/lib/api/inventario'
import { usePorRecibir } from '@/lib/api/pedidos'
import { useMisAcciones, useMisPermisos } from '@/lib/api/usuarios'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { useEmpresa } from '@/lib/api/empresa'
import { useSesion } from '@/lib/sesion'
import { armarActaExistencias } from '@/lib/ficha/actaExistencias'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { LA_CASA, detalleDeDueno } from '@/lib/deQuien'
import { useNotaDeTraslado } from '@/pages/salidas/NotaDeTraslado'
import { dolares, enteros } from '@/lib/formato'
import { cn } from '@/lib/cn'
import { Categorias } from './Articulos'
import { ModalCorregirCosto, ModalDesglose } from './Existencias'
import { MaterialPorRecibir } from './MaterialPorRecibir'
import { ModalAlTaller } from './ModalAlTaller'
import { ModalCambioDeDueno } from './ModalCambioDeDueno'
import { ModalEditarArticulo } from './ModalEditarArticulo'
import { ModalTraslado } from './ModalTraslado'
import { ModalTrasvase } from './ModalTrasvase'
import { QueHacerDelInventario } from './Tablero'
import { decorate } from './restock'
import type { AbcClass, Decoracion, ProductoParaRestock } from './restock'

/*
  ⬢ INVENTARIO · LA PANTALLA PRINCIPAL DE MGG (fase 2, 08/11/2026)

  La dueña decidió el 08/11/2026 que `/app/inventario` sea la pantalla de
  inventario de MGG (`InventarioModulo` en `InventarioPage.tsx`): título,
  barra de botones, KPIs, tarjeta de stock crítico, filtros y tabla con ABC,
  umbral y estado. El Tablero de antes («Qué hacer», «Primera vez») no se
  borra: queda plegado al final.

  REGLAS QUE MANDAN AQUÍ (spec `mgg-inventario/7-fases.md`, fase 2)
  - Solo interfaz. Ninguna migración, ninguna escritura nueva: cada botón abre
    el modal o la pantalla de La Cantera que ya hace eso. Los modales propios
    de MGG llegan en las fases 3 («📋» trazabilidad y «↕» movimiento) y 4
    (resumen, exportar, importar, sin costo, deshabilitados).
  - El stock sigue siendo la suma del libro (`v_existencias`). La fila es un
    artículo del catálogo con su stock sumado en el ámbito elegido (almacén y
    dueño), igual que los «productos virtuales» de MGG en una sede.
  - Combustible no se toca: los almacenes COMBUSTIBLE y TRANSITO quedan fuera
    del selector y de todas las cuentas de esta pantalla.
  - Estructura y textos de MGG; estilo y componentes de La Cantera.
*/

/** Los sitios que esta pantalla no mira (spec, regla general). */
const FUERA = ['COMBUSTIBLE', 'TRANSITO']

/** Cuántas filas se pintan de una vez. El catálogo pasa de mil artículos. */
const TANDA = 200

type FiltroStock = '' | 'critico' | 'restock' | 'ok' | 'sin_mov'

/** Entera si es entera, con dos decimales si no. */
function cantidad(valor: number): string {
  return Number.isInteger(valor)
    ? enteros(valor)
    : valor.toLocaleString('es-VE', { maximumFractionDigits: 2 })
}

/** Un producto de la tabla: el artículo con su stock en el ámbito elegido. */
interface ProductoBase extends ProductoParaRestock {
  articulo: Articulo
  sku: string
  categoria: string
  unidad: string
  /** Las filas de `v_existencias` del ámbito: un almacén por fila. */
  filas: Existencia[]
  /** Lo que se ve en «Stock en {ámbito}». */
  stock: number
  /** De ese stock, cuánto es de otros dueños (solo sin filtro de dueño). */
  stockAjeno: number
  /** Costo promedio ponderado del ámbito; nulo si no se puede ver. */
  precio: number | null
  /** De la existencia, cuánto entró sin costo. */
  sinValorar: number
}

type Producto = ProductoBase & Decoracion

/** Las acciones que necesitan saber de qué almacén se habla. */
type AccionConAlmacen = 'contar' | 'costo' | 'taller' | 'dueno'

const TITULO_ACCION: Record<AccionConAlmacen, string> = {
  contar: 'Contar',
  costo: 'Corregir el costo',
  taller: 'Al taller',
  dueno: 'Cambiar de dueño',
}

const TONO_ABC: Record<AbcClass, 'royal' | 'info' | 'neutral'> = {
  A: 'royal',
  B: 'info',
  C: 'neutral',
}

export function InventarioPrincipal() {
  const navegar = useNavigate()

  // ---------------------------------------------------------------- datos
  const articulosQ = useArticulos(false)
  const existenciasQ = useExistencias()
  const { data: almacenes } = useAlmacenes()
  // Con los apagados: un tanque de combustible apagado sigue sin contar aquí.
  const { data: todosLosAlmacenes } = useAlmacenes(false)
  const { data: propietarios } = usePropietarios()
  const { data: categorias } = useCategoriasDeInventario()
  const hoy = hoyEnCaracas()
  const movimientosHoy = useMovimientos({ desde: hoy, hasta: hoy, tope: 1000 })
  const porRecibir = usePorRecibir()
  const { data: empresa } = useEmpresa()
  const { nombre: yo } = useSesion()

  // ------------------------------------------------------------- permisos
  /*
    Los mismos que ya usan Existencias y el Catálogo para los mismos botones:
    rol ALMACEN para contar, sacar y trasladar; INVENTARIO.AJUSTAR_COSTO para
    el costo; INVENTARIO en TOTAL para el dueño y las categorías; ADMIN para
    eliminar un duplicado. La base vuelve a comprobarlo todo.
  */
  const { puede: tieneRol } = useMisRoles()
  const { puede: alcanza } = useMisPermisos()
  const { puede: puedeAccion } = useMisAcciones()
  const escribe = alcanza('INVENTARIO', 'ESCRITURA')
  const almacenista = tieneRol('ALMACEN')

  // -------------------------------------------------------------- filtros
  const [texto, setTexto] = useState('')
  const [cats, setCats] = useState<string[]>([])
  const [almacenSel, setAlmacenSel] = useState('')
  const [dueno, setDueno] = useState('')
  const [clase, setClase] = useState<'' | AbcClass>('')
  const [filtroStock, setFiltroStock] = useState<FiltroStock>('')
  const [soloSinCosto, setSoloSinCosto] = useState(false)
  const [limite, setLimite] = useState(TANDA)

  // ------------------------------------------------------------- modales
  const [movimiento, setMovimiento] = useState<Producto | null>(null)
  const [masAcciones, setMasAcciones] = useState<Producto | null>(null)
  const [eligiendo, setEligiendo] = useState<{
    producto: Producto
    accion: AccionConAlmacen
    opciones: Existencia[]
  } | null>(null)
  const [editando, setEditando] = useState<Articulo | null>(null)
  const [desactivando, setDesactivando] = useState<Articulo | null>(null)
  const [duplicando, setDuplicando] = useState<Articulo | null>(null)
  const [desgloseDe, setDesgloseDe] = useState<number | null>(null)
  const [costo, setCosto] = useState<Existencia | null>(null)
  const [alTaller, setAlTaller] = useState<Existencia | null>(null)
  const [cambiandoDueno, setCambiandoDueno] = useState<Existencia | null>(null)
  const [trasvase, setTrasvase] = useState<Existencia | null>(null)
  const [trasladoDesde, setTrasladoDesde] = useState<string | null>(null)
  const [categoriasAbiertas, setCategoriasAbiertas] = useState(false)
  const [acta, setActa] = useState<ArchivoArmado | null>(null)
  const notaDeTraslado = useNotaDeTraslado()

  // «Ver dónde está» usa el modal de Existencias, que pide la fila total.
  const totales = useExistenciasTotales(desgloseDe !== null)
  const totalDelDesglose = (totales.data ?? []).find((t) => t.articulo_id === desgloseDe) ?? null

  // ---------------------------------------------------------- el ámbito
  /*
    LOS SITIOS QUE NO SE MIRAN.

    `useAlmacenes` ya esconde TRANSITO; COMBUSTIBLE se quita aquí. Las filas de
    `v_existencias` traen su tipo, y con eso se cubre también el tránsito.
  */
  const idsFuera = useMemo(() => {
    const ids = new Set<number>()
    for (const a of todosLosAlmacenes ?? []) if (FUERA.includes(a.tipo)) ids.add(a.id)
    for (const e of existenciasQ.data ?? []) if (FUERA.includes(e.almacen_tipo ?? '')) ids.add(e.almacen_id)
    return ids
  }, [todosLosAlmacenes, existenciasQ.data])

  const almacenesUsables = useMemo(
    () => (almacenes ?? []).filter((a) => !FUERA.includes(a.tipo)),
    [almacenes],
  )

  const nombreDeDueno = (codigo?: string | null) =>
    (propietarios ?? []).find((d) => d.codigo === codigo)?.nombre ?? codigo ?? undefined
  const etiquetaDeCategoria = (codigo: string) =>
    (categorias ?? []).find((c) => c.codigo === codigo)?.etiqueta ?? codigo

  /*
    El valor llega NULO a quien no tiene INVENTARIO.VER_VALORACION (la vista lo
    anula en la base). Sin valor visible no hay «Valor del inventario» ni ABC
    por valor: todo cae en C, que es lo que hace MGG con lo que vale 0.
  */
  const veValor = (existenciasQ.data ?? []).some((e) => e.valor_usd !== null)

  const productosScope = useMemo<Producto[]>(() => {
    const filasPorArticulo = new Map<number, Existencia[]>()
    const tocaCombustible = new Set<number>()
    for (const e of existenciasQ.data ?? []) {
      if (idsFuera.has(e.almacen_id)) {
        tocaCombustible.add(e.articulo_id)
        continue
      }
      const lista = filasPorArticulo.get(e.articulo_id) ?? []
      lista.push(e)
      filasPorArticulo.set(e.articulo_id, lista)
    }

    const base: ProductoBase[] = []
    for (const a of articulosQ.data ?? []) {
      /*
        Un producto deshabilitado NO aparece (regla de MGG): vive en «🗄
        PRODUCTOS DESHABILITADOS». Tampoco lo que no lleva existencias
        (servicios) ni el combustible: el artículo que solo vive en el tanque
        se quedaría aquí en cero, como si faltara.
      */
      if (!a.activo || !a.inventariable || a.categoria === 'COMBUSTIBLE') continue
      const todas = filasPorArticulo.get(a.id) ?? []
      if (todas.length === 0 && tocaCombustible.has(a.id)) continue

      const filas = almacenSel ? todas.filter((f) => String(f.almacen_id) === almacenSel) : todas
      // Mirando un almacén, solo lo que ha pasado por él (como MGG en una sede).
      if (almacenSel && filas.length === 0) continue

      /*
        EL DUEÑO, PROPIO DE LA CANTERA.

        `v_existencias` trae por fila lo propio, lo ajeno y la lista de dueños.
        Con «La Cantera» se toma lo propio; con otro dueño, lo ajeno de las
        filas donde él está. Es exacto mientras haya un solo dueño de afuera
        (hoy, la gobernación); con dos en el mismo sitio sumaría los dos.
      */
      const cuantoDe = (f: Existencia) => {
        if (!dueno) return Number(f.existencia)
        if (dueno === LA_CASA) return Number(f.existencia_propia ?? 0)
        return (f.duenos ?? []).includes(dueno) ? Number(f.existencia_ajena ?? 0) : 0
      }

      let stock = 0
      let propio = 0
      let ajeno = 0
      let valor = 0
      let valorado = 0
      let sinValorar = 0
      let hayValor = false
      for (const f of filas) {
        const existencia = Number(f.existencia)
        const aqui = cuantoDe(f)
        stock += aqui
        propio += Number(f.existencia_propia ?? 0)
        ajeno += Number(f.existencia_ajena ?? 0)
        const sv = Math.min(aqui, Number(f.existencia_sin_valorar ?? 0))
        sinValorar += sv
        if (f.valor_usd !== null) {
          hayValor = true
          // Con dueño elegido, la parte del valor que le toca a lo suyo.
          valor += existencia > 0 ? Number(f.valor_usd) * (aqui / existencia) : 0
          valorado += Math.max(0, aqui - sv)
        }
      }
      if (dueno && stock <= 0) continue

      const unaSola = filas.length === 1 ? filas[0] : null
      const precio = !hayValor
        ? null
        : valorado > 0
          ? valor / valorado
          : unaSola?.costo_promedio_usd
            ? Number(unaSola.costo_promedio_usd)
            : null

      /*
        LA ALERTA ES DE LO PROPIO.

        «Bajo el mínimo» es una señal de COMPRA, y solo se compra lo propio
        (regla del Tablero): lo de la gobernación ni enciende ni apaga la
        alerta. Mirando a otro dueño, o un sitio donde todo es ajeno, no se
        alerta (mínimo 0 = no se alerta, ver `restock.ts`).
      */
      const minimo = Number(a.stock_minimo) || 0
      const todoAjeno = !dueno && propio === 0 && ajeno > 0
      const alertable = dueno ? dueno === LA_CASA : !todoAjeno
      const stockAlerta = dueno ? stock : propio

      base.push({
        id: a.id,
        nombre: a.nombre,
        articulo: a,
        sku: a.codigo,
        categoria: a.categoria,
        unidad: a.unidad,
        filas,
        stock,
        stockAjeno: dueno ? 0 : ajeno,
        stockAlerta,
        minimo: alertable ? minimo : 0,
        valor: hayValor ? valor : null,
        precio,
        sinValorar,
      })
    }
    return decorate(base)
  }, [articulosQ.data, existenciasQ.data, idsFuera, almacenSel, dueno])

  const filtrados = useMemo(() => {
    const q = texto.trim().toLowerCase()
    const tokens = q.split(/\s+/).filter(Boolean)
    return productosScope.filter((p) => {
      if (cats.length > 0 && !cats.includes(p.categoria)) return false
      if (clase && p._klass !== clase) return false
      if (filtroStock === 'critico' && !p._critical) return false
      if (filtroStock === 'restock' && !(p._needsRestock && !p._critical)) return false
      if (filtroStock === 'ok' && p._needsRestock) return false
      if (filtroStock === 'sin_mov' && p.stock > 0) return false
      if (soloSinCosto && p.sinValorar <= 0) return false
      if (tokens.length > 0) {
        /*
          Búsqueda POR PALABRAS, como MGG: cada palabra tiene que aparecer en
          algún dato, en cualquier orden. Aquí no hay alias, modelo ni
          ubicación física; se busca en lo que el catálogo sí guarda.
        */
        const a = p.articulo
        const pajar = [
          a.codigo,
          a.codigo_anterior,
          a.nombre,
          a.marca,
          a.numero_parte,
          a.descripcion,
          a.presentacion,
          a.categoria,
          etiquetaDeCategoria(a.categoria),
          a.unidad,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!tokens.every((t) => pajar.includes(t))) return false
      }
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productosScope, texto, cats, clase, filtroStock, soloSinCosto, categorias])

  // Volver a la primera tanda cuando cambia lo que se busca.
  useEffect(() => {
    setLimite(TANDA)
  }, [texto, cats, clase, filtroStock, soloSinCosto, almacenSel, dueno])

  // ---------------------------------------------------------------- KPIs
  const kpis = useMemo(
    () => ({
      total: productosScope.length,
      valor: productosScope.reduce((s, p) => s + (p.valor ?? 0), 0),
      criticos: productosScope.filter((p) => p._critical).length,
    }),
    [productosScope],
  )
  const movHoy = (movimientosHoy.data ?? []).filter((m) => !idsFuera.has(m.almacen_id)).length
  const sinCosto = productosScope.filter((p) => p.sinValorar > 0).length
  const deshabilitados = (articulosQ.data ?? []).filter((a) => !a.activo && a.inventariable).length
  const recepciones = porRecibir.data?.length ?? 0

  const nombreAlmacenSel = almacenesUsables.find((a) => String(a.id) === almacenSel)?.nombre
  const stockLabel = `Stock en ${nombreAlmacenSel ?? 'todos los almacenes'}${
    dueno ? ` · de ${nombreDeDueno(dueno)}` : ''
  }`

  // ------------------------------------------------------------ acciones
  const verFicha = (id: number) => void navegar(`/app/inventario/articulos/${id}`)

  const ejecutar = (accion: AccionConAlmacen, fila: Existencia) => {
    setEligiendo(null)
    setMasAcciones(null)
    setMovimiento(null)
    if (accion === 'contar') {
      // El conteo vive dentro de Existencias (ver el efecto `accion` de allá).
      void navegar(
        `/app/inventario/existencias?almacen=${fila.almacen_id}&accion=contar&articulo=${fila.articulo_id}`,
      )
    } else if (accion === 'costo') setCosto(fila)
    else if (accion === 'taller') setAlTaller(fila)
    else setCambiandoDueno(fila)
  }

  /** Con un solo almacén posible va directo; con varios, se pregunta cuál. */
  const conAlmacen = (producto: Producto, accion: AccionConAlmacen, opciones: Existencia[]) => {
    if (opciones.length === 1) ejecutar(accion, opciones[0])
    else {
      setMasAcciones(null)
      setMovimiento(null)
      setEligiendo({ producto, accion, opciones })
    }
  }

  const conExistencia = (p: Producto) => p.filas.filter((f) => Number(f.existencia) > 0)

  const unicoAlmacen = (p: Producto) => {
    const con = conExistencia(p)
    if (almacenSel) return almacenSel
    return con.length === 1 ? String(con[0].almacen_id) : null
  }

  /*
    «↓ EXPORTAR» = EL ACTA DE EXISTENCIAS DE LO FILTRADO.

    Hasta que llegue el «Exportar inventario» de MGG (fase 4), exporta lo que
    ya exportaba Existencias: el acta en PDF, armada con lo que se está viendo
    y diciendo qué filtro se aplicó.
  */
  const exportar = async () => {
    const filtros = [
      texto.trim() ? `Búsqueda: «${texto.trim()}»` : null,
      cats.length > 0 ? `Categorías: ${cats.map(etiquetaDeCategoria).join(', ')}` : null,
      clase ? `Clase ${clase}` : null,
      filtroStock === 'critico'
        ? 'Crítico'
        : filtroStock === 'restock'
          ? 'Reabastecer (no crítico)'
          : filtroStock === 'ok'
            ? 'Stock óptimo'
            : filtroStock === 'sin_mov'
              ? 'Sin existencias'
              : null,
      soloSinCosto ? 'Solo lo que tiene existencia sin costo' : null,
      dueno ? `Solo lo de ${nombreDeDueno(dueno) ?? dueno}` : null,
    ].filter(Boolean)
    setActa(
      await armarActaExistencias({
        almacen: nombreAlmacenSel ?? null,
        filtro: filtros.length > 0 ? filtros.join(' · ') : null,
        renglones: filtrados.map((p) => ({
          codigo: p.sku,
          articulo: p.nombre,
          unidad: p.unidad,
          existencia: p.stock,
          densidad: p.articulo.densidad_ton_m3,
          costoUsd: veValor ? (p.precio ?? 0) : null,
          valorUsd: veValor ? (p.valor ?? 0) : null,
        })),
        empresa: { razonSocial: empresa?.razon_social ?? '', rif: empresa?.rif ?? '' },
        emitidoPor: yo ?? '',
        momento: new Date(),
      }),
    )
  }

  const hayFiltros =
    !!texto.trim() || cats.length > 0 || !!clase || !!filtroStock || soloSinCosto

  const cargando = articulosQ.isPending || existenciasQ.isPending
  const error = articulosQ.error ?? existenciasQ.error

  /* Las pestañas de siempre, con esta pantalla delante. */
  const pestanas: Pestana[] = [{ etiqueta: 'Inventario', a: '/app/inventario' }, ...PESTANAS_MATERIAL]

  return (
    <>
      {/* ------------------------------------------------ cabecera de MGG */}
      <div className="border-hairline mb-6 border-b pt-6 pb-5">
        <h1 className="text-ink/90 text-2xl font-semibold tracking-tight">⬢ Inventario</h1>
        <p className="text-ink/55 mt-1 text-base">
          Catálogo de productos.{' '}
          <span className="text-ink/40">Política ABC · A 120% · B 100% · C 80% del stock mínimo</span>
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            to="/app/inventario/almacen"
            title="Inventario y Almacenes con botones grandes para el teléfono: producto nuevo, entrada, salida, traslado y WhatsApp"
          >
            <Button variant="ghost" size="sm">📱 Vista teléfono</Button>
          </Link>
          {/* La cola de recepciones vive en «Solicitudes de pedido» desde la
              fase 5b de compras: el botón lleva allí, no la duplica. */}
          <Link to="/app/solicitudes-pedido?pestana=recepciones" title="Órdenes de compra por recibir">
            <Button variant="ghost" size="sm">
              Recepciones
              {recepciones > 0 ? <Chip tone="warning">{recepciones}</Chip> : null}
            </Button>
          </Link>
          {alcanza('INVENTARIO', 'TOTAL') ? (
            <Button
              variant="ghost"
              size="sm"
              title="Gestionar categorías (crear, depurar, eliminar)"
              onClick={() => setCategoriasAbiertas(true)}
            >
              ⚙ Categorías
            </Button>
          ) : null}
          <Link to="/app/inventario/articulos/carga" title="Descargar plantilla de carga masiva">
            <Button variant="ghost" size="sm">↓ Plantilla</Button>
          </Link>
          {escribe ? (
            <Link to="/app/inventario/articulos/carga" title="Importar productos desde un Excel">
              <Button variant="ghost" size="sm">↑ Importar Excel</Button>
            </Link>
          ) : null}
          {/* Hasta el «📊 Resumen de Inventario» de MGG (fase 4), el libro de
              movimientos con su agrupado es lo que resume aquí. */}
          <Link
            to="/app/inventario/movimientos"
            title="Resumen de inventario: entradas, salidas y traslados, agrupados"
          >
            <Button variant="ghost" size="sm">📊 Resumen</Button>
          </Link>
          {/* Solo aparece si hay algo pendiente, como en MGG. Aquí «sin costo»
              es lo que entró «sin valorar»; se corrige con «⋯ › Corregir el
              costo» de cada fila. */}
          {sinCosto > 0 ? (
            <Button
              variant={soloSinCosto ? 'soft' : 'ghost'}
              size="sm"
              title="Existencias con stock pero sin valorar: cargales el costo unitario"
              onClick={() => setSoloSinCosto((v) => !v)}
            >
              ⚠ Sin costo <Chip tone="warning">{sinCosto}</Chip>
            </Button>
          ) : null}
          {deshabilitados > 0 ? (
            <Link
              to="/app/inventario/articulos?desactivados=1"
              title="Productos deshabilitados: mientras no se reactiven, no existen para el sistema"
            >
              <Button variant="ghost" size="sm">
                🗄 PRODUCTOS DESHABILITADOS <Chip tone="neutral">{deshabilitados}</Chip>
              </Button>
            </Link>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            title="Exportar inventario filtrado"
            disabled={filtrados.length === 0}
            onClick={() => void exportar()}
          >
            ↓ Exportar
          </Button>
          {escribe ? (
            <Link to="/app/inventario/articulos?nuevo=1" className="sm:ml-auto">
              <Button size="sm">+ Nuevo producto</Button>
            </Link>
          ) : null}
        </div>
      </div>

      <Pestanas pestanas={pestanas} />

      {cargando ? <Cargando texto="Cargando productos…" /> : null}
      {error ? <ErrorDeCarga error={error} className="mb-4" /> : null}

      {!cargando && !error ? (
        <>
          {/* --------------------------------------------------- KPIs */}
          <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icono="⬢" label="Productos activos" valor={enteros(kpis.total)} pie="SKUs en catálogo" />
            <Kpi
              icono="$"
              label="Valor del inventario"
              valor={veValor ? dolares(kpis.valor) : '—'}
              pie={veValor ? 'stock × precio' : 'Sin permiso para ver el valor'}
            />
            <Kpi
              icono="⚠"
              label="En estado crítico"
              valor={enteros(kpis.criticos)}
              pie={kpis.criticos > 0 ? 'requieren atención' : 'todo en orden'}
              alerta={kpis.criticos > 0}
            />
            {/* MGG pone aquí «🔥 En fundición»; aquí no hay fundición. */}
            <Kpi
              icono="↕"
              label="Movimientos de hoy"
              valor={enteros(movHoy)}
              pie="Entradas, salidas y traslados"
            />
          </div>

          {/* ------------------------- alertas y material de clientes */}
          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start">
            <AlertasStock productos={productosScope} onVerProducto={verFicha} />
            {/* Lo que un cliente trae para pagar una factura: lo único de la
                pantalla que alguien más está esperando. Se esconde solo
                cuando no hay nada. */}
            <div className="min-w-0 flex-1 empty:hidden [&>div]:mb-0">
              <MaterialPorRecibir />
            </div>
          </div>

          {/* ------------------------------------------------- filtros */}
          <Card className="mb-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <div className="sm:col-span-2 lg:col-span-3 xl:col-span-2">
                <Input
                  label="Buscar"
                  icon={<Search />}
                  placeholder="Buscar: nombre, código, medida, marca… (ej. clavo media pulgada)"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                />
              </div>
              <CategoriasConCasillas
                opciones={(categorias ?? [])
                  .filter((c) => productosScope.some((p) => p.categoria === c.codigo))
                  .map((c) => ({ valor: c.codigo, etiqueta: c.etiqueta }))}
                seleccionadas={cats}
                onCambio={setCats}
              />
              <SelectBuscable
                label="Almacén"
                vacio="Todos los almacenes"
                valor={almacenSel}
                onCambio={setAlmacenSel}
                opciones={almacenesUsables.map((a) => ({
                  valor: String(a.id),
                  etiqueta: `${a.nombre}${a.tipo === 'TALLER' ? ' · taller' : ''}`,
                  detalle: detalleDeDueno(a.propietario, nombreDeDueno(a.propietario)),
                }))}
              />
              {/* Propio de La Cantera: MGG no tiene dueños. Solo si hay más
                  de uno; con uno solo no separa nada. */}
              {(propietarios ?? []).length > 1 ? (
                <Select
                  label="Dueño"
                  vacio="De todos"
                  value={dueno}
                  onChange={(e) => setDueno(e.target.value)}
                  opciones={(propietarios ?? []).map((d) => ({ valor: d.codigo, etiqueta: d.nombre }))}
                />
              ) : null}
              <Select
                label="Clase ABC"
                vacio="Todas las clases"
                value={clase}
                onChange={(e) => setClase(e.target.value as '' | AbcClass)}
                opciones={[
                  { valor: 'A', etiqueta: 'Clase A' },
                  { valor: 'B', etiqueta: 'Clase B' },
                  { valor: 'C', etiqueta: 'Clase C' },
                ]}
              />
              <Select
                label="Stock"
                vacio="Todo el stock"
                value={filtroStock}
                onChange={(e) => setFiltroStock(e.target.value as FiltroStock)}
                opciones={[
                  { valor: 'critico', etiqueta: 'Crítico' },
                  { valor: 'restock', etiqueta: 'Reabastecer (no crítico)' },
                  { valor: 'ok', etiqueta: 'Stock óptimo' },
                  { valor: 'sin_mov', etiqueta: 'Sin existencias' },
                ]}
              />
            </div>
            {soloSinCosto ? (
              <p className="text-ink/70 mt-3 text-sm">
                Mostrando solo lo que tiene existencia sin costo.{' '}
                <button
                  type="button"
                  onClick={() => setSoloSinCosto(false)}
                  className="text-royal-600 dark:text-royal-300 font-medium underline"
                >
                  Ver todo
                </button>
              </p>
            ) : null}
          </Card>

          {/* --------------------------------------------------- tabla */}
          {filtrados.length === 0 ? (
            <Card>
              <Vacio
                icono={<Boxes />}
                titulo="Sin productos que coincidan con los filtros."
                descripcion={
                  hayFiltros || almacenSel || dueno
                    ? undefined
                    : 'El catálogo está vacío: cargalo con «↑ Importar Excel» o «+ Nuevo producto».'
                }
              />
            </Card>
          ) : (
            <Card flush>
              <div className="border-hairline flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-3">
                <p className="text-ink/60 text-sm">
                  {enteros(filtrados.length)} producto{filtrados.length === 1 ? '' : 's'}
                </p>
              </div>
              {/* La tabla se desplaza sola en el teléfono; la página no. */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-sm">
                  <thead>
                    <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                      <th className="px-5 py-3 font-medium">SKU</th>
                      <th className="px-3 py-3 font-medium">Producto</th>
                      <th className="px-3 py-3 font-medium">Categoría</th>
                      <th className="px-3 py-3 font-medium" title="Clasificación ABC (Pareto)">
                        ABC
                      </th>
                      <th
                        className="px-3 py-3 text-right font-medium"
                        title={`${stockLabel}: solo lo que hay en ese ámbito. El reparto por almacén se ve en «⋯ › Ver dónde está».`}
                      >
                        {stockLabel}
                      </th>
                      <th className="px-3 py-3 text-right font-medium" title="Umbral efectivo según la política">
                        Umbral
                      </th>
                      <th className="px-3 py-3 text-right font-medium">Precio UND</th>
                      <th
                        className="px-3 py-3 text-right font-medium"
                        title="Precio total = stock × precio UND"
                      >
                        Valor
                      </th>
                      <th className="px-3 py-3 font-medium">Estado</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.slice(0, limite).map((p) => (
                      <FilaProducto
                        key={p.id}
                        p={p}
                        categoria={etiquetaDeCategoria(p.categoria)}
                        puedeMover={almacenista}
                        escribe={escribe}
                        onVer={() => verFicha(p.id)}
                        onMovimiento={() => setMovimiento(p)}
                        onEditar={() => setEditando(p.articulo)}
                        onDesactivar={() => setDesactivando(p.articulo)}
                        onMas={() => setMasAcciones(p)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {filtrados.length > limite ? (
                <div className="border-hairline border-t px-5 py-3 text-center">
                  <Button variant="ghost" size="sm" onClick={() => setLimite((l) => l + TANDA)}>
                    Ver {enteros(Math.min(TANDA, filtrados.length - limite))} más de{' '}
                    {enteros(filtrados.length - limite)}
                  </Button>
                </div>
              ) : null}
            </Card>
          )}

          {/* ------------------------------ el Tablero de antes, plegado */}
          <details className="group mt-8">
            <summary className="text-ink/60 hover:text-ink/85 flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <ChevronDown className="size-4 -rotate-90 transition-transform group-open:rotate-0" />
              Qué hacer en el inventario y primera vez
            </summary>
            <div className="mt-2">
              <QueHacerDelInventario faltantes={kpis.criticos} />
            </div>
          </details>
        </>
      ) : null}

      {/* ------------------------------------------- ↕ Movimiento · SKU */}
      {movimiento ? (
        <Modal
          abierto
          ancho="sm"
          onCerrar={() => setMovimiento(null)}
          titulo={`Movimiento · ${movimiento.sku}`}
          descripcion={`${movimiento.nombre}. Elegí el tipo de movimiento: cada uno abre el formulario de siempre.`}
          acciones={
            <Button variant="ghost" onClick={() => setMovimiento(null)}>
              Cancelar
            </Button>
          }
        >
          <div className="grid gap-2">
            <OpcionDeMenu
              titulo="Entrada (suma stock)"
              detalle="Lo que entra sin una compra de por medio, con su costo."
              onClick={() => {
                const alm = unicoAlmacen(movimiento)
                setMovimiento(null)
                void navegar(
                  `/app/inventario/existencias?${alm ? `almacen=${alm}&` : ''}accion=entrada&articulo=${movimiento.id}`,
                )
              }}
            />
            <OpcionDeMenu
              titulo="Salida (resta stock)"
              detalle="Se solicita, y sale cuando la aprueba quien responde por el almacén."
              onClick={() => {
                const alm = unicoAlmacen(movimiento)
                setMovimiento(null)
                void navegar(
                  `/app/salidas/solicitudes?solicitar=1&articulo=${movimiento.id}${alm ? `&almacen=${alm}` : ''}`,
                )
              }}
            />
            <OpcionDeMenu
              titulo="Transferencia a otro almacén"
              detalle="No cambia cuánto hay, cambia dónde está."
              onClick={() => {
                setTrasladoDesde(unicoAlmacen(movimiento) ?? '')
                setMovimiento(null)
              }}
            />
            {movimiento.filas.length > 0 ? (
              <OpcionDeMenu
                titulo="Ajuste manual (cualquier signo)"
                detalle="Conteo físico: la diferencia queda como ajuste, con su motivo."
                onClick={() => conAlmacen(movimiento, 'contar', movimiento.filas)}
              />
            ) : null}
          </div>
        </Modal>
      ) : null}

      {/* ------------------------------------- ⋯ lo propio de La Cantera */}
      {masAcciones ? (
        <Modal
          abierto
          ancho="sm"
          onCerrar={() => setMasAcciones(null)}
          titulo={`${masAcciones.sku} · ${masAcciones.nombre}`}
          descripcion="Lo que La Cantera hace con un artículo y MGG no tiene."
          acciones={
            <Button variant="ghost" onClick={() => setMasAcciones(null)}>
              Cerrar
            </Button>
          }
        >
          <div className="grid gap-2">
            {almacenista && masAcciones.filas.length > 0 ? (
              <OpcionDeMenu
                titulo="Contar"
                detalle="Conteo físico. La diferencia queda como ajuste."
                onClick={() => conAlmacen(masAcciones, 'contar', masAcciones.filas)}
              />
            ) : null}
            {puedeAccion('INVENTARIO.AJUSTAR_COSTO') && conExistencia(masAcciones).length > 0 ? (
              <OpcionDeMenu
                titulo="Corregir el costo"
                detalle="El costo por unidad de lo que hay en un almacén, con su factura."
                onClick={() => conAlmacen(masAcciones, 'costo', conExistencia(masAcciones))}
              />
            ) : null}
            {almacenista && masAcciones.articulo.reparable && conExistencia(masAcciones).length > 0 ? (
              <OpcionDeMenu
                titulo="Al taller"
                detalle="Mandarlo a reparar. Vuelve, no se consume."
                onClick={() => conAlmacen(masAcciones, 'taller', conExistencia(masAcciones))}
              />
            ) : null}
            {alcanza('INVENTARIO', 'TOTAL') &&
            (propietarios ?? []).length > 1 &&
            conExistencia(masAcciones).length > 0 ? (
              <OpcionDeMenu
                titulo="Cambiar de dueño"
                detalle="El material no se mueve; cambia de dueño."
                onClick={() => conAlmacen(masAcciones, 'dueno', conExistencia(masAcciones))}
              />
            ) : null}
            <OpcionDeMenu
              titulo="Ver dónde está"
              detalle="En qué almacenes está y cuánto hay en cada uno."
              onClick={() => {
                setDesgloseDe(masAcciones.id)
                setMasAcciones(null)
              }}
            />
            {tieneRol('ADMIN') ? (
              <OpcionDeMenu
                titulo="Eliminar duplicado"
                detalle="Para lo cargado dos veces o mal cargado. Solo ADMIN."
                peligro
                onClick={() => {
                  setDuplicando(masAcciones.articulo)
                  setMasAcciones(null)
                }}
              />
            ) : null}
          </div>
        </Modal>
      ) : null}

      {/* --------------------------------------- ¿de qué almacén? */}
      {eligiendo ? (
        <Modal
          abierto
          ancho="sm"
          onCerrar={() => setEligiendo(null)}
          titulo={`${TITULO_ACCION[eligiendo.accion]} · ${eligiendo.producto.sku}`}
          descripcion="Está en más de un almacén. Elegí en cuál."
          acciones={
            <Button variant="ghost" onClick={() => setEligiendo(null)}>
              Cancelar
            </Button>
          }
        >
          <div className="grid gap-2">
            {eligiendo.opciones.map((f) => (
              <OpcionDeMenu
                key={f.almacen_id}
                titulo={f.almacen}
                detalle={`${cantidad(Number(f.existencia))} ${f.unidad}`}
                onClick={() => ejecutar(eligiendo.accion, f)}
              />
            ))}
          </div>
        </Modal>
      ) : null}

      {/* ----------------------------------------- ✕ Desactivar */}
      {desactivando ? (
        <ModalDesactivar articulo={desactivando} onCerrar={() => setDesactivando(null)} />
      ) : null}

      {/* -------------------------------------- Eliminar duplicado */}
      {duplicando ? (
        <ModalEliminarDuplicado articulo={duplicando} onCerrar={() => setDuplicando(null)} />
      ) : null}

      {/* Los modales de siempre, los mismos que abre Existencias. */}
      {editando ? <ModalEditarArticulo articulo={editando} onCerrar={() => setEditando(null)} /> : null}
      {costo ? <ModalCorregirCosto fila={costo} onCerrar={() => setCosto(null)} /> : null}
      {cambiandoDueno ? (
        <ModalCambioDeDueno fila={cambiandoDueno} onCerrar={() => setCambiandoDueno(null)} />
      ) : null}
      <ModalAlTaller fila={alTaller} onCerrar={() => setAlTaller(null)} />
      <ModalTrasvase fila={trasvase} onCerrar={() => setTrasvase(null)} />
      <ModalTraslado
        abierto={trasladoDesde !== null}
        onCerrar={() => setTrasladoDesde(null)}
        origen={trasladoDesde || undefined}
        onTrasladado={(t) => {
          if (t.forma !== 'PEDIR') void notaDeTraslado.abrirTraslado(t.id)
        }}
      />
      {notaDeTraslado.visor}
      <ModalDesglose
        articulo={totalDelDesglose}
        onCerrar={() => setDesgloseDe(null)}
        puedeMover={almacenista}
        puedeCorregirCosto={puedeAccion('INVENTARIO.AJUSTAR_COSTO')}
        onTrasvasar={(f) => {
          setDesgloseDe(null)
          setTrasvase(f)
        }}
        onCorregirCosto={(f) => {
          setDesgloseDe(null)
          setCosto(f)
        }}
        onSolicitarSalida={(f) => {
          setDesgloseDe(null)
          void navegar(
            `/app/salidas/solicitudes?solicitar=1&articulo=${f.articulo_id}&almacen=${f.almacen_id}`,
          )
        }}
        onContar={(f) => {
          setDesgloseDe(null)
          ejecutar('contar', f)
        }}
      />
      {categoriasAbiertas ? <Categorias onCerrar={() => setCategoriasAbiertas(false)} /> : null}
      <Visor
        abierto={acta !== null}
        onCerrar={() => setActa(null)}
        blob={acta?.blob ?? null}
        nombreArchivo={acta?.nombre ?? ''}
        titulo="Exportar inventario"
      />
    </>
  )
}

/* -------------------------------------------------------------------------- */

/** Un KPI de MGG con la tarjeta de La Cantera. */
function Kpi({
  icono,
  label,
  valor,
  pie,
  alerta = false,
}: {
  icono: string
  label: string
  valor: string
  pie: string
  alerta?: boolean
}) {
  return (
    <Card className={cn('relative overflow-hidden', alerta && 'border-danger/40 border')}>
      {alerta ? <span className="bg-danger absolute inset-x-0 top-0 h-[3px]" aria-hidden="true" /> : null}
      <div className="flex items-start justify-between gap-3">
        <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">{label}</p>
        <span className={cn('text-lg leading-none', alerta ? 'text-danger' : 'text-ink/25')} aria-hidden="true">
          {icono}
        </span>
      </div>
      <p className="text-ink/90 tabular mt-3 text-3xl font-light">{valor}</p>
      <p className={cn('mt-2 text-xs', alerta ? 'text-danger' : 'text-ink/45')}>{pie}</p>
    </Card>
  )
}

/*
  «⚠ STOCK CRÍTICO» / «PRODUCTOS A REABASTECER» (`AlertasStock.tsx` de MGG).

  Solo si hay algo. Borde rojo si hay críticos, ámbar si no. Ocho botones de
  cada grupo como mucho; el resto se cuenta. Tocar uno abre la ficha del
  artículo (la trazabilidad de MGG llega en la fase 3).
*/
function AlertasStock({
  productos,
  onVerProducto,
}: {
  productos: Producto[]
  onVerProducto: (id: number) => void
}) {
  const criticos = productos.filter((p) => p._critical)
  const reabastecer = productos.filter((p) => p._needsRestock && !p._critical)
  if (!criticos.length && !reabastecer.length) return null

  return (
    <Card
      className={cn(
        'min-w-0 flex-1 border',
        criticos.length ? 'border-danger/40' : 'border-warning/40',
      )}
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-ink/85 font-semibold">
          {criticos.length > 0 ? '⚠ Stock crítico' : 'Productos a reabastecer'}
        </p>
        <p className="text-ink/50 font-mono text-xs">
          {criticos.length > 0 ? `${enteros(criticos.length)} crítico${criticos.length !== 1 ? 's' : ''}` : ''}
          {criticos.length > 0 && reabastecer.length > 0 ? ' · ' : ''}
          {reabastecer.length > 0 ? `${enteros(reabastecer.length)} a reponer` : ''}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {criticos.slice(0, 8).map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant="danger"
            title={`Stock ${cantidad(p.stockAlerta)} < mínimo ${cantidad(p.minimo)}`}
            onClick={() => onVerProducto(p.id)}
          >
            {p.sku} · {cantidad(p.stockAlerta)}/{cantidad(p.minimo)} {p.unidad}
          </Button>
        ))}
        {reabastecer.slice(0, 8).map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant="outline"
            title={`Stock ${cantidad(p.stockAlerta)} ≤ umbral ${cantidad(p._threshold)} (clase ${p._klass})`}
            onClick={() => onVerProducto(p.id)}
          >
            <Chip tone={TONO_ABC[p._klass]}>{p._klass}</Chip>
            {p.sku} · {cantidad(p.stockAlerta)} {p.unidad}
          </Button>
        ))}
        {criticos.length + reabastecer.length > 16 ? (
          <span className="text-ink/50 self-center text-sm">
            …y {enteros(criticos.length + reabastecer.length - 16)} más
          </span>
        ) : null}
      </div>
    </Card>
  )
}

/** Una fila de la tabla de productos (`ProductosTable.tsx` de MGG). */
function FilaProducto({
  p,
  categoria,
  puedeMover,
  escribe,
  onVer,
  onMovimiento,
  onEditar,
  onDesactivar,
  onMas,
}: {
  p: Producto
  categoria: string
  puedeMover: boolean
  escribe: boolean
  onVer: () => void
  onMovimiento: () => void
  onEditar: () => void
  onDesactivar: () => void
  onMas: () => void
}) {
  const umbral = p._threshold
  const conMinimo = p.minimo > 0
  const ratio = conMinimo ? Math.min(1, p.stockAlerta / Math.max(1, umbral)) : 0
  const relleno = p._critical ? 'bg-danger' : ratio < 0.75 ? 'bg-warning' : 'bg-success'

  return (
    <tr className="border-hairline border-b last:border-0">
      <td className="text-ink/60 px-5 py-3 font-mono text-xs">{p.sku}</td>
      <td className="px-3 py-3">
        <p className="text-ink/85 font-medium">{p.nombre}</p>
        {/* La barra de stock de MGG: llena = en el umbral o por encima. */}
        <div
          className="bg-ink/8 mt-1.5 h-1.5 w-[140px] overflow-hidden rounded-full"
          title={conMinimo ? `${Math.round(ratio * 100)} % del umbral` : 'Sin stock mínimo: no tiene punto de pedido'}
        >
          {conMinimo ? (
            <div className={cn('h-full rounded-full', relleno)} style={{ width: `${Math.round(ratio * 100)}%` }} />
          ) : null}
        </div>
      </td>
      <td className="px-3 py-3">
        <Chip>{categoria}</Chip>
      </td>
      <td className="px-3 py-3">
        <Chip tone={TONO_ABC[p._klass]}>{p._klass}</Chip>
      </td>
      <td className="px-3 py-3 text-right whitespace-nowrap">
        <span className={cn('tabular font-semibold', p._critical ? 'text-danger' : 'text-ink/85')}>
          {cantidad(p.stock)}
        </span>
        <span className="text-ink/45 ml-1 text-xs">{p.unidad}</span>
        {p._critical ? (
          <Chip tone="danger" className="ml-2" title="Stock por debajo del mínimo">
            ⚠ crítico
          </Chip>
        ) : p._needsRestock ? (
          <Chip tone="warning" className="ml-2">
            reabastecer
          </Chip>
        ) : null}
        {p.stockAjeno > 0 ? (
          <p className="text-warning text-2xs mt-0.5">{cantidad(p.stockAjeno)} de otros dueños</p>
        ) : null}
      </td>
      <td
        className="tabular text-ink/55 px-3 py-3 text-right whitespace-nowrap"
        title={conMinimo ? `${cantidad(p.minimo)} mín × ${p._pct}%` : 'Sin stock mínimo'}
      >
        {conMinimo ? `≤ ${cantidad(umbral)}` : '—'}
      </td>
      <td className="tabular text-ink/65 px-3 py-3 text-right whitespace-nowrap">
        {p.precio !== null ? dolares(p.precio) : '—'}
      </td>
      <td className="tabular text-ink/85 px-3 py-3 text-right whitespace-nowrap">
        {p.valor !== null ? dolares(p.valor) : '—'}
        {p.sinValorar > 0 ? (
          <p className="text-warning text-2xs mt-0.5">{cantidad(p.sinValorar)} sin valorar</p>
        ) : null}
      </td>
      <td className="px-3 py-3">
        <Chip tone="success">Activo</Chip>
      </td>
      <td className="px-5 py-3 text-right whitespace-nowrap">
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" title="Ver detalle y kardex" aria-label={`Ver ${p.nombre}`} onClick={onVer}>
            📋
          </Button>
          {puedeMover ? (
            <Button
              size="sm"
              variant="ghost"
              title="Registrar movimiento"
              aria-label={`Movimiento de ${p.nombre}`}
              onClick={onMovimiento}
            >
              ↕
            </Button>
          ) : null}
          {escribe ? (
            <>
              <Button size="sm" variant="ghost" onClick={onEditar}>
                Editar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                title="Desactivar"
                aria-label={`Desactivar ${p.nombre}`}
                onClick={onDesactivar}
              >
                ✕
              </Button>
            </>
          ) : null}
          <Button size="sm" variant="ghost" title="Más acciones" aria-label={`Más acciones de ${p.nombre}`} onClick={onMas}>
            ⋯
          </Button>
        </div>
      </td>
    </tr>
  )
}

/** Un renglón grande de los menús «↕» y «⋯»: cabe el dedo en el teléfono. */
function OpcionDeMenu({
  titulo,
  detalle,
  peligro = false,
  onClick,
}: {
  titulo: string
  detalle?: string
  peligro?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-ink/12 hover:border-ink/25 hover:bg-ink/4 rounded-control w-full border px-4 py-3 text-left transition-colors"
    >
      <span className={cn('block text-sm font-medium', peligro ? 'text-danger' : 'text-ink/85')}>
        {titulo}
      </span>
      {detalle ? <span className="text-ink/50 mt-0.5 block text-xs">{detalle}</span> : null}
    </button>
  )
}

/*
  CATEGORÍAS CON CASILLAS (el `MultiCheckFiltro` de MGG).

  Varias a la vez; vacío = todas. El panel se abre debajo del botón y se cierra
  al tocar fuera.
*/
function CategoriasConCasillas({
  opciones,
  seleccionadas,
  onCambio,
}: {
  opciones: { valor: string; etiqueta: string }[]
  seleccionadas: string[]
  onCambio: (v: string[]) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  const rotulo =
    seleccionadas.length === 0
      ? 'Todas las categorías'
      : seleccionadas.length === 1
        ? (opciones.find((o) => o.valor === seleccionadas[0])?.etiqueta ?? seleccionadas[0])
        : `${seleccionadas.length} categorías`

  return (
    <div ref={caja} className="relative w-full min-w-0">
      <p className="text-ink/75 mb-1.5 block text-sm font-medium">Categoría</p>
      <button
        type="button"
        title="Marcá una o varias categorías"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="rounded-control bg-surface text-ink/90 border-ink/20 hover:border-ink/32 relative h-10 w-full truncate border pr-9 pl-3.5 text-left text-base"
      >
        {rotulo}
        <ChevronDown className="text-ink/40 pointer-events-none absolute inset-y-0 right-3 my-auto size-[18px]" />
      </button>
      {abierto ? (
        <div className="bg-surface shadow-card border-ink/12 rounded-control absolute left-0 z-20 mt-1 max-h-72 w-full min-w-[14rem] overflow-y-auto border p-2">
          <p className="text-ink/50 px-2 pb-1 text-xs">Marcá una o varias categorías</p>
          {opciones.map((o) => (
            <label
              key={o.valor}
              className="hover:bg-ink/4 flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm"
            >
              <input
                type="checkbox"
                checked={seleccionadas.includes(o.valor)}
                onChange={(e) =>
                  onCambio(
                    e.target.checked
                      ? [...seleccionadas, o.valor]
                      : seleccionadas.filter((v) => v !== o.valor),
                  )
                }
              />
              <span className="text-ink/85">{o.etiqueta}</span>
            </label>
          ))}
          {seleccionadas.length > 0 ? (
            <button
              type="button"
              onClick={() => onCambio([])}
              className="text-royal-600 dark:text-royal-300 mt-1 px-2 text-xs font-medium underline"
            >
              Todas las categorías
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/*
  ✕ DESACTIVAR, con el motivo que exige `cambiar_estado_articulo` (el mismo
  modal del Catálogo). Reactivar se hace desde «🗄 PRODUCTOS DESHABILITADOS»:
  aquí no hay filas inactivas, como en MGG.
*/
function ModalDesactivar({ articulo, onCerrar }: { articulo: Articulo; onCerrar: () => void }) {
  const cambiarEstado = useCambiarEstadoArticulo()
  const [motivo, setMotivo] = useState('')
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Desactivar ${articulo.nombre}`}
      descripcion="Deja de verse en el catálogo y en los formularios. Su historia no cambia, y se puede volver a activar desde «🗄 PRODUCTOS DESHABILITADOS»."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={cambiarEstado.isPending || motivo.trim().length < 10}
            onClick={async () => {
              await cambiarEstado.mutateAsync({ id: articulo.id, activo: false, motivo })
              onCerrar()
            }}
          >
            {cambiarEstado.isPending ? 'Guardando…' : 'Desactivar'}
          </Button>
        </>
      }
    >
      <Textarea
        label="Motivo"
        rows={3}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        hint="Queda guardado con tu nombre y la fecha. Al menos diez letras."
      />
      {/* Con existencia, o dentro de una cotización enviada o de un traslado,
          la base lo niega y dice por qué. */}
      {cambiarEstado.error ? <ErrorDeCarga error={cambiarEstado.error} className="mt-3" /> : null}
    </Modal>
  )
}

/* Eliminar duplicado: el mismo de Existencias (`eliminar_articulo_duplicado`). */
function ModalEliminarDuplicado({ articulo, onCerrar }: { articulo: Articulo; onCerrar: () => void }) {
  const eliminar = useEliminarArticuloDuplicado()
  const [motivo, setMotivo] = useState('')
  return (
    <Modal
      abierto
      ancho="sm"
      onCerrar={onCerrar}
      titulo={`Eliminar duplicado: ${articulo.nombre}`}
      descripcion="Esto no genera una salida. Si el artículo nunca tuvo movimiento se borra entero; si ya tuvo, reversa cada movimiento (una corrección, no un consumo) y lo desactiva, dejando la existencia en cero. Si figura en una factura, una nota u otro documento, no se puede eliminar: se desactiva."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={eliminar.isPending || motivo.trim().length < 4}
            onClick={async () => {
              await eliminar.mutateAsync({ id: articulo.id, motivo })
              onCerrar()
            }}
          >
            {eliminar.isPending ? 'Eliminando…' : 'Eliminar duplicado'}
          </Button>
        </>
      }
    >
      <Textarea
        label="Motivo (queda en la auditoría)"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Ej.: se cargó dos veces por error al crear el catálogo"
        rows={3}
      />
      {eliminar.error ? <ErrorDeCarga error={eliminar.error} className="mt-3" /> : null}
    </Modal>
  )
}
