import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { usePresentacionesDeArticulo } from '@/lib/api/catalogo'
import { useReenvasar } from '@/lib/api/inventario'
import type { Existencia } from '@/lib/api/inventario'

/*
  CAMBIAR DE ENVASE SIN CAMBIAR DE CANTIDAD.

  Christopher: «¿qué pasa si el día de mañana se usan los galones o pailas para
  llenar un tambor para almacenar, o al contrario, vaciar parte de un tambor para
  llenar algunas pailas y así darle movilidad o salida más fácil para los
  operadores? (más fácil mover pailas que un tambor al final)».

  VA EN UN MODAL PROPIO Y NO EN EL DE SALIDAS, por la misma razón que el del
  taller: aquí no sale nada. Los litros son los mismos antes y después, y meterlo
  entre las salidas obligaría a explicar en cada renglón que ésta no resta.

  LA CUENTA SE ENSEÑA MIENTRAS SE TECLEA, y no es un adorno. La base rechaza el
  trasvase si las dos orillas no dan el mismo volumen —un tambor son 208 L, diez
  pailas y 18 sueltos también— así que enseñarlo aquí ahorra el viaje de guardar,
  leer el error y volver. Es la misma cuenta, hecha dos veces a propósito: la de
  aquí es cortesía, la que manda es la de la base.
*/

/** El valor del selector que significa «no es un envase, son unidades sueltas». */
const SUELTO = ''

const numero = (n: number) => n.toLocaleString('es-VE', { maximumFractionDigits: 4 })

