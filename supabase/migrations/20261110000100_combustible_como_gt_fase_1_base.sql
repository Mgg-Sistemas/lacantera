/*
  COMBUSTIBLE COMO GOLDEN TOUCH · FASE 1: LA BASE (10/11/2026)

  La dueña quiere el módulo de combustible de Golden Touch (tanques con su
  libro mayor, entradas, surtidos, traslados, retornos y mermas, catálogos,
  cubicación y conciliación) con los rieles de La Cantera. Esta fase pone el
  piso sobre el que se montan las demás. Es ADITIVA: no borra ni reescribe
  ninguna fila. Lo que ya hay —200 vales, 208 movimientos del libro de
  inventario, 3.569 L en el combustible inicial— se lee igual que antes.

  EL LIBRO NO SE DUPLICA

  En Golden Touch cada tanque lleva su propia tabla de movimientos con el saldo
  guardado en la cabecera. Aquí eso ya existe y es mejor: `inventario_movimientos`
  es inmutable, lleva el costo promedio y es lo que miran Inventario, Costos y
  Tesorería. Así que el «libro del tanque» es una VISTA sobre ese libro
  (`v_combustible_libro`), y lo que Golden Touch anota de más —hora, equipo,
  autorizado, destino, contador del surtidor, horómetro, kilometraje,
  cuaderno— vive en `combustible_mov_datos`, una fila por movimiento.

  EL TANQUE ES UN ALMACÉN

  Un tanque de Golden Touch es un almacén de tipo COMBUSTIBLE aquí, con su
  capacidad rotulada en `almacenes.capacidad`. Lo que es propio de un tanque
  (geometría para cubicar, si es móvil o un bidón, márgenes de merma, orden en
  pantalla) va en `combustible_tanques`, cuya llave es el almacén. El saldo y la
  tasa no se guardan: salen del libro, como en `v_existencias`.

  Lo que se crea:
    1. Tablas: combustible_tanques, combustible_mov_datos,
       combustible_catalogos, combustible_cubicaciones,
       combustible_conciliaciones. Solo lectura por RLS (COMBUSTIBLE:LECTURA);
       todo se escribe por funciones.
    2. Relleno: los dos tanques de hoy (CMB-TAN y CMB-INI) y las 17 máquinas
       como equipos del catálogo.
    3. Vistas: v_combustible_tanques y v_combustible_libro.
    4. Acciones nuevas en la matriz y a quién se le dan.
    5. Auditoría y tiempo real.
    6. Comprobación de solo lectura: el libro cuadra con las existencias.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Tablas
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.combustible_tanques (
  almacen_id                  bigint primary key references public.almacenes(id) on delete restrict,
  tipo_geometria              text not null default 'rectangular'
                              check (tipo_geometria in ('cilindrico_horizontal', 'rectangular')),
  es_movil                    boolean not null default false,
  es_bidon                    boolean not null default false,
  radio_m                     numeric check (radio_m is null or radio_m > 0),
  largo_m                     numeric check (largo_m is null or largo_m > 0),
  ancho_m                     numeric check (ancho_m is null or ancho_m > 0),
  alto_m                      numeric check (alto_m is null or alto_m > 0),
  capacidad_calculada_litros  numeric check (capacidad_calculada_litros is null or capacidad_calculada_litros >= 0),
  margen_merma_pct            numeric not null default 10 check (margen_merma_pct between 0 and 100),
  merma_implicita_pct         numeric not null default 0.5 check (merma_implicita_pct between 0 and 100),
  orden                       smallint not null default 100,
  creado_por                  uuid references auth.users(id) default auth.uid(),
  creado_en                   timestamptz not null default now(),
  actualizado_por             uuid references auth.users(id),
  actualizado_en              timestamptz
);

comment on table public.combustible_tanques is
  'Lo que un almacén de tipo COMBUSTIBLE tiene de tanque (Golden Touch): geometría para cubicar, móvil o bidón, márgenes de merma y orden. El saldo y la tasa no se guardan: salen del libro de inventario.';
comment on column public.combustible_tanques.es_bidon is
  'Un bidón no acumula saldo: lo que se le pasa se da por usado en el momento (regla de Golden Touch del 23/10/2026).';
comment on column public.combustible_tanques.margen_merma_pct is
  'Merma máxima admitida al recibir una entrada o un traslado, en % de lo enviado. Pasarla exige motivo y la acción COMBUSTIBLE.MERMA_FUERA_DE_MARGEN.';
comment on column public.combustible_tanques.merma_implicita_pct is
  'Tolerancia técnica por movimiento (mangueras, goteo). Solo se usa para SUGERIR una merma; no descuenta nada por sí sola.';

create table if not exists public.combustible_mov_datos (
  movimiento_id     bigint primary key references public.inventario_movimientos(id) on delete restrict,
  hora              time,
  maquina_id        bigint references public.maquinaria(id),
  despacho_id       bigint references public.despachos_combustible(id),
  equipo            text,
  autorizado        text,
  ubicacion         text,
  observacion       text,
  contador_ini      numeric,
  contador_fin      numeric,
  horometro_ini     numeric check (horometro_ini is null or horometro_ini >= 0),
  horometro_fin     numeric check (horometro_fin is null or horometro_fin >= 0),
  km                numeric check (km is null or km >= 0),
  cuaderno          boolean not null default false,
  cuaderno_litros   numeric check (cuaderno_litros is null or cuaderno_litros >= 0),
  destino_almacen_id bigint references public.almacenes(id),
  merma_de_mov_id   bigint references public.inventario_movimientos(id),
  merma_motivo      text,
  merma_fuera_de_margen boolean not null default false,
  creado_por        uuid references auth.users(id) default auth.uid(),
  creado_en         timestamptz not null default now(),
  actualizado_por   uuid references auth.users(id),
  actualizado_en    timestamptz,
  constraint combustible_horometro_no_retrocede
    check (horometro_ini is null or horometro_fin is null or horometro_fin >= horometro_ini),
  constraint combustible_merma_fuera_con_motivo
    check (not merma_fuera_de_margen or length(btrim(coalesce(merma_motivo, ''))) >= 3)
);

comment on table public.combustible_mov_datos is
  'Lo que Golden Touch anota de cada movimiento de combustible y el libro de inventario no lleva: hora, equipo, autorizado, destino, contador del surtidor, horómetro, kilometraje y cuaderno. Una fila por movimiento; el movimiento en sí sigue siendo inmutable.';
comment on column public.combustible_mov_datos.destino_almacen_id is
  'Cuando el combustible fue a un bidón: el bidón. El movimiento es una salida (uso), no un traslado.';
comment on column public.combustible_mov_datos.merma_de_mov_id is
  'Merma de recepción: la entrada o el traslado del que sale esta merma.';

create index if not exists combustible_mov_datos_maquina_idx on public.combustible_mov_datos (maquina_id) where maquina_id is not null;
create index if not exists combustible_mov_datos_despacho_idx on public.combustible_mov_datos (despacho_id) where despacho_id is not null;
create index if not exists combustible_mov_datos_merma_de_idx on public.combustible_mov_datos (merma_de_mov_id) where merma_de_mov_id is not null;

create table if not exists public.combustible_catalogos (
  id                 bigint generated always as identity primary key,
  tipo               text not null check (tipo in ('equipo', 'autorizado', 'ubicacion')),
  valor              text not null check (length(btrim(valor)) >= 2),
  maquina_id         bigint unique references public.maquinaria(id),
  activo             boolean not null default true,
  orden              smallint not null default 100,
  tanques_permitidos bigint[],
  creado_por         uuid references auth.users(id) default auth.uid(),
  creado_en          timestamptz not null default now(),
  constraint combustible_catalogo_maquina_es_equipo check (maquina_id is null or tipo = 'equipo')
);

comment on table public.combustible_catalogos is
  'Catálogos de Combustible (Golden Touch): equipos con «¿puede surtir?» y los tanques de los que puede surtir, quién autoriza y los destinos. Un equipo con ficha en Maquinaria va atado por maquina_id.';
comment on column public.combustible_catalogos.activo is
  '«¿Puede surtir?». Apagado, el equipo no sale para surtir; lo ya registrado queda igual.';
comment on column public.combustible_catalogos.tanques_permitidos is
  'Almacenes (tanques) de los que este equipo puede surtir. Nulo o vacío: de todos.';

-- Los acentos y las mayúsculas no hacen dos valores distintos («MARÍA» y
-- «Maria» son el mismo). Las máquinas quedan fuera: hay dos «CAMION
-- ARTICULADO» con fichas distintas, y a esas las separa su maquina_id.
create unique index if not exists combustible_catalogos_valor_unico
  on public.combustible_catalogos (tipo, private.en_mayuscula(btrim(valor)))
  where maquina_id is null;

create table if not exists public.combustible_cubicaciones (
  id                bigint generated always as identity primary key,
  almacen_id        bigint not null references public.almacenes(id),
  fecha             date not null default ((now() at time zone 'America/Caracas')::date),
  altura_cm         numeric not null check (altura_cm >= 0),
  litros_cubicacion numeric not null check (litros_cubicacion >= 0),
  saldo_libros      numeric not null,
  diferencia        numeric generated always as (litros_cubicacion - saldo_libros) stored,
  notas             text,
  creado_por        uuid references auth.users(id) default auth.uid(),
  creado_en         timestamptz not null default now()
);

comment on table public.combustible_cubicaciones is
  'Mediciones con la varilla: la altura, los litros que da la geometría del tanque (calculados en la base) y el saldo del libro en ese momento.';

create index if not exists combustible_cubicaciones_almacen_idx on public.combustible_cubicaciones (almacen_id, fecha desc);

create table if not exists public.combustible_conciliaciones (
  id                   bigint generated always as identity primary key,
  almacen_id           bigint not null references public.almacenes(id),
  periodo              text,
  desde                date,
  hasta                date not null default ((now() at time zone 'America/Caracas')::date),
  fecha                date not null default ((now() at time zone 'America/Caracas')::date),
  saldo_libros         numeric not null,
  saldo_reportado_mina numeric not null,
  diferencia           numeric generated always as (saldo_reportado_mina - saldo_libros) stored,
  saldo_cubicacion     numeric,
  dif_cubicacion       numeric generated always as (saldo_cubicacion - saldo_libros) stored,
  notas                text,
  creado_por           uuid references auth.users(id) default auth.uid(),
  creado_en            timestamptz not null default now(),
  constraint combustible_conciliacion_rango check (desde is null or desde <= hasta)
);

comment on table public.combustible_conciliaciones is
  'Libro contra lo que reporta la mina (y contra la cubicación) al cierre de un período. El saldo del libro lo calcula la base al guardar.';

create index if not exists combustible_conciliaciones_almacen_idx on public.combustible_conciliaciones (almacen_id, hasta desc);

-- Solo lectura desde fuera: todo se escribe por funciones de la base.
do $rls$
declare
  t text;
begin
  foreach t in array array[
    'combustible_tanques', 'combustible_mov_datos', 'combustible_catalogos',
    'combustible_cubicaciones', 'combustible_conciliaciones'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_lectura', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.tiene_permiso(''COMBUSTIBLE'', ''LECTURA'')))',
      t || '_lectura', t);
    execute format('revoke all on public.%I from anon, public, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop trigger if exists trg_auditar on public.%I', t);
  end loop;
end
$rls$;

create trigger trg_auditar after insert or update or delete on public.combustible_tanques
  for each row execute function private.auditar('almacen_id');
create trigger trg_auditar after insert or update or delete on public.combustible_mov_datos
  for each row execute function private.auditar('movimiento_id');
create trigger trg_auditar after insert or update or delete on public.combustible_catalogos
  for each row execute function private.auditar('id');
create trigger trg_auditar after insert or update or delete on public.combustible_cubicaciones
  for each row execute function private.auditar('id');
create trigger trg_auditar after insert or update or delete on public.combustible_conciliaciones
  for each row execute function private.auditar('id');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Relleno: los tanques de hoy y las máquinas como equipos
-- ═══════════════════════════════════════════════════════════════════════════

-- Todos los almacenes de tipo COMBUSTIBLE pasan a tener ficha de tanque. Hoy son
-- CMB-TAN (el que recibe las compras) y CMB-INI (el combustible inicial sin
-- costo). No se inventan medidas: la geometría queda vacía hasta que alguien la
-- escriba, y con ella vacía la cubicación no calcula.
insert into public.combustible_tanques (almacen_id, orden, creado_por)
select a.id,
       case a.codigo when 'CMB-TAN' then 10 when 'CMB-INI' then 20 else 100 end,
       null
  from public.almacenes a
 where a.tipo = 'COMBUSTIBLE'
on conflict (almacen_id) do nothing;

-- Las 17 máquinas como equipos del catálogo, todas con «¿puede surtir?»
-- encendido: hoy el vale no mira el estado de la máquina y apagar alguna aquí
-- quitaría algo que hoy se hace. Quien decide cuáles se apagan es la dueña,
-- desde Catálogos.
insert into public.combustible_catalogos (tipo, valor, maquina_id, activo, orden, creado_por)
select 'equipo', m.nombre, m.id, m.estado <> 'DESINCORPORADA', 100, null
  from public.maquinaria m
 where not exists (select 1 from public.combustible_catalogos c where c.maquina_id = m.id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Vistas
-- ═══════════════════════════════════════════════════════════════════════════

/*
  EL LIBRO DEL TANQUE.

  Una fila por movimiento de inventario en un almacén de tipo COMBUSTIBLE —ni
  una más ni una menos: la comprobación del final lo exige—, con el tipo dicho
  como lo dice Golden Touch:

    entrada   ENTRADA_COMPRA, ENTRADA_DIRECTA, ENTRADA_PRODUCCION,
              TRANSFERENCIA_ENTRADA, AJUSTE_POSITIVO, CAMBIO_DUENO_ENTRADA
    uso       SALIDA_CONSUMO, SALIDA_DESPACHO, SALIDA_INTERCAMBIO
              (el surtido a un bidón también: no hay traslado)
    traslado  TRANSFERENCIA_SALIDA, CAMBIO_DUENO_SALIDA
    retorno   ENTRADA_DEVOLUCION
    merma     SALIDA_MERMA, SALIDA_BAJA, AJUSTE_NEGATIVO
    reverso   REVERSO (la anulación o la corrección de otro)
    ajuste    AJUSTE_COSTO

  `anulado` dice si el movimiento tiene un REVERSO: la pantalla lo tacha y no
  lo borra. El saldo corrido (litros y dólares) sale de una ventana por tanque
  y combustible, en el orden fecha → hora → número, e incluye los reversos: por
  eso la última fila de cada tanque es su existencia.

  VISTA DEFINIDORA, CON PUERTA. `inventario_movimientos` exige INVENTARIO:LECTURA
  y el libro de combustible tiene que verlo quien ve Combustible. La vista corre
  con los permisos de su dueño y filtra ella misma por COMBUSTIBLE:LECTURA; el
  dinero sale solo con INVENTARIO.VER_VALORACION, igual que en `v_existencias`.
  Solo llama funciones que `authenticated` ya puede ejecutar.
*/
create or replace view public.v_combustible_libro
with (security_invoker = off) as
with base as (
  select m.*,
         a.nombre           as tanque,
         a.admite_sin_costo as sin_costo,
         art.nombre         as articulo,
         md.hora            as md_hora,
         md.maquina_id      as md_maquina_id,
         md.despacho_id     as md_despacho_id,
         md.equipo          as md_equipo,
         md.autorizado, md.ubicacion, md.observacion as md_observacion,
         md.contador_ini, md.contador_fin, md.horometro_ini, md.horometro_fin as md_horometro_fin,
         md.km, md.cuaderno, md.cuaderno_litros, md.destino_almacen_id,
         md.merma_de_mov_id, md.merma_motivo, md.merma_fuera_de_margen
    from public.inventario_movimientos m
    join public.almacenes a   on a.id = m.almacen_id and a.tipo = 'COMBUSTIBLE'
    join public.articulos art on art.id = m.articulo_id
    left join public.combustible_mov_datos md on md.movimiento_id = m.id
   where (select private.tiene_permiso('COMBUSTIBLE', 'LECTURA'))
),
con_vale as (
  select b.*,
         d.id as d_id, d.numero as d_numero, d.hora as d_hora, d.maquina_id as d_maquina_id,
         d.destino as d_destino, d.horometro as d_horometro, d.recibio_nombre, d.motivo as d_motivo,
         d.motivo_detalle as d_motivo_detalle, d.nota as d_nota
    from base b
    left join lateral (
      select d.*
        from public.despachos_combustible d
       where d.id = b.md_despacho_id or d.movimiento_id = b.id
       order by (d.id = b.md_despacho_id) desc, d.id
       limit 1
    ) d on true
)
select
  v.id,
  v.numero,
  v.almacen_id                                   as tanque_id,
  v.tanque,
  v.articulo_id,
  v.articulo,
  v.unidad,
  v.fecha,
  coalesce(v.md_hora, v.d_hora)                  as hora,
  case
    when v.tipo in ('ENTRADA_COMPRA', 'ENTRADA_DIRECTA', 'ENTRADA_PRODUCCION', 'TRANSFERENCIA_ENTRADA',
                    'AJUSTE_POSITIVO', 'CAMBIO_DUENO_ENTRADA') then 'entrada'
    when v.tipo in ('SALIDA_CONSUMO', 'SALIDA_DESPACHO', 'SALIDA_INTERCAMBIO') then 'uso'
    when v.tipo in ('TRANSFERENCIA_SALIDA', 'CAMBIO_DUENO_SALIDA') then 'traslado'
    when v.tipo = 'ENTRADA_DEVOLUCION' then 'retorno'
    when v.tipo in ('SALIDA_MERMA', 'SALIDA_BAJA', 'AJUSTE_NEGATIVO') then 'merma'
    when v.tipo = 'REVERSO' then 'reverso'
    else 'ajuste'
  end                                            as tipo,
  v.tipo                                         as tipo_inventario,
  v.signo,
  v.cantidad                                     as litros,
  case when (select private.puede_accion('INVENTARIO.VER_VALORACION')) then v.costo_usd end  as tasa_usd_litro,
  case when (select private.puede_accion('INVENTARIO.VER_VALORACION')) then v.valor_usd end  as monto_usd,
  sum(v.cantidad * v.signo) over w               as saldo_litros,
  case when (select private.puede_accion('INVENTARIO.VER_VALORACION'))
       then sum(v.valor_usd * v.signo) over w end as saldo_usd,
  v.sin_costo,
  coalesce(v.md_equipo, mq.nombre, v.d_destino, dest.nombre) as equipo,
  coalesce(v.md_maquina_id, v.d_maquina_id)      as maquina_id,
  mq.codigo                                      as maquina_codigo,
  mq.clase                                       as maquina_clase,
  v.autorizado                                   as autorizado_por,
  v.ubicacion,
  coalesce(v.md_observacion, v.d_nota, v.nota)   as observacion,
  v.nota,
  v.contador_ini                                 as contador_global_ini,
  v.contador_fin                                 as contador_global_fin,
  v.contador_fin - v.contador_ini                as contador_global_dif,
  v.horometro_ini,
  coalesce(v.md_horometro_fin, v.d_horometro)    as horometro_fin,
  coalesce(v.md_horometro_fin, v.d_horometro) - v.horometro_ini as horas_utilizadas,
  v.km                                           as kilometraje,
  coalesce(v.cuaderno, false)                    as registrado_en_cuaderno,
  v.cuaderno_litros,
  v.d_id                                         as despacho_id,
  v.d_numero                                     as vale_numero,
  v.d_motivo                                     as motivo,
  v.d_motivo_detalle                             as motivo_detalle,
  v.recibio_nombre                               as recibio,
  coalesce(par.almacen_id, v.destino_almacen_id) as tanque_destino_id,
  coalesce(par_a.nombre, dest.nombre)            as tanque_destino,
  par.id                                         as mov_vinculado_id,
  v.merma_de_mov_id                              as merma_de_id,
  v.merma_motivo,
  coalesce(v.merma_fuera_de_margen, false)       as merma_fuera_de_margen,
  (rev.id is not null)                           as anulado,
  rev.id                                         as anulado_por_id,
  rev.nota                                       as anulado_motivo,
  case when v.tipo = 'REVERSO' then v.movimiento_origen end as anula_a,
  v.registrado_en,
  v.registrado_por,
  pf.nombre                                      as actor_name
