import { useMemo, useState } from 'react'
import { Check, Pencil, Plus, Trash2, Move, X } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
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
  EL ORGANIGRAMA, POR ESTRATOS

  Este dibujo es el tercer intento, y los dos anteriores fallaron por sitios
  opuestos. Las cajas con líneas del papel se leen bien en un A4 y se vuelven
  ilegibles en un teléfono: o se encogen hasta no leerse, o se salen por un
  lado. La lista con sangría que las sustituyó cabe en cualquier ancho y dice
  quién depende de quién, pero no es un organigrama: no se puede enseñar en una
  reunión, que es justo para lo que se pide uno.

  ASÍ QUE SE DIBUJA COMO SE CORTA UNA CANTERA: EN BANCOS

  Una banda horizontal por cada escalón de dependencia. Arriba el banco de la
  gerencia, y debajo cada nivel que cuelga. No es una metáfora traída de fuera
  —la casa ya habla así, «frentes y bancos», y el color del suelo se llama
  `tierra-950` en el sistema—, y sobre todo resuelve el problema que mató a las
  cajas: las fichas envuelven dentro de su banda, así que la hoja crece hacia
  abajo y nunca hacia los lados.

  Y NO HAY UNA SOLA LÍNEA DIBUJADA

  Las líneas que unen padre con hijo son lo que hace que un organigrama se
  desborde o se cruce consigo mismo. Aquí la dependencia se dice agrupando:
  dentro de cada banco, las fichas van reunidas bajo el nombre de quien manda.
  Se lee igual y no hay nada que trazar.

  LO QUE HACE QUE SE PUEDA PRESENTAR

  Pulsar una ficha enciende su línea de mando entera —lo que tiene encima y
  todo lo que le cuelga— y apaga el resto. Es lo que se hace en una reunión al
  señalar con el dedo, y de paso es cómo uno se sitúa antes de tocar nada.

  SE EDITA DONDE ESTÁ, Y NO SE ARRASTRA

  Arrastrar en un teléfono es un ejercicio de puntería, así que mover un puesto
  se hace eligiendo: se pulsa mover y los destinos válidos se encienden para
  que se pulse uno.
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
  tipo: 'UNIDAD',
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

/**
 * Toda la línea de mando de un puesto: lo que tiene encima y lo que le cuelga.
 *
 * Se recorre el árbol y no el campo `camino`, que sería más corto. `camino` es
 * texto y comparar prefijos daría por descendiente de «1.2» a «1.20», que es de
 * esos fallos que aparecen el día que la empresa crece.
 */
