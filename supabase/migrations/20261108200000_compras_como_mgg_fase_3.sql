/*
  COMPRAS COMO MGG · FASE 3
  APROBACIÓN Y PAGO, DENTRO DE COMPRAS (SIN TESORERÍA)

  Angélica, 07/11/2026: el módulo de compras se reemplaza por una copia exacta
  del de MGG, por fases. La fase 2 dejó la OC «Ordenes pendiente por aprobar».
  Esta fase la lleva hasta «Pendiente por recepción»:

    oc_creada ──✔ Aprobar OC (individual o «📋 OC por lote»)──►
      contra_entrega → por_recibir
      credito        → cuenta_abierta  (abonos, documento y retenciones)
      el resto       → confirmada_metodo ──💳 Indicar método de pago──►
                       oc_aprobada («Confirmada pagar») ──💵 Marcar pagada──►
                       por_recibir (o «pagada» si ya estaba recibida: contra entrega)

  LO QUE CAMBIA RESPECTO A MGG (decisiones de la dueña)

  1. NO HAY TESORERÍA. En MGG el pago lo hace Tesorería con cajas, egresos y
     el «¿Se pagará?»; los abonos de los créditos, en «Cuentas por pagar». Aquí
     todo pasa en Compras: «💵 Marcar pagada» (fecha, referencia, monto y el
     comprobante, que se puede subir o no) y «💵 Registrar abono». No se mueve
     ninguna caja: queda el registro y su trazabilidad.

  2. LAS RETENCIONES SE RESTAN SIEMPRE. En MGG se elige retener «antes» (baja
     lo que paga Tesorería) o «después» (paga completo y luego Retenciones). Aquí
     no hay módulo de Retenciones: con Factura se indican IVA, ISLR, IGTF e ISAE,
     cada una en % o en monto, y se descuentan:
         monto a pagar = total − descuento en el pago − Σ retenciones
     Las bases del %: IVA sobre el IVA de la OC; ISLR e ISAE sobre la base
     imponible (subtotal − descuento, sin IVA); IGTF sobre el total. Con Nota de
     entrega no hay retenciones. Si la OC cambia de total antes de pagarse, las
     retenciones en % se recalculan solas (disparador `trg_retenciones_al_dia`).

  3. DATOS DE PAGO DEL PROVEEDOR CON VARIAS CUENTAS. MGG guarda una por método
     (`proveedor_datos_pago`, upsert por proveedor y método). Aquí una por
     cuenta (proveedor, método y la cuenta/teléfono/correo), para poder elegir
     entre varias o agregar otra desde el modal.

  4. SIN DELIVERY. «🛵 ¿Quién entrega?» no se pregunta.

  5. EL CRÉDITO VA A RECEPCIÓN SIN ESTAR SALDADO. En MGG «📦 Enviar a Pendiente
     por recepción» exige el crédito saldado. Aquí se puede antes (la dueña):
     la orden sigue siendo a crédito y los abonos se siguen registrando
     mientras haya saldo, también en «por_recibir» o «recibida».

  6. QUIÉN: aprobar la OC y pagar o abonar, `private.compras_aprueba_oc()`
     (Compras en total, un aprobador de compras o ADMIN). Indicar o corregir el
     método, el documento y las retenciones, y mandar el crédito a recepción,
     `private.compras_gestiona()` (MGG `canManageProcurement`).

  7. «⊘ Anular OC» ya no anula una OC pagada ni un crédito con abonos, aunque
     esté en «Pendiente por recepción» (en MGG solo llegaba ahí sin pagar).
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Columnas nuevas
-- ═══════════════════════════════════════════════════════════════════════════

-- El pago registrado en Compras (MGG lo escribe Tesorería con la caja).
alter table public.compras_ordenes
  add column if not exists pago_fecha              date,
  add column if not exists pago_referencia         text,
  add column if not exists pago_monto              numeric(14, 2),
  add column if not exists pago_moneda             text,
  add column if not exists pago_tasa               numeric(14, 4),
  add column if not exists pago_monto_usd          numeric(14, 2),
  add column if not exists pago_comprobante_path   text,
  add column if not exists pago_comprobante_nombre text,
  add column if not exists pago_nota               text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'compras_ordenes_pago_moneda_check') then
    alter table public.compras_ordenes
      add constraint compras_ordenes_pago_moneda_check check (pago_moneda in ('USD', 'Bs', 'USDT'));
  end if;
end $$;

comment on column public.compras_ordenes.retenciones is
  'Retenciones indicadas con Factura: [{tipo: IVA|ISLR|IGTF|ISAE, modo: porcentaje|monto, valor, base?, monto}]. Se restan del total: monto a pagar = total − descuento_pago − Σ monto.';
comment on column public.compras_ordenes.metodo_pago is
  'Métodos de pago (MGG): [{metodo, moneda, monto, datos?}]. Con dos o más, cada uno lleva su monto (multipago).';

-- MGG: «📞 Teléfono de administración del proveedor», se carga una vez y
-- queda en la ficha; cada OC guarda su copia (`numero_administracion`).
alter table public.proveedores add column if not exists numero_administracion text;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Datos de pago del proveedor (MGG `proveedor_datos_pago`)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.proveedor_datos_pago (
  id                      bigint generated always as identity primary key,
  proveedor_id            bigint not null references public.proveedores(id) on delete cascade,
  metodo                  text not null check (metodo in ('pago_movil', 'transferencia', 'zelle', 'binance_usdt')),
  -- pago_movil {ci_rif, banco, telefono} · transferencia {nombre, ci, banco, cuenta}
  -- zelle {nombre, email} · binance_usdt {email_o_id}
  datos                   jsonb not null check (jsonb_typeof(datos) = 'object'),
  -- Lo que distingue una cuenta de otra del mismo método: la cuenta, el
  -- teléfono o el correo.
  clave                   text not null,
  actualizado_por         uuid references public.perfiles(id),
  actualizado_por_nombre  text,
  actualizado_en          timestamptz not null default now(),
  constraint proveedor_datos_pago_una_por_cuenta unique (proveedor_id, metodo, clave)
);

comment on table public.proveedor_datos_pago is
  'Dónde pagarle a cada proveedor (MGG proveedor_datos_pago), una fila por cuenta. Se guardan solos al indicar el método de pago de una OC. Solo se escribe por funciones.';

alter table public.proveedor_datos_pago enable row level security;

drop policy if exists proveedor_datos_pago_lectura on public.proveedor_datos_pago;
create policy proveedor_datos_pago_lectura on public.proveedor_datos_pago
  for select to authenticated
  using (private.tiene_permiso('COMPRAS', 'LECTURA'));

revoke all on public.proveedor_datos_pago from anon, public, authenticated;
grant select on public.proveedor_datos_pago to authenticated;

drop trigger if exists trg_auditar on public.proveedor_datos_pago;
create trigger trg_auditar
  after insert or update or delete on public.proveedor_datos_pago
  for each row execute function private.auditar('id');

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Los abonos de un crédito (MGG `abonos_credito`, sin caja)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.compras_abonos (
  id                     bigint generated always as identity primary key,
  orden_id               bigint not null references public.compras_ordenes(id) on delete cascade,
  fecha                  date not null,
  -- En dólares: lo que baja del saldo.
  monto                  numeric(14, 2) not null check (monto > 0),
  -- Lo que se pagó, en su moneda, y la tasa si fue en Bs.
  moneda                 text not null default 'USD' check (moneda in ('USD', 'Bs', 'USDT')),
  monto_moneda           numeric(14, 2) not null check (monto_moneda > 0),
  tasa                   numeric(14, 4),
  metodo                 text not null,
  referencia             text,
  comprobante_path       text,
  comprobante_nombre     text,
  nota                   text,
  saldo_restante         numeric(14, 2),
  registrado_por         uuid not null references public.perfiles(id),
  registrado_por_nombre  text,
  registrado_en          timestamptz not null default now()
);

comment on table public.compras_abonos is
  'Abonos a una OC a crédito (MGG abonos_credito). Sin Tesorería: los registra Compras. Suman compras_ordenes.abonado_total. Solo se escribe por funciones.';

create index if not exists compras_abonos_orden_idx on public.compras_abonos (orden_id, registrado_en);

drop trigger if exists trg_normalizar on public.compras_abonos;
create trigger trg_normalizar
  before insert or update on public.compras_abonos
  for each row execute function private.normalizar_texto('nota');

drop trigger if exists trg_auditar on public.compras_abonos;
create trigger trg_auditar
  after insert or update or delete on public.compras_abonos
  for each row execute function private.auditar('id');

alter table public.compras_abonos enable row level security;

drop policy if exists compras_abonos_lectura on public.compras_abonos;
create policy compras_abonos_lectura on public.compras_abonos
  for select to authenticated
  using (private.tiene_permiso('COMPRAS', 'LECTURA'));

revoke all on public.compras_abonos from anon, public, authenticated;
grant select on public.compras_abonos to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Ayudantes: montos, retenciones, métodos y archivos
-- ═══════════════════════════════════════════════════════════════════════════

/*
  Las bases del pago. El total es lo que se paga: el de la OC o, en contra
  entrega ya recibida, lo recibido (fase 4). El IVA y la base imponible
  (subtotal − descuento, sin IVA) se escalan en la misma proporción.
*/
create or replace function private.compras_bases_pago(
  p public.compras_ordenes,
  out o_total numeric,
  out o_iva numeric,
  out o_base numeric
)
language sql
immutable
set search_path = ''
as $$
  with b as (
    select coalesce(p.total, 0) as t,
           case when p.condiciones_pago = 'contra_entrega' and p.recibido_total is not null
                then p.recibido_total else coalesce(p.total, 0) end as bt
  )
  select round(b.bt, 2),
         round(greatest(coalesce(p.iva, 0), 0) * case when b.t > 0 then b.bt / b.t else 1 end, 2),
         round(greatest(0, private.compras_total_items(p.items)
                           - greatest(coalesce(p.descuento_obtenido, 0), 0)
                           - case when p.iva_incluido then greatest(coalesce(p.iva, 0), 0) else 0 end)
               * case when b.t > 0 then b.bt / b.t else 1 end, 2)
    from b;
$$;

