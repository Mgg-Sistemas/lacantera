/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  6 funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
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
  viva —no normalizado, no perdonando comentarios— y los 6 coinciden. Y el
  detector, que antes marcaba estas 6, pasa a cero.

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

-- public.anular_acarreo(p_id bigint, p_motivo text)
-- venia de: 20260912110953_los_viajes_de_camiones_se_cuentan_y_se_pagan.sql
CREATE OR REPLACE FUNCTION public.anular_acarreo(p_id bigint, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_estado text;
begin
  perform private.exigir_accion('EXPLOTACION.ANULAR_VIAJE');

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Hay que decir por que se anula.'
      using errcode = '22023',
            hint = 'Queda en el registro con tu nombre y la hora.';
  end if;

  select a.estado into v_estado from public.acarreos a where a.id = p_id;

  if v_estado is null then
    raise exception 'Ese viaje no existe.' using errcode = 'P0002';
  end if;

  if v_estado = 'RECHAZADO' then
    raise exception 'Ese viaje está rechazado: ya no cuenta ni se paga.' using errcode = '55000';
  end if;

  if v_estado = 'ANULADO' then
    raise exception 'Ese viaje ya estaba anulado.' using errcode = '55000';
  end if;

  update public.acarreos
     set estado           = 'ANULADO',
         motivo_anulacion = btrim(p_motivo),
         anulado_por      = (select auth.uid()),
         anulado_en       = now()
   where id = p_id;
end;
$function$;

-- public.anular_nota_entrega(p_id bigint, p_motivo text)
-- venia de: 20260805110000_despachos.sql
CREATE OR REPLACE FUNCTION public.anular_nota_entrega(p_id bigint, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_nota record;
  v_reng record;
begin
  perform private.exigir_permiso('FACTURACION', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se anula. Un despacho anulado sin motivo no se puede auditar.'
      using errcode = '22023';
  end if;

  select * into v_nota from public.notas_entrega where id = p_id for update;

  if v_nota.id is null then
    raise exception 'No existe la nota de entrega %.', p_id using errcode = 'P0002';
  end if;

  if v_nota.estado = 'ANULADA' then
    raise exception 'La nota % ya estaba anulada.', v_nota.numero using errcode = '55000';
  end if;

  if v_nota.estado = 'FACTURADA' then
    raise exception 'La nota % ya está en la factura. Anula primero la factura.', v_nota.numero
      using errcode = '55000';
  end if;

  -- Se reversa exactamente lo que esta nota descontó, por su número de
  -- movimiento. Buscar "una salida parecida" devolvería la del camión de al
  -- lado el día que dos despachos coincidan en artículo y cantidad.
  for v_reng in
    select r.movimiento_id, m.almacen_id, m.articulo_id, m.cantidad, m.costo_usd
    from public.nota_entrega_renglones r
    join public.inventario_movimientos m on m.id = r.movimiento_id
    where r.nota_id = p_id and r.movimiento_id is not null
  loop
    perform private.registrar_movimiento(
      'REVERSO', (1)::smallint, v_reng.almacen_id, v_reng.articulo_id,
      v_reng.cantidad, v_reng.costo_usd,
      format('ANULACIÓN DE LA NOTA %s: %s', v_nota.numero, trim(p_motivo)),
      null, null, v_reng.movimiento_id, current_date);
  end loop;

  update public.romana_tickets
     set estado = 'LIBRE', nota_entrega_id = null
   where nota_entrega_id = p_id and estado = 'USADO';

  update public.guias_movilizacion
     set estado = 'VIGENTE', nota_entrega_id = null
   where nota_entrega_id = p_id and estado = 'USADA';

  update public.notas_entrega
     set estado = 'ANULADA',
         motivo_anulacion = trim(p_motivo),
         anulada_por = (select auth.uid()),
         anulada_en = now()
   where id = p_id;
end;
$function$;

-- public.corregir_acarreo(p_id bigint, p_hora time without time zone, p_carga_m3 numeric, p_precio_usd numeric, p_nota text)
-- venia de: 20260914152552_lo_que_entra_al_libro_se_acepta.sql
CREATE OR REPLACE FUNCTION public.corregir_acarreo(p_id bigint, p_hora time without time zone DEFAULT NULL::time without time zone, p_carga_m3 numeric DEFAULT NULL::numeric, p_precio_usd numeric DEFAULT NULL::numeric, p_nota text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_a record; v_cap numeric;
begin
  perform private.exigir_accion('EXPLOTACION.REGISTRAR_VIAJES');

  select a.id, a.estado, a.vehiculo_id, a.carga into v_a
    from public.acarreos a where a.id = p_id;

  if v_a.id is null then
    raise exception 'Ese viaje no existe.' using errcode = 'P0002';
  end if;

  if v_a.estado = 'ANULADO' then
    raise exception 'Ese viaje esta anulado: lo anulado no se corrige.'
      using errcode = '55000',
            hint = 'Si hizo falta, registra el viaje de nuevo.';
  end if;

  if v_a.estado in ('APROBADO', 'RECHAZADO') then
    raise exception 'Ese viaje ya está %: no se corrige.', lower(v_a.estado)
      using errcode = '55000',
            hint = 'Si hace falta cambiarlo, anúlalo y cárgalo de nuevo para que se vuelva a aprobar.';
  end if;

  if p_carga_m3 is not null and v_a.carga = 'VACIO' then
    raise exception 'Ese viaje volvió vacío: no lleva metros cúbicos.'
      using errcode = '22023',
            hint = 'Si en realidad traía carga, anúlalo y cárgalo de nuevo.';
  end if;

  if exists (select 1 from public.costo_decisiones d
              where d.origen = 'ACARREO' and d.origen_id = p_id
                and d.decision = 'ACEPTADA' and d.deshecha_en is null) then
    raise exception 'Ese viaje ya entro al centro de costo. Anulalo y cargalo de nuevo.'
      using errcode = '55000',
            hint = 'El anulado aparece en el centro de costo para reversarlo.';
  end if;

  if p_carga_m3 is not null then
    select v.capacidad_m3 into v_cap from public.vehiculos v where v.id = v_a.vehiculo_id;
    if p_carga_m3 <= 0 then
      raise exception 'La carga tiene que ser mayor que cero.' using errcode = '22023';
    end if;
    if p_carga_m3 > v_cap then
      raise exception 'Ese camion no carga %, le caben %.', p_carga_m3, v_cap
        using errcode = '22023';
    end if;
  end if;

  if p_precio_usd is not null and p_precio_usd < 0 then
    raise exception 'El precio del viaje no puede ser negativo.' using errcode = '22023';
  end if;

  update public.acarreos
     set hora       = coalesce(p_hora, hora),
         carga_m3   = coalesce(p_carga_m3, carga_m3),
         precio_usd = coalesce(p_precio_usd, precio_usd),
         nota       = coalesce(nullif(btrim(coalesce(p_nota, '')), ''), nota)
   where id = p_id;
end;
$function$;

-- public.costo_aceptar(p_origen text, p_origen_id bigint, p_monto numeric, p_nota text)
-- venia de: 20260914152552_lo_que_entra_al_libro_se_acepta.sql
CREATE OR REPLACE FUNCTION public.costo_aceptar(p_origen text, p_origen_id bigint, p_monto numeric DEFAULT NULL::numeric, p_nota text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caja  public.costo_cajas;
  v_c     record;
  v_a     record;
  v_monto numeric;
  v_cat   text;
  v_mov   bigint;
begin
  perform private.exigir_accion('COSTOS.ACEPTAR');
  v_caja := private.costo_caja_abierta(true);

  if exists (select 1 from public.costo_decisiones d
              where d.origen = p_origen and d.origen_id = p_origen_id and d.deshecha_en is null
                and (p_origen <> 'FIJO' or d.caja_id = v_caja.id)) then
    raise exception 'Eso ya se decidio.' using errcode = '55000';
  end if;

  select * into v_c from public.costo_candidatos(v_caja.id) k
   where k.origen = p_origen and k.origen_id = p_origen_id;

  if v_c.origen is null then
    raise exception 'Eso no esta por aceptar.' using errcode = 'P0002';
  end if;

  if v_c.aviso = 'SIN_PRECIO' then
    raise exception 'Ese viaje no tiene precio. Corrigelo en Viajes de camiones antes de aceptarlo.'
      using errcode = '55000';
  end if;

  if p_origen = 'ACARREO' then
    select a.precio_usd, coalesce(v.propio, a.maquina_id is not null) as propio into v_a
      from public.acarreos a left join public.vehiculos v on v.id = a.vehiculo_id
     where a.id = p_origen_id;

    if v_a.propio then
      v_monto := 0;
    else
      perform private.exigir_accion('EXPLOTACION.VER_PAGO_VIAJES');
      v_monto := v_a.precio_usd;
    end if;

  elsif p_origen = 'FIJO' then
    v_monto := coalesce(p_monto, v_c.monto);
    if v_monto <= 0 then
      raise exception 'El monto del gasto fijo tiene que ser mayor que cero.' using errcode = '22023';
    end if;
    select f.categoria into v_cat from public.costo_gastos_fijos f where f.id = p_origen_id;

  else
    v_monto := coalesce(v_c.monto, 0);
  end if;

  v_mov := private.costo_escribir(
    v_c.fecha, v_c.descripcion, v_c.clase, v_c.moneda, v_monto,
    p_origen, p_origen_id, v_c.m3, v_c.producto_id, v_c.medida,
    v_cat, null, v_c.vehiculo_id, p_nota);

  insert into public.costo_decisiones (caja_id, origen, origen_id, decision, movimiento_id, decidido_por)
  values (v_caja.id, p_origen, p_origen_id, 'ACEPTADA', v_mov, (select auth.uid()));

  return v_mov;
end;
$function$;

-- public.costo_candidatos(p_caja_id bigint)
-- venia de: 20260914152552_lo_que_entra_al_libro_se_acepta.sql
CREATE OR REPLACE FUNCTION public.costo_candidatos(p_caja_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(origen text, origen_id bigint, fecha date, descripcion text, clase text, moneda text, monto numeric, m3 numeric, producto_id bigint, medida text, vehiculo_id bigint, placa text, aviso text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caja    public.costo_cajas;
  v_ve_pago boolean := private.puede_accion('EXPLOTACION.VER_PAGO_VIAJES');
begin
  perform private.exigir_permiso('COSTOS', 'LECTURA');

  if p_caja_id is null then
    v_caja := private.costo_caja_abierta(false);
  else
    select * into v_caja from public.costo_cajas c where c.id = p_caja_id;
    if v_caja.id is null then
      raise exception 'Esa caja no existe.' using errcode = 'P0002';
    end if;
  end if;

  return query
  with mediana as (
    select percentile_cont(0.5) within group (order by a.precio_usd) as p
      from public.acarreos a
     where a.estado in ('REGISTRADO', 'APROBADO')
       and a.tramo = 'MINA_BASE'
       and a.precio_usd > 0
       and date_trunc('month', a.fecha) = date_trunc('month', private.hoy_aqui())
  )
  select 'ACARREO'::text,
         a.id,
         a.fecha,
         ('Viaje ' || a.secuencia || ' · ' || coalesce(v.placa, a.equipo_codigo) || ' · ' || a.transportista || ' · ' ||
          coalesce(lower(ru.nombre),
                   case a.tramo when 'MINA_PLANTA' then 'a planta fija'
                                when 'PLANTA_LAVADO' then 'a lavado'
                                else 'coraza a base' end))::text,
         'VIAJE'::text,
         'USD'::text,
         case when coalesce(v.propio, a.maquina_id is not null) then null
              when v_ve_pago then a.precio_usd end::numeric,
         a.carga_m3,
         null::bigint,
         case when a.carga_m3 is null then null else 'MINA' end::text,
         a.vehiculo_id,
         coalesce(v.placa, a.equipo_codigo),
         case
           when not coalesce(v.propio, a.maquina_id is not null) and a.precio_usd <= 0 then 'SIN_PRECIO'
           when not coalesce(v.propio, a.maquina_id is not null) and a.tramo = 'MINA_BASE' and md.p > 0 and a.precio_usd > md.p * 3 then 'PRECIO_RARO'
           when a.carga_m3 is null and a.carga is distinct from 'VACIO' then 'SIN_M3'
         end::text
    from public.acarreos a
    left join public.vehiculos v on v.id = a.vehiculo_id
    left join public.rutas_acarreo ru on ru.id = a.ruta_id
    left join mediana md on true
   where a.estado in ('REGISTRADO', 'APROBADO')
     and not exists (select 1 from public.costo_decisiones d
                      where d.origen = 'ACARREO' and d.origen_id = a.id and d.deshecha_en is null)

  union all
  select 'SALIDA_PLANTA',
         s.id,
         s.fecha,
         ('Salida ' || s.numero || ' · ' || v.placa || ' · ' || ar.nombre)::text,
         'SALIDA',
         'USD',
         null::numeric,
         s.m3,
         s.producto_id,
         case when s.m3 is null then null else 'PLANTA' end,
         s.vehiculo_id,
         v.placa,
         case when s.m3 is null then 'SIN_M3' end
    from public.salidas_planta s
    join public.vehiculos v on v.id = s.vehiculo_id
    join public.articulos ar on ar.id = s.producto_id
   where s.estado = 'REGISTRADO'
     and not exists (select 1 from public.costo_decisiones d
                      where d.origen = 'SALIDA_PLANTA' and d.origen_id = s.id and d.deshecha_en is null)

  union all
  select 'FIJO',
         f.id,
         greatest(v_caja.fecha_inicio, least(private.hoy_aqui(), coalesce(v_caja.fecha_fin, private.hoy_aqui()))),
         f.nombre,
         'FIJO',
         f.moneda::text,
         f.monto,
         null, null, null, null, null,
         null
    from public.costo_gastos_fijos f
   where f.activo
     and not exists (select 1 from public.costo_decisiones d
                      where d.caja_id = v_caja.id and d.origen = 'FIJO' and d.origen_id = f.id
                        and d.deshecha_en is null)
  order by 3, 1, 2;
end;
$function$;

-- public.despachar(p_cliente_id bigint, p_almacen_id bigint, p_renglones jsonb, p_moneda character, p_cotizacion_id bigint, p_vehiculo text, p_chofer text, p_cedula_chofer text, p_peso_bruto numeric, p_peso_tara numeric, p_ticket text, p_alicuota_iva numeric, p_descuento numeric, p_flete numeric, p_fecha date, p_observacion text, p_ticket_id bigint, p_guia_id bigint)
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
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

  -- Ninguna salida de mineral viaja sin guía. Se comprueba después de cargar
  -- los renglones porque hasta aquí no se sabía si esta nota lleva producto o
  -- es solo un flete.
  select exists (
    select 1
    from public.nota_entrega_renglones r
    join public.articulos a on a.id = r.articulo_id
    where r.nota_id = v_id and a.categoria = 'PRODUCTO'
  ) into v_producto;

  if v_producto and p_guia_id is null and not private.tiene_permiso('DESPACHOS', 'TOTAL') then
    raise exception 'Este despacho lleva mineral y no tiene guía de movilización. Cárgala en Despachos › Guías, o pídele a quien tenga control total sobre Despachos que lo autorice sin ella.'
      using errcode = '55000';
  end if;

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
    select r.id, r.articulo_id, r.cantidad, a.nombre, a.inventariable
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
      format('DESPACHO A %s', v_cliente.nombre), null, null, null, v_fecha);

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
