-- ---------------------------------------------------------------------------
-- El mantenimiento como algo que empieza, dura y termina
--
-- LO QUE FALTABA
--
-- `mantenimientos` (20260819100000) guardaba un hecho consumado: se anotaba
-- después, de un solo golpe, que a la máquina se le hizo algo. Eso deja tres
-- preguntas sin sitio donde vivir:
--
--   ¿Cómo entra una máquina al taller? No había forma de decir «está adentro».
--   ¿Cómo sale, y a qué estado? Salir de mantenimiento no es volver a trabajar:
--     es quedar disponible, en espera de que la asignen.
--   ¿Qué se gastó en ella? El repuesto salía del almacén por otra puerta, sin
--     quedar atado a la reparación que lo consumió.
--
-- Ahora el mantenimiento es una orden con dos momentos: se abre cuando la
-- máquina entra —y ahí mismo la máquina cambia de estado— y se cierra cuando
-- sale, con lo que se hizo, lo que costó y los repuestos que se le pusieron.
--
-- EL CONTADOR VUELVE A CERO AL CERRAR, NO AL ABRIR
--
-- Mientras la orden está abierta la máquina sigue contando las horas que traía.
-- Es lo correcto: todavía no se le ha hecho nada. Si se anula la orden, la
-- máquina vuelve al estado que tenía y no ha perdido su historial.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Los estados de una máquina, y por qué son cuatro y no dos
--
--   ACTIVA             trabajando o asignada a un frente.
--   EN_ESPERA          sana y disponible, sin asignar. Es a donde se sale del
--                      taller: que una máquina esté reparada no significa que
--                      ya esté trabajando, y confundirlo hace creer que hay
--                      más equipo en el frente del que hay.
--   EN_MANTENIMIENTO   está en el taller. No entra ni sale a mano: lo pone
--                      abrir_mantenimiento y lo quita cerrar_mantenimiento.
--   FUERA_DE_SERVICIO  averiada o parada sin fecha. Distinta de EN_ESPERA:
--                      aquella se puede mandar a trabajar hoy, esta no.
--   DESINCORPORADA     ya no es de la flota. Se conserva por su historial.
-- ---------------------------------------------------------------------------
alter table public.maquinaria drop constraint if exists maquinaria_estado_check;
alter table public.maquinaria
  add constraint maquinaria_estado_check check (estado in (
    'ACTIVA', 'EN_ESPERA', 'EN_MANTENIMIENTO', 'FUERA_DE_SERVICIO', 'DESINCORPORADA'));

comment on column public.maquinaria.estado is
  'ACTIVA trabajando · EN_ESPERA sana y sin asignar · EN_MANTENIMIENTO en el '
  'taller (lo maneja abrir/cerrar_mantenimiento, no se pone a mano) · '
  'FUERA_DE_SERVICIO averiada · DESINCORPORADA fuera de la flota.';

-- Cuánto suele tardar su mantenimiento. Sirve para saber, mirando el taller,
-- cuáles llevan más tiempo dentro del que se esperaba. Nula mientras nadie lo
-- haya estimado: sin el dato no se compara contra nada inventado.
alter table public.maquinaria
  add column if not exists dias_mantenimiento smallint
    check (dias_mantenimiento is null or dias_mantenimiento > 0);

-- ---------------------------------------------------------------------------
-- La orden de mantenimiento
-- ---------------------------------------------------------------------------
alter table public.mantenimientos
  add column if not exists numero        text,
  add column if not exists estado        text not null default 'CERRADO',
  add column if not exists motivo        text,
  add column if not exists fecha_salida  date,
  add column if not exists estado_previo text,
  add column if not exists dias_estimados smallint,
  add column if not exists costo_repuestos_usd numeric(20,6) not null default 0,
  add column if not exists cerrado_por   uuid references auth.users(id),
  add column if not exists cerrado_en    timestamptz,
  add column if not exists motivo_anulacion text,
  add column if not exists anulado_por   uuid references auth.users(id),
  add column if not exists anulado_en    timestamptz;

