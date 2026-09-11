import { cn } from '@/lib/cn'
import { ETIQUETA_ESTADO, type EstadoMaquina } from '@/lib/api/maquinaria'

/*
  EL PULSO DE LA FLOTA.

  Christopher, sobre la primera versión: «definitivamente este diseño no lo
  quieren, tampoco lo apruebo, otórgales más protagonismo por favor».

  Tenía razón y el diagnóstico es fácil de ver en la captura: cinco recuadros
  pequeños, del mismo peso entre sí y del mismo peso que los filtros de al lado,
  con los ceros en gris tenue. Se leía como una fila de pastillas, no como el
  estado de la flota. Un tablero cuyo número más importante mide doce píxeles no
  está diciendo nada.

  ═══════════════════════════════════════════════════════════════════════════
  QUÉ CAMBIA, Y POR QUÉ CADA COSA
  ═══════════════════════════════════════════════════════════════════════════

  LA CIFRA MANDA. Pasa a ser lo más grande de la pantalla después del título, en
  tipografía ligera y ancho tabular para que las columnas de números queden
  alineadas entre tarjetas. Un número grande y fino pesa sin gritar; uno pequeño
  y negrita hace lo contrario.

  UNA FRANJA DE COLOR A LA IZQUIERDA. El color del texto solo no alcanzaba: un
  cero en gris sobre fondo oscuro desaparece. La franja está siempre, tenga la
  cifra el valor que tenga, así que la tarjeta existe visualmente aunque diga
  cero — y un cero en «Fuera de servicio» ES la noticia.

  OCUPAN TODO EL ANCHO, en rejilla. Antes iban en una fila que se encogía junto a
  los filtros y competía con ellos. Ahora los filtros van debajo, que es su sitio:
  primero se mira cómo está la flota, después se busca dentro.

  LA ELEGIDA SE RELLENA. Un borde de acento no se distingue del borde normal a un
  metro de la pantalla. Relleno del propio color al 10 % y la franja a todo color:
  se ve desde lejos cuál está aplicada.

  EL TOTAL NO ES UN ESTADO Y NO LO PARECE. Va al final, con borde punteado y sin
  franja, porque es la suma de los cinco y no un sexto hermano. Pulsar no filtra:
  es el «todas», y por eso suelta el filtro de estado.
*/

/*
  EL COLOR DE CADA ESTADO.

  `EN_ESPERA` va en tinta neutra a propósito: no es bueno ni malo, es que nadie ha
  decidido todavía. Pintarlo de amarillo lo convertiría en una alarma y llenaría
  la pantalla de avisos el día que entren veinte máquinas nuevas.

  `DESINCORPORADA` va más apagada que las demás: está fuera de la flota, y tiene
  que verse que pertenece a otra categoría sin necesidad de leer el rótulo.
*/
/*
  LOS RELLENOS DE TINTA LLEVAN DOS VALORES, y es una trampa ya conocida en esta
  casa: está escrita en el comentario del chip neutro.

  En claro la tinta es oscura y un 6 % apenas tiñe; en oscuro la tinta es crema y
  ese mismo 6 % ACLARA la tarjeta sobre el fondo, así que la de «En espera» —la
  que menos importa— acabaría pesando más que las de color. Se baja al 3 % en
  oscuro. Los rellenos de color no tienen ese problema: un verde al 10 % es un
  verde tenue en los dos temas.
*/
const PALETA: Record<EstadoMaquina, { franja: string; cifra: string; relleno: string }> = {
  ACTIVA: { franja: 'bg-success', cifra: 'text-success', relleno: 'bg-success/10' },
  EN_ESPERA: {
    franja: 'bg-ink/35',
    cifra: 'text-ink/85',
    relleno: 'bg-ink/6 dark:bg-ink/[0.03]',
  },
  EN_MANTENIMIENTO: { franja: 'bg-warning', cifra: 'text-warning', relleno: 'bg-warning/10' },
  FUERA_DE_SERVICIO: { franja: 'bg-danger', cifra: 'text-danger', relleno: 'bg-danger/10' },
  DESINCORPORADA: {
    franja: 'bg-ink/20',
    cifra: 'text-ink/45',
    relleno: 'bg-ink/5 dark:bg-ink/[0.025]',
  },
}