/*
  LAS RETENCIONES, CALCULADAS (MGG `retencionesOc.ts`, con las bases de la
  dueña). p_lista: [{tipo, modo: 'porcentaje'|'monto', valor}]. Un valor vacío
  o en cero es «no retienen». p_estricto falso es el recálculo del disparador:
  no rechaza nada, solo pone los montos al día.
*/
create or replace function private.compras_calcular_retenciones(
  p public.compras_ordenes,
  p_lista jsonb,
  p_estricto boolean default true
) returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_b      record;
  v_x      jsonb;
  v_tipo   text;
  v_modo   text;
  v_valor  numeric;
  v_base   numeric;
  v_monto  numeric;
  v_out    jsonb := '[]'::jsonb;
  v_vistos text[] := '{}';
begin
  if p_lista is null or jsonb_typeof(p_lista) = 'null' then
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(p_lista) <> 'array' then
    raise exception 'Las retenciones van en una lista.' using errcode = '22023';
  end if;

  select * into v_b from private.compras_bases_pago(p);

  for v_x in select * from jsonb_array_elements(p_lista) loop
    v_tipo := upper(btrim(coalesce(v_x ->> 'tipo', '')));
    if v_tipo not in ('IVA', 'ISLR', 'IGTF', 'ISAE') then
      raise exception 'Esa retención no existe (se retiene IVA, ISLR, IGTF o ISAE).' using errcode = '22023';
    end if;
    if v_tipo = any (v_vistos) then
      raise exception 'La retención de % viene dos veces.', v_tipo using errcode = '22023';
    end if;
    v_vistos := v_vistos || v_tipo;

    v_modo := coalesce(nullif(btrim(coalesce(v_x ->> 'modo', '')), ''), 'porcentaje');
    if v_modo = 'pct' then
      v_modo := 'porcentaje';
    end if;
    if v_modo not in ('porcentaje', 'monto') then
      raise exception 'La retención de % va en porcentaje o en monto.', v_tipo using errcode = '22023';
    end if;

    begin
      v_valor := nullif(btrim(coalesce(v_x ->> 'valor', '')), '')::numeric;
    exception when others then
      raise exception 'La retención de % no se entiende.', v_tipo using errcode = '22023';
    end;

    if v_valor is null or v_valor <= 0 then
      continue;
    end if;

    if v_modo = 'porcentaje' and v_valor > 100 then
      if p_estricto then
        raise exception 'El porcentaje de la retención de % no puede pasar de 100.', v_tipo using errcode = '22023';
      end if;
      v_valor := 100;
    end if;

    v_base := case v_tipo when 'IVA' then v_b.o_iva when 'IGTF' then v_b.o_total else v_b.o_base end;

    if p_estricto and v_modo = 'porcentaje' and v_tipo = 'IVA' and coalesce(v_base, 0) <= 0 then
      raise exception 'La OC no tiene IVA: la retención de IVA va en monto o se deja en blanco.' using errcode = '22023';
    end if;

    v_monto := case when v_modo = 'porcentaje'
                    then round(coalesce(v_base, 0) * v_valor / 100, 2)
                    else round(v_valor, 2) end;

    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'tipo', v_tipo,
      'modo', v_modo,
      'valor', v_valor,
      'base', case when v_modo = 'porcentaje' then coalesce(v_base, 0) end,
      'monto', v_monto)));
  end loop;

  return v_out;
end;
$$;

