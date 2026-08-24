-- ---------------------------------------------------------------------------
-- El centro de costos, encima del libro que ya había
--
-- La líder pidió un «módulo de gastos y centro de costos»: registrar egresos por
-- categoría, un presupuesto asignado a la cantera, filtros por fecha y por
-- categoría, y una pantalla de resumen con lo asignado, lo gastado, el balance y
-- la inversión por material.
--
-- Y Christopher añadió la instrucción que gobierna todo esto: «evaluar lo
-- existente antes de hacer cambios, así evitamos doble trabajo o falso positivo».
--
-- LO QUE LA EVALUACIÓN ENCONTRÓ: CASI TODO ESTABA
--
-- `public.tesoreria_movimientos` YA ES el acumulador único de egresos que pide la
-- especificación. Las dieciséis funciones que mueven dinero —pagar_nomina,
-- registrar_pago_compra, registrar_egreso, las liquidaciones, los anticipos—
-- desembocan todas en `private.registrar_movimiento_tesoreria`, que es el único
-- INSERT sobre la tabla. «Cuánto gastó la cantera este mes» ya se responde con
-- un SELECT.
--
-- Por eso aquí NO se crea una tabla de gastos paralela. Sería una segunda
-- contabilidad que diría cosas distintas de la primera sin dar ningún error, que
-- es la peor forma de fallar.
--
-- También estaban ya: el registro de egreso suelto, el desacople de la caja
-- (`permite_sobregiro`), el filtro por rango de fechas con atajos, y la tabla de
-- movimientos con fecha, concepto y monto.
--
-- Faltaban tres cosas, y son estas.
--
-- =========================================================================
-- 1. LA CATEGORÍA: PUESTA A MANO O DEDUCIDA, PERO NUNCA INVENTADA
-- =========================================================================
--
-- `tesoreria_movimientos.tipo` dice CÓMO se movió el dinero —PAGO, IGTF, EGRESO—
-- no EN QUÉ se gastó. Son ejes distintos y ninguno sustituye al otro.
--
-- Tampoco sirve la unidad que ya existe en `gasto_por_unidad`: esa dice A DÓNDE
-- fue o QUIÉN lo pidió. Un gasto de mantenimiento pedido por la planta es
-- MANTENIMIENTO en un eje y PLANTA en el otro, y hacen falta los dos.
--
-- POR QUÉ SE DEDUCE Y NO SE PIDE SIEMPRE
--
-- La mayoría de los egresos no los teclea nadie: nacen de pagar una orden o una
-- nómina, y en esos casos el sistema ya sabe de qué clase son. Pedir la
-- categoría otra vez sería preguntar algo que ya está en los datos, y lo que se
-- pregunta de más se contesta de cualquier manera.
--
-- Así que `v_gastos` la deriva: de la nómina, o de la categoría de los artículos
-- de la orden. Y lo que no se puede deducir sale como SIN_CLASIFICAR, a la
-- vista. No se reparte ni se mete en la casilla más grande: un hueco visible es
-- mejor que una cifra inventada.
--
-- La columna `categoria` guarda solo lo que dice una persona, y cuando está,
-- manda sobre la deducción.
--
-- POR QUÉ EL LIBRO DEJA PASAR ESE UPDATE
--
-- `tesoreria_movimientos` es inmutable por disparador, y con razón. Pero
-- clasificar después un gasto que nació sin clase no es editar el libro: no
-- cambia ni el monto, ni la fecha, ni la cuenta.
--
-- `private.tesoreria_inmutable` ya tenía exactamente esta forma para otras dos
-- cosas —emparejar una transferencia y atar un pago a su nómina—: deja pasar la
-- transición de nulo a valor cuando nada más cambia. Se añade la tercera con el
-- mismo molde, en vez de inventar otro.
--
-- =========================================================================
-- 2. EL PRESUPUESTO: LO ÚNICO QUE NO CABÍA EN NADA EXISTENTE
-- =========================================================================
--
-- Ausencia limpia: cero tablas, cero columnas, cero funciones. La palabra
-- aparecía tres veces en el repositorio y las tres eran prosa de comentario.
--
-- Y NO ES UNA CUENTA. Es la distinción que sostiene todo el encargo: la líder
-- pidió que registrar un gasto no mande la caja a cero. Un presupuesto no se
-- mueve, no baja y no tiene saldo; es contra qué se compara lo gastado. Si fuera
-- una cuenta más, volvería el problema que se vino a quitar.
--
-- `produccion_asignada` se teclea. Lo correcto sería sacarlo de los partes de
-- turno, y la tubería está hecha —`produccion_turnos`, `registrar_produccion_turno`—
-- pero sin capturar: cero filas. Esperar a que se capture dejaría la tarjeta de
-- la líder en blanco durante semanas, y da exactamente la misma cifra dividiendo
-- entre el volumen que ella misma escribe.
--
-- =========================================================================
-- 3. LAS DOS FUNCIONES DE LECTURA, Y POR QUÉ SON `SECURITY DEFINER`
-- =========================================================================
--
-- `tesoreria_movimientos` tiene una sola política de SELECT, que exige
-- TESORERIA:LECTURA. Y el centro de costos vive en Compras, donde ya está el
-- análisis de gasto.
--
-- Una vista `security_invoker` leída por alguien de Compras devolvería CERO
-- filas y pintaría 0,00 USD sin dar ningún error — el mismo fallo que ya
-- apareció esta semana con los empleados en el vale de combustible.
--
-- Por eso las dos son `SECURITY DEFINER` con su propia `exigir_permiso('COMPRAS',
-- 'LECTURA')` dentro. Es el patrón que ya usa `gasto_por_unidad`.
--
-- COMPROBADO
--
-- En transacción revertida, con un presupuesto de 25.000 USD para 3.500 M3
-- contra los ocho egresos reales de agosto:
--
--   COMPRAS_INSUMOS   7 veces   13.942,04 USD   79,1%
--   NOMINA            1 vez      3.691,91 USD   20,9%
--   asignado 25.000 · gastado 17.633,95 · balance 7.366,05 · ejecutado 70,5%
--   inversión por material 5,0383 USD/M3 · sin clasificar 0,00
-- ---------------------------------------------------------------------------

