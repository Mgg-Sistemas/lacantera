/**
 * Aviso sonoro.
 *
 * Se sintetiza en el momento en vez de reproducir un archivo: dos senos cortos
 * con una envolvente suave pesan cero, no hay que descargar nada y no puede
 * fallar por un asset que no cargó. Y sobre todo, se puede ajustar hasta que
 * sea discreto de verdad — un archivo de aviso genérico suena a alarma.
 *
 * Suena una quinta ascendente (la–mi) a volumen bajo y con caída rápida: se
 * oye si estás en el escritorio y no molesta si estás al lado.
 */

const CLAVE_SILENCIO = 'lacantera.avisos.silencio'

let contexto: AudioContext | null = null

function obtenerContexto(): AudioContext | null {
  if (typeof window === 'undefined') return null

  // Se crea en el primer uso, no al cargar: los navegadores bloquean el audio
  // hasta que la persona ha interactuado con la página, y un contexto creado
  // antes nace suspendido.
  contexto ??= new (window.AudioContext ?? (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  return contexto
}

export function silenciado(): boolean {
  try {
    return localStorage.getItem(CLAVE_SILENCIO) === 'si'
  } catch {
    return false
  }
}

export function alternarSilencio(): boolean {
  const nuevo = !silenciado()
  try {
    localStorage.setItem(CLAVE_SILENCIO, nuevo ? 'si' : 'no')
  } catch {
    /* Modo privado o almacenamiento lleno: el sonido sigue funcionando,
       simplemente no se recuerda la preferencia. */
  }
  return nuevo
}

function nota(
  ctx: AudioContext,
  frecuencia: number,
  retraso: number,
  duracion: number,
  pico = 0.05,
  forma: OscillatorType = 'sine',
) {
  const oscilador = ctx.createOscillator()
  const volumen = ctx.createGain()

  oscilador.type = forma
  oscilador.frequency.value = frecuencia

  const inicio = ctx.currentTime + retraso

  // Ataque y caída explícitos: un oscilador que arranca y para en seco produce
  // un chasquido que se oye más que la propia nota.
  volumen.gain.setValueAtTime(0.0001, inicio)
  volumen.gain.exponentialRampToValueAtTime(pico, inicio + 0.015)
  volumen.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion)

  oscilador.connect(volumen).connect(ctx.destination)
  oscilador.start(inicio)
  oscilador.stop(inicio + duracion + 0.02)
}

/** El contexto listo para sonar, o null si no se puede. */
function preparado(): AudioContext | null {
  if (silenciado()) return null

  const ctx = obtenerContexto()
  if (!ctx) return null

  // Si el navegador lo dejó suspendido, se reanuda; si aún no hubo
  // interacción, la promesa se rechaza y no pasa nada.
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  return ctx
}

export function sonarAviso() {
  const ctx = preparado()
  if (!ctx) return

  nota(ctx, 880, 0, 0.16)
  nota(ctx, 1318.5, 0.09, 0.22)
}

/*
  EL VOCABULARIO DEL SISTEMA

  Cuatro sonidos y ninguno más. Un sistema donde cada cosa suena distinto no
  se aprende: se convierte en ruido y termina silenciado, que es la peor
  salida posible porque entonces tampoco se oyen los avisos que importan.

  Se distinguen por DIRECCIÓN, no por timbre. Sube = salió bien, baja = salió
  mal, plano = te he oído. Eso se entiende sin que nadie lo explique y funciona
  igual en un galpón con ruido que en una oficina.

  Los volúmenes son deliberadamente desiguales. Un aviso se oye tres veces al
  día; una pulsación, quinientas. Al mismo volumen, el sistema entero sería
  insoportable a media mañana.
*/

/**
 * Pulsar.
 *
 * Un golpe seco y grave, más cerca de un relé que de un pitido: 55 ms y a la
 * quinta parte del volumen del aviso. Tiene que notarse en el dedo, no en la
 * oreja — si se oye desde la mesa de al lado, está mal calibrado.
 *
 * Va en onda triangular y no senoidal: a esta duración un seno puro suena a
 * tono de teléfono, y el triángulo tiene el borde que hace que se lea como un
 * contacto mecánico.
 */
export function sonarPulsar() {
  const ctx = preparado()
  if (!ctx) return

  nota(ctx, 196, 0, 0.055, 0.011, 'triangle')
}

/**
 * Algo falló.
 *
 * Dos notas que BAJAN. Es lo único que hay que acertar aquí: una caída se lee
 * como error en cualquier cultura, y ahorra tener que mirar la pantalla para
 * saber que la operación no pasó.
 *
 * Sin estridencia a propósito. Esto suena cuando alguien se equivoca de clave
 * un lunes a las seis de la mañana; un zumbido de alarma sobra.
 */
export function sonarError() {
  const ctx = preparado()
  if (!ctx) return

  nota(ctx, 392, 0, 0.14, 0.038)
  nota(ctx, 261.6, 0.1, 0.26, 0.038)
}

/**
 * Salió bien.
 *
 * La misma quinta del aviso pero más corta y más baja de volumen: es la misma
 * familia, porque las dos dicen "bien", y se diferencian en que el aviso
 * reclama atención y esto solo confirma lo que acabas de hacer.
 */
export function sonarLogro() {
  const ctx = preparado()
  if (!ctx) return

  nota(ctx, 587.3, 0, 0.1, 0.03)
  nota(ctx, 880, 0.07, 0.16, 0.03)
}
