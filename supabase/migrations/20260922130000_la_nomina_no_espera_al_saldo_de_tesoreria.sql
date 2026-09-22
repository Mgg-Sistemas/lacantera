-- LA NÓMINA NO ESPERA AL SALDO DE TESORERÍA (22/09/2026)
--
-- Christopher: «nómina no avanza si no hay fondos en tesorería; la idea es que
-- nómina siga con su proceso, pero a tesorería le sigan llegando los avisos y
-- los procesos, sin que dañe el flujo ni el sistema».
--
-- El candado del 21/09 —la caja sin sobregiro no gasta lo que no tiene— se
-- queda para compras, egresos sueltos y traslados: ahí una salida que deja la
-- cuenta en negativo casi siempre es un error de registro. El dinero a la
-- gente es otra cosa: la nómina, la liquidación y el anticipo de prestaciones
-- salen aunque el saldo del sistema no alcance. Se asientan en el libro, la
-- cuenta queda en negativo si hace falta, y a tesorería le llega el aviso de
-- que el saldo del sistema quedó por debajo del real, con la ruta para
-- arreglarlo. Nómina termina su proceso; tesorería recibe el movimiento y el
-- aviso; nadie se queda trancado esperando al otro.

-- ─────────────────────────────────────────── el asiento, con o sin tope

drop function if exists private.registrar_movimiento_tesoreria(
  bigint, text, integer, numeric, text, date, text, text, bigint, bigint, bigint, text, text, text);

create or replace function private.registrar_movimiento_tesoreria(
  p_cuenta bigint, p_tipo text, p_signo integer, p_monto numeric, p_concepto text,
  p_fecha date default null, p_referencia text default null, p_contraparte text default null,
  p_instruccion bigint default null, p_orden bigint default null, p_origen bigint default null,
  p_nota text default null, p_metodo text default null, p_moneda text default null,
  p_sin_tope boolean default false)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_cuenta public.cuentas_tesoreria;
  v_moneda text;
  v_metodo text;
  v_m      public.metodos_pago;
  v_fecha  date := coalesce(p_fecha, (now() at time zone 'America/Caracas')::date);
  v_tasas  record;
  v_id     bigint;
