import { useMemo, useState } from 'react'
import { PackageCheck } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { useRevisarEnAlmacen } from '@/lib/api/compras'
import type { Compra } from '@/lib/api/compras'
import { useAlmacenes, useExistencias } from '@/lib/api/inventario'
import { usePersonasDeLaEmpresa } from '@/lib/api/salidas'
import { textoRevisionAlmacen } from '@/lib/ficha/comprasWhatsapp'

/*
  LA REVISIÓN DEL ALMACÉN GENERAL (fase 2 del flujo nuevo, 06/11/2026)

  Angélica: «pasa al almacenista (verifica que tiene o no en inventario)… Si el
  almacén tiene todo, el almacenista hará una salida de los productos, a compras
  se le marca como finalizada».

  Por cada renglón del pedido el almacenista dice qué artículo de ALM-GEN
  entrega y cuánto, viendo lo que hay. Lo que entrega sale por una solicitud de
  salida (la de Salidas, con su autorización). Si entrega todo, la compra queda
  Finalizada; si no, a Compras pasa solo lo que falta.

  Los renglones del pedido son nombres generales («CLAVO 3"») y no siempre
  tienen ficha: por eso aquí se elige el artículo del almacén, aunque el
  renglón ya traiga uno.
*/

const ALMACEN_QUE_REVISA = 'ALM-GEN'

