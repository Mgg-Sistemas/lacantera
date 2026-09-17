/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  15 funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
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
  viva —no normalizado, no perdonando comentarios— y los 15 coinciden. Y el
  detector, que antes marcaba estas 15, pasa a cero.

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

-- private.cargar_renglones_venta(p_tabla text, p_columna text, p_id bigint, p_renglones jsonb, p_moneda character, p_fecha date)
-- venia de: 20260916160000_cada_renglon_de_venta_dice_su_precio_y_su_medida.sql
CREATE OR REPLACE FUNCTION private.cargar_renglones_venta(p_tabla text, p_columna text, p_id bigint, p_renglones jsonb, p_moneda character, p_fecha date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_item       jsonb;
  v_linea      smallint := 0;
  v_articulo   record;
  v_unidad     text;
  v_cantidad   numeric;
  v_lista      numeric;
  v_condicion  text;
  v_pct        numeric;
  v_rebaja     numeric;
  v_precio     numeric;
  v_motivo     text;
  v_inventario numeric;
  v_medida     text;
  v_densidad   numeric;
  v_nota       boolean := p_tabla = 'nota_entrega_renglones';
begin
  if p_tabla not in ('cotizacion_venta_renglones', 'nota_entrega_renglones') then
    raise exception 'Los renglones de % no se cargan por aquí.', p_tabla using errcode = '22023';
  end if;

  if p_renglones is null or jsonb_array_length(p_renglones) = 0 then
    raise exception 'Un documento sin renglones no dice nada. Agrega al menos uno.'
      using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_linea := v_linea + 1;

    select a.id, a.nombre, a.unidad, a.activo, a.inventariable, a.densidad_ton_m3
      into v_articulo
    from public.articulos a
    where a.id = (v_item ->> 'articulo_id')::bigint;

    if v_articulo.id is null then
      raise exception 'El renglón % apunta a un artículo que no existe.', v_linea
        using errcode = 'P0002';
    end if;

    if not v_articulo.activo then
      raise exception 'El artículo "%" está dado de baja y no se puede vender.',
        v_articulo.nombre using errcode = '22023';
    end if;

    v_cantidad := coalesce((v_item ->> 'cantidad')::numeric, 0);

    if v_cantidad <= 0 then
      raise exception 'La cantidad de "%" tiene que ser mayor que cero.', v_articulo.nombre
        using errcode = '22023';
    end if;

    -- LA UNIDAD EN QUE SE VENDE. La del artículo, o la otra entre metros cúbicos
    -- y toneladas si hay densidad para convertir.
    v_unidad := coalesce(nullif(btrim(coalesce(v_item ->> 'unidad', '')), ''), v_articulo.unidad);

    if v_unidad <> v_articulo.unidad then
      if not (v_articulo.unidad in ('M3', 'TON') and v_unidad in ('M3', 'TON')) then
        raise exception '«%» se lleva en % y no se vende por %.',
          v_articulo.nombre, v_articulo.unidad, v_unidad using errcode = '22023';
      end if;
      if v_articulo.densidad_ton_m3 is null then
        raise exception '«%» no tiene densidad: sin ella no se sabe cuánto sale del patio por cada %.',
          v_articulo.nombre, v_unidad
          using errcode = '22023', hint = 'Pónsela en Inventario › Catálogo de artículos.';
      end if;
    end if;

    /*
      EL PRECIO SALE DE SU CONDICIÓN, y la regla vive en
      `private.precio_por_condicion`: la usa también el pago de una compra con
      material, que toma el material al precio de venta. La falta de condición
      se dice aquí, que es donde se sabe el número del renglón.
    */
    if nullif(btrim(coalesce(v_item ->> 'condicion', '')), '') is null then
      raise exception 'El renglón % («%») no dice a qué precio sale: de lista, con descuento, sin cargo o acordado.',
        v_linea, v_articulo.nombre
        using errcode = '22023',
              hint = 'Si el formulario no lo pregunta, recarga la página: es de antes de este cambio.';
    end if;

    select c.precio, c.precio_lista, c.descuento_pct, c.descuento_unitario, c.condicion, c.motivo
      into v_precio, v_lista, v_pct, v_rebaja, v_condicion, v_motivo
      from private.precio_por_condicion(
             v_articulo.id, v_unidad, v_item ->> 'condicion',
             nullif(v_item ->> 'descuento_pct', '')::numeric,
             nullif(v_item ->> 'descuento_unitario', '')::numeric,
             nullif(v_item ->> 'precio_unitario', '')::numeric,
             v_item ->> 'motivo_condicion', p_moneda, p_fecha) c;

    /*
      LO QUE SALE DEL PATIO. Solo en la nota, que es la que mueve material, y
      solo en lo inventariable: un flete no sale de ningún patio. Si se vende en
      la otra unidad, se convierte con la densidad y queda escrito que es
      estimado; si el camión se pesó, `despachar` lo cambia después por lo que
      dijo la romana.
    */
    v_inventario := null;
    v_medida := null;
    v_densidad := null;

    if v_nota and v_articulo.inventariable then
      if v_unidad = v_articulo.unidad then
        v_inventario := v_cantidad;
        v_medida := 'DIRECTA';
      else
        v_densidad := v_articulo.densidad_ton_m3;
        v_inventario := case when v_unidad = 'TON'
                             then round(v_cantidad / v_densidad, 4)
                             else round(v_cantidad * v_densidad, 4)
                        end;
        v_medida := 'ESTIMADA';
        if v_inventario <= 0 then
          raise exception '% % de «%» no llega a mover el patio.',
            private.cantidad_es(v_cantidad), v_unidad, v_articulo.nombre using errcode = '22023';
        end if;
      end if;
    end if;

    if v_nota then
      insert into public.nota_entrega_renglones
        (nota_id, linea, articulo_id, descripcion, cantidad, unidad, precio_unitario, exento_iva,
         condicion, precio_lista, descuento_pct, descuento_unitario, motivo_condicion,
         cantidad_inventario, medida, densidad_usada)
      values
        (p_id, v_linea, v_articulo.id,
         coalesce(nullif(trim(coalesce(v_item ->> 'descripcion', '')), ''), v_articulo.nombre),
         v_cantidad, v_unidad, v_precio,
         coalesce((v_item ->> 'exento_iva')::boolean, false),
         v_condicion, v_lista, v_pct, v_rebaja, v_motivo,
         v_inventario, v_medida, v_densidad);
    else
      insert into public.cotizacion_venta_renglones
        (cotizacion_id, linea, articulo_id, descripcion, cantidad, unidad, precio_unitario, exento_iva,
         condicion, precio_lista, descuento_pct, descuento_unitario, motivo_condicion)
      values
        (p_id, v_linea, v_articulo.id,
         coalesce(nullif(trim(coalesce(v_item ->> 'descripcion', '')), ''), v_articulo.nombre),
         v_cantidad, v_unidad, v_precio,
         coalesce((v_item ->> 'exento_iva')::boolean, false),
         v_condicion, v_lista, v_pct, v_rebaja, v_motivo);
    end if;
  end loop;

  return v_linea;
end;
$function$;

-- private.validar_metodo_pago()
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION private.validar_metodo_pago()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_m       public.metodos_pago%rowtype;
  v_campo   text;
  v_valor   text;
  v_faltan  text[] := '{}';
begin
  select * into v_m from public.metodos_pago where codigo = new.metodo;

  if not found then
    raise exception 'El metodo de pago "%" no existe en el catalogo.', new.metodo
      using errcode = '23503';
  end if;

  if not v_m.activo then
    raise exception 'El metodo "%" ya no esta en uso.', v_m.nombre using errcode = '55000';
  end if;

  -- Pagar con material o con un saldo a favor tiene su propio camino, que
  -- enciende esta marca. Solo se mira cuando el método se pone, no cuando la
  -- instrucción cambia de estado.
  if not v_m.mueve_dinero
     and (tg_op = 'INSERT' or new.metodo is distinct from old.metodo)
     and coalesce(current_setting('lacantera.pago_sin_dinero', true), '') is distinct from v_m.codigo then
    raise exception '«%» no se indica como un pago en dinero: tiene su propio botón en la orden.', v_m.nombre
      using errcode = '22023';
  end if;

  if v_m.moneda_regla = 'SOLO_VES' and new.moneda <> 'VES' then
    raise exception '% solo funciona en bolivares.', v_m.nombre using errcode = '22023';
  end if;

  if v_m.moneda_regla = 'NUNCA_VES' and new.moneda = 'VES' then
    raise exception '% no funciona en bolivares.', v_m.nombre using errcode = '22023';
  end if;

  foreach v_campo in array v_m.campos_exigidos loop
    execute format('select ($1).%I::text', v_campo) into v_valor using new;
    if v_valor is null or btrim(v_valor) = '' then
      v_faltan := v_faltan || v_campo;
    end if;
  end loop;

  if array_length(v_faltan, 1) > 0 then
    raise exception 'Para pagar por % faltan estos datos: %.',
      v_m.nombre, array_to_string(v_faltan, ', ') using errcode = '23514';
  end if;

  if new.estado = 'PAGADA' and v_m.exige_comprobante
     and (new.referencia is null or btrim(new.referencia) = '') then
    raise exception 'Un pago por % necesita su referencia para darse por ejecutado.', v_m.nombre
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

-- public.borrar_clase_de_salida(p_codigo text)
-- venia de: 20260916111000_los_cuerpos_que_de_verdad_corren_tras_la_solicitud_sin_razon.sql
CREATE OR REPLACE FUNCTION public.borrar_clase_de_salida(p_codigo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.exigir_permiso('INVENTARIO', 'TOTAL');

  if p_codigo in ('ENTREGA_POR_SOLICITUD', 'ENTREGA_POR_INTERCAMBIO') then
    raise exception 'Esa razón la pone el sistema al entregar una solicitud o un pago con material: no se apaga.' using errcode = '22023';
  end if;

  -- No se borra: se apaga. Una salida de hace tres meses la nombra, y borrarla
  -- dejaría esa salida sin poder decir por qué se hizo.
  update public.clases_de_salida set activa = false where codigo = p_codigo;

  if not found then
    raise exception 'No existe la clase "%".', p_codigo using errcode = 'P0002';
  end if;
end;
$function$;

-- public.cambiar_metodo_de_pago(p_instruccion_id bigint, p_metodo text, p_datos jsonb, p_motivo text)
-- venia de: 20260826150000_cambiar_el_metodo_de_pago_con_su_razon.sql
CREATE OR REPLACE FUNCTION public.cambiar_metodo_de_pago(p_instruccion_id bigint, p_metodo text, p_datos jsonb, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_estado     text;
  v_metodo     text;
  v_orden      bigint;
  v_solicitud  bigint;
  v_numero     text;
  v_antes      text;
  v_despues    text;
  v_cuenta     text;
begin
  perform private.exigir_accion('COMPRAS.CAMBIAR_METODO_PAGO');

  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Hay que decir por qué se cambia el método de pago.'
      using errcode = '23514';
  end if;

  select i.estado, i.metodo, i.orden_id
    into v_estado, v_metodo, v_orden
  from public.instrucciones_pago i where i.id = p_instruccion_id;

  if v_estado is null then
    raise exception 'No existe esa instrucción de pago.' using errcode = 'P0002';
  end if;

  /*
    Solo mientras esté por pagar.

    Una instrucción ya pagada tiene un movimiento de dinero detrás con su
    referencia: cambiarle el método por donde no salió el dinero deja el libro
    diciendo una cosa y el banco otra. Y una anulada o devuelta ya no va a
    pagarse por ningún método.
  */
  if v_estado <> 'POR_PAGAR' then
    raise exception 'Esta instrucción está en «%» y ya no admite cambio de método.', v_estado
      using errcode = '55000';
  end if;

  if exists (select 1 from public.metodos_pago m where m.codigo = v_metodo and not m.mueve_dinero) then
    raise exception 'Un pago con material no cambia de método: devuélvelo y vuelve a indicar el pago.'
      using errcode = '55000';
  end if;

  update public.instrucciones_pago set
    metodo         = p_metodo,
    banco          = nullif(btrim(coalesce(p_datos->>'banco', '')), ''),
    numero_cuenta  = nullif(btrim(coalesce(p_datos->>'numero_cuenta', '')), ''),
    titular        = nullif(btrim(coalesce(p_datos->>'titular', '')), ''),
    documento      = nullif(btrim(coalesce(p_datos->>'documento', '')), ''),
    telefono       = nullif(btrim(coalesce(p_datos->>'telefono', '')), ''),
    correo_binance = nullif(btrim(coalesce(p_datos->>'correo_binance', '')), ''),
    red_cripto     = nullif(btrim(coalesce(p_datos->>'red_cripto', '')), ''),
    receptor       = nullif(btrim(coalesce(p_datos->>'receptor', '')), '')
  where id = p_instruccion_id;

  -- El disparador `trg_validar_metodo_pago` ya comprobó, dentro del UPDATE, que
  -- el método existe, que está en uso, que admite esta moneda y que no le falta
  -- ningún dato. No hay nada que repetir aquí.

  select m.nombre into v_antes from public.metodos_pago m where m.codigo = v_metodo;
  select m.nombre into v_despues from public.metodos_pago m where m.codigo = p_metodo;

  select o.solicitud_id, s.numero into v_solicitud, v_numero
  from public.ordenes_compra o
  join public.solicitudes_pedido s on s.id = o.solicitud_id
  where o.id = v_orden;

  /*
    Cuando el método es el mismo, lo que cambió es la cuenta.

    Decir «Transferencia → Transferencia» no informa de nada y esconde el caso
    más frecuente de todos: el proveedor mandó otra seña.
  */
  v_cuenta := case
    when v_metodo is distinct from p_metodo
      then format('%s → %s', coalesce(v_antes, v_metodo), coalesce(v_despues, p_metodo))
    else format('%s: otros datos', coalesce(v_despues, p_metodo))
  end;

  -- «POR_PAGAR» a «POR_PAGAR» a propósito: la instrucción no se movió de sitio.
  -- `private.anotar` no avisa de ese estado, y el aviso se manda aquí abajo con
  -- las palabras que corresponden a esto y no a un cambio de estado.
  perform private.anotar('PAGO', p_instruccion_id, 'POR_PAGAR', 'POR_PAGAR',
    format('Método de pago — %s. %s', v_cuenta, btrim(p_motivo)));

  perform private.notificar(
    'COMPRAS', 'COMPRA_METODO_PAGO_CAMBIADO',
    'Cambió el método de pago de una orden',
    format('%s · %s — «%s»', coalesce(v_numero, 'Orden ' || v_orden), v_cuenta, btrim(p_motivo)),
    '/app/compras/' || v_solicitud, array['COMPRAS'], 'ATENCION');
end;
$function$;

-- public.cancelar_orden(p_orden_id bigint, p_motivo text)
-- venia de: 20260819300000_una_compra_muerta_no_deja_material_dentro.sql
CREATE OR REPLACE FUNCTION public.cancelar_orden(p_orden_id bigint, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_estado text;
  v_revs   integer;
begin
  perform private.exigir_rol('COMPRAS', 'GERENTE_GENERAL');

  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo de la cancelación.' using errcode = '22023';
  end if;

  select estado into v_estado from public.ordenes_compra where id = p_orden_id;

  if v_estado is null then
    raise exception 'No existe la orden %.', p_orden_id using errcode = 'P0002';
  end if;

  if v_estado not in ('POR_RECIBIR', 'POR_INDICAR_PAGO', 'EN_TESORERIA') then
    raise exception 'Una orden en "%" ya no se cancela. Si ya se pagó y el proveedor no entregó, márcala como desistida.', v_estado
      using errcode = '55000';
  end if;

  /*
    SI YA SALIÓ MATERIAL COMO PAGO, O SE APLICÓ UN SALDO A FAVOR, NO SE CANCELA.
    El proveedor tiene ese material, o el saldo ya se gastó en ella.
  */
  if exists (select 1
               from public.instrucciones_pago i
               left join public.pagos_con_material m on m.instruccion_id = i.id
               left join public.solicitudes_salida s on s.id = m.solicitud_id
              where i.orden_id = p_orden_id and i.estado = 'PAGADA'
                and (i.metodo = 'SALDO_A_FAVOR' or (i.metodo = 'INTERCAMBIO' and s.estado = 'ENTREGADA'))) then
    raise exception 'De esta orden ya salió material como pago, o se le aplicó un saldo a favor: cancelarla dejaría ese pago sin compra detrás.'
      using errcode = '55000',
            hint = 'Si el proveedor no va a cumplir, lo que se le entregó se acuerda con él y se registra aparte.';
  end if;

  -- La salida sigue a la compra: lo que no ha salido, no sale.
  perform private.soltar_salidas_de_orden(p_orden_id, format('Se canceló la orden de compra: %s', trim(p_motivo)));

  -- Lo que haya entrado por esta orden sale. Cancelar es decir que la compra
  -- no ocurrio, y una compra que no ocurrio no deja material en el almacen.
  v_revs := private.reversar_entradas_de_orden(
    p_orden_id, format('Compra cancelada: %s', trim(p_motivo)));

  update public.instrucciones_pago
     set estado = 'ANULADA'
   where orden_id = p_orden_id and estado = 'POR_PAGAR';

  update public.ordenes_compra
     set estado = 'CANCELADA', motivo_cancelacion = trim(p_motivo), cancelada_en = now()
   where id = p_orden_id;

  perform private.anotar('ORDEN', p_orden_id, v_estado, 'CANCELADA',
    case when v_revs > 0
         then format('%s. Se devolvieron %s entrada(s) de inventario.', trim(p_motivo), v_revs)
         else trim(p_motivo) end);
end;
$function$;

-- public.cancelar_solicitud_salida(p_id bigint, p_motivo text)
-- venia de: 20260916191000_los_cuerpos_que_de_verdad_corren_con_permisos_restringidos.sql
CREATE OR REPLACE FUNCTION public.cancelar_solicitud_salida(p_id bigint, p_motivo text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_s public.solicitudes_salida;
begin
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Di por qué se cancela: queda escrito y no se puede editar.' using errcode = '22023';
  end if;

  select * into v_s from public.solicitudes_salida where id = p_id for update;
  if v_s.id is null then
    raise exception 'No existe la solicitud %.', p_id using errcode = 'P0002';
  end if;
  if v_s.estado not in ('PEDIDA', 'APROBADA') then
    raise exception 'La solicitud % ya está %: no se puede cancelar.', v_s.numero, lower(v_s.estado)
      using errcode = '55000';
  end if;

  if v_s.pedida_por is distinct from (select auth.uid())
     and private.como_aprueba_salida(v_s.almacen_id) is null then
    raise exception 'La cancela quien la pidió, o quien puede aprobarla.'
      using errcode = '42501';
  end if;

  update public.solicitudes_salida
     set estado = 'CANCELADA', cierre_motivo = btrim(p_motivo)
   where id = p_id;

  if v_s.instruccion_pago_id is not null then
    perform private.devolver_pago_con_material(v_s.instruccion_pago_id,
      format('Se canceló la salida %s: %s', v_s.numero, btrim(p_motivo)));
  end if;

  return p_id;
end;
$function$;

-- public.clases_de_salida(p_incluir_apagadas boolean)
-- venia de: 20260916111000_los_cuerpos_que_de_verdad_corren_tras_la_solicitud_sin_razon.sql
CREATE OR REPLACE FUNCTION public.clases_de_salida(p_incluir_apagadas boolean DEFAULT false)
 RETURNS SETOF clases_de_salida
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.clases_de_salida
   where tipo <> 'SALIDA_BAJA'
     and codigo not in ('ENTREGA_POR_SOLICITUD', 'ENTREGA_POR_INTERCAMBIO')
     and (activa or coalesce(p_incluir_apagadas, false))
   order by orden, nombre;
$function$;

-- public.entregar_solicitud_salida(p_id bigint)
-- venia de: 20260916111000_los_cuerpos_que_de_verdad_corren_tras_la_solicitud_sin_razon.sql
CREATE OR REPLACE FUNCTION public.entregar_solicitud_salida(p_id bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_s         public.solicitudes_salida;
  v_alm       public.almacenes;
  v_renglones jsonb;
  v_nota      text;
begin
  perform private.exigir_permiso('SALIDAS', 'ESCRITURA');

  select * into v_s from public.solicitudes_salida where id = p_id for update;
  if v_s.id is null then
    raise exception 'No existe la solicitud %.', p_id using errcode = 'P0002';
  end if;
  if v_s.estado <> 'APROBADA' then
    raise exception 'La solicitud % no se puede entregar: está %.', v_s.numero, lower(v_s.estado)
      using errcode = '55000';
  end if;

  select * into v_alm from public.almacenes where id = v_s.almacen_id;

  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'almacen_id',     v_s.almacen_id::text,
           'articulo_id',    r.articulo_id::text,
           'cantidad',       coalesce(r.suelto, r.cantidad)::text,
           'presentaciones', r.presentaciones::text,
           'presentacion',   r.presentacion,
           'propietario',    r.propietario)))
    into v_renglones
    from public.solicitud_salida_renglones r
   where r.solicitud_id = p_id;

  perform set_config('lacantera.entregando_solicitud', v_s.numero, true);

  v_nota := public.registrar_salidas(
    p_almacen_id  => v_s.almacen_id,
    p_renglones   => v_renglones,
    p_motivo      => format('Solicitud %s. Para: %s', v_s.numero, v_s.motivo),
    p_tipo        => v_s.clase,
    p_grupo_id    => v_s.grupo_id,
    p_externo     => v_s.destino_externo,
    p_responsable => v_s.responsable_externo);

  -- Y se retira en cuanto sale: nada más en esta transacción la hereda.
  perform set_config('lacantera.entregando_solicitud', '', true);

  update public.solicitudes_salida
     set estado = 'ENTREGADA',
         entregada_por = (select auth.uid()), entregada_en = now(),
         nota_salida = v_nota
   where id = p_id;

  -- Si la salida paga una compra con material, su pago se cierra aquí.
  if v_s.instruccion_pago_id is not null then
    perform private.material_entregado(v_s.instruccion_pago_id, v_nota);
  end if;

  perform private.notificar(
    'SALIDAS', 'SALIDA_ENTREGADA',
    format('%s: entregada con la nota %s', v_s.numero, v_nota),
    format('Salió de %s.', v_alm.nombre),
    '/app/salidas/solicitudes', array['ALMACEN'], 'INFO');

  return v_nota;
end;
$function$;

-- public.guardar_clase_de_salida(p_codigo text, p_nombre text, p_pista text, p_tipo text, p_causa_baja text, p_orden smallint, p_exige_detalle boolean, p_activa boolean)
-- venia de: 20260916181000_los_cuerpos_que_de_verdad_corren_con_la_palabra_de_venta.sql
CREATE OR REPLACE FUNCTION public.guardar_clase_de_salida(p_codigo text DEFAULT NULL::text, p_nombre text DEFAULT NULL::text, p_pista text DEFAULT NULL::text, p_tipo text DEFAULT 'SALIDA_CONSUMO'::text, p_causa_baja text DEFAULT NULL::text, p_orden smallint DEFAULT NULL::smallint, p_exige_detalle boolean DEFAULT false, p_activa boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_codigo text;
  v_nombre text := btrim(coalesce(p_nombre, ''));
begin
  perform private.exigir_permiso('INVENTARIO', 'ESCRITURA');

  -- Las razones que daban el material por perdido se quitaron el 15/09/2026.
  if p_tipo = 'SALIDA_BAJA'
     or nullif(btrim(coalesce(p_causa_baja, '')), '') is not null
     or exists (select 1 from public.clases_de_salida c
                 where c.codigo = p_codigo and c.tipo = 'SALIDA_BAJA') then
    raise exception 'Esa razón ya no se puede usar.' using errcode = '22023';
  end if;

  if p_codigo in ('ENTREGA_POR_SOLICITUD', 'ENTREGA_POR_INTERCAMBIO') or p_tipo = 'SALIDA_INTERCAMBIO' then
    raise exception 'Esa razón la pone el sistema al entregar una solicitud o un pago con material: no se edita.' using errcode = '22023';
  end if;

  /*
    UNA VENTA NO ES UNA RAZÓN DE SALIDA. Sale por Facturación, con cliente,
    precio y número, y una salida de almacén no sabe nada de eso. La razón VENTA
    se apagó una vez y se volvió a encender desde esta misma lista: por eso ya no
    se deja ni crear ni editar una que nombre una venta.
  */
  if private.nombra_una_venta(coalesce(p_codigo, '') || ' ' || v_nombre, true) then
    raise exception 'La razón dice «%», y una venta no es una razón de salida: se registra en Facturación › Notas de entrega, con cliente, precio y su número.',
      lower(private.palabra_de_venta(coalesce(p_codigo, '') || ' ' || v_nombre, true)) using errcode = '22023';
  end if;

  if length(v_nombre) < 3 then
    raise exception 'La clase necesita un nombre.' using errcode = '22023';
  end if;

  if p_codigo is null then
    v_codigo := private.codigo_desde_nombre(v_nombre);
    if exists (select 1 from public.clases_de_salida c where c.codigo = v_codigo) then
      raise exception 'Ya hay una clase que se llama así.' using errcode = '23505';
    end if;

    insert into public.clases_de_salida
      (codigo, nombre, pista, tipo, causa_baja, orden, exige_detalle, activa)
    values
      (v_codigo, v_nombre, nullif(btrim(coalesce(p_pista, '')), ''),
       p_tipo, nullif(btrim(coalesce(p_causa_baja, '')), ''),
       coalesce(p_orden, 100::smallint), coalesce(p_exige_detalle, false),
       coalesce(p_activa, true));

    return v_codigo;
  end if;

  if not exists (select 1 from public.clases_de_salida c where c.codigo = p_codigo) then
    raise exception 'No existe la clase "%".', p_codigo using errcode = 'P0002';
  end if;

  -- El nombre y la pista se corrigen; a dónde va NO se toca al editar. Recolgar
  -- «se usó trabajando» a una baja cambiaría informes ya emitidos, y quien lo
  -- hiciera no tendría forma de saberlo.
  update public.clases_de_salida
     set nombre = v_nombre,
         pista = nullif(btrim(coalesce(p_pista, '')), ''),
         orden = coalesce(p_orden, orden),
         exige_detalle = coalesce(p_exige_detalle, exige_detalle),
         activa = coalesce(p_activa, true)
   where codigo = p_codigo;

  return p_codigo;
end;
$function$;

-- public.historial_articulo(p_articulo_id bigint, p_limite integer)
-- venia de: 20260915231000_los_cuerpos_que_de_verdad_corren_sin_bajas.sql
CREATE OR REPLACE FUNCTION public.historial_articulo(p_articulo_id bigint, p_limite integer DEFAULT 200)
 RETURNS TABLE(cuando timestamp with time zone, fecha date, clase text, titulo text, detalle text, cantidad numeric, unidad text, signo smallint, valor_usd numeric, lugar text, persona text, quien text, documento text, ruta text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.exigir_permiso('INVENTARIO', 'LECTURA');

  return query
  select * from (
    select a.creado_en as cuando, a.creado_en::date as fecha, 'ALTA'::text as clase,
           'Se creó en el catálogo'::text as titulo,
           a.categoria || ' · ' || a.unidad as detalle,
           null::numeric as cantidad, null::text as unidad, 0::smallint as signo,
           null::numeric as valor_usd, null::text as lugar, null::text as persona,
           coalesce(p.nombre, p.usuario) as quien,
           a.codigo as documento, '/app/inventario/articulos'::text as ruta
      from public.articulos a
      left join public.perfiles p on p.id = a.creado_por
     where a.id = p_articulo_id

    union all

    select m.registrado_en, m.fecha, m.tipo,
           case m.tipo
             when 'ENTRADA_COMPRA'        then 'Entró por una compra'
             when 'ENTRADA_PRODUCCION'    then 'Entró por producción'
             when 'ENTRADA_DEVOLUCION'    then 'Volvió al almacén'
             when 'ENTRADA_DIRECTA'       then 'Entró sin compra de por medio'
             when 'SALIDA_CONSUMO'        then 'Salió para consumo'
             when 'SALIDA_DESPACHO'       then 'Salió en un despacho'
             when 'SALIDA_INTERCAMBIO'    then 'Salió como pago de una compra'
             when 'SALIDA_MERMA'          then 'Se perdió en el manejo'
             when 'SALIDA_BAJA'           then 'Salió'
             when 'AJUSTE_POSITIVO'       then 'Ajuste: sobraba'
             when 'AJUSTE_NEGATIVO'       then 'Ajuste: faltaba'
             when 'TRANSFERENCIA_SALIDA'  then 'Se trasladó a otro almacén'
             when 'TRANSFERENCIA_ENTRADA' then 'Llegó de otro almacén'
             when 'REVERSO'               then 'Se deshizo un movimiento'
             else m.tipo
           end
            -- El motivo, con las mismas palabras que el libro y el papel.
            || coalesce(' · ' || coalesce(m.razon_salida,
                 (select case b.causa when 'DANADO'     then 'Dañado'
                                      when 'OBSOLETO'   then 'Obsoleto'
                                      when 'VENCIDO'    then 'Vencido'
                                      when 'EXTRAVIADO' then 'Extraviado'
                                      when 'ROBADO'     then 'Robado'
                                      else b.causa end
                    from public.inventario_bajas b
                   where b.movimiento_id = m.id
                   limit 1)), ''),
           m.nota, m.cantidad, m.unidad, m.signo::smallint, m.valor_usd,
           al.nombre,
           case when e.id is not null then e.nombres || ' ' || e.apellidos end,
           coalesce(pf.nombre, pf.usuario),
           coalesce(m.nota_salida, m.numero), '/app/inventario/movimientos'
      from public.inventario_movimientos m
      join public.almacenes al on al.id = m.almacen_id
      left join public.perfiles  pf on pf.id = m.registrado_por
      left join public.empleados e  on e.id  = m.empleado_id
     where m.articulo_id = p_articulo_id

    union all

    select g.creado_en, g.fecha_entrega, 'ENTREGA'::text,
           case g.clase when 'DOTACION' then 'Se entregó como dotación'
                        else 'Se asignó para una actividad' end,
           g.nota, g.cantidad, null::text, (-1)::smallint, g.costo_usd,
           al.nombre, e.nombres || ' ' || e.apellidos,
           coalesce(pf.nombre, pf.usuario),
           g.numero, '/app/inventario/articulos'
      from public.asignaciones_herramienta g
      join public.almacenes al on al.id = g.almacen_id
      join public.empleados e  on e.id  = g.empleado_id
      left join public.perfiles pf on pf.id = g.entregado_por
     where g.articulo_id = p_articulo_id

    union all

    select g.fecha_devolucion::timestamptz, g.fecha_devolucion, 'DEVOLUCION'::text,
           'La devolvió'::text,
           g.nota, g.cantidad, null::text, 1::smallint, null::numeric,
           al.nombre, e.nombres || ' ' || e.apellidos, null::text,
           g.numero, '/app/inventario/articulos'
      from public.asignaciones_herramienta g
      join public.almacenes al on al.id = g.almacen_id
      join public.empleados e  on e.id  = g.empleado_id
     where g.articulo_id = p_articulo_id
       and g.fecha_devolucion is not null

    union all

    select g.fecha_perdida::timestamptz, g.fecha_perdida, g.estado,
           case g.estado when 'PERDIDA' then 'Se dio por perdida'
                         when 'DANADA'  then 'Se reportó dañada'
                         else 'Incidencia' end,
           g.motivo, g.cantidad, null::text, 0::smallint, g.costo_usd,
           al.nombre, e.nombres || ' ' || e.apellidos, null::text,
           g.numero, '/app/inventario/articulos'
      from public.asignaciones_herramienta g
      join public.almacenes al on al.id = g.almacen_id
      join public.empleados e  on e.id  = g.empleado_id
     where g.articulo_id = p_articulo_id
       and g.fecha_perdida is not null
       and g.estado in ('PERDIDA', 'DANADA', 'REPUESTA')

    union all

    select g.saldado_el::timestamptz, g.saldado_el, 'REPUESTA'::text,
           case g.saldado_como
             when 'DESCUENTO'  then 'Se saldó con descuento de nómina'
             when 'REPOSICION' then 'La repuso'
             when 'EXONERADO'  then 'Se le exoneró'
             else 'Se saldó' end,
           g.motivo, g.cantidad, null::text, 0::smallint, null::numeric,
           al.nombre, e.nombres || ' ' || e.apellidos, null::text,
           g.numero, '/app/inventario/articulos'
      from public.asignaciones_herramienta g
      join public.almacenes al on al.id = g.almacen_id
      join public.empleados e  on e.id  = g.empleado_id
     where g.articulo_id = p_articulo_id
       and g.saldado_el is not null

    union all

    select o.registrado_en, o.fecha, 'TALLER'::text,
           format('Se mandó al taller · %s', lower(o.tipo)),
           concat_ws(' · ', o.motivo, nullif(esp.nombre, ''),
             case when o.urgencia is not null then 'urgencia ' || lower(o.urgencia) end),
           o.cantidad, null::text, (-1)::smallint, null::numeric,
           t.nombre, null::text, coalesce(p.nombre, p.usuario),
           o.numero, '/app/inventario/talleres'
      from public.mantenimientos o
      left join public.almacenes t on t.id = o.taller_id
      left join public.especialidades_taller esp on esp.codigo = o.especialidad
      left join public.perfiles p on p.id = o.registrado_por
     where o.articulo_id = p_articulo_id

    union all

    select coalesce(o.cerrado_en, o.fecha_salida::timestamptz),
           coalesce(o.fecha_salida, o.cerrado_en::date), 'TALLER'::text,
           'Volvió del taller'::text,
           concat_ws(' · ', nullif(o.detalle, ''),
             case when o.cantidad_devuelta is not null and o.cantidad is not null
                       and o.cantidad_devuelta < o.cantidad
                  then format('faltaron %s', o.cantidad - o.cantidad_devuelta) end),
           coalesce(o.cantidad_devuelta, o.cantidad), null::text, 1::smallint,
           coalesce(o.costo_usd, 0) + coalesce(o.costo_repuestos_usd, 0),
           t.nombre, null::text, coalesce(p.nombre, p.usuario),
           o.numero, '/app/inventario/talleres'
      from public.mantenimientos o
      left join public.almacenes t on t.id = o.taller_id
      left join public.perfiles p on p.id = o.cerrado_por
     where o.articulo_id = p_articulo_id
       and o.estado = 'CERRADO'
       and coalesce(o.cerrado_en, o.fecha_salida::timestamptz) is not null
  ) h
  order by h.cuando desc nulls last
  limit coalesce(p_limite, 200);
end;
$function$;

-- public.marcar_desistimiento(p_orden_id bigint, p_motivo text, p_material_devuelto boolean)
-- venia de: 20260819300000_una_compra_muerta_no_deja_material_dentro.sql
CREATE OR REPLACE FUNCTION public.marcar_desistimiento(p_orden_id bigint, p_motivo text, p_material_devuelto boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_estado text;
  v_revs   integer := 0;
begin
  perform private.exigir_rol('COMPRAS', 'GERENTE_GENERAL');

  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Describe qué pasó con el proveedor.' using errcode = '22023';
  end if;

  select estado into v_estado from public.ordenes_compra where id = p_orden_id;

  if v_estado not in ('PAGADA_POR_RECIBIR', 'RECIBIDA_PARCIAL', 'EN_TESORERIA') then
    raise exception 'Una orden en "%" no se puede marcar como desistida.', v_estado
      using errcode = '55000';
  end if;

  if p_material_devuelto then
    v_revs := private.reversar_entradas_de_orden(
      p_orden_id, format('Material devuelto al proveedor: %s', trim(p_motivo)));
  end if;

  -- La salida sigue a la compra: lo que no ha salido como pago, no sale.
  perform private.soltar_salidas_de_orden(p_orden_id, format('El proveedor desistió: %s', trim(p_motivo)));

  update public.ordenes_compra
     set estado = 'PROVEEDOR_DESISTIO',
         desistio_motivo = trim(p_motivo),
         desistio_en = now(),
         desistio_resolucion = 'PENDIENTE'
   where id = p_orden_id;

  perform private.anotar('ORDEN', p_orden_id, v_estado, 'PROVEEDOR_DESISTIO',
    case when v_revs > 0
         then format('%s. Se devolvieron %s entrada(s) de inventario.', trim(p_motivo), v_revs)
         else trim(p_motivo) end);
end;
$function$;

-- public.rechazar_solicitud_salida(p_id bigint, p_motivo text)
-- venia de: 20260916191000_los_cuerpos_que_de_verdad_corren_con_permisos_restringidos.sql
CREATE OR REPLACE FUNCTION public.rechazar_solicitud_salida(p_id bigint, p_motivo text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_s    public.solicitudes_salida;
  v_alm  public.almacenes;
begin
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Di por qué no se aprueba: quien la pidió va a leerlo.' using errcode = '22023';
  end if;

  select * into v_s from public.solicitudes_salida where id = p_id for update;
  if v_s.id is null then
    raise exception 'No existe la solicitud %.', p_id using errcode = 'P0002';
  end if;
  if v_s.estado <> 'PEDIDA' then
    raise exception 'La solicitud % ya no espera aprobación: está %.', v_s.numero, lower(v_s.estado)
      using errcode = '55000';
  end if;

  select * into v_alm from public.almacenes where id = v_s.almacen_id;
  if private.accion_restringida('SALIDAS.APROBAR_SOLICITUD') then
    raise exception 'No puedes resolver la solicitud %: aprobar salidas se te restringió. Solicitarlas sí puedes.', v_s.numero
      using errcode = '42501';
  end if;
  if private.como_aprueba_salida(v_s.almacen_id) is null then
    raise exception 'La solicitud % la resuelve quien responde por "%"%, o quien tenga la casilla de aprobar salidas.',
      v_s.numero, v_alm.nombre, private.quien_responde_frase(v_s.almacen_id)
      using errcode = '42501';
  end if;

  update public.solicitudes_salida
     set estado = 'RECHAZADA', cierre_motivo = btrim(p_motivo),
         aprobada_por = (select auth.uid()), aprobada_en = now()
   where id = p_id;

  if v_s.instruccion_pago_id is not null then
    perform private.devolver_pago_con_material(v_s.instruccion_pago_id,
      format('El almacén no aprobó la salida %s: %s', v_s.numero, btrim(p_motivo)));
  end if;

  perform private.notificar(
    'SALIDAS', 'SALIDA_RECHAZADA',
    format('%s: no se aprobó', v_s.numero),
    btrim(p_motivo),
    '/app/salidas/solicitudes', array['ALMACEN'], 'ATENCION');

  return p_id;
end;
$function$;

-- public.registrar_pago(p_instruccion_id bigint, p_cuenta_id bigint, p_referencia text, p_fecha date, p_nota text)
-- venia de: 20260908320000_los_cuerpos_que_de_verdad_corren_ii.sql
CREATE OR REPLACE FUNCTION public.registrar_pago(p_instruccion_id bigint, p_cuenta_id bigint, p_referencia text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date, p_nota text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_i         record;
  v_cuenta    record;
  v_o_estado  text;
  v_faltan    numeric;
  v_orden     text;
  v_prov      text;
  v_a_quien   text;
begin
  perform private.exigir_rol('COMPRAS');

  select * into v_i from public.instrucciones_pago where id = p_instruccion_id;

  if v_i.id is null then
    raise exception 'No existe la instrucción de pago %.', p_instruccion_id using errcode = 'P0002';
  end if;

  if v_i.estado <> 'POR_PAGAR' then
    raise exception 'Esta instrucción está en "%" y no se puede volver a pagar.', v_i.estado
      using errcode = '55000';
  end if;

  if exists (select 1 from public.metodos_pago m where m.codigo = v_i.metodo and not m.mueve_dinero) then
    raise exception 'Este pago es con material: no sale de una cuenta. Se registra con «Registrar el pago con material», que manda la orden de salida a almacén.'
      using errcode = '55000';
  end if;

  if v_i.metodo <> 'EFECTIVO' and length(trim(coalesce(p_referencia, ''))) = 0 then
    raise exception 'Falta el número de referencia de la transacción.' using errcode = '22023';
  end if;

  select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta_id;

  if v_cuenta.id is null then
    raise exception 'Indica de qué cuenta sale el dinero.' using errcode = '22023';
  end if;

  if v_cuenta.moneda <> v_i.moneda then
    raise exception 'La instrucción es por % y la cuenta "%" está en %. Elige una cuenta en % o cambia la instrucción.',
      v_i.moneda, v_cuenta.nombre, v_cuenta.moneda, v_i.moneda
      using errcode = '22023';
  end if;

  select o.numero, p.nombre into v_orden, v_prov
  from public.ordenes_compra o
  left join public.proveedores p on p.id = o.proveedor_id
  where o.id = v_i.orden_id;

  v_a_quien := coalesce(v_prov, v_i.titular, v_i.receptor);

  perform private.registrar_movimiento_tesoreria(
    p_cuenta_id, 'PAGO', -1, v_i.monto,
    'Pago de la orden ' || coalesce(v_orden, v_i.orden_id::text),
    p_fecha, p_referencia, v_a_quien,
    v_i.id, v_i.orden_id, null, p_nota);

  if v_i.igtf_monto > 0 then
    perform private.registrar_movimiento_tesoreria(
      p_cuenta_id, 'IGTF', -1, v_i.igtf_monto,
      'IGTF ' || private.cantidad_es(v_i.igtf_alicuota) ||
        '% de la orden ' || coalesce(v_orden, v_i.orden_id::text),
      p_fecha, p_referencia, v_a_quien,
      v_i.id, v_i.orden_id, null, null);
  end if;

  update public.instrucciones_pago
     set estado = 'PAGADA',
         referencia = nullif(trim(coalesce(p_referencia, '')), ''),
         fecha_pago = coalesce(p_fecha, current_date),
         pagada_por = (select auth.uid()),
         pagada_en = now()
   where id = p_instruccion_id;

  perform private.anotar('PAGO', p_instruccion_id, 'POR_PAGAR', 'PAGADA', p_nota);

  select o.total - coalesce(sum(
           case when i.moneda = o.moneda then i.monto
                else round(i.monto * i.tasa / nullif(o.tasa, 0), 6) end), 0)
    into v_faltan
  from public.ordenes_compra o
  left join public.instrucciones_pago i on i.orden_id = o.id and i.estado = 'PAGADA'
  where o.id = v_i.orden_id
  group by o.total;

  select estado into v_o_estado from public.ordenes_compra where id = v_i.orden_id;

  if v_faltan <= 0.01 then
    update public.ordenes_compra
       set estado = 'PAGADA_POR_RECIBIR',
           fecha_pago = coalesce(p_fecha, current_date),
           pagada_en = now()
     where id = v_i.orden_id;

    perform private.anotar('ORDEN', v_i.orden_id, v_o_estado, 'PAGADA_POR_RECIBIR');
  end if;
end;
$function$;

-- public.registrar_salidas(p_almacen_id bigint, p_renglones jsonb, p_motivo text, p_tipo text, p_fecha date, p_grupo_id bigint, p_externo text, p_responsable text)
-- venia de: 20260916181000_los_cuerpos_que_de_verdad_corren_con_la_palabra_de_venta.sql
CREATE OR REPLACE FUNCTION public.registrar_salidas(p_almacen_id bigint DEFAULT NULL::bigint, p_renglones jsonb DEFAULT NULL::jsonb, p_motivo text DEFAULT NULL::text, p_tipo text DEFAULT 'SALIDA_CONSUMO'::text, p_fecha date DEFAULT NULL::date, p_grupo_id bigint DEFAULT NULL::bigint, p_externo text DEFAULT NULL::text, p_responsable text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_r jsonb; v_n int := 0; v_almacen bigint; v_articulo bigint; v_cantidad numeric;
  v_nombre text; v_sitio text; v_hay numeric; v_costo numeric; v_nota text;
  v_clase public.clases_de_salida; v_tipo text; v_mov bigint;
  v_pres numeric; v_sueltas numeric; v_unidad_pres text;
  v_nombre_pres text; v_dueno text; v_orden bigint;
begin
  perform private.exigir_permiso('SALIDAS', 'ESCRITURA');

  /*
    POR AHORA TODA SALIDA SE AUTORIZA. Christopher, 16/09/2026: «todas las
    salidas necesitarán de autorización, ocultaremos las salidas y traslados
    directos por ahora». La única llamada que descuenta es la de la entrega de
    una solicitud aprobada, que enciende esta marca solo mientras dura. Sin ella
    es una salida directa, y se cierra aquí y no solo en la pantalla.
  */
  if nullif(current_setting('lacantera.entregando_solicitud', true), '') is null then
    raise exception 'Por ahora toda salida necesita autorización: solicítala en Salidas › Salidas y se entrega cuando la apruebe quien responde por el almacén.'
      using errcode = '42501';
  end if;

  -- Y ninguna sale como venta, aunque la solicitud sea de antes de esta regla.
  if private.nombra_una_venta(p_motivo) then
    raise exception 'La solicitud dice «%», y una venta no sale por aquí: se registra en Facturación › Notas de entrega, con cliente, precio y su número.',
      lower(private.palabra_de_venta(p_motivo)) using errcode = '22023';
  end if;

  -- La orden de compra que paga esta salida, cuando la entrega es de un intercambio.
  select i.orden_id into v_orden
    from public.solicitudes_salida s
    join public.instrucciones_pago i on i.id = s.instruccion_pago_id
   where s.numero = nullif(current_setting('lacantera.entregando_solicitud', true), '');

  select * into v_clase from public.clases_de_salida where codigo = p_tipo;
  if v_clase.codigo is not null then
    if not v_clase.activa then
      raise exception 'La clase "%" está apagada.', v_clase.nombre using errcode = '22023';
    end if;
    if v_clase.codigo = 'ENTREGA_POR_SOLICITUD'
       and nullif(current_setting('lacantera.entregando_solicitud', true), '') is null then
      raise exception 'La razón "%" la pone la entrega de una solicitud: en una salida directa elige otra.', v_clase.nombre
        using errcode = '22023';
    end if;
    if v_clase.codigo = 'ENTREGA_POR_INTERCAMBIO' and v_orden is null then
      raise exception 'La razón "%" la pone el pago de una compra con material: una salida pedida a mano elige otra.', v_clase.nombre
        using errcode = '22023';
    end if;
    if v_clase.tipo = 'SALIDA_BAJA' then
      raise exception 'La razón "%" ya no se usa: elige otra de la lista.', v_clase.nombre
        using errcode = '22023';
    end if;
    v_tipo := v_clase.tipo;
  else
    v_tipo := p_tipo;
    if v_tipo not in ('SALIDA_CONSUMO', 'SALIDA_MERMA', 'SALIDA_DESPACHO') then
      raise exception 'Tipo de salida no válido: %.', p_tipo using errcode = '22023';
    end if;
  end if;

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'No hay nada que sacar: la salida no trae renglones.' using errcode = '22023';
  end if;

  /*
    PARA QUIÉN SALE, y no vale dejarlo en blanco.

    El grupo es un nodo del organigrama —una unidad o un cargo—, que es la lista
    que la empresa ya mantiene. Si falta uno, se añade allí y no aquí.
  */
  if p_grupo_id is null and nullif(btrim(coalesce(p_externo, '')), '') is null then
    raise exception 'Falta decir para quién sale: un grupo de la empresa, o quién es de fuera.'
      using errcode = '22023';
  end if;

  if p_grupo_id is not null and nullif(btrim(coalesce(p_externo, '')), '') is not null then
    raise exception 'Una salida va a un grupo de la empresa o a alguien de fuera, no a los dos.'
      using errcode = '22023';
  end if;

  if p_grupo_id is not null
     and not exists (select 1 from public.organigrama_nodos o
                      where o.id = p_grupo_id and o.activo) then
    raise exception 'Ese grupo no está en el organigrama, o está apagado.'
      using errcode = '23503';
  end if;

  /*
    LO QUE SALE DE LA EMPRESA LLEVA NOMBRE Y RESPONSABLE.

    La nota de salida se firma, y dentro de un año «FERRETERIA OSMAIRA» sin un
    nombre detrás no sirve para reclamarle nada a nadie.
  */
  if nullif(btrim(coalesce(p_externo, '')), '') is not null
     and length(btrim(coalesce(p_responsable, ''))) < 3 then
    raise exception 'Di quién responde por lo que sale: el nombre de quien lo recibe.'
      using errcode = '22023';
  end if;

  if coalesce(v_clase.exige_detalle, false) then
    if length(btrim(coalesce(p_motivo, ''))) < 10 then
      raise exception 'Explica qué pasó, con detalle. Dentro de un año esta frase será lo único que quede.'
        using errcode = '22023';
    end if;
  elsif length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe para qué sale. Una salida sin motivo no se puede auditar.' using errcode = '22023';
  end if;

  /*
    Primera pasada: comprobar. Nada se mueve todavia, para que un renglon malo
    no deje tres salidas hechas y dos no.

    LA CONVERSION ENTRA EN LOS TRES SITIOS, y esto es lo delicado de esta
    funcion: aqui, en la suma de los renglones anteriores, y en la pasada de
    escritura. Convertir solo en uno dejaria la reja de existencia comparando
    tambores contra litros, que es peor que no convertir.
  */
  for v_r in select * from jsonb_array_elements(p_renglones) loop
    v_n := v_n + 1;
    v_almacen  := coalesce(nullif(btrim(coalesce(v_r->>'almacen_id', '')), '')::bigint, p_almacen_id);
    v_articulo := nullif(btrim(coalesce(v_r->>'articulo_id', '')), '')::bigint;
    v_sueltas  := coalesce(nullif(btrim(coalesce(v_r->>'cantidad', '')), '')::numeric, 0);
    v_pres     := coalesce(nullif(btrim(coalesce(v_r->>'presentaciones', '')), '')::numeric, 0);

    select nombre into v_sitio from public.almacenes where id = v_almacen and activo;
    if v_sitio is null then
      raise exception 'El renglón %: no dice de qué almacén sale, o ese almacén está inactivo.', v_n using errcode = '23503';
    end if;
    select nombre into v_nombre from public.articulos where id = v_articulo and activo;
    if v_nombre is null then
      raise exception 'El renglón %: ese artículo no existe o está inactivo.', v_n using errcode = '23503';
    end if;

    v_cantidad := private.en_unidad_base(v_articulo, v_pres, v_sueltas, nullif(btrim(coalesce(v_r->>'presentacion', '')), ''));

    if v_cantidad <= 0 then
      raise exception 'El renglón % (%): la cantidad tiene que ser mayor que cero.', v_n, v_nombre using errcode = '22023';
    end if;

    v_hay := private.existencia_para_escribir(v_almacen, v_articulo,
                 private.dueno_del_saldo(v_almacen, v_articulo, v_r->>'propietario')) - coalesce((
      select sum(private.en_unidad_base(
                   v_articulo,
                   coalesce(nullif(btrim(coalesce(r->>'presentaciones', '')), '')::numeric, 0),
                   coalesce(nullif(btrim(coalesce(r->>'cantidad', '')), '')::numeric, 0),
                   nullif(btrim(coalesce(r->>'presentacion', '')), '')))
        from jsonb_array_elements(p_renglones) with ordinality as t(r, i)
       where t.i < v_n
         and coalesce(nullif(btrim(coalesce(r->>'almacen_id', '')), '')::bigint, p_almacen_id) = v_almacen
         and nullif(btrim(coalesce(r->>'articulo_id', '')), '')::bigint = v_articulo), 0);

    if v_cantidad > v_hay then
      raise exception 'El renglón % (% en %): solo quedan % y se intentan sacar %.',
        v_n, v_nombre, v_sitio, private.numero_es(v_hay, 4), private.numero_es(v_cantidad, 4) using errcode = '22023';
    end if;
  end loop;

  v_nota := private.siguiente_numero('NS');

  for v_r in select * from jsonb_array_elements(p_renglones) loop
    v_almacen  := coalesce(nullif(btrim(coalesce(v_r->>'almacen_id', '')), '')::bigint, p_almacen_id);
    v_articulo := (v_r->>'articulo_id')::bigint;
    v_sueltas  := coalesce(nullif(btrim(coalesce(v_r->>'cantidad', '')), '')::numeric, 0);
    v_pres     := coalesce(nullif(btrim(coalesce(v_r->>'presentaciones', '')), '')::numeric, 0);
    v_cantidad := private.en_unidad_base(v_articulo, v_pres, v_sueltas, nullif(btrim(coalesce(v_r->>'presentacion', '')), ''));

    select presentacion into v_unidad_pres from public.articulos where id = v_articulo;
    v_dueno := private.dueno_del_saldo(v_almacen, v_articulo, v_r->>'propietario');
    v_costo := private.costo_promedio(v_almacen, v_articulo, v_dueno);

    v_mov := private.registrar_movimiento(
      v_tipo, -1, v_almacen, v_articulo, v_cantidad, v_costo,
      btrim(p_motivo), v_orden, null, null, p_fecha, null, null, v_nota, null,
      p_cantidad_capturada => nullif(v_pres, 0),
      p_propietario => v_dueno,
      p_unidad_capturada => case when v_pres > 0 then private.presentacion_usada(v_articulo, nullif(btrim(coalesce(v_r->>'presentacion', '')), '')) end,
      p_suelto_capturado => case when v_pres > 0 then nullif(v_sueltas, 0) end,
      -- Por qué salió, con las palabras de la lista: ver la columna del libro.
      p_razon_salida => v_clase.nombre,
      p_grupo => p_grupo_id,
      p_externo => p_externo,
      p_responsable => p_responsable);
  end loop;

  return v_nota;
end;
$function$;

-- public.reversar_movimiento(p_id bigint, p_motivo text)
-- venia de: 20260915171000_los_traslados_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.reversar_movimiento(p_id bigint, p_motivo text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_mov     public.inventario_movimientos;
  v_par     public.inventario_movimientos;
  v_reverso bigint;
begin
  perform private.exigir_rol('ALMACEN');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se reversa.' using errcode = '22023';
  end if;

  select * into v_mov from public.inventario_movimientos where id = p_id;

  if v_mov.id is null then
    raise exception 'No existe el movimiento %.', p_id using errcode = 'P0002';
  end if;

  if v_mov.tipo = 'REVERSO' then
    raise exception 'Un reverso no se reversa. Registra el movimiento que corresponda.'
      using errcode = '22023';
  end if;

  if v_mov.tipo = 'AJUSTE_COSTO' then
    raise exception 'Una corrección de costo no se deshace: se vuelve a corregir.'
      using errcode = '22023',
            hint = 'Entra en Existencias, busca la fila y usa «Corregir el costo» con el valor bueno. Quedan los dos pasos escritos, que es lo que hace falta para entender qué pasó.';
  end if;

  /*
    LO DE UN TRASLADO CON NÚMERO NO SE REVERSA SUELTO.

    Sus asientos cuelgan de un documento con estado. Reversar uno dejaría el
    traslado diciendo «recibido» con el material de vuelta en el origen, o un
    hueco en «En camino». Se cancela desde el traslado, que escribe su propia
    vuelta; y lo recibido se devuelve con un traslado de vuelta.
  */
  if exists (select 1 from public.traslados t
              where v_mov.id in (t.mov_salida, t.mov_en_camino, t.mov_llegada, t.mov_vuelta))
     or exists (select 1 from public.almacenes a
                 where a.id = v_mov.almacen_id and a.tipo = 'TRANSITO') then
    raise exception 'El movimiento % es de un traslado con número propio: no se reversa suelto.', v_mov.numero
      using errcode = '55000',
            hint = 'Si todavía no se recibió, cancélalo en Transferencias. Si ya se recibió, pide un traslado de vuelta.';
  end if;

  if v_mov.tipo = 'SALIDA_INTERCAMBIO' then
    raise exception 'El movimiento % pagó una compra con material: ese material ya es del proveedor, y no se reversa suelto.', v_mov.numero
      using errcode = '55000',
            hint = 'Lo que se acuerde con el proveedor se registra aparte.';
  end if;

  perform private.exigir_no_reversado(v_mov.id, v_mov.numero);

  -- La otra pata, cuando esto es un traslado.
  if v_mov.tipo = 'TRANSFERENCIA_SALIDA' then
    select * into v_par from public.inventario_movimientos
     where movimiento_origen = v_mov.id and tipo = 'TRANSFERENCIA_ENTRADA';
  elsif v_mov.tipo = 'TRANSFERENCIA_ENTRADA' then
    select * into v_par from public.inventario_movimientos
     where id = v_mov.movimiento_origen and tipo = 'TRANSFERENCIA_SALIDA';
  end if;

  if v_par.id is not null then
    perform private.exigir_no_reversado(v_par.id, v_par.numero);
  end if;

  -- Primero se comprueban las dos, y solo después se escribe cualquiera de las
  -- dos: dejar media pareja reversada sería peor que no dejar reversar.
  perform private.exigir_existencia_para_reverso(v_mov, p_id);
  if v_par.id is not null then
    perform private.exigir_existencia_para_reverso(v_par, p_id);
  end if;

  v_reverso := private.registrar_movimiento(
    'REVERSO', (-v_mov.signo)::smallint, v_mov.almacen_id, v_mov.articulo_id,
    v_mov.cantidad, v_mov.costo_usd,
    format('Reverso de %s. %s', v_mov.numero, p_motivo),
    v_mov.orden_id, v_mov.orden_renglon_id, v_mov.id, null);

  if v_par.id is not null then
    perform private.registrar_movimiento(
      'REVERSO', (-v_par.signo)::smallint, v_par.almacen_id, v_par.articulo_id,
      v_par.cantidad, v_par.costo_usd,
      format('Reverso de %s, la otra mitad del traslado %s. %s',
             v_par.numero, v_mov.numero, p_motivo),
      v_par.orden_id, v_par.orden_renglon_id, v_par.id, null);
  end if;

  return v_reverso;
end;
$function$;
