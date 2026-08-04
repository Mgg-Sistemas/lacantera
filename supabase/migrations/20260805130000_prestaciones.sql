-- ============================================================================
-- Prestaciones sociales
--
-- Lo que la empresa le debe a cada trabajador por el tiempo que lleva
-- trabajando, y que existe aunque nadie lo escriba. La nómina ya venía
-- apartando la provisión en cada recibo; lo que faltaba era la cuenta de cada
-- quien: cuánto lleva acumulado, cuánto se le ha adelantado y cuánto habría
-- que pagarle si se fuera mañana.
--
-- CINCO DECISIONES:
--
-- 1. SE ARRANCA DE UN CORTE, NO DEL PRIMER DÍA. La gente más antigua entró en
--    2021 y el sistema no tiene los salarios de aquellos trimestres. Calcular
--    hacia atrás daría un número con cara de exacto y falso. En su lugar se
--    carga a mano lo que cada quien tiene acumulado hasta una fecha, con quién
--    lo cargó y cuándo, y desde ahí el sistema sigue solo. Un corte cargado a
--    mano se ve que es a mano; un retroactivo inventado no.
--
-- 2. EL DEPÓSITO SALE DEL ÚLTIMO RECIBO DEL TRIMESTRE. La ley pide quince días
--    de salario integral por trimestre, al último salario del trimestre. Ese
--    salario ya está calculado en los recibos, con las horas extras y los
--    recargos que se pagaron de verdad. Solo cuando no hay ningún recibo del
--    trimestre se calcula desde la ficha, y el depósito queda marcado para que
--    se sepa que es una estimación.
--
-- 3. LOS DOS DÍAS ADICIONALES SE ABONAN EN EL ANIVERSARIO. Después del primer
--    año, dos días más por año, acumulativos hasta treinta (LOTTT 142.b). Se
--    acreditan en el trimestre donde cae el aniversario de ingreso, que es
--    cuando se causan.
--
-- 4. EL DINERO NO SE MUEVE HASTA QUE SALE. La cuenta se lleva; la plata sigue
--    en las cuentas de la empresa. Solo hay movimiento de tesorería cuando
--    alguien pide un anticipo o cuando se le liquida, porque ahí el dinero sí
--    sale de verdad.
--
-- 5. SE PAGA LA MAYOR DE LAS DOS CUENTAS. La ley manda comparar lo acumulado
--    trimestre a trimestre contra treinta días por año al último salario
--    integral, y pagar la que resulte mayor (LOTTT 142.d). El sistema calcula
--    las dos y enseña las dos: quien firma la liquidación tiene que poder ver
--    por qué salió ese número.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- El corte
-- ---------------------------------------------------------------------------
create table if not exists public.prestaciones_corte (
  empleado_id     bigint primary key references public.empleados(id) on delete cascade,
  fecha_corte     date not null,

  moneda          char(3) not null default 'VES' references public.monedas(codigo),
  garantia        numeric(20,2) not null default 0 check (garantia >= 0),
  dias_acumulados numeric(10,2) not null default 0 check (dias_acumulados >= 0),
  intereses       numeric(20,2) not null default 0 check (intereses >= 0),
  anticipos       numeric(20,2) not null default 0 check (anticipos >= 0),

  nota            text,
  cargado_por     uuid references auth.users(id),
  cargado_en      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Depósitos trimestrales
-- ---------------------------------------------------------------------------
create table if not exists public.prestaciones_depositos (
  id            bigint generated always as identity primary key,
  empleado_id   bigint not null references public.empleados(id) on delete cascade,
  anio          smallint not null,
  trimestre     smallint not null check (trimestre between 1 and 4),
  fecha         date not null,

  dias          numeric(10,2) not null default 15 check (dias >= 0),
  dias_adicionales numeric(10,2) not null default 0 check (dias_adicionales >= 0),

  salario_normal_diario   numeric(20,6) not null check (salario_normal_diario >= 0),
  salario_integral_diario numeric(20,6) not null check (salario_integral_diario >= 0),

  moneda        char(3) not null references public.monedas(codigo),
  tasa          numeric(20,10) not null check (tasa > 0),
  tasa_usd      numeric(20,10) not null check (tasa_usd > 0),
  monto         numeric(20,2) not null check (monto >= 0),
  monto_usd     numeric(20,2) generated always as (round(monto * tasa / tasa_usd, 2)) stored,

  -- Cuando no hubo recibos en el trimestre, el salario sale de la ficha y no
  -- de lo que se pagó. Es una estimación y tiene que verse que lo es.
  estimado      boolean not null default false,

  estado        text not null default 'CALCULADO'
                check (estado in ('CALCULADO', 'ANULADO')),
  motivo_anulacion text,
  anulado_por   uuid references auth.users(id),
  anulado_en    timestamptz,

  calculado_por uuid references auth.users(id),
  calculado_en  timestamptz not null default now()
);

create unique index if not exists prestaciones_deposito_unico
  on public.prestaciones_depositos (empleado_id, anio, trimestre)
  where estado = 'CALCULADO';

create index if not exists prestaciones_depositos_emp_idx
  on public.prestaciones_depositos (empleado_id, anio desc, trimestre desc);

-- ---------------------------------------------------------------------------
-- Intereses
--
-- La tasa la publica el BCV cada mes y no se puede adivinar: se carga. Sin
-- tasa cargada no se calculan intereses de ese mes, y eso se ve, que es mejor
-- que calcularlos con un número inventado.
-- ---------------------------------------------------------------------------
create table if not exists public.prestaciones_tasas (
  anio          smallint not null,
  mes           smallint not null check (mes between 1 and 12),
  tasa          numeric(8,4) not null check (tasa >= 0),   -- anual, en porcentaje
  fuente        text,
  registrada_por uuid references auth.users(id),
  registrada_en timestamptz not null default now(),
  primary key (anio, mes)
);

create table if not exists public.prestaciones_intereses (
  id            bigint generated always as identity primary key,
  empleado_id   bigint not null references public.empleados(id) on delete cascade,
  anio          smallint not null,
  mes           smallint not null check (mes between 1 and 12),

  base          numeric(20,2) not null check (base >= 0),
  tasa          numeric(8,4) not null check (tasa >= 0),
  moneda        char(3) not null references public.monedas(codigo),
  monto         numeric(20,2) not null check (monto >= 0),

  calculado_por uuid references auth.users(id),
  calculado_en  timestamptz not null default now(),

  unique (empleado_id, anio, mes)
);

-- ---------------------------------------------------------------------------
-- Anticipos
-- ---------------------------------------------------------------------------
create table if not exists public.prestaciones_anticipos (
  id            bigint generated always as identity primary key,
  numero        text not null unique,
  empleado_id   bigint not null references public.empleados(id),
  fecha         date not null default current_date,

  motivo        text not null check (motivo in
                ('VIVIENDA', 'SALUD', 'EDUCACION', 'PENSION_ALIMENTARIA', 'OTRO')),
  detalle       text,

  cuenta_id     bigint references public.cuentas_tesoreria(id),
  moneda        char(3) not null references public.monedas(codigo),
  tasa          numeric(20,10) not null check (tasa > 0),
  tasa_usd      numeric(20,10) not null check (tasa_usd > 0),
  monto         numeric(20,2) not null check (monto > 0),
  monto_usd     numeric(20,2) generated always as (round(monto * tasa / tasa_usd, 2)) stored,

  referencia    text,
  movimiento_id bigint references public.tesoreria_movimientos(id),

  estado        text not null default 'REGISTRADO'
                check (estado in ('REGISTRADO', 'ANULADO')),
  motivo_anulacion text,
  anulado_por   uuid references auth.users(id),
  anulado_en    timestamptz,

  registrado_por uuid references auth.users(id),
  registrado_en  timestamptz not null default now()
);

create index if not exists prestaciones_anticipos_emp_idx
  on public.prestaciones_anticipos (empleado_id, fecha desc);

-- ---------------------------------------------------------------------------
-- Liquidaciones
-- ---------------------------------------------------------------------------
create table if not exists public.prestaciones_liquidaciones (
  id            bigint generated always as identity primary key,
  numero        text not null unique,
  empleado_id   bigint not null references public.empleados(id),

  fecha_ingreso date not null,
  fecha_egreso  date not null,
  motivo        text not null check (motivo in
                ('RENUNCIA', 'DESPIDO_JUSTIFICADO', 'DESPIDO_INJUSTIFICADO',
                 'CONTRATO_VENCIDO', 'JUBILACION', 'FALLECIMIENTO')),

  anios_servicio  numeric(10,4) not null,
  dias_servicio   integer not null,

  moneda        char(3) not null references public.monedas(codigo),
  tasa          numeric(20,10) not null check (tasa > 0),
  tasa_usd      numeric(20,10) not null check (tasa_usd > 0),

  salario_normal_diario   numeric(20,6) not null,
  salario_integral_diario numeric(20,6) not null,

  -- Las dos cuentas que manda comparar el 142.d
  garantia_acumulada   numeric(20,2) not null default 0,
  retroactivo_30_dias  numeric(20,2) not null default 0,
  base_prestaciones    numeric(20,2) not null default 0,   -- la mayor de las dos

  intereses            numeric(20,2) not null default 0,
  anticipos            numeric(20,2) not null default 0,

  vacaciones_dias      numeric(10,2) not null default 0,
  vacaciones_monto     numeric(20,2) not null default 0,
  bono_vacacional_dias numeric(10,2) not null default 0,
  bono_vacacional_monto numeric(20,2) not null default 0,
  utilidades_dias      numeric(10,2) not null default 0,
  utilidades_monto     numeric(20,2) not null default 0,

  -- LOTTT 92: en el despido injustificado se paga, además, una indemnización
  -- igual al monto de las prestaciones.
  indemnizacion        numeric(20,2) not null default 0,

  otras_asignaciones   numeric(20,2) not null default 0,
  otras_deducciones    numeric(20,2) not null default 0,

  total                numeric(20,2) not null default 0,
  total_usd            numeric(20,2) generated always as (round(total * tasa / tasa_usd, 2)) stored,

  observacion   text,
  estado        text not null default 'CALCULADA'
                check (estado in ('CALCULADA', 'PAGADA', 'ANULADA')),

  cuenta_id     bigint references public.cuentas_tesoreria(id),
  movimiento_id bigint references public.tesoreria_movimientos(id),
  referencia    text,
  pagada_en     timestamptz,
  pagada_por    uuid references auth.users(id),

  motivo_anulacion text,
  anulada_por   uuid references auth.users(id),
  anulada_en    timestamptz,

  calculada_por uuid references auth.users(id),
  calculada_en  timestamptz not null default now(),

  constraint liquidaciones_egreso_posterior check (fecha_egreso >= fecha_ingreso)
);

create unique index if not exists liquidacion_una_por_empleado
  on public.prestaciones_liquidaciones (empleado_id)
  where estado <> 'ANULADA';

-- ---------------------------------------------------------------------------
-- El salario integral de un trabajador en una fecha
--
-- Prefiere lo que se pagó de verdad —el último recibo— sobre lo que dice la
-- ficha. La ficha tiene el sueldo básico; el recibo tiene el sueldo más las
-- horas extras, los feriados y los recargos que sí se pagaron, que es sobre lo
-- que la ley manda calcular.
-- ---------------------------------------------------------------------------
create or replace function private.salario_para_prestaciones(
  p_empleado bigint,
  p_hasta    date,
  p_desde    date default null,
  out normal_diario   numeric,
  out integral_diario numeric,
  out estimado        boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_emp   record;
  v_dias_bv   numeric;
  v_dias_util numeric;
  v_base      numeric;
begin
  select r.salario_normal_diario, r.salario_integral_diario
    into normal_diario, integral_diario
  from public.nomina_recibos r
  join public.nomina_periodos p on p.id = r.periodo_id
  where r.empleado_id = p_empleado
    and p.estado <> 'ANULADA'
    and p.hasta <= p_hasta
    and (p_desde is null or p.hasta >= p_desde)
  order by p.hasta desc, r.id desc
  limit 1;

  if normal_diario is not null and normal_diario > 0 then
    estimado := false;
    return;
  end if;

  -- Sin recibos: se calcula desde la ficha y se marca como estimación.
  estimado := true;

  select * into v_emp from public.empleados where id = p_empleado;

  if v_emp.id is null then
    raise exception 'No existe el trabajador %.', p_empleado using errcode = 'P0002';
  end if;

  v_base := case v_emp.base_estipulacion
              when 'MENSUAL' then v_emp.salario_base / private.parametro('dias_mes_nomina', p_hasta)
              when 'DIARIO'  then v_emp.salario_base
              when 'HORA'    then v_emp.salario_base * private.parametro('jornada_diurna_horas', p_hasta)
            end;

  v_dias_bv   := private.dias_bono_vacacional(p_empleado, p_hasta);
  v_dias_util := coalesce(v_emp.dias_utilidades,
                          private.parametro('utilidades_dias_minimo', p_hasta));

  normal_diario   := v_base;
  integral_diario := v_base
    + (v_base * v_dias_bv)   / private.parametro('dias_base_alicuotas', p_hasta)
    + (v_base * v_dias_util) / private.parametro('dias_base_alicuotas', p_hasta);
end;
$$;

-- ---------------------------------------------------------------------------
-- La cuenta de cada quien
-- ---------------------------------------------------------------------------
create or replace view public.v_prestaciones
with (security_invoker = on) as
select
  e.id as empleado_id,
  e.ficha,
  e.cedula,
  e.nombres,
  e.apellidos,
  e.apellidos || ', ' || e.nombres as nombre,
  e.cargo,
  e.departamento,
  e.fecha_ingreso,
  e.fecha_egreso,
  e.activo,
  e.moneda_salario as moneda,

  c.fecha_corte,
  coalesce(c.garantia, 0)        as corte_garantia,
  coalesce(c.dias_acumulados, 0) as corte_dias,
  coalesce(c.intereses, 0)       as corte_intereses,
  coalesce(c.anticipos, 0)       as corte_anticipos,

  coalesce(d.monto, 0)  as depositado,
  coalesce(d.dias, 0)   as dias_depositados,
  coalesce(d.trimestres, 0) as trimestres,
  d.ultimo_trimestre,

  coalesce(i.monto, 0)  as intereses_abonados,
  coalesce(a.monto, 0)  as anticipos,

  coalesce(c.garantia, 0) + coalesce(d.monto, 0)          as garantia,
  coalesce(c.intereses, 0) + coalesce(i.monto, 0)         as intereses,
  coalesce(c.dias_acumulados, 0) + coalesce(d.dias, 0)    as dias_acumulados,

  -- Lo que se le debe hoy: la garantía más los intereses, menos lo adelantado.
  coalesce(c.garantia, 0) + coalesce(d.monto, 0)
    + coalesce(c.intereses, 0) + coalesce(i.monto, 0)
    - coalesce(c.anticipos, 0) - coalesce(a.monto, 0)     as saldo,

  -- Hasta el 75% se puede adelantar (LOTTT 144).
  greatest(
    round((coalesce(c.garantia, 0) + coalesce(d.monto, 0)
         + coalesce(c.intereses, 0) + coalesce(i.monto, 0)) * 0.75, 2)
    - coalesce(c.anticipos, 0) - coalesce(a.monto, 0), 0)  as disponible_anticipo,

  (select count(*) from public.prestaciones_liquidaciones l
    where l.empleado_id = e.id and l.estado <> 'ANULADA') > 0 as liquidado
from public.empleados e
left join public.prestaciones_corte c on c.empleado_id = e.id
left join lateral (
  select sum(monto) as monto, sum(dias + dias_adicionales) as dias,
         count(*) as trimestres,
         max(anio * 10 + trimestre) as ultimo_trimestre
  from public.prestaciones_depositos
  where empleado_id = e.id and estado = 'CALCULADO'
) d on true
left join lateral (
  select sum(monto) as monto from public.prestaciones_intereses where empleado_id = e.id
) i on true
left join lateral (
  select sum(monto) as monto from public.prestaciones_anticipos
  where empleado_id = e.id and estado = 'REGISTRADO'
) a on true;

grant select on public.v_prestaciones to authenticated;

create or replace view public.v_prestaciones_depositos
with (security_invoker = on) as
select d.*, e.ficha, e.apellidos || ', ' || e.nombres as nombre
from public.prestaciones_depositos d
join public.empleados e on e.id = d.empleado_id;

grant select on public.v_prestaciones_depositos to authenticated;

create or replace view public.v_prestaciones_anticipos
with (security_invoker = on) as
select a.*, e.ficha, e.apellidos || ', ' || e.nombres as nombre, c.nombre as cuenta
from public.prestaciones_anticipos a
join public.empleados e on e.id = a.empleado_id
left join public.cuentas_tesoreria c on c.id = a.cuenta_id;

grant select on public.v_prestaciones_anticipos to authenticated;

create or replace view public.v_liquidaciones
with (security_invoker = on) as
select l.*, e.ficha, e.cedula, e.apellidos || ', ' || e.nombres as nombre, e.cargo,
       c.nombre as cuenta
from public.prestaciones_liquidaciones l
join public.empleados e on e.id = l.empleado_id
left join public.cuentas_tesoreria c on c.id = l.cuenta_id;

grant select on public.v_liquidaciones to authenticated;

-- ---------------------------------------------------------------------------
-- Escribir: el corte
-- ---------------------------------------------------------------------------
create or replace function public.guardar_corte_prestaciones(
  p_empleado_id bigint,
  p_fecha_corte date,
  p_garantia    numeric default 0,
  p_dias        numeric default 0,
  p_intereses   numeric default 0,
  p_anticipos   numeric default 0,
  p_moneda      char(3) default 'VES',
  p_nota        text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_emp record;
begin
  -- El corte es el punto de partida de todo lo que venga después. Cambiarlo
  -- cambia lo que se le debe a alguien: no es una operación del día.
  perform private.exigir_permiso('NOMINA', 'TOTAL');

  select * into v_emp from public.empleados where id = p_empleado_id;

  if v_emp.id is null then
    raise exception 'No existe el trabajador %.', p_empleado_id using errcode = 'P0002';
  end if;

  if p_fecha_corte > current_date then
    raise exception 'El corte no puede ser de una fecha futura.' using errcode = '22023';
  end if;

  if p_fecha_corte < v_emp.fecha_ingreso then
    raise exception 'El corte (%) es anterior al ingreso de % (%).',
      to_char(p_fecha_corte, 'DD/MM/YYYY'), v_emp.nombres,
      to_char(v_emp.fecha_ingreso, 'DD/MM/YYYY') using errcode = '22023';
  end if;

  if coalesce(p_anticipos, 0) > coalesce(p_garantia, 0) + coalesce(p_intereses, 0) then
    raise exception 'Los anticipos (%) no pueden superar lo acumulado (%).',
      p_anticipos, coalesce(p_garantia, 0) + coalesce(p_intereses, 0) using errcode = '22023';
  end if;

  if exists (select 1 from public.prestaciones_depositos
              where empleado_id = p_empleado_id and estado = 'CALCULADO'
                and make_date(anio, trimestre * 3 - 2, 1) <= p_fecha_corte) then
    raise exception 'Ya hay trimestres calculados antes de esa fecha de corte. Anúlalos primero: si no, ese tiempo quedaría contado dos veces.'
      using errcode = '55000';
  end if;

  insert into public.prestaciones_corte
    (empleado_id, fecha_corte, moneda, garantia, dias_acumulados, intereses, anticipos,
     nota, cargado_por)
  values
    (p_empleado_id, p_fecha_corte, coalesce(p_moneda, 'VES'), coalesce(p_garantia, 0),
     coalesce(p_dias, 0), coalesce(p_intereses, 0), coalesce(p_anticipos, 0),
     nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()))
  on conflict (empleado_id) do update
    set fecha_corte = excluded.fecha_corte,
        moneda = excluded.moneda,
        garantia = excluded.garantia,
        dias_acumulados = excluded.dias_acumulados,
        intereses = excluded.intereses,
        anticipos = excluded.anticipos,
        nota = excluded.nota,
        cargado_por = excluded.cargado_por,
        cargado_en = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Escribir: el trimestre
-- ---------------------------------------------------------------------------
create or replace function public.calcular_trimestre_prestaciones(
  p_anio      integer,
  p_trimestre integer
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_desde   date;
  v_hasta   date;
  v_emp     record;
  v_sal     record;
  v_tasas   record;
  v_dias    numeric;
  v_adic    numeric;
  v_anios   integer;
  v_cuantos integer := 0;
begin
  perform private.exigir_permiso('NOMINA', 'ESCRITURA');

  if p_trimestre not between 1 and 4 then
    raise exception 'El trimestre va del 1 al 4 (recibido: %).', p_trimestre using errcode = '22023';
  end if;

  v_desde := make_date(p_anio, p_trimestre * 3 - 2, 1);
  v_hasta := (v_desde + interval '3 months' - interval '1 day')::date;

  if v_hasta > current_date then
    raise exception 'El trimestre % de % todavía no ha terminado: cierra el %.',
      p_trimestre, p_anio, to_char(v_hasta, 'DD/MM/YYYY') using errcode = '22023';
  end if;

  v_dias := private.parametro('prestaciones_dias_trimestre', v_hasta);

  for v_emp in
    select e.*, c.fecha_corte
    from public.empleados e
    left join public.prestaciones_corte c on c.empleado_id = e.id
    where e.fecha_ingreso <= v_hasta
      and (e.fecha_egreso is null or e.fecha_egreso >= v_desde)
    order by e.apellidos, e.nombres
  loop
    -- La garantía se causa a partir del tercer mes de servicio (LOTTT 142.a).
    continue when v_emp.fecha_ingreso + 90 > v_hasta;

    -- Nada anterior al corte: eso ya está cargado a mano.
    continue when v_emp.fecha_corte is not null and v_hasta <= v_emp.fecha_corte;

    continue when exists (
      select 1 from public.prestaciones_depositos
       where empleado_id = v_emp.id and anio = p_anio and trimestre = p_trimestre
         and estado = 'CALCULADO');

    select * into v_sal from private.salario_para_prestaciones(v_emp.id, v_hasta, v_desde);

    -- Los dos días adicionales por año, en el trimestre del aniversario y solo
    -- a partir del segundo año, acumulativos hasta treinta (LOTTT 142.b).
    v_adic := 0;
    v_anios := extract(year from age(v_hasta, v_emp.fecha_ingreso))::integer;

    if v_anios >= 1
       and make_date(p_anio, extract(month from v_emp.fecha_ingreso)::integer,
                     least(extract(day from v_emp.fecha_ingreso)::integer, 28))
           between v_desde and v_hasta then
      v_adic := least(v_anios * 2, 30);
    end if;

    select * into v_tasas from private.tasas_del_dia(v_emp.moneda_salario, v_hasta);

    insert into public.prestaciones_depositos
      (empleado_id, anio, trimestre, fecha, dias, dias_adicionales,
       salario_normal_diario, salario_integral_diario,
       moneda, tasa, tasa_usd, monto, estimado, calculado_por)
    values
      (v_emp.id, p_anio, p_trimestre, v_hasta, v_dias, v_adic,
       round(v_sal.normal_diario, 6), round(v_sal.integral_diario, 6),
       v_emp.moneda_salario, v_tasas.tasa, v_tasas.tasa_usd,
       round((v_dias + v_adic) * v_sal.integral_diario, 2), v_sal.estimado,
       (select auth.uid()));

    v_cuantos := v_cuantos + 1;
  end loop;

  return v_cuantos;
end;
$$;

create or replace function public.anular_deposito_prestaciones(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_d record;
begin
  perform private.exigir_permiso('NOMINA', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se anula el depósito.' using errcode = '22023';
  end if;

  select * into v_d from public.prestaciones_depositos where id = p_id for update;

  if v_d.id is null then
    raise exception 'No existe el depósito %.', p_id using errcode = 'P0002';
  end if;

  if v_d.estado = 'ANULADO' then
    raise exception 'El depósito ya estaba anulado.' using errcode = '55000';
  end if;

  update public.prestaciones_depositos
     set estado = 'ANULADO',
         motivo_anulacion = trim(p_motivo),
         anulado_por = (select auth.uid()),
         anulado_en = now()
   where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Escribir: los intereses
-- ---------------------------------------------------------------------------
create or replace function public.guardar_tasa_prestaciones(
  p_anio integer, p_mes integer, p_tasa numeric, p_fuente text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.exigir_permiso('NOMINA', 'ESCRITURA');

  if p_mes not between 1 and 12 then
    raise exception 'El mes va del 1 al 12.' using errcode = '22023';
  end if;

  if coalesce(p_tasa, -1) < 0 then
    raise exception 'La tasa no puede ser negativa.' using errcode = '22023';
  end if;

  insert into public.prestaciones_tasas (anio, mes, tasa, fuente, registrada_por)
  values (p_anio, p_mes, p_tasa, nullif(trim(coalesce(p_fuente, '')), ''), (select auth.uid()))
  on conflict (anio, mes) do update
    set tasa = excluded.tasa, fuente = excluded.fuente,
        registrada_por = excluded.registrada_por, registrada_en = now();
end;
$$;

create or replace function public.calcular_intereses_prestaciones(
  p_anio integer, p_mes integer)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tasa    numeric;
  v_hasta   date;
  v_emp     record;
  v_base    numeric;
  v_monto   numeric;
  v_cuantos integer := 0;
begin
  perform private.exigir_permiso('NOMINA', 'ESCRITURA');

  select tasa into v_tasa from public.prestaciones_tasas where anio = p_anio and mes = p_mes;

  if v_tasa is null then
    raise exception 'No está cargada la tasa de intereses de %/%. Cárgala antes de calcular: con una tasa inventada, los intereses también lo serían.',
      p_mes, p_anio using errcode = 'P0002';
  end if;

  v_hasta := (make_date(p_anio, p_mes, 1) + interval '1 month' - interval '1 day')::date;

  if v_hasta > current_date then
    raise exception 'El mes %/% todavía no ha terminado.', p_mes, p_anio using errcode = '22023';
  end if;

  for v_emp in
    select p.* from public.v_prestaciones p
    where p.fecha_egreso is null or p.fecha_egreso >= make_date(p_anio, p_mes, 1)
  loop
    -- Los intereses corren sobre la garantía, no sobre los intereses ya
    -- abonados: eso sería interés sobre interés y la ley no lo manda.
    v_base := v_emp.garantia - v_emp.anticipos - v_emp.corte_anticipos;

    continue when coalesce(v_base, 0) <= 0;

    v_monto := round(v_base * v_tasa / 100 / 12, 2);

    continue when v_monto <= 0;

    insert into public.prestaciones_intereses
      (empleado_id, anio, mes, base, tasa, moneda, monto, calculado_por)
    values
      (v_emp.empleado_id, p_anio, p_mes, round(v_base, 2), v_tasa,
       v_emp.moneda, v_monto, (select auth.uid()))
    on conflict (empleado_id, anio, mes) do update
      set base = excluded.base, tasa = excluded.tasa, monto = excluded.monto,
          calculado_por = excluded.calculado_por, calculado_en = now();

    v_cuantos := v_cuantos + 1;
  end loop;

  return v_cuantos;
end;
$$;

-- ---------------------------------------------------------------------------
-- Escribir: los anticipos
-- ---------------------------------------------------------------------------
create or replace function public.registrar_anticipo_prestaciones(
  p_empleado_id bigint,
  p_monto       numeric,
  p_motivo      text,
  p_cuenta_id   bigint default null,
  p_fecha       date default null,
  p_detalle     text default null,
  p_referencia  text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p      record;
  v_emp    record;
  v_cuenta record;
  v_fecha  date := coalesce(p_fecha, current_date);
  v_tasas  record;
  v_id     bigint;
  v_mov    bigint;
begin
  -- Adelantar prestaciones es sacar dinero contra lo que se le debe a alguien.
  perform private.exigir_permiso('NOMINA', 'TOTAL');

  select * into v_emp from public.empleados where id = p_empleado_id;
  if v_emp.id is null then
    raise exception 'No existe el trabajador %.', p_empleado_id using errcode = 'P0002';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El anticipo tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'No se registra un anticipo con fecha futura.' using errcode = '22023';
  end if;

  select * into v_p from public.v_prestaciones where empleado_id = p_empleado_id;

  if p_monto > v_p.disponible_anticipo + 0.01 then
    raise exception 'A % se le pueden adelantar hasta % y se están pidiendo %. La ley permite adelantar hasta el 75%% de lo acumulado.',
      v_p.nombre, round(v_p.disponible_anticipo, 2), round(p_monto, 2) using errcode = '55000';
  end if;

  select * into v_tasas from private.tasas_del_dia(v_emp.moneda_salario, v_fecha);

  insert into public.prestaciones_anticipos
    (numero, empleado_id, fecha, motivo, detalle, cuenta_id, moneda, tasa, tasa_usd,
     monto, referencia, registrado_por)
  values
    (private.siguiente_numero('ANT'), p_empleado_id, v_fecha, p_motivo,
     nullif(trim(coalesce(p_detalle, '')), ''), p_cuenta_id, v_emp.moneda_salario,
     v_tasas.tasa, v_tasas.tasa_usd, p_monto,
     nullif(trim(coalesce(p_referencia, '')), ''), (select auth.uid()))
  returning id into v_id;

  -- El dinero sale de verdad, así que el libro de tesorería tiene que verlo.
  if p_cuenta_id is not null then
    select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta_id;

    if v_cuenta.id is null then
      raise exception 'No existe la cuenta %.', p_cuenta_id using errcode = 'P0002';
    end if;

    v_mov := private.registrar_movimiento_tesoreria(
      p_cuenta_id, 'EGRESO', -1, p_monto,
      format('ANTICIPO DE PRESTACIONES A %s %s', v_emp.nombres, v_emp.apellidos),
      v_fecha, p_referencia, v_emp.apellidos || ', ' || v_emp.nombres,
      null, null, null, p_detalle);

    update public.prestaciones_anticipos set movimiento_id = v_mov where id = v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.anular_anticipo_prestaciones(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a   record;
  v_emp record;
begin
  perform private.exigir_permiso('NOMINA', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se anula el anticipo.' using errcode = '22023';
  end if;

  select * into v_a from public.prestaciones_anticipos where id = p_id for update;

  if v_a.id is null then
    raise exception 'No existe el anticipo %.', p_id using errcode = 'P0002';
  end if;

  if v_a.estado = 'ANULADO' then
    raise exception 'El anticipo % ya estaba anulado.', v_a.numero using errcode = '55000';
  end if;

  select * into v_emp from public.empleados where id = v_a.empleado_id;

  if v_a.movimiento_id is not null then
    perform private.registrar_movimiento_tesoreria(
      v_a.cuenta_id, 'REVERSO', 1, v_a.monto,
      format('ANULACIÓN DEL ANTICIPO %s: %s', v_a.numero, trim(p_motivo)),
      current_date, v_a.referencia, v_emp.apellidos || ', ' || v_emp.nombres,
      null, null, v_a.movimiento_id, null);
  end if;

  update public.prestaciones_anticipos
     set estado = 'ANULADO',
         motivo_anulacion = trim(p_motivo),
         anulado_por = (select auth.uid()),
         anulado_en = now()
   where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Escribir: la liquidación
-- ---------------------------------------------------------------------------
create or replace function public.calcular_liquidacion(
  p_empleado_id bigint,
  p_fecha_egreso date,
  p_motivo       text,
  p_otras_asignaciones numeric default 0,
  p_otras_deducciones  numeric default 0,
  p_observacion  text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_emp    record;
  v_p      record;
  v_sal    record;
  v_tasas  record;
  v_dias_servicio integer;
  v_anios  numeric;
  v_anios_enteros integer;
  v_meses_frac numeric;
  v_retro  numeric;
  v_base   numeric;
  v_vac_dias numeric;
  v_bv_dias  numeric;
  v_util_dias numeric;
  v_vac    numeric;
  v_bv     numeric;
  v_util   numeric;
  v_indem  numeric := 0;
  v_total  numeric;
  v_id     bigint;
begin
  perform private.exigir_permiso('NOMINA', 'TOTAL');

  select * into v_emp from public.empleados where id = p_empleado_id;

  if v_emp.id is null then
    raise exception 'No existe el trabajador %.', p_empleado_id using errcode = 'P0002';
  end if;

  if p_fecha_egreso < v_emp.fecha_ingreso then
    raise exception 'La fecha de egreso es anterior a la de ingreso.' using errcode = '22023';
  end if;

  if p_fecha_egreso > current_date then
    raise exception 'No se liquida con fecha futura.' using errcode = '22023';
  end if;

  if exists (select 1 from public.prestaciones_liquidaciones
              where empleado_id = p_empleado_id and estado <> 'ANULADA') then
    raise exception 'A % ya se le calculó la liquidación. Anúlala primero si hay que rehacerla.',
      v_emp.nombres using errcode = '55000';
  end if;

  v_dias_servicio := p_fecha_egreso - v_emp.fecha_ingreso;
  v_anios := round(v_dias_servicio::numeric / 365, 4);
  v_anios_enteros := floor(v_dias_servicio::numeric / 365)::integer;

  -- Una fracción superior a seis meses cuenta como año completo (LOTTT 142.c).
  v_meses_frac := (v_dias_servicio - v_anios_enteros * 365)::numeric / 30;
  if v_meses_frac > 6 then
    v_anios_enteros := v_anios_enteros + 1;
  end if;

  select * into v_sal from private.salario_para_prestaciones(p_empleado_id, p_fecha_egreso);
  select * into v_p   from public.v_prestaciones where empleado_id = p_empleado_id;
  select * into v_tasas from private.tasas_del_dia(v_emp.moneda_salario, p_fecha_egreso);

  -- Las dos cuentas que manda comparar el 142.d.
  v_retro := round(v_anios_enteros * 30 * v_sal.integral_diario, 2);
  v_base  := greatest(round(v_p.garantia, 2), v_retro);

  -- Vacaciones y bono vacacional fraccionados por los meses completos del
  -- último año de servicio (LOTTT 196).
  v_vac_dias := round(
    (15 + least(greatest(v_anios_enteros - 1, 0), 15))
    * least(v_meses_frac, 12) / 12, 2);
  v_bv_dias := round(
    private.dias_bono_vacacional(p_empleado_id, p_fecha_egreso)
    * least(v_meses_frac, 12) / 12, 2);
  v_util_dias := round(
    coalesce(v_emp.dias_utilidades, private.parametro('utilidades_dias_minimo', p_fecha_egreso))
    * least(extract(month from p_fecha_egreso)::numeric, 12) / 12, 2);

  v_vac  := round(v_vac_dias  * v_sal.normal_diario, 2);
  v_bv   := round(v_bv_dias   * v_sal.normal_diario, 2);
  v_util := round(v_util_dias * v_sal.normal_diario, 2);

  -- LOTTT 92: el despido injustificado paga, además, otro tanto igual.
  if p_motivo = 'DESPIDO_INJUSTIFICADO' then
    v_indem := v_base;
  end if;

  v_total := round(
    v_base + round(v_p.intereses, 2) + v_vac + v_bv + v_util + v_indem
    - round(v_p.anticipos + v_p.corte_anticipos, 2)
    + coalesce(p_otras_asignaciones, 0) - coalesce(p_otras_deducciones, 0), 2);

  insert into public.prestaciones_liquidaciones
    (numero, empleado_id, fecha_ingreso, fecha_egreso, motivo,
     anios_servicio, dias_servicio, moneda, tasa, tasa_usd,
     salario_normal_diario, salario_integral_diario,
     garantia_acumulada, retroactivo_30_dias, base_prestaciones,
     intereses, anticipos,
     vacaciones_dias, vacaciones_monto, bono_vacacional_dias, bono_vacacional_monto,
     utilidades_dias, utilidades_monto, indemnizacion,
     otras_asignaciones, otras_deducciones, total, observacion, calculada_por)
  values
    (private.siguiente_numero('LIQ'), p_empleado_id, v_emp.fecha_ingreso, p_fecha_egreso,
     p_motivo, v_anios, v_dias_servicio, v_emp.moneda_salario, v_tasas.tasa, v_tasas.tasa_usd,
     round(v_sal.normal_diario, 6), round(v_sal.integral_diario, 6),
     round(v_p.garantia, 2), v_retro, v_base,
     round(v_p.intereses, 2), round(v_p.anticipos + v_p.corte_anticipos, 2),
     v_vac_dias, v_vac, v_bv_dias, v_bv, v_util_dias, v_util, v_indem,
     coalesce(p_otras_asignaciones, 0), coalesce(p_otras_deducciones, 0), v_total,
     nullif(trim(coalesce(p_observacion, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.pagar_liquidacion(
  p_id         bigint,
  p_cuenta_id  bigint,
  p_fecha      date default null,
  p_referencia text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_liq   record;
  v_emp   record;
  v_fecha date := coalesce(p_fecha, current_date);
  v_mov   bigint;
begin
  perform private.exigir_permiso('NOMINA', 'TOTAL');

  select * into v_liq from public.prestaciones_liquidaciones where id = p_id for update;

  if v_liq.id is null then
    raise exception 'No existe la liquidación %.', p_id using errcode = 'P0002';
  end if;

  if v_liq.estado <> 'CALCULADA' then
    raise exception 'La liquidación % está %.', v_liq.numero, lower(v_liq.estado)
      using errcode = '55000';
  end if;

  if v_liq.total <= 0 then
    raise exception 'La liquidación % no arroja monto a pagar.', v_liq.numero using errcode = '22023';
  end if;

  select * into v_emp from public.empleados where id = v_liq.empleado_id;

  v_mov := private.registrar_movimiento_tesoreria(
    p_cuenta_id, 'EGRESO', -1, v_liq.total,
    format('LIQUIDACIÓN %s DE %s %s', v_liq.numero, v_emp.nombres, v_emp.apellidos),
    v_fecha, p_referencia, v_emp.apellidos || ', ' || v_emp.nombres,
    null, null, null, null);

  update public.prestaciones_liquidaciones
     set estado = 'PAGADA', cuenta_id = p_cuenta_id, movimiento_id = v_mov,
         referencia = nullif(trim(coalesce(p_referencia, '')), ''),
         pagada_en = now(), pagada_por = (select auth.uid())
   where id = p_id;

  -- El egreso queda en la ficha: un trabajador liquidado que sigue apareciendo
  -- como activo vuelve a salir en la próxima nómina.
  update public.empleados
     set activo = false,
         fecha_egreso = v_liq.fecha_egreso,
         motivo_egreso = coalesce(motivo_egreso, v_liq.motivo)
   where id = v_liq.empleado_id;
end;
$$;

create or replace function public.anular_liquidacion(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_liq record;
  v_emp record;
begin
  perform private.exigir_permiso('NOMINA', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se anula la liquidación.' using errcode = '22023';
  end if;

  select * into v_liq from public.prestaciones_liquidaciones where id = p_id for update;

  if v_liq.id is null then
    raise exception 'No existe la liquidación %.', p_id using errcode = 'P0002';
  end if;

  if v_liq.estado = 'ANULADA' then
    raise exception 'La liquidación % ya estaba anulada.', v_liq.numero using errcode = '55000';
  end if;

  select * into v_emp from public.empleados where id = v_liq.empleado_id;

  if v_liq.movimiento_id is not null then
    perform private.registrar_movimiento_tesoreria(
      v_liq.cuenta_id, 'REVERSO', 1, v_liq.total,
      format('ANULACIÓN DE LA LIQUIDACIÓN %s: %s', v_liq.numero, trim(p_motivo)),
      current_date, v_liq.referencia, v_emp.apellidos || ', ' || v_emp.nombres,
      null, null, v_liq.movimiento_id, null);
  end if;

  update public.prestaciones_liquidaciones
     set estado = 'ANULADA',
         motivo_anulacion = trim(p_motivo),
         anulada_por = (select auth.uid()),
         anulada_en = now()
   where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'prestaciones_corte', 'prestaciones_depositos', 'prestaciones_tasas',
    'prestaciones_intereses', 'prestaciones_anticipos', 'prestaciones_liquidaciones'
  ] loop
    execute format('alter table public.%I enable row level security', v_tabla);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', v_tabla);
    execute format('grant select on public.%I to authenticated', v_tabla);
    execute format('drop policy if exists %I on public.%I', v_tabla || '_lectura', v_tabla);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      v_tabla || '_lectura', v_tabla);
  end loop;
end
$$;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.guardar_corte_prestaciones(bigint, date, numeric, numeric, numeric, numeric, char, text)',
    'public.calcular_trimestre_prestaciones(integer, integer)',
    'public.anular_deposito_prestaciones(bigint, text)',
    'public.guardar_tasa_prestaciones(integer, integer, numeric, text)',
    'public.calcular_intereses_prestaciones(integer, integer)',
    'public.registrar_anticipo_prestaciones(bigint, numeric, text, bigint, date, text, text)',
    'public.anular_anticipo_prestaciones(bigint, text)',
    'public.calcular_liquidacion(bigint, date, text, numeric, numeric, text)',
    'public.pagar_liquidacion(bigint, bigint, date, text)',
    'public.anular_liquidacion(bigint, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant   execute on function %s to authenticated', v_fn);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Los datos, en mayúscula y sin tildes
-- ---------------------------------------------------------------------------
do $$
declare
  v_tabla text;
  v_cols  text;
  v_col   text;
  v_mapa  text[][] := array[
    ['prestaciones_corte',        'nota'],
    ['prestaciones_depositos',    'motivo_anulacion'],
    ['prestaciones_tasas',        'fuente'],
    ['prestaciones_anticipos',    'detalle, referencia, motivo_anulacion'],
    ['prestaciones_liquidaciones','observacion, referencia, motivo_anulacion']
  ];
begin
  for i in 1 .. array_length(v_mapa, 1) loop
    v_tabla := v_mapa[i][1];
    v_cols  := (select string_agg(format('%L', trim(c)), ', ')
                  from unnest(string_to_array(v_mapa[i][2], ',')) c);

    execute format('drop trigger if exists trg_normalizar on public.%I', v_tabla);
    execute format(
      'create trigger trg_normalizar before insert or update on public.%I
         for each row execute function private.normalizar_texto(%s)',
      v_tabla, v_cols);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Auditoría y tiempo real
-- ---------------------------------------------------------------------------
do $$
declare
  v_t record;
begin
  for v_t in
    select c.relname as tabla,
           coalesce(
             (select string_agg(format('%L', a.attname), ', ' order by k.ord)
                from pg_index i
                cross join lateral unnest(i.indkey) with ordinality as k(att, ord)
                join pg_attribute a on a.attrelid = c.oid and a.attnum = k.att
               where i.indrelid = c.oid and i.indisprimary),
             '') as clave
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and c.relname like 'prestaciones_%'
  loop
    execute format('drop trigger if exists trg_auditar on public.%I', v_t.tabla);
    execute format(
      'create trigger trg_auditar after insert or update or delete on public.%I
         for each row execute function private.auditar(%s)',
      v_t.tabla, v_t.clave);
  end loop;
end
$$;

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'prestaciones_corte', 'prestaciones_depositos', 'prestaciones_tasas',
    'prestaciones_intereses', 'prestaciones_anticipos', 'prestaciones_liquidaciones'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_tabla
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_tabla);
    end if;
  end loop;
end
$$;
