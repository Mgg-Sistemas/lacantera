-- ============================================================================
-- Nómina: personal, parámetros y conceptos
--
-- Todo lo que aquí se calcula sale de `docs/nomina-venezuela-marco-calculo.md`,
-- que cita el artículo de la LOTTT o el reglamento detrás de cada regla. Esta
-- migración monta la estructura; el motor de cálculo va en la siguiente.
--
-- Tres decisiones de fondo:
--
--   1. NINGUNA cifra legal está escrita en el código. Ni el salario mínimo, ni
--      la alícuota del IVSS, ni el cestaticket. Todas viven en
--      `nomina_parametros` con fecha de vigencia, porque en Venezuela cambian
--      por decreto y a veces con efecto retroactivo. Un número escrito en una
--      función obliga a migrar la base para obedecer una gaceta.
--
--   2. Los parámetros se resuelven POR FECHA DEL PERÍODO, no por fecha de hoy.
--      Recalcular en agosto una nómina de marzo tiene que dar lo mismo que dio
--      en marzo; si no, ningún recibo emitido es defendible.
--
--   3. Salario básico, normal e integral son tres cosas distintas y el motor
--      las lleva separadas. Confundirlas es, según el propio documento, la
--      fuente número uno de reclamos laborales.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Parámetros
--
-- Una fila por valor y por vigencia. Se cierra la anterior en vez de
-- sobrescribirla: el histórico es lo que permite recalcular un período viejo
-- con las cifras que regían entonces.
-- ---------------------------------------------------------------------------
create table if not exists public.nomina_parametros (
  id             bigint generated always as identity primary key,
  clave          text not null,
  valor          numeric(20,6) not null,

  -- Qué es el número: bolívares, dólares, un porcentaje, días, veces el
  -- salario mínimo. Sin esto, 5 puede ser cinco días o cinco salarios.
  unidad         text not null check (unidad in ('BS', 'USD', 'PORCENTAJE', 'DIAS', 'HORAS', 'VECES_SM', 'FACTOR', 'TEXTO')),

  vigencia_desde date not null,
  vigencia_hasta date,

  descripcion    text not null,
  fuente         text,   -- gaceta, decreto o artículo que lo respalda
  registrado_por uuid references auth.users(id),
  registrado_en  timestamptz not null default now(),

  constraint parametros_vigencia_valida check (vigencia_hasta is null or vigencia_hasta >= vigencia_desde),
  constraint parametros_unicos unique (clave, vigencia_desde)
);

create index if not exists parametros_clave_idx
  on public.nomina_parametros (clave, vigencia_desde desc);

-- Devuelve el valor que regía en una fecha. Sin parámetro, falla con un
-- mensaje que dice cuál falta: un cero silencioso convertiría una deducción
-- olvidada en un recibo aparentemente correcto.
create or replace function private.parametro(p_clave text, p_fecha date)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_valor numeric;
begin
  select valor into v_valor
  from public.nomina_parametros
  where clave = p_clave
    and vigencia_desde <= p_fecha
    and (vigencia_hasta is null or vigencia_hasta >= p_fecha)
  order by vigencia_desde desc
  limit 1;

  if v_valor is null then
    raise exception 'Falta el parámetro de nómina "%" para el %. Cárgalo en Nómina › Parámetros antes de calcular.',
      p_clave, to_char(p_fecha, 'DD/MM/YYYY')
      using errcode = 'P0002';
  end if;

  return v_valor;
end;
$$;

