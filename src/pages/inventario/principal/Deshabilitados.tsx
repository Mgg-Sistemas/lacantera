import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import {
  useArticulos,
  useCambiarEstadoArticulo,
  useCategoriasDeInventario,
  useMisRoles,
  usePerfiles,
  useUnidades,
} from '@/lib/api/catalogo'
import type { Articulo } from '@/lib/api/catalogo'
import { useExistencias } from '@/lib/api/inventario'
import { toast } from '@/lib/avisosFlotantes'
import { fecha } from '@/lib/formato'
import { filaUsable } from './comun'

/*
  🗄 «PRODUCTOS DESHABILITADOS» (fase 4 de «Almacén e Inventario como MGG»,
  08/11/2026). Copia de `ProductosInactivosModal.tsx` de MGG: filtros, la
  tabla y «↻ Reactivar» con `cambiar_estado_articulo`.

  Lo único distinto: aquí reactivar también pide el motivo (diez letras), que
  la base exige en las dos direcciones desde el 16/09/2026. Se pregunta en un
  modal chico antes de reactivar.
*/

export function Deshabilitados({
  onCerrar,
  onVerProducto,
}: {
  onCerrar: () => void
  onVerProducto?: (articuloId: number) => void
}) {
  const articulosQ = useArticulos(false)
  const { data: categorias } = useCategoriasDeInventario()
  const { data: unidades } = useUnidades()
  const { data: perfiles } = usePerfiles()
  const existenciasQ = useExistencias()
  const { puede: tieneRol } = useMisRoles()
  const puede = tieneRol('COMPRAS', 'ALMACEN')

  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('')
  const [unidad, setUnidad] = useState('')
  const [almacen, setAlmacen] = useState('')
  const [por, setPor] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [reactivando, setReactivando] = useState<Articulo | null>(null)

  const nombreDePerfil = (id: string | null) => (perfiles ?? []).find((p) => p.id === id)?.nombre ?? ''
  const etiquetaDe = (codigo: string) => (categorias ?? []).find((c) => c.codigo === codigo)?.etiqueta ?? codigo

  // El último almacén donde se movió, según el libro.
  const ultimoAlmacen = useMemo(() => {
    const m = new Map<number, { almacen: string; id: number; cuando: string }>()
    for (const e of (existenciasQ.data ?? []).filter(filaUsable)) {
      const cuando = e.ultimo_movimiento ?? ''
      const antes = m.get(e.articulo_id)
      if (!antes || cuando > antes.cuando) m.set(e.articulo_id, { almacen: e.almacen, id: e.almacen_id, cuando })
    }
    return m
  }, [existenciasQ.data])

  const deshabilitados = useMemo(
    () =>
      (articulosQ.data ?? [])
        .filter((a) => !a.activo && a.inventariable)
        .sort((a, b) => (b.estado_cambiado_en ?? '').localeCompare(a.estado_cambiado_en ?? '')),
    [articulosQ.data],
  )

  const tokens = busca.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const visibles = deshabilitados.filter((a) => {
    if (categoria && a.categoria !== categoria) return false
    if (unidad && a.unidad !== unidad) return false
    if (almacen && String(ultimoAlmacen.get(a.id)?.id ?? '') !== almacen) return false
    if (por && a.estado_cambiado_por !== por) return false
    const dia = (a.estado_cambiado_en ?? '').slice(0, 10)
    if (desde && (!dia || dia < desde)) return false
    if (hasta && (!dia || dia > hasta)) return false
    if (tokens.length > 0) {
      const pajar = [a.nombre, a.codigo, a.codigo_anterior, a.marca, a.numero_parte, a.descripcion, a.motivo_estado]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!tokens.every((t) => pajar.includes(t))) return false
    }
    return true
  })

  const hayFiltros = !!(busca || categoria || unidad || almacen || por || desde || hasta)
  const limpiar = () => {
    setBusca('')
    setCategoria('')
    setUnidad('')
    setAlmacen('')
    setPor('')
    setDesde('')
    setHasta('')
  }

  const almacenesVistos = [...new Map([...ultimoAlmacen.values()].map((v) => [v.id, v.almacen])).entries()]
  const quienes = [...new Set(deshabilitados.map((a) => a.estado_cambiado_por).filter((x): x is string => !!x))]

  return (
    <>
      <Modal
        abierto
        ancho="xl"
        onCerrar={onCerrar}
        titulo="Productos deshabilitados"
        acciones={<Button onClick={onCerrar}>Cerrar</Button>}
      >
        <p className="text-ink/70 text-sm">
          Mientras un producto esté dado de baja <strong>no existe</strong> para el sistema: no aparece en el
          inventario, ni en los almacenes, ni en el buscador, y no se puede pedir ni mover. Reactivalo para devolverlo a
          la circulación.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <Input
              maxLength={100}
              label="Buscar"
              icon={<Search />}
              placeholder="Buscar en todo: nombre, código, marca, modelo, motivo de la baja…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Select
            label="Categoría"
            vacio="Todas"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            opciones={(categorias ?? []).map((c) => ({ valor: c.codigo, etiqueta: c.etiqueta }))}
          />
          <Select
            label="Unidad"
            vacio="Todas"
            value={unidad}
            onChange={(e) => setUnidad(e.target.value)}
            opciones={(unidades ?? []).map((u) => ({ valor: u.codigo, etiqueta: u.nombre }))}
          />
          <Select
            label="Último almacén"
            vacio="Todos"
            value={almacen}
            onChange={(e) => setAlmacen(e.target.value)}
            opciones={almacenesVistos.map(([id, n]) => ({ valor: String(id), etiqueta: n }))}
          />
          <Select
            label="Dado de baja por"
            vacio="Dado de baja por cualquiera"
            value={por}
            onChange={(e) => setPor(e.target.value)}
            opciones={quienes.map((id) => ({ valor: id, etiqueta: nombreDePerfil(id) || 'Usuario' }))}
          />
          <Input label="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          <Input label="Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        {hayFiltros ? (
          <Button size="sm" variant="ghost" className="mt-2" onClick={limpiar}>
            Limpiar filtros
          </Button>
        ) : null}

        {articulosQ.isPending ? <Cargando /> : null}
        {articulosQ.error ? <ErrorDeCarga error={articulosQ.error} className="mt-3" /> : null}

        {!articulosQ.isPending && visibles.length === 0 ? (
          <p className="text-ink/60 mt-6 text-center text-sm">
            {deshabilitados.length === 0
              ? 'No hay productos deshabilitados.'
              : 'Ningún producto deshabilitado coincide con esos filtros.'}
          </p>
        ) : null}

        {visibles.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="py-2 pr-3 font-medium">Código</th>
                  <th className="py-2 pr-3 font-medium">Producto</th>
                  <th className="py-2 pr-3 font-medium">Categoría</th>
                  <th className="py-2 pr-3 font-medium">Unidad</th>
                  <th className="py-2 pr-3 font-medium">Último almacén</th>
                  <th className="py-2 pr-3 font-medium">Dado de baja</th>
                  <th className="py-2 pr-3 font-medium">Por</th>
                  <th className="py-2 pr-3 font-medium">Motivo</th>
                  <th className="py-2 text-right font-medium">Acción</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((a) => (
                  <tr key={a.id} className="border-hairline border-b align-top last:border-0">
                    <td className="text-ink/60 py-2 pr-3 font-mono text-xs">{a.codigo}</td>
                    <td className="py-2 pr-3">
                      {onVerProducto ? (
                        <button
                          type="button"
                          className="text-ink/85 text-left hover:underline"
                          title="Ver la trazabilidad del producto"
                          onClick={() => onVerProducto(a.id)}
                        >
                          {a.nombre}
                        </button>
                      ) : (
                        a.nombre
                      )}
                    </td>
                    <td className="py-2 pr-3">{etiquetaDe(a.categoria)}</td>
                    <td className="py-2 pr-3">{a.unidad}</td>
                    <td className="py-2 pr-3">{ultimoAlmacen.get(a.id)?.almacen ?? '—'}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{a.estado_cambiado_en ? fecha(a.estado_cambiado_en) : '—'}</td>
                    <td className="py-2 pr-3">{nombreDePerfil(a.estado_cambiado_por) || '—'}</td>
                    <td className="text-ink/70 max-w-[16rem] py-2 pr-3 text-xs break-words">{a.motivo_estado ?? '—'}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {puede ? (
                        <Button size="sm" variant="outline" onClick={() => setReactivando(a)}>
                          ↻ Reactivar
                        </Button>
                      ) : (
                        <span className="text-ink/45 text-xs">sin permiso</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Modal>

      {reactivando ? <Reactivar articulo={reactivando} onCerrar={() => setReactivando(null)} /> : null}
    </>
  )
}

function Reactivar({ articulo, onCerrar }: { articulo: Articulo; onCerrar: () => void }) {
  const cambiar = useCambiarEstadoArticulo()
  const [motivo, setMotivo] = useState('')
  return (
    <Modal
      abierto
      ancho="sm"
      onCerrar={onCerrar}
      titulo="Reactivar producto"
      descripcion={`¿Confirmás reactivar «${articulo.nombre}» (${articulo.codigo})? Vuelve al inventario, a los almacenes y al buscador.`}
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={cambiar.isPending || motivo.trim().length < 10}
            onClick={async () => {
              try {
                await cambiar.mutateAsync({ id: articulo.id, activo: true, motivo })
                toast(`"${articulo.nombre}" volvió al inventario`, 'success')
                onCerrar()
              } catch {
                // El error se enseña debajo del motivo.
              }
            }}
          >
            {cambiar.isPending ? 'Activando…' : '↻ Reactivar'}
          </Button>
        </>
      }
    >
      <Textarea
        maxLength={500}
        label="¿Por qué vuelve? *"
        rows={3}
        autoFocus
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        hint="Queda guardado con tu nombre y la fecha. Al menos diez letras."
      />
      {cambiar.error ? <ErrorDeCarga error={cambiar.error} className="mt-3" /> : null}
    </Modal>
  )
}
