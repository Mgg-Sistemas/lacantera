/*
  LA COMPRA DIRECTA: LO QUE YA SE COMPRÓ, CON SU FACTURA.

  ————————————————————————————————————————————————————————————————————————
  SIN APLICAR TODAVÍA, pero ya comprobada contra el catálogo el 31 de agosto.
  Esa comprobación encontró dos cosas que la habrían tumbado en la primera
  compra, y están corregidas aquí — ver «LO QUE SE CORRIGIÓ AL COMPROBARLA».
  ————————————————————————————————————————————————————————————————————————

  LO QUE SE CORRIGIÓ AL COMPROBARLA

  1. `recepciones` NO EXISTE. `editar_compra_directa` preguntaba por esa tabla
     para saber si la compra ya había entrado al almacén. Lo recibido vive en
     `orden_renglones.cantidad_recibida` y en `inventario_movimientos`.

  2. LA COMPRA DIRECTA NO PUEDE RECIBIR DENTRO DE SU PROPIA TRANSACCIÓN, y las
     dos guardas que lo impiden son correctas:

       a) `registrar_recepcion` exige factura o nota de entrega colgada antes de
          dejar entrar el material. Los papeles cuelgan de la orden, y aquí la
          orden acaba de nacer: la factura no puede estar todavía.

       b) Exige que la orden esté en POR_RECIBIR, PAGADA_POR_RECIBIR o
          RECIBIDA_PARCIAL. El `estado` de `ordenes_compra` nace por omisión en
          POR_INDICAR_PAGO, que no está en esa lista.

     El arreglo no es saltárselas. La guarda del papel existe por algo —«sin
     factura o nota de entrega el material no entra»— y una compra directa es
     justo el caso en que la persona tiene la factura en la mano. Lo que cambia
     es el orden: crear la compra, colgar la factura, y entonces recibir. La
     pantalla exige la factura cuando se marca «entra al almacén ahora», y llama
     a `registrar_recepcion` después de colgarla.

     Así que `p_recibir_en_almacen` desaparece de esta función.

  QUÉ ES, SEGÚN LO EXPLICÓ LA LÍDER

  «Colocan los materiales con los precios y cargan la factura, al darle
  aceptar, pueden editarla, y además darle recepción al inventario de una vez.»

  Eso no es un pedido. Un pedido pregunta; esto declara. Cuando alguien vuelve
  del pueblo con dos cajas de guantes y su factura, no hay nada que cotizar ni
  a quién proponérselo: la compra ya ocurrió y lo único que falta es que el
  sistema se entere, valorice el inventario y guarde el papel para el IVA.

  POR QUÉ NO ES UN CAMINO NUEVO SINO EL MISMO, RECORRIDO DE UNA VEZ

  La tentación es hacer una tabla aparte, `compras_directas`, con su propio
  todo. Sería empezar de cero: la recepción, el pago, el libro de compras, el
  costo promedio del almacén y el crédito fiscal cuelgan todos de
  `ordenes_compra`. Una compra directa que no fuera una orden se quedaría fuera
  del libro de compras — que es exactamente el sitio donde el SENIAT la busca.

  Así que `comprar_directo` recorre la misma escalera en una sola transacción:
  crea la solicitud, la cotización con los precios de la factura y la orden. De
  ahí en adelante todo lo que ya existe funciona sin tocarlo. La diferencia se
  guarda en `solicitudes_pedido.directa`, que es lo que permite distinguirlas
  al mirar el tablero sin inventarse un estado nuevo.

  QUÉ LA FRENA

  Solo el permiso, por decisión de Christopher: «solo el permiso, sin tope».
  Quien tenga `COMPRAS.COMPRA_DIRECTA` la hace por cualquier monto, y queda en
  la auditoría quién la hizo y por cuánto. Un tope se puede añadir después sin
  tocar nada de esto — sería una comprobación más en esta misma función— pero
  hoy el control es a quién se le da la casilla.

  EL ESTADO CON EL QUE NACE LA ORDEN

  No el de omisión. Una compra directa ya ocurrió, así que el papel no está
  esperando a que alguien indique un pago antes de que llegue el material: o se
  pagó en el acto —y entonces está pagada y por recibir— o se debe, y entonces
  el material puede entrar igual porque ya está aquí.

  Se deja en PAGADA_POR_RECIBIR cuando la condición es CONTADO, y en
  POR_RECIBIR en los demás casos. Las dos admiten recepción, que es lo que hace
  falta para que la pantalla pueda recibir justo después.
*/

