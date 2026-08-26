import { useState } from 'react'
import { HardHat, Plus, Trash2 } from 'lucide-react'
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

  const articuloDe = (id: number) => (articulos ?? []).find((a) => a.id === id)

  /* Las reglas, agrupadas por cargo: es como se leen y como se deciden. */
  const porCargo = (tabulador ?? [])
    .map((t) => ({ cargo: t, lineas: (reglas ?? []).filter((r) => r.tabulador_id === t.id) }))
    .filter((g) => g.lineas.length > 0)

  const porEntregar = (pendiente.data ?? []).filter(
    (d) => d.situacion === 'NUNCA' || d.situacion === 'VENCIDA',
  )

  return (
    <>
      <PageHeader
        title="Dotación por cargo"
        description="Qué le corresponde a cada puesto y cada cuánto se repone. De aquí sale la lista de a quién le toca hoy."
        actions={
          puedeMover ? (
            <Button icon={<Plus />} onClick={() => setNueva(true)}>
              Añadir
            </Button>
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
              <FilaPendiente key={`${d.empleado_id}-${d.dotacion_id}`} d={d} />
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
    </>
  )
}

/** Una persona a la que le toca algo, con por qué le toca. */
function FilaPendiente({ d }: { d: DotacionPendiente }) {
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
    </li>
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