-- ---------------------------------------------------------------------------
-- Empleados
-- ---------------------------------------------------------------------------
create table if not exists public.empleados (
  id              bigint generated always as identity primary key,
  ficha           text not null unique,
  cedula          text not null unique,
  nombres         text not null,
  apellidos       text not null,
  fecha_nacimiento date,
  telefono        text,
  direccion       text,

  cargo           text not null,
  departamento    text,           -- planta, taller, patio, administración
  fecha_ingreso   date not null,
  fecha_egreso    date,
  motivo_egreso   text,

  -- Cómo se le paga
  frecuencia      text not null default 'QUINCENAL'
                  check (frecuencia in ('SEMANAL', 'QUINCENAL', 'MENSUAL')),
  base_estipulacion text not null default 'MENSUAL'
                  check (base_estipulacion in ('MENSUAL', 'DIARIO', 'HORA')),
  salario_base    numeric(20,6) not null check (salario_base >= 0),
  moneda_salario  char(3) not null default 'VES' references public.monedas(codigo),

  tipo_jornada    text not null default 'DIURNA'
                  check (tipo_jornada in ('DIURNA', 'NOCTURNA', 'MIXTA')),

  -- Días de utilidades: política de la empresa, mínimo legal 30 (LOTTT 131).
  -- Vive en el empleado y no solo en un parámetro porque puede pactarse
  -- distinto por contrato o por convención colectiva.
  dias_utilidades numeric(6,2),

  -- El bono vacacional crece un día por año de servicio hasta 30 (LOTTT 192).
  -- Normalmente se calcula solo; esta columna existe para el caso en que el
  -- contrato pacte más.
  dias_bono_vacacional numeric(6,2),

  -- Adónde se le paga. Un obrero puede cobrar en efectivo y un administrativo
  -- por transferencia: son dos salidas distintas de tesorería.
  forma_pago      text not null default 'TRANSFERENCIA'
                  check (forma_pago in ('TRANSFERENCIA', 'PAGO_MOVIL', 'EFECTIVO', 'BINANCE')),
  banco           text,
  numero_cuenta   text,
  telefono_pago   text,

  activo          boolean not null default true,
  nota            text,
  creado_por      uuid references auth.users(id),
  creado_en       timestamptz not null default now(),

  constraint empleados_cedula_formato check (cedula ~ '^[VE]-[0-9]{6,9}$'),
  constraint empleados_egreso_posterior check (fecha_egreso is null or fecha_egreso >= fecha_ingreso)
);

create index if not exists empleados_activos_idx on public.empleados (activo, apellidos, nombres);

