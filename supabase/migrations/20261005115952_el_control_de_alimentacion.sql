-- ═══════════════════════════════════════════════════════════════════════════
-- EL CONTROL DE ALIMENTACIÓN
--
-- Christopher, 05/10/2026: «como lo manejan en MGG te lo traes para La
-- Cantera». En MGG el módulo se llama «cocina» y hace una cosa concreta que
-- aquí no existía: registrar cada comida servida al personal —desayuno,
-- almuerzo o cena— con cuántas personas comieron y qué víveres se gastaron,
-- descontando esos víveres del inventario al costo promedio. De ahí sale el
-- número que justifica el módulo: EL COSTO POR PLATO.
--
-- SE TRAE LA IDEA, NO EL CÓDIGO. MGG edita y borra comidas a mano y deja la
-- reja abierta a cualquier usuario; aquí rige el perímetro de la casa: todo
-- por RPC con permiso, el libro de inventario no se toca —se reversa—, y una
-- comida no se borra: SE ANULA con motivo y queda a la vista. Tampoco se trae
-- (todavía) su analítica de ciclos de mercado y lote de reorden: primero que
-- la cocina registre comidas un mes; esa pieza se decide con datos delante.
--
-- LO QUE MGG RESOLVÍA CON UN «VALE A COCINA», AQUÍ YA LO RESUELVEN LOS
-- TRASLADOS. En MGG, lo que el almacén manda a la cocina no descuenta, para no
-- descontar dos veces cuando la cocina sirve. La Cantera no necesita ese
-- artefacto: los víveres se TRASLADAN al almacén de la cocina —un traslado no
-- pierde existencia— y la comida descuenta de ahí al servir. Una sola resta,
-- con las piezas que ya había.
--
-- LOS VÍVERES SON UNA CATEGORÍA NUEVA, y añadirla es barato por la misma razón
-- que lo fue EQUIPO (20260909130000): solo clasifica. Las cuatro decisiones
-- que una categoría obliga a tomar:
--
--     cómo se llama en la lista .... «Víveres»
--     qué prefijo lleva su código .. VIV (VIV-0001, VIV-0002…)
--     a qué clase de gasto cae ..... ALIMENTACION, que ya existía como raíz
--     qué conducta especial tiene .. ninguna fuera de este módulo: solo este
--                                    módulo la consume, igual que COMBUSTIBLE
--                                    es el único que despacha de los tanques
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. El módulo, con su permiso propio
--
-- LECTURA ve las comidas y el costo por plato. ESCRITURA sirve comidas y anula
-- las de HOY (el cocinero corrige su error del día). TOTAL anula cualquiera.
-- ───────────────────────────────────────────────────────────────────────────
insert into public.modulos (codigo, nombre, descripcion, orden) values
  ('ALIMENTACION', 'Alimentación',
   'Las comidas servidas al personal: cuántos platos, qué víveres se gastaron y cuánto costó cada plato.',
   66)
on conflict (codigo) do update
  set nombre = excluded.nombre, descripcion = excluded.descripcion, orden = excluded.orden;

insert into public.rol_permisos (rol, modulo, nivel)
select r.codigo, 'ALIMENTACION', case when r.codigo = 'ADMIN' then 'TOTAL' else 'NINGUNO' end
from public.roles r
on conflict (rol, modulo) do nothing;

-- La casilla del teléfono, con `nivel_equivalente` en NULO por lo mismo que la
-- del surtidor (20261005105213): se presta a mano a quien cocina, y a nadie
-- se le regala por su nivel.
insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente)
values
  ('ALIMENTACION.COCINA_TELEFONO', 'ALIMENTACION',
   'Entrar directo a la cocina del teléfono',
   'Quien la tiene aterriza en la pantalla de servir comidas del teléfono nada '
   'más entrar, en vez de en el tablero. Es para quien cocina. No da permiso '
   'de nada por sí sola: para servir sigue haciendo falta escritura en '
   'Alimentación.',
   10, null)
