-- ============================================================================
-- Explotación
--
-- De dónde sale la piedra. Es el primer eslabón de todo lo demás: sin esto, el
-- material aparecía en el patio por una puerta provisional que no sabía decir
-- de qué frente venía ni con qué se arrancó.
--
-- Cuatro decisiones que mandan sobre el resto:
--
-- 1. EL FRENTE DICE CON QUÉ SE TRABAJA. Aquí hay frentes que se vuelan y
--    frentes que se rompen con martillo, y en alguno se hacen las dos cosas.
--    No es un dato decorativo: registrar una voladura contra un frente de
--    martillo es un error de captura, y el sistema lo rechaza en vez de
--    guardarlo y dejar que aparezca en un informe seis meses después.
--
-- 2. EL PARTE DE TURNO ES EL QUE MUEVE EL PATIO. Una trituradora no produce
--    un solo material: del mismo turno salen piedra 1, piedra 2, granzón y
--    polvillo a la vez. Por eso el parte tiene renglones, y cada renglón
--    escribe su propia entrada en el libro de inventario y se queda con el
--    número de esa entrada. Anular el parte reversa exactamente esas y no
--    otras parecidas.
--
-- 3. UN PARTE POR TURNO Y POR FRENTE. Dos partes del mismo turno en el mismo
--    frente son el mismo tonelaje contado dos veces. La base lo impide; si hay
--    que corregir, se anula el parte y se hace otro, que además deja rastro.
--
-- 4. SE CIERRA LA PUERTA PROVISIONAL. El botón de "Cargar producción" que se
--    puso en Existencias mientras este módulo no existía se retira. Dos
--    puertas al mismo patio es exactamente como se cuenta dos veces la misma
--    piedra: una por el parte de turno y otra por el botón rápido. La función
--    se queda escrita —el histórico que cargó sigue siendo válido y hay que
--    poder leerlo— pero deja de ser alcanzable desde la aplicación.
--
-- El costo sigue en cero, y sigue siendo a propósito. Lo que cuesta producir
-- una tonelada sale de la nómina, el gasoil, el explosivo y el desgaste de la
-- trituradora: es un cálculo de costos que esta empresa todavía no lleva. Cero
-- es falso pero se ve falso; un costo inventado es falso y parece cierto.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Frentes y bancos
-- ---------------------------------------------------------------------------
create table if not exists public.frentes_explotacion (
  id               bigint generated always as identity primary key,
  codigo           text not null unique,
  nombre           text not null,

  -- El banco o la cota. En una cantera se avanza por bancos, y el mismo frente
  -- en dos bancos distintos da material distinto.
  banco            text,

  metodo_arranque  text not null default 'VOLADURA'
                   check (metodo_arranque in ('VOLADURA', 'MARTILLO', 'AMBOS')),

  material         text,   -- la roca: granito, caliza, arenisca

  estado           text not null default 'ACTIVO'
                   check (estado in ('ACTIVO', 'SUSPENDIDO', 'AGOTADO')),

  -- Toneladas que se estima que quedan. Es una estimación de geología, no una
  -- cuenta: se escribe a mano y se corrige cuando se levanta el frente.
  reserva_estimada numeric(20,2) check (reserva_estimada is null or reserva_estimada >= 0),

  nota             text,
  creado_por       uuid references auth.users(id),
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);

create index if not exists frentes_activos_idx
  on public.frentes_explotacion (estado, codigo);

