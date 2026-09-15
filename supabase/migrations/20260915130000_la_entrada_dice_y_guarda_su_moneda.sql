/*
  LA ENTRADA DICE Y GUARDA SU MONEDA.

  Lo que quedaba abierto de la cafetera de 39.332,15 (salud 1.31), y lo que
  Christopher aprobó el 15/09/2026:

  1. LA PRIMERA VEZ DICE LA MONEDA, Y CUÁNTO ES EN LA OTRA. La reja de la
     primera entrada pedía comprobar con la factura repitiendo solo la cifra,
     «Serán 1 UND a 39.332,1500 cada una». Con una factura en bolívares la cifra
     coincidía con el papel y se aceptaba de buena fe. Ahora dice también la
     moneda y el equivalente, siempre en la otra: tecleado en dólares, en
     bolívares; tecleado en otra moneda, en dólares. En la misma no diría nada.

  2. SIN MONEDA NO ENTRA NADA CON COSTO. La base rellenaba la moneda vacía con
     USD, y la pantalla hacía nacer cada renglón en dólares. La moneda no se
     supone: un renglón con costo y sin moneda se rechaza. La planilla no se
     entera, porque manda siempre la suya.

  3. SE GUARDA LO QUE SE TECLEÓ. `registrar_entradas` pasaba a
     `registrar_movimiento` las tres columnas de bultos y ninguna de las tres de
     valor, que es el matiz que puso el carril de base de datos en 1.31. Ahora
     pasa la cifra tal como se tecleó, a qué presentación se refería si se dio
     por bulto, y la moneda.

  `revisar_costo_de_entrada` devuelve el equivalente en la primera vez, para que
  la pantalla lo diga antes de guardar. No es valoración: es la cifra que la
  persona acaba de teclear, en la otra moneda, y por eso la ve cualquiera.

  Se parchea sobre el cuerpo vivo con anclas que tienen que aparecer una sola
  vez, como el resto de la casa. No cambia ninguna firma.
*/

do $mig$
declare
  v_def  text;
  v_func text;
  r      record;
begin
  for r in
    select * from (values
      (1, 'public', 'registrar_entradas',
       $t$v_nombre_pres text; v_dueno text; v_sin_valor boolean;$t$,
       $t$v_nombre_pres text; v_dueno text; v_sin_valor boolean; v_tecleado numeric;$t$),
      (2, 'public', 'registrar_entradas',
       $t$    v_moneda   := upper(coalesce(nullif(btrim(coalesce(v_r->>'moneda', '')), ''), 'USD'));
$t$,
       $t$    -- Sin moneda no se supone ninguna: ver la comprobación de más abajo.
    v_moneda   := upper(nullif(btrim(coalesce(v_r->>'moneda', '')), ''));
$t$),
      (3, 'public', 'registrar_entradas',
       $t$              hint = 'Si el precio existe pero nadie lo tiene a mano, marca «no se sabe cuánto costó» en ese renglón: entra sin cifra y queda pendiente de valorar.';
    end if;
$t$,
       $t$              hint = 'Si el precio existe pero nadie lo tiene a mano, marca «no se sabe cuánto costó» en ese renglón: entra sin cifra y queda pendiente de valorar.';
    end if;

    /*
      LA MONEDA NO SE SUPONE. Antes se rellenaba con USD, y la pantalla hacía
      nacer cada renglón en dólares: así entró a 39.332,15 dólares una cafetera
      con factura en bolívares.
    */
    if not v_sin_valor and v_moneda is null then
      raise exception 'El renglón % (%): falta decir en qué moneda está el costo.', v_n, v_nombre
        using errcode = '22023',
              hint = 'Elige la moneda de la factura. El sistema la convierte a dólares con la tasa del día.';
    end if;

    -- La cifra tal como se tecleó, antes de repartirla entre lo que trae el bulto.
    v_tecleado := v_costo;
$t$),
      (4, 'public', 'registrar_entradas',
       $t$Serán % % a % cada una. Compruébalo con la factura y acéptalo.',
        v_n, v_nombre, private.numero_es(v_cantidad, 2),
        (select unidad from public.articulos where id = v_articulo),
        private.numero_es(v_costo, 4)
$t$,
       $t$Serán % % a % % cada una, que son % %. Compruébalo con la factura, también la moneda, y acéptalo.',
        v_n, v_nombre, private.numero_es(v_cantidad, 2),
        (select unidad from public.articulos where id = v_articulo),
        private.numero_es(v_costo, 4), v_moneda,
        -- El equivalente, siempre en la otra moneda: en la misma no dice nada.
        case when v_moneda = 'USD' then private.numero_es(v_costo * v_tasa, 2)
             else private.numero_es(v_costo_usd, 4) end,
        case when v_moneda = 'USD' then 'Bs' else 'USD' end
$t$),
      (5, 'public', 'registrar_entradas',
       $t$      p_suelto_capturado => case when v_pres > 0 then nullif(v_sueltas, 0) end);
$t$,
       $t$      p_suelto_capturado => case when v_pres > 0 then nullif(v_sueltas, 0) end,
      -- Y lo que se tecleó del costo, sin convertir: la cifra, a qué se refería y la moneda.
      p_costo_capturado => case when v_sin_valor then null else v_tecleado end,
      p_costo_unidad_capturada => case
        when not v_sin_valor and coalesce((v_r->>'costo_por_presentacion')::boolean, false)
        then private.presentacion_usada(v_articulo, v_nombre_pres) end,
      p_moneda_capturada => case when v_sin_valor then null else v_moneda end);
