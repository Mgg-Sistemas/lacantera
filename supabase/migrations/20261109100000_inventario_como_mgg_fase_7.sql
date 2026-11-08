/*
  ALMACÉN E INVENTARIO COMO MGG · FASE 7: AVISOS Y PUESTA EN MARCHA (08/11/2026)

  Todo es aditivo: una tabla nueva (la memoria de los avisos), dos funciones
  nuevas en `private`, un trabajo de pg_cron y una tabla más en el tiempo real.
  No se toca ninguna función que ya exista ni ningún dato.

  1. LOS AVISOS DE STOCK EN LA CAMPANA, COMO MGG.

     MGG corre `scanStockAndNotify()` desde el navegador (como mucho cada 30
     minutos, solo si quien entra tiene inventario) y deja en la campana
     «⚠ Stock crítico» o «Reabastecimiento requerido» por producto, sin repetir
     mientras el aviso anterior siga sin leer (`dedup_key`).

     Aquí se hace en la base, cada 30 minutos con pg_cron, que ya está activo
     en el proyecto (lo usan la tasa del día, las asignaciones vencidas, la
     dotación y las notas de entrega vencidas). Se eligió pg_cron y no un
     disparador sobre `inventario_movimientos` porque el estado de un artículo
     no lo cambia solo un movimiento: también el stock mínimo, desactivarlo y,
     sobre todo, la clase ABC, que depende del valor de TODO el inventario (una
     compra grande de otro artículo puede pasar a uno de A a B y cambiarle el
     umbral). Un disparador por movimiento tendría que recalcular el catálogo
     entero en cada entrada o salida, dentro de la transacción de quien
     registra. Tampoco se dispara al abrir la pantalla: así el aviso llega
     aunque nadie abra inventario, que es justo cuando hace falta.

     LA REGLA ES LA DE `src/pages/inventario/restock.ts` (fase 2), con la
     pantalla sin filtros (todos los almacenes, todos los dueños):
       - Entran los artículos activos e inventariables, menos la categoría
         COMBUSTIBLE. Los almacenes COMBUSTIBLE y TRANSITO no cuentan, y el
         artículo que solo vive ahí no entra (combustible no se toca).
       - Stock = lo PROPIO (dueño «de la casa»): «bajo el mínimo» es señal de
         compra y solo se compra lo propio. Si todo lo que hay es ajeno, no se
         alerta.
       - ABC por valor (Pareto sobre el valor de cada artículo): acumulado
         ≤ 80 % → A, ≤ 95 % → B, el resto y lo que no tiene valor → C. El valor
         de un almacén solo suma si allí la existencia es positiva, como en la
         pantalla.
       - Umbral = ceil(mínimo × % de la clase) con A 120 %, B 100 %, C 80 %.
       - Crítico: stock < mínimo. Reabastecer: stock ≤ umbral y no crítico.
         Sin mínimo (0) no se alerta.
     Diferencias que quedan: la pantalla ordena los empates de valor por su
     propio orden y aquí por id (solo cambia la clase de un artículo que cae
     justo en el borde, con el mismo valor que otro), y la pantalla de quien no
     tiene INVENTARIO.VER_VALORACION pone todo en C, mientras que el aviso usa
     siempre el valor real.

     SIN DUPLICAR. `inventario_avisos_stock` guarda, por artículo, el último
     estado avisado. Se avisa cuando un artículo entra en crítico o en
     reabastecer, o cuando pasa de uno al otro; mientras siga igual no se
     repite. Cuando sale de la alerta (se repuso, se bajó el mínimo, se
     desactivó) la fila se borra, y si vuelve a caer se avisa de nuevo. La
     lectura de la campana es por persona, así que no sirve el «mientras no
     esté leído» de MGG: aquí manda el estado del artículo.

     A QUIÉN: roles ALMACEN y COMPRAS (inventario y compras; el administrador
     ve todo). El clic lleva a `/app/inventario?trazabilidad={id}`, que abre la
     trazabilidad del artículo. Crítico va como URGENTE y reabastecer como
     ATENCION (MGG: `error` y `warning`).

  2. TIEMPO REAL. De las tablas de las pantallas nuevas (inventario_movimientos,
     solicitudes_salida, traslados, asignaciones_herramienta, articulos,
     almacenes) solo `solicitudes_salida` faltaba en la publicación
     `supabase_realtime`: la pantalla de Salidas ya la escuchaba, pero nunca
     le llegaba nada. Se agrega con el patrón de siempre.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. La memoria de los avisos: un aviso por artículo y estado
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.inventario_avisos_stock (
  articulo_id     bigint primary key references public.articulos(id) on delete cascade,
  estado          text not null check (estado in ('CRITICO', 'REABASTECER')),
  notificacion_id bigint references public.notificaciones(id) on delete set null,
  -- Lo que se vio al avisar, para poder explicar el aviso después.
  stock           numeric not null,
  minimo          numeric not null,
  umbral          numeric not null,
  clase           text not null check (clase in ('A', 'B', 'C')),
  avisado_en      timestamptz not null default now()
);

comment on table public.inventario_avisos_stock is
  'Último aviso de stock (⚠ Stock crítico / Reabastecimiento requerido) por artículo (fase 7, 08/11/2026). Mientras el estado no cambie no se repite; al salir de la alerta la fila se borra y, si vuelve a caer, se avisa otra vez. La escribe solo private.avisar_stock_critico().';

alter table public.inventario_avisos_stock enable row level security;

drop policy if exists inventario_avisos_stock_lectura on public.inventario_avisos_stock;
create policy inventario_avisos_stock_lectura on public.inventario_avisos_stock
  for select to authenticated
  using ((select private.tiene_permiso('INVENTARIO', 'LECTURA')));

revoke all on public.inventario_avisos_stock from public, anon, authenticated;
grant select on public.inventario_avisos_stock to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. El estado de cada artículo, con la regla de `restock.ts`
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function private.estado_de_stock_para_avisos()
returns table (
  articulo_id bigint,
  sku         text,
  nombre      text,
  unidad      text,
  stock       numeric,
  minimo      numeric,
  valor       numeric,
  clase       text,
  umbral      numeric,
  estado      text
)
language sql
stable
security definer
set search_path = ''
as $function$
  with
  -- La existencia por almacén y artículo, como `v_existencias`, sin los
  -- almacenes que la pantalla no mira.
  por_almacen as (
    select m.articulo_id,
           m.almacen_id,
           (al.tipo in ('COMBUSTIBLE', 'TRANSITO'))                                   as fuera,
           coalesce(sum(m.cantidad * m.signo), 0)                                     as existencia,
           coalesce(sum(m.cantidad * m.signo)
                      filter (where coalesce(prp.es_la_casa, true)), 0)              as propia,
           coalesce(sum(m.cantidad * m.signo)
                      filter (where not coalesce(prp.es_la_casa, true)), 0)          as ajena,
           sum(m.valor_usd * m.signo)                                                 as valor
      from public.inventario_movimientos m
      join public.almacenes al on al.id = m.almacen_id
      left join public.propietarios prp on prp.codigo = m.propietario
     group by m.articulo_id, m.almacen_id, al.tipo
  ),
  por_articulo as (
    select pa.articulo_id,
           bool_or(not pa.fuera)                                                     as tiene_filas,
           bool_or(pa.fuera)                                                         as toca_fuera,
           coalesce(sum(pa.propia) filter (where not pa.fuera), 0)                   as propia,
           coalesce(sum(pa.ajena)  filter (where not pa.fuera), 0)                   as ajena,
           -- Como la pantalla: el valor de un almacén solo cuenta si allí hay
           -- existencia positiva.
           coalesce(sum(pa.valor)  filter (where not pa.fuera and pa.existencia > 0), 0) as valor
      from por_almacen pa
     group by pa.articulo_id
  ),
  base as (
    select a.id                                   as articulo_id,
           a.codigo                               as sku,
           a.nombre,
           a.unidad,
           coalesce(pa.propia, 0)                 as stock,
           case
             -- Todo lo que hay es ajeno: no se alerta (mínimo 0).
             when coalesce(pa.propia, 0) = 0 and coalesce(pa.ajena, 0) > 0 then 0
             else coalesce(a.stock_minimo, 0)
           end                                    as minimo,
           greatest(coalesce(pa.valor, 0), 0)     as valor
      from public.articulos a
      left join por_articulo pa on pa.articulo_id = a.id
     where a.activo
       and a.inventariable
       and a.categoria <> 'COMBUSTIBLE'
       -- El artículo que solo vive en el tanque o en tránsito no entra.
       and not (coalesce(pa.tiene_filas, false) = false and coalesce(pa.toca_fuera, false))
  ),
  -- ABC por valor (Pareto), igual que `classifyABC`.
  abc as (
    select b.*,
           case
             when b.valor <= 0 then 'C'
             when sum(b.valor) over (order by b.valor desc, b.articulo_id
                                     rows between unbounded preceding and current row)
                  / nullif(sum(b.valor) over (), 0) <= 0.8  then 'A'
             when sum(b.valor) over (order by b.valor desc, b.articulo_id
                                     rows between unbounded preceding and current row)
                  / nullif(sum(b.valor) over (), 0) <= 0.95 then 'B'
             else 'C'
           end as clase
      from base b
  ),
  con_umbral as (
    select x.*,
           ceil(x.minimo * (case x.clase when 'A' then 120 when 'B' then 100 else 80 end) / 100.0) as umbral
      from abc x
  )
  select c.articulo_id, c.sku, c.nombre, c.unidad, c.stock, c.minimo, c.valor, c.clase, c.umbral,
         case
           when c.minimo > 0 and c.stock <  c.minimo then 'CRITICO'
           when c.minimo > 0 and c.stock <= c.umbral then 'REABASTECER'
           else 'OK'
         end as estado
    from con_umbral c;
$function$;

comment on function private.estado_de_stock_para_avisos() is
  'Clase ABC, umbral y estado (CRITICO / REABASTECER / OK) de cada artículo activo, con la regla de restock.ts (fase 7, 08/11/2026): stock propio, sin almacenes COMBUSTIBLE ni TRANSITO ni la categoría COMBUSTIBLE, A 120 % · B 100 % · C 80 % del mínimo.';

revoke all on function private.estado_de_stock_para_avisos() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. El aviso a la campana (lo que hace `scanStockAndNotify` de MGG)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function private.avisar_stock_critico()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_fila    record;
  v_notif   bigint;
  v_cuantos integer := 0;
  v_stock   text;
  v_minimo  text;
  v_umbral  text;
begin
  -- Dos corridas a la vez (el cron y una prueba a mano) avisarían dos veces.
  perform pg_advisory_xact_lock(hashtext('private.avisar_stock_critico'));

  create temporary table if not exists pg_temp.estado_stock_ahora (
    articulo_id bigint primary key,
    sku text, nombre text, unidad text,
    stock numeric, minimo numeric, umbral numeric, clase text, estado text
  ) on commit drop;
  truncate pg_temp.estado_stock_ahora;

  insert into pg_temp.estado_stock_ahora
  select e.articulo_id, e.sku, e.nombre, e.unidad, e.stock, e.minimo, e.umbral, e.clase, e.estado
    from private.estado_de_stock_para_avisos() e
   where e.estado <> 'OK';

  -- Lo que salió de la alerta (o ya no se mira): se olvida, para que si vuelve
  -- a caer se avise otra vez.
  delete from public.inventario_avisos_stock s
   where not exists (select 1 from pg_temp.estado_stock_ahora e where e.articulo_id = s.articulo_id);

  for v_fila in
    select e.*
      from pg_temp.estado_stock_ahora e
      left join public.inventario_avisos_stock s on s.articulo_id = e.articulo_id
     where s.articulo_id is null or s.estado <> e.estado
     order by e.estado, e.nombre
  loop
    v_stock  := private.numero_es(v_fila.stock,  case when v_fila.stock  = trunc(v_fila.stock)  then 0 else 2 end);
    v_minimo := private.numero_es(v_fila.minimo, case when v_fila.minimo = trunc(v_fila.minimo) then 0 else 2 end);
    v_umbral := private.numero_es(v_fila.umbral, 0);

    if v_fila.estado = 'CRITICO' then
      v_notif := private.notificar(
        'INVENTARIO', 'STOCK_CRITICO',
        '⚠ Stock crítico',
        format('%s · %s: stock %s %s POR DEBAJO del mínimo (%s %s)',
               v_fila.sku, v_fila.nombre, v_stock, v_fila.unidad, v_minimo, v_fila.unidad),
        '/app/inventario?trazabilidad=' || v_fila.articulo_id,
        array['ALMACEN', 'COMPRAS'], 'URGENTE');
    else
      v_notif := private.notificar(
        'INVENTARIO', 'STOCK_REABASTECER',
        'Reabastecimiento requerido',
        format('%s · %s: stock %s %s ≤ umbral %s %s (clase %s)',
               v_fila.sku, v_fila.nombre, v_stock, v_fila.unidad, v_umbral, v_fila.unidad, v_fila.clase),
        '/app/inventario?trazabilidad=' || v_fila.articulo_id,
        array['ALMACEN', 'COMPRAS'], 'ATENCION');
    end if;

    insert into public.inventario_avisos_stock
      (articulo_id, estado, notificacion_id, stock, minimo, umbral, clase, avisado_en)
    values
      (v_fila.articulo_id, v_fila.estado, v_notif, v_fila.stock, v_fila.minimo, v_fila.umbral, v_fila.clase, now())
    on conflict (articulo_id) do update
      set estado          = excluded.estado,
          notificacion_id = excluded.notificacion_id,
          stock           = excluded.stock,
          minimo          = excluded.minimo,
          umbral          = excluded.umbral,
          clase           = excluded.clase,
          avisado_en      = excluded.avisado_en;

    v_cuantos := v_cuantos + 1;
  end loop;

  return v_cuantos;
end;
$function$;

comment on function private.avisar_stock_critico() is
  'Deja en la campana «⚠ Stock crítico» / «Reabastecimiento requerido» (roles ALMACEN y COMPRAS) por cada artículo que entró en alerta o cambió de estado desde el último aviso (fase 7, 08/11/2026). La llama pg_cron cada 30 minutos. Devuelve cuántos avisos dejó.';

revoke all on function private.avisar_stock_critico() from public, anon, authenticated;

-- Cada 30 minutos, como MGG.
select cron.unschedule('inventario-stock-critico')
 where exists (select 1 from cron.job where jobname = 'inventario-stock-critico');

select cron.schedule('inventario-stock-critico', '*/30 * * * *',
                     'select private.avisar_stock_critico()');

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Tiempo real de las pantallas nuevas
-- ═══════════════════════════════════════════════════════════════════════════

do $vivo$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'No existe la publicación supabase_realtime: se omite.';
    return;
  end if;
  foreach t in array array[
    'inventario_movimientos', 'solicitudes_salida', 'traslados',
    'asignaciones_herramienta', 'articulos', 'almacenes'
  ] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$vivo$;
