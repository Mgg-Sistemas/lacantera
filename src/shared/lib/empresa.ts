/* ============================================================
   Golden Touch · Identidad de la empresa en los documentos

   RIF, correo y WhatsApp que salen impresos en constancias, planillas y
   carnets. Están aquí y en ningún otro lado a propósito: estaban escritos a
   mano en cada archivo que los dibujaba, así que cambiar el correo obligaba a
   ir a buscarlo a tres lugares y el que se olvidaba quedaba desfasado. Si
   mañana cambia cualquiera de estos datos, se edita este archivo y listo.
   ============================================================ */

/** Razón social tal como va en los documentos formales. */
export const EMPRESA_NOMBRE = 'MINERIA INTERNACIONAL TS, C.A.';

/** Domicilio fiscal (membrete de la nota de envío y documentos formales). */
export const EMPRESA_DOMICILIO = 'Sector La Cantera, Estado Bolívar, Venezuela';

/** RIF fiscal, para el membrete de los documentos formales. */
export const EMPRESA_RIF = 'J-50209170-0';

/** Correo de contacto que va impreso en los documentos. */
export const EMPRESA_EMAIL = 'contacto@mineriainternacionalts.com';

/** WhatsApp de contacto que va impreso en los documentos. */
export const EMPRESA_WHATSAPP = '+58 424-9349731';

/** La línea de contacto tal como aparece en el membrete. */
export const EMPRESA_CONTACTO = `${EMPRESA_EMAIL}  ·  WhatsApp ${EMPRESA_WHATSAPP}`;

/* ───────── Empresa principal y filiales ───────── */

export interface IdentidadEmpresa {
  /** Clave de empresa (MITS, CANTERA, MTO, etc.). */
  clave: string;
  /** Razón social, como va en el membrete y en el texto de los documentos. */
  nombre: string;
  rif: string;
  domicilio: string;
  /** Ciudad de expedición por defecto de constancias y cartas. */
  ciudad: string;
  email: string;
  whatsapp: string;
  contacto: string;
  /** Logo horizontal de los PDF (archivo en `public/`). */
  logoPdf: string;
  /** Logo para pantalla y Excel (archivo en `public/` o URL completa). */
  logoPantalla: string;
  /** Ícono del switch de nómina. */
  icono: string;
  activa: boolean;
  orden: number;
  /** ¿Tiene logo propio? */
  logoPropio: boolean;
  /** Moneda de los recibos de pago: 'USD' (recibos como siempre) o 'BRL' (en $ y en Real brasileño, con la tasa). */
  monedaPago: MonedaPagoEmpresa;
}

/** Monedas de pago que una empresa puede manejar en sus recibos. */
export type MonedaPagoEmpresa = 'USD' | 'BRL';

/** Lo que viene de la base → una moneda válida (cualquier otra cosa es dólares). */
export const monedaPagoValida = (v: unknown): MonedaPagoEmpresa => (v === 'BRL' ? 'BRL' : 'USD');

export const IDENTIDAD_CANTERA: IdentidadEmpresa = {
  clave: 'MITS',
  nombre: 'MINERIA INTERNACIONAL TS, C.A.',
  rif: EMPRESA_RIF,
  domicilio: EMPRESA_DOMICILIO,
  ciudad: 'Puerto Ordaz, Estado Bolívar',
  email: EMPRESA_EMAIL,
  whatsapp: EMPRESA_WHATSAPP,
  contacto: EMPRESA_CONTACTO,
  logoPdf: 'LOGO.jpg',
  logoPantalla: 'LOGO.jpg',
  icono: '⛏️',
  activa: true,
  orden: 1,
  logoPropio: true,
  monedaPago: 'USD',
};

export const IDENTIDAD_GT: IdentidadEmpresa = IDENTIDAD_CANTERA;

/** Datos del RIF de MTO (SENIAT, actualizado el 20/08/2026). El contacto es el del grupo. */
export const IDENTIDAD_MTO: IdentidadEmpresa = {
  clave: 'MTO',
  nombre: 'MINERÍA TIN OXIDE, C.A.',
  rif: 'J-50319019-1',
  domicilio: 'Calle Urdaneta, Local Nro S/N, Sector Maturín, Upata, Bolívar, Zona Postal 8052',
  ciudad: 'Upata, Estado Bolívar',
  email: EMPRESA_EMAIL,
  whatsapp: EMPRESA_WHATSAPP,
  contacto: EMPRESA_CONTACTO,
  logoPdf: 'Logo MTO.png',
  logoPantalla: 'Logo MTO.png',
  icono: '🔧',
  activa: true,
  orden: 2,
  logoPropio: true,
  monedaPago: 'USD',
};

/* ───────── Empresas creadas en RRHH (14/10/2026) ─────────
   RRHH puede tener las empresas que haga falta (tabla `rrhh_empresas`). Se
   cargan una vez al entrar al sistema (`cargarEmpresasRrhh`) y quedan aquí en
   memoria, así `identidadEmpresa` sigue siendo síncrona para los PDF. GT y MTO
   conservan sus logos de `public/` salvo que se les suba otro. */

