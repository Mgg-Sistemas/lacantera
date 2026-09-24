import type { HojaXlsx } from '@/lib/xlsx'
import { datosVacios, telefonoParaWhatsApp, type Contacto, type DatosContacto, type EtiquetaDeContacto } from '@/lib/api/contactos'

/*
  LAS HOJAS DEL DIRECTORIO

  - LA EXPORTACIÓN: lo que se ve, o lo marcado, a Excel. Una fila por contacto.
  - LA PLANTILLA DE CARGA: las mismas columnas, vacías, con la cabecera en
    realce para las obligatorias. No hay CLAVE: cargar es crear contactos
    nuevos, nunca pisar los que ya están. Lo que ya está se corrige en la
    pantalla, uno por uno, que es donde se ve el repetido.
  - LA CARGA: la plantilla llena. Aquí solo se lee y se interpreta; las reglas
    —el documento, el correo, el repetido— las aplica la base fila por fila,
    todo o nada.
  - LA VCARD: para pasar contactos al teléfono. Texto plano, un contacto por
    bloque, que WhatsApp y el teléfono importan solos.

  Aquí no hay nada de pantalla: funciones que reciben filas y devuelven filas.
*/

/** Cabeceras de la hoja y a qué campo van. El orden es el de la hoja. */
const COLUMNAS: { titulo: string; campo: keyof DatosContacto | 'etiquetas'; ancho: number; realce?: boolean }[] = [
  { titulo: 'TIPO', campo: 'tipo', ancho: 10, realce: true },
  { titulo: 'TRATAMIENTO', campo: 'tratamiento', ancho: 12 },
  { titulo: 'NOMBRES', campo: 'nombres', ancho: 22, realce: true },
  { titulo: 'APELLIDOS', campo: 'apellidos', ancho: 22, realce: true },
  { titulo: 'RAZON SOCIAL', campo: 'razon_social', ancho: 30, realce: true },
  { titulo: 'DOCUMENTO', campo: 'documento', ancho: 14 },
  { titulo: 'EMPRESA', campo: 'empresa_nombre', ancho: 28 },
  { titulo: 'CARGO', campo: 'cargo', ancho: 22 },
  { titulo: 'CORREO', campo: 'correo', ancho: 28 },
  { titulo: 'CORREO 2', campo: 'correo_secundario', ancho: 28 },
  { titulo: 'TEL OFICINA', campo: 'telefono_oficina', ancho: 15 },
  { titulo: 'EXTENSION', campo: 'extension', ancho: 10 },
  { titulo: 'CELULAR', campo: 'celular', ancho: 15 },
  { titulo: 'WHATSAPP', campo: 'whatsapp', ancho: 15 },
  { titulo: 'DIRECCION', campo: 'direccion', ancho: 36 },
  { titulo: 'CIUDAD', campo: 'ciudad', ancho: 16 },
  { titulo: 'ESTADO', campo: 'estado_region', ancho: 14 },
  { titulo: 'CODIGO POSTAL', campo: 'codigo_postal', ancho: 10 },
  { titulo: 'PAIS', campo: 'pais', ancho: 12 },
  { titulo: 'SITIO WEB', campo: 'sitio_web', ancho: 24 },
  { titulo: 'LINKEDIN', campo: 'linkedin', ancho: 24 },
  { titulo: 'INSTAGRAM', campo: 'instagram', ancho: 18 },
  { titulo: 'FACEBOOK', campo: 'facebook', ancho: 18 },
  { titulo: 'ETIQUETAS', campo: 'etiquetas', ancho: 24 },
  { titulo: 'ORIGEN', campo: 'origen', ancho: 18 },
  { titulo: 'NOTA', campo: 'nota', ancho: 36 },
]

const llano = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()

export function hojaDeContactos(contactos: Contacto[]): HojaXlsx {
  return {
    nombre: 'Contactos',
    columnas: [
      ...COLUMNAS.map((c) => ({ titulo: c.titulo, ancho: c.ancho })),
      { titulo: 'ASIGNADO A', ancho: 22 },
      { titulo: 'ESTATUS', ancho: 12 },
    ],
    filas: contactos.map((c) => [
      c.tipo,
      c.tratamiento ?? '',
      c.nombres ?? '',
      c.apellidos ?? '',
      c.razon_social ?? '',
      c.documento ?? '',
      c.empresa ?? c.empresa_nombre ?? '',
      c.cargo ?? '',
      c.correo ?? '',
      c.correo_secundario ?? '',
      c.telefono_oficina ?? '',
      c.extension ?? '',
      c.celular ?? '',
      c.whatsapp ?? '',
      c.direccion ?? '',
      c.ciudad ?? '',
      c.estado_region ?? '',
      c.codigo_postal ?? '',
      c.pais,
      c.sitio_web ?? '',
      c.linkedin ?? '',
      c.instagram ?? '',
      c.facebook ?? '',
      c.etiquetas.join(', '),
      c.origen ?? '',
      c.nota ?? '',
      c.asignado ?? '',
      c.estado,
    ]),
  }
}

