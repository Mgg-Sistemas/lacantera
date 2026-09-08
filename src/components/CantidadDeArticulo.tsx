import { useState } from 'react'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'

/*
  UNA CANTIDAD QUE SE PUEDE TECLEAR COMO LLEGA O COMO SE USA.

  El almacén cuenta bultos al descargar un camión; la existencia se lleva en
  litros, en kilos o en unidades. Hasta ahora quien recibía tenía que hacer la
  multiplicación de cabeza, y seis bultos de agua se cargaban como seis
  unidades más veces de las que nadie quiere admitir.

  Aquí se elige en qué se está tecleando y el sistema hace la cuenta.

  SIETE TAMBORES Y DIEZ LITROS.

  Christopher, el 7 de septiembre: «el usuario ingresa 7 tambores y 10 L (en sí
  son 8 tambores, pero se entiende que el 8vo apenas le quedan litros), lo mismo
  8 rollos de malla y 4 M». Es como se cuenta un almacén de verdad: nadie dice
  «1.466 litros», dice siete tambores llenos y uno empezado.

  Por eso, al contar en bultos aparece un segundo campo para lo suelto. Contando
  en la unidad de operación no aparece: ahí no hay nada que acompañar.

  LO QUE SALE DE AQUÍ SIEMPRE ESTÁ EN LA UNIDAD DEL ARTÍCULO.

  El que llama recibe litros, como antes, y de propina lo que la persona tecleó
  —los bultos, la presentación y lo suelto— por si quiere mandárselo a la base.
  Y conviene que quiera: la base sabe hacer la cuenta desde el 7 de septiembre, y
  un asiento que guarda «7 TAMBOR + 10 L» al lado de «1.466 L» se puede cuadrar
  contra la hoja de conteo dentro de un año. Uno que solo guarda 1.466, no.

  Y LA CUENTA SE ENSEÑA MIENTRAS SE HACE.

  Debajo del campo, en grande y no en gris: «10 BULTO = 60 UND». Convertir por
  detrás sin decirlo cambia lo que se guarda sin que nadie lo vea, y una cifra
  de inventario que no es la que se tecleó no se descubre hasta que alguien
  cuenta el almacén. Si se enseña, se puede desmentir antes de guardar.

  El selector solo aparece si el artículo dice en qué viene y cuántas trae. Una
  barra de acero llega suelta: ahí esto es un campo de cantidad y nada más.
*/

/** Lo que la persona tecleó, tal cual, para que la base pueda guardarlo. */
export interface CantidadCapturada {
  /** Bultos enteros. Nulo cuando se contó solo en la unidad de operación. */
  presentaciones: number | null
  /** Lo suelto, en la unidad de operación. */
  sueltas: number
  /** En qué presentación se contó. Nulo cuando no se contó en bultos. */
  unidad: string | null
}

interface Props {
  label?: string
  /** La cantidad, siempre en la unidad del artículo. */
  valor: string
  /**
   * La cantidad ya convertida a la unidad del artículo, y aparte lo que se
   * tecleó. El segundo argumento se puede ignorar: quien no lo use sigue
   * funcionando exactamente igual que antes.
   */
  onCambiar: (enUnidades: string, capturada: CantidadCapturada) => void
  articulo:
    | {
        unidad?: string | null
        presentacion?: string | null
        unidades_por_presentacion?: string | null
        /**
         * Las demás formas de contarlo, cuando hay más de una.
         *
         * Aceite en tambor y en bidón; tuercas en pack de 6, de 12 y sueltas.
         * La existencia sigue siendo UNA: son maneras de contar, no maneras de
         * almacenar.
         *
         * Vienen del llamador y no se piden aquí a propósito: una entrada de
         * quince renglones haría quince consultas para leer quince filas.
         */
        presentaciones?: { presentacion: string; unidades: string | number }[] | null
      }
    | undefined
    | null
  /** Lo que se dice cuando no hay artículo elegido todavía. */
  hintSinArticulo?: string
  /**
   * Lo que se dice cuando SÍ lo hay, en vez del «En L» de serie.
   *
   * Lo pide la salida, donde el dato que hace falta no es la unidad —que ya se
   * lee en el selector— sino cuánto queda: sacar de más es el error que ahí se
   * comete. Sin esto, poner el componente en la salida cambiaba «Hay 624 L» por
   * «En L», que es cierto y no sirve para nada.
   */
  hint?: string
  className?: string
  required?: boolean
  disabled?: boolean
}

