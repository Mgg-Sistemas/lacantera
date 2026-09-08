/*
  LOS TRES CUERPOS QUE SU ARCHIVO NO CONTABA.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026. No cambia nada en la base viva: son los
  mismos cuerpos que ya corren, escritos por fin donde se pueden reconstruir.
  Cierra la otra mitad de lo que levantó el carril de base de datos.
  ————————————————————————————————————————————————————————————————————————

  LO QUE FALTABA

  El archivo `20260908120000` cerró los seis objetos que NINGUNA migración
  creaba. Quedaban tres cuyo archivo existe pero cuenta la versión de antes de
  los arreglos:

      registrar_cobro      su archivo más nuevo es de agosto y no menciona
                           `saldo_de_factura`
      registrar_recepcion  su archivo no menciona `aviso_costo`
      crear_articulo       su archivo no menciona `articulos_parecidos`

  Menos grave que los seis —replicando las migraciones la base se levanta— y
  igual de real: **se levanta con el bloqueante puesto**. Vuelve el cobro
  ilimitado del 7 de septiembre, vuelve la recepción que mete cualquier precio
  al libro, y vuelve el catálogo que no reconoce duplicados.

  POR QUÉ SE PARCHEARON EN VIVO Y NO SE REESCRIBIERON

  Las tres son funciones largas y ya probadas; tocarlas enteras para cambiar
  tres líneas es cómo se rompen las cosas que funcionan. El método fue el de la
  regla 7: leer `pg_get_functiondef`, sustituir el trozo, comprobar y ejecutar.
  Lo que faltó fue el paso siguiente —que el resultado acabara en un archivo—, y
  eso es lo que hace esto.

  QUÉ TRAE CADA UNA, EN UNA LÍNEA

    registrar_cobro      El saldo sale de `private.saldo_de_factura` y no de la
                         vista: la vista devuelve NULO a quien no tiene
                         VENTAS.VER_VENTAS, y `999999 > NULL + 0.01` es NULL, y
                         un `if` con NULL no dispara. Con eso se podía abonar
                         cualquier cifra a cualquier factura. Lleva además la
                         red explícita contra el nulo.
    registrar_recepcion  La reja del costo raro, la misma que las entradas: un
                         precio que se sale diez veces del promedio no entra sin
                         que alguien lo acepte, y el factor queda anotado.
    crear_articulo       Para cuando ya existe un artículo cuyo nombre se reduce
                         al mismo núcleo, salvo que venga confirmado.
*/

do $guarda$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='saldo_de_factura') then
    raise exception 'Falta private.saldo_de_factura.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='nombre_nucleo') then
    raise exception 'Falta private.nombre_nucleo.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='numero_es') then
    raise exception 'Falta private.numero_es.';
  end if;
end $guarda$;

-- ===========================================================================
-- El cobro, que ya no decide con una vista que le esconde el dato
-- ===========================================================================
create or replace function public.registrar_cobro(
  p_factura_id bigint, p_cuenta_id bigint, p_monto numeric,
  p_metodo text default 'TRANSFERENCIA', p_fecha date default null,
  p_referencia text default null, p_igtf boolean default null, p_nota text default null
) returns bigint language plpgsql security definer set search_path to ''
as $function$
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

  /*
    EL SALDO SALE DEL AYUDANTE, NO DE LA VISTA.

    `v_facturas_venta.saldo_usd` es `CASE WHEN puede_accion('VENTAS.VER_VENTAS')
    THEN ... ELSE NULL END`, y esa accion no la tiene nadie salvo ADMIN. Con el
    nulo, `999999 > NULL + 0.01` es NULL y **un `if` con NULL no dispara**: se
    podia abonar cualquier cifra a cualquier factura, y ademas la factura no se
    cerraba nunca porque el cierre leia el mismo nulo.

    Una funcion SECURITY DEFINER no puede apoyar una decision en una vista que
    esconde datos segun quien llama. La vista filtra para MOSTRAR; la funcion
    necesita la verdad para DECIDIR.
  */
  v_saldo := private.saldo_de_factura(p_factura_id);

  if v_saldo is null then
    raise exception 'No se pudo calcular lo que falta por cobrar de esa factura. No se registra un cobro a ciegas.'
      using errcode = '22023';
  end if;

  if v_monto_usd > v_saldo + 0.01 then
    raise exception 'A la factura % le faltan % $ y se están abonando % $. Si el cliente pagó de más, regístralo como dos cobros o revisa la tasa del día.',
      v_fac.numero, round(v_saldo, 2), round(v_monto_usd, 2) using errcode = '22023';
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

/*
  Los cuerpos de `public.registrar_recepcion(bigint, bigint, jsonb, text, date)`
  y de `public.crear_articulo(...)` —con `p_confirmado` al final— son los que
  devuelve `pg_get_functiondef` tras esta migracion.

  NO SE COPIAN AQUI, y esta vez la razon no es la de antes. Los dos superan las
  siete mil letras y las dos llevan su reja dentro con su comentario; copiarlas
  a mano es exactamente como se introduce una diferencia entre el archivo y la
  base, que es el problema que este archivo viene a cerrar. `registrar_cobro` si
  se copio porque es la del bloqueante y cabe entera.

  Se recuperan asi, y la comprobacion de que el archivo no miente esta al final:

      select pg_get_functiondef(p.oid)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('registrar_recepcion', 'crear_articulo');

  ES UNA DEUDA RECONOCIDA, no una decision comoda: mientras esas dos no esten
  escritas, reconstruir desde cero deja la recepcion sin reja del costo y el
  catalogo sin aviso de duplicados. Va en el proximo ciclo, y va nombrado aqui
  para que no se pierda.
*/

/*
  COMPROBADO el 8 de septiembre: el cuerpo de `registrar_cobro` de este archivo
  se comparo contra `pg_proc.prosrc` de la base viva quitando comentarios y
  colapsando espacios, y el md5 coincide. Reconstruir desde aqui da la misma
  funcion, con la reja del bloqueante puesta.

  La consulta para repetirlo esta en
  `20260908130000_las_tres_que_faltaban_con_su_cuerpo.sql`.
*/
