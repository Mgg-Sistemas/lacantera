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

  LO QUE SALE DE AQUÍ SIEMPRE ESTÁ EN LA UNIDAD DEL ARTÍCULO.

  El que llama no se entera de nada: recibe litros, como antes. La presentación
  vive dentro de este componente y no se le escapa a nadie, que es lo que
  permite ponerlo en tres pantallas sin cambiar el estado de ninguna.

  Y LA CUENTA SE ENSEÑA MIENTRAS SE HACE.

  Debajo del campo, en grande y no en gris: «10 BULTO = 60 UND». Convertir por
  detrás sin decirlo cambia lo que se guarda sin que nadie lo vea, y una cifra
  de inventario que no es la que se tecleó no se descubre hasta que alguien
  cuenta el almacén. Si se enseña, se puede desmentir antes de guardar.

  El selector solo aparece si el artículo dice en qué viene y cuántas trae. Una
  barra de acero llega suelta: ahí esto es un campo de cantidad y nada más.
*/

interface Props {
  label?: string
  /** La cantidad, siempre en la unidad del artículo. */
  valor: string
  /** Devuelve la cantidad ya convertida a la unidad del artículo. */
  onCambiar: (enUnidades: string) => void
  articulo:
    | {
        unidad?: string | null
        presentacion?: string | null
        unidades_por_presentacion?: string | null
      }
    | undefined
    | null
  /** Lo que se dice cuando no hay artículo elegido todavía. */
  hintSinArticulo?: string
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
  className,
  required,
  disabled,
}: Props) {
  const unidad = articulo?.unidad ?? ''
  const presentacion = articulo?.presentacion ?? ''
  const porBulto = Number(articulo?.unidades_por_presentacion)
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

  const usandoPresentacion = convertible && enPresentacion

  const escribir = (crudo: string) => {
    setTecleado(crudo)
    if (!usandoPresentacion) {
      onCambiar(crudo)
      return
    }
    const n = Number(crudo)
    onCambiar(crudo === '' || !Number.isFinite(n) ? '' : String(n * porBulto))
  }

  const cambiarDeUnidad = (aPresentacion: boolean) => {
    setEnPresentacion(aPresentacion)
    // Lo ya escrito se conserva y se reexpresa: cambiar de unidad no es borrar.
    const enUnidades = Number(valor)
    if (!Number.isFinite(enUnidades) || valor === '') {
      setTecleado('')
      return
    }
    setTecleado(aPresentacion ? String(enUnidades / porBulto) : String(enUnidades))
  }

  const equivale =
    usandoPresentacion && valor !== '' && Number.isFinite(Number(valor))
      ? // Los dos lados con el formato de aquí. Sin esto la línea mezclaba
        // convenciones —«2.25 BIDON = 1.234,5 LTS»— y el punto de un lado
        // decía decimal mientras el del otro decía millar.
        `${Number(tecleado || 0).toLocaleString('es-VE', {
          maximumFractionDigits: 4,
        })} ${presentacion} = ${Number(valor).toLocaleString('es-VE', {
          maximumFractionDigits: 4,
        })} ${unidad}`
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
              : convertible
                ? undefined
                : unidad
                  ? `En ${unidad}`
                  : undefined
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
              value={enPresentacion ? 'P' : 'U'}
              onChange={(e) => cambiarDeUnidad(e.target.value === 'P')}
              /*
                Las mismas medidas que el `Select` de la casa —alto 10, borde
                `ink/20`, radio de control— para que la caja de al lado y esta
                midan igual. Con `py-2` el selector quedaba mas bajo que el
                campo y la fila se veia descuadrada; se comprobo en pantalla.
              */
              className="rounded-control bg-surface text-ink/90 border-ink/20 hover:border-ink/32 focus:border-royal-600 focus:ring-royal-600/20 h-10 appearance-none border pr-8 pl-3 text-base transition-[border-color,box-shadow] duration-150 focus:ring-2 focus:outline-none"
            >
              <option value="U">{unidad}</option>
              <option value="P">{presentacion}</option>
            </select>
          </label>
        ) : null}
      </div>

      {/*
        La cuenta, cuando se está haciendo una. En el color del sistema y no en
        gris: es la línea que hay que leer antes de guardar.
      */}
      {equivale ? (
        <p className="text-royal-600 dark:text-royal-300 mt-1 text-xs">{equivale}</p>
      ) : convertible ? (
        <p className="text-ink/45 mt-1 text-xs">
          {porBulto.toLocaleString('es-VE')} {unidad} por {presentacion}
        </p>
      ) : null}
    </div>
  )
}