/** Vacía, con las columnas obligatorias en realce y una fila de ejemplo que se borra. */
export function plantillaDeContactos(): HojaXlsx {
  return {
    nombre: 'Carga de contactos',
    columnas: COLUMNAS.map((c) => ({ titulo: c.titulo, ancho: c.ancho, realce: c.realce })),
    filas: [
      [
        'PERSONA', 'ING.', 'JOSÉ', 'PÉREZ', '', 'V-12345678', 'FERRECONSTRUCCIONES, C.A.', 'GERENTE DE COMPRAS',
        'jperez@ejemplo.com', '', '0286-9515000', '12', '0414-1234567', '0414-1234567',
        'AV. LAS AMÉRICAS, TORRE ALTA, PISO 3', 'PUERTO ORDAZ', 'BOLÍVAR', '8050', 'VENEZUELA',
        'www.ejemplo.com', '', '', '', 'PROVEEDOR, SOCIO', 'RECOMENDADO', 'FILA DE EJEMPLO: BÓRRALA',
      ],
      [
        'EMPRESA', '', '', '', 'BLOQUES DEL SUR, C.A.', 'J-98765432-1', '', '',
        'ventas@bloquesdelsur.com', '', '0286-1234567', '', '', '0412-7654321',
        'ZONA INDUSTRIAL UNARE', 'PUERTO ORDAZ', 'BOLÍVAR', '', 'VENEZUELA',
        '', '', '', '', 'CLIENTE', 'VISITA A LA CANTERA', 'FILA DE EJEMPLO: BÓRRALA',
      ],
    ],
  }
}

export interface CargaDeContactos {
  filas: DatosContacto[]
  errores: string[]
  /** Filas que se saltaron por venir vacías o por ser el ejemplo. */
  saltadas: number
}

/**
 * De la hoja a lo que se manda. Casa las columnas por su título, sin acentos
 * ni mayúsculas, así que el orden da igual y una columna que falte se deja
 * vacía. Lo único que se decide aquí es el TIPO cuando no viene: si hay razón
 * social es empresa; si no, persona.
 */
export function interpretarContactos(hoja: string[][], etiquetas: EtiquetaDeContacto[]): CargaDeContactos {
  const errores: string[] = []
  if (hoja.length < 2) return { filas: [], errores: ['La hoja no tiene filas debajo de la cabecera.'], saltadas: 0 }

  const cabecera = hoja[0].map((t) => llano(String(t ?? '')))
  const indice = new Map<string, number>()
  cabecera.forEach((t, i) => {
    if (t) indice.set(t, i)
  })
  const columna = (titulo: string) => indice.get(llano(titulo))
  if (columna('NOMBRES') === undefined && columna('RAZON SOCIAL') === undefined) {
    return { filas: [], errores: ['La hoja no trae ni la columna NOMBRES ni RAZON SOCIAL. Baja la plantilla y llénala.'], saltadas: 0 }
  }

  const etiquetaPor = new Map<string, string>()
  for (const e of etiquetas) {
    etiquetaPor.set(llano(e.codigo), e.codigo)
    etiquetaPor.set(llano(e.nombre), e.codigo)
  }

  const filas: DatosContacto[] = []
  let saltadas = 0

  for (let n = 1; n < hoja.length; n++) {
    const fila = hoja[n]
    const celda = (titulo: string) => {
      const i = columna(titulo)
      return i === undefined ? '' : String(fila[i] ?? '').trim()
    }
    const vacia = COLUMNAS.every((c) => celda(c.titulo) === '')
    if (vacia || /BORRALA/.test(llano(celda('NOTA')))) {
      saltadas++
      continue
    }

    const d = datosVacios()
    for (const c of COLUMNAS) {
      if (c.campo === 'etiquetas' || c.campo === 'tipo') continue
      ;(d as unknown as Record<string, string>)[c.campo] = celda(c.titulo)
    }
    const tipoEscrito = llano(celda('TIPO'))
    d.tipo = tipoEscrito === 'EMPRESA' ? 'EMPRESA' : tipoEscrito === 'PERSONA' ? 'PERSONA' : d.razon_social ? 'EMPRESA' : 'PERSONA'
    if (!d.pais) d.pais = 'VENEZUELA'
    if (!d.estado_region) d.estado_region = ''

    const etiq = celda('ETIQUETAS')
      .split(/[,;/]+/)
      .map((x) => x.trim())
      .filter(Boolean)
    const desconocidas: string[] = []
    d.etiquetas = etiq
      .map((x) => {
        const cod = etiquetaPor.get(llano(x))
        if (!cod) desconocidas.push(x)
        return cod
      })
      .filter((x): x is string => !!x)
    if (desconocidas.length) errores.push(`Fila ${n + 1}: etiqueta desconocida «${desconocidas.join(', ')}».`)

    if (d.tipo === 'PERSONA' && !d.nombres) errores.push(`Fila ${n + 1}: una persona necesita NOMBRES.`)
    if (d.tipo === 'EMPRESA' && !d.razon_social) errores.push(`Fila ${n + 1}: una empresa necesita RAZON SOCIAL.`)

    filas.push(d)
  }

  if (filas.length === 0 && errores.length === 0) errores.push('No hay filas con datos.')
  return { filas, errores, saltadas }
}

