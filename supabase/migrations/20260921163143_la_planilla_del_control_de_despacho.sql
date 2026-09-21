-- LA PLANILLA DEL CONTROL DE DESPACHO
--
-- La vista arma las filas leyendo, y las funciones escriben SOLO en las tablas
-- del módulo. Ninguna toca una nota, el inventario ni un cliente.
--
-- La serie se enseña ENTERA: cada número de NE y de NS aparece, y dice qué le
-- pasó. VIGENTE suma; lo demás —anulada, deshecha, interna, respaldo de una
-- salida, sin documento— se ve y no suma.

create or replace view public.v_control_despacho
with (security_invoker = on) as
with serie as (
  select c.prefijo,
         format('%s-%s-%s', c.prefijo, c.anio, lpad(n::text, 4, '0')) as numero
    from public.correlativos c
   cross join lateral generate_series(1, c.ultimo) as n
   where c.prefijo in ('NE', 'NS')
),
base as (
  -- A) Cada renglón de una nota de entrega de las de siempre.
  select 'NE:' || r.id                          as clave,
         'NOTA_ENTREGA'::text                   as origen,
         n.numero                               as documento,
         n.fecha,
         c.nombre                               as cliente,
         n.cliente_id,
         c.rif                                  as rif_doc,
         r.descripcion                          as material,
         r.cantidad::numeric                    as cantidad,
         r.unidad,
         case when n.moneda = 'USD' and r.precio_unitario > 0 then r.precio_unitario end as precio_doc,
         n.moneda                               as moneda_doc,
         case when n.estado = 'ANULADA' then 'ANULADA' else 'VIGENTE' end as estado_doc,
         case when n.estado = 'ANULADA' then n.motivo_anulacion end      as detalle,
         r.id                                   as renglon_id,
         null::bigint                           as movimiento_id,
         null::text                             as destino_escrito
    from public.notas_entrega n
    join public.nota_entrega_renglones r on r.nota_id = n.id
    left join public.clientes c on c.id = n.cliente_id
   where n.nota_salida is null

  union all

  -- B) La nota de entrega que respalda una salida: su material ya lo cuenta la
  --    fila de la salida. Aparece para que su número no falte, y no suma.
  select 'NE#' || n.numero, 'NOTA_ENTREGA', n.numero, n.fecha,
         c.nombre, n.cliente_id, c.rif,
         null, null, null, null, n.moneda,
         case when n.estado = 'ANULADA' then 'ANULADA' else 'RESPALDO' end,
         'Respalda la nota de salida ' || n.nota_salida,
         null, null, null
    from public.notas_entrega n
    left join public.clientes c on c.id = n.cliente_id
   where n.nota_salida is not null

  union all

  -- C y D) Cada asiento de una nota de salida: hacia fuera es un despacho;
  --        hacia un área de la empresa se ve como interna y no suma.
  select 'NS:' || m.id, 'NOTA_SALIDA', m.nota_salida, m.fecha,
         coalesce(cl.nombre, m.destino_externo, g.nombre),
         eq.cliente_id, cl.rif,
         a.nombre, m.cantidad::numeric, m.unidad,
         null, null,
         case
           when exists (select 1 from public.inventario_movimientos x
                         where x.movimiento_origen = m.id and x.tipo = 'REVERSO') then 'DESHECHA'
           when m.destino_externo is null then 'INTERNA'
           else 'VIGENTE'
         end,
         case
           when m.destino_externo is null then 'Salida interna'
           else (select 'Tiene la nota de entrega ' || ne.numero
                   from public.notas_entrega ne
                  where ne.nota_salida = m.nota_salida and ne.estado <> 'ANULADA' limit 1)
         end,
         null, m.id, m.destino_externo
    from public.inventario_movimientos m
    join public.articulos a on a.id = m.articulo_id
    left join public.organigrama_nodos g on g.id = m.grupo_id
    left join public.control_despacho_clientes eq on eq.destino = upper(btrim(m.destino_externo))
    left join public.clientes cl on cl.id = eq.cliente_id
   where m.nota_salida is not null and m.signo = -1 and m.tipo <> 'REVERSO'

  union all

  -- E) El número que la serie gastó y no tiene nada detrás.
  select s.prefijo || '#' || s.numero,
         case s.prefijo when 'NE' then 'NOTA_ENTREGA' else 'NOTA_SALIDA' end,
         s.numero, null, null, null, null, null, null, null, null, null,
         'SIN_DOCUMENTO', 'La serie gastó este número y no hay documento con él',
         null, null, null
    from serie s
   where (s.prefijo = 'NE' and not exists (select 1 from public.notas_entrega n where n.numero = s.numero))
      or (s.prefijo = 'NS' and not exists (select 1 from public.inventario_movimientos m where m.nota_salida = s.numero))
)
select b.clave, b.origen, b.documento, b.fecha,
       b.cliente, b.cliente_id, b.destino_escrito,
       coalesce(cd.rif, b.rif_doc)                         as rif,
       (cd.rif is null and b.rif_doc is not null)          as rif_del_cliente,
       b.material, b.cantidad, b.unidad,
       coalesce(cd.precio_usd, b.precio_doc)               as precio,
       (cd.precio_usd is null and b.precio_doc is not null) as precio_de_la_nota,
       b.moneda_doc,
       case when b.estado_doc = 'VIGENTE'
            then round(coalesce(cd.precio_usd, b.precio_doc) * b.cantidad, 2) end as monto,
       cd.estado_control, e.nombre as estado_control_nombre,
       cd.observacion, cd.extra,
       b.estado_doc, b.detalle,
       b.renglon_id, b.movimiento_id,
       (b.estado_doc = 'VIGENTE' and coalesce(cd.rif, b.rif_doc) is null) as falta_rif
  from base b
  left join public.control_despacho cd
    on cd.renglon_id = b.renglon_id or cd.movimiento_id = b.movimiento_id
  left join public.control_despacho_estados e on e.codigo = cd.estado_control;

