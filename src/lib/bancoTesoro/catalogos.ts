/**
 * Catálogos oficiales del Banco del Tesoro (0163) extraídos de
 * `1-FORMATO_CARGA_MASIVA-MONEDA_NACIONAL.xls` y motor de resolución
 * geográfica + agencia bancaria más cercana a la dirección.
 */

export interface OpcionCatalogoBt {
  codigo: string
  nombre: string
}

export const CODIGO_BANCO_TESORO = '0163'
export const CODIGO_INDUSTRIA_NOMINA_BT = '0902' // CUENTAS NOMINAS O PERSONAL

export const TIPOS_DOCUMENTO_BT: OpcionCatalogoBt[] = [
  { codigo: 'V', nombre: 'Venezolano' },
  { codigo: 'E', nombre: 'Extranjero' },
  { codigo: 'P', nombre: 'Pasaporte' },
]

export const ESTADOS_CIVILES_BT: OpcionCatalogoBt[] = [
  { codigo: '1', nombre: 'Soltero(a)' },
  { codigo: '2', nombre: 'Casado(a)' },
  { codigo: '3', nombre: 'Divorciado(a)' },
  { codigo: '4', nombre: 'Viudo(a)' },
  { codigo: '5', nombre: 'Concubino(a)' },
]

export const REGIONES_BT: OpcionCatalogoBt[] = [
  { codigo: '01', nombre: 'Región Capital' },
  { codigo: '02', nombre: 'Región Central' },
  { codigo: '03', nombre: 'Región Los Llanos' },
  { codigo: '04', nombre: 'Región Centro Occidental' },
  { codigo: '05', nombre: 'Región Zuliana' },
  { codigo: '06', nombre: 'Región Los Andes' },
  { codigo: '07', nombre: 'Región Nor-Oriental' },
  { codigo: '08', nombre: 'Región Insular' },
  { codigo: '09', nombre: 'Región Guayana' },
]

export const ESTADOS_BT: Array<OpcionCatalogoBt & { region: string }> = [
  { codigo: '01', nombre: 'Distrito Capital', region: '01' },
  { codigo: '02', nombre: 'Amazonas', region: '09' },
  { codigo: '03', nombre: 'Anzoátegui', region: '07' },
  { codigo: '04', nombre: 'Apure', region: '03' },
  { codigo: '05', nombre: 'Aragua', region: '02' },
  { codigo: '06', nombre: 'Barinas', region: '06' },
  { codigo: '07', nombre: 'Bolívar', region: '09' },
  { codigo: '08', nombre: 'Carabobo', region: '02' },
  { codigo: '09', nombre: 'Cojedes', region: '02' },
  { codigo: '10', nombre: 'Delta Amacuro', region: '09' },
  { codigo: '11', nombre: 'Falcón', region: '04' },
  { codigo: '12', nombre: 'Guárico', region: '03' },
  { codigo: '13', nombre: 'Lara', region: '04' },
  { codigo: '14', nombre: 'Mérida', region: '06' },
  { codigo: '15', nombre: 'Miranda', region: '01' },
  { codigo: '16', nombre: 'Monagas', region: '07' },
  { codigo: '17', nombre: 'Nueva Esparta', region: '08' },
  { codigo: '18', nombre: 'Portuguesa', region: '04' },
  { codigo: '19', nombre: 'Sucre', region: '07' },
  { codigo: '20', nombre: 'Táchira', region: '06' },
  { codigo: '21', nombre: 'Trujillo', region: '06' },
  { codigo: '22', nombre: 'Yaracuy', region: '04' },
  { codigo: '23', nombre: 'Zulia', region: '05' },
  { codigo: '24', nombre: 'La Guaira (Vargas)', region: '01' },
]

export const CIUDADES_BT: Array<OpcionCatalogoBt & { estado: string }> = [
  { codigo: '2401', nombre: 'La Guaira', estado: '24' },
  { codigo: '2402', nombre: 'Catia La Mar', estado: '24' },
  { codigo: '0101', nombre: 'Caracas (Libertador)', estado: '01' },
  { codigo: '1501', nombre: 'Los Teques', estado: '15' },
  { codigo: '1502', nombre: 'San Antonio de los Altos', estado: '15' },
  { codigo: '1503', nombre: 'Charallave', estado: '15' },
  { codigo: '1504', nombre: 'Guarenas', estado: '15' },
  { codigo: '1505', nombre: 'Caracas (Miranda)', estado: '15' },
  { codigo: '1506', nombre: 'Santa Teresa del Tuy', estado: '15' },
  { codigo: '1507', nombre: 'Ocumare del Tuy', estado: '15' },
  { codigo: '1508', nombre: 'Guatire', estado: '15' },
  { codigo: '0501', nombre: 'Maracay', estado: '05' },
  { codigo: '0801', nombre: 'Valencia', estado: '08' },
  { codigo: '1301', nombre: 'Barquisimeto', estado: '13' },
  { codigo: '0301', nombre: 'Barcelona', estado: '03' },
  { codigo: '0304', nombre: 'Lecherías', estado: '03' },
  { codigo: '0702', nombre: 'Puerto Ordaz', estado: '07' },
  { codigo: '1601', nombre: 'Maturín', estado: '16' },
  { codigo: '1701', nombre: 'Porlamar', estado: '17' },
  { codigo: '1901', nombre: 'Cumaná', estado: '19' },
  { codigo: '2001', nombre: 'San Cristóbal', estado: '20' },
  { codigo: '2301', nombre: 'Maracaibo', estado: '23' },
]

export const SECTORES_MUNICIPIOS_BT: Array<
  OpcionCatalogoBt & { estado: string; zonaPostal: string }
