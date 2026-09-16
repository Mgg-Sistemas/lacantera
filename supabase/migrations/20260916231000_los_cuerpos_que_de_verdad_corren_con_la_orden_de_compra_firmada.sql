/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  5 funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
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
  viva —no normalizado, no perdonando comentarios— y los 5 coinciden. Y el
  detector, que antes marcaba estas 5, pasa a cero.

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

-- public.actualizar_pedido(p_id bigint, p_titulo text, p_justificacion text, p_renglones jsonb, p_prioridad text, p_requerida_para date, p_destino text, p_solicitante_id uuid, p_solicitante_nombre text, p_solicitante_cargo text, p_destino_almacen_id bigint, p_con_firma boolean)
-- venia de: 20260827160000_editar_el_pedido_enviado.sql
CREATE OR REPLACE FUNCTION public.actualizar_pedido(p_id bigint, p_titulo text, p_justificacion text, p_renglones jsonb, p_prioridad text DEFAULT 'NORMAL'::text, p_requerida_para date DEFAULT NULL::date, p_destino text DEFAULT NULL::text, p_solicitante_id uuid DEFAULT NULL::uuid, p_solicitante_nombre text DEFAULT NULL::text, p_solicitante_cargo text DEFAULT NULL::text, p_destino_almacen_id bigint DEFAULT NULL::bigint, p_con_firma boolean DEFAULT NULL::boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_estado  text;
  v_dueno   uuid;
  v_sol     record;
  v_destino text := nullif(trim(coalesce(p_destino, '')), '');
  v_nombre  text;
  v_cotiza  integer;
  v_antes   uuid;
begin
  select estado, registrada_por, solicitante_id into v_estado, v_dueno, v_antes
  from public.solicitudes_pedido where id = p_id;

  if v_estado is null then
    raise exception 'No existe el pedido %.', p_id using errcode = 'P0002';
  end if;

  if v_estado not in ('BORRADOR', 'PEDIDO', 'CONFIRMADA') then
    raise exception 'Este pedido está en "%" y ya no se corrige aquí. Si está con el gerente, retira lo propuesto; si ya se aprobó, la orden manda.', v_estado
      using errcode = '55000';
  end if;

  if v_dueno <> (select auth.uid()) and not private.tiene_rol('COMPRAS') then
    raise exception 'Solo quien creó el pedido puede corregirlo.' using errcode = '42501';
  end if;

  select count(*) into v_cotiza
  from public.cotizaciones where solicitud_id = p_id;

  if v_cotiza > 0 then
    raise exception 'Este pedido ya tiene % cotización(es) cargada(s), y están puestas sobre estos renglones: corregirlo ahora las dejaría vacías. Elimina las cotizaciones y vuelve a cargarlas después.', v_cotiza
      using errcode = '55000';
  end if;

  if p_destino_almacen_id is not null then
    select nombre into v_nombre from public.almacenes where id = p_destino_almacen_id;
    if v_nombre is null then
      raise exception 'No existe el almacén %.', p_destino_almacen_id using errcode = '23503';
    end if;
    v_destino := v_nombre;
  end if;

  select * into v_sol from private.normalizar_solicitante(
    coalesce(p_solicitante_id,
             case when nullif(trim(coalesce(p_solicitante_nombre, '')), '') is null
                  then v_dueno end),
    p_solicitante_nombre, p_solicitante_cargo);

  update public.solicitudes_pedido set
    titulo = trim(p_titulo),
    justificacion = trim(p_justificacion),
    prioridad = coalesce(p_prioridad, 'NORMAL'),
    requerida_para = p_requerida_para,
    destino = v_destino,
    destino_almacen_id = p_destino_almacen_id,
    solicitante_id = v_sol.o_id,
    solicitante_nombre = v_sol.o_nombre,
    solicitante_cargo = v_sol.o_cargo,
    firma_de_quien_pide = case
      when p_con_firma is not null
        then p_con_firma
             and v_sol.o_id is not distinct from (select auth.uid())
             and private.tengo_firma_encendida()
      -- Lo que eligió quien pedía no pasa a quien pide ahora.
      when v_sol.o_id is not distinct from v_antes then firma_de_quien_pide
      else false
    end
  where id = p_id;

  perform private.escribir_renglones(p_id, p_renglones);

  if v_estado <> 'BORRADOR' then
    perform private.anotar('SOLICITUD', p_id, v_estado, v_estado, 'Se corrigió el pedido');
  end if;
end;
$function$;

-- public.aprobar_compra(p_solicitud_id bigint, p_cotizacion_id bigint, p_nota text, p_con_firma boolean)
-- venia de: 20260827170000_la_marca_llega_a_la_orden.sql
CREATE OR REPLACE FUNCTION public.aprobar_compra(p_solicitud_id bigint, p_cotizacion_id bigint DEFAULT NULL::bigint, p_nota text DEFAULT NULL::text, p_con_firma boolean DEFAULT true)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_estado    text;
  v_cot       public.cotizaciones;
  v_propuestas integer;
  v_orden_id  bigint;
  v_autoriza  uuid;
begin
  perform private.exigir_accion('COMPRAS.APROBAR_COMPRA');

  v_autoriza := private.autoriza_delegacion('COMPRAS.APROBAR_COMPRA');

  select estado into v_estado from public.solicitudes_pedido where id = p_solicitud_id;

  if v_estado is null then
    raise exception 'No existe el pedido %.', p_solicitud_id using errcode = 'P0002';
  end if;

  if v_estado <> 'POR_CONFIRMAR_GERENTE' then
    raise exception 'Este pedido está en "%" y todavía no llega a la gerencia.', v_estado
      using errcode = '55000';
  end if;

  select count(*) into v_propuestas
  from public.cotizaciones
  where solicitud_id = p_solicitud_id and propuesta;

  if p_cotizacion_id is not null then
    select c.* into v_cot
    from public.cotizaciones c
    where c.id = p_cotizacion_id and c.solicitud_id = p_solicitud_id and c.propuesta;

    if v_cot.id is null then
      raise exception 'Esa cotización no está entre las propuestas de este pedido.'
        using errcode = '22023';
    end if;

  elsif v_propuestas = 1 then
    select c.* into v_cot
    from public.cotizaciones c
    where c.solicitud_id = p_solicitud_id and c.propuesta;

  elsif v_propuestas = 0 then
    raise exception 'El pedido no tiene ninguna cotización propuesta.' using errcode = '55000';

  else
    raise exception 'Hay % cotizaciones propuestas: hay que decir cuál se aprueba.', v_propuestas
      using errcode = '22023';
  end if;

  insert into public.ordenes_compra
    (numero, solicitud_id, cotizacion_id, proveedor_id, moneda, tasa, tasa_usd,
     subtotal, descuento, flete, iva, total, dias_entrega, entrega_estimada,
     creada_por, aprobada_gg_por, aprobada_gg_en, aprobada_por_autorizacion_de)
  values
    (private.siguiente_numero('OC'), p_solicitud_id, v_cot.id, v_cot.proveedor_id,
     v_cot.moneda, v_cot.tasa, v_cot.tasa_usd,
     v_cot.subtotal, v_cot.descuento, v_cot.flete, v_cot.iva, v_cot.total,
     v_cot.dias_entrega,
     case when v_cot.dias_entrega is not null then current_date + v_cot.dias_entrega end,
     (select auth.uid()), (select auth.uid()), now(), v_autoriza)
  returning id into v_orden_id;

  insert into public.orden_renglones
    (orden_id, linea, articulo_id, descripcion, cantidad, unidad, precio_unitario, exento_iva,
     marca, presentacion)
  select v_orden_id, sr.linea, sr.articulo_id, sr.descripcion,
         cr.cantidad, sr.unidad, cr.precio_unitario, cr.exento_iva,
         cr.marca, cr.presentacion
  from public.cotizacion_renglones cr
  join public.solicitud_renglones sr on sr.id = cr.solicitud_renglon_id
  where cr.cotizacion_id = v_cot.id;

  update public.cotizaciones
     set propuesta = false
   where solicitud_id = p_solicitud_id and propuesta;

  update public.solicitudes_pedido
     set estado = 'APROBADA',
         cotizacion_elegida_id = v_cot.id,
         aprobada_gg_por = (select auth.uid()), aprobada_gg_en = now(),
         aprobada_por_autorizacion_de = v_autoriza,
         -- «Todo papel, como mínimo, con la firma de quien autoriza».
         firma_de_quien_aprueba = coalesce(p_con_firma, true) and private.tengo_firma_encendida()
   where id = p_solicitud_id;

  perform private.anotar('SOLICITUD', p_solicitud_id, v_estado, 'APROBADA',
    nullif(concat_ws(' · ',
      case when v_propuestas > 1
           then format('Escogió %s entre %s propuestas', v_cot.numero, v_propuestas) end,
      p_nota,
      case when v_autoriza is not null
           then 'Bajo autorización de ' ||
                (select nombre from public.perfiles where id = v_autoriza) end), ''));
  perform private.anotar('ORDEN', v_orden_id, null, 'POR_INDICAR_PAGO', p_nota);

  return v_orden_id;
end;
$function$;

-- public.comprar_directo(p_proveedor_id bigint, p_moneda text, p_renglones jsonb, p_titulo text, p_justificacion text, p_numero_factura text, p_fecha date, p_condicion_pago text, p_alicuota_iva numeric, p_descuento numeric, p_flete numeric, p_observacion text, p_destino_almacen_id bigint, p_con_firma boolean)
-- venia de: 20260828100000_compras_directas.sql
CREATE OR REPLACE FUNCTION public.comprar_directo(p_proveedor_id bigint, p_moneda text, p_renglones jsonb, p_titulo text, p_justificacion text DEFAULT NULL::text, p_numero_factura text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date, p_condicion_pago text DEFAULT 'CONTADO'::text, p_alicuota_iva numeric DEFAULT 16, p_descuento numeric DEFAULT 0, p_flete numeric DEFAULT 0, p_observacion text DEFAULT NULL::text, p_destino_almacen_id bigint DEFAULT NULL::bigint, p_con_firma boolean DEFAULT true)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_yo         uuid := (select auth.uid());
  v_fecha      date := coalesce(p_fecha, current_date);
  v_solicitud  bigint;
  v_cotizacion bigint;
  v_orden      bigint;
  v_tasa       numeric;
  v_tasa_usd   numeric;
  v_item       jsonb;
  v_linea      smallint := 0;
  v_destino    text;
  v_estado     text;
begin
  perform private.exigir_accion('COMPRAS.COMPRA_DIRECTA');

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'Una compra necesita al menos un renglón.' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_titulo, ''))) < 3 then
    raise exception 'Escribe qué se compró: el título es lo que se lee en el tablero.'
      using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'Una compra no puede tener fecha futura.' using errcode = '22023';
  end if;

  select t.tasa, t.tasa_usd into v_tasa, v_tasa_usd
  from private.tasas_del_dia(p_moneda::bpchar, v_fecha) t;

  if p_destino_almacen_id is not null then
    select nombre into v_destino from public.almacenes where id = p_destino_almacen_id;
    if v_destino is null then
      raise exception 'No existe el almacén %.', p_destino_almacen_id using errcode = '23503';
    end if;
  end if;

  -- La solicitud nace aprobada: el estado dice en que punto del camino esta el
  -- papel, y este llego con el camino andado. En CONFIRMADA quedaria en la
  -- bandeja de compras esperando cotizaciones que nunca van a llegar.
  insert into public.solicitudes_pedido
    (numero, titulo, justificacion, prioridad, estado, directa,
     destino, destino_almacen_id, registrada_por, solicitante_id,
     enviada_en, propuesta_en, aprobada_gg_por, aprobada_gg_en,
     firma_de_quien_pide, firma_de_quien_aprueba)
  values
    (private.siguiente_numero('SOL'), trim(p_titulo),
     -- La justificación no admite vacío y la pantalla no la pide.
     coalesce(nullif(trim(coalesce(p_justificacion, '')), ''),
              nullif(trim(coalesce(p_observacion, '')), ''),
              'Compra directa: ya estaba hecha al cargarla'),
     'NORMAL', 'APROBADA', true,
     v_destino, p_destino_almacen_id, v_yo, v_yo,
     now(), now(), v_yo, now(),
     coalesce(p_con_firma, true) and private.tengo_firma_encendida(),
     coalesce(p_con_firma, true) and private.tengo_firma_encendida())
  returning id into v_solicitud;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_linea := v_linea + 1;

    if length(trim(coalesce(v_item->>'descripcion', ''))) < 2 then
      raise exception 'El renglón % no tiene descripción.', v_linea using errcode = '22023';
    end if;

    if coalesce((v_item->>'cantidad')::numeric, 0) <= 0 then
      raise exception 'La cantidad del renglón % debe ser mayor que cero.', v_linea
        using errcode = '22023';
    end if;

    insert into public.solicitud_renglones
      (solicitud_id, linea, articulo_id, descripcion, cantidad, unidad, observacion)
    values
      (v_solicitud, v_linea,
       nullif(v_item->>'articulo_id', '')::bigint,
       trim(v_item->>'descripcion'),
       (v_item->>'cantidad')::numeric,
       coalesce(nullif(v_item->>'unidad', ''), 'UND'),
       nullif(trim(coalesce(v_item->>'observacion', '')), ''));
  end loop;

  insert into public.cotizaciones
    (numero, solicitud_id, proveedor_id, numero_proveedor, fecha, validez_dias,
     dias_entrega, condicion_pago, moneda, tasa, tasa_usd, alicuota_iva,
     descuento, flete, observacion, registrada_por)
  values
    (private.siguiente_numero('COT'), v_solicitud, p_proveedor_id,
     nullif(trim(coalesce(p_numero_factura, '')), ''), v_fecha, 1,
     0, coalesce(p_condicion_pago, 'CONTADO'), p_moneda, v_tasa, v_tasa_usd,
     coalesce(p_alicuota_iva, 16), coalesce(p_descuento, 0), coalesce(p_flete, 0),
     nullif(trim(coalesce(p_observacion, '')), ''), v_yo)
  returning id into v_cotizacion;

  insert into public.cotizacion_renglones
    (cotizacion_id, solicitud_renglon_id, cantidad, precio_unitario, exento_iva,
     marca, presentacion, observacion)
  select v_cotizacion, sr.id,
         (x->>'cantidad')::numeric,
         (x->>'precio_unitario')::numeric,
         coalesce((x->>'exento_iva')::boolean, false),
         nullif(trim(coalesce(x->>'marca', '')), ''),
         nullif(trim(coalesce(x->>'presentacion', '')), ''),
         nullif(trim(coalesce(x->>'observacion', '')), '')
  from jsonb_array_elements(p_renglones) with ordinality as e(x, n)
  join public.solicitud_renglones sr
    on sr.solicitud_id = v_solicitud and sr.linea = n::smallint;

  -- El estado se pone a mano. El de omision, POR_INDICAR_PAGO, no lo admite
  -- `registrar_recepcion`, y en una compra directa el material ya esta aqui.
  -- CONTADO se pago en el acto; lo demas se debe pero puede entrar igual.
  v_estado := case when coalesce(p_condicion_pago, 'CONTADO') = 'CONTADO'
                   then 'PAGADA_POR_RECIBIR' else 'POR_RECIBIR' end;

  insert into public.ordenes_compra
    (numero, solicitud_id, cotizacion_id, proveedor_id, moneda, tasa, tasa_usd,
     subtotal, descuento, flete, iva, total, dias_entrega, entrega_estimada,
     creada_por, aprobada_gg_por, aprobada_gg_en, condicion_pago, estado)
  select private.siguiente_numero('OC'), v_solicitud, c.id, c.proveedor_id,
         c.moneda, c.tasa, c.tasa_usd,
         c.subtotal, c.descuento, c.flete, c.iva, c.total,
         0, v_fecha,
         v_yo, v_yo, now(), c.condicion_pago, v_estado
  from public.cotizaciones c where c.id = v_cotizacion
  returning id into v_orden;

  insert into public.orden_renglones
    (orden_id, linea, articulo_id, descripcion, cantidad, unidad, precio_unitario,
     exento_iva, marca, presentacion)
  select v_orden, sr.linea, sr.articulo_id, sr.descripcion,
         cr.cantidad, sr.unidad, cr.precio_unitario, cr.exento_iva,
         cr.marca, cr.presentacion
  from public.cotizacion_renglones cr
  join public.solicitud_renglones sr on sr.id = cr.solicitud_renglon_id
  where cr.cotizacion_id = v_cotizacion;

  update public.solicitudes_pedido
     set cotizacion_elegida_id = v_cotizacion
   where id = v_solicitud;

  perform private.anotar('SOLICITUD', v_solicitud, null, 'APROBADA',
    'Compra directa: ya estaba hecha al cargarla');

  -- La bitacora anota el estado que la orden TIENE. Antes decia
  -- POR_INDICAR_PAGO, que es el de omision y justo el que esta funcion evita.
  perform private.anotar('ORDEN', v_orden, null, v_estado, p_numero_factura);

  -- Aqui no se recibe: la pantalla cuelga la factura y llama despues a
  -- `registrar_recepcion`, que exige ese papel antes de dejar entrar nada.
  return v_orden;
