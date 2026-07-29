-- ============================================================================
-- Las cotizaciones llevan número propio
--
-- Antes se escribía a mano el número que traía el papel del proveedor, y buena
-- parte de los proveedores de aquí manda el precio por WhatsApp sin número
-- ninguno. Resultado: cotizaciones sin forma de nombrarlas.
--
-- Ahora la numera el sistema, con el mismo correlativo que el pedido y la
-- orden: COT-2026-0001. Lo asigna la base y no el navegador porque dos
-- personas cargando a la vez obtendrían el mismo número si cada una lo
-- calculara por su cuenta.
--
-- `numero_proveedor` se conserva: cuando el proveedor SÍ numera su cotización,
-- ese dato hace falta para casar después su factura.
-- ============================================================================

alter table public.cotizaciones add column if not exists numero text;

-- Numerar lo que ya existe, en el orden en que se registró.
do $$
declare
  v_fila record;
begin
  for v_fila in
    select id from public.cotizaciones where numero is null order by id
  loop
    update public.cotizaciones
       set numero = private.siguiente_numero('COT')
     where id = v_fila.id;
  end loop;
end
$$;

alter table public.cotizaciones alter column numero set not null;

alter table public.cotizaciones drop constraint if exists cotizaciones_numero_unico;
alter table public.cotizaciones add constraint cotizaciones_numero_unico unique (numero);

-- ---------------------------------------------------------------------------
-- Registro de la cotización
--
-- Cambia solo en dos cosas: asigna el número, y al recargar la cotización de
-- un proveedor conserva el que ya tenía. Recargar es corregir el precio del
-- mismo documento, no emitir otro: si cambiara el número, el papel que tiene
-- el proveedor en la mano dejaría de coincidir con el del sistema.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_cotizacion(
  p_solicitud_id     bigint,
  p_proveedor_id     bigint,
  p_moneda           char(3),
  p_renglones        jsonb,
  p_numero_proveedor text default null,
  p_fecha            date default null,
  p_validez_dias     smallint default 15,
  p_dias_entrega     smallint default null,
  p_condicion_pago   text default 'CONTADO',
  p_alicuota_iva     numeric default 16,
  p_descuento        numeric default 0,
  p_flete            numeric default 0,
  p_observacion      text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_estado   text;
  v_fecha    date := coalesce(p_fecha, current_date);
  v_tasa     numeric;
  v_tasa_usd numeric;
  v_numero   text;
  v_id       bigint;
  v_item     jsonb;
  v_renglon  bigint;
begin
  perform private.exigir_rol('COMPRAS');

  select estado into v_estado from public.solicitudes_pedido where id = p_solicitud_id;

  if v_estado is null then
    raise exception 'No existe el pedido %.', p_solicitud_id using errcode = 'P0002';
  end if;

  if v_estado not in ('CONFIRMADA', 'POR_CONFIRMAR_GERENTE') then
    raise exception 'Las cotizaciones se cargan sobre un pedido confirmado. Este está en "%".', v_estado
      using errcode = '55000';
  end if;

  if v_fecha > current_date then
    raise exception 'Una cotización no puede tener fecha futura.' using errcode = '22023';
  end if;

  select t.tasa, t.tasa_usd into v_tasa, v_tasa_usd
  from private.tasas_del_dia(p_moneda, v_fecha) t;

  -- Recargar la cotización del mismo proveedor sustituye la anterior y hereda
  -- su número.
  select numero into v_numero
  from public.cotizaciones
  where solicitud_id = p_solicitud_id and proveedor_id = p_proveedor_id;

  delete from public.cotizaciones
   where solicitud_id = p_solicitud_id and proveedor_id = p_proveedor_id;

  insert into public.cotizaciones
    (numero, solicitud_id, proveedor_id, numero_proveedor, fecha, validez_dias, dias_entrega,
     condicion_pago, moneda, tasa, tasa_usd, alicuota_iva, descuento, flete,
     observacion, registrada_por)
  values
    (coalesce(v_numero, private.siguiente_numero('COT')),
     p_solicitud_id, p_proveedor_id, nullif(trim(coalesce(p_numero_proveedor, '')), ''),
     v_fecha, coalesce(p_validez_dias, 15), p_dias_entrega,
     coalesce(p_condicion_pago, 'CONTADO'), p_moneda, v_tasa, v_tasa_usd,
     coalesce(p_alicuota_iva, 16), coalesce(p_descuento, 0), coalesce(p_flete, 0),
     nullif(trim(coalesce(p_observacion, '')), ''), (select auth.uid()))
  returning id, numero into v_id, v_numero;

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'La cotización necesita al menos un renglón con precio.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_renglon := (v_item->>'solicitud_renglon_id')::bigint;

    if not exists (
      select 1 from public.solicitud_renglones
      where id = v_renglon and solicitud_id = p_solicitud_id
    ) then
      raise exception 'El renglón % no pertenece a este pedido.', v_renglon using errcode = '22023';
    end if;

    insert into public.cotizacion_renglones
      (cotizacion_id, solicitud_renglon_id, cantidad, precio_unitario, exento_iva, observacion)
    values
      (v_id, v_renglon,
       (v_item->>'cantidad')::numeric,
       (v_item->>'precio_unitario')::numeric,
       coalesce((v_item->>'exento_iva')::boolean, false),
       nullif(trim(coalesce(v_item->>'observacion', '')), ''));
  end loop;

  perform private.anotar('COTIZACION', v_id, null, 'REGISTRADA', v_numero);

  return v_id;
end;
$$;

revoke execute on function public.registrar_cotizacion(bigint, bigint, char, jsonb, text, date, smallint, smallint, text, numeric, numeric, numeric, text) from public, anon;
grant   execute on function public.registrar_cotizacion(bigint, bigint, char, jsonb, text, date, smallint, smallint, text, numeric, numeric, numeric, text) to authenticated;