from con_vale v
left join public.maquinaria mq on mq.id = coalesce(v.md_maquina_id, v.d_maquina_id)
left join public.almacenes dest on dest.id = v.destino_almacen_id
left join lateral (
  select p.id, p.almacen_id
    from public.inventario_movimientos p
   where (v.tipo = 'TRANSFERENCIA_SALIDA' and p.movimiento_origen = v.id and p.tipo = 'TRANSFERENCIA_ENTRADA')
      or (v.tipo = 'TRANSFERENCIA_ENTRADA' and p.id = v.movimiento_origen and p.tipo = 'TRANSFERENCIA_SALIDA')
   order by p.id
   limit 1
) par on true
left join public.almacenes par_a on par_a.id = par.almacen_id
left join lateral (
  select r.id, r.nota
    from public.inventario_movimientos r
   where r.movimiento_origen = v.id and r.tipo = 'REVERSO'
   order by r.id
   limit 1
) rev on true
left join public.perfiles pf on pf.id = v.registrado_por
window w as (
  partition by v.almacen_id, v.articulo_id
  order by v.fecha,
           coalesce(v.md_hora, v.d_hora,
                    case when (v.registrado_en at time zone 'America/Caracas')::date = v.fecha
                         then (v.registrado_en at time zone 'America/Caracas')::time end,
                    time '00:00'),
           v.id
  rows between unbounded preceding and current row
);