> = [
  { codigo: '24014', nombre: 'Naiguatá', estado: '24', zonaPostal: '1160' },
  { codigo: '24001', nombre: 'Anare', estado: '24', zonaPostal: '1160' },
  { codigo: '24002', nombre: 'Camurí Grande', estado: '24', zonaPostal: '1160' },
  { codigo: '24003', nombre: 'Caraballeda', estado: '24', zonaPostal: '1165' },
  { codigo: '24004', nombre: 'Carayaca', estado: '24', zonaPostal: '1168' },
  { codigo: '24005', nombre: 'Catia La Mar', estado: '24', zonaPostal: '1162' },
  { codigo: '24006', nombre: 'El Junquito (Vargas)', estado: '24', zonaPostal: '1030' },
  { codigo: '24007', nombre: 'La Guaira', estado: '24', zonaPostal: '1160' },
  { codigo: '24008', nombre: 'La Sabana', estado: '24', zonaPostal: '1166' },
  { codigo: '24009', nombre: 'Las Salinas', estado: '24', zonaPostal: '1162' },
  { codigo: '24010', nombre: 'Los Caracas', estado: '24', zonaPostal: '1166' },
  { codigo: '24011', nombre: 'Macuto', estado: '24', zonaPostal: '1160' },
  { codigo: '24012', nombre: 'Maiquetía', estado: '24', zonaPostal: '1160' },
  { codigo: '24013', nombre: 'Marapa', estado: '24', zonaPostal: '1162' },
  { codigo: '24015', nombre: 'Oricao', estado: '24', zonaPostal: '1162' },
  { codigo: '24016', nombre: 'Puerto Carayaca', estado: '24', zonaPostal: '1162' },
  { codigo: '24017', nombre: 'Urbanización Caribe', estado: '24', zonaPostal: '1030' },
  { codigo: '24018', nombre: 'Urbanización El Junko', estado: '24', zonaPostal: '1030' },
  { codigo: '00806', nombre: 'Caracas Centro / Libertador', estado: '01', zonaPostal: '1010' },
  { codigo: '01001', nombre: 'Antímano / Oeste Caracas', estado: '01', zonaPostal: '1000' },
  { codigo: '15001', nombre: 'Miranda / Área Metropolitana', estado: '15', zonaPostal: '1073' },
]

export const PARROQUIAS_BT: Array<OpcionCatalogoBt & { estado: string }> = [
  { codigo: '240109', nombre: 'Naiguatá', estado: '24' },
  { codigo: '240101', nombre: 'Caraballeda', estado: '24' },
  { codigo: '240102', nombre: 'Carayaca', estado: '24' },
  { codigo: '240103', nombre: 'Caruao', estado: '24' },
  { codigo: '240104', nombre: 'Catia La Mar', estado: '24' },
  { codigo: '240105', nombre: 'El Junko', estado: '24' },
  { codigo: '240106', nombre: 'La Guaira', estado: '24' },
  { codigo: '240107', nombre: 'Macuto', estado: '24' },
  { codigo: '240108', nombre: 'Maiquetía', estado: '24' },
  { codigo: '240110', nombre: 'Urimare / Raúl Leoni (Catia La Mar)', estado: '24' },
  { codigo: '240111', nombre: 'Carlos Soublette (Maiquetía)', estado: '24' },
  { codigo: '010101', nombre: 'Altagracia (Caracas)', estado: '01' },
  { codigo: '010102', nombre: 'Antímano (Caracas)', estado: '01' },
  { codigo: '010103', nombre: 'La Candelaria (Caracas)', estado: '01' },
  { codigo: '010104', nombre: 'Caricuao (Caracas)', estado: '01' },
  { codigo: '010105', nombre: 'Catedral (Caracas)', estado: '01' },
  { codigo: '010106', nombre: 'Coche (Caracas)', estado: '01' },
  { codigo: '010107', nombre: 'El Junquito (Caracas)', estado: '01' },
  { codigo: '010108', nombre: 'El Paraíso (Caracas)', estado: '01' },
  { codigo: '010109', nombre: 'El Recreo (Caracas)', estado: '01' },
  { codigo: '010110', nombre: 'El Valle (Caracas)', estado: '01' },
  { codigo: '010111', nombre: 'La Pastora (Caracas)', estado: '01' },
  { codigo: '010112', nombre: 'La Vega (Caracas)', estado: '01' },
  { codigo: '010113', nombre: 'Macarao (Caracas)', estado: '01' },
  { codigo: '010114', nombre: 'San Agustín (Caracas)', estado: '01' },
  { codigo: '010115', nombre: 'San Bernardino (Caracas)', estado: '01' },
  { codigo: '010116', nombre: 'San José (Caracas)', estado: '01' },
  { codigo: '010117', nombre: 'San Juan (Caracas)', estado: '01' },
  { codigo: '010118', nombre: 'San Pedro (Caracas)', estado: '01' },
  { codigo: '010119', nombre: 'Santa Rosalía (Caracas)', estado: '01' },
  { codigo: '010120', nombre: 'Santa Teresa (Caracas)', estado: '01' },
  { codigo: '010121', nombre: 'Sucre / Catia (Caracas)', estado: '01' },
  { codigo: '010122', nombre: '23 de Enero (Caracas)', estado: '01' },
  { codigo: '151901', nombre: 'Petare (Miranda)', estado: '15' },
  { codigo: '151401', nombre: 'Guarenas (Miranda)', estado: '15' },
  { codigo: '152101', nombre: 'Guatire (Miranda)', estado: '15' },
  { codigo: '150901', nombre: 'Los Teques (Miranda)', estado: '15' },
  { codigo: '150701', nombre: 'Charallave (Miranda)', estado: '15' },
]

