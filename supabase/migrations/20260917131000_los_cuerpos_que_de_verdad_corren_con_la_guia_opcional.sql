/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  1 funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
  las crea. No cambia nada en la base: son los mismos cuerpos que ya corren,
  puestos donde reconstruir desde cero da lo mismo que hay.

  POR QUE APARECIO ESTA DIFERENCIA, que es lo unico interesante de este archivo:
  las migraciones de esta casa parchean con `pg_get_functiondef` + `replace` en
  vez de reescribir funciones de siete mil letras. El parche es correcto y el
  motivo es bueno —copiar a mano es lo que introduce diferencias—, pero deja el
  cuerpo repartido entre el archivo que la creo y los cinco que la tocaron
  despues. El archivo deja de servir para reconstruir aunque cada parche este
  bien.

  Lo levanto el carril de base de datos, tres veces en un dia, y la tercera con
  el diagnostico que lo explica: no es falta de cuidado, es que la verificacion
  se hace UNA VEZ al escribir y seis migraciones despues otra cosa toca la misma
  funcion. Un md5 comprobado el lunes no dice nada del miercoles.

  Por eso esto es generado y no transcrito: volcar la salida de Postgres no puede
  introducir una diferencia, y teclearla si.

  QUE SE COMPROBO ANTES DE GUARDARLO

  Cada cuerpo de aqui se comparo BYTE A BYTE contra `pg_proc.prosrc` de la base
  viva —no normalizado, no perdonando comentarios— y los 1 coinciden. Y el
  detector, que antes marcaba estas 1, pasa a cero.

  NO SE APLICO, Y ES A PROPOSITO

  Aplicarlo seria un no-op: son exactamente los cuerpos que ya corren, sacados de
  `pg_get_functiondef`. Su valor no esta en cambiar la base sino en que
  reconstruirla desde cero de lo mismo que hay.

  Y LA TRAMPA QUE ESO DEJA, dicha aqui para que no sorprenda: si manana otra
  migracion toca una de estas funciones y alguien corre ESTE archivo suelto,
  despues, la revierte al cuerpo de hoy. En orden no pasa —va fechado con su dia y
  detras de todo lo de ese dia—, pero un volcado no es una migracion normal y
  conviene saberlo antes de ejecutarlo a mano.
*/

