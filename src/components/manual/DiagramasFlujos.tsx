import { useState } from 'react'
import { Link } from 'react-router'
import {
  Scale,
  Receipt,
  Fuel,
  TrendingUp,
  Pickaxe,
  Wrench,
  ShieldCheck,
  Building2,
  ExternalLink,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Layers,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'

type CategoriaDiagrama =
  | 'TODOS'
  | 'ROMANA'
  | 'FISCAL'
  | 'COMBUSTIBLE'
  | 'MAQUINARIA'
  | 'ALMACEN'
  | 'BANCOS'

interface CategoriaFiltro {
  id: CategoriaDiagrama
  label: string
  icono: string
  conteo: number
}

const CATEGORIAS: CategoriaFiltro[] = [
  { id: 'TODOS', label: 'Todos los casos', icono: '🗺️', conteo: 8 },
  { id: 'ROMANA', label: 'Romana y Despachos', icono: '⚖️', conteo: 1 },
  { id: 'FISCAL', label: 'Fiscal y Retenciones', icono: '🧾', conteo: 2 },
  { id: 'COMBUSTIBLE', label: 'Mina y Combustible', icono: '⛽', conteo: 2 },
  { id: 'MAQUINARIA', label: 'Flota y Mantenimiento', icono: '🚜', conteo: 1 },
  { id: 'ALMACEN', label: 'Almacén y Herramientas', icono: '📦', conteo: 1 },
  { id: 'BANCOS', label: 'Bancos y Feriados', icono: '🏦', conteo: 1 },
]

export function DiagramasFlujos() {
  const [categoriaActiva, setCategoriaActiva] = useState<CategoriaDiagrama>('TODOS')

  const coincide = (cat: CategoriaDiagrama) =>
    categoriaActiva === 'TODOS' || categoriaActiva === cat

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Encabezado y Leyenda visual de simbología */}
      <div className="rounded-card border border-hairline bg-surface p-5 sm:p-6 shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-titular text-lg sm:text-xl font-bold text-ink flex items-center gap-2">
              <span className="size-2 rounded-full bg-tierra-600 animate-pulse" />
              Diagramas de Procesos y Flujos Operativos
            </h2>
            <p className="text-xs text-ink/70">
              Arquitectura visual de los circuitos críticos de Minería Internacional TS, C.A. (La Cantera).
            </p>
          </div>
          <span className="text-2xs font-mono font-bold px-2.5 py-1 rounded bg-tierra-600/10 text-tierra-600 border border-tierra-600/20 self-start sm:self-auto">
            G.O. 43.484 · SUDEBAN · NORMAS TÉCNICAS
          </span>
        </div>

        {/* Barra de Filtros por Categoría */}
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-hairline/60">
          {CATEGORIAS.map((cat) => {
            const activa = categoriaActiva === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoriaActiva(cat.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control text-xs font-medium transition-all ${
                  activa
                    ? 'bg-tierra-600 text-white shadow-xs font-bold'
                    : 'bg-canvas hover:bg-canvas/80 text-ink/75 border border-hairline hover:text-ink'
                }`}
              >
                <span>{cat.icono}</span>
                <span>{cat.label}</span>
                <span
                  className={`text-2xs px-1.5 py-0.2 rounded-full font-mono ${
                    activa ? 'bg-white/25 text-white' : 'bg-surface text-ink/60 border border-hairline'
                  }`}
                >
                  {cat.conteo}
                </span>
              </button>
            )
          })}
        </div>

        {/* Leyenda interactiva de elementos visuales */}
        <div className="p-3.5 rounded-control bg-canvas/60 border border-hairline text-xs">
          <p className="text-2xs font-bold text-ink/60 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Sparkles className="size-3 text-tierra-600" />
            Simbología Oficial Empleada en los Diagramas
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <div className="flex items-center gap-2 p-1.5 rounded bg-surface/80 border border-hairline">
              <span className="size-3 rounded-full bg-sky-500 shrink-0" />
              <span className="text-2xs text-ink/80 font-medium">1. Proceso / Acción</span>
            </div>
            <div className="flex items-center gap-2 p-1.5 rounded bg-surface/80 border border-hairline">
              <span className="size-3 rotate-45 rounded-xs bg-amber-500 shrink-0" />
              <span className="text-2xs text-ink/80 font-medium">2. Decisión / Bifurcación</span>
            </div>
            <div className="flex items-center gap-2 p-1.5 rounded bg-surface/80 border border-hairline">
              <span className="size-3 rounded-xs bg-emerald-500 shrink-0" />
              <span className="text-2xs text-ink/80 font-medium">3. Documento Legal</span>
            </div>
            <div className="flex items-center gap-2 p-1.5 rounded bg-surface/80 border border-hairline">
              <span className="size-3 rounded-xs bg-rose-500 shrink-0" />
              <span className="text-2xs text-ink/80 font-medium">4. Bloqueo de Riesgo</span>
            </div>
            <div className="flex items-center gap-2 p-1.5 rounded bg-surface/80 border border-hairline">
              <span className="size-3 rounded-xs bg-tierra-600 shrink-0" />
              <span className="text-2xs text-ink/80 font-medium">5. Regla / Parámetro</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CASO 1: BÁSCULA DE ROMANA Y DESPACHOS */}
      {/* ========================================================================= */}
      {coincide('ROMANA') && (
        <section className="rounded-card border border-hairline bg-surface p-5 sm:p-6 shadow-card space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-control bg-tierra-600/10 text-tierra-600 flex items-center justify-center shrink-0">
                <Scale className="size-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-tierra-600/10 text-tierra-600 font-mono">
                    CASO 01 · DESPACHOS
                  </span>
                  <span className="text-2xs text-ink/50">Pesaje Físico</span>
                </div>
                <h3 className="font-titular text-base sm:text-lg font-bold text-ink">
                  Ciclo Operativo de Pesaje y Despacho en Báscula de Romana
                </h3>
                <p className="text-xs text-ink/65">
                  Pesaje doble obligatorio (tara de entrada + peso bruto) y emisión de ticket inviolable.
                </p>
              </div>
            </div>
            <Link to="/app/control-despacho">
              <Button size="sm" variant="outline" icon={<ExternalLink className="size-3.5" />}>
                Abrir Romana
              </Button>
            </Link>
          </div>

          {/* Ilustración Técnica SVG Báscula de Camión */}
          <div className="w-full bg-canvas/80 rounded-control border border-hairline p-4 overflow-x-auto">
            <div className="min-w-[620px] flex items-center justify-between gap-4">
              {/* Gráfico Báscula y Camión */}
              <div className="flex-1">
                <svg viewBox="0 0 540 110" className="w-full h-auto text-ink" fill="none">
                  {/* Rampa izquierda */}
                  <polygon points="10,85 50,65 50,85" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
                  {/* Rampa derecha */}
                  <polygon points="490,65 530,85 490,85" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
                  {/* Plataforma romana metálica */}
                  <rect x="50" y="65" width="440" height="12" rx="2" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="2" strokeOpacity="0.6" />
                  {/* Celda de carga 1 */}
                  <rect x="90" y="77" width="22" height="10" rx="1" fill="#ea580c" />
                  {/* Celda de carga 2 */}
                  <rect x="260" y="77" width="22" height="10" rx="1" fill="#ea580c" />
                  {/* Celda de carga 3 */}
                  <rect x="430" y="77" width="22" height="10" rx="1" fill="#ea580c" />
                  {/* Viga base de suelo */}
                  <line x1="10" y1="87" x2="530" y2="87" stroke="currentColor" strokeWidth="3" strokeOpacity="0.4" />
                  
                  {/* Silueta de Camión Tolva sobre la Báscula */}
                  <g transform="translate(130, 16)">
                    {/* Cabina */}
                    <path d="M190,48 L190,18 L155,18 L140,32 L140,48 Z" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.8" />
                    {/* Ventana cabina */}
                    <path d="M185,22 L160,22 L148,34 L185,34 Z" fill="#38bdf8" fillOpacity="0.4" stroke="currentColor" strokeWidth="1" />
                    {/* Tolva cargada de agregados (arena/piedra) */}
                    <path d="M130,48 L130,12 L10,12 L0,48 Z" fill="#b45309" fillOpacity="0.4" stroke="currentColor" strokeWidth="1.8" />
                    {/* Montículo de roca / arena */}
                    <path d="M10,12 Q70,-2 130,12 Z" fill="#d97706" fillOpacity="0.7" />
                    {/* Chasis */}
                    <rect x="0" y="47" width="192" height="5" fill="currentColor" fillOpacity="0.6" />
                    {/* Ruedas traseras tándem */}
                    <circle cx="28" cy="52" r="10" fill="#18181b" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="28" cy="52" r="4" fill="#a1a1aa" />
                    <circle cx="56" cy="52" r="10" fill="#18181b" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="56" cy="52" r="4" fill="#a1a1aa" />
                    <circle cx="84" cy="52" r="10" fill="#18181b" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="84" cy="52" r="4" fill="#a1a1aa" />
                    {/* Rueda delantera */}
                    <circle cx="168" cy="52" r="10" fill="#18181b" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="168" cy="52" r="4" fill="#a1a1aa" />
                  </g>

                  {/* Indicador LED Digital de Romana */}
                  <g transform="translate(385, 8)">
                    <rect x="0" y="0" width="110" height="38" rx="4" fill="#09090b" stroke="#3f3f46" strokeWidth="1.5" />
                    <rect x="6" y="6" width="98" height="26" rx="2" fill="#18181b" />
                    <text x="55" y="24" fill="#22c55e" fontSize="13" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                      32,480 kg
                    </text>
                    {/* Poste de soporte del display */}
                    <rect x="52" y="38" width="6" height="27" fill="#71717a" />
                  </g>
                </svg>
              </div>

              {/* Parámetros en vivo de la báscula */}
              <div className="shrink-0 p-3 rounded bg-surface border border-hairline space-y-1.5 text-right w-44">
                <span className="text-2xs font-bold text-ink/60 uppercase tracking-wider block">Lectura Báscula</span>
                <p className="font-mono text-sm font-bold text-success">Tara: 14,200 kg</p>
                <p className="font-mono text-sm font-bold text-ink">Bruto: 32,480 kg</p>
                <div className="pt-1 border-t border-hairline">
                  <p className="font-mono text-xs font-black text-tierra-600">Neto: 18.28 tn</p>
                </div>
              </div>
            </div>
          </div>

          {/* Nodos del Flujo Paso a Paso */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5 pt-1">
            <div className="p-3.5 rounded-control border border-hairline bg-canvas/40 space-y-1 relative">
              <span className="text-2xs font-bold text-tierra-600 uppercase tracking-wider block">1. Llegada</span>
              <p className="text-xs font-bold text-ink">Entrada Vacío</p>
              <p className="text-2xs text-ink/70 leading-relaxed">
                Camión sobre plataforma. Se registra placa, chofer y <strong>Tara Real (kg)</strong>.
              </p>
            </div>

            <div className="p-3.5 rounded-control border border-hairline bg-canvas/40 space-y-1">
              <span className="text-2xs font-bold text-tierra-600 uppercase tracking-wider block">2. Frente Mina</span>
              <p className="text-xs font-bold text-ink">Carga en Tolva</p>
              <p className="text-2xs text-ink/70 leading-relaxed">
                Pasa al tajo o tolva de agregados. Cargador frontal llena arena, grava o piedra picada.
              </p>
            </div>

            <div className="p-3.5 rounded-control border border-hairline bg-canvas/40 space-y-1">
              <span className="text-2xs font-bold text-tierra-600 uppercase tracking-wider block">3. Re-pesaje</span>
              <p className="text-xs font-bold text-ink">Pesaje Bruto</p>
              <p className="text-2xs text-ink/70 leading-relaxed">
                Camión cargado sobre báscula. Se captura el <strong>Peso Bruto (kg)</strong> en tiempo real.
              </p>
            </div>

            <div className="p-3.5 rounded-control border border-amber-500/40 bg-amber-500/5 space-y-1">
              <span className="text-2xs font-bold text-amber-600 uppercase tracking-wider block">4. Auditoría</span>
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400">¿Excede Ejes?</p>
              <p className="text-2xs text-ink/70 leading-relaxed">
                Si supera el límite legal por eje, retorna a descarga parcial; si cumple, aprueba el neto.
              </p>
            </div>

            <div className="p-3.5 rounded-control border border-emerald-500/40 bg-emerald-500/5 space-y-1">
              <span className="text-2xs font-bold text-emerald-600 uppercase tracking-wider block">5. Salida</span>
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Ticket y Despacho</p>
              <p className="text-2xs text-ink/70 leading-relaxed">
                Impresión de Ticket inviolable + Nota de Entrega fiscal con código QR y salida autorizada.
              </p>
            </div>
          </div>

          {/* Fórmula Operativa y Regla de Oro */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-control bg-canvas border border-hairline flex items-center justify-between gap-3">
              <div>
                <span className="text-2xs font-bold uppercase tracking-wider text-tierra-600 block">Fórmula de Romana</span>
                <span className="font-mono font-bold text-ink text-sm">Neto (tn) = (Bruto − Tara) ÷ 1,000</span>
              </div>
              <span className="text-2xs font-mono px-2 py-1 rounded bg-tierra-600/10 text-tierra-600 font-bold">
                1 tn = 1,000 kg
              </span>
            </div>
            <div className="p-3 rounded-control bg-amber-500/10 border border-amber-500/20 text-ink/80 flex items-center gap-2.5">
              <AlertTriangle className="size-5 text-amber-600 shrink-0" />
              <span>
                <strong>Regla de oro:</strong> Jamás use tara histórica o de memoria. El consumo de gasoil y barro acumulado varían hasta 350 kg por jornada.
              </span>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* CASO 2: RETENCIONES FISCALES Y REINTEGROS */}
      {/* ========================================================================= */}
      {coincide('FISCAL') && (
        <section className="rounded-card border border-hairline bg-surface p-5 sm:p-6 shadow-card space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-control bg-tierra-600/10 text-tierra-600 flex items-center justify-center shrink-0">
                <Receipt className="size-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-mono">
                    CASO 02 · TRIBUTARIO
                  </span>
                  <span className="text-2xs text-ink/50">G.O. 43.484 · SENIAT</span>
                </div>
                <h3 className="font-titular text-base sm:text-lg font-bold text-ink">
                  Ciclo Legal de Retenciones Fiscales (IVA / ISLR) y Reintegros
                </h3>
                <p className="text-xs text-ink/65">
                  Bifurcación obligatoria: retención deducida antes del pago vs reintegro por compra ya pagada al 100%.
                </p>
              </div>
            </div>
            <Link to="/app/retenciones">
              <Button size="sm" variant="outline" icon={<ExternalLink className="size-3.5" />}>
                Ver Retenciones
              </Button>
            </Link>
          </div>

          {/* Diagrama Visual de Decisión y Bifurcación (SVG) */}
          <div className="p-4 rounded-control bg-canvas/80 border border-hairline space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-hairline">
              <span className="text-xs font-bold text-ink flex items-center gap-2">
                <Layers className="size-4 text-tierra-600" />
                Bifurcación Condicional: Tratamiento según Momento del Pago
              </span>
              <span className="text-2xs font-mono px-2 py-0.5 rounded bg-surface border border-hairline text-ink/70">
                COMPROBANTE R14 (14 DÍGITOS)
              </span>
            </div>

            {/* Visual Flow con Rombo de Decisión Central */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
              {/* Inicio: Factura */}
              <div className="lg:col-span-3 p-3.5 rounded-control bg-surface border border-hairline space-y-1.5 shadow-xs">
                <div className="flex items-center gap-1.5">
                  <FileText className="size-4 text-tierra-600" />
                  <span className="text-2xs font-bold uppercase tracking-wider text-tierra-600">Punto de Partida</span>
                </div>
                <p className="text-xs font-bold text-ink">Factura Fiscal Proveedor</p>
                <p className="text-2xs text-ink/70 leading-relaxed">
                  Recepción de Factura con RIF válido, N° Factura y N° de Control según Providencia SENIAT.
                </p>
              </div>

              {/* Conector Flecha */}
              <div className="hidden lg:flex lg:col-span-1 justify-center text-tierra-600">
                <ArrowRight className="size-5" />
              </div>

              {/* Rombo de Decisión */}
              <div className="lg:col-span-4 p-4 rounded-control bg-surface border-2 border-amber-500/50 relative text-center space-y-2 shadow-xs">
                <span className="size-2 rounded-full bg-amber-500 inline-block animate-ping" />
                <span className="text-2xs font-bold uppercase tracking-wider text-amber-600 block">
                  Validación Condicional
                </span>
                <p className="text-xs font-bold text-ink leading-snug">
                  ¿La compra ya fue pagada al 100% al proveedor?
                </p>
                <div className="flex justify-between items-center pt-2 border-t border-hairline text-2xs font-bold">
                  <span className="text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="size-3" /> NO (Por pagar)
                  </span>
                  <span className="text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="size-3" /> SÍ (Ya pagada)
                  </span>
                </div>
              </div>

              {/* Conector Flecha */}
              <div className="hidden lg:flex lg:col-span-1 justify-center text-tierra-600">
                <ArrowRight className="size-5" />
              </div>

              {/* Resumen de Salida */}
              <div className="lg:col-span-3 p-3.5 rounded-control bg-surface border border-hairline space-y-1.5 shadow-xs">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  <span className="text-2xs font-bold uppercase tracking-wider text-emerald-600">Enteramiento</span>
                </div>
                <p className="text-xs font-bold text-ink">Declaración Quincenal</p>
                <p className="text-2xs text-ink/70 leading-relaxed">
                  Exportación de archivo TXT oficial para carga directa al portal fiscal del SENIAT sin desfase.
                </p>
              </div>
            </div>

            {/* Dos Ramas Detalladas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Rama A: Compra Pendiente (Verde) */}
              <div className="p-4 rounded-control border border-emerald-500/30 bg-emerald-500/5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                    <span className="size-2.5 rounded-full bg-emerald-500" />
                    RUTA A: Deducción Directa (Flujo Ideal)
                  </span>
                  <span className="text-2xs font-mono font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded">
                    SIN REINTEGRO
                  </span>
                </div>
                <ol className="space-y-1.5 text-xs text-ink/80 list-decimal pl-4">
                  <li>Se emite Comprobante R14 reteniendo el <strong>75% o 100% del IVA</strong> causado.</li>
                  <li>Tesorería liquida al proveedor únicamente el <strong>Monto Neto</strong> (Factura − Retención).</li>
                  <li>El comprobante PDF se remite por correo y WhatsApp al proveedor.</li>
                  <li>El monto retenido se provisiona para enterarlo al SENIAT en la quincena correspondiente.</li>
                </ol>
              </div>

              {/* Rama B: Compra Ya Pagada (Ámbar) */}
              <div className="p-4 rounded-control border border-amber-500/30 bg-amber-500/5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-2">
                    <span className="size-2.5 rounded-full bg-amber-500" />
                    RUTA B: Reintegro de Fondos al 100%
                  </span>
                  <span className="text-2xs font-mono font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded">
                    RECLAMO ACTIVO
                  </span>
                </div>
                <ol className="space-y-1.5 text-xs text-ink/80 list-decimal pl-4">
                  <li>Se emite el Comprobante R14 (obligación legal tributaria ineludible).</li>
                  <li>El sistema lo coloca automáticamente en <strong>«Reintegros Pendientes»</strong>.</li>
                  <li>Se entrega el comprobante al proveedor para que devuelva la diferencia vía transferencia.</li>
                  <li>Al recibir los fondos en el banco, se pulsa <strong>«Registrar reintegro»</strong> para conciliar caja.</li>
                </ol>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* CASO 3: CIRCUITO CERRADO DE DIÉSEL Y HORÓMETROS */}
      {/* ========================================================================= */}
      {coincide('COMBUSTIBLE') && (
        <section className="rounded-card border border-hairline bg-surface p-5 sm:p-6 shadow-card space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-control bg-tierra-600/10 text-tierra-600 flex items-center justify-center shrink-0">
                <Fuel className="size-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-sky-500/10 text-sky-600 font-mono">
                    CASO 03 · MINA Y MAQUINARIA
                  </span>
                  <span className="text-2xs text-ink/50">Control de Hidrocarburos</span>
                </div>
                <h3 className="font-titular text-base sm:text-lg font-bold text-ink">
                  Circuito Cerrado de Diésel, Cubicación y Horómetros
                </h3>
                <p className="text-xs text-ink/65">
                  Trazabilidad hermética desde la cisterna nodriza hasta el consumo específico en litros/hora de cada máquina.
                </p>
              </div>
            </div>
            <Link to="/app/combustible">
              <Button size="sm" variant="outline" icon={<ExternalLink className="size-3.5" />}>
                Ver Surtidor
              </Button>
            </Link>
          </div>

          {/* Gráfico SVG Tanque Cilíndrico con Nivel de Combustible y Surtidor */}
          <div className="w-full bg-canvas/80 rounded-control border border-hairline p-4 overflow-x-auto">
            <div className="min-w-[620px] flex items-center justify-between gap-6">
              <svg viewBox="0 0 540 100" className="w-full h-auto text-ink" fill="none">
                {/* Tanque Cilíndrico Horizontal Industrial */}
                <g transform="translate(15, 10)">
                  {/* Patas de concreto */}
                  <rect x="25" y="70" width="18" height="15" fill="#71717a" rx="1" />
                  <rect x="135" y="70" width="18" height="15" fill="#71717a" rx="1" />
                  {/* Cuerpo del tanque */}
                  <rect x="20" y="10" width="140" height="60" rx="30" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="2" />
                  {/* Combustible líquido en el interior */}
                  <rect x="23" y="28" width="134" height="40" rx="20" fill="#0284c7" fillOpacity="0.35" />
                  {/* Domo de llenado / Aforo */}
                  <rect x="75" y="2" width="30" height="8" rx="2" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1" />
                  {/* Varilla de Cubicación milimétrica */}
                  <line x1="90" y1="2" x2="90" y2="68" stroke="#f59e0b" strokeWidth="2" strokeDasharray="2,2" />
                  <circle cx="90" cy="2" r="3" fill="#f59e0b" />
                  <text x="90" y="80" fill="currentColor" fontSize="8" fontFamily="monospace" textAnchor="middle">
                    Varilla: 142 cm
                  </text>
                </g>

                {/* Tubería de conexión */}
                <path d="M195,50 L240,50 L240,40" stroke="currentColor" strokeWidth="3" strokeOpacity="0.5" />

                {/* Surtidor Digital de Manguera */}
                <g transform="translate(240, 10)">
                  <rect x="0" y="0" width="70" height="75" rx="4" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.8" />
                  {/* Pantalla display */}
                  <rect x="8" y="10" width="54" height="24" rx="2" fill="#09090b" stroke="#3f3f46" strokeWidth="1" />
                  <text x="35" y="26" fill="#38bdf8" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                    180.5 L
                  </text>
                  {/* Pistola de despacho */}
                  <path d="M70,40 C85,40 90,65 95,70" stroke="#f97316" strokeWidth="3" fill="none" />
                  <rect x="92" y="68" width="10" height="5" fill="#f97316" rx="1" />
                </g>

                {/* Conector Flecha */}
                <path d="M360,45 L395,45" stroke="#f97316" strokeWidth="2" markerEnd="url(#arrow)" />

                {/* Horómetro de Motor de Maquinaria */}
                <g transform="translate(415, 8)">
                  <circle cx="40" cy="40" r="38" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="2" />
                  {/* Escala graduada */}
                  <path d="M15,55 A30,30 0 1,1 65,55" fill="none" stroke="#22c55e" strokeWidth="4" />
                  <path d="M55,20 A30,30 0 0,1 65,55" fill="none" stroke="#ef4444" strokeWidth="4" />
                  {/* Aguja indicadora */}
                  <line x1="40" y1="40" x2="52" y2="24" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="40" cy="40" r="4" fill="#f97316" />
                  {/* Display numérico digital */}
                  <rect x="18" y="52" width="44" height="15" rx="2" fill="#18181b" />
                  <text x="40" y="63" fill="#ffffff" fontSize="8" fontFamily="monospace" textAnchor="middle">
                    4,120.4 h
                  </text>
                </g>
              </svg>
            </div>
          </div>

          {/* Pasos del Circuito */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-1">
            <div className="p-3.5 rounded-control border border-hairline bg-canvas/40 space-y-1">
              <span className="text-2xs font-bold text-tierra-600 uppercase tracking-wider block">1. Descarga Cisterna</span>
              <p className="text-xs font-bold text-ink">Cubicación Tanque</p>
              <p className="text-2xs text-ink/70">
                Medición con varilla milimétrica traducida a litros según tabla geométrica de aforo.
              </p>
            </div>

            <div className="p-3.5 rounded-control border border-hairline bg-canvas/40 space-y-1">
              <span className="text-2xs font-bold text-tierra-600 uppercase tracking-wider block">2. Despacho Patio</span>
              <p className="text-xs font-bold text-ink">Contador Surtidor</p>
              <p className="text-2xs text-ink/70">
                Registro del contador numérico de la manguera antes y después de llenar el equipo.
              </p>
            </div>

            <div className="p-3.5 rounded-control border border-hairline bg-canvas/40 space-y-1">
              <span className="text-2xs font-bold text-tierra-600 uppercase tracking-wider block">3. Cabina Equipo</span>
              <p className="text-xs font-bold text-ink">Horómetro Actual</p>
              <p className="text-2xs text-ink/70">
                Lectura exacta de las horas de motor. El sistema valida que sea estrictamente mayor a la anterior.
              </p>
            </div>

            <div className="p-3.5 rounded-control border border-tierra-600/30 bg-tierra-600/5 space-y-1">
              <span className="text-2xs font-bold text-tierra-600 uppercase tracking-wider block">4. Auditoría Diaria</span>
              <p className="text-xs font-bold text-tierra-700 dark:text-tierra-300">Rendimiento L/h</p>
              <p className="text-2xs text-ink/80 font-semibold">
                Litros surtidos ÷ Δ Horas trabajadas. Alerta si hay sobreconsumo o posible fuga.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* CASO 4: DIFERENCIAL CAMBIARIO Y NOTA DE DÉBITO */}
      {/* ========================================================================= */}
      {coincide('FISCAL') && (
        <section className="rounded-card border border-hairline bg-surface p-5 sm:p-6 shadow-card space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-control bg-tierra-600/10 text-tierra-600 flex items-center justify-center shrink-0">
                <TrendingUp className="size-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 font-mono">
                    CASO 04 · FACTURACIÓN
                  </span>
                  <span className="text-2xs text-ink/50">SNAT/2026/00093</span>
                </div>
                <h3 className="font-titular text-base sm:text-lg font-bold text-ink">
                  Diferencial Cambiario y Emisión de Notas de Débito Fiscales
                </h3>
                <p className="text-xs text-ink/65">
                  Ajuste de base imponible e IVA causado cuando el cliente cancela en bolívares a una tasa BCV superior a la fecha de despacho.
                </p>
              </div>
            </div>
            <Link to="/app/facturacion">
              <Button size="sm" variant="outline" icon={<ExternalLink className="size-3.5" />}>
                Ver Facturación
              </Button>
            </Link>
          </div>

          {/* Timeline Visual de Fluctuación de Tasa */}
          <div className="p-4 rounded-control bg-canvas/80 border border-hairline space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              {/* Hito 1: Cotización / Factura */}
              <div className="p-3.5 rounded-control bg-surface border border-hairline space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-bold text-tierra-600 uppercase font-mono">DÍA 01 · DESPACHO</span>
                  <span className="text-2xs font-bold text-ink/60">Tasa T1</span>
                </div>
                <p className="text-xs font-bold text-ink">Factura Emitida en USD</p>
                <p className="text-2xs text-ink/70">
                  Despacho de 30 tn piedra picada ($300). Tasa BCV = <strong>Bs. 900.00 / $</strong>. Total: Bs. 270,000.
                </p>
              </div>

              {/* Hito 2: Pago en Bolívares */}
              <div className="p-3.5 rounded-control bg-surface border border-hairline space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-bold text-amber-600 uppercase font-mono">DÍA 05 · LIQUIDACIÓN</span>
                  <span className="text-2xs font-bold text-amber-600">Tasa T2 &gt; T1</span>
                </div>
                <p className="text-xs font-bold text-ink">Pago del Cliente en Bs</p>
                <p className="text-2xs text-ink/70">
                  Cliente transfiere en bolívares. Tasa BCV = <strong>Bs. 920.00 / $</strong>. Total abonado: Bs. 276,000.
                </p>
              </div>

              {/* Hito 3: Nota de Débito Fiscal */}
              <div className="p-3.5 rounded-control bg-emerald-500/10 border border-emerald-500/30 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-bold text-emerald-600 uppercase font-mono">AJUSTE FISCAL</span>
                  <span className="text-2xs font-bold text-emerald-600">SNAT/00093</span>
                </div>
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">Nota de Débito Fiscal</p>
                <p className="text-2xs text-ink/80">
                  Diferencial: +Bs. 6,000. El sistema genera Nota de Débito con <strong>IVA sobre el incremento</strong>.
                </p>
              </div>
            </div>

            <div className="p-3 rounded bg-surface border border-hairline text-2xs text-ink/75 leading-relaxed flex items-center gap-3">
              <span className="text-base shrink-0">⚖️</span>
              <span>
                <strong>Fundamento Legal:</strong> La Providencia Administrativa SNAT/2026/00093 establece que toda variación cambiaria positiva en operaciones comerciales pagaderas en moneda nacional obliga a la emisión de una Nota de Débito para enterar el IVA correspondiente.
              </span>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* CASO 5: PRODUCCIÓN, TOPOGRAFÍA Y CUBICACIÓN EN MINA */}
      {/* ========================================================================= */}
      {coincide('COMBUSTIBLE') && (
        <section className="rounded-card border border-hairline bg-surface p-5 sm:p-6 shadow-card space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-control bg-tierra-600/10 text-tierra-600 flex items-center justify-center shrink-0">
                <Pickaxe className="size-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-tierra-600/10 text-tierra-600 font-mono">
                    CASO 05 · MINA Y PLANTA
                  </span>
                  <span className="text-2xs text-ink/50">Cubicación Topográfica</span>
                </div>
                <h3 className="font-titular text-base sm:text-lg font-bold text-ink">
                  Producción, Topografía y Cubicación de Tajos en Mina
                </h3>
                <p className="text-xs text-ink/65">
                  Ciclo de explotación en banco, chancado en planta y cálculo de esponjamiento (m³ a toneladas).
                </p>
              </div>
            </div>
            <Link to="/app/produccion">
              <Button size="sm" variant="outline" icon={<ExternalLink className="size-3.5" />}>
                Ver Producción
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-control border border-hairline bg-canvas/40 space-y-1">
              <span className="text-2xs font-bold text-tierra-600 uppercase tracking-wider block">1. Topografía UTM</span>
              <p className="text-xs font-bold text-ink">Cotas del Tajo</p>
              <p className="text-2xs text-ink/70">
                Levantamiento inicial de coordenadas y cotas con estación total antes de iniciar el arranque.
              </p>
            </div>

            <div className="p-3.5 rounded-control border border-hairline bg-canvas/40 space-y-1">
              <span className="text-2xs font-bold text-tierra-600 uppercase tracking-wider block">2. Extracción</span>
              <p className="text-xs font-bold text-ink">Banco y Voladura</p>
              <p className="text-2xs text-ink/70">
                Perforación y fragmentación primaria de roca caliza o granítica en frentes autorizados.
              </p>
            </div>

            <div className="p-3.5 rounded-control border border-hairline bg-canvas/40 space-y-1">
              <span className="text-2xs font-bold text-tierra-600 uppercase tracking-wider block">3. Trituración</span>
              <p className="text-xs font-bold text-ink">Plantas y Cribas</p>
              <p className="text-2xs text-ink/70">
                Chancado y clasificación granulométrica por mallas: Arena lavada, Grava y Piedra picada 3/4.
              </p>
            </div>

            <div className="p-3.5 rounded-control border border-tierra-600/30 bg-tierra-600/5 space-y-1">
              <span className="text-2xs font-bold text-tierra-600 uppercase tracking-wider block">4. Stock Acopio</span>
              <p className="text-xs font-bold text-tierra-700 dark:text-tierra-300">Factor Esponjamiento</p>
              <p className="text-2xs text-ink/80 font-semibold">
                Conversión de m³ en banco a toneladas métricas para inventario disponible en romana.
              </p>
            </div>
          </div>

          <div className="p-3 rounded-control bg-canvas border border-hairline flex items-center justify-between text-xs">
            <span className="font-mono text-ink">
              <strong>Fórmula de Conversión:</strong> Toneladas = m³ en banco × Densidad aparente × Factor de esponjamiento (1.25 a 1.35)
            </span>
            <span className="text-2xs font-mono font-bold text-tierra-600 shrink-0">CANTERA CERTIFICADA</span>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* CASO 6: MANTENIMIENTO PREVENTIVO POR HORÓMETRO */}
      {/* ========================================================================= */}
      {coincide('MAQUINARIA') && (
        <section className="rounded-card border border-hairline bg-surface p-5 sm:p-6 shadow-card space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-control bg-tierra-600/10 text-tierra-600 flex items-center justify-center shrink-0">
                <Wrench className="size-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 font-mono">
                    CASO 06 · TALLER Y FLOTA
                  </span>
                  <span className="text-2xs text-ink/50">Mantenimiento Preventivo</span>
                </div>
                <h3 className="font-titular text-base sm:text-lg font-bold text-ink">
                  Mantenimiento Preventivo de Flota por Horómetro Acumulado
                </h3>
                <p className="text-xs text-ink/65">
                  Semáforo automático (250h / 1,000h) con bloqueo de seguridad en surtidor si la máquina está en taller.
                </p>
              </div>
            </div>
            <Link to="/app/maquinaria">
              <Button size="sm" variant="outline" icon={<ExternalLink className="size-3.5" />}>
                Ver Maquinaria
              </Button>
            </Link>
          </div>

          {/* Semáforo de 3 Estados */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-4 rounded-control border border-emerald-500/30 bg-emerald-500/5 space-y-2">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-emerald-500 shrink-0" />
                <p className="text-xs font-bold text-ink uppercase tracking-wide">1. Operativa (&lt; 225h)</p>
              </div>
              <p className="text-xs text-ink/75 leading-relaxed">
                Máquina trabajando con normalidad. Despacho habilitado en surtidor digital y asignada a frentes de tajo.
              </p>
            </div>

            <div className="p-4 rounded-control border border-amber-500/30 bg-amber-500/5 space-y-2">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-amber-500 shrink-0" />
                <p className="text-xs font-bold text-ink uppercase tracking-wide">2. Alerta (225h - 250h)</p>
              </div>
              <p className="text-xs text-ink/75 leading-relaxed">
                El sistema avisa al Jefe de Mantenimiento para preordenar kits de filtros, aceite hidráulico y lubricantes en almacén.
              </p>
            </div>

            <div className="p-4 rounded-control border border-rose-500/30 bg-rose-500/5 space-y-2">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-rose-500 shrink-0" />
                <p className="text-xs font-bold text-ink uppercase tracking-wide">3. En Taller / Bloqueo (≥250h)</p>
              </div>
              <p className="text-xs text-ink/75 leading-relaxed">
                Bloqueo automático de despacho de gasoil en surtidor hasta que el mecánico finalice la orden de servicio.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* CASO 7: CUSTODIA Y SOLVENCIA DE HERRAMIENTAS Y EPP */}
      {/* ========================================================================= */}
      {coincide('ALMACEN') && (
        <section className="rounded-card border border-hairline bg-surface p-5 sm:p-6 shadow-card space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-control bg-tierra-600/10 text-tierra-600 flex items-center justify-center shrink-0">
                <ShieldCheck className="size-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-mono">
                    CASO 07 · ALMACÉN Y RRHH
                  </span>
                  <span className="text-2xs text-ink/50">Custodia Física</span>
                </div>
                <h3 className="font-titular text-base sm:text-lg font-bold text-ink">
                  Custodia, Asignación y Finiquito de Herramientas y EPP
                </h3>
                <p className="text-xs text-ink/65">
                  Trazabilidad por código de barras, inspección de devolución y emisión obligatoria de «Solvencia de Materiales».
                </p>
              </div>
            </div>
            <Link to="/app/inventario">
              <Button size="sm" variant="outline" icon={<ExternalLink className="size-3.5" />}>
                Ver Inventario
              </Button>
            </Link>
          </div>

          <div className="p-4 rounded-control bg-canvas/80 border border-hairline space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded bg-surface border border-hairline space-y-1">
                <span className="text-2xs font-bold text-tierra-600 uppercase">1. Asignación</span>
                <p className="font-bold text-ink">Vale con Firma Digital</p>
                <p className="text-2xs text-ink/70">Entrega de taladros, arneses, cascos y botas vinculados a la cédula del trabajador.</p>
              </div>
              <div className="p-3 rounded bg-surface border border-hairline space-y-1">
                <span className="text-2xs font-bold text-tierra-600 uppercase">2. Uso en Frente</span>
                <p className="font-bold text-ink">Custodia en Cantera</p>
                <p className="text-2xs text-ink/70">Monitoreo continuo de vida útil e inspecciones periódicas de seguridad industrial.</p>
              </div>
              <div className="p-3 rounded bg-surface border border-hairline space-y-1">
                <span className="text-2xs font-bold text-tierra-600 uppercase">3. Devolución</span>
                <p className="font-bold text-ink">Inspección Técnica</p>
                <p className="text-2xs text-ink/70">Almacén verifica estado físico. Se separa desgaste natural vs extravío o daño culposo.</p>
              </div>
              <div className="p-3 rounded bg-emerald-500/10 border border-emerald-500/30 space-y-1">
                <span className="text-2xs font-bold text-emerald-600 uppercase">4. Finiquito RRHH</span>
                <p className="font-bold text-emerald-700 dark:text-emerald-300">Solvencia de Materiales</p>
                <p className="text-2xs text-ink/80">Requisito indispensable para que Administración liquide prestaciones sociales.</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* CASO 8: TESORERÍA, FERIADOS SUDEBAN Y CONCILIACIÓN */}
      {/* ========================================================================= */}
      {coincide('BANCOS') && (
        <section className="rounded-card border border-hairline bg-surface p-5 sm:p-6 shadow-card space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-control bg-tierra-600/10 text-tierra-600 flex items-center justify-center shrink-0">
                <Building2 className="size-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-sky-500/10 text-sky-600 font-mono">
                    CASO 08 · TESORERÍA Y BANCOS
                  </span>
                  <span className="text-2xs text-ink/50">Calendario SUDEBAN</span>
                </div>
                <h3 className="font-titular text-base sm:text-lg font-bold text-ink">
                  Tesorería Multimoneda, Feriados Bancarios SUDEBAN y Conciliación
                </h3>
                <p className="text-xs text-ink/65">
                  Regla de tasa BCV anticipada en feriados bancarios y cruce automatizado con extractos de cuentas.
                </p>
              </div>
            </div>
            <Link to="/app/tesoreria">
              <Button size="sm" variant="outline" icon={<ExternalLink className="size-3.5" />}>
                Ver Tesorería
              </Button>
            </Link>
          </div>

          <div className="p-4 rounded-control bg-canvas/80 border border-hairline space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-control bg-surface border border-hairline space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-bold text-tierra-600 uppercase font-mono">CALENDARIO OFICIAL</span>
                  <span className="text-2xs font-bold text-ink/60">Lunes Bancario</span>
                </div>
                <p className="text-xs font-bold text-ink">Feriado Bancario Detectado</p>
                <p className="text-2xs text-ink/70">
                  El BCV no emite rueda cambiaria en feriados SUDEBAN o fines de semana bancarios.
                </p>
              </div>

              <div className="p-3.5 rounded-control bg-surface border border-hairline space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-bold text-amber-600 uppercase font-mono">REGLA DEL SISTEMA</span>
                  <span className="text-2xs font-bold text-amber-600">Tasa Anticipada</span>
                </div>
                <p className="text-xs font-bold text-ink">Siguiente Día Hábil</p>
                <p className="text-2xs text-ink/70">
                  El sistema toma automáticamente la tasa anticipada publicada para el siguiente día bancario hábil.
                </p>
              </div>

              <div className="p-3.5 rounded-control bg-emerald-500/10 border border-emerald-500/30 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-bold text-emerald-600 uppercase font-mono">CONCILIACIÓN</span>
                  <span className="text-2xs font-bold text-emerald-600">Cuadre Exacto</span>
                </div>
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">Cruce de Extractos</p>
                <p className="text-2xs text-ink/80">
                  Cobros y pagos se auditan contra las cartolas bancarias garantizando cero descuadre por diferencial.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
