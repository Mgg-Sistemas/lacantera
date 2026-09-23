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
--
--
-- POR QUÉ ESTO VA CON PARCHES ANCLADOS Y NO CON `create or replace` ENTERO
--
-- Esta migración se escribió el 22/09 por la mañana, y esa tarde el compañero
-- metió en `pagar_nomina` tres candados que son dinero:
--
--   1. no se registra un pago con fecha futura;
--   2. no se paga una quincena antes de que termine —sin esto se rodea el
--      candado de la tasa retrocediendo la fecha hasta el día en que se
--      congeló—;
--   3. no se paga con una tasa que no sea la del día. Medido el 22/09: pagar
--      la quincena del 1 al 15 con la tasa vieja le descuenta un 2,39 % a cada
--      trabajador.
--
-- Reescribir la función entera se los habría llevado por delante sin que nadie
-- lo notara hasta cuadrar el mes. Así que cada cambio de aquí abajo es un
-- reemplazo de texto sobre la definición que haya en la base en ese momento, y
-- `private.parche_unico` **se niega a seguir** si su ancla no aparece
-- exactamente una vez. Si mañana alguien mueve ese trozo, esta migración no
-- deja un silencio: revienta y dice cuál ancla falló.

-- ───────────────────────────────────────────── la herramienta, prestada

-- Vive solo mientras dura la migración: se borra al final.
create or replace function private.parche_unico(p_texto text, p_ancla text, p_nuevo text)
returns text
language plpgsql
immutable
as $parche$
declare
  v_veces integer;
begin
  v_veces := (length(p_texto) - length(replace(p_texto, p_ancla, ''))) / length(p_ancla);

  if v_veces <> 1 then
    raise exception 'El ancla aparece % veces y tiene que aparecer una: «%»',
      v_veces, left(p_ancla, 70)
      using errcode = '55000';
  end if;

  return replace(p_texto, p_ancla, p_nuevo);
end
$parche$;

-- ───────────────────────────────────────────── el aviso a tesorería

-- Después de un pago a la gente: si la cuenta quedó en negativo, tesorería lo
-- sabe en el momento, con las dos cifras y el camino. Gerencia y compras —que
-- es quien lleva tesorería, porque el rol TESORERIA se retiró el 25/08— lo
-- ven; recursos humanos también, que fue quien pagó.
create or replace function private.avisar_cuenta_en_negativo(
  p_cuenta bigint, p_que text, p_monto numeric)
returns void
language plpgsql
security definer
set search_path to ''
as $aviso$
declare
  v_cuenta record;
  v_saldo  numeric;
begin
  if p_cuenta is null then
    return;
  end if;

  select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta;
  v_saldo := private.saldo_cuenta(p_cuenta);

  if v_cuenta.id is null or v_saldo >= 0 then
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
end
$aviso$;

comment on function private.avisar_cuenta_en_negativo is
  'Avisa a tesorería cuando un pago a la gente dejó la cuenta por debajo de cero. No frena nada: ya salió el dinero.';

-- ───────────────────────────────────────────── el asiento acepta un salvoconducto

do $mov$
declare
  v_firma constant text :=
    'private.registrar_movimiento_tesoreria(bigint,text,integer,numeric,text,date,text,text,bigint,bigint,bigint,text,text,text)';
  v_def   text;
  v_nuevo text;
begin
  if to_regprocedure(v_firma) is null then
    raise exception 'No existe el asiento de catorce argumentos: alguien ya le cambió la firma.'
      using errcode = '55000';
  end if;

  v_def := pg_get_functiondef(v_firma::regprocedure);

  if position('p_sin_tope' in v_def) > 0 then
    raise notice 'El asiento ya admite p_sin_tope. No se toca.';
    return;
  end if;

  -- El salvoconducto va al final y con valor por defecto, así que las treinta y
  -- pico llamadas que ya existen —las del compañero incluidas— no se tocan.
  v_nuevo := private.parche_unico(v_def,
    'p_moneda text DEFAULT NULL::text)',
    'p_moneda text DEFAULT NULL::text, p_sin_tope boolean DEFAULT false)');

  v_nuevo := private.parche_unico(v_nuevo,
    'and not v_cuenta.permite_sobregiro then',
    'and not v_cuenta.permite_sobregiro and not p_sin_tope then');

  -- El comentario, para que el código siga explicándose solo. Sin asertar: si
  -- alguien lo reescribió, el candado sigue bien puesto y eso es lo que importa.
  v_nuevo := replace(v_nuevo,
    '  -- LA CAJA SIN SOBREGIRO NO GASTA LO QUE NO TIENE (21/09/2026).',
    '  -- LA CAJA SIN SOBREGIRO NO GASTA LO QUE NO TIENE (21/09/2026)…' || chr(10) ||
    '  -- …salvo que quien llama enseñe `p_sin_tope`. El dinero a la gente' || chr(10) ||
    '  -- —nómina, liquidación, anticipo— sale igual y la cuenta queda en rojo;' || chr(10) ||
    '  -- el aviso a tesorería lo pone quien llama (22/09/2026).');

  -- Un parámetro nuevo cambia la firma: `create or replace` dejaría las dos
  -- funciones vivas y una llamada de catorce argumentos quedaría ambigua.
  execute 'drop function ' || v_firma;
  execute v_nuevo;
