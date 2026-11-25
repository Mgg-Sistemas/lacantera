-- Conserva la tasa de cambio elegida en la cotización (`detalle`: tasa_tipo,
-- tasa_moneda, tasa_bs, tasa_fija, tasa_etiqueta) y la sincroniza a `oferta_detalle`
-- de las órdenes de compra ligadas cuando se edita una oferta aceptada.

begin;

create or replace function private.compras_resincronizar_oferta(p_oferta public.compras_ofertas)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o     public.compras_ordenes;
  v_sel   jsonb;
  v_arm   jsonb;
  v_items jsonb;
  v_sub   numeric;
  v_tot   numeric;
  v_n     integer := 0;
begin
  for v_o in
    select o.* from public.compras_ordenes o
     where o.proveedor_id = p_oferta.proveedor_id
       and o.estado in ('oc_creada', 'confirmada_metodo', 'oc_aprobada')
       and (o.id = p_oferta.orden_id or o.parent_orden_id = p_oferta.orden_id)
     for update
  loop
    select coalesce(jsonb_agg(jsonb_build_object('sku', t.sku, 'idx', t.idx)), '[]'::jsonb)
      into v_sel
      from (
        select distinct on (i ->> 'sku') i ->> 'sku' as sku, (f.n - 1) as idx
          from jsonb_array_elements(v_o.items) i
          join jsonb_array_elements(p_oferta.items) with ordinality as f(r, n) on f.r ->> 'sku' = i ->> 'sku'
         where coalesce((i ->> 'comprar')::boolean, true)
         order by i ->> 'sku',
                  (coalesce(f.r ->> 'marca', '') = coalesce(i ->> 'marca', '')
                   and coalesce(f.r ->> 'modelo', '') = coalesce(i ->> 'modelo', '')) desc,
                  f.n
      ) t;

    if jsonb_array_length(v_sel) = 0 then
      continue;
    end if;

    begin
      v_arm := private.compras_armar_oc(v_o.items, p_oferta, v_sel, coalesce(v_o.modalidad_pago, 'bs'));
    exception when others then
      continue;
    end;

    select coalesce(jsonb_agg(coalesce(
             (select a from jsonb_array_elements(v_arm -> 'items') a where a ->> 'sku' = i ->> 'sku' limit 1),
             i) order by n), '[]'::jsonb)
      into v_items
      from jsonb_array_elements(v_o.items) with ordinality as e(i, n);

    v_sub := private.compras_total_items(v_items);
    v_tot := private.compras_total_partes(v_sub, (v_arm ->> 'descuento')::numeric, (v_arm ->> 'iva')::numeric,
               (v_arm ->> 'igtf')::numeric, (v_arm ->> 'iva_incluido')::boolean, (v_arm ->> 'ajuste')::numeric);

    if v_items = v_o.items and v_tot = v_o.total
       and v_o.iva is not distinct from (v_arm ->> 'iva')::numeric
       and v_o.igtf is not distinct from (v_arm ->> 'igtf')::numeric
       and v_o.descuento_obtenido is not distinct from (v_arm ->> 'descuento')::numeric
       and v_o.ajuste is not distinct from (v_arm ->> 'ajuste')::numeric
       and v_o.iva_incluido = (v_arm ->> 'iva_incluido')::boolean
       and v_o.oferta_detalle is not distinct from p_oferta.detalle then
      continue;
    end if;

    update public.compras_ordenes
       set items = v_items,
           total = v_tot,
           total_divisa = (v_arm ->> 'total_divisa')::numeric,
           descuento_obtenido = (v_arm ->> 'descuento')::numeric,
           iva = (v_arm ->> 'iva')::numeric,
           igtf = (v_arm ->> 'igtf')::numeric,
           iva_incluido = (v_arm ->> 'iva_incluido')::boolean,
           ajuste = (v_arm ->> 'ajuste')::numeric,
           ajuste_motivo = v_arm ->> 'ajuste_motivo',
           condiciones_pago = coalesce(p_oferta.condiciones_pago, condiciones_pago),
           oferta_detalle = p_oferta.detalle,
           oferta_precio_bcv = (v_arm ->> 'precio_bcv')::numeric,
           oferta_precio_efectivo = (v_arm ->> 'precio_efectivo')::numeric,
           historial = historial || private.compras_evento('oc_editada', jsonb_build_object(
             'motivo', 'Sincronización de cotización, tasa e impuestos',
             'iva', coalesce((v_arm ->> 'iva')::numeric, 0), 'total', v_tot))
     where id = v_o.id;
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