-- El detalle deja de exigirse al insertar: al abrir la orden todavía no se
-- sabe qué se va a hacer. Se exige al cerrar, que es cuando sí se sabe.
alter table public.mantenimientos drop constraint if exists mantenimientos_detalle_check;
alter table public.mantenimientos alter column detalle drop not null;

alter table public.mantenimientos drop constraint if exists mantenimiento_estado_valido;
alter table public.mantenimientos
  add constraint mantenimiento_estado_valido
    check (estado in ('ABIERTO', 'CERRADO', 'ANULADO'));

-- Una orden cerrada tiene que decir qué se hizo y cuándo salió. Sin esto se
-- podría cerrar en blanco, que es exactamente el vacío que se quería evitar.
alter table public.mantenimientos drop constraint if exists mantenimiento_cerrado_completo;
alter table public.mantenimientos
  add constraint mantenimiento_cerrado_completo check (
    estado <> 'CERRADO'
    or (fecha_salida is not null and length(btrim(coalesce(detalle, ''))) >= 3)
  );

alter table public.mantenimientos drop constraint if exists mantenimiento_anulado_con_motivo;
alter table public.mantenimientos
  add constraint mantenimiento_anulado_con_motivo check (
    estado <> 'ANULADO' or length(btrim(coalesce(motivo_anulacion, ''))) >= 4
  );

alter table public.mantenimientos drop constraint if exists mantenimiento_no_sale_antes_de_entrar;
alter table public.mantenimientos
  add constraint mantenimiento_no_sale_antes_de_entrar
    check (fecha_salida is null or fecha_salida >= fecha);

alter table public.mantenimientos drop constraint if exists mantenimiento_dias_estimados_positivos;
alter table public.mantenimientos
  add constraint mantenimiento_dias_estimados_positivos
    check (dias_estimados is null or dias_estimados > 0);

drop index if exists mantenimientos_numero_unico;
create unique index mantenimientos_numero_unico
  on public.mantenimientos (numero) where numero is not null;

comment on column public.mantenimientos.fecha is
  'El día que la máquina entró al taller.';
comment on column public.mantenimientos.estado_previo is
  'A dónde vuelve la máquina si se anula la orden. Se guarda al abrirla porque '
  'después ya no se puede saber: el estado actual es EN_MANTENIMIENTO.';

-- Una máquina no puede tener dos órdenes abiertas: o está en el taller o no.
drop index if exists mantenimiento_uno_abierto_por_maquina;
create unique index mantenimiento_uno_abierto_por_maquina
  on public.mantenimientos (maquina_id)
  where estado = 'ABIERTO';

-- ---------------------------------------------------------------------------
-- Los repuestos que se le pusieron
--
-- POR QUÉ SE ANOTAN AQUÍ Y NO SOLO COMO SALIDA DE ALMACÉN
--
-- El movimiento de inventario ya existía y seguirá existiendo: es la única
-- puerta por la que sale una pieza. Lo que faltaba era el otro extremo del
-- hilo — qué reparación se la comió. Sin eso se puede saber que salieron seis
-- filtros del taller y no a qué máquinas fueron, que es justo lo que se
-- pregunta cuando una empieza a consumir de más.
--
-- La fila guarda el `movimiento_id` para que las dos versiones de la historia
-- no puedan separarse.
-- ---------------------------------------------------------------------------
create table if not exists public.mantenimiento_repuestos (
  id             bigint generated always as identity primary key,
  mantenimiento_id bigint not null references public.mantenimientos(id) on delete cascade,
  articulo_id    bigint not null references public.articulos(id),
  cantidad       numeric(20,4) not null check (cantidad > 0),
  costo_usd      numeric(20,6) not null default 0 check (costo_usd >= 0),
  movimiento_id  bigint references public.inventario_movimientos(id),
  creado_en      timestamptz not null default now()
);

create index if not exists mantenimiento_repuestos_orden_idx
  on public.mantenimiento_repuestos (mantenimiento_id);

comment on table public.mantenimiento_repuestos is
  'Lo que se le puso a una máquina en una reparación. El movimiento de '
  'inventario es la salida del almacén; esta fila dice a qué reparación fue.';

