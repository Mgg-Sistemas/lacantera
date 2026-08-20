-- ---------------------------------------------------------------------------
-- La vista de facturas de proveedor trae también el papel
--
-- `v_facturas_compra` enumera sus columnas una a una, así que las dos que se
-- añadieron a la tabla en `20260820220000` no llegaron solas. La pantalla lee
-- de la vista, no de la tabla, y sin esto el archivo estaría guardado y sería
-- invisible.
--
-- Van al final a propósito: `create or replace view` solo admite añadir
-- columnas por el final. Meterlas en medio obligaría a borrar y rehacer la
-- vista, y de esta sí cuelgan cosas.
-- ---------------------------------------------------------------------------
create or replace view public.v_facturas_compra as
 SELECT f.id,
    f.proveedor_id,
    f.orden_id,
    f.numero_factura,
    f.numero_control,
    f.fecha_emision,
    f.fecha_recepcion,
    f.condicion_pago,
    f.dias_credito,
    f.vence_el,
    f.moneda,
    f.tasa,
    f.tasa_usd,
    f.exento,
    f.base_imponible,
    f.alicuota_iva,
    f.iva,
    f.retencion_iva,
    f.retencion_islr,
    f.total,
    f.total_bs,
    f.total_usd,
    f.retencion_usd,
    f.observacion,
    f.estado,
    f.motivo_anulacion,
    f.anulada_por,
    f.anulada_en,
    f.registrada_por,
    f.registrada_en,
    p.nombre AS proveedor,
    p.rif AS proveedor_rif,
    o.numero AS orden_numero,
    COALESCE(g.pagado_usd, 0::numeric) AS pagado_usd,
    GREATEST(f.total_usd - f.retencion_usd - COALESCE(g.pagado_usd, 0::numeric), 0::numeric) AS saldo_usd,
        CASE
            WHEN f.estado = 'REGISTRADA'::text AND f.vence_el IS NOT NULL AND f.vence_el < CURRENT_DATE THEN CURRENT_DATE - f.vence_el
            ELSE 0
        END AS dias_vencida,
    f.archivo_path,
    f.archivo_nombre
   FROM facturas_compra f
     JOIN proveedores p ON p.id = f.proveedor_id
     LEFT JOIN ordenes_compra o ON o.id = f.orden_id
     LEFT JOIN LATERAL ( SELECT sum(pagos_compra.monto_usd) AS pagado_usd
           FROM pagos_compra
          WHERE pagos_compra.factura_id = f.id AND pagos_compra.estado = 'REGISTRADO'::text) g ON true;