export const CONDICIONES_INMUEBLE_BT: OpcionCatalogoBt[] = [
  { codigo: '1', nombre: 'Propia' },
  { codigo: '2', nombre: 'Alquilada' },
  { codigo: '3', nombre: 'De un familiar' },
]

export const TIPOS_VIVIENDA_BT: OpcionCatalogoBt[] = [
  { codigo: '1', nombre: 'Casa' },
  { codigo: '2', nombre: 'Quinta' },
  { codigo: '3', nombre: 'Apartamento' },
]

export const NIVELES_EDUCACION_BT: OpcionCatalogoBt[] = [
  { codigo: '01', nombre: 'Primaria' },
  { codigo: '02', nombre: 'Bachillerato' },
  { codigo: '03', nombre: 'Técnico Medio' },
  { codigo: '04', nombre: 'Técnico Superior (T.S.U.)' },
  { codigo: '05', nombre: 'Universitario' },
  { codigo: '06', nombre: 'Post Grado' },
  { codigo: '07', nombre: 'Doctorado' },
]

export const FUENTES_INGRESO_BT: OpcionCatalogoBt[] = [
  { codigo: '1', nombre: 'Sueldo' },
  { codigo: '2', nombre: 'Salario' },
  { codigo: '3', nombre: 'Jubilación' },
  { codigo: '4', nombre: 'Independiente' },
]

export const TIPOS_CONTRATO_BT: OpcionCatalogoBt[] = [
  { codigo: '1', nombre: 'Fijo' },
  { codigo: '2', nombre: 'Indefinido' },
]

export const TIPOS_NOMINA_BT: OpcionCatalogoBt[] = [
  { codigo: 'W', nombre: 'Semanal' },
  { codigo: 'B', nombre: 'Quincenal' },
  { codigo: 'M', nombre: 'Mensual' },
  { codigo: 'S', nombre: 'Semestral' },
  { codigo: 'Y', nombre: 'Anual' },
]

export const TIPOS_CUENTA_NOMINA_BT: OpcionCatalogoBt[] = [
  { codigo: 'VI01', nombre: 'Cuenta Nómina (VI01)' },
  { codigo: 'CCVI', nombre: 'Cuenta Corriente Virtual (CCVI)' },
]

export const TIPOS_SOLICITUD_BT: OpcionCatalogoBt[] = [
  { codigo: 'I', nombre: 'Ingreso nuevo (Apertura de cuenta)' },
  { codigo: 'M', nombre: 'Cambios / Actualización de datos' },
  { codigo: 'D', nombre: 'Desincorporar' },
]

/** Catálogo completo de las 66 oficinas oficiales del Banco del Tesoro (0163). */
export const AGENCIAS_BT: OpcionCatalogoBt[] = [
  { codigo: '0601', nombre: 'Puerto La Guaira' },
  { codigo: '0602', nombre: 'Taq. Aeropuerto (Maiquetía)' },
  { codigo: '0219', nombre: 'Catia La Mar' },
  { codigo: '0202', nombre: 'CCCT' },
  { codigo: '0203', nombre: 'Chacaíto' },
  { codigo: '0204', nombre: 'Santa Teresa' },
  { codigo: '0205', nombre: 'Macaracuay' },
  { codigo: '0206', nombre: 'La Castellana' },
  { codigo: '0208', nombre: 'Charallave Norte' },
  { codigo: '0209', nombre: 'Charallave Sur' },
  { codigo: '0210', nombre: 'Cúa' },
  { codigo: '0211', nombre: 'La Rinconada' },
  { codigo: '0212', nombre: 'Taquilla Francisco Solano' },
  { codigo: '0213', nombre: 'Santa Paula' },
  { codigo: '0214', nombre: 'Paraíso Plaza' },
  { codigo: '0215', nombre: 'Victoria Plaza' },
  { codigo: '0216', nombre: 'MINEP' },
  { codigo: '0217', nombre: 'San Diego' },
  { codigo: '0218', nombre: 'Valle de la Pascua' },
  { codigo: '0220', nombre: 'Propatria' },
  { codigo: '0221', nombre: 'La California' },
  { codigo: '0222', nombre: 'Coche Aragua' },
  { codigo: '0223', nombre: 'Guacara' },
  { codigo: '0224', nombre: 'Metro Valencia' },
  { codigo: '0225', nombre: 'Cotiza' },
  { codigo: '0226', nombre: 'Maracay Centro' },
  { codigo: '0227', nombre: 'El Tambor (Los Teques)' },
  { codigo: '0228', nombre: 'San Fernando' },
  { codigo: '0229', nombre: 'VTV' },
  { codigo: '0230', nombre: 'Vicepresidencia' },
  { codigo: '0231', nombre: 'Comandancia General' },
  { codigo: '0232', nombre: 'KPMG' },
  { codigo: '0234', nombre: 'Los Próceres' },
  { codigo: '0235', nombre: 'IND' },
  { codigo: '0237', nombre: 'KPMG Especiales' },
  { codigo: '0238', nombre: 'Academia Militar' },
  { codigo: '0239', nombre: 'Acarigua' },
  { codigo: '0241', nombre: 'Taquilla Chuao' },
  { codigo: '0242', nombre: 'Guatire Center' },
  { codigo: '0244', nombre: 'Taquilla Urdaneta' },
  { codigo: '0245', nombre: 'Tinaquillo' },
  { codigo: '0247', nombre: 'Taquilla Maracay' },
  { codigo: '0605', nombre: 'Plaza Morelos' },
  { codigo: '0606', nombre: 'Gamma' },
  { codigo: '0913', nombre: 'El Rosal' },
  { codigo: '0002', nombre: 'Maracaibo' },
  { codigo: '0301', nombre: 'Barquisimeto' },
  { codigo: '0303', nombre: 'Maracaibo Kirinet' },
  { codigo: '0304', nombre: 'Barrio Obrero (San Cristóbal)' },
  { codigo: '0305', nombre: 'Mérida' },
  { codigo: '0306', nombre: 'Coro' },
  { codigo: '0307', nombre: 'CRP' },
  { codigo: '0308', nombre: 'Valera' },
  { codigo: '0309', nombre: 'Barinas' },
  { codigo: '0310', nombre: 'Punto Fijo' },
  { codigo: '0311', nombre: 'San Cristóbal Especiales' },
  { codigo: '0312', nombre: 'Paraguachón' },
  { codigo: '0401', nombre: 'Porlamar' },
  { codigo: '0402', nombre: 'Maturín' },
  { codigo: '0403', nombre: 'Cumaná' },
  { codigo: '0404', nombre: 'Lecherías' },
  { codigo: '0405', nombre: 'Puerto Ordaz' },
  { codigo: '0406', nombre: 'El Yaque' },
  { codigo: '0407', nombre: 'Guamache' },
  { codigo: '0408', nombre: 'Maturín Contribuyentes Especiales' },
  { codigo: '0410', nombre: 'Santa Elena de Uairén' },
]

