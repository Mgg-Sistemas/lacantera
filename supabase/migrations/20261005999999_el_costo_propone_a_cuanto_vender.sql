-- ═══════════════════════════════════════════════════════════════════════════
-- EL COSTO PROPONE A CUÁNTO VENDER
--
-- Christopher pidió esto desde el principio, el 14/09/2026, con estas palabras:
-- «la tasa referencial a la que se va a vender». El centro de costo nació
-- dando el costo por m³ y ahí se detenía: quien lo miraba tenía que sacar la
-- cuenta del precio en una calculadora aparte.
--
-- Los dos sistemas hermanos —MGG y Golden Touch— ya resuelven esto igual, y
-- se copia su fórmula porque es la que la gente de la casa ya entiende:
--
--     precio sugerido = costo unitario / (1 − margen)
--
-- Es MARGEN SOBRE EL PRECIO DE VENTA, no recargo sobre el costo. Con 30 % y
-- un costo de 7, el precio es 10 y la ganancia 3, que es el 30 % de 10. Si se
-- hiciera al revés —costo × 1,30— daría 9,10 y el margen real sería 23 %. La
-- diferencia no es cosmética: es la que hace que el mes cierre donde se dijo.
--
-- EL MARGEN SE GUARDA, NO SE TECLEA CADA VEZ. Vive en `costo_configuracion`,
-- la misma fila única del corte mensual, y se cambia desde Catálogos con la
-- casilla de COSTOS.CATALOGOS. Así el precio sugerido es el mismo para todo
-- el que lo mire, y al cerrar la caja queda congelado en la foto junto con el
-- costo y el margen con que se calculó.
--
-- SE TAPA CON EL MISMO CANDADO QUE EL COSTO. Si quien mira no tiene la casilla
-- de ver el pago de viajes, el costo sale nulo, y el precio sugerido también:
-- un precio calculado sobre un costo que no se puede ver sería un número
-- inventado con cara de dato.
--
-- EL TOPE DE 95 % no es un capricho: con el margen en 100 la fórmula divide
-- entre cero, y de 95 para arriba el precio se dispara a cifras que no son de
-- este negocio. El CHECK lo frena en la base, no en la pantalla.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. El margen, junto al corte mensual
-- ───────────────────────────────────────────────────────────────────────────
alter table public.costo_configuracion
  add column if not exists margen_sugerido numeric(5,2) not null default 30;

do $tope$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.costo_configuracion'::regclass
       and conname  = 'costo_margen_entre_0_y_95'
  ) then
    alter table public.costo_configuracion
      add constraint costo_margen_entre_0_y_95
      check (margen_sugerido >= 0 and margen_sugerido <= 95);
  end if;
end
$tope$;

comment on column public.costo_configuracion.margen_sugerido is
  'Margen sobre el precio de venta, en por ciento. El precio sugerido sale de '
  'costo / (1 - margen/100), como en MGG y Golden Touch. Tope 95: en 100 la '
  'division revienta.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Configurar: ahora también el margen
--
-- Se tira la de un solo argumento en vez de dejar las dos: una con `default`
-- y otra sin él hacen ambigua la llamada de un argumento, y Postgres la
-- rechaza en tiempo de ejecución. Solo la llama esta aplicación.
-- ───────────────────────────────────────────────────────────────────────────
drop function if exists public.costo_configurar(boolean);

create or replace function public.costo_configurar(
  p_corte_mensual boolean,
  p_margen        numeric default null
)
returns void
language plpgsql security definer set search_path to ''
as $$
begin
  perform private.exigir_accion('COSTOS.CATALOGOS');

  if p_margen is not null and (p_margen < 0 or p_margen > 95) then
    raise exception 'El margen va entre 0 y 95 por ciento.' using errcode = '22023';
  end if;

  update public.costo_configuracion
     set corte_mensual   = coalesce(p_corte_mensual, false),
         -- Nulo = no se toca: así la casilla del corte puede guardarse sola.
         margen_sugerido = coalesce(p_margen, margen_sugerido),
         cambiado_por    = (select auth.uid()),
         cambiado_en     = now()
   where id;
end;
$$;

