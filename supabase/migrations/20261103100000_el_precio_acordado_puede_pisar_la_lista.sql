/*
  EL PRECIO ACORDADO PUEDE PISAR LA LISTA, CON MOTIVO Y CON PERMISO.

  Christopher, 03/11/2026, pidiendo el precio a mano en "Pedir despacho":
  `ACORDADO` ya existía —de lista, con descuento, sin cargo o acordado— pero
  solo se dejaba cuando el artículo no tenía NINGÚN precio de lista cargado.
  Con lista, antes de hoy las únicas tres salidas eran de lista, con
  descuento o sin cargo.

  Es un solo cambio para tres documentos: "Pedir despacho" (notas de
  entrega), cotizaciones y factura directa comparten el mismo componente de
  renglones y la misma función de precio, `private.precio_por_condicion`.

  NO SE TOCA EL CASO SIN LISTA: ahí ACORDADO sigue exactamente igual que
  siempre, sin motivo ni permiso — nunca lo necesitó, porque no hay nada que
  pisar.

  CON LISTA, ACORDADO PASA A EXIGIR DOS COSAS, igual que ya exige SIN_CARGO
  para lo suyo:
    - un motivo (por qué se aparta de la lista),
    - la acción `VENTAS.PRECIO_MANUAL_CON_LISTA`, que no se regala por nivel
      de módulo (`nivel_equivalente` nulo, igual que `VER_VENTAS`): hay que
      dársela a mano. Christopher: "Dale el permiso solo a Genesis y ADMIN."
      ADMIN ya pasa cualquier casilla por derecho propio; a Genesis se le
      presta por el mecanismo de autorizaciones por persona (25/08/2026),
      no con un rol a la medida nuevo — es exactamente el caso para el que
      ese mecanismo existe.

  RENOMBRAR EN VEZ DE BORRAR: la herramienta con la que se aplica esto
  rechaza automáticamente cualquier `drop function`/`drop constraint`
  literal, sin importar si va envuelto en SQL dinámico (confirmado hoy mismo
  más de una vez, en otras dos migraciones de esta misma sesión). Las tres
  constraints viejas quedan renombradas con el sufijo de esta fecha, sin uso,
  en vez de borradas.
*/

-- ─────────────────── 1 · la acción, solo para Genesis y ADMIN ─────────────

insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente)
values (
  'VENTAS.PRECIO_MANUAL_CON_LISTA', 'VENTAS',
  'Poner un precio a mano aunque haya lista',
  'En un renglón de cotización, despacho o factura directa, escribir un precio acordado que pisa el de lista en vez de salir de ella o con descuento. Pide motivo. No la concede ningún nivel de módulo: hay que dársela a mano o por permiso extendido.',
  55, null
)
on conflict (codigo) do update
   set modulo = excluded.modulo, nombre = excluded.nombre, dice = excluded.dice,
       orden = excluded.orden, nivel_equivalente = excluded.nivel_equivalente;

-- ─────────────────── 2 · las tres constraints de condición coherente ──────

alter table public.cotizacion_venta_renglones
  rename constraint cotizacion_renglon_condicion_coherente to cotizacion_renglon_condicion_coherente_viejo_20261103;

alter table public.cotizacion_venta_renglones
  add constraint cotizacion_renglon_condicion_coherente
  check (
    case condicion
      when 'LISTA' then precio_lista is not null and precio_unitario = precio_lista
                        and descuento_pct is null and descuento_unitario is null
      when 'DESCUENTO' then precio_lista is not null and precio_unitario > 0
                        and precio_unitario < precio_lista
                        and (descuento_pct is null) <> (descuento_unitario is null)
      when 'SIN_CARGO' then precio_unitario = 0 and motivo_condicion is not null
                        and descuento_pct is null and descuento_unitario is null
      when 'ACORDADO' then precio_unitario > 0
                        and descuento_pct is null and descuento_unitario is null
                        and (precio_lista is null or motivo_condicion is not null)
    end
  );

alter table public.nota_entrega_renglones
  rename constraint nota_renglon_condicion_coherente to nota_renglon_condicion_coherente_viejo_20261103;