-- public.despachar(p_cliente_id bigint, p_almacen_id bigint, p_renglones jsonb, p_moneda character, p_cotizacion_id bigint, p_vehiculo text, p_chofer text, p_cedula_chofer text, p_peso_bruto numeric, p_peso_tara numeric, p_ticket text, p_alicuota_iva numeric, p_descuento numeric, p_flete numeric, p_fecha date, p_observacion text, p_ticket_id bigint, p_guia_id bigint)
-- venia de: 20260916161000_los_cuerpos_que_de_verdad_corren_con_la_condicion_de_venta.sql
CREATE OR REPLACE FUNCTION public.despachar(p_cliente_id bigint, p_almacen_id bigint, p_renglones jsonb, p_moneda character DEFAULT NULL::bpchar, p_cotizacion_id bigint DEFAULT NULL::bigint, p_vehiculo text DEFAULT NULL::text, p_chofer text DEFAULT NULL::text, p_cedula_chofer text DEFAULT NULL::text, p_peso_bruto numeric DEFAULT NULL::numeric, p_peso_tara numeric DEFAULT NULL::numeric, p_ticket text DEFAULT NULL::text, p_alicuota_iva numeric DEFAULT NULL::numeric, p_descuento numeric DEFAULT 0, p_flete numeric DEFAULT 0, p_fecha date DEFAULT NULL::date, p_observacion text DEFAULT NULL::text, p_ticket_id bigint DEFAULT NULL::bigint, p_guia_id bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_cliente  record;
  v_almacen  record;
  v_tk       record;
  v_guia     record;
  v_fecha    date := coalesce(p_fecha, current_date);
  v_moneda   text;
  v_tasas    record;
  v_id       bigint;
  v_reng     record;
  v_existe   numeric;
  v_costo    numeric;
  v_mov      bigint;
  v_bruto    numeric := p_peso_bruto;
  v_tara     numeric := p_peso_tara;
  v_ticket   text    := nullif(trim(coalesce(p_ticket, '')), '');
  v_vehiculo text    := nullif(trim(coalesce(p_vehiculo, '')), '');
  v_chofer   text    := nullif(trim(coalesce(p_chofer, '')), '');
  v_cedula   text    := nullif(trim(coalesce(p_cedula_chofer, '')), '');
  v_producto boolean;
  v_en_ton   integer;
  v_del_patio integer;
begin
  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');

  select * into v_cliente from public.clientes where id = p_cliente_id;
  if v_cliente.id is null then
    raise exception 'No existe el cliente %.', p_cliente_id using errcode = 'P0002';
  end if;
  if not v_cliente.activo then
    raise exception 'El cliente "%" está inactivo.', v_cliente.nombre using errcode = '22023';
  end if;

  select * into v_almacen from public.almacenes where id = p_almacen_id;
  if v_almacen.id is null then
    raise exception 'No existe el almacén %.', p_almacen_id using errcode = 'P0002';
  end if;
  if not v_almacen.activo then
    raise exception 'El almacén "%" está cerrado.', v_almacen.nombre using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'No se despacha con fecha futura.' using errcode = '22023';
  end if;

  -- El pesaje. Se cierra el ticket antes de mirarlo: dos notas de entrega
  -- emitidas a la vez podrían colgarse del mismo pesaje.
  if p_ticket_id is not null then
    select * into v_tk from public.romana_tickets where id = p_ticket_id for update;

    if v_tk.id is null then
      raise exception 'No existe el ticket de romana %.', p_ticket_id using errcode = 'P0002';
    end if;
    if v_tk.tipo <> 'SALIDA' then
      raise exception 'El ticket % es de una entrada a la cantera, no de una salida.', v_tk.numero
        using errcode = '22023';
    end if;
    if v_tk.estado <> 'LIBRE' then
      raise exception 'El ticket % está %.', v_tk.numero, lower(v_tk.estado) using errcode = '55000';
    end if;
    if v_tk.cliente_id is not null and v_tk.cliente_id <> p_cliente_id then
      raise exception 'El ticket % se pesó para otro cliente.', v_tk.numero using errcode = '22023';
    end if;

    -- Los pesos salen de la romana, no del teclado: para eso se pesó.
    v_bruto    := v_tk.peso_bruto;
    v_tara     := v_tk.peso_tara;
    v_ticket   := v_tk.numero;
    v_vehiculo := coalesce(v_vehiculo, v_tk.vehiculo);
    v_chofer   := coalesce(v_chofer, v_tk.chofer);
    v_cedula   := coalesce(v_cedula, v_tk.cedula_chofer);
  end if;

  -- La guía.
  if p_guia_id is not null then
    select * into v_guia from public.guias_movilizacion where id = p_guia_id for update;

    if v_guia.id is null then
      raise exception 'No existe la guía %.', p_guia_id using errcode = 'P0002';
    end if;
    if v_guia.estado <> 'VIGENTE' then
      raise exception 'La guía % está %.', v_guia.numero_guia, lower(v_guia.estado)
        using errcode = '55000';
    end if;
    if v_guia.vigencia_hasta < v_fecha then
      raise exception 'La guía % venció el %.', v_guia.numero_guia,
        to_char(v_guia.vigencia_hasta, 'DD/MM/YYYY') using errcode = '55000';
    end if;
    if v_guia.cliente_id is not null and v_guia.cliente_id <> p_cliente_id then
      raise exception 'La guía % se emitió para otro cliente.', v_guia.numero_guia
        using errcode = '22023';
    end if;
  end if;

  v_moneda := coalesce(p_moneda, v_cliente.moneda_preferida);
  select * into v_tasas from private.tasas_del_dia(v_moneda, v_fecha);

  insert into public.notas_entrega
    (numero, cliente_id, cotizacion_id, almacen_id, fecha, vehiculo, chofer,
     cedula_chofer, peso_bruto, peso_tara, ticket_romana, moneda, tasa, tasa_usd,
     alicuota_iva, descuento, flete, observacion, despachada_por, ticket_id, guia_id)
  values
    (private.siguiente_numero('NE'), p_cliente_id, p_cotizacion_id, p_almacen_id,
     v_fecha, v_vehiculo, v_chofer, v_cedula, v_bruto, v_tara, v_ticket,
     v_moneda, v_tasas.tasa, v_tasas.tasa_usd,
     case when v_cliente.exento_iva then 0 else coalesce(p_alicuota_iva, 16) end,
     coalesce(p_descuento, 0), coalesce(p_flete, 0),
     nullif(trim(coalesce(p_observacion, '')), ''), (select auth.uid()),
     p_ticket_id, p_guia_id)
  returning id into v_id;

  perform private.cargar_renglones_venta(
    'nota_entrega_renglones', 'nota_id', v_id, p_renglones, v_moneda, v_fecha);

  /*
    LO QUE SE VENDE EN TONELADAS CON EL CAMIÓN PESADO LO DICE LA ROMANA.

    Si hay ticket y el camión lleva un solo material del patio, vendido en
    toneladas, esas toneladas son las del ticket y no las que se escribieron:
    para eso se pesó. Con dos materiales en el mismo camión el peso es de los
    dos juntos y no se reparte, así que cada renglón se queda con lo escrito y
    marcado como estimado.
  */
  if p_ticket_id is not null then
    select count(*) filter (where r.unidad = 'TON'), count(*)
      into v_en_ton, v_del_patio
      from public.nota_entrega_renglones r
     where r.nota_id = v_id and r.cantidad_inventario is not null;

    if v_en_ton = 1 and v_del_patio = 1 then
      update public.nota_entrega_renglones r
         set cantidad = round((v_bruto - v_tara) / 1000, 4),
             cantidad_inventario = case
               when r.densidad_usada is null then round((v_bruto - v_tara) / 1000, 4)
               else round((v_bruto - v_tara) / 1000 / r.densidad_usada, 4)
             end,
             medida = 'ROMANA'
       where r.nota_id = v_id and r.unidad = 'TON' and r.cantidad_inventario is not null;
    end if;
  end if;

  -- La guía de movilización es opcional desde el 17/09/2026: «No tenemos
  -- guía». Si llega, se engancha y queda gastada más abajo; si no, sale igual.

  -- Un cerrojo por casilla de patio —almacén y artículo—, tomados todos antes
  -- de tocar nada y siempre en orden de artículo. En orden porque dos despachos
  -- que pidan las mismas casillas al revés se quedarían esperando el uno al
  -- otro para siempre. No hay fila que bloquear: la existencia se suma del
  -- libro de movimientos, no se guarda en ningún sitio.
  for v_reng in
    select distinct r.articulo_id
    from public.nota_entrega_renglones r
    join public.articulos a on a.id = r.articulo_id
    where r.nota_id = v_id and a.inventariable
    order by r.articulo_id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(format('patio:%s:%s', p_almacen_id, v_reng.articulo_id), 0));
  end loop;

  -- Ahora sí el patio. Renglón por renglón, comprobando existencia antes de
  -- restar: sacar más de lo que hay deja el almacén en negativo, y una
  -- existencia negativa no es un dato sino un error que alguien tendrá que
  -- deshacer a mano.
  for v_reng in
    select r.id, r.articulo_id, coalesce(r.cantidad_inventario, r.cantidad) as cantidad,
           r.cantidad as vendida, r.unidad, a.unidad as unidad_patio, a.nombre, a.inventariable
    from public.nota_entrega_renglones r
    join public.articulos a on a.id = r.articulo_id
    where r.nota_id = v_id
    order by r.linea
  loop
    -- Un servicio —un flete— se cobra pero no sale de ningún almacén.
    continue when not v_reng.inventariable;

    v_existe := private.existencia_para_escribir(p_almacen_id, v_reng.articulo_id);

    if v_reng.cantidad > v_existe then
      raise exception 'En "%" hay % de "%" y se están despachando %.',
        v_almacen.nombre, private.cantidad_es(v_existe), v_reng.nombre, private.cantidad_es(v_reng.cantidad)
        using errcode = '22023';
    end if;

    v_costo := private.costo_promedio(p_almacen_id, v_reng.articulo_id);

    v_mov := private.registrar_movimiento(
      'SALIDA_DESPACHO', (-1)::smallint, p_almacen_id, v_reng.articulo_id,
      v_reng.cantidad, v_costo,
      format('DESPACHO A %s', v_cliente.nombre), null, null, null, v_fecha,
      -- Vendido en la otra unidad: el libro lleva la del patio y guarda al
      -- lado lo que se vendió.
      p_cantidad_capturada => case when v_reng.unidad <> v_reng.unidad_patio then v_reng.vendida end,
      p_unidad_capturada   => case when v_reng.unidad <> v_reng.unidad_patio then v_reng.unidad end);

    update public.nota_entrega_renglones set movimiento_id = v_mov where id = v_reng.id;
  end loop;

  -- Los dos papeles quedan gastados en este viaje.
  if p_ticket_id is not null then
    update public.romana_tickets
       set estado = 'USADO', nota_entrega_id = v_id where id = p_ticket_id;
  end if;

  if p_guia_id is not null then
    update public.guias_movilizacion
       set estado = 'USADA', nota_entrega_id = v_id where id = p_guia_id;
  end if;

  -- Si venía de una cotización, esa cotización quedó aceptada de hecho.
  if p_cotizacion_id is not null then
    update public.cotizaciones_venta
       set estado = 'ACEPTADA', cerrada_por = (select auth.uid()), cerrada_en = now()
     where id = p_cotizacion_id and estado = 'ENVIADA';
  end if;

  return v_id;
end;
$function$;