create or replace function public.compras_guardar_oferta(
  p_orden_id bigint,
  p_oferta_id bigint,
  p_proveedor_id bigint,
  p_proveedor_nuevo jsonb,
  p_datos jsonb,
  p_motivo_cambio text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o          public.compras_ordenes;
  v_m          public.compras_ordenes;
  v_of         public.compras_ofertas;
  v_items      jsonb;
  v_tot        record;
  v_total      numeric;
  v_efe        numeric;
  v_desc       numeric;
  v_iva        numeric;
  v_igtf       numeric;
  v_aj         numeric;
  v_cond       text;
  v_prov       bigint := p_proveedor_id;
  v_creado     boolean := false;
  v_rif        text;
  v_razon      text;
  v_correo     text;
  v_cambia     boolean := false;
  v_motivo     text := nullif(btrim(coalesce(p_motivo_cambio, '')), '');
  v_bloquea    public.compras_ordenes;
  v_detalle    jsonb;
  v_adj        jsonb;
  v_fecha      date;
  v_ligadas    public.compras_ordenes;
  v_tasa_tipo  text;
  v_tasa_bs    numeric;
  v_tasa_fija  boolean;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_gestiona() then
    raise exception 'Las cotizaciones las carga quien lleva Compras (Compras en total) o un administrador.'
      using errcode = '42501';
  end if;

  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Faltan los datos de la oferta.' using errcode = '22023';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_orden_id;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;

  select o.* into v_m from public.compras_ordenes o where o.id = coalesce(v_o.parent_orden_id, v_o.id) for update;

  if p_oferta_id is not null then
    select f.* into v_of from public.compras_ofertas f where f.id = p_oferta_id for update;
    if v_of.id is null or v_of.orden_id <> v_m.id then
      raise exception 'Esa oferta no es de esta orden.' using errcode = 'P0002';
    end if;
  elsif v_m.estado not in ('aprobada', 'asignada', 'desistida_proveedor') then
    raise exception 'Las ofertas se cargan con la orden de pedido aprobada (está en «%»).', v_m.estado
      using errcode = '55000';
  end if;

  v_items := private.compras_normalizar_items_oferta(p_datos -> 'items', v_m);
  select * into v_tot from private.compras_oferta_totales(v_items);

  if coalesce(v_tot.o_bcv, 0) <= 0 and coalesce(v_tot.o_usd, 0) <= 0 then
    raise exception 'Ingresá el precio en Bs (BCV) y/o en USD efectivo: al menos uno.' using errcode = '22023';
  end if;

  v_cond := nullif(btrim(coalesce(p_datos ->> 'condiciones_pago', '')), '');
  if v_cond is null or v_cond not in ('contado', 'contra_entrega', 'anticipado', 'credito') then
    raise exception 'Elegí la condición de pago (define el flujo: contado, crédito, contra entrega…)' using errcode = '22023';
  end if;

  if v_tot.o_bcv > 0 and v_tot.o_usd > 0 and v_tot.o_usd >= v_tot.o_bcv then
    raise exception 'El precio en divisa efectivo debe ser menor al total BCV (es un descuento por pago en efectivo).'
      using errcode = '22023';
  end if;

  v_total := case when v_tot.o_bcv > 0 then v_tot.o_bcv else v_tot.o_usd end;
  v_efe := case when v_tot.o_bcv > 0 and v_tot.o_usd > 0 then v_tot.o_usd end;

  begin
    v_desc := nullif(round(greatest(coalesce(nullif(p_datos ->> 'descuento', '')::numeric, 0), 0), 2), 0);
    v_iva := nullif(round(greatest(coalesce(nullif(p_datos ->> 'iva', '')::numeric, 0), 0), 2), 0);
    v_igtf := nullif(round(greatest(coalesce(nullif(p_datos ->> 'igtf', '')::numeric, 0), 0), 2), 0);
    v_aj := nullif(round(coalesce(nullif(p_datos ->> 'ajuste', '')::numeric, 0), 2), 0);
    v_fecha := nullif(p_datos ->> 'fecha_entrega_prometida', '')::date;
    v_tasa_bs := nullif(round(greatest(coalesce(nullif(p_datos -> 'detalle' ->> 'tasa_bs', '')::numeric, 0), 0), 8), 0);
  exception when others then
    raise exception 'Un monto o la fecha de entrega no se entienden.' using errcode = '22023';
  end;

  if coalesce(v_desc, 0) > v_total then
    raise exception 'El descuento no puede superar el total de la oferta.' using errcode = '22023';
  end if;

  if length(coalesce(p_datos ->> 'ajuste_motivo', '')) > 120 then
    raise exception 'El motivo del ajuste va en 120 letras como mucho.' using errcode = '22023';
  end if;

  if v_of.id is not null and v_prov is not null and v_prov <> v_of.proveedor_id then
    v_cambia := true;
    if v_of.estado = 'aceptada' then
      if v_motivo is null then
        raise exception 'Indique el motivo del cambio de proveedor: la oferta ya está aceptada y el cambio pasa a la orden.'
          using errcode = '22023';
      end if;
      if length(v_motivo) < 5 then
        raise exception 'El motivo es muy corto (mínimo 5 letras).' using errcode = '22023';
      end if;
    end if;
  end if;

  if v_of.estado = 'aceptada' then
    select o.* into v_bloquea
      from public.compras_ordenes o
     where o.proveedor_id = v_of.proveedor_id
       and (o.id = v_m.id or o.parent_orden_id = v_m.id)
       and o.estado not in ('cancelada', 'anulada', 'desistida_proveedor')
       and (o.estado in ('pagada', 'recibida', 'finalizada') or o.recibida_en is not null)
     limit 1;
    if v_bloquea.id is not null then
      if v_bloquea.recibida_en is not null and v_bloquea.estado not in ('pagada', 'recibida', 'finalizada') then
        raise exception 'La orden % ya tiene mercancía recibida: el proveedor y los precios de su oferta aceptada ya no se pueden cambiar.',
          coalesce(v_bloquea.oc_codigo, v_bloquea.codigo) using errcode = '55000';
      end if;
      raise exception 'La orden % ya está pagada/recibida/finalizada: el proveedor de su oferta aceptada ya no se puede cambiar.',
        coalesce(v_bloquea.oc_codigo, v_bloquea.codigo) using errcode = '55000';
    end if;
  end if;

  if v_of.id is null and p_proveedor_nuevo is not null and jsonb_typeof(p_proveedor_nuevo) = 'object' then
    v_razon := nullif(btrim(coalesce(p_proveedor_nuevo ->> 'razon_social', '')), '');
    v_rif := upper(regexp_replace(coalesce(p_proveedor_nuevo ->> 'rif', ''), '[\s.]', '', 'g'));
    if v_rif ~ '^[VEJPGC][0-9]{9}$' then
      v_rif := substr(v_rif, 1, 1) || '-' || substr(v_rif, 2, 8) || '-' || substr(v_rif, 10, 1);
    elsif v_rif ~ '^[VEJPGC]-[0-9]{9}$' then
      v_rif := substr(v_rif, 1, 2) || substr(v_rif, 3, 8) || '-' || substr(v_rif, 11, 1);
    end if;
    if v_razon is null or v_rif !~ '^[VEJPGC]-[0-9]{8}-[0-9]$' then
      raise exception 'Razón social y RIF (con número) son obligatorios para el nuevo proveedor' using errcode = '22023';
    end if;
    v_correo := nullif(btrim(coalesce(p_proveedor_nuevo ->> 'correo', '')), '');
    if v_correo is not null and v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'El correo del proveedor no tiene un formato válido' using errcode = '22023';
    end if;
    if exists (select 1 from public.proveedores p where p.rif = v_rif) then
      raise exception 'Ya hay un proveedor registrado con el RIF %. Búsquelo en la lista.', v_rif using errcode = '23505';
    end if;
    insert into public.proveedores (rif, nombre, telefono, correo, direccion, condicion_pago, moneda_preferida, activo, creado_por)
    values (v_rif, v_razon,
            nullif(regexp_replace(coalesce(p_proveedor_nuevo ->> 'telefono', ''), '\D', '', 'g'), ''),
            v_correo,
            nullif(btrim(coalesce(p_proveedor_nuevo ->> 'direccion', '')), ''),
            'CONTADO', 'USD', true, (select auth.uid()))
    returning id into v_prov;
    v_creado := true;
  end if;

  if v_prov is null then
    if v_of.id is not null then
      v_prov := v_of.proveedor_id;
    else
      raise exception 'Selecciona un proveedor' using errcode = '22023';
    end if;
  end if;
  if not exists (select 1 from public.proveedores p where p.id = v_prov and (p.activo or p.id = v_of.proveedor_id)) then
    raise exception 'Ese proveedor no existe o está inactivo.' using errcode = '23503';
  end if;

  if exists (select 1 from public.compras_ofertas f
              where f.orden_id = v_m.id and f.proveedor_id = v_prov and f.id is distinct from v_of.id) then
    raise exception '% ya cargó una oferta en esta orden. Para corregir un precio, editá la oferta desde la comparativa con el ✎.',
      (select p.nombre from public.proveedores p where p.id = v_prov) using errcode = '23505';
  end if;

  if v_of.id is null and (select count(*) from public.compras_ofertas f where f.orden_id = v_m.id) >= 6 then
    raise exception 'Ya hay 6 ofertas cargadas en % (máximo 6).', v_m.codigo using errcode = '22023';
  end if;

  v_tasa_tipo := case
    when p_datos -> 'detalle' ->> 'tasa_tipo' in ('USD_BCV', 'EUR_BCV', 'USDT', 'MANUAL')
      then p_datos -> 'detalle' ->> 'tasa_tipo'
    else null
  end;
  v_tasa_fija := coalesce((p_datos -> 'detalle' ->> 'tasa_fija')::boolean, false);

  v_detalle := jsonb_strip_nulls(jsonb_build_object(
    'marca', private.en_mayuscula(nullif(btrim(coalesce(p_datos -> 'detalle' ->> 'marca', '')), '')),
    'modelo', private.en_mayuscula(nullif(btrim(coalesce(p_datos -> 'detalle' ->> 'modelo', '')), '')),
    'procedencia', private.en_mayuscula(nullif(btrim(coalesce(p_datos -> 'detalle' ->> 'procedencia', '')), '')),
    'materiales', private.en_mayuscula(nullif(btrim(coalesce(p_datos -> 'detalle' ->> 'materiales', '')), '')),
    'dimensiones', nullif(btrim(coalesce(p_datos -> 'detalle' ->> 'dimensiones', '')), ''),
    'peso', nullif(btrim(coalesce(p_datos -> 'detalle' ->> 'peso', '')), ''),
    'calidad', private.en_mayuscula(nullif(btrim(coalesce(p_datos -> 'detalle' ->> 'calidad', '')), '')),
    'tasa_tipo', v_tasa_tipo,
    'tasa_moneda', case v_tasa_tipo when 'EUR_BCV' then 'EUR' when 'USDT' then 'USDT' when 'USD_BCV' then 'USD' when 'MANUAL' then 'USD' else null end,
    'tasa_bs', v_tasa_bs,
    'tasa_fija', case when v_tasa_fija then true else null end,
    'tasa_etiqueta', left(nullif(btrim(coalesce(p_datos -> 'detalle' ->> 'tasa_etiqueta', '')), ''), 60),
    'logistica', nullif(jsonb_strip_nulls(jsonb_build_object(
      'flete', case when p_datos -> 'detalle' -> 'logistica' ->> 'flete' in ('incluido', 'comprador') then p_datos -> 'detalle' -> 'logistica' ->> 'flete' end,
      'transporte', case when p_datos -> 'detalle' -> 'logistica' ->> 'transporte' in ('incluido', 'comprador') then p_datos -> 'detalle' -> 'logistica' ->> 'transporte' end,
      'embalaje', case when p_datos -> 'detalle' -> 'logistica' ->> 'embalaje' in ('incluido', 'comprador') then p_datos -> 'detalle' -> 'logistica' ->> 'embalaje' end,
      'seguros', case when p_datos -> 'detalle' -> 'logistica' ->> 'seguros' in ('incluido', 'comprador') then p_datos -> 'detalle' -> 'logistica' ->> 'seguros' end)),
      '{}'::jsonb)));
  if v_detalle = '{}'::jsonb then
    v_detalle := null;
  end if;

  v_adj := private.compras_adjuntos_validos(p_datos -> 'adjuntos', v_m.id, 12);

  if v_of.id is null then
    insert into public.compras_ofertas
      (orden_id, proveedor_id, items, precio_total, precio_efectivo, descuento, iva, igtf, iva_incluido,
       ajuste, ajuste_motivo, fecha_entrega_prometida, condiciones_pago, notas, detalle, adjuntos,
       registrada_por, registrada_por_nombre)
    values
      (v_m.id, v_prov, v_items, v_total, v_efe, v_desc, v_iva, v_igtf,
       coalesce((p_datos ->> 'iva_incluido')::boolean, false) and v_iva is not null,
       v_aj, case when v_aj is not null then nullif(btrim(coalesce(p_datos ->> 'ajuste_motivo', '')), '') end,
       v_fecha, v_cond, nullif(btrim(coalesce(p_datos ->> 'notas', '')), ''), v_detalle, v_adj,
       (select auth.uid()), private.compras_mi_nombre())
    returning * into v_of;

    perform private.compras_avisar(v_m, 'OFERTA_REGISTRADA', format('Oferta registrada para %s', v_m.codigo), array['COMPRAS']);
  else
    if v_cambia and v_of.estado = 'aceptada' then
      for v_ligadas in
        select o.* from public.compras_ordenes o
         where o.proveedor_id = v_of.proveedor_id
           and (o.id = v_m.id or o.parent_orden_id = v_m.id)
           and o.estado not in ('cancelada', 'anulada', 'desistida_proveedor')
         for update
      loop
        update public.compras_ordenes
           set proveedor_id = v_prov,
               historial = historial || private.compras_evento('proveedor_cambiado', jsonb_build_object(
                 'desde', 'oferta_aceptada',
                 'proveedorAnteriorId', v_of.proveedor_id,
                 'proveedorNuevoId', v_prov,
                 'proveedorAnterior', private.compras_texto_proveedor(v_of.proveedor_id),
                 'proveedorNuevo', private.compras_texto_proveedor(v_prov),
                 'motivo', v_motivo))
         where id = v_ligadas.id;
      end loop;
    end if;

    update public.compras_ofertas
       set proveedor_id = v_prov,
           items = v_items,
           precio_total = v_total,
           precio_efectivo = v_efe,
           descuento = v_desc,
           iva = v_iva,
           igtf = v_igtf,
           iva_incluido = coalesce((p_datos ->> 'iva_incluido')::boolean, false) and v_iva is not null,
           ajuste = v_aj,
           ajuste_motivo = case when v_aj is not null then nullif(btrim(coalesce(p_datos ->> 'ajuste_motivo', '')), '') end,
           fecha_entrega_prometida = v_fecha,
           condiciones_pago = v_cond,
           notas = nullif(btrim(coalesce(p_datos ->> 'notas', '')), ''),
           detalle = v_detalle,
           adjuntos = v_adj
     where id = v_of.id
    returning * into v_of;

    if v_of.estado = 'aceptada' then
      perform private.compras_resincronizar_oferta(v_of);
    end if;

    perform private.compras_avisar(v_m, 'OFERTA_ACTUALIZADA', format('Oferta actualizada para %s', v_m.codigo), array['COMPRAS']);
  end if;

  if v_creado then
    perform private.notificar('COMPRAS', 'PROVEEDOR_REGISTRADO',
      format('Proveedor "%s" registrado', (select p.nombre from public.proveedores p where p.id = v_prov)),
      format('Desde la oferta de %s', v_m.codigo), '/app/compras/proveedores', array['COMPRAS'], 'INFO');
  end if;

  return jsonb_build_object('id', v_of.id, 'proveedor_id', v_prov, 'proveedor_creado', v_creado, 'orden_id', v_m.id);
end;
$$;

commit;
