import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, Move, X, Check, Users, Building2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { cn } from '@/lib/cn'
import { useMisPermisos } from '@/lib/api/usuarios'
import {
  armarArbol,
  useOrganigrama,
  useGuardarNodo,
  useMoverNodo,
  useEliminarNodo,
  useDepartamentosDeNomina,
} from '@/lib/api/organigrama'
import type { NodoOrganigrama, RamaOrganigrama, TipoDeNodo } from '@/lib/api/organigrama'

/*
  EL ORGANIGRAMA, DIBUJADO

  Se pinta como árbol anidado con un riel a la izquierda, y no como las cajas
  con líneas del papel. El dibujo de cajas se lee bien en una hoja A4 y se
  vuelve ilegible en un teléfono: o se encoge hasta no leerse, o se sale por un
  lado. El árbol anidado dice exactamente lo mismo —quién depende de quién— y
  cabe en cualquier ancho.

  Se edita en el sitio, sin modales: quien pulsa «editar» ve la fila
  convertirse en un formulario donde estaba. Para mover un puesto hay una lista
  buscadora de destinos en vez de arrastrar, porque arrastrar en un teléfono es
  un ejercicio de puntería.
*/

interface Edicion {
  id: number | null
  padre_id: number | null
  nombre: string
  titular: string
  tipo: TipoDeNodo
  cuantos: string
  departamento: string
  nota: string
}

const EN_BLANCO = (padre_id: number | null): Edicion => ({
  id: null,
  padre_id,
  nombre: '',
  titular: '',
  tipo: 'CARGO',
  cuantos: '1',
  departamento: '',
  nota: '',
})

const deNodo = (n: NodoOrganigrama): Edicion => ({
  id: n.id,
  padre_id: n.padre_id,
  nombre: n.nombre,
  titular: n.titular ?? '',
  tipo: n.tipo,
  cuantos: String(n.cuantos),
  departamento: n.departamento ?? '',
  nota: n.nota ?? '',
})

