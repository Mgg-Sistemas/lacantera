-- ---------------------------------------------------------------------------
-- Ninguna orden se paga sin decir con qué entregó el proveedor
--
-- LO QUE PASABA, Y NO ERA UNA CARENCIA DE PANTALLA
--
-- El sistema nunca preguntaba. Tres órdenes pagadas y `facturas_compra` vacía:
--
--   OC-2026-0004  pagada   ·  0 facturas registradas
--   OC-2026-0005  pagada   ·  0 facturas registradas
--   OC-2026-0006  pagada   ·  0 facturas registradas
--
-- El dinero salía sin que nadie hubiera dicho si el proveedor entregó con nota
-- de entrega o con factura. Y esa distinción no es papeleo: **la factura es la
-- que da derecho al crédito fiscal y la que va al libro de compras**. Una
-- compra pagada cuya factura nunca se registró es IVA soportado que la empresa
-- pagó y no puede descontar.
--
-- La tabla estaba lista desde el principio —número de control, exento, base
-- imponible, alícuota— y vacía porque el flujo no llevaba a ella.
--
-- POR QUÉ AQUÍ Y NO AL RECIBIR
--
-- Al recibir todavía puede no saberse: en contado y crédito se paga antes de
-- que llegue el material, y el papel viene después. Lo que sí se sabe siempre
-- al instruir un pago es qué se pactó. Por eso el freno está en
-- `indicar_pago`, que es el punto donde el dinero deja de ser reversible.
--
-- QUÉ NO HACE ESTO, A PROPÓSITO
--
-- No exige que la factura esté cargada para pagar. Sería incorrecto: en contado
-- y crédito el pago va antes que el papel, y bloquearlo pararía compras
-- legítimas. Lo que exige es **declarar qué va a respaldar la compra**; que la
-- factura declarada acabe registrada es un pendiente visible, no un candado.
--
-- Y no calcula retenciones. La cantera es contribuyente ordinario, no agente de
-- retención designado: no tiene esa obligación. Las columnas
-- `retencion_iva` y `retencion_islr` de `facturas_compra` se quedan donde están
-- por si algún día cambia la condición, en cero mientras tanto.
-- ---------------------------------------------------------------------------
alter table public.ordenes_compra
  add column if not exists comprobante_tipo text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ordenes_compra_comprobante_tipo_check') then
    alter table public.ordenes_compra
      add constraint ordenes_compra_comprobante_tipo_check
      check (comprobante_tipo is null or comprobante_tipo in ('NOTA_ENTREGA', 'FACTURA'));
  end if;
end $$;

comment on column public.ordenes_compra.comprobante_tipo is
  'Con qué respalda el proveedor esta compra: NOTA_ENTREGA o FACTURA. Nulo '
  'significa que todavía nadie lo declaró, y sin declararlo no se puede '
  'instruir el pago. Solo la factura da crédito fiscal y entra al libro de '
  'compras.';

-- ---------------------------------------------------------------------------
create or replace function public.declarar_comprobante(p_orden_id bigint, p_tipo text)
returns void
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  v_estado text;
  v_previo text;
begin
  perform private.exigir_rol('COMPRAS');

  if coalesce(p_tipo, '') not in ('NOTA_ENTREGA', 'FACTURA') then
    raise exception 'Indica si el proveedor entrega con nota de entrega o con factura.'
      using errcode = '22023';
  end if;

  select estado, comprobante_tipo into v_estado, v_previo
  from public.ordenes_compra where id = p_orden_id;

  if v_estado is null then
    raise exception 'No existe la orden %.', p_orden_id using errcode = 'P0002';
  end if;

  if v_estado in ('CANCELADA', 'PROVEEDOR_DESISTIO') then
    raise exception 'Esta orden está en "%" y ya no se le cambia el comprobante.', v_estado
      using errcode = '55000';
  end if;

  -- Cambiar de FACTURA a NOTA_ENTREGA con la factura ya cargada dejaría un
  -- documento fiscal colgando de una compra que dice no tenerlo.
  if v_previo = 'FACTURA' and p_tipo = 'NOTA_ENTREGA'
     and exists (select 1 from public.facturas_compra f
                  where f.orden_id = p_orden_id and f.estado <> 'ANULADA') then
    raise exception 'Esta orden ya tiene una factura registrada. Anúlala antes de decir que se entregó con nota de entrega.'
      using errcode = '55000';
  end if;

  update public.ordenes_compra
     set comprobante_tipo = p_tipo
   where id = p_orden_id;

  if coalesce(v_previo, '') <> p_tipo then
    perform private.anotar('ORDEN', p_orden_id, v_previo, p_tipo,
      'Comprobante del proveedor');
  end if;
