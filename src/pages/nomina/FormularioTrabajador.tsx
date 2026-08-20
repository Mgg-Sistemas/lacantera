import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import {
  BASES_SALARIO,
  ESTADOS_CIVILES,
  FRECUENCIAS,
  GENEROS,
  GRUPOS_SANGUINEOS,
  JORNADAS,
  useEmpleados,
  useGuardarEmpleado,
} from '@/lib/api/nomina'
import { useMisRoles } from '@/lib/api/catalogo'
import { useTabulador } from '@/lib/api/tabulador'
import { useMetodosPago, opcionesDe } from '@/lib/api/metodosPago'
import { BANCOS } from '@/lib/bancos'
import { dinero } from '@/lib/formato'

/*
  LA FICHA DEL TRABAJADOR SE EDITA EN SU SITIO

  Esto vivía en un modal de treinta y un campos colgado de la lista, y llegar a
  él era peor que el modal: desde la ficha de la persona, «Editar datos» te
  sacaba de su ficha, te devolvía a la lista y abría la caja encima. Al guardar
  te quedabas en la lista, no en la ficha de la que habías salido.

  En un teléfono ese modal son varias pantallas de desplazamiento dentro de una
  caja que ya ocupa la pantalla entera. Un formulario largo no gana nada por
  estar en un modal: pierde la barra de dirección, pierde el botón de atrás y
  pierde poder compartirse por enlace.

  Ahora es una pantalla con su propia dirección —`/nuevo` y `/:id/editar`—, los
  campos repartidos en tres tarjetas por lo que se pregunta en cada una, y los
  botones pegados abajo para que no haya que subir hasta arriba después de
  llenar treinta campos.
*/