comment on view public.v_combustible_libro is
  'El libro mayor de cada tanque como en Golden Touch, sobre inventario_movimientos: tipo (entrada/uso/traslado/retorno/merma/reverso/ajuste), datos del movimiento, vale, par del traslado, anulación y saldo corrido. Exige COMBUSTIBLE:LECTURA; el dinero, INVENTARIO.VER_VALORACION.';

revoke all on public.v_combustible_libro from anon, public;
grant select on public.v_combustible_libro to authenticated;

/*
  LOS TANQUES, CON SU SALDO.

  Una fila por tanque y combustible que haya pasado por él; un tanque sin
  movimientos sale con el combustible del catálogo de menor id, para que se vea
  en la grilla aunque esté vacío. Los totales de la tarjeta («↓ entradas · ⛽ uso
  · ↔ traslados») cuentan lo vivo: lo anulado y sus reversos no suman.
*/
create or replace view public.v_combustible_tanques
with (security_invoker = off) as
with pares as (
  select m.almacen_id, m.articulo_id
    from public.inventario_movimientos m
    join public.almacenes a on a.id = m.almacen_id and a.tipo = 'COMBUSTIBLE'
   group by m.almacen_id, m.articulo_id
  union
  select a.id, (select ar.id from public.articulos ar
                 where ar.categoria = 'COMBUSTIBLE' and ar.activo order by ar.id limit 1)
    from public.almacenes a
   where a.tipo = 'COMBUSTIBLE'
     and not exists (select 1 from public.inventario_movimientos m where m.almacen_id = a.id)
),
sumas as (
  select m.almacen_id, m.articulo_id,
         sum(m.cantidad * m.signo)                                   as litros,
         sum(m.valor_usd * m.signo)                                  as valor,
         sum(m.cantidad * m.signo) filter (where m.costo_usd is not null) as litros_valorados,
         count(*)                                                    as movimientos,
         max(m.fecha)                                                as ultimo_movimiento,
         sum(m.cantidad) filter (where m.tipo in ('ENTRADA_COMPRA', 'ENTRADA_DIRECTA', 'ENTRADA_PRODUCCION',
                                                  'TRANSFERENCIA_ENTRADA', 'ENTRADA_DEVOLUCION')
                                   and not exists (select 1 from public.inventario_movimientos r
                                                    where r.movimiento_origen = m.id and r.tipo = 'REVERSO')) as entradas_litros,
         sum(m.cantidad) filter (where m.tipo in ('SALIDA_CONSUMO', 'SALIDA_DESPACHO')
                                   and not exists (select 1 from public.inventario_movimientos r
                                                    where r.movimiento_origen = m.id and r.tipo = 'REVERSO')) as usos_litros,
         sum(m.cantidad) filter (where m.tipo = 'TRANSFERENCIA_SALIDA'
                                   and not exists (select 1 from public.inventario_movimientos r
                                                    where r.movimiento_origen = m.id and r.tipo = 'REVERSO')) as traslados_litros,
         sum(m.cantidad) filter (where m.tipo in ('SALIDA_MERMA', 'SALIDA_BAJA')
                                   and not exists (select 1 from public.inventario_movimientos r
                                                    where r.movimiento_origen = m.id and r.tipo = 'REVERSO')) as mermas_litros
    from public.inventario_movimientos m
    join public.almacenes a on a.id = m.almacen_id and a.tipo = 'COMBUSTIBLE'
   group by m.almacen_id, m.articulo_id
)
select
  a.id                                   as almacen_id,
  a.codigo,
  a.nombre,
  a.ubicacion,
  a.activo,
  a.recibe_compras,
  a.admite_sin_costo                     as sin_costo,
  a.propietario,
  a.capacidad                            as capacidad_litros,
  coalesce(t.tipo_geometria, 'rectangular') as tipo_geometria,
  coalesce(t.es_movil, false)            as es_movil,
  coalesce(t.es_bidon, false)            as es_bidon,
  t.radio_m, t.largo_m, t.ancho_m, t.alto_m,
  t.capacidad_calculada_litros,
  coalesce(t.margen_merma_pct, 10)       as margen_merma_pct,
  coalesce(t.merma_implicita_pct, 0.5)   as merma_implicita_pct,
  coalesce(t.orden, 100)                 as orden,
  ar.id                                  as articulo_id,
  ar.codigo                              as articulo_codigo,
  ar.nombre                              as articulo,
  ar.unidad,
  ar.stock_minimo,
  coalesce(s.litros, 0)                  as saldo_litros,
  case when (select private.puede_accion('INVENTARIO.VER_VALORACION')) then coalesce(s.valor, 0) end as saldo_usd,
  case when (select private.puede_accion('INVENTARIO.VER_VALORACION'))
       then case when coalesce(s.litros_valorados, 0) > 0 then round(s.valor / s.litros_valorados, 6) end
  end                                    as tasa_usd_litro,
  case when a.capacidad is null or a.capacidad <= 0 then null
       else round(coalesce(s.litros, 0) * 100 / a.capacidad, 1) end as lleno_pct,
  coalesce(s.entradas_litros, 0)         as entradas_litros,
  coalesce(s.usos_litros, 0)             as usos_litros,
  coalesce(s.traslados_litros, 0)        as traslados_litros,
  coalesce(s.mermas_litros, 0)           as mermas_litros,
  coalesce(s.movimientos, 0)             as movimientos,
  s.ultimo_movimiento
