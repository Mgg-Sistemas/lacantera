-- ═══════════════════════════════════════════════════════════════════════════
-- EL PANEL RESUME DESPACHOS Y VENTAS
--
-- Se pidió un informe de despachos, traslados y notas de entrega, visible
-- desde el Panel y con un botón para generarlo en PDF, que se mantenga al
-- día solo —"que se vaya actualizando a medida que se vaya despachando
-- material"—, sin copias ni fotos de un día: los mismos cinco números que ya
-- resume `v_panel_resumen` para compras y tesorería, calculados igual, en
-- caliente, cada vez que alguien abre el Panel.
--
-- Se gatea con el mismo candado que ya protege «notas sin facturar», dos
-- líneas más arriba en esta misma vista: SALIDAS o FACTURACION en LECTURA.
-- Cuánto facturó la empresa y a quién no es un dato que vea cualquiera que
-- entra al sistema.
--
-- LOS CINCO NÚMEROS DEL PANEL, Y EL DESGLOSE APARTE
--
-- El Panel solo necesita el total: movimientos de salida, traslados, notas
-- vigentes, dólares y bolívares —cinco columnas más en la misma fila que ya
-- se calcula una vez por visita—. El desglose por artículo, por destino y
-- por cliente —el que de verdad cuesta, con sus GROUP BY— no hace falta en
-- cada entrada al Panel: vive en `resumen_despachos_detalle()`, aparte, y
-- solo se llama cuando alguien pulsa «Generar informe». Ninguna categoría de
-- cliente inventada —«público», «ferretero»—: eso no es un dato del sistema,
-- y el acuerdo con el usuario fue no inventarlo.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Cinco columnas más al final de v_panel_resumen. `create or replace view`
--    es válido aquí porque solo se añade al final: ver
--    las-migraciones-no-se-replican-desde-cero.
do $mig$
declare
  v_def   text := pg_get_viewdef('public.v_panel_resumen'::regclass, true);
  v_ancla text := 'END AS despachos_por_aprobar;';
  v_nueva text := $n$END AS despachos_por_aprobar,
    CASE
        WHEN ( SELECT private.tiene_permiso('SALIDAS'::text, 'LECTURA'::text)
               OR private.tiene_permiso('FACTURACION'::text, 'LECTURA'::text) )
        THEN ( SELECT count(*)::integer FROM inventario_movimientos
                WHERE tipo IN ('SALIDA_CONSUMO', 'SALIDA_MERMA', 'SALIDA_BAJA', 'SALIDA_DESPACHO', 'SALIDA_INTERCAMBIO') )
        ELSE NULL::integer
    END AS despachos_movimientos,
    CASE
        WHEN ( SELECT private.tiene_permiso('SALIDAS'::text, 'LECTURA'::text)
               OR private.tiene_permiso('FACTURACION'::text, 'LECTURA'::text) )
        THEN ( SELECT count(*)::integer FROM inventario_movimientos WHERE tipo = 'TRANSFERENCIA_SALIDA' )
        ELSE NULL::integer
    END AS despachos_traslados,
    CASE
        WHEN ( SELECT private.tiene_permiso('SALIDAS'::text, 'LECTURA'::text)
               OR private.tiene_permiso('FACTURACION'::text, 'LECTURA'::text) )
        THEN ( SELECT count(*)::integer FROM notas_entrega WHERE estado <> 'ANULADA' )
        ELSE NULL::integer
    END AS despachos_notas_vigentes,
    CASE
        WHEN ( SELECT private.tiene_permiso('SALIDAS'::text, 'LECTURA'::text)
               OR private.tiene_permiso('FACTURACION'::text, 'LECTURA'::text) )
        THEN ( SELECT COALESCE(sum(total_usd), 0::numeric) FROM notas_entrega WHERE estado <> 'ANULADA' )
        ELSE NULL::numeric
    END AS despachos_total_usd,
    CASE
        WHEN ( SELECT private.tiene_permiso('SALIDAS'::text, 'LECTURA'::text)
               OR private.tiene_permiso('FACTURACION'::text, 'LECTURA'::text) )
        THEN ( SELECT COALESCE(sum(total_bs), 0::numeric) FROM notas_entrega WHERE estado <> 'ANULADA' )
        ELSE NULL::numeric
    END AS despachos_total_bs;
$n$;
  v_n int;
begin
  select count(*) into v_n from regexp_matches(v_def, v_ancla, 'g');
  if v_n <> 1 then
    raise exception 'v_panel_resumen: el ancla no aparece exactamente una vez (%)', v_n;
  end if;
  v_def := replace(v_def, v_ancla, v_nueva);
  execute 'create or replace view public.v_panel_resumen with (security_invoker = on) as ' || v_def;
