/**
 * Formateo de cifras.
 *
 * Los montos llegarán de Postgres como `string`, no como `number`: PostgREST
 * serializa `numeric` en texto para no perder precisión. Estas funciones
 * aceptan ambos y solo convierten en el último momento, para presentar.
 * La aritmética de dinero nunca debe pasar por `Number`.
 */

const numero = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const decimal2 = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const decimal4 = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
})

const aNumero = (valor: string | number): number =>
  typeof valor === 'number' ? valor : Number(valor)

/** Toneladas, sin decimales. En cantera nadie habla de 1.284,37 t. */
export const toneladas = (valor: string | number): string => `${numero.format(aNumero(valor))} t`

/** Metros cúbicos. */
export const metrosCubicos = (valor: string | number): string =>
  `${numero.format(aNumero(valor))} m³`

export const dolares = (valor: string | number): string =>
  `$ ${decimal2.format(aNumero(valor))}`

/**
 * Dólares sin céntimos, para indicadores.
 * En una cifra de titular los céntimos no informan y sí obligan a partir el
 * número en dos líneas. En documentos y listados se usa `dolares`.
 */
export const dolaresRedondos = (valor: string | number): string =>
  `$ ${numero.format(aNumero(valor))}`

export const bolivares = (valor: string | number): string =>
  `Bs ${decimal2.format(aNumero(valor))}`

/**
 * El símbolo con el que se escribe cada moneda.
 *
 * Son hechos, no configuración: el euro se escribe € en todas partes. Lo que sí
 * es configuración —qué monedas existen y de dónde sale su tasa— vive en la
 * tabla `monedas`. Una moneda que no esté aquí se rotula con su propio código,
 * que es feo pero no miente.
 */
const SIMBOLOS: Record<string, string> = {
  VES: 'Bs',
  USD: '$',
  EUR: '€',
  USDT: 'USDT',
}

/**
 * Un monto en la moneda que le corresponde.
 *
 * El sistema maneja varias a la vez y una cifra sin su símbolo es una trampa:
 * 3.185.647 en bolívares y en dólares no son ni parecidos.
 *
 * Antes esto decía «bolívares si es VES, dólares en cualquier otro caso», y
 * mientras solo hubo dos monedas coló. Al entrar el USDT dejó de colar: el
 * saldo de la cuenta de Binance salía rotulado con un `$` que no le
 * correspondía, en la tarjeta de la cuenta y en los desplegables de traslado.
 */
export const dinero = (moneda: string | null | undefined, valor: string | number): string => {
  const codigo = moneda ?? 'USD'
  const simbolo = SIMBOLOS[codigo] ?? codigo
  return `${simbolo} ${decimal2.format(aNumero(valor))}`
}

/** La tasa lleva cuatro decimales: a 235 Bs/USD, el cuarto decimal ya mueve céntimos. */
export const tasa = (valor: string | number): string => decimal4.format(aNumero(valor))

export const porcentaje = (valor: string | number): string =>
  `${decimal2.format(aNumero(valor))}%`

export const enteros = (valor: string | number): string => numero.format(aNumero(valor))

