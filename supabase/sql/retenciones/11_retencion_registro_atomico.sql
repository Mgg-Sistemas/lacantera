begin;

-- El disparador de retencion_documentos ya crea el enlace de origen.
-- La función conserva ese enlace y usa el mismo motor de líneas del libro.
create or replace function public.retencion_factura_registrar(p_factura jsonb, p_lineas jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  f public.retencion_documentos;
  dk text := coalesce(nullif(p_factura ->> 'doc_kind', ''), 'manual');
  did_txt text := nullif(p_factura ->> 'doc_id', '');
  did bigint := case when did_txt ~ '^[0-9]+$' then did_txt::bigint else null end;
  solo boolean := coalesce((p_factura ->> 'solo_documento')::boolean, false);
begin
  if jsonb_typeof(p_lineas) is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'RET_FACTURA_SIN_LINEAS: la factura necesita al menos una línea de impuesto.';
  end if;
  if jsonb_array_length(p_lineas) = 0 and not solo then
    raise exception using errcode = 'P0001',
      message = 'RET_FACTURA_SIN_LINEAS: la factura necesita al menos una línea de impuesto (o registrarla sola, con solo_documento).';
  end if;
  if coalesce(p_factura ->> 'rol', '') not in ('practicada', 'sufrida') then
    raise exception using errcode = 'P0001', message = 'RET_FACTURA_ROL: rol debe ser «practicada» o «sufrida».';
  end if;
  if coalesce(nullif(p_factura ->> 'tipo_documento', ''), 'factura') not in ('factura', 'nota_debito', 'nota_credito') then
    raise exception using errcode = 'P0001', message = 'RET_DOCUMENTO_TIPO: tipo_documento debe ser factura, nota_debito o nota_credito.';
  end if;
  if coalesce(nullif(p_factura ->> 'tipo_documento', ''), 'factura') <> 'factura'
     and nullif(btrim(p_factura ->> 'factura_afectada_nro'), '') is null then
    raise exception using errcode = 'P0001', message = 'RET_DOCUMENTO_AFECTADO: una nota de débito o de crédito lleva el N° de la factura que ajusta.';
  end if;
  if dk not in ('oc', 'compra_directa', 'servicio_directo', 'manual') then
    raise exception using errcode = 'P0001', message = 'RET_FACTURA_DOC: doc_kind debe ser oc, compra_directa, servicio_directo o manual.';
  end if;
  if dk <> 'manual' and did is null then
    raise exception using errcode = 'P0001', message = 'RET_FACTURA_DOC: falta doc_id para ' || dk || '.';
  end if;

  insert into public.retencion_documentos (
    rol, tipo_documento, documento_afectado_id, factura_afectada_nro,
    proveedor_id, rif, razon_social, sujeto, factura_nro, factura_control, factura_fecha, factura_total,
    exento, iva_alicuota, iva_monto, moneda, tasa, orden_id, compra_directa_id, servicio_directo_id,
    operacion, concepto, nota, actor, actor_name)
  values (
    p_factura ->> 'rol',
    coalesce(nullif(p_factura ->> 'tipo_documento', ''), 'factura'),
    nullif(p_factura ->> 'documento_afectado_id', '')::uuid,
    nullif(btrim(p_factura ->> 'factura_afectada_nro'), ''),
    case when (p_factura ->> 'proveedor_id') ~ '^[0-9]+$' then (p_factura ->> 'proveedor_id')::bigint else null end,
    nullif(btrim(p_factura ->> 'rif'), ''),
    nullif(btrim(p_factura ->> 'razon_social'), ''),
    nullif(p_factura ->> 'sujeto', ''),
    nullif(btrim(p_factura ->> 'factura_nro'), ''),
    nullif(btrim(p_factura ->> 'factura_control'), ''),
    nullif(p_factura ->> 'factura_fecha', '')::date,
    nullif(p_factura ->> 'factura_total', '')::numeric,
    nullif(p_factura ->> 'exento', '')::numeric,
    nullif(p_factura ->> 'iva_alicuota', '')::numeric,
    nullif(p_factura ->> 'iva_monto', '')::numeric,
    coalesce(nullif(p_factura ->> 'moneda', ''), 'Bs'),
    nullif(p_factura ->> 'tasa', '')::numeric,
    case when dk = 'oc' then did end,
    case when dk = 'compra_directa' then did end,
    case when dk = 'servicio_directo' then did end,
    nullif(p_factura ->> 'operacion', ''),
    nullif(btrim(p_factura ->> 'concepto'), ''),
    nullif(btrim(p_factura ->> 'nota'), ''),
    coalesce(nullif(p_factura ->> 'actor', ''), auth.jwt() ->> 'email'),
    nullif(p_factura ->> 'actor_name', ''))
  returning * into f;

  -- (R7F) El archivo de factura del que salió (adjuntos_directos, P03) se enlaza en la misma transacción.
  if nullif(p_factura ->> 'adjunto_id', '') is not null then
    if num_nonnulls(f.orden_id, f.compra_directa_id, f.servicio_directo_id) = 0 then
      raise exception using errcode = 'P0001', message = 'RET_ADJUNTO_SIN_ORIGEN: un archivo de factura solo se enlaza a un documento de una OC, compra directa o servicio directo.';
    end if;
    update public.retencion_documento_origenes
       set adjunto_id = (p_factura ->> 'adjunto_id')::uuid
     where documento_id = f.id
       and coalesce(orden_id, compra_directa_id, servicio_directo_id) = coalesce(f.orden_id, f.compra_directa_id, f.servicio_directo_id);
    if not found then
      raise exception using errcode = 'P0001', message = 'RET_ADJUNTO_SIN_ORIGEN: no se encontró el enlace del documento con su origen.';
    end if;
  end if;

  return jsonb_build_object('factura', to_jsonb(f),
                            'lineas', public.retencion_lineas_insertar(f, p_lineas, p_factura ->> 'periodo', f.actor, f.actor_name));
end $$;

revoke all on function public.retencion_factura_registrar(jsonb,jsonb) from public, anon;
grant execute on function public.retencion_factura_registrar(jsonb,jsonb) to authenticated, service_role;

commit;