/*
  LO QUE DICE LA LÍNEA DE ABAJO.

  Existe para que la tarjeta no sea solo un número. «3 · Activa» no dice si
  alguna necesita algo; «3 · Activa · 1 por atender» sí, y esa es la pregunta que
  trae a alguien a esta pantalla.

  Solo se escribe cuando hay algo que decir. Una línea que a veces dice «0 por
  atender» enseña a no leerla.
*/
function pieDeTarjeta(estado: EstadoMaquina, extra: { porAtender: number; pasadas: number }) {
  if (estado === 'ACTIVA') {
    if (extra.pasadas > 0) return `${extra.pasadas} pasada${extra.pasadas === 1 ? '' : 's'} de tope`
    if (extra.porAtender > 0) return `${extra.porAtender} por atender`
    return 'todas al día'
  }
  return null
}

export function PulsoDeLaFlota({
  porEstado,
  total,
  elegido,
  onElegir,
  porAtender,
  pasadas,
}: {
  porEstado: Record<string, number>
  total: number
  elegido: string
  onElegir: (estado: string) => void
  /** De las activas, cuántas piden mantenimiento. */
  porAtender: number
  /** De ésas, cuántas ya se pasaron del tope. */
  pasadas: number
}) {
  const estados = Object.keys(ETIQUETA_ESTADO) as EstadoMaquina[]

  return (
    <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
      {estados.map((e) => {
        const activa = elegido === e
        const paleta = PALETA[e]
        const pie = pieDeTarjeta(e, { porAtender, pasadas })
        const cuantas = porEstado[e] ?? 0

        return (
          <button
            key={e}
            type="button"
            onClick={() => onElegir(activa ? '' : e)}
            aria-pressed={activa}
            className={cn(
              'group border-hairline relative overflow-hidden rounded-xl border pl-4 text-left transition-colors',
              'py-3.5 pr-3.5 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none',
              activa ? paleta.relleno : 'hover:bg-ink/3',
            )}
          >
            {/* La franja, siempre. Es lo que hace que un cero siga siendo una
                tarjeta y no un hueco. Se engorda al estar elegida. */}
            <span
              aria-hidden="true"
              className={cn(
                'absolute inset-y-0 left-0 transition-all',
                paleta.franja,
                activa ? 'w-1.5' : 'w-1 opacity-70 group-hover:opacity-100',
              )}
            />

            <span
              className={cn(
                'tabular block text-3xl leading-none font-light',
                cuantas === 0 ? 'text-ink/25' : paleta.cifra,
              )}
            >
              {cuantas}
            </span>

            <span className="text-ink/65 mt-2 block text-xs leading-tight font-medium">
              {ETIQUETA_ESTADO[e]}
            </span>

            {pie ? <span className="text-ink/40 text-2xs mt-1 block">{pie}</span> : null}
          </button>
        )
      })}

      {/*
        EL TOTAL. Punteado y sin franja: es la suma, no un sexto estado. Incluye
        las desincorporadas —que no están en la flota pero sí registradas— y por
        eso el rótulo dice «Registradas» y no «En la flota». Son dos números
        distintos y confundirlos infla el parque.
      */}
      <button
        type="button"
        onClick={() => onElegir('')}
        className={cn(
          'border-hairline rounded-xl border border-dashed px-3.5 py-3.5 text-left transition-colors',
          'focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none',
          elegido === '' ? 'bg-ink/4' : 'hover:bg-ink/3',
        )}
      >
        <span className="text-ink/90 tabular block text-3xl leading-none font-light">{total}</span>
        <span className="text-ink/65 mt-2 block text-xs leading-tight font-medium">
          Registradas
        </span>
        <span className="text-ink/40 text-2xs mt-1 block">todas, incluidas las retiradas</span>
      </button>
    </div>
  )
}
