/*
  FLUJO NUEVO DE COMPRAS · FASE 3
  LAS COMPRAS A CRÉDITO QUEDAN EN CUENTA ABIERTA

  Angélica, 06/11/2026: «también puede existir la opción de cuentas a crédito».
  Y en el flujo: «Crédito → Cuenta abierta».

  HASTA HOY una orden a crédito (15, 30 o 60 días) se trataba como de contado:
  al aprobar se preguntaba «¿Se pagará?», y el material no se podía recibir
  hasta pagarla. Eso es justo lo contrario de un crédito.

  QUÉ CAMBIA
  1. Al aprobar una orden a crédito no se pregunta «¿Se pagará?»: queda en
     CUENTA ABIERTA (la columna nueva del tablero) con su vencimiento,
     `credito_vence` = el día de la aprobación + los días del crédito.
  2. El material se recibe sin esperar el pago, igual que contra entrega.
     Mientras no esté pagada, la orden sigue en Cuenta abierta aunque ya haya
     llegado material.
  3. Se marca pagada cuando toque, con el mismo «¿Se pagará?» de la fase 1. Al
     pagarla, si ya llegó todo, queda Recibida; si no, Pagada por recibir.

  No hay estado nuevo en la orden: «cuenta abierta» es una orden a crédito que
  todavía no está pagada (POR_INDICAR_PAGO o EN_TESORERIA). Lo calcula la vista.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. El vencimiento
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.ordenes_compra
  add column if not exists credito_vence date;

comment on column public.ordenes_compra.credito_vence is
  'Orden a crédito: hasta cuándo hay para pagarla. Día de la aprobación + los días del crédito.';

create or replace function private.dias_de_credito(p_condicion text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_condicion
           when 'CREDITO_15' then 15
           when 'CREDITO_30' then 30
           when 'CREDITO_60' then 60
         end;
$$;

-- La orden hereda la condición de la cotización (como siempre) y, si es a
-- crédito, nace con su vencimiento.
create or replace function private.orden_hereda_condicion()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_condicion text;
begin
  select condicion_pago into v_condicion
    from public.cotizaciones where id = new.cotizacion_id;

  if v_condicion is not null then
    new.condicion_pago := v_condicion;
  end if;

  if new.condicion_pago = 'CONTRA_ENTREGA' and new.estado = 'POR_INDICAR_PAGO' then
    new.estado := 'POR_RECIBIR';
  end if;

  if private.dias_de_credito(new.condicion_pago) is not null and new.credito_vence is null then
    new.credito_vence := current_date + private.dias_de_credito(new.condicion_pago);
  end if;

  return new;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Aprobar a crédito: sin «¿Se pagará?»
--
-- La `aprobar_orden_de_compra` de la fase 1; el crédito se suma a contra
-- entrega y al pago con productos entre los que no preguntan.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.aprobar_orden_de_compra(
  p_solicitud_id bigint,
  p_cotizacion_id bigint default null,
  p_con_firma boolean default true,
  p_nota text default null,
  p_se_paga boolean default null,
  p_motivo text default null,
  p_referencia text default null,
  p_pago_visto timestamptz default null
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orden  bigint;
  v_cot    public.cotizaciones;
  v_cond   text;
  v_vence  date;
begin
  perform private.exigir_aprobador_de_compras();

  v_orden := public.aprobar_compra(p_solicitud_id, p_cotizacion_id, p_nota, p_con_firma);

  select c.* into v_cot
    from public.cotizaciones c
    join public.ordenes_compra o on o.cotizacion_id = c.id
   where o.id = v_orden
     for update of c;

  if v_cot.pago_metodo is null then
    raise exception 'Compras tiene que indicar cómo se paga antes de aprobar: método, datos del beneficiario y si entrega factura o nota.'
      using errcode = '55000';
  end if;

  if p_pago_visto is null or v_cot.pago_indicado_en is distinct from p_pago_visto then
    raise exception 'Compras cambió el pago de esta propuesta mientras usted la revisaba. Recargue la página y revíselo antes de aprobar.'
      using errcode = '55000';
  end if;

  update public.ordenes_compra
     set comprobante_tipo = v_cot.pago_comprobante
   where id = v_orden and comprobante_tipo is null;

  select o.condicion_pago, o.credito_vence into v_cond, v_vence
    from public.ordenes_compra o where o.id = v_orden;

  -- A crédito: cuenta abierta. Se recibe cuando llegue y se paga al vencer.
  if private.dias_de_credito(v_cond) is not null then
    perform private.anotar('ORDEN', v_orden, 'POR_INDICAR_PAGO', 'CUENTA_ABIERTA',
      format('A crédito: vence el %s', to_char(v_vence, 'DD/MM/YYYY')));
    return v_orden;
  end if;

  -- Contra entrega se paga después de recibir; con productos, por su camino.
  if v_cond = 'CONTRA_ENTREGA' or v_cot.pago_metodo = 'INTERCAMBIO' then
    return v_orden;
  end if;

  perform private.decidir_pago(v_orden, p_se_paga, p_motivo, p_referencia);

  return v_orden;
end;
$$;

grant execute on function public.aprobar_orden_de_compra(bigint, bigint, boolean, text, boolean, text, text, timestamptz) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Después de recibir: a crédito, mientras no esté pagada, sigue abierta
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function private.estado_tras_recepcion(p_orden_id bigint)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_o         public.ordenes_compra;
  v_pendiente numeric;
  v_tope      numeric;
  v_instruido numeric;
begin
  select o.* into v_o from public.ordenes_compra o where o.id = p_orden_id;

  select coalesce(sum(cantidad - cantidad_recibida), 0)
    into v_pendiente
  from public.orden_renglones where orden_id = p_orden_id;

  -- A crédito: el material puede llegar antes que el pago. Mientras lo
  -- instruido no cubra el total, la orden sigue por pagar (cuenta abierta).
  if private.dias_de_credito(v_o.condicion_pago) is not null then
    select coalesce(sum(case when i.moneda = v_o.moneda then i.monto
                             else round(i.monto * i.tasa / nullif(v_o.tasa, 0), 6) end), 0)
      into v_instruido
      from public.instrucciones_pago i
     where i.orden_id = p_orden_id and i.estado in ('POR_PAGAR', 'PAGADA');

    if v_o.total - v_instruido > 0.01 then
      return 'POR_INDICAR_PAGO';
    end if;

    if exists (select 1 from public.instrucciones_pago i
                where i.orden_id = p_orden_id and i.estado = 'POR_PAGAR') then
      return 'EN_TESORERIA';
    end if;

    return case when v_pendiente <= 0.0001 then 'RECIBIDA' else 'RECIBIDA_PARCIAL' end;
  end if;

  -- En cualquier condicion que no sea contra entrega el dinero ya salio antes
  -- de recibir, asi que lo unico que decide es si falta material.
  if coalesce(v_o.condicion_pago, '') <> 'CONTRA_ENTREGA' then
    return case when v_pendiente <= 0.0001 then 'RECIBIDA' else 'RECIBIDA_PARCIAL' end;
  end if;

  -- Contra entrega se paga lo que llega, asi que hay dos frentes abiertos a la
  -- vez: lo que falta por llegar y lo que falta por pagar de lo que ya llego.
  v_tope := private.tope_pagable(p_orden_id);

  select coalesce(sum(i.monto), 0) into v_instruido
  from public.instrucciones_pago i
  where i.orden_id = p_orden_id and i.estado in ('POR_PAGAR', 'PAGADA');

  if v_tope - v_instruido > 0.01 then
    return 'POR_INDICAR_PAGO';
  end if;

  return case when v_pendiente <= 0.0001 then 'RECIBIDA' else 'RECIBIDA_PARCIAL' end;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Recibir a crédito sin haber pagado
--
-- La `registrar_recepcion` de siempre, palabra por palabra salvo una: el
-- crédito admite los mismos estados que contra entrega.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.registrar_recepcion(
  p_orden_id bigint,
  p_almacen_id bigint,
  p_renglones jsonb,
  p_nota text default null,
  p_fecha date default null
) returns integer
language plpgsql
security definer
set search_path = ''
as $function$
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

  -- Sin factura ni nota de entrega, el material no entra. El comprobante de
  -- pago NO cuenta: dice que se pagó, no que llegó ni qué llegó.
  if not exists (
    select 1 from public.compras_papeles p
     where p.orden_id = p_orden_id
       and p.tipo in ('FACTURA', 'NOTA_ENTREGA')
  ) then
    raise exception 'Falta el papel del proveedor: sin factura o nota de entrega el material no entra.'
      using errcode = '22023',
            hint = 'Súbala en «Papeles» de esta compra. El comprobante de pago puede esperar.';
  end if;

  -- Contra entrega y crédito admiten recibir sin haber pagado: el material
  -- llega antes que el dinero.
  if v_cond = 'CONTRA_ENTREGA' or private.dias_de_credito(v_cond) is not null then
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
    raise exception 'Indique qué llegó y en qué cantidad.' using errcode = '22023';
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

    -- Solo entra al libro lo que es inventariable.
    if v_renglon.articulo_id is not null
       and exists (select 1 from public.articulos
                   where id = v_renglon.articulo_id and inventariable) then

      v_costo_usd := round(v_renglon.precio_unitario * v_tasa / v_tasa_usd, 6);

      -- La misma reja de costo que la entrada: un precio que se sale diez
      -- veces de lo que el artículo viene costando se para, salvo que el
      -- renglón venga confirmado.
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
                    hint = 'Si el precio de la orden esta mal, corríjalo en la orden antes de recibir: aqui solo se acepta o se para.';
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. El tablero: «Cuenta abierta»
--
-- Una columna más (CREDITO) y el vencimiento al final de la vista.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_compras_todas
with (security_invoker = on)
as
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
           FROM public.cotizaciones c
          WHERE c.solicitud_id = s.id) AS cotizaciones,
    ( SELECT count(*) AS count
           FROM public.solicitud_renglones r
          WHERE r.solicitud_id = s.id) AS renglones,
        CASE
            WHEN o.fecha_pago IS NOT NULL AND (o.estado = ANY (ARRAY['PAGADA_POR_RECIBIR'::text, 'RECIBIDA_PARCIAL'::text, 'PROVEEDOR_DESISTIO'::text])) THEN CURRENT_DATE - o.fecha_pago
            ELSE NULL::integer
        END AS dias_sin_recibir,
        CASE
            WHEN s.estado = 'REVISION_ALMACEN'::text THEN 'REVISION'::text
            WHEN s.estado = 'FINALIZADA'::text THEN 'FINALIZADA'::text
            WHEN s.estado = ANY (ARRAY['BORRADOR'::text, 'PEDIDO'::text]) THEN 'PEDIDO'::text
            WHEN s.estado = 'CONFIRMADA'::text THEN 'CONFIRMADA'::text
            WHEN s.estado = 'POR_CONFIRMAR_GERENTE'::text THEN 'GERENTE'::text
            WHEN s.estado = 'CANCELADA'::text THEN 'CANCELADA'::text
            WHEN o.estado = 'CANCELADA'::text THEN 'CANCELADA'::text
            WHEN o.estado = 'PROVEEDOR_DESISTIO'::text THEN 'DESISTIO'::text
            WHEN o.condicion_pago = ANY (ARRAY['CREDITO_15'::text, 'CREDITO_30'::text, 'CREDITO_60'::text])
             AND o.estado = ANY (ARRAY['POR_INDICAR_PAGO'::text, 'EN_TESORERIA'::text]) THEN 'CREDITO'::text
            WHEN o.estado = ANY (ARRAY['POR_RECIBIR'::text, 'POR_INDICAR_PAGO'::text, 'EN_TESORERIA'::text]) THEN 'APROBADA'::text
            WHEN o.estado = ANY (ARRAY['PAGADA_POR_RECIBIR'::text, 'RECIBIDA_PARCIAL'::text]) THEN 'PAGADA'::text
            WHEN o.estado = 'RECIBIDA'::text THEN 'RECIBIDA'::text
            WHEN o.id IS NOT NULL THEN 'APROBADA'::text
            ELSE 'PEDIDO'::text
        END AS columna,
    ( SELECT count(*) AS count
           FROM public.cotizaciones c
          WHERE c.solicitud_id = s.id AND c.propuesta) AS propuestas,
    s.historico_en,
    s.historico_columna,
    s.historico_nota,
    o.credito_vence
   FROM public.solicitudes_pedido s
     LEFT JOIN public.perfiles per ON per.id = s.registrada_por
     LEFT JOIN public.perfiles pide ON pide.id = s.solicitante_id
     LEFT JOIN LATERAL ( SELECT oc.id,
            oc.numero,
            oc.proveedor_id,
            oc.estado,
            oc.moneda,
            oc.total,
            oc.total_bs,
            oc.total_usd,
            oc.entrega_estimada,
            oc.fecha_pago,
            oc.desistio_resolucion,
            oc.condicion_pago,
            oc.credito_vence
           FROM public.ordenes_compra oc
          WHERE oc.solicitud_id = s.id
          ORDER BY (oc.estado = 'CANCELADA'::text), oc.id DESC
         LIMIT 1) o ON true
     LEFT JOIN public.cotizaciones cot ON cot.id = COALESCE(s.cotizacion_elegida_id, ( SELECT min(p.id) AS min
           FROM public.cotizaciones p
          WHERE p.solicitud_id = s.id AND p.propuesta
         HAVING count(*) = 1))
     LEFT JOIN public.proveedores prov_o ON prov_o.id = o.proveedor_id
     LEFT JOIN public.proveedores prov_c ON prov_c.id = cot.proveedor_id;

create or replace view public.v_compras_tablero
with (security_invoker = on)
as
 SELECT solicitud_id,
    numero,
    titulo,
    prioridad,
    requerida_para,
    destino,
    destino_almacen_id,
    estado_solicitud,
    creada_en,
    solicitante_id,
    solicitante,
    solicitante_cargo,
    registrada_por,
    registrada_por_nombre,
    orden_id,
    orden_numero,
    estado_orden,
    condicion_pago,
    fecha_pago,
    entrega_estimada,
    desistio_resolucion,
    proveedor,
    moneda,
    total,
    total_usd,
    total_bs,
    cotizaciones,
    renglones,
    dias_sin_recibir,
    columna,
    propuestas,
    credito_vence
   FROM public.v_compras_todas
  WHERE historico_en IS NULL;