alter table public.solicitudes_pedido
  add column if not exists directa boolean not null default false;

comment on column public.solicitudes_pedido.directa is
  'La compra ya estaba hecha cuando se cargó: no pasó por cotizaciones ni por el gerente.';

-- Buscar las directas es lo que hace el tablero al filtrarlas; el parcial deja
-- fuera del índice todo lo que no se pregunta.
create index if not exists solicitudes_directas_idx
  on public.solicitudes_pedido (creada_en desc)
  where directa;

/*
  La casilla. `nivel_equivalente` va nulo a propósito: ningún escalón de
  permiso la abre sola. Comprar sin que nadie lo apruebe no es «escritura en
  compras» — es una autoridad aparte, y se tiene marcándola.
*/
insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente, activa)
values (
  'COMPRAS.COMPRA_DIRECTA',
  'COMPRAS',
  'Hacer una compra directa',
  'Cargar una compra ya hecha, con su factura, sin cotizaciones ni aprobación del gerente.',
  95,
  null,
  true
)
on conflict (codigo) do update
  set nombre = excluded.nombre,
      dice   = excluded.dice,
      activa = true;

create or replace function public.comprar_directo(
  p_proveedor_id        bigint,
  p_moneda              text,
  p_renglones           jsonb,
  p_titulo              text,
  p_justificacion       text default null,
  p_numero_factura      text default null,
  p_fecha               date default null,
  p_condicion_pago      text default 'CONTADO',
  p_alicuota_iva        numeric default 16,
  p_descuento           numeric default 0,
  p_flete               numeric default 0,
  p_observacion         text default null,
  p_destino_almacen_id  bigint default null
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
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

  /*
    La solicitud nace aprobada. No es un atajo: el estado dice en qué punto del
    camino está el papel, y este llegó con el camino andado. Dejarla en
    CONFIRMADA la pondría en la bandeja de compras esperando cotizaciones que
    nunca van a llegar.
  */
  insert into public.solicitudes_pedido
    (numero, titulo, justificacion, prioridad, estado, directa,
     destino, destino_almacen_id, registrada_por, solicitante_id,
     enviada_en, propuesta_en, aprobada_gg_por, aprobada_gg_en)
  values
    (private.siguiente_numero('SOL'), trim(p_titulo),
     nullif(trim(coalesce(p_justificacion, '')), ''), 'NORMAL', 'APROBADA', true,
     v_destino, p_destino_almacen_id, v_yo, v_yo,
     now(), now(), v_yo, now())
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

  -- El disparador de totales ya recalculó la cotización al insertar sus
  -- renglones, así que aquí sus cifras están puestas y se pueden copiar.
  /*
    El estado se pone a mano y no se deja en el de omision.

    `ordenes_compra.estado` nace en POR_INDICAR_PAGO, que `registrar_recepcion`
    NO admite: el circuito normal supone que primero se paga y luego llega el
    material. En una compra directa el material ya esta aqui, asi que ese orden
    no aplica.

    CONTADO se pago en el acto: PAGADA_POR_RECIBIR. Lo demas se debe todavia,
    pero el material puede entrar igual: POR_RECIBIR. Las dos admiten
    recepcion, que es lo que permite que la pantalla reciba justo despues de
    colgar la factura.
  */
  insert into public.ordenes_compra
    (numero, solicitud_id, cotizacion_id, proveedor_id, moneda, tasa, tasa_usd,
     subtotal, descuento, flete, iva, total, dias_entrega, entrega_estimada,
     creada_por, aprobada_gg_por, aprobada_gg_en, condicion_pago, estado)
  select private.siguiente_numero('OC'), v_solicitud, c.id, c.proveedor_id,
         c.moneda, c.tasa, c.tasa_usd,
         c.subtotal, c.descuento, c.flete, c.iva, c.total,
         0, v_fecha,
         v_yo, v_yo, now(), c.condicion_pago,
         case when c.condicion_pago = 'CONTADO'
              then 'PAGADA_POR_RECIBIR' else 'POR_RECIBIR' end
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
  perform private.anotar('ORDEN', v_orden, null, 'POR_INDICAR_PAGO', p_numero_factura);

  /*
    Aquí no se recibe. La pantalla cuelga la factura y llama a
    `registrar_recepcion` después, porque esa función exige el papel del
    proveedor antes de dejar entrar nada — y en este punto la orden acaba de
    nacer y todavía no tiene papeles.

    Se probó al revés primero y habría fallado en la primera compra.
  */
  return v_orden;
end;
$function$;

revoke all on function public.comprar_directo(
  bigint, text, jsonb, text, text, text, date, text, numeric, numeric, numeric, text, bigint
) from public, anon;
grant execute on function public.comprar_directo(
  bigint, text, jsonb, text, text, text, date, text, numeric, numeric, numeric, text, bigint
) to authenticated, service_role;

/*
  RECIBIR LA ORDEN ENTERA, SIN CONOCER SUS RENGLONES.

  `registrar_recepcion` pide la lista de qué llegó y en qué cantidad, con el id
  de cada renglón de la orden. Eso está bien para una recepción parcial, que es
  el caso normal: llega media orden y hay que decir qué media.

  Pero quien acaba de cargar una compra directa no tiene esos ids —los acaba de
  crear la base, dentro de la misma llamada— y tendría que volver a preguntar
  por ellos solo para devolvérselos. Peor: en una compra directa el material ya
  está entero, así que no hay nada que elegir.

  Esto arma la lista aquí y llama a la de siempre. No duplica ni una
  comprobación: la del papel del proveedor, la del estado, la del almacén y la
  de no recibir de más siguen siendo las de `registrar_recepcion`.

  Sirve igual fuera de la compra directa, para el botón de «recibir todo lo que
  falta» de una orden normal.
*/
create or replace function public.recibir_orden_completa(
  p_orden_id   bigint,
  p_almacen_id bigint,
  p_nota       text default null,
  p_fecha      date default null
) returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_renglones jsonb;
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

  return public.registrar_recepcion(
    p_orden_id, p_almacen_id, v_renglones, p_nota, p_fecha);
end;
$function$;

revoke all on function public.recibir_orden_completa(bigint, bigint, text, date)
  from public, anon;
grant execute on function public.recibir_orden_completa(bigint, bigint, text, date)
  to authenticated, service_role;

/*
  CORREGIRLA. «Al darle aceptar, pueden editarla.»

  Mientras no se haya recibido ni pagado nada. Después no: los renglones de una
  orden recibida ya movieron existencias y costo promedio, y corregirlos por
  detrás dejaría el almacén diciendo una cosa y el papel otra.

  Rehace la cotización y la orden enteras en vez de ir campo por campo. Es lo
  mismo que hace `actualizar_cotizacion`, y por la misma razón: los renglones
  pueden haber cambiado de número, no solo de contenido.
*/
create or replace function public.editar_compra_directa(
  p_orden_id       bigint,
  p_proveedor_id   bigint,
  p_moneda         text,
  p_renglones      jsonb,
  p_titulo         text,
  p_justificacion  text default null,
  p_numero_factura text default null,
  p_fecha          date default null,
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

  /*
    No hay tabla `recepciones` — se comprobó contra el catálogo—. Lo recibido
    vive en `orden_renglones.cantidad_recibida`, que es lo que va sumando
    `registrar_recepcion` a medida que llega el material.
  */
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
         justificacion = nullif(trim(coalesce(p_justificacion, '')), '')
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

revoke all on function public.editar_compra_directa(
  bigint, bigint, text, jsonb, text, text, text, date, text, numeric, numeric, numeric, text
) from public, anon;
grant execute on function public.editar_compra_directa(
  bigint, bigint, text, jsonb, text, text, text, date, text, numeric, numeric, numeric, text
) to authenticated, service_role;

/*
  COMPROBAR DESPUÉS DE APLICARLA

    -- La columna, el índice y la casilla
    select column_name from information_schema.columns
     where table_schema='public' and table_name='solicitudes_pedido' and column_name='directa';
    select codigo, activa, nivel_equivalente from public.acciones
     where codigo = 'COMPRAS.COMPRA_DIRECTA';

    -- Una sola de cada función, y anon fuera
    select p.oid::regprocedure::text,
           has_function_privilege('anon', p.oid, 'execute') as la_tiene_anon
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('comprar_directo', 'editar_compra_directa');

    -- Los nombres YA se comprobaron el 31 de agosto: las catorce columnas de
    -- `solicitudes_pedido` existen, `instrucciones_pago` existe, y
    -- `recepciones` NO —de ahí la corrección—.

    -- Y un ensayo entero, deshecho:
    --   begin;
    --   set local role authenticated;
    --   select set_config('request.jwt.claims', '{"sub":"…","role":"authenticated"}', true);
    --   select public.comprar_directo(…);
    --   rollback;
*/
