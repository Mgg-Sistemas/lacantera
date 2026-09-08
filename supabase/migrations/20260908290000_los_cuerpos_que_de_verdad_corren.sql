/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  66 funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
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
  viva —no normalizado, no perdonando comentarios— y los 66 coinciden. Y el
  detector, que antes marcaba estas 66, pasa a cero.

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

-- public.guardar_presentacion_de_articulo(p_articulo_id bigint, p_presentacion text, p_unidades numeric, p_por_defecto boolean)
-- venia de: 20260908220000_un_articulo_se_cuenta_de_varias_formas.sql
CREATE OR REPLACE FUNCTION public.guardar_presentacion_de_articulo(p_articulo_id bigint, p_presentacion text, p_unidades numeric, p_por_defecto boolean DEFAULT false)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id     bigint;
  v_nombre text := upper(btrim(coalesce(p_presentacion, '')));
  v_art    record;
begin
  /*
    DECLARAR DE QUE FORMAS SE PUEDE CONTAR UN ARTICULO.

    El nombre sale del catalogo compartido —TAMBOR, CAJA, SACO— para que nadie
    escriba «Tambor», «TAMBORES» y «tambor» y acaben siendo tres. El factor
    cuelga del articulo: un tambor es 208 litros para un aceite y 200 para otro,
    y una tabla global de equivalencias obligaria a inventar un tambor estandar
    y a mentir en todos los que no lo son.
  */
  perform private.exigir_accion('INVENTARIO.EDITAR_CATALOGO');

  select nombre, unidad into v_art from public.articulos where id = p_articulo_id;
  if v_art.nombre is null then
    raise exception 'No existe ese artículo.' using errcode = 'P0002';
  end if;

  if v_nombre = '' then
    raise exception 'Dime en qué presentación viene.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.presentaciones where codigo = v_nombre) then
    raise exception '«%» no está en la lista de presentaciones.', v_nombre
      using errcode = '23503',
            hint = 'Las que hay: ' || (select string_agg(codigo, ', ' order by orden)
                                         from public.presentaciones);
  end if;

  if coalesce(p_unidades, 0) <= 0 then
    raise exception 'Dime cuántos % trae un %.', v_art.unidad, v_nombre
      using errcode = '22023';
  end if;

  /*
    UN BULTO QUE TRAE UNA UNIDAD NO ES UN BULTO.

    «Un PAR trae 1 PAR» no aporta nada y confunde la pantalla, que ofreceria dos
    formas de teclear lo mismo. Y es un error real del catalogo de hoy —botas
    con unidad PAR y presentacion PAR— que conviene no dejar repetir.
  */
  perform private.exigir_presentacion_util(v_art.nombre, v_nombre, v_art.unidad);

  -- Solo una por defecto. Se apaga la anterior ANTES de encender esta, porque
  -- el indice unico parcial no admite dos ni por un instante.
  if p_por_defecto then
    update public.articulo_presentaciones
       set por_defecto = false
     where articulo_id = p_articulo_id and por_defecto;
  end if;

  insert into public.articulo_presentaciones
    (articulo_id, presentacion, unidades, por_defecto, creada_por)
  values (p_articulo_id, v_nombre, p_unidades, coalesce(p_por_defecto, false), (select auth.uid()))
  on conflict (articulo_id, presentacion) do update
     set unidades = excluded.unidades,
         por_defecto = excluded.por_defecto,
         activa = true
  returning id into v_id;

  /*
    Y LAS DOS COLUMNAS VIEJAS SIGUEN LA DE POR DEFECTO.

    `articulos.presentacion` y `unidades_por_presentacion` son la version de una
    sola presentacion, y todavia las leen la pantalla y las funciones que no se
    han migrado. Mientras existan tienen que decir lo mismo que la tabla, o
    volvemos a tener dos fuentes que discrepan — que es el problema del que
    venimos toda la semana.
  */
  update public.articulos a
     set presentacion = d.presentacion,
         unidades_por_presentacion = d.unidades
    from (select ap.presentacion, ap.unidades
            from public.articulo_presentaciones ap
           where ap.articulo_id = p_articulo_id and ap.activa
           order by ap.por_defecto desc, ap.id limit 1) d
   where a.id = p_articulo_id;

  return v_id;
end;
$function$;

-- public.guardar_clase_de_salida(p_codigo text, p_nombre text, p_pista text, p_tipo text, p_causa_baja text, p_orden smallint, p_exige_detalle boolean, p_activa boolean)
-- venia de: 20260824350000_la_clase_de_salida_la_lleva_la_empresa.sql
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

