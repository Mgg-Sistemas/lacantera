-- ---------------------------------------------------------------------------
-- Al taller también se manda material, y cada taller sabe hacer lo suyo
--
-- Christopher preguntó seis cosas seguidas sobre el taller, y dos de ellas
-- destaparon un límite del modelo:
--
--   «¿Qué pasa si dispongo de una prensa y la quiero mandar a reparar?»
--   «¿Y si dispongo de varillas que se han desviado durante su traslado y
--    necesitamos enviarlas al taller para rectificarlas?»
--
-- La prensa cabía: se da de alta como máquina de tipo OTRO. Las varillas no:
-- `mantenimientos` solo aceptaba una máquina. Lo más que se podía hacer era
-- transferirlas al almacén del taller — sin orden, sin motivo, sin plazo, sin
-- costo y sin registro de que volvieron.
--
-- Y las otras cuatro preguntas eran huecos limpios: no había urgencia, no había
-- forma de decir qué sabe hacer cada taller, ni de ver su cola, ni de saber si
-- tenía sitio.
--
-- =========================================================================
-- 1. UNA ORDEN RECAE SOBRE UNA MÁQUINA O SOBRE MATERIAL
-- =========================================================================
--
-- Nunca sobre las dos ni sobre ninguna: un CHECK con `num_nonnulls` lo impone.
-- Una orden sin sujeto no se puede atender, y una con dos no se sabe qué
-- devuelve.
--
-- EL MATERIAL SE MUEVE DE VERDAD
--
-- Al abrir la orden, la cantidad se transfiere al almacén del taller. Si no, el
-- sistema diría que las varillas están en el almacén general mientras alguien
-- las endereza a doscientos metros — y ese desfase es el que hace que nadie se
-- fíe del inventario.
--
-- De qué almacén salen lo dice quien abre la orden. La primera versión lo
-- adivinaba mirando el último movimiento del artículo, y eso saca material del
-- sitio equivocado en cuanto el mismo artículo esté en dos almacenes, que es el
-- caso normal.
--
-- LO QUE NO VUELVE ES MERMA
--
-- Al cerrar se dice cuánto volvió. Lo normal es que vuelva todo; se admite que
-- vuelva menos —una varilla se parte al enderezarla— y la diferencia se registra
-- como SALIDA_MERMA en el taller. Así el inventario cuadra y la merma del taller
-- se puede mirar, en vez de desaparecer.
--
-- =========================================================================
-- 2. CADA TALLER DECLARA SUS OFICIOS
-- =========================================================================
--
-- Un taller era solo un almacén con nombre. Ahora dice qué sabe hacer, y al
-- abrir una orden se comprueba.
--
-- PERO SOLO SI LOS DECLARÓ
--
-- Un taller sin especialidades acepta cualquier trabajo. Es lo razonable en una
-- cantera con un solo taller, y evita que nadie pueda mandar nada hasta que
-- alguien se acuerde de rellenar el catálogo. La comprobación aparece cuando hay
-- algo contra lo que comprobar.
--
-- =========================================================================
-- 3. LO PREVISTO Y LO USADO
-- =========================================================================
--
-- Los repuestos se anotaban solo al CERRAR, así que no había manera de saber qué
-- iba a hacer falta. Ahora la misma tabla guarda las dos cosas.
--
-- Lo PREVISTO no descuenta nada. Descontar por una estimación deja el almacén
-- mintiendo hasta que alguien cierre la orden, y las estimaciones se equivocan
-- justo en la cantidad.
--
-- =========================================================================
-- 4. LA URGENCIA, CON EL VOCABULARIO QUE YA HABÍA
-- =========================================================================
--
-- NORMAL, ALTA, URGENTE: lo mismo que la prioridad de los pedidos. Dos escalas
-- distintas en el mismo sistema obligan a traducir mentalmente, y alguien acaba
-- llamando urgente a lo que en la otra pantalla es alta.
--
-- COMPROBADO, en transacción revertida:
--
--   mandar hidráulica a un taller que solo suelda ... bloqueado con su nombre
--   orden urgente con repuestos previstos .......... abierta, sin descontar
--   20 varillas al taller .......................... almacén 33, taller 20
--   cierre devolviendo 18 .......................... almacén 51, taller 0, 2 merma
--   la cola sale ordenada por urgencia
--   los talleres dicen qué saben hacer y cuánto tienen encima
-- ---------------------------------------------------------------------------

