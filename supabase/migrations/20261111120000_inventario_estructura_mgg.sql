-- INVENTARIO Y ALMACENES CON LA ESTRUCTURA DE MGG (la dueña, 11/11/2026:
-- «trae la estructura para inventario y almacenes… las vistas de teléfono y
-- toda la funcionalidad, con los estilos de acá»).
--
-- Lo que de MGG faltaba después de la copia del 08/11 (todo aditivo, no toca
-- datos ni el libro de movimientos):
--   1. La ficha del producto de MGG: ubicación física, alias de búsqueda,
--      modelo, fabricante, color y un umbral de reabastecimiento propio.
--   2. Subalmacenes: un almacén puede colgar de otro (MGG `parent_id`).
--   3. Editar una solicitud de salida antes de entregarla (MGG «Editar»).

-- ---------------------------------------------------------------------------
-- 1. La ficha del producto
-- ---------------------------------------------------------------------------
alter table public.articulos
  add column if not exists ubicacion_fisica text,
  add column if not exists alias text,
  add column if not exists modelo text,
  add column if not exists fabricante text,
  add column if not exists color text,
  add column if not exists restock_pct numeric;

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'articulos_restock_pct_valido') then
    alter table public.articulos
      add constraint articulos_restock_pct_valido check (restock_pct is null or (restock_pct > 0 and restock_pct <= 1000));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'articulos_ficha_mgg_largo') then
    alter table public.articulos
      add constraint articulos_ficha_mgg_largo check (
        coalesce(length(ubicacion_fisica), 0) <= 80 and coalesce(length(alias), 0) <= 200
        and coalesce(length(modelo), 0) <= 80 and coalesce(length(fabricante), 0) <= 80
        and coalesce(length(color), 0) <= 40);
  end if;
end
$c$;