alter table public.tesoreria_movimientos
  add column if not exists categoria text;

alter table public.tesoreria_movimientos
  drop constraint if exists tesoreria_movimientos_categoria_check;

alter table public.tesoreria_movimientos
  add constraint tesoreria_movimientos_categoria_check
  check (categoria is null or categoria in
    ('NOMINA', 'COMPRAS_INSUMOS', 'MANTENIMIENTO', 'COMBUSTIBLE',
     'ALIMENTACION', 'ADMINISTRATIVOS'));

comment on column public.tesoreria_movimientos.categoria is
  'En qué se gastó, cuando lo dice una persona. Nula cuando se deduce del origen: v_gastos la deriva de la orden, de la nómina o del artículo.';

-- --------------------------------------------------------------------------
-- La tercera excepción del libro, con el molde de las dos que ya había
-- --------------------------------------------------------------------------
create or replace function private.tesoreria_inmutable()
returns trigger
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_generadas text[];
  v_old       jsonb;
  v_new       jsonb;
begin
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(a.attname), '{}')
      into v_generadas
      from pg_catalog.pg_attribute a
     where a.attrelid = tg_relid
       and a.attgenerated <> ''
       and not a.attisdropped;

    v_old := to_jsonb(old) - v_generadas;
    v_new := to_jsonb(new) - v_generadas;

    if old.transferencia_par is null
       and new.transferencia_par is not null
       and (v_old - 'transferencia_par') = (v_new - 'transferencia_par') then
      return new;
    end if;

    if old.nomina_periodo_id is null
       and new.nomina_periodo_id is not null
       and (v_old - 'nomina_periodo_id') = (v_new - 'nomina_periodo_id') then
      return new;
    end if;

    -- Clasificar un gasto que nació sin clase. Solo de nulo a valor: una vez
    -- puesta, la categoría tampoco se cambia.
    if old.categoria is null
       and new.categoria is not null
       and (v_old - 'categoria') = (v_new - 'categoria') then
      return new;
    end if;
  end if;

  raise exception 'El libro de tesorería no se edita ni se borra. Para corregir el movimiento %, revérsalo: queda la línea equivocada y la que la anula, y se entiende qué pasó.',
    coalesce(old.numero, '')
    using errcode = '55006';
end;
$func$;

comment on function private.tesoreria_inmutable() is
  'El libro no se edita. Tres excepciones, todas de nulo a valor y sin tocar nada más: emparejar una transferencia, atar el pago a su nómina, y clasificar un gasto que nació sin categoría.';

