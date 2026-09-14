/*
  LA CAJA SE CIERRA Y LA FOTO SE CONGELA.

  Una sola función calcula el resumen —tarjetas, cierre y PDF leen lo mismo—
  y el cierre es una transacción: recalcula desde la base, guarda la foto,
  cierra y abre la siguiente con el saldo arrastrado. GT lo hace en doce pasos
  no transaccionales y un fallo a mitad le deja dos cajas abiertas.

  No existe reabrir. Lo que llegue con fecha de una caja cerrada entra en la
  abierta marcado «llegó tarde», se enseña en su propia línea y no mueve el
  costo por m³ corriente: el precio de venta de un mes no cambia porque una
  factura se registró en el siguiente.

  ═══════════════════════════════════════════════════════════════════════════
  EL COSTO POR M³ DICE LO QUE INCLUYE
  ═══════════════════════════════════════════════════════════════════════════

  Hoy el libro se llena con viajes, gastos sueltos y fijos. Nómina, compras y
  combustible entran en piezas posteriores cuando su fuente exista y esté
  limpia. Hasta entonces la cifra sería «flete disfrazado de costo» si no
  dijera qué lleva dentro: por eso `incluye` viaja con el resumen y la tarjeta
  lo rotula.

  Y sin la casilla de ver el pago de viajes, el costo sale NULO cuando hay
  viajes en la caja. Un cero diría que la piedra sale gratis.

  Cuarta pieza de siete.
*/

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
begin
  perform private.exigir_permiso('COSTOS', 'LECTURA');

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
  'Las cifras de una caja: costo, m3 por medida, costo por m3 y que incluye. '
  'Tarjetas, cierre y PDF leen de aqui. Sin la casilla de ver el pago de '
  'viajes el dinero sale nulo cuando hay viajes: un cero diria que la piedra '
  'sale gratis.';

-- ---------------------------------------------------------------------------
-- El cierre
-- ---------------------------------------------------------------------------
create or replace function public.costo_cerrar_caja(
  p_fecha_fin        date,
  p_nombre_siguiente text default null,
  p_pendientes       text default 'DEJAR'
) returns bigint
language plpgsql security definer set search_path to ''
as $$
declare
  v_caja       public.costo_cajas;
  v_k          record;
  v_foto       jsonb;
  v_saldo      numeric;
  v_nueva      bigint;
  v_bloqueados text[] := '{}';
begin
  perform private.exigir_accion('COSTOS.CERRAR_CAJA');
  v_caja := private.costo_caja_abierta(true);

  if p_fecha_fin is null or p_fecha_fin < v_caja.fecha_inicio or p_fecha_fin > private.hoy_aqui() then
    raise exception 'La fecha de cierre tiene que estar entre el inicio de la caja (%) y hoy.',
      to_char(v_caja.fecha_inicio, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  if p_pendientes not in ('ACEPTAR_TODOS', 'DEJAR') then
    raise exception 'Hay que decir que se hace con lo pendiente: ACEPTAR_TODOS o DEJAR.'
      using errcode = '22023';
  end if;

  -- Lo que estaba por aceptar con fecha dentro de la caja: o entra todo, o se
  -- queda para la siguiente. Nunca se acepta en silencio.
  if p_pendientes = 'ACEPTAR_TODOS' then
    for v_k in
      select * from public.costo_candidatos(v_caja.id) k
       where k.fecha between v_caja.fecha_inicio and p_fecha_fin
    loop
      if v_k.aviso = 'SIN_PRECIO' then
        v_bloqueados := v_bloqueados || v_k.descripcion;
      else
        perform public.costo_aceptar(v_k.origen, v_k.origen_id);
      end if;
    end loop;

    if array_length(v_bloqueados, 1) > 0 then
      raise exception 'No se puede cerrar aceptando todo: hay viajes sin precio (%). Corrigelos en Viajes o cierra dejandolos.',
        array_to_string(v_bloqueados, '; ')
        using errcode = '55000';
    end if;
  end if;

  -- Se cierra antes de sacar la foto: la restricción exige estado y fecha de
  -- fin juntos, y el resumen acota los pendientes a la caja tal como queda.
  -- Todo va en la misma transacción, así que nadie ve la caja cerrada sin
  -- foto.
  update public.costo_cajas
     set estado      = 'CERRADA',
         fecha_fin   = p_fecha_fin,
         cerrada_por = (select auth.uid()),
         cerrada_en  = now()
   where id = v_caja.id;

  v_foto := public.costo_resumen_caja(v_caja.id);

  -- El saldo que se arrastra da por pagado el costo devengado. La tarjeta lo
  -- rotula así: «lo que quedaría si se pagara todo el costo».
  v_saldo := round(
    v_caja.saldo_inicial_usd
    + (v_foto->>'entregado_usd')::numeric
    - (v_foto->>'abonado_usd')::numeric
    - coalesce((v_foto->>'costo_usd')::numeric, 0)
    - coalesce((v_foto->>'ajustes_tardios_usd')::numeric, 0), 2);

  update public.costo_cajas set resumen_json = v_foto where id = v_caja.id;

  insert into public.costo_cajas (numero, nombre, fecha_inicio, saldo_inicial_usd, abierta_por)
  values (v_caja.numero + 1,
          nullif(btrim(coalesce(p_nombre_siguiente, '')), ''),
          p_fecha_fin + 1,
          v_saldo,
          (select auth.uid()))
  returning id into v_nueva;

  return v_nueva;
end;
$$;

comment on function public.costo_cerrar_caja(date, text, text) is
  'Cierra la caja abierta en una transaccion: decide lo pendiente, congela la '
  'foto y abre la siguiente el dia despues con el saldo arrastrado. No existe '
  'reabrir.';

revoke execute on function public.costo_resumen_caja(bigint) from public, anon;
grant  execute on function public.costo_resumen_caja(bigint) to authenticated;
revoke execute on function public.costo_cerrar_caja(date, text, text) from public, anon;
grant  execute on function public.costo_cerrar_caja(date, text, text) to authenticated;