-- ---------------------------------------------------------------------------
-- Conceptos
--
-- El catálogo del §9.1 del documento. Las banderas `incide_normal` e
-- `incide_integral` son configurables porque el propio artículo 105 de la
-- LOTTT permite que un contrato o una convención colectiva le dé carácter
-- salarial a algo que por defecto no lo tiene.
-- ---------------------------------------------------------------------------
create table if not exists public.nomina_conceptos (
  codigo          text primary key,
  nombre          text not null,
  tipo            text not null check (tipo in ('ASIGNACION', 'DEDUCCION', 'APORTE', 'PROVISION')),

  -- Cómo lo produce el motor. AUTOMATICO: lo calcula la nómina. NOVEDAD: lo
  -- carga alguien por empleado y período (un bono, un préstamo).
  origen          text not null default 'AUTOMATICO'
                  check (origen in ('AUTOMATICO', 'NOVEDAD')),

  incide_normal   boolean not null default false,
  incide_integral boolean not null default false,

  -- Orden de aparición en el recibo. El recibo es un documento legal
  -- (LOTTT 106) y se lee de arriba abajo: primero lo que se gana.
  orden           integer not null default 100,

  base_legal      text,
  activo          boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Períodos
-- ---------------------------------------------------------------------------
create table if not exists public.nomina_periodos (
  id            bigint generated always as identity primary key,
  numero        text not null unique,
  tipo          text not null check (tipo in ('SEMANAL', 'QUINCENAL', 'MENSUAL', 'ESPECIAL')),
  desde         date not null,
  hasta         date not null,

  -- Días que se pagan. Para la nómina venezolana el mes son 30 días aunque
  -- tenga 31: el salario mensual se divide entre 30 (LOTTT y práctica).
  dias          integer not null check (dias > 0),

  descripcion   text,

  -- La tasa se congela al abrir el período, no al pagarlo: si se moviera, el
  -- mismo recibo valdría distinto cada vez que se abre.
  tasa          numeric(20,10) not null check (tasa > 0),
  tasa_usd      numeric(20,10) not null check (tasa_usd > 0),

  estado        text not null default 'BORRADOR'
                check (estado in ('BORRADOR', 'CALCULADA', 'APROBADA', 'PAGADA', 'ANULADA')),

  calculada_en  timestamptz,
  aprobada_por  uuid references auth.users(id),
  aprobada_en   timestamptz,
  pagada_en     timestamptz,
  anulada_por   uuid references auth.users(id),
  anulada_en    timestamptz,
  motivo_anulacion text,

  creado_por    uuid references auth.users(id),
  creado_en     timestamptz not null default now(),

  constraint periodos_rango_valido check (hasta >= desde)
);

create index if not exists periodos_estado_idx on public.nomina_periodos (estado, desde desc);

-- ---------------------------------------------------------------------------
-- Novedades
--
-- Lo que cambia de un período a otro y no se puede deducir del contrato:
-- horas extras, faltas, un bono, la cuota de un préstamo. Es lo único que hay
-- que teclear cada quincena.
-- ---------------------------------------------------------------------------
create table if not exists public.nomina_novedades (
  id            bigint generated always as identity primary key,
  periodo_id    bigint not null references public.nomina_periodos(id) on delete cascade,
  empleado_id   bigint not null references public.empleados(id),

  horas_extra_diurnas   numeric(8,2) not null default 0 check (horas_extra_diurnas >= 0),
  horas_extra_nocturnas numeric(8,2) not null default 0 check (horas_extra_nocturnas >= 0),
  horas_nocturnas       numeric(8,2) not null default 0 check (horas_nocturnas >= 0),
  dias_feriados_trabajados numeric(6,2) not null default 0 check (dias_feriados_trabajados >= 0),
  dias_descanso_trabajados numeric(6,2) not null default 0 check (dias_descanso_trabajados >= 0),

  -- Las faltas injustificadas descuentan salario y cestaticket; las
  -- justificadas no descuentan salario (reposo, permiso legal) pero sí pueden
  -- afectar el cestaticket según la modalidad.
  faltas_injustificadas numeric(6,2) not null default 0 check (faltas_injustificadas >= 0),
  faltas_justificadas   numeric(6,2) not null default 0 check (faltas_justificadas >= 0),

  nota          text,
  registrado_por uuid references auth.users(id),
  registrado_en timestamptz not null default now(),

  constraint novedades_unicas unique (periodo_id, empleado_id)
);

-- Asignaciones y deducciones sueltas: un bono en divisas, la cuota de un
-- préstamo, un anticipo de prestaciones.
create table if not exists public.nomina_novedades_montos (
  id            bigint generated always as identity primary key,
  periodo_id    bigint not null references public.nomina_periodos(id) on delete cascade,
  empleado_id   bigint not null references public.empleados(id),
  concepto      text not null references public.nomina_conceptos(codigo),
  monto         numeric(20,6) not null check (monto > 0),
  moneda        char(3) not null default 'VES' references public.monedas(codigo),
  nota          text,
  registrado_por uuid references auth.users(id),
  registrado_en timestamptz not null default now()
);

create index if not exists novedades_montos_idx
  on public.nomina_novedades_montos (periodo_id, empleado_id);

-- ---------------------------------------------------------------------------
-- Recibos
--
-- El recibo es un documento con consecuencias legales (LOTTT art. 106): sin
-- él, en un juicio se presume cierto lo que alegue el trabajador. Por eso se
-- guarda el desglose completo, no solo el neto.
-- ---------------------------------------------------------------------------
create table if not exists public.nomina_recibos (
  id            bigint generated always as identity primary key,
  periodo_id    bigint not null references public.nomina_periodos(id) on delete cascade,
  empleado_id   bigint not null references public.empleados(id),

  dias_pagados  numeric(8,2) not null,

  -- Los tres escalones, en diario. Se guardan porque son la base de todo lo
  -- que venga después —vacaciones, prestaciones, liquidación— y recalcularlos
  -- años más tarde con parámetros nuevos daría otro número.
  salario_basico_diario  numeric(20,6) not null default 0,
  salario_normal_diario  numeric(20,6) not null default 0,
  salario_integral_diario numeric(20,6) not null default 0,

  total_asignaciones numeric(20,6) not null default 0,
  total_deducciones  numeric(20,6) not null default 0,
  neto               numeric(20,6) generated always as (total_asignaciones - total_deducciones) stored,
  total_aportes      numeric(20,6) not null default 0,

  -- En bolívares y en dólares con la tasa del período: el recibo se entrega en
  -- bolívares y la empresa lleva su costo en dólares.
  neto_usd      numeric(20,6) not null default 0,

  nota          text,
  calculado_en  timestamptz not null default now(),

  constraint recibos_unicos unique (periodo_id, empleado_id)
);

create index if not exists recibos_empleado_idx on public.nomina_recibos (empleado_id, id desc);

create table if not exists public.nomina_recibo_lineas (
  id           bigint generated always as identity primary key,
  recibo_id    bigint not null references public.nomina_recibos(id) on delete cascade,
  concepto     text not null references public.nomina_conceptos(codigo),
  descripcion  text not null,

  -- Cuánto y de qué: 12 horas, 2 días, 30 días. Va en el recibo porque el
  -- trabajador tiene derecho a verificar el cálculo, no solo el resultado.
  cantidad     numeric(12,2),
  base         numeric(20,6),
  monto        numeric(20,6) not null,

  tipo         text not null check (tipo in ('ASIGNACION', 'DEDUCCION', 'APORTE', 'PROVISION')),
  orden        integer not null default 100
);

create index if not exists recibo_lineas_idx on public.nomina_recibo_lineas (recibo_id, orden);

-- ---------------------------------------------------------------------------
-- Catálogo inicial de conceptos
--
-- Los del §9.1 que intervienen en una nómina regular. Vacaciones, utilidades y
-- prestaciones tienen su propio ciclo y entran después.
-- ---------------------------------------------------------------------------
insert into public.nomina_conceptos (codigo, nombre, tipo, origen, incide_normal, incide_integral, orden, base_legal) values
  ('SAL-BAS',   'Salario básico',                    'ASIGNACION', 'AUTOMATICO', true,  true,  10,  'LOTTT 104'),
  ('DESC-SEM',  'Día de descanso no trabajado',      'ASIGNACION', 'AUTOMATICO', true,  true,  20,  'LOTTT 119'),
  ('FER-NT',    'Feriado no trabajado',              'ASIGNACION', 'AUTOMATICO', true,  true,  25,  'LOTTT 119'),
  ('HE-DIU',    'Horas extra diurnas',               'ASIGNACION', 'AUTOMATICO', true,  true,  30,  'LOTTT 118'),
  ('HE-NOC',    'Horas extra nocturnas',             'ASIGNACION', 'AUTOMATICO', true,  true,  35,  'LOTTT 117 y 118'),
  ('BON-NOC',   'Bono nocturno',                     'ASIGNACION', 'AUTOMATICO', true,  true,  40,  'LOTTT 117'),
  ('FER-TRAB',  'Recargo por feriado trabajado',     'ASIGNACION', 'AUTOMATICO', true,  true,  45,  'LOTTT 120'),
  ('DESC-TRAB', 'Recargo por descanso trabajado',    'ASIGNACION', 'AUTOMATICO', true,  true,  50,  'LOTTT 120'),
  ('PRIMA',     'Prima',                             'ASIGNACION', 'NOVEDAD',    true,  true,  60,  'LOTTT 104'),
  ('COMIS',     'Comisiones',                        'ASIGNACION', 'NOVEDAD',    true,  true,  61,  'LOTTT 104'),
  ('BON-USD',   'Bono en divisas',                   'ASIGNACION', 'NOVEDAD',    true,  true,  65,  'LOTTT 104 y 105'),
  ('CESTA',     'Cestaticket',                       'ASIGNACION', 'AUTOMATICO', false, false, 70,  'LOTTT 105.2'),
  ('DED-IVSS',  'Seguro social obligatorio',         'DEDUCCION',  'AUTOMATICO', false, false, 110, 'LSS 66; Regl. 109'),
  ('DED-RPE',   'Régimen prestacional de empleo',    'DEDUCCION',  'AUTOMATICO', false, false, 115, 'LRPE 46'),
  ('DED-FAOV',  'Fondo de ahorro para la vivienda',  'DEDUCCION',  'AUTOMATICO', false, false, 120, 'LRPVH 33'),
  ('DED-PRE',   'Cuota de préstamo',                 'DEDUCCION',  'NOVEDAD',    false, false, 130, 'LOTTT 154'),
  ('DED-ANT',   'Anticipo de prestaciones',          'DEDUCCION',  'NOVEDAD',    false, false, 135, 'LOTTT 144'),
  ('DED-OTRA',  'Otra deducción',                    'DEDUCCION',  'NOVEDAD',    false, false, 140, 'LOTTT 154'),
  ('APO-IVSS',  'Aporte patronal seguro social',     'APORTE',     'AUTOMATICO', false, false, 210, 'Regl. LSS 109 y 192'),
  ('APO-RPE',   'Aporte patronal régimen de empleo', 'APORTE',     'AUTOMATICO', false, false, 215, 'LRPE 46'),
  ('APO-FAOV',  'Aporte patronal FAOV',              'APORTE',     'AUTOMATICO', false, false, 220, 'LRPVH 33'),
  ('PRV-GAR',   'Provisión de prestaciones sociales','PROVISION',  'AUTOMATICO', false, false, 310, 'LOTTT 142.a')
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------------
-- Parámetros iniciales
--
-- Los valores y las vigencias son los que el documento marca como VERIFICADOS
-- contra gaceta. Los de alta volatilidad —cestaticket, base de la LPPSS— hay
-- que revisarlos cada mes: quedan cargados con su fecha para que se vea desde
-- cuándo rigen y cuándo toca revisarlos.
-- ---------------------------------------------------------------------------
insert into public.nomina_parametros (clave, valor, unidad, vigencia_desde, descripcion, fuente) values
  ('salario_minimo_nacional', 130,   'BS',         '2022-03-15', 'Salario mínimo nacional mensual', 'Decreto 4.653, G.O. Ext. 6.691'),
  ('cestaticket_mensual_usd', 40,    'USD',        '2024-01-01', 'Beneficio de alimentación mensual, indexado en dólares', 'Decreto 4.805 + SCS 712 del 19/12/2024'),
  ('ivss_trabajador',         4,     'PORCENTAJE', '2012-04-30', 'Retención del trabajador al seguro social', 'Regl. General LSS art. 109; LSS art. 66'),
  ('ivss_patronal',           11,    'PORCENTAJE', '2012-04-30', 'Aporte patronal IVSS — riesgo máximo: canteras y trituración de piedra', 'Regl. General LSS arts. 109 y 192'),
  ('ivss_tope_salarios_minimos', 5,  'VECES_SM',   '2012-04-30', 'Tope de la base del IVSS', 'Regl. General LSS art. 98'),
  ('rpe_trabajador',          0.5,   'PORCENTAJE', '2005-09-27', 'Retención del trabajador al régimen prestacional de empleo', 'LRPE art. 46'),
  ('rpe_patronal',            2,     'PORCENTAJE', '2005-09-27', 'Aporte patronal al régimen prestacional de empleo', 'LRPE art. 46'),
  ('rpe_piso_salarios_minimos',  1,  'VECES_SM',   '2005-09-27', 'Piso de la base del RPE', 'LRPE art. 46'),
  ('rpe_tope_salarios_minimos', 10,  'VECES_SM',   '2005-09-27', 'Tope de la base del RPE', 'LRPE art. 46'),
  ('faov_trabajador',         1,     'PORCENTAJE', '2024-05-01', 'Retención del trabajador al fondo de vivienda', 'LRPVH art. 33.1, G.O. Ext. 6.805'),
  ('faov_patronal',           2,     'PORCENTAJE', '2024-05-01', 'Aporte patronal al fondo de vivienda', 'LRPVH art. 33.1'),
  ('recargo_hora_extra',      50,    'PORCENTAJE', '2012-05-07', 'Recargo de la hora extraordinaria', 'LOTTT art. 118'),
  ('recargo_bono_nocturno',   30,    'PORCENTAJE', '2012-05-07', 'Recargo por trabajo nocturno', 'LOTTT art. 117'),
  ('recargo_feriado_trabajado', 50,  'PORCENTAJE', '2012-05-07', 'Recargo por feriado o descanso trabajado', 'LOTTT art. 120'),
  ('jornada_diurna_horas',    8,     'HORAS',      '2012-05-07', 'Horas de la jornada diurna', 'LOTTT art. 173.1'),
  ('jornada_nocturna_horas',  7,     'HORAS',      '2012-05-07', 'Horas de la jornada nocturna', 'LOTTT art. 173.2'),
  ('jornada_mixta_horas',     7.5,   'HORAS',      '2012-05-07', 'Horas de la jornada mixta', 'LOTTT art. 173.3'),
  ('utilidades_dias_minimo',  30,    'DIAS',       '2012-05-07', 'Días de utilidades mínimos por año', 'LOTTT art. 131'),
  ('bono_vacacional_dias_base', 15,  'DIAS',       '2012-05-07', 'Días de bono vacacional del primer año', 'LOTTT art. 192'),
  ('bono_vacacional_tope',    30,    'DIAS',       '2012-05-07', 'Tope de días de bono vacacional', 'LOTTT art. 192'),
  ('dias_base_alicuotas',     360,   'DIAS',       '2012-05-07', 'Divisor anual para las alícuotas del salario integral', 'Convención de mercado'),
  ('dias_mes_nomina',         30,    'DIAS',       '2012-05-07', 'Días del mes a efectos de nómina', 'Práctica y LOTTT'),
  ('prestaciones_dias_trimestre', 15,'DIAS',       '2012-05-07', 'Días de garantía de prestaciones por trimestre', 'LOTTT art. 142.a'),
  ('descuento_prestamo_max',  33.33, 'PORCENTAJE', '2012-05-07', 'Máximo descontable por préstamos sobre el salario del período', 'LOTTT art. 154'),
  -- El documento marca con [VERIFICAR] cómo concurren dos recargos sobre la
  -- misma hora. 1 = se suman los porcentajes (criterio conservador para el
  -- trabajador en el cálculo simple); 2 = se aplican en cascada. Se deja como
  -- parámetro para no congelar en el código una duda que tiene que resolver un
  -- asesor laboral.
  ('modo_concurrencia_recargos', 1,  'FACTOR',     '2012-05-07', 'Cómo concurren dos recargos sobre la misma hora: 1 suma, 2 cascada', 'LOTTT arts. 117 y 118 — pendiente de criterio')
on conflict (clave, vigencia_desde) do nothing;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'nomina_parametros', 'empleados', 'nomina_conceptos', 'nomina_periodos',
    'nomina_novedades', 'nomina_novedades_montos', 'nomina_recibos',
    'nomina_recibo_lineas'
  ] loop
    execute format('alter table public.%I enable row level security', v_tabla);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', v_tabla);
    execute format('grant select on public.%I to authenticated', v_tabla);
    execute format('drop policy if exists %I on public.%I', v_tabla || '_lectura', v_tabla);
  end loop;