on conflict (codigo) do update
   set modulo = excluded.modulo, nombre = excluded.nombre, dice = excluded.dice,
       orden = excluded.orden, nivel_equivalente = excluded.nivel_equivalente;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Las comidas y sus renglones
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.comidas (
  id               bigint generated always as identity primary key,
  numero           text not null unique,
  -- El día en que se sirvió, en Caracas. La hora exacta queda en servida_en.
  fecha            date not null,
  tipo             text not null check (tipo in ('DESAYUNO', 'ALMUERZO', 'CENA')),
  platos           integer not null check (platos > 0),
  -- De qué almacén salieron los víveres. Uno por comida, como el tanque en un
  -- vale de combustible: una comida que saca de dos sitios son dos comidas.
  almacen_id       bigint not null references public.almacenes(id),
  -- La suma de sus renglones al costo promedio del momento. Congelada aquí
  -- para que el costo por plato de ayer no cambie con las compras de mañana.
  valor_usd        numeric(14,2) not null default 0,
  origen           text not null default 'PC' check (origen in ('PC', 'TELEFONO')),
  nota             text,
  servida_por      uuid references auth.users(id),
  servida_en       timestamptz not null default now(),
  anulada_en       timestamptz,
  anulada_por      uuid references auth.users(id),
  motivo_anulacion text
);

comment on table public.comidas is
  'Una fila por comida servida: desayuno, almuerzo o cena, con sus platos y su valor. Se anula, no se borra.';

create table if not exists public.comida_renglones (
  id            bigint generated always as identity primary key,
  comida_id     bigint not null references public.comidas(id),
  articulo_id   bigint not null references public.articulos(id),
  cantidad      numeric(14,4) not null check (cantidad > 0),
  -- El costo promedio POR UNIDAD al momento de servir, congelado.
  costo_usd     numeric(20,6) not null default 0,
  -- El asiento del libro de inventario que esta línea descontó.
  movimiento_id bigint references public.inventario_movimientos(id),
  constraint comida_un_viver_por_linea unique (comida_id, articulo_id)
);

create index if not exists comidas_por_fecha on public.comidas (fecha, tipo);
create index if not exists comida_renglones_por_comida on public.comida_renglones (comida_id);

alter table public.comidas enable row level security;
alter table public.comida_renglones enable row level security;

drop policy if exists comidas_lectura on public.comidas;
create policy comidas_lectura on public.comidas
  for select to authenticated using (private.tiene_permiso('ALIMENTACION', 'LECTURA'));
drop policy if exists comida_renglones_lectura on public.comida_renglones;
create policy comida_renglones_lectura on public.comida_renglones
  for select to authenticated using (private.tiene_permiso('ALIMENTACION', 'LECTURA'));

revoke all on public.comidas from anon, authenticated;
revoke all on public.comida_renglones from anon, authenticated;
grant select on public.comidas to authenticated;
grant select on public.comida_renglones to authenticated;

drop trigger if exists trg_auditar on public.comidas;
create trigger trg_auditar after insert or update or delete on public.comidas
  for each row execute function private.auditar('id');
drop trigger if exists trg_auditar on public.comida_renglones;
create trigger trg_auditar after insert or update or delete on public.comida_renglones
  for each row execute function private.auditar('id');
drop trigger if exists trg_normalizar on public.comidas;
create trigger trg_normalizar before insert or update on public.comidas
  for each row execute function private.normalizar_texto('nota', 'motivo_anulacion');

do $mapa$
begin
  if to_regclass('public.auditoria_modulos') is null then
    return;
  end if;
  insert into public.auditoria_modulos (tabla, modulo) values
    ('comidas', 'ALIMENTACION'), ('comida_renglones', 'ALIMENTACION')
  on conflict (tabla) do update set modulo = excluded.modulo;
end
$mapa$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. La vista: cada comida con sus renglones puestos
-- ───────────────────────────────────────────────────────────────────────────
create or replace view public.v_comidas
with (security_invoker = on) as
select c.id, c.numero, c.fecha, c.tipo, c.platos, c.almacen_id,
       a.nombre as almacen,
       c.valor_usd,
       case when c.platos > 0 then round(c.valor_usd / c.platos, 2) end as costo_por_plato_usd,
       c.origen, c.nota,
       case when c.anulada_en is not null then 'ANULADA' else 'SERVIDA' end as estado,
       coalesce((
         select jsonb_agg(jsonb_build_object(
                  'articulo_id', r.articulo_id,
                  'articulo', art.nombre,
                  'unidad', art.unidad,
                  'cantidad', r.cantidad,
                  'costo_usd', r.costo_usd,
                  'valor_usd', round(r.cantidad * r.costo_usd, 2))
                order by art.nombre)
           from public.comida_renglones r
           join public.articulos art on art.id = r.articulo_id
          where r.comida_id = c.id), '[]'::jsonb) as renglones,
       c.servida_por, c.servida_en,
       c.anulada_en, c.anulada_por, c.motivo_anulacion
  from public.comidas c
  join public.almacenes a on a.id = c.almacen_id;

