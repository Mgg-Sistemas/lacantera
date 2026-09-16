/*
  LA DENSIDAD SE PUEDE CORREGIR DESDE LA FICHA

  Se puso un estimado —1,44 t/m³, el que ya usaba el reporte diario— para que la
  equivalencia a toneladas dejara de estar en blanco. Pero al mirarlo de cerca
  apareció lo otro: **ni `crear_articulo` ni `editar_articulo` tocaban esa
  columna**. El único sitio del sistema por donde entraba una densidad era la
  planilla de carga por lote.

  Por eso estaba vacía en los ciento cincuenta y cuatro artículos y la auditoría
  no registraba un solo cambio: no es que nadie quisiera medir, es que no había
  dónde escribirlo. Poner un estimado sin abrir esa puerta habría sido dejar un
  número inventado que nadie puede corregir, que es peor que no tener ninguno.

  `coalesce(p_densidad_ton_m3, densidad_ton_m3)`: lo que no se manda no se pisa.
  La pantalla solo ofrece el campo donde significa algo —lo que se mide en
  metros cúbicos o en toneladas—, y quien pese un metro cúbico de verdad cambia
  el número ahí mismo.
*/
do $mig$
declare
  v_firma  text := 'public.editar_articulo(bigint,text,text,text,text,boolean,numeric,text,boolean,text,numeric,text,text,boolean)';
  v_def    text := pg_get_functiondef(v_firma::regprocedure);
  v_anclas text[] := array[
    $a$p_confirmado boolean DEFAULT false)$a$,
    $a$    stock_minimo   = coalesce(p_stock_minimo, 0),$a$];
  v_nuevas text[] := array[
    $n$p_confirmado boolean DEFAULT false, p_densidad_ton_m3 numeric DEFAULT NULL::numeric)$n$,
    $n$    stock_minimo   = coalesce(p_stock_minimo, 0),
    -- Toneladas por metro cúbico. Lo que no se manda no se pisa: el formulario
    -- solo lo ofrece donde significa algo, y el resto de las pantallas ni lo
    -- mencionan.
    densidad_ton_m3 = coalesce(p_densidad_ton_m3, densidad_ton_m3),$n$];
begin
  for i in 1 .. array_length(v_anclas, 1) loop
    if (length(v_def) - length(replace(v_def, v_anclas[i], ''))) / length(v_anclas[i]) <> 1 then
      raise exception 'editar_articulo: el ancla % no aparece exactamente una vez', i;
    end if;
    v_def := replace(v_def, v_anclas[i], v_nuevas[i]);
  end loop;

  execute 'drop function ' || v_firma;
  execute v_def;
end
$mig$;

do $ver$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'editar_articulo') <> 1
     or position('p_densidad_ton_m3' in pg_get_functiondef('public.editar_articulo'::regproc)) = 0 then
    raise exception 'editar_articulo no quedó con una sola firma que acepte la densidad';
  end if;
  if not has_function_privilege('authenticated',
       'public.editar_articulo(bigint,text,text,text,text,boolean,numeric,text,boolean,text,numeric,text,text,boolean,numeric)', 'execute') then
    raise exception 'la ficha del artículo no puede llamar a editar_articulo';
  end if;
end
$ver$;
