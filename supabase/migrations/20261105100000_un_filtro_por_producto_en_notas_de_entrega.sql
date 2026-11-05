-- ============================================================================
-- UN FILTRO POR PRODUCTO EN NOTAS DE ENTREGA (05/11/2026)
--
-- Christopher: «ponme un botón de categoría que sea el material de venta
-- (Arena lavada, Polvillo, etc.)» — confirmado después: que se llame
-- "Producto" y que sea un solo filtro, igual que Moneda y Cobro.
--
-- El catálogo ya existe (`articulos.categoria = 'PRODUCTO'`, la misma lista
-- que ya carga `v_precios_venta` en esta pantalla); lo que faltaba era que
-- `v_notas_entrega` dijera qué artículos lleva cada nota. Se agrega
-- `articulos_ids`, un arreglo con los `articulo_id` de sus renglones sin
-- repetir, para filtrar con el operador «contains» de PostgREST
-- (`.contains('articulos_ids', [id])`). No se enseña en la pantalla, solo
-- sirve para filtrar.
--
-- Mismo patrón que ya usó `20261012120000_la_nota_de_entrega_se_puede_pedir
-- _pendiente_por_cobrar.sql` para extender esta misma vista: se toma su
-- definición real con `pg_get_viewdef`, se busca un ancla que aparezca
-- exactamente una vez, se le agrega la columna nueva y se vuelve a crear con
-- `create or replace view` —agregar una columna al final no le quita nada a
-- las existentes, así que no hace falta `drop view`—.
-- ============================================================================

do $mig$
declare
  v_def   text := pg_get_viewdef('public.v_notas_entrega'::regclass, true);
  v_ancla text := $a$n.pendiente_por_cobrar AND n.cobrada_en IS NULL AND n.fecha_pago < CURRENT_DATE AS vencida_por_cobrar
   FROM notas_entrega n$a$;
  v_nueva text := $n$n.pendiente_por_cobrar AND n.cobrada_en IS NULL AND n.fecha_pago < CURRENT_DATE AS vencida_por_cobrar,
    ( SELECT COALESCE(array_agg(DISTINCT r3.articulo_id), '{}'::bigint[])
        FROM nota_entrega_renglones r3
       WHERE r3.nota_id = n.id AND r3.articulo_id IS NOT NULL) AS articulos_ids
   FROM notas_entrega n$n$;
begin
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'v_notas_entrega: el ancla no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, v_nueva);
  execute 'create or replace view public.v_notas_entrega with (security_invoker = on) as ' || v_def;
end
$mig$;

-- ─────────────────────────────────── comprobación ───────────────────────────
do $comprueba$
begin
  if position('articulos_ids' in pg_get_viewdef('public.v_notas_entrega'::regclass, true)) = 0 then
    raise exception 'v_notas_entrega no quedó con articulos_ids.';
  end if;
  if (select array_to_string(reloptions, ',') from pg_class where oid = 'public.v_notas_entrega'::regclass)
     is distinct from 'security_invoker=on' then
    raise exception 'v_notas_entrega perdió security_invoker.';
  end if;
end
$comprueba$;