export const PROFESIONES_BT: OpcionCatalogoBt[] = [
  { codigo: 'OBRE', nombre: 'Obrero' },
  { codigo: 'CHOF', nombre: 'Chofer' },
  { codigo: 'MECA', nombre: 'Mecánico' },
  { codigo: 'SERV', nombre: 'Servicios de Mantenimiento' },
  { codigo: 'SUPE', nombre: 'Supervisor' },
  { codigo: 'VIGI', nombre: 'Vigilante' },
  { codigo: 'CHEF', nombre: 'Chef / Cocinero(a)' },
  { codigo: 'HERR', nombre: 'Herrero / Soldador' },
  { codigo: 'ELEC', nombre: 'Electrónica / Electricidad' },
  { codigo: 'TMEL', nombre: 'TSU Técnico Electricista' },
  { codigo: 'TMEC', nombre: 'TSU Mecánica' },
  { codigo: 'TMIN', nombre: 'TSU Mantenimiento Industrial' },
  { codigo: 'ANAL', nombre: 'Analista' },
  { codigo: 'ASIS', nombre: 'Asistente' },
  { codigo: 'COOR', nombre: 'Coordinador' },
  { codigo: 'LADM', nombre: 'Administración' },
  { codigo: 'LAEM', nombre: 'Administración de Empresas' },
  { codigo: 'LARH', nombre: 'Administración de Recursos Humanos' },
  { codigo: 'LCPU', nombre: 'Contaduría Pública' },
  { codigo: 'LINF', nombre: 'Informática / Sistemas' },
  { codigo: 'LSIS', nombre: 'Sistemas' },
  { codigo: 'TINF', nombre: 'TSU Informática' },
  { codigo: 'INGE', nombre: 'Ingeniero' },
  { codigo: 'INCI', nombre: 'Ingeniero Civil' },
  { codigo: 'INID', nombre: 'Ingeniero Industrial' },
  { codigo: 'INME', nombre: 'Ingeniero Mecánico' },
  { codigo: 'INEL', nombre: 'Ingeniero Eléctrico' },
  { codigo: 'INSI', nombre: 'Ingeniero de Sistemas' },
  { codigo: 'GEOL', nombre: 'Geólogo' },
  { codigo: 'TOPO', nombre: 'Topógrafo' },
  { codigo: 'COMP', nombre: 'Comprador' },
  { codigo: 'VEND', nombre: 'Vendedor(a)' },
  { codigo: 'SECR', nombre: 'Secretaria' },
  { codigo: 'RECE', nombre: 'Recepcionista' },
  { codigo: 'CONS', nombre: 'Conserje' },
  { codigo: 'MENS', nombre: 'Mensajero' },
  { codigo: 'ABOG', nombre: 'Abogado' },
  { codigo: 'SINE', nombre: 'Sin Estudios' },
  { codigo: 'OTRO', nombre: 'Otros' },
]

export const TIPOS_CARGO_BT: OpcionCatalogoBt[] = [
  { codigo: '011', nombre: 'Obrero' },
  { codigo: '017', nombre: 'Operador' },
  { codigo: '021', nombre: 'Chofer' },
  { codigo: '005', nombre: 'Supervisor' },
  { codigo: '023', nombre: 'Vigilante' },
  { codigo: '016', nombre: 'Técnico' },
  { codigo: '020', nombre: 'Auxiliar' },
  { codigo: '013', nombre: 'Asistente' },
  { codigo: '007', nombre: 'Analista' },
  { codigo: '006', nombre: 'Coordinador(a)' },
  { codigo: '009', nombre: 'Encargado(a)' },
  { codigo: '015', nombre: 'Jefe de Área' },
  { codigo: '041', nombre: 'Administrador' },
  { codigo: '003', nombre: 'Gerente' },
  { codigo: '004', nombre: 'Subgerente' },
  { codigo: '075', nombre: 'Gerente General' },
  { codigo: '002', nombre: 'Director' },
  { codigo: '001', nombre: 'Presidente' },
  { codigo: '029', nombre: 'Vicepresidente' },
  { codigo: '077', nombre: 'Adjunto' },
  { codigo: '031', nombre: 'Ingeniero' },
  { codigo: '068', nombre: 'Geólogo' },
  { codigo: '012', nombre: 'Especialista' },
  { codigo: '028', nombre: 'Programador' },
  { codigo: '074', nombre: 'Comprador' },
  { codigo: '010', nombre: 'Vendedor(a)' },
  { codigo: '018', nombre: 'Cajero(a)' },
  { codigo: '030', nombre: 'Oficinista' },
  { codigo: '008', nombre: 'Secretaria' },
  { codigo: '024', nombre: 'Recepcionista' },
  { codigo: '046', nombre: 'Chef / Cocina' },
  { codigo: '022', nombre: 'Conserje' },
  { codigo: '032', nombre: 'Abogado' },
  { codigo: '027', nombre: 'Auditor' },
  { codigo: '045', nombre: 'Consultor' },
  { codigo: '078', nombre: 'Otros' },
]

