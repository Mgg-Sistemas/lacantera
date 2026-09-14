import { useMemo, useState } from 'react'
import { cn } from '@/lib/cn'
import { AlertTriangle, Pencil, Plus, Scale } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_REGLAS } from '@/components/pestanasDeModulos'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import {
  CONCEPTOS_DE_LEY,
  cambioDeConceptos,
  conceptosDeLeyEn,
  conceptosDelRegimen,
  enLista,
  useCambiarConceptosDeLey,
  useCerrarParametro,
  useEliminarParametro,
  useGuardarParametro,
  useParametros,
  usePeriodos,
} from '@/lib/api/nomina'
import { Interruptor } from '@/components/ui/Interruptor'
import type { ConceptoDeLey, Parametro } from '@/lib/api/nomina'
import { useMisRoles } from '@/lib/api/catalogo'
import { fecha } from '@/lib/formato'
import { hoyEnCaracas } from '@/lib/api/tasas'

const UNIDADES = [
  { valor: 'BS', etiqueta: 'Bolívares' },
  { valor: 'USD', etiqueta: 'Dólares' },
  { valor: 'PORCENTAJE', etiqueta: 'Porcentaje' },
  { valor: 'DIAS', etiqueta: 'Días' },
  { valor: 'HORAS', etiqueta: 'Horas' },
  { valor: 'VECES_SM', etiqueta: 'Veces el salario mínimo' },
  { valor: 'FACTOR', etiqueta: 'Factor' },
  // No todo parámetro es una cifra: quién firma los recibos por la empresa
  // también cambia con el tiempo, y por las mismas razones se guarda con
  // vigencia en vez de sustituirse.
  { valor: 'TEXTO', etiqueta: 'Texto' },
]

function valorLegible(p: Parametro): string {
  if (p.unidad === 'TEXTO') return p.valor_texto ?? '—'

  const n = Number(p.valor)
  const f = n.toLocaleString('es-VE', { maximumFractionDigits: 4 })
  if (p.unidad === 'PORCENTAJE') return `${f} %`
  if (p.unidad === 'BS') return `Bs ${f}`
  if (p.unidad === 'USD') return `$ ${f}`
  if (p.unidad === 'DIAS') return `${f} días`
  if (p.unidad === 'HORAS') return `${f} h`
  if (p.unidad === 'VECES_SM') return `${f} × salario mínimo`
  return f
}

