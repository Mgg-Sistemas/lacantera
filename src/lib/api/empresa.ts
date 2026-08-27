import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'
import { EMPRESA } from '@/lib/empresa'
import type { EmpresaPapel } from '@/lib/ficha/papel'

/**
 * La empresa y sus papeles.
 *
 * Los archivos van a un bucket PRIVADO. Eso obliga a pedir una dirección
 * firmada cada vez que alguien quiere abrir uno: una dirección pública sería
 * eterna y compartible, y el acta de alianza con la Gobernación no es algo que
 * deba quedar colgado de un enlace que cualquiera reenvía.
 */
const BUCKET = 'documentos-legales'

export interface Empresa {
  rif: string
  razon_social: string
  domicilio_fiscal: string | null
  ciudad: string | null
  estado: string | null
  zona_postal: string | null
  inscrito_el: string | null
  rif_actualizado_el: string | null
  rif_vence_el: string | null
  gerencia_seniat: string | null
  comprobante_rif: string | null
  condicion_iva: string | null
  retencion_iva_pct: number | null
  /**
   * La alícuota general del IVA, en porcentaje.
   *
   * Estaba escrita en cinco sitios del código como un 16. Es una cifra legal:
   * cambia por decreto, y el día que cambie no puede hacer falta una versión
   * del sistema para seguirla.
   *
   * Vive en la ficha de la empresa y no en cada documento a propósito. La
   * pregunta que se hace quien factura no es «cuánto» sino «sí o no» —eso lo
   * decide la casilla de cada operación—; un campo numérico abierto en cada
   * venta invita a escribir un 16 mal tecleado, y ese error no se ve hasta que
   * alguien cuadra el libro.
   */
  alicuota_iva_pct: number | null
  /** De la imprenta autorizada. Van impresos al pie de la factura. */
  imprenta_nombre: string | null
  imprenta_rif: string | null
  imprenta_autorizacion: string | null
  /** Si la empresa cobra IVA por defecto. Cada operación puede decir otra cosa. */
  aplica_iva: boolean
  aplica_igtf: boolean
  telefono: string | null
  correo: string | null
  actualizado_en: string
}

export function useEmpresa() {
  return useQuery({
    queryKey: ['empresa'],
    // Con el tipo puesto: sin él, `desenvolver` infería `never` y quien leyera
    // `empresa.data.ciudad` recibía un error de compilación en vez del dato.
    queryFn: async () =>
      desenvolver<Empresa>(await supabase.from('empresa').select('*').eq('id', 1).single()),
  })
}

/**
 * La alícuota que rige, con su respaldo si la ficha todavía no la dice.
 *
 * El 16 de reserva no es un valor por omisión cualquiera: es la alícuota
 * general vigente en Venezuela cuando se escribió esto. Está aquí y en ningún
 * otro sitio, para que quede un solo número que cambiar el día que cambie la
 * ley — y para que ese día se cambie en la pantalla, no en el código.
 */
export function useAlicuotaIva(): number {
  const { data } = useEmpresa()
  const v = Number(data?.alicuota_iva_pct)
  return Number.isFinite(v) && v >= 0 ? v : 16
}

export function useGuardarEmpresa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (e: Partial<Empresa> & { rif: string; razon_social: string }) =>
      rpc<void>('guardar_empresa', {
        p_rif: e.rif,
        p_razon_social: e.razon_social,
        p_domicilio_fiscal: e.domicilio_fiscal || null,
        p_ciudad: e.ciudad || null,
        p_estado: e.estado || null,
        p_zona_postal: e.zona_postal || null,
        p_inscrito_el: e.inscrito_el || null,
        p_rif_actualizado_el: e.rif_actualizado_el || null,
        p_rif_vence_el: e.rif_vence_el || null,
        p_gerencia_seniat: e.gerencia_seniat || null,
        p_comprobante_rif: e.comprobante_rif || null,
        p_condicion_iva: e.condicion_iva || null,
        p_retencion_iva_pct: e.retencion_iva_pct ?? null,
        p_telefono: e.telefono || null,
        p_correo: e.correo || null,
        p_alicuota_iva_pct: e.alicuota_iva_pct ?? null,
        p_imprenta_nombre: e.imprenta_nombre || null,
        p_imprenta_rif: e.imprenta_rif || null,
        p_imprenta_autorizacion: e.imprenta_autorizacion || null,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['empresa'] }),
  })
}

export interface TipoDocumento {
  codigo: string
  nombre: string
  caduca: boolean
  orden: number
}

