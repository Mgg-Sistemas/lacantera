import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
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
  useGuardarFichaDeArticulo,
  useMisRoles,
  useTodasLasPresentaciones,
  useUnidades,
  type Articulo,
} from '@/lib/api/catalogo'
import { useAlmacenes, useExistencias, useRegistrarEntradas, type Almacen as Sitio } from '@/lib/api/inventario'
import { useComoAprueboSalidas } from '@/lib/api/salidas'
import { leerSolicitudPorNumero, usePrestamosPorRetornar } from '@/lib/api/almacenTelefono'
import { usePermisosPedidos, usePorRecibir, useSolicitudesEnRevision } from '@/lib/api/pedidos'
import { useEmpresa, empresaDelPapel } from '@/lib/api/empresa'
import { useMonedasUsables, enSimbolos } from '@/lib/api/tasas'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { mensajeEntrada, mensajeProductoNuevo, num } from '@/lib/ficha/inventarioWhatsapp'
import { RecepcionesTelefono } from '@/pages/pedidos/RecepcionesTelefono'
import { useNotaDeSalida } from '@/pages/salidas/NotaDeSalida'
import { useNotaDeTraslado } from '@/pages/salidas/NotaDeTraslado'
import { cn } from '@/lib/cn'
import { sinAcentos, useTardaPorLaSeñal, type ProductoEnAlmacen } from './telefono/comun'
import { AvisoDeSeñal, BotonGrande, Listo, TituloDePaso } from './telefono/piezas'
import { FormSalida } from './telefono/FormSalida'
import { FormTraslado } from './telefono/FormTraslado'
import { PorRetornar } from './telefono/PorRetornar'
import { ReporteStock } from './telefono/ReporteStock'
import { HistoricoSalidas, HistoricoTraslados } from './telefono/Historicos'

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

  08/11/2026, FASE 1b: el resto del día del almacenista, también aquí y con
  su WhatsApp al final (las piezas viven en `./telefono/`):
  · «⬆ Salida»: la de MGG, MIXTA (decisión 0.1 «C»). Quien puede aprobar
    salidas de este almacén la saca en el acto; si no, queda «Por aprobar».
    Con «¿Retorna? SÍ», un préstamo a un trabajador.
  · «🔁 Traslado»: directo, como MGG (decisión 0.2), con
    `transferir_existencia`. En escritorio siguen los tres pasos.
  · «🔄 Por retornar»: los préstamos de este almacén, con retorno parcial.
  · «📲 Reporte de stock» y los históricos de salidas y de traslados.

  QUÉ PASÓ CON LAS SUB-PÁGINAS DE ANTES:
  · `/almacen/retornar` redirige aquí (`?paso=retornos`): esta pantalla hace
    todo lo que hacía y además el retorno parcial.
  · `/almacen/salida` (entregar una solicitud ya aprobada, p. ej. pedida desde
    el escritorio) y `/almacen/salida/pedir` (con vehículo, firma o de varios
    almacenes) siguen vivas: la salida de aquí no las cubre. Se llega con
    «Entregar lo ya aprobado» y desde la propia salida.
  · `/almacen/movimientos` (buscar cualquier movimiento por su número y
    reportarlo) sigue viva: los históricos solo cubren salidas y traslados.
  · `/almacen/prestamo` sigue viva para la dotación y el préstamo de otro
    almacén; se llega desde «🔄 Por retornar».
  · `/almacen/entrada` sigue viva: «Varios productos a la vez».

  Las escrituras son las RPC de siempre (`crear_articulo`,
  `registrar_entradas`, `transferir_existencia`, `entregar_a_trabajador`) y
  las de la migración de la fase 1b (`salida_desde_el_telefono`,
  `devolver_parte_de_prestamo`): el stock sigue siendo la suma del libro.
*/

/** Cuántos productos se listan sin buscar: en el teléfono no se recorre el almacén entero. */
const SIN_BUSCAR = 15
const CLAVE_ALMACEN = 'lacantera.inventarioMovil.almacen'
/** El almacén con el que arranca quien no ha elegido ninguno: el general. */
const ALMACEN_POR_DEFECTO = 'ALM-GEN'

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

type Paso =
  | 'inicio'
  | 'nuevo'
  | 'entrada'
  | 'salida'
  | 'traslado'
  | 'retornos'
  | 'reporte'
  | 'historico'
  | 'historicoTraslados'
  | 'recepciones'
  | 'listo'

/** La pantalla «✅» y, si hay un papel que reutilizar, cuál. */
interface Hecho {
  icono?: string
  titulo: string
  texto: string
  aviso?: string
  pdf?: { clase: 'orden'; numero: string } | { clase: 'traslado'; idSalida: number }
}