end
$$;

-- Los conceptos, los parámetros y los períodos los lee cualquiera con sesión.
-- Lo que identifica a una persona y dice cuánto gana, no: eso es de recursos
-- humanos, de gerencia y de tesorería, que es quien paga.
create policy nomina_parametros_lectura on public.nomina_parametros
  for select to authenticated using (true);
create policy nomina_conceptos_lectura on public.nomina_conceptos
  for select to authenticated using (true);
create policy nomina_periodos_lectura on public.nomina_periodos
  for select to authenticated using (true);

create policy empleados_lectura on public.empleados
  for select to authenticated
  using ((select public.mis_roles()) && array['ADMIN', 'RRHH', 'GERENTE_GENERAL', 'TESORERIA']::text[]);

create policy novedades_lectura on public.nomina_novedades
  for select to authenticated
  using ((select public.mis_roles()) && array['ADMIN', 'RRHH', 'GERENTE_GENERAL']::text[]);

create policy novedades_montos_lectura on public.nomina_novedades_montos
  for select to authenticated
  using ((select public.mis_roles()) && array['ADMIN', 'RRHH', 'GERENTE_GENERAL']::text[]);

create policy recibos_lectura on public.nomina_recibos
  for select to authenticated
  using ((select public.mis_roles()) && array['ADMIN', 'RRHH', 'GERENTE_GENERAL', 'TESORERIA']::text[]);

create policy recibo_lineas_lectura on public.nomina_recibo_lineas
  for select to authenticated
  using ((select public.mis_roles()) && array['ADMIN', 'RRHH', 'GERENTE_GENERAL', 'TESORERIA']::text[]);
