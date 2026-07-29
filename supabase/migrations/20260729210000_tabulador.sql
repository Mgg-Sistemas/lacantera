-- ============================================================================
-- Tabulador de cargos
--
-- El tabulador es la tabla de sueldos por cargo: lo que gana un operador de
-- equipo pesado, lo que gana un vigilante. Hasta ahora ese número vivía en el
-- Excel y se copiaba a mano en la ficha de cada trabajador. Copiar a mano tiene
-- un final conocido: se sube el sueldo del cargo, se actualizan doce fichas y
-- se olvida la trece. Nadie lo nota hasta que esa persona cobra de menos y
-- reclama.
--
-- LO QUE SE GUARDA Y LO QUE SE CALCULA
--
-- Se guarda una sola cifra por cargo: el sueldo mensual. El quincenal, el
-- semanal y el diario salen de dividirlo, y por eso NO se guardan.
--
-- No es una preferencia de diseño, es lo que muestra el propio archivo. En él,
-- dos cargos tienen el mensual actualizado y el quincenal viejo:
--
--   SUPERV ADMINISTRATIVO Y PLANTA .. mensual 460, quincenal 205  (460/2 = 230)
--   ANALISTA ADMINISTRATIVO ......... mensual 760, quincenal 330  (760/2 = 380)
--
-- La nómina del mismo libro sí paga 230 y 380, así que el mensual es el bueno y
-- las otras columnas se quedaron atrás. Guardar cuatro cifras que tienen que
-- cuadrar entre sí es garantizar que algún día no cuadren. Aquí se guarda una y
-- las demás se calculan, de manera que no pueden desfasarse nunca.
--
-- EL MES DE 28 DÍAS
--
-- El archivo divide el mensual entre 28 para sacar el diario (310/28 = 11,07) y
-- entre 4 para el semanal. Es la convención de la casa: el mes son cuatro
-- semanas. No coincide con los 30 días que manda la ley para el cálculo de la
-- nómina, y por eso va en un parámetro aparte —`tabulador_dias_mes`— y no toca
-- `dias_mes_nomina`. Son dos números para dos cosas distintas: uno es la
-- referencia con la que se negocia un sueldo, el otro es con el que se paga.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- El divisor de referencia
-- ---------------------------------------------------------------------------
insert into public.nomina_parametros (clave, valor, unidad, vigencia_desde, descripcion, fuente)
values (
  'tabulador_dias_mes', 28, 'DIAS', '2020-01-01',
  'Días del mes con los que el tabulador saca el sueldo diario y el semanal. Cuatro semanas de siete días.',
  'Convención de la empresa — tabulador Cantera Naiguatá'
)
on conflict (clave, vigencia_desde) do nothing;

-- ---------------------------------------------------------------------------
-- El tabulador
-- ---------------------------------------------------------------------------
create table if not exists public.nomina_tabulador (
  id             bigint generated always as identity primary key,

  -- El cargo es la llave. Se escribe una vez y de ahí lo toman las fichas: por
  -- eso es único y por eso el disparador de mayúsculas lo normaliza, para que
  -- "Vigilante" y "VIGILANTE" no acaben siendo dos niveles del tabulador.
  cargo          text not null unique,

  sueldo_mensual numeric(20,6) not null check (sueldo_mensual >= 0),

  -- El beneficio de alimentación va por cargo aunque hoy sea 40 para todos:
  -- el archivo lo lleva en su propia columna y nada impide que mañana un nivel
  -- lo tenga distinto.
  bono_mensual   numeric(20,6) not null default 0 check (bono_mensual >= 0),

  moneda         char(3) not null default 'USD' references public.monedas(codigo),

  -- Orden de lectura. El tabulador se lee de arriba abajo como una escala y el
  -- orden alfabético no dice nada sobre quién gana más.
  orden          integer not null default 100,

  activo         boolean not null default true,
  nota           text,

  actualizado_por uuid references auth.users(id),
  actualizado_en  timestamptz not null default now()
);