export function CantidadDeArticulo({
  label = 'Cantidad',
  valor,
  onCambiar,
  articulo,
  hintSinArticulo = 'Elige antes el artículo',
  hint,
  className,
  required,
  disabled,
}: Props) {
  const unidad = articulo?.unidad ?? ''

  /*
    DE CUÁNTAS FORMAS SE PUEDE CONTAR ESTO.

    Si el artículo trae la lista, manda la lista. Si no —porque el llamador no
    la carga, o porque el artículo solo tiene una— se usan las dos columnas de
    siempre, y todo se comporta como antes.
  */
  const formas =
    articulo?.presentaciones && articulo.presentaciones.length > 0
      ? articulo.presentaciones.map((p) => ({
          nombre: p.presentacion,
          por: Number(p.unidades),
        }))
      : articulo?.presentacion && Number(articulo.unidades_por_presentacion) > 0
        ? [
            {
              nombre: articulo.presentacion,
              por: Number(articulo.unidades_por_presentacion),
            },
          ]
        : []

  const [cual, setCual] = useState('')
  const elegida = formas.find((f) => f.nombre === cual) ?? formas[0]
  const presentacion = elegida?.nombre ?? ''
  const porBulto = elegida?.por ?? NaN
  const convertible = !!presentacion && Number.isFinite(porBulto) && porBulto > 0

  const [enPresentacion, setEnPresentacion] = useState(false)
  /*
    Lo tecleado se guarda aparte de lo calculado.

    Si el campo mostrara siempre `valor / porBulto`, teclear «1» en bultos
    escribiría 6 arriba, que al dividir vuelve como 1 — hasta ahí bien— pero
    con un factor que no divide exacto el número bailaría bajo los dedos
    mientras se escribe. Se recuerda lo que la persona puso y se deriva de ahí.
  */
  const [tecleado, setTecleado] = useState('')
  /** Lo que acompaña a los bultos enteros: los diez litros del octavo tambor. */
  const [suelto, setSuelto] = useState('')

  const usandoPresentacion = convertible && enPresentacion

  /*
    La cuenta se hace aquí para ENSEÑARLA, no para que sea lo que viaja. Lo que
    viaja son las dos cifras tecleadas, y la suma la vuelve a hacer la base con
    `private.en_unidad_base`. Que las dos den lo mismo es la comprobación; que
    solo la haga el navegador fue el problema.
  */
  const avisar = (bultosCrudo: string, sueltoCrudo: string, enBultos: boolean) => {
    if (!enBultos) {
      const n = Number(bultosCrudo)
      onCambiar(bultosCrudo, {
        presentaciones: null,
        sueltas: Number.isFinite(n) ? n : 0,
        unidad: null,
      })
      return
    }
    const b = Number(bultosCrudo)
    const su = Number(sueltoCrudo)
    const bultos = bultosCrudo !== '' && Number.isFinite(b) ? b : 0
    const sueltas = sueltoCrudo !== '' && Number.isFinite(su) ? su : 0
    const total = bultos * porBulto + sueltas
    onCambiar(bultosCrudo === '' && sueltoCrudo === '' ? '' : String(total), {
      presentaciones: bultos || null,
      sueltas,
      unidad: bultos ? presentacion : null,
    })
  }

  const escribir = (crudo: string) => {
    setTecleado(crudo)
    avisar(crudo, suelto, usandoPresentacion)
  }

  const escribirSuelto = (crudo: string) => {
    setSuelto(crudo)
    avisar(tecleado, crudo, true)
  }

  const cambiarDeUnidad = (aPresentacion: boolean) => {
    setEnPresentacion(aPresentacion)
    /*
      Lo ya escrito se conserva y se reexpresa: cambiar de unidad no es borrar.
      Al volver a la unidad de operación lo suelto se suma en vez de perderse,
      porque lo que la persona quiso decir sigue siendo la misma cantidad.
    */
    const enUnidades = Number(valor)
    if (!Number.isFinite(enUnidades) || valor === '') {
      setTecleado('')
      setSuelto('')
      return
    }
    if (aPresentacion) {
      setTecleado(String(enUnidades / porBulto))
      setSuelto('')
      avisar(String(enUnidades / porBulto), '', true)
    } else {
      setTecleado(String(enUnidades))
      setSuelto('')
      avisar(String(enUnidades), '', false)
    }
  }

  const enEspanol = (n: number) => n.toLocaleString('es-VE', { maximumFractionDigits: 4 })

  const equivale =
    usandoPresentacion && valor !== '' && Number.isFinite(Number(valor))
      ? // Los dos lados con el formato de aquí. Sin esto la línea mezclaba
        // convenciones —«2.25 BIDON = 1.234,5 LTS»— y el punto de un lado
        // decía decimal mientras el del otro decía millar.
        `${enEspanol(Number(tecleado || 0))} ${presentacion}${
          Number(suelto) ? ` y ${enEspanol(Number(suelto))} ${unidad}` : ''
        } = ${enEspanol(Number(valor))} ${unidad}`
      : null

  return (
    <div className={className}>
      <div className={cn('grid gap-2', convertible && 'grid-cols-[1fr_auto]')}>
        <Input
          label={label}
          type="number"
          min="0"
          step="0.0001"
          inputMode="decimal"
          required={required}
          disabled={disabled}
          value={usandoPresentacion ? tecleado : valor}
          onChange={(e) => escribir(e.target.value)}
          hint={
            !articulo
              ? hintSinArticulo
              : (hint ??
                (convertible ? undefined : unidad ? `En ${unidad}` : undefined))
          }
        />

        {/*
          El selector no es un `Select` de la casa a propósito: tiene que
          alinearse con el campo de al lado y su etiqueta no aporta nada —lo
          que dice ya se lee dentro—. Con rótulo propio la fila crece un piso
          por dos palabras.
        */}
        {convertible ? (
          <label className="self-end">
            <span className="sr-only">En qué se teclea la cantidad</span>
            <select
              disabled={disabled}
              value={enPresentacion ? presentacion : 'U'}
              /*
                Con varias formas, el selector ya no es un interruptor: es la
                lista entera. Elegir una que no es la de ahora reexpresa lo
                escrito con SU factor, que es lo que hace que cambiar de tambores
                a bidones no invente una cantidad.
              */
              onChange={(e) => {
                const v = e.target.value
                if (v === 'U') {
                  cambiarDeUnidad(false)
                  return
                }
                setCual(v)
                const nueva = formas.find((f) => f.nombre === v)
                const total = Number(valor)
                if (nueva && Number.isFinite(total) && valor !== '') {
                  setTecleado(String(total / nueva.por))
                  setSuelto('')
                  const b = total / nueva.por
                  onCambiar(String(total), {
                    presentaciones: b || null,
                    sueltas: 0,
                    unidad: b ? v : null,
                  })
                }
                setEnPresentacion(true)
              }}
              /*
                Las mismas medidas que el `Select` de la casa —alto 10, borde
                `ink/20`, radio de control— para que la caja de al lado y esta
                midan igual. Con `py-2` el selector quedaba mas bajo que el
                campo y la fila se veia descuadrada; se comprobo en pantalla.
              */
              className="rounded-control bg-surface text-ink/90 border-ink/20 hover:border-ink/32 focus:border-royal-600 focus:ring-royal-600/20 h-10 appearance-none border pr-8 pl-3 text-base transition-[border-color,box-shadow] duration-150 focus:ring-2 focus:outline-none"
            >
              <option value="U">{unidad}</option>
              {formas.map((f) => (
                <option key={f.nombre} value={f.nombre}>
                  {f.nombre}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {/*
        LO QUE ACOMPAÑA A LOS BULTOS ENTEROS.

        «7 tambores y 10 L»: el octavo tambor está empezado y lo que queda se
        cuenta en litros. Solo aparece contando en bultos — en la unidad de
        operación no hay nada que acompañar, y un campo vacío de más es una
        pregunta que nadie tiene que contestar.
      */}
      {usandoPresentacion ? (
        <Input
          label={`Y además, sueltos en ${unidad}`}
          className="mt-2"
          type="number"
          min="0"
          step="0.0001"
          inputMode="decimal"
          disabled={disabled}
          value={suelto}
          onChange={(e) => escribirSuelto(e.target.value)}
          hint={`Lo que queda en el último ${presentacion.toLowerCase()} empezado. Déjalo vacío si están todos llenos.`}
        />
      ) : null}

      {/*
        La cuenta, cuando se está haciendo una. En el color del sistema y no en
        gris: es la línea que hay que leer antes de guardar.
      */}
      {equivale ? (
        <p className="text-royal-600 dark:text-royal-300 mt-1 text-xs">{equivale}</p>
      ) : convertible ? (
        <p className="text-ink/45 mt-1 text-xs">
          {formas
            .map((f) => `${f.por.toLocaleString('es-VE')} ${unidad} por ${f.nombre}`)
            .join(' · ')}
        </p>
      ) : null}
    </div>
  )
}