-- ---------------------------------------------------------------------------
-- El semáforo cuenta desde el mantenimiento CERRADO
--
-- Antes bastaba con que existiera una fila de tipo MANTENIMIENTO. Ahora una
-- orden abierta no reinicia nada: la máquina está en el taller, todavía no le
-- han hecho nada, y sus horas siguen siendo las que traía. El reinicio ocurre
-- el día que sale.
-- ---------------------------------------------------------------------------
-- Se sueltan las dos vistas antes de rehacerlas: `create or replace view` solo
-- deja anadir columnas al final, y aqui entran en medio. `v_vehiculos` cuelga
-- de `v_maquinaria`, asi que cae con ella y se vuelve a crear mas abajo igual
-- que estaba.
drop view if exists public.v_vehiculos;
drop view if exists public.v_maquinaria;

create view public.v_maquinaria
with (security_invoker = on) as
with ultimo_mant as (
  select distinct on (maquina_id)
         maquina_id,
         coalesce(fecha_salida, fecha) as fecha,
         horometro
    from public.mantenimientos
   where tipo = 'MANTENIMIENTO'
     and estado = 'CERRADO'
   order by maquina_id, coalesce(fecha_salida, fecha) desc, id desc
),
abierta as (
  select maquina_id, id, fecha, dias_estimados, taller_id
    from public.mantenimientos
   where estado = 'ABIERTO'
),
horas as (
  select m.id as maquina_id,
         coalesce(sum(h.horas) filter (
           where um.fecha is null or h.fecha > um.fecha
         ), 0) as horas_desde_mant,
         coalesce(sum(h.horas), 0) as horas_totales,
         max(h.fecha) as ultima_lectura,
         max(h.final) filter (where h.fecha = (
           select max(h2.fecha) from public.horometro_lecturas h2 where h2.maquina_id = m.id
         )) as horometro_actual
    from public.maquinaria m
    left join ultimo_mant um on um.maquina_id = m.id
    left join public.horometro_lecturas h on h.maquina_id = m.id
   group by m.id
)
select
  m.*,
  a.nombre  as almacen,
  a.tipo    as almacen_tipo,
  hs.horas_desde_mant,
  hs.horas_totales,
  hs.ultima_lectura,
  hs.horometro_actual,
  um.fecha  as ultimo_mantenimiento,
  greatest(m.tope_horas - hs.horas_desde_mant, 0) as horas_para_el_tope,

  -- La orden abierta, si la hay. Con ella la pantalla puede ofrecer «cerrar»
  -- en vez de «abrir» sin tener que ir a buscarla por su cuenta.
  ab.id     as mantenimiento_abierto_id,
  ab.fecha  as mantenimiento_desde,
  ab.taller_id as mantenimiento_taller_id,
  case when ab.id is not null
       then current_date - ab.fecha
  end       as dias_en_taller,

  -- Si lleva más días dentro de los estimados. Nulo cuando nadie estimó nada:
  -- no se compara contra un número inventado.
  case
    when ab.id is null or coalesce(ab.dias_estimados, m.dias_mantenimiento) is null then null
    else (current_date - ab.fecha) > coalesce(ab.dias_estimados, m.dias_mantenimiento)
  end       as se_paso_en_el_taller,

  case
    when hs.horas_desde_mant >= m.tope_horas   then 'BLOQUEANTE'
    when hs.horas_desde_mant >= m.alarma_horas then 'ALARMA'
    when hs.horas_desde_mant >= m.aviso_horas  then 'AVISO'
    else 'OK'
  end as semaforo
from public.maquinaria m
left join horas hs on hs.maquina_id = m.id
left join ultimo_mant um on um.maquina_id = m.id
left join abierta ab on ab.maquina_id = m.id
left join public.almacenes a on a.id = m.almacen_id;

comment on view public.v_maquinaria is
  'Cada máquina con sus horas desde el último mantenimiento cerrado, su '
  'semáforo, y la orden de taller que tenga abierta.';