create table if not exists public.especialidades_taller (
  codigo text primary key,
  nombre text not null,
  orden  smallint not null default 100,
  activa boolean not null default true
);

comment on table public.especialidades_taller is
  'Qué clase de trabajo se hace en un taller. En tabla y no en un CHECK porque la empresa la ajusta: cada cantera tiene los oficios que tiene.';

insert into public.especialidades_taller (codigo, nombre, orden) values
  ('MECANICA',     'Mecánica',                    10),
  ('HIDRAULICA',   'Hidráulica',                  20),
  ('ELECTRICIDAD', 'Electricidad y electrónica',  30),
  ('SOLDADURA',    'Soldadura y estructura',      40),
  ('TORNO',        'Torno, rectificado y ajuste', 50),
  ('NEUMATICOS',   'Cauchos y neumáticos',        60),
  ('PINTURA',      'Pintura y latonería',         70)
on conflict (codigo) do nothing;

alter table public.especialidades_taller enable row level security;

drop policy if exists especialidades_taller_lectura on public.especialidades_taller;
create policy especialidades_taller_lectura on public.especialidades_taller
  for select using (auth.uid() is not null);

revoke insert, update, delete on public.especialidades_taller from authenticated;

create table if not exists public.taller_especialidades (
  taller_id    bigint not null references public.almacenes(id) on delete cascade,
  especialidad text   not null references public.especialidades_taller(codigo),
  primary key (taller_id, especialidad)
);

comment on table public.taller_especialidades is
  'Qué sabe hacer cada taller. Sin filas, un taller acepta cualquier trabajo: es lo razonable en una cantera con un solo taller, y evita que nadie pueda mandar nada hasta que alguien rellene esto.';

alter table public.taller_especialidades enable row level security;

drop policy if exists taller_especialidades_lectura on public.taller_especialidades;
create policy taller_especialidades_lectura on public.taller_especialidades
  for select using (auth.uid() is not null);

revoke insert, update, delete on public.taller_especialidades from authenticated;

alter table public.almacenes
  add column if not exists trabajos_a_la_vez smallint
  check (trabajos_a_la_vez is null or trabajos_a_la_vez > 0);

comment on column public.almacenes.trabajos_a_la_vez is
  'Cuántas órdenes puede llevar un taller al mismo tiempo. Solo tiene sentido en un almacén de tipo TALLER.';

-- ---------------------------------------------------------------------------
-- La orden, generalizada
-- ---------------------------------------------------------------------------
alter table public.mantenimientos
  add column if not exists articulo_id   bigint references public.articulos(id),
  add column if not exists cantidad      numeric(14,4) check (cantidad is null or cantidad > 0),
  add column if not exists cantidad_devuelta numeric(14,4) check (cantidad_devuelta is null or cantidad_devuelta >= 0),
  add column if not exists urgencia      text not null default 'NORMAL',
  add column if not exists especialidad  text references public.especialidades_taller(codigo);

alter table public.mantenimientos alter column maquina_id drop not null;

alter table public.mantenimientos drop constraint if exists orden_taller_urgencia;
alter table public.mantenimientos
  add constraint orden_taller_urgencia check (urgencia in ('NORMAL', 'ALTA', 'URGENTE'));

alter table public.mantenimientos drop constraint if exists orden_taller_sobre_algo;
alter table public.mantenimientos
  add constraint orden_taller_sobre_algo check (num_nonnulls(maquina_id, articulo_id) = 1);