-- public.pagar_nomina(p_periodo_id bigint, p_cuenta_id bigint, p_referencia text, p_fecha date)
-- venia de: 20260728120000_nomina_pago_no_reversable.sql
CREATE OR REPLACE FUNCTION public.pagar_nomina(p_periodo_id bigint, p_cuenta_id bigint, p_referencia text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_p      record;
  v_cuenta record;
  v_neto   numeric;
  v_n      integer;
  v_monto  numeric;
  v_mov    bigint;
begin
  perform private.exigir_rol('RRHH', 'GERENTE_GENERAL');

  select * into v_p from public.nomina_periodos where id = p_periodo_id;

  if v_p.id is null then
    raise exception 'No existe el período %.', p_periodo_id using errcode = 'P0002';
  end if;

  if v_p.estado <> 'APROBADA' then
    raise exception 'Solo se paga una nómina aprobada. Esta está en "%".', v_p.estado
      using errcode = '55000';
  end if;

  select count(*), coalesce(sum(neto), 0) into v_n, v_neto
  from public.nomina_recibos where periodo_id = p_periodo_id;

  select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta_id;

  if v_cuenta.id is null then
    raise exception 'Indica de qué cuenta sale el dinero.' using errcode = '22023';
  end if;

  v_monto := case when v_cuenta.moneda = 'VES' then v_neto
                  else round(v_neto / v_p.tasa_usd, 2) end;

  v_mov := private.registrar_movimiento_tesoreria(
    p_cuenta_id, 'EGRESO', -1, v_monto,
    'Nómina ' || v_p.numero || ' — ' || v_n || ' trabajador' || case when v_n = 1 then '' else 'es' end,
    p_fecha, p_referencia, 'Personal', null, null, null, null);

  update public.tesoreria_movimientos
     set nomina_periodo_id = p_periodo_id
   where id = v_mov;

  update public.nomina_periodos
     set estado = 'PAGADA', pagada_en = now()
   where id = p_periodo_id;

  perform private.notificar(
    'NOMINA', 'PAGADA',
    'Nómina ' || v_p.numero || ' pagada',
    'Salieron ' || private.numero_es(v_monto, 2) || ' ' || v_cuenta.moneda ||
      ' de ' || v_cuenta.nombre || ' para ' || v_n || ' trabajador' ||
      case when v_n = 1 then '' else 'es' end || '.',
    '/app/nomina/recibos',
    array['GERENTE_GENERAL', 'RRHH'], 'INFO');

  return v_mov;
end;
$function$;

-- public.indicar_pago(p_orden_id bigint, p_metodo text, p_moneda character, p_monto numeric, p_datos jsonb, p_nota text, p_igtf boolean)
-- venia de: 20260820210000_el_pago_pregunta_que_entrego_el_proveedor.sql
CREATE OR REPLACE FUNCTION public.indicar_pago(p_orden_id bigint, p_metodo text, p_moneda character, p_monto numeric, p_datos jsonb DEFAULT '{}'::jsonb, p_nota text DEFAULT NULL::text, p_igtf boolean DEFAULT NULL::boolean)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_estado       text;
  v_condicion    text;
  v_total        numeric;
  v_moneda       text;
  v_orden_tasa   numeric;
  v_comprobante  text;
  v_tope         numeric;
  v_pagado       numeric;
  v_tasa         numeric;
  v_tasa_usd     numeric;
  v_equiv        numeric;
  v_id           bigint;
begin
  perform private.exigir_rol('COMPRAS');

  select estado, total, moneda, condicion_pago, tasa, comprobante_tipo
    into v_estado, v_total, v_moneda, v_condicion, v_orden_tasa, v_comprobante
  from public.ordenes_compra where id = p_orden_id;

  if v_estado is null then
    raise exception 'No existe la orden %.', p_orden_id using errcode = 'P0002';
  end if;

  -- El freno nuevo. Va antes que las demás comprobaciones porque es el que
  -- explica algo que quien paga puede no tener presente.
  if v_comprobante is null then
    raise exception 'Antes de pagar hay que decir con qué entrega el proveedor: nota de entrega o factura. Solo la factura da derecho al crédito fiscal y entra en el libro de compras.'
      using errcode = '22023';
  end if;

  if v_condicion = 'CONTRA_ENTREGA' and v_estado = 'POR_RECIBIR' then
    raise exception 'Esta compra es contra entrega: se paga lo que llegue, y todavia no se ha recibido nada.'
      using errcode = '55000';
  end if;

  if v_estado not in ('POR_INDICAR_PAGO', 'EN_TESORERIA', 'RECIBIDA_PARCIAL', 'RECIBIDA') then
    raise exception 'Esta orden esta en "%" y no admite instrucciones de pago.', v_estado
      using errcode = '55000';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto a pagar debe ser mayor que cero.' using errcode = '22023';
  end if;

  select t.tasa, t.tasa_usd into v_tasa, v_tasa_usd
  from private.tasas_del_dia(p_moneda, current_date) t;

  v_tope := private.tope_pagable(p_orden_id);

  select coalesce(sum(
           case when i.moneda = v_moneda then i.monto
                else round(i.monto * i.tasa / nullif(v_orden_tasa, 0), 6) end), 0)
    into v_pagado
  from public.instrucciones_pago i
  where i.orden_id = p_orden_id and i.estado in ('POR_PAGAR', 'PAGADA');

  v_equiv := case when p_moneda = v_moneda then p_monto
                  else round(p_monto * v_tasa / nullif(v_orden_tasa, 0), 6) end;

  if v_pagado + v_equiv > v_tope + 0.01 then
    if v_condicion = 'CONTRA_ENTREGA' then
      raise exception 'Contra entrega solo se paga lo recibido. De esta orden ha llegado material por % %, y ya hay % instruido.',
        private.numero_es(v_tope, 2), v_moneda, private.numero_es(v_pagado, 2) using errcode = '22023';
    else
      raise exception 'Con esta instruccion se pagaria mas que el total de la orden (% %). Ya hay % instruido.',
        private.numero_es(v_total, 2), v_moneda, private.numero_es(v_pagado, 2) using errcode = '22023';
    end if;
  end if;

  insert into public.instrucciones_pago
    (orden_id, metodo, moneda, monto, tasa, tasa_usd,
     igtf_aplica,
     banco, numero_cuenta, titular, documento, telefono, correo_binance, red_cripto, receptor,
     nota, creada_por)
  values
    (p_orden_id, p_metodo, p_moneda, p_monto, v_tasa, v_tasa_usd,
     coalesce(p_igtf, p_moneda <> 'VES'),
     nullif(trim(coalesce(p_datos->>'banco', '')), ''),
     nullif(trim(coalesce(p_datos->>'numero_cuenta', '')), ''),
     nullif(trim(coalesce(p_datos->>'titular', '')), ''),
     nullif(trim(coalesce(p_datos->>'documento', '')), ''),
     nullif(trim(coalesce(p_datos->>'telefono', '')), ''),
     nullif(trim(coalesce(p_datos->>'correo_binance', '')), ''),
     nullif(trim(coalesce(p_datos->>'red_cripto', '')), ''),
     nullif(trim(coalesce(p_datos->>'receptor', '')), ''),
     nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  update public.ordenes_compra set estado = 'EN_TESORERIA' where id = p_orden_id;

  perform private.anotar('PAGO', v_id, null, 'POR_PAGAR', p_nota);
  if v_estado <> 'EN_TESORERIA' then
    perform private.anotar('ORDEN', p_orden_id, v_estado, 'EN_TESORERIA');
  end if;

  return v_id;
end;
$function$;

-- public.registrar_lectura(p_maquina_id bigint, p_fecha date, p_inicial numeric, p_final numeric)
-- venia de: 20260902100000_el_horometro_no_retrocede.sql
CREATE OR REPLACE FUNCTION public.registrar_lectura(p_maquina_id bigint, p_fecha date, p_inicial numeric, p_final numeric)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_maq record; v_fecha date := coalesce(p_fecha, current_date);
  v_previo numeric; v_previo_dia date; v_siguiente numeric; v_sig_dia date; v_id bigint;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');
  select * into v_maq from public.maquinaria where id = p_maquina_id;
  if v_maq.id is null then
    raise exception 'No existe la máquina %.', p_maquina_id using errcode = 'P0002';
  end if;
  if p_inicial is null or p_final is null then
    raise exception 'Hacen falta las dos lecturas del reloj: la de arrancar y la de terminar.' using errcode = '23514';
  end if;
  if p_inicial < 0 or p_final < 0 then
    raise exception 'Un horómetro no marca números negativos.' using errcode = '22023';
  end if;
  if p_final < p_inicial then
    raise exception 'El horómetro no retrocede: el final (%) no puede ser menor que el inicial (%).', p_final, p_inicial using errcode = '22023';
  end if;
  if v_fecha > current_date then
    raise exception 'No se anota una jornada que todavía no ocurrió.' using errcode = '22023';
  end if;

  select final, fecha into v_previo, v_previo_dia from public.horometro_lecturas
   where maquina_id = p_maquina_id and fecha < v_fecha order by fecha desc limit 1;
  select inicial, fecha into v_siguiente, v_sig_dia from public.horometro_lecturas
   where maquina_id = p_maquina_id and fecha > v_fecha order by fecha asc limit 1;

  if v_previo is not null and p_inicial < v_previo then
    raise exception 'El horómetro no retrocede. La lectura del % terminó en %, así que la del % no puede arrancar en %.',
      to_char(v_previo_dia,'DD/MM/YYYY'), v_previo, to_char(v_fecha,'DD/MM/YYYY'), p_inicial
      using errcode='22023', hint='Si a la máquina le cambiaron el reloj, eso no se anota aquí: se corrige la ficha.';
  end if;
  if v_siguiente is not null and p_final > v_siguiente then
    raise exception 'La lectura del % arranca en %, así que la del % no puede terminar en %.',
      to_char(v_sig_dia,'DD/MM/YYYY'), private.cantidad_es(v_siguiente), to_char(v_fecha,'DD/MM/YYYY'), private.cantidad_es(p_final)
      using errcode='22023', hint='Estás corrigiendo un día pasado y el número se pasa del día siguiente.';
  end if;

  insert into public.horometro_lecturas (maquina_id, fecha, inicial, final, creada_por)
  values (p_maquina_id, v_fecha, p_inicial, p_final, (select auth.uid()))
  on conflict (maquina_id, fecha) do update
    set inicial=excluded.inicial, final=excluded.final, creada_por=excluded.creada_por
  returning id into v_id;

  if v_previo is not null and p_inicial > v_previo then
    perform private.notificar('MAQUINARIA','HOROMETRO_NO_ARRASTRA',
      format('El horómetro de %s tiene horas sin anotar', v_maq.nombre),
      format('La lectura del %s terminó en %s y la del %s arranca en %s: faltan %s horas por registrar.',
             to_char(v_previo_dia,'DD/MM/YYYY'), private.cantidad_es(v_previo), to_char(v_fecha,'DD/MM/YYYY'), private.cantidad_es(p_inicial),
             private.numero_es(p_inicial - v_previo, 2)),
      '/app/maquinaria', array['OPERACIONES'], 'ATENCION');
  end if;
  return v_id;
end;
$function$;

-- public.ajustar_cuenta(p_cuenta bigint, p_monto numeric, p_motivo text, p_fecha date)
-- venia de: 20260727210000_tesoreria.sql
CREATE OR REPLACE FUNCTION public.ajustar_cuenta(p_cuenta bigint, p_monto numeric, p_motivo text, p_fecha date DEFAULT NULL::date)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.exigir_permiso('TESORERIA', 'ESCRITURA');

  if length(trim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Un ajuste sin explicación es un descuadre escondido. Escribe qué apareció o qué faltó.'
      using errcode = '22023';
  end if;

  if coalesce(p_monto, 0) = 0 then
    raise exception 'Un ajuste de cero no ajusta nada.' using errcode = '22023';
  end if;

  return private.registrar_movimiento_tesoreria(
    p_cuenta, 'AJUSTE', case when p_monto > 0 then 1 else -1 end, abs(p_monto),
    'Ajuste: ' || trim(p_motivo), p_fecha, null, null, null, null, null, p_motivo);
end;
$function$;

-- public.reversar_movimiento_tesoreria(p_id bigint, p_motivo text)
-- venia de: 20260728120000_nomina_pago_no_reversable.sql
CREATE OR REPLACE FUNCTION public.reversar_movimiento_tesoreria(p_id bigint, p_motivo text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_m record;
begin
  perform private.exigir_permiso('TESORERIA', 'ESCRITURA');

  if length(trim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Escribe por qué se reversa. La línea anulada se queda a la vista y sin motivo no se entiende.'
      using errcode = '22023';
  end if;

  select * into v_m from public.tesoreria_movimientos where id = p_id;

  if v_m.id is null then
    raise exception 'No existe el movimiento %.', p_id using errcode = 'P0002';
  end if;

  if exists (select 1 from public.tesoreria_movimientos where movimiento_origen = p_id) then
    raise exception 'El movimiento % ya fue reversado.', v_m.numero using errcode = '55000';
  end if;

  if v_m.instruccion_id is not null then
    raise exception 'Este movimiento es el pago de una compra. Reversarlo a solas dejaría la compra pagada y el dinero de vuelta: devuelve la instrucción de pago desde la compra.'
      using errcode = '55000';
  end if;

  if v_m.transferencia_par is not null then
    raise exception 'El movimiento % es una de las dos mitades de un traslado. Reversar solo esta devolvería el dinero al origen dejándolo también en el destino. Deshazlo con un traslado en sentido contrario.', v_m.numero
      using errcode = '55000';
  end if;

  if v_m.nomina_periodo_id is not null then
    raise exception 'Este movimiento es el pago de una nómina. Reversarlo dejaría los recibos diciendo que se cobró y el banco que no salió nada.'
      using errcode = '55000';
  end if;

  return private.registrar_movimiento_tesoreria(
    v_m.cuenta_id, 'REVERSO', (v_m.signo * -1)::integer, v_m.monto,
    'Reverso de ' || v_m.numero || ': ' || trim(p_motivo),
    null, v_m.referencia, v_m.contraparte, null, null, v_m.id, p_motivo);
end;
$function$;

-- private.anotar(p_tipo text, p_id bigint, p_ant text, p_nuevo text, p_nota text)
-- venia de: 20260727180000_notificaciones.sql
CREATE OR REPLACE FUNCTION private.anotar(p_tipo text, p_id bigint, p_ant text, p_nuevo text, p_nota text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_solicitud   bigint;
  v_numero      text;
  v_titulo      text;
  v_proveedor   text;
  v_total_usd   numeric;
  v_aviso       text;
  v_detalle     text;
  v_roles       text[];
  v_importancia text := 'INFO';
begin
  insert into public.compras_bitacora
    (documento_tipo, documento_id, estado_anterior, estado_nuevo, nota, actor_id)
  values
    (p_tipo, p_id, p_ant, p_nuevo, nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()));

  -- ¿A qué compra pertenece el documento que se movió?
  if p_tipo = 'SOLICITUD' then
    v_solicitud := p_id;
  elsif p_tipo = 'ORDEN' then
    select o.solicitud_id into v_solicitud from public.ordenes_compra o where o.id = p_id;
  elsif p_tipo = 'PAGO' then
    select o.solicitud_id into v_solicitud
    from public.instrucciones_pago i
    join public.ordenes_compra o on o.id = i.orden_id
    where i.id = p_id;
  else
    return;
  end if;

  if v_solicitud is null then
    return;
  end if;

  select s.numero, s.titulo, p.nombre, o.total_usd
    into v_numero, v_titulo, v_proveedor, v_total_usd
  from public.solicitudes_pedido s
  left join public.ordenes_compra o on o.solicitud_id = s.id and o.estado <> 'CANCELADA'
  left join public.proveedores p on p.id = o.proveedor_id
  where s.id = v_solicitud;

  case p_nuevo
    when 'PEDIDO' then
      v_aviso := 'Nuevo pedido de compra';
      v_roles := array['COMPRAS'];

    when 'CONFIRMADA' then
      v_aviso := 'Pedido confirmado: hay que cotizar';
      v_roles := array['COMPRAS'];

    when 'POR_CONFIRMAR_GERENTE' then
      v_aviso := 'Compra esperando aprobación de gerencia';
      v_roles := array['GERENTE_GENERAL'];
      v_importancia := 'ATENCION';

    when 'APROBADA' then
      v_aviso := 'Compra aprobada por gerencia';
      v_roles := array['COMPRAS'];

    when 'POR_INDICAR_PAGO' then
      v_aviso := 'Orden de compra sin método de pago';
      v_roles := array['COMPRAS'];

    when 'EN_TESORERIA' then
      v_aviso := 'Pago por ejecutar';
      v_roles := array['COMPRAS'];
      v_importancia := 'ATENCION';

    when 'PAGADA_POR_RECIBIR' then
      v_aviso := 'Compra pagada: pendiente por recepcionar';
      v_roles := array['ALMACEN', 'COMPRAS'];

    when 'RECIBIDA' then
      v_aviso := 'Material recibido';
      v_roles := array['COMPRAS'];

    when 'RECIBIDA_PARCIAL' then
      v_aviso := 'Material recibido en parte';
      v_roles := array['COMPRAS'];

    when 'CANCELADA' then
      v_aviso := 'Compra cancelada';
      v_roles := array['COMPRAS', 'GERENTE_GENERAL'];

    when 'PROVEEDOR_DESISTIO' then
      v_aviso := 'El proveedor desistió: hay dinero pagado sin material';
      v_roles := array['GERENTE_GENERAL', 'COMPRAS'];
      v_importancia := 'URGENTE';

    when 'DEVUELTA' then
      v_aviso := 'Tesorería devolvió el pago a compras';
      v_roles := array['COMPRAS'];
      v_importancia := 'ATENCION';

    else
      -- Borradores, cotizaciones cargadas y resoluciones de desistimiento no
      -- le piden nada a nadie: quedan en la bitácora y ahí se consultan.
      return;
  end case;

  v_detalle := format('%s · %s', v_numero, v_titulo);

  if v_proveedor is not null then
    v_detalle := v_detalle || format(' · %s', v_proveedor);
  end if;

  if v_total_usd is not null then
    v_detalle := v_detalle || format(' · $ %s', private.numero_es(v_total_usd, 2));
  end if;

  if nullif(trim(coalesce(p_nota, '')), '') is not null then
    v_detalle := v_detalle || format(' — «%s»', trim(p_nota));
  end if;

  perform private.notificar(
    'COMPRAS', 'COMPRA_' || p_nuevo, v_aviso, v_detalle,
    '/app/compras/' || v_solicitud, v_roles, v_importancia);
end;
$function$;

-- public.registrar_recepcion(p_orden_id bigint, p_almacen_id bigint, p_renglones jsonb, p_nota text, p_fecha date)
-- venia de: 20260908180000_las_dos_que_faltaban_volcadas.sql
CREATE OR REPLACE FUNCTION public.registrar_recepcion(p_orden_id bigint, p_almacen_id bigint, p_renglones jsonb, p_nota text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_estado    text;
  v_cond      text;
  v_moneda    text;
  v_tasa      numeric;
  v_tasa_usd  numeric;
  v_item      jsonb;
  v_renglon   public.orden_renglones;
  v_cantidad  numeric;
  v_costo_usd numeric;
  v_movs      integer := 0;
  v_nuevo     text;
  c_factor    constant numeric := 10;
  v_ref       numeric;
  v_veces     numeric;
  v_msg       text;
  v_nombre    text;
begin
  perform private.exigir_rol('ALMACEN');

  select estado, condicion_pago, moneda, tasa, tasa_usd
    into v_estado, v_cond, v_moneda, v_tasa, v_tasa_usd
  from public.ordenes_compra where id = p_orden_id;

  if v_estado is null then
    raise exception 'No existe la orden %.', p_orden_id using errcode = 'P0002';
  end if;

  /*
    Sin factura ni nota de entrega, el material no entra.

    El comprobante de pago NO cuenta: dice que se pagó, no que llegó ni qué
    llegó. Es el papel del proveedor el que dice qué se está recibiendo, y es
    el que hace falta para reclamar si falta algo.
  */
  if not exists (
    select 1 from public.compras_papeles p
     where p.orden_id = p_orden_id
       and p.tipo in ('FACTURA', 'NOTA_ENTREGA')
  ) then
    raise exception 'Falta el papel del proveedor: sin factura o nota de entrega el material no entra.'
      using errcode = '22023',
            hint = 'Súbela en «Papeles» de esta compra. El comprobante de pago puede esperar.';
  end if;

  -- Contra entrega admite dos estados mas. Al recibir una parte, la orden se va
  -- a POR_INDICAR_PAGO y de ahi a EN_TESORERIA mientras se paga esa parte; si
  -- esos dos no admitieran recepcion, el resto del material no podria entrar
  -- nunca y se quedaria fuera del sistema.
  if v_cond = 'CONTRA_ENTREGA' then
    if v_estado not in ('POR_RECIBIR', 'POR_INDICAR_PAGO', 'EN_TESORERIA',
                        'PAGADA_POR_RECIBIR', 'RECIBIDA_PARCIAL') then
      raise exception 'Esta orden está en "%" y no admite recepción.', v_estado
        using errcode = '55000';
    end if;
  elsif v_estado not in ('PAGADA_POR_RECIBIR', 'RECIBIDA_PARCIAL', 'POR_RECIBIR') then
    raise exception 'Esta orden está en "%" y no admite recepción.', v_estado
      using errcode = '55000';
  end if;

  if not exists (select 1 from public.almacenes where id = p_almacen_id and activo) then
    raise exception 'El almacén indicado no existe o está inactivo.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'Indica qué llegó y en qué cantidad.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_cantidad := (v_item->>'cantidad')::numeric;

    if coalesce(v_cantidad, 0) <= 0 then
      continue;   -- Renglón que no llegó en este viaje.
    end if;

    select * into v_renglon
    from public.orden_renglones
    where id = (v_item->>'orden_renglon_id')::bigint and orden_id = p_orden_id;

    if v_renglon.id is null then
      raise exception 'Ese renglón no pertenece a la orden %.', p_orden_id using errcode = '22023';
    end if;

    -- Recibir de más no es un descuido: o llegó otra cosa, o el precio pactado
    -- ya no cubre lo que entró. En cualquier caso hay que mirarlo antes.
    if v_renglon.cantidad_recibida + v_cantidad > v_renglon.cantidad + 0.0001 then
      raise exception 'De "%" se pidieron % y ya se recibieron %. No se pueden recibir % más.',
        v_renglon.descripcion, private.cantidad_es(v_renglon.cantidad), private.cantidad_es(v_renglon.cantidad_recibida), private.cantidad_es(v_cantidad)
        using errcode = '22023';
    end if;

    update public.orden_renglones
       set cantidad_recibida = cantidad_recibida + v_cantidad
     where id = v_renglon.id;

    -- Solo entra al libro lo que es inventariable. Un flete o una reparación
    -- se compran y se pagan, pero no hay nada que guardar en un estante.
    if v_renglon.articulo_id is not null
       and exists (select 1 from public.articulos
                   where id = v_renglon.articulo_id and inventariable) then

      v_costo_usd := round(v_renglon.precio_unitario * v_tasa / v_tasa_usd, 6);

      /*
        LA MISMA REJA QUE LA ENTRADA, PORQUE ES LA MISMA PUERTA.

        Esta era la que faltaba. Lo levanto el carril de base de datos el
        7/09/2026, corrigiendose a si mismo: habia dado esto por revisado
        suponiendo que «el numero viene de una orden y ya lo miro alguien». Es
        una suposicion sobre el proceso, no una lectura del codigo — el precio
        del renglon se teclea, y de aqui pasaba al libro sin que nada dudara.

        Le confundio que esta funcion SI tiene reja, la del papel del proveedor.
        Esa comprueba que exista un documento, no que el precio sea sensato: son
        dos controles y los conto como uno.

        Va la tercera con la misma forma —el vale con destino a mano, el
        traslado, y ahora la recepcion—: la comprobacion existe y hay una puerta
        al lado que no pasa por ella.

        La confirmacion viaja EN EL RENGLON y no como parametro nuevo: anadir un
        argumento crea una firma nueva que hay que soltar a mano, y eso ya
        mordio dos veces hoy.
      */
      v_ref := private.costo_promedio(p_almacen_id, v_renglon.articulo_id);
      v_veces := null;

      if coalesce(v_ref, 0) > 0 then
        v_veces := round(v_costo_usd / v_ref, 2);
        if v_veces >= c_factor or v_veces <= (1 / c_factor) then
          if not coalesce((v_item->>'confirmado')::boolean, false) then
            select nombre into v_nombre from public.articulos where id = v_renglon.articulo_id;
            v_msg := case when private.puede_accion('INVENTARIO.VER_VALORACION')
              then format('%s viene costando %s por unidad y en esta orden entra a %s: son %s. Si el precio de la orden es correcto, acéptalo y quedará anotado.',
                          v_nombre, private.numero_es(v_ref, 4), private.numero_es(v_costo_usd, 4),
                          case when v_veces >= 1 then private.numero_es(v_veces, 2) || ' veces mas'
                               else private.numero_es(v_ref / nullif(v_costo_usd, 0), 2) || ' veces menos' end)
              else format('El costo de %s en esta orden se sale mucho de lo que ese artículo viene costando. Compruébalo con la factura del proveedor.', v_nombre)
            end;
            raise exception '%', v_msg
              using errcode = '22023',
                    hint = 'Si el precio de la orden esta mal, corrigelo en la orden antes de recibir: aqui solo se acepta o se para.';
          end if;
        else
          v_veces := null;
        end if;
      end if;

      perform private.registrar_movimiento(
        'ENTRADA_COMPRA', 1, p_almacen_id, v_renglon.articulo_id,
        v_cantidad, v_costo_usd, p_nota, p_orden_id, v_renglon.id, null, p_fecha,
        p_aviso_costo => v_veces);

      v_movs := v_movs + 1;
    end if;
  end loop;

  if v_movs = 0 and not exists (
    select 1 from jsonb_array_elements(p_renglones) e
    where coalesce((e->>'cantidad')::numeric, 0) > 0
  ) then
    raise exception 'No se indicó ninguna cantidad recibida.' using errcode = '22023';
  end if;

  v_nuevo := private.estado_tras_recepcion(p_orden_id);

  update public.ordenes_compra
     set estado = v_nuevo,
         recibida_en = case when v_nuevo = 'RECIBIDA' then now() else recibida_en end
   where id = p_orden_id;

  perform private.anotar('ORDEN', p_orden_id, v_estado, v_nuevo, p_nota);

  return v_movs;
end;
$function$;

-- public.guardar_cuenta(p_id bigint, p_codigo text, p_nombre text, p_tipo text, p_moneda character, p_banco text, p_numero_cuenta text, p_titular text, p_documento text, p_correo_binance text, p_red_cripto text, p_sobregiro boolean, p_activa boolean, p_nota text)
-- venia de: 20260727212000_tesoreria_correcciones.sql
CREATE OR REPLACE FUNCTION public.guardar_cuenta(p_id bigint DEFAULT NULL::bigint, p_codigo text DEFAULT NULL::text, p_nombre text DEFAULT NULL::text, p_tipo text DEFAULT 'BANCO'::text, p_moneda character DEFAULT 'VES'::bpchar, p_banco text DEFAULT NULL::text, p_numero_cuenta text DEFAULT NULL::text, p_titular text DEFAULT NULL::text, p_documento text DEFAULT NULL::text, p_correo_binance text DEFAULT NULL::text, p_red_cripto text DEFAULT NULL::text, p_sobregiro boolean DEFAULT false, p_activa boolean DEFAULT true, p_nota text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id     bigint;
  v_moneda text;
begin
  perform private.exigir_permiso('TESORERIA', 'ESCRITURA');

  if length(trim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'Ponle nombre a la cuenta: es lo que se lee al elegir de dónde sale el dinero.'
      using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.cuentas_tesoreria
      (codigo, nombre, tipo, moneda, banco, numero_cuenta, titular, documento,
       correo_binance, red_cripto, permite_sobregiro, activa, nota, creada_por)
    values
      (upper(trim(coalesce(nullif(p_codigo, ''), 'CTA-' || to_char(now(), 'YYYYMMDDHH24MISS')))),
       trim(p_nombre), p_tipo, p_moneda,
       nullif(trim(coalesce(p_banco, '')), ''),
       nullif(trim(coalesce(p_numero_cuenta, '')), ''),
       nullif(trim(coalesce(p_titular, '')), ''),
       nullif(trim(coalesce(p_documento, '')), ''),
       nullif(trim(coalesce(p_correo_binance, '')), ''),
       nullif(trim(coalesce(p_red_cripto, '')), ''),
       coalesce(p_sobregiro, false), coalesce(p_activa, true),
       nullif(trim(coalesce(p_nota, '')), ''),
       (select auth.uid()))
    returning id into v_id;

    return v_id;
  end if;

  select moneda into v_moneda from public.cuentas_tesoreria where id = p_id;

  if v_moneda is null then
    raise exception 'No existe la cuenta %.', p_id using errcode = 'P0002';
  end if;

  if v_moneda <> p_moneda
     and exists (select 1 from public.tesoreria_movimientos where cuenta_id = p_id) then
    raise exception 'La cuenta ya tiene movimientos en % y no puede cambiar de moneda. Crea otra cuenta.', v_moneda
      using errcode = '55000';
  end if;

  update public.cuentas_tesoreria set
    nombre = trim(p_nombre),
    tipo = p_tipo,
    moneda = p_moneda,
    banco = nullif(trim(coalesce(p_banco, '')), ''),
    numero_cuenta = nullif(trim(coalesce(p_numero_cuenta, '')), ''),
    titular = nullif(trim(coalesce(p_titular, '')), ''),
    documento = nullif(trim(coalesce(p_documento, '')), ''),
    correo_binance = nullif(trim(coalesce(p_correo_binance, '')), ''),
    red_cripto = nullif(trim(coalesce(p_red_cripto, '')), ''),
    permite_sobregiro = coalesce(p_sobregiro, false),
    activa = coalesce(p_activa, true),
    nota = nullif(trim(coalesce(p_nota, '')), '')
  where id = p_id;

  return p_id;
exception
  when check_violation then
    raise exception '%', case p_tipo
      when 'BANCO'     then 'Una cuenta bancaria necesita banco, número de cuenta y titular.'
      when 'CAJA'      then 'Una caja necesita saber quién responde por el efectivo.'
      when 'BILLETERA' then 'Una billetera necesita el correo de la plataforma o la dirección de la wallet.'
      else 'Faltan datos de la cuenta.'
    end using errcode = '23514';
end;
$function$;

-- public.devolver_instruccion(p_instruccion_id bigint, p_motivo text)
-- venia de: 20260727160000_compras_operaciones.sql
CREATE OR REPLACE FUNCTION public.devolver_instruccion(p_instruccion_id bigint, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_orden bigint;
  v_estado text;
begin
  perform private.exigir_rol('COMPRAS');

  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Di por qué la devuelves para que compras pueda corregirla.' using errcode = '22023';
  end if;

  select orden_id, estado into v_orden, v_estado
  from public.instrucciones_pago where id = p_instruccion_id;

  if v_estado <> 'POR_PAGAR' then
    raise exception 'Solo se devuelve una instrucción pendiente de pago.' using errcode = '55000';
  end if;

  update public.instrucciones_pago
     set estado = 'DEVUELTA', motivo_devolucion = trim(p_motivo)
   where id = p_instruccion_id;

  perform private.anotar('PAGO', p_instruccion_id, 'POR_PAGAR', 'DEVUELTA', p_motivo);

  -- Si no queda ninguna instrucción viva, la orden vuelve a compras.
  if not exists (
    select 1 from public.instrucciones_pago
    where orden_id = v_orden and estado in ('POR_PAGAR', 'PAGADA')
  ) then
    update public.ordenes_compra set estado = 'POR_INDICAR_PAGO' where id = v_orden;
    perform private.anotar('ORDEN', v_orden, 'EN_TESORERIA', 'POR_INDICAR_PAGO', p_motivo);
  end if;
end;
$function$;

-- public.resolver_desistimiento(p_orden_id bigint, p_resolucion text, p_nota text)
-- venia de: 20260727160000_compras_operaciones.sql
CREATE OR REPLACE FUNCTION public.resolver_desistimiento(p_orden_id bigint, p_resolucion text, p_nota text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_estado text;
begin
  perform private.exigir_rol('GERENTE_GENERAL', 'COMPRAS');

  if p_resolucion not in ('REEMBOLSADO', 'SALDO_FAVOR', 'PERDIDA') then
    raise exception 'La resolución debe ser: devolvió el dinero, queda a favor, o se dio por perdido.'
      using errcode = '22023';
  end if;

  select estado into v_estado from public.ordenes_compra where id = p_orden_id;

  if v_estado <> 'PROVEEDOR_DESISTIO' then
    raise exception 'Esta orden no está marcada como desistida.' using errcode = '55000';
  end if;

  update public.ordenes_compra
     set desistio_resolucion = p_resolucion,
         desistio_resuelto_en = now(),
         desistio_nota = nullif(trim(coalesce(p_nota, '')), '')
   where id = p_orden_id;

  perform private.anotar('ORDEN', p_orden_id, 'PROVEEDOR_DESISTIO', p_resolucion, p_nota);
end;
$function$;

-- public.registrar_salida(p_almacen_id bigint, p_articulo_id bigint, p_cantidad numeric, p_motivo text, p_tipo text, p_fecha date)
-- venia de: 20260727190000_inventario.sql
CREATE OR REPLACE FUNCTION public.registrar_salida(p_almacen_id bigint, p_articulo_id bigint, p_cantidad numeric, p_motivo text, p_tipo text DEFAULT 'SALIDA_CONSUMO'::text, p_fecha date DEFAULT NULL::date)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_existencia numeric;
  v_costo      numeric;
  v_articulo   text;
  v_id         bigint;
begin
  perform private.exigir_rol('ALMACEN');

  if p_tipo not in ('SALIDA_CONSUMO', 'SALIDA_MERMA', 'SALIDA_DESPACHO') then
    raise exception 'Tipo de salida no válido: %.', p_tipo using errcode = '22023';
  end if;

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe para qué sale. Una salida sin motivo no se puede auditar.'
      using errcode = '22023';
  end if;

  v_existencia := private.existencia_para_escribir(p_almacen_id, p_articulo_id);

  -- Sacar más de lo que hay produce existencias negativas, y una existencia
  -- negativa no es un dato: es un error que alguien tendrá que deshacer.
  if p_cantidad > v_existencia then
    select nombre into v_articulo from public.articulos where id = p_articulo_id;
    raise exception 'De "%" solo hay % en existencia y se intentan sacar %.',
      coalesce(v_articulo, p_articulo_id::text), private.numero_es(v_existencia, 4), private.numero_es(p_cantidad, 4)
      using errcode = '22023';
  end if;

  v_costo := private.costo_promedio(p_almacen_id, p_articulo_id);

  v_id := private.registrar_movimiento(
    p_tipo, -1, p_almacen_id, p_articulo_id, p_cantidad, v_costo,
    p_motivo, null, null, null, p_fecha);

  return v_id;
end;
$function$;

-- public.reversar_movimiento(p_id bigint, p_motivo text)
-- venia de: 20260729140000_inventario_transferencias.sql
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

-- private.avisar_asignaciones_vencidas()
-- venia de: 20260826160000_la_herramienta_prestada_tiene_fecha_de_vuelta.sql
CREATE OR REPLACE FUNCTION private.avisar_asignaciones_vencidas()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fila record;
  v_cuantas integer := 0;
begin
  for v_fila in
    select a.id, a.numero, ar.nombre as articulo, a.cantidad, ar.unidad,
           (em.nombres || ' ') || em.apellidos as empleado, em.ficha,
           current_date - a.fecha_limite as dias
    from public.asignaciones_herramienta a
    join public.articulos ar on ar.id = a.articulo_id
    join public.empleados em on em.id = a.empleado_id
    where a.estado = 'ASIGNADA'
      and a.fecha_limite is not null
      and a.fecha_limite < current_date
      and a.aviso_vencida_en is null
  loop
    perform private.notificar(
      'ASIGNACIONES', 'ASIGNACION_VENCIDA',
      'Una herramienta no volvió a tiempo',
      format('%s · %s %s de %s — %s (ficha %s) · %s día%s de retraso',
             v_fila.numero, trim(private.cantidad_es(v_fila.cantidad)),
             v_fila.unidad, v_fila.articulo, v_fila.empleado, v_fila.ficha,
             v_fila.dias, case when v_fila.dias = 1 then '' else 's' end),
      '/app/asignaciones', array['ALMACEN', 'ADMIN'], 'ATENCION');

    update public.asignaciones_herramienta
       set aviso_vencida_en = now()
     where id = v_fila.id;

    v_cuantas := v_cuantas + 1;
  end loop;

  return v_cuantas;
end;
$function$;

-- public.registrar_apertura(p_cuenta bigint, p_monto numeric, p_fecha date, p_nota text)
-- venia de: 20260727210000_tesoreria.sql
CREATE OR REPLACE FUNCTION public.registrar_apertura(p_cuenta bigint, p_monto numeric, p_fecha date DEFAULT NULL::date, p_nota text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.exigir_permiso('TESORERIA', 'ESCRITURA');

  if exists (select 1 from public.tesoreria_movimientos
              where cuenta_id = p_cuenta and tipo = 'APERTURA') then
    raise exception 'Esta cuenta ya tiene su saldo de apertura. Si estaba mal, corrígelo con un ajuste.'
      using errcode = '55000';
  end if;

  return private.registrar_movimiento_tesoreria(
    p_cuenta, 'APERTURA', 1, p_monto, 'Saldo de apertura', p_fecha,
    null, null, null, null, null, p_nota);
end;
$function$;

-- public.saldar_herramienta_perdida(p_id bigint, p_como text, p_fecha date, p_nota text, p_periodo_id bigint)
-- venia de: 20260826170000_lo_perdido_se_descuenta_por_nomina.sql
CREATE OR REPLACE FUNCTION public.saldar_herramienta_perdida(p_id bigint, p_como text, p_fecha date DEFAULT NULL::date, p_nota text DEFAULT NULL::text, p_periodo_id bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_a        record;
  v_periodo  record;
  v_art      text;
  v_novedad  bigint;
begin
  perform private.exigir_permiso('ASIGNACIONES', 'ESCRITURA');

  if p_como not in ('DESCUENTO', 'REPOSICION', 'EXONERADO') then
    raise exception 'Se salda con un descuento, una reposición o una exoneración.'
      using errcode = '22023';
  end if;

  select * into v_a from public.asignaciones_herramienta where id = p_id for update;
  if v_a.id is null then
    raise exception 'No existe la asignación %.', p_id using errcode = 'P0002';
  end if;
  if v_a.estado not in ('PERDIDA', 'DANADA') then
    raise exception 'Esa asignación está %: solo se cierra lo que tuvo una incidencia.',
      lower(v_a.estado) using errcode = '55000';
  end if;

  if p_como = 'DESCUENTO' then
    if coalesce(v_a.costo_usd, 0) <= 0 then
      raise exception 'Esa herramienta no tiene costo calculado, así que no hay cuánto descontar. Sáldala con reposición o exoneración.'
        using errcode = '22023';
    end if;

    /*
      El período: el que digan, o el último que siga admitiendo cambios.

      `BORRADOR` y `CALCULADA` son los dos que aceptan novedades —es la misma
      regla que aplica `guardar_novedad_monto`—; en `CALCULADA` habrá que volver
      a calcular para que el recibo lo recoja, y eso ya lo sabe quien lleva la
      nómina.
    */
    select * into v_periodo
    from public.nomina_periodos
    where estado in ('BORRADOR', 'CALCULADA')
      and (p_periodo_id is null or id = p_periodo_id)
    order by hasta desc
    limit 1;

    if v_periodo.id is null then
      raise exception 'No hay ningún período de nómina que admita cambios donde cargar el descuento. Abre el período, o sáldala con reposición o exoneración.'
        using errcode = '55000';
    end if;

    select nombre into v_art from public.articulos where id = v_a.articulo_id;

    insert into public.nomina_novedades_montos
      (periodo_id, empleado_id, concepto, monto, moneda, nota, registrado_por)
    values
      (v_periodo.id, v_a.empleado_id, 'DED-HERR', v_a.costo_usd, 'USD',
       format('%s · %s (%s) · %s',
              coalesce(v_a.numero, 'ASG-' || v_a.id), coalesce(v_art, 'herramienta'),
              trim(private.cantidad_es(v_a.cantidad)),
              coalesce(nullif(btrim(coalesce(p_nota, '')), ''), v_a.motivo, 'sin motivo')),
       (select auth.uid()))
    returning id into v_novedad;
  end if;

  update public.asignaciones_herramienta
     set estado = 'REPUESTA', saldado_como = p_como,
         saldado_el = coalesce(p_fecha, current_date),
         descuento_id = v_novedad,
         nota = coalesce(nullif(btrim(coalesce(p_nota, '')), ''), nota)
   where id = p_id;

  return p_id;
end;
$function$;

-- public.registrar_ingreso(p_cuenta bigint, p_monto numeric, p_concepto text, p_fecha date, p_referencia text, p_contraparte text, p_nota text)
-- venia de: 20260727210000_tesoreria.sql
CREATE OR REPLACE FUNCTION public.registrar_ingreso(p_cuenta bigint, p_monto numeric, p_concepto text, p_fecha date DEFAULT NULL::date, p_referencia text DEFAULT NULL::text, p_contraparte text DEFAULT NULL::text, p_nota text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.exigir_permiso('TESORERIA', 'ESCRITURA');

  if length(trim(coalesce(p_concepto, ''))) < 4 then
    raise exception 'Escribe de qué es el ingreso. Un monto sin concepto no se puede conciliar después.'
      using errcode = '22023';
  end if;

  return private.registrar_movimiento_tesoreria(
    p_cuenta, 'INGRESO', 1, p_monto, p_concepto, p_fecha,
    p_referencia, p_contraparte, null, null, null, p_nota);
end;
$function$;

-- public.registrar_pago(p_instruccion_id bigint, p_cuenta_id bigint, p_referencia text, p_fecha date, p_nota text)
-- venia de: 20260822130000_pagos_por_lote_con_prioridad_y_unidad.sql
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
      'IGTF ' || rtrim(rtrim(private.numero_es(v_i.igtf_alicuota, 2), '0'), '.') ||
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

-- public.transferir_entre_cuentas(p_origen bigint, p_destino bigint, p_monto numeric, p_monto_destino numeric, p_fecha date, p_referencia text, p_nota text)
-- venia de: 20260727210000_tesoreria.sql
CREATE OR REPLACE FUNCTION public.transferir_entre_cuentas(p_origen bigint, p_destino bigint, p_monto numeric, p_monto_destino numeric DEFAULT NULL::numeric, p_fecha date DEFAULT NULL::date, p_referencia text DEFAULT NULL::text, p_nota text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ori     record;
  v_des     record;
  v_llega   numeric;
  v_sale_id bigint;
  v_entra_id bigint;
begin
  perform private.exigir_permiso('TESORERIA', 'ESCRITURA');

  if p_origen = p_destino then
    raise exception 'El origen y el destino son la misma cuenta.' using errcode = '22023';
  end if;

  select * into v_ori from public.cuentas_tesoreria where id = p_origen;
  select * into v_des from public.cuentas_tesoreria where id = p_destino;

  if v_ori.id is null or v_des.id is null then
    raise exception 'Alguna de las dos cuentas no existe.' using errcode = 'P0002';
  end if;

  -- Entre monedas distintas, lo que llega no se calcula: se copia del
  -- comprobante. La casa de cambio no aplica la tasa oficial y el sistema no
  -- va a inventar un número que el banco desmienta.
  if v_ori.moneda = v_des.moneda then
    v_llega := coalesce(p_monto_destino, p_monto);
    if v_llega <> p_monto then
      raise exception 'Entre dos cuentas en % debe llegar lo mismo que sale. Si el banco cobró comisión, regístrala aparte.', v_ori.moneda
        using errcode = '22023';
    end if;
  else
    v_llega := p_monto_destino;
    if coalesce(v_llega, 0) <= 0 then
      raise exception 'Indica cuánto llegó en % : entre monedas distintas el monto lo decide el cambio, no el sistema.', v_des.moneda
        using errcode = '22023';
    end if;
  end if;

  v_sale_id := private.registrar_movimiento_tesoreria(
    p_origen, 'TRANSFERENCIA', -1, p_monto,
    'Transferencia a ' || v_des.nombre, p_fecha, p_referencia, v_des.nombre,
    null, null, null, p_nota);

  v_entra_id := private.registrar_movimiento_tesoreria(
    p_destino, 'TRANSFERENCIA', 1, v_llega,
    'Transferencia desde ' || v_ori.nombre, p_fecha, p_referencia, v_ori.nombre,
    null, null, null, p_nota);

  update public.tesoreria_movimientos set transferencia_par = v_entra_id where id = v_sale_id;
  update public.tesoreria_movimientos set transferencia_par = v_sale_id  where id = v_entra_id;

  return v_sale_id;
end;
$function$;

-- public.calcular_nomina(p_periodo_id bigint)
-- venia de: 20260820160000_la_nomina_valora_toda_con_la_misma_tasa.sql
CREATE OR REPLACE FUNCTION public.calcular_nomina(p_periodo_id bigint)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_p        record;
  v_emp      record;
  v_nov      record;
  v_m        record;

  v_sm       numeric;
  v_horas_jornada numeric;
  v_dias_pagados  numeric;
  v_dias_facturados numeric;
  v_dias_laborados  numeric;

  -- Lo que hace falta para prorratear a quien entra o sale a mitad de periodo.
  v_dias_rango   integer;
  v_desde_emp    date;
  v_hasta_emp    date;
  v_dias_en      integer;
  v_egresado_en  date;

  v_basico_diario numeric;
  v_valor_hora    numeric;
  v_monto         numeric;

  v_tasa_salario numeric;
  v_tasa_linea   numeric;

  v_recargo_he    numeric;
  v_recargo_noc   numeric;
  v_recargo_fer   numeric;
  v_modo          numeric;

  v_recibo_id     bigint;
  v_asignaciones  numeric;
  v_deducciones   numeric;
  v_aportes       numeric;
  v_normal        numeric;
  v_normal_diario numeric;
  v_integral_diario numeric;
  v_normal_mensual  numeric;
  v_integral_mensual numeric;
  v_base            numeric;
  v_tope_prestamo   numeric;

  v_dias_bv       numeric;
  v_dias_util     numeric;
  v_recibos       integer := 0;
  v_frecuencias   text;
begin
  perform private.exigir_rol('RRHH');

  select * into v_p from public.nomina_periodos where id = p_periodo_id;

  if v_p.id is null then
    raise exception 'No existe el período %.', p_periodo_id using errcode = 'P0002';
  end if;

  if v_p.estado not in ('BORRADOR', 'CALCULADA') then
    raise exception 'El período está en "%" y ya no se recalcula. Anúlalo si hay que rehacerlo.', v_p.estado
      using errcode = '55000';
  end if;

  delete from public.nomina_recibos where periodo_id = p_periodo_id;

  v_sm            := private.parametro('salario_minimo_nacional', v_p.hasta);
  v_recargo_he    := private.parametro('recargo_hora_extra', v_p.hasta) / 100;
  v_recargo_noc   := private.parametro('recargo_bono_nocturno', v_p.hasta) / 100;
  v_recargo_fer   := private.parametro('recargo_feriado_trabajado', v_p.hasta) / 100;
  v_modo          := private.parametro('modo_concurrencia_recargos', v_p.hasta);

  v_dias_rango := (v_p.hasta - v_p.desde) + 1;

  /*
    SE QUITO EL `and activo` DE ESTE FILTRO, Y ESE ERA EL FALLO.

    La ventana de fechas de las dos lineas siguientes ya dice exactamente quien
    pertenece al periodo: entro antes de que terminara y no se habia ido antes
    de que empezara. Esa condicion existe para incluir a quien sale a mitad de
    quincena — es su unico proposito.

    Pero `egresar_empleado` apaga `activo` a la vez que pone `fecha_egreso`, asi
    que el `and activo` borraba a esa persona del calculo el mismo dia que se le
    daba de baja. El resultado es que a quien se va el 26 no se le paga la
    quincena que trabajo hasta el 26, que es dinero que se le debe.

    Se comprobo antes de quitarlo que la columna es redundante y no un segundo
    criterio: en la base no hay ni un solo empleado con `activo = false` sin
    `fecha_egreso`, ni uno activo con fecha de egreso puesta. Las dos dicen lo
    mismo, y solo una de las dos sabe de fechas.
  */
  for v_emp in
    select * from public.empleados
    where fecha_ingreso <= v_p.hasta
      and (fecha_egreso is null or fecha_egreso >= v_p.desde)
      and (v_p.tipo = 'ESPECIAL' or frecuencia = v_p.tipo)
    order by apellidos, nombres
  loop
    select * into v_nov
    from public.nomina_novedades
    where periodo_id = p_periodo_id and empleado_id = v_emp.id;

    v_horas_jornada := private.parametro(
      case v_emp.tipo_jornada
        when 'NOCTURNA' then 'jornada_nocturna_horas'
        when 'MIXTA'    then 'jornada_mixta_horas'
        else 'jornada_diurna_horas'
      end, v_p.hasta);

    /*
      LOS DIAS SE PRORRATEAN AL TIEMPO QUE ESTUVO EN NOMINA.

      Sin esto, incluir al que sale a mitad de periodo seria cambiar un error
      por otro: dejaria de no cobrar y pasaria a cobrar la quincena entera.

      Se cuenta el solape entre el rango del periodo y el tiempo que la persona
      estuvo empleada, y se aplica esa proporcion a los dias que paga el
      periodo. Para quien estuvo el periodo completo el solape es el rango
      entero y sale `v_p.dias` exacto, asi que el caso normal no cambia en nada
      — que es la propiedad que hace seguro este arreglo.

      Vale igual para quien ENTRA a mitad de periodo, que hasta ahora tambien
      cobraba la quincena completa desde su primer dia.
    */
    v_desde_emp := greatest(v_emp.fecha_ingreso, v_p.desde);
    v_hasta_emp := least(coalesce(v_emp.fecha_egreso, v_p.hasta), v_p.hasta);
    v_dias_en   := (v_hasta_emp - v_desde_emp) + 1;

    if v_dias_en <= 0 then
      continue;
    end if;

    v_dias_facturados := case
      when v_dias_en >= v_dias_rango then v_p.dias
      else round(v_p.dias * v_dias_en::numeric / v_dias_rango, 2)
    end;

    v_dias_laborados  := greatest(v_dias_facturados
                                  - coalesce(v_nov.faltas_injustificadas, 0)
                                  - coalesce(v_nov.faltas_justificadas, 0), 0);
    v_dias_pagados := v_dias_facturados - coalesce(v_nov.faltas_injustificadas, 0);

    if v_dias_pagados <= 0 then
      continue;
    end if;

    -- Se congela en el recibo si la salida cae dentro de este periodo. Va aqui
    -- y no se lee de la ficha al imprimir porque un recibo es un documento:
    -- dice lo que era cierto el dia que se emitio, y no cambia si manana la
    -- persona se reincorpora.
    v_egresado_en := case
      when v_emp.fecha_egreso between v_p.desde and v_p.hasta then v_emp.fecha_egreso
    end;

    v_basico_diario := case v_emp.base_estipulacion
      when 'MENSUAL' then v_emp.salario_base / private.parametro('dias_mes_nomina', v_p.hasta)
      when 'DIARIO'  then v_emp.salario_base
      when 'HORA'    then v_emp.salario_base * v_horas_jornada
    end;

    v_tasa_salario := private.tasa_de_nomina(
      v_emp.moneda_salario, v_p.tasa_usd, v_p.hasta);

    v_basico_diario := v_basico_diario * v_tasa_salario;

    v_valor_hora := v_basico_diario / v_horas_jornada;

    insert into public.nomina_recibos
      (periodo_id, empleado_id, dias_pagados, dias_facturados, dias_laborados,
       salario_basico_diario, egresado_en)
    values (p_periodo_id, v_emp.id, v_dias_pagados, v_dias_facturados,
            v_dias_laborados, v_basico_diario, v_egresado_en)
    returning id into v_recibo_id;

    v_monto := round(v_basico_diario * v_dias_pagados, 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'SAL-BAS', 'Salario del período', v_dias_pagados,
            v_basico_diario, v_monto, 'ASIGNACION', 10);

    if coalesce(v_nov.horas_extra_diurnas, 0) > 0 then
      v_monto := round(v_nov.horas_extra_diurnas * v_valor_hora * (1 + v_recargo_he), 2);
      insert into public.nomina_recibo_lineas
        (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
      values (v_recibo_id, 'HE-DIU', 'Horas extra diurnas',
              v_nov.horas_extra_diurnas, v_valor_hora, v_monto, 'ASIGNACION', 30);
    end if;

    if coalesce(v_nov.horas_extra_nocturnas, 0) > 0 then
      v_monto := round(v_nov.horas_extra_nocturnas * v_valor_hora *
                 case when v_modo = 2
                      then (1 + v_recargo_he) * (1 + v_recargo_noc)
                      else 1 + v_recargo_he + v_recargo_noc end, 2);
      insert into public.nomina_recibo_lineas
        (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
      values (v_recibo_id, 'HE-NOC', 'Horas extra nocturnas',
              v_nov.horas_extra_nocturnas, v_valor_hora, v_monto, 'ASIGNACION', 35);
    end if;

    if coalesce(v_nov.horas_nocturnas, 0) > 0 then
      v_monto := round(v_nov.horas_nocturnas * v_valor_hora * v_recargo_noc, 2);
      insert into public.nomina_recibo_lineas
        (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
      values (v_recibo_id, 'BON-NOC', 'Bono nocturno',
              v_nov.horas_nocturnas, v_valor_hora, v_monto, 'ASIGNACION', 40);
    end if;

    if coalesce(v_nov.dias_feriados_trabajados, 0) > 0 then
      v_monto := round(v_nov.dias_feriados_trabajados * v_basico_diario * v_recargo_fer, 2);
      insert into public.nomina_recibo_lineas
        (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
      values (v_recibo_id, 'FER-TRAB', 'Recargo por feriado trabajado',
              v_nov.dias_feriados_trabajados, v_basico_diario, v_monto, 'ASIGNACION', 45);
    end if;

    if coalesce(v_nov.dias_descanso_trabajados, 0) > 0 then
      v_monto := round(v_nov.dias_descanso_trabajados * v_basico_diario * v_recargo_fer, 2);
      insert into public.nomina_recibo_lineas
        (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
      values (v_recibo_id, 'DESC-TRAB', 'Recargo por descanso trabajado',
              v_nov.dias_descanso_trabajados, v_basico_diario, v_monto, 'ASIGNACION', 50);
    end if;

    for v_m in
      select n.*, c.nombre, c.tipo, c.orden
      from public.nomina_novedades_montos n
      join public.nomina_conceptos c on c.codigo = n.concepto
      where n.periodo_id = p_periodo_id and n.empleado_id = v_emp.id
        and c.tipo = 'ASIGNACION'
    loop
      v_tasa_linea := private.tasa_de_nomina(v_m.moneda, v_p.tasa_usd, v_p.hasta);
      v_monto := round(v_m.monto * v_tasa_linea, 2);

      insert into public.nomina_recibo_lineas
        (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
      values (v_recibo_id, v_m.concepto, coalesce(v_m.nota, v_m.nombre),
              null, null, v_monto, 'ASIGNACION', v_m.orden);
    end loop;

    select coalesce(sum(l.monto), 0) into v_normal
    from public.nomina_recibo_lineas l
    join public.nomina_conceptos c on c.codigo = l.concepto
    where l.recibo_id = v_recibo_id and c.incide_normal;

    v_normal_diario  := v_normal / v_dias_pagados;
    v_normal_mensual := v_normal_diario * private.parametro('dias_mes_nomina', v_p.hasta);

    v_dias_bv   := private.dias_bono_vacacional(v_emp.id, v_p.hasta);
    v_dias_util := coalesce(v_emp.dias_utilidades,
                            private.parametro('utilidades_dias_minimo', v_p.hasta));

    v_integral_diario := v_normal_diario
      + (v_normal_diario * v_dias_bv)   / private.parametro('dias_base_alicuotas', v_p.hasta)
      + (v_normal_diario * v_dias_util) / private.parametro('dias_base_alicuotas', v_p.hasta);

    v_integral_mensual := v_integral_diario * private.parametro('dias_mes_nomina', v_p.hasta);

    v_monto := round(
      private.parametro('cestaticket_mensual_usd', v_p.hasta) * v_p.tasa_usd
      / private.parametro('dias_mes_nomina', v_p.hasta) * v_dias_pagados, 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'CESTA', 'Beneficio de alimentación', v_dias_pagados,
            null, v_monto, 'ASIGNACION', 70);

    v_base := least(v_normal_mensual,
                    v_sm * private.parametro('ivss_tope_salarios_minimos', v_p.hasta));
    v_monto := round(v_base * private.parametro('ivss_trabajador', v_p.hasta) / 100
                     * v_dias_pagados / private.parametro('dias_mes_nomina', v_p.hasta), 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'DED-IVSS', 'Seguro social obligatorio', null, v_base,
            v_monto, 'DEDUCCION', 110);

    v_base := greatest(
      least(v_normal_mensual, v_sm * private.parametro('rpe_tope_salarios_minimos', v_p.hasta)),
      v_sm * private.parametro('rpe_piso_salarios_minimos', v_p.hasta));
    v_monto := round(v_base * private.parametro('rpe_trabajador', v_p.hasta) / 100
                     * v_dias_pagados / private.parametro('dias_mes_nomina', v_p.hasta), 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'DED-RPE', 'Régimen prestacional de empleo', null, v_base,
            v_monto, 'DEDUCCION', 115);

    v_monto := round(v_integral_mensual * private.parametro('faov_trabajador', v_p.hasta) / 100
                     * v_dias_pagados / private.parametro('dias_mes_nomina', v_p.hasta), 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'DED-FAOV', 'Fondo de ahorro para la vivienda', null,
            v_integral_mensual, v_monto, 'DEDUCCION', 120);

    v_tope_prestamo := round(
      (v_normal + 0) * private.parametro('descuento_prestamo_max', v_p.hasta) / 100, 2);

    for v_m in
      select n.*, c.nombre, c.orden
      from public.nomina_novedades_montos n
      join public.nomina_conceptos c on c.codigo = n.concepto
      where n.periodo_id = p_periodo_id and n.empleado_id = v_emp.id
        and c.tipo = 'DEDUCCION'
      order by c.orden
    loop
      v_tasa_linea := private.tasa_de_nomina(v_m.moneda, v_p.tasa_usd, v_p.hasta);
      v_monto := round(v_m.monto * v_tasa_linea, 2);

      if v_m.concepto in ('DED-PRE', 'DED-ANT') and v_monto > v_tope_prestamo then
        raise exception 'A % no se le pueden descontar % por "%": el tope del período es % (un tercio de lo que gana, LOTTT 154).',
          v_emp.nombres || ' ' || v_emp.apellidos, private.numero_es(v_monto, 2), v_m.nombre, private.numero_es(v_tope_prestamo, 2)
          using errcode = '22023';
      end if;

      insert into public.nomina_recibo_lineas
        (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
      values (v_recibo_id, v_m.concepto, coalesce(v_m.nota, v_m.nombre),
              null, null, v_monto, 'DEDUCCION', v_m.orden);
    end loop;

    v_base := least(v_normal_mensual,
                    v_sm * private.parametro('ivss_tope_salarios_minimos', v_p.hasta));
    v_monto := round(v_base * private.parametro('ivss_patronal', v_p.hasta) / 100
                     * v_dias_pagados / private.parametro('dias_mes_nomina', v_p.hasta), 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'APO-IVSS', 'Aporte patronal al seguro social', null,
            v_base, v_monto, 'APORTE', 210);

    v_base := greatest(
      least(v_normal_mensual, v_sm * private.parametro('rpe_tope_salarios_minimos', v_p.hasta)),
      v_sm * private.parametro('rpe_piso_salarios_minimos', v_p.hasta));
    v_monto := round(v_base * private.parametro('rpe_patronal', v_p.hasta) / 100
                     * v_dias_pagados / private.parametro('dias_mes_nomina', v_p.hasta), 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'APO-RPE', 'Aporte patronal al régimen de empleo', null,
            v_base, v_monto, 'APORTE', 215);

    v_monto := round(v_integral_mensual * private.parametro('faov_patronal', v_p.hasta) / 100
                     * v_dias_pagados / private.parametro('dias_mes_nomina', v_p.hasta), 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'APO-FAOV', 'Aporte patronal al FAOV', null,
            v_integral_mensual, v_monto, 'APORTE', 220);

    v_monto := round(v_integral_diario
                     * private.parametro('prestaciones_dias_trimestre', v_p.hasta)
                     / 90 * v_dias_pagados, 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'PRV-GAR', 'Provisión de prestaciones sociales', null,
            v_integral_diario, v_monto, 'PROVISION', 310);

    select
      coalesce(sum(monto) filter (where tipo = 'ASIGNACION'), 0),
      coalesce(sum(monto) filter (where tipo = 'DEDUCCION'), 0),
      coalesce(sum(monto) filter (where tipo in ('APORTE', 'PROVISION')), 0)
    into v_asignaciones, v_deducciones, v_aportes
    from public.nomina_recibo_lineas where recibo_id = v_recibo_id;

    update public.nomina_recibos set
      salario_normal_diario   = round(v_normal_diario, 6),
      salario_integral_diario = round(v_integral_diario, 6),
      total_asignaciones      = v_asignaciones,
      total_deducciones       = v_deducciones,
      total_aportes           = v_aportes,
      neto_usd                = round((v_asignaciones - v_deducciones) / v_p.tasa_usd, 2)
    where id = v_recibo_id;

    v_recibos := v_recibos + 1;
  end loop;

  if v_recibos = 0 and v_p.tipo <> 'ESPECIAL' then
    select string_agg(distinct frecuencia, ', ' order by frecuencia)
      into v_frecuencias
    from public.empleados
    where fecha_ingreso <= v_p.hasta
      and (fecha_egreso is null or fecha_egreso >= v_p.desde);

    if v_frecuencias is not null then
      raise exception 'Ningún trabajador activo cobra de forma %. Los que hay cobran: %. Abre el período que corresponda, o corrige la frecuencia en la ficha del trabajador.',
        lower(v_p.tipo), lower(v_frecuencias) using errcode = '55000';
    end if;
  end if;

  update public.nomina_periodos
     set estado = 'CALCULADA', calculada_en = now()
   where id = p_periodo_id;

  return v_recibos;
end;
$function$;

-- public.aprobar_nomina(p_periodo_id bigint)
-- venia de: 20260728110000_nomina_calculo.sql
CREATE OR REPLACE FUNCTION public.aprobar_nomina(p_periodo_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_p       record;
  v_recibos integer;
  v_neto    numeric;
begin
  perform private.exigir_rol('GERENTE_GENERAL');

  select * into v_p from public.nomina_periodos where id = p_periodo_id;

  if v_p.id is null then
    raise exception 'No existe el período %.', p_periodo_id using errcode = 'P0002';
  end if;

  if v_p.estado <> 'CALCULADA' then
    raise exception 'Solo se aprueba una nómina calculada. Esta está en "%".', v_p.estado
      using errcode = '55000';
  end if;

  select count(*), coalesce(sum(neto), 0) into v_recibos, v_neto
  from public.nomina_recibos where periodo_id = p_periodo_id;

  if v_recibos = 0 then
    raise exception 'Este período no tiene ningún recibo. Calcúlalo antes de aprobarlo.'
      using errcode = '55000';
  end if;

  update public.nomina_periodos
     set estado = 'APROBADA', aprobada_por = (select auth.uid()), aprobada_en = now()
   where id = p_periodo_id;

  perform private.notificar(
    'NOMINA', 'APROBADA',
    'Nómina ' || v_p.numero || ' aprobada',
    v_recibos || ' recibos por ' || private.numero_es(v_neto, 2) || ' Bs. Lista para pagar.',
    '/app/nomina/procesos',
    array['RRHH'], 'ATENCION');
end;
$function$;

-- public.asignar_herramienta(p_articulo_id bigint, p_almacen_id bigint, p_empleado_id bigint, p_cantidad numeric, p_fecha date, p_nota text, p_fecha_limite date)
-- venia de: 20260826160000_la_herramienta_prestada_tiene_fecha_de_vuelta.sql
CREATE OR REPLACE FUNCTION public.asignar_herramienta(p_articulo_id bigint, p_almacen_id bigint, p_empleado_id bigint, p_cantidad numeric, p_fecha date DEFAULT NULL::date, p_nota text DEFAULT NULL::text, p_fecha_limite date DEFAULT NULL::date)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fecha date := coalesce(p_fecha, current_date);
  v_emp record; v_art record; v_libres numeric; v_id bigint;
begin
  perform private.exigir_permiso('ASIGNACIONES', 'ESCRITURA');

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad tiene que ser mayor que cero.' using errcode = '22023';
  end if;
  if v_fecha > current_date then
    raise exception 'No se entrega una herramienta con fecha futura.' using errcode = '22023';
  end if;
  if p_fecha_limite is not null and p_fecha_limite < v_fecha then
    raise exception 'La fecha de devolución no puede ser anterior a la de entrega.'
      using errcode = '22023';
  end if;

  select * into v_art from public.articulos where id = p_articulo_id;
  if v_art.id is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
  end if;

  select * into v_emp from public.empleados where id = p_empleado_id;
  if v_emp.id is null then
    raise exception 'No existe el trabajador %.', p_empleado_id using errcode = 'P0002';
  end if;
  if v_emp.fecha_egreso is not null then
    raise exception '% ya no trabaja en la empresa.', v_emp.nombres || ' ' || v_emp.apellidos
      using errcode = '55000';
  end if;

  -- `existencia_para_escribir` y no `existencia`: toma el cerrojo ANTES de
  -- leer, que es el único orden que impide que dos entregas simultáneas
  -- decidan las dos que alcanzaba.
  select private.existencia_para_escribir(p_almacen_id, p_articulo_id)
       - coalesce((select sum(cantidad) from public.asignaciones_herramienta
                    where articulo_id = p_articulo_id and almacen_id = p_almacen_id
                      and estado = 'ASIGNADA'), 0)
    into v_libres;

  if v_libres < p_cantidad then
    raise exception 'Solo quedan % de "%" sin asignar.', private.numero_es(v_libres, 4), v_art.nombre
      using errcode = '55000';
  end if;

  insert into public.asignaciones_herramienta
    (numero, articulo_id, almacen_id, empleado_id, cantidad, fecha_entrega,
     fecha_limite, nota, entregado_por)
  values
    (private.siguiente_numero('ASG'), p_articulo_id, p_almacen_id, p_empleado_id,
     p_cantidad, v_fecha, p_fecha_limite,
     nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$function$;

-- private.auditar()
-- venia de: 20260730120000_auditoria.sql
CREATE OR REPLACE FUNCTION private.auditar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_quien record; v_antes jsonb; v_despues jsonb; v_fila jsonb; v_cambios text[];
  v_clave text; v_partes text[] := '{}'; v_etiqueta text; v_col text;
  v_modulo text; v_motivo text;
begin
  if TG_OP = 'DELETE' then
    v_antes := to_jsonb(OLD);
  elsif TG_OP = 'INSERT' then
    v_despues := to_jsonb(NEW);
  else
    v_antes := to_jsonb(OLD); v_despues := to_jsonb(NEW);
    select array_agg(e.key order by e.key) into v_cambios
      from jsonb_each(v_despues) e where e.value is distinct from v_antes -> e.key;
    -- Un UPDATE que no cambio nada no es un movimiento. Anotarlo llenaria el
    -- registro de renglones vacios entre los que si dicen algo.
    if v_cambios is null then return null; end if;
  end if;

  v_fila := coalesce(v_despues, v_antes);

  -- La clave primaria, tal como la declaro la tabla.
  foreach v_col in array TG_ARGV loop
    v_partes := v_partes || coalesce(v_fila ->> v_col, '?');
  end loop;
  v_clave := nullif(array_to_string(v_partes, '·'), '');

  -- Con que reconocerla de un vistazo. Es una preferencia, no una regla.
  --
  -- `rol` va de los primeros a proposito. Las tablas que reparten permisos se
  -- identifican por un uuid y un codigo, y sin etiqueta el registro ensenaba
  -- «e0a9d9b2-…·RRHH», que no dice quien le dio que a quien.
  foreach v_col in array array[
    'numero', 'razon_social', 'nombres', 'nombre', 'titulo', 'rol', 'usuario',
    'concepto', 'descripcion', 'cargo', 'clave', 'codigo'
  ] loop
    if v_fila ? v_col and nullif(trim(coalesce(v_fila ->> v_col, '')), '') is not null then
      v_etiqueta := left(v_fila ->> v_col, 120); exit;
    end if;
  end loop;

  /*
    EL PORQUE, SUBIDO A COLUMNA PROPIA.

    Estaba guardado —dentro de `despues`— pero habia que abrir el JSON para
    leerlo, asi que no se podia filtrar por el ni listarlo. Christopher, el
    7/09/2026: «el sistema siempre debe de reflejar en lo posible la razon, para
    que todo sea transparente».

    Se busca en el orden en que las tablas de la casa nombran esa idea. El
    motivo de anulacion va PRIMERO: cuando existe, es la razon que mas importa
    de esa fila —alguien deshizo algo— y taparla con la nota de cuando se creo
    seria contar la mitad vieja de la historia.
  */
  foreach v_col in array array[
    'motivo_anulacion', 'motivo_cancelacion', 'motivo', 'razon', 'nota',
    'observacion', 'descripcion', 'causa'
  ] loop
    if v_fila ? v_col and nullif(trim(coalesce(v_fila ->> v_col, '')), '') is not null then
      v_motivo := left(v_fila ->> v_col, 500); exit;
    end if;
  end loop;

  -- El modulo se congela al escribir: si manana una tabla cambia de modulo, lo
  -- ya registrado sigue diciendo donde paso.
  select m.modulo into v_modulo from public.auditoria_modulos m where m.tabla = TG_TABLE_NAME;

  select * into v_quien from private.quien_escribe();

  insert into public.auditoria
    (usuario_id, usuario, nombre, tabla, operacion, fila_id, etiqueta,
     antes, despues, cambios, ip, modulo, motivo)
  values
    (v_quien.id, v_quien.usuario, v_quien.nombre, TG_TABLE_NAME, TG_OP, v_clave, v_etiqueta,
     v_antes, v_despues, v_cambios, private.ip_de_la_peticion(), v_modulo, v_motivo);

  return null;
end;
$function$;

-- public.eliminar_empleado(p_id bigint)
-- venia de: 20260806190000_personal_no_se_borra.sql
CREATE OR REPLACE FUNCTION public.eliminar_empleado(p_id bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_nombre text;
begin
  perform private.exigir_rol('RRHH');

  select trim(e.nombres || ' ' || e.apellidos) into v_nombre
    from public.empleados e where e.id = p_id;

  raise exception
    'Las fichas de personal ya no se borran: se desincorporan. Usa "Desincorporar" con la fecha y el motivo —"cargada por error" también es un motivo—, y % deja de salir entre los activos sin que se pierda lo que decía su ficha.',
    coalesce(v_nombre, 'esa persona')
    using errcode = '42501',
          hint = 'Un borrado no se puede deshacer desde la pantalla; una desincorporación se revierte volviendo a activar la ficha.';
end;
$function$;

-- public.respaldo_datos()
-- venia de: 20260806220000_respaldo.sql
CREATE OR REPLACE FUNCTION public.respaldo_datos()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tabla   text;
  v_datos   jsonb;
  v_filas   bigint;
  v_total   bigint := 0;
  v_tablas  int := 0;
  v_partes  text[] := '{}';
  v_orden   text[];
  v_forzar  text;
begin
  if not private.puede_respaldar() then
    raise exception 'Descargar el respaldo de la base requiere el rol Respaldo de la base. Este archivo lleva las cédulas, los sueldos y las cuentas bancarias de todo el personal: no se reparte.'
      using errcode = '42501';
  end if;

  with recursive
  tablas as (
    select c.oid, c.relname::text as nombre
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
  ),
  aristas as (
    select con.conrelid as hija, con.confrelid as madre
      from pg_constraint con
      join tablas h on h.oid = con.conrelid
      join tablas m on m.oid = con.confrelid
     where con.contype = 'f' and con.conrelid <> con.confrelid
  ),
  niveles as (
    select t.oid, t.nombre, 0 as nivel
      from tablas t
     where not exists (select 1 from aristas a where a.hija = t.oid)
    union all
    select t.oid, t.nombre, n.nivel + 1
      from tablas t
      join aristas a on a.hija = t.oid
      join niveles n on n.oid = a.madre
     where n.nivel < 20
  )
  -- Toda tabla entra, tenga nivel o no: las que se apuntan entre sí no cuelgan
  -- de ninguna y desaparecerían del respaldo sin que nada lo dijera.
  select array_agg(x.nombre order by x.nivel, x.nombre)
    into v_orden
    from (
      select t.nombre,
             coalesce((select max(n.nivel) from niveles n where n.nombre = t.nombre), 99) as nivel
        from tablas t
    ) x;

  v_partes := v_partes || format(
$cab$-- ============================================================================
-- RESPALDO DE LA BASE DE DATOS
-- %s · RIF %s
--
-- Generado el %s por %s.
--
-- QUÉ ES ESTE ARCHIVO
--
-- Todos los datos del sistema. No la estructura: esa vive en las migraciones
-- del repositorio. Para reconstruir la base hacen falta las dos cosas, y en
-- este orden: primero las migraciones sobre una base limpia, después este
-- archivo.
--
-- No lleva contraseñas. Los usuarios habrá que volver a crearlos.
--
-- CÓMO SE RESTAURA
--
--   psql "URL-DE-LA-BASE-NUEVA" -f este-archivo.sql
--
-- Va entero dentro de una transacción: si algo falla, no queda nada a medias.
--
-- CUIDADO CON ESTE ARCHIVO
--
-- Lleva las cédulas, los sueldos y las cuentas bancarias de todo el personal,
-- los precios, los clientes y la bitácora completa. Todo lo que el sistema
-- protege con permisos, junto y sin ninguna protección. No se manda por correo
-- ni queda en la carpeta de descargas de una computadora compartida.
-- ============================================================================

begin;

-- Los disparadores se apagan mientras se restaura. Si no, el de auditoría
-- anotaría cada fila restaurada como si alguien la acabara de escribir, y la
-- bitácora del sistema nuevo nacería con miles de renglones falsos.
set session_replication_role = replica;

$cab$,
    coalesce((select e.razon_social from public.empresa e where e.id = 1), 'MINERIA INTERNACIONAL TS, C.A.'),
    coalesce((select e.rif from public.empresa e where e.id = 1), '—'),
    to_char(now() at time zone 'America/Caracas', 'DD/MM/YYYY HH24:MI'),
    coalesce((select p.nombre || ' (' || p.usuario || ')' from public.perfiles p where p.id = (select auth.uid())), 'el sistema')
  );

  foreach v_tabla in array coalesce(v_orden, '{}'::text[]) loop
    execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb), count(*) from public.%I t', v_tabla)
      into v_datos, v_filas;

    v_tablas := v_tablas + 1;
    v_total  := v_total + v_filas;

    if v_filas = 0 then
      v_partes := v_partes || format(E'-- %s · sin filas\n', v_tabla);
      continue;
    end if;

    -- `overriding system value` solo donde hace falta: en una tabla sin columna
    -- de identidad, Postgres lo rechaza y tumbaría la restauración entera.
    select case when exists (
             select 1
               from pg_attribute a
               join pg_class c on c.oid = a.attrelid
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = v_tabla
                and a.attidentity = 'a' and a.attnum > 0 and not a.attisdropped
           ) then ' overriding system value' else '' end
      into v_forzar;

    v_partes := v_partes || format(
      E'-- %s · %s fila(s)\ndelete from public.%I;\ninsert into public.%I (%s)%s\nselect %s\n  from jsonb_populate_recordset(null::public.%I, %L::jsonb);\n\n',
      v_tabla, v_filas, v_tabla, v_tabla, (select string_agg(quote_ident(a.attname), ', ' order by a.attnum) from pg_attribute a where a.attrelid = ('public.'||quote_ident(v_tabla))::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''), v_forzar, (select string_agg(quote_ident(a.attname), ', ' order by a.attnum) from pg_attribute a where a.attrelid = ('public.'||quote_ident(v_tabla))::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''), v_tabla, v_datos::text);
  end loop;

  -- La cuenta tiene que cuadrar antes de entregar el archivo.
  if v_tablas <> (select count(*) from pg_class c
                    join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relkind = 'r') then
    raise exception 'El respaldo salió incompleto: se escribieron % tablas y en la base hay otra cantidad. No se entrega a medias.', v_tablas
      using errcode = 'XX000';
  end if;

  v_partes := v_partes || format(
    E'\nset session_replication_role = default;\n\ncommit;\n\n-- %s tabla(s) · %s fila(s) en total.\n',
    v_tablas, v_total);

  perform private.anotar_respaldo(v_tablas, v_total);

  return array_to_string(v_partes, '');
end;
$function$;

-- public.guardar_empresa(p_rif text, p_razon_social text, p_domicilio_fiscal text, p_ciudad text, p_estado text, p_zona_postal text, p_inscrito_el date, p_rif_actualizado_el date, p_rif_vence_el date, p_gerencia_seniat text, p_comprobante_rif text, p_condicion_iva text, p_retencion_iva_pct numeric, p_telefono text, p_correo text, p_alicuota_iva_pct numeric, p_imprenta_nombre text, p_imprenta_rif text, p_imprenta_autorizacion text)
-- venia de: 20260827120000_alicuota_e_imprenta.sql
CREATE OR REPLACE FUNCTION public.guardar_empresa(p_rif text, p_razon_social text, p_domicilio_fiscal text DEFAULT NULL::text, p_ciudad text DEFAULT NULL::text, p_estado text DEFAULT NULL::text, p_zona_postal text DEFAULT NULL::text, p_inscrito_el date DEFAULT NULL::date, p_rif_actualizado_el date DEFAULT NULL::date, p_rif_vence_el date DEFAULT NULL::date, p_gerencia_seniat text DEFAULT NULL::text, p_comprobante_rif text DEFAULT NULL::text, p_condicion_iva text DEFAULT NULL::text, p_retencion_iva_pct numeric DEFAULT NULL::numeric, p_telefono text DEFAULT NULL::text, p_correo text DEFAULT NULL::text, p_alicuota_iva_pct numeric DEFAULT NULL::numeric, p_imprenta_nombre text DEFAULT NULL::text, p_imprenta_rif text DEFAULT NULL::text, p_imprenta_autorizacion text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.exigir_rol('ADMIN', 'GERENTE_GENERAL');

  if length(trim(coalesce(p_razon_social, ''))) < 3 then
    raise exception 'La razón social no puede quedar vacía.' using errcode = '22023';
  end if;

  -- El RIF venezolano: una letra de tipo, ocho dígitos y el verificador.
  if trim(coalesce(p_rif, '')) !~ '^[JGVEP]-?[0-9]{8}-?[0-9]$' then
    raise exception 'El RIF "%" no tiene forma de RIF. Debe ser como J-50209170-0.', p_rif
      using errcode = '22023';
  end if;

  -- El de la imprenta es un RIF igual que el nuestro, y se comprueba igual:
  -- va impreso en la factura y el SENIAT lo mira.
  if nullif(trim(coalesce(p_imprenta_rif, '')), '') is not null
     and trim(p_imprenta_rif) !~ '^[JGVEP]-?[0-9]{8}-?[0-9]$' then
    raise exception 'El RIF de la imprenta "%" no tiene forma de RIF.', p_imprenta_rif
      using errcode = '22023';
  end if;

  update public.empresa set
    rif                = upper(trim(p_rif)),
    razon_social       = trim(p_razon_social),
    domicilio_fiscal   = nullif(trim(coalesce(p_domicilio_fiscal, '')), ''),
    ciudad             = nullif(trim(coalesce(p_ciudad, '')), ''),
    estado             = nullif(trim(coalesce(p_estado, '')), ''),
    zona_postal        = nullif(trim(coalesce(p_zona_postal, '')), ''),
    inscrito_el        = p_inscrito_el,
    rif_actualizado_el = p_rif_actualizado_el,
    rif_vence_el       = p_rif_vence_el,
    gerencia_seniat    = nullif(trim(coalesce(p_gerencia_seniat, '')), ''),
    comprobante_rif    = nullif(trim(coalesce(p_comprobante_rif, '')), ''),
    condicion_iva      = nullif(trim(coalesce(p_condicion_iva, '')), ''),
    retencion_iva_pct  = p_retencion_iva_pct,
    telefono           = nullif(trim(coalesce(p_telefono, '')), ''),
    correo             = nullif(trim(coalesce(p_correo, '')), ''),
    alicuota_iva_pct   = p_alicuota_iva_pct,
    imprenta_nombre    = nullif(trim(coalesce(p_imprenta_nombre, '')), ''),
    imprenta_rif       = upper(nullif(trim(coalesce(p_imprenta_rif, '')), '')),
    imprenta_autorizacion = nullif(trim(coalesce(p_imprenta_autorizacion, '')), ''),
    actualizado_por    = (select auth.uid()),
    actualizado_en     = now()
  where id = 1;
end;
$function$;

-- private.cargar_renglones_venta(p_tabla text, p_columna text, p_id bigint, p_renglones jsonb, p_moneda character, p_fecha date)
-- venia de: 20260804100000_ventas.sql
CREATE OR REPLACE FUNCTION private.cargar_renglones_venta(p_tabla text, p_columna text, p_id bigint, p_renglones jsonb, p_moneda character, p_fecha date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_item      jsonb;
  v_linea     smallint := 0;
  v_articulo  record;
  v_precio    numeric;
  v_precio_usd numeric;
  v_minimo    record;
begin
  if p_renglones is null or jsonb_array_length(p_renglones) = 0 then
    raise exception 'Un documento sin renglones no dice nada. Agrega al menos uno.'
      using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_linea := v_linea + 1;

    select a.id, a.nombre, a.unidad, a.activo, a.inventariable
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

    if coalesce((v_item ->> 'cantidad')::numeric, 0) <= 0 then
      raise exception 'La cantidad de "%" tiene que ser mayor que cero.', v_articulo.nombre
        using errcode = '22023';
    end if;

    v_precio := coalesce((v_item ->> 'precio_unitario')::numeric, 0);

    -- El mínimo puede estar en otra moneda que el documento. Se comparan los
    -- dos en dólares: es lo único que hace comparable un precio en bolívares
    -- de hoy con un mínimo puesto en dólares hace tres meses.
    select p.precio_minimo, p.moneda into v_minimo
    from public.precios_venta p where p.articulo_id = v_articulo.id;

    if v_minimo.precio_minimo is not null and v_minimo.precio_minimo > 0 then
      v_precio_usd := private.en_dolares(v_precio, p_moneda, p_fecha);

      if v_precio_usd < private.en_dolares(v_minimo.precio_minimo, v_minimo.moneda, p_fecha) - 0.000001
         and not private.tiene_permiso('VENTAS', 'TOTAL') then
        raise exception 'De "%" no se vende por debajo de % %. Se está ofreciendo % %.',
          v_articulo.nombre, private.numero_es(v_minimo.precio_minimo, 2), v_minimo.moneda, private.numero_es(v_precio, 2), p_moneda
          using errcode = '22023';
      end if;
    end if;

    execute format(
      'insert into public.%I (%I, linea, articulo_id, descripcion, cantidad, unidad,
                              precio_unitario, exento_iva)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id',
      p_tabla, p_columna)
    using p_id, v_linea, v_articulo.id,
          coalesce(nullif(trim(coalesce(v_item ->> 'descripcion', '')), ''), v_articulo.nombre),
          (v_item ->> 'cantidad')::numeric,
          coalesce(nullif(v_item ->> 'unidad', ''), v_articulo.unidad),
          v_precio,
          coalesce((v_item ->> 'exento_iva')::boolean, false);
  end loop;

  return v_linea;
end;
$function$;

-- public.registrar_cobro(p_factura_id bigint, p_cuenta_id bigint, p_monto numeric, p_metodo text, p_fecha date, p_referencia text, p_igtf boolean, p_nota text)
-- venia de: 20260908160000_los_tres_cuerpos_que_su_archivo_no_contaba.sql
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
begin
  perform private.exigir_permiso('VENTAS', 'ESCRITURA');

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

-- public.registrar_ticket(p_tipo text, p_vehiculo text, p_peso_bruto numeric, p_peso_tara numeric, p_articulo_id bigint, p_cliente_id bigint, p_proveedor_id bigint, p_chofer text, p_cedula_chofer text, p_transportista text, p_romana text, p_operador text, p_fecha date, p_hora time without time zone, p_nota text)
-- venia de: 20260805110000_despachos.sql
CREATE OR REPLACE FUNCTION public.registrar_ticket(p_tipo text, p_vehiculo text, p_peso_bruto numeric, p_peso_tara numeric, p_articulo_id bigint DEFAULT NULL::bigint, p_cliente_id bigint DEFAULT NULL::bigint, p_proveedor_id bigint DEFAULT NULL::bigint, p_chofer text DEFAULT NULL::text, p_cedula_chofer text DEFAULT NULL::text, p_transportista text DEFAULT NULL::text, p_romana text DEFAULT NULL::text, p_operador text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date, p_hora time without time zone DEFAULT NULL::time without time zone, p_nota text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fecha date := coalesce(p_fecha, current_date);
  v_id    bigint;
begin
  perform private.exigir_permiso('DESPACHOS', 'ESCRITURA');

  if length(trim(coalesce(p_vehiculo, ''))) = 0 then
    raise exception 'Un pesaje sin placa no se puede atribuir a nadie.' using errcode = '22023';
  end if;

  if coalesce(p_peso_bruto, 0) <= coalesce(p_peso_tara, 0) then
    raise exception 'El peso bruto (%) tiene que ser mayor que la tara (%).',
      private.cantidad_es(coalesce(p_peso_bruto, 0)), private.cantidad_es(coalesce(p_peso_tara, 0)) using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'No se registra un pesaje con fecha futura.' using errcode = '22023';
  end if;

  insert into public.romana_tickets
    (numero, fecha, hora, tipo, vehiculo, chofer, cedula_chofer, transportista,
     articulo_id, cliente_id, proveedor_id, peso_bruto, peso_tara, romana, operador,
     nota, registrado_por)
  values
    (private.siguiente_numero('TCK'), v_fecha, p_hora, p_tipo, trim(p_vehiculo),
     nullif(trim(coalesce(p_chofer, '')), ''), nullif(trim(coalesce(p_cedula_chofer, '')), ''),
     nullif(trim(coalesce(p_transportista, '')), ''),
     p_articulo_id,
     case when p_tipo = 'SALIDA'  then p_cliente_id   end,
     case when p_tipo = 'ENTRADA' then p_proveedor_id end,
     p_peso_bruto, p_peso_tara,
     nullif(trim(coalesce(p_romana, '')), ''), nullif(trim(coalesce(p_operador, '')), ''),
     nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$function$;

-- public.crear_cotizacion_venta(p_cliente_id bigint, p_renglones jsonb, p_moneda character, p_validez_dias integer, p_alicuota_iva numeric, p_descuento numeric, p_flete numeric, p_fecha date, p_observacion text)
-- venia de: 20260804100000_ventas.sql
CREATE OR REPLACE FUNCTION public.crear_cotizacion_venta(p_cliente_id bigint, p_renglones jsonb, p_moneda character DEFAULT NULL::bpchar, p_validez_dias integer DEFAULT 15, p_alicuota_iva numeric DEFAULT NULL::numeric, p_descuento numeric DEFAULT 0, p_flete numeric DEFAULT 0, p_fecha date DEFAULT NULL::date, p_observacion text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_cliente record;
  v_fecha   date := coalesce(p_fecha, current_date);
  v_moneda  text;
  v_tasas   record;
  v_id      bigint;
begin
  perform private.exigir_permiso('VENTAS', 'ESCRITURA');

  select * into v_cliente from public.clientes where id = p_cliente_id;

  if v_cliente.id is null then
    raise exception 'No existe el cliente %.', p_cliente_id using errcode = 'P0002';
  end if;

  if not v_cliente.activo then
    raise exception 'El cliente "%" está inactivo.', v_cliente.nombre using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'No se cotiza con fecha futura.' using errcode = '22023';
  end if;

  v_moneda := coalesce(p_moneda, v_cliente.moneda_preferida);
  select * into v_tasas from private.tasas_del_dia(v_moneda, v_fecha);

  insert into public.cotizaciones_venta
    (numero, cliente_id, fecha, validez_dias, moneda, tasa, tasa_usd,
     alicuota_iva, descuento, flete, observacion, creada_por)
  values
    (private.siguiente_numero('COTV'), p_cliente_id, v_fecha,
     coalesce(p_validez_dias, 15), v_moneda, v_tasas.tasa, v_tasas.tasa_usd,
     case when v_cliente.exento_iva then 0 else coalesce(p_alicuota_iva, 16) end,
     coalesce(p_descuento, 0), coalesce(p_flete, 0),
     nullif(trim(coalesce(p_observacion, '')), ''), (select auth.uid()))
  returning id into v_id;

  perform private.cargar_renglones_venta(
    'cotizacion_venta_renglones', 'cotizacion_id', v_id, p_renglones, v_moneda, v_fecha);

  return v_id;
end;
$function$;

-- public.autorizar_varias(p_usuario_id uuid, p_acciones text[], p_motivo text, p_desde date, p_hasta date)
-- venia de: 20260827195000_extender_varios_permisos.sql
CREATE OR REPLACE FUNCTION public.autorizar_varias(p_usuario_id uuid, p_acciones text[], p_motivo text, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_accion   text;
  v_hechas   integer := 0;
  v_omitidas jsonb := '[]'::jsonb;
  v_nombre   text;
begin
  perform private.exigir_rol('ADMIN', 'GERENTE_GENERAL');

  if p_acciones is null or array_length(p_acciones, 1) is null then
    raise exception 'No elegiste ninguna casilla que extender.' using errcode = '22023';
  end if;

  /*
    Cada una va en su propio bloque, y eso no es adorno: un bloque con
    EXCEPTION abre una subtransaccion, asi que la que falla se deshace sola y
    las demas siguen.

    Hace falta porque `autorizar_accion` rechaza cosas que en un lote son
    normales y no son errores de quien las manda: la persona ya puede esa
    casilla por su rol, o quien extiende no la tiene por derecho propio. Con
    todo en la misma transaccion, marcar cinco y que una ya la tuviera no
    dejaria ninguna.

    Se reusa `autorizar_accion` entera en vez de copiar sus comprobaciones. Son
    ocho, incluidas las dos que no se prestan nunca y la que impide extenderse a
    uno mismo; duplicarlas seria dejar dos puertas que hay que acordarse de
    cerrar las dos veces.
  */
  foreach v_accion in array p_acciones loop
    begin
      perform public.autorizar_accion(p_usuario_id, v_accion, p_motivo, p_desde, p_hasta);
      v_hechas := v_hechas + 1;
    exception
      when others then
        select nombre into v_nombre from public.acciones where codigo = v_accion;
        v_omitidas := v_omitidas || jsonb_build_object(
          'accion', coalesce(v_nombre, v_accion),
          'motivo', sqlerrm);
    end;
  end loop;

  /*
    Si no entro ninguna, se levanta el error en vez de devolver un resumen en
    cero. Un modal que se cierra diciendo «listo» sin haber extendido nada es
    peor que uno que se queda abierto explicando por que.
  */
  if v_hechas = 0 then
    raise exception 'No se extendio ninguna. %',
      (select string_agg(x->>'accion' || ': ' || (x->>'motivo'), ' · ')
         from jsonb_array_elements(v_omitidas) x)
      using errcode = '55000';
  end if;

  return jsonb_build_object('extendidas', v_hechas, 'omitidas', v_omitidas);
end;
$function$;

-- public.facturar_notas(p_notas bigint[], p_condicion_pago text, p_fecha date, p_observacion text)
-- venia de: 20260804160000_ventas_cerrojos.sql
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
  perform private.exigir_permiso('VENTAS', 'ESCRITURA');

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

    if v_deuda > v_cliente.limite_credito and not private.tiene_permiso('VENTAS', 'TOTAL') then
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

-- public.registrar_factura_compra(p_proveedor_id bigint, p_numero_factura text, p_fecha_emision date, p_exento numeric, p_base_imponible numeric, p_iva numeric, p_moneda character, p_numero_control text, p_orden_id bigint, p_condicion_pago text, p_alicuota_iva numeric, p_retencion_iva numeric, p_retencion_islr numeric, p_total_del_papel numeric, p_observacion text)
-- venia de: 20260805120000_facturas_proveedor.sql
CREATE OR REPLACE FUNCTION public.registrar_factura_compra(p_proveedor_id bigint, p_numero_factura text, p_fecha_emision date, p_exento numeric DEFAULT 0, p_base_imponible numeric DEFAULT 0, p_iva numeric DEFAULT 0, p_moneda character DEFAULT 'VES'::bpchar, p_numero_control text DEFAULT NULL::text, p_orden_id bigint DEFAULT NULL::bigint, p_condicion_pago text DEFAULT 'CONTADO'::text, p_alicuota_iva numeric DEFAULT 16, p_retencion_iva numeric DEFAULT 0, p_retencion_islr numeric DEFAULT 0, p_total_del_papel numeric DEFAULT NULL::numeric, p_observacion text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_prov  record;
  v_tasas record;
  v_dias  smallint;
  v_total numeric;
  v_id    bigint;
begin
  perform private.exigir_permiso('COMPRAS', 'ESCRITURA');

  select * into v_prov from public.proveedores where id = p_proveedor_id;

  if v_prov.id is null then
    raise exception 'No existe el proveedor %.', p_proveedor_id using errcode = 'P0002';
  end if;

  -- Una factura contra nada no se puede cuadrar después.
  if p_orden_id is null then
    raise exception 'Una factura va contra una orden de compra: es la que dice qué se compró y a qué precio. Si esta compra no tiene orden, créala primero y registra la factura desde ahí.'
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.ordenes_compra
     where id = p_orden_id and proveedor_id = p_proveedor_id
  ) then
    raise exception 'Esa orden no es de %. Una factura solo se ata a una orden del mismo proveedor.',
      v_prov.nombre using errcode = '22023';
  end if;

  if length(trim(coalesce(p_numero_factura, ''))) = 0 then
    raise exception 'La factura necesita su número, que es el que trae impreso.' using errcode = '22023';
  end if;

  if p_fecha_emision > current_date then
    raise exception 'No se registra una factura con fecha futura.' using errcode = '22023';
  end if;

  v_total := round(coalesce(p_exento, 0) + coalesce(p_base_imponible, 0) + coalesce(p_iva, 0), 2);

  if v_total <= 0 then
    raise exception 'La factura suma cero. Revisa el exento, la base imponible y el IVA.'
      using errcode = '22023';
  end if;

  -- Si quien registra tecleó también el total del papel, tiene que coincidir.
  -- Cuando no coincide, o el papel está mal o el tecleo está mal, y las dos
  -- cosas se ven mejor ahora que en la declaración.
  if p_total_del_papel is not null and abs(p_total_del_papel - v_total) > 0.01 then
    raise exception 'El papel dice % y lo tecleado suma %. Revisa el exento (%), la base (%) y el IVA (%).',
      private.numero_es(p_total_del_papel, 2), private.numero_es(v_total, 2), private.numero_es(coalesce(p_exento, 0), 2),
      private.numero_es(coalesce(p_base_imponible, 0), 2), private.numero_es(coalesce(p_iva, 0), 2) using errcode = '22023';
  end if;

  if coalesce(p_retencion_iva, 0) > coalesce(p_iva, 0) then
    raise exception 'No se puede retener más IVA (%) del que trae la factura (%).',
      p_retencion_iva, p_iva using errcode = '22023';
  end if;

  v_dias := case coalesce(p_condicion_pago, 'CONTADO')
              when 'CREDITO_15' then 15
              when 'CREDITO_30' then 30
              when 'CREDITO_60' then 60
              else 0
            end;

  select * into v_tasas from private.tasas_del_dia(p_moneda, p_fecha_emision);

  insert into public.facturas_compra
    (proveedor_id, orden_id, numero_factura, numero_control, fecha_emision, fecha_recepcion,
     condicion_pago, dias_credito, vence_el, moneda, tasa, tasa_usd,
     exento, base_imponible, alicuota_iva, iva, retencion_iva, retencion_islr, total,
     observacion, registrada_por)
  values
    (p_proveedor_id, p_orden_id, trim(p_numero_factura),
     nullif(trim(coalesce(p_numero_control, '')), ''), p_fecha_emision, current_date,
     coalesce(p_condicion_pago, 'CONTADO'), v_dias, p_fecha_emision + v_dias,
     p_moneda, v_tasas.tasa, v_tasas.tasa_usd,
     coalesce(p_exento, 0), coalesce(p_base_imponible, 0), coalesce(p_alicuota_iva, 16),
     coalesce(p_iva, 0), coalesce(p_retencion_iva, 0), coalesce(p_retencion_islr, 0), v_total,
     nullif(trim(coalesce(p_observacion, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;

exception
  when unique_violation then
    raise exception 'La factura % de "%" ya está registrada. Registrarla dos veces descuenta dos veces el mismo crédito fiscal.',
      trim(p_numero_factura), v_prov.nombre using errcode = '23505';
end;
$function$;

-- public.registrar_pago_compra(p_factura_id bigint, p_cuenta_id bigint, p_monto numeric, p_metodo text, p_fecha date, p_referencia text, p_igtf boolean, p_nota text)
-- venia de: 20260819250000_referencia_de_efectivo_automatica.sql
CREATE OR REPLACE FUNCTION public.registrar_pago_compra(p_factura_id bigint, p_cuenta_id bigint, p_monto numeric, p_metodo text DEFAULT 'TRANSFERENCIA'::text, p_fecha date DEFAULT NULL::date, p_referencia text DEFAULT NULL::text, p_igtf boolean DEFAULT NULL::boolean, p_nota text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fac       record;
  v_cuenta    record;
  v_prov      record;
  v_fecha     date := coalesce(p_fecha, current_date);
  v_tasas     record;
  v_saldo     numeric;
  v_monto_usd numeric;
  v_igtf      boolean;
  v_igtf_monto numeric;
  v_id        bigint;
  v_mov       bigint;
  v_mov_igtf  bigint;
  v_ref       text := nullif(trim(coalesce(p_referencia, '')), '');
begin
  perform private.exigir_permiso('COMPRAS', 'ESCRITURA');

  perform 1 from public.facturas_compra where id = p_factura_id for update;

  select * into v_fac from public.v_facturas_compra where id = p_factura_id;

  if v_fac.id is null then
    raise exception 'No existe la factura %.', p_factura_id using errcode = 'P0002';
  end if;

  if v_fac.estado <> 'REGISTRADA' then
    raise exception 'La factura % está % y no admite pagos.', v_fac.numero_factura,
      lower(v_fac.estado) using errcode = '55000';
  end if;

  select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta_id;

  if v_cuenta.id is null then
    raise exception 'No existe la cuenta %.', p_cuenta_id using errcode = 'P0002';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto del pago tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'No se registra un pago con fecha futura.' using errcode = '22023';
  end if;

  select * into v_tasas from private.tasas_del_dia(v_cuenta.moneda, v_fecha);
  v_monto_usd := round(p_monto * v_tasas.tasa / v_tasas.tasa_usd, 2);
  v_saldo := v_fac.saldo_usd;

  if v_monto_usd > v_saldo + 0.01 then
    raise exception 'A la factura % le faltan % $ y se están pagando % $.',
      v_fac.numero_factura, private.numero_es(v_saldo, 2), private.numero_es(v_monto_usd, 2) using errcode = '22023';
  end if;

  /*
    La referencia del efectivo se genera sola.

    En una transferencia la referencia la devuelve el banco; en efectivo no la
    devuelve nadie, y el campo quedaba vacío. Un pago sin referencia no se
    puede señalar en una conversación —«el de 24 dólares», y hubo tres— así que
    se le pone una del sistema: EFEUSD-2026-0001, con el mismo contador que
    numera todos los documentos de la casa. Si quien paga escribe una, manda la
    suya.
  */
  if v_ref is null and coalesce(p_metodo, '') = 'EFECTIVO' then
    v_ref := private.siguiente_numero(
      'EFE' || case when v_cuenta.moneda = 'VES' then 'BS' else v_cuenta.moneda end);
  end if;

  v_igtf := coalesce(p_igtf, v_cuenta.moneda <> 'VES');

  select * into v_prov from public.proveedores where id = v_fac.proveedor_id;

  insert into public.pagos_compra
    (numero, factura_id, cuenta_id, fecha, metodo, moneda, tasa, tasa_usd,
     monto, igtf_aplica, referencia, nota, registrado_por)
  values
    (private.siguiente_numero('PGC'), p_factura_id, p_cuenta_id, v_fecha,
     coalesce(p_metodo, 'TRANSFERENCIA'), v_cuenta.moneda, v_tasas.tasa, v_tasas.tasa_usd,
     p_monto, v_igtf, v_ref,
     nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  select igtf_monto into v_igtf_monto from public.pagos_compra where id = v_id;

  v_mov := private.registrar_movimiento_tesoreria(
    p_cuenta_id, 'PAGO', -1, p_monto,
    format('PAGO DE LA FACTURA %s', v_fac.numero_factura),
    v_fecha, v_ref, v_prov.nombre, null, v_fac.orden_id, null, p_nota);

  -- El IGTF de un pago en divisas lo paga quien paga, y no es del proveedor:
  -- va en su propio asiento o parecería que al proveedor se le dio de más.
  if v_igtf and v_igtf_monto > 0 then
    v_mov_igtf := private.registrar_movimiento_tesoreria(
      p_cuenta_id, 'IGTF', -1, v_igtf_monto,
      format('IGTF DEL PAGO DE LA FACTURA %s', v_fac.numero_factura),
      v_fecha, v_ref, v_prov.nombre, null, null, v_mov, null);
  end if;

  update public.pagos_compra
     set movimiento_id = v_mov, movimiento_igtf_id = v_mov_igtf
   where id = v_id;

  if (select saldo_usd from public.v_facturas_compra where id = p_factura_id) <= 0.01 then
    update public.facturas_compra set estado = 'PAGADA' where id = p_factura_id;
  end if;

  return v_id;
end;
$function$;

-- public.anular_produccion_turno(p_id bigint, p_motivo text)
-- venia de: 20260805100000_explotacion.sql
CREATE OR REPLACE FUNCTION public.anular_produccion_turno(p_id bigint, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_parte record;
  v_reng  record;
begin
  -- Anular un parte le quita material al patio que quizá ya se despachó. Es
  -- una corrección, no una operación del día.
  perform private.exigir_permiso('EXPLOTACION', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se anula el parte.' using errcode = '22023';
  end if;

  select * into v_parte from public.produccion_turnos where id = p_id for update;

  if v_parte.id is null then
    raise exception 'No existe el parte %.', p_id using errcode = 'P0002';
  end if;

  if v_parte.estado = 'ANULADA' then
    raise exception 'El parte % ya estaba anulado.', v_parte.numero using errcode = '55000';
  end if;

  -- Se reversa exactamente lo que este parte metió, por su número de
  -- movimiento, y se comprueba antes que el material siga estando: si ya se
  -- despachó, el patio quedaría en negativo y eso no es un dato sino un error.
  for v_reng in
    select r.movimiento_id, m.almacen_id, m.articulo_id, m.cantidad, a.nombre
    from public.produccion_renglones r
    join public.inventario_movimientos m on m.id = r.movimiento_id
    join public.articulos a on a.id = m.articulo_id
    where r.produccion_id = p_id and r.movimiento_id is not null
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(format('patio:%s:%s', v_reng.almacen_id, v_reng.articulo_id), 0));

    if private.existencia_para_escribir(v_reng.almacen_id, v_reng.articulo_id) < v_reng.cantidad then
      raise exception 'De "%" ya no quedan las % que metió este parte: se despacharon. Corrige con un ajuste de inventario, que deja constancia de la diferencia.',
        v_reng.nombre, v_reng.cantidad using errcode = '22023';
    end if;

    perform private.registrar_movimiento(
      'REVERSO', (-1)::smallint, v_reng.almacen_id, v_reng.articulo_id,
      v_reng.cantidad, 0,
      format('ANULACIÓN DEL PARTE %s: %s', v_parte.numero, trim(p_motivo)),
      null, null, v_reng.movimiento_id, current_date);
  end loop;

  update public.produccion_turnos
     set estado = 'ANULADA',
         motivo_anulacion = trim(p_motivo),
         anulada_por = (select auth.uid()),
         anulada_en = now()
   where id = p_id;
end;
$function$;

-- public.recibir_orden_completa(p_orden_id bigint, p_almacen_id bigint, p_nota text, p_fecha date)
-- venia de: 20260828100000_compras_directas.sql
CREATE OR REPLACE FUNCTION public.recibir_orden_completa(p_orden_id bigint, p_almacen_id bigint, p_nota text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_renglones jsonb;
  v_raro      record;
  v_tasa      numeric;
  v_tasa_usd  numeric;
begin
  -- Lo que falta por recibir de cada renglón, no lo pedido: si ya entró una
  -- parte, esto completa el resto en vez de intentar meterlo dos veces.
  select jsonb_agg(jsonb_build_object(
           'orden_renglon_id', r.id,
           'cantidad', r.cantidad - r.cantidad_recibida))
    into v_renglones
  from public.orden_renglones r
  where r.orden_id = p_orden_id
    and r.cantidad - r.cantidad_recibida > 0;

  if v_renglones is null then
    raise exception 'De esta orden ya se recibió todo.' using errcode = '55000';
  end if;

  /*
    ESTE ATAJO NO PUEDE ACEPTAR UN PRECIO RARO, Y ES A PROPOSITO.

    `registrar_recepcion` rechaza el renglón cuyo precio se sale diez veces del
    costo que el artículo viene teniendo, salvo que el renglón traiga
    `confirmado`. Aquí los renglones se arman solos, así que la única forma de
    confirmarlos seria un «confirmo» para todos — y eso, con seis renglones,
    acepta a ciegas los cinco que nadie miró. Es exactamente lo que se evitó en
    las entradas poniendo la confirmación EN cada renglón.

    Así que este botón se para y manda a la pantalla que sí sabe preguntar. Sin
    esto, el usuario recibia el mensaje de `registrar_recepcion` diciéndole
    «acéptalo» sin que hubiera dónde aceptarlo ni en esta pantalla ni en otra.
  */
  select o.tasa, o.tasa_usd into v_tasa, v_tasa_usd
    from public.ordenes_compra o where o.id = p_orden_id;

  select r.descripcion as que, private.desvio_de_costo(
           p_almacen_id, r.articulo_id,
           round(r.precio_unitario * v_tasa / nullif(v_tasa_usd, 0), 6)) as veces
    into v_raro
    from public.orden_renglones r
    join public.articulos a on a.id = r.articulo_id and a.inventariable
   where r.orden_id = p_orden_id
     and r.cantidad - r.cantidad_recibida > 0
     and private.desvio_de_costo(
           p_almacen_id, r.articulo_id,
           round(r.precio_unitario * v_tasa / nullif(v_tasa_usd, 0), 6)) is not null
   limit 1;

  if v_raro.que is not null then
    raise exception 'El precio de «%» se sale mucho de lo que ese artículo viene costando en este almacén, así que esta orden no entra de un solo golpe.',
      v_raro.que
      using errcode = '22023',
            hint = 'Usa «Recibir material»: ahí se ve renglón por renglón y se acepta el que de verdad se comprobó.';
  end if;

  return public.registrar_recepcion(
    p_orden_id, p_almacen_id, v_renglones, p_nota, p_fecha);
end;
$function$;

-- public.registrar_anticipo_prestaciones(p_empleado_id bigint, p_monto numeric, p_motivo text, p_cuenta_id bigint, p_fecha date, p_detalle text, p_referencia text)
-- venia de: 20260805130000_prestaciones.sql
CREATE OR REPLACE FUNCTION public.registrar_anticipo_prestaciones(p_empleado_id bigint, p_monto numeric, p_motivo text, p_cuenta_id bigint DEFAULT NULL::bigint, p_fecha date DEFAULT NULL::date, p_detalle text DEFAULT NULL::text, p_referencia text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_p      record;
  v_emp    record;
  v_cuenta record;
  v_fecha  date := coalesce(p_fecha, current_date);
  v_tasas  record;
  v_id     bigint;
  v_mov    bigint;
begin
  -- Adelantar prestaciones es sacar dinero contra lo que se le debe a alguien.
  perform private.exigir_permiso('NOMINA', 'TOTAL');

  select * into v_emp from public.empleados where id = p_empleado_id;
  if v_emp.id is null then
    raise exception 'No existe el trabajador %.', p_empleado_id using errcode = 'P0002';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El anticipo tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'No se registra un anticipo con fecha futura.' using errcode = '22023';
  end if;

  select * into v_p from public.v_prestaciones where empleado_id = p_empleado_id;

  if p_monto > v_p.disponible_anticipo + 0.01 then
    raise exception 'A % se le pueden adelantar hasta % y se están pidiendo %. La ley permite adelantar hasta el 75%% de lo acumulado.',
      v_p.nombre, private.numero_es(v_p.disponible_anticipo, 2), private.numero_es(p_monto, 2) using errcode = '55000';
  end if;

  select * into v_tasas from private.tasas_del_dia(v_emp.moneda_salario, v_fecha);

  insert into public.prestaciones_anticipos
    (numero, empleado_id, fecha, motivo, detalle, cuenta_id, moneda, tasa, tasa_usd,
     monto, referencia, registrado_por)
  values
    (private.siguiente_numero('ANT'), p_empleado_id, v_fecha, p_motivo,
     nullif(trim(coalesce(p_detalle, '')), ''), p_cuenta_id, v_emp.moneda_salario,
     v_tasas.tasa, v_tasas.tasa_usd, p_monto,
     nullif(trim(coalesce(p_referencia, '')), ''), (select auth.uid()))
  returning id into v_id;

  -- El dinero sale de verdad, así que el libro de tesorería tiene que verlo.
  if p_cuenta_id is not null then
    select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta_id;

    if v_cuenta.id is null then
      raise exception 'No existe la cuenta %.', p_cuenta_id using errcode = 'P0002';
    end if;

    v_mov := private.registrar_movimiento_tesoreria(
      p_cuenta_id, 'EGRESO', -1, p_monto,
      format('ANTICIPO DE PRESTACIONES A %s %s', v_emp.nombres, v_emp.apellidos),
      v_fecha, p_referencia, v_emp.apellidos || ', ' || v_emp.nombres,
      null, null, null, p_detalle);

    update public.prestaciones_anticipos set movimiento_id = v_mov where id = v_id;
  end if;

  return v_id;
end;
$function$;

-- private.trg_nota_credito_no_excede()
-- venia de: 20260805150000_notas_credito.sql
CREATE OR REPLACE FUNCTION private.trg_nota_credito_no_excede()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_nota    record;
  v_factura record;
  v_acumulado numeric;
begin
  select * into v_nota from public.notas_credito where id = NEW.id;

  -- Se borró dentro de la misma transacción: no hay nada que comprobar.
  if v_nota.id is null then return null; end if;
  if v_nota.estado = 'ANULADA' then return null; end if;

  select * into v_factura from public.facturas_venta where id = v_nota.factura_id;

  select coalesce(sum(nc.total), 0) into v_acumulado
  from public.notas_credito nc
  where nc.factura_id = v_nota.factura_id and nc.estado = 'EMITIDA';

  if v_acumulado > round(v_factura.total, 2) + 0.01 then
    raise exception
      'Las notas de crédito de la factura % suman % y la factura es de %. Una nota no puede devolver más de lo que se cobró.',
      v_factura.numero, private.numero_es(v_acumulado, 2), private.numero_es(v_factura.total, 2)
      using errcode = '22023';
  end if;

  return null;
end;
$function$;

-- private.validar_metodo_pago()
-- venia de: 20260819050000_metodos_de_pago_unificados.sql
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

-- public.entregar_a_trabajador(p_empleado_id bigint, p_almacen_id bigint, p_renglones jsonb, p_clase text, p_fecha date, p_nota text)
-- venia de: 20260820300000_dotacion_y_asignacion_son_para_que_no_que_cosa.sql
CREATE OR REPLACE FUNCTION public.entregar_a_trabajador(p_empleado_id bigint, p_almacen_id bigint, p_renglones jsonb, p_clase text DEFAULT 'ASIGNACION'::text, p_fecha date DEFAULT NULL::date, p_nota text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fecha     date := coalesce(p_fecha, current_date);
  v_clase     text := coalesce(nullif(btrim(coalesce(p_clase, '')), ''), 'ASIGNACION');
  v_emp       record;
  v_art       record;
  v_item      jsonb;
  v_cantidad  numeric;
  v_libres    numeric;
  v_hay       numeric;
  v_costo     numeric;
  v_prestados integer := 0;
  v_gastados  integer := 0;
begin
  if not private.tiene_permiso('ASIGNACIONES', 'ESCRITURA')
     and not private.tiene_rol('ALMACEN', 'RRHH', 'ADMIN') then
    raise exception 'No tienes permiso para entregarle cosas a un trabajador.'
      using errcode = '42501';
  end if;

  if v_clase not in ('DOTACION', 'ASIGNACION') then
    raise exception 'Di si es dotación —por su rol— o asignación —para una actividad concreta.'
      using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'No se entrega nada con fecha futura.' using errcode = '22023';
  end if;

  select * into v_emp from public.empleados where id = p_empleado_id;

  if v_emp.id is null then
    raise exception 'No existe ese trabajador.' using errcode = 'P0002';
  end if;

  if not v_emp.activo or v_emp.fecha_egreso is not null then
    raise exception 'A % ya no se le entrega nada: está egresado.',
      v_emp.nombres || ' ' || v_emp.apellidos using errcode = '55000';
  end if;

  if not exists (select 1 from public.almacenes where id = p_almacen_id and activo) then
    raise exception 'El almacén indicado no existe o está inactivo.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'Indica qué se entrega y en qué cantidad.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_cantidad := coalesce((v_item->>'cantidad')::numeric, 0);

    if v_cantidad <= 0 then
      continue;
    end if;

    select * into v_art from public.articulos where id = (v_item->>'articulo_id')::bigint;

    if v_art.id is null then
      raise exception 'No existe el artículo %.', v_item->>'articulo_id' using errcode = 'P0002';
    end if;

    if v_art.modo_entrega = 'NO' then
      raise exception '"%" no es algo que se le entregue a una persona. Si debería serlo, cámbialo en el catálogo.',
        v_art.nombre using errcode = '22023';
    end if;

    if v_art.modo_entrega = 'RETORNABLE' then
      select private.existencia_para_escribir(p_almacen_id, v_art.id)
           - coalesce((select sum(a.cantidad) from public.asignaciones_herramienta a
                        where a.articulo_id = v_art.id and a.almacen_id = p_almacen_id
                          and a.estado = 'ASIGNADA'), 0)
        into v_libres;

      if v_libres < v_cantidad then
        raise exception 'De "%" solo quedan % sin prestar.', v_art.nombre, private.numero_es(v_libres, 4)
          using errcode = '55000';
      end if;

      insert into public.asignaciones_herramienta
        (numero, articulo_id, almacen_id, empleado_id, cantidad, fecha_entrega,
         clase, nota, entregado_por)
      values
        (private.siguiente_numero('ASG'), v_art.id, p_almacen_id, p_empleado_id,
         v_cantidad, v_fecha, v_clase,
         nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()));

      v_prestados := v_prestados + 1;

    else
      v_hay := private.existencia_para_escribir(p_almacen_id, v_art.id);

      if v_cantidad > v_hay then
        raise exception 'De "%" solo hay % en existencia y se intentan entregar %.',
          v_art.nombre, private.numero_es(v_hay, 4), private.numero_es(v_cantidad, 4) using errcode = '22023';
      end if;

      v_costo := private.costo_promedio(p_almacen_id, v_art.id);

      perform private.registrar_movimiento(
        'SALIDA_CONSUMO', -1, p_almacen_id, v_art.id, v_cantidad, v_costo,
        format('%s a %s (%s). %s',
               case when v_clase = 'DOTACION' then 'Dotación' else 'Asignación' end,
               v_emp.nombres || ' ' || v_emp.apellidos, v_emp.ficha,
               coalesce(nullif(trim(coalesce(p_nota, '')), ''), '')),
        null, null, null, v_fecha, p_empleado_id, v_clase);

      v_gastados := v_gastados + 1;
    end if;
  end loop;

  if v_prestados + v_gastados = 0 then
    raise exception 'No se indicó ninguna cantidad a entregar.' using errcode = '22023';
  end if;

  return jsonb_build_object('prestados', v_prestados, 'consumidos', v_gastados);
end;
$function$;

-- public.cargar_articulos_por_lote(p_filas jsonb, p_confirmar boolean)
-- venia de: 20260825270000_la_planilla_de_articulos_puede_traer_existencia.sql
CREATE OR REPLACE FUNCTION public.cargar_articulos_por_lote(p_filas jsonb, p_confirmar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reparable boolean;
  v_fila         jsonb;
  v_n            int := 0;
  v_informe      jsonb := '[]'::jsonb;
  v_errores      int := 0;
  v_nuevos       int := 0;
  v_actualizados int := 0;
  v_hay_precio   boolean := false;

  v_codigo    text;
  v_nombre    text;
  v_categoria text;
  v_unidad    text;
  v_modo      text;
  v_inv       boolean;
  v_minimo    numeric;
  v_densidad  numeric;
  v_precio    numeric;
  v_precio_min numeric;
  v_moneda    text;

  -- Lo que trae la existencia, cuando la trae.
  v_almacen_txt text;
  v_almacen_id  bigint;
  v_cantidad    numeric;
  v_costo       numeric;
  v_con_stock   int := 0;

  /*
    Los renglones se juntan por almacén y se meten al final, no fila por fila.

    Una llamada por renglón tomaría el cerrojo del almacén una vez por artículo
    —cien artículos, cien esperas— y dejaría cien movimientos sueltos donde lo
    que hubo fue una sola carga inicial. Agrupados, queda un movimiento por
    almacén, que es lo que de verdad pasó y lo que alguien va a querer leer
    dentro de un año.
  */
  v_por_almacen jsonb := '{}'::jsonb;
  v_clave       text;

  v_motivo    text;
  v_estado    text;
  v_id        bigint;
  v_vistos    text[] := array[]::text[];
  v_nucleo    text;
  v_aviso     text;
begin
  perform private.exigir_permiso('INVENTARIO', 'ESCRITURA');

  if jsonb_typeof(p_filas) <> 'array' then
    raise exception 'La planilla no trae filas.' using errcode = '22023';
  end if;

  select exists (
    select 1 from jsonb_array_elements(p_filas) f
    where nullif(btrim(coalesce(f->>'precio', '')), '') is not null
  ) into v_hay_precio;

  if v_hay_precio then
    perform private.exigir_permiso('VENTAS', 'TOTAL');
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_n := v_n + 1;
    v_motivo := null;
    v_aviso  := null;
    v_estado := null;
    v_almacen_id := null;
    v_cantidad := null;
    v_costo := null;

    v_codigo    := upper(btrim(coalesce(v_fila->>'codigo', '')));
    v_nombre    := btrim(coalesce(v_fila->>'nombre', ''));
    v_categoria := upper(btrim(coalesce(v_fila->>'categoria', '')));
    v_unidad    := upper(btrim(coalesce(v_fila->>'unidad', '')));
    v_modo      := upper(btrim(coalesce(nullif(btrim(coalesce(v_fila->>'modo_entrega','')), ''), 'CONSUMIBLE')));
    v_moneda    := upper(btrim(coalesce(nullif(btrim(coalesce(v_fila->>'moneda','')), ''), 'USD')));
    v_almacen_txt := btrim(coalesce(v_fila->>'almacen', ''));

    v_nucleo := private.nombre_nucleo(v_nombre);

    /*
      EL CODIGO YA NO SE EXIGE, Y ESA EXIGENCIA ES DE DONDE SALIO EL PROBLEMA.

      Once de los quince articulos del catalogo llevan el nombre metido en el
      campo del codigo —«ACEITE AGROFLUIDOS» es a la vez nombre y codigo—
      porque esta funcion pedia un codigo y quien lleno la planilla no tenia
      ninguno que escribir. Un codigo que es el nombre no distingue nada: el
      indice unico deja pasar el mismo articulo dos veces con una letra de
      diferencia.

      Sin codigo, la fila se resuelve por el nombre: si ya hay un articulo cuyo
      nombre se reduce al mismo nucleo, es ese y se actualiza. Si no, es nuevo y
      el codigo se lo pone `private.codigo_de_articulo` AL GUARDAR — no al
      revisar, porque revisar la planilla tres veces gastaria tres correlativos
      por fila y dejaria huecos en la serie.
    */
    if v_codigo = '' and v_nombre <> '' then
      select a.codigo into v_codigo
        from public.articulos a
       where private.nombre_nucleo(a.nombre) = v_nucleo
       order by a.activo desc
       limit 1;
      v_codigo := coalesce(v_codigo, '');
    end if;

    if v_nombre = '' then
      v_motivo := 'Falta el nombre.';
    elsif v_categoria = '' then
      v_motivo := 'Falta la categoría.';
    elsif v_unidad = '' then
      v_motivo := 'Falta la unidad.';

    elsif coalesce(nullif(v_codigo, ''), 'NUCLEO:' || v_nucleo) = any(v_vistos) then
      v_motivo := case when v_codigo <> ''
        then format('El código %s se repite en la planilla.', v_codigo)
        else format('«%s» aparece dos veces en la planilla.', v_nombre) end;

    elsif v_categoria not in ('PRODUCTO','REPUESTO','INSUMO','COMBUSTIBLE','LUBRICANTE',
                              'EPP','HERRAMIENTA','EXPLOSIVO','SERVICIO') then
      v_motivo := format('«%s» no es una categoría del sistema.', v_categoria);

    elsif v_modo not in ('NO','RETORNABLE','CONSUMIBLE') then
      v_motivo := format('«%s» no dice qué pasa al entregarlo: NO, RETORNABLE o CONSUMIBLE.', v_modo);

    elsif not exists (select 1 from public.unidades where codigo = v_unidad) then
      v_motivo := format('La unidad «%s» no existe. Las que hay: %s.',
        v_unidad,
        (select string_agg(u.codigo, ', ' order by u.codigo) from public.unidades u));

    else
      begin
        v_minimo   := coalesce(nullif(btrim(coalesce(v_fila->>'stock_minimo','')), '')::numeric, 0);
        v_densidad := nullif(btrim(coalesce(v_fila->>'densidad_ton_m3','')), '')::numeric;
        v_precio   := nullif(btrim(coalesce(v_fila->>'precio','')), '')::numeric;
        v_precio_min := nullif(btrim(coalesce(v_fila->>'precio_minimo','')), '')::numeric;
        v_cantidad := nullif(btrim(coalesce(v_fila->>'cantidad','')), '')::numeric;
        v_costo    := nullif(btrim(coalesce(v_fila->>'costo','')), '')::numeric;
      exception when others then
        v_minimo := null;
        v_motivo := 'Hay un número que no se entiende. Se escriben sin separador de miles y con punto decimal.';
      end;

      v_inv := case lower(btrim(coalesce(v_fila->>'inventariable', '')))
                 when '' then true
                 when 'si' then true when 'sí' then true when 'true' then true when '1' then true
                 when 'no' then false when 'false' then false when '0' then false
                 else null end;

      if v_motivo is not null then
        null;
      elsif v_inv is null then
        v_motivo := 'La columna «inventariable» se responde SI o NO.';
      elsif v_minimo < 0 then
        v_motivo := 'El mínimo no puede ser negativo.';
      elsif v_densidad is not null and v_densidad <= 0 then
        v_motivo := 'La densidad, si se pone, es mayor que cero.';
      elsif v_categoria = 'SERVICIO' and v_inv then
        v_motivo := 'Un servicio no se guarda en el almacén: «inventariable» tiene que ser NO.';
      elsif v_precio is not null and v_precio <= 0 then
        v_motivo := 'El precio tiene que ser mayor que cero.';
      elsif v_precio is null and v_precio_min is not null then
        v_motivo := 'Hay precio mínimo sin precio.';
      elsif v_precio_min is not null and v_precio_min > v_precio then
        v_motivo := 'El precio mínimo no puede pasar del precio.';
      elsif v_precio is not null
            and not exists (select 1 from public.monedas where codigo = v_moneda and activa) then
        v_motivo := format('La moneda «%s» no está activa en el sistema.', v_moneda);
      end if;

      /*
        LA EXISTENCIA. Las tres van juntas o no va ninguna.

        Media fila —un almacén sin cantidad, una cantidad sin costo— casi
        siempre es una celda que se quedó sin llenar, y adivinar el resto es
        meter existencia que nadie pidió. Se avisa y se para.
      */
      if v_motivo is null and (v_almacen_txt <> '' or v_cantidad is not null or v_costo is not null) then
        if not v_inv then
          v_motivo := 'Esto no se inventaría, así que no puede tener existencia en un almacén.';
        elsif v_almacen_txt = '' then
          v_motivo := 'Hay cantidad o costo pero falta el almacén: no se sabe dónde meterlo.';
        elsif v_cantidad is null then
          v_motivo := 'Hay almacén pero falta la cantidad.';
        elsif v_costo is null then
          v_motivo := 'Hay cantidad pero falta el costo. Sin él, lo que entra vale cero y cada salida futura se carga mal.';
        elsif v_cantidad <= 0 then
          v_motivo := 'La cantidad que entra tiene que ser mayor que cero.';
        elsif v_costo <= 0 then
          v_motivo := 'El costo por unidad tiene que ser mayor que cero.';
        elsif not exists (select 1 from public.monedas where codigo = v_moneda and activa) then
          v_motivo := format('La moneda «%s» no está activa en el sistema.', v_moneda);
        else
          -- Por código o por nombre: quien llena la planilla escribe lo que ve
          -- en la pantalla de almacenes, y ahí se lee el nombre.
          select a.id into v_almacen_id
            from public.almacenes a
           where a.activo
             and (upper(a.codigo) = upper(v_almacen_txt) or upper(a.nombre) = upper(v_almacen_txt));

          if v_almacen_id is null then
            v_motivo := format('El almacén «%s» no existe o está inactivo. Los que hay: %s.',
              v_almacen_txt,
              (select string_agg(a.codigo || ' · ' || a.nombre, ', ' order by a.nombre)
                 from public.almacenes a where a.activo));
          end if;
        end if;
      end if;
    end if;

    if v_motivo is not null then
      v_errores := v_errores + 1;
      v_estado  := 'ERROR';
    else
      v_vistos := v_vistos || coalesce(nullif(v_codigo, ''), 'NUCLEO:' || v_nucleo);
      /*
        Tambien por el codigo viejo: una planilla anterior a la renumeracion
        trae «ACEITE AGROFLUIDOS» donde hoy pone LUB-0001, y sin esto la fila
        entraria como un articulo nuevo con el nombre otra vez en el codigo.
      */
      select id into v_id from public.articulos
       where codigo = v_codigo or codigo_anterior = v_codigo;

      if v_id is null then
        v_estado := 'NUEVO';
        v_nuevos := v_nuevos + 1;

        /*
          SE PARECE A UNO QUE YA ESTA, PERO NO ES EL MISMO.

          Avisa y deja pasar. Una planilla trae DISCO DE CORTE 7 y DISCO DE
          CORTE 9 el mismo dia, y pararla obligaria a partirla en dos. Lo que
          hace falta es que quien la revisa lo VEA antes de confirmar — el
          informe sale en pantalla justamente para eso.
        */
        select format('Se parece a «%s» (%s), que ya está.', a.nombre, a.codigo)
          into v_aviso
          from public.articulos a
         where extensions.similarity(private.nombre_comparable(a.nombre),
                                     private.nombre_comparable(v_nombre)) >= 0.55
         order by extensions.similarity(private.nombre_comparable(a.nombre),
                                        private.nombre_comparable(v_nombre)) desc
         limit 1;
      else
        v_estado := 'ACTUALIZA';
        v_actualizados := v_actualizados + 1;
      end if;

      if v_almacen_id is not null then
        v_con_stock := v_con_stock + 1;
      end if;

      if p_confirmar then
        if v_id is null then
          -- Vacia se deduce de la categoria, la misma regla que crear_articulo:
          -- una herramienta y un repuesto vuelven arreglados del taller, un
          -- lubricante o un producto se gastan.
          v_reparable := case lower(btrim(coalesce(v_fila->>'reparable', '')))
                           when 'si' then true when 'sí' then true
                           when '1' then true  when 'true' then true
                           when 'no' then false when '0' then false
                           when 'false' then false
                           else null end;

          insert into public.articulos
            (codigo, nombre, descripcion, categoria, unidad, inventariable,
             stock_minimo, densidad_ton_m3, modo_entrega, reparable, creado_por)
          values
            (coalesce(nullif(v_codigo, ''), private.codigo_de_articulo(v_categoria)),
             v_nombre, nullif(btrim(coalesce(v_fila->>'descripcion','')), ''),
             v_categoria, v_unidad, v_inv, v_minimo, v_densidad, v_modo,
             coalesce(v_reparable, v_categoria in ('HERRAMIENTA', 'REPUESTO')),
             (select auth.uid()))
          returning id into v_id;
        else
          v_reparable := case lower(btrim(coalesce(v_fila->>'reparable', '')))
                           when 'si' then true when 'sí' then true
                           when '1' then true  when 'true' then true
                           when 'no' then false when '0' then false
                           when 'false' then false
                           else null end;

          update public.articulos
             set nombre = v_nombre,
                 reparable = coalesce(v_reparable, reparable),
                 descripcion = coalesce(nullif(btrim(coalesce(v_fila->>'descripcion','')), ''), descripcion),
                 categoria = v_categoria,
                 unidad = v_unidad,
                 -- Al corregir, la celda vacia significa «no lo toques». Con
                 -- el valor por defecto, una herramienta RETORNABLE a la que se
                 -- le corregia el nombre pasaba a CONSUMIBLE y dejaba de poder
                 -- prestarse.
                 inventariable = case
                   when nullif(btrim(coalesce(v_fila->>'inventariable','')), '') is null
                     then inventariable else v_inv end,
                 stock_minimo = case
                   when nullif(btrim(coalesce(v_fila->>'stock_minimo','')), '') is null
                     then stock_minimo else v_minimo end,
                 densidad_ton_m3 = coalesce(v_densidad, densidad_ton_m3),
                 modo_entrega = case
                   when nullif(btrim(coalesce(v_fila->>'modo_entrega','')), '') is null
                     then modo_entrega else v_modo end
           where id = v_id;
        end if;

        if v_precio is not null then
          insert into public.precios_venta
            (articulo_id, moneda, precio, precio_minimo, actualizado_por, actualizado_en)
          values
            (v_id, v_moneda, v_precio, coalesce(v_precio_min, 0), (select auth.uid()), now())
          on conflict (articulo_id) do update
            set moneda = excluded.moneda,
                precio = excluded.precio,
                precio_minimo = excluded.precio_minimo,
                actualizado_por = excluded.actualizado_por,
                actualizado_en = excluded.actualizado_en;
        end if;

        -- El renglón se guarda para el final, agrupado por su almacén.
        if v_almacen_id is not null then
          v_clave := v_almacen_id::text;
          v_por_almacen := jsonb_set(
            v_por_almacen, array[v_clave],
            coalesce(v_por_almacen -> v_clave, '[]'::jsonb) ||
              jsonb_build_object('articulo_id', v_id, 'cantidad', v_cantidad,
                                 'costo', v_costo, 'moneda', v_moneda));
        end if;
      end if;
    end if;

    v_informe := v_informe || jsonb_build_object(
      'fila', v_n,
      'codigo', v_codigo,
      'nombre', v_nombre,
      'estado', v_estado,
      'motivo', v_motivo,
      'aviso', v_aviso);
  end loop;

  if v_n = 0 then
    raise exception 'La planilla está vacía.' using errcode = '22023';
  end if;

  if p_confirmar and v_errores > 0 then
    raise exception 'La planilla tiene % fila(s) con problemas. No se cargó nada.', v_errores
      using errcode = '22023';
  end if;

  /*
    Y ahora la existencia, una entrada por almacén.

    Va al final y no dentro del bucle porque los artículos nuevos tienen que
    existir antes de que se les meta nada. Si esto revienta —un almacén que se
    desactivó entre la revisión y el guardado— se cae la transacción entera y
    tampoco quedan los artículos, que es lo correcto: media carga es peor que
    ninguna.
  */
  if p_confirmar and v_por_almacen <> '{}'::jsonb then
    for v_clave in select jsonb_object_keys(v_por_almacen) loop
      perform public.registrar_entradas(
        v_clave::bigint,
        v_por_almacen -> v_clave,
        'Carga inicial por planilla',
        null,
        null);
    end loop;
  end if;

  return jsonb_build_object(
    'total', v_n,
    'nuevos', v_nuevos,
    'actualizados', v_actualizados,
    'con_existencia', v_con_stock,
    'errores', v_errores,
    'aplicado', p_confirmar and v_errores = 0,
    'filas', v_informe);
end;
$function$;

-- public.cargar_proveedores_por_lote(p_filas jsonb, p_confirmar boolean)
-- venia de: 20260821170000_cargar_personal_y_proveedores_por_lote.sql
CREATE OR REPLACE FUNCTION public.cargar_proveedores_por_lote(p_filas jsonb, p_confirmar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fila     jsonb;
  v_n        int := 0;
  v_informe  jsonb := '[]'::jsonb;
  v_errores  int := 0;
  v_nuevos   int := 0;
  v_actualiz int := 0;

  v_rif      text;
  v_nombre   text;
  v_condicion text;
  v_moneda   text;
  v_especial boolean;

  v_motivo   text;
  v_estado   text;
  v_id       bigint;
  v_vistos   text[] := array[]::text[];
begin
  perform private.exigir_rol('COMPRAS');

  if jsonb_typeof(p_filas) <> 'array' then
    raise exception 'La planilla no trae filas.' using errcode = '22023';
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_n := v_n + 1;
    v_motivo := null;
    v_estado := null;

    v_rif       := upper(btrim(coalesce(v_fila->>'rif', '')));
    v_nombre    := btrim(coalesce(v_fila->>'nombre', ''));
    v_condicion := upper(coalesce(nullif(btrim(coalesce(v_fila->>'condicion_pago','')),''), 'CONTADO'));
    v_moneda    := upper(coalesce(nullif(btrim(coalesce(v_fila->>'moneda_preferida','')),''), 'USD'));

    v_especial := case lower(btrim(coalesce(v_fila->>'contribuyente_especial', '')))
                    when '' then false
                    when 'si' then true when 'sí' then true when 'true' then true when '1' then true
                    when 'no' then false when 'false' then false when '0' then false
                    else null end;

    if v_rif = '' then
      v_motivo := 'Falta el RIF.';
    elsif v_rif !~ '^[VEJPGC]-[0-9]{8}-[0-9]$' then
      v_motivo := format('El RIF «%s» no tiene la forma que el sistema espera: J-12345678-9, con los dos guiones.', v_rif);
    elsif v_rif = any(v_vistos) then
      v_motivo := format('El RIF %s se repite en la planilla.', v_rif);
    elsif v_nombre = '' then
      v_motivo := 'Falta la razón social.';
    elsif v_condicion not in ('CONTADO','CREDITO_15','CREDITO_30','CREDITO_60','CONTRA_ENTREGA') then
      v_motivo := format('«%s» no es una condición de pago: CONTADO, CREDITO_15, CREDITO_30, CREDITO_60 o CONTRA_ENTREGA.', v_condicion);
    elsif v_especial is null then
      v_motivo := 'La columna «contribuyente_especial» se responde SI o NO.';
    elsif not exists (select 1 from public.monedas where codigo = v_moneda and activa) then
      v_motivo := format('La moneda «%s» no está activa en el sistema.', v_moneda);
    end if;

    if v_motivo is not null then
      v_errores := v_errores + 1;
      v_estado  := 'ERROR';
    else
      v_vistos := v_vistos || v_rif;
      select id into v_id from public.proveedores where rif = v_rif;

      if v_id is null then
        v_estado := 'NUEVO';
        v_nuevos := v_nuevos + 1;
      else
        v_estado := 'ACTUALIZA';
        v_actualiz := v_actualiz + 1;
      end if;

      if p_confirmar then
        if v_id is null then
          insert into public.proveedores
            (rif, nombre, nombre_comercial, contacto, telefono, correo, direccion,
             condicion_pago, moneda_preferida, contribuyente_especial, notas, creado_por)
          values
            (v_rif, v_nombre,
             nullif(btrim(coalesce(v_fila->>'nombre_comercial','')), ''),
             nullif(btrim(coalesce(v_fila->>'contacto','')), ''),
             nullif(btrim(coalesce(v_fila->>'telefono','')), ''),
             nullif(btrim(coalesce(v_fila->>'correo','')), ''),
             nullif(btrim(coalesce(v_fila->>'direccion','')), ''),
             v_condicion, v_moneda, v_especial,
             nullif(btrim(coalesce(v_fila->>'notas','')), ''),
             (select auth.uid()));
        else
          update public.proveedores
             set nombre = v_nombre,
                 nombre_comercial = coalesce(nullif(btrim(coalesce(v_fila->>'nombre_comercial','')), ''), nombre_comercial),
                 contacto = coalesce(nullif(btrim(coalesce(v_fila->>'contacto','')), ''), contacto),
                 telefono = coalesce(nullif(btrim(coalesce(v_fila->>'telefono','')), ''), telefono),
                 correo = coalesce(nullif(btrim(coalesce(v_fila->>'correo','')), ''), correo),
                 direccion = coalesce(nullif(btrim(coalesce(v_fila->>'direccion','')), ''), direccion),
                 -- Al corregir, la celda vacia significa «no lo toques», igual
                 -- que en las otras seis. El valor por defecto es cosa del alta:
                 -- aplicarlo aqui desmarcaba al contribuyente especial de quien
                 -- solo venia a cambiar un telefono.
                 condicion_pago = case
                   when nullif(btrim(coalesce(v_fila->>'condicion_pago','')), '') is null
                     then condicion_pago else v_condicion end,
                 moneda_preferida = case
                   when nullif(btrim(coalesce(v_fila->>'moneda_preferida','')), '') is null
                     then moneda_preferida else v_moneda end,
                 contribuyente_especial = case
                   when nullif(btrim(coalesce(v_fila->>'contribuyente_especial','')), '') is null
                     then contribuyente_especial else v_especial end,
                 notas = coalesce(nullif(btrim(coalesce(v_fila->>'notas','')), ''), notas)
           where id = v_id;
        end if;
      end if;
    end if;

    v_informe := v_informe || jsonb_build_object(
      'fila', v_n, 'codigo', v_rif, 'nombre', v_nombre,
      'estado', v_estado, 'motivo', v_motivo);
  end loop;

  if v_n = 0 then
    raise exception 'La planilla está vacía.' using errcode = '22023';
  end if;

  if p_confirmar and v_errores > 0 then
    raise exception 'La planilla tiene % fila(s) con problemas. No se cargó nada.', v_errores
      using errcode = '22023';
  end if;

  return jsonb_build_object(
    'total', v_n, 'nuevos', v_nuevos, 'actualizados', v_actualiz,
    'errores', v_errores, 'aplicado', p_confirmar and v_errores = 0,
    'filas', v_informe);
end;
$function$;

-- public.registrar_entradas(p_almacen_id bigint, p_renglones jsonb, p_motivo text, p_referencia text, p_fecha date)
-- venia de: 20260907140000_el_costo_raro_avisa_y_queda_marcado.sql
CREATE OR REPLACE FUNCTION public.registrar_entradas(p_almacen_id bigint, p_renglones jsonb, p_motivo text, p_referencia text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c_factor constant numeric := 10;
  v_r jsonb; v_n int := 0; v_articulo bigint; v_cantidad numeric; v_costo numeric;
  v_moneda text; v_costo_usd numeric; v_tasa numeric; v_tasa_usd numeric;
  v_nota text; v_nombre text; v_ref numeric; v_veces numeric; v_msg text;
  v_pres numeric; v_sueltas numeric; v_por_pres numeric; v_unidad_pres text;
  v_nombre_pres text;
begin
  perform private.exigir_rol('ALMACEN');

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'No hay nada que meter: la entrada no trae renglones.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Una entrada sin explicación no se puede auditar después. Escribe de dónde vino.'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.almacenes where id = p_almacen_id and activo) then
    raise exception 'Ese almacén no existe o está inactivo.' using errcode = '23503';
  end if;

  /*
    Un almacen que admite material sin costo lleva su promedio aparte, y ese es
    el motivo de que exista. Meterle material con precio por esta puerta lo
    contamina igual que sacarlo por la otra.
  */
  if exists (select 1 from public.almacenes
              where id = p_almacen_id and coalesce(admite_sin_costo, false)) then
    raise exception 'En «%» solo entra material que esta empresa no pagó, y por eso lleva su costo aparte.'
      , (select nombre from public.almacenes where id = p_almacen_id)
      using errcode = '22023',
            hint = 'Para meter ahí, usa «Cargar combustible al tanque» marcando «no costó nada para esta empresa». Lo que sí costó va a otro almacén.';
  end if;

  v_nota := btrim(p_motivo);
  if nullif(btrim(coalesce(p_referencia, '')), '') is not null then
    v_nota := v_nota || ' · Ref.: ' || btrim(p_referencia);
  end if;

  for v_r in select * from jsonb_array_elements(p_renglones) loop
    v_n := v_n + 1;
    v_veces := null;

    v_articulo := nullif(btrim(coalesce(v_r->>'articulo_id', '')), '')::bigint;
    v_sueltas  := coalesce(nullif(btrim(coalesce(v_r->>'cantidad', '')), '')::numeric, 0);
    v_pres     := coalesce(nullif(btrim(coalesce(v_r->>'presentaciones', '')), '')::numeric, 0);
    v_costo    := coalesce(nullif(btrim(coalesce(v_r->>'costo', '')), '')::numeric, 0);
    v_moneda   := upper(coalesce(nullif(btrim(coalesce(v_r->>'moneda', '')), ''), 'USD'));

    select nombre, presentacion, unidades_por_presentacion
      into v_nombre, v_unidad_pres, v_por_pres
      from public.articulos where id = v_articulo and activo;
    if v_nombre is null then
      raise exception 'El renglón %: ese artículo no existe o está inactivo.', v_n using errcode = '23503';
    end if;

    /*
      SIETE TAMBORES Y DIEZ LITROS. La cuenta la hace la base y no el navegador,
      que es lo que pidio Christopher: «asi el sistema tiene nocion en todo
      momento sobre lo que hay o no hay en sus presentaciones».
    */
    -- En que presentacion se conto este renglon. Nula: la de por defecto.
    v_nombre_pres := nullif(btrim(coalesce(v_r->>'presentacion', '')), '');
    v_cantidad := private.en_unidad_base(v_articulo, v_pres, v_sueltas, v_nombre_pres);

    if v_cantidad <= 0 then
      raise exception 'El renglón % (%): la cantidad tiene que ser mayor que cero.', v_n, v_nombre using errcode = '22023';
    end if;
    if v_costo <= 0 then
      raise exception 'El renglón % (%): hay que decir cuánto costó la unidad. Si de verdad no costó nada, eso no es una entrada: es un ajuste de conteo, y ahí se valora como el resto del almacén.', v_n, v_nombre using errcode = '22023';
    end if;

    /*
      EL COSTO LLEVA SU PROPIA UNIDAD, que no tiene por que ser la misma que la
      cantidad. Alguien cuenta en tambores y conoce el precio por litro, o al
      reves. Sin `costo_por_presentacion` se entiende por unidad de operacion,
      que es como se ha llamado siempre a esta funcion.

      Se DIVIDE, al reves que la cantidad: el precio del bulto repartido entre
      lo que trae.
    */
    if coalesce((v_r->>'costo_por_presentacion')::boolean, false) then
      if coalesce(v_por_pres, 0) <= 0 then
        raise exception 'El renglón % (%): no se puede dar el costo por presentación porque el catálogo no dice cuántas unidades trae.', v_n, v_nombre
          using errcode = '22023';
      end if;
      v_costo := v_costo / v_por_pres;
    end if;

    select t.tasa, t.tasa_usd into v_tasa, v_tasa_usd
      from private.tasas_del_dia(v_moneda, coalesce(p_fecha, current_date)) t;
    if v_tasa is null or coalesce(v_tasa_usd, 0) = 0 then
      raise exception 'El renglón % (%): no hay tasa cargada para % en esa fecha, así que no se puede saber cuánto costó.', v_n, v_nombre, v_moneda using errcode = '22023';
    end if;

    v_costo_usd := round(v_costo * v_tasa / v_tasa_usd, 6);

    /*
      EL AVISO DEL COSTO RARO, RENGLON A RENGLON. La confirmacion viaja EN EL
      RENGLON: con quince renglones, un unico «confirmo» aceptaria a ciegas los
      catorce que nadie miro.
    */
    v_ref := private.costo_promedio(p_almacen_id, v_articulo);

    /*
      LA PRIMERA VEZ NO HAY CONTRA QUE COMPARAR, Y ES CUANDO MAS DUELE.

      La reja de abajo compara el costo nuevo con el promedio que el articulo ya
      tenia. En su primera entrada ese promedio no existe, asi que la reja calla
      — y es justo la entrada que fijo los 868 millones el 5 de septiembre: los
      cinco aceites entraban por primera vez.

      No hay numero contra el que medir, asi que no se puede avisar de que algo
      esta mal. Lo que si se puede es DECIR QUE NADIE LO ESTA COMPROBANDO, y
      pedir que alguien mire antes de que ese costo se convierta en la
      referencia de todo lo que venga despues.

      Se pide una sola vez por articulo y almacen. A partir del segundo
      movimiento hay promedio y manda la reja de las diez veces.
    */
    if coalesce(v_ref, 0) = 0
       and not coalesce((v_r->>'confirmado')::boolean, false) then
      raise exception 'El renglón % (%): es la primera vez que entra a este almacén, así que no hay con qué comparar el costo. Serán % % a % cada una. Compruébalo con la factura y acéptalo.',
        v_n, v_nombre, private.numero_es(v_cantidad, 2),
        (select unidad from public.articulos where id = v_articulo),
        private.numero_es(v_costo, 4)
        using errcode = '22023',
              hint = 'Este costo se convierte en la referencia de todo lo que entre después. Un cero de más aquí no lo va a corregir nadie.';
    end if;

    if coalesce(v_ref, 0) > 0 then
      v_veces := round(v_costo_usd / v_ref, 6);
      if v_veces >= c_factor or v_veces <= (1 / c_factor) then
        if not coalesce((v_r->>'confirmado')::boolean, false) then
          v_msg := case when private.puede_accion('INVENTARIO.VER_VALORACION')
            then format('El renglón %s (%s): viene costando %s por unidad y lo estás metiendo a %s: son %s. Si es correcto, acéptalo y quedará anotado.',
                        v_n, v_nombre, private.numero_es(v_ref, 4),
                        private.numero_es(v_costo_usd, 4), case when v_veces >= 1 then private.numero_es(v_veces, 2) || ' veces mas'
                   else private.numero_es(v_ref / nullif(v_costo_usd, 0), 2) || ' veces menos' end)
            else format('El renglón %s (%s): ese costo se sale mucho de lo que el artículo viene costando. Compruébalo con la factura; si es correcto, acéptalo y quedará anotado.',
                        v_n, v_nombre)
          end;
          raise exception '%', v_msg
            using errcode = '22023',
                  hint = 'Comprueba la factura y la moneda antes de aceptar: un cero de más aquí se arrastra a cada salida.';
        end if;
      else
        v_veces := null;
      end if;
    end if;

    perform private.registrar_movimiento(
      'ENTRADA_DIRECTA', 1::smallint, p_almacen_id, v_articulo, v_cantidad, v_costo_usd,
      case when v_moneda = 'USD' then v_nota
           else v_nota || ' · Costo declarado: ' || v_costo || ' ' || v_moneda end,
      null, null, null, p_fecha, null, null,
      p_aviso_costo => v_veces,
      p_cantidad_capturada => nullif(v_pres, 0),
      p_unidad_capturada => case when v_pres > 0 then private.presentacion_usada(v_articulo, v_nombre_pres) end,
      p_suelto_capturado => case when v_pres > 0 then nullif(v_sueltas, 0) end);
  end loop;

  return v_n;
end;
$function$;

-- public.cargar_personal_por_lote(p_filas jsonb, p_confirmar boolean)
-- venia de: 20260821170000_cargar_personal_y_proveedores_por_lote.sql
CREATE OR REPLACE FUNCTION public.cargar_personal_por_lote(p_filas jsonb, p_confirmar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fila     jsonb;
  v_n        int := 0;
  v_informe  jsonb := '[]'::jsonb;
  v_errores  int := 0;
  v_nuevos   int := 0;
  v_actualiz int := 0;

  v_cedula   text;
  v_nombres  text;
  v_apellidos text;
  v_cargo    text;
  v_dpto     text;
  v_ingreso  date;
  v_nacim    date;
  v_salario  numeric;
  v_moneda   text;
  v_frec     text;
  v_base     text;
  v_jornada  text;
  v_ficha    text;
  v_genero   text;
  v_civil    text;

  v_motivo   text;
  v_estado   text;
  v_id       bigint;
  v_vistas   text[] := array[]::text[];
  v_siguiente int;
begin
  perform private.exigir_rol('RRHH');

  if jsonb_typeof(p_filas) <> 'array' then
    raise exception 'La planilla no trae filas.' using errcode = '22023';
  end if;

  select coalesce(max(ficha::int), 0) into v_siguiente
    from public.empleados where ficha ~ '^[0-9]+$';

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_n := v_n + 1;
    v_motivo := null;
    v_estado := null;
    v_ingreso := null;
    v_nacim := null;

    v_cedula    := upper(btrim(coalesce(v_fila->>'cedula', '')));
    v_nombres   := btrim(coalesce(v_fila->>'nombres', ''));
    v_apellidos := btrim(coalesce(v_fila->>'apellidos', ''));
    v_cargo     := btrim(coalesce(v_fila->>'cargo', ''));
    v_dpto      := nullif(btrim(coalesce(v_fila->>'departamento', '')), '');
    v_ficha     := nullif(btrim(coalesce(v_fila->>'ficha', '')), '');
    v_moneda    := upper(coalesce(nullif(btrim(coalesce(v_fila->>'moneda_salario','')),''), 'VES'));
    v_frec      := upper(coalesce(nullif(btrim(coalesce(v_fila->>'frecuencia','')),''), 'QUINCENAL'));
    v_base      := upper(coalesce(nullif(btrim(coalesce(v_fila->>'base_estipulacion','')),''), 'MENSUAL'));
    v_jornada   := upper(coalesce(nullif(btrim(coalesce(v_fila->>'tipo_jornada','')),''), 'DIURNA'));
    v_genero    := upper(nullif(btrim(coalesce(v_fila->>'genero','')), ''));
    v_civil     := upper(nullif(btrim(coalesce(v_fila->>'estado_civil','')), ''));

    if v_cedula = '' then
      v_motivo := 'Falta la cédula.';
    elsif v_cedula !~ '^[VE]-[0-9]{6,9}$' then
      v_motivo := format('La cédula «%s» no tiene la forma que el sistema espera: V-12345678 o E-12345678, con el guion.', v_cedula);
    elsif v_cedula = any(v_vistas) then
      v_motivo := format('La cédula %s se repite en la planilla.', v_cedula);
    elsif v_nombres = '' then
      v_motivo := 'Faltan los nombres.';
    elsif v_apellidos = '' then
      v_motivo := 'Faltan los apellidos.';
    elsif v_cargo = '' then
      v_motivo := 'Falta el cargo. Es de donde sale el sueldo si se usa el tabulador.';
    elsif v_frec not in ('SEMANAL','QUINCENAL','MENSUAL') then
      v_motivo := format('«%s» no es una frecuencia de pago: SEMANAL, QUINCENAL o MENSUAL.', v_frec);
    elsif v_base not in ('MENSUAL','DIARIO','HORA') then
      v_motivo := format('«%s» no dice cómo se estipula el sueldo: MENSUAL, DIARIO u HORA.', v_base);
    elsif v_jornada not in ('DIURNA','NOCTURNA','MIXTA') then
      v_motivo := format('«%s» no es un tipo de jornada: DIURNA, NOCTURNA o MIXTA.', v_jornada);
    elsif v_genero is not null and v_genero not in ('MASCULINO','FEMENINO') then
      v_motivo := 'El género se escribe MASCULINO o FEMENINO, o se deja vacío.';
    elsif v_civil is not null and v_civil not in ('SOLTERO','CASADO','DIVORCIADO','VIUDO','CONCUBINATO') then
      v_motivo := 'El estado civil es SOLTERO, CASADO, DIVORCIADO, VIUDO o CONCUBINATO.';
    elsif not exists (select 1 from public.monedas where codigo = v_moneda and activa) then
      v_motivo := format('La moneda «%s» no está activa en el sistema.', v_moneda);
    else
      begin
        v_ingreso := private.fecha_de_planilla(v_fila->>'fecha_ingreso');
        v_nacim   := private.fecha_de_planilla(v_fila->>'fecha_nacimiento');
        v_salario := coalesce(nullif(btrim(coalesce(v_fila->>'salario_base','')), '')::numeric, 0);
      exception when others then
        v_motivo := 'Hay una fecha o un número que no se entiende. Las fechas van como 2026-08-21 y los números sin separador de miles.';
      end;

      if v_motivo is not null then
        null;
      elsif v_ingreso is null then
        v_motivo := 'Falta la fecha de ingreso. Sin ella no se puede calcular antigüedad ni prestaciones.';
      elsif v_ingreso > current_date then
        v_motivo := 'La fecha de ingreso es futura.';
      elsif v_salario < 0 then
        v_motivo := 'El salario no puede ser negativo.';
      end if;
    end if;

    if v_motivo is not null then
      v_errores := v_errores + 1;
      v_estado  := 'ERROR';
    else
      v_vistas := v_vistas || v_cedula;
      select id into v_id from public.empleados where cedula = v_cedula;

      if v_id is null then
        v_estado := 'NUEVO';
        v_nuevos := v_nuevos + 1;
      else
        v_estado := 'ACTUALIZA';
        v_actualiz := v_actualiz + 1;
      end if;

      if p_confirmar then
        if v_id is null then
          -- La ficha se pone sola si no viene: es un correlativo interno, no
          -- algo que quien llena la planilla tenga por qué saberse.
          if v_ficha is null then
            v_siguiente := v_siguiente + 1;
            v_ficha := lpad(v_siguiente::text, 4, '0');
          end if;

          insert into public.empleados
            (ficha, cedula, nombres, apellidos, cargo, departamento, fecha_ingreso,
             fecha_nacimiento, telefono, direccion, salario_base, moneda_salario,
             frecuencia, base_estipulacion, tipo_jornada, banco, numero_cuenta,
             genero, estado_civil, nacionalidad, creado_por)
          values
            (v_ficha, v_cedula, v_nombres, v_apellidos, v_cargo, v_dpto, v_ingreso,
             v_nacim,
             nullif(btrim(coalesce(v_fila->>'telefono','')), ''),
             nullif(btrim(coalesce(v_fila->>'direccion','')), ''),
             v_salario, v_moneda, v_frec, v_base, v_jornada,
             nullif(btrim(coalesce(v_fila->>'banco','')), ''),
             nullif(btrim(coalesce(v_fila->>'numero_cuenta','')), ''),
             v_genero, v_civil,
             nullif(btrim(coalesce(v_fila->>'nacionalidad','')), ''),
             (select auth.uid()));
        else
          update public.empleados
             set nombres = v_nombres,
                 apellidos = v_apellidos,
                 cargo = v_cargo,
                 departamento = coalesce(v_dpto, departamento),
                 fecha_ingreso = v_ingreso,
                 fecha_nacimiento = coalesce(v_nacim, fecha_nacimiento),
                 telefono = coalesce(nullif(btrim(coalesce(v_fila->>'telefono','')), ''), telefono),
                 direccion = coalesce(nullif(btrim(coalesce(v_fila->>'direccion','')), ''), direccion),
                 -- Al corregir, la celda vacia significa «no lo toques». El
                 -- valor por defecto es cosa del alta: aplicarlo aqui ponia el
                 -- sueldo en cero a quien solo venia a cambiar un telefono.
                 salario_base = case
                   when nullif(btrim(coalesce(v_fila->>'salario_base','')), '') is null
                     then salario_base else v_salario end,
                 moneda_salario = case
                   when nullif(btrim(coalesce(v_fila->>'moneda_salario','')), '') is null
                     then moneda_salario else v_moneda end,
                 frecuencia = case
                   when nullif(btrim(coalesce(v_fila->>'frecuencia','')), '') is null
                     then frecuencia else v_frec end,
                 base_estipulacion = case
                   when nullif(btrim(coalesce(v_fila->>'base_estipulacion','')), '') is null
                     then base_estipulacion else v_base end,
                 tipo_jornada = case
                   when nullif(btrim(coalesce(v_fila->>'tipo_jornada','')), '') is null
                     then tipo_jornada else v_jornada end,
                 banco = coalesce(nullif(btrim(coalesce(v_fila->>'banco','')), ''), banco),
                 numero_cuenta = coalesce(nullif(btrim(coalesce(v_fila->>'numero_cuenta','')), ''), numero_cuenta),
                 genero = coalesce(v_genero, genero),
                 estado_civil = coalesce(v_civil, estado_civil),
                 nacionalidad = coalesce(nullif(btrim(coalesce(v_fila->>'nacionalidad','')), ''), nacionalidad)
           where id = v_id;
        end if;
      end if;
    end if;

    v_informe := v_informe || jsonb_build_object(
      'fila', v_n,
      'codigo', v_cedula,
      'nombre', btrim(v_nombres || ' ' || v_apellidos),
      'estado', v_estado,
      'motivo', v_motivo);
  end loop;

  if v_n = 0 then
    raise exception 'La planilla está vacía.' using errcode = '22023';
  end if;

  if p_confirmar and v_errores > 0 then
    raise exception 'La planilla tiene % fila(s) con problemas. No se cargó nada.', v_errores
      using errcode = '22023';
  end if;

  -- La cuenta de fichas queda al dia. Esta carga las asigna por su cuenta
  -- con max+1, y sin esto el correlativo se queda en cero: el primero que se
  -- cree despues a mano intentaria llevarse la ficha 0001, que ya existe.
  if p_confirmar and v_errores = 0 then
    perform private.poner_al_dia_ficha();
  end if;

  return jsonb_build_object(
    'total', v_n, 'nuevos', v_nuevos, 'actualizados', v_actualiz,
    'errores', v_errores, 'aplicado', p_confirmar and v_errores = 0,
    'filas', v_informe);
end;
$function$;

-- public.adjuntar_papel_de_compra(p_orden_id bigint, p_tipo text, p_archivo_path text, p_archivo_nombre text, p_nota text)
-- venia de: 20260821190000_los_papeles_que_llegan_con_la_compra.sql
CREATE OR REPLACE FUNCTION public.adjuntar_papel_de_compra(p_orden_id bigint, p_tipo text, p_archivo_path text, p_archivo_nombre text, p_nota text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id bigint;
begin
  -- Los tres roles que tienen el papel en la mano. Exigir COMPRAS para todo
  -- obligaría a que compras suba comprobantes que no ha visto.
  if not private.tiene_rol('ADMIN', 'COMPRAS', 'ALMACEN') then
    raise exception 'No tienes permiso para adjuntar papeles a una compra.'
      using errcode = '42501';
  end if;

  if p_tipo not in ('COMPROBANTE_PAGO', 'NOTA_ENTREGA', 'FACTURA', 'OTRO') then
    raise exception 'Ese no es un papel de compra: comprobante de pago, nota de entrega, factura u otro.'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.ordenes_compra where id = p_orden_id) then
    raise exception 'No existe la orden %.', p_orden_id using errcode = 'P0002';
  end if;

  if length(btrim(coalesce(p_archivo_path, ''))) = 0
     or length(btrim(coalesce(p_archivo_nombre, ''))) = 0 then
    raise exception 'Falta el archivo.' using errcode = '23514';
  end if;

  insert into public.compras_papeles
    (orden_id, tipo, archivo_path, archivo_nombre, nota, subido_por)
  values
    (p_orden_id, p_tipo, btrim(p_archivo_path), btrim(p_archivo_nombre),
     nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$function$;

-- private.validar_firma(p_imagen text, p_origen text)
-- venia de: 20260822090000_la_firma_tambien_de_los_trabajadores.sql
CREATE OR REPLACE FUNCTION private.validar_firma(p_imagen text, p_origen text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_imagen is null or p_imagen not like 'data:image/png;base64,%' then
    raise exception 'La firma tiene que llegar como imagen PNG.' using errcode = '22023';
  end if;

  if length(p_imagen) > 200000 then
    raise exception 'La imagen de la firma pesa % KB y el tope son 195 KB. Recortala para que quede solo el trazo, sin el resto de la hoja.',
      private.numero_es(round(length(p_imagen) / 1024.0), 0)
      using errcode = '22023';
  end if;

  if length(p_imagen) < 200 then
    raise exception 'La firma llego vacia. Dibujala, escribela o carga una imagen antes de guardar.'
      using errcode = '22023';
  end if;

  if p_origen is null or p_origen not in ('DIBUJADA', 'TECLEADA', 'IMAGEN') then
    raise exception 'Origen de firma desconocido: %.', coalesce(p_origen, 'nulo')
      using errcode = '22023';
  end if;
end;
$function$;

-- public.registrar_baja(p_almacen_id bigint, p_articulo_id bigint, p_cantidad numeric, p_causa text, p_motivo text, p_destino text, p_fecha date)
-- venia de: 20260822100000_el_inventario_sabe_dar_de_baja.sql
CREATE OR REPLACE FUNCTION public.registrar_baja(p_almacen_id bigint, p_articulo_id bigint, p_cantidad numeric, p_causa text, p_motivo text, p_destino text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_existencia numeric;
  v_costo      numeric;
  v_articulo   text;
  v_id         bigint;
begin
  perform private.exigir_rol('ALMACEN');

  if p_causa not in ('DANADO', 'OBSOLETO', 'VENCIDO', 'EXTRAVIADO', 'ROBADO') then
    raise exception 'Esa no es una causa de baja: dañado, obsoleto, vencido, extraviado o robado.'
      using errcode = '22023';
  end if;

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad que se da de baja tiene que ser mayor que cero.'
      using errcode = '22023';
  end if;

  -- Mas exigente que en una salida normal: dar de baja destruye valor y el
  -- unico rastro de por que sera lo que se escriba aqui. «Dañado» no explica
  -- nada que la causa no diga ya.
  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Explica que paso, con detalle. Dentro de un año esta frase sera lo unico que quede para justificar la perdida.'
      using errcode = '22023';
  end if;

  v_existencia := private.existencia_para_escribir(p_almacen_id, p_articulo_id);

  if p_cantidad > v_existencia then
    select nombre into v_articulo from public.articulos where id = p_articulo_id;
    raise exception 'De "%" solo hay % en existencia y se intentan dar de baja %.',
      coalesce(v_articulo, p_articulo_id::text), private.numero_es(v_existencia, 4), private.numero_es(p_cantidad, 4)
      using errcode = '22023';
  end if;

  -- Al costo promedio, como toda salida: lo que se pierde vale lo que valia
  -- mientras estaba.
  v_costo := private.costo_promedio(p_almacen_id, p_articulo_id);

  v_id := private.registrar_movimiento(
    'SALIDA_BAJA', -1, p_almacen_id, p_articulo_id, p_cantidad, v_costo,
    btrim(p_motivo), null, null, null, p_fecha, null, null);

  insert into public.inventario_bajas (movimiento_id, causa, destino, solicitada_por)
  values (v_id, p_causa, nullif(btrim(coalesce(p_destino, '')), ''), (select auth.uid()));

  return v_id;
end;
$function$;

-- private.registrar_movimiento(p_tipo text, p_signo integer, p_almacen bigint, p_articulo bigint, p_cantidad numeric, p_costo_usd numeric, p_nota text, p_orden bigint, p_renglon bigint, p_origen bigint, p_fecha date, p_empleado bigint, p_clase text, p_nota_salida text, p_aviso_costo numeric, p_cantidad_capturada numeric, p_unidad_capturada text, p_suelto_capturado numeric)
-- venia de: 20260907140000_el_costo_raro_avisa_y_queda_marcado.sql
CREATE OR REPLACE FUNCTION private.registrar_movimiento(p_tipo text, p_signo integer, p_almacen bigint, p_articulo bigint, p_cantidad numeric, p_costo_usd numeric, p_nota text DEFAULT NULL::text, p_orden bigint DEFAULT NULL::bigint, p_renglon bigint DEFAULT NULL::bigint, p_origen bigint DEFAULT NULL::bigint, p_fecha date DEFAULT NULL::date, p_empleado bigint DEFAULT NULL::bigint, p_clase text DEFAULT NULL::text, p_nota_salida text DEFAULT NULL::text, p_aviso_costo numeric DEFAULT NULL::numeric, p_cantidad_capturada numeric DEFAULT NULL::numeric, p_unidad_capturada text DEFAULT NULL::text, p_suelto_capturado numeric DEFAULT NULL::numeric)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_unidad text; v_id bigint; v_capacidad numeric; v_nombre text; v_hay numeric;
begin
  if p_signo not in (-1, 1) then
    raise exception 'El signo de un movimiento solo puede ser +1 o -1 (recibido: %).', p_signo
      using errcode = '22023';
  end if;

  select unidad into v_unidad from public.articulos where id = p_articulo;
  if v_unidad is null then
    raise exception 'No existe el artículo %.', p_articulo using errcode = 'P0002';
  end if;

  if p_signo = 1 then
    select capacidad, nombre into v_capacidad, v_nombre from public.almacenes where id = p_almacen;
    if v_capacidad is not null then
      perform pg_catalog.pg_advisory_xact_lock(p_almacen::int, 0);
      select coalesce(sum(m.cantidad * m.signo), 0) into v_hay
        from public.inventario_movimientos m
       where m.almacen_id = p_almacen and m.unidad = v_unidad;
      if v_hay + p_cantidad > v_capacidad then
        raise exception 'En "%" caben % % y ya hay %: no entran % más.',
          v_nombre, private.cantidad_es(v_capacidad), v_unidad, private.cantidad_es(v_hay), private.cantidad_es(p_cantidad)
          using errcode = '22023', hint = format('Quedan %s libres.', private.cantidad_es(v_capacidad - v_hay));
      end if;
    end if;
  end if;

  /*
    Todo esto se escribe AQUI y no despues con un update, porque el libro es
    inmutable: `trg_movimientos_inmutables` rechaza UPDATE y DELETE. Un dato del
    movimiento nace con el movimiento.

    COMO SE CONTO, ADEMAS DE CUANTO ES. `cantidad` es siempre la unidad de
    operacion —de ahi salen la existencia y todos los calculos— y al lado queda
    lo que la persona dijo: «7 TAMBOR + 10 L». Se guarda el trio entero y no se
    deriva ninguno de los otros dos, porque `unidades_por_presentacion` puede
    cambiar en el catalogo y entonces el movimiento viejo contaria una mentira
    nueva. Un asiento tiene que poder leerse dentro de diez anos sin depender de
    una tabla que se edita.
  */
  insert into public.inventario_movimientos
    (numero, fecha, tipo, signo, almacen_id, articulo_id, cantidad, unidad,
     costo_usd, orden_id, orden_renglon_id, movimiento_origen, nota, empleado_id,
     entrega_clase, registrado_por, nota_salida, aviso_costo,
     cantidad_capturada, unidad_capturada, suelto_capturado)
  values
    (private.siguiente_numero('MOV'), coalesce(p_fecha, current_date), p_tipo, p_signo,
     p_almacen, p_articulo, p_cantidad, v_unidad, coalesce(p_costo_usd, 0),
     p_orden, p_renglon, p_origen, nullif(trim(coalesce(p_nota, '')), ''), p_empleado,
     p_clase, (select auth.uid()), p_nota_salida, p_aviso_costo,
     nullif(p_cantidad_capturada, 0),
     nullif(btrim(coalesce(p_unidad_capturada, '')), ''),
     nullif(p_suelto_capturado, 0))
  returning id into v_id;

  return v_id;
end;
$function$;

-- public.registrar_pagos_en_lote(p_ids bigint[], p_cuenta_id bigint, p_referencia text, p_fecha date, p_nota text)
-- venia de: 20260822130000_pagos_por_lote_con_prioridad_y_unidad.sql
CREATE OR REPLACE FUNCTION public.registrar_pagos_en_lote(p_ids bigint[], p_cuenta_id bigint, p_referencia text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date, p_nota text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id      bigint;
  v_cuenta  record;
  v_monedas text;
  v_cuantas integer := 0;
begin
  perform private.exigir_rol('COMPRAS');

  if coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'No hay ningún pago marcado.' using errcode = '22023';
  end if;

  select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta_id;
  if v_cuenta.id is null then
    raise exception 'Indica por dónde sale el dinero.' using errcode = '22023';
  end if;

  -- Se mira el lote entero antes de tocar nada: fallar en el tercero deja a
  -- quien paga sin saber cuántos de los doce eran del problema.
  select string_agg(distinct moneda, ', ') into v_monedas
    from public.instrucciones_pago
   where id = any(p_ids) and moneda <> v_cuenta.moneda;

  if v_monedas is not null then
    raise exception 'El lote tiene pagos en % y la cuenta está en %. Un lote sale de una sola cuenta, así que agrupa por moneda.',
      v_monedas, v_cuenta.moneda
      using errcode = '22023';
  end if;

  foreach v_id in array p_ids loop
    perform public.registrar_pago(v_id, p_cuenta_id, p_referencia, p_fecha, p_nota);
    v_cuantas := v_cuantas + 1;
  end loop;

  return v_cuantas;
end;
$function$;

-- public.guardar_empleado(p_id bigint, p_cedula text, p_nombres text, p_apellidos text, p_cargo text, p_departamento text, p_fecha_ingreso date, p_fecha_nacimiento date, p_genero text, p_nacionalidad text, p_estado_civil text, p_grupo_sanguineo text, p_telefono text, p_direccion text, p_contacto_emergencia text, p_telefono_emergencia text, p_frecuencia text, p_base text, p_salario numeric, p_moneda character, p_jornada text, p_dias_utilidades numeric, p_forma_pago text, p_banco text, p_numero_cuenta text, p_telefono_pago text, p_activo boolean, p_nota text, p_tabulador_id bigint)
-- venia de: 20260729210000_tabulador.sql
CREATE OR REPLACE FUNCTION public.guardar_empleado(p_id bigint DEFAULT NULL::bigint, p_cedula text DEFAULT NULL::text, p_nombres text DEFAULT NULL::text, p_apellidos text DEFAULT NULL::text, p_cargo text DEFAULT NULL::text, p_departamento text DEFAULT NULL::text, p_fecha_ingreso date DEFAULT NULL::date, p_fecha_nacimiento date DEFAULT NULL::date, p_genero text DEFAULT NULL::text, p_nacionalidad text DEFAULT NULL::text, p_estado_civil text DEFAULT NULL::text, p_grupo_sanguineo text DEFAULT NULL::text, p_telefono text DEFAULT NULL::text, p_direccion text DEFAULT NULL::text, p_contacto_emergencia text DEFAULT NULL::text, p_telefono_emergencia text DEFAULT NULL::text, p_frecuencia text DEFAULT 'QUINCENAL'::text, p_base text DEFAULT 'MENSUAL'::text, p_salario numeric DEFAULT 0, p_moneda character DEFAULT 'VES'::bpchar, p_jornada text DEFAULT 'DIURNA'::text, p_dias_utilidades numeric DEFAULT NULL::numeric, p_forma_pago text DEFAULT 'TRANSFERENCIA'::text, p_banco text DEFAULT NULL::text, p_numero_cuenta text DEFAULT NULL::text, p_telefono_pago text DEFAULT NULL::text, p_activo boolean DEFAULT true, p_nota text DEFAULT NULL::text, p_tabulador_id bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id bigint;
begin
  perform private.exigir_rol('RRHH');

  if length(trim(coalesce(p_nombres, ''))) < 2 or length(trim(coalesce(p_apellidos, ''))) < 2 then
    raise exception 'Faltan el nombre y el apellido del trabajador.' using errcode = '22023';
  end if;

  if p_fecha_ingreso is null then
    raise exception 'La fecha de ingreso decide la antigüedad, el bono vacacional y las prestaciones. No puede quedar vacía.'
      using errcode = '22023';
  end if;

  if p_fecha_nacimiento is not null and p_fecha_nacimiento > current_date - interval '14 years' then
    raise exception 'La fecha de nacimiento da menos de 14 años. Es la edad mínima para trabajar (LOPNNA art. 96); revísala.'
      using errcode = '22023';
  end if;

  if p_tabulador_id is not null
     and not exists (select 1 from public.nomina_tabulador where id = p_tabulador_id) then
    raise exception 'Ese cargo del tabulador ya no existe.' using errcode = 'P0002';
  end if;

  if p_id is null then
    insert into public.empleados
      (ficha, cedula, nombres, apellidos, cargo, departamento, fecha_ingreso,
       fecha_nacimiento, genero, nacionalidad, estado_civil, grupo_sanguineo,
       telefono, direccion, contacto_emergencia, telefono_emergencia,
       frecuencia, base_estipulacion, salario_base, moneda_salario, tipo_jornada,
       dias_utilidades, forma_pago, banco, numero_cuenta, telefono_pago,
       activo, nota, tabulador_id, fecha_ingreso_confirmada, creado_por)
    values
      (private.siguiente_ficha(),
       upper(trim(p_cedula)), trim(p_nombres), trim(p_apellidos), trim(p_cargo),
       nullif(trim(coalesce(p_departamento, '')), ''), p_fecha_ingreso,
       p_fecha_nacimiento,
       nullif(trim(coalesce(p_genero, '')), ''),
       nullif(trim(coalesce(p_nacionalidad, '')), ''),
       nullif(trim(coalesce(p_estado_civil, '')), ''),
       nullif(trim(coalesce(p_grupo_sanguineo, '')), ''),
       nullif(trim(coalesce(p_telefono, '')), ''),
       nullif(trim(coalesce(p_direccion, '')), ''),
       nullif(trim(coalesce(p_contacto_emergencia, '')), ''),
       nullif(trim(coalesce(p_telefono_emergencia, '')), ''),
       p_frecuencia, p_base, p_salario, p_moneda, p_jornada, p_dias_utilidades,
       p_forma_pago,
       nullif(trim(coalesce(p_banco, '')), ''),
       nullif(trim(coalesce(p_numero_cuenta, '')), ''),
       nullif(trim(coalesce(p_telefono_pago, '')), ''),
       coalesce(p_activo, true), nullif(trim(coalesce(p_nota, '')), ''),
       p_tabulador_id, true,
       (select auth.uid()))
    returning id into v_id;

    return v_id;
  end if;

  update public.empleados set
    cedula = upper(trim(p_cedula)),
    nombres = trim(p_nombres),
    apellidos = trim(p_apellidos),
    cargo = trim(p_cargo),
    departamento = nullif(trim(coalesce(p_departamento, '')), ''),
    fecha_ingreso = p_fecha_ingreso,
    -- Alguien abrió la ficha, vio la fecha de ingreso —es obligatoria y está en
    -- el formulario— y guardó. Eso es la revisión que le faltaba.
    fecha_ingreso_confirmada = true,
    fecha_nacimiento = p_fecha_nacimiento,
    genero = nullif(trim(coalesce(p_genero, '')), ''),
    nacionalidad = nullif(trim(coalesce(p_nacionalidad, '')), ''),
    estado_civil = nullif(trim(coalesce(p_estado_civil, '')), ''),
    grupo_sanguineo = nullif(trim(coalesce(p_grupo_sanguineo, '')), ''),
    telefono = nullif(trim(coalesce(p_telefono, '')), ''),
    direccion = nullif(trim(coalesce(p_direccion, '')), ''),
    contacto_emergencia = nullif(trim(coalesce(p_contacto_emergencia, '')), ''),
    telefono_emergencia = nullif(trim(coalesce(p_telefono_emergencia, '')), ''),
    frecuencia = p_frecuencia,
    base_estipulacion = p_base,
    salario_base = p_salario,
    moneda_salario = p_moneda,
    tipo_jornada = p_jornada,
    dias_utilidades = p_dias_utilidades,
    forma_pago = p_forma_pago,
    banco = nullif(trim(coalesce(p_banco, '')), ''),
    numero_cuenta = nullif(trim(coalesce(p_numero_cuenta, '')), ''),
    telefono_pago = nullif(trim(coalesce(p_telefono_pago, '')), ''),
    activo = coalesce(p_activo, true),
    nota = nullif(trim(coalesce(p_nota, '')), ''),
    tabulador_id = p_tabulador_id
  where id = p_id;

  return p_id;
exception
  when unique_violation then
    -- Se mira QUÉ restricción falló. Antes cualquier choque de unicidad decía
    -- «ya hay un trabajador con esa cédula», y el que chocaba de verdad era el
    -- número de ficha: quien lo sufría probaba cédula tras cédula sin que
    -- ninguna sirviera, porque el problema estaba en otro campo.
    declare v_cual text;
    begin
      get stacked diagnostics v_cual = constraint_name;
      if v_cual = 'empleados_ficha_key' then
        raise exception 'El número de ficha que iba a asignarse ya está en uso. No es cosa de la cédula: es la numeración interna, que se quedó atrás. Vuelve a intentarlo.'
          using errcode = '23505';
      end if;
      raise exception 'Ya hay un trabajador con la cédula %.', upper(trim(coalesce(p_cedula, '')))
        using errcode = '23505';
    end;
  when check_violation then
    raise exception 'Hay un dato con formato inválido: la cédula se escribe V-12345678, y el grupo sanguíneo es uno de A+, A-, B+, B-, AB+, AB-, O+ u O-.'
      using errcode = '23514';
end;
$function$;

-- public.registrar_entrada(p_almacen_id bigint, p_articulo_id bigint, p_cantidad numeric, p_costo_usd numeric, p_motivo text, p_referencia text, p_fecha date, p_sin_costo boolean, p_confirmado boolean)
-- venia de: 20260907140000_el_costo_raro_avisa_y_queda_marcado.sql
CREATE OR REPLACE FUNCTION public.registrar_entrada(p_almacen_id bigint, p_articulo_id bigint, p_cantidad numeric, p_costo_usd numeric, p_motivo text, p_referencia text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date, p_sin_costo boolean DEFAULT false, p_confirmado boolean DEFAULT false)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c_factor constant numeric := 10;
  v_nota text; v_admite boolean; v_ref numeric; v_veces numeric; v_nombre text; v_msg text;
begin
  perform private.exigir_rol('ALMACEN');

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad que entra tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  select a.admite_sin_costo into v_admite from public.almacenes a where a.id = p_almacen_id;

  if p_sin_costo then
    if not coalesce(v_admite, false) then
      raise exception 'Aquí no entra material sin costo: se hundiría el costo promedio de lo que ya hay.'
        using errcode = '22023', hint = 'Mételo en el tanque de combustible inicial, que es el que lo lleva aparte.';
    end if;
    if coalesce(p_costo_usd, 0) <> 0 then
      raise exception 'Si el material no costó nada para esta empresa, el costo tiene que ir en cero. Quita la marca o pon el costo en cero.'
        using errcode = '22023';
    end if;
    if length(btrim(coalesce(p_motivo, ''))) < 15 then
      raise exception 'Una entrada sin costo hay que explicarla entera: de dónde vino y quién asumió el gasto. Dentro de un año esa nota es lo único que lo va a contestar.'
        using errcode = '22023';
    end if;
  elsif coalesce(v_admite, false) then
    raise exception 'Aquí solo entra lo que no costó nada. Lo que tiene precio va al tanque de siempre.'
      using errcode = '22023';
  elsif coalesce(p_costo_usd, 0) <= 0 then
    raise exception 'Hay que decir cuánto costó la unidad. Si el gasto lo asumió otra empresa del grupo, marca «no costó nada para esta empresa» y explica de dónde vino.'
      using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Una entrada sin explicación no se puede auditar después. Escribe de dónde vino.'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.almacenes where id = p_almacen_id and activo) then
    raise exception 'Ese almacén no existe o está inactivo.' using errcode = '23503';
  end if;
  if not exists (select 1 from public.articulos where id = p_articulo_id and activo) then
    raise exception 'Ese artículo no existe o está inactivo.' using errcode = '23503';
  end if;

  /*
    EL AVISO. Solo cuando hay un promedio anterior contra el que comparar: en la
    primera entrada de un articulo no hay referencia y esto no protege. Ese caso
    lo cubre la pantalla, ensenando la cuenta hecha mientras se teclea — y es el
    de los cinco aceites del 5 de septiembre, que entraban por primera vez.

    EL MENSAJE NO DICE LO QUE ESA PERSONA NO PUEDE VER. `v_existencias` esconde
    el costo promedio a quien no tiene INVENTARIO.VER_VALORACION, y el rol
    ALMACEN —justo quien registra las entradas— NO lo tiene. Decirle «viene
    costando 6.074,64» le entregaria por la puerta de atras el dato que la vista
    le niega; y decirle solo el factor tampoco vale, porque sabe lo que tecleo y
    dividiendo llega al mismo sitio. A quien no puede verlo se le dice QUE se
    sale, no CUANTO. Sigue siendo accionable: comprueba la factura.
  */
  if not p_sin_costo and coalesce(p_costo_usd, 0) > 0 then
    v_ref := private.costo_promedio(p_almacen_id, p_articulo_id);
    if coalesce(v_ref, 0) > 0 then
      v_veces := round(p_costo_usd / v_ref, 6);
      if v_veces >= c_factor or v_veces <= (1 / c_factor) then
        if not p_confirmado then
          select nombre into v_nombre from public.articulos where id = p_articulo_id;
          v_msg := case when private.puede_accion('INVENTARIO.VER_VALORACION')
            then format('%s viene costando %s por unidad y lo estás metiendo a %s: son %s. Si es correcto, acéptalo y quedará anotado.',
                        v_nombre, private.numero_es(v_ref, 4),
                        private.numero_es(p_costo_usd, 4), case when v_veces >= 1 then private.numero_es(v_veces, 2) || ' veces mas'
                   else private.numero_es(v_ref / nullif(p_costo_usd, 0), 2) || ' veces menos' end)
            else format('El costo de %s se sale mucho de lo que ese artículo viene costando. Compruébalo con la factura; si es correcto, acéptalo y quedará anotado.',
                        v_nombre)
          end;
          raise exception '%', v_msg
            using errcode = '22023',
                  hint = 'Comprueba la factura y la moneda antes de aceptar: un cero de más aquí se arrastra a cada salida.';
        end if;
      else
        v_veces := null;
      end if;
    end if;
  end if;

  v_nota := btrim(p_motivo);
  if nullif(btrim(coalesce(p_referencia, '')), '') is not null then
    v_nota := v_nota || ' · Ref.: ' || btrim(p_referencia);
  end if;
  if p_sin_costo then
    v_nota := v_nota || ' · Sin costo para esta empresa: el gasto lo asumió otra.';
  end if;

  return private.registrar_movimiento(
    'ENTRADA_DIRECTA', 1::smallint, p_almacen_id, p_articulo_id, p_cantidad,
    coalesce(p_costo_usd, 0), v_nota, null, null, null, p_fecha,
    p_aviso_costo => v_veces);
end;
$function$;

-- public.cerrar_mantenimiento(p_id bigint, p_detalle text, p_costo_usd numeric, p_repuestos jsonb, p_estado_salida text, p_fecha_salida date, p_devuelto numeric, p_destino_id bigint)
-- venia de: 20260824250000_al_taller_se_manda_material_y_cada_taller_sabe_lo_suyo.sql
CREATE OR REPLACE FUNCTION public.cerrar_mantenimiento(p_id bigint, p_detalle text, p_costo_usd numeric DEFAULT NULL::numeric, p_repuestos jsonb DEFAULT '[]'::jsonb, p_estado_salida text DEFAULT 'EN_ESPERA'::text, p_fecha_salida date DEFAULT NULL::date, p_devuelto numeric DEFAULT NULL::numeric, p_destino_id bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_orden record;
  v_maq   record;
  v_art   record;
  v_salida date := coalesce(p_fecha_salida, (now() at time zone 'America/Caracas')::date);
  v_hoy    date := (now() at time zone 'America/Caracas')::date;
  v_r jsonb; v_rart bigint; v_rcant numeric;
  v_unitario numeric; v_costo numeric; v_hay numeric; v_mov bigint;
  v_total numeric := 0; v_nombre text;
  v_devuelto numeric;
  v_merma numeric;
  v_sobre text;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  select * into v_orden from public.mantenimientos where id = p_id for update;
  if v_orden.id is null then
    raise exception 'No existe la orden de taller %.', p_id using errcode = 'P0002';
  end if;
  if v_orden.estado <> 'ABIERTO' then
    raise exception 'La orden % está %.', coalesce(v_orden.numero, p_id::text),
      lower(v_orden.estado) using errcode = '55000';
  end if;
  if length(btrim(coalesce(p_detalle, ''))) < 3 then
    raise exception 'Hay que decir qué se hizo.' using errcode = '23514';
  end if;
  if v_salida < v_orden.fecha then
    raise exception 'No puede salir del taller antes de haber entrado.' using errcode = '22023';
  end if;
  if v_salida > v_hoy then
    raise exception 'No se puede cerrar una orden de taller con fecha futura.' using errcode = '22023';
  end if;

  -- ---- los repuestos que se usaron de verdad ----------------------------
  if jsonb_array_length(coalesce(p_repuestos, '[]'::jsonb)) > 0 and v_orden.taller_id is null then
    raise exception 'Para descontar repuestos la orden tiene que decir en qué taller se hizo.'
      using errcode = '23514';
  end if;

  if v_orden.maquina_id is not null then
    select * into v_maq from public.maquinaria where id = v_orden.maquina_id for update;
    v_sobre := v_maq.nombre;
  else
    select * into v_art from public.articulos where id = v_orden.articulo_id;
    v_sobre := v_art.nombre;
  end if;

  for v_r in select * from jsonb_array_elements(coalesce(p_repuestos, '[]'::jsonb))
  loop
    v_rart  := (v_r ->> 'articulo_id')::bigint;
    v_rcant := (v_r ->> 'cantidad')::numeric;

    if v_rart is null or coalesce(v_rcant, 0) <= 0 then
      raise exception 'Cada repuesto necesita un artículo y una cantidad mayor que cero.'
        using errcode = '23514';
    end if;

    select nombre into v_nombre from public.articulos where id = v_rart;
    if v_nombre is null then
      raise exception 'No existe el artículo %.', v_rart using errcode = 'P0002';
    end if;

    v_hay := private.existencia_para_escribir(v_orden.taller_id, v_rart);
    if v_hay < v_rcant then
      raise exception 'El taller solo tiene % de "%": no alcanza para %.',
        v_hay, v_nombre, v_rcant using errcode = '55000';
    end if;

    v_unitario := private.costo_promedio(v_orden.taller_id, v_rart);
    v_costo    := v_unitario * v_rcant;

    v_mov := private.registrar_movimiento(
      'SALIDA_CONSUMO', -1, v_orden.taller_id, v_rart, v_rcant, v_unitario,
      format('Taller %s · %s', coalesce(v_orden.numero, p_id::text), v_sobre),
      null, null, null, v_salida);

    insert into public.mantenimiento_repuestos
      (mantenimiento_id, articulo_id, cantidad, costo_usd, movimiento_id, estado)
    values (p_id, v_rart, v_rcant, v_costo, v_mov, 'USADO');

    v_total := v_total + v_costo;
  end loop;

  -- ---- si era material, vuelve ------------------------------------------
  if v_orden.articulo_id is not null then
    -- Lo normal es que vuelva todo. Se admite que vuelva menos —una varilla se
    -- parte al enderezarla— y esa diferencia es merma, no material perdido de
    -- vista: se registra como tal para que el inventario cuadre y para que la
    -- merma del taller se pueda mirar.
    v_devuelto := coalesce(p_devuelto, v_orden.cantidad);

    if v_devuelto < 0 or v_devuelto > v_orden.cantidad then
      raise exception 'Del taller no puede volver más de lo que entró (entraron %).', v_orden.cantidad
        using errcode = '22023';
    end if;

    if p_destino_id is null then
      raise exception 'Hay que decir a qué almacén vuelve el material.' using errcode = '23514';
    end if;

    if v_devuelto > 0 then
      perform public.transferir_existencia(
        p_origen_id := v_orden.taller_id,
        p_destino_id := p_destino_id,
        p_articulo_id := v_orden.articulo_id,
        p_cantidad := v_devuelto,
        p_motivo := format('Vuelve del taller · %s', coalesce(v_orden.numero, p_id::text)),
        p_fecha := v_salida);
    end if;

    v_merma := v_orden.cantidad - v_devuelto;
    if v_merma > 0 then
      perform private.registrar_movimiento(
        'SALIDA_MERMA', -1, v_orden.taller_id, v_orden.articulo_id, v_merma,
        private.costo_promedio(v_orden.taller_id, v_orden.articulo_id),
        format('Merma en el taller · %s', coalesce(v_orden.numero, p_id::text)),
        null, null, null, v_salida);
    end if;
  end if;

  update public.mantenimientos
     set estado = 'CERRADO', detalle = btrim(p_detalle), fecha_salida = v_salida,
         costo_usd = p_costo_usd, costo_repuestos_usd = v_total,
         cantidad_devuelta = v_devuelto,
         cerrado_por = (select auth.uid()), cerrado_en = now()
   where id = p_id;

  -- ---- la máquina sale con el estado que le toque ------------------------
  if v_orden.maquina_id is not null then
    if p_estado_salida not in ('EN_ESPERA', 'ACTIVA', 'FUERA_DE_SERVICIO') then
      raise exception 'Al salir del taller una máquina queda en espera, activa o fuera de servicio.'
        using errcode = '22023';
    end if;
    update public.maquinaria set estado = p_estado_salida where id = v_orden.maquina_id;
  end if;

  perform private.notificar(
    'MAQUINARIA', 'MANTENIMIENTO_CERRADO',
    format('%s salió del taller', v_sobre),
    case when v_orden.tipo = 'MANTENIMIENTO'
         then 'Su contador de horas vuelve a cero.'
         when v_orden.articulo_id is not null and coalesce(v_merma, 0) > 0
         then format('Volvieron %s de %s: el resto es merma.', v_devuelto, v_orden.cantidad)
         else 'Trabajo terminado.' end,
    '/app/maquinaria/mantenimientos', array['OPERACIONES', 'ALMACEN'], 'INFO');

  return p_id;
end;
$function$;

-- public.registrar_egreso(p_cuenta bigint, p_monto numeric, p_concepto text, p_categoria text, p_fecha date, p_referencia text, p_contraparte text, p_nota text, p_tipo text)
-- venia de: 20260824180000_un_gasto_se_puede_decir_de_que_clase_es.sql
CREATE OR REPLACE FUNCTION public.registrar_egreso(p_cuenta bigint, p_monto numeric, p_concepto text, p_categoria text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date, p_referencia text DEFAULT NULL::text, p_contraparte text DEFAULT NULL::text, p_nota text DEFAULT NULL::text, p_tipo text DEFAULT 'EGRESO'::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id bigint;
begin
  perform private.exigir_permiso('TESORERIA', 'ESCRITURA');

  if length(trim(coalesce(p_concepto, ''))) < 4 then
    raise exception 'Escribe en qué se gastó. Un monto sin concepto no se puede conciliar después.'
      using errcode = '22023';
  end if;

  if p_tipo not in ('EGRESO', 'COMISION') then
    raise exception 'Tipo de egreso no válido: %.', p_tipo using errcode = '22023';
  end if;

  if p_categoria is not null
     and not exists (select 1 from public.categorias_gasto c
                      where c.codigo = p_categoria and c.activa) then
    raise exception 'No existe la categoría de gasto "%".', p_categoria using errcode = '22023';
  end if;

  v_id := private.registrar_movimiento_tesoreria(
    p_cuenta, p_tipo, -1, p_monto, p_concepto, p_fecha,
    p_referencia, p_contraparte, null, null, null, p_nota);

  -- La categoría se pone después del insert y no dentro de
  -- `registrar_movimiento_tesoreria`, para no cambiarle la firma a la función
  -- por la que pasan las dieciséis que mueven dinero. El disparador de
  -- inmutabilidad deja pasar esta transición —de nula a valor, sin tocar nada
  -- más— precisamente para esto.
  if p_categoria is not null then
    update public.tesoreria_movimientos set categoria = p_categoria where id = v_id;
  end if;

  return v_id;
end;
$function$;

-- public.crear_articulo(p_codigo text, p_nombre text, p_categoria text, p_unidad text, p_descripcion text, p_inventariable boolean, p_stock_minimo numeric, p_modo_entrega text, p_reparable boolean, p_presentacion text, p_unidades_por_presentacion numeric, p_marca text, p_numero_parte text, p_confirmado boolean)
-- venia de: 20260908180000_las_dos_que_faltaban_volcadas.sql
CREATE OR REPLACE FUNCTION public.crear_articulo(p_codigo text, p_nombre text, p_categoria text, p_unidad text, p_descripcion text DEFAULT NULL::text, p_inventariable boolean DEFAULT true, p_stock_minimo numeric DEFAULT 0, p_modo_entrega text DEFAULT NULL::text, p_reparable boolean DEFAULT NULL::boolean, p_presentacion text DEFAULT NULL::text, p_unidades_por_presentacion numeric DEFAULT NULL::numeric, p_marca text DEFAULT NULL::text, p_numero_parte text DEFAULT NULL::text, p_confirmado boolean DEFAULT false)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id        bigint;
  v_modo      text;
  v_codigo    text;
  v_reparable boolean;
  v_pres      text := nullif(trim(coalesce(p_presentacion, '')), '');
  v_igual     record;
begin
  perform private.exigir_rol('COMPRAS', 'ALMACEN');

  if length(trim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El artículo necesita un nombre.' using errcode = '22023';
  end if;

  /*
    EL QUE YA ESTA Y SE LLAMA IGUAL.

    Christopher: «debemos asegurar que el sistema impide (o minimo
    advierte/sugiere) duplicados... Insumos o Insumo, Repuesto disco de corte 7'
    o Disco de corte 7'».

    Aqui se PARA, no se impide: dos articulos pueden llamarse casi igual y ser
    dos cosas —DISCO DE CORTE 7 y DISCO DE CORTE 9—, asi que la decision es de
    quien lo esta creando. Lo que no puede pasar es que la tome sin enterarse.

    Solo salta con el nucleo IDENTICO. Los parecidos de menos —«aceite motor SAE
    50» contra «ACEITE DE MOTOR SAE 50»— los ensena la pantalla mientras se
    escribe, con `articulos_parecidos`, que para eso sugiere sin bloquear.

    El inactivo tambien cuenta: se desactiva lo que deja de usarse, no lo que
    deja de existir, y volver a crearlo con otro codigo parte su historia en dos.
  */
  if not coalesce(p_confirmado, false) then
    select a.codigo, a.nombre, a.activo into v_igual
      from public.articulos a
     where private.nombre_nucleo(a.nombre) = private.nombre_nucleo(p_nombre)
     order by a.activo desc
     limit 1;

    if v_igual.codigo is not null then
      -- Tres huecos separados. `%%` seria un porcentaje literal, no dos.
      raise exception 'Ya existe «%» con el código %.% Si de verdad es otra cosa, confírmalo.',
        v_igual.nombre, v_igual.codigo,
        case when v_igual.activo then '' else ' Está inactivo, pero sigue en el catálogo.' end
        using errcode = '22023',
              hint = 'Dos artículos casi iguales acaban con la existencia repartida entre los dos y ninguno cuadrando.';
    end if;
  end if;

  /*
    EL CODIGO NO SE PIDE: SE PONE.

    Once de los quince articulos de hoy llevan el nombre metido en el campo del
    codigo —«ACEITE AGROFLUIDOS» es a la vez nombre y codigo— porque la planilla
    lo exigia y quien la lleno no tenia ninguno que escribir. Un codigo que es
    el nombre no distingue nada: el indice unico deja pasar el mismo articulo
    dos veces con una letra de diferencia.
  */
  v_codigo := nullif(upper(trim(coalesce(p_codigo, ''))), '');

  -- El nombre no sirve de codigo. Ver el comentario de arriba.
  if v_codigo is not null
     and private.nombre_nucleo(v_codigo) = private.nombre_nucleo(p_nombre) then
    raise exception 'El código no puede ser el nombre del artículo.'
      using errcode = '22023',
            hint = 'Déjalo vacío y se pone solo, con el prefijo de su categoría.';
  end if;

  if v_codigo is null then
    v_codigo := private.codigo_de_articulo(p_categoria);
  end if;

  v_reparable := coalesce(p_reparable, p_categoria in ('HERRAMIENTA', 'REPUESTO'));

  v_modo := coalesce(nullif(trim(coalesce(p_modo_entrega, '')), ''),
    case p_categoria
      when 'HERRAMIENTA' then 'RETORNABLE'
      when 'EPP'         then 'RETORNABLE'
      when 'PRODUCTO'    then 'NO'
      when 'SERVICIO'    then 'NO'
      else 'CONSUMIBLE'
    end);

  if v_pres is null and p_unidades_por_presentacion is not null then
    raise exception 'Dice cuántas unidades trae la presentación, pero no dice cuál es. Escribe la presentación o deja las dos vacías.'
      using errcode = '22023';
  end if;

  insert into public.articulos
    (codigo, nombre, descripcion, categoria, unidad, inventariable, stock_minimo,
     modo_entrega, reparable, presentacion, unidades_por_presentacion,
     marca, numero_parte, creado_por)
  values
    (v_codigo, trim(p_nombre), nullif(trim(coalesce(p_descripcion, '')), ''),
     p_categoria, p_unidad,
     case when p_categoria = 'SERVICIO' then false else p_inventariable end,
     coalesce(p_stock_minimo, 0), v_modo, v_reparable,
     v_pres, p_unidades_por_presentacion,
     nullif(trim(coalesce(p_marca, '')), ''),
     nullif(trim(coalesce(p_numero_parte, '')), ''),
     (select auth.uid()))
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe un artículo con el código %.', v_codigo
      using errcode = '23505';
  when foreign_key_violation then
    raise exception 'Esa presentación no está en la lista.' using errcode = '23503';
end;
$function$;

-- public.guardar_motivo_despacho(p_codigo text, p_nombre text, p_pista text, p_orden smallint, p_exige_detalle boolean, p_activo boolean)
-- venia de: 20260824200000_los_catalogos_los_lleva_la_empresa.sql
CREATE OR REPLACE FUNCTION public.guardar_motivo_despacho(p_codigo text DEFAULT NULL::text, p_nombre text DEFAULT NULL::text, p_pista text DEFAULT NULL::text, p_orden smallint DEFAULT NULL::smallint, p_exige_detalle boolean DEFAULT false, p_activo boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_codigo text;
  v_nombre text := btrim(coalesce(p_nombre, ''));
begin
  perform private.exigir_permiso('COMBUSTIBLE', 'ESCRITURA');

  if length(v_nombre) < 3 then
    raise exception 'El motivo necesita un nombre.' using errcode = '22023';
  end if;

  if p_codigo is null then
    v_codigo := private.codigo_desde_nombre(v_nombre);
    if exists (select 1 from public.motivos_despacho m where m.codigo = v_codigo) then
      raise exception 'Ya hay un motivo que se llama así.' using errcode = '23505';
    end if;

    insert into public.motivos_despacho (codigo, nombre, pista, orden, exige_detalle, activo)
    values (v_codigo, v_nombre, nullif(btrim(coalesce(p_pista, '')), ''),
            coalesce(p_orden, 100::smallint), coalesce(p_exige_detalle, false),
            coalesce(p_activo, true));

    return v_codigo;
  end if;

  if not exists (select 1 from public.motivos_despacho m where m.codigo = p_codigo) then
    raise exception 'No existe el motivo "%".', p_codigo using errcode = 'P0002';
  end if;

  update public.motivos_despacho
     set nombre = v_nombre,
         pista = nullif(btrim(coalesce(p_pista, '')), ''),
         orden = coalesce(p_orden, orden),
         exige_detalle = coalesce(p_exige_detalle, exige_detalle),
         activo = coalesce(p_activo, true)
   where codigo = p_codigo;

  return p_codigo;
end;
$function$;

-- public.editar_articulo(p_id bigint, p_nombre text, p_categoria text, p_unidad text, p_descripcion text, p_inventariable boolean, p_stock_minimo numeric, p_modo_entrega text, p_reparable boolean, p_presentacion text, p_unidades_por_presentacion numeric, p_marca text, p_numero_parte text, p_confirmado boolean)
-- venia de: 20260827190000_presentaciones_de_catalogo_y_marca.sql
CREATE OR REPLACE FUNCTION public.editar_articulo(p_id bigint, p_nombre text, p_categoria text, p_unidad text, p_descripcion text DEFAULT NULL::text, p_inventariable boolean DEFAULT true, p_stock_minimo numeric DEFAULT 0, p_modo_entrega text DEFAULT NULL::text, p_reparable boolean DEFAULT NULL::boolean, p_presentacion text DEFAULT NULL::text, p_unidades_por_presentacion numeric DEFAULT NULL::numeric, p_marca text DEFAULT NULL::text, p_numero_parte text DEFAULT NULL::text, p_confirmado boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_existe boolean;
  v_pres   text := nullif(trim(coalesce(p_presentacion, '')), '');
  v_igual  record;
begin
  perform private.exigir_rol('COMPRAS', 'ALMACEN');

  select true into v_existe from public.articulos where id = p_id;

  if v_existe is null then
    raise exception 'No existe ese artículo.' using errcode = 'P0002';
  end if;

  if length(trim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El artículo necesita un nombre.' using errcode = '22023';
  end if;

  /*
    EL MISMO CONTROL QUE AL CREAR, Y POR LA MISMA RAZON.

    Para si el nombre nuevo se reduce al mismo nucleo que el de OTRO articulo,
    salvo que venga confirmado. No impide: DISCO DE CORTE 7 y DISCO DE CORTE 9
    son dos cosas de verdad. Lo que no puede pasar es decidirlo sin enterarse.

    `a.id <> p_id` es lo que deja renombrarse a si mismo: corregir «Valvulina
    140» a «VALVULINA 140» no es crear un duplicado.
  */
  if not coalesce(p_confirmado, false) then
    select a.codigo, a.nombre, a.activo into v_igual
      from public.articulos a
     where a.id <> p_id
       and private.nombre_nucleo(a.nombre) = private.nombre_nucleo(p_nombre)
     order by a.activo desc
     limit 1;

    if v_igual.codigo is not null then
      raise exception 'Ya existe «%» con el código %.% Si de verdad es otra cosa, confírmalo.',
        v_igual.nombre, v_igual.codigo,
        case when v_igual.activo then '' else ' Está inactivo, pero sigue en el catálogo.' end
        using errcode = '22023',
              hint = 'Dos artículos casi iguales acaban con la existencia repartida entre los dos y ninguno cuadrando.';
    end if;
  end if;

  if v_pres is null and p_unidades_por_presentacion is not null then
    raise exception 'Dice cuántas unidades trae la presentación, pero no dice cuál es. Escribe la presentación o deja las dos vacías.'
      using errcode = '22023';
  end if;

  update public.articulos set
    nombre         = trim(p_nombre),
    descripcion    = nullif(trim(coalesce(p_descripcion, '')), ''),
    categoria      = p_categoria,
    unidad         = p_unidad,
    inventariable  = case when p_categoria = 'SERVICIO' then false else p_inventariable end,
    stock_minimo   = coalesce(p_stock_minimo, 0),
    modo_entrega   = coalesce(nullif(trim(coalesce(p_modo_entrega, '')), ''), modo_entrega),
    reparable      = coalesce(p_reparable, reparable),
    presentacion   = v_pres,
    unidades_por_presentacion = p_unidades_por_presentacion,
    marca          = nullif(trim(coalesce(p_marca, '')), ''),
    numero_parte   = nullif(trim(coalesce(p_numero_parte, '')), '')
  where id = p_id;
exception
  when foreign_key_violation then
    raise exception 'Esa presentación no está en la lista.' using errcode = '23503';
end;
$function$;

-- public.renumerar_codigos_que_son_el_nombre(p_confirmar boolean)
-- venia de: 20260908100000_los_codigos_que_eran_el_nombre_pasan_a_ser_codigos.sql
CREATE OR REPLACE FUNCTION public.renumerar_codigos_que_son_el_nombre(p_confirmar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_a      record;
  v_nuevo  text;
  v_filas  jsonb := '[]'::jsonb;
  v_n      int := 0;
begin
  /*
    LOS ONCE ARTICULOS CUYO CODIGO ES SU PROPIO NOMBRE.

    «ACEITE AGROFLUIDOS» es a la vez el nombre y el codigo. No es un descuido de
    quien los cargo: `cargar_articulos_por_lote` EXIGIA un codigo y quien lleno
    la planilla no tenia ninguno que escribir, asi que copio el nombre. La regla
    que iba a evitar errores es la que los produjo, y se quito el 7 de
    septiembre.

    Un codigo que es el nombre no distingue nada: el indice unico deja pasar
    «VALVULINA 140» y «Valvulina  140» como dos articulos, porque son dos textos
    distintos.

    POR QUE ESTO NO ROMPE NADA, y se comprobo antes de escribirlo:

      - Las diecisiete claves foraneas hacia `articulos` son todas por `id`.
        Ninguna tabla guarda el codigo.
      - La orden de compra impresa enseña `descripcion`, nunca el codigo.
      - La nota de salida SI imprime el codigo, pero no hay ni un papel emitido
        para ninguno de los once.

    EL CODIGO VIEJO SE GUARDA, y no por nostalgia: alguien pudo apuntarlo en una
    planilla suya o en un papel a mano. La busqueda de articulos lo mira, asi que
    escribir «ACEITE AGROFLUIDOS» sigue encontrando el articulo despues de que
    pase a llamarse LUB-0001.

    Dos pasadas, como la carga por planilla: la primera solo mira y devuelve el
    parte; la segunda escribe. Es la misma funcion a proposito — dos, una que
    revisa y otra que aplica, acabarian divergiendo.
  */
  perform private.exigir_accion('INVENTARIO.EDITAR_CATALOGO');

  for v_a in
    select a.id, a.codigo, a.nombre, a.categoria
      from public.articulos a
     where upper(btrim(a.codigo)) = upper(btrim(a.nombre))
     order by a.categoria, a.nombre
  loop
    v_n := v_n + 1;

    /*
      El correlativo se pide SOLO al confirmar. Revisar tres veces gastaria
      tres numeros por articulo y dejaria huecos en la serie, que es justo el
      cuidado que ya se tuvo en la carga por planilla.
    */
    if p_confirmar then
      v_nuevo := private.codigo_de_articulo(v_a.categoria);

      update public.articulos
         set codigo = v_nuevo,
             codigo_anterior = v_a.codigo
       where id = v_a.id;
    else
      v_nuevo := '(se le pondrá uno de ' || v_a.categoria || ')';
    end if;

    v_filas := v_filas || jsonb_build_object(
      'id', v_a.id, 'nombre', v_a.nombre,
      'codigo_antes', v_a.codigo, 'codigo_ahora', v_nuevo);
  end loop;

  return jsonb_build_object(
    'cuantos',  v_n,
    'aplicado', p_confirmar,
    'filas',    v_filas);
end;
$function$;

-- public.abrir_mantenimiento(p_maquina_id bigint, p_tipo text, p_motivo text, p_taller_id bigint, p_fecha date, p_dias_estimados smallint, p_articulo_id bigint, p_cantidad numeric, p_origen_id bigint, p_urgencia text, p_especialidad text, p_repuestos jsonb)
-- venia de: 20260824250000_al_taller_se_manda_material_y_cada_taller_sabe_lo_suyo.sql
CREATE OR REPLACE FUNCTION public.abrir_mantenimiento(p_maquina_id bigint DEFAULT NULL::bigint, p_tipo text DEFAULT 'REPARACION'::text, p_motivo text DEFAULT NULL::text, p_taller_id bigint DEFAULT NULL::bigint, p_fecha date DEFAULT NULL::date, p_dias_estimados smallint DEFAULT NULL::smallint, p_articulo_id bigint DEFAULT NULL::bigint, p_cantidad numeric DEFAULT NULL::numeric, p_origen_id bigint DEFAULT NULL::bigint, p_urgencia text DEFAULT 'NORMAL'::text, p_especialidad text DEFAULT NULL::text, p_repuestos jsonb DEFAULT '[]'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_maq    record;
  v_art    record;
  v_taller record;
  v_fecha  date := coalesce(p_fecha, (now() at time zone 'America/Caracas')::date);
  v_hoy    date := (now() at time zone 'America/Caracas')::date;
  v_horas  numeric;
  v_id     bigint;
  v_hay    numeric;
  v_r      jsonb;
  v_rart   bigint;
  v_rcant  numeric;
  v_sobre  text;
  v_estado_previo text;
  v_dias_maq smallint;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  -- Un litro de aceite no se rectifica: se gasta. Lo que no vuelve arreglado no
  -- se manda a reparar.
  if p_articulo_id is not null
     and not exists (select 1 from public.articulos a
                      where a.id = p_articulo_id and a.reparable) then
    raise exception 'Eso no se manda a reparar: no es un material reparable.'
      using errcode = '22023',
            hint = 'Si de verdad se puede reparar, marcalo en su ficha de articulo.';
  end if;

  if p_tipo not in ('MANTENIMIENTO', 'SERVICIO', 'REPARACION', 'RECTIFICACION', 'FABRICACION') then
    raise exception 'Tipo de trabajo no válido: %.', p_tipo using errcode = '22023';
  end if;

  if p_urgencia not in ('NORMAL', 'ALTA', 'URGENTE') then
    raise exception 'La urgencia tiene que ser NORMAL, ALTA o URGENTE.' using errcode = '22023';
  end if;

  if num_nonnulls(p_maquina_id, p_articulo_id) <> 1 then
    raise exception 'Una orden de taller recae sobre una máquina o sobre material, no sobre las dos ni sobre ninguna.'
      using errcode = '23514';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Hay que decir por qué entra al taller.' using errcode = '23514';
  end if;

  if v_fecha > v_hoy then
    raise exception 'No se puede abrir una orden de taller con fecha futura.' using errcode = '22023';
  end if;

  if p_taller_id is not null then
    select * into v_taller from public.almacenes where id = p_taller_id and tipo = 'TALLER';
    if v_taller.id is null then
      raise exception 'El almacén % no es un taller.', p_taller_id using errcode = '22023';
    end if;

    if p_especialidad is not null
       and exists (select 1 from public.taller_especialidades te where te.taller_id = p_taller_id)
       and not exists (
         select 1 from public.taller_especialidades te
          where te.taller_id = p_taller_id and te.especialidad = p_especialidad
       ) then
      raise exception 'En "%" no se hace %.', v_taller.nombre,
        lower((select nombre from public.especialidades_taller where codigo = p_especialidad))
        using errcode = '22023',
              hint = 'Mira en Talleres cuál de ellos lo hace, o añádele esa especialidad.';
    end if;
  end if;

  if p_maquina_id is not null then
    select * into v_maq from public.maquinaria where id = p_maquina_id for update;
    if v_maq.id is null then
      raise exception 'No existe la máquina %.', p_maquina_id using errcode = 'P0002';
    end if;
    if v_maq.estado = 'EN_MANTENIMIENTO' then
      raise exception 'La máquina "%" ya está en el taller.', v_maq.nombre using errcode = '55000';
    end if;
    if v_maq.estado = 'DESINCORPORADA' then
      raise exception 'La máquina "%" está desincorporada: ya no es de la flota.', v_maq.nombre
        using errcode = '55000';
    end if;

    select horas_desde_mant into v_horas from public.v_maquinaria where id = p_maquina_id;
    v_estado_previo := v_maq.estado;
    v_dias_maq := v_maq.dias_mantenimiento;
    v_sobre := v_maq.nombre;
  else
    select * into v_art from public.articulos where id = p_articulo_id;
    if v_art.id is null then
      raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
    end if;
    if coalesce(p_cantidad, 0) <= 0 then
      raise exception 'Hay que decir cuánto material entra al taller.' using errcode = '23514';
    end if;
    if p_taller_id is null then
      raise exception 'Para mandar material hay que decir a qué taller va: el material se mueve de verdad.'
        using errcode = '23514';
    end if;
    -- De dónde sale lo dice quien abre la orden. Adivinarlo por el último
    -- movimiento sacaría material del almacén equivocado el día que haya el
    -- mismo artículo en dos sitios — que es el caso normal.
    if p_origen_id is null then
      raise exception 'Hay que decir de qué almacén sale el material.' using errcode = '23514';
    end if;
    if p_origen_id = p_taller_id then
      raise exception 'El material ya está en ese taller.' using errcode = '22023';
    end if;

    v_hay := private.existencia_para_escribir(p_origen_id, p_articulo_id);
    if v_hay < p_cantidad then
      raise exception 'Solo hay % % de "%" en ese almacén.', private.cantidad_es(v_hay), v_art.unidad, v_art.nombre
        using errcode = '55000';
    end if;

    v_sobre := format('%s %s de %s', p_cantidad, v_art.unidad, v_art.nombre);
  end if;

  insert into public.mantenimientos
    (numero, maquina_id, articulo_id, cantidad, fecha, tipo, estado, motivo,
     horometro, taller_id, estado_previo, dias_estimados, urgencia, especialidad,
     registrado_por)
  values
    (private.siguiente_numero('MTO'), p_maquina_id, p_articulo_id, p_cantidad,
     v_fecha, p_tipo, 'ABIERTO', btrim(p_motivo), v_horas, p_taller_id,
     v_estado_previo, coalesce(p_dias_estimados, v_dias_maq),
     p_urgencia, p_especialidad, (select auth.uid()))
  returning id into v_id;

  if p_maquina_id is not null then
    update public.maquinaria set estado = 'EN_MANTENIMIENTO' where id = p_maquina_id;
  else
    perform public.transferir_existencia(
      p_origen_id := p_origen_id,
      p_destino_id := p_taller_id,
      p_articulo_id := p_articulo_id,
      p_cantidad := p_cantidad,
      p_motivo := format('Al taller · %s', btrim(p_motivo)),
      p_fecha := v_fecha);
  end if;

  for v_r in select * from jsonb_array_elements(coalesce(p_repuestos, '[]'::jsonb))
  loop
    v_rart  := (v_r ->> 'articulo_id')::bigint;
    v_rcant := (v_r ->> 'cantidad')::numeric;

    if v_rart is null or coalesce(v_rcant, 0) <= 0 then
      raise exception 'Cada repuesto previsto necesita un artículo y una cantidad mayor que cero.'
        using errcode = '23514';
    end if;

    -- Previsto no descuenta nada: es una estimación, y descontar por una
    -- estimación deja el almacén mintiendo hasta que alguien cierre la orden.
    insert into public.mantenimiento_repuestos
      (mantenimiento_id, articulo_id, cantidad, estado)
    values (v_id, v_rart, v_rcant, 'PREVISTO');
  end loop;

  perform private.notificar(
    'MAQUINARIA', 'MANTENIMIENTO_ABIERTO',
    format('%s entró al taller', v_sobre),
    btrim(p_motivo), '/app/maquinaria/mantenimientos', array['OPERACIONES', 'ALMACEN'],
    case when p_urgencia = 'URGENTE' then 'URGENTE'
         when p_tipo = 'REPARACION' then 'ATENCION'
         else 'INFO' end);

  return v_id;
end;
$function$;

-- public.transferir_existencia(p_origen_id bigint, p_destino_id bigint, p_articulo_id bigint, p_cantidad numeric, p_motivo text, p_fecha date)
-- venia de: 20260907160000_el_traslado_tambien_respeta_el_tanque_sin_costo.sql
CREATE OR REPLACE FUNCTION public.transferir_existencia(p_origen_id bigint, p_destino_id bigint, p_articulo_id bigint, p_cantidad numeric, p_motivo text, p_fecha date DEFAULT NULL::date)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_origen public.almacenes; v_destino public.almacenes;
  v_existencia numeric; v_costo numeric; v_articulo text; v_salida bigint;
begin
  perform private.exigir_rol('ALMACEN');

  if p_origen_id = p_destino_id then
    raise exception 'El origen y el destino son el mismo almacén.' using errcode = '22023';
  end if;

  select * into v_origen  from public.almacenes where id = p_origen_id;
  select * into v_destino from public.almacenes where id = p_destino_id;

  if v_origen.id is null then
    raise exception 'No existe el almacén de origen %.', p_origen_id using errcode = 'P0002';
  end if;
  if v_destino.id is null then
    raise exception 'No existe el almacén de destino %.', p_destino_id using errcode = 'P0002';
  end if;

  if not v_destino.activo then
    raise exception 'El almacén "%" está inactivo y no puede recibir material.', v_destino.nombre
      using errcode = '22023';
  end if;
  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se mueve. Un traslado sin motivo no se puede auditar.'
      using errcode = '22023';
  end if;

  /*
    LA REJA DEL TANQUE SIN COSTO, QUE AQUI FALTABA.

    El material sale al `costo_promedio` de su origen. En un almacen marcado
    `admite_sin_costo` ese promedio es cero por diseno, asi que un traslado
    desde ahi mete ceros en el destino y le hunde el promedio — justo lo que
    `registrar_entrada` impide por la otra puerta. Lo encontro el carril de
    base de datos el 7/09/2026; yo di esta reja por cerrada el 31/08 y lo
    estaba solo en la puerta que mire.
  */
  if coalesce(v_origen.admite_sin_costo, false)
     and not coalesce(v_destino.admite_sin_costo, false) then
    raise exception 'De "%" no se puede trasladar a "%": lo que hay ahí entró sin costo y hundiría el costo promedio del destino.',
      v_origen.nombre, v_destino.nombre
      using errcode = '22023',
            hint = 'Antes hay que decidir a qué precio se valora lo que trasladó la otra empresa. Mientras no se decida, el traslado escribiría un cero que después no se puede distinguir de un precio real.';
  end if;

  if not coalesce(v_origen.admite_sin_costo, false)
     and coalesce(v_destino.admite_sin_costo, false) then
    raise exception 'A "%" solo entra lo que no costó nada, y lo que sale de "%" tiene precio.',
      v_destino.nombre, v_origen.nombre
      using errcode = '22023',
            hint = 'Ese almacén lleva aparte lo que no le costó nada a esta empresa. Metiendo ahí material con precio se pierde su valor y el nombre del tanque deja de ser verdad.';
  end if;

  v_existencia := private.existencia_para_escribir(p_origen_id, p_articulo_id);

  if p_cantidad > v_existencia then
    select nombre into v_articulo from public.articulos where id = p_articulo_id;
    raise exception 'En "%" solo hay % de "%" y se intentan mover %.',
      v_origen.nombre, private.numero_es(v_existencia, 4), coalesce(v_articulo, p_articulo_id::text), private.numero_es(p_cantidad, 4)
      using errcode = '22023';
  end if;

  v_costo := private.costo_promedio(p_origen_id, p_articulo_id);

  v_salida := private.registrar_movimiento(
    'TRANSFERENCIA_SALIDA', (-1)::smallint, p_origen_id, p_articulo_id, p_cantidad, v_costo,
    format('Traslado a %s. %s', v_destino.nombre, p_motivo), null, null, null, p_fecha);

  perform private.registrar_movimiento(
    'TRANSFERENCIA_ENTRADA', (1)::smallint, p_destino_id, p_articulo_id, p_cantidad, v_costo,
    format('Traslado desde %s. %s', v_origen.nombre, p_motivo), null, null, v_salida, p_fecha);

  return v_salida;
end;
$function$;

-- public.despachar(p_cliente_id bigint, p_almacen_id bigint, p_renglones jsonb, p_moneda character, p_cotizacion_id bigint, p_vehiculo text, p_chofer text, p_cedula_chofer text, p_peso_bruto numeric, p_peso_tara numeric, p_ticket text, p_alicuota_iva numeric, p_descuento numeric, p_flete numeric, p_fecha date, p_observacion text, p_ticket_id bigint, p_guia_id bigint)
-- venia de: 20260805110000_despachos.sql
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
  perform private.exigir_permiso('VENTAS', 'ESCRITURA');

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

-- public.anular_nota_credito(p_id bigint, p_motivo text)
-- venia de: 20260805150000_notas_credito.sql
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
  perform private.exigir_permiso('VENTAS', 'TOTAL');

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
end;
$function$;

-- public.entregar_dotacion(p_empleado_id bigint, p_almacen_id bigint, p_renglones jsonb, p_fecha date, p_nota text)
-- venia de: 20260817140000_dotacion_de_uniformes.sql
CREATE OR REPLACE FUNCTION public.entregar_dotacion(p_empleado_id bigint, p_almacen_id bigint, p_renglones jsonb, p_fecha date DEFAULT NULL::date, p_nota text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_emp      record;
  v_item     jsonb;
  v_articulo bigint;
  v_cantidad numeric;
  v_hay      numeric;
  v_costo    numeric;
  v_nombre   text;
  v_n        integer := 0;
begin
  perform private.exigir_rol('ALMACEN', 'RRHH');

  select * into v_emp from public.empleados where id = p_empleado_id;

  if v_emp.id is null then
    raise exception 'No existe ese trabajador.' using errcode = 'P0002';
  end if;

  if not v_emp.activo then
    raise exception 'A % ya no se le entrega dotación: está egresado.',
      v_emp.nombres || ' ' || v_emp.apellidos using errcode = '55000';
  end if;

  if not exists (select 1 from public.almacenes where id = p_almacen_id and activo) then
    raise exception 'El almacén indicado no existe o está inactivo.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'Indica qué se entrega y en qué cantidad.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_articulo := (v_item->>'articulo_id')::bigint;
    v_cantidad := coalesce((v_item->>'cantidad')::numeric, 0);

    if v_cantidad <= 0 then
      continue;
    end if;

    select nombre into v_nombre from public.articulos where id = v_articulo;

    if v_nombre is null then
      raise exception 'No existe el artículo %.', v_articulo using errcode = 'P0002';
    end if;

    v_hay := private.existencia_para_escribir(p_almacen_id, v_articulo);

    if v_cantidad > v_hay then
      raise exception 'De "%" solo hay % en existencia y se intentan entregar %.',
        v_nombre, private.numero_es(v_hay, 4), private.numero_es(v_cantidad, 4) using errcode = '22023';
    end if;

    v_costo := private.costo_promedio(p_almacen_id, v_articulo);

    perform private.registrar_movimiento(
      'SALIDA_CONSUMO', -1, p_almacen_id, v_articulo, v_cantidad, v_costo,
      format('Dotación a %s (%s). %s',
             v_emp.nombres || ' ' || v_emp.apellidos, v_emp.ficha,
             coalesce(nullif(trim(coalesce(p_nota, '')), ''), 'Entrega de dotación')),
      null, null, null, p_fecha, p_empleado_id);

    v_n := v_n + 1;
  end loop;

  if v_n = 0 then
    raise exception 'No se indicó ninguna cantidad a entregar.' using errcode = '22023';
  end if;

  return v_n;
end;
$function$;

-- public.despachar_combustible(p_articulo_id bigint, p_almacen_id bigint, p_cantidad numeric, p_motivo text, p_motivo_detalle text, p_maquina_id bigint, p_destino text, p_horometro numeric, p_empleado_id bigint, p_recibio_nombre text, p_recibio_cedula text, p_fecha date, p_nota text)
-- venia de: 20260902110000_tres_surtidos_al_dia_y_el_horometro_obligatorio.sql
CREATE OR REPLACE FUNCTION public.despachar_combustible(p_articulo_id bigint, p_almacen_id bigint, p_cantidad numeric, p_motivo text, p_motivo_detalle text DEFAULT NULL::text, p_maquina_id bigint DEFAULT NULL::bigint, p_destino text DEFAULT NULL::text, p_horometro numeric DEFAULT NULL::numeric, p_empleado_id bigint DEFAULT NULL::bigint, p_recibio_nombre text DEFAULT NULL::text, p_recibio_cedula text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date, p_nota text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c_max_vales_dia constant integer := 3;
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Caracas')::date);
  v_hoy date := (now() at time zone 'America/Caracas')::date;
  v_art record; v_maq record; v_alm record; v_comb record;
  v_hay numeric; v_unitario numeric; v_costo numeric;
  v_ultimo numeric; v_lectura numeric; v_tope numeric; v_vales integer;
  v_recibe text; v_cedula text; v_surtio text; v_detalle text;
  v_mov bigint; v_id bigint; v_donde text;
begin
  perform private.exigir_permiso('COMBUSTIBLE', 'ESCRITURA');

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad tiene que ser mayor que cero.' using errcode = '22023';
  end if;
  if v_fecha > v_hoy then
    raise exception 'No se despacha combustible con fecha futura.' using errcode = '22023';
  end if;

  v_detalle := private.motivo_del_vale(p_motivo, p_motivo_detalle);

  select * into v_art from public.articulos where id = p_articulo_id;
  if v_art.id is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
  end if;
  if v_art.categoria <> 'COMBUSTIBLE' then
    raise exception '"%" no es combustible.', v_art.nombre using errcode = '22023';
  end if;

  select * into v_alm from public.almacenes where id = p_almacen_id;
  if v_alm.id is null then
    raise exception 'No existe el almacén %.', p_almacen_id using errcode = 'P0002';
  end if;
  if v_alm.tipo <> 'COMBUSTIBLE' then
    raise exception 'El combustible sale del tanque, no de "%". Ese almacén es de tipo %.', v_alm.nombre, v_alm.tipo
      using errcode = '22023', hint = 'Si el gasoil está cargado en otro almacén, transfiéralo primero al tanque.';
  end if;

  if p_maquina_id is not null then
    select * into v_maq from public.maquinaria where id = p_maquina_id;
    if v_maq.id is null then
      raise exception 'No existe la máquina %.', p_maquina_id using errcode = 'P0002';
    end if;
    v_donde := v_maq.nombre;

    if v_maq.capacidad_combustible is not null and p_cantidad > v_maq.capacidad_combustible then
      raise exception 'Al tanque de "%" le caben % %, y se estan despachando %.',
        v_maq.nombre, v_maq.capacidad_combustible, v_art.unidad, p_cantidad
        using errcode = '22023',
              hint = 'Si el combustible va a un envase aparte, registralo como otro vale sin ficha de maquina.';
    end if;

    if v_maq.combustible_id is not null and v_maq.combustible_id <> p_articulo_id then
      select nombre into v_comb from public.articulos where id = v_maq.combustible_id;
      raise exception '"%" usa % y se le está echando %.', v_maq.nombre,
        coalesce(v_comb.nombre, 'otro combustible'), v_art.nombre
        using errcode = '22023', hint = 'Si la ficha de la máquina está equivocada, corríjala en Maquinaria.';
    end if;

    /*
      TRES VALES AL DIA, POR MAQUINA. Pedido el 2 de septiembre de 2026. Existe
      para que nadie cargue el mismo tanque cuatro veces sin que se note.

      Solo cuenta cuando el vale va a una MAQUINA: un destino escrito a mano
      —una planta electrica, un bidon para el taller— no tiene tope.

      Se cuentan TODOS los del dia: `despachos_combustible` no tiene estado, asi
      que un vale emitido cuenta aunque despues se reverse su movimiento. Si
      algun dia los vales se anulan, este conteo tiene que excluir los anulados.
    */
    select count(*) into v_vales from public.despachos_combustible d
     where d.maquina_id = p_maquina_id and d.fecha = v_fecha;

    if v_vales >= c_max_vales_dia then
      raise exception 'A "%" ya se le surtió % veces el %. El máximo son % al día.',
        v_maq.nombre, v_vales, to_char(v_fecha, 'DD/MM/YYYY'), c_max_vales_dia
        using errcode = '22023',
              hint = 'Si de verdad hizo falta más, hay que revisar por qué esa máquina está consumiendo así.';
    end if;

    /*
      EL HOROMETRO ES OBLIGATORIO SI HAY MAQUINA, y antes era opcional.

      Sin el, el vale no dice a que altura del contador se echo ese combustible,
      y entonces el consumo por hora —que es de lo que se saca si una maquina
      gasta mas de lo que deberia— no se puede calcular.

      NO REINICIA NADA: es una lectura anotada en el vale, no toca el parte
      diario ni las horas del mantenimiento.

      El argumento que habia en contra sigue valiendo y se respeta: un generador
      de emergencia puede no llevar horometro. Pero eso no es una maquina de la
      ficha — va por `p_destino`, y ahi no se pide.
    */
    if p_horometro is null then
      raise exception 'Hace falta el horómetro de "%" para surtirla.', v_maq.nombre
        using errcode = '23514',
              hint = 'Es la lectura del tablero al echarle. No reinicia nada: queda anotada en el vale.';
    end if;
  else
    if length(btrim(coalesce(p_destino, ''))) < 3 then
      raise exception 'Hay que decir a qué se le echó.' using errcode = '23514';
    end if;
    v_donde := btrim(p_destino);
  end if;

  if p_empleado_id is not null then
    select btrim(e.nombres || ' ' || e.apellidos), e.cedula into v_recibe, v_cedula
      from public.empleados e where e.id = p_empleado_id;
    if v_recibe is null then
      raise exception 'No existe el empleado %.', p_empleado_id using errcode = 'P0002';
    end if;
  else
    v_recibe := btrim(coalesce(p_recibio_nombre, ''));
    v_cedula := nullif(btrim(coalesce(p_recibio_cedula, '')), '');
    if length(v_recibe) < 3 then
      raise exception 'Hay que decir quién recibió el combustible.'
        using errcode = '23514',
              hint = 'Si no es alguien de la nómina —el chofer de un fletero, por ejemplo— escriba su nombre.';
    end if;
  end if;

  select nombre into v_surtio from public.perfiles where id = (select auth.uid());

  perform pg_catalog.pg_advisory_xact_lock(p_almacen_id::int, p_articulo_id::int);
  v_hay := private.existencia_para_escribir(p_almacen_id, p_articulo_id);
  if v_hay < p_cantidad then
    raise exception 'En el tanque solo quedan % % de %.', private.numero_es(v_hay, 4), v_art.unidad, v_art.nombre
      using errcode = '55000';
  end if;

  /*
    EL HOROMETRO NO RETROCEDE — Y ESTO ERA UN AVISO.

    Se guardaba igual y despues salia una notificacion que alguien tenia que
    leer y corregir a mano, con el numero ya escrito. Dos puertas al mismo
    contador con reglas distintas es como se consigue que nadie sepa cual vale:
    `registrar_lectura` ya rechaza, asi que esta tambien.

    REVERSIBLE A PROPOSITO: si en el patio esto detiene mas surtidos de los que
    evita, se vuelve a `private.notificar` cambiando este bloque y nada mas.
  */
  if p_maquina_id is not null then
    select d.horometro into v_ultimo from public.despachos_combustible d
     where d.maquina_id = p_maquina_id and d.horometro is not null and d.fecha <= v_fecha
     order by d.fecha desc, d.id desc limit 1;

    select l.final into v_lectura from public.horometro_lecturas l
     where l.maquina_id = p_maquina_id and l.fecha <= v_fecha
     order by l.fecha desc, l.id desc limit 1;

    v_tope := greatest(coalesce(v_ultimo, 0), coalesce(v_lectura, 0));

    if (v_ultimo is not null or v_lectura is not null) and p_horometro < v_tope then
      raise exception 'El horómetro de "%" no retrocede: lo último anotado marcaba % y se está surtiendo con %.',
        v_maq.nombre, v_tope, p_horometro
        using errcode = '22023',
              hint = 'Si el tablero se ve mal o le cambiaron el reloj, eso se corrige en Maquinaria, no aquí.';
    end if;
  end if;

  v_unitario := private.costo_promedio(p_almacen_id, p_articulo_id);
  v_costo := v_unitario * p_cantidad;

  v_mov := private.registrar_movimiento(
    'SALIDA_CONSUMO', -1, p_almacen_id, p_articulo_id, p_cantidad, v_unitario,
    format('Combustible · %s · %s', v_donde, coalesce(v_detalle, p_motivo)),
    null, null, null, v_fecha);

  insert into public.despachos_combustible
    (numero, fecha, hora, articulo_id, almacen_id, cantidad, motivo, motivo_detalle,
     maquina_id, destino, horometro, empleado_id, recibio_nombre, recibio_cedula,
     surtio_nombre, costo_usd, movimiento_id, nota, registrado_por)
  values
    (private.siguiente_numero('CMB'), v_fecha,
     case when v_fecha = v_hoy then (now() at time zone 'America/Caracas')::time else null end,
     p_articulo_id, p_almacen_id, p_cantidad, p_motivo, v_detalle, p_maquina_id,
     nullif(btrim(coalesce(p_destino, '')), ''), p_horometro, p_empleado_id,
     v_recibe, v_cedula, v_surtio, v_costo, v_mov,
     nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  if v_art.stock_minimo > 0 and (v_hay - p_cantidad) <= v_art.stock_minimo then
    perform private.notificar('COMBUSTIBLE', 'TANQUE_BAJO',
      format('Queda poco %s', v_art.nombre),
      format('Quedan %s %s, y el mínimo son %s.', v_hay - p_cantidad, v_art.unidad, v_art.stock_minimo),
      '/app/combustible', array['ALMACEN', 'OPERACIONES', 'COMPRAS'], 'ATENCION');
  end if;

  return v_id;
end;
$function$;

-- public.registrar_salidas(p_almacen_id bigint, p_renglones jsonb, p_motivo text, p_tipo text, p_fecha date)
-- venia de: 20260824350000_la_clase_de_salida_la_lleva_la_empresa.sql
CREATE OR REPLACE FUNCTION public.registrar_salidas(p_almacen_id bigint DEFAULT NULL::bigint, p_renglones jsonb DEFAULT NULL::jsonb, p_motivo text DEFAULT NULL::text, p_tipo text DEFAULT 'SALIDA_CONSUMO'::text, p_fecha date DEFAULT NULL::date)
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
  v_nombre_pres text;
begin
  perform private.exigir_rol('ALMACEN');

  select * into v_clase from public.clases_de_salida where codigo = p_tipo;
  if v_clase.codigo is not null then
    if not v_clase.activa then
      raise exception 'La clase "%" está apagada.', v_clase.nombre using errcode = '22023';
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

  if v_tipo = 'SALIDA_BAJA' or coalesce(v_clase.exige_detalle, false) then
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

    v_hay := private.existencia_para_escribir(v_almacen, v_articulo) - coalesce((
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
    v_costo := private.costo_promedio(v_almacen, v_articulo);

    v_mov := private.registrar_movimiento(
      v_tipo, -1, v_almacen, v_articulo, v_cantidad, v_costo,
      btrim(p_motivo), null, null, null, p_fecha, null, null, v_nota, null,
      p_cantidad_capturada => nullif(v_pres, 0),
      p_unidad_capturada => case when v_pres > 0 then private.presentacion_usada(v_articulo, nullif(btrim(coalesce(v_r->>'presentacion', '')), '')) end,
      p_suelto_capturado => case when v_pres > 0 then nullif(v_sueltas, 0) end);

    if v_tipo = 'SALIDA_BAJA' then
      insert into public.inventario_bajas (movimiento_id, causa, solicitada_por)
      values (v_mov, v_clase.causa_baja, (select auth.uid()));
    end if;
  end loop;

  return v_nota;
end;
$function$;

-- public.registrar_ajuste(p_almacen_id bigint, p_articulo_id bigint, p_contado numeric, p_motivo text, p_fecha date, p_presentaciones numeric, p_presentacion text)
-- venia de: 20260908110000_contar_un_almacen_se_hace_en_bultos.sql
CREATE OR REPLACE FUNCTION public.registrar_ajuste(p_almacen_id bigint, p_articulo_id bigint, p_contado numeric, p_motivo text, p_fecha date DEFAULT NULL::date, p_presentaciones numeric DEFAULT NULL::numeric, p_presentacion text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_existencia numeric;
  v_diferencia numeric;
  v_costo      numeric;
  v_total      numeric;
  v_art        record;
  v_conto      text;
begin
  /*
    CONTAR UN ALMACEN ES JUSTO LO QUE SE HACE EN BULTOS.

    El 7 de septiembre `registrar_entradas` y `registrar_salidas` aprendieron a
    recibir «7 tambores y 10 L»; el ajuste de conteo se quedo fuera porque es
    posicional y anadirle un parametro obliga a soltar la firma vieja. Y era
    justo el mas urgente de los cinco: nadie recorre un almacen anotando
    «1.466 litros». Anota siete tambores llenos y uno empezado.

    `p_contado` sigue siendo las sueltas, asi que las llamadas viejas —que no
    mandan presentaciones— cuentan exactamente igual que antes.
  */
  perform private.exigir_rol('ALMACEN');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Un ajuste sin explicación es un descuadre disfrazado. Escribe qué pasó.'
      using errcode = '22023';
  end if;

  select nombre, unidad, presentacion, unidades_por_presentacion
    into v_art from public.articulos where id = p_articulo_id;
  if v_art.unidad is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
  end if;

  -- Los bultos enteros son enteros: eso es lo que los hace bultos. Lo que sobra
  -- del ultimo va en lo suelto, que es el campo de al lado.
  if p_presentaciones is not null then
    if p_presentaciones < 0 then
      raise exception 'No se pueden contar bultos en negativo.' using errcode = '22023';
    end if;
    if p_presentaciones <> trunc(p_presentaciones) then
      raise exception 'Los bultos se cuentan enteros: % no es un numero de bultos. Lo que sobra del ultimo va en lo suelto.',
        private.numero_es(p_presentaciones, 2) using errcode = '22023';
    end if;
  end if;

  if p_contado is not null and p_contado < 0 then
    raise exception 'Lo contado no puede ser negativo.' using errcode = '22023';
  end if;

  v_total := private.en_unidad_base(p_articulo_id, p_presentaciones, coalesce(p_contado, 0), p_presentacion);

  if v_total < 0 then
    raise exception 'Lo contado no puede ser negativo.' using errcode = '22023';
  end if;

  v_existencia := private.existencia_para_escribir(p_almacen_id, p_articulo_id);
  v_diferencia := v_total - v_existencia;

  if abs(v_diferencia) < 0.0001 then
    raise exception 'Lo contado coincide con lo que dice el sistema (% %). No hay nada que ajustar.',
      private.numero_es(v_existencia, 4), v_art.unidad using errcode = '22023';
  end if;

  v_costo := private.costo_promedio(p_almacen_id, p_articulo_id);

  /*
    LA NOTA DICE LO QUE LA PERSONA CONTO, NO SOLO SU EQUIVALENTE.

    Quien conto siete tambores y diez litros no reconoce «1.466 L» al releerlo
    dentro de un mes, y entonces no puede cuadrar el movimiento contra su hoja
    de conteo. Se escriben los dos.

    Y con `private.numero_es`: el servidor tiene `lc_numeric` en en_US, asi que
    `%s` sobre un numeric daba «1466.0000» donde aqui se lee «1.466,0000». El
    mensaje anterior de esta funcion lo tenia y nadie lo habia visto.
  */
  if coalesce(p_presentaciones, 0) <> 0 then
    v_conto := format('%s %s%s = %s %s',
      private.numero_es(p_presentaciones, 2), private.presentacion_usada(p_articulo_id, p_presentacion),
      case when coalesce(p_contado, 0) <> 0
           then format(' y %s %s', private.numero_es(p_contado, 4), v_art.unidad)
           else '' end,
      private.numero_es(v_total, 4), v_art.unidad);
  else
    v_conto := format('%s %s', private.numero_es(v_total, 4), v_art.unidad);
  end if;

  /*
    El insertador lleva DIECIOCHO parametros y el trio capturado va al final,
    detras de otros cuatro que aqui no se usan. Se llama por nombre: contarlos
    a ojo fallo al primer intento, y la prueba lo caz��.
  */
  return private.registrar_movimiento(
    case when v_diferencia > 0 then 'AJUSTE_POSITIVO' else 'AJUSTE_NEGATIVO' end,
    case when v_diferencia > 0 then 1 else -1 end::smallint,
    p_almacen_id, p_articulo_id, abs(v_diferencia), v_costo,
    format('Conteo físico: %s contra %s %s en sistema. %s',
           v_conto, private.numero_es(v_existencia, 4), v_art.unidad, p_motivo),
    null, null, null, p_fecha,
    p_cantidad_capturada => nullif(coalesce(p_presentaciones, 0), 0),
    p_unidad_capturada   => case when coalesce(p_presentaciones, 0) <> 0
                                 then private.presentacion_usada(p_articulo_id, p_presentacion) end,
    p_suelto_capturado   => case when coalesce(p_presentaciones, 0) <> 0
                                  and coalesce(p_contado, 0) <> 0
                                 then p_contado end);
end;
$function$;