const vacio = {
  cedula: 'V-',
  nombres: '',
  apellidos: '',
  tabulador_id: '',
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

export function FormularioTrabajador() {
  const { id } = useParams()
  const navegar = useNavigate()
  const esNuevo = !id

  // Se piden todos, no solo los activos: a alguien que ya egresó también se le
  // corrige una cédula mal tecleada.
  const { data, isPending } = useEmpleados(false)
  const niveles = useTabulador()
  const { data: metodos } = useMetodosPago()
  const { puede } = useMisRoles()
  const guardar = useGuardarEmpleado()

  const quien = esNuevo ? undefined : data?.find((e) => e.id === Number(id))
  const [f, setF] = useState<Edicion>({ ...vacio })
  const [cargado, setCargado] = useState(false)

  useEffect(() => {
    if (esNuevo || !quien || cargado) return

    setF({
      id: quien.id,
      cedula: quien.cedula,
      nombres: quien.nombres,
      apellidos: quien.apellidos,
      tabulador_id: quien.tabulador_id ? String(quien.tabulador_id) : '',
      cargo: quien.cargo,
      departamento: quien.departamento ?? '',
      fecha_ingreso: quien.fecha_ingreso,
      fecha_nacimiento: quien.fecha_nacimiento ?? '',
      genero: quien.genero ?? '',
      nacionalidad: quien.nacionalidad ?? '',
      estado_civil: quien.estado_civil ?? '',
      grupo_sanguineo: quien.grupo_sanguineo ?? '',
      direccion: quien.direccion ?? '',
      contacto_emergencia: quien.contacto_emergencia ?? '',
      telefono_emergencia: quien.telefono_emergencia ?? '',
      frecuencia: quien.frecuencia,
      base_estipulacion: quien.base_estipulacion,
      salario_base: quien.salario_base,
      moneda_salario: quien.moneda_salario,
      tipo_jornada: quien.tipo_jornada,
      dias_utilidades: quien.dias_utilidades ?? '',
      forma_pago: quien.forma_pago,
      banco: quien.banco ?? '',
      numero_cuenta: quien.numero_cuenta ?? '',
      telefono_pago: quien.telefono_pago ?? '',
      telefono: quien.telefono ?? '',
      activo: quien.activo,
      nota: quien.nota ?? '',
    })

    // Una sola vez: si se recargara con cada respuesta de la consulta, un
    // refresco en segundo plano borraría lo que se está escribiendo.
    setCargado(true)
  }, [esNuevo, quien, cargado])

  const cambiar = (c: Partial<Edicion>) => setF((e) => ({ ...e, ...c }))

  if (!puede('RRHH')) {
    return (
      <Card>
        <p className="text-ink/60 text-sm">Las fichas del personal las lleva Recursos Humanos.</p>
      </Card>
    )
  }

  if (!esNuevo && isPending) return <Cargando />

  if (!esNuevo && !quien && !isPending) {
    return (
      <Card>
        <p className="text-ink/70 text-sm">No existe esa ficha.</p>
        <Link to="/app/nomina/personal" className="text-royal-600 mt-2 inline-block text-sm">
          Volver al personal
        </Link>
      </Card>
    )
  }

  const listo = f.nombres && f.apellidos && f.cargo && f.fecha_ingreso
  const volver = esNuevo ? '/app/nomina/personal' : `/app/nomina/personal/${id}`

  const enviar = async () => {
    const guardado = await guardar.mutateAsync(f as never)
    // Al terminar se aterriza en la ficha de la persona, tenga o no ficha
    // todavía: es donde se comprueba que quedó bien.
    void navegar(`/app/nomina/personal/${esNuevo ? guardado : id}`)
  }

  return (
    <>
      <PageHeader
        title={esNuevo ? 'Nuevo trabajador' : `${f.nombres} ${f.apellidos}`.trim()}
        description={
          esNuevo
            ? 'El número de ficha lo asigna el sistema al guardar: cuatro dígitos, correlativo.'
            : 'Los cambios se ven en su ficha en cuanto se guarda.'
        }
        actions={
          <Link to={volver}>
            <Button variant="outline" size="sm" icon={<ArrowLeft />}>
              {esNuevo ? 'Al personal' : 'A la ficha'}
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4">
        {/* ------------------------------ Quién es ------------------------------ */}
        <Card>
          <CardHeader
            title="Quién es"
            subtitle="Lo que va en el carnet y a quién avisar si pasa algo."
          />

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Input
              label="Cédula"
              placeholder="V-12345678"
              value={f.cedula}
              onChange={(e) => cambiar({ cedula: e.target.value.toUpperCase() })}
            />
            <Input
              label="Nombres"
              value={f.nombres}
              onChange={(e) => cambiar({ nombres: e.target.value })}
            />
            <Input
              label="Apellidos"
              value={f.apellidos}
              onChange={(e) => cambiar({ apellidos: e.target.value })}
            />
            <Input
              label="Fecha de nacimiento"
              type="date"
              value={f.fecha_nacimiento}
              onChange={(e) => cambiar({ fecha_nacimiento: e.target.value })}
            />
            <Select
              label="Género"
              vacio="Sin indicar"
              value={f.genero}
              onChange={(e) => cambiar({ genero: e.target.value })}
              opciones={GENEROS}
            />
            <Select
              label="Estado civil"
              vacio="Sin indicar"
              value={f.estado_civil}
              onChange={(e) => cambiar({ estado_civil: e.target.value })}
              opciones={ESTADOS_CIVILES}
            />
            <Input
              label="Nacionalidad"
              placeholder="Venezolana"
              value={f.nacionalidad}
              onChange={(e) => cambiar({ nacionalidad: e.target.value.toUpperCase() })}
            />
            <Select
              label="Grupo sanguíneo"
              vacio="Sin indicar"
              hint="Va en el carnet. En una emergencia es lo primero que se busca."
              value={f.grupo_sanguineo}
              onChange={(e) => cambiar({ grupo_sanguineo: e.target.value })}
              opciones={GRUPOS_SANGUINEOS.map((g) => ({ valor: g, etiqueta: g }))}
            />
            <Input
              label="Teléfono"
              value={f.telefono}
              onChange={(e) => cambiar({ telefono: e.target.value })}
            />
            <Input
              label="A quién llamar en una emergencia"
              placeholder="Marta Arias, esposa"
              value={f.contacto_emergencia}
              onChange={(e) => cambiar({ contacto_emergencia: e.target.value })}
            />
            <Input
              label="Teléfono de esa persona"
              value={f.telefono_emergencia}
              onChange={(e) => cambiar({ telefono_emergencia: e.target.value })}
            />
          </div>

          <div className="mt-4">
            <Textarea
              label="Dirección"
              rows={2}
              value={f.direccion}
              onChange={(e) => cambiar({ direccion: e.target.value })}
            />
          </div>
        </Card>

        {/* ----------------------------- El contrato ---------------------------- */}
        <Card>
          <CardHeader
            title="Su contrato"
            subtitle="De la fecha de ingreso salen la antigüedad, el bono vacacional y la liquidación."
          />

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {/* El cargo sale del tabulador y con él viene el sueldo. Se puede
                dejar sin nivel —hay contratos especiales—, y entonces el cargo
                se escribe a mano y el sueldo se pone abajo. Lo que no puede
                pasar es tener nivel y un sueldo que no es el del nivel sin que
                nadie se entere: de eso avisa la pantalla del tabulador. */}
            <Select
              label="Cargo del tabulador"
              vacio="Fuera del tabulador"
              hint={
                f.tabulador_id
                  ? 'Al guardar toma el sueldo de ese nivel.'
                  : 'Sin nivel, el sueldo de esta ficha se escribe a mano y no sube cuando suba el tabulador.'
              }
              value={f.tabulador_id}
              onChange={(e) => {
                const nivel = (niveles.data ?? []).find((n) => String(n.id) === e.target.value)
                cambiar(
                  nivel
                    ? {
                        tabulador_id: e.target.value,
                        cargo: nivel.cargo,
                        salario_base: nivel.sueldo_mensual,
                        moneda_salario: nivel.moneda,
                        base_estipulacion: 'MENSUAL',
                      }
                    : { tabulador_id: '' },
                )
              }}
              opciones={(niveles.data ?? [])
                .filter((n) => n.activo || String(n.id) === f.tabulador_id)
                .map((n) => ({
                  valor: String(n.id),
                  etiqueta: `${n.cargo} — ${dinero(n.moneda, n.sueldo_mensual)}`,
                }))}
            />
            <Input
              label="Cargo"
              placeholder="Operador de trituradora"
              hint={f.tabulador_id ? 'Lo pone el tabulador.' : undefined}
              disabled={Boolean(f.tabulador_id)}
              value={f.cargo}
              onChange={(e) => cambiar({ cargo: e.target.value })}
            />
            <Input
              label="Departamento o frente"
              placeholder="Planta"
              value={f.departamento}
              onChange={(e) => cambiar({ departamento: e.target.value })}
            />
            <Input
              label="Fecha de ingreso"
              type="date"
              hint={
                !esNuevo && quien && !quien.fecha_ingreso_confirmada
                  ? 'Esta fecha vino de la carga del libro de nómina y nadie la ha revisado. Corrígela: de aquí salen la antigüedad, el bono vacacional y la liquidación.'
                  : 'De aquí salen la antigüedad y las prestaciones.'
              }
              value={f.fecha_ingreso}
              onChange={(e) => cambiar({ fecha_ingreso: e.target.value })}
            />
            <Select
              label="Jornada"
              value={f.tipo_jornada}
              onChange={(e) => cambiar({ tipo_jornada: e.target.value })}
              opciones={JORNADAS}
              hint="Decide el valor de la hora y el tope de horas extra."
            />
            <Input
              label="Días de utilidades al año"
              type="number"
              placeholder="30"
              hint="Vacío usa el mínimo legal de 30 días."
              value={f.dias_utilidades}
              onChange={(e) => cambiar({ dias_utilidades: e.target.value })}
            />
          </div>
        </Card>

        {/* --------------------------- Cómo se le paga -------------------------- */}
        <Card>
          <CardHeader title="Cómo se le paga" />

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Select
              label="Salario estipulado"
              value={f.base_estipulacion}
              onChange={(e) => cambiar({ base_estipulacion: e.target.value })}
              opciones={BASES_SALARIO}
            />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input
                label="Monto"
                type="number"
                step="0.01"
                inputMode="decimal"
                hint={
                  f.tabulador_id
                    ? 'Sale del tabulador. Si lo cambias aquí, esta ficha aparecerá como desfasada hasta que alguien sincronice o corrija el nivel.'
                    : undefined
                }
                value={f.salario_base}
                onChange={(e) => cambiar({ salario_base: e.target.value })}
              />
              <Select
                label="Moneda"
                value={f.moneda_salario}
                onChange={(e) => cambiar({ moneda_salario: e.target.value })}
                opciones={[
                  { valor: 'VES', etiqueta: 'Bs' },
                  { valor: 'USD', etiqueta: '$' },
                ]}
              />
            </div>
            <Select
              label="Frecuencia de pago"
              value={f.frecuencia}
              onChange={(e) => cambiar({ frecuencia: e.target.value })}
              opciones={FRECUENCIAS}
            />
            <Select
              label="Forma de pago"
              value={f.forma_pago}
              onChange={(e) => cambiar({ forma_pago: e.target.value })}
              opciones={opcionesDe(metodos)}
            />

            {f.forma_pago === 'TRANSFERENCIA' ? (
              <>
                <Select
                  label="Banco"
                  vacio="Elige el banco"
                  value={f.banco}
                  onChange={(e) => cambiar({ banco: e.target.value })}
                  opciones={BANCOS.map((b) => ({ valor: b, etiqueta: b }))}
                />
                <Input
                  label="Número de cuenta"
                  value={f.numero_cuenta}
                  onChange={(e) => cambiar({ numero_cuenta: e.target.value })}
                />
              </>
            ) : null}

            {f.forma_pago === 'PAGO_MOVIL' ? (
              <>
                <Select
                  label="Banco"
                  vacio="Elige el banco"
                  value={f.banco}
                  onChange={(e) => cambiar({ banco: e.target.value })}
                  opciones={BANCOS.map((b) => ({ valor: b, etiqueta: b }))}
                />
                <Input
                  label="Teléfono del pago móvil"
                  value={f.telefono_pago}
                  onChange={(e) => cambiar({ telefono_pago: e.target.value })}
                />
              </>
            ) : null}
          </div>

          <div className="mt-4">
            <Textarea
              label="Nota"
              rows={2}
              value={f.nota}
              onChange={(e) => cambiar({ nota: e.target.value })}
            />
          </div>
        </Card>
      </div>

      {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-4" /> : null}

      {/*
        Los botones se quedan abajo mientras se baja por el formulario.

        Con treinta campos, ponerlos al final obliga a llenarlo todo, bajar
        hasta el fondo y buscar; y arriba, a subir. Pegados, están donde se
        mire. En el teléfono es la diferencia entre guardar y perder lo escrito
        por cerrar la pestaña sin encontrar el botón.
      */}
      <div className="border-hairline bg-surface sticky bottom-0 z-10 mt-4 flex items-center justify-end gap-2 border-t px-1 py-3">
        {!listo ? (
          <p className="text-ink/45 mr-auto text-xs">
            Faltan los nombres, los apellidos, el cargo y la fecha de ingreso.
          </p>
        ) : null}

        <Link to={volver}>
          <Button variant="ghost">Cancelar</Button>
        </Link>

        <Button disabled={!listo || guardar.isPending} onClick={enviar}>
          {guardar.isPending ? 'Guardando…' : esNuevo ? 'Crear ficha' : 'Guardar cambios'}
        </Button>
      </div>
    </>
  )
}
