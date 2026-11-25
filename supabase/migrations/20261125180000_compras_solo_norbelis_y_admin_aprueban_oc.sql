-- Restringe la aprobación de cotizaciones / órdenes de compra (`✔ Aprobar OC`)
-- exclusivamente a usuarios con rol ADMIN y a Norbelis (`usuarios_autorizados.aprobar_oc`).
-- Corrige `private.compras_aprueba_oc()` para que tener `COMPRAS = TOTAL` no otorgue
-- permiso de aprobar OC, manteniendo a Compras habilitado para cargar cuentas y registrar pagos
-- de órdenes ya aprobadas.

begin;

-- 1. Asegurar en `usuarios_autorizados` que solo Norbelis tenga `aprobar_oc = true` (los ADMIN ya aprueban por rol).
insert into public.usuarios_autorizados (usuario_id, aprobar_oc, aprobar_salidas)
select p.id, true, true
  from public.perfiles p
 where p.activo
   and p.archivado_en is null
   and upper(p.nombre) like '%NORBELIS%'
on conflict (usuario_id) do update
   set aprobar_oc = true,
       actualizado_en = now();

delete from public.usuarios_autorizados a
 using public.perfiles p
 where p.id = a.usuario_id
   and upper(p.nombre) not like '%NORBELIS%'
   and a.aprobar_oc = true
   and not coalesce(a.aprobar_salidas, false)
   and not coalesce(a.aprobar_despachos, false);

update public.usuarios_autorizados a
   set aprobar_oc = false,
       actualizado_en = now()
  from public.perfiles p
 where p.id = a.usuario_id
   and upper(p.nombre) not like '%NORBELIS%'
   and a.aprobar_oc = true;

-- 2. Aprobar OC: solo `ADMIN` o quienes tengan `aprobar_oc = true` en `usuarios_autorizados` (nunca por `compras_gestiona()`).
create or replace function private.compras_aprueba_oc()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.es_aprobador_de_compras();
$$;

