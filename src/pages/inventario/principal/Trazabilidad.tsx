import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { Historial } from '@/components/Historial'
import { ValorPorPresentacion } from '@/components/ValorPorPresentacion'
import { Visor } from '@/components/Visor'
import { comoLlega, MODOS_ENTREGA, useMisRoles } from '@/lib/api/catalogo'
import type { Articulo } from '@/lib/api/catalogo'
import {
  nombreDeMovimiento,
  useExistenciasDeArticulo,
  useHistorialArticulo,
  usePropietarios,
  useReversarMovimiento,
} from '@/lib/api/inventario'
import { TOPE_DEL_KARDEX, useKardexArticulo } from '@/lib/api/inventarioPrincipal'
import type { FilaDeKardex } from '@/lib/api/inventarioPrincipal'
import { empresaDelPapel, useEmpresa } from '@/lib/api/empresa'
import { useSesion } from '@/lib/sesion'
import { armarTrazabilidadPdf } from '@/lib/ficha/inventarioMggPdf'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { LA_CASA } from '@/lib/deQuien'
import { dolares } from '@/lib/formato'
import { cn } from '@/lib/cn'
import { FUERA, cantidad, diaLargo, fechaCorta, filaUsable, horaDe, iconoDeTipo } from './comun'

/*
  📋 «TRAZABILIDAD · {SKU}» (fase 3 de «Almacén e Inventario como MGG»,
  08/11/2026). Copia de `ProductoDetail.tsx` de MGG con los componentes de La
  Cantera:

  1. Encabezado «TRAZABILIDAD», el nombre y «{sku} · {categoría} · {unidad}».
  2. MiniStats: stock en el almacén de donde se abrió, stock total, mínimo,
     costo promedio, entradas y salidas del ámbito del kardex.
  3. «DÓNDE ESTÁ EL STOCK», por almacén con su costo promedio y POR DUEÑO
     (lo propio de aquí: MGG no tiene dueños).
  4. «DETALLE DEL PRODUCTO», solo los campos con valor.
  5. El filtro del kardex por almacén y el kardex agrupado por día, con el
     saldo que quedó en el almacén de cada fila (`historial_articulo_v2`).
     «Deshacer» (`reversar_movimiento`) en cada fila, para quien tiene el rol
     de Almacén y solo donde la base lo deja.
  6. «↓ Trazabilidad PDF».

  Además, plegado al final, lo que la ficha vieja contaba y el kardex no:
  préstamos, devoluciones y viajes al taller (`historial_articulo`). Con eso la
  ruta `/app/inventario/articulos/:id` puede redirigir aquí sin perder nada.
*/

/** Lo que `historial_articulo` cuenta y no es un movimiento del libro. */
const CLASES_FUERA_DEL_LIBRO = ['ENTREGA', 'DEVOLUCION', 'PERDIDA', 'DANADA', 'REPUESTA', 'TALLER']

