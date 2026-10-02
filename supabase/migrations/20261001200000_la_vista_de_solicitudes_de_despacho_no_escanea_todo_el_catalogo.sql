-- ═══════════════════════════════════════════════════════════════════════════
-- LA VISTA DE SOLICITUDES DE DESPACHO NO ESCANEA TODO EL CATÁLOGO
--
-- «Despachos por aprobar» en Notas de entrega tardaba y el servidor la
-- cortaba por timeout (visto en pantalla el 01/10/2026). El renglón de cada
-- solicitud traía el nombre del artículo con un LEFT JOIN a `articulos`
-- DENTRO del subquery que arma los renglones — y ese subquery corre una vez
-- por cada solicitud. Sin RLS eso es barato (un hash join de una tabla
-- chica). Con RLS, cada una de las 452 filas de `articulos` que se escanean
-- evalúa `private.tiene_permiso('PANEL','LECTURA')`, y eso se repite una vez
-- por solicitud: 53 solicitudes × 452 filas = 23.956 evaluaciones. Medido:
-- 8,6 segundos como un usuario real (contra 447 ms sin RLS, de ahí que nadie
-- lo viera probando como postgres).
--
-- EL ARREGLO: una subconsulta escalar por el id del artículo
-- (`select nombre from articulos where id = …`) en vez de un JOIN. Con el id
-- como condición, Postgres usa el índice de la llave primaria y el filtro de
-- RLS se evalúa sobre 1 fila por renglón, no sobre las 452. Medido: 285 ms.
--
-- Mismas columnas, mismo orden, mismo `security_invoker = on`: no cambia nada
-- para quien la consume, solo cómo se calcula.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_solicitudes_despacho with (security_invoker = on) as
 SELECT s.id,
    s.numero,
    s.estado,
    s.cliente_id,
    c.nombre AS cliente,
    c.rif AS cliente_rif,
    s.almacen_id,
    a.nombre AS almacen,
    s.moneda,
    s.vehiculo,
    vd.descripcion AS vehiculo_descripcion,
    s.chofer,
    s.cedula_chofer,
    s.ticket,
    s.peso_bruto,
    s.peso_tara,
    s.flete,
    s.observacion,
    s.pedida_por,
    s.pedida_en,
    s.resuelta_por,
    s.resuelta_en,
    s.motivo_cierre,
    s.nota_id,
    n.numero AS nota_numero,
    ( SELECT COALESCE(jsonb_agg(
                CASE
                    WHEN private.puede_accion('VENTAS.VER_VENTAS'::text) OR private.puede_accion('FACTURACION.VER_FACTURACION'::text) THEN r.valor
                    ELSE r.valor - 'precio_unitario'::text
                END || jsonb_build_object('articulo', (SELECT ar.nombre FROM articulos ar WHERE ar.id = ((r.valor ->> 'articulo_id'::text)::bigint))) ORDER BY r.orden), '[]'::jsonb) AS "coalesce"
       FROM jsonb_array_elements(s.renglones) WITH ORDINALITY r(valor, orden)) AS renglones
   FROM solicitudes_despacho s
     JOIN clientes c ON c.id = s.cliente_id
     JOIN almacenes a ON a.id = s.almacen_id
     LEFT JOIN vehiculos_de_despacho vd ON vd.id = s.vehiculo_despacho_id
     LEFT JOIN notas_entrega n ON n.id = s.nota_id;

do $comprueba$
begin
  if (select array_to_string(reloptions, ',') from pg_class where oid = 'public.v_solicitudes_despacho'::regclass)
     is distinct from 'security_invoker=on' then
    raise exception 'v_solicitudes_despacho perdió security_invoker.';
  end if;
  if position('LEFT JOIN articulos' in pg_get_viewdef('public.v_solicitudes_despacho'::regclass, true)) > 0 then
    raise exception 'v_solicitudes_despacho todavía hace join contra articulos: el arreglo no quedó.';
  end if;
end
$comprueba$;
