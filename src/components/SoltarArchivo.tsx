import { useEffect, useRef, useState } from 'react'
import { Paperclip, Upload, X } from 'lucide-react'
import { cn } from '@/lib/cn'

/*
  SOLTAR UN ARCHIVO, O ELEGIRLO

  Lo pidió Christopher para los documentos legales, y no se queda ahí: hay SEIS
  pantallas que suben archivos —documentos, papeles de compra, facturas de
  proveedor, carga por planilla, la foto de una máquina y la firma de alguien— y
  ninguna aceptaba que le soltaran nada. Así que esto se escribe una vez.

  SOLTAR NO SUSTITUYE A ELEGIR: LO ACOMPAÑA

  El área entera es también un botón. Quien arrastra, arrastra; quien no —desde
  el teléfono, con el teclado, o porque el archivo está en una carpeta que no se
  ve a la vez que el navegador— pulsa y elige como siempre. Una zona que SOLO
  acepta arrastrar deja fuera a media plantilla y no se nota hasta que alguien
  se queja.

  EL DESCUIDO QUE SÍ DUELE

  Si sueltas un PDF en cualquier otro punto de la página, el navegador ABRE ese
  archivo y se lleva la pestaña por delante. Con un formulario a medio llenar,
  eso es perder lo escrito por no atinar al recuadro. Se corta a nivel de
  ventana mientras este componente está montado.

  EL PARPADEO AL ARRASTRAR POR ENCIMA

  `dragleave` salta también al pasar de la caja a un hijo suyo —el texto, el
  icono—, así que la marca de «suéltalo aquí» se enciende y se apaga sola
  mientras mueves el ratón por dentro. Se lleva la cuenta de entradas y salidas
  en vez de mirar solo la última.
*/

export interface SoltarArchivoProps {
  /** Lo que hay ahora. Nulo cuando no se ha elegido nada. */
  valor: File | null
  onCambio: (archivo: File | null) => void
  /** Igual que el `accept` de un input: 'application/pdf,image/png'. */
  acepta?: string
  /** En bytes. Pasarse no bloquea aquí: se avisa y decide quien manda. */
  tope?: number
  etiqueta?: string
  /** Lo que se lee debajo cuando no hay archivo elegido. */
  pista?: string
  className?: string
  deshabilitado?: boolean
}