export function Trazabilidad({
  articulo,
  almacenOrigen,
  onCerrar,
}: {
  articulo: Articulo
  /** El almacén elegido en la pantalla de donde se abrió, si había uno. */
  almacenOrigen?: number | null
  onCerrar: () => void
}) {
  const existenciasQ = useExistenciasDeArticulo(articulo.id)
  const kardexQ = useKardexArticulo(articulo.id)
  const historialQ = useHistorialArticulo(articulo.id)
  const { data: propietarios } = usePropietarios(false)
  const { puede: tieneRol } = useMisRoles()
  const { data: empresa } = useEmpresa()
  const { nombre: yo } = useSesion()
  const reversar = useReversarMovimiento()

  const [filtroElegido, setFiltro] = useState(almacenOrigen ? String(almacenOrigen) : '')
  const [deshaciendo, setDeshaciendo] = useState<FilaDeKardex | null>(null)
  const [motivo, setMotivo] = useState('')
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [armando, setArmando] = useState(false)

  const puedeDeshacer = tieneRol('ALMACEN')
  const nombreDeDueno = (codigo?: string | null) =>
    (propietarios ?? []).find((d) => d.codigo === codigo)?.nombre ?? codigo ?? ''

  // ---------------------------------------------------------------- stock
  const filas = useMemo(() => (existenciasQ.data ?? []).filter(filaUsable), [existenciasQ.data])
  const conStock = filas.filter((f) => Number(f.existencia) !== 0)
  const total = filas.reduce((s, f) => s + Number(f.existencia), 0)
  const veValor = filas.some((f) => f.valor_usd !== null)
  const valorado = filas.reduce(
    (s, f) => s + Math.max(0, Number(f.existencia) - Math.min(Number(f.existencia), Number(f.existencia_sin_valorar ?? 0))),
    0,
  )
  const valor = filas.reduce((s, f) => s + Number(f.valor_usd ?? 0), 0)
  const costoProm = veValor && valorado > 0 ? valor / valorado : null
  const prestadas = filas.reduce((s, f) => s + Number(f.prestadas ?? 0), 0)
  const origen = almacenOrigen ? filas.find((f) => f.almacen_id === almacenOrigen) : undefined

  /*
    POR DUEÑO. `v_existencias` trae por fila lo propio, lo ajeno y la lista de
    dueños. Lo ajeno se le cuenta al dueño de fuera de esa fila: exacto mientras
    haya un solo dueño de fuera en cada sitio (hoy, la gobernación).
  */
  const porDueno = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of filas) {
      const propio = Number(f.existencia_propia ?? 0)
      const ajeno = Number(f.existencia_ajena ?? 0)
      if (propio) m.set(LA_CASA, (m.get(LA_CASA) ?? 0) + propio)
      if (ajeno) {
        const otro = (f.duenos ?? []).find((d) => d !== LA_CASA) ?? 'AJENO'
        m.set(otro, (m.get(otro) ?? 0) + ajeno)
      }
    }
    return [...m.entries()].filter(([, v]) => v !== 0)
  }, [filas])

  // --------------------------------------------------------------- kardex
  const kardex = useMemo(
    () => (kardexQ.data ?? []).filter((k) => !FUERA.includes(k.almacen_tipo)),
    [kardexQ.data],
  )
  const recortado = (kardexQ.data?.[0]?.total ?? 0) > (kardexQ.data?.length ?? 0)
  const almacenesDelKardex = useMemo(() => {
    const m = new Map<number, { nombre: string; n: number }>()
    for (const k of kardex) {
      const a = m.get(k.almacen_id) ?? { nombre: k.almacen, n: 0 }
      a.n += 1
      m.set(k.almacen_id, a)
    }
    return [...m.entries()].sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, 'es'))
  }, [kardex])
  // El almacén de la pantalla solo filtra si el producto tiene movimientos ahí.
  const filtro = almacenesDelKardex.some(([id]) => String(id) === filtroElegido) ? filtroElegido : ''
  const visibles = filtro ? kardex.filter((k) => String(k.almacen_id) === filtro) : kardex
  const ambito = filtro ? (almacenesDelKardex.find(([id]) => String(id) === filtro)?.[1].nombre ?? '') : 'todos'
  // Una corrección de costo sale y vuelve a entrar lo mismo: no es material que se movió.
  const entradas = visibles.filter((k) => k.signo > 0 && k.tipo !== 'AJUSTE_COSTO').reduce((s, k) => s + Number(k.cantidad), 0)
  const salidas = visibles.filter((k) => k.signo < 0 && k.tipo !== 'AJUSTE_COSTO').reduce((s, k) => s + Number(k.cantidad), 0)

  const porDia = useMemo(() => {
    const dias: { fecha: string; filas: FilaDeKardex[] }[] = []
    for (const k of visibles) {
      const ultimo = dias[dias.length - 1]
      if (ultimo && ultimo.fecha === k.fecha) ultimo.filas.push(k)
      else dias.push({ fecha: k.fecha, filas: [k] })
    }
    return dias
  }, [visibles])

  const fueraDelLibro = (historialQ.data ?? []).filter((h) => CLASES_FUERA_DEL_LIBRO.includes(h.clase))

  // ---------------------------------------------------------------- PDF
  const descargarPdf = async () => {
    setArmando(true)
    try {
      setPdf(
        await armarTrazabilidadPdf({
          empresa: empresaDelPapel(empresa),
          sku: articulo.codigo,
          nombre: articulo.nombre,
          categoria: articulo.categoria,
          unidad: articulo.unidad,
          minimo: Number(articulo.stock_minimo) || 0,
          stock: conStock.map((f) => ({
            almacen: f.almacen,
            dueno: (f.duenos ?? []).map((d) => nombreDeDueno(d)).join(', ') || null,
            stock: Number(f.existencia),
            costo: f.costo_promedio_usd == null ? null : Number(f.costo_promedio_usd),
            valor: f.valor_usd == null ? null : Number(f.valor_usd),
          })),
          movimientos: visibles.map((k) => ({
            fecha: fechaCorta(k.fecha),
            tipo: nombreDeMovimiento({ ...k, baja: null }),
            almacen: k.almacen,
            delta: Number(k.cantidad) * k.signo,
            saldo: Number(k.saldo_almacen),
            costo: k.costo_usd == null ? null : Number(k.costo_usd),
            pmp: k.pmp_despues == null ? null : Number(k.pmp_despues),
            referencia: [k.numero, k.nota_salida, k.orden, k.traslado].filter(Boolean).join(' · '),
            detalle: [
              k.traslado_origen && k.traslado_destino ? `${k.traslado_origen} → ${k.traslado_destino}` : null,
              k.para_quien ? `Para ${k.para_quien}` : null,
              k.nota,
              k.reversado ? 'Deshecho' : null,
            ]
              .filter(Boolean)
              .join(' · '),
          })),
          nota:
            recortado || filtro
              ? `${filtro ? `Solo los movimientos de ${ambito}. ` : ''}${recortado ? `Van los ${TOPE_DEL_KARDEX} más recientes.` : ''}`.trim()
              : null,
          emitidoPor: yo ?? '',
          momento: new Date(),
        }),
      )
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo armar el PDF'), 'error')
    } finally {
      setArmando(false)
    }
  }

  const modo = MODOS_ENTREGA.find((m) => m.valor === articulo.modo_entrega)?.etiqueta
  const detalle: [string, string][] = [
    ['Código anterior', articulo.codigo_anterior ?? ''],
    ['Marca', articulo.marca ?? ''],
    ['N° de parte o serial', articulo.numero_parte ?? ''],
    ['Cómo llega', comoLlega(articulo) ?? ''],
    ['Al entregarlo', modo ?? ''],
    ['Densidad', articulo.densidad_ton_m3 ? `${articulo.densidad_ton_m3} t/m³` : ''],
    ['Se puede mandar al taller', articulo.reparable ? 'Sí' : ''],
    ['Descripción', articulo.descripcion ?? ''],
    ['Motivo del estado', !articulo.activo ? (articulo.motivo_estado ?? '') : ''],
  ].filter((d): d is [string, string] => !!d[1])

  return (
    <>
      <Modal
        abierto
        ancho="lg"
        onCerrar={onCerrar}
        titulo={`Trazabilidad · ${articulo.codigo}`}
        acciones={
          <>
            <Button
              variant="ghost"
              title="Descargar trazabilidad del producto"
              disabled={armando || kardexQ.isPending}
              onClick={() => void descargarPdf()}
            >
              {armando ? 'Armando…' : '↓ Trazabilidad PDF'}
            </Button>
            <Button onClick={onCerrar}>Cerrar</Button>
          </>
        }
      >
        {/* ------------------------------------------------ encabezado */}
        <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">Trazabilidad</p>
        <h3 className="text-ink/90 mt-1 text-lg font-semibold">{articulo.nombre}</h3>
        <p className="text-ink/55 text-sm">
          {articulo.codigo} · {articulo.categoria} · {articulo.unidad}
          {!articulo.activo ? (
            <Chip tone="danger" className="ml-2">
              Deshabilitado
            </Chip>
          ) : null}
        </p>

        {/* ------------------------------------------------- MiniStats */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {origen ? (
            <MiniStat
              label={`Stock en ${origen.almacen}`}
              valor={`${cantidad(Number(origen.existencia))} ${articulo.unidad}`}
              realce
            />
          ) : null}
          <MiniStat label="Stock total" valor={`${cantidad(total)} ${articulo.unidad}`} realce={!origen} />
          <MiniStat
            label="Mínimo"
            valor={Number(articulo.stock_minimo) > 0 ? `${cantidad(Number(articulo.stock_minimo))} ${articulo.unidad}` : '—'}
          />
          <MiniStat label="Costo prom." valor={costoProm !== null ? dolares(costoProm) : '—'} />
          <MiniStat label={`Entradas (${ambito})`} valor={`+${cantidad(entradas)}`} tono="success" />
          <MiniStat label={`Salidas (${ambito})`} valor={`−${cantidad(salidas)}`} tono="danger" />
        </div>

        {/* ---------------------------------------- dónde está el stock */}
        <Card className="mt-4">
          <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">Dónde está el stock</p>
          {existenciasQ.isPending ? (
            <p className="text-ink/55 mt-2 text-sm">Cargando desglose por almacén…</p>
          ) : existenciasQ.error ? (
            <p className="text-danger mt-2 text-sm">
              No se pudo cargar el desglose por almacén. Cerrá y volvé a abrir; si sigue, avisá a Sistemas.
            </p>
          ) : conStock.length === 0 ? (
            <p className="text-ink/55 mt-2 text-sm">Sin stock en ningún almacén.</p>
          ) : (
            <>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {conStock.map((f) => {
                  const actual = f.almacen_id === almacenOrigen
                  return (
                    <div
                      key={f.almacen_id}
                      className={cn(
                        'rounded-control border px-3 py-2 text-sm',
                        actual ? 'border-warning/60 bg-warning-soft' : 'border-hairline',
                      )}
                    >
                      <p className="text-ink/85">
                        ▣ <span className="font-medium">{f.almacen}</span>: {cantidad(Number(f.existencia))}{' '}
                        {articulo.unidad}
                        {actual ? (
                          <Chip tone="warning" className="ml-2">
                            vista actual
                          </Chip>
                        ) : null}
                      </p>
                      <p className="text-ink/50 mt-0.5 text-xs">
                        {f.costo_promedio_usd != null ? `Costo prom. ${dolares(Number(f.costo_promedio_usd))}` : 'Costo prom. —'}
                        {Number(f.existencia_sin_valorar ?? 0) > 0
                          ? ` · ${cantidad(Math.min(Number(f.existencia), Number(f.existencia_sin_valorar)))} sin valorar`
                          : ''}
                        {Number(f.prestadas ?? 0) > 0 ? ` · ${cantidad(Number(f.prestadas))} en manos de alguien` : ''}
                      </p>
                    </div>
                  )
                })}
              </div>
              {porDueno.length > 1 || (porDueno.length === 1 && porDueno[0][0] !== LA_CASA) ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {porDueno.map(([d, n]) => (
                    <span key={d} className="border-hairline rounded-control border px-3 py-1.5 text-sm">
                      <span className="font-medium">{d === 'AJENO' ? 'Otros dueños' : nombreDeDueno(d)}</span> ·{' '}
                      {cantidad(n)} {articulo.unidad}
                    </span>
                  ))}
                </div>
              ) : null}
              <p className="text-ink/45 mt-3 text-xs">
                La lista de inventario muestra solo lo del almacén elegido (columna «Stock en …»); acá se ve todo.
                {prestadas > 0 ? ` De lo que hay, ${cantidad(prestadas)} está en manos de alguien.` : ''}
              </p>
            </>
          )}
        </Card>

        {/* Lo mismo, dicho en envases: solo si el artículo tiene presentaciones. */}
        <ValorPorPresentacion
          articuloId={articulo.id}
          unidad={articulo.unidad}
          existencia={total}
          costoPorUnidad={costoProm}
        />

        {/* -------------------------------------- detalle del producto */}
        {detalle.length > 0 ? (
          <Card className="mt-4">
            <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">Detalle del producto</p>
            <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
              {detalle.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-ink/50">{k}</dt>
                  <dd className="text-ink/85 min-w-0 break-words">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ) : null}

        {/* --------------------------------------------------- kardex */}
        <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
          <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">Kardex</p>
          {almacenesDelKardex.length > 1 ? (
            <div className="w-full sm:w-64">
              <Select
                label="Almacén"
                vacio={`Todos (${kardex.length})`}
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                opciones={almacenesDelKardex.map(([id, a]) => ({ valor: String(id), etiqueta: `${a.nombre} (${a.n})` }))}
              />
            </div>
          ) : null}
        </div>

        {kardexQ.isPending ? <Cargando texto="Cargando kardex…" /> : null}
        {kardexQ.error ? <ErrorDeCarga error={kardexQ.error} className="mt-3" /> : null}
        {!kardexQ.isPending && !kardexQ.error && visibles.length === 0 ? (
          <p className="text-ink/55 mt-3 text-sm">
            {kardex.length === 0 ? '✨ Sin movimientos registrados todavía.' : `Sin movimientos (${ambito}).`}
          </p>
        ) : null}
        {recortado ? (
          <p className="text-ink/50 mt-2 text-xs">
            Se ven los {TOPE_DEL_KARDEX} movimientos más recientes de {kardexQ.data?.[0]?.total}. Los anteriores están
            en Movimientos.
          </p>
        ) : null}

        <div className="mt-3 space-y-4">
          {porDia.map((dia) => (
            <div key={dia.fecha}>
              <p className="text-ink/55 border-hairline border-b pb-1 text-xs font-medium first-letter:uppercase">
                {diaLargo(dia.fecha)}
              </p>
              <ul>
                {dia.filas.map((k, i) => (
                  <FilaKardex
                    key={k.id}
                    k={k}
                    alterna={i % 2 === 1}
                    dueno={k.propietario && k.propietario !== LA_CASA ? nombreDeDueno(k.propietario) : null}
                    onDeshacer={
                      puedeDeshacer && k.reversable
                        ? () => {
                            setMotivo('')
                            setDeshaciendo(k)
                          }
                        : undefined
                    }
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Lo que la ficha vieja contaba y no es del libro. */}
        {fueraDelLibro.length > 0 ? (
          <details className="group mt-6">
            <summary className="text-ink/60 hover:text-ink/85 cursor-pointer text-sm font-medium">
              Préstamos y taller ({fueraDelLibro.length})
            </summary>
            <Historial
              className="mt-2"
              titulo="Préstamos y taller"
              subtitulo="Entregas a personas, devoluciones y viajes al taller. Del más reciente al más antiguo."
              hechos={fueraDelLibro}
              cargando={historialQ.isPending}
              error={historialQ.error}
            />
          </details>
        ) : null}
      </Modal>

      {/* ------------------------------------------------ deshacer */}
      {deshaciendo ? (
        <Modal
          abierto
          ancho="sm"
          onCerrar={() => setDeshaciendo(null)}
          titulo="Deshacer el movimiento"
          descripcion={`Se escribe el movimiento contrario a ${deshaciendo.numero}. El original se queda en el libro.`}
          acciones={
            <>
              <Button variant="ghost" onClick={() => setDeshaciendo(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={motivo.trim().length < 4 || reversar.isPending}
                onClick={async () => {
                  try {
                    await reversar.mutateAsync({ id: deshaciendo.id, motivo })
                    toast(`Se deshizo ${deshaciendo.numero}`, 'success')
                    setDeshaciendo(null)
                  } catch {
                    // El error se enseña debajo del motivo.
                  }
                }}
              >
                {reversar.isPending ? 'Guardando…' : 'Deshacer'}
              </Button>
            </>
          }
        >
          <Textarea
            maxLength={500}
            label="Motivo"
            rows={3}
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            hint="Queda en el kardex con tu nombre."
          />
          {reversar.error ? <ErrorDeCarga error={reversar.error} className="mt-3" /> : null}
        </Modal>
      ) : null}

      <Visor
        abierto={pdf !== null}
        onCerrar={() => setPdf(null)}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ''}
        titulo={`Trazabilidad · ${articulo.codigo}`}
      />
    </>
  )
}

/* -------------------------------------------------------------------------- */

function MiniStat({
  label,
  valor,
  realce = false,
  tono,
}: {
  label: string
  valor: string
  realce?: boolean
  tono?: 'success' | 'danger'
}) {
  return (
    <div
      className={cn(
        'rounded-control border px-3 py-2',
        realce ? 'border-royal-600/40 bg-royal-600/6' : 'border-hairline',
      )}
    >
      <p className="text-ink/50 truncate text-xs" title={label}>
        {label}
      </p>
      <p
        className={cn(
          'tabular mt-0.5 text-base font-semibold',
          tono === 'success' ? 'text-success' : tono === 'danger' ? 'text-danger' : 'text-ink/90',
        )}
      >
        {valor}
      </p>
    </div>
  )
}

/** Una fila del kardex (`kx-row` de MGG). */
function FilaKardex({
  k,
  alterna,
  dueno,
  onDeshacer,
}: {
  k: FilaDeKardex
  alterna: boolean
  dueno: string | null
  onDeshacer?: () => void
}) {
  const n = Number(k.cantidad)
  const entra = k.signo > 0
  const ref = [k.numero, k.nota_salida, k.orden].filter(Boolean).join(' · ')
  return (
    <li
      className={cn(
        'border-hairline flex gap-3 border-b px-2 py-2.5 last:border-b-0',
        alterna && 'bg-ink/[0.025]',
        k.reversado && 'opacity-60',
      )}
    >
      <div className={cn('w-16 shrink-0 text-right sm:w-20', entra ? 'text-success' : 'text-danger')}>
        <p className="tabular text-lg leading-tight font-semibold">
          {entra ? '+' : '−'}
          {cantidad(n)}
        </p>
        <p className="text-2xs opacity-70">{k.unidad}</p>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-ink/85 flex flex-wrap items-center gap-1.5 text-sm font-medium">
          <span aria-hidden="true">{iconoDeTipo(k.tipo)}</span>
          {nombreDeMovimiento({ ...k, baja: null })}
          <Chip>▣ {k.almacen}</Chip>
          {dueno ? <Chip tone="warning">de {dueno}</Chip> : null}
          {k.reversado ? <Chip tone="neutral">Deshecho</Chip> : null}
        </p>
        {k.traslado_origen && k.traslado_destino ? (
          <p className="text-ink/65 mt-0.5 text-xs">
            Origen: <strong>{k.traslado_origen}</strong> → Destino: <strong>{k.traslado_destino}</strong>
            {k.traslado ? ` · ${k.traslado}` : ''}
          </p>
        ) : null}
        {k.para_quien ? <p className="text-ink/65 mt-0.5 text-xs">Para: {k.para_quien}</p> : null}
        {k.nota ? <p className="text-ink/60 mt-0.5 text-xs break-words">{k.nota}</p> : null}
        <p className="text-ink/50 mt-0.5 text-xs">
          {k.costo_usd != null ? `Costo unit.: ${dolares(Number(k.costo_usd))}` : 'Costo unit.: —'}
          {k.pmp_despues != null ? ` · Costo prom. del almacén: ${dolares(Number(k.pmp_despues))}` : ''}
          {ref ? ` · Ref: ${ref}` : ''}
        </p>
        <p className="text-ink/40 mt-0.5 text-xs">
          {horaDe(k.registrado_en)}
          {k.quien ? ` · por ${k.quien}` : ''}
        </p>
        {onDeshacer ? (
          <Button size="sm" variant="ghost" className="mt-1 -ml-2" onClick={onDeshacer}>
            Deshacer
          </Button>
        ) : null}
      </div>

      <div className="w-20 shrink-0 text-right sm:w-24">
        <p className="text-ink/45 text-2xs">saldo en {k.almacen}</p>
        <p className="tabular text-ink/85 text-sm font-semibold">{cantidad(Number(k.saldo_almacen))}</p>
      </div>
    </li>
  )
}