alter table public.mantenimientos drop constraint if exists orden_taller_material_dice_cuanto;
alter table public.mantenimientos
  add constraint orden_taller_material_dice_cuanto
  check ((articulo_id is null and cantidad is null)
      or (articulo_id is not null and cantidad is not null));

alter table public.mantenimientos drop constraint if exists mantenimientos_tipo_check;
alter table public.mantenimientos
  add constraint mantenimientos_tipo_check
  check (tipo in ('MANTENIMIENTO', 'SERVICIO', 'REPARACION', 'RECTIFICACION', 'FABRICACION'));

comment on table public.mantenimientos is
  'Las órdenes de taller. Recaen sobre una máquina o sobre material —unas varillas torcidas también van al taller— y por eso la tabla ya no habla solo de mantenimiento, aunque conserve el nombre.';
comment on column public.mantenimientos.cantidad_devuelta is
  'Cuánto volvió. La diferencia con lo que entró es merma, y se registra como tal al cerrar.';
comment on column public.mantenimientos.urgencia is
  'NORMAL, ALTA o URGENTE. Mismo vocabulario que la prioridad de los pedidos, para no tener dos escalas en el mismo sistema.';

alter table public.mantenimiento_repuestos
  add column if not exists estado text not null default 'USADO';

alter table public.mantenimiento_repuestos drop constraint if exists repuesto_previsto_o_usado;
alter table public.mantenimiento_repuestos
  add constraint repuesto_previsto_o_usado check (estado in ('PREVISTO', 'USADO'));

comment on column public.mantenimiento_repuestos.estado is
  'PREVISTO es lo que se calcula que hará falta y no ha salido del almacén; USADO es lo que salió de verdad y tiene movimiento detrás.';

-- ---------------------------------------------------------------------------
-- Las dos vistas: la cola y los talleres
-- ---------------------------------------------------------------------------
create or replace view public.v_ordenes_taller as
select
  o.id, o.numero, o.estado, o.tipo, o.urgencia,
  case o.urgencia when 'URGENTE' then 1 when 'ALTA' then 2 else 3 end as peso_urgencia,
  o.especialidad,
  e.nombre as especialidad_nombre,
  o.motivo, o.detalle, o.fecha, o.fecha_salida, o.dias_estimados,
  o.taller_id, t.nombre as taller,
  o.maquina_id, m.codigo as maquina_codigo,
  o.articulo_id, a.nombre as articulo, a.unidad,
  o.cantidad, o.cantidad_devuelta,
  coalesce(m.nombre, format('%s %s de %s', o.cantidad, a.unidad, a.nombre)) as sobre,
  case when o.maquina_id is not null then 'MAQUINA' else 'MATERIAL' end as sobre_que,
  o.costo_usd, o.costo_repuestos_usd, o.registrado_en,
  case when o.estado <> 'ABIERTO' then null
       else (now() at time zone 'America/Caracas')::date - o.fecha end as dias_dentro,
  case when o.estado <> 'ABIERTO' or o.dias_estimados is null then null
       else ((now() at time zone 'America/Caracas')::date - o.fecha) > o.dias_estimados end as se_paso,
  (select coalesce(sum(r.cantidad), 0) from public.mantenimiento_repuestos r
    where r.mantenimiento_id = o.id and r.estado = 'PREVISTO') as repuestos_previstos,
  (select coalesce(sum(r.cantidad), 0) from public.mantenimiento_repuestos r
    where r.mantenimiento_id = o.id and r.estado = 'USADO') as repuestos_usados
from public.mantenimientos o
left join public.almacenes  t on t.id = o.taller_id
left join public.maquinaria m on m.id = o.maquina_id
left join public.articulos  a on a.id = o.articulo_id
left join public.especialidades_taller e on e.codigo = o.especialidad;

alter view public.v_ordenes_taller set (security_invoker = on);