export interface UbicacionYAgenciaResuelta {
  region: string
  estado: string
  ciudad: string
  municipio: string
  parroquia: string
  zonaPostal: string
  agencia: string
  agenciaNombre: string
  origenAgencia: 'ficha' | 'direccion' | 'empresa'
}

function sinAcentos(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
}

export function nombreAgenciaBt(codigo: string): string {
  const c = codigo.trim().padStart(4, '0')
  return AGENCIAS_BT.find((a) => a.codigo === c)?.nombre ?? `Agencia ${c}`
}

/**
 * Determina la ubicación geográfica codificada y la agencia del Banco del Tesoro
 * MÁS CERCANA a la dirección del trabajador (o, si está vacía, a la dirección de la
 * empresa / Cantera de Naiguatá).
 */
export function resolverUbicacionYAgenciaPorDireccion(params: {
  direccionTrabajador?: string | null
  calleTrabajador?: string | null
  referenciaTrabajador?: string | null
  domicilioEmpresa?: string | null
  agenciaManual?: string | null
  regionManual?: string | null
  estadoManual?: string | null
  ciudadManual?: string | null
  municipioManual?: string | null
  parroquiaManual?: string | null
  zonaPostalManual?: string | null
}): UbicacionYAgenciaResuelta {
  const textoTrabajador = sinAcentos(
    [params.direccionTrabajador, params.calleTrabajador, params.referenciaTrabajador]
      .filter(Boolean)
      .join(' '),
  ).trim()

  const textoBase = textoTrabajador || sinAcentos(params.domicilioEmpresa || 'NAIGUATA LA GUAIRA')
  const vinoDeTrabajador = textoTrabajador.length > 0

  // Base por defecto: Cantera de Naiguatá, Edo. La Guaira (Vargas) -> Puerto La Guaira (0601)
  let region = '01'
  let estado = '24'
  let ciudad = '2401'
  let municipio = '24014'
  let parroquia = '240109'
  let zonaPostal = '1160'
  let agencia = '0601' // PUERTO LA GUAIRA

  // ── 1. Eje Oeste de La Guaira (Catia La Mar / Urimare / Carayaca) -> 0219 CATIA LA MAR
  if (/\b(CARAYACA|PUERTO CARAYACA|ORICAO)\b/.test(textoBase)) {
    ciudad = '2402'
    municipio = '24004'
    parroquia = '240102'
    zonaPostal = '1168'
    agencia = '0219'
  } else if (/\b(URIMARE|RAUL LEONI|PLAYA GRANDE|MARAPA|LAS SALINAS)\b/.test(textoBase)) {
    ciudad = '2402'
    municipio = '24013'
    parroquia = '240110'
    zonaPostal = '1162'
    agencia = '0219'
  } else if (/\b(CATIA LA MAR|LAS TUNITAS|MAMO|ZAMORA|VISTA AL MAR|ATLANTIDA)\b/.test(textoBase)) {
    ciudad = '2402'
    municipio = '24005'
    parroquia = '240104'
    zonaPostal = '1162'
    agencia = '0219'
  }
  // ── 2. Eje Maiquetía / Aeropuerto / Soublette -> 0602 TAQ.AEROPUERTO
  else if (/\b(SOUBLETTE|10 DE MARZO|DIEZ DE MARZO|PARIATA|MONTESANO)\b/.test(textoBase)) {
    ciudad = '2401'
    municipio = '24012'
    parroquia = '240111'
    zonaPostal = '1160'
    agencia = '0602'
  } else if (/\b(MAIQUETIA|AEROPUERTO|QUENEPE|EL RINCON)\b/.test(textoBase)) {
    ciudad = '2401'
    municipio = '24012'
    parroquia = '240108'
    zonaPostal = '1160'
    agencia = '0602'
  }
  // ── 3. Eje Este y Centro de La Guaira -> 0601 PUERTO LA GUAIRA
  else if (/\b(CARUAO|LA SABANA|CHUSPA|OSMA|ORITAPO|TODASANA)\b/.test(textoBase)) {
    ciudad = '2401'
    municipio = '24008'
    parroquia = '240103'
    zonaPostal = '1166'
    agencia = '0601'
  } else if (/\b(ANARE)\b/.test(textoBase)) {
    ciudad = '2401'
    municipio = '24001'
    parroquia = '240109'
    zonaPostal = '1160'
    agencia = '0601'
  } else if (/\b(CAMURI GRANDE|LOS CARACAS)\b/.test(textoBase)) {
    ciudad = '2401'
    municipio = '24002'
    parroquia = '240109'
    zonaPostal = '1160'
    agencia = '0601'
  } else if (/\b(CARABALLEDA|TANAGUARENA|PALMAR ESTE|CARIBE|CORALES|CAMURI CHICO)\b/.test(textoBase)) {
    ciudad = '2401'
    municipio = '24003'
    parroquia = '240101'
    zonaPostal = '1165'
    agencia = '0601'
  } else if (/\b(MACUTO|GUAICAMACUTO|ALAMO|LAS QUINCE LETRAS)\b/.test(textoBase)) {
    ciudad = '2401'
    municipio = '24011'
    parroquia = '240107'
    zonaPostal = '1160'
    agencia = '0601'
  } else if (/\b(NAIGUATA|PUEBLO ARRIBA|PUEBLO ABAJO|TUPURQUEN|CARE)\b/.test(textoBase)) {
    ciudad = '2401'
    municipio = '24014'
    parroquia = '240109'
    zonaPostal = '1160'
    agencia = '0601'
  } else if (/\b(LA GUAIRA|PUNTA DE MULATOS|GUANAPE|CARIACO|VARGAS)\b/.test(textoBase)) {
    ciudad = '2401'
    municipio = '24007'
    parroquia = '240106'
    zonaPostal = '1160'
    agencia = '0601'
  } else if (/\b(EL JUNKO|EL JUNQUITO)\b/.test(textoBase)) {
    ciudad = '2401'
    municipio = '24006'
    parroquia = '240105'
    zonaPostal = '1030'
    agencia = '0220'
  }
  // ── 4. Miranda (Guarenas-Guatire, Petare, Altos Mirandinos, Valles del Tuy)
  else if (/\b(GUARENAS|GUATIRE|ARAIRA|HIGUEROTE|CAUCAGUA|RIO CHICO|BARLOVENTO)\b/.test(textoBase)) {
    region = '01'
    estado = '15'
    ciudad = /\bGUARENAS\b/.test(textoBase) ? '1504' : '1508'
    municipio = '15001'
    parroquia = /\bGUARENAS\b/.test(textoBase) ? '151401' : '152101'
    zonaPostal = '1220'
    agencia = '0242' // GUATIRE CENTER
  } else if (/\b(PETARE|LA CALIFORNIA|PALO VERDE|BOLEITA|EL MARQUES|MACARACUAY|LA URBINA)\b/.test(textoBase)) {
    region = '01'
    estado = '15'
    ciudad = '1505'
    municipio = '15001'
    parroquia = '151901'
    zonaPostal = '1073'
    agencia = /\bMACARACUAY\b/.test(textoBase) ? '0205' : '0221' // LA CALIFORNIA / MACARACUAY
  } else if (/\b(CHACAO|ALTAMIRA|LA CASTELLANA|LOS PALOS GRANDES|CHACAITO|EL ROSAL|CHUAO|SANTA PAULA)\b/.test(textoBase)) {
    region = '01'
    estado = '15'
    ciudad = '1505'
    municipio = '15001'
    parroquia = '151901'
    zonaPostal = '1060'
    agencia = /\bCHACAITO\b/.test(textoBase)
      ? '0203'
      : /\bEL ROSAL\b/.test(textoBase)
        ? '0913'
        : /\bSANTA PAULA\b/.test(textoBase)
          ? '0213'
          : '0206'
  } else if (/\b(LOS TEQUES|SAN ANTONIO DE LOS ALTOS|CARRIZAL|EL TAMBOR)\b/.test(textoBase)) {
    region = '01'
    estado = '15'
    ciudad = '1501'
    municipio = '15001'
    parroquia = '150901'
    zonaPostal = '1201'
    agencia = '0227' // EL TAMBOR
  } else if (/\b(CUA)\b/.test(textoBase)) {
    region = '01'
    estado = '15'
    ciudad = '1503'
    municipio = '15001'
    parroquia = '150701'
    zonaPostal = '1211'
    agencia = '0210' // CUA
  } else if (/\b(CHARALLAVE|OCUMARE DEL TUY|SANTA TERESA DEL TUY|YARE|SANTA LUCIA)\b/.test(textoBase)) {
    region = '01'
    estado = '15'
    ciudad = '1503'
    municipio = '15001'
    parroquia = '150701'
    zonaPostal = '1210'
    agencia = '0208' // CHARALLAVE NORTE
  }
  // ── 5. Distrito Capital (Caracas)
  else if (/\b(PROPATRIA|CATIA|CASALTA|GRAMOVEN|23 DE ENERO|LA PASTORA)\b/.test(textoBase)) {
    region = '01'
    estado = '01'
    ciudad = '0101'
    municipio = '00806'
    parroquia = '010121'
    zonaPostal = '1030'
    agencia = '0220' // PROPATRIA
  } else if (/\b(EL PARAISO|CARICUAO|ANTIMANO|LA VEGA|MACARAO|MONTALBAN|SAN JUAN)\b/.test(textoBase)) {
    region = '01'
    estado = '01'
    ciudad = '0101'
    municipio = '01001'
    parroquia = '010108'
    zonaPostal = '1020'
    agencia = '0214' // PARAISO PLAZA
  } else if (/\b(EL VALLE|COCHE|LOS PROCERES|SANTA MONICA|LOS SIMBOLOS|LA RINCONADA)\b/.test(textoBase)) {
    region = '01'
    estado = '01'
    ciudad = '0101'
    municipio = '00806'
    parroquia = '010110'
    zonaPostal = '1090'
    agencia = /\bRINCONADA\b/.test(textoBase) ? '0211' : '0234' // LOS PROCERES
  } else if (/\b(CARACAS|CANDELARIA|ALTAGRACIA|CATEDRAL|SANTA TERESA|SAN BERNARDINO|SAN AGUSTIN|EL RECREO|SABANA GRANDE|PLAZA VENEZUELA|COTIZA)\b/.test(textoBase)) {
    region = '01'
    estado = '01'
    ciudad = '0101'
    municipio = '00806'
    parroquia = '010103'
    zonaPostal = '1010'
    agencia = /\bSANTA TERESA\b/.test(textoBase) ? '0204' : '0605' // PLAZA MORELOS
  }
  // ── 6. Otros Estados del país
  else if (/\b(MARACAY|CAGUA|TURMERO|LA VICTORIA|ARAGUA)\b/.test(textoBase)) {
    region = '02'
    estado = '05'
    ciudad = '0501'
    municipio = '05001'
    parroquia = '050301'
    zonaPostal = '2101'
    agencia = '0226'
  } else if (/\b(VALENCIA|NAGUANAGUA|SAN DIEGO|GUACARA|PUERTO CABELLO|CARABOBO)\b/.test(textoBase)) {
    region = '02'
    estado = '08'
    ciudad = '0801'
    municipio = '08001'
    parroquia = '081401'
    zonaPostal = '2001'
    agencia = /\bGUACARA\b/.test(textoBase)
      ? '0223'
      : /\bSAN DIEGO\b/.test(textoBase)
        ? '0217'
        : '0224'
  } else if (/\b(BARQUISIMETO|CABUDARE|LARA)\b/.test(textoBase)) {
    region = '04'
    estado = '13'
    ciudad = '1301'
    municipio = '13001'
    parroquia = '130301'
    zonaPostal = '3001'
    agencia = '0301'
  } else if (/\b(MARACAIBO|SAN FRANCISCO|CABIMAS|ZULIA)\b/.test(textoBase)) {
    region = '05'
    estado = '23'
    ciudad = '2301'
    municipio = '23001'
    parroquia = '231301'
    zonaPostal = '4001'
    agencia = '0002'
  } else if (/\b(BARCELONA|PUERTO LA CRUZ|LECHERIA|LECHERIAS|ANACO|EL TIGRE|ANZOATEGUI)\b/.test(textoBase)) {
    region = '07'
    estado = '03'
    ciudad = '0304'
    municipio = '03001'
    parroquia = '032101'
    zonaPostal = '6016'
    agencia = '0404'
  } else if (/\b(PUERTO ORDAZ|SAN FELIX|CIUDAD GUAYANA|CIUDAD BOLIVAR|BOLIVAR)\b/.test(textoBase)) {
    region = '09'
    estado = '07'
    ciudad = '0702'
    municipio = '07001'
    parroquia = '070101'
    zonaPostal = '8050'
    agencia = '0405'
  } else if (/\b(PORLAMAR|PAMPATAR|MARGARITA|NUEVA ESPARTA)\b/.test(textoBase)) {
    region = '08'
    estado = '17'
    ciudad = '1701'
    municipio = '17001'
    parroquia = '170801'
    zonaPostal = '6301'
    agencia = '0401'
  } else if (/\b(MATURIN|MONAGAS)\b/.test(textoBase)) {
    region = '07'
    estado = '16'
    ciudad = '1601'
    municipio = '16001'
    parroquia = '160701'
    zonaPostal = '6201'
    agencia = '0402'
  } else if (/\b(CUMANA|CARUPANO|SUCRE)\b/.test(textoBase)) {
    region = '07'
    estado = '19'
    ciudad = '1901'
    municipio = '19001'
    parroquia = '191401'
    zonaPostal = '6101'
    agencia = '0403'
  } else if (/\b(SAN CRISTOBAL|TACHIRA)\b/.test(textoBase)) {
    region = '06'
    estado = '20'
    ciudad = '2001'
    municipio = '20001'
    parroquia = '202301'
    zonaPostal = '5001'
    agencia = '0304'
  } else if (/\b(MERIDA)\b/.test(textoBase)) {
    region = '06'
    estado = '14'
    ciudad = '1401'
    municipio = '14001'
    parroquia = '141201'
    zonaPostal = '5101'
    agencia = '0305'
  }

  const agenciaFinal = params.agenciaManual?.trim()
    ? params.agenciaManual.trim().padStart(4, '0')
    : agencia

  const estadoFinal = params.estadoManual?.trim()
    ? params.estadoManual.trim().padStart(2, '0')
    : estado
  const regionDeEstado = ESTADOS_BT.find((e) => e.codigo === estadoFinal)?.region
  const regionFinal = params.regionManual?.trim()
    ? params.regionManual.trim().padStart(2, '0')
    : (regionDeEstado ?? region)

  return {
    region: regionFinal,
    estado: estadoFinal,
    ciudad: params.ciudadManual?.trim() || ciudad,
    municipio: params.municipioManual?.trim() || municipio,
    parroquia: params.parroquiaManual?.trim() || parroquia,
    zonaPostal: params.zonaPostalManual?.trim() || zonaPostal,
    agencia: agenciaFinal,
    agenciaNombre: nombreAgenciaBt(agenciaFinal),
    origenAgencia: params.agenciaManual?.trim()
      ? 'ficha'
      : vinoDeTrabajador
        ? 'direccion'
        : 'empresa',
  }
}