const num = (v: string | number | null | undefined) => {
  const n = Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const bonito = (n: number) => n.toLocaleString('es-VE', { maximumFractionDigits: 2 })

interface Fila {
  articulo: string
  cantidad: string
}

export function ModalRevisionAlmacen({
  compra,
  solicitante,
  empresa,
  onCerrar,
  onHecho,
}: {
  compra: Compra
  solicitante: string | null
  empresa?: string | null
  onCerrar: () => void
  /** Con el WhatsApp de la respuesta ya armado. */
  onHecho: (texto: string) => void
}) {
  const almacenes = useAlmacenes()
  const almacen = (almacenes.data ?? []).find((a) => a.codigo === ALMACEN_QUE_REVISA)
  const existencias = useExistencias(almacen?.id, !!almacen)
  const personas = usePersonasDeLaEmpresa()
  const revisar = useRevisarEnAlmacen()

  const renglones = useMemo(
    () => [...(compra.renglones ?? [])].sort((a, b) => a.linea - b.linea),
    [compra.renglones],
  )

  const hay = useMemo(() => {
    const m = new Map<number, { nombre: string; codigo: string; unidad: string; hay: number }>()
    for (const e of existencias.data ?? []) {
      m.set(e.articulo_id, {
        nombre: e.articulo,
        codigo: e.articulo_codigo,
        unidad: e.unidad,
        hay: num(e.disponibles ?? e.existencia),
      })
    }
    return m
  }, [existencias.data])

  const opciones = useMemo(
    () =>
      [...hay.entries()]
        .filter(([, e]) => e.hay > 0)
        .map(([id, e]) => ({
          valor: String(id),
          codigo: e.codigo,
          nombre: e.nombre,
          detalle: `Hay ${bonito(e.hay)} ${e.unidad}`,
        })),
    [hay],
  )

  // Si el renglón ya trae un artículo y el almacén lo tiene, se propone ese.
  const [filas, setFilas] = useState<Record<number, Fila>>({})
  const filaDe = (id: number, articuloDelRenglon: number | null): Fila =>
    filas[id] ?? {
      articulo:
        articuloDelRenglon && (hay.get(articuloDelRenglon)?.hay ?? 0) > 0 ? String(articuloDelRenglon) : '',
      cantidad: '',
    }
  const cambiar = (id: number, base: Fila, c: Partial<Fila>) =>
    setFilas((f) => ({ ...f, [id]: { ...base, ...c } }))

  const [empleado, setEmpleado] = useState('')
  const [nota, setNota] = useState('')

  const resumen = renglones.map((r) => {
    const f = filaDe(r.id, r.articulo_id)
    const pedida = num(r.cantidad)
    const entrega = f.articulo ? Math.max(0, num(f.cantidad)) : 0
    const disp = f.articulo ? (hay.get(Number(f.articulo))?.hay ?? 0) : 0
    return { r, f, pedida, entrega, disp }
  })

  // Lo mismo que comprueba la base, dicho antes de mandarlo.
  const porArticulo = new Map<number, number>()
  for (const x of resumen) {
    if (x.entrega > 0) porArticulo.set(Number(x.f.articulo), (porArticulo.get(Number(x.f.articulo)) ?? 0) + x.entrega)
  }
  const errorDe = (x: (typeof resumen)[number]) => {
    if (x.entrega > x.pedida) return `Se pidieron ${bonito(x.pedida)}`
    if (x.entrega > 0 && (porArticulo.get(Number(x.f.articulo)) ?? 0) > x.disp)
      return `Hay ${bonito(x.disp)} en el almacén`
    return undefined
  }
  const hayErrores = resumen.some((x) => errorDe(x))
  const entregaAlgo = resumen.some((x) => x.entrega > 0)
  const entregaTodo = resumen.every((x) => x.entrega >= x.pedida)
  const pasanACompras = resumen.filter((x) => x.entrega < x.pedida)

  const guardar = async () => {
    const enviados = resumen
      .filter((x) => x.entrega > 0)
      .map((x) => ({ renglon_id: x.r.id, articulo_id: Number(x.f.articulo), cantidad: x.entrega }))
    const ss = await revisar.mutateAsync({
      id: compra.id,
      renglones: enviados,
      empleado_id: empleado ? Number(empleado) : null,
      nota,
    })
    onHecho(
      textoRevisionAlmacen({
        compra: {
          ...compra,
          estado: entregaTodo ? 'FINALIZADA' : 'PEDIDO',
          salida_almacen_numero: ss,
          revision_almacen_nota: nota.trim() || null,
        },
        entregado: resumen
          .filter((x) => x.entrega > 0)
          .map((x) => ({
            descripcion: x.r.descripcion,
            cantidad: x.entrega,
            unidad: hay.get(Number(x.f.articulo))?.unidad ?? x.r.unidad,
            articulo: hay.get(Number(x.f.articulo))?.nombre,
          })),
        faltan: pasanACompras.map((x) => ({
          descripcion: x.r.descripcion,
          cantidad: x.pedida - x.entrega,
          unidad: x.r.unidad,
        })),
        personas: { solicita: solicitante },
        empresa,
      }),
    )
  }

  const cargando = almacenes.isPending || (!!almacen && existencias.isPending)

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Revisión del almacén general"
      descripcion="Diga qué entrega el almacén de cada renglón. Lo que falte pasa a Compras."
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            icon={<PackageCheck />}
            disabled={revisar.isPending || cargando || !almacen || hayErrores}
            onClick={() => void guardar()}
          >
            {revisar.isPending
              ? 'Guardando…'
              : entregaTodo
                ? 'Entregar todo y finalizar'
                : entregaAlgo
                  ? 'Entregar y pasar lo que falta a Compras'
                  : 'No hay nada: pasar todo a Compras'}
          </Button>
        </>
      }
    >
      {cargando ? <Cargando texto="Cargando lo que hay en el almacén general…" /> : null}
      {existencias.error ? <ErrorDeCarga error={existencias.error} /> : null}
      {!cargando && !almacen ? (
        <p className="text-danger text-sm">No está el almacén general ({ALMACEN_QUE_REVISA}), o está apagado.</p>
      ) : null}

      {!cargando && almacen ? (
        <div className="space-y-3">
          {resumen.map((x) => {
            const base = x.f
            const e = base.articulo ? hay.get(Number(base.articulo)) : undefined
            return (
              <div key={x.r.id} className="border-hairline rounded-[6px] border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-ink/85 min-w-0 text-sm font-medium">
                    {x.r.linea}. {x.r.descripcion}
                  </p>
                  <p className="text-ink/55 text-xs">
                    Pidieron {bonito(x.pedida)} {x.r.unidad}
                  </p>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_9rem]">
                  <SelectBuscable
                    label="Artículo del almacén"
                    opciones={opciones}
                    valor={base.articulo}
                    vacio="No hay en el almacén"
                    onCambio={(v) => cambiar(x.r.id, base, { articulo: v, cantidad: v ? base.cantidad : '' })}
                  />
                  <Input
                    label={e ? `Entrega (${e.unidad})` : 'Entrega'}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    disabled={!base.articulo}
                    value={base.cantidad}
                    error={errorDe(x)}
                    hint={e ? `Hay ${bonito(e.hay)}` : undefined}
                    onChange={(ev) => cambiar(x.r.id, base, { cantidad: ev.target.value })}
                  />
                </div>
                {e ? (
                  <button
                    type="button"
                    className="text-royal-600 mt-1 text-xs font-medium hover:underline"
                    onClick={() =>
                      cambiar(x.r.id, base, { cantidad: String(Math.min(x.pedida, e.hay)) })
                    }
                  >
                    Entregar {bonito(Math.min(x.pedida, e.hay))}
                  </button>
                ) : null}
              </div>
            )
          })}

          {entregaAlgo ? (
            <SelectBuscable
              label="¿Quién lo recibe?"
              opciones={(personas.data ?? [])
                .filter((p) => p.activo)
                .map((p) => ({ valor: String(p.id), etiqueta: p.nombre, detalle: p.cargo ?? undefined }))}
              valor={empleado}
              vacio={`Quien pidió${solicitante ? ` (${solicitante})` : ''}`}
              hint="Lo que entrega sale por una solicitud de salida del almacén general, con su autorización."
              onCambio={setEmpleado}
            />
          ) : null}

          <Textarea
            label="Nota (opcional)"
            rows={2}
            value={nota}
            onChange={(ev) => setNota(ev.target.value)}
          />

          {entregaAlgo ? (
            <p className="text-ink/50 text-xs">
              Si la solicitud de salida se rechaza o se cancela en Salidas, lo que no salió vuelve
              solo a Compras.
            </p>
          ) : null}

          <p
            className={
              entregaTodo
                ? 'text-success text-sm font-medium'
                : 'text-ink/70 text-sm'
            }
          >
            {entregaTodo
              ? 'El almacén entrega todo: la compra queda Finalizada.'
              : entregaAlgo
                ? `Pasan a Compras ${pasanACompras.length} de ${resumen.length} renglones, solo con lo que falta.`
                : 'El almacén no entrega nada: el pedido pasa entero a Compras.'}
          </p>
          {revisar.error ? <ErrorDeCarga error={revisar.error} /> : null}
        </div>
      ) : null}
    </Modal>
  )
}
