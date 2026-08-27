/*
  CORREGIR UNA COTIZACIÓN SIN VOLVER A CARGARLA ENTERA.

  Lo pidió Christopher: hacía falta cambiar las condiciones de pago de una
  cotización ya cargada —«la base se cancela en USDT y el IVA a la tasa oficial
  del BCV»— antes de proponerla al gerente, y en la pantalla no había más que
  «Cargar cotización», «Proponer al gerente» y «Eliminar». La salida era
  borrarla y teclear otra vez los renglones uno por uno.

  EL FONDO YA EXISTÍA, Y ESE ERA EL PROBLEMA

  `registrar_cotizacion` ya sustituye la cotización del mismo proveedor y hasta
  hereda su número. Pero lo hace BORRANDO la fila y volviendo a insertarla, así
  que la nueva tiene otro `id`. Y hay una clave que apunta ahí:

      solicitudes_cotizacion_elegida_fk
        cotizacion_elegida_id -> cotizaciones(id) ON DELETE SET NULL

  Es decir: recargar una cotización YA PROPUESTA al gerente le vaciaba al pedido
  la cotización elegida, en silencio, dejándolo esperando aprobación sin nada
  que aprobar. Nadie se entera hasta que el gerente abre la ficha.

  `eliminar_cotizacion` sí se niega en ese caso —«está propuesta al gerente,
  retira la propuesta antes de eliminarla»—, así que una puerta comprobaba y la
  otra no. Añadir un botón «Editar» que llamara a `registrar_cotizacion` habría
  convertido esa esquina rara en el camino de todos los días.

  De ahí que esto sea un UPDATE de verdad: la fila es la misma, el `id` es el
  mismo y el número es el mismo. Nada que apunte a la cotización se entera de
  que cambió, que es justo lo que se pedía —«sobre el mismo registro, sin
  alterar la trazabilidad»—.

  QUÉ SÍ SE NIEGA

  Corregir la cotización que está propuesta al gerente. No por una limitación
  técnica —ahora el UPDATE no rompería nada— sino porque el gerente aprobaría
  unas condiciones distintas de las que se le enseñaron. Se retira la propuesta,
  se corrige y se vuelve a proponer, que además deja las tres cosas anotadas.

  Y corregir una que ya generó su orden de compra: ahí el precio está impreso.

  LOS RENGLONES SE REESCRIBEN ENTEROS

  No se intenta casar renglón por renglón. Se borran los de la cotización y se
  vuelven a insertar, que es lo que ya hacía el alta. Cuelgan de la cotización
  por una clave en cascada y no hay nada más que los referencie.

  LA TASA SE VUELVE A PEDIR

  Si cambia la fecha, cambia la tasa del día, y la cotización guarda la suya
  congelada. Se toma otra vez de `private.tasas_del_dia`, como en el alta: aquí
  no se calcula ninguna.
*/