begin
  if p_cuenta is not null then
    select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta;
    if v_cuenta.id is null then
      raise exception 'No existe esa cuenta.' using errcode = 'P0002';
    end if;
  end if;

  -- La moneda: la que digan, o la de la cuenta mientras haya cuenta. Sin una ni
  -- otra no se puede convertir nada, así que se para aquí y no al calcular.
  v_moneda := coalesce(nullif(btrim(coalesce(p_moneda, '')), ''), v_cuenta.moneda);
  if v_moneda is null then
    raise exception 'Falta decir en qué moneda se movió el dinero.' using errcode = '22023';
  end if;

  -- El método: el que digan, o el de la instrucción de pago que lo originó.
  v_metodo := nullif(btrim(coalesce(p_metodo, '')), '');
  if v_metodo is null and p_instruccion is not null then
    select i.metodo into v_metodo from public.instrucciones_pago i where i.id = p_instruccion;
  end if;

  -- O el del movimiento del que sale: el IGTF de un cobro y el reverso de un
  -- pago se movieron por donde se movió el pago.
  if v_metodo is null and p_origen is not null then
    select m.metodo into v_metodo from public.tesoreria_movimientos m where m.id = p_origen;
  end if;

  -- Un método dicho aquí se mira contra el catálogo. El heredado ya se miró.
  if nullif(btrim(coalesce(p_metodo, '')), '') is not null then
    select * into v_m from public.metodos_pago where codigo = v_metodo;

    if v_m.codigo is null then
      raise exception 'El método de pago «%» no existe.', v_metodo using errcode = '23503';
    end if;
    if not v_m.activo then
      raise exception '% ya no está en uso como método de pago.', v_m.nombre using errcode = '55000';
    end if;
    if not v_m.mueve_dinero then
      raise exception '«%» no mueve dinero: no entra ni sale de ninguna cuenta.', v_m.nombre
        using errcode = '22023';
    end if;
    if v_m.moneda_regla = 'SOLO_VES' and v_moneda <> 'VES' then
      raise exception '% solo funciona en bolívares, y este movimiento es en %.', v_m.nombre, v_moneda
        using errcode = '22023';
    end if;
    if v_m.moneda_regla = 'NUNCA_VES' and v_moneda = 'VES' then
      raise exception '% no funciona en bolívares.', v_m.nombre using errcode = '22023';
    end if;
  end if;

  -- LA CAJA SIN SOBREGIRO NO GASTA LO QUE NO TIENE (21/09/2026)…
  -- …salvo que quien llama diga `p_sin_tope`: el dinero a la gente —nómina,
  -- liquidación, anticipo— sale igual y el aviso lo pone quien llama (22/09).
  if p_cuenta is not null and p_signo < 0 and p_tipo <> 'REVERSO'
     and not v_cuenta.permite_sobregiro and not p_sin_tope then
    perform 1 from public.cuentas_tesoreria where id = p_cuenta for update;
    if private.saldo_cuenta(p_cuenta) < p_monto then
      raise exception '«%» tiene % % y esta salida es de %. No alcanza.',
        v_cuenta.nombre, private.cantidad_es(private.saldo_cuenta(p_cuenta)), v_cuenta.moneda,
        private.cantidad_es(p_monto)
        using errcode = '55000',
              hint = 'Si el saldo del sistema está por debajo del real, ajústalo primero desde Bancos y cajas.';
    end if;
  end if;

  select * into v_tasas from private.tasas_del_dia(v_moneda, v_fecha);

  insert into public.tesoreria_movimientos
    (numero, fecha, cuenta_id, tipo, signo, monto, tasa, tasa_usd, concepto,
     referencia, contraparte, instruccion_id, orden_id, movimiento_origen, nota,
     registrado_por, metodo, moneda)
  values
    (private.siguiente_numero('TES'), v_fecha, p_cuenta, p_tipo, p_signo, p_monto,
     v_tasas.tasa, v_tasas.tasa_usd, btrim(p_concepto),
     nullif(btrim(coalesce(p_referencia, '')), ''),
     nullif(btrim(coalesce(p_contraparte, '')), ''),
     p_instruccion, p_orden, p_origen, nullif(btrim(coalesce(p_nota, '')), ''),
     (select auth.uid()), v_metodo, v_moneda)
  returning id into v_id;

  return v_id;
end;
$function$;

-- ─────────────────────────────────────────── el aviso a tesorería

-- Después de un pago a la gente: si la cuenta quedó en negativo, tesorería lo
-- sabe en el momento, con las dos cifras y el camino. Gerencia y compras
-- (que es quien lleva tesorería) lo ven; recursos humanos también, que fue
-- quien pagó.
create or replace function private.avisar_cuenta_en_negativo(
  p_cuenta bigint, p_que text, p_monto numeric)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_cuenta record;
  v_saldo  numeric;
begin
  select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta;
  v_saldo := private.saldo_cuenta(p_cuenta);
  if v_saldo >= 0 then
    return;
  end if;

  perform private.notificar(
    'TESORERIA', 'SALDO_NEGATIVO',
    v_cuenta.nombre || ' quedó en negativo: ' || p_que,
    'Salieron ' || private.numero_es(p_monto, 2) || ' ' || v_cuenta.moneda ||
      ' y la cuenta queda en ' || private.numero_es(v_saldo, 2) || ' ' || v_cuenta.moneda ||
      '. El pago a la gente no espera al saldo: si el dinero sí estaba, registra el ingreso o el saldo de apertura desde Bancos y cajas.',
    '/app/tesoreria/cuentas',
    array['GERENTE_GENERAL', 'COMPRAS', 'RRHH'], 'ATENCION');
end;
$function$;

-- ─────────────────────────────────────────── la nómina

create or replace function public.pagar_nomina(
  p_periodo_id bigint, p_cuenta_id bigint, p_referencia text default null, p_fecha date default null)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_p      record;
  v_cuenta record;
  v_neto   numeric;
  v_n      integer;
  v_monto  numeric;
  v_mov    bigint;
