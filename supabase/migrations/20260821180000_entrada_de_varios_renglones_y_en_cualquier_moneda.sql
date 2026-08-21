-- ---------------------------------------------------------------------------
-- Entrar varias cosas de una vez, y en la moneda en que se pagaron
--
-- Christopher: «¿qué ocurre si quiero cargar N existencias a un almacén?
-- ¿Tengo que repetir ese formulario N veces?». Sí, y eso es justo la fricción
-- de la que se quejó la líder: cargar el saldo inicial de un almacén con
-- veinte artículos eran veinte formularios, veinte veces eligiendo el mismo
-- almacén.
--
-- Y el formulario daba dos cosas por sentadas:
--
--   LA MONEDA. El costo se pedía en dólares y punto. El sistema maneja cuatro
--   —USD, VES, EUR, USDT— y un repuesto comprado en bolívares obligaba a
--   convertir de cabeza antes de escribirlo. Convertir de cabeza es como se
--   cargan los costos equivocados.
--
--   LA UNIDAD. «Cantidad que entra» a secas, sin decir de qué. Veinte de un
--   artículo que se mide en pares no es lo mismo que veinte del que se mide en
--   metros cúbicos, y el artículo ya sabe cuál es la suya.
--
-- LA CONVERSIÓN LA HACE LA BASE, NO LA PANTALLA
--
-- Regla de la casa: las tasas no se calculan en el navegador. Cada renglón
-- dice en qué moneda costó y aquí se convierte con `private.tasas_del_dia`,
-- que es la del BCV y la misma que usa todo lo demás. Si el navegador
-- convirtiera, dos pantallas acabarían usando dos tasas distintas el día que
-- una se quede con la de ayer en memoria.
--
-- Y cuando la moneda no es el dólar, el movimiento guarda en su nota el costo
-- declarado: seis meses después, «38,56» no dice que se pagaron 31.096
-- bolívares.
--
-- La unidad no viaja: sale del artículo. Mandarla desde la pantalla abriría la
-- puerta a que alguien meta veinte «litros» de algo que se mide en sacos.
-- ---------------------------------------------------------------------------

create or replace function public.registrar_entradas(
  p_almacen_id bigint,
  p_renglones jsonb,
  p_motivo text,
  p_referencia text default null,
  p_fecha date default null
) returns integer
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_r         jsonb;
  v_n         int := 0;
  v_articulo  bigint;
  v_cantidad  numeric;
  v_costo     numeric;
  v_moneda    text;
  v_costo_usd numeric;
  v_tasa      numeric;
  v_tasa_usd  numeric;
  v_nota      text;
  v_nombre    text;
begin
  perform private.exigir_rol('ALMACEN');

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'No hay nada que meter: la entrada no trae renglones.'
      using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Una entrada sin explicación no se puede auditar después. Escribe de dónde vino.'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.almacenes where id = p_almacen_id and activo) then
    raise exception 'Ese almacén no existe o está inactivo.' using errcode = '23503';
  end if;

  v_nota := btrim(p_motivo);
  if nullif(btrim(coalesce(p_referencia, '')), '') is not null then
    v_nota := v_nota || ' · Ref.: ' || btrim(p_referencia);
  end if;

  for v_r in select * from jsonb_array_elements(p_renglones) loop
    v_n := v_n + 1;

    v_articulo := nullif(btrim(coalesce(v_r->>'articulo_id', '')), '')::bigint;
    v_cantidad := coalesce(nullif(btrim(coalesce(v_r->>'cantidad', '')), '')::numeric, 0);
    v_costo    := coalesce(nullif(btrim(coalesce(v_r->>'costo', '')), '')::numeric, 0);
    v_moneda   := upper(coalesce(nullif(btrim(coalesce(v_r->>'moneda', '')), ''), 'USD'));

    -- El renglón se nombra en el error. Con quince renglones, «la cantidad
    -- tiene que ser mayor que cero» sin decir cuál obliga a revisarlos todos.
    select nombre into v_nombre from public.articulos where id = v_articulo and activo;

    if v_nombre is null then
      raise exception 'El renglón %: ese artículo no existe o está inactivo.', v_n
        using errcode = '23503';
    end if;

    if v_cantidad <= 0 then
      raise exception 'El renglón % (%): la cantidad tiene que ser mayor que cero.', v_n, v_nombre
        using errcode = '22023';
    end if;

    if v_costo <= 0 then
      raise exception 'El renglón % (%): hay que decir cuánto costó la unidad. Si de verdad no costó nada, eso no es una entrada: es un ajuste de conteo, y ahí se valora como el resto del almacén.', v_n, v_nombre
        using errcode = '22023';
    end if;

    select t.tasa, t.tasa_usd into v_tasa, v_tasa_usd
      from private.tasas_del_dia(v_moneda, coalesce(p_fecha, current_date)) t;

    if v_tasa is null or coalesce(v_tasa_usd, 0) = 0 then
      raise exception 'El renglón % (%): no hay tasa cargada para % en esa fecha, así que no se puede saber cuánto costó.', v_n, v_nombre, v_moneda
        using errcode = '22023';
    end if;

    -- `tasa` son bolívares por unidad de esa moneda y `tasa_usd` bolívares por
    -- dólar: el costo en dólares es el cociente. Para USD da el mismo número,
    -- que es como debe ser.
    v_costo_usd := round(v_costo * v_tasa / v_tasa_usd, 6);

    perform private.registrar_movimiento(
      'ENTRADA_DIRECTA', 1::smallint,
      p_almacen_id, v_articulo, v_cantidad, v_costo_usd,
      case when v_moneda = 'USD' then v_nota
           else v_nota || ' · Costo declarado: ' || v_costo || ' ' || v_moneda end,
      null, null, null, p_fecha);
  end loop;

  return v_n;
end;
$func$;

comment on function public.registrar_entradas(bigint, jsonb, text, text, date) is
  'Mete varios artículos al almacén de una vez, sin orden de compra detrás. Cada '
  'renglón dice en qué moneda costó y la conversión a dólares se hace aquí con la '
  'tasa del día. La unidad sale del artículo.';

revoke execute on function public.registrar_entradas(bigint, jsonb, text, text, date) from public, anon;
grant  execute on function public.registrar_entradas(bigint, jsonb, text, text, date) to authenticated;