export function fechaHora(iso: string | null): string {
  if (!iso) return '—'
  if (Number.isNaN(new Date(iso).getTime())) return '—'
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/**
 * Una fecha sin hora.
 *
 * A una fecha suelta se le pega el mediodía a propósito: el navegador la
 * interpreta como medianoche UTC y en Venezuela —cuatro horas atrás— se muestra
 * el día anterior. Al mediodía no hay huso que la mueva de día.
 *
 * SI LO QUE LLEGA ES UN INSTANTE COMPLETO se usa tal cual, porque ya trae su
 * hora y su huso. Antes se le pegaba el mediodía igual, y "2026-08-04T14:34:01
 * +00:00T12:00:00" no es una fecha: `Intl` lanzaba y la pantalla entera se
 * quedaba en blanco. Pasó al mostrar cuándo se actualizó un precio.
 *
 * Y si aun así no se entiende, se dibuja una raya. Un dato con mala forma puede
 * estropear su celda; no puede tumbar la página que lo rodea.
 */
export function fecha(iso: string | null): string {
  if (!iso) return '—'

  const d = iso.length <= 10 ? new Date(`${iso}T12:00:00`) : new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'

  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

/**
 * Cuánto hace que ocurrió algo.
 *
 * Es lo que distingue una lista de una herramienta: un pedido de hace tres
 * horas y uno de hace nueve días se ven igual hasta que alguien pone el tiempo
 * al lado.
 */
export function hace(iso: string): string {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutos < 1) return 'ahora mismo'
  if (minutos < 60) return `hace ${minutos} min`

  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas} h`

  const dias = Math.floor(horas / 24)
  if (dias < 30) return `hace ${dias} d`

  const meses = Math.floor(dias / 30)
  return `hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`
}

/*
  LA UNIDAD, DICHA EN PALABRAS

  «Cuántos l» no se entiende, y era lo que salía de bajar la unidad a minúscula:
  el catálogo guarda siglas —L, GAL, UND— porque en una tabla de veinte filas es
  lo único que cabe, y en el rótulo de un campo hay sitio para la palabra.

  Lo que no esté en la lista sale tal cual, en minúscula. Es una lista de
  cortesía, no un catálogo: un rótulo un poco seco es mejor que un campo que no
  se deja escribir porque alguien añadió una unidad nueva.
*/
const EN_PALABRAS: Record<string, string> = {
  L: 'litros',
  GAL: 'galones',
  UND: 'unidades',
  KG: 'kilos',
  TON: 'toneladas',
  M3: 'metros cúbicos',
  M: 'metros',
  PAR: 'pares',
  CAJA: 'cajas',
  SACO: 'sacos',
  ROLLO: 'rollos',
  JGO: 'juegos',
  H: 'horas',
}

export function enPlural(unidad: string | null | undefined): string {
  const u = (unidad ?? '').trim().toUpperCase()
  return EN_PALABRAS[u] ?? u.toLowerCase()
}

// ---------------------------------------------------------------------------
// Lo que se teclea
// ---------------------------------------------------------------------------

/**
 * Un número tal como lo escribe la gente aquí, pasado a lo que entiende el código.
 *
 * LA COMA Y EL PUNTO SON LO MISMO
 *
 * En Venezuela el separador decimal es la coma —«3,20»— y el teclado numérico
 * del teléfono ofrece coma, no punto. Con `type="number"` el navegador
 * sencillamente no la admite: se pulsa y no aparece nada, o peor, aparece y el
 * campo se queda en blanco al leerlo.
 *
 * Vivía dentro de `Input.tsx`, que es donde se usa casi siempre. Sale aquí
 * porque tres campos del sistema se dibujan a mano, fuera de ese componente
 * —dos de ellos en notas de crédito, sobre cantidades y precios— y estaban
 * quedándose con el `type="number"` pelado y su problema entero.
 *
 * Cuando hay varios separadores, el decimal es el ÚLTIMO y los de antes son de
 * millar: pegar «1.500,25» de una factura da mil quinientos con veinticinco.
 * Con uno solo no hay nada que decidir y es el decimal, así que «1,5» funciona
 * tecla a tecla. «1.500» a secas es ambiguo y se toma como uno y medio, que es
 * lo que se lee tal cual.
 */
export function comoNumero(bruto: string): string {
  let s = bruto.replace(/[^0-9.,-]/g, '')

  const negativo = s.startsWith('-')
  s = s.replace(/-/g, '')

  const ultimo = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
  if (ultimo !== -1) {
    s = s.slice(0, ultimo).replace(/[.,]/g, '') + '.' + s.slice(ultimo + 1).replace(/[.,]/g, '')
  }

  return (negativo ? '-' : '') + s
}

/**
 * El mismo número, vestido para el ojo: `1209012.48` se lee `1.209.012,48`.
 *
 * PARA QUÉ, que es lo que importa
 *
 * Un cero de más no se ve en `1209012.48` y salta a la vista en
 * `1.209.012,48`. El inventario de esta empresa llegó a valer 868 millones de
 * dólares porque cinco costos se teclearon mal y nadie los leyó: el número
 * estaba en la pantalla y no se podía mirar.
 *
 * SE CONSERVAN LOS DECIMALES QUE SE ESCRIBIERON. Rellenar «3,5» a «3,50» dice
 * que el sistema sabe algo que no sabe, y quitarle el cero a «3,50» borra una
 * precisión que alguien puso a propósito. Se enseña lo que hay.
 *
 * Devuelve el texto tal cual cuando no es un número acabado —«1.» mientras se
 * escribe, o el campo vacío—: vestir a medias es peor que no vestir.
 */
export function vestido(texto: string): string {
  if (texto === '' || texto === '-') return texto

  const canonico = comoNumero(texto)
  const n = Number(canonico)
  if (!Number.isFinite(n)) return texto

  const punto = canonico.indexOf('.')
  const decimales = punto === -1 ? 0 : canonico.length - punto - 1

  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: Math.max(decimales, 0),
  }).format(n)
}

// ---------------------------------------------------------------------------
// Cédulas y RIF
// ---------------------------------------------------------------------------

/** Lo que dice la letra de un documento de identidad venezolano. */
export const NATURALEZA_DEL_DOCUMENTO: Record<string, string> = {
  V: 'Venezolano',
  E: 'Extranjero',
  J: 'Jurídico (empresa)',
  G: 'Gubernamental',
  P: 'Pasaporte',
}

/**
 * La forma canónica de una cédula o un RIF: letra, guion y cifras, sin puntos.
 *
 * `V-12345678` y `J-29820894-5`. Es lo que se guarda, y coincide con
 * `private.documento_normalizado` de la base a propósito: si las dos versiones
 * discrepan, el mismo documento se escribe de dos maneras y deja de cruzar
 * consigo mismo. Ya pasó: `empleados` guarda «V-12460702» y `perfiles`
 * guardaba «12460702» para la misma persona.
 *
 * Devuelve null cuando no se puede normalizar, y en particular cuando falta la
 * letra. **No se adivina**: poner una V donde nadie la puso escribe una
 * nacionalidad inventada.
 */
export function documentoCanonico(
  bruto: string,
  conVerificador = false,
): string | null {
  const s = (bruto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (s === '' || !/^[VEJGP]/.test(s)) return null

  const letra = s[0]
  const cifras = s.slice(1)
  if (!/^[0-9]+$/.test(cifras)) return null

  if (conVerificador) {
    if (cifras.length < 8) return null
    if (cifras.length === 8) return `${letra}-${cifras}`
    return `${letra}-${cifras.slice(0, -1)}-${cifras.slice(-1)}`
  }

  if (cifras.length < 6 || cifras.length > 9) return null
  return `${letra}-${cifras}`
}

/**
 * El documento vestido para el ojo: `V-12345678` se lee `V-12.345.678`.
 *
 * Christopher: «la base no necesariamente debe guardar los puntos... pero la
 * pantalla deberá mostrarlo». Ocho o nueve cifras seguidas no se leen; con los
 * puntos se comparan de un vistazo contra el carnet que se tiene delante, que
 * es justo cuando se cazan los dígitos cambiados de sitio.
 *
 * El dígito verificador del RIF se queda aparte, detrás de su guion:
 * `J-29.820.894-5`.
 *
 * Lo que no reconoce lo devuelve tal cual. Un documento viejo mal guardado se
 * enseña como está, y así se ve que está mal.
 */
export function documento(valor: string | null | undefined): string {
  const s = (valor ?? '').trim()
  if (s === '') return ''

  const m = /^([VEJGP])-?([0-9]+)(?:-([0-9]))?$/i.exec(s.replace(/[.\s]/g, ''))
  if (!m) return s

  const [, letra, cifras, verificador] = m
  const conPuntos = cifras.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${letra.toUpperCase()}-${conPuntos}${verificador ? `-${verificador}` : ''}`
}

