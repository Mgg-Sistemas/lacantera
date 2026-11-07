-- Los datos de pago de una orden solo los ve Compras.
--
-- La política de lectura de `compras_ordenes` dejaba ver la fila completa a
-- quien pidió la orden y al almacén (revisión y recepción). Así podían leer,
-- consultando la tabla por fuera de las pantallas, el método de pago con los
-- datos bancarios del proveedor, la referencia y el comprobante del pago, las
-- retenciones y lo que se negoció en la oferta.
--
-- Ahora la tabla la lee directo solo quien tiene COMPRAS (lectura o más).
-- Los demás la leen con `compras_ordenes_visibles`, que devuelve las mismas
-- filas que antes, con los datos de pago vacíos y la trazabilidad del pago
-- sin montos, referencias ni cuentas.

-- La fila tal cual para Compras; para los demás, sin los datos de pago.
create or replace function private.compras_orden_recortada(o public.compras_ordenes, p_completa boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_completa then to_jsonb(o)
    else to_jsonb(o) || jsonb_build_object(
      'metodo_pago', null, 'metodo_pago_por', null, 'metodo_pago_por_nombre', null, 'metodo_pago_en', null,
      'numero_administracion', null, 'comprobante_tipo', null, 'retenciones', '[]'::jsonb,
      'descuento_pago', null, 'pago_qr_path', null, 'pago_qr_nombre', null, 'pago_fecha', null,
      'pago_referencia', null, 'pago_monto', null, 'pago_moneda', null, 'pago_tasa', null,
      'pago_monto_usd', null, 'pago_comprobante_path', null, 'pago_comprobante_nombre', null,
      'pago_nota', null, 'abonado_total', 0, 'anticipo_monto', null, 'anticipo_en', null,
      'oferta_detalle', null, 'oferta_precio_efectivo', null, 'oferta_precio_bcv', null,
      'oferta_motivo', null, 'oferta_motivo_adjuntos', null,
      'historial', (
        select coalesce(jsonb_agg(
                 case
                   -- Pasos del pago: queda quién y cuándo, sin el detalle.
                   when e ->> 'evento' in ('metodo_pago', 'metodo_pago_corregido', 'documento_retenciones',
                                           'pagada', 'abono', 'credito_saldado', 'credito_a_recepcion',
                                           'comprobante_adjunto')
                     then jsonb_strip_nulls(jsonb_build_object(
                            'at', e -> 'at', 'evento', e -> 'evento', 'actor', e -> 'actor',
                            'actor_nombre', e -> 'actor_nombre', 'a', e -> 'a', 'desde', e -> 'desde'))
                   else e - array['metodos', 'numero_administracion', 'referencia', 'retenciones',
                                  'total_retenciones', 'descuento_pago', 'monto_a_pagar', 'comprobante_path',
                                  'comprobante_nombre', 'abonado', 'saldo', 'pagado', 'pago_externo', 'qr']
                 end
                 order by n), '[]'::jsonb)
          from jsonb_array_elements(coalesce(o.historial, '[]'::jsonb)) with ordinality as h(e, n)))
  end;
$$;

revoke all on function private.compras_orden_recortada(public.compras_ordenes, boolean) from public, anon, authenticated;

-- Las tres lecturas de las pantallas: la lista de Pedidos, «Por revisar» y
-- «Revisadas» del almacén. Mismas filas que dejaba ver la política vieja.
create or replace function public.compras_ordenes_visibles(p_vista text default 'todas', p_dias integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_compras boolean;
  v_inventario boolean;
  v_desde timestamptz;
begin
  perform private.exigir_usuario_activo();

  if p_vista is null or p_vista not in ('todas', 'por_revisar', 'revisadas') then
    raise exception 'Vista de pedidos desconocida: %', p_vista using errcode = '22023';
  end if;

  v_compras := private.tiene_permiso('COMPRAS', 'LECTURA');
  v_inventario := private.tiene_permiso('INVENTARIO', 'LECTURA');

  if p_vista = 'todas' then
    return (
      select coalesce(jsonb_agg(private.compras_orden_recortada(o, v_compras) order by o.creado_en desc), '[]'::jsonb)
        from public.compras_ordenes o
       where v_compras
          or o.creado_por = v_uid
          or o.solicitante_id = v_uid
          or ((o.estado = 'revision_almacen' or o.revisada_almacen_en is not null) and v_inventario)
          or private.compras_almacen_ve(o));
  end if;

  if p_vista = 'por_revisar' then
    if not (v_compras or v_inventario) then
      return '[]'::jsonb;
    end if;
    return (
      select coalesce(jsonb_agg(private.compras_orden_recortada(o, v_compras) order by o.creado_en), '[]'::jsonb)
        from public.compras_ordenes o
       where o.estado = 'revision_almacen'
         and o.clase = 'producto');
  end if;

  -- revisadas
  v_desde := now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 3650)));
  return (
    select coalesce(jsonb_agg(private.compras_orden_recortada(x.fila, v_compras) order by x.revisada_almacen_en desc), '[]'::jsonb)
      from (select o as fila, o.revisada_almacen_en
              from public.compras_ordenes o
             where o.revisada_almacen_en is not null
               and o.revisada_almacen_en >= v_desde
               and (v_compras or v_inventario
                    or o.creado_por = v_uid
                    or o.solicitante_id = v_uid
                    or private.compras_almacen_ve(o))
             order by o.revisada_almacen_en desc
             limit 200) x);
end;
$$;

revoke all on function public.compras_ordenes_visibles(text, integer) from public, anon;
grant execute on function public.compras_ordenes_visibles(text, integer) to authenticated;

-- La tabla directa (y el canal en vivo) queda para Compras.
drop policy if exists compras_ordenes_lectura on public.compras_ordenes;
create policy compras_ordenes_lectura on public.compras_ordenes
  for select to authenticated
  using ((select private.tiene_permiso('COMPRAS', 'LECTURA')));