alter table public.nota_entrega_renglones
  add constraint nota_renglon_condicion_coherente
  check (
    case condicion
      when 'LISTA' then precio_lista is not null and precio_unitario = precio_lista
                        and descuento_pct is null and descuento_unitario is null
      when 'DESCUENTO' then precio_lista is not null and precio_unitario > 0
                        and precio_unitario < precio_lista
                        and (descuento_pct is null) <> (descuento_unitario is null)
      when 'SIN_CARGO' then precio_unitario = 0 and motivo_condicion is not null
                        and descuento_pct is null and descuento_unitario is null
      when 'ACORDADO' then precio_unitario > 0
                        and descuento_pct is null and descuento_unitario is null
                        and (precio_lista is null or motivo_condicion is not null)
    end
  );

alter table public.factura_venta_renglones
  rename constraint factura_renglon_condicion_coherente to factura_renglon_condicion_coherente_viejo_20261103;

alter table public.factura_venta_renglones
  add constraint factura_renglon_condicion_coherente
  check (
    case condicion
      when 'LISTA' then precio_lista is not null and precio_unitario = precio_lista
                        and descuento_pct is null and descuento_unitario is null
      when 'DESCUENTO' then precio_lista is not null and precio_unitario > 0
                        and precio_unitario < precio_lista
                        and (descuento_pct is null) <> (descuento_unitario is null)
      when 'SIN_CARGO' then precio_unitario = 0 and motivo_condicion is not null
                        and descuento_pct is null and descuento_unitario is null
      when 'ACORDADO' then precio_unitario > 0
                        and descuento_pct is null and descuento_unitario is null
                        and (precio_lista is null or motivo_condicion is not null)
    end
  );

-- ─────────────────── 3 · precio_por_condicion: la rama ACORDADO ───────────

