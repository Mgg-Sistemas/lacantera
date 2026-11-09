import { useMemo, useState } from 'react'
import { ListaEditable } from '@/components/ListaEditable'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Segmento } from '@/components/ui/Segmento'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import {
  useActivarCatalogos,
  useBorrarCatalogo,
  useBorrarMotivoDespacho,
  useFijarTanquesPermitidos,
  useGuardarCatalogo,
  useGuardarMotivoDespacho,
  useMotivosDespacho,
} from '@/lib/api/combustible'
import type { Maquina } from '@/lib/api/maquinaria'
import { esTanquePermitidoParaEquipo } from '@/lib/combustible/opcionesEquipos'
import type { CatalogoCombustible, TanqueGt, TipoCatalogoCombustible } from '@/lib/combustible/tipos'
import { cn } from '@/lib/cn'
import { lt, norm, usePermisosCombustible } from './comun'
import { Cifra, MiniInput, MiniSelect, Pastilla } from './piezas'

/*
  🗂 CATÁLOGOS Y PERMISOS DE COMBUSTIBLE (Golden Touch, CatalogosModal).

  Tres pestañas de Golden Touch —«Equipos y Permisos de Surtido»,
  «Autorizados» y «Ubicaciones»— y una de La Cantera: «Para qué», los motivos
  del vale (`motivos_despacho`), que antes se editaban en el botón «Usos».

  En los equipos: quién puede surtir («¿Puede surtir?») y de qué tanques,
  con filtros, búsqueda y habilitar o bloquear lo filtrado de una vez. Un
  equipo puede estar atado a una máquina de la ficha (aquí se agregan las que
  falten) o ser solo un nombre (una planta, un fletero).

  BORRAR SOLO LO QUE NUNCA SE USÓ. Lo usado se apaga, para no dejar
  movimientos con un equipo que ya no existe (la base decide).

  Los tres catálogos piden COMBUSTIBLE.CATALOGOS; «Para qué», ESCRITURA.
*/

type Pestana = TipoCatalogoCombustible | 'motivo'

