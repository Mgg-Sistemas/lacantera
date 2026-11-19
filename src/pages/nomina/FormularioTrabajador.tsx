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
import {
  combinarEmpleadoConExtras,
  useConfigBancoTesoro,
  useGuardarDatosBancariosEmpleado,
} from '@/lib/api/bancoTesoro'
import {
  AGENCIAS_BT,
  CIUDADES_BT,
  CONDICIONES_INMUEBLE_BT,
  ESTADOS_BT,
  PARROQUIAS_BT,
  PROFESIONES_BT,
  SECTORES_MUNICIPIOS_BT,
  TIPOS_CARGO_BT,
  TIPOS_CUENTA_NOMINA_BT,
  TIPOS_VIVIENDA_BT,
  deducirCargoYProfesionBt,
  resolverUbicacionYAgenciaPorDireccion,
} from '@/lib/bancoTesoro/catalogos'
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
  telefono_local: '',
  correo: '',
  calle_avenida: '',
  casa_edificio: '',
  piso_nivel: '',
  apto_local: '',
  referencia_domicilio: '',
  condicion_inmueble: '',
  tipo_vivienda: '',
  tiempo_residencia: '',
  bt_region: '',
  bt_estado: '',
  bt_ciudad: '',
  bt_municipio: '',
  bt_parroquia: '',
  zona_postal: '',
  bt_profesion: '',
  bt_tipo_cargo: '',
  bt_agencia: '',
  bt_tipo_cuenta: '',
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
  const configBt = useConfigBancoTesoro()
  const guardarDatosBancarios = useGuardarDatosBancariosEmpleado()

  const quienBase = esNuevo ? undefined : data?.find((e) => e.id === Number(id))
  const quien = quienBase
    ? combinarEmpleadoConExtras(quienBase, configBt.extrasPorEmpleado)
    : undefined
  const [f, setF] = useState<Edicion>({ ...vacio })
  const [cargado, setCargado] = useState(false)

  useEffect(() => {
    if (esNuevo || !quien || configBt.isPending || cargado) return

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
      telefono_local: quien.telefono_local ?? '',
      correo: quien.correo ?? '',
      calle_avenida: quien.calle_avenida ?? '',
      casa_edificio: quien.casa_edificio ?? '',
      piso_nivel: quien.piso_nivel ?? '',
      apto_local: quien.apto_local ?? '',
      referencia_domicilio: quien.referencia_domicilio ?? '',
      condicion_inmueble: quien.condicion_inmueble ?? '',
      tipo_vivienda: quien.tipo_vivienda ?? '',
      tiempo_residencia:
        quien.tiempo_residencia !== null && quien.tiempo_residencia !== undefined
          ? String(quien.tiempo_residencia)
          : '',
      bt_region: quien.bt_region ?? '',
      bt_estado: quien.bt_estado ?? '',
      bt_ciudad: quien.bt_ciudad ?? '',
      bt_municipio: quien.bt_municipio ?? '',
      bt_parroquia: quien.bt_parroquia ?? '',
      zona_postal: quien.zona_postal ?? '',
      bt_profesion: quien.bt_profesion ?? '',
      bt_tipo_cargo: quien.bt_tipo_cargo ?? '',
      bt_agencia: quien.bt_agencia ?? '',
      bt_tipo_cuenta: quien.bt_tipo_cuenta ?? '',
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
  }, [esNuevo, quien, configBt.isPending, cargado])

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

  const ubicacionSugerida = resolverUbicacionYAgenciaPorDireccion({
    direccionTrabajador: f.direccion,
    calleTrabajador: f.calle_avenida,
    referenciaTrabajador: f.referencia_domicilio,
    agenciaManual: f.bt_agencia,
    estadoManual: f.bt_estado,
    ciudadManual: f.bt_ciudad,
    municipioManual: f.bt_municipio,
    parroquiaManual: f.bt_parroquia,
    zonaPostalManual: f.zona_postal,
  })

  const codigosCargoSugeridos = deducirCargoYProfesionBt(f.cargo, f.grado_instruccion)

  const enviar = async () => {
    const guardado = await guardar.mutateAsync(f as never)
    const idFinal = esNuevo ? Number(guardado) : Number(id)

    const tieneAlgunExtra = [
      f.correo,
      f.telefono_local,
      f.calle_avenida,
      f.casa_edificio,
      f.piso_nivel,
      f.apto_local,
      f.referencia_domicilio,
      f.condicion_inmueble,
      f.tipo_vivienda,
      f.tiempo_residencia,
      f.bt_estado,
      f.bt_ciudad,
      f.bt_municipio,
      f.bt_parroquia,
      f.zona_postal,
      f.bt_profesion,
      f.bt_tipo_cargo,
      f.bt_agencia,
      f.bt_tipo_cuenta,
    ].some((x) => Boolean(x && String(x).trim() !== ''))

    if (tieneAlgunExtra || !esNuevo) {
      await guardarDatosBancarios.mutateAsync({
        empleado_id: idFinal,
        correo: f.correo,
        telefono_local: f.telefono_local,
        calle_avenida: f.calle_avenida,
        casa_edificio: f.casa_edificio,
        piso_nivel: f.piso_nivel,
        apto_local: f.apto_local,
        referencia_domicilio: f.referencia_domicilio,
        condicion_inmueble: f.condicion_inmueble,
        tipo_vivienda: f.tipo_vivienda,
        tiempo_residencia: f.tiempo_residencia,
        bt_region: f.bt_estado
          ? ESTADOS_BT.find((x) => x.codigo === f.bt_estado)?.region ?? ''
          : '',
        bt_estado: f.bt_estado,
        bt_ciudad: f.bt_ciudad,
        bt_municipio: f.bt_municipio,
        bt_parroquia: f.bt_parroquia,
        zona_postal: f.zona_postal,
        bt_profesion: f.bt_profesion,
        bt_tipo_cargo: f.bt_tipo_cargo,
        bt_agencia: f.bt_agencia,
        bt_tipo_cuenta: f.bt_tipo_cuenta,
      })
    }

    // Al terminar se aterriza en la ficha de la persona, tenga o no ficha
    // todavía: es donde se comprueba que quedó bien.
    void navegar(`/app/nomina/personal/${idFinal}`)
  }

  return (
    <>
      <PageHeader
        title={esNuevo ? 'Nuevo trabajador' : `${f.nombres} ${f.apellidos}`.trim()}
        description={
          esNuevo
            ? 'El número de ficha lo asigna el sistema al guardar: cuatro dígitos, correlativo.'
            : 'Los cambios se reflejan en la ficha al guardar.'
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
            titulo: 'Datos personales',
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
                    hint="Con su dígito verificador: V-12.345.678-9."
                  />
                  <Input
                    label="Nombres"
                    solo="letras"
                    maxLength={60}
                    value={f.nombres}
                    onChange={(e) => cambiar({ nombres: e.target.value })}
                  />
                  <Input
                    label="Apellidos"
                    solo="letras"
                    maxLength={60}
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
                    solo="letras"
                    maxLength={40}
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
                  <CampoTelefono
                    label="Teléfono local (opcional)"
                    valor={f.telefono_local}
                    onCambiar={(v) => cambiar({ telefono_local: v })}
                  />
                  <Input
                    label="Correo electrónico (opcional)"
                    type="email"
                    placeholder="trabajador@correo.com"
                    maxLength={80}
                    value={f.correo}
                    onChange={(e) => cambiar({ correo: e.target.value })}
                  />
                  <Input
                    label="Contacto de emergencia"
                    placeholder="Marta Arias, esposa"
                    maxLength={120}
                    value={f.contacto_emergencia}
                    onChange={(e) => cambiar({ contacto_emergencia: e.target.value })}
                  />
                  <CampoTelefono
                    label="Teléfono de emergencia"
                    valor={f.telefono_emergencia}
                    onCambiar={(v) => cambiar({ telefono_emergencia: v })}
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

                <details className="border-hairline bg-canvas/60 mt-4 rounded-lg border p-4">
                  <summary className="text-ink/80 cursor-pointer text-xs font-medium select-none">
                    Domicilio desglosado y vivienda para Apertura Bancaria — Banco del Tesoro
                    (opcional)
                  </summary>
                  <p className="text-ink/50 mt-1.5 text-xs">
                    Si dejas estos campos en blanco, la plantilla de Carga Masiva (44 columnas)
                    repartirá automáticamente la dirección de arriba y asignará la ubicación y
                    agencia más cercana ({ubicacionSugerida.agencia} ·{' '}
                    {ubicacionSugerida.agenciaNombre}).
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Input
                      label="Calle / avenida"
                      maxLength={40}
                      value={f.calle_avenida}
                      onChange={(e) => cambiar({ calle_avenida: e.target.value })}
                    />
                    <Input
                      label="Casa / edificio"
                      maxLength={30}
                      value={f.casa_edificio}
                      onChange={(e) => cambiar({ casa_edificio: e.target.value })}
                    />
                    <Input
                      label="Piso / nivel"
                      maxLength={10}
                      placeholder="PB"
                      value={f.piso_nivel}
                      onChange={(e) => cambiar({ piso_nivel: e.target.value })}
                    />
                    <Input
                      label="Apto / ofic. / local"
                      maxLength={20}
                      placeholder="S/N"
                      value={f.apto_local}
                      onChange={(e) => cambiar({ apto_local: e.target.value })}
                    />
                    <Input
                      label="Referencia"
                      maxLength={40}
                      value={f.referencia_domicilio}
                      onChange={(e) => cambiar({ referencia_domicilio: e.target.value })}
                    />
                    <Select
                      label="Condición del inmueble"
                      vacio="1 — Propia (por defecto)"
                      value={f.condicion_inmueble}
                      onChange={(e) => cambiar({ condicion_inmueble: e.target.value })}
                      opciones={CONDICIONES_INMUEBLE_BT.map((x) => ({
                        valor: x.codigo,
                        etiqueta: `${x.codigo} — ${x.nombre}`,
                      }))}
                    />
                    <Select
                      label="Tipo de vivienda"
                      vacio="1 — Casa (por defecto)"
                      value={f.tipo_vivienda}
                      onChange={(e) => cambiar({ tipo_vivienda: e.target.value })}
                      opciones={TIPOS_VIVIENDA_BT.map((x) => ({
                        valor: x.codigo,
                        etiqueta: `${x.codigo} — ${x.nombre}`,
                      }))}
                    />
                    <Input
                      label="Tiempo de residencia (años)"
                      type="number"
                      placeholder="5"
                      limite={{ maxEnteros: 2, maxDecimales: 0, sinNegativos: true }}
                      value={f.tiempo_residencia}
                      onChange={(e) => cambiar({ tiempo_residencia: e.target.value })}
                    />
                    <Select
                      label="Estado (Banco del Tesoro)"
                      vacio={`Automático (${ubicacionSugerida.estado})`}
                      value={f.bt_estado}
                      onChange={(e) => cambiar({ bt_estado: e.target.value })}
                      opciones={ESTADOS_BT.map((x) => ({
                        valor: x.codigo,
                        etiqueta: `${x.codigo} — ${x.nombre}`,
                      }))}
                    />
                    <Select
                      label="Ciudad (Banco del Tesoro)"
                      vacio={`Automática (${ubicacionSugerida.ciudad})`}
                      value={f.bt_ciudad}
                      onChange={(e) => cambiar({ bt_ciudad: e.target.value })}
                      opciones={CIUDADES_BT.map((x) => ({
                        valor: x.codigo,
                        etiqueta: `${x.codigo} — ${x.nombre}`,
                      }))}
                    />
                    <Select
                      label="Municipio / Sector postal"
                      vacio={`Automático (${ubicacionSugerida.municipio})`}
                      value={f.bt_municipio}
                      onChange={(e) => cambiar({ bt_municipio: e.target.value })}
                      opciones={SECTORES_MUNICIPIOS_BT.map((x) => ({
                        valor: x.codigo,
                        etiqueta: `${x.codigo} — ${x.nombre} (${x.zonaPostal})`,
                      }))}
                    />
                    <Select
                      label="Parroquia"
                      vacio={`Automática (${ubicacionSugerida.parroquia})`}
                      value={f.bt_parroquia}
                      onChange={(e) => cambiar({ bt_parroquia: e.target.value })}
                      opciones={PARROQUIAS_BT.map((x) => ({
                        valor: x.codigo,
                        etiqueta: `${x.codigo} — ${x.nombre}`,
                      }))}
                    />
                    <Input
                      label="Zona postal"
                      solo="numeros"
                      maxLength={4}
                      placeholder={ubicacionSugerida.zonaPostal}
                      value={f.zona_postal}
                      onChange={(e) => cambiar({ zona_postal: e.target.value })}
                    />
                  </div>
                </details>
              </>
            ),
          },
          {
            id: 'contrato',
            titulo: 'Datos laborales',
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
                      maxLength={80}
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
                    maxLength={60}
                    value={f.departamento}
                    onChange={(e) => cambiar({ departamento: e.target.value })}
                  />
                  <Input
                    label="Fecha de ingreso"
                    type="date"
                    hint={
                      !esNuevo && quien && !quien.fecha_ingreso_confirmada
                        ? 'Esta fecha vino de la carga del libro de nómina y nadie la ha revisado. Corríjala: de aquí salen la antigüedad, el bono vacacional y la liquidación.'
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
                    limite={{ maxEnteros: 3, maxDecimales: 0, sinNegativos: true }}
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
                    Formación y experiencia
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
                      maxLength={120}
                      value={f.experiencia_empresa}
                      onChange={(e) => cambiar({ experiencia_empresa: e.target.value })}
                    />
                    <Input
                      label="Cargo desempeñado"
                      maxLength={80}
                      value={f.experiencia_cargo}
                      onChange={(e) => cambiar({ experiencia_cargo: e.target.value })}
                    />
                    {/* Texto y no un número de meses: en la entrevista se contesta
                        «dos años y pico», y convertirlo sería inventar precisión. */}
                    <Input
                      label="Tiempo en el cargo"
                      placeholder="2 años"
                      maxLength={40}
                      value={f.experiencia_tiempo}
                      onChange={(e) => cambiar({ experiencia_tiempo: e.target.value })}
                    />
                    <Input
                      label="Motivo de retiro"
                      maxLength={120}
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
            titulo: 'Remuneración',
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
                      limite={{ maxDecimales: 2, sinNegativos: true }}
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
                          ? ' Sale del tabulador: si lo cambia aquí, la ficha quedará desfasada hasta que alguien sincronice o corrija el nivel.'
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
                        vacio="Seleccione el banco"
                        value={f.banco}
                        onChange={(e) => cambiar({ banco: e.target.value })}
                        opciones={BANCOS.map((b) => ({ valor: b, etiqueta: b }))}
                      />
                      <Input
                        label="Número de cuenta"
                        solo="numeros"
                        maxLength={20}
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
                        vacio="Seleccione el banco"
                        value={f.banco}
                        onChange={(e) => cambiar({ banco: e.target.value })}
                        opciones={BANCOS.map((b) => ({ valor: b, etiqueta: b }))}
                      />
                      <CampoTelefono
                        label="Teléfono del pago móvil"
                        valor={f.telefono_pago}
                        onCambiar={(v) => cambiar({ telefono_pago: v })}
                      />
                    </>
                  ) : null}
                </div>

                <details className="border-hairline bg-canvas/60 mt-4 rounded-lg border p-4">
                  <summary className="text-ink/80 cursor-pointer text-xs font-medium select-none">
                    Códigos de Apertura Masiva — Banco del Tesoro 0163 (opcional)
                  </summary>
                  <p className="text-ink/50 mt-1.5 text-xs">
                    Agencia más cercana sugerida según dirección:{' '}
                    <strong>
                      {ubicacionSugerida.agencia} · {ubicacionSugerida.agenciaNombre}
                    </strong>
                    . Cargo banco sugerido: <strong>{codigosCargoSugeridos.tipoCargo}</strong> ·
                    Profesión: <strong>{codigosCargoSugeridos.profesion}</strong>.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Select
                      label="Agencia Banco del Tesoro"
                      vacio={`Automática (${ubicacionSugerida.agencia} · ${ubicacionSugerida.agenciaNombre})`}
                      value={f.bt_agencia}
                      onChange={(e) => cambiar({ bt_agencia: e.target.value })}
                      opciones={AGENCIAS_BT.map((a) => ({
                        valor: a.codigo,
                        etiqueta: `${a.codigo} · ${a.nombre}`,
                      }))}
                    />
                    <Select
                      label="Tipo de cuenta nómina"
                      vacio="VI01 — Cuenta Nómina (por defecto)"
                      value={f.bt_tipo_cuenta}
                      onChange={(e) => cambiar({ bt_tipo_cuenta: e.target.value })}
                      opciones={TIPOS_CUENTA_NOMINA_BT.map((c) => ({
                        valor: c.codigo,
                        etiqueta: c.nombre,
                      }))}
                    />
                    <Select
                      label="Tipo de cargo (catálogo BT)"
                      vacio={`Automático (${codigosCargoSugeridos.tipoCargo})`}
                      value={f.bt_tipo_cargo}
                      onChange={(e) => cambiar({ bt_tipo_cargo: e.target.value })}
                      opciones={TIPOS_CARGO_BT.map((c) => ({
                        valor: c.codigo,
                        etiqueta: `${c.codigo} — ${c.nombre}`,
                      }))}
                    />
                    <Select
                      label="Profesión (catálogo BT)"
                      vacio={`Automática (${codigosCargoSugeridos.profesion})`}
                      value={f.bt_profesion}
                      onChange={(e) => cambiar({ bt_profesion: e.target.value })}
                      opciones={PROFESIONES_BT.map((p) => ({
                        valor: p.codigo,
                        etiqueta: `${p.codigo} — ${p.nombre}`,
                      }))}
                    />
                  </div>
                </details>

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
