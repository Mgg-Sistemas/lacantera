/**
 * El logo de la empresa, listo para meter en un PDF o en un lienzo.
 *
 * POR QUÉ ESTO REEMPLAZA A `marca.ts`
 *
 * `marca.ts` dibuja a mano un pico y una piedra en azul: era la identidad de
 * «La Cantera», el nombre con el que nació el proyecto. El sistema es de
 * **Minería Internacional TS** y tiene su propio logo, que es el que la gente
 * reconoce y el que ya sale en la pantalla.
 *
 * Mientras tanto, cada nota de entrega y cada recibo de pago salían firmados
 * con un dibujo que no es de la empresa. Eso no es un detalle de estilo: son
 * papeles que se le entregan a un cliente y a un trabajador.
 *
 * SE CARGA UNA VEZ
 *
 * Convertir un PNG de 500×500 a data URL cuesta lo suyo, y un lote de recibos
 * de nómina son cincuenta documentos seguidos. Se carga la primera vez y se
 * guarda: el resto del lote lo reutiliza.
 *
 * SE DIBUJA SOBRE UN CÍRCULO BLANCO
 *
 * El logo tiene transparencia, pero sus trazos son oscuros y las bandas de los
 * documentos son de color. Puesto encima sin más, desaparece. El círculo
 * blanco es además cómo se ve en la barra lateral, así que el papel y la
 * pantalla dicen lo mismo.
 */

/*
  Se lee de `/media/marca.webp` y no del PNG original.

  El PNG original existe en el equipo pero esta en el `.gitignore` —pesa medio
  mega y el historial de git es permanente— asi que nunca llego al servidor.
  En produccion daba 404, la promesa se rompia, y como `armarDocumento` la
  espera antes de dibujar nada, el PDF no se generaba: el boton de Imprimir no
  hacia absolutamente nada, sin error visible.

  `media/marca.webp` es el mismo logo, si esta versionado, y es el que la
  interfaz ya pinta en la barra lateral. Una sola fuente para la pantalla y el
  papel, que ademas es la unica que se despliega.
*/
const RUTA = '/media/marca.webp'

let cargando: Promise<HTMLImageElement> | null = null
const cacheDataUrl = new Map<number, string>()

function cargar(): Promise<HTMLImageElement> {
  if (cargando) return cargando

  cargando = new Promise((resolver, rechazar) => {
    const img = new Image()
    img.onload = () => resolver(img)
    img.onerror = () => rechazar(new Error(`No se pudo cargar ${RUTA}`))
    img.src = RUTA
  })

  // Un logo que no carga no puede impedir que salga el documento. Se pierde el
  // sello, que es feo; perder la nota de entrega con el camion esperando es
  // otra cosa.
  cargando = cargando.catch(() => {
    cargando = null
    throw new Error('sin-logo')
  })

  return cargando
}

/**
 * El logo como data URL PNG, del lado que se pida.
 *
 * `conCirculo` pinta el disco blanco debajo. Va en las bandas de color; sobre
 * papel blanco no hace falta y quedaría un borde visible.
 */
export async function logoComoImagen(lado = 400, conCirculo = true): Promise<string> {
  const clave = conCirculo ? lado : -lado
  const guardado = cacheDataUrl.get(clave)
  if (guardado) return guardado

  let img: HTMLImageElement
  try {
    img = await cargar()
  } catch {
    return ''
  }

  const lienzo = document.createElement('canvas')
  lienzo.width = lado
  lienzo.height = lado

  const ctx = lienzo.getContext('2d')
  if (!ctx) return ''

  dibujarLogo(ctx, img, 0, 0, lado, conCirculo)

  const url = lienzo.toDataURL('image/png')
  cacheDataUrl.set(clave, url)
  return url
}

/**
 * Pinta el logo en un lienzo 2D que ya se tiene abierto.
 *
 * Lo usa el carné, que se arma sobre un solo lienzo grande y no puede parar a
 * generar data URLs por cada pieza.
 */
export function dibujarLogo(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  lado: number,
  conCirculo = true,
) {
  if (conCirculo) {
    ctx.save()
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath()
    ctx.arc(x + lado / 2, y + lado / 2, lado / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // El logo, encajado dentro del círculo con un margen para que no toque el
  // borde. Se respeta su proporción: estirarlo lo deforma y se nota.
  const margen = conCirculo ? lado * 0.14 : 0
  const disponible = lado - margen * 2
  const escala = Math.min(disponible / img.width, disponible / img.height)
  const ancho = img.width * escala
  const alto = img.height * escala

  ctx.drawImage(img, x + (lado - ancho) / 2, y + (lado - alto) / 2, ancho, alto)
}

/** Para quien necesite la imagen ya cargada (el carné la dibuja él mismo). */
export function cargarLogo(): Promise<HTMLImageElement> {
  return cargar()
}
