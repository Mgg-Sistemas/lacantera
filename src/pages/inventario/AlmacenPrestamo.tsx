import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Check, HandHelping, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { Input } from '@/components/ui/Input'
import { DeQuienSale } from '@/components/DeQuienSale'
import { faltaDecirDeQuien } from '@/lib/deQuien'
import { useMisRoles } from '@/lib/api/catalogo'
import { useAlmacenes, useExistencias } from '@/lib/api/inventario'
import { useEmpleados } from '@/lib/api/nomina'
import { useEntregables, useEntregarATrabajador } from '@/lib/api/asignaciones'
import { cn } from '@/lib/cn'

/*
  ENTREGAR UNA HERRAMIENTA O UN CONSUMIBLE, EN EL TELÉFONO.

  Christopher, 20/10/2026: un botón de salida para lo que no sigue el
  circuito de pedir-aprobar-entregar, porque no va a un centro de costo ni a
  un cliente: va a una persona. Es la misma puerta de Asignaciones
  (`Entregar.tsx`) — préstamo o consumible, lo decide el catálogo de cada
  artículo, no esta pantalla — con el molde de la cocina y el surtidor: lista
  plana, cantidades en línea, acuse por WhatsApp.
*/

const SEGUNDOS_PARA_AVISAR_DE_LA_SEÑAL = 12