from pares p
join public.almacenes a  on a.id = p.almacen_id
join public.articulos ar on ar.id = p.articulo_id
left join public.combustible_tanques t on t.almacen_id = a.id
left join sumas s on s.almacen_id = p.almacen_id and s.articulo_id = p.articulo_id
where (select private.tiene_permiso('COMBUSTIBLE', 'LECTURA'));

comment on view public.v_combustible_tanques is
  'Cada tanque (almacén de tipo COMBUSTIBLE) con su ficha de tanque, su saldo en litros, su valor y su tasa ponderada (con INVENTARIO.VER_VALORACION), y los totales vivos de entradas, usos, traslados y mermas. Exige COMBUSTIBLE:LECTURA.';

revoke all on public.v_combustible_tanques from anon, public;
grant select on public.v_combustible_tanques to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Acciones nuevas y a quién se le dan
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente, activa) values
  ('COMBUSTIBLE.ENTRADA', 'COMBUSTIBLE', 'Meter combustible a un tanque',
   'Registra lo que entra a un tanque sin orden de compra —un saldo inicial, algo comprado por fuera— y lo que vuelve a él (retorno). El costo que se escriba mueve la tasa del tanque. Si se anota lo que llegó de verdad, la diferencia queda como merma de la entrada.',
   60, 'ESCRITURA', true),
  ('COMBUSTIBLE.TRASLADO', 'COMBUSTIBLE', 'Pasar combustible de un tanque a otro',
   'Saca de un tanque y mete en otro al mismo costo, o lo pasa a un bidón, que cuenta como usado en el momento. También es la puerta para pasar al tanque el gasoil que quedó en el almacén o en el patio.',
   70, 'ESCRITURA', true),
  ('COMBUSTIBLE.CATALOGOS', 'COMBUSTIBLE', 'Cambiar los catálogos de combustible',
   'Los equipos y si pueden surtir (y de qué tanques), quién autoriza y los destinos. Apagar un equipo lo saca de la lista de quien surte, sin tocar lo ya registrado.',
   80, 'ESCRITURA', true),
  ('COMBUSTIBLE.MERMA', 'COMBUSTIBLE', 'Registrar una merma de un tanque',
   'Da por perdidos litros de un tanque —evaporación, fuga, descuadre— a su costo vigente. No los carga a ninguna máquina: se pierden.',
   90, 'TOTAL', true),
  ('COMBUSTIBLE.TANQUES', 'COMBUSTIBLE', 'Crear y corregir los tanques',
   'Nombre, capacidad, medidas para la cubicación, si es móvil o un bidón y los márgenes de merma. Un tanque con litros no se desactiva.',
   100, 'TOTAL', true),
  ('COMBUSTIBLE.MERMA_FUERA_DE_MARGEN', 'COMBUSTIBLE', 'Guardar una merma que pasa el margen del tanque',
   'Cuando lo que llegó en una entrada o un traslado se queda corto por más del margen del tanque. Hace falta escribir el motivo, y el sistema avisa a la administración.',
   110, 'TOTAL', true)
