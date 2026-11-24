/* ============================================================
   Golden Touch · Administración — «Gastos fijos por servicio»
   Multi-empresa (lista propia del módulo): la cabecera trae el selector de
   EMPRESA (activas + «Todas»), recordado por navegador, y «⚙ Gestionar
   empresas». Toda la vista se filtra por la empresa elegida. Tres pestañas:
   Gastos fijos (viva) · Movimientos/Histórico · Reporte (Fase 2/3).
   Estilo del sistema (view-toggle, tarjetas, tokens). Los datos entran por
   un repo inyectado: Supabase en la app; en memoria en la demo (DEV).
   ============================================================ */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  LayoutDashboard,
  Receipt,
  History,
  Briefcase,
  FolderArchive,
  Calendar,
  Users,
  BarChart3,
  ScrollText,
  Settings,
  Bell,
  BellOff,
  Smartphone,
  Building2,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { usePwaInstall } from '@/shared/hooks/usePwaInstall';
import { esErrorTablaAusente, extraerMensajeError } from './adminErrores';
import { crearRepoSupabase, type AdminRepo, type Empresa, type DocumentoEmpresa } from './admin.repository';
import { crearPreferenciasAdmin, TODAS, type PreferenciasAdmin, type TabAdmin } from './administracionPreferencias';
import { EmpresasModal } from './EmpresasModal';
import { GastosFijosTab } from './GastosFijosTab';
import { MovimientosTab } from './MovimientosTab';
import { HonorariosTab } from './HonorariosTab';
import { AgendaTab } from './AgendaTab';
import { ResponsabilidadTab } from './ResponsabilidadTab';
import { ReporteTab } from './ReporteTab';
import { DocumentosTab } from './DocumentosTab';
import { ConfiguracionTab } from './ConfiguracionTab';
import { TableroModuloTab } from './TableroModuloTab';
import { AuditoriaTab } from './AuditoriaTab';
import { NotificacionesAdminModal } from './NotificacionesAdminModal';
import {
  evaluarAlertasDocumentos,
  emitirNotificacionPushNativa,
  dispararSonidoAlertaAdmin,
} from './notificacionesAdministracion';
import './administracion.css';

interface PestanaConfig {
  id: TabAdmin;
  label: string;
  icon: LucideIcon;
}

const PESTANAS: PestanaConfig[] = [
  { id: 'tablero', label: 'Tablero', icon: LayoutDashboard },
  { id: 'gastos', label: 'Gastos fijos', icon: Receipt },
  { id: 'movimientos', label: 'Movimientos', icon: History },
  { id: 'honorarios', label: 'Honorarios', icon: Briefcase },
  { id: 'documentos', label: 'Documentos', icon: FolderArchive },
  { id: 'agenda', label: 'Agenda', icon: Calendar },
  { id: 'responsabilidad', label: 'Responsabilidad', icon: Users },
  { id: 'reporte', label: 'Reporte', icon: BarChart3 },
  { id: 'auditoria', label: 'Auditoría', icon: ScrollText },
  { id: 'config', label: 'Configuración', icon: Settings },
];