/**
 * Si la empresa cobra IVA e IGTF por defecto.
 *
 * Va en su propia función y no dentro de `guardar_empresa`, que lleva quince
 * campos: son dos casillas que no tienen que ver con el RIF ni con el
 * domicilio fiscal, y obligar a mandar los quince para cambiarlas invita a
 * pisar sin querer lo que no se estaba tocando.
 */
export function useFijarTributos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (t: { aplica_iva: boolean; aplica_igtf: boolean }) =>
      rpc('fijar_tributos', {
        p_aplica_iva: t.aplica_iva,
        p_aplica_igtf: t.aplica_igtf,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['empresa'] })
    },
  })
}

export function useTiposDocumento() {
  return useQuery({
    queryKey: ['tipos-documento'],
    queryFn: async () =>
      desenvolver(
        await supabase
          .from('tipos_documento_legal')
          .select('codigo, nombre, caduca, orden')
          .eq('activo', true)
          .order('orden'),
      ) as TipoDocumento[],
    // El catálogo no cambia en toda una jornada.
    staleTime: 60 * 60_000,
  })
}

export interface DocumentoLegal {
  id: number
  tipo: string
  nombre: string
  archivo_path: string
  mime: string | null
  bytes: number | null
  emitido_el: string | null
  vence_el: string | null
  nota: string | null
  subido_en: string
}

export function useDocumentos() {
  return useQuery({
    queryKey: ['documentos-legales'],
    queryFn: async () =>
      desenvolver(
        await supabase
          .from('empresa_documentos')
          .select('*')
          .order('subido_en', { ascending: false }),
      ) as DocumentoLegal[],
  })
}

/**
 * Sube el archivo y solo después lo anota.
 *
 * En ese orden a propósito: si la subida falla no queda una fila apuntando a un
 * archivo que no existe, que es un renglón en la lista que al pulsarlo no abre
 * nada. Al revés el fallo es más benigno —un archivo huérfano que nadie ve— y
 * si la anotación falla, se borra el archivo recién subido y no queda rastro.
 */
export function useSubirDocumento() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (d: {
      tipo: string
      nombre: string
      archivo: File
      emitido_el?: string
      vence_el?: string
      nota?: string
    }) => {
      const extension = d.archivo.name.split('.').pop()?.toLowerCase() ?? 'pdf'
      // El nombre en el almacén no es el nombre visible: dos actas pueden
      // llamarse igual, y una ruta repetida pisaría la anterior.
      const ruta = `${d.tipo}/${crypto.randomUUID()}.${extension}`

      const { error } = await supabase.storage.from(BUCKET).upload(ruta, d.archivo, {
        contentType: d.archivo.type || 'application/pdf',
        upsert: false,
      })
      if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`)

      try {
        return await rpc<number>('registrar_documento_legal', {
          p_tipo: d.tipo,
          p_nombre: d.nombre,
          p_archivo: ruta,
          p_mime: d.archivo.type || null,
          p_bytes: d.archivo.size,
          p_emitido_el: d.emitido_el || null,
          p_vence_el: d.vence_el || null,
          p_nota: d.nota || null,
        })
      } catch (e) {
        await supabase.storage.from(BUCKET).remove([ruta])
        throw e
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['documentos-legales'] }),
  })
}

/**
 * Corregir un documento ya cargado.
 *
 * El archivo es opcional: sin él solo se arreglan los datos y no viaja nada por
 * la red, que con papeles de 17 MB es la diferencia entre corregir una fecha y
 * no corregirla. Si viene uno nuevo, se sube primero y solo después se cambia
 * el apunte — al revés, un fallo a mitad dejaría la fila señalando un archivo
 * que no existe.
 */
export function useActualizarDocumento() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (d: {
      id: number
      tipo: string
      nombre: string
      emitido_el?: string
      vence_el?: string
      nota?: string
      /** Solo cuando se reemplaza el papel. */
      archivo?: File | null
    }) => {
      let ruta: string | null = null

      if (d.archivo) {
        const extension = d.archivo.name.split('.').pop()?.toLowerCase() ?? 'pdf'
        ruta = `${d.tipo}/${crypto.randomUUID()}.${extension}`
        const { error } = await supabase.storage.from(BUCKET).upload(ruta, d.archivo, {
          contentType: d.archivo.type || 'application/pdf',
          upsert: false,
        })
        if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`)
      }

      try {
        // Devuelve la ruta anterior solo si hubo reemplazo. Si no, null, y
        // entonces no hay nada que llevarse del almacén.
        const anterior = await rpc<string | null>('actualizar_documento_legal', {
          p_id: d.id,
          p_tipo: d.tipo,
          p_nombre: d.nombre,
          p_emitido_el: d.emitido_el || null,
          p_vence_el: d.vence_el || null,
          p_nota: d.nota || null,
          p_archivo: ruta,
          p_mime: d.archivo?.type || null,
          p_bytes: d.archivo?.size ?? null,
        })

        if (anterior) await supabase.storage.from(BUCKET).remove([anterior])
      } catch (e) {
        if (ruta) await supabase.storage.from(BUCKET).remove([ruta])
        throw e
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['documentos-legales'] }),
  })
}

