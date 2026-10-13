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
  TIPOS_INTERVENCION,
  URGENCIAS,
  useAbrirMantenimiento,
  useAnularMantenimiento,
  useAverias,
  useCerrarMantenimiento,
  useEspecialidades,
  useMantenimientoAbierto,
  type Maquina,
  type TipoOrden,
  type Urgencia,
} from '@/lib/api/maquinaria'
import { enteros, fecha as formatearFecha } from '@/lib/formato'
import { cn } from '@/lib/cn'
import { etiquetaDeMaquina } from '@/lib/maquina'

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
  // Averías pendientes de esta máquina, para poder decir «esta orden atiende
  // esa avería» sin obligar a abrir una por cada avería reportada.
  const { data: averiasPendientes } = useAverias(maquina.id, true)

  const hoy = new Date().toLocaleDateString('en-CA')
  const [tipo, setTipo] = useState<TipoOrden>('MANTENIMIENTO')
  const [dia, setDia] = useState(hoy)
  const [motivo, setMotivo] = useState('')
  const [taller, setTaller] = useState('')
  const [dias, setDias] = useState('')
  const especialidades = useEspecialidades()
  const [urgencia, setUrgencia] = useState<Urgencia>('NORMAL')
  const [especialidad, setEspecialidad] = useState('')
  const [averiaId, setAveriaId] = useState('')

  useEffect(() => {
    if (!abierto) return
    setTipo('MANTENIMIENTO')
    setDia(hoy)
    setMotivo('')
    setTaller(maquina.mantenimiento_taller_id ? String(maquina.mantenimiento_taller_id) : '')
    setDias(maquina.dias_mantenimiento ? String(maquina.dias_mantenimiento) : '')
    setUrgencia('NORMAL')
    setEspecialidad('')
    setAveriaId('')
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
      urgencia,
      especialidad: especialidad || null,
      motivo: motivo.trim(),
      taller_id: taller ? Number(taller) : null,
      fecha: dia,
      dias_estimados: dias ? Number(dias) : null,
      averia_id: averiaId ? Number(averiaId) : null,
    })
    onCerrar()
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`${etiquetaDeMaquina(maquina)} entra al taller`}
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
          label="Motivo"
          rows={2}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          hint="Lo que se sabe ahora. El trabajo realizado se anota al sacarla."
        />
      </div>

      {/*
        ¿ATIENDE UNA AVERÍA YA REPORTADA? Christopher, 13/10/2026: opcional —
        no toda entrada al taller viene de una avería reportada antes—. Se
        elige aquí y se marca atendida al salir, si se confirma que sí.
      */}
      {(averiasPendientes ?? []).length > 0 ? (
        <div className="mt-4">
          <Select
            label="¿Atiende una avería reportada?"
            vacio="Ninguna / no aplica"
            value={averiaId}
            onChange={(e) => setAveriaId(e.target.value)}
            opciones={(averiasPendientes ?? []).map((a) => ({
              valor: String(a.id),
              etiqueta: `${a.numero} · ${a.descripcion}`,
            }))}
          />
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Input label="Fecha" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
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
          value={dias}
          onChange={(e) => setDias(e.target.value)}
        />
      </div>

      {/*
        LA URGENCIA Y EL OFICIO, DEBAJO DEL TALLER

        La urgencia ordena la cola de ese taller. El oficio dice qué clase de
        trabajo hace falta, y si el taller elegido declaró los suyos y no está
        ese, la base se niega con el nombre del taller en el mensaje — antes de
        que la máquina salga de sitio.
      */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Select
          label="Urgencia"
          value={urgencia}
          onChange={(e) => setUrgencia(e.target.value as Urgencia)}
          opciones={URGENCIAS.map((u) => ({ valor: u.valor, etiqueta: u.etiqueta }))}
          hint={URGENCIAS.find((u) => u.valor === urgencia)?.detalle}
        />
        <Select
          label="Especialidad"
          vacio="Sin especificar"
          value={especialidad}
          onChange={(e) => setEspecialidad(e.target.value)}
          opciones={(especialidades.data ?? []).map((x) => ({
            valor: x.codigo,
            etiqueta: x.nombre,
          }))}
          hint="Si el taller declaró sus oficios y este no está, no lo acepta."
        />
      </div>

      <p className="border-hairline text-ink/60 mt-5 rounded-[6px] border border-dashed p-3 text-sm leading-relaxed">
        Mientras esté dentro, queda <strong>en el taller</strong> y su estado no se cambia a mano.
        El contador de horas se actualiza al salir.
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
  // La orden abierta de verdad, para saber si atiende una avería: eso vive en
  // la orden (se eligió al entrar), no en la ficha de la máquina.
  const { data: ordenAbierta } = useMantenimientoAbierto(maquina.id)

  const hoy = new Date().toLocaleDateString('en-CA')
  const [dia, setDia] = useState(hoy)
  const [detalle, setDetalle] = useState('')
  const [costo, setCosto] = useState('')
  const [tecnico, setTecnico] = useState('')
  const [origenTecnico, setOrigenTecnico] = useState<'INTERNO' | 'EXTERNO'>('INTERNO')
  const [intervenciones, setIntervenciones] = useState<string[]>([])
  const [intervaloHoras, setIntervaloHoras] = useState('')
  const [averiaAtendida, setAveriaAtendida] = useState(true)
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
    setTecnico('')
    setOrigenTecnico('INTERNO')
    setIntervenciones([])
    setIntervaloHoras('')
    setAveriaAtendida(true)
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

  const valido = detalle.trim().length >= 3 && tecnico.trim().length >= 3 && !seExcede

  const enviar = async () => {
    await salir.mutateAsync({
      id: maquina.mantenimiento_abierto_id!,
      detalle: detalle.trim(),
      costo_usd: costo ? Number(costo) : null,
      repuestos,
      estado_salida: estadoSalida,
      fecha_salida: dia,
      tecnico: tecnico.trim(),
      intervalo_horas: intervaloHoras ? Number(intervaloHoras) : null,
      origen_tecnico: origenTecnico,
      intervenciones,
      marcar_averia_atendida: averiaAtendida,
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
      titulo={`${etiquetaDeMaquina(maquina)} sale del taller`}
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
            La orden queda anulada con su motivo y la máquina vuelve al estado anterior. Solo para
            una orden registrada por error.
          </p>
          <Textarea
            label="Motivo"
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
            label="Trabajo realizado"
            rows={3}
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
          />

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input label="Fecha de salida" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
            <Input
              label="Mano de obra (USD)"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={costo}
              onChange={(e) => setCosto(e.target.value)}
              hint="Los repuestos se suman aparte, a su costo promedio."
            />
          </div>

          {/*
            QUIÉN LO HIZO, DE VERDAD. Christopher, 14/10/2026: distinto de
            quien lo anota en el sistema (el usuario logueado) — el mecánico
            o el taller externo. El origen, interno o externo, solo cambia
            la etiqueta del campo y queda aparte en la base.
          */}
          <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr]">
            <Select
              label="Origen"
              value={origenTecnico}
              onChange={(e) => setOrigenTecnico(e.target.value as 'INTERNO' | 'EXTERNO')}
              opciones={[
                { valor: 'INTERNO', etiqueta: 'De la casa' },
                { valor: 'EXTERNO', etiqueta: 'Externo' },
              ]}
            />
            <Input
              label={origenTecnico === 'INTERNO' ? 'Técnico' : 'Proveedor o taller externo'}
              value={tecnico}
              onChange={(e) => setTecnico(e.target.value)}
            />
          </div>

          {/*
            EL INTERVALO PROPIO DE ESTE CICLO. Solo tiene efecto en un
            mantenimiento sobre máquina: en servicio o reparación no
            reinicia ningún contador, así que un intervalo ahí no
            significaría nada.
          */}
          {maquina.mantenimiento_abierto_tipo === 'MANTENIMIENTO' ? (
            <div className="mt-4">
              <Input
                label="Próximo mantenimiento en (horas)"
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                value={intervaloHoras}
                onChange={(e) => setIntervaloHoras(e.target.value)}
                placeholder={maquina.tope_horas}
                hint={`Si se deja en blanco, se usa el tope configurado de la máquina (${enteros(Number(maquina.tope_horas))} h).`}
              />
            </div>
          ) : null}

          {/*
            QUÉ CLASE DE TRABAJO FUE, APARTE DEL TIPO DE LA ORDEN.
            Christopher, 13/10/2026: el tipo de arriba (Mantenimiento/
            Servicio/Reparación) decide si resetea el contador de horas;
            esto es solo descriptivo, y se puede marcar más de uno.
          */}
          <div className="mt-4">
            <p className="text-ink/70 mb-2 text-sm font-medium">Tipo de intervención</p>
            <div className="flex flex-wrap gap-2">
              {TIPOS_INTERVENCION.map((t) => {
                const marcado = intervenciones.includes(t.valor)
                return (
                  <button
                    key={t.valor}
                    type="button"
                    onClick={() =>
                      setIntervenciones((v) =>
                        marcado ? v.filter((x) => x !== t.valor) : [...v, t.valor],
                      )
                    }
                    className={cn(
                      'rounded-full border px-3 py-1 text-sm transition-colors',
                      marcado
                        ? 'border-royal-600 bg-royal-600/10 text-royal-700 dark:text-royal-300'
                        : 'border-hairline text-ink/60 hover:border-royal-300',
                    )}
                  >
                    {t.etiqueta}
                  </button>
                )
              })}
            </div>
          </div>

          {/*
            ¿ESTA ORDEN DEJA ATENDIDA LA AVERÍA? Solo sale si la orden se
            abrió enlazada a una. Desmarcarlo no la anula ni la ignora: solo
            deja la avería pendiente para una próxima orden.
          */}
          {ordenAbierta?.averia_id ? (
            <label className="border-hairline mt-4 flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm">
              <input
                type="checkbox"
                className="accent-royal-600 mt-0.5 size-4 shrink-0"
                checked={averiaAtendida}
                onChange={(e) => setAveriaAtendida(e.target.checked)}
              />
              <span className="text-ink/80">
                Dar por atendida la avería {ordenAbierta.averia_numero}
              </span>
            </label>
          ) : null}

          <h3 className="text-ink/85 mt-6 mb-1 text-sm font-semibold">Repuestos</h3>
          {tallerId === null ? (
            <p className="text-ink/50 text-xs leading-relaxed">
              La orden no indica taller: los repuestos se registran como salida de almacén.
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

          <h3 className="text-ink/85 mt-6 mb-3 text-sm font-semibold">Estado de salida</h3>
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
