import { useState } from 'react'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'

/*
  UN COSTO QUE SE PUEDE TECLEAR COMO VIENE EN LA FACTURA O COMO SE USA.

  Es el gemelo de `CantidadDeArticulo`, y existe porque faltaba justo la otra
  mitad. El almacén ya podía teclear «3 tambores» y el sistema dejaba 624 litros
  en la existencia, enseñando la cuenta. Pero el campo de al lado seguía pidiendo
  el costo por litro, sin decirlo, mientras la persona seguía pensando en
  tambores.

  Lo levantó Christopher el 7 de septiembre de 2026: «el usuario puede estar
  ingresando el valor del tambor y el sistema puede estar entendiendo que ese
  valor se debe aplicar a operación». Tenía razón, y la pantalla lo invitaba: un
  formulario que te deja pensar en bultos para una casilla y cambia a litros en
  la siguiente, en silencio.

  EL PRECIO DIVIDE DONDE LA CANTIDAD MULTIPLICA

  Es la única diferencia de fondo con su gemelo, y es la que hace que este
  componente no se pueda escribir copiando aquél:

      3 TAMBOR              × 208  =  624 L          la cantidad sube
      1.632,52 $/TAMBOR     ÷ 208  =  7,85 $/L       el precio baja

  Confundir el sentido de esa operación es exactamente el error que esto viene a
  evitar, así que la cuenta se enseña siempre, con los dos lados escritos.

  LO QUE SALE DE AQUÍ SIEMPRE ESTÁ POR UNIDAD DEL ARTÍCULO

  Igual que en la cantidad: el que llama recibe el costo por litro, como antes.
  La presentación vive dentro y no se le escapa a nadie.

  Y SOLO APARECE SI EL ARTÍCULO DICE EN QUÉ VIENE

  El día que se escribió, 14 de los 15 artículos del catálogo no declaraban
  presentación —los cinco aceites entre ellos, pese a haber entrado en múltiplos
  exactos de 208—. Sin eso esto es un campo de costo y nada más, que es lo que
  había. El componente no sustituye a llenar el catálogo: lo aprovecha.
*/

interface Props {
  /** El costo, siempre por unidad del artículo. */
  valor: string
  /** Devuelve el costo ya convertido a la unidad del artículo. */
  onCambiar: (porUnidad: string) => void
  articulo:
    | {
        unidad?: string | null
        presentacion?: string | null
        unidades_por_presentacion?: string | null
      }
    | undefined
    | null
  /** El código de la moneda elegida, para escribirlo en la cuenta. */
  moneda?: string
  className?: string
  required?: boolean
  disabled?: boolean
}

export function CostoDeArticulo({
  valor,
  onCambiar,
  articulo,
  moneda = '',
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
    Lo tecleado se guarda aparte de lo calculado, por lo mismo que en la
    cantidad: si el campo mostrara siempre `valor * porBulto`, con un factor que
    no divide exacto el número bailaría bajo los dedos mientras se escribe.
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
    // Aquí se DIVIDE. Es el precio del bulto repartido entre lo que trae.
    onCambiar(crudo === '' || !Number.isFinite(n) ? '' : String(n / porBulto))
  }

  const cambiarDeUnidad = (aPresentacion: boolean) => {
    setEnPresentacion(aPresentacion)
    // Lo ya escrito se conserva y se reexpresa: cambiar de unidad no es borrar.
    const porUnidad = Number(valor)
    if (!Number.isFinite(porUnidad) || valor === '') {
      setTecleado('')
      return
    }
    setTecleado(aPresentacion ? String(porUnidad * porBulto) : String(porUnidad))
  }

  const n = (x: number, dec = 4) => x.toLocaleString('es-VE', { maximumFractionDigits: dec })

  const equivale =
    usandoPresentacion && valor !== '' && Number.isFinite(Number(valor))
      ? `${n(Number(tecleado || 0))} ${moneda} por ${presentacion} = ${n(Number(valor))} ${moneda} por ${unidad}`
      : null

  return (
    <div className={className}>
      <div className={cn('grid gap-2', convertible && 'grid-cols-[1fr_auto]')}>
        <Input
          label={`Costo por ${usandoPresentacion ? presentacion : unidad || 'unidad'}`}
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
              ? 'Elige antes el artículo'
              : convertible
                ? undefined
                : unidad
                  ? `Lo que costó cada ${unidad}, en la moneda en que se pagó.`
                  : 'Lo que costó, en la moneda en que se pagó.'
          }
        />

        {/*
          El selector espeja al de la cantidad hasta en las medidas, porque los
          dos van en la misma fila y descuadrarlos se nota. Ver el comentario de
          `CantidadDeArticulo` para el porqué de no usar el `Select` de la casa.
        */}
        {convertible ? (
          <label className="self-end">
            <span className="sr-only">En qué se teclea el costo</span>
            <select
              disabled={disabled}
              value={enPresentacion ? 'P' : 'U'}
              onChange={(e) => cambiarDeUnidad(e.target.value === 'P')}
              className="rounded-control bg-surface text-ink/90 border-ink/20 hover:border-ink/32 focus:border-royal-600 focus:ring-royal-600/20 h-10 appearance-none border pr-8 pl-3 text-base transition-[border-color,box-shadow] duration-150 focus:ring-2 focus:outline-none"
            >
              <option value="U">por {unidad}</option>
              <option value="P">por {presentacion}</option>
            </select>
          </label>
        ) : null}
      </div>

      {/*
        La cuenta, cuando se está haciendo una. En el color del sistema y no en
        gris: es la línea que hay que leer antes de guardar.

        Y cuando no se está convirtiendo pero el artículo TIENE presentación, se
        recuerda igual la equivalencia. Ahí es donde nace la confusión: quien ve
        «Costo por L» después de haber tecleado tambores necesita que algo le
        diga cuántos litros trae un tambor.
      */}
      {equivale ? (
        <p className="text-royal-600 dark:text-royal-300 mt-1 text-xs">{equivale}</p>
      ) : convertible ? (
        <p className="text-ink/45 mt-1 text-xs">
          Por {unidad}, no por {presentacion} · 1 {presentacion} = {n(porBulto, 2)} {unidad}
        </p>
      ) : null}
    </div>
  )
}
