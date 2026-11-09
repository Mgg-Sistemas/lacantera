import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/Button'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { useCatalogosCombustible, useLibroTanque, useTanquesGt } from '@/lib/api/combustible'
import { useMaquinaria } from '@/lib/api/maquinaria'
import type { MovimientoLibro, TanqueGt } from '@/lib/combustible/tipos'
import { CalculadoraCubicacion } from './CalculadoraCubicacion'
import { CatalogosModal } from './CatalogosModal'
import { ConciliacionModal } from './ConciliacionModal'
import { ConsumoModal } from './ConsumoModal'
import { CubicacionModal } from './CubicacionModal'
import { DetalleMovimiento } from './DetalleMovimiento'
import { FueraDeTanque } from './FueraDeTanque'
import { HistoricoModal } from './HistoricoModal'
import { MovimientoModal } from './MovimientoModal'
import { RegistroMovimientos } from './RegistroMovimientos'
import { ReporteExistenciasModal } from './ReporteExistenciasModal'
import { TanqueCard, ResumenCombustible } from './Tarjetas'
import { TanqueModal } from './TanqueModal'
import { finDeMes, lt, mesActualVE, nombreMes, totalesGrupo, usd, usePermisosCombustible } from './comun'

/*
  ⛽ COMBUSTIBLE, EN LA PC (Golden Touch, TanquesView.tsx; 10/11/2026).

  La pantalla de Golden Touch con los componentes y los colores de la casa: la
  barra de botones en su orden, los banners del combustible, la grilla de
  tanques y, al tocar uno, su libro del mes con el detalle de cada renglón.

  Lo que cambia respecto a Golden Touch:
  · Dos banners por decisión de la dueña: «Combustible disponible» (con costo)
    y «Combustible inicial (sin costo)», en lugar de «Los Brasileros».
  · Arriba, el aviso «Fuera de tanque» de La Cantera, con «Pasar al tanque».
  · Sin «💰 CAJA» ni «🌐 Envíos a MGG» (no se copian a La Cantera).
  · Cada botón sale según la matriz de permisos del rol (ver
    `usePermisosCombustible`); la base vuelve a exigir lo mismo.
  · Se retiraron «Despachar», «Cargar» y «Últimos despachos»: surtir y cargar
    son tipos de «+ Nuevo movimiento», y los vales viejos están en el libro de
    su tanque (y en el 📚 Histórico).
*/

type ModalAbierto =
  | 'none'
  | 'mov'
  | 'tanque'
  | 'catalogos'
  | 'conciliacion'
  | 'consumo'
  | 'cubicacion'
  | 'calculadora'
  | 'reporte'
  | 'historico'