end
$mig$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. El desglose, aparte: por artículo, por destino y por cliente. Solo se
--    llama al generar el informe en PDF, no en cada visita al Panel.
--
--    LOS DESTINOS SE CUENTAN, NO SE SUMAN. Un mismo renglón de "por destino"
--    mezclaría metros cúbicos de arena con unidades de otro artículo si se
--    sumara la cantidad: contar movimientos es lo único que no depende de
--    la unidad.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.resumen_despachos_detalle()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $func$
declare
  v_resultado jsonb;
begin
  if not (private.tiene_permiso('SALIDAS', 'LECTURA') or private.tiene_permiso('FACTURACION', 'LECTURA')) then
    raise exception 'No tiene permiso para ver el desglose de despachos.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'por_articulo', (
      /*
        SOLO «PRODUCTO», NO TODO LO QUE SALE DEL ALMACÉN.
        El combustible y los insumos también son salidas, y en volumen le
        ganan a la arena —el gasoil se mueve en litros por decenas de
        miles—. Mezclarlos en este ranking convertiría un informe de lo que
        se vendió en uno de lo que más se gastó. `categoria = 'PRODUCTO'`
        ya existe en el catálogo: no es una clasificación inventada aquí.
      */
      select coalesce(jsonb_agg(t order by t.cantidad desc), '[]'::jsonb)
        from (
          select a.nombre as articulo, m.unidad, sum(m.cantidad) as cantidad
            from public.inventario_movimientos m
            join public.articulos a on a.id = m.articulo_id
           where m.tipo in ('SALIDA_CONSUMO', 'SALIDA_MERMA', 'SALIDA_BAJA', 'SALIDA_DESPACHO', 'SALIDA_INTERCAMBIO')
             and a.categoria = 'PRODUCTO'
           group by a.nombre, m.unidad
           order by sum(m.cantidad) desc
           limit 8
        ) t
    ),
    'por_destino', (
      /*
        SOLO LO QUE DICE A DÓNDE FUE. Un consumo interno —el gasoil del
        surtidor, el repuesto que se montó— no tiene «para quién salió»
        porque no sale para nadie de fuera; incluirlo como «Sin
        especificar» llenaría el ranking con la ausencia de un destino, que
        no es un destino.
      */
      select coalesce(jsonb_agg(t order by t.movimientos desc), '[]'::jsonb)
        from (
          select coalesce(
                   (select n.nombre from public.organigrama_nodos n where n.id = m.grupo_id),
                   m.destino_externo
                 ) as destino,
                 count(*) as movimientos
            from public.inventario_movimientos m
            join public.articulos a on a.id = m.articulo_id
           where m.tipo in ('SALIDA_CONSUMO', 'SALIDA_MERMA', 'SALIDA_BAJA', 'SALIDA_DESPACHO', 'SALIDA_INTERCAMBIO')
             and a.categoria = 'PRODUCTO'
             and (m.grupo_id is not null or m.destino_externo is not null)
           group by 1
           order by count(*) desc
           limit 8
        ) t
    ),
    'por_cliente', (
      select coalesce(jsonb_agg(t order by t.monto_usd desc), '[]'::jsonb)
        from (
          select cl.nombre as cliente, sum(n.total_usd) as monto_usd
            from public.notas_entrega n
            join public.clientes cl on cl.id = n.cliente_id
           where n.estado <> 'ANULADA'
           group by cl.nombre
           order by sum(n.total_usd) desc
           limit 8
        ) t
    )
  ) into v_resultado;

  return v_resultado;
end;
$func$;

revoke all on function public.resumen_despachos_detalle() from public, anon;
grant execute on function public.resumen_despachos_detalle() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Comprobación
-- ───────────────────────────────────────────────────────────────────────────
do $comprueba$
declare
  v_viewdef text := pg_get_viewdef('public.v_panel_resumen'::regclass, true);
  v_oid     regprocedure := 'public.resumen_despachos_detalle()'::regprocedure;
begin
  if position('despachos_total_bs' in v_viewdef) = 0 then
    raise exception 'v_panel_resumen no quedó con los cinco números de despachos.';
  end if;
  if (select array_to_string(reloptions, ',') from pg_class where oid = 'public.v_panel_resumen'::regclass)
     is distinct from 'security_invoker=on' then
    raise exception 'v_panel_resumen perdió security_invoker.';
  end if;
  if has_function_privilege('anon', v_oid, 'execute') then
    raise exception 'resumen_despachos_detalle no puede ser ejecutable por anon.';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception 'resumen_despachos_detalle tiene que ser ejecutable por authenticated (la propia función exige el permiso por dentro).';
  end if;
end
$comprueba$;
