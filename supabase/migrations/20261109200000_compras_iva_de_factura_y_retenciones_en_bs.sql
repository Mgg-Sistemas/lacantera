-- Retenciones al indicar el método de pago (la dueña, 08/11/2026):
--
-- 1. «IVA de la factura». Una OC cotizada sin IVA dejaba la retención de IVA
--    en $0 (el % se calcula sobre el IVA de la OC). Ahora, si la OC no trae
--    IVA y el pago es con factura, se indica el IVA de la factura: se suma al
--    total y la retención de IVA se calcula sobre él.
-- 2. Cada retención se paga en $ o en Bs «al cambio por tasa BCV». El monto a
--    pagar sigue en $; la retención en Bs guarda su monto en Bs con la tasa
--    del pago. Ejemplo: monto a pagar $35 · Retención IVA 75 % Bs 1.234,56.

alter table public.compras_ordenes
  add column if not exists iva_factura numeric(14, 2)
    constraint compras_ordenes_iva_factura_no_negativo check (iva_factura is null or iva_factura >= 0),
  add column if not exists retenciones_tasa numeric(18, 6)
    constraint compras_ordenes_retenciones_tasa_positiva check (retenciones_tasa is null or retenciones_tasa > 0);

comment on column public.compras_ordenes.iva_factura is
  'IVA de la factura cuando la OC se cotizó sin IVA (08/11/2026). Se suma al total y es la base de la retención de IVA.';
comment on column public.compras_ordenes.retenciones_tasa is
  'Tasa BCV (Bs por $) con la que se expresan las retenciones que se pagan en Bs (08/11/2026).';

-- Las bases del pago: el IVA de la OC o, si no trae, el de la factura (que
-- además se suma al total).
create or replace function private.compras_bases_pago(p public.compras_ordenes, out o_total numeric, out o_iva numeric, out o_base numeric)
returns record
language sql
immutable
set search_path = ''
as $$
  with b as (
    select coalesce(p.total, 0) as t,
           case when p.condiciones_pago = 'contra_entrega' and p.recibido_total is not null
                then p.recibido_total else coalesce(p.total, 0) end as bt,
           greatest(coalesce(p.iva, 0), 0) as iva_oc,
           case when greatest(coalesce(p.iva, 0), 0) > 0 then 0
                else greatest(coalesce(p.iva_factura, 0), 0) end as iva_fac
  ), f as (
    select b.*, case when b.t > 0 then b.bt / b.t else 1 end as k from b
  )
  select round(f.bt + f.iva_fac * f.k, 2),
         round((f.iva_oc + f.iva_fac) * f.k, 2),
         round(greatest(0, private.compras_total_items(p.items)
                           - greatest(coalesce(p.descuento_obtenido, 0), 0)
                           - case when p.iva_incluido then f.iva_oc else 0 end) * f.k, 2)
    from f;
$$;

-- Las retenciones calculadas: lo de siempre, más la moneda en que se paga
-- cada una y, si es en Bs, su monto en Bs con la tasa de la orden.
create or replace function private.compras_calcular_retenciones(p public.compras_ordenes, p_lista jsonb, p_estricto boolean default true)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_b      record;
  v_x      jsonb;
  v_tipo   text;
  v_modo   text;
  v_valor  numeric;
  v_base   numeric;
  v_monto  numeric;
  v_moneda text;
  v_out    jsonb := '[]'::jsonb;
  v_vistos text[] := '{}';