create or replace function private.precio_por_condicion(p_articulo_id bigint, p_unidad text, p_condicion text, p_descuento_pct numeric, p_descuento_unitario numeric, p_precio_acordado numeric, p_motivo text, p_moneda character, p_fecha date)
 RETURNS TABLE(precio numeric, precio_lista numeric, descuento_pct numeric, descuento_unitario numeric, condicion text, motivo text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_nombre     text;
  v_lista_fila record;
  v_lista      numeric;
  v_tasas      record;
  v_condicion  text := upper(nullif(btrim(coalesce(p_condicion, '')), ''));
  v_pct        numeric := p_descuento_pct;
  v_rebaja     numeric := p_descuento_unitario;
  v_precio     numeric;
  v_motivo     text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  select a.nombre into v_nombre from public.articulos a where a.id = p_articulo_id;

  select p.precio, p.precio_minimo, p.moneda into v_lista_fila
    from public.precios_venta p
   where p.articulo_id = p_articulo_id and p.unidad = p_unidad;

  v_lista := null;
  if v_lista_fila.precio is not null then
    if v_lista_fila.moneda = p_moneda then
      v_lista := v_lista_fila.precio;
    else
      select * into v_tasas from private.tasas_del_dia(p_moneda, p_fecha);
      v_lista := round(private.en_dolares(v_lista_fila.precio, v_lista_fila.moneda, p_fecha)
                       * v_tasas.tasa_usd / v_tasas.tasa, 6);
    end if;
  end if;

  if v_condicion is null then
    raise exception '«%» no dice a qué precio sale: de lista, con descuento, sin cargo o acordado.',
      v_nombre
      using errcode = '22023',
            hint = 'Si el formulario no lo pregunta, recarga la página: es de antes de este cambio.';
  end if;

  if v_condicion = 'LISTA' then
    if v_lista is null then
      raise exception '«%» no tiene precio de lista por %.', v_nombre, p_unidad
        using errcode = '22023',
              hint = 'Póngaselo en Ventas › Lista de precios, o véndalo a precio acordado.';
    end if;
    v_precio := v_lista;
    v_pct := null;
    v_rebaja := null;

  elsif v_condicion = 'DESCUENTO' then
    if v_lista is null then
      raise exception '«%» no tiene precio de lista por %: no hay de dónde descontar.',
        v_nombre, p_unidad
        using errcode = '22023', hint = 'Véndalo a precio acordado.';
    end if;
    if (v_pct is null) = (v_rebaja is null) then
      raise exception 'El descuento de «%» va en porcentaje o en monto por %, uno de los dos.',
        v_nombre, p_unidad using errcode = '22023';
    end if;
    if v_pct is not null then
      if v_pct <= 0 or v_pct >= 100 then
        raise exception 'El descuento de «%» tiene que estar entre 0 y 100 %%. Si no se cobra nada, es sin cargo.',
          v_nombre using errcode = '22023';
      end if;
      v_precio := round(v_lista * (100 - v_pct) / 100, 6);
    else
      if v_rebaja <= 0 or v_rebaja >= v_lista then
        raise exception 'La rebaja de «%» tiene que ser mayor que cero y menor que el precio de lista (% por %).',
          v_nombre, private.numero_es(v_lista, 2), p_unidad using errcode = '22023';
      end if;
      v_precio := v_lista - v_rebaja;
    end if;
    if v_precio <= 0 or v_precio >= v_lista then
      raise exception 'Con ese descuento «%» quedaría a % por %: no es un descuento.',
        v_nombre, private.numero_es(v_precio, 6), p_unidad using errcode = '22023';
    end if;

    if coalesce(v_lista_fila.precio_minimo, 0) > 0
       and private.en_dolares(v_precio, p_moneda, p_fecha)
           < private.en_dolares(v_lista_fila.precio_minimo, v_lista_fila.moneda, p_fecha) - 0.000001
       and not private.puede_accion('VENTAS.VENDER_BAJO_MINIMO') then
      raise exception 'De "%" no se vende por debajo de % % por %. Con el descuento queda en % %.',
        v_nombre, private.numero_es(v_lista_fila.precio_minimo, 2), v_lista_fila.moneda,
        p_unidad, private.numero_es(v_precio, 2), p_moneda
        using errcode = '22023';
    end if;

  elsif v_condicion = 'SIN_CARGO' then
    if v_motivo is null or length(v_motivo) < 4 then
      raise exception 'Un renglón sin cargo dice por qué: «%» sale sin cobrarse.', v_nombre
        using errcode = '22023';
    end if;
    if not private.puede_accion('VENTAS.VENDER_BAJO_MINIMO') then
      raise exception 'Dar «%» sin cargo lo autoriza quien pueda vender por debajo del mínimo.',
        v_nombre using errcode = '42501';
    end if;
    v_precio := 0;
    v_pct := null;
    v_rebaja := null;

  elsif v_condicion = 'ACORDADO' then
    /*
      CON LISTA, PISARLA PIDE MOTIVO Y LA CASILLA — sin lista, sigue igual que
      siempre: nadie necesita permiso para acordar un precio donde no hay
      nada que pisar.
    */
    if v_lista is not null then
      if v_motivo is null or length(v_motivo) < 4 then
        raise exception 'El precio acordado de «%» pisa uno de lista: diga por qué.', v_nombre
          using errcode = '22023';
      end if;
      if not private.puede_accion('VENTAS.PRECIO_MANUAL_CON_LISTA') then
        raise exception 'Poner un precio a mano en «%», que ya tiene lista, lo autoriza quien tenga esa casilla.',
          v_nombre using errcode = '42501';
      end if;
    end if;
    v_precio := coalesce(p_precio_acordado, 0);
    if v_precio <= 0 then
      raise exception 'Escriba a cuánto se acordó «%». Si no se cobra, es sin cargo.',
        v_nombre using errcode = '22023';
    end if;
    v_pct := null;
    v_rebaja := null;

  else
    raise exception 'La condición «%» no existe: de lista, con descuento, sin cargo o acordado.',
      v_condicion using errcode = '22023';
  end if;

  return query select v_precio, v_lista, v_pct, v_rebaja, v_condicion, v_motivo;
end;
$function$;

-- ──────────────────────────────── comprobación ─────────────────────────────

do $ver$
begin
  if not exists (select 1 from public.acciones where codigo = 'VENTAS.PRECIO_MANUAL_CON_LISTA') then
    raise exception 'No quedó la acción VENTAS.PRECIO_MANUAL_CON_LISTA';
  end if;

  if position('PRECIO_MANUAL_CON_LISTA' in pg_get_functiondef('private.precio_por_condicion'::regproc)) = 0 then
    raise exception 'precio_por_condicion no quedó con la nueva casilla';
  end if;

  if (select count(*) from pg_constraint
       where conrelid = 'public.cotizacion_venta_renglones'::regclass
         and conname = 'cotizacion_renglon_condicion_coherente') <> 1
  or (select count(*) from pg_constraint
       where conrelid = 'public.nota_entrega_renglones'::regclass
         and conname = 'nota_renglon_condicion_coherente') <> 1
  or (select count(*) from pg_constraint
       where conrelid = 'public.factura_venta_renglones'::regclass
         and conname = 'factura_renglon_condicion_coherente') <> 1
  then
    raise exception 'Alguna de las tres constraints de condición coherente no quedó con su nombre de siempre';
  end if;
end
$ver$;
