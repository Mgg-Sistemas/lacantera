import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { HardHat, PackageCheck, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import {
  useDotacionDeCargos,
  useDotacionPendiente,
  useGuardarDotacionDeCargo,
  useQuitarDotacionDeCargo,
  type DotacionPendiente,
} from '@/lib/api/asignaciones'
import { useTabulador } from '@/lib/api/tabulador'
import { useEmpleados } from '@/lib/api/nomina'
import { useArticulos, useMisRoles } from '@/lib/api/catalogo'
import { fecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

/**
 * Qué le toca a cada cargo, y a quién le toca ahora.
 *
 * DOS PREGUNTAS DISTINTAS EN UNA PANTALLA
 *
 * Arriba, la regla: al de patio le tocan dos pares de botas cada seis meses.
 * Abajo, la consecuencia: a estos nueve les toca hoy. Separarlas en dos
 * pantallas obligaría a ir y volver para entender por qué aparece alguien en la
 * lista, que es justo lo que hace que una lista de pendientes se ignore.
 *
 * POR QUÉ «NUNCA» Y «VENCIDA» NO SE PINTAN IGUAL
 *
 * Las dos piden entregar, pero no dicen lo mismo. A quien nunca recibió las
 * botas hay que dárselas por primera vez, y eso normalmente quiere decir que
 * entró hace poco. A quien se le pasó la fecha se le debía algo. Pintarlas del
 * mismo color convierte a los recién llegados en una lista de descuidos.
 */
export function Dotacion() {
  const { data: reglas, isPending, error } = useDotacionDeCargos()
  const pendiente = useDotacionPendiente()
  const { data: tabulador } = useTabulador()
  const { data: articulos } = useArticulos()
  const quitar = useQuitarDotacionDeCargo()

  const { data: roles } = useMisRoles()
  const puedeMover = (roles ?? []).some((r) => r === 'ADMIN' || r === 'ALMACEN')

  const [nueva, setNueva] = useState(false)
  const [entregando, setEntregando] = useState(false)

  const articuloDe = (id: number) => (articulos ?? []).find((a) => a.id === id)

  /* Las reglas, agrupadas por cargo: es como se leen y como se deciden. */
  const porCargo = (tabulador ?? [])
    .map((t) => ({ cargo: t, lineas: (reglas ?? []).filter((r) => r.tabulador_id === t.id) }))
    .filter((g) => g.lineas.length > 0)

  const porEntregar = (pendiente.data ?? []).filter(
    (d) => d.situacion === 'NUNCA' || d.situacion === 'VENCIDA',
  )

  /*
    LO QUE LE FALTA A UNA PERSONA, NO LO QUE LE FALTA EN ESE RENGLÓN.

    Quien viene al almacén se lleva de una vez todo lo que se le debe. Entregar
    renglón a renglón serían tres viajes y tres firmas para lo mismo.
  */
  const pendienteDe = (empleadoId: number) =>
    porEntregar.filter((d) => d.empleado_id === empleadoId)

  return (
    <>
      <PageHeader
        title="Dotación por cargo"
        description="Qué le corresponde a cada puesto y cada cuánto se repone. De aquí sale la lista de a quién le toca hoy."
        actions={
          puedeMover ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" icon={<PackageCheck />} onClick={() => setEntregando(true)}>
                Entregar a alguien
              </Button>
              <Button icon={<Plus />} onClick={() => setNueva(true)}>
                Añadir
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* -------------------------------------------------- a quién le toca */}
      <Card className="mb-4">
        <CardHeader
          title="A quién le toca ahora"
          subtitle={
            porEntregar.length === 0
              ? 'A nadie: todo el mundo está al día.'
              : `${porEntregar.length} entrega${porEntregar.length === 1 ? '' : 's'} pendiente${porEntregar.length === 1 ? '' : 's'}`
          }
        />

        {pendiente.isPending ? <Cargando /> : null}
        {pendiente.error ? <ErrorDeCarga error={pendiente.error} className="mt-3" /> : null}

        {!pendiente.isPending && porEntregar.length === 0 ? (
          <p className="text-ink/50 mt-4 text-sm">
            {(reglas ?? []).length === 0
              ? 'Todavía no hay ninguna dotación definida, así que no hay nada que reclamar. Empieza por decir qué le toca a cada cargo.'
              : 'Nadie tiene dotación pendiente ahora mismo.'}
          </p>
        ) : null}

        {porEntregar.length > 0 ? (
          <ul className="divide-hairline mt-3 divide-y">
            {porEntregar.map((d) => (
              <FilaPendiente
                key={`${d.empleado_id}-${d.dotacion_id}`}
                d={d}
                puedeMover={puedeMover}
                pendienteSuyo={pendienteDe(d.empleado_id)}
              />
            ))}
          </ul>
        ) : null}
      </Card>

      {/* ------------------------------------------------------- las reglas */}
      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {!isPending && porCargo.length === 0 ? (
        <Card>
          <Vacio
            icono={<HardHat />}
            titulo="Ningún cargo tiene dotación definida"
            descripcion="Se declara una vez por puesto —dos pares de botas cada seis meses al de patio— y a partir de ahí el sistema dice a quién le toca sin que nadie lleve la cuenta."
          />
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {porCargo.map((g) => (
          <Card key={g.cargo.id}>
            <div>
              <p className="text-ink/90 text-sm font-semibold">{g.cargo.cargo}</p>
              <p className="text-ink/45 text-xs">
                {g.cargo.personas} persona{g.cargo.personas === 1 ? '' : 's'} en este cargo
              </p>
            </div>

            <ul className="divide-hairline mt-3 divide-y">
              {g.lineas.map((l) => {
                const art = articuloDe(l.articulo_id)
                return (
                  <li key={l.id} className="flex items-center gap-2 py-2.5">
                    <div className="min-w-0 grow">
                      <p className="text-ink/85 text-sm">
                        <span className="tabular font-medium">{l.cantidad}</span>{' '}
                        {art?.unidad ?? ''} de {art?.nombre ?? `artículo ${l.articulo_id}`}
                      </p>
                      <p className="text-ink/45 text-xs">
                        {l.cada_meses
                          ? `Se repone cada ${l.cada_meses} ${l.cada_meses === 1 ? 'mes' : 'meses'}`
                          : 'Se entrega una vez y no se repone'}
                        {l.nota ? ` · ${l.nota}` : ''}
                      </p>
                    </div>

                    {puedeMover ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 />}
                        aria-label="Quitar de la dotación"
                        onClick={() => void quitar.mutateAsync({ id: l.id })}
                      />
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </Card>
        ))}
      </div>

      {quitar.error ? <ErrorDeCarga error={quitar.error} className="mt-3" /> : null}

      <ModalDotacion abierto={nueva} onCerrar={() => setNueva(false)} />

      <ModalEntregarA
        abierto={entregando}
        onCerrar={() => setEntregando(false)}
        pendientes={porEntregar}
      />
    </>
  )
}

/** Una persona a la que le toca algo, con por qué le toca. */
function FilaPendiente({
  d,
  puedeMover,
  pendienteSuyo,
}: {
  d: DotacionPendiente
  puedeMover: boolean
  /** Todo lo que se le debe a esta persona, no solo lo de este renglón. */
  pendienteSuyo: DotacionPendiente[]
}) {
  const navegar = useNavigate()
  const nunca = d.situacion === 'NUNCA'

  return (
    <li className="flex flex-wrap items-center gap-2 py-2.5">
      <div className="min-w-0 grow">
        <p className="text-ink/85 text-sm">
          <span className="font-medium">{d.empleado}</span>
          <span className="text-ink/45"> · ficha {d.ficha}</span>
        </p>
        <p className="text-ink/45 text-xs">
          <span className="tabular">{d.cantidad}</span> {d.unidad} de {d.articulo} ·{' '}
          {d.cargo_tabulador}
          {d.ultima_entrega ? ` · la última fue el ${fecha(d.ultima_entrega)}` : ''}
        </p>
      </div>

      {/*
        El tono separa «no se le ha dado nunca» de «se le pasó la fecha». La
        primera suele ser gente que acaba de entrar; teñirla de rojo haría que
        la lista se leyera como una lista de descuidos.
      */}
      <Chip tone={nunca ? 'neutral' : 'warning'}>
        {nunca ? 'Nunca se le dio' : `Venció el ${fecha(d.toca_el!)}`}
      </Chip>

      {/*
        El botón se lleva a la persona y TODO lo que se le debe, no solo el
        renglón que se pulsó. Y solo aparece una vez por persona —en su primer
        renglón—, porque tres botones iguales en tres renglones seguidos hacen
        pensar que entregan cosas distintas.
      */}
      {puedeMover && pendienteSuyo[0]?.dotacion_id === d.dotacion_id ? (
        <Button
          size="sm"
          variant="soft"
          onClick={() => navegar(direccionDeEntrega(d.empleado_id, pendienteSuyo))}
        >
          Entregar{pendienteSuyo.length > 1 ? ` las ${pendienteSuyo.length}` : ''}
        </Button>
      ) : null}
    </li>
  )
}

/**
 * La dirección de la pantalla de entrega, con la persona y lo suyo ya puestos.
 *
 * `pide` es artículo y cantidad. La pantalla de entrega lo aplica cuando se
 * elige el almacén, y avisa de lo que no haya allí.
 */
function direccionDeEntrega(
  empleadoId: number,
  lineas: Array<{ articulo_id: number; cantidad: string | number }>,
): string {
  const pide = lineas.map((l) => `${l.articulo_id}:${Number(l.cantidad)}`).join(',')
  return `/app/asignaciones/entregar?empleado=${empleadoId}&clase=DOTACION&pide=${pide}`
}

/**
 * Elegir a quién dotar, con el cargo de filtro.
 *
 * POR QUÉ AQUÍ Y NO SOLO EN LA FICHA DEL TRABAJADOR
 *
 * La entrega por lista —«a estos nueve les toca hoy»— sirve cuando se va por
 * la lista. Pero quien llega al almacén es una persona: se le rompieron las
 * botas, entró ayer, viene por lo suyo. Buscarla pasando por Nómina para
 * volver a Asignaciones es dar la vuelta a la manzana.
 *
 * EL CARGO ES UN FILTRO, NO UN DATO QUE SE GUARDE
 *
 * Está para acortar la lista —«los de patio»— cuando se sabe el puesto y no el
 * nombre. Se puede dejar en blanco y buscar por nombre directamente; lo que se
 * entrega sale de la persona, no del filtro.
 */
function ModalEntregarA({
  abierto,
  onCerrar,
  pendientes,
}: {
  abierto: boolean
  onCerrar: () => void
  pendientes: DotacionPendiente[]
}) {
  const navegar = useNavigate()
  const { data: tabulador } = useTabulador()
  const { data: empleados } = useEmpleados(true)
  const { data: reglas } = useDotacionDeCargos()
  const { data: articulos } = useArticulos()

  const [cargo, setCargo] = useState('')
  const [empleado, setEmpleado] = useState('')

  const gente = useMemo(() => {
    const lista = empleados ?? []
    return cargo ? lista.filter((e) => String(e.tabulador_id) === cargo) : lista
  }, [empleados, cargo])

  const elegido = (empleados ?? []).find((e) => String(e.id) === empleado)

  /*
    Lo que se le va a entregar: lo que se le DEBE, si se le debe algo.

    Si está al día, se ofrece lo que su cargo dice entero — que es el caso de
    unas botas rotas antes de tiempo. Lo uno y lo otro se dicen, para que nadie
    entregue de más creyendo que iba tocando.
  */
  const suyoPendiente = pendientes.filter((p) => String(p.empleado_id) === empleado)
  const suCargo = (reglas ?? []).filter(
    (r) => elegido?.tabulador_id != null && r.tabulador_id === elegido.tabulador_id,
  )
  const aEntregar = suyoPendiente.length > 0 ? suyoPendiente : suCargo

  const nombreDe = (id: number) => (articulos ?? []).find((a) => a.id === id)?.nombre ?? '—'

  const cerrar = () => {
    setCargo('')
    setEmpleado('')
    onCerrar()
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={cerrar}
      titulo="Entregarle la dotación a alguien"
      descripcion="El cargo es solo para encontrarlo más rápido. Lo que se entrega sale de la persona."
      acciones={
        <>
          <Button variant="ghost" onClick={cerrar}>
            Cancelar
          </Button>
          <Button
            disabled={!empleado || aEntregar.length === 0}
            onClick={() => {
              navegar(direccionDeEntrega(Number(empleado), aEntregar))
              cerrar()
            }}
          >
            Continuar
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Select
          label="Cargo"
          hint="Para acortar la lista. Se puede dejar en blanco."
          value={cargo}
          onChange={(e) => {
            setCargo(e.target.value)
            setEmpleado('')
          }}
          opciones={[
            { valor: '', etiqueta: 'Todos los cargos' },
            ...(tabulador ?? []).map((t) => ({
              valor: String(t.id),
              etiqueta: `${t.cargo} · ${t.personas} persona${t.personas === 1 ? '' : 's'}`,
            })),
          ]}
        />

        <SelectBuscable
          label="A quién"
          vacio={gente.length === 0 ? 'Nadie con ese cargo' : 'Elige el trabajador'}
          valor={empleado}
          onCambio={setEmpleado}
          opciones={gente.map((e) => ({
            valor: String(e.id),
            etiqueta: `${e.nombres} ${e.apellidos} · ficha ${e.ficha}`,
          }))}
        />

        {elegido && elegido.tabulador_id == null ? (
          <p className="border-warning/30 bg-warning-soft text-ink/75 rounded-[6px] border p-3 text-sm leading-relaxed">
            Esta persona no tiene un cargo del tabulador en su ficha, así que el sistema no sabe qué
            le toca. Se le puede entregar igual desde <strong>Quién tiene qué</strong>, eligiendo a
            mano lo que se lleva.
          </p>
        ) : null}

        {empleado && aEntregar.length > 0 ? (
          <div className="border-hairline rounded-card border p-3">
            <p className="text-ink/45 text-xs">
              {suyoPendiente.length > 0
                ? 'Lo que se le debe ahora mismo'
                : 'Está al día. Esto es lo que su cargo dice, por si hay que reponerle algo'}
            </p>
            <ul className="mt-1.5 space-y-1">
              {aEntregar.map((l) => (
                <li key={l.articulo_id} className="text-ink/80 text-sm">
                  <span className="tabular">{Number(l.cantidad)}</span> ·{' '}
                  {nombreDe(l.articulo_id)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {empleado && aEntregar.length === 0 && elegido?.tabulador_id != null ? (
          <p className="text-ink/55 text-sm leading-relaxed">
            A su cargo no se le ha definido ninguna dotación, así que no hay nada que proponer.
            Defínela arriba con <strong>Añadir</strong>, o entrégale a mano desde{' '}
            <strong>Quién tiene qué</strong>.
          </p>
        ) : null}
      </div>
    </Modal>
  )
}

/** Declarar qué le toca a un cargo. */
function ModalDotacion({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const guardar = useGuardarDotacionDeCargo()
  const { data: tabulador } = useTabulador()
  const { data: articulos } = useArticulos()

  const [cargo, setCargo] = useState('')
  const [articulo, setArticulo] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [repone, setRepone] = useState('6')
  const [seRepone, setSeRepone] = useState(true)
  const [nota, setNota] = useState('')

  const valido = cargo !== '' && articulo !== '' && Number(cantidad) > 0

  const enviar = async () => {
    await guardar.mutateAsync({
      tabulador_id: Number(cargo),
      articulo_id: Number(articulo),
      cantidad: Number(cantidad),
      cada_meses: seRepone ? Number(repone) : null,
      nota: nota.trim() || null,
    })
    setArticulo('')
    setCantidad('1')
    setNota('')
    onCerrar()
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Qué le toca a este cargo"
      descripcion="Se declara una vez y vale para todos los que tengan ese puesto, incluidos los que entren después."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={!valido || guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Select
          label="Cargo"
          value={cargo}
          onChange={(e) => setCargo(e.target.value)}
          opciones={[
            { valor: '', etiqueta: 'Elegir cargo' },
            ...(tabulador ?? [])
              .filter((t) => t.activo)
              .map((t) => ({
                valor: String(t.id),
                etiqueta: `${t.cargo} · ${t.personas} persona${t.personas === 1 ? '' : 's'}`,
              })),
          ]}
          hint="Sale del tabulador, que es el catálogo de cargos de verdad."
        />

        <SelectBuscable
          label="Qué se le entrega"
          vacio="Elegir artículo"
          valor={articulo}
          onCambio={(v) => setArticulo(v)}
          opciones={(articulos ?? []).map((a) => ({
            valor: String(a.id),
            etiqueta: `${a.nombre} · ${a.codigo}`,
          }))}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Cuántas"
            type="number"
            min="0"
            step="0.01"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
          />

          <Input
            label="Se repone cada (meses)"
            type="number"
            min="1"
            step="1"
            value={repone}
            disabled={!seRepone}
            onChange={(e) => setRepone(e.target.value)}
          />
        </div>

        {/*
          Hay cosas que no se reponen: la llave del casillero se entrega una vez
          y ya. Sin esta casilla habría que escribir un número enorme para decir
          «nunca», y ese número acabaría sonando un día.
        */}
        <label
          className={cn(
            'flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm',
            seRepone ? 'border-hairline' : 'border-royal-600 bg-royal-600/5',
          )}
        >
          <input
            type="checkbox"
            checked={!seRepone}
            onChange={(e) => setSeRepone(!e.target.checked)}
            className="accent-royal-600 mt-0.5 size-4 shrink-0"
          />
          <span className="text-ink/80">
            Se entrega una vez y no se repone
            <span className="text-ink/50 mt-0.5 block text-xs">
              Para lo que no caduca: una llave, un candado, un casillero.
            </span>
          </span>
        </label>

        <Textarea label="Nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
      </div>

      {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-4" /> : null}
    </Modal>
  )
}