revoke all on public.v_control_despacho from public, anon;
grant select on public.v_control_despacho to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Guardar lo que se escribe a mano en una fila
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.guardar_control_despacho(
  p_origen text, p_id bigint,
  p_rif text default null, p_precio numeric default null, p_estado text default null,
  p_observacion text default null, p_extra text default null
)
returns bigint
language plpgsql security definer set search_path to ''
as $$
declare
  v_id bigint;
  v_rif text := nullif(btrim(coalesce(p_rif, '')), '');
begin
  perform private.exigir_permiso('CONTROL_DESPACHO', 'ESCRITURA');

  if p_origen not in ('NOTA_ENTREGA', 'NOTA_SALIDA') then
    raise exception 'El origen de la fila no se entiende.' using errcode = '22023';
  end if;
  if p_precio is not null and p_precio < 0 then
    raise exception 'El precio no puede ser negativo.' using errcode = '22023';
  end if;
  if p_estado is not null and not exists (
       select 1 from public.control_despacho_estados e where e.codigo = p_estado and e.activo) then
    raise exception 'Ese estado no está en la lista, o está apagado.' using errcode = '23503';
  end if;
  if p_origen = 'NOTA_ENTREGA' and not exists (select 1 from public.nota_entrega_renglones where id = p_id) then
    raise exception 'Ese renglón de nota de entrega no existe.' using errcode = 'P0002';
  end if;
  if p_origen = 'NOTA_SALIDA' and not exists (
       select 1 from public.inventario_movimientos where id = p_id and nota_salida is not null) then
    raise exception 'Ese asiento no es de una nota de salida.' using errcode = 'P0002';
  end if;

  if p_origen = 'NOTA_ENTREGA' then
    insert into public.control_despacho (origen, renglon_id, rif, precio_usd, estado_control, observacion, extra, registrado_por)
    values (p_origen, p_id, v_rif, p_precio, p_estado, nullif(btrim(coalesce(p_observacion,'')),''), nullif(btrim(coalesce(p_extra,'')),''), (select auth.uid()))
    on conflict (renglon_id) do update
      set rif = excluded.rif, precio_usd = excluded.precio_usd, estado_control = excluded.estado_control,
          observacion = excluded.observacion, extra = excluded.extra,
          actualizado_por = (select auth.uid()), actualizado_en = now()
    returning id into v_id;
  else
    insert into public.control_despacho (origen, movimiento_id, rif, precio_usd, estado_control, observacion, extra, registrado_por)
    values (p_origen, p_id, v_rif, p_precio, p_estado, nullif(btrim(coalesce(p_observacion,'')),''), nullif(btrim(coalesce(p_extra,'')),''), (select auth.uid()))
    on conflict (movimiento_id) do update
      set rif = excluded.rif, precio_usd = excluded.precio_usd, estado_control = excluded.estado_control,
          observacion = excluded.observacion, extra = excluded.extra,
          actualizado_por = (select auth.uid()), actualizado_en = now()
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- A qué cliente corresponde un nombre escrito a mano. Nulo lo desvincula.
create or replace function public.vincular_cliente_de_destino(p_destino text, p_cliente_id bigint)
returns void
language plpgsql security definer set search_path to ''
as $$
declare
  v_destino text := upper(btrim(coalesce(p_destino, '')));
