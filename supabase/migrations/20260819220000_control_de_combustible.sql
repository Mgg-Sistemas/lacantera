-- ---------------------------------------------------------------------------
-- El control de combustible
--
-- LO QUE YA ESTABA, Y NO ERA POCO
--
-- Gasoil y gasolina existen en el catálogo desde el principio, en litros. Las
-- entradas ya funcionan —una compra recibida las mete—, las salidas también, y
-- Existencias ya dice cuánto hay. Pedir «registro de entradas, salidas y
-- stock» describe algo que en buena parte ya ocurría.
--
-- LO QUE NO ESTABA: A QUÉ SE LE ECHÓ
--
-- El gasoil salía del tanque como una salida de almacén con un motivo escrito
-- a mano. Con eso se puede decir cuánto se gastó en el mes, y nada más. No se
-- puede responder la pregunta por la que existe llevar control de combustible
-- en una cantera: cuánto consume cada máquina, y si una empezó a consumir de
-- más.
--
-- Por eso cada despacho apunta a una máquina y anota su horómetro. Con esas
-- dos cosas el litro por hora sale solo, y con el litro por hora se ve la
-- bomba de inyección antes de que se rompa.
--
-- EL HORÓMETRO SE PIDE PERO NO SE EXIGE
--
-- Un generador de emergencia también consume y puede no tener horómetro
-- llevado. Exigirlo obligaría a inventar un número, y un horómetro inventado
-- estropea el cálculo de todos los demás despachos de esa máquina. Sin él, el
-- despacho cuenta para el gasto y no para el consumo por hora — que es
-- exactamente lo que se sabe.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- El tanque
--
-- El tipo COMBUSTIBLE existía en el catálogo de almacenes desde la primera
-- migración y no había ninguno. Sin él, el gasoil vivía en el almacén general
-- mezclado con los tornillos.
-- ---------------------------------------------------------------------------
insert into public.almacenes (codigo, nombre, tipo, ubicacion, recibe_compras) values
  ('CMB-TAN', 'Tanque de combustible', 'COMBUSTIBLE', 'Patio', true)
on conflict (codigo) do update
  set nombre = excluded.nombre, tipo = excluded.tipo;

-- ---------------------------------------------------------------------------
-- Los despachos
-- ---------------------------------------------------------------------------
create table if not exists public.despachos_combustible (
  id          bigint generated always as identity primary key,
  numero      text unique,
  fecha       date not null default current_date,

  articulo_id bigint not null references public.articulos(id),
  almacen_id  bigint not null references public.almacenes(id),
  cantidad    numeric(20,4) not null check (cantidad > 0),

  -- A qué se le echó. Una de las dos: o es una máquina de la ficha, o se dice
  -- a mano qué era. Las dos vacías dejarían el despacho sin destino, que es
  -- justo el vacío que este módulo viene a llenar.
  maquina_id  bigint references public.maquinaria(id),
  destino     text,

  -- Lo que marcaba el reloj al echarle. Es lo que convierte litros en litros
  -- por hora.
  horometro   numeric(12,2) check (horometro is null or horometro >= 0),

  -- Quién lo recibió. En una cantera el combustible es de lo que más se
  -- pierde, y un despacho sin nombre no se le puede preguntar a nadie.
  empleado_id bigint references public.empleados(id),

  costo_usd   numeric(20,6),
  movimiento_id bigint references public.inventario_movimientos(id),
  nota        text,

  registrado_por uuid references auth.users(id),
  registrado_en  timestamptz not null default now(),

  constraint despacho_combustible_con_destino check (
    maquina_id is not null or length(btrim(coalesce(destino, ''))) >= 3
  )
);

create index if not exists despachos_combustible_maquina_idx
  on public.despachos_combustible (maquina_id, fecha desc);
create index if not exists despachos_combustible_fecha_idx
  on public.despachos_combustible (fecha desc);

comment on table public.despachos_combustible is
  'Cada vez que se le echa combustible a algo. Existe por el horómetro: sin '
  'él solo se sabe cuánto se gastó, no cuánto consume cada máquina.';

