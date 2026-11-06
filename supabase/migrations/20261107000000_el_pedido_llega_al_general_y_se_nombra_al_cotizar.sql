/*
  FLUJO NUEVO DE COMPRAS
  EL PEDIDO LLEGA AL ALMACÉN GENERAL Y SE NOMBRA AL COTIZAR

  Angélica, 06/11/2026: «en la solicitud de pedido ... ahora no se podrá
  escoger a qué almacén va, porque todo llega al general y del general se
  harán traslados a los almacenes que corresponda. Además ... el pedido será
  con palabras generales, ejemplo: Botas, y la cantidad. Y al momento de
  cotizar se tendrá la opción de guardar con ese nombre en el inventario o se
  podrá editar para que tome el nombre real en el inventario».

  QUÉ CAMBIA
  1. Todo pedido del flujo (no la compra directa) va a ALM-GEN. La base lo pone
     sola, diga lo que diga la pantalla.
  2. El renglón guarda cómo se pidió (`descripcion_pedida`: «Botas») aparte de
     cómo se llama en el inventario.
  3. `vincular_renglon_al_inventario`: Compras dice a qué artículo corresponde
     el renglón (uno que ya existe, o uno que acaba de crear con ese nombre o
     con otro). El renglón toma el nombre y la unidad del artículo.
  4. No se propone una cotización mientras algún renglón suyo no tenga
     artículo: sin artículo, lo que llega no entra al inventario.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Cómo se pidió
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.solicitud_renglones
  add column if not exists descripcion_pedida text;

comment on column public.solicitud_renglones.descripcion_pedida is
  'Lo que escribió quien pidió («Botas»), si Compras le dio después el nombre del inventario.';

-- La corrección de un pedido reescribe los renglones: que no pierda el nombre
-- con que se pidió.
create or replace function private.escribir_renglones(p_solicitud_id bigint, p_renglones jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item  jsonb;
  v_linea smallint := 0;
begin
  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El pedido necesita al menos un renglón.' using errcode = '22023';
  end if;

  delete from public.solicitud_renglones where solicitud_id = p_solicitud_id;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_linea := v_linea + 1;

    if length(trim(coalesce(v_item->>'descripcion', ''))) < 2 then
      raise exception 'El renglón % no tiene descripción.', v_linea using errcode = '22023';
    end if;

    if coalesce((v_item->>'cantidad')::numeric, 0) <= 0 then
      raise exception 'La cantidad del renglón % debe ser mayor que cero.', v_linea
        using errcode = '22023';
    end if;

    insert into public.solicitud_renglones
      (solicitud_id, linea, articulo_id, descripcion, cantidad, unidad, observacion,
       descripcion_pedida)
    values
      (p_solicitud_id, v_linea,
       nullif(v_item->>'articulo_id', '')::bigint,
       trim(v_item->>'descripcion'),
       (v_item->>'cantidad')::numeric,
       coalesce(nullif(v_item->>'unidad', ''), 'UND'),
       nullif(trim(coalesce(v_item->>'observacion', '')), ''),
       nullif(trim(coalesce(v_item->>'descripcion_pedida', '')), ''));
  end loop;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Todo llega al almacén general
--
-- `crear_pedido` y `actualizar_pedido` siguen aceptando un destino, pero en el
-- flujo de compras se ignora: de ALM-GEN se traslada a donde haga falta. La
-- compra directa (`directa`) sigue entrando donde diga.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function private.el_pedido_llega_al_general()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_alm    bigint := private.almacen_que_revisa_pedidos();
  v_nombre text;
begin
  if v_alm is null then
    return new;
  end if;

  select nombre into v_nombre from public.almacenes where id = v_alm;

  new.destino_almacen_id := v_alm;
  new.destino := v_nombre;
  return new;
end;
$function$;

drop trigger if exists trg_el_pedido_llega_al_general on public.solicitudes_pedido;
create trigger trg_el_pedido_llega_al_general
  before insert or update of destino, destino_almacen_id on public.solicitudes_pedido
  for each row
  when (not new.directa and new.historico_en is null)
  execute function private.el_pedido_llega_al_general();

revoke all on function private.el_pedido_llega_al_general() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Compras le da al renglón su nombre en el inventario
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.vincular_renglon_al_inventario(
  p_renglon_id bigint,
  p_articulo_id bigint
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sr     public.solicitud_renglones;
  v_estado text;
  v_art    public.articulos;
begin
  perform private.exigir_rol('COMPRAS');

  select sr.* into v_sr
  from public.solicitud_renglones sr
  where sr.id = p_renglon_id
  for update;

  if v_sr.id is null then
    raise exception 'Ese renglón no existe.' using errcode = 'P0002';
  end if;

  select estado into v_estado
  from public.solicitudes_pedido
  where id = v_sr.solicitud_id
  for update;

  -- Después de proponer, lo que Norbelis ve y aprueba no cambia por debajo.
  if v_estado not in ('PEDIDO', 'CONFIRMADA') then
    raise exception 'Este pedido está en "%": el artículo del inventario se elige mientras se cotiza.',
      v_estado using errcode = '55000';
  end if;

  select a.* into v_art from public.articulos a where a.id = p_articulo_id;

  if v_art.id is null or not v_art.activo then
    raise exception 'Ese artículo no existe en el inventario o está inactivo.' using errcode = '22023';
  end if;

  update public.solicitud_renglones
     set descripcion_pedida = coalesce(descripcion_pedida, descripcion),
         articulo_id = v_art.id,
         descripcion = v_art.nombre,
         unidad = v_art.unidad
   where id = v_sr.id;
end;
$function$;

revoke all on function public.vincular_renglon_al_inventario(bigint, bigint) from public, anon;
grant execute on function public.vincular_renglon_al_inventario(bigint, bigint) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. No se propone lo que no tiene nombre en el inventario
--
-- La `proponer_cotizacion` de siempre con una comprobación más.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.proponer_cotizacion(
  p_solicitud_id bigint,
  p_cotizacion_id bigint,
  p_nota text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_estado    text;
  v_propuesta boolean;
  v_numero    text;
  v_sin       text;
begin
  perform private.exigir_rol('COMPRAS');

  select estado into v_estado
  from public.solicitudes_pedido where id = p_solicitud_id;

  if v_estado is null then
    raise exception 'No existe el pedido %.', p_solicitud_id using errcode = 'P0002';
  end if;

  if v_estado not in ('CONFIRMADA', 'POR_CONFIRMAR_GERENTE') then
    raise exception 'Este pedido está en "%" y no se puede proponer al gerente.', v_estado
      using errcode = '55000';
  end if;

  select numero, propuesta into v_numero, v_propuesta
  from public.cotizaciones
  where id = p_cotizacion_id and solicitud_id = p_solicitud_id;

  if v_numero is null then
    raise exception 'Esa cotización no pertenece a este pedido.' using errcode = '22023';
  end if;

  if v_propuesta then
    return;
  end if;

  -- Sin artículo, lo que llegue no entra al inventario.
  select string_agg(format('«%s»', sr.descripcion), ', ' order by sr.linea) into v_sin
  from public.cotizacion_renglones cr
  join public.solicitud_renglones sr on sr.id = cr.solicitud_renglon_id
  where cr.cotizacion_id = p_cotizacion_id and sr.articulo_id is null;

  if v_sin is not null then
    raise exception 'Antes de proponer, diga con qué nombre entra al inventario: %.', v_sin
      using errcode = '55000',
            hint = 'En la cotización, en cada renglón: guárdelo con ese nombre o elija el artículo real.';
  end if;

  update public.cotizaciones set propuesta = true where id = p_cotizacion_id;

  if v_estado <> 'POR_CONFIRMAR_GERENTE' then
    update public.solicitudes_pedido
       set estado = 'POR_CONFIRMAR_GERENTE', propuesta_en = now()
     where id = p_solicitud_id;

    perform private.anotar(
      'SOLICITUD', p_solicitud_id, v_estado, 'POR_CONFIRMAR_GERENTE',
      trim(coalesce(nullif(trim(p_nota), '') || ' — ', '') || format('Propuesta %s', v_numero)));
  else
    perform private.anotar(
      'SOLICITUD', p_solicitud_id, v_estado, 'POR_CONFIRMAR_GERENTE',
      trim(coalesce(nullif(trim(p_nota), '') || ' — ', '') || format('Se añadió %s a lo propuesto', v_numero)));
  end if;
end;
$function$;