export function TanquesView() {
  const p = usePermisosCombustible()
  const tanquesQ = useTanquesGt(true)
  const catalogosQ = useCatalogosCombustible()
  const maquinasQ = useMaquinaria(true)

  const tanques = useMemo(() => tanquesQ.data ?? [], [tanquesQ.data])
  const activos = useMemo(() => tanques.filter((t) => t.activo), [tanques])
  const catalogos = catalogosQ.data ?? []
  const maquinas = maquinasQ.data ?? []

  const [modal, setModal] = useState<ModalAbierto>('none')
  const [selId, setSelId] = useState<number | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [editTanque, setEditTanque] = useState<TanqueGt | null>(null)
  const [detalle, setDetalle] = useState<{ mov: MovimientoLibro; anular: boolean } | null>(null)

  const mesActual = useMemo(() => mesActualVE(), [])
  const sel = tanques.find((t) => t.almacen_id === selId) ?? null
  const selParaCubicar = sel ?? activos.find((t) => !t.es_bidon) ?? null

  const conCosto = useMemo(() => tanques.filter((t) => !t.sin_costo), [tanques])
  const sinCosto = useMemo(() => tanques.filter((t) => t.sin_costo), [tanques])

  // El libro del mes en curso del tanque abierto. Lo anterior vive en el 📚 Histórico.
  const libro = useLibroTanque(
    { tanqueId: selId, desde: `${mesActual}-01`, hasta: finDeMes(mesActual), porPagina: 3000 },
    abierto && selId != null,
  )

  const puedeMovimiento = p.escribe || p.entrada || p.traslado || p.merma
  const abrirTanque = (t: TanqueGt) => {
    setSelId(t.almacen_id)
    setAbierto(true)
  }
  const editar = (t: TanqueGt | null) => {
    setEditTanque(t)
    setModal('tanque')
  }

  const grupo = (titulo: string, ts: TanqueGt[], esSinCosto: boolean, vacio: string) => (
    <div className="mb-6">
      <ResumenCombustible titulo={titulo} totales={totalesGrupo(ts)} veValor={p.veValor} sinCosto={esSinCosto} />
      <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
        {ts.map((t) => (
          <TanqueCard
            key={t.almacen_id}
            t={t}
            veValor={p.veValor}
            puedeEditar={p.tanques}
            onClick={() => abrirTanque(t)}
            onEdit={() => editar(t)}
          />
        ))}
        {!ts.length && !tanquesQ.isPending ? (
          <div className="bg-surface rounded-card shadow-card text-ink/55 p-4 text-sm">{vacio}</div>
        ) : null}
      </div>
    </div>
  )

  return (
    <>
      <PageHeader
        title="⛽ Combustible"
        description="Tanques, su libro de movimientos y los reportes. Surtir, cargar, trasladar, retornar y registrar mermas desde «+ Nuevo movimiento»."
        actions={
          p.telefono ? (
            <Link to="/app/combustible/surtidor">
              <Button variant="ghost">📱 Vista teléfono</Button>
            </Link>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setModal('historico')}
          disabled={!tanques.length}
          title="Movimientos de meses anteriores, por mes"
        >
          📚 Histórico de Movimientos
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setModal('reporte')}
          disabled={!tanques.length}
          title="Vista previa del resumen de existencias por tanque a la fecha (imprimible)"
        >
          📄 Reporte de existencias
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setModal('consumo')}>
          📊 Consumo por equipo
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setModal('calculadora')}
          disabled={!tanques.length}
          title="Calculadora rápida de cubicación (seleccionar tanque y altura en cm)"
        >
          📐 Calculadora cubicación
        </Button>
        {p.escribe ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setModal('cubicacion')}
            disabled={!selParaCubicar}
            title="Medir altura → litros"
          >
            📐 Cubicación
          </Button>
        ) : null}
        {p.catalogos || p.escribe ? (
          <Button size="sm" variant="ghost" onClick={() => setModal('catalogos')}>
            🗂 Catálogos
          </Button>
        ) : null}
        {p.escribe ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setModal('conciliacion')}
            disabled={!tanques.length}
            title="Conciliación semanal de los tanques"
          >
            ⚖ Conciliación
          </Button>
        ) : null}
        {p.tanques ? (
          <Button size="sm" variant="ghost" onClick={() => editar(null)}>
            + Tanque
          </Button>
        ) : null}
        {puedeMovimiento ? (
          <Button size="sm" onClick={() => setModal('mov')} disabled={!activos.length}>
            + Nuevo movimiento
          </Button>
        ) : null}
      </div>

      <FueraDeTanque />

      {tanquesQ.isPending ? <Cargando /> : null}
      {tanquesQ.error ? <ErrorDeCarga error={tanquesQ.error} className="mb-4" /> : null}

      {!abierto ? (
        <>
          {grupo(
            'Combustible disponible',
            conCosto,
            false,
            tanques.length ? 'Sin tanques en este grupo.' : 'Sin tanques. Creá uno con «+ Tanque».',
          )}
          {sinCosto.length ? grupo('Combustible inicial (sin costo)', sinCosto, true, 'Sin tanques en este grupo.') : null}
        </>
      ) : sel ? (
        <>
          <div className="mb-3">
            <Button size="sm" variant="ghost" onClick={() => setAbierto(false)} title="Volver al inicio de Combustible">
              ← Volver
            </Button>
          </div>
          <div className="mb-4 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
            <TanqueCard t={sel} veValor={p.veValor} puedeEditar={p.tanques} activo onEdit={() => editar(sel)} />
          </div>
          <div className="mb-2">
            <h2 className="text-ink/90 text-lg font-semibold">📒 {sel.nombre}</h2>
            <p className="text-ink/55 text-sm">
              Saldo: <strong className="tabular text-ink/85">{lt(sel.saldo_litros)} ltrs</strong>
              {sel.sin_costo ? (
                ' · sin costo'
              ) : p.veValor ? (
                <>
                  {' '}
                  · <strong className="tabular text-ink/85">{usd(sel.saldo_usd)}</strong> · Tasa {usd(sel.tasa_usd_litro)}/ltrs
                </>
              ) : null}
            </p>
          </div>
          <RegistroMovimientos
            tanque={sel}
            movs={libro.data?.filas ?? []}
            titulo={`Registro de movimientos · ${nombreMes(mesActual)}`}
            vacio="Sin movimientos este mes."
            cargando={libro.isPending}
            error={libro.error}
            veValor={p.veValor}
            onVer={(m) => setDetalle({ mov: m, anular: false })}
            onAnular={p.escribe ? (m) => setDetalle({ mov: m, anular: true }) : undefined}
          />
        </>
      ) : null}

      {modal === 'mov' ? (
        <MovimientoModal
          tanques={activos}
          tanqueInicial={selId}
          catalogos={catalogos}
          maquinas={maquinas}
          onCerrar={() => setModal('none')}
        />
      ) : null}
      {modal === 'tanque' ? (
        <TanqueModal
          tanque={editTanque}
          catalogos={catalogos}
          onCerrar={() => {
            setModal('none')
            setEditTanque(null)
          }}
        />
      ) : null}
      {modal === 'catalogos' ? (
        <CatalogosModal catalogos={catalogos} tanques={activos} maquinas={maquinas} onCerrar={() => setModal('none')} />
      ) : null}
      {modal === 'conciliacion' ? <ConciliacionModal tanques={tanques} onCerrar={() => setModal('none')} /> : null}
      {modal === 'consumo' ? (
        <ConsumoModal tanques={tanques} maquinas={maquinas} tanqueInicial={selId} onCerrar={() => setModal('none')} />
      ) : null}
      {modal === 'reporte' ? <ReporteExistenciasModal tanques={tanques} onCerrar={() => setModal('none')} /> : null}
      {modal === 'cubicacion' && selParaCubicar ? (
        <CubicacionModal tanques={activos} tanqueInicial={selParaCubicar.almacen_id} onCerrar={() => setModal('none')} />
      ) : null}
      {modal === 'calculadora' ? (
        <CalculadoraCubicacion tanques={tanques} tanqueInicial={selId} onCerrar={() => setModal('none')} />
      ) : null}
      {modal === 'historico' ? (
        <HistoricoModal
          tanques={tanques}
          mesActual={mesActual}
          onVer={(m) => setDetalle({ mov: m, anular: false })}
          onCerrar={() => setModal('none')}
        />
      ) : null}
      {detalle ? (
        <DetalleMovimiento
          key={detalle.mov.id}
          mov={detalle.mov}
          anularAlAbrir={detalle.anular}
          tanques={tanques}
          catalogos={catalogos}
          maquinas={maquinas}
          onCerrar={() => setDetalle(null)}
        />
      ) : null}
    </>
  )
}