/**
 * Deduce automáticamente el código de Tipo de Cargo (3 dígitos) y Profesión (4 letras)
 * del Banco del Tesoro a partir del cargo del trabajador y su grado de instrucción.
 */
export function deducirCargoYProfesionBt(
  cargo: string | null | undefined,
  gradoInstruccion?: string | null,
): { tipoCargo: string; profesion: string } {
  const c = sinAcentos(cargo || '')

  let tipoCargo = '011' // OBRERO por omisión operativa
  let profesion = 'OBRE'

  if (/\bGERENTE GENERAL\b/.test(c)) {
    tipoCargo = '075'
    profesion = 'LAEM'
  } else if (/\bPRESIDENTE\b/.test(c)) {
    tipoCargo = '001'
    profesion = 'LAEM'
  } else if (/\bDIRECTOR\b/.test(c)) {
    tipoCargo = '002'
    profesion = 'LAEM'
  } else if (/\bSUBGERENTE\b/.test(c)) {
    tipoCargo = '004'
    profesion = 'LADM'
  } else if (/\bGERENTE\b/.test(c)) {
    tipoCargo = '003'
    profesion = 'LADM'
  } else if (/\bADMINISTRAD/.test(c)) {
    tipoCargo = '041'
    profesion = 'LADM'
  } else if (/\bINGENIER/.test(c)) {
    tipoCargo = '031'
    profesion = 'INGE'
  } else if (/\bGEOLOG/.test(c)) {
    tipoCargo = '068'
    profesion = 'GEOL'
  } else if (/\bSISTEMA|\bINFORMATIC|\bPROGRAMAD|\bCOMPUTAC/.test(c)) {
    tipoCargo = '012'
    profesion = gradoInstruccion === 'TSU' ? 'TINF' : 'LINF'
  } else if (/\bSUPERVISOR/.test(c)) {
    tipoCargo = '005'
    profesion = 'SUPE'
  } else if (/\bJEFE\b|\bENCARGAD/.test(c)) {
    tipoCargo = '009'
    profesion = 'SUPE'
  } else if (/\bCOORDINAD/.test(c)) {
    tipoCargo = '006'
    profesion = 'COOR'
  } else if (/\bCOMPRAD|\bCOMPRAS/.test(c)) {
    tipoCargo = '074'
    profesion = 'COMP'
  } else if (/\bVENTAS|\bVENDEDOR/.test(c)) {
    tipoCargo = '010'
    profesion = 'VEND'
  } else if (/\bANALISTA|\bRRHH|\bRECURSOS HUMANOS|\bCONTAD/.test(c)) {
    tipoCargo = '007'
    profesion = /\bRRHH|\bRECURSOS HUMANOS/.test(c) ? 'LARH' : 'ANAL'
  } else if (/\bASISTENTE|\bALMACEN/.test(c)) {
    tipoCargo = '013'
    profesion = 'ASIS'
  } else if (/\bRECEPCION/.test(c)) {
    tipoCargo = '024'
    profesion = 'RECE'
  } else if (/\bSECRETAR/.test(c)) {
    tipoCargo = '008'
    profesion = 'SECR'
  } else if (/\bCHOFER|\bCONDUCTOR|\bCAMION/.test(c)) {
    tipoCargo = '021'
    profesion = 'CHOF'
  } else if (/\bOPERADOR|\bCARGADOR|\bEXCAVADOR|\bRETRO|\bTRITURAD|\bPLANTA|\bMAQUINARIA/.test(c)) {
    tipoCargo = '017'
    profesion = 'OBRE'
  } else if (/\bMECANIC|\bLUBRICAD|\bTALLER/.test(c)) {
    tipoCargo = '016'
    profesion = gradoInstruccion === 'TSU' ? 'TMEC' : 'MECA'
  } else if (/\bELECTRIC/.test(c)) {
    tipoCargo = '016'
    profesion = gradoInstruccion === 'TSU' ? 'TMEL' : 'ELEC'
  } else if (/\bSOLDAD|\bHERRER|\bLATONER/.test(c)) {
    tipoCargo = '016'
    profesion = 'HERR'
  } else if (/\bVIGILAN|\bSEGURIDAD|\bGUARDIA|\bPORTERO/.test(c)) {
    tipoCargo = '023'
    profesion = 'VIGI'
  } else if (/\bCOCIN|\bCHEF|\bCOMEDOR|\bALIMENTAC/.test(c)) {
    tipoCargo = '046'
    profesion = 'CHEF'
  } else if (/\bSERVICIOS GENERALES|\bMANTENIMIENTO|\bLIMPIEZA|\bASEO/.test(c)) {
    tipoCargo = '011'
    profesion = 'SERV'
  } else if (/\bAUXILIAR|\bAYUDANTE/.test(c)) {
    tipoCargo = '020'
    profesion = 'OBRE'
  }

  return { tipoCargo, profesion }
}

export function mapearEstadoCivilBt(estadoCivil: string | null | undefined): string {
  switch ((estadoCivil ?? '').toUpperCase()) {
    case 'CASADO':
      return '2'
    case 'DIVORCIADO':
      return '3'
    case 'VIUDO':
      return '4'
    case 'CONCUBINATO':
      return '5'
    case 'SOLTERO':
    default:
      return '1'
  }
}

export function mapearNivelEducacionBt(grado: string | null | undefined): string {
  switch ((grado ?? '').toUpperCase()) {
    case 'PRIMARIA':
      return '01'
    case 'TSU':
      return '04'
    case 'UNIVERSITARIO':
      return '05'
    case 'POSTGRADO':
      return '06'
    case 'BACHILLER':
    default:
      return '02'
  }
}

export function mapearTipoNominaBt(frecuencia: string | null | undefined): string {
  switch ((frecuencia ?? '').toUpperCase()) {
    case 'SEMANAL':
      return 'W'
    case 'MENSUAL':
      return 'M'
    case 'QUINCENAL':
    default:
      return 'B'
  }
}