on conflict (codigo) do nothing;

/*
  QUE NADIE PIERDA LO QUE HOY HACE.

  Hoy la carga al tanque va por `registrar_entrada` y el «Pasar al tanque» por
  `transferir_existencia`, y las dos piden el rol ALMACEN, que equivale a
  INVENTARIO:ESCRITURA en la matriz (`private.equivalencia_rol`). Desde ahora
  esas dos cosas en Combustible piden COMBUSTIBLE.ENTRADA y COMBUSTIBLE.TRASLADO.

  Un rol que no es «a la medida» las tiene sin casilla si llega a ESCRITURA en
  Combustible. Pero hay roles que hoy cargan combustible con INVENTARIO:ESCRITURA
  y solo LECTURA en Combustible, y los «a la medida» solo tienen lo que está
  marcado. Por eso la casilla se marca, explícita, en todo rol con
  INVENTARIO >= ESCRITURA y COMBUSTIBLE >= LECTURA: lo que hoy hace, lo sigue
  haciendo, y en la matriz se ve por qué.

  Los catálogos son lo que hoy es «cambiar la lista de para qué se surte»: la
  casilla se marca donde está marcada COMBUSTIBLE.GUARDAR_MOTIVO.

  Las tres de nivel TOTAL (merma, tanques y merma fuera de margen) son nuevas
  —la dueña las quiere en TOTAL— y se marcan donde COMBUSTIBLE llega a TOTAL. Un
  tanque se sigue pudiendo crear desde Inventario → Almacenes como hasta hoy.
*/
insert into public.rol_acciones (rol, accion)
select rp.rol, x.accion
  from public.rol_permisos rp
  join public.rol_permisos rc on rc.rol = rp.rol and rc.modulo = 'COMBUSTIBLE'
  cross join (values ('COMBUSTIBLE.ENTRADA'), ('COMBUSTIBLE.TRASLADO')) x(accion)
 where rp.modulo = 'INVENTARIO'
   and private.rango_nivel(rp.nivel) >= private.rango_nivel('ESCRITURA')
   and private.rango_nivel(rc.nivel) >= private.rango_nivel('LECTURA')