revoke all on public.v_comidas from public, anon;
grant select on public.v_comidas to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Servir una comida: los víveres salen del inventario al promedio
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.servir_comida(
  p_tipo       text,
  p_platos     integer,
  p_almacen_id bigint,
  p_renglones  jsonb,
  p_fecha      date default null,
  p_nota       text default null,
  p_origen     text default 'PC'
)
returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare
  v_fecha   date := coalesce(p_fecha, private.hoy_aqui());
  v_numero  text;
  v_id      bigint;
  v_alm     record;
  v_r       record;
  v_art     record;
  v_existe  numeric;
  v_costo   numeric;
  v_mov     bigint;
  v_valor   numeric := 0;
begin
  perform private.exigir_permiso('ALIMENTACION', 'ESCRITURA');

  if p_tipo not in ('DESAYUNO', 'ALMUERZO', 'CENA') then
    raise exception 'La comida es desayuno, almuerzo o cena.' using errcode = '22023';
  end if;
  if coalesce(p_platos, 0) <= 0 then
    raise exception 'Di cuántas personas comieron.' using errcode = '22023';
  end if;
  if v_fecha > private.hoy_aqui() then
    raise exception 'No se sirve una comida con fecha futura.' using errcode = '22023';
  end if;
  if p_origen not in ('PC', 'TELEFONO') then
    raise exception 'Origen desconocido.' using errcode = '22023';
  end if;
  if p_renglones is null or jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'Una comida sin víveres no descuenta nada: añade al menos uno.' using errcode = '22023';
  end if;

  select id, nombre, activo into v_alm from public.almacenes where id = p_almacen_id;
  if v_alm.id is null then
    raise exception 'No existe ese almacén.' using errcode = 'P0002';
  end if;
  if not v_alm.activo then
    raise exception 'El almacén "%" está cerrado.', v_alm.nombre using errcode = '22023';
  end if;

  -- El mismo víver dos veces en la lista casi siempre es un dedo repetido, y
  -- sumarlo en silencio escondería el error. Se rechaza y se corrige allá.
  if (select count(*) from jsonb_array_elements(p_renglones) e) <>
     (select count(distinct (e->>'articulo_id')) from jsonb_array_elements(p_renglones) e) then
    raise exception 'Hay un víver repetido en la lista: junta sus cantidades en una sola línea.' using errcode = '22023';
  end if;

  v_numero := private.siguiente_numero('COM');

  insert into public.comidas (numero, fecha, tipo, platos, almacen_id, origen, nota, servida_por)
  values (v_numero, v_fecha, p_tipo, p_platos, p_almacen_id, p_origen,
          nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  for v_r in
    select nullif(e->>'articulo_id', '')::bigint as articulo_id,
           nullif(e->>'cantidad', '')::numeric   as cantidad
      from jsonb_array_elements(p_renglones) e
  loop
    if v_r.articulo_id is null or coalesce(v_r.cantidad, 0) <= 0 then
      raise exception 'Cada víver lleva su cantidad, mayor que cero.' using errcode = '22023';
    end if;

    select id, nombre, categoria, activo into v_art from public.articulos where id = v_r.articulo_id;
    if v_art.id is null then
      raise exception 'No existe ese artículo.' using errcode = 'P0002';
    end if;
    -- Solo víveres: para sacar otra cosa del inventario están las salidas de
    -- siempre, con su solicitud y su firma. La cocina descuenta comida.
    if v_art.categoria <> 'VIVERES' then
      raise exception '«%» no es un víver: la cocina solo descuenta víveres.', v_art.nombre using errcode = '22023';
    end if;

    -- Un cerrojo por casilla, igual que al despachar: dos cocinas o una compra
    -- sobre el mismo víver se ponen en fila.
    perform pg_advisory_xact_lock(
      hashtextextended(format('patio:%s:%s', p_almacen_id, v_r.articulo_id), 0));

    v_existe := private.existencia_para_escribir(p_almacen_id, v_r.articulo_id);
    if v_r.cantidad > v_existe then
      raise exception 'En "%" hay % de "%" y la comida pide %.',
        v_alm.nombre, private.cantidad_es(v_existe), v_art.nombre, private.cantidad_es(v_r.cantidad)
        using errcode = '22023';
    end if;

    -- El costo promedio POR UNIDAD (20260727190000: costo_usd es unitario y
    -- valor_usd se genera multiplicando). Congelado en el renglón para que el
    -- plato de ayer no cambie de precio con la compra de mañana.
    v_costo := private.costo_promedio(p_almacen_id, v_r.articulo_id);

    v_mov := private.registrar_movimiento(
      'SALIDA_CONSUMO', -1, p_almacen_id, v_r.articulo_id, v_r.cantidad, v_costo,
      format('Comida %s · %s · %s platos', v_numero, initcap(lower(p_tipo)), p_platos),
      null, null, null, v_fecha);

    insert into public.comida_renglones (comida_id, articulo_id, cantidad, costo_usd, movimiento_id)
    values (v_id, v_r.articulo_id, v_r.cantidad, v_costo, v_mov);

    v_valor := v_valor + v_r.cantidad * v_costo;
  end loop;

  update public.comidas set valor_usd = round(v_valor, 2) where id = v_id;

  return jsonb_build_object(
    'id', v_id,
    'numero', v_numero,
    'valor_usd', round(v_valor, 2),
    'costo_por_plato_usd', round(v_valor / p_platos, 2));
end;
$$;

comment on function public.servir_comida(text, integer, bigint, jsonb, date, text, text) is
  'Registra una comida y descuenta sus viveres del inventario al costo '
  'promedio, congelandolo en cada renglon. Pide escritura en Alimentacion.';

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Anular: el cocinero corrige lo de hoy; lo viejo pide control total
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.anular_comida(p_id bigint, p_motivo text)
returns void
language plpgsql security definer set search_path to ''
as $$
declare
  v_c record;
  v_r record;
begin
  perform private.exigir_permiso('ALIMENTACION', 'ESCRITURA');

  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Di por qué se anula.' using errcode = '22023';
  end if;

  select * into v_c from public.comidas where id = p_id for update;
  if v_c.id is null then
    raise exception 'No existe esa comida.' using errcode = 'P0002';
  end if;
  if v_c.anulada_en is not null then
    raise exception 'La comida % ya estaba anulada.', v_c.numero using errcode = '55000';
  end if;

  -- El error del día lo corrige quien cocina; tocar un día ya cerrado cambia
  -- costos que alguien pudo haber mirado, y eso pide control total.
  if v_c.fecha <> private.hoy_aqui() then
    perform private.exigir_permiso('ALIMENTACION', 'TOTAL');
  end if;

  for v_r in
    select r.articulo_id, r.cantidad, r.costo_usd, r.movimiento_id
      from public.comida_renglones r
     where r.comida_id = p_id and r.movimiento_id is not null
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(format('patio:%s:%s', v_c.almacen_id, v_r.articulo_id), 0));
    perform private.registrar_movimiento(
      'REVERSO', 1, v_c.almacen_id, v_r.articulo_id, v_r.cantidad, v_r.costo_usd,
      format('Anulación de la comida %s: %s', v_c.numero, btrim(p_motivo)),
      null, null, v_r.movimiento_id, private.hoy_aqui());
  end loop;

  update public.comidas
     set anulada_en = now(), anulada_por = (select auth.uid()),
         motivo_anulacion = btrim(p_motivo)
   where id = p_id;
end;
$$;

revoke execute on function public.servir_comida(text, integer, bigint, jsonb, date, text, text) from public, anon;
revoke execute on function public.anular_comida(bigint, text) from public, anon;
grant execute on function public.servir_comida(text, integer, bigint, jsonb, date, text, text) to authenticated;
grant execute on function public.anular_comida(bigint, text) to authenticated;
