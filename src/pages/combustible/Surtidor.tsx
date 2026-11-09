import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { AvisosFlotantes } from '@/components/AvisosFlotantes'
import { PANTALLAS_DE_TELEFONO } from '@/config/navigation'
import { useLibroTanque, useTanquesGt } from '@/lib/api/combustible'
import { referenciaDeFotos } from '@/lib/api/combustibleTelefono'
import { useFotosDeCarga } from '@/lib/api/fotosDeCarga'
import { useMiPerfil, useMisAcciones, useMisPermisos, useSoloTelefono } from '@/lib/api/usuarios'
import { horaParaLeer } from '@/lib/combustible/horaMovimiento'
import { fechaCorta } from '@/lib/combustible/mensajeMovimiento'
import { tanqueSinLitros } from '@/lib/combustible/saldo'
import type { MovimientoLibro } from '@/lib/combustible/tipos'
import { cn } from '@/lib/cn'
import { CalculadoraCubicacion } from './CalculadoraCubicacion'
import { DetalleMovil } from './telefono/DetalleMovil'
import { FormularioSurtido } from './telefono/FormularioSurtido'
import { ReporteSurtidor } from './telefono/ReporteSurtidor'
import { ICONO, NOMBRE_TIPO, ULTIMOS_EN_TELEFONO, entra, litros, tituloDeMovimiento, type TipoSurtidor } from './telefono/comun'
import { Aviso, BotonSurtidor, Rotulo } from './telefono/piezas'

/*
  EL SURTIDOR, EN EL TELÉFONO — COMO GOLDEN TOUCH (fase 4, 10/11/2026).

  Es `SurtidorMovilView` de Golden Touch (estructura, textos, emojis, orden de
  los botones y tamaños) con los componentes, los colores y el tema claro y
  oscuro de La Cantera. La pantalla del que está al lado del tanque con el
  celular: elige el tanque en la fila de arriba, toca «⛽ Surtir a un equipo»,
  «🔁 Pasar a otro tanque» o «⬇ Entrada», pone los litros, a qué equipo va,
  quién autorizó, le saca fotos y guarda. Abajo ve los últimos movimientos del
  tanque; cada uno se abre para pasarlo por WhatsApp, ver o añadir fotos,
  marcar el cuaderno o anularlo. «📊 Reporte» junta un rango por tipo, con
  fotos y su PDF; «📐 Calculadora cubicación» pasa la varilla a litros.

  Escribe con las MISMAS funciones de la base que la PC (`combustible_
  registrar_uso`, `combustible_trasladar`, `combustible_registrar_entrada`,
  `combustible_anular_movimiento`), así que lo que se hace aquí aparece al
  instante allá y al revés (tiempo real).

  LO QUE CAMBIA RESPECTO A GOLDEN TOUCH, a propósito:
  · «🗑 Eliminar» es «❌ Anular» con motivo: el libro no se borra.
  · El surtido lleva las reglas de La Cantera: «👤 ¿Quién recibió?»
    (precargado con el operador), «Para qué», el horómetro que no retrocede y
    tres vales al día por máquina.
  · La entrada y el traslado solo salen a quien tiene esas acciones en la
    matriz de permisos (COMBUSTIBLE.ENTRADA, COMBUSTIBLE.TRASLADO).
  · El tanque del combustible inicial dice «sin costo», y una entrada ahí no
    pide costo sino de dónde vino.
  · La merma y el retorno siguen siendo de la PC, como allá.
*/

const RUTA = '/app/combustible/surtidor'