export function Almacen() {
  const { puede, resuelto } = useMisPermisos()
  const { puede: tieneRol, isSuccess: rolesListos } = useMisRoles()
  const { soloTelefono } = useSoloTelefono()
  const { data: yo } = useMiPerfil()
  const { data: empresa } = useEmpresa()
  const navegar = useNavigate()
  const [parametros] = useSearchParams()

  const puedeEntrada = puede('INVENTARIO', 'ESCRITURA')
  // Pedir una salida solo exige LECTURA en Salidas (la regla de `pedir_salida`);
  // entregarla exige ESCRITURA.
  const puedeSalida = puede('SALIDAS', 'LECTURA')
  const puedeEntregar = puede('SALIDAS', 'ESCRITURA')
  /*
    LA MISMA REJA QUE EL RPC `entregar_a_trabajador`: por el rol de siempre
    (ALMACEN, RRHH, ADMIN) o por el permiso del módulo Asignaciones — la
    segunda rama es la que deja usar esto a un rol a la medida, como
    `ALMACEN_TELEFONO`, sin tener que darle el rol entero.
  */
  const puedePrestamo = tieneRol('ALMACEN', 'RRHH', 'ADMIN') || puede('ASIGNACIONES', 'ESCRITURA')
  // Devolver pide el permiso del módulo, como `devolver_herramienta`.
  const puedeRetornar = puede('ASIGNACIONES', 'ESCRITURA')
  // `transferir_existencia` pide el rol de Almacén, o su equivalente: escritura en Inventario.
  const puedeTraslado = tieneRol('ALMACEN') || puedeEntrada
  const puedeVerInventario = puede('INVENTARIO', 'LECTURA')

  const permisosPedidos = usePermisosPedidos()
  const revisa = permisosPedidos.data?.revisa_almacen === true
  const recibe = permisosPedidos.data?.recibe_almacen === true
  const porRevisar = useSolicitudesEnRevision()
  const porRecibir = usePorRecibir(recibe)
  const cantidadPorRevisar = (porRevisar.data ?? []).length
  const cantidadPorRecibir = (porRecibir.data ?? []).length
  const comoApruebo = useComoAprueboSalidas()

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
  const porRetornarQ = usePrestamosPorRetornar(almacen?.id, puedePrestamo)
  const cantidadPorRetornar = (porRetornarQ.data ?? []).length
  const { data: articulos } = useArticulos()
  const { data: categorias } = useCategoriasDeInventario()
  const notaDeSalida = useNotaDeSalida()
  const notaDeTraslado = useNotaDeTraslado()
  const [armandoOrden, setArmandoOrden] = useState(false)

  // `/almacen/retornar` redirige aquí con `?paso=retornos` (fase 1b).
  const [paso, setPaso] = useState<Paso>(() => (parametros.get('paso') === 'retornos' ? 'retornos' : 'inicio'))
  const [elegido, setElegido] = useState<number | null>(null)
  const [busca, setBusca] = useState('')
  const [listo, setListo] = useState<Hecho | null>(null)

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
          disponible: Number(e.disponibles ?? e.existencia) || 0,
          costoPromedio: e.costo_promedio_usd == null ? null : Number(e.costo_promedio_usd),
          duenos: e.duenos ?? [],
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
    también esos, con su cero, para que se les pueda cargar la Entrada. Solo
    para la entrada: lo que no está no puede salir ni trasladarse.
  */
  const conCatalogo = paso === 'inicio' || paso === 'entrada'
  const delCatalogo = useMemo<ProductoEnAlmacen[]>(() => {
    if (!q || !puedeEntrada || !conCatalogo) return []
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
        disponible: 0,
        costoPromedio: null,
        duenos: [],
      }))
  }, [articulos, productos, q, puedeEntrada, conCatalogo, etiquetaCategoria])

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
  const eligiendo = (paso === 'entrada' || paso === 'salida' || paso === 'traslado') && prodActual == null
  const soloVe = !puedeEntrada && !puedeSalida && !puedePrestamo
  const puedeSacar = puedeSalida || puedePrestamo
  // La regla de la base para aprobar (`private.como_aprueba_salida`), dicha a la
  // pantalla: responde por este almacén o es autorizado; y además puede entregar.
  const aprueba =
    !!almacen &&
    puedeEntregar &&
    (comoApruebo.data?.respaldo === true || (comoApruebo.data?.sitios ?? []).includes(almacen.id))
  const destinos = visibles.filter((a) => a.id !== almacen?.id)

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
    setBusca('')
  }
  const abrir = (p: Paso) => {
    setElegido(null)
    setBusca('')
    setPaso(p)
  }
  const hecho = (h: Hecho) => {
    setListo(h)
    setPaso('listo')
    setElegido(null)
    setBusca('')
  }

  const verPdf = async (pdf: NonNullable<Hecho['pdf']>) => {
    if (pdf.clase === 'traslado') return notaDeTraslado.abrir(pdf.idSalida)
    setArmandoOrden(true)
    try {
      await notaDeSalida.abrirOrden(await leerSolicitudPorNumero(pdf.numero))
    } catch (err) {
      toast(mensajeDe(err, 'No se pudo armar el PDF'), 'error')
    } finally {
      setArmandoOrden(false)
    }
  }

  const tituloEligiendo =
    paso === 'salida'
      ? '⬆ ¿Qué material sale?'
      : paso === 'traslado'
        ? '🔁 ¿Qué material se traslada?'
        : '⬇ ¿A qué producto le llegó?'

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
                onClick={() => abrir('nuevo')}
              />
            ) : null}
            {puedeEntrada ? (
              <BotonGrande
                tono="success"
                className={puedeSacar ? undefined : 'col-span-2'}
                icono="⬇"
                titulo="Entrada"
                sub="Llegó más de un producto que ya está"
                onClick={() => abrir('entrada')}
              />
            ) : null}
            {puedeSacar ? (
              <BotonGrande
                tono="warning"
                className={puedeEntrada ? undefined : 'col-span-2'}
                icono="⬆"
                titulo="Salida"
                sub="Sale material del almacén"
                onClick={() => abrir('salida')}
              />
            ) : null}
            {puedeTraslado ? (
              <BotonGrande
                tono="info"
                className={puedePrestamo ? undefined : 'col-span-2'}
                icono="🔁"
                titulo="Traslado"
                sub="Directo a otro almacén"
                disabled={destinos.length === 0}
                onClick={() => abrir('traslado')}
              />
            ) : null}
            {puedePrestamo ? (
              <BotonGrande
                tono="info"
                className={puedeTraslado ? undefined : 'col-span-2'}
                icono="🔄"
                titulo={`Por retornar (${cantidadPorRetornar})`}
                sub={cantidadPorRetornar > 0 ? 'Dar retorno a lo que salió' : 'Sin pendientes por retornar'}
                onClick={() => abrir('retornos')}
              />
            ) : null}
            <BotonGrande
              tono="success"
              className="col-span-2 min-h-[84px]"
              titulo="📲 Reporte de stock (WhatsApp)"
              sub={`Lo que hay en ${nombreAlm}, filtrado por fechas`}
              onClick={() => abrir('reporte')}
            />
            {/* 📥 Recepciones: las OC entran al almacén general (fase 4 de
                compras), así que el botón solo sale con ése elegido. */}
            {esGeneral && recibe ? (
              <BotonGrande
                tono={cantidadPorRecibir > 0 ? 'warning' : 'success'}
                className="col-span-2"
                titulo={`📥 Recepciones (${cantidadPorRecibir})`}
                sub={
                  cantidadPorRecibir > 0
                    ? `${cantidadPorRecibir === 1 ? 'Hay 1 OC' : `Hay ${cantidadPorRecibir} OC`} por recibir: entran a ${nombreAlm}`
                    : `Sin OC por recibir · entran a ${nombreAlm}`
                }
                onClick={() => abrir('recepciones')}
              />
            ) : null}
            <BotonGrande
              tono="warning"
              titulo="🧾 Histórico de salidas"
              sub="PDF y WhatsApp de cada salida"
              onClick={() => abrir('historico')}
            />
            <BotonGrande
              tono="info"
              titulo="🔁 Histórico de traslados"
              sub="PDF y WhatsApp de cada traslado"
              onClick={() => abrir('historicoTraslados')}
            />
          </div>

          <div className="text-ink/55 mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm">
            {puedeEntrada ? (
              <Link to="/app/inventario/almacen/entrada" className="underline decoration-dotted underline-offset-4">
                Varios productos a la vez
              </Link>
            ) : null}
            {/* Lo pedido desde el escritorio y ya aprobado se entrega allí:
                la salida de aquí no lo cubre (fase 1b). */}
            {puedeEntregar ? (
              <Link to="/app/inventario/almacen/salida" className="underline decoration-dotted underline-offset-4">
                Entregar lo ya aprobado
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

      {paso === 'listo' && listo ? (
        <Listo
          icono={listo.icono}
          titulo={listo.titulo}
          texto={listo.texto}
          aviso={listo.aviso}
          pdf={
            listo.pdf
              ? {
                  armando: armandoOrden || notaDeTraslado.armando !== null,
                  abrir: () => void verPdf(listo.pdf!),
                }
              : undefined
          }
          onVolver={volver}
        />
      ) : null}

      {paso === 'nuevo' && almacen ? (
        <FormNuevo
          almacen={almacen}
          productos={productos}
          quien={quien}
          empresa={empresaNombre}
          etiquetaCategoria={etiquetaCategoria}
          onCancel={volver}
          onHecho={(titulo, texto) => hecho({ titulo, texto })}
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
          onHecho={(titulo, texto) => hecho({ titulo, texto })}
        />
      ) : null}

      {paso === 'salida' && almacen && prodActual ? (
        <FormSalida
          key={prodActual.id}
          almacen={almacen}
          productos={productos}
          inicial={prodActual}
          articulos={articulos}
          puedePedir={puedeSalida}
          puedePrestar={puedePrestamo}
          aprueba={aprueba}
          quien={quien}
          empresa={empresaNombre}
          onCancel={() => setElegido(null)}
          onHecho={(h) =>
            hecho({ ...h, pdf: h.numero ? { clase: 'orden', numero: h.numero } : undefined })
          }
        />
      ) : null}

      {paso === 'traslado' && almacen && prodActual ? (
        <FormTraslado
          key={prodActual.id}
          origen={almacen}
          destinos={destinos}
          productos={productos}
          inicial={prodActual}
          quien={quien}
          empresa={empresaNombre}
          onCancel={() => setElegido(null)}
          onHecho={(h) =>
            hecho({
              titulo: h.titulo,
              texto: h.texto,
              pdf: h.idSalida ? { clase: 'traslado', idSalida: h.idSalida } : undefined,
            })
          }
        />
      ) : null}

      {paso === 'retornos' && almacen ? (
        <PorRetornar
          almacen={almacen}
          puedeRetornar={puedeRetornar}
          quien={quien}
          empresa={empresaNombre}
          onVolver={volver}
          onHecho={(h) => hecho(h)}
        />
      ) : null}

      {paso === 'reporte' && almacen ? (
        <ReporteStock
          almacen={almacen}
          quien={quien}
          empresa={empresaNombre}
          etiquetaCategoria={etiquetaCategoria}
          onVolver={volver}
        />
      ) : null}

      {paso === 'historico' && almacen ? (
        <HistoricoSalidas almacen={almacen} empresa={empresaNombre} onVolver={volver} />
      ) : null}

      {paso === 'historicoTraslados' && almacen ? (
        <HistoricoTraslados almacen={almacen} empresa={empresaNombre} onVolver={volver} />
      ) : null}

      {(paso === 'inicio' || eligiendo) && almacen ? (
        <section className="mt-5">
          {eligiendo ? (
            <div className="mb-2 flex items-center justify-between gap-2">
              <strong className="text-lg">{tituloEligiendo}</strong>
              <Button variant="ghost" onClick={volver}>
                Cancelar
              </Button>
            </div>
          ) : null}
          <Input
            maxLength={100}
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
                // En salida o traslado, lo que no tiene existencia libre aquí no se elige (MGG).
                disabled={paso === 'salida' || paso === 'traslado' ? p.disponible <= 0 : !puedeEntrada}
                onClick={() => {
                  setElegido(p.id)
                  // Tocar un producto desde el inicio abre directamente su Entrada (MGG).
                  if (paso === 'inicio') setPaso('entrada')
                }}
              />
            ))}
          </div>
          {delCatalogo.length > 0 ? (
            <>
              <p className="text-ink/50 mt-4 mb-2 text-xs">Del catálogo, todavía sin existencia en {nombreAlm}:</p>
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

      {notaDeSalida.visor}
      {notaDeTraslado.visor}
      <AvisosFlotantes />
    </div>
  )
}

/* ──────────────────────────────────────── piezas de la pantalla */

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
  // MGG: «Ubicación» (estante, pila) al dar de alta; se guarda en mayúsculas.
  const [ubicacion, setUbicacion] = useState('')
  const guardarFicha = useGuardarFichaDeArticulo()
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
      if (ubicacion.trim()) {
        await guardarFicha.mutateAsync({ id, ubicacion_fisica: ubicacion }).catch(() => undefined)
      }
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
          maxLength={120}
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
        maxLength={80}
        label="Ubicación"
        placeholder="Estante, pasillo o pila"
        value={ubicacion}
        onChange={(e) => setUbicacion(e.target.value.toUpperCase())}
      />

      <Input
        limite={{ maxDecimales: 4, sinNegativos: true }}
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
        limite={{ maxDecimales: 4, sinNegativos: true }}
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
          limite={{ maxDecimales: 4, sinNegativos: true }}
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
          limite={{ maxDecimales: 4, sinNegativos: true }}
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
        maxLength={200}
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
