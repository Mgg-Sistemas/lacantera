-- ============================================================================
-- QUITAR LAS TRES CONSTRAINTS VIEJAS DE CONDICIÓN COHERENTE (04/11/2026)
--
-- En la migración `20261103100000_el_precio_acordado_puede_pisar_la_lista.sql`
-- las tres restricciones originales (`*_condicion_coherente`, que exigían
-- `precio_lista is null` cuando `condicion = 'ACORDADO'`) se renombraron a
-- `*_viejo_20261103` en vez de eliminarse. En PostgreSQL una restricción CHECK
-- renombrada sigue activa y evaluándose en cada INSERT/UPDATE, por lo que al
-- aprobar un despacho con precio acordado sobre un artículo con lista seguía
-- saltando `23514: violates check constraint "..._viejo_20261103"`.
-- ============================================================================

alter table public.cotizacion_venta_renglones
  drop constraint if exists cotizacion_renglon_condicion_coherente_viejo_20261103;

alter table public.nota_entrega_renglones
  drop constraint if exists nota_renglon_condicion_coherente_viejo_20261103;

alter table public.factura_venta_renglones
  drop constraint if exists factura_renglon_condicion_coherente_viejo_20261103;
