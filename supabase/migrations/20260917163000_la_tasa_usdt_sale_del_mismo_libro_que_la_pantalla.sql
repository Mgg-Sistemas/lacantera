/*
  LA TASA USDT SALE DEL MISMO LIBRO QUE LA PANTALLA

  La migración anterior (160000) tomaba el USDT de criptoya. Pero «Tasas de
  cambio» ya enseñaba en vivo la de Binance con su propio cálculo —la función
  `tasa-usdt`: la mediana de diez anuncios de cada lado del libro P2P y el punto
  medio entre las dos—, y con dos fuentes la tasa guardada y la de «Ahora mismo»
  habrían dicho números distintos el mismo minuto. Medido el 17/09: criptoya
  943,48; el libro, 943,86.

  Ahora la base consulta el libro de Binance igual que esa función: mismos diez
  anuncios, misma mediana, mismo punto medio. Se exigen los dos lados —la
  función de la pantalla se conforma con uno; una tasa que se guarda, no—, y
  sigue el freno contra el dólar BCV del día.

  Y las dos puertas manuales dejan de suponer que toda tasa automática es del
  BCV:
    tomar_tasa_ahora ........... con USDT consulta Binance, no devuelve nada;
    corregir_tasa_automatica ... busca la fila por la fuente de la moneda
                                 (PARALELO para el USDT), no por BCV.
*/

create or replace function private.tomar_tasa_usdt()
returns numeric
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_hoy     date := (now() at time zone 'America/Caracas')::date;
  v_lado    text;
  v_resp    extensions.http_response;
  v_mediana numeric;
  v_vende   numeric;
  v_compra  numeric;
  v_valor   numeric;
  v_bcv     numeric;
begin
  if exists (
    select 1 from public.tasas_cambio
     where moneda_origen = 'USDT'
       and moneda_destino = 'VES'
       and fecha = v_hoy
       and fuente = 'PARALELO'
  ) then
    return null;
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');

  foreach v_lado in array array['SELL', 'BUY'] loop
    begin
      v_resp := extensions.http_post(
        'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
        jsonb_build_object(
          'asset', 'USDT', 'fiat', 'VES', 'tradeType', v_lado, 'page', 1, 'rows', 10,
          'payTypes', '[]'::jsonb, 'countries', '[]'::jsonb,
          'proMerchantAds', false, 'publisherType', null)::text,
        'application/json');
    exception when others then
      raise warning 'No se pudo consultar el libro P2P de Binance (%): %', v_lado, sqlerrm;
      return null;
    end;

    if v_resp.status <> 200 then
      raise warning 'Binance respondió % al pedir el lado %', v_resp.status, v_lado;
      return null;
    end if;

    begin
      select percentile_cont(0.5) within group (order by (a->'adv'->>'price')::numeric)
        into v_mediana
        from jsonb_array_elements(v_resp.content::jsonb->'data') a
       where (a->'adv'->>'price')::numeric > 0;
    exception when others then
      raise warning 'Binance devolvió algo que no se entiende en el lado %: %', v_lado, left(v_resp.content, 200);
      return null;
    end;

    if v_mediana is null then
      raise warning 'El lado % del libro de Binance llegó sin anuncios.', v_lado;
      return null;
    end if;

    if v_lado = 'SELL' then v_vende := v_mediana; else v_compra := v_mediana; end if;
  end loop;

  v_valor := round((v_vende + v_compra) / 2, 4);

  select t.tasa into v_bcv
    from public.tasas_cambio t
   where t.moneda_origen = 'USD' and t.moneda_destino = 'VES' and t.fuente = 'BCV'
     and t.fecha <= v_hoy
   order by t.fecha desc
   limit 1;

  if v_bcv is null or v_valor < v_bcv / 2 or v_valor > v_bcv * 3 then
    raise warning 'La tasa USDT % no se guarda: el dólar BCV del día es %.', v_valor, v_bcv;
    return null;
  end if;

  insert into public.tasas_cambio
    (moneda_origen, moneda_destino, fecha, tasa, fuente, registrado_por, automatica)
  values
    ('USDT', 'VES', v_hoy, v_valor, 'PARALELO', null, true)
  on conflict on constraint tasas_unicas do nothing;

  return v_valor;
end;
$func$;

revoke all on function private.tomar_tasa_usdt() from public, anon, authenticated;

create or replace function public.tomar_tasa_ahora(p_origen character varying)
returns numeric
language plpgsql
security definer
set search_path to ''
as $func$
begin
  perform private.exigir_permiso('TASAS', 'ESCRITURA');
  if p_origen = 'USDT' then
    return private.tomar_tasa_usdt();
  end if;
  return private.tomar_tasa_publicada(p_origen);
end;
$func$;

do $parche$
declare
  v_def   text := pg_get_functiondef('public.corregir_tasa_automatica(character varying, numeric)'::regprocedure);
  v_antes text := $a$     and fuente = 'BCV'
     and automatica$a$;
  v_despues text := $b$     and fuente = coalesce((select m.fuente_tasa from public.monedas m where m.codigo = p_origen), 'BCV')
     and automatica$b$;
begin
  if (length(v_def) - length(replace(v_def, v_antes, ''))) / length(v_antes) <> 1 then
    raise exception 'corregir_tasa_automatica no busca la fuente BCV una sola vez: no se toca.';
  end if;
  execute replace(v_def, v_antes, v_despues);
end
$parche$;

do $ver$
begin
  if position('p2p.binance.com' in pg_get_functiondef('private.tomar_tasa_usdt()'::regprocedure)) = 0
     or position('tomar_tasa_usdt' in pg_get_functiondef('public.tomar_tasa_ahora(character varying)'::regprocedure)) = 0
     or position('m.fuente_tasa' in pg_get_functiondef('public.corregir_tasa_automatica(character varying, numeric)'::regprocedure)) = 0 then
    raise exception 'la tasa USDT no quedó entera';
  end if;
end
$ver$;