/** El día siguiente a una fecha AAAA-MM-DD, sin que la zona horaria lo corra. */
function diaSiguiente(f: string): string {
  const d = new Date(`${f.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

const mismosConceptos = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((c) => b.includes(c))

/** «se encienden A y B, y se apaga C». Vacío si no cambia nada. */
function describirCambio(c: { encendidos: string[]; apagados: string[] }): string {
  return [
    c.encendidos.length > 0
      ? `${c.encendidos.length === 1 ? 'se enciende' : 'se encienden'} ${enLista(c.encendidos)}`
      : null,
    c.apagados.length > 0
      ? `${c.apagados.length === 1 ? 'se apaga' : 'se apagan'} ${enLista(c.apagados)}`
      : null,
  ]
    .filter(Boolean)
    .join(', y ')
}

export function Parametros() {
  const { data, isPending, error } = useParametros()
  const { puede } = useMisRoles()
  const guardar = useGuardarParametro()
  const cerrar = useCerrarParametro()
  const eliminar = useEliminarParametro()
  const cambiarConceptos = useCambiarConceptosDeLey()
  const { data: periodos } = usePeriodos()

  /*
    LOS INTERRUPTORES DE LOS CONCEPTOS DE LEY

    Christopher: «escribir DE LEY en cada intento no es adecuado, no es un switch
    adecuado». Y después: «si enciendo el switch, ¿tomará todas las normas? ¿Podemos
    hacer que sea elegible?». Así que hay uno por concepto, para toda la nómina.

    Enseñan lo que rige hoy. Moverlos no guarda nada: debajo aparece qué cambia y
    desde qué día —se propone el siguiente al cierre de la última quincena
    calculada—, y al guardar va la lista entera por su puerta
    (`cambiar_conceptos_de_ley`). Los mueve gerencia general, que es quien aprueba la
    nómina; la base no deja ponerlos por debajo de una nómina aprobada ni por delante
    de un cambio ya programado.
  */
  const [borrador, setBorrador] = useState<null | { conceptos: ConceptoDeLey[]; desde: string }>(null)

  const [nuevo, setNuevo] = useState<null | {
    /*
      Solo cuando se abrió desde una fila.

      Es lo que distingue «estoy corrigiendo esta vigencia» de «estoy creando
      una». Sin él no se puede ofrecer quitarla: hay que decirle a la base
      exactamente cuál.
    */
    id?: number
    clave: string
    valor: string
    unidad: string
    desde: string
    descripcion: string
    fuente: string
  }>(null)

  const puedeRRHH = puede('RRHH')

  // Solo la vigencia viva de cada parámetro; las cerradas quedan detrás, que es
  // donde tienen que estar: sirven para recalcular el pasado, no para leerlas
  // todos los días.
  const vigentes = useMemo(() => {
    const vistas = new Set<string>()
    return (data ?? []).filter((p) => {
      // El régimen no es una cifra: tiene su interruptor arriba y no se corrige aquí.
      if (p.clave === 'regimen_nomina') return false
      if (vistas.has(p.clave)) return false
      vistas.add(p.clave)
      return true
    })
  }, [data])

  const historicos =
    (data ?? []).filter((p) => p.clave !== 'regimen_nomina').length - vigentes.length

  const hoy = hoyEnCaracas()
  const conceptosHoy = conceptosDeLeyEn(data ?? [], hoy)
  const programado = (data ?? [])
    .filter((p) => p.clave === 'regimen_nomina' && p.vigencia_desde.slice(0, 10) > hoy)
    .sort((a, b) => a.vigencia_desde.localeCompare(b.vigencia_desde))[0]
  const puedeRegimen = puede('GERENTE_GENERAL')
  const ultimoCierre = (periodos ?? [])
    .filter((p) => p.estado !== 'ANULADA' && p.estado !== 'BORRADOR')
    .map((p) => p.hasta.slice(0, 10))
    .sort()
    .at(-1)

  const enPantalla = borrador?.conceptos ?? conceptosHoy
  // Lo que cambia se cuenta contra lo que regiría ese día, no contra hoy: si antes
  // hay un cambio programado, se parte de ese.
  const cambio =
    borrador && borrador.desde
      ? cambioDeConceptos(conceptosDeLeyEn(data ?? [], borrador.desde), borrador.conceptos)
      : null
  const sinCambio = cambio !== null && cambio.encendidos.length === 0 && cambio.apagados.length === 0
  const antesDelProgramado =
    borrador !== null &&
    programado !== undefined &&
    borrador.desde !== '' &&
    borrador.desde < programado.vigencia_desde.slice(0, 10)

  const alternar = (codigo: ConceptoDeLey, encender: boolean) => {
    const base = borrador?.conceptos ?? conceptosHoy
    const siguientes = CONCEPTOS_DE_LEY.map((c) => c.codigo).filter((c) =>
      c === codigo ? encender : base.includes(c),
    )
    // Dejarlos otra vez como hoy es no haber tocado nada, salvo que haya un cambio
    // programado: entonces volver a lo de hoy es justo la manera de deshacerlo.
    if (!programado && mismosConceptos(siguientes, conceptosHoy)) {
      setBorrador(null)
      return
    }
    setBorrador({
      conceptos: siguientes,
      desde: borrador?.desde ?? (ultimoCierre ? diaSiguiente(ultimoCierre) : hoy),
    })
  }

  /*
    CORREGIR UNA EQUIVOCACIÓN NO ES ABRIR UNA VIGENCIA

    Christopher preguntó qué pasa si alguien se equivoca al registrar un
    parámetro. La base ya lo permitía —guardar la misma clave con la misma
    fecha sobrescribe— pero la pantalla no lo ofrecía: las filas eran de solo
    lectura y el formulario abría en blanco, así que corregir un cero de más
    obligaba a recordar la clave exacta y teclearla otra vez.

    Ahora la fila se pulsa y se abre con lo que tiene. Si se deja la misma
    fecha, corrige; si se pone una posterior, cierra la anterior y abre una
    nueva. Las dos cosas son legítimas y son distintas, así que el modal dice
    cuál está pasando.
  */
  const esCorreccion =
    nuevo !== null &&
    (data ?? []).some(
      (p) => p.clave === nuevo.clave && p.vigencia_desde.slice(0, 10) === nuevo.desde,
    )

  return (
    <>
      <PageHeader
        title="Parámetros de nómina"
        description="Ninguna cifra legal está escrita en el código. Todas viven aquí con su fecha de vigencia, porque en Venezuela cambian por decreto."
        actions={
          puedeRRHH ? (
            <Button
              icon={<Plus />}
              onClick={() =>
                setNuevo({
                  clave: '',
                  valor: '',
                  unidad: 'BS',
                  desde: '',
                  descripcion: '',
                  fuente: '',
                })
              }
            >
              Nueva vigencia
            </Button>
          ) : null
        }
      />

      <Pestanas pestanas={PESTANAS_REGLAS} />

      <Card className="mb-4">
        {/* Dice qué hacen, no el caso de hoy: la posición de cada interruptor ya enseña el estado. */}
        <CardHeader
          title="Conceptos de ley"
          subtitle="La nómina siempre calcula lo pactado: el sueldo de la ficha, los bonos y descuentos, y las faltas. Encima calcula los conceptos encendidos, con los parámetros de abajo. El sueldo de la ficha sigue siendo lo que la persona recibe: el cestaticket y las retenciones salen de él."
        />

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {CONCEPTOS_DE_LEY.map((c) => (
            <Interruptor
              key={c.codigo}
              encendido={enPantalla.includes(c.codigo)}
              deshabilitado={!puedeRegimen || !data || cambiarConceptos.isPending}
              onCambio={(encender) => alternar(c.codigo, encender)}
              etiqueta={c.nombre}
              detalle={c.detalle}
            />
          ))}
        </div>

        {programado && !borrador ? (
          <p className="text-warning mt-4 text-xs">
            Programado desde el {fecha(programado.vigencia_desde)}:{' '}
            {describirCambio(
              cambioDeConceptos(conceptosHoy, conceptosDelRegimen(programado.valor_texto)),
            ) || 'sin cambios'}
            .
          </p>
        ) : null}

        {!puedeRegimen ? (
          <p className="text-ink/45 mt-4 text-xs">Estos interruptores los mueve gerencia general.</p>
        ) : null}

        {borrador ? (
          <div className="border-hairline mt-4 border-t pt-4">
            <p className="text-ink/80 text-sm">
              {cambio === null
                ? 'Elige desde qué día.'
                : sinCambio
                  ? 'Ese día la nómina ya calcula exactamente esto: no hay nada que guardar.'
                  : `Desde ese día ${describirCambio(cambio)}.`}
            </p>
            {cambio && cambio.encendidos.length > 0 ? (
              <p className="text-ink/50 mt-1 text-xs">
                Revisa antes los parámetros de abajo: el salario mínimo o el cestaticket pueden
                haber cambiado.
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="w-full sm:w-56">
                <Input
                  label="Desde"
                  type="date"
                  value={borrador.desde}
                  onChange={(e) => setBorrador((b) => (b ? { ...b, desde: e.target.value } : b))}
                />
              </div>
              <Button
                variant="ghost"
                disabled={cambiarConceptos.isPending}
                onClick={() => {
                  setBorrador(null)
                  cambiarConceptos.reset()
                }}
              >
                Descartar
              </Button>
              <Button
                disabled={
                  cambiarConceptos.isPending || !borrador.desde || sinCambio || antesDelProgramado
                }
                onClick={async () => {
                  await cambiarConceptos.mutateAsync({
                    conceptos: borrador.conceptos,
                    desde: borrador.desde,
                  })
                  setBorrador(null)
                }}
              >
                {cambiarConceptos.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>

            <p className="text-ink/45 mt-2 text-xs">
              El primer día de la quincena que ya debe calcularse así. Las quincenas aprobadas o
              pagadas no cambian; si una calculada queda dentro, hay que volver a calcularla antes
              de aprobarla.
            </p>
            {antesDelProgramado && programado ? (
              <p className="text-warning mt-2 text-xs">
                Hay un cambio programado desde el {fecha(programado.vigencia_desde)}: elige ese día
                o uno posterior.
              </p>
            ) : null}
            {cambiarConceptos.error ? (
              <div className="mt-3">
                <ErrorDeCarga error={cambiarConceptos.error} />
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      {puedeRRHH ? (
        <p className="text-ink/50 mb-4 text-sm">
          Toca cualquier parámetro para corregir su valor o abrirle una vigencia nueva.
        </p>
      ) : null}

      <div className="border-warning/30 bg-warning-soft mb-4 flex items-start gap-2.5 rounded-[6px] border p-3.5">
        <AlertTriangle className="text-warning mt-px size-[18px] shrink-0" />
        <p className="text-ink/80 text-sm">
          El cestaticket y la base de la contribución de pensiones se anuncian sin publicarse en
          gaceta y <strong className="font-semibold">cambian con frecuencia</strong>. Conviene
          revisarlos cada mes: una nómina calculada con el monto viejo se paga corta.
        </p>
      </div>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {vigentes.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Parámetro</th>
                  <th className="px-3 py-3 text-right font-medium">Valor</th>
                  <th className="px-3 py-3 font-medium">Rige desde</th>
                  <th className="px-5 py-3 font-medium">Fuente</th>
                  {/*
                    LO QUE SE PUEDE CORREGIR TIENE QUE NOTARSE

                    Christopher: «¿no habíamos hecho editable los parámetros de
                    nómina?». Sí — la fila entera abría el formulario desde
                    hace semanas. Pero no había un icono, ni un botón, ni una
                    palabra que lo dijera: solo el cursor cambiaba al pasar por
                    encima, y en una tableta ni eso.

                    Una función que existe y no se ve no existe para quien la
                    necesita. La columna vale más que el pixel que ocupa.
                  */}
                  {puedeRRHH ? <th className="px-5 py-3 font-medium"></th> : null}
                </tr>
              </thead>
              <tbody>
                {vigentes.map((p) => (
                  <tr
                    key={p.id}
                    onClick={
                      puedeRRHH
                        ? () =>
                            setNuevo({
                              id: p.id,
                              clave: p.clave,
                              valor: p.unidad === 'TEXTO' ? (p.valor_texto ?? '') : String(p.valor ?? ''),
                              unidad: p.unidad,
                              desde: p.vigencia_desde.slice(0, 10),
                              descripcion: p.descripcion ?? '',
                              fuente: p.fuente ?? '',
                            })
                        : undefined
                    }
                    className={cn(
                      'border-hairline border-b align-top last:border-0',
                      puedeRRHH && 'hover:bg-ink/3 cursor-pointer transition-colors',
                    )}
                  >
                    <td className="px-5 py-3">
                      <p className="text-ink/85 font-medium">{p.descripcion}</p>
                      <p className="text-ink/40 font-mono text-xs">{p.clave}</p>
                    </td>
                    <td className="text-ink/85 tabular px-3 py-3 text-right font-medium whitespace-nowrap">
                      {valorLegible(p)}
                    </td>
                    <td className="text-ink/70 px-3 py-3 whitespace-nowrap">
                      {fecha(p.vigencia_desde)}
                      {p.vigencia_hasta ? (
                        <Chip tone="neutral" className="ml-2">
                          cerrada
                        </Chip>
                      ) : null}
                    </td>
                    <td className="text-ink/50 px-5 py-3 text-xs">{p.fuente ?? '—'}</td>
                    {puedeRRHH ? (
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <span className="text-ink/45 inline-flex items-center gap-1.5 text-xs">
                          <Pencil className="size-3.5" />
                          Corregir
                        </span>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {historicos > 0 ? (
            <p className="text-ink/40 border-hairline border-t px-5 py-3 text-xs">
              Hay {historicos} vigencia{historicos === 1 ? '' : 's'} anterior
              {historicos === 1 ? '' : 'es'} guardada{historicos === 1 ? '' : 's'}. No se borran:
              son las que permiten recalcular una nómina vieja con las cifras que regían entonces.
            </p>
          ) : null}
        </Card>
      ) : null}

      {nuevo ? (
        <Modal
          abierto
          onCerrar={() => setNuevo(null)}
          titulo={esCorreccion ? `Corregir ${nuevo.clave}` : 'Nueva vigencia'}
          descripcion={
            esCorreccion
              ? 'Misma fecha de vigencia: se corrige lo que hay, no se abre una vigencia nueva. Cambia la fecha si lo que quieres es que rija desde otro día.'
              : 'No sustituye el valor anterior: lo cierra el día antes y empieza uno nuevo.'
          }
          ancho="sm"
          acciones={
            <>
              {/*
                QUITAR UNA CIFRA LEGAL SON DOS COSAS DISTINTAS

                Christopher: «¿qué pasa si deseara eliminar algún parámetro?».
                Hasta hoy, nada — y faltaba, pero no como un borrado a secas.

                Dejó de regir  → se le pone fecha de fin. El cestaticket de
                                 enero no se borra cuando sube en marzo: una
                                 nómina vieja tiene que poder recalcularse con
                                 la cifra que regía entonces.

                Nunca debió existir → se borra. Una clave mal escrita, un valor
                                 con un cero de más. La base solo lo permite si
                                 no hubo ninguna nómina en esas fechas, y si la
                                 hubo lo dice nombrándola.
              */}
              {esCorreccion && nuevo.id ? (
                <>
                  <Button
                    variant="ghost"
                    className="text-danger mr-auto"
                    disabled={eliminar.isPending}
                    onClick={async () => {
                      await eliminar.mutateAsync({ id: nuevo.id! })
                      setNuevo(null)
                    }}
                  >
                    {eliminar.isPending ? 'Quitando…' : 'Eliminar'}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={cerrar.isPending || !nuevo.desde}
                    onClick={async () => {
                      await cerrar.mutateAsync({ id: nuevo.id!, hasta: hoyEnCaracas() })
                      setNuevo(null)
                    }}
                  >
                    {cerrar.isPending ? 'Cerrando…' : 'Dejó de regir hoy'}
                  </Button>
                </>
              ) : null}
              <Button variant="ghost" onClick={() => setNuevo(null)}>
                Cancelar
              </Button>
              <Button
                disabled={
                  guardar.isPending ||
                  !nuevo.clave ||
                  !nuevo.desde ||
                  !nuevo.descripcion ||
                  !nuevo.valor.trim()
                }
                onClick={async () => {
                  await guardar.mutateAsync({
                    clave: nuevo.clave,
                    unidad: nuevo.unidad,
                    desde: nuevo.desde,
                    descripcion: nuevo.descripcion,
                    fuente: nuevo.fuente,
                    // El mismo campo de la pantalla llega a la base por una
                    // puerta o por la otra según la unidad. La base rechaza la
                    // combinación que no toca, así que no se manda de más.
                    ...(nuevo.unidad === 'TEXTO'
                      ? { texto: nuevo.valor }
                      : { valor: Number(nuevo.valor) }),
                  })
                  setNuevo(null)
                }}
              >
                {guardar.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {/*
              Treinta y tantos parámetros con nombres largos —«APORTE PATRONAL
              IVSS — RIESGO MAXIMO: CANTERAS Y TRITURACION DE PIEDRA»— en un
              desplegable del navegador: la lista se salía de la caja y tapaba
              media pantalla. Escribiendo «ivss» se llega en dos teclas.
            */}
            <SelectBuscable
              label="Parámetro"
              vacio="Elige cuál cambia"
              valor={nuevo.clave}
              onCambio={(v) => {
                const previo = (data ?? []).find((p) => p.clave === v)
                setNuevo((n) =>
                  n
                    ? {
                        ...n,
                        clave: v,
                        unidad: previo?.unidad ?? n.unidad,
                        descripcion: previo?.descripcion ?? '',
                      }
                    : n,
                )
              }}
              opciones={vigentes.map((p) => ({
                valor: p.clave,
                codigo: p.clave,
                nombre: p.descripcion,
              }))}
            />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input
                label="Valor nuevo"
                {...(nuevo.unidad === 'TEXTO'
                  ? { placeholder: 'Ana Rodríguez' }
                  : { type: 'number', step: '0.0001', inputMode: 'decimal' as const })}
                value={nuevo.valor}
                onChange={(e) => setNuevo((n) => (n ? { ...n, valor: e.target.value } : n))}
              />
              <Select
                label="Unidad"
                value={nuevo.unidad}
                onChange={(e) => setNuevo((n) => (n ? { ...n, unidad: e.target.value } : n))}
                opciones={UNIDADES}
              />
            </div>
            <Input
              label="Rige desde"
              type="date"
              hint="La fecha del decreto, no la de hoy: los períodos anteriores conservan el valor viejo."
              value={nuevo.desde}
              onChange={(e) => setNuevo((n) => (n ? { ...n, desde: e.target.value } : n))}
            />
            <Input
              label="Descripción"
              value={nuevo.descripcion}
              onChange={(e) => setNuevo((n) => (n ? { ...n, descripcion: e.target.value } : n))}
            />
            <Input
              label="Fuente"
              placeholder="Decreto 4.805, G.O. 42.880"
              icon={<Scale />}
              value={nuevo.fuente}
              onChange={(e) => setNuevo((n) => (n ? { ...n, fuente: e.target.value } : n))}
            />
            {guardar.error ? <ErrorDeCarga error={guardar.error} /> : null}
            {cerrar.error ? <ErrorDeCarga error={cerrar.error} /> : null}
            {eliminar.error ? <ErrorDeCarga error={eliminar.error} /> : null}
          </div>
        </Modal>
      ) : null}
    </>
  )
}