begin
  if p_lista is null or jsonb_typeof(p_lista) = 'null' then
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(p_lista) <> 'array' then
    raise exception 'Las retenciones van en una lista.' using errcode = '22023';
  end if;

  select * into v_b from private.compras_bases_pago(p);

  for v_x in select * from jsonb_array_elements(p_lista) loop
    v_tipo := upper(btrim(coalesce(v_x ->> 'tipo', '')));
    if v_tipo not in ('IVA', 'ISLR', 'IGTF', 'ISAE') then
      raise exception 'Esa retención no existe (se retiene IVA, ISLR, IGTF o ISAE).' using errcode = '22023';
    end if;
    if v_tipo = any (v_vistos) then
      raise exception 'La retención de % viene dos veces.', v_tipo using errcode = '22023';
    end if;
    v_vistos := v_vistos || v_tipo;

    v_modo := coalesce(nullif(btrim(coalesce(v_x ->> 'modo', '')), ''), 'porcentaje');
    if v_modo = 'pct' then
      v_modo := 'porcentaje';
    end if;
    if v_modo not in ('porcentaje', 'monto') then
      raise exception 'La retención de % va en porcentaje o en monto.', v_tipo using errcode = '22023';
    end if;

    v_moneda := coalesce(nullif(btrim(coalesce(v_x ->> 'moneda', '')), ''), 'USD');
    if v_moneda not in ('USD', 'Bs') then
      raise exception 'La retención de % se paga en $ o en Bs.', v_tipo using errcode = '22023';
    end if;

    begin
      v_valor := nullif(btrim(coalesce(v_x ->> 'valor', '')), '')::numeric;
    exception when others then
      raise exception 'La retención de % no se entiende.', v_tipo using errcode = '22023';
    end;

    if v_valor is null or v_valor <= 0 then
      continue;
    end if;

    if v_modo = 'porcentaje' and v_valor > 100 then
      if p_estricto then
        raise exception 'El porcentaje de la retención de % no puede pasar de 100.', v_tipo using errcode = '22023';
      end if;
      v_valor := 100;
    end if;

    v_base := case v_tipo when 'IVA' then v_b.o_iva when 'IGTF' then v_b.o_total else v_b.o_base end;

    if p_estricto and v_modo = 'porcentaje' and v_tipo = 'IVA' and coalesce(v_base, 0) <= 0 then
      raise exception 'La OC no tiene IVA: indicá el IVA de la factura, o pon la retención de IVA en monto.' using errcode = '22023';
    end if;

    if p_estricto and v_moneda = 'Bs' and coalesce(p.retenciones_tasa, 0) <= 0 then
      raise exception 'Indicá la tasa BCV para las retenciones en Bs.' using errcode = '22023';
    end if;

    v_monto := case when v_modo = 'porcentaje'
                    then round(coalesce(v_base, 0) * v_valor / 100, 2)
                    else round(v_valor, 2) end;

    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'tipo', v_tipo,
      'modo', v_modo,
      'valor', v_valor,
      'base', case when v_modo = 'porcentaje' then coalesce(v_base, 0) end,
      'monto', v_monto,
      'moneda', v_moneda,
      'tasa', case when v_moneda = 'Bs' then p.retenciones_tasa end,
      'monto_bs', case when v_moneda = 'Bs' and coalesce(p.retenciones_tasa, 0) > 0
                       then round(v_monto * p.retenciones_tasa, 2) end)));
  end loop;

  return v_out;
end;
$$;

-- El IVA de la factura y la tasa de las retenciones en Bs. Se llama justo
-- antes de indicar o corregir el método de pago, o el documento y las
-- retenciones de un crédito, para que esas cuentas ya los usen.
create or replace function public.compras_datos_fiscales_pago(
  p_id          bigint,
  p_iva_factura numeric,
  p_tasa        numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o   public.compras_ordenes;
  v_iva numeric := nullif(round(coalesce(p_iva_factura, 0), 2), 0);
  v_tasa numeric := nullif(coalesce(p_tasa, 0), 0);
begin
  perform private.exigir_usuario_activo();

  if not private.compras_gestiona() then
    raise exception 'El método de pago lo indica quien lleva Compras (Compras en total) o un administrador.'
      using errcode = '42501';
  end if;

  select * into v_o from public.compras_ordenes where id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;
  if v_o.oc_codigo is null
     or v_o.estado not in ('confirmada_metodo', 'oc_aprobada', 'cuenta_abierta', 'por_recibir', 'recibida')
     or v_o.pagada_en is not null then
    raise exception 'El IVA de la factura y la tasa se indican con la OC por pagar.' using errcode = '55000';
  end if;
  if v_iva is not null and v_iva < 0 then
    raise exception 'El IVA de la factura no puede ser negativo.' using errcode = '22023';
  end if;
  if v_iva is not null and greatest(coalesce(v_o.iva, 0), 0) > 0 then
    raise exception 'La OC ya trae IVA (%): no hace falta indicar el de la factura.', v_o.iva using errcode = '22023';
  end if;
  if v_tasa is not null and v_tasa < 0 then
    raise exception 'La tasa BCV no puede ser negativa.' using errcode = '22023';
  end if;

  if v_o.iva_factura is distinct from v_iva or v_o.retenciones_tasa is distinct from v_tasa then
    update public.compras_ordenes
       set iva_factura = v_iva,
           retenciones_tasa = v_tasa,
           historial = historial || private.compras_evento('datos_fiscales', jsonb_build_object(
             'iva_factura', v_iva,
             'tasa', v_tasa))
     where id = p_id
    returning * into v_o;
  end if;

  return jsonb_build_object('id', v_o.id, 'iva_factura', v_o.iva_factura, 'retenciones_tasa', v_o.retenciones_tasa);
end;
$$;

revoke all on function public.compras_datos_fiscales_pago(bigint, numeric, numeric) from public, anon;
grant execute on function public.compras_datos_fiscales_pago(bigint, numeric, numeric) to authenticated;
