import { useState } from 'react'
import { useMonedasUsables, enSimbolos } from '@/lib/api/tasas'
import { Link } from 'react-router'
import { ArrowRight, Pencil, Plus, RefreshCw, Scale, Trash2, TriangleAlert } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas, PESTANAS_PERSONAL } from '@/components/Pestanas'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import {
  useDesfase,
  useEliminarNivel,
  useGuardarNivel,
  useSincronizarTabulador,
  useTabulador,
} from '@/lib/api/tabulador'
import type { CambioSincronizado, NivelTabulador } from '@/lib/api/tabulador'
import { useMisRoles } from '@/lib/api/catalogo'
import { dinero } from '@/lib/formato'

const vacio = {
  cargo: '',
  sueldo_mensual: '',
  moneda: 'USD',
  orden: '100',
  activo: true,
  nota: '',
}

type Edicion = typeof vacio & { id?: number }

/** Una cifra derivada, o un guion si falta el parámetro que la divide. */
const cifra = (moneda: string, valor: string | null) =>
  valor === null ? '—' : dinero(moneda, valor)

export function Tabulador() {
  const monedas = useMonedasUsables()
  const { data, isPending, error } = useTabulador()
  const desfase = useDesfase()
  const { puede } = useMisRoles()
  const guardar = useGuardarNivel()
  const eliminar = useEliminarNivel()
  const sincronizar = useSincronizarTabulador()

  const [edicion, setEdicion] = useState<Edicion | null>(null)
  const [borrando, setBorrando] = useState<NivelTabulador | null>(null)
  const [hecho, setHecho] = useState<CambioSincronizado[] | null>(null)

  const puedeRRHH = puede('RRHH')
  const fuera = desfase.data ?? []

  const abrir = (n?: NivelTabulador) =>
    setEdicion(
      n
        ? {
            id: n.id,
            cargo: n.cargo,
            sueldo_mensual: n.sueldo_mensual,
            moneda: n.moneda,
            orden: String(n.orden),
            activo: n.activo,
            nota: n.nota ?? '',
          }
        : { ...vacio },
    )

  const cambiar = (c: Partial<Edicion>) => setEdicion((e) => (e ? { ...e, ...c } : e))

  return (
    <>
      <PageHeader
        title="Tabulador de cargos"
        description="Cuánto gana cada cargo al mes. El quincenal sale de esa cifra: no se escribe aparte, para que las dos no puedan desfasarse."
        actions={
          puedeRRHH ? (
            <>
              {/* Siempre visible, aunque no haya nada que sincronizar. Un botón
                  que solo aparece cuando hace falta no se puede encontrar
                  cuando hace falta: quien no lo ha visto nunca no sabe que
                  existe. Si no hay desfase, pulsarlo lo dice y no toca nada. */}
              <Button
                variant="outline"
                icon={<RefreshCw />}
                disabled={sincronizar.isPending}
                onClick={async () => {
                  const cambios = await sincronizar.mutateAsync()
                  setHecho(cambios)
                }}
              >
                {sincronizar.isPending ? 'Sincronizando…' : 'Sincronizar'}
                {/* Sin margen propio: el botón ya es un flex con `gap`. */}
                {fuera.length > 0 ? <Chip tone="warning">{fuera.length}</Chip> : null}
              </Button>
              <Button icon={<Plus />} onClick={() => abrir()}>
                Nuevo cargo
              </Button>
            </>
          ) : null
        }
      />

      <Pestanas pestanas={PESTANAS_PERSONAL} />

      {sincronizar.error ? <ErrorDeCarga error={sincronizar.error} className="mb-4" /> : null}

      {/* -------------------- Quién está fuera de la escala -------------------- */}
      {puedeRRHH && fuera.length > 0 ? (
        <Card className="border-warning/30 mb-4 border">
          <CardHeader
            title={`${fuera.length} ${fuera.length === 1 ? 'ficha no coincide' : 'fichas no coinciden'} con el tabulador`}
            subtitle="Esto es lo que hará el botón Sincronizar de arriba: bajarles el sueldo y el nombre del cargo tal como están en la escala. Los recibos ya emitidos no cambian; una nómina en borrador sí tomará el sueldo nuevo cuando se vuelva a calcular."
          />

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="py-2 pr-3 font-medium">Trabajador</th>
                  <th className="px-3 py-2 font-medium">Cargo</th>
                  <th className="px-3 py-2 text-right font-medium">Tiene</th>
                  <th className="px-3 py-2 text-right font-medium">Pasa a</th>
                </tr>
              </thead>
              <tbody>
                {fuera.map((d) => (
                  <tr key={d.empleado_id} className="border-hairline border-b last:border-0">
                    <td className="py-2.5 pr-3">
                      <Link
                        to={`/app/nomina/personal/${d.empleado_id}`}
                        className="text-ink/85 hover:text-royal-600 dark:hover:text-royal-300 font-medium"
                      >
                        {d.apellidos}, {d.nombres}
                      </Link>
                      <span className="text-ink/45 tabular block text-xs">ficha {d.ficha}</span>
                    </td>
                    <td className="text-ink/70 px-3 py-2.5 text-xs">
                      {d.cargo === d.cargo_tabulador ? (
                        d.cargo
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-ink/45 line-through">{d.cargo}</span>
                          <ArrowRight className="text-ink/30 size-3" />
                          {d.cargo_tabulador}
                        </span>
                      )}
                    </td>
                    <td className="text-ink/55 tabular px-3 py-2.5 text-right whitespace-nowrap">
                      {dinero(d.moneda_actual, d.salario_actual)}
                    </td>
                    <td className="tabular px-3 py-2.5 text-right whitespace-nowrap">
                      <span
                        className={
                          Number(d.diferencia) >= 0
                            ? 'text-success font-medium'
                            : 'text-danger font-medium'
                        }
                      >
                        {dinero(d.moneda_tabulador, d.salario_tabulador)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </Card>
      ) : null}

      {puedeRRHH && desfase.isFetched && fuera.length === 0 ? (
        <Card className="mb-4">
          <p className="text-ink/60 text-sm">
            Todas las fichas coinciden con el tabulador, así que <strong>Sincronizar</strong> no
            tiene nada que hacer ahora mismo. Cuando cambies un sueldo aquí abajo, esta franja te
            dirá a quién le toca y de cuánto a cuánto, antes de que pulses nada.
          </p>
        </Card>
      ) : null}

      {/* ----------------------------- La escala ----------------------------- */}
      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<Scale />}
            titulo="El tabulador está vacío"
            descripcion="Sin escala de sueldos, cada ficha lleva su cifra suelta y subir un cargo obliga a corregirlas una por una."
            accion={
              puedeRRHH ? (
                <Button icon={<Plus />} onClick={() => abrir()}>
                  Cargar el primer cargo
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : null}

      {data && data.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            {/* Menos ancho mínimo cada vez que se va una columna: primero el
                semanal y el diario, ahora la alimentación y el total. Con el de
                antes, en un teléfono la tabla arrastraba un scroll horizontal
                que ya no hace falta. */}
            <table className="w-full min-w-[440px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Cargo</th>
                  <th className="px-3 py-3 text-right font-medium">Mensual</th>
                  <th className="px-3 py-3 text-right font-medium">Quincenal</th>
                  <th className="px-5 py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {data.map((n) => (
                  <tr key={n.id} className="border-hairline border-b last:border-0">
                    <td className="px-5 py-3">
                      <span className="text-ink/85 font-medium">{n.cargo}</span>
                      <span className="text-ink/45 block text-xs">
                        {n.personas === 0
                          ? 'nadie en este nivel'
                          : n.personas === 1
                            ? '1 persona'
                            : `${n.personas} personas`}
                        {n.activo ? '' : ' · inactivo'}
                      </span>
                    </td>
                    <td className="text-ink/85 tabular px-3 py-3 text-right font-medium whitespace-nowrap">
                      {dinero(n.moneda, n.sueldo_mensual)}
                    </td>
                    <td className="text-ink/70 tabular px-3 py-3 text-right whitespace-nowrap">
                      {cifra(n.moneda, n.sueldo_quincenal)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {puedeRRHH ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Pencil />}
                            aria-label={`Editar ${n.cargo}`}
                            onClick={() => abrir(n)}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Trash2 />}
                            aria-label={`Quitar ${n.cargo}`}
                            onClick={() => setBorrando(n)}
                          />
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* De dónde sale la única cifra que no se teclea. En pequeño y debajo:
              a quien consulta un sueldo no le hace falta, y a quien se pregunta
              por qué no puede editar el quincenal le hace mucha. */}
          <p className="text-ink/40 border-hairline border-t px-5 py-3 text-xs">
            Solo se guarda el mensual. El quincenal es su mitad y se calcula cada vez, así que las
            dos cifras no pueden acabar diciendo cosas distintas.
          </p>
        </Card>
      ) : null}

      {/* ------------------------- Ficha de un nivel ------------------------- */}
      {edicion ? (
        <Modal
          abierto
          onCerrar={() => setEdicion(null)}
          titulo={edicion.id ? `Editar ${edicion.cargo}` : 'Nuevo cargo del tabulador'}
          descripcion="Solo se guarda el sueldo mensual. La quincena se calcula a partir de él."
          ancho="md"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setEdicion(null)}>
                Cancelar
              </Button>
              <Button
                disabled={guardar.isPending || edicion.cargo.trim().length < 3 || !edicion.sueldo_mensual}
                onClick={async () => {
                  await guardar.mutateAsync(edicion)
                  setEdicion(null)
                }}
              >
                {guardar.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input
                label="Cargo"
                placeholder="Operador de trituradora"
                hint="Es el nombre con el que las fichas se enganchan a este nivel."
                value={edicion.cargo}
                onChange={(e) => cambiar({ cargo: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input
                label="Sueldo mensual"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={edicion.sueldo_mensual}
                onChange={(e) => cambiar({ sueldo_mensual: e.target.value })}
              />
              <Select
                label="Moneda"
                value={edicion.moneda}
                onChange={(e) => cambiar({ moneda: e.target.value })}
                opciones={enSimbolos(monedas.data)}
              />
            </div>

            {/* El quincenal sale solo mientras se teclea el mensual. Va
                bloqueado a propósito: si se pudiera escribir, alguien pondría
                una mitad que no es la mitad y el tabulador diría dos cosas
                distintas del mismo sueldo — que es exactamente lo que pasó en
                la hoja de cálculo con el supervisor y la analista. */}
            <Input
              label="Quincena"
              disabled
              hint="La mitad del mensual. Se calcula sola."
              value={
                edicion.sueldo_mensual && Number(edicion.sueldo_mensual) > 0
                  ? dinero(edicion.moneda, Number(edicion.sueldo_mensual) / 2)
                  : ''
              }
              placeholder="Escribe el mensual"
              readOnly
            />

            <Input
              label="Orden en la lista"
              type="number"
              hint="Menor sale primero. El tabulador se lee como una escala, no en alfabético."
              value={edicion.orden}
              onChange={(e) => cambiar({ orden: e.target.value })}
            />

            <label className="text-ink/70 flex cursor-pointer items-center gap-2 pb-2 text-sm select-none sm:pt-7">
              <input
                type="checkbox"
                className="accent-royal-600 size-4"
                checked={edicion.activo}
                onChange={(e) => cambiar({ activo: e.target.checked })}
              />
              Vigente
            </label>
          </div>

          {/* El beneficio de alimentación no se escribe aquí a propósito: es un
              solo número para toda la empresa, vive en Parámetros de nómina con
              su vigencia y su origen legal, y es el que la nómina paga. Escrito
              también por cargo, el día que cambie el anuncio el tabulador se
              quedaría diciendo el monto viejo. */}
          <p className="text-ink/45 bg-ink/4 mt-4 rounded-[6px] px-3 py-2 text-xs">
            Aquí solo va el sueldo. El beneficio de alimentación es el mismo para todos y se carga
            una sola vez en{' '}
            <Link
              to="/app/nomina/parametros"
              className="text-royal-600 hover:text-royal-700 dark:text-royal-300 font-medium"
            >
              Parámetros de nómina
            </Link>
            .
          </p>

          <div className="mt-4">
            <Textarea
              label="Nota"
              rows={2}
              value={edicion.nota}
              onChange={(e) => cambiar({ nota: e.target.value })}
            />
          </div>

          {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-4" /> : null}
        </Modal>
      ) : null}

      {/* ---------------------------- Quitar nivel ---------------------------- */}
      {borrando ? (
        <Modal
          abierto
          onCerrar={() => setBorrando(null)}
          titulo={`Quitar ${borrando.cargo} del tabulador`}
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setBorrando(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={eliminar.isPending}
                onClick={async () => {
                  await eliminar.mutateAsync(borrando.id)
                  setBorrando(null)
                }}
              >
                {eliminar.isPending ? 'Quitando…' : 'Quitar'}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            {borrando.personas > 0 ? (
              <p className="text-ink/70 flex items-start gap-2 text-sm leading-relaxed">
                <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" />
                Hay {borrando.personas}{' '}
                {borrando.personas === 1 ? 'persona' : 'personas'} en este nivel. La base no va a
                dejar quitarlo: si se soltaran, seguirían cobrando lo mismo pero dejarían de subir
                cuando suba el cargo, y nadie sabría por qué. Muévelas antes, o desmarca «Vigente»
                para que deje de ofrecerse sin perder a quien está dentro.
              </p>
            ) : (
              <p className="text-ink/70 text-sm leading-relaxed">
                No hay nadie en este nivel, así que quitarlo no le cambia el sueldo a ninguna ficha.
              </p>
            )}
            {eliminar.error ? <ErrorDeCarga error={eliminar.error} /> : null}
          </div>
        </Modal>
      ) : null}

      {/* -------------------- Qué hizo el botón, exactamente -------------------- */}
      {hecho ? (
        <Modal
          abierto
          onCerrar={() => setHecho(null)}
          titulo={
            hecho.length === 0
              ? 'No había nada que sincronizar'
              : `${hecho.length} ${hecho.length === 1 ? 'ficha actualizada' : 'fichas actualizadas'}`
          }
          descripcion={
            hecho.length > 0
              ? 'Estas personas cobran distinto a partir de la próxima nómina que se calcule.'
              : undefined
          }
          ancho="md"
          acciones={<Button onClick={() => setHecho(null)}>Entendido</Button>}
        >
          {hecho.length === 0 ? (
            <p className="text-ink/60 text-sm">
              Alguien más lo había hecho ya, o el desfase se resolvió desde la ficha.
            </p>
          ) : (
            <ul className="divide-hairline divide-y text-sm">
              {hecho.map((c) => (
                <li key={c.empleado_id} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-ink/85 truncate font-medium">{c.nombre}</p>
                    <p className="text-ink/45 truncate text-xs">
                      {c.cargo_ahora} · ficha {c.ficha}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs whitespace-nowrap">
                    <span className="text-ink/45 tabular line-through">
                      {dinero(c.moneda_antes, c.salario_antes)}
                    </span>
                    <ArrowRight className="text-ink/30 size-3.5" />
                    <Chip tone={Number(c.salario_ahora) >= Number(c.salario_antes) ? 'success' : 'warning'}>
                      {dinero(c.moneda_ahora, c.salario_ahora)}
                    </Chip>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      ) : null}
    </>
  )
}