export function AdministracionPage({ repo: repoDado, prefs: prefsDadas, aviso, puedeEscribir = true, puedeFull = true }: {
  repo?: AdminRepo;
  prefs?: PreferenciasAdmin;
  /** Franja arriba de todo (la demo avisa que es de prueba). */
  aviso?: ReactNode;
  /** Permiso de escritura del módulo (registrar/generar/importar/editar). La demo lo deja en true. */
  puedeEscribir?: boolean;
  /** Full control: además gestiona la lista de empresas (admin_empresas). */
  puedeFull?: boolean;
} = {}) {
  const repo = useMemo(() => repoDado ?? crearRepoSupabase(), [repoDado]);
  const prefs = useMemo(() => prefsDadas ?? crearPreferenciasAdmin(), [prefsDadas]);

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [empresaSel, setEmpresaSel] = useState<string>(() => prefs.leerEmpresa());
  const [tab, setTab] = useState<TabAdmin>(() => prefs.leerTab());
  const [gestionar, setGestionar] = useState(false);
  const [verNotificaciones, setVerNotificaciones] = useState(false);
  const [todosLosDocs, setTodosLosDocs] = useState<DocumentoEmpresa[]>([]);
  const { isInstallable, promptInstall } = usePwaInstall();

  const cargarEmpresas = useCallback(async () => {
    setError(null);
    try { setEmpresas(await repo.listEmpresas()); }
    catch (e) { setError(extraerMensajeError(e, 'No se pudieron leer las empresas.')); }
  }, [repo]);

  const cargarDocsAlerta = useCallback(async () => {
    try {
      const d = await repo.listDocumentos();
      setTodosLosDocs(d);
    } catch { /* ignore */ }
  }, [repo]);

  useEffect(() => { void cargarEmpresas(); }, [cargarEmpresas]);
  useEffect(() => { void cargarDocsAlerta(); }, [cargarDocsAlerta]);

  // Si la empresa elegida ya no está activa (la desactivaron/borraron), vuelve a «Todas».
  useEffect(() => {
    if (empresaSel !== TODAS && empresas.length && !empresas.some((e) => e.clave === empresaSel && e.activa)) {
      setEmpresaSel(TODAS);
      prefs.guardarEmpresa(TODAS);
    }
  }, [empresas, empresaSel, prefs]);

  const activas = useMemo(() => empresas.filter((e) => e.activa), [empresas]);
  const empresaClave = empresaSel === TODAS ? null : empresaSel;

  const elegirEmpresa = (v: string) => { setEmpresaSel(v); prefs.guardarEmpresa(v); };
  const elegirTab = (t: TabAdmin) => { setTab(t); prefs.guardarTab(t); };

  // Alertas de documentos según la regla de tiempos establecidos y descartes
  const { nuevasParaSonar, totalSilenciadas } = useMemo(() => {
    return evaluarAlertasDocumentos(
      empresaClave ? todosLosDocs.filter((d) => d.empresaClave === empresaClave) : todosLosDocs,
    );
  }, [todosLosDocs, empresaClave]);

  // Emitir notificación PWA nativa y sonido al detectar alertas activas
  useEffect(() => {
    if (nuevasParaSonar.length === 0) return;
    try {
      const storageKey = 'gt.admin.alertas_notificadas_session';
      const raw = sessionStorage.getItem(storageKey);
      const yaNotificados = new Set<string>(raw ? JSON.parse(raw) : []);

      const pendientes = nuevasParaSonar.filter((a) => !yaNotificados.has(`${a.docId}_${a.hitoActual}`));
      if (pendientes.length === 0) return;

      for (const p of pendientes) {
        yaNotificados.add(`${p.docId}_${p.hitoActual}`);
      }
      sessionStorage.setItem(storageKey, JSON.stringify(Array.from(yaNotificados)));

      // 1. Sonido de alerta
      dispararSonidoAlertaAdmin();

      // 2. Notificación push emergente en el dispositivo
      const masUrgente = pendientes[0];
      const titulo = pendientes.length === 1
        ? `💼 Alerta de Documento · ${masUrgente.empresaClave}`
        : `💼 Administración: ${pendientes.length} alertas de vigencia`;
      const cuerpo = pendientes.length === 1
        ? `«${masUrgente.nombre}»: ${masUrgente.mensaje}`
        : `«${masUrgente.nombre}» y otros documentos requieren atención.`;

      void emitirNotificacionPushNativa(titulo, cuerpo, '/administracion');
    } catch { /* best-effort */ }
  }, [nuevasParaSonar]);

  return (
    <div className="space-y-4">
      {aviso}

      <PageHeader
        eyebrow="ADMINISTRACIÓN CORPORATIVA"
        title="Administración"
        description="Gastos fijos por servicio, honorarios, documentos legales, agenda de trámites y reporte ejecutivo."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Selector de empresa elegante */}
            <div className="flex items-center gap-2 rounded-control border border-hairline bg-surface px-3 py-1.5 shadow-xs">
              <Building2 className="size-4 text-ink/40" />
              <span className="text-xs font-medium text-ink/50">Empresa:</span>
              <select
                value={empresaSel}
                onChange={(e) => elegirEmpresa(e.target.value)}
                aria-label="Filtrar por empresa"
                className="bg-transparent text-sm font-semibold text-ink focus:outline-none cursor-pointer pr-1"
              >
                <option value={TODAS}>Todas las empresas</option>
                {activas.map((e) => (
                  <option key={e.id} value={e.clave}>
                    {e.nombre}
                  </option>
                ))}
              </select>
            </div>

            {puedeFull && (
              <Button
                variant="outline"
                size="sm"
                icon={<Settings className="size-3.5" />}
                onClick={() => setGestionar(true)}
              >
                Gestionar empresas
              </Button>
            )}

            {isInstallable && (
              <Button
                variant="outline"
                size="sm"
                icon={<Smartphone className="size-3.5" />}
                onClick={() => void promptInstall()}
                title="Instalar en la pantalla de inicio o escritorio"
              >
                Instalar App
              </Button>
            )}

            {/* Campana de notificaciones con badge */}
            <button
              type="button"
              onClick={() => setVerNotificaciones(true)}
              className="relative inline-flex items-center justify-center size-9 rounded-control border border-hairline bg-surface text-ink/75 hover:text-ink hover:border-ink/30 transition-colors shadow-xs"
              title={
                nuevasParaSonar.length > 0
                  ? `${nuevasParaSonar.length} alertas activas de vencimiento`
                  : totalSilenciadas > 0
                  ? `${totalSilenciadas} alertas silenciadas temporalmente`
                  : 'Centro de Alertas y Notificaciones'
              }
            >
              {nuevasParaSonar.length > 0 ? (
                <Bell className="size-4.5 text-warning" />
              ) : (
                <BellOff className="size-4.5 text-ink/40" />
              )}
              {nuevasParaSonar.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white shadow-xs">
                  {nuevasParaSonar.length}
                </span>
              )}
            </button>
          </div>
        }
      />

      {/* Riel horizontal de navegación de pestañas (Estilo Materio / La Cantera) */}
      <div className="flex border-b border-hairline gap-1 overflow-x-auto scrollbar-none pb-px mb-4">
        {PESTANAS.map((p) => {
          const Icon = p.icon;
          const esActiva = tab === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => elegirTab(p.id)}
              className={cn(
                'flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap transition-all border-b-2 -mb-px rounded-t-[4px]',
                esActiva
                  ? 'border-tierra-600 text-tierra-600 dark:text-tierra-300 bg-tierra-600/5'
                  : 'border-transparent text-ink/60 hover:text-ink hover:border-hairline hover:bg-ink/5',
              )}
            >
              <Icon className={cn('size-4', esActiva ? 'text-tierra-600 dark:text-tierra-400' : 'text-ink/40')} />
              <span>{p.label}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="adm-aviso">
          No se pudieron leer las empresas: {esErrorTablaAusente(error) || /sesi|jwt|auth|401|permission|does not exist/i.test(error)
            ? 'las tablas del módulo aún no han sido aplicadas en la base de datos (ejecutar script SQL de administración).'
            : error}
        </div>
      )}

      <div className="min-w-0">
        {tab === 'tablero' && <TableroModuloTab repo={repo} empresaClave={empresaClave} empresas={empresas} puedeEscribir={puedeEscribir} />}
        {tab === 'gastos' && <GastosFijosTab repo={repo} empresaClave={empresaClave} empresas={empresas} puedeEscribir={puedeEscribir} />}
        {tab === 'movimientos' && <MovimientosTab repo={repo} empresaClave={empresaClave} empresas={empresas} puedeEscribir={puedeEscribir} />}
        {tab === 'honorarios' && <HonorariosTab repo={repo} empresaClave={empresaClave} empresas={empresas} puedeEscribir={puedeEscribir} />}
        {tab === 'documentos' && <DocumentosTab repo={repo} empresaClave={empresaClave} empresas={empresas} puedeEscribir={puedeEscribir} />}
        {tab === 'agenda' && <AgendaTab repo={repo} empresaClave={empresaClave} empresas={empresas} />}
        {tab === 'responsabilidad' && <ResponsabilidadTab repo={repo} empresaClave={empresaClave} empresas={empresas} puedeEscribir={puedeEscribir} />}
        {tab === 'reporte' && <ReporteTab repo={repo} empresaClave={empresaClave} empresas={empresas} />}
        {tab === 'auditoria' && <AuditoriaTab documentos={todosLosDocs} empresas={empresas} empresaClave={empresaClave} />}
        {tab === 'config' && <ConfiguracionTab repo={repo} empresas={empresas} puedeFull={puedeFull} puedeEscribir={puedeEscribir} onGestionarEmpresas={() => setGestionar(true)} />}
      </div>

      {gestionar && puedeFull && <EmpresasModal repo={repo} onClose={() => setGestionar(false)} onChanged={() => void cargarEmpresas()} />}

      {verNotificaciones && (
        <NotificacionesAdminModal
          documentos={todosLosDocs}
          empresaClave={empresaClave}
          onClose={() => {
            setVerNotificaciones(false);
            void cargarDocsAlerta();
          }}
          onVerDocumento={() => {
            setTab('documentos');
          }}
        />
      )}
    </div>
  );
}

/** La ruta de la app real: toma los permisos del rol y los pasa a la página.
 *  (La demo DEV usa `AdministracionPage` directo, fuera del PermissionsProvider.) */
export function AdministracionPageApp() {
  const { can } = usePermissions();
  return <AdministracionPage puedeEscribir={can('administracion', 'escritura')} puedeFull={can('administracion', 'full')} />;
}