export function Surtidor() {
  const navegar = useNavigate()
  const { puede, resuelto } = useMisPermisos()
  const { puede: puedeAccion } = useMisAcciones()
  const { soloTelefono } = useSoloTelefono()
  const { data: yo } = useMiPerfil()
  const tanquesQ = useTanquesGt()
  const fotos = useFotosDeCarga('COMBUSTIBLE')

  const puedeEscribir = puede('COMBUSTIBLE', 'ESCRITURA')
  const puedeEntrada = puedeAccion('COMBUSTIBLE.ENTRADA')
  const puedeTraslado = puedeAccion('COMBUSTIBLE.TRASLADO')

  const [selId, setSelId] = useState<number | null>(null)
  const [paso, setPaso] = useState<'inicio' | 'form'>('inicio')
  const [tipo, setTipo] = useState<TipoSurtidor>('uso')
  const [detalle, setDetalle] = useState<{ id: number; inicial?: MovimientoLibro; avisoFotos?: string | null } | null>(
    null,
  )
  const [reporte, setReporte] = useState(false)
  const [calculadora, setCalculadora] = useState(false)
  const [pantallas, setPantallas] = useState(false)

  const tanques = useMemo(() => tanquesQ.data ?? [], [tanquesQ.data])
  // El elegido si sigue activo; si no, el primero. Se deduce en cada pintada:
  // un tanque que se apaga desde la PC no deja la pantalla apuntando a nada.
  const sel = tanques.find((t) => t.almacen_id === selId) ?? tanques[0] ?? null

  const libro = useLibroTanque(
    { tanqueId: sel?.almacen_id ?? null, porPagina: ULTIMOS_EN_TELEFONO, recientesPrimero: true },
    !!sel,
  )
  const movs = libro.data?.filas ?? []

  const fotosPorReferencia = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of fotos.data ?? []) if (!f.quitada_en) m.set(f.referencia, (m.get(f.referencia) ?? 0) + 1)
    return m
  }, [fotos.data])

  const otrasPantallas = PANTALLAS_DE_TELEFONO.filter((p) => p.ruta !== RUTA && puedeAccion(p.accion))

  if (!resuelto) return <Cargando />

  const abrirForm = (t: TipoSurtidor) => {
    setTipo(t)
    setPaso('form')
  }
  const sinLitros = sel ? tanqueSinLitros(sel.saldo_litros) : false
  const conDosBotones = puedeEntrada && puedeTraslado

  return (
    <div className="mx-auto max-w-[640px] px-0 pt-2 pb-12">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-ink/90 text-2xl font-bold">⛽ Surtidor</h1>
          {yo?.nombre ? <p className="text-ink/55 text-sm">{yo.nombre}</p> : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="ghost" size="sm" className="h-11" onClick={() => setCalculadora(true)}>
            📐 Calculadora cubicación
          </Button>
          <Button variant="ghost" size="sm" className="h-11" disabled={!tanques.length} onClick={() => setReporte(true)}>
            📊 Reporte
          </Button>
          {!soloTelefono ? (
            <Button variant="ghost" size="sm" className="h-11" onClick={() => void navegar('/app/combustible')}>
              🖥 Módulo completo
            </Button>
          ) : otrasPantallas.length > 0 ? (
            <Button variant="ghost" size="sm" className="h-11" onClick={() => setPantallas((v) => !v)}>
              📱 Mis pantallas
            </Button>
          ) : null}
        </div>
      </header>

      {/* «Mis pantallas»: las otras pantallas de teléfono del rol, una por botón. */}
      {soloTelefono && pantallas ? (
        <div className="mb-3 grid gap-2">
          {otrasPantallas.map((p) => (
            <Link
              key={p.ruta}
              to={p.ruta}
              className="border-ink/20 bg-surface rounded-card text-ink/85 flex min-h-14 items-center gap-3 border-2 px-4 font-semibold"
            >
              <p.icon className="size-5" aria-hidden />
              {p.label}
            </Link>
          ))}
        </div>
      ) : null}

      {tanquesQ.isPending ? <Cargando /> : null}
      {tanquesQ.error ? <ErrorDeCarga error={tanquesQ.error} /> : null}
      {tanquesQ.isSuccess && tanques.length === 0 ? (
        <p className="text-ink/55 py-8 text-center">⛽ No hay tanques activos. Se crean desde el módulo en la PC.</p>
      ) : null}

      {tanques.length > 0 ? (
        <>
          <Rotulo>Tanque</Rotulo>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1.5" role="tablist" aria-label="Tanque">
            {tanques.map((t) => {
              const elegido = t.almacen_id === sel?.almacen_id
              return (
                <button
                  key={t.almacen_id}
                  type="button"
                  role="tab"
                  aria-selected={elegido}
                  onClick={() => {
                    setSelId(t.almacen_id)
                    setPaso('inicio')
                  }}
                  className={cn(
                    'rounded-card min-h-16 min-w-[150px] shrink-0 border-2 px-3.5 py-2.5 text-left',
                    elegido ? 'border-royal-600 bg-royal-600/10' : 'border-ink/20 bg-surface',
                  )}
                >
                  <div className="text-ink/90 text-[0.95rem] font-bold">{t.es_bidon ? `🪣 ${t.nombre}` : t.nombre}</div>
                  <div className="text-royal-700 dark:text-royal-300 font-mono text-[1.3rem] font-extrabold">
                    {litros(t.saldo_litros)} <small className="text-[0.8rem] font-semibold">L</small>
                  </div>
                  {t.es_bidon ? (
                    <div className="text-royal-700 dark:text-royal-300 text-xs">Salida directa</div>
                  ) : tanqueSinLitros(t.saldo_litros) ? (
                    <div className="text-danger text-xs font-semibold">Sin litros</div>
                  ) : null}
                  {t.sin_costo ? <div className="text-ink/55 text-xs font-semibold">sin costo</div> : null}
                </button>
              )
            })}
          </div>
        </>
      ) : null}

      {sel?.es_bidon ? (
        <Aviso tono="info" icono="🪣" className="my-3">
          <strong>{sel.nombre}</strong> funciona como receptáculo de salida directa: no acumula saldo. Para cargarlo,
          pasale combustible desde otro tanque con «🔁 Pasar a otro tanque» y se registra solo como salida.
        </Aviso>
      ) : null}

      {sel && !sel.es_bidon && paso === 'inicio' && puedeEscribir && sinLitros ? (
        <Aviso tono="alerta" icono="⛔" className="my-3">
          <strong>{sel.nombre} está sin litros.</strong> No se puede surtir ni pasar a otro tanque hasta que entre
          combustible.
        </Aviso>
      ) : null}

      {sel && !sel.es_bidon && paso === 'inicio' && puedeEscribir ? (
        <div className="my-4 grid grid-cols-2 gap-3">
          <BotonSurtidor
            tono="primario"
            className="col-span-2"
            icono="⛽"
            titulo="Surtir a un equipo"
            sub={`Sale combustible de ${sel.nombre} a un equipo o camión`}
            disabled={sinLitros}
            onClick={() => abrirForm('uso')}
          />
          {puedeTraslado ? (
            <BotonSurtidor
              className={conDosBotones ? undefined : 'col-span-2'}
              icono="🔁"
              titulo="Pasar a otro tanque"
              sub="Traslado a otro tanque"
              disabled={sinLitros || tanques.length < 2}
              onClick={() => abrirForm('traslado')}
            />
          ) : null}
          {puedeEntrada ? (
            <BotonSurtidor
              tono="entrada"
              className={conDosBotones ? undefined : 'col-span-2'}
              icono="⬇"
              titulo="Entrada"
              sub="Llega combustible al tanque"
              onClick={() => abrirForm('entrada')}
            />
          ) : null}
        </div>
      ) : null}

      {sel && !puedeEscribir ? (
        <Aviso tono="alerta" icono="👁" className="my-3">
          Tu rol solo puede ver. Para registrar surtidos hace falta escritura en Combustible.
        </Aviso>
      ) : null}

      {sel && paso === 'form' ? (
        <FormularioSurtido
          key={`${sel.almacen_id}-${tipo}`}
          tipo={tipo}
          tanque={sel}
          tanques={tanques}
          onCancelar={() => setPaso('inicio')}
          onGuardado={(id, avisoFotos) => {
            setPaso('inicio')
            // Se abre el detalle de lo recién cargado: ahí está el botón para pasarlo por WhatsApp.
            setDetalle({ id, avisoFotos })
          }}
        />
      ) : null}

      {sel ? (
        <section>
          <h2 className="text-ink/55 mt-5 mb-2 text-xs font-bold tracking-[0.06em] uppercase">
            Últimos {ULTIMOS_EN_TELEFONO} movimientos · {sel.nombre}
          </h2>
          {libro.isPending ? <Cargando /> : null}
          {libro.error ? <ErrorDeCarga error={libro.error} /> : null}
          {libro.isSuccess && movs.length === 0 ? (
            <p className="text-ink/55 text-sm">Este tanque no tiene movimientos todavía.</p>
          ) : null}
          {movs.map((m) => {
            const suma = entra(m)
            const nFotos = fotosPorReferencia.get(referenciaDeFotos(m)) ?? 0
            const tachado = m.anulado || m.tipo === 'reverso'
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setDetalle({ id: m.id, inicial: m })}
                className={cn(
                  'border-hairline bg-surface rounded-card mb-2 grid min-h-16 w-full grid-cols-[auto_1fr_auto] items-center gap-3 border px-3.5 py-3 text-left',
                  tachado && 'opacity-60',
                )}
              >
                <span className="text-[1.6rem]" aria-hidden>
                  {ICONO[m.tipo]}
                </span>
                <span className="min-w-0">
                  <span className={cn('text-ink/90 block truncate font-bold', tachado && 'line-through')}>
                    {tituloDeMovimiento(m)}
                  </span>
                  <span className="text-ink/55 block text-xs">
                    {NOMBRE_TIPO[m.tipo]} · {fechaCorta(m.fecha)}
                    {m.hora ? ` ${horaParaLeer(m.hora)}` : ''}
                    {m.autorizado_por ? ` · Aut.: ${m.autorizado_por}` : ''}
                    {m.anulado ? ' · anulado' : ''}
                    {nFotos > 0 ? ` · 📎 ${nFotos}` : ''}
                  </span>
                </span>
                <span
                  className={cn(
                    'font-mono text-[1.2rem] font-extrabold whitespace-nowrap',
                    suma ? 'text-success' : 'text-ink/90',
                    tachado && 'line-through',
                  )}
                >
                  {suma ? '+' : '−'}
                  {litros(m.litros)} L
                </span>
              </button>
            )
          })}
          {movs.length >= ULTIMOS_EN_TELEFONO ? (
            <p className="text-ink/50 text-sm">
              Aquí se ven los últimos {ULTIMOS_EN_TELEFONO}. El libro completo está en el módulo de Combustible en la
              PC.
            </p>
          ) : null}
        </section>
      ) : null}

      {detalle ? (
        <DetalleMovil
          id={detalle.id}
          inicial={detalle.inicial}
          avisoFotos={detalle.avisoFotos}
          puedeEscribir={puedeEscribir}
          soloTelefono={soloTelefono}
          onCerrar={() => setDetalle(null)}
        />
      ) : null}

      {reporte ? (
        <ReporteSurtidor tanques={tanques} tanqueInicial={sel?.almacen_id ?? null} onCerrar={() => setReporte(false)} />
      ) : null}

      {calculadora ? (
        <CalculadoraCubicacion
          abierto
          onCerrar={() => setCalculadora(false)}
          tanques={tanques}
          tanqueInicial={sel?.almacen_id ?? null}
        />
      ) : null}

      <AvisosFlotantes />
    </div>
  )
}