-- ---------------------------------------------------------------------------
-- Voladuras
--
-- Cada voladura es un evento con explosivo de por medio: lleva permiso, lleva
-- responsable y no se borra. Si estuvo mal registrada se anula con motivo, que
-- es lo que se le puede enseñar a quien venga a preguntar.
-- ---------------------------------------------------------------------------
create table if not exists public.voladuras (
  id                  bigint generated always as identity primary key,
  numero              text not null unique,
  fecha               date not null default current_date,
  hora                time,
  frente_id           bigint not null references public.frentes_explotacion(id),

  barrenos            integer check (barrenos is null or barrenos > 0),
  metros_perforados   numeric(12,2) check (metros_perforados is null or metros_perforados > 0),
  diametro_mm         numeric(8,2) check (diametro_mm is null or diametro_mm > 0),

  explosivo_tipo      text,
  explosivo_kg        numeric(12,2) check (explosivo_kg is null or explosivo_kg > 0),
  detonadores         integer check (detonadores is null or detonadores >= 0),
  cordon_metros       numeric(12,2) check (cordon_metros is null or cordon_metros >= 0),

  -- Lo que se estima que se arrancó. El tonelaje real aparece después, en los
  -- partes de turno que trabajan esa voladura, y por eso son dos números
  -- distintos que conviene poder comparar.
  toneladas_estimadas numeric(20,2) check (toneladas_estimadas is null or toneladas_estimadas > 0),

  responsable         text,   -- el experto que la dirigió
  permiso             text,   -- número de la autorización de explosivos

  observacion         text,
  estado              text not null default 'REGISTRADA'
                      check (estado in ('REGISTRADA', 'ANULADA')),
  motivo_anulacion    text,
  anulada_por         uuid references auth.users(id),
  anulada_en          timestamptz,

  registrada_por      uuid references auth.users(id),
  registrada_en       timestamptz not null default now(),

  constraint voladuras_anulada_con_motivo check (
    estado <> 'ANULADA' or motivo_anulacion is not null)
);

create index if not exists voladuras_recientes_idx on public.voladuras (fecha desc, id desc);
create index if not exists voladuras_frente_idx    on public.voladuras (frente_id, fecha desc);

-- ---------------------------------------------------------------------------
-- Producción por turno
-- ---------------------------------------------------------------------------
create table if not exists public.produccion_turnos (
  id               bigint generated always as identity primary key,
  numero           text not null unique,
  fecha            date not null default current_date,
  turno            text not null check (turno in ('I', 'II', 'III')),

  frente_id        bigint not null references public.frentes_explotacion(id),
  almacen_id       bigint not null references public.almacenes(id),
  voladura_id      bigint references public.voladuras(id),

  -- Las horas dicen si el tonelaje es bueno o malo. Sin ellas, 300 toneladas
  -- no significa nada: puede ser un turno excelente de cuatro horas o uno malo
  -- de ocho.
  horas_operativas numeric(6,2) check (horas_operativas is null or horas_operativas >= 0),
  horas_paro       numeric(6,2) not null default 0 check (horas_paro >= 0),
  motivo_paro      text,

  operador         text,   -- quién reporta el parte
  nota             text,

  estado           text not null default 'REGISTRADA'
                   check (estado in ('REGISTRADA', 'ANULADA')),
  motivo_anulacion text,
  anulada_por      uuid references auth.users(id),
  anulada_en       timestamptz,

  registrado_por   uuid references auth.users(id),
  registrado_en    timestamptz not null default now(),

  constraint produccion_paro_explicado check (horas_paro = 0 or motivo_paro is not null),
  constraint produccion_anulada_con_motivo check (
    estado <> 'ANULADA' or motivo_anulacion is not null)
);

-- Un parte por turno y por frente. El índice es parcial porque un parte
-- anulado tiene que dejar sitio al que lo corrige.
create unique index if not exists produccion_turno_unico
  on public.produccion_turnos (fecha, turno, frente_id)
  where estado <> 'ANULADA';

create index if not exists produccion_recientes_idx on public.produccion_turnos (fecha desc, id desc);

create table if not exists public.produccion_renglones (
  id            bigint generated always as identity primary key,
  produccion_id bigint not null references public.produccion_turnos(id) on delete cascade,
  linea         smallint not null,
  articulo_id   bigint not null references public.articulos(id),
  cantidad      numeric(20,4) not null check (cantidad > 0),

  -- La entrada que este renglón escribió en el libro. Se guarda para poder
  -- reversar exactamente esa: buscar "una entrada parecida" devolvería la del
  -- turno de al lado el día que dos partes coincidan en artículo y cantidad.
  movimiento_id bigint references public.inventario_movimientos(id),

  unique (produccion_id, linea)
);

create index if not exists produccion_renglones_idx on public.produccion_renglones (produccion_id);

-- ---------------------------------------------------------------------------
-- Vistas
-- ---------------------------------------------------------------------------
create or replace view public.v_frentes
with (security_invoker = on) as
select
  f.*,
  coalesce(p.toneladas, 0)  as toneladas_producidas,
  v.ultima_voladura,
  coalesce(v.voladuras, 0)  as voladuras