const peso = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`

/**
 * ¿Encaja este archivo en el `accept` que se pidió?
 *
 * Se comprueba aquí porque al SOLTAR no hay filtro: el diálogo de elegir
 * archivo respeta `accept` y el arrastre no, así que sin esto se cuela un .docx
 * donde solo caben PDF y el fallo aparece más tarde, al guardar, dicho por la
 * base y en otro idioma.
 */
function encaja(archivo: File, acepta?: string): boolean {
  if (!acepta) return true

  return acepta
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .some((t) => {
      if (t.startsWith('.')) return archivo.name.toLowerCase().endsWith(t)
      if (t.endsWith('/*')) return archivo.type.toLowerCase().startsWith(t.slice(0, -1))
      return archivo.type.toLowerCase() === t
    })
}

/** «application/pdf, image/png» dicho como lo diría una persona. */
function enPalabras(acepta?: string): string {
  if (!acepta) return ''
  const vistos = new Set<string>()
  for (const t of acepta.split(',').map((x) => x.trim().toLowerCase())) {
    if (t.includes('pdf')) vistos.add('PDF')
    else if (t.startsWith('image/') || t.startsWith('.png') || t.startsWith('.jpg'))
      vistos.add('imagen')
    else if (t.includes('sheet') || t.includes('excel') || t.endsWith('.xlsx')) vistos.add('Excel')
    else if (t.includes('csv')) vistos.add('CSV')
  }
  return [...vistos].join(' o ')
}

export function SoltarArchivo({
  valor,
  onCambio,
  acepta,
  tope,
  etiqueta = 'Archivo',
  pista,
  className,
  deshabilitado,
}: SoltarArchivoProps) {
  const campo = useRef<HTMLInputElement>(null)
  const [encima, setEncima] = useState(false)
  const [rechazado, setRechazado] = useState<string | null>(null)

  // Cuenta de entradas y salidas: sin ella, pasar por encima de un hijo apaga
  // la marca. Es una referencia y no un estado porque no repinta nada por sí.
  const dentro = useRef(0)

  /*
    Soltar fuera del recuadro no puede llevarse la pestaña.

    El navegador, por defecto, ABRE el archivo que se le suelta encima. Quien
    falla el recuadro con un formulario a medio llenar pierde lo escrito. Se
    corta mientras este componente esté en pantalla, y se suelta al irse: no es
    un comportamiento que deba quedarse puesto para el resto de la aplicación.
  */
  useEffect(() => {
    const tragar = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', tragar)
    window.addEventListener('drop', tragar)
    return () => {
      window.removeEventListener('dragover', tragar)
      window.removeEventListener('drop', tragar)
    }
  }, [])

  const tomar = (archivo: File | undefined) => {
    if (!archivo) return

    if (!encaja(archivo, acepta)) {
      const cuales = enPalabras(acepta)
      setRechazado(
        cuales
          ? `«${archivo.name}» no es un archivo ${cuales}.`
          : `«${archivo.name}» no es de un tipo admitido.`,
      )
      return
    }

    setRechazado(null)
    onCambio(archivo)
  }

  const pasado = Boolean(valor && tope && valor.size > tope)

  return (
    <div className={cn('w-full min-w-0', className)}>
      <span className="text-ink/70 mb-1.5 block text-sm font-medium">{etiqueta}</span>

      {/* El área es un botón de verdad y no un div con onClick: así entra por
          tabulador y responde a Enter y a espacio sin escribir nada de eso. */}
      <button
        type="button"
        disabled={deshabilitado}
        onClick={() => campo.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault()
          dentro.current += 1
          setEncima(true)
        }}
        onDragOver={(e) => {
          // Sin esto el navegador no deja soltar: `drop` no llega a dispararse.
          e.preventDefault()
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          dentro.current -= 1
          if (dentro.current <= 0) {
            dentro.current = 0
            setEncima(false)
          }
        }}
        onDrop={(e) => {
          e.preventDefault()
          dentro.current = 0
          setEncima(false)
          if (deshabilitado) return
          tomar(e.dataTransfer.files?.[0])
        }}
        className={cn(
          'rounded-card flex w-full flex-col items-center gap-2 border border-dashed px-5 py-7 text-center transition-colors',
          deshabilitado
            ? 'border-ink/12 cursor-not-allowed opacity-60'
            : encima
              ? 'border-royal-600 bg-royal-600/8 cursor-copy'
              : pasado
                ? 'border-danger/40 hover:border-danger cursor-pointer'
                : 'border-ink/20 hover:border-ink/35 hover:bg-ink/2 cursor-pointer',
        )}
      >
        {valor ? (
          <>
            <Paperclip className={cn('size-5', pasado ? 'text-danger' : 'text-ink/40')} />
            <span className="text-ink/85 max-w-full truncate text-sm font-medium">
              {valor.name}
            </span>
            <span className={cn('text-xs', pasado ? 'text-danger' : 'text-ink/50')}>
              {peso(valor.size)}
              {pasado && tope ? ` — pasa del tope de ${peso(tope)}.` : ''}
            </span>
          </>
        ) : (
          <>
            <Upload className={cn('size-5', encima ? 'text-royal-600' : 'text-ink/35')} />
            <span className="text-ink/70 text-sm">
              {encima ? 'Suéltalo aquí' : 'Arrastra el archivo, o pulsa para elegirlo'}
            </span>
            {pista ? <span className="text-ink/45 text-xs">{pista}</span> : null}
          </>
        )}
      </button>

      {/* Fuera de la vista pero en el formulario: es el que abre el dialogo de
          elegir y el que aplica el `accept` del sistema. */}
      <input
        ref={campo}
        type="file"
        accept={acepta}
        disabled={deshabilitado}
        className="sr-only"
        onChange={(e) => {
          tomar(e.target.files?.[0])
          // Se limpia para que elegir DOS VECES el mismo archivo vuelva a
          // avisar: sin esto, `change` no salta la segunda vez y parece colgado.
          e.target.value = ''
        }}
      />

      {rechazado ? <p className="text-danger mt-1.5 text-xs">{rechazado}</p> : null}

      {valor && !deshabilitado ? (
        <button
          type="button"
          onClick={() => {
            onCambio(null)
            setRechazado(null)
          }}
          className="text-ink/45 hover:text-ink/75 mt-1.5 inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline"
        >
          <X className="size-3" />
          Quitar
        </button>
      ) : null}
    </div>
  )
}