begin
  perform private.exigir_rol('RRHH', 'GERENTE_GENERAL');

  select * into v_p from public.nomina_periodos where id = p_periodo_id;

  if v_p.id is null then
    raise exception 'No existe el período %.', p_periodo_id using errcode = 'P0002';
  end if;

  if v_p.estado <> 'APROBADA' then
    raise exception 'Solo se paga una nómina aprobada. Esta está en "%".', v_p.estado
      using errcode = '55000';
  end if;

  select count(*), coalesce(sum(neto), 0) into v_n, v_neto
  from public.nomina_recibos where periodo_id = p_periodo_id;

  select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta_id;

  if v_cuenta.id is null then
    raise exception 'Indica de qué cuenta sale el dinero.' using errcode = '22023';
  end if;

  v_monto := case when v_cuenta.moneda = 'VES' then v_neto
                  else round(v_neto / v_p.tasa_usd, 2) end;

  -- Sin tope: la nómina sale aunque el saldo del sistema no alcance (22/09/2026).
  v_mov := private.registrar_movimiento_tesoreria(
    p_cuenta_id, 'EGRESO', -1, v_monto,
    'Nómina ' || v_p.numero || ' — ' || v_n || ' trabajador' || case when v_n = 1 then '' else 'es' end,
    p_fecha, p_referencia, 'Personal', null, null, null, null,
    p_sin_tope => true);

  update public.tesoreria_movimientos
     set nomina_periodo_id = p_periodo_id
   where id = v_mov;

  update public.nomina_periodos
     set estado = 'PAGADA', pagada_en = now()
   where id = p_periodo_id;

  perform private.notificar(
    'NOMINA', 'PAGADA',
    'Nómina ' || v_p.numero || ' pagada',
    'Salieron ' || private.numero_es(v_monto, 2) || ' ' || v_cuenta.moneda ||
      ' de ' || v_cuenta.nombre || ' para ' || v_n || ' trabajador' ||
      case when v_n = 1 then '' else 'es' end || '.',
    '/app/nomina/recibos',
    array['GERENTE_GENERAL', 'RRHH', 'COMPRAS'], 'INFO');

  perform private.avisar_cuenta_en_negativo(p_cuenta_id, 'nómina ' || v_p.numero, v_monto);

  return v_mov;
end;
$function$;

-- ─────────────────────────────────────────── la liquidación

create or replace function public.pagar_liquidacion(
  p_id bigint, p_cuenta_id bigint, p_fecha date default null, p_referencia text default null)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_liq   record;
  v_emp   record;
  v_fecha date := coalesce(p_fecha, current_date);
  v_mov   bigint;
begin
  perform private.exigir_permiso('NOMINA', 'TOTAL');

  select * into v_liq from public.prestaciones_liquidaciones where id = p_id for update;

  if v_liq.id is null then
    raise exception 'No existe la liquidación %.', p_id using errcode = 'P0002';
  end if;

  if v_liq.estado <> 'CALCULADA' then
    raise exception 'La liquidación % está %.', v_liq.numero, lower(v_liq.estado)
      using errcode = '55000';
  end if;

  if v_liq.total <= 0 then
    raise exception 'La liquidación % no arroja monto a pagar.', v_liq.numero using errcode = '22023';
  end if;

  select * into v_emp from public.empleados where id = v_liq.empleado_id;

  -- Sin tope: lo que se le debe a quien se va sale aunque el saldo no alcance (22/09/2026).
  v_mov := private.registrar_movimiento_tesoreria(
    p_cuenta_id, 'EGRESO', -1, v_liq.total,
    format('LIQUIDACIÓN %s DE %s %s', v_liq.numero, v_emp.nombres, v_emp.apellidos),
    v_fecha, p_referencia, v_emp.apellidos || ', ' || v_emp.nombres,
    null, null, null, null,
    p_sin_tope => true);

  update public.prestaciones_liquidaciones
     set estado = 'PAGADA', cuenta_id = p_cuenta_id, movimiento_id = v_mov,
         referencia = nullif(trim(coalesce(p_referencia, '')), ''),
         pagada_en = now(), pagada_por = (select auth.uid())
   where id = p_id;

  -- El egreso queda en la ficha: un trabajador liquidado que sigue apareciendo
  -- como activo vuelve a salir en la próxima nómina.
  update public.empleados
     set activo = false,
         fecha_egreso = v_liq.fecha_egreso,
         motivo_egreso = coalesce(motivo_egreso, v_liq.motivo)
   where id = v_liq.empleado_id;

  perform private.avisar_cuenta_en_negativo(p_cuenta_id, 'liquidación ' || v_liq.numero, v_liq.total);