create or replace function private.compras_suma_retenciones(p_retenciones jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(coalesce(sum(coalesce((r ->> 'monto')::numeric, 0)), 0), 2)
    from jsonb_array_elements(case when jsonb_typeof(p_retenciones) = 'array' then p_retenciones else '[]'::jsonb end) r;
$$;

-- Monto a pagar = total (o lo recibido) − descuento en el pago − retenciones.
create or replace function private.compras_monto_a_pagar(p public.compras_ordenes)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(greatest(0, b.o_total
                           - greatest(coalesce(p.descuento_pago, 0), 0)
                           - private.compras_suma_retenciones(p.retenciones)), 2)
    from private.compras_bases_pago(p) b;
$$;

-- Lo que falta por pagar de un crédito.
create or replace function private.compras_saldo_credito(p public.compras_ordenes)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(greatest(0, private.compras_monto_a_pagar(p) - coalesce(p.abonado_total, 0)), 2);
$$;

-- Si cambia el total antes de pagar (editar precios, sincronizar con la
-- cotización, recibir menos), las retenciones en % se ponen al día.
create or replace function private.compras_retenciones_al_dia()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.retenciones := private.compras_calcular_retenciones(new, new.retenciones, false);
  return new;
end;
$$;

drop trigger if exists trg_retenciones_al_dia on public.compras_ordenes;
create trigger trg_retenciones_al_dia
  before update on public.compras_ordenes
  for each row
  when (new.pagada_en is null
        and new.retenciones <> '[]'::jsonb
        and (new.total is distinct from old.total
             or new.iva is distinct from old.iva
             or new.iva_incluido is distinct from old.iva_incluido
             or new.descuento_obtenido is distinct from old.descuento_obtenido
             or new.recibido_total is distinct from old.recibido_total
             or new.items is distinct from old.items))
  execute function private.compras_retenciones_al_dia();

-- MGG `METODOS_PAGO`: etiqueta y moneda de cada método.
create or replace function private.compras_metodo_pago(p_metodo text, out o_label text, out o_moneda text, out o_efectivo boolean)
language sql
immutable
set search_path = ''
as $$
  select m.label, m.moneda, m.efectivo
    from (values
      ('divisas_efectivo', 'Divisas en efectivo', 'USD', true),
      ('efectivo_bs', 'Efectivo (Bs)', 'Bs', true),
      ('transferencia', 'Transferencia', 'Bs', false),
      ('pago_movil', 'Pago móvil', 'Bs', false),
      ('binance_usdt', 'Binance / USDT', 'USDT', false),
      ('zelle', 'Zelle', 'USD', false),
      ('otro', 'Otro', 'USD', false)
    ) as m(codigo, label, moneda, efectivo)
   where m.codigo = p_metodo;
$$;

/*
  Los datos de pago, limpios y validados (MGG `validarDatosPago`). El
  teléfono se guarda siempre en la forma local (0424…), la cuenta en 20
  dígitos. Devuelve también la «clave» de la cuenta.
*/
create or replace function private.compras_limpiar_datos_pago(
  p_metodo text,
  p_datos jsonb,
  out o_datos jsonb,
  out o_clave text
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v      jsonb := coalesce(p_datos, '{}'::jsonb);
  v_ci   text;
  v_tel  text;
  v_cta  text;
  v_nom  text;
  v_mail text;
  v_ban  text;
begin
  if jsonb_typeof(v) <> 'object' then
    raise exception 'Los datos de pago no se entienden.' using errcode = '22023';
  end if;

  v_ban := nullif(btrim(coalesce(v ->> 'banco', '')), '');

  if p_metodo = 'pago_movil' then
    v_ci := upper(regexp_replace(coalesce(v ->> 'ci_rif', ''), '\s', '', 'g'));
    if v_ci !~ '^[VEJPGC]-?[0-9]{5,9}(-?[0-9])?$' then
      raise exception 'La cédula o el RIF no se entienden (V-12345678 / J-12345678-9).' using errcode = '22023';
    end if;
    if v_ban is null then
      raise exception 'Elegí el banco' using errcode = '22023';
    end if;
    v_tel := regexp_replace(coalesce(v ->> 'telefono', ''), '\D', '', 'g');
    if v_tel ~ '^58[0-9]{10}$' then
      v_tel := '0' || substr(v_tel, 3);
    end if;
    if v_tel !~ '^0[0-9]{10}$' then
      raise exception 'El teléfono lleva 11 dígitos: 0414, 0424, 0412, 0416, 0422, 0426 o un fijo 02…' using errcode = '22023';
    end if;
    o_datos := jsonb_build_object('ci_rif', v_ci, 'banco', v_ban, 'telefono', v_tel);
    o_clave := v_tel;

  elsif p_metodo = 'transferencia' then
    v_nom := private.en_mayuscula(nullif(btrim(coalesce(v ->> 'nombre', '')), ''));
    if v_nom is null then
      raise exception 'Indicá el nombre' using errcode = '22023';
    end if;
    v_ci := upper(regexp_replace(coalesce(v ->> 'ci', ''), '\s', '', 'g'));
    if v_ci !~ '^[VEJPGC]-?[0-9]{5,9}(-?[0-9])?$' then
      raise exception 'La cédula o el RIF no se entienden (V-12345678 / J-12345678-9).' using errcode = '22023';
    end if;
    if v_ban is null then
      raise exception 'Elegí el banco' using errcode = '22023';
    end if;
    v_cta := regexp_replace(coalesce(v ->> 'cuenta', ''), '\D', '', 'g');
    if v_cta !~ '^[0-9]{20}$' then
      raise exception 'El número de cuenta lleva 20 dígitos.' using errcode = '22023';
    end if;
    o_datos := jsonb_build_object('nombre', v_nom, 'ci', v_ci, 'banco', v_ban, 'cuenta', v_cta);
    o_clave := v_cta;

  elsif p_metodo = 'zelle' then
    v_nom := private.en_mayuscula(nullif(btrim(coalesce(v ->> 'nombre', '')), ''));
    if v_nom is null then
      raise exception 'Indicá el nombre' using errcode = '22023';
    end if;
    v_mail := lower(btrim(coalesce(v ->> 'email', '')));
    if v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Indicá el correo' using errcode = '22023';
    end if;
    o_datos := jsonb_build_object('nombre', v_nom, 'email', v_mail);
    o_clave := v_mail;

  elsif p_metodo = 'binance_usdt' then
    v_mail := btrim(coalesce(v ->> 'email_o_id', ''));
    if v_mail = '' then
      raise exception 'Indicá el correo o ID de Binance' using errcode = '22023';
    end if;
    o_datos := jsonb_build_object('email_o_id', v_mail);
    o_clave := lower(v_mail);

  else
    raise exception 'Ese método no lleva datos del proveedor.' using errcode = '22023';
  end if;
end;
$$;

-- Guarda (o pone al día) una cuenta del proveedor. Devuelve su id.
create or replace function private.compras_guardar_datos_pago(p_proveedor_id bigint, p_metodo text, p_datos jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_l  record;
  v_id bigint;
begin
  select * into v_l from private.compras_limpiar_datos_pago(p_metodo, p_datos);

  insert into public.proveedor_datos_pago (proveedor_id, metodo, datos, clave, actualizado_por, actualizado_por_nombre)
  values (p_proveedor_id, p_metodo, v_l.o_datos, v_l.o_clave, (select auth.uid()), private.compras_mi_nombre())
  on conflict (proveedor_id, metodo, clave) do update
    set datos = excluded.datos,
        actualizado_por = excluded.actualizado_por,
        actualizado_por_nombre = excluded.actualizado_por_nombre,
        actualizado_en = now()
  returning id into v_id;

  return v_id;
end;
$$;

/*
  LOS MÉTODOS DE PAGO QUE MANDA LA PANTALLA, LIMPIOS (MGG `indicarMetodoPago`).
  [{metodo, monto?, datos?}] → [{metodo, moneda, monto, datos?}]. La moneda la
  dicta el método. Con dos o más, cada uno lleva su monto. Los datos del
  proveedor se validan y, si p_guardar, quedan en su ficha.
*/
create or replace function private.compras_normalizar_metodos(p_metodos jsonb, p_proveedor_id bigint, p_guardar boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_x     jsonb;
  v_m     record;
  v_cod   text;
  v_monto numeric;
  v_dat   record;
  v_out   jsonb := '[]'::jsonb;
  v_leg   jsonb;
begin
  if p_metodos is null or jsonb_typeof(p_metodos) <> 'array' or jsonb_array_length(p_metodos) = 0 then
    raise exception 'Indicá al menos un método de pago.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_metodos) > 6 then
    raise exception 'Hasta 6 métodos de pago por orden.' using errcode = '22023';
  end if;

  for v_x in select * from jsonb_array_elements(p_metodos) loop
    v_cod := btrim(coalesce(v_x ->> 'metodo', ''));
    select * into v_m from private.compras_metodo_pago(v_cod);
    if v_m.o_label is null then
      raise exception 'Ese método de pago no existe.' using errcode = '22023';
    end if;

    begin
      v_monto := round(greatest(coalesce(nullif(btrim(coalesce(v_x ->> 'monto', '')), '')::numeric, 0), 0), 2);
    exception when others then
      raise exception '%: el monto no se entiende.', v_m.o_label using errcode = '22023';
    end;

    v_leg := jsonb_build_object('metodo', v_cod, 'moneda', v_m.o_moneda, 'monto', v_monto);

    if v_cod in ('pago_movil', 'transferencia', 'zelle', 'binance_usdt') then
      begin
        select * into v_dat from private.compras_limpiar_datos_pago(v_cod, v_x -> 'datos');
      exception when sqlstate '22023' then
        raise exception '%: %', v_m.o_label, sqlerrm using errcode = '22023';
      end;
      v_leg := v_leg || jsonb_build_object('datos', v_dat.o_datos);
      if p_guardar and p_proveedor_id is not null then
        perform private.compras_guardar_datos_pago(p_proveedor_id, v_cod, v_dat.o_datos);
      end if;
    end if;

    v_out := v_out || jsonb_build_array(v_leg);
  end loop;

  if jsonb_array_length(v_out) > 1
     and exists (select 1 from jsonb_array_elements(v_out) l where (l ->> 'monto')::numeric <= 0) then
    raise exception 'En multipago, indicá el monto por cada método/moneda.' using errcode = '22023';
  end if;

  return v_out;
end;
$$;

-- MGG `telefonoAdministracionValido`: al menos 7 dígitos; solo +, ( ), ., - y espacios.
create or replace function private.compras_telefono_admin(p_tel text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_tel, ''));
begin
  if v = '' then
    raise exception 'Indicá el teléfono de administración del proveedor: se carga una sola vez y queda en su ficha.'
      using errcode = '22023';
  end if;
  if length(v) > 40 or v !~ '^[0-9+().\s-]+$' or length(regexp_replace(v, '\D', '', 'g')) < 7 then
    raise exception 'El teléfono de administración no parece un teléfono (mínimo 7 dígitos; se admiten +, espacios, guiones y paréntesis).'
      using errcode = '22023';
  end if;
  return v;
end;
$$;

/*
  Un archivo que la pantalla ya subió al depósito `compras-pagos`: {path,
  filename}, en la carpeta de la orden y con su prefijo (pago-, abono-, qr-).
  Nulo si no viene: el comprobante se puede subir o no.
*/
create or replace function private.compras_archivo_de_pago(p_archivo jsonb, p_orden_id bigint, p_prefijo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_path text;
  v_nom  text;
begin
  if p_archivo is null or jsonb_typeof(p_archivo) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_archivo) <> 'object' then
    raise exception 'El archivo no se entiende.' using errcode = '22023';
  end if;
  v_path := coalesce(p_archivo ->> 'path', '');
  v_nom := nullif(btrim(coalesce(p_archivo ->> 'filename', '')), '');
  if v_path not like p_orden_id::text || '/' || p_prefijo || '-%' or v_nom is null then
    raise exception 'El archivo no es de esta orden.' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects s where s.bucket_id = 'compras-pagos' and s.name = v_path) then
    raise exception 'El archivo no se terminó de subir: vuelva a elegirlo.' using errcode = '22023';
  end if;
  return jsonb_build_object('path', v_path, 'filename', left(v_nom, 200));
end;
$$;

-- «$1.234,56» para los avisos.
create or replace function private.compras_monto_txt(p numeric)
returns text
language sql
stable
set search_path = ''
as $$
  select '$' || private.numero_es(coalesce(p, 0), 2);
$$;

/*
  La fecha, el monto, la moneda y la tasa de un pago o un abono. Devuelve el
  equivalente en dólares, que es lo que baja del saldo.
*/
create or replace function private.compras_leer_pago(
  p_datos jsonb,
  out o_fecha date,
  out o_monto numeric,
  out o_moneda text,
  out o_tasa numeric,
  out o_monto_usd numeric
)
language plpgsql
stable
set search_path = ''
as $$
begin
  begin
    o_fecha := nullif(btrim(coalesce(p_datos ->> 'fecha', '')), '')::date;
    o_monto := round(nullif(btrim(coalesce(p_datos ->> 'monto', '')), '')::numeric, 2);
    o_tasa := nullif(btrim(coalesce(p_datos ->> 'tasa', '')), '')::numeric;
  exception when others then
    raise exception 'La fecha, el monto o la tasa no se entienden.' using errcode = '22023';
  end;

  if o_fecha is null then
    raise exception 'Indicá la fecha del pago.' using errcode = '22023';
  end if;
  if o_fecha > (now() at time zone 'America/Caracas')::date then
    raise exception 'La fecha del pago no puede ser de mañana en adelante.' using errcode = '22023';
  end if;
  if coalesce(o_monto, 0) <= 0 then
    raise exception 'Indicá el monto pagado.' using errcode = '22023';
  end if;

  o_moneda := coalesce(nullif(btrim(coalesce(p_datos ->> 'moneda', '')), ''), 'USD');
  if o_moneda not in ('USD', 'Bs', 'USDT') then
    raise exception 'La moneda del pago es USD, Bs o USDT.' using errcode = '22023';
  end if;

  if o_moneda = 'Bs' then
    if coalesce(o_tasa, 0) <= 0 then
      raise exception 'Indicá la tasa (Bs por $) para pasar el pago a dólares.' using errcode = '22023';
    end if;
    o_tasa := round(o_tasa, 4);
    o_monto_usd := round(o_monto / o_tasa, 2);
  else
    o_tasa := null;
    o_monto_usd := o_monto;
  end if;
end;
$$;

-- Avisos de la recepción al almacén (el mismo criterio que la fase 1).
create or replace function private.compras_avisar_por_recibir(p_orden public.compras_ordenes, p_titulo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.compras_avisar(p_orden, 'OC_POR_RECIBIR', p_titulo,
    array['ALMACEN'], '/app/solicitudes-pedido', 'ATENCION');
end;
$$;

/*
  Un crédito que llega a cero queda saldado: se anota quién y cuándo (en
  `pagada_*`, así la fase 4 sabe que ya está pago) y el evento
  `credito_saldado`. El estado no cambia (como MGG).
*/
create or replace function private.compras_cerrar_credito(p_o public.compras_ordenes)
returns public.compras_ordenes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.compras_ordenes := p_o;
begin
  if v_o.condiciones_pago is distinct from 'credito' or v_o.pagada_en is not null
     or coalesce(v_o.abonado_total, 0) <= 0 or private.compras_saldo_credito(v_o) > 0.01 then
    return v_o;
  end if;

  update public.compras_ordenes
     set pagada_por = (select auth.uid()),
         pagada_por_nombre = private.compras_mi_nombre(),
         pagada_en = now(),
         historial = historial || private.compras_evento('credito_saldado', jsonb_build_object(
           'abonado', abonado_total, 'monto_a_pagar', private.compras_monto_a_pagar(v_o)))
   where id = v_o.id
  returning * into v_o;

  -- MGG: «Crédito pagado · {oc} → Pendiente por recepción».
  perform private.compras_avisar(v_o, 'OC_CREDITO_SALDADO',
    format('Crédito pagado · %s%s', coalesce(v_o.oc_codigo, v_o.codigo),
      case when v_o.recibida_en is null then ' → Pendiente por recepción' else ' · listo para finalizar' end),
    array['COMPRAS']);

  return v_o;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. ✔ Aprobar OC (individual y por lote)
-- ═══════════════════════════════════════════════════════════════════════════

/*
  MGG `aprobarOcsEnLote` (y la individual, que es la misma con una sola).
  Cada OC «Ordenes pendiente por aprobar» va adonde dicta su condición de pago
  (MGG `destinoPorCondicion`):
    contra_entrega → por_recibir · credito → cuenta_abierta · resto → confirmada_metodo
  Las que no están por aprobar se saltan; si no queda ninguna, error.
*/
create or replace function public.compras_aprobar_oc(p_ids bigint[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o    public.compras_ordenes;
  v_dest text;
  v_oc   text;
  v_out  jsonb := '[]'::jsonb;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_aprueba_oc() then
    raise exception 'Solo los usuarios autorizados para aprobar órdenes de compra (Usuarios > Roles y Permisos) pueden confirmar las órdenes de compra.'
      using errcode = '42501';
  end if;

  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'Seleccioná al menos una OC por confirmar' using errcode = '22023';
  end if;

  for v_o in
    select o.* from public.compras_ordenes o
     where o.id = any (p_ids) and o.estado = 'oc_creada'
     order by o.id
     for update
  loop
    v_dest := case v_o.condiciones_pago
                when 'contra_entrega' then 'por_recibir'
                when 'credito' then 'cuenta_abierta'
                else 'confirmada_metodo' end;
    v_oc := coalesce(v_o.oc_codigo, v_o.codigo);

    update public.compras_ordenes
       set estado = v_dest,
           oc_aprobada_por = (select auth.uid()),
           oc_aprobada_por_nombre = private.compras_mi_nombre(),
           oc_aprobada_en = now(),
           historial = historial || private.compras_evento('confirmada_' || v_dest, jsonb_build_object(
             'oc_codigo', v_o.oc_codigo,
             'condicion', v_o.condiciones_pago,
             'lote', cardinality(p_ids) > 1,
             'total', v_o.total))
     where id = v_o.id
    returning * into v_o;

    -- MGG: «OC confirmada: {oc} · falta indicar el método de pago».
    perform private.compras_avisar(v_o, 'OC_CONFIRMADA',
      format('OC confirmada: %s · %s', v_oc,
        case v_dest
          when 'confirmada_metodo' then 'falta indicar el método de pago'
          when 'cuenta_abierta' then 'crédito (cuenta abierta)'
          else 'contra entrega: pendiente por recepción' end),
      array['COMPRAS'], '/app/pedidos', 'ATENCION');

    if v_dest = 'por_recibir' then
      perform private.compras_avisar_por_recibir(v_o,
        format('OC %s (contra entrega) · pendiente por recepción en el Almacén General', v_oc));
    end if;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', v_o.id, 'codigo', v_o.codigo, 'oc_codigo', v_o.oc_codigo, 'estado', v_dest));
  end loop;

  if jsonb_array_length(v_out) = 0 then
    raise exception 'No hay órdenes de compra por confirmar.' using errcode = '55000';
  end if;

  return v_out;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. 💳 Indicar método de pago (y corregirlo), documento y retenciones
-- ═══════════════════════════════════════════════════════════════════════════

/*
  «💳 Indicar método de pago / Enviar para Pagar» (MGG `MetodoPagoModal` →
  `indicarMetodoPago`). Desde «Confirmada (indicar método de pago)», o desde
  «Recibida» en contra entrega (pagar lo recibido). Pasa a «Confirmada pagar».

  p_datos = {
    metodos: [{metodo, monto?, datos?}],
    numero_administracion,
    comprobante_tipo: 'factura' | 'nota_entrega',
    retenciones: [{tipo, modo, valor}]   (solo con factura),
    descuento_pago,                      (el pago incluye descuento, en $)
    qr: {path, filename} | null,         (imagen / QR de pago)
    confirmo_recepcion                   (contra entrega)
  }
*/
create or replace function public.compras_indicar_metodo_pago(p_id bigint, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o       public.compras_ordenes;
  v_ce      boolean;
  v_tel     text;
  v_metodos jsonb;
  v_doc     text;
  v_desc    numeric;
  v_ret     jsonb;
  v_qr      jsonb;
  v_b       record;
  v_monto   numeric;
  v_oc      text;
  v_desde   text;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_gestiona() then
    raise exception 'El método de pago lo indica quien lleva Compras (Compras en total) o un administrador.'
      using errcode = '42501';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Faltan los datos del pago.' using errcode = '22023';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;

  v_ce := v_o.estado = 'recibida' and v_o.condiciones_pago = 'contra_entrega';
  if v_o.estado <> 'confirmada_metodo' and not v_ce then
    raise exception 'La OC debe estar en "Confirmada (indicar método de pago)".' using errcode = '55000';
  end if;
  if v_o.proveedor_id is null then
    raise exception 'Indicá el proveedor.' using errcode = '22023';
  end if;

  -- Los errores, en el orden de MGG.
  v_tel := private.compras_telefono_admin(p_datos ->> 'numero_administracion');
  v_metodos := private.compras_normalizar_metodos(p_datos -> 'metodos', v_o.proveedor_id, false);

  if v_ce and not coalesce((p_datos ->> 'confirmo_recepcion')::boolean, false) then
    raise exception 'Confirmá la Nota de entrega (verificaste lo recibido) antes de enviar a pagar.' using errcode = '22023';
  end if;

  v_doc := coalesce(nullif(btrim(coalesce(p_datos ->> 'comprobante_tipo', '')), ''), 'nota_entrega');
  if v_doc not in ('factura', 'nota_entrega') then
    raise exception 'Elegí el documento: Factura o Nota de entrega.' using errcode = '22023';
  end if;

  begin
    v_desc := round(greatest(coalesce(nullif(btrim(coalesce(p_datos ->> 'descuento_pago', '')), '')::numeric, 0), 0), 2);
  exception when others then
    raise exception 'El descuento no se entiende.' using errcode = '22023';
  end;

  select * into v_b from private.compras_bases_pago(v_o);

  v_o.comprobante_tipo := v_doc;
  v_o.descuento_pago := nullif(v_desc, 0);
  v_o.retenciones := case when v_doc = 'factura'
                          then private.compras_calcular_retenciones(v_o, p_datos -> 'retenciones', true)
                          else '[]'::jsonb end;
  v_ret := v_o.retenciones;

  if private.compras_suma_retenciones(v_ret) > round(v_b.o_total - v_desc, 2) then
    raise exception 'Las retenciones no pueden superar el monto a pagar.' using errcode = '22023';
  end if;
  if v_desc > v_b.o_total then
    raise exception 'El descuento no puede superar el total de la OC.' using errcode = '22023';
  end if;

  -- Ya validado todo: los datos del proveedor quedan en su ficha.
  v_metodos := private.compras_normalizar_metodos(p_datos -> 'metodos', v_o.proveedor_id, true);
  v_qr := private.compras_archivo_de_pago(p_datos -> 'qr', p_id, 'qr');
  v_monto := private.compras_monto_a_pagar(v_o);
  v_oc := coalesce(v_o.oc_codigo, v_o.codigo);
  v_desde := v_o.estado;

  update public.proveedores
     set numero_administracion = v_tel
   where id = v_o.proveedor_id and numero_administracion is distinct from v_tel;

  update public.compras_ordenes
     set estado = 'oc_aprobada',
         metodo_pago = v_metodos,
         metodo_pago_por = (select auth.uid()),
         metodo_pago_por_nombre = private.compras_mi_nombre(),
         metodo_pago_en = now(),
         comprobante_tipo = v_doc,
         retenciones = v_ret,
         descuento_pago = nullif(v_desc, 0),
         pago_qr_path = v_qr ->> 'path',
         pago_qr_nombre = v_qr ->> 'filename',
         numero_administracion = v_tel,
         historial = historial || private.compras_evento('metodo_pago', jsonb_build_object(
           'metodos', v_metodos,
           'comprobante', v_doc,
           'retenciones', v_ret,
           'total_retenciones', private.compras_suma_retenciones(v_ret),
           'descuento_pago', nullif(v_desc, 0),
           'total', v_b.o_total,
           'monto_a_pagar', v_monto,
           'numero_administracion', v_tel,
           'qr', v_qr is not null,
           'desde', v_desde))
   where id = p_id
  returning * into v_o;

  -- MGG: «OC {oc} enviada para pagar · disponible en Tesorería». Aquí paga
  -- quien aprueba OC, en Compras.
  perform private.compras_avisar(v_o, 'OC_POR_PAGAR',
    format('OC %s enviada para pagar · monto a pagar %s', v_oc, private.compras_monto_txt(v_monto)),
    array['COMPRAS', 'GERENTE_GENERAL'], '/app/pedidos', 'ATENCION');

  return jsonb_build_object('id', v_o.id, 'estado', v_o.estado, 'monto_a_pagar', v_monto);
end;
$$;

/*
  «💳 Editar método de pago / datos» (MGG `corregirMetodoPago`): la OC sigue
  en «Confirmada pagar». Aquí, como no hay módulo de Retenciones, también se
  corrigen el documento y las retenciones.

  p_datos = {metodos, numero_administracion, comprobante_tipo, retenciones}
*/
create or replace function public.compras_corregir_metodo_pago(p_id bigint, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o       public.compras_ordenes;
  v_antes   jsonb;
  v_tel     text;
  v_metodos jsonb;
  v_doc     text;
  v_b       record;
  v_monto   numeric;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_gestiona() then
    raise exception 'El método de pago lo corrige quien lleva Compras (Compras en total) o un administrador.'
      using errcode = '42501';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Faltan los datos del pago.' using errcode = '22023';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;
  if v_o.estado <> 'oc_aprobada' or v_o.pagada_en is not null then
    raise exception 'El método de pago se corrige con la OC en «Confirmada pagar» y antes de pagarla.' using errcode = '55000';
  end if;

  v_antes := jsonb_strip_nulls(jsonb_build_object(
    'metodos', v_o.metodo_pago, 'comprobante', v_o.comprobante_tipo, 'retenciones', v_o.retenciones,
    'numero_administracion', v_o.numero_administracion, 'monto_a_pagar', private.compras_monto_a_pagar(v_o)));

  v_tel := private.compras_telefono_admin(p_datos ->> 'numero_administracion');
  v_metodos := private.compras_normalizar_metodos(p_datos -> 'metodos', v_o.proveedor_id, false);

  v_doc := coalesce(nullif(btrim(coalesce(p_datos ->> 'comprobante_tipo', '')), ''), v_o.comprobante_tipo, 'nota_entrega');
  if v_doc not in ('factura', 'nota_entrega') then
    raise exception 'Elegí el documento: Factura o Nota de entrega.' using errcode = '22023';
  end if;

  select * into v_b from private.compras_bases_pago(v_o);
  v_o.comprobante_tipo := v_doc;
  v_o.retenciones := case when v_doc = 'factura'
                          then private.compras_calcular_retenciones(v_o, coalesce(p_datos -> 'retenciones', v_o.retenciones), true)
                          else '[]'::jsonb end;
  if private.compras_suma_retenciones(v_o.retenciones) > round(v_b.o_total - coalesce(v_o.descuento_pago, 0), 2) then
    raise exception 'Las retenciones no pueden superar el monto a pagar.' using errcode = '22023';
  end if;

  v_metodos := private.compras_normalizar_metodos(p_datos -> 'metodos', v_o.proveedor_id, true);
  v_monto := private.compras_monto_a_pagar(v_o);

  update public.proveedores
     set numero_administracion = v_tel
   where id = v_o.proveedor_id and numero_administracion is distinct from v_tel;

  update public.compras_ordenes
     set metodo_pago = v_metodos,
         metodo_pago_por = (select auth.uid()),
         metodo_pago_por_nombre = private.compras_mi_nombre(),
         metodo_pago_en = now(),
         comprobante_tipo = v_doc,
         retenciones = v_o.retenciones,
         numero_administracion = v_tel,
         historial = historial || private.compras_evento('metodo_pago_corregido', jsonb_build_object(
           'antes', v_antes,
           'despues', jsonb_build_object(
             'metodos', v_metodos, 'comprobante', v_doc, 'retenciones', v_o.retenciones,
             'numero_administracion', v_tel, 'monto_a_pagar', v_monto),
           'retenciones', v_o.retenciones,
           'comprobante', v_doc,
           'monto_a_pagar', v_monto))
   where id = p_id
  returning * into v_o;

  -- MGG: «OC {oc} · método de pago corregido · Tesorería ya ve los datos nuevos».
  perform private.compras_avisar(v_o, 'OC_METODO_CORREGIDO',
    format('OC %s · método de pago corregido · monto a pagar %s', coalesce(v_o.oc_codigo, v_o.codigo), private.compras_monto_txt(v_monto)),
    array['COMPRAS', 'GERENTE_GENERAL']);

  return jsonb_build_object('id', v_o.id, 'estado', v_o.estado, 'monto_a_pagar', v_monto);
end;
$$;

/*
  «🧾 Documento y retenciones» de un crédito (MGG no lo tiene: allá lo carga
  Retenciones). En «Crédito · cuenta abierta» y, mientras quede saldo, en
  «Pendiente por recepción» o «Recibida». Las retenciones no pueden dejar el
  monto a pagar por debajo de lo ya abonado.
*/
create or replace function public.compras_documento_retenciones(p_id bigint, p_comprobante_tipo text, p_retenciones jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o     public.compras_ordenes;
  v_antes jsonb;
  v_doc   text := coalesce(nullif(btrim(coalesce(p_comprobante_tipo, '')), ''), 'nota_entrega');
  v_monto numeric;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_gestiona() then
    raise exception 'El documento y las retenciones los indica quien lleva Compras (Compras en total) o un administrador.'
      using errcode = '42501';
  end if;
  if v_doc not in ('factura', 'nota_entrega') then
    raise exception 'Elegí el documento: Factura o Nota de entrega.' using errcode = '22023';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;
  if v_o.condiciones_pago is distinct from 'credito'
     or v_o.estado not in ('cuenta_abierta', 'por_recibir', 'recibida')
     or v_o.pagada_en is not null then
    raise exception 'El documento y las retenciones se indican en un crédito con saldo pendiente.' using errcode = '55000';
  end if;

  v_antes := jsonb_strip_nulls(jsonb_build_object(
    'comprobante', v_o.comprobante_tipo, 'retenciones', v_o.retenciones,
    'monto_a_pagar', private.compras_monto_a_pagar(v_o)));

  v_o.comprobante_tipo := v_doc;
  v_o.retenciones := case when v_doc = 'factura'
                          then private.compras_calcular_retenciones(v_o, p_retenciones, true)
                          else '[]'::jsonb end;
  v_monto := private.compras_monto_a_pagar(v_o);

  if private.compras_suma_retenciones(v_o.retenciones) > (select o_total from private.compras_bases_pago(v_o)) then
    raise exception 'Las retenciones no pueden superar el monto a pagar.' using errcode = '22023';
  end if;
  if v_monto < round(coalesce(v_o.abonado_total, 0) - 0.01, 2) then
    raise exception 'Con esas retenciones el monto a pagar (%) queda por debajo de lo ya abonado (%).',
      private.compras_monto_txt(v_monto), private.compras_monto_txt(v_o.abonado_total) using errcode = '22023';
  end if;

  update public.compras_ordenes
     set comprobante_tipo = v_doc,
         retenciones = v_o.retenciones,
         historial = historial || private.compras_evento('documento_retenciones', jsonb_build_object(
           'antes', v_antes,
           'comprobante', v_doc,
           'retenciones', v_o.retenciones,
           'total_retenciones', private.compras_suma_retenciones(v_o.retenciones),
           'monto_a_pagar', v_monto,
           'abonado', v_o.abonado_total,
           'saldo', private.compras_saldo_credito(v_o)))
   where id = p_id
  returning * into v_o;

  v_o := private.compras_cerrar_credito(v_o);

  return jsonb_build_object('id', v_o.id, 'monto_a_pagar', v_monto, 'saldo', private.compras_saldo_credito(v_o));
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. 💵 Marcar pagada (lo que en MGG hace Tesorería)
-- ═══════════════════════════════════════════════════════════════════════════

/*
  Desde «Confirmada pagar». p_datos = {fecha, referencia, monto, moneda, tasa,
  comprobante: {path, filename} | null, nota}.
  - El monto (en $ o pasado a $ con la tasa) tiene que cubrir el monto a pagar.
  - La referencia se pide salvo que todo se pague en efectivo.
  - Pasa a «Pendiente por recepción»; si ya estaba recibida (contra entrega),
    a «Pagada» para que Compras la finalice (fase 4).
*/
create or replace function public.compras_marcar_pagada(p_id bigint, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o      public.compras_ordenes;
  v_p      record;
  v_ref    text;
  v_comp   jsonb;
  v_debe   numeric;
  v_tol    numeric;
  v_dest   text;
  v_oc     text;
  v_efe    boolean;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_aprueba_oc() then
    raise exception 'El pago lo registra un usuario autorizado para aprobar órdenes de compra o quien lleva Compras.'
      using errcode = '42501';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Faltan los datos del pago.' using errcode = '22023';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;
  if v_o.estado <> 'oc_aprobada' or v_o.pagada_en is not null then
    raise exception 'Solo se paga una OC en «Confirmada pagar» (está en «%»).', v_o.estado using errcode = '55000';
  end if;

  select * into v_p from private.compras_leer_pago(p_datos);

  v_efe := coalesce(jsonb_array_length(v_o.metodo_pago), 0) > 0
           and not exists (select 1 from jsonb_array_elements(v_o.metodo_pago) l
                            where l ->> 'metodo' not in ('divisas_efectivo', 'efectivo_bs'));
  v_ref := nullif(btrim(coalesce(p_datos ->> 'referencia', '')), '');
  if v_ref is null and not v_efe then
    raise exception 'Indicá la referencia del pago.' using errcode = '22023';
  end if;
  if length(coalesce(v_ref, '')) > 80 then
    raise exception 'La referencia va en 80 letras como mucho.' using errcode = '22023';
  end if;

  v_debe := private.compras_monto_a_pagar(v_o);
  v_tol := case when v_p.o_moneda = 'Bs' then greatest(0.01, round(v_debe * 0.01, 2)) else 0.01 end;
  if v_p.o_monto_usd < v_debe - v_tol then
    raise exception 'Lo pagado (%) no cubre el monto a pagar (%).',
      private.compras_monto_txt(v_p.o_monto_usd), private.compras_monto_txt(v_debe) using errcode = '22023';
  end if;

  v_comp := private.compras_archivo_de_pago(p_datos -> 'comprobante', p_id, 'pago');
  v_dest := case when v_o.recibida_en is not null then 'pagada' else 'por_recibir' end;
  v_oc := coalesce(v_o.oc_codigo, v_o.codigo);

  update public.compras_ordenes
     set estado = v_dest,
         pagada_por = (select auth.uid()),
         pagada_por_nombre = private.compras_mi_nombre(),
         pagada_en = now(),
         pago_fecha = v_p.o_fecha,
         pago_referencia = v_ref,
         pago_monto = v_p.o_monto,
         pago_moneda = v_p.o_moneda,
         pago_tasa = v_p.o_tasa,
         pago_monto_usd = v_p.o_monto_usd,
         pago_comprobante_path = v_comp ->> 'path',
         pago_comprobante_nombre = v_comp ->> 'filename',
         pago_nota = private.en_mayuscula(nullif(btrim(coalesce(p_datos ->> 'nota', '')), '')),
         historial = historial || private.compras_evento('pagada', jsonb_build_object(
           'fecha', v_p.o_fecha,
           'referencia', v_ref,
           'monto', v_p.o_monto,
           'moneda', v_p.o_moneda,
           'tasa', v_p.o_tasa,
           'monto_usd', v_p.o_monto_usd,
           'monto_a_pagar', v_debe,
           'comprobante_path', v_comp ->> 'path',
           'comprobante_nombre', v_comp ->> 'filename',
           'a', v_dest))
   where id = p_id
  returning * into v_o;

  -- MGG: «OC {oc} pagada · {monto}».
  perform private.compras_avisar(v_o, 'OC_PAGADA',
    format('OC %s pagada · %s%s', v_oc, private.compras_monto_txt(v_p.o_monto_usd),
      case when v_dest = 'por_recibir' then ' · pendiente por recepción' else ' · lista para finalizar' end),
    array['COMPRAS', 'GERENTE_GENERAL']);

  if v_dest = 'por_recibir' then
    perform private.compras_avisar_por_recibir(v_o,
      format('OC %s pagada · pendiente por recepción en el Almacén General', v_oc));
  end if;

  return jsonb_build_object('id', v_o.id, 'estado', v_o.estado, 'monto_usd', v_p.o_monto_usd);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. El crédito: abonos y «📦 Enviar a Pendiente por recepción»
-- ═══════════════════════════════════════════════════════════════════════════

/*
  «💵 Registrar abono» (MGG `registrarAbonoMulti`, que vive en Tesorería).
  p_datos = {fecha, monto, moneda, tasa, metodo, referencia, comprobante, nota}.
  En un crédito con saldo: «Crédito · cuenta abierta», «Pendiente por
  recepción» o «Recibida». El estado no cambia; si queda en cero, saldado.
*/
create or replace function public.compras_registrar_abono(p_id bigint, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o     public.compras_ordenes;
  v_p     record;
  v_m     record;
  v_cod   text;
  v_ref   text;
  v_comp  jsonb;
  v_saldo numeric;
  v_id    bigint;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_aprueba_oc() then
    raise exception 'Los abonos los registra un usuario autorizado para aprobar órdenes de compra o quien lleva Compras.'
      using errcode = '42501';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Faltan los datos del abono.' using errcode = '22023';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;
  if v_o.condiciones_pago is distinct from 'credito'
     or v_o.estado not in ('cuenta_abierta', 'por_recibir', 'recibida') then
    raise exception 'Los abonos se registran en una compra a crédito (está en «%»).', v_o.estado using errcode = '55000';
  end if;

  v_saldo := private.compras_saldo_credito(v_o);
  if v_saldo <= 0.01 then
    raise exception 'Este crédito ya está saldado.' using errcode = '55000';
  end if;

  select * into v_p from private.compras_leer_pago(p_datos);

  v_cod := btrim(coalesce(p_datos ->> 'metodo', ''));
  select * into v_m from private.compras_metodo_pago(v_cod);
  if v_m.o_label is null then
    raise exception 'Elegí el método del abono.' using errcode = '22023';
  end if;

  v_ref := nullif(btrim(coalesce(p_datos ->> 'referencia', '')), '');
  if v_ref is null and not v_m.o_efectivo then
    raise exception 'Indicá la referencia del abono.' using errcode = '22023';
  end if;
  if length(coalesce(v_ref, '')) > 80 then
    raise exception 'La referencia va en 80 letras como mucho.' using errcode = '22023';
  end if;

  if v_p.o_monto_usd > v_saldo + 0.01 then
    raise exception 'El abono (%) supera el saldo pendiente (%).',
      private.compras_monto_txt(v_p.o_monto_usd), private.compras_monto_txt(v_saldo) using errcode = '22023';
  end if;

  v_comp := private.compras_archivo_de_pago(p_datos -> 'comprobante', p_id, 'abono');

  insert into public.compras_abonos
    (orden_id, fecha, monto, moneda, monto_moneda, tasa, metodo, referencia,
     comprobante_path, comprobante_nombre, nota, saldo_restante, registrado_por, registrado_por_nombre)
  values
    (p_id, v_p.o_fecha, least(v_p.o_monto_usd, v_saldo), v_p.o_moneda, v_p.o_monto, v_p.o_tasa, v_cod, v_ref,
     v_comp ->> 'path', v_comp ->> 'filename', nullif(btrim(coalesce(p_datos ->> 'nota', '')), ''),
     round(greatest(v_saldo - v_p.o_monto_usd, 0), 2), (select auth.uid()), private.compras_mi_nombre())
  returning id into v_id;

  update public.compras_ordenes
     set abonado_total = round(coalesce(abonado_total, 0) + least(v_p.o_monto_usd, v_saldo), 2),
         historial = historial || private.compras_evento('abono', jsonb_build_object(
           'abono_id', v_id,
           'fecha', v_p.o_fecha,
           'monto', least(v_p.o_monto_usd, v_saldo),
           'moneda', v_p.o_moneda,
           'monto_moneda', v_p.o_monto,
           'tasa', v_p.o_tasa,
           'metodo', v_cod,
           'referencia', v_ref,
           'comprobante_nombre', v_comp ->> 'filename',
           'saldo', round(greatest(v_saldo - v_p.o_monto_usd, 0), 2)))
   where id = p_id
  returning * into v_o;

  -- MGG: «Abono $X · {OC}».
  perform private.compras_avisar(v_o, 'OC_ABONO',
    format('Abono %s · %s · saldo %s', private.compras_monto_txt(least(v_p.o_monto_usd, v_saldo)),
      coalesce(v_o.oc_codigo, v_o.codigo), private.compras_monto_txt(private.compras_saldo_credito(v_o))),
    array['COMPRAS']);

  v_o := private.compras_cerrar_credito(v_o);

  return jsonb_build_object('id', v_id, 'abonado_total', v_o.abonado_total, 'saldo', private.compras_saldo_credito(v_o));
end;
$$;

/*
  «📦 Enviar a Pendiente por recepción» (MGG `enviarCreditoARecepcion`). Aquí
  no hace falta estar saldado (la dueña): sigue siendo crédito y los abonos se
  siguen registrando.
*/
create or replace function public.compras_enviar_credito_a_recepcion(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.compras_ordenes;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_gestiona() then
    raise exception 'El crédito lo manda a recepción quien lleva Compras (Compras en total) o un administrador.'
      using errcode = '42501';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;
  if v_o.estado <> 'cuenta_abierta' then
    raise exception 'Solo aplica a créditos con cuenta abierta.' using errcode = '55000';
  end if;
  if v_o.recibida_en is not null then
    raise exception 'La mercancía ya fue recibida.' using errcode = '55000';
  end if;

  update public.compras_ordenes
     set estado = 'por_recibir',
         historial = historial || private.compras_evento('credito_a_recepcion', jsonb_build_object(
           'abonado', abonado_total,
           'monto_a_pagar', private.compras_monto_a_pagar(v_o),
           'saldo', private.compras_saldo_credito(v_o)))
   where id = p_id
  returning * into v_o;

  perform private.compras_avisar_por_recibir(v_o,
    format('OC %s (crédito) · pendiente por recepción en el Almacén General', coalesce(v_o.oc_codigo, v_o.codigo)));
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Datos de pago del proveedor desde el modal (gestión mínima)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.compras_guardar_datos_pago(p_proveedor_id bigint, p_metodo text, p_datos jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();

  if not private.compras_aprueba_oc() then
    raise exception 'Los datos de pago del proveedor los carga Compras.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.proveedores p where p.id = p_proveedor_id) then
    raise exception 'Ese proveedor no existe.' using errcode = 'P0002';
  end if;

  return private.compras_guardar_datos_pago(p_proveedor_id, p_metodo, p_datos);
end;
$$;

create or replace function public.compras_quitar_datos_pago(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();

  if not private.compras_gestiona() then
    raise exception 'Los datos de pago del proveedor los quita quien lleva Compras (Compras en total) o un administrador.'
      using errcode = '42501';
  end if;

  delete from public.proveedor_datos_pago where id = p_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. «⊘ Anular OC»: nunca una pagada ni un crédito con abonos
-- ═══════════════════════════════════════════════════════════════════════════

/*
  Lo de la fase 2, más: con esta fase una OC pagada pasa a «Pendiente por
  recepción», y un crédito con abonos también puede llegar ahí. Ninguna de
  las dos se anula (MGG: «Solo se puede anular una OC antes de pagarse o
  recibirse.» / «No se puede anular: el crédito ya tiene abonos pagados…»).
*/
create or replace function public.compras_anular_oc(p_id bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o      public.compras_ordenes;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  perform private.exigir_usuario_activo();

  if v_motivo is null then
    raise exception 'Escribe el motivo de la anulación.' using errcode = '22023';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;

  if coalesce(v_o.abonado_total, 0) > 0 then
    raise exception 'No se puede anular: el crédito ya tiene abonos pagados. Revertí los abonos primero.' using errcode = '55000';
  end if;
  if v_o.pagada_en is not null or v_o.recibida_en is not null then
    raise exception 'Solo se puede anular una OC antes de pagarse o recibirse.' using errcode = '55000';
  end if;

  if v_o.estado = 'oc_creada' then
    if not private.compras_gestiona() then
      raise exception 'La OC por aprobar la anula quien lleva Compras (Compras en total) o un administrador.'
        using errcode = '42501';
    end if;
  elsif v_o.estado in ('confirmada_metodo', 'oc_aprobada', 'por_recibir', 'cuenta_abierta') then
    if not private.compras_aprueba_oc() then
      raise exception 'Esta OC ya fue aprobada: solo un usuario autorizado para aprobar órdenes de compra puede anularla o cancelarla.'
        using errcode = '42501';
    end if;
  else
    raise exception 'La OC % está en «%»: ya no se anula.', coalesce(v_o.oc_codigo, v_o.codigo), v_o.estado
      using errcode = '55000';
  end if;

  update public.compras_ordenes
     set estado = 'anulada',
         anulada_por = (select auth.uid()),
         anulada_por_nombre = private.compras_mi_nombre(),
         anulada_en = now(),
         motivo_anulacion = v_motivo,
         historial = historial || private.compras_evento('anulada', jsonb_build_object(
           'motivo', v_motivo, 'oc_codigo', v_o.oc_codigo, 'desde', v_o.estado))
   where id = p_id
  returning * into v_o;

  -- La oferta de una sub-OC anulada vuelve a estar disponible en la madre.
  if v_o.parent_orden_id is not null then
    update public.compras_ofertas
       set estado = 'pendiente', motivo_descarte = null, decidida_por = null, decidida_por_nombre = null, decidida_en = null
     where orden_id = v_o.parent_orden_id and proveedor_id = v_o.proveedor_id and estado = 'aceptada';
    perform private.compras_reestado_madre(v_o.parent_orden_id);
  end if;

  -- MGG: «OC anulada: {oc}».
  perform private.compras_avisar(v_o, 'OC_ANULADA', format('OC anulada: %s', coalesce(v_o.oc_codigo, v_o.codigo)),
    array['COMPRAS', 'GERENTE_GENERAL']);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. «✎ Editar precios» en «Confirmada pagar» (MGG `actualizarOc`)
-- ═══════════════════════════════════════════════════════════════════════════

/*
  Lo de la fase 2, más «Confirmada pagar» (MGG: «solo precios, sin moverla»):
  se corrigen productos, cantidades y precios sin salir de «Confirmada pagar»
  (las retenciones en % se ponen al día solas). Cambiar el proveedor o la
  condición la devuelve a aprobación y borra el método de pago, el documento
  y las retenciones que tenía.
*/
create or replace function public.compras_editar_oc(p_id bigint, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o        public.compras_ordenes;
  v_todo     boolean;
  v_pagar    boolean;
  v_x        jsonb;
  v_n        integer := 0;
  v_prev     jsonb;
  v_art      public.articulos;
  v_items    jsonb := '[]'::jsonb;
  v_sku      text;
  v_cant     numeric;
  v_prec     numeric;
  v_sub      numeric;
  v_desc     numeric;
  v_iva      numeric;
  v_igtf     numeric;
  v_inc      boolean;
  v_aj       numeric;
  v_ajm      text;
  v_cond     text;
  v_prov     bigint;
  v_tot      numeric;
  v_cambia_p boolean;
  v_material boolean;
  v_texto    boolean;
  v_reabre   boolean;
  v_evento   text;
  v_sol_id   uuid;
  v_sol_nom  text;
  v_unidad   text;
  v_notas    text;
  v_pide     record;
begin
  perform private.exigir_usuario_activo();

  if not private.compras_gestiona() then
    raise exception 'La OC la edita quien lleva Compras (Compras en total) o un administrador.' using errcode = '42501';
  end if;

  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Faltan los datos de la OC.' using errcode = '22023';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;
  if v_o.estado not in ('oc_creada', 'confirmada_metodo', 'oc_aprobada') or v_o.pagada_en is not null then
    raise exception 'Solo se puede editar la OC mientras está por aprobar, pendiente de método de pago o por pagar.' using errcode = '55000';
  end if;
  v_todo := v_o.estado = 'oc_creada';
  v_pagar := v_o.estado = 'oc_aprobada';

  if jsonb_typeof(p_datos -> 'items') is distinct from 'array' or jsonb_array_length(p_datos -> 'items') = 0 then
    raise exception 'La OC debe tener al menos un producto.' using errcode = '22023';
  end if;

  for v_x in select * from jsonb_array_elements(p_datos -> 'items') loop
    v_n := v_n + 1;
    v_sku := nullif(btrim(coalesce(v_x ->> 'sku', '')), '');
    select i into v_prev from jsonb_array_elements(v_o.items) i where i ->> 'sku' = v_sku limit 1;

    if v_prev is null then
      select a.* into v_art from public.articulos a
       where a.id = nullif(btrim(coalesce(v_x ->> 'articulo_id', '')), '')::bigint and a.activo;
      if v_art.id is null then
        raise exception 'El renglón % no es de esta OC ni del inventario.', v_n using errcode = '22023';
      end if;
      v_sku := v_art.codigo;
      v_prev := jsonb_build_object('sku', v_art.codigo, 'nombre', v_art.nombre, 'unidad', v_art.unidad,
                                   'articulo_id', v_art.id, 'agregado', true, 'comprar', true);
    end if;

    if exists (select 1 from jsonb_array_elements(v_items) y where y ->> 'sku' = v_sku) then
      raise exception '"%" está dos veces en la OC.', v_prev ->> 'nombre' using errcode = '22023';
    end if;

    begin
      v_cant := nullif(btrim(coalesce(v_x ->> 'cantidad', '')), '')::numeric;
      v_prec := round(coalesce(nullif(btrim(coalesce(v_x ->> 'precio', '')), '')::numeric, 0), 4);
    exception when others then
      raise exception '«%»: la cantidad o el precio no se entienden.', v_prev ->> 'nombre' using errcode = '22023';
    end;
    if coalesce(v_cant, 0) <= 0 then
      raise exception 'La cantidad de "%" debe ser mayor que 0.', v_prev ->> 'nombre' using errcode = '22023';
    end if;
    if v_prec < 0 then
      raise exception 'El precio de "%" no puede ser negativo.', v_prev ->> 'nombre' using errcode = '22023';
    end if;

    v_items := v_items || jsonb_build_array(
      v_prev || jsonb_strip_nulls(jsonb_build_object(
        'nombre', coalesce(private.en_mayuscula(nullif(btrim(coalesce(v_x ->> 'nombre', '')), '')), v_prev ->> 'nombre'),
        'cantidad', v_cant,
        'precio', v_prec))
      || jsonb_build_object(
        'marca', private.en_mayuscula(nullif(btrim(coalesce(v_x ->> 'marca', v_prev ->> 'marca', '')), '')),
        'modelo', private.en_mayuscula(nullif(btrim(coalesce(v_x ->> 'modelo', v_prev ->> 'modelo', '')), '')),
        'finalidad', case when v_todo
                          then private.en_mayuscula(nullif(btrim(coalesce(v_x ->> 'finalidad', v_prev ->> 'finalidad', '')), ''))
                          else v_prev ->> 'finalidad' end,
        'comprar', true));
  end loop;

  v_items := v_items || coalesce((select jsonb_agg(i order by n) from jsonb_array_elements(v_o.items) with ordinality as e(i, n)
                                   where not coalesce((i ->> 'comprar')::boolean, true)
                                     and not exists (select 1 from jsonb_array_elements(v_items) y where y ->> 'sku' = i ->> 'sku')),
                                 '[]'::jsonb);
  select jsonb_agg(jsonb_strip_nulls(i) order by n) into v_items from jsonb_array_elements(v_items) with ordinality as e(i, n);

  v_sub := private.compras_total_items(v_items);

  begin
    v_desc := case when p_datos ? 'descuento'
                   then nullif(round(greatest(coalesce(nullif(p_datos ->> 'descuento', '')::numeric, 0), 0), 2), 0)
                   else v_o.descuento_obtenido end;
    if v_todo then
      v_iva := case when p_datos ? 'iva' then nullif(round(greatest(coalesce(nullif(p_datos ->> 'iva', '')::numeric, 0), 0), 2), 0) else v_o.iva end;
      v_igtf := case when p_datos ? 'igtf' then nullif(round(greatest(coalesce(nullif(p_datos ->> 'igtf', '')::numeric, 0), 0), 2), 0) else v_o.igtf end;
      v_inc := case when p_datos ? 'iva_incluido' then coalesce((p_datos ->> 'iva_incluido')::boolean, false) else v_o.iva_incluido end;
      v_aj := case when p_datos ? 'ajuste' then nullif(round(coalesce(nullif(p_datos ->> 'ajuste', '')::numeric, 0), 2), 0) else v_o.ajuste end;
      v_ajm := case when p_datos ? 'ajuste_motivo' then nullif(btrim(coalesce(p_datos ->> 'ajuste_motivo', '')), '') else v_o.ajuste_motivo end;
    else
      v_iva := v_o.iva;
      v_igtf := v_o.igtf;
      v_inc := v_o.iva_incluido;
      v_aj := v_o.ajuste;
      v_ajm := v_o.ajuste_motivo;
    end if;
  exception when others then
    raise exception 'Un monto (descuento, IVA, IGTF o ajuste) no se entiende.' using errcode = '22023';
  end;
  v_inc := coalesce(v_inc, false) and v_iva is not null;
  if v_aj is null then
    v_ajm := null;
  end if;

  if coalesce(v_desc, 0) > v_sub then
    raise exception 'El descuento no puede superar el total de la OC.' using errcode = '22023';
  end if;

  v_cond := case when p_datos ? 'condiciones_pago' then nullif(btrim(coalesce(p_datos ->> 'condiciones_pago', '')), '') else v_o.condiciones_pago end;
  if v_cond is not null and v_cond not in ('contado', 'contra_entrega', 'anticipado', 'credito') then
    raise exception 'Esa condición de pago no existe.' using errcode = '22023';
  end if;

  v_prov := coalesce(nullif(p_datos ->> 'proveedor_id', '')::bigint, v_o.proveedor_id);
  if v_prov is distinct from v_o.proveedor_id
     and not exists (select 1 from public.proveedores p where p.id = v_prov and p.activo) then
    raise exception 'Ese proveedor no existe o está inactivo.' using errcode = '23503';
  end if;
  v_cambia_p := v_prov is distinct from v_o.proveedor_id;

  v_notas := case when p_datos ? 'notas' then nullif(btrim(coalesce(p_datos ->> 'notas', '')), '') else v_o.notas end;

  v_tot := private.compras_total_partes(v_sub, v_desc, v_iva, v_igtf, v_inc, v_aj);

  v_material := v_cambia_p
    or v_cond is distinct from v_o.condiciones_pago
    or v_desc is distinct from v_o.descuento_obtenido
    or (select coalesce(jsonb_agg(jsonb_build_array(i ->> 'sku', (i ->> 'cantidad')::numeric, (i ->> 'precio')::numeric,
                                                    i ->> 'marca', i ->> 'modelo') order by i ->> 'sku'), '[]'::jsonb)
          from jsonb_array_elements(v_items) i where coalesce((i ->> 'comprar')::boolean, true))
       is distinct from
       (select coalesce(jsonb_agg(jsonb_build_array(i ->> 'sku', (i ->> 'cantidad')::numeric, (i ->> 'precio')::numeric,
                                                    i ->> 'marca', i ->> 'modelo') order by i ->> 'sku'), '[]'::jsonb)
          from jsonb_array_elements(v_o.items) i where coalesce((i ->> 'comprar')::boolean, true))
    or (v_todo and (v_iva is distinct from v_o.iva or v_igtf is distinct from v_o.igtf
                    or v_inc is distinct from v_o.iva_incluido or v_aj is distinct from v_o.ajuste
                    or v_ajm is distinct from v_o.ajuste_motivo));

  v_sol_id := v_o.solicitante_id;
  v_sol_nom := v_o.solicitante_nombre;
  v_unidad := v_o.unidad_solicitante;
  if v_todo then
    if p_datos ? 'solicitante_nombre'
       and private.en_mayuscula(nullif(btrim(coalesce(p_datos ->> 'solicitante_nombre', '')), '')) is distinct from v_o.solicitante_nombre then
      select * into v_pide from private.compras_quien_pide(p_datos ->> 'solicitante_nombre');
      v_sol_id := v_pide.o_id;
      v_sol_nom := v_pide.o_nombre;
    end if;
    if p_datos ? 'unidad_solicitante' then
      v_unidad := private.compras_asegurar_unidad(p_datos ->> 'unidad_solicitante');
    end if;
  end if;

  v_texto := v_items is distinct from v_o.items
    or private.en_mayuscula(v_notas) is distinct from v_o.notas
    or (v_todo and (v_unidad is distinct from v_o.unidad_solicitante
                    or v_sol_nom is distinct from v_o.solicitante_nombre
                    or private.en_mayuscula(nullif(btrim(coalesce(p_datos ->> 'motivo', v_o.motivo, '')), '')) is distinct from v_o.motivo
                    or private.en_mayuscula(nullif(btrim(coalesce(p_datos ->> 'finalidad', v_o.finalidad, '')), '')) is distinct from v_o.finalidad
                    or coalesce((p_datos ->> 'urgente')::boolean, v_o.urgente) is distinct from v_o.urgente));

  if not v_material and not v_texto and abs(v_tot - v_o.total) <= 0.005 then
    return jsonb_build_object('sin_cambios', true, 'reabierta', false);
  end if;

  -- Confirmada (indicar método): un cambio material vuelve a aprobación.
  -- Confirmada pagar: solo el proveedor o la condición.
  v_reabre := (v_o.estado = 'confirmada_metodo' and (v_cambia_p or v_material))
           or (v_pagar and (v_cambia_p or v_cond is distinct from v_o.condiciones_pago));
  v_evento := case when v_reabre then 'oc_reabierta_edicion'
                   when v_material or abs(v_tot - v_o.total) > 0.005 or v_items is distinct from v_o.items then 'oc_editada'
                   else 'nota_editada' end;

  update public.compras_ordenes
     set items = v_items,
         total = v_tot,
         descuento_obtenido = v_desc,
         iva = v_iva,
         igtf = v_igtf,
         iva_incluido = v_inc,
         ajuste = v_aj,
         ajuste_motivo = v_ajm,
         condiciones_pago = v_cond,
         notas = v_notas,
         proveedor_id = v_prov,
         unidad_solicitante = v_unidad,
         solicitante_id = v_sol_id,
         solicitante_nombre = v_sol_nom,
         motivo = case when v_todo then nullif(btrim(coalesce(p_datos ->> 'motivo', v_o.motivo, '')), '') else motivo end,
         finalidad = case when v_todo then nullif(btrim(coalesce(p_datos ->> 'finalidad', v_o.finalidad, '')), '') else finalidad end,
         urgente = case when v_todo then coalesce((p_datos ->> 'urgente')::boolean, urgente) else urgente end,
         estado = case when v_reabre then 'oc_creada' else estado end,
         oc_aprobada_por = case when v_reabre then null else oc_aprobada_por end,
         oc_aprobada_por_nombre = case when v_reabre then null else oc_aprobada_por_nombre end,
         oc_aprobada_en = case when v_reabre then null else oc_aprobada_en end,
         -- Desde «Confirmada pagar», lo del pago se vuelve a indicar.
         metodo_pago = case when v_reabre and v_pagar then null else metodo_pago end,
         metodo_pago_por = case when v_reabre and v_pagar then null else metodo_pago_por end,
         metodo_pago_por_nombre = case when v_reabre and v_pagar then null else metodo_pago_por_nombre end,
         metodo_pago_en = case when v_reabre and v_pagar then null else metodo_pago_en end,
         comprobante_tipo = case when v_reabre and v_pagar then null else comprobante_tipo end,
         retenciones = case when v_reabre and v_pagar then '[]'::jsonb else retenciones end,
         descuento_pago = case when v_reabre and v_pagar then null else descuento_pago end,
         pago_qr_path = case when v_reabre and v_pagar then null else pago_qr_path end,
         pago_qr_nombre = case when v_reabre and v_pagar then null else pago_qr_nombre end,
         historial = historial || private.compras_evento(v_evento,
           case when v_cambia_p then jsonb_build_object(
                  'proveedorAnteriorId', v_o.proveedor_id,
                  'proveedorNuevoId', v_prov,
                  'proveedorAnterior', private.compras_texto_proveedor(v_o.proveedor_id),
                  'proveedorNuevo', private.compras_texto_proveedor(v_prov),
                  'vuelve_a', 'oc_creada',
                  'confirmada_por', case when v_reabre then v_o.oc_aprobada_por_nombre end,
                  'confirmada_en', case when v_reabre then v_o.oc_aprobada_en end,
                  'total', v_tot)
                else jsonb_strip_nulls(jsonb_build_object(
                  'total', v_tot,
                  'desde', case when v_pagar then 'oc_aprobada' end,
                  'confirmada_por', case when v_reabre then v_o.oc_aprobada_por_nombre end)) end)
   where id = p_id
  returning * into v_o;

  if v_reabre then
    perform private.compras_avisar(v_o, 'OC_REABIERTA_EDICION',
      format('OC %s modificada · vuelve a aprobación', coalesce(v_o.oc_codigo, v_o.codigo)),
      array['COMPRAS', 'GERENTE_GENERAL'], '/app/pedidos', 'ATENCION');
  elsif v_pagar and v_material then
    perform private.compras_avisar(v_o, 'OC_PRECIOS_EDITADOS',
      format('OC %s · precios corregidos · monto a pagar %s', coalesce(v_o.oc_codigo, v_o.codigo),
        private.compras_monto_txt(private.compras_monto_a_pagar(v_o))),
      array['COMPRAS', 'GERENTE_GENERAL']);
  end if;

  return jsonb_build_object('sin_cambios', false, 'reabierta', v_reabre);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. Los comprobantes de pago: un depósito privado
-- ═══════════════════════════════════════════════════════════════════════════

-- Rutas `{orden_id}/{pago|abono|qr}-{nonce}-{archivo}`. Los ve Compras; los
-- sube y los borra quien registra el pago (aprueba OC o lleva Compras). PDF o
-- imagen, 10 MB.
create or replace function private.compras_puede_ver_pagos(p_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_id is not null
     and private.tiene_permiso('COMPRAS', 'LECTURA')
     and exists (select 1 from public.compras_ordenes o where o.id = p_id);
$$;

create or replace function private.compras_puede_subir_pagos(p_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_id is not null
     and private.compras_aprueba_oc()
     and exists (select 1 from public.compras_ordenes o
                  where o.id = p_id and o.estado not in ('cancelada', 'anulada', 'finalizada'));
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('compras-pagos', 'compras-pagos', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists compras_pagos_lectura on storage.objects;
drop policy if exists compras_pagos_subida on storage.objects;
drop policy if exists compras_pagos_borrado on storage.objects;

create policy compras_pagos_lectura on storage.objects
  for select to authenticated
  using (bucket_id = 'compras-pagos'
         and private.compras_puede_ver_pagos(private.compras_orden_de_ruta(name)));

create policy compras_pagos_subida on storage.objects
  for insert to authenticated
  with check (bucket_id = 'compras-pagos'
              and private.compras_puede_subir_pagos(private.compras_orden_de_ruta(name)));

create policy compras_pagos_borrado on storage.objects
  for delete to authenticated
  using (bucket_id = 'compras-pagos'
         and private.compras_puede_subir_pagos(private.compras_orden_de_ruta(name)));

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. Auditoría y tiempo real
-- ═══════════════════════════════════════════════════════════════════════════

do $mapa$
begin
  if to_regclass('public.auditoria_modulos') is null then
    return;
  end if;
  insert into public.auditoria_modulos (tabla, modulo) values
    ('compras_abonos', 'COMPRAS'),
    ('proveedor_datos_pago', 'COMPRAS')
  on conflict (tabla) do update set modulo = excluded.modulo;
end
$mapa$;

do $vivo$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['compras_abonos', 'proveedor_datos_pago'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$vivo$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 14. Permisos de las funciones
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  f text;
begin
  foreach f in array array[
    'private.compras_bases_pago(public.compras_ordenes)',
    'private.compras_calcular_retenciones(public.compras_ordenes, jsonb, boolean)',
    'private.compras_suma_retenciones(jsonb)',
    'private.compras_monto_a_pagar(public.compras_ordenes)',
    'private.compras_saldo_credito(public.compras_ordenes)',
    'private.compras_retenciones_al_dia()',
    'private.compras_metodo_pago(text)',
    'private.compras_limpiar_datos_pago(text, jsonb)',
    'private.compras_guardar_datos_pago(bigint, text, jsonb)',
    'private.compras_normalizar_metodos(jsonb, bigint, boolean)',
    'private.compras_telefono_admin(text)',
    'private.compras_archivo_de_pago(jsonb, bigint, text)',
    'private.compras_monto_txt(numeric)',
    'private.compras_leer_pago(jsonb)',
    'private.compras_avisar_por_recibir(public.compras_ordenes, text)',
    'private.compras_cerrar_credito(public.compras_ordenes)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- Las dos que leen las políticas del depósito: las evalúa quien pide el archivo.
revoke all on function private.compras_puede_ver_pagos(bigint) from public, anon;
revoke all on function private.compras_puede_subir_pagos(bigint) from public, anon;
grant execute on function private.compras_puede_ver_pagos(bigint) to authenticated;
grant execute on function private.compras_puede_subir_pagos(bigint) to authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.compras_aprobar_oc(bigint[])',
    'public.compras_indicar_metodo_pago(bigint, jsonb)',
    'public.compras_corregir_metodo_pago(bigint, jsonb)',
    'public.compras_documento_retenciones(bigint, text, jsonb)',
    'public.compras_marcar_pagada(bigint, jsonb)',
    'public.compras_registrar_abono(bigint, jsonb)',
    'public.compras_enviar_credito_a_recepcion(bigint)',
    'public.compras_guardar_datos_pago(bigint, text, jsonb)',
    'public.compras_quitar_datos_pago(bigint)',
    'public.compras_anular_oc(bigint, text)',
    'public.compras_editar_oc(bigint, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 15. Comprobación
-- ═══════════════════════════════════════════════════════════════════════════

do $ver$
declare
  t   text;
  v_o public.compras_ordenes;
  v_r jsonb;
begin
  foreach t in array array['public.compras_abonos', 'public.proveedor_datos_pago'] loop
    if has_table_privilege('authenticated', t, 'INSERT')
       or has_table_privilege('authenticated', t, 'UPDATE')
       or has_table_privilege('authenticated', t, 'DELETE') then
      raise exception '% no puede escribirse directo: todo pasa por las funciones.', t;
    end if;
  end loop;

  -- Una OC de $100 + IVA 16 = $116, con retención de IVA 75 %, ISLR 2 %,
  -- IGTF 3 % e ISAE de $1: 12 + 2 + 3,48 + 1 = 18,48 → a pagar 97,52.
  v_o.items := '[{"sku":"A","cantidad":2,"precio":50}]'::jsonb;
  v_o.total := 116;
  v_o.iva := 16;
  v_o.iva_incluido := false;
  -- Un valor vacío es «no retienen».
  v_o.retenciones := private.compras_calcular_retenciones(v_o,
    '[{"tipo":"IVA","modo":"porcentaje","valor":75},
      {"tipo":"ISLR","modo":"porcentaje","valor":2},
      {"tipo":"IGTF","modo":"porcentaje","valor":3},
      {"tipo":"ISAE","modo":"monto","valor":1}]'::jsonb);
  if private.compras_suma_retenciones(v_o.retenciones) <> 18.48 then
    raise exception 'Las retenciones no dan lo esperado: %', v_o.retenciones;
  end if;
  if private.compras_monto_a_pagar(v_o) <> 97.52 then
    raise exception 'El monto a pagar no da lo esperado: %', private.compras_monto_a_pagar(v_o);
  end if;

  v_r := private.compras_calcular_retenciones(v_o, '[{"tipo":"ISLR","modo":"porcentaje","valor":""}]'::jsonb);
  if v_r <> '[]'::jsonb then
    raise exception 'Una retención en blanco no se guarda.';
  end if;

  -- Una retención repetida no pasa.
  begin
    perform private.compras_calcular_retenciones(v_o,
      '[{"tipo":"ISAE","modo":"monto","valor":1},{"tipo":"ISAE","modo":"monto","valor":2}]'::jsonb);
    raise exception 'Una retención repetida pasó.' using errcode = 'P0001';
  exception when sqlstate '22023' then
    null;
  end;

  -- Con el IVA dentro de los precios, la base imponible no lo lleva.
  v_o.items := '[{"sku":"A","cantidad":1,"precio":116}]'::jsonb;
  v_o.iva_incluido := true;
  v_o.total := 116;
  if (select o_base from private.compras_bases_pago(v_o)) <> 100 then
    raise exception 'La base imponible con IVA incluido no da 100.';
  end if;
end
$ver$;