from public.frentes_explotacion f
left join lateral (
  select sum(r.cantidad) as toneladas
  from public.produccion_turnos t
  join public.produccion_renglones r on r.produccion_id = t.id
  where t.frente_id = f.id and t.estado = 'REGISTRADA'
) p on true
left join lateral (
  select max(fecha) as ultima_voladura, count(*) as voladuras
  from public.voladuras
  where frente_id = f.id and estado = 'REGISTRADA'
) v on true;

grant select on public.v_frentes to authenticated;

create or replace view public.v_voladuras
with (security_invoker = on) as
select
  v.*,
  f.codigo as frente_codigo,
  f.nombre as frente,
  f.banco,
  coalesce(p.toneladas, 0) as toneladas_producidas,
  -- Cuánto se apartó la realidad de la estimación. Es el número que enseña si
  -- quien calcula las voladuras está calibrado.
  case when v.toneladas_estimadas > 0
       then round((coalesce(p.toneladas, 0) - v.toneladas_estimadas) * 100 / v.toneladas_estimadas, 1)
  end as desvio_pct
from public.voladuras v
join public.frentes_explotacion f on f.id = v.frente_id
left join lateral (
  select sum(r.cantidad) as toneladas
  from public.produccion_turnos t
  join public.produccion_renglones r on r.produccion_id = t.id
  where t.voladura_id = v.id and t.estado = 'REGISTRADA'
) p on true;

grant select on public.v_voladuras to authenticated;

create or replace view public.v_produccion_turnos
with (security_invoker = on) as
select
  t.*,
  f.codigo    as frente_codigo,
  f.nombre    as frente,
  a.nombre    as almacen,
  vl.numero   as voladura,
  coalesce(r.toneladas, 0) as toneladas,
  coalesce(r.renglones, 0) as renglones,
  -- Toneladas por hora efectiva. Es la única cifra que compara dos turnos.
  case when coalesce(t.horas_operativas, 0) > 0
       then round(coalesce(r.toneladas, 0) / t.horas_operativas, 2)
  end as rendimiento
from public.produccion_turnos t
join public.frentes_explotacion f on f.id = t.frente_id
join public.almacenes a           on a.id = t.almacen_id
left join public.voladuras vl     on vl.id = t.voladura_id
left join lateral (
  select sum(cantidad) as toneladas, count(*) as renglones
  from public.produccion_renglones where produccion_id = t.id
) r on true;

grant select on public.v_produccion_turnos to authenticated;

create or replace view public.v_produccion_renglones
with (security_invoker = on) as
select
  r.*,
  a.codigo as codigo,
  a.nombre as articulo,
  a.unidad
from public.produccion_renglones r
join public.articulos a on a.id = r.articulo_id;

grant select on public.v_produccion_renglones to authenticated;