create index if not exists tabulador_orden_idx on public.nomina_tabulador (orden, cargo);

comment on table public.nomina_tabulador is
  'Sueldo por cargo. Una sola cifra guardada —el mensual—; el resto se calcula.';

-- ---------------------------------------------------------------------------
-- El enganche con la ficha del trabajador
--
-- Es nulable a propósito. Puede haber alguien fuera del tabulador: un contrato
-- especial, alguien que entró con un acuerdo distinto. Ese caso existe y el
-- sistema tiene que poder representarlo sin mentir; lo que no puede es
-- confundirlo con alguien que sí está en la escala y cobra otra cosa.
-- ---------------------------------------------------------------------------
alter table public.empleados
  add column if not exists tabulador_id bigint references public.nomina_tabulador(id) on delete set null;

create index if not exists empleados_tabulador_idx on public.empleados (tabulador_id);

-- ---------------------------------------------------------------------------
-- La fecha de ingreso, cuando no se sabe
--
-- De la fecha de ingreso salen la antigüedad, el bono vacacional y lo que se le
-- debe a alguien si se va. Es la columna que más cuesta descubrir mal.
--
-- El archivo de nómina no la trae. Al cargar el personal desde él hubo que
-- poner una fecha —la columna no admite vacío— y una fecha inventada que no se
-- distingue de una verdadera es peor que no tener ninguna: se convierte en
-- dinero sin que nadie la haya mirado. Esta bandera es lo que las distingue.
-- ---------------------------------------------------------------------------
alter table public.empleados
  add column if not exists fecha_ingreso_confirmada boolean not null default true;

comment on column public.empleados.fecha_ingreso_confirmada is
  'false = la fecha vino de una carga y nadie la ha revisado. Se pone en true al guardar la ficha desde la pantalla.';

-- ---------------------------------------------------------------------------
-- Mayúsculas sin tildes, igual que el resto
-- ---------------------------------------------------------------------------
drop trigger if exists trg_normalizar on public.nomina_tabulador;
create trigger trg_normalizar before insert or update on public.nomina_tabulador
  for each row execute function private.normalizar_texto('cargo', 'nota');

-- ---------------------------------------------------------------------------
-- Permisos
--
-- Un sueldo por cargo dice cuánto gana cada persona de la cantera: quien lo ve
-- es quien ya puede ver la ficha del personal.
-- ---------------------------------------------------------------------------
alter table public.nomina_tabulador enable row level security;
revoke insert, update, delete on public.nomina_tabulador from anon, authenticated;
grant select on public.nomina_tabulador to authenticated;

drop policy if exists tabulador_lectura on public.nomina_tabulador;
create policy tabulador_lectura on public.nomina_tabulador
  for select to authenticated
  using ((select public.mis_roles()) && array['ADMIN', 'RRHH', 'GERENTE_GENERAL', 'TESORERIA']::text[]);

-- ---------------------------------------------------------------------------
-- El tabulador como se lee
--
-- Las cifras derivadas se calculan aquí para que la pantalla, un informe y
-- cualquier consulta futura saquen exactamente el mismo número. Si se
-- calcularan en la pantalla, el día que haga falta el mismo dato en otro sitio
-- habría dos divisiones escritas en dos lenguajes distintos.
--
-- El divisor se busca en los parámetros y no se le pone un valor de reserva: si
-- alguien caduca `tabulador_dias_mes` sin poner el siguiente, el diario sale
-- vacío y se ve. Un 28 escondido en el código taparía justo eso.
-- ---------------------------------------------------------------------------
create or replace view public.v_tabulador
with (security_invoker = on) as
select
  t.id,
  t.cargo,
  t.sueldo_mensual,
  t.bono_mensual,
  t.moneda,
  t.orden,
  t.activo,
  t.nota,
  t.actualizado_en,
  t.sueldo_mensual + t.bono_mensual                as total_mensual,
  round(t.sueldo_mensual / 2, 2)                   as sueldo_quincenal,
  round(t.sueldo_mensual * 7 / nullif(d.dias, 0), 2) as sueldo_semanal,
  round(t.sueldo_mensual / nullif(d.dias, 0), 2)   as sueldo_diario,
  d.dias                                           as dias_mes,
  (select count(*)
     from public.empleados e
    where e.tabulador_id = t.id and e.activo)::int as personas