end;
$function$;

-- public.crear_pedido(p_titulo text, p_justificacion text, p_renglones jsonb, p_prioridad text, p_requerida_para date, p_destino text, p_enviar boolean, p_solicitante_id uuid, p_solicitante_nombre text, p_solicitante_cargo text, p_destino_almacen_id bigint, p_con_firma boolean)
-- venia de: 20260819190000_pedido_con_destino_real.sql
CREATE OR REPLACE FUNCTION public.crear_pedido(p_titulo text, p_justificacion text, p_renglones jsonb, p_prioridad text DEFAULT 'NORMAL'::text, p_requerida_para date DEFAULT NULL::date, p_destino text DEFAULT NULL::text, p_enviar boolean DEFAULT true, p_solicitante_id uuid DEFAULT NULL::uuid, p_solicitante_nombre text DEFAULT NULL::text, p_solicitante_cargo text DEFAULT NULL::text, p_destino_almacen_id bigint DEFAULT NULL::bigint, p_con_firma boolean DEFAULT false)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id      bigint;
  v_sol     record;
  v_destino text := nullif(trim(coalesce(p_destino, '')), '');
  v_nombre  text;
begin
  perform private.exigir_rol('SOLICITANTE', 'COMPRAS', 'OPERACIONES', 'ALMACEN', 'RRHH');

  if length(trim(coalesce(p_titulo, ''))) < 4 then
    raise exception 'Ponle un título al pedido: es lo que se lee en el tablero.' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_justificacion, ''))) < 10 then
    raise exception 'Explica para qué es. Quien aprueba no está en el frente y necesita el porqué.'
      using errcode = '22023';
  end if;

  if p_destino_almacen_id is not null then
    select nombre into v_nombre from public.almacenes where id = p_destino_almacen_id;
    if v_nombre is null then
      raise exception 'No existe el almacén %.', p_destino_almacen_id using errcode = '23503';
    end if;
    v_destino := v_nombre;
  end if;

  select * into v_sol from private.normalizar_solicitante(
    coalesce(p_solicitante_id,
             case when nullif(trim(coalesce(p_solicitante_nombre, '')), '') is null
                  then (select auth.uid()) end),
    p_solicitante_nombre, p_solicitante_cargo);

  insert into public.solicitudes_pedido
    (numero, titulo, justificacion, prioridad, requerida_para, destino,
     destino_almacen_id, estado,
     registrada_por, solicitante_id, solicitante_nombre, solicitante_cargo, enviada_en,
     firma_de_quien_pide)
  values
    (private.siguiente_numero('SOL'), trim(p_titulo), trim(p_justificacion),
     coalesce(p_prioridad, 'NORMAL'), p_requerida_para, v_destino,
     p_destino_almacen_id,
     case when p_enviar then 'PEDIDO' else 'BORRADOR' end,
     (select auth.uid()), v_sol.o_id, v_sol.o_nombre, v_sol.o_cargo,
     case when p_enviar then now() end,
     -- La firma de otro no se estampa: solo cuenta si quien carga es quien pide.
     coalesce(p_con_firma, false)
       and v_sol.o_id is not distinct from (select auth.uid())
       and private.tengo_firma_encendida())
  returning id into v_id;

  perform private.escribir_renglones(v_id, p_renglones);
  perform private.anotar('SOLICITUD', v_id, null,
    case when p_enviar then 'PEDIDO' else 'BORRADOR' end);

  return v_id;
