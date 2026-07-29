-- ============================================================================
-- El pago de una nómina tampoco se reversa a solas
--
-- El egreso que escribe `pagar_nomina` no tenía nada que lo distinguiera de un
-- gasto cualquiera, así que el libro ofrecía reversarlo. Hacerlo devolvía el
-- dinero a la cuenta y dejaba el período en "pagada": los recibos dirían que
-- se cobró y el banco que no salió nada.
--
-- Es el mismo problema que tenían las dos mitades de un traslado. Se resuelve
-- igual: el movimiento sabe de qué nómina viene, y sabiéndolo se puede impedir
-- que se deshaga por su cuenta. De paso, deja la nómina conciliada con el
-- libro sin tener que adivinar por el texto del concepto.
-- ============================================================================

alter table public.tesoreria_movimientos
  add column if not exists nomina_periodo_id bigint references public.nomina_periodos(id);

create index if not exists tesoreria_nomina_idx
  on public.tesoreria_movimientos (nomina_periodo_id);

-- El movimiento se escribe desde `private.registrar_movimiento_tesoreria`, que
-- no conoce la nómina. En vez de añadirle un parámetro más a una función que
-- ya tiene doce, `pagar_nomina` marca la fila recién creada. El disparador de
-- inmutabilidad lo permite bajo la misma regla que ya usa la transferencia:
-- de nulo a no nulo, y sin tocar nada más.
create or replace function private.tesoreria_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Dos campos se pueden escribir después de crear la fila, y solo una vez:
  -- el enlace entre las patas de un traslado y la nómina de la que sale un
  -- pago. Ninguno de los dos existe todavía cuando se escribe el movimiento.
  -- Se comprueba que no cambie nada más comparando las filas sin ese campo.
  if tg_op = 'UPDATE'
     and old.transferencia_par is null
     and new.transferencia_par is not null
     and to_jsonb(old) - 'transferencia_par' = to_jsonb(new) - 'transferencia_par' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.nomina_periodo_id is null
     and new.nomina_periodo_id is not null
     and to_jsonb(old) - 'nomina_periodo_id' = to_jsonb(new) - 'nomina_periodo_id' then
    return new;
  end if;

  raise exception 'El libro de tesorería no se edita ni se borra. Para corregir el movimiento %, revérsalo: queda la línea equivocada y la que la anula, y se entiende qué pasó.',
    coalesce(old.numero, '')
    using errcode = '55006';
end;
$$;

create or replace function public.reversar_movimiento_tesoreria(
  p_id     bigint,
  p_motivo text
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_m record;
begin
  perform private.exigir_rol('TESORERIA');

  if length(trim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Escribe por qué se reversa. La línea anulada se queda a la vista y sin motivo no se entiende.'
      using errcode = '22023';
  end if;

  select * into v_m from public.tesoreria_movimientos where id = p_id;

  if v_m.id is null then
    raise exception 'No existe el movimiento %.', p_id using errcode = 'P0002';
  end if;

  if exists (select 1 from public.tesoreria_movimientos where movimiento_origen = p_id) then
    raise exception 'El movimiento % ya fue reversado.', v_m.numero using errcode = '55000';
  end if;

  if v_m.instruccion_id is not null then
    raise exception 'Este movimiento es el pago de una compra. Reversarlo a solas dejaría la compra pagada y el dinero de vuelta: devuelve la instrucción de pago desde la compra.'
      using errcode = '55000';
  end if;

  if v_m.transferencia_par is not null then
    raise exception 'El movimiento % es una de las dos mitades de un traslado. Reversar solo esta devolvería el dinero al origen dejándolo también en el destino. Deshazlo con un traslado en sentido contrario.', v_m.numero
      using errcode = '55000';
  end if;

  if v_m.nomina_periodo_id is not null then
    raise exception 'Este movimiento es el pago de una nómina. Reversarlo dejaría los recibos diciendo que se cobró y el banco que no salió nada.'
      using errcode = '55000';
  end if;

  return private.registrar_movimiento_tesoreria(
    v_m.cuenta_id, 'REVERSO', (v_m.signo * -1)::integer, v_m.monto,
    'Reverso de ' || v_m.numero || ': ' || trim(p_motivo),
    null, v_m.referencia, v_m.contraparte, null, null, v_m.id, p_motivo);
end;
$$;

create or replace function public.pagar_nomina(
  p_periodo_id bigint,
  p_cuenta_id  bigint,
  p_referencia text default null,
  p_fecha      date default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p      record;
  v_cuenta record;
  v_neto   numeric;
  v_n      integer;
  v_monto  numeric;
  v_mov    bigint;
begin
  perform private.exigir_rol('TESORERIA');

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

  v_mov := private.registrar_movimiento_tesoreria(
    p_cuenta_id, 'EGRESO', -1, v_monto,
    'Nómina ' || v_p.numero || ' — ' || v_n || ' trabajador' || case when v_n = 1 then '' else 'es' end,
    p_fecha, p_referencia, 'Personal', null, null, null, null);

  update public.tesoreria_movimientos
     set nomina_periodo_id = p_periodo_id
   where id = v_mov;

  update public.nomina_periodos
     set estado = 'PAGADA', pagada_en = now()
   where id = p_periodo_id;

  perform private.notificar(
    'NOMINA', 'PAGADA',
    'Nómina ' || v_p.numero || ' pagada',
    'Salieron ' || to_char(v_monto, 'FM999G999G999D00') || ' ' || v_cuenta.moneda ||
      ' de ' || v_cuenta.nombre || ' para ' || v_n || ' trabajador' ||
      case when v_n = 1 then '' else 'es' end || '.',
    '/app/nomina/recibos',
    array['GERENTE_GENERAL', 'RRHH', 'TESORERIA'], 'INFO');

  return v_mov;
end;
$$;

-- Los pagos de nómina hechos antes de esta corrección se marcan por el número
-- de período que quedó escrito en su concepto.
--
-- El disparador se apaga para este arreglo puntual en vez de ensancharle la
-- excepción: `update ... from` no es la escritura de un campo suelto que la
-- excepción contempla, y aflojar la regla de inmutabilidad para poder correr
-- una migración es exactamente lo que no se debe hacer con un libro contable.
-- Al ser una sola sentencia dentro de la transacción de la migración, el
-- disparador vuelve a estar activo antes de que nadie más pueda escribir.
alter table public.tesoreria_movimientos disable trigger tesoreria_movimientos_inmutable;

update public.tesoreria_movimientos m
   set nomina_periodo_id = p.id
  from public.nomina_periodos p
 where m.nomina_periodo_id is null
   and m.tipo = 'EGRESO'
   and m.concepto like 'Nómina ' || p.numero || '%';

alter table public.tesoreria_movimientos enable trigger tesoreria_movimientos_inmutable;
