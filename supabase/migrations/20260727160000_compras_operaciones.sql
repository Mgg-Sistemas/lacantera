-- ============================================================================
-- Compras: operaciones
--
-- Todo cambio de estado pasa por una de estas funciones. Ninguna pantalla
-- escribe directo en las tablas — los permisos de escritura están revocados —
-- y eso no es paranoia: cada función es una transacción. O el pedido queda
-- completo con sus renglones, o no queda nada. No existe el estado intermedio
-- de "se creó la orden pero se cayó a mitad de copiar los renglones".
--
-- Cada función valida tres cosas, en este orden:
--   1. que quien llama tenga el rol,
--   2. que el documento esté en el estado que permite la acción,
--   3. que los datos tengan sentido.
--
-- El orden importa: un mensaje de "no tienes permiso" es más útil que uno de
-- "falta el monto" cuando de todos modos no ibas a poder.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tasas del día
--
-- Resuelve las dos tasas que congela cada documento. Si no hay tasa BCV
-- registrada, corta aquí: valorar una compra con una tasa inventada es peor
-- que no poder registrarla.
-- ---------------------------------------------------------------------------
create or replace function private.tasas_del_dia(
  p_moneda char(3),
  p_fecha  date,
  out tasa numeric,
  out tasa_usd numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- Variables locales con prefijo: los parámetros de salida se llaman igual
  -- que las columnas que devuelve `obtener_tasa`, y plpgsql no siempre
  -- resuelve esa coincidencia a favor de la columna.
  v_usd    numeric;
  v_moneda numeric;
begin
  select t.tasa into v_usd
  from public.obtener_tasa('USD', 'VES', p_fecha, 'BCV') t;

  if v_usd is null then
    raise exception 'No hay tasa BCV registrada para el % ni para ninguna fecha anterior. Regístrala en Sistema › Tasas de cambio.', to_char(p_fecha, 'DD/MM/YYYY')
      using errcode = 'P0002';
  end if;

  if p_moneda = 'VES' then
    v_moneda := 1;
  elsif p_moneda = 'USD' then
    v_moneda := v_usd;
  else
    select t.tasa into v_moneda
    from public.obtener_tasa(p_moneda, 'VES', p_fecha, 'BCV') t;

    if v_moneda is null then
      raise exception 'No hay tasa BCV de % a bolívares para el %.', p_moneda, to_char(p_fecha, 'DD/MM/YYYY')
        using errcode = 'P0002';
    end if;
  end if;

  tasa     := v_moneda;
  tasa_usd := v_usd;
end;
$$;

-- ---------------------------------------------------------------------------
-- Proveedores
-- ---------------------------------------------------------------------------
create or replace function public.guardar_proveedor(
  p_id                     bigint,
  p_rif                    text,
  p_nombre                 text,
  p_nombre_comercial       text default null,
  p_contacto               text default null,
  p_telefono               text default null,
  p_correo                 text default null,
  p_direccion              text default null,
  p_condicion_pago         text default 'CONTADO',
  p_moneda_preferida       char(3) default 'USD',
  p_contribuyente_especial boolean default false,
  p_notas                  text default null,
  p_activo                 boolean default true
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rif text := upper(regexp_replace(coalesce(p_rif, ''), '\s', '', 'g'));
  v_id  bigint;
begin
  perform private.exigir_rol('COMPRAS');

  -- Se acepta "J123456789" y se guarda "J-12345678-9": la gente lo escribe de
  -- las dos formas y buscar por RIF tiene que encontrar siempre.
  if v_rif ~ '^[VEJPGC][0-9]{9}$' then
    v_rif := substr(v_rif, 1, 1) || '-' || substr(v_rif, 2, 8) || '-' || substr(v_rif, 10, 1);
  end if;

  if v_rif !~ '^[VEJPGC]-[0-9]{8}-[0-9]$' then
    raise exception 'El RIF "%" no tiene forma válida. Se espera J-12345678-9.', p_rif
      using errcode = '22023';
  end if;

  if length(trim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'El nombre o razón social del proveedor es obligatorio.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.proveedores
      (rif, nombre, nombre_comercial, contacto, telefono, correo, direccion,
       condicion_pago, moneda_preferida, contribuyente_especial, notas, activo, creado_por)
    values
      (v_rif, trim(p_nombre), nullif(trim(coalesce(p_nombre_comercial, '')), ''),
       nullif(trim(coalesce(p_contacto, '')), ''), nullif(trim(coalesce(p_telefono, '')), ''),
       nullif(trim(coalesce(p_correo, '')), ''), nullif(trim(coalesce(p_direccion, '')), ''),
       p_condicion_pago, p_moneda_preferida, coalesce(p_contribuyente_especial, false),
       nullif(trim(coalesce(p_notas, '')), ''), coalesce(p_activo, true), (select auth.uid()))
    returning id into v_id;
  else
    update public.proveedores set
      rif = v_rif,
      nombre = trim(p_nombre),
      nombre_comercial = nullif(trim(coalesce(p_nombre_comercial, '')), ''),
      contacto = nullif(trim(coalesce(p_contacto, '')), ''),
      telefono = nullif(trim(coalesce(p_telefono, '')), ''),
      correo = nullif(trim(coalesce(p_correo, '')), ''),
      direccion = nullif(trim(coalesce(p_direccion, '')), ''),
      condicion_pago = p_condicion_pago,
      moneda_preferida = p_moneda_preferida,
      contribuyente_especial = coalesce(p_contribuyente_especial, false),
      notas = nullif(trim(coalesce(p_notas, '')), ''),
      activo = coalesce(p_activo, true)
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'No existe el proveedor %.', p_id using errcode = 'P0002';
    end if;
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya hay un proveedor registrado con el RIF %.', v_rif using errcode = '23505';
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. PEDIDO
-- ---------------------------------------------------------------------------
create or replace function private.escribir_renglones(p_solicitud_id bigint, p_renglones jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item  jsonb;
  v_linea smallint := 0;
begin
  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El pedido necesita al menos un renglón.' using errcode = '22023';
  end if;

  delete from public.solicitud_renglones where solicitud_id = p_solicitud_id;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_linea := v_linea + 1;

    if length(trim(coalesce(v_item->>'descripcion', ''))) < 2 then
      raise exception 'El renglón % no tiene descripción.', v_linea using errcode = '22023';
    end if;

    if coalesce((v_item->>'cantidad')::numeric, 0) <= 0 then
      raise exception 'La cantidad del renglón % debe ser mayor que cero.', v_linea using errcode = '22023';
    end if;

    insert into public.solicitud_renglones
      (solicitud_id, linea, articulo_id, descripcion, cantidad, unidad, observacion)
    values
      (p_solicitud_id, v_linea,
       nullif(v_item->>'articulo_id', '')::bigint,
       trim(v_item->>'descripcion'),
       (v_item->>'cantidad')::numeric,
       coalesce(nullif(v_item->>'unidad', ''), 'UND'),
       nullif(trim(coalesce(v_item->>'observacion', '')), ''));
  end loop;
end;
$$;

create or replace function public.crear_pedido(
  p_titulo         text,
  p_justificacion  text,
  p_renglones      jsonb,
  p_prioridad      text default 'NORMAL',
  p_requerida_para date default null,
  p_destino        text default null,
  p_enviar         boolean default true
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform private.exigir_rol('SOLICITANTE', 'COMPRAS', 'OPERACIONES', 'ALMACEN', 'RRHH');

  if length(trim(coalesce(p_titulo, ''))) < 4 then
    raise exception 'Ponle un título al pedido: es lo que se lee en el tablero.' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_justificacion, ''))) < 10 then
    raise exception 'Explica para qué es. Quien aprueba no está en el frente y necesita el porqué.'
      using errcode = '22023';
  end if;

  insert into public.solicitudes_pedido
    (numero, titulo, justificacion, prioridad, requerida_para, destino, estado, solicitante_id, enviada_en)
  values
    (private.siguiente_numero('SOL'), trim(p_titulo), trim(p_justificacion),
     coalesce(p_prioridad, 'NORMAL'), p_requerida_para,
     nullif(trim(coalesce(p_destino, '')), ''),
     case when p_enviar then 'PEDIDO' else 'BORRADOR' end,
     (select auth.uid()),
     case when p_enviar then now() end)
  returning id into v_id;

  perform private.escribir_renglones(v_id, p_renglones);
  perform private.anotar('SOLICITUD', v_id, null,
    case when p_enviar then 'PEDIDO' else 'BORRADOR' end);

  return v_id;
end;
$$;

create or replace function public.actualizar_pedido(
  p_id             bigint,
  p_titulo         text,
  p_justificacion  text,
  p_renglones      jsonb,
  p_prioridad      text default 'NORMAL',
  p_requerida_para date default null,
  p_destino        text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_estado text;
  v_dueno  uuid;
begin
  select estado, solicitante_id into v_estado, v_dueno
  from public.solicitudes_pedido where id = p_id;

  if v_estado is null then
    raise exception 'No existe el pedido %.', p_id using errcode = 'P0002';
  end if;

  if v_estado <> 'BORRADOR' then
    raise exception 'El pedido ya fue enviado y no se puede editar. Cancélalo y crea otro.'
      using errcode = '55000';
  end if;

  if v_dueno <> (select auth.uid()) and not private.tiene_rol('COMPRAS') then
    raise exception 'Solo quien creó el borrador puede editarlo.' using errcode = '42501';
  end if;

  update public.solicitudes_pedido set
    titulo = trim(p_titulo),
    justificacion = trim(p_justificacion),
    prioridad = coalesce(p_prioridad, 'NORMAL'),
    requerida_para = p_requerida_para,
    destino = nullif(trim(coalesce(p_destino, '')), '')
  where id = p_id;

  perform private.escribir_renglones(p_id, p_renglones);
end;
$$;

create or replace function public.enviar_pedido(p_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_estado text;
begin
  select estado into v_estado from public.solicitudes_pedido where id = p_id;

  if v_estado is distinct from 'BORRADOR' then
    raise exception 'Solo se envía un borrador. Este pedido está en "%".', v_estado
      using errcode = '55000';
  end if;

  update public.solicitudes_pedido
     set estado = 'PEDIDO', enviada_en = now()
   where id = p_id;

  perform private.anotar('SOLICITUD', p_id, 'BORRADOR', 'PEDIDO');
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. CONFIRMADA · indicar proveedores
-- ---------------------------------------------------------------------------
create or replace function public.confirmar_pedido(p_id bigint, p_nota text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_estado text;
begin
  perform private.exigir_rol('COMPRAS');

  select estado into v_estado from public.solicitudes_pedido where id = p_id;

  if v_estado is null then
    raise exception 'No existe el pedido %.', p_id using errcode = 'P0002';
  end if;

  if v_estado <> 'PEDIDO' then
    raise exception 'Solo se confirma un pedido recién enviado. Este está en "%".', v_estado
      using errcode = '55000';
  end if;

  update public.solicitudes_pedido
     set estado = 'CONFIRMADA', confirmada_por = (select auth.uid()), confirmada_en = now()
   where id = p_id;

  perform private.anotar('SOLICITUD', p_id, 'PEDIDO', 'CONFIRMADA', p_nota);
end;
$$;

create or replace function public.cancelar_pedido(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_estado text;
  v_dueno  uuid;
begin
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe por qué se cancela. Sin motivo, dentro de un mes nadie sabrá qué pasó.'
      using errcode = '22023';
  end if;

  select estado, solicitante_id into v_estado, v_dueno
  from public.solicitudes_pedido where id = p_id;

  if v_estado is null then
    raise exception 'No existe el pedido %.', p_id using errcode = 'P0002';
  end if;

  if v_estado in ('APROBADA', 'CANCELADA') then
    raise exception 'Un pedido en "%" ya no se cancela desde aquí. Si ya hay orden de compra, cancélala en la orden.', v_estado
      using errcode = '55000';
  end if;

  -- Quien pidió puede arrepentirse; compras puede cerrar lo que no procede.
  if v_dueno <> (select auth.uid()) then
    perform private.exigir_rol('COMPRAS');
  end if;

  update public.solicitudes_pedido
     set estado = 'CANCELADA',
         motivo_cancelacion = trim(p_motivo),
         cancelada_por = (select auth.uid()),
         cancelada_en = now()
   where id = p_id;

  perform private.anotar('SOLICITUD', p_id, v_estado, 'CANCELADA', p_motivo);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cotizaciones
-- ---------------------------------------------------------------------------
create or replace function public.registrar_cotizacion(
  p_solicitud_id     bigint,
  p_proveedor_id     bigint,
  p_moneda           char(3),
  p_renglones        jsonb,
  p_numero_proveedor text default null,
  p_fecha            date default null,
  p_validez_dias     smallint default 15,
  p_dias_entrega     smallint default null,
  p_condicion_pago   text default 'CONTADO',
  p_alicuota_iva     numeric default 16,
  p_descuento        numeric default 0,
  p_flete            numeric default 0,
  p_observacion      text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_estado   text;
  v_fecha    date := coalesce(p_fecha, current_date);
  v_tasa     numeric;
  v_tasa_usd numeric;
  v_id       bigint;
  v_item     jsonb;
  v_renglon  bigint;
begin
  perform private.exigir_rol('COMPRAS');

  select estado into v_estado from public.solicitudes_pedido where id = p_solicitud_id;

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

  select t.tasa, t.tasa_usd into v_tasa, v_tasa_usd
  from private.tasas_del_dia(p_moneda, v_fecha) t;

  -- Recargar una cotización del mismo proveedor sustituye la anterior: es lo
  -- que pasa en la realidad cuando el proveedor manda el precio corregido.
  delete from public.cotizaciones
   where solicitud_id = p_solicitud_id and proveedor_id = p_proveedor_id;

  insert into public.cotizaciones
    (solicitud_id, proveedor_id, numero_proveedor, fecha, validez_dias, dias_entrega,
     condicion_pago, moneda, tasa, tasa_usd, alicuota_iva, descuento, flete,
     observacion, registrada_por)
  values
    (p_solicitud_id, p_proveedor_id, nullif(trim(coalesce(p_numero_proveedor, '')), ''),
     v_fecha, coalesce(p_validez_dias, 15), p_dias_entrega,
     coalesce(p_condicion_pago, 'CONTADO'), p_moneda, v_tasa, v_tasa_usd,
     coalesce(p_alicuota_iva, 16), coalesce(p_descuento, 0), coalesce(p_flete, 0),
     nullif(trim(coalesce(p_observacion, '')), ''), (select auth.uid()))
  returning id into v_id;

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

  perform private.anotar('COTIZACION', v_id, null, 'REGISTRADA',
    format('Pedido %s, proveedor %s', p_solicitud_id, p_proveedor_id));

  return v_id;
end;
$$;

create or replace function public.eliminar_cotizacion(p_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_solicitud bigint;
  v_elegida   bigint;
begin
  perform private.exigir_rol('COMPRAS');

  select c.solicitud_id, s.cotizacion_elegida_id
    into v_solicitud, v_elegida
  from public.cotizaciones c
  join public.solicitudes_pedido s on s.id = c.solicitud_id
  where c.id = p_id;

  if v_solicitud is null then
    raise exception 'No existe la cotización %.', p_id using errcode = 'P0002';
  end if;

  if v_elegida = p_id then
    raise exception 'Esta cotización está propuesta al gerente. Retira la propuesta antes de eliminarla.'
      using errcode = '55000';
  end if;

  if exists (select 1 from public.ordenes_compra where cotizacion_id = p_id) then
    raise exception 'Esta cotización ya generó una orden de compra y no se puede eliminar.'
      using errcode = '55000';
  end if;

  delete from public.cotizaciones where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. CONFIRMAR POR EL GERENTE
-- ---------------------------------------------------------------------------
create or replace function public.proponer_cotizacion(
  p_solicitud_id  bigint,
  p_cotizacion_id bigint,
  p_nota          text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_estado text;
begin
  perform private.exigir_rol('COMPRAS');

  select estado into v_estado from public.solicitudes_pedido where id = p_solicitud_id;

  if v_estado not in ('CONFIRMADA', 'POR_CONFIRMAR_GERENTE') then
    raise exception 'Este pedido está en "%" y no se puede proponer al gerente.', v_estado
      using errcode = '55000';
  end if;

  if not exists (
    select 1 from public.cotizaciones
    where id = p_cotizacion_id and solicitud_id = p_solicitud_id
  ) then
    raise exception 'Esa cotización no pertenece a este pedido.' using errcode = '22023';
  end if;

  update public.solicitudes_pedido
     set estado = 'POR_CONFIRMAR_GERENTE',
         cotizacion_elegida_id = p_cotizacion_id,
         propuesta_en = now()
   where id = p_solicitud_id;

  perform private.anotar('SOLICITUD', p_solicitud_id, v_estado, 'POR_CONFIRMAR_GERENTE', p_nota);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. APROBADA · indicar método de pago
--
-- La única función que puede llamar el gerente general y nadie más. Crea la
-- orden de compra copiando la cotización: a partir de aquí, lo que se autorizó
-- pagar queda fijo aunque alguien toque la cotización después.
-- ---------------------------------------------------------------------------
create or replace function public.aprobar_compra(p_solicitud_id bigint, p_nota text default null)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_estado   text;
  v_cot      public.cotizaciones;
  v_orden_id bigint;
begin
  perform private.exigir_rol('GERENTE_GENERAL');

  select estado into v_estado from public.solicitudes_pedido where id = p_solicitud_id;

  if v_estado is null then
    raise exception 'No existe el pedido %.', p_solicitud_id using errcode = 'P0002';
  end if;

  if v_estado <> 'POR_CONFIRMAR_GERENTE' then
    raise exception 'Este pedido está en "%" y todavía no llega a la gerencia.', v_estado
      using errcode = '55000';
  end if;

  select c.* into v_cot
  from public.cotizaciones c
  join public.solicitudes_pedido s on s.cotizacion_elegida_id = c.id
  where s.id = p_solicitud_id;

  if v_cot.id is null then
    raise exception 'El pedido no tiene una cotización propuesta.' using errcode = '55000';
  end if;

  insert into public.ordenes_compra
    (numero, solicitud_id, cotizacion_id, proveedor_id, moneda, tasa, tasa_usd,
     subtotal, descuento, flete, iva, total, dias_entrega, entrega_estimada,
     creada_por, aprobada_gg_por, aprobada_gg_en)
  values
    (private.siguiente_numero('OC'), p_solicitud_id, v_cot.id, v_cot.proveedor_id,
     v_cot.moneda, v_cot.tasa, v_cot.tasa_usd,
     v_cot.subtotal, v_cot.descuento, v_cot.flete, v_cot.iva, v_cot.total,
     v_cot.dias_entrega,
     case when v_cot.dias_entrega is not null then current_date + v_cot.dias_entrega end,
     (select auth.uid()), (select auth.uid()), now())
  returning id into v_orden_id;

  insert into public.orden_renglones
    (orden_id, linea, articulo_id, descripcion, cantidad, unidad, precio_unitario, exento_iva)
  select v_orden_id, sr.linea, sr.articulo_id, sr.descripcion,
         cr.cantidad, sr.unidad, cr.precio_unitario, cr.exento_iva
  from public.cotizacion_renglones cr
  join public.solicitud_renglones sr on sr.id = cr.solicitud_renglon_id
  where cr.cotizacion_id = v_cot.id;

  update public.solicitudes_pedido
     set estado = 'APROBADA', aprobada_gg_por = (select auth.uid()), aprobada_gg_en = now()
   where id = p_solicitud_id;

  perform private.anotar('SOLICITUD', p_solicitud_id, v_estado, 'APROBADA', p_nota);
  perform private.anotar('ORDEN', v_orden_id, null, 'POR_INDICAR_PAGO', p_nota);

  return v_orden_id;
end;
$$;

create or replace function public.devolver_a_cotizacion(p_solicitud_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_estado text;
begin
  perform private.exigir_rol('GERENTE_GENERAL');

  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Di qué hay que corregir: sin eso, compras vuelve a mandar lo mismo.'
      using errcode = '22023';
  end if;

  select estado into v_estado from public.solicitudes_pedido where id = p_solicitud_id;

  if v_estado <> 'POR_CONFIRMAR_GERENTE' then
    raise exception 'Este pedido no está esperando a la gerencia.' using errcode = '55000';
  end if;

  update public.solicitudes_pedido
     set estado = 'CONFIRMADA', cotizacion_elegida_id = null, propuesta_en = null
   where id = p_solicitud_id;

  perform private.anotar('SOLICITUD', p_solicitud_id, v_estado, 'CONFIRMADA', p_motivo);
end;
$$;

-- ---------------------------------------------------------------------------
-- Método de pago → tesorería
-- ---------------------------------------------------------------------------
create or replace function public.indicar_pago(
  p_orden_id bigint,
  p_metodo   text,
  p_moneda   char(3),
  p_monto    numeric,
  p_datos    jsonb default '{}'::jsonb,
  p_nota     text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_estado   text;
  v_total    numeric;
  v_moneda   char(3);
  v_pagado   numeric;
  v_tasa     numeric;
  v_tasa_usd numeric;
  v_id       bigint;
begin
  perform private.exigir_rol('COMPRAS');

  select estado, total, moneda into v_estado, v_total, v_moneda
  from public.ordenes_compra where id = p_orden_id;

  if v_estado is null then
    raise exception 'No existe la orden %.', p_orden_id using errcode = 'P0002';
  end if;

  if v_estado not in ('POR_INDICAR_PAGO', 'EN_TESORERIA') then
    raise exception 'Esta orden está en "%" y no admite instrucciones de pago.', v_estado
      using errcode = '55000';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto a pagar debe ser mayor que cero.' using errcode = '22023';
  end if;

  select t.tasa, t.tasa_usd into v_tasa, v_tasa_usd
  from private.tasas_del_dia(p_moneda, current_date) t;

  -- No se puede instruir más de lo que la orden vale. Se comparan en la moneda
  -- de la orden usando las tasas del día de cada instrucción.
  select coalesce(sum(
           case when i.moneda = v_moneda then i.monto
                else round(i.monto * i.tasa / nullif(o.tasa, 0), 6) end), 0)
    into v_pagado
  from public.instrucciones_pago i
  join public.ordenes_compra o on o.id = i.orden_id
  where i.orden_id = p_orden_id and i.estado in ('POR_PAGAR', 'PAGADA');

  if v_pagado + (case when p_moneda = v_moneda then p_monto
                      else round(p_monto * v_tasa / nullif((select tasa from public.ordenes_compra where id = p_orden_id), 0), 6) end)
     > v_total + 0.01 then
    raise exception 'Con esta instrucción se pagaría más que el total de la orden (% %). Ya hay % instruido.',
      v_total, v_moneda, v_pagado
      using errcode = '22023';
  end if;

  insert into public.instrucciones_pago
    (orden_id, metodo, moneda, monto, tasa, tasa_usd,
     igtf_aplica,
     banco, numero_cuenta, titular, documento, telefono, correo_binance, red_cripto, receptor,
     nota, creada_por)
  values
    (p_orden_id, p_metodo, p_moneda, p_monto, v_tasa, v_tasa_usd,
     -- El IGTF grava el pago en divisa, incluido el criptoactivo. En bolívares
     -- no aplica, sea transferencia o pago móvil.
     p_moneda <> 'VES',
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
exception
  when check_violation then
    raise exception 'Faltan datos del pago. Transferencia: banco, cuenta, titular y documento. Pago móvil: banco, teléfono y documento. Binance: correo o billetera y titular. Efectivo: quién recibe y su documento.'
      using errcode = '22023';
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. PAGADA · pendiente por recepcionar
--
-- La ejecuta tesorería. El módulo de tesorería añadirá después de qué cuenta
-- salió el dinero; el estado de la compra ya no cambiará por eso.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_pago(
  p_instruccion_id bigint,
  p_referencia     text default null,
  p_fecha          date default null,
  p_nota           text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_orden    bigint;
  v_estado   text;
  v_metodo   text;
  v_o_estado text;
  v_faltan   numeric;
begin
  perform private.exigir_rol('TESORERIA');

  select orden_id, estado, metodo into v_orden, v_estado, v_metodo
  from public.instrucciones_pago where id = p_instruccion_id;

  if v_orden is null then
    raise exception 'No existe la instrucción de pago %.', p_instruccion_id using errcode = 'P0002';
  end if;

  if v_estado <> 'POR_PAGAR' then
    raise exception 'Esta instrucción está en "%" y no se puede volver a pagar.', v_estado
      using errcode = '55000';
  end if;

  if v_metodo <> 'EFECTIVO' and length(trim(coalesce(p_referencia, ''))) = 0 then
    raise exception 'Falta el número de referencia de la transacción.' using errcode = '22023';
  end if;

  update public.instrucciones_pago
     set estado = 'PAGADA',
         referencia = nullif(trim(coalesce(p_referencia, '')), ''),
         fecha_pago = coalesce(p_fecha, current_date),
         pagada_por = (select auth.uid()),
         pagada_en = now()
   where id = p_instruccion_id;

  perform private.anotar('PAGO', p_instruccion_id, 'POR_PAGAR', 'PAGADA', p_nota);

  -- La orden pasa a "pagada por recibir" cuando ya no queda nada por pagar.
  -- Con un abono parcial se queda esperando el resto.
  select o.total - coalesce(sum(
           case when i.moneda = o.moneda then i.monto
                else round(i.monto * i.tasa / nullif(o.tasa, 0), 6) end), 0)
    into v_faltan
  from public.ordenes_compra o
  left join public.instrucciones_pago i on i.orden_id = o.id and i.estado = 'PAGADA'
  where o.id = v_orden
  group by o.total;

  select estado into v_o_estado from public.ordenes_compra where id = v_orden;

  if v_faltan <= 0.01 then
    update public.ordenes_compra
       set estado = 'PAGADA_POR_RECIBIR',
           fecha_pago = coalesce(p_fecha, current_date),
           pagada_en = now()
     where id = v_orden;

    perform private.anotar('ORDEN', v_orden, v_o_estado, 'PAGADA_POR_RECIBIR');
  end if;
end;
$$;

create or replace function public.devolver_instruccion(p_instruccion_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_orden bigint;
  v_estado text;
begin
  perform private.exigir_rol('TESORERIA');

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
$$;

-- ---------------------------------------------------------------------------
-- 6/7. CANCELADA y EL PROVEEDOR DESISTIÓ
-- ---------------------------------------------------------------------------
create or replace function public.cancelar_orden(p_orden_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_estado text;
begin
  perform private.exigir_rol('COMPRAS', 'GERENTE_GENERAL');

  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo de la cancelación.' using errcode = '22023';
  end if;

  select estado into v_estado from public.ordenes_compra where id = p_orden_id;

  if v_estado is null then
    raise exception 'No existe la orden %.', p_orden_id using errcode = 'P0002';
  end if;

  if v_estado not in ('POR_INDICAR_PAGO', 'EN_TESORERIA') then
    raise exception 'Una orden en "%" ya no se cancela. Si ya se pagó y el proveedor no entregó, márcala como desistida.', v_estado
      using errcode = '55000';
  end if;

  update public.instrucciones_pago
     set estado = 'ANULADA'
   where orden_id = p_orden_id and estado = 'POR_PAGAR';

  update public.ordenes_compra
     set estado = 'CANCELADA', motivo_cancelacion = trim(p_motivo), cancelada_en = now()
   where id = p_orden_id;

  perform private.anotar('ORDEN', p_orden_id, v_estado, 'CANCELADA', p_motivo);
end;
$$;

create or replace function public.marcar_desistimiento(p_orden_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_estado text;
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

  update public.ordenes_compra
     set estado = 'PROVEEDOR_DESISTIO',
         desistio_motivo = trim(p_motivo),
         desistio_en = now(),
         desistio_resolucion = 'PENDIENTE'
   where id = p_orden_id;

  perform private.anotar('ORDEN', p_orden_id, v_estado, 'PROVEEDOR_DESISTIO', p_motivo);
end;
$$;

create or replace function public.resolver_desistimiento(
  p_orden_id   bigint,
  p_resolucion text,
  p_nota       text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_estado text;
begin
  perform private.exigir_rol('GERENTE_GENERAL', 'TESORERIA');

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
$$;

-- ---------------------------------------------------------------------------
-- Vista del tablero
--
-- Una fila por compra, con la columna donde va la tarjeta ya resuelta. Que lo
-- decida la base y no la pantalla evita que el tablero y los informes cuenten
-- cosas distintas.
-- ---------------------------------------------------------------------------
create or replace view public.v_compras_tablero
with (security_invoker = on) as
select
  s.id                       as solicitud_id,
  s.numero,
  s.titulo,
  s.prioridad,
  s.requerida_para,
  s.destino,
  s.estado                   as estado_solicitud,
  s.creada_en,
  s.solicitante_id,
  per.nombre                 as solicitante,
  o.id                       as orden_id,
  o.numero                   as orden_numero,
  o.estado                   as estado_orden,
  o.fecha_pago,
  o.entrega_estimada,
  o.desistio_resolucion,

  coalesce(prov_o.nombre, prov_c.nombre) as proveedor,
  coalesce(o.moneda, cot.moneda)         as moneda,
  coalesce(o.total, cot.total)           as total,
  coalesce(o.total_usd, cot.total_usd)   as total_usd,
  coalesce(o.total_bs, cot.total_bs)     as total_bs,

  (select count(*) from public.cotizaciones c where c.solicitud_id = s.id) as cotizaciones,
  (select count(*) from public.solicitud_renglones r where r.solicitud_id = s.id) as renglones,

  -- Días que lleva el dinero afuera sin material. Es la cifra que justifica
  -- que estas tarjetas no se archiven solas.
  case when o.fecha_pago is not null and o.estado in
            ('PAGADA_POR_RECIBIR', 'RECIBIDA_PARCIAL', 'PROVEEDOR_DESISTIO')
       then current_date - o.fecha_pago end as dias_sin_recibir,

  case
    when s.estado in ('BORRADOR', 'PEDIDO')     then 'PEDIDO'
    when s.estado = 'CONFIRMADA'                then 'CONFIRMADA'
    when s.estado = 'POR_CONFIRMAR_GERENTE'     then 'GERENTE'
    when s.estado = 'CANCELADA'                 then 'CANCELADA'
    when o.estado = 'CANCELADA'                 then 'CANCELADA'
    when o.estado = 'PROVEEDOR_DESISTIO'        then 'DESISTIO'
    when o.estado in ('POR_INDICAR_PAGO', 'EN_TESORERIA')       then 'APROBADA'
    when o.estado in ('PAGADA_POR_RECIBIR', 'RECIBIDA_PARCIAL') then 'PAGADA'
    when o.estado = 'RECIBIDA'                  then 'RECIBIDA'
  end as columna
from public.solicitudes_pedido s
left join public.perfiles per on per.id = s.solicitante_id

-- Una solicitud puede acumular más de una orden si la primera se canceló.
-- Se toma la viva; si todas están canceladas, la última, para que la tarjeta
-- aparezca en la columna Cancelada y no desaparezca del tablero.
left join lateral (
  select oc.*
  from public.ordenes_compra oc
  where oc.solicitud_id = s.id
  order by (oc.estado = 'CANCELADA'), oc.id desc
  limit 1
) o on true

left join public.cotizaciones cot on cot.id = s.cotizacion_elegida_id
left join public.proveedores prov_o on prov_o.id = o.proveedor_id
left join public.proveedores prov_c on prov_c.id = cot.proveedor_id;

grant select on public.v_compras_tablero to authenticated;

-- ---------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------
do $$
declare
  v_firma text;
begin
  foreach v_firma in array array[
    'public.guardar_proveedor(bigint, text, text, text, text, text, text, text, text, char, boolean, text, boolean)',
    'public.crear_pedido(text, text, jsonb, text, date, text, boolean)',
    'public.actualizar_pedido(bigint, text, text, jsonb, text, date, text)',
    'public.enviar_pedido(bigint)',
    'public.confirmar_pedido(bigint, text)',
    'public.cancelar_pedido(bigint, text)',
    'public.registrar_cotizacion(bigint, bigint, char, jsonb, text, date, smallint, smallint, text, numeric, numeric, numeric, text)',
    'public.eliminar_cotizacion(bigint)',
    'public.proponer_cotizacion(bigint, bigint, text)',
    'public.aprobar_compra(bigint, text)',
    'public.devolver_a_cotizacion(bigint, text)',
    'public.indicar_pago(bigint, text, char, numeric, jsonb, text)',
    'public.registrar_pago(bigint, text, date, text)',
    'public.devolver_instruccion(bigint, text)',
    'public.cancelar_orden(bigint, text)',
    'public.marcar_desistimiento(bigint, text)',
    'public.resolver_desistimiento(bigint, text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_firma);
    execute format('grant execute on function %s to authenticated', v_firma);
  end loop;
end
$$;