end;
$function$;

-- ─────────────────────────────────────────── el anticipo

create or replace function public.registrar_anticipo_prestaciones(
  p_empleado_id bigint, p_monto numeric, p_motivo text, p_cuenta_id bigint default null,
  p_fecha date default null, p_detalle text default null, p_referencia text default null)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_p      record;
  v_emp    record;
  v_cuenta record;
  v_fecha  date := coalesce(p_fecha, current_date);
  v_tasas  record;
  v_id     bigint;
  v_mov    bigint;
begin
  -- Adelantar prestaciones es sacar dinero contra lo que se le debe a alguien.
  perform private.exigir_permiso('NOMINA', 'TOTAL');

  -- Con las prestaciones apagadas en los conceptos de ley, esto no corre.
  perform private.exigir_prestaciones_habilitadas(v_fecha);

  select * into v_emp from public.empleados where id = p_empleado_id;
  if v_emp.id is null then
    raise exception 'No existe el trabajador %.', p_empleado_id using errcode = 'P0002';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El anticipo tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'No se registra un anticipo con fecha futura.' using errcode = '22023';
  end if;

  select * into v_p from public.v_prestaciones where empleado_id = p_empleado_id;

  if p_monto > v_p.disponible_anticipo + 0.01 then
    raise exception 'A % se le pueden adelantar hasta % y se están pidiendo %. La ley permite adelantar hasta el 75%% de lo acumulado.',
      v_p.nombre, private.numero_es(v_p.disponible_anticipo, 2), private.numero_es(p_monto, 2) using errcode = '55000';
  end if;

  select * into v_tasas from private.tasas_del_dia(v_emp.moneda_salario, v_fecha);

  insert into public.prestaciones_anticipos
    (numero, empleado_id, fecha, motivo, detalle, cuenta_id, moneda, tasa, tasa_usd,
     monto, referencia, registrado_por)
  values
    (private.siguiente_numero('ANT'), p_empleado_id, v_fecha, p_motivo,
     nullif(trim(coalesce(p_detalle, '')), ''), p_cuenta_id, v_emp.moneda_salario,
     v_tasas.tasa, v_tasas.tasa_usd, p_monto,
     nullif(trim(coalesce(p_referencia, '')), ''), (select auth.uid()))
  returning id into v_id;

  -- El dinero sale de verdad, así que el libro de tesorería tiene que verlo.
  if p_cuenta_id is not null then
    select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta_id;

    if v_cuenta.id is null then
      raise exception 'No existe la cuenta %.', p_cuenta_id using errcode = 'P0002';
    end if;

    -- Sin tope: el anticipo sale aunque el saldo del sistema no alcance (22/09/2026).
    v_mov := private.registrar_movimiento_tesoreria(
      p_cuenta_id, 'EGRESO', -1, p_monto,
      format('ANTICIPO DE PRESTACIONES A %s %s', v_emp.nombres, v_emp.apellidos),
      v_fecha, p_referencia, v_emp.apellidos || ', ' || v_emp.nombres,
      null, null, null, p_detalle,
      p_sin_tope => true);

    update public.prestaciones_anticipos set movimiento_id = v_mov where id = v_id;

    perform private.avisar_cuenta_en_negativo(
      p_cuenta_id, 'anticipo a ' || v_emp.nombres || ' ' || v_emp.apellidos, p_monto);
  end if;

  return v_id;
end;
$function$;