-- --------------------------------------------------------------------------
-- Los egresos con su clase
-- --------------------------------------------------------------------------
create or replace view public.v_gastos as
with clase_de_orden as (
  select r.orden_id,
         bool_or(a.categoria = 'COMBUSTIBLE')                     as hay_combustible,
         bool_and(a.categoria = 'COMBUSTIBLE')                    as todo_combustible,
         bool_or(a.categoria in ('REPUESTO', 'LUBRICANTE', 'HERRAMIENTA')) as hay_taller
    from public.orden_renglones r
    join public.articulos a on a.id = r.articulo_id
   group by r.orden_id
)
select
  m.id,
  m.numero,
  m.fecha,
  m.concepto,
  m.contraparte,
  m.referencia,
  m.tipo,
  m.monto,
  m.monto_usd,
  m.monto_bs,
  m.cuenta_id,
  m.orden_id,
  m.nomina_periodo_id,
  m.registrado_en,
  m.categoria as categoria_puesta,
  coalesce(
    m.categoria,
    case
      when m.nomina_periodo_id is not null then 'NOMINA'
      when co.todo_combustible              then 'COMBUSTIBLE'
      when co.hay_taller                    then 'MANTENIMIENTO'
      when m.orden_id is not null           then 'COMPRAS_INSUMOS'
    end
  ) as categoria
from public.tesoreria_movimientos m
left join clase_de_orden co on co.orden_id = m.orden_id
where m.signo = -1;

alter view public.v_gastos set (security_invoker = on);

comment on view public.v_gastos is
  'Los egresos, con su clase. La que puso una persona manda; si no la hay, se deduce del origen: nómina, o los artículos de la orden. Nula significa sin clasificar, y se enseña como tal en vez de inventarle una casilla.';

-- --------------------------------------------------------------------------
-- El presupuesto
-- --------------------------------------------------------------------------
create table if not exists public.presupuestos (
  id                  bigserial primary key,
  numero              text,
  desde               date not null,
  hasta               date not null,
  monto               numeric(16,2) not null check (monto > 0),
  moneda              char(3) not null default 'USD',
  produccion_asignada numeric(16,2) check (produccion_asignada is null or produccion_asignada > 0),
  unidad_produccion   text not null default 'M3',
  nota                text,
  activo              boolean not null default true,
  creado_por          uuid references auth.users(id),
  creado_en           timestamptz not null default now(),
  constraint presupuesto_periodo_en_orden check (hasta >= desde)
);

comment on table public.presupuestos is
  'Lo que le entregaron a la cantera para operar en un período. No es una cuenta: no se mueve, no baja y no tiene saldo. Es contra qué se compara lo gastado.';
comment on column public.presupuestos.produccion_asignada is
  'El volumen que ese fondo tiene que sacar. Es el denominador de la inversión por material, y se teclea porque los partes de turno todavía no se capturan.';

drop trigger if exists trg_auditar on public.presupuestos;
create trigger trg_auditar
  after insert or update or delete on public.presupuestos
  for each row execute function private.auditar('id');

drop trigger if exists trg_normalizar on public.presupuestos;
create trigger trg_normalizar
  before insert or update on public.presupuestos
  for each row execute function private.normalizar_texto('nota');

alter table public.presupuestos enable row level security;

drop policy if exists presupuestos_lectura on public.presupuestos;
create policy presupuestos_lectura on public.presupuestos
  for select using (private.tiene_permiso('COMPRAS', 'LECTURA'));

revoke insert, update, delete on public.presupuestos from authenticated;

