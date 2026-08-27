/*
  TRES COSAS QUE PIDIÓ COMPRAS EL 27 DE AGOSTO, Y QUE SON LA MISMA COSA.

  Las tres salen de cómo se cotiza de verdad en la cantera, y las tres chocaban
  con un modelo que daba por hecho que de cada proveedor llega un papel y que a
  la gerencia sube uno solo.

  1. DOS COTIZACIONES DEL MISMO PROVEEDOR SE PISABAN

  Había un `unique (solicitud_id, proveedor_id)`, y `registrar_cotizacion`
  borraba la anterior para cumplirlo. Al cargar la segunda del mismo proveedor
  desaparecía la primera sin avisar.

  No es un descuido del modelo: se escribió así a propósito, «un proveedor, un
  precio». Lo que pasa es que no es cierto. Un proveedor manda dos ofertas del
  mismo aceite en marcas distintas, o una en bidón y otra en barril, y las dos
  hay que poder enseñarlas juntas. Se cae la restricción y cada carga es una
  cotización nueva, con su número.

  2. LA MARCA Y LA PRESENTACIÓN NO TENÍAN DÓNDE ESCRIBIRSE

  Quien hace el pedido lo pide en litros, que es como se consume. Quien compra
  recibe del proveedor otra cosa: una marca —Motul, Chronus— y una presentación
  —bidón, barril, paleta—. Son dos personas distintas y dos momentos distintos,
  y por eso el dato no cabe en el pedido: nace después.

  Se estaba escribiendo en la observación, que es donde va a parar todo lo que
  no tiene campo. Ahora tiene el suyo, por renglón, porque es del renglón:
  dos artículos de la misma cotización vienen en presentaciones distintas.

  Texto libre y sin catálogo, a propósito. Lo que se guarda es lo que el
  proveedor escribió en su papel; un catálogo cerrado obligaría a traducirlo, y
  entonces ya no sería lo que mandó.

  3. A LA GERENCIA SUBÍA UNA SOLA

  `solicitudes_pedido.cotizacion_elegida_id` guardaba la propuesta, así que
  proponer una segunda desproponía la primera. Compras quiere subir dos o tres
  y que el gerente escoja, que es de lo que trata comparar.

  El cambio es de sitio, no de tamaño: la propuesta pasa a ser un marbete de
  cada cotización, `cotizaciones.propuesta`, y pueden estar marcadas varias.
  `cotizacion_elegida_id` deja de significar «la que compras propone» y pasa a
  significar «la que el gerente aprobó» — un dato de después, no de antes, y
  por eso ahora lo escribe `aprobar_compra` y no `proponer_cotizacion`.

  LO QUE NO CAMBIA

  Una cotización propuesta sigue sin poder corregirse ni borrarse: el gerente
  aprobaría unas condiciones distintas de las que se le enseñaron. Lo único que
  cambia es cómo se pregunta —por el marbete y no por `cotizacion_elegida_id`—.
*/

-- ---------------------------------------------------------------------------
-- 1. Cae la restricción de un proveedor por pedido
-- ---------------------------------------------------------------------------

alter table public.cotizaciones
  drop constraint if exists cotizaciones_solicitud_id_proveedor_id_key;

-- ---------------------------------------------------------------------------
-- 2. La marca y la presentación, por renglón
-- ---------------------------------------------------------------------------

alter table public.cotizacion_renglones
  add column if not exists marca text,
  add column if not exists presentacion text;

comment on column public.cotizacion_renglones.marca is
  'La marca que ofrece el proveedor para este renglón. Tal como la escribió él.';
comment on column public.cotizacion_renglones.presentacion is
  'Cómo viene: bidón, barril, paleta, saco. Nace en compras, no en el pedido.';

-- ---------------------------------------------------------------------------
-- 3. La propuesta es un marbete de la cotización, y caben varias
-- ---------------------------------------------------------------------------

alter table public.cotizaciones
  add column if not exists propuesta boolean not null default false;

comment on column public.cotizaciones.propuesta is
  'Compras la subió a la gerencia. Pueden estar marcadas varias del mismo pedido.';