export function CatalogosModal({
  catalogos,
  tanques,
  maquinas,
  onCerrar,
}: {
  catalogos: CatalogoCombustible[]
  tanques: TanqueGt[]
  maquinas: Maquina[]
  onCerrar: () => void
}) {
  const p = usePermisosCombustible()
  const [tab, setTab] = useState<Pestana>(p.catalogos ? 'equipo' : 'motivo')
  const guardar = useGuardarCatalogo()
  const activar = useActivarCatalogos()
  const fijar = useFijarTanquesPermitidos()
  const borrar = useBorrarCatalogo()
  const error = guardar.error ?? activar.error ?? fijar.error ?? borrar.error
  const ocupado = guardar.isPending || activar.isPending || fijar.isPending || borrar.isPending

  const [valor, setValor] = useState('')
  const [maquinaNueva, setMaquinaNueva] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editValor, setEditValor] = useState('')
  const [busca, setBusca] = useState('')
  const [filtroSurtido, setFiltroSurtido] = useState<'todos' | 'activos' | 'inactivos'>('todos')
  const [filtroTanque, setFiltroTanque] = useState('')
  const [tanquesDe, setTanquesDe] = useState<CatalogoCombustible | null>(null)

  const porMaquina = useMemo(() => new Map(maquinas.map((m) => [m.id, m])), [maquinas])
  const items = catalogos.filter((c) => c.tipo === tab)
  const equipos = catalogos.filter((c) => c.tipo === 'equipo')
  const pueden = equipos.filter((c) => c.activo).length
  const maquinasSinCatalogo = maquinas.filter((m) => !equipos.some((c) => c.maquina_id === m.id))

  const filtrados = useMemo(() => {
    if (tab !== 'equipo') return items
    const q = norm(busca)
    return items.filter((c) => {
      if (filtroSurtido === 'activos' && !c.activo) return false
      if (filtroSurtido === 'inactivos' && c.activo) return false
      if (filtroTanque && !esTanquePermitidoParaEquipo(Number(filtroTanque), c.tanques_permitidos)) return false
      if (q) {
        const m = c.maquina_id != null ? porMaquina.get(c.maquina_id) : undefined
        const hay = norm([c.valor, m?.codigo, m?.nombre, m?.tipo, m?.clase].filter(Boolean).join(' '))
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, tab, busca, filtroSurtido, filtroTanque, porMaquina])

  const agregar = () => {
    if (!valor.trim() || tab === 'motivo') return
    guardar.mutate({ tipo: tab, valor: valor.trim() }, { onSuccess: () => setValor('') })
  }
  const agregarMaquina = () => {
    const m = porMaquina.get(Number(maquinaNueva))
    if (!m) return
    guardar.mutate({ tipo: 'equipo', valor: m.nombre, maquina_id: m.id, activo: true }, { onSuccess: () => setMaquinaNueva('') })
  }
  const guardarEdicion = (id: number) => guardar.mutate({ id, valor: editValor.trim() }, { onSuccess: () => setEditId(null) })
  const masivo = (activo: boolean) => {
    const ids = filtrados.filter((c) => c.activo !== activo).map((c) => c.id)
    if (ids.length) activar.mutate({ ids, activo })
  }

  const acciones = (c: CatalogoCombustible, conActivar: boolean) =>
    editId === c.id ? (
      <>
        <Button size="sm" onClick={() => guardarEdicion(c.id)} disabled={ocupado || editValor.trim().length < 2}>
          Guardar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
          Cancelar
        </Button>
      </>
    ) : (
      <>
        <Button
          size="sm"
          variant="ghost"
          title="Editar nombre"
          onClick={() => {
            setEditId(c.id)
            setEditValor(c.valor)
          }}
        >
          ✎
        </Button>
        {conActivar ? (
          <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => guardar.mutate({ id: c.id, activo: !c.activo })}>
            {c.activo ? 'Desactivar' : 'Activar'}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          title="Borrar del catálogo (si ya se usó, se apaga)"
          disabled={ocupado}
          onClick={() => {
            if (window.confirm(`¿Borrar «${c.valor}» del catálogo? Si ya se usó en algún movimiento, se apaga en lugar de borrarse.`))
              borrar.mutate(c.id)
          }}
        >
          🗑
        </Button>
      </>
    )

  const nombreValor = (c: CatalogoCombustible) =>
    editId === c.id ? (
      <Input
        label="Nombre"
        ocultarEtiqueta
        autoFocus
        value={editValor}
        onChange={(e) => setEditValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') guardarEdicion(c.id)
          if (e.key === 'Escape') setEditId(null)
        }}
      />
    ) : null

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Catálogos y permisos de combustible"
      ancho="xl"
      acciones={<Button onClick={onCerrar}>Cerrar</Button>}
    >
      <Segmento
        className="mb-4"
        valor={tab}
        onCambio={(v) => {
          setTab(v as Pestana)
          setEditId(null)
          setValor('')
        }}
        opciones={[
          ...(p.catalogos
            ? [
                { valor: 'equipo', etiqueta: 'Equipos y Permisos de Surtido' },
                { valor: 'autorizado', etiqueta: 'Autorizados' },
                { valor: 'ubicacion', etiqueta: 'Ubicaciones' },
              ]
            : []),
          ...(p.escribe ? [{ valor: 'motivo', etiqueta: 'Para qué' }] : []),
        ]}
      />

      {error ? <ErrorDeCarga error={error} className="mb-3" /> : null}

      {tab === 'motivo' ? (
        <MotivosDelVale />
      ) : tab === 'equipo' ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            <Cifra rotulo="Total en catálogo" valor={equipos.length} />
            <Cifra rotulo="🟢 Pueden surtir" valor={pueden} tono="success" />
            <Cifra rotulo="⚪ Bloqueados / No surten" valor={equipos.length - pueden} tono="danger" />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-end gap-2">
              <Input
                className="flex-1"
                label="Agregar un equipo sin ficha"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="PLANTA ELÉCTRICA OFICINA"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') agregar()
                }}
              />
              <Button onClick={agregar} disabled={ocupado || valor.trim().length < 2}>
                + Agregar equipo
              </Button>
            </div>
            <div className="flex items-end gap-2">
              <SelectBuscable
                className="flex-1"
                label="Agregar una máquina de la ficha"
                vacio={maquinasSinCatalogo.length ? 'Elegí la máquina' : 'Todas las máquinas ya están'}
                valor={maquinaNueva}
                onCambio={setMaquinaNueva}
                opciones={maquinasSinCatalogo.map((m) => ({ valor: String(m.id), codigo: m.codigo, nombre: m.nombre, detalle: m.tipo }))}
              />
              <Button onClick={agregarMaquina} disabled={ocupado || !maquinaNueva}>
                + Agregar
              </Button>
            </div>
          </div>

          <div className="border-hairline bg-canvas flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
            <MiniInput type="search" value={busca} onChange={setBusca} placeholder="🔍 Buscar por nombre, código, tipo…" className="min-w-48 flex-1" />
            <Pastilla activa={filtroSurtido === 'todos'} onClick={() => setFiltroSurtido('todos')}>
              Todos ({equipos.length})
            </Pastilla>
            <Pastilla activa={filtroSurtido === 'activos'} onClick={() => setFiltroSurtido('activos')}>
              🟢 Pueden surtir ({pueden})
            </Pastilla>
            <Pastilla activa={filtroSurtido === 'inactivos'} onClick={() => setFiltroSurtido('inactivos')}>
              ⚪ Bloqueados ({equipos.length - pueden})
            </Pastilla>
            <MiniSelect
              value={filtroTanque}
              onChange={setFiltroTanque}
              opciones={[
                { valor: '', etiqueta: '⛽ Todos los tanques' },
                ...tanques.map((t) => ({ valor: String(t.almacen_id), etiqueta: `${t.nombre}${t.es_movil ? ' (Móvil)' : ''}` })),
              ]}
            />
            <span className="ml-auto flex gap-1">
              <Button size="sm" variant="ghost" disabled={ocupado || !filtrados.length} onClick={() => masivo(true)} title="Habilita todos los equipos mostrados">
                ✓ Habilitar {filtrados.length}
              </Button>
              <Button size="sm" variant="ghost" disabled={ocupado || !filtrados.length} onClick={() => masivo(false)} title="Bloquea todos los equipos mostrados">
                ✕ Bloquear {filtrados.length}
              </Button>
            </span>
          </div>

          <div className="border-hairline max-h-[380px] overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink/50 border-hairline border-b text-left text-xs">
                  <th className="w-[38%] px-3 py-2 font-medium">Equipo / Identificación</th>
                  <th className="px-3 py-2 text-center font-medium">¿Puede surtir?</th>
                  <th className="px-3 py-2 font-medium">Tanques autorizados</th>
                  <th className="px-3 py-2 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {!filtrados.length ? (
                  <tr>
                    <td colSpan={4} className="text-ink/45 px-3 py-6 text-center">
                      No se encontraron equipos con los filtros seleccionados.
                    </td>
                  </tr>
                ) : null}
                {filtrados.map((c) => {
                  const m = c.maquina_id != null ? porMaquina.get(c.maquina_id) : undefined
                  const todos = !c.tanques_permitidos || c.tanques_permitidos.length === 0
                  return (
                    <tr key={c.id} className={cn('border-hairline border-b last:border-0', !c.activo && 'opacity-60')}>
                      <td className="px-3 py-2">
                        {nombreValor(c) ?? (
                          <div>
                            <strong className="text-ink/85">{c.valor}</strong>
                            {c.activo ? (
                              <Chip tone="success" className="ml-1.5">
                                Habilitado
                              </Chip>
                            ) : null}
                            <div className="text-ink/50 mt-0.5 text-xs">
                              {m ? (
                                <>
                                  🏷 <span className="font-mono">{m.codigo}</span>
                                  {m.tipo ? ` · ${m.tipo}` : ''}
                                  {m.clase ? ` · ${m.clase.toLowerCase()}` : ''}
                                </>
                              ) : (
                                'Sin ficha en Maquinaria'
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <label
                          className={cn(
                            'inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold select-none',
                            c.activo ? 'border-success/30 bg-success/12 text-success' : 'border-danger/25 bg-danger/10 text-danger',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="accent-royal-600"
                            checked={c.activo}
                            disabled={ocupado}
                            onChange={() => guardar.mutate({ id: c.id, activo: !c.activo })}
                          />
                          {c.activo ? 'Sí (Habilitado)' : 'No (Bloqueado)'}
                        </label>
                      </td>
                      <td className="px-3 py-2">
                        {!c.activo ? (
                          <span className="text-ink/45 text-xs italic">— Deshabilitado para surtir —</span>
                        ) : todos ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Chip tone="success">🌐 Todos los tanques</Chip>
                            <button
                              type="button"
                              className="text-ink/55 hover:bg-ink/6 rounded px-1.5 text-xs"
                              onClick={() => setTanquesDe(c)}
                              title="Restringir a tanques específicos"
                            >
                              ✎ Asignar tanques
                            </button>
                          </span>
                        ) : (
                          <span className="flex flex-wrap items-center gap-1">
                            {tanques
                              .filter((t) => c.tanques_permitidos?.includes(t.almacen_id))
                              .map((t) => (
                                <Chip key={t.almacen_id} tone="warning">
                                  ⛽ {t.nombre}
                                </Chip>
                              ))}
                            <button
                              type="button"
                              className="text-warning hover:bg-ink/6 rounded px-1.5 text-xs"
                              onClick={() => setTanquesDe(c)}
                              title="Modificar tanques autorizados"
                            >
                              ✎
                            </button>
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">{acciones(c, false)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-end gap-2">
            <Input
              className="flex-1"
              label={tab === 'autorizado' ? 'Nuevo autorizado' : 'Nueva ubicación'}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') agregar()
              }}
            />
            <Button onClick={agregar} disabled={ocupado || valor.trim().length < 2}>
              + Agregar
            </Button>
          </div>
          <div className="border-hairline max-h-[340px] overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink/50 border-hairline border-b text-left text-xs">
                  <th className="px-3 py-2 font-medium">Valor</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {!items.length ? (
                  <tr>
                    <td colSpan={3} className="text-ink/45 px-3 py-4 text-center">
                      Sin elementos.
                    </td>
                  </tr>
                ) : null}
                {items.map((c) => (
                  <tr key={c.id} className={cn('border-hairline border-b last:border-0', !c.activo && 'opacity-55')}>
                    <td className="px-3 py-2">{nombreValor(c) ?? c.valor}</td>
                    <td className="px-3 py-2">{c.activo ? '🟢 Activo' : '⚪ Inactivo'}</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">{acciones(c, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tanquesDe ? (
        <TanquesAutorizados
          item={tanquesDe}
          tanques={tanques}
          guardando={fijar.isPending}
          onGuardar={(ts) => fijar.mutate({ ids: [tanquesDe.id], tanques: ts }, { onSuccess: () => setTanquesDe(null) })}
          onCerrar={() => setTanquesDe(null)}
        />
      ) : null}
    </Modal>
  )
}

function TanquesAutorizados({
  item,
  tanques,
  guardando,
  onGuardar,
  onCerrar,
}: {
  item: CatalogoCombustible
  tanques: TanqueGt[]
  guardando: boolean
  onGuardar: (tanques: number[]) => void
  onCerrar: () => void
}) {
  const inicial = item.tanques_permitidos ?? []
  const [todos, setTodos] = useState(inicial.length === 0)
  const [sel, setSel] = useState<number[]>(inicial)

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Tanques autorizados · ${item.valor}`}
      ancho="md"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => onGuardar(todos ? [] : sel)} disabled={guardando || (!todos && sel.length === 0)}>
            Guardar autorización
          </Button>
        </>
      }
    >
      <p className="text-ink/60 mb-3 text-sm">
        Define desde qué tanques puede abastecerse <strong>{item.valor}</strong>. Al surtir desde un tanque no seleccionado, el
        equipo no sale en la lista.
      </p>
      <div className="border-hairline flex flex-col gap-2 rounded-lg border p-3">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="radio" className="accent-royal-600" checked={todos} onChange={() => setTodos(true)} />
          🌐 Permitir surtido desde TODOS los tanques (sin restricción)
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="radio" className="accent-royal-600" checked={!todos} onChange={() => setTodos(false)} />
          🎯 Restringir solo a tanques específicos:
        </label>
        {!todos ? (
          <div className="flex flex-col gap-1 pl-6">
            {tanques.map((t) => {
              const si = sel.includes(t.almacen_id)
              return (
                <label
                  key={t.almacen_id}
                  className={cn('flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm', si ? 'border-warning/40 bg-warning-soft' : 'border-transparent')}
                >
                  <input
                    type="checkbox"
                    className="accent-royal-600"
                    checked={si}
                    onChange={(e) =>
                      setSel((s) => (e.target.checked ? [...s.filter((x) => x !== t.almacen_id), t.almacen_id] : s.filter((x) => x !== t.almacen_id)))
                    }
                  />
                  <strong>{t.nombre}</strong>
                  <span className="text-ink/50 text-xs">
                    {t.es_movil ? '🚚 Móvil · ' : ''}
                    {lt(t.saldo_litros)} L disponibles
                  </span>
                </label>
              )
            })}
            {sel.length === 0 ? <p className="text-warning text-xs italic">⚠ Elegí al menos un tanque o marcá «Todos los tanques».</p> : null}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

/** «Para qué»: los motivos del vale. Antes era el botón «Usos» de la pantalla vieja. */
function MotivosDelVale() {
  const motivos = useMotivosDespacho(true)
  const guardar = useGuardarMotivoDespacho()
  const borrar = useBorrarMotivoDespacho()
  return (
    <>
      <p className="text-ink/55 mb-3 text-sm">La lista que sale al surtir. Los cambios no alteran los vales emitidos.</p>
      <ListaEditable
        elementos={(motivos.data ?? []).map((m) => ({
          codigo: m.codigo,
          nombre: m.nombre,
          pista: m.exige_detalle ? `${m.pista ?? ''} · pide explicación` : m.pista,
          activo: m.activo !== false,
        }))}
        error={guardar.error ?? borrar.error}
        guardando={guardar.isPending || borrar.isPending}
        etiquetaAnadir="Añadir uso"
        placeholderNuevo="Traslado a otro frente"
        nota="Apagar un motivo lo quita del formulario sin tocar los vales ya emitidos. Borrar solo funciona con los que nunca se usaron."
        onGuardar={(e) => {
          const actual = (motivos.data ?? []).find((m) => m.codigo === e.codigo)
          return guardar.mutateAsync({
            codigo: e.codigo,
            nombre: e.nombre,
            pista: actual?.pista ?? null,
            exige_detalle: actual?.exige_detalle ?? false,
            activo: e.activo,
          })
        }}
        onBorrar={(codigo) => borrar.mutateAsync(codigo)}
        onAnadir={(nombre) => guardar.mutateAsync({ nombre })}
      />
    </>
  )
}
