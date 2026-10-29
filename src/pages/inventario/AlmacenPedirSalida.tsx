import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Check, Plus, SendHorizontal, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { CantidadDeArticulo } from '@/components/CantidadDeArticulo'
import { DeQuienSale } from '@/components/DeQuienSale'
import { ElegirArchivosDeCarga } from '@/components/FotosDeCarga'
import { useVehiculos } from '@/lib/api/vehiculos'
import { conSusFormas, useArticulos, useTodasLasPresentaciones } from '@/lib/api/catalogo'
import { useMisPermisos } from '@/lib/api/usuarios'
import { palabraDeVenta, usePedirSalida } from '@/lib/api/salidas'
import { useMiFirma } from '@/lib/api/firmas'
import { subirFotosDeCarga } from '@/lib/api/fotosDeCarga'
import { useExistencias, useGruposDeSalida } from '@/lib/api/inventario'
import { porQueNoSubio } from '@/lib/castellano'
import { ParaQuienSale, paraQuienVa, type AmbitoDeSalida } from '@/pages/salidas/ModalSalida'

/*
  PEDIR SALIDA, EN EL TELÉFONO.

  Christopher, 29/10/2026: la tarjeta «Salida» de la portada solo entregaba lo
  ya aprobado —ver AlmacenSalida.tsx—; para pedir material había que ir al
  escritorio. Mismo molde que AlmacenEntrada.tsx: los mismos campos del
  formulario de escritorio (`ModalSalida` en modo «pedir»), no una versión
  recortada, solo repartidos en una pantalla propia. «¿Quién lo recibe?» se
  reutiliza tal cual desde allá —no se vuelve a escribir esa lógica—.

  Solo hace falta LECTURA en Salidas para pedir: es la misma regla que aplica
  `pedir_salida` en la base. Entregar sigue pidiendo ESCRITURA, que es harina
  de otro costal y vive en AlmacenSalida.tsx.
*/

const cantidadLegible = (v: string | number): string =>
  Number(v).toLocaleString('es-VE', { maximumFractionDigits: 2 })

interface RenglonEnCurso {
  clave: string
  articulo: string
  almacen: string
  cantidad: string
  presentaciones?: number | null
  presentacion?: string | null
  sueltas?: string
  propietario?: string
}

let siguienteClave = 0
const renglonVacio = (): RenglonEnCurso => ({
  clave: String(++siguienteClave),
  articulo: '',
  almacen: '',
  cantidad: '',
})