create or replace function public.actualizar_cotizacion(
  p_id              bigint,
  p_moneda          char(3),
  p_renglones       jsonb,
  p_numero_proveedor text default null,
  p_fecha           date default null,
  p_validez_dias    smallint default 15,
  p_dias_entrega    smallint default null,
  p_condicion_pago  text default 'CONTADO',
  p_alicuota_iva    numeric default 16,
  p_descuento       numeric default 0,
  p_flete           numeric default 0,
  p_observacion     text default null
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_solicitud bigint;
  v_estado    text;
  v_elegida   bigint;
  v_numero    text;
  v_fecha     date := coalesce(p_fecha, current_date);
  v_tasa      numeric;
  v_tasa_usd  numeric;
  v_item      jsonb;
  v_renglon   bigint;
begin
  perform private.exigir_rol('COMPRAS');

  select c.solicitud_id, c.numero, s.estado, s.cotizacion_elegida_id
    into v_solicitud, v_numero, v_estado, v_elegida
  from public.cotizaciones c
  join public.solicitudes_pedido s on s.id = c.solicitud_id
  where c.id = p_id;

  if v_solicitud is null then
    raise exception 'No existe la cotización %.', p_id using errcode = 'P0002';
  end if;

  if v_elegida = p_id then
    raise exception 'Esta cotización está propuesta al gerente. Retira la propuesta antes de corregirla, o él aprobaría unas condiciones distintas de las que se le enseñaron.'
      using errcode = '55000';
  end if;

  if exists (select 1 from public.ordenes_compra where cotizacion_id = p_id) then
    raise exception 'Esta cotización ya generó una orden de compra: sus precios están impresos y no se corrigen.'
      using errcode = '55000';
  end if;

  if v_estado not in ('CONFIRMADA', 'POR_CONFIRMAR_GERENTE') then
    raise exception 'Las cotizaciones se corrigen sobre un pedido confirmado. Este está en "%".', v_estado
      using errcode = '55000';
  end if;

  if v_fecha > current_date then
    raise exception 'Una cotización no puede tener fecha futura.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'La cotización necesita al menos un renglón con precio.' using errcode = '22023';
  end if;

  select t.tasa, t.tasa_usd into v_tasa, v_tasa_usd
  from private.tasas_del_dia(p_moneda, v_fecha) t;

  update public.cotizaciones set
    numero_proveedor = nullif(trim(coalesce(p_numero_proveedor, '')), ''),
    fecha            = v_fecha,
    validez_dias     = coalesce(p_validez_dias, 15),
    dias_entrega     = p_dias_entrega,
    condicion_pago   = coalesce(p_condicion_pago, 'CONTADO'),
    moneda           = p_moneda,
    tasa             = v_tasa,
    tasa_usd         = v_tasa_usd,
    alicuota_iva     = coalesce(p_alicuota_iva, 16),
    descuento        = coalesce(p_descuento, 0),
    flete            = coalesce(p_flete, 0),
    observacion      = nullif(trim(coalesce(p_observacion, '')), '')
  where id = p_id;

  delete from public.cotizacion_renglones where cotizacion_id = p_id;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_renglon := (v_item->>'solicitud_renglon_id')::bigint;

    if not exists (
      select 1 from public.solicitud_renglones
      where id = v_renglon and solicitud_id = v_solicitud
    ) then
      raise exception 'El renglón % no pertenece a este pedido.', v_renglon using errcode = '22023';
    end if;

    insert into public.cotizacion_renglones
      (cotizacion_id, solicitud_renglon_id, cantidad, precio_unitario, exento_iva, observacion)
    values
      (p_id, v_renglon,
       (v_item->>'cantidad')::numeric,
       (v_item->>'precio_unitario')::numeric,
       coalesce((v_item->>'exento_iva')::boolean, false),
       nullif(trim(coalesce(v_item->>'observacion', '')), ''));
  end loop;

  perform private.anotar('COTIZACION', p_id, null, 'CORREGIDA', v_numero);

  return p_id;
end;
$$;

revoke execute on function public.actualizar_cotizacion(bigint, char, jsonb, text, date, smallint, smallint, text, numeric, numeric, numeric, text)
  from public, anon;
grant execute on function public.actualizar_cotizacion(bigint, char, jsonb, text, date, smallint, smallint, text, numeric, numeric, numeric, text)
  to authenticated;

/*
  Y SE CIERRA LA OTRA PUERTA.

  Mientras `registrar_cotizacion` siga borrando en silencio la cotización que
  está propuesta, el fallo sigue ahí para quien vuelva a cargar la del mismo
  proveedor en vez de corregirla. Se le pone la misma comprobación que ya tenía
  `eliminar_cotizacion`, y se le dice a la gente por dónde ir.

  Solo se añaden esas seis líneas: el resto de la función queda como estaba.
*/
create or replace function public.registrar_cotizacion(
  p_solicitud_id bigint, p_proveedor_id bigint, p_moneda char(3), p_renglones jsonb,
  p_numero_proveedor text default null, p_fecha date default null,
  p_validez_dias smallint default 15, p_dias_entrega smallint default null,
  p_condicion_pago text default 'CONTADO', p_alicuota_iva numeric default 16,
  p_descuento numeric default 0, p_flete numeric default 0, p_observacion text default null
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_estado   text;
  v_fecha    date := coalesce(p_fecha, current_date);
  v_tasa     numeric;
  v_tasa_usd numeric;
  v_numero   text;
  v_previa   bigint;
  v_elegida  bigint;
  v_id       bigint;
  v_item     jsonb;
  v_renglon  bigint;
begin
  perform private.exigir_rol('COMPRAS');

  select estado, cotizacion_elegida_id into v_estado, v_elegida
  from public.solicitudes_pedido where id = p_solicitud_id;

  if v_estado is null then
    raise exception 'No existe el pedido %.', p_solicitud_id using errcode = 'P0002';
  end if;

  if v_estado not in ('CONFIRMADA', 'POR_CONFIRMAR_GERENTE') then
    raise exception 'Las cotizaciones se cargan sobre un pedido confirmado. Este está en "%".', v_estado
      using errcode = '55000';
  end if;

  if v_fecha > current_date then
    raise exception 'Una cotización no puede tener fecha futura.' using errcode = '22023';
  end if;

  -- Recargar la cotización del mismo proveedor sustituye la anterior y hereda
  -- su número.
  select id, numero into v_previa, v_numero
  from public.cotizaciones
  where solicitud_id = p_solicitud_id and proveedor_id = p_proveedor_id;

  /*
    Salvo que sea la que está propuesta. Sustituirla la borra, y la clave del
    pedido es ON DELETE SET NULL: el pedido se quedaría esperando aprobación sin
    nada que aprobar, sin que nadie se entere.
  */
  if v_previa is not null and v_previa = v_elegida then
    raise exception 'Esa cotización está propuesta al gerente. Retira la propuesta, o corrígela con «Editar» en vez de volver a cargarla.'
      using errcode = '55000';
  end if;

  select t.tasa, t.tasa_usd into v_tasa, v_tasa_usd
  from private.tasas_del_dia(p_moneda, v_fecha) t;

  delete from public.cotizaciones
   where solicitud_id = p_solicitud_id and proveedor_id = p_proveedor_id;

  insert into public.cotizaciones
    (numero, solicitud_id, proveedor_id, numero_proveedor, fecha, validez_dias, dias_entrega,
     condicion_pago, moneda, tasa, tasa_usd, alicuota_iva, descuento, flete,
     observacion, registrada_por)
  values
    (coalesce(v_numero, private.siguiente_numero('COT')),
     p_solicitud_id, p_proveedor_id, nullif(trim(coalesce(p_numero_proveedor, '')), ''),
     v_fecha, coalesce(p_validez_dias, 15), p_dias_entrega,
     coalesce(p_condicion_pago, 'CONTADO'), p_moneda, v_tasa, v_tasa_usd,
     coalesce(p_alicuota_iva, 16), coalesce(p_descuento, 0), coalesce(p_flete, 0),
     nullif(trim(coalesce(p_observacion, '')), ''), (select auth.uid()))
  returning id, numero into v_id, v_numero;

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'La cotización necesita al menos un renglón con precio.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_renglon := (v_item->>'solicitud_renglon_id')::bigint;

    if not exists (
      select 1 from public.solicitud_renglones
      where id = v_renglon and solicitud_id = p_solicitud_id
    ) then
      raise exception 'El renglón % no pertenece a este pedido.', v_renglon using errcode = '22023';
    end if;

    insert into public.cotizacion_renglones
      (cotizacion_id, solicitud_renglon_id, cantidad, precio_unitario, exento_iva, observacion)
    values
      (v_id, v_renglon,
       (v_item->>'cantidad')::numeric,
       (v_item->>'precio_unitario')::numeric,
       coalesce((v_item->>'exento_iva')::boolean, false),
       nullif(trim(coalesce(v_item->>'observacion', '')), ''));
  end loop;

  perform private.anotar('COTIZACION', v_id, null, 'REGISTRADA', v_numero);

  return v_id;
end;
$$;
