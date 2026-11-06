/*
  FLUJO NUEVO DE COMPRAS · FASE 1
  LAS ÓRDENES LAS APRUEBA NORBELIS, Y AL APROBAR DECIDE SI SE PAGAN

  Angélica, 06/11/2026:
  - «compras cotiza y coloca el método y los datos del pago, aprueban, al momento
    de aprobar se va a escoger tipo check, si se pagará o no (como se tiene en
    MGG tesorería) acá se manejará en compras, con sus respectivos msj de
    WhatsApp, norbelis podrá poner si se pagará o no lo solicitado, al marcar que
    sí se pagará, se colocará que esa orden ya fue pagada».
  - «el módulo de tesorería en este sistema no se va a vincular».
  - «que diga órdenes pendientes por aprobar sin el título de gerente general».
  - Las OC las aprueba solo el usuario de NORBELIS.

  QUÉ CAMBIA

  1. Quién aprueba no es un rol: es una lista de personas, `compras_aprobadores`,
     que hoy tiene una sola, Norbelis. Va por persona y no por rol porque ella
     también es ADMIN, y el rol de gerente general lo tienen seis usuarios: con
     un rol, aprobaría cualquiera de ellos. La base lo exige al nacer la orden
     (`trg_orden_la_aprueba_quien_aprueba`), así que ninguna puerta —ni la
     función vieja `aprobar_compra` llamada a mano— se lo salta. Las compras
     directas no pasan por aprobación y siguen igual.

  2. El método de pago se dice ANTES de aprobar, al proponer la cotización
     (`proponer_cotizacion_con_pago`): método, moneda, datos del beneficiario y
     si el proveedor entrega factura o nota. Queda en la cotización, porque la
     orden todavía no existe.

  3. Al aprobar (`aprobar_orden_de_compra`) Norbelis contesta «¿Se pagará?»:
       - Sí  → la orden queda PAGADA dentro de Compras. Sin cuenta y sin
               movimiento de Tesorería: Tesorería no se vincula.
       - No  → queda aprobada y por pagar, con el motivo. Más tarde puede
               marcarla pagada (`decidir_pago_de_orden`).
     Contra entrega no pregunta: se paga lo que llegue, después de recibir, con
     la misma `decidir_pago_de_orden`. El pago con productos tampoco: sigue su
     propio camino, el de «Pagar con material».

  Lo que no se toca: las cotizaciones, la recepción, el pago con material, la
  compra directa y el histórico.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Quién aprueba
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.compras_aprobadores (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  desde      timestamptz not null default now(),
  nota       text
);

comment on table public.compras_aprobadores is
  'Las personas que aprueban órdenes de compra. Por persona y no por rol: el rol de gerente general y el de administrador lo tienen varios.';

alter table public.compras_aprobadores enable row level security;
revoke all on public.compras_aprobadores from anon;
grant select on public.compras_aprobadores to authenticated;

drop policy if exists compras_aprobadores_lectura on public.compras_aprobadores;
create policy compras_aprobadores_lectura on public.compras_aprobadores
  for select to authenticated using (true);

drop trigger if exists trg_auditar on public.compras_aprobadores;
create trigger trg_auditar
  after insert or delete or update on public.compras_aprobadores
  for each row execute function private.auditar('usuario_id');

insert into public.compras_aprobadores (usuario_id, nota)
select p.id, 'Única persona que aprueba las órdenes de compra (Angélica, 06/11/2026).'
  from public.perfiles p
 where p.usuario = 'norbelis835'
on conflict (usuario_id) do nothing;

create or replace function private.es_aprobador_de_compras()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.compras_aprobadores a where a.usuario_id = (select auth.uid())
  );
$$;

create or replace function private.exigir_aprobador_de_compras()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_quien text;
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelva a entrar.' using errcode = '28000';
  end if;

  if private.es_aprobador_de_compras() then
    return;
  end if;

  select string_agg(p.nombre, ' o ' order by p.nombre) into v_quien
    from public.compras_aprobadores a
    join public.perfiles p on p.id = a.usuario_id;

  raise exception 'Las órdenes de compra solo las aprueba %.',
    coalesce(v_quien, 'la persona designada, y no hay ninguna cargada')
    using errcode = '42501';
end;
$$;

-- Para que la pantalla sepa si enseña los botones de aprobar y pagar.
create or replace function public.soy_aprobador_de_compras()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.es_aprobador_de_compras();
$$;

grant execute on function public.soy_aprobador_de_compras() to authenticated;

-- La orden de compra nace al aprobar. Que nazca solo de la mano de quien
-- aprueba, venga por la puerta que venga. Las compras directas no se aprueban.
create or replace function private.la_orden_la_aprueba_quien_aprueba()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_directa boolean;
begin
  select coalesce(s.directa, false) into v_directa
    from public.solicitudes_pedido s
   where s.id = new.solicitud_id;

  if not coalesce(v_directa, false) then
    perform private.exigir_aprobador_de_compras();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orden_la_aprueba_quien_aprueba on public.ordenes_compra;
create trigger trg_orden_la_aprueba_quien_aprueba
  before insert on public.ordenes_compra
  for each row execute function private.la_orden_la_aprueba_quien_aprueba();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. El pago se dice al proponer
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cotizaciones
  add column if not exists pago_metodo       text,
  add column if not exists pago_moneda       text,
  add column if not exists pago_datos        jsonb not null default '{}'::jsonb,
  add column if not exists pago_igtf         boolean,
  add column if not exists pago_comprobante  text,
  add column if not exists pago_nota         text,
  add column if not exists pago_indicado_por uuid references auth.users(id),
  add column if not exists pago_indicado_en  timestamptz;

alter table public.cotizaciones drop constraint if exists cotizaciones_pago_comprobante_check;
alter table public.cotizaciones add constraint cotizaciones_pago_comprobante_check
  check (pago_comprobante is null or pago_comprobante in ('NOTA_ENTREGA', 'FACTURA'));

comment on column public.cotizaciones.pago_metodo is
  'Cómo se le paga al proveedor si se aprueba esta cotización. Lo dice Compras al proponerla; al aprobar pasa a la orden.';

alter table public.ordenes_compra
  add column if not exists no_pago_motivo        text,
  add column if not exists no_pago_en            timestamptz,
  add column if not exists no_pago_por           uuid references auth.users(id),
  add column if not exists pagada_en_compras_por uuid references auth.users(id);

comment on column public.ordenes_compra.no_pago_motivo is
  'Por qué quien aprueba dijo que no se pagará todavía. Se borra al marcarla pagada.';
comment on column public.ordenes_compra.pagada_en_compras_por is
  'Quién la marcó pagada en Compras. Tesorería no se vincula: no hay movimiento de cuenta detrás.';

create or replace function public.proponer_cotizacion_con_pago(
  p_solicitud_id bigint,
  p_cotizacion_id bigint,
  p_metodo text,
  p_moneda text,
  p_datos jsonb default '{}'::jsonb,
  p_comprobante text default null,
  p_igtf boolean default null,
  p_nota text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cot    public.cotizaciones;
  v_m      public.metodos_pago;
  v_moneda text := upper(btrim(coalesce(p_moneda, '')));
  v_datos  jsonb := coalesce(p_datos, '{}'::jsonb);
  v_campo  text;
  v_faltan text[] := '{}';
begin
  perform private.exigir_rol('COMPRAS');

  select c.* into v_cot
    from public.cotizaciones c
   where c.id = p_cotizacion_id and c.solicitud_id = p_solicitud_id;

  if v_cot.id is null then
    raise exception 'Esa cotización no pertenece a este pedido.' using errcode = '22023';
  end if;

  if p_comprobante is null or p_comprobante not in ('NOTA_ENTREGA', 'FACTURA') then
    raise exception 'Indique con qué entrega el proveedor: nota de entrega o factura.'
      using errcode = '22023';
  end if;

  select m.* into v_m from public.metodos_pago m where m.codigo = p_metodo;

  if v_m.codigo is null or not v_m.activo or v_m.codigo = 'SALDO_A_FAVOR' then
    raise exception 'Elija cómo se le paga al proveedor.' using errcode = '22023';
  end if;

  if v_m.codigo = 'INTERCAMBIO' then
    -- Con productos: no hay banco ni titular. Se registra después con «Pagar
    -- con material», que manda la salida al almacén.
    v_moneda := v_cot.moneda;
    v_datos := '{}'::jsonb;
  else
    -- La casa paga en la moneda de la cotización o en bolívares a su tasa, que
    -- es la única conversión exacta sin la tasa del día de otra divisa.
    if v_moneda = '' or (v_moneda <> btrim(v_cot.moneda) and v_moneda <> 'VES') then
      raise exception 'El pago va en % (la moneda de la cotización) o en bolívares.', btrim(v_cot.moneda)
        using errcode = '22023';
    end if;

    if v_m.moneda_regla = 'SOLO_VES' and v_moneda <> 'VES' then
      raise exception '% solo funciona en bolívares.', v_m.nombre using errcode = '22023';
    end if;

    if v_m.moneda_regla = 'NUNCA_VES' and v_moneda = 'VES' then
      raise exception '% no funciona en bolívares.', v_m.nombre using errcode = '22023';
    end if;

    foreach v_campo in array v_m.campos_exigidos loop
      if nullif(btrim(coalesce(v_datos ->> v_campo, '')), '') is null then
        v_faltan := v_faltan || v_campo;
      end if;
    end loop;

    if array_length(v_faltan, 1) > 0 then
      raise exception 'Para pagar por % faltan estos datos: %.',
        v_m.nombre, array_to_string(v_faltan, ', ') using errcode = '23514';
    end if;
  end if;

  update public.cotizaciones
     set pago_metodo       = v_m.codigo,
         pago_moneda       = v_moneda,
         pago_datos        = v_datos,
         pago_igtf         = case when v_m.codigo = 'INTERCAMBIO' then false else p_igtf end,
         pago_comprobante  = p_comprobante,
         pago_nota         = nullif(btrim(coalesce(p_nota, '')), ''),
         pago_indicado_por = (select auth.uid()),
         pago_indicado_en  = now()
   where id = v_cot.id;

  -- Si ya estaba propuesta, `proponer_cotizacion` no hace nada: el cambio de
  -- pago tiene que quedar en la bitácora y avisarle a quien aprueba. La
  -- aprobación, además, exige el `pago_indicado_en` que vio (ver
  -- `aprobar_orden_de_compra`), así que no se aprueba un pago que no vio.
  if v_cot.propuesta and v_cot.pago_metodo is not null then
    perform private.anotar('SOLICITUD', p_solicitud_id, 'POR_CONFIRMAR_GERENTE', 'POR_CONFIRMAR_GERENTE',
      format('Compras cambió el pago de %s', v_cot.numero));
  end if;

  perform public.proponer_cotizacion(p_solicitud_id, p_cotizacion_id, p_nota);
end;
$$;

grant execute on function public.proponer_cotizacion_con_pago(bigint, bigint, text, text, jsonb, text, boolean, text) to authenticated;

-- Con la orden creada, el pago de su cotización es el que se aprobó: ya no se
-- cambia, venga de donde venga el update.
create or replace function private.el_pago_aprobado_no_se_cambia()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.pago_metodo, new.pago_moneda, new.pago_datos, new.pago_igtf,
      new.pago_comprobante, new.pago_nota, new.pago_indicado_en)
     is distinct from
     (old.pago_metodo, old.pago_moneda, old.pago_datos, old.pago_igtf,
      old.pago_comprobante, old.pago_nota, old.pago_indicado_en)
     and exists (select 1 from public.ordenes_compra o where o.cotizacion_id = new.id) then
    raise exception 'La cotización % ya tiene orden de compra: el pago que se aprobó no se cambia.', new.numero
      using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_el_pago_aprobado_no_se_cambia on public.cotizaciones;
create trigger trg_el_pago_aprobado_no_se_cambia
  before update on public.cotizaciones
  for each row execute function private.el_pago_aprobado_no_se_cambia();

-- ¿Esta instrucción es exactamente el pago que Compras propuso y se aprobó?
-- Mismo método, moneda y beneficiario. `indicar_pago` guarda los datos sin
-- espacios y con vacío como nulo; aquí se compara igual.
create or replace function private.instruccion_es_la_propuesta(i public.instrucciones_pago, c public.cotizaciones)
returns boolean
language sql
stable
set search_path = ''
as $$
  select i.metodo = c.pago_metodo
     and btrim(i.moneda) = btrim(c.pago_moneda)
     and coalesce(i.banco, '')          = btrim(coalesce(c.pago_datos ->> 'banco', ''))
     and coalesce(i.numero_cuenta, '')  = btrim(coalesce(c.pago_datos ->> 'numero_cuenta', ''))
     and coalesce(i.titular, '')        = btrim(coalesce(c.pago_datos ->> 'titular', ''))
     and coalesce(i.documento, '')      = btrim(coalesce(c.pago_datos ->> 'documento', ''))
     and coalesce(i.telefono, '')       = btrim(coalesce(c.pago_datos ->> 'telefono', ''))
     and coalesce(i.correo_binance, '') = btrim(coalesce(c.pago_datos ->> 'correo_binance', ''))
     and coalesce(i.red_cripto, '')     = btrim(coalesce(c.pago_datos ->> 'red_cripto', ''))
     and coalesce(i.receptor, '')       = btrim(coalesce(c.pago_datos ->> 'receptor', ''));
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. ¿Se pagará?
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function private.decidir_pago(
  p_orden_id bigint,
  p_se_paga boolean,
  p_motivo text default null,
  p_referencia text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o            public.ordenes_compra;
  v_cot          public.cotizaciones;
  v_comprometido numeric;
  v_pendiente    numeric;
  v_monto        numeric;
  v_nuevo        text;
  v_motivo       text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_ref          text := nullif(btrim(coalesce(p_referencia, '')), '');
  v_i            record;
begin
  if p_se_paga is null then
    raise exception 'Diga si la orden se pagará o no.' using errcode = '22023';
  end if;

  select o.* into v_o from public.ordenes_compra o where o.id = p_orden_id for update;

  if v_o.id is null then
    raise exception 'No existe la orden %.', p_orden_id using errcode = 'P0002';
  end if;

  if v_o.estado not in ('POR_INDICAR_PAGO', 'EN_TESORERIA', 'RECIBIDA_PARCIAL', 'RECIBIDA') then
    raise exception 'La orden % está en "%" y no tiene un pago por decidir.', v_o.numero, v_o.estado
      using errcode = '55000';
  end if;

  if not p_se_paga then
    if v_motivo is null or length(v_motivo) < 5 then
      raise exception 'Escriba por qué no se pagará todavía.' using errcode = '22023';
    end if;

    update public.ordenes_compra
       set no_pago_motivo = v_motivo,
           no_pago_en     = now(),
           no_pago_por    = (select auth.uid())
     where id = p_orden_id;

    perform private.anotar('ORDEN', p_orden_id, v_o.estado, 'NO_PAGADA', v_motivo);
    return;
  end if;

  select c.* into v_cot from public.cotizaciones c where c.id = v_o.cotizacion_id;

  -- «Sí» paga lo que se aprobó y nada más. Si alguien dejó por su cuenta una
  -- instrucción en dinero con otro método o beneficiario, no se da por pagada
  -- a ciegas: primero se devuelve.
  if exists (select 1
               from public.instrucciones_pago i
               join public.metodos_pago m on m.codigo = i.metodo and m.mueve_dinero
              where i.orden_id = p_orden_id
                and i.estado = 'POR_PAGAR'
                and private.instruccion_es_la_propuesta(i, v_cot) is not true) then
    raise exception 'La orden % tiene una instrucción de pago pendiente que no es la que propuso Compras. Hay que devolverla antes de marcar la orden pagada.', v_o.numero
      using errcode = '55000';
  end if;

  -- Lo que todavía no tiene instrucción se instruye con lo que Compras dijo al
  -- proponer. Contra entrega, solo lo que ya llegó: eso lo cuida el tope.
  select coalesce(sum(case when i.moneda = v_o.moneda then i.monto
                           else round(i.monto * i.tasa / nullif(v_o.tasa, 0), 6) end), 0)
    into v_comprometido
    from public.instrucciones_pago i
   where i.orden_id = p_orden_id and i.estado in ('POR_PAGAR', 'PAGADA');

  v_pendiente := round(private.tope_pagable(p_orden_id) - v_comprometido, 2);

  if v_pendiente > 0.01 then
    if v_cot.pago_metodo is null then
      raise exception 'Compras no indicó cómo se paga la orden %.', v_o.numero using errcode = '55000';
    end if;

    if v_cot.pago_metodo = 'INTERCAMBIO' then
      raise exception 'La orden % se paga con productos: se registra con «Pagar con material».', v_o.numero
        using errcode = '55000';
    end if;

    if v_o.comprobante_tipo is null then
      update public.ordenes_compra set comprobante_tipo = v_cot.pago_comprobante where id = p_orden_id;
    end if;

    v_monto := case when v_cot.pago_moneda = btrim(v_o.moneda) then v_pendiente
                    else round(v_pendiente * v_o.tasa, 2) end;

    perform public.indicar_pago(
      p_orden_id, v_cot.pago_metodo, v_cot.pago_moneda::bpchar, v_monto,
      v_cot.pago_datos, v_cot.pago_nota, v_cot.pago_igtf);
  end if;

  -- Sí se paga: lo instruido en dinero queda pagado. Sin cuenta y sin
  -- movimiento: Tesorería no se vincula.
  for v_i in
    update public.instrucciones_pago i
       set estado     = 'PAGADA',
           referencia = coalesce(v_ref, i.referencia, 'PAGADA EN COMPRAS'),
           fecha_pago = current_date,
           pagada_por = (select auth.uid()),
           pagada_en  = now()
     where i.orden_id = p_orden_id
       and i.estado = 'POR_PAGAR'
       and exists (select 1 from public.metodos_pago m where m.codigo = i.metodo and m.mueve_dinero)
       and private.instruccion_es_la_propuesta(i, v_cot)
    returning i.id
  loop
    perform private.anotar('PAGO', v_i.id, 'POR_PAGAR', 'PAGADA', 'Pagada en Compras');
  end loop;

  select o.estado into v_o.estado from public.ordenes_compra o where o.id = p_orden_id;

  -- Si ya llegó material (contra entrega), el estado lo decide lo recibido;
  -- si no, queda pagada y esperando el material.
  v_nuevo := case
               when exists (select 1 from public.orden_renglones r
                             where r.orden_id = p_orden_id and r.cantidad_recibida > 0)
                 then private.estado_tras_recepcion(p_orden_id)
               else 'PAGADA_POR_RECIBIR'
             end;

  update public.ordenes_compra
     set estado                = v_nuevo,
         fecha_pago            = current_date,
         pagada_en             = now(),
         pagada_en_compras_por = (select auth.uid()),
         no_pago_motivo        = null,
         no_pago_en            = null,
         no_pago_por           = null
   where id = p_orden_id;

  perform private.anotar('ORDEN', p_orden_id, v_o.estado, v_nuevo,
    concat_ws(' · ', 'Pagada en Compras', v_ref));
end;
$$;

create or replace function public.decidir_pago_de_orden(
  p_orden_id bigint,
  p_se_paga boolean,
  p_motivo text default null,
  p_referencia text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_aprobador_de_compras();
  perform private.decidir_pago(p_orden_id, p_se_paga, p_motivo, p_referencia);
end;
$$;

grant execute on function public.decidir_pago_de_orden(bigint, boolean, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Aprobar y decidir el pago, en un solo paso
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
  v_orden bigint;
  v_cot   public.cotizaciones;
  v_cond  text;
begin
  perform private.exigir_aprobador_de_compras();

  -- La aprobación de siempre: escoge la cotización, crea la orden y sus
  -- renglones, firma y bitácora.
  v_orden := public.aprobar_compra(p_solicitud_id, p_cotizacion_id, p_nota, p_con_firma);

  -- `for update`: si Compras está cambiando el pago en este momento, o espera
  -- a que esto termine (y entonces el trigger ve la orden y lo frena), o
  -- terminó antes (y entonces `pago_indicado_en` ya no coincide).
  select c.* into v_cot
    from public.cotizaciones c
    join public.ordenes_compra o on o.cotizacion_id = c.id
   where o.id = v_orden
     for update of c;

  if v_cot.pago_metodo is null then
    raise exception 'Compras tiene que indicar cómo se paga antes de aprobar: método, datos del beneficiario y si entrega factura o nota.'
      using errcode = '55000';
  end if;

  -- Se aprueba el pago que quien aprueba vio en pantalla, no otro.
  if p_pago_visto is null or v_cot.pago_indicado_en is distinct from p_pago_visto then
    raise exception 'Compras cambió el pago de esta propuesta mientras usted la revisaba. Recargue la página y revíselo antes de aprobar.'
      using errcode = '55000';
  end if;

  update public.ordenes_compra
     set comprobante_tipo = v_cot.pago_comprobante
   where id = v_orden and comprobante_tipo is null;

  select o.condicion_pago into v_cond from public.ordenes_compra o where o.id = v_orden;

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
-- 5. Los avisos ya no hablan de la gerencia
--
-- La misma `anotar` de siempre; cambian dos textos.
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