-- 3. Mantener a Compras (`compras_gestiona()`) habilitado para adjuntos de pago, cuentas del proveedor y registro de pagos sobre OC ya aprobadas.
create or replace function private.compras_puede_subir_pagos(p_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_id is not null
     and (private.compras_gestiona() or private.compras_aprueba_oc())
     and exists (select 1 from public.compras_ordenes o
                  where o.id = p_id and o.estado not in ('cancelada', 'anulada', 'finalizada'));
$$;

create or replace function public.compras_guardar_datos_pago(p_proveedor_id bigint, p_metodo text, p_datos jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();

  if not (private.compras_gestiona() or private.compras_aprueba_oc()) then
    raise exception 'Los datos de pago del proveedor los carga Compras.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.proveedores p where p.id = p_proveedor_id) then
    raise exception 'Ese proveedor no existe.' using errcode = 'P0002';
  end if;

  return private.compras_guardar_datos_pago(p_proveedor_id, p_metodo, p_datos);
end;
$$;

create or replace function public.compras_marcar_pagada(p_id bigint, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o      public.compras_ordenes;
  v_p      record;
  v_ref    text;
  v_comp   jsonb;
  v_debe   numeric;
  v_tol    numeric;
  v_dest   text;
  v_oc     text;
  v_efe    boolean;
begin
  perform private.exigir_usuario_activo();

  if not (private.compras_gestiona() or private.compras_aprueba_oc()) then
    raise exception 'El pago lo registra un usuario autorizado para aprobar órdenes de compra o quien lleva Compras.'
      using errcode = '42501';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Faltan los datos del pago.' using errcode = '22023';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;
  if v_o.estado <> 'oc_aprobada' or v_o.pagada_en is not null then
    raise exception 'Solo se paga una OC en «Confirmada pagar» (está en «%»).', v_o.estado using errcode = '55000';
  end if;

  select * into v_p from private.compras_leer_pago(p_datos);

  v_efe := coalesce(jsonb_array_length(v_o.metodo_pago), 0) > 0
           and not exists (select 1 from jsonb_array_elements(v_o.metodo_pago) l
                            where l ->> 'metodo' not in ('divisas_efectivo', 'efectivo_bs'));
  v_ref := nullif(btrim(coalesce(p_datos ->> 'referencia', '')), '');
  if v_ref is null and not v_efe then
    raise exception 'Indicá la referencia del pago.' using errcode = '22023';
  end if;
  if length(coalesce(v_ref, '')) > 80 then
    raise exception 'La referencia va en 80 letras como mucho.' using errcode = '22023';
  end if;

  v_debe := private.compras_monto_a_pagar(v_o);
  v_tol := case when v_p.o_moneda = 'Bs' then greatest(0.01, round(v_debe * 0.01, 2)) else 0.01 end;
  if v_p.o_monto_usd < v_debe - v_tol then
    raise exception 'Lo pagado (%) no cubre el monto a pagar (%).',
      private.compras_monto_txt(v_p.o_monto_usd), private.compras_monto_txt(v_debe) using errcode = '22023';
  end if;

  v_comp := private.compras_archivo_de_pago(p_datos -> 'comprobante', p_id, 'pago');
  v_dest := case when v_o.recibida_en is not null or v_o.clase = 'servicio' then 'pagada' else 'por_recibir' end;
  v_oc := coalesce(v_o.oc_codigo, v_o.codigo);

  update public.compras_ordenes
     set estado = v_dest,
         pagada_por = (select auth.uid()),
         pagada_por_nombre = private.compras_mi_nombre(),
         pagada_en = now(),
         pago_fecha = v_p.o_fecha,
         pago_referencia = v_ref,
         pago_monto = v_p.o_monto,
         pago_moneda = v_p.o_moneda,
         pago_tasa = v_p.o_tasa,
         pago_monto_usd = v_p.o_monto_usd,
         pago_comprobante_path = v_comp ->> 'path',
         pago_comprobante_nombre = v_comp ->> 'filename',
         pago_nota = private.en_mayuscula(nullif(btrim(coalesce(p_datos ->> 'nota', '')), '')),
         historial = historial || private.compras_evento('pagada', jsonb_build_object(
           'fecha', v_p.o_fecha,
           'referencia', v_ref,
           'monto', v_p.o_monto,
           'moneda', v_p.o_moneda,
           'tasa', v_p.o_tasa,
           'monto_usd', v_p.o_monto_usd,
           'monto_a_pagar', v_debe,
           'comprobante_path', v_comp ->> 'path',
           'comprobante_nombre', v_comp ->> 'filename',
           'a', v_dest))
   where id = p_id
  returning * into v_o;

  perform private.compras_avisar(v_o, 'OC_PAGADA',
    format('%s %s pagad%s · %s%s', case when v_o.clase = 'servicio' then 'Servicio' else 'OC' end, v_oc,
      case when v_o.clase = 'servicio' then 'o' else 'a' end,
      private.compras_monto_txt(v_p.o_monto_usd),
      case when v_dest = 'por_recibir' then ' · pendiente por recepción'
           when v_o.recibida_en is null then ' · falta confirmar el servicio realizado'
           else ' · lista para finalizar' end),
    array['COMPRAS', 'GERENTE_GENERAL']);

  if v_dest = 'por_recibir' then
    perform private.compras_avisar_por_recibir(v_o,
      format('OC %s pagada · pendiente por recepción en el Almacén General', v_oc));
  end if;

  return jsonb_build_object('id', v_o.id, 'estado', v_o.estado, 'monto_usd', v_p.o_monto_usd);
end;
$$;

create or replace function public.compras_registrar_abono(p_id bigint, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o     public.compras_ordenes;
  v_p     record;
  v_m     record;
  v_cod   text;
  v_det   text;
  v_ref   text;
  v_comp  jsonb;
  v_saldo numeric;
  v_id    bigint;
begin
  perform private.exigir_usuario_activo();

  if not (private.compras_gestiona() or private.compras_aprueba_oc()) then
    raise exception 'Los abonos los registra un usuario autorizado para aprobar órdenes de compra o quien lleva Compras.'
      using errcode = '42501';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Faltan los datos del abono.' using errcode = '22023';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;
  if v_o.condiciones_pago is distinct from 'credito'
     or v_o.estado not in ('cuenta_abierta', 'por_recibir', 'recibida') then
    raise exception 'Los abonos se registran en una compra a crédito (está en «%»).', v_o.estado using errcode = '55000';
  end if;

  v_saldo := private.compras_saldo_credito(v_o);
  if v_saldo <= 0.01 then
    raise exception 'Este crédito ya está saldado.' using errcode = '55000';
  end if;

  select * into v_p from private.compras_leer_pago(p_datos);

  v_cod := btrim(coalesce(p_datos ->> 'metodo', ''));
  select * into v_m from private.compras_metodo_pago(v_cod);
  if v_m.o_label is null then
    raise exception 'Elegí el método del abono.' using errcode = '22023';
  end if;

  if v_cod = 'otro' then
    v_det := private.en_mayuscula(nullif(btrim(coalesce(p_datos ->> 'metodo_detalle', '')), ''));
    if v_det is null then
      raise exception 'Otro: indicá cuál método.' using errcode = '22023';
    end if;
    if length(v_det) > 60 then
      raise exception 'Otro: el método va en 60 letras como mucho.' using errcode = '22023';
    end if;
  end if;

  v_ref := nullif(btrim(coalesce(p_datos ->> 'referencia', '')), '');
  if v_ref is null and not v_m.o_efectivo then
    raise exception 'Indicá la referencia del abono.' using errcode = '22023';
  end if;
  if length(coalesce(v_ref, '')) > 80 then
    raise exception 'La referencia va en 80 letras como mucho.' using errcode = '22023';
  end if;

  if v_p.o_monto_usd > v_saldo + 0.01 then
    raise exception 'El abono (%) supera el saldo pendiente (%).',
      private.compras_monto_txt(v_p.o_monto_usd), private.compras_monto_txt(v_saldo) using errcode = '22023';
  end if;

  v_comp := private.compras_archivo_de_pago(p_datos -> 'comprobante', p_id, 'abono');

  insert into public.compras_abonos
    (orden_id, fecha, monto, moneda, monto_moneda, tasa, metodo, metodo_detalle, referencia,
     comprobante_path, comprobante_nombre, nota, saldo_restante, registrado_por, registrado_por_nombre)
  values
    (p_id, v_p.o_fecha, least(v_p.o_monto_usd, v_saldo), v_p.o_moneda, v_p.o_monto, v_p.o_tasa, v_cod, v_det, v_ref,
     v_comp ->> 'path', v_comp ->> 'filename', nullif(btrim(coalesce(p_datos ->> 'nota', '')), ''),
     round(greatest(v_saldo - v_p.o_monto_usd, 0), 2), (select auth.uid()), private.compras_mi_nombre())
  returning id into v_id;

  update public.compras_ordenes
     set abonado_total = round(coalesce(abonado_total, 0) + least(v_p.o_monto_usd, v_saldo), 2),
         historial = historial || private.compras_evento('abono', jsonb_build_object(
           'abono_id', v_id,
           'fecha', v_p.o_fecha,
           'monto', least(v_p.o_monto_usd, v_saldo),
           'moneda', v_p.o_moneda,
           'monto_moneda', v_p.o_monto,
           'tasa', v_p.o_tasa,
           'metodo', v_cod,
           'metodo_detalle', v_det,
           'referencia', v_ref,
           'comprobante_nombre', v_comp ->> 'filename',
           'saldo', round(greatest(v_saldo - v_p.o_monto_usd, 0), 2)))
   where id = p_id
  returning * into v_o;

  perform private.compras_avisar(v_o, 'OC_ABONO',
    format('Abono %s · %s · saldo %s', private.compras_monto_txt(least(v_p.o_monto_usd, v_saldo)),
      coalesce(v_o.oc_codigo, v_o.codigo), private.compras_monto_txt(private.compras_saldo_credito(v_o))),
    array['COMPRAS']);

  v_o := private.compras_cerrar_credito(v_o);

  return jsonb_build_object('id', v_id, 'abonado_total', v_o.abonado_total, 'saldo', private.compras_saldo_credito(v_o));
end;
$$;

create or replace function public.compras_pagar_servicio_directo(p_id bigint, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s    public.compras_servicios_directos;
  v_p    record;
  v_ref  text;
  v_comp jsonb;
  v_debe numeric;
  v_tol  numeric;
  v_efe  boolean;
begin
  perform private.exigir_usuario_activo();
  if not (private.compras_gestiona() or private.compras_aprueba_oc()) then
    raise exception 'El pago lo registra un usuario autorizado para aprobar órdenes de compra o quien lleva Compras.'
      using errcode = '42501';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Faltan los datos del pago.' using errcode = '22023';
  end if;

  select s.* into v_s from public.compras_servicios_directos s where s.id = p_id for update;
  if v_s.id is null then
    raise exception 'Ese servicio directo no existe o fue eliminado.' using errcode = 'P0002';
  end if;
  if v_s.estado <> 'confirmada_pagar' or v_s.pagada_en is not null then
    raise exception 'Solo se paga un servicio en «Confirmado pagar» (está en «%»).', v_s.estado using errcode = '55000';
  end if;

  select * into v_p from private.compras_leer_pago(p_datos);

  v_efe := coalesce(jsonb_array_length(v_s.metodo_pago), 0) > 0
           and not exists (select 1 from jsonb_array_elements(v_s.metodo_pago) l
                            where l ->> 'metodo' not in ('divisas_efectivo', 'efectivo_bs'));
  v_ref := nullif(btrim(coalesce(p_datos ->> 'referencia', '')), '');
  if v_ref is null and not v_efe then
    raise exception 'Indicá la referencia del pago.' using errcode = '22023';
  end if;
  if length(coalesce(v_ref, '')) > 80 then
    raise exception 'La referencia va en 80 letras como mucho.' using errcode = '22023';
  end if;

  v_debe := private.compras_sd_monto_a_pagar(v_s);
  v_tol := case when v_p.o_moneda = 'Bs' then greatest(0.01, round(v_debe * 0.01, 2)) else 0.01 end;
  if v_p.o_monto_usd < v_debe - v_tol then
    raise exception 'Lo pagado (%) no cubre el monto a pagar (%).',
      private.compras_monto_txt(v_p.o_monto_usd), private.compras_monto_txt(v_debe) using errcode = '22023';
  end if;

  v_comp := private.compras_sd_archivo(p_datos -> 'comprobante', p_id, 'pago');

  update public.compras_servicios_directos
     set estado = 'finalizada',
         pagada_por = (select auth.uid()),
         pagada_por_nombre = private.compras_mi_nombre(),
         pagada_en = now(),
         finalizada_en = now(),
         pago_fecha = v_p.o_fecha,
         pago_referencia = v_ref,
         pago_monto = v_p.o_monto,
         pago_moneda = v_p.o_moneda,
         pago_tasa = v_p.o_tasa,
         pago_monto_usd = v_p.o_monto_usd,
         pago_comprobante_path = v_comp ->> 'path',
         pago_comprobante_nombre = v_comp ->> 'filename',
         pago_nota = private.en_mayuscula(nullif(btrim(coalesce(p_datos ->> 'nota', '')), '')),
         historial = historial || private.compras_evento('pagada', jsonb_strip_nulls(jsonb_build_object(
           'fecha', v_p.o_fecha,
           'referencia', v_ref,
           'monto', v_p.o_monto,
           'moneda', v_p.o_moneda,
           'tasa', v_p.o_tasa,
           'monto_usd', v_p.o_monto_usd,
           'monto_a_pagar', v_debe,
           'comprobante_path', v_comp ->> 'path',
           'comprobante_nombre', v_comp ->> 'filename',
           'a', 'finalizada')))
   where id = p_id
  returning * into v_s;

  perform private.compras_sd_avisar(v_s, 'SERVICIO_DIRECTO_PAGADO',
    format('Servicio directo %s pagado · %s', v_s.codigo, private.compras_monto_txt(v_p.o_monto_usd)),
    array['COMPRAS', 'GERENTE_GENERAL']);

  return jsonb_build_object('id', v_s.id, 'estado', v_s.estado, 'monto_usd', v_p.o_monto_usd);
end;
$$;

commit;