from public.nomina_tabulador t
-- LEFT y no CROSS: si el parámetro faltara, un CROSS JOIN dejaría la vista sin
-- una sola fila y el tabulador se vería vacío, como si nadie lo hubiera
-- cargado. Así se ve entero y lo único que falta son las cifras derivadas.
left join lateral (
  select valor as dias
    from public.nomina_parametros
   where clave = 'tabulador_dias_mes'
     and vigencia_desde <= current_date
     and (vigencia_hasta is null or vigencia_hasta >= current_date)
   order by vigencia_desde desc
   limit 1
) d on true;

grant select on public.v_tabulador to authenticated;

-- ---------------------------------------------------------------------------
-- Quién está fuera del tabulador
--
-- Esta vista es lo que hace que "Sincronizar" no sea un botón a ciegas. Antes
-- de tocar nada, la pantalla enseña a quién le va a cambiar el sueldo, de
-- cuánto a cuánto. Un botón que reescribe sueldos sin decir cuáles es un botón
-- que nadie se atreve a pulsar, y con razón.
--
-- Se compara también el nombre del cargo. El tabulador es el dueño de cómo se
-- llama un puesto; si se rebautiza un nivel y las fichas se quedan con el
-- nombre viejo, dentro de un año el listado de personal y el tabulador hablan
-- de puestos que parecen distintos y son el mismo.
-- ---------------------------------------------------------------------------
create or replace view public.v_tabulador_desfase
with (security_invoker = on) as
select
  e.id            as empleado_id,
  e.ficha,
  e.nombres,
  e.apellidos,
  e.cargo,
  t.id            as tabulador_id,
  t.cargo         as cargo_tabulador,
  e.salario_base  as salario_actual,
  e.moneda_salario as moneda_actual,
  e.base_estipulacion as base_actual,
  t.sueldo_mensual as salario_tabulador,
  t.moneda         as moneda_tabulador,
  t.sueldo_mensual - e.salario_base as diferencia
from public.empleados e
join public.nomina_tabulador t on t.id = e.tabulador_id
where e.activo
  and t.activo
  and (
    e.salario_base    is distinct from t.sueldo_mensual
    or e.moneda_salario is distinct from t.moneda
    or e.base_estipulacion is distinct from 'MENSUAL'
    or e.cargo is distinct from t.cargo
  );

grant select on public.v_tabulador_desfase to authenticated;

-- ---------------------------------------------------------------------------
-- Guardar un nivel del tabulador
-- ---------------------------------------------------------------------------
create or replace function public.guardar_cargo_tabulador(
  p_id       bigint  default null,
  p_cargo    text    default null,
  p_sueldo   numeric default null,
  p_bono     numeric default 0,
  p_moneda   char(3) default 'USD',
  p_orden    integer default 100,
  p_activo   boolean default true,
  p_nota     text    default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform private.exigir_rol('RRHH');

  if length(trim(coalesce(p_cargo, ''))) < 3 then
    raise exception 'El cargo no puede quedar vacío: es el nombre con el que las fichas se enganchan al tabulador.'
      using errcode = '22023';
  end if;

  if p_sueldo is null or p_sueldo < 0 then
    raise exception 'El sueldo mensual tiene que ser un número de cero para arriba.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.nomina_tabulador
      (cargo, sueldo_mensual, bono_mensual, moneda, orden, activo, nota, actualizado_por)
    values
      (trim(p_cargo), p_sueldo, coalesce(p_bono, 0), p_moneda, coalesce(p_orden, 100),
       coalesce(p_activo, true), nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()))
    returning id into v_id;

    return v_id;
  end if;

  update public.nomina_tabulador set
    cargo          = trim(p_cargo),
    sueldo_mensual = p_sueldo,
    bono_mensual   = coalesce(p_bono, 0),
    moneda         = p_moneda,
    orden          = coalesce(p_orden, 100),
    activo         = coalesce(p_activo, true),
    nota           = nullif(trim(coalesce(p_nota, '')), ''),
    actualizado_por = (select auth.uid()),
    actualizado_en  = now()
  where id = p_id;

  if not found then
    raise exception 'No existe ese cargo en el tabulador.' using errcode = 'P0002';
  end if;

  return p_id;
