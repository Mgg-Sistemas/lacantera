import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Pencil, Plus, Search, UserMinus, Users } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import {
  BASES_SALARIO,
  ESTADOS_CIVILES,
  FORMAS_PAGO,
  FRECUENCIAS,
  GENEROS,
  GRUPOS_SANGUINEOS,
  JORNADAS,
  useEgresarEmpleado,
  useEmpleados,
  useGuardarEmpleado,
} from '@/lib/api/nomina'
import type { Empleado } from '@/lib/api/nomina'
import { useMisRoles } from '@/lib/api/catalogo'
import { BANCOS } from '@/lib/bancos'
import { dinero, fecha } from '@/lib/formato'

const vacio = {
  cedula: 'V-',
  nombres: '',
  apellidos: '',
  cargo: '',
  departamento: '',
  fecha_ingreso: '',
  fecha_nacimiento: '',
  genero: '',
  nacionalidad: 'VENEZOLANA',
  estado_civil: '',
  grupo_sanguineo: '',
  direccion: '',
  contacto_emergencia: '',
  telefono_emergencia: '',
  frecuencia: 'QUINCENAL',
  base_estipulacion: 'MENSUAL',
  salario_base: '',
  moneda_salario: 'VES',
  tipo_jornada: 'DIURNA',
  dias_utilidades: '',
  forma_pago: 'TRANSFERENCIA',
  banco: '',
  numero_cuenta: '',
  telefono_pago: '',
  telefono: '',
  activo: true,
  nota: '',
}

type Edicion = typeof vacio & { id?: number }

/** Años y meses de servicio. Es lo que decide el bono vacacional y lo que se le debe si sale. */
function antiguedad(desde: string): string {
  const inicio = new Date(`${desde}T12:00:00`)
  const meses =
    (new Date().getFullYear() - inicio.getFullYear()) * 12 +
    (new Date().getMonth() - inicio.getMonth())
  const anios = Math.floor(meses / 12)
  const resto = meses % 12

  if (anios === 0) return `${resto} ${resto === 1 ? 'mes' : 'meses'}`
  if (resto === 0) return `${anios} ${anios === 1 ? 'año' : 'años'}`
  return `${anios} a ${resto} m`
}