begin
  perform private.exigir_permiso('CONTROL_DESPACHO', 'ESCRITURA');
  if length(v_destino) < 2 then
    raise exception 'Falta el nombre escrito en la salida.' using errcode = '22023';
  end if;
  if p_cliente_id is null then
    delete from public.control_despacho_clientes where destino = v_destino;
    return;
  end if;
  if not exists (select 1 from public.clientes where id = p_cliente_id) then
    raise exception 'No existe ese cliente.' using errcode = 'P0002';
  end if;
  insert into public.control_despacho_clientes (destino, cliente_id, creado_por)
  values (v_destino, p_cliente_id, (select auth.uid()))
  on conflict (destino) do update set cliente_id = excluded.cliente_id;
end;
$$;

-- La lista de estados
create or replace function public.guardar_estado_de_control(
  p_codigo text, p_nombre text, p_orden smallint default 100, p_activo boolean default true)
returns text
language plpgsql security definer set search_path to ''
as $$
declare
  v_nombre text := upper(btrim(coalesce(p_nombre, '')));
  v_codigo text := nullif(btrim(coalesce(p_codigo, '')), '');
begin
  perform private.exigir_permiso('CONTROL_DESPACHO', 'TOTAL');
  if length(v_nombre) < 2 then
    raise exception 'Ponle nombre al estado.' using errcode = '22023';
  end if;
  v_codigo := coalesce(v_codigo, regexp_replace(private.en_mayuscula(v_nombre), '[^A-Z0-9]+', '_', 'g'));
  insert into public.control_despacho_estados (codigo, nombre, orden, activo)
  values (v_codigo, v_nombre, coalesce(p_orden, 100), coalesce(p_activo, true))
  on conflict (codigo) do update
    set nombre = excluded.nombre, orden = excluded.orden, activo = excluded.activo;
  return v_codigo;
end;
$$;

create or replace function public.guardar_columna_libre_de_control(p_nombre text)
returns void
language plpgsql security definer set search_path to ''
as $$
begin
  perform private.exigir_permiso('CONTROL_DESPACHO', 'TOTAL');
  if length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'Ponle nombre a la columna.' using errcode = '22023';
  end if;
  update public.control_despacho_config set columna_libre = btrim(p_nombre) where unica;
end;
$$;

revoke execute on function public.guardar_control_despacho(text,bigint,text,numeric,text,text,text) from public, anon;
revoke execute on function public.vincular_cliente_de_destino(text,bigint) from public, anon;
revoke execute on function public.guardar_estado_de_control(text,text,smallint,boolean) from public, anon;
revoke execute on function public.guardar_columna_libre_de_control(text) from public, anon;
grant execute on function public.guardar_control_despacho(text,bigint,text,numeric,text,text,text) to authenticated;
grant execute on function public.vincular_cliente_de_destino(text,bigint) to authenticated;
grant execute on function public.guardar_estado_de_control(text,text,smallint,boolean) to authenticated;
grant execute on function public.guardar_columna_libre_de_control(text) to authenticated;