exception
  when unique_violation then
    raise exception 'Ya hay un cargo con ese nombre en el tabulador.' using errcode = '23505';
end;
$$;

revoke execute on function public.guardar_cargo_tabulador(bigint, text, numeric, numeric, char, integer, boolean, text) from public, anon;
grant   execute on function public.guardar_cargo_tabulador(bigint, text, numeric, numeric, char, integer, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Quitar un nivel
--
-- Se niega mientras haya gente colgando de él. La alternativa —soltar las
-- fichas y borrar— dejaría a esas personas sin escala y sin aviso: seguirían
-- cobrando lo mismo, pero el día que se suba el tabulador no subirían con él y
-- nadie sabría por qué.
-- ---------------------------------------------------------------------------
create or replace function public.eliminar_cargo_tabulador(p_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_gente integer;
  v_cargo text;
begin
  perform private.exigir_rol('RRHH');

  select cargo into v_cargo from public.nomina_tabulador where id = p_id;
  if v_cargo is null then
    raise exception 'No existe ese cargo en el tabulador.' using errcode = 'P0002';
  end if;

  select count(*) into v_gente from public.empleados where tabulador_id = p_id;

  if v_gente > 0 then
    raise exception 'Hay % ficha(s) enganchadas a "%". Muévelas a otro cargo antes de quitarlo, o desactívalo en vez de borrarlo.',
      v_gente, v_cargo
      using errcode = '23503';
  end if;

  delete from public.nomina_tabulador where id = p_id;
end;
$$;

revoke execute on function public.eliminar_cargo_tabulador(bigint) from public, anon;
grant   execute on function public.eliminar_cargo_tabulador(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Enganchar una ficha a un nivel
--
-- `p_igualar` decide si además se le pone el sueldo del nivel ahí mismo. Va
-- separado porque enganchar y pagar son dos decisiones: se puede querer que
-- alguien pertenezca a un nivel y conserve un sueldo pactado por encima.
-- ---------------------------------------------------------------------------
create or replace function public.asignar_tabulador(
  p_empleado_id bigint,
  p_tabulador_id bigint default null,
  p_igualar boolean default true
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_t record;
begin
  perform private.exigir_rol('RRHH');

  if not exists (select 1 from public.empleados where id = p_empleado_id) then
    raise exception 'No existe ese trabajador.' using errcode = 'P0002';
  end if;

  if p_tabulador_id is null then
    update public.empleados set tabulador_id = null where id = p_empleado_id;
    return;
  end if;

  select * into v_t from public.nomina_tabulador where id = p_tabulador_id;
  if v_t.id is null then
    raise exception 'No existe ese cargo en el tabulador.' using errcode = 'P0002';
  end if;

  update public.empleados set
    tabulador_id = p_tabulador_id,
    cargo = case when coalesce(p_igualar, true) then v_t.cargo else cargo end,
    salario_base = case when coalesce(p_igualar, true) then v_t.sueldo_mensual else salario_base end,
    moneda_salario = case when coalesce(p_igualar, true) then v_t.moneda else moneda_salario end,
    base_estipulacion = case when coalesce(p_igualar, true) then 'MENSUAL' else base_estipulacion end
  where id = p_empleado_id;
end;
$$;

revoke execute on function public.asignar_tabulador(bigint, bigint, boolean) from public, anon;
grant   execute on function public.asignar_tabulador(bigint, bigint, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Sincronizar
--
-- Es el botón. Baja el sueldo del tabulador a la ficha de todo el que esté
-- enganchado a un nivel y no coincida.
--
-- Qué NO toca, y es lo importante:
--
--   - A quien no tiene nivel asignado. Está fuera de la escala a propósito.
--   - A quien ya egresó. Su ficha es historia; reescribirle el sueldo cambiaría
--     la base de una liquidación que quizá ya se pagó.
--   - Los recibos ya emitidos. Guardan sus propias cifras y no se recalculan
--     desde aquí; un recibo firmado no cambia porque suba el tabulador.
--
-- Sí afecta a los períodos abiertos: el que esté en borrador o calculado tomará
-- el sueldo nuevo la próxima vez que se calcule. Eso es lo que se espera, pero
-- hay que decirlo en la pantalla y no descubrirlo al ver el total.
--
-- Devuelve la lista de lo que cambió, no un número. "Se actualizaron 3" obliga
-- a ir a buscar cuáles; esto ya trae los nombres y el antes y el después.
-- ---------------------------------------------------------------------------
create or replace function public.sincronizar_tabulador()
returns table (
  empleado_id   bigint,
  ficha         text,
  nombre        text,
  cargo_antes   text,
  cargo_ahora   text,
  salario_antes numeric,
  moneda_antes  char(3),
  salario_ahora numeric,
  moneda_ahora  char(3)
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
-- Los nombres de la tabla de salida son también variables de plpgsql, y varios
-- coinciden con columnas de la consulta. Esta línea dice que ante la duda gana
-- la columna, que es lo que se quiere: sin ella, el día que alguien escriba una
-- referencia sin calificar el error sale en tiempo de ejecución.
#variable_conflict use_column
begin
  perform private.exigir_rol('RRHH');

  return query
  with desfasados as (
    select e.id, e.ficha, e.nombres, e.apellidos,
           e.cargo          as cargo_antes,
           e.salario_base   as salario_antes,
           e.moneda_salario as moneda_antes,
           t.cargo          as cargo_ahora,
           t.sueldo_mensual as salario_ahora,
           t.moneda         as moneda_ahora
      from public.empleados e
      join public.nomina_tabulador t on t.id = e.tabulador_id
     where e.activo
       and t.activo
       and (
         e.salario_base       is distinct from t.sueldo_mensual
         or e.moneda_salario  is distinct from t.moneda
         or e.base_estipulacion is distinct from 'MENSUAL'
         or e.cargo           is distinct from t.cargo
       )
  ),
  aplicado as (
    update public.empleados e set
      salario_base      = d.salario_ahora,
      moneda_salario    = d.moneda_ahora,
      base_estipulacion = 'MENSUAL',
      cargo             = d.cargo_ahora
    from desfasados d
    where e.id = d.id
    returning e.id
  )
  select d.id, d.ficha,
         d.nombres || ' ' || d.apellidos,
         d.cargo_antes, d.cargo_ahora,
         d.salario_antes, d.moneda_antes,
         d.salario_ahora, d.moneda_ahora
    from desfasados d
   where d.id in (select id from aplicado)
   order by d.apellidos, d.nombres;
end;
$$;

revoke execute on function public.sincronizar_tabulador() from public, anon;
grant   execute on function public.sincronizar_tabulador() to authenticated;

-- ---------------------------------------------------------------------------
-- La ficha del trabajador aprende el tabulador
--
-- Se rehace entera porque cambia la firma. Se borran antes TODAS las versiones
-- anteriores: dejar dos con distinto número de argumentos haría que PostgREST
-- no supiera cuál llamar y la pantalla fallaría con un error que no explica
-- nada.
-- ---------------------------------------------------------------------------
do $$
declare
  v_firma text;
begin
  for v_firma in
    select oid::regprocedure::text
      from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname = 'guardar_empleado'
  loop
    execute format('drop function if exists %s', v_firma);
  end loop;
end
$$;

create or replace function public.guardar_empleado(
  p_id             bigint default null,
  p_cedula         text default null,
  p_nombres        text default null,
  p_apellidos      text default null,
  p_cargo          text default null,
  p_departamento   text default null,
  p_fecha_ingreso  date default null,
  p_fecha_nacimiento date default null,
  p_genero         text default null,
  p_nacionalidad   text default null,
  p_estado_civil   text default null,
  p_grupo_sanguineo text default null,
  p_telefono       text default null,
  p_direccion      text default null,
  p_contacto_emergencia text default null,
  p_telefono_emergencia text default null,
  p_frecuencia     text default 'QUINCENAL',
  p_base           text default 'MENSUAL',
  p_salario        numeric default 0,
  p_moneda         char(3) default 'VES',
  p_jornada        text default 'DIURNA',
  p_dias_utilidades numeric default null,
  p_forma_pago     text default 'TRANSFERENCIA',
  p_banco          text default null,
  p_numero_cuenta  text default null,
  p_telefono_pago  text default null,
  p_activo         boolean default true,
  p_nota           text default null,
  p_tabulador_id   bigint default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform private.exigir_rol('RRHH');

  if length(trim(coalesce(p_nombres, ''))) < 2 or length(trim(coalesce(p_apellidos, ''))) < 2 then
    raise exception 'Faltan el nombre y el apellido del trabajador.' using errcode = '22023';
  end if;

  if p_fecha_ingreso is null then
    raise exception 'La fecha de ingreso decide la antigüedad, el bono vacacional y las prestaciones. No puede quedar vacía.'
      using errcode = '22023';
  end if;

  if p_fecha_nacimiento is not null and p_fecha_nacimiento > current_date - interval '14 years' then
    raise exception 'La fecha de nacimiento da menos de 14 años. Es la edad mínima para trabajar (LOPNNA art. 96); revísala.'
      using errcode = '22023';
  end if;

  if p_tabulador_id is not null
     and not exists (select 1 from public.nomina_tabulador where id = p_tabulador_id) then
    raise exception 'Ese cargo del tabulador ya no existe.' using errcode = 'P0002';
  end if;

  if p_id is null then
    insert into public.empleados
      (ficha, cedula, nombres, apellidos, cargo, departamento, fecha_ingreso,
       fecha_nacimiento, genero, nacionalidad, estado_civil, grupo_sanguineo,
       telefono, direccion, contacto_emergencia, telefono_emergencia,
       frecuencia, base_estipulacion, salario_base, moneda_salario, tipo_jornada,
       dias_utilidades, forma_pago, banco, numero_cuenta, telefono_pago,
       activo, nota, tabulador_id, fecha_ingreso_confirmada, creado_por)
    values
      (private.siguiente_ficha(),
       upper(trim(p_cedula)), trim(p_nombres), trim(p_apellidos), trim(p_cargo),
       nullif(trim(coalesce(p_departamento, '')), ''), p_fecha_ingreso,
       p_fecha_nacimiento,
       nullif(trim(coalesce(p_genero, '')), ''),
       nullif(trim(coalesce(p_nacionalidad, '')), ''),
       nullif(trim(coalesce(p_estado_civil, '')), ''),
       nullif(trim(coalesce(p_grupo_sanguineo, '')), ''),
       nullif(trim(coalesce(p_telefono, '')), ''),
       nullif(trim(coalesce(p_direccion, '')), ''),
       nullif(trim(coalesce(p_contacto_emergencia, '')), ''),
       nullif(trim(coalesce(p_telefono_emergencia, '')), ''),
       p_frecuencia, p_base, p_salario, p_moneda, p_jornada, p_dias_utilidades,
       p_forma_pago,
       nullif(trim(coalesce(p_banco, '')), ''),
       nullif(trim(coalesce(p_numero_cuenta, '')), ''),
       nullif(trim(coalesce(p_telefono_pago, '')), ''),
       coalesce(p_activo, true), nullif(trim(coalesce(p_nota, '')), ''),
       p_tabulador_id, true,
       (select auth.uid()))
    returning id into v_id;

    return v_id;
  end if;

  update public.empleados set
    cedula = upper(trim(p_cedula)),
    nombres = trim(p_nombres),
    apellidos = trim(p_apellidos),
    cargo = trim(p_cargo),
    departamento = nullif(trim(coalesce(p_departamento, '')), ''),
    fecha_ingreso = p_fecha_ingreso,
    -- Alguien abrió la ficha, vio la fecha de ingreso —es obligatoria y está en
    -- el formulario— y guardó. Eso es la revisión que le faltaba.
    fecha_ingreso_confirmada = true,
    fecha_nacimiento = p_fecha_nacimiento,
    genero = nullif(trim(coalesce(p_genero, '')), ''),
    nacionalidad = nullif(trim(coalesce(p_nacionalidad, '')), ''),
    estado_civil = nullif(trim(coalesce(p_estado_civil, '')), ''),
    grupo_sanguineo = nullif(trim(coalesce(p_grupo_sanguineo, '')), ''),
    telefono = nullif(trim(coalesce(p_telefono, '')), ''),
    direccion = nullif(trim(coalesce(p_direccion, '')), ''),
    contacto_emergencia = nullif(trim(coalesce(p_contacto_emergencia, '')), ''),
    telefono_emergencia = nullif(trim(coalesce(p_telefono_emergencia, '')), ''),
    frecuencia = p_frecuencia,
    base_estipulacion = p_base,
    salario_base = p_salario,
    moneda_salario = p_moneda,
    tipo_jornada = p_jornada,
    dias_utilidades = p_dias_utilidades,
    forma_pago = p_forma_pago,
    banco = nullif(trim(coalesce(p_banco, '')), ''),
    numero_cuenta = nullif(trim(coalesce(p_numero_cuenta, '')), ''),
    telefono_pago = nullif(trim(coalesce(p_telefono_pago, '')), ''),
    activo = coalesce(p_activo, true),
    nota = nullif(trim(coalesce(p_nota, '')), ''),
    tabulador_id = p_tabulador_id
  where id = p_id;

  return p_id;
exception
  when unique_violation then
    raise exception 'Ya hay un trabajador con esa cédula.' using errcode = '23505';
  when check_violation then
    raise exception 'Hay un dato con formato inválido: la cédula se escribe V-12345678, y el grupo sanguíneo es uno de A+, A-, B+, B-, AB+, AB-, O+ u O-.'
      using errcode = '23514';
end;
$$;

do $$
declare
  v_firma text := 'public.guardar_empleado(bigint, text, text, text, text, text, date, date, text, text, text, text, text, text, text, text, text, text, numeric, char, text, numeric, text, text, text, text, boolean, text, bigint)';
begin
  execute format('revoke execute on function %s from public, anon', v_firma);
  execute format('grant execute on function %s to authenticated', v_firma);
end
$$;

-- ---------------------------------------------------------------------------
-- Tiempo real
--
-- Sin esto la pantalla del tabulador no se enteraría de que alguien acaba de
-- subir un nivel desde otro equipo, y dos personas podrían estar tocando la
-- misma escala creyendo cada una que está sola.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'nomina_tabulador'
  ) then
    alter publication supabase_realtime add table public.nomina_tabulador;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Aquí no van los sueldos
--
-- Esta migración monta la estructura y se queda ahí. Los doce niveles de la
-- cantera —cada cargo con su cifra— y las fichas del personal se cargan desde
-- `supabase/cargas/`, que no viaja al repositorio.
--
-- El motivo está en supabase/CARGAS.md: este repositorio es público y su
-- historial es permanente. Lo que se puede versionar es cómo funciona el
-- sistema; lo que gana cada persona de la cantera, no.
-- ---------------------------------------------------------------------------
