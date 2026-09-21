-- ═══════════════════════════════════════════════════════════════════════════
-- LA SALIDA PUEDE DEJAR SU NOTA DE ENTREGA
--
-- Christopher, 21/09/2026: «a la hora de hacer una nota de salida, un check que
-- si lo coloca activo eso generará una nota de entrega. Lo que se imprime para
-- el cliente es la nota de salida nada más, pero a nivel de sistema se pueden
-- imprimir las dos en cualquier momento».
--
-- Y sobre cada duda:
--   · el cliente: «los datos que existan en esa nota de salida deben existir
--     por igual en la nota de entrega; si no hay coincidencias, dar opción para
--     crearlo o denotar visualmente que tiene un aspecto pendiente»;
--   · los precios: «con lo exactamente mismo que la nota de salida» —que no
--     tiene—, así que la nota nace sin ellos y queda PENDIENTE;
--   · facturable: «que sea seleccionable por el usuario»;
--   · el permiso: «que sea un permiso extendido».
--
-- LO QUE NO SE TOCA. El material ya lo descontó la salida. Esta nota documenta
-- ese mismo movimiento: sus renglones dejan `movimiento_id` en nulo —que es lo
-- que `anular_nota_entrega` recorre para reversar— y guardan el asiento de la
-- salida en `movimiento_salida_id`. Anularla no devuelve nada al almacén.
--
-- Y el candado de «una venta no es un motivo de salida» sigue donde estaba: la
-- salida no dice que es una venta; deja su respaldo del lado de facturación.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Las columnas
-- ───────────────────────────────────────────────────────────────────────────
alter table public.notas_entrega
  add column if not exists nota_salida text,
  add column if not exists solicitud_salida_id bigint references public.solicitudes_salida(id),
  add column if not exists facturable boolean not null default true;

comment on column public.notas_entrega.nota_salida is
  'El NS del que nació esta nota. Nulo en las notas de siempre, que nacen de un despacho aprobado.';
comment on column public.notas_entrega.facturable is
  'Falso: queda de respaldo y no entra nunca a una factura, aunque esté completa.';

-- El cliente deja de ser obligatorio SOLO para poder quedar pendiente.
alter table public.notas_entrega alter column cliente_id drop not null;

alter table public.notas_entrega drop constraint notas_entrega_estado_check;
alter table public.notas_entrega add constraint notas_entrega_estado_check
  check (estado in ('PENDIENTE', 'DESPACHADA', 'FACTURADA', 'ANULADA'));

alter table public.notas_entrega add constraint nota_pendiente_viene_de_salida
  check (estado <> 'PENDIENTE' or nota_salida is not null);

alter table public.notas_entrega add constraint nota_sin_cliente_esta_pendiente
  check (cliente_id is not null or estado in ('PENDIENTE', 'ANULADA'));

-- Una salida deja una sola nota viva. Anulada, se puede rehacer.
create unique index if not exists notas_entrega_una_por_salida
  on public.notas_entrega (nota_salida)
  where nota_salida is not null and estado <> 'ANULADA';

alter table public.nota_entrega_renglones
  add column if not exists movimiento_salida_id bigint references public.inventario_movimientos(id),
  add column if not exists precio_pendiente boolean not null default false;

comment on column public.nota_entrega_renglones.movimiento_salida_id is
  'El asiento con que la SALIDA descontó este material. Va aquí y no en movimiento_id a propósito: anular la nota no debe devolver lo que salió por otra puerta.';
comment on column public.nota_entrega_renglones.precio_pendiente is
  'Nació sin precio porque la nota de salida no lo tiene. No es un «sin cargo» de verdad: falta ponérselo.';

alter table public.nota_entrega_renglones add constraint renglon_cuelga_de_un_solo_asiento
  check (movimiento_id is null or movimiento_salida_id is null);

create index if not exists nota_entrega_renglones_movimiento_salida
  on public.nota_entrega_renglones (movimiento_salida_id) where movimiento_salida_id is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. La casilla, que solo se tiene por permiso extendido
