/*
  LA MARCA NO SE QUEDA EN LA COTIZACION: LLEGA A LA ORDEN.

  La migracion anterior le dio a `cotizacion_renglones` su marca y su
  presentacion, y ahi se paraban: `aprobar_compra` copia los renglones de la
  cotizacion aprobada a `orden_renglones`, y esas dos columnas no existian al
  otro lado.

  Asi que el dato moria justo en el paso en que empieza a hacer falta. La orden
  es el papel que se le manda al proveedor y contra el que se recibe: si dice
  «100 litros de aceite hidraulico» sin decir «Motul, en bidon», quien recibe
  en el almacen no tiene con que comprobar que llego lo que se compro — que es
  para lo que Diana pidio el campo.

  De paso queda resuelto lo que `comprasPdf.ts` dejo escrito al copiar el
  formato de MGG: que las columnas de marca no se imprimian «porque no
  guardamos esos datos, y si hacen falta de verdad, primero hay que poder
  guardarlas». Ya se pueden.
*/

alter table public.orden_renglones
  add column if not exists marca text,
  add column if not exists presentacion text;

comment on column public.orden_renglones.marca is
  'La marca que se compro, copiada de la cotizacion aprobada. Va impresa en la orden.';
comment on column public.orden_renglones.presentacion is
  'Como viene: bidon, barril, paleta. Copiada de la cotizacion aprobada.';

/*
  Y `aprobar_compra` las arrastra. Mismo cuerpo que en la migracion anterior:
  lo unico que cambia es el INSERT de los renglones, que ahora lleva las dos
  columnas.
*/

create or replace function public.aprobar_compra(
  p_solicitud_id  bigint,
  p_cotizacion_id bigint default null,
  p_nota          text default null
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_estado    text;
  v_cot       public.cotizaciones;
  v_propuestas integer;
  v_orden_id  bigint;
  v_autoriza  uuid;
begin
  perform private.exigir_accion('COMPRAS.APROBAR_COMPRA');

  -- De quién es la autoridad. Nulo si quien aprueba podía por su cuenta: en ese
  -- caso el papel no debe decir «bajo autorización de» nadie.
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

  /*
    Sin decir cuál solo vale si hay una. Con dos propuestas, elegir por el
    sistema sería firmarle al gerente una compra que no escogió — y el error
    dice cuántas hay para que se sepa qué falta, no solo que falta algo.
  */
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

  /*
    Aquí se escribe `cotizacion_elegida_id`, y este es su significado nuevo: la
    que el gerente aprobó. Antes lo escribía `proponer_cotizacion` y quería
    decir «la que compras propone» — dos cosas distintas que compartían columna
    mientras solo podía haber una.

    Las demás propuestas se desmarcan: ya no esperan a nadie.
  */
  update public.cotizaciones
     set propuesta = false
   where solicitud_id = p_solicitud_id and propuesta;

  update public.solicitudes_pedido
     set estado = 'APROBADA',
         cotizacion_elegida_id = v_cot.id,
         aprobada_gg_por = (select auth.uid()), aprobada_gg_en = now(),
         aprobada_por_autorizacion_de = v_autoriza
   where id = p_solicitud_id;

  -- La nota del historial deja dicho lo mismo, para quien lea el recorrido del
  -- pedido sin abrir la orden.
  -- `nullif(..., '')` porque `concat_ws` con todo nulo devuelve cadena vacía, y
  -- una nota vacía en el historial no es lo mismo que no haber puesto nota.
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


/*
  COMPROBAR DESPUES DE APLICARLA

    select column_name from information_schema.columns
     where table_schema='public' and table_name='orden_renglones'
       and column_name in ('marca','presentacion');

    -- Que el INSERT las arrastre
    select p.prosrc ilike '%cr.marca, cr.presentacion%' as las_arrastra
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='aprobar_compra';
*/