-- ---------------------------------------------------------------------------
-- El historial de taller, listo para leer
-- ---------------------------------------------------------------------------
create or replace view public.v_mantenimientos
with (security_invoker = on) as
select
  mt.id,
  mt.numero,
  mt.maquina_id,
  mq.codigo   as maquina_codigo,
  mq.nombre   as maquina,
  mq.tipo     as maquina_tipo,
  mt.tipo,
  mt.estado,
  mt.motivo,
  mt.detalle,
  mt.fecha,
  mt.fecha_salida,
  mt.dias_estimados,
  case
    when mt.estado = 'ABIERTO' then current_date - mt.fecha
    when mt.fecha_salida is not null then mt.fecha_salida - mt.fecha
  end as dias,
  mt.horometro,
  mt.taller_id,
  al.nombre as taller,
  mt.costo_usd,
  mt.costo_repuestos_usd,
  coalesce(mt.costo_usd, 0) + mt.costo_repuestos_usd as costo_total_usd,
  (select count(*) from public.mantenimiento_repuestos r where r.mantenimiento_id = mt.id)
    as repuestos,
  mt.motivo_anulacion,
  mt.registrado_en
from public.mantenimientos mt
join public.maquinaria mq on mq.id = mt.maquina_id
left join public.almacenes al on al.id = mt.taller_id;

comment on view public.v_mantenimientos is
  'El reporte de taller: qué entró, cuánto tardó, qué se le hizo y qué costó '
  'entre mano de obra y repuestos.';