end;
$function$;

-- public.editar_compra_directa(p_orden_id bigint, p_proveedor_id bigint, p_moneda text, p_renglones jsonb, p_titulo text, p_justificacion text, p_numero_factura text, p_fecha date, p_condicion_pago text, p_alicuota_iva numeric, p_descuento numeric, p_flete numeric, p_observacion text)
-- venia de: 20260828100000_compras_directas.sql
CREATE OR REPLACE FUNCTION public.editar_compra_directa(p_orden_id bigint, p_proveedor_id bigint, p_moneda text, p_renglones jsonb, p_titulo text, p_justificacion text DEFAULT NULL::text, p_numero_factura text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date, p_condicion_pago text DEFAULT 'CONTADO'::text, p_alicuota_iva numeric DEFAULT 16, p_descuento numeric DEFAULT 0, p_flete numeric DEFAULT 0, p_observacion text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_solicitud  bigint;
  v_cotizacion bigint;
  v_directa    boolean;
  v_estado     text;
  v_fecha      date := coalesce(p_fecha, current_date);
  v_tasa       numeric;
  v_tasa_usd   numeric;
  v_item       jsonb;
  v_linea      smallint := 0;
begin
  perform private.exigir_accion('COMPRAS.COMPRA_DIRECTA');

  select o.solicitud_id, o.cotizacion_id, o.estado, s.directa
    into v_solicitud, v_cotizacion, v_estado, v_directa
  from public.ordenes_compra o
  join public.solicitudes_pedido s on s.id = o.solicitud_id
  where o.id = p_orden_id;

  if v_solicitud is null then
    raise exception 'No existe esa compra.' using errcode = 'P0002';
  end if;

  if not v_directa then
    raise exception 'Esta orden salió de un pedido con cotizaciones. Se corrige por su camino, no por aquí.'
      using errcode = '55000';
  end if;

  -- No hay tabla `recepciones` — se comprobo contra el catalogo—. Lo recibido
  -- vive en `orden_renglones.cantidad_recibida`.
  if exists (
    select 1 from public.orden_renglones
     where orden_id = p_orden_id and cantidad_recibida > 0
  ) then
    raise exception 'Esta compra ya entró al almacén: sus renglones movieron existencias y costo. Anúlala si está mal.'
      using errcode = '55000';
  end if;

  if exists (
    select 1 from public.instrucciones_pago
    where orden_id = p_orden_id and estado in ('POR_PAGAR', 'PAGADA')
  ) then
    raise exception 'Esta compra ya tiene pagos indicados. Retíralos antes de corregirla.'
      using errcode = '55000';
  end if;

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'Una compra necesita al menos un renglón.' using errcode = '22023';
  end if;

  select t.tasa, t.tasa_usd into v_tasa, v_tasa_usd
  from private.tasas_del_dia(p_moneda::bpchar, v_fecha) t;

  update public.solicitudes_pedido
     set titulo = trim(p_titulo),
         justificacion = coalesce(nullif(trim(coalesce(p_justificacion, '')), ''), justificacion)
   where id = v_solicitud;

  delete from public.solicitud_renglones where solicitud_id = v_solicitud;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_linea := v_linea + 1;
    insert into public.solicitud_renglones
      (solicitud_id, linea, articulo_id, descripcion, cantidad, unidad, observacion)
    values
      (v_solicitud, v_linea,
       nullif(v_item->>'articulo_id', '')::bigint,
       trim(v_item->>'descripcion'),
       (v_item->>'cantidad')::numeric,
       coalesce(nullif(v_item->>'unidad', ''), 'UND'),
       nullif(trim(coalesce(v_item->>'observacion', '')), ''));
  end loop;

  update public.cotizaciones set
    proveedor_id     = p_proveedor_id,
    numero_proveedor = nullif(trim(coalesce(p_numero_factura, '')), ''),
    fecha            = v_fecha,
    condicion_pago   = coalesce(p_condicion_pago, 'CONTADO'),
    moneda           = p_moneda,
    tasa             = v_tasa,
    tasa_usd         = v_tasa_usd,
    alicuota_iva     = coalesce(p_alicuota_iva, 16),
    descuento        = coalesce(p_descuento, 0),
    flete            = coalesce(p_flete, 0),
    observacion      = nullif(trim(coalesce(p_observacion, '')), '')
  where id = v_cotizacion;

  delete from public.cotizacion_renglones where cotizacion_id = v_cotizacion;

  insert into public.cotizacion_renglones
    (cotizacion_id, solicitud_renglon_id, cantidad, precio_unitario, exento_iva,
     marca, presentacion, observacion)
  select v_cotizacion, sr.id,
         (x->>'cantidad')::numeric,
         (x->>'precio_unitario')::numeric,
         coalesce((x->>'exento_iva')::boolean, false),
         nullif(trim(coalesce(x->>'marca', '')), ''),
         nullif(trim(coalesce(x->>'presentacion', '')), ''),
         nullif(trim(coalesce(x->>'observacion', '')), '')
  from jsonb_array_elements(p_renglones) with ordinality as e(x, n)
  join public.solicitud_renglones sr
    on sr.solicitud_id = v_solicitud and sr.linea = n::smallint;

  update public.ordenes_compra o set
    proveedor_id = c.proveedor_id,
    moneda = c.moneda, tasa = c.tasa, tasa_usd = c.tasa_usd,
    subtotal = c.subtotal, descuento = c.descuento, flete = c.flete,
    iva = c.iva, total = c.total, condicion_pago = c.condicion_pago
  from public.cotizaciones c
  where o.id = p_orden_id and c.id = v_cotizacion;

  delete from public.orden_renglones where orden_id = p_orden_id;

  insert into public.orden_renglones
    (orden_id, linea, articulo_id, descripcion, cantidad, unidad, precio_unitario,
     exento_iva, marca, presentacion)
  select p_orden_id, sr.linea, sr.articulo_id, sr.descripcion,
         cr.cantidad, sr.unidad, cr.precio_unitario, cr.exento_iva,
         cr.marca, cr.presentacion
  from public.cotizacion_renglones cr
  join public.solicitud_renglones sr on sr.id = cr.solicitud_renglon_id
  where cr.cotizacion_id = v_cotizacion;

  perform private.anotar('ORDEN', p_orden_id, v_estado, v_estado, 'Se corrigió la compra directa');

  return p_orden_id;
end;
$function$;