/** Fila de `rrhh_empresas` con la URL pública del logo ya resuelta. */
export interface FilaEmpresaRrhh {
  clave: string;
  nombre: string;
  rif: string | null;
  domicilio: string | null;
  ciudad: string | null;
  email: string | null;
  whatsapp: string | null;
  logo_path: string | null;
  logo_url?: string | null;
  icono: string | null;
  activa: boolean;
  orden: number;
  /** 'USD' o 'BRL'. Falta = USD. */
  moneda_pago?: string | null;
}

const BASE: Record<string, IdentidadEmpresa> = {
  MITS: IDENTIDAD_CANTERA,
  CANTERA: IDENTIDAD_CANTERA,
  GT: IDENTIDAD_CANTERA,
  MTO: IDENTIDAD_MTO,
};
let registro = new Map<string, IdentidadEmpresa>();
let version = 0;
const oyentes = new Set<() => void>();

/** Fila de la base → identidad para los documentos. */
export function identidadDeFila(f: FilaEmpresaRrhh): IdentidadEmpresa {
  const base = BASE[f.clave];
  const email = f.email?.trim() || EMPRESA_EMAIL;
  const whatsapp = f.whatsapp?.trim() || EMPRESA_WHATSAPP;
  const logo = f.logo_url || null;
  return {
    clave: f.clave,
    nombre: f.nombre,
    rif: f.rif?.trim() || base?.rif || '',
    domicilio: f.domicilio?.trim() || base?.domicilio || '',
    ciudad: f.ciudad?.trim() || base?.ciudad || 'Puerto Ordaz, Estado Bolívar',
    email,
    whatsapp,
    contacto: `${email}  ·  WhatsApp ${whatsapp}`,
    logoPdf: logo ?? base?.logoPdf ?? IDENTIDAD_CANTERA.logoPdf,
    logoPantalla: logo ?? base?.logoPantalla ?? IDENTIDAD_CANTERA.logoPantalla,
    icono: f.icono || base?.icono || '⛏️',
    activa: f.activa,
    orden: f.orden,
    logoPropio: !!logo || !!base,
    monedaPago: monedaPagoValida(f.moneda_pago),
  };
}

/** Guarda en memoria las empresas leídas de la base y avisa a las pantallas. */
export function registrarEmpresas(filas: FilaEmpresaRrhh[]): void {
  registro = new Map(filas.map((f) => [f.clave, identidadDeFila(f)]));
  version++;
  oyentes.forEach((o) => o());
}

export function suscribirEmpresas(cb: () => void): () => void {
  oyentes.add(cb);
  return () => { oyentes.delete(cb); };
}
export const versionEmpresas = () => version;

/** Todas las empresas (activas e inactivas), por orden. */
export function empresasRrhh(): IdentidadEmpresa[] {
  const lista = registro.size ? [...registro.values()] : [IDENTIDAD_CANTERA, IDENTIDAD_MTO];
  return lista.sort((a, b) => a.orden - b.orden || a.clave.localeCompare(b.clave));
}

/** Identidad de la empresa de una nómina. Sin dato o desconocida → MITS (Minería Internacional TS). */
export function identidadEmpresa(empresa?: string | null): IdentidadEmpresa {
  if (empresa && registro.has(empresa)) return registro.get(empresa)!;
  return (empresa && BASE[empresa]) || IDENTIDAD_CANTERA;
}

/** Razón social para el texto corrido de cartas y carnets («Minería Internacional TS, C.A.»). */
export function razonSocialTexto(emp: Pick<IdentidadEmpresa, 'clave' | 'nombre'>): string {
  if (emp.clave === 'MTO') return 'Minería Tin Oxide, C.A.';
  if (emp.clave === 'GT' || emp.clave === 'MITS' || emp.clave === 'CANTERA') return 'Minería Internacional TS, C.A.';
  return emp.nombre;
}

/** Ciudad sin el estado: «Puerto Ordaz», «Upata». */
export const ciudadCorta = (emp: Pick<IdentidadEmpresa, 'ciudad'>) => emp.ciudad.split(',')[0].trim();

/** Archivo de `public/` o URL completa (logo subido) → URL para <img> o fetch. */
export const urlArchivoPublico = (archivo: string) =>
  (/^https?:\/\//.test(archivo) ? archivo : `${import.meta.env.BASE_URL}${encodeURIComponent(archivo)}`);

/** «Nómina MITS», «Nómina MTO», «Nómina XYZ». */
export const etiquetaNomina = (empresa?: string | null) => `Nómina ${empresa || 'MITS'}`;

/** ¿El texto es una clave de empresa válida? (2 a 8 letras mayúsculas o números) */
export const claveEmpresaValida = (c: string) => /^[A-Z0-9]{2,8}$/.test(c);