--
-- `nivel_equivalente` nulo: ningún nivel de módulo la concede. Y no se le pone
-- a ningún rol: se presta persona por persona desde Permisos extendidos.
-- ───────────────────────────────────────────────────────────────────────────
insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente)
values ('SALIDAS.GENERAR_NOTA_ENTREGA', 'SALIDAS',
        'Generar la nota de entrega de una salida',
        'Al imprimir una nota de salida hacia fuera, deja además su nota de entrega de respaldo. No la da ningún nivel ni ningún rol: se presta desde Permisos extendidos.',
        95, null)
on conflict (codigo) do update
  set nombre = excluded.nombre, dice = excluded.dice, nivel_equivalente = null;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. La que es solo respaldo no entra a una factura, por ninguna puerta
--
-- Un disparador y no un parche en `facturar_notas`, `enlazar_nota_a_factura` y
-- las que vengan: la regla vive en la tabla y cubre a todas a la vez.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function private.trg_la_nota_de_respaldo_no_se_factura()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if not new.facturable and (new.estado = 'FACTURADA' or new.factura_id is not null) then
    raise exception 'La nota % se dejó marcada como respaldo, no para cobrar. Si hay que facturarla, márcala como facturable primero.', new.numero
      using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_respaldo_no_se_factura on public.notas_entrega;
create trigger trg_respaldo_no_se_factura
  before update on public.notas_entrega
  for each row execute function private.trg_la_nota_de_respaldo_no_se_factura();

-- ───────────────────────────────────────────────────────────────────────────
-- 4. A quién se parece el destino
--
-- Solo si hay EXACTAMENTE una coincidencia. Con dos, nulo: adivinar el cliente
-- equivocado es peor que preguntar.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.cliente_que_se_parece(p_nombre text)
returns bigint
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_nombre text := upper(btrim(coalesce(p_nombre, '')));
  v_ids    bigint[];
begin
  perform private.exigir_permiso('SALIDAS', 'LECTURA');

  if length(v_nombre) < 3 then
    return null;
  end if;

  select array_agg(c.id) into v_ids
    from public.clientes c
   where c.activo
     and (upper(btrim(c.nombre)) = v_nombre
          or upper(btrim(coalesce(c.nombre_comercial, ''))) = v_nombre);

  if array_length(v_ids, 1) = 1 then
    return v_ids[1];
  end if;
  return null;
end;
$$;

