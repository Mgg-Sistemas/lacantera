import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

/*
  CONTAR UN ALMACÉN DONDE HAY DE TODO.

  Christopher, del ACEITE HIDRAULICO 68: «se entiende que hay 1 tambor, y
  aproximadamente 21 pailas (probablemente una de ellas no esté completa o esté
  usada)». Su cuenta daba 604 litros exactos, los mismos que el libro.

  Hasta hoy el conteo aceptaba UN tipo de envase más lo suelto, así que ese
  almacén no se podía anotar como es: había que elegir entre decir «2 tambores»
  o «31 pailas», y las dos eran falsas. Aquí se anotan las líneas que haya.

  ES EL ÚNICO MOMENTO EN QUE EL SISTEMA SABE CUÁNTOS ENVASES HAY, y por eso
  merece su propio formulario. El resto del tiempo el libro lleva litros y
  dividir por el factor da una suposición; aquí hay una persona delante del
  estante mirándolos. Lo que se teclee se guarda como hoja de conteo, con fecha,
  y dentro de un año seguirá diciendo qué se contó.

  LO SUELTO VA APARTE Y NO ES UNA LÍNEA MÁS: son los litros de la paila empezada,
  no un envase. Mezclarlo obligaría a inventar un envase «resto» que no existe.
*/

export interface LineaDeConteo {
  presentacion: string
  cantidad: string
}

const numero = (n: number) => n.toLocaleString('es-VE', { maximumFractionDigits: 4 })

/*
  Cuánto suman las líneas más lo suelto, en la unidad de operación.

  No se exporta: el total viaja por `onCambiar`, junto a lo que lo produjo. Así
  quien usa el componente no puede quedarse con un total calculado de otra
  manera que el que se está enseñando, que es como dos cifras que deberían ser
  la misma dejan de serlo.
*/
function totalContado(
  lineas: LineaDeConteo[],
  sueltos: string,
  formas: { presentacion: string; unidades: string | number }[],
): number {
  const porEnvase = new Map(formas.map((f) => [f.presentacion, Number(f.unidades)]))
  const bultos = lineas.reduce((suma, l) => {
    const por = porEnvase.get(l.presentacion) ?? 0
    const cuantos = Number(l.cantidad.replace(',', '.'))
    return suma + (Number.isFinite(cuantos) && cuantos > 0 ? cuantos * por : 0)
  }, 0)
  const resto = Number(sueltos.replace(',', '.'))
  return bultos + (Number.isFinite(resto) ? resto : 0)
}

export function ConteoDeEnvases({
  formas,
  unidad,
  existencia,
  lineas,
  sueltos,
  onCambiar,
}: {
  formas: { presentacion: string; unidades: string | number }[]
  unidad: string
  /** Lo que dice el libro, para enseñar la diferencia antes de guardar. */
  existencia: number
  lineas: LineaDeConteo[]
  sueltos: string
  /** Las líneas, lo suelto y lo que suman: las tres juntas, siempre. */
  onCambiar: (lineas: LineaDeConteo[], sueltos: string, total: number) => void
}) {
  const total = totalContado(lineas, sueltos, formas)
  const diferencia = total - existencia
  const usadas = new Set(lineas.map((l) => l.presentacion))
  const libres = formas.filter((f) => !usadas.has(f.presentacion))

  /* Un solo sitio donde se avisa, para que el total nunca salga de otra cuenta. */
  const avisar = (l: LineaDeConteo[], su: string) => onCambiar(l, su, totalContado(l, su, formas))

  const cambiarLinea = (i: number, parte: Partial<LineaDeConteo>) =>
    avisar(
      lineas.map((l, k) => (k === i ? { ...l, ...parte } : l)),
      sueltos,
    )

  return (
    <div className="border-hairline rounded-card bg-canvas border border-dashed p-3">
      <p className="text-ink/60 mb-3 text-xs leading-relaxed">
        Anota lo que ves en el estante, un renglón por tipo de envase. La cuenta la hace el sistema.
      </p>

      <div className="space-y-2">
        {lineas.map((l, i) => (
          <div key={i} className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_auto]">
            <Select
              label={i === 0 ? 'Envase' : ''}
              value={l.presentacion}
              onChange={(e) => cambiarLinea(i, { presentacion: e.target.value })}
              opciones={formas
                // La suya y las que nadie ha usado todavía: repetir un envase en
                // dos renglones es un despiste, no una forma de contar.
                .filter((f) => f.presentacion === l.presentacion || !usadas.has(f.presentacion))
                .map((f) => ({
                  valor: f.presentacion,
                  etiqueta: `${f.presentacion} · ${numero(Number(f.unidades))} ${unidad}`,
                }))}
            />
            <Input
              label={i === 0 ? 'Cuántos' : ''}
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={l.cantidad}
              onChange={(e) => cambiarLinea(i, { cantidad: e.target.value })}
            />
            <Button
              variant="ghost"
              icon={<Trash2 />}
              disabled={lineas.length === 1}
              onClick={() =>
                avisar(
                  lineas.filter((_, k) => k !== i),
                  sueltos,
                )
              }
            >
              <span className="sr-only">Quitar este renglón</span>
            </Button>
          </div>
        ))}
      </div>

      {libres.length > 0 ? (
        <Button
          className="mt-2"
          size="sm"
          variant="ghost"
          icon={<Plus />}
          onClick={() =>
            avisar([...lineas, { presentacion: libres[0].presentacion, cantidad: '' }], sueltos)
          }
        >
          Añadir otro envase
        </Button>
      ) : null}

      {/*
        LO SUELTO, QUE NO ES UN ENVASE.

        Los litros de la paila empezada. Van aparte porque no son un envase que
        se pueda contar: son lo que queda dentro de uno.
      */}
      <div className="mt-3">
        <Input
          label={`Y además, sueltos en ${unidad}`}
          type="number"
          min="0"
          step="0.0001"
          inputMode="decimal"
          value={sueltos}
          onChange={(e) => avisar(lineas, e.target.value)}
          hint={`Lo que quede dentro del envase empezado. Déjalo vacío si están todos llenos.`}
        />
      </div>

      {/*
        LA CUENTA Y LA DIFERENCIA, ANTES DE GUARDAR.

        Es lo único que hay que leer: si la diferencia no es cero, el conteo va a
        mover el libro, y conviene verlo ahora y no en el asiento.
      */}
      <div className="border-hairline mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t pt-3 text-sm">
        <span className="text-ink/70">
          Contado: <span className="text-ink/90 tabular font-semibold">{numero(total)}</span>{' '}
          {unidad}
        </span>
        <span
          className={
            Math.abs(diferencia) < 0.0001
              ? 'text-success text-xs'
              : 'text-warning text-xs font-medium'
          }
        >
          {Math.abs(diferencia) < 0.0001
            ? 'Cuadra con el sistema'
            : `${diferencia > 0 ? 'Sobran' : 'Faltan'} ${numero(Math.abs(diferencia))} ${unidad}`}
        </span>
      </div>
    </div>
  )
}
