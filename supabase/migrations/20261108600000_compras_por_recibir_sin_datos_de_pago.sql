-- «Recepciones por recibir» la ve también quien solo lee Inventario, y la
-- función devolvía la fila completa de la orden: método de pago con los datos
-- bancarios del proveedor, referencia y comprobante del pago, retenciones,
-- detalle de la oferta y trazabilidad. La pantalla del almacén no usa nada de
-- eso, así que se quita de la respuesta. Lo demás queda igual.

create or replace function public.compras_por_recibir()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();

  -- Quien solo lee Inventario también ve la lista (MGG: «Tu rol solo puede ver»).
  if not (private.compras_recibe_almacen()
          or private.tiene_permiso('INVENTARIO', 'LECTURA')
          or private.tiene_permiso('COMPRAS', 'LECTURA')) then
    raise exception 'Sin permiso para ver las recepciones de compras.' using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'orden', to_jsonb(o) - array[
                        'metodo_pago', 'metodo_pago_por', 'metodo_pago_por_nombre', 'metodo_pago_en',
                        'numero_administracion', 'comprobante_tipo', 'retenciones', 'descuento_pago',
                        'pago_qr_path', 'pago_qr_nombre', 'pago_fecha', 'pago_referencia', 'pago_monto',
                        'pago_moneda', 'pago_tasa', 'pago_monto_usd', 'pago_comprobante_path',
                        'pago_comprobante_nombre', 'pago_nota', 'abonado_total', 'anticipo_monto',
                        'anticipo_en', 'oferta_detalle', 'oferta_precio_efectivo', 'oferta_precio_bcv',
                        'oferta_motivo', 'oferta_motivo_adjuntos', 'historial'],
             'proveedor', p.nombre,
             'proveedor_rif', p.rif,
             'recepciones', (select count(*) from public.compras_recepciones r where r.orden_id = o.id))
           order by o.urgente desc, coalesce(o.pagada_en, o.oc_aprobada_en, o.creado_en)), '[]'::jsonb)
      from public.compras_ordenes o
      left join public.proveedores p on p.id = o.proveedor_id
     where o.oc_codigo is not null
       and o.recibida_en is null
       and o.clase <> 'servicio'
       and (o.estado = 'por_recibir' or o.estado = 'pagada'));
end;
$$;

revoke all on function public.compras_por_recibir() from public, anon;
grant execute on function public.compras_por_recibir() to authenticated;