/*
  El pedido que ahora mismo está en la gerencia se queda como está.

  Su `cotizacion_elegida_id` significaba «la propuesta», que es justo lo que a
  partir de aquí dice el marbete. Sin este relleno, el gerente abriría mañana
  un pedido en su bandeja y no encontraría nada que aprobar.

  Solo los que están esperando: en uno ya aprobado, `cotizacion_elegida_id` es
  la que se aprobó —el significado nuevo— y marcarla como propuesta sería
  volver a meterla en una cola de la que ya salió.
*/
update public.cotizaciones c
   set propuesta = true
  from public.solicitudes_pedido s
 where s.cotizacion_elegida_id = c.id
   and s.estado = 'POR_CONFIRMAR_GERENTE';

-- Buscar las propuestas de un pedido es lo que hace la bandeja del gerente en
-- cada carga, y el parcial deja fuera del índice todo lo que no se pregunta.
create index if not exists cotizaciones_propuestas_idx
  on public.cotizaciones (solicitud_id)
  where propuesta;

-- ---------------------------------------------------------------------------
-- Cargar una cotización: ya no sustituye a nada
-- ---------------------------------------------------------------------------

create or replace function public.registrar_cotizacion(
  p_solicitud_id   bigint,
  p_proveedor_id   bigint,
  p_moneda         character,
  p_renglones      jsonb,
  p_numero_proveedor text default null,
  p_fecha          date default null,
  p_validez_dias   smallint default 15,
  p_dias_entrega   smallint default null,
  p_condicion_pago text default 'CONTADO',
  p_alicuota_iva   numeric default 16,
  p_descuento      numeric default 0,
  p_flete          numeric default 0,
  p_observacion    text default null
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_estado   text;
  v_fecha    date := coalesce(p_fecha, current_date);
  v_tasa     numeric;
  v_tasa_usd numeric;
  v_numero   text;
  v_id       bigint;
  v_item     jsonb;
  v_renglon  bigint;
begin
  perform private.exigir_rol('COMPRAS');

  select estado into v_estado
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

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'La cotización necesita al menos un renglón con precio.' using errcode = '22023';
  end if;

  select t.tasa, t.tasa_usd into v_tasa, v_tasa_usd
  from private.tasas_del_dia(p_moneda, v_fecha) t;

  /*
    Aquí estaba el borrado de la del mismo proveedor. Ya no: cada carga es una
    cotización nueva, con su propio número, y las dos se comparan en la
    pantalla. Si lo que se quería era corregir la anterior, para eso está
    `actualizar_cotizacion`, que conserva el número y el sitio en el historial.
  */
  insert into public.cotizaciones
    (numero, solicitud_id, proveedor_id, numero_proveedor, fecha, validez_dias, dias_entrega,
     condicion_pago, moneda, tasa, tasa_usd, alicuota_iva, descuento, flete,
     observacion, registrada_por)
  values
    (private.siguiente_numero('COT'),
     p_solicitud_id, p_proveedor_id, nullif(trim(coalesce(p_numero_proveedor, '')), ''),
     v_fecha, coalesce(p_validez_dias, 15), p_dias_entrega,
     coalesce(p_condicion_pago, 'CONTADO'), p_moneda, v_tasa, v_tasa_usd,
     coalesce(p_alicuota_iva, 16), coalesce(p_descuento, 0), coalesce(p_flete, 0),
     nullif(trim(coalesce(p_observacion, '')), ''), (select auth.uid()))
  returning id, numero into v_id, v_numero;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_renglon := (v_item->>'solicitud_renglon_id')::bigint;

    if not exists (
      select 1 from public.solicitud_renglones
      where id = v_renglon and solicitud_id = p_solicitud_id
    ) then
      raise exception 'El renglón % no pertenece a este pedido.', v_renglon using errcode = '22023';
    end if;

    insert into public.cotizacion_renglones
      (cotizacion_id, solicitud_renglon_id, cantidad, precio_unitario, exento_iva,
       marca, presentacion, observacion)
    values
      (v_id, v_renglon,
       (v_item->>'cantidad')::numeric,
       (v_item->>'precio_unitario')::numeric,
       coalesce((v_item->>'exento_iva')::boolean, false),
       nullif(trim(coalesce(v_item->>'marca', '')), ''),
       nullif(trim(coalesce(v_item->>'presentacion', '')), ''),
       nullif(trim(coalesce(v_item->>'observacion', '')), ''));
  end loop;

  perform private.anotar('COTIZACION', v_id, null, 'REGISTRADA', v_numero);

  return v_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Corregirla: mismo número, y ahora también marca y presentación
-- ---------------------------------------------------------------------------

create or replace function public.actualizar_cotizacion(
  p_id             bigint,
  p_moneda         character,
  p_renglones      jsonb,
  p_numero_proveedor text default null,
  p_fecha          date default null,
  p_validez_dias   smallint default 15,
  p_dias_entrega   smallint default null,
  p_condicion_pago text default 'CONTADO',
  p_alicuota_iva   numeric default 16,
  p_descuento      numeric default 0,
  p_flete          numeric default 0,
  p_observacion    text default null
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_solicitud bigint;
  v_estado    text;
  v_propuesta boolean;
  v_numero    text;
  v_fecha     date := coalesce(p_fecha, current_date);
  v_tasa      numeric;
  v_tasa_usd  numeric;
  v_item      jsonb;
  v_renglon   bigint;
begin
  perform private.exigir_rol('COMPRAS');

  select c.solicitud_id, c.numero, c.propuesta, s.estado
    into v_solicitud, v_numero, v_propuesta, v_estado
  from public.cotizaciones c
  join public.solicitudes_pedido s on s.id = c.solicitud_id
  where c.id = p_id;

  if v_solicitud is null then
    raise exception 'No existe la cotización %.', p_id using errcode = 'P0002';
  end if;

  -- Se pregunta por el marbete y no por `cotizacion_elegida_id`, que desde
  -- esta migración ya no dice qué se propuso sino qué se aprobó.
  if v_propuesta then
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
      (cotizacion_id, solicitud_renglon_id, cantidad, precio_unitario, exento_iva,
       marca, presentacion, observacion)
    values
      (p_id, v_renglon,
       (v_item->>'cantidad')::numeric,
       (v_item->>'precio_unitario')::numeric,
       coalesce((v_item->>'exento_iva')::boolean, false),
       nullif(trim(coalesce(v_item->>'marca', '')), ''),
       nullif(trim(coalesce(v_item->>'presentacion', '')), ''),
       nullif(trim(coalesce(v_item->>'observacion', '')), ''));
  end loop;

  perform private.anotar('COTIZACION', p_id, null, 'CORREGIDA', v_numero);

  return p_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Borrarla: la misma pregunta, por el marbete
-- ---------------------------------------------------------------------------

create or replace function public.eliminar_cotizacion(p_id bigint)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_solicitud bigint;
  v_propuesta boolean;
begin
  perform private.exigir_rol('COMPRAS');

  select c.solicitud_id, c.propuesta
    into v_solicitud, v_propuesta
  from public.cotizaciones c
  where c.id = p_id;

  if v_solicitud is null then
    raise exception 'No existe la cotización %.', p_id using errcode = 'P0002';
  end if;

  if v_propuesta then
    raise exception 'Esta cotización está propuesta al gerente. Retira la propuesta antes de eliminarla.'
      using errcode = '55000';
  end if;

  if exists (select 1 from public.ordenes_compra where cotizacion_id = p_id) then
    raise exception 'Esta cotización ya generó una orden de compra y no se puede eliminar.'
      using errcode = '55000';
  end if;

  delete from public.cotizaciones where id = p_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Proponer: suma, no sustituye
-- ---------------------------------------------------------------------------

create or replace function public.proponer_cotizacion(
  p_solicitud_id  bigint,
  p_cotizacion_id bigint,
  p_nota          text default null
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_estado    text;
  v_propuesta boolean;
  v_numero    text;
begin
  perform private.exigir_rol('COMPRAS');

  select estado into v_estado
  from public.solicitudes_pedido where id = p_solicitud_id;

  if v_estado is null then
    raise exception 'No existe el pedido %.', p_solicitud_id using errcode = 'P0002';
  end if;

  if v_estado not in ('CONFIRMADA', 'POR_CONFIRMAR_GERENTE') then
    raise exception 'Este pedido está en "%" y no se puede proponer al gerente.', v_estado
      using errcode = '55000';
  end if;

  select numero, propuesta into v_numero, v_propuesta
  from public.cotizaciones
  where id = p_cotizacion_id and solicitud_id = p_solicitud_id;

  if v_numero is null then
    raise exception 'Esa cotización no pertenece a este pedido.' using errcode = '22023';
  end if;

  -- Ya estaba propuesta: quien pulsó quería que lo estuviera, y lo está. Se
  -- sale en silencio en vez de dar un error que no corrige nada.
  if v_propuesta then
    return;
  end if;

  update public.cotizaciones set propuesta = true where id = p_cotizacion_id;

  /*
    El pedido sube a la gerencia la primera vez, y de ahí no se mueve al añadir
    una segunda: ya estaba arriba. Se anota igual, porque para quien lee el
    recorrido «se añadió otra a comparar» es un hecho del expediente.
  */
  if v_estado <> 'POR_CONFIRMAR_GERENTE' then
    update public.solicitudes_pedido
       set estado = 'POR_CONFIRMAR_GERENTE', propuesta_en = now()
     where id = p_solicitud_id;

    perform private.anotar(
      'SOLICITUD', p_solicitud_id, v_estado, 'POR_CONFIRMAR_GERENTE',
      trim(coalesce(nullif(trim(p_nota), '') || ' — ', '') || format('Propuesta %s', v_numero)));
  else
    perform private.anotar(
      'SOLICITUD', p_solicitud_id, v_estado, 'POR_CONFIRMAR_GERENTE',
      trim(coalesce(nullif(trim(p_nota), '') || ' — ', '')
           || format('Se añadió %s a lo propuesto', v_numero)));
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Retirar una de las propuestas
-- ---------------------------------------------------------------------------

/*
  Antes no hacía falta: proponer otra desproponía la anterior sola. Ahora que
  se suman, hay que poder quitar una — y quitar la última devuelve el pedido a
  compras, porque un pedido en la gerencia sin nada que aprobar es una bandeja
  con un papel en blanco.
*/
create or replace function public.retirar_cotizacion(
  p_cotizacion_id bigint,
  p_nota          text default null
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_solicitud bigint;
  v_estado    text;
  v_propuesta boolean;
  v_numero    text;
  v_quedan    integer;
begin
  perform private.exigir_rol('COMPRAS');

  select c.solicitud_id, c.numero, c.propuesta, s.estado
    into v_solicitud, v_numero, v_propuesta, v_estado
  from public.cotizaciones c
  join public.solicitudes_pedido s on s.id = c.solicitud_id
  where c.id = p_cotizacion_id;

  if v_solicitud is null then
    raise exception 'No existe la cotización %.', p_cotizacion_id using errcode = 'P0002';
  end if;

  if not v_propuesta then
    return;
  end if;

  if v_estado <> 'POR_CONFIRMAR_GERENTE' then
    raise exception 'Este pedido está en "%": ya no hay nada que retirar de la gerencia.', v_estado
      using errcode = '55000';
  end if;

  update public.cotizaciones set propuesta = false where id = p_cotizacion_id;

  select count(*) into v_quedan
  from public.cotizaciones
  where solicitud_id = v_solicitud and propuesta;

  if v_quedan = 0 then
    update public.solicitudes_pedido
       set estado = 'CONFIRMADA', propuesta_en = null
     where id = v_solicitud;

    perform private.anotar(
      'SOLICITUD', v_solicitud, 'POR_CONFIRMAR_GERENTE', 'CONFIRMADA',
      trim(coalesce(nullif(trim(p_nota), '') || ' — ', '')
           || format('Se retiró %s; no queda ninguna propuesta', v_numero)));
  else
    perform private.anotar(
      'SOLICITUD', v_solicitud, 'POR_CONFIRMAR_GERENTE', 'POR_CONFIRMAR_GERENTE',
      trim(coalesce(nullif(trim(p_nota), '') || ' — ', '')
           || format('Se retiró %s; quedan %s propuestas', v_numero, v_quedan)));
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Aprobar: ahora el gerente dice cuál
-- ---------------------------------------------------------------------------

/*
  CAMBIA LA LISTA DE ARGUMENTOS, ASÍ QUE VA CON DROP.

  Un `create or replace` con otra firma no reemplaza la función: crea una
  segunda con el mismo nombre, y a partir de ahí PostgREST elige por los
  argumentos que le manden — que es una forma muy silenciosa de que media
  aplicación siga llamando a la vieja. Al soltarla se van sus permisos, así que
  se reponen aquí mismo: en `public` una función nace con `execute` para todo
  el mundo, `anon` incluido.
*/
drop function if exists public.aprobar_compra(bigint, text);

create function public.aprobar_compra(
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
    (orden_id, linea, articulo_id, descripcion, cantidad, unidad, precio_unitario, exento_iva)
  select v_orden_id, sr.linea, sr.articulo_id, sr.descripcion,
         cr.cantidad, sr.unidad, cr.precio_unitario, cr.exento_iva
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

revoke all on function public.aprobar_compra(bigint, bigint, text) from public, anon;
grant execute on function public.aprobar_compra(bigint, bigint, text)
  to authenticated, service_role;

revoke all on function public.retirar_cotizacion(bigint, text) from public, anon;
grant execute on function public.retirar_cotizacion(bigint, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Devolver a compras: se caen todas las propuestas
-- ---------------------------------------------------------------------------

create or replace function public.devolver_a_cotizacion(
  p_solicitud_id bigint,
  p_motivo       text
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
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

  -- Se devuelve el pedido entero, así que se caen todas las propuestas: el
  -- gerente no rechazó una, dijo que ninguna sirve como está.
  update public.cotizaciones
     set propuesta = false
   where solicitud_id = p_solicitud_id and propuesta;

  update public.solicitudes_pedido
     set estado = 'CONFIRMADA', cotizacion_elegida_id = null, propuesta_en = null
   where id = p_solicitud_id;

  perform private.anotar('SOLICITUD', p_solicitud_id, v_estado, 'CONFIRMADA', p_motivo);
end;
$function$;

-- ---------------------------------------------------------------------------
-- El tablero: cuántas se proponen, y el total solo cuando no hay duda
-- ---------------------------------------------------------------------------

/*
  La columna «total» de una tarjeta esperando en la gerencia salía de
  `cotizacion_elegida_id`. Con varias propuestas no hay un total: hay dos o
  tres. Se enseña el de la única propuesta cuando es única, y cuando no, el
  número de propuestas — que es lo que de verdad está pasando con ese pedido.

  Pintar la más barata sería decidir por el gerente en la portada.
*/
create or replace view public.v_compras_tablero as
 SELECT s.id AS solicitud_id,
    s.numero,
    s.titulo,
    s.prioridad,
    s.requerida_para,
    s.destino,
    s.destino_almacen_id,
    s.estado AS estado_solicitud,
    s.creada_en,
    s.solicitante_id,
    COALESCE(pide.nombre, s.solicitante_nombre, per.nombre) AS solicitante,
    COALESCE(pide.cargo, s.solicitante_cargo) AS solicitante_cargo,
    s.registrada_por,
    per.nombre AS registrada_por_nombre,
    o.id AS orden_id,
    o.numero AS orden_numero,
    o.estado AS estado_orden,
    o.condicion_pago,
    o.fecha_pago,
    o.entrega_estimada,
    o.desistio_resolucion,
    COALESCE(prov_o.nombre, prov_c.nombre) AS proveedor,
    COALESCE(o.moneda, cot.moneda) AS moneda,
    COALESCE(o.total, cot.total) AS total,
    COALESCE(o.total_usd, cot.total_usd) AS total_usd,
    COALESCE(o.total_bs, cot.total_bs) AS total_bs,
    ( SELECT count(*) AS count
           FROM cotizaciones c
          WHERE c.solicitud_id = s.id) AS cotizaciones,
    ( SELECT count(*) AS count
           FROM solicitud_renglones r
          WHERE r.solicitud_id = s.id) AS renglones,
        CASE
            WHEN o.fecha_pago IS NOT NULL AND (o.estado = ANY (ARRAY['PAGADA_POR_RECIBIR'::text, 'RECIBIDA_PARCIAL'::text, 'PROVEEDOR_DESISTIO'::text])) THEN CURRENT_DATE - o.fecha_pago
            ELSE NULL::integer
        END AS dias_sin_recibir,
        CASE
            WHEN s.estado = ANY (ARRAY['BORRADOR'::text, 'PEDIDO'::text]) THEN 'PEDIDO'::text
            WHEN s.estado = 'CONFIRMADA'::text THEN 'CONFIRMADA'::text
            WHEN s.estado = 'POR_CONFIRMAR_GERENTE'::text THEN 'GERENTE'::text
            WHEN s.estado = 'CANCELADA'::text THEN 'CANCELADA'::text
            WHEN o.estado = 'CANCELADA'::text THEN 'CANCELADA'::text
            WHEN o.estado = 'PROVEEDOR_DESISTIO'::text THEN 'DESISTIO'::text
            WHEN o.estado = ANY (ARRAY['POR_RECIBIR'::text, 'POR_INDICAR_PAGO'::text, 'EN_TESORERIA'::text]) THEN 'APROBADA'::text
            WHEN o.estado = ANY (ARRAY['PAGADA_POR_RECIBIR'::text, 'RECIBIDA_PARCIAL'::text]) THEN 'PAGADA'::text
            WHEN o.estado = 'RECIBIDA'::text THEN 'RECIBIDA'::text
            WHEN o.id IS NOT NULL THEN 'APROBADA'::text
            ELSE 'PEDIDO'::text
        END AS columna,
    /*
      Va al final y no junto a `cotizaciones`, que es donde se leeria mejor.
      `create or replace view` no deja meter una columna en medio: solo
      anadirlas detras. Cambiarlo de sitio costaria un `drop view`, y esta
      vista la leen tres pantallas.
    */
    ( SELECT count(*) AS count
           FROM cotizaciones c
          WHERE c.solicitud_id = s.id AND c.propuesta) AS propuestas
   FROM solicitudes_pedido s
     LEFT JOIN perfiles per ON per.id = s.registrada_por
     LEFT JOIN perfiles pide ON pide.id = s.solicitante_id
     LEFT JOIN LATERAL ( SELECT oc.id,
            oc.numero,
            oc.solicitud_id,
            oc.cotizacion_id,
            oc.proveedor_id,
            oc.estado,
            oc.moneda,
            oc.tasa,
            oc.tasa_usd,
            oc.subtotal,
            oc.descuento,
            oc.flete,
            oc.iva,
            oc.total,
            oc.total_bs,
            oc.total_usd,
            oc.dias_entrega,
            oc.entrega_estimada,
            oc.creada_por,
            oc.creada_en,
            oc.aprobada_gg_por,
            oc.aprobada_gg_en,
            oc.fecha_pago,
            oc.pagada_en,
            oc.recibida_en,
            oc.desistio_motivo,
            oc.desistio_en,
            oc.desistio_resolucion,
            oc.desistio_resuelto_en,
            oc.desistio_nota,
            oc.motivo_cancelacion,
            oc.cancelada_en,
            oc.condicion_pago
           FROM ordenes_compra oc
          WHERE oc.solicitud_id = s.id
          ORDER BY (oc.estado = 'CANCELADA'::text), oc.id DESC
         LIMIT 1) o ON true
     LEFT JOIN cotizaciones cot
       ON cot.id = COALESCE(
            s.cotizacion_elegida_id,
            -- `min(id) ... having count(*) = 1` no devuelve fila cuando hay
            -- varias, que es exactamente lo que se quiere: sin total.
            ( SELECT min(p.id)
                FROM cotizaciones p
               WHERE p.solicitud_id = s.id AND p.propuesta
              HAVING count(*) = 1))
     LEFT JOIN proveedores prov_o ON prov_o.id = o.proveedor_id
     LEFT JOIN proveedores prov_c ON prov_c.id = cot.proveedor_id;

/*
  COMPROBAR DESPUÉS DE APLICARLA

    -- La restricción se fue y el marbete está
    select conname from pg_constraint
     where conrelid = 'public.cotizaciones'::regclass and contype = 'u';

    -- Una sola aprobar_compra, y anon fuera
    select p.oid::regprocedure::text,
           has_function_privilege('anon', p.oid, 'execute') as la_tiene_anon
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('aprobar_compra', 'retirar_cotizacion');

    -- El pedido que estaba en la gerencia sigue teniendo qué aprobar
    select s.numero, s.estado, count(*) filter (where c.propuesta) as propuestas
      from public.solicitudes_pedido s
      left join public.cotizaciones c on c.solicitud_id = s.id
     where s.estado = 'POR_CONFIRMAR_GERENTE'
     group by s.numero, s.estado;
*/
