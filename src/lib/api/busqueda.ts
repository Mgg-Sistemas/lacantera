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

  CADA HALLAZGO LLEVA A DONDE VIVE

  Hasta el 24/09/2026 solo tres rutas abrían el registro —la orden de compra, la
  ficha del trabajador y la del vehículo— y las demás dejaban en la lista. Se
  llamó «media victoria» y se prefirió a no encontrar nada, pero el usuario dio
  con lo que costaba de verdad: buscar «aceite» llevaba al catálogo entero, 328
  artículos, y había que volver a escribir «aceite» al llegar. El buscador tenía
  el término en la mano y lo soltaba en la puerta.

  Al mirarlo resultó que casi todas TENÍAN dónde aterrizar y nadie las estaba
  usando: el artículo, el proveedor y la máquina llevan ficha propia desde hace
  meses, y la nota de entrega ya sabía abrirse sola con `?nota=`. No hubo que
  construir destino ninguno; hubo que apuntar a él.

  El cliente es el único que no tiene ficha, así que ese sí va a su lista con el
  nombre puesto en la dirección, y la lista lo filtra al abrirse. La factura se
  queda como estaba: no tiene ficha ni filtro, y hoy no hay ninguna.

  NADA DE ESTO ABRE UNA PUERTA. El permiso sale de `pathname`, que no incluye lo
  que va detrás del `?`, así que la ficha exige el mismo módulo que la lista.

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
    to: (f) => `/app/compras/proveedores/${f.id}`,
  },
  {
    modulo: 'FACTURACION',
    tabla: 'facturas_venta',
    columnas: ['numero'],
    seleccion: 'id, numero, estado',
    tipo: 'Factura',
    titulo: (f) => texto(f.numero),
    detalle: (f) => texto(f.estado).replaceAll('_', ' '),
    to: () => '/app/facturacion',
  },
  {
    modulo: 'FACTURACION',
    tabla: 'notas_entrega',
    columnas: ['numero'],
    seleccion: 'id, numero, estado',
    tipo: 'Nota de entrega',
    titulo: (f) => texto(f.numero),
    detalle: (f) => texto(f.estado).replaceAll('_', ' '),
    // La pantalla ya sabe abrir una nota por su número, y se quita el
    // parámetro al abrirla: cerrar el detalle no la vuelve a abrir.
    to: (f) => `/app/facturacion/notas-entrega?nota=${encodeURIComponent(texto(f.numero))}`,
  },
  {
    modulo: 'VENTAS',
    tabla: 'clientes',
    columnas: ['nombre', 'rif'],
    seleccion: 'id, nombre, rif',
    tipo: 'Cliente',
    titulo: (f) => texto(f.nombre),
    detalle: (f) => texto(f.rif) || null,
    // El único sin ficha. Va a la lista con el nombre puesto, que es lo más
    // preciso que se le puede dar: filtra a ese cliente y a ninguno más.
    to: (f) => `/app/ventas/clientes?q=${encodeURIComponent(texto(f.nombre))}`,
  },
  {
    modulo: 'INVENTARIO',
    tabla: 'articulos',
    columnas: ['codigo', 'nombre'],
    seleccion: 'id, codigo, nombre, categoria, unidad',
    tipo: 'Artículo',
    titulo: (f) => `${texto(f.codigo)} · ${texto(f.nombre)}`,
    detalle: (f) => `${texto(f.categoria)} · ${texto(f.unidad)}`,
    to: (f) => `/app/inventario/articulos/${f.id}`,
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
    to: (f) => `/app/maquinaria/${f.id}`,
  },
  {
    // Los camiones viven en Maquinaria desde el 16/09/2026.
    modulo: 'MAQUINARIA',
    tabla: 'vehiculos',
    columnas: ['placa'],
    seleccion: 'id, placa, tipo',
    tipo: 'Camión',
    titulo: (f) => texto(f.placa),
    detalle: (f) => texto(f.tipo) || null,
    to: (f) => `/app/maquinaria/camiones/${f.id}`,
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
