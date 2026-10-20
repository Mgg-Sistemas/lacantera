import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Check, PackagePlus, Plus, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { CantidadDeArticulo } from '@/components/CantidadDeArticulo'
import { CostoDeArticulo } from '@/components/CostoDeArticulo'
import { AvisoDeCosto } from '@/components/AvisoDeCosto'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useAlmacenes, useRegistrarEntradas } from '@/lib/api/inventario'
import {
  conSusFormas,
  opcionesDeCategoria,
  useArticulos,
  useCategoriasDeInventario,
  useCrearArticulo,
  useTodasLasPresentaciones,
  useUnidades,
} from '@/lib/api/catalogo'
import { useMonedasUsables, enSimbolos } from '@/lib/api/tasas'
import { cn } from '@/lib/cn'

/*
  REGISTRAR ENTRADA, EN EL TELÉFONO.

  Christopher, 19/10/2026: una vista de teléfono para Inventario, con el
  mismo molde del surtidor y la cocina (20261005105213, 20261005115952):
  botones grandes, teclado numérico, aviso de mala señal a los doce
  segundos, y un acuse que se pasa por WhatsApp.

  SE QUEDA CON LOS MISMOS CAMPOS DEL ESCRITORIO, no con una versión recortada.
  El costo mueve el promedio de todo lo que hay de ese artículo, y el aviso
  cuando se sale diez veces de lo normal es justo lo que evitó que el error
  del 5/09/2026 se repitiera — quitarlo del teléfono sería quitarlo donde más
  falta hace, porque es desde ahí donde de verdad entra el material.
*/

const SEGUNDOS_PARA_AVISAR_DE_LA_SEÑAL = 12

interface RenglonEnCurso {
  clave: string
  articulo: string
  cantidad: string
  presentaciones: number | null
  presentacion: string | null
  sueltas: string
  costo: string
  moneda: string
  confirmado: boolean
  sinValor: boolean
}

let siguienteClave = 0
const renglonVacio = (): RenglonEnCurso => ({
  clave: String(++siguienteClave),
  articulo: '',
  cantidad: '',
  presentaciones: null,
  presentacion: null,
  sueltas: '',
  costo: '',
  moneda: '',
  confirmado: false,
  sinValor: false,
})