export function Organigrama() {
  const { data: nodos, isPending, error } = useOrganigrama()
  const departamentos = useDepartamentosDeNomina()
  const guardar = useGuardarNodo()
  const mover = useMoverNodo()
  const eliminar = useEliminarNodo()
  const { puede } = useMisPermisos()
  const puedeEditar = puede('NOMINA', 'ESCRITURA')

  const [edicion, setEdicion] = useState<Edicion | null>(null)
  const [moviendo, setMoviendo] = useState<number | null>(null)

  const arbol = useMemo(() => armarArbol(nodos ?? []), [nodos])
  const ocupado = guardar.isPending || mover.isPending || eliminar.isPending

  const previstos = (nodos ?? []).reduce((t, n) => t + n.cuantos, 0)
  const enNomina = departamentos.data?.activos ?? 0
  const sinDepartamento = departamentos.data?.sinDepartamento ?? 0
  const sinEnlazar = useMemo(() => {
    const usados = new Set(
      (nodos ?? []).map((n) => (n.departamento ?? '').toUpperCase()).filter(Boolean),
    )
    return (departamentos.data?.lista ?? []).filter(
      (d) => !usados.has(d.departamento.toUpperCase()),
    )
  }, [nodos, departamentos.data])

  if (isPending) return <Cargando texto="Cargando el organigrama…" />
  if (error) return <ErrorDeCarga error={error} />

  async function guardarEdicion() {
    if (!edicion) return
    await guardar.mutateAsync({
      id: edicion.id,
      padre_id: edicion.padre_id,
      nombre: edicion.nombre,
      titular: edicion.titular || null,
      tipo: edicion.tipo,
      cuantos: Number(edicion.cuantos) || 0,
      departamento: edicion.departamento || null,
      nota: edicion.nota || null,
    })
    setEdicion(null)
  }

  return (
    <>
      <PageHeader
        eyebrow="Organización"
        title="Organigrama"
        description="Quién depende de quién, y cuánta gente hay prevista en cada puesto."
      />

      {/* ------------------------------ De un vistazo ----------------------------- */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-ink/45 text-xs">Prevista en el organigrama</p>
          <p className="text-ink/90 tabular mt-1 text-2xl font-semibold">{previstos}</p>
          <p className="text-ink/45 mt-1 text-xs">personas</p>
        </Card>
        <Card>
          <p className="text-ink/45 text-xs">Registrada en nómina</p>
          <p className="text-ink/90 tabular mt-1 text-2xl font-semibold">{enNomina}</p>
          <p className="text-ink/45 mt-1 text-xs">
            {enNomina === previstos
              ? 'cuadra'
              : `${Math.abs(previstos - enNomina)} de diferencia`}
            {sinDepartamento > 0
              ? ` · ${sinDepartamento} sin departamento escrito`
              : ''}
          </p>
        </Card>
        <Card>
          <p className="text-ink/45 text-xs">Departamentos sin sitio</p>
          <p className="text-ink/90 tabular mt-1 text-2xl font-semibold">{sinEnlazar.length}</p>
          <p className="text-ink/45 mt-1 text-xs">
            {sinEnlazar.length === 0
              ? 'todos colocados'
              : sinEnlazar.map((d) => `${d.departamento} (${d.personas})`).join(' · ')}
          </p>
        </Card>
      </div>

      {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-4" /> : null}
      {mover.error ? <ErrorDeCarga error={mover.error} className="mt-4" /> : null}
      {eliminar.error ? <ErrorDeCarga error={eliminar.error} className="mt-4" /> : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_290px]">
        {/* ---------------------------------- El árbol --------------------------------- */}
        <Card flush>
          <div className="px-5 pt-5 pb-2">
            <CardHeader
              title="La estructura"
              subtitle="Cada sangría es un escalón de dependencia."
            />
          </div>

          <div className="px-5 pb-5">
            {arbol.map((raiz) => (
              <Rama
                key={raiz.id}
                rama={raiz}
                nodos={nodos ?? []}
                puedeEditar={puedeEditar}
                ocupado={ocupado}
                edicion={edicion}
                setEdicion={setEdicion}
                moviendo={moviendo}
                setMoviendo={setMoviendo}
                onGuardar={guardarEdicion}
                onMover={async (id, padre_id) => {
                  await mover.mutateAsync({ id, padre_id })
                  setMoviendo(null)
                }}
                onEliminar={(id) => void eliminar.mutate({ id })}
                departamentos={departamentos.data?.lista ?? []}
              />
            ))}
          </div>
        </Card>

        {/* --------------------------------- La leyenda -------------------------------- */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Cómo se lee" />
            <ul className="mt-3 space-y-2.5 text-sm">
              <li className="flex items-start gap-2">
                <Chip tone="royal" icon={<Building2 className="size-3" />}>
                  Unidad
                </Chip>
                <span className="text-ink/60 text-xs">
                  Una dependencia: Administración, Cocina, Operaciones.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Chip tone="neutral" icon={<Users className="size-3" />}>
                  Cargo
                </Chip>
                <span className="text-ink/60 text-xs">
                  Un puesto con su gente: «Cocineros (2)».
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Chip tone="success">3</Chip>
                <span className="text-ink/60 text-xs">
                  La nómina tiene esa gente registrada en el departamento enlazado.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Chip tone="warning">3 ≠ 5</Chip>
                <span className="text-ink/60 text-xs">
                  La nómina no coincide con lo previsto. No es un error del sistema: es lo
                  que hay que cuadrar.
                </span>
              </li>
            </ul>
          </Card>

          <Card>
            <CardHeader
              title="Sobre las cifras"
              subtitle="Son dos, y no tienen por qué coincidir todavía."
            />
            <p className="text-ink/60 mt-2 text-xs">
              El número entre paréntesis es la gente <strong>prevista</strong> en ese puesto,
              que sale del organigrama. El chip de color es la gente{' '}
              <strong>registrada</strong> en nómina en el departamento con el que se enlazó.
            </p>
            <p className="text-ink/60 mt-2 text-xs">
              Mientras la nómina se termina de cargar, mandan las cifras del organigrama.
            </p>
          </Card>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------

interface RamaProps {
  rama: RamaOrganigrama
  nodos: NodoOrganigrama[]
  puedeEditar: boolean
  ocupado: boolean
  edicion: Edicion | null
  setEdicion: (e: Edicion | null) => void
  moviendo: number | null
  setMoviendo: (id: number | null) => void
  onGuardar: () => void | Promise<void>
  onMover: (id: number, padre_id: number) => void | Promise<void>
  onEliminar: (id: number) => void
  departamentos: Array<{ departamento: string; personas: number }>
}

function Rama(props: RamaProps) {
  const {
    rama,
    nodos,
    puedeEditar,
    ocupado,
    edicion,
    setEdicion,
    moviendo,
    setMoviendo,
    onGuardar,
    onMover,
    onEliminar,
    departamentos,
  } = props

  const editandoEste = edicion?.id === rama.id
  const anadiendoAqui = edicion?.id === null && edicion.padre_id === rama.id
  const moviendoEste = moviendo === rama.id

  // El chip solo sale cuando el nodo está enlazado a un departamento. Sin
  // enlace no es cero: es que no se sabe, y pintar un cero sería mentir.
  const cuadra = rama.registrados !== null && rama.registrados === rama.previstosEnRama

  return (
    /*
      La sangría se estrecha en el teléfono.

      Con 28 px por escalón, seis niveles se comen 168 de los 367 que hay, y el
      grupo de botones de la fila más honda ya no cabía: la página se desbordaba
      siete píxeles. Dieciséis por escalón dicen lo mismo y dejan sitio.
    */
    <div
      className={cn(
        rama.nivel > 0 && 'border-hairline ml-1.5 border-l pl-2.5 sm:ml-3 sm:pl-4',
      )}
    >
      <div className="py-1.5">
        {editandoEste && edicion ? (
          <Formulario
            edicion={edicion}
            setEdicion={setEdicion}
            departamentos={departamentos}
            ocupado={ocupado}
            onGuardar={onGuardar}
          />
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span
              className={cn(
                'text-sm',
                rama.tipo === 'UNIDAD' ? 'text-ink/90 font-semibold' : 'text-ink/75',
              )}
            >
              {rama.nombre}
            </span>

            {rama.titular ? (
              <span className="text-royal-600 dark:text-royal-300 text-sm">{rama.titular}</span>
            ) : null}

            {rama.cuantos > 0 ? (
              <span className="text-ink/50 tabular text-xs">({rama.cuantos})</span>
            ) : null}

            {rama.registrados !== null ? (
              <Chip tone={cuadra ? 'success' : 'warning'}>
                {cuadra
                  ? `${rama.registrados} en nómina`
                  : `${rama.registrados} ≠ ${rama.previstosEnRama}`}
              </Chip>
            ) : null}

            {rama.nota ? <span className="text-ink/40 text-xs">· {rama.nota}</span> : null}

            {puedeEditar ? (
              <span className="ml-auto flex shrink-0 items-center gap-0.5">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={ocupado}
                  title="Colgar un puesto de aquí"
                  onClick={() => {
                    setMoviendo(null)
                    setEdicion(EN_BLANCO(rama.id))
                  }}
                >
                  <Plus className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={ocupado}
                  title="Editar"
                  onClick={() => {
                    setMoviendo(null)
                    setEdicion(deNodo(rama))
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
                {rama.padre_id !== null ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={ocupado}
                    title="Moverlo a otra dependencia"
                    onClick={() => {
                      setEdicion(null)
                      setMoviendo(moviendoEste ? null : rama.id)
                    }}
                  >
                    <Move className="size-4" />
                  </Button>
                ) : null}
                {rama.hijos === 0 && rama.padre_id !== null ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    disabled={ocupado}
                    title="Quitarlo"
                    onClick={() => onEliminar(rama.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </span>
            ) : null}
          </div>
        )}

        {/* Mover: una lista de destinos, no un arrastre. La base rechaza los
            destinos imposibles; aquí se quitan de la lista los que se pueden
            descartar sin consultarla —él mismo y su padre actual—. */}
        {moviendoEste ? (
          <div className="border-hairline rounded-card mt-2 border border-dashed p-3">
            <SelectBuscable
              label={`Mover «${rama.nombre}» a`}
              vacio="Elige la nueva dependencia"
              valor=""
              onCambio={(v) => void onMover(rama.id, Number(v))}
              opciones={nodos
                .filter((n) => n.id !== rama.id && n.id !== rama.padre_id)
                .map((n) => ({
                  valor: String(n.id),
                  nombre: n.nombre,
                  // De quién cuelga hoy: con nombres repetidos —«Mantenimiento»
                  // puede haber en dos sitios— es lo único que los distingue.
                  detalle: nodos.find((p) => p.id === n.padre_id)?.nombre ?? undefined,
                }))}
            />
            <Button
              className="mt-2"
              size="sm"
              variant="ghost"
              icon={<X />}
              onClick={() => setMoviendo(null)}
            >
              Dejarlo donde está
            </Button>
          </div>
        ) : null}

        {/* Añadir: el formulario aparece debajo del padre, ya sangrado, donde
            va a quedar el puesto nuevo. */}
        {anadiendoAqui && edicion ? (
          <div className="border-hairline mt-2 ml-1.5 border-l pl-2.5 sm:ml-3 sm:pl-4">
            <Formulario
              edicion={edicion}
              setEdicion={setEdicion}
              departamentos={departamentos}
              ocupado={ocupado}
              onGuardar={onGuardar}
            />
          </div>
        ) : null}
      </div>

      {rama.ramas.map((h) => (
        <Rama key={h.id} {...props} rama={h} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Formulario({
  edicion,
  setEdicion,
  departamentos,
  ocupado,
  onGuardar,
}: {
  edicion: Edicion
  setEdicion: (e: Edicion | null) => void
  departamentos: Array<{ departamento: string; personas: number }>
  ocupado: boolean
  onGuardar: () => void | Promise<void>
}) {
  const cambiar = (parte: Partial<Edicion>) => setEdicion({ ...edicion, ...parte })

  return (
    <div className="border-hairline rounded-card border border-dashed p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Cómo se llama"
          value={edicion.nombre}
          onChange={(e) => cambiar({ nombre: e.target.value })}
        />
        <Input
          label="Quién lo ocupa"
          hint="Se deja vacío si el puesto no tiene nombre y apellido."
          value={edicion.titular}
          onChange={(e) => cambiar({ titular: e.target.value })}
        />
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Select
            label="Qué es"
            value={edicion.tipo}
            onChange={(e) => cambiar({ tipo: e.target.value as TipoDeNodo })}
            opciones={[
              { valor: 'UNIDAD', etiqueta: 'Unidad' },
              { valor: 'CARGO', etiqueta: 'Cargo' },
            ]}
          />
          <Input
            label="Cuántos"
            type="number"
            min="0"
            className="w-24"
            value={edicion.cuantos}
            onChange={(e) => cambiar({ cuantos: e.target.value })}
          />
        </div>
        <SelectBuscable
          label="Departamento de nómina"
          hint="Para saber cuánta gente hay de verdad aquí."
          vacio="Sin enlazar"
          valor={edicion.departamento}
          onCambio={(v) => cambiar({ departamento: v })}
          opciones={departamentos.map((d) => ({
            valor: d.departamento,
            nombre: d.departamento,
            detalle: `${d.personas} persona${d.personas === 1 ? '' : 's'} en nómina`,
          }))}
        />
        <Input
          className="sm:col-span-2"
          label="Nota"
          hint="Lo que el nombre no alcanza a decir."
          value={edicion.nota}
          onChange={(e) => cambiar({ nota: e.target.value })}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          icon={<Check />}
          disabled={ocupado || edicion.nombre.trim().length < 2}
          onClick={() => void onGuardar()}
        >
          {edicion.id === null ? 'Añadir' : 'Guardar'}
        </Button>
        <Button size="sm" variant="ghost" icon={<X />} onClick={() => setEdicion(null)}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