// ---------------------------------------------------------------------------
// Teléfonos
// ---------------------------------------------------------------------------

/**
 * Lo que se deja teclear en un teléfono: cifras, y el `+` de un país.
 *
 * POR QUÉ SE FILTRA LA TECLA Y NO SOLO SE AVISA DESPUÉS
 *
 * Entre los diecinueve teléfonos de empleados hay uno guardado como
 * `O4123917198`: la letra O en lugar del cero de delante. Es un número que no
 * sirve para llamar a nadie, y nadie se enteró hasta que se midió. Un aviso al
 * guardar no lo habría evitado —se lee «04123917198» y parece correcto—; que la
 * tecla no entre, sí.
 *
 * Se admite el `+` solo al principio, que es donde significa algo, y el guion
 * porque la gente lo escribe. Los espacios y los paréntesis se caen: no aportan
 * y multiplican las formas de escribir el mismo número.
 */
export function comoTelefono(bruto: string): string {
  const mas = bruto.trimStart().startsWith('+')
  const resto = bruto.replace(/[^0-9-]/g, '')
  return (mas ? '+' : '') + resto
}

/**
 * El teléfono vestido: `04125551234` se lee `0412-555.1234`.
 *
 * Los venezolanos son once cifras —cuatro de operadora y siete de abonado— y
 * así partidos se dictan por teléfono sin repetir. Con `+58` delante son diez,
 * porque el cero de la operadora se cae.
 *
 * Lo que no reconoce lo devuelve tal cual: un número mal guardado se enseña
 * como está, y así se ve que está mal.
 */
export function telefono(valor: string | null | undefined): string {
  const s = (valor ?? '').trim()
  if (s === '') return ''

  const mas = s.startsWith('+')
  const d = s.replace(/[^0-9]/g, '')

  if (mas && d.startsWith('58') && d.length === 12) {
    const n = d.slice(2)
    return `+58 ${n.slice(0, 3)}-${n.slice(3, 6)}.${n.slice(6)}`
  }
  if (!mas && d.length === 11 && d.startsWith('0')) {
    return `${d.slice(0, 4)}-${d.slice(4, 7)}.${d.slice(7)}`
  }
  return s
}

/**
 * Lo que se deja teclear en una cédula o un RIF.
 *
 * Christopher: «cédula solo debe permitir ingresar las letras o caracteres
 * relacionados o útiles para ello ejemplo "V J G E - ."».
 *
 * Las cinco letras que dicen la naturaleza del documento, las cifras, y los dos
 * separadores que la gente escribe. Nada más: en un campo de identidad no hay
 * ninguna otra tecla que signifique algo, y dejarlas entrar solo sirve para que
 * el error se descubra al guardar.
 *
 * La letra sube a mayúscula según se escribe. `v-12345678` y `V-12345678` son
 * el mismo documento, y verlo en mayúscula desde la primera tecla dice que el
 * sistema ya lo sabe.
 */
export function soloDocumento(bruto: string): string {
  return bruto.toUpperCase().replace(/[^VEJGP0-9.\- ]/g, '')
}
