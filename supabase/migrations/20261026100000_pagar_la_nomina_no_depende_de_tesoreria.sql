-- ============================================================================
-- PAGAR LA NÓMINA NO DEPENDE DE TESORERÍA (26/10/2026)
--
-- Christopher: «quiero quitar el enlace que tiene el módulo de tesorería con
-- el módulo de nómina ya que no estamos usando tesorería y tampoco se usará
-- por ahora. Necesito que la nómina aparezca ya pagada».
--
-- `pagar_nomina` exigía una cuenta de `cuentas_tesoreria`: sin ella no dejaba
-- pagar. Ahora la cuenta es OPCIONAL. Sin ella, el período pasa derecho a
-- PAGADA, sin crear ningún movimiento de tesorería ni descontar saldo de
-- nada. Con ella —si algún día vuelve a hacer falta— el camino de siempre
-- sigue intacto: se crea el egreso, se enlaza al período y se avisa si la
-- cuenta queda en negativo.
--
-- TODO LO DEMÁS SE QUEDA IGUAL A PROPÓSITO: el rol que puede pagar (RRHH o
-- GERENTE_GENERAL), que el período tiene que estar Aprobada, que la fecha no
-- sea futura ni anterior al cierre, y el candado de la tasa del día —ese
-- candado no tiene nada que ver con Tesorería, es para que el recibo que
-- firmó el trabajador diga la misma cifra que salió.
-- ============================================================================

create or replace function public.pagar_nomina(
  p_periodo_id bigint,
  p_cuenta_id bigint default null,
  p_referencia text default null,
  p_fecha date default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
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

  /*
    LA FECHA DE PAGO ACOTA LA TASA, ASI QUE NO PUEDE SER CUALQUIERA.

    El candado de abajo compara contra la tasa de `p_fecha`. Sin acotar
    la fecha, retrocederla hasta el dia en que se congelo la tasa hacia
    que coincidieran y dejaba pagar al cambio viejo.

    Las dos reglas valen por si solas: un pago que no ha ocurrido no se
    registra, y una quincena no se paga antes de terminarse.
  */
  if coalesce(p_fecha, current_date) > current_date then
    raise exception 'No se registra un pago con fecha futura.'
      using errcode = '22023';
  end if;

  if coalesce(p_fecha, current_date) < v_p.hasta then
    raise exception
      'La % cierra el % y no se puede pagar antes de esa fecha. Si hay que adelantar dinero, eso es un anticipo y lleva su propio registro.',
      v_p.numero, to_char(v_p.hasta, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  /*
    NO SE PAGA CON UNA TASA QUE NO ES LA DEL DIA.

    31 de 32 sueldos estan pactados en dolares, asi que la tasa no es un
    adorno del recibo: con ella se convierte lo que cobra cada quien. Una
    nomina calculada el dia 11 y pagada el 22 le paga a todo el mundo la
    devaluacion de esos once dias de menos. Medido el 22/09/2026: 2,39 %%.

    No se recalcula aqui a proposito. Si el sistema ajustara solo, el papel
    que el trabajador firmo diria una cifra y del banco saldria otra.
    Negandose, alguien recalcula y vuelve a aprobar, y entonces el recibo,
    la aprobacion y el pago dicen los tres lo mismo.
  */
  declare
    v_tasa_dia  numeric;
    v_tasa_uso  numeric;
  begin
    select t.tasa_usd into v_tasa_dia
      from private.tasas_del_dia('USD', coalesce(p_fecha, current_date)) t;

    select coalesce(min(r.tasa_usd), v_p.tasa_usd) into v_tasa_uso
      from public.nomina_recibos r where r.periodo_id = p_periodo_id;

    if coalesce(v_tasa_dia, 0) > 0 and coalesce(v_tasa_uso, 0) > 0
       and round(v_tasa_uso, 4) <> round(v_tasa_dia, 4) then
      raise exception
        'Esta nomina se calculo a % Bs por dolar y la tasa del % es %. Pagarla asi le descuenta un % %% a cada trabajador. Actualice la tasa del periodo, vuelva a calcular y a aprobar.',
        private.numero_es(v_tasa_uso, 4),
        to_char(coalesce(p_fecha, current_date), 'DD/MM/YYYY'),
        private.numero_es(v_tasa_dia, 4),
        private.numero_es(round((v_tasa_dia / v_tasa_uso - 1) * 100, 2), 2)
        using errcode = '55000';
    end if;
  end;

  select count(*), coalesce(sum(neto), 0) into v_n, v_neto
  from public.nomina_recibos where periodo_id = p_periodo_id;

  /*
    LA CUENTA ES OPCIONAL DESDE HOY. Sin ella, nada de tesorería se toca: ni
    movimiento, ni saldo, ni aviso de cuenta en negativo. El camino de
    siempre sigue debajo, por si algún día vuelve a hacer falta.
  */
  if p_cuenta_id is not null then
    select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta_id;

    if v_cuenta.id is null then
      raise exception 'Esa cuenta no existe.' using errcode = '22023';
    end if;

    v_monto := case when v_cuenta.moneda = 'VES' then v_neto
                    else round(v_neto / v_p.tasa_usd, 2) end;

    v_mov := private.registrar_movimiento_tesoreria(
      p_cuenta_id, 'EGRESO', -1, v_monto,
      'Nómina ' || v_p.numero || ' — ' || v_n || ' trabajador' || case when v_n = 1 then '' else 'es' end,
      p_fecha, p_referencia, 'Personal', null, null, null, null,
      p_sin_tope => true);

    update public.tesoreria_movimientos
       set nomina_periodo_id = p_periodo_id
     where id = v_mov;
  end if;

  update public.nomina_periodos
     set estado = 'PAGADA', pagada_en = now()
   where id = p_periodo_id;

  /*
    DOS `perform` SEPARADOS, NO UN CASE CON `v_cuenta.campo` DENTRO.

    Un `case when ... then v_cuenta.moneda ... end` es una sola expresión SQL:
    Postgres necesita resolver el tipo de `v_cuenta` para prepararla entera,
    y sin cuenta ese registro nunca se asignó — revienta con "record
    v_cuenta is not assigned yet" aunque esa rama no fuera a tomarse. El
    `if/then/else` de PL/pgSQL sí es bifurcación de verdad: la rama que no
    toca `v_cuenta` ni se prepara.
  */
  if p_cuenta_id is not null then
    perform private.notificar(
      'NOMINA', 'PAGADA',
      'Nómina ' || v_p.numero || ' pagada',
      'Salieron ' || private.numero_es(v_monto, 2) || ' ' || v_cuenta.moneda ||
        ' de ' || v_cuenta.nombre || ' para ' || v_n || ' trabajador' ||
        case when v_n = 1 then '' else 'es' end || '.',
      '/app/nomina/recibos',
      array['GERENTE_GENERAL', 'RRHH', 'COMPRAS'], 'INFO');

    perform private.avisar_cuenta_en_negativo(
      p_cuenta_id, 'nómina ' || v_p.numero, v_monto);
  else
    perform private.notificar(
      'NOMINA', 'PAGADA',
      'Nómina ' || v_p.numero || ' pagada',
      'Quedó pagada para ' || v_n || ' trabajador' ||
        case when v_n = 1 then '' else 'es' end || '.',
      '/app/nomina/recibos',
      array['GERENTE_GENERAL', 'RRHH', 'COMPRAS'], 'INFO');
  end if;

  return v_mov;
end;
$function$;

-- ─────────────────────────────────── comprobación ───────────────────────────
-- Debe devolver: opcional = true.
select
  (select position('default null' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'pagar_nomina')  as opcional;