end;
$function$;

comment on function public.declarar_comprobante is
  'Deja constancia de con qué respalda el proveedor una compra. Se puede '
  'declarar en cualquier momento antes de instruir el pago, que es donde se '
  'exige.';

revoke execute on function public.declarar_comprobante(bigint, text) from public, anon;
grant  execute on function public.declarar_comprobante(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Y el freno, en el punto donde el dinero deja de ser reversible
--
-- La firma no cambia: se añade una comprobación dentro. Cambiarla obligaría a
-- borrar y recrear la función —PostgREST resuelve por nombre de argumento— y a
-- tocar el front en el mismo movimiento, sin ganar nada.
-- ---------------------------------------------------------------------------
create or replace function public.indicar_pago(
  p_orden_id bigint,
  p_metodo   text,
  p_moneda   character,
  p_monto    numeric,
  p_datos    jsonb default '{}'::jsonb,
  p_nota     text default null,
  p_igtf     boolean default null
)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
        round(v_tope, 2), v_moneda, round(v_pagado, 2) using errcode = '22023';
    else
      raise exception 'Con esta instruccion se pagaria mas que el total de la orden (% %). Ya hay % instruido.',
        round(v_total, 2), v_moneda, round(v_pagado, 2) using errcode = '22023';
    end if;
  end if;

  insert into public.instrucciones_pago
    (orden_id, metodo, moneda, monto, tasa, tasa_usd,
     igtf_aplica,
     banco, numero_cuenta, titular, documento, telefono, correo_binance, red_cripto, receptor,
     nota, creada_por)
  values
    (p_orden_id, p_metodo, p_moneda, p_monto, v_tasa, v_tasa_usd,
     -- Se propone por la moneda, pero decide quien registra la operacion.
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

-- ---------------------------------------------------------------------------
-- Lo que quedó pendiente de las que ya se pagaron
--
-- Las tres que se pagaron sin declarar nada se quedan en nulo a propósito: no
-- se sabe qué entregó el proveedor y ponerlo a ojo sería inventar un dato
-- fiscal. Quedan visibles como lo que son —compras sin respaldo declarado— y
-- las corrige quien lo sepa desde la pantalla.
-- ---------------------------------------------------------------------------
create or replace view public.v_compras_sin_respaldo as
select o.id,
       o.numero,
       o.estado,
       o.condicion_pago,
       o.comprobante_tipo,
       p.nombre as proveedor,
       o.total,
       o.moneda,
       exists (select 1 from public.facturas_compra f
                where f.orden_id = o.id and f.estado <> 'ANULADA') as tiene_factura,
       case
         when o.comprobante_tipo is null then 'SIN_DECLARAR'
         when o.comprobante_tipo = 'FACTURA'
              and not exists (select 1 from public.facturas_compra f
                               where f.orden_id = o.id and f.estado <> 'ANULADA')
           then 'FACTURA_SIN_CARGAR'
       end as falta
  from public.ordenes_compra o
  join public.proveedores p on p.id = o.proveedor_id
 -- Solo se excluye la cancelada: esa compra no ocurrió. La desistida sí
   -- entra, porque puede haber material recibido y dinero pagado.
 where o.estado <> 'CANCELADA'
   and (o.comprobante_tipo is null
        or (o.comprobante_tipo = 'FACTURA'
            and not exists (select 1 from public.facturas_compra f
                             where f.orden_id = o.id and f.estado <> 'ANULADA')));

alter view public.v_compras_sin_respaldo set (security_invoker = on);

comment on view public.v_compras_sin_respaldo is
  'Compras a las que les falta el respaldo del proveedor: o nadie declaró con '
  'qué entrega, o se declaró factura y no se ha cargado. Cada una es crédito '
  'fiscal que la empresa no puede descontar.';

grant select on public.v_compras_sin_respaldo to authenticated;
