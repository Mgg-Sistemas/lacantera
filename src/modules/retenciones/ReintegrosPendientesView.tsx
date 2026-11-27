/* ============================================================
   La Cantera · Retenciones · Devoluciones Pendientes (Reintegros Post-Pago)
   MINERIA INTERNACIONAL TS, C.A. (RIF: J-50209170-0)

   Módulo dedicado al seguimiento y cobranza de retenciones emitidas
   sobre compras u órdenes que ya fueron canceladas al 100% al proveedor.
   El proveedor debe reembolsar el monto retenido a banco o caja.
   ============================================================ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/shared/lib/supabase';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';

export const bs = (n: number) =>
  'Bs ' + Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const usd = (n: number) =>
  '$ ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function calcularDiasEspera(fechaStr?: string | null): number {
  if (!fechaStr || typeof fechaStr !== 'string') return 0;
  const limpio = fechaStr.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpio)) return 0;
  const anio = parseInt(limpio.slice(0, 4), 10);
  if (anio < 2020 || anio > 2050) return 0;
  const fechaMs = new Date(limpio + 'T12:00:00Z').getTime();
  if (isNaN(fechaMs)) return 0;
  const hoyMs = Date.now();
  if (fechaMs > hoyMs) return 0;
  return Math.floor((hoyMs - fechaMs) / 86400000);
}

export interface ReintegroItemFila {
  id: string;
  ordenId?: string | null;
  codigoOc?: string | null;
  numeroComprobante?: string | null;
  proveedor: string;
  proveedorRif?: string | null;
  proveedorTelefono?: string | null;
  facturas: string[];
  fechaEmision: string;
  fechaReintegro?: string | null;
  moneda: string;
  montoBs: number;
  montoUsd?: number | null;
  tipoRetencion: string;
  estado: 'esperando_reintegro' | 'reintegrado';
  referencia?: string | null;
  cuentaBanco?: string | null;
  diasEspera: number;
  empresaId?: string | null;
}

export interface ReintegrosPendientesViewProps {
  empresaId?: string | null;
  empresaNombre?: string;
  canWrite: boolean;
  actorName?: string | null;
}

export function ReintegrosPendientesView({
  empresaId,
  empresaNombre,
  canWrite,
}: ReintegrosPendientesViewProps) {
  const [cargando, setCargando] = useState(true);
  const [filas, setFilas] = useState<ReintegroItemFila[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'esperando_reintegro' | 'reintegrado' | 'todas'>('esperando_reintegro');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  // Modal para registrar reintegro
  const [modalItem, setModalItem] = useState<ReintegroItemFila | null>(null);
  const [regFecha, setRegFecha] = useState(new Date().toISOString().slice(0, 10));
  const [regCuenta, setRegCuenta] = useState('');
  const [cuentas, setCuentas] = useState<{id: number; nombre: string}[]>([]);
  const [regRef, setRegRef] = useState('');
  const [regMontoBs, setRegMontoBs] = useState('');
  const [regNota, setRegNota] = useState('');
  const [guardando, setGuardando] = useState(false);

  const esMits = !empresaId || empresaId === 'empresa-mits' || empresaId === 'empresa-lacantera' || empresaId === 'empresa-golden-touch';

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      const [reintegros, cuentasDisponibles] = await Promise.all([
        supabase.from('retencion_reintegros').select('id, datos, monto_bs, fecha_reintegro, referencia, cuenta_nombre, movimiento_id').is('cancelado_en', null).order('registrado_en', { ascending: false }),
        supabase.rpc('retencion_cuentas_reintegro'),
      ]);
      if (reintegros.error) throw new Error(reintegros.error.message);
      if (cuentasDisponibles.error) throw new Error(cuentasDisponibles.error.message);
      setCuentas(cuentasDisponibles.data ?? []);
      setFilas((reintegros.data ?? []).map((item): ReintegroItemFila => {
        const datos = item.datos as Partial<ReintegroItemFila>;
        return {
          ...datos,
          id: item.id,
          proveedor: datos.proveedor || 'Proveedor',
          facturas: (datos.facturas ?? []).filter(Boolean),
          fechaEmision: datos.fechaEmision ?? '',
          moneda: datos.moneda ?? 'Bs',
          tipoRetencion: datos.tipoRetencion ?? 'Retención',
          montoBs: Number(item.monto_bs),
          fechaReintegro: item.fecha_reintegro,
          referencia: item.referencia,
          cuentaBanco: item.cuenta_nombre,
          diasEspera: calcularDiasEspera(datos.fechaEmision),
          estado: item.movimiento_id ? 'reintegrado' : 'esperando_reintegro',
        };
      }));
    } catch (e) {
      console.error('Error al cargar reintegros pendientes:', e);
      toast('Error al consultar reintegros de proveedores', 'error');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  // Filtrado por empresa actual + filtros de cabecera
  const filtradas = useMemo(() => {
    return filas.filter((f) => {
      if (esMits) {
        if (f.empresaId && f.empresaId !== 'empresa-mits' && f.empresaId !== 'empresa-lacantera' && f.empresaId !== 'empresa-golden-touch') {
          return false;
        }
      } else {
        if (f.empresaId !== empresaId) {
          return false;
        }
      }

      if (filtroEstado !== 'todas' && f.estado !== filtroEstado) {
        return false;
      }

      if (desde && f.fechaEmision && f.fechaEmision < desde) return false;
      if (hasta && f.fechaEmision && f.fechaEmision > hasta) return false;

      if (busqueda.trim()) {
        const q = busqueda.trim().toLowerCase();
        const enOc = (f.codigoOc ?? '').toLowerCase().includes(q);
        const enComp = (f.numeroComprobante ?? '').toLowerCase().includes(q);
        const enProv = f.proveedor.toLowerCase().includes(q);
        const enRif = (f.proveedorRif ?? '').toLowerCase().includes(q);
        const enFact = f.facturas.some((x) => x.toLowerCase().includes(q));
        const enRef = (f.referencia ?? '').toLowerCase().includes(q);
        if (!enOc && !enComp && !enProv && !enRif && !enFact && !enRef) return false;
      }

      return true;
    });
  }, [filas, esMits, empresaId, filtroEstado, desde, hasta, busqueda]);

  // Indicadores de resumen
  const kpis = useMemo(() => {
    const pendientes = filtradas.filter((f) => f.estado === 'esperando_reintegro');
    const reintegradas = filtradas.filter((f) => f.estado === 'reintegrado');

    const totalBsPendiente = pendientes.reduce((acc, f) => acc + (f.montoBs || 0), 0);
    const totalUsdPendiente = pendientes.reduce((acc, f) => acc + (f.montoUsd || 0), 0);

    const totalBsCobrado = reintegradas.reduce((acc, f) => acc + (f.montoBs || 0), 0);
    const totalUsdCobrado = reintegradas.reduce((acc, f) => acc + (f.montoUsd || 0), 0);

    const promedioDias = pendientes.length
      ? Math.round(pendientes.reduce((acc, f) => acc + f.diasEspera, 0) / pendientes.length)
      : 0;

    return {
      pendientesCount: pendientes.length,
      totalBsPendiente,
      totalUsdPendiente,
      reintegradasCount: reintegradas.length,
      totalBsCobrado,
      totalUsdCobrado,
      promedioDias,
    };
  }, [filtradas]);

  const abrirModal = (item: ReintegroItemFila) => {
    setModalItem(item);
    setRegFecha(item.fechaReintegro || new Date().toISOString().slice(0, 10));
    setRegCuenta(String(cuentas[0]?.id ?? ''));
    setRegRef(item.referencia || '');
    setRegMontoBs(String(item.montoBs));
    setRegNota('');
  };

  const handleGuardarReintegro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalItem) return;

    const monto = Number(regMontoBs);
    if (isNaN(monto) || monto <= 0) {
      toast('Ingresa un monto válido para el reintegro', 'error');
      return;
    }
    if (!regRef.trim()) {
      toast('Ingresa el número de referencia bancaria o recibo', 'error');
      return;
    }

    setGuardando(true);
    try {
      const { error } = await supabase.rpc('retencion_recibir_reintegro', {
        p_id: modalItem.id, p_cuenta: Number(regCuenta), p_fecha: regFecha,
        p_referencia: regRef.trim(), p_nota: regNota.trim() || null,
      });
      if (error) throw new Error(error.message);

      toast(`✅ Reintegro de ${modalItem.proveedor} registrado con éxito (${bs(monto)})`, 'success');
      setModalItem(null);
      await cargarDatos();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al guardar el reintegro', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const copiarMensajeCobro = (item: ReintegroItemFila) => {
    const ordenDoc = item.codigoOc
      ? `orden *${item.codigoOc}*`
      : item.numeroComprobante
      ? `retención con comprobante *N° ${item.numeroComprobante}*`
      : `factura ${item.facturas.join(', ') || 'de compra'}`;

    const txt = [
      `*🔔 AVISO DE REINTEGRO PENDIENTE · ${empresaNombre || 'MINERIA INTERNACIONAL TS, C.A.'}*`,
      `Estimado proveedor *${item.proveedor}*,`,
      `Le informamos que tenemos pendiente el reembolso de la retención correspondiente a la ${ordenDoc}${item.facturas.length && item.codigoOc ? ` (Factura ${item.facturas.join(', ')})` : ''}.`,
      item.numeroComprobante && item.codigoOc ? `Comprobante de retención emitido: *N° ${item.numeroComprobante}*` : '',
      `*Monto por reintegrar:* ${bs(item.montoBs)}${item.montoUsd ? ` (${usd(item.montoUsd)})` : ''}`,
      `Días transcurridos: *${item.diasEspera} día(s)*`,
      `Favor realizar el reintegro a nuestras cuentas autorizadas y remitir el soporte correspondiente.`,
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(txt).then(() => {
      toast('📋 Mensaje de cobranza copiado al portapapeles para WhatsApp o correo.', 'success');
    }).catch(() => {
      toast('No se pudo copiar el texto', 'error');
    });
  };

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {/* ── Banner explicativo normativo / operativo (Paleta Tierra) ── */}
      <div
        style={{
          display: 'flex',
          gap: '.85rem',
          alignItems: 'flex-start',
          padding: '1rem 1.25rem',
          borderRadius: '6px',
          background: 'rgba(217, 119, 6, 0.08)',
          border: '1.5px solid rgba(217, 119, 6, 0.35)',
        }}
      >
        <div style={{ fontSize: '1.4rem', lineHeight: 1 }}>⚠️</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '.92rem', color: '#fbbf24', marginBottom: '.25rem' }}>
            Devoluciones pendientes de proveedores (Reintegros post-pago)
          </div>
          <div style={{ fontSize: '.82rem', color: '#cbd5e1', lineHeight: 1.45 }}>
            Retenciones emitidas después de haber pagado la orden de compra o servicio al 100%. El proveedor debe reembolsar el monto retenido en banco o caja. Al recibir los fondos, pulse <strong>«Registrar reintegro»</strong> para cuadrar el libro fiscal.
          </div>
        </div>
      </div>

      {/* ── KPI Cards de Gestión ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '.75rem',
        }}
      >
        <div className="card" style={{ padding: '.85rem 1rem', borderLeft: '4px solid #d97706', borderRadius: '6px' }}>
          <div className="muted" style={{ fontSize: '.76rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Por Recuperar (Pendientes)
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f59e0b', marginTop: '.2rem' }}>
            {bs(kpis.totalBsPendiente)}
          </div>
          <div style={{ fontSize: '.74rem', color: '#94a3b8', marginTop: '.15rem' }}>
            {kpis.pendientesCount} comprobante(s) en espera {kpis.totalUsdPendiente > 0 && `· ${usd(kpis.totalUsdPendiente)}`}
          </div>
        </div>

        <div className="card" style={{ padding: '.85rem 1rem', borderLeft: '4px solid #22c55e', borderRadius: '6px' }}>
          <div className="muted" style={{ fontSize: '.76rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Reintegrados (Cobrados)
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#22c55e', marginTop: '.2rem' }}>
            {bs(kpis.totalBsCobrado)}
          </div>
          <div style={{ fontSize: '.74rem', color: '#94a3b8', marginTop: '.15rem' }}>
            {kpis.reintegradasCount} reembolso(s) confirmados en banco
          </div>
        </div>

        <div className="card" style={{ padding: '.85rem 1rem', borderLeft: '4px solid #b45309', borderRadius: '6px' }}>
          <div className="muted" style={{ fontSize: '.76rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Tiempo Promedio en Espera
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fbbf24', marginTop: '.2rem' }}>
            {kpis.promedioDias} {kpis.promedioDias === 1 ? 'día' : 'días'}
          </div>
          <div style={{ fontSize: '.74rem', color: '#94a3b8', marginTop: '.15rem' }}>
            Desde la emisión de la orden o comprobante
          </div>
        </div>
      </div>

      {/* ── Barra de filtros y búsqueda ── */}
      <div
        className="card"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '.6rem',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '.65rem .85rem',
          borderRadius: '6px',
        }}
      >
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap', flex: '1 1 320px' }}>
          <input
            className="input"
            style={{ minWidth: '220px', flex: 1, borderRadius: '6px' }}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por OC, comprobante, proveedor o factura…"
          />

          <div className="view-toggle" style={{ margin: 0 }}>
            <button
              type="button"
              className={filtroEstado === 'esperando_reintegro' ? 'active' : ''}
              onClick={() => setFiltroEstado('esperando_reintegro')}
            >
              Pendientes ({kpis.pendientesCount})
            </button>
            <button
              type="button"
              className={filtroEstado === 'reintegrado' ? 'active' : ''}
              onClick={() => setFiltroEstado('reintegrado')}
            >
              Reintegrados ({kpis.reintegradasCount})
            </button>
            <button
              type="button"
              className={filtroEstado === 'todas' ? 'active' : ''}
              onClick={() => setFiltroEstado('todas')}
            >
              Todos ({filas.length})
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'nowrap' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '.35rem',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '4px 8px',
            }}
          >
            <span style={{ fontSize: '.76rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              📅 Rango:
            </span>
            <input
              type="date"
              className="input sm"
              style={{
                width: '130px',
                padding: '2px 6px',
                fontSize: '.78rem',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(0, 0, 0, 0.25)',
                borderRadius: '4px',
              }}
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              title="Fecha inicial de emisión"
              aria-label="Desde fecha de emisión"
            />
            <span style={{ fontSize: '.76rem', color: 'var(--text-muted)' }}>–</span>
            <input
              type="date"
              className="input sm"
              style={{
                width: '130px',
                padding: '2px 6px',
                fontSize: '.78rem',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(0, 0, 0, 0.25)',
                borderRadius: '4px',
              }}
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              title="Fecha final de emisión"
              aria-label="Hasta fecha de emisión"
            />
            {(desde || hasta) && (
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                onClick={() => { setDesde(''); setHasta(''); }}
                title="Limpiar rango de fechas"
                style={{ padding: '2px 6px', fontSize: '.72rem', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            )}
          </div>
          {busqueda && (
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              onClick={() => setBusqueda('')}
              title="Limpiar búsqueda"
              style={{ fontSize: '.74rem' }}
            >
              Limpiar búsqueda
            </button>
          )}
        </div>
      </div>

      {/* ── Tabla de Reintegros ── */}
      {cargando ? (
        <div className="card text-center" style={{ padding: '2.5rem', borderRadius: '6px' }}>
          <p className="muted">Consultando reintegros de retenciones post-pago…</p>
        </div>
      ) : filtradas.length === 0 ? (
        <div
          className="card text-center"
          style={{
            padding: '3rem 1.5rem',
            border: '1.5px dashed var(--border)',
            background: 'rgba(255, 255, 255, 0.01)',
            borderRadius: '6px',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '.6rem' }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#f8fafc' }}>
            No hay reintegros {filtroEstado === 'esperando_reintegro' ? 'pendientes de cobro' : 'para mostrar'}
          </div>
          <p className="muted" style={{ maxWidth: '420px', margin: '.4rem auto 0', fontSize: '.82rem' }}>
            {filtroEstado === 'esperando_reintegro'
              ? 'Todos los proveedores con retenciones emitidas post-pago han devuelto los importes correspondientes.'
              : 'No se encontraron registros con los filtros seleccionados.'}
          </p>
        </div>
      ) : (
        <div className="table-responsive card" style={{ padding: 0, overflow: 'hidden', borderRadius: '6px' }}>
          <table className="table" style={{ margin: 0, width: '100%', fontSize: '.82rem' }}>
            <thead style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid var(--border)' }}>
              <tr>
                <th style={{ padding: '.65rem .85rem' }}>Comprobante / OC</th>
                <th style={{ padding: '.65rem .85rem' }}>Proveedor / Contacto</th>
                <th style={{ padding: '.65rem .85rem' }}>Factura</th>
                <th style={{ padding: '.65rem .85rem' }}>Emisión</th>
                <th style={{ padding: '.65rem .85rem', textAlign: 'right' }}>Por Reintegrar</th>
                <th style={{ padding: '.65rem .85rem', textAlign: 'center' }}>Espera</th>
                <th style={{ padding: '.65rem .85rem', textAlign: 'center' }}>Estatus</th>
                <th style={{ padding: '.65rem .85rem', textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((item) => {
                const esPendiente = item.estado === 'esperando_reintegro';
                const badgeColor = item.diasEspera >= 15 ? '#ef4444' : item.diasEspera >= 7 ? '#d97706' : '#22c55e';
                const badgeBg = item.diasEspera >= 15 ? 'rgba(239, 68, 68, 0.15)' : item.diasEspera >= 7 ? 'rgba(217, 119, 6, 0.15)' : 'rgba(34, 197, 94, 0.15)';

                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border)', background: !esPendiente ? 'rgba(34, 197, 94, 0.02)' : 'transparent' }}>
                    <td style={{ padding: '.65rem .85rem', verticalAlign: 'middle' }}>
                      <div className="mono font-semibold" style={{ color: 'var(--text)' }}>
                        {item.codigoOc || 'S/N'}
                      </div>
                      {item.numeroComprobante && (
                        <div style={{ fontSize: '.72rem', color: '#94a3b8' }}>
                          Comp: <span className="mono">{item.numeroComprobante}</span>
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '.65rem .85rem', verticalAlign: 'middle' }}>
                      <div style={{ fontWeight: 600, color: '#f8fafc' }}>{item.proveedor}</div>
                      {item.proveedorRif && (
                        <div className="muted mono" style={{ fontSize: '.74rem' }}>{item.proveedorRif}</div>
                      )}
                    </td>

                    <td style={{ padding: '.65rem .85rem', verticalAlign: 'middle' }}>
                      {item.facturas.length ? (
                        item.facturas.map((fc) => (
                          <span key={fc} className="mono" style={{ fontSize: '.76rem', background: 'rgba(255,255,255,0.04)', padding: '2px 5px', borderRadius: '4px', marginRight: '4px' }}>
                            {fc}
                          </span>
                        ))
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>

                    <td style={{ padding: '.65rem .85rem', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      <span className="muted">{item.fechaEmision}</span>
                    </td>

                    <td style={{ padding: '.65rem .85rem', textAlign: 'right', verticalAlign: 'middle' }}>
                      <div style={{ fontWeight: 700, color: esPendiente ? '#d97706' : '#22c55e', fontSize: '.9rem' }}>
                        {bs(item.montoBs)}
                      </div>
                      {item.montoUsd != null && item.montoUsd > 0 && (
                        <div style={{ fontSize: '.72rem', color: '#94a3b8' }}>
                          {usd(item.montoUsd)}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '.65rem .85rem', textAlign: 'center', verticalAlign: 'middle' }}>
                      {esPendiente ? (
                        <span
                          style={{
                            fontSize: '.72rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            color: badgeColor,
                            background: badgeBg,
                            border: `1px solid ${badgeColor}`,
                          }}
                        >
                          {item.diasEspera} {item.diasEspera === 1 ? 'día' : 'días'}
                        </span>
                      ) : (
                        <span className="muted" style={{ fontSize: '.74rem' }}>—</span>
                      )}
                    </td>

                    <td style={{ padding: '.65rem .85rem', textAlign: 'center', verticalAlign: 'middle' }}>
                      {esPendiente ? (
                        <span style={{ fontSize: '.74rem', color: '#d97706', background: 'rgba(217, 119, 6, 0.1)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                          Esperando
                        </span>
                      ) : (
                        <div>
                          <span style={{ fontSize: '.74rem', color: '#22c55e', background: 'rgba(34, 197, 94, 0.1)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                            Reintegrado
                          </span>
                          {item.referencia && (
                            <div style={{ fontSize: '.68rem', color: '#94a3b8', marginTop: '.2rem' }}>
                              Ref: <span className="mono">{item.referencia}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '.65rem .85rem', textAlign: 'right', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', gap: '.35rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {canWrite && esPendiente && (
                          <button
                            type="button"
                            className="btn btn-xs btn-primary"
                            onClick={() => abrirModal(item)}
                            title="Registrar devolución bancaria o en caja"
                          >
                            ✏️ Registrar reintegro
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn btn-xs btn-ghost"
                          onClick={() => copiarMensajeCobro(item)}
                          title="Copiar texto de reclamo para WhatsApp / Correo"
                        >
                          💬 Cobro
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal para Registrar Reintegro ── */}
      {modalItem && (
        <Modal
          title="Registrar Reintegro de Proveedor"
          onClose={() => setModalItem(null)}
        >
          <form onSubmit={handleGuardarReintegro} style={{ display: 'grid', gap: '.85rem' }}>
            <div
              style={{
                background: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                padding: '.8rem',
                borderRadius: '6px',
                fontSize: '.82rem',
              }}
            >
              <div style={{ fontWeight: 700, color: '#22c55e', marginBottom: '.2rem' }}>
                Ingreso por devolución de retención post-pago
              </div>
              <div className="muted" style={{ lineHeight: 1.4 }}>
                El proveedor <strong>{modalItem.proveedor}</strong> reembolsa los fondos correspondientes a la retención de la orden <strong>{modalItem.codigoOc || 'S/N'}</strong>.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 600, marginBottom: '.2rem' }}>
                  Cuenta Receptora *
                </label>
                <select
                  className="input"
                  style={{ width: '100%', borderRadius: '6px' }}
                  value={regCuenta}
                  onChange={(e) => setRegCuenta(e.target.value)}
                  required
                >
                  {!cuentas.length && <option value="">Sin cuentas activas en bolívares</option>}
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 600, marginBottom: '.2rem' }}>
                  Monto Reintegrado (Bs) *
                </label>
                <input
                  className="input mono"
                  type="number"
                  step="0.01"
                  min="0.01"
                  style={{ width: '100%', borderRadius: '6px' }}
                  value={regMontoBs}
                  readOnly
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 600, marginBottom: '.2rem' }}>
                  Fecha del Reintegro *
                </label>
                <input
                  className="input"
                  type="date"
                  style={{ width: '100%', borderRadius: '6px' }}
                  value={regFecha}
                  onChange={(e) => setRegFecha(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 600, marginBottom: '.2rem' }}>
                  N° Referencia Bancaria / Recibo *
                </label>
                <input
                  className="input mono"
                  type="text"
                  style={{ width: '100%', borderRadius: '6px' }}
                  value={regRef}
                  onChange={(e) => setRegRef(e.target.value)}
                  placeholder="Ej. REF-09823412"
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 600, marginBottom: '.2rem' }}>
                Nota u Observación (opcional)
              </label>
              <textarea
                className="input"
                style={{ width: '100%', minHeight: '60px', borderRadius: '6px' }}
                value={regNota}
                onChange={(e) => setRegNota(e.target.value)}
                placeholder="Detalle adicional del reintegro o comprobante de depósito…"
              />
            </div>

            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '.5rem' }}>
              <button
                type="button"
                className="btn"
                onClick={() => setModalItem(null)}
                disabled={guardando}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={guardando}
              >
                {guardando ? 'Guardando…' : 'Confirmar Reintegro'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
