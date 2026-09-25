import { useEffect, useState } from 'react'
import { useMonedasUsables, enSimbolos } from '@/lib/api/tasas'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { FormularioPorPasos } from '@/components/FormularioPorPasos'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { CampoDocumento } from '@/components/CampoDocumento'
import { CampoTelefono } from '@/components/CampoTelefono'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import {
  BASES_SALARIO,
  ESTADOS_CIVILES,
  FRECUENCIAS,
  GENEROS,
  GRADOS_INSTRUCCION,
  GRUPOS_SANGUINEOS,
  JORNADAS,
  TIPOS_CUENTA,
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
  rif: '',
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
  tipo_cuenta: '',
  telefono_pago: '',
  telefono: '',
  grado_instruccion: '',
  experiencia_empresa: '',
  experiencia_cargo: '',
  experiencia_tiempo: '',
  experiencia_motivo_retiro: '',
  activo: true,
  nota: '',
}

type Edicion = typeof vacio & { id?: number }

export function FormularioTrabajador() {
  const monedas = useMonedasUsables()
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
      rif: quien.rif ?? '',
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
      tipo_cuenta: quien.tipo_cuenta ?? '',
      telefono_pago: quien.telefono_pago ?? '',
      telefono: quien.telefono ?? '',
      grado_instruccion: quien.grado_instruccion ?? '',
      experiencia_empresa: quien.experiencia_empresa ?? '',
      experiencia_cargo: quien.experiencia_cargo ?? '',
      experiencia_tiempo: quien.experiencia_tiempo ?? '',
      experiencia_motivo_retiro: quien.experiencia_motivo_retiro ?? '',
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

  /*
    EL NIVEL QUE TIENE PUESTO, PARA PODER COMPARARLO CON EL CARGO.

    Hacía falta desde que se vio que dos fichas tenían un cargo que no era el de
    su nivel y no había forma de arreglarlo. Ver el aviso de más abajo.
  */
  const nivelPuesto = (niveles.data ?? []).find((n) => String(n.id) === f.tabulador_id) ?? null
  const cargoDesalineado = Boolean(nivelPuesto) && f.cargo !== nivelPuesto?.cargo

  const faltaQuien = !f.nombres || !f.apellidos ? 'Faltan los nombres y los apellidos.' : null
  const faltaContrato =
    !f.cargo || !f.fecha_ingreso ? 'Faltan el cargo y la fecha de ingreso.' : null
  // El ultimo paso no exige nada suyo, pero no puede guardar con un hueco de
  // los anteriores: se veria el boton de crear activo y la ficha no nacería.
  const faltaPago = faltaQuien ?? faltaContrato
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

      <FormularioPorPasos
        cancelarA={volver}
        etiquetaFinal={esNuevo ? 'Crear ficha' : 'Guardar cambios'}
        guardando={guardar.isPending}
        onTerminar={() => void enviar()}
        error={guardar.error ? <ErrorDeCarga error={guardar.error} /> : null}
        pasos={[
          {
            id: 'quien',
            titulo: 'Quién es',
            subtitulo: 'Lo que va en el carnet y a quién avisar si pasa algo.',
            falta: faltaQuien,
            contenido: (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <CampoDocumento
                    label="Cédula"
                    valor={f.cedula}
                    onCambiar={(v) => cambiar({ cedula: v })}
                  />
                  {/*
                    EL RIF NO SE RELLENA SOLO CON LA CÉDULA, aunque en la mayoría de
                    los casos sea la misma cifra con un dígito detrás. Ese dígito se
                    calcula, quien tiene firma personal lleva J, y un RIF que el
                    sistema se inventa termina impreso en una constancia que lee el
                    banco. Se pide, no se adivina.
                  */}
                  <CampoDocumento
                    label="RIF"
                    tipo="rif"
                    valor={f.rif}
                    onCambiar={(v) => cambiar({ rif: v })}
                    hint="Opcional. Con su dígito verificador: V-12.345.678-9."
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
                  {/* Entre los diecinueve telefonos de empleados habia uno guardado
                      como «O4123917198» —la letra O en vez del cero— y nadie se
                      entero hasta que se midio. La tecla filtrada lo impide. */}
                  <CampoTelefono
                    valor={f.telefono}
                    onCambiar={(v) => cambiar({ telefono: v })}
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
              </>
            ),
          },
          {
            id: 'contrato',
            titulo: 'Su contrato',
            subtitulo:
              'De la fecha de ingreso salen la antigüedad, el bono vacacional y la liquidación.',
            falta: faltaContrato,
            contenido: (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                  <div>
                    <Input
                      label="Cargo"
                      placeholder="Operador de trituradora"
                      hint={f.tabulador_id ? 'Lo pone el tabulador.' : undefined}
                      disabled={Boolean(f.tabulador_id)}
                      value={f.cargo}
                      onChange={(e) => cambiar({ cargo: e.target.value })}
                    />

                    {/*
                      CUANDO EL CARGO NO ES EL DE SU NIVEL, SE DICE Y SE ARREGLA.

                      El campo se bloquea en cuanto hay nivel, y está bien: el
                      cargo lo manda el tabulador. Lo que faltaba era la salida
                      para las fichas que se quedaron descuadradas antes de que
                      existiera ese candado.

                      Y no se podían arreglar ni queriendo. El cargo se copia
                      del nivel en el `onChange` del desplegable, así que hacía
                      falta CAMBIAR de nivel para que se copiara — volver a
                      elegir el mismo no dispara nada en un `select`. Quedaban
                      atrapadas: campo bloqueado por un lado, y por el otro la
                      única puerta que lo escribía sin abrirse nunca.

                      Lo reportaron dos personas el 24/09/2026 y eran justo las
                      dos fichas descuadradas de las veintitrés activas:
                      «ANALISTA ADMINISTRATIVO» con nivel de gerente
                      administrativo, y «SISTEMA E INVENTARIO» con nivel de
                      sistema.

                      Se enseña lo que dice cada uno en vez de arreglarlo solo
                      al guardar. Cambiarle el cargo a alguien sin avisar es de
                      las cosas que se descubren en un recibo.
                    */}
                    {cargoDesalineado ? (
                      <div className="border-warning/30 bg-warning/5 mt-2 rounded-md border px-3 py-2">
                        <p className="text-ink/75 text-xs leading-relaxed">
                          El tabulador dice{' '}
                          <strong className="text-ink/90">{nivelPuesto?.cargo}</strong> y la ficha
                          dice <strong className="text-ink/90">{f.cargo || 'nada'}</strong>.
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-1 -ml-2"
                          onClick={() => cambiar({ cargo: nivelPuesto?.cargo ?? '' })}
                        >
                          Ponerlo como el tabulador
                        </Button>
                      </div>
                    ) : null}
                  </div>
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

                {/*
                  CON QUÉ LLEGA — lo que la planilla de la entrevista pregunta y
                  hasta hoy se quedaba en el papel.

                  Nada de esto es obligatorio: hay fichas de gente que entró hace
                  años y de quien nadie guardó una entrevista. Un campo vacío aquí
                  quiere decir «no se sabe», que es distinto de «no tiene» y por eso
                  no se rellena con nada.
                */}
                <div className="mt-6">
                  <p className="text-ink/45 font-mono text-[11px] tracking-wider uppercase">
                    Con qué llega
                  </p>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <Select
                      label="Grado de instrucción"
                      vacio="Sin indicar"
                      value={f.grado_instruccion}
                      onChange={(e) => cambiar({ grado_instruccion: e.target.value })}
                      opciones={GRADOS_INSTRUCCION}
                    />
                    <Input
                      label="Última empresa donde trabajó"
                      value={f.experiencia_empresa}
                      onChange={(e) => cambiar({ experiencia_empresa: e.target.value })}
                    />
                    <Input
                      label="Cargo desempeñado"
                      value={f.experiencia_cargo}
                      onChange={(e) => cambiar({ experiencia_cargo: e.target.value })}
                    />
                    {/* Texto y no un número de meses: en la entrevista se contesta
                        «dos años y pico», y convertirlo sería inventar precisión. */}
                    <Input
                      label="Tiempo en el cargo"
                      placeholder="2 años"
                      value={f.experiencia_tiempo}
                      onChange={(e) => cambiar({ experiencia_tiempo: e.target.value })}
                    />
                    <Input
                      label="Motivo de retiro"
                      value={f.experiencia_motivo_retiro}
                      onChange={(e) => cambiar({ experiencia_motivo_retiro: e.target.value })}
                    />
                  </div>
                </div>
              </>
            ),
          },
          {
            id: 'pago',
            titulo: 'Cómo se le paga',
            subtitulo: 'Lo último. Al guardar, la ficha queda creada.',
            falta: faltaPago,
            contenido: (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                      /*
                        Este renglón es el que provocó el reclamo de los 267,17 $: se
                        escribía 500 creyendo que la quincena daría 250, y daba 267
                        porque encima se sumaba el cestaticket. Ahora el número
                        significa lo que la persona recibe, y eso hay que decirlo
                        donde se escribe, no en un manual.
                      */
                      hint={
                        'Es lo que recibe, todo incluido: de aquí salen el beneficio de alimentación y las retenciones de ley. Los bonos y las penalizaciones se cargan aparte, en cada período.' +
                        (f.tabulador_id
                          ? ' Sale del tabulador: si lo cambias aquí, la ficha quedará desfasada hasta que alguien sincronice o corrija el nivel.'
                          : '')
                      }
                      value={f.salario_base}
                      onChange={(e) => cambiar({ salario_base: e.target.value })}
                    />
                    <Select
                      label="Moneda"
                      value={f.moneda_salario}
                      onChange={(e) => cambiar({ moneda_salario: e.target.value })}
                      opciones={enSimbolos(monedas.data)}
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
                      {/* El banco rebota una transferencia mandada como corriente a
                          una cuenta de ahorro, y el que se entera es el trabajador
                          el día de pago. */}
                      <Select
                        label="Tipo de cuenta"
                        vacio="Sin indicar"
                        value={f.tipo_cuenta}
                        onChange={(e) => cambiar({ tipo_cuenta: e.target.value })}
                        opciones={TIPOS_CUENTA}
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
              </>
            ),
          },
        ]}
      />
    </>
  )
}