on conflict (rol, accion) do nothing;

insert into public.rol_acciones (rol, accion)
select ra.rol, 'COMBUSTIBLE.CATALOGOS'
  from public.rol_acciones ra
 where ra.accion = 'COMBUSTIBLE.GUARDAR_MOTIVO'
on conflict (rol, accion) do nothing;

insert into public.rol_acciones (rol, accion)
select rc.rol, x.accion
  from public.rol_permisos rc
  cross join (values ('COMBUSTIBLE.MERMA'), ('COMBUSTIBLE.TANQUES'), ('COMBUSTIBLE.MERMA_FUERA_DE_MARGEN')) x(accion)
 where rc.modulo = 'COMBUSTIBLE'
   and private.rango_nivel(rc.nivel) >= private.rango_nivel('TOTAL')
on conflict (rol, accion) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Auditoría y tiempo real
-- ═══════════════════════════════════════════════════════════════════════════

do $mapa$
begin
  if to_regclass('public.auditoria_modulos') is null then
    return;
  end if;
  insert into public.auditoria_modulos (tabla, modulo) values
    ('combustible_tanques', 'COMBUSTIBLE'),
    ('combustible_mov_datos', 'COMBUSTIBLE'),
    ('combustible_catalogos', 'COMBUSTIBLE'),
    ('combustible_cubicaciones', 'COMBUSTIBLE'),
    ('combustible_conciliaciones', 'COMBUSTIBLE')
  on conflict (tabla) do update set modulo = excluded.modulo;