-- ---------------------------------------------------------------------------
-- Despachar
-- ---------------------------------------------------------------------------
create or replace function public.despachar_combustible(
  p_articulo_id bigint,
  p_almacen_id  bigint,
  p_cantidad    numeric,
  p_maquina_id  bigint  default null,
  p_destino     text    default null,
  p_horometro   numeric default null,
  p_empleado_id bigint  default null,
  p_fecha       date    default null,
  p_nota        text    default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $func$
declare
  v_fecha  date := coalesce(p_fecha, current_date);
  v_art    record;
  v_maq    record;
  v_hay    numeric;
  v_costo  numeric;
  v_ultimo numeric;
  v_mov    bigint;
  v_id     bigint;
  v_donde  text;
begin
  perform private.exigir_permiso('COMBUSTIBLE', 'ESCRITURA');

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad tiene que ser mayor que cero.' using errcode = '22023';
  end if;
  if v_fecha > current_date then
    raise exception 'No se despacha combustible con fecha futura.' using errcode = '22023';
  end if;

  select * into v_art from public.articulos where id = p_articulo_id;
  if v_art.id is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
  end if;
  -- Que solo salga combustible por aquí. Si no, esta pantalla sería una
  -- segunda puerta para sacar cualquier cosa del almacén sin las
  -- comprobaciones de la primera.
  if v_art.categoria <> 'COMBUSTIBLE' then
    raise exception '"%" no es combustible.', v_art.nombre using errcode = '22023';
  end if;

  if p_maquina_id is not null then
    select * into v_maq from public.maquinaria where id = p_maquina_id;
    if v_maq.id is null then
      raise exception 'No existe la máquina %.', p_maquina_id using errcode = 'P0002';
    end if;
    v_donde := v_maq.nombre;
  else
    if length(btrim(coalesce(p_destino, ''))) < 3 then
      raise exception 'Hay que decir a qué se le echó.' using errcode = '23514';
    end if;
    v_donde := btrim(p_destino);
  end if;

  v_hay := private.existencia(p_almacen_id, p_articulo_id);
  if v_hay < p_cantidad then
    raise exception 'En el tanque solo quedan % % de %.',
      v_hay, v_art.unidad, v_art.nombre using errcode = '55000';
  end if;

  -- El horómetro no puede ir para atrás. Es el mismo criterio que en las
  -- lecturas del parte: si retrocede, o se tecleó mal o se está mirando otra
  -- máquina, y en los dos casos el consumo por hora sale falso.
  if p_horometro is not null and p_maquina_id is not null then
    select max(horometro) into v_ultimo
      from public.despachos_combustible
     where maquina_id = p_maquina_id and horometro is not null;

    if v_ultimo is not null and p_horometro < v_ultimo then
      raise exception 'El horómetro de "%" marcaba % en el despacho anterior: no puede marcar % ahora.',
        v_maq.nombre, v_ultimo, p_horometro using errcode = '22023';
    end if;
  end if;

  v_costo := private.costo_promedio(p_almacen_id, p_articulo_id) * p_cantidad;

  v_mov := private.registrar_movimiento(
    'SALIDA_CONSUMO', -1, p_almacen_id, p_articulo_id, p_cantidad, v_costo,
    format('Combustible · %s', v_donde),
    null, null, null, v_fecha);

  insert into public.despachos_combustible
    (numero, fecha, articulo_id, almacen_id, cantidad, maquina_id, destino,
     horometro, empleado_id, costo_usd, movimiento_id, nota, registrado_por)
  values
    (private.siguiente_numero('CMB'), v_fecha, p_articulo_id, p_almacen_id, p_cantidad,
     p_maquina_id, nullif(btrim(coalesce(p_destino, '')), ''), p_horometro, p_empleado_id,
     v_costo, v_mov, nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  -- Quedarse sin gasoil para el frente por no haber pedido a tiempo es de las
  -- cosas que paran la cantera un día entero.
  if v_art.stock_minimo > 0 and (v_hay - p_cantidad) <= v_art.stock_minimo then
    perform private.notificar(
      'COMBUSTIBLE', 'TANQUE_BAJO',
      format('Queda poco %s', v_art.nombre),
      format('Quedan %s %s, y el mínimo son %s.',
             v_hay - p_cantidad, v_art.unidad, v_art.stock_minimo),
      '/app/combustible', array['ALMACEN','OPERACIONES','COMPRAS'], 'ATENCION');
  end if;

  return v_id;
end;
$func$;

comment on function public.despachar_combustible is
  'Le echa combustible a una máquina y lo descuenta del tanque. El horómetro '
  'es opcional: sin él el despacho cuenta para el gasto pero no para el '
  'consumo por hora.';

-- ---------------------------------------------------------------------------
-- Lo despachado, listo para leer
-- ---------------------------------------------------------------------------
create or replace view public.v_despachos_combustible
with (security_invoker = on) as
select
  d.id,
  d.numero,
  d.fecha,
  d.articulo_id,
  ar.codigo  as articulo_codigo,
  ar.nombre  as combustible,
  ar.unidad,
  d.almacen_id,
  al.nombre  as tanque,
  d.cantidad,
  d.maquina_id,
  mq.codigo  as maquina_codigo,
  coalesce(mq.nombre, d.destino) as destino,
  mq.tipo    as maquina_tipo,
  d.horometro,
  d.empleado_id,
  case when em.id is not null then em.nombres || ' ' || em.apellidos end as recibio,
  d.costo_usd,
  d.nota,
  d.registrado_en
from public.despachos_combustible d
join public.articulos ar on ar.id = d.articulo_id
join public.almacenes al on al.id = d.almacen_id
left join public.maquinaria mq on mq.id = d.maquina_id
left join public.empleados em on em.id = d.empleado_id;

comment on view public.v_despachos_combustible is
  'Cada despacho de combustible con su destino, quién lo recibió y qué costó.';

-- ---------------------------------------------------------------------------
-- El consumo de cada máquina
--
-- CÓMO SE CALCULAN LAS HORAS, Y POR QUÉ NO SE RESTAN LOS HORÓMETROS
--
-- Lo obvio sería restar el primer horómetro del último y dividir. Sale mal en
-- cuanto falta uno: si de cinco despachos tres traen horómetro y dos no, la
-- resta cuenta el combustible de los cinco contra las horas de tres.
--
-- Así que las horas salen de donde ya se llevan bien —las lecturas del parte
-- diario, que es su sitio— y el litro por hora solo aparece cuando hay las dos
-- cosas. Cuando no las hay, la columna viene vacía en vez de traer un número
-- que parece un dato.
-- ---------------------------------------------------------------------------
create or replace view public.v_consumo_combustible
with (security_invoker = on) as
with gasto as (
  select maquina_id,
         min(fecha)              as desde,
         max(fecha)              as hasta,
         sum(cantidad)           as litros,
         sum(coalesce(costo_usd, 0)) as costo_usd,
         count(*)                as veces
    from public.despachos_combustible
   where maquina_id is not null
   group by maquina_id
),
horas as (
  select h.maquina_id, sum(h.horas) as horas
    from public.horometro_lecturas h
    join gasto g on g.maquina_id = h.maquina_id
   where h.fecha between g.desde and g.hasta
   group by h.maquina_id
)
select
  m.id as maquina_id,
  m.codigo as maquina_codigo,
  m.nombre as maquina,
  m.tipo,
  m.estado,
  g.desde,
  g.hasta,
  g.veces,
  g.litros,
  g.costo_usd,
  hs.horas,
  case when coalesce(hs.horas, 0) > 0
       then round(g.litros / hs.horas, 2)
  end as litros_por_hora,
  case when coalesce(hs.horas, 0) > 0
       then round(g.costo_usd / hs.horas, 4)
  end as costo_por_hora_usd
from gasto g
join public.maquinaria m on m.id = g.maquina_id
left join horas hs on hs.maquina_id = g.maquina_id;

comment on view public.v_consumo_combustible is
  'Cuánto combustible lleva cada máquina y, cuando hay lecturas de horómetro '
  'en el mismo período, cuántos litros por hora. Sin lecturas la columna va '
  'vacía en vez de traer un número que parece un dato.';

-- ---------------------------------------------------------------------------
-- El módulo
--
-- Propio y no una pantalla de inventario, por lo mismo que Asignaciones:
-- quien está en la bomba no tiene por qué poder tocar el almacén general, y
-- quien lleva el almacén no necesariamente despacha combustible.
-- ---------------------------------------------------------------------------
insert into public.modulos (codigo, nombre, descripcion, orden) values
  ('COMBUSTIBLE', 'Combustible',
   'Entradas, salidas y consumo de gasoil y gasolina.', 28)
on conflict (codigo) do update
  set nombre = excluded.nombre,
      descripcion = excluded.descripcion,
      orden = excluded.orden;

insert into public.rol_permisos (rol, modulo, nivel)
select r.codigo, 'COMBUSTIBLE', 'NINGUNO' from public.roles r
on conflict (rol, modulo) do nothing;

update public.rol_permisos set nivel = 'TOTAL'
 where modulo = 'COMBUSTIBLE' and rol = 'ADMIN';
update public.rol_permisos set nivel = 'ESCRITURA'
 where modulo = 'COMBUSTIBLE' and rol in ('ALMACEN', 'OPERACIONES');
update public.rol_permisos set nivel = 'LECTURA'
 where modulo = 'COMBUSTIBLE' and rol in ('GERENTE_GENERAL', 'COMPRAS', 'CONSULTA');

alter table public.despachos_combustible enable row level security;

drop policy if exists despachos_combustible_lectura on public.despachos_combustible;
create policy despachos_combustible_lectura on public.despachos_combustible
  for select to authenticated
  using (private.tiene_permiso('COMBUSTIBLE', 'LECTURA'));

revoke insert, update, delete on public.despachos_combustible from anon, authenticated;

revoke execute on function public.despachar_combustible(
  bigint, bigint, numeric, bigint, text, numeric, bigint, date, text) from public, anon;
grant execute on function public.despachar_combustible(
  bigint, bigint, numeric, bigint, text, numeric, bigint, date, text) to authenticated;