export function AlmacenPrestamo() {
  const { puede } = useMisRoles()
  const puedeEntregar = puede('ALMACEN', 'RRHH', 'ADMIN')
  const { data: empleados } = useEmpleados(true)
  const { data: almacenes, isPending: cargandoAlmacenes } = useAlmacenes()
  const entregar = useEntregarATrabajador()

  const [empleado, setEmpleado] = useState('')
  const [almacen, setAlmacen] = useState('')
  const [clase, setClase] = useState<'DOTACION' | 'ASIGNACION'>('ASIGNACION')
  const [cuantas, setCuantas] = useState<Record<number, string>>({})
  const [saleDe, setSaleDe] = useState<Record<number, string>>({})
  const [buscado, setBuscado] = useState('')
  const [nota, setNota] = useState('')
  const [acuse, setAcuse] = useState<{ texto: string } | null>(null)
  const [tarda, setTarda] = useState(false)

  useEffect(() => {
    if (!entregar.isPending) {
      setTarda(false)
      return
    }
    const t = setTimeout(() => setTarda(true), SEGUNDOS_PARA_AVISAR_DE_LA_SEÑAL * 1000)
    return () => clearTimeout(t)
  }, [entregar.isPending])

  const almacenElegido = almacen || (almacenes && almacenes.length === 1 ? String(almacenes[0].id) : '')

  const disponibles = useEntregables(almacenElegido ? Number(almacenElegido) : undefined)
  const existencias = useExistencias(almacenElegido ? Number(almacenElegido) : undefined, Boolean(almacenElegido))
  const duenosDe = (articuloId: number) =>
    (existencias.data ?? []).find((e) => e.articulo_id === articuloId)?.duenos

  const renglones = Object.entries(cuantas)
    .map(([articulo_id, c]) => ({
      articulo_id: Number(articulo_id),
      cantidad: Number(c),
      propietario: saleDe[Number(articulo_id)] || null,
    }))
    .filter((r) => r.cantidad > 0)

  const faltaDueno = renglones.some((r) =>
    faltaDecirDeQuien(duenosDe(r.articulo_id), r.propietario ?? ''),
  )

  const valido = Boolean(empleado) && Boolean(almacenElegido) && renglones.length > 0 && !faltaDueno

  if (cargandoAlmacenes) return <Cargando />

  if (!puedeEntregar) {
    return (
      <p className="text-ink/60 mx-auto mt-10 max-w-sm text-center text-sm">
        Entregar material a un trabajador lo hace almacén, recursos humanos o administración.
      </p>
    )
  }

  if (acuse) {
    return (
      <Acuse
        texto={acuse.texto}
        onOtra={() => {
          setAcuse(null)
          setEmpleado('')
          setCuantas({})
          setSaleDe({})
          setBuscado('')
          setNota('')
        }}
      />
    )
  }

  const guardar = async () => {
    const lista = disponibles.data ?? []
    const resultado = await entregar.mutateAsync({
      empleado_id: Number(empleado),
      almacen_id: Number(almacenElegido),
      renglones,
      clase,
      nota: nota.trim() || null,
    })

    const quien = empleados?.find((e) => String(e.id) === empleado)
    const texto = [
      '🤝 Entrega registrada',
      quien ? `${quien.nombres} ${quien.apellidos} · ficha ${quien.ficha}` : '',
      clase === 'DOTACION' ? 'Dotación' : 'Asignación (préstamo)',
      ...renglones.map((r) => {
        const art = lista.find((x) => x.articulo_id === r.articulo_id)
        return `${art?.articulo ?? '—'}: ${r.cantidad.toLocaleString('es-VE')} ${art?.unidad ?? ''}`
      }),
      `Prestado: ${resultado.prestados} · Consumido: ${resultado.consumidos}`,
    ]
      .filter(Boolean)
      .join('\n')

    setAcuse({ texto })
  }

  const delAlmacen = (disponibles.data ?? []).filter(
    (v) => !buscado.trim() || v.articulo.toLowerCase().includes(buscado.trim().toLowerCase()),
  )

  return (
    <div className="mx-auto max-w-md pb-28">
      <Link
        to="/app/inventario/almacen"
        className="text-ink/45 active:text-ink/80 mb-3 inline-block text-sm underline decoration-dotted underline-offset-4"
      >
        ← Atrás
      </Link>
      <h1 className="text-ink/85 font-titular text-xl">Entregar a un trabajador</h1>
      <p className="text-ink/55 mt-1 text-sm">
        Lo retornable queda a su nombre; lo consumible se descuenta del almacén. Lo decide cada
        artículo, no esta casilla.
      </p>

      <div className="mt-4 space-y-4">
        <SelectBuscable
          label="Trabajador"
          vacio="Elija el trabajador"
          valor={empleado}
          onCambio={setEmpleado}
          opciones={(empleados ?? []).map((e) => ({
            valor: String(e.id),
            etiqueta: `${e.nombres} ${e.apellidos} · ficha ${e.ficha}`,
          }))}
        />

        {almacenes && almacenes.length > 1 ? (
          <SelectBuscable
            label="Almacén"
            vacio="Elija el almacén"
            valor={almacenElegido}
            onCambio={(v) => {
              setAlmacen(v)
              setCuantas({})
              setSaleDe({})
            }}
            opciones={almacenes.map((a) => ({ valor: String(a.id), etiqueta: a.nombre }))}
          />
        ) : null}

        <div>
          <p className="text-ink/55 text-2xs mb-2 font-mono tracking-[0.16em] uppercase">
            Clase de entrega
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { valor: 'ASIGNACION' as const, titulo: 'Préstamo', detalle: 'Vuelve. Para una faena.' },
                { valor: 'DOTACION' as const, titulo: 'Dotación', detalle: 'Por su rol, mientras trabaje.' },
              ]
            ).map((o) => (
              <button
                key={o.valor}
                type="button"
                onClick={() => setClase(o.valor)}
                className={cn(
                  'rounded-[8px] border p-3 text-left transition-colors',
                  clase === o.valor ? 'border-royal-600 bg-royal-600/8' : 'border-ink/15 active:bg-ink/5',
                )}
              >
                <p className={cn('text-sm font-medium', clase === o.valor ? 'text-ink/90' : 'text-ink/70')}>
                  {o.titulo}
                </p>
                <p className="text-ink/50 mt-0.5 text-xs">{o.detalle}</p>
              </button>
            ))}
          </div>
          <p className="text-ink/40 text-2xs mt-2 leading-relaxed">
            Esto no decide si el bien vuelve: eso lo dice cada artículo en el catálogo.
          </p>
        </div>

        {!almacenElegido ? null : (
          <div>
            <p className="text-ink/55 text-2xs mb-2 font-mono tracking-[0.16em] uppercase">
              Qué se lleva
            </p>
            {delAlmacen.length > 8 ? (
              <Input
                label="Buscar"
                ocultarEtiqueta
                value={buscado}
                onChange={(e) => setBuscado(e.target.value)}
                placeholder="Buscar un artículo…"
                className="mb-2"
              />
            ) : null}
            {disponibles.isPending ? (
              <Cargando />
            ) : delAlmacen.length === 0 ? (
              <p className="text-ink/45 text-sm">Sin bienes disponibles en este almacén.</p>
            ) : (
              <ul className="divide-hairline border-hairline divide-y rounded-card border">
                {delAlmacen.map((v) => {
                  const cantidad = cuantas[v.articulo_id] ?? ''
                  const pasa = cantidad !== '' && Number(cantidad) > Number(v.disponibles)
                  const duenos = duenosDe(v.articulo_id)
                  const faltaEste =
                    Number(cantidad) > 0 && faltaDecirDeQuien(duenos, saleDe[v.articulo_id] ?? '')
                  return (
                    <li key={v.articulo_id} className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'text-sm',
                              Number(cantidad) > 0 ? 'text-ink/90 font-medium' : 'text-ink/70',
                            )}
                          >
                            {v.articulo}
                          </p>
                          <p className={cn('text-xs', pasa ? 'text-danger' : 'text-ink/40')}>
                            {pasa
                              ? `Solo hay ${Number(v.disponibles).toLocaleString('es-VE')} ${v.unidad}`
                              : `hay ${Number(v.disponibles).toLocaleString('es-VE')} ${v.unidad}`}
                          </p>
                        </div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          placeholder="0"
                          value={cantidad}
                          onChange={(e) =>
                            setCuantas((c) => ({ ...c, [v.articulo_id]: e.target.value }))
                          }
                          className={cn(
                            'border-hairline bg-surface tabular h-10 w-24 rounded-[8px] border px-2 text-right text-sm',
                            pasa && 'border-danger',
                          )}
                        />
                      </div>
                      {Number(cantidad) > 0 && duenos && duenos.length > 1 ? (
                        <div className="mt-2">
                          <DeQuienSale
                            duenos={duenos}
                            valor={saleDe[v.articulo_id] ?? ''}
                            onCambio={(val) =>
                              setSaleDe((s) => ({ ...s, [v.articulo_id]: val }))
                            }
                          />
                        </div>
                      ) : null}
                      {faltaEste ? (
                        <p className="text-danger mt-1 text-xs">Falta decir de quién sale.</p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        <Textarea label="Nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />

        {entregar.error ? <ErrorDeCarga error={entregar.error} /> : null}

        {tarda ? (
          <p className="border-warning/30 bg-warning-soft text-ink/80 rounded-card border p-3 text-sm">
            Está tardando por la señal. <strong>Ya se está guardando: no la cargue otra vez.</strong>
          </p>
        ) : null}
      </div>

      <div className="bg-surface/95 border-hairline fixed inset-x-0 bottom-0 border-t p-4 backdrop-blur">
        <div className="mx-auto max-w-md">
          <Button
            className="w-full py-4 text-base"
            icon={<HandHelping />}
            disabled={!valido || entregar.isPending}
            onClick={() => void guardar()}
          >
            {entregar.isPending ? 'Guardando…' : 'Entregar'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Acuse({ texto, onOtra }: { texto: string; onOtra: () => void }) {
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
      <h1 className="text-ink/85 font-titular mt-4 text-xl">Quedó entregada</h1>

      <pre className="border-hairline bg-ink/2 text-ink/70 mt-5 rounded-card border p-3 text-left text-xs whitespace-pre-wrap">
        {texto}
      </pre>

      <div className="mt-5 space-y-3">
        <Button className="w-full py-3.5" variant="outline" icon={<Share2 />} onClick={() => void compartir()}>
          Pasarla por WhatsApp
        </Button>
        <Button className="w-full py-3.5" icon={<HandHelping />} onClick={onOtra}>
          Otra entrega
        </Button>
        <Link
          to="/app/inventario/almacen"
          className="text-ink/45 active:text-ink/80 block pt-1 text-sm underline decoration-dotted underline-offset-4"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