end
$mapa$;

do $vivo$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array[
    'combustible_tanques', 'combustible_mov_datos', 'combustible_catalogos',
    'combustible_cubicaciones', 'combustible_conciliaciones'
  ] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$vivo$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Comprobación (solo lectura)
-- ═══════════════════════════════════════════════════════════════════════════

/*
  EL LIBRO CUADRA CON LAS EXISTENCIAS, Y NO SE PERDIÓ NADA.

  Se mira con la identidad de un administrador porque las dos vistas nuevas
  tienen puerta: sin sesión no enseñan nada, y comprobar contra una vista vacía
  no comprueba. La identidad se pone solo para esta transacción.

  Siempre: la suma por tanque del libro es la de `v_existencias`, el libro tiene
  exactamente un renglón por movimiento de los tanques, y `v_despachos_combustible`
  enseña todos los vales. En la base de verdad (donde está CMB-INI con su
  historia) además: al menos los 208 movimientos y los 200 vales de hoy, CMB-INI
  con lo que dice `v_existencias` (3.569 L el 09/11/2026) y CMB-TAN igual. Se
  pide «al menos» y no «exactamente» porque entre escribir esto y aplicarlo
  alguien puede surtir: lo que no puede pasar es que haya menos.
*/
do $comprobar$
declare
  v_admin   uuid;
  v_txt     text;
  v_libro   bigint;
  v_movs    bigint;
  v_vales   bigint;
  v_vista   bigint;
  v_ini     numeric;
  v_tan     numeric;