-- Se guarda aparte de crear/editar el artículo para no cambiar esas firmas,
-- que usan el teléfono, la PC y la carga por planilla.
create or replace function public.guardar_ficha_de_articulo(
  p_id bigint,
  p_ubicacion_fisica text default null,
  p_alias text default null,
  p_modelo text default null,
  p_fabricante text default null,
  p_color text default null,
  p_restock_pct numeric default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_rol('COMPRAS', 'ALMACEN');
  if not exists (select 1 from public.articulos where id = p_id) then
    raise exception 'Ese producto no existe.' using errcode = 'P0002';
  end if;
  if p_restock_pct is not null and (p_restock_pct <= 0 or p_restock_pct > 1000) then
    raise exception 'El umbral de reabastecimiento va de 1 %% a 1000 %% del mínimo.' using errcode = '22023';
  end if;

  update public.articulos
     set ubicacion_fisica = upper(nullif(btrim(coalesce(p_ubicacion_fisica, '')), '')),
         alias            = nullif(btrim(coalesce(p_alias, '')), ''),
         modelo           = nullif(btrim(coalesce(p_modelo, '')), ''),
         fabricante       = nullif(btrim(coalesce(p_fabricante, '')), ''),
         color            = nullif(btrim(coalesce(p_color, '')), ''),
         restock_pct      = p_restock_pct
   where id = p_id;
end;
$$;
revoke all on function public.guardar_ficha_de_articulo(bigint, text, text, text, text, text, numeric) from public, anon;
grant execute on function public.guardar_ficha_de_articulo(bigint, text, text, text, text, text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Subalmacenes
-- ---------------------------------------------------------------------------
alter table public.almacenes
  add column if not exists padre_id bigint references public.almacenes (id) on delete set null;
create index if not exists almacenes_padre_id_idx on public.almacenes (padre_id);

create or replace function public.asignar_almacen_padre(p_id bigint, p_padre_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cursor bigint := p_padre_id;
  v_vueltas int := 0;
begin
  perform private.exigir_permiso('INVENTARIO', 'ESCRITURA');
  if not exists (select 1 from public.almacenes where id = p_id) then
    raise exception 'Ese almacén no existe.' using errcode = 'P0002';
  end if;
  if p_padre_id is not null then
    if p_padre_id = p_id then
      raise exception 'Un almacén no puede colgar de sí mismo.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.almacenes where id = p_padre_id and activo) then
      raise exception 'El almacén de arriba no existe o está apagado.' using errcode = 'P0002';
    end if;
    -- Sin vueltas: el de arriba no puede colgar, a su vez, de este.
    while v_cursor is not null loop
      if v_cursor = p_id then
        raise exception 'Así quedaría un almacén dentro de sí mismo: elija otro de arriba.' using errcode = '22023';
      end if;
      v_vueltas := v_vueltas + 1;
      exit when v_vueltas > 50;
      select padre_id into v_cursor from public.almacenes where id = v_cursor;
    end loop;
  end if;

  update public.almacenes set padre_id = p_padre_id where id = p_id;
end;
$$;
revoke all on function public.asignar_almacen_padre(bigint, bigint) from public, anon;
grant execute on function public.asignar_almacen_padre(bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Editar la solicitud de salida antes de entregarla
-- ---------------------------------------------------------------------------
-- La edita quien la pidió o quien lleva Salidas en escritura, mientras está
-- Por aprobar o Aprobada. Si ya estaba aprobada, vuelve a Por aprobar: lo que
-- se aprobó era otra cosa.
create or replace function public.editar_solicitud_salida(p_id bigint, p_renglones jsonb, p_motivo text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s        public.solicitudes_salida;
  v_r        jsonb;
  v_n        int := 0;
  v_articulo text;
  v_motivo   text := btrim(coalesce(p_motivo, ''));
  v_almacen  text;
begin
  perform private.exigir_permiso('SALIDAS', 'LECTURA');

  select * into v_s from public.solicitudes_salida where id = p_id for update;
  if not found then
    raise exception 'Esa solicitud no existe.' using errcode = 'P0002';
  end if;
  if v_s.estado not in ('PEDIDA', 'APROBADA') then
    raise exception 'La solicitud % ya no se puede editar: está %.', v_s.numero, lower(v_s.estado) using errcode = '55000';
  end if;
  if v_s.pedida_por is distinct from (select auth.uid()) and not private.tiene_permiso('SALIDAS', 'ESCRITURA') then
    raise exception 'La edita quien la pidió o quien lleva Salidas.' using errcode = '42501';
  end if;

  if length(v_motivo) < 10 then
    raise exception 'Escriba para qué se necesita: es lo que lee quien la aprueba.' using errcode = '22023';
  end if;
  if private.nombra_una_venta(v_motivo) then
    raise exception 'El «para qué» dice «%», y una venta no sale por aquí: se registra en Facturación › Notas de entrega.',
      lower(private.palabra_de_venta(v_motivo)) using errcode = '22023';
  end if;
  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'La solicitud tiene que traer al menos un renglón.' using errcode = '22023';
  end if;

  delete from public.solicitud_salida_renglones where solicitud_id = p_id;

  for v_r in select * from jsonb_array_elements(p_renglones) loop
    v_n := v_n + 1;
    select nombre into v_articulo
      from public.articulos
     where id = nullif(btrim(coalesce(v_r->>'articulo_id', '')), '')::bigint and activo;
    if v_articulo is null then
      raise exception 'El renglón %: ese artículo no existe o está inactivo.', v_n using errcode = '23503';
    end if;
    if coalesce(nullif(btrim(coalesce(v_r->>'cantidad', '')), '')::numeric, 0) <= 0 then
      raise exception 'El renglón % (%): la cantidad tiene que ser mayor que cero.', v_n, v_articulo using errcode = '22023';
    end if;

    insert into public.solicitud_salida_renglones
      (solicitud_id, articulo_id, cantidad, presentaciones, presentacion, suelto, propietario)
    values
      (p_id,
       (v_r->>'articulo_id')::bigint,
       (v_r->>'cantidad')::numeric,
       nullif(btrim(coalesce(v_r->>'presentaciones', '')), '')::numeric,
       nullif(btrim(coalesce(v_r->>'presentacion', '')), ''),
       nullif(btrim(coalesce(v_r->>'suelto', '')), '')::numeric,
       nullif(btrim(coalesce(v_r->>'propietario', '')), ''));
  end loop;

  update public.solicitudes_salida
     set motivo = v_motivo,
         estado = 'PEDIDA',
         aprobada_por = null,
         aprobada_en = null,
         aprobada_de_respaldo = false,
         firma_de_quien_aprueba = false
   where id = p_id;

  if v_s.estado = 'APROBADA' then
    select nombre into v_almacen from public.almacenes where id = v_s.almacen_id;
    perform private.notificar(
      'SALIDAS', 'SALIDA_PEDIDA',
      format('%s se editó y vuelve a esperar aprobación', v_s.numero),
      format('Para: %s. La aprueba quien responde por %s.', v_motivo, v_almacen),
      '/app/salidas/solicitudes', array['ALMACEN'], 'ATENCION');
  end if;

  return v_s.numero;
end;
$$;
revoke all on function public.editar_solicitud_salida(bigint, jsonb, text) from public, anon;
grant execute on function public.editar_solicitud_salida(bigint, jsonb, text) to authenticated;
