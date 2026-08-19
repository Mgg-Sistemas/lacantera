/*
  Nómina: el motor de cálculo.

  Dos cuidados que esta prueba tiene y las demás no:

  1. La nómina son datos reales de personas. `calcular_nomina` recorre a todos
     los empleados activos, así que lo primero que hace esta prueba es
     desactivarlos a todos dentro de la transacción y crear un trabajador de
     mentira. Así el motor no pasa por encima de ningún sueldo de verdad y,
     de paso, los totales del período son deterministas: hay un recibo y es el
     nuestro. Todo se deshace al terminar, como en el resto de las pruebas.

  2. Los números están calculados a mano contra los parámetros cargados, no
     copiados de lo que devuelve el sistema. Una prueba que compare el sistema
     consigo mismo pasa siempre, incluso cuando la fórmula está mal.

  El trabajador de prueba gana 36.000 Bs mensuales, que entre los 30 días de
  nómina son 1.200 diarios y 150 la hora en jornada diurna. Con esos números
  las cinco capas del cálculo salen exactas y sin decimales periódicos, que es
  justo lo que se necesita para poder afirmar que el resultado es el correcto
  y no uno aproximado.
*/
import { grupo, comprobar, como, comoDueno, debeFallar, asegurarTasaBcv } from './ayuda.mjs'

const cerca = (a, b, holgura = 0.01) => Math.abs(Number(a) - Number(b)) < holgura

