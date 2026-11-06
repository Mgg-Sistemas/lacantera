/*
  FLUJO NUEVO DE COMPRAS · FASE 4
  LA COMPRA SE RECIBE EN EL ALMACÉN GENERAL Y SE MARCA FINALIZADA

  Angélica, 06/11/2026: «Luego de todo ese proceso, se recepciona la OC en
  inventario general. Y luego se marca como finalizada la orden».

  QUÉ CAMBIA
  1. Las órdenes del flujo nuevo se reciben en ALM-GEN. La base lo exige en
     `registrar_recepcion`; la compra directa sigue entrando donde diga.
  2. Con la orden RECIBIDA (llegó todo; y por las reglas de cada condición,
     también está pagada), Compras la marca FINALIZADA (`finalizar_compra`). La
     solicitud pasa a FINALIZADA: la misma columna «Finalizada» del tablero.
  3. El aviso de FINALIZADA distingue la compra cerrada de la que atendió el
     almacén sin comprar nada.
  4. Corrección a la fase 2: si después se rechaza una salida vieja del almacén,
     una compra ya finalizada CON orden no vuelve a «Pedido»; solo queda dicho.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Quién la finalizó
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.solicitudes_pedido
  add column if not exists finalizada_por  uuid references auth.users(id),
  add column if not exists finalizada_nota text;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Recibir en el almacén general
--
-- La `registrar_recepcion` de la fase 3 con una comprobación más.
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
  v_directa   boolean;
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

  select o.estado, o.condicion_pago, o.moneda, o.tasa, o.tasa_usd, coalesce(s.directa, false)
    into v_estado, v_cond, v_moneda, v_tasa, v_tasa_usd, v_directa
  from public.ordenes_compra o
  join public.solicitudes_pedido s on s.id = o.solicitud_id
  where o.id = p_orden_id;

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

  -- Fase 4: lo que se compra por el flujo de compras entra al almacén general.
  -- De ahí se traslada o se entrega a donde haga falta.
  if not v_directa and p_almacen_id is distinct from private.almacen_que_revisa_pedidos() then
    raise exception 'Las órdenes de compra se reciben en el almacén general (ALM-GEN). De ahí se trasladan a donde hagan falta.'
      using errcode = '22023';
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
-- 3. Marcar la compra finalizada
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.finalizar_compra(p_id bigint, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s    public.solicitudes_pedido;
  v_o    public.ordenes_compra;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  perform private.exigir_rol('COMPRAS');

  select s.* into v_s from public.solicitudes_pedido s where s.id = p_id for update;

  if v_s.id is null then
    raise exception 'No existe el pedido %.', p_id using errcode = 'P0002';
  end if;

  if v_s.estado <> 'APROBADA' then
    raise exception 'El pedido % está en "%": solo se finaliza una compra aprobada y recibida.', v_s.numero, v_s.estado
      using errcode = '55000';
  end if;

  select o.* into v_o
    from public.ordenes_compra o
   where o.solicitud_id = p_id and o.estado <> 'CANCELADA'
   order by o.id desc
   limit 1;

  if v_o.id is null or v_o.estado <> 'RECIBIDA' then
    raise exception 'La compra se finaliza cuando llegó todo el material. La orden % está en "%".',
      coalesce(v_o.numero, '—'), coalesce(v_o.estado, 'sin orden')
      using errcode = '55000';
  end if;

  update public.solicitudes_pedido
     set estado          = 'FINALIZADA',
         finalizada_en   = now(),
         finalizada_por  = (select auth.uid()),
         finalizada_nota = v_nota
   where id = p_id;

  perform private.anotar('SOLICITUD', p_id, 'APROBADA', 'FINALIZADA',
    concat_ws(' · ', format('Orden %s recibida completa', v_o.numero), v_nota));
end;
$$;

revoke all on function public.finalizar_compra(bigint, text) from public, anon;
grant execute on function public.finalizar_compra(bigint, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Corrección a la fase 2: la salida rechazada no reabre una compra cerrada
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function private.la_salida_rechazada_vuelve_a_compras()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s        public.solicitudes_pedido;
  v_linea    integer;
  v_nota     text;
  v_con_oc   boolean;
begin
  if new.estado not in ('RECHAZADA', 'CANCELADA') or old.estado in ('RECHAZADA', 'CANCELADA') then
    return new;
  end if;

  for v_s in
    select s.* from public.solicitudes_pedido s
     where s.salida_almacen_numero = new.numero and s.historico_en is null
     for update
  loop
    v_nota := format('La solicitud de salida %s se %s: el almacén no lo entregó y vuelve a compras',
                     new.numero, case new.estado when 'RECHAZADA' then 'rechazó' else 'canceló' end);
    v_con_oc := exists (select 1 from public.ordenes_compra o where o.solicitud_id = v_s.id);

    if v_s.estado = 'FINALIZADA' and not v_con_oc then
      -- La atendió entera el almacén y no llegó a salir: vuelve a Compras.
      update public.solicitudes_pedido set estado = 'PEDIDO', finalizada_en = null where id = v_s.id;
    elsif v_s.estado in ('PEDIDO', 'CONFIRMADA', 'POR_CONFIRMAR_GERENTE') then
      select coalesce(max(r.linea), 0) into v_linea from public.solicitud_renglones r where r.solicitud_id = v_s.id;

      insert into public.solicitud_renglones (solicitud_id, linea, articulo_id, descripcion, cantidad, unidad, observacion)
      select v_s.id, v_linea + row_number() over (order by a.linea, a.id), null,
             a.descripcion, a.cantidad_entregada, a.unidad,
             format('Volvió de la salida %s', new.numero)
        from public.solicitud_atendido_almacen a
       where a.solicitud_id = v_s.id and a.salida_numero = new.numero and a.sin_salida_en is null;
    else
      v_nota := v_nota || format(' (la compra ya está en «%s»: hay que pedirlo aparte)', v_s.estado);
    end if;

    update public.solicitud_atendido_almacen
       set sin_salida_en = now(), sin_salida_por = new.estado
     where solicitud_id = v_s.id and salida_numero = new.numero and sin_salida_en is null;

    perform private.anotar('SOLICITUD', v_s.id, v_s.estado, 'SALIDA_RECHAZADA', v_nota);
  end loop;

  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Los avisos: «Compra finalizada»
--
-- La `anotar` de la fase 2; el aviso de FINALIZADA dice cuál de las dos es.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function private.anotar(p_tipo text, p_id bigint, p_ant text, p_nuevo text, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
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
    when 'REVISION_ALMACEN' then
      v_aviso := 'Pedido por revisar en el almacén general';
      v_roles := array['ALMACEN'];
      v_importancia := 'ATENCION';

    when 'PEDIDO' then
      v_aviso := 'Nuevo pedido de compra';
      v_roles := array['COMPRAS'];

    when 'CONFIRMADA' then
      v_aviso := 'Pedido confirmado: hay que cotizar';
      v_roles := array['COMPRAS'];

    when 'POR_CONFIRMAR_GERENTE' then
      v_aviso := 'Orden pendiente por aprobar';
      v_roles := array['GERENTE_GENERAL'];
      v_importancia := 'ATENCION';

    when 'APROBADA' then
      v_aviso := 'Orden de compra aprobada';
      v_roles := array['COMPRAS'];

    when 'POR_INDICAR_PAGO' then
      v_aviso := 'Orden de compra sin método de pago';
      v_roles := array['COMPRAS'];

    when 'EN_TESORERIA' then
      v_aviso := 'Orden aprobada por pagar';
      v_roles := array['COMPRAS'];
      v_importancia := 'ATENCION';

    when 'PAGADA_POR_RECIBIR' then
      v_aviso := 'Compra pagada: pendiente por recepcionar';
      v_roles := array['ALMACEN', 'COMPRAS'];

    when 'RECIBIDA' then
      v_aviso := 'Material recibido completo: falta marcar la compra finalizada';
      v_roles := array['COMPRAS'];

    when 'RECIBIDA_PARCIAL' then
      v_aviso := 'Material recibido en parte';
      v_roles := array['COMPRAS'];

    when 'FINALIZADA' then
      v_aviso := case when v_proveedor is null
                      then 'Pedido atendido por el almacén general: finalizado'
                      else 'Compra finalizada' end;
      v_roles := array['COMPRAS'];

    when 'SALIDA_RECHAZADA' then
      v_aviso := 'El almacén no entregó: la salida no se aprobó y vuelve a compras';
      v_roles := array['COMPRAS', 'ALMACEN'];
      v_importancia := 'ATENCION';

    when 'CANCELADA' then
      v_aviso := 'Compra cancelada';
      v_roles := array['COMPRAS', 'GERENTE_GENERAL'];

    when 'PROVEEDOR_DESISTIO' then
      v_aviso := 'El proveedor desistió: hay dinero pagado sin material';
      v_roles := array['GERENTE_GENERAL', 'COMPRAS'];
      v_importancia := 'URGENTE';

    when 'DEVUELTA' then
      v_aviso := 'El pago volvió a compras';
      v_roles := array['COMPRAS'];
      v_importancia := 'ATENCION';

    when 'NO_PAGADA' then
      v_aviso := 'Orden aprobada que no se pagará todavía';
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