export function AlmacenEntrada() {
  const { puede } = useMisPermisos()
  const puedeEntrar = puede('INVENTARIO', 'ESCRITURA')
  const { data: almacenes, isPending: cargandoAlmacenes } = useAlmacenes()
  const { data: articulos } = useArticulos()
  const { data: formasDeContar } = useTodasLasPresentaciones()
  const monedas = useMonedasUsables()
  const entrada = useRegistrarEntradas()

  const [almacen, setAlmacen] = useState('')
  const [renglones, setRenglones] = useState<RenglonEnCurso[]>([renglonVacio()])
  const [referencia, setReferencia] = useState('')
  const [motivo, setMotivo] = useState('')
  const [acuse, setAcuse] = useState<{ texto: string } | null>(null)
  const [tarda, setTarda] = useState(false)
  // La clave del renglón para el que se está dando de alta un artículo nuevo,
  // o null si el formulario de alta está cerrado.
  const [creandoPara, setCreandoPara] = useState<string | null>(null)

  useEffect(() => {
    if (!entrada.isPending) {
      setTarda(false)
      return
    }
    const t = setTimeout(() => setTarda(true), SEGUNDOS_PARA_AVISAR_DE_LA_SEÑAL * 1000)
    return () => clearTimeout(t)
  }, [entrada.isPending])

  // El tanque sin costo no es destino de una entrada con precio: ver el
  // comentario del mismo filtro en Existencias.tsx.
  const sitios = (almacenes ?? []).filter((a) => !a.admite_sin_costo)
  const almacenElegido = almacen || (sitios.length === 1 ? String(sitios[0].id) : '')

  const pon = (clave: string, cambios: Partial<RenglonEnCurso>) =>
    setRenglones((xs) => xs.map((x) => (x.clave === clave ? { ...x, ...cambios } : x)))

  const listos = renglones.filter(
    (r) => r.articulo && r.cantidad.trim() !== '' && (r.costo.trim() !== '' || r.sinValor),
  )

  const valido =
    almacenElegido !== '' &&
    listos.length > 0 &&
    !renglones.some((r) => r.articulo && r.cantidad && r.costo && !r.sinValor && !r.moneda) &&
    motivo.trim().length >= 4

  if (cargandoAlmacenes) return <Cargando />

  if (!puedeEntrar) {
    return (
      <p className="text-ink/60 mx-auto mt-10 max-w-sm text-center text-sm">
        Su usuario puede ver el inventario, pero no registrar entradas. Hace falta el permiso de
        escritura en Inventario.
      </p>
    )
  }

  if (acuse) {
    return (
      <Acuse
        texto={acuse.texto}
        onOtra={() => {
          setAcuse(null)
          setAlmacen('')
          setRenglones([renglonVacio()])
          setReferencia('')
          setMotivo('')
        }}
      />
    )
  }

  const guardar = async () => {
    await entrada.mutateAsync({
      almacen_id: Number(almacenElegido),
      renglones: listos.map((r) => ({
        articulo_id: Number(r.articulo),
        cantidad: r.presentaciones ? Number(r.sueltas || 0) : Number(r.cantidad || 0),
        presentaciones: r.presentaciones ?? null,
        presentacion: r.presentacion ?? null,
        costo: Number(r.costo || 0),
        moneda: r.moneda,
        confirmado: r.confirmado === true,
        sin_valor: r.sinValor === true,
      })),
      motivo,
      referencia: referencia || null,
    })

    const sitio = sitios.find((a) => String(a.id) === almacenElegido)
    const texto = [
      '📦 Entrada registrada',
      sitio?.nombre ?? '',
      ...listos.map((r) => {
        const art = (articulos ?? []).find((a) => String(a.id) === r.articulo)
        const cant = r.presentaciones
          ? `${r.presentaciones} ${r.presentacion} + ${r.sueltas || 0} ${art?.unidad ?? ''}`
          : `${Number(r.cantidad).toLocaleString('es-VE')} ${art?.unidad ?? ''}`
        return `${art?.nombre ?? '—'}: ${cant}${r.sinValor ? ' (sin valorar)' : ''}`
      }),
      referencia ? `De: ${referencia}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    setAcuse({ texto })
  }

  return (
    <div className="mx-auto max-w-md pb-28">
      <Link
        to="/app/inventario/almacen"
        className="text-ink/45 active:text-ink/80 mb-3 inline-block text-sm underline decoration-dotted underline-offset-4"
      >
        ← Atrás
      </Link>
      <h1 className="text-ink/85 font-titular text-xl">Registrar entrada</h1>

      <div className="mt-4 space-y-4">
        <SelectBuscable
          label="Almacén"
          vacio="Seleccione el sitio"
          valor={almacenElegido}
          onCambio={(v) => {
            setAlmacen(v)
            setRenglones((lista) => lista.map((x) => ({ ...x, confirmado: false })))
          }}
          opciones={sitios.map((a) => ({ valor: String(a.id), etiqueta: a.nombre }))}
        />

        <div>
          <p className="text-ink/55 text-2xs mb-2 font-mono tracking-[0.16em] uppercase">
            Artículos
          </p>
          <div className="space-y-3">
            {renglones.map((r, i) => {
              const art = conSusFormas(
                (articulos ?? []).find((a) => String(a.id) === r.articulo),
                formasDeContar,
              )
              const cant = Number(r.cantidad)
              const costo = Number(r.costo)

              return (
                <div
                  key={r.clave}
                  className="border-hairline rounded-card border border-dashed p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-ink/40 text-2xs font-mono tracking-[0.16em] uppercase">
                      Artículo {i + 1}
                    </span>
                    {renglones.length > 1 ? (
                      <button
                        type="button"
                        className="text-ink/40 hover:text-danger text-xs underline underline-offset-2"
                        onClick={() => setRenglones((v) => v.filter((x) => x.clave !== r.clave))}
                      >
                        Quitar
                      </button>
                    ) : null}
                  </div>

                  <SelectBuscable
                    label="Artículo"
                    vacio="Busque el artículo…"
                    valor={r.articulo}
                    onCambio={(v) =>
                      pon(r.clave, {
                        articulo: v,
                        cantidad: '',
                        costo: '',
                        presentaciones: null,
                        presentacion: null,
                        sueltas: '',
                        confirmado: false,
                      })
                    }
                    opciones={(articulos ?? [])
                      .filter((a) => a.inventariable)
                      .map((a) => ({
                        valor: String(a.id),
                        codigo: a.codigo,
                        nombre: a.nombre,
                        detalle: `${a.categoria} · ${a.unidad}`,
                      }))}
                  />
                  <button
                    type="button"
                    className="text-royal-600 mt-1.5 text-xs underline decoration-dotted underline-offset-4"
                    onClick={() => setCreandoPara(r.clave)}
                  >
                    No está en el catálogo: darlo de alta
                  </button>

                  <div className="mt-3 space-y-3">
                    <CantidadDeArticulo
                      key={`cantidad-${r.articulo}`}
                      valor={r.cantidad}
                      onCambiar={(v, cap) =>
                        pon(r.clave, {
                          cantidad: v,
                          presentaciones: cap.presentaciones,
                          presentacion: cap.unidad,
                          sueltas: String(cap.sueltas ?? ''),
                          confirmado: false,
                        })
                      }
                      articulo={art}
                    />

                    <CostoDeArticulo
                      key={`costo-${r.articulo}`}
                      valor={r.costo}
                      onCambiar={(v) => pon(r.clave, { costo: v, confirmado: false })}
                      articulo={art}
                      moneda={r.moneda}
                      disabled={r.sinValor}
                    />

                    <Select
                      label="Moneda"
                      vacio="Seleccione"
                      value={r.moneda}
                      error={!r.sinValor && r.costo.trim() !== '' && !r.moneda ? 'Falta la moneda' : undefined}
                      onChange={(e) => pon(r.clave, { moneda: e.target.value, confirmado: false })}
                      opciones={enSimbolos(monedas.data)}
                    />

                    <label
                      className={cn(
                        'flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm',
                        r.sinValor ? 'border-warning/30 bg-warning-soft' : 'border-hairline',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="accent-royal-600 mt-0.5 size-4 shrink-0"
                        checked={r.sinValor}
                        onChange={(e) =>
                          pon(r.clave, {
                            sinValor: e.target.checked,
                            costo: e.target.checked ? '' : r.costo,
                            confirmado: false,
                          })
                        }
                      />
                      <span className="text-ink/80">Donación, o no se sabe cuánto costó</span>
                    </label>
                  </div>

                  <AvisoDeCosto
                    almacenId={Number(almacenElegido) || null}
                    articuloId={Number(r.articulo) || null}
                    costo={costo}
                    moneda={r.moneda}
                    cantidad={cant}
                    unidad={art?.unidad ?? ''}
                    nombre={art?.nombre ?? 'Este artículo'}
                    confirmado={r.confirmado}
                    onConfirmar={(v) => pon(r.clave, { confirmado: v })}
                  />
                </div>
              )
            })}
          </div>

          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            icon={<Plus />}
            onClick={() => setRenglones((v) => [...v, renglonVacio()])}
          >
            Otro artículo
          </Button>
        </div>

        <Input
          label="Referencia"
          hint="Quién lo trajo, o el número de una factura de fuera."
          value={referencia}
          onChange={(e) => setReferencia(e.target.value)}
        />

        <Textarea
          label="Procedencia"
          rows={2}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          hint="De dónde vino. Queda en el libro y no se puede editar después."
        />

        {entrada.error ? <ErrorDeCarga error={entrada.error} /> : null}

        {tarda ? (
          <p className="border-warning/30 bg-warning-soft text-ink/80 rounded-card border p-3 text-sm">
            Está tardando por la señal. <strong>La entrada ya se está guardando: no la cargue otra vez.</strong>
          </p>
        ) : null}
      </div>

      <div className="bg-surface/95 border-hairline fixed inset-x-0 bottom-0 border-t p-4 backdrop-blur">
        <div className="mx-auto max-w-md">
          <Button
            className="w-full py-4 text-base"
            icon={<PackagePlus />}
            disabled={!valido || entrada.isPending}
            onClick={() => void guardar()}
          >
            {entrada.isPending ? 'Guardando…' : 'Guardar entrada'}
          </Button>
        </div>
      </div>

      {creandoPara ? (
        <NuevoArticulo
          onCerrar={() => setCreandoPara(null)}
          onCreado={(id) => {
            pon(creandoPara, { articulo: String(id) })
            setCreandoPara(null)
          }}
        />
      ) : null}
    </div>
  )
}

/* ──────────────────────────────────────── dar de alta un artículo nuevo */

/**
 * Lo mínimo para que el artículo exista y se pueda recibir: nombre,
 * categoría y unidad. El código se pone solo, igual que en el catálogo de
 * escritorio; lo demás —descripción, mínimo, marca— se completa después,
 * desde Inventario › Catálogo, si hace falta.
 */
function NuevoArticulo({
  onCerrar,
  onCreado,
}: {
  onCerrar: () => void
  onCreado: (articuloId: number) => void
}) {
  const { data: categorias } = useCategoriasDeInventario()
  const { data: unidades } = useUnidades()
  const crear = useCrearArticulo()

  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState('')
  const [unidad, setUnidad] = useState('')

  const valido = nombre.trim().length >= 3 && categoria !== '' && unidad !== ''

  const guardar = async () => {
    const id = await crear.mutateAsync({
      codigo: '',
      nombre: nombre.trim(),
      categoria,
      unidad,
      inventariable: true,
    })
    onCreado(id)
  }

  return (
    <Modal
      abierto
      ancho="sm"
      onCerrar={onCerrar}
      titulo="Nuevo artículo"
      descripcion="Lo mínimo para recibirlo hoy. El código se pone solo."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button disabled={!valido || crear.isPending} onClick={() => void guardar()}>
            {crear.isPending ? 'Creando…' : 'Crear y usar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <Select
          label="Categoría"
          vacio="Seleccione"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          opciones={opcionesDeCategoria(categorias)}
        />
        <Select
          label="Unidad"
          vacio="Seleccione"
          value={unidad}
          onChange={(e) => setUnidad(e.target.value)}
          opciones={(unidades ?? []).map((u) => ({ valor: u.codigo, etiqueta: `${u.nombre} (${u.codigo})` }))}
        />
        {crear.error ? <ErrorDeCarga error={crear.error} /> : null}
      </div>
    </Modal>
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
      <h1 className="text-ink/85 font-titular mt-4 text-xl">Quedó registrada</h1>

      <pre className="border-hairline bg-ink/2 text-ink/70 mt-5 rounded-card border p-3 text-left text-xs whitespace-pre-wrap">
        {texto}
      </pre>

      <div className="mt-5 space-y-3">
        <Button className="w-full py-3.5" variant="outline" icon={<Share2 />} onClick={() => void compartir()}>
          Pasarla por WhatsApp
        </Button>
        <Button className="w-full py-3.5" icon={<PackagePlus />} onClick={onOtra}>
          Otra entrada
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