export function Personal() {
  const [verInactivos, setVerInactivos] = useState(false)
  const { data, isPending, error } = useEmpleados(!verInactivos)
  const { puede } = useMisRoles()
  const guardar = useGuardarEmpleado()
  const egresar = useEgresarEmpleado()

  const [busca, setBusca] = useState('')
  const [edicion, setEdicion] = useState<Edicion | null>(null)
  const [saliendo, setSaliendo] = useState<Empleado | null>(null)
  const [egreso, setEgreso] = useState({ fecha: '', motivo: '' })

  const puedeRRHH = puede('RRHH')

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return data ?? []
    return (data ?? []).filter((e) =>
      `${e.nombres} ${e.apellidos} ${e.cedula} ${e.cargo} ${e.ficha}`.toLowerCase().includes(t),
    )
  }, [data, busca])

  const abrir = (e?: Empleado) =>
    setEdicion(
      e
        ? {
            id: e.id,
            cedula: e.cedula,
            nombres: e.nombres,
            apellidos: e.apellidos,
            cargo: e.cargo,
            departamento: e.departamento ?? '',
            fecha_ingreso: e.fecha_ingreso,
            fecha_nacimiento: e.fecha_nacimiento ?? '',
            genero: e.genero ?? '',
            nacionalidad: e.nacionalidad ?? '',
            estado_civil: e.estado_civil ?? '',
            grupo_sanguineo: e.grupo_sanguineo ?? '',
            direccion: e.direccion ?? '',
            contacto_emergencia: e.contacto_emergencia ?? '',
            telefono_emergencia: e.telefono_emergencia ?? '',
            frecuencia: e.frecuencia,
            base_estipulacion: e.base_estipulacion,
            salario_base: e.salario_base,
            moneda_salario: e.moneda_salario,
            tipo_jornada: e.tipo_jornada,
            dias_utilidades: e.dias_utilidades ?? '',
            forma_pago: e.forma_pago,
            banco: e.banco ?? '',
            numero_cuenta: e.numero_cuenta ?? '',
            telefono_pago: e.telefono_pago ?? '',
            telefono: e.telefono ?? '',
            activo: e.activo,
            nota: e.nota ?? '',
          }
        : { ...vacio },
    )

  const cambiar = (c: Partial<Edicion>) => setEdicion((e) => (e ? { ...e, ...c } : e))

  // "Editar datos" desde la ficha del trabajador llega aquí con el id en la
  // dirección. Se abre el formulario y se limpia el parámetro para que volver
  // atrás no lo vuelva a abrir.
  const [params, setParams] = useSearchParams()
  const editarId = params.get('editar')

  useEffect(() => {
    if (!editarId || !data) return

    const quien = data.find((e) => e.id === Number(editarId))

    // Puede ser alguien que ya egresó, y la lista los oculta por defecto.
    if (!quien) {
      setVerInactivos(true)
      return
    }

    abrir(quien)
    setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editarId, data])

  return (
    <>
      <PageHeader
        title="Personal"
        description="Quién trabaja aquí, desde cuándo y cuánto gana. De la fecha de ingreso salen la antigüedad, el bono vacacional y las prestaciones."
        actions={
          puedeRRHH ? (
            <Button icon={<Plus />} onClick={() => abrir()}>
              Nuevo trabajador
            </Button>
          ) : null
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1 sm:max-w-xs">
            <Input
              label="Buscar"
              placeholder="Nombre, cédula, cargo"
              icon={<Search />}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <label className="text-ink/70 flex cursor-pointer items-center gap-2 pb-2 text-sm select-none">
            <input
              type="checkbox"
              className="accent-royal-600 size-4"
              checked={verInactivos}
              onChange={(e) => setVerInactivos(e.target.checked)}
            />
            Incluir a quienes ya no trabajan aquí
          </label>
        </div>
      </Card>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<Users />}
            titulo="Todavía no hay personal cargado"
            descripcion="Sin trabajadores no se puede calcular una nómina."
            accion={
              puedeRRHH ? (
                <Button icon={<Plus />} onClick={() => abrir()}>
                  Cargar el primero
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : null}

      {filtrados.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Trabajador</th>
                  <th className="px-3 py-3 font-medium">Cargo</th>
                  <th className="px-3 py-3 font-medium">Ingreso</th>
                  <th className="px-3 py-3 text-right font-medium">Salario</th>
                  <th className="px-5 py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((e) => (
                  <tr key={e.id} className="border-hairline border-b last:border-0">
                    <td className="px-5 py-3">
                      {/* El nombre lleva a la ficha, no al formulario: mirar a
                          alguien es mucho más frecuente que corregirle un dato. */}
                      <Link
                        to={`/app/nomina/personal/${e.id}`}
                        className="text-ink/85 hover:text-royal-600 dark:hover:text-royal-300 font-medium"
                      >
                        {e.apellidos}, {e.nombres}
                      </Link>
                      <p className="text-ink/45 text-xs">
                        <span className="tabular">{e.cedula} · ficha {e.ficha}</span>
                        {e.activo ? '' : ' · egresado'}
                      </p>
                    </td>
                    <td className="text-ink/70 px-3 py-3">
                      {e.cargo}
                      {e.departamento ? (
                        <span className="text-ink/45 block text-xs">{e.departamento}</span>
                      ) : null}
                    </td>
                    <td className="text-ink/70 px-3 py-3 whitespace-nowrap">
                      {fecha(e.fecha_ingreso)}
                      <span className="text-ink/45 block text-xs">
                        {e.activo ? antiguedad(e.fecha_ingreso) : `hasta ${fecha(e.fecha_egreso)}`}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-ink/85 tabular font-medium whitespace-nowrap">
                        {dinero(e.moneda_salario, e.salario_base)}
                      </span>
                      <span className="text-ink/45 block text-xs">
                        {BASES_SALARIO.find((b) => b.valor === e.base_estipulacion)?.etiqueta} ·{' '}
                        {FRECUENCIAS.find((f) => f.valor === e.frecuencia)?.etiqueta.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {puedeRRHH ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Pencil />}
                            aria-label={`Editar a ${e.nombres} ${e.apellidos}`}
                            onClick={() => abrir(e)}
                          />
                        ) : null}
                        {puedeRRHH && e.activo ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<UserMinus />}
                            onClick={() => {
                              setSaliendo(e)
                              setEgreso({ fecha: '', motivo: '' })
                            }}
                          >
                            Egresar
                          </Button>
                        ) : (
                          <Chip tone={e.activo ? 'success' : 'neutral'}>
                            {e.activo ? 'Activo' : 'Egresado'}
                          </Chip>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* ---------------------------- Ficha ---------------------------- */}
      {edicion ? (
        <Modal
          abierto
          onCerrar={() => setEdicion(null)}
          titulo={edicion.id ? 'Editar los datos del trabajador' : 'Nuevo trabajador'}
          descripcion={
            edicion.id
              ? undefined
              : 'El número de ficha lo asigna el sistema al guardar: cuatro dígitos, correlativo.'
          }
          ancho="lg"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setEdicion(null)}>
                Cancelar
              </Button>
              <Button
                disabled={
                  guardar.isPending ||
                  !edicion.nombres ||
                  !edicion.apellidos ||
                  !edicion.cargo ||
                  !edicion.fecha_ingreso
                }
                onClick={async () => {
                  await guardar.mutateAsync(edicion as never)
                  setEdicion(null)
                }}
              >
                {guardar.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Cédula"
              placeholder="V-12345678"
              value={edicion.cedula}
              onChange={(e) => cambiar({ cedula: e.target.value.toUpperCase() })}
            />
            <Input
              label="Nombres"
              value={edicion.nombres}
              onChange={(e) => cambiar({ nombres: e.target.value })}
            />
            <Input
              label="Apellidos"
              value={edicion.apellidos}
              onChange={(e) => cambiar({ apellidos: e.target.value })}
            />
            <Input
              label="Fecha de nacimiento"
              type="date"
              value={edicion.fecha_nacimiento}
              onChange={(e) => cambiar({ fecha_nacimiento: e.target.value })}
            />
            <Select
              label="Género"
              vacio="Sin indicar"
              value={edicion.genero}
              onChange={(e) => cambiar({ genero: e.target.value })}
              opciones={GENEROS}
            />
            <Select
              label="Estado civil"
              vacio="Sin indicar"
              value={edicion.estado_civil}
              onChange={(e) => cambiar({ estado_civil: e.target.value })}
              opciones={ESTADOS_CIVILES}
            />
            <Input
              label="Nacionalidad"
              placeholder="Venezolana"
              value={edicion.nacionalidad}
              onChange={(e) => cambiar({ nacionalidad: e.target.value.toUpperCase() })}
            />
            <Select
              label="Grupo sanguíneo"
              vacio="Sin indicar"
              hint="Va en el carnet. En una emergencia es lo primero que se busca."
              value={edicion.grupo_sanguineo}
              onChange={(e) => cambiar({ grupo_sanguineo: e.target.value })}
              opciones={GRUPOS_SANGUINEOS.map((g) => ({ valor: g, etiqueta: g }))}
            />
            <Input
              label="Cargo"
              placeholder="Operador de trituradora"
              value={edicion.cargo}
              onChange={(e) => cambiar({ cargo: e.target.value })}
            />
            <Input
              label="Departamento o frente"
              placeholder="Planta"
              value={edicion.departamento}
              onChange={(e) => cambiar({ departamento: e.target.value })}
            />
            <Input
              label="Fecha de ingreso"
              type="date"
              hint="De aquí salen la antigüedad y las prestaciones."
              value={edicion.fecha_ingreso}
              onChange={(e) => cambiar({ fecha_ingreso: e.target.value })}
            />
            <Input
              label="Teléfono"
              value={edicion.telefono}
              onChange={(e) => cambiar({ telefono: e.target.value })}
            />
            <Input
              label="A quién llamar en una emergencia"
              placeholder="Marta Arias, esposa"
              value={edicion.contacto_emergencia}
              onChange={(e) => cambiar({ contacto_emergencia: e.target.value })}
            />
            <Input
              label="Teléfono de esa persona"
              value={edicion.telefono_emergencia}
              onChange={(e) => cambiar({ telefono_emergencia: e.target.value })}
            />
          </div>

          <div className="mt-4">
            <Textarea
              label="Dirección"
              rows={2}
              value={edicion.direccion}
              onChange={(e) => cambiar({ direccion: e.target.value })}
            />
          </div>

          <h3 className="text-ink/80 mt-6 mb-3 text-sm font-semibold">Cómo se le paga</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Salario estipulado"
              value={edicion.base_estipulacion}
              onChange={(e) => cambiar({ base_estipulacion: e.target.value })}
              opciones={BASES_SALARIO}
            />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input
                label="Monto"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={edicion.salario_base}
                onChange={(e) => cambiar({ salario_base: e.target.value })}
              />
              <Select
                label="Moneda"
                value={edicion.moneda_salario}
                onChange={(e) => cambiar({ moneda_salario: e.target.value })}
                opciones={[
                  { valor: 'VES', etiqueta: 'Bs' },
                  { valor: 'USD', etiqueta: '$' },
                ]}
              />
            </div>
            <Select
              label="Frecuencia de pago"
              value={edicion.frecuencia}
              onChange={(e) => cambiar({ frecuencia: e.target.value })}
              opciones={FRECUENCIAS}
            />
            <Select
              label="Jornada"
              value={edicion.tipo_jornada}
              onChange={(e) => cambiar({ tipo_jornada: e.target.value })}
              opciones={JORNADAS}
              hint="Decide el valor de la hora y el tope de horas extra."
            />
            <Input
              label="Días de utilidades al año"
              type="number"
              placeholder="30"
              hint="Vacío usa el mínimo legal de 30 días."
              value={edicion.dias_utilidades}
              onChange={(e) => cambiar({ dias_utilidades: e.target.value })}
            />
            <Select
              label="Forma de pago"
              value={edicion.forma_pago}
              onChange={(e) => cambiar({ forma_pago: e.target.value })}
              opciones={FORMAS_PAGO}
            />

            {edicion.forma_pago === 'TRANSFERENCIA' ? (
              <>
                <Select
                  label="Banco"
                  vacio="Elige el banco"
                  value={edicion.banco}
                  onChange={(e) => cambiar({ banco: e.target.value })}
                  opciones={BANCOS.map((b) => ({ valor: b, etiqueta: b }))}
                />
                <Input
                  label="Número de cuenta"
                  value={edicion.numero_cuenta}
                  onChange={(e) => cambiar({ numero_cuenta: e.target.value })}
                />
              </>
            ) : null}

            {edicion.forma_pago === 'PAGO_MOVIL' ? (
              <>
                <Select
                  label="Banco"
                  vacio="Elige el banco"
                  value={edicion.banco}
                  onChange={(e) => cambiar({ banco: e.target.value })}
                  opciones={BANCOS.map((b) => ({ valor: b, etiqueta: b }))}
                />
                <Input
                  label="Teléfono del pago móvil"
                  value={edicion.telefono_pago}
                  onChange={(e) => cambiar({ telefono_pago: e.target.value })}
                />
              </>
            ) : null}
          </div>

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

      {/* ---------------------------- Egreso ---------------------------- */}
      {saliendo ? (
        <Modal
          abierto
          onCerrar={() => setSaliendo(null)}
          titulo={`Egresar a ${saliendo.nombres} ${saliendo.apellidos}`}
          descripcion="Deja de entrar en las nóminas siguientes. Su historial se conserva entero."
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setSaliendo(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={egresar.isPending || !egreso.fecha || egreso.motivo.trim().length < 4}
                onClick={async () => {
                  await egresar.mutateAsync({ id: saliendo.id, ...egreso })
                  setSaliendo(null)
                }}
              >
                {egresar.isPending ? 'Guardando…' : 'Egresar'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Input
              label="Último día trabajado"
              type="date"
              value={egreso.fecha}
              onChange={(e) => setEgreso((g) => ({ ...g, fecha: e.target.value }))}
            />
            <Textarea
              label="Motivo"
              rows={3}
              placeholder="Renuncia, despido justificado, fin de contrato…"
              hint="De él dependen las prestaciones que le tocan."
              value={egreso.motivo}
              onChange={(e) => setEgreso((g) => ({ ...g, motivo: e.target.value }))}
            />
            {egresar.error ? <ErrorDeCarga error={egresar.error} /> : null}
          </div>
        </Modal>
      ) : null}
    </>
  )
}