/* ───────────────────────────────────────────── vCard */

const limpio = (s: string | null | undefined) => (s ?? '').replace(/[\r\n]+/g, ' ').replace(/([,;\\])/g, '\\$1')

/** vCard 3.0, que es la que abren el teléfono, Outlook y WhatsApp sin quejarse. */
export function vCardDe(contactos: Contacto[]): string {
  return contactos
    .map((c) => {
      const l: string[] = ['BEGIN:VCARD', 'VERSION:3.0']
      if (c.tipo === 'EMPRESA') {
        l.push(`N:${limpio(c.razon_social)};;;;`)
        l.push(`FN:${limpio(c.razon_social)}`)
        l.push(`ORG:${limpio(c.razon_social)}`)
      } else {
        l.push(`N:${limpio(c.apellidos)};${limpio(c.nombres)};;${limpio(c.tratamiento)};`)
        l.push(`FN:${limpio([c.tratamiento, c.nombres, c.apellidos].filter(Boolean).join(' '))}`)
        const org = c.empresa ?? c.empresa_nombre
        if (org) l.push(`ORG:${limpio(org)}`)
      }
      if (c.cargo) l.push(`TITLE:${limpio(c.cargo)}`)
      if (c.celular) l.push(`TEL;TYPE=CELL:${limpio(c.celular)}`)
      if (c.whatsapp && c.whatsapp !== c.celular) l.push(`TEL;TYPE=CELL,WhatsApp:${limpio(c.whatsapp)}`)
      if (c.telefono_oficina) l.push(`TEL;TYPE=WORK:${limpio(c.telefono_oficina)}${c.extension ? ` ext. ${limpio(c.extension)}` : ''}`)
      if (c.correo) l.push(`EMAIL;TYPE=WORK:${limpio(c.correo)}`)
      if (c.correo_secundario) l.push(`EMAIL;TYPE=HOME:${limpio(c.correo_secundario)}`)
      if (c.direccion || c.ciudad || c.estado_region) {
        l.push(`ADR;TYPE=WORK:;;${limpio(c.direccion)};${limpio(c.ciudad)};${limpio(c.estado_region)};${limpio(c.codigo_postal)};${limpio(c.pais)}`)
      }
      if (c.sitio_web) l.push(`URL:${limpio(c.sitio_web)}`)
      if (c.etiquetas.length) l.push(`CATEGORIES:${c.etiquetas.map(limpio).join(',')}`)
      const nota = [c.nota, c.documento ? `Documento: ${c.documento}` : null].filter(Boolean).join(' · ')
      if (nota) l.push(`NOTE:${limpio(nota)}`)
      const wa = telefonoParaWhatsApp(c.whatsapp ?? c.celular)
      if (wa) l.push(`X-WHATSAPP:${wa}`)
      l.push('END:VCARD')
      return l.join('\r\n')
    })
    .join('\r\n')
}
