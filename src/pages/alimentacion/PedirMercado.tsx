import { useEffect, useMemo, useState } from 'react'
import { Plus, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { useArticulos, type Articulo } from '@/lib/api/catalogo'
import { useAlmacenes } from '@/lib/api/inventario'
import { useSolicitarMercado, useUltimaListaDeMercado, useViveres } from '@/lib/api/alimentacion'
import { fecha as fmtFecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

/*
  PEDIR EL MERCADO.

  Traído de MGG, donde es el botón más usado de su módulo de pedidos: en vez
  de teclear renglón por renglón, la lista llega ARMADA —todos los víveres
  del catálogo, marcados, con la cantidad de la última compra como
  sugerencia— y el trabajo del que pide es quitar lo que no hace falta y
  ajustar números.

  Dos diferencias con un pedido normal, y las dos a propósito:

  - La lista nace del CATÁLOGO y no de la existencia: lo que hay que comprar
    es justamente lo que se acabó, y un víver con existencia cero no aparece
    en ninguna pantalla de existencias. Al lado de cada víver se dice cuánto
    hay, para decidir con ese dato delante.

  - Lo que sale de aquí es un pedido de compras DE VERDAD (SOL-…, urgente):
    entra al tablero de Compras y sigue su circuito —cotizar, aprobar,
    pagar, recibir—. Esta pantalla no inventa un flujo; solo ahorra el
    tecleo de armarlo.
*/

interface Marcado {
  check: boolean
  cant: string
}

interface LineaLibre {
  clave: number
  descripcion: string
  cantidad: string
}

let contadorLibre = 0

export function PedirMercado({ onCerrar }: { onCerrar: () => void }) {
  const articulos = useArticulos()
  const existencias = useViveres()
  const ultima = useUltimaListaDeMercado()
  const { data: almacenes } = useAlmacenes()
  const pedir = useSolicitarMercado()

  const viveres = useMemo(
    () =>
      (articulos.data ?? [])
        .filter((a) => a.categoria === 'VIVERES')
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [articulos.data],
  )

  // Cuánto hay de cada víver, sumando todos los almacenes: el dato que decide
  // si se pide mucho, poco o nada.
  const existenciaDe = useMemo(() => {
    const m = new Map<number, number>()
    for (const v of existencias.data ?? []) {
      m.set(v.articulo_id, (m.get(v.articulo_id) ?? 0) + Number(v.existencia))
    }
    return m
  }, [existencias.data])

  const [sel, setSel] = useState<Record<number, Marcado>>({})
  const [extras, setExtras] = useState<Articulo[]>([])
  const [libres, setLibres] = useState<LineaLibre[]>([])
  const [filtro, setFiltro] = useState('')
  const [agregarId, setAgregarId] = useState('')
  const [agregarCant, setAgregarCant] = useState('1')
  const [almacen, setAlmacen] = useState('')
  const [nota, setNota] = useState('')
  const [acuse, setAcuse] = useState<string | null>(null)

  /*
    Todos marcados al abrir, con la cantidad de la última compra si la hubo y
    1 si no. Se arma una sola vez, cuando el catálogo y la última lista ya
    llegaron: pisarlo después borraría lo que la persona ya tocó.
  */
  const [precargado, setPrecargado] = useState(false)
  useEffect(() => {
    if (precargado || articulos.isPending || ultima.isPending) return
    const sugerida = new Map<number, string>()
    for (const r of ultima.data?.renglones ?? []) {
      if (Number(r.cantidad) > 0) sugerida.set(r.articulo_id, String(Number(r.cantidad)))
    }
    const inicial: Record<number, Marcado> = {}
    for (const v of viveres) {
      inicial[v.id] = { check: true, cant: sugerida.get(v.id) ?? '1' }
    }
    setSel(inicial)
    setPrecargado(true)
  }, [precargado, articulos.isPending, ultima.isPending, ultima.data, viveres])

  // La lista completa: los víveres del catálogo más lo agregado a mano, sin
  // repetir (un extra puede ser un víver que ya estaba).
  const lista = useMemo(() => {
    const vistos = new Set<number>()
    const out: Articulo[] = []
    for (const a of [...viveres, ...extras]) {
      if (vistos.has(a.id)) continue
      vistos.add(a.id)
      out.push(a)
    }
    return out
  }, [viveres, extras])

  // El filtro es solo de vista: lo marcado que el buscador esconde se pide igual.
  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    if (!q) return lista
    return lista.filter((a) => `${a.nombre} ${a.codigo} ${a.categoria}`.toLowerCase().includes(q))
  }, [lista, filtro])

  const marcados = lista.filter((a) => sel[a.id]?.check)
  const libresCompletas = libres.filter((l) => l.descripcion.trim().length >= 2 && Number(l.cantidad) > 0)
  const sinCantidad = marcados.find((a) => !(Number(sel[a.id]?.cant) > 0))
  const valido = (marcados.length > 0 || libresCompletas.length > 0) && sinCantidad === undefined

  // Lo que se puede agregar: cualquier artículo activo que no esté ya en la lista.
  const opcionesAgregar = useMemo(() => {
    const yaEsta = new Set(lista.map((a) => a.id))
    return (articulos.data ?? [])
      .filter((a) => !yaEsta.has(a.id))
      .map((a) => ({
        valor: String(a.id),
        codigo: a.codigo,
        nombre: a.nombre,
        detalle: `${a.categoria} · ${a.unidad}`,
      }))
  }, [articulos.data, lista])

  const agregar = () => {
    const a = (articulos.data ?? []).find((x) => String(x.id) === agregarId)
    if (!a || !(Number(agregarCant) > 0)) return
    setExtras((xs) => (xs.some((x) => x.id === a.id) ? xs : [...xs, a]))
    setSel((m) => ({ ...m, [a.id]: { check: true, cant: String(Number(agregarCant)) } }))
    setAgregarId('')
    setAgregarCant('1')
  }

  const enviar = async () => {
    const r = await pedir.mutateAsync({
      renglones: [
        ...marcados.map((a) => ({
          articulo_id: a.id,
          cantidad: Number(sel[a.id].cant),
        })),
        ...libresCompletas.map((l) => ({
          descripcion: l.descripcion.trim(),
          cantidad: Number(l.cantidad),
        })),
      ],
      almacen_id: almacen ? Number(almacen) : null,
      nota: nota.trim() || null,
    })
    setAcuse(r.numero)
  }

  if (acuse) {
    return (
      <Modal
        abierto
        onCerrar={onCerrar}
        titulo="El mercado quedó pedido"
        acciones={<Button onClick={onCerrar}>Listo</Button>}
      >
        <p className="text-ink/70 text-sm">
          Salió como el pedido <span className="text-ink/90 font-mono">{acuse}</span>, urgente. De aquí en
          adelante va por Compras: lo cotizan, lo aprueban y, cuando llegue, la recepción mete los víveres
          al inventario.
        </p>
      </Modal>
    )
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      ancho="lg"
      titulo="Pedir el mercado"
      descripcion="La lista completa de víveres del catálogo, marcada. Quite lo que no haga falta, ajuste cantidades, y sale como un pedido urgente al circuito de Compras."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            icon={<ShoppingCart />}
            disabled={!valido || pedir.isPending}
            onClick={() => void enviar()}
          >
            {pedir.isPending
              ? 'Enviando…'
              : `Pedir el mercado (${marcados.length + libresCompletas.length})`}
          </Button>
        </>
      }
    >
      {articulos.isPending || ultima.isPending ? (
        <Cargando />
      ) : articulos.error ? (
        <ErrorDeCarga error={articulos.error} />
      ) : (
        <div className="space-y-4">
          {ultima.data ? (
            <p className="text-ink/50 text-xs">
              Cantidades sugeridas de la última solicitud de mercado,{' '}
              <span className="font-mono">{ultima.data.numero}</span> del {fmtFecha(ultima.data.fecha)}. Son
              editables.
            </p>
          ) : null}

          {lista.length === 0 && libres.length === 0 ? (
            <p className="text-ink/60 text-sm">
              No hay artículos de la categoría «Víveres» en el catálogo. Cree los víveres en Inventario ›
              Artículos, o agregue abajo lo que haga falta como texto libre.
            </p>
          ) : null}

          {lista.length > 0 ? (
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {lista.length > 8 ? (
                  <div className="min-w-48 flex-1">
                    <Input
                      label="Buscar en la lista"
                      value={filtro}
                      onChange={(e) => setFiltro(e.target.value)}
                      placeholder="Arroz, aceite…"
                    />
                  </div>
                ) : null}
                <div className="flex items-end gap-2 pb-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setSel((m) => {
                        const n = { ...m }
                        for (const a of visibles) n[a.id] = { check: true, cant: n[a.id]?.cant ?? '1' }
                        return n
                      })
                    }
                  >
                    Marcar {filtro ? 'lo visible' : 'todos'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setSel((m) => {
                        const n = { ...m }
                        for (const a of visibles) n[a.id] = { check: false, cant: n[a.id]?.cant ?? '1' }
                        return n
                      })
                    }
                  >
                    Desmarcar {filtro ? 'lo visible' : 'todos'}
                  </Button>
                  <span className="text-ink/45 pb-1.5 text-xs">
                    {marcados.length} de {lista.length}
                  </span>
                </div>
              </div>

              <ul className="divide-hairline border-hairline max-h-80 divide-y overflow-y-auto rounded-card border">
                {visibles.map((a) => {
                  const s = sel[a.id] ?? { check: true, cant: '1' }
                  const hay = existenciaDe.get(a.id) ?? 0
                  return (
                    <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                      <input
                        type="checkbox"
                        className="accent-royal-600 size-4 shrink-0"
                        checked={s.check}
                        onChange={() =>
                          setSel((m) => ({ ...m, [a.id]: { check: !s.check, cant: s.cant } }))
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-sm', s.check ? 'text-ink/90' : 'text-ink/50')}>{a.nombre}</p>
                        <p className="text-ink/40 text-xs">
                          hay {hay.toLocaleString('es-VE', { maximumFractionDigits: 2 })} {a.unidad}
                          {extras.some((x) => x.id === a.id) ? ` · ${a.categoria}` : ''}
                        </p>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        disabled={!s.check}
                        value={s.cant}
                        onChange={(e) =>
                          setSel((m) => ({ ...m, [a.id]: { check: s.check, cant: e.target.value } }))
                        }
                        className={cn(
                          'border-hairline bg-surface tabular w-24 rounded-[8px] border px-2 py-1.5 text-right text-sm',
                          !s.check && 'opacity-40',
                          s.check && !(Number(s.cant) > 0) && 'border-danger',
                        )}
                      />
                      <span className="text-ink/45 w-10 shrink-0 text-xs">{a.unidad}</span>
                    </li>
                  )
                })}
                {visibles.length === 0 ? (
                  <li className="text-ink/45 px-3 py-4 text-center text-sm">
                    Nada coincide con «{filtro}». Si no existe, agréguelo abajo.
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {/* ¿Falta algo? Cualquier artículo del catálogo, aunque no sea víver:
              la escoba y el jabón se compran en el mismo mercado. */}
          <div className="grid gap-2 sm:grid-cols-[1fr_7rem_auto]">
            <SelectBuscable
              label="¿Falta algo? Agrega otro artículo"
              vacio="Busque en todo el catálogo…"
              valor={agregarId}
              onCambio={setAgregarId}
              opciones={opcionesAgregar}
            />
            <Input
              label="Cantidad"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={agregarCant}
              onChange={(e) => setAgregarCant(e.target.value)}
            />
            <div className="flex items-end pb-1">
              <Button
                size="sm"
                variant="outline"
                icon={<Plus />}
                disabled={!agregarId || !(Number(agregarCant) > 0)}
                onClick={agregar}
              >
                Añadir
              </Button>
            </div>
          </div>

          {/* Lo que no existe en el catálogo va como texto libre, igual que en
              un pedido normal: la oficina decide al cotizar si lo crea. */}
          {libres.map((l) => (
            <div key={l.clave} className="grid gap-2 sm:grid-cols-[1fr_7rem_auto]">
              <Input
                label="Qué es"
                placeholder="Bombona de gas de 10 kg"
                value={l.descripcion}
                onChange={(e) =>
                  setLibres((xs) =>
                    xs.map((x) => (x.clave === l.clave ? { ...x, descripcion: e.target.value } : x)),
                  )
                }
              />
              <Input
                label="Cantidad"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={l.cantidad}
                onChange={(e) =>
                  setLibres((xs) =>
                    xs.map((x) => (x.clave === l.clave ? { ...x, cantidad: e.target.value } : x)),
                  )
                }
              />
              <div className="flex items-end pb-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setLibres((xs) => xs.filter((x) => x.clave !== l.clave))}
                >
                  Quitar
                </Button>
              </div>
            </div>
          ))}
          <Button
            size="sm"
            variant="ghost"
            icon={<Plus />}
            onClick={() =>
              setLibres((xs) => [...xs, { clave: contadorLibre++, descripcion: '', cantidad: '1' }])
            }
          >
            Algo que no está en el catálogo
          </Button>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectBuscable
              label="A dónde llega"
              vacio="Se decide al recibir"
              valor={almacen}
              onCambio={setAlmacen}
              opciones={(almacenes ?? [])
                .filter((a) => a.recibe_compras)
                .map((a) => ({ valor: String(a.id), etiqueta: a.nombre }))}
            />
            <Input
              label="Nota para la oficina"
              placeholder="Opcional"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
          </div>

          {pedir.error ? <ErrorDeCarga error={pedir.error} /> : null}
        </div>
      )}
    </Modal>
  )
}
