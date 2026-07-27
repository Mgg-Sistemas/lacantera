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

function nota(ctx: AudioContext, frecuencia: number, retraso: number, duracion: number) {
  const oscilador = ctx.createOscillator()
  const volumen = ctx.createGain()

  oscilador.type = 'sine'
  oscilador.frequency.value = frecuencia

  const inicio = ctx.currentTime + retraso

  // Ataque y caída explícitos: un oscilador que arranca y para en seco produce
  // un chasquido que se oye más que la propia nota.
  volumen.gain.setValueAtTime(0.0001, inicio)
  volumen.gain.exponentialRampToValueAtTime(0.05, inicio + 0.015)
  volumen.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion)

  oscilador.connect(volumen).connect(ctx.destination)
  oscilador.start(inicio)
  oscilador.stop(inicio + duracion + 0.02)
}

export function sonarAviso() {
  if (silenciado()) return

  const ctx = obtenerContexto()
  if (!ctx) return

  // Si el navegador lo dejó suspendido, se reanuda; si aún no hubo
  // interacción, la promesa se rechaza y no pasa nada.
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})

  nota(ctx, 880, 0, 0.16)
  nota(ctx, 1318.5, 0.09, 0.22)
}
