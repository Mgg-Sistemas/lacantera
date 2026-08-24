import { useEffect, useState } from 'react'
import { Fuel, Plus, TriangleAlert } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useMaquinaria } from '@/lib/api/maquinaria'
import {
  MOTIVOS,
  useConsumoCombustible,
  useDespachosCombustible,
  useDespacharCombustible,
  usePersonasParaVale,
  useTanques,
  type MotivoDespacho,
} from '@/lib/api/combustible'
import { useMisPermisos } from '@/lib/api/usuarios'
import { dolares, fecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

function litros(valor: string | number, unidad = 'L'): string {
  return `${Number(valor).toLocaleString('es-VE', { maximumFractionDigits: 2 })} ${unidad}`
}

/**
 * El combustible.
 *
 * TRES BLOQUES, EN EL ORDEN EN QUE SE PREGUNTAN
 *
 * Cuánto queda —porque quedarse sin gasoil para el frente para la cantera un
 * día entero—, cuánto consume cada máquina, y el detalle de cada despacho.
 *
 * EL CONSUMO POR HORA ES EL BLOQUE QUE JUSTIFICA EL MÓDULO
 *
 * El saldo ya lo daba Existencias. Lo que no existía era el litro por hora, y
 * es el único número de esta pantalla que avisa de algo antes de que pase: una
 * máquina que sube de 8 a 12 litros por hora tiene un problema mecánico que
 * todavía no se oye.
 *
 * Cuando falta el horómetro la columna va vacía. No se estima: un consumo por
 * hora inventado se parece demasiado a uno medido.
 */
export function Combustible() {
  const tanques = useTanques()
  const consumo = useConsumoCombustible()
  const despachos = useDespachosCombustible()
  const { puede } = useMisPermisos()
  const [despachando, setDespachando] = useState(false)

  const puedeDespachar = puede('COMBUSTIBLE', 'ESCRITURA')
  const bajos = (tanques.data ?? []).filter(
    (t) => Number(t.stock_minimo) > 0 && Number(t.existencia) <= Number(t.stock_minimo),
  )

  return (
    <>
      <PageHeader
        title="Combustible"
        description="Cuánto queda, cuánto consume cada máquina y a qué se le echó. Las entradas llegan por las compras recibidas."
        actions={
          puedeDespachar ? (
            <Button icon={<Plus />} onClick={() => setDespachando(true)}>
              Despachar
            </Button>
          ) : undefined
        }
      />

      {bajos.length > 0 ? (
        <div className="border-warning/30 bg-warning-soft mb-4 flex items-start gap-2.5 rounded-[6px] border p-3.5">
          <TriangleAlert className="text-warning mt-px size-[18px] shrink-0" />
          <p className="text-ink/80 text-sm">
            <strong className="font-semibold">
              {bajos.map((t) => t.articulo).join(' y ')} en el mínimo o por debajo
            </strong>
            . Quedarse sin combustible para el frente para la cantera un día entero.
          </p>
        </div>
      ) : null}

      {/* --------------------------------------------------- cuánto queda */}
      <h2 className="text-ink/80 mb-3 text-sm font-semibold">En el tanque</h2>

      {tanques.isPending ? <Cargando /> : null}
      {tanques.error ? <ErrorDeCarga error={tanques.error} /> : null}

      {!tanques.isPending && (tanques.data ?? []).length === 0 ? (
        <Card className="mb-6">
          <Vacio
            icono={<Fuel />}
            titulo="El tanque está vacío"
            descripcion="El combustible entra por una compra recibida en el tanque. Desde ahí se despacha a las máquinas."
          />
        </Card>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(tanques.data ?? []).map((t) => {
          const hay = Number(t.existencia)
          const minimo = Number(t.stock_minimo)
          const bajo = minimo > 0 && hay <= minimo

          return (
            <Card key={`${t.almacen_id}-${t.articulo_id}`}>
              <p className="text-ink/55 text-xs">{t.almacen}</p>
              <p className="text-ink/90 mt-0.5 text-base font-medium">{t.articulo}</p>
              <p
                className={cn(
                  'tabular mt-2 text-2xl font-semibold',
                  bajo ? 'text-warning' : 'text-ink/90',
                )}
              >
                {litros(t.existencia, t.unidad)}
              </p>
              <p className="text-ink/45 mt-1 text-xs">
                {t.costo_promedio_usd
                  ? `${dolares(t.costo_promedio_usd)} por ${t.unidad.toLowerCase()}`
                  : 'Sin costo registrado'}
                {minimo > 0 ? ` · mínimo ${litros(t.stock_minimo, t.unidad)}` : ''}
              </p>
            </Card>
          )
        })}
      </div>

      {/* ------------------------------------------------ cuánto consume */}
      <h2 className="text-ink/80 mb-1 text-sm font-semibold">Consumo por máquina</h2>
      <p className="text-ink/50 mb-3 text-xs leading-relaxed">
        Los litros por hora salen de cruzar lo despachado con las horas del parte diario. Donde no
        hay lecturas de horómetro la columna va vacía: un consumo estimado se parece demasiado a
        uno medido.
      </p>

      {consumo.isPending ? <Cargando /> : null}
      {!consumo.isPending && (consumo.data ?? []).length === 0 ? (
        <Card className="mb-6">
          <Vacio
            icono={<Fuel />}
            titulo="Todavía no se ha despachado a ninguna máquina"
            descripcion="Cuando se le eche combustible a una máquina anotando su horómetro, aquí aparecerá cuánto consume por hora."
          />
        </Card>
      ) : null}

      {(consumo.data ?? []).length > 0 ? (
        <Card flush className="mb-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Máquina</th>
                  <th className="px-3 py-3 text-right font-medium">Litros</th>
                  <th className="px-3 py-3 text-right font-medium">Horas</th>
                  <th className="px-3 py-3 text-right font-medium">L/hora</th>
                  <th className="px-3 py-3 text-right font-medium">USD/hora</th>
                  <th className="px-5 py-3 text-right font-medium">Gasto</th>
                </tr>
              </thead>
              <tbody>
                {(consumo.data ?? []).map((c) => (
                  <tr key={c.maquina_id} className="border-hairline border-b last:border-0">
                    <td className="px-5 py-3">
                      <p className="text-ink/85 font-medium">{c.maquina}</p>
                      <p className="text-ink/45 text-2xs">
                        <span className="font-mono">{c.maquina_codigo}</span> · {c.veces} despacho
                        {c.veces === 1 ? '' : 's'} desde el {fecha(c.desde)}
                      </p>
                    </td>
                    <td className="tabular text-ink/85 px-3 py-3 text-right">
                      {Number(c.litros).toLocaleString('es-VE', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="tabular text-ink/65 px-3 py-3 text-right">
                      {c.horas
                        ? Number(c.horas).toLocaleString('es-VE', { maximumFractionDigits: 0 })
                        : '—'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {c.litros_por_hora ? (
                        <span className="tabular text-ink/90 font-semibold">
                          {Number(c.litros_por_hora).toLocaleString('es-VE', {
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      ) : (
                        <span
                          className="text-ink/35"
                          title="Falta anotar el horómetro en el parte diario"
                        >
                          —
                        </span>
                      )}
                    </td>
                    <td className="tabular text-ink/65 px-3 py-3 text-right">
                      {c.costo_por_hora_usd ? dolares(c.costo_por_hora_usd) : '—'}
                    </td>
                    <td className="tabular text-ink/85 px-5 py-3 text-right">
                      {dolares(c.costo_usd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* -------------------------------------------------- cada despacho */}
      <h2 className="text-ink/80 mb-3 text-sm font-semibold">Últimos despachos</h2>

      {despachos.isPending ? <Cargando /> : null}
      {despachos.error ? <ErrorDeCarga error={despachos.error} /> : null}

      {!despachos.isPending && (despachos.data ?? []).length === 0 ? (
        <Card>
          <Vacio
            icono={<Fuel />}
            titulo="Sin despachos todavía"
            descripcion="Cada vez que se le eche combustible a algo quedará anotado aquí: a qué, para qué, cuánto y quién lo recibió."
          />
        </Card>
      ) : null}

      {(despachos.data ?? []).length > 0 ? (
        <Card flush>
          <ul className="divide-hairline divide-y">
            {(despachos.data ?? []).map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 grow">
                  <p className="text-ink/85 text-sm">
                    <span className="tabular font-semibold">{litros(d.cantidad, d.unidad)}</span> de{' '}
                    {d.combustible} · {d.destino}
                    {d.maquina_codigo ? (
                      <span className="text-ink/45 text-2xs ml-1.5 font-mono">
                        {d.maquina_codigo}
                      </span>
                    ) : (
                      <Chip tone="neutral" className="ml-2">
                        Sin ficha
                      </Chip>
                    )}
                    <Chip
                      tone={d.motivo === 'OPERACION' ? 'info' : 'neutral'}
                      className="ml-2"
                    >
                      {MOTIVOS.find((m) => m.valor === d.motivo)?.etiqueta ?? d.motivo}
                    </Chip>
                  </p>
                  {/* La segunda línea responde las cinco preguntas del vale:
                      cuándo, para qué, quién lo recibió y quién lo surtió. La
                      hora solo sale cuando se sabe — un vale transcrito al día
                      siguiente no la tiene, y nula es más honesto que inventada. */}
                  <p className="text-ink/45 text-xs">
                    {fecha(d.fecha)}
                    {d.hora ? ` a las ${d.hora.slice(0, 5)}` : ''}
                    {d.numero ? ` · ${d.numero}` : ''}
                    {d.horometro ? ` · horómetro ${Number(d.horometro)}` : ' · sin horómetro'}
                    {` · recibió ${d.recibio}`}
                    {d.surtio ? ` · surtió ${d.surtio}` : ''}
                  </p>
                  {d.nota ? <p className="text-ink/60 mt-1 text-sm">{d.nota}</p> : null}
                </div>
                {d.costo_usd ? (
                  <span className="tabular text-ink/70 text-sm">{dolares(d.costo_usd)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <ModalDespacho abierto={despachando} onCerrar={() => setDespachando(false)} />
    </>
  )
}

/**
 * Echarle combustible a algo.
 *
 * EL HORÓMETRO SE PIDE ARRIBA, NO ABAJO
 *
 * Va justo debajo de la máquina porque es cuando quien despacha lo tiene
 * delante: está parado al lado del equipo con el reloj a la vista. Preguntarlo
 * al final, después de la cantidad y la fecha, es preguntarlo cuando ya se dio
 * la vuelta.
 *
 * No es obligatorio. Un generador de emergencia también consume y puede no
 * llevar horómetro; exigirlo obligaría a inventar un número, y un horómetro
 * inventado estropea el cálculo de todos los demás despachos de esa máquina.
 */
function ModalDespacho({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const despachar = useDespacharCombustible()
  const tanques = useTanques()
  const { data: maquinas } = useMaquinaria(true)
  const { data: personas } = usePersonasParaVale()

  const hoy = new Date().toLocaleDateString('en-CA')
  const [tanque, setTanque] = useState('')
  const [maquina, setMaquina] = useState('')
  const [destino, setDestino] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [horometro, setHorometro] = useState('')
  const [empleado, setEmpleado] = useState('')
  // Para quien no esta en la nomina: el chofer de un fletero al que se le echa
  // gasoil no tiene ficha, y sin esto el vale se quedaria sin nombre.
  const [otroNombre, setOtroNombre] = useState('')
  const [otraCedula, setOtraCedula] = useState('')
  const [motivo, setMotivo] = useState<MotivoDespacho | ''>('')
  const [dia, setDia] = useState(hoy)
  const [nota, setNota] = useState('')

  const conSaldo = (tanques.data ?? []).filter((t) => Number(t.existencia) > 0)

  useEffect(() => {
    if (!abierto) return
    setTanque(conSaldo.length === 1 ? `${conSaldo[0].almacen_id}|${conSaldo[0].articulo_id}` : '')
    setMaquina('')
    setDestino('')
    setCantidad('')
    setHorometro('')
    setEmpleado('')
    setOtroNombre('')
    setOtraCedula('')
    setMotivo('')
    setDia(hoy)
    setNota('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  const elegido = conSaldo.find((t) => `${t.almacen_id}|${t.articulo_id}` === tanque)
  const pedidos = Number(cantidad)
  const excede = elegido ? pedidos > Number(elegido.existencia) : false
  const sinFicha = maquina === ''

  // Quien recibe es obligatorio, de la nomina o escrito a mano. El combustible
  // es de lo que mas se pierde, y un vale sin nombre no se le puede preguntar
  // a nadie.
  const hayQuienRecibe = empleado !== '' || otroNombre.trim().length >= 3

  const valido =
    elegido !== undefined &&
    pedidos > 0 &&
    !excede &&
    motivo !== '' &&
    hayQuienRecibe &&
    (!sinFicha || destino.trim().length >= 3)

  const enviar = async () => {
    if (!elegido) return
    await despachar.mutateAsync({
      articulo_id: elegido.articulo_id,
      almacen_id: elegido.almacen_id,
      cantidad: pedidos,
      motivo: motivo as MotivoDespacho,
      maquina_id: maquina ? Number(maquina) : null,
      destino: sinFicha ? destino.trim() : null,
      horometro: horometro ? Number(horometro) : null,
      empleado_id: empleado ? Number(empleado) : null,
      recibio_nombre: empleado ? null : otroNombre.trim(),
      recibio_cedula: empleado ? null : otraCedula.trim() || null,
      fecha: dia,
      nota: nota.trim() || null,
    })
    onCerrar()
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Despachar combustible"
      descripcion="Se descuenta del tanque al costo promedio que tenga ahora."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={!valido || despachar.isPending}>
            {despachar.isPending ? 'Guardando…' : 'Despachar'}
          </Button>
        </>
      }
    >
      <Select
        label="De qué tanque"
        vacio="Elegir"
        value={tanque}
        onChange={(e) => setTanque(e.target.value)}
        opciones={conSaldo.map((t) => ({
          valor: `${t.almacen_id}|${t.articulo_id}`,
          etiqueta: `${t.articulo} · quedan ${litros(t.existencia, t.unidad)}`,
        }))}
        hint={
          conSaldo.length === 0
            ? 'No hay combustible cargado en ningún tanque.'
            : undefined
        }
      />

      {/* El «para qué» va antes que el «a qué»: son preguntas distintas, y si
          van juntas la gente contesta la máquina y da el motivo por sabido. */}
      <div className="mt-4">
        <Select
          label="Para qué"
          vacio="Elegir"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value as MotivoDespacho)}
          opciones={MOTIVOS.map((m) => ({ valor: m.valor, etiqueta: m.etiqueta }))}
          hint={
            MOTIVOS.find((m) => m.valor === motivo)?.pista ??
            'No es lo mismo que a qué máquina: la misma excavadora se surte para producir o para probarla tras repararla.'
          }
        />
      </div>

      <div className="mt-4">
        <SelectBuscable
          label="A qué máquina"
          vacio="No está en la ficha"
          valor={maquina}
          onCambio={(v) => setMaquina(v)}
          opciones={(maquinas ?? []).map((m) => ({
            valor: String(m.id),
            etiqueta: `${m.codigo} · ${m.nombre}`,
          }))}
          hint="Sin máquina no hay consumo por hora: solo cuenta para el gasto."
        />
      </div>

      {sinFicha ? (
        <div className="mt-4">
          <Input
            label="A qué se le echó"
            placeholder="Planta eléctrica de la oficina"
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
          />
        </div>
      ) : (
        <div className="mt-4">
          <Input
            label="Horómetro al echarle"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="Si el reloj se puede leer"
            value={horometro}
            onChange={(e) => setHorometro(e.target.value)}
            hint="Es lo que convierte los litros en litros por hora."
          />
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input
          label={`Cuántos ${elegido?.unidad?.toLowerCase() ?? 'litros'}`}
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          error={
            excede && elegido
              ? `En el tanque solo quedan ${litros(elegido.existencia, elegido.unidad)}`
              : undefined
          }
        />
        <Input label="Fecha" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
      </div>

      <div className="mt-4">
        <SelectBuscable
          label="Quién lo recibió"
          vacio="No está en la nómina"
          valor={empleado}
          onCambio={(v) => setEmpleado(v)}
          opciones={(personas ?? []).map((e) => ({
            valor: String(e.id),
            etiqueta: e.cargo ? `${e.nombre} · ${e.cargo}` : e.nombre,
          }))}
          hint="El combustible es de lo que más se pierde: un vale sin nombre no se le puede preguntar a nadie."
        />
      </div>

      {/* A la cantera entran gandolas de fleteros a las que se les echa gasoil,
          y su chófer no está en la nómina. Sin esta salida, o el vale se queda
          sin nombre o alguien acaba poniendo el suyo. */}
      {empleado === '' ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input
            label="Nombre de quien recibió"
            placeholder="José Ramírez"
            value={otroNombre}
            onChange={(e) => setOtroNombre(e.target.value)}
          />
          <Input
            label="Cédula"
            placeholder="V-12345678"
            value={otraCedula}
            onChange={(e) => setOtraCedula(e.target.value)}
            hint="Opcional, pero es lo que permite dar con la persona después."
          />
        </div>
      ) : null}

      <div className="mt-4">
        <Textarea label="Nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
      </div>

      {despachar.error ? <ErrorDeCarga error={despachar.error} className="mt-3" /> : null}
    </Modal>
  )
}
