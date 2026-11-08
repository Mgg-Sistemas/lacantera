/*
  ALMACÉN E INVENTARIO COMO MGG · FASES 3 Y 4 (08/11/2026)

  La pantalla principal de inventario (`/app/inventario`) gana los modales de
  MGG: «📋 Trazabilidad · {SKU}», «↕ Movimiento · {SKU}», «⇄ Mover» y los de la
  cabecera (resumen, exportar, importar, sin costo, deshabilitados, borrar,
  categorías). Casi todo corre sobre las funciones de siempre
  (`registrar_entradas`, `salida_desde_el_telefono`, `transferir_existencia`,
  `registrar_ajuste`, `reversar_movimiento`, `cambiar_estado_articulo`,
  `cargar_articulos_por_lote`). Aquí va solo lo que no existía, y todo es
  aditivo: dos funciones nuevas. No se toca ninguna función que ya exista, ni
  ninguna tabla, ni ningún dato.

  1. `historial_articulo_v2`: SOLO LECTURA. El kardex de MGG necesita, por
     cada movimiento, el saldo que quedó EN ESE ALMACÉN, el costo promedio del
     almacén después del movimiento, el id (para «Deshacer»), si ya se deshizo
     y de dónde a dónde fue un traslado. `historial_articulo` (la de la ficha)
     no da nada de eso: es la historia contada en palabras, con préstamos y
     taller, y sigue igual para quien la usa.

  2. `valorar_sin_costo(p_renglones jsonb, p_motivo text)`: el «Guardar {n}
     con costo» del modal «Productos sin costo». Le pone costo a lo que entró
     «sin valorar» (costo nulo) con un AJUSTE_COSTO en pareja, como
     `corregir_costo`: sale lo no valorado SIN cifra y vuelve a entrar CON la
     cifra. La existencia no cambia, la parte sin valorar baja a cero y el
     promedio del almacén pasa a contar esas unidades. Mismo permiso que
     `corregir_costo` (`INVENTARIO.AJUSTAR_COSTO`): cambia dinero, no unidades.

  Combustible no se toca: `valorar_sin_costo` rechaza los almacenes
  COMBUSTIBLE, TRANSITO y los que admiten material sin costo.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. El kardex de un artículo, con saldo y costo promedio por almacén
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.historial_articulo_v2(
  p_articulo_id bigint,
  p_limite      integer default 1000
)
returns table (
  id               bigint,
  numero           text,
  fecha            date,
  registrado_en    timestamptz,
  tipo             text,
  signo            smallint,
  cantidad         numeric,
  unidad           text,
  almacen_id       bigint,
  almacen          text,
  almacen_tipo     text,
  propietario      text,
  costo_usd        numeric,
  valor_usd        numeric,
  pmp_despues      numeric,
  saldo_almacen    numeric,
  nota             text,
  nota_salida      text,
  razon_salida     text,
  quien            text,
  para_quien       text,
  orden            text,
  traslado         text,
  traslado_origen  text,
  traslado_destino text,
  reversado        boolean,
  reversable       boolean,
  total            bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_ve_valor boolean;
begin
  -- Quien lee el libro lee esto: la misma reja que `historial_articulo`.
  perform private.exigir_permiso('INVENTARIO', 'LECTURA');

  -- El dinero, solo a quien puede verlo: la misma regla que `v_existencias`.
  v_ve_valor := coalesce(private.puede_accion('INVENTARIO.VER_VALORACION'), false);

  /*
    EL ORDEN DEL SALDO ES EL DEL LIBRO: por fecha (el día en que pasó), luego
    por el momento en que se registró y por id para desempatar. El saldo de un
    almacén es la suma acumulada de cantidad × signo en ese orden, y el costo
    promedio después de cada fila cuenta solo las filas con cifra, en los dos
    lados de la división (`private.costo_promedio`).

    Se calcula sobre la historia ENTERA del artículo y después se recorta a
    las `p_limite` más recientes: recortar antes daría saldos que no empiezan
    en cero.
  */
  return query
  with libro as (
    select m.*,
           sum(m.cantidad * m.signo) over w as saldo,
           sum(case when m.costo_usd is not null then m.valor_usd * m.signo end) over w as val_v,
           sum(case when m.costo_usd is not null then m.cantidad * m.signo end) over w as cant_v,
           count(*) over () as cuantos
      from public.inventario_movimientos m
     where m.articulo_id = p_articulo_id
    window w as (partition by m.almacen_id
                 order by m.fecha, m.registrado_en, m.id
                 rows between unbounded preceding and current row)
  )
  -- Cada columna con su tipo exacto: `return query` no convierte varchar en text.
  select l.id::bigint, l.numero::text, l.fecha::date, l.registrado_en::timestamptz,
         l.tipo::text, l.signo::smallint, l.cantidad::numeric, l.unidad::text,
         l.almacen_id::bigint, al.nombre::text, al.tipo::text, l.propietario::text,
         (case when v_ve_valor then l.costo_usd end)::numeric,
         (case when v_ve_valor then l.valor_usd end)::numeric,
         (case when v_ve_valor and l.cant_v > 0 then round(l.val_v / l.cant_v, 6) end)::numeric,
         l.saldo::numeric,
         l.nota::text, l.nota_salida::text, l.razon_salida::text,
         coalesce(pf.nombre, pf.usuario)::text,
         coalesce(
           nullif(btrim(coalesce(e.nombres, '') || ' ' || coalesce(e.apellidos, '')), ''),
           case when l.destino_externo is not null
                then l.destino_externo || coalesce(' · responde ' || l.responsable_externo, '') end)::text,
         oc.numero::text,
         tr.numero::text,
         coalesce(tr.origen, par.origen)::text,
         coalesce(tr.destino, par.destino)::text,
         rv.hay::boolean,
         (l.tipo not in ('REVERSO', 'AJUSTE_COSTO', 'SALIDA_INTERCAMBIO')
           and not rv.hay
           and tr.numero is null
           and al.tipo <> 'TRANSITO')::boolean,
         l.cuantos::bigint
    from libro l
    join public.almacenes al on al.id = l.almacen_id
    left join public.perfiles pf on pf.id = l.registrado_por
    left join public.empleados e on e.id = coalesce(l.destinatario_empleado_id, l.empleado_id)
    left join public.ordenes_compra oc on oc.id = l.orden_id
    -- Un traslado con número: de dónde a dónde, con su número.
    left join lateral (
      select t.numero, o.nombre as origen, d.nombre as destino
        from public.traslados t
        join public.almacenes o on o.id = t.origen_id
        join public.almacenes d on d.id = t.destino_id
       where l.id in (t.mov_salida, t.mov_en_camino, t.mov_llegada, t.mov_vuelta)
       limit 1
    ) tr on true
    -- Un traslado directo: la otra pata cuelga de la salida por `movimiento_origen`.
    left join lateral (
      select case when l.tipo = 'TRANSFERENCIA_SALIDA' then al.nombre else ao.nombre end as origen,
             case when l.tipo = 'TRANSFERENCIA_SALIDA' then ao.nombre else al.nombre end as destino
        from public.inventario_movimientos o2
        join public.almacenes ao on ao.id = o2.almacen_id
       where (l.tipo = 'TRANSFERENCIA_SALIDA' and o2.movimiento_origen = l.id
                and o2.tipo = 'TRANSFERENCIA_ENTRADA')
          or (l.tipo = 'TRANSFERENCIA_ENTRADA' and o2.id = l.movimiento_origen)
       limit 1
    ) par on true
    left join lateral (
      select exists (select 1 from public.inventario_movimientos r
                      where r.movimiento_origen = l.id and r.tipo = 'REVERSO') as hay
    ) rv on true
   order by l.fecha desc, l.registrado_en desc, l.id desc
   limit greatest(coalesce(p_limite, 1000), 1);