$t$),
      (6, 'public', 'revisar_costo_de_entrada',
       $t$  if coalesce(v_ref, 0) = 0 then
    return jsonb_build_object('estado', 'PRIMERA');
  end if;
$t$,
       $t$  if coalesce(v_ref, 0) = 0 then
    /*
      LA PRIMERA VEZ, CON LA MONEDA Y SU EQUIVALENTE EN LA OTRA.

      Sin promedio no hay con qué comparar, pero sí se puede decir cuánto es lo
      tecleado en la otra moneda: 39.332,15 dólares son más de treinta y tres
      millones de bolívares, y eso se ve antes de aceptar. No es valoración —es
      la cifra que la persona acaba de escribir—, así que la ve cualquiera. Sin
      moneda o sin tasa se contesta sin equivalente, en vez de reventar mientras
      alguien teclea.
    */
    if coalesce(p_costo, 0) > 0 and nullif(btrim(coalesce(p_moneda, '')), '') is not null then
      begin
        select tasa, tasa_usd into v_tasa, v_tasa_usd
          from private.tasas_del_dia(upper(btrim(p_moneda)), coalesce(p_fecha, current_date));
      exception when others then
        v_tasa := null;
      end;

      if v_tasa is not null and coalesce(v_tasa_usd, 0) > 0 then
        return jsonb_build_object(
          'estado',      'PRIMERA',
          'moneda',      upper(btrim(p_moneda)),
          'equivale',    case when upper(btrim(p_moneda)) = 'USD' then round(p_costo * v_tasa, 2)
                              else round(p_costo * v_tasa / v_tasa_usd, 4) end,
          'equivale_en', case when upper(btrim(p_moneda)) = 'USD' then 'VES' else 'USD' end);
      end if;
    end if;

    return jsonb_build_object('estado', 'PRIMERA');
  end if;
$t$)
    ) as t(orden, esquema, funcion, ancla, nuevo)
    order by orden
  loop
    if v_func is distinct from r.esquema || '.' || r.funcion then
      if v_def is not null then
        execute v_def;
      end if;
      v_func := r.esquema || '.' || r.funcion;
      select pg_get_functiondef(p.oid) into strict v_def
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = r.esquema and p.proname = r.funcion;
    end if;

    if (length(v_def) - length(replace(v_def, r.ancla, ''))) / length(r.ancla) <> 1 then
      raise exception 'El ancla % de % no aparece exactamente una vez.', r.orden, v_func
        using errcode = '22023';
    end if;

    v_def := replace(v_def, r.ancla, r.nuevo);
  end loop;

  execute v_def;
end
$mig$;

-- Comprobado al aplicar.
do $ver$
declare
  r record;
begin
  for r in
    select * from (values
      ('registrar_entradas', 'falta decir en qué moneda está el costo'),
      ('registrar_entradas', 'p_moneda_capturada => case when v_sin_valor'),
      ('registrar_entradas', 'que son % %'),
      ('revisar_costo_de_entrada', '''equivale_en''')
    ) as t(funcion, marca)
  loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = r.funcion
                      and strpos(p.prosrc, r.marca) > 0) then
      raise exception '% no quedó con su arreglo (%).', r.funcion, r.marca using errcode = '22023';
    end if;
  end loop;
end
$ver$;