export function AlmacenPedirSalida() {
  const { puede } = useMisPermisos()
  const puedePedir = puede('SALIDAS', 'LECTURA')

  const pedido = usePedirSalida()
  const { data: miFirma } = useMiFirma()
  const [conMiFirma, setConMiFirma] = useState(false)

  const [llevaRecibido, setLlevaRecibido] = useState(false)
  const [vehiculoId, setVehiculoId] = useState('')
  const [vehiculoEscrito, setVehiculoEscrito] = useState('')
  const [recibeNombre, setRecibeNombre] = useState('')
  const [recibeCedula, setRecibeCedula] = useState('')
  const { data: vehiculos } = useVehiculos()
  const [archivos, setArchivos] = useState<File[]>([])
  const [subiendo, setSubiendo] = useState(false)

  const grupos = useGruposDeSalida()
  const { data: articulos } = useArticulos()
  const { data: formasDeContar } = useTodasLasPresentaciones()
  const todas = useExistencias(undefined, puedePedir)

  const [renglones, setRenglones] = useState<RenglonEnCurso[]>([renglonVacio()])
  const [almacenPedido, setAlmacenPedido] = useState('')
  const [ambito, setAmbito] = useState<AmbitoDeSalida>('')
  const [grupo, setGrupo] = useState('')
  const [externo, setExterno] = useState('')
  const [responsable, setResponsable] = useState('')
  const [motivo, setMotivo] = useState('')
  const [acuse, setAcuse] = useState<{ texto: string; numeros: string[] } | null>(null)

  const sitioDe = (r: RenglonEnCurso) => r.almacen || almacenPedido

  const hayEn = (almacen: string, articulo: string) =>
    Number(
      (todas.data ?? []).find(
        (e) => String(e.almacen_id) === almacen && String(e.articulo_id) === articulo,
      )?.disponibles ?? 0,
    )

  const pedidoHasta = (indice: number, almacen: string, articulo: string) =>
    renglones
      .slice(0, indice)
      .filter((x) => sitioDe(x) === almacen && x.articulo === articulo)
      .reduce((total, x) => total + Number(x.cantidad || 0), 0)

  const articulosConExistencia = useMemo(() => {
    const porArticulo = new Map<
      string,
      { codigo: string; nombre: string; unidad: string; total: number; sitios: number }
    >()
    for (const e of todas.data ?? []) {
      if (Number(e.disponibles) <= 0) continue
      const clave = String(e.articulo_id)
      const ya = porArticulo.get(clave)
      if (ya) {
        ya.total += Number(e.disponibles)
        ya.sitios += 1
      } else {
        porArticulo.set(clave, {
          codigo: e.articulo_codigo,
          nombre: e.articulo,
          unidad: e.unidad,
          total: Number(e.disponibles),
          sitios: 1,
        })
      }
    }
    return [...porArticulo.entries()].map(([valor, v]) => ({
      valor,
      codigo: v.codigo,
      nombre: v.nombre,
      detalle: `${cantidadLegible(v.total)} ${v.unidad} · ${v.sitios === 1 ? 'un sitio' : `${v.sitios} sitios`}`,
    }))
  }, [todas.data])

  const sitiosConMaterial = useMemo(() => {
    const porSitio = new Map<string, { codigo: string; nombre: string; cuantos: number }>()
    for (const e of todas.data ?? []) {
      if (Number(e.disponibles) <= 0) continue
      const clave = String(e.almacen_id)
      const ya = porSitio.get(clave)
      if (ya) ya.cuantos += 1
      else porSitio.set(clave, { codigo: e.almacen_codigo, nombre: e.almacen, cuantos: 1 })
    }
    return [...porSitio.entries()].map(([valor, v]) => ({
      valor,
      codigo: v.codigo,
      nombre: v.nombre,
      detalle: `${v.cuantos} artículo${v.cuantos === 1 ? '' : 's'}`,
    }))
  }, [todas.data])

  const buenos = renglones.filter((r) => r.articulo && sitioDe(r) && Number(r.cantidad) > 0)
  const solicitudesQueSalen = new Set(buenos.map(sitioDe)).size
  const materialSinAlmacen = renglones.some((r) => r.articulo && !sitioDe(r))

  const enPie =
    buenos.length > 0 &&
    renglones.every(
      (r, i) =>
        !r.articulo ||
        !sitioDe(r) ||
        Number(r.cantidad || 0) <= 0 ||
        Number(r.cantidad) + pedidoHasta(i, sitioDe(r), r.articulo) <= hayEn(sitioDe(r), r.articulo),
    )

  const faltaElDetalle = motivo.trim().length < 10
  const ventaEnElMotivo = palabraDeVenta(motivo)
  const faltaDecirParaQuien =
    !ambito ||
    (ambito === 'EMPRESA' && !grupo) ||
    (ambito === 'FUERA' && (externo.trim().length < 3 || responsable.trim().length < 3))

  const valido =
    enPie && !materialSinAlmacen && !faltaDecirParaQuien && !faltaElDetalle && ventaEnElMotivo === null

  if (!puedePedir) {
    return (
      <p className="text-ink/60 mx-auto mt-10 max-w-sm text-center text-sm">
        Su usuario no tiene acceso a Salidas.
      </p>
    )
  }

  if (todas.isPending) return <Cargando />

  if (acuse) {
    return (
      <Acuse
        texto={acuse.texto}
        titulo={acuse.numeros.length > 1 ? 'Solicitudes enviadas' : 'Solicitud enviada'}
        onOtra={() => {
          setAcuse(null)
          setRenglones([renglonVacio()])
          setAlmacenPedido('')
          setAmbito('')
          setGrupo('')
          setExterno('')
          setResponsable('')
          setMotivo('')
          setArchivos([])
        }}
      />
    )
  }

  const pedir = async () => {
    const numeros = (await pedido.mutateAsync({
      renglones: buenos.map((r) => ({
        almacen_id: Number(sitioDe(r)),
        articulo_id: Number(r.articulo),
        cantidad: r.presentaciones ? Number(r.sueltas || 0) : Number(r.cantidad || 0),
        presentaciones: r.presentaciones ?? null,
        presentacion: r.presentacion ?? null,
        propietario: r.propietario || null,
      })),
      motivo,
      ...paraQuienVa(ambito, grupo, externo, responsable),
      con_firma: miFirma?.usar === true && conMiFirma,
      ...(llevaRecibido
        ? {
            vehiculo_id: vehiculoId ? Number(vehiculoId) : null,
            vehiculo: vehiculoId ? null : vehiculoEscrito,
            recibio_nombre: recibeNombre,
            recibio_cedula: recibeCedula,
            lleva_recibido: true,
          }
        : {}),
    })) as string[]

    let aviso = ''
    if (archivos.length > 0) {
      setSubiendo(true)
      try {
        await subirFotosDeCarga('SALIDA', numeros, archivos)
      } catch (e) {
        aviso = `\n\nLas fotos no subieron${porQueNoSubio(e)} Añádalas desde Salidas en el escritorio.`
      } finally {
        setSubiendo(false)
      }
    }

    const texto =
      [
        `📦 ${numeros.length > 1 ? `Solicitudes ${numeros.join(', ')}` : `Solicitud ${numeros[0]}`}`,
        `Para: ${motivo}`,
        ...buenos.map((r) => {
          const art = (articulos ?? []).find((a) => String(a.id) === r.articulo)
          const cant = r.presentaciones
            ? `${r.presentaciones} ${r.presentacion} + ${r.sueltas || 0} ${art?.unidad ?? ''}`
            : `${cantidadLegible(r.cantidad)} ${art?.unidad ?? ''}`
          return `${art?.nombre ?? '—'}: ${cant}`
        }),
        'Falta que la apruebe quien responde por el almacén, o quien tenga el permiso de aprobar salidas.',
      ].join('\n') + aviso

    setAcuse({ texto, numeros })
  }

  return (
    <div className="mx-auto max-w-md pb-28">
      <Link
        to="/app/inventario/almacen/salida"
        className="text-ink/45 active:text-ink/80 mb-3 inline-block text-sm underline decoration-dotted underline-offset-4"
      >
        ← Atrás
      </Link>
      <h1 className="text-ink/85 font-titular text-xl">Solicitar salida</h1>
      <p className="text-ink/55 mt-1 text-sm">
        Pide al almacén que entregue material que ya tiene. No descuenta nada hasta que la apruebe
        quien responde por el almacén y alguien de almacén la entregue.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <SelectBuscable
            label="Almacén predeterminado"
            vacio="Seleccione el sitio"
            valor={almacenPedido}
            onCambio={setAlmacenPedido}
            opciones={sitiosConMaterial}
          />
          <p className="text-ink/45 mt-1.5 text-xs">
            Es el de todos los renglones que no digan otro. Si algún material sale de otro almacén,
            se elige en su renglón.
          </p>
        </div>

        <div>
          <p className="text-ink/55 text-2xs mb-2 font-mono tracking-[0.16em] uppercase">Material</p>
          <div className="space-y-3">
            {renglones.map((r, i) => {
              const sitios = (todas.data ?? []).filter(
                (e) => String(e.articulo_id) === r.articulo && Number(e.disponibles) > 0,
              )
              const unidad = sitios[0]?.unidad ?? ''
              const artSale = conSusFormas(
                (articulos ?? []).find((a) => String(a.id) === r.articulo),
                formasDeContar,
              )
              const sitio = sitioDe(r)
              const disponible = hayEn(sitio, r.articulo) - pedidoHasta(i, sitio, r.articulo)
              const pasado = Boolean(r.articulo && sitio && Number(r.cantidad) > disponible)
              const sitioElegido = sitios.find((e) => String(e.almacen_id) === sitio)

              return (
                <div key={r.clave} className="border-hairline rounded-card border border-dashed p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-ink/40 text-2xs font-mono tracking-[0.16em] uppercase">
                      Renglón {i + 1}
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
                    vacio="Busque el material"
                    valor={r.articulo}
                    onCambio={(v) => {
                      const conEse = (todas.data ?? []).filter(
                        (e) => String(e.articulo_id) === v && Number(e.disponibles) > 0,
                      )
                      const sigueValiendo = conEse.some((e) => String(e.almacen_id) === sitio)
                      setRenglones((lista) =>
                        lista.map((x) =>
                          x.clave === r.clave
                            ? {
                                ...x,
                                articulo: v,
                                cantidad: '',
                                presentaciones: null,
                                presentacion: null,
                                sueltas: '',
                                propietario: undefined,
                                almacen: sigueValiendo
                                  ? x.almacen
                                  : conEse.length === 1
                                    ? String(conEse[0].almacen_id)
                                    : '',
                              }
                            : x,
                        ),
                      )
                    }}
                    opciones={articulosConExistencia}
                  />

                  <div className="mt-3 space-y-3">
                    <SelectBuscable
                      label="Almacén"
                      vacio={r.articulo ? 'Seleccione el sitio' : 'Seleccione antes el material'}
                      valor={sitio}
                      onCambio={(v) =>
                        setRenglones((lista) =>
                          lista.map((x) =>
                            x.clave === r.clave ? { ...x, almacen: v, propietario: undefined } : x,
                          ),
                        )
                      }
                      opciones={sitios.map((e) => ({
                        valor: String(e.almacen_id),
                        codigo: e.almacen_codigo,
                        nombre: e.almacen,
                        detalle: `hay ${cantidadLegible(e.disponibles)} ${e.unidad}`,
                      }))}
                    />

                    <CantidadDeArticulo
                      key={`cantidad-${r.articulo}`}
                      valor={r.cantidad}
                      onCambiar={(v, cap) =>
                        setRenglones((lista) =>
                          lista.map((x) =>
                            x.clave === r.clave
                              ? {
                                  ...x,
                                  cantidad: v,
                                  presentaciones: cap.presentaciones,
                                  presentacion: cap.unidad,
                                  sueltas: String(cap.sueltas ?? ''),
                                }
                              : x,
                          ),
                        )
                      }
                      articulo={artSale}
                      hintSinArticulo="Seleccione antes de dónde sale"
                      hint={
                        sitio
                          ? pedidoHasta(i, sitio, r.articulo) > 0
                            ? `Quedan ${cantidadLegible(disponible)} ${unidad} tras los renglones de arriba`
                            : `Hay ${cantidadLegible(disponible)} ${unidad}`
                          : 'Seleccione antes de dónde sale'
                      }
                    />
                  </div>

                  {sitioElegido?.duenos ? (
                    <div className="mt-3">
                      <DeQuienSale
                        duenos={sitioElegido.duenos}
                        valor={r.propietario ?? ''}
                        onCambio={(v) =>
                          setRenglones((lista) =>
                            lista.map((x) => (x.clave === r.clave ? { ...x, propietario: v } : x)),
                          )
                        }
                        label="Dueño"
                      />
                    </div>
                  ) : null}

                  {pasado ? (
                    <p className="text-danger mt-2 text-xs">
                      {pedidoHasta(i, sitio, r.articulo) > 0
                        ? `Ya lo pidió más arriba: ahí solo quedan ${cantidadLegible(disponible)} ${unidad}.`
                        : `Ahí solo quedan ${cantidadLegible(disponible)} ${unidad}.`}
                    </p>
                  ) : null}
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
            Añadir otro material
          </Button>
        </div>

        <ParaQuienSale
          pregunta="¿Quién lo va a recibir?"
          ambito={ambito}
          onAmbito={setAmbito}
          grupos={grupos.data}
          grupo={grupo}
          onGrupo={setGrupo}
          externo={externo}
          onExterno={setExterno}
          responsable={responsable}
          onResponsable={setResponsable}
        />

        <Textarea
          label="Motivo"
          rows={3}
          placeholder="Mascarillas para el turno de cribado"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          hint="Es lo que lee quien la aprueba, y queda en la nota cuando se entregue."
          error={
            ventaEnElMotivo
              ? `Dice «${ventaEnElMotivo}»: una venta no se solicita aquí, se registra en Facturación › Notas de entrega.`
              : undefined
          }
        />

        {miFirma?.usar ? (
          <label className="border-hairline flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm">
            <input
              type="checkbox"
              className="accent-royal-600 mt-0.5 size-4 shrink-0"
              checked={conMiFirma}
              onChange={(e) => setConMiFirma(e.target.checked)}
            />
            <span className="text-ink/80">
              Poner mi firma digital en «Solicitado por»
              <span className="text-ink/50 mt-0.5 block text-xs">
                Sin marcar, la raya de la orden sale en blanco con su nombre debajo.
              </span>
            </span>
          </label>
        ) : null}

        <label className="border-hairline flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm">
          <input
            type="checkbox"
            className="accent-tierra-600 mt-0.5 size-4 shrink-0"
            checked={llevaRecibido}
            onChange={(e) => setLlevaRecibido(e.target.checked)}
          />
          <span className="text-ink/80">
            Se lo lleva un vehículo y alguien lo recibe
            <span className="text-ink/50 mt-0.5 block text-xs">
              El papel sale con «Recibió conforme» y su nombre debajo de la raya.
            </span>
          </span>
        </label>

        {llevaRecibido ? (
          <div className="border-hairline bg-canvas grid gap-3 rounded-[6px] border border-dashed p-3">
            <SelectBuscable
              label="Vehículo"
              vacio="No está en la lista"
              valor={vehiculoId}
              onCambio={(v) => {
                setVehiculoId(v)
                if (v) setVehiculoEscrito('')
              }}
              opciones={(vehiculos ?? []).map((v) => ({
                valor: String(v.id),
                etiqueta: v.descripcion ? `${v.placa} · ${v.descripcion}` : v.placa,
              }))}
            />
            <Input
              label="…o escríbalo"
              placeholder="Placa, o cómo se reconoce"
              hint={vehiculoId ? 'Ya eligió uno de la lista.' : undefined}
              disabled={Boolean(vehiculoId)}
              value={vehiculoEscrito}
              onChange={(e) => setVehiculoEscrito(e.target.value)}
            />
            <Input
              label="Recibido por"
              placeholder="Nombre y apellido"
              value={recibeNombre}
              onChange={(e) => setRecibeNombre(e.target.value)}
            />
            <Input
              label="Cédula"
              placeholder="V-12345678"
              value={recibeCedula}
              onChange={(e) => setRecibeCedula(e.target.value)}
            />
          </div>
        ) : null}

        <ElegirArchivosDeCarga archivos={archivos} onCambiar={setArchivos} />

        {pedido.error ? <ErrorDeCarga error={pedido.error} /> : null}
      </div>

      <div className="bg-surface/95 border-hairline fixed inset-x-0 bottom-0 border-t p-4 backdrop-blur">
        <div className="mx-auto max-w-md">
          <Button
            className="w-full py-4 text-base"
            icon={<SendHorizontal />}
            disabled={!valido || pedido.isPending || subiendo}
            onClick={() => void pedir()}
          >
            {pedido.isPending || subiendo
              ? 'Guardando…'
              : solicitudesQueSalen > 1
                ? `Enviar ${solicitudesQueSalen} solicitudes`
                : 'Enviar solicitud'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Acuse({ texto, titulo, onOtra }: { texto: string; titulo: string; onOtra: () => void }) {
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
      <h1 className="text-ink/85 font-titular mt-4 text-xl">{titulo}</h1>

      <pre className="border-hairline bg-ink/2 text-ink/70 mt-5 rounded-card border p-3 text-left text-xs whitespace-pre-wrap">
        {texto}
      </pre>

      <div className="mt-5 space-y-3">
        <Button className="w-full py-3.5" variant="outline" icon={<Share2 />} onClick={() => void compartir()}>
          Pasarla por WhatsApp
        </Button>
        <Button className="w-full py-3.5" icon={<SendHorizontal />} onClick={onOtra}>
          Pedir otra
        </Button>
        <Link
          to="/app/inventario/almacen/salida"
          className="text-ink/45 active:text-ink/80 block pt-1 text-sm underline decoration-dotted underline-offset-4"
        >
          Volver
        </Link>
      </div>
    </div>
  )
}