-- ---------------------------------------------------------------------------
-- Escribir
-- ---------------------------------------------------------------------------
create or replace function public.guardar_frente(
  p_id              bigint default null,
  p_codigo          text default null,
  p_nombre          text default null,
  p_banco           text default null,
  p_metodo_arranque text default 'VOLADURA',
  p_material        text default null,
  p_estado          text default 'ACTIVO',
  p_reserva         numeric default null,
  p_nota            text default null
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
  perform private.exigir_permiso('EXPLOTACION', 'ESCRITURA');

  if length(trim(coalesce(p_codigo, ''))) = 0 then
    raise exception 'El frente necesita un código con el que llamarlo.' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'El frente necesita un nombre.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.frentes_explotacion
      (codigo, nombre, banco, metodo_arranque, material, estado, reserva_estimada, nota, creado_por)
    values
      (trim(p_codigo), trim(p_nombre), nullif(trim(coalesce(p_banco, '')), ''),
       coalesce(p_metodo_arranque, 'VOLADURA'), nullif(trim(coalesce(p_material, '')), ''),
       coalesce(p_estado, 'ACTIVO'), p_reserva, nullif(trim(coalesce(p_nota, '')), ''),
       (select auth.uid()))
    returning id into v_id;
  else
    update public.frentes_explotacion
       set codigo = trim(p_codigo),
           nombre = trim(p_nombre),
           banco = nullif(trim(coalesce(p_banco, '')), ''),
           metodo_arranque = coalesce(p_metodo_arranque, 'VOLADURA'),
           material = nullif(trim(coalesce(p_material, '')), ''),
           estado = coalesce(p_estado, 'ACTIVO'),
           reserva_estimada = p_reserva,
           nota = nullif(trim(coalesce(p_nota, '')), ''),
           actualizado_en = now()
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'No existe el frente %.', p_id using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end;
$$;

create or replace function public.registrar_voladura(
  p_frente_id      bigint,
  p_fecha          date default null,
  p_hora           time default null,
  p_barrenos       integer default null,
  p_metros         numeric default null,
  p_diametro_mm    numeric default null,
  p_explosivo_tipo text default null,
  p_explosivo_kg   numeric default null,
  p_detonadores    integer default null,
  p_cordon_metros  numeric default null,
  p_toneladas      numeric default null,
  p_responsable    text default null,
  p_permiso        text default null,
  p_observacion    text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_frente record;
  v_fecha  date := coalesce(p_fecha, current_date);
  v_id     bigint;
begin
  perform private.exigir_permiso('EXPLOTACION', 'ESCRITURA');

  select * into v_frente from public.frentes_explotacion where id = p_frente_id;

  if v_frente.id is null then
    raise exception 'No existe el frente %.', p_frente_id using errcode = 'P0002';
  end if;

  -- Un frente de martillo no se vuela. Guardarlo igual dejaría un consumo de
  -- explosivo imputado a un sitio donde no se usó explosivo.
  if v_frente.metodo_arranque = 'MARTILLO' then
    raise exception 'El frente "%" se trabaja con martillo, no con voladura. Si eso cambió, corrígelo primero en la ficha del frente.',
      v_frente.nombre using errcode = '22023';
  end if;

  if v_frente.estado = 'AGOTADO' then
    raise exception 'El frente "%" está agotado.', v_frente.nombre using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'No se registra una voladura con fecha futura.' using errcode = '22023';
  end if;

  insert into public.voladuras
    (numero, fecha, hora, frente_id, barrenos, metros_perforados, diametro_mm,
     explosivo_tipo, explosivo_kg, detonadores, cordon_metros, toneladas_estimadas,
     responsable, permiso, observacion, registrada_por)
  values
    (private.siguiente_numero('VOL'), v_fecha, p_hora, p_frente_id, p_barrenos,
     p_metros, p_diametro_mm, nullif(trim(coalesce(p_explosivo_tipo, '')), ''),
     p_explosivo_kg, p_detonadores, p_cordon_metros, p_toneladas,
     nullif(trim(coalesce(p_responsable, '')), ''), nullif(trim(coalesce(p_permiso, '')), ''),
     nullif(trim(coalesce(p_observacion, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.anular_voladura(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_vol    record;
  v_partes integer;
begin
  perform private.exigir_permiso('EXPLOTACION', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se anula la voladura.' using errcode = '22023';
  end if;

  select * into v_vol from public.voladuras where id = p_id for update;

  if v_vol.id is null then
    raise exception 'No existe la voladura %.', p_id using errcode = 'P0002';
  end if;

  if v_vol.estado = 'ANULADA' then
    raise exception 'La voladura % ya estaba anulada.', v_vol.numero using errcode = '55000';
  end if;

  select count(*) into v_partes
  from public.produccion_turnos where voladura_id = p_id and estado = 'REGISTRADA';

  if v_partes > 0 then
    raise exception 'La voladura % tiene % parte(s) de turno que trabajaron ese material. Anúlalos primero.',
      v_vol.numero, v_partes using errcode = '55000';
  end if;

  update public.voladuras
     set estado = 'ANULADA',
         motivo_anulacion = trim(p_motivo),
         anulada_por = (select auth.uid()),
         anulada_en = now()
   where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- El parte de turno, que es el que mueve el patio
-- ---------------------------------------------------------------------------
create or replace function public.registrar_produccion_turno(
  p_fecha            date,
  p_turno            text,
  p_frente_id        bigint,
  p_almacen_id       bigint,
  p_renglones        jsonb,
  p_horas_operativas numeric default null,
  p_horas_paro       numeric default 0,
  p_motivo_paro      text default null,
  p_voladura_id      bigint default null,
  p_operador         text default null,
  p_nota             text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_frente  record;
  v_almacen record;
  v_fecha   date := coalesce(p_fecha, current_date);
  v_id      bigint;
  v_linea   smallint := 0;
  v_reng    jsonb;
  v_art     record;
  v_cant    numeric;
  v_mov     bigint;
begin
  perform private.exigir_permiso('EXPLOTACION', 'ESCRITURA');

  if p_renglones is null or jsonb_typeof(p_renglones) <> 'array'
     or jsonb_array_length(p_renglones) = 0 then
    raise exception 'Un parte de turno sin material producido no dice nada.' using errcode = '22023';
  end if;

  select * into v_frente from public.frentes_explotacion where id = p_frente_id;
  if v_frente.id is null then
    raise exception 'No existe el frente %.', p_frente_id using errcode = 'P0002';
  end if;
  if v_frente.estado <> 'ACTIVO' then
    raise exception 'El frente "%" está %.', v_frente.nombre, lower(v_frente.estado)
      using errcode = '22023';
  end if;

  select * into v_almacen from public.almacenes where id = p_almacen_id;
  if v_almacen.id is null then
    raise exception 'No existe el almacén %.', p_almacen_id using errcode = 'P0002';
  end if;
  if not v_almacen.activo then
    raise exception 'El patio "%" está cerrado.', v_almacen.nombre using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'No se registra producción con fecha futura.' using errcode = '22023';
  end if;

  if p_voladura_id is not null then
    if not exists (select 1 from public.voladuras
                    where id = p_voladura_id and estado = 'REGISTRADA') then
      raise exception 'La voladura indicada no existe o está anulada.' using errcode = 'P0002';
    end if;
  end if;

  insert into public.produccion_turnos
    (numero, fecha, turno, frente_id, almacen_id, voladura_id,
     horas_operativas, horas_paro, motivo_paro, operador, nota, registrado_por)
  values
    (private.siguiente_numero('PRO'), v_fecha, p_turno, p_frente_id, p_almacen_id,
     p_voladura_id, p_horas_operativas, coalesce(p_horas_paro, 0),
     nullif(trim(coalesce(p_motivo_paro, '')), ''),
     nullif(trim(coalesce(p_operador, '')), ''), nullif(trim(coalesce(p_nota, '')), ''),
     (select auth.uid()))
  returning id into v_id;

  for v_reng in select * from jsonb_array_elements(p_renglones) loop
    v_linea := v_linea + 1;
    v_cant  := (v_reng ->> 'cantidad')::numeric;

    select * into v_art from public.articulos where id = (v_reng ->> 'articulo_id')::bigint;

    if v_art.id is null then
      raise exception 'El renglón % apunta a un artículo que no existe.', v_linea
        using errcode = 'P0002';
    end if;

    if v_art.categoria <> 'PRODUCTO' then
      raise exception 'La cantera produce productos. "%" está catalogado como %.',
        v_art.nombre, v_art.categoria using errcode = '22023';
    end if;

    if coalesce(v_cant, 0) <= 0 then
      raise exception 'La cantidad de "%" tiene que ser mayor que cero.', v_art.nombre
        using errcode = '22023';
    end if;

    v_mov := private.registrar_movimiento(
      'ENTRADA_PRODUCCION', (1)::smallint, p_almacen_id, v_art.id, v_cant, 0,
      format('PRODUCCION %s TURNO %s · FRENTE %s',
             to_char(v_fecha, 'DD/MM/YYYY'), p_turno, v_frente.codigo),
      null, null, null, v_fecha);

    insert into public.produccion_renglones (produccion_id, linea, articulo_id, cantidad, movimiento_id)
    values (v_id, v_linea, v_art.id, v_cant, v_mov);
  end loop;

  return v_id;
end;
$$;

create or replace function public.anular_produccion_turno(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_parte record;
  v_reng  record;
begin
  -- Anular un parte le quita material al patio que quizá ya se despachó. Es
  -- una corrección, no una operación del día.
  perform private.exigir_permiso('EXPLOTACION', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se anula el parte.' using errcode = '22023';
  end if;

  select * into v_parte from public.produccion_turnos where id = p_id for update;

  if v_parte.id is null then
    raise exception 'No existe el parte %.', p_id using errcode = 'P0002';
  end if;

  if v_parte.estado = 'ANULADA' then
    raise exception 'El parte % ya estaba anulado.', v_parte.numero using errcode = '55000';
  end if;

  -- Se reversa exactamente lo que este parte metió, por su número de
  -- movimiento, y se comprueba antes que el material siga estando: si ya se
  -- despachó, el patio quedaría en negativo y eso no es un dato sino un error.
  for v_reng in
    select r.movimiento_id, m.almacen_id, m.articulo_id, m.cantidad, a.nombre
    from public.produccion_renglones r
    join public.inventario_movimientos m on m.id = r.movimiento_id
    join public.articulos a on a.id = m.articulo_id
    where r.produccion_id = p_id and r.movimiento_id is not null
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(format('patio:%s:%s', v_reng.almacen_id, v_reng.articulo_id), 0));

    if private.existencia(v_reng.almacen_id, v_reng.articulo_id) < v_reng.cantidad then
      raise exception 'De "%" ya no quedan las % que metió este parte: se despacharon. Corrige con un ajuste de inventario, que deja constancia de la diferencia.',
        v_reng.nombre, v_reng.cantidad using errcode = '22023';
    end if;

    perform private.registrar_movimiento(
      'REVERSO', (-1)::smallint, v_reng.almacen_id, v_reng.articulo_id,
      v_reng.cantidad, 0,
      format('ANULACIÓN DEL PARTE %s: %s', v_parte.numero, trim(p_motivo)),
      null, null, v_reng.movimiento_id, current_date);
  end loop;

  update public.produccion_turnos
     set estado = 'ANULADA',
         motivo_anulacion = trim(p_motivo),
         anulada_por = (select auth.uid()),
         anulada_en = now()
   where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Se cierra la puerta provisional
--
-- `registrar_produccion` entró al patio mientras este módulo no existía. Sigue
-- escrita porque lo que cargó es histórico válido, pero deja de ser alcanzable
-- desde la aplicación: dos puertas al mismo patio es como se cuenta dos veces
-- la misma piedra.
-- ---------------------------------------------------------------------------
revoke execute on function public.registrar_produccion(bigint, bigint, numeric, text, date)
  from authenticated;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'frentes_explotacion', 'voladuras', 'produccion_turnos', 'produccion_renglones'
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
    'public.guardar_frente(bigint, text, text, text, text, text, text, numeric, text)',
    'public.registrar_voladura(bigint, date, time, integer, numeric, numeric, text, numeric, integer, numeric, numeric, text, text, text)',
    'public.anular_voladura(bigint, text)',
    'public.registrar_produccion_turno(date, text, bigint, bigint, jsonb, numeric, numeric, text, bigint, text, text)',
    'public.anular_produccion_turno(bigint, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant   execute on function %s to authenticated', v_fn);
  end loop;
end
$$;

insert into public.rol_permisos (rol, modulo, nivel)
values ('ADMIN', 'EXPLOTACION', 'TOTAL')
on conflict (rol, modulo) do nothing;

-- Quien dirige la operación anula sus propios partes: es quien sabe si el
-- tonelaje de anoche estaba mal contado.
update public.rol_permisos set nivel = 'TOTAL'
 where rol = 'OPERACIONES' and modulo = 'EXPLOTACION' and nivel = 'ESCRITURA';

-- ---------------------------------------------------------------------------
-- Los datos, en mayúscula y sin tildes
-- ---------------------------------------------------------------------------
do $$
declare
  v_tabla text;
  v_cols  text;
  v_col   text;
  v_mapa  text[][] := array[
    ['frentes_explotacion', 'codigo, nombre, banco, material, nota'],
    ['voladuras',           'explosivo_tipo, responsable, permiso, observacion, motivo_anulacion'],
    ['produccion_turnos',   'motivo_paro, operador, nota, motivo_anulacion']
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

    foreach v_col in array string_to_array(replace(v_mapa[i][2], ' ', ''), ',') loop
      execute format(
        'update public.%I set %I = private.en_mayuscula(%I)
          where %I is not null and %I is distinct from private.en_mayuscula(%I)',
        v_tabla, v_col, v_col, v_col, v_col, v_col);
    end loop;
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
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relname in ('frentes_explotacion', 'voladuras', 'produccion_turnos', 'produccion_renglones')
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
    'frentes_explotacion', 'voladuras', 'produccion_turnos', 'produccion_renglones'
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