-- ---------------------------------------------------------------------------
-- Abrir: la máquina entra al taller
-- ---------------------------------------------------------------------------
create or replace function public.abrir_mantenimiento(
  p_maquina_id     bigint,
  p_tipo           text,
  p_motivo         text,
  p_taller_id      bigint  default null,
  p_fecha          date    default null,
  p_dias_estimados smallint default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $func$
declare
  v_maq    record;
  v_fecha  date := coalesce(p_fecha, current_date);
  v_horas  numeric;
  v_id     bigint;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  if p_tipo not in ('MANTENIMIENTO', 'SERVICIO') then
    raise exception 'El tipo tiene que ser MANTENIMIENTO o SERVICIO (recibido: %).', p_tipo
      using errcode = '22023';
  end if;

  select * into v_maq from public.maquinaria where id = p_maquina_id for update;
  if v_maq.id is null then
    raise exception 'No existe la máquina %.', p_maquina_id using errcode = 'P0002';
  end if;

  if v_maq.estado = 'EN_MANTENIMIENTO' then
    raise exception 'La máquina "%" ya está en el taller.', v_maq.nombre
      using errcode = '55000';
  end if;
  if v_maq.estado = 'DESINCORPORADA' then
    raise exception 'La máquina "%" está desincorporada: ya no es de la flota.', v_maq.nombre
      using errcode = '55000';
  end if;

  if v_fecha > current_date then
    raise exception 'No se puede meter una máquina al taller con fecha futura.'
      using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Hay que decir por qué entra al taller.' using errcode = '23514';
  end if;

  if p_taller_id is not null then
    perform 1 from public.almacenes where id = p_taller_id and tipo = 'TALLER';
    if not found then
      raise exception 'El almacén % no es un taller.', p_taller_id using errcode = '22023';
    end if;
  end if;

  -- El horómetro de entrada se toma de la vista y no del teclado: es el mismo
  -- número que ve la pantalla, y así no hay dos versiones de con cuántas horas
  -- entró.
  select horas_desde_mant into v_horas from public.v_maquinaria where id = p_maquina_id;

  insert into public.mantenimientos
    (numero, maquina_id, fecha, tipo, estado, motivo, horometro, taller_id,
     estado_previo, dias_estimados, registrado_por)
  values
    (private.siguiente_numero('MTO'), p_maquina_id, v_fecha, p_tipo, 'ABIERTO',
     btrim(p_motivo), v_horas, p_taller_id, v_maq.estado,
     coalesce(p_dias_estimados, v_maq.dias_mantenimiento), (select auth.uid()))
  returning id into v_id;

  update public.maquinaria set estado = 'EN_MANTENIMIENTO' where id = p_maquina_id;

  perform private.notificar(
    'MAQUINARIA', 'MANTENIMIENTO_ABIERTO',
    format('%s entró al taller', v_maq.nombre),
    btrim(p_motivo), '/app/maquinaria', array['OPERACIONES','ALMACEN'], 'INFO');

  return v_id;
end;
$func$;

comment on function public.abrir_mantenimiento is
  'Mete una máquina al taller: crea la orden y la deja EN_MANTENIMIENTO. El '
  'contador de horas no se toca hasta que la orden se cierre.';

-- ---------------------------------------------------------------------------
-- Cerrar: la máquina sale, y sale a espera
--
-- POR QUÉ EL ESTADO DE SALIDA POR DEFECTO ES EN_ESPERA Y NO ACTIVA
--
-- Salir del taller no es volver al frente. La máquina queda sana y disponible,
-- y alguien tiene que decidir a qué la manda. Devolverla directamente a ACTIVA
-- haría creer que hay más equipo trabajando del que hay.
-- ---------------------------------------------------------------------------
create or replace function public.cerrar_mantenimiento(
  p_id            bigint,
  p_detalle       text,
  p_costo_usd     numeric default null,
  p_repuestos     jsonb   default '[]'::jsonb,
  p_estado_salida text    default 'EN_ESPERA',
  p_fecha_salida  date    default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $func$
declare
  v_orden   record;
  v_maq     record;
  v_salida  date := coalesce(p_fecha_salida, current_date);
  v_r       jsonb;
  v_art     bigint;
  v_cant    numeric;
  v_costo   numeric;
  v_hay     numeric;
  v_mov     bigint;
  v_total   numeric := 0;
  v_nombre  text;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  if p_estado_salida not in ('EN_ESPERA', 'ACTIVA', 'FUERA_DE_SERVICIO') then
    raise exception 'Al salir del taller una máquina queda en espera, activa o fuera de servicio.'
      using errcode = '22023';
  end if;

  select * into v_orden from public.mantenimientos where id = p_id for update;
  if v_orden.id is null then
    raise exception 'No existe la orden de mantenimiento %.', p_id using errcode = 'P0002';
  end if;
  if v_orden.estado <> 'ABIERTO' then
    raise exception 'La orden % está %.', coalesce(v_orden.numero, p_id::text),
      lower(v_orden.estado) using errcode = '55000';
  end if;

  if length(btrim(coalesce(p_detalle, ''))) < 3 then
    raise exception 'Hay que decir qué se le hizo a la máquina.' using errcode = '23514';
  end if;
  if v_salida < v_orden.fecha then
    raise exception 'No puede salir del taller antes de haber entrado.' using errcode = '22023';
  end if;
  if v_salida > current_date then
    raise exception 'No se puede sacar una máquina del taller con fecha futura.'
      using errcode = '22023';
  end if;

  select * into v_maq from public.maquinaria where id = v_orden.maquina_id for update;

  -- Los repuestos salen del taller donde se hizo el trabajo. Sin taller no hay
  -- de dónde descontarlos, y anotarlos sin descontarlos dejaría el almacén
  -- diciendo que todavía los tiene.
  if jsonb_array_length(coalesce(p_repuestos, '[]'::jsonb)) > 0 and v_orden.taller_id is null then
    raise exception 'Para descontar repuestos la orden tiene que decir en qué taller se hizo.'
      using errcode = '23514';
  end if;

  for v_r in select * from jsonb_array_elements(coalesce(p_repuestos, '[]'::jsonb))
  loop
    v_art  := (v_r ->> 'articulo_id')::bigint;
    v_cant := (v_r ->> 'cantidad')::numeric;

    if v_art is null or coalesce(v_cant, 0) <= 0 then
      raise exception 'Cada repuesto necesita un artículo y una cantidad mayor que cero.'
        using errcode = '23514';
    end if;

    select nombre into v_nombre from public.articulos where id = v_art;
    if v_nombre is null then
      raise exception 'No existe el artículo %.', v_art using errcode = 'P0002';
    end if;

    v_hay := private.existencia(v_orden.taller_id, v_art);
    if v_hay < v_cant then
      raise exception 'El taller solo tiene % de "%": no alcanza para %.',
        v_hay, v_nombre, v_cant using errcode = '55000';
    end if;

    v_costo := private.costo_promedio(v_orden.taller_id, v_art) * v_cant;

    v_mov := private.registrar_movimiento(
      'SALIDA_CONSUMO', -1, v_orden.taller_id, v_art, v_cant, v_costo,
      format('Mantenimiento %s · %s', coalesce(v_orden.numero, p_id::text), v_maq.nombre),
      null, null, null, v_salida);

    insert into public.mantenimiento_repuestos
      (mantenimiento_id, articulo_id, cantidad, costo_usd, movimiento_id)
    values (p_id, v_art, v_cant, v_costo, v_mov);

    v_total := v_total + v_costo;
  end loop;

  update public.mantenimientos
     set estado              = 'CERRADO',
         detalle             = btrim(p_detalle),
         fecha_salida        = v_salida,
         costo_usd           = p_costo_usd,
         costo_repuestos_usd = v_total,
         cerrado_por         = (select auth.uid()),
         cerrado_en          = now()
   where id = p_id;

  update public.maquinaria set estado = p_estado_salida where id = v_orden.maquina_id;

  perform private.notificar(
    'MAQUINARIA', 'MANTENIMIENTO_CERRADO',
    format('%s salió del taller', v_maq.nombre),
    case when v_orden.tipo = 'MANTENIMIENTO'
         then 'Su contador de horas vuelve a cero.'
         else 'Fue un servicio: el contador de horas sigue donde estaba.' end,
    '/app/maquinaria', array['OPERACIONES','ALMACEN'], 'INFO');

  return p_id;
end;
$func$;

comment on function public.cerrar_mantenimiento is
  'Saca la máquina del taller con lo que se le hizo y los repuestos que se le '
  'pusieron, que se descuentan del taller. Sale EN_ESPERA salvo que se indique '
  'otra cosa: reparada no es lo mismo que asignada.';

-- ---------------------------------------------------------------------------
-- Anular: la orden no debió existir
--
-- No borra. Devuelve la máquina al estado que traía —por eso se guardó al
-- abrir— y deja la orden anulada con su motivo, como todo lo demás en el
-- sistema.
-- ---------------------------------------------------------------------------
create or replace function public.anular_mantenimiento(
  p_id     bigint,
  p_motivo text
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $func$
declare
  v_orden record;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  select * into v_orden from public.mantenimientos where id = p_id for update;
  if v_orden.id is null then
    raise exception 'No existe la orden de mantenimiento %.', p_id using errcode = 'P0002';
  end if;
  if v_orden.estado <> 'ABIERTO' then
    raise exception 'Solo se anula una orden abierta. La % está %.',
      coalesce(v_orden.numero, p_id::text), lower(v_orden.estado) using errcode = '55000';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Hay que decir por qué se anula.' using errcode = '23514';
  end if;

  update public.mantenimientos
     set estado           = 'ANULADO',
         motivo_anulacion = btrim(p_motivo),
         anulado_por      = (select auth.uid()),
         anulado_en       = now()
   where id = p_id;

  update public.maquinaria
     set estado = coalesce(v_orden.estado_previo, 'EN_ESPERA')
   where id = v_orden.maquina_id;

  return p_id;
end;
$func$;

-- ---------------------------------------------------------------------------
-- Cambiar el estado a mano — y lo que no se puede hacer a mano
--
-- Entre ACTIVA, EN_ESPERA, FUERA_DE_SERVICIO y DESINCORPORADA se pasa
-- libremente: son decisiones de operaciones.
--
-- EN_MANTENIMIENTO no. Ni se entra ni se sale de él por aquí, porque cada uno
-- de esos dos pasos tiene consecuencias —una orden que se abre, un contador
-- que se reinicia, unos repuestos que se descuentan— y permitirlo a mano sería
-- ofrecer una puerta lateral que las salta todas.
-- ---------------------------------------------------------------------------
create or replace function public.cambiar_estado_maquina(
  p_id     bigint,
  p_estado text,
  p_motivo text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $func$
declare
  v_maq record;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  select * into v_maq from public.maquinaria where id = p_id for update;
  if v_maq.id is null then
    raise exception 'No existe la máquina %.', p_id using errcode = 'P0002';
  end if;

  if p_estado = 'EN_MANTENIMIENTO' then
    raise exception 'Para meter una máquina al taller hay que abrir su mantenimiento, no cambiarle el estado.'
      using errcode = '22023';
  end if;
  if v_maq.estado = 'EN_MANTENIMIENTO' then
    raise exception 'La máquina "%" está en el taller. Se saca cerrando su mantenimiento.', v_maq.nombre
      using errcode = '55000';
  end if;
  if p_estado not in ('ACTIVA', 'EN_ESPERA', 'FUERA_DE_SERVICIO', 'DESINCORPORADA') then
    raise exception 'Estado no válido: %.', p_estado using errcode = '22023';
  end if;

  if p_estado = v_maq.estado then
    return p_id;
  end if;

  update public.maquinaria
     set estado = p_estado,
         nota   = case
                    when length(btrim(coalesce(p_motivo, ''))) > 0
                    then btrim(p_motivo)
                    else nota
                  end
   where id = p_id;

  -- Sacar una máquina de servicio es de las cosas que alguien más necesita
  -- saber el mismo día, no el mes que viene en un reporte.
  if p_estado in ('FUERA_DE_SERVICIO', 'DESINCORPORADA') then
    perform private.notificar(
      'MAQUINARIA', 'MAQUINA_PARADA',
      format('%s pasó a %s', v_maq.nombre, lower(replace(p_estado, '_', ' '))),
      nullif(btrim(coalesce(p_motivo, '')), ''),
      '/app/maquinaria', array['OPERACIONES','ALMACEN'], 'ATENCION');
  end if;

  return p_id;
end;
$func$;

-- ---------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------
revoke execute on function public.abrir_mantenimiento(bigint, text, text, bigint, date, smallint)
  from public, anon;
grant execute on function public.abrir_mantenimiento(bigint, text, text, bigint, date, smallint)
  to authenticated;

revoke execute on function public.cerrar_mantenimiento(bigint, text, numeric, jsonb, text, date)
  from public, anon;
grant execute on function public.cerrar_mantenimiento(bigint, text, numeric, jsonb, text, date)
  to authenticated;

revoke execute on function public.anular_mantenimiento(bigint, text) from public, anon;
grant execute on function public.anular_mantenimiento(bigint, text) to authenticated;

revoke execute on function public.cambiar_estado_maquina(bigint, text, text) from public, anon;
grant execute on function public.cambiar_estado_maquina(bigint, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS de la tabla nueva
-- ---------------------------------------------------------------------------
alter table public.mantenimiento_repuestos enable row level security;

drop policy if exists mantenimiento_repuestos_lectura on public.mantenimiento_repuestos;
create policy mantenimiento_repuestos_lectura on public.mantenimiento_repuestos
  for select to authenticated
  using (private.tiene_permiso('MAQUINARIA', 'LECTURA'));

revoke insert, update, delete on public.mantenimiento_repuestos from anon, authenticated;

-- ---------------------------------------------------------------------------
-- `v_vehiculos`, tal como estaba: cayo al soltar `v_maquinaria`
-- ---------------------------------------------------------------------------
create view public.v_vehiculos
with (security_invoker = on) as
select
  v.id, v.placa, v.tipo, v.descripcion, v.capacidad_m3, v.capacidad_ton,
  v.propio, v.transportista, v.maquina_id, v.activo, v.nota,
  m.codigo   as maquina_codigo,
  m.nombre   as maquina,
  m.semaforo as semaforo_mantenimiento,
  m.horas_desde_mant,
  m.tope_horas
from public.vehiculos v
left join public.v_maquinaria m on m.id = v.maquina_id;

comment on view public.v_vehiculos is
  'La flota con el semáforo de mantenimiento de los camiones propios, para '
  'que quien despacha vea antes de cargar si el camión debería estar en el '
  'taller.';