export function useEliminarDocumento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      // La función devuelve la ruta justamente para poder llevarse el archivo.
      const ruta = await rpc<string>('eliminar_documento_legal', { p_id: id })
      if (ruta) await supabase.storage.from(BUCKET).remove([ruta])
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['documentos-legales'] }),
  })
}

/**
 * Cuánto vale una dirección firmada. Diez minutos.
 *
 * Lo justo para abrir el papel, mirarlo y descargarlo si hace falta. Pasado
 * ese rato deja de servir, así que aunque alguien copie la dirección de la
 * barra y la reenvíe, al otro lado no habrá nada.
 */
const VIGENCIA_ENLACE = 600

/**
 * La dirección para verlo, no el archivo entero.
 *
 * Antes esto bajaba el documento completo a memoria y solo entonces lo
 * enseñaba: con la alianza, 16,5 MB por la red de la cantera antes de ver la
 * primera línea, y un botón diciendo "Abriendo…" sin señal de avance. Con una
 * dirección firmada el visor del navegador pide el archivo por trozos y pinta
 * la primera página en cuanto la tiene, que es lo que se siente como abrir.
 *
 * Sigue sin haber nada público: la dirección la firma el servidor contra la
 * sesión de quien la pide y caduca en diez minutos.
 */
export async function urlDocumento(ruta: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(ruta, VIGENCIA_ENLACE)

  if (error || !data) {
    throw new Error(`No se pudo abrir el documento: ${error?.message ?? 'sin respuesta'}`)
  }
  return data.signedUrl
}

/** Días que faltan para que venza. Negativo si ya venció; null si no caduca. */
export function diasParaVencer(vence: string | null): number | null {
  if (!vence) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const fin = new Date(`${vence}T00:00:00`)
  return Math.round((fin.getTime() - hoy.getTime()) / 86_400_000)
}

/**
 * La empresa tal como va en la cabecera de un papel.
 *
 * Antes cada pantalla la armaba a mano —once sitios— y ninguno salía igual:
 * unos ponían la actividad, otros no; unos el domicilio, otros no; y ninguno
 * componía el domicilio entero. La ficha de la base guarda la calle en un
 * campo y la ciudad, el estado y la zona postal en otros tres, y todos los
 * llamadores pasaban solo la calle. En una factura eso es un domicilio fiscal
 * incompleto, que es de las cosas que un fiscal del SENIAT mira.
 *
 * Va aquí, junto al tipo `Empresa`, y no en `ficha/`: quien lo necesita ya
 * tiene esta fila en la mano.
 *
 * SI LA FILA NO HA CARGADO TODAVÍA, se cae a la constante de `empresa.ts` en
 * vez de a cadena vacía, que es lo que se hacía. Un papel con el nombre vacío
 * es peor que uno con el nombre del registro: es la misma empresa, y el dato
 * de la base solo puede diferir si alguien lo editó en Configuración.
 */
export function empresaDelPapel(e: Empresa | null | undefined): EmpresaPapel {
  const region = [e?.estado, e?.zona_postal].filter(Boolean).join(' ')
  const domicilio = [e?.domicilio_fiscal, e?.ciudad, region].filter(Boolean).join(', ')

  return {
    razonSocial: e?.razon_social || EMPRESA.razonSocial,
    rif: e?.rif || EMPRESA.rif,
    actividad: EMPRESA.actividad,
    domicilio: domicilio || null,
    contacto: [e?.telefono, e?.correo].filter(Boolean).join(' · ') || null,
    imprenta:
      [
        e?.imprenta_nombre,
        e?.imprenta_rif ? `RIF ${e.imprenta_rif}` : null,
        e?.imprenta_autorizacion ? `Aut. ${e.imprenta_autorizacion}` : null,
      ]
        .filter(Boolean)
        .join(' · ') || null,
  }
}
