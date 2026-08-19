import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useAlmacenes, useExistencias } from '@/lib/api/inventario'
import {
  useAbrirMantenimiento,
  useAnularMantenimiento,
  useCerrarMantenimiento,
  type Maquina,
  type TipoOrden,
} from '@/lib/api/maquinaria'
import { enteros, fecha as formatearFecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

/**
 * El paso de una máquina por el taller, que son dos momentos y no uno.
 *
 * POR QUÉ NO ES UN SOLO FORMULARIO
 *
 * Antes se anotaba el mantenimiento de un golpe, después de hecho. Eso dejaba
 * sin respuesta las preguntas que se hacen mientras tanto: si la máquina está
 * adentro, desde cuándo, y si lleva más de lo previsto. Una máquina en el
 * taller es una máquina que no está trabajando, y eso tiene que verse el mismo
 * día, no cuando alguien se acuerde de registrar la reparación.
 *
 * Así que el modal es el mismo pero enseña una cosa u otra según dónde esté la
 * máquina: si está fuera, cómo entra; si está dentro, cómo sale.
 */
export function ModalTaller({
  abierto,
  maquina,
  onCerrar,
}: {
  abierto: boolean
  maquina: Maquina | null
  onCerrar: () => void
}) {
  if (!maquina) return null

  return maquina.mantenimiento_abierto_id === null ? (
    <Entrada abierto={abierto} maquina={maquina} onCerrar={onCerrar} />
  ) : (
    <Salida abierto={abierto} maquina={maquina} onCerrar={onCerrar} />
  )
}

/**
 * La máquina entra.
 *
 * LA ELECCIÓN DE ARRIBA NO ES UNA ETIQUETA: DECIDE SI EL CONTADOR VUELVE A CERO
 *
 * Quien marque «servicio» o «reparación» habiendo hecho un mantenimiento
 * profundo dejará la máquina contando horas que ya no debía, y el aviso
 * saltará tarde. Al revés es peor: marcar «mantenimiento» por arreglar una
 * correa pone el contador a cero y la máquina se pasa su intervalo real sin
 * que nadie se entere.
 *
 * Y la reparación se separa del servicio porque responde otra pregunta. El
 * servicio es rutina; la reparación es algo que se rompió, y cada cuánto se
 * rompe una máquina es lo que termina decidiendo si conviene seguir
 * arreglándola.
 *
 * Por eso no es un desplegable con tres opciones parecidas, sino tres botones
 * que dicen su consecuencia en la propia tarjeta.
 */
function Entrada({
  abierto,
  maquina,
  onCerrar,
}: {
  abierto: boolean
  maquina: Maquina
  onCerrar: () => void
}) {
  const entrar = useAbrirMantenimiento()
  const { data: almacenes } = useAlmacenes()

  const hoy = new Date().toLocaleDateString('en-CA')
  const [tipo, setTipo] = useState<TipoOrden>('MANTENIMIENTO')
  const [dia, setDia] = useState(hoy)
  const [motivo, setMotivo] = useState('')
  const [taller, setTaller] = useState('')
  const [dias, setDias] = useState('')

  useEffect(() => {
    if (!abierto) return
    setTipo('MANTENIMIENTO')
    setDia(hoy)
    setMotivo('')
    setTaller(maquina.mantenimiento_taller_id ? String(maquina.mantenimiento_taller_id) : '')
    setDias(maquina.dias_mantenimiento ? String(maquina.dias_mantenimiento) : '')
    // `hoy` se recalcula en cada render pero es el mismo texto; no entra como
    // dependencia para no reabrir el formulario a medianoche mientras se llena.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, maquina])

  const talleres = (almacenes ?? []).filter((a) => a.tipo === 'TALLER')
  const valido = motivo.trim().length >= 4

  const opciones = [
    {
      valor: 'MANTENIMIENTO' as const,
      titulo: 'Mantenimiento',
      ejemplo: 'Le tocaba: motor, correas, filtros, cambio de aceite',
      consecuencia: 'Al salir, el contador de horas vuelve a cero',
    },
    {
      valor: 'REPARACION' as const,
      titulo: 'Reparación',
      ejemplo: 'Se dañó algo y hay que arreglarlo',
      consecuencia: 'No toca el contador: sigue debiendo su mantenimiento',
    },
    {
      valor: 'SERVICIO' as const,
      titulo: 'Servicio',
      ejemplo: 'Engrase, combustible, revisión rápida',
      consecuencia: 'No toca el contador',
    },
  ]

  const enviar = async () => {
    await entrar.mutateAsync({
      maquina_id: maquina.id,
      tipo,
      motivo: motivo.trim(),
      taller_id: taller ? Number(taller) : null,
      fecha: dia,
      dias_estimados: dias ? Number(dias) : null,
    })
    onCerrar()
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`${maquina.nombre} entra al taller`}
      descripcion={`Lleva ${enteros(Number(maquina.horas_desde_mant))} horas desde el último mantenimiento, sobre un tope de ${enteros(Number(maquina.tope_horas))}.`}
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={!valido || entrar.isPending}>
            {entrar.isPending ? 'Guardando…' : 'Meterla al taller'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {opciones.map((o) => {
          const elegida = tipo === o.valor
          return (
            <button
              key={o.valor}
              type="button"
              onClick={() => setTipo(o.valor)}
              className={cn(
                'rounded-card border p-3 text-left transition-colors',
                elegida
                  ? 'border-royal-600 bg-royal-600/5'
                  : 'border-hairline hover:border-royal-300',
              )}
            >
              <p className="text-ink/90 text-sm font-medium">{o.titulo}</p>
              <p className="text-ink/55 mt-1 text-xs leading-relaxed">{o.ejemplo}</p>
              <p
                className={cn(
                  'text-2xs mt-2 font-medium',
                  o.valor === 'MANTENIMIENTO' ? 'text-warning' : 'text-ink/45',
                )}
              >
                {o.consecuencia}
              </p>
            </button>
          )
        })}
      </div>

      <div className="mt-5">
        <Textarea
          label="Por qué entra"
          rows={2}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          hint="Lo que se sabe ahora. Qué se le hizo se anota al sacarla."
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Input label="Entra el" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
        <Select
          label="Taller"
          vacio="Sin taller / externo"
          value={taller}
          onChange={(e) => setTaller(e.target.value)}
          opciones={talleres.map((t) => ({ valor: String(t.id), etiqueta: t.nombre }))}
          hint="Los repuestos salen de aquí."
        />
        <Input
          label="Días estimados"
          type="number"
          min="1"
          step="1"
          placeholder="Opcional"
          value={dias}
          onChange={(e) => setDias(e.target.value)}
        />
      </div>

      <p className="border-hairline text-ink/60 mt-5 rounded-[6px] border border-dashed p-3 text-sm leading-relaxed">
        Mientras esté dentro queda <strong>en el taller</strong> y no se le puede cambiar el estado
        a mano. Sus horas siguen contando donde están: el contador se toca al salir, que es cuando
        ya se le hizo algo.
      </p>

      {entrar.error ? <ErrorDeCarga error={entrar.error} className="mt-3" /> : null}
    </Modal>
  )
}

/**
 * La máquina sale.
 *
 * SALE A ESPERA, NO A ACTIVA
 *
 * Que esté reparada no significa que esté trabajando: alguien tiene que
 * decidir a qué frente la manda. Devolverla directamente a activa haría creer
 * que hay más equipo en el patio del que hay.
 *
 * LOS REPUESTOS SE DESCUENTAN DE VERDAD
 *
 * No es una lista para el acta: cada renglón sale del almacén del taller al
 * costo promedio que tenga, y queda atado a esta orden. Sin eso se puede saber
 * que salieron seis filtros del taller pero no a qué máquinas fueron, que es
 * justo lo que se pregunta cuando una empieza a consumir de más.
 */
function Salida({
  abierto,
  maquina,
  onCerrar,
}: {
  abierto: boolean
  maquina: Maquina
  onCerrar: () => void
}) {
  const salir = useCerrarMantenimiento()
  const anular = useAnularMantenimiento()
  const tallerId = maquina.mantenimiento_taller_id
  const { data: existencias } = useExistencias(tallerId ?? undefined, tallerId !== null)

  const hoy = new Date().toLocaleDateString('en-CA')
  const [dia, setDia] = useState(hoy)
  const [detalle, setDetalle] = useState('')
  const [costo, setCosto] = useState('')
  const [estadoSalida, setEstadoSalida] = useState<'EN_ESPERA' | 'ACTIVA' | 'FUERA_DE_SERVICIO'>(
    'EN_ESPERA',
  )
  const [filas, setFilas] = useState<Array<{ clave: number; articulo: string; cantidad: string }>>(
    [],
  )
  const [anulando, setAnulando] = useState(false)
  const [motivoAnulacion, setMotivoAnulacion] = useState('')

  useEffect(() => {
    if (!abierto) return
    setDia(hoy)
    setDetalle('')
    setCosto('')
    setEstadoSalida('EN_ESPERA')
    setFilas([])
    setAnulando(false)
    setMotivoAnulacion('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, maquina])

  const conExistencia = (existencias ?? []).filter((e) => Number(e.existencia) > 0)
  const repuestos = filas
    .filter((f) => f.articulo && Number(f.cantidad) > 0)
    .map((f) => ({ articulo_id: Number(f.articulo), cantidad: Number(f.cantidad) }))

  // Ninguna fila puede pedir más de lo que hay: la base lo rechaza igual, pero
  // enterarse al escribir es mejor que enterarse al guardar.
  const seExcede = filas.some((f) => {
    if (!f.articulo || !f.cantidad) return false
    const hay = conExistencia.find((e) => String(e.articulo_id) === f.articulo)
    return hay ? Number(f.cantidad) > Number(hay.existencia) : false
  })

  const valido = detalle.trim().length >= 3 && !seExcede

  const enviar = async () => {
    await salir.mutateAsync({
      id: maquina.mantenimiento_abierto_id!,
      detalle: detalle.trim(),
      costo_usd: costo ? Number(costo) : null,
      repuestos,
      estado_salida: estadoSalida,
      fecha_salida: dia,
    })
    onCerrar()
  }

  const enviarAnulacion = async () => {
    await anular.mutateAsync({
      id: maquina.mantenimiento_abierto_id!,
      motivo: motivoAnulacion.trim(),
    })
    onCerrar()
  }

  const salidas = [
    { valor: 'EN_ESPERA' as const, etiqueta: 'En espera', detalle: 'Lista, sin asignar todavía' },
    { valor: 'ACTIVA' as const, etiqueta: 'Activa', detalle: 'Vuelve al frente hoy mismo' },
    {
      valor: 'FUERA_DE_SERVICIO' as const,
      etiqueta: 'Fuera de servicio',
      detalle: 'Salió sin quedar operativa',
    },
  ]

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="lg"
      titulo={`${maquina.nombre} sale del taller`}
      descripcion={
        maquina.mantenimiento_desde
          ? `Entró el ${formatearFecha(maquina.mantenimiento_desde)}${
              maquina.dias_en_taller !== null
                ? ` · lleva ${maquina.dias_en_taller} día${maquina.dias_en_taller === 1 ? '' : 's'} dentro`
                : ''
            }.`
          : undefined
      }
      acciones={
        anulando ? (
          <>
            <Button variant="ghost" onClick={() => setAnulando(false)}>
              Volver
            </Button>
            <Button
              onClick={() => void enviarAnulacion()}
              disabled={motivoAnulacion.trim().length < 4 || anular.isPending}
            >
              {anular.isPending ? 'Anulando…' : 'Anular la orden'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setAnulando(true)}>
              No debió entrar
            </Button>
            <Button variant="ghost" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button onClick={() => void enviar()} disabled={!valido || salir.isPending}>
              {salir.isPending ? 'Guardando…' : 'Sacarla del taller'}
            </Button>
          </>
        )
      }
    >
      {anulando ? (
        <>
          <p className="text-ink/70 mb-4 text-sm leading-relaxed">
            Anular no borra la orden: la deja marcada con su motivo y devuelve la máquina al estado
            que traía antes de entrar. Es para cuando se metió por error, no para cuando se hizo el
            trabajo y no se quiere registrar.
          </p>
          <Textarea
            label="Por qué se anula"
            rows={3}
            value={motivoAnulacion}
            onChange={(e) => setMotivoAnulacion(e.target.value)}
          />
          {anular.error ? <ErrorDeCarga error={anular.error} className="mt-3" /> : null}
        </>
      ) : (
        <>
          {maquina.se_paso_en_el_taller ? (
            <p className="border-warning/30 bg-warning-soft text-ink/80 mb-4 rounded-[6px] border p-3 text-sm">
              Lleva más días dentro de los estimados.
            </p>
          ) : null}

          <Textarea
            label="Qué se le hizo"
            rows={3}
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            hint="Dentro de seis meses esto es lo único que dirá si ya se cambiaron las correas."
          />

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input label="Sale el" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
            <Input
              label="Mano de obra en dólares"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="Opcional"
              value={costo}
              onChange={(e) => setCosto(e.target.value)}
              hint="Los repuestos se suman aparte, a su costo promedio."
            />
          </div>

          <h3 className="text-ink/85 mt-6 mb-1 text-sm font-semibold">Repuestos que se le pusieron</h3>
          {tallerId === null ? (
            <p className="text-ink/50 text-xs leading-relaxed">
              Esta orden no dice en qué taller se hizo, así que no hay de dónde descontar. El
              consumo se registra como salida de almacén por su cuenta.
            </p>
          ) : (
            <>
              <p className="text-ink/50 mb-3 text-xs leading-relaxed">
                Salen del taller al costo promedio que tengan ahora, y quedan atados a esta
                reparación.
              </p>

              {filas.map((f, i) => {
                const hay = conExistencia.find((e) => String(e.articulo_id) === f.articulo)
                const excede = hay && f.cantidad ? Number(f.cantidad) > Number(hay.existencia) : false

                return (
                  <div key={f.clave} className="mb-2 grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                    <Select
                      label={i === 0 ? 'Repuesto' : ''}
                      vacio="Elegir repuesto"
                      value={f.articulo}
                      onChange={(e) =>
                        setFilas((v) =>
                          v.map((x, j) => (j === i ? { ...x, articulo: e.target.value } : x)),
                        )
                      }
                      opciones={conExistencia.map((e) => ({
                        valor: String(e.articulo_id),
                        etiqueta: `${e.articulo} · hay ${Number(e.existencia)} ${e.unidad}`,
                      }))}
                    />
                    <Input
                      label={i === 0 ? 'Cantidad' : ''}
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="Cantidad"
                      value={f.cantidad}
                      onChange={(e) =>
                        setFilas((v) =>
                          v.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)),
                        )
                      }
                      error={excede ? `Solo hay ${Number(hay!.existencia)}` : undefined}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 />}
                      aria-label="Quitar"
                      onClick={() => setFilas((v) => v.filter((_, j) => j !== i))}
                    />
                  </div>
                )
              })}

              <Button
                variant="outline"
                size="sm"
                icon={<Plus />}
                disabled={conExistencia.length === 0}
                onClick={() =>
                  setFilas((v) => [...v, { clave: Date.now() + v.length, articulo: '', cantidad: '' }])
                }
              >
                Añadir repuesto
              </Button>
              {conExistencia.length === 0 ? (
                <p className="text-ink/45 mt-2 text-xs">
                  Este taller no tiene existencias cargadas.
                </p>
              ) : null}
            </>
          )}

          <h3 className="text-ink/85 mt-6 mb-3 text-sm font-semibold">Cómo queda al salir</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            {salidas.map((s) => (
              <button
                key={s.valor}
                type="button"
                onClick={() => setEstadoSalida(s.valor)}
                className={cn(
                  'rounded-card border p-3 text-left transition-colors',
                  estadoSalida === s.valor
                    ? 'border-royal-600 bg-royal-600/5'
                    : 'border-hairline hover:border-royal-300',
                )}
              >
                <p className="text-ink/90 text-sm font-medium">{s.etiqueta}</p>
                <p className="text-ink/50 mt-0.5 text-xs">{s.detalle}</p>
              </button>
            ))}
          </div>

          {salir.error ? <ErrorDeCarga error={salir.error} className="mt-3" /> : null}
        </>
      )}
    </Modal>
  )
}
