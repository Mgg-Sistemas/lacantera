import { dinero } from '@/lib/formato'
import { enLaOtraMedida, notaDeConversion } from '@/lib/medidas'
import type {
  CondicionVenta,
  PrecioVenta,
  RenglonGuardado,
  RenglonVenta,
} from '@/lib/api/ventas'

/**
 * Las filas del editor de renglones, mientras se escriben.
 *
 * Van en su propio archivo y no junto al componente porque son funciones, no
 * pantalla: un archivo que exporta componentes y funciones a la vez rompe la
 * recarga en caliente durante el desarrollo, y además estas se prueban solas.
 *
 * Todo se guarda como texto. Un campo numérico vacío no es cero: es "todavía no
 * lo han escrito", y guardarlo como número obliga a distinguir el cero real del
 * campo en blanco con un `null` que se acaba colando en la cuenta.
 */

export interface FilaRenglon {
  clave: number
  articulo_id: string
  descripcion: string
  cantidad: string
  unidad: string
  /**
   * El precio que se ve y se suma. De lista, con descuento o sin cargo lo pone
   * `conPrecio` a partir de la condición; acordado, lo teclea quien vende.
   */
  precio: string
  exento: boolean
  /** Vacía hasta que alguien dice a qué precio sale. */
  condicion: CondicionVenta | ''
  descuentoEn: 'PORCENTAJE' | 'MONTO'
  descuento: string
  motivo: string
  /** El patio de este renglón en un despacho. Vacío: el de la nota. */
  almacen_id: string
}

let contador = 0

export const filaVacia = (): FilaRenglon => ({
  clave: contador++,
  articulo_id: '',
  descripcion: '',
  cantidad: '',
  unidad: '',
  precio: '',
  exento: false,
  condicion: '',
  descuentoEn: 'PORCENTAJE',
  descuento: '',
  motivo: '',
  almacen_id: '',
})

const redondo6 = (n: number) => Math.round(n * 1e6) / 1e6

/** La fila de la lista para ese artículo y esa unidad, si tiene precio. */
export function precioDeLista(
  precios: PrecioVenta[],
  articuloId: string,
  unidad: string,
): PrecioVenta | undefined {
  return precios.find(
    (p) => String(p.articulo_id) === articuloId && p.unidad === unidad && p.precio !== null,
  )
}

/**
 * El precio de lista en la moneda del documento.
 *
 * La base hace la misma cuenta al guardar, pasando por el dólar con la tasa del
 * día. La pantalla solo tiene la tasa del dólar, así que convierte entre
 * dólares y bolívares; en otra combinación devuelve null y el formulario avisa
 * de que la cifra la pone la base al guardar, en vez de enseñar una inventada.
 */
export function listaEnMoneda(p: PrecioVenta | undefined, moneda: string, tasaUsd: number): number | null {
  if (!p?.precio || !p.moneda) return null
  const precio = Number(p.precio)
  if (p.moneda === moneda) return precio
  if (!tasaUsd) return null
  if (p.moneda === 'USD' && moneda === 'VES') return redondo6(precio * tasaUsd)
  if (p.moneda === 'VES' && moneda === 'USD') return redondo6(precio / tasaUsd)
  return null
}

/**
 * La fila con el precio que sale de su condición, calculado igual que en la
 * base. Con precio acordado se deja lo tecleado.
 */
export function conPrecio(f: FilaRenglon, lista: number | null): FilaRenglon {
  if (f.condicion === 'LISTA') return { ...f, precio: lista === null ? '' : String(lista) }
  if (f.condicion === 'SIN_CARGO') return { ...f, precio: '0' }
  if (f.condicion === 'DESCUENTO') {
    const d = Number(f.descuento) || 0
    if (lista === null) return { ...f, precio: '' }
    if (d <= 0) return { ...f, precio: String(lista) }
    const precio =
      f.descuentoEn === 'PORCENTAJE' ? redondo6((lista * (100 - d)) / 100) : redondo6(lista - d)
    return { ...f, precio: String(Math.max(precio, 0)) }
  }
  return f
}

/**
 * Todas las filas otra vez, cuando cambia la moneda del documento: el precio
 * de lista en bolívares no es el mismo número que en dólares.
 */
export function repreciar(
  filas: FilaRenglon[],
  precios: PrecioVenta[],
  moneda: string,
  tasaUsd: number,
): FilaRenglon[] {
  return filas.map((f) =>
    !f.articulo_id || f.condicion === 'ACORDADO'
      ? f
      : conPrecio(f, listaEnMoneda(precioDeLista(precios, f.articulo_id, f.unidad), moneda, tasaUsd)),
  )
}

/**
 * Lo que le falta a una fila para guardarse, dicho para quien la llena. Null si
 * está completa o si está vacía del todo, que no se envía.
 */
