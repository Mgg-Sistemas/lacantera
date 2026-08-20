-- ---------------------------------------------------------------------------
-- Cada moneda dice de dónde sale su tasa
--
-- LO QUE FALTABA
--
-- La pantalla de tasas solo dejaba registrar el dólar. No porque la base lo
-- impidiera —`registrar_tasa(origen, destino, fecha, tasa, fuente)` es genérica
-- desde el principio y `tasas_cambio` admite cualquier par— sino porque el
-- front mandaba `p_origen: 'USD'` fijo.
--
-- El euro ya estaba en `monedas` y nunca tuvo tasa. Y el USDT no estaba: la
-- cuenta de Binance se registró como dólares, así que el sistema creía que ese
-- saldo eran billetes cuando son otra cosa con otro precio.
--
-- POR QUÉ NO BASTABA CON AÑADIR LA MONEDA
--
-- `tasas_del_dia` pedía **siempre** la tasa con fuente `BCV`:
--
--     select t.tasa into v_moneda
--     from public.obtener_tasa(p_moneda, 'VES', p_fecha, 'BCV') t;
--
-- Para el euro está bien, que el BCV lo publica. Para el USDT no existe tal
-- cosa: el BCV no publica una tasa del Tether y nunca la va a publicar. Con esa
-- línea, añadir el USDT habría dado una moneda que no se puede valorar nunca.
--
-- Así que la fuente deja de estar escrita en el código y pasa a ser un dato de
-- cada moneda. `tasas_cambio.fuente` ya admitía BCV, PARALELO, INTERNA y
-- CONTRACTUAL; lo que faltaba era decir cuál le toca a cada una.
--
-- POR QUÉ EL CÓDIGO ES `UST` Y NO `USDT`
--
-- `monedas.codigo` es `character(3)`, y ese tipo se repite en **24 columnas de
-- 24 tablas** que apuntan aquí: cuentas, cobros, pagos, facturas, órdenes,
-- sueldos, prestaciones, precios. Ensancharlo obliga a borrar y rehacer todas
-- las vistas que las usan, porque Postgres no deja cambiar el tipo de una
-- columna de la que cuelga una vista.
--
-- Eso es una migración grande y arriesgada para ganar una letra en una clave
-- que nadie ve: la pantalla muestra `nombre` y `simbolo`, y los dos dicen USDT.
-- Si algún día se ensancha el tipo, renombrar `UST` a `USDT` es un `update` de
-- una línea. Al revés no: una migración a medias sobre 24 tablas no se deshace.
--
-- LA CUENTA DE BINANCE SE MUEVE, Y SE PUEDE PORQUE ESTÁ VACÍA
--
-- `BIL-BIN` no tiene ni un movimiento. Cambiarle la moneda ahora no reescribe
-- ninguna historia; hacerlo dentro de un mes, sí. Zelle se queda en dólares a
-- propósito: eso sí son dólares.
-- ---------------------------------------------------------------------------
alter table public.monedas
  add column if not exists fuente_tasa text not null default 'BCV';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'monedas_fuente_tasa_check') then
    alter table public.monedas
      add constraint monedas_fuente_tasa_check
      check (fuente_tasa in ('BCV', 'PARALELO', 'INTERNA', 'CONTRACTUAL'));
  end if;
end $$;

comment on column public.monedas.fuente_tasa is
  'De dónde sale la tasa de esta moneda. El BCV publica el dólar y el euro; '
  'el USDT no lo publica nadie oficialmente y va por PARALELO. Los valores son '
  'los mismos que admite tasas_cambio.fuente.';

-- El bolívar contra sí mismo no necesita fuente, pero la columna es NOT NULL.
update public.monedas set fuente_tasa = 'BCV' where codigo in ('VES', 'USD', 'EUR');

insert into public.monedas (codigo, nombre, simbolo, decimales, es_curso_legal, activa, fuente_tasa)
values ('UST', 'Tether (USDT)', 'USDT', 2, false, true, 'PARALELO')
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------------
create or replace function private.tasas_del_dia(
  p_moneda character,
  p_fecha  date,
  out tasa numeric,
  out tasa_usd numeric
)
returns record
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  -- Variables locales con prefijo: los parámetros de salida se llaman igual
  -- que las columnas que devuelve `obtener_tasa`, y plpgsql no siempre
  -- resuelve esa coincidencia a favor de la columna.
  v_usd    numeric;
  v_moneda numeric;
  v_fuente text;
begin
  -- El dólar del BCV es el ancla de la casa aunque se esté valorando otra cosa:
  -- `tasa_usd` es con lo que se expresan los totales en dólares en todo el
  -- sistema, y eso no cambia porque el cobro entre en euros o en Tether.
  select t.tasa into v_usd
  from public.obtener_tasa('USD', 'VES', p_fecha, 'BCV') t;

  if v_usd is null then
    raise exception 'No hay tasa BCV registrada para el % ni para ninguna fecha anterior. Regístrala en Sistema › Tasas de cambio.', to_char(p_fecha, 'DD/MM/YYYY')
      using errcode = 'P0002';
  end if;

  if p_moneda = 'VES' then
    v_moneda := 1;
  elsif p_moneda = 'USD' then
    v_moneda := v_usd;
  else
    -- La fuente la dice la moneda, no el código. El BCV publica el euro; el
    -- USDT no lo publica nadie oficialmente y va por PARALELO.
    select m.fuente_tasa into v_fuente
    from public.monedas m where m.codigo = p_moneda;

    if v_fuente is null then
      raise exception 'La moneda % no está en el catálogo de monedas.', p_moneda
        using errcode = 'P0002';
    end if;

    select t.tasa into v_moneda
    from public.obtener_tasa(p_moneda, 'VES', p_fecha, v_fuente) t;

    if v_moneda is null then
      raise exception 'No hay tasa % de % a bolívares para el %. Regístrala en Sistema › Tasas de cambio.',
        v_fuente, p_moneda, to_char(p_fecha, 'DD/MM/YYYY')
        using errcode = 'P0002';
    end if;
  end if;

  tasa     := v_moneda;
  tasa_usd := v_usd;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Binance deja de decir que tiene dólares
-- ---------------------------------------------------------------------------
update public.cuentas_tesoreria
   set moneda = 'UST'
 where codigo = 'BIL-BIN'
   and not exists (
     select 1 from public.tesoreria_movimientos m
      where m.cuenta_id = public.cuentas_tesoreria.id);
