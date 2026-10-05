import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Check, Share2, UtensilsCrossed } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { useMisPermisos } from '@/lib/api/usuarios'
import {
  TIPOS_DE_COMIDA,
  useServirComida,
  useViveres,
  type TipoComida,
} from '@/lib/api/alimentacion'
import { dolares } from '@/lib/formato'
import { cn } from '@/lib/cn'

/*
  LA COCINA, EN EL TELÉFONO.

  La segunda vista de campo, con el mismo molde del surtidor (20261005105213):
  el cocinero abre el sistema y ya está donde trabaja. Toca qué comida fue,
  pone cuántos comieron, marca qué se gastó, y guarda. La analista lo ve al
  momento en el escritorio.

  Las mismas decisiones de campo que el surtidor, por las mismas razones:
  botones grandes para el dedo, teclado numérico, el botón fijo abajo donde
  está el pulgar, el aviso de mala señal a los doce segundos para que no se
  cargue dos veces, y el acuse que se pasa por WhatsApp.
*/

const SEGUNDOS_PARA_AVISAR_DE_LA_SEÑAL = 12

export function Cocina() {
  const { puede } = useMisPermisos()
  const puedeServir = puede('ALIMENTACION', 'ESCRITURA')
  const viveres = useViveres()
  const servir = useServirComida()

  const [tipo, setTipo] = useState<TipoComida | ''>('')
  const [platos, setPlatos] = useState('')
  const [almacen, setAlmacen] = useState('')
  const [cantidades, setCantidades] = useState<Record<number, string>>({})
  const [buscado, setBuscado] = useState('')
  const [acuse, setAcuse] = useState<{ texto: string; porPlato: string } | null>(null)
  const [tarda, setTarda] = useState(false)

  // El aviso de mala señal, igual que en el surtidor: a los doce segundos se
  // dice que ya quedó guardándose y que no se vuelva a cargar.
  useEffect(() => {
    if (!servir.isPending) {
      setTarda(false)
      return
    }
    const t = setTimeout(() => setTarda(true), SEGUNDOS_PARA_AVISAR_DE_LA_SEÑAL * 1000)
    return () => clearTimeout(t)
  }, [servir.isPending])

  const almacenes = useMemo(() => {
    const m = new Map<number, string>()
    for (const v of viveres.data ?? []) m.set(v.almacen_id, v.almacen)
    return [...m.entries()].map(([id, nombre]) => ({ id, nombre }))
  }, [viveres.data])

  const almacenElegido = almacen || (almacenes.length === 1 ? String(almacenes[0].id) : '')
  const delAlmacen = (viveres.data ?? []).filter((v) => String(v.almacen_id) === almacenElegido)

  const marcados = delAlmacen.filter((v) => Number(cantidades[v.articulo_id] ?? 0) > 0)
  const valorEstimado = marcados.reduce(
    (s, v) => s + Number(cantidades[v.articulo_id]) * Number(v.costo_promedio_usd ?? 0),
    0,
  )
  const excedido = marcados.find((v) => Number(cantidades[v.articulo_id]) > Number(v.existencia))

  const valido =
    tipo !== '' && Number(platos) > 0 && almacenElegido !== '' && marcados.length > 0 && excedido === undefined

  if (viveres.isPending) return <Cargando />
  if (viveres.error) return <ErrorDeCarga error={viveres.error} />

  if (!puedeServir) {
    return (
      <p className="text-ink/60 mx-auto mt-10 max-w-sm text-center text-sm">
        Su usuario puede ver la alimentación, pero no servir comidas. Hace falta el permiso de escritura en
        Alimentación.
      </p>
    )
  }

  if (acuse) {
    return (
      <Acuse
        texto={acuse.texto}
        porPlato={acuse.porPlato}
        onOtra={() => {
          setAcuse(null)
          setTipo('')
          setPlatos('')
          setCantidades({})
          setBuscado('')
        }}
      />
    )
  }

  if (almacenes.length === 0) {
    return (
      <p className="text-ink/60 mx-auto mt-10 max-w-sm text-center text-sm">
        Sin víveres en los almacenes. Deben ingresar por compra o trasladarse al almacén de la
        cocina antes de servir.
      </p>
    )
  }

  const guardar = async () => {
    if (tipo === '') return
    const r = await servir.mutateAsync({
      tipo,
      platos: Number(platos),
      almacen_id: Number(almacenElegido),
      renglones: marcados.map((v) => ({ articulo_id: v.articulo_id, cantidad: Number(cantidades[v.articulo_id]) })),
      origen: 'TELEFONO',
    })
    const nombreTipo = TIPOS_DE_COMIDA.find((t) => t.tipo === tipo)
    setAcuse({
      texto: [
        `Comida ${r.numero}`,
        `${nombreTipo?.emoji ?? ''} ${nombreTipo?.nombre ?? tipo} · ${platos} platos`,
        ...marcados.map(
          (v) => `${v.articulo}: ${Number(cantidades[v.articulo_id]).toLocaleString('es-VE')} ${v.unidad}`,
        ),
        `Costo: ${dolares(r.valor_usd)} (${dolares(r.costo_por_plato_usd)} por plato)`,
      ].join('\n'),
      porPlato: dolares(r.costo_por_plato_usd),
    })
  }

  return (
    <div className="mx-auto max-w-md pb-28">
      <h1 className="text-ink/85 font-titular text-xl">¿Qué se sirvió?</h1>

      {/* Los tres tipos, en botones altos: es lo primero y lo que más se toca. */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {TIPOS_DE_COMIDA.map((t) => (
          <button
            key={t.tipo}
            type="button"
            onClick={() => setTipo(t.tipo)}
            className={cn(
              'rounded-card border px-2 py-4 text-center text-sm transition-colors',
              tipo === t.tipo
                ? 'border-royal-600 bg-royal-600/10 text-royal-700 font-medium'
                : 'border-hairline text-ink/70 active:bg-ink/5',
            )}
          >
            <span className="block text-2xl">{t.emoji}</span>
            {t.nombre}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        <Input
          label="Cuántos comieron"
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          value={platos}
          onChange={(e) => setPlatos(e.target.value)}
        />

        {almacenes.length > 1 ? (
          <SelectBuscable
            label="De qué almacén"
            vacio="El que tiene los víveres"
            valor={almacenElegido}
            onCambio={setAlmacen}
            opciones={almacenes.map((a) => ({ valor: String(a.id), etiqueta: a.nombre }))}
          />
        ) : null}

        {/* Lo que se gastó: la lista entera de víveres del almacén, con su
            cantidad al lado. Marcar es escribir la cantidad; no hay un paso
            aparte de «añadir línea», que en el teléfono son dos toques más. */}
        <div>
          <p className="text-ink/55 text-2xs mb-2 font-mono tracking-[0.16em] uppercase">Qué se gastó</p>
          {delAlmacen.length > 8 ? (
            <div className="mb-2">
              <Input
                label="Buscar"
                value={buscado}
                onChange={(e) => setBuscado(e.target.value)}
                placeholder="Buscar un víver…"
              />
            </div>
          ) : null}
          <ul className="divide-hairline border-hairline divide-y rounded-card border">
            {delAlmacen
              .filter((v) => !buscado.trim() || v.articulo.toLowerCase().includes(buscado.trim().toLowerCase()))
              .map((v) => {
                const cantidad = cantidades[v.articulo_id] ?? ''
                const pasa = cantidad !== '' && Number(cantidad) > Number(v.existencia)
                return (
                  <li key={v.articulo_id} className="flex items-center gap-2 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-sm', Number(cantidad) > 0 ? 'text-ink/90 font-medium' : 'text-ink/70')}>
                        {v.articulo}
                      </p>
                      <p className={cn('text-xs', pasa ? 'text-danger' : 'text-ink/40')}>
                        {pasa
                          ? `Solo hay ${Number(v.existencia).toLocaleString('es-VE')} ${v.unidad}`
                          : `hay ${Number(v.existencia).toLocaleString('es-VE')} ${v.unidad}`}
                      </p>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      inputMode="decimal"
                      placeholder="0"
                      value={cantidad}
                      onChange={(e) =>
                        setCantidades((c) => ({ ...c, [v.articulo_id]: e.target.value }))
                      }
                      className={cn(
                        'border-hairline bg-surface tabular w-24 rounded-[8px] border px-2 py-2.5 text-right text-sm',
                        pasa && 'border-danger',
                      )}
                    />
                  </li>
                )
              })}
          </ul>
        </div>

        {servir.error ? <ErrorDeCarga error={servir.error} /> : null}

        {tarda ? (
          <p className="border-warning/30 bg-warning-soft text-ink/80 rounded-card border p-3 text-sm">
            Está tardando por la señal. <strong>La comida ya se está guardando: no la cargue otra vez.</strong>
          </p>
        ) : null}
      </div>

      {/* El botón abajo, fijo, donde está el pulgar. */}
      <div className="bg-surface/95 border-hairline fixed inset-x-0 bottom-0 border-t p-4 backdrop-blur">
        <div className="mx-auto max-w-md">
          {valorEstimado > 0 && Number(platos) > 0 ? (
            <p className="text-ink/50 tabular mb-2 text-center text-xs">
              Saldría en {dolares(valorEstimado)} · {dolares(valorEstimado / Number(platos))} por plato
            </p>
          ) : null}
          <Button
            className="w-full py-4 text-base"
            icon={<UtensilsCrossed />}
            disabled={!valido || servir.isPending}
            onClick={() => void guardar()}
          >
            {servir.isPending ? 'Guardando…' : 'Guardar la comida'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────── el acuse */

function Acuse({ texto, porPlato, onOtra }: { texto: string; porPlato: string; onOtra: () => void }) {
  const compartir = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text: texto })
        return
      } catch {
        /* lo cerró: se cae a WhatsApp */
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
  }

  return (
    <div className="mx-auto max-w-md pt-6 text-center">
      <div className="bg-success/12 text-success mx-auto flex size-16 items-center justify-center rounded-full">
        <Check className="size-8" />
      </div>
      <h1 className="text-ink/85 font-titular mt-4 text-xl">Quedó anotada</h1>
      <p className="text-ink/60 mt-1 text-sm">Salió en {porPlato} por plato.</p>

      <pre className="border-hairline bg-ink/2 text-ink/70 mt-5 rounded-card border p-3 text-left text-xs whitespace-pre-wrap">
        {texto}
      </pre>

      <div className="mt-5 space-y-3">
        <Button className="w-full py-3.5" variant="outline" icon={<Share2 />} onClick={() => void compartir()}>
          Pasarla por WhatsApp
        </Button>
        <Button className="w-full py-3.5" icon={<UtensilsCrossed />} onClick={onOtra}>
          Otra comida
        </Button>
        <Link
          to="/app/alimentacion"
          className="text-ink/45 active:text-ink/80 block pt-1 text-sm underline decoration-dotted underline-offset-4"
        >
          Ver toda la alimentación
        </Link>
      </div>
    </div>
  )
}
