-- ═══════════════════════════════════════════════════════════════════════════
-- UN ADMINISTRADOR PUEDE EDITAR LA NOTA DE ENTREGA
--
-- No existía ninguna forma de corregir una nota ya despachada: «Completar»
-- solo trabaja mientras está PENDIENTE, y «Anular» es un final, no una
-- corrección. Esto abre esa puerta, cerrada a propósito solo para ADMIN
-- —`private.exigir_rol('ADMIN')`, el mismo candado de `crear_usuario_sistema`—
-- y con motivo obligatorio, igual que anular.
--
-- LA NOTA QUE RESPALDA UNA SALIDA NO EDITA SUS RENGLONES AQUÍ. La que nace de
-- una nota de salida (`nota_salida is not null`) no es dueña de su propio
-- movimiento de inventario: sus renglones cuelgan de `movimiento_salida_id`,
-- el asiento de la SALIDA, no de `movimiento_id`. `cargar_renglones_venta` no
-- sabe conservar ese enlace al reinsertar, así que tocar sus renglones por
-- aquí lo rompería sin que nadie lo notara. Se edita el resto del papel
-- —cliente, moneda, camión, flete, observación— y los renglones se dejan
-- como están.
--
-- LA QUE SÍ ES DUEÑA DE SU DESCUENTO se reversa y se vuelve a descontar,
-- exactamente como hace `anular_nota_entrega` y como lo hizo `despachar` al
-- nacer: mismo cerrojo de patio, misma comprobación de existencia, mismo
-- `registrar_movimiento`. No se reescribe esa aritmética; se reutiliza.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.editar_nota_entrega(
  p_id            bigint,
  p_motivo        text,
  p_cliente_id    bigint,
  p_almacen_id    bigint,
  p_fecha         date,
  p_moneda        text,
  p_vehiculo      text default null,
  p_chofer        text default null,
  p_cedula_chofer text default null,
  p_peso_bruto    numeric default null,
  p_peso_tara     numeric default null,
  p_ticket_romana text default null,
  p_flete         numeric default 0,
  p_descuento     numeric default 0,
  p_observacion   text default null,
  p_renglones     jsonb default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_nota      record;
  v_cliente   record;
  v_almacen   record;
  v_tasa      numeric;
  v_tasa_usd  numeric;
  v_moneda    text := upper(btrim(coalesce(p_moneda, '')));
  v_reng      record;
  v_existe    numeric;
  v_costo     numeric;
  v_mov       bigint;
begin
  perform private.exigir_rol('ADMIN');

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se edita la nota: queda en la bitácora.' using errcode = '22023';
  end if;

  select * into v_nota from public.notas_entrega where id = p_id for update;
  if v_nota.id is null then
    raise exception 'No existe la nota de entrega %.', p_id using errcode = 'P0002';
  end if;
  if v_nota.estado = 'ANULADA' then
    raise exception 'La nota % está anulada: no se edita, se rehace.', v_nota.numero using errcode = '55000';
  end if;

  if p_renglones is not null and v_nota.nota_salida is not null then
    raise exception 'La nota % respalda la salida %: sus renglones son los que esa salida descontó, y no se editan por aquí.',
      v_nota.numero, v_nota.nota_salida using errcode = '55000';
  end if;

  select id, nombre, activo into v_cliente from public.clientes where id = p_cliente_id;
  if v_cliente.id is null then
    raise exception 'No existe ese cliente.' using errcode = 'P0002';
  end if;
  if not v_cliente.activo then
    raise exception 'El cliente "%" está inactivo.', v_cliente.nombre using errcode = '22023';
  end if;

  select id, nombre, activo into v_almacen from public.almacenes where id = p_almacen_id;
  if v_almacen.id is null then
    raise exception 'No existe ese almacén.' using errcode = 'P0002';
  end if;
  if not v_almacen.activo then
    raise exception 'El almacén "%" está cerrado.', v_almacen.nombre using errcode = '22023';
  end if;

  if p_fecha > current_date then
    raise exception 'No se edita con fecha futura.' using errcode = '22023';
  end if;

  if v_moneda = '' then
    raise exception 'Falta la moneda.' using errcode = '22023';
  end if;

  -- La tasa se recalcula si cambia la moneda o el día que queda congelado; si
  -- ninguno de los dos cambia, la tasa se queda tal como estaba.
  if v_moneda <> v_nota.moneda or p_fecha <> v_nota.fecha then
    select t.tasa, t.tasa_usd into v_tasa, v_tasa_usd from private.tasas_del_dia(v_moneda, p_fecha) t;
  else
    v_tasa := v_nota.tasa;
    v_tasa_usd := v_nota.tasa_usd;
  end if;

  update public.notas_entrega
     set cliente_id    = p_cliente_id,
         almacen_id    = p_almacen_id,
         fecha         = p_fecha,
         moneda        = v_moneda,
         tasa          = v_tasa,
         tasa_usd      = v_tasa_usd,
         vehiculo      = nullif(btrim(coalesce(p_vehiculo, '')), ''),
         chofer        = nullif(btrim(coalesce(p_chofer, '')), ''),
         cedula_chofer = nullif(btrim(coalesce(p_cedula_chofer, '')), ''),
         peso_bruto    = p_peso_bruto,
         peso_tara     = p_peso_tara,
         ticket_romana = nullif(btrim(coalesce(p_ticket_romana, '')), ''),
         flete         = coalesce(p_flete, 0),
         descuento     = coalesce(p_descuento, 0),
         observacion   = nullif(btrim(coalesce(p_observacion, '')), '')
   where id = p_id;

  if p_renglones is not null then
    -- Se reversa exactamente lo que esta nota había descontado, por su propio
    -- número de movimiento — igual que al anularla.
    for v_reng in
      select r.movimiento_id, m.almacen_id, m.articulo_id, m.cantidad, m.costo_usd
        from public.nota_entrega_renglones r
        join public.inventario_movimientos m on m.id = r.movimiento_id
       where r.nota_id = p_id and r.movimiento_id is not null
    loop
      perform private.registrar_movimiento(
        'REVERSO', (1)::smallint, v_reng.almacen_id, v_reng.articulo_id,
        v_reng.cantidad, v_reng.costo_usd,
        format('EDICIÓN DE LA NOTA %s: %s', v_nota.numero, trim(p_motivo)),
        null, null, v_reng.movimiento_id, current_date);
    end loop;

    delete from public.nota_entrega_renglones where nota_id = p_id;

    perform private.cargar_renglones_venta(
      'nota_entrega_renglones', 'nota_id', p_id, p_renglones, v_moneda, p_fecha);

    -- Un cerrojo por casilla de patio, igual que al despachar: dos ediciones o
    -- un despacho nuevo sobre el mismo par almacén/artículo se ponen en fila.
    for v_reng in
      select distinct coalesce(r.almacen_id, p_almacen_id) as almacen_id, r.articulo_id
        from public.nota_entrega_renglones r
        join public.articulos a on a.id = r.articulo_id
       where r.nota_id = p_id and a.inventariable
       order by 1, 2
    loop
      perform pg_advisory_xact_lock(
        hashtextextended(format('patio:%s:%s', v_reng.almacen_id, v_reng.articulo_id), 0));
    end loop;

    for v_reng in
      select r.id, r.articulo_id, coalesce(r.cantidad_inventario, r.cantidad) as cantidad,
             r.cantidad as vendida, r.unidad, a.unidad as unidad_patio, a.nombre, a.inventariable,
             al.id as almacen_id, al.nombre as almacen, al.activo as almacen_activo
        from public.nota_entrega_renglones r
        join public.articulos a on a.id = r.articulo_id
        join public.almacenes al on al.id = coalesce(r.almacen_id, p_almacen_id)
       where r.nota_id = p_id
       order by r.linea
    loop
      continue when not v_reng.inventariable;

      if not v_reng.almacen_activo then
        raise exception 'El almacén "%" está cerrado: «%» no puede salir de ahí.', v_reng.almacen, v_reng.nombre
          using errcode = '22023';
      end if;

      v_existe := private.existencia_para_escribir(v_reng.almacen_id, v_reng.articulo_id);
      if v_reng.cantidad > v_existe then
        raise exception 'En "%" hay % de "%" y la edición deja %.',
          v_reng.almacen, private.cantidad_es(v_existe), v_reng.nombre, private.cantidad_es(v_reng.cantidad)
          using errcode = '22023';
      end if;

      v_costo := private.costo_promedio(v_reng.almacen_id, v_reng.articulo_id);

      v_mov := private.registrar_movimiento(
        'SALIDA_DESPACHO', (-1)::smallint, v_reng.almacen_id, v_reng.articulo_id,
        v_reng.cantidad, v_costo,
        format('EDICIÓN DE LA NOTA %s: %s', v_nota.numero, trim(p_motivo)),
        null, null, null, p_fecha,
        p_cantidad_capturada => case when v_reng.unidad <> v_reng.unidad_patio then v_reng.vendida end,
        p_unidad_capturada   => case when v_reng.unidad <> v_reng.unidad_patio then v_reng.unidad end);

      update public.nota_entrega_renglones set movimiento_id = v_mov where id = v_reng.id;
    end loop;
  end if;
end;
$$;

revoke all on function public.editar_nota_entrega(
  bigint, text, bigint, bigint, date, text, text, text, text,
  numeric, numeric, text, numeric, numeric, text, jsonb) from public, anon;
grant execute on function public.editar_nota_entrega(
  bigint, text, bigint, bigint, date, text, text, text, text,
  numeric, numeric, text, numeric, numeric, text, jsonb) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Comprobación
-- ───────────────────────────────────────────────────────────────────────────
do $comprueba$
declare
  v_oid regprocedure := 'public.editar_nota_entrega(
    bigint, text, bigint, bigint, date, text, text, text, text,
    numeric, numeric, text, numeric, numeric, text, jsonb)'::regprocedure;
begin
  if not exists (
    select 1 from pg_proc where oid = v_oid
      and prosecdef  -- security definer
      and (select array_to_string(proconfig, ',') from pg_proc where oid = v_oid) like '%search_path=%'
  ) then
    raise exception 'editar_nota_entrega no quedó como security definer con search_path fijo.';
  end if;
  if has_function_privilege('anon', v_oid, 'execute') then
    raise exception 'editar_nota_entrega no puede ser ejecutable por anon.';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception 'editar_nota_entrega tiene que ser ejecutable por authenticated (la propia función exige el rol ADMIN por dentro).';
  end if;
end
$comprueba$;