function lineaDeMando(id: number | null, arbol: RamaOrganigrama[]): Set<number> {
  const dentro = new Set<number>()
  if (id === null) return dentro

  const cuelgaDe = (rama: RamaOrganigrama) => {
    dentro.add(rama.id)
    for (const h of rama.ramas) cuelgaDe(h)
  }

  const buscar = (ramas: RamaOrganigrama[], encima: number[]): boolean => {
    for (const r of ramas) {
      if (r.id === id) {
        for (const a of encima) dentro.add(a)
        cuelgaDe(r)
        return true
      }
      if (buscar(r.ramas, [...encima, r.id])) return true
    }
    return false
  }

  buscar(arbol, [])
  return dentro
}

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
  const [enfocado, setEnfocado] = useState<number | null>(null)

  const arbol = useMemo(() => armarArbol(nodos ?? []), [nodos])
  const ocupado = guardar.isPending || mover.isPending || eliminar.isPending

  /*
    Los bancos: un grupo por nivel, y dentro reunidos por quien manda.

    La vista llega ordenada por `camino`, que deja a cada hijo detrás de su
    padre, así que recorrerla en orden ya agrupa a los hermanos sin ordenar
    nada aquí.
  */
  const bancos = useMemo(() => {
    const porNivel = new Map<number, Map<number | null, NodoOrganigrama[]>>()
    for (const n of nodos ?? []) {
      const banco = porNivel.get(n.nivel) ?? new Map<number | null, NodoOrganigrama[]>()
      const hermanos = banco.get(n.padre_id) ?? []
      hermanos.push(n)
      banco.set(n.padre_id, hermanos)
      porNivel.set(n.nivel, banco)
    }
    return [...porNivel.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([nivel, grupos]) => ({ nivel, grupos: [...grupos.entries()] }))
  }, [nodos])

  const nombreDe = useMemo(
    () => new Map((nodos ?? []).map((n) => [n.id, n.nombre])),
    [nodos],
  )
  const enLinea = useMemo(() => lineaDeMando(enfocado, arbol), [enfocado, arbol])

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

  async function moverA(id: number, padre_id: number) {
    await mover.mutateAsync({ id, padre_id })
    setMoviendo(null)
  }

  const puesto = enfocado !== null ? (nodos ?? []).find((n) => n.id === enfocado) : undefined
  const quienMueve = moviendo !== null ? (nodos ?? []).find((n) => n.id === moviendo) : undefined
  const bajoElQueMueve = lineaDeMando(moviendo, arbol)

  return (
    <>
      <PageHeader
        eyebrow="Organización"
        title="Organigrama"
        description="Quién depende de quién, y cuánta gente hay prevista en cada puesto. Pulsa un puesto para seguir su línea de mando."
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
            {sinDepartamento > 0 ? ` · ${sinDepartamento} sin departamento escrito` : ''}
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

      {/* ------------------------------- Moviendo algo ---------------------------- */}
      {quienMueve ? (
        <div className="border-royal-600/40 bg-royal-600/5 rounded-card mt-4 flex flex-wrap items-center gap-3 border p-3">
          <p className="text-ink/80 text-sm">
            Moviendo <strong className="font-titular">{quienMueve.nombre}</strong>. Pulsa el puesto
            del que debe colgar.
          </p>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setMoviendo(null)}>
            Dejarlo donde está
          </Button>
        </div>
      ) : null}

      {/* --------------------------------- Los bancos ----------------------------- */}
      <Card flush className="mt-4 overflow-hidden">
        {bancos.map(({ nivel, grupos }, iBanco) => {
          const enEsteBanco = grupos.flatMap(([, hermanos]) => hermanos)
          const personas = enEsteBanco.reduce((t, n) => t + n.cuantos, 0)

          return (
            <section
              key={nivel}
              className={cn(
                'border-hairline flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:gap-5 sm:px-5',
                iBanco === 0 && 'border-t-0',
                // Los bancos alternan como alterna la piedra cortada: el par
                // hundido, el impar a la vista. Es lo único que los separa
                // cuando la pantalla es estrecha y el rótulo se va arriba.
                iBanco % 2 === 1 && 'bg-canvas/60',
              )}
            >
              {/*
                El canto del banco. Lleva el número de escalón grande y, debajo,
                lo que hay en él: es la lectura que la lista con sangría no
                dejaba hacer —cuántos escalones tiene la empresa y cuánta gente
                vive en cada uno—.
              */}
              <div className="flex shrink-0 items-baseline gap-2 sm:w-24 sm:flex-col sm:items-end sm:gap-0.5">
                <span className="font-titular text-ink/25 text-3xl leading-none font-semibold tabular">
                  {nivel + 1}
                </span>
                <span className="text-ink/45 text-2xs sm:text-right">
                  {enEsteBanco.length} puesto{enEsteBanco.length === 1 ? '' : 's'}
                  {personas > 0 ? ` · ${personas} persona${personas === 1 ? '' : 's'}` : ''}
                </span>
              </div>

              <div className="grid min-w-0 grow gap-3">
                {grupos.map(([padre, hermanos]) => (
                  <div key={String(padre)}>
                    {/*
                      De quién cuelgan. Esto es lo que sustituye a las líneas:
                      en el primer banco sobra —no cuelgan de nadie— y en los
                      demás es la única forma de saberlo sin trazar nada.
                    */}
                    {padre !== null ? (
                      <p className="text-ink/40 text-2xs mb-1.5 tracking-wide uppercase">
                        de {nombreDe.get(padre) ?? '—'}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      {hermanos.map((n) => (
                        <Ficha
                          key={n.id}
                          nodo={n}
                          apagada={enfocado !== null && !enLinea.has(n.id)}
                          enfocada={enfocado === n.id}
                          // El destino de un movimiento no puede ser el que se
                          // mueve ni nada que cuelgue de él: sería colgarlo de
                          // sí mismo. La base también lo rechaza; aquí ni se
                          // ofrece.
                          destinoPosible={
                            moviendo !== null &&
                            !bajoElQueMueve.has(n.id) &&
                            n.id !== quienMueve?.padre_id
                          }
                          onPulsar={() => {
                            if (moviendo !== null) {
                              // Las mismas condiciones que pintan el destino:
                              // si no se ofrece, tampoco se acepta al pulsarlo.
                              const vale =
                                !bajoElQueMueve.has(n.id) && n.id !== quienMueve?.padre_id
                              if (vale) void moverA(moviendo, n.id)
                              return
                            }
                            setEnfocado(enfocado === n.id ? null : n.id)
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )
        })}

        {(nodos ?? []).length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-ink/70 font-titular text-lg">Todavía no hay organigrama</p>
            <p className="text-ink/45 mx-auto mt-1 max-w-sm text-sm leading-relaxed">
              Empieza por lo de arriba —la gerencia general— y ve colgando de ahí. Cada puesto que
              añadas abre el banco siguiente.
            </p>
            {puedeEditar ? (
              <Button className="mt-4" icon={<Plus />} onClick={() => setEdicion(EN_BLANCO(null))}>
                Empezar por arriba
              </Button>
            ) : null}
          </div>
        ) : null}
      </Card>

      {/* ------------------------------ Lo que se hace ---------------------------- */}
      {/*
        `puesto` y no un `find(...)!`: entre que se borra un nodo y que la
        consulta se refresca, `enfocado` apunta a algo que ya no está, y la
        aserción habría tumbado la pantalla entera en ese hueco.
      */}
      {puedeEditar && puesto && moviendo === null && edicion === null ? (
        <AccionesDe
          nodo={puesto}
          ocupado={ocupado}
          onAnadir={() => setEdicion(EN_BLANCO(puesto.id))}
          onEditar={() => setEdicion(deNodo(puesto))}
          onMover={() => {
            setEnfocado(null)
            setMoviendo(puesto.id)
          }}
          onEliminar={() => {
            eliminar.mutate({ id: puesto.id })
            setEnfocado(null)
          }}
        />
      ) : null}

      {edicion ? (
        <div className="mt-4">
          <p className="text-ink/45 mb-2 text-xs">
            {edicion.id === null
              ? `Nuevo puesto colgando de ${nombreDe.get(edicion.padre_id ?? -1) ?? 'nadie'}`
              : `Editando ${edicion.nombre}`}
          </p>
          <Formulario
            edicion={edicion}
            setEdicion={setEdicion}
            departamentos={departamentos.data?.lista ?? []}
            ocupado={ocupado}
            onGuardar={guardarEdicion}
          />
        </div>
      ) : null}

      {puedeEditar && edicion === null && (nodos ?? []).length > 0 ? (
        <p className="text-ink/40 mt-4 text-xs">
          {enfocado === null
            ? 'Pulsa un puesto para seguir su línea de mando y para poder tocarlo.'
            : 'Pulsa el mismo puesto otra vez para soltarlo.'}
        </p>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------

/**
 * Una ficha del banco.
 *
 * Es un botón y no un div con `onClick` a propósito: se llega con el tabulador
 * y se acciona con la barra, que es lo que hace falta para recorrer un
 * organigrama de cuarenta puestos sin ratón.
 */
function Ficha({
  nodo,
  apagada,
  enfocada,
  destinoPosible,
  onPulsar,
}: {
  nodo: NodoOrganigrama
  apagada: boolean
  enfocada: boolean
  destinoPosible: boolean
  onPulsar: () => void
}) {
  // El desajuste se dice; el acuerdo se calla. Un puesto donde el organigrama y
  // la nómina coinciden no necesita decir nada, y marcarlos todos convierte la
  // pantalla en un campo de etiquetas donde lo que importa no destaca.
  const descuadra = nodo.registrados !== null && nodo.registrados !== nodo.cuantos

  return (
    <button
      type="button"
      onClick={onPulsar}
      aria-pressed={enfocada}
      className={cn(
        'rounded-card border px-3 py-2 text-left transition-[opacity,border-color,background-color] duration-200',
        'focus-visible:ring-royal-600 focus-visible:ring-2 focus-visible:outline-none',
        'motion-reduce:transition-none',
        /*
          Apagada sigue siendo un botón: se llega con el tabulador. Al 30 % no
          se leía, así que se recupera entera al recibir el foco y al pasar por
          encima. Apagar no es esconder.
        */
        apagada ? 'opacity-40 hover:opacity-100 focus-visible:opacity-100' : 'opacity-100',
        enfocada
          ? 'border-royal-600 bg-royal-600/8'
          : destinoPosible
            ? 'border-royal-600/50 bg-royal-600/5 border-dashed'
            : 'border-hairline bg-surface hover:border-royal-300',
      )}
    >
      <span
        className={cn(
          'font-titular block text-sm leading-tight',
          // Una unidad es una caja del organigrama; un cargo es una persona.
          // Se distinguen por el peso y no por un color más, que ya hay dos
          // significados compitiendo por el color en esta pantalla.
          nodo.tipo === 'UNIDAD' ? 'text-ink/90 font-semibold' : 'text-ink/75 font-normal',
        )}
      >
        {nodo.nombre}
      </span>

      {nodo.titular ? (
        <span className="text-royal-600 dark:text-royal-300 mt-0.5 block text-xs">
          {nodo.titular}
        </span>
      ) : null}

      <span className="text-ink/45 text-2xs mt-1 flex flex-wrap items-center gap-x-2">
        {nodo.cuantos > 0 ? (
          <span className="tabular">
            {nodo.cuantos} {nodo.cuantos === 1 ? 'plaza' : 'plazas'}
          </span>
        ) : null}
        {descuadra ? (
          <span className="text-warning tabular">{nodo.registrados} en nómina</span>
        ) : null}
      </span>
    </button>
  )
}

/** Lo que se puede hacer con el puesto que está pulsado. */
function AccionesDe({
  nodo,
  ocupado,
  onAnadir,
  onEditar,
  onMover,
  onEliminar,
}: {
  nodo: NodoOrganigrama
  ocupado: boolean
  onAnadir: () => void
  onEditar: () => void
  onMover: () => void
  onEliminar: () => void
}) {
  return (
    <div className="border-hairline rounded-card mt-4 flex flex-wrap items-center gap-2 border p-3">
      <span className="text-ink/70 font-titular mr-1 text-sm">{nodo.nombre}</span>

      <Button size="sm" variant="soft" icon={<Plus />} disabled={ocupado} onClick={onAnadir}>
        Colgar un puesto
      </Button>
      <Button size="sm" variant="outline" icon={<Pencil />} disabled={ocupado} onClick={onEditar}>
        Editar
      </Button>
      {nodo.padre_id !== null ? (
        <Button size="sm" variant="outline" icon={<Move />} disabled={ocupado} onClick={onMover}>
          Mover
        </Button>
      ) : null}

      {/*
        Quitar solo lo que no tiene nada colgando, y nunca lo de arriba. Un
        organigrama sin cabeza no es un organigrama, y borrar una rama entera
        de un botón es de las cosas que no se deshacen.
      */}
      {nodo.hijos === 0 && nodo.padre_id !== null ? (
        <Button
          size="sm"
          variant="ghost"
          className="text-danger ml-auto"
          disabled={ocupado}
          icon={<Trash2 />}
          onClick={onEliminar}
        >
          Quitar
        </Button>
      ) : nodo.hijos > 0 ? (
        <span className="text-ink/40 text-2xs ml-auto">
          No se quita: tiene {nodo.hijos} puesto{nodo.hijos === 1 ? '' : 's'} colgando
        </span>
      ) : null}
    </div>
  )
}

/** Alta y edición de un puesto. */
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
          disabled={!edicion.nombre.trim() || ocupado}
          onClick={() => void onGuardar()}
        >
          Guardar
        </Button>
        <Button size="sm" variant="ghost" icon={<X />} onClick={() => setEdicion(null)}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
