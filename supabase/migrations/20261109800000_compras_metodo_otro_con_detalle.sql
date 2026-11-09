/*
  EL MÉTODO «OTRO» DICE CUÁL ES (la dueña, 09/11/2026)

  «En Método de pago, al elegir "Otro" no hay dónde indicar qué método es.»
  Ahora, al elegir «Otro», la pantalla pide «¿Cuál método?» (hasta 60 letras)
  y se enseña como «Otro: <detalle>» en la ficha, el WhatsApp, el PDF, «Marcar
  pagada», el histórico y el servicio directo.

  `private.compras_normalizar_metodos` armaba cada método solo con
  {metodo, moneda, monto, datos} y descartaba cualquier otra clave: el detalle
  no llegaba a guardarse. Se redefine para que el método «otro» lleve
  `detalle` (obligatorio, hasta 60 letras, en mayúscula como el resto de los
  textos de Compras). Sirve a las tres puertas que la llaman sin tocarlas:
  `compras_indicar_metodo_pago`, `compras_corregir_metodo_pago` y
  `compras_metodo_pago_servicio_directo`.

  El abono de un crédito usa el mismo selector de métodos: `compras_abonos`
  gana la columna `metodo_detalle` y `compras_registrar_abono` la exige y la
  guarda (también en el evento «abono» del historial).

  Lo demás queda como en su definición vigente (leída con pg_get_functiondef
  el 09/11/2026). Los métodos ya guardados no se tocan: un «Otro» viejo sigue
  diciendo «Otro».
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Los métodos de la OC / del servicio directo
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function private.compras_normalizar_metodos(p_metodos jsonb, p_proveedor_id bigint, p_guardar boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_x     jsonb;
  v_m     record;
  v_cod   text;
  v_monto numeric;
  v_dat   record;
  v_out   jsonb := '[]'::jsonb;
  v_leg   jsonb;
  v_det   text;
begin
  if p_metodos is null or jsonb_typeof(p_metodos) <> 'array' or jsonb_array_length(p_metodos) = 0 then
    raise exception 'Indicá al menos un método de pago.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_metodos) > 6 then
    raise exception 'Hasta 6 métodos de pago por orden.' using errcode = '22023';
  end if;

  for v_x in select * from jsonb_array_elements(p_metodos) loop
    v_cod := btrim(coalesce(v_x ->> 'metodo', ''));
    select * into v_m from private.compras_metodo_pago(v_cod);
    if v_m.o_label is null then
      raise exception 'Ese método de pago no existe.' using errcode = '22023';
    end if;

    begin
      v_monto := round(greatest(coalesce(nullif(btrim(coalesce(v_x ->> 'monto', '')), '')::numeric, 0), 0), 2);
    exception when others then
      raise exception '%: el monto no se entiende.', v_m.o_label using errcode = '22023';
    end;

    v_leg := jsonb_build_object('metodo', v_cod, 'moneda', v_m.o_moneda, 'monto', v_monto);

    -- «Otro» dice cuál es (09/11/2026).
    if v_cod = 'otro' then
      v_det := private.en_mayuscula(nullif(btrim(coalesce(v_x ->> 'detalle', '')), ''));
      if v_det is null then
        raise exception 'Otro: indicá cuál método.' using errcode = '22023';
      end if;
      if length(v_det) > 60 then
        raise exception 'Otro: el método va en 60 letras como mucho.' using errcode = '22023';
      end if;
      v_leg := v_leg || jsonb_build_object('detalle', v_det);
    end if;

    if v_cod in ('pago_movil', 'transferencia', 'zelle', 'binance_usdt') then
      begin
        select * into v_dat from private.compras_limpiar_datos_pago(v_cod, v_x -> 'datos');
      exception when sqlstate '22023' then
        raise exception '%: %', v_m.o_label, sqlerrm using errcode = '22023';
      end;
      v_leg := v_leg || jsonb_build_object('datos', v_dat.o_datos);
      if p_guardar and p_proveedor_id is not null then
        perform private.compras_guardar_datos_pago(p_proveedor_id, v_cod, v_dat.o_datos);
      end if;
    end if;

    v_out := v_out || jsonb_build_array(v_leg);
  end loop;

  if jsonb_array_length(v_out) > 1
     and exists (select 1 from jsonb_array_elements(v_out) l where (l ->> 'monto')::numeric <= 0) then
    raise exception 'En multipago, indicá el monto por cada método/moneda.' using errcode = '22023';
  end if;

  return v_out;
end;
$$;

revoke all on function private.compras_normalizar_metodos(jsonb, bigint, boolean) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. El abono de un crédito
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.compras_abonos
  add column if not exists metodo_detalle text;

alter table public.compras_abonos
  drop constraint if exists compras_abonos_metodo_detalle_largo;
alter table public.compras_abonos
  add constraint compras_abonos_metodo_detalle_largo check (metodo_detalle is null or length(metodo_detalle) <= 60);

comment on column public.compras_abonos.metodo_detalle is
  'Con el método «otro»: cuál es (hasta 60 letras). Se enseña como «Otro: <detalle>».';

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

  if not private.compras_aprueba_oc() then
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

  -- «Otro» dice cuál es (09/11/2026).
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

  -- MGG: «Abono $X · {OC}».
  perform private.compras_avisar(v_o, 'OC_ABONO',
    format('Abono %s · %s · saldo %s', private.compras_monto_txt(least(v_p.o_monto_usd, v_saldo)),
      coalesce(v_o.oc_codigo, v_o.codigo), private.compras_monto_txt(private.compras_saldo_credito(v_o))),
    array['COMPRAS']);

  v_o := private.compras_cerrar_credito(v_o);

  return jsonb_build_object('id', v_id, 'abonado_total', v_o.abonado_total, 'saldo', private.compras_saldo_credito(v_o));
end;
$$;

revoke all on function public.compras_registrar_abono(bigint, jsonb) from public, anon;
grant execute on function public.compras_registrar_abono(bigint, jsonb) to authenticated;