end;
$function$;

comment on function public.historial_articulo_v2(bigint, integer) is
  'Kardex de un artículo para la trazabilidad de MGG (fase 3, 08/11/2026). Solo lectura. Por cada movimiento: el saldo que quedó en su almacén, el costo promedio del almacén después (solo filas con cifra), quién lo registró, para quién salió, de dónde a dónde fue un traslado, si ya se deshizo y si se puede deshacer. Costos y valores nulos sin INVENTARIO.VER_VALORACION. Del más reciente al más antiguo, recortado a p_limite; total = cuántos movimientos tiene el artículo.';

revoke all on function public.historial_articulo_v2(bigint, integer) from public, anon;
grant execute on function public.historial_articulo_v2(bigint, integer) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Valorar lo que entró sin costo
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.valorar_sin_costo(
  p_renglones jsonb,
  p_motivo    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_r          jsonb;
  v_n          integer := 0;
  v_almacen    bigint;
  v_articulo   bigint;
  v_costo      numeric;
  v_moneda     text;
  v_tasa       numeric;
  v_tasa_usd   numeric;
  v_costo_usd  numeric;
  v_sitio      record;
  v_art        record;
  v_dueno      record;
  v_hay        numeric;
  v_cuanto     numeric;
  v_salida     bigint;
  v_nota       text;
  v_motivo     text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_unidades   numeric := 0;
  v_valor      numeric := 0;
  v_ids        bigint[] := '{}';
  v_vistos     text[] := '{}';
  v_clave      text;
begin
  /*
    QUIÉN PUEDE: el mismo permiso que `corregir_costo`. Esto no mueve ni una
    unidad contada; cambia lo que vale el inventario.
  */
  perform private.exigir_accion('INVENTARIO.AJUSTAR_COSTO');

  if p_renglones is null or jsonb_typeof(p_renglones) <> 'array'
     or jsonb_array_length(p_renglones) = 0 then
    raise exception 'No hay nada que valorar: no llegó ningún renglón con costo.' using errcode = '22023';
  end if;

  for v_r in select * from jsonb_array_elements(p_renglones)
  loop
    v_n := v_n + 1;
    v_almacen  := nullif(btrim(coalesce(v_r->>'almacen_id', '')), '')::bigint;
    v_articulo := nullif(btrim(coalesce(v_r->>'articulo_id', '')), '')::bigint;
    v_costo    := nullif(btrim(coalesce(v_r->>'costo', '')), '')::numeric;
    v_moneda   := upper(coalesce(nullif(btrim(coalesce(v_r->>'moneda', '')), ''), 'USD'));

    if v_almacen is null or v_articulo is null then
      raise exception 'El renglón %: falta el almacén o el producto.', v_n using errcode = '22023';
    end if;

    -- El mismo par dos veces sería valorar dos veces lo mismo.
    v_clave := format('%s/%s', v_almacen, v_articulo);
    if v_clave = any (v_vistos) then
      raise exception 'El renglón %: ese producto en ese almacén ya viene en otro renglón.', v_n
        using errcode = '22023';
    end if;
    v_vistos := v_vistos || v_clave;

    select a.id, a.nombre, a.tipo, coalesce(a.admite_sin_costo, false) as admite_sin_costo
      into v_sitio
      from public.almacenes a where a.id = v_almacen and a.activo;
    if v_sitio.id is null then
      raise exception 'El renglón %: ese almacén no existe o está inactivo.', v_n using errcode = '23503';
    end if;
    -- Combustible no se toca, y lo que espera en tránsito solo lo mueven los traslados.
    if v_sitio.tipo in ('COMBUSTIBLE', 'TRANSITO') or v_sitio.admite_sin_costo then
      raise exception 'El renglón %: en «%» no se valora desde aquí.', v_n, v_sitio.nombre
        using errcode = '22023';
    end if;

    select a.id, a.nombre, a.unidad into v_art from public.articulos a where a.id = v_articulo;
    if v_art.id is null then
      raise exception 'El renglón %: ese producto no existe.', v_n using errcode = 'P0002';
    end if;

    if v_costo is null or v_costo <= 0 then
      raise exception 'El renglón % (%): el costo unitario tiene que ser mayor que cero.', v_n, v_art.nombre
        using errcode = '22023';
    end if;

    -- En la moneda que se tecleó, pasada a dólares con la tasa de hoy, con la
    -- misma cuenta que `corregir_costo`. En dólares no hay nada que convertir.
    if v_moneda = 'USD' then
      v_costo_usd := round(v_costo, 6);
    else
      select t.tasa, t.tasa_usd into v_tasa, v_tasa_usd
        from private.tasas_del_dia(v_moneda, current_date) t;
      if v_tasa is null or coalesce(v_tasa_usd, 0) = 0 then
        raise exception 'No hay tasa de % para hoy, así que no se puede saber cuánto es en dólares.', v_moneda
          using errcode = 'P0002';
      end if;
      v_costo_usd := round(v_costo * v_tasa / v_tasa_usd, 6);
    end if;

    -- El cerrojo antes de leer, como toda puerta que escribe el libro.
    perform private.existencia_para_escribir(v_almacen, v_articulo);

    v_cuanto := 0;

    /*
      POR DUEÑO. Lo sin valorar de la gobernación sigue siendo de la
      gobernación: cada pareja lleva el dueño de lo que valora, y no puede
      valorar más de lo que ese dueño tiene ahí.
    */
    for v_dueno in
      select m.propietario,
             sum(m.cantidad * m.signo) filter (where m.costo_usd is null) as sin_valorar
        from public.inventario_movimientos m
       where m.almacen_id = v_almacen and m.articulo_id = v_articulo
       group by m.propietario
      having coalesce(sum(m.cantidad * m.signo) filter (where m.costo_usd is null), 0) > 0
    loop
      v_hay := least(v_dueno.sin_valorar, private.existencia(v_almacen, v_articulo, v_dueno.propietario));
      continue when coalesce(v_hay, 0) <= 0;

      v_nota := format('Valoración de lo que entró sin costo: %s %s a %s USD c/u.%s%s',
                       private.cantidad_es(v_hay), v_art.unidad,
                       private.numero_es(v_costo_usd, 4),
                       case when v_moneda <> 'USD'
                            then format(' Declarado: %s %s.', private.numero_es(v_costo, 4), v_moneda)
                            else '' end,
                       coalesce(' ' || v_motivo, ''));

      -- Sale lo no valorado SIN cifra: la parte «sin valorar» baja.
      v_salida := private.registrar_movimiento(
        'AJUSTE_COSTO', -1, v_almacen, v_articulo, v_hay, null::numeric,
        v_nota, null, null, null, null,
        p_propietario => v_dueno.propietario);

      -- Y vuelve a entrar CON la cifra, colgada de la salida.
      perform private.registrar_movimiento(
        'AJUSTE_COSTO', 1, v_almacen, v_articulo, v_hay, v_costo_usd,
        v_nota, null, null, v_salida, null,
        p_costo_capturado => v_costo,
        p_moneda_capturada => v_moneda,
        p_propietario => v_dueno.propietario);

      v_ids := v_ids || v_salida;
      v_cuanto := v_cuanto + v_hay;
      v_unidades := v_unidades + v_hay;
      v_valor := v_valor + round(v_hay * v_costo_usd, 6);
    end loop;

    if v_cuanto = 0 then
      raise exception 'El renglón % (%): en «%» no queda nada sin costo.', v_n, v_art.nombre, v_sitio.nombre
        using errcode = '22023';
    end if;
  end loop;

  perform private.notificar(
    'INVENTARIO', 'COSTO_CORREGIDO',
    format('Se valoró lo que había sin costo (%s)', v_n),
    format('%s producto(s) quedaron con costo: %s USD en libros.%s',
           v_n, private.numero_es(v_valor, 2), coalesce(' ' || v_motivo, '')),
    '/app/inventario/movimientos', array['ADMIN', 'GERENTE_GENERAL'], 'INFO');

  return jsonb_build_object(
    'renglones',   v_n,
    'unidades',    v_unidades,
    'valor_usd',   round(v_valor, 2),
    'movimientos', to_jsonb(v_ids));
end;
$function$;

comment on function public.valorar_sin_costo(jsonb, text) is
  'Le pone costo a lo que entró sin valorar (modal «Productos sin costo», fase 4, 08/11/2026). Renglones {almacen_id, articulo_id, costo, moneda}. Por cada dueño con existencia sin valorar escribe un AJUSTE_COSTO en pareja: sale sin cifra y vuelve a entrar con la cifra. La existencia no cambia. Exige INVENTARIO.AJUSTAR_COSTO; no toca combustible ni tránsito.';

revoke all on function public.valorar_sin_costo(jsonb, text) from public, anon;
grant execute on function public.valorar_sin_costo(jsonb, text) to authenticated, service_role;