export default async function pruebaNomina(tx) {
  grupo('Nómina · preparación')

  const [admin] = await tx`
    select ur.usuario_id as id from public.usuarios_roles ur
    join public.perfiles p on p.id = ur.usuario_id
    where ur.rol = 'ADMIN' and p.activo limit 1`

  const [cuenta] = await tx`select id from public.cuentas_tesoreria where codigo = 'BCO-VES-1'`

  comprobar(!!admin && !!cuenta, 'hay administrador y cuenta en bolívares')
  if (!admin || !cuenta) return

  // Fuera todo el personal real: el motor no va a tocar ni un sueldo de verdad.
  // Y de paso el período queda con un solo recibo, que es el que se comprueba.
  await comoDueno(tx)
  await tx`update public.empleados set activo = false where activo`

  // La semana de prueba no puede solaparse con un período ya abierto. Los que
  // estorben se anulan aquí dentro, de cualquier tipo, porque la prueba abre
  // también una quincena y un período especial sobre esos mismos días. La
  // transacción los devuelve a su sitio al terminar.
  await tx`
    update public.nomina_periodos set estado = 'ANULADA'
     where estado <> 'ANULADA'
       and desde <= current_date and hasta >= current_date - 8`

  await como(tx, admin.id)
  await asegurarTasaBcv(tx)

  // Por nombre y no por posición: `guardar_empleado` tiene 29 parámetros y ya
  // cambió de firma una vez —se le quitó la ficha y se le añadieron los datos
  // personales—. Posicional, la prueba se rompe en silencio el día que crezca
  // otra vez, y encima con un error que no señala dónde.
  const [emp] = await tx`
    select public.guardar_empleado(
      p_cedula        => 'V-99999999',
      p_nombres       => 'TRABAJADOR',
      p_apellidos     => 'DE PRUEBA',
      p_cargo         => 'OPERADOR DE PRUEBA',
      p_departamento  => 'OPERACIONES',
      p_fecha_ingreso => ((current_date - 1) - interval '3 years')::date,
      p_frecuencia    => 'SEMANAL',
      p_base          => 'MENSUAL',
      p_salario       => 36000::numeric,
      p_moneda        => 'VES',
      p_jornada       => 'DIURNA') as id`

  const [e1] = await tx`select * from public.empleados where id = ${emp.id}`
  comprobar(Number(e1.salario_base) === 36000, 'el trabajador de prueba gana 36.000 mensuales')
  comprobar(e1.frecuencia === 'SEMANAL', 'y cobra por semana')

  // Un segundo trabajador que cobra por mes. No es decorado: es lo que hace que
  // el período semanal tenga a quién dejar fuera. Antes de la corrección de la
  // frecuencia, a este le salía recibo cada semana además del suyo del mes.
  const [empMensual] = await tx`
    select public.guardar_empleado(
      p_cedula        => 'V-99999998',
      p_nombres       => 'OTRO',
      p_apellidos     => 'DE PRUEBA',
      p_cargo         => 'ADMINISTRATIVO DE PRUEBA',
      p_departamento  => 'ADMINISTRACION',
      p_fecha_ingreso => ((current_date - 1) - interval '3 years')::date,
      p_frecuencia    => 'MENSUAL',
      p_base          => 'MENSUAL',
      p_salario       => 36000::numeric,
      p_moneda        => 'VES',
      p_jornada       => 'DIURNA') as id`

  const [activos] = await tx`select count(*) as n from public.empleados where activo`
  comprobar(
    Number(activos.n) === 2,
    'quedan solo los dos de prueba activos: uno semanal y uno mensual',
  )

  // -------------------------------------------------------------------------
  grupo('Nómina · abrir el período')

  const alReves = await debeFallar(
    tx,
    (sp) => sp`select public.abrir_periodo('SEMANAL', current_date - 1, current_date - 7)`,
  )
  comprobar(
    alReves !== null && /termina antes de empezar/i.test(alReves),
    'un período no puede terminar antes de empezar',
  )

  const [periodo] = await tx`
    select public.abrir_periodo('SEMANAL', current_date - 7, current_date - 1,
           'PRUEBA: semana de prueba') as id`

  const [per1] = await tx`select * from public.nomina_periodos where id = ${periodo.id}`
  comprobar(per1.estado === 'BORRADOR', 'el período nace en borrador')
  comprobar(Number(per1.dias) === 7, 'y la semana paga 7 días')
  comprobar(Number(per1.tasa) > 0, 'con la tasa congelada al abrirlo')

  const solapado = await debeFallar(
    tx,
    (sp) => sp`select public.abrir_periodo('SEMANAL', current_date - 5, current_date + 1)`,
  )
  comprobar(
    solapado !== null && /se solapa/i.test(solapado),
    'no se abren dos nóminas sobre los mismos días: se pagaría dos veces',
  )

  // -------------------------------------------------------------------------
  grupo('Nómina · las capas del cálculo')

  // 4 horas extra diurnas, 10 nocturnas de recargo y un feriado trabajado.
  await tx`select public.guardar_novedad(${periodo.id}, ${emp.id}, 4, 0, 10, 1, 0, 0, 0,
           'PRUEBA: novedades de la semana')`

  const [calculados] = await tx`select public.calcular_nomina(${periodo.id}) as n`
  comprobar(
    Number(calculados.n) === 1,
    'la nómina semanal produce un solo recibo: el mensual no cobra esta semana',
  )

  const [delMensual] = await tx`
    select count(*) as n from public.nomina_recibos
     where periodo_id = ${periodo.id} and empleado_id = ${empMensual.id}`
  comprobar(
    Number(delMensual.n) === 0,
    'a quien cobra por mes no se le abre recibo en un período semanal',
  )

  const [recibo] = await tx`
    select * from public.nomina_recibos where periodo_id = ${periodo.id} and empleado_id = ${emp.id}`

  const linea = async (concepto) => {
    const filas = await tx`
      select * from public.nomina_recibo_lineas
       where recibo_id = ${recibo.id} and concepto = ${concepto}`
    return filas[0] ?? null
  }

  comprobar(Number(recibo.dias_pagados) === 7, 'se pagan los 7 días de la semana')
  comprobar(
    cerca(recibo.salario_basico_diario, 1200, 0.000001),
    `36.000 entre los 30 días de nómina son 1.200 diarios (${recibo.salario_basico_diario})`,
  )

  const salBas = await linea('SAL-BAS')
  comprobar(cerca(salBas.monto, 8400), `el salario del período son 1.200 × 7 = 8.400 (${salBas.monto})`)

  // La comprobación que justifica todo el orden por capas: la hora extra se
  // paga sobre la hora básica (150), no sobre una hora sacada del acumulado.
  const heDiu = await linea('HE-DIU')
  comprobar(
    cerca(heDiu.monto, 900),
    `4 horas extra a 150 con el 50% de recargo son 900 (${heDiu.monto})`,
  )
  comprobar(
    cerca(heDiu.base, 150, 0.000001),
    'y la base que se imprime en el recibo es la hora básica, 150',
  )

  const bonNoc = await linea('BON-NOC')
  comprobar(
    cerca(bonNoc.monto, 450),
    `el bono nocturno es solo el recargo: 10 × 150 × 30% = 450 (${bonNoc.monto})`,
  )

  const ferTrab = await linea('FER-TRAB')
  comprobar(
    cerca(ferTrab.monto, 600),
    `el feriado trabajado recarga el 50% del día: 600 (${ferTrab.monto})`,
  )

  // Salario normal = 8.400 + 900 + 450 + 600 = 10.350. El cestaticket queda
  // fuera a propósito (LOTTT 105.2): si entrara, subiría todas las deducciones
  // y las prestaciones de todo el mundo.
  comprobar(
    cerca(recibo.salario_normal_diario, 10350 / 7, 0.000001),
    `el salario normal diario es 10.350 entre 7 (${recibo.salario_normal_diario})`,
  )

  const cesta = await linea('CESTA')
  comprobar(cesta !== null && Number(cesta.monto) > 0, 'el cestaticket se paga con la nómina')
  comprobar(
    cerca(recibo.salario_normal_diario, 10350 / 7, 0.000001),
    'pero no entra en el salario normal: no es salario',
  )

  // Integral = normal + alícuota de bono vacacional (18 días por 3 años de
  // antigüedad) + alícuota de utilidades (30 días), sobre 360.
  const integralEsperado = (10350 / 7) * (1 + 18 / 360 + 30 / 360)
  comprobar(
    cerca(recibo.salario_integral_diario, integralEsperado, 0.000001),
    `el integral suma las alícuotas de 18 y 30 días (${recibo.salario_integral_diario})`,
  )

  // -------------------------------------------------------------------------
  grupo('Nómina · cada deducción sobre la base que manda su ley')

  const normalMensual = (10350 / 7) * 30
  const integralMensual = integralEsperado * 30

  const ivss = await linea('DED-IVSS')
  comprobar(
    cerca(ivss.base, 650, 0.01),
    `el IVSS topa en 5 salarios mínimos: 650, no los ${normalMensual.toFixed(2)} que gana (${ivss.base})`,
  )
  comprobar(cerca(ivss.monto, 6.07), `4% de 650 prorrateado a 7 días: 6,07 (${ivss.monto})`)

  const rpe = await linea('DED-RPE')
  comprobar(cerca(rpe.base, 1300, 0.01), `el RPE topa en 10 salarios mínimos: 1.300 (${rpe.base})`)
  comprobar(cerca(rpe.monto, 1.52), `0,5% de 1.300 prorrateado: 1,52 (${rpe.monto})`)

  const faov = await linea('DED-FAOV')
  comprobar(
    cerca(faov.base, integralMensual, 0.01),
    'el FAOV va sobre el salario integral, no sobre el normal',
  )
  comprobar(cerca(faov.monto, 117.3), `y sin tope: 1% prorrateado son 117,30 (${faov.monto})`)

  const apoIvss = await linea('APO-IVSS')
  comprobar(
    cerca(apoIvss.monto, 16.68),
    `el aporte patronal al IVSS es del 11%: riesgo máximo de cantera (${apoIvss.monto})`,
  )
  comprobar(apoIvss.tipo === 'APORTE', 'y es aporte, no deducción: no se le quita al trabajador')

  const provision = await linea('PRV-GAR')
  comprobar(
    cerca(provision.monto, 1955),
    `la provisión de prestaciones prorratea 15 días por trimestre: 1.955 (${provision.monto})`,
  )
  comprobar(
    provision.tipo === 'PROVISION',
    'se aparta, no se descuenta: no toca el neto del trabajador',
  )

  const [totales] = await tx`
    select
      coalesce(sum(monto) filter (where tipo = 'DEDUCCION'), 0) as deducciones,
      coalesce(sum(monto) filter (where tipo = 'ASIGNACION'), 0) as asignaciones
    from public.nomina_recibo_lineas where recibo_id = ${recibo.id}`

  comprobar(
    cerca(totales.deducciones, 124.89),
    `las deducciones del período suman 124,89 (${totales.deducciones})`,
  )
  comprobar(
    cerca(recibo.neto, Number(totales.asignaciones) - Number(totales.deducciones)),
    'el neto es lo asignado menos lo deducido, sin los aportes ni la provisión',
  )

  // -------------------------------------------------------------------------
  grupo('Nómina · faltas')

  await tx`select public.guardar_novedad(${periodo.id}, ${emp.id}, 4, 0, 10, 1, 0, 2, 0,
           'PRUEBA: dos faltas sin justificar')`
  await tx`select public.calcular_nomina(${periodo.id})`

  const [conFaltas] = await tx`
    select * from public.nomina_recibos where periodo_id = ${periodo.id} and empleado_id = ${emp.id}`
  const [salConFaltas] = await tx`
    select monto from public.nomina_recibo_lineas
     where recibo_id = ${conFaltas.id} and concepto = 'SAL-BAS'`

  comprobar(Number(conFaltas.dias_pagados) === 5, 'dos faltas sin justificar dejan 5 días pagados')
  comprobar(cerca(salConFaltas.monto, 6000), `y el salario baja a 1.200 × 5 = 6.000 (${salConFaltas.monto})`)

  await tx`select public.guardar_novedad(${periodo.id}, ${emp.id}, 4, 0, 10, 1, 0, 0, 2,
           'PRUEBA: las mismas dos faltas, ahora justificadas')`
  await tx`select public.calcular_nomina(${periodo.id})`

  const [conJustificadas] = await tx`
    select * from public.nomina_recibos where periodo_id = ${periodo.id} and empleado_id = ${emp.id}`
  comprobar(
    Number(conJustificadas.dias_pagados) === 7,
    'la falta justificada no descuenta salario: vuelven los 7 días',
  )

  // -------------------------------------------------------------------------
  grupo('Nómina · el tope del artículo 154')

  // Un tercio de lo que gana en el período: 33,33% de 10.350 = 3.449,66.
  const pasaDelTercio = await debeFallar(tx, async (sp) => {
    await sp`select public.guardar_novedad_monto(${periodo.id}, ${emp.id}, 'DED-PRE', 5000, 'VES',
             'PRUEBA: cuota de prestamo por encima del tope')`
    await sp`select public.calcular_nomina(${periodo.id})`
  })
  comprobar(
    pasaDelTercio !== null && /tope del período es/i.test(pasaDelTercio),
    'no se le descuenta más de un tercio de lo que gana, aunque deba más',
  )

  await tx`select public.guardar_novedad_monto(${periodo.id}, ${emp.id}, 'DED-PRE', 1000, 'VES',
           'PRUEBA: cuota de prestamo dentro del tope')`
  await tx`select public.calcular_nomina(${periodo.id})`

  const [conPrestamo] = await tx`
    select * from public.nomina_recibos where periodo_id = ${periodo.id} and empleado_id = ${emp.id}`
  const [lineaPrestamo] = await tx`
    select monto from public.nomina_recibo_lineas
     where recibo_id = ${conPrestamo.id} and concepto = 'DED-PRE'`

  comprobar(cerca(lineaPrestamo.monto, 1000), 'una cuota dentro del tope sí se descuenta')
  comprobar(
    cerca(conPrestamo.total_deducciones, 1124.89),
    `y se suma a las deducciones de ley: 1.124,89 (${conPrestamo.total_deducciones})`,
  )

  // -------------------------------------------------------------------------
  grupo('Nómina · recalcular es rehacer, no acumular')

  await tx`select public.calcular_nomina(${periodo.id})`
  await tx`select public.calcular_nomina(${periodo.id})`

  const [tras3] = await tx`
    select count(*) as n from public.nomina_recibos where periodo_id = ${periodo.id}`
  comprobar(Number(tras3.n) === 1, 'calcular tres veces deja un recibo, no tres')

  const [reciboFinal] = await tx`
    select * from public.nomina_recibos where periodo_id = ${periodo.id} and empleado_id = ${emp.id}`
  const [lineasPrestamo] = await tx`
    select count(*) as n from public.nomina_recibo_lineas
     where recibo_id = ${reciboFinal.id} and concepto = 'DED-PRE'`

  comprobar(Number(lineasPrestamo.n) === 1, 'y una sola línea de préstamo, no una por cálculo')
  comprobar(
    cerca(reciboFinal.total_deducciones, 1124.89),
    'las deducciones no se duplican al recalcular',
  )

  // -------------------------------------------------------------------------
  grupo('Nómina · cada período paga a quien toca')

  // Nadie cobra por quincena en esta prueba. Antes de la corrección, el motor
  // les habría hecho recibo a los dos y el mensual habría cobrado cuatro veces
  // al mes; ahora no alcanza a nadie y lo dice.
  const [quincena] = await tx`
    select public.abrir_periodo('QUINCENAL', current_date - 7, current_date - 1,
           'PRUEBA: quincena sin nadie que cobre asi') as id`

  const nadieCobraAsi = await debeFallar(
    tx,
    (sp) => sp`select public.calcular_nomina(${quincena.id})`,
  )
  comprobar(
    nadieCobraAsi !== null && /ningún trabajador activo cobra de forma quincenal/i.test(nadieCobraAsi),
    'un período al que no le toca nadie no devuelve cero en silencio: explica por qué',
  )
  comprobar(
    nadieCobraAsi !== null && /semanal/i.test(nadieCobraAsi) && /mensual/i.test(nadieCobraAsi),
    'y dice qué frecuencias sí tienen gente, que es lo que hace falta para arreglarlo',
  )

  const [quincenaEstado] = await tx`
    select estado from public.nomina_periodos where id = ${quincena.id}`
  comprobar(
    quincenaEstado.estado === 'BORRADOR',
    'el período se queda en borrador: no hay nada calculado que aprobar',
  )

  // El especial es el que se abre para las utilidades o un bono, y ese sí
  // alcanza a la plantilla entera cobre como cobre cada quien.
  const [especial] = await tx`
    select public.abrir_periodo('ESPECIAL', current_date - 7, current_date - 1,
           'PRUEBA: utilidades, alcanzan a todos') as id`

  const [calcEspecial] = await tx`select public.calcular_nomina(${especial.id}) as n`
  comprobar(
    Number(calcEspecial.n) === 2,
    'un período especial sí paga a los dos: las utilidades no distinguen frecuencia',
  )

  // -------------------------------------------------------------------------
  grupo('Nómina · aprobar y pagar')

  const sinAprobar = await debeFallar(
    tx,
    (sp) => sp`select public.pagar_nomina(${periodo.id}, ${cuenta.id}, 'REF-PRUEBA')`,
  )
  comprobar(
    sinAprobar !== null && /solo se paga una nómina aprobada/i.test(sinAprobar),
    'no se paga una nómina que nadie ha aprobado',
  )

  await tx`select public.aprobar_nomina(${periodo.id})`

  const [per2] = await tx`select estado from public.nomina_periodos where id = ${periodo.id}`
  comprobar(per2.estado === 'APROBADA', 'la gerencia la aprueba')

  const yaAprobada = await debeFallar(
    tx,
    (sp) => sp`select public.calcular_nomina(${periodo.id})`,
  )
  comprobar(
    yaAprobada !== null && /ya no se recalcula/i.test(yaAprobada),
    'y una vez aprobada ya no se recalcula: habría que anularla',
  )

  await tx`select public.registrar_ingreso(${cuenta.id}, 100000,
           'PRUEBA: fondeo para pagar la nomina de prueba')`

  const saldoAntes = Number(
    (await tx`select saldo from public.v_saldos_tesoreria where id = ${cuenta.id}`)[0].saldo,
  )

  await tx`select public.pagar_nomina(${periodo.id}, ${cuenta.id}, 'REF-PRUEBA-NOM')`

  const [per3] = await tx`select estado, pagada_en from public.nomina_periodos where id = ${periodo.id}`
  comprobar(per3.estado === 'PAGADA', 'tesorería la paga')
  comprobar(per3.pagada_en !== null, 'y queda la fecha del pago')

  const saldoDespues = Number(
    (await tx`select saldo from public.v_saldos_tesoreria where id = ${cuenta.id}`)[0].saldo,
  )
  comprobar(
    cerca(saldoAntes - saldoDespues, Number(reciboFinal.neto)),
    `de la cuenta sale exactamente el neto del recibo (${(saldoAntes - saldoDespues).toFixed(2)})`,
  )

  // -------------------------------------------------------------------------
  grupo('Nómina · el lote del tabulador')

  // El tabulador es la escala de sueldos por cargo, y sincronizarlo es el botón
  // que baja el sueldo del nivel a la ficha de todos los que cuelgan de él. Lo
  // que se comprueba aquí no es solo que actualice: es lo que promete NO tocar.

  // Alguien fuera de la escala a propósito. No tiene nivel asignado y el lote
  // no debe rozarlo por mucho que se sincronice.
  const [empSinNivel] = await tx`
    select public.guardar_empleado(
      p_cedula        => 'V-99999997',
      p_nombres       => 'TERCERO',
      p_apellidos     => 'DE PRUEBA',
      p_cargo         => 'CONTRATADO APARTE',
      p_fecha_ingreso => ((current_date - 1) - interval '3 years')::date,
      p_frecuencia    => 'MENSUAL',
      p_base          => 'MENSUAL',
      p_salario       => 20000::numeric,
      p_moneda        => 'VES',
      p_jornada       => 'DIURNA') as id`

  const [nivel] = await tx`
    select public.guardar_cargo_tabulador(
      null, 'OPERADOR DE PRUEBA', 48000::numeric, 'VES', 100, true,
      'PRUEBA: nivel del tabulador') as id`

  // Se engancha sin igualar: así queda desfasado a propósito, que es el estado
  // que el lote tiene que encontrar y corregir.
  await tx`select public.asignar_tabulador(${emp.id}, ${nivel.id}, false)`

  const [desfase] = await tx`
    select * from public.v_tabulador_desfase where empleado_id = ${emp.id}`
  comprobar(desfase !== undefined, 'el trabajador enganchado a un nivel aparece como desfasado')
  comprobar(
    cerca(desfase.diferencia, 12000),
    `y se ve de cuánto es el desfase: 48.000 contra 36.000 (${desfase.diferencia})`,
  )

  const [sinNivelEnDesfase] = await tx`
    select count(*) as n from public.v_tabulador_desfase where empleado_id = ${empSinNivel.id}`
  comprobar(
    Number(sinNivelEnDesfase.n) === 0,
    'quien no tiene nivel no aparece: está fuera de la escala, no desfasado',
  )

  const cambios = await tx`select * from public.sincronizar_tabulador()`

  comprobar(cambios.length === 1, 'el lote toca a uno solo: el que estaba desfasado')
  comprobar(
    cerca(cambios[0].salario_antes, 36000) && cerca(cambios[0].salario_ahora, 48000),
    'y devuelve el antes y el después, no un recuento',
  )

  const [trasLote] = await tx`select salario_base from public.empleados where id = ${emp.id}`
  comprobar(cerca(trasLote.salario_base, 48000), 'la ficha queda con el sueldo del tabulador')

  const [sinTocar] = await tx`
    select salario_base from public.empleados where id = ${empSinNivel.id}`
  comprobar(
    cerca(sinTocar.salario_base, 20000),
    'y a quien está fuera de la escala no se le movió el sueldo',
  )

  const [quedaDesfase] = await tx`select count(*) as n from public.v_tabulador_desfase`
  comprobar(Number(quedaDesfase.n) === 0, 'después del lote no queda nadie desfasado')

  // La promesa que más importa: un recibo ya emitido guarda sus propias cifras.
  // Si subiera con el tabulador, lo que se le pagó a alguien cambiaría meses
  // después de habérselo pagado.
  const [reciboViejo] = await tx`
    select salario_basico_diario from public.nomina_recibos where id = ${reciboFinal.id}`
  comprobar(
    cerca(reciboViejo.salario_basico_diario, 1200, 0.000001),
    'el recibo ya pagado sigue diciendo 1.200 diarios: subir el tabulador no lo reescribe',
  )

  // Pero el siguiente período sí toma el sueldo nuevo, que es justo lo que se
  // espera del lote. 48.000 entre 30 son 1.600 diarios.
  const [otroPeriodo] = await tx`
    select public.abrir_periodo('SEMANAL', current_date - 14, current_date - 8,
           'PRUEBA: la semana anterior, ya con el sueldo del tabulador') as id`

  await tx`select public.calcular_nomina(${otroPeriodo.id})`

  const [reciboNuevo] = await tx`
    select salario_basico_diario from public.nomina_recibos
     where periodo_id = ${otroPeriodo.id} and empleado_id = ${emp.id}`
  comprobar(
    cerca(reciboNuevo.salario_basico_diario, 1600, 0.000001),
    `el período siguiente ya calcula con los 48.000: 1.600 diarios (${reciboNuevo.salario_basico_diario})`,
  )

  // -------------------------------------------------------------------------
  grupo('Nómina · la dotación del trabajador')

  // Un uniforme no es una entidad aparte: es un artículo del catálogo que sale
  // del almacén a nombre de alguien. Lo que se comprueba aquí es que las dos
  // cosas pasan a la vez — queda registrado quién lo recibió y el almacén tiene
  // esas botas de menos.
  const [almacen] = await tx`select id from public.almacenes where codigo = 'ALM-GEN'`
  const [botas] = await tx`select id from public.articulos where codigo = 'EPP-BOT'`
  const [casco] = await tx`select id from public.articulos where codigo = 'EPP-CAS'`

  comprobar(!!almacen && !!botas && !!casco, 'el catálogo trae los artículos de protección')

  // Entradas costeadas, para poder comprobar que la dotación arrastra su valor.
  await comoDueno(tx)
  await tx`
    select private.registrar_movimiento('ENTRADA_COMPRA', 1, ${almacen.id}, ${botas.id},
           10, 25, 'PRUEBA: botas para dotacion')`
  await tx`
    select private.registrar_movimiento('ENTRADA_COMPRA', 1, ${almacen.id}, ${casco.id},
           10, 8, 'PRUEBA: cascos para dotacion')`
  await como(tx, admin.id)

  const existencia = async (articulo) =>
    Number(
      (
        await tx`select coalesce(sum(cantidad * signo), 0) as e
                 from public.inventario_movimientos
                 where almacen_id = ${almacen.id} and articulo_id = ${articulo}`
      )[0].e,
    )

  const noExiste = await debeFallar(
    tx,
    (sp) => sp`select public.entregar_dotacion(999999999, ${almacen.id},
               ${tx.json([{ articulo_id: Number(botas.id), cantidad: 1 }])})`,
  )
  comprobar(
    noExiste !== null && /no existe ese trabajador/i.test(noExiste),
    'no se le entrega dotación a alguien que no está en la nómina',
  )

  const deMasDotacion = await debeFallar(
    tx,
    (sp) => sp`select public.entregar_dotacion(${emp.id}, ${almacen.id},
               ${tx.json([{ articulo_id: Number(botas.id), cantidad: 99 }])})`,
  )
  comprobar(
    deMasDotacion !== null && /solo hay .* y se intentan entregar/i.test(deMasDotacion),
    'ni se entrega lo que no hay: la dotación descuenta de verdad',
  )

  const [entregadas] = await tx`
    select public.entregar_dotacion(${emp.id}, ${almacen.id},
      ${tx.json([
        { articulo_id: Number(botas.id), cantidad: 1 },
        { articulo_id: Number(casco.id), cantidad: 1 },
      ])},
      null, 'PRUEBA: dotacion de ingreso') as n`

  comprobar(Number(entregadas.n) === 2, 'se entregan las dos prendas en un solo acto')
  comprobar((await existencia(botas.id)) === 9, 'y el almacén queda con un par de botas menos')
  comprobar((await existencia(casco.id)) === 9, 'y un casco menos')

  const dotacion = await tx`
    select * from public.v_dotaciones where empleado_id = ${emp.id} order by articulo`
  comprobar(dotacion.length === 2, 'la ficha del trabajador muestra las dos prendas')
  comprobar(
    dotacion.every((d) => d.ficha !== null),
    'cada línea dice a quién se le entregó, no solo qué salió',
  )

  const conValor = dotacion.find((d) => Number(d.articulo_id) === Number(botas.id))
  comprobar(
    cerca(conValor.costo_usd, 25, 0.000001),
    `la dotación arrastra su costo: las botas salieron a 25 (${conValor.costo_usd})`,
  )

  // Una entrega mal cargada se deshace con el reverso de siempre, y entonces
  // deja de contar: si siguiera figurando, nadie sabría cuándo toca reponer.
  const [movBotas] = await tx`
    select id from public.inventario_movimientos
     where empleado_id = ${emp.id} and articulo_id = ${botas.id} limit 1`

  await tx`select public.reversar_movimiento(${movBotas.id},
           'PRUEBA: las botas eran de otra talla y se devolvieron')`

  const [trasReverso] = await tx`
    select count(*) as n from public.v_dotaciones where empleado_id = ${emp.id}`
  comprobar(Number(trasReverso.n) === 1, 'reversar la entrega la saca de la dotación')
  comprobar((await existencia(botas.id)) === 10, 'y las botas vuelven al almacén')

  // A quien ya se fue no se le entrega nada más.
  await tx`select public.egresar_empleado(${empSinNivel.id}, current_date,
           'PRUEBA: renuncia para comprobar la dotacion')`

  const yaSeFue = await debeFallar(
    tx,
    (sp) => sp`select public.entregar_dotacion(${empSinNivel.id}, ${almacen.id},
               ${tx.json([{ articulo_id: Number(casco.id), cantidad: 1 }])})`,
  )
  comprobar(
    yaSeFue !== null && /está egresado/i.test(yaSeFue),
    'y a quien ya se fue no se le entrega dotación',
  )

  await comoDueno(tx)
}