begin
  select ur.usuario_id into v_admin
    from public.usuarios_roles ur
    join public.perfiles p on p.id = ur.usuario_id
   where ur.rol = 'ADMIN' and p.activo
   order by ur.usuario_id
   limit 1;

  if v_admin is null then
    raise notice 'Sin administrador activo: no hay con quién mirar las vistas. Se comprueba solo lo que no tiene puerta.';
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  end if;

  select count(*) into v_movs
    from public.inventario_movimientos m
    join public.almacenes a on a.id = m.almacen_id and a.tipo = 'COMBUSTIBLE';

  select count(*) into v_vales from public.despachos_combustible;
  select count(*) into v_vista from public.v_despachos_combustible;

  if v_vista <> v_vales then
    raise exception 'v_despachos_combustible enseña % vales y hay %.', v_vista, v_vales;
  end if;

  if v_admin is not null then
    select count(*) into v_libro from public.v_combustible_libro;
    if v_libro <> v_movs then
      raise exception 'El libro de combustible tiene % renglones y hay % movimientos en los tanques.', v_libro, v_movs;
    end if;

    select string_agg(format('%s: libro %s, existencias %s', x.almacen_id, x.libro, x.exist), '; ')
      into v_txt
      from (
        select coalesce(l.tanque_id, e.almacen_id) as almacen_id,
               coalesce(l.litros, 0) as libro, coalesce(e.litros, 0) as exist
          from (select tanque_id, articulo_id, sum(signo * litros) as litros
                  from public.v_combustible_libro group by 1, 2) l
          full join (select ve.almacen_id, ve.articulo_id, ve.existencia as litros
                       from public.v_existencias ve
                      where ve.almacen_tipo = 'COMBUSTIBLE') e
            on e.almacen_id = l.tanque_id and e.articulo_id = l.articulo_id
      ) x
     where x.libro <> x.exist;

    if v_txt is not null then
      raise exception 'El libro de combustible no cuadra con las existencias: %.', v_txt;
    end if;

    -- El saldo corrido de la última fila es la existencia del tanque.
    select string_agg(format('%s/%s', u.tanque_id, u.articulo_id), ', ') into v_txt
      from (
        select distinct on (tanque_id, articulo_id) tanque_id, articulo_id, saldo_litros
          from public.v_combustible_libro
         order by tanque_id, articulo_id, fecha desc,
                  coalesce(hora, time '23:59:59') desc, id desc
      ) u
      join (select almacen_id, articulo_id, existencia from public.v_existencias) e
        on e.almacen_id = u.tanque_id and e.articulo_id = u.articulo_id
     where u.saldo_litros <> e.existencia;
    if v_txt is not null then
      raise notice 'Aviso: la última fila del libro de % no coincide en orden con la existencia (revisar horas).', v_txt;
    end if;

    if exists (select 1 from public.almacenes where codigo = 'CMB-INI')
       and exists (select 1 from public.despachos_combustible) then
      if v_libro < 208 then
        raise exception 'El libro de combustible tiene % renglones; eran 208 el 09/11/2026.', v_libro;
      end if;
      if v_vista < 200 then
        raise exception 'Se ven % vales; eran 200 el 09/11/2026.', v_vista;
      end if;

      select coalesce(sum(l.signo * l.litros), 0) into v_ini
        from public.v_combustible_libro l join public.almacenes a on a.id = l.tanque_id
       where a.codigo = 'CMB-INI';
      select coalesce(sum(l.signo * l.litros), 0) into v_tan
        from public.v_combustible_libro l join public.almacenes a on a.id = l.tanque_id
       where a.codigo = 'CMB-TAN';

      if v_ini <> coalesce((select sum(e.existencia) from public.v_existencias e
                              join public.almacenes a on a.id = e.almacen_id where a.codigo = 'CMB-INI'), 0)
         or v_tan <> coalesce((select sum(e.existencia) from public.v_existencias e
                                 join public.almacenes a on a.id = e.almacen_id where a.codigo = 'CMB-TAN'), 0) then
        raise exception 'CMB-INI (%) o CMB-TAN (%) no cuadran con las existencias.', v_ini, v_tan;
      end if;

      raise notice 'Combustible: % movimientos en el libro, % vales, CMB-INI % L, CMB-TAN % L.',
        v_libro, v_vista, v_ini, v_tan;
    end if;

    if (select count(*) from public.v_combustible_tanques) < (select count(*) from public.almacenes where tipo = 'COMBUSTIBLE') then
      raise exception 'v_combustible_tanques no enseña todos los tanques.';
    end if;

    perform set_config('request.jwt.claims', '', true);
  end if;

  if exists (select 1 from public.almacenes a where a.tipo = 'COMBUSTIBLE'
              and not exists (select 1 from public.combustible_tanques t where t.almacen_id = a.id)) then
    raise exception 'Quedó un almacén de combustible sin ficha de tanque.';
  end if;

  if exists (select 1 from public.maquinaria m
              where not exists (select 1 from public.combustible_catalogos c where c.maquina_id = m.id)) then
    raise exception 'Quedó una máquina fuera del catálogo de combustible.';
  end if;
end
$comprobar$;
