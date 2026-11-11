-- ============================================================================
-- EL PRECIO DE LA NOTA QUE RESPALDA UNA SALIDA SE PUEDE CAMBIAR (11/11/2026)
--
-- Pedido: las notas de CONSTRULAGUAIRA nacidas de una salida (NE-2026-0106,
-- 0121, 0164, 0188) «editables, para poder cambiar el monto», como las demás.
--
-- editar_nota_entrega no toca los renglones de una nota con nota_salida, y
-- con razón: al editar renglones reversa y vuelve a descontar el inventario,
-- y en estas el material ya lo descontó la salida. Convertirlas en notas
-- «normales» descontaría dos veces del patio.
--
-- Así que una puerta aparte, solo para el PRECIO: el material y la cantidad
-- se quedan como los dejó la salida, el inventario no se toca, y los totales
-- en Bs y $ los recalcula el trigger de siempre (trg_total). Solo ADMIN —el
-- mismo que edita una nota—, con motivo, que queda en la auditoría porque va
-- en motivo_condicion del renglón. No se usa en una nota anulada ni en una ya
-- facturada (el monto de la factura ya salió).
-- ============================================================================

create or replace function public.cambiar_precios_nota_de_salida(p_id bigint, p_precios jsonb, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nota  public.notas_entrega;
  v_item  jsonb;
  v_precio numeric;
begin
  perform private.exigir_rol('ADMIN');

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escriba el motivo del cambio de precio.' using errcode = '22023';
  end if;
  if p_precios is null or jsonb_typeof(p_precios) <> 'array' or jsonb_array_length(p_precios) = 0 then
    raise exception 'No llegó ningún precio que cambiar.' using errcode = '22023';
  end if;

  select * into v_nota from public.notas_entrega where id = p_id for update;
  if v_nota.id is null then
    raise exception 'No existe la nota de entrega %.', p_id using errcode = 'P0002';
  end if;
  if v_nota.nota_salida is null then
    raise exception 'La nota % no respalda ninguna salida: sus precios se cambian con «Editar».', v_nota.numero
      using errcode = '55000';
  end if;
  if v_nota.estado = 'ANULADA' then
    raise exception 'La nota % está anulada: no se le cambia el precio.', v_nota.numero using errcode = '55000';
  end if;
  if v_nota.factura_id is not null then
    raise exception 'La nota % ya está facturada: el monto es el de la factura.', v_nota.numero using errcode = '55000';
  end if;

  for v_item in select * from jsonb_array_elements(p_precios) loop
    v_precio := round(nullif(v_item ->> 'precio', '')::numeric, 6);
    if v_precio is null or v_precio <= 0 then
      raise exception 'Cada precio tiene que ser mayor que cero.' using errcode = '22023';
    end if;

    update public.nota_entrega_renglones
       set precio_unitario = v_precio,
           condicion = 'ACORDADO',
           precio_pendiente = false,
           descuento_pct = null,
           descuento_unitario = null,
           motivo_condicion = left(format('CAMBIO DE PRECIO DE LA NOTA %s: %s', v_nota.numero, btrim(p_motivo)), 500)
     where id = (v_item ->> 'renglon_id')::bigint
       and nota_id = p_id;
    if not found then
      raise exception 'Uno de los renglones indicados no es de la nota %.', v_nota.numero using errcode = '22023';
    end if;
  end loop;
end;
$$;

comment on function public.cambiar_precios_nota_de_salida(bigint, jsonb, text) is
  'Cambia solo el precio de los renglones de una nota que respalda una salida, sin tocar inventario. Solo ADMIN, con motivo (11/11/2026).';

revoke all on function public.cambiar_precios_nota_de_salida(bigint, jsonb, text) from public, anon;
grant execute on function public.cambiar_precios_nota_de_salida(bigint, jsonb, text) to authenticated;