export function faltaEnFila(f: FilaRenglon, precios: PrecioVenta[]): string | null {
  if (!f.articulo_id) return null
  const hayLista = precioDeLista(precios, f.articulo_id, f.unidad) !== undefined
  if (!(Number(f.cantidad) > 0)) return 'Falta la cantidad.'
  if (!f.condicion) return 'Falta decir a qué precio sale.'
  if ((f.condicion === 'LISTA' || f.condicion === 'DESCUENTO') && !hayLista) {
    return `No hay precio de lista por ${f.unidad}: sale a precio acordado o sin cargo.`
  }
  if (f.condicion === 'DESCUENTO') {
    const d = Number(f.descuento)
    if (!(d > 0)) return 'Falta de cuánto es el descuento.'
    if (f.descuentoEn === 'PORCENTAJE' && d >= 100) return 'Un descuento del 100 % es sin cargo.'
    if (f.precio !== '' && !(Number(f.precio) > 0)) return 'La rebaja se come el precio entero: eso es sin cargo.'
  }
  if (f.condicion === 'SIN_CARGO' && f.motivo.trim().length < 4) {
    return 'Falta decir por qué sale sin cargo.'
  }
  if (f.condicion === 'ACORDADO' && !(Number(f.precio) > 0)) return 'Falta el precio acordado.'
  return null
}

/** Las filas completas, listas para la función de la base. */
export function aRenglones(filas: FilaRenglon[]): RenglonVenta[] {
  return filas
    .filter((f) => f.articulo_id && Number(f.cantidad) > 0 && f.condicion)
    .map((f) => ({
      articulo_id: Number(f.articulo_id),
      descripcion: f.descripcion.trim() || undefined,
      cantidad: Number(f.cantidad),
      unidad: f.unidad || undefined,
      precio_unitario: Number(f.precio) || 0,
      exento_iva: f.exento,
      condicion: f.condicion as CondicionVenta,
      descuento_pct:
        f.condicion === 'DESCUENTO' && f.descuentoEn === 'PORCENTAJE' ? Number(f.descuento) : null,
      descuento_unitario:
        f.condicion === 'DESCUENTO' && f.descuentoEn === 'MONTO' ? Number(f.descuento) : null,
      motivo_condicion: f.motivo.trim() || null,
      almacen_id: f.almacen_id ? Number(f.almacen_id) : null,
    }))
}

export function subtotalDe(filas: FilaRenglon[]): number {
  return filas.reduce((suma, f) => suma + (Number(f.cantidad) || 0) * (Number(f.precio) || 0), 0)
}

/** Lo gravado: lo que no está marcado como exento. Es la base del IVA. */
export function gravadoDe(filas: FilaRenglon[]): number {
  return filas
    .filter((f) => !f.exento)
    .reduce((suma, f) => suma + (Number(f.cantidad) || 0) * (Number(f.precio) || 0), 0)
}

/**
 * Las filas como las dejará la base cuando el camión se pesó.
 *
 * Si hay un solo material del patio y se vende en toneladas, sus toneladas son
 * las del ticket: `despachar` las cambia al guardar. Con dos materiales el peso
 * es de los dos juntos y cada fila se queda con lo escrito.
 */
export function conRomana(
  filas: FilaRenglon[],
  precios: PrecioVenta[],
  toneladas: number | null,
): FilaRenglon[] {
  if (!toneladas) return filas
  const delPatio = filas.filter(
    (f) =>
      f.articulo_id &&
      precios.find((p) => String(p.articulo_id) === f.articulo_id)?.categoria === 'PRODUCTO',
  )
  if (delPatio.length !== 1 || delPatio[0].unidad !== 'TON') return filas
  const clave = delPatio[0].clave
  return filas.map((f) =>
    f.clave === clave ? { ...f, cantidad: String(Math.round(toneladas * 1e4) / 1e4) } : f,
  )
}

/**
 * Lo que sale del patio por una fila, en la unidad del patio. Null si no se
 * puede saber: sin artículo, sin cantidad o sin densidad para convertir.
 */
export function cantidadDelPatio(f: FilaRenglon, precios: PrecioVenta[]): number | null {
  const p = precios.find((x) => String(x.articulo_id) === f.articulo_id)
  const cantidad = Number(f.cantidad)
  if (!p || !(cantidad > 0)) return null
  if (f.unidad === p.unidad_articulo || !f.unidad) return cantidad
  const densidad = Number(p.densidad_ton_m3)
  if (!densidad) return null
  return f.unidad === 'TON' ? cantidad / densidad : cantidad * densidad
}

/** Los metros cúbicos que van en el camión, sumando lo vendido en toneladas. */
export function m3EnCamion(filas: FilaRenglon[], precios: PrecioVenta[]): number {
  return filas.reduce((suma, f) => {
    const p = precios.find((x) => String(x.articulo_id) === f.articulo_id)
    if (!p || p.unidad_articulo !== 'M3') return suma
    return suma + (cantidadDelPatio(f, precios) ?? 0)
  }, 0)
}

