import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { enMayuscula } from '@/lib/texto'

/*
  BUSCAR TAMBIÉN DENTRO DE LOS DATOS

  La lupa solo encontraba pantallas, y su propio mensaje vacío lo confesaba:
  «el número de una factura no se encuentra aquí». Eso estaba bien cuando no
  había datos que buscar; ahora hay órdenes, clientes, ciento setenta artículos
  y diecinueve fichas de personal, y quien tiene un número en la mano no quiere
  adivinar en qué pantalla vive.

  SOLO SE CONSULTA LO QUE ESTE USUARIO PUEDE LEER

  El módulo se comprueba **antes** de preguntar, no después de recibir. Filtrar
  al final significaría haber traído filas que no le tocaban: la fila ya viajó,
  aunque no se pinte. Lo de arriba es lo mismo que hace el menú.

  La RLS de la base es la red de debajo, no la de arriba.

  TRES LLEVAN AL DOCUMENTO; EL RESTO, A SU PANTALLA

  Solo tres rutas admiten un identificador —la orden de compra, la ficha del
  trabajador y la del vehículo—, así que solo esas tres abren el registro. Las
  demás dejan en la lista donde está. Es media victoria y se prefiere a no
  encontrarlo: al menos dice que existe y dónde vive.

  SE BUSCA EN MAYÚSCULA Y SIN TILDES

  Porque así lo guarda la base: lo hace el disparador `trg_normalizar`, no el
  front. Buscar «Minería» en minúscula y con tilde no encontraría «MINERIA».
*/

export interface Hallazgo {
  tipo: string
  titulo: string
  detalle: string | null
  to: string
}

/** Qué se busca, dónde, y a dónde lleva cada cosa encontrada. */
interface Fuente {
  modulo: string
  tabla: string
  /** Columnas contra las que se compara, en orden de preferencia. */
  columnas: string[]
  seleccion: string
  tipo: string
  titulo: (f: Record<string, unknown>) => string
  detalle: (f: Record<string, unknown>) => string | null
  to: (f: Record<string, unknown>) => string
}

const texto = (v: unknown) => (v == null ? '' : String(v))

const FUENTES: Fuente[] = [
  {
    modulo: 'COMPRAS',
    tabla: 'ordenes_compra',
    columnas: ['numero'],
    seleccion: 'id, numero, estado',
    tipo: 'Orden de compra',
    titulo: (f) => texto(f.numero),
    detalle: (f) => texto(f.estado).replaceAll('_', ' '),
    to: (f) => `/app/compras/${f.id}`,
  },
  {
    modulo: 'COMPRAS',
    tabla: 'proveedores',
    columnas: ['nombre', 'rif'],
    seleccion: 'id, nombre, rif',
    tipo: 'Proveedor',
    titulo: (f) => texto(f.nombre),
    detalle: (f) => texto(f.rif) || null,
    to: () => '/app/compras/proveedores',
  },
  {
    modulo: 'VENTAS',
    tabla: 'facturas_venta',
    columnas: ['numero'],
    seleccion: 'id, numero, estado',
    tipo: 'Factura',
    titulo: (f) => texto(f.numero),
    detalle: (f) => texto(f.estado).replaceAll('_', ' '),
    to: () => '/app/ventas/facturacion',
  },
  {
    modulo: 'VENTAS',
    tabla: 'notas_entrega',
    columnas: ['numero'],
    seleccion: 'id, numero, estado',
    tipo: 'Nota de entrega',
    titulo: (f) => texto(f.numero),
    detalle: (f) => texto(f.estado).replaceAll('_', ' '),
    to: () => '/app/ventas/despachos',
  },
  {
    modulo: 'VENTAS',
    tabla: 'clientes',
    columnas: ['nombre', 'rif'],
    seleccion: 'id, nombre, rif',
    tipo: 'Cliente',
    titulo: (f) => texto(f.nombre),
    detalle: (f) => texto(f.rif) || null,
    to: () => '/app/ventas/clientes',
  },
  {
    modulo: 'INVENTARIO',
    tabla: 'articulos',
    columnas: ['codigo', 'nombre'],
    seleccion: 'id, codigo, nombre, categoria, unidad',
    tipo: 'Artículo',
    titulo: (f) => `${texto(f.codigo)} · ${texto(f.nombre)}`,
    detalle: (f) => `${texto(f.categoria)} · ${texto(f.unidad)}`,
    to: () => '/app/inventario/articulos',
  },
  {
    modulo: 'NOMINA',
    tabla: 'empleados',
    columnas: ['nombres', 'apellidos', 'cedula', 'ficha'],
    seleccion: 'id, nombres, apellidos, cedula, cargo',
    tipo: 'Trabajador',
    titulo: (f) => `${texto(f.nombres)} ${texto(f.apellidos)}`.trim(),
    detalle: (f) => texto(f.cargo) || texto(f.cedula) || null,
    to: (f) => `/app/nomina/personal/${f.id}`,
  },
  {
    modulo: 'MAQUINARIA',
    tabla: 'maquinaria',
    columnas: ['codigo', 'nombre'],
    seleccion: 'id, codigo, nombre, estado',
    tipo: 'Máquina',
    titulo: (f) => `${texto(f.codigo)} · ${texto(f.nombre)}`,
    detalle: (f) => texto(f.estado).replaceAll('_', ' '),
    to: () => '/app/maquinaria',
  },
  {
    modulo: 'DESPACHOS',
    tabla: 'vehiculos',
    columnas: ['placa'],
    seleccion: 'id, placa, tipo',
    tipo: 'Vehículo',
    titulo: (f) => texto(f.placa),
    detalle: (f) => texto(f.tipo) || null,
    to: (f) => `/app/despachos/vehiculos/${f.id}`,
  },
]

/**
 * Documentos y fichas que coinciden con lo escrito.
 *
 * `puedeLeer` viene de fuera para no atar esto a un hook de permisos: aquí solo
 * se sabe qué módulo hace falta, no cómo se comprueba.
 */
export function useBusquedaDocumentos(consulta: string, puedeLeer: (modulo: string) => boolean) {
  const limpio = consulta.trim()

  return useQuery({
    queryKey: ['busqueda', limpio],
    // Con una sola letra respondería media base y no serviría de nada. Dos ya
    // acota, y es lo mínimo que alguien escribe a propósito.
    enabled: limpio.length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<Hallazgo[]> => {
      const aguja = enMayuscula(limpio)
      // Las comas y los paréntesis rompen la sintaxis del `or` de PostgREST.
      const seguro = aguja.replace(/[,()]/g, ' ').trim()
      if (!seguro) return []

      const permitidas = FUENTES.filter((f) => puedeLeer(f.modulo))

      const respuestas = await Promise.all(
        permitidas.map(async (f) => {
          const filtro = f.columnas.map((c) => `${c}.ilike.%${seguro}%`).join(',')
          const { data, error } = await supabase
            .from(f.tabla)
            .select(f.seleccion)
            .or(filtro)
            .limit(4)

          // Que una tabla falle no debe dejar la búsqueda entera sin resultados:
          // se pierde esa fuente y las demás responden.
          if (error || !data) return [] as Hallazgo[]

          return (data as unknown as Record<string, unknown>[]).map((fila) => ({
            tipo: f.tipo,
            titulo: f.titulo(fila),
            detalle: f.detalle(fila),
            to: f.to(fila),
          }))
        }),
      )

      return respuestas.flat().slice(0, 12)
    },
  })
}