revoke execute on function public.cliente_que_se_parece(text) from public, anon;
grant execute on function public.cliente_que_se_parece(text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Generar la nota de entrega de una salida
--
-- p_precios: [{"movimiento_id": 12, "precio": 35.5}, …]. Por asiento y no por
-- artículo: el mismo artículo puede salir dos veces en la misma nota.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.generar_nota_de_entrega(
  p_nota_salida text,
  p_cliente_id  bigint  default null,
  p_precios     jsonb   default null,
  p_facturable  boolean default true
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ns        text := upper(btrim(coalesce(p_nota_salida, '')));
  v_cab       record;
  v_cliente   record;
  v_moneda    text := 'USD';
  v_tasas     record;
  v_nota_id   bigint;
  v_numero    text;
  v_mov       record;
  v_linea     smallint := 0;
  v_precio    numeric;
  v_faltan    integer := 0;
  v_otra      text;
begin
  perform private.exigir_accion('SALIDAS.GENERAR_NOTA_ENTREGA');

  if p_precios is not null and jsonb_typeof(p_precios) <> 'array' then
    raise exception 'Los precios llegaron con una forma que no se entiende.' using errcode = '22023';
  end if;

  -- Lo que de verdad salió y sigue fuera: los asientos de esa nota que nadie
  -- reversó después.
  select min(m.almacen_id) as almacen_id, max(m.fecha) as fecha,
         max(m.destino_externo) as destino, max(m.grupo_id) as grupo_id,
         max(m.nota) as motivo, count(*) as cuantos
    into v_cab
    from public.inventario_movimientos m
   where m.nota_salida = v_ns and m.signo = -1 and m.tipo <> 'REVERSO'
     and not exists (select 1 from public.inventario_movimientos r
                      where r.movimiento_origen = m.id and r.tipo = 'REVERSO');

  if coalesce(v_cab.cuantos, 0) = 0 then
    raise exception 'No hay nada que respaldar en la nota de salida %: no existe, o todo lo que sacó se deshizo.', v_ns
      using errcode = 'P0002';
  end if;

  if exists (select 1 from public.inventario_movimientos m
              where m.nota_salida = v_ns and m.tipo = 'SALIDA_INTERCAMBIO') then
    raise exception 'La nota de salida % pagó una compra con material: eso es una compra, no una entrega a un cliente.', v_ns
      using errcode = '22023';
  end if;

  if v_cab.destino is null then
    raise exception 'La nota de salida % fue para un área de la empresa. Una nota de entrega es para alguien de fuera: aquí no hay a quién entregarle.', v_ns
      using errcode = '22023';
  end if;

  select n.numero into v_otra
    from public.notas_entrega n
   where n.nota_salida = v_ns and n.estado <> 'ANULADA';
  if v_otra is not null then
    raise exception 'La nota de salida % ya dejó su nota de entrega: %.', v_ns, v_otra
      using errcode = '55000';
  end if;

  if p_cliente_id is not null then
    select id, nombre, activo, moneda_preferida into v_cliente
      from public.clientes where id = p_cliente_id;
    if v_cliente.id is null then
      raise exception 'No existe ese cliente.' using errcode = 'P0002';
    end if;
    if not v_cliente.activo then
      raise exception 'El cliente % está desactivado.', v_cliente.nombre using errcode = '55000';
    end if;
    v_moneda := coalesce(v_cliente.moneda_preferida, 'USD');
  end if;

  select * into v_tasas from private.tasas_del_dia(v_moneda::char(3), v_cab.fecha);

  v_numero := private.siguiente_numero('NE');

  -- Nace PENDIENTE y se asciende al final, cuando ya se sabe si le falta algo.
  insert into public.notas_entrega (
    numero, cliente_id, almacen_id, fecha, moneda, tasa, tasa_usd, alicuota_iva,
    descuento, flete, subtotal, base_imponible, iva, total, estado, observacion,
    despachada_por, nota_salida, solicitud_salida_id, facturable)
  values (
    v_numero, p_cliente_id, v_cab.almacen_id, v_cab.fecha, v_moneda, v_tasas.tasa, v_tasas.tasa_usd, 0,
    0, 0, 0, 0, 0, 0, 'PENDIENTE',
    format('Respalda la nota de salida %s, entregada a %s. %s', v_ns, v_cab.destino, coalesce(v_cab.motivo, '')),
    (select auth.uid()), v_ns,
    (select s.id from public.solicitudes_salida s where s.nota_salida = v_ns limit 1),
    coalesce(p_facturable, true))
  returning id into v_nota_id;

  for v_mov in
    select m.id, m.almacen_id, m.articulo_id, m.cantidad, m.unidad, a.nombre as articulo
      from public.inventario_movimientos m
      join public.articulos a on a.id = m.articulo_id
     where m.nota_salida = v_ns and m.signo = -1 and m.tipo <> 'REVERSO'
       and not exists (select 1 from public.inventario_movimientos r
                        where r.movimiento_origen = m.id and r.tipo = 'REVERSO')
     order by m.id
  loop
    v_linea := v_linea + 1;
    v_precio := null;

    select nullif(x ->> 'precio', '')::numeric into v_precio
      from jsonb_array_elements(coalesce(p_precios, '[]'::jsonb)) x
     where (x ->> 'movimiento_id')::bigint = v_mov.id
     limit 1;

    if v_precio is not null and v_precio < 0 then
      raise exception 'El precio de «%» no puede ser negativo.', v_mov.articulo using errcode = '22023';
    end if;

    if coalesce(v_precio, 0) > 0 then
      insert into public.nota_entrega_renglones (
        nota_id, linea, articulo_id, descripcion, cantidad, unidad, precio_unitario,
        exento_iva, condicion, almacen_id, movimiento_salida_id, precio_pendiente)
      values (
        v_nota_id, v_linea, v_mov.articulo_id, v_mov.articulo, v_mov.cantidad, v_mov.unidad, v_precio,
        false, 'ACORDADO', v_mov.almacen_id, v_mov.id, false);
    else
      v_faltan := v_faltan + 1;
      insert into public.nota_entrega_renglones (
        nota_id, linea, articulo_id, descripcion, cantidad, unidad, precio_unitario,
        exento_iva, condicion, motivo_condicion, almacen_id, movimiento_salida_id, precio_pendiente)
      values (
        v_nota_id, v_linea, v_mov.articulo_id, v_mov.articulo, v_mov.cantidad, v_mov.unidad, 0,
        false, 'SIN_CARGO', format('Falta ponerle precio: nació de la nota de salida %s', v_ns),
        v_mov.almacen_id, v_mov.id, true);
    end if;
  end loop;

  if p_cliente_id is not null and v_faltan = 0 then
    update public.notas_entrega set estado = 'DESPACHADA' where id = v_nota_id;
  end if;

  return v_nota_id;
end;
$$;

revoke execute on function public.generar_nota_de_entrega(text, bigint, jsonb, boolean) from public, anon;
grant execute on function public.generar_nota_de_entrega(text, bigint, jsonb, boolean) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Completar la que quedó pendiente
--
-- Ponerle cliente y precio a una venta es de facturación, no del almacén.
-- p_precios: [{"renglon_id": 40, "precio": 35.5}, …]
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.completar_nota_de_entrega(
  p_id          bigint,
  p_cliente_id  bigint  default null,
  p_precios     jsonb   default null,
  p_moneda      text    default null,
  p_facturable  boolean default null
)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_nota    record;
  v_cliente record;
  v_tasas   record;
  v_x       jsonb;
  v_precio  numeric;
  v_faltan  integer;
begin
  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');

  if p_precios is not null and jsonb_typeof(p_precios) <> 'array' then
    raise exception 'Los precios llegaron con una forma que no se entiende.' using errcode = '22023';
  end if;

  select * into v_nota from public.notas_entrega where id = p_id for update;
  if v_nota.id is null then
    raise exception 'No existe la nota de entrega %.', p_id using errcode = 'P0002';
  end if;
  if v_nota.estado <> 'PENDIENTE' then
    raise exception 'La nota % está %: solo se completa una que esté pendiente.', v_nota.numero, lower(v_nota.estado)
      using errcode = '55000';
  end if;

  if p_cliente_id is not null then
    select id, nombre, activo into v_cliente from public.clientes where id = p_cliente_id;
    if v_cliente.id is null then
      raise exception 'No existe ese cliente.' using errcode = 'P0002';
    end if;
    if not v_cliente.activo then
      raise exception 'El cliente % está desactivado.', v_cliente.nombre using errcode = '55000';
    end if;
    update public.notas_entrega set cliente_id = p_cliente_id where id = p_id;
  end if;

  if p_moneda is not null and upper(btrim(p_moneda)) <> v_nota.moneda then
    select * into v_tasas from private.tasas_del_dia(upper(btrim(p_moneda))::char(3), v_nota.fecha);
    update public.notas_entrega
       set moneda = upper(btrim(p_moneda)), tasa = v_tasas.tasa, tasa_usd = v_tasas.tasa_usd
     where id = p_id;
  end if;

  if p_facturable is not null then
    update public.notas_entrega set facturable = p_facturable where id = p_id;
  end if;

  for v_x in select * from jsonb_array_elements(coalesce(p_precios, '[]'::jsonb))
  loop
    v_precio := nullif(v_x ->> 'precio', '')::numeric;
    if v_precio is null or v_precio <= 0 then
      continue;
    end if;
    update public.nota_entrega_renglones
       set precio_unitario = v_precio, condicion = 'ACORDADO', motivo_condicion = null,
           precio_pendiente = false
     where id = (v_x ->> 'renglon_id')::bigint and nota_id = p_id;
    if not found then
      raise exception 'Uno de los renglones indicados no es de la nota %.', v_nota.numero using errcode = '22023';
    end if;
  end loop;

  select count(*) into v_faltan
    from public.nota_entrega_renglones where nota_id = p_id and precio_pendiente;

  if v_faltan = 0 and (select cliente_id from public.notas_entrega where id = p_id) is not null then
    update public.notas_entrega set estado = 'DESPACHADA' where id = p_id;
    return 'DESPACHADA';
  end if;
  return 'PENDIENTE';
end;
$$;

revoke execute on function public.completar_nota_de_entrega(bigint, bigint, jsonb, text, boolean) from public, anon;
grant execute on function public.completar_nota_de_entrega(bigint, bigint, jsonb, text, boolean) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. La vista: el cliente puede faltar, y dice de dónde nació
--
-- El mismo cuerpo de antes (con su enmascarado del dinero intacto); cambia el
-- JOIN de clientes a LEFT JOIN y se añaden columnas AL FINAL, que es lo único
-- que `create or replace view` deja hacer.
-- ───────────────────────────────────────────────────────────────────────────
do $vista$
declare
  v_def text;
  v_join text := 'JOIN clientes cl ON cl.id = n.cliente_id';
  v_cola text := E'AS renglones\n   FROM notas_entrega n';
begin
  -- Con public en el camino la definición sale sin prefijos, que es como están las anclas.
  set local search_path to public;
  v_def := pg_get_viewdef('public.v_notas_entrega'::regclass, true);

  if position('nota_salida' in v_def) > 0 then
    return; -- ya aplicada
  end if;
  if (length(v_def) - length(replace(v_def, v_join, ''))) / length(v_join) <> 1
     or (length(v_def) - length(replace(v_def, v_cola, ''))) / length(v_cola) <> 1
     or position('LEFT ' || v_join in v_def) > 0 then
    raise exception 'v_notas_entrega no es la esperada: no se toca.';
  end if;

  v_def := replace(v_def, v_join, 'LEFT ' || v_join);
  v_def := replace(v_def, v_cola,
    E'AS renglones,\n    n.nota_salida,\n    n.solicitud_salida_id,\n    n.facturable,\n'
    || E'    (( SELECT count(*) FROM nota_entrega_renglones r2 WHERE r2.nota_id = n.id AND r2.precio_pendiente))::integer AS precios_pendientes\n'
    || E'   FROM notas_entrega n');

  execute 'create or replace view public.v_notas_entrega with (security_invoker = on) as ' || v_def;
end
$vista$;

-- ───────────────────────────────────────────────────────────────────────────
-- 8. Comprobación
-- ───────────────────────────────────────────────────────────────────────────
do $comprueba$
begin
  if exists (select 1 from public.rol_acciones where accion = 'SALIDAS.GENERAR_NOTA_ENTREGA') then
    raise exception 'La casilla no puede venir por rol: es de las que solo se prestan.';
  end if;
  if (select nivel_equivalente from public.acciones where codigo = 'SALIDAS.GENERAR_NOTA_ENTREGA') is not null then
    raise exception 'La casilla no puede colgar de un nivel de módulo.';
  end if;
  if position('nota_salida' in pg_get_viewdef('public.v_notas_entrega'::regclass)) = 0
     or position('LEFT JOIN' in pg_get_viewdef('public.v_notas_entrega'::regclass)) = 0 then
    raise exception 'La vista no quedó con el cliente opcional y el origen.';
  end if;
  if (select array_to_string(reloptions, ',') from pg_class where oid = 'public.v_notas_entrega'::regclass)
     is distinct from 'security_invoker=on' then
    raise exception 'La vista perdió security_invoker.';
  end if;
end
$comprueba$;