revoke execute on function public.costo_configurar(boolean, numeric) from public, anon;
grant  execute on function public.costo_configurar(boolean, numeric) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. El resumen devuelve el precio sugerido
--
-- Se recrea entera porque el resumen es un solo `jsonb`: lo que no sale de
-- aquí no lo ve la tarjeta, ni el cierre, ni el PDF. Lo único que cambia es
-- la lectura del margen y los dos campos nuevos del final.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.costo_resumen_caja(p_caja_id bigint default null)
returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare
  v_caja   public.costo_cajas;
  v_ve     boolean := private.puede_accion('EXPLOTACION.VER_PAGO_VIAJES');
  v_tapar  boolean;
  v_hay_viajes boolean;
  v_costo  numeric; v_tarde numeric; v_ent numeric; v_abo numeric;
  v_mina   numeric; v_planta numeric; v_desp numeric;
  v_incluye jsonb; v_prod jsonb; v_cat jsonb; v_clase jsonb; v_tend jsonb;
  v_pend   integer; v_rev integer; v_asig numeric;
  v_hasta  date;
  v_margen numeric;
begin
  perform private.exigir_permiso('COSTOS', 'LECTURA');

  -- El margen con que se propone el precio. Si alguien dejó la fila sin él,
  -- 30 es el mismo valor de fábrica que usan los sistemas hermanos.
  select coalesce(margen_sugerido, 30) into v_margen from public.costo_configuracion where id;
  v_margen := coalesce(v_margen, 30);

  if p_caja_id is null then
    v_caja := private.costo_caja_abierta(false);
  else
    select * into v_caja from public.costo_cajas where id = p_caja_id;
    if v_caja.id is null then
      raise exception 'Esa caja no existe.' using errcode = 'P0002';
    end if;
  end if;

  v_hasta := coalesce(v_caja.fecha_fin, private.hoy_aqui());

  -- Sumas netas: el REVERSO resta.
  with n as (
    select m.*, case when m.sentido = 'REVERSO' then -1 else 1 end as s
      from public.costo_movimientos m
     where m.caja_id = v_caja.id
  )
  select
    coalesce(sum(s * monto_usd) filter (where clase not in ('ENTREGA', 'ABONO') and not llego_tarde), 0),
    coalesce(sum(s * monto_usd) filter (where clase not in ('ENTREGA', 'ABONO') and llego_tarde), 0),
    coalesce(sum(s * monto_usd) filter (where clase = 'ENTREGA'), 0),
    coalesce(sum(s * monto_usd) filter (where clase = 'ABONO'), 0),
    coalesce(sum(s * m3) filter (where medida = 'MINA'), 0),
    coalesce(sum(s * m3) filter (where medida = 'PLANTA'), 0),
    coalesce(sum(s * m3) filter (where medida = 'DESPACHO'), 0),
    coalesce(bool_or(clase = 'VIAJE' and monto > 0), false),
    coalesce(jsonb_agg(distinct clase) filter (where clase not in ('ENTREGA', 'ABONO', 'SALIDA') and monto > 0), '[]'::jsonb)
  into v_costo, v_tarde, v_ent, v_abo, v_mina, v_planta, v_desp, v_hay_viajes, v_incluye
  from n;

  v_tapar := v_hay_viajes and not v_ve;

  select coalesce(jsonb_agg(jsonb_build_object(
           'producto_id', producto_id, 'producto', producto, 'm3', m3, 'salidas', salidas)
           order by m3 desc), '[]'::jsonb)
    into v_prod
    from (
      select m.producto_id,
             a.nombre as producto,
             sum(case when m.sentido = 'REVERSO' then -m.m3 else m.m3 end) as m3,
             count(*) filter (where m.sentido = 'ORIGINAL') as salidas
        from public.costo_movimientos m
        join public.articulos a on a.id = m.producto_id
       where m.caja_id = v_caja.id and m.medida = 'PLANTA'
       group by m.producto_id, a.nombre
    ) p;

  select coalesce(jsonb_agg(jsonb_build_object(
           'categoria_raiz', raiz, 'categoria', categoria, 'nombre', nombre, 'monto_usd', monto)
           order by monto desc), '[]'::jsonb)
    into v_cat
    from (
      select coalesce(c.padre, c.codigo, 'SIN_CLASIFICAR') as raiz,
             coalesce(m.categoria, 'SIN_CLASIFICAR')      as categoria,
             coalesce(c.nombre, 'Sin clasificar')         as nombre,
             sum(case when m.sentido = 'REVERSO' then -m.monto_usd else m.monto_usd end) as monto
        from public.costo_movimientos m
        left join public.categorias_gasto c on c.codigo = m.categoria
       where m.caja_id = v_caja.id
         and m.clase not in ('ENTREGA', 'ABONO', 'SALIDA')
         and not m.llego_tarde
       group by 1, 2, 3
    ) q
   where monto <> 0;

  select coalesce(jsonb_agg(jsonb_build_object('clase', clase, 'monto_usd', monto) order by monto desc), '[]'::jsonb)
    into v_clase
    from (
      select m.clase,
             sum(case when m.sentido = 'REVERSO' then -m.monto_usd else m.monto_usd end) as monto
        from public.costo_movimientos m
       where m.caja_id = v_caja.id
         and m.clase not in ('ENTREGA', 'ABONO', 'SALIDA')
         and not m.llego_tarde
       group by m.clase
    ) q
   where monto <> 0;

  -- Los seis cierres anteriores, para ver la tendencia sin abrir seis PDF.
  select coalesce(jsonb_agg(jsonb_build_object(
           'numero', c.numero,
           'fecha_fin', c.fecha_fin,
           'costo_por_m3', c.resumen_json->'costo_por_m3',
           'm3_planta', c.resumen_json->'m3_planta',
           'costo_usd', c.resumen_json->'costo_usd') order by c.numero), '[]'::jsonb)
    into v_tend
    from (
      select * from public.costo_cajas c
       where c.estado = 'CERRADA' and c.numero < v_caja.numero
       order by c.numero desc
       limit 6
    ) c;

  select count(*)::int into v_pend
    from public.costo_candidatos(v_caja.id) k
   where k.fecha between v_caja.fecha_inicio and v_hasta;

  select count(*)::int into v_rev from public.costo_reversos_pendientes();

  select sum(p.monto) into v_asig
    from public.presupuestos p
   where p.activo
     and p.desde <= v_hasta
     and p.hasta >= v_caja.fecha_inicio;

  return jsonb_build_object(
    'caja', jsonb_build_object(
      'id', v_caja.id, 'numero', v_caja.numero, 'nombre', v_caja.nombre,
      'fecha_inicio', v_caja.fecha_inicio, 'fecha_fin', v_caja.fecha_fin,
      'estado', v_caja.estado, 'saldo_inicial_usd', v_caja.saldo_inicial_usd),
    'dinero_tapado', v_tapar,
    'costo_usd',           case when v_tapar then null else round(v_costo, 2) end,
    'ajustes_tardios_usd', case when v_tapar then null else round(v_tarde, 2) end,
    'entregado_usd', round(v_ent, 2),
    'abonado_usd',   round(v_abo, 2),
    'fondo_usd',     round(v_caja.saldo_inicial_usd + v_ent - v_abo, 2),
    'm3_mina',     round(v_mina, 2),
    'm3_planta',   round(v_planta, 2),
    'm3_despacho', round(v_desp, 2),
    'costo_por_m3',      case when v_tapar then null when v_planta > 0 then round(v_costo / v_planta, 4) end,
    'costo_por_m3_mina', case when v_tapar then null when v_mina > 0 then round(v_costo / v_mina, 4) end,
    -- A cuánto vender para que quede el margen pedido, sobre el m³ que SALE de
    -- planta, que es el que se factura. Nulo cuando el costo es nulo: no se
    -- propone un precio encima de un costo que no se puede ver.
    'margen_sugerido', v_margen,
    'precio_sugerido_m3',
      case when v_tapar then null
           when v_planta > 0 then round((v_costo / v_planta) / (1 - v_margen / 100), 4) end,
    'incluye', v_incluye,
    'por_producto', v_prod,
    'por_categoria', case when v_tapar then '[]'::jsonb else v_cat end,
    'por_clase',     case when v_tapar then '[]'::jsonb else v_clase end,
    'pendientes', v_pend,
    'reversos_pendientes', v_rev,
    'fondo_asignado_usd', v_asig,
    'tendencia', v_tend);
end;
$$;

comment on function public.costo_resumen_caja(bigint) is
  'Las cifras de una caja: costo, m3 por medida, costo por m3, el precio '
  'sugerido de venta con su margen, y que incluye. Tarjetas, cierre y PDF '
  'leen de aqui. Sin la casilla de ver el pago de viajes el dinero sale nulo '
  'cuando hay viajes: un cero diria que la piedra sale gratis, y un precio '
  'sobre ese cero seria un numero inventado.';