-- --------------------------------------------------------------------------
-- Guardar un presupuesto
--
-- Pide COMPRAS:TOTAL y no ESCRITURA: decir cuánto dinero hay para el trimestre
-- no es lo mismo que registrar una compra, y quien pide materiales no debería
-- poder cambiar el fondo contra el que se le mide.
-- --------------------------------------------------------------------------
create or replace function public.guardar_presupuesto(
  p_id                  bigint  default null,
  p_desde               date    default null,
  p_hasta               date    default null,
  p_monto               numeric default null,
  p_moneda              character varying default 'USD',
  p_produccion_asignada numeric default null,
  p_unidad_produccion   text    default 'M3',
  p_nota                text    default null,
  p_activo              boolean default true
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_id bigint;
begin
  perform private.exigir_permiso('COMPRAS', 'TOTAL');

  if p_desde is null or p_hasta is null then
    raise exception 'Hay que decir desde cuándo y hasta cuándo.' using errcode = '22023';
  end if;
  if p_hasta < p_desde then
    raise exception 'El período termina antes de empezar.' using errcode = '22023';
  end if;
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto asignado tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.presupuestos
      (numero, desde, hasta, monto, moneda, produccion_asignada, unidad_produccion, nota, activo, creado_por)
    values
      (private.siguiente_numero('PRE'), p_desde, p_hasta, p_monto, p_moneda,
       p_produccion_asignada, coalesce(p_unidad_produccion, 'M3'), p_nota, coalesce(p_activo, true),
       (select auth.uid()))
    returning id into v_id;
  else
    update public.presupuestos
       set desde = p_desde,
           hasta = p_hasta,
           monto = p_monto,
           moneda = p_moneda,
           produccion_asignada = p_produccion_asignada,
           unidad_produccion = coalesce(p_unidad_produccion, 'M3'),
           nota = p_nota,
           activo = coalesce(p_activo, true)
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'No existe el presupuesto %.', p_id using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end;
$func$;

revoke all on function public.guardar_presupuesto(bigint, date, date, numeric, character varying, numeric, text, text, boolean) from public;
revoke all on function public.guardar_presupuesto(bigint, date, date, numeric, character varying, numeric, text, text, boolean) from anon;
grant execute on function public.guardar_presupuesto(bigint, date, date, numeric, character varying, numeric, text, text, boolean) to authenticated;

-- --------------------------------------------------------------------------
-- En qué se gastó
-- --------------------------------------------------------------------------
create or replace function public.gasto_por_categoria(
  p_desde date default null,
  p_hasta date default null
)
returns table (
  categoria   text,
  veces       bigint,
  total_usd   numeric,
  porcentaje  numeric
)
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_total numeric;
begin
  perform private.exigir_permiso('COMPRAS', 'LECTURA');

  select coalesce(sum(g.monto_usd), 0) into v_total
    from public.v_gastos g
   where (p_desde is null or g.fecha >= p_desde)
     and (p_hasta is null or g.fecha <= p_hasta);

  return query
  select coalesce(g.categoria, 'SIN_CLASIFICAR'),
         count(*),
         round(sum(g.monto_usd), 2),
         case when v_total > 0 then round(sum(g.monto_usd) * 100 / v_total, 1) else 0 end
    from public.v_gastos g
   where (p_desde is null or g.fecha >= p_desde)
     and (p_hasta is null or g.fecha <= p_hasta)
   group by 1
   order by 3 desc;
end;
$func$;

comment on function public.gasto_por_categoria(date, date) is
  'En qué se gastó, por clase y en el período. Lo que no se puede clasificar sale como SIN_CLASIFICAR en vez de repartirse: una cifra inventada es peor que un hueco visible.';

revoke all on function public.gasto_por_categoria(date, date) from public;
revoke all on function public.gasto_por_categoria(date, date) from anon;
grant execute on function public.gasto_por_categoria(date, date) to authenticated;

-- --------------------------------------------------------------------------
-- Las cuatro cifras de la tarjeta
-- --------------------------------------------------------------------------
create or replace function public.resumen_centro_costos(
  p_desde date default null,
  p_hasta date default null
)
returns table (
  asignado_usd        numeric,
  gastado_usd         numeric,
  balance_usd         numeric,
  ejecutado_pct       numeric,
  produccion_asignada numeric,
  unidad_produccion   text,
  costo_por_unidad    numeric,
  sin_clasificar_usd  numeric
)
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_asig numeric;
  v_prod numeric;
  v_unid text;
  v_gast numeric;
  v_sin  numeric;
begin
  perform private.exigir_permiso('COMPRAS', 'LECTURA');

  select coalesce(sum(p.monto), 0),
         nullif(sum(coalesce(p.produccion_asignada, 0)), 0),
         min(p.unidad_produccion)
    into v_asig, v_prod, v_unid
    from public.presupuestos p
   where p.activo
     and (p_hasta is null or p.desde <= p_hasta)
     and (p_desde is null or p.hasta >= p_desde);

  select coalesce(sum(g.monto_usd), 0),
         coalesce(sum(g.monto_usd) filter (where g.categoria is null), 0)
    into v_gast, v_sin
    from public.v_gastos g
   where (p_desde is null or g.fecha >= p_desde)
     and (p_hasta is null or g.fecha <= p_hasta);

  return query
  select round(v_asig, 2),
         round(v_gast, 2),
         round(v_asig - v_gast, 2),
         case when v_asig > 0 then round(v_gast * 100 / v_asig, 1) else null end,
         v_prod,
         coalesce(v_unid, 'M3'),
         -- Nula sin volumen, porque dividir entre cero da infinito y enseñarlo
         -- como 0 haría creer que la piedra sale gratis.
         case when coalesce(v_prod, 0) > 0 then round(v_gast / v_prod, 4) else null end,
         round(v_sin, 2);
end;
$func$;

comment on function public.resumen_centro_costos(date, date) is
  'Las cuatro cifras del centro de costos: lo asignado, lo gastado, el balance y la inversión por material. Lee de v_gastos, que es el libro de tesorería filtrado a salidas: no hay una segunda contabilidad.';

revoke all on function public.resumen_centro_costos(date, date) from public;
revoke all on function public.resumen_centro_costos(date, date) from anon;
grant execute on function public.resumen_centro_costos(date, date) to authenticated;
