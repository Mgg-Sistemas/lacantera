-- ============================================================================
-- Tiempo real
--
-- Hasta ahora una pantalla solo se enteraba de un cambio si quien la miraba lo
-- había hecho, si le tocaba el refresco periódico o si recargaba. En una
-- cantera eso se nota: tesorería paga una orden y el de compras sigue viendo
-- "esperando pago"; almacén recibe material y existencias muestra el número de
-- antes; alguien aprueba una nómina y quien va a pagarla no lo ve.
--
-- Postgres ya publica sus cambios en un flujo de replicación. Lo único que
-- hace falta es decirle a Supabase qué tablas de ese flujo puede reenviar a
-- los navegadores conectados. Eso es esta migración; el navegador se ocupa de
-- traducir "cambió esta tabla" en "vuelve a pedir estas consultas".
--
-- Dos cosas importantes:
--
-- 1. El reenvío respeta las políticas de RLS. Un usuario solo recibe aviso de
--    las filas que ya podría leer con una consulta normal, así que publicar
--    `empleados` o `nomina_recibos` no expone sueldos a quien no los ve.
--
-- 2. No se publica todo. Los catálogos que no cambian en meses —monedas,
--    unidades, roles— no ganan nada y sí ocupan ancho de banda de la
--    replicación. Tampoco `correlativos`, que cambia con cada documento y no
--    lo mira nadie.
-- ============================================================================

do $$
declare
  v_tabla text;
begin
  -- La publicación la crea Supabase al provisionar el proyecto. Si no
  -- existiera, esto fallaría con un mensaje claro en vez de dejar el tiempo
  -- real medio configurado y en silencio.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'No existe la publicación supabase_realtime. Actívala en el panel de Supabase antes de aplicar esta migración.';
  end if;

  foreach v_tabla in array array[
    -- Compras
    'solicitudes_pedido', 'solicitud_renglones',
    'cotizaciones', 'cotizacion_renglones',
    'ordenes_compra', 'orden_renglones',
    'instrucciones_pago', 'compras_bitacora',
    'proveedores',
    -- Inventario
    'inventario_movimientos', 'articulos', 'almacenes',
    -- Tesorería
    'cuentas_tesoreria', 'tesoreria_movimientos',
    -- Nómina
    'empleados', 'nomina_periodos', 'nomina_recibos', 'nomina_recibo_lineas',
    'nomina_novedades', 'nomina_novedades_montos', 'nomina_parametros',
    -- Sistema
    'notificaciones', 'notificaciones_leidas', 'tasas_cambio', 'perfiles'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = v_tabla
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_tabla);
    end if;
  end loop;
end
$$;

-- Un DELETE solo viaja con la fila entera: sin ella, Postgres publica nada más
-- la clave primaria y Supabase no puede evaluar la política de RLS sobre lo
-- borrado, así que descarta el aviso y la pantalla se queda con la fila
-- fantasma. Se pide la fila completa solo donde de verdad se borra —renglones
-- que se rehacen al editar un documento, montos de novedades, marcas de
-- notificación leída—, porque guardar la fila vieja engorda la replicación y
-- en los libros inmutables nunca haría falta: allí no se borra nada.
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'solicitud_renglones', 'cotizacion_renglones', 'orden_renglones',
    'nomina_novedades_montos', 'notificaciones_leidas'
  ] loop
    execute format('alter table public.%I replica identity full', v_tabla);
  end loop;
end
$$;