comment on view public.v_ordenes_taller is
  'Las órdenes de taller, sobre máquina o sobre material, con su urgencia y cuánto llevan dentro. Es la cola de trabajo y el historial: los abiertos y los cerrados salen de la misma tabla.';

create or replace view public.v_talleres as
select
  t.id, t.codigo, t.nombre, t.ubicacion, t.activo, t.trabajos_a_la_vez,
  coalesce(ab.abiertas, 0)  as abiertas,
  coalesce(ab.urgentes, 0)  as urgentes,
  coalesce(ab.pasadas, 0)   as pasadas_de_plazo,
  coalesce(hi.cerradas, 0)  as cerradas,
  hi.ultimo_trabajo,
  case when t.trabajos_a_la_vez is null then null
       else coalesce(ab.abiertas, 0) < t.trabajos_a_la_vez end as tiene_sitio,
  (select coalesce(array_agg(te.especialidad order by es.orden), '{}')
     from public.taller_especialidades te
     join public.especialidades_taller es on es.codigo = te.especialidad
    where te.taller_id = t.id) as especialidades,
  (select coalesce(string_agg(es.nombre, ' · ' order by es.orden), '')
     from public.taller_especialidades te
     join public.especialidades_taller es on es.codigo = te.especialidad
    where te.taller_id = t.id) as sabe_hacer
from public.almacenes t
left join lateral (
  select count(*) as abiertas,
         count(*) filter (where o.urgencia = 'URGENTE') as urgentes,
         count(*) filter (
           where o.dias_estimados is not null
             and ((now() at time zone 'America/Caracas')::date - o.fecha) > o.dias_estimados
         ) as pasadas
    from public.mantenimientos o
   where o.taller_id = t.id and o.estado = 'ABIERTO'
) ab on true
left join lateral (
  select count(*) as cerradas, max(o.fecha_salida) as ultimo_trabajo
    from public.mantenimientos o
   where o.taller_id = t.id and o.estado = 'CERRADO'
) hi on true
where t.tipo = 'TALLER';

alter view public.v_talleres set (security_invoker = on);

comment on view public.v_talleres is
  'Cada taller con lo que sabe hacer, lo que tiene abierto y si le queda sitio. Un taller sin tope declarado no dice si está disponible: no opinar es mejor que inventar.';

-- ---------------------------------------------------------------------------
-- Abrir una orden
--
-- Se borra y se crea porque cambia la lista de argumentos: PostgREST resuelve
-- por nombre, y un `create or replace` con parámetros nuevos dejaría DOS
-- funciones atendiendo según lo que mandara el navegador.
--
-- UN DETALLE QUE SOLO SALE PROBANDO
--
-- `v_maq` es un RECORD, y en la rama de material nunca se asigna. Leer un campo
-- de un RECORD sin asignar revienta con «record is not assigned yet» — así que
-- el estado previo y los días salen a variables propias que empiezan en nulo.
-- La primera versión fallaba exactamente ahí, y lo cazó el ensayo, no la
-- lectura.
-- ---------------------------------------------------------------------------
drop function if exists public.abrir_mantenimiento(bigint, text, text, bigint, date, smallint);
drop function if exists public.abrir_mantenimiento(
  bigint, text, text, bigint, date, smallint, bigint, numeric, text, text, jsonb);