export function ModalTrasvase({
  fila,
  onCerrar,
}: {
  fila: Existencia | null
  onCerrar: () => void
}) {
  const { data: formas } = usePresentacionesDeArticulo(fila?.articulo_id ?? null)
  const reenvasar = useReenvasar()

  const [desdeEnvase, setDesdeEnvase] = useState(SUELTO)
  const [desdeCuantos, setDesdeCuantos] = useState('')
  const [desdeSuelto, setDesdeSuelto] = useState('')
  const [haciaEnvase, setHaciaEnvase] = useState(SUELTO)
  const [haciaCuantos, setHaciaCuantos] = useState('')
  const [haciaSuelto, setHaciaSuelto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')

  const unidad = fila?.unidad ?? ''
  const activas = (formas ?? []).filter((p) => p.activa)
  const porEnvase = (codigo: string) =>
    Number(activas.find((p) => p.presentacion === codigo)?.unidades ?? 0)

  const cifra = (t: string) => {
    const n = Number(t.replace(',', '.'))
    return Number.isFinite(n) && n > 0 ? n : 0
  }

  /*
    Cada orilla en la unidad de operación. Con envase, los bultos por su factor
    más lo suelto; sin envase, la cifra ya viene en litros y no hay resto que
    añadir — el propio campo es el resto.
  */
  const volumen = (envase: string, cuantos: string, suelto: string) =>
    envase === SUELTO
      ? cifra(cuantos)
      : cifra(cuantos) * porEnvase(envase) + cifra(suelto)

  const volDesde = volumen(desdeEnvase, desdeCuantos, desdeSuelto)
  const volHacia = volumen(haciaEnvase, haciaCuantos, haciaSuelto)
  const cuadra = volDesde > 0 && Math.abs(volDesde - volHacia) <= 0.1
  const hay = Number(fila?.existencia ?? 0)

  const listo =
    cuadra &&
    desdeEnvase !== haciaEnvase &&
    volDesde <= hay + 0.0001 &&
    motivo.trim().length >= 4 &&
    !reenvasar.isPending

  const limpiar = () => {
    setDesdeEnvase(SUELTO)
    setDesdeCuantos('')
    setDesdeSuelto('')
    setHaciaEnvase(SUELTO)
    setHaciaCuantos('')
    setHaciaSuelto('')
    setMotivo('')
    setError('')
  }

  const guardar = async () => {
    if (!fila) return
    setError('')
    try {
      await reenvasar.mutateAsync({
        almacen_id: fila.almacen_id,
        articulo_id: fila.articulo_id,
        desde_presentacion: desdeEnvase === SUELTO ? null : desdeEnvase,
        desde_cantidad: desdeEnvase === SUELTO ? cifra(desdeCuantos) : cifra(desdeCuantos),
        desde_suelto: desdeEnvase === SUELTO ? 0 : cifra(desdeSuelto),
        hacia_presentacion: haciaEnvase === SUELTO ? null : haciaEnvase,
        hacia_cantidad: cifra(haciaCuantos),
        hacia_suelto: haciaEnvase === SUELTO ? 0 : cifra(haciaSuelto),
        motivo: motivo.trim(),
      })
      limpiar()
      onCerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  /* La lista de envases, más «suelto», que no es un envase pero es una orilla. */
  const opciones = [
    { valor: SUELTO, etiqueta: `Suelto, en ${unidad}` },
    ...activas.map((p) => ({
      valor: p.presentacion,
      etiqueta: `${p.presentacion} · ${numero(Number(p.unidades))} ${unidad}`,
    })),
  ]

  const orilla = (
    titulo: string,
    envase: string,
    setEnvase: (v: string) => void,
    cuantos: string,
    setCuantos: (v: string) => void,
    suelto: string,
    setSuelto: (v: string) => void,
    vol: number,
  ) => (
    <div className="border-hairline rounded-card border p-3">
      <p className="text-ink/45 text-2xs mb-2 tracking-wide uppercase">{titulo}</p>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem]">
        <Select
          label="Envase"
          value={envase}
          onChange={(e) => setEnvase(e.target.value)}
          opciones={opciones}
        />
        <Input
          label={envase === SUELTO ? unidad : 'Cuántos'}
          type="number"
          min="0"
          step={envase === SUELTO ? '0.0001' : '1'}
          inputMode="decimal"
          value={cuantos}
          onChange={(e) => setCuantos(e.target.value)}
        />
      </div>

      {/* El resto solo cuando hay envase: sin él, el campo de arriba ya es el
          resto y preguntar dos veces por lo mismo confunde. */}
      {envase !== SUELTO ? (
        <Input
          className="mt-2"
          label={`Y además, sueltos en ${unidad}`}
          type="number"
          min="0"
          step="0.0001"
          inputMode="decimal"
          value={suelto}
          onChange={(e) => setSuelto(e.target.value)}
        />
      ) : null}

      <p className="text-ink/50 mt-2 text-xs">
        {vol > 0 ? `Son ${numero(vol)} ${unidad}` : `Sin cantidad todavía`}
      </p>
    </div>
  )

  return (
    <Modal
      abierto={fila !== null}
      onCerrar={() => {
        limpiar()
        onCerrar()
      }}
      titulo="Cambiar de envase"
      descripcion={
        fila
          ? `${fila.articulo} en ${fila.almacen}. Los ${unidad} no cambian: cambia en qué están.`
          : undefined
      }
      ancho="lg"
      acciones={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              limpiar()
              onCerrar()
            }}
          >
            Cancelar
          </Button>
          <Button disabled={!listo} onClick={() => void guardar()}>
            {reenvasar.isPending ? 'Guardando…' : 'Anotar el cambio'}
          </Button>
        </>
      }
    >
      <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        {orilla(
          'De aquí sale',
          desdeEnvase,
          setDesdeEnvase,
          desdeCuantos,
          setDesdeCuantos,
          desdeSuelto,
          setDesdeSuelto,
          volDesde,
        )}

        <div className="text-ink/30 hidden self-center sm:block">
          <ArrowRight className="size-5" />
        </div>

        {orilla(
          'Y queda así',
          haciaEnvase,
          setHaciaEnvase,
          haciaCuantos,
          setHaciaCuantos,
          haciaSuelto,
          setHaciaSuelto,
          volHacia,
        )}
      </div>

      {/*
        LA CUENTA, QUE ES LA ÚNICA LÍNEA QUE HAY QUE LEER.

        Un trasvase no crea ni pierde material: si las dos orillas no dan lo
        mismo, o está mal contado o el factor del catálogo está mal. La base lo
        rechaza igual; esto es para verlo antes de pulsar.
      */}
      <div className="border-hairline mt-3 flex flex-wrap items-baseline justify-between gap-2 rounded-[6px] border p-3 text-sm">
        <span className="text-ink/70">
          {numero(volDesde)} {unidad} → {numero(volHacia)} {unidad}
        </span>
        <span
          className={
            volDesde === 0
              ? 'text-ink/45 text-xs'
              : cuadra
                ? 'text-success text-xs'
                : 'text-warning text-xs font-medium'
          }
        >
          {volDesde === 0
            ? 'Escribe cuánto sale de cada lado'
            : cuadra
              ? 'Cuadra'
              : `Faltan ${numero(Math.abs(volDesde - volHacia))} ${unidad} de un lado`}
        </span>
      </div>

      {volDesde > hay + 0.0001 ? (
        <p className="text-warning mt-2 text-xs">
          Aquí solo hay {numero(hay)} {unidad}.
        </p>
      ) : null}

      {desdeEnvase === haciaEnvase && volDesde > 0 ? (
        <p className="text-warning mt-2 text-xs">
          Las dos orillas son el mismo envase: eso no es un cambio.
        </p>
      ) : null}

      <Textarea
        className="mt-3"
        label="¿Por qué se cambia de envase?"
        placeholder="Para que los operadores puedan moverlo sin montacargas"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        rows={2}
        hint="Dentro de un año será lo único que lo explique."
      />

      {error ? <ErrorDeCarga error={new Error(error)} className="mt-3" /> : null}
    </Modal>
  )
}
