/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  7 funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
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
  viva —no normalizado, no perdonando comentarios— y los 7 coinciden. Y el
  detector, que antes marcaba estas 7, pasa a cero.

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

-- private.recalcular_venta(p_tabla text, p_columna text, p_id bigint)
-- venia de: 20260820180000_el_flete_no_grava_lo_que_esta_exento.sql
CREATE OR REPLACE FUNCTION private.recalcular_venta(p_tabla text, p_columna text, p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_subtotal   numeric(20,6);
  v_gravado    numeric(20,6);
  v_descuento  numeric(20,6);
  v_flete      numeric(20,6);
  v_alicuota   numeric(5,2);
  v_proporcion numeric(20,10);
  v_base       numeric(20,6);
  v_iva        numeric(20,6);
  v_renglones  text := case p_tabla
                         when 'cotizaciones_venta' then 'cotizacion_venta_renglones'
                         when 'notas_entrega'      then 'nota_entrega_renglones'
                         when 'facturas_venta'     then 'factura_venta_renglones'
                         when 'notas_credito'      then 'nota_credito_renglones'
                       end;
begin
  if v_renglones is null then
    raise exception 'No sé sumar los renglones de %.', p_tabla using errcode = '22023';
  end if;

  execute format(
    'select coalesce(sum(subtotal), 0),
            coalesce(sum(subtotal) filter (where not exento_iva), 0)
       from public.%I where %I = $1', v_renglones, p_columna)
    into v_subtotal, v_gravado using p_id;

  execute format(
    'select descuento, flete, alicuota_iva from public.%I where id = $1', p_tabla)
    into v_descuento, v_flete, v_alicuota using p_id;

  -- Sin alícuota no hay base imponible: lo que se vendió sin IVA es exento, y
  -- así tiene que llegar al libro de ventas. Antes entraba como base al 0 %.
  if coalesce(v_alicuota, 0) = 0 then
    v_base := 0;
  elsif v_subtotal > 0 then
    v_proporcion := v_gravado / v_subtotal;

    v_base := round(
      greatest(v_gravado - v_descuento * v_proporcion, 0)
      + v_flete * v_proporcion, 6);
  else
    v_base := v_flete;
  end if;

  v_iva := round(v_base * v_alicuota / 100, 2);

  execute format(
    'update public.%I
        set subtotal = $1, base_imponible = $2, iva = $3, total = $4
      where id = $5', p_tabla)
    using v_subtotal, v_base, v_iva,
          round(v_subtotal - v_descuento + v_flete + v_iva, 2), p_id;
end;
$function$;

-- public.anular_cobro(p_id bigint, p_motivo text)
-- venia de: 20260804160000_ventas_cerrojos.sql
CREATE OR REPLACE FUNCTION public.anular_cobro(p_id bigint, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_cobro      record;
  v_fac        record;
  v_factura_id bigint;
begin
  perform private.exigir_permiso('FACTURACION', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se anula el cobro.' using errcode = '22023';
  end if;

  select factura_id into v_factura_id from public.cobros_venta where id = p_id;

  if v_factura_id is null then
    raise exception 'No existe el cobro %.', p_id using errcode = 'P0002';
  end if;

  perform 1 from public.facturas_venta where id = v_factura_id for update;

  select * into v_cobro from public.cobros_venta where id = p_id for update;

  if v_cobro.estado = 'ANULADO' then
    raise exception 'El cobro % ya estaba anulado.', v_cobro.numero using errcode = '55000';
  end if;

  select * into v_fac from public.facturas_venta where id = v_cobro.factura_id;

  -- El dinero que entró tiene que salir del libro con su propio asiento. El
  -- libro de tesorería no se edita: se le escribe el contrario.
  perform private.registrar_movimiento_tesoreria(
    v_cobro.cuenta_id, 'REVERSO', -1, v_cobro.monto,
    format('ANULACIÓN DEL COBRO %s DE LA FACTURA %s: %s',
           v_cobro.numero, v_fac.numero, trim(p_motivo)),
    current_date, v_cobro.referencia, null, null, null, v_cobro.movimiento_id, null);

  if v_cobro.igtf_monto > 0 then
    perform private.registrar_movimiento_tesoreria(
      v_cobro.cuenta_id, 'REVERSO', -1, v_cobro.igtf_monto,
      format('ANULACIÓN DEL IGTF DEL COBRO %s', v_cobro.numero),
      current_date, v_cobro.referencia, null, null, null, v_cobro.movimiento_igtf_id, null);
  end if;

  update public.cobros_venta
     set estado = 'ANULADO',
         motivo_anulacion = trim(p_motivo),
         anulado_por = (select auth.uid()),
         anulado_en = now()
   where id = p_id;

  -- Vuelve a deber. Una factura marcada como cobrada con un cobro que se anuló
  -- desaparecería de la cobranza debiendo dinero.
  update public.facturas_venta set estado = 'EMITIDA'
   where id = v_cobro.factura_id and estado = 'COBRADA';
end;
$function$;

-- public.anular_factura(p_id bigint, p_motivo text)
-- venia de: 20260805150000_notas_credito.sql
CREATE OR REPLACE FUNCTION public.anular_factura(p_id bigint, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fac    record;
  v_cobros integer;
  v_notas  integer;
begin
  perform private.exigir_permiso('FACTURACION', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se anula. Una factura anulada sin motivo no se puede explicar.'
      using errcode = '22023';
  end if;

  select * into v_fac from public.facturas_venta where id = p_id for update;

  if v_fac.id is null then
    raise exception 'No existe la factura %.', p_id using errcode = 'P0002';
  end if;

  if v_fac.estado = 'ANULADA' then
    raise exception 'La factura % ya estaba anulada.', v_fac.numero using errcode = '55000';
  end if;

  select count(*) into v_cobros
  from public.cobros_venta where factura_id = p_id and estado = 'REGISTRADO';

  if v_cobros > 0 then
    raise exception 'La factura % tiene % cobro(s) registrados. Anúlalos primero: el dinero entró y tiene que salir del libro con su propio asiento.',
      v_fac.numero, v_cobros using errcode = '55000';
  end if;

  select count(*) into v_notas
  from public.notas_credito where factura_id = p_id and estado = 'EMITIDA';

  if v_notas > 0 then
    raise exception 'La factura % ya tiene % nota(s) de crédito. Se corrige con notas o se anula, no las dos: anúlalas primero si de verdad hay que dejar la factura sin efecto.',
      v_fac.numero, v_notas using errcode = '55000';
  end if;

  update public.facturas_venta
     set estado = 'ANULADA',
         motivo_anulacion = trim(p_motivo),
         anulada_por = (select auth.uid()),
         anulada_en = now()
   where id = p_id;

  update public.notas_entrega
     set estado = 'DESPACHADA', factura_id = null
   where factura_id = p_id and estado = 'FACTURADA';
end;
$function$;

-- public.anular_nota_credito(p_id bigint, p_motivo text)
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.anular_nota_credito(p_id bigint, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_nota  record;
  v_reng  record;
  v_hay   numeric;
begin
  perform private.exigir_permiso('FACTURACION', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se anula.' using errcode = '22023';
  end if;

  select * into v_nota from public.notas_credito where id = p_id for update;

  if v_nota.id is null then
    raise exception 'No existe la nota de crédito %.', p_id using errcode = 'P0002';
  end if;

  if v_nota.estado = 'ANULADA' then
    raise exception 'La nota % ya estaba anulada.', v_nota.numero using errcode = '55000';
  end if;

  -- El material que volvió tiene que poder volver a salir. Si ya se vendió otra
  -- vez, el patio no alcanza y anular aquí dejaría existencia negativa.
  for v_reng in
    select * from public.nota_credito_renglones
     where nota_id = p_id and almacen_id is not null
     order by articulo_id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(format('patio:%s:%s', v_reng.almacen_id, v_reng.articulo_id), 0));

    v_hay := private.existencia_para_escribir(v_reng.almacen_id, v_reng.articulo_id);

    if v_hay < v_reng.cantidad then
      raise exception
        'La nota % devolvió % al patio y ahora solo hay %. Ese material ya salió otra vez: no se puede deshacer la devolución.',
        v_nota.numero, private.cantidad_es(v_reng.cantidad), private.cantidad_es(v_hay) using errcode = '55000';
    end if;

    -- Aquí `p_origen` sí lleva algo, y lleva lo que corresponde: la entrada que
    -- este asiento deshace. Así el libro de inventario dice de qué movimiento
    -- es el reverso sin que haya que reconstruirlo.
    perform private.registrar_movimiento(
      'REVERSO', -1, v_reng.almacen_id, v_reng.articulo_id, v_reng.cantidad, 0,
      format('Anulación de la nota de crédito %s', v_nota.numero),
      null, null, v_reng.movimiento_id, (now() at time zone 'America/Caracas')::date);
  end loop;

  update public.notas_credito
     set estado = 'ANULADA',
         motivo_anulacion = trim(p_motivo),
         anulada_por = (select auth.uid()),
         anulada_en = now()
   where id = p_id;

  -- Y al revés: si la nota la había cerrado y sin ella vuelve a deber, se reabre.
  update public.facturas_venta
     set estado = 'EMITIDA'
   where id = v_nota.factura_id
     and estado = 'COBRADA'
     and private.saldo_de_factura(v_nota.factura_id) > 0.01;
end;
$function$;

-- public.emitir_nota_credito(p_factura_id bigint, p_tipo text, p_motivo text, p_renglones jsonb, p_fecha date)
-- venia de: 20260805150000_notas_credito.sql
CREATE OR REPLACE FUNCTION public.emitir_nota_credito(p_factura_id bigint, p_tipo text, p_motivo text, p_renglones jsonb, p_fecha date DEFAULT NULL::date)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fac    record;
  v_id     bigint;
  v_fecha  date := coalesce(p_fecha, (now() at time zone 'America/Caracas')::date);
  v_item   jsonb;
  v_linea  smallint := 0;
  v_art    record;
  v_alm    bigint;
  v_mov    bigint;
  v_reng   bigint;
begin
  perform private.exigir_permiso('FACTURACION', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 6 then
    raise exception 'Escribe por qué se emite. Una nota de crédito sin motivo no se le puede explicar a nadie: ni al cliente, ni al SENIAT, ni al que la lea en un año.'
      using errcode = '22023';
  end if;

  if p_tipo not in ('DEVOLUCION', 'DESCUENTO', 'CORRECCION', 'ANULACION') then
    raise exception 'Tipo de nota de crédito no válido: %.', p_tipo using errcode = '22023';
  end if;

  if coalesce(jsonb_array_length(p_renglones), 0) = 0 then
    raise exception 'La nota necesita al menos un renglón: qué se corrige y por cuánto.'
      using errcode = '22023';
  end if;

  -- La fila de la factura es el portero, igual que para cobrar y para anular.
  select * into v_fac from public.facturas_venta where id = p_factura_id for update;

  if v_fac.id is null then
    raise exception 'No existe la factura %.', p_factura_id using errcode = 'P0002';
  end if;

  if v_fac.estado = 'ANULADA' then
    raise exception 'La factura % está anulada. Una factura sin efecto no se corrige: no hay nada que restarle.',
      v_fac.numero using errcode = '55000';
  end if;

  if v_fecha < v_fac.fecha then
    raise exception 'La nota es del % y la factura que corrige es del %. Una corrección no puede ser anterior a lo que corrige.',
      to_char(v_fecha, 'DD/MM/YYYY'), to_char(v_fac.fecha, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  insert into public.notas_credito
    (numero, numero_control, factura_id, cliente_id, fecha, tipo, motivo,
     moneda, tasa, tasa_usd, alicuota_iva, emitida_por)
  values
    (private.siguiente_numero('NCR'), private.siguiente_control(), v_fac.id,
     v_fac.cliente_id, v_fecha, p_tipo, trim(p_motivo),
     -- La tasa de la factura. Si fuera la de hoy, restaría otros bolívares de
     -- los que sumó y la factura nunca cerraría.
     v_fac.moneda, v_fac.tasa, v_fac.tasa_usd, v_fac.alicuota_iva,
     (select auth.uid()))
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_linea := v_linea + 1;

    select * into v_art from public.articulos
     where id = (v_item->>'articulo_id')::bigint;

    if v_art.id is null then
      raise exception 'El renglón % apunta a un artículo que no existe.', v_linea
        using errcode = 'P0002';
    end if;

    if coalesce((v_item->>'cantidad')::numeric, 0) <= 0 then
      raise exception 'La cantidad del renglón % debe ser mayor que cero.', v_linea
        using errcode = '22023';
    end if;

    v_alm := nullif(v_item->>'almacen_id', '')::bigint;

    insert into public.nota_credito_renglones
      (nota_id, linea, articulo_id, descripcion, cantidad, unidad,
       precio_unitario, exento_iva, almacen_id)
    values
      (v_id, v_linea, v_art.id,
       coalesce(nullif(trim(coalesce(v_item->>'descripcion', '')), ''), v_art.nombre),
       (v_item->>'cantidad')::numeric,
       coalesce(nullif(v_item->>'unidad', ''), v_art.unidad),
       coalesce((v_item->>'precio_unitario')::numeric, 0),
       coalesce((v_item->>'exento_iva')::boolean, false),
       v_alm)
    returning id into v_reng;

    -- Solo si el renglón dice a qué patio vuelve. Una corrección de precio no
    -- mueve una piedra.
    if v_alm is not null then
      -- El penúltimo argumento es `p_origen`, que NO es "de dónde viene esto"
      -- sino el movimiento al que este reversa, y apunta al libro de inventario.
      -- Aquí va en nulo: esta entrada no deshace nada, es material que llegó. El
      -- enlace con la nota vive en el renglón, que es donde se puede leer.
      v_mov := private.registrar_movimiento(
        'ENTRADA_DEVOLUCION', 1, v_alm, v_art.id,
        (v_item->>'cantidad')::numeric,
        coalesce((v_item->>'precio_unitario')::numeric, 0) * v_fac.tasa / v_fac.tasa_usd,
        format('Devolución del cliente por nota de crédito sobre la factura %s', v_fac.numero),
        null, null, null, v_fecha);

      update public.nota_credito_renglones set movimiento_id = v_mov where id = v_reng;
    end if;
  end loop;

  -- Si la nota deja la factura sin nada que cobrar, la factura se cierra: si no,
  -- se quedaba emitida sin admitir cobro ni anulación, y contando como vencida.
  if private.saldo_de_factura(v_fac.id) <= 0.01 then
    update public.facturas_venta
       set estado = 'COBRADA'
     where id = v_fac.id and estado = 'EMITIDA';
  end if;

  return v_id;
end;
$function$;

-- public.facturar_notas(p_notas bigint[], p_condicion_pago text, p_fecha date, p_observacion text)
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.facturar_notas(p_notas bigint[], p_condicion_pago text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date, p_observacion text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_cliente   record;
  v_fecha     date := coalesce(p_fecha, current_date);
  v_notas     record;
  v_condicion text;
  v_dias      smallint;
  v_id        bigint;
  v_linea     smallint := 0;
  v_reng      record;
  v_deuda     numeric;
  v_total_usd numeric;
  v_iva       numeric;
begin
  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');

  if p_notas is null or array_length(p_notas, 1) is null then
    raise exception 'No hay notas de entrega que facturar.' using errcode = '22023';
  end if;

  -- Las notas se cierran ANTES de mirarles el estado. Sin esto, dos facturas
  -- emitidas a la vez leen las dos "DESPACHADA", las dos consumen un número de
  -- control fiscal y la segunda pisa el factura_id de la primera: dos papeles
  -- por el mismo camión. En orden de id para que dos tandas que se solapen no
  -- se queden esperándose.
  perform 1 from public.notas_entrega
   where id = any(p_notas) order by id for update;

  select count(*)                       as cuantas,
         count(distinct n.cliente_id)   as clientes,
         count(distinct n.moneda)       as monedas,
         count(distinct n.alicuota_iva) as alicuotas,
         min(n.cliente_id)              as cliente_id,
         min(n.moneda)                  as moneda,
         min(n.alicuota_iva)            as alicuota,
         sum(n.descuento)               as descuento,
         sum(n.flete)                   as flete,
         count(*) filter (where n.estado <> 'DESPACHADA') as no_despachadas
    into v_notas
  from public.notas_entrega n
  where n.id = any(p_notas);

  if v_notas.cuantas <> array_length(p_notas, 1) then
    raise exception 'Alguna de las notas indicadas no existe.' using errcode = 'P0002';
  end if;

  if v_notas.no_despachadas > 0 then
    raise exception 'Solo se facturan notas despachadas: % de las indicadas ya están facturadas o anuladas.',
      v_notas.no_despachadas using errcode = '55000';
  end if;

  if v_notas.clientes > 1 then
    raise exception 'Las notas son de % clientes distintos. Una factura es de un solo cliente.',
      v_notas.clientes using errcode = '22023';
  end if;

  if v_notas.monedas > 1 then
    raise exception 'Las notas están en monedas distintas y no se pueden sumar en una factura.'
      using errcode = '22023';
  end if;

  if v_notas.alicuotas > 1 then
    raise exception 'Las notas llevan alícuotas de IVA distintas. Factúralas por separado.'
      using errcode = '22023';
  end if;

  select * into v_cliente from public.clientes where id = v_notas.cliente_id;

  v_condicion := coalesce(p_condicion_pago, v_cliente.condicion_pago);
  v_dias := case v_condicion
              when 'CREDITO_15' then 15
              when 'CREDITO_30' then 30
              when 'CREDITO_60' then 60
              else 0
            end;

  insert into public.facturas_venta
    (numero, numero_control, cliente_id, fecha, condicion_pago, dias_credito, vence_el,
     moneda, tasa, tasa_usd, alicuota_iva, descuento, flete, observacion, emitida_por)
  select
    private.siguiente_numero('FAC'), private.siguiente_control(), v_cliente.id, v_fecha,
    v_condicion, v_dias, v_fecha + v_dias,
    v_notas.moneda, t.tasa, t.tasa_usd, v_notas.alicuota,
    coalesce(v_notas.descuento, 0), coalesce(v_notas.flete, 0),
    nullif(trim(coalesce(p_observacion, '')), ''), (select auth.uid())
  from private.tasas_del_dia(v_notas.moneda, v_fecha) t
  returning id into v_id;

  -- Los renglones se copian, no se referencian: la factura tiene que seguir
  -- diciendo lo mismo aunque después alguien anule la nota de la que salió.
  for v_reng in
    select r.*, n.id as origen
    from public.nota_entrega_renglones r
    join public.notas_entrega n on n.id = r.nota_id
    where r.nota_id = any(p_notas)
    order by n.fecha, n.numero, r.linea
  loop
    v_linea := v_linea + 1;
    insert into public.factura_venta_renglones
      (factura_id, linea, articulo_id, descripcion, cantidad, unidad,
       precio_unitario, exento_iva, nota_id)
    values
      (v_id, v_linea, v_reng.articulo_id, v_reng.descripcion, v_reng.cantidad,
       v_reng.unidad, v_reng.precio_unitario, v_reng.exento_iva, v_reng.origen);
  end loop;

  -- La retención se calcula sobre el IVA ya cuadrado por el disparador.
  if v_cliente.contribuyente_especial then
    select iva into v_iva from public.facturas_venta where id = v_id;
    update public.facturas_venta
       set retencion_iva = round(v_iva * v_cliente.retencion_iva / 100, 2)
     where id = v_id;
  end if;

  -- El techo del crédito, después de conocer el total y antes de dar el
  -- documento por bueno. Un aviso que se salta con un clic, se salta.
  if v_dias > 0 then
    select total_usd into v_total_usd from public.facturas_venta where id = v_id;

    if v_cliente.limite_credito <= 0 then
      raise exception 'A "%" no se le tiene autorizado crédito. Fija su límite o factúrale de contado.',
        v_cliente.nombre using errcode = '55000';
    end if;

    -- La deuda ya incluye esta factura: acaba de emitirse como EMITIDA.
    v_deuda := private.deuda_cliente(v_cliente.id);

    if v_deuda > v_cliente.limite_credito and not private.tiene_permiso('FACTURACION', 'TOTAL') then
      raise exception 'Con esta factura "%" quedaría debiendo % $ y su límite es % $.',
        v_cliente.nombre, private.numero_es(v_deuda, 2), private.numero_es(v_cliente.limite_credito, 2)
        using errcode = '55000';
    end if;
  end if;

  update public.notas_entrega
     set estado = 'FACTURADA', factura_id = v_id
   where id = any(p_notas);

  return v_id;
end;
$function$;

-- public.registrar_cobro(p_factura_id bigint, p_cuenta_id bigint, p_monto numeric, p_metodo text, p_fecha date, p_referencia text, p_igtf boolean, p_nota text)
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.registrar_cobro(p_factura_id bigint, p_cuenta_id bigint, p_monto numeric, p_metodo text DEFAULT 'TRANSFERENCIA'::text, p_fecha date DEFAULT NULL::date, p_referencia text DEFAULT NULL::text, p_igtf boolean DEFAULT NULL::boolean, p_nota text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fac     record;
  v_cuenta  record;
  v_cliente record;
  v_fecha   date := coalesce(p_fecha, current_date);
  v_tasas   record;
  v_saldo   numeric;
  v_monto_usd numeric;
  v_igtf    boolean;
  v_id      bigint;
  v_mov     bigint;
  v_mov_igtf bigint;
  v_igtf_monto numeric;
  v_ref     text := nullif(trim(coalesce(p_referencia, '')), '');
  v_metodo  record;
begin
  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');

  -- El portero. Sin esto, dos cobros de $900 sobre una factura de $1.000 leen
  -- los dos "faltan $1.000" y los dos pasan; el saldo se queda en cero por el
  -- greatest y los $800 de más no aparecen en ningún sitio.
  perform 1 from public.facturas_venta where id = p_factura_id for update;

  select * into v_fac from public.v_facturas_venta where id = p_factura_id;

  if v_fac.id is null then
    raise exception 'No existe la factura %.', p_factura_id using errcode = 'P0002';
  end if;

  if v_fac.estado <> 'EMITIDA' then
    raise exception 'La factura % está % y no admite cobros.', v_fac.numero, lower(v_fac.estado)
      using errcode = '55000';
  end if;

  select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta_id;

  if v_cuenta.id is null then
    raise exception 'No existe la cuenta %.', p_cuenta_id using errcode = 'P0002';
  end if;

  /*
    EL MÉTODO TIENE QUE PODER CAER EN ESA CUENTA.

    La misma regla del catálogo que el pago de una compra comprueba con
    `private.validar_metodo_pago`, que es disparador de su tabla y aquí no sirve.
    Sin esto un pago móvil entraba a una cuenta en dólares.
  */
  select * into v_metodo from public.metodos_pago
   where codigo = coalesce(p_metodo, 'TRANSFERENCIA');

  if v_metodo.codigo is null then
    raise exception 'El método de pago «%» no existe.', p_metodo using errcode = '23503';
  end if;

  if not v_metodo.activo then
    raise exception '% ya no está en uso como método de pago.', v_metodo.nombre
      using errcode = '55000';
  end if;

  if v_metodo.moneda_regla = 'SOLO_VES' and v_cuenta.moneda <> 'VES' then
    raise exception '% solo funciona en bolívares, y la cuenta % es en %.',
      v_metodo.nombre, v_cuenta.nombre, v_cuenta.moneda using errcode = '22023';
  end if;

  if v_metodo.moneda_regla = 'NUNCA_VES' and v_cuenta.moneda = 'VES' then
    raise exception '% no funciona en bolívares, y la cuenta % es en bolívares.',
      v_metodo.nombre, v_cuenta.nombre using errcode = '22023';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto del cobro tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'No se registra un cobro con fecha futura.' using errcode = '22023';
  end if;

  -- El cobro entra en la moneda de la cuenta donde cae el dinero: si el pago
  -- llegó a la cuenta en bolívares, el cobro es en bolívares aunque la factura
  -- esté en dólares. Por eso el saldo se compara en dólares y no en la moneda
  -- de la factura.
  select * into v_tasas from private.tasas_del_dia(v_cuenta.moneda, v_fecha);
  v_monto_usd := round(p_monto * v_tasas.tasa / v_tasas.tasa_usd, 2);
  v_saldo := private.saldo_de_factura(p_factura_id);

  if v_saldo is null then
      raise exception 'No se pudo calcular lo que falta por cobrar de esa factura. No se registra un cobro a ciegas.'
        using errcode = '22023';
    end if;

    if v_monto_usd > v_saldo + 0.01 then
    raise exception 'A la factura % le faltan % $ y se están abonando % $. Si el cliente pagó de más, regístralo como dos cobros o revisa la tasa del día.',
      v_fac.numero, private.numero_es(v_saldo, 2), private.numero_es(v_monto_usd, 2) using errcode = '22023';
  end if;

  /*
    La referencia del efectivo se genera sola, igual que al pagar.

    En una transferencia la referencia la devuelve el banco; en efectivo no la
    devuelve nadie y el campo quedaba vacio, con lo que un cobro no se podia
    señalar en una conversacion: «el de 520 dolares», y hubo dos ese dia. Queda
    EFEUSD-2026-0001 o EFEBS-2026-0001, con el mismo contador que numera todos
    los documentos de la casa. Si quien cobra escribe una, manda la suya.
  */
  if v_ref is null and coalesce(p_metodo, '') = 'EFECTIVO' then
    v_ref := private.siguiente_numero(
      'EFE' || case when v_cuenta.moneda = 'VES' then 'BS' else v_cuenta.moneda end);
  end if;

  -- El IGTF grava los pagos en divisas. Se propone según la moneda de la
  -- cuenta y se puede desactivar: hay cobros exentos y quien registra lo sabe.
  v_igtf := coalesce(p_igtf, v_cuenta.moneda <> 'VES');

  select * into v_cliente from public.clientes where id = v_fac.cliente_id;

  insert into public.cobros_venta
    (numero, factura_id, cuenta_id, fecha, metodo, moneda, tasa, tasa_usd,
     monto, igtf_aplica, referencia, nota, registrado_por)
  values
    (private.siguiente_numero('COB'), p_factura_id, p_cuenta_id, v_fecha,
     coalesce(p_metodo, 'TRANSFERENCIA'), v_cuenta.moneda, v_tasas.tasa, v_tasas.tasa_usd,
     p_monto, v_igtf, v_ref,
     nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  select igtf_monto into v_igtf_monto from public.cobros_venta where id = v_id;

  v_mov := private.registrar_movimiento_tesoreria(
    p_cuenta_id, 'INGRESO', 1, p_monto,
    format('COBRO DE LA FACTURA %s', v_fac.numero),
    v_fecha, v_ref, v_cliente.nombre, null, null, null, p_nota);

  -- El IGTF entra como asiento aparte porque no es de la empresa: es un
  -- impuesto que se recauda y se entrega. Mezclado con el cobro haría creer
  -- que el cliente pagó más de lo que abonó.
  if v_igtf and v_igtf_monto > 0 then
    v_mov_igtf := private.registrar_movimiento_tesoreria(
      p_cuenta_id, 'IGTF', 1, v_igtf_monto,
      format('IGTF COBRADO EN LA FACTURA %s', v_fac.numero),
      v_fecha, v_ref, v_cliente.nombre, null, null, v_mov, null);
  end if;

  update public.cobros_venta
     set movimiento_id = v_mov, movimiento_igtf_id = v_mov_igtf
   where id = v_id;

  -- Cerrada cuando no queda saldo. El centavo de tolerancia es del redondeo de
  -- las tasas, no de la cuenta.
  if private.saldo_de_factura(p_factura_id) <= 0.01 then
    update public.facturas_venta set estado = 'COBRADA' where id = p_factura_id;
  end if;

  return v_id;
end;
$function$;