end
$mov$;

-- ───────────────────────────────────────────── la nómina

do $nomina$
declare
  v_def   text;
  v_nuevo text;
begin
  v_def := pg_get_functiondef('public.pagar_nomina(bigint,bigint,text,date)'::regprocedure);

  if position('p_sin_tope' in v_def) > 0 then
    raise notice 'La nómina ya sale sin tope. No se toca.';
    return;
  end if;

  v_nuevo := private.parche_unico(v_def,
    E'p_fecha, p_referencia, \'Personal\', null, null, null, null);',
    E'p_fecha, p_referencia, \'Personal\', null, null, null, null,' || chr(10) ||
    E'    p_sin_tope => true);');

  -- Compras lleva tesorería desde que el rol TESORERIA se retiró, así que el
  -- aviso de que la nómina salió también le toca a ellos.
  v_nuevo := private.parche_unico(v_nuevo,
    E'array[\'GERENTE_GENERAL\', \'RRHH\'], \'INFO\');',
    E'array[\'GERENTE_GENERAL\', \'RRHH\', \'COMPRAS\'], \'INFO\');');

  v_nuevo := private.parche_unico(v_nuevo,
    E'  return v_mov;',
    E'  perform private.avisar_cuenta_en_negativo(' || chr(10) ||
    E'    p_cuenta_id, \'nómina \' || v_p.numero, v_monto);' || chr(10) ||
    chr(10) ||
    E'  return v_mov;');

  execute v_nuevo;
end
$nomina$;

-- ───────────────────────────────────────────── la liquidación

do $liq$
declare
  v_def   text;
  v_nuevo text;
begin
  v_def := pg_get_functiondef('public.pagar_liquidacion(bigint,bigint,date,text)'::regprocedure);

  if position('p_sin_tope' in v_def) > 0 then
    raise notice 'La liquidación ya sale sin tope. No se toca.';
    return;
  end if;

  -- Lo que se le debe a quien se va no espera a que la caja cuadre.
  v_nuevo := private.parche_unico(v_def,
    E'    null, null, null, null);',
    E'    null, null, null, null,' || chr(10) ||
    E'    p_sin_tope => true);');

  v_nuevo := private.parche_unico(v_nuevo,
    E'   where id = v_liq.empleado_id;',
    E'   where id = v_liq.empleado_id;' || chr(10) ||
    chr(10) ||
    E'  perform private.avisar_cuenta_en_negativo(' || chr(10) ||
    E'    p_cuenta_id, \'liquidación \' || v_liq.numero, v_liq.total);');

  execute v_nuevo;
end
$liq$;

-- ───────────────────────────────────────────── el anticipo de prestaciones

do $ant$
declare
  v_def   text;
  v_nuevo text;
begin
  v_def := pg_get_functiondef(
    'public.registrar_anticipo_prestaciones(bigint,numeric,text,bigint,date,text,text)'::regprocedure);

  if position('p_sin_tope' in v_def) > 0 then
    raise notice 'El anticipo ya sale sin tope. No se toca.';
    return;
  end if;

  v_nuevo := private.parche_unico(v_def,
    E'      null, null, null, p_detalle);',
    E'      null, null, null, p_detalle,' || chr(10) ||
    E'      p_sin_tope => true);');

  v_nuevo := private.parche_unico(v_nuevo,
    E'    update public.prestaciones_anticipos set movimiento_id = v_mov where id = v_id;',
    E'    update public.prestaciones_anticipos set movimiento_id = v_mov where id = v_id;' || chr(10) ||
    chr(10) ||
    E'    perform private.avisar_cuenta_en_negativo(' || chr(10) ||
    E'      p_cuenta_id, \'anticipo a \' || v_emp.nombres || \' \' || v_emp.apellidos, p_monto);');

  execute v_nuevo;
end
$ant$;

-- ───────────────────────────────────────────── se devuelve la herramienta

drop function private.parche_unico(text, text, text);