create or replace function public.abrir_mantenimiento(
  p_maquina_id     bigint default null,
  p_tipo           text default 'REPARACION',
  p_motivo         text default null,
  p_taller_id      bigint default null,
  p_fecha          date default null,
  p_dias_estimados smallint default null,
  p_articulo_id    bigint default null,
  p_cantidad       numeric default null,
  p_origen_id      bigint default null,
  p_urgencia       text default 'NORMAL',
  p_especialidad   text default null,
  p_repuestos      jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_maq    record;
  v_art    record;
  v_taller record;
  v_fecha  date := coalesce(p_fecha, (now() at time zone 'America/Caracas')::date);
  v_hoy    date := (now() at time zone 'America/Caracas')::date;
  v_horas  numeric;
  v_id     bigint;
  v_hay    numeric;
  v_r      jsonb;
  v_rart   bigint;
  v_rcant  numeric;
  v_sobre  text;
  v_estado_previo text;
  v_dias_maq smallint;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  if p_tipo not in ('MANTENIMIENTO', 'SERVICIO', 'REPARACION', 'RECTIFICACION', 'FABRICACION') then
    raise exception 'Tipo de trabajo no válido: %.', p_tipo using errcode = '22023';
  end if;

  if p_urgencia not in ('NORMAL', 'ALTA', 'URGENTE') then
    raise exception 'La urgencia tiene que ser NORMAL, ALTA o URGENTE.' using errcode = '22023';
  end if;

  if num_nonnulls(p_maquina_id, p_articulo_id) <> 1 then
    raise exception 'Una orden de taller recae sobre una máquina o sobre material, no sobre las dos ni sobre ninguna.'
      using errcode = '23514';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Hay que decir por qué entra al taller.' using errcode = '23514';
  end if;

  if v_fecha > v_hoy then
    raise exception 'No se puede abrir una orden de taller con fecha futura.' using errcode = '22023';
  end if;

  if p_taller_id is not null then
    select * into v_taller from public.almacenes where id = p_taller_id and tipo = 'TALLER';
    if v_taller.id is null then
      raise exception 'El almacén % no es un taller.', p_taller_id using errcode = '22023';
    end if;

    -- Solo se comprueba si el taller declaró oficios. Uno sin especialidades
    -- acepta cualquier cosa: es lo razonable en una cantera con un solo taller.
    if p_especialidad is not null
       and exists (select 1 from public.taller_especialidades te where te.taller_id = p_taller_id)
       and not exists (
         select 1 from public.taller_especialidades te
          where te.taller_id = p_taller_id and te.especialidad = p_especialidad
       ) then
      raise exception 'En "%" no se hace %.', v_taller.nombre,
        lower((select nombre from public.especialidades_taller where codigo = p_especialidad))
        using errcode = '22023',
              hint = 'Mira en Talleres cuál de ellos lo hace, o añádele esa especialidad.';
    end if;
  end if;

  if p_maquina_id is not null then
    select * into v_maq from public.maquinaria where id = p_maquina_id for update;
    if v_maq.id is null then
      raise exception 'No existe la máquina %.', p_maquina_id using errcode = 'P0002';
    end if;
    if v_maq.estado = 'EN_MANTENIMIENTO' then
      raise exception 'La máquina "%" ya está en el taller.', v_maq.nombre using errcode = '55000';
    end if;
    if v_maq.estado = 'DESINCORPORADA' then
      raise exception 'La máquina "%" está desincorporada: ya no es de la flota.', v_maq.nombre
        using errcode = '55000';
    end if;

    select horas_desde_mant into v_horas from public.v_maquinaria where id = p_maquina_id;
    v_estado_previo := v_maq.estado;
    v_dias_maq := v_maq.dias_mantenimiento;
    v_sobre := v_maq.nombre;
  else
    select * into v_art from public.articulos where id = p_articulo_id;
    if v_art.id is null then
      raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
    end if;
    if coalesce(p_cantidad, 0) <= 0 then
      raise exception 'Hay que decir cuánto material entra al taller.' using errcode = '23514';
    end if;
    if p_taller_id is null then
      raise exception 'Para mandar material hay que decir a qué taller va: el material se mueve de verdad.'
        using errcode = '23514';
    end if;
    -- De dónde sale lo dice quien abre la orden. Adivinarlo por el último
    -- movimiento sacaría material del almacén equivocado el día que haya el
    -- mismo artículo en dos sitios — que es el caso normal.
    if p_origen_id is null then
      raise exception 'Hay que decir de qué almacén sale el material.' using errcode = '23514';
    end if;
    if p_origen_id = p_taller_id then
      raise exception 'El material ya está en ese taller.' using errcode = '22023';
    end if;

    v_hay := private.existencia(p_origen_id, p_articulo_id);
    if v_hay < p_cantidad then
      raise exception 'Solo hay % % de "%" en ese almacén.', v_hay, v_art.unidad, v_art.nombre
        using errcode = '55000';
    end if;

    v_sobre := format('%s %s de %s', p_cantidad, v_art.unidad, v_art.nombre);
  end if;

  insert into public.mantenimientos
    (numero, maquina_id, articulo_id, cantidad, fecha, tipo, estado, motivo,
     horometro, taller_id, estado_previo, dias_estimados, urgencia, especialidad,
     registrado_por)
  values
    (private.siguiente_numero('MTO'), p_maquina_id, p_articulo_id, p_cantidad,
     v_fecha, p_tipo, 'ABIERTO', btrim(p_motivo), v_horas, p_taller_id,
     v_estado_previo, coalesce(p_dias_estimados, v_dias_maq),
     p_urgencia, p_especialidad, (select auth.uid()))
  returning id into v_id;

  if p_maquina_id is not null then
    update public.maquinaria set estado = 'EN_MANTENIMIENTO' where id = p_maquina_id;
  else
    -- El material se mueve de verdad. Si no, el sistema diría que las varillas
    -- están en el almacén general mientras alguien las endereza a doscientos
    -- metros — y ese desfase es el que hace que nadie se fíe del inventario.
    perform public.transferir_existencia(
      p_origen_id := p_origen_id,
      p_destino_id := p_taller_id,
      p_articulo_id := p_articulo_id,
      p_cantidad := p_cantidad,
      p_motivo := format('Al taller · %s', btrim(p_motivo)),
      p_fecha := v_fecha);
  end if;

  for v_r in select * from jsonb_array_elements(coalesce(p_repuestos, '[]'::jsonb))
  loop
    v_rart  := (v_r ->> 'articulo_id')::bigint;
    v_rcant := (v_r ->> 'cantidad')::numeric;

    if v_rart is null or coalesce(v_rcant, 0) <= 0 then
      raise exception 'Cada repuesto previsto necesita un artículo y una cantidad mayor que cero.'
        using errcode = '23514';
    end if;

    -- Previsto no descuenta nada: es una estimación, y descontar por una
    -- estimación deja el almacén mintiendo hasta que alguien cierre la orden.
    insert into public.mantenimiento_repuestos
      (mantenimiento_id, articulo_id, cantidad, estado)
    values (v_id, v_rart, v_rcant, 'PREVISTO');
  end loop;

  perform private.notificar(
    'MAQUINARIA', 'MANTENIMIENTO_ABIERTO',
    format('%s entró al taller', v_sobre),
    btrim(p_motivo), '/app/maquinaria/mantenimientos', array['OPERACIONES', 'ALMACEN'],
    case when p_urgencia = 'URGENTE' then 'URGENTE'
         when p_tipo = 'REPARACION' then 'ATENCION'
         else 'INFO' end);

  return v_id;
end;
$func$;

comment on function public.abrir_mantenimiento(bigint, text, text, bigint, date, smallint, bigint, numeric, bigint, text, text, jsonb) is
  'Abre una orden de taller sobre una máquina o sobre material. Si es material, lo transfiere de verdad al taller desde el almacén que se indique. Los repuestos previstos no descuentan nada hasta cerrar.';

revoke all on function public.abrir_mantenimiento(bigint, text, text, bigint, date, smallint, bigint, numeric, bigint, text, text, jsonb) from public;
revoke all on function public.abrir_mantenimiento(bigint, text, text, bigint, date, smallint, bigint, numeric, bigint, text, text, jsonb) from anon;
grant execute on function public.abrir_mantenimiento(bigint, text, text, bigint, date, smallint, bigint, numeric, bigint, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Cerrar una orden
--
-- Descuenta los repuestos que se usaron de verdad, y si la orden era sobre
-- material lo devuelve al almacén que se diga. Lo que no vuelve es merma.
-- ---------------------------------------------------------------------------
drop function if exists public.cerrar_mantenimiento(bigint, text, numeric, jsonb, text, date);

create or replace function public.cerrar_mantenimiento(
  p_id             bigint,
  p_detalle        text,
  p_costo_usd      numeric default null,
  p_repuestos      jsonb default '[]'::jsonb,
  p_estado_salida  text default 'EN_ESPERA',
  p_fecha_salida   date default null,
  p_devuelto       numeric default null,
  p_destino_id     bigint default null
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_orden record;
  v_maq   record;
  v_art   record;
  v_salida date := coalesce(p_fecha_salida, (now() at time zone 'America/Caracas')::date);
  v_hoy    date := (now() at time zone 'America/Caracas')::date;
  v_r jsonb; v_rart bigint; v_rcant numeric;
  v_unitario numeric; v_costo numeric; v_hay numeric; v_mov bigint;
  v_total numeric := 0; v_nombre text;
  v_devuelto numeric;
  v_merma numeric;
  v_sobre text;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  select * into v_orden from public.mantenimientos where id = p_id for update;
  if v_orden.id is null then
    raise exception 'No existe la orden de taller %.', p_id using errcode = 'P0002';
  end if;
  if v_orden.estado <> 'ABIERTO' then
    raise exception 'La orden % está %.', coalesce(v_orden.numero, p_id::text),
      lower(v_orden.estado) using errcode = '55000';
  end if;
  if length(btrim(coalesce(p_detalle, ''))) < 3 then
    raise exception 'Hay que decir qué se hizo.' using errcode = '23514';
  end if;
  if v_salida < v_orden.fecha then
    raise exception 'No puede salir del taller antes de haber entrado.' using errcode = '22023';
  end if;
  if v_salida > v_hoy then
    raise exception 'No se puede cerrar una orden de taller con fecha futura.' using errcode = '22023';
  end if;

  if jsonb_array_length(coalesce(p_repuestos, '[]'::jsonb)) > 0 and v_orden.taller_id is null then
    raise exception 'Para descontar repuestos la orden tiene que decir en qué taller se hizo.'
      using errcode = '23514';
  end if;

  if v_orden.maquina_id is not null then
    select * into v_maq from public.maquinaria where id = v_orden.maquina_id for update;
    v_sobre := v_maq.nombre;
  else
    select * into v_art from public.articulos where id = v_orden.articulo_id;
    v_sobre := v_art.nombre;
  end if;

  for v_r in select * from jsonb_array_elements(coalesce(p_repuestos, '[]'::jsonb))
  loop
    v_rart  := (v_r ->> 'articulo_id')::bigint;
    v_rcant := (v_r ->> 'cantidad')::numeric;

    if v_rart is null or coalesce(v_rcant, 0) <= 0 then
      raise exception 'Cada repuesto necesita un artículo y una cantidad mayor que cero.'
        using errcode = '23514';
    end if;

    select nombre into v_nombre from public.articulos where id = v_rart;
    if v_nombre is null then
      raise exception 'No existe el artículo %.', v_rart using errcode = 'P0002';
    end if;

    v_hay := private.existencia(v_orden.taller_id, v_rart);
    if v_hay < v_rcant then
      raise exception 'El taller solo tiene % de "%": no alcanza para %.',
        v_hay, v_nombre, v_rcant using errcode = '55000';
    end if;

    v_unitario := private.costo_promedio(v_orden.taller_id, v_rart);
    v_costo    := v_unitario * v_rcant;

    v_mov := private.registrar_movimiento(
      'SALIDA_CONSUMO', -1, v_orden.taller_id, v_rart, v_rcant, v_unitario,
      format('Taller %s · %s', coalesce(v_orden.numero, p_id::text), v_sobre),
      null, null, null, v_salida);

    insert into public.mantenimiento_repuestos
      (mantenimiento_id, articulo_id, cantidad, costo_usd, movimiento_id, estado)
    values (p_id, v_rart, v_rcant, v_costo, v_mov, 'USADO');

    v_total := v_total + v_costo;
  end loop;

  if v_orden.articulo_id is not null then
    -- Lo normal es que vuelva todo. Se admite que vuelva menos —una varilla se
    -- parte al enderezarla— y esa diferencia es merma, no material perdido de
    -- vista: se registra como tal para que el inventario cuadre y para que la
    -- merma del taller se pueda mirar.
    v_devuelto := coalesce(p_devuelto, v_orden.cantidad);

    if v_devuelto < 0 or v_devuelto > v_orden.cantidad then
      raise exception 'Del taller no puede volver más de lo que entró (entraron %).', v_orden.cantidad
        using errcode = '22023';
    end if;

    if p_destino_id is null then
      raise exception 'Hay que decir a qué almacén vuelve el material.' using errcode = '23514';
    end if;

    if v_devuelto > 0 then
      perform public.transferir_existencia(
        p_origen_id := v_orden.taller_id,
        p_destino_id := p_destino_id,
        p_articulo_id := v_orden.articulo_id,
        p_cantidad := v_devuelto,
        p_motivo := format('Vuelve del taller · %s', coalesce(v_orden.numero, p_id::text)),
        p_fecha := v_salida);
    end if;

    v_merma := v_orden.cantidad - v_devuelto;
    if v_merma > 0 then
      perform private.registrar_movimiento(
        'SALIDA_MERMA', -1, v_orden.taller_id, v_orden.articulo_id, v_merma,
        private.costo_promedio(v_orden.taller_id, v_orden.articulo_id),
        format('Merma en el taller · %s', coalesce(v_orden.numero, p_id::text)),
        null, null, null, v_salida);
    end if;
  end if;

  update public.mantenimientos
     set estado = 'CERRADO', detalle = btrim(p_detalle), fecha_salida = v_salida,
         costo_usd = p_costo_usd, costo_repuestos_usd = v_total,
         cantidad_devuelta = v_devuelto,
         cerrado_por = (select auth.uid()), cerrado_en = now()
   where id = p_id;

  if v_orden.maquina_id is not null then
    if p_estado_salida not in ('EN_ESPERA', 'ACTIVA', 'FUERA_DE_SERVICIO') then
      raise exception 'Al salir del taller una máquina queda en espera, activa o fuera de servicio.'
        using errcode = '22023';
    end if;
    update public.maquinaria set estado = p_estado_salida where id = v_orden.maquina_id;
  end if;

  perform private.notificar(
    'MAQUINARIA', 'MANTENIMIENTO_CERRADO',
    format('%s salió del taller', v_sobre),
    case when v_orden.tipo = 'MANTENIMIENTO'
         then 'Su contador de horas vuelve a cero.'
         when v_orden.articulo_id is not null and coalesce(v_merma, 0) > 0
         then format('Volvieron %s de %s: el resto es merma.', v_devuelto, v_orden.cantidad)
         else 'Trabajo terminado.' end,
    '/app/maquinaria/mantenimientos', array['OPERACIONES', 'ALMACEN'], 'INFO');

  return p_id;
end;
$func$;

comment on function public.cerrar_mantenimiento(bigint, text, numeric, jsonb, text, date, numeric, bigint) is
  'Cierra una orden de taller. Descuenta los repuestos usados, y si era material lo devuelve al almacén que se diga: lo que no vuelve se registra como merma.';

revoke all on function public.cerrar_mantenimiento(bigint, text, numeric, jsonb, text, date, numeric, bigint) from public;
revoke all on function public.cerrar_mantenimiento(bigint, text, numeric, jsonb, text, date, numeric, bigint) from anon;
grant execute on function public.cerrar_mantenimiento(bigint, text, numeric, jsonb, text, date, numeric, bigint) to authenticated;