/**
 * El renglón ya guardado, dicho en palabras: a qué precio salió y cómo se supo
 * la cantidad.
 *
 * Lo usan la tabla y el papel. Un «0,00» sin explicación en una factura obliga
 * a llamar a alguien para saber si fue un regalo o un error; y unas toneladas
 * estimadas no pueden parecer pesadas. De lista y medida directa no dicen nada:
 * es lo normal y no hace falta explicarlo.
 */
export function renglonEnPalabras(r: RenglonGuardado, moneda: string): string {
  const partes: string[] = []
  const lista = r.precio_lista ? dinero(moneda, r.precio_lista) : null

  if (r.condicion === 'DESCUENTO' && lista) {
    partes.push(
      r.descuento_pct
        ? `${Number(r.descuento_pct).toLocaleString('es-VE')} % de descuento sobre ${lista}`
        : `${dinero(moneda, r.descuento_unitario ?? 0)} menos por ${r.unidad} sobre ${lista}`,
    )
  } else if (r.condicion === 'SIN_CARGO') {
    partes.push(
      `Sin cargo${lista ? ` (de lista, ${lista})` : ''}${r.motivo_condicion ? `: ${r.motivo_condicion.toLowerCase()}` : ''}`,
    )
  } else if (r.condicion === 'ACORDADO') {
    partes.push('Precio acordado: esa unidad no tenía precio de lista')
  }

  if (r.medida === 'ROMANA' || r.medida === 'ESTIMADA') {
    const patio = r.unidad === 'TON' ? 'm³' : 't'
    const salio = Number(r.cantidad_inventario ?? 0).toLocaleString('es-VE', {
      maximumFractionDigits: 2,
    })
    partes.push(
      r.medida === 'ROMANA'
        ? `pesado en la romana; salieron ${salio} ${patio} del patio`
        : `sin pesar: estimado con ${Number(r.densidad_usada ?? 0).toLocaleString('es-VE')} t/m³; salieron ${salio} ${patio} del patio`,
    )
  }

  const texto = partes.join(' · ')
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : ''
}

/**
 * La línea gris que va debajo del renglón en el papel: su condición y cómo se
 * midió, o nada si el renglón no tiene nada fuera de lo normal.
 *
 * La misma cantidad en la otra medida iba aquí también, y ya no: tiene su
 * columna (`conversionDeRenglon`). Christopher, 16/09/2026: «se desea que todo
 * producto de venta se exprese en m3 y ton por igual», y en letra pequeña bajo
 * el renglón no se leía por igual.
 */
export function detalleDeRenglon(r: RenglonGuardado, moneda: string): string | null {
  return renglonEnPalabras(r, moneda) || null
}

const dosDecimales = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * La cantidad del renglón en la otra medida, para la columna «Conversión».
 *
 * Si se pesó o se estimó al despachar, es lo que salió del patio y se escribe
 * tal cual: ya no es una cuenta. Si no, sale de la densidad —la que se usó, o
 * la del catálogo— y la nota bajo la tabla dice que es aproximada. Nulo si el
 * renglón no va en M3 ni en TON, o si su material no tiene densidad: sin la
 * contraparte no se supone nada.
 */
export function conversionDeRenglon(
  r: RenglonGuardado,
  densidadDelCatalogo: string | number | null | undefined,
): string | null {
  if (r.unidad !== 'M3' && r.unidad !== 'TON') return null
  if ((r.medida === 'ROMANA' || r.medida === 'ESTIMADA') && r.cantidad_inventario != null) {
    return `${dosDecimales.format(Number(r.cantidad_inventario))} ${r.unidad === 'TON' ? 'M3' : 'TON'}`
  }
  const otra = enLaOtraMedida(r.cantidad, r.unidad, r.densidad_usada ?? densidadDelCatalogo)
  return otra ? `${dosDecimales.format(otra.cantidad)} ${otra.unidad}` : null
}

/**
 * La nota bajo la tabla: con qué densidad se convirtió cada material. Los
 * renglones pesados o estimados al despachar no entran, porque su línea de
 * detalle ya dice cómo se midió lo que salió.
 */
export function notaDeConversionDeVenta(
  renglones: RenglonGuardado[],
  densidadDelCatalogo: (r: RenglonGuardado) => string | number | null | undefined,
): string | null {
  return notaDeConversion(
    renglones
      .filter((r) => r.medida !== 'ROMANA' && r.medida !== 'ESTIMADA')
      .map((r) => ({
        articulo: r.descripcion,
        unidad: r.unidad,
        densidad: r.densidad_usada ?? densidadDelCatalogo(r),
      })),
  )
}
